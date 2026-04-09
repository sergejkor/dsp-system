import { useState, useEffect, useRef, useMemo } from 'react';
import { syncTimeOff, getTimeOff } from '../services/kenjoApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { translations } from '../translations';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const KNOWN_TIME_OFF_TYPE_BY_ID = {
  '687e0fe3f163e70478acbc22': 'unpaidAbsence',
  '685e7223e6bac64cb0a27e39': 'sick',
  '687934581d4edc7ae3d37182': 'free',
  '685e7223e6bac64cb0a27e38': 'vacation',
};

const TIME_OFF_TYPE_KEYS = ['unpaidAbsence', 'sick', 'free', 'vacation'];

const TIME_OFF_TYPE_COLORS = {
  unpaidAbsence: '#f97316',
  sick: '#dc2626',
  free: '#16a34a',
  vacation: '#2563eb',
};

const DEFAULT_TYPE_COLOR = '#6b7280';

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function normalizeTimeOffType(typeId, typeName) {
  const id = String(typeId || '').trim();
  if (id && KNOWN_TIME_OFF_TYPE_BY_ID[id]) return KNOWN_TIME_OFF_TYPE_BY_ID[id];

  const n = String(typeName || '').trim().toLowerCase();
  if (!n) return null;
  if (n.includes('unpaid') || n.includes('unbezahl')) return 'unpaidAbsence';
  if (n.includes('sick') || n.includes('krank')) return 'sick';
  if (n.includes('free') || n.includes('frei')) return 'free';
  if (n.includes('vacation') || n.includes('urlaub') || n.includes('holiday')) return 'vacation';
  return null;
}

function formatDate(s) {
  if (s == null || s === '') return '-';
  const str = String(s).trim();
  const datePart = str.slice(0, 10);
  if (datePart.length < 10 || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '-';
  const [y, m, d] = datePart.split('-');
  return `${d}.${m}.${y}`;
}

function formatIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getBavariaHolidaySet(year) {
  const easterSunday = getEasterSunday(year);
  const fixed = [
    `${year}-01-01`,
    `${year}-01-06`,
    `${year}-05-01`,
    `${year}-08-15`,
    `${year}-10-03`,
    `${year}-11-01`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];
  const movable = [
    formatIsoDate(addDays(easterSunday, -2)),
    formatIsoDate(addDays(easterSunday, 1)),
    formatIsoDate(addDays(easterSunday, 39)),
    formatIsoDate(addDays(easterSunday, 50)),
    formatIsoDate(addDays(easterSunday, 60)),
  ];
  return new Set([...fixed, ...movable]);
}

function getTypeColor(typeKey) {
  if (!typeKey) return DEFAULT_TYPE_COLOR;
  return TIME_OFF_TYPE_COLORS[typeKey] || DEFAULT_TYPE_COLOR;
}

function normalizeStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return s;
}

function isRenderableTimeOffStatus(status) {
  const s = normalizeStatus(status);
  return s !== 'cancelled' && s !== 'canceled' && s !== 'declined' && s !== 'rejected';
}

function isApprovedTimeOffStatus(status) {
  const s = normalizeStatus(status);
  return s === 'processed' || s === 'approved' || s === 'accepted';
}

