import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool, query } from '../../db.js';
import { RENTAL_SOURCES, rentalError, validateRental } from './rentalValidation.js';

let schemaReady;
export async function ensureRentalSchema() {
  if (!schemaReady) schemaReady = readFile(new URL('../../../migrations/005_fleet_rentals.sql', import.meta.url), 'utf8')
    .then(sql => query(sql)).catch(error => { schemaReady = undefined; throw error; });
  await schemaReady;
}

const selectRental = `SELECT c.id, c.vehicle_id, c.license_plate, c.model, c.vin, c.station,
  c.fleet_provider, c.mileage, s.active_from::text, s.active_to::text,
  r.daily_rate, r.daily_km, r.odometer_start, r.odometer_end, r.extra_km_rate, r.notes,
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

export async function saveRental(id, data) {
  const value = validateRental(data);
  await ensureRentalSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const car = (await client.query('SELECT fleet_provider FROM cars WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!car) throw rentalError('Vehicle not found.', 404);
    if (!RENTAL_SOURCES.includes(String(car.fleet_provider || '').trim().toLowerCase())) throw rentalError('This vehicle is not from a rental source.');
    await client.query('SELECT car_id FROM car_planning_car_state WHERE car_id = $1 FOR UPDATE', [id]);
    const current = serialize((await client.query(`${selectRental} WHERE c.id = $1`, [id])).rows[0]);
    if (current.revision !== data.revision) throw rentalError('Vehicle data changed. Close this dialog and refresh the calendar before saving.', 409);
    await client.query(`INSERT INTO car_planning_car_state (car_id, deactivated, active_from, active_to, updated_at)
      VALUES ($1, false, $2, $3, NOW()) ON CONFLICT (car_id) DO UPDATE
      SET active_from = EXCLUDED.active_from, active_to = EXCLUDED.active_to, updated_at = NOW()`,
    [id, value.active_from, value.active_to]);
    await client.query(`INSERT INTO fleet_rental_details
      (car_id, daily_rate, daily_km, odometer_start, odometer_end, extra_km_rate, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (car_id) DO UPDATE SET
      daily_rate = EXCLUDED.daily_rate, daily_km = EXCLUDED.daily_km,
      odometer_start = EXCLUDED.odometer_start, odometer_end = EXCLUDED.odometer_end,
      extra_km_rate = EXCLUDED.extra_km_rate, notes = EXCLUDED.notes, updated_at = NOW()`,
    [id, value.daily_rate, value.daily_km, value.odometer_start, value.odometer_end, value.extra_km_rate, value.notes]);
    const saved = serialize((await client.query(`${selectRental} WHERE c.id = $1`, [id])).rows[0]);
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
