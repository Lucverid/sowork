export function buildStockAnalytics(items = [], opnames = [], movements = []) {
  const snapshotsByItem = groupBy(opnames, "itemId");
  const receiptsByItem = groupBy(movements.filter(x => x.type === "IN"), "itemId");
  const explicitUsageByItem = groupBy(movements.filter(x => x.type === "OUT"), "itemId");
  const today = localDateKey(new Date());

  const rows = items.filter(x => x.active !== false).map(item => {
    const history = (snapshotsByItem[item.id] || [])
      .slice()
      .sort((a,b) => String(a.date).localeCompare(String(b.date)));
    const receipts = (receiptsByItem[item.id] || []).slice();

    // Lebih berat ke interval terbaru agar perubahan konsumsi cepat ikut terbaca.
    const explicitUsage = (explicitUsageByItem[item.id] || []).slice();
    const usage = estimateDailyUsage(history, receipts, explicitUsage);
    const avgDailyUsage = usage.daily;
    const currentQty = Math.max(0, Number(item.currentQty || 0));
    const daysCover = avgDailyUsage > 0 ? currentQty / avgDailyUsage : Infinity;
    const cartonSize = Math.max(0, Number(item.cartonSize || 0));

    const velocityRatio = avgDailyUsage / Math.max(1, cartonSize || Number(item.lowThreshold || 1));
    const velocity = avgDailyUsage <= 0
      ? "Belum cukup data"
      : velocityRatio >= 0.12 ? "Fast"
      : velocityRatio >= 0.04 ? "Medium"
      : "Slow";

    const leadTime = Math.max(0, Number(item.leadTimeDays || 2));
    const targetDays = Math.max(1, Number(item.targetCoverageDays || 7));
    const safetyStock = Math.max(0, Number(item.safetyStock ?? item.criticalThreshold ?? 0));
    const criticalThreshold = Math.max(0, Number(item.criticalThreshold || 0));
    const lowThreshold = Math.max(criticalThreshold, Number(item.lowThreshold || 0));

    const reorderPoint = avgDailyUsage > 0
      ? (avgDailyUsage * leadTime) + safetyStock
      : lowThreshold;

    let status = "Aman";
    if (
      currentQty <= criticalThreshold ||
      (item.criticalItem && Number.isFinite(daysCover) && daysCover <= Math.max(1.5, leadTime))
    ) status = "Kritis";
    else if (
      currentQty <= lowThreshold ||
      (Number.isFinite(daysCover) && daysCover <= Math.max(3, leadTime + 2))
    ) status = "Menipis";

    let desiredQty = avgDailyUsage > 0
      ? (avgDailyUsage * targetDays) + safetyStock
      : Math.max(lowThreshold * 2, currentQty);

    let recommendedQty = Math.max(0, desiredQty - currentQty);
    if (status === "Aman" && currentQty > reorderPoint) recommendedQty = 0;
    if (recommendedQty > 0 && cartonSize > 0) {
      recommendedQty = Math.ceil(recommendedQty / cartonSize) * cartonSize;
    } else {
      recommendedQty = Math.ceil(recommendedQty);
    }

    const predictedOutDate = avgDailyUsage > 0 && Number.isFinite(daysCover)
      ? addDays(today, Math.max(0, Math.floor(daysCover)))
      : null;

    const daysUntilReorder = avgDailyUsage > 0
      ? Math.max(0, (currentQty - reorderPoint) / avgDailyUsage)
      : null;

    const recommendedOrderDate = avgDailyUsage > 0
      ? addDays(today, Math.max(0, Math.floor(daysUntilReorder)))
      : null;

    const historyCount = history.length;
    const predictionConfidence =
      historyCount < 2 ? "Belum cukup data" :
      historyCount === 2 ? "Estimasi awal" :
      historyCount <= 4 ? "Cukup" :
      "Baik";

    return {
      ...item,
      currentQty,
      avgDailyUsage,
      daysCover,
      velocity,
      status,
      reorderPoint,
      recommendedQty,
      recommendedCartons: cartonSize > 0 ? Math.ceil(recommendedQty / cartonSize) : 0,
      lastDelivery: latestReceipt(receipts),
      historyCount,
      usageIntervals: usage.intervals,
      usageDays: usage.usageDays || 0,
      usageSource: usage.source || "opname-estimate",
      predictionConfidence: usage.usageDays >= 14 ? "Baik" : usage.usageDays >= 7 ? "Cukup" : usage.usageDays >= 3 ? "Estimasi harian" : predictionConfidence,
      predictedOutDate,
      recommendedOrderDate,
      orderDueNow: Boolean(recommendedOrderDate && recommendedOrderDate <= today)
    };
  });

  rows.sort((a,b) =>
    statusRank(a.status) - statusRank(b.status) ||
    velocityRank(a.velocity) - velocityRank(b.velocity) ||
    a.name.localeCompare(b.name, "id")
  );
  return rows;
}

