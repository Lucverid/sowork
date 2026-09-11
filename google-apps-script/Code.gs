const SOWORK_COLORS = Object.freeze({
  S1: '#00E72D',
  S2: '#4285E8',
  Middle: '#FF9800',
  Libur: '#FF1616',
  Lembur: '#FFE500',
  header: '#FFFF00',
  male: '#C6E0B4',
  female: '#D5A6BD',
  border: '#D9D9D9',
  dark: '#000000',
  light: '#FFFFFF'
});

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || '').trim();
  const callback = String((e && e.parameter && e.parameter.callback) || '').trim();
  if (action === 'status') {
    return jsonpResponse_(callback, readStatus_(String(e.parameter.requestId || '')));
  }
  return callback
    ? jsonpResponse_(callback, { ok: true, service: 'SoWork Google Sheet Bridge', version: '1.6.8' })
    : jsonResponse_({ ok: true, service: 'SoWork Google Sheet Bridge', version: '1.6.8' });
}

function doPost(e) {
  let requestId = '';
  let callbackToken = '';
  try {
    const payload = parsePayload_(e);
    requestId = String(payload.requestId || '').trim();
    callbackToken = String(payload.callbackToken || '').trim();
    verifySecret_(payload.secret);
    let result;
    if (payload.action === 'writeSchedule') result = writeSchedule_(payload);
    else if (payload.action === 'testConnection') result = testConnection_(payload);
    else throw new Error('Action tidak didukung.');
    const response = { ok: true, requestId, action: payload.action, ...result };
    return bridgeResponse_(requestId, callbackToken, response);
  } catch (error) {
    console.error(error);
    const response = { ok: false, requestId, error: String(error && error.message ? error.message : error) };
    return bridgeResponse_(requestId, callbackToken, response);
  }
}

