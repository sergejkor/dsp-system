import { query } from '../../db.js';
import { getKenjoUsersList } from '../kenjo/kenjoClient.js';
import { getAuthHeader } from '../kenjo/kenjoAuth.js';
import settingsService from '../settings/settingsService.js';
import { PDFDocument } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import employeeService from '../employees/employeeService.js';

const KENJO_BASE_URL = 'https://api.kenjo.io/api/v1';

/**
 * Get ISO year and week number for a date string YYYY-MM-DD.
 */
function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const year = monday.getFullYear();
  const start = new Date(year, 0, 1);
  const week = Math.ceil((((monday - start) / 86400000) + start.getDay() + 1) / 7);
  return { year, week };
}

/**
 * Get list of { year, week } for all weeks overlapping [fromDate, toDate].
 */
function getWeeksInRange(fromDate, toDate) {
  const weeks = [];
  const seen = new Set();
  const from = new Date(fromDate + 'T12:00:00');
  const to = new Date(toDate + 'T12:00:00');
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    const { year, week } = getISOWeek(s);
    const key = `${year}-${week}`;
    if (!seen.has(key)) {
      seen.add(key);
      weeks.push({ year, week });
    }
  }
  weeks.sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week);
  return weeks;
}

function getIsoWeekRange(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dayOfWeek = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  if (dayOfWeek <= 4) monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
  else monday.setUTCDate(simple.getUTCDate() + 8 - dayOfWeek);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}

function parseIsoDate(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

function addDays(value, amount) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function roundDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function normalizeDateOnly(value) {
  if (value == null) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  if (value instanceof Date) return formatDate(value);
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : formatDate(date);
}

function countWeekdaysInclusive(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || start > end) return 0;
  let total = 0;
  for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
    const dayOfWeek = day.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) total += 1;
  }
  return total;
}

function sumWorkingDaysForRanges(ranges, rangeStart, rangeEnd) {
  let total = 0;
  for (const range of Array.isArray(ranges) ? ranges : []) {
    const startDate = normalizeDateOnly(range?.start_date ?? range?.start);
    const endDate = normalizeDateOnly(range?.end_date ?? range?.end);
    if (!startDate || !endDate) continue;
    const effectiveStart = startDate > rangeStart ? startDate : rangeStart;
    const effectiveEnd = endDate < rangeEnd ? endDate : rangeEnd;
    if (effectiveStart > effectiveEnd) continue;
    total += countWeekdaysInclusive(effectiveStart, effectiveEnd);
  }
  return total;
}

function getNormalizedLookupKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getNormalizedPnLookupKey(value) {
  const normalized = getNormalizedLookupKey(value);
  return normalized.replace(/^0+/, '') || normalized;
}

function updateContractStateLookup(map, rawKey, contractEndDate, isOpenContract) {
  const key = getNormalizedLookupKey(rawKey);
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, { matched: false, hasOpenContract: false, latestContractEnd: '' });
  }
  const state = map.get(key);
  state.matched = true;
  if (isOpenContract) state.hasOpenContract = true;
  const normalizedEndDate = normalizeDateOnly(contractEndDate);
  if (normalizedEndDate && (!state.latestContractEnd || normalizedEndDate > state.latestContractEnd)) {
    state.latestContractEnd = normalizedEndDate;
  }
}

function resolveContractStateLookup(map, rawKeys) {
  let matched = false;
  let hasOpenContract = false;
  let latestContractEnd = '';
  for (const rawKey of Array.isArray(rawKeys) ? rawKeys : []) {
    const key = getNormalizedLookupKey(rawKey);
    if (!key || !map.has(key)) continue;
    const state = map.get(key);
    matched = matched || !!state?.matched;
    hasOpenContract = hasOpenContract || !!state?.hasOpenContract;
    if (state?.latestContractEnd && (!latestContractEnd || state.latestContractEnd > latestContractEnd)) {
      latestContractEnd = state.latestContractEnd;
    }
  }
  return {
    matched,
    contract_end: hasOpenContract ? null : (latestContractEnd || null),
  };
}

function normalizeAbzugLines(lines) {
  const source = Array.isArray(lines) ? lines : [];
  const normalized = [
    { amount: Number(source[0]?.amount) || 0, comment: String(source[0]?.comment ?? '').trim() },
    { amount: Number(source[1]?.amount) || 0, comment: String(source[1]?.comment ?? '').trim() },
    { amount: Number(source[2]?.amount) || 0, comment: String(source[2]?.comment ?? '').trim() },
  ];
  return normalized.map((line) => ({
    amount: Math.round((Number(line.amount) || 0) * 100) / 100,
    comment: line.comment,
  }));
}

function hasExplicitAbzugLines(lines) {
  return normalizeAbzugLines(lines).some((line) => (Number(line.amount) || 0) !== 0 || !!String(line.comment || '').trim());
}

function getTotalAbzugFromLines(lines) {
  return Math.round(
    normalizeAbzugLines(lines).reduce((sum, line) => sum + (Number(line.amount) || 0), 0) * 100
  ) / 100;
}

function getUserCarryOverDays(user) {
  const directValue = user?.carryOverDays ?? user?.work?.carryOverDays;
  if (directValue != null && directValue !== '' && Number.isFinite(Number(directValue))) {
    return roundDays(directValue);
  }
  const customField = (Array.isArray(user?.customFields) ? user.customFields : []).find((field) => {
    const key = String(field?.key ?? '').trim();
    const name = String(field?.name ?? '').trim();
    return key === 'c_CarryOverDays' || name === 'Carry over days';
  });
  return roundDays(customField?.value);
}

function buildVacationBalanceSnapshot({
  totalYearVacation,
  carryOverDays,
  approvedVacationDaysYear,
  approvedVacationDaysUntilMarch31,
  currentRemainingVacationSeed,
  currentRemainingVacationSeedDate,
  approvedVacationDaysAfterSeed,
  year,
  now = new Date(),
}) {
  const safeYear = Number.isInteger(Number(year)) ? Number(year) : now.getFullYear();
  const baseTotalYearVacation = roundDays(totalYearVacation || 20);
  const carryOver = roundDays(carryOverDays);
  const usedYear = roundDays(approvedVacationDaysYear);
  const usedUntilMarch31 = roundDays(approvedVacationDaysUntilMarch31);
  const seedStartingBalance =
    currentRemainingVacationSeed != null && Number.isFinite(Number(currentRemainingVacationSeed))
      ? roundDays(currentRemainingVacationSeed)
      : null;
  const seedDateIso = currentRemainingVacationSeedDate ? String(currentRemainingVacationSeedDate).slice(0, 10) : '';
  const seedApplied = seedStartingBalance != null && !!seedDateIso;
  const usedAfterSeed = seedApplied ? roundDays(approvedVacationDaysAfterSeed) : 0;
  const marchDeadline = new Date(safeYear, 2, 31, 23, 59, 59, 999);
  const carryConsumedByDeadline = Math.min(carryOver, usedUntilMarch31);
  const afterCarryDeadline = now.getFullYear() > safeYear || (now.getFullYear() === safeYear && now > marchDeadline);
  const carryExpired = afterCarryDeadline ? Math.max(carryOver - carryConsumedByDeadline, 0) : 0;
  const carryAvailableNow = afterCarryDeadline ? 0 : Math.max(carryOver - usedYear, 0);
  const chargedCurrentYearVacation = afterCarryDeadline
    ? Math.max(usedYear - carryConsumedByDeadline, 0)
    : Math.max(usedYear - Math.min(carryOver, usedYear), 0);
  const remainingVacationDays = seedApplied
    ? Math.max(seedStartingBalance - usedAfterSeed, 0)
    : afterCarryDeadline
      ? Math.max(baseTotalYearVacation - chargedCurrentYearVacation, 0)
      : Math.max(baseTotalYearVacation + carryOver - usedYear, 0);

  return {
    carryOver,
    remainingVacationDays: roundDays(remainingVacationDays),
  };
}

function normalizeKenjoAttendancePayload(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.items)) return json.items;
  return [];
}

async function fetchKenjoAttendancesForDay(isoDay) {
  const authHeader = await getAuthHeader();
  const qs = new URLSearchParams({ from: isoDay, to: isoDay }).toString();
  const resp = await fetch(`${KENJO_BASE_URL}/attendances?${qs}`, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  const text = await resp.text();
  if (!resp.ok) {
    const msg = String(text || '');
    if (resp.status === 404 && msg.toLowerCase().includes('could not find attendance entries')) {
      return [];
    }
    console.error('Payroll attendance day fetch failed', { isoDay, status: resp.status, body: text });
    throw new Error(`Kenjo GET /attendances failed ${resp.status} [from=${isoDay} to=${isoDay}]: ${text}`);
  }

  if (!text) return [];

  try {
    return normalizeKenjoAttendancePayload(JSON.parse(text));
  } catch {
    throw new Error('Kenjo GET /attendances returned invalid JSON');
  }
}

async function getKenjoAttendancesForPayrollRange(fromDate, toDate) {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  if (!from || !to || from > to) return [];

  const merged = [];
  for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
    const isoDay = formatIsoDate(day);
    const rows = await fetchKenjoAttendancesForDay(isoDay);
    if (Array.isArray(rows) && rows.length) merged.push(...rows);
  }
  return merged;
}

/**
 * Count working days per user in a date range from Kenjo attendances.
 * Returns Map<userId, number> and Map<userId, Map<weekKey, days>> for days per week.
 */
