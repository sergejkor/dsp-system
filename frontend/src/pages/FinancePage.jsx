import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Bar,
} from 'recharts';
import { useAppSettings } from '../context/AppSettingsContext';
import { getFinance } from '../services/financeApi';

function eurFmt(lang) {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

function shortMonth(ds, lang) {
  if (!ds) return '';
  const d = new Date(`${ds.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { month: 'short', year: 'numeric' });
}

export default function FinancePage() {
  const { language, t } = useAppSettings();
  const lang = language === 'de' ? 'de' : 'en';
  const money = useMemo(() => eurFmt(lang), [lang]);

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [forecastKey, setForecastKey] = useState('summeFahrten');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getFinance()
      .then((d) => {
        if (!cancelled) setPayload(d);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = String(e?.message || '');
        if (/\b404\b|Finance API not found/i.test(msg)) {
          setError(t('finance.errorApi404'));
        } else {
          setError(msg || t('finance.unavailable'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const periods = payload?.annualOverview?.periods || [];
  const ytdKey = payload?.annualOverview?.tableRows?.[0]?.values
    ? Object.keys(payload.annualOverview.tableRows[0].values).find((k) => k === 'ytd')
    : null;
  const hasYtd = Boolean(ytdKey);

  const overviewChartRows = useMemo(() => {
    if (!payload?.annualOverview?.tableRows?.length) return [];
    const want = new Set(['1021', '1041', '1300']);
    return payload.annualOverview.tableRows.filter((r) => want.has(String(r.code)));
  }, [payload]);

  const overviewChartData = useMemo(() => {
    const rows = overviewChartRows;
    if (!rows.length || !periods.length) return [];
    return periods.map((p) => {
      const point = { period: p, label: shortMonth(`${p}-01`, lang) };
      rows.forEach((r) => {
        point[`row_${r.code}`] = r.values?.[p] ?? null;
      });
      return point;
    });
  }, [overviewChartRows, periods, lang]);

  const forecastBlock = payload?.forecasts?.[forecastKey];
  const forecastChartData = useMemo(() => {
    const pts = forecastBlock?.forecast?.points || [];
    return pts.map((x) => ({
      ...x,
      label: shortMonth(x.ds, lang),
      actualLine: x.actual != null ? x.actual : null,
    }));
  }, [forecastBlock, lang]);

  const monthTabs = payload?.meta?.monthSheetNames || [];

  if (loading) {
    return (
      <section className="card finance-page">
        <h2>{t('finance.title')}</h2>
        <p className="muted">{t('finance.loading')}</p>
      </section>
    );
  }

  if (error || !payload?.ok) {
    return (
      <section className="card finance-page">
        <h2>{t('finance.title')}</h2>
        <p className="finance-page__err">{error || payload?.error || t('finance.unavailable')}</p>
        {payload?.hint ? <p className="muted">{payload.hint}</p> : null}
      </section>
    );
  }

  return (
    <section className="card finance-page">
      <h2>{t('finance.title')}</h2>
      <p className="muted">{t('finance.description')}</p>
      <p className="muted small">
        {t('finance.source')}: <code>{payload.meta?.source}</code> · {payload.meta?.currency}
      </p>

      <div className="finance-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}>
          {t('finance.tabOverview')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'forecast'} className={tab === 'forecast' ? 'is-active' : ''} onClick={() => setTab('forecast')}>
          {t('finance.tabForecast')}
        </button>
        {monthTabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? 'is-active' : ''}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="finance-panel">
          <h3>{t('finance.annualTitle')}</h3>
          <div className="finance-chart-wrap">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={overviewChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => money.format(v).replace('\u00a0', ' ')} width={72} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => (v == null ? '—' : money.format(v))} labelFormatter={(lbl, p) => p?.payload?.period || lbl} />
                <Legend />
                <Bar dataKey="row_1021" name="Erlöse Parcel" fill="#3b82f6" opacity={0.85} />
                <Line type="monotone" dataKey="row_1041" name="Summe Fahrten" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="row_1300" name="Betriebsergebnis" stroke="#b45309" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="finance-table-scroll">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>{t('finance.colLine')}</th>
                  <th>{t('finance.colLabel')}</th>
                  {periods.map((p) => (
                    <th key={p}>{p}</th>
                  ))}
                  {hasYtd ? <th>ytd</th> : null}
                </tr>
              </thead>
              <tbody>
                {payload.annualOverview.tableRows.map((r) => (
                  <tr key={`${r.code}-${r.label}`}>
                    <td>{r.code}</td>
                    <td>{r.label || '—'}</td>
                    {periods.map((p) => (
                      <td key={p}>{r.values?.[p] != null ? money.format(r.values[p]) : '—'}</td>
                    ))}
                    {hasYtd ? <td>{r.values?.ytd != null ? money.format(r.values.ytd) : '—'}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'forecast' && forecastBlock && (
        <div className="finance-panel">
          <h3>{t('finance.forecastTitle')}</h3>
          <p className="muted small">{t('finance.forecastHint')}</p>

          <label className="finance-select-label">
            {t('finance.metric')}
            <select value={forecastKey} onChange={(e) => setForecastKey(e.target.value)}>
              {Object.values(payload.forecasts).map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.rowCode})
                </option>
              ))}
            </select>
          </label>

          <p className="muted small">
            {t('finance.engine')}: <strong>{forecastBlock.forecast?.engine || '—'}</strong>
            {forecastBlock.forecast?.prophetHint ? (
              <>
                {' '}
                — {forecastBlock.forecast.prophetHint}
              </>
            ) : null}
          </p>

          <div className="finance-chart-wrap">
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={forecastChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => money.format(v).replace('\u00a0', ' ')} width={72} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => (v == null ? '—' : money.format(Number(v)))} />
                <Legend />
                <Line type="monotone" dataKey="yhat_upper" name={t('finance.upper')} stroke="#c4b5fd" strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="yhat_lower" name={t('finance.lower')} stroke="#c4b5fd" strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="yhat" name={t('finance.forecastLine')} stroke="#7c3aed" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="actualLine" name={t('finance.actual')} stroke="#0f766e" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {monthTabs.includes(tab) && payload.monthlySheets?.[tab] && (
        <div className="finance-panel">
          <h3>{tab}</h3>
          <div className="finance-table-scroll">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>{t('finance.colLine')}</th>
                  <th>{t('finance.colLabel')}</th>
                  <th>{t('finance.monthAlle')}</th>
                  <th>{t('finance.ytdAlle')}</th>
                  <th>{t('finance.monthSammel')}</th>
                  <th>{t('finance.ytdSammel')}</th>
                </tr>
              </thead>
              <tbody>
                {payload.monthlySheets[tab].tableRows.map((r) => (
                  <tr key={`${r.code}-${r.label}`}>
                    <td>{r.code}</td>
                    <td>{r.label || '—'}</td>
                    <td>{r.monthAlle != null ? money.format(r.monthAlle) : '—'}</td>
                    <td>{r.ytdAlle != null ? money.format(r.ytdAlle) : '—'}</td>
                    <td>{r.monthSammel != null ? money.format(r.monthSammel) : '—'}</td>
                    <td>{r.ytdSammel != null ? money.format(r.ytdSammel) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        .finance-page__err { color: #b91c1c; }
        .finance-tabs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 1rem 0; }
        .finance-tabs button {
          border: 1px solid var(--border, #e5e7eb);
          background: var(--bg-card, #fff);
          padding: 0.35rem 0.65rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .finance-tabs button.is-active {
          border-color: #4f46e5;
          background: #eef2ff;
          font-weight: 600;
        }
        .finance-panel { margin-top: 0.5rem; }
        .finance-panel h3 { margin-top: 0; font-size: 1.05rem; }
        .finance-chart-wrap { width: 100%; margin: 0.75rem 0 1rem; }
        .finance-table-scroll { overflow: auto; max-height: 60vh; border: 1px solid var(--border, #e5e7eb); border-radius: 8px; }
        .finance-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .finance-table th, .finance-table td { border: 1px solid var(--border, #e5e7eb); padding: 0.35rem 0.5rem; text-align: left; white-space: nowrap; }
        .finance-table th { position: sticky; top: 0; background: var(--bg-card, #f9fafb); z-index: 1; }
        .finance-select-label { display: flex; flex-direction: column; gap: 0.25rem; max-width: 320px; margin: 0.5rem 0; font-size: 0.9rem; }
        .finance-select-label select { padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--border, #e5e7eb); }
        body.dark .finance-tabs button { background: #111827; border-color: #374151; }
        body.dark .finance-tabs button.is-active { background: #312e81; border-color: #6366f1; }
        body.dark .finance-table th { background: #1f2937; }
      `}</style>
    </section>
  );
}
