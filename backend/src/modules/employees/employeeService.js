import { query } from '../../db.js';
import settingsService from '../settings/settingsService.js';
import { getKenjoUsersList, getTimeOffRequests } from '../kenjo/kenjoClient.js';

let docsTableReady = false;
let contractExtensionsTableReady = false;
let employeeContractsTableReady = false;
let employeeContractTerminationColumnsReady = false;
let rescueTableReady = false;
let employeeVacationColumnsReady = false;
let kenjoTimeOffTableReady = false;
let kenjoTimeOffSyncLogReady = false;

function looksLikeKenjoId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

async function ensureEmployeeDocumentsTable() {
  if (docsTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id SERIAL PRIMARY KEY,
      employee_ref VARCHAR(128) NOT NULL,
      document_type VARCHAR(64) NOT NULL,
      file_name TEXT NOT NULL,
      mime_type VARCHAR(255),
      file_content BYTEA NOT NULL,
      import_group_id VARCHAR(128),
      import_source_key VARCHAR(128),
      import_source_name TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS import_group_id VARCHAR(128)`);
  await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS import_source_key VARCHAR(128)`);
  await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS import_source_name TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_documents_ref ON employee_documents (employee_ref, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_documents_source_key ON employee_documents (import_source_key)`);
  docsTableReady = true;
}

async function ensureEmployeeContractExtensionsTable() {
  if (contractExtensionsTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS employee_contract_extensions (
      id SERIAL PRIMARY KEY,
      employee_ref VARCHAR(128) NOT NULL,
      extension_index INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (employee_ref, extension_index)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_contract_extensions_ref ON employee_contract_extensions (employee_ref, extension_index ASC)`);
  contractExtensionsTableReady = true;
}