function countWorkingDaysFromAttendances(attendances, fromDate, toDate) {
  const from = fromDate.slice(0, 10);
  const to = toDate.slice(0, 10);
  const distinctByUserCorrect = new Map();
  const byUserWeekDays = new Map();
  for (const a of attendances || []) {
    const uid = String(a.userId ?? a.user_id ?? a.employeeId ?? a._id ?? '').trim();
    const rawDate = a.date ?? a.day ?? a.startTime ?? a.start_time ?? '';
    const dateStr = String(rawDate).trim().slice(0, 10);
    if (!uid || !dateStr || dateStr.length < 10 || dateStr < from || dateStr > to) continue;
    if (!distinctByUserCorrect.has(uid)) distinctByUserCorrect.set(uid, new Set());
    distinctByUserCorrect.get(uid).add(dateStr);
    const { year, week } = getISOWeek(dateStr);
    const wk = `${year}-${week}`;
    if (!byUserWeekDays.has(uid)) byUserWeekDays.set(uid, new Map());
    const wm = byUserWeekDays.get(uid);
    if (!wm.has(wk)) wm.set(wk, new Set());
    wm.get(wk).add(dateStr);
  }
  const workingDaysInRange = new Map();
  for (const [uid, set] of distinctByUserCorrect) workingDaysInRange.set(uid, set.size);
  const daysPerWeek = new Map();
  for (const [uid, wm] of byUserWeekDays) {
    const weekCounts = new Map();
    for (const [wk, set] of wm) weekCounts.set(wk, set.size);
    daysPerWeek.set(uid, weekCounts);
  }
  return { workingDaysInRange, daysPerWeek };
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const PAYROLL_ROW_OVERRIDE_TEXT_FIELDS = new Set(['name', 'pn']);
const PAYROLL_ROW_OVERRIDE_DATE_FIELDS = new Set(['eintrittsdatum', 'austrittsdatum']);
const PAYROLL_ROW_OVERRIDE_NUMBER_FIELDS = new Set([
  'working_days',
  'worked_hours',
  'expected_hours',
  'overtime_hours',
  'krank_days',
  'urlaub_days',
  'carryover_days',
  'rest_urlaub',
  'total_bonus',
  'abzug',
  'verpfl_mehr',
  'fahrt_geld',
  'bonus',
  'vorschuss',
]);
const PAYROLL_ROW_OVERRIDE_ALLOWED_FIELDS = new Set([
  ...PAYROLL_ROW_OVERRIDE_TEXT_FIELDS,
  ...PAYROLL_ROW_OVERRIDE_DATE_FIELDS,
  ...PAYROLL_ROW_OVERRIDE_NUMBER_FIELDS,
]);

function sanitizePayrollRowOverridePayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const sanitized = {};
  for (const [key, rawValue] of Object.entries(source)) {
    if (!PAYROLL_ROW_OVERRIDE_ALLOWED_FIELDS.has(key)) continue;
    if (PAYROLL_ROW_OVERRIDE_TEXT_FIELDS.has(key)) {
      sanitized[key] = String(rawValue ?? '').trim();
      continue;
    }
    if (PAYROLL_ROW_OVERRIDE_DATE_FIELDS.has(key)) {
      const normalized = normalizeDateOnly(rawValue);
      sanitized[key] = normalized || null;
      continue;
    }
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) {
      throw new Error(`${key} must be a valid number`);
    }
    sanitized[key] = round2(numeric);
  }
  return sanitized;
}

function applyPayrollRowOverride(row, payload) {
  const next = { ...row };
  const override = sanitizePayrollRowOverridePayload(payload);
  for (const [key, value] of Object.entries(override)) {
    if (key === 'worked_hours') {
      next.total_worked_hours = value;
      next.worked_hours = value;
      next.payroll_worked_hours_override = value;
      continue;
    }
    if (key === 'expected_hours') {
      next.expected_hours = value;
      next.worked_hours_capped = value;
      next.payroll_regular_hours_override = value;
      continue;
    }
    if (key === 'overtime_hours') {
      next.overtime_hours = value;
      next.payroll_overtime_hours_override = value;
      continue;
    }
    next[key] = value;
  }

  if (Object.prototype.hasOwnProperty.call(override, 'total_bonus') || Object.prototype.hasOwnProperty.call(override, 'abzug')) {
    next.after_abzug = round2((Number(next.total_bonus) || 0) - (Number(next.abzug) || 0));
  }

  return next;
}

function resolveKenjoEmployeeId(record) {
  return String(
    record?.userId ??
    record?.user_id ??
    record?.employeeId ??
    record?.employee_id ??
    record?.user?._id ??
    record?.user?.id ??
    record?.employee?._id ??
    record?.employee?.id ??
    record?.account?._id ??
    record?.account?.id ??
    ''
  ).trim();
}

function getNestedValue(obj, path) {
  let current = obj;
  for (const segment of path) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function durationValueToHours(value, unitHint = null) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (unitHint === 'hours') return value;
    if (unitHint === 'minutes') return value / 60;
    if (unitHint === 'seconds') return value / 3600;
    if (value > 1440) return value / 3600;
    if (value > 24) return value / 60;
    return value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  const hhmmss = raw.match(/^(-?\d+):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    const hours = Number(hhmmss[1]) || 0;
    const minutes = Number(hhmmss[2]) || 0;
    const seconds = Number(hhmmss[3]) || 0;
    return hours + (minutes / 60) + (seconds / 3600);
  }

  const numeric = Number(raw.replace(',', '.'));
  if (Number.isFinite(numeric)) {
    return durationValueToHours(numeric, unitHint);
  }

  return 0;
}

function timeValueToSeconds(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const hhmmss = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    return (Number(hhmmss[1]) || 0) * 3600 + (Number(hhmmss[2]) || 0) * 60 + (Number(hhmmss[3]) || 0);
  }

  const isoTime = raw.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (isoTime) {
    return (Number(isoTime[1]) || 0) * 3600 + (Number(isoTime[2]) || 0) * 60 + (Number(isoTime[3]) || 0);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getUTCHours() * 3600 + parsed.getUTCMinutes() * 60 + parsed.getUTCSeconds();
  }

  return null;
}

function getAttendanceBreakHours(attendance) {
  const breakCandidates = [
    { path: ['breakHours'], unit: 'hours' },
    { path: ['break_hours'], unit: 'hours' },
    { path: ['breakMinutes'], unit: 'minutes' },
    { path: ['break_minutes'], unit: 'minutes' },
    { path: ['breakTime'], unit: 'minutes' },
    { path: ['break_time'], unit: 'minutes' },
    { path: ['breakSeconds'], unit: 'seconds' },
    { path: ['break_seconds'], unit: 'seconds' },
    { path: ['breakDuration'], unit: null },
    { path: ['break_duration'], unit: null },
  ];

  for (const candidate of breakCandidates) {
    const value = getNestedValue(attendance, candidate.path);
    const hours = durationValueToHours(value, candidate.unit);
    if (hours > 0) return hours;
  }

  if (Array.isArray(attendance?.breaks) && attendance.breaks.length) {
    let totalBreakHours = 0;
    for (const entry of attendance.breaks) {
      const startSeconds = timeValueToSeconds(entry?.start ?? entry?.startTime ?? entry?.start_time ?? null);
      const endSeconds = timeValueToSeconds(entry?.end ?? entry?.endTime ?? entry?.end_time ?? null);
      if (startSeconds != null && endSeconds != null && endSeconds > startSeconds) {
        totalBreakHours += (endSeconds - startSeconds) / 3600;
      }
    }
    if (totalBreakHours > 0) return totalBreakHours;
  }

  return 0;
}

function getAttendanceWorkedHours(attendance) {
  const startValue =
    attendance?.startTime ??
    attendance?.start_time ??
    attendance?.start ??
    attendance?.startAt ??
    attendance?.start_at ??
    attendance?.checkIn ??
    attendance?.check_in ??
    attendance?.clockIn ??
    attendance?.clock_in ??
    null;
  const endValue =
    attendance?.endTime ??
    attendance?.end_time ??
    attendance?.end ??
    attendance?.endAt ??
    attendance?.end_at ??
    attendance?.checkOut ??
    attendance?.check_out ??
    attendance?.clockOut ??
    attendance?.clock_out ??
    null;
  if (!endValue) return 0;

  const explicitDurationCandidates = [
    { path: ['workedHours'], unit: 'hours' },
    { path: ['worked_hours'], unit: 'hours' },
    { path: ['durationHours'], unit: 'hours' },
    { path: ['duration_hours'], unit: 'hours' },
    { path: ['hoursWorked'], unit: 'hours' },
    { path: ['hours_worked'], unit: 'hours' },
    { path: ['workedMinutes'], unit: 'minutes' },
    { path: ['worked_minutes'], unit: 'minutes' },
    { path: ['durationMinutes'], unit: 'minutes' },
    { path: ['duration_minutes'], unit: 'minutes' },
    { path: ['minutesWorked'], unit: 'minutes' },
    { path: ['minutes_worked'], unit: 'minutes' },
    { path: ['workedSeconds'], unit: 'seconds' },
    { path: ['worked_seconds'], unit: 'seconds' },
    { path: ['durationSeconds'], unit: 'seconds' },
    { path: ['duration_seconds'], unit: 'seconds' },
    { path: ['secondsWorked'], unit: 'seconds' },
    { path: ['seconds_worked'], unit: 'seconds' },
    { path: ['workedTime'], unit: null },
    { path: ['worked_time'], unit: null },
    { path: ['duration'], unit: null },
  ];

  for (const candidate of explicitDurationCandidates) {
    const value = getNestedValue(attendance, candidate.path);
    const hours = durationValueToHours(value, candidate.unit);
    if (hours > 0) return hours;
  }

  const breakHours = getAttendanceBreakHours(attendance);
  const startDateMs = Date.parse(String(startValue || ''));
  const endDateMs = Date.parse(String(endValue || ''));
  if (Number.isFinite(startDateMs) && Number.isFinite(endDateMs) && endDateMs > startDateMs) {
    return Math.max(((endDateMs - startDateMs) / 3600000) - breakHours, 0);
  }

  const startSeconds = timeValueToSeconds(startValue);
  const endSeconds = timeValueToSeconds(endValue);
  if (startSeconds == null || endSeconds == null || endSeconds <= startSeconds) return 0;
  return Math.max(((endSeconds - startSeconds) / 3600) - breakHours, 0);
}

