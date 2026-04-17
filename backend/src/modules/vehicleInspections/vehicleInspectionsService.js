import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import { pool, query } from '../../db.js';
import carsService from '../cars/carsService.js';
import vehicleInspectionEvents from './vehicleInspectionEvents.js';
import analysisRepository from './vehicleInspectionAnalysisRepository.js';
import inspectionAnalysisService from './inspectionAnalysisService.js';
import inspectionReminderService from './inspectionReminderService.js';

export const REQUIRED_SHOT_TYPES = [
  'front_left',
  'left_side',
  'rear_left',
  'rear',
  'rear_right',
  'right_side',
  'front_right',
  'front',
];

const ALLOWED_VEHICLE_TYPES = new Set([
  'sprinter_high_roof_long',
  'peugeot_boxer',
  'rivian_edv',
]);

const RESULT_BASELINE_CREATED = 'baseline_created';
const RESULT_NO_NEW_DAMAGE = 'no_new_damage';
const RESULT_POSSIBLE_NEW_DAMAGE = 'possible_new_damage';

const COMPARISON_WIDTH = 480;
const COMPARISON_HEIGHT = 854;
const DIFFERENCE_RATIO_THRESHOLD = 0.026;
const DIFFERENCE_PIXELS_THRESHOLD = 2600;

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

function normalizeDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeVin(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 32);
}

function normalizeVehicleType(value) {
  const normalized = stringOrNull(value, 64);
  if (!normalized) return null;
  return ALLOWED_VEHICLE_TYPES.has(normalized) ? normalized : null;
}

function normalizeShotType(value) {
  const normalized = stringOrNull(value, 64)?.toLowerCase() || null;
  return REQUIRED_SHOT_TYPES.includes(normalized) ? normalized : null;
}

function normalizeShotTypeList(value) {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  return raw.map((entry) => normalizeShotType(entry)).filter(Boolean);
}

function sanitizePhotoFiles(files) {
  return Array.isArray(files)
    ? files.filter((file) => file?.buffer && file.originalname).slice(0, 12)
    : [];
}

function normalizeInspectionRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: toInteger(row.id, row.id),
    car_id: toInteger(row.car_id, row.car_id),
    previous_inspection_id: toInteger(row.previous_inspection_id, row.previous_inspection_id),
    total_shots: toInteger(row.total_shots, 0),
    new_damages_count: toInteger(row.new_damages_count, 0),
    submitted_at: normalizeDateTime(row.submitted_at),
    completed_at: normalizeDateTime(row.completed_at),
    created_at: normalizeDateTime(row.created_at),
    updated_at: normalizeDateTime(row.updated_at),
    comparison_summary: row.comparison_summary || {},
  };
}

function normalizePhotoRow(row, inspectionId) {
  if (!row) return null;
  return {
    ...row,
    id: toInteger(row.id, row.id),
    inspection_id: toInteger(row.inspection_id, row.inspection_id),
    capture_order: toInteger(row.capture_order, 0),
    file_size: toInteger(row.file_size, 0),
    width: toInteger(row.width, null),
    height: toInteger(row.height, null),
    created_at: normalizeDateTime(row.created_at),
    download_path: inspectionId
      ? `/api/fleet-inspections/${inspectionId}/photos/${row.id}/download`
      : row.download_path || null,
  };
}

function normalizeFindingRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: toInteger(row.id, row.id),
    inspection_id: toInteger(row.inspection_id, row.inspection_id),
    photo_id: toInteger(row.photo_id, row.photo_id),
    baseline_photo_id: toInteger(row.baseline_photo_id, row.baseline_photo_id),
    changed_pixels: toInteger(row.changed_pixels, 0),
    difference_ratio: Number(row.difference_ratio || 0),
    created_at: normalizeDateTime(row.created_at),
    summary_json: row.summary_json || {},
  };
}

function normalizeEventRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: toInteger(row.id, row.id),
    inspection_id: toInteger(row.inspection_id, row.inspection_id),
    car_id: toInteger(row.car_id, row.car_id),
    created_at: normalizeDateTime(row.created_at),
    payload_json: row.payload_json || {},
  };
}