function writeSchedule_(payload) {
  const spreadsheetId = String(payload.spreadsheetId || '').trim();
  if (!spreadsheetId) throw new Error('Spreadsheet ID kosong.');
  const entries = Array.isArray(payload.entries) ? payload.entries.filter(x => x && x.date && x.crewName) : [];
  if (!entries.length) throw new Error('Data jadwal kosong.');

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheetName = sanitizeSheetName_(payload.sheetName || `Jadwal ${payload.periodLabel || ''}`);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  // Bersihkan format/merge lama supaya export selalu konsisten.
  const used = sheet.getDataRange();
  try { used.breakApart(); } catch (_) {}
  sheet.clear();
  sheet.clearConditionalFormatRules();

  const preferred = [
    ...((payload.rules && Array.isArray(payload.rules.maleNames)) ? payload.rules.maleNames : []),
    ...((payload.rules && Array.isArray(payload.rules.femaleNames)) ? payload.rules.femaleNames : [])
  ].map(String);

  const crew = unique_(entries.map(x => String(x.crewName || '')).filter(Boolean));
  crew.sort((a, b) => rank_(preferred, a) - rank_(preferred, b) || a.localeCompare(b));

  const dates = unique_(entries.map(x => String(x.date || '')).filter(Boolean)).sort();
  const byKey = {};
  entries.forEach(x => { byKey[`${x.date}__${x.crewName}`] = x; });

  // Role dirangkum dinamis. Role standar tetap ditempatkan lebih dulu.
  const roleNames = unique_(entries
    .filter(x => normalizeShift_(x.shift) !== 'Libur')
    .map(x => normalizeRole_(x.role))
    .filter(Boolean));
  roleNames.sort((a, b) => roleRank_(a) - roleRank_(b) || a.localeCompare(b, 'id'));

  const dateStartCol = 5;
  const scheduleCols = 4 + dates.length;

  const row1 = ['No', 'Nama Crew', 'Gender', 'Periode', ...dates.map(shortDateId_)];
  const row2 = ['', '', '', '', ...dates.map(dayNameId_)];
  const scheduleValues = [row1, row2];
  const crewStats = {};

  // ===== TABEL JADWAL UTAMA =====
  // Setiap crew memakai 2 baris dan semua sel digabung vertikal.
  crew.forEach((name, index) => {
    const gender = genderFor_(name, payload.rules);
    const stats = makeCrewStats_(roleNames);
    const firstRow = [index + 1, name, gender, String(payload.periodLabel || 'Jadwal')];

    dates.forEach(date => {
      const item = byKey[`${date}__${name}`];
      if (!item) {
        firstRow.push('');
        return;
      }

      const shift = normalizeShift_(item.shift);

      if (shift === 'Libur') {
        stats.Libur += 1;
        firstRow.push('LIBUR');
        return;
      }

      stats.totalKerja += 1;

      // Shift lembur dipisah seperti format rekap kerja lama.
      if (shift === 'S1') {
        if (item.overtime) stats.S1Lembur += 1;
        else stats.S1 += 1;
      } else if (shift === 'S2') {
        if (item.overtime) stats.S2Lembur += 1;
        else stats.S2 += 1;
      } else if (shift === 'Middle') {
        stats.Middle += 1;
      }

      const role = normalizeRole_(item.role);
      if (role && Object.prototype.hasOwnProperty.call(stats.roles, role)) {
        stats.roles[role] += 1;
      }

      const overtime = item.overtime ? `\nLEMBUR: ${item.overtimeType || 'Buka'}` : '';
      firstRow.push(`${item.role || '-'}${overtime}`);
    });

    crewStats[name] = stats;
    scheduleValues.push(firstRow);
    scheduleValues.push(new Array(scheduleCols).fill(''));
  });

  // ===== TABEL REKAP DI BAWAH JADWAL =====
  // Diletakkan terpisah supaya tidak mengganggu freeze 4 kolom pada tabel utama.
  const summaryStartCol = 4; // Mulai dari kolom D, mengikuti format contoh user.
  const summaryHeaderRow = 3 + (crew.length * 2) + 2; // 1 baris kosong setelah jadwal.
  const summaryHeaders = [
    'Nama',
    'Shift 1',
    'Shift 1+Lembur',
    'Shift 2',
    'Shift 2+Lembur',
    'Middle',
    ...roleNames,
    'Hari Kerja',
    'Hari Libur'
  ];

  const summaryValues = [summaryHeaders];

  crew.forEach(name => {
    const stats = crewStats[name] || makeCrewStats_(roleNames);
    summaryValues.push([
      name,
      stats.S1,
      stats.S1Lembur,
      stats.S2,
      stats.S2Lembur,
      stats.Middle,
      ...roleNames.map(role => stats.roles[role] || 0),
      stats.totalKerja,
      stats.Libur
    ]);
  });

  const totals = makeCrewStats_(roleNames);
  crew.forEach(name => addCrewStats_(totals, crewStats[name], roleNames));

  summaryValues.push([
    'TOTAL SEMUA CREW',
    totals.S1,
    totals.S1Lembur,
    totals.S2,
    totals.S2Lembur,
    totals.Middle,
    ...roleNames.map(role => totals.roles[role] || 0),
    totals.totalKerja,
    totals.Libur
  ]);

  const summaryCols = summaryHeaders.length;
  const requiredCols = Math.max(scheduleCols, summaryStartCol - 1 + summaryCols);
  const requiredRows = summaryHeaderRow + summaryValues.length - 1;
  ensureSize_(sheet, requiredRows, requiredCols);

  // Tulis jadwal.
  const scheduleRange = sheet.getRange(1, 1, scheduleValues.length, scheduleCols);
  scheduleRange.setValues(scheduleValues);
  scheduleRange
    .setFontFamily('Arial')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center')
    .setWrap(true);
  scheduleRange.setBorder(
    true, true, true, true, true, true,
    SOWORK_COLORS.border,
    SpreadsheetApp.BorderStyle.SOLID
  );

  // Header utama merge A1:A2 s.d. D1:D2.
  for (let col = 1; col <= 4; col++) {
    sheet.getRange(1, col, 2, 1).merge();
  }

  // Seluruh sel crew pada tabel jadwal memakai merge 2-row.
  crew.forEach((_, crewIndex) => {
    const startRow = 3 + (crewIndex * 2);
    for (let col = 1; col <= scheduleCols; col++) {
      sheet.getRange(startRow, col, 2, 1).merge();
    }
  });

  sheet.getRange(1, 1, 2, scheduleCols)
    .setBackground(SOWORK_COLORS.header)
    .setFontColor(SOWORK_COLORS.dark)
    .setFontWeight('bold');

  // Identity + warna shift.
  crew.forEach((name, crewIndex) => {
    const row = 3 + (crewIndex * 2);
    const gender = genderFor_(name, payload.rules);
    const identity = gender === 'Pria' ? SOWORK_COLORS.male : SOWORK_COLORS.female;

    for (let col = 1; col <= 3; col++) {
      sheet.getRange(row, col, 2, 1)
        .setBackground(identity)
        .setFontColor(SOWORK_COLORS.dark);
    }

    sheet.getRange(row, 2).setFontWeight('bold');
    sheet.getRange(row, 4, 2, 1)
      .setBackground(SOWORK_COLORS.light)
      .setFontColor(SOWORK_COLORS.dark);

    dates.forEach((date, dateIndex) => {
      const item = byKey[`${date}__${name}`];
      if (!item) return;

      const cell = sheet.getRange(row, dateIndex + dateStartCol, 2, 1);
      const shift = normalizeShift_(item.shift);
      const fill = item.overtime
        ? SOWORK_COLORS.Lembur
        : (SOWORK_COLORS[shift] || SOWORK_COLORS.light);
      const font = (shift === 'S2' || shift === 'Libur') && !item.overtime
        ? SOWORK_COLORS.light
        : SOWORK_COLORS.dark;

      cell.setBackground(fill).setFontColor(font);
    });
  });

  // ===== FORMAT REKAP =====
  const summaryRange = sheet.getRange(summaryHeaderRow, summaryStartCol, summaryValues.length, summaryCols);
  summaryRange.setValues(summaryValues);
  summaryRange
    .setFontFamily('Arial')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center')
    .setWrap(true);
  summaryRange.setBorder(
    true, true, true, true, true, true,
    SOWORK_COLORS.dark,
    SpreadsheetApp.BorderStyle.SOLID
  );

  // Header rekap lavender seperti template contoh.
  sheet.getRange(summaryHeaderRow, summaryStartCol, 1, summaryCols)
    .setBackground('#D9D2E9')
    .setFontWeight('bold')
    .setFontColor(SOWORK_COLORS.dark);

  // Body rekap: warna per jenis shift.
  if (crew.length) {
    const bodyStart = summaryHeaderRow + 1;
    const bodyRows = crew.length;

    // Nama.
    sheet.getRange(bodyStart, summaryStartCol, bodyRows, 1)
      .setBackground(SOWORK_COLORS.light)
      .setFontWeight('bold');

    // Shift 1, Shift 1+Lembur, Shift 2, Shift 2+Lembur, Middle.
    sheet.getRange(bodyStart, summaryStartCol + 1, bodyRows, 1)
      .setBackground(SOWORK_COLORS.S1);
    sheet.getRange(bodyStart, summaryStartCol + 2, bodyRows, 1)
      .setBackground(SOWORK_COLORS.Lembur);
    sheet.getRange(bodyStart, summaryStartCol + 3, bodyRows, 1)
      .setBackground(SOWORK_COLORS.S2)
      .setFontColor(SOWORK_COLORS.light);
    sheet.getRange(bodyStart, summaryStartCol + 4, bodyRows, 1)
      .setBackground('#00E5FF');
    sheet.getRange(bodyStart, summaryStartCol + 5, bodyRows, 1)
      .setBackground(SOWORK_COLORS.Middle);

    // Role.
    if (roleNames.length) {
      sheet.getRange(bodyStart, summaryStartCol + 6, bodyRows, roleNames.length)
        .setBackground('#F3F4F6')
        .setFontColor(SOWORK_COLORS.dark);
    }

    const hariKerjaCol = summaryStartCol + 6 + roleNames.length;
    const hariLiburCol = hariKerjaCol + 1;

    sheet.getRange(bodyStart, hariKerjaCol, bodyRows, 1)
      .setBackground('#E2F0D9')
      .setFontWeight('bold');
    sheet.getRange(bodyStart, hariLiburCol, bodyRows, 1)
      .setBackground(SOWORK_COLORS.Libur)
      .setFontColor(SOWORK_COLORS.light)
      .setFontWeight('bold');
  }

  // Baris total keseluruhan.
  const totalSummaryRow = summaryHeaderRow + summaryValues.length - 1;
  sheet.getRange(totalSummaryRow, summaryStartCol, 1, summaryCols)
    .setBackground('#FFF2CC')
    .setFontWeight('bold')
    .setFontColor(SOWORK_COLORS.dark);

  // ===== UKURAN / FREEZE =====
  sheet.setColumnWidth(1, 52);
  sheet.setColumnWidth(2, 145);
  sheet.setColumnWidth(3, 88);
  sheet.setColumnWidth(4, 130);
  if (dates.length) sheet.setColumnWidths(dateStartCol, dates.length, 112);

  // Lebar tabel rekap.
  sheet.setColumnWidth(summaryStartCol, 120);
  if (summaryCols > 1) {
    sheet.setColumnWidths(summaryStartCol + 1, summaryCols - 1, 92);
  }

  sheet.setRowHeight(1, 25);
  sheet.setRowHeight(2, 24);

  crew.forEach((_, crewIndex) => {
    const row = 3 + (crewIndex * 2);
    sheet.setRowHeight(row, 21);
    sheet.setRowHeight(row + 1, 21);
  });

  sheet.setRowHeight(summaryHeaderRow, 28);
  for (let i = 1; i < summaryValues.length; i++) {
    sheet.setRowHeight(summaryHeaderRow + i, 25);
  }

  // Aman karena tidak ada merge horizontal yang memotong batas frozen column.
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(4);

  const note = [
    `SoWork ${String(payload.metadata && payload.metadata.workspace || 'SoWork')}`,
    payload.metadata && payload.metadata.branch ? `Cabang: ${payload.metadata.branch}` : '',
    payload.metadata && payload.metadata.sentBy ? `Dikirim oleh: ${payload.metadata.sentBy}` : '',
    payload.metadata && payload.metadata.sentAt ? `Sync: ${payload.metadata.sentAt}` : '',
    `Rekap bawah: S1, S1+Lembur, S2, S2+Lembur, Middle, ${roleNames.length} role, Hari Kerja, Hari Libur`
  ].filter(Boolean).join(' | ');
  sheet.getRange(1, 1).setNote(note);

  SpreadsheetApp.flush();

  return {
    spreadsheetId,
    spreadsheetName: ss.getName(),
    sheetName,
    rowCount: requiredRows,
    columnCount: requiredCols,
    crewCount: crew.length,
    mergedCrewRows: true,
    summaryEnabled: true,
    summaryPosition: 'below',
    roleSummaryColumns: roleNames,
    url: `${ss.getUrl()}#gid=${sheet.getSheetId()}`
  };
}

