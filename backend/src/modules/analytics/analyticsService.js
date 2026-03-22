/**
 * Analytics service: overview KPIs, domain data, filters meta.
 * All data driven from existing business tables.
 */
import { query } from '../../db.js';
import { getInsuranceOverviewKpis } from './insuranceAnalyticsService.js';
import { getInsuranceDomainData } from './insuranceAnalyticsService.js';
import { getDamagesDomainData } from './damagesAnalyticsService.js';

const CAR_STATUS_ACTIVE = 'Active';
const CAR_STATUS_MAINTENANCE = 'Maintenance';
const CAR_STATUS_OUT_OF_SERVICE = 'Out of Service';

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

  // Parallel KPI queries
  const [
    activeDriversRes,
    driversWorkedTodayRes,
    routesCompletedTodayRes,
    payrollTotalsRes,
    vorschussRes,
    abzugTotalsRes,
    carsKpisRes,
    expiringDocsRes,
    newHiresRes,
    terminationsRes,
    paveCountRes,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS cnt FROM kenjo_employees WHERE is_active = true`
    ),
    query(
      `SELECT COUNT(DISTINCT transporter_id)::int AS cnt FROM daily_upload_rows WHERE day_key = $1 AND transporter_id IS NOT NULL AND transporter_id != ''`,
      [today]
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM daily_upload_rows WHERE day_key = $1`,
      [today]
    ),
    query(
      `SELECT COALESCE(SUM(total_bonus), 0)::numeric AS total FROM payroll_manual_entries WHERE period_id = $1`,
      [monthStr]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM vorschuss WHERE month = $1`,
      [monthStr]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payroll_abzug_items WHERE period_id = $1`,
      [monthStr]
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
      SELECT COUNT(*)::int AS cnt FROM car_documents
      WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND expiry_date >= CURRENT_DATE
    `),
    query(
      `SELECT COUNT(*)::int AS cnt FROM kenjo_employees WHERE start_date >= $1 AND start_date <= $2 AND is_active = true`,
      [monthStr + '-01', end]
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM employee_terminations WHERE termination_date >= $1 AND termination_date <= $2`,
      [start, end]
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM pave_sessions WHERE created_at >= $1::date AND created_at < ($2::date + 1)`,
      [start, end]
    ),
  ]);

  const activeDrivers = activeDriversRes.rows[0]?.cnt ?? 0;
  const driversWorkedToday = driversWorkedTodayRes.rows[0]?.cnt ?? 0;
  const routesCompletedToday = routesCompletedTodayRes.rows[0]?.cnt ?? 0;
  const totalPayroll = Number(payrollTotalsRes.rows[0]?.total ?? 0);
  const totalAdvances = Number(vorschussRes.rows[0]?.total ?? 0);
  const totalDeductions = Number(abzugTotalsRes.rows[0]?.total ?? 0);
  const carsRow = carsKpisRes.rows[0] || {};
  const vehiclesInMaintenance = carsRow.in_maintenance ?? 0;
  const expiringDocuments = expiringDocsRes.rows[0]?.cnt ?? 0;
  const newHires = newHiresRes.rows[0]?.cnt ?? 0;
  const terminations = terminationsRes.rows[0]?.cnt ?? 0;
  const safetyIncidentsThisWeek = paveCountRes.rows[0]?.cnt ?? 0;

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
    { key: 'drivers_worked_today', value: driversWorkedToday, label: 'Drivers Worked Today', format: 'number' },
    { key: 'routes_completed_today', value: routesCompletedToday, label: 'Routes Completed Today', format: 'number' },
    { key: 'route_completion_rate', value: routeCompletionRate, label: 'Route Completion Rate', format: 'percent' },
    { key: 'attendance_rate', value: attendanceRate, label: 'Attendance Rate', format: 'percent' },
    { key: 'total_payroll_this_month', value: totalPayroll, label: 'Total Payroll This Month', format: 'currency' },
    { key: 'total_advances_this_month', value: totalAdvances, label: 'Total Advances This Month', format: 'currency' },
    { key: 'total_deductions_this_month', value: totalDeductions, label: 'Total Deductions This Month', format: 'currency' },
    { key: 'safety_incidents_this_week', value: safetyIncidentsThisWeek, label: 'Safety Incidents This Week', format: 'number' },
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
  let driverStatusDistribution = [];
  let vehiclesByStatus = [];
  let insuranceVehiclesByStatus = [];

  try {
    const byDayRes = await query(
      `SELECT day_key AS date, COUNT(*)::int AS count FROM daily_upload_rows WHERE day_key >= $1 AND day_key <= $2 GROUP BY day_key ORDER BY day_key`,
      [start, end]
    );
    routesByDay = byDayRes.rows || [];
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

  return {
    period: { start, end },
    comparison: comparison ? { start: comparison.start, end: comparison.end } : null,
    kpis,
    charts: {
      routesByDay,
      driverStatusDistribution,
      vehiclesByStatus,
      insuranceVehiclesByStatus,
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
    return { summary: res.rows, table: res.rows };
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
      `SELECT k.kenjo_user_id AS pn, k.first_name, k.last_name, k.start_date, k.contract_end, k.is_active,
        (SELECT COUNT(*) FROM daily_upload_rows d WHERE d.transporter_id = k.transporter_id AND d.day_key >= $1 AND d.day_key <= $2) AS routes_completed
       FROM kenjo_employees k
       WHERE k.transporter_id IS NOT NULL AND k.transporter_id != ''
       ORDER BY k.last_name, k.first_name
       LIMIT $3`,
      [start, end, limit]
    );
    const rows = (res.rows || []).map((r) => ({
      pn: r.pn,
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
    const res = await query(
      `SELECT period_id, kenjo_employee_id, working_days, total_bonus, abzug, bonus, vorschuss FROM payroll_manual_entries WHERE period_id = $1 ORDER BY total_bonus DESC NULLS LAST LIMIT $2`,
      [monthStr, limit]
    );
    const rows = (res.rows || []).map((r) => ({
      period_id: r.period_id,
      kenjo_employee_id: r.kenjo_employee_id,
      working_days: r.working_days,
      total_bonus: r.total_bonus,
      abzug: r.abzug,
      bonus: r.bonus,
      vorschuss: r.vorschuss,
    }));
    const totals = rows.reduce(
      (acc, r) => {
        acc.total_bonus += Number(r.total_bonus) || 0;
        acc.abzug += Number(r.abzug) || 0;
        acc.vorschuss += Number(r.vorschuss) || 0;
        return acc;
      },
      { total_bonus: 0, abzug: 0, vorschuss: 0 }
    );
    return { table: rows, summary: totals };
  }

  if (domain === 'attendance') {
    const res = await query(
      `SELECT day_key AS date, COUNT(DISTINCT transporter_id)::int AS present FROM daily_upload_rows
       WHERE day_key >= $1 AND day_key <= $2 AND transporter_id IS NOT NULL AND transporter_id != ''
       GROUP BY day_key ORDER BY day_key`,
      [start, end]
    );
    return { table: res.rows || [], summary: { days: (res.rows || []).length } };
  }

  if (domain === 'routes') {
    const res = await query(
      `SELECT day_key AS date, COUNT(*)::int AS routes FROM daily_upload_rows WHERE day_key >= $1 AND day_key <= $2 GROUP BY day_key ORDER BY day_key`,
      [start, end]
    );
    return { table: res.rows || [], summary: { total: (res.rows || []).reduce((s, r) => s + (r.routes || 0), 0) } };
  }

  if (domain === 'fleet') {
    const res = await query(
      `SELECT status, COUNT(*)::int AS count FROM cars GROUP BY status`
    );
    return { table: res.rows || [], summary: res.rows?.reduce((a, r) => ({ ...a, [r.status]: r.count }), {}) };
  }

  if (domain === 'hr') {
    const [newHiresRes, termsRes] = await Promise.all([
      query(`SELECT start_date, COUNT(*)::int AS cnt FROM kenjo_employees WHERE start_date >= $1 AND start_date <= $2 GROUP BY start_date ORDER BY start_date`, [start, end]),
      query(`SELECT termination_date, COUNT(*)::int AS cnt FROM employee_terminations WHERE termination_date >= $1 AND termination_date <= $2 GROUP BY termination_date ORDER BY termination_date`, [start, end]),
    ]);
    return {
      newHires: newHiresRes.rows || [],
      terminations: termsRes.rows || [],
    };
  }

  if (domain === 'compliance') {
    const res = await query(`
      SELECT document_type, expiry_date, COUNT(*)::int AS cnt FROM car_documents
      WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '90 days'
      GROUP BY document_type, expiry_date ORDER BY expiry_date
    `);
    return { table: res.rows || [] };
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
