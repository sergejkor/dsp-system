/**
 * Home dashboard: aggregates existing analytics + PAVE + damages + light “recent rows” queries.
 * No mock data — all from DB via existing services / SQL.
 */
import { query } from '../../db.js';
import { getOverview } from '../analytics/analyticsService.js';
import { getPaveGmailInspectionStats } from '../pave/paveGmailSyncService.js';
import { getDamagesDomainData } from '../analytics/damagesAnalyticsService.js';
import { getPublicIntakeSummary } from '../publicIntake/publicIntakeService.js';
import { ensureEmployeeRescuesTable } from '../employees/employeeService.js';
import { getTimeOffRequests } from '../kenjo/kenjoClient.js';

let dashboardCarsWorkshopColumnsReady = false;
const KENJO_TYPE_KRANK = '685e7223e6bac64cb0a27e39';
const KENJO_TYPE_URLAUB = '685e7223e6bac64cb0a27e38';

async function ensureDashboardCarsWorkshopColumns() {
  if (dashboardCarsWorkshopColumnsReady) return;
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_from DATE`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_to DATE`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_name TEXT`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_comment TEXT`);
  dashboardCarsWorkshopColumnsReady = true;
}

function lastNDaysIso(n) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function getLastMonthRange() {
  const now = new Date();
  const startCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    start: startLastMonth.toISOString().slice(0, 10),
    endExclusive: startCurrentMonth.toISOString().slice(0, 10),
  };
}

function toDateOnly(value) {
  if (!value) return '';
  const str = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : '';
}

