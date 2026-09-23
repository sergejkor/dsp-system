export const RENTAL_SOURCES = ['lmr', 'rental', 'lmr rental', 'self source'];

export function rentalError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function validateRental(data) {
  const out = {};
  for (const key of ['active_from', 'active_to']) {
    const value = data[key];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || value < '1900-01-01' || value > '9999-12-31'
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw rentalError('Enter valid start and end dates.');
    }
    out[key] = value;
  }
  if (out.active_to < out.active_from) throw rentalError('End date must be on or after start date.');
  for (const key of ['daily_rate', 'daily_km', 'total_price', 'total_km', 'odometer_start', 'odometer_end', 'extra_km_rate']) {
    const value = data[key];
    if (value == null || value === '') { out[key] = null; continue; }
    const precision = key === 'extra_km_rate' ? 4 : 2;
    if (!['string', 'number'].includes(typeof value)
      || !/^\d+(\.\d+)?$/.test(String(value))
      || !Number.isFinite(Number(value)) || Number(value) > 99999999
      || (String(value).split('.')[1]?.length || 0) > precision) {
      throw rentalError(`Invalid ${key}: use a non-negative number with up to ${precision} decimal places.`);
    }
    out[key] = Number(value);
  }
  const days = (Date.parse(out.active_to) - Date.parse(out.active_from)) / 86400000 + 1;
  // Exact contract totals remain authoritative, even when the daily equivalent repeats.
  if (out.total_price != null) out.daily_rate = Math.round((out.total_price / days + Number.EPSILON) * 100) / 100;
  if (out.total_km != null) out.daily_km = Math.round((out.total_km / days + Number.EPSILON) * 100) / 100;
  if (out.odometer_end != null && out.odometer_start == null) throw rentalError('Enter the initial odometer reading first.');
  if (out.odometer_end != null && out.odometer_end < out.odometer_start) throw rentalError('Final odometer cannot be lower than initial odometer.');
  if (data.notes != null && typeof data.notes !== 'string') throw rentalError('Notes must be text.');
  out.notes = (data.notes || '').trim();
  if (out.notes.length > 5000) throw rentalError('Notes must be at most 5000 characters.');
  if (typeof data.revision !== 'string') throw rentalError('Reload the calendar before saving.');
  return out;
}