function getMonthlyContractExpectedHours(employee, monthStart, monthEnd) {
  const weeklyHours = Number(
    employee?.weeklyHours ??
    employee?.weekly_hours ??
    employee?.work?.weeklyHours ??
    employee?.work?.weekly_hours ??
    0
  );
  let weeklyDays = Number(
    employee?.weeklyDays ??
    employee?.weekly_days ??
    employee?.work?.weeklyDays ??
    employee?.work?.weekly_days ??
    0
  );

  if (!(weeklyHours > 0)) return 0;
  if (!(weeklyDays > 0)) weeklyDays = 5;
  weeklyDays = Math.max(1, Math.min(Math.round(weeklyDays), 5));

  const dailyHours = weeklyHours / weeklyDays;
  if (!(dailyHours > 0)) return 0;

  const activeWeekdays = new Set();
  for (let weekday = 1; weekday <= weeklyDays; weekday += 1) {
    activeWeekdays.add(weekday);
  }

  let total = 0;
  for (let cursor = new Date(`${monthStart}T12:00:00`); cursor <= new Date(`${monthEnd}T12:00:00`); cursor.setDate(cursor.getDate() + 1)) {
    const weekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
    if (activeWeekdays.has(weekday)) total += dailyHours;
  }

  return round2(total);
}

function summarizeEmployeeMonthlyKenjoHours(employeeId, attendances, employee = null, monthStart = '', monthEnd = '') {
  const targetId = String(employeeId || '').trim();
  let workedHours = 0;

  if (targetId) {
    for (const attendance of attendances || []) {
      if (resolveKenjoEmployeeId(attendance) !== targetId) continue;
      workedHours += getAttendanceWorkedHours(attendance);
    }
  }

  workedHours = round2(workedHours);
  const expectedHours = getMonthlyContractExpectedHours(employee, monthStart, monthEnd);
  const regularHours = round2(expectedHours > 0 ? Math.min(workedHours, expectedHours) : workedHours);
  const overtimeHours = round2(expectedHours > 0 ? Math.max(workedHours - expectedHours, 0) : 0);

  return {
    workedHours,
    regularHours,
    expectedHours,
    overtimeHours,
  };
}

