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
    ? jsonpResponse_(callback, { ok: true, service: 'SoWork Google Sheet Bridge', version: '1.6.2' })
    : jsonResponse_({ ok: true, service: 'SoWork Google Sheet Bridge', version: '1.6.2' });
}

function doPost(e) {
  let requestId = '';
  try {
    const payload = parsePayload_(e);
    requestId = String(payload.requestId || '').trim();
    verifySecret_(payload.secret);
    let result;
    if (payload.action === 'writeSchedule') result = writeSchedule_(payload);
    else if (payload.action === 'testConnection') result = testConnection_(payload);
    else throw new Error('Action tidak didukung.');
    const response = { ok: true, requestId, action: payload.action, ...result };
    saveStatus_(requestId, response);
    return jsonResponse_(response);
  } catch (error) {
    console.error(error);
    const response = { ok: false, requestId, error: String(error && error.message ? error.message : error) };
    saveStatus_(requestId, response);
    return jsonResponse_(response);
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

  const row1 = ['No', 'Nama Crew', 'Gender', 'Periode', ...dates.map(shortDateId_)];
  const row2 = ['', '', '', '', ...dates.map(dayNameId_)];
  const values = [row1, row2];

  crew.forEach((name, index) => {
    const gender = genderFor_(name, payload.rules);
    const row = [index + 1, name, gender, String(payload.periodLabel || 'Jadwal')];
    dates.forEach(date => {
      const item = byKey[`${date}__${name}`];
      if (!item) return row.push('');
      if (String(item.shift) === 'Libur') return row.push('LIBUR');
      const overtime = item.overtime ? `\nLEMBUR: ${item.overtimeType || 'Buka'}` : '';
      row.push(`${item.role || '-'}${overtime}`);
    });
    values.push(row);
  });

  ensureSize_(sheet, values.length, row1.length);
  const range = sheet.getRange(1, 1, values.length, row1.length);
  range.setValues(values);
  range.setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true);
  range.setBorder(true, true, true, true, true, true, SOWORK_COLORS.border, SpreadsheetApp.BorderStyle.SOLID);

  // Merge asli Google Sheets: bukan metadata clipboard.
  for (let col = 1; col <= 4; col++) sheet.getRange(1, col, 2, 1).merge();

  // Header.
  sheet.getRange(1, 1, 2, row1.length)
    .setBackground(SOWORK_COLORS.header)
    .setFontColor(SOWORK_COLORS.dark)
    .setFontWeight('bold');

  // Body identity + shift colors.
  crew.forEach((name, crewIndex) => {
    const row = crewIndex + 3;
    const gender = genderFor_(name, payload.rules);
    const identity = gender === 'Pria' ? SOWORK_COLORS.male : SOWORK_COLORS.female;
    sheet.getRange(row, 1, 1, 3).setBackground(identity).setFontColor(SOWORK_COLORS.dark);
    sheet.getRange(row, 2).setFontWeight('bold');
    sheet.getRange(row, 4).setBackground(SOWORK_COLORS.light).setFontColor(SOWORK_COLORS.dark);

    dates.forEach((date, dateIndex) => {
      const item = byKey[`${date}__${name}`];
      if (!item) return;
      const cell = sheet.getRange(row, dateIndex + 5);
      const shift = String(item.shift || '');
      const fill = item.overtime ? SOWORK_COLORS.Lembur : (SOWORK_COLORS[shift] || SOWORK_COLORS.light);
      const font = (shift === 'S2' || shift === 'Libur') && !item.overtime ? SOWORK_COLORS.light : SOWORK_COLORS.dark;
      cell.setBackground(fill).setFontColor(font);
    });
  });

  // Layout mendekati export SoWork.
  sheet.setColumnWidth(1, 52);
  sheet.setColumnWidth(2, 145);
  sheet.setColumnWidth(3, 88);
  sheet.setColumnWidth(4, 130);
  if (dates.length) sheet.setColumnWidths(5, dates.length, 112);
  sheet.setRowHeight(1, 25);
  sheet.setRowHeight(2, 24);
  if (crew.length) sheet.setRowHeights(3, crew.length, 34);
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(4);

  // Metadata ringan agar tab mudah diaudit tanpa mengganggu tabel.
  const note = [
    `SoWork ${String(payload.metadata && payload.metadata.workspace || 'SoWork')}`,
    payload.metadata && payload.metadata.branch ? `Cabang: ${payload.metadata.branch}` : '',
    payload.metadata && payload.metadata.sentBy ? `Dikirim oleh: ${payload.metadata.sentBy}` : '',
    payload.metadata && payload.metadata.sentAt ? `Sync: ${payload.metadata.sentAt}` : ''
  ].filter(Boolean).join(' | ');
  sheet.getRange(1, 1).setNote(note);

  SpreadsheetApp.flush();
  return {
    spreadsheetId,
    spreadsheetName: ss.getName(),
    sheetName,
    rowCount: values.length,
    columnCount: row1.length,
    url: `${ss.getUrl()}#gid=${sheet.getSheetId()}`
  };
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
