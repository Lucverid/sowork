import * as XLSX from "xlsx-js-style";
import { saveSchedule, upsertSchedules, replaceScheduleRange } from "../schedule/schedule.js";
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


export async function previewFeatureWorkbook(feature, file, context = {}) {
  if (!file) throw new Error("File Excel belum dipilih.");
  const wb = await readWorkbook(file);
  const sheetNames = (wb.SheetNames || []).slice();
  const base = {
    feature,
    fileName: file.name || "Workbook Excel",
    fileSize: Number(file.size || 0),
    sheetNames,
    count: 0,
    skipped: 0,
    title: "Preview Import",
    detail: "",
    stats: [],
    rows: [],
    warnings: []
  };

  if (feature === "schedule") {
    const parsed = parseScheduleImportWorkbook(wb);
    // Preview harus mengikuti urutan tanggal aktual di file, bukan urutan crew/parser.
    // Ini penting untuk periode 26 bulan sebelumnya -> 25 bulan terpilih.
    const entries = (parsed.entries || []).slice().sort((a,b) =>
      String(a?.date || '').localeCompare(String(b?.date || '')) ||
      String(a?.crewName || '').localeCompare(String(b?.crewName || ''), 'id')
    );
    const dates = entries.map(x => x.date).filter(Boolean).sort();
    const crews = [...new Set(entries.map(x => x.crewName).filter(Boolean))];
    const shifts = { S1:0, S2:0, Middle:0, Libur:0, Lembur:0 };
    entries.forEach(x => {
      if (Object.prototype.hasOwnProperty.call(shifts, x.shift)) shifts[x.shift] += 1;
      if (x.overtime) shifts.Lembur += 1;
    });

    // Bandingkan preview dengan jadwal yang saat ini tampil/tersimpan di SoWork.
    // Ini membuat user tahu sebelum Apply apakah file benar-benar membawa perubahan.
    const minDate = dates[0] || '';
    const maxDate = dates[dates.length - 1] || '';
    const currentRows = (context.schedules || []).filter(row => {
      const d = String(row?.date || '');
      return minDate && maxDate && d >= minDate && d <= maxDate;
    });
    const currentMap = new Map(currentRows.map(row => [scheduleImportKey(row), row]));
    const importMap = new Map(entries.map(row => [scheduleImportKey(row), row]));
    let changed = 0;
    let added = 0;
    for (const [key, row] of importMap) {
      const old = currentMap.get(key);
      if (!old) added++;
      else if (!sameVisibleScheduleValue(old, row)) changed++;
    }
    const removed = [...currentMap.keys()].filter(key => !importMap.has(key)).length;
    const noDataChange = currentRows.length > 0 && changed === 0 && added === 0 && removed === 0;
    const compareWarnings = noDataChange
      ? ['File import sama dengan jadwal SoWork pada periode ini. Apply tidak akan mengubah Monthly View.']
      : (currentRows.length ? [`Perubahan terdeteksi: ${changed} diubah, ${added} ditambah, ${removed} dihapus.`] : []);
    const diffRows = [];
    for (const [key, row] of importMap) {
      const old = currentMap.get(key);
      if (!old || !sameVisibleScheduleValue(old, row)) {
        diffRows.push({
          Tanggal: row.date,
          Crew: row.crewName,
          Sebelum: old ? `${old.shift}${old.role ? ` · ${old.role}` : ''}` : 'Belum ada',
          Setelah: `${row.shift}${row.role ? ` · ${row.role}` : ''}`
        });
      }
    }
    for (const [key, old] of currentMap) {
      if (!importMap.has(key)) diffRows.push({ Tanggal: old.date, Crew: old.crewName, Sebelum: `${old.shift}${old.role ? ` · ${old.role}` : ''}`, Setelah: 'Dihapus' });
    }
    return {
      ...base,
      title: "Preview Jadwal",
      detail: `Sumber: ${parsed.sourceLabel}`,
      count: entries.length,
      skipped: parsed.skipped || 0,
      minDate: dates[0] || "",
      maxDate: dates[dates.length - 1] || "",
      stats: [
        { label:"Entry", value:String(entries.length) },
        { label:"Crew", value:String(crews.length) },
        { label:"Rentang data Excel", value: dates.length ? `${dates[0]} → ${dates[dates.length-1]}` : "-" },
        { label:"Berubah", value:String(changed) },
        { label:"Ditambah", value:String(added) },
        { label:"Dihapus", value:String(removed) },
        { label:"Dilewati", value:String(parsed.skipped || 0) }
      ],
      shiftStats: shifts,
      rows: entries.slice(0, 12).map(x => ({
        Tanggal:x.date, Crew:x.crewName, Shift:x.shift, Role:x.role || "-", Lembur:x.overtime ? "Ya" : "Tidak"
      })),
      warnings: [...compareWarnings, ...(parsed.warnings || []), ...(parsed.skipped ? [`${parsed.skipped} baris tidak valid akan dilewati.`] : [])],
      changeSummary: { changed, added, removed, noDataChange },
      diffRows: diffRows.slice(0, 20),
      // Payload internal: yang dilihat user saat Preview INI yang harus diterapkan.
      // Jangan parse workbook ulang setelah user menekan Apply.
      applyPayload: {
        entries: entries.map(row => ({ ...row })),
        minDate: dates[0] || '',
        maxDate: dates[dates.length - 1] || '',
        skipped: parsed.skipped || 0,
        sourceLabel: parsed.sourceLabel || 'Preview Import',
        warnings: [...(parsed.warnings || [])]
      }
    };
  }

  const previewRows = (sheetName, mapRow, required=true) => {
    const rows = getRows(wb, sheetName, required);
    const mapped = rows.map(mapRow).filter(Boolean);
    return { rows:mapped, rawCount:rows.length };
  };

  if (feature === "checklist") {
    const p = previewRows("Checklist Template", row => {
      const title=text(row["Task"] || row["Title"]); if(!title) return null;
      return { Task:title, Shift:normalizeChecklistShift(row["Shift"]), Assignment:normalizeAssignment(row["Assignment Type"]) };
    });
    return { ...base, title:"Preview Daily Checklist", count:p.rows.length, stats:[{label:"Task",value:String(p.rows.length)},{label:"Sheet",value:"Checklist Template"}], rows:p.rows.slice(0,12) };
  }

  if (feature === "stockMaster") {
    const p = previewRows("Stock Master", row => {
      const name=text(row["Nama"] || row["Nama Item"]); if(!name) return null;
      return { Nama:name, Satuan:text(row["Satuan"]||"PCS"), Stok:num(row["Current Stock"],0), Kategori:text(row["Kategori"]||"Bahan") };
    });
    return { ...base, title:"Preview Stock Master", count:p.rows.length, stats:[{label:"Item",value:String(p.rows.length)},{label:"Sheet",value:"Stock Master"}], rows:p.rows.slice(0,12) };
  }

  if (feature === "stockIncoming") {
    const items=context.stockItems||[]; let skipped=0;
    const p = previewRows("Stock Masuk", row => {
      const item=findByIdOrName(items,row["Item ID"],row["Nama Item"]); const date=asDate(row["Tanggal"]);
      const cartons=Math.max(0,num(row["Karton"],0)), loose=Math.max(0,num(row["Qty Lepas"],0));
      if(!item||!date||!(cartons>0||loose>0)){skipped++;return null;}
      return { Tanggal:date, Item:item.name, Karton:cartons, "Qty Lepas":loose };
    });
    return { ...base, title:"Preview Barang Masuk", count:p.rows.length, skipped, stats:[{label:"Transaksi",value:String(p.rows.length)},{label:"Dilewati",value:String(skipped)}], rows:p.rows.slice(0,12), warnings:skipped?[`${skipped} baris tidak cocok dengan Stock Master / tanggal tidak valid.`]:[] };
  }

  if (feature === "stockUsage") {
    const items=context.stockItems||[]; let skipped=0;
    const p = previewRows("Penggunaan Stok", row => {
      const item=findByIdOrName(items,row["Item ID"],row["Nama Item"]); const date=asDate(row["Tanggal"]);
      if(!item||!date){skipped++;return null;}
      return { Tanggal:date, Item:item.name, Qty:Math.max(0,num(row["Qty Digunakan"]??row["Qty"],0)), Satuan:item.unit||"PCS" };
    });
    return { ...base, title:"Preview Penggunaan Stok", count:p.rows.length, skipped, stats:[{label:"Baris",value:String(p.rows.length)},{label:"Dilewati",value:String(skipped)}], rows:p.rows.slice(0,12), warnings:skipped?[`${skipped} baris tidak cocok dengan Stock Master / tanggal tidak valid.`]:[] };
  }

  if (feature === "opname") {
    const items=context.stockItems||[]; let skipped=0;
    const p=previewRows("Stock Opname", row=>{
      const item=findByIdOrName(items,row["Item ID"],row["Nama Item"]); const date=asDate(row["Tanggal"]);
      if(!item||!date){skipped++;return null;}
      return {Tanggal:date,Item:item.name,"Lokasi 1":num(row["Qty Lokasi 1"],0),"Lokasi 2":num(row["Qty Lokasi 2"],0)};
    });
    return { ...base,title:"Preview Stock Opname",count:p.rows.length,skipped,stats:[{label:"Baris",value:String(p.rows.length)},{label:"Dilewati",value:String(skipped)}],rows:p.rows.slice(0,12),warnings:skipped?[`${skipped} baris tidak cocok dengan Stock Master / tanggal tidak valid.`]:[] };
  }

  if (feature === "reports") {
    const p=previewRows("Laporan", row=>{const date=asDate(row["Tanggal"]);if(!date)return null;return {Tanggal:date,Shift:text(row["Shift"]),Role:text(row["Role"]),Ringkasan:text(row["Ringkasan"]).slice(0,70)};});
    return { ...base,title:"Preview Laporan",count:p.rows.length,stats:[{label:"Laporan",value:String(p.rows.length)},{label:"Sheet",value:"Laporan"}],rows:p.rows.slice(0,12) };
  }

  if (feature === "waste") {
    const master=wb.Sheets["Waste Master"]?sheetJson(wb.Sheets["Waste Master"]):[];
    const dailySheet=wb.Sheets["Waste Harian"]||wb.Sheets["Waste Data"];
    const daily=dailySheet?sheetJson(dailySheet):[];
    if(!master.length&&!daily.length) throw new Error('Sheet "Waste Master" atau "Waste Harian" tidak ditemukan.');
    const rows=[];
    master.slice(0,6).forEach(r=>rows.push({Jenis:"Master",Tanggal:"-",Item:text(r["Nama Item"]||r["Nama"]),Qty:"-"}));
    daily.slice(0,6).forEach(r=>rows.push({Jenis:"Harian",Tanggal:asDate(r["Tanggal"])||"-",Item:text(r["Nama Item"]),Qty:num(r["Qty"],0)}));
    return { ...base,title:"Preview Waste",count:master.length+daily.length,stats:[{label:"Master",value:String(master.length)},{label:"Harian",value:String(daily.length)}],rows:rows.slice(0,12) };
  }

  if (feature === "all") {
    const known=["Checklist Template","Stock Master","Stock Masuk","Penggunaan Stok","Stock Opname","Waste Master","Waste Harian","Waste Data","Laporan"];
    const sections=[];
    let total=0;
    try {
      const parsed=parseScheduleImportWorkbook(wb);
      if(parsed.entries?.length){ sections.push({name:"Jadwal",count:parsed.entries.length}); total+=parsed.entries.length; }
    } catch(_) {}
    for(const name of known){
      const sh=wb.Sheets[name]; if(!sh) continue;
      const count=sheetJson(sh).length;
      if(count){sections.push({name,count}); total+=count;}
    }
    if(!sections.length) throw new Error("Tidak ada sheet import SoWork yang dikenali.");
    return { ...base,title:"Preview Semua Data",count:total,stats:sections.map(x=>({label:x.name,value:String(x.count)})),rows:sections.map(x=>({Data:x.name,"Jumlah Baris":x.count})).slice(0,12),detail:`${sections.length} jenis data dikenali` };
  }

  throw new Error(`Preview import ${feature} belum didukung.`);
}

