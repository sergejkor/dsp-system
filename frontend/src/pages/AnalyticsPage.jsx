import React, { useCallback, useEffect, useState } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import * as analyticsApi from '../services/analyticsApi';
import { formatKpiValue, kpiLabel } from '../utils/analyticsKpiDisplay.js';

const TAB_KEYS = ['overview', 'operations', 'drivers', 'payroll', 'attendance', 'routes', 'performance', 'safety', 'fleet', 'hr', 'compliance', 'insurance', 'damages', 'custom'];
const DATE_PRESETS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30', 'last_90', 'this_quarter', 'last_quarter', 'this_year', 'custom'];
const COMPARE_MODES = ['none', 'previous_period', 'previous_month', 'previous_year'];

// Simple catalog of “questions” per section. For now these are UI-only descriptors.
const SECTION_QUESTIONS = {
  operations: [
    { id: 'routes_per_day', label: 'How many routes per day?' },
    { id: 'drivers_worked', label: 'How many drivers worked per day?' },
  ],
  drivers: [
    { id: 'routes_per_driver', label: 'Which drivers completed most routes?' },
    { id: 'active_vs_inactive', label: 'Active vs inactive drivers overview' },
  ],
  payroll: [
    { id: 'total_bonus', label: 'Total bonus and advances this month' },
    { id: 'top_earners', label: 'Top earners by bonus' },
  ],
  attendance: [
    { id: 'attendance_rate', label: 'Attendance rate over period' },
    { id: 'presence_by_day', label: 'Presence by day' },
  ],
  routes: [
    { id: 'routes_volume', label: 'Total routes volume' },
    { id: 'routes_trend', label: 'Routes trend over time' },
  ],
  fleet: [
    { id: 'fleet_status', label: 'Fleet status breakdown' },
    { id: 'without_driver', label: 'Cars without assigned driver' },
  ],
  hr: [
    { id: 'hires_terms', label: 'New hires and terminations' },
  ],
  compliance: [
    { id: 'expiring_docs', label: 'Documents expiring in 90 days' },
  ],
  insurance: [
    { id: 'portfolio_overview', label: 'Insurance portfolio overview' },
    { id: 'expiring_soon', label: 'Contracts expiring in 30 days' },
    { id: 'missing_vin', label: 'Vehicles with missing VIN' },
    { id: 'claims', label: 'Vehicles with claims' },
  ],
  damages: [
    { id: 'damages_overview', label: 'Damages cases and costs' },
    { id: 'open_cases', label: 'Open damage cases' },
    { id: 'missing_files', label: 'Damages without files' },
  ],
};

