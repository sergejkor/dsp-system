import { query } from '../../db.js';

const STATUS_ACTIVE = 'Active';
const STATUS_MAINTENANCE = 'Maintenance';
const STATUS_OUT_OF_SERVICE = 'Out of Service';
const STATUS_GROUNDED = 'Grounded';
const STATUS_DECOMMISSIONED = 'Decommissioned';
const STATUS_DEFLEETING_CANDIDATE = 'Defleeting candidate';
const INSPECTION_VEHICLE_TYPES = new Set([
  'sprinter_high_roof_long',
  'peugeot_boxer',
  'rivian_edv',
]);

let inspectionVehicleColumnsReady = false;

function normalizeInspectionVehicleType(value) {
  const normalized = value == null ? '' : String(value).trim();
  return INSPECTION_VEHICLE_TYPES.has(normalized) ? normalized : null;
}

function normalizeVinToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function inferInspectionVehicleType(car) {
  const direct = normalizeInspectionVehicleType(car?.inspection_vehicle_type);
  if (direct) return direct;

  const combined = [
    car?.model,
    car?.vehicle_type,
    car?.vehicle_id,
    car?.fleet_provider,
    car?.station,
    car?.license_plate,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const vinToken = normalizeVinToken(car?.vin);

  if (combined.includes('rivian') || combined.includes('edv') || combined.includes('step van')) {
    return 'rivian_edv';
  }
  if (
    combined.includes('boxer') ||
    combined.includes('ducato') ||
    combined.includes('jumper') ||
    combined.includes('relay') ||
    combined.includes('movano')
  ) {
    return 'peugeot_boxer';
  }
  if (
    combined.includes('sprinter') ||
    combined.includes('esprinter') ||
    combined.includes('mercedes sprinter') ||
    combined.includes('benz sprinter') ||
    combined.includes('vs30') ||
    combined.includes('906') ||
    combined.includes('907') ||
    combined.includes('910') ||
    combined.includes('high roof') ||
    combined.includes('l2h2') ||
    combined.includes('l2h3') ||
    combined.includes('l3h2') ||
    combined.includes('l3h3')
  ) {
    return 'sprinter_high_roof_long';
  }

  // Use VIN WMI/prefix heuristics when the fleet master row lacks a usable model string.
  if (/^(7FC|7FH|7PD)/.test(vinToken)) return 'rivian_edv';
  if (/^(VF3|VF7|ZFA|W0V|VXE)/.test(vinToken)) return 'peugeot_boxer';
  if (/^(W1V|W1W|W1Y|WD3|WD4|WDB|WDF)/.test(vinToken)) return 'sprinter_high_roof_long';

  // FleetCheck currently supports only three van profiles. For generic delivery vans
  // without a curated inspection type, default to the Sprinter profile so the vehicle
  // can still be loaded and inspected instead of failing at VIN resolve time.
  if (
    combined.includes('van') ||
    combined.includes('cargo') ||
    combined.includes('transporter') ||
    combined.includes('delivery') ||
    combined.includes('amazon') ||
    combined.includes('prime')
  ) {
    return 'sprinter_high_roof_long';
  }
  return null;
}

async function ensureInspectionVehicleColumns() {
  if (inspectionVehicleColumnsReady) return;
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS inspection_vehicle_type VARCHAR(64)`).catch(() => null);
  inspectionVehicleColumnsReady = true;
}

function toDateOnly(value) {
  if (!value) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'string') return value.slice(0, 10);
  return value;
}

function normalizeCarDates(car) {
  if (!car) return car;
  return {
    ...car,
    last_maintenance_date: toDateOnly(car.last_maintenance_date),
    next_maintenance_date: toDateOnly(car.next_maintenance_date),
    registration_expiry: toDateOnly(car.registration_expiry),
    insurance_expiry: toDateOnly(car.insurance_expiry),
    lease_expiry: toDateOnly(car.lease_expiry),
    planned_defleeting_date: toDateOnly(car.planned_defleeting_date),
    created_at: toDateOnly(car.created_at),
    updated_at: toDateOnly(car.updated_at),
  };
}

function normalizeCarDetailsDates(car) {
  if (!car) return car;
  const next = normalizeCarDates(car);
  next.maintenance = (car.maintenance || []).map((row) => ({
    ...row,
    date: toDateOnly(row.date),
    created_at: toDateOnly(row.created_at),
  }));
  next.documents = (car.documents || []).map((row) => ({
    ...row,
    expiry_date: toDateOnly(row.expiry_date),
    created_at: toDateOnly(row.created_at),
  }));
  next.driver_assignments = (car.driver_assignments || []).map((row) => ({
    ...row,
    assigned_at: toDateOnly(row.assigned_at),
    unassigned_at: toDateOnly(row.unassigned_at),
  }));
  next.comments = (car.comments || []).map((row) => ({
    ...row,
    created_at: toDateOnly(row.created_at),
  }));
  next.planning_history = (car.planning_history || []).map((row) => ({
    ...row,
    plan_date: toDateOnly(row.plan_date),
  }));
  return next;
}

/**
 * Build WHERE clause and params for cars list (search + filters).
 */
function buildCarsWhere(filters, params) {
  const conditions = [];
  let idx = params.length + 1;
  if (filters.search && String(filters.search).trim()) {
    const term = `%${String(filters.search).trim().replace(/%/g, '\\%')}%`;
    conditions.push(`(
      c.vehicle_id ILIKE $${idx} OR c.license_plate ILIKE $${idx} OR c.vin ILIKE $${idx}
      OR c.model ILIKE $${idx} OR c.station ILIKE $${idx}
      OR (k.first_name || ' ' || k.last_name) ILIKE $${idx}
    )`);
    params.push(term);
    idx++;
  }
  if (filters.status && String(filters.status).trim()) {
    conditions.push(`c.status = $${idx}`);
    params.push(String(filters.status).trim());
    idx++;
  }
  if (filters.vehicle_type && String(filters.vehicle_type).trim()) {
    conditions.push(`c.vehicle_type = $${idx}`);
    params.push(String(filters.vehicle_type).trim());
    idx++;
  }
  if (filters.station && String(filters.station).trim()) {
    conditions.push(`c.station ILIKE $${idx}`);
    params.push(`%${String(filters.station).trim()}%`);
    idx++;
  }
  if (filters.fleet_provider && String(filters.fleet_provider).trim()) {
    conditions.push(`c.fleet_provider ILIKE $${idx}`);
    params.push(`%${String(filters.fleet_provider).trim()}%`);
    idx++;
  }
  return conditions.length ? `AND ${conditions.join(' AND ')}` : '';
}

/**
 * Get cars list with optional search and filters. Joins kenjo_employees for driver name.
 */
async function getCars(filters = {}) {
  await ensureInspectionVehicleColumns();
  const params = [];
  const where = buildCarsWhere(filters, params);
  const res = await query(
    `SELECT c.id, c.vehicle_id, c.license_plate, c.vin, c.model, c.year, c.fuel_type, c.vehicle_type, c.inspection_vehicle_type,
            c.status, c.station, c.fleet_provider, c.assigned_driver_id, c.mileage,
            c.last_maintenance_date, c.next_maintenance_date, c.next_maintenance_mileage,
            c.safety_score, c.incidents, c.registration_expiry, c.insurance_expiry, c.lease_expiry,
            c.planned_defleeting_date,
            c.created_at, c.updated_at,
            k.first_name AS driver_first_name, k.last_name AS driver_last_name,
            p_today.driver_identifier AS today_planning_driver,
            pr_latest.total_grade AS condition_grade
     FROM cars c
     LEFT JOIN kenjo_employees k ON k.kenjo_user_id = c.assigned_driver_id
     LEFT JOIN LATERAL (
       SELECT p.driver_identifier
       FROM car_planning p
       WHERE p.car_id = c.id
         AND p.plan_date = CURRENT_DATE
         AND p.driver_identifier IS NOT NULL
         AND TRIM(p.driver_identifier) <> ''
       ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
       LIMIT 1
     ) p_today ON TRUE
     LEFT JOIN LATERAL (
       SELECT pr.total_grade
       FROM pave_reports pr
       WHERE (
         -- Preferred match: VIN last 4 alphanumeric chars.
         (
           LENGTH(REGEXP_REPLACE(UPPER(COALESCE(c.vin, '')), '[^A-Z0-9]', '', 'g')) >= 4
           AND RIGHT(REGEXP_REPLACE(UPPER(COALESCE(pr.vin_display, '')), '[^A-Z0-9]', '', 'g'), 4) =
               RIGHT(REGEXP_REPLACE(UPPER(COALESCE(c.vin, '')), '[^A-Z0-9]', '', 'g'), 4)
         )
         OR (
           NULLIF(TRIM(COALESCE(c.license_plate, '')), '') IS NOT NULL
           AND NULLIF(TRIM(COALESCE(pr.plate_number, '')), '') IS NOT NULL
           AND UPPER(TRIM(pr.plate_number)) = UPPER(TRIM(c.license_plate))
         )
       )
       ORDER BY COALESCE(pr.inspection_date, pr.report_date, pr.created_at) DESC NULLS LAST, pr.id DESC
       LIMIT 1
     ) pr_latest ON TRUE
     WHERE 1=1 ${where}
     ORDER BY c.vehicle_id`,
    params
  );
  return (res.rows || []).map(normalizeCarDates);
}

/**
 * Get KPI counts for cars dashboard.
 */
async function getCarsKpis() {
  const res = await query(`
    SELECT
      COUNT(*)::int AS total_vehicles,
      COUNT(*) FILTER (WHERE c.status = $1)::int AS active_vehicles,
      COUNT(*) FILTER (WHERE c.status = $2)::int AS in_maintenance,
      COUNT(*) FILTER (WHERE c.status = $3)::int AS out_of_service,
      COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(c.status, ''))) = LOWER($4))::int AS defleeting_candidates,
      COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(c.status, ''))) = LOWER($5))::int AS grounded_cars,
      COUNT(*) FILTER (
        WHERE (c.assigned_driver_id IS NULL OR c.assigned_driver_id = '')
          AND (p_today.driver_identifier IS NULL OR TRIM(p_today.driver_identifier) = '')
      )::int AS without_driver,
      COUNT(*) FILTER (WHERE c.registration_expiry IS NOT NULL AND c.registration_expiry <= CURRENT_DATE + INTERVAL '30 days')::int AS expiring_documents
    FROM cars c
    LEFT JOIN LATERAL (
      SELECT p.driver_identifier
      FROM car_planning p
      WHERE p.car_id = c.id
        AND p.plan_date = CURRENT_DATE
        AND p.driver_identifier IS NOT NULL
        AND TRIM(p.driver_identifier) <> ''
      ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
      LIMIT 1
    ) p_today ON TRUE
  `, [STATUS_ACTIVE, STATUS_MAINTENANCE, STATUS_OUT_OF_SERVICE, STATUS_DEFLEETING_CANDIDATE, STATUS_GROUNDED]);
  const row = res.rows[0] || {};
  return {
    totalVehicles: row.total_vehicles ?? 0,
    activeVehicles: row.active_vehicles ?? 0,
    inMaintenance: row.in_maintenance ?? 0,
    outOfService: row.out_of_service ?? 0,
    defleetingCandidates: row.defleeting_candidates ?? 0,
    groundedCars: row.grounded_cars ?? 0,
    withoutDriver: row.without_driver ?? 0,
    expiringDocuments: row.expiring_documents ?? 0,
  };
}

/**
 * Get single car by id with maintenance history, documents, driver assignment history.
 */
async function getCarById(id) {
  await ensureInspectionVehicleColumns();
  const carRes = await query(
    `SELECT c.*, k.first_name AS driver_first_name, k.last_name AS driver_last_name
     FROM cars c
     LEFT JOIN kenjo_employees k ON k.kenjo_user_id = c.assigned_driver_id
     WHERE c.id = $1`,
    [id]
  );
  const car = carRes.rows[0];
  if (!car) return null;
  const [maintenance, documents, assignments, comments, planning] = await Promise.all([
    query(
      `SELECT id, date, mileage, type, cost, notes, created_at
       FROM car_maintenance
       WHERE car_id = $1
       ORDER BY date DESC`,
      [id],
    ),
    query(
      `SELECT id, document_type, file_name, expiry_date, file_url, created_at,
              (file_content IS NOT NULL) AS has_file
       FROM car_documents
       WHERE car_id = $1
       ORDER BY document_type`,
      [id],
    ),
    query(
      `SELECT id, kenjo_employee_id, assigned_at, unassigned_at
       FROM car_driver_assignments
       WHERE car_id = $1
       ORDER BY assigned_at DESC`,
      [id],
    ),
    query(
      `SELECT id, comment, created_at
       FROM car_comments
       WHERE car_id = $1
       ORDER BY created_at DESC`,
      [id],
    ),
    query(
      `SELECT id, plan_date, driver_identifier, abfahrtskontrolle
       FROM car_planning
       WHERE car_id = $1
       ORDER BY plan_date DESC`,
      [id],
    ),
  ]);
  car.maintenance = maintenance.rows || [];
  car.documents = documents.rows || [];
  car.driver_assignments = assignments.rows || [];
  car.comments = comments.rows || [];
  car.planning_history = planning.rows || [];
  return normalizeCarDetailsDates(car);
}

/**
 * Add comment for a car.
 */
async function addCarComment(carId, comment) {
  if (!comment || String(comment).trim() === '') return null;
  const res = await query(
    `INSERT INTO car_comments (car_id, comment) VALUES ($1, $2) RETURNING id, comment, created_at`,
    [carId, String(comment).trim()]
  );
  return res.rows[0];
}

/**
 * Add document for a car (file stored in DB).
 */
async function addCarDocument(carId, documentType, fileBuffer, fileName, expiryDate) {
  const res = await query(
    `INSERT INTO car_documents (car_id, document_type, file_content, file_name, expiry_date) VALUES ($1, $2, $3, $4, $5) RETURNING id, document_type, file_name, expiry_date, created_at`,
    [carId, documentType || 'document', fileBuffer, fileName || null, expiryDate || null]
  );
  return res.rows[0];
}

/**
 * Get document by id for download (carId used to verify ownership).
 */
async function getCarDocumentForDownload(carId, docId) {
  const res = await query(
    `SELECT id, document_type, file_name, file_content FROM car_documents WHERE id = $1 AND car_id = $2`,
    [docId, carId]
  );
  return res.rows[0] || null;
}

/**
 * Create car.
 */
async function createCar(data) {
  await ensureInspectionVehicleColumns();
  const res = await query(
    `INSERT INTO cars (
      vehicle_id, license_plate, vin, model, year, fuel_type, vehicle_type, status,
      station, fleet_provider, mileage, registration_expiry, insurance_expiry, lease_expiry,
      inspection_vehicle_type
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      data.vehicle_id || null,
      data.license_plate || null,
      data.vin || null,
      data.model || null,
      data.year ? Number(data.year) : null,
      data.fuel_type || null,
      data.vehicle_type || null,
      data.status || STATUS_ACTIVE,
      data.station || null,
      data.fleet_provider || null,
      data.mileage != null ? Number(data.mileage) : 0,
      data.registration_expiry || null,
      data.insurance_expiry || null,
      data.lease_expiry || null,
      normalizeInspectionVehicleType(data.inspection_vehicle_type),
    ]
  );
  return normalizeCarDates(res.rows[0]);
}

