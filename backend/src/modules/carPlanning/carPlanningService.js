import { query } from '../../db.js';

/**
 * Get all cars for planning grid (vehicle_id, id, license_plate, etc.).
 */
async function getCarsForPlanning() {
  const res = await query(
    `SELECT c.id, c.vehicle_id, c.license_plate
     FROM cars c
     ORDER BY c.vehicle_id`
  );
  return res.rows || [];
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

  for (const s of deduped.values()) {
    const planDate = (s.plan_date || '').toString().slice(0, 10);
    if (!planDate) continue;
    const carId = parseInt(s.car_id, 10);
    if (!Number.isFinite(carId)) continue;
    const hasDriver = (s.driver_identifier || '').toString().trim();
    const hasControl = !!s.abfahrtskontrolle;
    if (!hasDriver && !hasControl) continue;
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

async function addCarWithWindow(numberPlate, vin, sourceType, activeFrom, activeTo) {
  const plate = (numberPlate || '').toString().trim();
  if (!plate) throw new Error('number_plate is required');
  const vinStr = (vin || '').toString().trim() || null;
  const src = (sourceType || '').toString().trim() || null;
  const carRes = await query(
    `INSERT INTO cars (vehicle_id, license_plate, vin, status, fleet_provider, created_at, updated_at)
     VALUES ($1, $2, $3, 'Active', $4, NOW(), NOW())
     RETURNING id, vehicle_id, license_plate`,
    [plate, plate, vinStr, src]
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