function getMonthlyKenjoHoursByEmployee(employeeIds, attendances, users, monthStart, monthEnd) {
  const ids = [...new Set((employeeIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const userById = new Map(
    (users || [])
      .map((user) => [String(user?._id || user?.id || '').trim(), user])
      .filter(([id]) => id)
  );

  const out = new Map();
  for (const employeeId of ids) {
    out.set(
      employeeId,
      summarizeEmployeeMonthlyKenjoHours(
        employeeId,
        attendances,
        userById.get(employeeId) || null,
        monthStart,
        monthEnd
      )
    );
  }
  return out;
}

/**
 * Calculate payroll table for a month and KPI period (from–to).
 * Returns array of row objects for frontend table.
 */
export async function calculatePayroll(month, fromDate, toDate) {
  const monthStr = String(month || '').trim().slice(0, 7);
  const from = String(fromDate || '').trim().slice(0, 10);
  const to = String(toDate || '').trim().slice(0, 10);
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) throw new Error('month (YYYY-MM) is required');
  if (!from || !to || from > to) throw new Error('from and to dates (YYYY-MM-DD) are required');

  const [y, m] = monthStr.split('-').map(Number);
  const monthStart = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  const yearStart = `${y}-01-01`;
  const yearEnd = `${y}-12-31`;
  const marchDeadline = `${y}-03-31`;
  const weeksInPeriod = getWeeksInRange(from, to);
  const numWeeks = weeksInPeriod.length;

  // Formula settings (defaults match current hardcoded logic).
  let payrollFormula = {
    fantastic_threshold: 93,
    great_threshold: 85,
    fair_threshold: 85,
    fantastic_plus_bonus_eur: 17,
    fantastic_bonus_eur: 5,
  };
  try {
    const p = await settingsService.getByGroupKey('payroll');
    payrollFormula = {
      fantastic_threshold: Number(p?.payroll_fantastic_threshold?.value ?? 93),
      great_threshold: Number(p?.payroll_great_threshold?.value ?? 85),
      fair_threshold: Number(p?.payroll_fair_threshold?.value ?? 85),
      fantastic_plus_bonus_eur: Number(p?.payroll_fantastic_plus_bonus_eur?.value ?? 17),
      fantastic_bonus_eur: Number(p?.payroll_fantastic_bonus_eur?.value ?? 5),
    };
  } catch (_) {}

  const weekPlaceholders = weeksInPeriod.length > 0
    ? weeksInPeriod.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
    : '';
  const weekParams = weeksInPeriod.flatMap((w) => [w.year, w.week]);

  let kpiRows = { rows: [] };
  let workDaysRows = { rows: [] };
  let weeklyFactsRows = { rows: [] };
  if (weeksInPeriod.length > 0) {
    const [kpiRes, workDaysRes, weeklyFactsRes] = await Promise.all([
      query(
        `SELECT employee_id, year, week, kpi FROM kpi_data WHERE (year, week) IN (${weekPlaceholders})`,
        weekParams
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT employee_id, year, week, worked_days FROM work_days_data WHERE (year, week) IN (${weekPlaceholders})`,
        weekParams
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT employee_id, year, week, kpi, worked_days, quality_bonus_week FROM weekly_facts WHERE (year, week) IN (${weekPlaceholders})`,
        weekParams
      ).catch(() => ({ rows: [] })),
    ]);
    kpiRows = kpiRes;
    workDaysRows = workDaysRes;
    weeklyFactsRows = weeklyFactsRes;
  }

  const [
    users,
    attendancesMonth,
    attendancesPeriod,
    abzugRows,
    vorschussRows,
    bonusRows,
    verpflegungOverrideRows,
    rowOverrideRows,
    kenjoEmployeesRows,
    localEmployeesRows,
    contractHistoryRows,
    contractExtensionRows,
  ] = await Promise.all([
    getKenjoUsersList(),
    getKenjoAttendancesForPayrollRange(monthStart, monthEnd),
    getKenjoAttendancesForPayrollRange(from, to),
    query(
      `SELECT employee_id, line_no, amount, comment FROM payroll_abzug_items WHERE period_id = $1 ORDER BY employee_id, line_no`,
      [monthStr]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT kenjo_employee_id, SUM(amount) AS total FROM vorschuss WHERE month = $1 GROUP BY kenjo_employee_id`,
      [monthStr]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT employee_id, SUM(amount) AS total FROM payroll_bonus_items WHERE period_id = $1 GROUP BY employee_id`,
      [monthStr]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT employee_id FROM payroll_verpflegung_overrides WHERE period_id = $1 AND removed = TRUE`,
      [monthStr]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT employee_id, payload FROM payroll_row_overrides WHERE period_id = $1`,
      [monthStr]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT kenjo_user_id, transporter_id FROM kenjo_employees WHERE transporter_id IS NOT NULL AND transporter_id != ''`
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT
          employee_id,
          pn,
          transporter_id,
          kenjo_user_id,
          contract_end,
          vacation_days_override,
          vacation_days_override_year,
          vacation_balance_seed,
          vacation_balance_seed_year,
          vacation_balance_seed_date,
          contract_state.effective_contract_end
       FROM employees
       LEFT JOIN LATERAL (
         SELECT
           CASE
             WHEN BOOL_OR(contract_rows.is_open_contract) THEN NULL
             ELSE MAX(contract_rows.contract_end_date)
           END AS effective_contract_end
         FROM (
           SELECT
             COALESCE(c.termination_date, c.end_date) AS contract_end_date,
             (c.termination_date IS NULL AND c.end_date IS NULL) AS is_open_contract
           FROM employee_contracts c
           WHERE c.employee_ref = ANY(
             ARRAY_REMOVE(ARRAY[
               employees.employee_id,
               employees.pn,
               employees.transporter_id,
               employees.kenjo_user_id,
               employees.id::text
             ], NULL)
           )
              OR (
                employees.kenjo_user_id IS NOT NULL
                AND c.kenjo_employee_id = employees.kenjo_user_id
              )
           UNION ALL
           SELECT
             ext.end_date AS contract_end_date,
             ext.end_date IS NULL AS is_open_contract
           FROM employee_contract_extensions ext
           WHERE ext.employee_ref = ANY(
             ARRAY_REMOVE(ARRAY[
               employees.employee_id,
               employees.pn,
               employees.transporter_id,
               employees.kenjo_user_id,
               employees.id::text
             ], NULL)
           )
         ) contract_rows
       ) contract_state ON TRUE`
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT employee_ref, kenjo_employee_id, end_date, termination_date
       FROM employee_contracts`
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT employee_ref, end_date
       FROM employee_contract_extensions`
    ).catch(() => ({ rows: [] })),
  ]);

  const { workingDaysInRange: workingDaysInMonthMap } = countWorkingDaysFromAttendances(attendancesMonth, monthStart, monthEnd);
  const { daysPerWeek: daysPerWeekPeriod } = countWorkingDaysFromAttendances(attendancesPeriod, from, to);
  const monthlyHoursByEmployee = getMonthlyKenjoHoursByEmployee(
    (users || []).map((user) => String(user?._id || user?.id || '').trim()),
    attendancesMonth,
    users || [],
    monthStart,
    monthEnd
  );

  const kpiByKey = new Map();
  for (const r of (kpiRows?.rows || [])) {
    const empId = String(r.employee_id ?? '').trim().toLowerCase();
    const key = `${empId}-${r.year}-${r.week}`;
    kpiByKey.set(key, Number(r.kpi) || 0);
  }

  const daysByEmployeeWeek = new Map();
  for (const r of (workDaysRows?.rows || [])) {
    const empId = String(r.employee_id ?? '').trim().toLowerCase();
    const key = `${empId}-${r.year}-${r.week}`;
    daysByEmployeeWeek.set(key, Number(r.worked_days) || 0);
  }

  const weeklyFactsByKey = new Map();
  for (const r of (weeklyFactsRows?.rows || [])) {
    const empId = String(r.employee_id ?? '').trim().toLowerCase();
    const key = `${empId}-${r.year}-${r.week}`;
    weeklyFactsByKey.set(key, {
      kpi: Number(r.kpi) || 0,
      worked_days: Number(r.worked_days) || 0,
      quality_bonus_week: Number(r.quality_bonus_week) || 0,
    });
  }

  const abzugByEmployee = new Map();
  const abzugLinesByEmployee = new Map();
  for (const r of abzugRows?.rows || []) {
    const eid = String(r.employee_id ?? '').trim();
    if (!eid) continue;
    const lineNo = Number(r.line_no) ?? 0;
    const amount = Number(r.amount) || 0;
    const comment = (r.comment != null && r.comment !== undefined) ? String(r.comment).trim() : '';
    if (!abzugByEmployee.has(eid)) {
      abzugByEmployee.set(eid, 0);
      abzugLinesByEmployee.set(eid, [
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
      ]);
    }
    abzugByEmployee.set(eid, (abzugByEmployee.get(eid) || 0) + amount);
    const lines = abzugLinesByEmployee.get(eid);
    if (lineNo >= 0 && lineNo <= 2) lines[lineNo] = { amount, comment };
  }
  for (const [eid, total] of abzugByEmployee) {
    if (!abzugLinesByEmployee.has(eid)) {
      abzugLinesByEmployee.set(eid, [
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
      ]);
    }
  }
  const vorschussByEmployee = new Map((vorschussRows?.rows || []).map((r) => [String(r.kenjo_employee_id).trim(), Number(r.total) || 0]));
  const bonusByEmployeeCorrect = new Map((bonusRows?.rows || []).map((r) => [String(r.employee_id).trim(), Number(r.total) || 0]));
  const verpflegungRemovedByEmployee = new Set(
    (verpflegungOverrideRows?.rows || []).map((r) => String(r.employee_id ?? '').trim()).filter(Boolean)
  );

  // Kenjo user ID -> Amazon transporter ID (from local kenjo_employees; kpi_data uses transporter ID)
  const transporterIdByKenjoId = new Map();
  for (const r of kenjoEmployeesRows?.rows || []) {
    const kid = String(r.kenjo_user_id ?? '').trim();
    const tid = String(r.transporter_id ?? '').trim();
    if (kid && tid) transporterIdByKenjoId.set(kid.toLowerCase(), tid);
  }

  const periodDays = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 86400000) + 1;

  const KENJO_TYPE_KRANK = '685e7223e6bac64cb0a27e39';
  const KENJO_TYPE_URLAUB = '685e7223e6bac64cb0a27e38';
  const REJECTED_TIME_OFF_STATUSES = new Set(['rejected', 'declined', 'cancelled', 'canceled']);

  const timeOffRows = await query(
    `SELECT kenjo_user_id,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date,
            time_off_type,
            status
     FROM kenjo_time_off
     WHERE start_date <= $2::date AND end_date >= $1::date`,
    [yearStart, yearEnd]
  ).catch(() => ({ rows: [] }));

  const timeOffDaysByEmployee = new Map();
  const vacationRangesByEmployee = new Map();
  for (const r of timeOffRows?.rows || []) {
    const eid = String(r.kenjo_user_id ?? '').trim();
    if (!eid) continue;
    const typeId = String(r.time_off_type ?? '').trim();
    if (typeId !== KENJO_TYPE_KRANK && typeId !== KENJO_TYPE_URLAUB) continue;
    const status = String(r.status ?? '').trim().toLowerCase();
    if (REJECTED_TIME_OFF_STATUSES.has(status)) continue;
    const start = normalizeDateOnly(r.start_date);
    const end = normalizeDateOnly(r.end_date);
    if (!start || !end) continue;
    const effectiveMonthStart = start > monthStart ? start : monthStart;
    const effectiveMonthEnd = end < monthEnd ? end : monthEnd;
    const count =
      effectiveMonthStart <= effectiveMonthEnd
        ? countWeekdaysInclusive(effectiveMonthStart, effectiveMonthEnd)
        : 0;
    if (!timeOffDaysByEmployee.has(eid)) {
      timeOffDaysByEmployee.set(eid, {
        krank_days: 0,
        urlaub_days: 0,
        krank_entries: [],
        urlaub_entries: [],
      });
    }
    const rec = timeOffDaysByEmployee.get(eid);
    const entry =
      count > 0
        ? {
            from: effectiveMonthStart,
            to: effectiveMonthEnd,
            days: count,
          }
        : null;
    if (typeId === KENJO_TYPE_KRANK) {
      rec.krank_days += count;
      if (entry) rec.krank_entries.push(entry);
    } else if (typeId === KENJO_TYPE_URLAUB) {
      rec.urlaub_days += count;
      if (entry) rec.urlaub_entries.push(entry);
      if (!vacationRangesByEmployee.has(eid)) vacationRangesByEmployee.set(eid, []);
      vacationRangesByEmployee.get(eid).push({ start_date: start, end_date: end });
    }
  }

  const contractStateByLookup = new Map();
  for (const row of contractHistoryRows?.rows || []) {
    const contractEndDate = normalizeDateOnly(row.termination_date) || normalizeDateOnly(row.end_date) || '';
    const isOpenContract = !normalizeDateOnly(row.termination_date) && !normalizeDateOnly(row.end_date);
    updateContractStateLookup(contractStateByLookup, row.employee_ref, contractEndDate, isOpenContract);
    updateContractStateLookup(contractStateByLookup, row.kenjo_employee_id, contractEndDate, isOpenContract);
  }
  for (const row of contractExtensionRows?.rows || []) {
    const contractEndDate = normalizeDateOnly(row.end_date) || '';
    const isOpenContract = !contractEndDate;
    updateContractStateLookup(contractStateByLookup, row.employee_ref, contractEndDate, isOpenContract);
  }

  const localEmployeeByKenjoId = new Map();
  const localEmployeeByEmployeeId = new Map();
  const localEmployeeByPn = new Map();
  const localEmployeeByNormalizedPn = new Map();
  const localEmployeeByTransporterId = new Map();
  for (const row of localEmployeesRows?.rows || []) {
    const employeeId = String(row.employee_id ?? '').trim().toLowerCase();
    const kenjoId = String(row.kenjo_user_id ?? '').trim().toLowerCase();
    const pnValue = String(row.pn ?? '').trim().toLowerCase();
    const normalizedPnValue = pnValue.replace(/^0+/, '') || pnValue;
    const transporterId = String(row.transporter_id ?? '').trim().toLowerCase();
    const derivedContractState = resolveContractStateLookup(contractStateByLookup, [
      employeeId,
      pnValue,
      normalizedPnValue,
      transporterId,
      kenjoId,
    ]);
    const record = {
      contract_end: derivedContractState.matched
        ? derivedContractState.contract_end
        : (
            normalizeDateOnly(row.effective_contract_end) ||
            normalizeDateOnly(row.contract_end) ||
            null
          ),
      vacation_days_override: row.vacation_days_override,
      vacation_days_override_year: Number(row.vacation_days_override_year) || null,
      vacation_balance_seed: row.vacation_balance_seed,
      vacation_balance_seed_year: Number(row.vacation_balance_seed_year) || null,
      vacation_balance_seed_date: normalizeDateOnly(row.vacation_balance_seed_date),
    };
    if (employeeId) localEmployeeByEmployeeId.set(employeeId, record);
    if (kenjoId) localEmployeeByKenjoId.set(kenjoId, record);
    if (pnValue) localEmployeeByPn.set(pnValue, record);
    if (normalizedPnValue) localEmployeeByNormalizedPn.set(normalizedPnValue, record);
    if (transporterId) localEmployeeByTransporterId.set(transporterId, record);
  }

  const rows = [];
  const weeklyFactsToUpsert = [];
  const vacationBalanceByEmployee = new Map();
  const debugSample = [];
  const DEBUG_SAMPLE_SIZE = 8;
  let employeesWithTransporterId = 0;
  let employeesWithNonZeroBonus = 0;

  for (const u of users || []) {
    const uid = String(u._id || '').trim();
    const pn = u.employeeNumber ?? u.employee_number ?? '';
    const fromApi = (u.transportationId || u.transporterId || '').trim();
    const fromLocal = transporterIdByKenjoId.get(uid.toLowerCase());
    const transporterId = (fromLocal || fromApi).trim();
    const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '';
    const workingDays = workingDaysInMonthMap.get(uid) ?? 0;
    const monthlyHours = monthlyHoursByEmployee.get(uid) || {
      workedHours: 0,
      regularHours: 0,
      expectedHours: 0,
      overtimeHours: 0,
    };
    const abzug = abzugByEmployee.get(uid) ?? 0;
    const vorschuss = vorschussByEmployee.get(uid) ?? 0;
    const bonus = bonusByEmployeeCorrect.get(uid) ?? 0;
    const normalizedPn = String(pn ?? '').trim().toLowerCase().replace(/^0+/, '') || String(pn ?? '').trim().toLowerCase();
    const directContractState = resolveContractStateLookup(contractStateByLookup, [
      uid,
      pn,
      normalizedPn,
      transporterId,
    ]);
    const localEmployeeVacation =
      localEmployeeByKenjoId.get(uid.toLowerCase()) ||
      localEmployeeByPn.get(String(pn ?? '').trim().toLowerCase()) ||
      localEmployeeByNormalizedPn.get(normalizedPn) ||
      localEmployeeByTransporterId.get(transporterId.toLowerCase()) ||
      localEmployeeByEmployeeId.get(transporterId.toLowerCase()) ||
      null;
    const vacationRanges = vacationRangesByEmployee.get(uid) || [];
    const approvedVacationDaysYear = sumWorkingDaysForRanges(vacationRanges, yearStart, yearEnd);
    const approvedVacationDaysUntilMarch31 = sumWorkingDaysForRanges(vacationRanges, yearStart, marchDeadline);
    const currentRemainingVacationSeed =
      localEmployeeVacation?.vacation_balance_seed_year === y
        ? Number(localEmployeeVacation?.vacation_balance_seed)
        : null;
    const currentRemainingVacationSeedDate =
      localEmployeeVacation?.vacation_balance_seed_year === y
        ? normalizeDateOnly(localEmployeeVacation?.vacation_balance_seed_date)
        : '';
    const approvedVacationDaysAfterSeed =
      currentRemainingVacationSeed != null && currentRemainingVacationSeedDate
        ? sumWorkingDaysForRanges(vacationRanges, currentRemainingVacationSeedDate, yearEnd)
        : 0;
    const vacationBalance = buildVacationBalanceSnapshot({
      totalYearVacation:
        localEmployeeVacation?.vacation_days_override_year === y
          ? Number(localEmployeeVacation?.vacation_days_override)
          : 20,
      carryOverDays: getUserCarryOverDays(u),
      approvedVacationDaysYear,
      approvedVacationDaysUntilMarch31,
      currentRemainingVacationSeed,
      currentRemainingVacationSeedDate,
      approvedVacationDaysAfterSeed,
      year: y,
    });
    vacationBalanceByEmployee.set(uid, {
      carryover_days: vacationBalance.carryOver,
      rest_urlaub: vacationBalance.remainingVacationDays,
    });

    let totalBonus = 0;
    const weeklyBreakdown = [];
    const daysPerWeekUser = daysPerWeekPeriod.get(uid);
    const pnStr = String(pn ?? '').trim();
    const uidLower = uid.toLowerCase();
    const pnStrLower = pnStr.toLowerCase();
    const transLower = transporterId.toLowerCase();
    if (transporterId) employeesWithTransporterId++;

    let debugFirstWeek = null;
    for (const { year, week } of weeksInPeriod) {
      const weekKey = `${year}-${week}`;
      const savedFact =
        weeklyFactsByKey.get(`${uidLower}-${year}-${week}`) ??
        weeklyFactsByKey.get(`${pnStrLower}-${year}-${week}`) ??
        weeklyFactsByKey.get(`${transLower}-${year}-${week}`);
      // Use saved fact only if it has non-zero bonus; otherwise recalc from kpi_data (stale 0 would block correct bonus)
      if (savedFact && (savedFact.quality_bonus_week || 0) > 0) {
        totalBonus += savedFact.quality_bonus_week;
        const weekRange = getIsoWeekRange(year, week);
        weeklyBreakdown.push({
          year,
          week,
          period_from: weekRange.from,
          period_to: weekRange.to,
          working_days: Number(savedFact.worked_days) || 0,
          kpi: Number(savedFact.kpi) || 0,
          weekly_bonus: Math.round((Number(savedFact.quality_bonus_week) || 0) * 100) / 100,
        });
        if (!debugFirstWeek) {
          debugFirstWeek = { year, week, source: 'weekly_facts', kpi: savedFact.kpi, daysInWeek: savedFact.worked_days, rate: null, qualityBonusWeek: savedFact.quality_bonus_week };
        }
        continue;
      }
      const daysFromDb =
        daysByEmployeeWeek.get(`${uidLower}-${year}-${week}`) ??
        daysByEmployeeWeek.get(`${pnStrLower}-${year}-${week}`) ??
        daysByEmployeeWeek.get(`${transLower}-${year}-${week}`);
      const daysFromKenjo = daysPerWeekUser?.get(weekKey) ?? 0;
      let daysInWeek = daysFromDb ?? daysFromKenjo;
      const kpiKeyByKenjo = `${uidLower}-${year}-${week}`;
      const kpiKeyByPn = `${pnStrLower}-${year}-${week}`;
      const kpiKeyByTrans = `${transLower}-${year}-${week}`;
      const kpiByKenjo = kpiByKey.get(kpiKeyByKenjo) ?? 0;
      const kpiByPn = kpiByKey.get(kpiKeyByPn) ?? 0;
      const kpiByTrans = kpiByKey.get(kpiKeyByTrans) ?? 0;
      const kpiFromKpiData = kpiByKenjo || kpiByPn || kpiByTrans || 0;
      let rate = 0;
      if (kpiFromKpiData > payrollFormula.fantastic_threshold) rate = payrollFormula.fantastic_plus_bonus_eur;
      else if (kpiFromKpiData > payrollFormula.great_threshold) rate = payrollFormula.fantastic_bonus_eur;
      else if (kpiFromKpiData < payrollFormula.fair_threshold) rate = 0;
      else rate = 0;
      if (daysInWeek === 0 && rate > 0 && workingDays > 0 && numWeeks > 0) {
        daysInWeek = Math.max(1, Math.round((workingDays / numWeeks) * 100) / 100);
      }
      const qualityBonusWeek = Math.round(daysInWeek * rate * 100) / 100;
      totalBonus += qualityBonusWeek;
      const weekRange = getIsoWeekRange(year, week);
      weeklyBreakdown.push({
        year,
        week,
        period_from: weekRange.from,
        period_to: weekRange.to,
        working_days: daysInWeek,
        kpi: kpiFromKpiData,
        weekly_bonus: qualityBonusWeek,
      });
      if (!debugFirstWeek) {
        debugFirstWeek = { year, week, kpiByKenjo, kpiByPn, kpiByTrans, kpiUsed: kpiFromKpiData, daysInWeek, rate, qualityBonusWeek };
      }
      weeklyFactsToUpsert.push({
        employee_id: uid,
        year,
        week,
        kpi: kpiFromKpiData,
        worked_days: daysInWeek,
        quality_bonus_week: qualityBonusWeek,
      });
    }

    if (totalBonus > 0) employeesWithNonZeroBonus++;

    if (debugSample.length < DEBUG_SAMPLE_SIZE) {
      debugSample.push({
        name,
        pn,
        kenjo_id: uid.slice(0, 12) + '…',
        transporter_id: transporterId ? transporterId.slice(0, 12) + (transporterId.length > 12 ? '…' : '') : '(empty)',
        has_transporter_id: !!transporterId,
        total_bonus: Math.round(totalBonus * 100) / 100,
        first_week: debugFirstWeek,
      });
    }

    const afterAbzug = totalBonus - abzug;
    const maxVerpfl = workingDays * 14;
    const calculatedVerpflMehr = afterAbzug <= maxVerpfl ? afterAbzug : maxVerpfl;
    const verpflMehr = verpflegungRemovedByEmployee.has(uid) ? 0 : calculatedVerpflMehr;
    const fahrtGeld = afterAbzug > maxVerpfl ? afterAbzug - maxVerpfl : 0;

    const abzugLines = abzugLinesByEmployee.get(uid) || [
      { amount: 0, comment: '' },
      { amount: 0, comment: '' },
      { amount: 0, comment: '' },
    ];
    // Only include employees who have at least one working day in the calculation month
    const timeOff = timeOffDaysByEmployee.get(uid) || { krank_days: 0, urlaub_days: 0, krank_entries: [], urlaub_entries: [] };
    if (workingDays > 0) {
      rows.push({
        kenjo_employee_id: uid,
        name,
        pn,
        weeks: numWeeks,
        working_days: workingDays,
        total_worked_hours: monthlyHours.workedHours,
        worked_hours: monthlyHours.workedHours,
        worked_hours_capped: monthlyHours.regularHours,
        expected_hours: monthlyHours.regularHours,
        expected_working_hours: monthlyHours.expectedHours,
        contract_expected_hours: monthlyHours.expectedHours,
        overtime_hours: monthlyHours.overtimeHours,
        period_days: periodDays,
        total_bonus: Math.round(totalBonus * 100) / 100,
        abzug: Math.round(abzug * 100) / 100,
        abzug_lines: abzugLines.map((l) => ({ amount: Math.round((Number(l.amount) || 0) * 100) / 100, comment: l.comment || '' })),
        after_abzug: Math.round(afterAbzug * 100) / 100,
        verpfl_mehr: Math.round(verpflMehr * 100) / 100,
        verpfl_mehr_removed: verpflegungRemovedByEmployee.has(uid),
        fahrt_geld: Math.round(fahrtGeld * 100) / 100,
        bonus: Math.round(bonus * 100) / 100,
        weekly_breakdown: weeklyBreakdown,
        eintrittsdatum: u.startDate || null,
        austrittsdatum: directContractState.matched
          ? directContractState.contract_end
          : (localEmployeeVacation?.contract_end || u.contractEnd || null),
        vorschuss: Math.round(vorschuss * 100) / 100,
        carryover_days: vacationBalance.carryOver,
        rest_urlaub: vacationBalance.remainingVacationDays,
        krank_days: timeOff.krank_days,
        krank_entries: timeOff.krank_entries,
        urlaub_days: timeOff.urlaub_days,
        urlaub_entries: timeOff.urlaub_entries,
      });
    }
  }

  rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const manualRows = await query(
    `SELECT kenjo_employee_id, working_days, total_bonus, abzug, bonus, vorschuss FROM payroll_manual_entries WHERE period_id = $1`,
    [monthStr]
  ).catch(() => ({ rows: [] }));

  const manualByEmployee = new Map();
  for (const r of manualRows?.rows || []) {
    const eid = String(r.kenjo_employee_id ?? '').trim();
    if (!eid) continue;
    manualByEmployee.set(eid, {
      working_days: Number(r.working_days) || 0,
      total_bonus: Number(r.total_bonus) || 0,
      abzug: Number(r.abzug) || 0,
      bonus: Number(r.bonus) || 0,
      vorschuss: Number(r.vorschuss) || 0,
    });
  }

  const userIdToUser = new Map((users || []).map((u) => [String(u._id || u.id || '').trim(), u]));

  const rowsWithManual = [];
  const seenIds = new Set();
  for (const row of rows) {
    const eid = row.kenjo_employee_id;
    const manual = manualByEmployee.get(eid);
    if (manual) {
      manualByEmployee.delete(eid);
      const afterAbzug = Math.round((manual.total_bonus - manual.abzug) * 100) / 100;
      const maxVerpfl = manual.working_days * 14;
      const verpflMehr = verpflegungRemovedByEmployee.has(eid)
        ? 0
        : Math.round((afterAbzug <= maxVerpfl ? afterAbzug : maxVerpfl) * 100) / 100;
      const fahrtGeld = Math.round((afterAbzug > maxVerpfl ? afterAbzug - maxVerpfl : 0) * 100) / 100;
      const explicitAbzugLines = normalizeAbzugLines(row.abzug_lines);
      const effectiveAbzug = hasExplicitAbzugLines(explicitAbzugLines)
        ? getTotalAbzugFromLines(explicitAbzugLines)
        : Math.round((Number(manual.abzug) || 0) * 100) / 100;
      const effectiveAfterAbzug = Math.round((manual.total_bonus - effectiveAbzug) * 100) / 100;
      const effectiveVerpflMehr = verpflegungRemovedByEmployee.has(eid)
        ? 0
        : Math.round((effectiveAfterAbzug <= maxVerpfl ? effectiveAfterAbzug : maxVerpfl) * 100) / 100;
      const effectiveFahrtGeld = Math.round((effectiveAfterAbzug > maxVerpfl ? effectiveAfterAbzug - maxVerpfl : 0) * 100) / 100;
      rowsWithManual.push({
        ...row,
        working_days: manual.working_days,
        total_bonus: Math.round(manual.total_bonus * 100) / 100,
        abzug: effectiveAbzug,
        abzug_lines: hasExplicitAbzugLines(explicitAbzugLines)
          ? explicitAbzugLines
          : normalizeAbzugLines([
              { amount: Math.round((Number(manual.abzug) || 0) * 100) / 100, comment: '' },
              { amount: 0, comment: '' },
              { amount: 0, comment: '' },
            ]),
        after_abzug: effectiveAfterAbzug,
        verpfl_mehr: effectiveVerpflMehr,
        verpfl_mehr_removed: verpflegungRemovedByEmployee.has(eid),
        fahrt_geld: effectiveFahrtGeld,
        bonus: Math.round(manual.bonus * 100) / 100,
        vorschuss: Math.round(manual.vorschuss * 100) / 100,
        weekly_breakdown: row.weekly_breakdown ?? [],
        krank_days: row.krank_days ?? 0,
        krank_entries: row.krank_entries ?? [],
        urlaub_days: row.urlaub_days ?? 0,
        urlaub_entries: row.urlaub_entries ?? [],
      });
    } else {
      rowsWithManual.push(row);
    }
    seenIds.add(eid);
  }
  for (const [eid, manual] of manualByEmployee) {
    const u = userIdToUser.get(eid);
    const name = u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || eid;
    const pn = u?.employeeNumber ?? u?.employee_number ?? '';
    const normalizedPn = String(pn ?? '').trim().toLowerCase().replace(/^0+/, '') || String(pn ?? '').trim().toLowerCase();
    const transporterId = String(
      (
        transporterIdByKenjoId.get(String(eid || '').trim().toLowerCase()) ||
        u?.transportationId ||
        u?.transporterId ||
        ''
      )
    )
      .trim()
      .toLowerCase();
    const directContractState = resolveContractStateLookup(contractStateByLookup, [
      eid,
      pn,
      normalizedPn,
      transporterId,
    ]);
    const localEmployeeVacation =
      localEmployeeByKenjoId.get(String(eid || '').trim().toLowerCase()) ||
      localEmployeeByPn.get(String(pn ?? '').trim().toLowerCase()) ||
      localEmployeeByNormalizedPn.get(normalizedPn) ||
      localEmployeeByTransporterId.get(transporterId) ||
      localEmployeeByEmployeeId.get(transporterId) ||
      null;
    const monthlyHours = monthlyHoursByEmployee.get(eid) || {
      workedHours: 0,
      regularHours: 0,
      expectedHours: 0,
      overtimeHours: 0,
    };
    const vacationBalance = vacationBalanceByEmployee.get(eid) || { carryover_days: 0, rest_urlaub: 0 };
    const abzugLines = normalizeAbzugLines(abzugLinesByEmployee.get(eid));
    const effectiveAbzug = hasExplicitAbzugLines(abzugLines)
      ? getTotalAbzugFromLines(abzugLines)
      : Math.round((Number(manual.abzug) || 0) * 100) / 100;
    const afterAbzug = Math.round((manual.total_bonus - effectiveAbzug) * 100) / 100;
    const maxVerpfl = manual.working_days * 14;
    const verpflMehr = verpflegungRemovedByEmployee.has(eid)
      ? 0
      : Math.round((afterAbzug <= maxVerpfl ? afterAbzug : maxVerpfl) * 100) / 100;
    const fahrtGeld = Math.round((afterAbzug > maxVerpfl ? afterAbzug - maxVerpfl : 0) * 100) / 100;
    const timeOff = timeOffDaysByEmployee.get(eid) || { krank_days: 0, urlaub_days: 0, krank_entries: [], urlaub_entries: [] };
    rowsWithManual.push({
      kenjo_employee_id: eid,
      name,
      pn,
      working_days: manual.working_days,
      total_worked_hours: monthlyHours.workedHours,
      worked_hours: monthlyHours.workedHours,
      worked_hours_capped: monthlyHours.regularHours,
      expected_hours: monthlyHours.regularHours,
      expected_working_hours: monthlyHours.expectedHours,
      contract_expected_hours: monthlyHours.expectedHours,
      overtime_hours: monthlyHours.overtimeHours,
      period_days: periodDays,
      total_bonus: Math.round(manual.total_bonus * 100) / 100,
      abzug: effectiveAbzug,
      abzug_lines: hasExplicitAbzugLines(abzugLines)
        ? abzugLines
        : normalizeAbzugLines([
            { amount: Math.round((Number(manual.abzug) || 0) * 100) / 100, comment: '' },
            { amount: 0, comment: '' },
            { amount: 0, comment: '' },
          ]),
      after_abzug: afterAbzug,
      verpfl_mehr: verpflMehr,
      verpfl_mehr_removed: verpflegungRemovedByEmployee.has(eid),
      fahrt_geld: fahrtGeld,
      bonus: Math.round(manual.bonus * 100) / 100,
      weekly_breakdown: [],
      eintrittsdatum: u?.startDate || null,
      austrittsdatum: directContractState.matched
        ? directContractState.contract_end
        : (localEmployeeVacation?.contract_end || u?.contractEnd || null),
      vorschuss: Math.round(manual.vorschuss * 100) / 100,
      carryover_days: vacationBalance.carryover_days,
      rest_urlaub: vacationBalance.rest_urlaub,
      krank_days: timeOff.krank_days,
      krank_entries: timeOff.krank_entries,
      urlaub_days: timeOff.urlaub_days,
      urlaub_entries: timeOff.urlaub_entries,
    });
  }
  const rowOverrideByEmployee = new Map();
  for (const overrideRow of rowOverrideRows?.rows || []) {
    const employeeId = String(overrideRow?.employee_id ?? '').trim();
    if (!employeeId) continue;
    try {
      const payload = sanitizePayrollRowOverridePayload(overrideRow?.payload);
      if (Object.keys(payload).length) {
        rowOverrideByEmployee.set(employeeId, payload);
      }
    } catch (error) {
      console.error('Ignoring invalid payroll row override', { employeeId, error: String(error?.message || error) });
    }
  }

  const rowsWithFinalOverrides = rowsWithManual.map((row) => {
    const employeeId = String(row?.kenjo_employee_id || '').trim();
    const payload = employeeId ? rowOverrideByEmployee.get(employeeId) : null;
    return payload ? applyPayrollRowOverride(row, payload) : row;
  });

  rowsWithFinalOverrides.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  for (const row of weeklyFactsToUpsert) {
    await query(
      `INSERT INTO weekly_facts (employee_id, year, week, kpi, worked_days, quality_bonus_week, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (employee_id, year, week) DO UPDATE SET
         kpi = EXCLUDED.kpi,
         worked_days = EXCLUDED.worked_days,
         quality_bonus_week = EXCLUDED.quality_bonus_week,
         updated_at = NOW()`,
      [row.employee_id, row.year, row.week, row.kpi, row.worked_days, row.quality_bonus_week]
    );
  }

  const debug = {
    summary: {
      total_employees: (users || []).length,
      employees_with_transporter_id: employeesWithTransporterId,
      employees_with_non_zero_bonus: employeesWithNonZeroBonus,
      kpi_data_rows: (kpiRows?.rows || []).length,
      work_days_data_rows: (workDaysRows?.rows || []).length,
      kenjo_employees_rows: (kenjoEmployeesRows?.rows || []).length,
      weeks_in_period: numWeeks,
      period_from: from,
      period_to: to,
    },
    sample_kpi_keys: Array.from(kpiByKey.keys()).slice(0, 5),
    sample: debugSample,
  };

  return { month: monthStr, from, to, period_days: periodDays, rows: rowsWithFinalOverrides, debug };
}

/**
 * Save Abzug for one employee in a period (month). Three lines: line_no 0, 1, 2 with amount and comment each.
 */
export async function saveAbzug(periodId, employeeId, lines) {
  const period = String(periodId || '').trim().slice(0, 7);
  const empId = String(employeeId || '').trim();
  if (!period || !/^\d{4}-\d{2}$/.test(period) || !empId) throw new Error('period_id (YYYY-MM) and employee_id are required');
  const three = normalizeAbzugLines(lines).map((line) => ({
    amount: Number(line.amount) || 0,
    comment: String(line.comment ?? '').trim().slice(0, 500),
  }));
  for (let lineNo = 0; lineNo < 3; lineNo++) {
    const { amount, comment } = three[lineNo];
    if (Number.isNaN(amount) || amount < 0) throw new Error('amount must be a non-negative number');
    await query(
      `INSERT INTO payroll_abzug_items (period_id, employee_id, line_no, amount, comment, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (period_id, employee_id, line_no) DO UPDATE SET amount = EXCLUDED.amount, comment = EXCLUDED.comment, updated_at = NOW()`,
      [period, empId, lineNo, amount, comment || '']
    );
  }
  await query(
    `UPDATE payroll_manual_entries
     SET abzug = $3,
         updated_at = NOW()
     WHERE period_id = $1
       AND kenjo_employee_id = $2`,
    [period, empId, getTotalAbzugFromLines(three)]
  ).catch(() => null);
  return { ok: true };
}

/**
 * Save bonus for one employee in a period (month). Upserts line_no 0 in payroll_bonus_items.
 */
export async function saveBonus(periodId, employeeId, amount, comment) {
  const period = String(periodId || '').trim().slice(0, 7);
  const empId = String(employeeId || '').trim();
  if (!period || !/^\d{4}-\d{2}$/.test(period) || !empId) throw new Error('period_id (YYYY-MM) and employee_id are required');
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt < 0) throw new Error('amount must be a non-negative number');
  const cmt = String(comment ?? '').trim().slice(0, 500);
  await query(
    `INSERT INTO payroll_bonus_items (period_id, employee_id, line_no, amount, comment, updated_at)
     VALUES ($1, $2, 0, $3, $4, NOW())
     ON CONFLICT (period_id, employee_id, line_no) DO UPDATE SET amount = EXCLUDED.amount, comment = EXCLUDED.comment, updated_at = NOW()`,
    [period, empId, amt, cmt]
  );
  return { ok: true };
}