function countWeekdaysInclusive(startYmd, endYmd) {
  const start = toDateOnly(startYmd);
  const end = toDateOnly(endYmd);
  if (!start || !end || start > end) return 0;
  const startT = new Date(`${start}T12:00:00Z`).getTime();
  const endT = new Date(`${end}T12:00:00Z`).getTime();
  let count = 0;
  for (let t = startT; t <= endT; t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function classifyTimeOffKind(row) {
  const typeId = String(
    row.time_off_type
    ?? row.time_off_type_id
    ?? row._timeOffTypeId
    ?? row.timeOffTypeId
    ?? row.type
    ?? '',
  ).trim();
  const typeName = String(
    row.time_off_type_name
    ?? row.type_name
    ?? row.timeOffTypeName
    ?? row.description
    ?? row.typeName
    ?? row._timeOffType?.name
    ?? '',
  ).trim().toLowerCase();
  if (typeId === KENJO_TYPE_URLAUB || /urlaub|vacation|paid leave/.test(typeName)) return 'vacation';
  if (typeId === KENJO_TYPE_KRANK || /krank|sick|ill/.test(typeName)) return 'sick';
  return null;
}

function isIgnoredTimeOffStatus(statusValue) {
  const status = String(statusValue ?? '').trim().toLowerCase();
  if (!status) return false;
  return /^(rejected|declined|cancelled|canceled)/.test(status);
}

function clampWeekdayCount(requestStart, requestEnd, rangeStart, rangeEnd) {
  const start = requestStart > rangeStart ? requestStart : rangeStart;
  const end = requestEnd < rangeEnd ? requestEnd : rangeEnd;
  if (!start || !end || start > end) return 0;
  return countWeekdaysInclusive(start, end);
}

function buildDashboardTimeOffSummary(rows, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);

  const summary = {
    vacationDaysThisMonth: 0,
    vacationDaysLastMonth: 0,
    sickDaysThisMonth: 0,
    sickDaysLastMonth: 0,
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (isIgnoredTimeOffStatus(row.status)) continue;

    const kind = classifyTimeOffKind(row);
    if (!kind) continue;

    const requestStart = toDateOnly(row.start_date ?? row.from ?? row.startDate ?? row.start);
    const requestEnd = toDateOnly(row.end_date ?? row.to ?? row.endDate ?? row.end);
    if (!requestStart || !requestEnd) continue;

    const thisMonthDays = clampWeekdayCount(requestStart, requestEnd, currentMonthStart, today);
    const lastMonthDays = clampWeekdayCount(requestStart, requestEnd, lastMonthStart, lastMonthEnd);

    if (kind === 'vacation') {
      summary.vacationDaysThisMonth += thisMonthDays;
      summary.vacationDaysLastMonth += lastMonthDays;
    } else if (kind === 'sick') {
      summary.sickDaysThisMonth += thisMonthDays;
      summary.sickDaysLastMonth += lastMonthDays;
    }
  }

  return summary;
}

function buildDenseDailyCounts(startIso, endIso, rows) {
  const counts = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [String(row.date || '').slice(0, 10), Number(row.count || 0)]),
  );
  const out = [];
  const cursor = new Date(`${String(startIso).slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${String(endIso).slice(0, 10)}T12:00:00Z`);

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    out.push({
      date: iso,
      count: counts.get(iso) || 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

/**
 * @returns {Promise<import('./dashboardTypes.js').DashboardSummary>}
 */
export async function getDashboardSummary() {
  const now = new Date();
  const insuranceYear = now.getFullYear();
  const { start: damagesStart, end: damagesEnd } = lastNDaysIso(90);
  const { start: routesStart, end: routesEnd } = lastNDaysIso(14);
  const { start: rescueStart, endExclusive: rescueEndExclusive } = getLastMonthRange();
  const timeOffRangeStart = rescueStart;
  const timeOffRangeEnd = now.toISOString().slice(0, 10);
  await ensureDashboardCarsWorkshopColumns();
  await ensureEmployeeRescuesTable();

  const overviewPromise = getOverview({
    datePreset: 'this_month',
    compareMode: 'none',
    insuranceYear,
  });

  const pavePromise = getPaveGmailInspectionStats();

  const damagesPromise = getDamagesDomainData({
    startDate: damagesStart,
    endDate: damagesEnd,
    limit: 5,
  }).catch((err) => {
    console.error('[dashboard] damages aggregate failed', err);
    return null;
  });

  const intakePromise = getPublicIntakeSummary().catch((err) => {
    console.error('[dashboard] public intake aggregate failed', err);
    return null;
  });

  const recentRoutesByDayPromise = query(
    `
      SELECT
        to_char(day_key, 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM daily_upload_rows
      WHERE day_key >= $1
        AND day_key <= $2
      GROUP BY day_key
      ORDER BY day_key
    `,
    [routesStart, routesEnd],
  ).catch((err) => {
    console.error('[dashboard] recent routes aggregate failed', err);
    return { rows: [] };
  });

  const recentPavePromise = query(`
    SELECT
      pr.id,
      pr.plate_number,
      pr.vehicle_id,
      pr.vehicle_label,
      pr.vin_display,
      pr.status,
      pr.inspection_date,
      pr.report_date,
      pr.created_at,
      pr.driver_name,
      pr.total_grade,
      COALESCE(
        NULLIF(pr.plate_number, ''),
        NULLIF(matched_car.license_plate, ''),
        NULLIF(pr.vehicle_label, ''),
        NULLIF(pr.vehicle_id, ''),
        NULLIF(pr.vin_display, '')
      ) AS display_plate
    FROM pave_reports pr
    LEFT JOIN LATERAL (
      SELECT c.license_plate
      FROM cars c
      WHERE (
        LENGTH(REGEXP_REPLACE(UPPER(COALESCE(c.vin, '')), '[^A-Z0-9]', '', 'g')) >= 4
        AND LENGTH(REGEXP_REPLACE(UPPER(COALESCE(pr.vin_display, pr.vin, '')), '[^A-Z0-9]', '', 'g')) >= 4
        AND RIGHT(REGEXP_REPLACE(UPPER(COALESCE(c.vin, '')), '[^A-Z0-9]', '', 'g'), 4) =
            RIGHT(REGEXP_REPLACE(UPPER(COALESCE(pr.vin_display, pr.vin, '')), '[^A-Z0-9]', '', 'g'), 4)
      ) OR (
        pr.vehicle_id IS NOT NULL
        AND pr.vehicle_id <> ''
        AND c.vehicle_id = pr.vehicle_id
      ) OR (
        pr.plate_number IS NOT NULL
        AND pr.plate_number <> ''
        AND regexp_replace(upper(COALESCE(c.license_plate, '')), '[^A-Z0-9]', '', 'g')
          = regexp_replace(upper(pr.plate_number), '[^A-Z0-9]', '', 'g')
      ) OR (
        pr.vehicle_label IS NOT NULL
        AND pr.vehicle_label <> ''
        AND regexp_replace(upper(COALESCE(c.license_plate, '')), '[^A-Z0-9]', '', 'g')
          = regexp_replace(upper(pr.vehicle_label), '[^A-Z0-9]', '', 'g')
      )
      ORDER BY
        CASE
          WHEN LENGTH(REGEXP_REPLACE(UPPER(COALESCE(c.vin, '')), '[^A-Z0-9]', '', 'g')) >= 4
            AND LENGTH(REGEXP_REPLACE(UPPER(COALESCE(pr.vin_display, pr.vin, '')), '[^A-Z0-9]', '', 'g')) >= 4
            AND RIGHT(REGEXP_REPLACE(UPPER(COALESCE(c.vin, '')), '[^A-Z0-9]', '', 'g'), 4) =
                RIGHT(REGEXP_REPLACE(UPPER(COALESCE(pr.vin_display, pr.vin, '')), '[^A-Z0-9]', '', 'g'), 4) THEN 0
          WHEN pr.vehicle_id IS NOT NULL AND pr.vehicle_id <> '' AND c.vehicle_id = pr.vehicle_id THEN 0
          WHEN pr.plate_number IS NOT NULL AND pr.plate_number <> '' AND regexp_replace(upper(COALESCE(c.license_plate, '')), '[^A-Z0-9]', '', 'g')
            = regexp_replace(upper(pr.plate_number), '[^A-Z0-9]', '', 'g') THEN 1
          ELSE 2
        END,
        c.id ASC
      LIMIT 1
    ) matched_car ON TRUE
    ORDER BY pr.created_at DESC NULLS LAST
    LIMIT 8
  `).catch((err) => {
    console.error('[dashboard] recent pave reports failed', err);
    return { rows: [] };
  });

  const recentFinesPromise = query(`
    SELECT id, case_number, amount, receipt_date, created_at, kenjo_employee_id
    FROM fines
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 6
  `).catch((err) => {
    console.error('[dashboard] recent fines failed', err);
    return { rows: [] };
  });

  const workshopAppointmentsPromise = query(`
    SELECT
      c.id,
      c.vehicle_id,
      c.license_plate,
      c.planned_workshop_name,
      COALESCE(c.planned_workshop_from, c.planned_workshop_to)::text AS planned_workshop_from,
      COALESCE(c.planned_workshop_to, c.planned_workshop_from)::text AS planned_workshop_to
    FROM cars c
    WHERE COALESCE(c.planned_workshop_from, c.planned_workshop_to) IS NOT NULL
      AND (
        COALESCE(c.planned_workshop_from, c.planned_workshop_to) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        OR (
          COALESCE(c.planned_workshop_from, c.planned_workshop_to) <= CURRENT_DATE
          AND COALESCE(c.planned_workshop_to, c.planned_workshop_from) >= CURRENT_DATE
        )
      )
    ORDER BY COALESCE(c.planned_workshop_from, c.planned_workshop_to) ASC NULLS LAST, c.license_plate ASC NULLS LAST, c.vehicle_id ASC NULLS LAST
    LIMIT 8
  `).catch((err) => {
    console.error('[dashboard] workshop appointments failed', err);
    return { rows: [] };
  });

  const rescueBonusLastMonthPromise = query(
    `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM employee_rescues
      WHERE rescue_date >= $1::date
        AND rescue_date < $2::date
    `,
    [rescueStart, rescueEndExclusive]
  ).catch((err) => {
    console.error('[dashboard] rescue bonus aggregate failed', err);
    return { rows: [{ total: 0 }] };
  });

  const timeOffSummaryPromise = getTimeOffRequests(timeOffRangeStart, timeOffRangeEnd)
  .then((rows) => buildDashboardTimeOffSummary(rows || [], now)).catch((err) => {
    console.error('[dashboard] time off aggregate failed', err);
    return {
      vacationDaysThisMonth: 0,
      vacationDaysLastMonth: 0,
      sickDaysThisMonth: 0,
      sickDaysLastMonth: 0,
    };
  });

  const [overview, paveInspections, damagesData, intake, recentRoutesByDayRes, recentPaveRes, recentFinesRes, workshopAppointmentsRes, rescueBonusLastMonthRes, timeOffSummary] = await Promise.all([
    overviewPromise,
    pavePromise,
    damagesPromise,
    intakePromise,
    recentRoutesByDayPromise,
    recentPavePromise,
    recentFinesPromise,
    workshopAppointmentsPromise,
    rescueBonusLastMonthPromise,
    timeOffSummaryPromise,
  ]);

  const openCasesTable = damagesData?.insightTables?.find((t) => t.title === 'Open cases');

  return {
    generatedAt: new Date().toISOString(),
    overview,
    paveInspections,
    damagesLast90: damagesData
      ? {
          range: damagesData.range,
          kpis: damagesData.kpis,
          openCasesPreview: (openCasesTable?.rows || []).slice(0, 5),
        }
      : null,
    publicIntake: intake,
    recentRoutesByDay: buildDenseDailyCounts(routesStart, routesEnd, recentRoutesByDayRes.rows || []),
    recentPaveReports: recentPaveRes.rows || [],
    recentFines: recentFinesRes.rows || [],
    recentWorkshopAppointments: workshopAppointmentsRes.rows || [],
    rescueBonusLastMonth: {
      total: Number(rescueBonusLastMonthRes?.rows?.[0]?.total || 0),
      periodStart: rescueStart,
      periodEndExclusive: rescueEndExclusive,
    },
    timeOffSummary,
  };
}
