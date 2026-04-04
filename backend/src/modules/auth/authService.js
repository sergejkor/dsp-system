import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../../db.js';

const SALT_ROUNDS = 12;
const TOKEN_BYTES = 32;
const DEFAULT_SESSION_MINUTES = 60 * 24; // 24 hours

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export async function getSessionTimeoutMinutes() {
  try {
    const res = await query(
      `SELECT value_json FROM settings_security WHERE key = 'session_timeout_minutes'`
    );
    const row = res.rows?.[0];
    if (row?.value_json != null) {
      const n = typeof row.value_json === 'object' ? row.value_json?.value : Number(row.value_json);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch (_) {}
  return DEFAULT_SESSION_MINUTES;
}

export async function createSession(userId, ipAddress, userAgent) {
  const token = generateToken();
  const minutes = await getSessionTimeoutMinutes();
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  await query(
    `INSERT INTO auth_sessions (user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, token, expiresAt, ipAddress || null, userAgent || null]
  );
  return { token, expires_at: expiresAt };
}

export async function getSessionByToken(token) {
  if (!token || typeof token !== 'string') return null;
  const res = await query(
    `SELECT s.id, s.user_id, s.expires_at, s.created_at
     FROM auth_sessions s
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token.trim()]
  );
  const row = res.rows?.[0];
  if (!row) return null;
  return { id: row.id, user_id: row.user_id, expires_at: row.expires_at, created_at: row.created_at };
}

export async function getUserWithRole(userId) {
  const res = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.full_name, u.avatar_url, u.role_id, u.status, u.is_locked, u.login_enabled,
            r.code AS role_code, r.name AS role_name
     FROM settings_users u
     LEFT JOIN settings_roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [userId]
  );
  return res.rows?.[0] || null;
}

export async function deleteSessionByToken(token) {
  const res = await query('DELETE FROM auth_sessions WHERE token = $1 RETURNING id', [token]);
  return (res.rows?.length ?? 0) > 0;
}

export async function deleteSessionsForUser(userId) {
  await query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
}

export async function findUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const res = await query(
    `SELECT u.id, u.email, u.password_hash, u.status, u.is_locked, u.login_enabled,
            r.code AS role_code
     FROM settings_users u
     LEFT JOIN settings_roles r ON r.id = u.role_id
     WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1))`,
    [email]
  );
  return res.rows?.[0] || null;
}

export async function countSuperAdmins() {
  const res = await query(
    `SELECT COUNT(*)::int AS c FROM settings_users u
     JOIN settings_roles r ON r.id = u.role_id AND r.code = 'super_admin'
     WHERE u.status = 'active' AND u.is_locked = false`
  );
  return res.rows?.[0]?.c ?? 0;
}

export async function isUserSuperAdmin(userId) {
  const res = await query(
    `SELECT 1 FROM settings_users u
     JOIN settings_roles r ON r.id = u.role_id AND r.code = 'super_admin'
     WHERE u.id = $1`,
    [userId]
  );
  return (res.rows?.length ?? 0) > 0;
}

export default {
  hashPassword,
  verifyPassword,
  generateToken,
  getSessionTimeoutMinutes,
  createSession,
  getSessionByToken,
  getUserWithRole,
  deleteSessionByToken,
  deleteSessionsForUser,
  findUserByEmail,
  countSuperAdmins,
  isUserSuperAdmin,
};
