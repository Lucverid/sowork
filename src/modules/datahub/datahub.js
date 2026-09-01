import * as XLSX from "xlsx-js-style";
import { saveSchedule } from "../schedule/schedule.js";
import { saveChecklistItem } from "../checklist/checklist.js";
import { saveStockItem, saveStockReceipt, saveDailyStockUsage, saveStockOpname } from "../stock/stock.js";
import { buildStockReconciliation } from "../stock/analytics.js";
import { saveWasteItem, saveWasteDay } from "../waste/waste.js";
import { savePersonalReport } from "../reports/reports.js";

const HEADER = {
  fill: { patternType: "solid", fgColor: { rgb: "FF172033" } },
  font: { color: { rgb: "FFFFFFFF" }, bold: true, name: "Arial", sz: 10 },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: thinBorder()
};

const SUBHEADER = {
  fill: { patternType: "solid", fgColor: { rgb: "FFE8F5EF" } },
  font: { color: { rgb: "FF14532D" }, bold: true, name: "Arial", sz: 10 },
  alignment: { vertical: "center", wrapText: true },
  border: thinBorder()
};

export function exportDashboardWorkbook({ stockAnalytics = [], wasteAlerts = [], todaySchedule = [], filename }) {
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Ringkasan", [
    ["SoWork Dashboard", "Nilai"],
    ["Tanggal Export", new Date().toLocaleString("id-ID")],
    ["Crew terjadwal hari ini", todaySchedule.length],
    ["Stock Kritis", stockAnalytics.filter(x => x.status === "Kritis").length],
    ["Stock Menipis", stockAnalytics.filter(x => x.status === "Menipis").length],
    ["Waste Warning", wasteAlerts.length]
  ], [26, 28], { headerRows: 1 });
  addSheet(wb, "Stock Alert", stockAlertRows(stockAnalytics), [30, 14, 14, 16, 18, 18, 20]);
  addSheet(wb, "Waste Alert", [["Judul", "Pesan", "Severity"], ...wasteAlerts.map(x => [x.title, x.message, x.severity])], [28, 70, 14]);
  addSheet(wb, "Jadwal Hari Ini", [["Tanggal","Crew","Shift","Role","Lembur"], ...todaySchedule.map(x => [x.date,x.crewName,x.shift,x.role||"",boolText(x.overtime)])], [14,20,12,20,12]);
  XLSX.writeFile(wb, filename || `SoWork-Dashboard-${dateKey(new Date())}.xlsx`);
}

export function exportChecklistWorkbook({ templates = [], completions = [], filename }) {
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Checklist Template", [
    ["ID","Task","Shift","Assignment Type","Required Role","Specific Crew","Urutan","Aktif"],
    ...templates.map(x => [x.id,x.title,x.shift,x.assignmentType,x.requiredRole||"",x.specificCrew||"",Number(x.order||0),boolText(x.active!==false)])
  ], [18,36,12,20,20,22,10,10]);
  addSheet(wb, "Checklist Completion", [
    ["ID","Tanggal","Template ID","Task","Shift","Assigned Crew","Assigned Role","Selesai","Updated By"],
    ...completions.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(x => [x.id,x.date,x.templateId,x.title,x.shift,x.assignedCrew,x.assignedRole,boolText(x.completed),x.updatedByName||""])
  ], [22,14,20,36,12,22,20,10,22]);
  XLSX.writeFile(wb, filename || "SoWork-Checklist.xlsx");
}

export function exportStockWorkbook({ items = [], movements = [], opnames = [], analytics = [], filename }) {
  const wb = XLSX.utils.book_new();
  appendStockSheets(wb, { items, movements, opnames, analytics });
  XLSX.writeFile(wb, filename || `SoWork-Stock-${dateKey(new Date())}.xlsx`);
}