export function stockAlertRows(analytics = []) {
  return analytics.filter(x => x.status === "Kritis" || x.status === "Menipis");
}

export function buildWhatsappAlertMessage(rows = []) {
  const critical = rows.filter(x => x.status === "Kritis");
  const low = rows.filter(x => x.status === "Menipis");
  const lines = ["⚠️ ALERT STOK SOWORK", ""];
  if (critical.length) {
    lines.push("🔴 KRITIS");
    critical.slice(0, 12).forEach(x => lines.push(
      `• ${x.name}: ${formatQty(x.currentQty)} ${x.unit}` +
      `${x.predictedOutDate ? ` · estimasi habis ${formatDateShort(x.predictedOutDate)}` : ""}` +
      `${x.recommendedQty > 0 ? ` → saran order ${formatQty(x.recommendedQty)} ${x.unit}` : ""}`
    ));
    lines.push("");
  }
  if (low.length) {
    lines.push("🟠 MENIPIS");
    low.slice(0, 12).forEach(x => lines.push(
      `• ${x.name}: ${formatQty(x.currentQty)} ${x.unit}` +
      `${Number.isFinite(x.daysCover) ? ` (~${x.daysCover.toFixed(1)} hari)` : ""}` +
      `${x.recommendedOrderDate ? ` · order ${formatDateShort(x.recommendedOrderDate)}` : ""}`
    ));
  }
  lines.push("", `Update: ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`);
  return lines.join("\n");
}

function estimateDailyUsage(history, receipts, explicitUsage = []) {
  const dailyRows = explicitUsage
    .filter(x => x.date)
    .slice()
    .sort((a,b) => String(a.date).localeCompare(String(b.date)))
    .slice(-30);

  // Setelah penggunaan harian mulai dicatat, prediksi memakai data OUT nyata.
  // Nilai 0 tetap disimpan per tanggal sehingga hari tanpa pemakaian ikut dihitung.
  if (dailyRows.length >= 3) {
    let weighted = 0;
    let weightTotal = 0;
    dailyRows.forEach((row, idx) => {
      const weight = 1 + (idx / Math.max(1, dailyRows.length - 1));
      weighted += Math.max(0, Number(row.qty || 0)) * weight;
      weightTotal += weight;
    });
    return {
      daily: weightTotal ? weighted / weightTotal : 0,
      intervals: 0,
      usageDays: dailyRows.length,
      source: "daily-usage"
    };
  }

  if (history.length < 2) return { daily: 0, intervals: 0, usageDays: dailyRows.length, source: "insufficient" };

  const intervalRows = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    const span = dayDiff(prev.date, curr.date);
    if (span <= 0) continue;

    const incoming = receipts
      .filter(r => String(r.date) > String(prev.date) && String(r.date) <= String(curr.date))
      .reduce((sum, r) => sum + Math.max(0, Number(r.qty || 0)), 0);

    const consumption = Number(prev.totalQty || 0) + incoming - Number(curr.totalQty || 0);
    if (consumption >= 0) intervalRows.push({ daily: consumption / span, span });
  }

  if (!intervalRows.length) return { daily: 0, intervals: 0, usageDays: dailyRows.length, source: "insufficient" };
  const recent = intervalRows.slice(-3);
  let weighted = 0;
  let weightTotal = 0;
  recent.forEach((row, idx) => {
    const weight = idx + 1;
    weighted += row.daily * weight;
    weightTotal += weight;
  });
  return {
    daily: weightTotal ? weighted / weightTotal : 0,
    intervals: recent.length,
    usageDays: dailyRows.length,
    source: "opname-estimate"
  };
}

