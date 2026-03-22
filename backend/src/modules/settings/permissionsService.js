import { query } from '../../db.js';

async function list() {
  const res = await query(
    'SELECT id, code, label, category, description, created_at FROM settings_permissions ORDER BY category, code'
  );
  return res.rows || [];
}

async function getUserPermissionOverrides(userId) {
  const res = await query(
    `SELECT p.id, p.code, p.label, o.is_allowed FROM settings_user_permission_overrides o
     JOIN settings_permissions p ON p.id = o.permission_id WHERE o.user_id = $1`,
    [userId]
  );
  return res.rows || [];
}

async function setUserPermissionOverrides(userId, overrides) {
  await query('DELETE FROM settings_user_permission_overrides WHERE user_id = $1', [userId]);
  for (const o of overrides || []) {
    if (o.permission_id != null && o.is_allowed !== undefined) {
      await query(
        'INSERT INTO settings_user_permission_overrides (user_id, permission_id, is_allowed) VALUES ($1, $2, $3)',
        [userId, o.permission_id, o.is_allowed]
      );
    }
  }
  return getUserPermissionOverrides(userId);
}

export default { list, getUserPermissionOverrides, setUserPermissionOverrides };
