import "./style.css";
import { getUserProfile, isAdmin, login, logout, observeAuth, registerViewer } from "./auth/auth.js";
import { watchSchedules, saveSchedule, removeSchedule, watchScheduleRules, saveScheduleRules, replaceScheduleRange } from "./modules/schedule/schedule.js";
import { DEFAULT_SCHEDULE_RULES, cleanNames, generateSchedule, normalizeRules, suggestNextOffRotation, summarizeScheduleEntries } from "./modules/schedule/generator.js";
import { exportScheduleWorkbook } from "./modules/schedule/export.js";
import { watchChecklist, saveChecklistItem, removeChecklistItem, watchChecklistCompletions, saveChecklistCompletion } from "./modules/checklist/checklist.js";
import { watchStockItems, watchStockMovements, watchStockOpnames, watchStockSettings, saveStockItem, removeStockItem, saveStockReceipt, saveDailyStockUsage, saveStockOpname, saveStockSettings, seedStockReference, normalizeWhatsappNumber, qtyFromCartonInput, cartonBreakdown } from "./modules/stock/stock.js";
import { buildStockAnalytics, stockAlertRows, buildWhatsappAlertMessage, calculateTheoreticalStock, buildStockReconciliation } from "./modules/stock/analytics.js";
import { watchWasteItems, watchWasteDays, saveWasteItem, archiveWasteItem, restoreWasteItem, permanentDeleteWasteItem, saveWasteDay, seedWasteReference } from "./modules/waste/waste.js";
import { buildWasteAnalytics, wasteDashboardAlerts } from "./modules/waste/analytics.js";
import { exportWasteWorkbook } from "./modules/waste/export.js";
import { watchPersonalReports, savePersonalReport, removePersonalReport } from "./modules/reports/reports.js";
import { DEFAULT_APP_SETTINGS, watchAppSettings, saveAppSettings, updateProfileName } from "./modules/settings/settings.js";
import {
  chooseExcelFile, exportAllWorkbook, exportCalculatorWorkbook, exportChecklistWorkbook, exportDashboardWorkbook,
  exportOrderPlannerWorkbook, exportReportsWorkbook, exportStockOpnameWorkbook, exportStockWorkbook, importFeatureWorkbook
} from "./modules/datahub/datahub.js";
import { getTelegramWorkerStatus, normalizeWorkerUrl, sendTelegramTest, setupTelegramWebhook, syncTelegramSnapshot, unpairTelegram } from "./modules/telegram/cloudflare.js";

const app = document.querySelector("#app");

let state = {
  user: null,
  profile: null,
  page: "dashboard",
  schedules: [],
  checklist: [],
  checklistCompletions: [],
  checklistDate: null,
  scheduleRules: normalizeRules(DEFAULT_SCHEDULE_RULES),
  schedulePreview: null,
  scheduleMonth: null,
  scheduleIncludeCarryover: null,
  stockItems: [],
  stockMovements: [],
  stockOpnames: [],
  stockSettings: { whatsappNumber: "", autoWhatsappEnabled: false, notifyCriticalOnly: true, notifyLowStock: false, whatsappTemplateName: "stock_alert_sowork", whatsappTemplateLanguage: "id", telegramEnabled: false, cloudflareWorkerUrl: "", telegramChatId: "", telegramAllowedUserId: "", telegramPairCode: "", telegramWhatsappNumber: "", telegramNotifyLowStock: true, telegramNotifyOrderDue: true, telegramNotifyWasteHigh: true, telegramNotifyWasteRiskDay: true, defaultLeadTimeDays: 2, defaultTargetCoverageDays: 7 },
  stockSearch: "",
  stockStatusFilter: "Semua",
  opnameDate: null,
  stockUsageDate: null,
  wasteItems: [],
  wasteDays: [],
  wasteMonth: null,
  wasteDate: null,
  personalReports: [],
  reportMonth: null,
  reportSearch: "",
  appSettings: { ...DEFAULT_APP_SETTINGS },
  telegramWorkerStatus: null,
  cloudflareSyncTimer: null,
  cloudflareSyncBusy: false,
  cloudflareSyncQueued: false,
  unsubs: []
};

function clearSubscriptions() {
  state.unsubs.forEach(fn => fn?.());
  state.unsubs = [];
}

function navItems() {
  const admin = isAdmin(state.profile);
  return [
    ["dashboard", "Home", "home"],
    ["schedule", "Jadwal", "calendar"],
    ["checklist", "Daily Check", "check"],
    ...(admin ? [
      ["stock", "Stock", "box"],
      ["opname", "Stock Opname", "clipboard"],
      ["order", "Order Planner", "truck"],
      ["waste", "Waste", "trash"],
      ["calculator", "Kalkulator", "calculator"],
      ["reports", "Laporan", "file"],
      ["data", "Data", "file"],
      ["settings", "Settings", "settings"]
    ] : [])
  ];
}

function iconSvg(name, size = 18) {
  const icons = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 2.5 2.5L16 9"/>',
    box: '<path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
    calculator: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/>'
  };
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.home}</svg>`;
}

function renderAuth() {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-wrap">
        <div class="auth-intro">
          <div class="brand-lockup light">
            <span class="brand-mark"><span class="brand-glyph">S</span></span>
            <span><strong>${escapeHtml(state.appSettings?.outletName || "SoWork")}</strong><small>${escapeHtml(state.appSettings?.branchName || "Operations Hub")}</small></span>
          </div>
          <div class="auth-copy">
            <span class="overline">WORKSPACE OPERASIONAL</span>
            <h1>Kerja lebih rapi.<br/>Informasi lebih jelas.</h1>
            <p>Jadwal, daily checklist, dan operasional kerja dalam satu tempat yang simpel.</p>
          </div>
        </div>

        <section class="auth-card">
          <div class="auth-card-head">
            <span class="overline">WELCOME</span>
            <h2>Masuk ke SoWork</h2>
            <p class="muted">Gunakan akun yang sudah terdaftar.</p>
          </div>

          <div class="tabs">
            <button class="tab active" data-auth-tab="login">Login</button>
            <button class="tab" data-auth-tab="register">Daftar Viewer</button>
          </div>

          <form id="login-form" class="stack">
            <label>Email<input name="email" type="email" autocomplete="email" placeholder="nama@email.com" required /></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" placeholder="••••••••" required /></label>
            <button class="primary full">Masuk</button>
          </form>

          <form id="register-form" class="stack hidden">
            <label>Nama<input name="name" autocomplete="name" placeholder="Nama lengkap" required /></label>
            <label>Email<input name="email" type="email" autocomplete="email" placeholder="nama@email.com" required /></label>
            <label>Password<input name="password" type="password" autocomplete="new-password" minlength="6" placeholder="Minimal 6 karakter" required /></label>
            <button class="primary full">Buat akun Viewer</button>
          </form>

          <p id="auth-msg" class="msg"></p>
          <p class="auth-note">Akun Viewer hanya dapat melihat jadwal dan daily checklist.</p>
        </section>
      </section>
    </main>
  `;

  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  const msg = document.querySelector("#auth-msg");

  document.querySelectorAll("[data-auth-tab]").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("[data-auth-tab]").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      const register = btn.dataset.authTab === "register";
      loginForm.classList.toggle("hidden", register);
      registerForm.classList.toggle("hidden", !register);
      msg.textContent = "";
    };
  });

  loginForm.onsubmit = async e => {
    e.preventDefault();
    msg.textContent = "Memproses...";
    const fd = new FormData(loginForm);
    try {
      await login(fd.get("email"), fd.get("password"));
    } catch (err) {
      msg.textContent = friendlyError(err);
    }
  };

  registerForm.onsubmit = async e => {
    e.preventDefault();
    msg.textContent = "Membuat akun...";
    const fd = new FormData(registerForm);
    try {
      await registerViewer(fd.get("email"), fd.get("password"), fd.get("name"));
    } catch (err) {
      msg.textContent = friendlyError(err);
    }
  };
}

function friendlyError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential")) return "Email atau password salah.";
  if (code.includes("email-already-in-use")) return "Email sudah terdaftar.";
  if (code.includes("weak-password")) return "Password terlalu lemah.";
  if (code.includes("permission-denied")) return "Akses ditolak oleh Firestore Rules.";
  return err?.message || "Terjadi kesalahan.";
}

