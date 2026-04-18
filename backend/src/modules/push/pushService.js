import webpush from 'web-push';
import { query } from '../../db.js';

let tablesReady = false;
let vapidConfigured = false;

function stringOrNull(value, maxLen = 5000) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

function normalizeSubscription(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const endpoint = stringOrNull(raw.endpoint, 4000);
  const keys = raw.keys && typeof raw.keys === 'object' ? raw.keys : {};
  const p256dh = stringOrNull(keys.p256dh, 1024);
  const auth = stringOrNull(keys.auth, 1024);
  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    expirationTime: raw.expirationTime == null ? null : Number(raw.expirationTime) || null,
    keys: {
      p256dh,
      auth,
    },
  };
}

function getVapidConfig() {
  const publicKey = stringOrNull(process.env.WEB_PUSH_VAPID_PUBLIC_KEY, 512);
  const privateKey = stringOrNull(process.env.WEB_PUSH_VAPID_PRIVATE_KEY, 512);
  const subject =
    stringOrNull(process.env.WEB_PUSH_SUBJECT, 500)
    || 'mailto:it@alfamile.com';

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

function ensureVapidConfiguration() {
  const config = getVapidConfig();
  if (!config) return null;
  if (!vapidConfigured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    vapidConfigured = true;
  }
  return config;
}

function normalizeNotificationPayload(payload = {}) {
  return {
    title: stringOrNull(payload.title, 160) || 'FleetCheck reminder',
    body: stringOrNull(payload.body, 1200) || 'Please complete your FleetCheck inspection.',
    icon: stringOrNull(payload.icon, 2000) || '/favicon.png?v=20260417',
    badge: stringOrNull(payload.badge, 2000) || '/favicon.png?v=20260417',
    tag: stringOrNull(payload.tag, 255) || 'fleetcheck-reminder',
    url: stringOrNull(payload.url, 2000) || '/',
    requireInteraction: Boolean(payload.requireInteraction),
    renotify: Boolean(payload.renotify),
    data: payload.data && typeof payload.data === 'object' ? payload.data : {},
  };
}

function isSubscriptionGone(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return statusCode === 404 || statusCode === 410;
}

function uniqueStrings(values = [], maxLen = 128) {
  return [...new Set((Array.isArray(values) ? values : [values]).map((value) => stringOrNull(value, maxLen)).filter(Boolean))];
}

async function resolveIdentityAliases({ kenjoUserId, employeeRef }) {
  const normalizedKenjoUserId = stringOrNull(kenjoUserId, 128);
  const normalizedEmployeeRef = stringOrNull(employeeRef, 128);
  const aliases = {
    kenjoUserIds: uniqueStrings([normalizedKenjoUserId]),
    employeeRefs: uniqueStrings([normalizedEmployeeRef]),
  };

  if (!normalizedKenjoUserId && !normalizedEmployeeRef) {
    return aliases;
  }

  const res = await query(
    `SELECT
       ke.kenjo_user_id::text AS kenjo_user_id,
       ke.employee_number::text AS employee_number,
       ke.transporter_id::text AS transporter_id
     FROM kenjo_employees ke
     WHERE ($1::text IS NOT NULL AND ke.kenjo_user_id::text = $1::text)
        OR ($2::text IS NOT NULL AND (
          ke.employee_number::text = $2::text
          OR ke.transporter_id::text = $2::text
          OR ke.kenjo_user_id::text = $2::text
        ))
     ORDER BY ke.is_active DESC, ke.id ASC
     LIMIT 10`,
    [normalizedKenjoUserId, normalizedEmployeeRef],
  ).catch(() => ({ rows: [] }));

  for (const row of res.rows || []) {
    aliases.kenjoUserIds = uniqueStrings([
      ...aliases.kenjoUserIds,
      row?.kenjo_user_id,
    ]);
    aliases.employeeRefs = uniqueStrings([
      ...aliases.employeeRefs,
      row?.employee_number,
      row?.transporter_id,
    ]);
  }

  return aliases;
}

export class PushService {
  async ensureTables() {
    if (tablesReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS employee_push_devices (
        id SERIAL PRIMARY KEY,
        kenjo_user_id VARCHAR(128),
        employee_ref VARCHAR(128),
        display_name VARCHAR(255),
        endpoint TEXT NOT NULL UNIQUE,
        subscription_json JSONB NOT NULL,
        user_agent TEXT,
        platform VARCHAR(64),
        app_kind VARCHAR(64) NOT NULL DEFAULT 'fleetcheck-pwa',
        permission_state VARCHAR(32),
        last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        disabled_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS kenjo_user_id VARCHAR(128)`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS employee_ref VARCHAR(128)`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS endpoint TEXT`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS subscription_json JSONB NOT NULL DEFAULT '{}'::jsonb`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS user_agent TEXT`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS platform VARCHAR(64)`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS app_kind VARCHAR(64) NOT NULL DEFAULT 'fleetcheck-pwa'`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS permission_state VARCHAR(32)`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`).catch(() => null);
    await query(`ALTER TABLE employee_push_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`).catch(() => null);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_push_devices_endpoint ON employee_push_devices (endpoint)`).catch(() => null);
    await query(`CREATE INDEX IF NOT EXISTS idx_employee_push_devices_employee ON employee_push_devices (kenjo_user_id, employee_ref, disabled_at)`).catch(() => null);

    tablesReady = true;
  }

  getPublicConfig() {
    const config = getVapidConfig();
    return {
      enabled: Boolean(config),
      publicKey: config?.publicKey || null,
      appKind: 'fleetcheck-pwa',
    };
  }

  async registerDevice(payload = {}) {
    await this.ensureTables();
    const subscription = normalizeSubscription(payload.subscription);
    const kenjoUserId = stringOrNull(payload.kenjoUserId, 128);
    const employeeRef = stringOrNull(payload.employeeRef, 128);

    if (!subscription) {
      throw new Error('Push subscription is required');
    }
    if (!kenjoUserId && !employeeRef) {
      throw new Error('Employee reference is required');
    }

    const res = await query(
      `INSERT INTO employee_push_devices (
         kenjo_user_id,
         employee_ref,
         display_name,
         endpoint,
         subscription_json,
         user_agent,
         platform,
         app_kind,
         permission_state,
         last_seen_at,
         disabled_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, NOW(), NULL, NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         kenjo_user_id = EXCLUDED.kenjo_user_id,
         employee_ref = EXCLUDED.employee_ref,
         display_name = EXCLUDED.display_name,
         subscription_json = EXCLUDED.subscription_json,
         user_agent = EXCLUDED.user_agent,
         platform = EXCLUDED.platform,
         app_kind = EXCLUDED.app_kind,
         permission_state = EXCLUDED.permission_state,
         last_seen_at = NOW(),
         disabled_at = NULL,
         updated_at = NOW()
       RETURNING id, kenjo_user_id, employee_ref, display_name, endpoint, platform, app_kind, permission_state, last_seen_at, disabled_at, created_at, updated_at`,
      [
        kenjoUserId,
        employeeRef,
        stringOrNull(payload.displayName, 255),
        subscription.endpoint,
        JSON.stringify(subscription),
        stringOrNull(payload.userAgent, 2000),
        stringOrNull(payload.platform, 64),
        stringOrNull(payload.appKind, 64) || 'fleetcheck-pwa',
        stringOrNull(payload.permissionState, 32),
      ],
    );

    return res.rows?.[0] || null;
  }

  async unregisterDevice(payload = {}) {
    await this.ensureTables();
    const endpoint = stringOrNull(payload.endpoint, 4000);
    if (!endpoint) {
      throw new Error('Subscription endpoint is required');
    }

    const res = await query(
      `UPDATE employee_push_devices
       SET disabled_at = NOW(),
           updated_at = NOW()
       WHERE endpoint = $1
       RETURNING id, endpoint`,
      [endpoint],
    );

    return {
      endpoint,
      disabled: Boolean(res.rows?.[0]),
    };
  }

  async disableDevice(endpoint) {
    const normalizedEndpoint = stringOrNull(endpoint, 4000);
    if (!normalizedEndpoint) return;
    await query(
      `UPDATE employee_push_devices
       SET disabled_at = NOW(),
           updated_at = NOW()
       WHERE endpoint = $1`,
      [normalizedEndpoint],
    ).catch(() => null);
  }

  async listActiveDevicesForEmployee({ kenjoUserId, employeeRef }) {
    await this.ensureTables();
    const aliases = await resolveIdentityAliases({ kenjoUserId, employeeRef });
    if (!aliases.kenjoUserIds.length && !aliases.employeeRefs.length) return [];

    const res = await query(
      `SELECT id, kenjo_user_id, employee_ref, display_name, endpoint, subscription_json, platform, app_kind
       FROM employee_push_devices
       WHERE disabled_at IS NULL
         AND (
           (COALESCE(array_length($1::text[], 1), 0) > 0 AND kenjo_user_id = ANY($1::text[]))
           OR (COALESCE(array_length($2::text[], 1), 0) > 0 AND employee_ref = ANY($2::text[]))
         )
       ORDER BY updated_at DESC, id DESC`,
      [aliases.kenjoUserIds, aliases.employeeRefs],
    ).catch(() => ({ rows: [] }));

    return res.rows || [];
  }

  async sendNotificationToEmployee(identity = {}, payload = {}) {
    const config = ensureVapidConfiguration();
    if (!config) {
      return {
        configured: false,
        deviceCount: 0,
        sentCount: 0,
        failedCount: 0,
        lastError: 'Web Push is not configured on the server',
      };
    }

    const devices = await this.listActiveDevicesForEmployee(identity);
    if (!devices.length) {
      return {
        configured: true,
        deviceCount: 0,
        sentCount: 0,
        failedCount: 0,
        lastError: null,
      };
    }

    const notification = normalizeNotificationPayload(payload);
    let sentCount = 0;
    let failedCount = 0;
    let lastError = null;

    for (const device of devices) {
      try {
        await webpush.sendNotification(
          device.subscription_json,
          JSON.stringify(notification),
          {
            TTL: 60,
            urgency: 'high',
          },
        );
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        lastError = String(error?.body || error?.message || error || 'Push send failed');
        if (isSubscriptionGone(error)) {
          await this.disableDevice(device.endpoint);
        }
      }
    }

    return {
      configured: true,
      deviceCount: devices.length,
      sentCount,
      failedCount,
      lastError,
    };
  }
}

export default new PushService();