export function exportStockOpnameWorkbook({ items = [], opnames = [], movements = [], filename }) {
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Stock Opname", stockOpnameRows(opnames), [14,20,30,22,16,22,16,16,12,16,16,14,18]);
  const dates = [...new Set(opnames.map(x=>x.date).filter(Boolean))].sort();
  const reconciliation = [["Tanggal","Item ID","Nama Item","Stok Sistem","Stok Fisik","Selisih","Selisih %","Akurasi %","Status","SO Sebelumnya","Barang Masuk","Penggunaan","Satuan"]];
  dates.forEach(date => buildStockReconciliation(items,opnames,movements,date).filter(x=>x.physicalQty!=null).forEach(x => reconciliation.push([date,x.id,x.name,Number(x.systemQty||0),Number(x.physicalQty||0),Number(x.varianceQty||0),x.variancePct==null?"":Number(x.variancePct.toFixed(2)),x.accuracyPct==null?"":Number(x.accuracyPct.toFixed(2)),x.reconciliationStatus,x.previousOpnameDate||"",Number(x.incomingSincePrevious||0),Number(x.usageSincePrevious||0),x.unit])));
  addSheet(wb, "Rekonsiliasi SO", reconciliation, [14,20,30,16,16,14,14,14,18,14,16,16,12]);
  addSheet(wb, "Stock Master Ref", stockMasterRows(items), [18,30,16,12,14,14,22,22,16,17,14,18,14,12,10]);
  XLSX.writeFile(wb, filename || `SoWork-Stock-Opname-${dateKey(new Date())}.xlsx`);
}

export function exportOrderPlannerWorkbook({ analytics = [], filename }) {
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Order Planner", orderPlannerRows(analytics), [30,14,14,16,16,18,18,18,18,14,18,12]);
  XLSX.writeFile(wb, filename || `SoWork-Order-Planner-${dateKey(new Date())}.xlsx`);
}

export function exportReportsWorkbook({ reports = [], filename }) {
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Laporan", reportRows(reports), [22,14,10,18,16,40,40,40,40,40,22]);
  XLSX.writeFile(wb, filename || `SoWork-Laporan-${dateKey(new Date())}.xlsx`);
}

export function exportCalculatorWorkbook({ rows = [], filename }) {
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Kalkulator", [["Bagian","Input / Hasil","Nilai"], ...rows], [28,32,24]);
  XLSX.writeFile(wb, filename || `SoWork-Kalkulator-${dateKey(new Date())}.xlsx`);
}

export function exportAllWorkbook({ schedules = [], checklist = [], checklistCompletions = [], stockItems = [], stockMovements = [], stockOpnames = [], stockAnalytics = [], wasteItems = [], wasteDays = [], reports = [], appSettings = {}, stockSettings = {}, filename }) {
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Jadwal Data", scheduleRows(schedules), [14,22,10,12,20,32,10,18,32]);
  addSheet(wb, "Checklist Template", [["ID","Task","Shift","Assignment Type","Required Role","Specific Crew","Urutan","Aktif"], ...checklist.map(x => [x.id,x.title,x.shift,x.assignmentType,x.requiredRole||"",x.specificCrew||"",Number(x.order||0),boolText(x.active!==false)])], [18,36,12,20,20,22,10,10]);
  addSheet(wb, "Checklist Completion", [["ID","Tanggal","Template ID","Task","Shift","Assigned Crew","Assigned Role","Selesai","Updated By"], ...checklistCompletions.map(x => [x.id,x.date,x.templateId,x.title,x.shift,x.assignedCrew,x.assignedRole,boolText(x.completed),x.updatedByName||""])], [22,14,20,36,12,22,20,10,22]);
  appendStockSheets(wb, { items: stockItems, movements: stockMovements, opnames: stockOpnames, analytics: stockAnalytics });
  appendWasteSheets(wb, { items: wasteItems, days: wasteDays });
  addSheet(wb, "Laporan", reportRows(reports), [22,14,10,18,16,40,40,40,40,40,22]);
  addSheet(wb, "Settings", [["Key","Value"], ...Object.entries({ ...appSettings, ...prefixKeys(stockSettings, "notification.") }).map(([k,v]) => [k, simpleValue(v)])], [34,60]);
  addSheet(wb, "README", [
    ["SoWork Data Export", "Keterangan"],
    ["Format", "Workbook ini dibuat supaya mudah dishare dan sebagian sheet dapat di-import kembali ke SoWork."],
    ["Importable", "Jadwal Data, Checklist Template, Stock Master, Stock Masuk, Penggunaan Stok, Stock Opname, Waste Master, Waste Harian, Laporan."],
    ["Derived", "Order Planner dan beberapa ringkasan adalah hasil prediksi, jadi tidak di-import kembali."],
    ["Generated", new Date().toLocaleString("id-ID")]
  ], [30,90]);
  XLSX.writeFile(wb, filename || `SoWork-All-Data-${dateKey(new Date())}.xlsx`);
}

