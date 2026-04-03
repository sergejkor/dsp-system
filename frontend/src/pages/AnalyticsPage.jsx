import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppSettings } from '../context/AppSettingsContext';
import * as analyticsApi from '../services/analyticsApi';
import { formatKpiValue, kpiLabel } from '../utils/analyticsKpiDisplay.js';

const TAB_KEYS = ['overview', 'operations', 'drivers', 'payroll', 'attendance', 'routes', 'performance', 'safety', 'fleet', 'hr', 'compliance', 'insurance', 'damages', 'custom'];
const DATE_PRESETS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30', 'last_90', 'this_quarter', 'last_quarter', 'this_year', 'custom'];
const COMPARE_MODES = ['none', 'previous_period', 'previous_month', 'previous_year'];

// Simple catalog of “questions” per section. For now these are UI-only descriptors.
const SECTION_QUESTIONS = {
  operations: [
    { id: 'routes_per_day', label: 'How many routes do we complete per day?' },
    { id: 'drivers_worked', label: 'How many drivers are active each day?' },
    { id: 'productivity_day', label: 'What is the routes-per-driver productivity trend?' },
    { id: 'peak_capacity', label: 'Which days create the highest operational pressure?' },
    { id: 'volatility', label: 'Is route volume stable or volatile week to week?' },
    { id: 'short_term_projection', label: 'What does the next short-term route projection look like?' },
  ],
  drivers: [
    { id: 'routes_per_driver', label: 'Which drivers completed the most routes?' },
    { id: 'active_vs_inactive', label: 'What is the active vs inactive driver mix?' },
    { id: 'workload_balance', label: 'Is workload balanced across the driver base?' },
    { id: 'contract_risk', label: 'Which contracts end soon and may affect capacity?' },
    { id: 'new_driver_ramp', label: 'How are newer drivers ramping up?' },
    { id: 'coverage_depth', label: 'Do we have enough active driver coverage?' },
  ],
  payroll: [
    { id: 'total_bonus', label: 'How much variable payroll are we paying this month?' },
    { id: 'top_earners', label: 'Which employees have the highest payouts?' },
    { id: 'bonus_mix', label: 'How do bonus, deductions and advances compare?' },
    { id: 'monthly_trend', label: 'What is the monthly payroll trend?' },
    { id: 'forecast_next', label: 'What is the next-month payroll forecast?' },
    { id: 'advance_pressure', label: 'Are advances creating pressure on payouts?' },
  ],
  attendance: [
    { id: 'attendance_rate', label: 'How strong is daily attendance over the selected period?' },
    { id: 'presence_by_day', label: 'What does presence look like day by day?' },
    { id: 'capacity_gaps', label: 'Where do staffing gaps appear?' },
    { id: 'weekly_pattern', label: 'Is there a recurring weekly attendance pattern?' },
    { id: 'peak_presence', label: 'Which days have the strongest staffing coverage?' },
    { id: 'attendance_projection', label: 'What does the near-term attendance projection show?' },
  ],
  routes: [
    { id: 'routes_volume', label: 'What is the total route volume?' },
    { id: 'routes_trend', label: 'What is the route trend over time?' },
    { id: 'weekly_shape', label: 'How do routes behave on weekly cadence?' },
    { id: 'monthly_shape', label: 'How does volume evolve month over month?' },
    { id: 'peak_days', label: 'Which days create the highest route spikes?' },
    { id: 'route_forecast', label: 'What is the projected route volume for the next weeks?' },
  ],
  performance: [
    { id: 'score_trend', label: 'How is the overall score trending week to week?' },
    { id: 'safety_quality', label: 'Is safety improving faster than delivery quality?' },
    { id: 'rank_trend', label: 'How is rank at DBX9 moving over time?' },
    { id: 'compliance_trend', label: 'Which compliance metrics trend down first?' },
    { id: 'capacity_reliability', label: 'Is capacity reliability stable enough?' },
    { id: 'score_projection', label: 'What is the projected score trajectory?' },
  ],
  safety: [
    { id: 'inspection_load', label: 'How many inspections are we processing over time?' },
    { id: 'status_mix', label: 'What is the inspection status mix?' },
    { id: 'operational_risk', label: 'Are unresolved safety states accumulating?' },
    { id: 'daily_trend', label: 'What is the daily inspection trend?' },
    { id: 'throughput', label: 'Is safety throughput speeding up or slowing down?' },
  ],
  fleet: [
    { id: 'fleet_status', label: 'What is the fleet status breakdown?' },
    { id: 'without_driver', label: 'How many cars are missing a driver assignment?' },
    { id: 'maintenance_share', label: 'What share of fleet sits in maintenance?' },
    { id: 'assignment_coverage', label: 'How strong is fleet assignment coverage?' },
    { id: 'idle_risk', label: 'Where do idle vehicles or bottlenecks show up?' },
  ],
  hr: [
    { id: 'hires_terms', label: 'How many hires and terminations do we have?' },
    { id: 'monthly_movement', label: 'What is the monthly employee movement trend?' },
    { id: 'net_growth', label: 'Are we growing or shrinking headcount?' },
    { id: 'termination_pressure', label: 'Is termination volume increasing?' },
    { id: 'next_month_projection', label: 'What does the next-month HR projection look like?' },
  ],
  compliance: [
    { id: 'expiring_docs', label: 'Which documents expire in the next 90 days?' },
    { id: 'expiry_peaks', label: 'When do expiry peaks happen?' },
    { id: 'type_risk', label: 'Which document types create the biggest compliance risk?' },
    { id: 'upcoming_workload', label: 'How much renewal workload is coming soon?' },
  ],
  insurance: [
    { id: 'portfolio_overview', label: 'What is the insurance portfolio overview?' },
    { id: 'expiring_soon', label: 'Which contracts expire soon?' },
    { id: 'missing_vin', label: 'Where is data quality weak, like missing VIN?' },
    { id: 'claims', label: 'Which vehicles have claims and how concentrated are they?' },
    { id: 'premium_mix', label: 'How does premium load vary by status?' },
  ],
  damages: [
    { id: 'damages_overview', label: 'How many damage cases and costs are open?' },
    { id: 'open_cases', label: 'Which damage cases are still open?' },
    { id: 'missing_files', label: 'Where are damage files incomplete?' },
    { id: 'cost_trend', label: 'What is the trend in monthly damage cases?' },
    { id: 'process_risk', label: 'Where do documentation gaps create risk?' },
  ],
};