function normalizeShift_(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 's1' || raw === 'shift 1' || raw === 'shift1') return 'S1';
  if (raw === 's2' || raw === 'shift 2' || raw === 'shift2') return 'S2';
  if (raw === 'middle' || raw === 'mid') return 'Middle';
  if (raw === 'libur' || raw === 'off') return 'Libur';
  return String(value || '').trim();
}

function normalizeRole_(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw === '-') return '';
  const lower = raw.toLowerCase();
  if (lower === 'kasir' || lower === 'cashier') return 'Kasir';
  if (lower === 'bar') return 'Bar';
  if (lower === 'kitchen' || lower === 'dapur') return 'Kitchen';
  if (/^kitchen\s*[-/]\s*bar$/i.test(raw) || /^bar\s*[-/]\s*kitchen$/i.test(raw)) return 'Kitchen - Bar';
  return raw;
}

function roleRank_(role) {
  const order = ['Kasir', 'Bar', 'Kitchen', 'Kitchen - Bar'];
  const idx = order.indexOf(role);
  return idx < 0 ? 999 : idx;
}

function makeCrewStats_(roleNames) {
  const roles = {};
  roleNames.forEach(role => { roles[role] = 0; });
  return {
    totalKerja: 0,
    S1: 0,
    S1Lembur: 0,
    S2: 0,
    S2Lembur: 0,
    Middle: 0,
    Libur: 0,
    roles
  };
}

