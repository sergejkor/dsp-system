import { query } from '../../db.js';
import * as XLSX from 'xlsx';

/**
 * Get weeks for a year (from `weeks` table).
 */
async function getWeeks(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const res = await query(
    `SELECT id, year, week, week_key, week_start, week_end, is_full_week, month_label
     FROM weeks
     WHERE year = $1
     ORDER BY week ASC`,
    [y]
  );
  return res.rows;
}

/**
 * Get month work days summary: per employee, worked_days_month for given year/month.
 */
async function getMonthWorkDays(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return [];
  const res = await query(
    `SELECT m.id, m.employee_id, m.year, m.month, m.worked_days_month,
            e.first_name, e.last_name, e.display_name, e.pn
     FROM month_work_days_data m
     LEFT JOIN employees e ON e.employee_id = m.employee_id
     WHERE m.year = $1 AND m.month = $2
     ORDER BY e.last_name ASC, e.first_name ASC`,
    [y, m]
  );
  return res.rows;
}

/**
 * Get work_days_data (per employee per week) for a year.
 */
async function getWorkDaysData(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const res = await query(
    `SELECT w.employee_id, w.year, w.week, w.worked_days,
            e.first_name, e.last_name, e.display_name, e.pn
     FROM work_days_data w
     LEFT JOIN employees e ON e.employee_id = w.employee_id
     WHERE w.year = $1
     ORDER BY w.week ASC, e.last_name ASC`,
    [y]
  );
  return res.rows;
}

/**
 * List calendar_days with upload count for a date range.
 */
async function getCalendarDays(fromDate, toDate) {
  const from = fromDate && fromDate.match(/^\d{4}-\d{2}-\d{2}$/) ? fromDate : null;
  const to = toDate && toDate.match(/^\d{4}-\d{2}-\d{2}$/) ? toDate : null;
  if (!from || !to) return [];
  const res = await query(
    `SELECT c.id, c.day_key, c.status, c.conflict_count, c.notes, c.created_at, c.updated_at,
            COUNT(u.id)::int AS upload_count
     FROM calendar_days c
     LEFT JOIN daily_uploads u ON u.day_id = c.id
     WHERE c.day_key >= $1 AND c.day_key <= $2
     GROUP BY c.id, c.day_key, c.status, c.conflict_count, c.notes, c.created_at, c.updated_at
     ORDER BY c.day_key ASC`,
    [from, to]
  );
  return res.rows;
}

/**
 * Get all days in a month with upload count. Returns one entry per day (upload_count 0 if no data).
 */
async function getMonthDaysWithUploads(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return [];
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const days = [];
  for (let d = 1; d <= lastDay; d++) {
    const dayKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day_key: dayKey, day: d, upload_count: 0, status: null });
  }
  const res = await query(
    `SELECT c.day_key, c.status, COUNT(u.id)::int AS upload_count
     FROM calendar_days c
     LEFT JOIN daily_uploads u ON u.day_id = c.id
     WHERE c.day_key >= $1 AND c.day_key <= $2
     GROUP BY c.day_key, c.status`,
    [from, to]
  );
  for (const row of res.rows) {
    const dayKeyStr = toDayKeyString(row.day_key);
    const idx = days.findIndex((d) => d.day_key === dayKeyStr);
    if (idx >= 0) {
      days[idx].upload_count = Number(row.upload_count) || 0;
      days[idx].status = row.status;
    }
  }
  return days;
}

/** Normalize day_key from DB (Date or string) to YYYY-MM-DD using local date. */
function toDayKeyString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

/**
 * Get or create a calendar_days row for day_key. Returns { id, day_key }.
 */
async function ensureCalendarDay(dayKey) {
  if (!dayKey || !dayKey.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new Error('Invalid day_key: must be YYYY-MM-DD');
  }
  await query(
    `INSERT INTO calendar_days (day_key) VALUES ($1) ON CONFLICT (day_key) DO NOTHING`,
    [dayKey]
  );
  const res = await query(`SELECT id, day_key FROM calendar_days WHERE day_key = $1`, [dayKey]);
  return res.rows[0];
}

/**
 * Extract date from Excel buffer: look for "Datum" or "Date" column or first date-like value in first rows.
 * Returns YYYY-MM-DD or null.
 */
function extractDateFromExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false });
  const name = wb.SheetNames[0];
  if (!name) return null;
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  if (!data.length) return null;

  const dateHeaderNames = ['datum', 'date', 'datums', 'дата', 'tag', 'day', 'день', 'dat'];
  const headers = (data[0] || []).map((h) => String(h || '').trim().toLowerCase());
  const dateColIndex = headers.findIndex((h) => dateHeaderNames.includes(h));

  if (dateColIndex >= 0) {
    for (let r = 1; r < Math.min(data.length, 15); r++) {
      const cell = data[r] && data[r][dateColIndex];
      const d = toDateString(cell);
      if (d) return d;
    }
    for (let r = 0; r < Math.min(data.length, 2); r++) {
      const cell = data[r] && data[r][dateColIndex];
      const d = toDateString(cell);
      if (d) return d;
    }
  }

  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const row = data[r] || [];
    for (let c = 0; c < Math.min(row.length, 20); c++) {
      const d = toDateString(row[c]);
      if (d) return d;
    }
  }
  return null;
}

function toDateString(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (value > 10000 && value < 1000000) {
      const d = excelSerialToDate(value);
      if (d) return d;
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return formatDate(d);
    return null;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
    const dmY = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
    const yMd = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (yMd) return `${yMd[1]}-${yMd[2].padStart(2, '0')}-${yMd[3].padStart(2, '0')}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return formatDate(d);
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatDate(value);
  }
  return null;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function excelSerialToDate(serial) {
  if (serial < 1) return null;
  const utc = (serial - 25569) * 86400 * 1000;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(d);
}

/**
 * Extract date from file name (e.g. report_2025-03-13.xlsx or 13.03.2025_data.xlsx).
 * Returns YYYY-MM-DD or null.
 */
function extractDateFromFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;
  const s = fileName.trim();
  const ymd = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const dm = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2})/);
  if (dm) {
    const y = parseInt(dm[3], 10);
    const year = y >= 0 && y <= 99 ? (y >= 50 ? 1900 + y : 2000 + y) : null;
    if (year != null) return `${year}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  }
  return null;
}

/** Pick first non-empty value from row by trying keys in order. */
function pick(row, ...keys) {
  if (!row || typeof row !== 'object') return null;
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}
function pickStr(row, ...keys) {
  const v = pick(row, ...keys);
  return v != null ? String(v).trim() : null;
}
function pickNum(row, ...keys) {
  const v = pick(row, ...keys);
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pick first object key that looks like transporter/driver name (e.g. shortened German header). */
function pickFirstTransporterName(row) {
  if (!row || typeof row !== 'object') return '';
  const lower = (s) => String(s ?? '').toLowerCase();
  for (const key of Object.keys(row)) {
    const k = lower(key);
    if (k.includes('name') && (k.includes('fahrer') || k.includes('transporter')) || (k.includes('transporter') && k.includes('name')) || k === 'transporter-name') {
      const v = row[key];
      if (v != null && String(v).trim() && !/^AlfaMile\s+GmbH$/i.test(String(v).trim())) return String(v).trim();
    }
  }
  return '';
}

/**
 * Parse Excel to array of row objects (headers from first row).
 * Returns every column from the sheet so all indicators can be stored in raw_data for analytics.
 */
function parseExcelToRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, raw: false });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  return rows;
}

/**
 * Save upload: validate file date === dayKey, then store in calendar_days, daily_uploads, daily_upload_rows.
 * Date is taken from file name first (e.g. Anfahrlisten_2026-01-03.xlsx), then from file content.
 */
