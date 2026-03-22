import { query } from '../../db.js';

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

const employeeService = {
  listEmployees,
  getEmployeeById,
};

export default employeeService;