export async function importFeatureWorkbook(feature, file, context = {}) {
  if (!file) throw new Error("File Excel belum dipilih.");
  const wb = await readWorkbook(file);
  switch (feature) {
    case "schedule": return context?.schedulePreviewPayload?.entries?.length
      ? importScheduleEntries(context.schedulePreviewPayload)
      : importSchedule(wb);
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
  const workingContext = { ...context, stockItems: (context.stockItems || []).slice() };
  let scheduleMeta = null;

  for (const feature of ["schedule","checklist","stockMaster","stockIncoming","stockUsage","opname","waste","reports"]) {
    try {
      const result = await ({
        schedule: () => importSchedule(wb),
        checklist: () => importChecklist(wb),
        stockMaster: () => importStockMaster(wb, workingContext.stockItems || []),
        stockIncoming: () => importStockIncoming(wb, workingContext),
        stockUsage: () => importStockUsage(wb, workingContext),
        opname: () => importOpname(wb, workingContext),
        waste: () => importWaste(wb, workingContext),
        reports: () => importReports(wb, workingContext)
      }[feature])();
      if (feature === 'stockMaster' && Array.isArray(result.items)) workingContext.stockItems = result.items;
      if (feature === 'schedule' && result.importedSchedule) scheduleMeta = result;
      if (result.count) results.push(result);
    } catch (err) {
      if (!/sheet .*tidak ditemukan/i.test(String(err?.message || ''))) throw err;
    }
  }
  if (!results.length) throw new Error("Tidak ada sheet import SoWork yang dikenali.");
  return {
    count: results.reduce((sum,row)=>sum+Number(row.count || 0),0),
    detail: results.map(row=>row.detail).filter(Boolean).join(" · "),
    importedSchedule: Boolean(scheduleMeta),
    minDate: scheduleMeta?.minDate || '',
    maxDate: scheduleMeta?.maxDate || '',
    skipped: results.reduce((sum,row)=>sum+Number(row.skipped || 0),0)
  };
}

async function importSchedule(wb) {
  const parsed = parseScheduleImportWorkbook(wb);
  if (!parsed.entries.length) {
    throw new Error(parsed.message || 'Tidak ada baris jadwal valid. Gunakan Export lengkap SoWork atau XLSX jadwal yang masih mempertahankan data shift.');
  }
  return importScheduleEntries({
    entries: parsed.entries,
    skipped: parsed.skipped || 0,
    sourceLabel: parsed.sourceLabel || 'Workbook',
    warnings: parsed.warnings || []
  });
}

async function importScheduleEntries(payload = {}) {
  const sourceEntries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!sourceEntries.length) throw new Error('Payload Preview Jadwal kosong. Pilih ulang file lalu cek Preview sebelum Apply.');

  // PENTING: sourceEntries berasal langsung dari Preview yang disetujui user.
  // Jadi Apply tidak membaca ulang workbook dan tidak mungkin memilih hidden/raw source lain.
  const importedEntries = sourceEntries.map(row => ({ ...row, source: 'excel-import', generated: false }));
  const dates = importedEntries.map(x => x.date).filter(Boolean).sort();
  const minDate = payload.minDate || dates[0] || '';
  const maxDate = payload.maxDate || dates[dates.length - 1] || '';
  if (!minDate || !maxDate) throw new Error('Rentang tanggal import jadwal tidak valid.');

  const syncResult = await replaceScheduleRange(minDate, maxDate, importedEntries, { verifyServer: true });
  const serverEntries = Array.isArray(syncResult?.serverEntries) ? syncResult.serverEntries : [];
  return {
    count: importedEntries.length,
    detail: `Jadwal ${importedEntries.length} · ${payload.sourceLabel || 'Preview Import'}${syncResult?.verified ? ' · terverifikasi server' : ''}`,
    minDate,
    maxDate,
    importedSchedule: true,
    importedEntries,
    serverEntries,
    applyMode: 'replace-range-preview-payload',
    skipped: payload.skipped || 0,
    warnings: payload.warnings || [],
    verified: Boolean(syncResult?.verified)
  };
}

