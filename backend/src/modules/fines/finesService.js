import { query } from '../../db.js';

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
  const res = await query(
    `SELECT id, kenjo_employee_id, created_date, receipt_date, case_number, amount,
            has_fine_points, fine_points, processing_date, paid_by, created_at, updated_at
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
  } = payload || {};

  const res = await query(
    `INSERT INTO fines (
       kenjo_employee_id, created_date, receipt_date, case_number, amount,
       has_fine_points, fine_points, processing_date, paid_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, kenjo_employee_id, created_date, receipt_date, case_number, amount,
               has_fine_points, fine_points, processing_date, paid_by, created_at, updated_at`,
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
    ]
  );
  return res.rows[0];
}

export async function updateFine(id, payload) {
  const {
    created_date,
    receipt_date,
    case_number,
    amount,
    has_fine_points,
    fine_points,
    processing_date,
    paid_by,
  } = payload || {};

  const res = await query(
    `UPDATE fines
     SET created_date = $2,
         receipt_date = $3,
         case_number = $4,
         amount = $5,
         has_fine_points = $6,
         fine_points = $7,
         processing_date = $8,
         paid_by = $9,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, kenjo_employee_id, created_date, receipt_date, case_number, amount,
               has_fine_points, fine_points, processing_date, paid_by, created_at, updated_at`,
    [
      id,
      created_date || null,
      receipt_date || null,
      case_number || null,
      amount != null ? Number(amount) : null,
      !!has_fine_points,
      has_fine_points ? (fine_points != null ? Number(fine_points) : null) : null,
      processing_date || null,
      paid_by || null,
    ]
  );
  return res.rows[0];
}

const finesService = {
  getEmployeesForFines,
  getFines,
  createFine,
  updateFine,
};

export default finesService;

