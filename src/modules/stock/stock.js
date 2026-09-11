import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../../firebase/config.js";
import { STOCK_REFERENCE_ITEMS, STOCK_REFERENCE_SNAPSHOTS, STOCK_REFERENCE_SOURCE } from "./seed.js";

export function watchStockItems(callback, onError) {
  return onSnapshot(collection(db, "items"), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id"));
    callback(rows);
  }, onError);
}

export function watchStockOpnames(callback, onError) {
  return onSnapshot(collection(db, "stockOpnames"), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    callback(rows);
  }, onError);
}

export function watchStockMovements(callback, onError) {
  return onSnapshot(collection(db, "stockMovements"), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt?.seconds || 0).localeCompare(String(a.createdAt?.seconds || 0)));
    callback(rows);
  }, onError);
}

export function watchStockSettings(callback, onError) {
  return onSnapshot(doc(db, "settings", "stockAlerts"), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : {
      whatsappNumber: "",
      autoWhatsappEnabled: false,
      notifyCriticalOnly: true,
      notifyLowStock: false,
      whatsappTemplateName: "stock_alert_sowork",
      whatsappTemplateLanguage: "id",
      telegramEnabled: false,
      cloudflareWorkerUrl: "",
      telegramChatId: "",
      telegramAllowedUserId: "",
      telegramPairCode: "",
      telegramWhatsappNumber: "",
      telegramNotifyLowStock: true,
      telegramNotifyOrderDue: true,
      telegramNotifyWasteHigh: true,
      telegramNotifyWasteRiskDay: true,
      telegramNotifyDailyCheck: true,
      telegramNotifyOpsReminder: true,
      telegramOpsReminderHour: 20,
      defaultLeadTimeDays: 2,
      defaultTargetCoverageDays: 7
    });
  }, onError);
}

