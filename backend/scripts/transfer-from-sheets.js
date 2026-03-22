/**
 * Transfer data from Google Sheets into PostgreSQL (dsp_system).
 *
 * Two modes:
 * 1) From Apps Script Web App: set GOOGLE_APPS_SCRIPT_URL in .env.
 *    Script must return JSON: { employees, kpi_data, month_work_days_data,
 *    payroll_bonus_by_week, payroll_abzug_items, payroll_bonus_items, vorschuss, weeks }
 * 2) From local JSON: put data in backend/data/sheets-export/data.json
 *    with the same keys. Or export CSVs to backend/data/sheets-export/
 *    (see README).
 *
 * Requires: DATABASE_URL in .env (e.g. postgresql://user:pass@localhost:5432/dsp_system)
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const dataDir = join(projectRoot, 'data', 'sheets-export');
const dataJsonPath = join(dataDir, 'data.json');

const { Client } = pg;

function getConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required in .env');
  return url;
}

const SHEET_TO_KEY = {
  EMPLOYEE_MASTER: 'employees',
  KENJO_EMPLOYEES: 'kenjo_employees',
  KPI_DATA: 'kpi_data',
  WORK_DAYS_RAW: 'work_days_raw',
  WORK_DAYS_DATA: 'work_days_data',
  MONTH_WORK_DAYS_DATA: 'month_work_days_data',
  PAYROLL_BONUS_BY_WEEK: 'payroll_bonus_by_week',
  PAYROLL_ABZUG_ITEMS: 'payroll_abzug_items',
  PAYROLL_BONUS_ITEMS: 'payroll_bonus_items',
  VORSCHUSS: 'vorschuss',
  WEEKS: 'weeks',
};

function normalizeAppsScriptResponse(json) {
  if (json && json.success === true && json.data && typeof json.data === 'object') {
    const out = {};
    for (const [sheetName, key] of Object.entries(SHEET_TO_KEY)) {
      const rows = json.data[sheetName];
      if (Array.isArray(rows)) out[key] = rows;
    }
    return out;
  }
  return json;
}

async function insertKenjoEmployees(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;

  for (const r of rows) {
    const kenjo_user_id = String(r.kenjo_user_id ?? r.kenjoUserId ?? "").trim();
    if (!kenjo_user_id) continue;

    await client.query(
      `INSERT INTO kenjo_employees (
        kenjo_user_id,
        employee_number,
        transporter_id,
        first_name,
        last_name,
        display_name,
        job_title,
        start_date,
        contract_end,
        is_active,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (kenjo_user_id) DO UPDATE SET
        employee_number = EXCLUDED.employee_number,
        transporter_id = EXCLUDED.transporter_id,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        display_name = EXCLUDED.display_name,
        job_title = EXCLUDED.job_title,
        start_date = EXCLUDED.start_date,
        contract_end = EXCLUDED.contract_end,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()`,
      [
        kenjo_user_id,
        String(r.employee_number ?? "").trim(),
        String(r.transporter_id ?? "").trim(),
        String(r.first_name ?? "").trim(),
        String(r.last_name ?? "").trim(),
        String(r.display_name ?? "").trim(),
        String(r.job_title ?? "").trim(),
        toDate(r.start_date),
        toDate(r.contract_end),
        toBool(r.is_active) ?? true,
      ]
    );

    count++;
  }

  return count;
}

async function insertPayrollBonusItems(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;

  for (const r of rows) {
    const period_id = String(r.period_id ?? r.periodId ?? "").trim();
    const employee_id = String(r.employee_id ?? r.employeeId ?? "").trim();
    const line_no = toNum(r.line_no ?? r.lineNo) ?? 0;

    if (!period_id || !employee_id) continue;

    await client.query(
      `INSERT INTO payroll_bonus_items (
        period_id,
        employee_id,
        line_no,
        amount,
        comment,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (period_id, employee_id, line_no)
      DO UPDATE SET
        amount = EXCLUDED.amount,
        comment = EXCLUDED.comment,
        updated_at = NOW()`,
      [
        period_id,
        employee_id,
        line_no,
        toNum(r.amount) ?? 0,
        String(r.comment ?? "").trim(),
      ]
    );

    count++;
  }

  return count;
}

async function fetchFromAppsScript(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("action", "exportForDb");

  console.log("Apps Script URL:", url.toString());

  const res = await fetch(url.toString(), {
    method: "GET",
    redirect: "follow",
    headers: {
      "Accept": "application/json"
    }
  });

  const text = await res.text();

  console.log("Apps Script response preview:");
  console.log(text.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Apps Script returned ${res.status}: ${text}`);
  }

  if (text.trim().startsWith("<!DOCTYPE html") || text.trim().startsWith("<html")) {
    throw new Error(
      'Apps Script returned HTML instead of JSON. Check the exact /exec URL and deployment access.'
    );
  }

  const json = JSON.parse(text);
  return normalizeAppsScriptResponse(json);
}

function loadLocalData() {
  if (!existsSync(dataJsonPath)) {
    throw new Error(
      `No data file at ${dataJsonPath}. Create it or set GOOGLE_APPS_SCRIPT_URL to fetch from Apps Script.`
    );
  }
  const raw = readFileSync(dataJsonPath, 'utf8');
  const json = JSON.parse(raw);
  return normalizeAppsScriptResponse(json);
}

function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
  return s;
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'да';
}

async function upsertEmployees(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const employee_id = r.employee_id ?? r.employeeId ?? r.id ?? '';
    if (!employee_id) continue;
    const pn = r.pn ?? r.personalNr ?? '';
    const first_name = r.first_name ?? r.vorname ?? r.firstName ?? '';
    const last_name = r.last_name ?? r.name ?? r.lastName ?? '';
    const display_name = r.display_name ?? r.displayName ?? '';
    const email = r.email ?? '';
    const phone = r.phone ?? r.mobile ?? '';
    const start_date = toDate(r.start_date ?? r.startDate);
    const contract_end = toDate(r.contract_end ?? r.contractEnd);
    const transporter_id = r.transporter_id ?? r.transportationId ?? r.transporterId ?? '';
    const kenjo_user_id = r.kenjo_user_id ?? r.kenjoUserId ?? '';
    const is_active = toBool(r.is_active ?? r.isActive) ?? true;

    await client.query(
      `INSERT INTO employees (
        employee_id, pn, first_name, last_name, display_name, email, phone,
        start_date, contract_end, transporter_id, kenjo_user_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (employee_id) DO UPDATE SET
        pn = EXCLUDED.pn,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        start_date = EXCLUDED.start_date,
        contract_end = EXCLUDED.contract_end,
        transporter_id = EXCLUDED.transporter_id,
        kenjo_user_id = EXCLUDED.kenjo_user_id,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()`,
      [
        employee_id,
        pn,
        first_name,
        last_name,
        display_name,
        email,
        phone,
        start_date,
        contract_end,
        transporter_id,
        kenjo_user_id,
        is_active,
      ]
    );
    count++;
  }
  return count;
}

async function insertKpiData(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const employee_id = r.employee_id ?? r.employeeId ?? '';
    const year = toNum(r.year);
    const week = toNum(r.week);
    if (!employee_id || year == null || week == null) continue;
    await client.query(
      `INSERT INTO kpi_data (employee_id, year, week, kpi, quality_score, routes_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        employee_id,
        year,
        week,
        toNum(r.kpi) ?? 0,
        toNum(r.quality_score ?? r.qualityScore) ?? 0,
        toNum(r.routes_count ?? r.routes ?? r.routesCount) ?? 0,
      ]
    );
    count++;
  }
  return count;
}

async function insertWorkDaysRaw(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const employee_id = r.employee_id ?? r.employeeId ?? '';
    const work_date = toDate(r.work_date ?? r.workDate ?? r.date);
    if (!employee_id || !work_date) continue;
    const year = toNum(r.year) ?? new Date(work_date + 'Z').getUTCFullYear();
    const month = toNum(r.month) ?? new Date(work_date + 'Z').getUTCMonth() + 1;
    const week = toNum(r.week);
    await client.query(
      `INSERT INTO work_days_raw (employee_id, work_date, year, month, week)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (employee_id, work_date) DO UPDATE SET year = EXCLUDED.year, month = EXCLUDED.month, week = EXCLUDED.week`,
      [employee_id, work_date, year, month, week ?? 0]
    );
    count++;
  }
  return count;
}

async function insertWorkDaysData(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const employee_id = r.employee_id ?? r.employeeId ?? '';
    const year = toNum(r.year);
    const week = toNum(r.week);
    if (!employee_id || year == null || week == null) continue;
    await client.query(
      `INSERT INTO work_days_data (employee_id, year, week, worked_days)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id, year, week) DO UPDATE SET worked_days = EXCLUDED.worked_days`,
      [employee_id, year, week, toNum(r.worked_days ?? r.workedDays) ?? 0]
    );
    count++;
  }
  return count;
}

async function insertMonthWorkDays(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const employee_id = r.employee_id ?? r.employeeId ?? '';
    const year = toNum(r.year);
    const month = toNum(r.month);
    if (!employee_id || year == null || month == null) continue;
    await client.query(
      `INSERT INTO month_work_days_data (employee_id, year, month, worked_days_month)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id, year, month) DO UPDATE SET worked_days_month = EXCLUDED.worked_days_month`,
      [employee_id, year, month, toNum(r.worked_days_month ?? r.workedDaysMonth) ?? 0]
    );
    count++;
  }
  return count;
}

async function insertPayrollBonusByWeek(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const employee_id = r.employee_id ?? r.employeeId ?? '';
    const year = toNum(r.year);
    const week = toNum(r.week);
    const week_key = r.week_key ?? (year && week ? `${year}-W${String(week).padStart(2, '0')}` : '');
    if (!employee_id) continue;
    await client.query(
      `INSERT INTO payroll_bonus_by_week (
        employee_id, pn, first_name, last_name, year, week, week_key, week_start, week_end,
        worked_days, kpi, rate, weekly_bonus, is_full_week
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        employee_id,
        r.pn ?? '',
        r.first_name ?? r.vorname ?? '',
        r.last_name ?? r.name ?? '',
        year ?? 0,
        week ?? 0,
        week_key,
        toDate(r.week_start),
        toDate(r.week_end),
        toNum(r.worked_days ?? r.workedDays) ?? 0,
        toNum(r.kpi) ?? 0,
        toNum(r.rate) ?? 0,
        toNum(r.weekly_bonus ?? r.weeklyBonus) ?? 0,
        toBool(r.is_full_week ?? r.isFullWeek) ?? true,
      ]
    );
    count++;
  }
  return count;
}

async function insertPayrollAbzug(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const period_id = r.period_id ?? r.periodId ?? '';
    const employee_id = r.employee_id ?? r.employeeId ?? '';
    const line_no = toNum(r.line_no ?? r.lineNo) ?? 0;
    if (!period_id || !employee_id) continue;
    await client.query(
      `INSERT INTO payroll_abzug_items (period_id, employee_id, line_no, amount, comment, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (period_id, employee_id, line_no) DO UPDATE SET amount = EXCLUDED.amount, comment = EXCLUDED.comment, updated_at = NOW()`,
      [period_id, employee_id, line_no, toNum(r.amount) ?? 0, r.comment ?? '']
    );
    count++;
  }
  return count;
}

async function insertPayrollBonus(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const period_id = r.period_id ?? r.periodId ?? '';
    const employee_id = r.employee_id ?? r.employeeId ?? '';
    const line_no = toNum(r.line_no ?? r.lineNo) ?? 0;
    if (!period_id || !employee_id) continue;
    await client.query(
      `INSERT INTO payroll_bonus_items (period_id, employee_id, line_no, amount, comment, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (period_id, employee_id, line_no) DO UPDATE SET amount = EXCLUDED.amount, comment = EXCLUDED.comment, updated_at = NOW()`,
      [period_id, employee_id, line_no, toNum(r.amount) ?? 0, r.comment ?? '']
    );
    count++;
  }
  return count;
}

async function insertVorschuss(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const period_id = r.period_id ?? r.periodId ?? '';
    const employee_id = r.employee_id ?? r.employeeId ?? '';
    if (!period_id || !employee_id) continue;
    await client.query(
      `INSERT INTO vorschuss (period_id, employee_id, amount, comment, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (period_id, employee_id) DO UPDATE SET amount = EXCLUDED.amount, comment = EXCLUDED.comment, updated_at = NOW()`,
      [period_id, employee_id, toNum(r.amount) ?? 0, r.comment ?? '']
    );
    count++;
  }
  return count;
}

async function insertWeeks(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const r of rows) {
    const year = toNum(r.year);
    const week = toNum(r.week);
    const week_key = r.week_key ?? (year && week ? `${year}-W${String(week).padStart(2, '0')}` : '');
    if (!week_key) continue;
    await client.query(
      `INSERT INTO weeks (year, week, week_key, week_start, week_end, is_full_week, month_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (week_key) DO UPDATE SET week_start = EXCLUDED.week_start, week_end = EXCLUDED.week_end, is_full_week = EXCLUDED.is_full_week, month_label = EXCLUDED.month_label`,
      [
        year ?? 0,
        week ?? 0,
        week_key,
        toDate(r.week_start),
        toDate(r.week_end),
        toBool(r.is_full_week ?? r.isFullWeek) ?? true,
        r.month_label ?? r.monthLabel ?? '',
      ]
    );
    count++;
  }
  return count;
}

async function run() {
  const dbUrl = getConnectionString();
  let data;

  if (process.env.GOOGLE_APPS_SCRIPT_URL) {
    console.log('Fetching data from Apps Script…');
    data = await fetchFromAppsScript(process.env.GOOGLE_APPS_SCRIPT_URL);
  } else {
    console.log('Loading data from', dataJsonPath);
    data = loadLocalData();
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const stats = {};
    if (data.employees?.length) {
      stats.employees = await upsertEmployees(client, data.employees);
      console.log('Employees:', stats.employees);
    }
    if (data.kpi_data?.length) {
      stats.kpi_data = await insertKpiData(client, data.kpi_data);
      console.log('KPI data:', stats.kpi_data);
    }
    if (data.work_days_raw?.length) {
      stats.work_days_raw = await insertWorkDaysRaw(client, data.work_days_raw);
      console.log('Work days raw:', stats.work_days_raw);
    }
    if (data.work_days_data?.length) {
      stats.work_days_data = await insertWorkDaysData(client, data.work_days_data);
      console.log('Work days data:', stats.work_days_data);
    }
    if (data.month_work_days_data?.length) {
      stats.month_work_days_data = await insertMonthWorkDays(client, data.month_work_days_data);
      console.log('Month work days:', stats.month_work_days_data);
    }
    if (data.payroll_bonus_by_week?.length) {
      stats.payroll_bonus_by_week = await insertPayrollBonusByWeek(client, data.payroll_bonus_by_week);
      console.log('Payroll bonus by week:', stats.payroll_bonus_by_week);
    }
    if (data.payroll_abzug_items?.length) {
      stats.payroll_abzug_items = await insertPayrollAbzug(client, data.payroll_abzug_items);
      console.log('Payroll abzug:', stats.payroll_abzug_items);
    }
    if (data.payroll_bonus_items?.length) {
      stats.payroll_bonus_items = await insertPayrollBonus(client, data.payroll_bonus_items);
      console.log('Payroll bonus items:', stats.payroll_bonus_items);
    }
    if (data.vorschuss?.length) {
      stats.vorschuss = await insertVorschuss(client, data.vorschuss);
      console.log('Vorschuss:', stats.vorschuss);
    }
    if (data.weeks?.length) {
      stats.weeks = await insertWeeks(client, data.weeks);
      console.log('Weeks:', stats.weeks);
    }
    console.log('Done. Summary:', stats);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