function renderShell() {
  const admin = isAdmin(state.profile);
  const displayName = state.profile?.name || state.user?.email || "User";
  const initials = displayName.trim().slice(0, 1).toUpperCase();

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div>
          <div class="brand-lockup">
            <span class="brand-mark"><span class="brand-glyph">S</span></span>
            <span><strong>${escapeHtml(state.appSettings?.outletName || "SoWork")}</strong><small>${escapeHtml(state.appSettings?.branchName || "Operations Hub")}</small></span>
          </div>
          <div class="role-pill">${admin ? "ADMIN ACCESS" : "VIEWER ACCESS"}</div>
        </div>

        <nav class="desktop-nav">
          ${navItems().map(([id, label, icon]) => `
            <button class="nav-btn ${state.page === id ? "active" : ""}" data-page="${id}">
              <span class="nav-symbol">${iconSvg(icon, 17)}</span>
              <span>${label}</span>
            </button>
          `).join("")}
        </nav>

        <div class="account-card">
          <span class="avatar">${escapeHtml(initials)}</span>
          <div class="account-copy">
            <strong>${escapeHtml(displayName)}</strong>
            <small>${escapeHtml(state.user?.email || "")}</small>
          </div>
          <button id="logout-btn" class="icon-button" title="Keluar">↗</button>
        </div>
      </aside>

      <section class="content">
        <header class="topbar">
          <div class="mobile-brand">
            <span class="brand-mark small-mark"><span class="brand-glyph">S</span></span>
            <strong>${escapeHtml(state.appSettings?.outletName || "SoWork")}</strong>
          </div>
          <div class="page-heading">
            <span class="overline">${admin ? "ADMIN WORKSPACE" : "VIEWER WORKSPACE"}</span>
            <h2>${pageTitle(state.page)}</h2><small class="page-context">${pageContext(state.page)}</small>
          </div>
          <div class="top-actions">
            <span id="network-status" class="network-pill"></span>
            <span class="top-avatar">${escapeHtml(initials)}</span>
          </div>
        </header>

        <main id="page-content"></main>

        <nav class="mobile-nav" aria-label="Navigasi mobile">
          ${navItems().map(([id, label, icon]) => `
            <button class="mobile-nav-btn ${state.page === id ? "active" : ""}" data-page="${id}">
              <span>${iconSvg(icon, 18)}</span><small>${label}</small>
            </button>
          `).join("")}
        </nav>
      </section>
    </div>
  `;

  document.querySelectorAll("[data-page]").forEach(btn => {
    btn.onclick = () => {
      state.page = btn.dataset.page;
      renderShell();
    };
  });

  document.querySelector("#logout-btn").onclick = logout;
  updateNetworkStatus();
  renderPage();
}

function updateNetworkStatus() {
  const el = document.querySelector("#network-status");
  if (!el) return;
  const online = navigator.onLine;
  el.className = `network-pill ${online ? "online" : "offline"}`;
  el.innerHTML = `<span></span>${online ? "Online" : "Offline cache"}`;
}

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

function pageTitle(page) {
  const map = {
    dashboard: "Dashboard",
    schedule: "Jadwal Kerja",
    checklist: "Daily Checklist",
    stock: "Stock",
    opname: "Stock Opname",
    order: "Order Planner",
    waste: "Waste",
    calculator: "Kalkulator Kerja",
    reports: "Laporan Pribadi",
    data: "Data & Sheet",
    settings: "Settings"
  };
  return map[page] || "SoWork";
}

function pageContext(page) {
  const map = {
    dashboard: "Ringkasan operasional hari ini",
    schedule: "Shift, role, fairness & lembur",
    checklist: "Task harian berdasarkan shift dan role",
    stock: "Master barang, alert & pergerakan stok",
    opname: "Input stok aktual & histori SO",
    order: "Prediksi kebutuhan dan waktu order",
    waste: "Input harian, trend & waste intelligence",
    calculator: "Tool hitung operasional",
    reports: "Catatan kerja pribadi",
    data: "Export, import & template spreadsheet",
    settings: "Workspace, profil & default sistem"
  };
  return map[page] || "Operations workspace";
}

function renderPage() {
  const target = document.querySelector("#page-content");
  if (!target) return;

  const admin = isAdmin(state.profile);
  if (!admin && !["dashboard", "schedule", "checklist"].includes(state.page)) {
    state.page = "dashboard";
    renderShell();
    return;
  }

  if (state.page === "dashboard") return renderDashboard(target);
  if (state.page === "schedule") return renderSchedule(target);
  if (state.page === "checklist") return renderChecklist(target);
  if (state.page === "stock") return renderStock(target);
  if (state.page === "opname") return renderStockOpname(target);
  if (state.page === "order") return renderOrderPlanner(target);
  if (state.page === "waste") return renderWaste(target);
  if (state.page === "calculator") return renderCalculator(target);
  if (state.page === "reports") return renderReports(target);
  if (state.page === "data") return renderDataHub(target);
  if (state.page === "settings") return renderSettings(target);
  return renderPlaceholder(target);
}

function renderDashboard(target) {
  const today = localDateKey(new Date());
  const todaySchedule = state.schedules.filter(x => x.date === today);
  const activeCheck = state.checklist.filter(x => x.active !== false);
  const displayName = state.profile?.name?.split(" ")[0] || "User";
  const admin = isAdmin(state.profile);
  const stockAnalytics = admin ? buildStockAnalytics(state.stockItems, state.stockOpnames, state.stockMovements) : [];
  const stockAlerts = admin ? stockAlertRows(stockAnalytics) : [];
  const stockCritical = stockAlerts.filter(x => x.status === "Kritis");
  const wasteHome = admin ? wasteDashboardAlerts(state.wasteItems, state.wasteDays, today.slice(0,7), today) : { alerts: [], analytics: null };

  target.innerHTML = `
    <section class="welcome-card">
      <div>
        <span class="overline">${greeting()}</span>
        <h1>Halo, ${escapeHtml(displayName)}.</h1>
        <p>${admin ? "Pantau operasional hari ini dari satu dashboard." : "Cek jadwal dan daily checklist hari ini dengan cepat."}</p>
      </div>
      <div class="date-card">
        <strong>${new Intl.DateTimeFormat("id-ID", { day: "2-digit" }).format(new Date())}</strong>
        <span>${new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(new Date())}</span>
        <small>${new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(new Date())}</small>
        ${admin ? `<button id="export-dashboard" class="secondary compact dashboard-export-btn">Export</button>` : ""}
      </div>
    </section>

    <div class="metric-grid">
      <article class="metric-card metric-schedule">
        <span class="metric-label">Jadwal hari ini</span>
        <strong>${todaySchedule.length}</strong>
        <small>penempatan crew</small>
      </article>
      <article class="metric-card metric-check">
        <span class="metric-label">Daily checklist</span>
        <strong>${activeCheck.length}</strong>
        <small>item aktif</small>
      </article>
      <article class="metric-card metric-access">
        <span class="metric-label">Mode akses</span>
        <strong class="text-value">${admin ? "Full" : "Read"}</strong>
        <small>${admin ? "Admin operations" : "Viewer only"}</small>
      </article>
      ${admin ? `<article class="metric-card metric-stock ${stockCritical.length ? "metric-alert" : ""}">
        <span class="metric-label">Alert stok</span>
        <strong>${stockAlerts.length}</strong>
        <small>${stockCritical.length ? `${stockCritical.length} item kritis` : "Tidak ada stok kritis"}</small>
      </article>` : ""}
      ${admin ? `<article class="metric-card metric-waste ${wasteHome.alerts.length ? "metric-alert" : ""}">
        <span class="metric-label">Waste warning</span>
        <strong>${wasteHome.alerts.length}</strong>
        <small>${wasteHome.alerts.length ? "perlu kontrol prep" : "pola waste stabil"}</small>
      </article>` : ""}
    </div>

    ${admin && stockAlerts.length ? `
      <article class="panel stock-home-alert">
        <div class="panel-head">
          <div><span class="overline">STOCK ALERT</span><h3>Perlu perhatian</h3></div>
          <button class="text-button" data-jump="stock">Buka Stock</button>
        </div>
        <div class="home-alert-list">
          ${stockAlerts.slice(0, 6).map(item => `
            <div class="home-alert-row">
              <span class="stock-status-dot ${stockStatusClass(item.status)}"></span>
              <div class="grow"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.status)} · ${formatQty(item.currentQty)} ${escapeHtml(item.unit)}${Number.isFinite(item.daysCover) ? ` · ~${item.daysCover.toFixed(1)} hari` : ""}</small></div>
              ${item.recommendedQty > 0 ? `<span class="order-mini">Order ${formatQty(item.recommendedQty)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      </article>
    ` : ""}

    ${admin && wasteHome.alerts.length ? `
      <article class="panel waste-home-alert">
        <div class="panel-head">
          <div><span class="overline">WASTE CONTROL</span><h3>Peringatan produksi</h3></div>
          <button class="text-button" data-jump="waste">Buka Waste</button>
        </div>
        <div class="home-alert-list">
          ${wasteHome.alerts.slice(0,4).map(a => `
            <div class="home-alert-row">
              <span class="waste-alert-dot ${a.severity}"></span>
              <div class="grow"><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.message)}</small></div>
            </div>`).join("")}
        </div>
      </article>
    ` : ""}

    <div class="content-grid">
      <article class="panel">
        <div class="panel-head">
          <div><span class="overline">TODAY</span><h3>Shift Hari Ini</h3></div>
          <button class="text-button" data-jump="schedule">Lihat jadwal</button>
        </div>
        <div class="compact-list">
          ${todaySchedule.length ? todaySchedule.map(s => `
            <div class="compact-row">
              <span class="shift-badge ${shiftClass(s.shift)}">${escapeHtml(s.shift)}</span>
              <div class="grow"><strong>${escapeHtml(s.crewName)}</strong><small>${escapeHtml(s.role || "Belum ada role")}</small></div>
            </div>
          `).join("") : emptyState("Belum ada jadwal untuk hari ini.")}
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div><span class="overline">CHECKLIST</span><h3>Daily Check</h3></div>
          <button class="text-button" data-jump="checklist">Lihat semua</button>
        </div>
        <div class="compact-list">
          ${activeCheck.length ? activeCheck.slice(0, 8).map(c => `
            <div class="compact-row checklist-row">
              <span class="check-box"></span>
              <div class="grow"><strong>${escapeHtml(c.title)}</strong><small>${escapeHtml(normalizeChecklistTemplate(c).shift)}</small></div>
            </div>
          `).join("") : emptyState("Belum ada daily checklist.")}
        </div>
      </article>
    </div>
  `;

  document.querySelector("#export-dashboard")?.addEventListener("click", () => exportDashboardWorkbook({
    stockAnalytics,
    wasteAlerts: wasteHome.alerts,
    todaySchedule,
    filename: `SoWork-Dashboard-${today}.xlsx`
  }));

  document.querySelectorAll("[data-jump]").forEach(btn => {
    btn.onclick = () => {
      state.page = btn.dataset.jump;
      renderShell();
    };
  });
}

function renderSchedule(target) {
  const admin = isAdmin(state.profile);
  const rules = normalizeRules(state.scheduleRules || DEFAULT_SCHEDULE_RULES);
  const selected = state.scheduleMonth || defaultScheduleMonth();
  state.scheduleMonth = selected;
  const [selectedYear, selectedMonth] = selected.split("-").map(Number);
  const includeCarryover = state.scheduleIncludeCarryover ?? (new Date().getDate() > 25);
  state.scheduleIncludeCarryover = includeCarryover;
  const targetStart = includeCarryover ? new Date(selectedYear, selectedMonth - 2, 26) : new Date(selectedYear, selectedMonth - 1, 1);
  const targetEnd = new Date(selectedYear, selectedMonth - 1, 25);
  const periodSchedules = state.schedules.filter(s => {
    const d = parseLocalDate(s.date);
    return d && d >= targetStart && d <= targetEnd;
  });
  const preview = state.schedulePreview;
  const scheduleForGrid = preview?.entries?.length ? preview.entries : periodSchedules;
  const overtimePeriod = scheduleForGrid.filter(x => x.overtime);
  const fairnessSummary = scheduleForGrid.length
    ? (preview?.summary || summarizeScheduleEntries(scheduleForGrid, [...rules.maleNames, ...rules.femaleNames]))
    : null;

  target.innerHTML = `
    <section class="page-intro">
      <div><span class="overline">SMART SCHEDULER</span><h1>Jadwal Kerja</h1><p>Status shift pakai indikator warna, sementara role kerja tetap terbaca jelas seperti format sheet operasional.</p></div>
      ${admin ? `<span class="access-tag">CRUD + Export</span>` : `<span class="access-tag read">Read only</span>`}
    </section>

    ${admin ? `
      <article class="panel scheduler-panel">
        <div class="panel-head">
          <div><span class="overline">AUTO GENERATOR</span><h3>Generate Jadwal</h3></div>
          <span class="count-pill">Periode 1–25</span>
        </div>

        <div class="scheduler-top-grid">
          <label>Bulan jadwal
            <input id="schedule-month" type="month" value="${escapeHtml(selected)}" />
          </label>
          <label class="toggle-label">
            <span>Periode transisi</span>
            <span class="switch-line"><input id="carryover-toggle" type="checkbox" ${includeCarryover ? "checked" : ""} /> Sertakan 26–akhir bulan sebelumnya</span>
          </label>
          <div class="generator-actions">
            <button id="generate-schedule" class="primary">Preview Jadwal</button>
            ${preview?.entries?.length ? `<button id="save-generated" class="secondary">Simpan Jadwal</button>` : ""}
          </div>
        </div>

        <div class="rule-summary-grid">${ruleSummaryCards(rules)}</div>
        ${preview ? renderPreviewMessage(preview) : `
          <div class="scheduler-hint">
            <strong>Rules aktif</strong>
            <span>Senin tanpa Middle · Selasa–Minggu ada Middle · S2 minimal 1 pria · Jumat S1 wanita · Middle hanya Bar/Kitchen-Bar · Lembur tidak dibuat otomatis.</span>
          </div>
        `}
      </article>

      <article class="panel">
        <div class="panel-head">
          <div><span class="overline">CREW & ROTASI</span><h3>Aturan Crew</h3></div>
          <button id="suggest-rotation" class="text-button">Sarankan rotasi berikutnya</button>
        </div>
        <form id="rules-form" class="rules-form">
          <label class="wide">Pria<input name="maleNames" value="${escapeHtml(rules.maleNames.join(", "))}" /></label>
          <label class="wide">Wanita<input name="femaleNames" value="${escapeHtml(rules.femaleNames.join(", "))}" /></label>
          <div class="offday-grid">
            ${["Senin","Selasa","Rabu","Kamis","Jumat"].map(day => `
              <label>${day}<input name="off_${day}" value="${escapeHtml((rules.offDays[day] || []).join(", "))}" placeholder="Nama crew libur" /></label>
            `).join("")}
          </div>
          <div class="form-foot">
            <span class="muted small-copy">Libur bisa digilir tiap periode. Generate tidak pernah menambahkan lembur otomatis.</span>
            <button class="secondary">Simpan Rules</button>
          </div>
        </form>
      </article>
    ` : `<div class="notice"><strong>Mode Viewer</strong><span>Jadwal dan role hanya dapat dilihat. CRUD, export, dan history lembur khusus Admin.</span></div>`}

    ${overtimePeriod.length ? renderOvertimeWarning(overtimePeriod) : ""}

    <article class="panel schedule-grid-panel">
      <div class="panel-head schedule-head-actions">
        <div><span class="overline">MONTHLY VIEW</span><h3>${escapeHtml(monthTitle(selected))}</h3></div>
        <div class="schedule-toolbar">
          <div class="legend-inline">
            <span><i class="legend-dot s1"></i>S1</span><span><i class="legend-dot middle"></i>Middle</span><span><i class="legend-dot s2"></i>S2</span><span><i class="legend-dot libur"></i>Libur</span><span><i class="legend-dot lembur"></i>Lembur</span>
          </div>
          ${admin ? `<div class="table-actions"><button id="add-schedule" class="secondary compact">+ Tambah</button><button id="import-schedule" class="secondary compact">Import Excel</button><button id="export-schedule" class="secondary compact">Export Excel</button></div>` : ""}
        </div>
      </div>
      ${renderScheduleMatrix(scheduleForGrid, rules, admin && !preview?.entries?.length)}
    </article>

    ${admin && fairnessSummary ? renderFairnessSummary(fairnessSummary) : ""}
    ${admin ? renderOvertimeHistory(state.schedules) : ""}
  `;

  const monthInput = document.querySelector("#schedule-month");
  if (monthInput) monthInput.onchange = () => {
    state.scheduleMonth = monthInput.value;
    state.schedulePreview = null;
    renderShell();
  };

  const carryToggle = document.querySelector("#carryover-toggle");
  if (carryToggle) carryToggle.onchange = () => {
    state.scheduleIncludeCarryover = carryToggle.checked;
    state.schedulePreview = null;
    renderShell();
  };

  if (!admin) return;

  const rulesForm = document.querySelector("#rules-form");
  rulesForm.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(rulesForm);
    const nextRules = normalizeRules({
      maleNames: cleanNames(fd.get("maleNames")),
      femaleNames: cleanNames(fd.get("femaleNames")),
      offDays: {
        Senin: cleanNames(fd.get("off_Senin")),
        Selasa: cleanNames(fd.get("off_Selasa")),
        Rabu: cleanNames(fd.get("off_Rabu")),
        Kamis: cleanNames(fd.get("off_Kamis")),
        Jumat: cleanNames(fd.get("off_Jumat")),
        Sabtu: [], Minggu: []
      },
      version: Number(rules.version || 1)
    });
    await saveScheduleRules(nextRules);
    state.scheduleRules = nextRules;
    state.schedulePreview = null;
    alert("Rules jadwal disimpan.");
  };

  document.querySelector("#suggest-rotation").onclick = () => {
    state.scheduleRules = suggestNextOffRotation(rules);
    state.schedulePreview = null;
    renderShell();
  };

  document.querySelector("#generate-schedule").onclick = () => {
    const [year, month] = document.querySelector("#schedule-month").value.split("-").map(Number);
    const carry = document.querySelector("#carryover-toggle").checked;
    state.scheduleIncludeCarryover = carry;
    const result = generateSchedule({ year, month, includeCarryover: carry, rules: state.scheduleRules });
    state.schedulePreview = { ...result, includeCarryover: carry };
    renderShell();
  };

  const saveBtn = document.querySelector("#save-generated");
  if (saveBtn) saveBtn.onclick = async () => {
    const p = state.schedulePreview;
    if (!p?.entries?.length || !p.range) return;
    const ok = confirm(`Simpan jadwal ${p.range.start} s/d ${p.range.end}? Data lama pada rentang ini akan diganti.`);
    if (!ok) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan...";
    try {
      await replaceScheduleRange(p.range.start, p.range.end, p.entries);
      state.schedulePreview = null;
      alert("Jadwal otomatis berhasil disimpan. Setelah tersimpan, klik sel untuk edit role/shift/lembur.");
    } catch (err) {
      alert(friendlyError(err));
      saveBtn.disabled = false;
      saveBtn.textContent = "Simpan Jadwal";
    }
  };

  document.querySelector("#add-schedule")?.addEventListener("click", () => openScheduleEditor(null, rules, selected));
  document.querySelector("#import-schedule")?.addEventListener("click", () => runExcelImport("schedule"));
  document.querySelector("#export-schedule")?.addEventListener("click", () => {
    try {
      exportScheduleWorkbook({
        entries: scheduleForGrid,
        rules,
        periodLabel: monthTitle(selected),
        filename: `SoWork-Jadwal-${selected}.xlsx`
      });
    } catch (err) {
      alert(err?.message || "Export gagal.");
    }
  });

  document.querySelectorAll("[data-edit-schedule]").forEach(btn => {
    btn.onclick = () => {
      const item = state.schedules.find(x => x.id === btn.dataset.editSchedule);
      if (item) openScheduleEditor(item, rules, selected);
    };
  });
}

function ruleSummaryCards(rules) {
  return `
    <div><span>Pria</span><strong>${escapeHtml(rules.maleNames.join(", "))}</strong></div>
    <div><span>Wanita</span><strong>${escapeHtml(rules.femaleNames.join(", "))}</strong></div>
    <div><span>Libur Jumat</span><strong>${escapeHtml((rules.offDays.Jumat || []).join(", ") || "-")}</strong></div>
  `;
}

function renderPreviewMessage(preview) {
  if (preview.errors?.length) {
    return `<div class="validation-box error"><strong>Jadwal belum bisa dibuat</strong>${preview.errors.map(x => `<span>${escapeHtml(x)}</span>`).join("")}</div>`;
  }
  return `<div class="validation-box success"><strong>Preview siap</strong><span>${escapeHtml(preview.range.start)} → ${escapeHtml(preview.range.end)} · ${preview.summary.days} hari · Fairness total ${preview.summary.overallFairnessScore ?? preview.summary.fairnessScore}/100</span><small>Role sudah dibuat otomatis. Middle hanya Bar atau Kitchen - Bar.</small>${(preview.warnings || []).map(x => `<small>${escapeHtml(x)}</small>`).join("")}</div>`;
}

function renderOvertimeWarning(entries) {
  const sorted = entries.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return `
    <article class="overtime-warning">
      <div class="warning-icon">!</div>
      <div class="grow"><strong>${sorted.length} jadwal lembur pada periode ini</strong><span>${sorted.slice(0, 3).map(x => `${shortDate(x.date)} · ${x.crewName} · ${x.overtimeType || "Lembur"}`).join("  •  ")}${sorted.length > 3 ? `  •  +${sorted.length - 3} lainnya` : ""}</span></div>
    </article>
  `;
}

function renderScheduleMatrix(entries, rules, editable = false) {
  if (!entries?.length) return emptyState("Belum ada jadwal pada periode ini. Admin bisa generate otomatis.");
  const preferredOrder = [...rules.maleNames, ...rules.femaleNames];
  const actualCrew = [...new Set(entries.map(e => e.crewName).filter(Boolean))];
  const crew = actualCrew.length
    ? actualCrew.sort((a, b) => {
        const ai = preferredOrder.indexOf(a);
        const bi = preferredOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b, "id");
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : preferredOrder;
  const byDate = new Map();
  entries.forEach(e => {
    if (!byDate.has(e.date)) byDate.set(e.date, {});
    byDate.get(e.date)[e.crewName] = e;
  });
  const rows = [...byDate.entries()].sort(([a],[b]) => a.localeCompare(b));

  return `
    <div class="schedule-matrix-wrap">
      <table class="schedule-matrix role-matrix">
        <thead><tr><th>Tanggal</th>${crew.map(n => `<th>${escapeHtml(n)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map(([date, map]) => `
            <tr>
              <td><strong>${escapeHtml(shortDate(date))}</strong><small>${escapeHtml(dayNameFromDate(date))}</small></td>
              ${crew.map(name => {
                const item = map[name];
                if (!item) return `<td><span class="matrix-empty">—</span></td>`;
                const statusClass = item.overtime ? "lembur" : shiftClass(item.shift);
                const primaryText = item.shift === "Libur" ? "Libur" : (item.role || "Belum ada role");
                const meta = item.overtime ? `${item.shift} · Lembur ${item.overtimeType || ""}` : item.shift;
                const content = `<span class="role-cell-main"><i class="status-icon ${statusClass}" title="${escapeHtml(meta)}"></i><strong>${escapeHtml(primaryText)}</strong></span><small>${escapeHtml(meta)}</small>${item.overtimeNote ? `<em title="${escapeHtml(item.overtimeNote)}">⚠ catatan</em>` : ""}`;
                return `<td>${editable && item.id ? `<button class="role-cell ${item.overtime ? "has-overtime" : ""}" data-edit-schedule="${escapeHtml(item.id)}" title="Edit jadwal ${escapeHtml(name)}">${content}</button>` : `<div class="role-cell static ${item.overtime ? "has-overtime" : ""}">${content}</div>`}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${editable ? `<p class="matrix-tip">Klik sel jadwal untuk mengubah shift, role, lembur, catatan, atau menghapus jadwal.</p>` : ""}
  `;
}

function renderOvertimeHistory(allSchedules) {
  const items = allSchedules
    .filter(x => x.overtime)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 50);
  return `
    <article class="panel overtime-history-panel">
      <div class="panel-head"><div><span class="overline">OVERTIME</span><h3>History Lembur</h3></div><span class="count-pill">${items.length} record</span></div>
      ${items.length ? `<div class="overtime-history-list">${items.map(item => `
        <button class="overtime-history-row" data-edit-schedule="${escapeHtml(item.id)}">
          <div><strong>${escapeHtml(item.crewName)}</strong><span>${escapeHtml(formatDate(item.date))} · ${escapeHtml(item.shift)} · ${escapeHtml(item.role || "-")}</span></div>
          <div class="history-note"><strong>${escapeHtml(item.overtimeType || "Lembur")}</strong><span>${escapeHtml(item.overtimeNote || item.notes || "Tanpa catatan")}</span></div>
        </button>
      `).join("")}</div>` : emptyState("Belum ada history lembur.")}
    </article>
  `;
}

function openScheduleEditor(item, rules, selectedMonth) {
  document.querySelector("#schedule-editor-modal")?.remove();
  const crew = [...rules.maleNames, ...rules.femaleNames];
  const [year, month] = selectedMonth.split("-").map(Number);
  const fallbackDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const current = item || {
    id: "",
    date: fallbackDate,
    crewName: crew[0] || "",
    shift: "S1",
    role: "Kasir",
    notes: "",
    overtime: false,
    overtimeType: "Buka",
    overtimeNote: ""
  };

  const modal = document.createElement("div");
  modal.id = "schedule-editor-modal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="edit-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><span class="overline">ADMIN CRUD</span><h3>${item ? "Edit Jadwal" : "Tambah Jadwal"}</h3></div><button type="button" class="modal-close" aria-label="Tutup">×</button></div>
      <form id="schedule-edit-form" class="edit-form">
        <div class="edit-grid">
          <label>Tanggal<input name="date" type="date" value="${escapeHtml(current.date || fallbackDate)}" required /></label>
          <label>Crew<select name="crewName">${crew.map(name => `<option ${name === current.crewName ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
          <label>Shift<select name="shift"><option ${current.shift === "S1" ? "selected" : ""}>S1</option><option ${current.shift === "Middle" ? "selected" : ""}>Middle</option><option ${current.shift === "S2" ? "selected" : ""}>S2</option><option ${current.shift === "Libur" ? "selected" : ""}>Libur</option></select></label>
          <label>Role<select name="role" id="schedule-role"></select></label>
        </div>
        <label>Catatan jadwal<input name="notes" value="${escapeHtml(current.notes || "")}" placeholder="Opsional" /></label>
        <div class="overtime-editor">
          <label class="check-line"><input id="overtime-check" name="overtime" type="checkbox" ${current.overtime ? "checked" : ""} /> <span><strong>Tandai Lembur</strong><small>Memberi indikator kuning dan masuk ke History Lembur.</small></span></label>
          <div id="overtime-fields" class="edit-grid ${current.overtime ? "" : "hidden"}">
            <label>Jenis lembur<select name="overtimeType"><option ${current.overtimeType === "Buka" ? "selected" : ""}>Buka</option><option ${current.overtimeType === "Start 11–Tutup" ? "selected" : ""}>Start 11–Tutup</option><option ${current.overtimeType === "Lainnya" ? "selected" : ""}>Lainnya</option></select></label>
            <label>Catatan lembur<input id="overtime-note" name="overtimeNote" value="${escapeHtml(current.overtimeNote || "")}" placeholder="Kenapa lembur / menggantikan siapa" /></label>
          </div>
        </div>
        <div id="middle-rule-note" class="inline-rule hidden">Middle tidak boleh Kasir. Role hanya Bar atau Kitchen - Bar.</div>
        <div class="modal-actions">
          ${item?.id ? `<button type="button" id="delete-schedule" class="danger">Hapus Jadwal</button>` : `<span></span>`}
          <div><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan</button></div>
        </div>
      </form>
    </section>
  `;
  document.body.appendChild(modal);

  const form = modal.querySelector("#schedule-edit-form");
  const shiftSelect = form.elements.shift;
  const roleSelect = modal.querySelector("#schedule-role");
  const overtimeCheck = modal.querySelector("#overtime-check");
  const overtimeFields = modal.querySelector("#overtime-fields");
  const overtimeNote = modal.querySelector("#overtime-note");
  const middleNote = modal.querySelector("#middle-rule-note");

  const refreshRoleOptions = () => {
    const shift = shiftSelect.value;
    const options = shift === "Middle" ? ["Bar", "Kitchen - Bar"] : shift === "Libur" ? [""] : ["Kasir", "Bar", "Kitchen - Bar"];
    const desired = current.role || options[0] || "";
    roleSelect.innerHTML = options.map(role => `<option value="${escapeHtml(role)}" ${role === desired ? "selected" : ""}>${escapeHtml(role || "Tidak ada role")}</option>`).join("");
    roleSelect.disabled = shift === "Libur";
    middleNote.classList.toggle("hidden", shift !== "Middle");
    if (shift === "Libur") {
      overtimeCheck.checked = false;
      overtimeCheck.disabled = true;
      overtimeFields.classList.add("hidden");
    } else {
      overtimeCheck.disabled = false;
    }
  };
  refreshRoleOptions();

  shiftSelect.onchange = refreshRoleOptions;
  overtimeCheck.onchange = () => {
    overtimeFields.classList.toggle("hidden", !overtimeCheck.checked);
    if (overtimeNote) overtimeNote.required = overtimeCheck.checked;
  };
  if (overtimeNote) overtimeNote.required = overtimeCheck.checked;

  const close = () => modal.remove();
  modal.querySelector(".modal-close").onclick = close;
  modal.querySelector(".modal-cancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const shift = fd.get("shift");
    const role = shift === "Libur" ? "" : fd.get("role");
    if (shift === "Middle" && role === "Kasir") return alert("Middle tidak boleh Kasir.");
    if (overtimeCheck.checked && !String(fd.get("overtimeNote") || "").trim()) return alert("Catatan lembur wajib diisi.");
    const crewName = fd.get("crewName");
    const gender = rules.maleNames.includes(crewName) ? "Pria" : "Wanita";
    try {
      await saveSchedule({
        id: item?.id || undefined,
        date: fd.get("date"),
        crewName,
        gender,
        shift,
        role,
        notes: fd.get("notes"),
        overtime: overtimeCheck.checked,
        overtimeType: fd.get("overtimeType"),
        overtimeNote: fd.get("overtimeNote"),
        source: item?.source || "manual",
        generated: item?.generated === true
      });
      close();
    } catch (err) {
      alert(err?.message || friendlyError(err));
    }
  };

  modal.querySelector("#delete-schedule")?.addEventListener("click", async () => {
    if (!confirm(`Hapus jadwal ${current.crewName} tanggal ${current.date}?`)) return;
    await removeSchedule(current.id);
    close();
  });
}

function renderFairnessSummary(summary) {
  const shiftScore = Number(summary.fairnessScore || 0);
  const roleScore = Number(summary.roleFairnessScore ?? 0);
  const totalScore = Number(summary.overallFairnessScore ?? Math.round((shiftScore + roleScore) / 2));
  const roleByName = Object.fromEntries((summary.roleRows || []).map(r => [r.name, r]));
  return `
    <article class="panel fairness-panel">
      <div class="panel-head">
        <div><span class="overline">FAIRNESS ENGINE</span><h3>Pemerataan Shift & Role</h3></div>
        <div class="fairness-scores">
          <span class="mini-score">Shift <b>${shiftScore}/100</b></span>
          <span class="mini-score">Role <b>${roleScore}/100</b></span>
          <span class="score-pill">Total ${totalScore}/100</span>
        </div>
      </div>
      <div class="fairness-table-wrap">
        <table class="fairness-table">
          <thead><tr><th>Crew</th><th>S1</th><th>Mid</th><th>S2</th><th>Libur</th><th>Kasir</th><th>Bar</th><th>Kitchen-Bar</th></tr></thead>
          <tbody>
            ${summary.rows.map(r => {
              const role = roleByName[r.name] || {};
              return `<tr><td><strong>${escapeHtml(r.name)}</strong></td><td>${r.S1}</td><td>${r.Middle}</td><td>${r.S2}</td><td>${r.Libur}</td><td>${role.Kasir || 0}</td><td>${role.Bar || 0}</td><td>${role["Kitchen - Bar"] || 0}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <p class="matrix-tip">Generator menekan pengulangan role pada orang yang sama. Middle tetap hanya Bar / Kitchen-Bar dan tidak pernah Kasir.</p>
    </article>
  `;
}

function defaultScheduleMonth() {
  const now = new Date();
  if (now.getDate() > 25) now.setMonth(now.getMonth() + 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [y,m,d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function monthTitle(value) {
  const [y,m] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

function shortDate(value) {
  const date = parseLocalDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(date);
}

function dayNameFromDate(value) {
  const date = parseLocalDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(date);
}

function renderChecklist(target) {
  const admin = isAdmin(state.profile);
  const rules = normalizeRules(state.scheduleRules || DEFAULT_SCHEDULE_RULES);
  const selectedDate = state.checklistDate || localDateKey(new Date());
  state.checklistDate = selectedDate;
  const templates = state.checklist.map(normalizeChecklistTemplate).sort((a,b) => a.order - b.order || a.title.localeCompare(b.title, "id"));
  const activeTemplates = templates.filter(x => x.active !== false);
  const daySchedules = state.schedules.filter(x => x.date === selectedDate && x.shift !== "Libur");
  const assignments = buildDailyChecklistAssignments(activeTemplates, daySchedules);
  const completionMap = Object.fromEntries(state.checklistCompletions.filter(x => x.date === selectedDate).map(x => [x.templateId, x]));
  const completedCount = assignments.filter(x => completionMap[x.id]?.completed).length;
  const pct = assignments.length ? Math.round((completedCount / assignments.length) * 100) : 0;
  const crew = [...rules.maleNames, ...rules.femaleNames];

  const group = shift => assignments.filter(x => x.shift === shift);
  const sections = [
    ["S1", "SHIFT 1", group("S1")],
    ["Middle", "MIDDLE", group("Middle")],
    ["S2", "SHIFT 2", group("S2")],
    ["All", "GENERAL", group("All")]
  ].filter(([, , rows]) => rows.length);

  target.innerHTML = `
    <section class="page-intro">
      <div><span class="overline">DAILY CONTROL</span><h1>Daily Checklist</h1><p>Task per shift otomatis ditugaskan ke crew berdasarkan jadwal dan role hari itu.</p></div>
      ${admin ? `<span class="access-tag">CRUD + Status</span>` : `<span class="access-tag read">Read only</span>`}
    </section>

    <article class="panel daily-check-panel">
      <div class="daily-check-head">
        <div>
          <span class="overline">DAILY VIEW</span>
          <h3>${escapeHtml(formatDate(selectedDate))}</h3>
          <p>${daySchedules.length ? `${daySchedules.length} crew bekerja · assignment dibaca dari jadwal` : "Belum ada jadwal kerja pada tanggal ini."}</p>
        </div>
        <label class="date-control">Tanggal<input id="checklist-date" type="date" value="${escapeHtml(selectedDate)}" /></label>
      </div>
      <div class="check-progress-row">
        <div class="check-progress-track"><span style="width:${pct}%"></span></div>
        <strong>${completedCount}/${assignments.length} selesai · ${pct}%</strong>
      </div>
      ${!daySchedules.length ? `<div class="validation-box warning"><strong>Jadwal belum tersedia</strong><span>Generate / isi jadwal tanggal ini dulu supaya assignment checklist bisa menentukan crew.</span></div>` : ""}
    </article>

    <div class="daily-shift-grid">
      ${sections.length ? sections.map(([shift, title, rows]) => renderDailyChecklistSection(shift, title, rows, completionMap, admin)).join("") : `
        <article class="panel">${emptyState("Belum ada template checklist aktif.")}</article>
      `}
    </div>

    ${admin ? `
      <article class="panel template-manager-panel">
        <div class="panel-head">
          <div><span class="overline">TEMPLATE MANAGER</span><h3>Atur Checklist</h3><p class="muted small-copy">Template dibuat sekali. Assignment orangnya berubah otomatis mengikuti jadwal harian.</p></div>
          <div class="table-actions"><button id="import-checklist" class="secondary compact">Import Excel</button><button id="export-checklist" class="secondary compact">Export Excel</button><button id="add-check-template" class="primary compact">+ Tambah Task</button></div>
        </div>
        <div class="template-list">
          ${templates.length ? templates.map(item => `
            <div class="template-row ${item.active === false ? "is-inactive" : ""}">
              <div class="template-order">${item.order}</div>
              <div class="grow"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.shift)} · ${escapeHtml(checklistAssignmentLabel(item))}${item.active === false ? " · Nonaktif" : ""}</span></div>
              <div class="template-actions"><button class="secondary small" data-edit-check="${escapeHtml(item.id)}">Edit</button><button class="danger small" data-delete-check="${escapeHtml(item.id)}">Hapus</button></div>
            </div>
          `).join("") : emptyState("Belum ada template checklist.")}
        </div>
      </article>
    ` : `<div class="notice"><strong>Mode Viewer</strong><span>Viewer hanya dapat melihat assignment dan status checklist. Perubahan hanya dapat dilakukan Admin.</span></div>`}
  `;

  document.querySelector("#checklist-date")?.addEventListener("change", e => {
    state.checklistDate = e.target.value;
    renderShell();
  });

  if (admin) {
    document.querySelector("#import-checklist")?.addEventListener("click", () => runExcelImport("checklist"));
    document.querySelector("#export-checklist")?.addEventListener("click", () => exportChecklistWorkbook({ templates: state.checklist, completions: state.checklistCompletions, filename: `SoWork-Checklist-${selectedDate}.xlsx` }));
    document.querySelector("#add-check-template")?.addEventListener("click", () => openChecklistEditor(null, rules));
    document.querySelectorAll("[data-edit-check]").forEach(btn => {
      btn.onclick = () => {
        const item = state.checklist.find(x => x.id === btn.dataset.editCheck);
        if (item) openChecklistEditor(item, rules);
      };
    });
    document.querySelectorAll("[data-delete-check]").forEach(btn => {
      btn.onclick = async () => {
        const item = state.checklist.find(x => x.id === btn.dataset.deleteCheck);
        if (!item || !confirm(`Hapus template “${item.title}”?`)) return;
        await removeChecklistItem(item.id);
      };
    });
    document.querySelectorAll("[data-toggle-check]").forEach(btn => {
      btn.onclick = async () => {
        const assignment = assignments.find(x => x.id === btn.dataset.toggleCheck);
        if (!assignment) return;
        const current = completionMap[assignment.id];
        await saveChecklistCompletion({
          date: selectedDate,
          templateId: assignment.id,
          title: assignment.title,
          shift: assignment.shift,
          assignedCrew: assignment.assignedCrew,
          assignedRole: assignment.assignedRole,
          completed: !Boolean(current?.completed),
          updatedByUid: state.user?.uid || "",
          updatedByName: state.profile?.name || state.user?.email || "Admin"
        });
      };
    });
  }
}

function normalizeChecklistTemplate(item = {}) {
  const legacy = String(item.section || "").toUpperCase();
  const legacyShift = legacy === "OPENING" ? "S1" : legacy === "MIDDLE" ? "Middle" : legacy === "CLOSING" ? "S2" : legacy === "GENERAL" ? "All" : "";
  return {
    ...item,
    title: String(item.title || "Untitled task"),
    shift: item.shift || legacyShift || "S1",
    assignmentType: item.assignmentType || "Role",
    requiredRole: item.requiredRole || "Bar",
    specificCrew: item.specificCrew || "",
    order: Number(item.order || 0),
    active: item.active !== false
  };
}

function checklistAssignmentLabel(item) {
  if (item.assignmentType === "Specific Crew") return `Crew: ${item.specificCrew || "-"}`;
  if (item.assignmentType === "Any") return "Siapa saja di shift";
  return `Role: ${item.requiredRole || "-"}`;
}

function buildDailyChecklistAssignments(templates, daySchedules) {
  const load = {};
  const working = daySchedules.slice();
  const sorted = templates.slice().sort((a,b) => a.order - b.order || a.title.localeCompare(b.title, "id"));

  return sorted.map(template => {
    const candidatesByShift = template.shift === "All" ? working : working.filter(s => s.shift === template.shift);
    let candidates = candidatesByShift.slice();
    let warning = "";

    if (template.assignmentType === "Role") {
      candidates = candidates.filter(s => s.role === template.requiredRole);
      if (!candidates.length) warning = `Tidak ada ${template.requiredRole} pada ${template.shift === "All" ? "jadwal hari ini" : template.shift}.`;
    } else if (template.assignmentType === "Specific Crew") {
      candidates = candidates.filter(s => s.crewName === template.specificCrew);
      if (!candidates.length) warning = `${template.specificCrew || "Crew"} tidak tersedia pada ${template.shift === "All" ? "hari ini" : template.shift}.`;
    } else if (!candidates.length) {
      warning = `Tidak ada crew pada ${template.shift === "All" ? "jadwal hari ini" : template.shift}.`;
    }

    candidates.sort((a,b) => Number(load[a.crewName] || 0) - Number(load[b.crewName] || 0) || a.crewName.localeCompare(b.crewName, "id"));
    const picked = candidates[0] || null;
    if (picked) load[picked.crewName] = Number(load[picked.crewName] || 0) + 1;

    return {
      ...template,
      assignedCrew: picked?.crewName || "",
      assignedRole: picked?.role || (template.assignmentType === "Role" ? template.requiredRole : ""),
      warning
    };
  });
}

function renderDailyChecklistSection(shift, title, rows, completionMap, admin) {
  const done = rows.filter(x => completionMap[x.id]?.completed).length;
  return `
    <article class="panel daily-shift-card">
      <div class="daily-shift-head"><div><span class="shift-chip ${shiftClass(shift)}">${escapeHtml(title)}</span><strong>${done}/${rows.length}</strong></div></div>
      <div class="daily-task-list">
        ${rows.map(item => {
          const completion = completionMap[item.id];
          const completed = Boolean(completion?.completed);
          const assignment = item.assignedCrew
            ? `<span class="assignment-person"><b>${escapeHtml(item.assignedCrew)}</b><small>${escapeHtml(item.assignedRole || "Any")}</small></span>`
            : `<span class="assignment-warning">⚠ ${escapeHtml(item.warning || "Belum ter-assign")}</span>`;
          return `
            <div class="daily-task ${completed ? "is-done" : ""}">
              ${admin ? `<button class="daily-check-toggle ${completed ? "checked" : ""}" data-toggle-check="${escapeHtml(item.id)}" aria-label="${completed ? "Batalkan" : "Tandai"} selesai">${completed ? "✓" : ""}</button>` : `<span class="daily-check-toggle static ${completed ? "checked" : ""}">${completed ? "✓" : ""}</span>`}
              <div class="grow"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(checklistAssignmentLabel(item))}</small></div>
              ${assignment}
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function openChecklistEditor(rawItem, rules) {
  document.querySelector("#checklist-editor-modal")?.remove();
  const crew = [...rules.maleNames, ...rules.femaleNames];
  const item = rawItem ? normalizeChecklistTemplate(rawItem) : {
    id: "", title: "", shift: "S1", assignmentType: "Role", requiredRole: "Kasir", specificCrew: crew[0] || "", order: state.checklist.length + 1, active: true
  };
  const modal = document.createElement("div");
  modal.id = "checklist-editor-modal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="edit-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><span class="overline">CHECKLIST CRUD</span><h3>${rawItem ? "Edit Task" : "Tambah Task"}</h3></div><button type="button" class="modal-close">×</button></div>
      <form id="check-template-form" class="edit-form">
        <label>Nama task<input name="title" value="${escapeHtml(item.title)}" placeholder="Contoh: Cek cash drawer" required /></label>
        <div class="edit-grid">
          <label>Shift<select name="shift"><option ${item.shift === "S1" ? "selected" : ""}>S1</option><option ${item.shift === "Middle" ? "selected" : ""}>Middle</option><option ${item.shift === "S2" ? "selected" : ""}>S2</option><option value="All" ${item.shift === "All" ? "selected" : ""}>Semua / General</option></select></label>
          <label>Assignment<select name="assignmentType"><option ${item.assignmentType === "Role" ? "selected" : ""}>Role</option><option ${item.assignmentType === "Any" ? "selected" : ""}>Any</option><option ${item.assignmentType === "Specific Crew" ? "selected" : ""}>Specific Crew</option></select></label>
          <label id="required-role-field">Role<select name="requiredRole"></select></label>
          <label id="specific-crew-field">Crew<select name="specificCrew">${crew.map(name => `<option ${name === item.specificCrew ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
          <label>Urutan<input name="order" type="number" value="${item.order}" /></label>
          <label class="check-line simple"><input name="active" type="checkbox" ${item.active ? "checked" : ""} /> <span>Aktif</span></label>
        </div>
        <div id="checklist-middle-note" class="inline-rule hidden">Middle tidak boleh diarahkan ke Kasir.</div>
        <div class="modal-actions"><span></span><div><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan</button></div></div>
      </form>
    </section>`;
  document.body.appendChild(modal);

  const form = modal.querySelector("#check-template-form");
  const shift = form.elements.shift;
  const type = form.elements.assignmentType;
  const role = form.elements.requiredRole;
  const roleField = modal.querySelector("#required-role-field");
  const crewField = modal.querySelector("#specific-crew-field");
  const note = modal.querySelector("#checklist-middle-note");

  const refresh = () => {
    const roleOptions = shift.value === "Middle" ? ["Bar", "Kitchen - Bar"] : ["Kasir", "Bar", "Kitchen - Bar"];
    const desired = roleOptions.includes(item.requiredRole) ? item.requiredRole : roleOptions[0];
    role.innerHTML = roleOptions.map(x => `<option ${x === desired ? "selected" : ""}>${escapeHtml(x)}</option>`).join("");
    roleField.classList.toggle("hidden", type.value !== "Role");
    crewField.classList.toggle("hidden", type.value !== "Specific Crew");
    note.classList.toggle("hidden", !(shift.value === "Middle" && type.value === "Role"));
  };
  refresh();
  shift.onchange = refresh;
  type.onchange = refresh;

  const close = () => modal.remove();
  modal.querySelector(".modal-close").onclick = close;
  modal.querySelector(".modal-cancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form);
    if (fd.get("shift") === "Middle" && fd.get("assignmentType") === "Role" && fd.get("requiredRole") === "Kasir") return alert("Middle tidak boleh Kasir.");
    try {
      await saveChecklistItem({
        id: rawItem?.id,
        title: fd.get("title"),
        shift: fd.get("shift"),
        assignmentType: fd.get("assignmentType"),
        requiredRole: fd.get("requiredRole"),
        specificCrew: fd.get("specificCrew"),
        order: fd.get("order"),
        active: form.elements.active.checked
      });
      close();
    } catch (err) {
      alert(err?.message || friendlyError(err));
    }
  };
}


function renderStock(target) {
  const admin = isAdmin(state.profile);
  if (!admin) return renderPlaceholder(target);

  const analytics = buildStockAnalytics(state.stockItems, state.stockOpnames, state.stockMovements);
  const alerts = stockAlertRows(analytics);
  const criticalCount = analytics.filter(x => x.status === "Kritis").length;
  const lowCount = analytics.filter(x => x.status === "Menipis").length;
  const fastCount = analytics.filter(x => x.velocity === "Fast").length;
  const query = String(state.stockSearch || "").trim().toLowerCase();
  const status = state.stockStatusFilter || "Semua";
  const filtered = analytics.filter(item => {
    const matchQuery = !query || item.name.toLowerCase().includes(query) || String(item.category || "").toLowerCase().includes(query);
    const matchStatus = status === "Semua" || item.status === status || item.velocity === status;
    return matchQuery && matchStatus;
  });
  const deliveries = state.stockMovements.filter(x => x.type === "IN").slice(0, 18);
  const usageRows = state.stockMovements.filter(x => x.type === "OUT");
  const usageDates = [...new Set(usageRows.map(x=>x.date).filter(Boolean))].sort().reverse();

  target.innerHTML = `
    <section class="page-intro">
      <div><span class="overline">INVENTORY CONTROL</span><h1>Stock</h1><p>Master barang, stok terkini, barang masuk, laju pemakaian, dan indikator stok kritis dalam satu tempat.</p></div>
      <span class="access-tag">ADMIN ONLY</span>
    </section>

    ${!state.stockItems.length ? `
      <article class="panel stock-import-card">
        <div>
          <span class="overline">REFERENSI DATA</span>
          <h3>Master Stock masih kosong</h3>
          <p>Import referensi dari <strong>Laporan SO Agustus.xlsx</strong> untuk membuat master barang dan histori snapshot awal. Setelah itu semua nama dan parameter tetap bisa di-CRUD.</p>
        </div>
        <button id="seed-stock-reference" class="primary">Muat Referensi SO Agustus</button>
      </article>
    ` : ""}

    <div class="metric-grid stock-metrics">
      <article class="metric-card"><span class="metric-label">Master aktif</span><strong>${analytics.length}</strong><small>item stock</small></article>
      <article class="metric-card ${criticalCount ? "metric-alert" : ""}"><span class="metric-label">Kritis</span><strong>${criticalCount}</strong><small>perlu tindakan cepat</small></article>
      <article class="metric-card"><span class="metric-label">Menipis</span><strong>${lowCount}</strong><small>mendekati reorder</small></article>
      <article class="metric-card"><span class="metric-label">Fast moving</span><strong>${fastCount}</strong><small>laju keluar cepat</small></article>
    </div>

    ${alerts.length ? `
      <article class="panel stock-alert-panel">
        <div class="panel-head">
          <div><span class="overline">ACTION REQUIRED</span><h3>Stock Alert</h3><p class="muted small-copy">Prioritas berdasarkan threshold stok dan estimasi days of cover.</p></div>
          <button id="send-stock-wa" class="secondary">Kirim Alert ke WhatsApp</button>
        </div>
        <div class="alert-chip-list">
          ${alerts.slice(0, 12).map(item => `<button class="alert-chip ${stockStatusClass(item.status)}" data-edit-stock="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${formatQty(item.currentQty)} ${escapeHtml(item.unit)} · ${escapeHtml(item.status)}</span></button>`).join("")}
        </div>
      </article>
    ` : ""}

    <article class="panel stock-master-panel">
      <div class="panel-head stock-panel-head">
        <div><span class="overline">MASTER & MONITORING</span><h3>Daftar Stock</h3></div>
        <div class="table-actions">
          <button id="stock-settings" class="secondary compact">Alert Bot</button>
          <button id="import-stock" class="secondary compact">Import Excel</button>
          <button id="export-stock" class="secondary compact">Export Excel</button>
          <button id="add-stock-receipt" class="secondary compact">+ Barang Masuk</button>
          <button id="add-stock-usage" class="secondary compact">− Penggunaan Harian</button>
          <button id="add-stock-item" class="primary compact">+ Barang</button>
        </div>
      </div>

      <div class="stock-filters">
        <label class="search-control">Cari barang<input id="stock-search" value="${escapeHtml(state.stockSearch || "")}" placeholder="Nama / kategori..." /></label>
        <label>Status<select id="stock-status-filter">
          ${["Semua","Kritis","Menipis","Aman","Fast","Medium","Slow"].map(x => `<option ${x === status ? "selected" : ""}>${x}</option>`).join("")}
        </select></label>
      </div>

      <div class="stock-table-wrap">
        <table class="stock-table">
          <thead><tr><th>Barang</th><th>Stok</th><th>Status</th><th>Pemakaian</th><th>Prediksi</th><th>Saran Order</th><th></th></tr></thead>
          <tbody>
            ${filtered.length ? filtered.map(item => `
              <tr>
                <td>
                  <div class="stock-name-cell">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${escapeHtml(item.category || "Bahan")}${item.cartonSize ? ` · 1 karton = ${formatQty(item.cartonSize)} ${escapeHtml(item.unit)}` : ""}</span>
                    ${item.criticalItem ? `<span class="critical-label">● Item krusial</span>` : ""}
                  </div>
                </td>
                <td>
                  <strong class="stock-main-qty">${escapeHtml(formatQtyWithCarton(item.currentQty, item))}</strong>
                  <small class="block">${formatQty(item.currentQty)} ${escapeHtml(item.unit)}</small>
                </td>
                <td>
                  <span class="stock-status ${stockStatusClass(item.status)}">${escapeHtml(item.status)}</span>
                  <small class="block threshold-copy">Kritis ≤ ${formatQty(item.criticalThreshold || 0)} · Menipis ≤ ${formatQty(item.lowThreshold || 0)}</small>
                </td>
                <td>
                  <span class="velocity-badge ${velocityClass(item.velocity)}">${escapeHtml(item.velocity)}</span>
                  <small class="block">${item.avgDailyUsage > 0 ? `${formatQty(item.avgDailyUsage)} ${escapeHtml(item.unit)}/hari` : "Belum cukup data"}${item.usageSource === "daily-usage" ? `<br><em>${item.usageDays} hari input nyata</em>` : item.historyCount ? `<br><em>estimasi dari SO</em>` : ""}</small>
                </td>
                <td>
                  ${item.predictedOutDate ? `
                    <div class="prediction-cell">
                      <strong>Habis ~ ${escapeHtml(formatDate(item.predictedOutDate))}</strong>
                      <span>${Number.isFinite(item.daysCover) ? `${item.daysCover.toFixed(1)} hari lagi` : ""}</span>
                      <small>Order: ${item.orderDueNow ? "Hari ini" : escapeHtml(formatDate(item.recommendedOrderDate))}</small>
                      <em>${escapeHtml(item.predictionConfidence)} · ${item.historyCount} snapshot</em>
                    </div>
                  ` : `<div class="prediction-cell muted"><strong>Belum ada prediksi</strong><span>${item.historyCount || 0} snapshot SO</span><small>Minimal 2 snapshot berbeda tanggal</small></div>`}
                </td>
                <td>
                  ${item.recommendedQty > 0
                    ? `<strong>${escapeHtml(formatQtyWithCarton(item.recommendedQty, item))}</strong><small class="block">${formatQty(item.recommendedQty)} ${escapeHtml(item.unit)}</small>`
                    : `<span class="muted">Belum perlu</span>`}
                </td>
                <td><button class="secondary small stock-edit-btn" data-edit-stock="${escapeHtml(item.id)}">Edit Barang</button></td>
              </tr>
            `).join("") : `<tr><td colspan="7">${emptyState("Tidak ada barang sesuai filter.")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </article>

    <article class="panel delivery-history-panel">
      <div class="panel-head"><div><span class="overline">INBOUND</span><h3>Barang Masuk Terbaru</h3></div><span class="count-pill">${state.stockMovements.filter(x => x.type === "IN").length} kiriman</span></div>
      ${deliveries.length ? `<div class="delivery-list">${deliveries.map(row => `
        <div class="delivery-row">
          <div><strong>${escapeHtml(row.itemName || stockItemName(row.itemId))}</strong><span>${escapeHtml(formatDate(row.date))} · ${escapeHtml(formatMovementQty(row))}</span></div>
          <div class="history-note"><strong>${escapeHtml(row.destination || "Gudang Utama")}</strong><span>${escapeHtml(row.supplier || row.note || "Tanpa catatan")}</span></div>
        </div>
      `).join("")}</div>` : emptyState("Belum ada histori barang masuk.")}
    </article>

    <article class="panel stock-usage-history-panel">
      <div class="panel-head">
        <div><span class="overline">DAILY CONSUMPTION</span><h3>Penggunaan Barang Harian</h3><p class="muted small-copy">Input setiap tanggal mengurangi stok sistem dan langsung dipakai untuk prediksi reorder.</p></div>
        <button id="open-usage-today" class="primary compact">Input Hari Ini</button>
      </div>
      ${usageDates.length ? `<div class="usage-date-list">${usageDates.slice(0,10).map(dateKey => {
        const rows=usageRows.filter(x=>x.date===dateKey);
        const used=rows.filter(x=>Number(x.qty||0)>0);
        return `<button class="usage-date-row" data-open-usage-date="${escapeHtml(dateKey)}"><span><strong>${escapeHtml(formatDate(dateKey))}</strong><small>${used.length} item digunakan · ${rows.length} item tercatat</small></span><b>Edit</b></button>`;
      }).join("")}</div>` : emptyState("Belum ada penggunaan harian. Mulai input hari ini agar stok sistem dan prediksi jadi akurat.")}
    </article>
  `;

  document.querySelector("#seed-stock-reference")?.addEventListener("click", async () => {
    if (!confirm("Import referensi SO Agustus ke Firestore? Lakukan hanya saat master stock masih kosong.")) return;
    const btn = document.querySelector("#seed-stock-reference");
    btn.disabled = true; btn.textContent = "Mengimport...";
    try { await seedStockReference(); }
    catch (err) { alert(err?.message || friendlyError(err)); btn.disabled = false; btn.textContent = "Muat Referensi SO Agustus"; }
  });

  document.querySelector("#stock-search")?.addEventListener("input", e => {
    state.stockSearch = e.target.value;
    renderStock(target);
  });
  document.querySelector("#stock-status-filter")?.addEventListener("change", e => {
    state.stockStatusFilter = e.target.value;
    renderStock(target);
  });
  document.querySelector("#import-stock")?.addEventListener("click", () => openStockImportChoice());
  document.querySelector("#export-stock")?.addEventListener("click", () => exportStockWorkbook({ items: state.stockItems, movements: state.stockMovements, opnames: state.stockOpnames, analytics, filename: `SoWork-Stock-${localDateKey(new Date())}.xlsx` }));
  document.querySelector("#add-stock-item")?.addEventListener("click", () => openStockItemEditor(null));
  document.querySelector("#add-stock-receipt")?.addEventListener("click", () => openStockReceiptEditor());
  document.querySelector("#add-stock-usage")?.addEventListener("click", () => openDailyStockUsageEditor(localDateKey(new Date())));
  document.querySelector("#open-usage-today")?.addEventListener("click", () => openDailyStockUsageEditor(localDateKey(new Date())));
  document.querySelectorAll("[data-open-usage-date]").forEach(btn => btn.onclick = () => openDailyStockUsageEditor(btn.dataset.openUsageDate));
  document.querySelector("#stock-settings")?.addEventListener("click", () => openStockSettingsEditor());
  document.querySelector("#send-stock-wa")?.addEventListener("click", () => sendStockWhatsapp(alerts));
  document.querySelectorAll("[data-edit-stock]").forEach(btn => {
    btn.onclick = () => {
      const item = state.stockItems.find(x => x.id === btn.dataset.editStock);
      if (item) openStockItemEditor(item);
    };
  });
}

function renderStockOpname(target) {
  const admin = isAdmin(state.profile);
  if (!admin) return renderPlaceholder(target);

  const date = state.opnameDate || localDateKey(new Date());
  state.opnameDate = date;
  const search = String(state.opnameSearch || "").toLowerCase().trim();
  const allItems = state.stockItems
    .filter(x => x.active !== false)
    .slice()
    .sort((a,b) => String(a.name).localeCompare(String(b.name), "id"));
  const items = allItems.filter(item =>
    !search ||
    String(item.name || "").toLowerCase().includes(search) ||
    String(item.category || "").toLowerCase().includes(search)
  );
  const existing = Object.fromEntries(
    state.stockOpnames.filter(x => x.date === date).map(x => [x.itemId, x])
  );
  const reconciliationRows = buildStockReconciliation(allItems, state.stockOpnames, state.stockMovements, date);
  const reconciliationByItem = Object.fromEntries(reconciliationRows.map(x=>[x.id,x]));
  const savedRecon = reconciliationRows.filter(x=>x.physicalQty!=null);
  const shortageCount = savedRecon.filter(x=>x.reconciliationStatus==="Selisih Kurang").length;
  const overCount = savedRecon.filter(x=>x.reconciliationStatus==="Selisih Lebih").length;
  const matchedCount = savedRecon.filter(x=>x.reconciliationStatus==="Sesuai").length;

  target.innerHTML = `
    <section class="page-intro stock-opname-intro">
      <div>
        <span class="overline">STOCK OPNAME</span>
        <h1>Hitung stok tanpa ribet.</h1>
        <p>Isi stok fisik per lokasi. SoWork membandingkannya dengan stok sistem: <b>SO sebelumnya + barang masuk − penggunaan harian</b>. Selisih akhir bulan jadi alat kontrol kehilangan, salah input, atau pemakaian yang belum tercatat.</p>
      </div>
      <div class="action-row"><button id="import-opname" class="secondary">Import Excel</button><button id="export-opname" class="secondary">Export Excel</button><button id="opname-add-item" class="primary">+ Barang Baru</button></div>
    </section>

    <article class="panel opname-toolbar">
      <div class="opname-toolbar-main">
        <label class="opname-date-control">
          <span>Tanggal SO</span>
          <input id="opname-date" type="date" value="${escapeHtml(date)}" />
        </label>
        <label class="search-control opname-search">
          <span>Cari barang</span>
          <input id="opname-search" value="${escapeHtml(state.opnameSearch || "")}" placeholder="Gula, cup, yoghurt..." />
        </label>
      </div>
      <div class="opname-summary">
        <strong>${items.length}</strong>
        <span>dari ${allItems.length} barang</span>
      </div>
    </article>

    <div class="metric-grid reconciliation-metrics">
      <article class="metric-card"><span class="metric-label">Sesuai</span><strong>${matchedCount}</strong><small>fisik ≈ sistem</small></article>
      <article class="metric-card ${shortageCount?"metric-alert":""}"><span class="metric-label">Selisih Kurang</span><strong>${shortageCount}</strong><small>fisik lebih sedikit</small></article>
      <article class="metric-card"><span class="metric-label">Selisih Lebih</span><strong>${overCount}</strong><small>fisik lebih banyak</small></article>
      <article class="metric-card"><span class="metric-label">Rekonsiliasi</span><strong>${savedRecon.length}</strong><small>item sudah punya hasil SO</small></article>
    </div>

    <form id="opname-form">
      <div class="opname-list">
        ${items.length ? items.map(item => {
          const row = existing[item.id] || {};
          const q1 = row.primaryQty ?? item.lastPrimaryQty ?? item.currentQty ?? 0;
          const q2 = row.secondaryQty ?? item.lastSecondaryQty ?? 0;
          const total = Number(q1 || 0) + Number(q2 || 0);
          const theoretical = calculateTheoreticalStock(item, date, state.stockOpnames, state.stockMovements);
          const systemQty = row.systemQtyBeforeOpname ?? theoretical.systemQty;
          const diff = total - Number(systemQty || 0);
          const diffClass = Math.abs(diff) <= Math.max(0.01, Number(systemQty||0)*0.0025) ? "safe" : diff < 0 ? "critical" : "low";
          return `
            <article class="opname-item-card" data-opname-row="${escapeHtml(item.id)}">
              <div class="opname-item-head">
                <div class="opname-item-title">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>${escapeHtml(item.category || "Bahan")} · ${escapeHtml(item.unit || "PCS")}${item.cartonSize ? ` · 1 karton = ${formatQty(item.cartonSize)} ${escapeHtml(item.unit || "PCS")}` : ""}</span>
                </div>
                <div class="opname-item-actions">
                  ${item.criticalItem ? `<span class="stock-status critical">Krusial</span>` : ""}
                  <button type="button" class="secondary small" data-edit-opname-item="${escapeHtml(item.id)}">Edit Master</button>
                </div>
              </div>

              <div class="opname-entry-grid">
                <label>
                  <span>Lokasi 1</span>
                  <input name="loc1_${escapeHtml(item.id)}" value="${escapeHtml(row.primaryLocation || item.primaryLocation || "Gudang Utama")}" />
                </label>
                <label>
                  <span>Jumlah</span>
                  <input class="qty-input" name="q1_${escapeHtml(item.id)}" type="number" min="0" step="0.01" value="${Number(q1 || 0)}" />
                </label>
                <label>
                  <span>Lokasi 2</span>
                  <input name="loc2_${escapeHtml(item.id)}" value="${escapeHtml(row.secondaryLocation || item.secondaryLocation || "Gudang 2")}" />
                </label>
                <label>
                  <span>Jumlah</span>
                  <input class="qty-input" name="q2_${escapeHtml(item.id)}" type="number" min="0" step="0.01" value="${Number(q2 || 0)}" />
                </label>
              </div>

              <div class="opname-result-bar">
                <div>
                  <span>Total aktual</span>
                  <strong data-total-for="${escapeHtml(item.id)}">${escapeHtml(formatQtyWithCarton(total, item))}</strong>
                  <small data-total-base-for="${escapeHtml(item.id)}">${formatQty(total)} ${escapeHtml(item.unit || "PCS")}</small>
                </div>
                <div class="opname-system-compare">
                  <span>Stok sistem <b>${formatQty(systemQty)} ${escapeHtml(item.unit||"PCS")}</b></span>
                  <span>Selisih <b class="stock-status ${diffClass}" data-diff-for="${escapeHtml(item.id)}">${diff>0?"+":""}${formatQty(diff)} ${escapeHtml(item.unit||"PCS")}</b></span>
                </div>
                <div class="opname-thresholds">
                  <span>Kritis ≤ <b>${formatQty(item.criticalThreshold || 0)}</b></span>
                  <span>Menipis ≤ <b>${formatQty(item.lowThreshold || 0)}</b></span>
                </div>
              </div>
            </article>`;
        }).join("") : emptyState("Barang tidak ditemukan.")}
      </div>

      ${items.length ? `
        <div class="sticky-save-bar">
          <div>
            <strong>SO ${escapeHtml(formatDate(date))}</strong>
            <span>${items.length} barang akan disimpan</span>
          </div>
          <button class="primary">Simpan Stock Opname</button>
        </div>
      ` : ""}
    </form>
  `;

  document.querySelector("#opname-date")?.addEventListener("change", e => {
    state.opnameDate = e.target.value;
    renderShell();
  });

  document.querySelector("#opname-search")?.addEventListener("input", e => {
    state.opnameSearch = e.target.value;
    renderStockOpname(target);
  });

  document.querySelector("#import-opname")?.addEventListener("click", () => runExcelImport("opname"));
  document.querySelector("#export-opname")?.addEventListener("click", () => exportStockOpnameWorkbook({ items: state.stockItems, opnames: state.stockOpnames, movements: state.stockMovements, filename: `SoWork-Stock-Opname-${date}.xlsx` }));
  document.querySelector("#opname-add-item")?.addEventListener("click", () => openStockItemEditor(null));

  document.querySelectorAll("[data-edit-opname-item]").forEach(btn => {
    btn.onclick = () => {
      const item = state.stockItems.find(x => x.id === btn.dataset.editOpnameItem);
      if (item) openStockItemEditor(item);
    };
  });

  document.querySelectorAll(".qty-input").forEach(input => {
    input.addEventListener("input", () => {
      const row = input.closest("[data-opname-row]");
      const id = row?.dataset.opnameRow;
      if (!id) return;
      const q1 = Number(row.querySelector(`[name="q1_${CSS.escape(id)}"]`)?.value || 0);
      const q2 = Number(row.querySelector(`[name="q2_${CSS.escape(id)}"]`)?.value || 0);
      const total = row.querySelector(`[data-total-for="${CSS.escape(id)}"]`);
      const totalBase = row.querySelector(`[data-total-base-for="${CSS.escape(id)}"]`);
      const item = state.stockItems.find(x => x.id === id);
      if (total) total.textContent = formatQtyWithCarton(q1 + q2, item);
      if (totalBase) totalBase.textContent = `${formatQty(q1 + q2)} ${item?.unit || "PCS"}`;
      const diffEl=row.querySelector(`[data-diff-for="${CSS.escape(id)}"]`);
      const theo=calculateTheoreticalStock(item,state.opnameDate||localDateKey(new Date()),state.stockOpnames,state.stockMovements);
      const saved=existing[id];
      const sys=Number(saved?.systemQtyBeforeOpname ?? theo.systemQty ?? 0);
      const diff=(q1+q2)-sys;
      if(diffEl){diffEl.textContent=`${diff>0?"+":""}${formatQty(diff)} ${item?.unit||"PCS"}`;diffEl.className=`stock-status ${Math.abs(diff)<=Math.max(0.01,sys*0.0025)?"safe":diff<0?"critical":"low"}`;}
    });
  });

  document.querySelector("#opname-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!items.length) return;
    const fd = new FormData(e.currentTarget);
    const rows = items.map(item => ({
      itemId: item.id,
      itemName: item.name,
      primaryLocation: fd.get(`loc1_${item.id}`),
      primaryQty: fd.get(`q1_${item.id}`),
      secondaryLocation: fd.get(`loc2_${item.id}`),
      secondaryQty: fd.get(`q2_${item.id}`),
      unit: item.unit,
      ...(() => {
        const physical = Number(fd.get(`q1_${item.id}`)||0) + Number(fd.get(`q2_${item.id}`)||0);
        const t = calculateTheoreticalStock(item, date, state.stockOpnames, state.stockMovements);
        const saved = existing[item.id];
        const systemQty = Number(saved?.systemQtyBeforeOpname ?? t.systemQty ?? item.currentQty ?? 0);
        const varianceQty = physical - systemQty;
        const variancePct = systemQty > 0 ? (varianceQty/systemQty)*100 : null;
        const accuracyPct = systemQty > 0 ? Math.max(0,100-(Math.abs(varianceQty)/systemQty*100)) : (physical===0?100:0);
        const tol=Math.max(0.01,systemQty*0.0025);
        return {systemQtyBeforeOpname:systemQty,varianceQty,variancePct,accuracyPct,reconciliationStatus:Math.abs(varianceQty)<=tol?"Sesuai":varianceQty<0?"Selisih Kurang":"Selisih Lebih",previousOpnameDate:t.previousOpnameDate,incomingSincePrevious:t.incoming,usageSincePrevious:t.usage};
      })()
    }));

    if (!confirm(`Simpan Stock Opname ${formatDate(date)} untuk ${rows.length} barang? Setelah tersimpan, stok sistem dikoreksi ke stok fisik dan selisih rekonsiliasi disimpan.`)) return;

    try {
      await saveStockOpname(date, rows, {
        uid: state.user?.uid,
        name: state.profile?.name || state.user?.email
      });
      alert("Stock Opname berhasil disimpan. Selisih fisik vs sistem tercatat dan stok sistem sudah dikoreksi ke stok fisik.");
    } catch (err) {
      alert(err?.message || friendlyError(err));
    }
  });
}

function renderOrderPlanner(target) {
  const admin = isAdmin(state.profile);
  if (!admin) return renderPlaceholder(target);
  const analytics = buildStockAnalytics(state.stockItems, state.stockOpnames, state.stockMovements);
  const recommended = analytics.filter(x => x.recommendedQty > 0 || x.status !== "Aman");

  target.innerHTML = `
    <section class="page-intro">
      <div><span class="overline">SMART REORDER</span><h1>Order Planner</h1><p>Setelah minimal 2 snapshot SO berbeda tanggal, SoWork mulai menghitung laju pemakaian. Dengan 3+ snapshot, prediksi tanggal habis dan waktu order jadi lebih stabil.</p></div>
      <div class="action-row"><button id="export-order" class="secondary">Export Excel</button><span class="access-tag">PREDICTIVE</span></div>
    </section>

    <div class="metric-grid stock-metrics">
      <article class="metric-card"><span class="metric-label">Perlu order</span><strong>${recommended.filter(x => x.recommendedQty > 0).length}</strong><small>item direkomendasikan</small></article>
      <article class="metric-card"><span class="metric-label">Kritis</span><strong>${recommended.filter(x => x.status === "Kritis").length}</strong><small>prioritas utama</small></article>
      <article class="metric-card"><span class="metric-label">Fast moving</span><strong>${analytics.filter(x => x.velocity === "Fast").length}</strong><small>pergerakan cepat</small></article>
      <article class="metric-card"><span class="metric-label">Histori SO</span><strong>${new Set(state.stockOpnames.map(x => x.date)).size}</strong><small>tanggal snapshot</small></article>
    </div>

    <article class="panel">
      <div class="panel-head"><div><span class="overline">RECOMMENDATION</span><h3>Daftar Rekomendasi Order</h3></div>${recommended.length ? `<button id="order-wa-alert" class="secondary">Kirim ke WhatsApp</button>` : ""}</div>
      ${recommended.length ? `<div class="stock-table-wrap"><table class="order-table">
        <thead><tr><th>Barang</th><th>Stok</th><th>Pemakaian</th><th>Prediksi Habis</th><th>Order Paling Lambat</th><th>Saran Order</th><th>Data</th></tr></thead>
        <tbody>
          ${recommended.map(item => `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong>${item.criticalItem ? `<small class="block critical-label">Item krusial</small>` : ""}</td>
              <td><strong>${escapeHtml(formatQtyWithCarton(item.currentQty, item))}</strong><small class="block">${formatQty(item.currentQty)} ${escapeHtml(item.unit)}</small></td>
              <td>${item.avgDailyUsage > 0 ? `<strong>${formatQty(item.avgDailyUsage)}</strong><small class="block">${escapeHtml(item.unit)}/hari · ${escapeHtml(item.velocity)}</small>` : "Belum cukup data"}</td>
              <td>${item.predictedOutDate ? `<strong>${escapeHtml(formatDate(item.predictedOutDate))}</strong><small class="block">~${item.daysCover.toFixed(1)} hari lagi</small>` : "—"}</td>
              <td>${item.recommendedOrderDate ? `<strong class="${item.orderDueNow ? "critical-label" : ""}">${item.orderDueNow ? "Hari ini" : escapeHtml(formatDate(item.recommendedOrderDate))}</strong><small class="block">Lead time ${Number(item.leadTimeDays || 2)} hari</small>` : "—"}</td>
              <td><strong>${item.recommendedQty > 0 ? escapeHtml(formatQtyWithCarton(item.recommendedQty, item)) : "Pantau"}</strong>${item.recommendedQty > 0 ? `<small class="block">${formatQty(item.recommendedQty)} ${escapeHtml(item.unit)}</small>` : ""}</td>
              <td><span class="stock-status ${stockStatusClass(item.status)}">${escapeHtml(item.status)}</span><small class="block">${escapeHtml(item.predictionConfidence)} · ${item.historyCount} snapshot</small></td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>` : emptyState("Belum ada item yang perlu diorder berdasarkan data saat ini.")}
      <p class="matrix-tip">Estimasi awal dari data SO lama mengabaikan interval yang stoknya naik tetapi barang masuknya belum tercatat. Setelah menu Barang Masuk rutin dipakai, estimasi konsumsi jadi lebih akurat.</p>
    </article>
  `;
  document.querySelector("#export-order")?.addEventListener("click", () => exportOrderPlannerWorkbook({ analytics, filename: `SoWork-Order-Planner-${localDateKey(new Date())}.xlsx` }));
  document.querySelector("#order-wa-alert")?.addEventListener("click", () => sendStockWhatsapp(recommended));
}

function openStockItemEditor(rawItem) {
  const item = rawItem || {
    name: "", category: "Bahan", unit: "Bags", cartonSize: 0, currentQty: 0,
    primaryLocation: "Gudang Utama", secondaryLocation: "Gudang 2",
    criticalItem: false, criticalThreshold: 5, lowThreshold: 10,
    leadTimeDays: state.stockSettings.defaultLeadTimeDays || 2,
    targetCoverageDays: state.stockSettings.defaultTargetCoverageDays || 7,
    safetyStock: 5, active: true
  };
  document.querySelector("#stock-item-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "stock-item-modal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="edit-modal wide-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><span class="overline">MASTER STOCK</span><h3>${rawItem ? "Edit Barang" : "Tambah Barang"}</h3></div><button type="button" class="modal-close">×</button></div>
      <form id="stock-item-form" class="edit-form">
        <div class="edit-grid stock-edit-grid">
          <label class="span-2">Nama Barang<input name="name" value="${escapeHtml(item.name || "")}" required /></label>
          <label>Kategori<select name="category">${["Bahan","Packaging","Fresh","Operational"].map(x => `<option ${x === item.category ? "selected" : ""}>${x}</option>`).join("")}</select></label>
          <label>Satuan dasar (PCS/Bag/Bottle...)<input name="unit" value="${escapeHtml(item.unit || "PCS")}" required /></label>
          <label>Isi per Karton<input name="cartonSize" type="number" min="0" step="0.01" value="${Number(item.cartonSize || 0)}" /></label>
          <label>Current Stock<input name="currentQty" type="number" min="0" step="0.01" value="${Number(item.currentQty || 0)}" /></label>
          <label>Lokasi 1<input name="primaryLocation" value="${escapeHtml(item.primaryLocation || "Gudang Utama")}" /></label>
          <label>Lokasi 2<input name="secondaryLocation" value="${escapeHtml(item.secondaryLocation || "Gudang 2")}" /></label>
          <label>Threshold Kritis<input name="criticalThreshold" type="number" min="0" step="0.01" value="${Number(item.criticalThreshold || 0)}" /></label>
          <label>Threshold Menipis<input name="lowThreshold" type="number" min="0" step="0.01" value="${Number(item.lowThreshold || 0)}" /></label>
          <label>Lead Time (hari)<input name="leadTimeDays" type="number" min="0" value="${Number(item.leadTimeDays || 2)}" /></label>
          <label>Target Coverage (hari)<input name="targetCoverageDays" type="number" min="1" value="${Number(item.targetCoverageDays || 7)}" /></label>
          <label>Safety Stock<input name="safetyStock" type="number" min="0" step="0.01" value="${Number(item.safetyStock || 0)}" /></label>
          <label class="check-line simple"><input name="criticalItem" type="checkbox" ${item.criticalItem ? "checked" : ""} /> <span>Item krusial</span></label>
          <label class="check-line simple"><input name="active" type="checkbox" ${item.active !== false ? "checked" : ""} /> <span>Aktif</span></label>
        </div>
        <div class="modal-actions">
          ${rawItem ? `<button type="button" id="delete-stock-item" class="danger">Hapus Barang</button>` : `<span></span>`}
          <div><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan</button></div>
        </div>
      </form>
    </section>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector(".modal-close").onclick = close;
  modal.querySelector(".modal-cancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  modal.querySelector("#stock-item-form").onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await saveStockItem({
        id: rawItem?.id,
        name: fd.get("name"), category: fd.get("category"), unit: fd.get("unit"),
        cartonSize: fd.get("cartonSize"), currentQty: fd.get("currentQty"),
        lastPrimaryQty: rawItem?.lastPrimaryQty, lastSecondaryQty: rawItem?.lastSecondaryQty,
        primaryLocation: fd.get("primaryLocation"), secondaryLocation: fd.get("secondaryLocation"),
        criticalThreshold: fd.get("criticalThreshold"), lowThreshold: fd.get("lowThreshold"),
        leadTimeDays: fd.get("leadTimeDays"), targetCoverageDays: fd.get("targetCoverageDays"),
        safetyStock: fd.get("safetyStock"),
        criticalItem: e.currentTarget.elements.criticalItem.checked,
        active: e.currentTarget.elements.active.checked
      });
      close();
    } catch (err) { alert(err?.message || friendlyError(err)); }
  };
  modal.querySelector("#delete-stock-item")?.addEventListener("click", async () => {
    if (!confirm(`Hapus master barang “${rawItem.name}”? Histori SO lama tetap tersimpan.`)) return;
    await removeStockItem(rawItem.id); close();
  });
}

function openStockReceiptEditor() {
  if (!state.stockItems.length) return alert("Master barang masih kosong.");
  document.querySelector("#stock-receipt-modal")?.remove();
  const activeItems = state.stockItems.filter(x => x.active !== false).sort((a,b) => a.name.localeCompare(b.name,"id"));
  const modal = document.createElement("div");
  modal.id = "stock-receipt-modal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="edit-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><span class="overline">BARANG MASUK</span><h3>Catat Kiriman Stock</h3></div><button type="button" class="modal-close">×</button></div>
      <form id="stock-receipt-form" class="edit-form">
        <label>Barang<select name="itemId">${activeItems.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join("")}</select></label>
        <div id="receipt-conversion" class="conversion-card"></div>
        <div class="edit-grid">
          <label>Tanggal diterima<input name="date" type="date" value="${localDateKey(new Date())}" required /></label>
          <label>Jumlah Karton<input name="cartons" type="number" min="0" step="1" value="0" /></label>
          <label>Jumlah Lepas<input name="looseQty" type="number" min="0" step="0.01" value="0" /></label>
          <label>Masuk ke<select name="destination"><option>Gudang Utama</option><option>Gudang 2</option><option>Kitchen</option><option>Bar</option><option>Gudang Istirahat</option></select></label>
          <label>Supplier / Pengirim<input name="supplier" placeholder="Opsional" /></label>
        </div>
        <label>Catatan<input name="note" placeholder="No. surat jalan / catatan kiriman..." /></label>
        <div class="modal-actions"><span></span><div><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan Barang Masuk</button></div></div>
      </form>
    </section>`;
  document.body.appendChild(modal);
  const form = modal.querySelector("#stock-receipt-form");
  const close = () => modal.remove();
  modal.querySelector(".modal-close").onclick = close;
  modal.querySelector(".modal-cancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  const refreshConversion = () => {
    const item = state.stockItems.find(x => x.id === form.elements.itemId.value);
    if (!item) return;
    const size = Number(item.cartonSize || 0);
    const cartons = Number(form.elements.cartons.value || 0);
    const loose = Number(form.elements.looseQty.value || 0);
    const total = qtyFromCartonInput(cartons, loose, size);
    form.elements.cartons.disabled = !(size > 0);
    const box = modal.querySelector("#receipt-conversion");
    box.innerHTML = size > 0
      ? `<strong>1 karton = ${formatQty(size)} ${escapeHtml(item.unit)}</strong><span>${formatQty(cartons)} karton + ${formatQty(loose)} ${escapeHtml(item.unit)} = <b>${formatQty(total)} ${escapeHtml(item.unit)}</b></span>`
      : `<strong>${escapeHtml(item.name)}</strong><span>Barang ini belum punya konversi karton. Isi jumlah pada “Jumlah Lepas”.</span>`;
  };
  form.elements.itemId.addEventListener("change", refreshConversion);
  form.elements.cartons.addEventListener("input", refreshConversion);
  form.elements.looseQty.addEventListener("input", refreshConversion);
  refreshConversion();

  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const item = state.stockItems.find(x => x.id === fd.get("itemId"));
    if (!item) return;
    const totalQty = qtyFromCartonInput(fd.get("cartons"), fd.get("looseQty"), item.cartonSize);
    if (!(totalQty > 0)) return alert("Jumlah barang masuk harus lebih dari 0.");
    try {
      await saveStockReceipt({
        itemId: item.id, itemName: item.name, unit: item.unit, cartonSize: item.cartonSize,
        date: fd.get("date"), cartons: fd.get("cartons"), looseQty: fd.get("looseQty"), destination: fd.get("destination"),
        supplier: fd.get("supplier"), note: fd.get("note"),
        createdByUid: state.user?.uid, createdByName: state.profile?.name || state.user?.email
      });
      close();
    } catch (err) { alert(err?.message || friendlyError(err)); }
  };
}

function openDailyStockUsageEditor(initialDate) {
  const date = initialDate || state.stockUsageDate || localDateKey(new Date());
  state.stockUsageDate = date;
  document.querySelector("#stock-usage-modal")?.remove();
  const modal=document.createElement("div");
  modal.id="stock-usage-modal";
  modal.className="modal-backdrop";
  const activeItems=state.stockItems.filter(x=>x.active!==false).slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"id"));
  const existing=Object.fromEntries(state.stockMovements.filter(x=>x.type==="OUT"&&x.date===date).map(x=>[x.itemId,x]));
  modal.innerHTML=`<section class="edit-modal wide-modal usage-modal" role="dialog" aria-modal="true">
    <div class="modal-head"><div><span class="overline">PENGGUNAAN STOK</span><h3>Pemakaian barang harian</h3><p class="muted">Isi setiap hari, termasuk 0 jika barang tidak digunakan. Edit tanggal lama otomatis menghitung selisih stoknya.</p></div><button type="button" class="modal-close">×</button></div>
    <form id="stock-usage-form" class="edit-form">
      <div class="usage-toolbar"><label>Tanggal penggunaan<input name="date" type="date" value="${escapeHtml(date)}" required/></label><label>Catatan umum<input name="note" value="" placeholder="Produksi normal / event / ramai..."/></label></div>
      <div class="usage-input-list">
        ${activeItems.map(item=>{const row=existing[item.id]||{};return `<div class="usage-input-row"><div><strong>${escapeHtml(item.name)}</strong><span>Stok sistem ${formatQty(item.currentQty)} ${escapeHtml(item.unit||"PCS")}</span></div><label><input name="use_${escapeHtml(item.id)}" type="number" min="0" step="0.01" value="${Number(row.qty||0)}"/><span>${escapeHtml(item.unit||"PCS")}</span></label></div>`}).join("")}
      </div>
      <div class="modal-actions"><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan Penggunaan ${escapeHtml(formatDate(date))}</button></div>
    </form>
  </section>`;
  document.body.appendChild(modal);
  const close=()=>modal.remove();
  modal.querySelector(".modal-close").onclick=close;
  modal.querySelector(".modal-cancel").onclick=close;
  modal.onclick=e=>{if(e.target===modal)close();};
  const form=modal.querySelector("#stock-usage-form");
  form.elements.date.addEventListener("change",()=>openDailyStockUsageEditor(form.elements.date.value));
  form.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(form);
    const saveDate=String(fd.get("date")||date);
    const note=String(fd.get("note")||"");
    const rows=activeItems.map(item=>({itemId:item.id,itemName:item.name,unit:item.unit,qty:fd.get(`use_${item.id}`),category:"Pemakaian Harian",note}));
    if(!confirm(`Simpan penggunaan stok ${formatDate(saveDate)} untuk ${rows.length} item? Nilai akan langsung memengaruhi stok sistem.`))return;
    const btn=form.querySelector('button[type="submit"],button.primary:last-child');
    if(btn){btn.disabled=true;btn.textContent="Menyimpan...";}
    try{
      await saveDailyStockUsage(saveDate,rows,{uid:state.user?.uid,name:state.profile?.name||state.user?.email});
      close();
      alert("Penggunaan harian tersimpan. Stok sistem dan prediksi order sudah diperbarui.");
    }catch(err){alert(err?.message||friendlyError(err));if(btn){btn.disabled=false;btn.textContent="Simpan Penggunaan";}}
  };
}

function openStockSettingsEditor() {
  const s = state.stockSettings || {};
  const workerUrl = normalizeWorkerUrl(s.cloudflareWorkerUrl || "");
  const workerStatus = state.telegramWorkerStatus;
  const paired = Boolean(workerStatus?.paired || s.telegramChatId);
  document.querySelector("#stock-settings-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "stock-settings-modal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="edit-modal wide-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><span class="overline">FREE NOTIFICATION CENTER</span><h3>Telegram via Cloudflare + WhatsApp Relay</h3></div><button type="button" class="modal-close">×</button></div>
      <form id="stock-settings-form" class="edit-form">
        <div class="telegram-status-card ${paired ? "connected" : ""}">
          <div>
            <span class="overline">CLOUDFLARE WORKER</span>
            <strong>${paired ? "Telegram Terhubung" : workerUrl ? "Worker siap — belum dipair" : "Worker URL belum diisi"}</strong>
            <small>${paired ? `Chat ID ${escapeHtml(workerStatus?.chatId || s.telegramChatId || "-")}` : workerStatus?.hasSnapshot ? "Data SoWork sudah tersinkron ke D1." : "Gratis: Firebase Spark tetap dipakai, bot berjalan di Cloudflare Worker."}</small>
          </div>
          <label class="check-line simple"><input name="telegramEnabled" type="checkbox" ${s.telegramEnabled ? "checked" : ""}/><span>Aktifkan alert Telegram</span></label>
        </div>

        <label>Cloudflare Worker URL
          <input name="cloudflareWorkerUrl" value="${escapeHtml(s.cloudflareWorkerUrl || "")}" placeholder="https://sowork-telegram-free....workers.dev" />
          <small class="field-help">URL muncul setelah <code>npm.cmd run cf:deploy</code>. Bukan token dan aman disimpan di Firestore.</small>
        </label>

        <div class="edit-grid">
          <label>Kode Pairing
            <div class="input-button-row"><input id="telegram-pair-code" name="telegramPairCode" value="${escapeHtml(s.telegramPairCode || "")}" placeholder="6 digit"/><button type="button" id="generate-telegram-pair" class="secondary compact">Generate</button></div>
          </label>
          <label>Nomor WhatsApp relay<input name="telegramWhatsappNumber" value="${escapeHtml(s.telegramWhatsappNumber || s.whatsappNumber || "")}" placeholder="08xxxxxxxxxx"/></label>
          <label>Nomor WA tombol manual<input name="whatsappNumber" value="${escapeHtml(s.whatsappNumber || "")}" placeholder="08xxxxxxxxxx"/></label>
          <label>Default lead time<input name="defaultLeadTimeDays" type="number" min="0" value="${Number(s.defaultLeadTimeDays || 2)}"/></label>
          <label>Default target coverage<input name="defaultTargetCoverageDays" type="number" min="1" value="${Number(s.defaultTargetCoverageDays || 7)}"/></label>
        </div>

        <div class="notification-toggle-grid">
          <label class="check-line simple"><input name="telegramNotifyLowStock" type="checkbox" ${s.telegramNotifyLowStock !== false ? "checked" : ""}/><span>Alert stok Menipis + Kritis</span></label>
          <label class="check-line simple"><input name="telegramNotifyOrderDue" type="checkbox" ${s.telegramNotifyOrderDue !== false ? "checked" : ""}/><span>Reminder order + jumlah beli (08:00 WIB)</span></label>
          <label class="check-line simple"><input name="telegramNotifyWasteHigh" type="checkbox" ${s.telegramNotifyWasteHigh !== false ? "checked" : ""}/><span>Alert High Waste</span></label>
          <label class="check-line simple"><input name="telegramNotifyWasteRiskDay" type="checkbox" ${s.telegramNotifyWasteRiskDay !== false ? "checked" : ""}/><span>Reminder hari rawan Waste (06:30 WIB)</span></label>
        </div>

        <div class="settings-shortcut-actions cloudflare-actions">
          <button type="button" id="check-cloudflare-worker" class="secondary">Cek Worker</button>
          <button type="button" id="setup-telegram-webhook" class="secondary">Pasang Webhook</button>
          <button type="button" id="test-telegram-bot" class="secondary" ${paired ? "" : "disabled"}>Kirim Test</button>
          ${paired ? '<button type="button" id="unpair-telegram" class="danger">Unpair</button>' : ''}
        </div>

        <div class="inline-rule telegram-rule"><strong>Alur gratis:</strong> SoWork menyimpan data utama di Firestore Spark. Saat Admin mengubah Stock/Waste, browser mengirim snapshot terproteksi Firebase ID Token ke Cloudflare D1. Cron Cloudflare kemudian bisa mengingatkan Telegram walaupun SoWork sudah ditutup.</div>
        <div class="inline-rule"><strong>Pairing:</strong> setelah Simpan & Sync + Pasang Webhook, kirim <code>/start KODE</code> ke bot. Setelah itu command <code>/stock</code>, <code>/order</code>, dan <code>/waste</code> aktif.</div>
        <div class="inline-rule telegram-rule"><strong>WhatsApp:</strong> alert Telegram punya tombol “Teruskan ke WhatsApp”. Auto-send WA tanpa klik tetap membutuhkan WhatsApp Business API resmi.</div>

        <input type="hidden" name="telegramChatId" value="${escapeHtml(workerStatus?.chatId || s.telegramChatId || "")}"/>
        <input type="hidden" name="telegramAllowedUserId" value="${escapeHtml(s.telegramAllowedUserId || "")}"/>
        <div class="modal-actions"><span></span><div><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan & Sync</button></div></div>
      </form>
    </section>`;

  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector(".modal-close").onclick = close;
  modal.querySelector(".modal-cancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  modal.querySelector("#generate-telegram-pair")?.addEventListener("click", () => {
    modal.querySelector("#telegram-pair-code").value = String(Math.floor(100000 + Math.random() * 900000));
  });

  const currentUrl = () => normalizeWorkerUrl(modal.querySelector('[name="cloudflareWorkerUrl"]')?.value || "");

  modal.querySelector("#check-cloudflare-worker")?.addEventListener("click", async () => {
    try {
      const status = await getTelegramWorkerStatus(currentUrl());
      state.telegramWorkerStatus = status;
      alert(status.paired ? `Worker ONLINE. Telegram sudah dipair${status.firstName ? ` ke ${status.firstName}` : ""}.` : `Worker ONLINE. ${status.hasSnapshot ? "Data operasional sudah tersinkron." : "Belum ada snapshot data."}`);
      close(); openStockSettingsEditor();
    } catch (err) { alert(err?.message || friendlyError(err)); }
  });

  modal.querySelector("#setup-telegram-webhook")?.addEventListener("click", async () => {
    try {
      const result = await setupTelegramWebhook(currentUrl());
      alert(`Webhook Telegram aktif:\n${result.webhookUrl}`);
    } catch (err) { alert(err?.message || friendlyError(err)); }
  });

  modal.querySelector("#test-telegram-bot")?.addEventListener("click", async () => {
    try { await sendTelegramTest(currentUrl()); alert("Pesan test dikirim ke Telegram."); }
    catch (err) { alert(err?.message || friendlyError(err)); }
  });

  modal.querySelector("#unpair-telegram")?.addEventListener("click", async () => {
    if (!confirm("Putuskan pairing Telegram dari SoWork?")) return;
    try {
      await unpairTelegram(currentUrl());
      state.telegramWorkerStatus = null;
      await saveStockSettings({ ...(state.stockSettings || {}), telegramChatId: "", telegramAllowedUserId: "" });
      alert("Telegram sudah di-unpair."); close();
    } catch (err) { alert(err?.message || friendlyError(err)); }
  });

  modal.querySelector("#stock-settings-form").onsubmit = async e => {
    e.preventDefault();

    // Simpan reference + seluruh nilai form sebelum await.
    // Event.currentTarget dapat menjadi null setelah event handler melewati await.
    const form = e.currentTarget;
    if (!form) return alert("Form Telegram tidak ditemukan. Tutup Settings lalu buka kembali.");

    const fd = new FormData(form);
    const url = normalizeWorkerUrl(fd.get("cloudflareWorkerUrl"));
    if (!url) return alert("Isi Cloudflare Worker URL yang valid dulu.");

    const formSettings = {
      cloudflareWorkerUrl: url,
      whatsappNumber: fd.get("whatsappNumber"),
      autoWhatsappEnabled: false,
      notifyCriticalOnly: true,
      notifyLowStock: false,
      telegramEnabled: Boolean(form.elements.namedItem("telegramEnabled")?.checked),
      telegramChatId: fd.get("telegramChatId"),
      telegramAllowedUserId: fd.get("telegramAllowedUserId"),
      telegramPairCode: fd.get("telegramPairCode"),
      telegramWhatsappNumber: normalizeWhatsappNumber(fd.get("telegramWhatsappNumber")),
      telegramNotifyLowStock: Boolean(form.elements.namedItem("telegramNotifyLowStock")?.checked),
      telegramNotifyOrderDue: Boolean(form.elements.namedItem("telegramNotifyOrderDue")?.checked),
      telegramNotifyWasteHigh: Boolean(form.elements.namedItem("telegramNotifyWasteHigh")?.checked),
      telegramNotifyWasteRiskDay: Boolean(form.elements.namedItem("telegramNotifyWasteRiskDay")?.checked),
      defaultLeadTimeDays: Number(fd.get("defaultLeadTimeDays") || 2),
      defaultTargetCoverageDays: Number(fd.get("defaultTargetCoverageDays") || 7)
    };

    const submitButton = form.querySelector('button[type="submit"], button.primary:not([type])');
    const originalLabel = submitButton?.textContent || "Simpan & Sync";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Menyimpan & Sync...";
    }

    try {
      await saveStockSettings({
        ...(state.stockSettings || {}),
        ...formSettings
      });

      // Jangan baca e.currentTarget lagi setelah await.
      state.stockSettings = {
        ...(state.stockSettings || {}),
        ...formSettings
      };

      await runCloudflareSync();
      alert(`Pengaturan disimpan & data tersinkron.\n\nBerikutnya klik “Pasang Webhook”, lalu kirim ke bot Telegram:\n/start ${formSettings.telegramPairCode || "KODE"}`);
      close();
    } catch (err) {
      console.error("Telegram settings save/sync:", err);
      alert(`${err?.code ? `${err.code}: ` : ""}${err?.message || friendlyError(err)}`);
    } finally {
      if (submitButton && document.body.contains(modal)) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    }
  };

  if (workerUrl && !workerStatus) {
    refreshTelegramWorkerStatus().then(() => { if (document.body.contains(modal)) { close(); openStockSettingsEditor(); } }).catch(() => {});
  }
}

function sendStockWhatsapp(rows) {
  const number = normalizeWhatsappNumber(state.stockSettings?.whatsappNumber || "");
  if (!number) {
    alert("Nomor WhatsApp alert belum diatur. Klik tombol “Alert WA” di menu Stock.");
    openStockSettingsEditor();
    return;
  }
  const message = buildWhatsappAlertMessage(rows);
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

function formatQtyWithCarton(qty, item) {
  const unit = item?.unit || "PCS";
  const size = Number(item?.cartonSize || 0);
  if (!(size > 0)) return `${formatQty(qty)} ${unit}`;
  const { cartons, loose } = cartonBreakdown(qty, size);
  if (cartons <= 0) return `${formatQty(loose)} ${unit}`;
  if (loose <= 0) return `${formatQty(cartons)} karton`;
  return `${formatQty(cartons)} karton + ${formatQty(loose)} ${unit}`;
}

function formatMovementQty(row) {
  const item = state.stockItems.find(x => x.id === row.itemId);
  if (Number(row.cartonSize || item?.cartonSize || 0) > 0) {
    const cartons = Number(row.cartons || 0);
    const loose = Number(row.looseQty || 0);
    if (cartons > 0) return `${formatQty(cartons)} karton${loose > 0 ? ` + ${formatQty(loose)} ${row.unit || item?.unit || "PCS"}` : ""} (${formatQty(row.qty)} ${row.unit || item?.unit || "PCS"})`;
  }
  return `${formatQty(row.qty)} ${row.unit || item?.unit || "PCS"}`;
}

function stockItemName(id) {
  return state.stockItems.find(x => x.id === id)?.name || id || "-";
}

function stockStatusClass(status) {
  if (status === "Kritis") return "critical";
  if (status === "Menipis") return "low";
  return "safe";
}

function velocityClass(velocity) {
  if (velocity === "Fast") return "fast";
  if (velocity === "Medium") return "medium";
  if (velocity === "Slow") return "slow";
  return "unknown";
}

function formatQty(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function renderWaste(target) {
  if (!isAdmin(state.profile)) return renderPlaceholder(target);
  const today=localDateKey(new Date());
  state.wasteMonth ||= today.slice(0,7);
  const monthKey=state.wasteMonth;
  const monthDays=state.wasteDays.filter(x=>String(x.date||"").startsWith(monthKey));
  const defaultDate=monthKey===today.slice(0,7) ? today : `${monthKey}-01`;
  if(!state.wasteDate || !String(state.wasteDate).startsWith(monthKey)) state.wasteDate=defaultDate;
  const date=state.wasteDate;
  const dayDoc=state.wasteDays.find(x=>x.date===date)||{values:{}};
  const activeItems=state.wasteItems.filter(x=>x.active!==false);
  const analytics=buildWasteAnalytics(state.wasteItems,state.wasteDays,monthKey,date);
  const maxScore=Math.max(1,...analytics.dailyScores.map(x=>x.score));
  const topDays=analytics.dailyScores.slice().sort((a,b)=>b.score-a.score).slice(0,5);
  const weekdayRisk=analytics.weekdayStats.slice(0,4);

  target.innerHTML=`
    <section class="page-intro">
      <div><span class="overline">WASTE INTELLIGENCE</span><h1>Input harian, kontrol sebelum waste jadi kebiasaan.</h1><p>Setiap hari dicatat, total bulanan dihitung otomatis. SoWork menandai lonjakan, pola weekday yang sering boros, dan memberi saran supaya batch bahan baku serta pengeluaran tetap terkendali.</p></div>
      <div class="action-row">${!state.wasteItems.length?`<button id="seed-waste" class="secondary">Muat Histori Juli</button>`:""}<button id="add-waste-item" class="secondary">+ Item Waste</button><button id="import-waste" class="secondary">Import Excel</button><button id="export-waste" class="primary" ${!activeItems.length?'disabled':''}>Export Excel</button></div>
    </section>

    <div class="metric-grid waste-kpis">
      <article class="metric-card"><span class="metric-label">Hari tercatat</span><strong>${analytics.recordedDays}</strong><small>${escapeHtml(formatMonthKey(monthKey))}</small></article>
      <article class="metric-card ${analytics.highDays.length?'metric-alert':''}"><span class="metric-label">Hari waste tinggi</span><strong>${analytics.highDays.length}</strong><small>${analytics.highDays.length?'review prep diperlukan':'belum ada lonjakan besar'}</small></article>
      <article class="metric-card"><span class="metric-label">Trend 7 hari</span><strong class="text-value ${analytics.trend.changePct>=20?'critical-label':''}">${analytics.trend.previous>0?(analytics.trend.changePct>=0?'+':'')+analytics.trend.changePct.toFixed(0)+'%':'—'}</strong><small>vs 7 hari sebelumnya</small></article>
      <article class="metric-card"><span class="metric-label">Estimasi biaya waste</span><strong class="text-value">${analytics.monthlyCost>0?'Rp '+formatMoney(analytics.monthlyCost):'Belum diisi'}</strong><small>isi biaya/unit di Master Waste</small></article>
    </div>

    ${analytics.selectedWarnings.length?`<article class="panel waste-warning-panel"><div class="panel-head"><div><span class="overline">PERINGATAN</span><h3>${escapeHtml(formatDate(date))}</h3></div><span class="count-pill">${analytics.selectedWarnings.length} alert</span></div><div class="waste-warning-list">${analytics.selectedWarnings.map(w=>`<div class="waste-warning-row ${w.severity}"><span>!</span><p>${escapeHtml(w.message)}</p></div>`).join('')}</div></article>`:''}

    <article class="panel waste-control-panel daily-mode">
      <div class="waste-control-grid"><label><span>Bulan</span><input id="waste-month" type="month" value="${escapeHtml(monthKey)}"/></label><label><span>Tanggal input</span><input id="waste-date" type="date" value="${escapeHtml(date)}" min="${monthKey}-01" max="${monthKey}-${String(daysInMonth(monthKey)).padStart(2,'0')}"/></label></div>
      <div class="waste-control-note"><strong>${escapeHtml(formatDate(date))}</strong><span>${state.wasteDays.some(x=>x.date===date)?'Sudah tersimpan — simpan ulang untuk update.':'Belum ada input pada tanggal ini.'}</span></div>
    </article>

    ${activeItems.length?`<form id="waste-day-form"><div class="waste-entry-grid">${activeItems.map(item=>{const st=analytics.itemStats.find(x=>x.id===item.id);return `<article class="waste-entry-card"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.unit||'QTY')}${st?.warning>0?` · warning ≥ ${formatQty(st.warning)}`:''}</span></div><label class="waste-qty-control"><input name="w_${escapeHtml(item.id)}" type="number" min="0" step="${item.unit==='PCS'?'1':'0.01'}" value="${Number(dayDoc.values?.[item.id]||0)}"/><span>${escapeHtml(item.unit||'QTY')}</span></label><button type="button" class="text-button" data-edit-waste="${escapeHtml(item.id)}">Edit master</button></article>`}).join('')}</div><div class="sticky-save-bar waste-save-bar"><div><strong>Waste ${escapeHtml(formatDate(date))}</strong><span>Input harian → total bulan otomatis</span></div><button class="primary">Simpan Waste Hari Ini</button></div></form>`:`<article class="panel">${emptyState('Belum ada master item waste.')}</article>`}

    <article class="panel waste-master-panel">
      <div class="panel-head">
        <div>
          <span class="overline">MASTER ITEM WASTE</span>
          <h3>Kelola bahan / barang Waste</h3>
        </div>
        <span class="count-pill">${state.wasteItems.filter(x=>x.active!==false).length} aktif · ${state.wasteItems.filter(x=>x.active===false).length} arsip</span>
      </div>

      <div class="waste-master-list">
        ${state.wasteItems.length ? state.wasteItems.map(item => {
          const hasHistory = state.wasteDays.some(day => Number(day.values?.[item.id]||0) > 0);
          return `<div class="waste-master-row ${item.active===false?'is-archived':''}">
            <div class="waste-master-info">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.unit||'QTY')} · ${item.active===false?'Arsip':'Aktif'}${hasHistory?' · punya histori':''}</span>
            </div>
            <div class="waste-master-actions">
              ${item.active===false
                ? `<button class="secondary small" data-restore-waste="${escapeHtml(item.id)}">Aktifkan Lagi</button>`
                : `<button class="secondary small" data-edit-master-waste="${escapeHtml(item.id)}">Edit</button>`}
              <button class="${hasHistory?'secondary':'danger'} small" data-remove-master-waste="${escapeHtml(item.id)}">${hasHistory?'Arsipkan':'Hapus Permanen'}</button>
            </div>
          </div>`;
        }).join('') : `<p class="muted">Belum ada master item.</p>`}
      </div>
      <p class="master-help">Item yang sudah punya histori tidak dihapus permanen. SoWork mengarsipkannya supaya laporan bulan lama tetap punya nama dan satuan.</p>
    </article>

    <div class="grid two waste-analytics-grid">
      <article class="panel"><div class="panel-head"><div><span class="overline">POLA HARIAN</span><h3>Hari waste tertinggi</h3></div></div>${topDays.length?`<div class="waste-day-bars">${topDays.map(d=>`<button class="waste-day-bar-row" data-waste-history="${escapeHtml(d.date)}"><div><strong>${escapeHtml(formatDate(d.date))}</strong><span>${escapeHtml(d.weekday)} · ${d.spikeItems} item spike</span></div><div class="waste-bar-track"><i style="width:${Math.min(100,(d.score/maxScore)*100)}%"></i></div><b>${d.score.toFixed(2)}×</b></button>`).join('')}</div>`:`<p class="muted">Belum cukup data harian.</p>`}</article>
      <article class="panel"><div class="panel-head"><div><span class="overline">RECURRING RISK</span><h3>Pola berdasarkan hari</h3></div></div>${weekdayRisk.length?`<div class="weekday-risk-list">${weekdayRisk.map(w=>`<div class="weekday-risk-row"><div><strong>${escapeHtml(w.label)}</strong><span>${w.count} hari tercatat</span></div><b class="${w.risk>=1.2?'critical-label':''}">${w.risk.toFixed(2)}×</b></div>`).join('')}</div>`:`<p class="muted">Butuh beberapa hari data.</p>`}</article>
    </div>

    <article class="panel waste-advice-panel"><div class="panel-head"><div><span class="overline">CONTROL PLAN</span><h3>Saran kontrol bahan baku & pengeluaran</h3></div></div><div class="advice-grid">${analytics.suggestions.map((s,i)=>`<div class="advice-card"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${escapeHtml(s.title)}</strong><p>${escapeHtml(s.text)}</p></div></div>`).join('')}</div></article>

    <article class="panel"><div class="panel-head"><div><span class="overline">MONTH SUMMARY</span><h3>Total per item</h3></div></div><div class="waste-summary-list">${analytics.itemStats.length?analytics.itemStats.map(x=>`<div class="waste-summary-row"><div><strong>${escapeHtml(x.name)}</strong><span>${x.maxDate?`Tertinggi ${formatDate(x.maxDate)} · ${formatQty(x.maxQty)} ${escapeHtml(x.unit)}`:'Belum ada waste'}</span></div><div class="waste-summary-numbers"><strong>${formatQty(x.total)} ${escapeHtml(x.unit)}</strong>${x.cost>0?`<small>Rp ${formatMoney(x.cost)}</small>`:''}</div></div>`).join(''):`<p class="muted">Belum ada item.</p>`}</div></article>
  `;

  document.querySelector('#waste-month')?.addEventListener('change',e=>{state.wasteMonth=e.target.value;state.wasteDate=null;renderShell()});
  document.querySelector('#waste-date')?.addEventListener('change',e=>{state.wasteDate=e.target.value;renderShell()});
  document.querySelector('#seed-waste')?.addEventListener('click',async()=>{if(!confirm('Muat master + histori harian Waste Juli tanggal 1–31? Data yang sudah ada tidak ditimpa.'))return;try{await seedWasteReference();state.wasteMonth='2026-07';state.wasteDate='2026-07-31';alert('Histori Waste Juli berhasil dimuat.')}catch(err){alert(`${err?.code||'error'}: ${err?.message||friendlyError(err)}`)}});
  document.querySelector('#add-waste-item')?.addEventListener('click',()=>openWasteItemEditor(null));
  document.querySelectorAll('[data-edit-waste]').forEach(btn=>btn.onclick=()=>openWasteItemEditor(state.wasteItems.find(x=>x.id===btn.dataset.editWaste)));
  document.querySelectorAll('[data-edit-master-waste]').forEach(btn=>btn.onclick=()=>openWasteItemEditor(state.wasteItems.find(x=>x.id===btn.dataset.editMasterWaste)));

  document.querySelectorAll('[data-restore-waste]').forEach(btn=>btn.onclick=async()=>{
    try {
      await restoreWasteItem(btn.dataset.restoreWaste);
    } catch(err) {
      alert(`${err?.code||'error'}: ${err?.message||friendlyError(err)}`);
    }
  });

  document.querySelectorAll('[data-remove-master-waste]').forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.removeMasterWaste;
    const item=state.wasteItems.find(x=>x.id===id);
    const hasHistory=state.wasteDays.some(day=>Number(day.values?.[id]||0)>0);

    if(hasHistory) {
      if(!confirm(`Arsipkan "${item?.name||id}"? Item tidak muncul pada input Waste baru, tapi histori lama tetap aman.`)) return;
      try { await archiveWasteItem(id); }
      catch(err){ alert(`${err?.code||'error'}: ${err?.message||friendlyError(err)}`); }
    } else {
      if(!confirm(`Hapus permanen "${item?.name||id}"? Item ini belum punya histori Waste.`)) return;
      try { await permanentDeleteWasteItem(id); }
      catch(err){ alert(`${err?.code||'error'}: ${err?.message||friendlyError(err)}`); }
    }
  });

  document.querySelectorAll('[data-waste-history]').forEach(btn=>btn.onclick=()=>{state.wasteDate=btn.dataset.wasteHistory;renderShell();window.scrollTo({top:0,behavior:'smooth'})});
  document.querySelector('#waste-day-form')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const values=Object.fromEntries(activeItems.map(item=>[item.id,Number(fd.get(`w_${item.id}`)||0)]));try{await saveWasteDay(
    date,
    values,
    {uid:state.user?.uid,name:state.profile?.name||state.user?.email},
    Object.fromEntries(activeItems.map(item=>[item.id,{name:item.name,unit:item.unit,category:item.category}]))
  );alert('Waste harian tersimpan. Analisis bulan diperbarui otomatis.')}catch(err){alert(`${err?.code||'error'}: ${err?.message||friendlyError(err)}`)}});
  document.querySelector('#import-waste')?.addEventListener('click',()=>runExcelImport('waste'));
  document.querySelector('#export-waste')?.addEventListener('click',()=>{try{exportWasteWorkbook({monthKey,items:activeItems,days:state.wasteDays,analytics,filename:`SoWork-Waste-${monthKey}.xlsx`})}catch(err){alert(err?.message||'Export gagal.')}});
}


function openWasteItemEditor(rawItem) {
  document.querySelector('#waste-item-modal')?.remove();
  const item=rawItem||{name:'',unit:'ML',category:'Waste',active:true,sortOrder:state.wasteItems.length+1,costPerUnit:0,dailyWarningQty:0,monthlyTargetQty:0};
  const modal=document.createElement('div');modal.id='waste-item-modal';modal.className='modal-backdrop';
  modal.innerHTML=`<section class="edit-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><span class="overline">MASTER WASTE</span><h3>${rawItem?'Edit Item Waste':'Tambah Item Waste'}</h3></div><button type="button" class="modal-close">×</button></div><form id="waste-item-form" class="modal-form"><label>Nama Item<input name="name" value="${escapeHtml(item.name)}" required/></label><div class="form-grid compact-grid"><label>Satuan<select name="unit">${['ML','GRAM','PCS','QTY'].map(u=>`<option value="${u}" ${String(item.unit||'QTY').toUpperCase()===u?'selected':''}>${u==='GRAM'?'Gram':u}</option>`).join('')}</select></label><label>Urutan<input name="sortOrder" type="number" min="0" value="${Number(item.sortOrder||0)}"/></label><label>Warning harian<input name="dailyWarningQty" type="number" min="0" step="0.01" value="${Number(item.dailyWarningQty||0)}" placeholder="0 = otomatis"/></label><label>Target waste / bulan<input name="monthlyTargetQty" type="number" min="0" step="0.01" value="${Number(item.monthlyTargetQty||0)}" placeholder="Opsional"/></label><label>Biaya per unit (Rp)<input name="costPerUnit" type="number" min="0" step="0.01" value="${Number(item.costPerUnit||0)}" placeholder="Opsional"/></label></div><label>Kategori<input name="category" value="${escapeHtml(item.category||'Waste')}"/></label><div class="unit-helper"><strong>Untuk analisis yang lebih tajam</strong><span>Warning 0 = SoWork hitung otomatis dari histori. Biaya/unit memungkinkan estimasi rupiah waste supaya pengeluaran bisa dipantau.</span></div><label class="check-line"><input name="active" type="checkbox" ${item.active!==false?'checked':''}/> Aktifkan item</label><div class="modal-actions">${rawItem?`<button type="button" id="delete-waste-item" class="danger">${state.wasteDays.some(day=>Number(day.values?.[rawItem.id]||0)>0)?'Arsipkan':'Hapus Permanen'}</button>`:'<span></span>'}<div><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan</button></div></div></form></section>`;
  document.body.appendChild(modal);const close=()=>modal.remove();modal.querySelector('.modal-close').onclick=close;modal.querySelector('.modal-cancel').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
  modal.querySelector('#waste-item-form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await saveWasteItem({id:rawItem?.id,name:fd.get('name'),unit:fd.get('unit'),category:fd.get('category'),sortOrder:fd.get('sortOrder'),dailyWarningQty:fd.get('dailyWarningQty'),monthlyTargetQty:fd.get('monthlyTargetQty'),costPerUnit:fd.get('costPerUnit'),active:fd.get('active')==='on'});close()}catch(err){alert(`${err?.code||'error'}: ${err?.message||friendlyError(err)}`)}};
  modal.querySelector('#delete-waste-item')?.addEventListener('click',async()=>{
    const hasHistory=state.wasteDays.some(day=>Number(day.values?.[item.id]||0)>0);
    try {
      if(hasHistory) {
        if(!confirm(`Arsipkan "${item.name}"? Item hilang dari input Waste baru, tetapi histori lama tetap tersimpan.`)) return;
        await archiveWasteItem(item.id);
      } else {
        if(!confirm(`Hapus permanen "${item.name}"? Item belum pernah dipakai pada histori Waste.`)) return;
        await permanentDeleteWasteItem(item.id);
      }
      close();
    } catch(err) {
      alert(`${err?.code||'error'}: ${err?.message||friendlyError(err)}`);
    }
  });
}


function renderReports(target) {
  if (!isAdmin(state.profile)) return renderPlaceholder(target);

  const currentMonth = localDateKey(new Date()).slice(0,7);
  state.reportMonth ||= currentMonth;
  const month = state.reportMonth;
  const search = String(state.reportSearch || "").toLowerCase().trim();
  const rows = state.personalReports.filter(r => {
    if (month && !String(r.date || "").startsWith(month)) return false;
    if (!search) return true;
    return [r.summary, r.issues, r.stockNotes, r.equipmentNotes, r.followUp, r.shift, r.role]
      .some(v => String(v || "").toLowerCase().includes(search));
  });

  target.innerHTML = `
    <section class="page-intro">
      <div>
        <span class="overline">PERSONAL REPORT</span>
        <h1>Catatan kerja yang bisa dicari lagi.</h1>
        <p>Shift dan role bisa diambil otomatis dari jadwal lu. Simpan masalah, kondisi stok, alat, dan follow-up supaya nggak hilang begitu aja.</p>
      </div>
      <div class="action-row"><button id="import-reports" class="secondary">Import Excel</button><button id="export-reports" class="secondary">Export Excel</button><button id="add-report" class="primary">+ Laporan</button></div>
    </section>

    <div class="metric-grid report-metrics">
      <article class="metric-card"><span class="metric-label">Laporan bulan ini</span><strong>${rows.length}</strong><small>${escapeHtml(formatMonthKey(month))}</small></article>
      <article class="metric-card"><span class="metric-label">Ada kendala</span><strong>${rows.filter(x => String(x.issues || "").trim()).length}</strong><small>laporan dengan issue</small></article>
      <article class="metric-card"><span class="metric-label">Follow-up</span><strong>${rows.filter(x => String(x.followUp || "").trim()).length}</strong><small>butuh tindak lanjut</small></article>
    </div>

    <article class="panel report-filter-panel">
      <div class="report-filter-grid">
        <label><span>Bulan</span><input id="report-month" type="month" value="${escapeHtml(month)}" /></label>
        <label><span>Cari isi laporan</span><input id="report-search" value="${escapeHtml(state.reportSearch || "")}" placeholder="stok, mesin, customer..." /></label>
      </div>
    </article>

    <div class="report-list">
      ${rows.length ? rows.map(r => `
        <article class="report-card" data-edit-report="${escapeHtml(r.id)}">
          <div class="report-card-head">
            <div><strong>${escapeHtml(formatDate(r.date))}</strong><span>${escapeHtml(r.shift || "-")} · ${escapeHtml(r.role || "-")}</span></div>
            ${Number(r.sales || 0) > 0 ? `<span class="report-sales">Rp ${formatMoney(r.sales)}</span>` : ""}
          </div>
          <p>${escapeHtml(r.summary || "Tidak ada ringkasan.")}</p>
          <div class="report-tags">
            ${r.issues ? `<span>Issue</span>` : ""}
            ${r.stockNotes ? `<span>Stock</span>` : ""}
            ${r.equipmentNotes ? `<span>Alat</span>` : ""}
            ${r.followUp ? `<span>Follow-up</span>` : ""}
          </div>
        </article>
      `).join("") : `<article class="panel">${emptyState("Belum ada laporan pada periode ini.")}</article>`}
    </div>
  `;

  document.querySelector("#import-reports")?.addEventListener("click", () => runExcelImport("reports"));
  document.querySelector("#export-reports")?.addEventListener("click", () => exportReportsWorkbook({ reports: state.personalReports, filename: `SoWork-Laporan-${month}.xlsx` }));
  document.querySelector("#add-report")?.addEventListener("click", () => openReportEditor(null));
  document.querySelector("#report-month")?.addEventListener("change", e => {
    state.reportMonth = e.target.value;
    renderShell();
  });
  document.querySelector("#report-search")?.addEventListener("input", e => {
    state.reportSearch = e.target.value;
    renderReports(target);
  });
  document.querySelectorAll("[data-edit-report]").forEach(card => {
    card.onclick = () => openReportEditor(state.personalReports.find(x => x.id === card.dataset.editReport));
  });
}

function openReportEditor(rawReport) {
  document.querySelector("#report-modal")?.remove();
  const today = localDateKey(new Date());
  const date = rawReport?.date || today;
  const schedule = state.schedules.find(x =>
    x.date === date &&
    String(x.crewName || "").toLowerCase() === String(state.profile?.name || "").toLowerCase()
  );
  const autoFill = state.appSettings?.reportAutoFillSchedule !== false;
  const report = rawReport || {
    date,
    shift: autoFill ? schedule?.shift || "" : "",
    role: autoFill ? schedule?.role || "" : "",
    sales: 0,
    summary: "",
    issues: "",
    stockNotes: "",
    equipmentNotes: "",
    followUp: ""
  };

  const modal = document.createElement("div");
  modal.id = "report-modal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="edit-modal wide-modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div><span class="overline">LAPORAN PRIBADI</span><h3>${rawReport ? "Edit Laporan" : "Tambah Laporan"}</h3></div>
        <button type="button" class="modal-close">×</button>
      </div>
      <form id="report-form" class="modal-form">
        <div class="form-grid compact-grid">
          <label>Tanggal<input id="report-date" name="date" type="date" value="${escapeHtml(report.date)}" required /></label>
          <label>Shift<input id="report-shift" name="shift" value="${escapeHtml(report.shift || "")}" /></label>
          <label>Role<input id="report-role" name="role" value="${escapeHtml(report.role || "")}" /></label>
          <label>Penjualan (opsional)<input name="sales" type="number" min="0" value="${Number(report.sales || 0)}" /></label>
        </div>
        <label>Ringkasan<textarea name="summary" rows="3" placeholder="Apa yang terjadi hari ini?">${escapeHtml(report.summary || "")}</textarea></label>
        <div class="form-grid two-col-form">
          <label>Kendala<textarea name="issues" rows="3">${escapeHtml(report.issues || "")}</textarea></label>
          <label>Catatan Stok<textarea name="stockNotes" rows="3">${escapeHtml(report.stockNotes || "")}</textarea></label>
          <label>Alat / Mesin<textarea name="equipmentNotes" rows="3">${escapeHtml(report.equipmentNotes || "")}</textarea></label>
          <label>Follow-up<textarea name="followUp" rows="3">${escapeHtml(report.followUp || "")}</textarea></label>
        </div>
        <div class="modal-actions">
          ${rawReport ? `<button type="button" id="delete-report" class="danger">Hapus</button>` : `<span></span>`}
          <div><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan Laporan</button></div>
        </div>
      </form>
    </section>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector(".modal-close").onclick = close;
  modal.querySelector(".modal-cancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  modal.querySelector("#report-date").addEventListener("change", e => {
    if (state.appSettings?.reportAutoFillSchedule === false) return;
    const row = state.schedules.find(x =>
      x.date === e.target.value &&
      String(x.crewName || "").toLowerCase() === String(state.profile?.name || "").toLowerCase()
    );
    if (row) {
      modal.querySelector("#report-shift").value = row.shift || "";
      modal.querySelector("#report-role").value = row.role || "";
    }
  });

  modal.querySelector("#report-form").onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await savePersonalReport({
        id: rawReport?.id,
        date: fd.get("date"),
        shift: fd.get("shift"),
        role: fd.get("role"),
        sales: fd.get("sales"),
        summary: fd.get("summary"),
        issues: fd.get("issues"),
        stockNotes: fd.get("stockNotes"),
        equipmentNotes: fd.get("equipmentNotes"),
        followUp: fd.get("followUp"),
        authorUid: state.user?.uid,
        authorName: state.profile?.name || state.user?.email
      });
      close();
    } catch (err) {
      alert(err?.message || friendlyError(err));
    }
  };

  modal.querySelector("#delete-report")?.addEventListener("click", async () => {
    if (!confirm("Hapus laporan ini?")) return;
    await removePersonalReport(rawReport.id);
    close();
  });
}

