/**
 * Seed default Settings data: roles, permissions, role_permissions,
 * settings_groups, lookup_groups, feature_flags, integration shells, security.
 * Idempotent: uses ON CONFLICT / INSERT only when missing.
 * If INITIAL_SUPERADMIN_EMAIL and INITIAL_SUPERADMIN_PASSWORD are set, creates/updates that user as SuperAdmin with login enabled.
 * Run from backend folder: node scripts/seed-settings.js (or from project root; .env is loaded from backend/)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { query } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SALT_ROUNDS = 12;

const ROLES = [
  { code: 'super_admin', name: 'Super Admin', description: 'Full system access', is_system_role: true, priority: 1000 },
  { code: 'admin', name: 'Admin', description: 'Administrator', is_system_role: true, priority: 900 },
  { code: 'manager', name: 'Manager', description: 'Manager', is_system_role: true, priority: 700 },
  { code: 'dispatcher', name: 'Dispatcher', description: 'Dispatcher', is_system_role: true, priority: 500 },
  { code: 'viewer', name: 'Viewer', description: 'Read-only', is_system_role: true, priority: 100 },
  { code: 'payroll_manager', name: 'Payroll Manager', description: 'Payroll management', is_system_role: true, priority: 600 },
  { code: 'hr_manager', name: 'HR Manager', description: 'HR management', is_system_role: true, priority: 650 },
  { code: 'fleet_manager', name: 'Fleet Manager', description: 'Fleet/cars management', is_system_role: true, priority: 550 },
];

const PERMISSIONS = [
  { code: 'view_settings', label: 'View Settings', category: 'settings' },
  { code: 'edit_settings', label: 'Edit Settings', category: 'settings' },
  { code: 'manage_users', label: 'Manage Users', category: 'users' },
  { code: 'manage_roles', label: 'Manage Roles', category: 'roles' },
  { code: 'manage_permissions', label: 'Manage Permissions', category: 'roles' },
  { code: 'manage_kpi', label: 'Manage KPI', category: 'reports' },
  { code: 'manage_payroll_settings', label: 'Manage Payroll Settings', category: 'payroll' },
  { code: 'manage_driver_settings', label: 'Manage Driver Settings', category: 'drivers' },
  { code: 'manage_fleet_settings', label: 'Manage Fleet Settings', category: 'cars' },
  { code: 'manage_route_settings', label: 'Manage Route Settings', category: 'routes' },
  { code: 'manage_integrations', label: 'Manage Integrations', category: 'integrations' },
  { code: 'manage_feature_flags', label: 'Manage Feature Flags', category: 'integrations' },
  { code: 'manage_notifications', label: 'Manage Notifications', category: 'notifications' },
  { code: 'manage_security', label: 'Manage Security', category: 'security' },
  { code: 'view_audit_logs', label: 'View Audit Logs', category: 'security' },
  { code: 'export_settings', label: 'Export Settings', category: 'settings' },
  { code: 'restore_defaults', label: 'Restore Defaults', category: 'settings' },

  // Main app navigation (sidebar) — one permission per route; re-seed updates labels/paths
  { code: 'page_dashboard', label: 'Dashboard', category: 'pages', description: '/dashboard' },
  { code: 'page_employees', label: 'Employee list (Kenjo)', category: 'pages', description: '/' },
  { code: 'page_payroll', label: 'Payroll', category: 'pages', description: '/payroll' },
  { code: 'page_cortex_uploads', label: 'Cortex attendance uploads', category: 'pages', description: '/calendar' },
  { code: 'page_scorecard_uploads', label: 'Scorecard uploads', category: 'pages', description: '/scorecard-uploads' },
  { code: 'page_kenjo_calendar', label: 'Kenjo calendar', category: 'pages', description: '/kenjo-calendar' },
  { code: 'page_sync_kenjo', label: 'Sync with Kenjo', category: 'pages', description: '/sync-kenjo' },
  { code: 'page_o2_telefonica', label: 'O2 Telefonica', category: 'pages', description: '/o2-telefonica' },
  { code: 'page_cars', label: 'Cars', category: 'pages', description: '/cars' },
  { code: 'page_pave', label: 'PAVE inspections', category: 'pages', description: '/pave' },
  { code: 'page_analytics', label: 'Analytics', category: 'pages', description: '/analytics' },
  { code: 'page_gift_cards', label: 'Gift cards', category: 'pages', description: '/gift-cards' },
  { code: 'page_car_planning', label: 'Car planning', category: 'pages', description: '/car-planning' },
  { code: 'page_fines', label: 'Fines', category: 'pages', description: '/fines' },
  { code: 'page_damages', label: 'Damages', category: 'pages', description: '/damages' },
  { code: 'page_insurance', label: 'Insurance', category: 'pages', description: '/insurance' },
  { code: 'page_settings', label: 'Settings', category: 'pages', description: '/settings' },
];

const SETTINGS_GROUPS = [
  { key: 'general', label: 'General', description: 'General application settings', sort_order: 10 },
  { key: 'kpi', label: 'KPI', description: 'KPI thresholds and targets', sort_order: 20 },
  { key: 'payroll', label: 'Payroll', description: 'Payroll configuration', sort_order: 30 },
  { key: 'drivers', label: 'Drivers', description: 'Driver-related settings', sort_order: 40 },
  { key: 'cars', label: 'Cars', description: 'Fleet/car settings', sort_order: 50 },
  { key: 'routes', label: 'Routes', description: 'Route and dispatch settings', sort_order: 60 },
  { key: 'notifications', label: 'Notifications', description: 'Notification preferences', sort_order: 70 },
  { key: 'security', label: 'Security', description: 'Security settings', sort_order: 80 },
  { key: 'advanced', label: 'Advanced', description: 'Advanced configuration', sort_order: 90 },
];

const SETTINGS_ITEMS = [
  { group_key: 'kpi', key: 'delivery_completion_target', label: 'Delivery completion target %', value_type: 'number', value_number: 95, default_value_json: '95', unit: '%' },
  { group_key: 'kpi', key: 'attendance_target', label: 'Attendance target %', value_type: 'number', value_number: 95, default_value_json: '95', unit: '%' },
  { group_key: 'kpi', key: 'safety_score_threshold', label: 'Safety score threshold', value_type: 'number', value_number: 85, default_value_json: '85' },
  { group_key: 'kpi', key: 'customer_complaint_threshold', label: 'Customer complaint threshold', value_type: 'number', value_number: 3, default_value_json: '3' },
  { group_key: 'payroll', key: 'calculation_month_format', label: 'Calculation month format', value_type: 'string', value_text: 'YYMM', default_value_json: '"YYMM"' },
  { group_key: 'payroll', key: 'zero_value_export_behavior', label: 'Zero value export', value_type: 'string', value_text: 'empty', default_value_json: '"empty"' },
  { group_key: 'payroll', key: 'currency', label: 'Currency', value_type: 'string', value_text: 'EUR', default_value_json: '"EUR"' },
  { group_key: 'payroll', key: 'payroll_lock_day', label: 'Payroll lock day of month', value_type: 'number', value_number: 5, default_value_json: '5' },
  { group_key: 'cars', key: 'maintenance_interval_km', label: 'Maintenance interval (km)', value_type: 'number', value_number: 15000, default_value_json: '15000', unit: 'km' },
  { group_key: 'cars', key: 'registration_expiry_warning_days', label: 'Registration expiry warning (days)', value_type: 'number', value_number: 30, default_value_json: '30' },
  { group_key: 'cars', key: 'insurance_expiry_warning_days', label: 'Insurance expiry warning (days)', value_type: 'number', value_number: 30, default_value_json: '30' },
  { group_key: 'routes', key: 'route_completion_threshold', label: 'Route completion threshold %', value_type: 'number', value_number: 95, default_value_json: '95', unit: '%' },
  { group_key: 'routes', key: 'rescue_route_label', label: 'Rescue route label', value_type: 'string', value_text: 'Rescue', default_value_json: '"Rescue"' },
  { group_key: 'routes', key: 'dropped_route_reason_required', label: 'Dropped route reason required', value_type: 'boolean', value_boolean: true, default_value_json: 'true' },
];

const LOOKUP_GROUPS = [
  'user_statuses', 'driver_statuses', 'car_statuses', 'route_statuses', 'payroll_statuses',
  'termination_reasons', 'complaint_categories', 'incident_types', 'damage_types', 'maintenance_types',
  'stations', 'departments', 'employment_types', 'payroll_labels', 'deduction_types', 'bonus_types', 'document_types', 'notification_types',
];

const FEATURE_FLAGS = [
  { key: 'enable_pave', label: 'Enable PAVE', description: 'Enable PAVE inspection integration' },
  { key: 'enable_payroll_export', label: 'Enable Payroll Export', description: 'Enable ADP/Excel export' },
  { key: 'enable_driver_risk_score', label: 'Driver Risk Score', description: 'Show driver risk score' },
  { key: 'enable_cars_analytics', label: 'Cars Analytics', description: 'Enable cars analytics' },
  { key: 'enable_manual_adjustments', label: 'Manual Adjustments', description: 'Allow manual payroll adjustments' },
  { key: 'enable_bulk_user_import', label: 'Bulk User Import', description: 'Bulk user import' },
  { key: 'enable_advanced_settings', label: 'Advanced Settings', description: 'Show advanced settings UI' },
  { key: 'enable_sms_notifications', label: 'SMS Notifications', description: 'Enable SMS notifications' },
  { key: 'enable_document_expiry_alerts', label: 'Document Expiry Alerts', description: 'Alert on document expiry' },
];

const INTEGRATIONS = [
  { integration_key: 'pave', label: 'PAVE' },
  { integration_key: 'adp', label: 'ADP' },
  { integration_key: 'kenjo', label: 'Kenjo' },
  { integration_key: 'email_service', label: 'Email Service' },
  { integration_key: 'sms_service', label: 'SMS Service' },
];

const SECURITY_KEYS = [
  { key: 'password_policy', label: 'Password policy' },
  { key: 'session_timeout_minutes', label: 'Session timeout (minutes)' },
  { key: 'max_login_attempts', label: 'Max login attempts' },
  { key: 'lockout_duration_minutes', label: 'Lockout duration (minutes)' },
  { key: 'invite_expiration_hours', label: 'Invite expiration (hours)' },
  { key: 'force_mfa', label: 'Force MFA' },
  { key: 'ip_allowlist_enabled', label: 'IP allowlist enabled' },
  { key: 'audit_retention_days', label: 'Audit retention (days)' },
];

async function run() {
  try {
    for (const r of ROLES) {
      await query(
        `INSERT INTO settings_roles (code, name, description, is_system_role, priority) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE SET name = $2, description = $3, is_system_role = $4, priority = $5, updated_at = NOW()`,
        [r.code, r.name, r.description || null, r.is_system_role, r.priority]
      );
    }
    console.log('Seeded roles');

    for (const p of PERMISSIONS) {
      await query(
        `INSERT INTO settings_permissions (code, label, category, description) VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, category = EXCLUDED.category, description = EXCLUDED.description, updated_at = NOW()`,
        [p.code, p.label, p.category, p.description ?? null]
      );
    }
    console.log('Seeded permissions');

    const roleRows = (await query('SELECT id, code FROM settings_roles')).rows;
    const permRows = (await query('SELECT id, code FROM settings_permissions')).rows;
    const roleById = Object.fromEntries(roleRows.map((r) => [r.code, r.id]));
    const permById = Object.fromEntries(permRows.map((p) => [p.code, p.id]));

    const superAdminId = roleById.super_admin;
    const adminId = roleById.admin;
    if (superAdminId) {
      for (const pid of permRows.map((p) => p.id)) {
        await query(
          `INSERT INTO settings_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [superAdminId, pid]
        );
      }
    }
    if (adminId) {
      for (const pid of permRows.map((p) => p.id)) {
        await query(
          `INSERT INTO settings_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [adminId, pid]
        );
      }
    }
    console.log('Seeded role_permissions (super_admin + admin get all)');

    for (const g of SETTINGS_GROUPS) {
      await query(
        `INSERT INTO settings_groups (key, label, description, sort_order) VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET label = $2, description = $3, sort_order = $4, updated_at = NOW()`,
        [g.key, g.label, g.description || null, g.sort_order]
      );
    }
    console.log('Seeded settings_groups');

    const groupRows = (await query('SELECT id, key FROM settings_groups')).rows;
    const groupByKey = Object.fromEntries(groupRows.map((r) => [r.key, r.id]));
    for (const item of SETTINGS_ITEMS) {
      const gid = groupByKey[item.group_key];
      if (!gid) continue;
      const defVal = typeof item.default_value_json === 'string' ? item.default_value_json : JSON.stringify(item.default_value_json);
      await query(
        `INSERT INTO settings_items (group_id, key, label, value_type, value_text, value_number, value_boolean, default_value_json, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 0)
         ON CONFLICT (group_id, key) DO UPDATE SET label = EXCLUDED.label, value_type = EXCLUDED.value_type, default_value_json = EXCLUDED.default_value_json, unit = EXCLUDED.unit, updated_at = NOW()`,
        [gid, item.key, item.label, item.value_type || 'string', item.value_text ?? null, item.value_number ?? null, item.value_boolean ?? null, defVal, item.unit ?? null]
      );
    }
    console.log('Seeded settings_items');

    for (const key of LOOKUP_GROUPS) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      await query(
        `INSERT INTO settings_lookup_groups (key, label, description) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET label = $2, updated_at = NOW()`,
        [key, label, null]
      );
    }
    console.log('Seeded lookup_groups');

    for (const f of FEATURE_FLAGS) {
      await query(
        `INSERT INTO settings_feature_flags (key, label, description, enabled) VALUES ($1, $2, $3, false)
         ON CONFLICT (key) DO UPDATE SET label = $2, description = $3, updated_at = NOW()`,
        [f.key, f.label, f.description || null]
      );
    }
    console.log('Seeded feature_flags');

    for (const i of INTEGRATIONS) {
      await query(
        `INSERT INTO settings_integrations (integration_key, label, is_enabled) VALUES ($1, $2, false)
         ON CONFLICT (integration_key) DO UPDATE SET label = $2, updated_at = NOW()`,
        [i.integration_key, i.label]
      );
    }
    console.log('Seeded integration_settings');

    for (const s of SECURITY_KEYS) {
      await query(
        `INSERT INTO settings_security (key, label, value_json) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT (key) DO UPDATE SET label = $2, updated_at = NOW()`,
        [s.key, s.label]
      );
    }
    console.log('Seeded security_settings');

    const superAdminRole = (await query('SELECT id FROM settings_roles WHERE code = $1', ['super_admin'])).rows[0];
    const userCount = (await query('SELECT COUNT(*)::int AS c FROM settings_users')).rows[0]?.c ?? 0;

    const initialEmail = process.env.INITIAL_SUPERADMIN_EMAIL?.trim();
    const initialPassword = process.env.INITIAL_SUPERADMIN_PASSWORD;
    if (initialEmail && initialPassword && superAdminRole) {
      const hash = await bcrypt.hash(initialPassword, SALT_ROUNDS);
      await query(
        `INSERT INTO settings_users (first_name, last_name, full_name, email, role_id, status, password_hash, login_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT (email) DO UPDATE SET role_id = $5, status = 'active', password_hash = $7, login_enabled = true, updated_at = NOW()`,
        ['Super', 'Admin', 'Super Admin', initialEmail, superAdminRole.id, 'active', hash]
      );
      console.log('Seeded initial SuperAdmin from env:', initialEmail);
    } else if (userCount === 0 && superAdminRole) {
      await query(
        `INSERT INTO settings_users (first_name, last_name, full_name, email, role_id, status, login_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, false) ON CONFLICT (email) DO NOTHING`,
        ['Admin', 'User', 'Admin User', 'admin@local', superAdminRole.id, 'active']
      );
      console.log('Seeded default admin user (admin@local). Set INITIAL_SUPERADMIN_EMAIL and INITIAL_SUPERADMIN_PASSWORD to enable login, or use auth reset-password.');
    }

    console.log('Seed complete.');
  } catch (e) {
    console.error('Seed failed:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

run();
