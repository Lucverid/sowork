import * as XLSX from "xlsx-js-style";

const COLORS = {
  S1: "FF00E72D",
  S2: "FF4285E8",
  Middle: "FFFF9800",
  Libur: "FFFF1616",
  Lembur: "FFFFE500",
  header: "FFFFFF00",
  male: "FFC6E0B4",
  female: "FFD5A6BD"
};

export function exportScheduleWorkbook({ entries = [], rules, periodLabel = "Jadwal", filename = "SoWork-Jadwal.xlsx" }) {
  if (!entries.length) throw new Error("Tidak ada jadwal untuk diekspor.");

  const preferred = [...(rules?.maleNames || []), ...(rules?.femaleNames || [])];
  const crew = [...new Set(entries.map(e => e.crewName).filter(Boolean))]
    .sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b));
  const dates = [...new Set(entries.map(e => e.date).filter(Boolean))].sort();
  const byKey = new Map(entries.map(e => [`${e.date}__${e.crewName}`, e]));

  const row1 = ["No", "Nama Crew", "Gender", "Periode", ...dates.map(shortDate)];
  const row2 = ["", "", "", "", ...dates.map(dayName)];
  const aoa = [row1, row2];

  crew.forEach((name, index) => {
    const gender = (rules?.maleNames || []).includes(name) ? "Pria" : "Wanita";
    const row = [index + 1, name, gender, periodLabel];
    for (const date of dates) {
      const item = byKey.get(`${date}__${name}`);
      if (!item) {
        row.push("");
        continue;
      }
      if (item.shift === "Libur") {
        row.push("LIBUR");
      } else {
        const overtime = item.overtime ? `\nLEMBUR: ${item.overtimeType || "Buka"}` : "";
        row.push(`${item.role || "-"}${overtime}`);
      }
    }
    aoa.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 6 }, { wch: 18 }, { wch: 10 }, { wch: 18 },
    ...dates.map(() => ({ wch: 16 }))
  ];
  ws["!rows"] = [{ hpt: 25 }, { hpt: 24 }, ...crew.map(() => ({ hpt: 34 }))];
  ws["!freeze"] = { xSplit: 4, ySplit: 2 };

  for (let c = 0; c < row1.length; c++) {
    for (let r = 0; r < 2; r++) {
      styleCell(ws, r, c, COLORS.header, "FF000000", true);
    }
  }

  crew.forEach((name, crewIndex) => {
    const rowIndex = crewIndex + 2;
    const gender = (rules?.maleNames || []).includes(name) ? "Pria" : "Wanita";
    const identityFill = gender === "Pria" ? COLORS.male : COLORS.female;
    styleCell(ws, rowIndex, 0, identityFill, "FF000000", false);
    styleCell(ws, rowIndex, 1, identityFill, "FF000000", false);
    styleCell(ws, rowIndex, 2, identityFill, "FF000000", false);
    styleCell(ws, rowIndex, 3, "FFFFFFFF", "FF000000", false);

    dates.forEach((date, dateIndex) => {
      const item = byKey.get(`${date}__${name}`);
      const colIndex = dateIndex + 4;
      if (!item) return;
      const fill = item.overtime ? COLORS.Lembur : (COLORS[item.shift] || "FFFFFFFF");
      const darkText = item.shift === "S1" || item.shift === "Middle" || item.overtime;
      styleCell(ws, rowIndex, colIndex, fill, darkText ? "FF000000" : "FFFFFFFF", false);
    });
  });

  const overtime = entries.filter(e => e.overtime).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const overtimeRows = [["Tanggal", "Crew", "Shift", "Role", "Jenis Lembur", "Catatan"]];
  overtime.forEach(item => overtimeRows.push([
    item.date,
    item.crewName,
    item.shift,
    item.role || "",
    item.overtimeType || "Buka",
    item.overtimeNote || item.notes || ""
  ]));
  const wsOvertime = XLSX.utils.aoa_to_sheet(overtimeRows);
  wsOvertime["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 40 }];
  for (let c = 0; c < overtimeRows[0].length; c++) styleCell(wsOvertime, 0, c, COLORS.Lembur, "FF000000", true);

  const ruleRows = [
    ["SoWork - Rules Jadwal"],
    ["Pria", (rules?.maleNames || []).join(", ")],
    ["Wanita", (rules?.femaleNames || []).join(", ")],
    ["Libur Senin", (rules?.offDays?.Senin || []).join(", ")],
    ["Libur Selasa", (rules?.offDays?.Selasa || []).join(", ")],
    ["Libur Rabu", (rules?.offDays?.Rabu || []).join(", ")],
    ["Libur Kamis", (rules?.offDays?.Kamis || []).join(", ")],
    ["Libur Jumat", (rules?.offDays?.Jumat || []).join(", ")]
  ];
  const wsRules = XLSX.utils.aoa_to_sheet(ruleRows);
  wsRules["!cols"] = [{ wch: 20 }, { wch: 60 }];

  const rawRows = [["Tanggal", "Crew", "Gender", "Shift", "Role", "Catatan", "Lembur", "Jenis Lembur", "Catatan Lembur"]];
  entries.slice().sort((a,b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.crewName || "").localeCompare(String(b.crewName || ""), "id")).forEach(item => rawRows.push([
    item.date || "", item.crewName || "", item.gender || "", item.shift || "", item.role || "", item.notes || "", item.overtime ? "TRUE" : "FALSE", item.overtimeType || "", item.overtimeNote || ""
  ]));
  const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
  wsRaw["!cols"] = [{wch:14},{wch:20},{wch:10},{wch:12},{wch:20},{wch:32},{wch:10},{wch:18},{wch:32}];
  wsRaw["!freeze"] = { ySplit: 1 };
  for (let c = 0; c < rawRows[0].length; c++) styleCell(wsRaw, 0, c, "FF172033", "FFFFFFFF", true);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Jadwal");
  XLSX.utils.book_append_sheet(wb, wsRaw, "Jadwal Data");
  XLSX.utils.book_append_sheet(wb, wsOvertime, "History Lembur");
  XLSX.utils.book_append_sheet(wb, wsRules, "Rules");
  XLSX.writeFile(wb, filename);
}

function styleCell(ws, row, col, fill, fontColor, bold) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  ws[addr].s = {
    fill: { patternType: "solid", fgColor: { rgb: fill } },
    font: { color: { rgb: fontColor }, bold: Boolean(bold), name: "Arial", sz: bold ? 11 : 10 },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "FFD9D9D9" } },
      bottom: { style: "thin", color: { rgb: "FFD9D9D9" } },
      left: { style: "thin", color: { rgb: "FFD9D9D9" } },
      right: { style: "thin", color: { rgb: "FFD9D9D9" } }
    }
  };
}

function parseDate(value) {
  const [y, m, d] = String(value || "").split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortDate(value) {
  const d = parseDate(value);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(d);
}

function dayName(value) {
  const d = parseDate(value);
  return new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(d);
}
