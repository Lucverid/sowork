import "./style.css";
import { getUserProfile, isAdmin, login, logout, observeAuth, registerViewer } from "./auth/auth.js";
import { watchSchedules, saveSchedule, removeSchedule, watchScheduleRules, saveScheduleRules, replaceScheduleRange } from "./modules/schedule/schedule.js";
import { DEFAULT_SCHEDULE_RULES, cleanNames, generateSchedule, normalizeRules, suggestNextOffRotation, summarizeScheduleEntries } from "./modules/schedule/generator.js";
import { exportScheduleWorkbook, exportScheduleSheetReadyWorkbook } from "./modules/schedule/export.js";
import { watchChecklist, saveChecklistItem, removeChecklistItem, watchChecklistCompletions, saveChecklistCompletion } from "./modules/checklist/checklist.js";
import { watchStockItems, watchStockMovements, watchStockOpnames, watchStockSettings, saveStockItem, removeStockItem, saveStockReceipt, saveDailyStockUsage, saveStockOpname, removeStockOpnameDay, saveStockSettings, seedStockReference, normalizeWhatsappNumber, qtyFromCartonInput, cartonBreakdown } from "./modules/stock/stock.js";
import { buildStockAnalytics, stockAlertRows, buildWhatsappAlertMessage, calculateTheoreticalStock, buildStockReconciliation } from "./modules/stock/analytics.js";
import { watchWasteItems, watchWasteDays, saveWasteItem, archiveWasteItem, restoreWasteItem, permanentDeleteWasteItem, saveWasteDay, removeWasteDay, seedWasteReference } from "./modules/waste/waste.js";
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
  scheduleIncludeCarryover: true,
  scheduleLoaded: false,
  scheduleError: "",
  stockItems: [],
  stockMovements: [],
  stockOpnames: [],
  stockSettings: { whatsappNumber: "", autoWhatsappEnabled: false, notifyCriticalOnly: true, notifyLowStock: false, whatsappTemplateName: "stock_alert_sowork", whatsappTemplateLanguage: "id", telegramEnabled: false, cloudflareWorkerUrl: "", telegramChatId: "", telegramAllowedUserId: "", telegramPairCode: "", telegramWhatsappNumber: "", telegramNotifyLowStock: true, telegramNotifyOrderDue: true, telegramNotifyWasteHigh: true, telegramNotifyWasteRiskDay: true, telegramNotifyDailyCheck: true, telegramNotifyOpsReminder: true, telegramOpsReminderHour: 20, defaultLeadTimeDays: 2, defaultTargetCoverageDays: 7 },
  stockSearch: "",
  stockStatusFilter: "Semua",
  opnameDate: null,
  opnameMonth: null,
  opnameSearch: "",
  opnameFilter: "Semua",
  stockUsageDate: null,
  stockUsageMonth: null,
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
  cloudflareLastSnapshotFingerprint: "",
  cloudflareSyncWatchdog: null,
  renderFrame: null,
  unsubs: []
};

function clearSubscriptions() {
  state.unsubs.forEach(fn => fn?.());
  state.unsubs = [];
  if (state.renderFrame) {
    cancelAnimationFrame(state.renderFrame);
    state.renderFrame = null;
  }
  clearTimeout(state.cloudflareSyncTimer);
  state.cloudflareSyncTimer = null;
  if (state.cloudflareSyncWatchdog) {
    clearInterval(state.cloudflareSyncWatchdog);
    state.cloudflareSyncWatchdog = null;
  }
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
    grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
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

function showToast(message, type = "success", title = "") {
  let host = document.querySelector("#sowork-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "sowork-toast-host";
    host.className = "sowork-toast-host";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  const labels = { success: "Tersimpan", error: "Gagal", warning: "Perhatian", info: "Info" };
  const icons = { success: "✓", error: "!", warning: "!", info: "i" };
  toast.className = `sowork-toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `<span class="sowork-toast-icon">${icons[type] || icons.info}</span><div><strong>${escapeHtml(title || labels[type] || "Info")}</strong><p>${escapeHtml(message || "")}</p></div><button type="button" aria-label="Tutup">×</button>`;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  const remove = () => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 180); };
  toast.querySelector("button")?.addEventListener("click", remove);
  setTimeout(remove, type === "error" ? 5200 : 3200);
}

function saveStateMarkup(id, stateName = "idle", label = "Siap disimpan", detail = "") {
  return `<span id="${id}" class="save-state ${stateName}" data-save-state="${stateName}"><i></i><span><b>${escapeHtml(label)}</b>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span></span>`;
}

function setSaveState(target, stateName, label, detail = "") {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) return;
  el.className = `save-state ${stateName}`;
  el.dataset.saveState = stateName;
  el.innerHTML = `<i></i><span><b>${escapeHtml(label)}</b>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span>`;
}

function bindDirtyState(form, target, label = "Ada perubahan belum disimpan") {
  if (!form) return;
  const mark = () => setSaveState(target, "dirty", label, "Tekan Simpan untuk menerapkan perubahan");
  form.addEventListener("input", mark);
  form.addEventListener("change", mark);
}

function savedTimeLabel() {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function scheduleRender(allowedPages = null) {
  if (Array.isArray(allowedPages) && !allowedPages.includes(state.page)) return;
  if (state.renderFrame) return;
  state.renderFrame = requestAnimationFrame(() => {
    state.renderFrame = null;
    renderShell();
  });
}

function refreshShellChrome() {
  const shell = document.querySelector(".app-shell");
  if (!shell) return false;
  const admin = isAdmin(state.profile);
  const displayName = state.profile?.name || state.user?.email || "User";
  const initials = displayName.trim().slice(0, 1).toUpperCase();
  const outletName = state.appSettings?.outletName || "SoWork";
  const branchName = state.appSettings?.branchName || "Operations Hub";

  const desktopBrand = shell.querySelector(".sidebar .brand-lockup");
  if (desktopBrand) {
    const strong = desktopBrand.querySelector("strong");
    const small = desktopBrand.querySelector("small");
    if (strong) strong.textContent = outletName;
    if (small) small.textContent = branchName;
  }
  const mobileBrand = shell.querySelector(".mobile-brand strong");
  if (mobileBrand) mobileBrand.textContent = outletName;
  const rolePill = shell.querySelector(".role-pill");
  if (rolePill) rolePill.textContent = admin ? "ADMIN ACCESS" : "VIEWER ACCESS";
  const avatar = shell.querySelector(".avatar");
  const topAvatar = shell.querySelector(".top-avatar");
  if (avatar) avatar.textContent = initials;
  if (topAvatar) topAvatar.textContent = initials;
  const accountName = shell.querySelector(".account-copy strong");
  const accountEmail = shell.querySelector(".account-copy small");
  if (accountName) accountName.textContent = displayName;
  if (accountEmail) accountEmail.textContent = state.user?.email || "";

  shell.querySelectorAll("[data-page]").forEach(btn => btn.classList.toggle("active", btn.dataset.page === state.page));
  const mobileMore = shell.querySelector("#mobile-more-btn");
  if (mobileMore) mobileMore.classList.toggle("active", !["dashboard","schedule","checklist","stock"].includes(state.page));
  const overline = shell.querySelector(".page-heading .overline");
  const heading = shell.querySelector(".page-heading h2");
  const context = shell.querySelector(".page-context");
  if (overline) overline.textContent = admin ? "ADMIN WORKSPACE" : "VIEWER WORKSPACE";
  if (heading) heading.textContent = pageTitle(state.page);
  if (context) context.textContent = pageContext(state.page);
  updateNetworkStatus();
  return true;
}

function renderPagePreservingFocus() {
  const active = document.activeElement;
  const insidePage = active && active.closest?.("#page-content");
  let selector = "";
  let selection = null;
  const draftValues = new Map();

  // Bila user sedang mengetik, pertahankan seluruh draft form halaman aktif.
  // Snapshot realtime tidak boleh menghapus angka/nama yang belum sempat disimpan.
  if (insidePage && active.matches?.("input,select,textarea")) {
    document.querySelectorAll("#page-content input, #page-content select, #page-content textarea").forEach(control => {
      const key = control.id ? `#${CSS.escape(control.id)}` : control.name ? `[name="${CSS.escape(control.name)}"]` : "";
      if (!key || draftValues.has(key)) return;
      draftValues.set(key, { value: control.value, checked: control.checked, type: control.type });
    });
    if (active.id || active.name) {
      selector = active.id ? `#${CSS.escape(active.id)}` : `[name="${CSS.escape(active.name)}"]`;
      if (typeof active.selectionStart === "number") selection = [active.selectionStart, active.selectionEnd];
    }
  }

  renderPage();

  draftValues.forEach((draft, key) => {
    const control = document.querySelector(`#page-content ${key}`);
    if (!control) return;
    if (draft.type === "checkbox" || draft.type === "radio") control.checked = draft.checked;
    else control.value = draft.value;
  });

  if (!selector) return;
  const next = document.querySelector(`#page-content ${selector}`);
  if (!next) return;
  next.focus({ preventScroll: true });
  if (selection && typeof next.setSelectionRange === "function") {
    try { next.setSelectionRange(selection[0], selection[1]); } catch {}
  }
}