function parseScheduleImportWorkbook(wb) {
  // Dua format utama:
  // 1) Export lengkap SoWork: memiliki sheet canonical `Jadwal Data`.
  //    Sheet ini WAJIB menjadi sumber utama karena Shift/Role tersimpan sebagai teks,
  //    sehingga round-trip Export -> Import tidak bergantung pada warna/style XLSX.
  // 2) Google Sheet round-trip: matrix utama bisa diedit user dan hidden raw hanya
  //    metadata/fallback. Untuk format ini, matrix yang terlihat tetap authoritative.
  let rawResult = null;
  let rawError = null;
  const canonicalRawSheet = findSheet(wb, ['Jadwal Data', 'Schedule Data', 'JadwalData']);
  const rawSheet = canonicalRawSheet || findScheduleRawDataSheet(wb);
  if (rawSheet) {
    try {
      const rows = Number.isInteger(rawSheet.headerRow) ? sheetJsonFromHeaderRow(rawSheet.sheet, rawSheet.headerRow) : sheetJson(rawSheet.sheet);
      const entries = [];
      let skipped = 0;
      for (const row of rows) {
        const date = asDate(pick(row, ['Tanggal','Date']));
        const crewName = text(pick(row, ['Crew','Nama Crew','Nama']));
        const shift = normalizeShift(pick(row, ['Shift','Jam Kerja']));
        if (!date || !crewName || !shift) { skipped++; continue; }
        entries.push({
          date, crewName, gender: text(pick(row,['Gender','Jenis Kelamin'])), shift,
          role: shift === 'Libur' ? '' : text(pick(row,['Role','Posisi','Tugas'])),
          notes: text(pick(row,['Catatan','Notes'])),
          overtime: asBool(pick(row,['Lembur','Overtime'])),
          overtimeType: text(pick(row,['Jenis Lembur','Overtime Type'])) || 'Buka',
          overtimeNote: text(pick(row,['Catatan Lembur','Overtime Note']))
        });
      }
      if (!entries.length) throw new Error(`Sheet "${rawSheet.name}" ditemukan, tapi tidak ada baris valid. Pastikan kolom Tanggal, Crew, dan Shift tidak kosong.`);
      rawResult = { entries, skipped, sourceLabel: rawSheet.name, warnings: [] };
    } catch (err) {
      rawError = err;
    }
  }

  // File resmi hasil `Export lengkap` SoWork harus selalu round-trip dari raw sheet.
  // Jangan memaksa parser warna matrix untuk file ini.
  if (canonicalRawSheet) {
    if (rawResult) {
      return {
        ...rawResult,
        sourceLabel: `${canonicalRawSheet.name} (Export lengkap SoWork)`,
        warnings: rawResult.warnings || []
      };
    }
    throw new Error(`Sheet canonical "${canonicalRawSheet.name}" ditemukan tetapi tidak bisa dibaca. ${rawError?.message || 'Pastikan kolom Tanggal, Crew, Gender, Shift, dan Role masih utuh.'}`);
  }

  let matrixResult = null;
  let matrixError = null;
  const matrix = findScheduleMatrixSheet(wb);
  if (matrix) {
    try { matrixResult = parseScheduleMatrix(matrix.sheet, matrix.name); }
    catch (err) { matrixError = err; }
  }

  if (matrixResult) {
    // v1.7.19: tab jadwal utama yang terlihat SELALU menjadi sumber utama
    // bila berhasil dibaca. Hidden raw hanya melengkapi metadata yang tidak
    // tersedia di matrix (catatan, gender, detail lembur), tidak boleh
    // mengembalikan jadwal ke versi lama.
    if (rawResult) {
      const rawMap = new Map(rawResult.entries.map(row => [scheduleImportKey(row), row]));
      const matrixKeys = new Set(matrixResult.entries.map(row => scheduleImportKey(row)));
      let visibleChanges = 0;
      let visibleAdded = 0;
      const merged = matrixResult.entries.map(visible => {
        const key = scheduleImportKey(visible);
        const raw = rawMap.get(key);
        if (!raw) visibleAdded++;
        else if (!sameVisibleScheduleValue(raw, visible)) visibleChanges++;
        return {
          ...(raw || {}),
          ...visible,
          gender: visible.gender || raw?.gender || '',
          notes: raw?.notes || visible.notes || '',
          overtimeNote: visible.overtimeNote || raw?.overtimeNote || '',
          overtimeType: visible.overtime ? (visible.overtimeType || raw?.overtimeType || 'Buka') : '',
          role: visible.shift === 'Libur' ? '' : visible.role
        };
      });
      const removedFromVisible = [...rawMap.keys()].filter(key => !matrixKeys.has(key)).length;
      const warnings = [];
      if (visibleChanges || visibleAdded || removedFromVisible) {
        warnings.push(`Tab utama menjadi acuan: ${visibleChanges} jadwal berubah, ${visibleAdded} ditambah, ${removedFromVisible} tidak ada lagi dibanding data tersembunyi.`);
      } else {
        warnings.push('Tab utama dan data tersembunyi sama. Import akan menghasilkan jadwal yang sama jika Firestore juga belum berubah.');
      }
      return {
        entries: merged,
        skipped: matrixResult.skipped || 0,
        sourceLabel: `${matrix.name} (tab utama)` ,
        warnings,
        visibleChanges,
        visibleAdded,
        visibleRemoved: removedFromVisible
      };
    }
    return { ...matrixResult, warnings: matrixResult.warnings || [], sourceLabel: `${matrix.name} (tab utama)` };
  }

  // Jika tabel jadwal utama ADA tetapi gagal dibaca, JANGAN diam-diam memakai hidden/raw data.
  // Hidden sheet bisa masih berisi versi lama setelah user mengedit matrix Google Sheet.
  // Lebih aman menolak import daripada menulis ulang data lama sambil menampilkan status sukses.
  if (matrix && matrixError) {
    throw new Error(`Tab jadwal utama "${matrix.name}" ditemukan tetapi tidak bisa dibaca dengan aman. ${matrixError.message} Import dibatalkan agar data tersembunyi lama tidak menggantikan edit yang terlihat.`);
  }

  if (rawResult) return { ...rawResult, warnings: rawResult.warnings || [] };

  const names = (wb.SheetNames || []).join(', ');
  const reason = rawError?.message || '';
  throw new Error(`Sheet jadwal tidak dikenali. Dicari data mentah SoWork (Tanggal/Crew/Gender/Shift/Role) atau tabel jadwal SoWork. Sheet yang ada: ${names || 'tidak ada'}.${reason ? ` Detail: ${reason}` : ''}`);
}

