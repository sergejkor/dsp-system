
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function clearAndWrite(sheetName, headers, rows) {
  const sheet = getSheet(sheetName);
  sheet.clearContents();
  if (headers && headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  if (rows && rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function readTable(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h || '').trim());
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

function pickFirst() {
  for (var i = 0; i < arguments.length; i++) {
    var v = arguments[i];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function getConfig() {
  const rows = readTable('CONFIG');
  const cfg = {};
  rows.forEach(r => {
    const key = String(r.key || '').trim();
    if (!key) return;
    cfg[key] = r.value;
  });
  return cfg;
}

function getRequiredConfig(key) {
  const cfg = getConfig();
  const value = cfg[key];
  if (value === '' || value === null || value === undefined) {
    throw new Error('CONFIG: ' + key + ' is empty');
  }
  return value;
}

function getRating(kpi) {
  const v = Number(kpi || 0);
  if (v < 50) return 'POOR';
  if (v < 70) return 'FAIR';
  if (v < 85) return 'GREAT';
  if (v < 93) return 'FANTASTIC';
  return 'FANTASTIC PLUS';
}

function getQualityBonusForWeek(kpi, workedDays) {
  const v = Number(kpi || 0);
  const d = Number(workedDays || 0);
  if (v > 93) return d * 17;
  if (v > 85) return d * 5;
  return 0;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function logEvent(stage, level, message) {
  const sheet = getSheet('LOG');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 4).setValues([['timestamp', 'stage', 'level', 'message']]);
  }
  sheet.appendRow([new Date().toISOString(), stage, level, String(message || '')]);
}

function logError(stage, error) {
  const message = error && error.stack ? error.stack : String(error || 'Unknown error');
  logEvent(stage, 'ERROR', message);
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getISOYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

function formatDateUTC(date, pattern) {
  return Utilities.formatDate(date, 'GMT', pattern);
}