/** Remove or restore the calculated Verpflegung amount for one employee and payroll month. */
export async function saveVerpflegungOverride(periodId, employeeId, removed) {
  const period = String(periodId || '').trim().slice(0, 7);
  const empId = String(employeeId || '').trim();
  if (!period || !/^\d{4}-\d{2}$/.test(period) || !empId) throw new Error('period_id (YYYY-MM) and employee_id are required');
  if (!removed) {
    await query(
      `DELETE FROM payroll_verpflegung_overrides WHERE period_id = $1 AND employee_id = $2`,
      [period, empId]
    );
    return { ok: true };
  }
  await query(
    `INSERT INTO payroll_verpflegung_overrides (period_id, employee_id, removed, updated_at)
     VALUES ($1, $2, TRUE, NOW())
     ON CONFLICT (period_id, employee_id) DO UPDATE SET removed = TRUE, updated_at = NOW()`,
    [period, empId]
  );
  return { ok: true };
}

/**
 * Save a manual payroll entry for one employee in a period (month).
 */
export async function saveManualEntry(periodId, employeeId, payload) {
  const period = String(periodId || '').trim().slice(0, 7);
  const empId = String(employeeId || '').trim();
  if (!period || !/^\d{4}-\d{2}$/.test(period) || !empId) throw new Error('period_id (YYYY-MM) and employee_id are required');
  const working_days = Number(payload.working_days) || 0;
  const total_bonus = Number(payload.total_bonus) || 0;
  const abzug = Number(payload.abzug) || 0;
  const bonus = Number(payload.bonus) || 0;
  const vorschuss = Number(payload.vorschuss) || 0;
  await query(
    `INSERT INTO payroll_manual_entries (period_id, kenjo_employee_id, working_days, total_bonus, abzug, bonus, vorschuss, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (period_id, kenjo_employee_id) DO UPDATE SET
       working_days = EXCLUDED.working_days,
       total_bonus = EXCLUDED.total_bonus,
       abzug = EXCLUDED.abzug,
       bonus = EXCLUDED.bonus,
       vorschuss = EXCLUDED.vorschuss,
       updated_at = NOW()`,
    [period, empId, working_days, total_bonus, abzug, bonus, vorschuss]
  );
  return { ok: true };
}

