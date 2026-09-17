const SNAPSHOT_KEY = "operations_snapshot";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwksCache = { expiresAt: 0, keys: null };

// v1.7.33 — Telegram Read-Only Button Dashboard.
// Slash command lama tetap menjadi fallback, sedangkan inline button menjadi navigasi utama.
// Semua action dashboard hanya membaca snapshot SoWork; tidak ada callback yang menulis data operasional.
const BOT_COMMANDS = [
  { command: "menu", description: "Daftar shortcut SoWork" },
  { command: "today", description: "Ringkasan operasional hari ini" },
  { command: "stock", description: "Lihat semua stock" },
  { command: "order", description: "Lihat Order Planner" },
  { command: "waste", description: "Ringkasan waste bulan ini" },
  { command: "shift", description: "Jadwal shift hari ini" },
  { command: "so", description: "Stock Opname terakhir" },
  { command: "incoming", description: "Barang Masuk terakhir" },
  { command: "alert", description: "Hal yang perlu perhatian" },
  { command: "check", description: "Status Daily Check" },
  { command: "help", description: "Bantuan command" }
];

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
        if (url.pathname === "/api/stock-receipt-batch" && request.method === "POST") {
          return cors(await apiStockReceiptBatch(request, env));
        }
        if (url.pathname === "/api/stock-opname" && request.method === "POST") {
          return cors(await apiStockOpname(request, env));
        }
        if (url.pathname === "/api/planning-event" && request.method === "POST") {
          return cors(await apiPlanningEvent(request, env));
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
      schedules: snapshot.schedules.length,
      checklist: snapshot.checklist.length,
      checklistCompletions: snapshot.checklistCompletions.length,
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
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: false
  });
  // Sekalian isi menu slash Telegram. Jika gagal, webhook tetap dianggap berhasil.
  let commandMenu = null;
  try {
    commandMenu = await telegramApi(env, "setMyCommands", { commands: BOT_COMMANDS });
  } catch (error) {
    console.warn("Telegram setMyCommands skipped", error?.message || error);
  }
  return json({ ok: true, webhookUrl: `${origin}/telegram/webhook`, telegram: response, commandMenu });
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


async function apiStockReceiptBatch(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ ok: false, error: "Payload barang masuk tidak valid." }, 400);

  const snapshot = await getSnapshot(env);
  const settings = snapshot?.settings || {};
  if (settings.telegramEnabled !== true) {
    return json({ ok: true, skipped: true, reason: "Telegram nonaktif." });
  }
  if (settings.telegramNotifyStockReceipt === false) {
    return json({ ok: true, skipped: true, reason: "Notif Barang Masuk dimatikan." });
  }

  const rows = Array.isArray(payload.rows) ? payload.rows.filter(row => row && row.itemName) : [];
  if (!rows.length) return json({ ok: false, error: "Daftar barang masuk kosong." }, 400);

  const batchId = safeKey(String(payload.batchId || `stock_receipt_${payload.date || new Date().toISOString()}`));
  const text = buildStockReceiptBatchMessage({ ...payload, rows });
  const sent = await sendAlertOnce(env, `receipt_${batchId}`, "stock-receipt", text, settings);
  if (!sent) {
    const exists = await env.DB.prepare("SELECT event_key FROM notification_events WHERE event_key = ?")
      .bind(safeKey(`receipt_${batchId}`)).first();
    if (exists) return json({ ok: true, duplicate: true, sent: 0 });
    return json({ ok: false, error: "Telegram belum dipair atau pesan gagal dikirim." }, 409);
  }

  const connections = await getConnections(env);
  return json({ ok: true, sent: connections.length, batchId });
}

async function apiStockOpname(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ ok: false, error: "Payload Stock Opname tidak valid." }, 400);

  const snapshot = await getSnapshot(env);
  const settings = snapshot?.settings || {};
  if (settings.telegramEnabled !== true) {
    return json({ ok: true, skipped: true, reason: "Telegram nonaktif." });
  }
  if (settings.telegramNotifyStockOpname === false) {
    return json({ ok: true, skipped: true, reason: "Notif Stock Opname dimatikan." });
  }

  const rows = Array.isArray(payload.rows) ? payload.rows.filter(row => row && row.itemName) : [];
  if (!rows.length) return json({ ok: false, error: "Daftar Stock Opname kosong." }, 400);

  const eventId = safeKey(String(payload.eventId || `stock_opname_${payload.date || new Date().toISOString()}`));
  const text = buildStockOpnameMessage({ ...payload, rows });
  const sent = await sendAlertOnce(env, `opname_${eventId}`, "stock-opname", text, settings);
  if (!sent) {
    const exists = await env.DB.prepare("SELECT event_key FROM notification_events WHERE event_key = ?")
      .bind(safeKey(`opname_${eventId}`)).first();
    if (exists) return json({ ok: true, duplicate: true, sent: 0 });
    return json({ ok: false, error: "Telegram belum dipair atau pesan gagal dikirim." }, 409);
  }

  const connections = await getConnections(env);
  return json({ ok: true, sent: connections.length, eventId });
}

function buildStockOpnameMessage(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const actor = String(payload.createdByName || "Admin").trim();
  const date = String(payload.date || "");
  const batchId = String(payload.batchId || "").trim();
  const sesuai = rows.filter(row => String(row.reconciliationStatus || "").toLowerCase() === "sesuai").length;
  const kurang = rows.filter(row => String(row.reconciliationStatus || "").toLowerCase().includes("kurang"));
  const lebih = rows.filter(row => String(row.reconciliationStatus || "").toLowerCase().includes("lebih"));
  const mismatch = [...kurang, ...lebih].sort((a, b) => Math.abs(Number(b.varianceQty || 0)) - Math.abs(Number(a.varianceQty || 0)));

  const lines = [
    "📋 STOCK OPNAME SOWORK",
    "",
    `${rows.length} barang dicek${date ? ` · ${dateShort(date)}` : ""}`,
    ...(batchId ? [`🧾 Batch: ${batchId}`] : []),
    `✅ Sesuai: ${sesuai}`,
    `🔻 Selisih kurang: ${kurang.length}`,
    `🔺 Selisih lebih: ${lebih.length}`
  ];

  if (mismatch.length) {
    lines.push("", "⚠️ Selisih:");
    mismatch.slice(0, 18).forEach(row => {
      const diff = Number(row.varianceQty || 0);
      const sign = diff > 0 ? "+" : "";
      const unit = String(row.unit || "PCS");
      const physical = Number(row.totalQty || 0);
      const system = Number(row.systemQtyBeforeOpname || 0);
      lines.push(`• ${String(row.itemName || "Barang")}: ${sign}${fmt(diff)} ${unit} (fisik ${fmt(physical)} · sistem ${fmt(system)})`);
    });
    if (mismatch.length > 18) lines.push(`• +${mismatch.length - 18} item berselisih lainnya`);
  }

  lines.push("", `Diinput oleh: ${actor || "Admin"}`);
  return lines.join("\n");
}

