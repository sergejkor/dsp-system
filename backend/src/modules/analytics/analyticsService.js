/**
 * Analytics service: overview KPIs, domain data, filters meta.
 * All data driven from existing business tables.
 */
import { query } from '../../db.js';
import { getInsuranceOverviewKpis } from './insuranceAnalyticsService.js';
import { getInsuranceDomainData } from './insuranceAnalyticsService.js';
import { getDamagesDomainData } from './damagesAnalyticsService.js';

function formatPersonalNumber(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return s.padStart(5, '0');
  return s;
}

const CAR_STATUS_ACTIVE = 'Active';
const CAR_STATUS_MAINTENANCE = 'Maintenance';
const CAR_STATUS_OUT_OF_SERVICE = 'Out of Service';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundTo(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function shiftMonthKey(monthKey, diff) {
  const raw = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return raw;
  const [year, month] = raw.split('-').map(Number);
  const date = new Date(year, month - 1 + diff, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthKeyRange(startMonthKey, endMonthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(startMonthKey || '')) || !/^\d{4}-\d{2}$/.test(String(endMonthKey || ''))) {
    return [];
  }
  const out = [];
  let cursor = String(startMonthKey);
  while (cursor <= endMonthKey) {
    out.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }
  return out;
}

/**
 * Resolve start/end date from preset or custom range.
 * @param {string} preset - e.g. today, yesterday, this_week, last_week, this_month, last_month, last_30, last_90, this_quarter, last_quarter, this_year, custom
 * @param {string} startDate - for custom
 * @param {string} endDate - for custom
 */
export function resolveDateRange(preset, startDate, endDate) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let start, end;

  switch (preset || 'this_month') {
    case 'today':
      start = end = today;
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = end = y.toISOString().slice(0, 10);
      break;
    }
    case 'this_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      start = d.toISOString().slice(0, 10);
      end = today;
      break;
    }
    case 'last_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff - 7);
      start = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() + 6);
      end = d.toISOString().slice(0, 10);
      break;
    }
    case 'this_month':
      start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      end = today;
      break;
    case 'last_month': {
      const m = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start = m.toISOString().slice(0, 10);
      end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      break;
    }
    case 'last_30':
      end = today;
      const d30 = new Date(now);
      d30.setDate(d30.getDate() - 29);
      start = d30.toISOString().slice(0, 10);
      break;
    case 'last_90':
      end = today;
      const d90 = new Date(now);
      d90.setDate(d90.getDate() - 89);
      start = d90.toISOString().slice(0, 10);
      break;
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3) + 1;
      start = `${now.getFullYear()}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
      end = today;
      break;
    }
    case 'last_quarter': {
      const q = Math.floor(now.getMonth() / 3) + 1;
      const qPrev = q === 1 ? 4 : q - 1;
      const y = q === 1 ? now.getFullYear() - 1 : now.getFullYear();
      start = `${y}-${String((qPrev - 1) * 3 + 1).padStart(2, '0')}-01`;
      end = new Date(y, (qPrev - 1) * 3 + 3, 0).toISOString().slice(0, 10);
      break;
    }
    case 'this_year':
      start = `${now.getFullYear()}-01-01`;
      end = today;
      break;
    case 'custom':
    default:
      start = (startDate || today).slice(0, 10);
      end = (endDate || today).slice(0, 10);
      if (start > end) [start, end] = [end, start];
      break;
  }
  return { start, end };
}

/**
 * Get comparison period (previous period / month / year).
 */
export function getComparisonRange(compareMode, start, end) {
  if (!compareMode || compareMode === 'none') return null;
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const days = Math.round((e - s) / 86400000) + 1;
  let compStart, compEnd;

  if (compareMode === 'previous_period') {
    compEnd = new Date(s);
    compEnd.setDate(compEnd.getDate() - 1);
    compStart = new Date(compEnd);
    compStart.setDate(compStart.getDate() - days + 1);
    return { start: compStart.toISOString().slice(0, 10), end: compEnd.toISOString().slice(0, 10) };
  }
  if (compareMode === 'previous_month') {
    compEnd = new Date(s.getFullYear(), s.getMonth(), 0);
    compStart = new Date(compEnd.getFullYear(), compEnd.getMonth(), 1);
    return { start: compStart.toISOString().slice(0, 10), end: compEnd.toISOString().slice(0, 10) };
  }
  if (compareMode === 'previous_year') {
    compStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate());
    compEnd = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate());
    return { start: compStart.toISOString().slice(0, 10), end: compEnd.toISOString().slice(0, 10) };
  }
  return null;
}

/**
 * Overview KPIs and chart data for the given period and filters.
 */
export async function getOverview(params = {}) {
  const {
    datePreset = 'this_month',
    startDate,
    endDate,
    compareMode = 'none',
    stationId,
    driverId,
    payrollMonth,
    insuranceYear,
  } = params;

  const { start, end } = resolveDateRange(datePreset, startDate, endDate);
  const comparison = getComparisonRange(compareMode, start, end);

  const monthStr = start.slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // Find day for "worked/routes" KPI: yesterday if it has rows,
  // otherwise latest previous day that has any route rows.
  let driversRoutesDate = yesterday;
  let driversWorkedToday = 0;
  let routesCompletedToday = 0;
  const latestRoutesDayRes = await query(
    `WITH by_day AS (
       SELECT day_key, COUNT(*)::int AS routes_cnt
       FROM daily_upload_rows
       GROUP BY day_key
     )
     SELECT to_char(day_key, 'YYYY-MM-DD') AS day_key
     FROM by_day
     WHERE routes_cnt > 0
       AND day_key < CURRENT_DATE
     ORDER BY day_key DESC
     LIMIT 1`,
  );
  const latestRoutesDay = latestRoutesDayRes.rows[0]?.day_key || null;
  const preferredDay = latestRoutesDay || yesterday;
  const dayRes = await query(
    `SELECT
       COUNT(*)::int AS routes_cnt,
       COUNT(DISTINCT transporter_id)::int AS drivers_cnt
     FROM daily_upload_rows
     WHERE day_key = $1`,
    [preferredDay],
  );
  driversRoutesDate = preferredDay;
  routesCompletedToday = Number(dayRes.rows[0]?.routes_cnt || 0);
  driversWorkedToday = Number(dayRes.rows[0]?.drivers_cnt || 0);

  // Parallel KPI queries
  const [
    activeDriversRes,
    payrollTotalsRes,
    vorschussRes,
    abzugTotalsRes,
    carsKpisRes,
    expiringDocsRes,
    newHiresRes,
    terminationsRes,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS cnt FROM kenjo_employees WHERE is_active = true`
    ),
    query(
      `SELECT COALESCE(SUM(total_bonus), 0)::numeric AS total FROM payroll_manual_entries WHERE period_id = $1`,
      [lastMonthStr]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM vorschuss WHERE month = $1`,
      [lastMonthStr]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payroll_abzug_items WHERE period_id = $1`,
      [lastMonthStr]
    ),
    query(`
      SELECT
        COUNT(*)::int AS total_vehicles,
        COUNT(*) FILTER (WHERE status = $1)::int AS active_vehicles,
        COUNT(*) FILTER (WHERE status = $2)::int AS in_maintenance,
        COUNT(*) FILTER (WHERE status = $3)::int AS out_of_service,
        COUNT(*) FILTER (WHERE assigned_driver_id IS NULL OR assigned_driver_id = '')::int AS without_driver
      FROM cars
    `, [CAR_STATUS_ACTIVE, CAR_STATUS_MAINTENANCE, CAR_STATUS_OUT_OF_SERVICE]),
    query(`
      SELECT
        (
          COALESCE(
            (SELECT COUNT(*) FROM car_documents d
             WHERE d.expiry_date IS NOT NULL
               AND d.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
               AND d.expiry_date >= CURRENT_DATE),
            0
          )
          +
          COALESCE(
            (SELECT COUNT(*) FROM cars c
             WHERE c.registration_expiry IS NOT NULL
               AND c.registration_expiry <= CURRENT_DATE + INTERVAL '30 days'
               AND c.registration_expiry >= CURRENT_DATE),
            0
          )
        )::int AS cnt
    `),
    query(
      `SELECT COUNT(*)::int AS cnt FROM kenjo_employees WHERE start_date >= $1 AND start_date <= $2 AND is_active = true`,
      [monthStr + '-01', end]
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM employee_terminations WHERE termination_date >= $1 AND termination_date <= $2`,
      [start, end]
    ),
  ]);

  const activeDrivers = activeDriversRes.rows[0]?.cnt ?? 0;
  const totalPayroll = Number(payrollTotalsRes.rows[0]?.total ?? 0);
  const totalAdvances = Number(vorschussRes.rows[0]?.total ?? 0);
  const totalDeductions = Number(abzugTotalsRes.rows[0]?.total ?? 0);
  const carsRow = carsKpisRes.rows[0] || {};
  const vehiclesInMaintenance = carsRow.in_maintenance ?? 0;
  const expiringDocuments = expiringDocsRes.rows[0]?.cnt ?? 0;
  const newHires = newHiresRes.rows[0]?.cnt ?? 0;
  const terminations = terminationsRes.rows[0]?.cnt ?? 0;

  // Route completion rate: from daily_upload_rows with status COMPLETE if we have it
  let routeCompletionRate = 0;
  try {
    const rateRes = await query(
      `SELECT COUNT(*) FILTER (WHERE raw_data->>'Status des Fortschritts' = 'COMPLETE' OR status_fortschritts = 'COMPLETE')::int AS complete,
              COUNT(*)::int AS total FROM daily_upload_rows WHERE day_key >= $1 AND day_key <= $2`,
      [start, end]
    );
    const r = rateRes.rows[0];
    if (r && r.total > 0) routeCompletionRate = Math.round((Number(r.complete) / Number(r.total)) * 100);
    else {
      const anyRes = await query(`SELECT COUNT(*)::int AS total FROM daily_upload_rows WHERE day_key >= $1 AND day_key <= $2`, [start, end]);
      routeCompletionRate = (anyRes.rows[0]?.total ?? 0) > 0 ? 100 : 0;
    }
  } catch (_) {
    routeCompletionRate = routesCompletedToday > 0 ? 100 : 0;
  }

  // Attendance rate: approximate from Kenjo or daily_upload presence
  let attendanceRate = 0;
  try {
    const expectedDays = activeDrivers * Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000));
    const presentRes = await query(
      `SELECT COUNT(DISTINCT (day_key, transporter_id))::int AS cnt FROM daily_upload_rows WHERE day_key >= $1 AND day_key <= $2 AND transporter_id IS NOT NULL AND transporter_id != ''`,
      [start, end]
    );
    const present = presentRes.rows[0]?.cnt ?? 0;
    attendanceRate = expectedDays > 0 ? Math.min(100, Math.round((present / expectedDays) * 100)) : 0;
  } catch (_) {}

  const kpis = [
    { key: 'active_drivers', value: activeDrivers, label: 'Active Drivers', format: 'number' },
    { key: 'drivers_worked_yesterday', value: driversWorkedToday, label: 'Drivers Worked Yesterday', format: 'number' },
    { key: 'routes_completed_yesterday', value: routesCompletedToday, label: 'Routes Completed Yesterday', format: 'number' },
    { key: 'route_completion_rate', value: routeCompletionRate, label: 'Route Completion Rate', format: 'percent' },
    { key: 'attendance_rate', value: attendanceRate, label: 'Attendance Rate', format: 'percent' },
    { key: 'total_payroll_last_month', value: totalPayroll, label: 'Total Payroll Last Month', format: 'currency' },
    { key: 'total_advances_last_month', value: totalAdvances, label: 'Total Advances Last Month', format: 'currency' },
    { key: 'total_deductions_last_month', value: totalDeductions, label: 'Total Deductions Last Month', format: 'currency' },
    { key: 'vehicles_in_maintenance', value: vehiclesInMaintenance, label: 'Vehicles in Maintenance', format: 'number' },
    { key: 'expiring_documents_30_days', value: expiringDocuments, label: 'Expiring Documents in 30 Days', format: 'number' },
    { key: 'new_hires_this_month', value: newHires, label: 'New Hires This Month', format: 'number' },
    { key: 'terminations_this_month', value: terminations, label: 'Terminations This Month', format: 'number' },
  ];

  // Universal analytics MVP: include Insurance overview KPIs in the executive panel.
  if (insuranceYear != null) {
    try {
      const insuranceKpis = await getInsuranceOverviewKpis(insuranceYear);
      kpis.push(...insuranceKpis);
    } catch (e) {
      // Keep overview working even if insurance KPIs fail.
      console.error('Failed to load insurance KPIs for analytics overview:', e);
    }
  }

  // Chart data: routes by day, driver status, vehicles by status
  let routesByDay = [];
  let routesDriversByDay = [];
  let driverStatusDistribution = [];
  let vehiclesByStatus = [];
  let insuranceVehiclesByStatus = [];
  let payrollByMonth = [];
  let hrMovementByMonth = [];
  let scoreTrend = [];

  try {
    const byDayRes = await query(
      `SELECT
         to_char(day_key, 'YYYY-MM-DD') AS date,
         COUNT(*)::int AS count,
         COUNT(DISTINCT transporter_id)::int AS drivers
       FROM daily_upload_rows
       WHERE day_key >= $1 AND day_key <= $2
       GROUP BY day_key
       ORDER BY day_key`,
      [start, end]
    );
    routesDriversByDay = (byDayRes.rows || []).map((row) => ({
      date: row.date,
      count: toNumber(row.count),
      drivers: toNumber(row.drivers),
      routes_per_driver: toNumber(row.drivers) > 0 ? roundTo(toNumber(row.count) / toNumber(row.drivers), 2) : 0,
    }));
    routesByDay = routesDriversByDay.map((row) => ({ date: row.date, count: row.count }));
  } catch (_) {}

  try {
    const statusRes = await query(
      `SELECT COALESCE(is_active::text, 'unknown') AS status, COUNT(*)::int AS count FROM kenjo_employees GROUP BY is_active`
    );
    driverStatusDistribution = statusRes.rows.map((r) => ({ label: r.status === 'true' ? 'Active' : 'Inactive', value: r.count }));
  } catch (_) {}

  try {
    const vStatusRes = await query(
      `SELECT COALESCE(status, 'Unknown') AS status, COUNT(*)::int AS count FROM cars GROUP BY status`
    );
    vehiclesByStatus = vStatusRes.rows || [];
  } catch (_) {}

  // Insurance charts (status distribution)
  if (insuranceYear != null) {
    try {
      const chartRes = await query(
        `
          SELECT COALESCE(status, 'Unknown') AS status, COUNT(*)::int AS count
          FROM insurance_vehicle_records
          WHERE insurance_year = $1
          GROUP BY status
        `,
        [Number(insuranceYear)],
      );
      insuranceVehiclesByStatus = (chartRes.rows || []).map((r) => ({
        label: r.status,
        value: Number(r.count || 0),
      }));
    } catch (_) {}
  }

  /** Most recent company scorecard rows (chronological within the slice). */
  let companyScorecardRecent = [];
  try {
    const scRes = await query(
      `SELECT year, week, overall_tier, overall_score
       FROM company_scorecard
       ORDER BY year DESC, week DESC
       LIMIT 4`,
    );
    companyScorecardRecent = (scRes.rows || [])
      .reverse()
      .map((r) => ({
        year: r.year,
        week: r.week,
        week_label: `${r.year} W${String(r.week).padStart(2, '0')}`,
        overall_tier: r.overall_tier != null && String(r.overall_tier).trim() !== '' ? String(r.overall_tier).trim() : '—',
        overall_score: r.overall_score != null ? Number(r.overall_score) : null,
      }));
  } catch (_) {}

  try {
    const payrollEndMonth = end.slice(0, 7);
    const payrollStartMonth = shiftMonthKey(payrollEndMonth, -5);
    const payrollRes = await query(
      `SELECT
         period_id AS month_key,
         COUNT(*)::int AS employees,
         COALESCE(SUM(total_bonus), 0)::numeric AS total_bonus,
         COALESCE(SUM(bonus), 0)::numeric AS bonus,
         COALESCE(SUM(vorschuss), 0)::numeric AS vorschuss,
         COALESCE(SUM(abzug), 0)::numeric AS abzug
       FROM payroll_manual_entries
       WHERE period_id >= $1 AND period_id <= $2
       GROUP BY period_id
       ORDER BY period_id`,
      [payrollStartMonth, payrollEndMonth],
    );
    payrollByMonth = buildMonthKeyRange(payrollStartMonth, payrollEndMonth).map((monthKey) => {
      const row = (payrollRes.rows || []).find((entry) => entry.month_key === monthKey) || {};
      return {
        month_key: monthKey,
        employees: toNumber(row.employees),
        total_bonus: roundTo(row.total_bonus, 2),
        bonus: roundTo(row.bonus, 2),
        vorschuss: roundTo(row.vorschuss, 2),
        abzug: roundTo(row.abzug, 2),
      };
    });
  } catch (_) {}

  try {
    const hrEndMonth = end.slice(0, 7);
    const hrStartMonth = shiftMonthKey(hrEndMonth, -5);
    const hrStartDate = `${hrStartMonth}-01`;
    const [hiresRes, termsRes] = await Promise.all([
      query(
        `SELECT to_char(date_trunc('month', start_date::date), 'YYYY-MM') AS month_key, COUNT(*)::int AS hires
         FROM kenjo_employees
         WHERE start_date::date >= $1::date AND start_date::date <= $2::date
         GROUP BY date_trunc('month', start_date::date)
         ORDER BY month_key`,
        [hrStartDate, end],
      ),
      query(
        `SELECT to_char(date_trunc('month', termination_date::date), 'YYYY-MM') AS month_key, COUNT(*)::int AS terminations
         FROM employee_terminations
         WHERE termination_date::date >= $1::date AND termination_date::date <= $2::date
         GROUP BY date_trunc('month', termination_date::date)
         ORDER BY month_key`,
        [hrStartDate, end],
      ),
    ]);
    const hiresMap = new Map((hiresRes.rows || []).map((row) => [row.month_key, toNumber(row.hires)]));
    const termsMap = new Map((termsRes.rows || []).map((row) => [row.month_key, toNumber(row.terminations)]));
    hrMovementByMonth = buildMonthKeyRange(hrStartMonth, hrEndMonth).map((monthKey) => {
      const hires = hiresMap.get(monthKey) || 0;
      const terminations = termsMap.get(monthKey) || 0;
      return {
        month_key: monthKey,
        hires,
        terminations,
        net: hires - terminations,
      };
    });
  } catch (_) {}

  try {
    const scoreTrendRes = await query(
      `SELECT year, week, overall_score, safe_driving_fico, delivery_completion_rate_dcr, capacity_reliability
       FROM company_scorecard
       ORDER BY year DESC, week DESC
       LIMIT 12`,
    );
    scoreTrend = (scoreTrendRes.rows || [])
      .reverse()
      .map((row) => ({
        week_label: `${row.year} W${String(row.week).padStart(2, '0')}`,
        overall_score: row.overall_score != null ? toNumber(row.overall_score) : null,
        safe_driving_fico: row.safe_driving_fico != null ? toNumber(row.safe_driving_fico) : null,
        delivery_completion_rate_dcr: row.delivery_completion_rate_dcr != null ? toNumber(row.delivery_completion_rate_dcr) : null,
        capacity_reliability: row.capacity_reliability != null ? toNumber(row.capacity_reliability) : null,
      }));
  } catch (_) {}

  return {
    period: { start, end },
    comparison: comparison ? { start: comparison.start, end: comparison.end } : null,
    kpiContext: {
      driversRoutesDate,
    },
    kpis,
    companyScorecardRecent,
    charts: {
      routesByDay,
      routesDriversByDay,
      driverStatusDistribution,
      vehiclesByStatus,
      insuranceVehiclesByStatus,
      payrollByMonth,
      hrMovementByMonth,
      scoreTrend,
    },
  };
}

/**
 * Filter meta for dropdowns: stations, drivers, etc.
 */
export async function getFiltersMeta() {
  const [driversRes, stationsRes, vehiclesRes] = await Promise.all([
    query(`SELECT kenjo_user_id AS id, first_name, last_name, display_name FROM kenjo_employees WHERE is_active = true ORDER BY last_name, first_name`),
    query(`SELECT DISTINCT station AS id FROM cars WHERE station IS NOT NULL AND station != '' ORDER BY station`).catch(() => ({ rows: [] })),
    query(`SELECT id, vehicle_id, license_plate FROM cars ORDER BY vehicle_id`),
  ]);

  const drivers = (driversRes.rows || []).map((r) => ({
    id: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.display_name || r.id,
  }));
  const stations = (stationsRes.rows || []).map((r) => ({ id: r.id, label: r.id }));
  const vehicles = (vehiclesRes.rows || []).map((r) => ({
    id: String(r.id),
    label: r.license_plate || r.vehicle_id,
  }));

  const payrollMonths = [];
  const d = new Date();
  for (let i = 0; i < 24; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() - i;
    const year = m <= 0 ? y - 1 : y;
    const month = m <= 0 ? m + 12 : m;
    payrollMonths.push({
      id: `${year}-${String(month).padStart(2, '0')}`,
      label: `${year}-${String(month).padStart(2, '0')}`,
    });
  }

  return {
    drivers,
    stations,
    vehicles,
    payrollMonths,
    routeStatuses: [
      { id: 'COMPLETE', label: 'Complete' },
      { id: 'IN_PROGRESS', label: 'In Progress' },
      { id: 'FAILED', label: 'Failed' },
    ],
    employeeStatuses: [
      { id: 'active', label: 'Active' },
      { id: 'inactive', label: 'Inactive' },
    ],
  };
}

/**
 * Domain-specific analytics: operations, drivers, payroll, etc.
 */
export async function getDomainData(domain, params = {}) {
  const { startDate, endDate, groupBy = 'day', limit = 100, insuranceYear } = params;
  const start = (startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const end = (endDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

  if (domain === 'operations') {
    const res = await query(
      `SELECT day_key AS date, COUNT(*)::int AS routes_completed, COUNT(DISTINCT transporter_id)::int AS drivers_worked
       FROM daily_upload_rows WHERE day_key >= $1 AND day_key <= $2 AND transporter_id IS NOT NULL AND transporter_id != ''
       GROUP BY day_key ORDER BY day_key`,
      [start, end]
    );
    const rows = (res.rows || []).map((row) => ({
      date: row.date,
      routes_completed: toNumber(row.routes_completed),
      drivers_worked: toNumber(row.drivers_worked),
      routes_per_driver: toNumber(row.drivers_worked) > 0 ? roundTo(toNumber(row.routes_completed) / toNumber(row.drivers_worked), 2) : 0,
    }));
    const totalRoutes = rows.reduce((sum, row) => sum + row.routes_completed, 0);
    const totalDriversWorked = rows.reduce((sum, row) => sum + row.drivers_worked, 0);
    const busiestDay = rows.reduce((best, row) => (row.routes_completed > (best?.routes_completed || 0) ? row : best), null);
    return {
      summary: rows,
      table: rows,
      charts: {
        dailyVolume: rows,
        productivityByDay: rows.map((row) => ({
          date: row.date,
          routes_per_driver: row.routes_per_driver,
        })),
      },
      kpis: [
        { key: 'operations_total_routes', label: 'Total routes in range', value: totalRoutes, format: 'number' },
        { key: 'operations_avg_routes_per_day', label: 'Average routes per day', value: rows.length ? roundTo(totalRoutes / rows.length, 1) : 0, format: 'number' },
        { key: 'operations_avg_routes_per_driver', label: 'Average routes per active driver-day', value: totalDriversWorked ? roundTo(totalRoutes / totalDriversWorked, 2) : 0, format: 'number' },
        { key: 'operations_peak_day_routes', label: 'Peak day routes', value: busiestDay?.routes_completed || 0, format: 'number' },
      ],
    };
  }

  if (domain === 'insurance') {
    return getInsuranceDomainData({
      startDate: start,
      endDate: end,
      insuranceYear,
      limit,
    });
  }

  if (domain === 'damages') {
    return getDamagesDomainData({
      startDate: start,
      endDate: end,
      limit,
    });
  }

  if (domain === 'drivers') {
    const res = await query(
      `SELECT NULLIF(TRIM(COALESCE(k.employee_number, '')), '') AS employee_number,
        k.first_name, k.last_name, k.start_date::date AS start_date, k.contract_end::date AS contract_end, k.is_active,
        (SELECT COUNT(*) FROM daily_upload_rows d WHERE d.transporter_id = k.transporter_id AND d.day_key >= $1 AND d.day_key <= $2) AS routes_completed
       FROM kenjo_employees k
       WHERE k.transporter_id IS NOT NULL AND k.transporter_id != ''
       ORDER BY k.last_name, k.first_name
       LIMIT $3`,
      [start, end, limit]
    );
    const rows = (res.rows || []).map((r) => ({
      pn: formatPersonalNumber(r.employee_number) ?? '—',
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || '—',
      start_date: r.start_date,
      contract_end: r.contract_end,
      is_active: r.is_active,
      routes_completed: Number(r.routes_completed) || 0,
    }));
    return { table: rows, summary: { total: rows.length } };
  }

  if (domain === 'payroll') {
    const monthStr = params.payrollMonth || start.slice(0, 7);
    const [res, monthlyRes] = await Promise.all([
      query(
        `SELECT period_id, kenjo_employee_id, working_days, total_bonus, abzug, bonus, vorschuss
         FROM payroll_manual_entries
         WHERE period_id = $1
         ORDER BY total_bonus DESC NULLS LAST
         LIMIT $2`,
        [monthStr, limit]
      ),
      query(
        `SELECT
           period_id AS month_key,
           COUNT(*)::int AS employees,
           COALESCE(SUM(total_bonus), 0)::numeric AS total_bonus,
           COALESCE(SUM(bonus), 0)::numeric AS bonus,
           COALESCE(SUM(vorschuss), 0)::numeric AS vorschuss,
           COALESCE(SUM(abzug), 0)::numeric AS abzug
         FROM payroll_manual_entries
         WHERE period_id >= $1 AND period_id <= $2
         GROUP BY period_id
         ORDER BY period_id`,
        [shiftMonthKey(monthStr, -11), monthStr]
      ),
    ]);
    const rows = (res.rows || []).map((r) => ({
      period_id: r.period_id,
      kenjo_employee_id: r.kenjo_employee_id,
      working_days: toNumber(r.working_days),
      total_bonus: roundTo(r.total_bonus, 2),
      abzug: roundTo(r.abzug, 2),
      bonus: roundTo(r.bonus, 2),
      vorschuss: roundTo(r.vorschuss, 2),
    }));
    const totals = rows.reduce(
      (acc, r) => {
        acc.total_bonus += toNumber(r.total_bonus);
        acc.abzug += toNumber(r.abzug);
        acc.vorschuss += toNumber(r.vorschuss);
        acc.bonus += toNumber(r.bonus);
        return acc;
      },
      { total_bonus: 0, abzug: 0, vorschuss: 0, bonus: 0 }
    );
    const monthlyMap = new Map((monthlyRes.rows || []).map((row) => [row.month_key, row]));
    const monthlyTotals = buildMonthKeyRange(shiftMonthKey(monthStr, -11), monthStr).map((monthKey) => {
      const row = monthlyMap.get(monthKey) || {};
      return {
        month_key: monthKey,
        employees: toNumber(row.employees),
        total_bonus: roundTo(row.total_bonus, 2),
        bonus: roundTo(row.bonus, 2),
        vorschuss: roundTo(row.vorschuss, 2),
        abzug: roundTo(row.abzug, 2),
      };
    });
    return {
      table: rows,
      summary: totals,
      charts: {
        monthlyTotals,
      },
      kpis: [
        { key: 'payroll_current_total', label: `Total variable payroll (${monthStr})`, value: roundTo(totals.total_bonus, 2), format: 'currency' },
        { key: 'payroll_current_bonus', label: `Bonus total (${monthStr})`, value: roundTo(totals.bonus, 2), format: 'currency' },
        { key: 'payroll_current_advances', label: `Advances total (${monthStr})`, value: roundTo(totals.vorschuss, 2), format: 'currency' },
        { key: 'payroll_avg_per_employee', label: `Average per employee (${monthStr})`, value: rows.length ? roundTo(totals.total_bonus / rows.length, 2) : 0, format: 'currency' },
      ],
    };
  }

  if (domain === 'attendance') {
    const res = await query(
      `SELECT day_key AS date, COUNT(DISTINCT transporter_id)::int AS present FROM daily_upload_rows
       WHERE day_key >= $1 AND day_key <= $2 AND transporter_id IS NOT NULL AND transporter_id != ''
       GROUP BY day_key ORDER BY day_key`,
      [start, end]
    );
    const rows = (res.rows || []).map((row) => ({
      date: row.date,
      present: toNumber(row.present),
    }));
    const bestDay = rows.reduce((best, row) => (row.present > (best?.present || 0) ? row : best), null);
    const totalPresent = rows.reduce((sum, row) => sum + row.present, 0);
    return {
      table: rows,
      summary: { days: rows.length },
      charts: { dailyPresence: rows },
      kpis: [
        { key: 'attendance_total_presence', label: 'Driver presence records', value: totalPresent, format: 'number' },
        { key: 'attendance_avg_presence', label: 'Average drivers present per day', value: rows.length ? roundTo(totalPresent / rows.length, 1) : 0, format: 'number' },
        { key: 'attendance_peak_day', label: 'Highest attendance day', value: bestDay?.present || 0, format: 'number' },
      ],
    };
  }

  if (domain === 'routes') {
    const [dailyRes, weekRes, monthRes] = await Promise.all([
      query(
        `SELECT day_key::date AS date, COUNT(*)::int AS routes
         FROM daily_upload_rows WHERE day_key >= $1::date AND day_key <= $2::date
         GROUP BY day_key ORDER BY day_key`,
        [start, end],
      ),
      query(
        `SELECT (date_trunc('week', day_key::timestamp))::date AS week_start, COUNT(*)::int AS routes
         FROM daily_upload_rows
         WHERE day_key >= $1::date AND day_key <= $2::date
         GROUP BY date_trunc('week', day_key::timestamp)
         ORDER BY week_start`,
        [start, end],
      ),
      query(
        `SELECT to_char(date_trunc('month', day_key::timestamp), 'YYYY-MM') AS month_key, COUNT(*)::int AS routes
         FROM daily_upload_rows
         WHERE day_key >= $1::date AND day_key <= $2::date
         GROUP BY date_trunc('month', day_key::timestamp)
         ORDER BY month_key`,
        [start, end],
      ),
    ]);
    const table = dailyRes.rows || [];
    const totalsWeekly = weekRes.rows || [];
    const totalsMonthly = monthRes.rows || [];
    const total = table.reduce((s, r) => s + toNumber(r.routes), 0);
    const totalWeeks = totalsWeekly.reduce((s, r) => s + toNumber(r.routes), 0);
    const totalMonths = totalsMonthly.reduce((s, r) => s + toNumber(r.routes), 0);
    const peakDay = table.reduce((best, row) => (toNumber(row.routes) > toNumber(best?.routes) ? row : best), null);
    const peakWeek = totalsWeekly.reduce((best, row) => (toNumber(row.routes) > toNumber(best?.routes) ? row : best), null);
    return {
      table,
      totalsWeekly,
      totalsMonthly,
      charts: {
        dailyRoutes: table,
        weeklyRoutes: totalsWeekly,
        monthlyRoutes: totalsMonthly,
      },
      summary: {
        total,
        total_weeks_sum: totalWeeks,
        total_months_sum: totalMonths,
        weeks_in_range: totalsWeekly.length,
        months_in_range: totalsMonthly.length,
      },
      kpis: [
        { key: 'routes_total', label: 'Total routes in range', value: total, format: 'number' },
        { key: 'routes_avg_day', label: 'Average routes per day', value: table.length ? roundTo(total / table.length, 1) : 0, format: 'number' },
        { key: 'routes_avg_week', label: 'Average routes per week', value: totalsWeekly.length ? roundTo(totalWeeks / totalsWeekly.length, 1) : 0, format: 'number' },
        { key: 'routes_peak_day', label: 'Peak day routes', value: toNumber(peakDay?.routes), format: 'number' },
        { key: 'routes_peak_week', label: 'Peak week routes', value: toNumber(peakWeek?.routes), format: 'number' },
      ],
    };
  }

  if (domain === 'performance') {
    const res = await query(
      `SELECT year, week, overall_tier, overall_score, rank_at_dbx9, rank_wow,
        safe_driving_fico, vsa_compliance, speeding_event_rate, breach_of_contract,
        mentor_adoption_rate, working_hours_compliance, comprehensive_audit_score,
        delivery_completion_rate_dcr, customer_escalation_dpmo, dnr_dpmo, lor_dpmo, dsc_dpmo,
        photo_on_delivery_pod, contact_compliance, customer_delivery_feedback_dpmo,
        capacity_reliability, recommended_focus_areas
       FROM company_scorecard
       ORDER BY year DESC, week DESC
       LIMIT $1`,
      [Math.min(104, Math.max(12, Number(limit) || 52))],
    );
    const rows = (res.rows || []).reverse().map((r) => ({
      year: r.year,
      week: r.week,
      week_label: `${r.year} W${String(r.week).padStart(2, '0')}`,
      overall_tier: r.overall_tier,
      overall_score: r.overall_score != null ? Number(r.overall_score) : null,
      rank_at_dbx9: r.rank_at_dbx9,
      rank_wow: r.rank_wow,
      safe_driving_fico: r.safe_driving_fico,
      vsa_compliance: r.vsa_compliance,
      speeding_event_rate: r.speeding_event_rate,
      breach_of_contract: r.breach_of_contract,
      mentor_adoption_rate: r.mentor_adoption_rate,
      working_hours_compliance: r.working_hours_compliance,
      comprehensive_audit_score: r.comprehensive_audit_score,
      delivery_completion_rate_dcr: r.delivery_completion_rate_dcr,
      customer_escalation_dpmo: r.customer_escalation_dpmo,
      dnr_dpmo: r.dnr_dpmo,
      lor_dpmo: r.lor_dpmo,
      dsc_dpmo: r.dsc_dpmo,
      photo_on_delivery_pod: r.photo_on_delivery_pod,
      contact_compliance: r.contact_compliance,
      customer_delivery_feedback_dpmo: r.customer_delivery_feedback_dpmo,
      capacity_reliability: r.capacity_reliability,
      recommended_focus_areas: r.recommended_focus_areas,
    }));
    const latest = rows[rows.length - 1] || null;
    const bestWeek = rows.reduce((best, row) => (toNumber(row.overall_score) > toNumber(best?.overall_score) ? row : best), null);
    const avgScore = rows.length ? roundTo(rows.reduce((sum, row) => sum + toNumber(row.overall_score), 0) / rows.length, 1) : 0;
    return {
      table: rows,
      summary: { rows: rows.length },
      charts: {
        overallScoreTrend: rows.map((row) => ({
          week_label: row.week_label,
          overall_score: toNumber(row.overall_score),
          safe_driving_fico: toNumber(row.safe_driving_fico),
          delivery_completion_rate_dcr: toNumber(row.delivery_completion_rate_dcr),
          capacity_reliability: toNumber(row.capacity_reliability),
        })),
      },
      kpis: [
        { key: 'performance_latest_score', label: 'Latest overall score', value: toNumber(latest?.overall_score), format: 'number' },
        { key: 'performance_average_score', label: 'Average overall score', value: avgScore, format: 'number' },
        { key: 'performance_best_week', label: 'Best weekly score', value: toNumber(bestWeek?.overall_score), format: 'number' },
        { key: 'performance_latest_rank', label: 'Latest rank at DBX9', value: toNumber(latest?.rank_at_dbx9), format: 'number' },
      ],
    };
  }

  if (domain === 'fleet') {
    const [res, totalsRes] = await Promise.all([
      query(`SELECT status, COUNT(*)::int AS count FROM cars GROUP BY status`),
      query(`
        SELECT
          COUNT(*)::int AS total_vehicles,
          COUNT(*) FILTER (WHERE assigned_driver_id IS NULL OR assigned_driver_id = '')::int AS without_driver,
          COUNT(*) FILTER (WHERE status = $1)::int AS active_vehicles,
          COUNT(*) FILTER (WHERE status = $2)::int AS maintenance_vehicles
        FROM cars
      `, [CAR_STATUS_ACTIVE, CAR_STATUS_MAINTENANCE]),
    ]);
    const totalsRow = totalsRes.rows[0] || {};
    const totalVehicles = toNumber(totalsRow.total_vehicles);
    const withoutDriver = toNumber(totalsRow.without_driver);
    const assignmentCoverage = totalVehicles > 0 ? roundTo(((totalVehicles - withoutDriver) / totalVehicles) * 100, 1) : 0;
    return {
      table: res.rows || [],
      summary: res.rows?.reduce((a, r) => ({ ...a, [r.status]: r.count }), {}) || {},
      charts: {
        statusDistribution: (res.rows || []).map((row) => ({ label: row.status || 'Unknown', value: toNumber(row.count) })),
        assignmentCoverage: [
          { label: 'Assigned', value: Math.max(0, totalVehicles - withoutDriver) },
          { label: 'Without driver', value: withoutDriver },
        ],
      },
      kpis: [
        { key: 'fleet_total_vehicles', label: 'Total fleet vehicles', value: totalVehicles, format: 'number' },
        { key: 'fleet_active_vehicles', label: 'Active vehicles', value: toNumber(totalsRow.active_vehicles), format: 'number' },
        { key: 'fleet_maintenance_vehicles', label: 'Vehicles in maintenance', value: toNumber(totalsRow.maintenance_vehicles), format: 'number' },
        { key: 'fleet_assignment_coverage', label: 'Assignment coverage', value: assignmentCoverage, format: 'percent' },
      ],
    };
  }

  if (domain === 'hr') {
    const [newHiresRes, termsRes] = await Promise.all([
      query(
        `SELECT (start_date::date) AS start_date, COUNT(*)::int AS cnt
         FROM kenjo_employees
         WHERE start_date::date >= $1::date AND start_date::date <= $2::date
         GROUP BY start_date::date
         ORDER BY start_date`,
        [start, end],
      ),
      query(
        `SELECT (termination_date::date) AS termination_date, COUNT(*)::int AS cnt
         FROM employee_terminations
         WHERE termination_date::date >= $1::date AND termination_date::date <= $2::date
         GROUP BY termination_date::date
        ORDER BY termination_date`,
        [start, end],
      ),
    ]);
    const hiresTotal = (newHiresRes.rows || []).reduce((sum, row) => sum + toNumber(row.cnt), 0);
    const terminationsTotal = (termsRes.rows || []).reduce((sum, row) => sum + toNumber(row.cnt), 0);
    const monthlyStart = shiftMonthKey(end.slice(0, 7), -11);
    const monthlyStartDate = `${monthlyStart}-01`;
    const [hiresMonthlyRes, termsMonthlyRes] = await Promise.all([
      query(
        `SELECT to_char(date_trunc('month', start_date::date), 'YYYY-MM') AS month_key, COUNT(*)::int AS hires
         FROM kenjo_employees
         WHERE start_date::date >= $1::date AND start_date::date <= $2::date
         GROUP BY date_trunc('month', start_date::date)
         ORDER BY month_key`,
        [monthlyStartDate, end],
      ),
      query(
        `SELECT to_char(date_trunc('month', termination_date::date), 'YYYY-MM') AS month_key, COUNT(*)::int AS terminations
         FROM employee_terminations
         WHERE termination_date::date >= $1::date AND termination_date::date <= $2::date
         GROUP BY date_trunc('month', termination_date::date)
         ORDER BY month_key`,
        [monthlyStartDate, end],
      ),
    ]);
    const hiresMonthlyMap = new Map((hiresMonthlyRes.rows || []).map((row) => [row.month_key, toNumber(row.hires)]));
    const termsMonthlyMap = new Map((termsMonthlyRes.rows || []).map((row) => [row.month_key, toNumber(row.terminations)]));
    const monthlyMovement = buildMonthKeyRange(monthlyStart, end.slice(0, 7)).map((monthKey) => {
      const hires = hiresMonthlyMap.get(monthKey) || 0;
      const terminations = termsMonthlyMap.get(monthKey) || 0;
      return {
        month_key: monthKey,
        hires,
        terminations,
        net: hires - terminations,
      };
    });
    return {
      newHires: newHiresRes.rows || [],
      terminations: termsRes.rows || [],
      charts: {
        monthlyMovement,
      },
      kpis: [
        { key: 'hr_hires_total', label: 'New hires in selected range', value: hiresTotal, format: 'number' },
        { key: 'hr_terminations_total', label: 'Terminations in selected range', value: terminationsTotal, format: 'number' },
        { key: 'hr_net_movement', label: 'Net employee movement', value: hiresTotal - terminationsTotal, format: 'number' },
      ],
    };
  }

  if (domain === 'safety') {
    const [statusRes, dailyRes] = await Promise.all([
      query(
        `SELECT COALESCE(NULLIF(TRIM(status), ''), 'Unknown') AS status, COUNT(*)::int AS count
         FROM pave_sessions
         WHERE created_at >= $1::date AND created_at < ($2::date + 1)
         GROUP BY COALESCE(NULLIF(TRIM(status), ''), 'Unknown')
         ORDER BY count DESC, status`,
        [start, end],
      ),
      query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS inspections
         FROM pave_sessions
         WHERE created_at >= $1::date AND created_at < ($2::date + 1)
         GROUP BY date_trunc('day', created_at)
         ORDER BY date`,
        [start, end],
      ),
    ]);
    const statusRows = (statusRes.rows || []).map((row) => ({ status: row.status, count: toNumber(row.count) }));
    const dailyRows = (dailyRes.rows || []).map((row) => ({ date: row.date, inspections: toNumber(row.inspections) }));
    const totalInspections = dailyRows.reduce((sum, row) => sum + row.inspections, 0);
    return {
      table: statusRows,
      charts: {
        statusDistribution: statusRows.map((row) => ({ label: row.status, value: row.count })),
        inspectionsByDay: dailyRows,
      },
      kpis: [
        { key: 'safety_total_inspections', label: 'PAVE inspections in range', value: totalInspections, format: 'number' },
        { key: 'safety_avg_per_day', label: 'Average inspections per day', value: dailyRows.length ? roundTo(totalInspections / dailyRows.length, 1) : 0, format: 'number' },
        { key: 'safety_status_count', label: 'Distinct inspection statuses', value: statusRows.length, format: 'number' },
      ],
    };
  }

  if (domain === 'compliance') {
    const res = await query(`
      SELECT document_type, expiry_date, COUNT(*)::int AS cnt FROM car_documents
      WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '90 days'
      GROUP BY document_type, expiry_date ORDER BY expiry_date
    `);
    const rows = (res.rows || []).map((row) => ({
      document_type: row.document_type,
      expiry_date: row.expiry_date,
      cnt: toNumber(row.cnt),
    }));
    const totalExpiring = rows.reduce((sum, row) => sum + row.cnt, 0);
    return {
      table: rows,
      kpis: [
        { key: 'compliance_expiring_docs', label: 'Expiring documents in next 90 days', value: totalExpiring, format: 'number' },
        { key: 'compliance_document_types', label: 'Document types affected', value: new Set(rows.map((row) => row.document_type)).size, format: 'number' },
      ],
    };
  }

  return { table: [], summary: {} };
}

