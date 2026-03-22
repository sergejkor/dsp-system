import { query } from '../../db.js';

/**
 * Save up to 3 advance lines for an employee for a given month (YYYY-MM).
 * Replaces any existing lines for that employee+month.
 */
export async function saveAdvances(kenjoEmployeeId, month, lines) {
  const id = String(kenjoEmployeeId || '').trim();
  const m = String(month || '').trim().slice(0, 7);
  if (!id || !m || !/^\d{4}-\d{2}$/.test(m)) {
    throw new Error('kenjo_employee_id and month (YYYY-MM) are required');
  }
  const normalized = (lines || []).slice(0, 3).map((line, i) => ({
    amount: line?.amount != null && line?.amount !== '' ? Number(line.amount) : null,
    code_comment: line?.code_comment != null ? String(line.code_comment).trim().slice(0, 2000) : null,
    line_order: i + 1,
  }));

  await query(
    `DELETE FROM vorschuss WHERE kenjo_employee_id = $1 AND month = $2`,
    [id, m]
  );

  for (const row of normalized) {
    await query(
      `INSERT INTO vorschuss (kenjo_employee_id, month, amount, code_comment, line_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, m, row.amount, row.code_comment, row.line_order]
    );
  }

  return { ok: true, month: m, lines: normalized.length };
}

/**
 * Get advance lines for an employee, optionally filtered by month.
 */
export async function getAdvances(kenjoEmployeeId, month = null) {
  const id = String(kenjoEmployeeId || '').trim();
  if (!id) return [];
  let sql = `SELECT id, kenjo_employee_id, month, amount, code_comment, line_order, created_at
             FROM vorschuss WHERE kenjo_employee_id = $1`;
  const params = [id];
  if (month) {
    const m = String(month).trim().slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) {
      sql += ` AND month = $2`;
      params.push(m);
    }
  }
  sql += ` ORDER BY month DESC, line_order ASC`;
  const res = await query(sql, params);
  return (res.rows || []).map((row) => ({
    id: row.id,
    kenjo_employee_id: row.kenjo_employee_id,
    month: row.month,
    amount: row.amount != null ? Number(row.amount) : null,
    code_comment: row.code_comment,
    line_order: row.line_order,
    created_at: row.created_at,
  }));
}