function renderCalculator(target) {
  if (!isAdmin(state.profile)) return renderPlaceholder(target);

  target.innerHTML = `
    <section class="page-intro">
      <div><span class="overline">WORK CALCULATOR</span><h1>Kalkulator yang kepake saat kerja.</h1><p>Semua kalkulasi berjalan lokal di browser dan tidak menyimpan data ke database.</p></div>
      <button id="export-calculator" class="secondary">Export Hasil</button>
    </section>

    <div class="calculator-grid">
      <article class="panel calc-card">
        <span class="overline">RECIPE</span><h3>Recipe & Produksi</h3>
        <div class="calc-fields">
          <label>Pemakaian / cup<input id="recipe-per" type="number" min="0" step="0.01" value="35"/></label>
          <label>Target cup<input id="recipe-target" type="number" min="0" step="1" value="60"/></label>
          <label>Stok tersedia<input id="recipe-stock" type="number" min="0" step="0.01" value="7500"/></label>
        </div>
        <div class="calc-result"><span>Kebutuhan</span><strong id="recipe-needed">—</strong><small id="recipe-capacity">—</small></div>
      </article>

      <article class="panel calc-card">
        <span class="overline">CARTON</span><h3>Karton ↔ Satuan</h3>
        <div class="calc-fields">
          <label>Isi / karton<input id="carton-size" type="number" min="1" value="24"/></label>
          <label>Karton<input id="carton-count" type="number" min="0" value="2"/></label>
          <label>Loose<input id="carton-loose" type="number" min="0" value="5"/></label>
          <label>Total satuan<input id="carton-total-input" type="number" min="0" value="53"/></label>
        </div>
        <div class="calc-result"><span>Total dari karton</span><strong id="carton-total">—</strong><small id="carton-breakdown">—</small></div>
      </article>

      <article class="panel calc-card">
        <span class="overline">CASH</span><h3>Rekonsiliasi Kas</h3>
        <div class="calc-fields">
          <label>Cash awal<input id="cash-open" type="number" value="300000"/></label>
          <label>Penjualan cash<input id="cash-sales" type="number" value="1280000"/></label>
          <label>Pengeluaran<input id="cash-expense" type="number" value="25000"/></label>
          <label>Cash aktual<input id="cash-actual" type="number" value="1550000"/></label>
        </div>
        <div class="calc-result"><span>Expected cash</span><strong id="cash-expected">—</strong><small id="cash-diff">—</small></div>
      </article>

      <article class="panel calc-card">
        <span class="overline">TARGET</span><h3>Target Penjualan</h3>
        <div class="calc-fields">
          <label>Target periode<input id="target-total" type="number" value="30000000"/></label>
          <label>Sudah tercapai<input id="target-current" type="number" value="18000000"/></label>
          <label>Sisa hari<input id="target-days" type="number" min="1" value="10"/></label>
        </div>
        <div class="calc-result"><span>Minimal per hari</span><strong id="target-daily">—</strong><small id="target-progress">—</small></div>
      </article>

      <article class="panel calc-card">
        <span class="overline">PERCENTAGE</span><h3>Persentase & Selisih</h3>
        <div class="calc-fields">
          <label>Nilai awal<input id="pct-old" type="number" value="100"/></label>
          <label>Nilai baru<input id="pct-new" type="number" value="120"/></label>
        </div>
        <div class="calc-result"><span>Perubahan</span><strong id="pct-change">—</strong><small id="pct-diff">—</small></div>
      </article>
    </div>
  `;

  const recalc = () => {
    const per = Number(document.querySelector("#recipe-per")?.value || 0);
    const targetQty = Number(document.querySelector("#recipe-target")?.value || 0);
    const stock = Number(document.querySelector("#recipe-stock")?.value || 0);
    document.querySelector("#recipe-needed").textContent = formatQty(per * targetQty);
    document.querySelector("#recipe-capacity").textContent = per > 0 ? `Stok cukup ± ${Math.floor(stock / per)} cup` : "Isi pemakaian / cup";

    const size = Math.max(1, Number(document.querySelector("#carton-size")?.value || 1));
    const cartons = Math.max(0, Number(document.querySelector("#carton-count")?.value || 0));
    const loose = Math.max(0, Number(document.querySelector("#carton-loose")?.value || 0));
    const totalInput = Math.max(0, Number(document.querySelector("#carton-total-input")?.value || 0));
    document.querySelector("#carton-total").textContent = `${formatQty((cartons * size) + loose)} satuan`;
    document.querySelector("#carton-breakdown").textContent = `${Math.floor(totalInput / size)} karton + ${formatQty(totalInput % size)} satuan`;

    const cashOpen = Number(document.querySelector("#cash-open")?.value || 0);
    const cashSales = Number(document.querySelector("#cash-sales")?.value || 0);
    const cashExpense = Number(document.querySelector("#cash-expense")?.value || 0);
    const cashActual = Number(document.querySelector("#cash-actual")?.value || 0);
    const expected = cashOpen + cashSales - cashExpense;
    const diff = cashActual - expected;
    document.querySelector("#cash-expected").textContent = `Rp ${formatMoney(expected)}`;
    document.querySelector("#cash-diff").textContent = `Selisih ${diff >= 0 ? "+" : ""}Rp ${formatMoney(diff)}`;

    const tTotal = Number(document.querySelector("#target-total")?.value || 0);
    const tCurrent = Number(document.querySelector("#target-current")?.value || 0);
    const tDays = Math.max(1, Number(document.querySelector("#target-days")?.value || 1));
    const remaining = Math.max(0, tTotal - tCurrent);
    document.querySelector("#target-daily").textContent = `Rp ${formatMoney(remaining / tDays)}`;
    document.querySelector("#target-progress").textContent = tTotal > 0 ? `${Math.min(100, (tCurrent / tTotal) * 100).toFixed(1)}% tercapai` : "Target belum diisi";

    const oldV = Number(document.querySelector("#pct-old")?.value || 0);
    const newV = Number(document.querySelector("#pct-new")?.value || 0);
    const pct = oldV !== 0 ? ((newV - oldV) / Math.abs(oldV)) * 100 : 0;
    document.querySelector("#pct-change").textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    document.querySelector("#pct-diff").textContent = `Selisih ${formatQty(newV - oldV)}`;
  };

  document.querySelector("#export-calculator")?.addEventListener("click", () => exportCalculatorWorkbook({
    rows: [
      ["Recipe", "Pemakaian / cup", Number(document.querySelector("#recipe-per")?.value || 0)],
      ["Recipe", "Target cup", Number(document.querySelector("#recipe-target")?.value || 0)],
      ["Recipe", "Kebutuhan", document.querySelector("#recipe-needed")?.textContent || ""],
      ["Karton", "Isi / karton", Number(document.querySelector("#carton-size")?.value || 0)],
      ["Karton", "Total", document.querySelector("#carton-total")?.textContent || ""],
      ["Cash", "Kas seharusnya", document.querySelector("#cash-expected")?.textContent || ""],
      ["Cash", "Selisih", document.querySelector("#cash-diff")?.textContent || ""],
      ["Target", "Minimal per hari", document.querySelector("#target-daily")?.textContent || ""],
      ["Persentase", "Perubahan", document.querySelector("#pct-change")?.textContent || ""]
    ]
  }));
  target.querySelectorAll("input").forEach(input => input.addEventListener("input", recalc));
  recalc();
}


