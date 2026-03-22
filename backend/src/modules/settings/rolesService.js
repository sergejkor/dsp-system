import { query } from '../../db.js';

async function list() {
  const res = await query(
    `SELECT id, name, code, description, is_system_role, is_active, priority, created_at, updated_at FROM settings_roles ORDER BY priority DESC, id`
  );
  return res.rows || [];
}

async function getById(id) {
  const res = await query('SELECT * FROM settings_roles WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function create(data) {
  const res = await query(
    `INSERT INTO settings_roles (name, code, description, is_system_role, is_active, priority)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.name, data.code, data.description || null, data.is_system_role ?? false, data.is_active !== false, data.priority ?? 0]
  );
  return res.rows[0];
}

async function update(id, data) {
  const allow = ['name', 'description', 'is_active', 'priority'];
  const updates = [];
  const values = [];
  let idx = 1;
  for (const k of allow) {
    if (data[k] !== undefined) {
      updates.push(`${k} = $${idx}`);
      values.push(data[k]);
      idx++;
    }
  }
  if (updates.length === 0) return getById(id);
  values.push(id);
  await query(`UPDATE settings_roles SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
  return getById(id);
}

async function getRolePermissions(roleId) {
  const res = await query(
    `SELECT p.id, p.code, p.label, p.category FROM settings_role_permissions rp
     JOIN settings_permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1`,
    [roleId]
  );
  return res.rows || [];
}

async function setRolePermissions(roleId, permissionIds) {
  await query('DELETE FROM settings_role_permissions WHERE role_id = $1', [roleId]);
  for (const pid of permissionIds || []) {
    await query('INSERT INTO settings_role_permissions (role_id, permission_id) VALUES ($1, $2)', [roleId, pid]);
  }
  return getRolePermissions(roleId);
}

export default { list, getById, create, update, getRolePermissions, setRolePermissions };
