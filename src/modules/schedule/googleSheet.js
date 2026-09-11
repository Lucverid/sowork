export function normalizeAppsScriptUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !/script\.google\.com$/i.test(url.hostname)) return "";
    if (!/\/macros\/s\/[A-Za-z0-9_-]+\/(exec|dev)$/.test(url.pathname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function extractSpreadsheetId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) return raw;
  return "";
}

export async function testGoogleSheetConnection({ webAppUrl, secret, spreadsheetUrl }) {
  const endpoint = normalizeAppsScriptUrl(webAppUrl);
  if (!endpoint) throw new Error("Apps Script Web App URL tidak valid.");
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId) throw new Error("URL Google Spreadsheet tidak valid.");
  if (!String(secret || "").trim()) throw new Error("Secret Token belum diisi.");

  const payload = {
    action: "testConnection",
    requestId: createRequestId(),
    secret: String(secret).trim(),
    spreadsheetId
  };
  return submitAndVerify(endpoint, payload, { timeoutMs: 20000 });
}

export async function sendScheduleToGoogleSheet({
  webAppUrl,
  secret,
  spreadsheetUrl,
  sheetName,
  entries = [],
  rules = {},
  periodLabel = "Jadwal",
  metadata = {}
}) {
  const endpoint = normalizeAppsScriptUrl(webAppUrl);
  if (!endpoint) throw new Error("Apps Script Web App URL tidak valid.");
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId) throw new Error("URL Google Spreadsheet tidak valid.");
  if (!String(secret || "").trim()) throw new Error("Secret Token belum diisi.");
  if (!entries.length) throw new Error("Tidak ada jadwal untuk dikirim.");

  const payload = {
    action: "writeSchedule",
    requestId: createRequestId(),
    secret: String(secret).trim(),
    spreadsheetId,
    sheetName: sanitizeSheetName(sheetName || `Jadwal ${periodLabel}`),
    periodLabel: String(periodLabel || "Jadwal"),
    entries: entries.map(item => ({
      date: String(item?.date || ""),
      crewName: String(item?.crewName || ""),
      gender: String(item?.gender || ""),
      shift: String(item?.shift || ""),
      role: String(item?.role || ""),
      notes: String(item?.notes || ""),
      overtime: Boolean(item?.overtime),
      overtimeType: String(item?.overtimeType || ""),
      overtimeNote: String(item?.overtimeNote || "")
    })).filter(item => item.date && item.crewName),
    rules: {
      maleNames: Array.isArray(rules?.maleNames) ? rules.maleNames.map(String) : [],
      femaleNames: Array.isArray(rules?.femaleNames) ? rules.femaleNames.map(String) : []
    },
    metadata: {
      workspace: String(metadata?.workspace || "SoWork"),
      branch: String(metadata?.branch || ""),
      month: String(metadata?.month || ""),
      sentBy: String(metadata?.sentBy || "Admin"),
      sentAt: new Date().toISOString()
    }
  };

  if (!payload.entries.length) throw new Error("Data jadwal tidak valid.");
  return submitAndVerify(endpoint, payload, { timeoutMs: 30000 });
}

function createRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) {}
  return `sowork-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function submitAndVerify(endpoint, payload, { timeoutMs = 25000 } = {}) {
  if (typeof document === "undefined") throw new Error("Pengiriman Google Sheet hanya tersedia di browser.");
  submitViaHiddenForm(endpoint, payload);

  const started = Date.now();
  let lastPending = null;
  while (Date.now() - started < timeoutMs) {
    await delay(lastPending ? 850 : 500);
    const status = await readStatusJsonp(endpoint, payload.requestId);
    if (status?.pending) {
      lastPending = status;
      continue;
    }
    if (!status?.ok) throw new Error(status?.error || "Apps Script menolak permintaan.");
    return { ...status, verified: true };
  }
  throw new Error("Apps Script tidak memberi konfirmasi dalam waktu yang ditentukan. Cek deployment dan izin Web App.");
}

function submitViaHiddenForm(endpoint, payload) {
  const frameName = `sowork-sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const iframe = document.createElement("iframe");
  iframe.name = frameName;
  iframe.style.display = "none";
  iframe.setAttribute("aria-hidden", "true");
  const form = document.createElement("form");
  form.method = "POST";
  form.action = endpoint;
  form.target = frameName;
  form.style.display = "none";
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "payload";
  input.value = JSON.stringify(payload);
  form.appendChild(input);
  document.body.appendChild(iframe);
  document.body.appendChild(form);
  try {
    form.submit();
  } catch (error) {
    iframe.remove();
    form.remove();
    throw error;
  }
  setTimeout(() => { iframe.remove(); form.remove(); }, 45000);
}

function readStatusJsonp(endpoint, requestId) {
  return new Promise((resolve, reject) => {
    const callback = `__soworkSheetStatus_${Date.now()}_${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9_$]/g, "_");
    const script = document.createElement("script");
    const timer = setTimeout(() => cleanup(new Error("Tidak bisa membaca status Apps Script.")), 7000);

    function cleanup(error, value) {
      clearTimeout(timer);
      try { delete globalThis[callback]; } catch (_) { globalThis[callback] = undefined; }
      script.remove();
      if (error) reject(error); else resolve(value);
    }

    globalThis[callback] = value => cleanup(null, value);
    script.onerror = () => cleanup(new Error("Status Apps Script tidak dapat diakses. Pastikan Web App diizinkan untuk Anyone."));
    const url = new URL(endpoint);
    url.searchParams.set("action", "status");
    url.searchParams.set("requestId", requestId);
    url.searchParams.set("callback", callback);
    url.searchParams.set("_", String(Date.now()));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function sanitizeSheetName(value) {
  const cleaned = String(value || "Jadwal")
    .replace(/[\\/?*\[\]:]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Jadwal").slice(0, 90);
}
