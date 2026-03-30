/**
 * Settings API: users, roles, permissions, groups, lookups, feature flags, integrations, security, audit.
 * All routes require authentication. Permission checks use session user. SuperAdmin-only: create user, lock/unlock/disable, reset password, set login enabled.
 */
import { Router } from 'express';
import multer from 'multer';
import accessControlService from './accessControlService.js';
import auditLogService from './auditLogService.js';
import usersSettingsService from './usersSettingsService.js';
import rolesService from './rolesService.js';
import permissionsService from './permissionsService.js';
import settingsService from './settingsService.js';
import documentTemplateSettingsService from './documentTemplateSettingsService.js';
import createDocumentGenerationService from './createDocumentGenerationService.js';
import lookupService from './lookupService.js';
import featureFlagsService from './featureFlagsService.js';
import integrationSettingsService from './integrationSettingsService.js';
import securitySettingsService from './securitySettingsService.js';
import authMiddleware from '../auth/authMiddleware.js';
import authService from '../auth/authService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authMiddleware.requireAuth);

function getUserId(req) {
  return accessControlService.getCurrentUserId(req);
}

function requirePermission(permissionCode) {
  return async (req, res, next) => {
    const userId = getUserId(req);
    const has = await accessControlService.userHasPermission(userId, permissionCode);
    if (!has) return res.status(403).json({ error: 'Forbidden', required: permissionCode, code: 'FORBIDDEN' });
    next();
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role_code !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden. SuperAdmin only.', code: 'FORBIDDEN' });
  }
  next();
}

