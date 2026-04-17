import { resolvePortalLocale } from './portalLocale.js';

/**
 * Shared KPI formatting & i18n keys for Analytics + Dashboard.
 * @param {unknown} value
 * @param {string} [format]
 */
export function formatKpiValue(value, format) {
  if (value == null) return '—';
  const n = Number(value);
  if (format === 'percent') return `${Number.isNaN(n) ? 0 : n}%`;
  if (format === 'currency') {
    return Number.isNaN(n)
      ? '0 €'
      : new Intl.NumberFormat(resolvePortalLocale(), {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
  }
  return Number.isNaN(n) ? String(value) : n.toLocaleString(resolvePortalLocale());
}

/** Maps API `kpi.key` to `analytics.kpis.*` translation suffix */
export const KPI_TRANSLATION_KEYS = {
  active_drivers: 'activeDrivers',
  drivers_worked_yesterday: 'driversWorkedYesterday',
  routes_completed_yesterday: 'routesCompletedYesterday',
  route_completion_rate: 'routeCompletionRate',
  attendance_rate: 'attendanceRate',
  total_payroll_last_month: 'totalPayrollLastMonth',
  total_advances_last_month: 'totalAdvancesLastMonth',
  total_deductions_last_month: 'totalDeductionsLastMonth',
  vehicles_in_maintenance: 'vehiclesInMaintenance',
  expiring_documents_30_days: 'expiringDocuments30Days',
  new_hires_this_month: 'newHiresThisMonth',
  terminations_this_month: 'terminationsThisMonth',

  insurance_total_vehicles: 'insuranceTotalVehicles',
  insurance_active_vehicles: 'insuranceActiveVehicles',
  insurance_cancelled_vehicles: 'insuranceCancelledVehicles',
  insurance_total_premium: 'insuranceTotalPremium',
  insurance_total_claims: 'insuranceTotalClaims',
  insurance_missing_vin: 'insuranceMissingVin',
  insurance_manufacturers_count: 'insuranceManufacturersCount',
  insurance_expiring_30d: 'insuranceExpiring30Days',
  insurance_data_completeness_pct: 'insuranceDataCompletenessPct',
};

/**
 * @param {{ key: string, label?: string }} kpi
 * @param {(key: string) => string} t - useAppSettings().t
 */
export function kpiLabel(kpi, t) {
  const key = KPI_TRANSLATION_KEYS[kpi.key] || kpi.key;
  const translated = t(`analytics.kpis.${key}`);
  if (translated && translated !== `analytics.kpis.${key}`) return translated;
  return kpi.label || key;
}