export function calculateTheoreticalStock(item, date, opnames = [], movements = []) {
  const history = opnames
    .filter(x => x.itemId === item.id && String(x.date || "") < String(date || ""))
    .slice()
    .sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const previous = history.at(-1) || null;

  if (!previous) {
    return {
      systemQty: Math.max(0, Number(item.currentQty || 0)),
      previousOpnameDate: "",
      incoming: 0,
      usage: 0,
      source: "current-system"
    };
  }

  const between = movements.filter(m =>
    m.itemId === item.id &&
    String(m.date || "") > String(previous.date || "") &&
    String(m.date || "") <= String(date || "")
  );
  const incoming = between.filter(x => x.type === "IN").reduce((sum,x)=>sum+Math.max(0,Number(x.qty||0)),0);
  const usage = between.filter(x => x.type === "OUT").reduce((sum,x)=>sum+Math.max(0,Number(x.qty||0)),0);
  return {
    systemQty: Math.max(0, Number(previous.totalQty || 0) + incoming - usage),
    previousOpnameDate: previous.date || "",
    incoming,
    usage,
    source: "movement-ledger"
  };
}

export function buildStockReconciliation(items = [], opnames = [], movements = [], date) {
  if (!date) return [];
  const currentByItem = Object.fromEntries(opnames.filter(x => x.date === date).map(x => [x.itemId, x]));
  return items.filter(x => x.active !== false || currentByItem[x.id]).map(item => {
    const current = currentByItem[item.id] || null;
    const theoretical = calculateTheoreticalStock(item, date, opnames, movements);
    const systemQty = current && Number.isFinite(Number(current.systemQtyBeforeOpname))
      ? Number(current.systemQtyBeforeOpname)
      : theoretical.systemQty;
    const physicalQty = current ? Math.max(0, Number(current.totalQty || 0)) : null;
    const varianceQty = physicalQty == null ? null : physicalQty - systemQty;
    const variancePct = physicalQty == null || systemQty <= 0 ? null : (varianceQty / systemQty) * 100;
    const accuracyPct = physicalQty == null
      ? null
      : systemQty <= 0 ? (physicalQty === 0 ? 100 : 0) : Math.max(0, 100 - (Math.abs(varianceQty) / systemQty * 100));
    const tolerance = Math.max(0.01, systemQty * 0.0025);
    const status = physicalQty == null ? "Belum SO" : Math.abs(varianceQty) <= tolerance ? "Sesuai" : varianceQty < 0 ? "Selisih Kurang" : "Selisih Lebih";
    return {
      ...item,
      physicalQty,
      systemQty,
      varianceQty,
      variancePct,
      accuracyPct,
      reconciliationStatus: current?.reconciliationStatus || status,
      previousOpnameDate: current?.previousOpnameDate || theoretical.previousOpnameDate,
      incomingSincePrevious: Number(current?.incomingSincePrevious ?? theoretical.incoming ?? 0),
      usageSincePrevious: Number(current?.usageSincePrevious ?? theoretical.usage ?? 0)
    };
  });
}

function latestReceipt(receipts) {
  return receipts.slice().sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")))[0] || null;
}

function dayDiff(a, b) {
  const da = dateUtc(a); const db = dateUtc(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000);
}

function dateUtc(value) {
  const [y,m,d] = String(value || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

function addDays(dateKey, days) {
  const dt = dateUtc(dateKey);
  if (!dt) return null;
  const out = new Date(dt + Math.max(0, Number(days || 0)) * 86400000);
  return out.toISOString().slice(0, 10);
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateShort(value) {
  if (!value) return "-";
  const d = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(d);
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const k = row[key];
    if (!k) return acc;
    (acc[k] ||= []).push(row);
    return acc;
  }, {});
}

function statusRank(status) { return status === "Kritis" ? 0 : status === "Menipis" ? 1 : 2; }
function velocityRank(v) { return v === "Fast" ? 0 : v === "Medium" ? 1 : v === "Slow" ? 2 : 3; }
function formatQty(v) { return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Number(v || 0)); }