function renderDataHub(target) {
  if (!isAdmin(state.profile)) return renderPlaceholder(target);
  const analytics = buildStockAnalytics(state.stockItems, state.stockOpnames, state.stockMovements);
  const wasteMonth = state.wasteMonth || localDateKey(new Date()).slice(0,7);
  const wasteAnalytics = buildWasteAnalytics(state.wasteItems, state.wasteDays, wasteMonth, localDateKey(new Date()));

  const cards = [
    ["schedule","Jadwal","Jadwal Data bisa diexport dan diimport kembali. File jadwal juga tetap punya tampilan matrix untuk dibagikan.",true,true],
    ["checklist","Daily Checklist","Export template + history completion. Import difokuskan ke template task.",true,true],
    ["stock","Stock & Penggunaan Harian","Export master, barang masuk, penggunaan per tanggal, SO, rekonsiliasi, dan prediksi. Import transaksi dipisah supaya stok tetap terkontrol.",true,true],
    ["opname","Stock Opname & Rekonsiliasi","Bandingkan stok fisik vs stok sistem akhir bulan dan export selisihnya untuk audit.",true,true],
    ["order","Order Planner","Prediksi adalah data turunan, jadi aman untuk export/share tetapi tidak diimport balik.",true,false],
    ["waste","Waste","Export master + waste harian + ringkasan. Import master dan data harian dari sheet yang sama.",true,true],
    ["reports","Laporan","Export seluruh laporan dan import batch laporan dari spreadsheet.",true,true]
  ];

  target.innerHTML = `
    <section class="page-intro">
      <div><span class="overline">DATA HUB</span><h1>Export buat share. Import buat input cepat.</h1><p>Semua data operasional utama bisa keluar ke Excel. Sheet yang importable dibuat dengan header stabil supaya bisa diedit, dishare, lalu dimasukkan lagi ke SoWork.</p></div>
      <div class="action-row"><button id="export-all-data" class="primary">Export Semua Data</button><a class="secondary button-link" href="${import.meta.env.BASE_URL}templates/SoWork-Import-Template.xlsx" download>Template Import</a></div>
    </section>

    <div class="metric-grid data-metrics">
      <article class="metric-card"><span class="metric-label">Jadwal</span><strong>${state.schedules.length}</strong><small>baris data</small></article>
      <article class="metric-card"><span class="metric-label">Stock</span><strong>${state.stockItems.length}</strong><small>master item</small></article>
      <article class="metric-card"><span class="metric-label">Waste</span><strong>${state.wasteDays.length}</strong><small>hari tersimpan</small></article>
      <article class="metric-card"><span class="metric-label">Laporan</span><strong>${state.personalReports.length}</strong><small>record</small></article>
    </div>

    <div class="data-hub-grid">
      ${cards.map(([id,title,desc,canExport,canImport])=>`
        <article class="panel data-hub-card">
          <div><span class="overline">${id.toUpperCase()}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p></div>
          <div class="data-hub-actions">
            ${canExport?`<button class="secondary compact" data-data-export="${id}">Export Excel</button>`:""}
            ${canImport?`<button class="primary compact" data-data-import="${id}">Import Excel</button>`:""}
          </div>
        </article>`).join("")}
    </div>

    <article class="panel import-safety-panel">
      <div class="panel-head"><div><span class="overline">IMPORT SAFETY</span><h3>Import tidak boleh bikin data ngawur.</h3></div></div>
      <div class="safety-grid">
        <div><strong>Upsert</strong><span>Jadwal, master stock, SO, dan Waste tanggal yang sama akan di-update, bukan dibuat dobel sembarangan.</span></div>
        <div><strong>Transaksi Stock</strong><span>Barang masuk menambah stok, Penggunaan Stok mengurangi stok. Keduanya punya tanggal dan bisa diimport terpisah.</span></div>
        <div><strong>Rekonsiliasi</strong><span>Order Planner dihitung ulang dari penggunaan harian. SO membandingkan stok fisik dengan ledger barang masuk − penggunaan.</span></div>
      </div>
    </article>
  `;

  document.querySelector("#export-all-data")?.addEventListener("click", () => {
    exportAllWorkbook({
      schedules: state.schedules,
      checklist: state.checklist,
      checklistCompletions: state.checklistCompletions,
      stockItems: state.stockItems,
      stockMovements: state.stockMovements,
      stockOpnames: state.stockOpnames,
      stockAnalytics: analytics,
      wasteItems: state.wasteItems,
      wasteDays: state.wasteDays,
      reports: state.personalReports,
      appSettings: state.appSettings,
      stockSettings: state.stockSettings,
      filename: `SoWork-Semua-Data-${localDateKey(new Date())}.xlsx`
    });
  });

  document.querySelectorAll("[data-data-export]").forEach(btn => btn.onclick = () => {
    const id = btn.dataset.dataExport;
    if (id === "schedule") return exportScheduleWorkbook({ entries: state.schedules, rules: state.scheduleRules, periodLabel: "Semua Jadwal", filename: "SoWork-Jadwal-All.xlsx" });
    if (id === "checklist") return exportChecklistWorkbook({ templates: state.checklist, completions: state.checklistCompletions });
    if (id === "stock") return exportStockWorkbook({ items: state.stockItems, movements: state.stockMovements, opnames: state.stockOpnames, analytics });
    if (id === "opname") return exportStockOpnameWorkbook({ items: state.stockItems, opnames: state.stockOpnames, movements: state.stockMovements });
    if (id === "order") return exportOrderPlannerWorkbook({ analytics });
    if (id === "waste") return exportWasteWorkbook({ monthKey: wasteMonth, items: state.wasteItems, days: state.wasteDays, analytics: wasteAnalytics, filename:`SoWork-Waste-${wasteMonth}.xlsx` });
    if (id === "reports") return exportReportsWorkbook({ reports: state.personalReports });
  });

  document.querySelectorAll("[data-data-import]").forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.dataImport;
    if (id === "stock") return openStockImportChoice();
    await runExcelImport(id);
  });
}