export async function saveRowOverride(periodId, employeeId, payload) {
  const period = String(periodId || '').trim().slice(0, 7);
  const empId = String(employeeId || '').trim();
  if (!period || !/^\d{4}-\d{2}$/.test(period) || !empId) {
    throw new Error('period_id (YYYY-MM) and employee_id are required');
  }

  const sanitized = sanitizePayrollRowOverridePayload(payload);
  if (!Object.keys(sanitized).length) {
    await query(
      `DELETE FROM payroll_row_overrides WHERE period_id = $1 AND employee_id = $2`,
      [period, empId]
    );
    return { ok: true, payload: {} };
  }

  await query(
    `INSERT INTO payroll_row_overrides (period_id, employee_id, payload, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (period_id, employee_id) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [period, empId, JSON.stringify(sanitized)]
  );

  return { ok: true, payload: sanitized };
}

export async function listPayrollHistory() {
  const result = await query(
    `SELECT period_id, period_from, period_to, saved_at, updated_at,
            COALESCE(jsonb_array_length(payload->'rows'), 0) AS employee_count
       FROM payroll_history_snapshots
      ORDER BY period_id DESC`
  ).catch(() => ({ rows: [] }));

  return (result.rows || []).map((row) => ({
    period_id: row.period_id,
    period_from: row.period_from ? String(row.period_from).slice(0, 10) : null,
    period_to: row.period_to ? String(row.period_to).slice(0, 10) : null,
    saved_at: row.saved_at || null,
    updated_at: row.updated_at || null,
    employee_count: Number(row.employee_count) || 0,
  }));
}

export async function getPayrollHistorySnapshot(periodId) {
  const period = String(periodId || '').trim().slice(0, 7);
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new Error('period_id (YYYY-MM) is required');

  const result = await query(
    `SELECT period_id, period_from, period_to, payload, saved_at, updated_at
       FROM payroll_history_snapshots
      WHERE period_id = $1
      LIMIT 1`,
    [period]
  ).catch(() => ({ rows: [] }));

  const row = result.rows?.[0];
  if (!row) {
    return {
      period_id: period,
      period_from: null,
      period_to: null,
      payload: null,
      saved_at: null,
      updated_at: null,
    };
  }

  return {
    period_id: row.period_id,
    period_from: row.period_from ? String(row.period_from).slice(0, 10) : null,
    period_to: row.period_to ? String(row.period_to).slice(0, 10) : null,
    payload: row.payload || null,
    saved_at: row.saved_at || null,
    updated_at: row.updated_at || null,
  };
}

export async function savePayrollHistorySnapshot(periodId, payload, periodFrom, periodTo) {
  const period = String(periodId || '').trim().slice(0, 7);
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new Error('period_id (YYYY-MM) is required');

  const from = periodFrom ? String(periodFrom).slice(0, 10) : null;
  const to = periodTo ? String(periodTo).slice(0, 10) : null;
  const snapshotPayload = payload && typeof payload === 'object' ? payload : null;

  await query(
    `INSERT INTO payroll_history_snapshots (period_id, period_from, period_to, payload, saved_at, updated_at)
     VALUES ($1, $2::date, $3::date, $4::jsonb, NOW(), NOW())
     ON CONFLICT (period_id) DO UPDATE SET
       period_from = EXCLUDED.period_from,
       period_to = EXCLUDED.period_to,
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [period, from, to, JSON.stringify(snapshotPayload)]
  );

  return { ok: true };
}