function renderShell() {
  // v1.4: shell dibuat sekali. Update realtime cukup menggambar ulang halaman aktif,
  // bukan sidebar + topbar + mobile nav dari nol setiap snapshot Firestore.
  if (refreshShellChrome()) {
    renderPagePreservingFocus();
    return;
  }

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
          ${admin ? (() => {
            const primary = navItems().filter(([id]) => ["dashboard", "schedule", "checklist", "stock"].includes(id));
            const byId = Object.fromEntries(primary.map(item => [item[0], item]));
            const mobileOrder = [byId.dashboard, byId.schedule, ["__menu", "Menu", "grid"], byId.checklist, byId.stock].filter(Boolean);
            return mobileOrder.map(([id, label, icon]) => id === "__menu"
              ? `<button class="mobile-nav-btn mobile-more-btn ${!["dashboard","schedule","checklist","stock"].includes(state.page) ? "active" : ""}" id="mobile-more-btn"><span>${iconSvg(icon, 18)}</span><small>${label}</small></button>`
              : `<button class="mobile-nav-btn ${state.page === id ? "active" : ""}" data-page="${id}"><span>${iconSvg(icon, 18)}</span><small>${label}</small></button>`
            ).join("");
          })() : navItems().slice(0, 3).map(([id, label, icon]) => `
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
      document.querySelector("#mobile-menu-sheet")?.remove();
      renderShell();
    };
  });

  document.querySelector("#mobile-more-btn")?.addEventListener("click", openMobileMenu);
  document.querySelector("#logout-btn").onclick = logout;
  updateNetworkStatus();
  renderPage();
}

function openMobileMenu() {
  document.querySelector("#mobile-menu-sheet")?.remove();
  const items = navItems().filter(([id]) => !["dashboard", "schedule", "checklist", "stock"].includes(id));
  const sheet = document.createElement("div");
  sheet.id = "mobile-menu-sheet";
  sheet.className = "mobile-menu-backdrop";
  sheet.innerHTML = `
    <section class="mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="Menu SoWork">
      <span class="mobile-menu-handle" aria-hidden="true"></span>
      <div class="mobile-menu-head"><div><h3>Menu lainnya</h3><p class="muted small-copy">Akses modul operasional</p></div><button class="modal-close mobile-menu-close" type="button" aria-label="Tutup">×</button></div>
      <div class="mobile-menu-grid">
        ${items.map(([id,label,icon]) => `<button class="mobile-menu-item ${state.page === id ? "active" : ""}" data-mobile-page="${id}"><span>${iconSvg(icon,20)}</span><strong>${escapeHtml(label)}</strong></button>`).join("")}
      </div>
    </section>`;
  document.body.appendChild(sheet);
  const close = () => sheet.remove();
  sheet.querySelector(".mobile-menu-close")?.addEventListener("click", close);
  sheet.addEventListener("click", e => { if (e.target === sheet) close(); });
  sheet.querySelectorAll("[data-mobile-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.page = btn.dataset.mobilePage;
      close();
      renderShell();
    });
  });
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

function normalizeScheduleRows(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map(row => ({
      ...row,
      date: String(row?.date || "").trim(),
      crewName: String(row?.crewName || "").trim(),
      shift: String(row?.shift || "").trim(),
      role: String(row?.role || "").trim()
    }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.crewName);
}

function scheduleMonthForDate(value) {
  const key = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (day > 25) date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function latestScheduleMonth(entries = []) {
  const dates = normalizeScheduleRows(entries).map(x => x.date).sort();
  return dates.length ? scheduleMonthForDate(dates[dates.length - 1]) : null;
}

function safeScheduleMonth(value, fallback = defaultScheduleMonth()) {
  return /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;
}

function scheduleRangeKeys(monthKey, includeCarryover = true) {
  const safe = safeScheduleMonth(monthKey);
  const [year, month] = safe.split("-").map(Number);
  const start = includeCarryover ? new Date(year, month - 2, 26) : new Date(year, month - 1, 1);
  const end = new Date(year, month - 1, 25);
  return { start: localDateKey(start), end: localDateKey(end) };
}

function schedulesForPeriod(entries, monthKey, includeCarryover = true) {
  const range = scheduleRangeKeys(monthKey, includeCarryover);
  return normalizeScheduleRows(entries).filter(row => row.date >= range.start && row.date <= range.end);
}

function renderSchedule(target) {
  try {
    renderScheduleContent(target);
  } catch (err) {
    console.error("Schedule page render failed:", err);
    renderScheduleRecovery(target, err);
  }
}

function renderScheduleContent(target) {
  const admin = isAdmin(state.profile);
  const rules = normalizeRules(state.scheduleRules || DEFAULT_SCHEDULE_RULES);
  const validRows = normalizeScheduleRows(state.schedules);
  const newestMonth = latestScheduleMonth(validRows);
  const selected = safeScheduleMonth(state.scheduleMonth, newestMonth || defaultScheduleMonth());
  state.scheduleMonth = selected;

  const includeCarryover = state.scheduleIncludeCarryover !== false;
  state.scheduleIncludeCarryover = includeCarryover;
  const range = scheduleRangeKeys(selected, includeCarryover);
  const periodSchedules = schedulesForPeriod(validRows, selected, includeCarryover);
  const preview = state.schedulePreview;
  const previewEntries = Array.isArray(preview?.entries) ? normalizeScheduleRows(preview.entries) : [];
  const scheduleForGrid = previewEntries.length ? previewEntries : periodSchedules;
  const overtimePeriod = scheduleForGrid.filter(x => Boolean(x.overtime));
  let fairnessSummary = null;
  if (scheduleForGrid.length) {
    try {
      fairnessSummary = preview?.summary || summarizeScheduleEntries(scheduleForGrid, [...rules.maleNames, ...rules.femaleNames]);
    } catch (err) {
      console.warn("Schedule fairness summary skipped:", err);
    }
  }
  const hasOtherSchedules = !scheduleForGrid.length && validRows.length > 0 && newestMonth && newestMonth !== selected;
  let overtimeHistoryHtml = "";
  if (admin) {
    try { overtimeHistoryHtml = renderOvertimeHistory(validRows); } catch (err) { console.warn("Overtime history skipped:", err); }
  }

  target.innerHTML = `
    <section class="page-intro schedule-page-intro">
      <div><span class="overline">SMART SCHEDULER</span><h1>Jadwal Kerja</h1><p>Jadwal dibaca dari data valid dan tetap bisa dibuka walaupun ada record lama yang tidak lengkap.</p></div>
      ${admin ? `<span class="access-tag">CRUD + Export</span>` : `<span class="access-tag read">Read only</span>`}
    </section>

    <article class="panel schedule-browser-panel">
      <div class="schedule-browser-main">
        <button id="schedule-prev-month" class="secondary schedule-nav-btn" type="button" aria-label="Periode sebelumnya">‹</button>
        <label class="schedule-period-picker"><span>Periode</span><input id="schedule-view-month" type="month" value="${escapeHtml(selected)}" /></label>
        <button id="schedule-next-month" class="secondary schedule-nav-btn" type="button" aria-label="Periode berikutnya">›</button>
        <button id="schedule-current-period" class="secondary compact" type="button">Periode sekarang</button>
      </div>
      <div class="schedule-browser-meta">
        <strong>${escapeHtml(monthTitle(selected))}</strong>
        <span>${escapeHtml(formatDate(range.start))} – ${escapeHtml(formatDate(range.end))}</span>
        <label class="switch-line schedule-range-switch"><input id="carryover-toggle" type="checkbox" ${includeCarryover ? "checked" : ""} /> Periode 26 → 25</label>
      </div>
    </article>

    ${state.scheduleError ? `<div class="validation-box warning"><strong>Sinkronisasi jadwal bermasalah</strong><span>${escapeHtml(state.scheduleError)}</span></div>` : ""}
    ${!state.scheduleLoaded && !validRows.length ? `<article class="panel schedule-loading-panel"><div class="loading-row"><span class="loading-spinner"></span><div><strong>Memuat jadwal…</strong><small>Mengambil data realtime dari Firestore.</small></div></div></article>` : ""}
    ${hasOtherSchedules ? `<div class="validation-box info schedule-empty-recovery"><strong>Periode ini belum punya jadwal.</strong><span>Jadwal terbaru ada di ${escapeHtml(monthTitle(newestMonth))}.</span><button id="open-latest-schedule" class="secondary compact" type="button">Buka jadwal terbaru</button></div>` : ""}
    ${validRows.length !== (Array.isArray(state.schedules) ? state.schedules.length : 0) ? `<div class="validation-box warning"><strong>Ada data jadwal lama yang dilewati</strong><span>${Math.max(0, (state.schedules?.length || 0) - validRows.length)} record tidak punya tanggal/nama crew yang valid sehingga tidak dipakai untuk mencegah halaman crash.</span></div>` : ""}

    ${admin ? `
      <article class="panel scheduler-panel">
        <div class="panel-head">
          <div><span class="overline">AUTO GENERATOR</span><h3>Generate Jadwal</h3><p class="muted small-copy">Preview mengikuti periode yang sedang dipilih.</p></div>
          <span class="count-pill">${includeCarryover ? "26 → 25" : "1 → 25"}</span>
        </div>
        <div class="scheduler-top-grid scheduler-top-grid-clean">
          <div class="scheduler-hint compact-hint"><strong>${escapeHtml(monthTitle(selected))}</strong><span>${escapeHtml(range.start)} s/d ${escapeHtml(range.end)}</span></div>
          <div class="generator-actions">
            <button id="generate-schedule" class="primary" type="button">Preview Jadwal</button>
            ${previewEntries.length ? `<button id="save-generated" class="secondary" type="button">Simpan Jadwal</button>` : ""}
          </div>
        </div>
        <div class="rule-summary-grid">${ruleSummaryCards(rules)}</div>
        ${preview ? renderPreviewMessage(preview) : `<div class="scheduler-hint"><strong>Rules aktif</strong><span>Senin tanpa Middle · Selasa–Minggu ada Middle · S2 minimal 1 pria · Jumat S1 wanita · Middle hanya Bar/Kitchen-Bar · Lembur tidak dibuat otomatis.</span></div>`}
      </article>

      <details class="panel schedule-rules-disclosure">
        <summary><span><b>Aturan Crew & Rotasi</b><small>Edit hanya saat ada perubahan.</small></span><span>Atur</span></summary>
        <div class="schedule-rules-body">
          <div class="panel-head"><div><span class="overline">CREW & ROTASI</span><h3>Aturan Crew</h3></div><button id="suggest-rotation" class="text-button" type="button">Sarankan rotasi berikutnya</button></div>
          <form id="rules-form" class="rules-form">
            <label class="wide">Pria<input name="maleNames" value="${escapeHtml(rules.maleNames.join(", "))}" /></label>
            <label class="wide">Wanita<input name="femaleNames" value="${escapeHtml(rules.femaleNames.join(", "))}" /></label>
            <div class="offday-grid">${["Senin","Selasa","Rabu","Kamis","Jumat"].map(day => `<label>${day}<input name="off_${day}" value="${escapeHtml((rules.offDays[day] || []).join(", "))}" placeholder="Nama crew libur" /></label>`).join("")}</div>
            <div class="form-foot"><span class="muted small-copy">Generate tidak pernah menambahkan lembur otomatis.</span><button class="secondary">Simpan Rules</button></div>
          </form>
        </div>
      </details>
    ` : `<div class="notice"><strong>Mode Viewer</strong><span>Jadwal dan role dapat dilihat dan berpindah periode. Perubahan hanya dapat dilakukan Admin.</span></div>`}

    ${overtimePeriod.length ? renderOvertimeWarning(overtimePeriod) : ""}

    <article class="panel schedule-grid-panel">
      <div class="panel-head schedule-head-actions">
        <div><span class="overline">PERIOD VIEW</span><h3>${escapeHtml(monthTitle(selected))}</h3><p class="muted small-copy">${scheduleForGrid.length ? `${scheduleForGrid.length} penempatan crew` : "Belum ada data pada periode ini"}</p></div>
        <div class="schedule-toolbar">
          <div class="legend-inline"><span><i class="legend-dot s1"></i>S1</span><span><i class="legend-dot middle"></i>Middle</span><span><i class="legend-dot s2"></i>S2</span><span><i class="legend-dot libur"></i>Libur</span><span><i class="legend-dot lembur"></i>Lembur</span></div>
          ${admin ? `<div class="schedule-export-stack"><div class="table-actions schedule-share-actions"><button id="add-schedule" class="secondary compact">+ Tambah</button><button id="import-schedule" class="secondary compact">Import Excel</button><button id="sheet-ready-schedule" class="secondary compact" title="Import XLSX sebagai sheet baru agar merge tetap utuh.">Sheet-ready (Import)</button><button id="export-schedule" class="secondary compact">Export lengkap</button></div><small class="muted small-copy schedule-export-note">Merge tidak dijamin saat copy-paste cell. Gunakan import XLSX / copy seluruh worksheet.</small></div>` : ""}
        </div>
      </div>
      ${renderScheduleMatrix(scheduleForGrid, rules, admin && !previewEntries.length)}
    </article>

    ${admin && fairnessSummary ? renderFairnessSummary(fairnessSummary) : ""}
    ${overtimeHistoryHtml}
  `;

  const setPeriod = monthKey => {
    if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return;
    state.scheduleMonth = String(monthKey);
    state.schedulePreview = null;
    renderShell();
  };

  document.querySelector("#schedule-view-month")?.addEventListener("change", e => setPeriod(e.target.value));
  document.querySelector("#schedule-prev-month")?.addEventListener("click", () => setPeriod(shiftMonthKey(selected, -1)));
  document.querySelector("#schedule-next-month")?.addEventListener("click", () => setPeriod(shiftMonthKey(selected, 1)));
  document.querySelector("#schedule-current-period")?.addEventListener("click", () => setPeriod(defaultScheduleMonth()));
  document.querySelector("#open-latest-schedule")?.addEventListener("click", () => newestMonth && setPeriod(newestMonth));
  document.querySelector("#carryover-toggle")?.addEventListener("change", e => {
    state.scheduleIncludeCarryover = Boolean(e.target.checked);
    state.schedulePreview = null;
    renderShell();
  });

  if (!admin) return;

  const rulesForm = document.querySelector("#rules-form");
  if (rulesForm) rulesForm.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(rulesForm);
    const nextRules = normalizeRules({
      maleNames: cleanNames(fd.get("maleNames")),
      femaleNames: cleanNames(fd.get("femaleNames")),
      offDays: {
        Senin: cleanNames(fd.get("off_Senin")), Selasa: cleanNames(fd.get("off_Selasa")), Rabu: cleanNames(fd.get("off_Rabu")),
        Kamis: cleanNames(fd.get("off_Kamis")), Jumat: cleanNames(fd.get("off_Jumat")), Sabtu: [], Minggu: []
      },
      version: Number(rules.version || 1)
    });
    try {
      await saveScheduleRules(nextRules);
      state.scheduleRules = nextRules;
      state.schedulePreview = null;
      showToast("Rules jadwal berhasil disimpan.", "success", "Jadwal tersimpan");
    } catch (err) {
      showToast(err?.message || friendlyError(err), "error", "Rules jadwal gagal disimpan");
    }
  };

  document.querySelector("#suggest-rotation")?.addEventListener("click", () => {
    state.scheduleRules = suggestNextOffRotation(rules);
    state.schedulePreview = null;
    renderShell();
  });

  document.querySelector("#generate-schedule")?.addEventListener("click", () => {
    const [year, month] = selected.split("-").map(Number);
    try {
      const result = generateSchedule({ year, month, includeCarryover, rules: state.scheduleRules });
      state.schedulePreview = { ...result, includeCarryover };
      renderShell();
    } catch (err) {
      showToast(err?.message || "Generator jadwal gagal.", "error", "Generator gagal");
    }
  });

  const saveBtn = document.querySelector("#save-generated");
  if (saveBtn) saveBtn.onclick = async () => {
    const p = state.schedulePreview;
    if (!Array.isArray(p?.entries) || !p.entries.length || !p.range) return;
    if (!confirm(`Simpan jadwal ${p.range.start} s/d ${p.range.end}? Data lama pada rentang ini akan diganti.`)) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan...";
    try {
      await replaceScheduleRange(p.range.start, p.range.end, p.entries);
      state.schedulePreview = null;
      showToast("Jadwal otomatis berhasil disimpan.", "success", "Jadwal tersimpan");
    } catch (err) {
      showToast(friendlyError(err), "error", "Jadwal gagal disimpan");
      saveBtn.disabled = false;
      saveBtn.textContent = "Simpan Jadwal";
    }
  };

  document.querySelector("#add-schedule")?.addEventListener("click", () => openScheduleEditor(null, rules, selected));
  document.querySelector("#import-schedule")?.addEventListener("click", () => runExcelImport("schedule"));
  document.querySelector("#sheet-ready-schedule")?.addEventListener("click", () => {
    try {
      exportScheduleSheetReadyWorkbook({ entries: scheduleForGrid, rules, periodLabel: monthTitle(selected), filename: `SoWork-Jadwal-SheetReady-${selected}.xlsx` });
      showToast("Sheet-ready dibuat. Import XLSX sebagai sheet baru agar merge tetap utuh.", "success", "Sheet-ready siap");
    } catch (err) {
      showToast(err?.message || "Export Sheet-ready gagal.", "error", "Export gagal");
    }
  });
  document.querySelector("#export-schedule")?.addEventListener("click", () => {
    try {
      exportScheduleWorkbook({ entries: scheduleForGrid, rules, periodLabel: monthTitle(selected), filename: `SoWork-Jadwal-${selected}.xlsx` });
    } catch (err) {
      showToast(err?.message || "Export gagal.", "error", "Export gagal");
    }
  });

  document.querySelectorAll("[data-edit-schedule]").forEach(btn => {
    btn.onclick = () => {
      const item = validRows.find(x => x.id === btn.dataset.editSchedule);
      if (item) openScheduleEditor(item, rules, selected);
    };
  });
}

function renderScheduleRecovery(target, err) {
  const rows = normalizeScheduleRows(state.schedules);
  const newestMonth = latestScheduleMonth(rows) || defaultScheduleMonth();
  const fallbackRows = schedulesForPeriod(rows, newestMonth, true);
  const message = err?.message || "Terjadi error saat menggambar halaman jadwal.";
  target.innerHTML = `
    <section class="page-intro"><div><span class="overline">SCHEDULE RECOVERY</span><h1>Jadwal Kerja</h1><p>SoWork mengaktifkan mode pemulihan agar halaman tidak blank.</p></div><span class="access-tag read">SAFE MODE</span></section>
    <div class="validation-box warning"><strong>Renderer utama gagal, data tetap aman.</strong><span>${escapeHtml(message)}</span></div>
    <article class="panel">
      <div class="panel-head"><div><span class="overline">LATEST VALID DATA</span><h3>${escapeHtml(monthTitle(newestMonth))}</h3></div><button id="schedule-retry" class="secondary compact" type="button">Coba lagi</button></div>
      ${fallbackRows.length ? `<div class="schedule-matrix-wrap"><table class="schedule-matrix"><thead><tr><th>Tanggal</th><th>Crew</th><th>Shift</th><th>Role</th></tr></thead><tbody>${fallbackRows.map(row => `<tr><td>${escapeHtml(formatDate(row.date))}</td><td><strong>${escapeHtml(row.crewName)}</strong></td><td>${escapeHtml(row.shift || "-")}</td><td>${escapeHtml(row.role || "-")}</td></tr>`).join("")}</tbody></table></div>` : emptyState("Belum ada data jadwal valid untuk ditampilkan.")}
    </article>`;
  document.querySelector("#schedule-retry")?.addEventListener("click", () => renderShell());
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
      showToast(`Jadwal ${crewName} ${formatDate(fd.get("date"))} berhasil disimpan.`, "success", "Jadwal tersimpan");
      close();
    } catch (err) {
      showToast(err?.message || friendlyError(err), "error", "Jadwal gagal disimpan");
    }
  };

  modal.querySelector("#delete-schedule")?.addEventListener("click", async () => {
    if (!confirm(`Hapus jadwal ${current.crewName} tanggal ${current.date}?`)) return;
    try {
      await removeSchedule(current.id);
      showToast(`Jadwal ${current.crewName} berhasil dihapus.`, "success", "Jadwal dihapus");
      close();
    } catch (err) {
      showToast(err?.message || friendlyError(err), "error", "Gagal menghapus jadwal");
    }
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
        try {
          await removeChecklistItem(item.id);
          showToast(`Task “${item.title}” dihapus.`, "success", "Checklist diperbarui");
        } catch (err) { showToast(err?.message || friendlyError(err), "error", "Gagal menghapus task"); }
      };
    });
    document.querySelectorAll("[data-toggle-check]").forEach(btn => {
      btn.onclick = async () => {
        const assignment = assignments.find(x => x.id === btn.dataset.toggleCheck);
        if (!assignment) return;
        const current = completionMap[assignment.id];
        try {
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
          showToast(!Boolean(current?.completed) ? `“${assignment.title}” ditandai selesai.` : `Status “${assignment.title}” dibuka kembali.`, "success", "Daily Check tersimpan");
        } catch (err) { showToast(err?.message || friendlyError(err), "error", "Daily Check gagal diperbarui"); }
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
      showToast(`Task “${fd.get("title")}” berhasil ${rawItem ? "diperbarui" : "ditambahkan"}.`, "success", "Checklist tersimpan");
      close();
    } catch (err) {
      showToast(err?.message || friendlyError(err), "error", "Checklist gagal disimpan");
    }
  };
}


function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/\s+/g, " ")
    .trim();
}

function applyStockFilters() {
  const query = normalizeSearchText(state.stockSearch);
  const status = state.stockStatusFilter || "Semua";
  let visible = 0;
  document.querySelectorAll("#stock-table-body [data-stock-row]").forEach(row => {
    const matchQuery = !query || normalizeSearchText(row.dataset.searchText).includes(query);
    const matchStatus = status === "Semua" || row.dataset.status === status || row.dataset.velocity === status;
    row.hidden = !(matchQuery && matchStatus);
    if (!row.hidden) visible += 1;
  });
  const empty = document.querySelector("#stock-empty-row");
  if (empty) empty.hidden = visible !== 0;
  const count = document.querySelector("#stock-visible-count");
  if (count) count.textContent = `${visible} / ${state.stockItems.filter(x => x.active !== false).length}`;
}

function applyOpnameFilter() {
  const query = normalizeSearchText(state.opnameSearch);
  const filter = state.opnameFilter || "Semua";
  let visible = 0;
  document.querySelectorAll("#opname-form [data-opname-row]").forEach(card => {
    const matchQuery = !query || normalizeSearchText(card.dataset.searchText).includes(query);
    const matchFilter = filter === "Semua"
      || (filter === "Belum diisi" && card.dataset.hasExisting !== "true")
      || (filter === "Selisih" && card.dataset.reconStatus && card.dataset.reconStatus !== "Sesuai")
      || (filter === "Krusial" && card.dataset.critical === "true");
    card.hidden = !(matchQuery && matchFilter);
    if (!card.hidden) visible += 1;
  });
  document.querySelectorAll("[data-opname-filter]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.opnameFilter === filter);
  });
  const summary = document.querySelector("#opname-visible-count");
  if (summary) summary.textContent = String(visible);
  const saveCount = document.querySelector("#opname-save-count");
  if (saveCount) saveCount.textContent = `${visible} barang tampil`;
  const saveBar = document.querySelector("#opname-save-bar");
  if (saveBar) saveBar.hidden = visible === 0;
  const empty = document.querySelector("#opname-filter-empty");
  if (empty) empty.hidden = visible !== 0;
}

function buildStockUsageCalendar(usageRows, monthKey) {
  const today = localDateKey(new Date());
  const safeMonth = /^\d{4}-\d{2}$/.test(String(monthKey || "")) ? monthKey : today.slice(0, 7);
  const [year, month] = safeMonth.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const byDate = new Map();

  usageRows.forEach(row => {
    if (!row?.date || !String(row.date).startsWith(safeMonth)) return;
    const current = byDate.get(row.date) || { rows: 0, used: 0 };
    current.rows += 1;
    if (Number(row.qty || 0) > 0) current.used += 1;
    byDate.set(row.date, current);
  });

  const cells = [];
  for (let i = 0; i < mondayOffset; i += 1) cells.push('<span class="usage-calendar-day is-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = `${safeMonth}-${String(day).padStart(2, "0")}`;
    const stats = byDate.get(dateKey);
    const isToday = dateKey === today;
    cells.push(`
      <button type="button" class="usage-calendar-day ${stats ? "has-usage" : ""} ${isToday ? "is-today" : ""}" data-open-usage-date="${escapeHtml(dateKey)}" aria-label="${escapeHtml(formatDate(dateKey))}${stats ? `, ${stats.used} barang digunakan` : ", belum ada penggunaan"}">
        <span class="usage-calendar-number">${day}</span>
        ${stats ? `<span class="usage-calendar-badge">${stats.used}</span><small>${stats.used ? "terisi" : "0"}</small>` : `<small>${isToday ? "hari ini" : ""}</small>`}
      </button>`);
  }

  return `
    <div class="usage-calendar-weekdays" aria-hidden="true">
      ${["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map(x => `<span>${x}</span>`).join("")}
    </div>
    <div class="usage-calendar-grid">${cells.join("")}</div>`;
}

function shiftMonthKey(monthKey, offset) {
  const today = localDateKey(new Date());
  const safeMonth = /^\d{4}-\d{2}$/.test(String(monthKey || "")) ? monthKey : today.slice(0, 7);
  const [year, month] = safeMonth.split("-").map(Number);
  const value = new Date(year, month - 1 + offset, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function renderStock(target) {
  const admin = isAdmin(state.profile);
  if (!admin) return renderPlaceholder(target);

  const analytics = buildStockAnalytics(state.stockItems, state.stockOpnames, state.stockMovements);
  const alerts = stockAlertRows(analytics);
  const criticalCount = analytics.filter(x => x.status === "Kritis").length;
  const lowCount = analytics.filter(x => x.status === "Menipis").length;
  const fastCount = analytics.filter(x => x.velocity === "Fast").length;
  const status = state.stockStatusFilter || "Semua";
  const deliveries = state.stockMovements.filter(x => x.type === "IN").slice(0, 18);
  const usageRows = state.stockMovements.filter(x => x.type === "OUT");
  const todayKey = localDateKey(new Date());
  const usageMonth = state.stockUsageMonth || todayKey.slice(0, 7);
  state.stockUsageMonth = usageMonth;
  const monthUsageRows = usageRows.filter(x => String(x.date || "").startsWith(usageMonth));
  const usageDaysRecorded = new Set(monthUsageRows.filter(x => Number(x.qty || 0) > 0).map(x => x.date)).size;

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

    <nav class="stock-workspace-switch" aria-label="Akses cepat Stock">
      <button type="button" data-stock-jump="stock-usage-section"><span>${iconSvg("calendar", 17)}</span><strong>Penggunaan</strong><small>Input harian</small></button>
      <button type="button" data-stock-jump="stock-master-section"><span>${iconSvg("box", 17)}</span><strong>Data Stock</strong><small>Cari & pantau</small></button>
    </nav>

    <article id="stock-usage-section" class="panel stock-usage-history-panel usage-calendar-panel stock-daily-panel">
      <div class="stock-section-title">
        <div>
          <span class="overline">PENGGUNAAN HARIAN</span>
          <h3>Kalender penggunaan</h3>
        </div>
        <button id="open-usage-today" class="secondary compact stock-today-btn">Hari ini</button>
      </div>
      <div class="usage-calendar-toolbar stock-calendar-toolbar">
        <button id="usage-prev-month" class="secondary usage-month-button" type="button" aria-label="Bulan sebelumnya">‹</button>
        <div class="usage-calendar-month">
          <strong>${escapeHtml(formatMonthKey(usageMonth))}</strong>
          <span>${usageDaysRecorded} hari · ${monthUsageRows.filter(x => Number(x.qty || 0) > 0).length} entri</span>
        </div>
        <button id="usage-next-month" class="secondary usage-month-button" type="button" aria-label="Bulan berikutnya">›</button>
      </div>
      ${buildStockUsageCalendar(usageRows, usageMonth)}
      <p class="stock-calendar-hint">Tap tanggal untuk input atau edit. Angka kecil menunjukkan jumlah barang yang terisi.</p>
    </article>

    <article id="stock-master-section" class="panel stock-master-panel">
      <div class="panel-head stock-panel-head">
        <div><span class="overline">DATA STOCK</span><h3>Daftar Stock <span id="stock-visible-count" class="inline-count">${analytics.length} / ${analytics.length}</span></h3></div>
        <div class="stock-primary-actions">
          <button id="add-stock-receipt" class="primary compact">+ Barang Masuk</button>
          <details class="stock-more-actions">
            <summary class="secondary compact">Lainnya</summary>
            <div class="stock-more-menu">
              <button id="add-stock-item" class="secondary compact" type="button">+ Barang baru</button>
              <button id="stock-settings" class="secondary compact" type="button">Alert Bot</button>
              <button id="import-stock" class="secondary compact" type="button">Import Excel</button>
              <button id="export-stock" class="secondary compact" type="button">Export Excel</button>
            </div>
          </details>
        </div>
      </div>

      <div class="stock-filters stock-filters-modern">
        <label class="search-control">Cari barang<input id="stock-search" type="search" autocomplete="off" value="${escapeHtml(state.stockSearch || "")}" placeholder="Nama / kategori..." /></label>
        <label>Status<select id="stock-status-filter">
          ${["Semua","Kritis","Menipis","Aman","Fast","Medium","Slow"].map(x => `<option ${x === status ? "selected" : ""}>${x}</option>`).join("")}
        </select></label>
      </div>

      <div class="stock-table-wrap">
        <table class="stock-table">
          <thead><tr><th>Barang</th><th>Stok</th><th>Status</th><th>Pemakaian</th><th>Prediksi</th><th>Saran Order</th><th></th></tr></thead>
          <tbody id="stock-table-body">
            ${analytics.map(item => `
              <tr data-stock-row="${escapeHtml(item.id)}" data-search-text="${escapeHtml(`${item.name || ""} ${item.category || ""}`)}" data-status="${escapeHtml(item.status)}" data-velocity="${escapeHtml(item.velocity)}">
                <td data-label="Barang">
                  <div class="stock-name-cell">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${escapeHtml(item.category || "Bahan")}${item.cartonSize ? ` · 1 karton = ${formatQty(item.cartonSize)} ${escapeHtml(item.unit)}` : ""}</span>
                    ${item.criticalItem ? `<span class="critical-label">● Item krusial</span>` : ""}
                  </div>
                </td>
                <td data-label="Stok">
                  <strong class="stock-main-qty">${escapeHtml(formatQtyWithCarton(item.currentQty, item))}</strong>
                  <small class="block">${formatQty(item.currentQty)} ${escapeHtml(item.unit)}</small>
                </td>
                <td data-label="Status">
                  <span class="stock-status ${stockStatusClass(item.status)}">${escapeHtml(item.status)}</span>
                  <small class="block threshold-copy">Kritis ≤ ${formatQty(item.criticalThreshold || 0)} · Menipis ≤ ${formatQty(item.lowThreshold || 0)}</small>
                </td>
                <td data-label="Pemakaian">
                  <span class="velocity-badge ${velocityClass(item.velocity)}">${escapeHtml(item.velocity)}</span>
                  <small class="block">${item.avgDailyUsage > 0 ? `${formatQty(item.avgDailyUsage)} ${escapeHtml(item.unit)}/hari` : "Belum cukup data"}${item.usageSource === "daily-usage" ? `<br><em>${item.usageDays} hari input nyata</em>` : item.historyCount ? `<br><em>estimasi dari SO</em>` : ""}</small>
                </td>
                <td data-label="Prediksi">
                  ${item.predictedOutDate ? `
                    <div class="prediction-cell">
                      <strong>Habis ~ ${escapeHtml(formatDate(item.predictedOutDate))}</strong>
                      <span>${Number.isFinite(item.daysCover) ? `${item.daysCover.toFixed(1)} hari lagi` : ""}</span>
                      <small>Order: ${item.orderDueNow ? "Hari ini" : escapeHtml(formatDate(item.recommendedOrderDate))}</small>
                      <em>${escapeHtml(item.predictionConfidence)} · ${item.historyCount} snapshot</em>
                    </div>
                  ` : `<div class="prediction-cell muted"><strong>Belum ada prediksi</strong><span>${item.historyCount || 0} snapshot SO</span><small>Minimal 2 snapshot berbeda tanggal</small></div>`}
                </td>
                <td data-label="Saran Order">
                  ${item.recommendedQty > 0
                    ? `<strong>${escapeHtml(formatQtyWithCarton(item.recommendedQty, item))}</strong><small class="block">${formatQty(item.recommendedQty)} ${escapeHtml(item.unit)}</small>`
                    : `<span class="muted">Belum perlu</span>`}
                </td>
                <td data-label="Aksi"><button class="secondary small stock-edit-btn" data-edit-stock="${escapeHtml(item.id)}">Edit Barang</button></td>
              </tr>
            `).join("")}
            <tr id="stock-empty-row" hidden><td colspan="7">${emptyState("Tidak ada barang sesuai filter.")}</td></tr>
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

  `;

  document.querySelector("#seed-stock-reference")?.addEventListener("click", async () => {
    if (!confirm("Import referensi SO Agustus ke Firestore? Lakukan hanya saat master stock masih kosong.")) return;
    const btn = document.querySelector("#seed-stock-reference");
    btn.disabled = true; btn.textContent = "Mengimport...";
    try { await seedStockReference(); showToast("Referensi Stock berhasil dimuat.", "success", "Data Stock tersimpan"); }
    catch (err) { showToast(err?.message || friendlyError(err), "error", "Referensi Stock gagal dimuat"); btn.disabled = false; btn.textContent = "Muat Referensi SO Agustus"; }
  });

  document.querySelector("#stock-search")?.addEventListener("input", e => {
    state.stockSearch = e.target.value;
    applyStockFilters();
  });
  document.querySelector("#stock-status-filter")?.addEventListener("change", e => {
    state.stockStatusFilter = e.target.value;
    applyStockFilters();
  });
  document.querySelector("#import-stock")?.addEventListener("click", () => openStockImportChoice());
  document.querySelector("#export-stock")?.addEventListener("click", () => exportStockWorkbook({ items: state.stockItems, movements: state.stockMovements, opnames: state.stockOpnames, analytics, filename: `SoWork-Stock-${localDateKey(new Date())}.xlsx` }));
  document.querySelector("#add-stock-item")?.addEventListener("click", () => openStockItemEditor(null));
  document.querySelector("#add-stock-receipt")?.addEventListener("click", () => openStockReceiptEditor());
  document.querySelector("#open-usage-today")?.addEventListener("click", () => openDailyStockUsageEditor(localDateKey(new Date())));
  document.querySelector("#usage-prev-month")?.addEventListener("click", () => {
    state.stockUsageMonth = shiftMonthKey(usageMonth, -1);
    renderStock(target);
  });
  document.querySelector("#usage-next-month")?.addEventListener("click", () => {
    state.stockUsageMonth = shiftMonthKey(usageMonth, 1);
    renderStock(target);
  });
  document.querySelectorAll("[data-open-usage-date]").forEach(btn => btn.onclick = () => openDailyStockUsageEditor(btn.dataset.openUsageDate));
  document.querySelectorAll("[data-stock-jump]").forEach(btn => btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.stockJump)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.querySelector("#stock-settings")?.addEventListener("click", () => openStockSettingsEditor());
  document.querySelector("#send-stock-wa")?.addEventListener("click", () => sendStockWhatsapp(alerts));
  document.querySelectorAll("[data-edit-stock]").forEach(btn => {
    btn.onclick = () => {
      const item = state.stockItems.find(x => x.id === btn.dataset.editStock);
      if (item) openStockItemEditor(item);
    };
  });
  applyStockFilters();
}


function buildOpnameCalendar(opnames, monthKey, selectedDate, items = [], movements = [], totalItems = 0) {
  const today = localDateKey(new Date());
  const safeMonth = /^\d{4}-\d{2}$/.test(String(monthKey || "")) ? monthKey : today.slice(0, 7);
  const [year, month] = safeMonth.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const datesWithData = [...new Set((opnames || [])
    .map(row => String(row?.date || ""))
    .filter(date => date.startsWith(safeMonth)))];
  const byDate = new Map();

  for (const date of datesWithData) {
    const rows = buildStockReconciliation(items, opnames, movements, date)
      .filter(row => row.physicalQty != null);
    byDate.set(date, {
      count: rows.length,
      variance: rows.filter(row => row.reconciliationStatus !== "Sesuai").length,
      critical: rows.filter(row => row.reconciliationStatus === "Selisih Kurang").length
    });
  }

  const cells = [];
  for (let i = 0; i < mondayOffset; i += 1) {
    cells.push('<span class="opname-calendar-day is-empty" aria-hidden="true"></span>');
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = `${safeMonth}-${String(day).padStart(2, "0")}`;
    const stats = byDate.get(dateKey);
    const isToday = dateKey === today;
    const isSelected = dateKey === selectedDate;
    const complete = stats && totalItems > 0 && stats.count >= totalItems;
    const status = stats?.critical ? "is-critical" : stats?.variance ? "has-variance" : stats ? "has-data" : "";
    const hint = stats ? `${stats.count} item` : (isToday ? "hari ini" : "");
    cells.push(`
      <button type="button" class="opname-calendar-day ${status} ${complete ? "is-complete" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}" data-opname-calendar-date="${escapeHtml(dateKey)}" aria-label="${escapeHtml(formatDate(dateKey))}${stats ? `, ${stats.count} item tersimpan${stats.variance ? `, ${stats.variance} selisih` : ""}` : ", belum ada Stock Opname"}">
        <span class="opname-calendar-number">${day}</span>
        ${stats ? `<span class="opname-calendar-badge">${stats.count}</span>` : ""}
        <small>${hint}</small>
        ${stats?.variance ? `<i class="opname-calendar-dot" title="${stats.variance} item selisih"></i>` : ""}
      </button>`);
  }

  return `
    <div class="opname-calendar-weekdays" aria-hidden="true">
      ${["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map(x => `<span>${x}</span>`).join("")}
    </div>
    <div class="opname-calendar-grid">${cells.join("")}</div>`;
}

function buildOpnameRestoreRows(date) {
  const dayRows = state.stockOpnames.filter(x => x.date === date);
  return dayRows.map(row => {
    const item = state.stockItems.find(x => x.id === row.itemId);
    if (!item) return null;
    const hasLater = state.stockOpnames.some(x => x.itemId === row.itemId && String(x.date || "") > String(date));
    if (hasLater) return null;
    const previous = state.stockOpnames
      .filter(x => x.itemId === row.itemId && String(x.date || "") < String(date))
      .slice()
      .sort((a,b) => String(a.date || "").localeCompare(String(b.date || "")))
      .at(-1) || null;
    const after = state.stockMovements.filter(m => m.itemId === row.itemId && String(m.date || "") > String(date));
    const incoming = after.filter(x => x.type === "IN").reduce((sum,x) => sum + Math.max(0, Number(x.qty || 0)), 0);
    const usage = after.filter(x => x.type === "OUT").reduce((sum,x) => sum + Math.max(0, Number(x.qty || 0)), 0);
    const base = Number.isFinite(Number(row.systemQtyBeforeOpname))
      ? Number(row.systemQtyBeforeOpname)
      : Number(previous?.totalQty ?? item.currentQty ?? 0);
    const currentQty = Math.max(0, base + incoming - usage);
    return {
      itemId: row.itemId,
      currentQty,
      lastOpnameDate: previous?.date || "",
      lastPrimaryQty: previous ? Number(previous.primaryQty || 0) : currentQty,
      lastSecondaryQty: previous ? Number(previous.secondaryQty || 0) : 0
    };
  }).filter(Boolean);
}

function renderStockOpname(target) {
  const admin = isAdmin(state.profile);
  if (!admin) return renderPlaceholder(target);

  const today = localDateKey(new Date());
  const date = state.opnameDate || today;
  state.opnameDate = date;
  state.opnameMonth ||= String(date).slice(0, 7);
  if (!String(date).startsWith(state.opnameMonth)) state.opnameMonth = String(date).slice(0, 7);
  const opnameMonth = state.opnameMonth;
  const monthOpnames = state.stockOpnames.filter(x => String(x.date || "").startsWith(opnameMonth));
  const monthRecordedDays = new Set(monthOpnames.map(x => x.date)).size;
  const monthUniqueSnapshots = new Set(monthOpnames.map(x => `${x.date}__${x.itemId || x.id || ""}`)).size;
  const search = normalizeSearchText(state.opnameSearch);
  const filter = state.opnameFilter || "Semua";
  const allItems = state.stockItems
    .filter(x => x.active !== false)
    .slice()
    .sort((a,b) => String(a.name).localeCompare(String(b.name), "id"));
  const selectedOpnameRows = state.stockOpnames.filter(x => String(x.date || "") === String(date));
  const existing = Object.fromEntries(allItems.map(item => {
    const exact = selectedOpnameRows.find(row => String(row.itemId || "") === String(item.id || ""));
    const byName = exact || selectedOpnameRows.find(row =>
      normalizeSearchText(row.itemName || row.name || "") === normalizeSearchText(item.name || "")
    );
    return byName ? [item.id, byName] : null;
  }).filter(Boolean));

  // Rekonsiliasi memakai seluruh master + snapshot tanggal terpilih. Snapshot histori
  // yang item-nya sudah diarsipkan/berganti ID tetap ikut dihitung di summary.
  const reconciliationRows = buildStockReconciliation(state.stockItems, state.stockOpnames, state.stockMovements, date);
  const reconciliationByItem = Object.fromEntries(reconciliationRows.map(x => [x.id, x]));
  const savedRecon = reconciliationRows.filter(x => x.physicalQty != null);
  const shortageCount = savedRecon.filter(x => x.reconciliationStatus === "Selisih Kurang").length;
  const overCount = savedRecon.filter(x => x.reconciliationStatus === "Selisih Lebih").length;
  const matchedCount = savedRecon.filter(x => x.reconciliationStatus === "Sesuai").length;
  const savedCount = allItems.filter(item => Boolean(existing[item.id])).length;
  const historicalSavedCount = savedRecon.length;

  target.innerHTML = `
    <section class="page-intro stock-opname-intro opname-intro-compact">
      <div>
        <span class="overline">STOCK OPNAME</span>
        <h1>Stock fisik, lebih cepat dicek.</h1>
        <p>Pilih tanggal, cari barang, lalu isi jumlah di tiap lokasi. Selisih terhadap stok sistem langsung terlihat.</p>
      </div>
      <div class="opname-top-actions">
        <button id="opname-add-item" class="primary compact">+ Barang</button>
        <details class="opname-file-actions">
          <summary class="secondary compact">File</summary>
          <div class="opname-file-menu">
            <button id="import-opname" class="secondary compact" type="button">Import Excel</button>
            <button id="export-opname" class="secondary compact" type="button">Export Excel</button>
          </div>
        </details>
      </div>
    </section>

    <article class="panel opname-calendar-panel-pro">
      <div class="panel-head opname-calendar-head-pro">
        <div>
          <span class="overline">KALENDER STOCK OPNAME</span>
          <h3>${escapeHtml(formatMonthKey(opnameMonth))}</h3>
          <p class="muted small-copy">Tap tanggal untuk melihat, mengisi, atau mengedit SO. Badge = jumlah item tersimpan; titik merah = ada selisih.</p>
        </div>
        <button id="opname-today" class="primary compact" type="button">Hari Ini</button>
      </div>
      <div class="opname-calendar-toolbar-pro">
        <button id="opname-prev-month" class="secondary opname-month-button" type="button" aria-label="Bulan sebelumnya">‹</button>
        <div class="opname-calendar-month-pro">
          <strong>${escapeHtml(formatMonthKey(opnameMonth))}</strong>
          <span>${monthRecordedDays} hari tercatat · ${monthUniqueSnapshots} snapshot item</span>
        </div>
        <button id="opname-next-month" class="secondary opname-month-button" type="button" aria-label="Bulan berikutnya">›</button>
      </div>
      ${buildOpnameCalendar(state.stockOpnames, opnameMonth, date, state.stockItems, state.stockMovements, allItems.length)}
    </article>

    <article class="panel opname-control-panel-modern opname-control-panel-pro">
      <div class="opname-selected-date-pro">
        <div>
          <span class="overline">SO TERPILIH</span>
          <strong>${escapeHtml(formatDate(date))}</strong>
          <small>${savedCount ? `${savedCount}/${allItems.length} item aktif sudah tersimpan` : historicalSavedCount ? `${historicalSavedCount} snapshot histori tersimpan` : "Belum ada SO tersimpan pada tanggal ini"}</small>
        </div>
        <div class="opname-selected-actions-pro">
          ${savedCount ? `<button id="delete-opname-day" type="button" class="text-danger-button">Hapus SO tanggal ini</button>` : ""}
          <label class="opname-date-fallback"><span>Pilih manual</span><input id="opname-date" type="date" value="${escapeHtml(date)}" /></label>
        </div>
      </div>
      <div class="opname-control-top">
        <label class="search-control opname-search">
          <span>Cari barang</span>
          <input id="opname-search" type="search" autocomplete="off" value="${escapeHtml(state.opnameSearch || "")}" placeholder="Nama / kategori..." />
        </label>
        <div class="opname-progress-mini">
          <strong id="opname-visible-count">${allItems.length}</strong>
          <span>tampil · ${savedCount}/${allItems.length} sudah SO</span>
        </div>
      </div>
      <div class="opname-filter-chips" aria-label="Filter Stock Opname">
        ${[
          ["Semua", allItems.length],
          ["Belum diisi", Math.max(0, allItems.length - savedCount)],
          ["Selisih", shortageCount + overCount],
          ["Krusial", allItems.filter(x => x.criticalItem).length]
        ].map(([id,count]) => `<button type="button" class="opname-filter-chip ${filter === id ? "active" : ""}" data-opname-filter="${id}"><span>${id}</span><b>${count}</b></button>`).join("")}
      </div>
    </article>

    <div class="opname-status-strip">
      <div><span>Sesuai</span><strong>${matchedCount}</strong></div>
      <div class="${shortageCount ? "is-alert" : ""}"><span>Kurang</span><strong>${shortageCount}</strong></div>
      <div><span>Lebih</span><strong>${overCount}</strong></div>
      <div><span>Tersimpan</span><strong>${historicalSavedCount}</strong></div>
    </div>

    <form id="opname-form" class="opname-form-modern">
      <div class="opname-list opname-list-modern">
        ${allItems.map(item => {
          const row = existing[item.id] || {};
          const hasExisting = Boolean(existing[item.id]);
          const q1 = row.primaryQty ?? item.lastPrimaryQty ?? item.currentQty ?? 0;
          const q2 = row.secondaryQty ?? item.lastSecondaryQty ?? 0;
          const total = Number(q1 || 0) + Number(q2 || 0);
          const recon = reconciliationByItem[item.id];
          const theoretical = calculateTheoreticalStock(item, date, state.stockOpnames, state.stockMovements);
          const systemQty = Number(recon?.systemQty ?? theoretical.systemQty ?? 0);
          const diff = hasExisting ? Number(recon?.varianceQty ?? (total - systemQty)) : (total - systemQty);
          const tol = Math.max(0.01, Number(systemQty || 0) * 0.0025);
          const reconStatus = hasExisting
            ? (recon?.reconciliationStatus || (Math.abs(diff) <= tol ? "Sesuai" : diff < 0 ? "Selisih Kurang" : "Selisih Lebih"))
            : "";
          const diffClass = Math.abs(diff) <= tol ? "safe" : diff < 0 ? "critical" : "low";
          return `
            <article class="opname-item-card opname-item-modern"
              data-opname-row="${escapeHtml(item.id)}"
              data-search-text="${escapeHtml(`${item.name || ""} ${item.category || ""}`)}"
              data-has-existing="${hasExisting ? "true" : "false"}"
              data-recon-status="${escapeHtml(hasExisting ? reconStatus : "") }"
              data-critical="${item.criticalItem ? "true" : "false"}">
              <div class="opname-item-head opname-item-head-modern">
                <div class="opname-item-title">
                  <div class="opname-title-line">
                    <strong>${escapeHtml(item.name)}</strong>
                    ${item.criticalItem ? `<span class="opname-mini-badge critical">Krusial</span>` : ""}
                    ${hasExisting ? `<span class="opname-mini-badge saved">Tersimpan</span>` : `<span class="opname-mini-badge pending">Belum SO</span>`}
                  </div>
                  <span>${escapeHtml(item.category || "Bahan")} · ${escapeHtml(item.unit || "PCS")}${item.cartonSize ? ` · 1 karton = ${formatQty(item.cartonSize)} ${escapeHtml(item.unit || "PCS")}` : ""}</span>
                </div>
                <button type="button" class="opname-master-link" data-edit-opname-item="${escapeHtml(item.id)}">Edit</button>
              </div>

              <div class="opname-location-grid">
                <label class="opname-location-card">
                  <span class="opname-location-label">Lokasi 1</span>
                  <input class="opname-location-input" name="loc1_${escapeHtml(item.id)}" value="${escapeHtml(row.primaryLocation || item.primaryLocation || "Gudang Utama")}" aria-label="Nama lokasi 1 ${escapeHtml(item.name)}" />
                  <div class="opname-qty-box">
                    <input class="qty-input" inputmode="decimal" name="q1_${escapeHtml(item.id)}" type="number" min="0" step="0.01" value="${Number(q1 || 0)}" aria-label="Jumlah lokasi 1 ${escapeHtml(item.name)}" />
                    <b>${escapeHtml(item.unit || "PCS")}</b>
                  </div>
                </label>
                <label class="opname-location-card">
                  <span class="opname-location-label">Lokasi 2</span>
                  <input class="opname-location-input" name="loc2_${escapeHtml(item.id)}" value="${escapeHtml(row.secondaryLocation || item.secondaryLocation || "Gudang 2")}" aria-label="Nama lokasi 2 ${escapeHtml(item.name)}" />
                  <div class="opname-qty-box">
                    <input class="qty-input" inputmode="decimal" name="q2_${escapeHtml(item.id)}" type="number" min="0" step="0.01" value="${Number(q2 || 0)}" aria-label="Jumlah lokasi 2 ${escapeHtml(item.name)}" />
                    <b>${escapeHtml(item.unit || "PCS")}</b>
                  </div>
                </label>
              </div>

              <div class="opname-result-grid">
                <div><span>Sistem</span><strong>${formatQty(systemQty)} ${escapeHtml(item.unit || "PCS")}</strong></div>
                <div><span>Fisik</span><strong data-total-for="${escapeHtml(item.id)}">${escapeHtml(formatQtyWithCarton(total, item))}</strong><small data-total-base-for="${escapeHtml(item.id)}">${formatQty(total)} ${escapeHtml(item.unit || "PCS")}</small></div>
                <div><span>Selisih</span><strong class="stock-status ${diffClass}" data-diff-for="${escapeHtml(item.id)}">${diff > 0 ? "+" : ""}${formatQty(diff)} ${escapeHtml(item.unit || "PCS")}</strong></div>
              </div>
              <div class="opname-limit-note">Batas: kritis ≤ ${formatQty(item.criticalThreshold || 0)} · menipis ≤ ${formatQty(item.lowThreshold || 0)}</div>
            </article>`;
        }).join("")}
        <div id="opname-filter-empty" hidden>${emptyState("Barang tidak ditemukan untuk filter ini.")}</div>
      </div>

      ${allItems.length ? `
        <div id="opname-save-bar" class="sticky-save-bar opname-save-bar-modern">
          <div class="save-bar-copy">
            <strong>SO ${escapeHtml(formatDate(date))}</strong>
            <span id="opname-save-count">${allItems.length} barang tampil</span>
            ${saveStateMarkup("opname-save-state", savedCount ? "saved" : "idle", savedCount ? `${savedCount} item sudah tersimpan` : "Belum ada SO tersimpan", "Perubahan input akan ditandai otomatis")}
          </div>
          <button class="primary">Simpan SO</button>
        </div>
      ` : ""}
    </form>
  `;

  document.querySelector("#opname-date")?.addEventListener("change", e => {
    state.opnameDate = e.target.value;
    state.opnameMonth = String(e.target.value || today).slice(0, 7);
    renderShell();
  });

  document.querySelector("#opname-prev-month")?.addEventListener("click", () => {
    state.opnameMonth = shiftMonthKey(opnameMonth, -1);
    state.opnameDate = `${state.opnameMonth}-01`;
    renderShell();
  });
  document.querySelector("#opname-next-month")?.addEventListener("click", () => {
    state.opnameMonth = shiftMonthKey(opnameMonth, 1);
    state.opnameDate = `${state.opnameMonth}-01`;
    renderShell();
  });
  document.querySelector("#opname-today")?.addEventListener("click", () => {
    state.opnameMonth = today.slice(0, 7);
    state.opnameDate = today;
    renderShell();
  });
  document.querySelectorAll("[data-opname-calendar-date]").forEach(btn => btn.addEventListener("click", () => {
    state.opnameDate = btn.dataset.opnameCalendarDate;
    state.opnameMonth = String(state.opnameDate).slice(0, 7);
    renderShell();
    requestAnimationFrame(() => document.querySelector(".opname-control-panel-pro")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }));

  document.querySelector("#delete-opname-day")?.addEventListener("click", async () => {
    const dayRows = state.stockOpnames.filter(x => x.date === date);
    if (!dayRows.length) return showToast("Tidak ada data SO pada tanggal ini.", "info", "Stock Opname");
    if (!confirm(`Hapus Stock Opname ${formatDate(date)} (${dayRows.length} item)? Stok sistem akan dipulihkan dengan aman bila ini snapshot terakhir.`)) return;
    const btn = document.querySelector("#delete-opname-day");
    if (btn) { btn.disabled = true; btn.textContent = "Menghapus..."; }
    try {
      const restores = buildOpnameRestoreRows(date);
      await removeStockOpnameDay(date, restores);
      showToast(`Stock Opname ${formatDate(date)} dihapus. ${restores.length ? "Stok sistem terkait sudah dipulihkan." : "Snapshot historis dihapus tanpa mengubah stok aktif."}`, "success", "Stock Opname dihapus");
      state.opnameFilter = "Semua";
      scheduleRender(["opname", "stock", "order", "dashboard"]);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = "Hapus SO tanggal ini"; }
      showToast(err?.message || friendlyError(err), "error", "Gagal menghapus Stock Opname");
    }
  });

  document.querySelector("#opname-search")?.addEventListener("input", e => {
    state.opnameSearch = e.target.value;
    applyOpnameFilter();
  });

  document.querySelectorAll("[data-opname-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.opnameFilter = btn.dataset.opnameFilter || "Semua";
      applyOpnameFilter();
    });
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

  bindDirtyState(document.querySelector("#opname-form"), "#opname-save-state", "Perubahan SO belum disimpan");

  document.querySelectorAll(".qty-input").forEach(input => {
    input.addEventListener("input", () => {
      const card = input.closest("[data-opname-row]");
      const id = card?.dataset.opnameRow;
      if (!id) return;
      const q1 = Number(card.querySelector(`[name="q1_${CSS.escape(id)}"]`)?.value || 0);
      const q2 = Number(card.querySelector(`[name="q2_${CSS.escape(id)}"]`)?.value || 0);
      const total = card.querySelector(`[data-total-for="${CSS.escape(id)}"]`);
      const totalBase = card.querySelector(`[data-total-base-for="${CSS.escape(id)}"]`);
      const item = state.stockItems.find(x => x.id === id);
      if (total) total.textContent = formatQtyWithCarton(q1 + q2, item);
      if (totalBase) totalBase.textContent = `${formatQty(q1 + q2)} ${item?.unit || "PCS"}`;
      const diffEl = card.querySelector(`[data-diff-for="${CSS.escape(id)}"]`);
      const theo = calculateTheoreticalStock(item, state.opnameDate || localDateKey(new Date()), state.stockOpnames, state.stockMovements);
      const saved = existing[id];
      const recon = reconciliationByItem[id];
      const sys = Number(recon?.systemQty ?? saved?.systemQtyBeforeOpname ?? theo.systemQty ?? 0);
      const diff = (q1 + q2) - sys;
      const tol = Math.max(0.01, sys * 0.0025);
      const status = Math.abs(diff) <= tol ? "Sesuai" : diff < 0 ? "Selisih Kurang" : "Selisih Lebih";
      card.dataset.reconStatus = status;
      if (diffEl) {
        diffEl.textContent = `${diff > 0 ? "+" : ""}${formatQty(diff)} ${item?.unit || "PCS"}`;
        diffEl.className = `stock-status ${status === "Sesuai" ? "safe" : diff < 0 ? "critical" : "low"}`;
      }
      if (state.opnameFilter === "Selisih") applyOpnameFilter();
    });
  });

  document.querySelector("#opname-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const visibleIds = new Set([...e.currentTarget.querySelectorAll("[data-opname-row]:not([hidden])")].map(card => card.dataset.opnameRow));
    const submitItems = allItems.filter(item => visibleIds.has(item.id));
    if (!submitItems.length) return;
    const fd = new FormData(e.currentTarget);
    const rows = submitItems.map(item => ({
      itemId: item.id,
      itemName: item.name,
      primaryLocation: fd.get(`loc1_${item.id}`),
      primaryQty: fd.get(`q1_${item.id}`),
      secondaryLocation: fd.get(`loc2_${item.id}`),
      secondaryQty: fd.get(`q2_${item.id}`),
      unit: item.unit,
      ...(() => {
        const physical = Number(fd.get(`q1_${item.id}`) || 0) + Number(fd.get(`q2_${item.id}`) || 0);
        const t = calculateTheoreticalStock(item, date, state.stockOpnames, state.stockMovements);
        const saved = existing[item.id];
        const systemQty = Number(saved?.systemQtyBeforeOpname ?? t.systemQty ?? item.currentQty ?? 0);
        const varianceQty = physical - systemQty;
        const variancePct = systemQty > 0 ? (varianceQty / systemQty) * 100 : null;
        const accuracyPct = systemQty > 0 ? Math.max(0, 100 - (Math.abs(varianceQty) / systemQty * 100)) : (physical === 0 ? 100 : 0);
        const tol = Math.max(0.01, systemQty * 0.0025);
        return {
          systemQtyBeforeOpname: systemQty,
          varianceQty,
          variancePct,
          accuracyPct,
          reconciliationStatus: Math.abs(varianceQty) <= tol ? "Sesuai" : varianceQty < 0 ? "Selisih Kurang" : "Selisih Lebih",
          previousOpnameDate: t.previousOpnameDate,
          incomingSincePrevious: t.incoming,
          usageSincePrevious: t.usage
        };
      })()
    }));

    if (!confirm(`Simpan Stock Opname ${formatDate(date)} untuk ${rows.length} barang? Stok sistem akan dikoreksi ke stok fisik.`)) return;
    const saveButton = e.currentTarget.querySelector("#opname-save-bar button");
    const oldLabel = saveButton?.textContent || "Simpan SO";
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Menyimpan..."; }
    setSaveState("#opname-save-state", "saving", "Menyimpan...", `${rows.length} item sedang diproses`);
    try {
      await saveStockOpname(date, rows, {
        uid: state.user?.uid,
        name: state.profile?.name || state.user?.email
      });
      if (saveButton) saveButton.textContent = "Tersimpan ✓";
      setSaveState("#opname-save-state", "saved", "Tersimpan ✓", `Terakhir disimpan ${savedTimeLabel()}`);
      showToast(`Stock Opname ${formatDate(date)} berhasil disimpan untuk ${rows.length} barang.`, "success", "Stock Opname tersimpan");
      setTimeout(() => scheduleRender(["opname"]), 250);
    } catch (err) {
      setSaveState("#opname-save-state", "error", "Gagal disimpan", err?.message || friendlyError(err));
      showToast(err?.message || friendlyError(err), "error", "Stock Opname gagal disimpan");
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = oldLabel; }
    }
  });
  applyOpnameFilter();
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
              <td data-label="Barang"><strong>${escapeHtml(item.name)}</strong>${item.criticalItem ? `<small class="block critical-label">Item krusial</small>` : ""}</td>
              <td data-label="Stok"><strong>${escapeHtml(formatQtyWithCarton(item.currentQty, item))}</strong><small class="block">${formatQty(item.currentQty)} ${escapeHtml(item.unit)}</small></td>
              <td data-label="Pemakaian">${item.avgDailyUsage > 0 ? `<strong>${formatQty(item.avgDailyUsage)}</strong><small class="block">${escapeHtml(item.unit)}/hari · ${escapeHtml(item.velocity)}</small>` : "Belum cukup data"}</td>
              <td data-label="Prediksi Habis">${item.predictedOutDate ? `<strong>${escapeHtml(formatDate(item.predictedOutDate))}</strong><small class="block">~${item.daysCover.toFixed(1)} hari lagi</small>` : "—"}</td>
              <td data-label="Order Paling Lambat">${item.recommendedOrderDate ? `<strong class="${item.orderDueNow ? "critical-label" : ""}">${item.orderDueNow ? "Hari ini" : escapeHtml(formatDate(item.recommendedOrderDate))}</strong><small class="block">Lead time ${Number(item.leadTimeDays || 2)} hari</small>` : "—"}</td>
              <td data-label="Saran Order"><strong>${item.recommendedQty > 0 ? escapeHtml(formatQtyWithCarton(item.recommendedQty, item)) : "Pantau"}</strong>${item.recommendedQty > 0 ? `<small class="block">${formatQty(item.recommendedQty)} ${escapeHtml(item.unit)}</small>` : ""}</td>
              <td data-label="Data"><span class="stock-status ${stockStatusClass(item.status)}">${escapeHtml(item.status)}</span><small class="block">${escapeHtml(item.predictionConfidence)} · ${item.historyCount} snapshot</small></td>
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
      showToast(`Barang “${fd.get("name")}” berhasil ${rawItem ? "diperbarui" : "ditambahkan"}.`, "success", "Master Stock tersimpan");
      close();
    } catch (err) { showToast(err?.message || friendlyError(err), "error", "Master Stock gagal disimpan"); }
  };
  modal.querySelector("#delete-stock-item")?.addEventListener("click", async () => {
    if (!confirm(`Hapus master barang “${rawItem.name}”? Histori SO lama tetap tersimpan.`)) return;
    try { await removeStockItem(rawItem.id); showToast(`Barang “${rawItem.name}” dihapus dari master.`, "success", "Master Stock diperbarui"); close(); }
    catch (err) { showToast(err?.message || friendlyError(err), "error", "Gagal menghapus barang"); }
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
      showToast(`${item.name} berhasil dicatat sebagai barang masuk.`, "success", "Barang masuk tersimpan");
      close();
    } catch (err) { showToast(err?.message || friendlyError(err), "error", "Barang masuk gagal disimpan"); }
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
      showToast("Penggunaan harian tersimpan. Stok dan prediksi order sudah diperbarui.", "success", "Penggunaan tersimpan");
    }catch(err){showToast(err?.message||friendlyError(err), "error", "Penggunaan gagal disimpan");if(btn){btn.disabled=false;btn.textContent="Simpan Penggunaan";}}
  };
}

