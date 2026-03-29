import { query } from '../../db.js';

let finesSchemaReady = false;

const FINE_SELECT_FIELDS = `
  id,
  kenjo_employee_id,
  TO_CHAR(created_date::date, 'YYYY-MM-DD') AS created_date,
  TO_CHAR(receipt_date::date, 'YYYY-MM-DD') AS receipt_date,
  case_number,
  amount,
  has_fine_points,
  fine_points,
  TO_CHAR(processing_date::date, 'YYYY-MM-DD') AS processing_date,
  paid_by,
  notify_online,
  notify_email,
  created_at,
  updated_at
`;

async function ensureFinesSchema() {
  if (finesSchemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS fine_documents (
      id SERIAL PRIMARY KEY,
      fine_id INTEGER NOT NULL REFERENCES fines(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type VARCHAR(255),
      file_content BYTEA NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_fine_documents_fine_id ON fine_documents (fine_id, created_at DESC)`);
  await query(`ALTER TABLE fines ADD COLUMN IF NOT EXISTS notify_online BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE fines ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT FALSE`);
  finesSchemaReady = true;
}

export async function getEmployeesForFines() {
  const res = await query(
    `SELECT kenjo_user_id AS id, first_name, last_name, display_name
     FROM kenjo_employees
     WHERE is_active = true
     ORDER BY last_name, first_name`
  );
  return (res.rows || []).map((r) => ({
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.display_name || r.id,
  }));
}

export async function getFines() {
  await ensureFinesSchema();
  const res = await query(
    `SELECT ${FINE_SELECT_FIELDS}
     FROM fines
     ORDER BY created_at DESC, id DESC`
  );
  return res.rows || [];
}

export async function createFine(payload) {
  const {
    kenjo_employee_id,
    created_date,
    receipt_date,
    case_number,
    amount,
    has_fine_points,
    fine_points,
    processing_date,
    paid_by,
    notify_online,
    notify_email,
  } = payload || {};

  await ensureFinesSchema();
  const res = await query(
    `INSERT INTO fines (
       kenjo_employee_id, created_date, receipt_date, case_number, amount,
       has_fine_points, fine_points, processing_date, paid_by, notify_online, notify_email
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${FINE_SELECT_FIELDS}`,
    [
      kenjo_employee_id,
      created_date || null,
      receipt_date || null,
      case_number || null,
      amount != null ? Number(amount) : null,
      !!has_fine_points,
      has_fine_points ? (fine_points != null ? Number(fine_points) : null) : null,
      processing_date || null,
      paid_by || null,
      !!notify_online,
      !!notify_email,
    ]
  );
  return res.rows[0];
}

export async function updateFine(id, payload) {
  const {
    kenjo_employee_id,
    created_date,
    receipt_date,
    case_number,
    amount,
    has_fine_points,
    fine_points,
    processing_date,
    paid_by,
    notify_online,
    notify_email,
  } = payload || {};

  await ensureFinesSchema();
  const res = await query(
    `UPDATE fines
     SET kenjo_employee_id = $2,
         created_date = $3,
         receipt_date = $4,
         case_number = $5,
         amount = $6,
         has_fine_points = $7,
         fine_points = $8,
         processing_date = $9,
         paid_by = $10,
         notify_online = $11,
         notify_email = $12,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${FINE_SELECT_FIELDS}`,
    [
      id,
      kenjo_employee_id || null,
      created_date || null,
      receipt_date || null,
      case_number || null,
      amount != null ? Number(amount) : null,
      !!has_fine_points,
      has_fine_points ? (fine_points != null ? Number(fine_points) : null) : null,
      processing_date || null,
      paid_by || null,
      !!notify_online,
      !!notify_email,
    ]
  );
  return res.rows[0] || null;
}

export async function deleteFine(id) {
  await ensureFinesSchema();
  const fineId = Number(id);
  if (!Number.isFinite(fineId)) return false;
  const res = await query(
    `DELETE FROM fines
     WHERE id = $1`,
    [fineId]
  );
  return (res.rowCount || 0) > 0;
}

export async function addFineDocument(fineId, { fileName, mimeType, fileContent }) {
  await ensureFinesSchema();
  const id = Number(fineId);
  if (!Number.isFinite(id)) throw new Error('Invalid fine id');
  const res = await query(
    `INSERT INTO fine_documents (fine_id, file_name, mime_type, file_content)
     VALUES ($1, $2, $3, $4)
     RETURNING id, fine_id, file_name, mime_type, created_at`,
    [id, String(fileName || 'document.bin').trim(), mimeType || null, fileContent]
  );
  return res.rows[0] || null;
}

export async function listFineDocuments(fineId) {
  await ensureFinesSchema();
  const id = Number(fineId);
  if (!Number.isFinite(id)) return [];
  const res = await query(
    `SELECT id, fine_id, file_name, mime_type, created_at
     FROM fine_documents
     WHERE fine_id = $1
     ORDER BY created_at DESC, id DESC`,
    [id]
  );
  return res.rows || [];
}

export async function getFineDocument(fineId, docId) {
  await ensureFinesSchema();
  const fid = Number(fineId);
  const did = Number(docId);
  if (!Number.isFinite(fid) || !Number.isFinite(did)) return null;
  const res = await query(
    `SELECT id, fine_id, file_name, mime_type, file_content, created_at
     FROM fine_documents
     WHERE fine_id = $1 AND id = $2
     LIMIT 1`,
    [fid, did]
  );
  return res.rows[0] || null;
}

export async function deleteFineDocument(fineId, docId) {
  await ensureFinesSchema();
  const fid = Number(fineId);
  const did = Number(docId);
  if (!Number.isFinite(fid) || !Number.isFinite(did)) return false;
  const res = await query(
    `DELETE FROM fine_documents
     WHERE fine_id = $1 AND id = $2`,
    [fid, did]
  );
  return (res.rowCount || 0) > 0;
}

const finesService = {
  getEmployeesForFines,
  getFines,
  createFine,
  updateFine,
  deleteFine,
  addFineDocument,
  listFineDocuments,
  getFineDocument,
  deleteFineDocument,
};

export default finesService;