/**
 * Get KPI data by weeks for an employee. Matches by kenjo_employee_id, transporter_id (from kenjo_employees), or employee_number (PN).
 */
export async function getKpiByEmployee(kenjoEmployeeId, employeeNumber) {
  const kid = String(kenjoEmployeeId || '').trim();
  const pn = String(employeeNumber ?? '').trim();
  if (!kid && !pn) return [];

  const kenjoRow = await query(
    `SELECT transporter_id FROM kenjo_employees WHERE kenjo_user_id = $1`,
    [kid]
  ).catch(() => ({ rows: [] }));
  const transporterId = (kenjoRow?.rows?.[0]?.transporter_id ?? '').trim();

  const ids = [kid, transporterId, pn].filter(Boolean).map((id) => id.toLowerCase());
  if (ids.length === 0) return [];

  const placeholders = ids.map((_, i) => `LOWER(d.employee_id) = $${i + 1}`).join(' OR ');
  const result = await query(
    `SELECT d.employee_id, d.year, d.week, d.kpi, c.comment
     FROM kpi_data d
     LEFT JOIN kpi_comments c
       ON c.employee_id = d.employee_id AND c.year = d.year AND c.week = d.week
     WHERE ${placeholders}
     ORDER BY d.year DESC, d.week DESC`,
    ids
  ).catch(() => ({ rows: [] }));
  return result?.rows ?? [];
}

