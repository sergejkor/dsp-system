export function berlinDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function isOutsideLease(car, date = berlinDate()) {
  if (!['lmr', 'rental', 'lmr rental', 'self source'].includes(String(car?.fleet_provider || '').trim().toLowerCase())) return false;
  return Boolean((car.active_from && date < car.active_from.slice(0, 10)) || (car.active_to && date > car.active_to.slice(0, 10)));
}
