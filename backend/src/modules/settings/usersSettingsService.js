import { query } from '../../db.js';

async function list(filters = {}) {
  const { status, role_id, limit = 100, offset = 0 } = filters;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (status) { conditions.push(`u.status = $${idx}`); params.push(status); idx++; }
  if (role_id) { conditions.push(`u.role_id = $${idx}`); params.push(role_id); idx++; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const res = await query(
    `SELECT u.id, u.first_name, u.last_name, u.full_name, u.email, u.phone, u.role_id, u.status, u.department_id, u.station_id, u.last_login_at, u.is_locked, u.login_enabled, u.created_at, u.updated_at,
            r.name AS role_name, r.code AS role_code
     FROM settings_users u
     LEFT JOIN settings_roles r ON r.id = u.role_id
     ${where}
     ORDER BY u.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  const countRes = await query(`SELECT COUNT(*)::int AS c FROM settings_users u ${where}`, params.slice(0, -2));
  return { items: res.rows || [], total: countRes.rows[0]?.c ?? 0, limit, offset };
}

async function getById(id) {
  const res = await query(
    `SELECT u.*, r.name AS role_name, r.code AS role_code FROM settings_users u
     LEFT JOIN settings_roles r ON r.id = u.role_id WHERE u.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function create(data) {
  const fullName = data.full_name || [data.first_name, data.last_name].filter(Boolean).join(' ');
  const res = await query(
    `INSERT INTO settings_users (first_name, last_name, full_name, email, phone, role_id, status, department_id, station_id, notes, password_hash, login_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, first_name, last_name, full_name, email, phone, role_id, status, login_enabled, created_at`,
    [
      data.first_name || null,
      data.last_name || null,
      fullName,
      data.email,
      data.phone || null,
      data.role_id || null,
      data.status || 'active',
      data.department_id || null,
      data.station_id || null,
      data.notes || null,
      data.password_hash || null,
      data.login_enabled === true,
    ]
  );
  return res.rows[0];
}

function toNull(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

async function update(id, data) {
  const fullName = (data.first_name !== undefined || data.last_name !== undefined)
    ? [data.first_name ?? '', data.last_name ?? ''].map((s) => String(s).trim()).filter(Boolean).join(' ') || null
    : data.full_name;
  const allow = ['first_name', 'last_name', 'full_name', 'phone', 'role_id', 'status', 'department_id', 'station_id', 'avatar_url', 'notes'];
  const updates = [];
  const values = [];
  let idx = 1;
  const normalized = { ...data, full_name: fullName };
  for (const k of allow) {
    if (normalized[k] !== undefined) {
      updates.push(`${k} = $${idx}`);
      const v = normalized[k];
      values.push(k === 'role_id' ? (v === '' || v === null ? null : Number(v)) : toNull(v));
      idx++;
    }
  }
  if (updates.length === 0) return getById(id);
  values.push(id);
  await query(`UPDATE settings_users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
  return getById(id);
}

async function setLock(id, isLocked) {
  await query('UPDATE settings_users SET is_locked = $2, updated_at = NOW() WHERE id = $1', [id, !!isLocked]);
  return getById(id);
}

async function setStatus(id, status) {
  await query('UPDATE settings_users SET status = $2, updated_at = NOW() WHERE id = $1', [id, status]);
  return getById(id);
}

async function setPassword(id, passwordHash) {
  await query(
    'UPDATE settings_users SET password_hash = $2, force_password_reset = false, updated_at = NOW() WHERE id = $1',
    [id, passwordHash]
  );
  return getById(id);
}

async function setLoginEnabled(id, enabled) {
  await query('UPDATE settings_users SET login_enabled = $2, updated_at = NOW() WHERE id = $1', [id, !!enabled]);
  return getById(id);
}

export default { list, getById, create, update, setLock, setStatus, setPassword, setLoginEnabled };