function scheduleImportKey(row) {
  return `${String(row?.date || '').trim()}|${String(row?.crewName || '').trim().toLowerCase()}`;
}

function sameVisibleScheduleValue(a, b) {
  const overtimeA = Boolean(a?.overtime);
  const overtimeB = Boolean(b?.overtime);
  return String(a?.shift || '') === String(b?.shift || '')
    && String(a?.role || '').trim() === String(b?.role || '').trim()
    && overtimeA === overtimeB
    && (!overtimeA || String(a?.overtimeType || '').trim() === String(b?.overtimeType || '').trim());
}

function findScheduleRawDataSheet(wb) {
  const candidates = [];
  for (const name of wb.SheetNames || []) {
    const sheet = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:true });
    for (let r=0; r<Math.min(8, aoa.length); r++) {
      const headers = (aoa[r] || []).map(v => text(v).trim().toLowerCase());
      const hasDate = headers.includes('tanggal') || headers.includes('date');
      const hasCrew = headers.includes('crew') || headers.includes('nama crew') || headers.includes('nama');
      const hasGender = headers.includes('gender') || headers.includes('jenis kelamin');
      const hasShift = headers.includes('shift') || headers.includes('jam kerja');
      const hasRole = headers.includes('role') || headers.includes('posisi') || headers.includes('tugas');
      if (!(hasDate && hasCrew && hasGender && hasShift && hasRole)) continue;
      let score = 0;
      const lowerName = String(name || '').toLowerCase();
      if (lowerName.includes('sowork data')) score += 100;
      if (lowerName.includes('jadwal data')) score += 80;
      if (lowerName.includes('data')) score += 30;
      if (headers.includes('format')) score += 20;
      if (headers.includes('jenis lembur')) score += 10;
      candidates.push({ name, sheet, headerRow:r, score });
      break;
    }
  }
  candidates.sort((a,b) => b.score - a.score || a.headerRow - b.headerRow);
  return candidates[0] || null;
}

