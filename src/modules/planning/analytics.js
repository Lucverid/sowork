import { resolveProductRecipe } from "./planning.js";

export function buildPlanningAnalytics({
  stockItems = [], stockMovements = [], stockOpnames = [], wasteItems = [], wasteDays = [],
  productionRecipes = [], productRecipes = [], salesMappings = [], salesRecords = [],
  windowDays = 30, today = localDateKey(new Date())
} = {}) {
  const activeItems = stockItems.filter(x => x.active !== false);
  const start = addDays(today, -(Math.max(7, Number(windowDays || 30)) - 1));
  const periodDates = collectPeriodDates({ stockMovements, wasteDays, salesRecords, start, today });
  const first = periodDates[0] || today;
  const periodDays = Math.max(1, dayDiff(first, today) + 1);

  const usageByItem = new Map();
  stockMovements.filter(x => x.type === "OUT" && inRange(x.date, start, today)).forEach(row => addMap(usageByItem, row.itemId, Math.max(0, Number(row.qty || 0))));

  const wasteExpansion = buildWasteExpansion({ wasteItems, wasteDays, productionRecipes, productRecipes, stockItems, start, today });
  const salesExpansion = buildSalesExpansion({ salesRecords, productRecipes, productionRecipes, stockItems, salesMappings, start, today });
  const latestOpnameByItem = latestOpnames(stockOpnames);

  return activeItems.map(item => {
    const usageTotal = getMap(usageByItem, item.id);
    const wasteTotal = getMap(wasteExpansion.stockTotals, item.id);
    const salesExpectedTotal = getMap(salesExpansion.stockTotals, item.id);
    const actualConsumptionTotal = usageTotal + wasteTotal;
    const actualDaily = actualConsumptionTotal / periodDays;
    const wasteDaily = wasteTotal / periodDays;
    const salesDaily = salesExpectedTotal / periodDays;
    const theoreticalWithWaste = salesDaily + wasteDaily;
    const mappedSalesRate = salesExpansion.totalQty > 0 ? salesExpansion.mappedQty / salesExpansion.totalQty : 0;
    const hasActual = actualConsumptionTotal > 0;
    const hasSales = salesExpectedTotal > 0 && mappedSalesRate >= 0.5;
    const forecastDaily = hasActual && hasSales
      ? (actualDaily * 0.7) + (theoreticalWithWaste * 0.3)
      : hasActual ? actualDaily : hasSales ? theoreticalWithWaste : 0;

    const currentQty = Math.max(0, Number(item.currentQty || 0));
    const leadTimeDays = Math.max(0, Number(item.leadTimeDays || 2));
    const targetCoverageDays = Math.max(1, Number(item.targetCoverageDays || 7));
    const safetyStock = Math.max(0, Number(item.safetyStock ?? item.criticalThreshold ?? 0));
    const cartonSize = Math.max(0, Number(item.cartonSize || 0));
    const reorderPoint = forecastDaily > 0 ? forecastDaily * leadTimeDays + safetyStock : Math.max(0, Number(item.lowThreshold || 0));
    const predictedAtArrival = Math.max(0, currentQty - forecastDaily * leadTimeDays);
    const desiredQty = forecastDaily > 0 ? forecastDaily * targetCoverageDays + safetyStock : Math.max(currentQty, Number(item.lowThreshold || 0));
    let recommendedQty = currentQty <= reorderPoint ? Math.max(0, desiredQty - currentQty) : 0;
    if (recommendedQty > 0) recommendedQty = cartonSize > 0 ? Math.ceil(recommendedQty / cartonSize) * cartonSize : Math.ceil(recommendedQty * 100) / 100;
    const recommendedCartons = cartonSize > 0 ? Math.ceil(recommendedQty / cartonSize) : 0;
    const daysCover = forecastDaily > 0 ? currentQty / forecastDaily : Infinity;
    const predictedOutDate = forecastDaily > 0 ? addDays(today, Math.max(0, Math.floor(daysCover))) : null;
    const orderDueNow = forecastDaily > 0 && currentQty <= reorderPoint;
    const status = currentQty <= Number(item.criticalThreshold || 0) || (forecastDaily > 0 && daysCover <= Math.max(1.5, leadTimeDays))
      ? "Kritis"
      : currentQty <= Number(item.lowThreshold || 0) || (forecastDaily > 0 && daysCover <= Math.max(3, leadTimeDays + 2)) ? "Menipis" : "Aman";
    const latestOpname = latestOpnameByItem.get(item.id) || null;
    const varianceQty = latestOpname && Number.isFinite(Number(latestOpname.varianceQty)) ? Number(latestOpname.varianceQty) : null;
    const usageVariance = usageTotal - salesExpectedTotal;
    const confidence = confidenceLabel(periodDays, mappedSalesRate, hasActual, hasSales);

    return {
      ...item,
      currentQty,
      periodDays,
      periodStart: first,
      usageTotal,
      wasteTotal,
      actualConsumptionTotal,
      salesExpectedTotal,
      usageVariance,
      avgDailyUsage: usageTotal / periodDays,
      avgDailyWaste: wasteDaily,
      salesExpectedDaily: salesDaily,
      forecastDaily,
      mappedSalesRate,
      reorderPoint,
      predictedAtArrival,
      desiredQty,
      recommendedQty,
      recommendedCartons,
      daysCover,
      predictedOutDate,
      orderDueNow,
      status,
      predictionConfidence: confidence,
      latestOpnameDate: latestOpname?.date || "",
      stockVarianceQty: varianceQty,
      explanation: buildExplanation({ item, forecastDaily, currentQty, leadTimeDays, targetCoverageDays, safetyStock, predictedAtArrival, recommendedQty, cartonSize, usageTotal, wasteTotal, salesExpectedTotal, periodDays, mappedSalesRate })
    };
  }).sort((a,b) => statusRank(a.status)-statusRank(b.status) || Number(b.recommendedQty||0)-Number(a.recommendedQty||0) || String(a.name||"").localeCompare(String(b.name||""),"id"));
}

