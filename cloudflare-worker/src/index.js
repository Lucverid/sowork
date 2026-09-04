const SNAPSHOT_KEY = "operations_snapshot";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwksCache = { expiresAt: 0, keys: null };

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      const url = new URL(request.url);

      if (url.pathname === "/" || url.pathname === "/health") {
        return json({ ok: true, service: "SoWork Telegram Free", provider: "Cloudflare Workers + D1" });
      }

      if (url.pathname === "/telegram/webhook") {
        return cors(await telegramWebhook(request, env));
      }

      if (url.pathname.startsWith("/api/")) {
        const auth = await requireAdmin(request, env);
        if (!auth.ok) return cors(json({ ok: false, error: auth.error }, auth.status || 401));

        if (url.pathname === "/api/sync" && request.method === "POST") {
          return cors(await apiSync(request, env, ctx));
        }
        if (url.pathname === "/api/status" && request.method === "GET") {
          return cors(await apiStatus(env));
        }
        if (url.pathname === "/api/setup-webhook" && request.method === "POST") {
          return cors(await apiSetupWebhook(request, env));
        }
        if (url.pathname === "/api/test" && request.method === "POST") {
          return cors(await apiTest(env));
        }
        if (url.pathname === "/api/unpair" && request.method === "POST") {
          const removed = await clearTelegramConnections(env);
          return cors(json({ ok: true, removed }));
        }
        return cors(json({ ok: false, error: "Endpoint tidak ditemukan." }, 404));
      }

      return cors(json({ ok: false, error: "Not found" }, 404));
    } catch (error) {
      console.error("Worker fetch error", error);
      return cors(json({ ok: false, error: String(error?.message || error) }, 500));
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(controller.cron, env));
  }
};

async function apiSync(request, env, ctx) {
  const incoming = await request.json().catch(() => null);
  if (!incoming || typeof incoming !== "object") return json({ ok: false, error: "Payload sync tidak valid." }, 400);

  const previous = await getSnapshot(env);
  const snapshot = compactSnapshot(incoming);
  await putState(env, SNAPSHOT_KEY, snapshot);

  ctx.waitUntil(runImmediateAlerts(previous, snapshot, env));
  return json({
    ok: true,
    syncedAt: new Date().toISOString(),
    counts: {
      stockItems: snapshot.stockItems.length,
      stockOpnames: snapshot.stockOpnames.length,
      stockMovements: snapshot.stockMovements.length,
      wasteItems: snapshot.wasteItems.length,
      wasteDays: snapshot.wasteDays.length
    }
  });
}

async function apiStatus(env) {
  const connections = await getConnections(env);
  const primary = connections[0] || null;
  const snapshot = await getSnapshot(env);
  return json({
    ok: true,
    paired: connections.length > 0,
    recipientCount: connections.length,
    recipients: connections.map(connection => ({
      chatId: connection.chat_id || "",
      username: connection.username || "",
      firstName: connection.first_name || "",
      connectedAt: connection.connected_at || ""
    })),
    // Field lama dipertahankan agar frontend / Firestore versi sebelumnya tetap kompatibel.
    chatId: primary?.chat_id || "",
    username: primary?.username || "",
    firstName: primary?.first_name || "",
    connectedAt: primary?.connected_at || "",
    hasSnapshot: Boolean(snapshot),
    snapshotUpdatedAt: snapshot?.syncedAt || ""
  });
}

