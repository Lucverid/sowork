import { auth } from "../../firebase/config.js";

export function normalizeWorkerUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

async function adminHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("Admin belum login.");
  const token = await user.getIdToken();
  return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
}

async function requestWorker(workerUrl, path, options = {}) {
  const base = normalizeWorkerUrl(workerUrl);
  if (!base) throw new Error("Cloudflare Worker URL belum valid.");
  const headers = { ...(await adminHeaders()), ...(options.headers || {}) };
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `Worker ${response.status}`);
  return body;
}

export function syncTelegramSnapshot(workerUrl, snapshot) {
  return requestWorker(workerUrl, "/api/sync", { method: "POST", body: JSON.stringify(snapshot) });
}

export function getTelegramWorkerStatus(workerUrl) {
  return requestWorker(workerUrl, "/api/status", { method: "GET" });
}

export function setupTelegramWebhook(workerUrl) {
  return requestWorker(workerUrl, "/api/setup-webhook", { method: "POST", body: "{}" });
}

export function sendTelegramTest(workerUrl) {
  return requestWorker(workerUrl, "/api/test", { method: "POST", body: "{}" });
}

export function unpairTelegram(workerUrl) {
  return requestWorker(workerUrl, "/api/unpair", { method: "POST", body: "{}" });
}