async function runExcelImport(feature) {
  const file = await chooseExcelFile();
  if (!file) return;
  if (!confirm(`Import data ${feature} dari “${file.name}”? Pastikan header mengikuti template SoWork.`)) return;
  try {
    const result = await importFeatureWorkbook(feature, file, {
      stockItems: state.stockItems,
      wasteItems: state.wasteItems,
      wasteDays: state.wasteDays,
      actor: { uid: state.user?.uid || "", name: state.profile?.name || state.user?.email || "Admin" }
    });
    alert(`Import selesai. ${result.detail || `${result.count} data`}`);
  } catch (err) {
    console.error("Excel import", feature, err);
    alert(`Import gagal: ${err?.message || friendlyError(err)}`);
  }
}

function openStockImportChoice() {
  document.querySelector("#stock-import-choice")?.remove();
  const modal=document.createElement("div");
  modal.id="stock-import-choice";
  modal.className="modal-backdrop";
  modal.innerHTML=`<section class="edit-modal"><div class="modal-head"><div><span class="overline">IMPORT STOCK</span><h3>Pilih jenis data</h3></div><button class="modal-close">×</button></div>
    <div class="stack data-import-options">
      <button class="secondary" data-stock-import="stockMaster"><strong>Stock Master</strong><span>Tambah/update nama barang, unit, threshold, current stock, lead time.</span></button>
      <button class="secondary" data-stock-import="stockIncoming"><strong>Barang Masuk</strong><span>Menambah histori inbound dan otomatis menambah current stock.</span></button>
      <button class="secondary" data-stock-import="stockUsage"><strong>Penggunaan Stok</strong><span>Import pemakaian per tanggal. Otomatis mengurangi current stock dan aman di-update ulang per tanggal/item.</span></button>
    </div></section>`;
  document.body.appendChild(modal);
  const close=()=>modal.remove();
  modal.querySelector(".modal-close").onclick=close;
  modal.onclick=e=>{if(e.target===modal)close();};
  modal.querySelectorAll("[data-stock-import]").forEach(btn=>btn.onclick=async()=>{const f=btn.dataset.stockImport;close();await runExcelImport(f);});
}