async function apiSetupWebhook(request, env) {
  requireTelegramSecrets(env);
  const origin = new URL(request.url).origin;
  const response = await telegramApi(env, "setWebhook", {
    url: `${origin}/telegram/webhook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: false
  });
  return json({ ok: true, webhookUrl: `${origin}/telegram/webhook`, telegram: response });
}

async function apiTest(env) {
  const connections = await getConnections(env);
  if (!connections.length) return json({ ok: false, error: "Telegram belum dipair." }, 409);
  const snapshot = await getSnapshot(env);
  const delivery = await sendTelegramToAll(env,
    `✅ TEST SOWORK BERHASIL\n\nCloudflare Worker aktif dan Telegram sudah terhubung.${snapshot ? "\nSnapshot operasional juga sudah tersinkron." : "\nBelum ada snapshot operasional."}`,
    snapshot?.settings || {}
  );
  if (!delivery.sent) return json({ ok: false, error: "Pesan test gagal dikirim ke semua penerima Telegram.", delivery }, 502);
  return json({ ok: true, ...delivery });
}

async function telegramWebhook(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  requireTelegramSecrets(env);
  const expected = String(env.TELEGRAM_WEBHOOK_SECRET || "");
  const actual = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!expected || actual !== expected) return new Response("Forbidden", { status: 403 });

  const update = await request.json().catch(() => ({}));
  const message = update.message || update.edited_message;
  if (!message?.chat?.id) return new Response("OK");

  const chatId = String(message.chat.id);
  const userId = String(message.from?.id || "");
  const username = String(message.from?.username || "");
  const firstName = String(message.from?.first_name || "");
  const text = String(message.text || "").trim();
  const snapshot = await getSnapshot(env);
  const settings = snapshot?.settings || {};

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1] || "";
    if (!settings.telegramPairCode || code !== String(settings.telegramPairCode)) {
      await sendTelegram(env, chatId,
        "🔐 Kode pairing belum valid.\n\nDi SoWork buka Settings → Telegram & Alert → Generate kode → Simpan & Sync, lalu kirim:\n/start KODE",
        settings
      );
      return new Response("OK");
    }

    await ensureTelegramConnectionsTable(env);
    await env.DB.prepare(`
      INSERT INTO telegram_connections(chat_id, user_id, username, first_name, connected_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET
        user_id=excluded.user_id,
        username=excluded.username,
        first_name=excluded.first_name,
        connected_at=excluded.connected_at
    `).bind(chatId, userId, username, firstName, new Date().toISOString()).run();

    const recipientCount = (await getConnections(env)).length;
    await sendTelegram(env, chatId,
      `✅ SoWork terhubung ke Telegram GRATIS via Cloudflare.

Akun ini ditambahkan sebagai penerima notifikasi. Total penerima aktif: ${recipientCount}.

Perintah:
/stock — stok menipis/kritis
/order — prediksi order + jumlah beli
/waste — kondisi waste terbaru
/help — bantuan`,
      settings
    );
    return new Response("OK");
  }

  if (!(await isPaired(env, chatId, userId))) {
    await sendTelegram(env, chatId, "Telegram ini belum dipair ke SoWork. Gunakan /start KODE dari Settings SoWork.", settings);
    return new Response("OK");
  }

  if (text.startsWith("/stock")) {
    const rows = buildAllStockAnalytics(snapshot || {});
    const msg = buildStockStatusMessage(rows);
    await sendTelegram(env, chatId, msg || "✅ Tidak ada stok kritis atau menipis saat ini.", settings);
  } else if (text.startsWith("/order")) {
    const rows = buildAllStockAnalytics(snapshot || {});
    const msg = buildDailyOrderReminder(rows, true);
    await sendTelegram(env, chatId, msg || "✅ Belum ada item yang perlu diorder sekarang.", settings);
  } else if (text.startsWith("/waste")) {
    const msg = buildCurrentWasteMessage(snapshot || {});
    await sendTelegram(env, chatId, msg || "✅ Belum ada high waste yang terdeteksi.", settings);
  } else {
    await sendTelegram(env, chatId,
      "🤖 SoWork Bot — Cloudflare Free\n\n/stock — stok kritis & menipis\n/order — prediksi order + jumlah beli\n/waste — status waste terbaru\n/help — bantuan\n\nAlert punya tombol ‘Teruskan ke WhatsApp’ jika nomor WA relay diisi di SoWork.",
      settings
    );
  }
  return new Response("OK");
}

async function handleScheduled(cron, env) {
  try {
    const snapshot = await getSnapshot(env);
    const connections = await getConnections(env);
    if (!snapshot || !connections.length || snapshot.settings?.telegramEnabled !== true) return;

    const today = jakartaDateKey(new Date());
    if (cron === "30 23 * * *") {
      if (snapshot.settings?.telegramNotifyWasteRiskDay !== false) {
        const msg = buildWasteRiskReminder(snapshot, today);
        if (msg) await sendAlertOnce(env, `waste_risk_${today}`, "waste-risk", msg, snapshot.settings);
      }
    } else {
      if (snapshot.settings?.telegramNotifyOrderDue !== false) {
        const rows = buildAllStockAnalytics(snapshot);
        const msg = buildDailyOrderReminder(rows, false);
        if (msg) await sendAlertOnce(env, `order_${today}`, "order-reminder", msg, snapshot.settings);
      }
    }
  } catch (error) {
    console.error("scheduled error", error);
  }
}

async function runImmediateAlerts(previous, current, env) {
  try {
    if (current.settings?.telegramEnabled !== true) return;
    const connections = await getConnections(env);
    if (!connections.length) return;

    const currentRows = buildAllStockAnalytics(current);
    const previousRows = previous ? buildAllStockAnalytics(previous) : [];
    const previousMap = new Map(previousRows.map(x => [x.id, x]));

    if (previous) {
      for (const row of currentRows) {
        const prev = previousMap.get(row.id);
        const prevStatus = prev?.status || "Aman";
        const enteredCritical = row.status === "Kritis" && prevStatus !== "Kritis";
        const enteredLow = row.status === "Menipis" && prevStatus === "Aman";
        if (enteredCritical || (current.settings?.telegramNotifyLowStock !== false && enteredLow)) {
          await sendAlertOnce(env, `stock_${row.id}_${row.status}_${row.currentQty}`, "stock", stockItemMessage(row), current.settings);
        }
      }
    }

    if (current.settings?.telegramNotifyWasteHigh !== false) {
      const latest = latestWasteDay(current);
      const prevLatest = previous ? latestWasteDay(previous) : null;
      if (latest && (!prevLatest || wasteDaySignature(latest) !== wasteDaySignature(prevLatest))) {
        const analyzed = analyzeWasteDay(current, latest.date, latest.values || {});
        if (analyzed.message) {
          await sendAlertOnce(env, `waste_${latest.date}_${safeKey(analyzed.highItems.map(x => `${x.id}-${x.qty}`).join("_"))}`, "waste", analyzed.message, current.settings);
        }
      }
    }
  } catch (error) {
    console.error("immediate alerts error", error);
  }
}

function compactSnapshot(input) {
  const now = new Date().toISOString();
  const stockItems = Array.isArray(input.stockItems) ? input.stockItems.map(cleanObject).slice(0, 500) : [];
  const itemIds = new Set(stockItems.map(x => String(x.id || "")));

  const stockOpnamesRaw = Array.isArray(input.stockOpnames) ? input.stockOpnames.map(cleanObject) : [];
  const byItem = new Map();
  for (const row of stockOpnamesRaw) {
    const id = String(row.itemId || "");
    if (!id || (itemIds.size && !itemIds.has(id))) continue;
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id).push(row);
  }
  const stockOpnames = [];
  for (const rows of byItem.values()) {
    rows.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
    stockOpnames.push(...rows.slice(0, 12));
  }

  const stockMovements = (Array.isArray(input.stockMovements) ? input.stockMovements : [])
    .map(cleanObject)
    .filter(x => x.type === "IN")
    .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))
    .slice(0, 1500);

  const wasteItems = (Array.isArray(input.wasteItems) ? input.wasteItems : []).map(cleanObject).slice(0, 500);
  const wasteDays = (Array.isArray(input.wasteDays) ? input.wasteDays : [])
    .map(cleanObject)
    .filter(x => x.date)
    .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))
    .slice(0, 180)
    .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));

  return {
    syncedAt: now,
    settings: cleanSettings(input.settings || {}),
    stockItems,
    stockOpnames,
    stockMovements,
    wasteItems,
    wasteDays
  };
}

function cleanSettings(s) {
  return {
    telegramEnabled: Boolean(s.telegramEnabled),
    telegramPairCode: String(s.telegramPairCode || "").slice(0, 32),
    telegramWhatsappNumber: normalizeWa(s.telegramWhatsappNumber || s.whatsappNumber || ""),
    telegramNotifyLowStock: s.telegramNotifyLowStock !== false,
    telegramNotifyOrderDue: s.telegramNotifyOrderDue !== false,
    telegramNotifyWasteHigh: s.telegramNotifyWasteHigh !== false,
    telegramNotifyWasteRiskDay: s.telegramNotifyWasteRiskDay !== false,
    defaultLeadTimeDays: Math.max(0, Number(s.defaultLeadTimeDays || 2)),
    defaultTargetCoverageDays: Math.max(1, Number(s.defaultTargetCoverageDays || 7))
  };
}

function cleanObject(value) {
  const out = {};
  for (const [k,v] of Object.entries(value || {})) {
    if (v === undefined || typeof v === "function") continue;
    if (v && typeof v === "object" && typeof v.toDate === "function") out[k] = v.toDate().toISOString();
    else if (v && typeof v === "object" && Number.isFinite(v.seconds)) out[k] = new Date(v.seconds * 1000).toISOString();
    else out[k] = v;
  }
  return out;
}

async function getSnapshot(env) {
  const row = await env.DB.prepare("SELECT value FROM state_store WHERE key = ?").bind(SNAPSHOT_KEY).first();
  if (!row?.value) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

async function putState(env, key, value) {
  await env.DB.prepare(`
    INSERT INTO state_store(key, value, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).bind(key, JSON.stringify(value), new Date().toISOString()).run();
}

async function ensureTelegramConnectionsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS telegram_connections (
      chat_id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      first_name TEXT,
      connected_at TEXT NOT NULL
    )
  `).run();

  // Migrasi otomatis dari format lama (single recipient) tanpa menghapus data lama.
  try {
    const legacy = await env.DB.prepare("SELECT chat_id, user_id, username, first_name, connected_at FROM telegram_connection WHERE id = 1").first();
    if (legacy?.chat_id) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO telegram_connections(chat_id, user_id, username, first_name, connected_at)
        VALUES(?, ?, ?, ?, ?)
      `).bind(
        String(legacy.chat_id),
        String(legacy.user_id || ""),
        String(legacy.username || ""),
        String(legacy.first_name || ""),
        String(legacy.connected_at || new Date().toISOString())
      ).run();
    }
  } catch (error) {
    // Database baru mungkin tidak memiliki tabel legacy. Itu aman.
    console.warn("legacy telegram migration skipped", error?.message || error);
  }
}