function openStockSettingsEditor() {
  const s = state.stockSettings || {};
  const workerUrl = normalizeWorkerUrl(s.cloudflareWorkerUrl || "");
  const workerStatus = state.telegramWorkerStatus;
  const paired = Boolean(workerStatus?.paired || s.telegramChatId);
  const recipientCount = Number(workerStatus?.recipientCount || (paired ? 1 : 0));
  const recipientNames = Array.isArray(workerStatus?.recipients)
    ? workerStatus.recipients.map(x => x.firstName || (x.username ? `@${x.username}` : "")).filter(Boolean)
    : [];
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
            <strong>${paired ? `Telegram Terhubung · ${recipientCount} penerima` : workerUrl ? "Worker siap — belum dipair" : "Worker URL belum diisi"}</strong>
            <small>${paired ? escapeHtml(recipientNames.length ? recipientNames.join(", ") : `Chat ID ${workerStatus?.chatId || s.telegramChatId || "-"}`) : workerStatus?.hasSnapshot ? "Data SoWork sudah tersinkron ke D1." : "Gratis: Firebase Spark tetap dipakai, bot berjalan di Cloudflare Worker."}</small>
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
          <label class="check-line simple"><input name="telegramNotifyDailyCheck" type="checkbox" ${s.telegramNotifyDailyCheck !== false ? "checked" : ""}/><span>Ingatkan Daily Check yang belum selesai</span></label>
          <label class="check-line simple"><input name="telegramNotifyOpsReminder" type="checkbox" ${s.telegramNotifyOpsReminder !== false ? "checked" : ""}/><span>Ingatkan cek Stock + Waste malam</span></label>
        </div>
        <label class="telegram-time-setting">Jam reminder operasional
          <select name="telegramOpsReminderHour">
            <option value="18" ${Number(s.telegramOpsReminderHour || 20) === 18 ? "selected" : ""}>18:00 WIB</option>
            <option value="20" ${Number(s.telegramOpsReminderHour || 20) === 20 ? "selected" : ""}>20:00 WIB</option>
          </select>
          <small class="field-help">Daily Check yang belum selesai dan pengingat cek Stock/Waste dikirim pada jam ini.</small>
        </label>

        <div class="settings-shortcut-actions cloudflare-actions">
          <button type="button" id="check-cloudflare-worker" class="secondary">Cek Worker</button>
          <button type="button" id="setup-telegram-webhook" class="secondary">Pasang Webhook</button>
          <button type="button" id="test-telegram-bot" class="secondary" ${paired ? "" : "disabled"}>Kirim Test</button>
          ${paired ? '<button type="button" id="unpair-telegram" class="danger">Unpair Semua</button>' : ''}
        </div>

        <div class="inline-rule telegram-rule"><strong>Alur gratis:</strong> SoWork menyimpan data utama di Firestore Spark. Saat Admin mengubah Jadwal/Daily Check/Stock/Waste, browser mengirim snapshot terproteksi Firebase ID Token ke Cloudflare D1. Cron Cloudflare kemudian bisa mengingatkan Telegram walaupun SoWork sudah ditutup.</div>
        <div class="inline-rule"><strong>Pairing:</strong> setelah Simpan & Sync + Pasang Webhook, kirim <code>/start KODE</code> ke bot. Kode yang sama bisa dipakai beberapa akun Telegram; pairing baru menambah penerima dan tidak mengganti akun yang sudah terhubung. Setelah itu command <code>/stock</code>, <code>/order</code>, <code>/waste</code>, dan <code>/check</code> aktif.</div>
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
      showToast(status.paired ? `Worker ONLINE · ${Number(status.recipientCount || 1)} penerima.` : `Worker ONLINE · ${status.hasSnapshot ? "Data operasional sudah tersinkron." : "Belum ada snapshot data."}`, "success", "Cloudflare Worker");
      close(); openStockSettingsEditor();
    } catch (err) { showToast(err?.message || friendlyError(err), "error", "Cek Worker gagal"); }
  });

  modal.querySelector("#setup-telegram-webhook")?.addEventListener("click", async () => {
    try {
      const result = await setupTelegramWebhook(currentUrl());
      alert(`Webhook Telegram aktif:\n${result.webhookUrl}`);
    } catch (err) { alert(err?.message || friendlyError(err)); }
  });

  modal.querySelector("#test-telegram-bot")?.addEventListener("click", async () => {
    try {
      const result = await sendTelegramTest(currentUrl());
      showToast(`Pesan test dikirim ke ${Number(result?.sent || 0)} penerima Telegram.`, "success", "Test Telegram berhasil");
    } catch (err) { showToast(err?.message || friendlyError(err), "error", "Test Telegram gagal"); }
  });

  modal.querySelector("#unpair-telegram")?.addEventListener("click", async () => {
    if (!confirm("Putuskan SEMUA akun Telegram yang sudah dipair dari SoWork?")) return;
    try {
      const result = await unpairTelegram(currentUrl());
      state.telegramWorkerStatus = null;
      await saveStockSettings({ ...(state.stockSettings || {}), telegramChatId: "", telegramAllowedUserId: "" });
      showToast(`${Number(result?.removed || 0)} penerima Telegram sudah di-unpair.`, "success", "Telegram diperbarui"); close();
    } catch (err) { showToast(err?.message || friendlyError(err), "error", "Unpair gagal"); }
  });

  modal.querySelector("#stock-settings-form").onsubmit = async e => {
    e.preventDefault();

    // Simpan reference + seluruh nilai form sebelum await.
    // Event.currentTarget dapat menjadi null setelah event handler melewati await.
    const form = e.currentTarget;
    if (!form) return showToast("Form Telegram tidak ditemukan. Tutup Settings lalu buka kembali.", "error", "Form tidak tersedia");

    const fd = new FormData(form);
    const url = normalizeWorkerUrl(fd.get("cloudflareWorkerUrl"));
    if (!url) return showToast("Isi Cloudflare Worker URL yang valid dulu.", "warning", "Worker URL belum valid");

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
      telegramNotifyDailyCheck: Boolean(form.elements.namedItem("telegramNotifyDailyCheck")?.checked),
      telegramNotifyOpsReminder: Boolean(form.elements.namedItem("telegramNotifyOpsReminder")?.checked),
      telegramOpsReminderHour: [18, 20].includes(Number(fd.get("telegramOpsReminderHour"))) ? Number(fd.get("telegramOpsReminderHour")) : 20,
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


function buildWasteCalendar(wasteDays, monthKey, analytics, selectedDate) {
  const today = localDateKey(new Date());
  const safeMonth = /^\d{4}-\d{2}$/.test(String(monthKey || "")) ? monthKey : today.slice(0, 7);
  const [year, month] = safeMonth.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const scoreByDate = new Map((analytics?.dailyScores || []).map(row => [row.date, row]));
  const byDate = new Map();

  wasteDays.forEach(day => {
    if (!day?.date || !String(day.date).startsWith(safeMonth)) return;
    const filled = Object.values(day.values || {}).filter(value => Number(value || 0) > 0).length;
    byDate.set(day.date, { filled });
  });

  const cells = [];
  for (let i = 0; i < mondayOffset; i += 1) cells.push('<span class="waste-calendar-day is-empty" aria-hidden="true"></span>');

  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = `${safeMonth}-${String(day).padStart(2, "0")}`;
    const row = byDate.get(dateKey);
    const score = scoreByDate.get(dateKey);
    const isToday = dateKey === today;
    const isSelected = dateKey === selectedDate;
    const level = score?.level || "normal";
    const statusText = level === "high" ? "tinggi" : level === "watch" ? "pantau" : row ? "terisi" : isToday ? "hari ini" : "";
    cells.push(`
      <button type="button" class="waste-calendar-day ${row ? "has-waste" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${level === "high" ? "is-high" : level === "watch" ? "is-watch" : ""}" data-waste-calendar-date="${escapeHtml(dateKey)}" aria-label="${escapeHtml(formatDate(dateKey))}${row ? `, ${row.filled} item waste terisi` : ", belum ada input"}">
        <span class="waste-calendar-number">${day}</span>
        ${row ? `<span class="waste-calendar-badge">${row.filled}</span>` : ""}
        <small>${statusText}</small>
      </button>`);
  }

  return `
    <div class="waste-calendar-weekdays" aria-hidden="true">
      ${["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map(label => `<span>${label}</span>`).join("")}
    </div>
    <div class="waste-calendar-grid">${cells.join("")}</div>`;
}