function addCrewStats_(target, source, roleNames) {
  if (!source) return target;
  target.totalKerja += Number(source.totalKerja || 0);
  target.S1 += Number(source.S1 || 0);
  target.S1Lembur += Number(source.S1Lembur || 0);
  target.S2 += Number(source.S2 || 0);
  target.S2Lembur += Number(source.S2Lembur || 0);
  target.Middle += Number(source.Middle || 0);
  target.Libur += Number(source.Libur || 0);
  roleNames.forEach(role => {
    target.roles[role] = Number(target.roles[role] || 0) + Number(source.roles && source.roles[role] || 0);
  });
  return target;
}

function parsePayload_(e) {
  const formPayload = e && e.parameter && e.parameter.payload;
  const raw = formPayload || (e && e.postData && e.postData.contents) || '';
  if (!raw) throw new Error('Payload kosong.');
  try { return JSON.parse(raw); }
  catch (_) { throw new Error('Payload JSON tidak valid.'); }
}

function verifySecret_(incoming) {
  const configured = String(PropertiesService.getScriptProperties().getProperty('SOWORK_SECRET') || '').trim();
  if (!configured) throw new Error('SOWORK_SECRET belum diatur di Script Properties.');
  if (String(incoming || '').trim() !== configured) throw new Error('Secret Token tidak cocok.');
}