async function getConnections(env) {
  await ensureTelegramConnectionsTable(env);
  const result = await env.DB.prepare("SELECT * FROM telegram_connections ORDER BY connected_at ASC, chat_id ASC").all();
  return Array.isArray(result?.results) ? result.results : [];
}

async function isPaired(env, chatId, userId) {
  await ensureTelegramConnectionsTable(env);
  const connection = await env.DB.prepare("SELECT chat_id, user_id FROM telegram_connections WHERE chat_id = ? LIMIT 1")
    .bind(String(chatId)).first();
  return Boolean(connection && (!connection.user_id || String(connection.user_id) === String(userId)));
}

async function clearTelegramConnections(env) {
  await ensureTelegramConnectionsTable(env);
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM telegram_connections").first();
  const removed = Number(countRow?.total || 0);
  await env.DB.prepare("DELETE FROM telegram_connections").run();
  try { await env.DB.prepare("DELETE FROM telegram_connection WHERE id = 1").run(); } catch {}
  return removed;
}

async function sendTelegramToAll(env, text, settings = {}) {
  const connections = await getConnections(env);
  const failures = [];
  let sent = 0;

  for (const connection of connections) {
    try {
      await sendTelegram(env, connection.chat_id, text, settings);
      sent += 1;
    } catch (error) {
      failures.push({ chatId: String(connection.chat_id || ""), error: String(error?.message || error) });
      console.error("Telegram delivery failed", connection.chat_id, error);
    }
  }

  return { total: connections.length, sent, failed: failures.length, failures };
}