function renderWaste(target) {
  if (!isAdmin(state.profile)) return renderPlaceholder(target);
  const today = localDateKey(new Date());
  state.wasteMonth ||= today.slice(0, 7);
  const monthKey = state.wasteMonth;
  const monthDays = state.wasteDays.filter(x => String(x.date || "").startsWith(monthKey));
  const defaultDate = monthKey === today.slice(0, 7) ? today : `${monthKey}-01`;
  if (!state.wasteDate || !String(state.wasteDate).startsWith(monthKey)) state.wasteDate = defaultDate;
  const date = state.wasteDate;
  const dayDoc = state.wasteDays.find(x => x.date === date) || { values: {} };
  const hasDayDoc = state.wasteDays.some(x => x.date === date);
  const activeItems = state.wasteItems.filter(x => x.active !== false);
  const analytics = buildWasteAnalytics(state.wasteItems, state.wasteDays, monthKey, date);
  const maxScore = Math.max(1, ...analytics.dailyScores.map(x => x.score));
  const topDays = analytics.dailyScores.slice().sort((a, b) => b.score - a.score).slice(0, 5);
  const weekdayRisk = analytics.weekdayStats.slice(0, 4);
  const selectedFilled = Object.values(dayDoc.values || {}).filter(value => Number(value || 0) > 0).length;
  const activeCount = state.wasteItems.filter(x => x.active !== false).length;
  const archivedCount = state.wasteItems.filter(x => x.active === false).length;

  target.innerHTML = `
    <section class="page-intro easy-page-intro">
      <div><span class="overline">WASTE</span><h1>Waste harian</h1><p>Catat per tanggal, pantau lonjakan, dan lihat pola bulanan tanpa pindah-pindah form.</p></div>
      <div class="action-row compact-action-rail">
        ${!state.wasteItems.length ? `<button id="seed-waste" class="secondary compact">Muat Histori Juli</button>` : ""}
        <button id="add-waste-item" class="primary compact">+ Item</button>
        <button id="manage-waste-items" class="secondary compact">Kelola Item</button>
        <button id="import-waste" class="secondary compact">Import</button>
        <button id="export-waste" class="secondary compact" ${!activeItems.length ? 'disabled' : ''}>Export</button>
      </div>
    </section>

    <div class="metric-grid waste-kpis compact-metrics">
      <article class="metric-card"><span class="metric-label">Hari tercatat</span><strong>${analytics.recordedDays}</strong><small>${escapeHtml(formatMonthKey(monthKey))}</small></article>
      <article class="metric-card ${analytics.highDays.length ? 'metric-alert' : ''}"><span class="metric-label">Waste tinggi</span><strong>${analytics.highDays.length}</strong><small>${analytics.highDays.length ? 'perlu review' : 'terkendali'}</small></article>
      <article class="metric-card"><span class="metric-label">Trend 7 hari</span><strong class="text-value ${analytics.trend.changePct >= 20 ? 'critical-label' : ''}">${analytics.trend.previous > 0 ? (analytics.trend.changePct >= 0 ? '+' : '') + analytics.trend.changePct.toFixed(0) + '%' : '—'}</strong><small>vs 7 hari lalu</small></article>
      <article class="metric-card"><span class="metric-label">Estimasi biaya</span><strong class="text-value">${analytics.monthlyCost > 0 ? 'Rp ' + formatMoney(analytics.monthlyCost) : '—'}</strong><small>${analytics.monthlyCost > 0 ? 'bulan ini' : 'isi biaya/unit'}</small></article>
    </div>

    <article class="panel waste-calendar-panel">
      <div class="panel-head waste-calendar-head">
        <div>
          <span class="overline">KALENDER INPUT</span>
          <h3>${escapeHtml(formatMonthKey(monthKey))}</h3>
          <p class="muted small-copy">Tap tanggal untuk input atau edit. Badge menunjukkan jumlah item yang terisi.</p>
        </div>
        <button id="waste-today" class="primary compact" type="button">Hari Ini</button>
      </div>
      <div class="waste-calendar-toolbar">
        <button id="waste-prev-month" class="secondary waste-month-button" type="button" aria-label="Bulan sebelumnya">‹</button>
        <div class="waste-calendar-month">
          <strong>${escapeHtml(formatMonthKey(monthKey))}</strong>
          <span>${monthDays.length} hari tercatat · ${analytics.highDays.length} hari tinggi</span>
        </div>
        <button id="waste-next-month" class="secondary waste-month-button" type="button" aria-label="Bulan berikutnya">›</button>
      </div>
      ${buildWasteCalendar(state.wasteDays, monthKey, analytics, date)}
    </article>

    <section class="waste-selected-day">
      <div class="selected-day-head">
        <div>
          <span class="overline">INPUT TERPILIH</span>
          <h2>${escapeHtml(formatDate(date))}</h2>
          <p>${selectedFilled ? `${selectedFilled} item sudah terisi. Ubah angka lalu simpan untuk update.` : 'Belum ada input. Isi hanya item yang terbuang.'}</p>
        </div>
        <div class="selected-day-actions">
          <span class="selected-day-status ${hasDayDoc ? 'has-data' : ''}">${hasDayDoc ? `${selectedFilled} terisi` : 'Belum disimpan'}</span>
          ${hasDayDoc ? `<button id="delete-waste-day" type="button" class="text-danger-button">Hapus data tanggal</button>` : ""}
        </div>
      </div>

      ${analytics.selectedWarnings.length ? `<div class="waste-inline-alerts">${analytics.selectedWarnings.slice(0, 3).map(w => `<div class="waste-inline-alert ${w.severity}"><span>!</span><p>${escapeHtml(w.message)}</p></div>`).join('')}</div>` : ''}

      ${activeItems.length ? `<form id="waste-day-form" class="waste-day-form"><div class="waste-entry-grid easy-entry-grid">${activeItems.map(item => {
        const st = analytics.itemStats.find(x => x.id === item.id);
        return `<label class="waste-entry-card easy-entry-card"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.unit || 'QTY')}${st?.warning > 0 ? ` · alert ≥ ${formatQty(st.warning)}` : ''}</span></div><span class="waste-qty-control"><input name="w_${escapeHtml(item.id)}" type="number" inputmode="decimal" min="0" step="${item.unit === 'PCS' ? '1' : '0.01'}" value="${Number(dayDoc.values?.[item.id] || 0)}"/><span>${escapeHtml(item.unit || 'QTY')}</span></span></label>`;
      }).join('')}</div><div class="sticky-save-bar waste-save-bar"><div class="save-bar-copy"><strong>${escapeHtml(formatDate(date))}</strong>${saveStateMarkup("waste-save-state", hasDayDoc ? "saved" : "idle", hasDayDoc ? "Data sudah tersimpan" : "Belum ada data tersimpan", hasDayDoc ? "Edit angka lalu simpan ulang" : "Isi angka lalu tekan Simpan")}</div><button class="primary">Simpan Waste</button></div></form>` : `<article class="panel">${emptyState('Belum ada master item waste.')}</article>`}
    </section>

    <div class="grid two waste-analytics-grid easy-analytics-grid">
      <article class="panel"><div class="panel-head"><div><span class="overline">PUNCAK WASTE</span><h3>Hari tertinggi</h3></div></div>${topDays.length ? `<div class="waste-day-bars">${topDays.map(d => `<button class="waste-day-bar-row" data-waste-history="${escapeHtml(d.date)}"><div><strong>${escapeHtml(formatDate(d.date))}</strong><span>${escapeHtml(d.weekday)} · ${d.spikeItems} spike</span></div><div class="waste-bar-track"><i style="width:${Math.min(100, (d.score / maxScore) * 100)}%"></i></div><b>${d.score.toFixed(2)}×</b></button>`).join('')}</div>` : `<p class="muted">Belum cukup data harian.</p>`}</article>
      <article class="panel"><div class="panel-head"><div><span class="overline">POLA HARI</span><h3>Risiko berulang</h3></div></div>${weekdayRisk.length ? `<div class="weekday-risk-list">${weekdayRisk.map(w => `<div class="weekday-risk-row"><div><strong>${escapeHtml(w.label)}</strong><span>${w.count} hari</span></div><b class="${w.risk >= 1.2 ? 'critical-label' : ''}">${w.risk.toFixed(2)}×</b></div>`).join('')}</div>` : `<p class="muted">Butuh beberapa hari data.</p>`}</article>
    </div>

    <article class="panel waste-advice-panel easy-advice-panel"><div class="panel-head"><div><span class="overline">SMART CONTROL</span><h3>Saran singkat</h3></div></div><div class="advice-grid">${analytics.suggestions.map((s, i) => `<div class="advice-card"><span>${String(i + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(s.title)}</strong><p>${escapeHtml(s.text)}</p></div></div>`).join('')}</div></article>

    <article class="panel"><div class="panel-head"><div><span class="overline">RINGKASAN BULAN</span><h3>Total per item</h3></div></div><div class="waste-summary-list">${analytics.itemStats.length ? analytics.itemStats.map(x => `<div class="waste-summary-row"><div><strong>${escapeHtml(x.name)}</strong><span>${x.maxDate ? `Tertinggi ${formatDate(x.maxDate)} · ${formatQty(x.maxQty)} ${escapeHtml(x.unit)}` : 'Belum ada waste'}</span></div><div class="waste-summary-numbers"><strong>${formatQty(x.total)} ${escapeHtml(x.unit)}</strong>${x.cost > 0 ? `<small>Rp ${formatMoney(x.cost)}</small>` : ''}</div></div>`).join('') : `<p class="muted">Belum ada item.</p>`}</div></article>

    <article id="waste-master-section" class="panel waste-master-panel waste-master-visible">
      <div class="panel-head waste-master-head">
        <div><span class="overline">CRUD MASTER WASTE</span><h3>Kelola item Waste</h3><p class="muted small-copy">Tambah, lihat, edit, arsipkan, aktifkan kembali, atau hapus item yang belum punya histori.</p></div>
        <button id="add-waste-item-master" class="primary compact" type="button">+ Item Waste</button>
      </div>
      <div class="waste-master-summary"><span>${activeCount} aktif</span><span>${archivedCount} arsip</span><span>${state.wasteItems.length} total</span></div>
      <div class="collapsible-content">
        <div class="waste-master-list">
          ${state.wasteItems.length ? state.wasteItems.map(item => {
            const hasHistory = state.wasteDays.some(day => Number(day.values?.[item.id] || 0) > 0);
            return `<div class="waste-master-row ${item.active === false ? 'is-archived' : ''}"><div class="waste-master-info"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.unit || 'QTY')} · ${item.active === false ? 'Arsip' : 'Aktif'}${hasHistory ? ' · punya histori' : ''}</span></div><div class="waste-master-actions">${item.active === false ? `<button class="secondary small" data-restore-waste="${escapeHtml(item.id)}">Aktifkan</button>` : `<button class="secondary small" data-edit-master-waste="${escapeHtml(item.id)}">Edit</button>`}<button class="${hasHistory ? 'secondary' : 'danger'} small" data-remove-master-waste="${escapeHtml(item.id)}">${hasHistory ? 'Arsipkan' : 'Hapus'}</button></div></div>`;
          }).join('') : `<p class="muted">Belum ada master item.</p>`}
        </div>
        <p class="master-help">Item yang punya histori akan diarsipkan, bukan dihapus, supaya laporan lama tetap utuh.</p>
      </div>
    </article>
  `;

  document.querySelector('#waste-prev-month')?.addEventListener('click', () => {
    state.wasteMonth = shiftMonthKey(monthKey, -1);
    state.wasteDate = null;
    renderShell();
  });
  document.querySelector('#waste-next-month')?.addEventListener('click', () => {
    state.wasteMonth = shiftMonthKey(monthKey, 1);
    state.wasteDate = null;
    renderShell();
  });
  document.querySelector('#waste-today')?.addEventListener('click', () => {
    state.wasteMonth = today.slice(0, 7);
    state.wasteDate = today;
    renderShell();
  });
  document.querySelectorAll('[data-waste-calendar-date]').forEach(btn => btn.addEventListener('click', () => {
    state.wasteDate = btn.dataset.wasteCalendarDate;
    renderShell();
    requestAnimationFrame(() => document.querySelector('.waste-selected-day')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }));
  document.querySelector('#seed-waste')?.addEventListener('click', async () => {
    if (!confirm('Muat master + histori harian Waste Juli tanggal 1–31? Data yang sudah ada tidak ditimpa.')) return;
    try {
      await seedWasteReference();
      state.wasteMonth = '2026-07';
      state.wasteDate = '2026-07-31';
      showToast('Histori Waste Juli berhasil dimuat.', 'success', 'Data Waste tersimpan');
    } catch (err) { showToast(err?.message || friendlyError(err), 'error', 'Histori Waste gagal dimuat'); }
  });
  document.querySelector('#add-waste-item')?.addEventListener('click', () => openWasteItemEditor(null));
  document.querySelector('#add-waste-item-master')?.addEventListener('click', () => openWasteItemEditor(null));
  document.querySelector('#manage-waste-items')?.addEventListener('click', () => document.querySelector('#waste-master-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.querySelectorAll('[data-edit-master-waste]').forEach(btn => btn.onclick = () => openWasteItemEditor(state.wasteItems.find(x => x.id === btn.dataset.editMasterWaste)));

  document.querySelectorAll('[data-restore-waste]').forEach(btn => btn.onclick = async () => {
    try {
      await restoreWasteItem(btn.dataset.restoreWaste);
      showToast('Item Waste diaktifkan kembali.', 'success', 'CRUD Waste');
    } catch (err) { showToast(err?.message || friendlyError(err), 'error', 'Gagal mengaktifkan item'); }
  });

  document.querySelectorAll('[data-remove-master-waste]').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.removeMasterWaste;
    const item = state.wasteItems.find(x => x.id === id);
    const hasHistory = state.wasteDays.some(day => Number(day.values?.[id] || 0) > 0);
    if (hasHistory) {
      if (!confirm(`Arsipkan "${item?.name || id}"? Histori lama tetap aman.`)) return;
      try { await archiveWasteItem(id); showToast(`“${item?.name || id}” diarsipkan.`, 'success', 'CRUD Waste'); }
      catch (err) { showToast(err?.message || friendlyError(err), 'error', 'Gagal mengarsipkan item'); }
    } else {
      if (!confirm(`Hapus permanen "${item?.name || id}"? Item ini belum punya histori Waste.`)) return;
      try { await permanentDeleteWasteItem(id); showToast(`“${item?.name || id}” dihapus permanen.`, 'success', 'CRUD Waste'); }
      catch (err) { showToast(err?.message || friendlyError(err), 'error', 'Gagal menghapus item'); }
    }
  });

  document.querySelector('#delete-waste-day')?.addEventListener('click', async () => {
    if (!confirm(`Hapus data Waste ${formatDate(date)}? Master item tidak ikut terhapus.`)) return;
    try {
      await removeWasteDay(date);
      showToast(`Data Waste ${formatDate(date)} dihapus.`, "success", "Data dihapus");
      state.wasteDate = date;
    } catch (err) {
      showToast(err?.message || friendlyError(err), "error", "Gagal menghapus Waste");
    }
  });

  document.querySelectorAll('[data-waste-history]').forEach(btn => btn.onclick = () => {
    state.wasteDate = btn.dataset.wasteHistory;
    state.wasteMonth = String(btn.dataset.wasteHistory).slice(0, 7);
    renderShell();
    requestAnimationFrame(() => document.querySelector('.waste-selected-day')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });

  const wasteDayForm = document.querySelector('#waste-day-form');
  bindDirtyState(wasteDayForm, '#waste-save-state', 'Perubahan Waste belum disimpan');
  wasteDayForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const values = Object.fromEntries(activeItems.map(item => [item.id, Number(fd.get(`w_${item.id}`) || 0)]));
    const submit = form.querySelector('button[type="submit"], .waste-save-bar .primary');
    const oldLabel = submit?.textContent || 'Simpan Waste';
    if (submit) { submit.disabled = true; submit.textContent = 'Menyimpan...'; }
    try {
      setSaveState('#waste-save-state', 'saving', 'Menyimpan...', 'Jangan tutup halaman dulu');
      await saveWasteDay(date, values, { uid: state.user?.uid, name: state.profile?.name || state.user?.email }, Object.fromEntries(activeItems.map(item => [item.id, { name: item.name, unit: item.unit, category: item.category }])));
      if (submit) submit.textContent = 'Tersimpan ✓';
      setSaveState('#waste-save-state', 'saved', 'Tersimpan ✓', `Terakhir disimpan ${savedTimeLabel()}`);
      showToast(`Waste ${formatDate(date)} berhasil disimpan.`, 'success', 'Waste tersimpan');
      setTimeout(() => { if (submit && document.body.contains(submit)) { submit.disabled = false; submit.textContent = oldLabel; } }, 900);
    } catch (err) {
      if (submit) { submit.disabled = false; submit.textContent = oldLabel; }
      setSaveState('#waste-save-state', 'error', 'Gagal disimpan', err?.message || friendlyError(err));
      showToast(err?.message || friendlyError(err), 'error', 'Waste gagal disimpan');
    }
  });
  document.querySelector('#import-waste')?.addEventListener('click', () => runExcelImport('waste'));
  document.querySelector('#export-waste')?.addEventListener('click', () => {
    try { exportWasteWorkbook({ monthKey, items: activeItems, days: state.wasteDays, analytics, filename: `SoWork-Waste-${monthKey}.xlsx` }); }
    catch (err) { alert(err?.message || 'Export gagal.'); }
  });
}