const DATE_LIKE_COLUMNS = new Set([
  'date',
  'start_date',
  'contract_end',
  'termination_date',
  'day_key',
  'expiry_date',
  'week_start',
  'month_key',
  'contract_start',
  'liability_end',
  'created_at',
]);

/** Calendar-style display (DD.MM.YYYY); uses YYYY-MM-DD prefix when present to avoid TZ shifts. */
function formatAnalyticsDate(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    if (/^\d{4}-\d{2}$/.test(value)) {
      const [y, mo] = value.split('-');
      return `${mo}.${y}`;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(value);
}

function formatAnalyticsCell(columnKey, value) {
  if (value == null || value === '') return '—';
  if (DATE_LIKE_COLUMNS.has(columnKey)) return formatAnalyticsDate(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value);
}

const ANALYTICS_COLORS = {
  primary: '#2563eb',
  secondary: '#0f766e',
  accent: '#d97706',
  danger: '#dc2626',
  neutral: '#64748b',
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function average(values) {
  const list = (values || []).filter((value) => Number.isFinite(value));
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function addPeriod(label, step) {
  if (!label) return label;
  if (step === 'month') {
    const [year, month] = String(label).split('-').map(Number);
    if (!year || !month) return label;
    const date = new Date(year, month, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (step === 'week' && /^\d{4}\sW\d{2}$/.test(String(label))) {
    const [yearPart, weekPartRaw] = String(label).split(' W');
    let year = Number(yearPart);
    let week = Number(weekPartRaw) + 1;
    if (week > 52) {
      week = 1;
      year += 1;
    }
    return `${year} W${String(week).padStart(2, '0')}`;
  }
  const date = new Date(`${String(label).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return label;
  date.setDate(date.getDate() + (step === 'week' ? 7 : 1));
  return date.toISOString().slice(0, 10);
}

function buildForecastLineData(rows, { labelKey, valueKey, step = 'day', count = 3, decimals = 1 }) {
  const base = (rows || [])
    .filter((row) => row && row[labelKey] != null)
    .map((row) => ({
      ...row,
      actual: toNumber(row[valueKey]),
      forecast: null,
    }));
  if (!base.length) return [];
  if (base.length === 1) {
    return base.map((row) => ({ ...row, forecast: row.actual }));
  }
  const recent = base.slice(-Math.min(base.length, 4));
  const deltas = [];
  for (let i = 1; i < recent.length; i += 1) {
    deltas.push(recent[i].actual - recent[i - 1].actual);
  }
  const avgDelta = average(deltas);
  const out = base.map((row, index) => ({
    ...row,
    forecast: index === base.length - 1 ? row.actual : null,
  }));
  let lastLabel = base[base.length - 1][labelKey];
  let lastValue = base[base.length - 1].actual;
  for (let i = 0; i < count; i += 1) {
    lastLabel = addPeriod(lastLabel, step);
    lastValue = Math.max(0, lastValue + avgDelta);
    const rounded = Number(lastValue.toFixed(decimals));
    out.push({
      [labelKey]: lastLabel,
      actual: null,
      forecast: rounded,
      isForecast: true,
    });
  }
  return out;
}

function buildRollingAverage(rows, valueKey, resultKey, windowSize = 3) {
  return (rows || []).map((row, index) => {
    const window = rows.slice(Math.max(0, index - windowSize + 1), index + 1).map((item) => toNumber(item[valueKey]));
    return {
      ...row,
      [resultKey]: Number(average(window).toFixed(2)),
    };
  });
}

function forecastSummary(rows, valueKey, count, label) {
  const forecastRows = buildForecastLineData(rows, { labelKey: rows?.[0]?.month_key ? 'month_key' : rows?.[0]?.week_start ? 'week_start' : 'date', valueKey, count });
  const future = forecastRows.filter((row) => row.isForecast);
  if (!future.length) return '';
  const avgForecast = average(future.map((row) => toNumber(row.forecast)));
  return `${label}: ${avgForecast.toFixed(1)}`;
}

function renderAnalyticsTooltipLabel(label) {
  return formatAnalyticsDate(label);
}

function formatAnalyticsPeriod(start, end) {
  if (!start && !end) return 'No period selected';
  if (start && end && start !== end) return `${formatAnalyticsDate(start)} - ${formatAnalyticsDate(end)}`;
  return formatAnalyticsDate(start || end);
}

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

  const hasInsightTableRows = domainData?.insightTables?.some((x) => x.rows?.length > 0);
  const hasDomainCharts = domainData?.charts && Object.values(domainData.charts).some((arr) => Array.isArray(arr) && arr.length > 0);
  const showPrimaryDomainTable =
    domainData?.table?.length > 0 && (!domainData.insightTables || domainData.insightTables.length === 0);
  const hasRoutesPeriodTotals =
    activeTab === 'routes' &&
    ((domainData?.totalsWeekly?.length || 0) > 0 || (domainData?.totalsMonthly?.length || 0) > 0);

  const sectionQuestions = SECTION_QUESTIONS[activeTab] || [];
  const selectedQuestion = sectionQuestions.find((question) => question.id === activeQuestionId) || null;

  const overviewRoutesForecast = useMemo(
    () => buildForecastLineData(overview?.charts?.routesDriversByDay || overview?.charts?.routesByDay || [], { labelKey: 'date', valueKey: 'count', step: 'day', count: 7, decimals: 0 }),
    [overview?.charts?.routesDriversByDay, overview?.charts?.routesByDay],
  );
  const overviewPayrollForecast = useMemo(
    () => buildForecastLineData(overview?.charts?.payrollByMonth || [], { labelKey: 'month_key', valueKey: 'total_bonus', step: 'month', count: 1, decimals: 2 }),
    [overview?.charts?.payrollByMonth],
  );
  const overviewHrMovement = overview?.charts?.hrMovementByMonth || [];
  const overviewScoreTrend = overview?.charts?.scoreTrend || [];

  const operationsDaily = domainData?.charts?.dailyVolume || domainData?.summary || [];
  const operationsProductivity = domainData?.charts?.productivityByDay || [];
  const attendanceDaily = domainData?.charts?.dailyPresence || domainData?.table || [];
  const attendanceWithAverage = useMemo(
    () => buildRollingAverage(attendanceDaily, 'present', 'present_avg_3d', 3),
    [attendanceDaily],
  );
  const routesDailyForecast = useMemo(
    () => buildForecastLineData(domainData?.charts?.dailyRoutes || domainData?.table || [], { labelKey: 'date', valueKey: 'routes', step: 'day', count: 7, decimals: 0 }),
    [domainData?.charts?.dailyRoutes, domainData?.table],
  );
  const routesWeeklyForecast = useMemo(
    () => buildForecastLineData(domainData?.charts?.weeklyRoutes || domainData?.totalsWeekly || [], { labelKey: 'week_start', valueKey: 'routes', step: 'week', count: 4, decimals: 0 }),
    [domainData?.charts?.weeklyRoutes, domainData?.totalsWeekly],
  );
  const payrollMonthlyForecast = useMemo(
    () => buildForecastLineData(domainData?.charts?.monthlyTotals || [], { labelKey: 'month_key', valueKey: 'total_bonus', step: 'month', count: 1, decimals: 2 }),
    [domainData?.charts?.monthlyTotals],
  );
  const hrMonthlyForecast = useMemo(
    () => buildForecastLineData(domainData?.charts?.monthlyMovement || [], { labelKey: 'month_key', valueKey: 'net', step: 'month', count: 1, decimals: 1 }),
    [domainData?.charts?.monthlyMovement],
  );
  const performanceScoreForecast = useMemo(
    () => buildForecastLineData(domainData?.charts?.overallScoreTrend || [], { labelKey: 'week_label', valueKey: 'overall_score', step: 'week', count: 3, decimals: 1 }),
    [domainData?.charts?.overallScoreTrend],
  );
  const safetyInspectionForecast = useMemo(
    () => buildForecastLineData(domainData?.charts?.inspectionsByDay || [], { labelKey: 'date', valueKey: 'inspections', step: 'day', count: 7, decimals: 0 }),
    [domainData?.charts?.inspectionsByDay],
  );
  const pagePeriodLabel = formatAnalyticsPeriod(overview?.period?.start || startDate, overview?.period?.end || endDate);
  const comparisonPeriodLabel = overview?.comparison ? formatAnalyticsPeriod(overview.comparison.start, overview.comparison.end) : '';
  const overviewPrimaryKpis = (overview?.kpis || []).slice(0, 4);
  const overviewSecondaryKpis = (overview?.kpis || []).slice(4);
  const visibleSavedViews = savedViews.slice(0, 4);

  return (
    <section className="analytics-page">
      <header className="analytics-header analytics-hero">
        <div className="analytics-hero-copy">
          <div className="analytics-eyebrow">Management intelligence</div>
          <h1>{t('analytics.title')}</h1>
          <p className="muted analytics-hero-subtitle">
            Live operational, HR, payroll, fleet and compliance analytics from DSP data and Kenjo.
          </p>
          <div className="analytics-hero-meta">
            <span className="analytics-pill">Period: {pagePeriodLabel}</span>
            {compareMode !== 'none' && comparisonPeriodLabel ? (
              <span className="analytics-pill analytics-pill--soft">Compare: {comparisonPeriodLabel}</span>
            ) : null}
            <span className="analytics-pill analytics-pill--soft">Saved views: {savedViews.length}</span>
          </div>
        </div>
        <div className="analytics-hero-aside">
          <div className="analytics-highlight-card">
            <div className="analytics-highlight-label">Current section</div>
            <div className="analytics-highlight-value">{t(`analytics.${activeTab}`)}</div>
            <div className="analytics-highlight-caption">
              {activeTab === 'overview' ? 'Executive summary across all domains' : 'Deep-dive analytics for the selected domain'}
            </div>
          </div>
        </div>
      </header>

      <div className="analytics-controls analytics-panel">
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

      {visibleSavedViews.length > 0 && (
        <div className="analytics-saved-strip">
          <span className="analytics-saved-strip-label">Recent saved views</span>
          <div className="analytics-saved-strip-items">
            {visibleSavedViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className="analytics-saved-chip"
                onClick={() => {
                  setActiveTab(view.page_key || 'overview');
                  const filters = view.filters_json || {};
                  setDatePreset(filters.datePreset || 'this_month');
                  setStartDate(filters.startDate || '');
                  setEndDate(filters.endDate || '');
                  setCompareMode(filters.compareMode || 'none');
                  setInsuranceYear(Number(filters.insuranceYear || 2026));
                }}
              >
                {view.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="analytics-tabs analytics-panel">
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
          <div className="analytics-spotlight-grid">
            {overviewPrimaryKpis.map((kpi) => (
              <div key={kpi.key} className="analytics-kpi-card analytics-kpi-card--hero">
                <div className="analytics-kpi-label">{labelForKpi(kpi)}</div>
                <div className="analytics-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</div>
              </div>
            ))}
          </div>
          {overviewSecondaryKpis.length > 0 && (
            <div className="analytics-kpi-grid">
              {overviewSecondaryKpis.map((kpi) => (
                <div key={kpi.key} className="analytics-kpi-card">
                  <div className="analytics-kpi-label">{labelForKpi(kpi)}</div>
                  <div className="analytics-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="analytics-overview-summary analytics-panel">
            <div>
              <div className="analytics-section-title">Executive summary</div>
              <div className="analytics-section-subtitle">
                This panel blends daily route volume, payroll movement, performance scorecards, fleet status and HR movement into one view.
              </div>
            </div>
            <div className="analytics-overview-summary-meta">
              <span>{overview?.companyScorecardRecent?.length || 0} recent scorecard weeks</span>
              <span>{overview?.charts?.routesDriversByDay?.length || 0} route days in scope</span>
              <span>{overview?.charts?.payrollByMonth?.length || 0} payroll months in trend</span>
            </div>
          </div>
          <div className="analytics-charts">
            {overview.companyScorecardRecent?.length > 0 && (
              <div className="analytics-chart-card">
                <h3>Company scorecard (last {overview.companyScorecardRecent.length} weeks)</h3>
                <div className="analytics-donut-list">
                  {overview.companyScorecardRecent.map((r) => (
                    <div key={`${r.year}-${r.week}`} className="analytics-donut-item">
                      <span className="analytics-donut-label">{r.week_label}</span>
                      <span className="analytics-donut-value">
                        {r.overall_tier}
                        {r.overall_score != null && !Number.isNaN(r.overall_score) ? ` · ${r.overall_score}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {overview.charts?.routesByDay?.length > 0 && (
              <div className="analytics-chart-card">
                <h3>Routes completed by day</h3>
                <div className="analytics-chart-bars">
                  {overview.charts.routesByDay.slice(-14).map((r) => (
                    <div key={r.date} className="analytics-bar-row">
                      <span className="analytics-bar-label">{formatAnalyticsDate(r.date)}</span>
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

            {overviewRoutesForecast.length > 1 && (
              <div className="analytics-chart-card">
                <h3>Routes trend and 7-day projection</h3>
                <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
                  Trend line extends recent route behavior into a short operational projection.
                </p>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={overviewRoutesForecast}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                      <YAxis />
                      <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                      <Legend />
                      <Line type="monotone" dataKey="actual" name="Actual routes" stroke={ANALYTICS_COLORS.primary} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="forecast" name="Projection" stroke={ANALYTICS_COLORS.accent} strokeDasharray="6 6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {(overview?.charts?.routesDriversByDay || []).length > 1 && (
              <div className="analytics-chart-card">
                <h3>Routes vs driver capacity</h3>
                <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
                  This highlights whether route growth is supported by enough active drivers.
                </p>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={overview.charts.routesDriversByDay}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="count" name="Routes" fill={ANALYTICS_COLORS.primary} radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="drivers" name="Drivers" stroke={ANALYTICS_COLORS.secondary} strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {overviewPayrollForecast.length > 1 && (
              <div className="analytics-chart-card">
                <h3>Payroll trend and next-month forecast</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={overviewPayrollForecast}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month_key" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="actual" name="Actual payroll" stroke={ANALYTICS_COLORS.secondary} fill={ANALYTICS_COLORS.secondary} fillOpacity={0.15} />
                      <Line type="monotone" dataKey="forecast" name="Forecast" stroke={ANALYTICS_COLORS.accent} strokeDasharray="6 6" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {overviewHrMovement.length > 0 && (
              <div className="analytics-chart-card">
                <h3>HR movement trend</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={overviewHrMovement}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month_key" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="hires" name="Hires" fill={ANALYTICS_COLORS.secondary} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="terminations" name="Terminations" fill={ANALYTICS_COLORS.danger} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {overviewScoreTrend.length > 0 && (
              <div className="analytics-chart-card">
                <h3>Performance score trend</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={overviewScoreTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week_label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="overall_score" name="Overall score" stroke={ANALYTICS_COLORS.primary} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="capacity_reliability" name="Capacity reliability" stroke={ANALYTICS_COLORS.accent} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab !== 'overview' && activeTab !== 'custom' && !loading && domainData && (
        <div className="analytics-domain">
          <div className="analytics-domain-hero analytics-panel">
            <div>
              <div className="analytics-section-title">{t(`analytics.${activeTab}`)}</div>
              <div className="analytics-section-subtitle">
                {selectedQuestion ? selectedQuestion.label : `Expanded analytics for ${t(`analytics.${activeTab}`)} across DSP data and Kenjo.`}
              </div>
            </div>
            <div className="analytics-domain-hero-meta">
              <span className="analytics-pill">Range: {pagePeriodLabel}</span>
              {domainData?.kpis?.length ? <span className="analytics-pill analytics-pill--soft">KPIs: {domainData.kpis.length}</span> : null}
              {domainData?.insightTables?.length ? <span className="analytics-pill analytics-pill--soft">Insight tables: {domainData.insightTables.length}</span> : null}
            </div>
          </div>

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

          {sectionQuestions.length > 0 && (
            <div className="analytics-chart-card" style={{ marginBottom: '1rem' }}>
              <h3>Questions This Section Can Answer</h3>
              {selectedQuestion && (
                <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>
                  Current focus: <strong>{selectedQuestion.label}</strong>
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {sectionQuestions.map((question) => (
                  <button
                    key={question.id}
                    type="button"
                    className={question.id === activeQuestionId ? 'btn-primary analytics-btn' : 'btn-secondary analytics-btn'}
                    onClick={() => setActiveQuestionId((prev) => (prev === question.id ? '' : question.id))}
                  >
                    {question.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'operations' && operationsDaily.length > 0 && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              <div className="analytics-chart-card">
                <h3>Operations volume trend</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={operationsDaily}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="routes_completed" name="Routes" fill={ANALYTICS_COLORS.primary} radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="drivers_worked" name="Drivers worked" stroke={ANALYTICS_COLORS.secondary} strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="analytics-chart-card">
                <h3>Productivity per driver-day</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={operationsProductivity}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                      <YAxis />
                      <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                      <Line type="monotone" dataKey="routes_per_driver" name="Routes per driver" stroke={ANALYTICS_COLORS.accent} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'attendance' && attendanceWithAverage.length > 0 && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              <div className="analytics-chart-card">
                <h3>Attendance trend</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={attendanceWithAverage}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                      <YAxis />
                      <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                      <Legend />
                      <Line type="monotone" dataKey="present" name="Present drivers" stroke={ANALYTICS_COLORS.primary} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="present_avg_3d" name="3-day average" stroke={ANALYTICS_COLORS.secondary} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payroll' && payrollMonthlyForecast.length > 0 && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              <div className="analytics-chart-card">
                <h3>Monthly payroll trend and forecast</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={payrollMonthlyForecast}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month_key" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="actual" name="Actual payroll" fill={ANALYTICS_COLORS.primary} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="forecast" name="Forecast" stroke={ANALYTICS_COLORS.accent} strokeDasharray="6 6" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="analytics-chart-card">
                <h3>Bonus vs advances vs deductions</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={domainData.charts?.monthlyTotals || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month_key" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="bonus" name="Bonus" fill={ANALYTICS_COLORS.secondary} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="vorschuss" name="Advances" fill={ANALYTICS_COLORS.accent} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="abzug" name="Deductions" fill={ANALYTICS_COLORS.danger} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'drivers' && (domainData.charts?.activeMix?.length > 0 || domainData.charts?.topRoutesByDriver?.length > 0) && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              {domainData.charts?.activeMix?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Driver active mix</h3>
                  <div className="analytics-donut-list">
                    {domainData.charts.activeMix.map((row) => (
                      <div key={row.label} className="analytics-donut-item">
                        <span className="analytics-donut-label">{row.label}</span>
                        <span className="analytics-donut-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {domainData.charts?.topRoutesByDriver?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Top drivers by routes</h3>
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                      <BarChart data={domainData.charts.topRoutesByDriver} layout="vertical" margin={{ left: 24, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="label" type="category" width={130} />
                        <Tooltip />
                        <Bar dataKey="value" name="Routes" fill={ANALYTICS_COLORS.primary} radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'routes' && (routesDailyForecast.length > 0 || routesWeeklyForecast.length > 0) && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              {routesDailyForecast.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Daily routes trend and next-week forecast</h3>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={routesDailyForecast}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                        <YAxis />
                        <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                        <Legend />
                        <Line type="monotone" dataKey="actual" name="Actual routes" stroke={ANALYTICS_COLORS.primary} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="forecast" name="Forecast" stroke={ANALYTICS_COLORS.accent} strokeDasharray="6 6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {routesWeeklyForecast.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Weekly route projection</h3>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <AreaChart data={routesWeeklyForecast}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="week_start" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                        <YAxis />
                        <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                        <Legend />
                        <Area type="monotone" dataKey="actual" name="Actual weekly routes" stroke={ANALYTICS_COLORS.secondary} fill={ANALYTICS_COLORS.secondary} fillOpacity={0.16} />
                        <Line type="monotone" dataKey="forecast" name="Projected weeks" stroke={ANALYTICS_COLORS.accent} strokeDasharray="6 6" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'performance' && performanceScoreForecast.length > 0 && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              <div className="analytics-chart-card">
                <h3>Overall score trend and projection</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={performanceScoreForecast}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week_label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="actual" name="Actual score" stroke={ANALYTICS_COLORS.primary} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="forecast" name="Projected score" stroke={ANALYTICS_COLORS.accent} strokeDasharray="6 6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="analytics-chart-card">
                <h3>Key performance drivers</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={domainData.charts?.overallScoreTrend || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week_label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="safe_driving_fico" name="Safe driving" stroke={ANALYTICS_COLORS.secondary} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="delivery_completion_rate_dcr" name="Delivery completion" stroke={ANALYTICS_COLORS.primary} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="capacity_reliability" name="Capacity reliability" stroke={ANALYTICS_COLORS.accent} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'safety' && (safetyInspectionForecast.length > 0 || domainData.charts?.statusDistribution?.length > 0) && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              {safetyInspectionForecast.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Inspection throughput trend</h3>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={safetyInspectionForecast}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                        <YAxis />
                        <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                        <Legend />
                        <Line type="monotone" dataKey="actual" name="Actual inspections" stroke={ANALYTICS_COLORS.primary} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="forecast" name="Projected inspections" stroke={ANALYTICS_COLORS.accent} strokeDasharray="6 6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {domainData.charts?.statusDistribution?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Inspection status distribution</h3>
                  <div className="analytics-donut-list">
                    {domainData.charts.statusDistribution.map((row) => (
                      <div key={String(row.label)} className="analytics-donut-item">
                        <span className="analytics-donut-label">{row.label}</span>
                        <span className="analytics-donut-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'fleet' && (domainData.charts?.statusDistribution?.length > 0 || domainData.charts?.assignmentCoverage?.length > 0) && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              {domainData.charts?.statusDistribution?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Fleet status mix</h3>
                  <div className="analytics-donut-list">
                    {domainData.charts.statusDistribution.map((row) => (
                      <div key={String(row.label)} className="analytics-donut-item">
                        <span className="analytics-donut-label">{row.label}</span>
                        <span className="analytics-donut-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {domainData.charts?.assignmentCoverage?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Driver assignment coverage</h3>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart data={domainData.charts.assignmentCoverage}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" name="Vehicles" fill={ANALYTICS_COLORS.primary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {domainData.charts?.workshopTimeline?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Upcoming workshops</h3>
                  <div className="analytics-donut-list">
                    {domainData.charts.workshopTimeline.map((row) => (
                      <div key={`${row.label}-${row.planned_workshop_from || ''}`} className="analytics-donut-item analytics-donut-item--stacked">
                        <span className="analytics-donut-label">{row.label}</span>
                        <span className="analytics-donut-value">
                          {formatAnalyticsDate(row.planned_workshop_from)}
                          {row.planned_workshop_to && row.planned_workshop_to !== row.planned_workshop_from ? ` - ${formatAnalyticsDate(row.planned_workshop_to)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'hr' && hrMonthlyForecast.length > 0 && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              <div className="analytics-chart-card">
                <h3>Monthly hires vs terminations</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={domainData.charts?.monthlyMovement || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month_key" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="hires" name="Hires" fill={ANALYTICS_COLORS.secondary} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="terminations" name="Terminations" fill={ANALYTICS_COLORS.danger} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="analytics-chart-card">
                <h3>Net movement and next-month projection</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={hrMonthlyForecast}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month_key" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="actual" name="Actual net movement" stroke={ANALYTICS_COLORS.primary} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="forecast" name="Projected net movement" stroke={ANALYTICS_COLORS.accent} strokeDasharray="6 6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
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
                      <span className="analytics-bar-label">{formatAnalyticsDate(r.date)}</span>
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

          {activeTab === 'compliance' && (domainData.charts?.expiringByType?.length > 0 || domainData.charts?.expiriesTimeline?.length > 0) && (
            <div className="analytics-charts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
              {domainData.charts?.expiringByType?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Expiring documents by type</h3>
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <BarChart data={domainData.charts.expiringByType}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" interval={0} angle={-18} textAnchor="end" height={60} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" name="Documents" fill={ANALYTICS_COLORS.accent} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {domainData.charts?.expiriesTimeline?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Expiry timeline</h3>
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <LineChart data={domainData.charts.expiriesTimeline}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(value) => formatAnalyticsDate(value).slice(0, 5)} />
                        <YAxis />
                        <Tooltip labelFormatter={renderAnalyticsTooltipLabel} />
                        <Line type="monotone" dataKey="count" name="Expiring docs" stroke={ANALYTICS_COLORS.danger} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
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
                            <td key={k}>{formatAnalyticsCell(k, v)}</td>
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

          {activeTab === 'routes' && hasRoutesPeriodTotals && (
            <div className="analytics-charts" style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
              <div className="analytics-chart-card">
                <h3>Total per week</h3>
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Week starting</th>
                        <th>Routes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(domainData.totalsWeekly || []).map((row, i) => (
                        <tr key={i}>
                          <td>{formatAnalyticsDate(row.week_start)}</td>
                          <td>{row.routes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                  Sum over weeks in range:{' '}
                  <strong>{(domainData.totalsWeekly || []).reduce((s, r) => s + (Number(r.routes) || 0), 0)}</strong>
                </p>
              </div>
              <div className="analytics-chart-card">
                <h3>Total per month</h3>
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Routes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(domainData.totalsMonthly || []).map((row, i) => (
                        <tr key={i}>
                          <td>{formatAnalyticsCell('month_key', row.month_key)}</td>
                          <td>{row.routes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                  Sum over months in range:{' '}
                  <strong>{(domainData.totalsMonthly || []).reduce((s, r) => s + (Number(r.routes) || 0), 0)}</strong>
                </p>
              </div>
            </div>
          )}

          {showPrimaryDomainTable && (
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
                        <td key={k}>{formatAnalyticsCell(k, v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'hr' && (
            <div className="analytics-domain-section" style={{ marginTop: '1.25rem' }}>
              <h3>New hires</h3>
              {domainData.newHires?.length > 0 ? (
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Start date</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {domainData.newHires.map((row, i) => (
                        <tr key={i}>
                          <td>{formatAnalyticsDate(row.start_date)}</td>
                          <td>{row.cnt ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="analytics-no-data">No new hires in this period.</p>
              )}
              <h3 style={{ marginTop: '1.25rem' }}>Terminations</h3>
              {domainData.terminations?.length > 0 ? (
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Termination date</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {domainData.terminations.map((row, i) => (
                        <tr key={i}>
                          <td>{formatAnalyticsDate(row.termination_date)}</td>
                          <td>{row.cnt ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="analytics-no-data">No terminations in this period.</p>
              )}
            </div>
          )}
          {!domainData.kpis?.length &&
            !hasDomainCharts &&
            !hasInsightTableRows &&
            !showPrimaryDomainTable &&
            activeTab !== 'hr' &&
            !hasRoutesPeriodTotals && (
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
