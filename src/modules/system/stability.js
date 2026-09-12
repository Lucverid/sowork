import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../../firebase/config.js";

const SETTINGS_COLLECTION = "settings";
const BACKUP_KIND = "SOWORK_BACKUP";
const POLICY_DOC = "backupPolicy";
const APP_VERSION = "1.7.3";

const DEFAULT_POLICY = {
  autoBackupEnabled: true,
  weeklyEnabled: true,
  monthlyEnabled: true,
  lastWeeklyAtIso: "",
  lastMonthlyKey: "",
  retentionWeekly: 4,
  retentionMonthly: 3,
  retentionManual: 5
};

export async function testFirebaseConnection() {
  const started = performanceNow_();
  await getDocFromServer(doc(db, SETTINGS_COLLECTION, "app"));
  return { ok: true, latencyMs: Math.max(0, Math.round(performanceNow_() - started)) };
}

export async function getBackupPolicy() {
  const snap = await getDoc(doc(db, SETTINGS_COLLECTION, POLICY_DOC));
  return {
    ...DEFAULT_POLICY,
    ...(snap.exists() ? snap.data() : {})
  };
}

export async function saveBackupPolicy(policy = {}) {
  const next = {
    ...DEFAULT_POLICY,
    ...policy,
    autoBackupEnabled: policy.autoBackupEnabled !== false,
    weeklyEnabled: policy.weeklyEnabled !== false,
    monthlyEnabled: policy.monthlyEnabled !== false,
    retentionWeekly: clampInt_(policy.retentionWeekly, 1, 12, 4),
    retentionMonthly: clampInt_(policy.retentionMonthly, 1, 12, 3),
    retentionManual: clampInt_(policy.retentionManual, 1, 20, 5),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, SETTINGS_COLLECTION, POLICY_DOC), next, { merge: true });
  return next;
}

export async function listBackupSnapshots() {
  const snap = await getDocs(collection(db, SETTINGS_COLLECTION));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(row => row.kind === BACKUP_KIND)
    .sort((a, b) => String(b.createdAtIso || "").localeCompare(String(a.createdAtIso || "")));
}

export async function createBackupSnapshot(context = {}, options = {}) {
  const backupType = ["weekly", "monthly", "manual"].includes(options.type) ? options.type : "manual";
  const createdAtIso = new Date().toISOString();
  const id = `backup_${backupType}_${createdAtIso.replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomId_()}`;
  const data = buildSafeSnapshot_(context);
  const counts = {
    crew: Array.isArray(data.scheduleRules?.crew) ? data.scheduleRules.crew.length : 0,
    stockItems: Array.isArray(data.stockItems) ? data.stockItems.length : 0,
    wasteItems: Array.isArray(data.wasteItems) ? data.wasteItems.length : 0
  };

  const payload = {
    kind: BACKUP_KIND,
    backupType,
    appVersion: APP_VERSION,
    createdAtIso,
    createdAt: serverTimestamp(),
    actorName: String(options.actorName || "Admin"),
    counts,
    data
  };

  await setDoc(doc(db, SETTINGS_COLLECTION, id), payload);
  return { id, ...payload, createdAt: null };
}

export async function ensureAutomaticBackup(context = {}, options = {}) {
  const policy = await getBackupPolicy();
  if (policy.autoBackupEnabled === false) return { created: null, policy };

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const actorName = String(options.actorName || "Admin");
  let created = null;
  let nextPolicy = { ...policy };

  const monthlyDue = policy.monthlyEnabled !== false && String(policy.lastMonthlyKey || "") !== monthKey;
  if (monthlyDue) {
    created = await createBackupSnapshot(context, { type: "monthly", actorName });
    nextPolicy.lastMonthlyKey = monthKey;
    nextPolicy.lastWeeklyAtIso = created.createdAtIso;
  } else if (policy.weeklyEnabled !== false && weeklyDue_(policy.lastWeeklyAtIso, now)) {
    created = await createBackupSnapshot(context, { type: "weekly", actorName });
    nextPolicy.lastWeeklyAtIso = created.createdAtIso;
  }

  if (created) {
    nextPolicy = await saveBackupPolicy(nextPolicy);
    await cleanupBackupSnapshots(nextPolicy);
  }

  return { created, policy: nextPolicy };
}

export async function cleanupBackupSnapshots(policy = DEFAULT_POLICY) {
  const all = await listBackupSnapshots();
  const keep = new Set();
  const limits = {
    weekly: clampInt_(policy.retentionWeekly, 1, 12, 4),
    monthly: clampInt_(policy.retentionMonthly, 1, 12, 3),
    manual: clampInt_(policy.retentionManual, 1, 20, 5)
  };

  Object.entries(limits).forEach(([type, limit]) => {
    all.filter(row => row.backupType === type).slice(0, limit).forEach(row => keep.add(row.id));
  });

  const stale = all.filter(row => !keep.has(row.id));
  for (let i = 0; i < stale.length; i += 300) {
    const batch = writeBatch(db);
    stale.slice(i, i + 300).forEach(row => batch.delete(doc(db, SETTINGS_COLLECTION, row.id)));
    await batch.commit();
  }
  return stale.length;
}