async function apiPlanningEvent(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ ok: false, error: "Payload Planning tidak valid." }, 400);
  const snapshot = await getSnapshot(env);
  const settings = snapshot?.settings || {};
  if (settings.telegramEnabled !== true) return json({ ok: true, skipped: true, reason: "Telegram nonaktif." });

  const kind = String(payload.kind || "planning-summary");
  if (kind === "sales-import" && settings.telegramNotifySalesImport === false) return json({ ok: true, skipped: true, reason: "Notif Sales Import dimatikan." });
  if (kind === "planning-summary" && settings.telegramNotifyPlanningSummary === false) return json({ ok: true, skipped: true, reason: "Notif Planning dimatikan." });
  if (kind === "stock-variance" && settings.telegramNotifyStockVariance === false) return json({ ok: true, skipped: true, reason: "Notif Stock Variance dimatikan." });

  const title = String(payload.title || "Planning Order SoWork").trim().slice(0, 120);
  const message = String(payload.message || "").trim().slice(0, 3000);
  if (!message) return json({ ok: false, error: "Isi notifikasi Planning kosong." }, 400);
  const icon = kind === "sales-import" ? "📊" : kind === "stock-variance" ? "⚠️" : "📦";
  const text = `${icon} ${title.toUpperCase()}\n\n${message}`;
  const eventId = safeKey(String(payload.eventId || `${kind}_${Date.now()}`));
  const sent = await sendAlertOnce(env, `planning_${kind}_${eventId}`, kind, text, settings);
  if (!sent) {
    const connections = await getConnections(env);
    if (!connections.length) return json({ ok: false, error: "Telegram belum dipair." }, 409);
    return json({ ok: true, duplicate: true, sent: 0 });
  }
  const connections = await getConnections(env);
  return json({ ok: true, sent: connections.length, eventId });
}

function buildStockReceiptBatchMessage(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const date = String(payload.date || "");
  const supplier = String(payload.supplier || "").trim();
  const destination = String(payload.destination || "").trim();
  const actor = String(payload.createdByName || payload.actorName || "Admin").trim();
  const note = String(payload.note || "").trim();
  const lines = [
    "📦 BARANG MASUK SOWORK",
    "",
    `${rows.length} jenis barang diterima${date ? ` · ${dateShort(date)}` : ""}`,
    ""
  ];

  rows.slice(0, 40).forEach(row => {
    const qty = fmt(Number(row.qty || 0));
    const unit = String(row.unit || "unit");
    const carton = Number(row.cartons || 0);
    const loose = Number(row.looseQty || 0);
    let detail = `${qty} ${unit}`;
    if (carton > 0) detail += ` (${fmt(carton)} karton${loose > 0 ? ` + ${fmt(loose)} ${unit}` : ""})`;
    lines.push(`• ${String(row.itemName || "Barang")}: ${detail}`);
  });
  if (rows.length > 40) lines.push(`• +${rows.length - 40} item lainnya`);

  lines.push("");
  if (supplier) lines.push(`Supplier: ${supplier}`);
  if (destination) lines.push(`Tujuan: ${destination}`);
  if (actor) lines.push(`Diinput oleh: ${actor}`);
  if (note) lines.push(`Catatan: ${note}`);
  return lines.join("\n");
}

