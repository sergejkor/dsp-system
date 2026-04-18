import { query } from '../../db.js';
import settingsService from '../settings/settingsService.js';
import pushService from '../push/pushService.js';
import { normalizePhoneForWhatsApp, sendWhatsAppMessage } from './twilioWhatsAppService.js';

let tablesReady = false;

function stringOrNull(value, maxLen = 5000) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

function toInteger(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function parseTimeParts(value) {
  const raw = stringOrNull(value, 32) || '10:00';
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hours: 10, minutes: 0, normalized: '10:00' };
  }
  const hours = Math.min(Math.max(Number(match[1]), 0), 23);
  const minutes = Math.min(Math.max(Number(match[2]), 0), 59);
  return {
    hours,
    minutes,
    normalized: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  };
}

export function normalizeReminderConfig(rawConfig = {}) {
  const getValue = (key) => rawConfig?.[key]?.value;
  const startTime = parseTimeParts(getValue('reminder_start_time'));
  const intervalMinutes = Math.min(Math.max(toInteger(getValue('reminder_interval_minutes'), 60) || 60, 5), 12 * 60);
  return {
    enabled: getValue('enabled') !== false,
    reminderMessage:
      stringOrNull(getValue('reminder_message'), 4000)
      || "Hi {{driverName}}, please complete today's internal inspection for {{licensePlate}}: {{inspectionUrl}}",
    reminderStartTime: startTime.normalized,
    reminderStartHours: startTime.hours,
    reminderStartMinutes: startTime.minutes,
    reminderIntervalMinutes: intervalMinutes,
    publicBaseUrl:
      stringOrNull(getValue('public_base_url'), 2000)
      || stringOrNull(process.env.FLEETCHECK_PUBLIC_BASE_URL, 2000)
      || 'https://fleetcheck.alfamile.com',
    defaultCountryCode:
      stringOrNull(getValue('default_country_code'), 8)
      || stringOrNull(process.env.INTERNAL_INSPECTION_DEFAULT_COUNTRY_CODE, 8)
      || '+49',
  };
}

function buildLocalDateTime(planDate, hours, minutes) {
  const normalizedDate = toDateOnly(planDate);
  if (!normalizedDate) return null;
  const [year, month, day] = normalizedDate.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function buildInspectionUrl(baseUrl, vin) {
  const safeBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!safeBase) return null;
  const normalizedVin = String(vin || '').trim();
  if (!normalizedVin) return `${safeBase}/fleet-check`;
  return `${safeBase}/fleet-check?vin=${encodeURIComponent(normalizedVin)}`;
}

export function renderReminderMessage(template, variables) {
  const source = String(template || '');
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = variables?.[key];
    return value == null ? '' : String(value);
  }).trim();
}

function computeInitialReminderAt(planDate, config, now = new Date()) {
  const startAt = buildLocalDateTime(planDate, config.reminderStartHours, config.reminderStartMinutes);
  if (!startAt) return null;
  if (toDateOnly(planDate) !== toDateOnly(now)) {
    return startAt;
  }
  return startAt > now ? startAt : now;
}

function mapTaskRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: toInteger(row.id, row.id),
    car_id: toInteger(row.car_id, row.car_id),
    completed_inspection_id: toInteger(row.completed_inspection_id, row.completed_inspection_id),
    reminder_count: toInteger(row.reminder_count, 0),
    inspection_new_damages_count: toInteger(row.inspection_new_damages_count, 0),
    plan_date: toDateOnly(row.plan_date),
    reminder_start_at: toIso(row.reminder_start_at),
    next_reminder_at: toIso(row.next_reminder_at),
    last_reminder_at: toIso(row.last_reminder_at),
    completed_at: toIso(row.completed_at),
    failed_at: toIso(row.failed_at),
    cancelled_at: toIso(row.cancelled_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

async function resolveReminderSettings() {
  const config = await settingsService.getByGroupKey('internal_inspections').catch(() => ({}));
  return normalizeReminderConfig(config);
}

async function findMatchingDriverContact(driverIdentifier, preferredKenjoUserId = null) {
  const normalizedDriver = stringOrNull(driverIdentifier, 255);
  const normalizedKenjoUserId = stringOrNull(preferredKenjoUserId, 128);
  if (!normalizedDriver && !normalizedKenjoUserId) {
    return {
      driverName: null,
      employeeRef: null,
      kenjoUserId: null,
      phone: null,
    };
  }

  const res = await query(
    `SELECT
       ke.employee_number::text AS employee_number,
       ke.kenjo_user_id::text AS kenjo_user_id,
       ke.transporter_id::text AS transporter_id,
       ke.display_name,
       ke.first_name,
       ke.last_name,
       ke.whatsapp_number
     FROM kenjo_employees ke
     WHERE ($1::text IS NOT NULL AND ke.kenjo_user_id::text = $1::text)
        OR ($2::text IS NOT NULL AND (
          LOWER(COALESCE(ke.display_name, '')) = LOWER($2::text)
          OR LOWER(TRIM(COALESCE(ke.first_name, '') || ' ' || COALESCE(ke.last_name, ''))) = LOWER($2::text)
          OR LOWER(COALESCE(ke.employee_number::text, '')) = LOWER($2::text)
          OR LOWER(COALESCE(ke.transporter_id::text, '')) = LOWER($2::text)
          OR LOWER(COALESCE(ke.kenjo_user_id::text, '')) = LOWER($2::text)
        ))
     ORDER BY
       CASE WHEN $1::text IS NOT NULL AND ke.kenjo_user_id::text = $1::text THEN 0 ELSE 1 END,
       ke.is_active DESC,
       ke.id ASC
     LIMIT 1`,
    [normalizedKenjoUserId, normalizedDriver],
  ).catch(() => ({ rows: [] }));

  const row = res.rows?.[0];
  return {
    driverName:
      stringOrNull(row?.display_name, 255)
      || stringOrNull([row?.first_name, row?.last_name].filter(Boolean).join(' '), 255)
      || normalizedDriver
      || normalizedKenjoUserId,
    employeeRef: stringOrNull(row?.employee_number, 128) || stringOrNull(row?.transporter_id, 128),
    kenjoUserId: stringOrNull(row?.kenjo_user_id, 128),
    phone: stringOrNull(row?.whatsapp_number, 255),
  };
}

async function getExistingInspectionMap(planDates, carIds) {
  const normalizedDates = Array.isArray(planDates) ? [...new Set(planDates.map((value) => toDateOnly(value)).filter(Boolean))] : [];
  const normalizedCarIds = Array.isArray(carIds) ? [...new Set(carIds.map((value) => toInteger(value, null)).filter(Number.isFinite))] : [];
  if (!normalizedDates.length || !normalizedCarIds.length) {
    return new Map();
  }

  const res = await query(
    `SELECT DISTINCT ON (car_id, submitted_at::date)
       id,
       car_id,
       submitted_at::date AS inspection_date,
       overall_result,
       new_damages_count
     FROM vehicle_internal_inspections
     WHERE car_id = ANY($1::int[])
       AND submitted_at::date = ANY($2::date[])
     ORDER BY car_id, submitted_at::date, submitted_at DESC, id DESC`,
    [normalizedCarIds, normalizedDates],
  ).catch(() => ({ rows: [] }));

  const map = new Map();
  for (const row of res.rows || []) {
    map.set(`${row.car_id}|${toDateOnly(row.inspection_date)}`, {
      inspectionId: toInteger(row.id, row.id),
      overallResult: stringOrNull(row.overall_result, 64),
      newDamagesCount: toInteger(row.new_damages_count, 0),
    });
  }
  return map;
}

async function upsertTaskFromPlanningRow(row, existingTask, inspectionMap, config, now = new Date()) {
  const key = `${row.car_id}|${toDateOnly(row.plan_date)}`;
  const completedInspection = inspectionMap.get(key) || null;
  const driver = await findMatchingDriverContact(row.driver_identifier);
  const reminderStartAt = computeInitialReminderAt(row.plan_date, config, now);
  const inspectionUrl = buildInspectionUrl(config.publicBaseUrl, row.vin);

  const nextStatus = completedInspection
    ? 'completed'
    : existingTask?.status === 'reminded'
      ? 'reminded'
      : existingTask?.status === 'cancelled'
        ? 'pending'
        : existingTask?.status || 'pending';

  const nextReminderAt = completedInspection
    ? null
    : existingTask?.next_reminder_at
      ? new Date(existingTask.next_reminder_at)
      : reminderStartAt;

  const params = [
    row.car_id,
    toDateOnly(row.plan_date),
    stringOrNull(row.vehicle_id, 255),
    stringOrNull(row.license_plate, 64),
    stringOrNull(row.vin, 64),
    stringOrNull(row.driver_identifier, 255),
    driver.employeeRef,
    driver.kenjoUserId,
    driver.phone,
    nextStatus,
    reminderStartAt ? reminderStartAt.toISOString() : null,
    nextReminderAt ? nextReminderAt.toISOString() : null,
    completedInspection?.inspectionId || null,
    completedInspection ? new Date().toISOString() : null,
    reminderStartAt ? config.reminderMessage : null,
    inspectionUrl,
  ];

  await query(
    `INSERT INTO vehicle_internal_inspection_tasks (
       car_id,
       plan_date,
       vehicle_id,
       license_plate,
       vin,
       driver_identifier,
       driver_employee_ref,
       driver_kenjo_user_id,
       driver_phone,
       status,
       reminder_start_at,
       next_reminder_at,
       completed_inspection_id,
       completed_at,
       reminder_message_template,
       inspection_url,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
     ON CONFLICT (car_id, plan_date) DO UPDATE SET
       vehicle_id = EXCLUDED.vehicle_id,
       license_plate = EXCLUDED.license_plate,
       vin = EXCLUDED.vin,
       driver_identifier = EXCLUDED.driver_identifier,
       driver_employee_ref = EXCLUDED.driver_employee_ref,
       driver_kenjo_user_id = EXCLUDED.driver_kenjo_user_id,
       driver_phone = EXCLUDED.driver_phone,
       status = CASE
         WHEN vehicle_internal_inspection_tasks.status = 'completed' THEN vehicle_internal_inspection_tasks.status
         ELSE EXCLUDED.status
       END,
       reminder_start_at = EXCLUDED.reminder_start_at,
       next_reminder_at = CASE
         WHEN vehicle_internal_inspection_tasks.status = 'completed' THEN NULL
         WHEN vehicle_internal_inspection_tasks.last_reminder_status = 'missing_phone' AND EXCLUDED.driver_phone IS NOT NULL THEN EXCLUDED.reminder_start_at
         WHEN vehicle_internal_inspection_tasks.next_reminder_at IS NOT NULL THEN vehicle_internal_inspection_tasks.next_reminder_at
         ELSE EXCLUDED.next_reminder_at
       END,
       completed_inspection_id = COALESCE(EXCLUDED.completed_inspection_id, vehicle_internal_inspection_tasks.completed_inspection_id),
       completed_at = COALESCE(EXCLUDED.completed_at, vehicle_internal_inspection_tasks.completed_at),
       reminder_message_template = EXCLUDED.reminder_message_template,
       inspection_url = EXCLUDED.inspection_url,
       cancelled_at = NULL,
       updated_at = NOW()`,
    params,
  );
}

export class InspectionReminderService {
  async ensureTables() {
    if (tablesReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS vehicle_internal_inspection_tasks (
        id SERIAL PRIMARY KEY,
        car_id INT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        plan_date DATE NOT NULL,
        vehicle_id VARCHAR(255),
        license_plate VARCHAR(64),
        vin VARCHAR(64),
        driver_identifier VARCHAR(255),
        driver_employee_ref VARCHAR(128),
        driver_kenjo_user_id VARCHAR(128),
        driver_phone VARCHAR(255),
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        reminder_start_at TIMESTAMP WITH TIME ZONE,
        next_reminder_at TIMESTAMP WITH TIME ZONE,
        last_reminder_at TIMESTAMP WITH TIME ZONE,
        last_reminder_status VARCHAR(64),
        last_reminder_sid VARCHAR(128),
        last_reminder_error TEXT,
        reminder_count INT NOT NULL DEFAULT 0,
        reminder_message_template TEXT,
        inspection_url TEXT,
        completed_inspection_id INT REFERENCES vehicle_internal_inspections(id) ON DELETE SET NULL,
        completed_at TIMESTAMP WITH TIME ZONE,
        failed_at TIMESTAMP WITH TIME ZONE,
        cancelled_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (car_id, plan_date)
      )
    `);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS vehicle_id VARCHAR(255)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS license_plate VARCHAR(64)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS vin VARCHAR(64)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS driver_identifier VARCHAR(255)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS driver_employee_ref VARCHAR(128)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS driver_kenjo_user_id VARCHAR(128)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(255)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending'`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS reminder_start_at TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS last_reminder_status VARCHAR(64)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS last_reminder_sid VARCHAR(128)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS last_reminder_error TEXT`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS reminder_count INT NOT NULL DEFAULT 0`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS reminder_message_template TEXT`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS inspection_url TEXT`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS completed_inspection_id INT REFERENCES vehicle_internal_inspections(id) ON DELETE SET NULL`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`).catch(() => null);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_internal_inspection_tasks_car_plan_date ON vehicle_internal_inspection_tasks (car_id, plan_date)`).catch(() => null);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspection_tasks_status ON vehicle_internal_inspection_tasks (status, plan_date DESC, id DESC)`).catch(() => null);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspection_tasks_next_reminder ON vehicle_internal_inspection_tasks (next_reminder_at, status)`).catch(() => null);

    await query(`
      CREATE TABLE IF NOT EXISTS vehicle_internal_inspection_reminder_logs (
        id SERIAL PRIMARY KEY,
        task_id INT NOT NULL REFERENCES vehicle_internal_inspection_tasks(id) ON DELETE CASCADE,
        channel VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
        status VARCHAR(64) NOT NULL,
        sent_to VARCHAR(255),
        provider_message_id VARCHAR(128),
        error_message TEXT,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE vehicle_internal_inspection_reminder_logs ADD COLUMN IF NOT EXISTS channel VARCHAR(32) NOT NULL DEFAULT 'whatsapp'`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_reminder_logs ADD COLUMN IF NOT EXISTS sent_to VARCHAR(255)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_reminder_logs ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(128)`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_reminder_logs ADD COLUMN IF NOT EXISTS error_message TEXT`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_reminder_logs ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspection_reminder_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`).catch(() => null);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspection_reminder_logs_task ON vehicle_internal_inspection_reminder_logs (task_id, created_at DESC, id DESC)`).catch(() => null);

    tablesReady = true;
  }

  async syncTasksForPlanDates(planDates = [], options = {}) {
    await this.ensureTables();

    const normalizedDates = [...new Set((Array.isArray(planDates) ? planDates : [planDates]).map((value) => toDateOnly(value)).filter(Boolean))];
    if (!normalizedDates.length) return [];

    const config = await resolveReminderSettings();
    const planningRes = await query(
      `SELECT
         p.car_id,
         p.plan_date::text AS plan_date,
         p.driver_identifier,
         c.vehicle_id,
         c.license_plate,
         c.vin
       FROM car_planning p
       INNER JOIN cars c ON c.id = p.car_id
       WHERE p.plan_date = ANY($1::date[])
         AND p.abfahrtskontrolle = TRUE`,
      [normalizedDates],
    );
    const planningRows = (planningRes.rows || []).filter((row) => stringOrNull(row.driver_identifier, 255));

    const existingRes = await query(
      `SELECT *
       FROM vehicle_internal_inspection_tasks
       WHERE plan_date = ANY($1::date[])`,
      [normalizedDates],
    );
    const existingByKey = new Map((existingRes.rows || []).map((row) => [`${row.car_id}|${toDateOnly(row.plan_date)}`, row]));

    const inspectionMap = await getExistingInspectionMap(
      normalizedDates,
      planningRows.map((row) => row.car_id),
    );

    const activeKeys = new Set();
    for (const row of planningRows) {
      const key = `${row.car_id}|${toDateOnly(row.plan_date)}`;
      activeKeys.add(key);
      await upsertTaskFromPlanningRow(row, existingByKey.get(key), inspectionMap, config, options.now || new Date());
    }

    for (const row of existingRes.rows || []) {
      const key = `${row.car_id}|${toDateOnly(row.plan_date)}`;
      if (activeKeys.has(key)) continue;
      if (row.status === 'completed') continue;
      await query(
        `UPDATE vehicle_internal_inspection_tasks
         SET status = 'cancelled',
             next_reminder_at = NULL,
             cancelled_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [row.id],
      );
    }

    return this.listTasks({ dateFrom: normalizedDates[0], dateTo: normalizedDates[normalizedDates.length - 1], limit: 200 });
  }

  async markOverdueTasksFailed(now = new Date()) {
    await this.ensureTables();
    const today = toDateOnly(now);
    const res = await query(
      `UPDATE vehicle_internal_inspection_tasks
       SET status = 'failed',
           failed_at = COALESCE(failed_at, NOW()),
           next_reminder_at = NULL,
           updated_at = NOW()
       WHERE plan_date < $1::date
         AND status IN ('pending', 'reminded')
       RETURNING id`,
      [today],
    );
    return Number(res.rowCount || 0);
  }

  async completeTaskFromInspection(inspection) {
    await this.ensureTables();
    const carId = toInteger(inspection?.car_id, null);
    const submittedDate = toDateOnly(inspection?.submitted_at || inspection?.created_at || new Date());
    const inspectionId = toInteger(inspection?.id, null);
    if (!carId || !submittedDate || !inspectionId) return null;

    const res = await query(
      `UPDATE vehicle_internal_inspection_tasks
       SET status = 'completed',
           completed_inspection_id = $2,
           completed_at = COALESCE(completed_at, NOW()),
           next_reminder_at = NULL,
           updated_at = NOW()
       WHERE car_id = $1
         AND plan_date = $3::date
         AND status IN ('pending', 'reminded')
       RETURNING *`,
      [carId, inspectionId, submittedDate],
    );
    return mapTaskRow(res.rows?.[0] || null);
  }

  async logReminderAttempt(taskId, status, payload = {}) {
    await query(
      `INSERT INTO vehicle_internal_inspection_reminder_logs (
         task_id,
         channel,
         status,
         sent_to,
         provider_message_id,
         error_message,
         payload_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        Number(taskId),
        stringOrNull(payload.channel, 32) || 'whatsapp',
        stringOrNull(status, 64) || 'unknown',
        stringOrNull(payload.sentTo, 255),
        stringOrNull(payload.providerMessageId, 128),
        stringOrNull(payload.errorMessage, 5000),
        JSON.stringify(payload.payload || {}),
      ],
    ).catch(() => null);
  }

  async refreshTaskDriverPhone(task, preferredKenjoUserId = null) {
    const currentTask = mapTaskRow(task);
    if (!currentTask) return null;

    const refreshedDriver = await findMatchingDriverContact(
      currentTask.driver_identifier,
      preferredKenjoUserId || currentTask.driver_kenjo_user_id,
    ).catch(() => null);

    if (!refreshedDriver) {
      return currentTask;
    }

    const nextPhone = stringOrNull(refreshedDriver.phone, 255);
    const nextEmployeeRef = stringOrNull(refreshedDriver.employeeRef, 128);
    const nextKenjoUserId = stringOrNull(refreshedDriver.kenjoUserId, 128);
    const nextDriverName = stringOrNull(refreshedDriver.driverName, 255) || currentTask.driver_identifier;
    const changed =
      (nextPhone || null) !== (currentTask.driver_phone || null)
      || (nextEmployeeRef || null) !== (currentTask.driver_employee_ref || null)
      || (nextKenjoUserId || null) !== (currentTask.driver_kenjo_user_id || null)
      || (nextDriverName || null) !== (currentTask.driver_identifier || null);

    if (!changed) {
      return currentTask;
    }

    const res = await query(
      `UPDATE vehicle_internal_inspection_tasks
       SET driver_identifier = $2,
           driver_employee_ref = $3,
           driver_kenjo_user_id = $4,
           driver_phone = $5,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [currentTask.id, nextDriverName, nextEmployeeRef, nextKenjoUserId, nextPhone],
    ).catch(() => ({ rows: [] }));

    return mapTaskRow(res.rows?.[0] || {
      ...currentTask,
      driver_identifier: nextDriverName,
      driver_employee_ref: nextEmployeeRef,
      driver_kenjo_user_id: nextKenjoUserId,
      driver_phone: nextPhone,
    });
  }

  async sendReminderForTask(task, config, now = new Date(), options = {}) {
    const currentTask = await this.refreshTaskDriverPhone(task);
    if (!currentTask) {
      return { status: 'missing_task', task: null };
    }

    const requirePush = options?.requirePush === true;
    const today = toDateOnly(now);
    const sentTo = normalizePhoneForWhatsApp(currentTask.driver_phone, config.defaultCountryCode);
    const inspectionUrl = buildInspectionUrl(config.publicBaseUrl, currentTask.vin) || currentTask.inspection_url || '';
    const body = renderReminderMessage(
      currentTask.reminder_message_template || config.reminderMessage,
      {
        driverName: currentTask.driver_identifier || 'driver',
        licensePlate: currentTask.license_plate || currentTask.vehicle_id || currentTask.vin || '',
        vehicleId: currentTask.vehicle_id || '',
        vin: currentTask.vin || '',
        planDate: currentTask.plan_date || '',
        inspectionUrl,
      },
    );

    let pushResult = {
      configured: false,
      deviceCount: 0,
      sentCount: 0,
      failedCount: 0,
      lastError: null,
    };

    try {
      pushResult = await pushService.sendNotificationToEmployee(
        {
          kenjoUserId: currentTask.driver_kenjo_user_id,
          employeeRef: currentTask.driver_employee_ref,
        },
        {
          title: 'FleetCheck reminder',
          body,
          url: inspectionUrl || config.publicBaseUrl || '/',
          tag: `fleetcheck-task-${currentTask.id}`,
          data: {
            url: inspectionUrl || config.publicBaseUrl || '/',
            taskId: currentTask.id,
            vin: currentTask.vin || null,
            licensePlate: currentTask.license_plate || null,
          },
        },
      );
    } catch (error) {
      pushResult = {
        configured: true,
        deviceCount: 0,
        sentCount: 0,
        failedCount: 1,
        lastError: String(error?.message || error || 'Push send failed'),
      };
    }

    if (pushResult.configured && pushResult.failedCount > 0 && pushResult.sentCount === 0) {
      await this.logReminderAttempt(currentTask.id, 'send_failed', {
        channel: 'push',
        errorMessage: pushResult.lastError,
        payload: {
          inspectionUrl,
          deviceCount: pushResult.deviceCount,
          failedCount: pushResult.failedCount,
        },
      });
    }

    if (pushResult.configured && pushResult.sentCount > 0) {
      const nextReminderAt = addMinutes(now, config.reminderIntervalMinutes);
      const sameDayNextReminder = toDateOnly(nextReminderAt) === today ? nextReminderAt.toISOString() : null;
      const updateRes = await query(
        `UPDATE vehicle_internal_inspection_tasks
         SET status = 'reminded',
             last_reminder_at = NOW(),
             last_reminder_status = 'sent_push',
             last_reminder_sid = NULL,
             last_reminder_error = NULL,
             reminder_count = reminder_count + 1,
             next_reminder_at = $2,
             inspection_url = COALESCE($3, inspection_url),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [currentTask.id, sameDayNextReminder, inspectionUrl || null],
      );
      await this.logReminderAttempt(currentTask.id, 'sent', {
        channel: 'push',
        sentTo: `${pushResult.sentCount} device(s)`,
        payload: {
          inspectionUrl,
          body,
          deviceCount: pushResult.deviceCount,
          sentCount: pushResult.sentCount,
        },
      });
      return {
        status: 'sent_push',
        task: mapTaskRow(updateRes.rows?.[0] || null),
        sentTo: `${pushResult.sentCount} push device(s)`,
      };
    }

    if (requirePush) {
      const nextReminderAt = addMinutes(now, config.reminderIntervalMinutes);
      const sameDayNextReminder = toDateOnly(nextReminderAt) === today ? nextReminderAt.toISOString() : null;
      const requirePushMessage = !pushResult.configured
        ? 'App notifications are not configured on the server yet.'
        : pushResult.failedCount > 0
          ? `Failed to send app notification. ${pushResult.lastError || 'Please try again.'}`
          : 'This driver has no app notifications enabled on any device.';
      await query(
        `UPDATE vehicle_internal_inspection_tasks
         SET last_reminder_status = 'missing_push',
             last_reminder_error = $2,
             next_reminder_at = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [currentTask.id, requirePushMessage, sameDayNextReminder],
      );
      await this.logReminderAttempt(currentTask.id, 'missing_push', {
        channel: 'push',
        errorMessage: requirePushMessage,
        payload: {
          inspectionUrl,
          deviceCount: pushResult.deviceCount,
          failedCount: pushResult.failedCount,
          pushConfigured: pushResult.configured,
        },
      });
      return {
        status: 'missing_push',
        task: mapTaskRow({
          ...currentTask,
          last_reminder_status: 'missing_push',
          last_reminder_error: requirePushMessage,
          next_reminder_at: sameDayNextReminder,
        }),
        errorMessage: requirePushMessage,
      };
    }

    try {
      if (!sentTo) {
        const nextReminderAt = addMinutes(now, config.reminderIntervalMinutes);
        const sameDayNextReminder = toDateOnly(nextReminderAt) === today ? nextReminderAt.toISOString() : null;
        const missingChannelMessage = pushResult.configured
          ? 'Driver has no active FleetCheck app notifications and no valid WhatsApp number in Employee overview'
          : 'Driver WhatsApp number is missing or invalid in Employee overview';
        const detailedMissingMessage = pushResult.lastError
          ? `${missingChannelMessage}. Push error: ${pushResult.lastError}`
          : missingChannelMessage;
        await query(
          `UPDATE vehicle_internal_inspection_tasks
           SET last_reminder_status = 'missing_phone',
               last_reminder_error = $2,
               next_reminder_at = $3,
               updated_at = NOW()
           WHERE id = $1`,
          [currentTask.id, detailedMissingMessage, sameDayNextReminder],
        );
        await this.logReminderAttempt(currentTask.id, 'missing_phone', {
          channel: 'whatsapp',
          sentTo: currentTask.driver_phone,
          errorMessage: detailedMissingMessage,
          payload: {
            driverIdentifier: currentTask.driver_identifier,
            driverKenjoUserId: currentTask.driver_kenjo_user_id,
            pushConfigured: pushResult.configured,
            pushDeviceCount: pushResult.deviceCount,
          },
        });
        return {
          status: 'missing_phone',
          task: mapTaskRow({
            ...currentTask,
            last_reminder_status: 'missing_phone',
            last_reminder_error: detailedMissingMessage,
            next_reminder_at: sameDayNextReminder,
          }),
        };
      }

      const result = await sendWhatsAppMessage({
        to: currentTask.driver_phone,
        body,
        defaultCountryCode: config.defaultCountryCode,
      });
      const nextReminderAt = addMinutes(now, config.reminderIntervalMinutes);
      const sameDayNextReminder = toDateOnly(nextReminderAt) === today ? nextReminderAt.toISOString() : null;
      const updateRes = await query(
        `UPDATE vehicle_internal_inspection_tasks
         SET last_reminder_at = NOW(),
             status = 'reminded',
             last_reminder_status = 'sent_whatsapp',
             last_reminder_sid = $2,
             last_reminder_error = NULL,
             reminder_count = reminder_count + 1,
             next_reminder_at = $3,
             inspection_url = COALESCE($4, inspection_url),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [currentTask.id, result.sid, sameDayNextReminder, inspectionUrl || null],
      );
      await this.logReminderAttempt(currentTask.id, 'sent', {
        channel: 'whatsapp',
        sentTo,
        providerMessageId: result.sid,
        payload: {
          status: result.status,
          body,
          inspectionUrl,
        },
      });
      return {
        status: 'sent_whatsapp',
        task: mapTaskRow(updateRes.rows?.[0] || null),
        sentTo,
      };
    } catch (error) {
      const message = String(error?.message || error || 'Twilio send failed');
      const nextReminderAt = addMinutes(now, config.reminderIntervalMinutes);
      const sameDayNextReminder = toDateOnly(nextReminderAt) === today ? nextReminderAt.toISOString() : null;
      const updateRes = await query(
        `UPDATE vehicle_internal_inspection_tasks
         SET last_reminder_at = NOW(),
             last_reminder_status = 'send_failed',
             last_reminder_error = $2,
             next_reminder_at = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [currentTask.id, message, sameDayNextReminder],
      );
      await this.logReminderAttempt(currentTask.id, 'send_failed', {
        channel: 'whatsapp',
        sentTo,
        errorMessage: message,
        payload: { body, inspectionUrl },
      });
      return {
        status: 'send_failed',
        task: mapTaskRow(updateRes.rows?.[0] || null),
        errorMessage: message,
      };
    }
  }

  async processDueReminderTasks(options = {}) {
    await this.ensureTables();
    const now = options.now instanceof Date ? options.now : new Date();
    const config = await resolveReminderSettings();

    const failedCount = await this.markOverdueTasksFailed(now);
    if (!config.enabled) {
      return { processed: 0, failedCount, disabled: true };
    }

    const today = toDateOnly(now);
    const dueRes = await query(
      `SELECT *
       FROM vehicle_internal_inspection_tasks
       WHERE plan_date = $1::date
         AND status IN ('pending', 'reminded')
         AND next_reminder_at IS NOT NULL
         AND next_reminder_at <= $2
       ORDER BY next_reminder_at ASC, id ASC
       LIMIT 100`,
      [today, now.toISOString()],
    );

    let processed = 0;
    for (const row of dueRes.rows || []) {
      await this.sendReminderForTask(row, config, now);
      processed += 1;
    }

    return { processed, failedCount, disabled: false };
  }

  async assignTaskManually(payload = {}, options = {}) {
    await this.ensureTables();

    const now = options.now instanceof Date ? options.now : new Date();
    const planDate = toDateOnly(now);
    const carId = toInteger(payload.carId, null);
    const driverKenjoUserId = stringOrNull(payload.driverKenjoUserId, 128);

    if (!carId) {
      throw new Error('Car is required');
    }
    if (!driverKenjoUserId) {
      throw new Error('Employee is required');
    }

    const config = await resolveReminderSettings();
    const [carRes, driver] = await Promise.all([
      query(
        `SELECT id, vehicle_id, license_plate, vin
         FROM cars
         WHERE id = $1
         LIMIT 1`,
        [carId],
      ),
      findMatchingDriverContact(null, driverKenjoUserId),
    ]);

    const car = carRes.rows?.[0] || null;
    if (!car) {
      throw new Error('Selected car was not found');
    }
    if (!driver?.kenjoUserId) {
      throw new Error('Selected employee was not found');
    }

    const existingInspectionMap = await getExistingInspectionMap([planDate], [carId]);
    const completedInspection = existingInspectionMap.get(`${carId}|${planDate}`) || null;
    if (completedInspection?.inspectionId) {
      throw new Error('An inspection for this vehicle is already completed today');
    }

    const upsertRes = await query(
      `INSERT INTO vehicle_internal_inspection_tasks (
         car_id,
         plan_date,
         vehicle_id,
         license_plate,
         vin,
         driver_identifier,
         driver_employee_ref,
         driver_kenjo_user_id,
         driver_phone,
         status,
         reminder_start_at,
         next_reminder_at,
         reminder_count,
         reminder_message_template,
         inspection_url,
         last_reminder_at,
         last_reminder_status,
         last_reminder_sid,
         last_reminder_error,
         cancelled_at,
         failed_at,
         completed_inspection_id,
         completed_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         'pending', $10, $11, 0, $12, $13,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NOW()
       )
       ON CONFLICT (car_id, plan_date) DO UPDATE SET
         vehicle_id = EXCLUDED.vehicle_id,
         license_plate = EXCLUDED.license_plate,
         vin = EXCLUDED.vin,
         driver_identifier = EXCLUDED.driver_identifier,
         driver_employee_ref = EXCLUDED.driver_employee_ref,
         driver_kenjo_user_id = EXCLUDED.driver_kenjo_user_id,
         driver_phone = EXCLUDED.driver_phone,
         status = 'pending',
         reminder_start_at = EXCLUDED.reminder_start_at,
         next_reminder_at = EXCLUDED.next_reminder_at,
         reminder_count = 0,
         reminder_message_template = EXCLUDED.reminder_message_template,
         inspection_url = EXCLUDED.inspection_url,
         last_reminder_at = NULL,
         last_reminder_status = NULL,
         last_reminder_sid = NULL,
         last_reminder_error = NULL,
         cancelled_at = NULL,
         failed_at = NULL,
         completed_inspection_id = NULL,
         completed_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [
        carId,
        planDate,
        stringOrNull(car.vehicle_id, 255),
        stringOrNull(car.license_plate, 64),
        stringOrNull(car.vin, 64),
        stringOrNull(driver.driverName, 255),
        stringOrNull(driver.employeeRef, 128),
        stringOrNull(driver.kenjoUserId, 128),
        stringOrNull(driver.phone, 255),
        now.toISOString(),
        now.toISOString(),
        config.reminderMessage,
        buildInspectionUrl(config.publicBaseUrl, car.vin),
      ],
    );

    const manualTask = mapTaskRow(upsertRes.rows?.[0] || null);
    const reminderResult = await this.sendReminderForTask(manualTask, config, now, { requirePush: true });

    if (reminderResult.status === 'missing_phone' || reminderResult.status === 'missing_push') {
      throw new Error(
        String(
          reminderResult?.errorMessage
          || reminderResult?.task?.last_reminder_error
          || 'This driver has no app notifications enabled on any device.',
        ),
      );
    }
    if (reminderResult.status === 'send_failed') {
      throw new Error(reminderResult.errorMessage || 'Failed to send app notification');
    }

    if (reminderResult.status === 'sent_whatsapp') {
      throw new Error(
        String(
          reminderResult?.task?.last_reminder_error
          || 'Manual assignment is limited to app notifications only.',
        ),
      );
    }

    const deliveredTask = reminderResult.task || manualTask;
    return {
      task: deliveredTask,
      delivery: {
        status: reminderResult.status || deliveredTask?.last_reminder_status || null,
        sentTo: reminderResult.sentTo || null,
        errorMessage: reminderResult.errorMessage || null,
      },
    };
  }

  async listTasks(filters = {}) {
    await this.ensureTables();
    const params = [];
    const conditions = [];
    let index = 1;

    if (filters.carId != null && filters.carId !== '') {
      const carId = toInteger(filters.carId, null);
      if (carId) {
        conditions.push(`t.car_id = $${index++}`);
        params.push(carId);
      }
    }

    if (stringOrNull(filters.status, 32)) {
      conditions.push(`t.status = $${index++}`);
      params.push(String(filters.status).trim());
    }

    if (stringOrNull(filters.search, 255)) {
      conditions.push(`(
        COALESCE(t.license_plate, '') ILIKE $${index}
        OR COALESCE(t.vehicle_id, '') ILIKE $${index}
        OR COALESCE(t.vin, '') ILIKE $${index}
        OR COALESCE(t.driver_identifier, '') ILIKE $${index}
      )`);
      params.push(`%${String(filters.search).trim()}%`);
      index += 1;
    }

    if (stringOrNull(filters.dateFrom, 16)) {
      conditions.push(`t.plan_date >= $${index++}::date`);
      params.push(toDateOnly(filters.dateFrom));
    }

    if (stringOrNull(filters.dateTo, 16)) {
      conditions.push(`t.plan_date <= $${index++}::date`);
      params.push(toDateOnly(filters.dateTo));
    }

    const limit = Math.min(Math.max(toInteger(filters.limit, 100) || 100, 1), 300);
    params.push(limit);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await query(
      `SELECT
         t.*,
         i.overall_result AS inspection_overall_result,
         i.new_damages_count AS inspection_new_damages_count,
         i.operator_name AS inspection_operator_name
       FROM vehicle_internal_inspection_tasks t
       LEFT JOIN vehicle_internal_inspections i ON i.id = t.completed_inspection_id
       ${where}
       ORDER BY t.plan_date DESC, t.id DESC
       LIMIT $${index}`,
      params,
    );

    return (res.rows || []).map((row) => mapTaskRow(row));
  }

  async getTaskByInspectionId(inspectionId) {
    await this.ensureTables();
    const id = toInteger(inspectionId, null);
    if (!id) return null;
    const res = await query(
      `SELECT
         t.*,
         i.overall_result AS inspection_overall_result,
         i.new_damages_count AS inspection_new_damages_count,
         i.operator_name AS inspection_operator_name
       FROM vehicle_internal_inspection_tasks t
       LEFT JOIN vehicle_internal_inspections i ON i.id = t.completed_inspection_id
       WHERE t.completed_inspection_id = $1
       LIMIT 1`,
      [id],
    );
    return mapTaskRow(res.rows?.[0] || null);
  }

  async deleteTask(taskId) {
    await this.ensureTables();
    const id = toInteger(taskId, null);
    if (!id) return null;

    const res = await query(
      `DELETE FROM vehicle_internal_inspection_tasks
       WHERE id = $1
       RETURNING id, completed_inspection_id`,
      [id],
    );

    const row = res.rows?.[0] || null;
    if (!row) return null;
    return {
      id: toInteger(row.id, row.id),
      deleted: true,
      completed_inspection_id: toInteger(row.completed_inspection_id, row.completed_inspection_id),
    };
  }
}

export default new InspectionReminderService();
