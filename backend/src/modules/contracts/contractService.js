import { query } from '../../db.js';

export async function getContractsByEmployee(kenjoEmployeeId) {
  const id = String(kenjoEmployeeId || '').trim();
  if (!id) return [];
  const res = await query(
    `SELECT id, kenjo_employee_id, start_date, end_date, created_at
     FROM employee_contracts
     WHERE kenjo_employee_id = $1
     ORDER BY start_date ASC, id ASC`,
    [id]
  );
  return (res.rows || []).map((row) => ({
    id: row.id,
    kenjo_employee_id: row.kenjo_employee_id,
    start_date: row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : String(row.start_date || '').slice(0, 10),
    end_date: row.end_date == null ? null : (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date || '').slice(0, 10)),
    created_at: row.created_at,
  }));
}

export async function createContract(kenjoEmployeeId, startDate, endDate) {
  const id = String(kenjoEmployeeId || '').trim();
  if (!id) throw new Error('kenjo_employee_id is required');
  const start = String(startDate || '').trim().slice(0, 10);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('start_date is required (YYYY-MM-DD)');
  const end = endDate == null || endDate === '' ? null : String(endDate).trim().slice(0, 10);
  const res = await query(
    `INSERT INTO employee_contracts (kenjo_employee_id, start_date, end_date)
     VALUES ($1, $2, $3)
     RETURNING id, kenjo_employee_id, start_date, end_date, created_at`,
    [id, start, end || null]
  );
  const row = res.rows[0];
  return {
    id: row.id,
    kenjo_employee_id: row.kenjo_employee_id,
    start_date: row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : String(row.start_date || '').slice(0, 10),
    end_date: row.end_date == null ? null : (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date || '').slice(0, 10)),
    created_at: row.created_at,
  };
}