export default function AnalyticsPage() {
  const { t } = useAppSettings();
  const [activeTab, setActiveTab] = useState('overview');
  const [datePreset, setDatePreset] = useState('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [compareMode, setCompareMode] = useState('none');
  const [insuranceYear, setInsuranceYear] = useState(2026);
  const [overview, setOverview] = useState(null);
  const [domainData, setDomainData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedViews, setSavedViews] = useState([]);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analyticsApi.getOverview({
        datePreset,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        compareMode: compareMode !== 'none' ? compareMode : undefined,
        insuranceYear,
      });
      setOverview(data);
    } catch (e) {
      setError(e?.message || 'Failed to load overview');
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [datePreset, startDate, endDate, compareMode, insuranceYear]);

  const loadDomain = useCallback(async () => {
    if (activeTab === 'overview' || activeTab === 'custom') return;
    setLoading(true);
    setError('');
    try {
      const data = await analyticsApi.getDomainData(activeTab, {
        startDate: overview?.period?.start || startDate,
        endDate: overview?.period?.end || endDate,
        payrollMonth: (overview?.period?.start || startDate || '').slice(0, 7),
        insuranceYear,
        question: activeQuestionId || undefined,
      });
      setDomainData(data);
    } catch (e) {
      setError(e?.message || 'Failed to load data');
      setDomainData(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, overview?.period?.start, overview?.period?.end, startDate, endDate, insuranceYear, activeQuestionId]);

  useEffect(() => {
    if (activeTab === 'overview') loadOverview();
  }, [activeTab, loadOverview]);

  useEffect(() => {
    if (activeTab !== 'overview' && activeTab !== 'custom') loadDomain();
  }, [activeTab, overview?.period?.start, overview?.period?.end, startDate, endDate, loadDomain]);

  useEffect(() => {
    if (activeTab !== 'overview') return;
    loadOverview();
  }, [datePreset, compareMode, insuranceYear]);

  const handleRefresh = () => {
    if (activeTab === 'overview') loadOverview();
    else loadDomain();
  };

  const handleExportCsv = async () => {
    setError('');
    try {
      await analyticsApi.exportCsv({
        domain: activeTab === 'overview' ? 'overview' : activeTab,
        datePreset,
        startDate: overview?.period?.start || startDate,
        endDate: overview?.period?.end || endDate,
        payrollMonth: (overview?.period?.start || startDate || '').slice(0, 7),
        insuranceYear,
      });
    } catch (e) {
      setError(e?.message || 'Export failed');
    }
  };

  const handleSaveView = async () => {
    if (!saveViewName.trim()) return;
    try {
      await analyticsApi.createSavedView({
        name: saveViewName.trim(),
        page_key: activeTab,
        filters_json: { datePreset, startDate, endDate, compareMode, insuranceYear },
      });
      setSaveViewOpen(false);
      setSaveViewName('');
      const views = await analyticsApi.getSavedViews();
      setSavedViews(Array.isArray(views) ? views : []);
    } catch (e) {
      setError(e?.message || 'Failed to save view');
    }
  };

  useEffect(() => {
    analyticsApi.getSavedViews().then((views) => setSavedViews(Array.isArray(views) ? views : [])).catch(() => setSavedViews([]));
  }, []);

  const labelForKpi = (kpi) => kpiLabel(kpi, t);

  const damagesCostByMonth = domainData?.charts?.costByMonth || [];
  const damagesMaxCount = Math.max(
    1,
    ...damagesCostByMonth.map((r) => Number(r.count) || 0),
  );

  return (
    <section className="analytics-page">
      <header className="analytics-header">
        <h1>{t('analytics.title')}</h1>
        <p className="muted" style={{ margin: '0.25rem 0 0' }}>
          operational and business insights
        </p>
      </header>

      <div className="analytics-controls">
        <div className="analytics-controls-row">
          <label className="analytics-label">
            {t('analytics.dateRange')}
            <select
              className="analytics-select"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
            >
              {DATE_PRESETS.map((p) => (
                <option key={p} value={p}>{t(`analytics.presets.${p}`)}</option>
              ))}
            </select>
          </label>
          {datePreset === 'custom' && (
            <>
              <label className="analytics-label">
                <input
                  type="date"
                  className="analytics-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="analytics-label">
                <input
                  type="date"
                  className="analytics-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="analytics-label">
            {t('analytics.comparePeriod')}
            <select
              className="analytics-select"
              value={compareMode}
              onChange={(e) => setCompareMode(e.target.value)}
            >
              <option value="none">{t('analytics.compareNone')}</option>
              <option value="previous_period">{t('analytics.comparePreviousPeriod')}</option>
              <option value="previous_month">{t('analytics.comparePreviousMonth')}</option>
              <option value="previous_year">{t('analytics.comparePreviousYear')}</option>
            </select>
          </label>

          <label className="analytics-label">
            Insurance year
            <select className="analytics-select" value={insuranceYear} onChange={(e) => setInsuranceYear(Number(e.target.value))}>
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </label>
          <button type="button" className="btn-primary analytics-btn" onClick={handleRefresh}>
            {t('analytics.refresh')}
          </button>
          <button type="button" className="btn-secondary analytics-btn" onClick={() => setSaveViewOpen(true)}>
            {t('analytics.saveView')}
          </button>
          <button type="button" className="btn-secondary analytics-btn" onClick={handleExportCsv}>
            {t('analytics.exportCsv')}
          </button>
        </div>
      </div>

      <div className="analytics-tabs">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`analytics-tab ${activeTab === tab ? 'analytics-tab--active' : ''}`}
            onClick={() => {
              setActiveTab(tab);
              setActiveQuestionId(''); // reset question when switching section
            }}
          >
            {t(`analytics.${tab}`)}
          </button>
        ))}
      </div>

      {error && <div className="analytics-error">{error}</div>}
      {loading && <div className="analytics-loading">{t('analytics.loading')}</div>}

      {/* Per-section question selector (appears only after choosing non-overview section) */}
      {activeTab !== 'overview' && activeTab !== 'custom' && SECTION_QUESTIONS[activeTab] && (
        <div className="analytics-controls" style={{ marginTop: 0 }}>
          <div className="analytics-controls-row">
            <label className="analytics-label">
              Questions for this section
              <select
                className="analytics-select"
                value={activeQuestionId}
                onChange={(e) => setActiveQuestionId(e.target.value)}
              >
                <option value="">All questions / default view</option>
                {SECTION_QUESTIONS[activeTab].map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {activeTab === 'overview' && !loading && overview && (
        <div className="analytics-overview">
          <div className="analytics-kpi-grid">
            {(overview.kpis || []).map((kpi) => (
              <div key={kpi.key} className="analytics-kpi-card">
                <div className="analytics-kpi-label">{labelForKpi(kpi)}</div>
                <div className="analytics-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</div>
              </div>
            ))}
          </div>
          <div className="analytics-charts">
            {overview.charts?.routesByDay?.length > 0 && (
              <div className="analytics-chart-card">
                <h3>Routes completed by day</h3>
                <div className="analytics-chart-bars">
                  {overview.charts.routesByDay.slice(-14).map((r) => (
                    <div key={r.date} className="analytics-bar-row">
                      <span className="analytics-bar-label">{r.date}</span>
                      <div className="analytics-bar-track">
                        <div
                          className="analytics-bar-fill"
                          style={{ width: `${Math.min(100, (Number(r.count) / 50) * 100)}%` }}
                        />
                      </div>
                      <span className="analytics-bar-value">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {overview.charts?.driverStatusDistribution?.length > 0 && (
              <div className="analytics-chart-card">
                <h3>Driver status</h3>
                <div className="analytics-donut-list">
                  {overview.charts.driverStatusDistribution.map((d) => (
                    <div key={d.label} className="analytics-donut-item">
                      <span className="analytics-donut-label">{d.label}</span>
                      <span className="analytics-donut-value">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {overview.charts?.vehiclesByStatus?.length > 0 && (
              <div className="analytics-chart-card">
                <h3>Vehicles by status</h3>
                <div className="analytics-donut-list">
                  {overview.charts.vehiclesByStatus.map((r) => (
                    <div key={r.status} className="analytics-donut-item">
                      <span className="analytics-donut-label">{r.status}</span>
                      <span className="analytics-donut-value">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {overview.charts?.insuranceVehiclesByStatus?.length > 0 && (
              <div className="analytics-chart-card">
                <h3>Insurance vehicles by status</h3>
                <div className="analytics-donut-list">
                  {overview.charts.insuranceVehiclesByStatus.map((r) => (
                    <div key={r.label} className="analytics-donut-item">
                      <span className="analytics-donut-label">{r.label}</span>
                      <span className="analytics-donut-value">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab !== 'overview' && activeTab !== 'custom' && !loading && domainData && (
        <div className="analytics-domain">
          {domainData.kpis && domainData.kpis.length > 0 && (
            <div className="analytics-kpi-grid">
              {domainData.kpis.map((kpi) => (
                <div key={kpi.key} className="analytics-kpi-card">
                  <div className="analytics-kpi-label">{labelForKpi(kpi)}</div>
                  <div className="analytics-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'insurance' && domainData.charts?.statusDistribution?.length > 0 && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
              <div className="analytics-chart-card">
                <h3>Insurance status</h3>
                <div className="analytics-donut-list">
                  {domainData.charts.statusDistribution.map((r) => (
                    <div key={r.label} className="analytics-donut-item">
                      <span className="analytics-donut-label">{r.label}</span>
                      <span className="analytics-donut-value">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="analytics-chart-card">
                <h3>Premium by status</h3>
                <div className="analytics-donut-list">
                  {domainData.charts.premiumByStatus?.map((r) => (
                    <div key={r.label} className="analytics-donut-item">
                      <span className="analytics-donut-label">{r.label}</span>
                      <span className="analytics-donut-value">{formatKpiValue(r.value, 'currency')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'damages' && domainData.charts?.casesByOffen?.length > 0 && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
              <div className="analytics-chart-card">
                <h3>Damages by status</h3>
                <div className="analytics-donut-list">
                  {domainData.charts.casesByOffen.map((r) => (
                    <div key={r.label} className="analytics-donut-item">
                      <span className="analytics-donut-label">{r.label}</span>
                      <span className="analytics-donut-value">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="analytics-chart-card">
                <h3>Cases trend (by month)</h3>
                <div className="analytics-chart-bars">
                  {domainData.charts.costByMonth?.slice(-12).map((r) => (
                    <div key={r.date} className="analytics-bar-row">
                      <span className="analytics-bar-label">{r.date}</span>
                      <div className="analytics-bar-track">
                        <div
                          className="analytics-bar-fill"
                          style={{ width: `${Math.min(100, (Number(r.count) / damagesMaxCount) * 100)}%` }}
                        />
                      </div>
                      <span className="analytics-bar-value">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {domainData.insightTables?.map((t, idx) => (
            <div key={`${t.title}-${idx}`} style={{ marginTop: idx === 0 ? '1rem' : '1.25rem' }}>
              <div className="muted" style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{t.title}</div>
              {t.rows && t.rows.length > 0 ? (
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        {Object.keys(t.rows[0]).map((col) => (
                          <th key={col}>{col.replace(/_/g, ' ')}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((row, i) => (
                        <tr key={i}>
                          {Object.entries(row).map(([k, v]) => (
                            <td key={k}>{v != null ? String(v) : '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="analytics-no-data">{t.title}: no data.</p>
              )}
            </div>
          ))}

          {domainData.table && domainData.table.length > 0 && (!domainData.insightTables || domainData.insightTables.length === 0) && (
            <div className="analytics-table-wrap" style={{ marginTop: '1.25rem' }}>
              <table className="analytics-table">
                <thead>
                  <tr>
                    {Object.keys(domainData.table[0]).map((col) => (
                      <th key={col}>{col.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domainData.table.map((row, i) => (
                    <tr key={i}>
                      {Object.entries(row).map(([k, v]) => (
                        <td key={k}>{v != null ? String(v) : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {domainData.newHires && (
            <div className="analytics-domain-section">
              <h3>New hires</h3>
              <pre>{JSON.stringify(domainData.newHires, null, 2)}</pre>
            </div>
          )}
          {domainData.terminations && (
            <div className="analytics-domain-section">
              <h3>Terminations</h3>
              <pre>{JSON.stringify(domainData.terminations, null, 2)}</pre>
            </div>
          )}
          {(!domainData.table || domainData.table.length === 0) && (!domainData.insightTables || domainData.insightTables.length === 0) && !domainData.newHires && !domainData.terminations && (
            <p className="analytics-no-data">{t('analytics.noData')}</p>
          )}
        </div>
      )}

      {activeTab === 'custom' && !loading && (
        <div className="analytics-custom">
          <p className="analytics-no-data">{t('analytics.noData')} Use domain tabs for predefined analytics.</p>
        </div>
      )}

      {saveViewOpen && (
        <div className="analytics-modal-backdrop" onClick={() => setSaveViewOpen(false)}>
          <div className="analytics-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('analytics.saveView')}</h3>
            <input
              type="text"
              className="analytics-input"
              placeholder="View name"
              value={saveViewName}
              onChange={(e) => setSaveViewName(e.target.value)}
            />
            <div className="analytics-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setSaveViewOpen(false)}>{t('syncWithKenjo.cancel')}</button>
              <button type="button" className="btn-primary" onClick={handleSaveView}>{t('syncWithKenjo.save')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