function sanitizeSheetName_(value) {
  const text = String(value || 'Jadwal').replace(/[\\/?*\[\]:]/g, '-').replace(/\s+/g, ' ').trim();
  return (text || 'Jadwal').slice(0, 90);
}

function ensureSize_(sheet, rows, cols) {
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
}

function unique_(items) { return [...new Set(items)]; }
function rank_(preferred, name) { const i = preferred.indexOf(name); return i < 0 ? 999999 : i; }
function genderFor_(name, rules) {
  if (rules && Array.isArray(rules.maleNames) && rules.maleNames.includes(name)) return 'Pria';
  if (rules && Array.isArray(rules.femaleNames) && rules.femaleNames.includes(name)) return 'Wanita';
  return '';
}
function parseYmd_(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
function shortDateId_(value) {
  const p = parseYmd_(value);
  if (!p) return String(value || '');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${String(p.d).padStart(2, '0')} ${months[p.m - 1]}`;
}
function dayNameId_(value) {
  const p = parseYmd_(value);
  if (!p) return '';
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  return days[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}
function bridgeResponse_(requestId, callbackToken, response) {
  const message = {
    source: 'sowork-google-sheet-bridge',
    requestId: String(requestId || ''),
    callbackToken: String(callbackToken || ''),
    response: response || { ok: false, error: 'Respons kosong.' }
  };

  const safeJson = JSON.stringify(message).replace(/</g, '\u003c');

  // v1.6.5: kirim konfirmasi ke halaman paling atas.
  // Apps Script kadang membungkus output dalam iframe/redirect Google.
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
try {
  window.top.postMessage(${safeJson}, '*');
} catch (e) {
  try { window.parent.postMessage(${safeJson}, '*'); } catch (_) {}
}
<\/script>
</body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function jsonResponse_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse_(callback, object) {
  const safe = String(callback || '').trim();
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(safe)) return jsonResponse_(object);
  return ContentService.createTextOutput(`${safe}(${JSON.stringify(object)});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function statusKey_(requestId) {
  return `SOWORK_STATUS_${String(requestId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120)}`;
}

function saveStatus_(requestId, object) {
  if (!requestId) return;
  CacheService.getScriptCache().put(statusKey_(requestId), JSON.stringify(object), 600);
}

function readStatus_(requestId) {
  if (!requestId) return { ok: false, error: 'requestId kosong.' };
  const raw = CacheService.getScriptCache().get(statusKey_(requestId));
  if (!raw) return { ok: true, pending: true };
  try { return JSON.parse(raw); } catch (_) { return { ok: false, error: 'Status request rusak.' }; }
}

function testConnection_(payload) {
  const spreadsheetId = String(payload.spreadsheetId || '').trim();
  if (!spreadsheetId) throw new Error('Spreadsheet ID kosong.');
  const ss = SpreadsheetApp.openById(spreadsheetId);
  return { spreadsheetId, spreadsheetName: ss.getName(), url: ss.getUrl() };
}