export async function importFeatureWorkbook(feature, file, context = {}) {
  if (!file) throw new Error("File Excel belum dipilih.");
  const wb = await readWorkbook(file);
  switch (feature) {
    case "schedule": return importSchedule(wb);
    case "checklist": return importChecklist(wb);
    case "stockMaster": return importStockMaster(wb, context.stockItems || []);
    case "stockIncoming": return importStockIncoming(wb, context);
    case "stockUsage": return importStockUsage(wb, context);
    case "opname": return importOpname(wb, context);
    case "waste": return importWaste(wb, context);
    case "reports": return importReports(wb, context);
    case "all": return importAll(wb, context);
    default: throw new Error(`Jenis import ${feature} belum didukung.`);
  }
}

export function chooseExcelFile() {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0] || null;
      input.remove();
      resolve(file);
    };
    input.click();
  });
}

async function importAll(wb, context) {
  const results = [];
  for (const feature of ["schedule","checklist","stockMaster","opname","waste","reports"]) {
    try {
      const result = await ({
        schedule: () => importSchedule(wb),
        checklist: () => importChecklist(wb),
        stockMaster: () => importStockMaster(wb, context.stockItems || []),
        opname: () => importOpname(wb, context),
        waste: () => importWaste(wb, context),
        reports: () => importReports(wb, context)
      }[feature])();
      if (result.count) results.push(result);
    } catch (err) {
      if (!String(err?.message || "").includes("Sheet")) throw err;
    }
  }
  if (!results.length) throw new Error("Tidak ada sheet import SoWork yang dikenali.");
  return { count: results.reduce((s,x)=>s+x.count,0), detail: results.map(x=>x.detail).join(" · ") };
}

async function importSchedule(wb) {
  const rows = getRows(wb, "Jadwal Data", true);
  let count = 0;
  for (const [index,row] of rows.entries()) {
    const date = asDate(row["Tanggal"]);
    const crewName = text(row["Crew"] || row["Nama Crew"]);
    const shift = normalizeShift(row["Shift"]);
    if (!date || !crewName || !shift) continue;
    await saveSchedule({
      date, crewName, gender: text(row["Gender"]), shift,
      role: shift === "Libur" ? "" : text(row["Role"]),
      notes: text(row["Catatan"]),
      overtime: asBool(row["Lembur"]),
      overtimeType: text(row["Jenis Lembur"] || "Buka"),
      overtimeNote: text(row["Catatan Lembur"]),
      source: "excel-import"
    });
    count++;
  }
  return { count, detail: `Jadwal ${count}` };
}

async function importChecklist(wb) {
  const rows = getRows(wb, "Checklist Template", true);
  let count = 0;
  for (const [index,row] of rows.entries()) {
    const title = text(row["Task"] || row["Title"]);
    if (!title) continue;
    const shift = normalizeChecklistShift(row["Shift"]);
    const assignmentType = normalizeAssignment(row["Assignment Type"]);
    await saveChecklistItem({
      id: text(row["ID"]) || `import_${slug(`${title}_${shift}_${index}`)}`,
      title, shift, assignmentType,
      requiredRole: text(row["Required Role"] || "Bar"),
      specificCrew: text(row["Specific Crew"]),
      order: num(row["Urutan"], index + 1),
      active: row["Aktif"] === "" ? true : asBool(row["Aktif"])
    });
    count++;
  }
  return { count, detail: `Checklist ${count}` };
}

