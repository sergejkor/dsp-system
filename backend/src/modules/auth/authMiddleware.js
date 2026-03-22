import authService from './authService.js';

/**
 * Resolve Bearer token from Authorization header or from cookie (auth_token).
 */
function getTokenFromRequest(req) {
  const auth = req.headers.authorization;
  if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.match(/auth_token=([^;]+)/);
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * Attach req.user if valid session. Does not send 401.
 */
export async function loadAuth(req, _res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return next();
  try {
    const session = await authService.getSessionByToken(token);
    if (!session) return next();
    const user = await authService.getUserWithRole(session.user_id);
    if (!user) return next();
    req.user = user;
    req.sessionId = session.id;
    req.authToken = token;
  } catch (e) {
    console.error('loadAuth', e);
  }
  next();
}

/**
 * Require authenticated user. Send 401 if not.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
  next();
}

/**
 * Require SuperAdmin role. Use after requireAuth. Send 403 if not.
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
  if (req.user.role_code !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden. SuperAdmin only.', code: 'FORBIDDEN' });
  }
  next();
}

export { getTokenFromRequest };

export default { loadAuth, requireAuth, requireSuperAdmin, getTokenFromRequest };