export async function saveStockItem(item) {
  const id = item.id || crypto.randomUUID();
  const name = String(item.name || "").trim();
  if (!name) throw new Error("Nama barang wajib diisi.");
  const currentQty = Number(item.currentQty || 0);
  const cartonSize = Math.max(0, Number(item.cartonSize || 0));
  const criticalThreshold = Math.max(0, Number(item.criticalThreshold || 0));
  const lowThreshold = Math.max(criticalThreshold, Number(item.lowThreshold || 0));

  await setDoc(doc(db, "items", id), {
    name,
    category: String(item.category || "Bahan"),
    unit: String(item.unit || "PCS"),
    cartonSize,
    primaryLocation: String(item.primaryLocation || "Gudang Utama"),
    secondaryLocation: String(item.secondaryLocation || "Gudang 2"),
    currentQty,
    lastPrimaryQty: Number(item.lastPrimaryQty ?? currentQty),
    lastSecondaryQty: Number(item.lastSecondaryQty || 0),
    criticalItem: Boolean(item.criticalItem),
    criticalThreshold,
    lowThreshold,
    leadTimeDays: Math.max(0, Number(item.leadTimeDays || 2)),
    targetCoverageDays: Math.max(1, Number(item.targetCoverageDays || 7)),
    safetyStock: Math.max(0, Number(item.safetyStock ?? criticalThreshold)),
    active: item.active !== false,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

export async function removeStockItem(id) {
  return deleteDoc(doc(db, "items", id));
}

export async function saveStockReceipt(entry) {
  const cartonSize = Math.max(0, Number(entry.cartonSize || 0));
  const cartons = Math.max(0, Number(entry.cartons || 0));
  const looseQty = Math.max(0, Number(entry.looseQty ?? entry.qty ?? 0));
  const qty = cartons > 0 && cartonSize > 0 ? (cartons * cartonSize) + looseQty : looseQty;
  if (!entry.itemId || !entry.date || qty <= 0) throw new Error("Barang, tanggal kirim, dan jumlah wajib valid.");
  const movementId = entry.id || crypto.randomUUID();
  const movementRef = doc(db, "stockMovements", movementId);
  if (entry.idempotent) {
    const existing = await getDoc(movementRef);
    if (existing.exists()) return movementId;
  }
  const itemRef = doc(db, "items", entry.itemId);
  const itemSnap = await getDoc(itemRef);
  const lastOpnameDate = itemSnap.exists() ? String(itemSnap.data()?.lastOpnameDate || "") : "";
  const affectsCurrentStock = !lastOpnameDate || String(entry.date) > lastOpnameDate;
  const batch = writeBatch(db);

  batch.set(movementRef, {
    itemId: entry.itemId,
    itemName: String(entry.itemName || ""),
    type: "IN",
    date: entry.date,
    qty,
    cartons,
    looseQty,
    cartonSize,
    unit: String(entry.unit || "PCS"),
    destination: String(entry.destination || "Gudang Utama"),
    supplier: String(entry.supplier || "").trim(),
    note: String(entry.note || "").trim(),
    affectsCurrentStock,
    createdAt: serverTimestamp(),
    createdByUid: String(entry.createdByUid || ""),
    createdByName: String(entry.createdByName || "")
  });

  batch.set(itemRef, affectsCurrentStock ? {
    currentQty: increment(qty),
    lastDeliveryDate: entry.date,
    updatedAt: serverTimestamp()
  } : {
    updatedAt: serverTimestamp()
  }, { merge: true });

  await batch.commit();
  return movementId;
}


export async function saveDailyStockUsage(date, rows, actor = {}) {
  if (!date || !Array.isArray(rows) || !rows.length) throw new Error("Tanggal dan penggunaan stok wajib diisi.");

  // v1.6.4: fast path. Seluruh data pembanding dikirim dari state realtime
  // yang sudah ada di client, jadi tidak ada lagi getDoc per item saat save.
  // Hanya item yang berubah yang ditulis. Nilai 0 tidak membuat movement baru.
  const validRows = rows.filter(row => row?.itemId);
  const epsilon = 1e-9;
  const prepared = [];

  for (const row of validRows) {
    const qty = Math.max(0, Number(row.qty || 0));
    const oldQty = Math.max(0, Number(row.oldQty || 0));
    const currentQty = Math.max(0, Number(row.currentQty || 0));
    const lastOpnameDate = String(row.lastOpnameDate || "");
    const affectsCurrentStock = !lastOpnameDate || String(date) > lastOpnameDate;
    const delta = qty - oldQty;
    const movementId = String(row.movementId || `USE_${date}_${row.itemId}`);
    const movementRef = doc(db, "stockMovements", movementId);
    const itemRef = doc(db, "items", row.itemId);
    const note = String(row.note || "").trim();
    const oldNote = String(row.oldNote || "").trim();
    const hadExisting = Boolean(row.hadExisting);
    const qtyChanged = Math.abs(delta) > epsilon;
    const noteChanged = qty > epsilon && note !== oldNote;

    if (affectsCurrentStock && delta > currentQty + epsilon) {
      throw new Error(`${row.itemName || row.itemId}: penggunaan tambahan ${delta} melebihi stok sistem ${currentQty}.`);
    }

    // Legacy zero-doc dibersihkan ketika hari tersebut disimpan ulang.
    const shouldDeleteZero = qty <= epsilon && hadExisting;
    if (!qtyChanged && !noteChanged && !shouldDeleteZero) continue;

    prepared.push({ row, qty, delta, movementRef, itemRef, affectsCurrentStock, note, hadExisting });
  }

  // Satu marker per hari menjaga kalender tahu bahwa tanggal ini sudah diisi,
  // termasuk jika SEMUA barang bernilai 0, tanpa membuat puluhan dokumen qty=0.
  const dayMarkerRef = doc(db, "stockMovements", `USE_DAY_${date}`);
  const usedCount = validRows.filter(row => Number(row.qty || 0) > epsilon).length;
  const dayNote = String(validRows.find(row => row?.note != null)?.note || "").trim();

  const chunks = chunk(prepared, 160);
  if (!chunks.length) chunks.push([]);

  for (let index = 0; index < chunks.length; index += 1) {
    const part = chunks[index];
    const batch = writeBatch(db);

    for (const rec of part) {
      const { row, qty, delta, movementRef, itemRef, affectsCurrentStock, note, hadExisting } = rec;

      if (qty <= epsilon) {
        if (hadExisting) batch.delete(movementRef);
      } else {
        batch.set(movementRef, {
          itemId: row.itemId,
          itemName: String(row.itemName || ""),
          type: "OUT",
          source: "DAILY_USAGE",
          date,
          qty,
          unit: String(row.unit || "PCS"),
          category: String(row.category || "Pemakaian Harian"),
          note,
          affectsCurrentStock,
          updatedAt: serverTimestamp(),
          updatedByUid: String(actor.uid || ""),
          updatedByName: String(actor.name || "")
        }, { merge: true });
      }

      if (affectsCurrentStock && Math.abs(delta) > epsilon) {
        batch.set(itemRef, {
          currentQty: increment(-delta),
          lastUsageDate: date,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }

    if (index === 0) {
      batch.set(dayMarkerRef, {
        itemId: "__DAY__",
        itemName: "Daily usage marker",
        type: "META",
        source: "DAILY_USAGE_DAY",
        date,
        qty: 0,
        rowCount: validRows.length,
        usedCount,
        note: dayNote,
        updatedAt: serverTimestamp(),
        updatedByUid: String(actor.uid || ""),
        updatedByName: String(actor.name || "")
      }, { merge: true });
    }

    await batch.commit();
  }

  return { changedItems: prepared.length, usedCount, rowCount: validRows.length };
}


export async function removeDailyStockUsageDay(date, actor = {}) {
  if (!date) throw new Error("Tanggal penggunaan stok wajib dipilih.");

  // Penghapusan hari bersifat lengkap: marker kalender + seluruh movement DAILY_USAGE.
  // Jika movement tersebut dulu mengurangi stok saat ini, qty dikembalikan lagi.
  const snap = await getDocs(collection(db, "stockMovements"));
  const allRows = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  const markerId = `USE_DAY_${date}`;
  const targets = allRows.filter(row => {
    if (String(row.id || "") === markerId) return true;
    if (String(row.date || "") !== String(date)) return false;
    if (row.source === "DAILY_USAGE_DAY") return true;
    return row.source === "DAILY_USAGE" || (row.type === "OUT" && String(row.id || "").startsWith(`USE_${date}_`));
  });

  // Marker bisa saja belum masuk snapshot realtime saat tombol ditekan; tetap hapus by id.
  const targetIds = new Set(targets.map(row => String(row.id || "")));
  if (!targetIds.has(markerId)) {
    targets.push({ id: markerId, ref: doc(db, "stockMovements", markerId), source: "DAILY_USAGE_DAY", date, qty: 0 });
    targetIds.add(markerId);
  }

  const usageTargets = targets.filter(row => row.source !== "DAILY_USAGE_DAY" && row.type === "OUT");
  const restoreByItem = new Map();

  for (const row of usageTargets) {
    const itemId = String(row.itemId || "").trim();
    const qty = Math.max(0, Number(row.qty || 0));
    if (!itemId || qty <= 0) continue;

    let affectsCurrentStock = row.affectsCurrentStock;
    if (typeof affectsCurrentStock !== "boolean") {
      const itemSnap = await getDoc(doc(db, "items", itemId));
      const lastOpnameDate = itemSnap.exists() ? String(itemSnap.data()?.lastOpnameDate || "") : "";
      affectsCurrentStock = !lastOpnameDate || String(date) > lastOpnameDate;
    }
    if (!affectsCurrentStock) continue;

    const current = restoreByItem.get(itemId) || { qty: 0 };
    current.qty += qty;
    restoreByItem.set(itemId, current);
  }

  // Hitung tanggal penggunaan terakhir sebelumnya supaya metadata item tidak menunjuk
  // ke tanggal yang baru saja dihapus.
  const previousUsageDateByItem = new Map();
  for (const itemId of restoreByItem.keys()) {
    const previous = allRows
      .filter(row => row.type === "OUT"
        && row.source === "DAILY_USAGE"
        && String(row.itemId || "") === itemId
        && String(row.date || "") !== String(date))
      .map(row => String(row.date || ""))
      .filter(Boolean)
      .sort()
      .pop() || "";
    previousUsageDateByItem.set(itemId, previous);
  }

  for (const part of chunk(targets, 350)) {
    const batch = writeBatch(db);
    for (const row of part) batch.delete(row.ref || doc(db, "stockMovements", row.id));
    await batch.commit();
  }

  const restoreEntries = [...restoreByItem.entries()];
  for (const part of chunk(restoreEntries, 180)) {
    const batch = writeBatch(db);
    for (const [itemId, restore] of part) {
      batch.set(doc(db, "items", itemId), {
        currentQty: increment(Math.max(0, Number(restore.qty || 0))),
        lastUsageDate: previousUsageDateByItem.get(itemId) || "",
        updatedAt: serverTimestamp(),
        usageDeletedAt: serverTimestamp(),
        usageDeletedByUid: String(actor.uid || ""),
        usageDeletedByName: String(actor.name || "")
      }, { merge: true });
    }
    await batch.commit();
  }

  const restoredQty = restoreEntries.reduce((sum, [, value]) => sum + Math.max(0, Number(value.qty || 0)), 0);
  return {
    date: String(date),
    removedDocuments: targets.length,
    removedMovements: usageTargets.length,
    restoredItems: restoreEntries.length,
    restoredQty
  };
}

export async function saveStockOpname(date, rows, actor = {}) {
  if (!date || !rows?.length) throw new Error("Tanggal dan data SO wajib diisi.");
  const chunks = chunk(rows, 180);
  for (const part of chunks) {
    const batch = writeBatch(db);
    for (const row of part) {
      const primaryQty = Math.max(0, Number(row.primaryQty || 0));
      const secondaryQty = Math.max(0, Number(row.secondaryQty || 0));
      const totalQty = primaryQty + secondaryQty;
      const opnameId = `${date}_${row.itemId}`;
      batch.set(doc(db, "stockOpnames", opnameId), {
        date,
        itemId: row.itemId,
        itemName: String(row.itemName || ""),
        primaryLocation: String(row.primaryLocation || "Gudang Utama"),
        primaryQty,
        secondaryLocation: String(row.secondaryLocation || "Gudang 2"),
        secondaryQty,
        totalQty,
        unit: String(row.unit || "PCS"),
        systemQtyBeforeOpname: Number.isFinite(Number(row.systemQtyBeforeOpname)) ? Number(row.systemQtyBeforeOpname) : null,
        varianceQty: Number.isFinite(Number(row.varianceQty)) ? Number(row.varianceQty) : null,
        variancePct: Number.isFinite(Number(row.variancePct)) ? Number(row.variancePct) : null,
        accuracyPct: Number.isFinite(Number(row.accuracyPct)) ? Number(row.accuracyPct) : null,
        reconciliationStatus: String(row.reconciliationStatus || ""),
        previousOpnameDate: String(row.previousOpnameDate || ""),
        incomingSincePrevious: Math.max(0, Number(row.incomingSincePrevious || 0)),
        usageSincePrevious: Math.max(0, Number(row.usageSincePrevious || 0)),
        updatedAt: serverTimestamp(),
        updatedByUid: String(actor.uid || ""),
        updatedByName: String(actor.name || "")
      }, { merge: true });
      batch.set(doc(db, "items", row.itemId), {
        currentQty: totalQty,
        lastPrimaryQty: primaryQty,
        lastSecondaryQty: secondaryQty,
        lastOpnameDate: date,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  }
}


export async function removeStockOpnameDay(date, itemRestores = []) {
  if (!date) throw new Error("Tanggal Stock Opname wajib dipilih.");
  const snap = await getDocs(collection(db, "stockOpnames"));
  const targets = snap.docs.filter(d => String(d.data()?.date || "") === String(date));
  if (!targets.length) return 0;

  for (const part of chunk(targets, 350)) {
    const batch = writeBatch(db);
    for (const row of part) batch.delete(row.ref);
    await batch.commit();
  }

  for (const part of chunk(Array.isArray(itemRestores) ? itemRestores : [], 180)) {
    const batch = writeBatch(db);
    for (const row of part) {
      if (!row?.itemId) continue;
      batch.set(doc(db, "items", row.itemId), {
        currentQty: Math.max(0, Number(row.currentQty || 0)),
        lastOpnameDate: String(row.lastOpnameDate || ""),
        lastPrimaryQty: Math.max(0, Number(row.lastPrimaryQty || 0)),
        lastSecondaryQty: Math.max(0, Number(row.lastSecondaryQty || 0)),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  }
  return targets.length;
}

export async function saveStockSettings(settings) {
  await setDoc(doc(db, "settings", "stockAlerts"), {
    whatsappNumber: normalizeWhatsappNumber(settings.whatsappNumber || ""),
    autoWhatsappEnabled: Boolean(settings.autoWhatsappEnabled),
    notifyCriticalOnly: settings.notifyCriticalOnly !== false,
    notifyLowStock: Boolean(settings.notifyLowStock),
    whatsappTemplateName: String(settings.whatsappTemplateName || "stock_alert_sowork").trim(),
    whatsappTemplateLanguage: String(settings.whatsappTemplateLanguage || "id").trim(),
    telegramEnabled: Boolean(settings.telegramEnabled),
    cloudflareWorkerUrl: String(settings.cloudflareWorkerUrl || "").trim().replace(/\/+$/, ""),
    telegramChatId: String(settings.telegramChatId || "").trim(),
    telegramAllowedUserId: String(settings.telegramAllowedUserId || "").trim(),
    telegramPairCode: String(settings.telegramPairCode || "").trim(),
    telegramWhatsappNumber: normalizeWhatsappNumber(settings.telegramWhatsappNumber || ""),
    telegramNotifyLowStock: settings.telegramNotifyLowStock !== false,
    telegramNotifyOrderDue: settings.telegramNotifyOrderDue !== false,
    telegramNotifyWasteHigh: settings.telegramNotifyWasteHigh !== false,
    telegramNotifyWasteRiskDay: settings.telegramNotifyWasteRiskDay !== false,
    telegramNotifyDailyCheck: settings.telegramNotifyDailyCheck !== false,
    telegramNotifyOpsReminder: settings.telegramNotifyOpsReminder !== false,
    telegramOpsReminderHour: [18, 20].includes(Number(settings.telegramOpsReminderHour)) ? Number(settings.telegramOpsReminderHour) : 20,
    defaultLeadTimeDays: Math.max(0, Number(settings.defaultLeadTimeDays || 2)),
    defaultTargetCoverageDays: Math.max(1, Number(settings.defaultTargetCoverageDays || 7)),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function seedStockReference() {
  const existing = await getDocs(collection(db, "items"));
  if (!existing.empty) throw new Error("Master barang sudah berisi data. Import referensi hanya boleh saat master masih kosong.");

  const writes = [
    ...STOCK_REFERENCE_ITEMS.map(item => ({ kind: "item", item })),
    ...STOCK_REFERENCE_SNAPSHOTS.map(snapshot => ({ kind: "snapshot", snapshot }))
  ];

  for (const part of chunk(writes, 420)) {
    const batch = writeBatch(db);
    for (const record of part) {
      if (record.kind === "item") {
        const item = record.item;
        batch.set(doc(db, "items", item.id), {
          ...item,
          importedFrom: STOCK_REFERENCE_SOURCE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        const s = record.snapshot;
        batch.set(doc(db, "stockOpnames", `${s.date}_${s.itemId}`), {
          ...s,
          importedFrom: STOCK_REFERENCE_SOURCE,
          legacySnapshot: true,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }
    await batch.commit();
  }

  await setDoc(doc(db, "settings", "stockAlerts"), {
    referenceImported: true,
    referenceSource: STOCK_REFERENCE_SOURCE,
    referenceImportedAt: serverTimestamp(),
    defaultLeadTimeDays: 2,
    defaultTargetCoverageDays: 7
  }, { merge: true });
}

export function normalizeWhatsappNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function chunk(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}


export function qtyFromCartonInput(cartons, looseQty, cartonSize) {
  const c = Math.max(0, Number(cartons || 0));
  const loose = Math.max(0, Number(looseQty || 0));
  const size = Math.max(0, Number(cartonSize || 0));
  return size > 0 ? (c * size) + loose : loose;
}

export function cartonBreakdown(qty, cartonSize) {
  const total = Math.max(0, Number(qty || 0));
  const size = Math.max(0, Number(cartonSize || 0));
  if (!(size > 0)) return { cartons: 0, loose: total, total };
  const cartons = Math.floor(total / size);
  const loose = total - (cartons * size);
  return { cartons, loose, total };
}