async function telegramWebhook(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  requireTelegramSecrets(env);
  const expected = String(env.TELEGRAM_WEBHOOK_SECRET || "");
  const actual = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!expected || actual !== expected) return new Response("Forbidden", { status: 403 });

  const update = await request.json().catch(() => ({}));
  const callback = update.callback_query || null;
  const message = update.message || update.edited_message || callback?.message;
  if (!message?.chat?.id) return new Response("OK");

  const actor = callback?.from || message.from || {};
  const chatId = String(message.chat.id);
  const userId = String(actor?.id || "");
  const username = String(actor?.username || "");
  const firstName = String(actor?.first_name || "");
  const text = callback ? "" : String(message.text || "").trim();
  const snapshot = await getSnapshot(env);
  const settings = snapshot?.settings || {};

  // Inline button selalu melewati validasi pairing yang sama dengan command manual.
  if (callback) {
    if (!(await isPaired(env, chatId, userId))) {
      await answerCallback(env, callback.id, "Telegram ini belum dipair ke SoWork.", true);
      await sendTelegram(env, chatId, "Telegram ini belum dipair ke SoWork. Gunakan /start KODE dari Settings SoWork.", settings);
      return new Response("OK");
    }

    // Ack secepat mungkin supaya loading spinner tombol Telegram tidak menggantung.
    await answerCallback(env, callback.id, "");
    const today = jakartaDateKey(new Date());
    const panel = buildTelegramButtonPanel(callback.data, snapshot || {}, today);
    await sendReadOnlyPanel(env, chatId, panel.text, settings, panel.replyMarkup, message.message_id);
    return new Response("OK");
  }

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
    await sendTelegramWithMarkup(env, chatId,
      `✅ SoWork terhubung ke Telegram GRATIS via Cloudflare.\n\nAkun ini ditambahkan sebagai penerima notifikasi. Total penerima aktif: ${recipientCount}.\n\nPilih shortcut di bawah untuk membuka dashboard read-only.`,
      buildMainDashboardKeyboard()
    );
    return new Response("OK");
  }

  if (!(await isPaired(env, chatId, userId))) {
    await sendTelegram(env, chatId, "Telegram ini belum dipair ke SoWork. Gunakan /start KODE dari Settings SoWork.", settings);
    return new Response("OK");
  }

  const parsed = parseTelegramCommand(text);
  const today = jakartaDateKey(new Date());
  const data = snapshot || {};
  let reply = "";
  let replyMarkup = buildMainDashboardKeyboard();

  if (parsed.command === "/stock") {
    const rows = buildAllStockAnalytics(data);
    const criticalOnly = parsed.args.some(x => ["critical", "kritis", "alert"].includes(x));
    reply = criticalOnly ? buildStockAttentionMessage(rows) : buildFullStockMessage(rows);
    replyMarkup = buildStockDashboardKeyboard(criticalOnly ? "critical" : "all");
  } else if (parsed.command === "/order" || parsed.command === "/order_planner") {
    reply = buildOrderPlannerCommand(buildAllStockAnalytics(data));
    replyMarkup = buildSectionKeyboard("order");
  } else if (parsed.command === "/waste") {
    const mode = parsed.args.some(x => ["today", "hariini", "hari-ini"].includes(x)) ? "today" : "month";
    reply = buildWasteCommandMessage(data, today, mode);
    replyMarkup = buildWasteDashboardKeyboard(mode);
  } else if (parsed.command === "/shift") {
    const tomorrow = parsed.args.some(x => ["tomorrow", "besok"].includes(x));
    const date = tomorrow ? addDays(today, 1) : today;
    reply = buildShiftCommandMessage(data, date, tomorrow ? "BESOK" : "HARI INI");
    replyMarkup = buildShiftDashboardKeyboard(tomorrow ? "tomorrow" : "today");
  } else if (parsed.command === "/so" || parsed.command === "/opname") {
    reply = buildLatestStockOpnameCommand(data);
    replyMarkup = buildSectionKeyboard("so");
  } else if (parsed.command === "/incoming" || parsed.command === "/barang_masuk") {
    reply = buildLatestIncomingCommand(data);
    replyMarkup = buildSectionKeyboard("incoming");
  } else if (parsed.command === "/alert") {
    reply = buildReadOnlyAlertCommand(data, today);
    replyMarkup = buildSectionKeyboard("alert");
  } else if (parsed.command === "/today") {
    reply = buildTodayCommandMessage(data, today);
    replyMarkup = buildSectionKeyboard("today");
  } else if (parsed.command === "/check") {
    reply = buildChecklistStatusMessage(data, today, true) || "✅ Daily Check hari ini tidak punya task aktif.";
    replyMarkup = buildSectionKeyboard("check");
  } else if (parsed.command === "/menu" || parsed.command === "/help" || !parsed.command) {
    reply = buildBotDashboardText(data);
    replyMarkup = buildMainDashboardKeyboard();
  } else {
    reply = `Perintah ${parsed.command} belum tersedia. Gunakan dashboard tombol di bawah.`;
    replyMarkup = buildMainDashboardKeyboard();
  }

  await sendReadOnlyCommand(env, chatId, withSnapshotFooter(reply, data), settings, replyMarkup);
  return new Response("OK");
}

function parseTelegramCommand(text) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length || !parts[0].startsWith("/")) return { command: "", args: [] };
  const command = parts[0].split("@")[0].toLowerCase();
  return { command, args: parts.slice(1).map(x => String(x).toLowerCase()) };
}

function buildBotMenuText() {
  return [
    "🤖 SOWORK BOT · READ ONLY",
    "",
    "Tombol dashboard adalah navigasi utama. Command manual tetap tersedia sebagai fallback:",
    "",
    "/today · /stock · /stock critical · /order",
    "/waste · /waste today · /shift · /shift tomorrow",
    "/so · /incoming · /alert · /check · /menu",
    "",
    "🔒 Semua shortcut hanya membaca data. Edit/hapus/input tetap dilakukan dari web SoWork."
  ].join("\n");
}

function buildBotDashboardText(snapshot) {
  return [
    "🤖 SOWORK DASHBOARD",
    "",
    "Pilih informasi yang ingin dilihat lewat tombol di bawah.",
    "",
    snapshotFreshnessLine(snapshot),
    "🔒 Read-only · perubahan data tetap dari web SoWork."
  ].join("\n");
}

function dashboardButton(text, action) {
  return { text, callback_data: `sowork:${action}` };
}

function buildMainDashboardKeyboard() {
  return { inline_keyboard: [
    [dashboardButton("☀️ Hari Ini", "today"), dashboardButton("📦 Stock", "stock")],
    [dashboardButton("🛒 Order Planner", "order"), dashboardButton("🗑️ Waste", "waste")],
    [dashboardButton("👥 Shift", "shift"), dashboardButton("🚨 Alert", "alert")],
    [dashboardButton("📋 Stock Opname", "so"), dashboardButton("📥 Barang Masuk", "incoming")],
    [dashboardButton("✅ Daily Check", "check"), dashboardButton("🔄 Refresh", "menu")]
  ] };
}

function buildStockDashboardKeyboard(mode = "all") {
  return { inline_keyboard: [
    [dashboardButton(mode === "all" ? "✅ Semua Stock" : "📦 Semua Stock", "stock"), dashboardButton(mode === "critical" ? "✅ Kritis/Menipis" : "🔴 Kritis/Menipis", "stock:critical")],
    [dashboardButton("🔄 Refresh", mode === "critical" ? "stock:critical" : "stock"), dashboardButton("🏠 Menu", "menu")]
  ] };
}

function buildWasteDashboardKeyboard(mode = "month") {
  return { inline_keyboard: [
    [dashboardButton(mode === "today" ? "✅ Hari Ini" : "🗑️ Hari Ini", "waste:today"), dashboardButton(mode === "month" ? "✅ Bulan Ini" : "📊 Bulan Ini", "waste:month")],
    [dashboardButton("🔄 Refresh", mode === "today" ? "waste:today" : "waste:month"), dashboardButton("🏠 Menu", "menu")]
  ] };
}