// ---- Users ----
router.get('/users', requirePermission('manage_users'), async (req, res) => {
  try {
    const result = await usersSettingsService.list({
      status: req.query.status,
      role_id: req.query.role_id ? parseInt(req.query.role_id, 10) : undefined,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(result);
  } catch (e) {
    console.error('GET /api/settings/users', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/users', requireSuperAdmin, async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (body.password) {
      body.password_hash = await authService.hashPassword(body.password);
      delete body.password;
    }
    body.login_enabled = body.login_enabled === true;
    const user = await usersSettingsService.create(body);
    await auditLogService.log('user', user.id, 'create', null, { ...user, password_hash: undefined }, getUserId(req), req.ip, req.get('user-agent'));
    res.status(201).json(user);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    console.error('POST /api/settings/users', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/users/:id', requirePermission('manage_users'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await usersSettingsService.getById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/users/:id', requirePermission('manage_users'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const oldU = await usersSettingsService.getById(id);
    if (!oldU) return res.status(404).json({ error: 'User not found' });
    const user = await usersSettingsService.update(id, req.body || {});
    await auditLogService.log('user', id, 'update', oldU, user, getUserId(req), req.ip, req.get('user-agent'));
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users/:id/lock', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const target = await usersSettingsService.getById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (await authService.isUserSuperAdmin(id)) {
      const count = await authService.countSuperAdmins();
      if (count <= 1) return res.status(400).json({ error: 'Cannot lock the last SuperAdmin' });
    }
    const user = await usersSettingsService.setLock(id, true);
    await authService.deleteSessionsForUser(id);
    await auditLogService.log('user', id, 'lock', null, { is_locked: true }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users/:id/unlock', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await usersSettingsService.setLock(id, false);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await auditLogService.log('user', id, 'unlock', null, { is_locked: false }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users/:id/deactivate', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (await authService.isUserSuperAdmin(id)) {
      const count = await authService.countSuperAdmins();
      if (count <= 1) return res.status(400).json({ error: 'Cannot disable the last SuperAdmin' });
    }
    const user = await usersSettingsService.setStatus(id, 'inactive');
    if (!user) return res.status(404).json({ error: 'User not found' });
    await authService.deleteSessionsForUser(id);
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users/:id/reactivate', requirePermission('manage_users'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await usersSettingsService.setStatus(id, 'active');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/users/:id/login-enabled', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const enabled = req.body?.login_enabled === true;
    const target = await usersSettingsService.getById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const user = await usersSettingsService.setLoginEnabled(id, enabled);
    await auditLogService.log('user', id, 'set_login_enabled', { login_enabled: target.login_enabled }, { login_enabled: enabled }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Roles ----
router.get('/roles', requirePermission('view_settings'), async (req, res) => {
  try {
    const list = await rolesService.list();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/roles', requirePermission('manage_roles'), async (req, res) => {
  try {
    const role = await rolesService.create(req.body || {});
    await auditLogService.log('role', role.id, 'create', null, role, getUserId(req), req.ip, req.get('user-agent'));
    res.status(201).json(role);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Role code already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.get('/roles/:id', requirePermission('view_settings'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const role = await rolesService.getById(id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    const permissions = await rolesService.getRolePermissions(id);
    res.json({ ...role, permissions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/roles/:id', requirePermission('manage_roles'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const oldR = await rolesService.getById(id);
    if (!oldR) return res.status(404).json({ error: 'Role not found' });
    const role = await rolesService.update(id, req.body || {});
    await auditLogService.log('role', id, 'update', oldR, role, getUserId(req), req.ip, req.get('user-agent'));
    res.json(role);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/roles/:id/permissions', requirePermission('manage_roles'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const permissionIds = Array.isArray(req.body?.permission_ids) ? req.body.permission_ids : req.body?.permission_ids ? [req.body.permission_ids] : [];
    const permissions = await rolesService.setRolePermissions(id, permissionIds);
    await auditLogService.log('role_permissions', id, 'update', null, { permission_ids: permissionIds }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(permissions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Permissions ----
router.get('/permissions', requirePermission('view_settings'), async (req, res) => {
  try {
    const list = await permissionsService.list();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/permissions/effective', async (req, res) => {
  try {
    const userId = getUserId(req);
    const permissions = await accessControlService.getUserEffectivePermissions(userId);
    res.json({ user_id: userId, permissions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/users/:id/permissions', requirePermission('manage_permissions'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const overrides = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    const result = await permissionsService.setUserPermissionOverrides(id, overrides);
    await auditLogService.log('user_permissions', id, 'update', null, { overrides }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Settings groups (generic groupKey after specific paths) ----
router.get('/groups', requirePermission('view_settings'), async (req, res) => {
  try {
    const list = await settingsService.getGroups();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Lookups ----
router.get('/lookups', requirePermission('view_settings'), async (req, res) => {
  try {
    const list = await lookupService.getGroups();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/lookups/:groupKey', requirePermission('view_settings'), async (req, res) => {
  try {
    const values = await lookupService.getByGroupKey(req.params.groupKey, req.query.active !== 'false');
    res.json(values);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/lookups/:groupKey', requirePermission('edit_settings'), async (req, res) => {
  try {
    const value = await lookupService.createValue(req.params.groupKey, req.body || {}, getUserId(req));
    if (!value) return res.status(404).json({ error: 'Lookup group not found' });
    res.status(201).json(value);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Value key already exists in group' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/lookups/:groupKey/:id', requirePermission('edit_settings'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const value = await lookupService.updateValue(req.params.groupKey, id, req.body || {}, getUserId(req));
    if (!value) return res.status(404).json({ error: 'Not found' });
    res.json(value);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/lookups/:groupKey/reorder', requirePermission('edit_settings'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.value_ids) ? req.body.value_ids : [];
    const values = await lookupService.reorder(req.params.groupKey, ids);
    res.json(values);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Feature flags ----
router.get('/features', requirePermission('view_settings'), async (req, res) => {
  try {
    const list = await featureFlagsService.list();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/features/:key', requirePermission('manage_feature_flags'), async (req, res) => {
  try {
    const key = req.params.key;
    const enabled = req.body?.enabled;
    const flag = await featureFlagsService.setEnabled(key, enabled, getUserId(req));
    if (!flag) return res.status(404).json({ error: 'Feature flag not found' });
    await auditLogService.log('feature_flag', key, 'update', null, { enabled: flag.enabled }, getUserId(req), req.ip, req.get('user-agent'));
    res.json(flag);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Integrations ----
router.get('/integrations', requirePermission('view_settings'), async (req, res) => {
  try {
    const list = await integrationSettingsService.list();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/integrations/:key', requirePermission('view_settings'), async (req, res) => {
  try {
    const config = await integrationSettingsService.getByKey(req.params.key);
    if (!config) return res.status(404).json({ error: 'Integration not found' });
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/integrations/:key', requirePermission('manage_integrations'), async (req, res) => {
  try {
    const config = await integrationSettingsService.update(req.params.key, req.body || {}, getUserId(req));
    if (!config) return res.status(404).json({ error: 'Integration not found' });
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/integrations/:key/test', requirePermission('manage_integrations'), async (req, res) => {
  try {
    await integrationSettingsService.setLastSync(req.params.key, 'test_requested', null);
    res.json({ ok: true, message: 'Test requested; check sync status.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Security ----
router.get('/security', requirePermission('manage_security'), async (req, res) => {
  try {
    const config = await securitySettingsService.getAll();
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/security', requirePermission('manage_security'), async (req, res) => {
  try {
    const config = await securitySettingsService.update(req.body || {}, getUserId(req));
    await auditLogService.log('security_settings', 'security', 'update', null, config, getUserId(req), req.ip, req.get('user-agent'));
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Audit ----
router.get('/audit', requirePermission('view_audit_logs'), async (req, res) => {
  try {
    const result = await auditLogService.list({
      entity_type: req.query.entity_type,
      entity_id: req.query.entity_id,
      changed_by: req.query.changed_by ? parseInt(req.query.changed_by, 10) : undefined,
      from_date: req.query.from_date,
      to_date: req.query.to_date,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/health', (_req, res) => res.json({ ok: true, module: 'settings' }));

// ---- Create Document template settings ----
router.get('/create-documents/templates', requirePermission('view_settings'), async (_req, res) => {
  try {
    const list = await documentTemplateSettingsService.listTemplates();
    res.json(list);
  } catch (e) {
    console.error('GET /api/settings/create-documents/templates', e);
    res.status(500).json({ error: e.message || 'Failed to load templates' });
  }
});

router.post('/create-documents/templates', requirePermission('edit_settings'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Template file is required' });
    const template = await documentTemplateSettingsService.createTemplate({
      name: req.body?.name,
      documentKey: req.body?.document_key,
      description: req.body?.description,
      requiresManualDates: String(req.body?.requires_manual_dates || '').toLowerCase() === 'true',
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileBuffer: req.file.buffer,
      userId: getUserId(req),
    });
    res.status(201).json(template);
  } catch (e) {
    console.error('POST /api/settings/create-documents/templates', e);
    res.status(400).json({ error: e.message || 'Failed to upload template' });
  }
});

router.patch('/create-documents/templates/:id', requirePermission('edit_settings'), async (req, res) => {
  try {
    const updated = await documentTemplateSettingsService.updateTemplate(req.params.id, {
      name: req.body?.name,
      documentKey: req.body?.document_key,
      description: req.body?.description,
      requiresManualDates:
        typeof req.body?.requires_manual_dates === 'boolean' ? req.body.requires_manual_dates : undefined,
      userId: getUserId(req),
    });
    if (!updated) return res.status(404).json({ error: 'Template not found' });
    res.json(updated);
  } catch (e) {
    console.error('PATCH /api/settings/create-documents/templates/:id', e);
    res.status(400).json({ error: e.message || 'Failed to update template' });
  }
});

router.delete('/create-documents/templates/:id', requirePermission('edit_settings'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await documentTemplateSettingsService.deleteTemplate(id);
    if (!deleted) return res.status(404).json({ error: 'Template not found' });
    res.json({ ok: true, deleted });
  } catch (e) {
    console.error('DELETE /api/settings/create-documents/templates/:id', e);
    res.status(500).json({ error: e.message || 'Failed to delete template' });
  }
});

router.get('/create-documents/templates/:id/download', requirePermission('view_settings'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const template = await documentTemplateSettingsService.getTemplateDownload(id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.setHeader('Content-Type', template.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(template.file_name || `template-${id}.docx`)}"`);
    res.send(template.file_content);
  } catch (e) {
    console.error('GET /api/settings/create-documents/templates/:id/download', e);
    res.status(500).json({ error: e.message || 'Failed to download template' });
  }
});

router.post('/create-documents/generate', requirePermission('view_settings'), async (req, res) => {
  try {
    const generated = await createDocumentGenerationService.generateDocumentFromTemplate({
      templateId: req.body?.templateId,
      replacements: req.body?.replacements,
      fileName: req.body?.fileName,
    });
    res.setHeader('Content-Type', generated.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(generated.fileName)}"`);
    res.send(generated.buffer);
  } catch (e) {
    console.error('POST /api/settings/create-documents/generate', e);
    res.status(400).json({ error: e.message || 'Failed to generate document' });
  }
});

// ---- Settings by group key (must be after /lookups, /features, /integrations, /security, /audit) ----
router.get('/:groupKey', requirePermission('view_settings'), async (req, res) => {
  try {
    const config = await settingsService.getByGroupKey(req.params.groupKey);
    if (Object.keys(config).length === 0) return res.status(404).json({ error: 'Group not found' });
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:groupKey', requirePermission('edit_settings'), async (req, res) => {
  try {
    const oldC = await settingsService.getByGroupKey(req.params.groupKey);
    const config = await settingsService.updateGroup(req.params.groupKey, req.body || {}, getUserId(req));
    await auditLogService.log('settings', req.params.groupKey, 'update', oldC, config, getUserId(req), req.ip, req.get('user-agent'));
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:groupKey/reset', requirePermission('restore_defaults'), async (req, res) => {
  try {
    const config = await settingsService.resetGroup(req.params.groupKey, getUserId(req));
    if (!config) return res.status(404).json({ error: 'Group not found' });
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