export async function saveKpiComment(employeeId, year, week, comment) {
  const empId = String(employeeId || '').trim();
  const y = Number(year);
  const w = Number(week);
  if (!empId || !Number.isFinite(y) || !Number.isFinite(w)) {
    throw new Error('employee_id, year, week are required');
  }
  const text = (comment ?? '').toString().trim();
  await query(
    `INSERT INTO kpi_comments (employee_id, year, week, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id, year, week) DO UPDATE SET
       comment = EXCLUDED.comment,
       updated_at = NOW()`,
    [empId, y, w, text]
  );
  return { ok: true };
}

const PAYSLIP_BATCH_TTL_MS = 30 * 60 * 1000;
const payslipImportBatches = new Map();

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function detectNameFromPdfText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);
  for (const line of lines) {
    if (line.length < 4 || line.length > 80) continue;
    if (/\d/.test(line)) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (/lohn|abrechnung|monat|jahr|employee|gehalt|salary/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    return line;
  }
  return '';
}

function extractRecipientBlock(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80);
  if (!lines.length) return { block: '', detectedName: '' };

  const titleIdx = lines.findIndex((l) => /^(frau|herr)\b/i.test(l));
  if (titleIdx >= 0) {
    const start = Math.max(0, titleIdx - 2);
    const end = Math.min(lines.length, titleIdx + 5);
    const block = lines.slice(start, end).join('\n');
    const nextLine = lines[titleIdx + 1] || '';
    return { block, detectedName: nextLine.trim() };
  }

  // Fallback: first address-like chunk from top section.
  const block = lines.slice(0, 7).join('\n');
  return { block, detectedName: detectNameFromPdfText(lines.join('\n')) };
}

/**
 * Split a PDF into one buffer per page so batch payslip files yield one import row (and one saved doc) per employee page.
 */
async function splitPdfToPageBuffers(buffer) {
  try {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const n = src.getPageCount();
    if (!Number.isFinite(n) || n <= 0) return [buffer];
    if (n === 1) return [buffer];
    const out = [];
    for (let i = 0; i < n; i++) {
      const doc = await PDFDocument.create();
      const [copied] = await doc.copyPages(src, [i]);
      doc.addPage(copied);
      const bytes = await doc.save();
      out.push(Buffer.from(bytes));
    }
    return out;
  } catch {
    return [buffer];
  }
}

async function parsePayslipPageBuffer(pageBuffer) {
  let detectedName = '';
  let previewText = '';
  try {
    const parser = new PDFParse({ data: pageBuffer });
    const parsed = await parser.getText();
    const extracted = extractRecipientBlock(parsed?.text || '');
    detectedName = extracted.detectedName || '';
    previewText = extracted.block || '';
  } catch {
    detectedName = '';
    previewText = '';
  }
  return { detectedName, previewText };
}

async function getEmployeeNamePool() {
  const res = await query(
    `SELECT kenjo_user_id, first_name, last_name, display_name
     FROM kenjo_employees
     WHERE kenjo_user_id IS NOT NULL AND kenjo_user_id != ''`
  ).catch(() => ({ rows: [] }));
  return (res.rows || []).map((r) => {
    const full = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || String(r.display_name || '').trim();
    return {
      id: String(r.kenjo_user_id || '').trim(),
      name: full || String(r.kenjo_user_id || '').trim(),
      normalized: normalizeName(full || r.display_name || r.kenjo_user_id),
    };
  }).filter((e) => e.id && e.name);
}

function findEmployeeMatches(detectedName, pool) {
  const n = normalizeName(detectedName);
  if (!n) return [];
  const parts = n.split(' ').filter(Boolean);
  return pool.filter((e) => {
    if (e.normalized === n) return true;
    if (parts.length >= 2) {
      const allPartsFound = parts.every((p) => e.normalized.includes(p));
      if (allPartsFound) return true;
    }
    return false;
  });
}

export async function previewPayslipImport(files) {
  const employeePool = await getEmployeeNamePool();
  const allOptions = employeePool.map((m) => ({ id: m.id, name: m.name }));
  const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const docs = [];
  const items = [];
  let docSeq = 0;
  for (let i = 0; i < (files || []).length; i++) {
    const f = files[i];
    const baseFileName = f.originalname || `payslip-${i + 1}.pdf`;
    const pageBuffers = await splitPdfToPageBuffers(f.buffer);
    for (let p = 0; p < pageBuffers.length; p++) {
      const fileId = `${batchId}_${docSeq}`;
      docSeq += 1;
      const pageLabel =
        pageBuffers.length > 1 ? `${baseFileName} (page ${p + 1}/${pageBuffers.length})` : baseFileName;
      const pageBuffer = pageBuffers[p];
      const { detectedName, previewText } = await parsePayslipPageBuffer(pageBuffer);
      const matches = findEmployeeMatches(detectedName, employeePool);
      const exactOne = matches.length === 1 ? matches[0] : null;
      docs.push({
        fileId,
        fileName: pageLabel,
        mimeType: f.mimetype || 'application/pdf',
        fileContent: pageBuffer,
        matchedEmployeeRef: exactOne?.id || null,
      });
      items.push({
        fileId,
        fileName: pageLabel,
        pageIndex: pageBuffers.length > 1 ? p + 1 : null,
        pageCount: pageBuffers.length > 1 ? pageBuffers.length : null,
        detectedName: detectedName || null,
        previewText: previewText || null,
        matchedEmployeeRef: exactOne?.id || null,
        matchedEmployeeName: exactOne?.name || null,
        conflict: !exactOne,
        options: [
          ...matches.map((m) => ({ id: m.id, name: m.name })),
          ...allOptions.filter((m) => !matches.some((x) => x.id === m.id)),
        ],
      });
    }
  }
  payslipImportBatches.set(batchId, {
    createdAt: Date.now(),
    docs,
  });
  for (const [id, b] of payslipImportBatches.entries()) {
    if (Date.now() - (b.createdAt || 0) > PAYSLIP_BATCH_TTL_MS) payslipImportBatches.delete(id);
  }
  return { batchId, items };
}

export async function importPayslipBatch(batchId, resolutions) {
  const batch = payslipImportBatches.get(String(batchId || '').trim());
  if (!batch) throw new Error('Import batch expired. Please upload files again.');
  const byFileId = new Map((batch.docs || []).map((d) => [d.fileId, d]));
  let imported = 0;
  const conflicts = [];
  for (const r of (resolutions || [])) {
    const fileId = String(r?.fileId || '').trim();
    const action = String(r?.action || 'import').trim();
    const employeeRef = String(r?.employeeRef || '').trim();
    const doc = byFileId.get(fileId);
    if (!doc) continue;
    if (action === 'delete') continue;
    if (!employeeRef) {
      conflicts.push({ fileId, fileName: doc.fileName, error: 'Employee not selected' });
      continue;
    }
    await employeeService.addEmployeeDocument(employeeRef, {
      documentType: 'Lohnabrechnung',
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileContent: doc.fileContent,
    });
    imported++;
  }
  payslipImportBatches.delete(String(batchId || '').trim());
  return { ok: true, imported, conflicts };
}
