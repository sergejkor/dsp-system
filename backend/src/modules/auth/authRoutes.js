import { Router } from 'express';
import { query } from '../../db.js';
import authService from './authService.js';
import authMiddleware from './authMiddleware.js';
import usersSettingsService from '../settings/usersSettingsService.js';
import auditLogService from '../settings/auditLogService.js';

const router = Router();

function getUserId(req) {
  return req.user?.id;
}

// ---- Public ----
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await authService.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.login_enabled) {
      return res.status(403).json({ error: 'Login access is not enabled for this account' });
    }
    if (user.is_locked) {
      return res.status(403).json({ error: 'Account is locked' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is disabled or suspended' });
    }
    const valid = await authService.verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const { token, expires_at } = await authService.createSession(
      user.id,
      req.ip,
      req.get('user-agent')
    );
    await query('UPDATE settings_users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});
    await auditLogService.log('auth', user.id, 'login', null, { email: user.email }, user.id, req.ip, req.get('user-agent'));
    res.json({
      token,
      expires_at: expires_at?.toISOString?.() ?? expires_at,
      user: {
        id: user.id,
        email: user.email,
        role_code: user.role_code,
      },
    });
  } catch (e) {
    console.error('POST /api/auth/login', e);
    res.status(500).json({ error: e.message });
  }
});

// ---- Protected ----
router.post('/logout', authMiddleware.loadAuth, authMiddleware.requireAuth, async (req, res) => {
  try {
    if (req.authToken) {
      await authService.deleteSessionByToken(req.authToken);
      await auditLogService.log('auth', getUserId(req), 'logout', null, null, getUserId(req), req.ip, req.get('user-agent'));
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', authMiddleware.loadAuth, authMiddleware.requireAuth, async (req, res) => {
  try {
    const u = await authService.getUserWithRole(req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: u.id,
      email: u.email,
      first_name: u.first_name,
      last_name: u.full_name,
      full_name: u.full_name,
      role_id: u.role_id,
      role_code: u.role_code,
      role_name: u.role_name,
      status: u.status,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/change-password', authMiddleware.loadAuth, authMiddleware.requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    const user = await authService.findUserByEmail(req.user.email);
    const valid = await authService.verifyPassword(current_password, user?.password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await authService.hashPassword(new_password);
    await usersSettingsService.setPassword(req.user.id, hash);
    await authService.deleteSessionsForUser(req.user.id);
    await auditLogService.log('auth', req.user.id, 'change_password', null, null, getUserId(req), req.ip, req.get('user-agent'));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- SuperAdmin only ----
router.post('/reset-password', authMiddleware.loadAuth, authMiddleware.requireSuperAdmin, async (req, res) => {
  try {
    const { user_id, new_password } = req.body || {};
    if (!user_id || !new_password) {
      return res.status(400).json({ error: 'user_id and new_password are required' });
    }
    const targetId = parseInt(user_id, 10);
    const hash = await authService.hashPassword(new_password);
    const target = await usersSettingsService.getById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });
    await usersSettingsService.setPassword(targetId, hash);
    await authService.deleteSessionsForUser(targetId);
    await auditLogService.log('auth', targetId, 'reset_password', null, { by: getUserId(req) }, getUserId(req), req.ip, req.get('user-agent'));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users/:id/lock', authMiddleware.loadAuth, authMiddleware.requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const target = await usersSettingsService.getById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const isSuperAdmin = await authService.isUserSuperAdmin(id);
    if (isSuperAdmin) {
      const count = await authService.countSuperAdmins();
      if (count <= 1) return res.status(400).json({ error: 'Cannot lock the last SuperAdmin' });
    }
    await usersSettingsService.setLock(id, true);
    await authService.deleteSessionsForUser(id);
    await auditLogService.log('user', id, 'lock', null, { is_locked: true }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(await usersSettingsService.getById(id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users/:id/unlock', authMiddleware.loadAuth, authMiddleware.requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const target = await usersSettingsService.getById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    await usersSettingsService.setLock(id, false);
    await auditLogService.log('user', id, 'unlock', null, { is_locked: false }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(await usersSettingsService.getById(id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/users/:id/login-enabled', authMiddleware.loadAuth, authMiddleware.requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const enabled = req.body?.login_enabled === true;
    const target = await usersSettingsService.getById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    await usersSettingsService.setLoginEnabled(id, enabled);
    await auditLogService.log('user', id, 'set_login_enabled', { login_enabled: target.login_enabled }, { login_enabled: enabled }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(await usersSettingsService.getById(id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
