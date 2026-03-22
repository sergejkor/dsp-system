/**
 * Resolve effective permissions for a user: role permissions + user overrides.
 * Override wins over role. If no override, use role permission.
 */
import { query } from '../../db.js';

/** Get all permission codes effectively granted to the user (role + allowed overrides, minus denied overrides). */
async function getUserEffectivePermissions(userId) {
  if (!userId) return [];
  const [roleRes, overrideRes] = await Promise.all([
    query(
      `SELECT p.code FROM settings_role_permissions rp
       JOIN settings_permissions p ON p.id = rp.permission_id
       JOIN settings_users u ON u.role_id = rp.role_id AND u.id = $1`,
      [userId]
    ),
    query(
      `SELECT p.code, o.is_allowed FROM settings_user_permission_overrides o
       JOIN settings_permissions p ON p.id = o.permission_id
       WHERE o.user_id = $1`,
      [userId]
    ),
  ]);
  const roleCodes = new Set((roleRes.rows || []).map((r) => r.code));
  const overrides = overrideRes.rows || [];
  for (const o of overrides) {
    if (o.is_allowed) roleCodes.add(o.code);
    else roleCodes.delete(o.code);
  }
  return [...roleCodes];
}

/** Check if user has a specific permission. */
async function userHasPermission(userId, permissionCode) {
  const perms = await getUserEffectivePermissions(userId);
  return perms.includes(permissionCode);
}

/** Get current user id from request (session first, then header). */
function getCurrentUserId(req) {
  if (req.user?.id != null) return Number(req.user.id);
  const id = req.headers['x-user-id'];
  if (id && /^\d+$/.test(id)) return parseInt(id, 10);
  return null;
}

export default {
  getUserEffectivePermissions,
  userHasPermission,
  getCurrentUserId,
};
