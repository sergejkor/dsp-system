import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { getDashboardSummary } from '../services/dashboardApi.js';
import { formatKpiValue, kpiLabel } from '../utils/analyticsKpiDisplay.js';

/** Preferred order for executive KPIs from analytics overview (non-insurance first). */
const OVERVIEW_KPI_ORDER = [
  'active_drivers',
  'drivers_worked_yesterday',
  'routes_completed_yesterday',
  'route_completion_rate',
  'attendance_rate',
  'total_payroll_last_month',
  'total_advances_last_month',
  'total_deductions_last_month',
  'vehicles_in_maintenance',
  'expiring_documents_30_days',
  'new_hires_this_month',
  'terminations_this_month',
];

const DAMAGES_KPI_KEYS = [
  'damages_total_cases',
  'damages_open_cases',
  'damages_total_cost_alfamile',
  'damages_missing_files',
];

function formatTs(iso) {
  if (!iso) return '—';
  const s = String(iso);
  return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s;
}

function formatDateNormal(value) {
  if (!value) return '—';
  const raw = String(value).trim();
  if (raw.includes('T') || /\d{2}:\d{2}/.test(raw)) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${d}.${m}.${y}`;
    }
  }
  const s = raw.slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return raw;
  return `${d}.${m}.${y}`;
}

function formatDateRange(fromValue, toValue) {
  const from = formatDateNormal(fromValue);
  const to = formatDateNormal(toValue);
  if (!fromValue) return '—';
  if (!toValue || String(toValue).slice(0, 10) === String(fromValue).slice(0, 10)) return from;
  return `${from} → ${to}`;
}

function orderOverviewKpis(kpis) {
  const list = Array.isArray(kpis) ? kpis : [];
  const byKey = new Map(list.map((k) => [k.key, k]));
  const insurance = list.filter((k) => String(k.key).startsWith('insurance_'));
  const nonInsurance = list.filter((k) => !String(k.key).startsWith('insurance_'));
  const ordered = [];
  for (const key of OVERVIEW_KPI_ORDER) {
    const row = byKey.get(key);
    if (row) ordered.push(row);
  }
  for (const row of nonInsurance) {
    if (!ordered.includes(row)) ordered.push(row);
  }
  return { ordered, insurance };
}

export default function DashboardPage() {
  const { t, language } = useAppSettings();
  const { hasPermission, isSuperAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await getDashboardSummary();
      setData(d);
    } catch (e) {
      setError(e?.message || t('dashboard.loadError'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const { orderedKpis, insuranceKpis } = useMemo(() => {
    const { ordered, insurance } = orderOverviewKpis(data?.overview?.kpis);
    return { orderedKpis: ordered, insuranceKpis: insurance };
  }, [data?.overview?.kpis]);

  const routesLast14 = useMemo(() => {
    const rows = data?.overview?.charts?.routesByDay || [];
    const sorted = [...rows].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return sorted.slice(-14);
  }, [data?.overview?.charts?.routesByDay]);

  const routesMax = useMemo(() => Math.max(1, ...routesLast14.map((r) => Number(r.count) || 0)), [routesLast14]);

  const driverDist = data?.overview?.charts?.driverStatusDistribution || [];
  const vehiclesByStatus = data?.overview?.charts?.vehiclesByStatus || [];
  const insuranceByStatus = data?.overview?.charts?.insuranceVehiclesByStatus || [];

  const damagesKpis = useMemo(() => {
    const list = data?.damagesLast90?.kpis || [];
    const byKey = new Map(list.map((k) => [k.key, k]));
    return DAMAGES_KPI_KEYS.map((k) => byKey.get(k)).filter(Boolean);
  }, [data?.damagesLast90?.kpis]);

  const labelForKpi = (kpi) => kpiLabel(kpi, t);
  const driversRoutesDate = data?.overview?.kpiContext?.driversRoutesDate || null;
  const yesterdayYmd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const useWeekdayLabelForDriversRoutes = !!driversRoutesDate && driversRoutesDate !== yesterdayYmd;
  const weekdayLabelForDriversRoutes = useMemo(() => {
    if (!useWeekdayLabelForDriversRoutes || !driversRoutesDate) return '';
    const dt = new Date(`${driversRoutesDate}T12:00:00`);
    const locale = language === 'de' ? 'de-DE' : 'en-US';
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(dt);
  }, [useWeekdayLabelForDriversRoutes, driversRoutesDate, language]);
  const dashboardKpiLabel = (kpi) => {
    if (!useWeekdayLabelForDriversRoutes) return labelForKpi(kpi);
    if (kpi.key === 'drivers_worked_yesterday') {
      return language === 'de'
        ? `Fahrer ${weekdayLabelForDriversRoutes} im Einsatz`
        : `Drivers Worked ${weekdayLabelForDriversRoutes}`;
    }
    if (kpi.key === 'routes_completed_yesterday') {
      return language === 'de'
        ? `Routen ${weekdayLabelForDriversRoutes} abgeschlossen`
        : `Routes Completed ${weekdayLabelForDriversRoutes}`;
    }
    return labelForKpi(kpi);
  };

  const pave = data?.paveInspections || {};
  const publicIntake = data?.publicIntake || null;
  const canOpenPersonal = isSuperAdmin || hasPermission('page_employees');
  const canOpenDamage = isSuperAdmin || hasPermission('page_damages');
  const personalNotifications = useMemo(
    () => (publicIntake?.personalQuestionnaires?.recent || []).filter((row) => ['submitted', 'reviewing', 'error'].includes(String(row.status || '').toLowerCase())),
    [publicIntake?.personalQuestionnaires?.recent]
  );
  const damageNotifications = useMemo(
    () => (publicIntake?.damageReports?.recent || []).filter((row) => ['submitted', 'reviewing', 'error'].includes(String(row.status || '').toLowerCase())),
    [publicIntake?.damageReports?.recent]
  );
  const workshopAppointments = data?.recentWorkshopAppointments || [];

  return (
    <section className="analytics-page dashboard-page">
      <header className="analytics-header">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0', maxWidth: '52rem' }}>
            {t('dashboard.subtitle')}
          </p>
          {data?.overview?.period && (
            <p className="muted small" style={{ margin: '0.5rem 0 0' }}>
              {t('dashboard.periodOverview')}: <strong>{data.overview.period.start}</strong>
              {' → '}
              <strong>{data.overview.period.end}</strong>
              {data.generatedAt && (
                <>
                  {' · '}
                  {t('dashboard.generated')}: {formatTs(data.generatedAt)}
                </>
              )}
            </p>
          )}
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="btn-secondary analytics-btn" onClick={load} disabled={loading}>
            {loading ? t('analytics.loading') : t('dashboard.refresh')}
          </button>
          <Link to="/analytics" className="btn-primary analytics-btn" style={{ textAlign: 'center' }}>
            {t('dashboard.openAnalytics')}
          </Link>
        </div>
      </header>

      {error && <div className="analytics-error">{error}</div>}
      {loading && !data && <div className="analytics-loading">{t('analytics.loading')}</div>}

      {data && (
        <>
          {publicIntake && (canOpenPersonal || canOpenDamage) && (
            <>
              <h2 className="dashboard-section-title">Notifications</h2>
              <div className="dashboard-two-col">
                {canOpenPersonal && (
                  <div className="analytics-chart-card">
                    <h3>New Personalfragebogen submissions</h3>
                    <p className="muted small">
                      Pending: <strong>{formatKpiValue(publicIntake.personalQuestionnaires?.pending, 'number')}</strong>
                    </p>
                    {personalNotifications.length === 0 ? (
                      <p className="analytics-no-data">No new Personalfragebogen notifications.</p>
                    ) : (
                      <div className="analytics-donut-list">
                        {personalNotifications.map((row) => (
                          <Link key={row.id} className="analytics-donut-item" to={`/personal-fragebogen-review?id=${row.id}`}>
                            <span className="analytics-donut-label">
                              {[row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || `Submission ${row.id}`}
                            </span>
                            <span className="analytics-donut-value">{formatDateNormal(row.created_at)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    <p style={{ marginTop: '0.85rem' }}>
                      <Link to="/personal-fragebogen-review">Open Personalfragebogen review queue</Link>
                    </p>
                  </div>
                )}

                {canOpenDamage && (
                  <div className="analytics-chart-card">
                    <h3>New Schadenmeldung submissions</h3>
                    <p className="muted small">
                      Pending: <strong>{formatKpiValue(publicIntake.damageReports?.pending, 'number')}</strong>
                    </p>
                    {damageNotifications.length === 0 ? (
                      <p className="analytics-no-data">No new Schadenmeldung notifications.</p>
                    ) : (
                      <div className="analytics-donut-list">
                        {damageNotifications.map((row) => (
                          <Link key={row.id} className="analytics-donut-item" to={`/schadenmeldung-review?id=${row.id}`}>
                            <span className="analytics-donut-label">
                              {row.driver_name || row.reporter_name || `Report ${row.id}`}
                            </span>
                            <span className="analytics-donut-value">{formatDateNormal(row.created_at)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    <p style={{ marginTop: '0.85rem' }}>
                      <Link to="/schadenmeldung-review">Open Schadenmeldung review queue</Link>
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {workshopAppointments.length > 0 && (
            <>
              <h2 className="dashboard-section-title">Planned Workshop appointments</h2>
              <div className="analytics-chart-card" style={{ marginBottom: '1rem' }}>
                <p className="muted small" style={{ marginTop: 0 }}>
                  Cars are shown here starting 7 days before the workshop date and stay visible during the workshop period.
                </p>
                <div className="analytics-donut-list">
                  {workshopAppointments.map((row) => (
                    <Link key={row.id} className="analytics-donut-item" to="/cars">
                      <span className="analytics-donut-label">
                        {(row.license_plate || row.vehicle_id || `Car ${row.id}`).trim()}
                        {row.planned_workshop_name ? ` · ${row.planned_workshop_name}` : ''}
                      </span>
                      <span className="analytics-donut-value">
                        {formatDateRange(row.planned_workshop_from, row.planned_workshop_to)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}

          <h2 className="dashboard-section-title">{t('dashboard.section.executive')}</h2>
          <div className="analytics-kpi-grid">
            {orderedKpis.map((kpi) => (
              <div key={kpi.key} className="analytics-kpi-card">
                <div className="analytics-kpi-label">{dashboardKpiLabel(kpi)}</div>
                <div className="analytics-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</div>
              </div>
            ))}
          </div>

          {publicIntake && (canOpenPersonal || canOpenDamage) && (
            <>
              <h2 className="dashboard-section-title">Public Intake</h2>
              <div className="analytics-kpi-grid">
                {canOpenPersonal && (
                  <div className="analytics-kpi-card">
                    <div className="analytics-kpi-label">Personalfragebogen pending</div>
                    <div className="analytics-kpi-value">{formatKpiValue(publicIntake.personalQuestionnaires?.pending, 'number')}</div>
                    <p style={{ marginTop: '0.75rem' }}>
                      <Link to="/personal-fragebogen-review">Open review queue</Link>
                    </p>
                  </div>
                )}
                {canOpenDamage && (
                  <div className="analytics-kpi-card">
                    <div className="analytics-kpi-label">Schadenmeldung pending</div>
                    <div className="analytics-kpi-value">{formatKpiValue(publicIntake.damageReports?.pending, 'number')}</div>
                    <p style={{ marginTop: '0.75rem' }}>
                      <Link to="/schadenmeldung-review">Open damage queue</Link>
                    </p>
                  </div>
                )}
              </div>
              <div className="dashboard-two-col">
                {canOpenPersonal && (
                  <div className="analytics-chart-card">
                    <h3>Latest Personalfragebogen</h3>
                    {(publicIntake.personalQuestionnaires?.recent || []).length === 0 ? (
                      <p className="analytics-no-data">No submissions yet.</p>
                    ) : (
                      <div className="analytics-donut-list">
                        {publicIntake.personalQuestionnaires.recent.map((row) => (
                          <Link key={row.id} className="analytics-donut-item" to={`/personal-fragebogen-review?id=${row.id}`}>
                            <span className="analytics-donut-label">
                              {[row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || `Submission ${row.id}`}
                            </span>
                            <span className="analytics-donut-value">{row.status}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {canOpenDamage && (
                  <div className="analytics-chart-card">
                    <h3>Latest Schadenmeldung</h3>
                    {(publicIntake.damageReports?.recent || []).length === 0 ? (
                      <p className="analytics-no-data">No submissions yet.</p>
                    ) : (
                      <div className="analytics-donut-list">
                        {publicIntake.damageReports.recent.map((row) => (
                          <Link key={row.id} className="analytics-donut-item" to={`/schadenmeldung-review?id=${row.id}`}>
                            <span className="analytics-donut-label">
                              {row.driver_name || row.reporter_name || `Report ${row.id}`}
                            </span>
                            <span className="analytics-donut-value">{row.status}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {insuranceKpis.length > 0 && (
            <>
              <h2 className="dashboard-section-title">{t('dashboard.section.insurance')}</h2>
              <div className="analytics-kpi-grid">
                {insuranceKpis.map((kpi) => (
                  <div key={kpi.key} className="analytics-kpi-card">
                    <div className="analytics-kpi-label">{labelForKpi(kpi)}</div>
                    <div className="analytics-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</div>
                  </div>
                ))}
              </div>
              {insuranceByStatus.length > 0 && (
                <div className="analytics-chart-card" style={{ marginTop: '1rem' }}>
                  <h3>{t('dashboard.chart.insuranceByStatus')}</h3>
                  <div className="analytics-donut-list">
                    {insuranceByStatus.map((row) => (
                      <div key={String(row.label)} className="analytics-donut-item">
                        <span className="analytics-donut-label">{row.label}</span>
                        <span className="analytics-donut-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: '0.75rem 0 0' }}>
                    <Link to="/analytics">{t('dashboard.insuranceMore')}</Link>
                  </p>
                </div>
              )}
            </>
          )}

          <div className="dashboard-two-col">
            <div className="analytics-chart-card">
              <h3>{t('dashboard.chart.routesVolume')}</h3>
              <p className="muted small">{t('dashboard.chart.routesVolumeHint')}</p>
              {routesLast14.length === 0 ? (
                <p className="analytics-no-data">{t('dashboard.empty.routes')}</p>
              ) : (
                <div className="analytics-chart-bars">
                  {routesLast14.map((r) => (
                    <div key={String(r.date)} className="analytics-bar-row">
                      <span className="analytics-bar-label">{formatDateNormal(r.date)}</span>
                      <div className="analytics-bar-track">
                        <div
                          className="analytics-bar-fill"
                          style={{ width: `${(100 * (Number(r.count) || 0)) / routesMax}%` }}
                        />
                      </div>
                      <span className="analytics-bar-value">{r.count ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="analytics-chart-card">
              <h3>{t('dashboard.chart.fleetStatus')}</h3>
              {vehiclesByStatus.length === 0 ? (
                <p className="analytics-no-data">{t('dashboard.empty.fleet')}</p>
              ) : (
                <div className="analytics-donut-list">
                  {vehiclesByStatus.map((row) => (
                    <div key={String(row.status)} className="analytics-donut-item">
                      <span className="analytics-donut-label">{row.status}</span>
                      <span className="analytics-donut-value">{row.count}</span>
                    </div>
                  ))}
                </div>
              )}
              <h3 style={{ marginTop: '1.25rem' }}>{t('dashboard.chart.driversActive')}</h3>
              {driverDist.length === 0 ? (
                <p className="analytics-no-data">{t('dashboard.empty.drivers')}</p>
              ) : (
                <div className="analytics-donut-list">
                  {driverDist.map((row) => (
                    <div key={String(row.label)} className="analytics-donut-item">
                      <span className="analytics-donut-label">{row.label}</span>
                      <span className="analytics-donut-value">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <h2 className="dashboard-section-title">{t('dashboard.section.pave')}</h2>
          <p className="muted small">{t('dashboard.paveHint')}</p>
          <div className="analytics-kpi-grid">
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-label">{t('dashboard.pave.totalInspections')}</div>
              <div className="analytics-kpi-value">{formatKpiValue(pave.totalInspections, 'number')}</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-label">{t('dashboard.pave.completed')}</div>
              <div className="analytics-kpi-value">{formatKpiValue(pave.completed, 'number')}</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-label">{t('dashboard.pave.inProgress')}</div>
              <div className="analytics-kpi-value">{formatKpiValue(pave.inProgress, 'number')}</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-label">{t('dashboard.pave.needsReview')}</div>
              <div className="analytics-kpi-value">{formatKpiValue(pave.needsReview, 'number')}</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-label">{t('dashboard.pave.today')}</div>
              <div className="analytics-kpi-value">{formatKpiValue(pave.todaysInspections, 'number')}</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-label">{t('dashboard.pave.matchedFleet')}</div>
              <div className="analytics-kpi-value">{formatKpiValue(pave.inspectionsMatchedToFleet, 'number')}</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-label">{t('dashboard.pave.carsInDb')}</div>
              <div className="analytics-kpi-value">{formatKpiValue(pave.totalCarsInDb, 'number')}</div>
            </div>
          </div>

          <div className="dashboard-two-col">
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <strong>{t('dashboard.recent.paveReports')}</strong>
              </div>
              <div className="analytics-table-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>{t('dashboard.table.plate')}</th>
                      <th>{t('dashboard.table.status')}</th>
                      <th>{t('dashboard.table.date')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recentPaveReports || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="analytics-no-data">
                          {t('dashboard.empty.paveReports')}
                        </td>
                      </tr>
                    ) : (
                      data.recentPaveReports.map((r) => (
                        <tr key={r.id}>
                          <td>{r.plate_number || '—'}</td>
                          <td>{r.status || '—'}</td>
                          <td>{formatDateNormal(r.inspection_date || r.report_date) || formatTs(r.created_at)}</td>
                          <td>
                            <Link to={`/pave/gmail/${r.id}`}>{t('dashboard.open')}</Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 16px' }}>
                <Link to="/pave">{t('dashboard.allPave')}</Link>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <strong>{t('dashboard.recent.fines')}</strong>
              </div>
              <div className="analytics-table-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>{t('dashboard.table.case')}</th>
                      <th>{t('dashboard.table.amount')}</th>
                      <th>{t('dashboard.table.created')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recentFines || []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="analytics-no-data">
                          {t('dashboard.empty.fines')}
                        </td>
                      </tr>
                    ) : (
                      data.recentFines.map((f) => (
                        <tr key={f.id}>
                          <td>{f.case_number || `#${f.id}`}</td>
                          <td>{f.amount != null ? formatKpiValue(f.amount, 'currency') : '—'}</td>
                          <td>{formatTs(f.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 16px' }}>
                <Link to="/fines">{t('dashboard.allFines')}</Link>
              </div>
            </div>
          </div>

          <h2 className="dashboard-section-title">{t('dashboard.section.damages')}</h2>
          <p className="muted small">
            {data.damagesLast90?.range
              ? `${t('dashboard.damagesRange')}: ${data.damagesLast90.range.start} → ${data.damagesLast90.range.end}`
              : t('dashboard.damagesUnavailable')}
          </p>
          {data.damagesLast90 ? (
            <>
              <div className="analytics-kpi-grid">
                {damagesKpis.map((kpi) => (
                  <div key={kpi.key} className="analytics-kpi-card">
                    <div className="analytics-kpi-label">{kpi.label || kpi.key}</div>
                    <div className="analytics-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</div>
                  </div>
                ))}
              </div>
              <div className="analytics-table-wrap card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <strong>{t('dashboard.openDamagesPreview')}</strong>
                </div>
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>{t('dashboard.table.date')}</th>
                      <th>{t('dashboard.table.case')}</th>
                      <th>{t('dashboard.table.driver')}</th>
                      <th>{t('dashboard.table.status')}</th>
                      <th>{t('dashboard.table.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.damagesLast90.openCasesPreview || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="analytics-no-data">
                          {t('dashboard.empty.openDamages')}
                        </td>
                      </tr>
                    ) : (
                      data.damagesLast90.openCasesPreview.map((row) => (
                        <tr key={row.id}>
                          <td>{row.date || '—'}</td>
                          <td>{row.unfallnummer || row.schadensnummer || '—'}</td>
                          <td>{row.fahrer || '—'}</td>
                          <td>{row.offen_geschlossen || '—'}</td>
                          <td>
                            {row.kosten_alfamile != null ? formatKpiValue(row.kosten_alfamile, 'currency') : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div style={{ padding: '10px 16px' }}>
                  <Link to="/damages">{t('dashboard.allDamages')}</Link>
                </div>
              </div>
            </>
          ) : (
            <p className="analytics-no-data">{t('dashboard.damagesUnavailable')}</p>
          )}

          <p className="muted small" style={{ marginTop: '2rem' }}>
            {t('dashboard.footerHint')}
          </p>
        </>
      )}
    </section>
  );
}