async function importStockMaster(wb, existingItems) {
  const rows = getRows(wb, "Stock Master", true);
  let count = 0;
  const local = existingItems.slice();
  for (const row of rows) {
    const name = text(row["Nama"] || row["Nama Item"]);
    if (!name) continue;
    const existing = findByIdOrName(local, row["ID"], name);
    const id = text(row["ID"]) || existing?.id;
    const savedId = await saveStockItem({
      id,
      name,
      category: text(row["Kategori"] || existing?.category || "Bahan"),
      unit: text(row["Satuan"] || existing?.unit || "PCS"),
      cartonSize: num(row["Isi per Karton"], existing?.cartonSize || 0),
      currentQty: num(row["Current Stock"], existing?.currentQty || 0),
      lastPrimaryQty: existing?.lastPrimaryQty,
      lastSecondaryQty: existing?.lastSecondaryQty,
      primaryLocation: text(row["Lokasi 1"] || existing?.primaryLocation || "Gudang Utama"),
      secondaryLocation: text(row["Lokasi 2"] || existing?.secondaryLocation || "Gudang 2"),
      criticalThreshold: num(row["Threshold Kritis"], existing?.criticalThreshold || 0),
      lowThreshold: num(row["Threshold Menipis"], existing?.lowThreshold || 0),
      leadTimeDays: num(row["Lead Time Hari"], existing?.leadTimeDays || 2),
      targetCoverageDays: num(row["Target Coverage Hari"], existing?.targetCoverageDays || 7),
      safetyStock: num(row["Safety Stock"], existing?.safetyStock || 0),
      criticalItem: row["Item Krusial"] === "" ? Boolean(existing?.criticalItem) : asBool(row["Item Krusial"]),
      active: row["Aktif"] === "" ? (existing?.active !== false) : asBool(row["Aktif"])
    });
    local.push({ ...existing, id: savedId, name });
    count++;
  }
  return { count, detail: `Stock Master ${count}` };
}

async function importStockIncoming(wb, context) {
  const rows = getRows(wb, "Stock Masuk", true);
  const items = context.stockItems || [];
  let count = 0;
  for (const [index,row] of rows.entries()) {
    const item = findByIdOrName(items, row["Item ID"], row["Nama Item"]);
    const date = asDate(row["Tanggal"]);
    if (!item || !date) continue;
    const cartons = Math.max(0, num(row["Karton"], 0));
    const looseQty = Math.max(0, num(row["Qty Lepas"], 0));
    if (!(cartons > 0 || looseQty > 0)) continue;
    await saveStockReceipt({
      id: text(row["ID"]) || `excel_${slug(`${date}_${item.id}_${index}_${cartons}_${looseQty}`)}`,
      idempotent: true,
      itemId: item.id,
      itemName: item.name,
      date, cartons, looseQty,
      cartonSize: item.cartonSize,
      unit: item.unit,
      destination: text(row["Tujuan"] || item.primaryLocation || "Gudang Utama"),
      supplier: text(row["Supplier"]),
      note: text(row["Catatan"]),
      createdByUid: context.actor?.uid || "",
      createdByName: context.actor?.name || "Excel Import"
    });
    count++;
  }
  return { count, detail: `Stock Masuk ${count}` };
}

async function importStockUsage(wb, context) {
  const rows = getRows(wb, "Penggunaan Stok", true);
  const items = context.stockItems || [];
  const grouped = {};
  for (const row of rows) {
    const item = findByIdOrName(items, row["Item ID"], row["Nama Item"]);
    const date = asDate(row["Tanggal"]);
    if (!item || !date) continue;
    (grouped[date] ||= []).push({
      itemId: item.id,
      itemName: item.name,
      unit: item.unit || "PCS",
      qty: Math.max(0, num(row["Qty Digunakan"] ?? row["Qty"], 0)),
      category: text(row["Kategori"] || "Pemakaian Harian"),
      note: text(row["Catatan"])
    });
  }
  let count=0;
  for (const [date,part] of Object.entries(grouped)) {
    await saveDailyStockUsage(date, part, context.actor || {});
    count += part.length;
  }
  return { count, detail: `Penggunaan Stok ${count}` };
}

async function importOpname(wb, context) {
  const rows = getRows(wb, "Stock Opname", true);
  const items = context.stockItems || [];
  const grouped = {};
  for (const row of rows) {
    const item = findByIdOrName(items, row["Item ID"], row["Nama Item"]);
    const date = asDate(row["Tanggal"]);
    if (!item || !date) continue;
    (grouped[date] ||= []).push({
      itemId: item.id,
      itemName: item.name,
      primaryLocation: item.primaryLocation || "Gudang Utama",
      primaryQty: Math.max(0, num(row["Qty Lokasi 1"], 0)),
      secondaryLocation: item.secondaryLocation || "Gudang 2",
      secondaryQty: Math.max(0, num(row["Qty Lokasi 2"], 0)),
      unit: item.unit || "PCS"
    });
  }
  let count = 0;
  for (const [date,part] of Object.entries(grouped)) {
    await saveStockOpname(date, part, context.actor || {});
    count += part.length;
  }
  return { count, detail: `Stock Opname ${count}` };
}