export function calculateWasteConversion(wasteItem, qty, context = {}) {
  const amount = Math.max(0, Number(qty || 0));
  if (!(amount > 0) || !wasteItem) return null;
  const sourceType = wasteItem.planningSourceType || "none";
  const sourceId = wasteItem.planningRefId || "";
  const productionRecipes = context.productionRecipes || [];
  const productRecipes = context.productRecipes || [];
  const stockItems = context.stockItems || [];
  if (sourceType === "product") {
    const recipe = productRecipes.find(x => x.id === sourceId);
    if (!recipe || !(Number(recipe.wasteMeasureQty) > 0)) return null;
    const productQty = amount / Number(recipe.wasteMeasureQty);
    const stockTotals = expandProduct(recipe, productQty, { productionRecipes, productRecipes, stockItems });
    return { type: "product", productQty, label: recipeLabel(recipe), stockTotals, measureUnit: recipe.wasteMeasureUnit || wasteItem.unit || "QTY" };
  }
  if (sourceType === "production") {
    const recipe = productionRecipes.find(x => x.id === sourceId);
    if (!recipe || !(Number(recipe.yieldQty) > 0)) return null;
    const batchQty = amount / Number(recipe.yieldQty);
    const stockTotals = expandProduction(recipe, amount, { productionRecipes, stockItems });
    return { type: "production", batchQty, label: recipe.name, stockTotals, measureUnit: recipe.outputUnit || wasteItem.unit || "QTY" };
  }
  if (sourceType === "stock") {
    const item = stockItems.find(x => x.id === sourceId);
    if (!item) return null;
    const stockTotals = new Map([[item.id, amount]]);
    return { type: "stock", stockQty: amount, label: item.name, stockTotals, measureUnit: item.unit || wasteItem.unit || "QTY" };
  }
  return null;
}

export function buildWasteEquivalentSummary(context = {}, date = "") {
  const day = (context.wasteDays || []).find(x => x.date === date);
  if (!day) return [];
  return (context.wasteItems || []).map(item => {
    const qty = Number(day.values?.[item.id] || 0);
    const conversion = calculateWasteConversion(item, qty, context);
    return qty > 0 && conversion ? { item, qty, conversion } : null;
  }).filter(Boolean);
}

export function buildSalesMappingStats(salesRecords = [], productRecipes = [], salesMappings = []) {
  const total = salesRecords.length;
  let mapped = 0;
  const unmatchedKeys = new Map();
  salesRecords.forEach(row => {
    const recipe = row.productRecipeId
      ? productRecipes.find(x => x.id === row.productRecipeId)
      : resolveProductRecipe(row.productName, row.variant, productRecipes, salesMappings);
    if (recipe) mapped += 1;
    else {
      const key = `${String(row.productName || "").toLowerCase()}|${String(row.variant || "").toLowerCase()}`;
      if (!unmatchedKeys.has(key)) unmatchedKeys.set(key, { productName: row.productName, variant: row.variant, count: 0 });
      unmatchedKeys.get(key).count += 1;
    }
  });
  return { total, mapped, unmapped: total - mapped, rate: total ? mapped / total : 0, unmatched: [...unmatchedKeys.values()] };
}

function buildWasteExpansion({ wasteItems, wasteDays, productionRecipes, productRecipes, stockItems, start, today }) {
  const stockTotals = new Map();
  wasteDays.filter(day => inRange(day.date, start, today)).forEach(day => {
    wasteItems.forEach(item => {
      const qty = Number(day.values?.[item.id] || 0);
      if (!(qty > 0)) return;
      const conversion = calculateWasteConversion(item, qty, { productionRecipes, productRecipes, stockItems });
      if (!conversion) return;
      conversion.stockTotals.forEach((value, itemId) => addMap(stockTotals, itemId, value));
    });
  });
  return { stockTotals };
}

