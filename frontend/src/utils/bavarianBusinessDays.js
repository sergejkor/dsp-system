const DAY = 86400000;

// Statewide holidays: https://www.stmi.bayern.de/staat-und-verfassung/feiertage/
// Gregorian Easter (Meeus/Jones/Butcher), in UTC to avoid DST offsets.
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114;
  return Date.UTC(year, Math.floor(value / 31) - 1, value % 31 + 1);
}

function holidays(year) {
  const fixed = [[0, 1], [0, 6], [4, 1], [9, 3], [10, 1], [11, 25], [11, 26]];
  const easter = easterSunday(year);
  return new Set([...fixed.map(([month, day]) => Date.UTC(year, month, day)),
    ...[-2, 1, 39, 50, 60].map(offset => easter + offset * DAY)]);
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

// Inclusive endpoints. Saturdays count unless they are a statewide public holiday.
export function bavarianBusinessDays(from, to) {
  const start = parseDate(from), end = parseDate(to);
  if (start == null || end == null || end < start) return null;
  const days = (end - start) / DAY + 1;
  const firstSunday = (7 - new Date(start).getUTCDay()) % 7;
  const sundays = firstSunday >= days ? 0 : 1 + Math.floor((days - firstSunday - 1) / 7);
  let count = days - sundays;
  for (let year = new Date(start).getUTCFullYear(); year <= new Date(end).getUTCFullYear(); year++) {
    for (const holiday of holidays(year)) {
      if (holiday >= start && holiday <= end && new Date(holiday).getUTCDay() !== 0) count--;
    }
  }
  return count;
}
