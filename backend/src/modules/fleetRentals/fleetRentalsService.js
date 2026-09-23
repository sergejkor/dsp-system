import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool, query } from '../../db.js';
import { RENTAL_SOURCES, rentalError, validateRental } from './rentalValidation.js';

let schemaReady;
export async function ensureRentalSchema() {
  if (!schemaReady) schemaReady = readFile(new URL('../../../migrations/005_fleet_rentals.sql', import.meta.url), 'utf8')
    .then(sql => query(sql))
    .then(() => readFile(new URL('../../../migrations/006_fleet_rental_totals.sql', import.meta.url), 'utf8'))
    .then(sql => query(sql))
    .then(() => readFile(new URL('../../../migrations/007_fleet_rental_monthly.sql', import.meta.url), 'utf8'))
    .then(sql => query(sql)).catch(error => { schemaReady = undefined; throw error; });
  await schemaReady;
}

const selectRental = `SELECT c.id, c.vehicle_id, c.license_plate, c.model, c.vin, c.station,
  c.fleet_provider, c.service_type, c.mileage, s.active_from::text, s.active_to::text,
  r.daily_rate, r.daily_km, r.monthly_rate, r.monthly_km, r.total_price, r.total_km, r.odometer_start, r.odometer_end, r.extra_km_rate, r.notes,
  r.updated_at::text AS rental_updated_at
  FROM cars c LEFT JOIN car_planning_car_state s ON s.car_id = c.id
  LEFT JOIN fleet_rental_details r ON r.car_id = c.id`;

function serialize(row) {
  if (!row) return null;
  const revision = createHash('sha256').update(JSON.stringify(row)).digest('hex');
  return { ...row, revision };
}

export async function listRentals() {
  await ensureRentalSchema();
  const result = await query(`${selectRental}
    WHERE LOWER(TRIM(c.fleet_provider)) = ANY($1::text[])
    ORDER BY COALESCE(NULLIF(c.license_plate, ''), c.vehicle_id), c.id`, [RENTAL_SOURCES]);
  return result.rows.map(serialize);
}

// Same completed-route source and counting convention as Dashboard / Analytics.
export async function getDrivenRoutes(month) {
  if (typeof month !== 'string' || !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    throw rentalError('Enter a valid month (YYYY-MM).');
  }
  const result = await query(`SELECT to_char(day_key, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
    FROM daily_upload_rows
    WHERE day_key >= $1::date AND day_key < $1::date + INTERVAL '1 month'
    GROUP BY day_key ORDER BY day_key`, [`${month}-01`]);
  return result.rows;
}

export async function saveRental(id, data) {
  await ensureRentalSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const car = (await client.query('SELECT fleet_provider FROM cars WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!car) throw rentalError('Vehicle not found.', 404);
    if (!RENTAL_SOURCES.includes(String(car.fleet_provider || '').trim().toLowerCase())) throw rentalError('This vehicle is not from a rental source.');
    const isLmr = String(car.fleet_provider).trim().toLowerCase() === 'lmr';
    const value = validateRental(isLmr ? { ...data, monthly_rate: null, monthly_km: null, total_price: null, total_km: null, daily_rate: null, daily_km: null, odometer_start: null, odometer_end: null, extra_km_rate: null } : data);
    await client.query('SELECT car_id FROM car_planning_car_state WHERE car_id = $1 FOR UPDATE', [id]);
    const current = serialize((await client.query(`${selectRental} WHERE c.id = $1`, [id])).rows[0]);
    if (current.revision !== data.revision) throw rentalError('Vehicle data changed. Close this dialog and refresh the calendar before saving.', 409);
    await client.query(`INSERT INTO car_planning_car_state (car_id, deactivated, active_from, active_to, updated_at)
      VALUES ($1, false, $2, $3, NOW()) ON CONFLICT (car_id) DO UPDATE
      SET active_from = EXCLUDED.active_from, active_to = EXCLUDED.active_to, updated_at = NOW()`,
    [id, value.active_from, value.active_to]);
    if (isLmr) {
      // LMR has a separate payment model. Preserve any existing rental figures.
      await client.query(`INSERT INTO fleet_rental_details (car_id, notes) VALUES ($1, $2)
        ON CONFLICT (car_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()`, [id, value.notes]);
    } else await client.query(`INSERT INTO fleet_rental_details
      (car_id, daily_rate, daily_km, odometer_start, odometer_end, extra_km_rate, notes, total_price, total_km, monthly_rate, monthly_km)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (car_id) DO UPDATE SET
      monthly_rate = EXCLUDED.monthly_rate, monthly_km = EXCLUDED.monthly_km,
      total_price = EXCLUDED.total_price, total_km = EXCLUDED.total_km,
      daily_rate = EXCLUDED.daily_rate, daily_km = EXCLUDED.daily_km,
      odometer_start = EXCLUDED.odometer_start, odometer_end = EXCLUDED.odometer_end,
      extra_km_rate = EXCLUDED.extra_km_rate, notes = EXCLUDED.notes, updated_at = NOW()`,
    [id, value.daily_rate, value.daily_km, value.odometer_start, value.odometer_end, value.extra_km_rate, value.notes, value.total_price, value.total_km, value.monthly_rate, value.monthly_km]);
    const saved = serialize((await client.query(`${selectRental} WHERE c.id = $1`, [id])).rows[0]);
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