function buildPhotoEntries(files, shotTypes) {
  const safeFiles = sanitizePhotoFiles(files);
  const normalizedShotTypes = normalizeShotTypeList(shotTypes);

  if (safeFiles.length !== REQUIRED_SHOT_TYPES.length) {
    throw new Error(`Exactly ${REQUIRED_SHOT_TYPES.length} inspection photos are required.`);
  }
  if (normalizedShotTypes.length !== safeFiles.length) {
    throw new Error('Every uploaded photo must include a valid shot_type.');
  }

  const seen = new Set();
  const entries = safeFiles.map((file, index) => {
    const shotType = normalizedShotTypes[index];
    if (!shotType) {
      throw new Error(`Invalid shot type at position ${index + 1}.`);
    }
    if (seen.has(shotType)) {
      throw new Error(`Duplicate shot type uploaded: ${shotType}.`);
    }
    seen.add(shotType);
    return { file, shotType, captureOrder: index + 1 };
  });

  const missingShots = REQUIRED_SHOT_TYPES.filter((shotType) => !seen.has(shotType));
  if (missingShots.length) {
    throw new Error(`Missing required inspection shots: ${missingShots.join(', ')}`);
  }

  return entries;
}

async function comparePhotoBuffers(baselineBuffer, currentBuffer) {
  const [baseline, current] = await Promise.all([
    sharp(baselineBuffer)
      .rotate()
      .resize(COMPARISON_WIDTH, COMPARISON_HEIGHT, { fit: 'cover', position: 'centre' })
      .grayscale()
      .normalise()
      .blur(1.6)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(currentBuffer)
      .rotate()
      .resize(COMPARISON_WIDTH, COMPARISON_HEIGHT, { fit: 'cover', position: 'centre' })
      .grayscale()
      .normalise()
      .blur(1.6)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);

  const diff = new Uint8Array(baseline.data.length);
  const changedPixels = pixelmatch(
    baseline.data,
    current.data,
    diff,
    baseline.info.width,
    baseline.info.height,
    { threshold: 0.18, includeAA: false },
  );
  const totalPixels = baseline.info.width * baseline.info.height;

  return {
    changedPixels,
    totalPixels,
    differenceRatio: totalPixels ? changedPixels / totalPixels : 0,
  };
}

async function ensureVehicleInspectionTables() {
  await carsService.ensureInspectionVehicleColumns();
  if (tablesReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS vehicle_internal_inspections (
      id SERIAL PRIMARY KEY,
      car_id INT REFERENCES cars(id) ON DELETE CASCADE,
      vehicle_id VARCHAR(255),
      vin VARCHAR(64) NOT NULL,
      license_plate VARCHAR(64),
      inspection_vehicle_type VARCHAR(64) NOT NULL,
      operator_name VARCHAR(255) NOT NULL,
      source VARCHAR(32) NOT NULL DEFAULT 'qr',
      notes TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'processing',
      total_shots INT NOT NULL DEFAULT 0,
      previous_inspection_id INT REFERENCES vehicle_internal_inspections(id) ON DELETE SET NULL,
      overall_result VARCHAR(64),
      new_damages_count INT NOT NULL DEFAULT 0,
      comparison_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE vehicle_internal_inspections ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => null);
  await query(`ALTER TABLE vehicle_internal_inspections ADD COLUMN IF NOT EXISTS comparison_summary JSONB NOT NULL DEFAULT '{}'::jsonb`).catch(() => null);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspections_car ON vehicle_internal_inspections (car_id, submitted_at DESC, id DESC)`).catch(() => null);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspections_status ON vehicle_internal_inspections (status, submitted_at DESC, id DESC)`).catch(() => null);

  await query(`
    CREATE TABLE IF NOT EXISTS vehicle_internal_inspection_photos (
      id SERIAL PRIMARY KEY,
      inspection_id INT NOT NULL REFERENCES vehicle_internal_inspections(id) ON DELETE CASCADE,
      shot_type VARCHAR(64) NOT NULL,
      capture_order INT NOT NULL DEFAULT 0,
      file_name TEXT NOT NULL,
      mime_type VARCHAR(255),
      file_size INT NOT NULL DEFAULT 0,
      width INT,
      height INT,
      file_content BYTEA NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (inspection_id, shot_type)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspection_photos_inspection ON vehicle_internal_inspection_photos (inspection_id, capture_order, id)`).catch(() => null);

  await query(`
    CREATE TABLE IF NOT EXISTS vehicle_internal_inspection_findings (
      id SERIAL PRIMARY KEY,
      inspection_id INT NOT NULL REFERENCES vehicle_internal_inspections(id) ON DELETE CASCADE,
      photo_id INT REFERENCES vehicle_internal_inspection_photos(id) ON DELETE SET NULL,
      baseline_photo_id INT REFERENCES vehicle_internal_inspection_photos(id) ON DELETE SET NULL,
      shot_type VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'candidate',
      changed_pixels INT NOT NULL DEFAULT 0,
      difference_ratio NUMERIC(10, 6) NOT NULL DEFAULT 0,
      summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspection_findings_inspection ON vehicle_internal_inspection_findings (inspection_id, created_at DESC, id DESC)`).catch(() => null);

  await query(`
    CREATE TABLE IF NOT EXISTS vehicle_internal_inspection_events (
      id SERIAL PRIMARY KEY,
      inspection_id INT REFERENCES vehicle_internal_inspections(id) ON DELETE CASCADE,
      car_id INT REFERENCES cars(id) ON DELETE CASCADE,
      event_type VARCHAR(64) NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspection_events_inspection ON vehicle_internal_inspection_events (inspection_id, created_at DESC, id DESC)`).catch(() => null);

  await analysisRepository.ensureTables();
  tablesReady = true;
}

async function findPreviousCompletedInspection(client, carId, currentInspectionId) {
  if (!carId) return null;
  const res = await client.query(
    `SELECT id
     FROM vehicle_internal_inspections
     WHERE car_id = $1
       AND id <> $2
       AND status = 'completed'
     ORDER BY COALESCE(completed_at, submitted_at, created_at) DESC, id DESC
     LIMIT 1`,
    [carId, currentInspectionId],
  );
  return res.rows[0] || null;
}

async function submitInspection(payload, files) {
  await ensureVehicleInspectionTables();

  const vin = normalizeVin(payload?.vin);
  const operatorName = stringOrNull(payload?.operatorName, 255);
  const requestedVehicleType = normalizeVehicleType(payload?.vehicleType);
  const source = stringOrNull(payload?.source, 32) || 'qr';
  const notes = stringOrNull(payload?.notes, 5000);

  if (!vin) throw new Error('VIN is required.');
  if (!operatorName) throw new Error('Driver name is required.');

  const vehicle = await carsService.resolveVehicleByVin(vin);
  if (!vehicle) throw new Error('Vehicle not found for this VIN.');
  if (!vehicle.vehicleType) throw new Error('Vehicle inspection type is not configured for this VIN.');
  if (requestedVehicleType && requestedVehicleType !== vehicle.vehicleType) {
    throw new Error('Resolved vehicle type does not match the selected overlay set.');
  }

  const photoEntries = buildPhotoEntries(files, payload?.shotTypes);
  const client = await pool.connect();
  let inspectionId = null;

  try {
    await client.query('BEGIN');

    const inspectionRes = await client.query(
      `INSERT INTO vehicle_internal_inspections (
        car_id,
        vehicle_id,
        vin,
        license_plate,
        inspection_vehicle_type,
        operator_name,
        source,
        notes,
        status,
        total_shots,
        submitted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9, NOW())
      RETURNING id`,
      [
        vehicle.carId,
        vehicle.vehicleId,
        vehicle.vin,
        vehicle.licensePlate,
        vehicle.vehicleType,
        operatorName,
        source,
        notes,
        photoEntries.length,
      ],
    );
    inspectionId = inspectionRes.rows[0]?.id;

    for (const entry of photoEntries) {
      const metadata = await sharp(entry.file.buffer).rotate().metadata().catch(() => ({}));
      await client.query(
        `INSERT INTO vehicle_internal_inspection_photos (
          inspection_id,
          shot_type,
          capture_order,
          file_name,
          mime_type,
          file_size,
          width,
          height,
          file_content
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          inspectionId,
          entry.shotType,
          entry.captureOrder,
          stringOrNull(entry.file.originalname, 1000) || `${entry.shotType}.jpg`,
          stringOrNull(entry.file.mimetype, 255) || 'image/jpeg',
          toInteger(entry.file.size, entry.file.buffer.length),
          toInteger(metadata.width, null),
          toInteger(metadata.height, null),
          entry.file.buffer,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    await inspectionAnalysisService.analyzeInspection(inspectionId);
  } catch (error) {
    console.error('Internal inspection analysis failed after upload', error);
  }

  const inspection = await getInspectionById(inspectionId);
  await inspectionReminderService.completeTaskFromInspection(inspection).catch((error) => {
    console.error('Failed to complete inspection reminder task', error);
  });
  return getInspectionById(inspectionId);
}

async function listInspections(filters = {}) {
  await ensureVehicleInspectionTables();
  await inspectionReminderService.ensureTables();

  const params = [];
  const conditions = [];
  let index = 1;

  if (filters?.carId != null && filters.carId !== '') {
    const carId = toInteger(filters.carId, null);
    if (carId) {
      conditions.push(`i.car_id = $${index++}`);
      params.push(carId);
    }
  }

  if (stringOrNull(filters?.status, 32)) {
    conditions.push(`i.status = $${index++}`);
    params.push(String(filters.status).trim());
  }

  if (stringOrNull(filters?.result, 64)) {
    conditions.push(`i.overall_result = $${index++}`);
    params.push(String(filters.result).trim());
  }

  if (stringOrNull(filters?.search, 255)) {
    conditions.push(`(
      i.vin ILIKE $${index}
      OR COALESCE(i.license_plate, '') ILIKE $${index}
      OR COALESCE(i.vehicle_id, '') ILIKE $${index}
      OR COALESCE(i.operator_name, '') ILIKE $${index}
      OR COALESCE(c.model, '') ILIKE $${index}
    )`);
    params.push(`%${String(filters.search).trim()}%`);
    index += 1;
  }

  const limit = Math.min(Math.max(toInteger(filters?.limit, 60) || 60, 1), 250);
  params.push(limit);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       i.id,
       i.car_id,
       i.vehicle_id,
       i.vin,
       i.license_plate,
       i.inspection_vehicle_type,
       i.operator_name,
       i.status,
       i.analysis_status,
       i.review_status,
       i.review_required,
       i.total_shots,
       i.previous_inspection_id,
       i.overall_result,
       i.new_damages_count,
       i.submitted_at,
       i.completed_at,
       i.created_at,
       i.updated_at,
       t.status AS task_status,
       t.next_reminder_at,
       t.last_reminder_at,
       t.last_reminder_status,
       t.reminder_count,
       c.model,
       (
         SELECT COUNT(*)::int
         FROM vehicle_internal_inspection_photos p
         WHERE p.inspection_id = i.id
       ) AS photo_count
     FROM vehicle_internal_inspections i
     LEFT JOIN cars c ON c.id = i.car_id
     LEFT JOIN vehicle_internal_inspection_tasks t ON t.completed_inspection_id = i.id
     ${where}
     ORDER BY COALESCE(i.submitted_at, i.created_at) DESC, i.id DESC
     LIMIT $${index}`,
    params,
  );

  return (res.rows || []).map((row) => ({
    ...normalizeInspectionRow(row),
    photo_count: toInteger(row.photo_count, 0),
    analysis_status: stringOrNull(row.analysis_status, 32),
    review_status: stringOrNull(row.review_status, 32),
    review_required: Boolean(row.review_required),
    task_status: stringOrNull(row.task_status, 32),
    next_reminder_at: normalizeDateTime(row.next_reminder_at),
    last_reminder_at: normalizeDateTime(row.last_reminder_at),
    last_reminder_status: stringOrNull(row.last_reminder_status, 64),
    reminder_count: toInteger(row.reminder_count, 0),
  }));
}

async function getInspectionById(id) {
  await ensureVehicleInspectionTables();
  await inspectionReminderService.ensureTables();

  const inspectionId = toInteger(id, null);
  if (!inspectionId) return null;

  const inspectionRes = await query(
    `SELECT i.*, c.model
     FROM vehicle_internal_inspections i
     LEFT JOIN cars c ON c.id = i.car_id
     WHERE i.id = $1
     LIMIT 1`,
    [inspectionId],
  );
  const inspection = inspectionRes.rows[0];
  if (!inspection) return null;

  const [photosRes, findingsRes, eventsRes, analysis, task] = await Promise.all([
    query(
      `SELECT id, inspection_id, shot_type, capture_order, file_name, mime_type, file_size, width, height, created_at
       FROM vehicle_internal_inspection_photos
       WHERE inspection_id = $1
       ORDER BY capture_order ASC, id ASC`,
      [inspectionId],
    ),
    query(
      `SELECT *
       FROM vehicle_internal_inspection_findings
       WHERE inspection_id = $1
       ORDER BY created_at DESC, id DESC`,
      [inspectionId],
    ),
    query(
      `SELECT *
       FROM vehicle_internal_inspection_events
       WHERE inspection_id = $1
       ORDER BY created_at DESC, id DESC`,
      [inspectionId],
    ),
    analysisRepository.getAnalysisByInspectionId(inspectionId).catch(() => null),
    inspectionReminderService.getTaskByInspectionId(inspectionId).catch(() => null),
  ]);

  return {
    ...normalizeInspectionRow(inspection),
    photos: (photosRes.rows || []).map((row) => normalizePhotoRow(row, inspectionId)),
    findings: (findingsRes.rows || []).map(normalizeFindingRow),
    events: (eventsRes.rows || []).map(normalizeEventRow),
    analysis,
    task,
  };
}

async function getInspectionPhoto(inspectionId, photoId) {
  await ensureVehicleInspectionTables();

  const resolvedInspectionId = toInteger(inspectionId, null);
  const resolvedPhotoId = toInteger(photoId, null);
  if (!resolvedInspectionId || !resolvedPhotoId) return null;

  const res = await query(
    `SELECT id, inspection_id, shot_type, file_name, mime_type, file_content
     FROM vehicle_internal_inspection_photos
     WHERE inspection_id = $1 AND id = $2
     LIMIT 1`,
    [resolvedInspectionId, resolvedPhotoId],
  );
  return res.rows[0] || null;
}

async function analyzeInspection(id, options = {}) {
  await ensureVehicleInspectionTables();
  return inspectionAnalysisService.analyzeInspection(id, options);
}

async function getInspectionAnalysis(id) {
  await ensureVehicleInspectionTables();
  return analysisRepository.getAnalysisByInspectionId(id);
}

async function listReviewQueue(limit) {
  await ensureVehicleInspectionTables();
  return analysisRepository.listReviewQueue(limit);
}

async function applyCandidateReviewAction(candidateId, inspectionId, userId, action, comment) {
  await ensureVehicleInspectionTables();
  return analysisRepository.applyReviewAction(candidateId, inspectionId, userId, action, comment);
}

async function getVehicleDamageHistory(vehicleId) {
  await ensureVehicleInspectionTables();
  return analysisRepository.getDamageHistory(vehicleId);
}

async function listInspectionTasks(filters = {}) {
  await ensureVehicleInspectionTables();
  return inspectionReminderService.listTasks(filters);
}

async function deleteInspectionTask(id) {
  await ensureVehicleInspectionTables();
  return inspectionReminderService.deleteTask(id);
}

async function assignInspectionTaskManually(payload = {}) {
  await ensureVehicleInspectionTables();
  return inspectionReminderService.assignTaskManually(payload);
}

async function deleteInspection(id) {
  await ensureVehicleInspectionTables();
  await inspectionReminderService.ensureTables();

  const inspectionId = toInteger(id, null);
  if (!inspectionId) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inspectionRes = await client.query(
      `SELECT id, car_id, submitted_at, created_at
       FROM vehicle_internal_inspections
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [inspectionId],
    );
    const inspection = inspectionRes.rows?.[0];
    if (!inspection) {
      await client.query('ROLLBACK');
      return null;
    }

    const taskRes = await client.query(
      `SELECT id, plan_date::text AS plan_date, reminder_count, reminder_start_at, next_reminder_at
       FROM vehicle_internal_inspection_tasks
       WHERE completed_inspection_id = $1
       LIMIT 1
       FOR UPDATE`,
      [inspectionId],
    );
    const task = taskRes.rows?.[0] || null;
    const today = toDateOnly(new Date());

    if (task) {
      const planDate = toDateOnly(task.plan_date);
      const isPastTask = Boolean(planDate && today && planDate < today);
      await client.query(
        `UPDATE vehicle_internal_inspection_tasks
         SET status = $2,
             completed_inspection_id = NULL,
             completed_at = NULL,
             failed_at = CASE WHEN $2 = 'failed' THEN COALESCE(failed_at, NOW()) ELSE NULL END,
             next_reminder_at = CASE
               WHEN $2 = 'failed' THEN NULL
               ELSE COALESCE(next_reminder_at, reminder_start_at, NOW())
             END,
             updated_at = NOW()
         WHERE id = $1`,
        [
          task.id,
          isPastTask ? 'failed' : (Number(task.reminder_count || 0) > 0 ? 'reminded' : 'pending'),
        ],
      );
    }

    await client.query(
      `DELETE FROM vehicle_internal_inspections
       WHERE id = $1`,
      [inspectionId],
    );

    await client.query('COMMIT');
    return { id: inspectionId, deleted: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

export default {
  ensureVehicleInspectionTables,
  submitInspection,
  listInspections,
  listInspectionTasks,
  deleteInspectionTask,
  assignInspectionTaskManually,
  getInspectionById,
  getInspectionPhoto,
  analyzeInspection,
  getInspectionAnalysis,
  listReviewQueue,
  applyCandidateReviewAction,
  getVehicleDamageHistory,
  deleteInspection,
};