function getStatusPriority(status) {
  const s = normalizeStatus(status);
  if (s === 'processed' || s === 'approved' || s === 'accepted') return 3;
  if (s === 'submitted' || s === 'pending') return 2;
  if (s === 'requested') return 1;
  return 0;
}

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
  }, [month, now]);

  const lastDay = useMemo(() => new Date(year, monthNum, 0).getDate(), [year, monthNum]);
  const bavariaHolidays = useMemo(() => getBavariaHolidaySet(year), [year]);
  const isHoliday = (d) => bavariaHolidays.has(`${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

  const { employeesList, dayTypesByEmployee } = useMemo(() => {
    const byId = new Map();
    const dayTypes = new Map();
    for (const row of rows || []) {
      if (!isRenderableTimeOffStatus(row.status)) continue;
      const id = row.kenjo_user_id || row.employee_name || '';
      const name = row.employee_name || id || '-';
      if (id) byId.set(id, name);
      const start = row.start_date ? String(row.start_date).slice(0, 10) : '';
      const end = row.end_date ? String(row.end_date).slice(0, 10) : '';
      const typeId = row.time_off_type || '';
      const typeName = row.time_off_type_name || '';
      const status = row.status || '';
      if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
      const [sy, sm, sd] = start.split('-').map(Number);
      const [ey, em, ed] = end.split('-').map(Number);
      const startTime = new Date(sy, sm - 1, sd).getTime();
      const endTime = new Date(ey, em - 1, ed).getTime();
      for (let d = 1; d <= lastDay; d++) {
        const t = new Date(year, monthNum - 1, d).getTime();
        if (t >= startTime && t <= endTime) {
          if (!dayTypes.has(id)) dayTypes.set(id, {});
          const current = dayTypes.get(id)[d];
          const next = { typeId, typeName, status };
          if (!current || getStatusPriority(next.status) >= getStatusPriority(current.status)) {
            dayTypes.get(id)[d] = next;
          }
        }
      }
    }
    const list = Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return { employeesList: list, dayTypesByEmployee: dayTypes };
  }, [rows, year, monthNum, lastDay]);

  const weekdayCountByEmployee = useMemo(() => {
    const byEmployee = new Map();
    for (const emp of employeesList) {
      const count = {};
      const dayTypes = dayTypesByEmployee.get(emp.id) || {};
      for (let d = 1; d <= lastDay; d++) {
        const dayOfWeek = new Date(year, monthNum - 1, d).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        const dayEntry = dayTypes[d];
        if (!dayEntry) continue;
        const typeKey = normalizeTimeOffType(dayEntry.typeId, dayEntry.typeName) || dayEntry.typeId || 'other';
        const dayIso = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (typeKey === 'vacation') {
          if (!isApprovedTimeOffStatus(dayEntry.status)) continue;
          if (bavariaHolidays.has(dayIso)) continue;
        }
        count[typeKey] = (count[typeKey] || 0) + 1;
      }
      byEmployee.set(emp.id, count);
    }
    return byEmployee;
  }, [employeesList, dayTypesByEmployee, year, monthNum, lastDay, bavariaHolidays]);

  const columns = [
    { key: 'employee_name', labelKey: 'timeOffCalendar.columns.employee' },
    { key: 'time_off_type_name', labelKey: 'timeOffCalendar.columns.type' },
    { key: 'start_date', labelKey: 'timeOffCalendar.columns.startDate' },
    { key: 'end_date', labelKey: 'timeOffCalendar.columns.endDate' },
    { key: 'status', labelKey: 'timeOffCalendar.columns.status' },
  ];

  function getTypeLabel(typeId, typeName = '') {
    const key = normalizeTimeOffType(typeId, typeName);
    return key ? t(`timeOffCalendar.types.${key}`) : (typeName || typeId || '-');
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
            {syncing ? 'Refreshing...' : 'Refresh from Kenjo'}
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, marginRight: '0.5rem', fontFamily: 'inherit', fontSize: '0.9rem' }}>{t('timeOffCalendar.legend')}</span>
        {TIME_OFF_TYPE_KEYS.map((key) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: getTypeColor(key),
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
                  const holiday = isHoliday(d);
                  return (
                    <th
                      key={d}
                      className={`time-off-calendar-day-header ${isWeekend ? 'time-off-calendar-day-header--weekend' : ''}`}
                      title={WEEKDAY_LETTERS[dayOfWeek]}
                      style={
                        holiday
                          ? {
                              background: 'rgba(239, 68, 68, 0.18)',
                              color: '#b91c1c',
                              borderBottomColor: 'rgba(239, 68, 68, 0.45)',
                            }
                          : undefined
                      }
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
                  const summaryParts = TIME_OFF_TYPE_KEYS
                    .map((key) => {
                      const n = empCounts[key] || 0;
                      return n > 0 ? `${t(`timeOffCalendar.types.${key}`)}: ${n}` : null;
                    })
                    .filter(Boolean);
                  return (
                    <tr key={emp.id}>
                      <td className="time-off-calendar-sticky-name">
                        {emp.name}
                      </td>
                      {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => {
                        const dayEntry = dayTypesByEmployee.get(emp.id)?.[d];
                        const typeKey = dayEntry ? normalizeTimeOffType(dayEntry.typeId, dayEntry.typeName) : null;
                        const dayOfWeek = new Date(year, monthNum - 1, d).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const holiday = isHoliday(d);
                        const color = typeKey ? getTypeColor(typeKey) : null;
                        return (
                          <td
                            key={d}
                            className={`time-off-calendar-day-cell ${isWeekend ? 'time-off-calendar-day-cell--weekend' : ''}`}
                            style={
                              holiday
                                ? {
                                    background: 'rgba(239, 68, 68, 0.09)',
                                    boxShadow: 'inset 0 0 0 1px rgba(239, 68, 68, 0.28)',
                                  }
                                : undefined
                            }
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
                                title={getTypeLabel(dayEntry?.typeId, dayEntry?.typeName)}
                              />
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="time-off-calendar-total-col">
                        {summaryParts.length > 0 ? summaryParts.join(', ') : '-'}
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
                        <td>{row.employee_name ?? '-'}</td>
                        <td>
                          {getTypeLabel(row.time_off_type, row.time_off_type_name)}
                        </td>
                        <td>{formatDate(row.start_date)}</td>
                        <td>{formatDate(row.end_date)}</td>
                        <td>{row.status ?? '-'}</td>
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