function buildSalesExpansion({ salesRecords, productRecipes, productionRecipes, stockItems, salesMappings, start, today }) {
  const stockTotals = new Map();
  let totalQty = 0, mappedQty = 0;
  salesRecords.filter(row => inRange(row.date, start, today)).forEach(row => {
    const qty = Math.max(0, Number(row.qtySold || 0));
    totalQty += qty;
    const recipe = row.productRecipeId
      ? productRecipes.find(x => x.id === row.productRecipeId && x.active !== false)
      : resolveProductRecipe(row.productName, row.variant, productRecipes, salesMappings);
    if (!recipe || !(qty > 0)) return;
    mappedQty += qty;
    const expanded = expandProduct(recipe, qty, { productionRecipes, productRecipes, stockItems });
    expanded.forEach((value, itemId) => addMap(stockTotals, itemId, value));
  });
  return { stockTotals, totalQty, mappedQty };
}

function expandProduct(recipe, productQty, context) {
  const out = new Map();
  (recipe.components || []).forEach(component => {
    const qty = Math.max(0, Number(component.qty || 0)) * Math.max(0, Number(productQty || 0));
    if (!(qty > 0)) return;
    if (component.sourceType === "production") {
      const production = (context.productionRecipes || []).find(x => x.id === component.sourceId && x.active !== false);
      if (!production) return;
      const expanded = expandProduction(production, qty, context);
      expanded.forEach((value, itemId) => addMap(out, itemId, value));
    } else {
      addMap(out, component.sourceId, qty);
    }
  });
  return out;
}

function expandProduction(recipe, outputQty, context) {
  const out = new Map();
  const yieldQty = Math.max(0, Number(recipe.yieldQty || 0));
  if (!(yieldQty > 0)) return out;
  const ratio = Math.max(0, Number(outputQty || 0)) / yieldQty;
  (recipe.ingredients || []).forEach(ingredient => {
    if (!ingredient.itemId) return;
    addMap(out, ingredient.itemId, Math.max(0, Number(ingredient.qty || 0)) * ratio);
  });
  return out;
}

function latestOpnames(opnames) {
  const map = new Map();
  (opnames || []).forEach(row => {
    const prev = map.get(row.itemId);
    if (!prev || String(row.date || "") > String(prev.date || "")) map.set(row.itemId, row);
  });
  return map;
}

function collectPeriodDates({ stockMovements, wasteDays, salesRecords, start, today }) {
  const dates = new Set();
  stockMovements.forEach(x => { if (x.type === "OUT" && inRange(x.date,start,today)) dates.add(x.date); });
  wasteDays.forEach(x => { if (inRange(x.date,start,today)) dates.add(x.date); });
  salesRecords.forEach(x => { if (inRange(x.date,start,today)) dates.add(x.date); });
  return [...dates].sort();
}

function buildExplanation({ item, forecastDaily, currentQty, leadTimeDays, targetCoverageDays, safetyStock, predictedAtArrival, recommendedQty, cartonSize, usageTotal, wasteTotal, salesExpectedTotal, periodDays, mappedSalesRate }) {
  return {
    periodDays,
    usageTotal,
    wasteTotal,
    salesExpectedTotal,
    mappedSalesRate,
    forecastDaily,
    currentQty,
    leadTimeDays,
    targetCoverageDays,
    safetyStock,
    predictedAtArrival,
    recommendedQty,
    cartonSize,
    unit: item.unit || "PCS"
  };
}

function confidenceLabel(days, mappedRate, hasActual, hasSales) {
  if (!hasActual && !hasSales) return "Belum cukup data";
  if (days < 7) return "Estimasi awal";
  if (hasSales && mappedRate >= 0.9 && days >= 21) return "Baik";
  if (days >= 14) return "Cukup";
  return "Estimasi awal";
}
function recipeLabel(r) { return `${r.productName || r.name || "Produk"}${r.variant ? ` · ${r.variant}` : ""}`; }
function addMap(map,key,value) { if (!key || !Number.isFinite(Number(value))) return; map.set(key, (map.get(key) || 0) + Number(value)); }
function getMap(map,key) { return Number(map.get(key) || 0); }
function inRange(date,start,end) { const d=String(date||""); return d && d>=String(start||"") && d<=String(end||""); }
function statusRank(s) { return s === "Kritis" ? 0 : s === "Menipis" ? 1 : 2; }
function localDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function dateUtc(v) { const [y,m,d]=String(v||"").split("-").map(Number); return y&&m&&d ? Date.UTC(y,m-1,d) : null; }
function dayDiff(a,b) { const da=dateUtc(a), db=dateUtc(b); return da&&db ? Math.round((db-da)/86400000) : 0; }
function addDays(dateKey, days) { const dt=dateUtc(dateKey); if (!dt) return null; return new Date(dt + Number(days||0)*86400000).toISOString().slice(0,10); }