function sheetJsonFromHeaderRow(sheet, headerRow) {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:true });
  const headers = (aoa[headerRow] || []).map(v => text(v).trim());
  const rows = [];
  for (let r=headerRow+1; r<aoa.length; r++) {
    const values = aoa[r] || [];
    if (!values.some(v => text(v) !== '')) continue;
    const row = {};
    headers.forEach((h,c) => { if (h) row[h] = values[c]; });
    rows.push(row);
  }
  return rows;
}

function findScheduleMatrixSheet(wb) {
  for (const name of wb.SheetNames || []) {
    const sheet = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:true });
    const first = (aoa[0] || []).map(v => text(v).toLowerCase());
    if (first.includes('nama crew') && first.includes('gender') && first.includes('periode')) return { name, sheet };
  }
  return null;
}

function parseScheduleMatrix(sheet, sheetName) {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:true });
  if (aoa.length < 3) throw new Error(`Sheet "${sheetName}" tidak berisi tabel jadwal yang lengkap.`);
  const header = aoa[0] || [];
  const periodText = [sheetName, ...aoa.slice(2, 8).map(r => text(r?.[3]))].join(' ');
  const period = parseIndonesianMonthYear(periodText);
  // Ambil semua kolom tanggal yang terlihat mulai kolom E. Google Sheets kadang
  // mengekspor sebagian header dd mmm sebagai value/style yang tidak bisa diparse
  // normal walau di layar terlihat benar. Jangan buang kolom itu diam-diam.
  const visibleDateColumns = [];
  for (let c=4;c<header.length;c++) {
    const rawHeader = header[c];
    const headerCell = sheet[XLSX.utils.encode_cell({ r:0, c })];
    const formattedHeader = headerCell?.w ?? '';
    const cellValue = headerCell?.v ?? rawHeader;
    if (text(rawHeader) === '' && text(formattedHeader) === '' && cellValue !== 0) continue;
    const parsedDate = matrixDateKey(rawHeader, period)
      || matrixDateKey(formattedHeader, period)
      || matrixDateKey(cellValue, period)
      || '';
    visibleDateColumns.push({ c, rawHeader, formattedHeader, date: parsedDate });
  }

  // v1.7.27: isi header yang gagal dari anchor tanggal tetangga. Ini penting
  // untuk periode 26 bulan sebelumnya -> 25 bulan terpilih. Contoh: bila 01 Sep
  // terbaca tetapi 26-31 Agu tidak, keenam kolom sebelumnya dihitung mundur.
  const knownAnchors = visibleDateColumns
    .map((col, index) => col.date ? { index, date: col.date } : null)
    .filter(Boolean);
  if (knownAnchors.length) {
    const toUtcDate = key => {
      const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    };
    const fromUtcDate = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    for (let i=0; i<visibleDateColumns.length; i++) {
      if (visibleDateColumns[i].date) continue;
      let anchor = knownAnchors[0];
      for (const candidate of knownAnchors) {
        if (Math.abs(candidate.index - i) < Math.abs(anchor.index - i)) anchor = candidate;
      }
      const base = toUtcDate(anchor.date);
      if (!base) continue;
      base.setUTCDate(base.getUTCDate() + (i - anchor.index));
      visibleDateColumns[i].date = fromUtcDate(base);
    }
  }

  const dateCols = visibleDateColumns.filter(col => col.date).map(({c,date}) => ({c,date}));
  if (!dateCols.length) {
    const samples = header.slice(4, 10).map(v => {
      if (typeof v === 'number') return `serial:${v}`;
      return text(v) || '(kosong)';
    }).join(', ');
    throw new Error(`Tanggal pada sheet "${sheetName}" tidak bisa dibaca. Header yang terbaca: ${samples || 'tidak ada'}. Gunakan file XLSX, bukan CSV.`);
  }

  // Pastikan hasil inferensi tidak menghasilkan tanggal duplikat / loncat. Bila
  // ada, berhenti daripada mengimport periode yang salah.
  const uniqueDates = new Set(dateCols.map(x => x.date));
  if (uniqueDates.size !== dateCols.length) {
    throw new Error(`Tanggal pada sheet "${sheetName}" ambigu setelah dibaca. Ditemukan ${dateCols.length} kolom tetapi hanya ${uniqueDates.size} tanggal unik.`);
  }
  for (let i=1; i<dateCols.length; i++) {
    const prev = new Date(`${dateCols[i-1].date}T00:00:00Z`);
    const cur = new Date(`${dateCols[i].date}T00:00:00Z`);
    const gap = Math.round((cur - prev) / 86400000);
    if (gap !== 1) {
      throw new Error(`Urutan tanggal sheet "${sheetName}" tidak kontigu di ${dateCols[i-1].date} → ${dateCols[i].date}. Import dibatalkan agar periode tidak salah.`);
    }
  }

  const entries=[];
  let skipped=0;
  for (let r=2;r<aoa.length;r++) {
    const row=aoa[r] || [];
    const crewName=text(row[1]);
    const gender=text(row[2]);
    if (!crewName) continue; // baris kedua merge / rekap / kosong
    if (crewName.toLowerCase()==='nama' || crewName.toLowerCase().includes('shift 1')) break;

    for (const {c,date} of dateCols) {
      const raw=text(row[c]);
      if (!raw) continue;
      if (raw.toUpperCase()==='LIBUR') {
        entries.push({date,crewName,gender,shift:'Libur',role:'',notes:'',overtime:false,overtimeType:'',overtimeNote:''});
        continue;
      }
      const address = XLSX.utils.encode_cell({r,c});
      const cell=sheet[address];
      const overtime=/LEMBUR\s*:/i.test(raw);
      const overtimeType=(raw.match(/LEMBUR\s*:\s*([^\n\r]+)/i)?.[1] || '').trim();
      const role=raw.split(/\r?\n/)[0].trim();
      let shift=shiftFromCellStyle(cell);
      if (shift==='Lembur') shift=inferOvertimeShift(overtimeType);
      if (!['S1','S2','Middle'].includes(shift)) {
        const color = readableCellFill(cell);
        const styleKeys = cell?.s && typeof cell.s === 'object' ? Object.keys(cell.s).slice(0,8).join(',') : '';
        throw new Error(`Shift pada ${address} (${date} · ${crewName} · ${role || raw}) tidak bisa dikenali dari warna cell${color ? ` [${color}]` : ''}${!color && styleKeys ? ` [style:${styleKeys}]` : ''}. Pastikan warna shift tetap: hijau=S1, biru=S2, oranye=Middle, merah=Libur, lalu download sebagai Microsoft Excel (.xlsx).`);
      }
      entries.push({date,crewName,gender,shift,role: role==='-'?'':role,notes:'',overtime,overtimeType:overtime ? (overtimeType || 'Buka') : '',overtimeNote:''});
    }
  }
  if (!entries.length) throw new Error(`Tabel "${sheetName}" terbaca, tetapi tidak ada entry jadwal valid.`);
  return { entries, skipped:0, sourceLabel:`${sheetName} (matrix)` };
}