async function importWaste(wb, context) {
  let count = 0;
  let items = (context.wasteItems || []).slice();
  const masterSheet = wb.Sheets["Waste Master"];
  if (masterSheet) {
    const rows = sheetJson(masterSheet);
    for (const [index,row] of rows.entries()) {
      const name = text(row["Nama Item"] || row["Nama"]);
      if (!name) continue;
      const existing = findByIdOrName(items, row["ID"], name);
      const id = await saveWasteItem({
        id: text(row["ID"]) || existing?.id || `import_${slug(`${name}_${index}`)}`,
        name,
        unit: text(row["Satuan"] || existing?.unit || "QTY"),
        category: text(row["Kategori"] || existing?.category || "Waste"),
        dailyWarningQty: num(row["Warning Harian"], existing?.dailyWarningQty || 0),
        monthlyTargetQty: num(row["Target Bulanan"], existing?.monthlyTargetQty || 0),
        costPerUnit: num(row["Biaya per Unit"], existing?.costPerUnit || 0),
        active: row["Aktif"] === "" ? (existing?.active !== false) : asBool(row["Aktif"]),
        sortOrder: existing?.sortOrder || index + 1
      });
      items.push({ ...existing, id, name, unit: text(row["Satuan"] || existing?.unit || "QTY"), category: text(row["Kategori"] || "Waste") });
      count++;
    }
  }

  const dailySheet = wb.Sheets["Waste Harian"] || wb.Sheets["Waste Data"];
  if (dailySheet) {
    const rows = sheetJson(dailySheet);
    const grouped = {};
    for (const row of rows) {
      const date = asDate(row["Tanggal"]);
      const item = findByIdOrName(items, row["Item ID"], row["Nama Item"]);
      const qty = Math.max(0, num(row["Qty"], 0));
      if (!date || !item || !(qty >= 0)) continue;
      (grouped[date] ||= {})[item.id] = qty;
    }
    const existingDays = context.wasteDays || [];
    const meta = Object.fromEntries(items.map(x => [x.id, { name:x.name, unit:x.unit, category:x.category }]));
    for (const [date,values] of Object.entries(grouped)) {
      const old = existingDays.find(x => x.date === date)?.values || {};
      await saveWasteDay(date, { ...old, ...values }, context.actor || {}, meta);
      count += Object.keys(values).length;
    }
  }

  if (!masterSheet && !dailySheet) throw new Error('Sheet "Waste Master" atau "Waste Harian" tidak ditemukan.');
  return { count, detail: `Waste ${count}` };
}

async function importReports(wb, context) {
  const rows = getRows(wb, "Laporan", true);
  let count = 0;
  for (const [index,row] of rows.entries()) {
    const date = asDate(row["Tanggal"]);
    if (!date) continue;
    await savePersonalReport({
      id: text(row["ID"]) || `excel_${slug(`${date}_${index}_${text(row["Ringkasan"]).slice(0,20)}`)}`,
      date,
      shift: text(row["Shift"]), role: text(row["Role"]), sales: num(row["Penjualan"],0),
      summary: text(row["Ringkasan"]), issues: text(row["Kendala"]), stockNotes: text(row["Catatan Stok"]),
      equipmentNotes: text(row["Catatan Alat"]), followUp: text(row["Follow-up"]),
      authorUid: context.actor?.uid || "", authorName: context.actor?.name || "Excel Import"
    });
    count++;
  }
  return { count, detail: `Laporan ${count}` };
}

function appendStockSheets(wb, { items, movements, opnames, analytics }) {
  addSheet(wb, "Stock Master", stockMasterRows(items), [18,30,16,12,14,14,22,22,16,17,14,18,14,12,10]);
  addSheet(wb, "Stock Masuk", stockIncomingRows(movements), [24,14,20,30,12,12,14,12,22,22,32]);
  addSheet(wb, "Penggunaan Stok", stockUsageRows(movements), [14,20,30,16,12,20,32]);
  addSheet(wb, "Stock Opname", stockOpnameRows(opnames), [14,20,30,22,16,22,16,16,12,16,16,14,18]);
  addSheet(wb, "Order Planner", orderPlannerRows(analytics), [30,14,14,16,16,18,18,18,18,14,18,12]);
}