async function sendAlertOnce(env, key, kind, text, settings) {
  const eventKey = safeKey(key);
  const exists = await env.DB.prepare("SELECT event_key FROM notification_events WHERE event_key = ?").bind(eventKey).first();
  if (exists) return false;

  const delivery = await sendTelegramToAll(env, text, settings);
  if (!delivery.sent) return false;

  await env.DB.prepare("INSERT INTO notification_events(event_key, kind, payload, created_at) VALUES(?, ?, ?, ?)")
    .bind(eventKey, kind, JSON.stringify({ text: String(text).slice(0, 1000), delivery }), new Date().toISOString()).run();
  return true;
}

async function sendTelegram(env, chatId, text, settings = {}) {
  requireTelegramSecrets(env);
  const body = {
    chat_id: String(chatId),
    text: String(text || "").slice(0, 3900),
    disable_web_page_preview: true
  };
  const replyMarkup = buildReplyMarkup(text, settings);
  if (replyMarkup) body.reply_markup = replyMarkup;
  const result = await telegramApi(env, "sendMessage", body);
  return result?.result;
}

async function telegramApi(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Secret TELEGRAM_BOT_TOKEN belum di-set di Cloudflare.");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(`Telegram ${response.status}: ${body.description || "request failed"}`);
  return body;
}