function renderSettings(target) {
  if (!isAdmin(state.profile)) return renderPlaceholder(target);
  const s = { ...DEFAULT_APP_SETTINGS, ...(state.appSettings || {}) };

  target.innerHTML = `
    <section class="page-intro">
      <div><span class="overline">SYSTEM SETTINGS</span><h1>Atur default sekali, pakai berkali-kali.</h1><p>Pengaturan ini khusus Admin. Akses Viewer tetap hanya Jadwal dan Daily Checklist.</p></div>
    </section>

    <div class="settings-layout">
      <article class="panel">
        <div class="panel-head"><div><span class="overline">GENERAL</span><h3>Identitas Workspace</h3></div></div>
        <form id="app-settings-form" class="settings-form">
          <div class="form-grid compact-grid">
            <label>Nama Workspace<input name="outletName" value="${escapeHtml(s.outletName)}" /></label>
            <label>Cabang / Subtitle<input name="branchName" value="${escapeHtml(s.branchName)}" /></label>
            <label>Lokasi Stock Utama<input name="defaultPrimaryLocation" value="${escapeHtml(s.defaultPrimaryLocation)}" /></label>
            <label>Lokasi Stock Kedua<input name="defaultSecondaryLocation" value="${escapeHtml(s.defaultSecondaryLocation)}" /></label>
            <label>Currency<input name="currency" value="${escapeHtml(s.currency)}" /></label>
            <label>Timezone<input name="timezone" value="${escapeHtml(s.timezone)}" /></label>
          </div>
          <label class="check-line"><input name="reportAutoFillSchedule" type="checkbox" ${s.reportAutoFillSchedule !== false ? "checked" : ""}/> Laporan pribadi otomatis mengambil Shift + Role dari Jadwal</label>
          <button class="primary">Simpan Settings</button>
        </form>
      </article>

      <article class="panel">
        <div class="panel-head"><div><span class="overline">ADMIN PROFILE</span><h3>Akun Admin</h3></div></div>
        <form id="profile-settings-form" class="settings-form">
          <label>Nama tampil<input name="name" value="${escapeHtml(state.profile?.name || "")}" required /></label>
          <div class="settings-readonly-row"><span>Email</span><strong>${escapeHtml(state.user?.email || "-")}</strong></div>
          <div class="settings-readonly-row"><span>Role</span><strong>${escapeHtml(state.profile?.role || "-")}</strong></div>
          <button class="primary">Update Nama</button>
        </form>
      </article>

      <article class="panel">
        <div class="panel-head"><div><span class="overline">BOT & ALERT</span><h3>Telegram Notification Center</h3></div></div>
        <div class="settings-readonly-row"><span>Telegram</span><strong>${state.telegramWorkerStatus?.paired || state.stockSettings?.telegramChatId ? "Terhubung" : "Belum dipair"}</strong></div>
        <div class="settings-readonly-row"><span>Alert otomatis</span><strong>${state.stockSettings?.telegramEnabled ? "Aktif (Cloudflare Free)" : "Nonaktif"}</strong></div>
        <div class="settings-readonly-row"><span>WA Relay</span><strong>${escapeHtml(state.stockSettings?.telegramWhatsappNumber || "Belum diatur")}</strong></div>
        <div class="settings-readonly-row"><span>Prediksi order</span><strong>${Number(state.stockSettings?.defaultLeadTimeDays || 2)} hari lead time · ${Number(state.stockSettings?.defaultTargetCoverageDays || 7)} hari coverage</strong></div>
        <button id="open-stock-settings" class="secondary">Atur Telegram & Alert</button>
      </article>

      <article class="panel">
        <div class="panel-head"><div><span class="overline">DATA & SHEET</span><h3>Export / Import Center</h3></div></div>
        <p class="muted small-copy">Export data buat share atau gunakan template Excel untuk input batch lebih cepat.</p>
        <div class="settings-shortcut-actions"><button id="open-data-hub" class="secondary">Buka Data Hub</button><a class="secondary button-link" href="/templates/SoWork-Import-Template.xlsx" download>Template Excel</a></div>
      </article>

      <article class="panel">
        <div class="panel-head"><div><span class="overline">SYSTEM INFO</span><h3>SoWork</h3></div></div>
        <div class="settings-readonly-row"><span>Version</span><strong>v1.2.1 Free Telegram</strong></div>
        <div class="settings-readonly-row"><span>Firebase Project</span><strong>sowork-ab04d</strong></div>
        <div class="settings-readonly-row"><span>Mode</span><strong>Firebase Spark + Cloudflare Free</strong></div>
      </article>
    </div>
  `;

  document.querySelector("#app-settings-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await saveAppSettings({
        outletName: fd.get("outletName"),
        branchName: fd.get("branchName"),
        defaultPrimaryLocation: fd.get("defaultPrimaryLocation"),
        defaultSecondaryLocation: fd.get("defaultSecondaryLocation"),
        currency: fd.get("currency"),
        timezone: fd.get("timezone"),
        reportAutoFillSchedule: fd.get("reportAutoFillSchedule") === "on"
      });
      alert("Settings tersimpan.");
    } catch (err) {
      alert(err?.message || friendlyError(err));
    }
  });

  document.querySelector("#profile-settings-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await updateProfileName(state.user?.uid, fd.get("name"));
      state.profile = { ...state.profile, name: String(fd.get("name") || "").trim() };
      alert("Nama profil diperbarui.");
      renderShell();
    } catch (err) {
      alert(err?.message || friendlyError(err));
    }
  });

  document.querySelector("#open-stock-settings")?.addEventListener("click", () => openStockSettingsEditor());
  document.querySelector("#open-data-hub")?.addEventListener("click", () => { state.page = "data"; renderShell(); });
}