function buildShiftDashboardKeyboard(mode = "today") {
  return { inline_keyboard: [
    [dashboardButton(mode === "today" ? "✅ Hari Ini" : "👥 Hari Ini", "shift:today"), dashboardButton(mode === "tomorrow" ? "✅ Besok" : "📅 Besok", "shift:tomorrow")],
    [dashboardButton("🔄 Refresh", mode === "tomorrow" ? "shift:tomorrow" : "shift:today"), dashboardButton("🏠 Menu", "menu")]
  ] };
}

function buildSectionKeyboard(action) {
  return { inline_keyboard: [
    [dashboardButton("🔄 Refresh", action), dashboardButton("🏠 Menu", "menu")]
  ] };
}

function buildTelegramButtonPanel(callbackData, snapshot, today) {
  const raw = String(callbackData || "");
  const action = raw.startsWith("sowork:") ? raw.slice(7) : "menu";
  let text = "";
  let replyMarkup = buildMainDashboardKeyboard();

  if (action === "menu") {
    text = buildBotDashboardText(snapshot);
  } else if (action === "today") {
    text = buildTodayCommandMessage(snapshot, today);
    replyMarkup = buildSectionKeyboard("today");
  } else if (action === "stock") {
    text = buildFullStockMessage(buildAllStockAnalytics(snapshot));
    replyMarkup = buildStockDashboardKeyboard("all");
  } else if (action === "stock:critical") {
    text = buildStockAttentionMessage(buildAllStockAnalytics(snapshot));
    replyMarkup = buildStockDashboardKeyboard("critical");
  } else if (action === "order") {
    text = buildOrderPlannerCommand(buildAllStockAnalytics(snapshot));
    replyMarkup = buildSectionKeyboard("order");
  } else if (action === "waste" || action === "waste:month") {
    text = buildWasteCommandMessage(snapshot, today, "month");
    replyMarkup = buildWasteDashboardKeyboard("month");
  } else if (action === "waste:today") {
    text = buildWasteCommandMessage(snapshot, today, "today");
    replyMarkup = buildWasteDashboardKeyboard("today");
  } else if (action === "shift" || action === "shift:today") {
    text = buildShiftCommandMessage(snapshot, today, "HARI INI");
    replyMarkup = buildShiftDashboardKeyboard("today");
  } else if (action === "shift:tomorrow") {
    text = buildShiftCommandMessage(snapshot, addDays(today, 1), "BESOK");
    replyMarkup = buildShiftDashboardKeyboard("tomorrow");
  } else if (action === "so") {
    text = buildLatestStockOpnameCommand(snapshot);
    replyMarkup = buildSectionKeyboard("so");
  } else if (action === "incoming") {
    text = buildLatestIncomingCommand(snapshot);
    replyMarkup = buildSectionKeyboard("incoming");
  } else if (action === "alert") {
    text = buildReadOnlyAlertCommand(snapshot, today);
    replyMarkup = buildSectionKeyboard("alert");
  } else if (action === "check") {
    text = buildChecklistStatusMessage(snapshot, today, true) || "✅ Daily Check hari ini tidak punya task aktif.";
    replyMarkup = buildSectionKeyboard("check");
  } else {
    text = buildBotDashboardText(snapshot);
    replyMarkup = buildMainDashboardKeyboard();
  }

  return { text: withSnapshotFooter(text, snapshot), replyMarkup };
}

function snapshotFreshnessLine(snapshot) {
  const raw = String(snapshot?.syncedAt || "");
  if (!raw) return "🕒 Data terakhir: snapshot belum tersedia";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return `🕒 Data terakhir: ${raw}`;
  const formatted = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta"
  }).format(date);
  return `🕒 Data terakhir: ${formatted} WIB`;
}

function withSnapshotFooter(text, snapshot) {
  const body = String(text || "Belum ada data yang bisa ditampilkan.").trim();
  if (body.includes("🕒 Data terakhir:")) return body;
  return `${body}\n\n${snapshotFreshnessLine(snapshot)}\n🔒 Read-only`;
}

async function answerCallback(env, callbackQueryId, text = "", showAlert = false) {
  if (!callbackQueryId) return;
  try {
    await telegramApi(env, "answerCallbackQuery", {
      callback_query_id: String(callbackQueryId),
      text: String(text || "").slice(0, 180),
      show_alert: Boolean(showAlert),
      cache_time: 0
    });
  } catch (error) {
    console.warn("Telegram answerCallbackQuery skipped", error?.message || error);
  }
}