export function appendWasteSheets(wb, { items = [], days = [] }) {
  addSheet(wb, "Waste Master", [["ID","Nama Item","Satuan","Kategori","Warning Harian","Target Bulanan","Biaya per Unit","Aktif"], ...items.map(x => [x.id,x.name,x.unit,x.category||"Waste",Number(x.dailyWarningQty||0),Number(x.monthlyTargetQty||0),Number(x.costPerUnit||0),boolText(x.active!==false)])], [18,30,12,16,16,16,16,10]);
  const rows = [["Tanggal","Item ID","Nama Item","Qty","Satuan"]];
  days.slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).forEach(day => {
    Object.entries(day.values || {}).forEach(([itemId,qty]) => {
      const item = items.find(x=>x.id===itemId);
      const snapshot = day.itemSnapshots?.[itemId];
      rows.push([day.date,itemId,item?.name||snapshot?.name||itemId,Number(qty||0),item?.unit||snapshot?.unit||"QTY"]);
    });
  });
  addSheet(wb, "Waste Harian", rows, [14,20,30,14,12]);
}

function scheduleRows(rows) {
  return [["Tanggal","Crew","Gender","Shift","Role","Catatan","Lembur","Jenis Lembur","Catatan Lembur"], ...rows.slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.crewName||"").localeCompare(String(b.crewName||""))).map(x => [x.date,x.crewName,x.gender||"",x.shift,x.role||"",x.notes||"",boolText(x.overtime),x.overtimeType||"",x.overtimeNote||""])];
}
function stockMasterRows(items) {
  return [["ID","Nama","Kategori","Satuan","Isi per Karton","Current Stock","Lokasi 1","Lokasi 2","Threshold Kritis","Threshold Menipis","Lead Time Hari","Target Coverage Hari","Safety Stock","Item Krusial","Aktif"], ...items.map(x => [x.id,x.name,x.category,x.unit,Number(x.cartonSize||0),Number(x.currentQty||0),x.primaryLocation,x.secondaryLocation,Number(x.criticalThreshold||0),Number(x.lowThreshold||0),Number(x.leadTimeDays||0),Number(x.targetCoverageDays||0),Number(x.safetyStock||0),boolText(x.criticalItem),boolText(x.active!==false)])];
}
function stockIncomingRows(movements) {
  return [["ID","Tanggal","Item ID","Nama Item","Karton","Qty Lepas","Total Qty","Satuan","Tujuan","Supplier","Catatan"], ...movements.filter(x=>x.type==="IN").map(x => [x.id,x.date,x.itemId,x.itemName,Number(x.cartons||0),Number(x.looseQty||0),Number(x.qty||0),x.unit,x.destination,x.supplier,x.note])];
}
function stockUsageRows(movements) {
  return [["Tanggal","Item ID","Nama Item","Qty Digunakan","Satuan","Kategori","Catatan"], ...movements.filter(x=>x.type==="OUT").slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.itemName||"").localeCompare(String(b.itemName||""))).map(x => [x.date,x.itemId,x.itemName,Number(x.qty||0),x.unit,x.category||"Pemakaian Harian",x.note||""])];
}
function stockOpnameRows(opnames) {
  return [["Tanggal","Item ID","Nama Item","Lokasi 1","Qty Lokasi 1","Lokasi 2","Qty Lokasi 2","Total Qty","Satuan","Stok Sistem","Selisih","Akurasi %","Status"], ...opnames.map(x => [x.date,x.itemId,x.itemName,x.primaryLocation,Number(x.primaryQty||0),x.secondaryLocation,Number(x.secondaryQty||0),Number(x.totalQty||0),x.unit,x.systemQtyBeforeOpname==null?"":Number(x.systemQtyBeforeOpname),x.varianceQty==null?"":Number(x.varianceQty),x.accuracyPct==null?"":Number(x.accuracyPct),x.reconciliationStatus||""])];
}
function orderPlannerRows(analytics) {
  return [["Nama Item","Status","Satuan","Current Stock","Avg/Hari","Days Cover","Prediksi Habis","Order Paling Lambat","Saran Order Qty","Saran Karton","Confidence","Snapshot"], ...analytics.map(x => [x.name,x.status,x.unit,Number(x.currentQty||0),Number(x.avgDailyUsage||0),Number.isFinite(x.daysCover)?Number(x.daysCover.toFixed(2)):"",x.predictedOutDate||"",x.recommendedOrderDate||"",Number(x.recommendedQty||0),Number(x.recommendedCartons||0),x.predictionConfidence,x.historyCount])];
}
function reportRows(reports) {
  return [["ID","Tanggal","Shift","Role","Penjualan","Ringkasan","Kendala","Catatan Stok","Catatan Alat","Follow-up","Author"], ...reports.map(x => [x.id,x.date,x.shift,x.role,Number(x.sales||0),x.summary,x.issues,x.stockNotes,x.equipmentNotes,x.followUp,x.authorName||""])];
}
function stockAlertRows(analytics) {
  return [["Nama Item","Status","Stok","Satuan","Days Cover","Saran Order","Order Paling Lambat"], ...analytics.filter(x=>x.status!=="Aman").map(x=>[x.name,x.status,Number(x.currentQty||0),x.unit,Number.isFinite(x.daysCover)?Number(x.daysCover.toFixed(2)):"",Number(x.recommendedQty||0),x.recommendedOrderDate||""])];
}

