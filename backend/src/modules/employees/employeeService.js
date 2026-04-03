import { query } from '../../db.js';
import settingsService from '../settings/settingsService.js';

let docsTableReady = false;
let contractExtensionsTableReady = false;
let rescueTableReady = false;
let employeeVacationColumnsReady = false;

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
  employeeVacationColumnsReady = true;
}

async function listEmployees({ search, onlyActive } = {}) {
  await ensureEmployeeVacationColumns();
  const params = [];
  const where = [];

  if (onlyActive) {
    params.push(true);
    where.push(`is_active = $${params.length}`);
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
      id,
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
      vacation_days_override,
      vacation_days_override_year,
      is_active
    FROM employees
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY is_active DESC, last_name ASC, first_name ASC
    LIMIT 500
  `;

  const res = await query(sql, params);
  return res.rows;
}

async function getEmployeeById(employeeId) {
  await ensureEmployeeVacationColumns();
  const res = await query(
    `SELECT
      id,
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
      vacation_days_override,
      vacation_days_override_year,
      is_active
     FROM employees
     WHERE employee_id = $1 OR id::text = $1 OR kenjo_user_id = $1
     LIMIT 1`,
    [String(employeeId)]
  );
  return res.rows[0] || null;
}

async function updateEmployeeLocalSettings(employeeId, payload = {}) {
  await ensureEmployeeVacationColumns();
  const id = String(employeeId || '').trim();
  if (!id) throw new Error('employee_id is required');

  if (!Object.prototype.hasOwnProperty.call(payload || {}, 'vacationDaysOverride')) {
    throw new Error('No supported local settings provided');
  }

  let vacationDaysOverride = null;
  let vacationDaysOverrideYear = null;
  const rawOverride = payload?.vacationDaysOverride;
  if (rawOverride !== '' && rawOverride != null) {
    const parsed = Number(rawOverride);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Vacation days override must be a non-negative number');
    }
    vacationDaysOverride = Math.round(parsed * 100) / 100;
    vacationDaysOverrideYear = Number(new Date().getFullYear());
  }

  const res = await query(
    `UPDATE employees
     SET vacation_days_override = $2,
         vacation_days_override_year = $3,
         updated_at = NOW()
     WHERE employee_id = $1 OR id::text = $1 OR kenjo_user_id = $1
     RETURNING
       id,
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
       vacation_days_override,
       vacation_days_override_year,
       is_active`,
    [id, vacationDaysOverride, vacationDaysOverrideYear]
  );
  return res.rows[0] || null;
}

async function resolveEmployeeRefs(employeeRef) {
  const ref = String(employeeRef || '').trim();
  if (!ref) return [];

  const refs = new Set([ref]);

  const employeesRes = await query(
    `SELECT id::text AS id_text, employee_id, kenjo_user_id
     FROM employees
     WHERE employee_id = $1 OR id::text = $1 OR kenjo_user_id = $1`,
    [ref]
  ).catch(() => ({ rows: [] }));

  for (const row of employeesRes.rows || []) {
    const values = [row.id_text, row.employee_id, row.kenjo_user_id];
    for (const value of values) {
      const normalized = String(value || '').trim();
      if (normalized) refs.add(normalized);
    }
  }

  const kenjoRes = await query(
    `SELECT kenjo_user_id
     FROM kenjo_employees
     WHERE kenjo_user_id = $1`,
    [ref]
  ).catch(() => ({ rows: [] }));

  for (const row of kenjoRes.rows || []) {
    const normalized = String(row.kenjo_user_id || '').trim();
    if (normalized) refs.add(normalized);
  }

  return [...refs];
}

async function resolveEmployeeRescueTarget(employeeRef) {
  const ref = String(employeeRef || '').trim();
  const refs = await resolveEmployeeRefs(ref);
  const allRefs = [...new Set([ref, ...refs].filter(Boolean))];
  let kenjoEmployeeId = '';
  if (allRefs.length) {
    const res = await query(
      `SELECT kenjo_user_id
       FROM employees
       WHERE employee_id = ANY($1::text[])
          OR id::text = ANY($1::text[])
          OR kenjo_user_id = ANY($1::text[])
       ORDER BY CASE WHEN kenjo_user_id IS NOT NULL AND kenjo_user_id <> '' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [allRefs]
    ).catch(() => ({ rows: [] }));
    kenjoEmployeeId = String(res.rows?.[0]?.kenjo_user_id || '').trim();
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
  listEmployeeDocuments,
  listEmployeeRescues,
  listEmployeeContractExtensions,
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