function normalizeRgb(value) {
  // xlsx-js-style dapat mengembalikan rgb sebagai string maupun number.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString(16).toUpperCase().padStart(6, '0').slice(-6);
  }
  let hex = String(value || '').trim().replace(/^#/, '').replace(/^0x/i, '').toUpperCase();
  if (hex.length === 8) hex = hex.slice(-6); // ARGB -> RGB
  return /^[0-9A-F]{6}$/.test(hex) ? hex : '';
}
function rgbTuple(hex) {
  const h = normalizeRgb(hex);
  return h ? [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)] : null;
}
function colorDistance(a,b) {
  const x=rgbTuple(a), y=rgbTuple(b);
  if(!x||!y) return Infinity;
  return Math.sqrt((x[0]-y[0])**2 + (x[1]-y[1])**2 + (x[2]-y[2])**2);
}
function readableCellFill(cell) {
  // Ada dua bentuk style yang umum saat XLSX dibaca:
  // 1) writer-style: cell.s.fill.fgColor
  // 2) parsed-style (termasuk file Google Sheets): cell.s.fgColor langsung
  // Versi lama hanya membaca bentuk pertama sehingga warna terlihat di Excel,
  // tetapi dianggap kosong oleh importer.
  const style = cell?.s || {};
  const fill = style?.fill || {};
  const colors = [
    fill?.fgColor, fill?.bgColor,
    style?.fgColor, style?.bgColor,
    style?.fill?.fgColor, style?.fill?.bgColor
  ];
  for (const color of colors) {
    const rgb = normalizeRgb(color?.rgb ?? color?.argb ?? color);
    if (rgb) return rgb;
  }
  return '';
}
function shiftFromCellStyle(cell) {
  const rgb = readableCellFill(cell);
  if (!rgb) return '';
  const palette = [
    ['S1','00E72D'],
    ['S2','4285E8'],
    ['Middle','FF9800'],
    ['Libur','FF1616'],
    ['Lembur','FFE500']
  ];
  let best = ['', Infinity];
  for (const [shift, target] of palette) {
    const d = colorDistance(rgb, target);
    if (d < best[1]) best = [shift, d];
  }
  // Google Sheets kadang mengubah sedikit RGB saat export XLSX. Toleransi ini
  // tetap cukup ketat supaya warna putih/abu tidak dianggap shift.
  return best[1] <= 72 ? best[0] : '';
}
function inferOvertimeShift(type) {
  const s=text(type).toLowerCase();
  if (s.includes('11') || s.includes('tutup')) return 'S2';
  if (s.includes('buka') || s.includes('08')) return 'S1';
  return '';
}
function parseIndonesianMonthYear(value) {
  const months={januari:1,februari:2,maret:3,april:4,mei:5,juni:6,juli:7,agustus:8,september:9,oktober:10,november:11,desember:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,agu:8,ags:8,sep:9,okt:10,nov:11,des:12};
  const s=text(value).toLowerCase();
  for (const [name,month] of Object.entries(months)) {
    const m=s.match(new RegExp(`\\b${name}\\s+(20\\d{2})\\b`,'i'));
    if (m) return {month,year:Number(m[1])};
  }
  const iso=s.match(/(20\d{2})[-\/]?(0?[1-9]|1[0-2])/);
  return iso ? {year:Number(iso[1]),month:Number(iso[2])} : null;
}
function matrixDateKey(value, period) {
  // Google Sheets / Excel bisa menyimpan header yang terlihat seperti "26 Agu"
  // sebagai serial date number. Jangan bergantung pada teks tampilan saja.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d?.y && d?.m && d?.d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }

  const raw=text(value);
  if (!raw) return '';

  // ISO / dd-mm-yyyy / dd/mm/yyyy juga diterima.
  const direct=asDate(raw);
  if (direct) return direct;

  const s=raw.toLowerCase().replace(/\./g,'').replace(/\s+/g,' ').trim();
  const m=s.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(20\d{2}))?$/i);
  if (!m) return '';
  const map={
    jan:1,januari:1,
    feb:2,februari:2,
    mar:3,maret:3,
    apr:4,april:4,
    mei:5,
    jun:6,juni:6,
    jul:7,juli:7,
    agu:8,ags:8,agustus:8,
    sep:9,september:9,
    okt:10,oktober:10,
    nov:11,november:11,
    des:12,desember:12
  };
  const token=m[2].toLowerCase();
  const month=map[token] || map[token.slice(0,3)];
  if (!month) return '';

  let year = m[3] ? Number(m[3]) : Number(period?.year || 0);
  if (!year) return '';
  if (!m[3] && period) {
    // Periode 26 bulan sebelumnya -> 25 bulan terpilih harus aman lintas tahun.
    if (month > period.month + 6) year -= 1;
    else if (month + 6 < period.month) year += 1;
  }
  return `${year}-${String(month).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`;
}
function findSheet(wb, aliases=[]) {
  const target=aliases.map(normalizeSheetName);
  for (const name of wb.SheetNames || []) {
    if (target.includes(normalizeSheetName(name))) return {name,sheet:wb.Sheets[name]};
  }
  return null;
}
function normalizeSheetName(v){ return text(v).toLowerCase().replace(/[\s_-]+/g,''); }
function pick(row, aliases=[]) {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key) && row[key] !== '') return row[key];
  }
  const normalized=Object.fromEntries(Object.entries(row || {}).map(([k,v])=>[String(k).trim().toLowerCase(),v]));
  for (const key of aliases) {
    const v=normalized[String(key).trim().toLowerCase()];
    if (v !== undefined && v !== '') return v;
  }
  return '';
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
  return { count, detail: `Stock Master ${count}`, items: local };
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
  return XLSX.read(data, { type: "array", cellDates: false, cellStyles: true });
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
