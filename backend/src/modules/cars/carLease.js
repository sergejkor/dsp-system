export const isLeasedCar = source => ['lmr', 'rental', 'lmr rental', 'self source'].includes(String(source || '').trim().toLowerCase());

export function validateLease(data, source) {
  if (!isLeasedCar(source) || (data.active_from === undefined && data.active_to === undefined)) return null;
  for (const name of ['active_from', 'active_to']) {
    const value = data[name];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw Object.assign(new Error('Enter valid lease start and end dates.'), { status: 400 });
    }
  }
  if (data.active_to < data.active_from) throw Object.assign(new Error('Lease end must not precede lease start.'), { status: 400 });
  return { active_from: data.active_from, active_to: data.active_to };
}

export async function saveLease(query, id, lease) {
  if (!lease) return;
  await query(`INSERT INTO car_planning_car_state (car_id, deactivated, active_from, active_to, updated_at)
    VALUES ($1, false, $2, $3, NOW()) ON CONFLICT (car_id) DO UPDATE
    SET active_from = EXCLUDED.active_from, active_to = EXCLUDED.active_to, updated_at = NOW()`, [id, lease.active_from, lease.active_to]);
}