/**
 * Update car.
 */
async function updateCar(id, data) {
  await ensureInspectionVehicleColumns();
  const fields = [];
  const values = [];
  let idx = 1;
  const allow = ['license_plate', 'vin', 'model', 'year', 'fuel_type', 'vehicle_type', 'inspection_vehicle_type', 'status', 'station', 'fleet_provider', 'mileage', 'registration_expiry', 'insurance_expiry', 'lease_expiry', 'last_maintenance_date', 'next_maintenance_date', 'next_maintenance_mileage', 'safety_score', 'incidents', 'planned_defleeting_date'];
  for (const key of allow) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      if (['year', 'mileage', 'incidents', 'safety_score'].includes(key) && data[key] !== null) values.push(Number(data[key]));
      else if (key === 'inspection_vehicle_type') values.push(normalizeInspectionVehicleType(data[key]));
      else if (['last_maintenance_date', 'next_maintenance_date', 'registration_expiry', 'insurance_expiry', 'lease_expiry', 'planned_defleeting_date'].includes(key)) values.push(data[key] || null);
      else values.push(data[key] ?? null);
      idx++;
    }
  }
  if (fields.length === 0) return normalizeCarDates((await query('SELECT * FROM cars WHERE id = $1', [id])).rows[0]);
  values.push(id);
  const res = await query(
    `UPDATE cars SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  );
  return normalizeCarDates(res.rows[0]);
}

/**
 * Assign driver to car. Records in car_driver_assignments and sets cars.assigned_driver_id.
 */
async function assignDriver(carId, kenjoEmployeeId) {
  const car = (await query('SELECT id, assigned_driver_id FROM cars WHERE id = $1', [carId])).rows[0];
  if (!car) return null;
  await query(
    `UPDATE car_driver_assignments SET unassigned_at = CURRENT_DATE WHERE car_id = $1 AND unassigned_at IS NULL`,
    [carId]
  );
  await query(
    `INSERT INTO car_driver_assignments (car_id, kenjo_employee_id) VALUES ($1, $2)`,
    [carId, kenjoEmployeeId]
  );
  await query(
    `UPDATE cars SET assigned_driver_id = $2, updated_at = NOW() WHERE id = $1`,
    [carId, kenjoEmployeeId]
  );
  return getCarById(carId);
}

/**
 * Add maintenance record and optionally update car's last/next maintenance.
 */
async function addMaintenance(carId, data) {
  const res = await query(
    `INSERT INTO car_maintenance (car_id, date, mileage, type, cost, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      carId,
      data.date || new Date().toISOString().slice(0, 10),
      data.mileage != null ? Number(data.mileage) : null,
      data.type || null,
      data.cost != null ? Number(data.cost) : null,
      data.notes || null,
    ]
  );
  const maintenance = res.rows[0];
  const updates = {};
  if (data.date) updates.last_maintenance_date = data.date;
  if (data.mileage != null) updates.mileage = data.mileage;
  if (Object.keys(updates).length) await updateCar(carId, updates);
  return maintenance;
}