export async function restoreBackupSnapshot(snapshot) {
  const data = snapshot?.data || {};
  const rules = data.scheduleRules && typeof data.scheduleRules === "object" ? data.scheduleRules : null;
  const stockItems = Array.isArray(data.stockItems) ? data.stockItems : [];
  const wasteItems = Array.isArray(data.wasteItems) ? data.wasteItems : [];
  const appSettings = data.appSettings && typeof data.appSettings === "object" ? data.appSettings : null;
  const stockSettings = data.stockSettings && typeof data.stockSettings === "object" ? data.stockSettings : null;

  if (rules) {
    await setDoc(doc(db, "scheduleRules", "default"), {
      ...plainObject_(rules),
      restoredAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  for (let i = 0; i < stockItems.length; i += 150) {
    const batch = writeBatch(db);
    for (const item of stockItems.slice(i, i + 150)) {
      const id = String(item?.id || "").trim();
      if (!id) continue;
      const value = plainObject_(item);
      delete value.id;
      batch.set(doc(db, "items", id), { ...value, updatedAt: serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }

  for (let i = 0; i < wasteItems.length; i += 150) {
    const batch = writeBatch(db);
    for (const item of wasteItems.slice(i, i + 150)) {
      const id = String(item?.id || item?.itemId || "").trim();
      if (!id) continue;
      const value = plainObject_(item);
      delete value.id;
      batch.set(doc(db, "waste", `item__${id}`), {
        ...value,
        type: "item",
        itemId: id,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  }

  // Merge-only: secret Apps Script, pairing Telegram, dan item baru tidak pernah dihapus.
  if (appSettings) {
    await setDoc(doc(db, SETTINGS_COLLECTION, "app"), {
      ...plainObject_(appSettings),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  if (stockSettings) {
    await setDoc(doc(db, SETTINGS_COLLECTION, "stockAlerts"), {
      ...plainObject_(stockSettings),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  return {
    crew: Array.isArray(rules?.crew) ? rules.crew.length : 0,
    stockItems: stockItems.length,
    wasteItems: wasteItems.length
  };
}

function buildSafeSnapshot_(context = {}) {
  return {
    scheduleRules: plainObject_(context.scheduleRules || {}),
    stockItems: plainArray_(context.stockItems || []),
    wasteItems: plainArray_(context.wasteItems || []),
    appSettings: safeAppSettings_(context.appSettings || {}),
    stockSettings: safeStockSettings_(context.stockSettings || {})
  };
}

function safeAppSettings_(value) {
  const source = plainObject_(value);
  return pick_(source, [
    "outletName", "branchName", "defaultPrimaryLocation", "defaultSecondaryLocation",
    "currency", "timezone", "reportAutoFillSchedule", "googleSheetWebAppUrl", "googleSheetSpreadsheetUrl"
  ]);
}

function safeStockSettings_(value) {
  const source = plainObject_(value);
  return pick_(source, [
    "telegramEnabled", "cloudflareWorkerUrl", "telegramNotifyLowStock", "telegramNotifyOrderDue",
    "telegramNotifyWasteHigh", "telegramNotifyWasteRiskDay", "telegramNotifyDailyCheck",
    "telegramNotifyOpsReminder", "telegramNotifyStockReceipt", "telegramOpsReminderHour",
    "defaultLeadTimeDays", "defaultTargetCoverageDays", "notifyCriticalOnly", "notifyLowStock",
    "whatsappTemplateName", "whatsappTemplateLanguage"
  ]);
}

function pick_(source, keys) {
  const out = {};
  keys.forEach(key => {
    if (source[key] !== undefined) out[key] = source[key];
  });
  return out;
}

function plainArray_(value) {
  return Array.isArray(value) ? value.map(plainObject_).filter(Boolean) : [];
}

function plainObject_(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(plainObject_);
  if (typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (["updatedAt", "createdAt", "restoredAt", "archivedAt"].includes(key)) continue;
    if (item === undefined || typeof item === "function") continue;
    out[key] = plainObject_(item);
  }
  return out;
}

function weeklyDue_(lastIso, now) {
  if (!lastIso) return true;
  const previous = new Date(lastIso);
  if (Number.isNaN(previous.getTime())) return true;
  return now.getTime() - previous.getTime() >= 7 * 24 * 60 * 60 * 1000;
}

function clampInt_(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function randomId_() {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  } catch (_) {
    return Math.random().toString(36).slice(2, 10);
  }
}

function performanceNow_() {
  return globalThis.performance?.now?.() ?? Date.now();
}
