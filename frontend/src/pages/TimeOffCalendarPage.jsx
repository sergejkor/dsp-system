import { useState, useEffect, useRef, useMemo } from 'react';
import { syncTimeOff, getTimeOff } from '../services/kenjoApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { translations } from '../translations';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Kenjo time-off type ID → translation key (timeOffCalendar.types.*) */
const TIME_OFF_TYPE_KEYS = {
  '687e0fe3f163e70478acbc22': 'unpaidAbsence',
  '685e7223e6bac64cb0a27e39': 'sick',
  '687934581d4edc7ae3d37182': 'free',
  '685e7223e6bac64cb0a27e38': 'vacation',
};

/** Type ID → dot color for calendar */
const TIME_OFF_TYPE_COLORS = {
  '687e0fe3f163e70478acbc22': '#f97316',
  '685e7223e6bac64cb0a27e39': '#dc2626',
  '687934581d4edc7ae3d37182': '#16a34a',
  '685e7223e6bac64cb0a27e38': '#2563eb',
};
const DEFAULT_TYPE_COLOR = '#6b7280';

function formatDate(s) {
  if (s == null || s === '') return '—';
  const str = String(s).trim();
  const datePart = str.slice(0, 10);
  if (datePart.length < 10 || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '—';
  const [y, m, d] = datePart.split('-');
  return `${d}.${m}.${y}`;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TimeOffCalendarPage() {
  const { t, language } = useAppSettings();
  const now = new Date();
  const [month, setMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [showListOpen, setShowListOpen] = useState(false);
  const hasSyncedOnMount = useRef(false);

  const monthNames = (translations[language]?.timeOffCalendar?.months || translations.en?.timeOffCalendar?.months || EN_MONTHS).slice(0, 12);
  const monthOptions = useMemo(() => {
    const list = [];
    for (let i = -2; i <= 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      list.push({ value: `${y}-${m}`, label: `${monthNames[d.getMonth()]} ${y}` });
    }
    return list;
  }, [monthNames, now.getFullYear(), now.getMonth()]);

  useEffect(() => {
    if (hasSyncedOnMount.current) return;
    hasSyncedOnMount.current = true;
    const initialMonth = month;
    setSyncing(true);
    setError('');
    syncTimeOff(initialMonth)
      .then(() => getTimeOff(initialMonth))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setSyncing(false));
  }, []);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setError('');
    syncTimeOff(month)
      .then(() => getTimeOff(month))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => {
        setError(String(e?.message || e));
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [month]);

  async function handleRefreshFromKenjo() {
    if (!month) return;
    setSyncing(true);
    setError('');
    try {
      await syncTimeOff(month);
      const data = await getTimeOff(month);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSyncing(false);
    }
  }

  const [year, monthNum] = useMemo(() => {
    if (!month || month.length < 7) return [now.getFullYear(), 1];
    const [y, m] = month.split('-').map(Number);
    return [y, m];
  }, [month]);

  const lastDay = useMemo(() => new Date(year, monthNum, 0).getDate(), [year, monthNum]);

  const { employeesList, dayTypesByEmployee } = useMemo(() => {
    const byId = new Map();
    const dayTypes = new Map();
    for (const row of rows || []) {
      const id = row.kenjo_user_id || row.employee_name || '';
      const name = row.employee_name || id || '—';
      if (id) byId.set(id, name);
      const start = row.start_date ? String(row.start_date).slice(0, 10) : '';
      const end = row.end_date ? String(row.end_date).slice(0, 10) : '';
      const typeId = row.time_off_type || '';
      if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
      const [sy, sm, sd] = start.split('-').map(Number);
      const [ey, em, ed] = end.split('-').map(Number);
      const startTime = new Date(sy, sm - 1, sd).getTime();
      const endTime = new Date(ey, em - 1, ed).getTime();
      for (let d = 1; d <= lastDay; d++) {
        const dayStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const t = new Date(year, monthNum - 1, d).getTime();
        if (t >= startTime && t <= endTime) {
          if (!dayTypes.has(id)) dayTypes.set(id, {});
          if (!dayTypes.get(id)[d]) dayTypes.get(id)[d] = typeId;
        }
      }
    }
    const list = Array.from(byId.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return { employeesList: list, dayTypesByEmployee: dayTypes };
  }, [rows, year, monthNum, lastDay]);

  /** Per employee: count of working days per type (Mon–Fri only). */
  const weekdayCountByEmployee = useMemo(() => {
    const byEmployee = new Map();
    for (const emp of employeesList) {
      const count = {};
      const dayTypes = dayTypesByEmployee.get(emp.id) || {};
      for (let d = 1; d <= lastDay; d++) {
        const dayOfWeek = new Date(year, monthNum - 1, d).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        const typeId = dayTypes[d];
        if (typeId) {
          count[typeId] = (count[typeId] || 0) + 1;
        }
      }
      byEmployee.set(emp.id, count);
    }
    return byEmployee;
  }, [employeesList, dayTypesByEmployee, year, monthNum, lastDay]);

  const columns = [
    { key: 'employee_name', labelKey: 'timeOffCalendar.columns.employee' },
    { key: 'time_off_type_name', labelKey: 'timeOffCalendar.columns.type' },
    { key: 'start_date', labelKey: 'timeOffCalendar.columns.startDate' },
    { key: 'end_date', labelKey: 'timeOffCalendar.columns.endDate' },
    { key: 'status', labelKey: 'timeOffCalendar.columns.status' },
  ];

  function getTypeLabel(typeId) {
    const key = TIME_OFF_TYPE_KEYS[typeId];
    return key ? t(`timeOffCalendar.types.${key}`) : (typeId || '—');
  }

  return (
    <section className="card time-off-calendar-page">
      <h2>{t('timeOffCalendar.title')}</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        {t('timeOffCalendar.instructions')}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontFamily: 'inherit' }}>{t('timeOffCalendar.month')}</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '0.5rem', minWidth: 180 }}
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefreshFromKenjo}
            disabled={syncing || loading}
            style={{ marginRight: '0.5rem' }}
          >
            {syncing ? 'Refreshing…' : 'Refresh from Kenjo'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowListOpen(true)}
          >
            {t('timeOffCalendar.showList')}
          </button>
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, marginRight: '0.5rem', fontFamily: 'inherit', fontSize: '0.9rem' }}>{t('timeOffCalendar.legend')}</span>
        {Object.entries(TIME_OFF_TYPE_KEYS).map(([typeId, key]) => (
          <span key={typeId} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: TIME_OFF_TYPE_COLORS[typeId] || DEFAULT_TYPE_COLOR,
                flexShrink: 0,
              }}
            />
            {t(`timeOffCalendar.types.${key}`)}
          </span>
        ))}
      </div>

      {loading || syncing ? (
        <p className="muted">{t('timeOffCalendar.loading')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="time-off-calendar-grid">
            <thead>
              <tr>
                <th className="time-off-calendar-sticky-name">
                  {t('timeOffCalendar.employee')}
                </th>
                {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => {
                  const dayOfWeek = new Date(year, monthNum - 1, d).getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  return (
                    <th
                      key={d}
                      className={`time-off-calendar-day-header ${isWeekend ? 'time-off-calendar-day-header--weekend' : ''}`}
                      title={WEEKDAY_LETTERS[dayOfWeek]}
                    >
                      {d}
                    </th>
                  );
                })}
                <th className="time-off-calendar-total-col">
                  {t('timeOffCalendar.totalWorkingDays')}
                </th>
              </tr>
            </thead>
            <tbody>
              {employeesList.length === 0 ? (
                <tr>
                  <td colSpan={lastDay + 2} className="muted" style={{ padding: '1rem' }}>
                    {t('timeOffCalendar.noRecordsForMonth')}
                  </td>
                </tr>
              ) : (
                employeesList.map((emp) => {
                  const empCounts = weekdayCountByEmployee.get(emp.id) || {};
                  const summaryParts = Object.entries(TIME_OFF_TYPE_KEYS)
                    .map(([typeId, key]) => {
                      const n = empCounts[typeId] || 0;
                      return n > 0 ? `${t(`timeOffCalendar.types.${key}`)}: ${n}` : null;
                    })
                    .filter(Boolean);
                  return (
                    <tr key={emp.id}>
                      <td className="time-off-calendar-sticky-name">
                        {emp.name}
                      </td>
                      {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => {
                        const typeId = dayTypesByEmployee.get(emp.id)?.[d];
                        const dayOfWeek = new Date(year, monthNum - 1, d).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const color = typeId ? (TIME_OFF_TYPE_COLORS[typeId] || DEFAULT_TYPE_COLOR) : null;
                        return (
                          <td
                            key={d}
                            className={`time-off-calendar-day-cell ${isWeekend ? 'time-off-calendar-day-cell--weekend' : ''}`}
                          >
                            {color ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  backgroundColor: color,
                                }}
                                title={getTypeLabel(typeId)}
                              />
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="time-off-calendar-total-col">
                        {summaryParts.length > 0 ? summaryParts.join(', ') : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {showListOpen && (
        <div className="time-off-list-modal-backdrop" onClick={() => setShowListOpen(false)}>
          <div className="time-off-list-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('timeOffCalendar.timeOffListTitle').replace('{month}', monthOptions.find((o) => o.value === month)?.label ?? month)}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key}>{t(col.labelKey)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="muted" style={{ padding: '1rem' }}>{t('timeOffCalendar.noRecords')}</td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr key={row.kenjo_request_id || idx}>
                        <td>{row.employee_name ?? '—'}</td>
                        <td>
                          {getTypeLabel(row.time_off_type) || row.time_off_type_name || row.time_off_type || '—'}
                        </td>
                        <td>{formatDate(row.start_date)}</td>
                        <td>{formatDate(row.end_date)}</td>
                        <td>{row.status ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowListOpen(false)}>{t('timeOffCalendar.close')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
