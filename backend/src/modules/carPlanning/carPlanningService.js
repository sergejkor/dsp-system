import { query } from '../../db.js';

let carPlanningWorkshopColumnsReady = false;

async function ensureCarPlanningWorkshopColumns() {
  if (carPlanningWorkshopColumnsReady) return;
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_from DATE`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_to DATE`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_name TEXT`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_comment TEXT`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS service_type TEXT`);
  carPlanningWorkshopColumnsReady = true;
}

function toDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function isDateWithinRange(dateYmd, fromYmd, toYmd) {
  if (!dateYmd || !fromYmd) return false;
  const endYmd = toYmd || fromYmd;
  return dateYmd >= fromYmd && dateYmd <= endYmd;
}

function isStatusAutoDeactivated(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return [
    'maintenance',
    'grounded',
    'out of service',
    'defleeted',
    'decommissioned',
  ].includes(normalized);
}

/**
 * Get all cars for planning grid (vehicle_id, id, license_plate, etc.).
 */
async function getCarsForPlanning() {
  await ensureCarPlanningWorkshopColumns();
  const res = await query(
    `SELECT c.id, c.vehicle_id, c.license_plate, c.status,
            c.service_type,
            c.planned_workshop_from::text AS planned_workshop_from,
            c.planned_workshop_to::text AS planned_workshop_to,
            c.planned_workshop_name,
            c.planned_workshop_comment
     FROM cars c
     ORDER BY c.vehicle_id`
  );
  return (res.rows || []).map((row) => ({
    ...row,
    planned_workshop_from: toDateOnly(row.planned_workshop_from),
    planned_workshop_to: toDateOnly(row.planned_workshop_to),
  }));
}

/**
 * Get car planning state (deactivated per car).
 */
async function getCarStates() {
  const res = await query(
    `SELECT car_id, deactivated, active_from, active_to FROM car_planning_car_state`
  );
  const map = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  (res.rows || []).forEach((r) => {
    let deactivated = !!r.deactivated;
    const from = r.active_from ? new Date(r.active_from) : null;
    const to = r.active_to ? new Date(r.active_to) : null;
    if (!deactivated) {
      if (from && today < from) deactivated = true;
      if (to && today > to) deactivated = true;
    }
    map.set(r.car_id, deactivated);
  });
  return map;
}

/**
 * Get active drivers (for dropdown) from kenjo_employees.
 */
async function getActiveDrivers() {
  const res = await query(
    `SELECT kenjo_user_id AS id, transporter_id, employee_number,
            first_name, last_name,
            COALESCE(TRIM(first_name || ' ' || last_name), transporter_id, kenjo_user_id) AS display_name
     FROM kenjo_employees
     WHERE is_active = true
     ORDER BY last_name, first_name`
  );
  return (res.rows || []).map((r) => ({
    id: r.id,
    transporter_id: r.transporter_id,
    employee_number: r.employee_number,
    first_name: r.first_name,
    last_name: r.last_name,
    display_name: r.display_name || r.transporter_id || r.id,
  }));
}

/**
 * Get planning data for given dates: car states + slots (car_id, plan_date, driver_identifier, abfahrtskontrolle).
 */
async function getPlanningData(dates) {
  await ensureCarPlanningWorkshopColumns();
  if (!Array.isArray(dates) || dates.length === 0) {
    return { carStates: {}, slots: [] };
  }
  const dateList = dates.map((d) => (d || '').toString().slice(0, 10)).filter(Boolean);
  if (dateList.length === 0) return { carStates: {}, slots: [] };

  const [stateRes, slotsRes] = await Promise.all([
    query(`SELECT car_id, deactivated FROM car_planning_car_state`),
    query(
      `SELECT car_id, plan_date::text AS plan_date, driver_identifier, abfahrtskontrolle
       FROM car_planning
       WHERE plan_date = ANY($1::date[])`,
      [dateList]
    ),
  ]);

  const carStates = {};
  (stateRes.rows || []).forEach((r) => {
    carStates[r.car_id] = !!r.deactivated;
  });

  const slots = (slotsRes.rows || []).map((r) => ({
    car_id: r.car_id,
    plan_date: r.plan_date,
    driver_identifier: r.driver_identifier,
    abfahrtskontrolle: !!r.abfahrtskontrolle,
  }));

  return { carStates, slots };
}

/**
 * Save planning: car states (deactivated) and slots (car_id, plan_date, driver_identifier, abfahrtskontrolle).
 */
async function savePlanningData(carStates = {}, slots = []) {
  await ensureCarPlanningWorkshopColumns();
  const carIds = Object.keys(carStates).map((k) => parseInt(k, 10)).filter(Number.isFinite);
  for (const carId of carIds) {
    await query(
      `INSERT INTO car_planning_car_state (car_id, deactivated, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (car_id) DO UPDATE SET deactivated = EXCLUDED.deactivated, updated_at = NOW()`,
      [carId, !!carStates[carId]]
    );
  }

  const dateList = [...new Set(slots.map((s) => (s.plan_date || '').toString().slice(0, 10)).filter(Boolean))];
  const deduped = new Map();
  slots.forEach((s) => {
    const key = `${s.car_id}|${(s.plan_date || '').toString().slice(0, 10)}`;
    deduped.set(key, s);
  });

  if (dateList.length > 0) {
    await query(
      `DELETE FROM car_planning WHERE plan_date = ANY($1::date[])`,
      [dateList]
    );
  }

  const workshopWindowByCarId = new Map();
  const statusByCarId = new Map();
  const workshopCarIds = [...new Set([...deduped.values()].map((s) => parseInt(s.car_id, 10)).filter(Number.isFinite))];
  if (workshopCarIds.length > 0) {
    const workshopCarsRes = await query(
      `SELECT id, status, planned_workshop_from::text AS planned_workshop_from, planned_workshop_to::text AS planned_workshop_to
       FROM cars
       WHERE id = ANY($1::int[])`,
      [workshopCarIds]
    );
    for (const row of workshopCarsRes.rows || []) {
      statusByCarId.set(row.id, row.status || '');
      workshopWindowByCarId.set(row.id, {
        from: toDateOnly(row.planned_workshop_from),
        to: toDateOnly(row.planned_workshop_to),
      });
    }
  }

  for (const s of deduped.values()) {
    const planDate = (s.plan_date || '').toString().slice(0, 10);
    if (!planDate) continue;
    const carId = parseInt(s.car_id, 10);
    if (!Number.isFinite(carId)) continue;
    const hasDriver = (s.driver_identifier || '').toString().trim();
    const hasControl = !!s.abfahrtskontrolle;
    if (!hasDriver && !hasControl) continue;
    if (isStatusAutoDeactivated(statusByCarId.get(carId))) {
      throw new Error(`Car ${carId} is not available for planning because of its current status`);
    }
    const workshopWindow = workshopWindowByCarId.get(carId);
    if (workshopWindow?.from && isDateWithinRange(planDate, workshopWindow.from, workshopWindow.to)) {
      throw new Error(`Car ${carId} has a planned workshop appointment on ${planDate}`);
    }
    await query(
      `INSERT INTO car_planning (car_id, plan_date, driver_identifier, abfahrtskontrolle, updated_at)
       VALUES ($1, $2, NULLIF(TRIM($3), ''), $4, NOW())`,
      [carId, planDate, (s.driver_identifier || '').toString(), hasControl]
    );
  }

  return { ok: true };
}

/**
 * Report for a single date: list of { vehicle_id, driver_identifier } for that day.
 */
async function getReport(date) {
  const d = (date || '').toString().slice(0, 10);
  if (!d) return [];
  const res = await query(
    `SELECT c.vehicle_id, c.license_plate, p.driver_identifier, p.abfahrtskontrolle
     FROM car_planning p
     JOIN cars c ON c.id = p.car_id
     WHERE p.plan_date = $1
       AND (
         p.abfahrtskontrolle = true
         OR (p.driver_identifier IS NOT NULL AND TRIM(p.driver_identifier) != '')
       )
     ORDER BY c.vehicle_id`,
    [d]
  );
  return (res.rows || []).map((r) => ({
    vehicle_id: r.vehicle_id,
    license_plate: r.license_plate,
    driver_identifier: r.driver_identifier,
    abfahrtskontrolle: !!r.abfahrtskontrolle,
  }));
}

async function addCarWithWindow(numberPlate, vin, sourceType, serviceType, activeFrom, activeTo) {
  await ensureCarPlanningWorkshopColumns();
  const plate = (numberPlate || '').toString().trim();
  if (!plate) throw new Error('number_plate is required');
  const vinStr = (vin || '').toString().trim() || null;
  const src = (sourceType || '').toString().trim() || null;
  const svc = (serviceType || '').toString().trim() || null;
  const carRes = await query(
    `INSERT INTO cars (vehicle_id, license_plate, vin, status, fleet_provider, service_type, created_at, updated_at)
     VALUES ($1, $2, $3, 'Active', $4, $5, NOW(), NOW())
     RETURNING id, vehicle_id, license_plate, service_type`,
    [plate, plate, vinStr, src, svc]
  );
  const car = carRes.rows[0];
  await query(
    `INSERT INTO car_planning_car_state (car_id, deactivated, active_from, active_to, updated_at)
     VALUES ($1, false, $2, $3, NOW())
     ON CONFLICT (car_id) DO UPDATE SET active_from = EXCLUDED.active_from, active_to = EXCLUDED.active_to, updated_at = NOW()`,
    [car.id, activeFrom || null, activeTo || null]
  );
  return car;
}

export default {
  getCarsForPlanning,
  getCarStates,
  getActiveDrivers,
  getPlanningData,
  savePlanningData,
  getReport,
  addCarWithWindow,
};