function requireTelegramSecrets(env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN belum diset.");
  if (!env.TELEGRAM_WEBHOOK_SECRET) throw new Error("TELEGRAM_WEBHOOK_SECRET belum diset.");
}

function buildReplyMarkup(text, settings) {
  const number = normalizeWa(settings.telegramWhatsappNumber || "");
  if (!number) return null;
  return { inline_keyboard: [[{
    text: "📲 Teruskan ke WhatsApp",
    url: `https://wa.me/${number}?text=${encodeURIComponent(String(text || "").slice(0, 900))}`
  }]] };
}

function buildAllStockAnalytics(snapshot) {
  const items = Array.isArray(snapshot.stockItems) ? snapshot.stockItems : [];
  const opnames = Array.isArray(snapshot.stockOpnames) ? snapshot.stockOpnames : [];
  const movements = (Array.isArray(snapshot.stockMovements) ? snapshot.stockMovements : []).filter(x => x.type === "IN");
  return items.filter(x => x.active !== false).map(item => stockAnalysis(
    item,
    opnames.filter(x => x.itemId === item.id).sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))),
    movements.filter(x => x.itemId === item.id)
  )).sort((a,b)=>statusRank(a.status)-statusRank(b.status) || String(a.name||"").localeCompare(String(b.name||""), "id"));
}

function stockAnalysis(item, history, receipts) {
  const usage = estimateDailyUsage(history, receipts);
  const avg = usage.daily;
  const current = Math.max(0, Number(item.currentQty || 0));
  const lead = Math.max(0, Number(item.leadTimeDays ?? 2));
  const targetDays = Math.max(1, Number(item.targetCoverageDays ?? 7));
  const safety = Math.max(0, Number(item.safetyStock ?? item.criticalThreshold ?? 0));
  const critical = Math.max(0, Number(item.criticalThreshold || 0));
  const low = Math.max(critical, Number(item.lowThreshold || 0));
  const daysCover = avg > 0 ? current / avg : Infinity;
  const reorderPoint = avg > 0 ? avg * lead + safety : low;

  let status = "Aman";
  if (current <= critical || (item.criticalItem && Number.isFinite(daysCover) && daysCover <= Math.max(1.5, lead))) status = "Kritis";
  else if (current <= low || (Number.isFinite(daysCover) && daysCover <= Math.max(3, lead + 2))) status = "Menipis";

  let desired = avg > 0 ? avg * targetDays + safety : Math.max(low * 2, current);
  let recommended = Math.max(0, desired - current);
  if (status === "Aman" && current > reorderPoint) recommended = 0;
  const carton = Math.max(0, Number(item.cartonSize || 0));
  recommended = recommended > 0 ? (carton > 0 ? Math.ceil(recommended / carton) * carton : Math.ceil(recommended)) : 0;

  const today = jakartaDateKey(new Date());
  const outDate = avg > 0 && Number.isFinite(daysCover) ? addDays(today, Math.max(0, Math.floor(daysCover))) : null;
  const untilReorder = avg > 0 ? Math.max(0, (current - reorderPoint) / avg) : null;
  const orderDate = avg > 0 ? addDays(today, Math.max(0, Math.floor(untilReorder))) : null;

  return {
    ...item,
    avgDailyUsage: avg,
    currentQty: current,
    daysCover,
    status,
    recommendedQty: recommended,
    recommendedCartons: carton > 0 ? Math.ceil(recommended / carton) : 0,
    predictedOutDate: outDate,
    recommendedOrderDate: orderDate,
    orderDueNow: Boolean(orderDate && orderDate <= today),
    historyCount: history.length
  };
}

