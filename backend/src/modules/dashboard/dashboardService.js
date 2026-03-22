/**
 * Home dashboard: aggregates existing analytics + PAVE + damages + light “recent rows” queries.
 * No mock data — all from DB via existing services / SQL.
 */
import { query } from '../../db.js';
import { getOverview } from '../analytics/analyticsService.js';
import { getPaveGmailInspectionStats } from '../pave/paveGmailSyncService.js';
import { getDamagesDomainData } from '../analytics/damagesAnalyticsService.js';

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

  const [overview, paveInspections, damagesData, recentPaveRes, recentFinesRes] = await Promise.all([
    overviewPromise,
    pavePromise,
    damagesPromise,
    recentPavePromise,
    recentFinesPromise,
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
    recentPaveReports: recentPaveRes.rows || [],
    recentFines: recentFinesRes.rows || [],
  };
}