/**
 * Drill-down: return detail rows for a metric (e.g. attendance detail, payroll detail).
 */
export async function getDrilldown(metricKey, params = {}) {
  const { startDate, endDate, limit = 50 } = params;
  const start = (startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const end = (endDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

  if (metricKey === 'attendance') {
    const res = await query(
      `SELECT day_key, transporter_id, driver_name, app_login, app_logout FROM daily_upload_rows WHERE day_key >= $1 AND day_key <= $2 ORDER BY day_key, transporter_id LIMIT $3`,
      [start, end, limit]
    );
    return { rows: res.rows || [] };
  }
  if (metricKey === 'payroll') {
    const month = (params.payrollMonth || start).slice(0, 7);
    const res = await query(
      `SELECT period_id, kenjo_employee_id, working_days, total_bonus, abzug, bonus, vorschuss FROM payroll_manual_entries WHERE period_id = $1 ORDER BY total_bonus DESC NULLS LAST LIMIT $2`,
      [month, limit]
    );
    return { rows: res.rows || [] };
  }
  if (metricKey === 'safety_incidents') {
    const res = await query(
      `SELECT id, session_key, car_id, driver_id, status, created_at FROM pave_sessions WHERE created_at >= $1::date AND created_at < ($2::date + 1) ORDER BY created_at DESC LIMIT $3`,
      [start, end, limit]
    );
    return { rows: res.rows || [] };
  }
  return { rows: [] };
}