async function ensureEmployeeContractsTable() {
  if (employeeContractsTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS employee_contracts (
      id SERIAL PRIMARY KEY,
      employee_ref VARCHAR(128),
      kenjo_employee_id VARCHAR(128),
      start_date DATE NOT NULL,
      end_date DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS employee_ref VARCHAR(128)`);
  await query(`ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS kenjo_employee_id VARCHAR(128)`);
  await query(`ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_contracts_ref ON employee_contracts (employee_ref, start_date ASC, id ASC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_contracts_kenjo_id ON employee_contracts (kenjo_employee_id, start_date ASC, id ASC)`);
  employeeContractsTableReady = true;
}

async function ensureEmployeeContractTerminationColumns() {
  if (employeeContractTerminationColumnsReady) return;
  await ensureEmployeeContractsTable();
  await query(`ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS termination_date DATE`);
  await query(`ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS termination_type VARCHAR(64)`);
  await query(`ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS termination_initiator VARCHAR(64)`);
  await query(`ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS termination_document_id INTEGER`);
  await query(`ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS termination_document_name TEXT`);
  employeeContractTerminationColumnsReady = true;
}

export async function ensureEmployeeRescuesTable() {
  if (rescueTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS employee_rescues (
      id SERIAL PRIMARY KEY,
      employee_ref VARCHAR(128) NOT NULL,
      kenjo_employee_id VARCHAR(128),
      rescue_date DATE NOT NULL,
      amount NUMERIC(10,2) NOT NULL DEFAULT 20,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE employee_rescues ADD COLUMN IF NOT EXISTS kenjo_employee_id VARCHAR(128)`);
  await query(`ALTER TABLE employee_rescues ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) NOT NULL DEFAULT 20`);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_rescues_ref ON employee_rescues (employee_ref, rescue_date DESC, id DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_rescues_kenjo_date ON employee_rescues (kenjo_employee_id, rescue_date DESC)`);
  rescueTableReady = true;
}

async function ensureEmployeeVacationColumns() {
  if (employeeVacationColumnsReady) return;
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vacation_days_override NUMERIC(10,2)`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vacation_days_override_year INTEGER`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vacation_balance_seed NUMERIC(10,2)`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vacation_balance_seed_year INTEGER`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vacation_balance_seed_date DATE`);
  employeeVacationColumnsReady = true;
}

async function ensureKenjoTimeOffTable() {
  if (kenjoTimeOffTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS kenjo_time_off (
      id SERIAL PRIMARY KEY,
      kenjo_request_id VARCHAR(255) NOT NULL UNIQUE,
      kenjo_user_id VARCHAR(255),
      employee_name VARCHAR(255),
      start_date DATE,
      end_date DATE,
      time_off_type VARCHAR(255),
      time_off_type_name VARCHAR(255),
      status VARCHAR(64),
      part_of_day_from VARCHAR(64),
      part_of_day_to VARCHAR(64),
      synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_kenjo_time_off_dates ON kenjo_time_off (start_date, end_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_kenjo_time_off_user ON kenjo_time_off (kenjo_user_id)`);
  kenjoTimeOffTableReady = true;
}

async function ensureKenjoTimeOffSyncLogTable() {
  if (kenjoTimeOffSyncLogReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS kenjo_time_off_sync_log (
      sync_key VARCHAR(32) PRIMARY KEY,
      period_month VARCHAR(7) NOT NULL,
      synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_kenjo_time_off_sync_log_period ON kenjo_time_off_sync_log (period_month)`);
  kenjoTimeOffSyncLogReady = true;
}

function buildEmployeeTerminationJoin(employeeAlias = 'e') {
  return `
    LEFT JOIN LATERAL (
      SELECT MAX(c.termination_date) AS latest_termination_date
      FROM employee_contracts c
      WHERE c.termination_date IS NOT NULL
        AND (
          c.employee_ref = ${employeeAlias}.employee_id
          OR c.employee_ref = ${employeeAlias}.kenjo_user_id
          OR c.employee_ref = ${employeeAlias}.id::text
          OR (${employeeAlias}.kenjo_user_id IS NOT NULL AND c.kenjo_employee_id = ${employeeAlias}.kenjo_user_id)
        )
    ) employee_contract_state ON TRUE
  `;
}

function buildEmployeeEffectiveActiveSql(employeeAlias = 'e', terminationAlias = 'employee_contract_state') {
  return `CASE
    WHEN ${terminationAlias}.latest_termination_date IS NOT NULL
      AND ${terminationAlias}.latest_termination_date <= CURRENT_DATE
    THEN FALSE
    ELSE COALESCE(${employeeAlias}.is_active, FALSE)
  END`;
}

async function listEmployees({ search, onlyActive } = {}) {
  await ensureEmployeeVacationColumns();
  await ensureEmployeeContractTerminationColumns();
  const params = [];
  const where = [];
  const effectiveActiveSql = buildEmployeeEffectiveActiveSql('e');

  if (onlyActive) {
    params.push(true);
    where.push(`${effectiveActiveSql} = $${params.length}`);
  }

  if (search && String(search).trim()) {
    const term = `%${String(search).trim().toLowerCase()}%`;
    params.push(term, term, term);
    where.push(
      `(LOWER(first_name) LIKE $${params.length - 2} OR LOWER(last_name) LIKE $${params.length - 1} OR LOWER(email) LIKE $${params.length})`
    );
  }

  const sql = `
    SELECT
      e.id,
      e.employee_id,
      e.pn,
      e.first_name,
      e.last_name,
      e.display_name,
      e.email,
      e.phone,
      e.start_date,
      e.contract_end,
      e.transporter_id,
      e.kenjo_user_id,
      e.vacation_days_override,
      e.vacation_days_override_year,
      e.vacation_days_override AS total_year_vacation,
      e.vacation_days_override_year AS total_year_vacation_year,
      e.vacation_balance_seed AS current_remaining_vacation,
      e.vacation_balance_seed_year AS current_remaining_vacation_year,
      e.vacation_balance_seed_date AS current_remaining_vacation_set_on,
      employee_contract_state.latest_termination_date,
      ${effectiveActiveSql} AS is_active
    FROM employees e
    ${buildEmployeeTerminationJoin('e')}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${effectiveActiveSql} DESC, e.last_name ASC, e.first_name ASC
    LIMIT 500
  `;

  const res = await query(sql, params);
  return res.rows;
}

async function getEmployeeById(employeeId) {
  await ensureEmployeeVacationColumns();
  await ensureEmployeeContractTerminationColumns();
  const effectiveActiveSql = buildEmployeeEffectiveActiveSql('e');
  const res = await query(
    `SELECT
      e.id,
      e.employee_id,
      e.pn,
      e.first_name,
      e.last_name,
      e.display_name,
      e.email,
      e.phone,
      e.start_date,
      e.contract_end,
      e.transporter_id,
      e.kenjo_user_id,
      e.vacation_days_override,
      e.vacation_days_override_year,
      e.vacation_days_override AS total_year_vacation,
      e.vacation_days_override_year AS total_year_vacation_year,
      e.vacation_balance_seed AS current_remaining_vacation,
      e.vacation_balance_seed_year AS current_remaining_vacation_year,
      e.vacation_balance_seed_date AS current_remaining_vacation_set_on,
      employee_contract_state.latest_termination_date,
      ${effectiveActiveSql} AS is_active
     FROM employees e
     ${buildEmployeeTerminationJoin('e')}
     WHERE e.employee_id = $1 OR e.id::text = $1 OR e.kenjo_user_id = $1 OR e.pn = $1
     LIMIT 1`,
    [String(employeeId)]
  );
  return res.rows[0] || null;
}

async function updateEmployeeLocalSettings(employeeId, payload = {}) {
  await ensureEmployeeVacationColumns();
  const id = String(employeeId || '').trim();
  if (!id) throw new Error('employee_id is required');

  const hasVacationOverride = Object.prototype.hasOwnProperty.call(payload || {}, 'vacationDaysOverride');
  const hasTotalYearVacation = Object.prototype.hasOwnProperty.call(payload || {}, 'totalYearVacation');
  const hasCurrentRemainingVacation = Object.prototype.hasOwnProperty.call(payload || {}, 'currentRemainingVacation');
  if (!hasVacationOverride && !hasTotalYearVacation && !hasCurrentRemainingVacation) {
    throw new Error('No supported local settings provided');
  }

  let vacationDaysOverride = null;
  let vacationDaysOverrideYear = null;
  const rawOverride = hasTotalYearVacation ? payload?.totalYearVacation : payload?.vacationDaysOverride;
  if (rawOverride !== '' && rawOverride != null) {
    const parsed = Number(rawOverride);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Vacation days override must be a non-negative number');
    }
    vacationDaysOverride = Math.round(parsed * 100) / 100;
    const rawYear = hasTotalYearVacation ? payload?.totalYearVacationYear : payload?.vacationDaysOverrideYear;
    const parsedYear = Number(rawYear || new Date().getFullYear());
    vacationDaysOverrideYear =
      Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 3000
        ? parsedYear
        : Number(new Date().getFullYear());
  }

  let vacationBalanceSeed = null;
  let vacationBalanceSeedYear = null;
  let vacationBalanceSeedDate = null;
  if (hasCurrentRemainingVacation) {
    const rawCurrentRemaining = payload?.currentRemainingVacation;
    if (rawCurrentRemaining !== '' && rawCurrentRemaining != null) {
      const parsed = Number(rawCurrentRemaining);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Current remaining vacation must be a non-negative number');
      }
      vacationBalanceSeed = Math.round(parsed * 100) / 100;
      const rawSeedYear = payload?.currentRemainingVacationYear;
      const parsedSeedYear = Number(rawSeedYear || new Date().getFullYear());
      vacationBalanceSeedYear =
        Number.isInteger(parsedSeedYear) && parsedSeedYear >= 2000 && parsedSeedYear <= 3000
          ? parsedSeedYear
          : Number(new Date().getFullYear());
      vacationBalanceSeedDate = normalizeDateOnly(payload?.currentRemainingVacationSetOn) || new Date().toISOString().slice(0, 10);
    } else {
      vacationBalanceSeed = null;
      vacationBalanceSeedYear = null;
      vacationBalanceSeedDate = null;
    }
  }

  await ensureEmployeeContractTerminationColumns();
  const effectiveActiveSql = buildEmployeeEffectiveActiveSql('e');
  const res = await query(
    `WITH updated_employee AS (
       UPDATE employees
       SET vacation_days_override = $2,
           vacation_days_override_year = $3,
           vacation_balance_seed = CASE WHEN $4::boolean THEN $5 ELSE vacation_balance_seed END,
           vacation_balance_seed_year = CASE WHEN $4::boolean THEN $6 ELSE vacation_balance_seed_year END,
           vacation_balance_seed_date = CASE WHEN $4::boolean THEN $7 ELSE vacation_balance_seed_date END,
           updated_at = NOW()
       WHERE employee_id = $1 OR id::text = $1 OR kenjo_user_id = $1
          OR pn = $1
       RETURNING *
     )
     SELECT
       e.id,
       e.employee_id,
       e.pn,
       e.first_name,
       e.last_name,
       e.display_name,
       e.email,
       e.phone,
       e.start_date,
       e.contract_end,
       e.transporter_id,
       e.kenjo_user_id,
       e.vacation_days_override,
       e.vacation_days_override_year,
       e.vacation_days_override AS total_year_vacation,
       e.vacation_days_override_year AS total_year_vacation_year,
       e.vacation_balance_seed AS current_remaining_vacation,
       e.vacation_balance_seed_year AS current_remaining_vacation_year,
       e.vacation_balance_seed_date AS current_remaining_vacation_set_on,
       employee_contract_state.latest_termination_date,
       ${effectiveActiveSql} AS is_active
     FROM updated_employee e
     ${buildEmployeeTerminationJoin('e')}
     LIMIT 1`,
    [
      id,
      vacationDaysOverride,
      vacationDaysOverrideYear,
      hasCurrentRemainingVacation,
      vacationBalanceSeed,
      vacationBalanceSeedYear,
      vacationBalanceSeedDate,
    ]
  );
  return res.rows[0] || null;
}

async function resolveEmployeeRefs(employeeRef) {
  const ref = String(employeeRef || '').trim();
  if (!ref) return [];

  const refs = new Set([ref]);

  const employeesRes = await query(
    `SELECT id::text AS id_text, employee_id, kenjo_user_id, pn, transporter_id
     FROM employees
     WHERE employee_id = $1 OR id::text = $1 OR kenjo_user_id = $1 OR pn = $1`,
    [ref]
  ).catch(() => ({ rows: [] }));

  for (const row of employeesRes.rows || []) {
    const values = [row.id_text, row.employee_id, row.kenjo_user_id, row.pn, row.transporter_id];
    for (const value of values) {
      const normalized = String(value || '').trim();
      if (normalized) refs.add(normalized);
    }
  }

  const kenjoRes = await query(
    `SELECT kenjo_user_id, employee_number, transporter_id
     FROM kenjo_employees
     WHERE kenjo_user_id = $1 OR employee_number = $1 OR transporter_id = $1`,
    [ref]
  ).catch(() => ({ rows: [] }));

  for (const row of kenjoRes.rows || []) {
    for (const value of [row.kenjo_user_id, row.employee_number, row.transporter_id]) {
      const normalized = String(value || '').trim();
      if (normalized) refs.add(normalized);
    }
  }

  return [...refs];
}

async function resolveEmployeeRescueTarget(employeeRef) {
  const ref = String(employeeRef || '').trim();
  const refs = await resolveEmployeeRefs(ref);
  const allRefs = [...new Set([ref, ...refs].filter(Boolean))];
  let kenjoEmployeeId = '';
  let employeeRow = null;
  if (allRefs.length) {
    const res = await query(
      `SELECT id::text AS id_text, employee_id, kenjo_user_id, pn, transporter_id, first_name, last_name, display_name
       FROM employees
       WHERE employee_id = ANY($1::text[])
          OR id::text = ANY($1::text[])
          OR kenjo_user_id = ANY($1::text[])
          OR pn = ANY($1::text[])
       ORDER BY CASE WHEN kenjo_user_id IS NOT NULL AND kenjo_user_id <> '' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [allRefs]
    ).catch(() => ({ rows: [] }));
    employeeRow = res.rows?.[0] || null;
    kenjoEmployeeId = String(employeeRow?.kenjo_user_id || '').trim();
  }
  if (!kenjoEmployeeId) {
    const candidateRefs = [...new Set([
      ...allRefs,
      employeeRow?.pn,
      employeeRow?.transporter_id,
    ].map((item) => String(item || '').trim()).filter(Boolean))];

    if (candidateRefs.length) {
      const kenjoRes = await query(
        `SELECT kenjo_user_id, employee_number, transporter_id
         FROM kenjo_employees
         WHERE kenjo_user_id = ANY($1::text[])
            OR employee_number = ANY($1::text[])
            OR transporter_id = ANY($1::text[])
         ORDER BY CASE
           WHEN employee_number = ANY($1::text[]) THEN 0
           WHEN transporter_id = ANY($1::text[]) THEN 1
           WHEN kenjo_user_id = ANY($1::text[]) THEN 2
           ELSE 3
         END, kenjo_user_id ASC
         LIMIT 1`,
        [candidateRefs]
      ).catch(() => ({ rows: [] }));
      kenjoEmployeeId = String(kenjoRes.rows?.[0]?.kenjo_user_id || '').trim();
    }
  }
  if (!kenjoEmployeeId && looksLikeKenjoId(ref)) {
    kenjoEmployeeId = ref;
  }
  return {
    employeeRef: ref,
    refs: allRefs,
    kenjoEmployeeId,
  };
}

async function listEmployeeDocuments(employeeRef) {
  await ensureEmployeeDocumentsTable();
  const refs = await resolveEmployeeRefs(employeeRef);
  if (!refs.length) return [];
  const res = await query(
    `SELECT id, employee_ref, document_type, file_name, mime_type, import_group_id, import_source_key, import_source_name, created_at
     FROM employee_documents
     WHERE employee_ref = ANY($1::text[])
     ORDER BY created_at DESC, id DESC`,
    [refs]
  );
  return res.rows || [];
}

function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.includes('T') ? raw.slice(0, 10) : raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function normalizeDbDateOutput(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return normalizeDateOnly(value);
}

function normalizeTimeOffType(typeId, typeName) {
  const id = String(typeId || '').trim();
  if (id === '685e7223e6bac64cb0a27e38') return 'vacation';
  if (id === '685e7223e6bac64cb0a27e39') return 'sick';
  const normalizedName = String(typeName || '').trim().toLowerCase();
  if (normalizedName.includes('sick') || normalizedName.includes('krank')) {
    return 'sick';
  }
  if (normalizedName.includes('vacation') || normalizedName.includes('urlaub') || normalizedName.includes('holiday')) {
    return 'vacation';
  }
  return null;
}

function normalizeTimeOffStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isApprovedTimeOffStatus(status) {
  const normalized = normalizeTimeOffStatus(status);
  return normalized === 'processed' || normalized === 'approved' || normalized === 'accepted';
}

function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatUtcIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getBavariaHolidaySet(year) {
  const easterSunday = getEasterSunday(year);
  return new Set([
    `${year}-01-01`,
    `${year}-01-06`,
    `${year}-05-01`,
    `${year}-08-15`,
    `${year}-10-03`,
    `${year}-11-01`,
    `${year}-12-25`,
    `${year}-12-26`,
    formatUtcIsoDate(addUtcDays(easterSunday, -2)),
    formatUtcIsoDate(addUtcDays(easterSunday, 1)),
    formatUtcIsoDate(addUtcDays(easterSunday, 39)),
    formatUtcIsoDate(addUtcDays(easterSunday, 50)),
    formatUtcIsoDate(addUtcDays(easterSunday, 60)),
  ]);
}

function countBusinessDaysExcludingBavariaHolidays(startIso, endIso, holidaySet) {
  const start = normalizeDateOnly(startIso);
  const end = normalizeDateOnly(endIso);
  if (!start || !end || start > end) return 0;
  let count = 0;
  const cursor = new Date(`${start}T12:00:00Z`);
  const limit = new Date(`${end}T12:00:00Z`);
  while (cursor <= limit) {
    const iso = cursor.toISOString().slice(0, 10);
    const day = cursor.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    if (!isWeekend && !holidaySet.has(iso)) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function countVacationDaysInRange(rows, rangeStart, rangeEnd, holidaySet) {
  let total = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (normalizeTimeOffType(row?.time_off_type, row?.time_off_type_name) !== 'vacation') continue;
    if (!isApprovedTimeOffStatus(row?.status)) continue;
    const start = normalizeDateOnly(row?.start_date);
    const end = normalizeDateOnly(row?.end_date);
    if (!start || !end) continue;
    const effectiveStart = start > rangeStart ? start : rangeStart;
    const effectiveEnd = end < rangeEnd ? end : rangeEnd;
    if (effectiveStart > effectiveEnd) continue;
    total += countBusinessDaysExcludingBavariaHolidays(effectiveStart, effectiveEnd, holidaySet);
  }
  return total;
}

function countWeekdaysInclusive(startIso, endIso) {
  const start = normalizeDateOnly(startIso);
  const end = normalizeDateOnly(endIso);
  if (!start || !end || start > end) return 0;
  let count = 0;
  const cursor = new Date(`${start}T12:00:00Z`);
  const limit = new Date(`${end}T12:00:00Z`);
  while (cursor <= limit) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function getMonthBounds(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to, monthKey: `${year}-${String(month).padStart(2, '0')}` };
}

async function buildKenjoTimeOffNameMap() {
  const users = await getKenjoUsersList().catch(() => []);
  const map = new Map();
  for (const user of users || []) {
    const id = String(user?._id || user?.id || '').trim();
    if (!id) continue;
    const displayName =
      String(
        user?.displayName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ')
      ).trim();
    if (displayName) {
      map.set(id, displayName);
    }
  }
  return map;
}

async function syncKenjoTimeOffMonthToCache(year, month, nameById = null) {
  await ensureKenjoTimeOffTable();
  await ensureKenjoTimeOffSyncLogTable();
  const { from, to, monthKey } = getMonthBounds(year, month);
  const resolvedNameById = nameById instanceof Map ? nameById : await buildKenjoTimeOffNameMap();
  await query(
    `DELETE FROM kenjo_time_off
     WHERE start_date <= $2::date AND end_date >= $1::date`,
    [from, to]
  );
  const list = await getTimeOffRequests(from, to);
  for (const item of list || []) {
    const reqId = String(item._id || item.id || '').trim();
    if (!reqId) continue;
    const userId = String(item._userId ?? item.userId ?? item.user_id ?? '').trim() || null;
    const employeeName = (userId && resolvedNameById.get(userId)) || null;
    const startDate = normalizeDateOnly(item.from ?? item.startDate ?? item.start);
    const endDate = normalizeDateOnly(item.to ?? item.endDate ?? item.end);
    const typeId = String(item._timeOffTypeId ?? item.timeOffTypeId ?? item.time_off_type_id ?? item.type ?? '').trim() || null;
    const typeName = String(item._timeOffType?.name ?? item.timeOffTypeName ?? item.time_off_type_name ?? item.typeName ?? item.type ?? item.description ?? '').trim() || null;
    const status = String(item.status ?? '').trim() || null;
    const partFrom = item.partOfDayFrom ?? item.part_of_day_from ?? null;
    const partTo = item.partOfDayTo ?? item.part_of_day_to ?? null;
    await query(
      `INSERT INTO kenjo_time_off (
        kenjo_request_id, kenjo_user_id, employee_name, start_date, end_date,
        time_off_type, time_off_type_name, status, part_of_day_from, part_of_day_to, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (kenjo_request_id) DO UPDATE SET
        kenjo_user_id = EXCLUDED.kenjo_user_id,
        employee_name = EXCLUDED.employee_name,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        time_off_type = EXCLUDED.time_off_type,
        time_off_type_name = EXCLUDED.time_off_type_name,
        status = EXCLUDED.status,
        part_of_day_from = EXCLUDED.part_of_day_from,
        part_of_day_to = EXCLUDED.part_of_day_to,
        synced_at = NOW()`,
      [reqId, userId, employeeName, startDate, endDate, typeId, typeName, status, partFrom, partTo]
    );
  }
  await query(
    `INSERT INTO kenjo_time_off_sync_log (sync_key, period_month, synced_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (sync_key) DO UPDATE SET synced_at = NOW(), period_month = EXCLUDED.period_month`,
    [monthKey, monthKey]
  );
}

async function ensureEmployeeTimeOffYearCache(target, year) {
  await ensureKenjoTimeOffTable();
  await ensureKenjoTimeOffSyncLogTable();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const lastMonth = year === currentYear ? currentMonth : 12;
  const nameById = await buildKenjoTimeOffNameMap();

  const syncLogRes = await query(
    `SELECT sync_key, synced_at
     FROM kenjo_time_off_sync_log
     WHERE period_month >= $1 AND period_month <= $2`,
    [`${year}-01`, `${year}-12`]
  ).catch(() => ({ rows: [] }));
  const syncedKeys = new Set((syncLogRes.rows || []).map((row) => String(row.sync_key || '').trim()));

  for (let month = 1; month <= lastMonth; month += 1) {
    const { monthKey } = getMonthBounds(year, month);
    const shouldRefreshCurrentMonth = year === currentYear && month === currentMonth;
    if (!shouldRefreshCurrentMonth && syncedKeys.has(monthKey)) continue;
    await syncKenjoTimeOffMonthToCache(year, month, nameById);
  }
}

async function loadEmployeeYearTimeOffRows(
  target,
  selectedYear,
  { forceRefreshOnEmpty = false, forceResyncAllMonths = false } = {}
) {
  await ensureEmployeeTimeOffYearCache(target, selectedYear);

  async function queryRows() {
    const res = await query(
      `SELECT kenjo_request_id, start_date, end_date, time_off_type, time_off_type_name, status
              , kenjo_user_id, employee_name
       FROM kenjo_time_off
       WHERE start_date <= $2::date
         AND end_date >= $1::date
       ORDER BY start_date DESC, end_date DESC, kenjo_request_id DESC`,
      [`${selectedYear}-01-01`, `${selectedYear}-12-31`]
    ).catch(() => ({ rows: [] }));
    return res.rows || [];
  }

  let rows = await queryRows();
  if ((!rows.length && forceRefreshOnEmpty) || forceResyncAllMonths) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const lastMonth = selectedYear === currentYear ? now.getMonth() + 1 : 12;
    const nameById = await buildKenjoTimeOffNameMap();
    for (let month = 1; month <= lastMonth; month += 1) {
      await syncKenjoTimeOffMonthToCache(selectedYear, month, nameById);
    }
    rows = await queryRows();
  }

  return rows;
}

async function buildEmployeeTimeOffNameCandidates(employee, target) {
  const names = new Set();
  const addName = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) names.add(normalized);
  };

  addName(employee?.display_name);
  addName([employee?.first_name, employee?.last_name].filter(Boolean).join(' '));

  const refs = [...new Set([
    String(target?.kenjoEmployeeId || '').trim(),
    ...(Array.isArray(target?.refs) ? target.refs : []),
  ].map((item) => String(item || '').trim()).filter(Boolean))];

  if (refs.length) {
    const res = await query(
      `SELECT display_name, first_name, last_name
       FROM kenjo_employees
       WHERE kenjo_user_id = ANY($1::text[])
          OR employee_number = ANY($1::text[])
          OR transporter_id = ANY($1::text[])`,
      [refs]
    ).catch(() => ({ rows: [] }));
    for (const row of res.rows || []) {
      addName(row.display_name);
      addName([row.first_name, row.last_name].filter(Boolean).join(' '));
    }
  }

  return names;
}

function filterEmployeeTimeOffRows(rows, target, nameCandidates) {
  return (rows || []).filter((row) => {
    const rowUserId = String(row?.kenjo_user_id || '').trim();
    if (target?.kenjoEmployeeId && rowUserId && rowUserId === target.kenjoEmployeeId) return true;
    const rowName = String(row?.employee_name || '').trim().toLowerCase();
    return !!rowName && nameCandidates.has(rowName);
  });
}

function sortEmployeeContractRows(rows = []) {
  return [...rows].sort((a, b) => {
    const startA = normalizeDateOnly(a?.start_date) || '9999-12-31';
    const startB = normalizeDateOnly(b?.start_date) || '9999-12-31';
    if (startA !== startB) return startA.localeCompare(startB);

    const endA = normalizeDateOnly(a?.end_date) || '9999-12-31';
    const endB = normalizeDateOnly(b?.end_date) || '9999-12-31';
    if (endA !== endB) return endA.localeCompare(endB);

    return String(a?.row_key || a?.id || '').localeCompare(String(b?.row_key || b?.id || ''));
  });
}

async function listEmployeeContractExtensions(employeeRef) {
  await ensureEmployeeContractExtensionsTable();
  const refs = await resolveEmployeeRefs(employeeRef);
  if (!refs.length) return [];
  const res = await query(
    `SELECT id, employee_ref, extension_index, start_date, end_date, created_at, updated_at
     FROM employee_contract_extensions
     WHERE employee_ref = ANY($1::text[])
     ORDER BY extension_index ASC, created_at ASC, id ASC`,
    [refs]
  );
  return res.rows || [];
}

async function addEmployeeContractExtension(employeeRef, { startDate, endDate }) {
  await ensureEmployeeContractExtensionsTable();
  const ref = String(employeeRef || '').trim();
  if (!ref) throw new Error('employee_ref is required');
  const normalizedStartDate = normalizeDateOnly(startDate);
  const normalizedEndDate = normalizeDateOnly(endDate);
  if (!normalizedStartDate || !normalizedEndDate) {
    throw new Error('Valid start and end dates are required');
  }
  if (normalizedStartDate > normalizedEndDate) {
    throw new Error('End date must be on or after start date');
  }
  const refs = await resolveEmployeeRefs(ref);
  const allRefs = [...new Set([ref, ...refs])];
  const existing = await query(
    `SELECT id, extension_index
     FROM employee_contract_extensions
     WHERE employee_ref = ANY($1::text[])
     ORDER BY extension_index ASC, id ASC`,
    [allRefs]
  );
  const usedIndexes = new Set((existing.rows || []).map((row) => Number(row.extension_index)).filter(Number.isFinite));
  const nextIndex = usedIndexes.has(1) ? (usedIndexes.has(2) ? null : 2) : 1;
  if (!nextIndex) {
    throw new Error('Only two contract extensions can be added');
  }
  const res = await query(
    `INSERT INTO employee_contract_extensions (employee_ref, extension_index, start_date, end_date, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, employee_ref, extension_index, start_date, end_date, created_at, updated_at`,
    [ref, nextIndex, normalizedStartDate, normalizedEndDate]
  );
  return res.rows[0] || null;
}

async function listEmployeeContracts(employeeRef) {
  await ensureEmployeeContractsTable();
  await ensureEmployeeContractTerminationColumns();
  await ensureEmployeeContractExtensionsTable();
  const target = await resolveEmployeeRescueTarget(employeeRef);

  const params = [];
  const where = [];
  if (target.refs.length) {
    params.push(target.refs);
    where.push(`employee_ref = ANY($${params.length}::text[])`);
  }
  if (target.kenjoEmployeeId) {
    params.push(target.kenjoEmployeeId);
    where.push(`kenjo_employee_id = $${params.length}`);
  }

  let historyRows = [];
  if (where.length) {
    const res = await query(
      `SELECT id, employee_ref, kenjo_employee_id, start_date, end_date, termination_date, termination_type, termination_initiator, termination_document_id, termination_document_name, created_at, updated_at
       FROM employee_contracts
       WHERE ${where.join(' OR ')}
       ORDER BY start_date ASC, end_date ASC NULLS LAST, id ASC`,
      params
    );
    historyRows = (res.rows || []).map((row) => ({
      id: row.id,
      row_key: `history-${row.id}`,
      source: 'history',
      employee_ref: String(row.employee_ref || '').trim() || null,
      kenjo_employee_id: String(row.kenjo_employee_id || '').trim() || null,
      start_date: normalizeDbDateOutput(row.start_date),
      end_date: normalizeDbDateOutput(row.end_date),
      termination_date: normalizeDbDateOutput(row.termination_date),
      termination_type: String(row.termination_type || '').trim() || null,
      termination_initiator: String(row.termination_initiator || '').trim() || null,
      termination_document_id: row.termination_document_id == null ? null : Number(row.termination_document_id),
      termination_document_name: String(row.termination_document_name || '').trim() || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  const historyKeys = new Set(
    historyRows.map((row) => `${normalizeDateOnly(row.start_date) || ''}|${normalizeDateOnly(row.end_date) || ''}`)
  );
  const legacyExtensions = await listEmployeeContractExtensions(employeeRef);
  const legacyRows = (legacyExtensions || [])
    .filter((row) => !historyKeys.has(`${normalizeDateOnly(row.start_date) || ''}|${normalizeDateOnly(row.end_date) || ''}`))
    .map((row) => ({
      id: row.id,
      row_key: `legacy-extension-${row.id}`,
      source: 'legacy_extension',
      employee_ref: String(row.employee_ref || '').trim() || null,
      kenjo_employee_id: target.kenjoEmployeeId || null,
      start_date: normalizeDbDateOutput(row.start_date),
      end_date: normalizeDbDateOutput(row.end_date),
      termination_date: null,
      termination_type: null,
      termination_initiator: null,
      termination_document_id: null,
      termination_document_name: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

  return sortEmployeeContractRows([...historyRows, ...legacyRows]);
}

async function addEmployeeContract(employeeRef, { startDate, endDate }) {
  await ensureEmployeeContractsTable();
  await ensureEmployeeContractTerminationColumns();
  const ref = String(employeeRef || '').trim();
  if (!ref) throw new Error('employee_ref is required');

  const normalizedStartDate = normalizeDateOnly(startDate);
  const normalizedEndDate = endDate == null || endDate === '' ? null : normalizeDateOnly(endDate);

  if (!normalizedStartDate) {
    throw new Error('Valid start date is required');
  }
  if (normalizedEndDate && normalizedStartDate > normalizedEndDate) {
    throw new Error('End date must be on or after start date');
  }

  const target = await resolveEmployeeRescueTarget(ref);
  const res = await query(
    `INSERT INTO employee_contracts (employee_ref, kenjo_employee_id, start_date, end_date, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, employee_ref, kenjo_employee_id, start_date, end_date, termination_date, termination_type, termination_initiator, termination_document_id, termination_document_name, created_at, updated_at`,
    [ref, target.kenjoEmployeeId || null, normalizedStartDate, normalizedEndDate]
  );

  const row = res.rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    row_key: `history-${row.id}`,
    source: 'history',
    employee_ref: String(row.employee_ref || '').trim() || null,
    kenjo_employee_id: String(row.kenjo_employee_id || '').trim() || null,
    start_date: normalizeDbDateOutput(row.start_date),
    end_date: normalizeDbDateOutput(row.end_date),
    termination_date: normalizeDbDateOutput(row.termination_date),
    termination_type: String(row.termination_type || '').trim() || null,
    termination_initiator: String(row.termination_initiator || '').trim() || null,
    termination_document_id: row.termination_document_id == null ? null : Number(row.termination_document_id),
    termination_document_name: String(row.termination_document_name || '').trim() || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function terminateEmployeeContract(
  employeeRef,
  { contractStartDate, contractEndDate, terminationDate, terminationType, terminationInitiator, documentFile }
) {
  await ensureEmployeeContractsTable();
  await ensureEmployeeContractTerminationColumns();
  await ensureEmployeeDocumentsTable();

  const ref = String(employeeRef || '').trim();
  if (!ref) throw new Error('employee_ref is required');

  const normalizedStartDate = normalizeDateOnly(contractStartDate);
  const normalizedContractEndDate = contractEndDate == null || contractEndDate === '' ? null : normalizeDateOnly(contractEndDate);
  const normalizedTerminationDate = normalizeDateOnly(terminationDate);
  const normalizedTerminationType = String(terminationType || '').trim().toLowerCase();
  const normalizedTerminationInitiator = String(terminationInitiator || '').trim().toLowerCase() || null;

  if (!normalizedStartDate) throw new Error('Valid contract start date is required');
  if (!normalizedTerminationDate) throw new Error('Valid termination date is required');
  if (!['mutual', 'ordinary', 'extraordinary'].includes(normalizedTerminationType)) {
    throw new Error('Valid termination type is required');
  }
  if (normalizedTerminationType === 'ordinary' && !['employer', 'employee'].includes(normalizedTerminationInitiator || '')) {
    throw new Error('Valid ordinary termination initiator is required');
  }
  if (normalizedTerminationDate < normalizedStartDate) {
    throw new Error('Termination date must be on or after contract start date');
  }
  if (normalizedContractEndDate && normalizedTerminationDate > normalizedContractEndDate) {
    throw new Error('Termination date must not be after contract end date');
  }

  const target = await resolveEmployeeRescueTarget(ref);
  const refs = [...new Set([ref, ...(target.refs || [])].filter(Boolean))];
  const matchParams = [normalizedStartDate, normalizedContractEndDate];
  const matchWhere = [
    `start_date = $1`,
    normalizedContractEndDate == null ? `end_date IS NULL` : `end_date = $2`,
  ];
  if (refs.length) {
    matchParams.push(refs);
    matchWhere.push(`employee_ref = ANY($${matchParams.length}::text[])`);
  }
  if (target.kenjoEmployeeId) {
    matchParams.push(target.kenjoEmployeeId);
    matchWhere.push(`kenjo_employee_id = $${matchParams.length}`);
  }

  const existing = await query(
    `SELECT id
     FROM employee_contracts
     WHERE ${matchWhere[0]} AND ${matchWhere[1]} AND (${matchWhere.slice(2).join(' OR ')})
     ORDER BY id ASC
     LIMIT 1`,
    matchParams
  ).catch(() => ({ rows: [] }));

  let documentId = null;
  let documentName = null;
  if (documentFile?.fileContent) {
    const importSourceKey = `contract-termination:${ref}:${normalizedStartDate}:${normalizedTerminationDate}:${Date.now()}`;
    const docRow = await addEmployeeDocument(ref, {
      documentType: 'Vertrag',
      fileName: documentFile.fileName || 'termination-document.bin',
      mimeType: documentFile.mimeType || 'application/octet-stream',
      fileContent: documentFile.fileContent,
      importSourceKey,
      importSourceName: 'contract_termination',
    });
    documentId = docRow?.id == null ? null : Number(docRow.id);
    documentName = String(docRow?.file_name || '').trim() || null;
  }

  const persisted = existing.rows?.[0]
    ? await query(
        `UPDATE employee_contracts
         SET termination_date = $2,
             termination_type = $3,
             termination_initiator = $4,
             termination_document_id = COALESCE($5, termination_document_id),
             termination_document_name = COALESCE($6, termination_document_name),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, employee_ref, kenjo_employee_id, start_date, end_date, termination_date, termination_type, termination_initiator, termination_document_id, termination_document_name, created_at, updated_at`,
        [
          existing.rows[0].id,
          normalizedTerminationDate,
          normalizedTerminationType,
          normalizedTerminationType === 'ordinary' ? normalizedTerminationInitiator : null,
          documentId,
          documentName,
        ]
      )
    : await query(
        `INSERT INTO employee_contracts (
           employee_ref,
           kenjo_employee_id,
           start_date,
           end_date,
           termination_date,
           termination_type,
           termination_initiator,
           termination_document_id,
           termination_document_name,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING id, employee_ref, kenjo_employee_id, start_date, end_date, termination_date, termination_type, termination_initiator, termination_document_id, termination_document_name, created_at, updated_at`,
        [
          ref,
          target.kenjoEmployeeId || null,
          normalizedStartDate,
          normalizedContractEndDate,
          normalizedTerminationDate,
          normalizedTerminationType,
          normalizedTerminationType === 'ordinary' ? normalizedTerminationInitiator : null,
          documentId,
          documentName,
        ]
      );

  await updateEmployeeEffectiveContractState(ref, normalizedTerminationDate);

  const row = persisted.rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    row_key: `history-${row.id}`,
    source: 'history',
    employee_ref: String(row.employee_ref || '').trim() || null,
    kenjo_employee_id: String(row.kenjo_employee_id || '').trim() || null,
    start_date: normalizeDbDateOutput(row.start_date),
    end_date: normalizeDbDateOutput(row.end_date),
    termination_date: normalizeDbDateOutput(row.termination_date),
    termination_type: String(row.termination_type || '').trim() || null,
    termination_initiator: String(row.termination_initiator || '').trim() || null,
    termination_document_id: row.termination_document_id == null ? null : Number(row.termination_document_id),
    termination_document_name: String(row.termination_document_name || '').trim() || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function updateEmployeeEffectiveContractState(employeeRef, terminationDate) {
  const normalizedTerminationDate = normalizeDateOnly(terminationDate);
  if (!normalizedTerminationDate) return;

  const refs = await resolveEmployeeRefs(employeeRef);
  const allRefs = [...new Set([String(employeeRef || '').trim(), ...refs].filter(Boolean))];
  if (!allRefs.length) return;

  await query(
    `UPDATE employees
     SET contract_end = $2,
         is_active = CASE
           WHEN $2::date <= CURRENT_DATE THEN FALSE
           ELSE is_active
         END,
         updated_at = NOW()
     WHERE employee_id = ANY($1::text[])
        OR id::text = ANY($1::text[])
        OR kenjo_user_id = ANY($1::text[])`,
    [allRefs, normalizedTerminationDate]
  ).catch(() => null);
}

async function getEmployeeVacationSummary(employeeRef, yearValue) {
  await ensureEmployeeVacationColumns();
  const year = Number(yearValue || new Date().getFullYear());
  const selectedYear =
    Number.isInteger(year) && year >= 2000 && year <= 3000
      ? year
      : new Date().getFullYear();

  const employee = await getEmployeeById(employeeRef);
  const target = await resolveEmployeeRescueTarget(employeeRef);
  const nameCandidates = await buildEmployeeTimeOffNameCandidates(employee, target);
  let rows = filterEmployeeTimeOffRows(
    await loadEmployeeYearTimeOffRows(target, selectedYear),
    target,
    nameCandidates
  );
  if (!rows.length) {
    rows = filterEmployeeTimeOffRows(
      await loadEmployeeYearTimeOffRows(target, selectedYear, { forceRefreshOnEmpty: true, forceResyncAllMonths: true }),
      target,
      nameCandidates
    );
  }

  const holidaySet = getBavariaHolidaySet(selectedYear);
  const approvedVacationDaysYear = countVacationDaysInRange(
    rows,
    `${selectedYear}-01-01`,
    `${selectedYear}-12-31`,
    holidaySet
  );
  const approvedVacationDaysUntilMarch31 = countVacationDaysInRange(
    rows,
    `${selectedYear}-01-01`,
    `${selectedYear}-03-31`,
    holidaySet
  );

  const storedTotalYearVacation =
    employee?.vacation_days_override_year === selectedYear
      ? Number(employee?.vacation_days_override)
      : null;
  const currentRemainingSeed =
    employee?.current_remaining_vacation_year === selectedYear
      ? Number(employee?.current_remaining_vacation)
      : null;
  const currentRemainingSeedDate =
    employee?.current_remaining_vacation_year === selectedYear
      ? normalizeDateOnly(employee?.current_remaining_vacation_set_on)
      : null;
  const approvedVacationDaysAfterSeed =
    currentRemainingSeed != null && currentRemainingSeedDate
      ? countVacationDaysInRange(
          rows,
          currentRemainingSeedDate,
          `${selectedYear}-12-31`,
          holidaySet
        )
      : 0;

  return {
    year: selectedYear,
    total_year_vacation:
      storedTotalYearVacation != null && Number.isFinite(storedTotalYearVacation)
        ? Math.round(storedTotalYearVacation * 100) / 100
        : null,
    total_year_vacation_year: employee?.vacation_days_override_year ?? null,
    current_remaining_vacation_seed:
      currentRemainingSeed != null && Number.isFinite(currentRemainingSeed)
        ? Math.round(currentRemainingSeed * 100) / 100
        : null,
    current_remaining_vacation_seed_date: currentRemainingSeedDate,
    approved_vacation_days_after_seed: approvedVacationDaysAfterSeed,
    approved_vacation_days_year: approvedVacationDaysYear,
    approved_vacation_days_until_march_31: approvedVacationDaysUntilMarch31,
    default_total_year_vacation: 20,
  };
}

async function getEmployeeTimeOffHistory(employeeRef, type, yearValue) {
  await ensureEmployeeVacationColumns();
  const normalizedType = String(type || '').trim().toLowerCase();
  if (!['vacation', 'sick'].includes(normalizedType)) {
    throw new Error('Valid time off history type is required');
  }
  const year = Number(yearValue || new Date().getFullYear());
  const selectedYear =
    Number.isInteger(year) && year >= 2000 && year <= 3000
      ? year
      : new Date().getFullYear();
  const target = await resolveEmployeeRescueTarget(employeeRef);
  const employee = await getEmployeeById(employeeRef);
  const nameCandidates = await buildEmployeeTimeOffNameCandidates(employee, target);
  let rows = filterEmployeeTimeOffRows(
    await loadEmployeeYearTimeOffRows(target, selectedYear),
    target,
    nameCandidates
  );
  if (!rows.length) {
    rows = filterEmployeeTimeOffRows(
      await loadEmployeeYearTimeOffRows(target, selectedYear, { forceRefreshOnEmpty: true, forceResyncAllMonths: true }),
      target,
      nameCandidates
    );
  }
  rows = rows
    .filter((row) => {
      if (!isApprovedTimeOffStatus(row?.status)) return false;
      const typeKey = normalizeTimeOffType(row?.time_off_type, row?.time_off_type_name);
      if (normalizedType === 'vacation') return typeKey === 'vacation';
      return typeKey === 'sick';
    })
    .map((row) => {
      const startDate = normalizeDbDateOutput(row.start_date);
      const endDate = normalizeDbDateOutput(row.end_date);
      const rangeStart = startDate < `${selectedYear}-01-01` ? `${selectedYear}-01-01` : startDate;
      const rangeEnd = endDate > `${selectedYear}-12-31` ? `${selectedYear}-12-31` : endDate;
      return {
        id: String(row.kenjo_request_id || `${startDate}-${endDate}`),
        start_date: startDate,
        end_date: endDate,
        working_days: countWeekdaysInclusive(rangeStart, rangeEnd),
        status: String(row.status || '').trim() || null,
        type_name: String(row.time_off_type_name || '').trim() || null,
      };
    });

  return { year: selectedYear, type: normalizedType, rows };
}

async function listEmployeeRescues(employeeRef) {
  await ensureEmployeeRescuesTable();
  const target = await resolveEmployeeRescueTarget(employeeRef);
  if (!target.refs.length && !target.kenjoEmployeeId) return [];
  const params = [];
  const where = [];
  if (target.refs.length) {
    params.push(target.refs);
    where.push(`employee_ref = ANY($${params.length}::text[])`);
  }
  if (target.kenjoEmployeeId) {
    params.push(target.kenjoEmployeeId);
    where.push(`kenjo_employee_id = $${params.length}`);
  }
  const res = await query(
    `SELECT id, employee_ref, kenjo_employee_id, rescue_date, amount, created_at
     FROM employee_rescues
     WHERE ${where.join(' OR ')}
     ORDER BY rescue_date DESC, id DESC`,
    params
  );
  return (res.rows || []).map((row) => ({
    ...row,
    rescue_date: normalizeDbDateOutput(row.rescue_date),
  }));
}

async function addEmployeeRescue(employeeRef, { rescueDate }) {
  await ensureEmployeeRescuesTable();
  const target = await resolveEmployeeRescueTarget(employeeRef);
  const ref = String(target.employeeRef || '').trim();
  const normalizedDate = normalizeDateOnly(rescueDate);
  if (!ref) throw new Error('employee_ref is required');
  if (!normalizedDate) throw new Error('Valid rescue date is required');
  let rescueAmount = 20;
  try {
    const configured = await settingsService.getSetting('payroll', 'payroll_rescue_bonus_eur');
    const parsed = Number(configured);
    if (Number.isFinite(parsed) && parsed >= 0) {
      rescueAmount = Math.round(parsed * 100) / 100;
    }
  } catch (_) {}
  const res = await query(
    `INSERT INTO employee_rescues (employee_ref, kenjo_employee_id, rescue_date, amount)
     VALUES ($1, $2, $3, $4)
     RETURNING id, employee_ref, kenjo_employee_id, rescue_date, amount, created_at`,
    [ref, target.kenjoEmployeeId || null, normalizedDate, rescueAmount]
  );
  const row = res.rows[0] || null;
  return row
    ? {
        ...row,
        rescue_date: normalizeDbDateOutput(row.rescue_date),
      }
    : null;
}

async function deleteEmployeeRescue(employeeRef, rescueId) {
  await ensureEmployeeRescuesTable();
  const id = Number(rescueId);
  if (!Number.isFinite(id)) return false;
  const target = await resolveEmployeeRescueTarget(employeeRef);
  const params = [id];
  const where = [`id = $1`];
  if (target.refs.length) {
    params.push(target.refs);
    where.push(`employee_ref = ANY($${params.length}::text[])`);
  }
  if (target.kenjoEmployeeId) {
    params.push(target.kenjoEmployeeId);
    where.push(`kenjo_employee_id = $${params.length}`);
  }
  const res = await query(
    `DELETE FROM employee_rescues
     WHERE ${where[0]} AND (${where.slice(1).join(' OR ')})`,
    params
  );
  return Number(res.rowCount || 0) > 0;
}

async function addEmployeeDocument(employeeRef, { documentType, fileName, mimeType, fileContent, importGroupId, importSourceKey, importSourceName }) {
  await ensureEmployeeDocumentsTable();
  const ref = String(employeeRef || '').trim();
  if (!ref) throw new Error('employee_ref is required');
  const res = await query(
    `INSERT INTO employee_documents (employee_ref, document_type, file_name, mime_type, file_content, import_group_id, import_source_key, import_source_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, employee_ref, document_type, file_name, mime_type, import_group_id, import_source_key, import_source_name, created_at`,
    [
      ref,
      String(documentType || '').trim(),
      String(fileName || 'document.bin').trim(),
      mimeType || null,
      fileContent,
      String(importGroupId || '').trim() || null,
      String(importSourceKey || '').trim() || null,
      String(importSourceName || '').trim() || null,
    ]
  );
  return res.rows[0];
}

async function getEmployeeDocument(employeeRef, docId) {
  await ensureEmployeeDocumentsTable();
  const refs = await resolveEmployeeRefs(employeeRef);
  const id = Number(docId);
  if (!refs.length || !Number.isFinite(id)) return null;
  const res = await query(
    `SELECT id, employee_ref, document_type, file_name, mime_type, file_content, import_group_id, import_source_key, import_source_name, created_at
     FROM employee_documents
     WHERE employee_ref = ANY($1::text[]) AND id = $2
     LIMIT 1`,
    [refs, id]
  );
  return res.rows[0] || null;
}

async function deleteEmployeeDocument(employeeRef, docId) {
  await ensureEmployeeDocumentsTable();
  const refs = await resolveEmployeeRefs(employeeRef);
  const id = Number(docId);
  if (!refs.length || !Number.isFinite(id)) return false;
  const res = await query(
    `DELETE FROM employee_documents
     WHERE employee_ref = ANY($1::text[]) AND id = $2`,
    [refs, id]
  );
  return (res.rowCount || 0) > 0;
}

async function deleteEmployeeDocumentsBulk(employeeRef, docIds) {
  await ensureEmployeeDocumentsTable();
  const refs = await resolveEmployeeRefs(employeeRef);
  const ids = Array.isArray(docIds)
    ? [...new Set(docIds.map((value) => Number(value)).filter((value) => Number.isFinite(value)))]
    : [];
  if (!refs.length || !ids.length) return 0;
  const res = await query(
    `DELETE FROM employee_documents
     WHERE employee_ref = ANY($1::text[]) AND id = ANY($2::int[])`,
    [refs, ids]
  );
  return Number(res.rowCount || 0);
}

async function deleteImportedSourceDocuments(employeeRef, docId) {
  await ensureEmployeeDocumentsTable();
  const refs = await resolveEmployeeRefs(employeeRef);
  const id = Number(docId);
  if (!refs.length || !Number.isFinite(id)) {
    return { deleted: 0, importSourceKey: null, importSourceName: null };
  }

  const doc = await getEmployeeDocument(employeeRef, id);
  if (!doc) {
    return { deleted: 0, importSourceKey: null, importSourceName: null, notFound: true };
  }

  const importSourceKey = String(doc.import_source_key || '').trim();
  if (!importSourceKey) {
    return {
      deleted: 0,
      importSourceKey: null,
      importSourceName: String(doc.import_source_name || '').trim() || null,
      noImportSource: true,
    };
  }

  const res = await query(
    `DELETE FROM employee_documents
     WHERE import_source_key = $1`,
    [importSourceKey]
  );
  return {
    deleted: Number(res.rowCount || 0),
    importSourceKey,
    importSourceName: String(doc.import_source_name || '').trim() || null,
  };
}

const employeeService = {
  listEmployees,
  getEmployeeById,
  updateEmployeeLocalSettings,
  getEmployeeVacationSummary,
  getEmployeeTimeOffHistory,
  listEmployeeDocuments,
  listEmployeeRescues,
  listEmployeeContracts,
  listEmployeeContractExtensions,
  addEmployeeContract,
  terminateEmployeeContract,
  addEmployeeContractExtension,
  addEmployeeRescue,
  addEmployeeDocument,
  getEmployeeDocument,
  deleteEmployeeRescue,
  deleteEmployeeDocument,
  deleteEmployeeDocumentsBulk,
  deleteImportedSourceDocuments,
};

export default employeeService;