function estimateDailyUsage(history, receipts) {
  if (history.length < 2) return { daily: 0, intervals: 0 };
  const rows = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i-1], curr = history[i];
    const span = dayDiff(prev.date, curr.date);
    if (span <= 0) continue;
    const incoming = receipts.filter(r => String(r.date) > String(prev.date) && String(r.date) <= String(curr.date)).reduce((s,r)=>s+Math.max(0,Number(r.qty||0)),0);
    const used = Number(prev.totalQty || 0) + incoming - Number(curr.totalQty || 0);
    if (used >= 0) rows.push({ daily: used / span });
  }
  const recent = rows.slice(-3);
  let weighted = 0, weights = 0;
  recent.forEach((r,i) => { const w = i + 1; weighted += r.daily * w; weights += w; });
  return { daily: weights ? weighted / weights : 0, intervals: recent.length };
}

function stockItemMessage(x) {
  const lines = [x.status === "Kritis" ? "🔴 STOK KRITIS" : "🟠 STOK MENIPIS", "", `${x.name}: ${fmt(x.currentQty)} ${x.unit || "unit"}`];
  if (Number.isFinite(x.daysCover)) lines.push(`Cover stok: ~${x.daysCover.toFixed(1)} hari`);
  if (x.predictedOutDate) lines.push(`Estimasi habis: ${dateShort(x.predictedOutDate)}`);
  if (x.recommendedOrderDate) lines.push(`Order paling lambat: ${x.orderDueNow ? "HARI INI" : dateShort(x.recommendedOrderDate)}`);
  if (x.recommendedQty > 0) lines.push(`Saran beli: ${formatOrderQty(x)}`);
  lines.push("", "Saran: cek stok fisik sebelum order. Gunakan prediksi sebagai batas awal agar safety stock terjaga tanpa belanja berlebihan.");
  return lines.join("\n");
}

function buildStockStatusMessage(rows) {
  const selected = rows.filter(x => x.status !== "Aman");
  if (!selected.length) return "";
  const lines = ["⚠️ STATUS STOK SOWORK", ""];
  selected.slice(0, 18).forEach(x => lines.push(`• ${x.status === "Kritis" ? "🔴" : "🟠"} ${x.name}: ${fmt(x.currentQty)} ${x.unit || ""}${x.recommendedQty > 0 ? ` → beli ${formatOrderQty(x)}` : ""}`));
  return lines.join("\n");
}

function buildDailyOrderReminder(rows, showAll = false) {
  const due = rows.filter(x => x.recommendedQty > 0 && (showAll || x.orderDueNow || x.status === "Kritis"));
  if (!due.length) return "";
  const lines = ["📦 REMINDER ORDER SOWORK", "", showAll ? "Item dengan rekomendasi pembelian:" : "Item yang perlu ditindaklanjuti hari ini:"];
  due.slice(0, 18).forEach(x => lines.push(`• ${x.name}: beli ${formatOrderQty(x)}${x.predictedOutDate ? ` · habis ~${dateShort(x.predictedOutDate)}` : ""}`));
  lines.push("", "Cocokkan stok fisik, jadwal delivery, dan tren pemakaian sebelum final order agar pengeluaran tetap stabil.");
  return lines.join("\n");
}

function analyzeWasteDay(snapshot, date, values) {
  const items = Array.isArray(snapshot.wasteItems) ? snapshot.wasteItems : [];
  const days = (Array.isArray(snapshot.wasteDays) ? snapshot.wasteDays : []).filter(x => x.date && x.date < date).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-60);
  const high = [];
  for (const item of items) {
    const qty = Math.max(0, Number(values[item.id] || 0));
    if (qty <= 0) continue;
    const samples = days.map(d => Number(d.values?.[item.id] || 0)).filter(x => x >= 0);
    const baseline = median(samples.filter(x => x > 0));
    const explicit = Math.max(0, Number(item.dailyWarningQty || 0));
    const threshold = explicit > 0 ? explicit : (baseline > 0 ? baseline * 1.5 : 0);
    if (threshold > 0 && qty >= threshold) {
      high.push({ id:item.id, name:item.name || item.id, unit:item.unit || "QTY", qty, baseline, threshold, ratio:baseline > 0 ? qty / baseline : null });
    }
  }
  if (!high.length) return { highItems: [], message: "" };
  high.sort((a,b)=>(b.ratio||0)-(a.ratio||0)||b.qty-a.qty);
  const lines = ["⚠️ HIGH WASTE TERDETEKSI", "", `Tanggal: ${dateShort(date)}`];
  high.slice(0, 10).forEach(x => lines.push(`• ${x.name}: ${fmt(x.qty)} ${x.unit}${x.baseline > 0 ? ` (~${x.ratio.toFixed(1)}× pola normal)` : ""}`));
  lines.push("", "Hati-hati, waste bahan di atas pola normal.", "Saran: kurangi batch awal ±10–15%, refill bertahap sesuai traffic/penjualan, dan periksa sisa closing sebelum menambah prep.", "", "Targetnya bahan baku terkontrol dan pengeluaran tetap stabil.");
  return { highItems: high, message: lines.join("\n") };
}

