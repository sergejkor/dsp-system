const DAY = 86400000;
export function rentalSource(car) {
  const source = String(car.fleet_provider || '').trim().toLowerCase();
  return source === 'lmr' ? 'lmr' : source === 'self source' ? 'self' : 'rental';
}

export function rentalOverlapsMonth(car, first, last) {
  return rentalTotals(car).days != null && car.active_from <= last && car.active_to >= first;
}
function number(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  return Number(value);
}
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;

// Calendar days, including pickup and return. UTC avoids DST changing day counts.
export function rentalTotals(rental) {
  const start = date(rental.active_from), end = date(rental.active_to);
  const days = start != null && end != null && end >= start ? (end - start) / DAY + 1 : null;
  const rate = number(rental.daily_rate), km = number(rental.daily_km);
  const initial = number(rental.odometer_start), final = number(rental.odometer_end);
  const extraRate = number(rental.extra_km_rate);
  const base = days != null && rate != null ? money(days * rate) : null;
  const allowance = days != null && km != null ? money(days * km) : null;
  const driven = initial != null && final != null && final >= initial ? money(final - initial) : null;
  const difference = driven != null && allowance != null ? money(driven - allowance) : null;
  const extra = difference == null ? null : difference <= 0 ? 0 : extraRate == null ? null : money(difference * extraRate);
  return { days, base, allowance, driven, difference, extra, total: base != null && extra != null ? money(base + extra) : null };
}

export function rentalStatus(car, today) {
  if (!car.active_from || !car.active_to || rentalTotals(car).days == null) return 'missing';
  if (car.active_from > today) return 'upcoming';
  if (car.active_to < today) return 'ended';
  return 'active';
}

export function monthRentalCost(car, first, last) {
  if (!car.active_from || !car.active_to || car.active_from > last || car.active_to < first) return null;
  return rentalTotals({ ...car, active_from: car.active_from > first ? car.active_from : first,
    active_to: car.active_to < last ? car.active_to : last }).base;
}