function openWasteItemEditor(rawItem) {
  document.querySelector('#waste-item-modal')?.remove();
  const item=rawItem||{name:'',unit:'ML',category:'Waste',active:true,sortOrder:state.wasteItems.length+1,costPerUnit:0,dailyWarningQty:0,monthlyTargetQty:0};
  const modal=document.createElement('div');modal.id='waste-item-modal';modal.className='modal-backdrop';
  modal.innerHTML=`<section class="edit-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><span class="overline">MASTER WASTE</span><h3>${rawItem?'Edit Item Waste':'Tambah Item Waste'}</h3></div><button type="button" class="modal-close">×</button></div><form id="waste-item-form" class="modal-form"><label>Nama Item<input name="name" value="${escapeHtml(item.name)}" required/></label><div class="form-grid compact-grid"><label>Satuan<select name="unit">${['ML','GRAM','PCS','QTY'].map(u=>`<option value="${u}" ${String(item.unit||'QTY').toUpperCase()===u?'selected':''}>${u==='GRAM'?'Gram':u}</option>`).join('')}</select></label><label>Urutan<input name="sortOrder" type="number" min="0" value="${Number(item.sortOrder||0)}"/></label><label>Warning harian<input name="dailyWarningQty" type="number" min="0" step="0.01" value="${Number(item.dailyWarningQty||0)}" placeholder="0 = otomatis"/></label><label>Target waste / bulan<input name="monthlyTargetQty" type="number" min="0" step="0.01" value="${Number(item.monthlyTargetQty||0)}" placeholder="Opsional"/></label><label>Biaya per unit (Rp)<input name="costPerUnit" type="number" min="0" step="0.01" value="${Number(item.costPerUnit||0)}" placeholder="Opsional"/></label></div><label>Kategori<input name="category" value="${escapeHtml(item.category||'Waste')}"/></label><div class="unit-helper"><strong>Untuk analisis yang lebih tajam</strong><span>Warning 0 = SoWork hitung otomatis dari histori. Biaya/unit memungkinkan estimasi rupiah waste supaya pengeluaran bisa dipantau.</span></div><label class="check-line"><input name="active" type="checkbox" ${item.active!==false?'checked':''}/> Aktifkan item</label><div class="modal-actions">${rawItem?`<button type="button" id="delete-waste-item" class="danger">${state.wasteDays.some(day=>Number(day.values?.[rawItem.id]||0)>0)?'Arsipkan':'Hapus Permanen'}</button>`:'<span></span>'}<div><button type="button" class="secondary modal-cancel">Batal</button><button class="primary">Simpan</button></div></div></form></section>`;
  document.body.appendChild(modal);const close=()=>modal.remove();modal.querySelector('.modal-close').onclick=close;modal.querySelector('.modal-cancel').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
  modal.querySelector('#waste-item-form').onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    const fd=new FormData(form);
    const btn=form.querySelector('button[type="submit"], .primary:last-child');
    const old=btn?.textContent||'Simpan';
    if(btn){btn.disabled=true;btn.textContent='Menyimpan...';}
    try{
      await saveWasteItem({id:rawItem?.id,name:fd.get('name'),unit:fd.get('unit'),category:fd.get('category'),sortOrder:fd.get('sortOrder'),dailyWarningQty:fd.get('dailyWarningQty'),monthlyTargetQty:fd.get('monthlyTargetQty'),costPerUnit:fd.get('costPerUnit'),active:fd.get('active')==='on'});
      showToast(`Item Waste “${fd.get('name')}” berhasil ${rawItem?'diperbarui':'ditambahkan'}.`, 'success', 'CRUD Waste');
      close();
    }catch(err){
      if(btn){btn.disabled=false;btn.textContent=old;}
      showToast(err?.message||friendlyError(err), 'error', 'Item Waste gagal disimpan');
    }
  };
  modal.querySelector('#delete-waste-item')?.addEventListener('click',async()=>{
    const hasHistory=state.wasteDays.some(day=>Number(day.values?.[item.id]||0)>0);
    try {
      if(hasHistory) {
        if(!confirm(`Arsipkan "${item.name}"? Item hilang dari input Waste baru, tetapi histori lama tetap tersimpan.`)) return;
        await archiveWasteItem(item.id);
        showToast(`“${item.name}” diarsipkan.`, 'success', 'CRUD Waste');
      } else {
        if(!confirm(`Hapus permanen "${item.name}"? Item belum pernah dipakai pada histori Waste.`)) return;
        await permanentDeleteWasteItem(item.id);
        showToast(`“${item.name}” dihapus permanen.`, 'success', 'CRUD Waste');
      }
      close();
    } catch(err) {
      showToast(err?.message || friendlyError(err), 'error', 'CRUD Waste gagal');
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
      showToast(`Laporan ${formatDate(fd.get("date"))} berhasil ${rawReport ? "diperbarui" : "disimpan"}.`, "success", "Laporan tersimpan");
      close();
    } catch (err) {
      showToast(err?.message || friendlyError(err), "error", "Laporan gagal disimpan");
    }
  };

  modal.querySelector("#delete-report")?.addEventListener("click", async () => {
    if (!confirm("Hapus laporan ini?")) return;
    try { await removePersonalReport(rawReport.id); showToast("Laporan berhasil dihapus.", "success", "Laporan dihapus"); close(); }
    catch (err) { showToast(err?.message || friendlyError(err), "error", "Gagal menghapus laporan"); }
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
    showToast(`Import selesai. ${result.detail || `${result.count} data`}`, "success", "Import berhasil");
  } catch (err) {
    console.error("Excel import", feature, err);
    showToast(err?.message || friendlyError(err), "error", "Import gagal");
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
        <div class="settings-readonly-row"><span>Telegram</span><strong>${state.telegramWorkerStatus?.paired || state.stockSettings?.telegramChatId ? `Terhubung${state.telegramWorkerStatus?.recipientCount ? ` (${state.telegramWorkerStatus.recipientCount} penerima)` : ""}` : "Belum dipair"}</strong></div>
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
        <div class="settings-readonly-row"><span>Version</span><strong>v1.5.3 Data Feedback + CRUD</strong></div>
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
      showToast("Settings berhasil disimpan.", "success", "Settings tersimpan");
    } catch (err) {
      showToast(err?.message || friendlyError(err), "error", "Settings gagal disimpan");
    }
  });

  document.querySelector("#profile-settings-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await updateProfileName(state.user?.uid, fd.get("name"));
      state.profile = { ...state.profile, name: String(fd.get("name") || "").trim() };
      showToast("Nama profil berhasil diperbarui.", "success", "Profil tersimpan");
      renderShell();
    } catch (err) {
      showToast(err?.message || friendlyError(err), "error", "Profil gagal diperbarui");
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
    schedules: state.schedules || [],
    checklist: state.checklist || [],
    checklistCompletions: state.checklistCompletions || [],
    stockItems: state.stockItems || [],
    stockMovements: state.stockMovements || [],
    stockOpnames: state.stockOpnames || [],
    wasteItems: state.wasteItems || [],
    wasteDays: state.wasteDays || []
  };
}

