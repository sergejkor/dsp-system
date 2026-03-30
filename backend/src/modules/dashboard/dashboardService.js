/**
 * Home dashboard: aggregates existing analytics + PAVE + damages + light “recent rows” queries.
 * No mock data — all from DB via existing services / SQL.
 */
import { query } from '../../db.js';
import { getOverview } from '../analytics/analyticsService.js';
import { getPaveGmailInspectionStats } from '../pave/paveGmailSyncService.js';
import { getDamagesDomainData } from '../analytics/damagesAnalyticsService.js';
import { getPublicIntakeSummary } from '../publicIntake/publicIntakeService.js';

let dashboardCarsWorkshopColumnsReady = false;

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

/**
 * @returns {Promise<import('./dashboardTypes.js').DashboardSummary>}
 */
export async function getDashboardSummary() {
  const insuranceYear = new Date().getFullYear();
  const { start: damagesStart, end: damagesEnd } = lastNDaysIso(90);
  await ensureDashboardCarsWorkshopColumns();

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

  const recentPavePromise = query(`
    SELECT
      pr.id,
      pr.plate_number,
      pr.status,
      pr.inspection_date,
      pr.report_date,
      pr.created_at,
      pr.driver_name,
      pr.total_grade
    FROM pave_reports pr
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
      c.planned_workshop_from::text AS planned_workshop_from,
      c.planned_workshop_to::text AS planned_workshop_to
    FROM cars c
    WHERE c.planned_workshop_from IS NOT NULL
      AND (
        c.planned_workshop_from BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        OR (
          c.planned_workshop_from <= CURRENT_DATE
          AND COALESCE(c.planned_workshop_to, c.planned_workshop_from) >= CURRENT_DATE
        )
      )
    ORDER BY c.planned_workshop_from ASC NULLS LAST, c.license_plate ASC NULLS LAST, c.vehicle_id ASC NULLS LAST
    LIMIT 8
  `).catch((err) => {
    console.error('[dashboard] workshop appointments failed', err);
    return { rows: [] };
  });

  const [overview, paveInspections, damagesData, intake, recentPaveRes, recentFinesRes, workshopAppointmentsRes] = await Promise.all([
    overviewPromise,
    pavePromise,
    damagesPromise,
    intakePromise,
    recentPavePromise,
    recentFinesPromise,
    workshopAppointmentsPromise,
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
    recentPaveReports: recentPaveRes.rows || [],
    recentFines: recentFinesRes.rows || [],
    recentWorkshopAppointments: workshopAppointmentsRes.rows || [],
  };
}