function buildCurrentWasteMessage(snapshot) {
  const latest = latestWasteDay(snapshot);
  if (!latest) return "";
  const analyzed = analyzeWasteDay(snapshot, latest.date, latest.values || {});
  if (analyzed.message) return analyzed.message;
  return `✅ Waste ${dateShort(latest.date)} masih di bawah batas warning berdasarkan histori yang tersedia.`;
}

function buildWasteRiskReminder(snapshot, today) {
  const items = Array.isArray(snapshot.wasteItems) ? snapshot.wasteItems : [];
  const days = (Array.isArray(snapshot.wasteDays) ? snapshot.wasteDays : []).filter(x => x.date && x.date < today).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-90);
  if (days.length < 7 || !items.length) return "";

  const baselines = {};
  items.forEach(item => { baselines[item.id] = median(days.map(d => Number(d.values?.[item.id] || 0)).filter(x => x > 0)); });
  const scored = days.map(day => ({ date:day.date, weekday:weekdayName(day.date), score:wasteScore(day, items, baselines) })).filter(x => x.score > 0);
  if (scored.length < 5) return "";
  const overall = scored.reduce((s,x)=>s+x.score,0) / scored.length;
  const todayWeekday = weekdayName(today);
  const same = scored.filter(x => x.weekday === todayWeekday);
  if (same.length < 2 || overall <= 0) return "";
  const avg = same.reduce((s,x)=>s+x.score,0) / same.length;
  const risk = avg / overall;
  if (risk < 1.15) return "";

  const contributions = items.map(item => {
    const vals = same.map(s => days.find(d => d.date === s.date)).filter(Boolean).map(d => Number(d.values?.[item.id] || 0));
    const avgQty = vals.length ? vals.reduce((s,x)=>s+x,0)/vals.length : 0;
    const base = baselines[item.id] || 0;
    return { item, ratio: base > 0 ? avgQty / base : 0 };
  }).filter(x => x.ratio > 1.1).sort((a,b)=>b.ratio-a.ratio).slice(0,3);

  const lines = [`🟡 REMINDER WASTE — ${todayWeekday.toUpperCase()}`, "", `Historis ${todayWeekday} sekitar ${Math.round((risk-1)*100)}% lebih rawan waste dibanding hari biasa.`];
  if (contributions.length) lines.push(`Bahan yang perlu diawasi: ${contributions.map(x=>x.item.name).join(", ")}.`);
  lines.push("", "Sebelum prep: perhitungkan ulang kebutuhan dari traffic/penjualan terakhir, mulai sekitar 85–90% batch normal, lalu refill bertahap. Jangan over-prep agar waste dan pengeluaran bahan baku tetap terkendali.");
  return lines.join("\n");
}

function latestWasteDay(snapshot) {
  const days = Array.isArray(snapshot.wasteDays) ? snapshot.wasteDays : [];
  return days.filter(x => x.date).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0] || null;
}

function wasteDaySignature(day) {
  return `${day?.date || ""}:${JSON.stringify(day?.values || {})}`;
}

function wasteScore(day, items, baselines) {
  const ratios = [];
  items.forEach(item => { const b = baselines[item.id] || 0; if (b > 0) ratios.push(Math.min(4, Number(day.values?.[item.id] || 0) / b)); });
  return ratios.length ? ratios.reduce((s,x)=>s+x,0)/ratios.length : 0;
}

