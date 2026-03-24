/**
 * Parse BAB / Kostenrechnung-style Excel matrices (from SheetJS) into tabular rows.
 */

function normalizeCellText(v) {
  if (v == null) return '';
  return String(v).replace(/\r\n/g, '\n').trim();
}

function parseNumber(cell) {
  if (cell == null || cell === '') return null;
  if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
  const s = String(cell).trim();
  if (!s) return null;
  const german = s.replace(/\./g, '').replace(',', '.');
  const n = Number(german);
  return Number.isFinite(n) ? n : null;
}

/** Extract MM/YYYY from header like "Ist-Wert\n01/2025" or YTD range "01/2025-12/2025". */
function parsePeriodKeyFromHeader(headerCell) {
  const t = normalizeCellText(headerCell);
  if (/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{4}/.test(t)) return 'ytd';
  const m = t.match(/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[2]}-${m[1]}`;
}

/**
 * Annual overview: alternating value columns (month, null, month, null, …, ytd).
 */
export function parseAnnualOverview(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && normalizeCellText(r[0]) === 'Zeile' && normalizeCellText(r[1]) === 'Bezeichnung') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return { periodKeys: [], periods: [], tableRows: [], headerRowIndex: -1 };
  }
  const headerRow = rows[headerIdx];
  /** @type {{ key: string, col: number }[]} */
  const periodCols = [];
  for (let c = 2; c < headerRow.length; c += 2) {
    const key = parsePeriodKeyFromHeader(headerRow[c]);
    if (!key) continue;
    periodCols.push({ key, col: c });
  }

  const tableRows = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const codeRaw = r[0];
    const code =
      typeof codeRaw === 'number'
        ? codeRaw
        : parseNumber(codeRaw) ?? (normalizeCellText(codeRaw) || null);
    const label = normalizeCellText(r[1]);
    if (code === null && !label) continue;
    const values = {};
    for (const { key, col } of periodCols) {
      values[key] = parseNumber(r[col]);
    }
    tableRows.push({
      code: code != null ? String(code) : '',
      label,
      values,
    });
  }

  const periods = periodCols.map((p) => p.key).filter((k) => k !== 'ytd');
  const periodKeys = periodCols.map((p) => p.key);
  return { periodKeys, periods, tableRows, headerRowIndex: headerIdx };
}

/**
 * Monthly sheet: "Alle Kst." month at col 2, YTD at 4; "Sammelkst." month at 5, YTD at 6.
 */
export function parseMonthlyDetail(matrix, sheetTitle) {
  const rows = Array.isArray(matrix) ? matrix : [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && normalizeCellText(r[0]) === 'Zeile' && normalizeCellText(r[1]) === 'Bezeichnung') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return { sheetTitle, tableRows: [], headerRowIndex: -1 };
  }
  const tableRows = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const codeRaw = r[0];
    const code =
      typeof codeRaw === 'number'
        ? codeRaw
        : parseNumber(codeRaw) ?? (normalizeCellText(codeRaw) || null);
    const label = normalizeCellText(r[1]);
    if (code === null && !label) continue;
    tableRows.push({
      code: code != null ? String(code) : '',
      label,
      monthAlle: parseNumber(r[2]),
      ytdAlle: parseNumber(r[4]),
      monthSammel: parseNumber(r[5]),
      ytdSammel: parseNumber(r[6]),
    });
  }
  return { sheetTitle, tableRows, headerRowIndex: headerIdx };
}

export function extractMonthlySeriesFromAnnual(tableRows, rowCode) {
  const row = tableRows.find((r) => String(r.code) === String(rowCode));
  if (!row) return [];
  const points = [];
  const keys = Object.keys(row.values || {}).sort();
  for (const k of keys) {
    if (k === 'ytd') continue;
    const y = row.values[k];
    if (y == null || !Number.isFinite(y)) continue;
    points.push({ ds: `${k}-01`, y });
  }
  return points;
}
