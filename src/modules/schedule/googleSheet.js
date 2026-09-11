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

  // v1.6.5: tetap memakai hidden iframe POST, tetapi konfirmasi tidak lagi
  // mengandalkan event.source === iframe.contentWindow. Apps Script dapat
  // membungkus response di frame Google lain setelah redirect.
  const callbackToken = createRequestId();
  const messagePayload = { ...payload, callbackToken };
  return submitViaIframeBridge(endpoint, messagePayload, { timeoutMs });
}

function isTrustedAppsScriptOrigin(origin) {
  try {
    const url = new URL(String(origin || ""));
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "script.google.com" ||
      host === "script.googleusercontent.com" ||
      host.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

function submitViaIframeBridge(endpoint, payload, { timeoutMs = 25000 } = {}) {
  return new Promise((resolve, reject) => {
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

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      iframe.remove();
      form.remove();
    };
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      if (error) reject(error); else resolve(result);
    };

    const onMessage = event => {
      // v1.6.5: Apps Script dapat mengirim dari wrapper script.googleusercontent.com.
      // Keamanan tetap dijaga oleh origin Google + requestId + callbackToken acak.
      if (!isTrustedAppsScriptOrigin(event.origin)) return;
      const data = event.data;
      if (!data || data.source !== "sowork-google-sheet-bridge") return;
      if (String(data.requestId || "") !== String(payload.requestId || "")) return;
      if (String(data.callbackToken || "") !== String(payload.callbackToken || "")) return;
      const response = data.response || {};
      if (!response.ok) return finish(new Error(response.error || "Apps Script menolak permintaan."));
      finish(null, { ...response, verified: true });
    };

    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => {
      finish(new Error("Jadwal mungkin sudah terkirim, tetapi konfirmasi Apps Script tidak diterima. Pastikan Code.gs memakai bridge v1.6.5 lalu deploy New version."));
    }, timeoutMs);

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    try {
      form.submit();
    } catch (error) {
      finish(error);
    }
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