function formatMonthKey(value) {
  if (!value) return "-";
  const [y,m] = String(value).split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

function daysInMonth(monthKey) {
  const [y,m] = String(monthKey || "").split("-").map(Number);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

function formatMoney(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function renderPlaceholder(target) {
  const name = pageTitle(state.page);
  target.innerHTML = `
    <section class="page-intro">
      <div><span class="overline">COMING NEXT</span><h1>${name}</h1><p>Fondasi modul sudah disiapkan untuk pengembangan berikutnya.</p></div>
    </section>
    <article class="panel placeholder">
      <div class="placeholder-mark">${name.slice(0, 2).toUpperCase()}</div>
      <h3>${name}</h3>
      <p>Modul ini akan dibangun bertahap tanpa mengganggu Jadwal dan Daily Checklist yang sudah berjalan.</p>
    </article>
  `;
}

function buildCloudflareSnapshot() {
  return {
    settings: state.stockSettings || {},
    stockItems: state.stockItems || [],
    stockMovements: state.stockMovements || [],
    stockOpnames: state.stockOpnames || [],
    wasteItems: state.wasteItems || [],
    wasteDays: state.wasteDays || []
  };
}

function scheduleCloudflareSync(delay = 1200) {
  if (!isAdmin(state.profile)) return;
  const url = normalizeWorkerUrl(state.stockSettings?.cloudflareWorkerUrl || "");
  if (!url) return;
  clearTimeout(state.cloudflareSyncTimer);
  state.cloudflareSyncTimer = setTimeout(() => runCloudflareSync().catch(err => console.warn("Cloudflare sync:", err)), delay);
}

async function runCloudflareSync() {
  const url = normalizeWorkerUrl(state.stockSettings?.cloudflareWorkerUrl || "");
  if (!url || !isAdmin(state.profile)) return null;
  if (state.cloudflareSyncBusy) {
    state.cloudflareSyncQueued = true;
    return null;
  }
  state.cloudflareSyncBusy = true;
  try {
    const result = await syncTelegramSnapshot(url, buildCloudflareSnapshot());
    state.telegramWorkerStatus = { ...(state.telegramWorkerStatus || {}), hasSnapshot: true, snapshotUpdatedAt: result.syncedAt };
    return result;
  } finally {
    state.cloudflareSyncBusy = false;
    if (state.cloudflareSyncQueued) {
      state.cloudflareSyncQueued = false;
      setTimeout(() => runCloudflareSync().catch(err => console.warn("Cloudflare queued sync:", err)), 500);
    }
  }
}

async function refreshTelegramWorkerStatus({ persistConnection = false } = {}) {
  const url = normalizeWorkerUrl(state.stockSettings?.cloudflareWorkerUrl || "");
  if (!url) throw new Error("Isi Cloudflare Worker URL dulu.");
  const status = await getTelegramWorkerStatus(url);
  state.telegramWorkerStatus = status;
  if (persistConnection && status.paired && String(status.chatId || "") !== String(state.stockSettings?.telegramChatId || "")) {
    await saveStockSettings({
      ...(state.stockSettings || {}),
      cloudflareWorkerUrl: url,
      telegramChatId: status.chatId || "",
      telegramAllowedUserId: state.stockSettings?.telegramAllowedUserId || ""
    });
  }
  return status;
}

function startRealtime() {
  clearSubscriptions();

  state.unsubs.push(
    watchSchedules(
      rows => { state.schedules = rows; renderShell(); },
      err => console.error("Schedule listener:", err)
    )
  );

  state.unsubs.push(
    watchChecklist(
      rows => { state.checklist = rows; renderShell(); },
      err => console.error("Checklist listener:", err)
    )
  );

  state.unsubs.push(
    watchChecklistCompletions(
      rows => { state.checklistCompletions = rows; if (state.page === "checklist") renderShell(); },
      err => console.error("Checklist completion listener:", err)
    )
  );

  state.unsubs.push(
    watchScheduleRules(
      rules => {
        if (rules) state.scheduleRules = normalizeRules(rules);
        renderShell();
      },
      err => console.error("Schedule rules listener:", err)
    )
  );

  if (isAdmin(state.profile)) {
    state.unsubs.push(
      watchStockItems(
        rows => { state.stockItems = rows; scheduleCloudflareSync(); renderShell(); },
        err => console.error("Stock items listener:", err)
      )
    );
    state.unsubs.push(
      watchStockMovements(
        rows => { state.stockMovements = rows; scheduleCloudflareSync(); if (["dashboard","stock","order"].includes(state.page)) renderShell(); },
        err => console.error("Stock movements listener:", err)
      )
    );
    state.unsubs.push(
      watchStockOpnames(
        rows => { state.stockOpnames = rows; scheduleCloudflareSync(); if (["dashboard","stock","opname","order"].includes(state.page)) renderShell(); },
        err => console.error("Stock opname listener:", err)
      )
    );
    state.unsubs.push(
      watchStockSettings(
        settings => {
          state.stockSettings = settings || state.stockSettings;
          scheduleCloudflareSync(500);
          if (normalizeWorkerUrl(state.stockSettings?.cloudflareWorkerUrl || "") && !state.telegramWorkerStatus) {
            refreshTelegramWorkerStatus().then(() => { if (state.page === "settings") renderShell(); }).catch(() => {});
          }
          if (["stock","settings"].includes(state.page)) renderShell();
        },
        err => console.error("Stock settings listener:", err)
      )
    );
    state.unsubs.push(
      watchWasteItems(
        rows => { state.wasteItems = rows; scheduleCloudflareSync(); if (state.page === "waste") renderShell(); },
        err => console.error("Waste items listener:", err)
      )
    );
    state.unsubs.push(
      watchWasteDays(
        rows => { state.wasteDays = rows; scheduleCloudflareSync(); if (["dashboard","waste"].includes(state.page)) renderShell(); },
        err => console.error("Waste days listener:", err)
      )
    );
    state.unsubs.push(
      watchPersonalReports(
        rows => { state.personalReports = rows; if (state.page === "reports") renderShell(); },
        err => console.error("Personal reports listener:", err)
      )
    );
    state.unsubs.push(
      watchAppSettings(
        settings => { state.appSettings = settings || state.appSettings; if (state.page === "settings") renderShell(); },
        err => console.error("App settings listener:", err)
      )
    );
  }
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "SELAMAT PAGI";
  if (hour < 15) return "SELAMAT SIANG";
  if (hour < 19) return "SELAMAT SORE";
  return "SELAMAT MALAM";
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(value) {
  if (!value) return "-";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(y, m - 1, d));
}

function shiftClass(shift = "") {
  const key = shift.toLowerCase();
  if (key === "s1") return "s1";
  if (key === "s2") return "s2";
  if (key === "middle") return "middle";
  if (key === "libur") return "libur";
  if (key === "lembur") return "lembur";
  return "neutral";
}

function emptyState(text) {
  return `<div class="empty-state"><span>—</span><p>${escapeHtml(text)}</p></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

observeAuth(async user => {
  clearSubscriptions();
  state.user = user;

  if (!user) {
    state.profile = null;
    renderAuth();
    return;
  }

  state.profile = await getUserProfile(user.uid);

  if (!state.profile) {
    app.innerHTML = `
      <main class="auth-shell">
        <section class="auth-card standalone-card">
          <div class="brand-lockup"><span class="brand-mark"><span class="brand-glyph">S</span></span><span><strong>${escapeHtml(state.appSettings?.outletName || "SoWork")}</strong><small>${escapeHtml(state.appSettings?.branchName || "Operations Hub")}</small></span></div>
          <span class="overline">ACCOUNT SETUP</span>
          <h2>Profil user belum ada</h2>
          <p class="muted">Akun Authentication ditemukan, tetapi document <code>users/${user.uid}</code> belum ada.</p>
          <button id="logout-orphan" class="primary">Keluar</button>
        </section>
      </main>`;
    document.querySelector("#logout-orphan").onclick = logout;
    return;
  }

  if (state.profile.active === false) {
    await logout();
    alert("Akun dinonaktifkan.");
    return;
  }

  state.page = "dashboard";
  renderShell();
  startRealtime();
});
