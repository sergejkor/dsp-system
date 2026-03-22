import { query } from '../../db.js';

const ALLOWED_STATUSES = ['active', 'invited', 'suspended', 'inactive'];

export async function listUsers(filters = {}) {
  const { status, role_id, limit = 100, offset = 0 } = filters;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (status) { conditions.push(`u.status = $${idx}`); params.push(status); idx++; }
  if (role_id) { conditions.push(`u.role_id = $${idx}`); params.push(role_id); idx++; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const res = await query(
    `SELECT u.id, u.first_name, u.last_name, u.full_name, u.email, u.phone, u.role_id, u.status, u.department_id, u.station_id,
            u.last_login_at, u.is_locked, u.created_at, u.updated_at,
            r.name AS role_name, r.code AS role_code
     FROM settings_users u
     LEFT JOIN settings_roles r ON r.id = u.role_id
     ${where} ORDER BY u.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return res.rows || [];
}

export async function getUserById(id) {
  const res = await query(
    `SELECT u.*, r.name AS role_name, r.code AS role_code FROM settings_users u
     LEFT JOIN settings_roles r ON r.id = u.role_id WHERE u.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function getUserByEmail(email) {
  const res = await query('SELECT * FROM settings_users WHERE email = $1', [email.trim().toLowerCase()]);
  return res.rows[0] || null;
}

export async function createUser(data, auditContext = {}) {
  const email = (data.email || '').trim().toLowerCase();
  if (!email) throw new Error('Email is required');
  const existing = await query('SELECT 1 FROM settings_users WHERE email = $1', [email]);
  if (existing.rows.length) throw new Error('Email already exists');
  const fullName = data.full_name || [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || null;
  const res = await query(
    `INSERT INTO settings_users (first_name, last_name, full_name, email, phone, role_id, status, department_id, station_id, notes, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, first_name, last_name, full_name, email, phone, role_id, status, created_at`,
    [
      data.first_name || null,
      data.last_name || null,
      fullName,
      email,
      data.phone || null,
      data.role_id || null,
      data.status || 'active',
      data.department_id || null,
      data.station_id || null,
      data.notes || null,
      data.password_hash || null,
    ]
  );
  return res.rows[0];
}

export async function updateUser(id, data, auditContext = {}) {
  const current = (await query('SELECT * FROM settings_users WHERE id = $1', [id])).rows[0];
  if (!current) return null;
  const allowed = ['first_name', 'last_name', 'full_name', 'phone', 'role_id', 'status', 'department_id', 'station_id', 'avatar_url', 'notes'];
  const updates = [];
  const values = [];
  let idx = 1;
  if (data.email !== undefined) {
    const email = String(data.email).trim().toLowerCase();
    const ex = await query('SELECT 1 FROM settings_users WHERE email = $1 AND id != $2', [email, id]);
    if (ex.rows.length) throw new Error('Email already exists');
    updates.push(`email = $${idx}`); values.push(email); idx++;
  }
  for (const k of allowed) {
    if (data[k] !== undefined) {
      updates.push(`${k} = $${idx}`);
      values.push(data[k]);
      idx++;
    }
  }
  if (data.password_hash !== undefined) {
    updates.push(`password_hash = $${idx}`); values.push(data.password_hash); idx++;
    updates.push(`force_password_reset = $${idx}`); values.push(false); idx++;
  }
  if (updates.length === 0) return getUserById(id);
  values.push(id);
  await query(`UPDATE settings_users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
  return getUserById(id);
}

export async function setUserLock(id, locked, auditContext = {}) {
  const user = await getUserById(id);
  if (!user) return null;
  await query('UPDATE settings_users SET is_locked = $2, updated_at = NOW() WHERE id = $1', [id, !!locked]);
  return getUserById(id);
}

export async function setUserStatus(id, status, auditContext = {}) {
  if (!ALLOWED_STATUSES.includes(status)) throw new Error('Invalid status');
  const user = await getUserById(id);
  if (!user) return null;
  await query('UPDATE settings_users SET status = $2, updated_at = NOW() WHERE id = $1', [id, status]);
  return getUserById(id);
}

export default { listUsers, getUserById, getUserByEmail, createUser, updateUser, setUserLock, setUserStatus };
