import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { getKenjoEmployeeProfile, updateEmployeeProfileInKenjo, updateEmployeeInternalProfile, deactivateEmployeeInKenjo } from '../services/kenjoApi';
import {
  getEmployee,
  getEmployeeVacationSummary,
  getEmployeeTimeOffHistory,
  getEmployeeContracts,
  getEmployeeRescues,
  getEmployeeDocuments,
  addEmployeeContract,
  updateEmployeeContract,
  uploadEmployeeContractDocument,
  deleteEmployeeContractRecord,
  terminateEmployeeContract,
  addEmployeeRescue,
  updateEmployeeLocalSettings,
  uploadEmployeeDocument,
  viewEmployeeDocument,
  downloadEmployeeDocument,
  deleteEmployeeRescue,
  deleteEmployeeDocument,
} from '../services/employeesApi';
import { saveAdvances } from '../services/advancesApi';
import {
  calculatePayroll,
  getEmployeeKpi,
  getPayrollHistorySnapshot,
  saveEmployeeKpiComment,
} from '../services/payrollApi';
import { getPaveSessions } from '../services/paveApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { getSettingsByGroup } from '../services/settingsApi';
import {
  DEFAULT_EMPLOYEE_DOCUMENT_TYPE_SETTINGS,
  normalizeEmployeeDocumentTypeSettings,
  buildEmployeeDocumentExactNameOptions,
  buildEmployeeDocumentTypeTemplateContext,
} from '../utils/employeeDocumentTypeSettings';

/** KPI rating: <50 POOR, <70 FAIR, <85 GREAT, <93 FANTASTIC, >=93 FANTASTIC PLUS */
function getKpiRatingLabel(kpi) {
  const n = Number(kpi);
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  if (n < 50) return 'POOR';
  if (n < 70) return 'FAIR';
  if (n < 84.99) return 'GREAT';
  if (n < 92.99) return 'FANTASTIC';
  return 'FANTASTIC PLUS';
}

const TERMINATION_REASONS = [
  { group: '1. Safety Violations', options: ['Reckless or unsafe driving', 'Speeding or ignoring traffic laws', 'Using a mobile phone while driving', 'Failure to follow safety procedures', 'Creating dangerous situations during deliveries'] },
  { group: '2. Attendance and Punctuality Issues', options: ['No call / no show', 'Repeated lateness', 'Leaving work early without authorization', 'Excessive absences'] },
  { group: '3. Poor Performance', options: ['Failure to complete assigned delivery routes', 'Low delivery completion rate', 'Frequent undelivered or returned packages', 'Failure to meet required performance metrics (KPIs)'] },
  { group: '4. Customer Complaints', options: ['Delivering packages to incorrect addresses', 'Mishandling or damaging packages', 'Unprofessional or inappropriate behavior', 'Repeated customer complaints'] },
  { group: '5. Violation of Company Policies', options: ['Smoking in company vehicles', 'Transporting unauthorized passengers', 'Personal use of company vehicles', 'Failure to follow delivery procedures'] },
  { group: '6. Theft or Fraud', options: ['Theft of packages or company property', 'Falsifying work or delivery data', 'Time theft or misuse of work hours'] },
  { group: '7. Workplace Misconduct', options: ['Fighting or aggressive behavior', 'Harassment or discrimination', 'Threatening coworkers or customers', 'Alcohol or drug use while on duty'] },
  { group: '8. Failure to Meet Job Requirements', options: ['Invalid or suspended driver\'s license', 'Failure to complete required training', 'Failure to comply with Amazon DSP or Amazon Logistics requirements'] },
];

function buildEmployeeContractTemplateOptions({ firstName, lastName, startDate, selectedDate }) {
  const safeFirstName = normalizeDocumentNamePart(firstName);
  const safeLastName = normalizeDocumentNamePart(lastName);
  const suffix = [safeFirstName, safeLastName].filter(Boolean).join('_') || 'Name_Surname';
  const startDatePart = formatDocumentDatePart(startDate) || 'Start_date';
  const selectedDatePart = formatDocumentDatePart(selectedDate) || 'Select_date';

  return [
    {
      key: 'fixed_contract',
      value: `Arbeitsvertrag_${suffix}_35_St._Befristet_AlfaMile_GmbH_Stand_${startDatePart}`,
      label: `Arbeitsvertrag_${suffix}_35_St._Befristet_AlfaMile_GmbH_Stand_${startDatePart}`,
      requiresSelectedDate: false,
    },
    {
      key: 'extension_agreement',
      value: `Verlängerungsverinbarung_zum_befristeten_Arbeitsvertrag_${suffix}_unterschrieben`,
      label: `Verlängerungsverinbarung_zum_befristeten_Arbeitsvertrag_${suffix}_unterschrieben`,
      requiresSelectedDate: false,
    },
    {
      key: 'change_agreement',
      value: `Änderungsverinbarung_zum_Arbeitsvertrag_${selectedDatePart}_unbefristet_${suffix}`,
      label: `Änderungsverinbarung_zum_Arbeitsvertrag_${selectedDatePart}_unbefristet_${suffix}`,
      requiresSelectedDate: true,
    },
    {
      key: 'unlimited_contract',
      value: `Arbeitsvertrag_unbefristet_Vollzeit_AlfaMile_UG_${suffix}`,
      label: `Arbeitsvertrag_unbefristet_Vollzeit_AlfaMile_UG_${suffix}`,
      requiresSelectedDate: false,
    },
  ];
}

const EMPLOYEE_HOURLY_RATE_EUR = 16.7;
const EMPLOYEE_DAILY_PAYOUT_HOURS = 7;
const PAYROLL_FROZEN_CACHE_KEY = 'dsp.payroll.frozen.lastResult.v1';

function formatHours(value) {
  const num = Number(value) || 0;
  return `${num.toFixed(2)} h`;
}

function formatCurrency(value) {
  const num = Number(value) || 0;
  return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function areDisplayedHourValuesEqual(left, right) {
  const leftNum = Number(left) || 0;
  const rightNum = Number(right) || 0;
  return Math.abs(leftNum - rightNum) < 0.005;
}

function getLastMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);
  const month = fromDate.slice(0, 7);
  return { month, fromDate, toDate };
}

function getMonthRange(monthValue) {
  const normalized = String(monthValue || '').slice(0, 7);
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) return getLastMonthRange();
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  return {
    month: normalized,
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}

function getEmployeeExpectedHoursForMonth(employee, monthValue) {
  const weeklyHours = Number(
    employee?.work?.weeklyHours ??
    employee?.weeklyHours ??
    0
  );
  let weeklyDays = Number(
    employee?.work?.weeklyDays ??
    employee?.weeklyDays ??
    0
  );

  if (!(weeklyHours > 0)) return 0;
  if (!(weeklyDays > 0)) weeklyDays = 5;
  weeklyDays = Math.max(1, Math.min(Math.round(weeklyDays), 5));

  const dailyHours = weeklyHours / weeklyDays;
  if (!(dailyHours > 0)) return 0;

  const { fromDate, toDate } = getMonthRange(monthValue);
  const activeWeekdays = new Set();
  for (let weekday = 1; weekday <= weeklyDays; weekday += 1) {
    activeWeekdays.add(weekday);
  }

  let total = 0;
  for (let cursor = new Date(`${fromDate}T12:00:00`); cursor <= new Date(`${toDate}T12:00:00`); cursor.setDate(cursor.getDate() + 1)) {
    const weekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
    if (activeWeekdays.has(weekday)) total += dailyHours;
  }

  return Math.round(total * 100) / 100;
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePersonalNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits ? String(Number(digits)) : raw.toLowerCase();
}

function normalizePersonalNumberRaw(value) {
  return String(value || '').trim().toLowerCase();
}

function personalNumberMatches(left, right) {
  const leftRaw = normalizePersonalNumberRaw(left);
  const rightRaw = normalizePersonalNumberRaw(right);
  if (leftRaw && rightRaw && leftRaw === rightRaw) return true;
  const leftDigits = normalizePersonalNumber(left);
  const rightDigits = normalizePersonalNumber(right);
  return !!leftDigits && !!rightDigits && leftDigits === rightDigits;
}

function normalizeNameForMatch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function createEmptyRescueDateDraft() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildRescueIsoDate(draft) {
  return normalizeContractDate(draft) || '';
}