async function saveUpload(dayKey, fileName, buffer) {
  const fileDate = extractDateFromFileName(fileName) || extractDateFromExcel(buffer);
  if (!fileDate) {
    throw new Error('NO_DATE_IN_FILE');
  }
  if (fileDate !== dayKey) {
    throw new Error('DATE_MISMATCH');
  }

  const day = await ensureCalendarDay(dayKey);
  const dayId = day.id;

  const existing = await query(
    `SELECT 1 FROM daily_uploads WHERE day_id = $1 LIMIT 1`,
    [dayId]
  );
  if (existing.rows.length > 0) {
    throw new Error('ALREADY_HAS_FILE');
  }

  const uploadRes = await query(
    `INSERT INTO daily_uploads (day_id, original_file_name, file_url, file_content, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id`,
    [dayId, fileName || 'upload.xlsx', null, buffer]
  );
  const uploadId = uploadRes.rows[0].id;

  const rows = parseExcelToRows(buffer);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const driverName =
      row.driver_name ?? row.Driver ?? row.name ?? row.Name ?? row['Driver Name'] ??
      row['Name des Fahrers'] ?? row['Transporter-Name des Fa DSP'] ?? row['Transporter-Name'] ?? pickFirstTransporterName(row) ?? '';
    const transporterId =
      row.transporter_id ?? row.Transporter ?? row.transporterId ?? row['Transporter ID'] ?? row['Transporter-ID'] ?? '';
    const appLogin =
      row.app_login ?? row['App Login'] ?? row.login ?? row['App-Anmeldung:'] ?? row['App-Anmeld'] ?? row['App Anmeld'] ?? '';
    const appLogout =
      row.app_logout ?? row['App Logout'] ?? row.logout ?? row['App-Abmeldung:'] ?? row['App-Abmeld'] ?? row['App Abmeld'] ?? '';
    // Cortex columns (split from raw_data for analytics)
    const dsp = pickStr(row, 'DSP', 'dsp');
    const routencode = pickStr(row, 'Routencode', 'routencode');
    const daAktivitaet = pickStr(row, 'DA-Aktivität', 'da_aktivitaet');
    const paketeInsgesamt = pickNum(row, 'Pakete insgesamt', 'pakete_insgesamt');
    const zustelldienstTyp = pickStr(row, 'Zustelldienst-Typ', 'zustelldienst_typ');
    const cortexVinNumber = pickStr(row, 'cortex_vin_number');
    const abgeschlosseneStopps = pickNum(row, 'Abgeschlossene Stopps', 'abgeschlossene_stopps');
    const alleZielaktivitaeten = pickNum(row, 'Alle Zielaktivitäten', 'alle_zielaktivitaeten');
    const statusFortschritts = pickStr(row, 'Status des Fortschritts', 'status_fortschritts');
    const nichtGestarteteStopps = pickNum(row, 'nicht gestartete Stopps', 'nicht_gestartete_stopps');
    const cortexTotalBreakTimeUsed = pickStr(row, 'cortex_total_break_time_used');
    const geplanteRueckkehrStation = pickStr(row, 'Geplante Rückkehr zur Station', 'geplante_rueckkehr_station');
    const cortexAvgPaceStopsPerHour = pickNum(row, 'cortex_avg_pace_stops_per_hour');
    const cortexLastStopExecutionTime = pickStr(row, 'cortex_last_stop_execution_time');
    const cortexRemainingStateOfCharge = pickNum(row, 'cortex_remaining_state_of_charge');
    const ueberstundenMinuten = pickStr(row, 'voraussichtliche Dauer der Überstunden (Minuten)', 'ueberstunden_minuten');

    await query(
      `INSERT INTO daily_upload_rows (
        day_id, day_key, upload_id, row_index, driver_name, transporter_id, app_login, app_logout,
        dsp, routencode, da_aktivitaet, pakete_insgesamt, zustelldienst_typ, cortex_vin_number,
        abgeschlossene_stopps, alle_zielaktivitaeten, status_fortschritts, nicht_gestartete_stopps,
        cortex_total_break_time_used, geplante_rueckkehr_station, cortex_avg_pace_stops_per_hour,
        cortex_last_stop_execution_time, cortex_remaining_state_of_charge, ueberstunden_minuten,
        raw_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21,
        $22, $23, $24,
        $25
      )`,
      [
        dayId,
        dayKey,
        uploadId,
        i + 1,
        driverName,
        transporterId,
        appLogin,
        appLogout,
        dsp,
        routencode,
        daAktivitaet,
        paketeInsgesamt,
        zustelldienstTyp,
        cortexVinNumber,
        abgeschlosseneStopps,
        alleZielaktivitaeten,
        statusFortschritts,
        nichtGestarteteStopps,
        cortexTotalBreakTimeUsed,
        geplanteRueckkehrStation,
        cortexAvgPaceStopsPerHour,
        cortexLastStopExecutionTime,
        cortexRemainingStateOfCharge,
        ueberstundenMinuten,
        JSON.stringify(row),
      ]
    );
  }

  return { dayKey, uploadId, rowCount: rows.length };
}

const calendarService = {
  getWeeks,
  getMonthWorkDays,
  getWorkDaysData,
  getCalendarDays,
  getMonthDaysWithUploads,
  ensureCalendarDay,
  saveUpload,
  extractDateFromExcel,
};

export default calendarService;