async function requireAdmin(request, env) {
  try {
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return { ok:false, status:401, error:"Firebase ID token tidak ada." };
    const payload = await verifyFirebaseJwt(token, env);
    if (String(payload.sub || payload.user_id || "") !== String(env.ADMIN_UID || "")) {
      return { ok:false, status:403, error:"Akun ini bukan Admin SoWork." };
    }
    return { ok:true, payload };
  } catch (error) {
    return { ok:false, status:401, error:`Firebase token tidak valid: ${error?.message || error}` };
  }
}

async function verifyFirebaseJwt(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWT format invalid");
  const header = JSON.parse(base64UrlText(parts[0]));
  const payload = JSON.parse(base64UrlText(parts[1]));
  if (header.alg !== "RS256" || !header.kid) throw new Error("JWT algorithm/kid invalid");

  const now = Math.floor(Date.now()/1000);
  const projectId = String(env.FIREBASE_PROJECT_ID || "");
  if (payload.aud !== projectId) throw new Error("audience invalid");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("issuer invalid");
  if (!payload.sub || String(payload.sub).length > 128) throw new Error("subject invalid");
  if (Number(payload.exp || 0) <= now) throw new Error("token expired");
  if (Number(payload.iat || 0) > now + 300) throw new Error("issued-at invalid");
  if (payload.auth_time && Number(payload.auth_time) > now + 300) throw new Error("auth-time invalid");

  const keys = await getGoogleJwks();
  const jwk = keys[header.kid];
  if (!jwk) throw new Error("public key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlBytes(parts[2]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
  if (!valid) throw new Error("signature invalid");
  return payload;
}

async function getGoogleJwks() {
  const now = Date.now();
  if (jwksCache.keys && jwksCache.expiresAt > now) return jwksCache.keys;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error("gagal mengambil Firebase public keys");
  const body = await response.json();
  const keys = Array.isArray(body?.keys)
    ? Object.fromEntries(body.keys.filter(k => k?.kid).map(k => [k.kid, k]))
    : body;
  const cc = response.headers.get("cache-control") || "";
  const maxAge = Number((cc.match(/max-age=(\d+)/) || [])[1] || 3600);
  jwksCache = { keys, expiresAt: now + Math.max(300, maxAge) * 1000 };
  return keys;
}

function base64UrlText(value) {
  return new TextDecoder().decode(base64UrlBytes(value));
}

function base64UrlBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}

function json(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers:{ "Content-Type":"application/json; charset=utf-8" } });
}

function formatOrderQty(x) { const q=Math.max(0,Number(x.recommendedQty||0)),size=Math.max(0,Number(x.cartonSize||0)); if(size>0){const c=Math.ceil(q/size);return `${c} karton (~${fmt(q)} ${x.unit||"unit"})`;} return `${fmt(q)} ${x.unit||"unit"}`; }
function normalizeWa(value) { const d=String(value||"").replace(/\D/g,""); if(!d)return""; if(d.startsWith("62"))return d; if(d.startsWith("0"))return`62${d.slice(1)}`; return d; }
function median(a) { const v=a.filter(Number.isFinite).slice().sort((x,y)=>x-y); if(!v.length)return 0; const m=Math.floor(v.length/2); return v.length%2?v[m]:(v[m-1]+v[m])/2; }
function dayDiff(a,b) { const da=dateUtc(a),db=dateUtc(b); return da&&db?Math.round((db-da)/86400000):0; }
function dateUtc(v) { const[y,m,d]=String(v||"").split("-").map(Number); return y&&m&&d?Date.UTC(y,m-1,d):0; }
function addDays(key,days) { const ms=dateUtc(key); return ms?new Date(ms+Math.max(0,Number(days||0))*86400000).toISOString().slice(0,10):null; }
function jakartaDateKey(date) { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(date); }
function weekdayName(key) { return new Intl.DateTimeFormat("id-ID",{weekday:"long",timeZone:"Asia/Jakarta"}).format(new Date(`${key}T00:00:00+07:00`)); }
function dateShort(key) { return new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Jakarta"}).format(new Date(`${key}T00:00:00+07:00`)); }
function statusRank(s) { return s==="Kritis"?0:s==="Menipis"?1:2; }
function fmt(n) { return new Intl.NumberFormat("id-ID",{maximumFractionDigits:1}).format(Number(n||0)); }
function safeKey(v) { return String(v||"event").replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,220); }