/**
 * Delete car. Allowed only when status = Decommissioned.
 */
async function deleteCar(id) {
  const car = (await query('SELECT status FROM cars WHERE id = $1', [id])).rows[0];
  if (!car) return false;
  if (car.status !== STATUS_DECOMMISSIONED) {
    throw new Error('Car can only be deleted when status is Decommissioned.');
  }
  await query('DELETE FROM cars WHERE id = $1', [id]);
  return true;
}

async function resolveVehicleByVin(vin) {
  await ensureInspectionVehicleColumns();
  const normalizedVin = normalizeVinToken(vin);
  if (!normalizedVin) return null;

  const res = await query(
    `SELECT id, vehicle_id, license_plate, vin, model, vehicle_type, inspection_vehicle_type, fleet_provider, station
     FROM cars
     WHERE REGEXP_REPLACE(UPPER(COALESCE(vin, '')), '[^A-Z0-9]', '', 'g') = $1
     LIMIT 1`,
    [normalizedVin],
  );
  const car = res.rows[0];
  if (!car) return null;
  const inferredVehicleType = inferInspectionVehicleType(car);

  if (inferredVehicleType && !normalizeInspectionVehicleType(car.inspection_vehicle_type)) {
    await query(
      `UPDATE cars
       SET inspection_vehicle_type = $2,
           updated_at = NOW()
       WHERE id = $1
         AND COALESCE(TRIM(inspection_vehicle_type), '') = ''`,
      [car.id, inferredVehicleType],
    ).catch(() => null);
  }

  return {
    carId: car.id,
    vehicleId: car.vehicle_id || String(car.id),
    vin: car.vin || normalizedVin,
    licensePlate: car.license_plate || null,
    model: car.model || null,
    vehicleType: inferredVehicleType,
  };
}

export default {
  ensureInspectionVehicleColumns,
  getCars,
  getCarsKpis,
  getCarById,
  createCar,
  updateCar,
  assignDriver,
  addMaintenance,
  deleteCar,
  addCarComment,
  addCarDocument,
  getCarDocumentForDownload,
  resolveVehicleByVin,
  STATUS_ACTIVE,
  STATUS_MAINTENANCE,
  STATUS_OUT_OF_SERVICE,
  STATUS_DECOMMISSIONED,
};
