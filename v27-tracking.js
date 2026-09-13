(() => {
  'use strict';

  const KEY = 'agis_finance_v27_tracking';
  const V26_KEY = 'agis_finance_v26_decision_lab';
  const REASONS = [
    ['', 'Tidak diisi'],
    ['normal', 'Normal'],
    ['ramai', 'Ramai'],
    ['promo', 'Promo'],
    ['hujan', 'Hujan'],
    ['libur', 'Libur / event'],
    ['stok', 'Stok terbatas'],
    ['lainnya', 'Lainnya']
  ];
  const DEFAULTS = {
    activeTab: 'business', activeBusinessId: '', activeCreditId: '', businesses: [], credits: [],
    settings: { notifyBusiness: true, notifyCredit: true, notifyWeeklyBusiness: true },
    calendarMonths: {}, selectedDates: {}, chartMetrics: {}
  };
  let salesChart = null;

  const clone = v => JSON.parse(JSON.stringify(v));
  const num = v => Math.max(0, Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0);
  const moneyNum = v => Math.max(0, Number(String(v ?? '').replace(/\D/g, '')) || 0);
  const uid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const rp = n => typeof fmt === 'function' ? fmt(Math.round(Number(n) || 0)) : `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const humanDate = k => { if (!k) return '-'; const d = new Date(`${k}T00:00:00`); return Number.isNaN(d.getTime()) ? k : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); };
  const shortDate = k => { const d = new Date(`${k}T00:00:00`); return Number.isNaN(d.getTime()) ? k : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); };
  const humanMonth = k => { const [y, m] = String(k || today().slice(0, 7)).split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }); };
  const daysBetween = (a, b) => Math.max(0, Math.ceil((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000) + 1);
  const shiftDate = (k, delta) => { const d = new Date(`${k}T00:00:00`); d.setDate(d.getDate() + delta); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const shiftMonth = (k, delta) => { const [y, m] = String(k).split('-').map(Number), d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const compactMoney = n => { const v = Math.round(Number(n) || 0); if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 ? 1 : 0)}jt`; if (v >= 1000) return `${Math.round(v / 1000)}k`; return String(v); };
  const reasonLabel = key => (REASONS.find(([v]) => v === String(key || '')) || ['', 'Tidak diisi'])[1];

  function state() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || '{}');
      const s = {
        ...clone(DEFAULTS), ...r,
        businesses: Array.isArray(r.businesses) ? r.businesses : [],
        credits: Array.isArray(r.credits) ? r.credits : [],
        settings: { ...DEFAULTS.settings, ...(r.settings || {}) },
        calendarMonths: { ...(r.calendarMonths || {}) }, selectedDates: { ...(r.selectedDates || {}) }, chartMetrics: { ...(r.chartMetrics || {}) }
      };
      s.businesses.forEach(b => {
        if (!Object.prototype.hasOwnProperty.call(b, 'originalUnitsPerDay')) b.originalUnitsPerDay = num(b.unitsPerDay);
        if (!Array.isArray(b.targetAdjustments)) b.targetAdjustments = [];
      });
      return s;
    } catch { return clone(DEFAULTS); }
  }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); try { window.persistLocalSnapshot?.(); } catch {} return s; }
  function setState(fn) { const s = state(); fn(s); return save(s); }
  function v26() { try { return JSON.parse(localStorage.getItem(V26_KEY) || '{}'); } catch { return {}; } }
  function hpp(d) { return ['material', 'packaging', 'labor', 'operational', 'otherUnit'].reduce((s, k) => s + num(d?.[k]), 0); }
  function creditInstallment(d) {
    const principal = Math.max(0, num(d.cashPrice) - num(d.downPayment)), months = Math.max(1, Math.round(num(d.months) || 1)), annual = num(d.interest) / 100;
    if (d.method === 'annuity') { const r = annual / 12; return r > 0 ? principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1) : principal / months; }
    return principal / months + (principal * annual / 12);
  }
  function saleRevenue(e, b) { return Object.prototype.hasOwnProperty.call(e || {}, 'revenue') ? num(e.revenue) : num(e?.qty) * num(b?.salePrice); }
  function stockCost(e, b) { return Object.prototype.hasOwnProperty.call(e || {}, 'cost') ? num(e.cost) : num(e?.qty) * num(b?.hpp); }
  function dailyStats(b, date) {
    const rows = (b?.sales || []).filter(x => x.date === date);
    const qty = rows.reduce((s, x) => s + num(x.qty), 0), revenue = rows.reduce((s, x) => s + saleRevenue(x, b), 0);
    return { date, qty, revenue, profit: revenue - (qty * num(b?.hpp)), rows };
  }
  function businessStats(b) {
    const sales = b.sales || [], stockAdds = b.stockAdds || [];
    const sold = sales.reduce((s, x) => s + num(x.qty), 0), todayData = dailyStats(b, today());
    const revenue = sales.reduce((s, x) => s + saleRevenue(x, b), 0), initial = num(b.initialStock), added = stockAdds.reduce((s, x) => s + num(x.qty), 0), stock = Math.max(0, initial + added - sold);
    const plannedMargin = Math.max(0, num(b.salePrice) - num(b.hpp));
    const avgActualPrice = sold > 0 ? revenue / sold : num(b.salePrice), actualMargin = Math.max(0, avgActualPrice - num(b.hpp));
    const baseCapital = num(b.capitalNeeded), restockCost = stockAdds.reduce((s, x) => s + stockCost(x, b), 0), capital = baseCapital + restockCost, targetProfit = num(b.targetProfit), actualContribution = actualMargin * sold;
    const fallbackMargin = actualMargin > 0 ? actualMargin : plannedMargin;
    const bepUnits = plannedMargin > 0 ? Math.ceil(capital / plannedMargin) : 0, targetUnits = plannedMargin > 0 ? Math.ceil((capital + targetProfit) / plannedMargin) : 0;
    const remainingBepMoney = Math.max(0, capital - actualContribution), remainingTargetMoney = Math.max(0, capital + targetProfit - actualContribution);
    const remainingBep = fallbackMargin > 0 ? Math.ceil(remainingBepMoney / fallbackMargin) : 0, remainingTarget = fallbackMargin > 0 ? Math.ceil(remainingTargetMoney / fallbackMargin) : 0;
    const start = b.startDate || today(), elapsed = Math.max(1, daysBetween(start, today())), avg = sold / elapsed, planned = num(b.unitsPerDay), originalPlanned = num(b.originalUnitsPerDay || b.unitsPerDay);
    const projectedBepDays = avg > 0 ? Math.ceil(remainingBep / avg) : 0, projectedTargetDays = avg > 0 ? Math.ceil(remainingTarget / avg) : 0;
    const plannedBepDays = originalPlanned > 0 && bepUnits > 0 ? Math.ceil(bepUnits / originalPlanned) : 0, actualBepTotal = avg > 0 && bepUnits > 0 ? Math.ceil(bepUnits / avg) : 0, delay = Math.max(0, actualBepTotal - plannedBepDays);
    return { sold, todaySold: todayData.qty, todayRevenue: todayData.revenue, todayProfit: todayData.profit, initial, added, stock, revenue, grossProfit: revenue - sold * num(b.hpp), plannedMargin, actualMargin, avgActualPrice, baseCapital, restockCost, capital, targetProfit, bepUnits, targetUnits, remainingBep, remainingTarget, remainingBepMoney, remainingTargetMoney, avg, planned, originalPlanned, elapsed, projectedBepDays, projectedTargetDays, plannedBepDays, actualBepTotal, delay, bepPct: capital ? Math.min(100, Math.max(0, actualContribution / capital * 100)) : 0, targetPct: (capital + targetProfit) > 0 ? Math.min(100, Math.max(0, actualContribution / (capital + targetProfit) * 100)) : 0 };
  }
  function creditStats(c) {
    const paid = (c.payments || []).reduce((s, x) => s + num(x.amount), 0), installment = num(c.installment), months = Math.max(1, num(c.months)), total = installment * months, remaining = Math.max(0, total - paid), paidInstallments = installment > 0 ? Math.min(months, Math.floor((paid + 1) / installment)) : 0, pct = total > 0 ? Math.min(100, paid / total * 100) : 0;
    const nextIndex = Math.min(months, paidInstallments + 1), nextDue = nextDueDate(c.startDate || today(), num(c.dueDay) || new Date().getDate(), nextIndex - 1);
    return { paid, installment, months, total, remaining, paidInstallments, pct, nextIndex, nextDue, lunas: remaining <= 1 };
  }
  function nextDueDate(start, dueDay, offset) {
    const base = new Date(`${start}T00:00:00`), d = new Date(base.getFullYear(), base.getMonth() + offset, 1), cap = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(Math.max(1, dueDay), cap)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function getBiz(id) { return state().businesses.find(x => x.id === id); }
  function getCredit(id) { return state().credits.find(x => x.id === id); }

  function lastRecordedDays(b, limit = 7, end = today()) {
    const dates = [...new Set((b.sales || []).map(x => x.date).filter(d => d && d <= end))].sort().reverse().slice(0, limit).sort();
    return dates.map(d => dailyStats(b, d));
  }
  function adaptiveTarget(b) {
    const days = lastRecordedDays(b, 7), current = num(b.unitsPerDay);
    if (days.length < 3) return { ready: false, days, current, suggested: current, avg: 0, diffPct: 0 };
    const avg = days.reduce((s, d) => s + d.qty, 0) / days.length, suggested = Math.max(1, Math.round(avg)), diffPct = current > 0 ? ((suggested - current) / current) * 100 : 100;
    return { ready: true, days, current, suggested, avg, diffPct, meaningful: Math.abs(suggested - current) >= 1 && Math.abs(diffPct) >= 12 };
  }
  function weeklyStats(b, end = today()) {
    const dates = Array.from({ length: 7 }, (_, i) => shiftDate(end, i - 6)), rows = dates.map(d => dailyStats(b, d));
    const prevDates = Array.from({ length: 7 }, (_, i) => shiftDate(end, i - 13)), prevRows = prevDates.map(d => dailyStats(b, d));
    const qty = rows.reduce((s, x) => s + x.qty, 0), revenue = rows.reduce((s, x) => s + x.revenue, 0), profit = rows.reduce((s, x) => s + x.profit, 0), planned = num(b.unitsPerDay);
    const withData = rows.filter(x => x.rows.length), best = withData.length ? [...withData].sort((a, z) => z.qty - a.qty || z.revenue - a.revenue)[0] : null, worst = withData.length ? [...withData].sort((a, z) => a.qty - z.qty || a.revenue - z.revenue)[0] : null;
    const targetHits = planned > 0 ? rows.filter(x => x.qty >= planned).length : 0;
    const currPace = qty / 7, prevPace = prevRows.reduce((s, x) => s + x.qty, 0) / 7, st = businessStats(b), remain = st.remainingBep;
    const currentBep = currPace > 0 ? Math.ceil(remain / currPace) : 0, prevBep = prevPace > 0 ? Math.ceil(remain / prevPace) : 0;
    const projectionDelta = currentBep && prevBep ? currentBep - prevBep : 0;
    return { dates, rows, qty, revenue, profit, best, worst, targetHits, currPace, prevPace, currentBep, prevBep, projectionDelta };
  }
  function reasonInsight(b) {
    const cutoff = shiftDate(today(), -29), dayMap = new Map();
    (b.sales || []).filter(x => x.date >= cutoff && x.date <= today()).forEach(x => {
      const cur = dayMap.get(x.date) || { qty: 0, reasons: [] };
      cur.qty += num(x.qty); if (x.reason) cur.reasons.push(x.reason); dayMap.set(x.date, cur);
    });
    const days = [...dayMap.values()]; if (days.length < 3) return null;
    const avg = days.reduce((s, d) => s + d.qty, 0) / days.length, counts = {};
    days.filter(d => d.qty >= avg).forEach(d => [...new Set(d.reasons)].forEach(r => counts[r] = (counts[r] || 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? { reason: top[0], count: top[1], avg } : null;
  }
  function creditSafety(s) {
    let wallet = 0, reserved = 0, monthIncome = 0;
    try {
      wallet = Object.values(store?.wallets || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      reserved = Number(store?.goal) || 0;
      const month = today().slice(0, 7);
      monthIncome = (store?.incomes || []).filter(x => String(x.tanggal || '').startsWith(month)).reduce((a, x) => a + (Number(x.nominal) || 0), 0);
    } catch {}
    const available = Math.max(0, wallet - reserved);
    const active = (s.credits || []).filter(c => c.active !== false && !creditStats(c).lunas), obligations = active.reduce((sum, c) => sum + num(c.installment), 0), after = available - obligations, ratio = monthIncome > 0 ? obligations / monthIncome * 100 : null;
    let level = 'unknown', title = 'Belum bisa dinilai', note = 'Belum ada saldo/pemasukan cukup untuk memberi indikator.';
    if (available > 0 || monthIncome > 0) {
      if (after < 0 || (ratio !== null && ratio > 40)) { level = 'risk'; title = 'Berisiko'; note = 'Total cicilan aktif terlalu menekan saldo bebas atau pemasukan bulan ini.'; }
      else if (after < available * .25 || (ratio !== null && ratio > 30)) { level = 'warn'; title = 'Mulai berat'; note = 'Masih bisa dibayar, tapi ruang uang bebas setelah cicilan mulai tipis.'; }
      else { level = 'safe'; title = 'Aman'; note = 'Ruang uang bebas setelah seluruh cicilan aktif masih cukup sehat.'; }
    }
    return { level, title, note, available, obligations, after, ratio, monthIncome };
  }

  function createBusiness(sourceId, focus = true) {
    const s26 = v26(), src = (s26.businesses || []).find(x => x.id === sourceId); if (!src) return null; let out;
    setState(s => {
      out = s.businesses.find(x => x.sourceId === sourceId);
      if (!out) {
        const d = src.data || {}, unitHpp = hpp(d), margin = Math.max(0, num(d.salePrice) - unitHpp), capital = num(d.setupCost) + num(d.fixedMonthly) + (unitHpp * num(d.initialStock));
        out = { id: uid('trackbiz'), sourceId, name: d.name || 'Bisnis', startDate: today(), salePrice: num(d.salePrice), hpp: unitHpp, unitsPerDay: num(d.unitsPerDay), originalUnitsPerDay: num(d.unitsPerDay), daysPerMonth: num(d.daysPerMonth) || 26, targetProfit: num(d.targetProfit), initialStock: num(d.initialStock), capitalNeeded: capital, marginUnit: margin, sales: [], stockAdds: [], targetAdjustments: [], active: true, createdAt: Date.now() };
        s.businesses.unshift(out);
      }
      s.activeBusinessId = out.id; s.activeTab = 'business'; s.selectedDates[out.id] = s.selectedDates[out.id] || today(); s.calendarMonths[out.id] = s.calendarMonths[out.id] || today().slice(0, 7); s.chartMetrics[out.id] = s.chartMetrics[out.id] || 'qty';
    }); render(); if (focus) focusCard(); return out;
  }
  function createCredit(sourceId, focus = true) {
    const s26 = v26(), src = (s26.credits || []).find(x => x.id === sourceId); if (!src) return null; let out;
    setState(s => {
      out = s.credits.find(x => x.sourceId === sourceId);
      if (!out) { const d = src.data || {}, inst = creditInstallment(d); out = { id: uid('trackcredit'), sourceId, name: d.name || 'Kredit', startDate: today(), dueDay: new Date().getDate(), installment: inst, months: Math.max(1, Math.round(num(d.months) || 1)), cashPrice: num(d.cashPrice), downPayment: num(d.downPayment), payments: [], active: true, createdAt: Date.now() }; s.credits.unshift(out); }
      s.activeCreditId = out.id; s.activeTab = 'credit';
    }); render(); if (focus) focusCard(); return out;
  }
  function focusCard() { setTimeout(() => document.getElementById('v27-tracking')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }

  function inject() {
    const lab = document.getElementById('v26-decision-lab'); if (!lab) return;
    let card = document.getElementById('v27-tracking');
    if (!card) { card = document.createElement('div'); card.id = 'v27-tracking'; card.className = 'card v27-card'; lab.insertAdjacentElement('afterend', card); }
    else if (lab.nextElementSibling !== card) lab.insertAdjacentElement('afterend', card);
    render();
  }
  function render() {
    const card = document.getElementById('v27-tracking'); if (!card) return; const s = state();
    card.innerHTML = `<div class="v27-head"><div><span class="v27-kicker">REALISASI</span><h3>Jalankan & pantau rencana</h3><p>Catat hasil nyata. Target, profit, dan proyeksi ikut menyesuaikan.</p></div><i data-lucide="activity"></i></div>
      <div class="v27-tabs"><button class="${s.activeTab === 'business' ? 'active' : ''}" onclick="switchTrackingV27('business')"><i data-lucide="shopping-bag"></i> Penjualan</button><button class="${s.activeTab === 'credit' ? 'active' : ''}" onclick="switchTrackingV27('credit')"><i data-lucide="credit-card"></i> Cicilan</button></div>
      ${s.activeTab === 'credit' ? renderCreditPanel(s) : renderBusinessPanel(s)}`;
    if (window.lucide?.createIcons) lucide.createIcons();
    if (s.activeTab === 'business') requestAnimationFrame(() => drawSalesChart());
  }

  function renderAdaptiveTarget(b) {
    const a = adaptiveTarget(b);
    if (!a.ready) return `<div class="v275-adaptive neutral"><i data-lucide="target"></i><div><b>Target adaptif belum siap</b><span>Butuh minimal 3 hari penjualan tercatat. Target aktif: ${num(b.unitsPerDay)} pcs/hari.</span></div></div>`;
    const direction = a.suggested > a.current ? 'naik' : a.suggested < a.current ? 'turun' : 'tetap';
    return `<div class="v275-adaptive ${a.meaningful ? (direction === 'naik' ? 'up' : 'down') : 'neutral'}"><i data-lucide="target"></i><div><b>${a.meaningful ? `Saran target ${a.suggested} pcs/hari` : 'Target sekarang masih masuk akal'}</b><span>Rata-rata ${a.days.length} hari tercatat: ${a.avg.toFixed(1)} pcs/hari · target aktif ${a.current} pcs/hari.</span></div><div class="v275-adaptive-actions">${a.meaningful ? `<button onclick="applyAdaptiveTargetV275('${esc(b.id)}',${a.suggested})">Pakai ${a.suggested}</button>` : ''}<button class="ghost" onclick="manualTargetV275('${esc(b.id)}')">Atur</button></div></div>`;
  }
  function renderWeeklySummary(b) {
    const w = weeklyStats(b), reason = reasonInsight(b);
    if (!w.rows.some(x => x.rows.length)) return `<details class="v275-weekly"><summary><div class="v275-section-head"><div><small>RINGKASAN 7 HARI</small><b>Belum ada data</b></div><i data-lucide="chevron-down"></i></div></summary><p class="v275-muted">Mulai catat penjualan supaya ringkasan mingguan muncul otomatis.</p></details>`;
    const proj = w.projectionDelta < 0 ? `BEP membaik ±${Math.abs(w.projectionDelta)} hari` : w.projectionDelta > 0 ? `BEP melambat ±${w.projectionDelta} hari` : 'Proyeksi BEP relatif stabil';
    return `<details class="v275-weekly"><summary><div class="v275-section-head"><div><small>RINGKASAN 7 HARI</small><b>${w.qty} pcs · ${rp(w.revenue)}</b></div><div class="v275-summary-tail"><span class="v275-profit ${w.profit >= 0 ? 'positive' : 'negative'}">${w.profit >= 0 ? '+' : '-'}${rp(Math.abs(w.profit))}</span><i data-lucide="chevron-down"></i></div></div></summary>
      <div class="v275-week-grid"><div><small>Laba setelah biaya produk</small><b>${rp(w.profit)}</b></div><div><small>Target harian tercapai</small><b>${w.targetHits}/7 hari</b></div><div><small>Hari terbaik</small><b>${w.best ? `${shortDate(w.best.date)} · ${w.best.qty} pcs` : '-'}</b></div><div><small>Hari terendah tercatat</small><b>${w.worst ? `${shortDate(w.worst.date)} · ${w.worst.qty} pcs` : '-'}</b></div></div>
      <div class="v275-week-note"><i data-lucide="route"></i><span>${proj}.${reason ? ` Catatan yang paling sering muncul pada hari di atas rata-rata: <b>${esc(reasonLabel(reason.reason))}</b>.` : ' Isi faktor penjualan agar pola seperti promo/hujan bisa dibaca.'}</span></div></details>`;
  }

  function renderBusinessPanel(s) {
    const saved = (v26().businesses || []), active = getBiz(s.activeBusinessId) || s.businesses[0];
    const picker = `<div class="v27-picker"><select id="v27-biz-source"><option value="">Pilih skenario bisnis…</option>${saved.map(x => `<option value="${esc(x.id)}">${esc(x.data?.name || 'Bisnis')}</option>`).join('')}</select><button onclick="startPickedBusinessV27()">Mulai pantau</button></div>`;
    if (!active) return `${picker}<div class="v27-empty"><i data-lucide="package-open"></i><b>Belum ada penjualan yang dipantau</b><span>Simpan skenario bisnis atau pilih skenario di atas.</span></div>`;
    const st = businessStats(active), targetStatus = st.todaySold >= st.planned ? 'Target hari ini tercapai' : `Kurang ${Math.max(0, Math.ceil(st.planned - st.todaySold))} unit dari target hari ini`;
    const selected = s.selectedDates[active.id] || today(), month = s.calendarMonths[active.id] || selected.slice(0, 7), metric = s.chartMetrics[active.id] || 'qty';
    const selectedData = dailyStats(active, selected), prev = dailyStats(active, shiftDate(selected, -1)), next = dailyStats(active, shiftDate(selected, 1));
    return `${picker}<div class="v27-switcher">${s.businesses.map(x => `<button class="${x.id === active.id ? 'active' : ''}" onclick="selectBusinessTrackingV27('${esc(x.id)}')">${esc(x.name)}</button>`).join('')}</div>
      <div class="v27-summary"><div><small>Hari ini</small><b>${st.todaySold.toLocaleString('id-ID')} / ${st.planned.toLocaleString('id-ID')} unit</b><span>${targetStatus}</span></div><div><small>Omzet hari ini</small><b>${rp(st.todayRevenue)}</b><span>Angka aktual yang dicatat</span></div><div><small>Sisa stok</small><b>${st.stock.toLocaleString('id-ID')} unit</b><span>${st.avg ? `Rata-rata ${st.avg.toFixed(1)}/hari` : 'Belum ada rata-rata'}</span></div><div><small>Balik modal</small><b>${st.bepPct.toFixed(0)}%</b><span>${st.remainingBep ? `± ${st.remainingBep} unit lagi` : 'Sudah tercapai'}</span></div></div>
      <div class="v27-projection ${st.delay >= 2 ? 'warn' : ''}"><i data-lucide="route"></i><div><b>${st.delay >= 2 ? `Balik modal mundur ±${st.delay} hari` : 'Proyeksi masih sesuai rencana'}</b><span>${st.avg > 0 ? `Dengan ritme sekarang: BEP sekitar ${st.projectedBepDays || 0} hari lagi${st.targetProfit ? `, target untung sekitar ${st.projectedTargetDays || 0} hari lagi` : ''}.` : 'Catat penjualan untuk menghitung proyeksi aktual.'}</span></div></div>
      ${renderAdaptiveTarget(active)}
      ${renderWeeklySummary(active)}
      ${renderSalesCalendar(active, month, selected)}
      <div class="v271-day-panel"><div class="v271-day-head"><div><small>DATA TANGGAL TERPILIH</small><b>${humanDate(selected)}</b></div></div>
        <div class="v271-day-kpis v275-four"><div><small>Terjual</small><b>${selectedData.qty} pcs</b></div><div><small>Uang didapat</small><b>${rp(selectedData.revenue)}</b></div><div><small>Rata-rata / pcs</small><b>${selectedData.qty ? rp(selectedData.revenue / selectedData.qty) : '-'}</b></div><div><small>Laba setelah biaya produk</small><b class="${selectedData.profit >= 0 ? 'v275-positive' : 'v275-negative'}">${rp(selectedData.profit)}</b></div></div>
        <div class="v271-compare-grid">${comparisonCard(selectedData, prev, '1 hari sebelumnya')}${comparisonCard(selectedData, next, '1 hari setelahnya')}</div>
        <div class="v271-day-rows">${selectedData.rows.length ? selectedData.rows.map(x => `<div class="v271-day-row"><div><b>${num(x.qty)} pcs · ${rp(saleRevenue(x, active))}${x.reason ? ` <span class="v275-reason">${esc(reasonLabel(x.reason))}</span>` : ''}</b><span>${esc(x.note || 'Penjualan')}</span></div><button onclick="editSaleV27('${esc(active.id)}','${esc(x.id)}')"><i data-lucide="pencil"></i></button><button onclick="deleteSaleV27('${esc(active.id)}','${esc(x.id)}')"><i data-lucide="trash-2"></i></button></div>`).join('') : '<div class="v27-empty small">Belum ada data pada tanggal ini.</div>'}</div>
      </div>
      <div class="v271-chart-card"><div class="v271-chart-head"><div><small>TREN 7 HARI</small><b>Sampai ${humanDate(selected)}</b></div><div class="v271-chart-toggle"><button class="${metric === 'qty' ? 'active' : ''}" onclick="setSalesChartMetricV271('${esc(active.id)}','qty')">Pcs</button><button class="${metric === 'revenue' ? 'active' : ''}" onclick="setSalesChartMetricV271('${esc(active.id)}','revenue')">Omzet</button><button class="${metric === 'profit' ? 'active' : ''}" onclick="setSalesChartMetricV271('${esc(active.id)}','profit')">Profit</button></div></div><div class="v271-chart-wrap"><canvas id="v271-sales-chart"></canvas></div></div>
      <div class="v27-actions"><button onclick="addSaleV27('${esc(active.id)}','${selected}')"><i data-lucide="plus"></i> Catat penjualan</button><button class="secondary" onclick="addStockV27('${esc(active.id)}')"><i data-lucide="package-plus"></i> Tambah stok</button><button class="danger ghost" onclick="deleteBusinessTrackingV27('${esc(active.id)}')"><i data-lucide="trash-2"></i></button></div>
      ${(active.stockAdds || []).length ? `<details class="v27-details"><summary>Riwayat tambah stok</summary>${[...active.stockAdds].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(x => `<div class="v27-row"><div><b>+${num(x.qty)} unit · ${humanDate(x.date)}</b><span>${rp(stockCost(x, active))} · ${esc(x.note || 'Tambah stok')}</span></div><button onclick="editStockV27('${esc(active.id)}','${esc(x.id)}')"><i data-lucide="pencil"></i></button><button onclick="deleteStockV27('${esc(active.id)}','${esc(x.id)}')"><i data-lucide="trash-2"></i></button></div>`).join('')}</details>` : ''}`;
  }

  function renderSalesCalendar(b, month, selected) {
    const [y, m] = month.split('-').map(Number), first = new Date(y, m - 1, 1), count = new Date(y, m, 0).getDate(), offset = (first.getDay() + 6) % 7;
    const monthly = Array.from({ length: count }, (_, i) => dailyStats(b, `${month}-${String(i + 1).padStart(2, '0')}`)), maxQty = Math.max(1, ...monthly.map(x => x.qty)), planned = num(b.unitsPerDay);
    const cells = []; for (let i = 0; i < offset; i++) cells.push('<span class="v271-cal-blank"></span>');
    for (let day = 1; day <= count; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`, d = dailyStats(b, date), has = d.rows.length > 0, ratio = has ? d.qty / Math.max(1, planned || maxQty) : 0, heat = ratio >= 1.5 ? 4 : ratio >= 1 ? 3 : ratio >= .5 ? 2 : has ? 1 : 0;
      cells.push(`<button class="v271-cal-day ${date === selected ? 'selected' : ''} ${date === today() ? 'today' : ''} ${has ? `has-data heat-${heat}` : ''}" onclick="selectSaleDateV271('${esc(b.id)}','${date}')"><span>${day}</span>${has ? `<b>${d.qty} pcs</b><small>${compactMoney(d.revenue)}</small>` : '<em>·</em>'}</button>`);
    }
    return `<div class="v271-calendar"><div class="v271-cal-head"><button aria-label="Bulan sebelumnya" onclick="shiftSalesMonthV271('${esc(b.id)}',-1)"><i data-lucide="chevron-left"></i></button><div><small>KALENDER PENJUALAN</small><b>${humanMonth(month)}</b></div><div class="v271-cal-head-actions"><button onclick="goTodaySalesV271('${esc(b.id)}')">Hari ini</button><button aria-label="Bulan berikutnya" onclick="shiftSalesMonthV271('${esc(b.id)}',1)"><i data-lucide="chevron-right"></i></button></div></div><div class="v275-heat-legend"><span>Lebih rendah</span><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><span>Lebih tinggi</span></div><div class="v271-weekdays">${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(x => `<span>${x}</span>`).join('')}</div><div class="v271-cal-grid">${cells.join('')}</div></div>`;
  }
  function comparisonCard(current, other, label) {
    const hasOther = (other.rows || []).length > 0, hasCurrent = (current.rows || []).length > 0;
    if (!hasOther) return `<div class="v271-compare"><small>vs ${label}</small><b>Belum ada data</b><span>Belum bisa dibandingkan.</span></div>`;
    if (!hasCurrent) return `<div class="v271-compare down"><small>vs ${label}</small><b>Lebih rendah ${Math.abs(other.qty)} pcs</b><span>-${rp(Math.abs(other.revenue))}</span></div>`;
    const dq = current.qty - other.qty, dr = current.revenue - other.revenue, stateName = dq > 0 ? 'up' : dq < 0 ? 'down' : 'same', word = dq > 0 ? 'Lebih tinggi' : dq < 0 ? 'Lebih rendah' : 'Sama';
    const pctQty = other.qty ? Math.abs(dq / other.qty * 100) : null, pctMoney = other.revenue ? Math.abs(dr / other.revenue * 100) : null;
    return `<div class="v271-compare ${stateName}"><small>vs ${label}</small><b>${word} ${Math.abs(dq)} pcs${pctQty !== null ? ` · ${pctQty.toFixed(0)}%` : ''}</b><span>${dr >= 0 ? '+' : '-'}${rp(Math.abs(dr))}${pctMoney !== null ? ` · ${pctMoney.toFixed(0)}%` : ''}</span></div>`;
  }

  function renderCreditPanel(s) {
    const saved = (v26().credits || []), active = getCredit(s.activeCreditId) || s.credits[0];
    const picker = `<div class="v27-picker"><select id="v27-credit-source"><option value="">Pilih simulasi kredit…</option>${saved.map(x => `<option value="${esc(x.id)}">${esc(x.data?.name || 'Kredit')}</option>`).join('')}</select><button onclick="startPickedCreditV27()">Mulai pantau</button></div>`;
    if (!active) return `${picker}<div class="v27-empty"><i data-lucide="wallet-cards"></i><b>Belum ada cicilan yang dipantau</b><span>Simpan simulasi kredit atau pilih simulasi di atas.</span></div>`;
    const st = creditStats(active), safety = creditSafety(s);
    return `${picker}<div class="v27-switcher">${s.credits.map(x => `<button class="${x.id === active.id ? 'active' : ''}" onclick="selectCreditTrackingV27('${esc(x.id)}')">${esc(x.name)}</button>`).join('')}</div>
      <div class="v27-summary"><div><small>Sudah dibayar</small><b>${rp(st.paid)}</b><span>${st.paidInstallments} dari ${st.months} cicilan</span></div><div><small>Sisa cicilan</small><b>${rp(st.remaining)}</b><span>${(100 - st.pct).toFixed(0)}% tersisa</span></div><div><small>Cicilan bulanan</small><b>${rp(st.installment)}</b><span>Target tiap bulan</span></div><div><small>Jatuh tempo berikutnya</small><b>${st.lunas ? 'Lunas' : humanDate(st.nextDue)}</b><span>${st.lunas ? 'Semua cicilan selesai' : `Cicilan ke-${st.nextIndex}`}</span></div></div>
      <div class="v27-progress"><span style="width:${st.pct}%"></span></div>
      <div class="v275-credit-safety ${safety.level}"><i data-lucide="shield-check"></i><div><small>KONDISI CICILAN</small><b>${safety.title}</b><span>${safety.note}</span><em>${safety.level !== 'unknown' ? `Saldo bebas sekarang ${rp(safety.available)} → setelah semua cicilan aktif sekitar ${rp(safety.after)}${safety.ratio !== null ? ` · beban cicilan ${safety.ratio.toFixed(0)}% dari pemasukan bulan ini` : ''}.` : 'Catat pemasukan/saldo agar indikator lebih akurat.'}</em></div></div>
      <div class="v27-credit-settings"><label>Tanggal jatuh tempo tiap bulan <input type="number" min="1" max="31" value="${num(active.dueDay) || 1}" onchange="changeDueDayV27('${esc(active.id)}',this.value)"></label></div>
      <div class="v27-actions"><button onclick="addPaymentV27('${esc(active.id)}')"><i data-lucide="badge-check"></i> Catat pembayaran</button><button class="danger ghost" onclick="deleteCreditTrackingV27('${esc(active.id)}')"><i data-lucide="trash-2"></i></button></div>
      <div class="v27-list"><div class="v27-list-title">Riwayat pembayaran</div>${(active.payments || []).length ? [...active.payments].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(x => `<div class="v27-row"><div><b>${humanDate(x.date)}</b><span>${esc(x.note || 'Pembayaran cicilan')}</span></div><strong>${rp(x.amount)}</strong><button onclick="editPaymentV27('${esc(active.id)}','${esc(x.id)}')"><i data-lucide="pencil"></i></button><button onclick="deletePaymentV27('${esc(active.id)}','${esc(x.id)}')"><i data-lucide="trash-2"></i></button></div>`).join('') : '<div class="v27-empty small">Belum ada pembayaran.</div>'}</div>`;
  }

  function drawSalesChart() {
    const s = state(), b = getBiz(s.activeBusinessId) || s.businesses[0], canvas = document.getElementById('v271-sales-chart'); if (!b || !canvas || typeof Chart === 'undefined') return;
    const selected = s.selectedDates[b.id] || today(), metric = s.chartMetrics[b.id] || 'qty', dates = Array.from({ length: 7 }, (_, i) => shiftDate(selected, i - 6)), rows = dates.map(d => dailyStats(b, d));
    if (salesChart) { try { salesChart.destroy(); } catch {} salesChart = null; }
    const styles = getComputedStyle(document.documentElement), text = styles.getPropertyValue('--text-dim').trim() || '#94a3b8', accent = styles.getPropertyValue('--accent').trim() || '#2dd4bf', grid = 'rgba(148,163,184,.12)';
    salesChart = new Chart(canvas.getContext('2d'), { type: 'line', data: { labels: dates.map(shortDate), datasets: [{ data: rows.map(x => metric === 'revenue' ? x.revenue : metric === 'profit' ? x.profit : x.qty), borderColor: accent, backgroundColor: 'rgba(45,212,191,.08)', pointBackgroundColor: accent, borderWidth: 2, tension: .32, fill: true, pointRadius: 3, pointHoverRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => metric === 'qty' ? `${c.raw} pcs` : rp(c.raw) } } }, scales: { x: { grid: { display: false }, ticks: { color: text, font: { size: 10 } } }, y: { beginAtZero: metric !== 'profit', grid: { color: grid }, ticks: { color: text, font: { size: 10 }, callback: v => metric === 'qty' ? v : compactMoney(v) } } } } });
  }

  async function form(title, fields, confirm = 'Simpan') {
    const html = fields.map(f => {
      if (f.type === 'select') return `<label class="v27-modal-field">${f.label}<select id="sw-${f.key}">${(f.options || []).map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(f.value ?? '') ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
      return `<label class="v27-modal-field">${f.label}<input id="sw-${f.key}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.type === 'number' ? 'inputmode="numeric"' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}></label>`;
    }).join('');
    const r = await Swal.fire({ title, html, showCancelButton: true, confirmButtonText: confirm, cancelButtonText: 'Batal', focusConfirm: false, preConfirm: () => Object.fromEntries(fields.map(f => [f.key, document.getElementById(`sw-${f.key}`)?.value || ''])) }); return r.isConfirmed ? r.value : null;
  }

  window.switchTrackingV27 = tab => { setState(s => s.activeTab = tab === 'credit' ? 'credit' : 'business'); render(); };
  window.startBusinessTrackingV27 = (id, focus = true) => createBusiness(id, focus);
  window.startCreditTrackingV27 = (id, focus = true) => createCredit(id, focus);
  window.startPickedBusinessV27 = () => { const id = document.getElementById('v27-biz-source')?.value; if (id) createBusiness(id, true); };
  window.startPickedCreditV27 = () => { const id = document.getElementById('v27-credit-source')?.value; if (id) createCredit(id, true); };
  window.selectBusinessTrackingV27 = id => { setState(s => { s.activeBusinessId = id; s.activeTab = 'business'; s.selectedDates[id] = s.selectedDates[id] || today(); s.calendarMonths[id] = s.calendarMonths[id] || s.selectedDates[id].slice(0, 7); s.chartMetrics[id] = s.chartMetrics[id] || 'qty'; }); render(); };
  window.selectCreditTrackingV27 = id => { setState(s => { s.activeCreditId = id; s.activeTab = 'credit'; }); render(); };
  window.selectSaleDateV271 = (id, date) => { setState(s => { s.activeBusinessId = id; s.selectedDates[id] = date; s.calendarMonths[id] = date.slice(0, 7); }); render(); };
  window.shiftSalesMonthV271 = (id, delta) => { setState(s => { const current = s.calendarMonths[id] || today().slice(0, 7); s.calendarMonths[id] = shiftMonth(current, Number(delta) || 0); const chosen = s.selectedDates[id] || today(); if (!chosen.startsWith(s.calendarMonths[id])) s.selectedDates[id] = `${s.calendarMonths[id]}-01`; }); render(); };
  window.goTodaySalesV271 = id => { setState(s => { s.calendarMonths[id] = today().slice(0, 7); s.selectedDates[id] = today(); }); render(); };
  window.setSalesChartMetricV271 = (id, metric) => { setState(s => { s.chartMetrics[id] = ['revenue', 'profit'].includes(metric) ? metric : 'qty'; }); render(); };

  window.applyAdaptiveTargetV275 = async (id, suggested) => {
    const b = getBiz(id); if (!b) return; const next = Math.max(1, Math.round(Number(suggested) || 1));
    const r = await Swal.fire({ title: `Ubah target jadi ${next} pcs/hari?`, text: 'Riwayat penjualan lama tidak berubah. Target baru dipakai untuk evaluasi berikutnya.', icon: 'question', showCancelButton: true, confirmButtonText: 'Pakai target', cancelButtonText: 'Batal' }); if (!r.isConfirmed) return;
    setState(s => { const x = s.businesses.find(z => z.id === id); x.targetAdjustments = x.targetAdjustments || []; x.targetAdjustments.push({ id: uid('target'), date: today(), from: num(x.unitsPerDay), to: next, reason: 'Saran adaptif', createdAt: Date.now() }); x.unitsPerDay = next; x.updatedAt = Date.now(); }); render();
  };
  window.manualTargetV275 = async id => {
    const b = getBiz(id); if (!b) return; const v = await form('Atur target penjualan', [{ key: 'target', label: 'Target baru (pcs / hari)', type: 'number', value: Math.round(num(b.unitsPerDay)) }, { key: 'note', label: 'Alasan perubahan (opsional)', value: '' }]); if (!v || !moneyNum(v.target)) return;
    const next = Math.max(1, moneyNum(v.target)); setState(s => { const x = s.businesses.find(z => z.id === id); x.targetAdjustments = x.targetAdjustments || []; x.targetAdjustments.push({ id: uid('target'), date: today(), from: num(x.unitsPerDay), to: next, reason: v.note || 'Diatur manual', createdAt: Date.now() }); x.unitsPerDay = next; x.updatedAt = Date.now(); }); render();
  };

  window.addSaleV27 = async (id, dateOverride) => {
    const b = getBiz(id); if (!b) return; const selected = dateOverride || state().selectedDates[id] || today();
    const v = await form('Catat penjualan', [{ key: 'date', label: 'Tanggal', type: 'date', value: selected }, { key: 'qty', label: 'Jumlah terjual (pcs, boleh 0)', type: 'number', value: '' }, { key: 'revenue', label: 'Uang yang didapat', type: 'number', value: '', placeholder: 'Kosong = otomatis dari harga jual' }, { key: 'reason', label: 'Faktor penjualan (opsional)', type: 'select', value: '', options: REASONS }, { key: 'note', label: 'Catatan (opsional)', value: '' }]); if (!v) return;
    const qtyRaw = String(v.qty ?? '').trim(); if (qtyRaw === '') return Swal.fire('Jumlah belum diisi', 'Isi 0 jika hari ini tidak ada barang terjual.', 'warning'); const qty = moneyNum(qtyRaw); const revenue = String(v.revenue || '').trim() ? moneyNum(v.revenue) : qty * num(b.salePrice), now = Date.now(), date = v.date || selected;
    setState(s => { const x = s.businesses.find(z => z.id === id); x.sales.push({ id: uid('sale'), date, qty, revenue, reason: v.reason || '', note: v.note || '', createdAt: now, updatedAt: now }); s.selectedDates[id] = date; s.calendarMonths[id] = date.slice(0, 7); }); render();
  };
  window.editSaleV27 = async (id, eid) => {
    const b = getBiz(id), e = b?.sales?.find(x => x.id === eid); if (!e) return;
    const v = await form('Edit penjualan', [{ key: 'date', label: 'Tanggal', type: 'date', value: e.date }, { key: 'qty', label: 'Jumlah terjual (pcs, boleh 0)', type: 'number', value: e.qty }, { key: 'revenue', label: 'Uang yang didapat', type: 'number', value: Math.round(saleRevenue(e, b)) }, { key: 'reason', label: 'Faktor penjualan (opsional)', type: 'select', value: e.reason || '', options: REASONS }, { key: 'note', label: 'Catatan', value: e.note || '' }]); if (!v) return;
    const qtyRaw = String(v.qty ?? '').trim(); if (qtyRaw === '') return Swal.fire('Jumlah belum diisi', 'Isi 0 jika pada tanggal ini tidak ada barang terjual.', 'warning'); const qty = moneyNum(qtyRaw); const revenue = String(v.revenue || '').trim() ? moneyNum(v.revenue) : qty * num(b.salePrice), date = v.date || e.date;
    setState(s => { const x = s.businesses.find(z => z.id === id).sales.find(z => z.id === eid); x.date = date; x.qty = qty; x.revenue = revenue; x.reason = v.reason || ''; x.note = v.note || ''; x.updatedAt = Date.now(); s.selectedDates[id] = date; s.calendarMonths[id] = date.slice(0, 7); }); render();
  };
  window.deleteSaleV27 = async (id, eid) => { const r = await Swal.fire({ title: 'Hapus penjualan?', text: 'Data pcs dan omzet pada catatan ini akan dihapus.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', cancelButtonText: 'Batal' }); if (!r.isConfirmed) return; setState(s => { const x = s.businesses.find(z => z.id === id); x.sales = x.sales.filter(z => z.id !== eid); }); render(); };
  window.addStockV27 = async id => { const b = getBiz(id); if (!b) return; const v = await form('Tambah stok', [{ key: 'date', label: 'Tanggal', type: 'date', value: today() }, { key: 'qty', label: 'Jumlah stok masuk', type: 'number', value: '' }, { key: 'cost', label: 'Biaya restock', type: 'number', value: '', placeholder: `Kosong = otomatis ${rp(num(b.hpp))} / unit` }, { key: 'note', label: 'Catatan', value: 'Restock' }]); if (!v || !moneyNum(v.qty)) return; const qty=moneyNum(v.qty), cost=String(v.cost||'').trim()?moneyNum(v.cost):qty*num(b.hpp), now=Date.now(); setState(s => s.businesses.find(x => x.id === id).stockAdds.push({ id: uid('stock'), date: v.date || today(), qty, cost, note: v.note || '', createdAt: now, updatedAt: now })); render(); };
  window.editStockV27 = async (id, eid) => { const b=getBiz(id), e = b?.stockAdds?.find(x => x.id === eid); if (!e) return; const v = await form('Edit stok', [{ key: 'date', label: 'Tanggal', type: 'date', value: e.date }, { key: 'qty', label: 'Jumlah stok masuk', type: 'number', value: e.qty }, { key: 'cost', label: 'Biaya restock', type: 'number', value: Math.round(stockCost(e,b)) }, { key: 'note', label: 'Catatan', value: e.note || '' }]); if (!v || !moneyNum(v.qty)) return; setState(s => { const x = s.businesses.find(z => z.id === id).stockAdds.find(z => z.id === eid); x.date = v.date; x.qty = moneyNum(v.qty); x.cost = String(v.cost||'').trim()?moneyNum(v.cost):x.qty*num(b.hpp); x.note = v.note || ''; x.updatedAt = Date.now(); }); render(); };
  window.deleteStockV27 = async (id, eid) => { const r = await Swal.fire({ title: 'Hapus catatan stok?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', cancelButtonText: 'Batal' }); if (!r.isConfirmed) return; setState(s => { const x = s.businesses.find(z => z.id === id); x.stockAdds = x.stockAdds.filter(z => z.id !== eid); }); render(); };
  window.deleteBusinessTrackingV27 = async id => { const r = await Swal.fire({ title: 'Hapus tracking bisnis?', text: 'Skenario asli v26.1.0 tidak ikut dihapus.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus tracking', cancelButtonText: 'Batal' }); if (!r.isConfirmed) return; setState(s => { s.businesses = s.businesses.filter(x => x.id !== id); delete s.selectedDates[id]; delete s.calendarMonths[id]; delete s.chartMetrics[id]; s.activeBusinessId = s.businesses[0]?.id || ''; }); render(); };
  window.addPaymentV27 = async id => { const c = getCredit(id); if (!c) return; const v = await form('Catat pembayaran', [{ key: 'date', label: 'Tanggal bayar', type: 'date', value: today() }, { key: 'amount', label: 'Nominal dibayar', type: 'number', value: Math.round(c.installment) }, { key: 'note', label: 'Catatan', value: 'Cicilan' }]); if (!v || !moneyNum(v.amount)) return; const now = Date.now(); setState(s => s.credits.find(x => x.id === id).payments.push({ id: uid('pay'), date: v.date || today(), amount: moneyNum(v.amount), note: v.note || '', createdAt: now, updatedAt: now })); render(); };
  window.editPaymentV27 = async (id, eid) => { const e = getCredit(id)?.payments?.find(x => x.id === eid); if (!e) return; const v = await form('Edit pembayaran', [{ key: 'date', label: 'Tanggal bayar', type: 'date', value: e.date }, { key: 'amount', label: 'Nominal dibayar', type: 'number', value: e.amount }, { key: 'note', label: 'Catatan', value: e.note || '' }]); if (!v) return; setState(s => { const x = s.credits.find(z => z.id === id).payments.find(z => z.id === eid); x.date = v.date; x.amount = moneyNum(v.amount); x.note = v.note || ''; x.updatedAt = Date.now(); }); render(); };
  window.deletePaymentV27 = async (id, eid) => { const r = await Swal.fire({ title: 'Hapus pembayaran?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', cancelButtonText: 'Batal' }); if (!r.isConfirmed) return; setState(s => { const x = s.credits.find(z => z.id === id); x.payments = x.payments.filter(z => z.id !== eid); }); render(); };
  window.changeDueDayV27 = (id, v) => { setState(s => { const x = s.credits.find(z => z.id === id); if (x) x.dueDay = Math.max(1, Math.min(31, Number(v) || 1)); }); render(); };
  window.deleteCreditTrackingV27 = async id => { const r = await Swal.fire({ title: 'Hapus tracking cicilan?', text: 'Simulasi asli v26.1.0 tidak ikut dihapus.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus tracking', cancelButtonText: 'Batal' }); if (!r.isConfirmed) return; setState(s => { s.credits = s.credits.filter(x => x.id !== id); s.activeCreditId = s.credits[0]?.id || ''; }); render(); };
  window.getV27TrackingData = () => state();
  window.refreshTrackingV27 = () => render();

  function init() { inject(); setTimeout(inject, 400); setTimeout(inject, 1100); const host = document.getElementById('v2531-planning-host'); if (host) new MutationObserver(() => inject()).observe(host, { childList: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 280), { once: true }); else setTimeout(init, 280);
})();
