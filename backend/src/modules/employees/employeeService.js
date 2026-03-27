import { query } from '../../db.js';

let docsTableReady = false;

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
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_employee_documents_ref ON employee_documents (employee_ref, created_at DESC)`);
  docsTableReady = true;
}

async function listEmployees({ search, onlyActive } = {}) {
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
      is_active
     FROM employees
     WHERE employee_id = $1 OR id::text = $1
     LIMIT 1`,
    [String(employeeId)]
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

async function listEmployeeDocuments(employeeRef) {
  await ensureEmployeeDocumentsTable();
  const refs = await resolveEmployeeRefs(employeeRef);
  if (!refs.length) return [];
  const res = await query(
    `SELECT id, employee_ref, document_type, file_name, mime_type, created_at
     FROM employee_documents
     WHERE employee_ref = ANY($1::text[])
     ORDER BY created_at DESC, id DESC`,
    [refs]
  );
  return res.rows || [];
}

async function addEmployeeDocument(employeeRef, { documentType, fileName, mimeType, fileContent }) {
  await ensureEmployeeDocumentsTable();
  const ref = String(employeeRef || '').trim();
  if (!ref) throw new Error('employee_ref is required');
  const res = await query(
    `INSERT INTO employee_documents (employee_ref, document_type, file_name, mime_type, file_content)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, employee_ref, document_type, file_name, mime_type, created_at`,
    [ref, String(documentType || '').trim(), String(fileName || 'document.bin').trim(), mimeType || null, fileContent]
  );
  return res.rows[0];
}

async function getEmployeeDocument(employeeRef, docId) {
  await ensureEmployeeDocumentsTable();
  const refs = await resolveEmployeeRefs(employeeRef);
  const id = Number(docId);
  if (!refs.length || !Number.isFinite(id)) return null;
  const res = await query(
    `SELECT id, employee_ref, document_type, file_name, mime_type, file_content, created_at
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

const employeeService = {
  listEmployees,
  getEmployeeById,
  listEmployeeDocuments,
  addEmployeeDocument,
  getEmployeeDocument,
  deleteEmployeeDocument,
};

export default employeeService;
