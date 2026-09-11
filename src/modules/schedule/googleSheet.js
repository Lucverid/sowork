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

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      credentials: "omit"
    });
    if (!response.ok) throw new Error(`Apps Script merespons HTTP ${response.status}.`);
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = null; }
    if (!result?.ok) {
      throw new Error(result?.error || "Apps Script tidak mengembalikan status sukses.");
    }
    return { ...result, verified: true };
  } catch (err) {
    if (!isLikelyCorsError(err)) throw err;
    await submitViaHiddenForm(endpoint, payload);
    return { ok: true, verified: false, sheetName: payload.sheetName, mode: "form-fallback" };
  }
}

function isLikelyCorsError(err) {
  const text = String(err?.message || err || "").toLowerCase();
  return err instanceof TypeError || text.includes("fetch") || text.includes("cors") || text.includes("network");
}

function submitViaHiddenForm(endpoint, payload) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return reject(new Error("Fallback browser tidak tersedia."));
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
    const cleanup = () => {
      setTimeout(() => { iframe.remove(); form.remove(); }, 1000);
    };
    let settled = false;
    iframe.addEventListener("load", () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, { once: true });
    try {
      form.submit();
      setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }, 3500);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function sanitizeSheetName(value) {
  const cleaned = String(value || "Jadwal")
    .replace(/[\\/?*\[\]:]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Jadwal").slice(0, 90);
}