function cloudflareSnapshotFingerprint(snapshot = buildCloudflareSnapshot()) {
  try {
    return JSON.stringify(snapshot);
  } catch {
    return String(Date.now());
  }
}

function scheduleCloudflareSync(delay = 1200) {
  if (!isAdmin(state.profile)) return;
  const url = normalizeWorkerUrl(state.stockSettings?.cloudflareWorkerUrl || "");
  if (!url) return;

  // Jangan reset timer yang sudah menunggu. Model debounce lama bisa terus
  // tertunda bila beberapa listener Firestore datang berdekatan. Timer pertama
  // sekarang dijamin tetap jalan dan snapshot terbaru dibaca saat eksekusi.
  if (state.cloudflareSyncTimer) return;
  state.cloudflareSyncTimer = setTimeout(() => {
    state.cloudflareSyncTimer = null;
    runCloudflareSync().catch(err => console.warn("Cloudflare sync:", err));
  }, Math.max(0, Number(delay) || 0));
}

async function runCloudflareSync() {
  const url = normalizeWorkerUrl(state.stockSettings?.cloudflareWorkerUrl || "");
  if (!url || !isAdmin(state.profile)) return null;
  if (state.cloudflareSyncBusy) {
    state.cloudflareSyncQueued = true;
    return null;
  }
  state.cloudflareSyncBusy = true;
  const snapshot = buildCloudflareSnapshot();
  const fingerprint = cloudflareSnapshotFingerprint(snapshot);
  try {
    const result = await syncTelegramSnapshot(url, snapshot);
    state.cloudflareLastSnapshotFingerprint = fingerprint;
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

function startCloudflareSyncWatchdog() {
  if (!isAdmin(state.profile)) return;
  if (state.cloudflareSyncWatchdog) clearInterval(state.cloudflareSyncWatchdog);

  // Safety net: tidak menulis apa pun bila data tidak berubah. Jika listener
  // realtime gagal menjadwalkan sync atau request sempat gagal, perubahan
  // akan dicoba lagi otomatis maksimal ~15 detik selama SoWork terbuka.
  state.cloudflareSyncWatchdog = setInterval(() => {
    const url = normalizeWorkerUrl(state.stockSettings?.cloudflareWorkerUrl || "");
    if (!url || state.cloudflareSyncBusy || state.cloudflareSyncTimer) return;
    const current = cloudflareSnapshotFingerprint();
    if (current !== state.cloudflareLastSnapshotFingerprint) scheduleCloudflareSync(0);
  }, 15000);
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
      rows => { state.schedules = rows; state.scheduleLoaded = true; state.scheduleError = ""; if (!state.scheduleMonth && rows.length) state.scheduleMonth = latestScheduleMonth(rows); scheduleCloudflareSync(); scheduleRender(["dashboard","schedule","checklist"]); },
      err => { state.scheduleLoaded = true; state.scheduleError = friendlyError(err); console.error("Schedule listener:", err); scheduleRender(["schedule"]); }
    )
  );

  state.unsubs.push(
    watchChecklist(
      rows => { state.checklist = rows; scheduleCloudflareSync(); scheduleRender(["dashboard","checklist"]); },
      err => console.error("Checklist listener:", err)
    )
  );

  state.unsubs.push(
    watchChecklistCompletions(
      rows => { state.checklistCompletions = rows; scheduleCloudflareSync(); scheduleRender(["checklist"]); },
      err => console.error("Checklist completion listener:", err)
    )
  );

  state.unsubs.push(
    watchScheduleRules(
      rules => {
        if (rules) state.scheduleRules = normalizeRules(rules);
        scheduleRender(["schedule","checklist"]);
      },
      err => console.error("Schedule rules listener:", err)
    )
  );

  if (isAdmin(state.profile)) {
    startCloudflareSyncWatchdog();
    state.unsubs.push(
      watchStockItems(
        rows => { state.stockItems = rows; scheduleCloudflareSync(); scheduleRender(["dashboard","stock","opname","order"]); },
        err => console.error("Stock items listener:", err)
      )
    );
    state.unsubs.push(
      watchStockMovements(
        rows => { state.stockMovements = rows; scheduleCloudflareSync(); scheduleRender(["dashboard","stock","opname","order"]); },
        err => console.error("Stock movements listener:", err)
      )
    );
    state.unsubs.push(
      watchStockOpnames(
        rows => { state.stockOpnames = rows; scheduleCloudflareSync(); scheduleRender(["dashboard","stock","opname","order"]); },
        err => console.error("Stock opname listener:", err)
      )
    );
    state.unsubs.push(
      watchStockSettings(
        settings => {
          state.stockSettings = settings || state.stockSettings;
          scheduleCloudflareSync(500);
          if (normalizeWorkerUrl(state.stockSettings?.cloudflareWorkerUrl || "") && !state.telegramWorkerStatus) {
            refreshTelegramWorkerStatus().then(() => scheduleRender(["settings"])).catch(() => {});
          }
          scheduleRender(["stock","settings"]);
        },
        err => console.error("Stock settings listener:", err)
      )
    );
    state.unsubs.push(
      watchWasteItems(
        rows => { state.wasteItems = rows; scheduleCloudflareSync(); scheduleRender(["dashboard","waste"]); },
        err => console.error("Waste items listener:", err)
      )
    );
    state.unsubs.push(
      watchWasteDays(
        rows => { state.wasteDays = rows; scheduleCloudflareSync(); scheduleRender(["dashboard","waste"]); },
        err => console.error("Waste days listener:", err)
      )
    );
    state.unsubs.push(
      watchPersonalReports(
        rows => { state.personalReports = rows; scheduleRender(["reports"]); },
        err => console.error("Personal reports listener:", err)
      )
    );
    state.unsubs.push(
      watchAppSettings(
        settings => { state.appSettings = settings || state.appSettings; scheduleRender(); },
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