async function sendTelegramWithMarkup(env, chatId, text, replyMarkup = null) {
  requireTelegramSecrets(env);
  const body = {
    chat_id: String(chatId),
    text: String(text || "").slice(0, 3900),
    disable_web_page_preview: true
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const result = await telegramApi(env, "sendMessage", body);
  return result?.result;
}

async function sendReadOnlyCommand(env, chatId, text, settings = {}, replyMarkup = null) {
  const chunks = splitTelegramText(String(text || ""), 3500);
  for (let i = 0; i < chunks.length; i++) {
    const prefix = i > 0 ? `↪️ Lanjutan ${i + 1}/${chunks.length}\n\n` : "";
    const markup = i === chunks.length - 1 ? (replyMarkup || buildMainDashboardKeyboard()) : null;
    await sendTelegramWithMarkup(env, chatId, `${prefix}${chunks[i]}`, markup);
  }
}

async function sendReadOnlyPanel(env, chatId, text, settings = {}, replyMarkup = null, messageId = null) {
  const chunks = splitTelegramText(String(text || ""), 3500);

  // Untuk hasil pendek, panel lama diedit di tempat agar chat tidak penuh pesan baru.
  if (messageId && chunks.length === 1) {
    try {
      await telegramApi(env, "editMessageText", {
        chat_id: String(chatId),
        message_id: Number(messageId),
        text: chunks[0],
        disable_web_page_preview: true,
        reply_markup: replyMarkup || buildMainDashboardKeyboard()
      });
      return;
    } catch (error) {
      const message = String(error?.message || error);
      if (message.toLowerCase().includes("message is not modified")) return;
      console.warn("Telegram editMessageText fallback to sendMessage", message);
    }
  }

  // Daftar yang panjang (mis. semua stock) tetap dipecah agar tidak melewati limit Telegram.
  for (let i = 0; i < chunks.length; i++) {
    const prefix = i > 0 ? `↪️ Lanjutan ${i + 1}/${chunks.length}\n\n` : "";
    const markup = i === chunks.length - 1 ? (replyMarkup || buildMainDashboardKeyboard()) : null;
    await sendTelegramWithMarkup(env, chatId, `${prefix}${chunks[i]}`, markup);
  }
}

function splitTelegramText(text, limit = 3500) {
  if (text.length <= limit) return [text];
  const lines = text.split("\n");
  const chunks = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (line.length <= limit) {
      current = line;
    } else {
      for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text.slice(0, limit)];
}

function stockStatusIcon(status) {
  return status === "Kritis" ? "🔴" : status === "Menipis" ? "🟠" : "🟢";
}

function buildFullStockMessage(rows) {
  if (!rows.length) return "📊 STOCK SOWORK\n\nBelum ada master Stock aktif pada snapshot Telegram.";
  const critical = rows.filter(x => x.status === "Kritis").length;
  const low = rows.filter(x => x.status === "Menipis").length;
  const safe = rows.filter(x => x.status === "Aman").length;
  const lines = [
    "📊 STOCK SOWORK · SEMUA ITEM",
    "",
    `${rows.length} item · 🔴 ${critical} kritis · 🟠 ${low} menipis · 🟢 ${safe} aman`,
    ""
  ];
  rows.forEach(x => {
    const unit = String(x.unit || "unit");
    let detail = `${stockStatusIcon(x.status)} ${x.name} — ${fmt(x.currentQty)} ${unit}`;
    if (Number(x.cartonSize || 0) > 0 && Number(x.currentQty || 0) >= Number(x.cartonSize || 0)) {
      const cartons = Math.floor(Number(x.currentQty || 0) / Number(x.cartonSize || 1));
      const loose = Number(x.currentQty || 0) - cartons * Number(x.cartonSize || 1);
      detail += ` (${cartons} karton${loose > 0 ? ` + ${fmt(loose)} ${unit}` : ""})`;
    }
    lines.push(detail);
  });
  lines.push("", "Gunakan /stock critical untuk hanya melihat item yang perlu perhatian.");
  return lines.join("\n");
}

function buildStockAttentionMessage(rows) {
  const selected = rows.filter(x => x.status !== "Aman");
  if (!selected.length) return "✅ STOCK ALERT\n\nSemua item aktif saat ini berstatus Aman.";
  const lines = ["⚠️ STOCK ALERT SOWORK", "", `${selected.length} item perlu perhatian:`, ""];
  selected.forEach(x => {
    const extra = x.recommendedQty > 0 ? ` · saran beli ${formatOrderQty(x)}` : "";
    lines.push(`${stockStatusIcon(x.status)} ${x.name} — ${fmt(x.currentQty)} ${x.unit || "unit"}${extra}`);
  });
  return lines.join("\n");
}

function buildOrderPlannerCommand(rows) {
  const recommended = rows.filter(x => Number(x.recommendedQty || 0) > 0);
  if (!recommended.length) return "✅ ORDER PLANNER\n\nBelum ada item dengan rekomendasi pembelian berdasarkan snapshot terbaru.";
  const dueNow = recommended.filter(x => x.orderDueNow || x.status === "Kritis").length;
  const lines = [
    "📦 ORDER PLANNER SOWORK",
    "",
    `${recommended.length} item direkomendasikan · ${dueNow} perlu diprioritaskan`,
    ""
  ];
  recommended.forEach(x => {
    const flags = x.orderDueNow || x.status === "Kritis" ? "🔴" : x.status === "Menipis" ? "🟠" : "🟡";
    let line = `${flags} ${x.name}\n   Stok ${fmt(x.currentQty)} ${x.unit || "unit"} · beli ${formatOrderQty(x)}`;
    if (x.predictedOutDate) line += ` · habis ~${dateShort(x.predictedOutDate)}`;
    if (x.recommendedOrderDate) line += `\n   Order: ${x.orderDueNow ? "HARI INI" : dateShort(x.recommendedOrderDate)}`;
    lines.push(line);
  });
  lines.push("", "Prediksi mengikuti snapshot yang sama dengan web. Cocokkan stok fisik sebelum final order.");
  return lines.join("\n");
}

function wasteEntriesForDay(snapshot, day) {
  const items = Array.isArray(snapshot.wasteItems) ? snapshot.wasteItems : [];
  const values = day?.values || {};
  return items.map(item => ({
    id: item.id,
    name: item.name || item.id,
    unit: item.unit || "QTY",
    qty: Math.max(0, Number(values[item.id] || 0))
  })).filter(x => x.qty > 0);
}

function buildWasteCommandMessage(snapshot, today, mode = "month") {
  const days = (Array.isArray(snapshot.wasteDays) ? snapshot.wasteDays : []).filter(x => x.date);
  const items = Array.isArray(snapshot.wasteItems) ? snapshot.wasteItems : [];
  if (mode === "today") {
    const day = days.find(x => x.date === today);
    if (!day) return `🗑️ WASTE HARI INI · ${dateShort(today)}\n\nBelum ada input Waste hari ini.`;
    const entries = wasteEntriesForDay(snapshot, day);
    const lines = ["🗑️ WASTE HARI INI", "", dateShort(today), ""];
    if (!entries.length) lines.push("✅ Sudah dicatat · semua nilai 0.");
    else entries.forEach(x => lines.push(`• ${x.name}: ${fmt(x.qty)} ${x.unit}`));
    const analyzed = analyzeWasteDay(snapshot, today, day.values || {});
    if (analyzed.highItems?.length) lines.push("", `⚠️ High Waste: ${analyzed.highItems.map(x => x.name).join(", ")}`);
    return lines.join("\n");
  }

  const monthKey = String(today).slice(0, 7);
  const monthDays = days.filter(x => String(x.date || "").startsWith(monthKey));
  if (!monthDays.length) return `🗑️ WASTE BULAN INI\n\nBelum ada input Waste untuk ${monthLabel(monthKey)}.`;
  const totals = items.map(item => ({
    name: item.name || item.id,
    unit: item.unit || "QTY",
    qty: monthDays.reduce((sum, day) => sum + Math.max(0, Number(day.values?.[item.id] || 0)), 0)
  })).filter(x => x.qty > 0).sort((a,b) => b.qty - a.qty);
  const latest = monthDays.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
  const lines = [
    "🗑️ WASTE BULAN BERJALAN",
    "",
    `${monthLabel(monthKey)} · ${monthDays.length} hari sudah dicatat`,
    `Input terakhir: ${latest ? dateShort(latest.date) : "-"}`,
    ""
  ];
  if (!totals.length) lines.push("✅ Semua input bulan ini bernilai 0.");
  else totals.forEach(x => lines.push(`• ${x.name}: ${fmt(x.qty)} ${x.unit}`));
  lines.push("", "Gunakan /waste today untuk melihat input hari ini.");
  return lines.join("\n");
}

function buildShiftCommandMessage(snapshot, date, label = "HARI INI") {
  const rows = (Array.isArray(snapshot.schedules) ? snapshot.schedules : [])
    .filter(x => x.date === date)
    .sort((a,b) => shiftSortRank(a.shift) - shiftSortRank(b.shift) || String(a.crewName || "").localeCompare(String(b.crewName || ""), "id"));
  const lines = [`🗓️ SHIFT ${label}`, "", dateShort(date), ""];
  if (!rows.length) {
    lines.push("Belum ada jadwal tersimpan untuk tanggal ini.");
    return lines.join("\n");
  }
  rows.forEach(x => {
    if (x.shift === "Libur") lines.push(`🔴 ${x.crewName} — Libur`);
    else {
      const overtime = x.overtime ? ` · Lembur${x.overtimeType ? ` ${x.overtimeType}` : ""}` : "";
      lines.push(`• ${x.crewName} — ${x.shift}${x.role ? ` · ${x.role}` : ""}${overtime}`);
    }
  });
  return lines.join("\n");
}

function buildLatestStockOpnameCommand(snapshot) {
  const rows = (Array.isArray(snapshot.stockOpnames) ? snapshot.stockOpnames : []).filter(x => x.date);
  if (!rows.length) return "📋 STOCK OPNAME TERAKHIR\n\nBelum ada histori Stock Opname pada snapshot Telegram.";
  const latestDate = rows.reduce((max, x) => String(x.date) > max ? String(x.date) : max, "");
  const onDate = rows.filter(x => String(x.date) === latestDate);
  let selected = onDate;
  let batchId = "";
  const latestBatchedRow = onDate
    .filter(x => String(x.batchId || ""))
    .slice()
    .sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  if (latestBatchedRow?.batchId) {
    batchId = String(latestBatchedRow.batchId);
    const batched = onDate.filter(x => String(x.batchId || "") === batchId);
    if (batched.length) selected = batched;
  }
  const classifyOpnameRow = row => {
    const diff = Number(row.varianceQty || 0);
    const status = String(row.reconciliationStatus || "").toLowerCase();
    if (diff < 0 || status.includes("kurang")) return "kurang";
    if (diff > 0 || status.includes("lebih")) return "lebih";
    if (status && status !== "sesuai") return "selisih";
    return "sesuai";
  };
  const classified = selected.map(row => ({ row, kind: classifyOpnameRow(row) }));
  const sesuai = classified.filter(x => x.kind === "sesuai").length;
  const kurang = classified.filter(x => x.kind === "kurang").map(x => x.row);
  const lebih = classified.filter(x => x.kind === "lebih").map(x => x.row);
  const otherMismatch = classified.filter(x => x.kind === "selisih").map(x => x.row);
  const mismatch = [...kurang, ...lebih, ...otherMismatch];
  const lines = [
    "📋 STOCK OPNAME TERAKHIR",
    "",
    `${dateShort(latestDate)} · ${selected.length} item`,
    ...(batchId ? [`🧾 Batch: ${batchId}`] : []),
    `✅ Sesuai: ${sesuai}`,
    `🔻 Kurang: ${kurang.length}`,
    `🟡 Lebih: ${lebih.length}`,
    `⚠️ Total selisih: ${mismatch.length}`
  ];
  if (mismatch.length) {
    lines.push("", "Selisih:");
    mismatch.sort((a,b)=>Math.abs(Number(b.varianceQty||0))-Math.abs(Number(a.varianceQty||0))).forEach(row => {
      const diff = Number(row.varianceQty || 0);
      const sign = diff > 0 ? "+" : "";
      const marker = diff < 0 ? "🔻" : diff > 0 ? "🟡" : "⚠️";
      lines.push(`${marker} ${row.itemName || row.itemId}: ${sign}${fmt(diff)} ${row.unit || "unit"}`);
    });
  }
  return lines.join("\n");
}

function buildLatestIncomingCommand(snapshot) {
  const rows = (Array.isArray(snapshot.stockMovements) ? snapshot.stockMovements : [])
    .filter(x => x.type === "IN" && x.date)
    .sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (!rows.length) return "📥 BARANG MASUK TERAKHIR\n\nBelum ada histori barang masuk pada snapshot Telegram.";
  const first = rows[0];
  const batchId = String(first.batchId || "");
  const selected = batchId ? rows.filter(x => String(x.batchId || "") === batchId) : rows.filter(x => x.date === first.date).slice(0, 1);
  const lines = [
    "📥 BARANG MASUK TERAKHIR",
    "",
    `${dateShort(first.date)} · ${selected.length} jenis barang`,
    ...(batchId ? [`🧾 Batch: ${batchId}`] : []),
    ...(first.supplier ? [`Supplier: ${first.supplier}`] : []),
    ...(first.destination ? [`Tujuan: ${first.destination}`] : []),
    ""
  ];
  selected.sort((a,b)=>Number(a.batchIndex||0)-Number(b.batchIndex||0)).forEach(row => {
    lines.push(`• ${row.itemName || row.itemId}: ${fmt(row.qty)} ${row.unit || "unit"}`);
  });
  if (first.note) lines.push("", `Catatan: ${first.note}`);
  return lines.join("\n");
}

function buildReadOnlyAlertCommand(snapshot, today) {
  const stockRows = buildAllStockAnalytics(snapshot);
  const critical = stockRows.filter(x => x.status === "Kritis");
  const low = stockRows.filter(x => x.status === "Menipis");
  const orders = stockRows.filter(x => x.recommendedQty > 0 && (x.orderDueNow || x.status === "Kritis"));
  const todayWaste = (Array.isArray(snapshot.wasteDays) ? snapshot.wasteDays : []).find(x => x.date === today);
  const highWaste = todayWaste ? analyzeWasteDay(snapshot, today, todayWaste.values || {}).highItems || [] : [];
  const tasks = applicableChecklistTasks(snapshot, today);
  const completions = (Array.isArray(snapshot.checklistCompletions) ? snapshot.checklistCompletions : []).filter(x => x.date === today && x.completed === true);
  const doneIds = new Set(completions.map(x => String(x.templateId || "")));
  const pending = tasks.filter(x => !doneIds.has(String(x.id || "")));
  const total = critical.length + low.length + orders.length + highWaste.length + pending.length;
  const lines = ["🚨 ALERT CENTER SOWORK", "", dateShort(today), ""];
  if (!total) {
    lines.push("✅ Tidak ada alert aktif dari snapshot saat ini.");
    return lines.join("\n");
  }
  lines.push(`🔴 Stock kritis: ${critical.length}`, `🟠 Stock menipis: ${low.length}`, `📦 Order prioritas: ${orders.length}`, `🗑️ High Waste hari ini: ${highWaste.length}`, `📋 Daily Check pending: ${pending.length}`);
  const names = [...critical, ...low].slice(0, 8).map(x => x.name);
  if (names.length) lines.push("", `Stock: ${names.join(", ")}${critical.length + low.length > names.length ? ", …" : ""}`);
  if (orders.length) lines.push(`Order: ${orders.slice(0, 6).map(x => x.name).join(", ")}${orders.length > 6 ? ", …" : ""}`);
  if (highWaste.length) lines.push(`Waste: ${highWaste.slice(0, 6).map(x => x.name).join(", ")}${highWaste.length > 6 ? ", …" : ""}`);
  return lines.join("\n");
}

function buildTodayCommandMessage(snapshot, today) {
  const stockRows = buildAllStockAnalytics(snapshot);
  const attention = stockRows.filter(x => x.status !== "Aman");
  const orderDue = stockRows.filter(x => x.recommendedQty > 0 && (x.orderDueNow || x.status === "Kritis"));
  const shiftRows = (Array.isArray(snapshot.schedules) ? snapshot.schedules : []).filter(x => x.date === today);
  const working = shiftRows.filter(x => x.shift && x.shift !== "Libur");
  const off = shiftRows.filter(x => x.shift === "Libur");
  const wasteToday = (Array.isArray(snapshot.wasteDays) ? snapshot.wasteDays : []).find(x => x.date === today);
  const tasks = applicableChecklistTasks(snapshot, today);
  const completedIds = new Set((Array.isArray(snapshot.checklistCompletions) ? snapshot.checklistCompletions : [])
    .filter(x => x.date === today && x.completed === true).map(x => String(x.templateId || "")));
  const doneCount = tasks.filter(x => completedIds.has(String(x.id || ""))).length;
  const lines = [
    "☀️ SOWORK TODAY",
    "",
    dateShort(today),
    "",
    `👥 Shift: ${working.length} bekerja${off.length ? ` · ${off.length} libur` : ""}`,
    `📦 Stock: ${attention.length ? `${attention.length} perlu perhatian` : "aman"}`,
    `🛒 Order: ${orderDue.length ? `${orderDue.length} prioritas` : "belum ada prioritas"}`,
    `🗑️ Waste: ${wasteToday ? "sudah diinput" : "belum diinput"}`,
    `📋 Daily Check: ${tasks.length ? `${doneCount}/${tasks.length} selesai` : "tidak ada task aktif"}`
  ];
  if (working.length) lines.push("", `Crew: ${working.map(x => `${x.crewName} (${x.shift}${x.role ? `/${x.role}` : ""})`).join(", ")}`);
  if (off.length) lines.push(`Libur: ${off.map(x => x.crewName).join(", ")}`);
  if (attention.length) lines.push(`Perhatian stock: ${attention.slice(0, 6).map(x => x.name).join(", ")}${attention.length > 6 ? ", …" : ""}`);
  return lines.join("\n");
}

function shiftSortRank(shift) {
  return shift === "S1" ? 0 : shift === "Middle" ? 1 : shift === "S2" ? 2 : shift === "Libur" ? 3 : 4;
}

function monthLabel(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) return String(monthKey || "");
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
    .format(new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`));
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
      return;
    }

    if (cron === "0 1 * * *") {
      if (snapshot.settings?.telegramNotifyOrderDue !== false) {
        const rows = buildAllStockAnalytics(snapshot);
        const msg = buildDailyOrderReminder(rows, false);
        if (msg) await sendAlertOnce(env, `order_${today}`, "order-reminder", msg, snapshot.settings);
      }
      return;
    }

    const cronHour = cron === "0 11 * * *" ? 18 : cron === "0 13 * * *" ? 20 : null;
    if (!cronHour) return;
    const configuredHour = [18, 20].includes(Number(snapshot.settings?.telegramOpsReminderHour))
      ? Number(snapshot.settings.telegramOpsReminderHour)
      : 20;
    if (cronHour !== configuredHour) return;

    const blocks = [];
    if (snapshot.settings?.telegramNotifyDailyCheck !== false) {
      const checklist = buildChecklistStatusMessage(snapshot, today, false);
      if (checklist) blocks.push(checklist);
    }
    if (snapshot.settings?.telegramNotifyOpsReminder !== false) {
      blocks.push(buildEveningOpsReminder(snapshot, today));
    }
    if (blocks.length) {
      await sendAlertOnce(env, `evening_ops_${today}_${cronHour}`, "evening-ops", blocks.join("\n\n──────────\n\n"), snapshot.settings);
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
    .filter(x => x.date && (x.type === "IN" || x.type === "OUT"))
    .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))
    .slice(0, 1800);

  const schedules = (Array.isArray(input.schedules) ? input.schedules : [])
    .map(cleanObject)
    .filter(x => x.date && x.crewName)
    .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))
    .slice(0, 900);

  const checklist = (Array.isArray(input.checklist) ? input.checklist : [])
    .map(cleanObject)
    .slice(0, 300);

  const checklistCompletions = (Array.isArray(input.checklistCompletions) ? input.checklistCompletions : [])
    .map(cleanObject)
    .filter(x => x.date && x.templateId)
    .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))
    .slice(0, 1200);

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
    schedules,
    checklist,
    checklistCompletions,
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
    telegramNotifyDailyCheck: s.telegramNotifyDailyCheck !== false,
    telegramNotifyOpsReminder: s.telegramNotifyOpsReminder !== false,
    telegramNotifyStockReceipt: s.telegramNotifyStockReceipt !== false,
    telegramNotifyStockOpname: s.telegramNotifyStockOpname !== false,
    telegramOpsReminderHour: [18, 20].includes(Number(s.telegramOpsReminderHour)) ? Number(s.telegramOpsReminderHour) : 20,
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
  due.slice(0, 18).forEach(x => lines.push(`• ${x.name}: sisa ${fmt(x.currentQty)} ${x.unit || "unit"} · beli ${formatOrderQty(x)}${x.predictedOutDate ? ` · habis ~${dateShort(x.predictedOutDate)}` : ""}`));
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


function normalizeChecklistForWorker(item = {}) {
  const legacy = String(item.section || "").toUpperCase();
  const legacyShift = legacy === "OPENING" ? "S1" : legacy === "MIDDLE" ? "Middle" : legacy === "CLOSING" ? "S2" : legacy === "GENERAL" ? "All" : "";
  return {
    ...item,
    title: String(item.title || "Untitled task"),
    shift: String(item.shift || legacyShift || "S1"),
    assignmentType: String(item.assignmentType || "Role"),
    requiredRole: String(item.requiredRole || "Bar"),
    specificCrew: String(item.specificCrew || ""),
    active: item.active !== false
  };
}

function applicableChecklistTasks(snapshot, date) {
  const schedules = (Array.isArray(snapshot.schedules) ? snapshot.schedules : [])
    .filter(x => x.date === date && x.shift && x.shift !== "Libur");
  const templates = (Array.isArray(snapshot.checklist) ? snapshot.checklist : [])
    .map(normalizeChecklistForWorker)
    .filter(x => x.active !== false);

  return templates.filter(item => {
    let candidates = item.shift === "All" ? schedules : schedules.filter(s => s.shift === item.shift);
    if (item.assignmentType === "Role") candidates = candidates.filter(s => String(s.role || "") === item.requiredRole);
    else if (item.assignmentType === "Specific Crew") candidates = candidates.filter(s => String(s.crewName || "") === item.specificCrew);
    return candidates.length > 0;
  });
}

function buildChecklistStatusMessage(snapshot, today, showAll = false) {
  const tasks = applicableChecklistTasks(snapshot, today);
  if (!tasks.length) return showAll ? `📋 DAILY CHECK — ${dateShort(today)}\n\nBelum ada task aktif yang cocok dengan jadwal hari ini.` : "";

  const completions = (Array.isArray(snapshot.checklistCompletions) ? snapshot.checklistCompletions : [])
    .filter(x => x.date === today);
  const doneIds = new Set(completions.filter(x => x.completed === true).map(x => String(x.templateId || "")));
  const done = tasks.filter(x => doneIds.has(String(x.id || "")));
  const pending = tasks.filter(x => !doneIds.has(String(x.id || "")));

  if (!pending.length) {
    return showAll ? `✅ DAILY CHECK SELESAI\n\n${dateShort(today)} · ${done.length}/${tasks.length} task selesai.` : "";
  }

  const lines = ["📋 DAILY CHECK BELUM SELESAI", "", `${dateShort(today)} · ${done.length}/${tasks.length} selesai`, ""];
  pending.slice(0, 8).forEach(item => {
    const shift = item.shift === "All" ? "General" : item.shift;
    lines.push(`• ${shift} — ${item.title}`);
  });
  if (pending.length > 8) lines.push(`• +${pending.length - 8} task lainnya`);
  lines.push("", "Selesaikan checklist sebelum closing supaya operasional hari ini tercatat lengkap.");
  return lines.join("\n");
}

function buildEveningOpsReminder(snapshot, today) {
  const movements = Array.isArray(snapshot.stockMovements) ? snapshot.stockMovements : [];
  const stockUsageRecorded = movements.some(x => x.date === today && x.type === "OUT" && (x.source === "DAILY_USAGE" || String(x.id || "").startsWith("USE_")));
  const wasteRecorded = (Array.isArray(snapshot.wasteDays) ? snapshot.wasteDays : []).some(x => x.date === today);
  const rows = buildAllStockAnalytics(snapshot);
  const attention = rows.filter(x => x.status !== "Aman").length;

  const lines = ["🌙 REMINDER OPERASIONAL SOWORK", "", `${dateShort(today)} · sebelum closing`, ""];
  lines.push(`${stockUsageRecorded ? "✅" : "⚠️"} Penggunaan Stock: ${stockUsageRecorded ? "sudah diinput" : "belum ada input hari ini"}`);
  lines.push(`${wasteRecorded ? "✅" : "⚠️"} Waste: ${wasteRecorded ? "sudah diinput" : "belum ada input hari ini"}`);
  if (attention > 0) lines.push(`📦 Stock Alert: ${attention} item perlu perhatian`);
  lines.push("", "Cek stok fisik, input penggunaan, dan waste hari ini sebelum tutup shift agar data besok tetap akurat.");
  return lines.join("\n");
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