async function readWorkbook(file) {
  const data = await file.arrayBuffer();
  return XLSX.read(data, { type: "array", cellDates: false });
}
function getRows(wb, sheetName, required = false) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    if (required) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
    return [];
  }
  return sheetJson(sheet);
}
function sheetJson(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
}
function addSheet(wb, name, rows, widths = [], opts = {}) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!cols"] = widths.map(wch => ({ wch }));
  const headerRows = opts.headerRows ?? 1;
  for (let r=0;r<headerRows;r++) {
    for (let c=0;c<(rows[r]?.length||0);c++) styleCell(ws,r,c,HEADER);
  }
  for (let r=headerRows;r<rows.length;r++) {
    for (let c=0;c<(rows[r]?.length||0);c++) {
      const addr = XLSX.utils.encode_cell({r,c});
      if (!ws[addr]) continue;
      ws[addr].s = { alignment:{vertical:"top",wrapText:true}, border:thinBorder(), font:{name:"Arial",sz:10} };
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
  return ws;
}
function styleCell(ws,r,c,style){ const a=XLSX.utils.encode_cell({r,c}); if(ws[a]) ws[a].s=style; }
function thinBorder(){ return {top:{style:"thin",color:{rgb:"FFE5E7EB"}},bottom:{style:"thin",color:{rgb:"FFE5E7EB"}},left:{style:"thin",color:{rgb:"FFE5E7EB"}},right:{style:"thin",color:{rgb:"FFE5E7EB"}}}; }
function boolText(v){ return v ? "TRUE" : "FALSE"; }
function asBool(v){ const s=String(v??"").trim().toLowerCase(); return ["true","1","yes","ya","y","aktif","selesai"].includes(s) || v === true || v === 1; }
function num(v,fallback=0){ const n=Number(String(v??"").replace(/,/g,".")); return Number.isFinite(n)?n:Number(fallback||0); }
function text(v){ return String(v??"").trim(); }
function simpleValue(v){ return typeof v === "object" ? JSON.stringify(v) : String(v ?? ""); }
function prefixKeys(obj,prefix){ return Object.fromEntries(Object.entries(obj||{}).map(([k,v])=>[`${prefix}${k}`,v])); }
function slug(v){ return String(v||"").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase().slice(0,120) || "row"; }
function findByIdOrName(items,id,name){ const sid=text(id); const sname=text(name).toLowerCase(); return items.find(x=>sid && x.id===sid) || items.find(x=>sname && String(x.name||"").trim().toLowerCase()===sname) || null; }
function normalizeShift(v){ const s=text(v).toLowerCase(); if(["s1","shift 1","shift1"].includes(s))return "S1"; if(["s2","shift 2","shift2"].includes(s))return "S2"; if(["middle","mid"].includes(s))return "Middle"; if(["libur","off"].includes(s))return "Libur"; return ""; }
function normalizeChecklistShift(v){ const s=normalizeShift(v); if(s&&s!=="Libur")return s; return text(v).toLowerCase()==="all"||text(v).toLowerCase()==="general"?"All":"S1"; }
function normalizeAssignment(v){ const s=text(v).toLowerCase(); if(s.includes("specific"))return "Specific Crew"; if(s==="any"||s.includes("siapa"))return "Any"; return "Role"; }
function asDate(v){
  if (!v && v!==0) return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d?.y && d?.m && d?.d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const s=text(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const dt=new Date(s); if(!Number.isNaN(dt.getTime())) return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  return "";
}
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