function getFrozenPayrollCache() {
  try {
    const raw = window.localStorage.getItem(PAYROLL_FROZEN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function getRowManualEntry(row) {
  return row?.manual_entry && typeof row.manual_entry === 'object'
    ? row.manual_entry
    : null;
}

function getRowNumericValue(row, fields = []) {
  const manualEntry = getRowManualEntry(row);
  let sawNumericZero = false;
  for (const field of fields) {
    const candidates = [manualEntry?.[field], row?.[field]];
    for (const candidate of candidates) {
      if (candidate == null || candidate === '') continue;
      const parsed = Number(candidate);
      if (!Number.isFinite(parsed)) continue;
      if (parsed === 0) {
        sawNumericZero = true;
        continue;
      }
      return parsed;
    }
  }
  return sawNumericZero ? 0 : 0;
}

function rowHasOwnField(row, fields = []) {
  const manualEntry = getRowManualEntry(row);
  return fields.some((field) =>
    Object.prototype.hasOwnProperty.call(row || {}, field) ||
    (manualEntry ? Object.prototype.hasOwnProperty.call(manualEntry, field) : false)
  );
}

function getRowContractExpectedHoursValue(row) {
  return getRowNumericValue(row, ['expected_working_hours', 'contract_expected_hours']);
}

function getRowExplicitRegularHoursValue(row) {
  return getRowNumericValue(row, ['worked_hours_capped', 'expected_hours', 'payroll_hours']);
}

function getRowExplicitOvertimeHoursValue(row) {
  return getRowNumericValue(row, ['overtime_hours', 'overtime']);
}

function getRowRawWorkedHoursValue(row) {
  return getRowNumericValue(row, ['total_worked_hours', 'worked_hours']);
}

function getRowHoursValue(row) {
  const rawWorkedHours = getRowRawWorkedHoursValue(row);
  if (rawWorkedHours > 0) {
    return rawWorkedHours;
  }

  const explicitRegularHours = getRowExplicitRegularHoursValue(row);
  const explicitOvertimeHours = getRowExplicitOvertimeHoursValue(row);
  if (explicitRegularHours > 0 || explicitOvertimeHours > 0) {
    return explicitRegularHours + explicitOvertimeHours;
  }

  const contractExpectedHours = getRowContractExpectedHoursValue(row);
  if (explicitRegularHours > 0) return explicitRegularHours;
  if (contractExpectedHours > 0) return contractExpectedHours;
  return 0;
}

function payrollRowHasDisplayHoursData(row) {
  if (!row || typeof row !== 'object') return false;
  return rowHasOwnField(row, [
    'total_worked_hours',
    'worked_hours',
    'worked_hours_capped',
    'expected_hours',
    'payroll_hours',
    'expected_working_hours',
    'contract_expected_hours',
    'overtime_hours',
    'overtime',
  ]);
}

function getRowRegularHoursValue(row) {
  const contractExpectedHours = getRowContractExpectedHoursValue(row);
  const rawWorkedHours = getRowRawWorkedHoursValue(row);

  if (contractExpectedHours > 0 && rawWorkedHours > 0) {
    return Math.min(rawWorkedHours, contractExpectedHours);
  }

  const explicitRegularHours = getRowExplicitRegularHoursValue(row);
  if (explicitRegularHours > 0) return explicitRegularHours;

  if (contractExpectedHours > 0) {
    return Math.min(getRowHoursValue(row), contractExpectedHours);
  }

  return getRowHoursValue(row);
}

function getRowOvertimeHoursValue(row) {
  const rawWorkedHours = getRowRawWorkedHoursValue(row);
  const contractExpectedHours = getRowContractExpectedHoursValue(row);
  if (contractExpectedHours > 0 && rawWorkedHours > 0) {
    return Math.max(rawWorkedHours - contractExpectedHours, 0);
  }

  if (rowHasOwnField(row, ['overtime_hours', 'overtime'])) {
    return getRowExplicitOvertimeHoursValue(row);
  }

  const workedHours = getRowHoursValue(row);
  const regularHours = getRowRegularHoursValue(row);
  return Math.max(workedHours - regularHours, 0);
}

function getRowVerpflValue(row) {
  return getRowNumericValue(row, ['verpfl_mehr', 'verpfl_mehr_display', 'verpflegung_mehr']);
}

function pickBestPayrollRow(candidates, employeeName) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const normalizedTargetName = normalizeNameForMatch(employeeName);
  const scored = list.map((row) => {
    let score = 0;
    if (
      normalizedTargetName &&
      normalizeNameForMatch(row?.name) === normalizedTargetName
    ) {
      score += 1000;
    }
    const hours = getRowHoursValue(row);
    if (Number.isFinite(hours) && hours > 0) score += 100;
    if (Object.prototype.hasOwnProperty.call(row || {}, 'expected_hours')) score += 40;
    if (Object.prototype.hasOwnProperty.call(row || {}, 'payroll_hours')) score += 35;
    const verpfl = getRowVerpflValue(row);
    if (verpfl >= 0) score += 10;
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.row || list[0];
}

function getFrozenPayrollRowFromCache({ month, kenjoEmployeeId, pnCandidates = [], employeeName }) {
  try {
    const cached = getFrozenPayrollCache();
    if (!cached) return null;
    if (String(cached?.month || '').slice(0, 7) !== String(month || '').slice(0, 7)) return null;
    const rows = Array.isArray(cached?.rows) ? cached.rows : [];
    if (!rows.length) return null;

    const rowsByKenjoId = rows.filter(
      (item) => normalizeIdentifier(item?.kenjo_employee_id) === normalizeIdentifier(kenjoEmployeeId)
    );
    if (rowsByKenjoId.length) return pickBestPayrollRow(rowsByKenjoId, employeeName);

    const matchedByPn = rows.filter((item) =>
      pnCandidates.some((pn) => personalNumberMatches(item?.pn, pn))
    );
    if (matchedByPn.length) return pickBestPayrollRow(matchedByPn, employeeName);
    if (!matchedByPn.length && employeeName) {
      const byName = rows.filter(
        (item) => normalizeNameForMatch(item?.name) === normalizeNameForMatch(employeeName)
      );
      if (byName.length) return pickBestPayrollRow(byName, employeeName);
    }
    return null;
  } catch {
    return null;
  }
}

function payrollRowHasHoursData(row) {
  if (!row || typeof row !== 'object') return false;
  const fields = ['worked_hours', 'payroll_hours', 'expected_hours', 'contract_expected_hours', 'overtime_hours', 'overtime'];
  return fields.some((field) =>
    Object.prototype.hasOwnProperty.call(row, field) ||
    (getRowManualEntry(row) ? Object.prototype.hasOwnProperty.call(getRowManualEntry(row), field) : false)
  );
}

function findMatchingPayrollRow(rows, { kenjoIdCandidates = [], pnCandidates = [], employeeName = '' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;

  const rowsByKenjoId = list.filter((item) => {
    const rowIds = [
      item?.kenjo_employee_id,
      item?.kenjo_user_id,
      item?.employee_id,
      item?.id,
    ]
      .map((value) => normalizeIdentifier(value))
      .filter(Boolean);
    return kenjoIdCandidates.some((candidate) => rowIds.includes(candidate));
  });

  let row = pickBestPayrollRow(rowsByKenjoId, employeeName);
  if (!row) {
    for (const pn of pnCandidates) {
      const matches = list.filter((item) => personalNumberMatches(item?.pn, pn));
      if (!matches.length) continue;
      row = pickBestPayrollRow(matches, employeeName);
      if (row) break;
    }
  }
  if (!row && employeeName) {
    row = list.find((item) => normalizeNameForMatch(item?.name) === employeeName) || null;
  }
  if (!row && pnCandidates.length > 0) {
    row = list.find((item) => personalNumberMatches(item?.pn, pnCandidates[0])) || null;
  }
  return row || null;
}

function buildEmployeePayrollCardsFromRow(row, { employee = null, month = '' } = {}) {
  if (!row || typeof row !== 'object') return null;
  const sourceWorkedHours = getRowRawWorkedHoursValue(row) || getRowHoursValue(row);
  const resolvedExpectedHours =
    getRowContractExpectedHoursValue(row) ||
    getEmployeeExpectedHoursForMonth(employee, month);
  const payrollHours = resolvedExpectedHours > 0
    ? Math.min(sourceWorkedHours, resolvedExpectedHours)
    : getRowRegularHoursValue(row);
  const contractExpectedHours = resolvedExpectedHours || payrollHours;
  const overtimeHours = resolvedExpectedHours > 0
    ? Math.max(sourceWorkedHours - resolvedExpectedHours, 0)
    : getRowOvertimeHoursValue(row);
  const verpflMehr = getRowVerpflValue(row);
  const fahrtGeld = getRowNumericValue(row, ['fahrt_geld', 'fahrt_geld_display', 'fahrtgeld']);
  const krankDays = getRowNumericValue(row, ['krank_days', 'sick_days', 'kranktage']);
  const urlaubDays = getRowNumericValue(row, ['urlaub_days', 'vacation_days', 'urlaubstage']);
  const workedHoursPay = payrollHours * EMPLOYEE_HOURLY_RATE_EUR;
  const overtimePay = overtimeHours * EMPLOYEE_HOURLY_RATE_EUR;
  const krankgeld = krankDays * EMPLOYEE_DAILY_PAYOUT_HOURS * EMPLOYEE_HOURLY_RATE_EUR;
  const urlaubgeld = urlaubDays * EMPLOYEE_DAILY_PAYOUT_HOURS * EMPLOYEE_HOURLY_RATE_EUR;
  const bruttoLohn =
    workedHoursPay +
    overtimePay +
    verpflMehr +
    fahrtGeld +
    krankgeld +
    urlaubgeld;
  return {
    workedHours: payrollHours,
    fullTimeHours: contractExpectedHours,
    overtimeHours,
    verpflMehr,
    fahrtGeld,
    krankDays,
    urlaubDays,
    krankgeld,
    urlaubgeld,
    workedHoursPay,
    overtimePay,
    bruttoLohn,
  };
}

function LoadingFiveDots({ isDark = false }) {
  return (
    <span className={`employee-loading-dots${isDark ? ' employee-loading-dots--dark' : ''}`}>
      <span className="employee-loading-dots__label">Loading</span>
      <span className="employee-loading-dots__track" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className="employee-loading-dots__dot"
            style={{ animationDelay: `${index * 0.18}s` }}
          >
            .
          </span>
        ))}
      </span>
    </span>
  );
}

function normalizeContractDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.includes('T') ? raw.slice(0, 10) : raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function addDaysToContractDate(value, days) {
  const iso = normalizeContractDate(value);
  if (!iso || !Number.isFinite(days)) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsToContractDate(value, months) {
  const iso = normalizeContractDate(value);
  if (!iso || !Number.isFinite(months)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return '';
  const originalDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months);
  if (date.getUTCDate() !== originalDay) {
    date.setUTCDate(0);
  }
  return date.toISOString().slice(0, 10);
}

function getTodayContractDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sortContractTimelineRows(rows = []) {
  return [...rows].sort((a, b) => {
    const startA = normalizeContractDate(a?.start_date) || '9999-12-31';
    const startB = normalizeContractDate(b?.start_date) || '9999-12-31';
    if (startA !== startB) return startA.localeCompare(startB);

    const endA = normalizeContractDate(a?.termination_date) || normalizeContractDate(a?.end_date) || '9999-12-31';
    const endB = normalizeContractDate(b?.termination_date) || normalizeContractDate(b?.end_date) || '9999-12-31';
    if (endA !== endB) return endA.localeCompare(endB);

    return String(a?.row_key || a?.id || '').localeCompare(String(b?.row_key || b?.id || ''));
  });
}

function roundDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function formatDaysValue(value) {
  const rounded = roundDays(value);
  return rounded.toLocaleString('de-DE', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function normalizeWholeDaysDraftValue(value) {
  if (value == null || value === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  return String(Math.round(parsed));
}

function formatWholeDaysValue(value) {
  const normalized = normalizeWholeDaysDraftValue(value);
  return normalized || '0';
}

function formatDateDayMonthYear(value) {
  if (!value) return '—';
  const s = String(value).trim();
  const iso = s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '—';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function buildHistoryYearOptions(startYear = 2025, endYear = 2028) {
  const list = [];
  for (let year = startYear; year <= endYear; year += 1) {
    list.push({ value: year, label: String(year).slice(2) });
  }
  return list;
}

function normalizeLocalDateInputValue(value) {
  if (!value) return '';
  const normalized = normalizeContractDate(value);
  if (normalized) return normalized;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const d = String(parsed.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCustomFieldNumericValue(customFields, keys = []) {
  const normalizedKeys = Array.isArray(keys)
    ? keys.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : [];
  for (const field of Array.isArray(customFields) ? customFields : []) {
    const key = String(field?.key || field?.name || field?.label || '').trim().toLowerCase();
    if (!normalizedKeys.includes(key)) continue;
    const parsed = Number(field?.value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
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
    totalYearVacation: baseTotalYearVacation,
    carryOver,
    carryConsumedByDeadline,
    carryAvailableNow,
    carryExpired,
    usedYear,
    usedUntilMarch31,
    chargedCurrentYearVacation,
    remainingVacationDays,
    seedApplied,
    seedStartingBalance,
    seedDateIso,
    usedAfterSeed,
    afterCarryDeadline,
    carryDeadlineIso: `${safeYear}-03-31`,
  };
}

function getEmployeeTimeOffRef(localEmployee, kenjoEmployeeId, localEmployeeId) {
  return String(
    localEmployee?.kenjo_user_id ||
    kenjoEmployeeId ||
    localEmployee?.pn ||
    localEmployee?.employee_id ||
    localEmployeeId ||
    ''
  ).trim();
}

function getEmployeeLocalSettingsRef(localEmployee, kenjoEmployeeId, localEmployeeId) {
  return String(
    localEmployee?.employee_id ||
    localEmployee?.id ||
    localEmployeeId ||
    localEmployee?.pn ||
    localEmployee?.kenjo_user_id ||
    kenjoEmployeeId ||
    ''
  ).trim();
}

export default function EmployeeProfilePage() {
  const { language, isDark } = useAppSettings();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeKenjoEmployeeId = location.state?.kenjoEmployeeId ?? searchParams.get('kenjo_employee_id');
  const localEmployeeId = location.state?.employeeId;
  const payrollRowFromState = location.state?.payrollRow ?? null;
  const payrollContextMonthFromState = String(location.state?.payrollContext?.month || '').slice(0, 7);
  const currentVacationYear = new Date().getFullYear();
  const [employee, setEmployee] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [internalSaving, setInternalSaving] = useState(false);
  const [localEmployee, setLocalEmployee] = useState(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeactivateForm, setShowDeactivateForm] = useState(false);
  const [deactivateDate, setDeactivateDate] = useState('');
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [advanceMonth, setAdvanceMonth] = useState('');
  const [advanceLines, setAdvanceLines] = useState([{ amount: '', code_comment: '' }, { amount: '', code_comment: '' }, { amount: '', code_comment: '' }]);
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceError, setAdvanceError] = useState('');
  const [showDaPerformance, setShowDaPerformance] = useState(false);
  const [showDaPerformanceGraph, setShowDaPerformanceGraph] = useState(false);
  const [kpiRows, setKpiRows] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiError, setKpiError] = useState('');
  const [showKpiCommentDialog, setShowKpiCommentDialog] = useState(false);
  const [kpiCommentWeekKey, setKpiCommentWeekKey] = useState('');
  const [kpiCommentText, setKpiCommentText] = useState('');
  const [kpiCommentSaving, setKpiCommentSaving] = useState(false);
  const [paveSessions, setPaveSessions] = useState([]);
  const [employeeDocs, setEmployeeDocs] = useState([]);
  const [employeeDocsLoading, setEmployeeDocsLoading] = useState(false);
  const [employeeDocumentTypeSettings, setEmployeeDocumentTypeSettings] = useState(DEFAULT_EMPLOYEE_DOCUMENT_TYPE_SETTINGS);
  const [employeeDocFiles, setEmployeeDocFiles] = useState([]);
  const [employeeDocType, setEmployeeDocType] = useState(DEFAULT_EMPLOYEE_DOCUMENT_TYPE_SETTINGS[0]?.type || '');
  const [employeeDocUploading, setEmployeeDocUploading] = useState(false);
  const [employeeDocError, setEmployeeDocError] = useState('');
  const [employeeDocumentTemplate, setEmployeeDocumentTemplate] = useState('');
  const [employeeContractTemplateDate, setEmployeeContractTemplateDate] = useState('');
  const [showEmployeeDocsList, setShowEmployeeDocsList] = useState(false);
  const [employeeDocsFilterType, setEmployeeDocsFilterType] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [contracts, setContracts] = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractError, setContractError] = useState('');
  const [showContractForm, setShowContractForm] = useState(false);
  const [contractDraft, setContractDraft] = useState({ startDate: '', endDate: '', type: 'fixed' });
  const [contractSaving, setContractSaving] = useState(false);
  const [editingContractTarget, setEditingContractTarget] = useState(null);
  const [contractModal, setContractModal] = useState(null);
  const [contractFileUploading, setContractFileUploading] = useState(false);
  const [contractUploadFile, setContractUploadFile] = useState(null);
  const [showSetPermanentConfirm, setShowSetPermanentConfirm] = useState(false);
  const [deleteContractTarget, setDeleteContractTarget] = useState(null);
  const [contractDeleting, setContractDeleting] = useState(false);
  const [terminateContractTarget, setTerminateContractTarget] = useState(null);
  const [terminateContractDraft, setTerminateContractDraft] = useState({
    terminationDate: '',
    terminationType: '',
    terminationInitiator: '',
    file: null,
  });
  const [terminateContractSaving, setTerminateContractSaving] = useState(false);
  const [terminateContractError, setTerminateContractError] = useState('');
  const [rescues, setRescues] = useState([]);
  const [rescuesLoading, setRescuesLoading] = useState(false);
  const [rescueError, setRescueError] = useState('');
  const [showRescueModal, setShowRescueModal] = useState(false);
  const [rescueDateDraft, setRescueDateDraft] = useState(createEmptyRescueDateDraft);
  const [rescueSaving, setRescueSaving] = useState(false);
  const [internalProfileModal, setInternalProfileModal] = useState(null);
  const [vacationDaysOverrideDraft, setVacationDaysOverrideDraft] = useState('');
  const [vacationDaysOverrideEditing, setVacationDaysOverrideEditing] = useState(false);
  const [vacationDaysOverrideSaving, setVacationDaysOverrideSaving] = useState(false);
  const [vacationDaysOverrideError, setVacationDaysOverrideError] = useState('');
  const [currentVacationBalanceDraft, setCurrentVacationBalanceDraft] = useState('');
  const [currentVacationBalanceEditing, setCurrentVacationBalanceEditing] = useState(false);
  const [currentVacationBalanceSaving, setCurrentVacationBalanceSaving] = useState(false);
  const [currentVacationBalanceError, setCurrentVacationBalanceError] = useState('');
  const [vacationSummary, setVacationSummary] = useState(null);
  const [vacationSummaryLoading, setVacationSummaryLoading] = useState(false);
  const [vacationSummaryError, setVacationSummaryError] = useState('');
  const [timeOffHistoryModal, setTimeOffHistoryModal] = useState(null);
  const [timeOffHistoryYear, setTimeOffHistoryYear] = useState(currentVacationYear);
  const [timeOffHistoryRows, setTimeOffHistoryRows] = useState([]);
  const [timeOffHistoryLoading, setTimeOffHistoryLoading] = useState(false);
  const [timeOffHistoryError, setTimeOffHistoryError] = useState('');
  const [lastMonthPayrollCards, setLastMonthPayrollCards] = useState(null);
  const [lastMonthPayrollLoading, setLastMonthPayrollLoading] = useState(false);
  const contractFileInputRef = useRef(null);
  const terminateContractFileInputRef = useRef(null);
  const employeeDocFileInputRef = useRef(null);
  const kenjoEmployeeId = String(
    routeKenjoEmployeeId ||
    localEmployee?.kenjo_user_id ||
    employee?._id ||
    employee?.id ||
    ''
  ).trim();

  useEffect(() => {
    if (!routeKenjoEmployeeId && !localEmployeeId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setEmployee(null);
    setLocalEmployee(null);
    (async () => {
      try {
        let resolvedKenjoEmployeeId = String(routeKenjoEmployeeId || '').trim();
        let resolvedLocalEmployee = null;

        if (localEmployeeId || resolvedKenjoEmployeeId) {
          try {
            const loc = await getEmployee(localEmployeeId || resolvedKenjoEmployeeId);
            resolvedLocalEmployee = loc;
            if (!cancelled) {
              setLocalEmployee(loc);
            }
            if (!resolvedKenjoEmployeeId) {
              resolvedKenjoEmployeeId = String(loc?.kenjo_user_id || '').trim();
            }
          } catch (_) {
            if (!cancelled) {
              setLocalEmployee(null);
            }
          }
        }

        if (resolvedKenjoEmployeeId) {
          const data = await getKenjoEmployeeProfile(resolvedKenjoEmployeeId);
          if (!cancelled) {
            setEmployee(data);
          }
        } else if (!cancelled) {
          setEmployee(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e?.message || e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeKenjoEmployeeId, localEmployeeId]);

  useEffect(() => {
    if (!localEmployeeId || routeKenjoEmployeeId || !localEmployee?.kenjo_user_id) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const data = await getKenjoEmployeeProfile(localEmployee.kenjo_user_id);
        if (!cancelled) {
          setEmployee(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e?.message || e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeKenjoEmployeeId, localEmployeeId, localEmployee?.kenjo_user_id]);

  useEffect(() => {
    getSettingsByGroup('drivers')
      .then((group) => {
        const configuredTypes = normalizeEmployeeDocumentTypeSettings(group?.employee_document_types?.value);
        setEmployeeDocumentTypeSettings(configuredTypes);
      })
      .catch(() => {
        setEmployeeDocumentTypeSettings(DEFAULT_EMPLOYEE_DOCUMENT_TYPE_SETTINGS);
      });
  }, []);

  useEffect(() => {
    if (employee) {
      setDraft({
        ...employee,
        dspLocal: {
          fuehrerschein_aufstellungsdatum: '',
          fuehrerschein_aufstellungsbehoerde: '',
          whatsapp_number: '',
          ...(employee.dspLocal || {}),
        },
      });
      setIsEditing(false);
    }
  }, [employee]);

  useEffect(() => {
    const hasCurrentYearOverride =
      Number(localEmployee?.total_year_vacation_year ?? localEmployee?.vacation_days_override_year) === currentVacationYear;
    const value = hasCurrentYearOverride
      ? (localEmployee?.total_year_vacation ?? localEmployee?.vacation_days_override)
      : '';
    setVacationDaysOverrideDraft(value == null || value === '' ? '' : String(value));
    setVacationDaysOverrideEditing(false);
  }, [
    currentVacationYear,
    localEmployee?.total_year_vacation,
    localEmployee?.total_year_vacation_year,
    localEmployee?.vacation_days_override,
    localEmployee?.vacation_days_override_year,
  ]);

  useEffect(() => {
    const hasCurrentYearBalance = Number(localEmployee?.current_remaining_vacation_year) === currentVacationYear;
    const value = hasCurrentYearBalance ? localEmployee?.current_remaining_vacation : '';
    setCurrentVacationBalanceDraft(normalizeWholeDaysDraftValue(value));
    setCurrentVacationBalanceEditing(false);
  }, [
    currentVacationYear,
    localEmployee?.current_remaining_vacation,
    localEmployee?.current_remaining_vacation_year,
  ]);

  useEffect(() => {
    const employeeRef = getEmployeeTimeOffRef(localEmployee, kenjoEmployeeId, localEmployeeId);
    if (!employeeRef) {
      setVacationSummary(null);
      setVacationSummaryError('');
      return;
    }
    setVacationSummaryLoading(true);
    setVacationSummaryError('');
    getEmployeeVacationSummary(employeeRef, currentVacationYear)
      .then((data) => setVacationSummary(data && typeof data === 'object' ? data : null))
      .catch((e) => {
        setVacationSummary(null);
        setVacationSummaryError(String(e?.message || e));
      })
      .finally(() => setVacationSummaryLoading(false));
  }, [currentVacationYear, kenjoEmployeeId, localEmployee?.employee_id, localEmployee?.kenjo_user_id, localEmployeeId]);

  useEffect(() => {
    const availableTypes = normalizeEmployeeDocumentTypeSettings(employeeDocumentTypeSettings).map((item) => item.type);
    if (!availableTypes.length) return;
    if (!availableTypes.includes(employeeDocType)) {
      setEmployeeDocType(availableTypes[0]);
      setEmployeeDocumentTemplate('');
      setEmployeeContractTemplateDate('');
    }
  }, [employeeDocumentTypeSettings, employeeDocType]);

  useEffect(() => {
    if (!showDaPerformance || !kenjoEmployeeId || !employee) return;
    setKpiLoading(true);
    setKpiError('');
    const pn = employee?.work?.employeeNumber ?? employee?.account?.employeeNumber ?? '';
    getEmployeeKpi(kenjoEmployeeId, pn)
      .then((rows) => setKpiRows(Array.isArray(rows) ? rows : []))
      .catch((e) => setKpiError(String(e?.message || e)))
      .finally(() => setKpiLoading(false));
  }, [showDaPerformance, kenjoEmployeeId, employee]);

  useEffect(() => {
    if (!kenjoEmployeeId) {
      setLastMonthPayrollCards(null);
      setLastMonthPayrollLoading(false);
      return;
    }
    let cancelled = false;
    setLastMonthPayrollLoading(true);
    (async () => {
      try {
        const lastMonth = getLastMonthRange();
        const frozenCache = getFrozenPayrollCache();
        const selectedMonth =
          String(payrollContextMonthFromState || '').slice(0, 7) ||
          String(frozenCache?.month || '').slice(0, 7) ||
          lastMonth.month;
        const monthRange = getMonthRange(selectedMonth);
        const month = monthRange.month;
        const fromDate =
          String(frozenCache?.month || '').slice(0, 7) === month
            ? String(frozenCache?.from || monthRange.fromDate).slice(0, 10)
            : monthRange.fromDate;
        const toDate =
          String(frozenCache?.month || '').slice(0, 7) === month
            ? String(frozenCache?.to || monthRange.toDate).slice(0, 10)
            : monthRange.toDate;
        const rowFromStateMatches =
          payrollRowFromState &&
          normalizeIdentifier(payrollRowFromState?.kenjo_employee_id) === normalizeIdentifier(kenjoEmployeeId) &&
          payrollContextMonthFromState === month
            ? payrollRowFromState
            : null;
        if (rowFromStateMatches && payrollRowHasDisplayHoursData(rowFromStateMatches)) {
          const cards = buildEmployeePayrollCardsFromRow(rowFromStateMatches, { employee, month });
          if (!cancelled) setLastMonthPayrollCards(cards);
          return;
        }
        const employeeName = normalizeNameForMatch(
          employee?.displayName ||
          [employee?.firstName, employee?.lastName].filter(Boolean).join(' ')
        );
        const employeePn = String(
          employee?.work?.employeeNumber ||
          employee?.account?.employeeNumber ||
          ''
        ).trim();
        const cachedRow = getFrozenPayrollRowFromCache({
          month,
          kenjoEmployeeId,
          pnCandidates: [employeePn].filter(Boolean),
          employeeName,
        });
        if (cachedRow && payrollRowHasDisplayHoursData(cachedRow)) {
          const cards = buildEmployeePayrollCardsFromRow(cachedRow, { employee, month });
          if (!cancelled) setLastMonthPayrollCards(cards);
          return;
        }
        if (!employee) {
          if (!cancelled) setLastMonthPayrollCards(null);
          return;
        }
        let rows = [];
        try {
          const snapshot = await getPayrollHistorySnapshot(month);
          const snapshotRows =
            (Array.isArray(snapshot?.payload?.rows) && snapshot.payload.rows) ||
            (Array.isArray(snapshot?.rows) && snapshot.rows) ||
            (Array.isArray(snapshot?.payload?.data?.rows) && snapshot.payload.data.rows) ||
            [];
          if (snapshotRows.length > 0) {
            rows = snapshotRows;
          }
        } catch {
          rows = [];
        }
        if (!rows.length) {
          const result = await calculatePayroll(month, fromDate, toDate);
          rows = Array.isArray(result?.rows) ? result.rows : [];
        }
        const employeeNameLive = normalizeNameForMatch(
          employee?.displayName ||
          [employee?.firstName, employee?.lastName].filter(Boolean).join(' ')
        );
        const kenjoIdCandidates = [
          kenjoEmployeeId,
          employee?._id,
          employee?.id,
        ]
          .map((value) => normalizeIdentifier(value))
          .filter(Boolean);
        const rowsByKenjoId = rows.filter((item) => {
          const rowIds = [
            item?.kenjo_employee_id,
            item?.kenjo_user_id,
            item?.employee_id,
            item?.id,
          ]
            .map((value) => normalizeIdentifier(value))
            .filter(Boolean);
          return kenjoIdCandidates.some((candidate) => rowIds.includes(candidate));
        });
        const pnCandidates = [...new Set([employeePn].filter(Boolean))];
        let row = pickBestPayrollRow(rowsByKenjoId, employeeNameLive);
        if (!row) {
          row = findMatchingPayrollRow(rows, {
            kenjoIdCandidates,
            pnCandidates,
            employeeName: employeeNameLive,
          });
        }
        if (row && !payrollRowHasDisplayHoursData(row)) {
          const liveResult = await calculatePayroll(month, fromDate, toDate);
          const liveRows = Array.isArray(liveResult?.rows) ? liveResult.rows : [];
          row = findMatchingPayrollRow(liveRows, {
            kenjoIdCandidates,
            pnCandidates,
            employeeName: employeeNameLive,
          });
        }
        if (!row || cancelled) {
          if (!cancelled) setLastMonthPayrollCards(null);
          return;
        }
        const cards = buildEmployeePayrollCardsFromRow(row, { employee, month });
        if (!cancelled) {
          setLastMonthPayrollCards(cards);
        }
      } catch (_) {
        if (!cancelled) setLastMonthPayrollCards(null);
      } finally {
        if (!cancelled) setLastMonthPayrollLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kenjoEmployeeId, employee, payrollRowFromState, payrollContextMonthFromState]);

  const openKpiCommentFromMain = async () => {
    if (!kenjoEmployeeId || !employee) return;
    try {
      let rows = kpiRows;
      if (!rows.length) {
        setKpiLoading(true);
        setKpiError('');
        const pn = employee?.work?.employeeNumber ?? employee?.account?.employeeNumber ?? '';
        const loaded = await getEmployeeKpi(kenjoEmployeeId, pn);
        rows = Array.isArray(loaded) ? loaded : [];
        setKpiRows(rows);
      }
      if (!rows.length) {
        setKpiError('No KPI data found for this employee.');
        return;
      }
      const first = rows[0];
      setKpiCommentWeekKey(`${first.year}-${first.week}`);
      setKpiCommentText(first.comment || '');
      setShowKpiCommentDialog(true);
    } catch (e) {
      setKpiError(String(e?.message || e));
    } finally {
      setKpiLoading(false);
    }
  };

  const openRescueModal = () => {
    setRescueDateDraft(createEmptyRescueDateDraft());
    setRescueError('');
    setShowRescueModal(true);
  };

  const closeRescueModal = () => {
    if (rescueSaving) return;
    setShowRescueModal(false);
    setRescueDateDraft(createEmptyRescueDateDraft());
  };

  const saveRescue = async () => {
    if (!employeeDocRef) {
      setRescueError('Employee reference is missing.');
      return;
    }
    const nextRescueDate = buildRescueIsoDate(rescueDateDraft);
    if (!nextRescueDate) {
      setRescueError('Please select a valid rescue date.');
      return;
    }
    setRescueSaving(true);
    setRescueError('');
    try {
      const row = await addEmployeeRescue(employeeDocRef, nextRescueDate);
      setRescues((prev) =>
        [row, ...(Array.isArray(prev) ? prev : [])].sort((a, b) =>
          String(b?.rescue_date || '').localeCompare(String(a?.rescue_date || ''))
        )
      );
      setShowRescueModal(false);
      setRescueDateDraft(createEmptyRescueDateDraft());
    } catch (e) {
      setRescueError(String(e?.message || e));
    } finally {
      setRescueSaving(false);
    }
  };

  const removeRescue = async (rescueId) => {
    if (!employeeDocRef) return;
    if (!window.confirm('Delete this rescue entry?')) return;
    try {
      setRescueError('');
      await deleteEmployeeRescue(employeeDocRef, rescueId);
      setRescues((prev) => (prev || []).filter((row) => row.id !== rescueId));
    } catch (e) {
      setRescueError(String(e?.message || e));
    }
  };

  const saveVacationDaysOverride = async () => {
    const employeeRef = getEmployeeLocalSettingsRef(localEmployee, kenjoEmployeeId, localEmployeeId);
    if (!employeeRef) {
      setVacationDaysOverrideError('Employee reference is missing.');
      return;
    }
    setVacationDaysOverrideSaving(true);
    setVacationDaysOverrideError('');
    try {
      const payloadValue = String(vacationDaysOverrideDraft || '').trim();
      const updated = await updateEmployeeLocalSettings(employeeRef, {
        totalYearVacation: payloadValue === '' ? null : payloadValue,
        totalYearVacationYear: currentVacationYear,
      });
      setLocalEmployee(updated);
      setVacationDaysOverrideDraft(
        updated?.total_year_vacation == null || updated?.total_year_vacation === ''
          ? ''
          : String(updated.total_year_vacation)
        );
      setVacationDaysOverrideEditing(false);
      const refreshedSummary = await getEmployeeVacationSummary(employeeRef, currentVacationYear);
      setVacationSummary(refreshedSummary);
    } catch (e) {
      setVacationDaysOverrideError(String(e?.message || e));
    } finally {
      setVacationDaysOverrideSaving(false);
    }
  };

  const saveCurrentVacationBalance = async () => {
    const employeeRef = getEmployeeLocalSettingsRef(localEmployee, kenjoEmployeeId, localEmployeeId);
    if (!employeeRef) {
      setCurrentVacationBalanceError('Employee reference is missing.');
      return;
    }
    setCurrentVacationBalanceSaving(true);
    setCurrentVacationBalanceError('');
    try {
      const payloadValue = normalizeWholeDaysDraftValue(currentVacationBalanceDraft);
      const updated = await updateEmployeeLocalSettings(employeeRef, {
        currentRemainingVacation: payloadValue === '' ? null : payloadValue,
        currentRemainingVacationYear: currentVacationYear,
        currentRemainingVacationSetOn: new Date().toISOString().slice(0, 10),
      });
      setLocalEmployee(updated);
      setCurrentVacationBalanceDraft(normalizeWholeDaysDraftValue(updated?.current_remaining_vacation));
      setCurrentVacationBalanceEditing(false);
      const refreshedSummary = await getEmployeeVacationSummary(employeeRef, currentVacationYear);
      setVacationSummary(refreshedSummary);
    } catch (e) {
      setCurrentVacationBalanceError(String(e?.message || e));
    } finally {
      setCurrentVacationBalanceSaving(false);
    }
  };

  useEffect(() => {
    if (!kenjoEmployeeId) return;
    getPaveSessions({ driver_id: kenjoEmployeeId }).then(setPaveSessions).catch(() => setPaveSessions([]));
  }, [kenjoEmployeeId]);

  const employeeDocRef = String(kenjoEmployeeId || localEmployee?.employee_id || localEmployeeId || '').trim();
  const employeeVacationRef = getEmployeeTimeOffRef(localEmployee, kenjoEmployeeId, localEmployeeId);
  const contractUi =
    language === 'de'
      ? {
          addContractButton: 'Add contract',
          addContractTitle: 'Add contract',
          addFixedContractOption: 'Add fixed contract',
          addPermanentContractOption: 'Add permanent contract',
          fixedContractLimitReached: 'Maximum number of fixed contracts reached.',
          loading: 'Vertragshistorie wird geladen...',
          historyTitle: 'Vertragshistorie',
          historyHint: 'Hier koennen fruehere Vertraege manuell nachgetragen werden. Start date und Contract end oben werden automatisch aus der Historie berechnet.',
          managedSummaryHint: 'Diese Felder werden jetzt aus der Vertragshistorie berechnet.',
          reminderTitle: 'Hinweis',
          reminderMessage: 'Bitte nicht vergessen, dass der naechste Vertrag unbefristet sein wird.',
          missingEmployeeRef: 'Mitarbeiterreferenz fehlt.',
          chooseDates: 'Bitte waehlen Sie ein Start- und Enddatum aus.',
          chooseStartDate: 'Bitte waehlen Sie ein Startdatum aus.',
          contractLabel: 'Contract',
          contractExtensionLabel: (n) => `Contract extension ${n}`,
          currentBadge: 'Aktuell',
          unlimitedLabel: 'Unbefristed',
          terminateButton: 'Terminate contract',
          terminateCurrentButton: 'Terminate Current Contract',
          editContractDateButton: 'Edit contract',
          editContractDateTitle: 'Edit contract',
          setAsPermanentButton: 'Als unbefristet setzen',
          setAsPermanentTitle: 'Unbefristeten Vertrag setzen',
          setAsPermanentConfirm: 'Sind Sie sicher, dass Sie diesen Vertrag auf unbefristet setzen moechten?',
          setAsPermanentConfirmButton: 'Yes',
          setAsPermanentCancelButton: 'Cancel',
          deleteContractButton: 'Delete contract',
          deleteContractTitle: 'Delete contract',
          deleteContractConfirm: 'Sind Sie sicher, dass Sie diesen Vertrag loeschen moechten?',
          deleteContractCancelButton: 'No',
          deleteContractConfirmButton: 'Yes',
          deleteContractSuccess: 'Contract deleted successfully.',
          terminateTitle: 'Vertrag kuendigen',
          terminationDate: 'Termination date',
          mutualTermination: 'Aufhebungsvertrag',
          ordinaryTermination: 'Ordentliche Kuendigung',
          extraordinaryTermination: 'Fristlose Kuendigung',
          employerTermination: 'Kuendigung durch Arbeitgeber',
          employeeTermination: 'Kuendigung durch Arbeitnehmer',
          uploadDocument: 'Upload document',
          saveTermination: 'Save',
          cancelTermination: 'Cancel',
          terminationDocumentSelected: (name) => `Dokument: ${name}`,
          chooseTerminationType: 'Bitte waehlen Sie einen Kuendigungsgrund aus.',
          chooseTerminationDate: 'Bitte waehlen Sie ein Kuendigungsdatum aus.',
          chooseOrdinaryInitiator: 'Bitte waehlen Sie aus, wer die ordentliche Kuendigung ausgeloest hat.',
          terminationSaved: 'Contract termination saved.',
          terminationBadge: 'Termination',
          from: 'Von',
          to: 'Bis',
          fixedType: 'Befristet',
          unlimitedType: 'Unbefristet',
          cancel: 'Abbrechen',
          save: 'Speichern',
          saving: 'Speichert...',
          uploadContract: 'Upload contract',
          uploadingContract: 'Laedt hoch...',
          contractDocumentSelected: (name) => `Dokument: ${name}`,
          uploadSuccess: 'Der neue Vertrag wurde unter Dokumenttyp "Vertrag" gespeichert.',
          uploadPartialSuccess: (errorMessage) =>
            `Der Vertrag wurde gespeichert, aber das Dokument konnte nicht automatisch unter Dokumenttyp "Vertrag" abgelegt werden.\n${errorMessage}`,
          saveErrorTitle: 'Save failed',
          deleteErrorTitle: 'Delete failed',
        }
      : {
          addContractButton: 'Add contract',
          addContractTitle: 'Add contract',
          addFixedContractOption: 'Add fixed contract',
          addPermanentContractOption: 'Add permanent contract',
          fixedContractLimitReached: 'Maximum number of fixed contracts reached.',
          loading: 'Loading contract history...',
          historyTitle: 'Contract history',
          historyHint: 'You can backfill older contracts here. Start date and Contract end above are calculated automatically from the history.',
          managedSummaryHint: 'These fields are now calculated from contract history.',
          reminderTitle: 'Reminder',
          reminderMessage: 'Please do not forget that the next contract will be unlimited.',
          missingEmployeeRef: 'Employee reference is missing.',
          chooseDates: 'Please choose both start and end dates.',
          chooseStartDate: 'Please choose a start date.',
          contractLabel: 'Contract',
          contractExtensionLabel: (n) => `Contract extension ${n}`,
          currentBadge: 'Current',
          unlimitedLabel: 'Unbefristed',
          terminateButton: 'Terminate contract',
          terminateCurrentButton: 'Terminate Current Contract',
          editContractDateButton: 'Edit contract',
          editContractDateTitle: 'Edit contract',
          setAsPermanentButton: 'Set as permanent',
          setAsPermanentTitle: 'Set as permanent',
          setAsPermanentConfirm: 'Are you sure you want to set that contract as a permanent?',
          setAsPermanentConfirmButton: 'Yes',
          setAsPermanentCancelButton: 'Cancel',
          deleteContractButton: 'Delete contract',
          deleteContractTitle: 'Delete contract',
          deleteContractConfirm: 'Are you sure you want to delete this contract?',
          deleteContractCancelButton: 'No',
          deleteContractConfirmButton: 'Yes',
          deleteContractSuccess: 'Contract deleted successfully.',
          terminateTitle: 'Terminate contract',
          terminationDate: 'Termination date',
          mutualTermination: 'Aufhebungsvertrag',
          ordinaryTermination: 'Ordentliche Kuendigung',
          extraordinaryTermination: 'Fristlose Kuendigung',
          employerTermination: 'Kuendigung durch Arbeitgeber',
          employeeTermination: 'Kuendigung durch Arbeitnehmer',
          uploadDocument: 'Upload document',
          saveTermination: 'Save',
          cancelTermination: 'Cancel',
          terminationDocumentSelected: (name) => `Document: ${name}`,
          chooseTerminationType: 'Please choose a termination type.',
          chooseTerminationDate: 'Please choose a termination date.',
          chooseOrdinaryInitiator: 'Please choose who initiated the ordinary termination.',
          terminationSaved: 'Contract termination saved.',
          terminationBadge: 'Termination',
          from: 'From',
          to: 'To',
          fixedType: 'Fixed-term',
          unlimitedType: 'Unlimited',
          cancel: 'Cancel',
          save: 'Save',
          saving: 'Saving...',
          uploadContract: 'Upload contract',
          uploadingContract: 'Uploading...',
          contractDocumentSelected: (name) => `Document: ${name}`,
          uploadSuccess: 'The new contract was saved under document type "Vertrag".',
          uploadPartialSuccess: (errorMessage) =>
            `The contract was saved, but the document could not be added automatically under document type "Vertrag".\n${errorMessage}`,
          saveErrorTitle: 'Save failed',
          deleteErrorTitle: 'Delete failed',
        };

  const timeOffUi =
    language === 'de'
      ? {
          currentRemainingLabel: `Aktueller Resturlaub (${currentVacationYear})`,
          currentRemainingHint:
            'Diesen Wert bitte einmal als aktuellen Resturlaub setzen. Alle spaeteren genehmigten Urlaube werden dann automatisch davon abgezogen.',
          currentRemainingSeedInfo: (date) => `Aktueller Startsaldo gespeichert am ${date}.`,
          vacationHistoryButton: 'Vacation history',
          sicknessHistoryButton: 'Sickness history',
          vacationHistoryTitle: 'Urlaubshistorie',
          sicknessHistoryTitle: 'Krankheitshistorie',
          yearLabel: 'Jahr',
          from: 'Von',
          to: 'Bis',
          workingDays: 'Arbeitstage',
          totalInYear: 'Summe im Jahr',
          noRows: 'Keine Eintraege fuer dieses Jahr gefunden.',
          loading: 'Historie wird geladen...',
          close: 'Close',
        }
      : {
          currentRemainingLabel: `Current remaining vacation (${currentVacationYear})`,
          currentRemainingHint:
            'Set the actual remaining vacation once. Future approved vacations are then subtracted automatically from this balance.',
          currentRemainingSeedInfo: (date) => `Current starting balance saved on ${date}.`,
          vacationHistoryButton: 'Vacation history',
          sicknessHistoryButton: 'Sickness history',
          vacationHistoryTitle: 'Vacation history',
          sicknessHistoryTitle: 'Sickness history',
          yearLabel: 'Year',
          from: 'From',
          to: 'To',
          workingDays: 'Working days',
          totalInYear: 'Total in year',
          noRows: 'No entries found for this year.',
          loading: 'Loading history...',
          close: 'Close',
        };

  const openTimeOffHistoryModal = (type) => {
    setTimeOffHistoryModal(type);
    setTimeOffHistoryYear(currentVacationYear);
    setTimeOffHistoryRows([]);
    setTimeOffHistoryError('');
  };

  const closeTimeOffHistoryModal = () => {
    setTimeOffHistoryModal(null);
    setTimeOffHistoryRows([]);
    setTimeOffHistoryError('');
  };

  useEffect(() => {
    if (!timeOffHistoryModal) return;
    if (!employeeVacationRef) {
      setTimeOffHistoryRows([]);
      setTimeOffHistoryError('Employee reference is missing.');
      return;
    }
    let cancelled = false;
    setTimeOffHistoryLoading(true);
    setTimeOffHistoryError('');
    getEmployeeTimeOffHistory(employeeVacationRef, {
      type: timeOffHistoryModal,
      year: timeOffHistoryYear,
    })
      .then((data) => {
        if (cancelled) return;
        setTimeOffHistoryRows(Array.isArray(data?.rows) ? data.rows : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setTimeOffHistoryRows([]);
        setTimeOffHistoryError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setTimeOffHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employeeVacationRef, timeOffHistoryModal, timeOffHistoryYear]);

  useEffect(() => {
    if (!employeeDocRef) return;
    setEmployeeDocsLoading(true);
    setEmployeeDocError('');
    getEmployeeDocuments(employeeDocRef)
      .then((rows) => setEmployeeDocs(Array.isArray(rows) ? rows : []))
      .catch((e) => setEmployeeDocError(String(e?.message || e)))
      .finally(() => setEmployeeDocsLoading(false));
  }, [employeeDocRef]);

  useEffect(() => {
    if (!employeeDocRef) return;
    setContractsLoading(true);
    setContractError('');
    getEmployeeContracts(employeeDocRef)
      .then((rows) => setContracts(Array.isArray(rows) ? rows : []))
      .catch((e) => setContractError(String(e?.message || e)))
      .finally(() => setContractsLoading(false));
  }, [employeeDocRef]);

  useEffect(() => {
    if (!employeeDocRef) return;
    setRescuesLoading(true);
    setRescueError('');
    getEmployeeRescues(employeeDocRef)
      .then((rows) => setRescues(Array.isArray(rows) ? rows : []))
      .catch((e) => setRescueError(String(e?.message || e)))
      .finally(() => setRescuesLoading(false));
  }, [employeeDocRef]);

  const filteredEmployeeDocs =
    employeeDocsFilterType && employeeDocsFilterType.trim()
      ? employeeDocs.filter((d) => String(d?.document_type || '') === employeeDocsFilterType)
      : employeeDocs;
  const visibleRescues = (() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
    return (rescues || []).filter((row) => {
      const rescueMonth = String(row?.rescue_date || '').slice(0, 7);
      return rescueMonth === currentMonth || rescueMonth === previousMonth;
    });
  })();

  const employeeSectionStyle = {
    marginBottom: '1rem',
    padding: '0.75rem',
    borderRadius: 8,
    background: isDark ? 'rgba(10, 20, 37, 0.9)' : '#f5f5f5',
    border: isDark ? '1px solid rgba(132, 162, 214, 0.32)' : '1px solid #e5e7eb',
    color: isDark ? '#eaf2ff' : '#111827',
  };

  const employeeMutedTextStyle = {
    color: isDark ? '#9bb0d1' : '#666',
  };

  const employeeTabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'profile', label: 'Profile' },
    { key: 'employment', label: 'Employment' },
    { key: 'time-off', label: 'Time Off' },
    { key: 'documents', label: 'Documents' },
    { key: 'performance', label: 'Performance' },
  ];

  const employeeTabsBarStyle = {
    display: 'flex',
    gap: '0.35rem',
    alignItems: 'flex-end',
    overflowX: 'auto',
    padding: '0 0 0.1rem',
    borderBottom: isDark ? '1px solid rgba(132, 162, 214, 0.28)' : '1px solid #d8dde6',
    marginBottom: '1rem',
  };

  const getEmployeeTabButtonStyle = (tabKey) => {
    const isActiveTab = activeTab === tabKey;
    return {
      border: isActiveTab
        ? (isDark ? '1px solid rgba(120, 176, 255, 0.45)' : '1px solid #bcd0f5')
        : (isDark ? '1px solid rgba(132, 162, 214, 0.2)' : '1px solid #d8dde6'),
      borderBottom: isActiveTab ? 'none' : undefined,
      borderRadius: '14px 14px 0 0',
      padding: '0.72rem 1rem',
      background: isActiveTab
        ? (isDark ? 'linear-gradient(180deg, rgba(18, 42, 74, 0.96), rgba(11, 25, 45, 0.98))' : '#ffffff')
        : (isDark ? 'rgba(10, 20, 37, 0.82)' : '#f4f6fb'),
      color: isActiveTab
        ? (isDark ? '#f8fbff' : '#0f172a')
        : (isDark ? '#c3d4f0' : '#475569'),
      fontWeight: isActiveTab ? 700 : 600,
      cursor: 'pointer',
      boxShadow: isActiveTab
        ? (isDark ? '0 -10px 22px rgba(2, 10, 24, 0.32)' : '0 -8px 18px rgba(148, 163, 184, 0.12)')
        : 'none',
      whiteSpace: 'nowrap',
      transition: 'background 120ms ease, color 120ms ease, box-shadow 120ms ease',
    };
  };

  const tabHeadingStyle = {
    margin: '0 0 0.85rem',
    fontSize: '1rem',
    color: isDark ? '#f8fbff' : '#111827',
  };

  const modalOverlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.46)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '8vh 1rem 1rem',
    zIndex: 1000,
  };

  const modalCardStyle = {
    background: isDark ? 'rgba(10, 20, 37, 0.96)' : '#ffffff',
    color: isDark ? '#eaf2ff' : '#111827',
    border: isDark ? '1px solid rgba(132, 162, 214, 0.32)' : '1px solid #e5e7eb',
    borderRadius: 12,
    boxShadow: isDark ? '0 14px 36px rgba(1, 8, 22, 0.5)' : '0 4px 20px rgba(0,0,0,0.15)',
    width: 'calc(100% - 2rem)',
    maxHeight: '84vh',
    overflow: 'auto',
  };

  const modalInputStyle = {
    background: isDark ? 'rgba(9, 19, 34, 0.92)' : '#fff',
    color: isDark ? '#eaf2ff' : '#111827',
    border: isDark ? '1px solid rgba(132, 162, 214, 0.35)' : '1px solid #d1d5db',
    borderRadius: 8,
    padding: '0.5rem',
  };

  if (!kenjoEmployeeId && !localEmployeeId) {
    return (
      <section className="card">
        <h2>Employee Profile</h2>
        <p>No employee selected. Please open this page from Kenjo Sync or the employees list.</p>
      </section>
    );
  }

  if (loading && !employee) {
    return (
      <section className="card">
        <h2>Employee Profile</h2>
        <p>Loading employee data from Kenjo…</p>
      </section>
    );
  }

  if (error && !employee) {
    return (
      <section className="card">
        <h2>Employee Profile</h2>
        <p className="error-text">Error loading employee: {error}</p>
      </section>
    );
  }

  if (!employee) {
    return null;
  }

  const current = isEditing && draft ? draft : employee;

  const {
    firstName,
    lastName,
    displayName,
    email,
    externalId,
    personal,
    account,
    work,
    address,
    home,
    financial,
    createdAt,
    updatedAt,
  } = current;

  const fullName =
    displayName || personal?.displayName || [firstName, lastName].filter(Boolean).join(' ');
  const employeeDocTypeConfigs = normalizeEmployeeDocumentTypeSettings(employeeDocumentTypeSettings);
  const employeeDocTypeOptions = employeeDocTypeConfigs.map((item) => item.type);
  const selectedEmployeeDocTypeConfig =
    employeeDocTypeConfigs.find((item) => item.type === employeeDocType) || employeeDocTypeConfigs[0] || null;
  const employeeDocumentTemplateOptions = buildEmployeeDocumentExactNameOptions(
    selectedEmployeeDocTypeConfig,
    buildEmployeeDocumentTypeTemplateContext({
      firstName: firstName || personal?.firstName,
      lastName: lastName || personal?.lastName,
      startDate: work?.startDate,
      selectedDate: employeeContractTemplateDate,
    })
  );
  const selectedEmployeeDocumentTemplateOption =
    employeeDocumentTemplateOptions.find((option) => option.value === employeeDocumentTemplate) || null;
  const showEmployeeDocExactName =
    selectedEmployeeDocTypeConfig?.exactNameEnabled === true && employeeDocumentTemplateOptions.length > 0;
  const showEmployeeDocTemplateDate = selectedEmployeeDocumentTemplateOption?.requiresSelectedDate === true;
  const employeeDocFormGridTemplateColumns = [
    'minmax(0, 1fr)',
    showEmployeeDocExactName ? 'minmax(0, 1fr)' : null,
    showEmployeeDocTemplateDate ? 'minmax(0, 180px)' : null,
    'minmax(0, 240px)',
    'auto',
  ].filter(Boolean).join(' ');
  const employeeDocTypeFilterOptions = Array.from(
    new Set([
      ...employeeDocTypeOptions,
      ...employeeDocs.map((doc) => String(doc?.document_type || '').trim()).filter(Boolean),
    ])
  );
  const historyYearOptions = buildHistoryYearOptions();
  const carryOverDays = getCustomFieldNumericValue(current?.customFields, ['c_CarryOverDays', 'Carry over days']);
  const timeOffHistoryTotalDays = (timeOffHistoryRows || []).reduce(
    (sum, row) => sum + (Number(row?.working_days) || 0),
    0
  );
  const localCurrentRemainingSeed =
    Number(localEmployee?.current_remaining_vacation_year) === currentVacationYear
      ? localEmployee?.current_remaining_vacation
      : null;
  const localCurrentRemainingSeedDate =
    Number(localEmployee?.current_remaining_vacation_year) === currentVacationYear
      ? localEmployee?.current_remaining_vacation_set_on
      : null;
  const vacationBalance = buildVacationBalanceSnapshot({
    totalYearVacation:
      vacationSummary?.total_year_vacation ??
      localEmployee?.total_year_vacation ??
      localEmployee?.vacation_days_override ??
      20,
    carryOverDays,
    approvedVacationDaysYear: vacationSummary?.approved_vacation_days_year ?? 0,
    approvedVacationDaysUntilMarch31: vacationSummary?.approved_vacation_days_until_march_31 ?? 0,
    currentRemainingVacationSeed:
      vacationSummary?.current_remaining_vacation_seed ?? localCurrentRemainingSeed,
    currentRemainingVacationSeedDate:
      vacationSummary?.current_remaining_vacation_seed_date ?? localCurrentRemainingSeedDate,
    approvedVacationDaysAfterSeed: vacationSummary?.approved_vacation_days_after_seed ?? 0,
    year: currentVacationYear,
  });
  const currentYearVacationOverrideValue =
    Number(localEmployee?.total_year_vacation_year ?? localEmployee?.vacation_days_override_year) === currentVacationYear
      ? (localEmployee?.total_year_vacation ?? localEmployee?.vacation_days_override)
      : '';
  const currentYearVacationOverrideSourceNormalized =
    currentYearVacationOverrideValue == null || currentYearVacationOverrideValue === ''
      ? ''
      : String(currentYearVacationOverrideValue);
  const currentYearVacationOverrideDraftNormalized = String(vacationDaysOverrideDraft ?? '').trim();
  const canSaveVacationDaysOverride =
    vacationDaysOverrideEditing &&
    currentYearVacationOverrideDraftNormalized !== currentYearVacationOverrideSourceNormalized &&
    !vacationDaysOverrideSaving;
  const currentYearRemainingVacationValue =
    Number(localEmployee?.current_remaining_vacation_year) === currentVacationYear
      ? normalizeWholeDaysDraftValue(localEmployee?.current_remaining_vacation)
      : '';
  const currentYearRemainingVacationDraftNormalized = normalizeWholeDaysDraftValue(currentVacationBalanceDraft);
  const canSaveCurrentVacationBalance =
    currentVacationBalanceEditing &&
    currentYearRemainingVacationDraftNormalized !== currentYearRemainingVacationValue &&
    !currentVacationBalanceSaving;
  const rescueSuggestedDate = createEmptyRescueDateDraft();
  const documentActionButtonBaseStyle = {
    minWidth: 92,
    borderRadius: 999,
    border: 'none',
    padding: '0.5rem 0.9rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, opacity 0.15s ease',
  };
  const documentViewButtonStyle = {
    ...documentActionButtonBaseStyle,
    background: isDark ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
    color: '#fff',
    boxShadow: isDark ? '0 10px 24px rgba(37, 99, 235, 0.3)' : '0 10px 20px rgba(59, 130, 246, 0.22)',
  };
  const documentDownloadButtonStyle = {
    ...documentActionButtonBaseStyle,
    background: isDark ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : 'linear-gradient(135deg, #14b8a6, #0f766e)',
    color: '#fff',
    boxShadow: isDark ? '0 10px 24px rgba(20, 184, 166, 0.28)' : '0 10px 20px rgba(20, 184, 166, 0.2)',
  };
  const documentDeleteButtonStyle = {
    ...documentActionButtonBaseStyle,
    background: isDark ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
    color: '#fff',
    boxShadow: isDark ? '0 10px 24px rgba(220, 38, 38, 0.28)' : '0 10px 20px rgba(239, 68, 68, 0.2)',
  };
  const isActive = typeof localEmployee?.is_active === 'boolean' ? localEmployee.is_active : (account?.isActive ?? false);
  const jobTitle = work?.jobTitle;
  const transportationId = work?.transportationId;

  const formatDate = (value) => {
    if (!value) return '—';
    const s = String(value);
    const iso = s.includes('T') ? s.split('T')[0] : s;
    if (!iso) return '—';
    return iso;
  };

  const renderLastMonthPayrollValue = (formatter, value) => (
    lastMonthPayrollLoading ? (
      <LoadingFiveDots isDark={isDark} />
    ) : formatter(value ?? 0)
  );
  const showLastMonthFullTimeCard = !lastMonthPayrollLoading && !areDisplayedHourValuesEqual(
    lastMonthPayrollCards?.workedHours,
    lastMonthPayrollCards?.fullTimeHours
  );

  const onFieldChange = (field, value) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const onNestedChange = (section, field, value) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            [section]: {
              ...(prev[section] || {}),
              [field]: value,
            },
          }
        : prev,
    );
  };

  const renderText = (label, value, onChange) => (
    <p>
      <strong>{label}</strong>{' '}
      {isEditing && onChange ? (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '60%' }}
        />
      ) : (
        value || '—'
      )}
    </p>
  );

  const renderLocalDate = (label, value, onChange) => (
    <p>
      <strong>{label}</strong>{' '}
      {isEditing && onChange ? (
        <input
          type="date"
          value={normalizeLocalDateInputValue(value)}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '60%' }}
        />
      ) : (
        formatDate(value) || '—'
      )}
    </p>
  );

  const handleStartEditing = () => {
    setError('');
    setDraft({
      ...employee,
      dspLocal: {
        fuehrerschein_aufstellungsdatum: '',
        fuehrerschein_aufstellungsbehoerde: '',
        whatsapp_number: '',
        ...(employee.dspLocal || {}),
      },
    });
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setDraft(employee);
    setIsEditing(false);
  };

  const handleSaveEditing = async () => {
    if (!draft) {
      setIsEditing(false);
      return;
    }
    if (kenjoEmployeeId) {
      setSaving(true);
      setError('');
      try {
        const nextPersonal = draft.personal ? { ...draft.personal, lastName: draft.lastName ?? draft.personal.lastName } : undefined;
        const nextWork = draft.work ? { ...draft.work } : undefined;
        const nextAddress = draft.address ? { ...draft.address } : undefined;
        const nextHome = draft.home ? { ...draft.home } : undefined;
        const nextFinancial = draft.financial ? { ...draft.financial } : undefined;
        await updateEmployeeProfileInKenjo(kenjoEmployeeId, {
          personal: nextPersonal && Object.keys(nextPersonal).length ? nextPersonal : undefined,
          work: nextWork && Object.keys(nextWork).length ? nextWork : undefined,
          address: nextAddress && Object.keys(nextAddress).length ? nextAddress : undefined,
          home: nextHome && Object.keys(nextHome).length ? nextHome : undefined,
          financial: nextFinancial && Object.keys(nextFinancial).length ? nextFinancial : undefined,
          dspLocal: draft.dspLocal || undefined,
        });
        setEmployee(draft);
        setError('');
        setIsEditing(false);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setSaving(false);
      }
    } else {
      setEmployee(draft);
      setIsEditing(false);
    }
  };

  const handleSaveInternalEditing = async () => {
    if (!draft || !kenjoEmployeeId) return;
    setInternalSaving(true);
    setError('');
    setInternalProfileModal(null);
    try {
      const nextDspLocal = {
        ...(draft.dspLocal || {}),
        fuehrerschein_aufstellungsdatum: normalizeLocalDateInputValue(
          draft?.dspLocal?.fuehrerschein_aufstellungsdatum,
        ),
      };
      await updateEmployeeInternalProfile(kenjoEmployeeId, {
        dspLocal: nextDspLocal,
      });
      const refreshedEmployee = await getKenjoEmployeeProfile(kenjoEmployeeId);
      const nextEmployee = {
        ...refreshedEmployee,
        dspLocal: {
          fuehrerschein_aufstellungsdatum: '',
          fuehrerschein_aufstellungsbehoerde: '',
          whatsapp_number: '',
          ...(refreshedEmployee?.dspLocal || {}),
        },
      };
      setEmployee(nextEmployee);
      setDraft(nextEmployee);
      setError('');
      setIsEditing(false);
      setInternalProfileModal({
        tone: 'success',
        title: 'Save successfully',
        message: 'Internal profile was saved successfully.',
      });
    } catch (e) {
      const message = String(e?.message || e);
      setError(message);
      setInternalProfileModal({
        tone: 'error',
        title: 'Save failed',
        message,
      });
    } finally {
      setInternalSaving(false);
    }
  };
  const currentContractStart = normalizeContractDate(localEmployee?.start_date || work?.startDate);
  const currentContractEnd = normalizeContractDate(localEmployee?.contract_end || work?.contractEnd);
  const normalizedContracts = sortContractTimelineRows(Array.isArray(contracts) ? contracts : []);
  const derivedCurrentContract = (() => {
    if (!normalizedContracts.length) {
      if (!currentContractStart) return null;
      return {
        id: 'current-derived',
        row_key: 'current-derived',
        source: 'current_profile',
        start_date: currentContractStart,
        end_date: currentContractEnd,
        isDerived: true,
      };
    }

    const latestStoredEffectiveEnd = normalizedContracts
      .map((row) => normalizeContractDate(row?.termination_date) || normalizeContractDate(row?.end_date))
      .filter(Boolean)
      .sort()
      .at(-1);

    if (!latestStoredEffectiveEnd) return null;

    const nextDerivedStart = addDaysToContractDate(latestStoredEffectiveEnd, 1);
    if (!nextDerivedStart) return null;
    if (currentContractEnd && nextDerivedStart > currentContractEnd) return null;
    if (currentContractEnd && latestStoredEffectiveEnd >= currentContractEnd) return null;
    if (
      normalizedContracts.some(
        (row) =>
          normalizeContractDate(row?.start_date) === nextDerivedStart &&
          (normalizeContractDate(row?.end_date) || null) === (currentContractEnd || null)
      )
    ) {
      return null;
    }

    return {
      id: 'current-derived',
      row_key: 'current-derived',
      source: 'current_profile',
      start_date: nextDerivedStart,
      end_date: currentContractEnd,
      isDerived: true,
    };
  })();

  const rawContractTimeline = sortContractTimelineRows(
    derivedCurrentContract ? [...normalizedContracts, derivedCurrentContract] : normalizedContracts
  );
  const currentContractRowIdentity = (() => {
    const activeRows = rawContractTimeline.filter((row) => !normalizeContractDate(row?.termination_date));
    const currentRow = activeRows.at(-1) || null;
    if (!currentRow) return null;
    return String(currentRow.row_key || `${currentRow.source || 'history'}-${currentRow.id ?? ''}`);
  })();
  let fixedContractOrdinal = 0;
  const contractTimeline = rawContractTimeline.map((row) => {
    const effectiveEndDate = normalizeContractDate(row?.termination_date) || normalizeContractDate(row?.end_date);
    const isUnlimited = !effectiveEndDate;
    const rowIdentity = String(row?.row_key || `${row?.source || 'history'}-${row?.id ?? ''}`);
    const isCurrentProfile = currentContractRowIdentity
      ? rowIdentity === currentContractRowIdentity
      : normalizeContractDate(row?.start_date) === currentContractStart &&
        normalizeContractDate(row?.end_date) === currentContractEnd;
    const contractNumber = isUnlimited ? null : ++fixedContractOrdinal;
    return {
      ...row,
      effectiveEndDate,
      isUnlimited,
      isCurrentProfile,
      canTerminate:
        isCurrentProfile &&
        !normalizeContractDate(row?.termination_date) &&
        !row?.isDerived &&
        row?.id != null,
      canDelete: !row?.isDerived && row?.id != null,
      contractNumber,
      label: isUnlimited
        ? contractUi.unlimitedLabel
        : contractNumber === 1
          ? contractUi.contractLabel
          : contractUi.contractExtensionLabel(contractNumber - 1),
    };
  });

  const fixedContractCount = contractTimeline.filter((row) => !row.isUnlimited).length;
  const hasUnlimitedContract = contractTimeline.some((row) => row.isUnlimited);
  const currentActiveContract =
    contractTimeline.find((row) => row.isCurrentProfile && !normalizeContractDate(row?.termination_date)) || null;
  const canOpenContractCreator = !hasUnlimitedContract;
  const canAddAnotherFixedContract = !hasUnlimitedContract && fixedContractCount < 4;
  const canAddUnlimitedContract = !hasUnlimitedContract && fixedContractCount >= 4;
  const nextFixedContractStartDate = (() => {
    const latestFixedWithEnd = [...contractTimeline]
      .filter((row) => !row.isUnlimited && normalizeContractDate(row?.end_date))
      .sort((a, b) => String(a?.end_date || '').localeCompare(String(b?.end_date || '')))
      .at(-1);
    return latestFixedWithEnd ? addDaysToContractDate(latestFixedWithEnd.end_date, 1) : '';
  })();
  const contractStartSummary = contractTimeline[0]?.start_date || currentContractStart;
  const contractEndSummary = (() => {
    if (hasUnlimitedContract) return contractUi.unlimitedLabel;
    const latestEnd = contractTimeline
      .map((row) => normalizeContractDate(row?.effectiveEndDate))
      .filter(Boolean)
      .sort()
      .at(-1);
    return latestEnd || currentContractEnd || '';
  })();
  const probationEndDate = addMonthsToContractDate(contractStartSummary, 6);
  const probationLabel =
    probationEndDate && probationEndDate < getTodayContractDate()
      ? 'Probation expired on'
      : 'Probation until';
  const probationDisplayValue = probationEndDate ? formatDateDayMonthYear(probationEndDate) : '';

  const openDeactivateConfirm = () => {
    setDeactivateError('');
    setShowDeactivateConfirm(true);
  };

  const closeDeactivateConfirm = () => {
    setShowDeactivateConfirm(false);
  };

  const onDeactivateConfirmYes = () => {
    setShowDeactivateConfirm(false);
    setDeactivateDate('');
    setDeactivateReason('');
    setDeactivateError('');
    setShowDeactivateForm(true);
  };

  const closeDeactivateForm = () => {
    setShowDeactivateForm(false);
    setDeactivateDate('');
    setDeactivateReason('');
    setDeactivateError('');
  };

  const submitDeactivate = async () => {
    if (!kenjoEmployeeId) return;
    const termDate = deactivateDate.trim() ? deactivateDate.trim().slice(0, 10) : null;
    if (!termDate) {
      setDeactivateError('Please select a termination date.');
      return;
    }
    setDeactivating(true);
    setDeactivateError('');
    try {
      await deactivateEmployeeInKenjo(kenjoEmployeeId, {
        terminationDate: termDate,
        reason: deactivateReason.trim() || null,
      });
      const updated = await getKenjoEmployeeProfile(kenjoEmployeeId);
      setEmployee(updated);
      closeDeactivateForm();
    } catch (e) {
      setDeactivateError(String(e?.message || e));
    } finally {
      setDeactivating(false);
    }
  };

  const closeContractModal = () => {
    setContractModal(null);
  };

  const closeDeleteContractModal = () => {
    if (contractDeleting) return;
    setDeleteContractTarget(null);
  };

  const closeTerminateContractModal = () => {
    setTerminateContractTarget(null);
    setTerminateContractDraft({
      terminationDate: '',
      terminationType: '',
      terminationInitiator: '',
      file: null,
    });
    setTerminateContractError('');
    if (terminateContractFileInputRef.current) {
      terminateContractFileInputRef.current.value = '';
    }
  };

  const openTerminateContractModal = (row) => {
    setTerminateContractTarget(row);
    setTerminateContractDraft({
      terminationDate: row?.effectiveEndDate || '',
      terminationType: '',
      terminationInitiator: '',
      file: null,
    });
    setTerminateContractError('');
  };

  const openDeleteContractModal = (row) => {
    if (!row) return;
    setDeleteContractTarget(row);
  };

  const closeContractForm = () => {
    setShowContractForm(false);
    setContractDraft({ startDate: '', endDate: '', type: 'fixed' });
    setContractError('');
    setEditingContractTarget(null);
    setContractUploadFile(null);
    setShowSetPermanentConfirm(false);
    if (contractFileInputRef.current) {
      contractFileInputRef.current.value = '';
    }
  };

  const openContractForm = () => {
    if (!canOpenContractCreator) return;
    const defaultType = canAddAnotherFixedContract ? 'fixed' : 'unlimited';
    setContractError('');
    setEditingContractTarget(null);
    setContractUploadFile(null);
    setShowSetPermanentConfirm(false);
    setShowContractForm(true);
    setContractDraft({
      startDate: nextFixedContractStartDate || currentContractStart || '',
      endDate: '',
      type: defaultType,
    });
  };

  const openEditContractForm = (row) => {
    if (!row) return;
    setContractError('');
    setEditingContractTarget({
      id: row.id ?? null,
      source: row.source || 'history',
      mode: row.isDerived ? 'create_from_derived' : 'update_existing',
      rowKey: row.row_key || row.id,
      canSetAsPermanent:
        Boolean(row?.isCurrentProfile) &&
        !Boolean(row?.isUnlimited) &&
        !normalizeContractDate(row?.termination_date),
    });
    setContractUploadFile(null);
    setShowSetPermanentConfirm(false);
    setShowContractForm(true);
    setContractDraft({
      startDate: normalizeContractDate(row?.start_date) || '',
      endDate: normalizeContractDate(row?.end_date) || '',
      type: row?.isUnlimited ? 'unlimited' : 'fixed',
    });
  };

  const saveContract = async () => {
    if (!employeeDocRef) {
      setContractError(contractUi.missingEmployeeRef);
      return;
    }
    if (!contractDraft.startDate) {
      setContractError(contractUi.chooseStartDate);
      return;
    }
    if (contractDraft.type !== 'unlimited' && !contractDraft.endDate) {
      setContractError(contractUi.chooseDates);
      return;
    }
    setContractSaving(true);
    setContractError('');
    setEmployeeDocError('');
    try {
      const isUpdatingExistingContract =
        editingContractTarget && editingContractTarget.mode !== 'create_from_derived';
      let saved = isUpdatingExistingContract
        ? await updateEmployeeContract(employeeDocRef, editingContractTarget.id, {
            source: editingContractTarget.source,
            startDate: contractDraft.startDate,
            endDate: contractDraft.type === 'unlimited' ? null : contractDraft.endDate,
          })
        : await addEmployeeContract(employeeDocRef, {
            startDate: contractDraft.startDate,
            endDate: contractDraft.type === 'unlimited' ? null : contractDraft.endDate,
          });
      setContracts((prev) => {
        const nextRows = isUpdatingExistingContract
          ? (prev || []).map((row) =>
              row?.id === editingContractTarget.id && row?.source === editingContractTarget.source ? saved : row
            )
          : [...(prev || []), saved];
        return sortContractTimelineRows(nextRows.filter(Boolean));
      });
      let contractDocumentUploadError = '';
      if (contractUploadFile && saved?.id != null) {
        setContractFileUploading(true);
        try {
          saved = await uploadEmployeeContractDocument(
            employeeDocRef,
            saved.id,
            saved.source || editingContractTarget?.source || 'history',
            contractUploadFile
          );
          const refreshed = await getEmployeeDocuments(employeeDocRef);
          setEmployeeDocs(Array.isArray(refreshed) ? refreshed : []);
          setShowEmployeeDocsList(true);
          setEmployeeDocType('Vertrag');
          setEmployeeDocsFilterType('Vertrag');
          setContracts((prev) =>
            sortContractTimelineRows(
              (prev || []).map((row) =>
                row?.id === saved.id && row?.source === saved.source ? { ...row, ...saved } : row
              ).filter(Boolean)
            )
          );
        } catch (uploadError) {
          contractDocumentUploadError = String(uploadError?.message || uploadError);
        } finally {
          setContractFileUploading(false);
        }
      }
      const refreshedEmployee = await getEmployee(employeeDocRef).catch(() => null);
      if (refreshedEmployee) {
        setLocalEmployee(refreshedEmployee);
      }
      closeContractForm();
      if (contractDocumentUploadError) {
        setContractModal({
          title: contractUi.save,
          message: contractUi.uploadPartialSuccess(contractDocumentUploadError),
        });
      } else if (contractUploadFile) {
        setContractModal({
          title: contractUi.save,
          message: contractUi.uploadSuccess,
        });
      }
    } catch (e) {
      const message = String(e?.message || e);
      setContractError(message);
      if (contractUploadFile || editingContractTarget) {
        setContractModal({
          title: contractUi.saveErrorTitle,
          message,
        });
      }
    } finally {
      setContractSaving(false);
      setContractFileUploading(false);
    }
  };

  const handleUploadNewContractClick = () => {
    if (!employeeDocRef) {
      setContractError(contractUi.missingEmployeeRef);
      return;
    }
    contractFileInputRef.current?.click();
  };

  const handleUploadTerminationDocumentClick = () => {
    terminateContractFileInputRef.current?.click();
  };

  const handleTerminateContractFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setTerminateContractDraft((prev) => ({ ...prev, file }));
  };

  const handleContractFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    setContractUploadFile(file);
    if (file) {
      setContractError('');
    }
  };

  const openSetPermanentConfirm = () => {
    if (!editingContractTarget?.canSetAsPermanent || contractDraft.type === 'unlimited') return;
    setShowSetPermanentConfirm(true);
  };

  const closeSetPermanentConfirm = () => {
    if (contractSaving) return;
    setShowSetPermanentConfirm(false);
  };

  const confirmSetAsPermanent = () => {
    setContractDraft((prev) => ({
      ...prev,
      type: 'unlimited',
      endDate: '',
    }));
    setContractError('');
    setShowSetPermanentConfirm(false);
  };

  const confirmDeleteContract = async () => {
    if (!employeeDocRef || !deleteContractTarget) {
      setContractError(contractUi.missingEmployeeRef);
      return;
    }
    setContractDeleting(true);
    setContractError('');
    try {
      await deleteEmployeeContractRecord(
        employeeDocRef,
        deleteContractTarget.id,
        deleteContractTarget.source || 'history'
      );
      const refreshedContracts = await getEmployeeContracts(employeeDocRef).catch(() => []);
      setContracts(Array.isArray(refreshedContracts) ? refreshedContracts : []);
      const refreshedDocs = await getEmployeeDocuments(employeeDocRef).catch(() => []);
      setEmployeeDocs(Array.isArray(refreshedDocs) ? refreshedDocs : []);
      const refreshedEmployee = await getEmployee(employeeDocRef).catch(() => null);
      if (refreshedEmployee) {
        setLocalEmployee(refreshedEmployee);
      }
      setDeleteContractTarget(null);
      setContractModal({
        title: contractUi.deleteContractTitle,
        message: contractUi.deleteContractSuccess,
      });
    } catch (e) {
      const message = String(e?.message || e);
      setContractError(message);
      setDeleteContractTarget(null);
      setContractModal({
        title: contractUi.deleteErrorTitle,
        message,
      });
    } finally {
      setContractDeleting(false);
    }
  };

  const saveTerminatedContract = async () => {
    if (!employeeDocRef || !terminateContractTarget) {
      setTerminateContractError(contractUi.missingEmployeeRef);
      return;
    }
    if (!terminateContractDraft.terminationDate) {
      setTerminateContractError(contractUi.chooseTerminationDate);
      return;
    }
    if (!terminateContractDraft.terminationType) {
      setTerminateContractError(contractUi.chooseTerminationType);
      return;
    }
    if (
      terminateContractDraft.terminationType === 'ordinary' &&
      !terminateContractDraft.terminationInitiator
    ) {
      setTerminateContractError(contractUi.chooseOrdinaryInitiator);
      return;
    }
    setTerminateContractSaving(true);
    setTerminateContractError('');
    try {
      const saved = await terminateEmployeeContract(employeeDocRef, {
        contractStartDate: terminateContractTarget.start_date,
        contractEndDate: terminateContractTarget.end_date ?? null,
        terminationDate: terminateContractDraft.terminationDate,
        terminationType: terminateContractDraft.terminationType,
        terminationInitiator:
          terminateContractDraft.terminationType === 'ordinary'
            ? terminateContractDraft.terminationInitiator
            : null,
        file: terminateContractDraft.file,
      });
      if (terminateContractDraft.file) {
        const refreshedDocs = await getEmployeeDocuments(employeeDocRef);
        setEmployeeDocs(Array.isArray(refreshedDocs) ? refreshedDocs : []);
      }
      const refreshedEmployee = await getEmployee(employeeDocRef).catch(() => null);
      if (refreshedEmployee) {
        setLocalEmployee(refreshedEmployee);
      }
      setContracts((prev) => sortContractTimelineRows([...(prev || []).filter((row) => row?.id !== saved?.id), saved].filter(Boolean)));
      closeTerminateContractModal();
      setContractModal({
        title: contractUi.saveTermination,
        message: contractUi.terminationSaved,
      });
    } catch (e) {
      setTerminateContractError(String(e?.message || e));
    } finally {
      setTerminateContractSaving(false);
    }
  };

  const monthOptions = (() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      list.push({ value: key, label: `${monthNames[d.getMonth()]} ${y}` });
    }
    return list;
  })();

  const openAdvanceDialog = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setAdvanceMonth(`${y}-${m}`);
    setAdvanceLines([{ amount: '', code_comment: '' }, { amount: '', code_comment: '' }, { amount: '', code_comment: '' }]);
    setAdvanceError('');
    setShowAdvanceDialog(true);
  };

  const closeAdvanceDialog = () => {
    setShowAdvanceDialog(false);
    setAdvanceError('');
  };

  const openDaPerformance = () => {
    setShowDaPerformance(true);
    setShowDaPerformanceGraph(false);
    setKpiError('');
    setKpiRows([]);
  };

  const setAdvanceLine = (index, field, value) => {
    setAdvanceLines((prev) => {
      const next = prev.slice();
      next[index] = { ...(next[index] || {}), [field]: value };
      return next;
    });
  };

  const submitAdvance = async () => {
    if (!kenjoEmployeeId || !advanceMonth) return;
    setAdvanceSaving(true);
    setAdvanceError('');
    try {
      await saveAdvances(kenjoEmployeeId, advanceMonth, advanceLines);
      closeAdvanceDialog();
    } catch (e) {
      setAdvanceError(String(e?.message || e));
    } finally {
      setAdvanceSaving(false);
    }
  };

  const contractEndDisplayValue =
    contractEndSummary === contractUi.unlimitedLabel ? contractUi.unlimitedLabel : formatDate(contractEndSummary);

  const rescueSection = (
    <div style={employeeSectionStyle}>
      <h3 style={tabHeadingStyle}>Rescue</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>
          {visibleRescues.length} shown
        </span>
        {kenjoEmployeeId ? (
          <button type="button" className="btn-secondary" onClick={openRescueModal} disabled={rescueSaving}>
            Add Rescue
          </button>
        ) : null}
      </div>
      {rescuesLoading ? (
        <p style={{ margin: '0.35rem 0 0', color: employeeMutedTextStyle.color }}>Loading rescues...</p>
      ) : null}
      {rescueError ? (
        <p className="error-text" style={{ margin: '0.35rem 0 0' }}>{rescueError}</p>
      ) : null}
      {!rescuesLoading && visibleRescues.length > 0 ? (
        <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.45rem' }}>
          {visibleRescues.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '0.5rem',
                alignItems: 'center',
                padding: '0.65rem 0.8rem',
                border: isDark ? '1px solid rgba(132, 162, 214, 0.24)' : '1px solid #d8dde6',
                borderRadius: 10,
                background: isDark ? 'rgba(14, 29, 50, 0.94)' : '#f8fafc',
              }}
            >
              <span>{formatDate(row.rescue_date)}</span>
              <strong>{Number(row?.amount || 0).toFixed(2)} EUR</strong>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => removeRescue(row.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : !rescuesLoading ? (
        <p style={{ margin: '0.35rem 0 0', color: employeeMutedTextStyle.color }}>No rescues in current or last month.</p>
      ) : null}
    </div>
  );

  const overviewContent = (
    <>
      <div style={employeeSectionStyle}>
        <h3 style={tabHeadingStyle}>Overview</h3>
        <div className="grid two-columns">
          <div>
            {renderText('Status', isActive ? 'Active' : 'Inactive')}
            {renderText('Job title', jobTitle)}
            {renderText('Start date', formatDate(contractStartSummary))}
            {renderText('Contract end', contractEndDisplayValue)}
          </div>
          <div>
            {renderText('Personal Nr.', work?.employeeNumber || externalId, (v) => onNestedChange('work', 'employeeNumber', v))}
            {renderText(
              'Manager',
              work?.managerName || employee?.manager?.displayName,
              (v) => onNestedChange('work', 'managerName', v),
            )}
            {renderText('Email', email || personal?.email || account?.email, (v) => onFieldChange('email', v))}
            {renderText(
              'Mobile Phone',
              personal?.mobile || home?.personalMobile,
              (v) => onNestedChange('personal', 'mobile', v),
            )}
            {renderText(
              'WhatsApp number',
              current?.dspLocal?.whatsapp_number,
              (v) =>
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        dspLocal: { ...(prev.dspLocal || {}), whatsapp_number: v },
                      }
                    : prev,
                ),
            )}
          </div>
        </div>
      </div>
      {rescueSection}
    </>
  );

  const employmentContent = (
    <div style={employeeSectionStyle}>
      <h3 style={tabHeadingStyle}>Employment</h3>
      <div className="grid two-columns">
        <div>
          {renderText('Status', isActive ? 'Active' : 'Inactive')}
          {renderText('Job title', jobTitle, (v) => onNestedChange('work', 'jobTitle', v))}
          {renderText('Start date', formatDate(contractStartSummary))}
          {renderText('Personal Nr.', work?.employeeNumber || externalId, (v) => onNestedChange('work', 'employeeNumber', v))}
          {renderText(
            'Manager',
            work?.managerName || employee?.manager?.displayName,
            (v) => onNestedChange('work', 'managerName', v),
          )}
        </div>
        <div>
          {renderText('Weekly hours', work?.weeklyHours, (v) => onNestedChange('work', 'weeklyHours', v))}
          {renderText(probationLabel, probationDisplayValue)}
          {renderText('Language', account?.language)}
          {renderText('Contract end', contractEndDisplayValue)}
        </div>
      </div>

      <p style={{ margin: '0.75rem 0 0.5rem', color: employeeMutedTextStyle.color, fontSize: '0.85rem' }}>
        {contractUi.managedSummaryHint}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: contractTimeline.length || showContractForm || contractError ? '0.5rem' : 0,
        }}
      >
        {canOpenContractCreator ? (
          <button type="button" className="btn-primary" onClick={openContractForm} disabled={contractSaving}>
            {contractUi.addContractButton}
          </button>
        ) : null}
        {currentActiveContract ? (
          <button
            type="button"
            onClick={() => openTerminateContractModal(currentActiveContract)}
            disabled={terminateContractSaving}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '0.6rem 1rem',
              background: '#dc2626',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {contractUi.terminateCurrentButton}
          </button>
        ) : null}
        <span style={{ color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>{fixedContractCount}/4</span>
      </div>

      <p style={{ margin: '0.25rem 0 0.2rem' }}>
        <strong>{contractUi.historyTitle}</strong>
      </p>
      <p style={{ margin: '0 0 0.45rem', color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>
        {contractUi.historyHint}
      </p>
      {contractsLoading ? <p style={{ margin: '0.25rem 0 0', color: employeeMutedTextStyle.color }}>{contractUi.loading}</p> : null}
      {!showContractForm && contractError ? <p className="error-text" style={{ margin: '0.25rem 0 0' }}>{contractError}</p> : null}
      {contractTimeline.map((row) => (
        <div
          key={row.row_key || row.id}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: '0.35rem 0.75rem',
            padding: '0.65rem 0.8rem',
            border: isDark ? '1px solid rgba(132, 162, 214, 0.3)' : '1px solid #d8dde6',
            borderRadius: 10,
            background: isDark ? 'rgba(10, 20, 37, 0.84)' : '#f8fafc',
            marginTop: '0.5rem',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong>{row.label}</strong>
            {row.isCurrentProfile ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.1rem 0.45rem',
                  borderRadius: 999,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: isDark ? '#dbeafe' : '#1d4ed8',
                  background: isDark ? 'rgba(37, 99, 235, 0.2)' : 'rgba(59, 130, 246, 0.12)',
                }}
              >
                {contractUi.currentBadge}
              </span>
            ) : null}
            {row.termination_date ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.1rem 0.45rem',
                  borderRadius: 999,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#fff',
                  background: '#dc2626',
                }}
              >
                {contractUi.terminationBadge}
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <span>
              {row.isUnlimited
                ? `${formatDateDayMonthYear(row.start_date)} - ${contractUi.unlimitedLabel}`
                : `${formatDateDayMonthYear(row.start_date)} - ${formatDateDayMonthYear(row.effectiveEndDate)}`}
            </span>
            {row.id != null || row.isDerived ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => openEditContractForm(row)}
                disabled={contractSaving}
              >
                {contractUi.editContractDateButton}
              </button>
            ) : null}
            {row.canDelete ? (
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => openDeleteContractModal(row)}
                disabled={contractDeleting}
              >
                {contractUi.deleteContractButton}
              </button>
            ) : null}
            {row.canTerminate ? (
              <button
                type="button"
                onClick={() => openTerminateContractModal(row)}
                style={{
                  border: 'none',
                  borderRadius: 999,
                  padding: '0.45rem 0.85rem',
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {contractUi.terminateButton}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );

  const timeOffContent = (
    <div style={employeeSectionStyle}>
      <h3 style={tabHeadingStyle}>Time Off</h3>
      <p style={{ margin: '0 0 0.35rem' }}>
        <strong>Total year vacation ({currentVacationYear})</strong>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 180px) auto', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={vacationDaysOverrideDraft}
          onChange={(e) => setVacationDaysOverrideDraft(e.target.value)}
          placeholder={String(vacationSummary?.default_total_year_vacation || 20)}
          disabled={!vacationDaysOverrideEditing}
          style={{ padding: '0.5rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifySelf: 'start', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setVacationDaysOverrideEditing(true);
              setVacationDaysOverrideError('');
            }}
            disabled={vacationDaysOverrideSaving}
            style={{ width: 'fit-content', minWidth: 96 }}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={saveVacationDaysOverride}
            disabled={!canSaveVacationDaysOverride}
            style={{ width: 'fit-content', minWidth: 96 }}
          >
            {vacationDaysOverrideSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <p style={{ margin: '0.85rem 0 0.35rem', color: isDark ? '#d7e5ff' : '#111827', fontWeight: 600 }}>
        {timeOffUi.currentRemainingLabel}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 180px) auto', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="number"
          min="0"
          step="1"
          value={currentVacationBalanceDraft}
          onChange={(e) => setCurrentVacationBalanceDraft(normalizeWholeDaysDraftValue(e.target.value))}
          placeholder={formatWholeDaysValue(vacationBalance.remainingVacationDays)}
          disabled={!currentVacationBalanceEditing}
          style={{ padding: '0.5rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifySelf: 'start', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setCurrentVacationBalanceEditing(true);
              setCurrentVacationBalanceError('');
            }}
            disabled={currentVacationBalanceSaving}
            style={{ width: 'fit-content', minWidth: 96 }}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={saveCurrentVacationBalance}
            disabled={!canSaveCurrentVacationBalance}
            style={{ width: 'fit-content', minWidth: 96 }}
          >
            {currentVacationBalanceSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <p style={{ margin: '0.45rem 0 0', color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>
        Standard entitlement is 20 days. Carry over from the previous year is added first and expires after 31.03 if unused.
      </p>
      <p style={{ margin: '0.35rem 0 0', color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>
        {timeOffUi.currentRemainingHint}
      </p>
      {vacationBalance.seedApplied ? (
        <p style={{ margin: '0.35rem 0 0', color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>
          {timeOffUi.currentRemainingSeedInfo(formatDate(vacationBalance.seedDateIso))}
        </p>
      ) : null}
      {vacationDaysOverrideError ? (
        <p className="error-text" style={{ margin: '0.35rem 0 0' }}>{vacationDaysOverrideError}</p>
      ) : null}
      {currentVacationBalanceError ? (
        <p className="error-text" style={{ margin: '0.35rem 0 0' }}>{currentVacationBalanceError}</p>
      ) : null}
      {vacationSummaryError ? (
        <p className="error-text" style={{ margin: '0.35rem 0 0' }}>{vacationSummaryError}</p>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <button type="button" className="btn-secondary" onClick={() => openTimeOffHistoryModal('vacation')}>
          {timeOffUi.vacationHistoryButton}
        </button>
        <button type="button" className="btn-secondary" onClick={() => openTimeOffHistoryModal('sick')}>
          {timeOffUi.sicknessHistoryButton}
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0.5rem',
          marginTop: '0.75rem',
        }}
      >
        <div style={employeeSectionStyle}>
          <div style={{ fontSize: '0.82rem', color: employeeMutedTextStyle.color, marginBottom: '0.2rem' }}>Carry over days</div>
          <strong>{formatDaysValue(vacationBalance.carryOver)}</strong>
        </div>
        <div style={employeeSectionStyle}>
          <div style={{ fontSize: '0.82rem', color: employeeMutedTextStyle.color, marginBottom: '0.2rem' }}>Used vacation ({currentVacationYear})</div>
          <strong>{vacationSummaryLoading ? '...' : formatDaysValue(vacationBalance.usedYear)}</strong>
        </div>
        <div style={employeeSectionStyle}>
          <div style={{ fontSize: '0.82rem', color: employeeMutedTextStyle.color, marginBottom: '0.2rem' }}>Remaining vacation</div>
          <strong>{vacationSummaryLoading ? '...' : formatWholeDaysValue(vacationBalance.remainingVacationDays)}</strong>
        </div>
        {vacationBalance.seedApplied ? (
          <div style={employeeSectionStyle}>
            <div style={{ fontSize: '0.82rem', color: employeeMutedTextStyle.color, marginBottom: '0.2rem' }}>Starting balance</div>
            <strong>{vacationSummaryLoading ? '...' : formatWholeDaysValue(vacationBalance.seedStartingBalance)}</strong>
            <div style={{ marginTop: '0.25rem', color: employeeMutedTextStyle.color, fontSize: '0.82rem' }}>
              {vacationSummaryLoading ? '...' : formatDate(vacationBalance.seedDateIso)}
            </div>
          </div>
        ) : (
          <div style={employeeSectionStyle}>
            <div style={{ fontSize: '0.82rem', color: employeeMutedTextStyle.color, marginBottom: '0.2rem' }}>
              {vacationBalance.afterCarryDeadline ? 'Carry over expired' : `Carry over valid until ${vacationBalance.carryDeadlineIso}`}
            </div>
            <strong>
              {vacationSummaryLoading
                ? '...'
                : formatDaysValue(
                    vacationBalance.afterCarryDeadline
                      ? vacationBalance.carryExpired
                      : vacationBalance.carryAvailableNow
                  )}
            </strong>
          </div>
        )}
      </div>
    </div>
  );

  const profileContent = (
    <>
      <div style={employeeSectionStyle}>
        <h3 style={tabHeadingStyle}>Personal & Contact</h3>
        <div className="grid two-columns">
          <div>
            {renderText('First Name', firstName)}
            {renderText('Last Name', lastName, (v) => onFieldChange('lastName', v))}
            {renderText('Email', email || personal?.email || account?.email, (v) => onFieldChange('email', v))}
            {renderText('Birth day', formatDate(personal?.birthdate))}
            {renderText(
              'Address',
              address
                ? [address.streetName, address.houseNumber, address.addressLine1].filter(Boolean).join(' ')
                : '',
              (v) => {
                const parts = String(v || '').split(' ');
                onNestedChange('address', 'streetName', parts[0] || '');
              },
            )}
            {renderText(
              'Postal code',
              address?.postalCode || address?.zip,
              (v) => onNestedChange('address', 'postalCode', v),
            )}
            {renderText('City', address?.city, (v) => onNestedChange('address', 'city', v))}
            {renderText('Country', address?.country, (v) => onNestedChange('address', 'country', v))}
          </div>
          <div>
            {renderText('Marital status', home?.maritalStatus, (v) => onNestedChange('home', 'maritalStatus', v))}
            {renderText(
              'Mobile Phone',
              personal?.mobile || home?.personalMobile,
              (v) => onNestedChange('personal', 'mobile', v),
            )}
            {renderText('Work Mobile', work?.workMobile)}
            {renderText(
              'WhatsApp number',
              current?.dspLocal?.whatsapp_number,
              (v) =>
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        dspLocal: { ...(prev.dspLocal || {}), whatsapp_number: v },
                      }
                    : prev,
                ),
            )}
            {renderText('Language', account?.language)}
            {renderText('Gender', personal?.gender, (v) => onNestedChange('personal', 'gender', v))}
            {renderText('Nationality', personal?.nationality)}
            {renderText('Transporter ID', transportationId)}
          </div>
        </div>
      </div>
      <div style={employeeSectionStyle}>
        <h3 style={tabHeadingStyle}>Financial & Custom</h3>
        <div className="grid two-columns">
          <div>
            {renderText('Bank name', financial?.bankName, (v) => onNestedChange('financial', 'bankName', v))}
            {renderText(
              'Name on card',
              financial?.accountHolderName || financial?.nameOnCard,
              (v) => onNestedChange('financial', 'accountHolderName', v),
            )}
            {renderText('IBAN', financial?.iban, (v) => onNestedChange('financial', 'iban', v))}
            {renderText('Steuer ID', financial?.steuerId || financial?.taxIdentificationNumber || financial?.taxNumber)}
            {renderText('SV-number', financial?.nationalInsuranceNumber || financial?.socialInsuranceNumber)}
            {renderText('Children', Array.isArray(home?.children) ? String(home.children.length) : '')}
            {renderText(
              'Child names',
              Array.isArray(home?.children) && home.children.length
                ? home.children
                    .map((ch) =>
                      [ch.childFirstName, ch.childLastName, ch.firstName, ch.lastName, ch.name]
                        .filter(Boolean)
                        .join(' '),
                    )
                    .filter(Boolean)
                    .join(', ')
                : '',
            )}
          </div>
          <div>
            {renderLocalDate(
              'Führerschein Aufstellungsdatum',
              current?.dspLocal?.fuehrerschein_aufstellungsdatum,
              (v) =>
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        dspLocal: { ...(prev.dspLocal || {}), fuehrerschein_aufstellungsdatum: v },
                      }
                    : prev,
                ),
            )}
            {renderText(
              'Führerschein Aufstellungsbehörde',
              current?.dspLocal?.fuehrerschein_aufstellungsbehoerde,
              (v) =>
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        dspLocal: { ...(prev.dspLocal || {}), fuehrerschein_aufstellungsbehoerde: v },
                      }
                    : prev,
                ),
            )}
            {Array.isArray(current.customFields) &&
              current.customFields.length > 0 &&
              current.customFields.map((f) => {
                const name = f.name || f.label || f.fieldLabel || f.displayName || '—';
                const type = (f.type || f.fieldType || '').toString().toLowerCase();
                const rawValue = f.value;
                let displayValue = '—';
                if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
                  if (Array.isArray(rawValue)) {
                    displayValue = rawValue
                      .map((v) =>
                        v && typeof v === 'object'
                          ? v.label || v.name || v.value || JSON.stringify(v)
                          : String(v),
                      )
                      .join(', ');
                  } else if (typeof rawValue === 'boolean' || type === 'boolean') {
                    displayValue = rawValue ? 'Yes' : 'No';
                  } else if (type === 'date') {
                    displayValue = formatDate(rawValue);
                  } else if (type === 'number') {
                    const num = Number(rawValue);
                    displayValue = Number.isFinite(num) ? String(num) : String(rawValue);
                  } else if (rawValue && typeof rawValue === 'object') {
                    displayValue = rawValue.label || rawValue.name || rawValue.value || JSON.stringify(rawValue);
                  } else {
                    displayValue = String(rawValue);
                  }
                }
                return renderText(name, displayValue);
              })}
          </div>
        </div>
      </div>
    </>
  );

  const performanceContent = (
    <>
      <div style={employeeSectionStyle}>
        <h3 style={tabHeadingStyle}>Performance</h3>
        <p style={{ margin: '0 0 0.75rem', color: employeeMutedTextStyle.color }}>
          Use the tools below to review KPI history, leave DA comments, and manage PAVE sessions for this employee.
        </p>
        {kenjoEmployeeId ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={openDaPerformance}>
              DA Performance
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={openKpiCommentFromMain}
              disabled={kpiLoading}
            >
              Add comment
            </button>
            <Link to={`/pave/new?driver_id=${encodeURIComponent(kenjoEmployeeId)}`} className="btn-secondary">Create PAVE Session</Link>
            <Link to={`/pave?driver_id=${encodeURIComponent(kenjoEmployeeId)}`} className="btn-secondary">View PAVE History</Link>
          </div>
        ) : (
          <p style={{ margin: 0, color: employeeMutedTextStyle.color }}>Performance tools are available after the employee is linked to Kenjo.</p>
        )}
      </div>
      {kenjoEmployeeId ? (
        <div style={employeeSectionStyle}>
          <h3 style={tabHeadingStyle}>PAVE Summary</h3>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Last:{' '}
            {paveSessions[0] ? (
              <>
                Grade <strong>{paveSessions[0].overall_grade ?? '—'}</strong>,{' '}
                {paveSessions[0].inspect_ended_at ? new Date(paveSessions[0].inspect_ended_at).toLocaleDateString() : '—'}
              </>
            ) : '—'}
          </p>
          <p style={{ margin: '0.5rem 0 0', color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>
            Total completed: <strong>{paveSessions.filter((s) => s.status === 'COMPLETE').length}</strong>
            {' · '}
            Expired: <strong>{paveSessions.filter((s) => s.status === 'EXPIRED').length}</strong>
          </p>
        </div>
      ) : null}
    </>
  );

  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{fullName}</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isEditing ? (
            <>
              <button type="button" className="btn-secondary" onClick={handleCancelEditing} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSaveInternalEditing}
                disabled={saving || internalSaving || !kenjoEmployeeId}
              >
                {internalSaving ? 'Saving…' : 'Save internal'}
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveEditing} disabled={saving}>
                {saving ? 'Saving…' : 'Save and send to Kenjo'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary" onClick={handleStartEditing}>
                Edit
              </button>
              {activeTab === 'overview' && kenjoEmployeeId && (
                  <button type="button" className="btn-secondary employee-profile-toolbar-btn" onClick={openAdvanceDialog}>
                    Add Advance
                  </button>
                )}
              {activeTab === 'overview' && kenjoEmployeeId && (
                  <button type="button" className="btn-secondary employee-profile-toolbar-btn" onClick={openRescueModal} disabled={rescueSaving}>
                    Add Rescue
                  </button>
                )}
              {activeTab === 'performance' && kenjoEmployeeId && (
                  <button type="button" className="btn-secondary employee-profile-toolbar-btn" onClick={openDaPerformance}>
                    DA Performance
                  </button>
                )}
              {activeTab === 'performance' && kenjoEmployeeId && (
                  <button
                    type="button"
                    className="btn-secondary employee-profile-toolbar-btn"
                    onClick={openKpiCommentFromMain}
                    disabled={kpiLoading}
                  >
                    Add comment
                  </button>
                )}
              {activeTab === 'performance' && kenjoEmployeeId && (
                <>
                  <Link to={`/pave/new?driver_id=${encodeURIComponent(kenjoEmployeeId)}`} className="btn-secondary employee-profile-toolbar-btn">Create PAVE Session</Link>
                  <Link to={`/pave?driver_id=${encodeURIComponent(kenjoEmployeeId)}`} className="btn-secondary employee-profile-toolbar-btn">View PAVE History</Link>
                </>
              )}
              {activeTab === 'employment' && kenjoEmployeeId && isActive && (
                <button type="button" className="btn-secondary btn-danger" onClick={openDeactivateConfirm}>
                  Deactivate employee
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {kenjoEmployeeId && activeTab === 'overview' && (
        <div
          style={{
            marginTop: '1rem',
            marginBottom: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.55rem',
          }}
        >
          <div className="card" style={{ margin: 0, padding: '0.68rem 0.78rem' }}>
            <div style={{ fontSize: '0.78rem', color: isDark ? '#9bb0d1' : '#6b7280' }}>Worked Hours (Last Month)</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{renderLastMonthPayrollValue(formatHours, lastMonthPayrollCards?.workedHours)}</div>
          </div>
          {showLastMonthFullTimeCard && (
            <div className="card" style={{ margin: 0, padding: '0.68rem 0.78rem' }}>
              <div style={{ fontSize: '0.78rem', color: isDark ? '#9bb0d1' : '#6b7280' }}>Full Time (Last Month)</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{renderLastMonthPayrollValue(formatHours, lastMonthPayrollCards?.fullTimeHours)}</div>
            </div>
          )}
          <div className="card" style={{ margin: 0, padding: '0.68rem 0.78rem' }}>
            <div style={{ fontSize: '0.78rem', color: isDark ? '#9bb0d1' : '#6b7280' }}>Overtime (Last Month)</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{renderLastMonthPayrollValue(formatHours, lastMonthPayrollCards?.overtimeHours)}</div>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.68rem 0.78rem' }}>
            <div style={{ fontSize: '0.78rem', color: isDark ? '#9bb0d1' : '#6b7280' }}>Verpfl. mehr. (Last Month)</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{renderLastMonthPayrollValue(formatCurrency, lastMonthPayrollCards?.verpflMehr)}</div>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.68rem 0.78rem' }}>
            <div style={{ fontSize: '0.78rem', color: isDark ? '#9bb0d1' : '#6b7280' }}>Fahrt. Geld (Last Month)</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{renderLastMonthPayrollValue(formatCurrency, lastMonthPayrollCards?.fahrtGeld)}</div>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.68rem 0.78rem' }}>
            <div style={{ fontSize: '0.78rem', color: isDark ? '#9bb0d1' : '#6b7280' }}>Krankgeld (Last Month)</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{renderLastMonthPayrollValue(formatCurrency, lastMonthPayrollCards?.krankgeld)}</div>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.68rem 0.78rem' }}>
            <div style={{ fontSize: '0.78rem', color: isDark ? '#9bb0d1' : '#6b7280' }}>Urlaubgeld (Last Month)</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{renderLastMonthPayrollValue(formatCurrency, lastMonthPayrollCards?.urlaubgeld)}</div>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.68rem 0.78rem' }}>
            <div style={{ fontSize: '0.78rem', color: isDark ? '#9bb0d1' : '#6b7280' }}>Brutto Lohn (Letzte Monat)</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{renderLastMonthPayrollValue(formatCurrency, lastMonthPayrollCards?.bruttoLohn)}</div>
          </div>
        </div>
      )}

      <div style={employeeTabsBarStyle}>
        {employeeTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={getEmployeeTabButtonStyle(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showDeactivateConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <p style={{ margin: '0 0 1rem' }}>Are you sure you want to deactivate the employee?</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={closeDeactivateConfirm}>No</button>
              <button type="button" className="btn-primary" onClick={onDeactivateConfirmYes}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {showContractForm && (
        <div style={modalOverlayStyle} onClick={() => !contractSaving && closeContractForm()}>
          <div
            style={{ ...modalCardStyle, padding: '1.5rem', maxWidth: 560, width: 'calc(100% - 2rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={contractFileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={handleContractFileChange}
            />

            <h3 style={{ margin: '0 0 1rem' }}>
              {editingContractTarget ? contractUi.editContractDateTitle : contractUi.addContractTitle}
            </h3>

            {!editingContractTarget ? (
              <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={contractDraft.type === 'fixed'}
                    disabled={!canAddAnotherFixedContract}
                    onChange={() =>
                      canAddAnotherFixedContract &&
                      setContractDraft((prev) => ({
                        ...prev,
                        type: prev.type === 'fixed' ? 'unlimited' : 'fixed',
                      }))
                    }
                  />
                  <span>{contractUi.addFixedContractOption}</span>
                </label>
                {!canAddAnotherFixedContract ? (
                  <div style={{ color: employeeMutedTextStyle.color, fontSize: '0.85rem', paddingLeft: '1.65rem' }}>
                    {contractUi.fixedContractLimitReached}
                  </div>
                ) : null}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={contractDraft.type === 'unlimited'}
                    onChange={() =>
                      setContractDraft((prev) => ({
                        ...prev,
                        type: prev.type === 'unlimited' ? (canAddAnotherFixedContract ? 'fixed' : 'unlimited') : 'unlimited',
                        endDate: '',
                      }))
                    }
                  />
                  <span>{contractUi.addPermanentContractOption}</span>
                </label>
              </div>
            ) : null}

            {contractError ? <p className="error-text" style={{ margin: '0 0 0.9rem' }}>{contractError}</p> : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: contractDraft.type === 'unlimited' ? '1fr' : '1fr 1fr',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span>{contractUi.from}</span>
                <input
                  type="date"
                  value={contractDraft.startDate}
                  onChange={(e) => setContractDraft((prev) => ({ ...prev, startDate: e.target.value }))}
                  style={modalInputStyle}
                />
              </label>
              {contractDraft.type !== 'unlimited' ? (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span>{contractUi.to}</span>
                  <input
                    type="date"
                    value={contractDraft.endDate}
                    onChange={(e) => setContractDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                    style={modalInputStyle}
                  />
                </label>
              ) : null}
            </div>

            {editingContractTarget?.canSetAsPermanent && contractDraft.type !== 'unlimited' ? (
              <div style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openSetPermanentConfirm}
                  disabled={contractSaving || contractFileUploading}
                >
                  {contractUi.setAsPermanentButton}
                </button>
              </div>
            ) : null}

            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleUploadNewContractClick}
                disabled={contractSaving || contractFileUploading}
              >
                {contractFileUploading
                  ? contractUi.uploadingContract
                  : editingContractTarget
                    ? contractUi.uploadDocument
                    : contractUi.uploadContract}
              </button>
              {contractUploadFile ? (
                <div style={{ marginTop: '0.45rem', color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>
                  {contractUi.contractDocumentSelected(contractUploadFile.name)}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary" onClick={closeContractForm} disabled={contractSaving}>
                {contractUi.cancel}
              </button>
              <button type="button" className="btn-primary" onClick={saveContract} disabled={contractSaving}>
                {contractSaving ? contractUi.saving : contractUi.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSetPermanentConfirm && (
        <div style={modalOverlayStyle} onClick={closeSetPermanentConfirm}>
          <div
            style={{ ...modalCardStyle, padding: '1.5rem', maxWidth: 460, width: 'calc(100% - 2rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.75rem' }}>{contractUi.setAsPermanentTitle}</h3>
            <p style={{ margin: '0 0 1rem', whiteSpace: 'pre-wrap' }}>{contractUi.setAsPermanentConfirm}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeSetPermanentConfirm}
                disabled={contractSaving}
              >
                {contractUi.setAsPermanentCancelButton}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={confirmSetAsPermanent}
                disabled={contractSaving}
              >
                {contractUi.setAsPermanentConfirmButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {contractModal && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalCardStyle, padding: '1.5rem', maxWidth: 460, width: 'calc(100% - 2rem)' }}>
            <h3 style={{ margin: '0 0 0.75rem' }}>{contractModal.title}</h3>
            <p style={{ margin: '0 0 1rem', whiteSpace: 'pre-wrap' }}>{contractModal.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={closeContractModal}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteContractTarget && (
        <div style={modalOverlayStyle} onClick={closeDeleteContractModal}>
          <div
            style={{ ...modalCardStyle, padding: '1.5rem', maxWidth: 460, width: 'calc(100% - 2rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.75rem' }}>{contractUi.deleteContractTitle}</h3>
            <p style={{ margin: '0 0 1rem', whiteSpace: 'pre-wrap' }}>{contractUi.deleteContractConfirm}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={closeDeleteContractModal}
                disabled={contractDeleting}
              >
                {contractUi.deleteContractCancelButton}
              </button>
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={confirmDeleteContract}
                disabled={contractDeleting}
              >
                {contractDeleting ? contractUi.saving : contractUi.deleteContractConfirmButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {internalProfileModal && (
        <div style={modalOverlayStyle} onClick={() => setInternalProfileModal(null)}>
          <div
            style={{ ...modalCardStyle, padding: '1.5rem', maxWidth: 460, width: 'calc(100% - 2rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.75rem', color: internalProfileModal.tone === 'error' ? '#dc2626' : undefined }}>
              {internalProfileModal.title}
            </h3>
            <p style={{ margin: '0 0 1rem', whiteSpace: 'pre-wrap' }}>{internalProfileModal.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={() => setInternalProfileModal(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {terminateContractTarget && (
        <div style={modalOverlayStyle} onClick={() => !terminateContractSaving && closeTerminateContractModal()}>
          <div
            style={{ ...modalCardStyle, padding: '1.5rem', maxWidth: 560, width: 'calc(100% - 2rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem' }}>{contractUi.terminateTitle}</h3>
            <input
              ref={terminateContractFileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={handleTerminateContractFileChange}
            />
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem' }}>
              <span>{contractUi.terminationDate}</span>
              <input
                type="date"
                value={terminateContractDraft.terminationDate}
                onChange={(e) => setTerminateContractDraft((prev) => ({ ...prev, terminationDate: e.target.value }))}
                style={{ ...modalInputStyle, width: '100%' }}
              />
            </label>

            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={terminateContractDraft.terminationType === 'mutual'}
                  onChange={() =>
                    setTerminateContractDraft((prev) => ({
                      ...prev,
                      terminationType: prev.terminationType === 'mutual' ? '' : 'mutual',
                      terminationInitiator: '',
                    }))
                  }
                />
                <span>{contractUi.mutualTermination}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={terminateContractDraft.terminationType === 'ordinary'}
                  onChange={() =>
                    setTerminateContractDraft((prev) => ({
                      ...prev,
                      terminationType: prev.terminationType === 'ordinary' ? '' : 'ordinary',
                      terminationInitiator: '',
                    }))
                  }
                />
                <span>{contractUi.ordinaryTermination}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={terminateContractDraft.terminationType === 'extraordinary'}
                  onChange={() =>
                    setTerminateContractDraft((prev) => ({
                      ...prev,
                      terminationType: prev.terminationType === 'extraordinary' ? '' : 'extraordinary',
                      terminationInitiator: '',
                    }))
                  }
                />
                <span>{contractUi.extraordinaryTermination}</span>
              </label>
            </div>

            {terminateContractDraft.terminationType === 'ordinary' ? (
              <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '1rem', paddingLeft: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={terminateContractDraft.terminationInitiator === 'employer'}
                    onChange={() =>
                      setTerminateContractDraft((prev) => ({
                        ...prev,
                        terminationInitiator: prev.terminationInitiator === 'employer' ? '' : 'employer',
                      }))
                    }
                  />
                  <span>{contractUi.employerTermination}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={terminateContractDraft.terminationInitiator === 'employee'}
                    onChange={() =>
                      setTerminateContractDraft((prev) => ({
                        ...prev,
                        terminationInitiator: prev.terminationInitiator === 'employee' ? '' : 'employee',
                      }))
                    }
                  />
                  <span>{contractUi.employeeTermination}</span>
                </label>
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={handleUploadTerminationDocumentClick}>
                {contractUi.uploadDocument}
              </button>
              {terminateContractDraft.file ? (
                <span style={{ color: employeeMutedTextStyle.color, fontSize: '0.9rem' }}>
                  {contractUi.terminationDocumentSelected(terminateContractDraft.file.name)}
                </span>
              ) : null}
            </div>

            {terminateContractError ? <p className="error-text" style={{ margin: '0 0 0.9rem' }}>{terminateContractError}</p> : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary" onClick={closeTerminateContractModal} disabled={terminateContractSaving}>
                {contractUi.cancelTermination}
              </button>
              <button type="button" className="btn-primary" onClick={saveTerminatedContract} disabled={terminateContractSaving}>
                {terminateContractSaving ? contractUi.saving : contractUi.saveTermination}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdvanceDialog && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalCardStyle, maxWidth: 520, padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Add Advance</h3>
            {advanceError && <p className="error-text" style={{ margin: '0 0 0.5rem' }}>{advanceError}</p>}
            <p style={{ marginBottom: '0.25rem' }}><strong>Month</strong></p>
            <select
              value={advanceMonth}
              onChange={(e) => setAdvanceMonth(e.target.value)}
              style={{ ...modalInputStyle, width: '100%', marginBottom: '1rem' }}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p style={{ marginBottom: '0.5rem' }}><strong>Advances for this month</strong></p>
            <div style={{ marginBottom: '0.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.75rem' }}>
              <span style={{ fontWeight: 600 }}>Amount</span>
              <span style={{ fontWeight: 600 }}>Comment</span>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={advanceLines[i]?.amount ?? ''}
                  onChange={(e) => setAdvanceLine(i, 'amount', e.target.value)}
                  style={modalInputStyle}
                />
                <input
                  type="text"
                  placeholder="Comment"
                  value={advanceLines[i]?.code_comment ?? ''}
                  onChange={(e) => setAdvanceLine(i, 'code_comment', e.target.value)}
                  style={modalInputStyle}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={closeAdvanceDialog} disabled={advanceSaving}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitAdvance} disabled={advanceSaving}>
                {advanceSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDaPerformance && typeof document !== 'undefined' && createPortal((
        <div style={modalOverlayStyle}>
          <div style={{ ...modalCardStyle, maxWidth: 560, padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>DA Performance — KPI by week</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!kpiLoading && kpiRows.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowDaPerformanceGraph(true)}
                  >
                    Show graph
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowDaPerformance(false)}
                >
                  Close
                </button>
              </div>
            </div>
            {kpiError && <p className="error-text" style={{ margin: '0 0 0.5rem' }}>{kpiError}</p>}
            {kpiLoading ? (
              <p style={{ margin: 0, color: '#666' }}>Loading KPI data…</p>
            ) : (
              <>
                {kpiRows.length > 0 && (() => {
                  const nums = kpiRows
                    .map((r) => Number(r.kpi))
                    .filter((v) => Number.isFinite(v) && v !== 0);
                  if (!nums.length) return null;
                  const avg = nums.reduce((sum, v) => sum + v, 0) / nums.length;
                  return (
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: isDark ? '#eaf2ff' : '#111827' }}>
                      <strong>Average KPI:</strong> {avg.toFixed(2)} ({getKpiRatingLabel(avg)})
                    </p>
                  );
                })()}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', color: isDark ? '#eaf2ff' : '#111827' }}>
                  <thead>
                    <tr style={{ borderBottom: isDark ? '2px solid rgba(132, 162, 214, 0.32)' : '2px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Year</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Week</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem' }}>KPI</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Rating</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '1rem', color: '#666', textAlign: 'center' }}>
                          No KPI data found for this employee.
                        </td>
                      </tr>
                    ) : (
                      kpiRows.map((row, idx) => (
                        <tr key={`${row.year}-${row.week}-${idx}`} style={{ borderBottom: isDark ? '1px solid rgba(132, 162, 214, 0.22)' : '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{row.year}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{row.week}</td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{row.kpi != null ? Number(row.kpi) : '—'}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{getKpiRatingLabel(row.kpi)}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{row.comment ?? ''}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-primary" onClick={() => setShowDaPerformance(false)}>Close</button>
            </div>
          </div>
        </div>
      ), document.body)}
      {showKpiCommentDialog && kpiRows.length > 0 && (
        <div style={{ ...modalOverlayStyle, zIndex: 1001 }} onClick={() => !kpiCommentSaving && setShowKpiCommentDialog(false)}>
          <div style={{ ...modalCardStyle, padding: '1.25rem', width: '90%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Add KPI comment</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <span>Calendar week</span>
                <select
                  style={modalInputStyle}
                  value={kpiCommentWeekKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setKpiCommentWeekKey(key);
                    const [yStr, wStr] = key.split('-');
                    const row = kpiRows.find((r) => String(r.year) === yStr && String(r.week) === wStr);
                    setKpiCommentText(row?.comment || '');
                  }}
                >
                  {kpiRows.map((r) => (
                    <option key={`${r.year}-${r.week}`} value={`${r.year}-${r.week}`}>
                      {r.year} – week {r.week}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <span>Comment</span>
                <textarea
                  rows={3}
                  value={kpiCommentText}
                  onChange={(e) => setKpiCommentText(e.target.value)}
                  style={{ ...modalInputStyle, resize: 'vertical' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowKpiCommentDialog(false)}
                disabled={kpiCommentSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={kpiCommentSaving || !kpiCommentWeekKey}
                onClick={async () => {
                  if (!kpiRows.length || !kpiCommentWeekKey) return;
                  const [yStr, wStr] = kpiCommentWeekKey.split('-');
                  const row = kpiRows.find((r) => String(r.year) === yStr && String(r.week) === wStr);
                  if (!row?.employee_id) return;
                  setKpiCommentSaving(true);
                  try {
                    await saveEmployeeKpiComment(row.employee_id, row.year, row.week, kpiCommentText);
                    // обновим локально без повторного запроса
                    setKpiRows((prev) =>
                      prev.map((r) =>
                        r.year === row.year && r.week === row.week ? { ...r, comment: kpiCommentText } : r
                      )
                    );
                    setShowKpiCommentDialog(false);
                  } catch (e) {
                    alert(String(e?.message || e));
                  } finally {
                    setKpiCommentSaving(false);
                  }
                }}
              >
                {kpiCommentSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDaPerformanceGraph && kpiRows.length > 0 && (() => {
        const KPI_THRESHOLDS = [
          { value: 93, label: 'FANTASTIC PLUS', color: '#059669' },
          { value: 92.99, label: 'FANTASTIC', color: '#2563eb' },
          { value: 84.99, label: 'GREAT', color: '#7c3aed' },
          { value: 70, label: 'FAIR', color: '#d97706' },
          { value: 50, label: 'POOR', color: '#dc2626' },
        ];
        const chartW = 900;
        const chartH = 480;
        const pad = { top: 28, right: 28, bottom: 56, left: 52 };
        const plotW = chartW - pad.left - pad.right;
        const plotH = chartH - pad.top - pad.bottom;
        const points = [...kpiRows].reverse().map((r) => ({ ...r, kpiNum: Number(r.kpi) })).filter((p) => Number.isFinite(p.kpiNum) && p.kpiNum !== 0);
        const yMin = 0;
        const yMax = 100;
        const yScale = (v) => pad.top + plotH - (Number(v) - yMin) / (yMax - yMin) * plotH;
        const xScale = (i) => pad.left + (i / Math.max(1, points.length - 1)) * plotW;
        const axisStroke = isDark ? 'rgba(147, 197, 253, 0.42)' : '#e5e7eb';
        const gridStroke = isDark ? 'rgba(96, 165, 250, 0.14)' : '#f3f4f6';
        const axisLabelColor = isDark ? '#9bb0d1' : '#6b7280';
        const lineStroke = isDark ? '#8cc4ff' : '#0f172a';
        const pointFill = isDark ? '#dbeafe' : '#0f172a';
        const chartBackground = isDark ? 'rgba(7, 18, 35, 0.96)' : '#ffffff';
        return typeof document !== 'undefined' ? createPortal((
          <div style={{ ...modalOverlayStyle, zIndex: 1001, justifyContent: 'center', alignItems: 'center', paddingTop: '2rem', paddingBottom: '2rem' }}>
            <div style={{ ...modalCardStyle, padding: '1.5rem', width: '92vw', maxWidth: 960, maxHeight: '90vh' }}>
              <h3 style={{ margin: '0 0 1rem' }}>KPI by week — Graph</h3>
              <div style={{ overflowX: 'auto', overflowY: 'auto', background: isDark ? 'linear-gradient(180deg, rgba(5, 14, 30, 0.96), rgba(8, 22, 42, 0.9))' : '#ffffff', border: isDark ? '1px solid rgba(120, 150, 206, 0.22)' : '1px solid #e5e7eb', borderRadius: 16, padding: '0.75rem', boxShadow: isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
                <svg width={chartW} height={chartH} style={{ display: 'block', minWidth: chartW }} viewBox={`0 0 ${chartW} ${chartH}`}>
                  <rect x="0" y="0" width={chartW} height={chartH} rx="18" fill={chartBackground} />
                  <line x1={pad.left} y1={pad.top} x2={pad.left} y2={chartH - pad.bottom} stroke={axisStroke} strokeWidth="1" />
                  <line x1={pad.left} y1={chartH - pad.bottom} x2={chartW - pad.right} y2={chartH - pad.bottom} stroke={axisStroke} strokeWidth="1" />
                  {[0, 25, 50, 75, 100].map((v) => (
                    <g key={v}>
                      <line x1={pad.left} y1={yScale(v)} x2={chartW - pad.right} y2={yScale(v)} stroke={gridStroke} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={pad.left - 8} y={yScale(v) + 5} textAnchor="end" fontSize="12" fill={axisLabelColor}>{v}</text>
                    </g>
                  ))}
                  {KPI_THRESHOLDS.map(({ value, label, color }) => (
                    <g key={value}>
                      <line x1={pad.left} y1={yScale(value)} x2={chartW - pad.right} y2={yScale(value)} stroke={color} strokeWidth="1.5" opacity="0.85" />
                      <text x={chartW - pad.right + 6} y={yScale(value) + 4} fontSize="11" fill={color} fontWeight="600">{label}</text>
                    </g>
                  ))}
                  {points.length > 0 && (
                    <g>
                      <polyline
                        fill="none"
                        stroke={lineStroke}
                        strokeWidth="2.5"
                        points={points.map((p, i) => `${xScale(i)},${yScale(p.kpiNum)}`).join(' ')}
                      />
                      {points.map((p, i) => (
                        <circle key={`${p.year}-${p.week}`} cx={xScale(i)} cy={yScale(p.kpiNum)} r="5" fill={pointFill} stroke={lineStroke} strokeWidth="1.5" />
                      ))}
                    </g>
                  )}
                  {points.length > 0 && points.map((p, i) => {
                    const x = xScale(i);
                    const y = chartH - 22;
                    return (
                      <text key={`x-${i}`} x={x} y={y} textAnchor="middle" fontSize="10" fill={axisLabelColor} transform={`rotate(-90, ${x}, ${y})`}>
                        {p.year} W{p.week}
                      </text>
                    );
                  })}
                </svg>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn-primary" onClick={() => setShowDaPerformanceGraph(false)}>Close</button>
              </div>
            </div>
          </div>
        ), document.body) : null;
      })()}

      {showDeactivateForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 480, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Deactivation of employee</h3>
            {deactivateError && <p className="error-text" style={{ margin: '0 0 0.5rem' }}>{deactivateError}</p>}
            <p style={{ marginBottom: '0.5rem' }}><strong>Termination date</strong></p>
            <input
              type="date"
              value={deactivateDate}
              onChange={(e) => setDeactivateDate(e.target.value)}
              style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
            />
            <p style={{ marginBottom: '0.5rem' }}><strong>Reason for termination</strong></p>
            <select
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
            >
              <option value="">— Select reason —</option>
              {TERMINATION_REASONS.map(({ group, options }) => (
                <optgroup key={group} label={group}>
                  {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={closeDeactivateForm} disabled={deactivating}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitDeactivate} disabled={deactivating}>
                {deactivating ? 'Sending…' : 'Save and send to Kenjo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overview' ? overviewContent : null}
      {activeTab === 'profile' ? profileContent : null}
      {activeTab === 'employment' ? employmentContent : null}
      {activeTab === 'time-off' ? timeOffContent : null}
      {activeTab === 'performance' ? performanceContent : null}

      {activeTab === 'documents' && (
      <div style={employeeSectionStyle}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Employee documents</h3>
        {employeeDocError && <p className="error-text" style={{ margin: '0 0 0.5rem' }}>{employeeDocError}</p>}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            // #region agent log
            fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H5',location:'frontend/src/pages/EmployeeProfilePage.jsx:employeeDocs:onSubmit',message:'employee_upload_form_submit',data:{employeeDocRef:String(employeeDocRef||''),employeeDocType:String(employeeDocType||''),fileCount:employeeDocFiles.length,fileNames:employeeDocFiles.map((f)=>f?.name||null)},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (!employeeDocRef) {
              setEmployeeDocError('Employee reference is missing.');
              return;
            }
            if (!employeeDocFiles.length) {
              setEmployeeDocError('Please choose at least one file.');
              return;
            }
            setEmployeeDocUploading(true);
            setEmployeeDocError('');
            try {
              const requiresNamedDocument =
                selectedEmployeeDocTypeConfig?.exactNameEnabled === true && employeeDocumentTemplateOptions.length > 0;
              if (requiresNamedDocument && !employeeDocumentTemplate) {
                setEmployeeDocError('Please select the exact document name first.');
                return;
              }
              if (selectedEmployeeDocumentTemplateOption?.requiresSelectedDate && !employeeContractTemplateDate) {
                setEmployeeDocError('Please select the document date first.');
                return;
              }
              if (requiresNamedDocument && employeeDocFiles.length !== 1) {
                setEmployeeDocError(`Please choose exactly one file for document type "${employeeDocType}".`);
                return;
              }
              for (const file of employeeDocFiles) {
                const extension = file?.name?.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
                const targetFileName =
                  requiresNamedDocument && selectedEmployeeDocumentTemplateOption?.value
                    ? `${selectedEmployeeDocumentTemplateOption.value}${extension}`
                      : '';
                await uploadEmployeeDocument(employeeDocRef, file, employeeDocType, targetFileName);
              }
              const refreshed = await getEmployeeDocuments(employeeDocRef);
              setEmployeeDocs(Array.isArray(refreshed) ? refreshed : []);
              setEmployeeDocFiles([]);
              if (employeeDocFileInputRef.current) {
                employeeDocFileInputRef.current.value = '';
              }
              setEmployeeDocType(employeeDocTypeOptions[0] || '');
              setEmployeeDocumentTemplate('');
              setEmployeeContractTemplateDate('');
            } catch (err) {
              setEmployeeDocError(String(err?.message || err));
            } finally {
              setEmployeeDocUploading(false);
            }
          }}
          style={{ display: 'grid', gridTemplateColumns: employeeDocFormGridTemplateColumns, gap: '0.5rem', alignItems: 'end', marginBottom: '0.75rem' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Type of document</span>
            <select
              value={employeeDocType}
              onChange={(e) => {
                setEmployeeDocType(e.target.value);
                setEmployeeDocumentTemplate('');
                setEmployeeContractTemplateDate('');
              }}
            >
              {employeeDocTypeOptions.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          {showEmployeeDocExactName ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span>Exact document name</span>
              <select value={employeeDocumentTemplate} onChange={(e) => setEmployeeDocumentTemplate(e.target.value)}>
                <option value="">Select exact document name...</option>
                {employeeDocumentTemplateOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          {showEmployeeDocTemplateDate ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span>Select date</span>
              <input
                type="date"
                value={employeeContractTemplateDate}
                onChange={(e) => setEmployeeContractTemplateDate(e.target.value)}
              />
            </label>
          ) : null}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Files</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <input
                ref={employeeDocFileInputRef}
                type="file"
                style={{ display: 'none' }}
                multiple={!(selectedEmployeeDocTypeConfig?.exactNameEnabled && employeeDocumentTemplateOptions.length)}
                onChange={(e) => setEmployeeDocFiles(Array.from(e.target.files || []))}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() => employeeDocFileInputRef.current?.click()}
                disabled={employeeDocUploading}
                style={{ minWidth: 132, width: 'fit-content' }}
              >
                Choose files
              </button>
              <span style={{ ...employeeMutedTextStyle, fontSize: '0.85rem' }}>
                {employeeDocFiles.length
                  ? `${employeeDocFiles.length} file(s) selected`
                  : 'No file selected'}
              </span>
            </div>
          </label>
          <button
            type="submit"
            className="btn-primary"
            disabled={employeeDocUploading}
            style={{ justifySelf: 'start', width: 120, minWidth: 120 }}
          >
            {employeeDocUploading ? 'Uploading…' : 'Upload files'}
          </button>
        </form>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowEmployeeDocsList((v) => !v)}
            style={{ width: 120, minWidth: 120 }}
          >
            {showEmployeeDocsList ? 'Hide docs' : 'Show docs'}
          </button>
          {showEmployeeDocsList && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Type</span>
              <select
                value={employeeDocsFilterType}
                onChange={(e) => setEmployeeDocsFilterType(e.target.value)}
              >
                <option value="">All</option>
                {employeeDocTypeFilterOptions.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          )}
        </div>
        {showEmployeeDocsList && (
          employeeDocsLoading ? (
            <p style={{ margin: 0, color: '#666' }}>Loading documents…</p>
          ) : filteredEmployeeDocs.length === 0 ? (
            <p style={{ margin: 0, color: '#666' }}>No documents uploaded for selected type.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', color: isDark ? '#eaf2ff' : '#111827' }}>
                <thead>
                  <tr style={{ borderBottom: isDark ? '2px solid rgba(132, 162, 214, 0.32)' : '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>File name</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Uploaded</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployeeDocs.map((doc) => (
                    <tr key={doc.id} style={{ borderBottom: isDark ? '1px solid rgba(132, 162, 214, 0.22)' : '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{doc.document_type || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{doc.file_name || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{doc.created_at ? new Date(doc.created_at).toLocaleString() : '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <button
                          type="button"
                          style={documentViewButtonStyle}
                          onClick={() => viewEmployeeDocument(employeeDocRef, doc.id).catch((err) => setEmployeeDocError(String(err?.message || err)))}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          style={{ ...documentDownloadButtonStyle, marginLeft: '0.5rem' }}
                          onClick={() => downloadEmployeeDocument(employeeDocRef, doc.id, doc.file_name)}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          style={{ ...documentDeleteButtonStyle, marginLeft: '0.5rem' }}
                          onClick={async () => {
                            if (!window.confirm('Delete this document?')) return;
                            try {
                              setEmployeeDocError('');
                              await deleteEmployeeDocument(employeeDocRef, doc.id);
                              setEmployeeDocs((prev) => prev.filter((x) => x.id !== doc.id));
                            } catch (err) {
                              setEmployeeDocError(String(err?.message || err));
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      )}

      {timeOffHistoryModal && (
        <div style={modalOverlayStyle} onClick={closeTimeOffHistoryModal}>
          <div
            style={{ ...modalCardStyle, padding: '1.5rem', maxWidth: 760 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
                marginBottom: '1rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: isDark ? '#f8fbff' : '#111827' }}>
                  {timeOffHistoryModal === 'sick' ? timeOffUi.sicknessHistoryTitle : timeOffUi.vacationHistoryTitle}
                </h3>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isDark ? '#d7e5ff' : '#111827' }}>
                <span>{timeOffUi.yearLabel}</span>
                <select
                  value={timeOffHistoryYear}
                  onChange={(e) => setTimeOffHistoryYear(Number(e.target.value) || currentVacationYear)}
                  style={modalInputStyle}
                >
                  {historyYearOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {timeOffHistoryError ? (
              <p className="error-text" style={{ margin: '0 0 0.75rem' }}>{timeOffHistoryError}</p>
            ) : null}

            <div
              style={{
                border: isDark ? '1px solid rgba(132, 162, 214, 0.25)' : '1px solid #d8dde6',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 160px)',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: isDark ? 'rgba(16, 32, 56, 0.96)' : '#f8fafc',
                  borderBottom: isDark ? '1px solid rgba(132, 162, 214, 0.2)' : '1px solid #e5e7eb',
                  fontWeight: 600,
                }}
              >
                <span>{timeOffUi.from}</span>
                <span>{timeOffUi.to}</span>
                <span>{timeOffUi.workingDays}</span>
              </div>

              {timeOffHistoryLoading ? (
                <div style={{ padding: '1rem', color: employeeMutedTextStyle.color }}>
                  {timeOffUi.loading}
                </div>
              ) : timeOffHistoryRows.length ? (
                <div style={{ display: 'grid' }}>
                  {timeOffHistoryRows.map((row, index) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 160px)',
                        gap: '0.75rem',
                        padding: '0.75rem 1rem',
                        background: index % 2 === 0
                          ? (isDark ? 'rgba(10, 20, 37, 0.96)' : '#ffffff')
                          : (isDark ? 'rgba(15, 28, 48, 0.96)' : '#f8fafc'),
                        borderBottom:
                          index === timeOffHistoryRows.length - 1
                            ? 'none'
                            : (isDark ? '1px solid rgba(132, 162, 214, 0.16)' : '1px solid #eef2f7'),
                      }}
                    >
                      <span>{formatDateDayMonthYear(row.start_date)}</span>
                      <span>{formatDateDayMonthYear(row.end_date)}</span>
                      <strong>{formatDaysValue(row.working_days)}</strong>
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 160px)',
                      gap: '0.75rem',
                      padding: '0.85rem 1rem',
                      background: isDark ? 'rgba(18, 36, 60, 0.98)' : '#eef4ff',
                      borderTop: isDark ? '1px solid rgba(132, 162, 214, 0.24)' : '1px solid #d7e5ff',
                      fontWeight: 700,
                    }}
                  >
                    <span>{timeOffUi.totalInYear}</span>
                    <span />
                    <strong>{formatDaysValue(timeOffHistoryTotalDays)}</strong>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem', color: employeeMutedTextStyle.color }}>
                  {timeOffUi.noRows}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={closeTimeOffHistoryModal}>
                {timeOffUi.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRescueModal && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalCardStyle, padding: '1.5rem', maxWidth: 420, width: 'calc(100% - 2rem)' }}>
            <h3 style={{ margin: '0 0 1rem', color: isDark ? '#f8fbff' : '#111827' }}>Add Rescue</h3>
            {rescueError ? <p className="error-text" style={{ margin: '0 0 0.75rem' }}>{rescueError}</p> : null}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', color: isDark ? '#d7e5ff' : '#111827' }}>
              <span>Date</span>
              <input
                type="date"
                value={rescueDateDraft}
                onChange={(e) => setRescueDateDraft(e.target.value)}
                style={{ ...modalInputStyle, colorScheme: isDark ? 'dark' : 'light' }}
              />
            </label>
            <p style={{ margin: '0.5rem 0 0', color: isDark ? '#9bb0d1' : '#6b7280', fontSize: '0.85rem' }}>
              Suggested: {formatDateDayMonthYear(rescueSuggestedDate)}
            </p>
            <p style={{ margin: '0.85rem 0 0', color: isDark ? '#9bb0d1' : '#666', fontSize: '0.9rem' }}>
              Each saved rescue adds the configured Rescue bonus from Payroll Settings to Total Bonus.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={closeRescueModal} disabled={rescueSaving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={saveRescue} disabled={rescueSaving}>
                {rescueSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
