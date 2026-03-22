import { useState, useCallback, useEffect } from 'react';
import {
  compareCortexWithKenjo,
  ignoreConflict,
  fixConflictInKenjo,
  createAttendanceInKenjo,
  getKenjoUsers,
} from '../services/kenjoApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { translations } from '../translations';

function toKey(d) {
  if (!d) return '';
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Difference text with colors: Kenjo start earlier = red, start later = green; Kenjo end earlier = green, end later = red. */
function DifferenceCell({ conflict: c, t }) {
  const ds = Number(c.diffStartMin ?? 0);
  const de = Number(c.diffEndMin ?? 0);
  const parts = [];
  if (ds !== 0) {
    const key = ds > 0 ? 'syncWithKenjo.diffStartEarlier' : 'syncWithKenjo.diffStartLater';
    const text = t(key).replace('{n}', String(Math.abs(ds)));
    const color = ds > 0 ? '#b91c1c' : '#15803d';
    parts.push(<span key="start" style={{ color }}>{text}</span>);
  }
  if (de !== 0) {
    const key = de > 0 ? 'syncWithKenjo.diffEndEarlier' : 'syncWithKenjo.diffEndLater';
    const text = t(key).replace('{n}', String(Math.abs(de)));
    const color = de > 0 ? '#15803d' : '#b91c1c';
    parts.push(<span key="end" style={{ color }}>{text}</span>);
  }
  if (parts.length === 0) return '—';
  return <>{parts[0]}{parts.length > 1 && <><br />{parts[1]}</>}</>;
}

/** Normalize time string to HH:MM for input[type=time]. */
function toTimeInputValue(val) {
  if (val == null || val === '' || String(val).trim() === '—') return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;
  return '';
}

/** Format Kenjo ISO time as HH:MM without timezone shift (Kenjo stores local time). */
function formatKenjoTime(iso) {
  if (!iso) return '—';
  const s = String(iso).trim();
  const match = s.match(/T(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '—';
  }
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function SyncWithKenjoPage() {
  const { t, language } = useAppSettings();
  const monthNames = (translations[language]?.timeOffCalendar?.months || translations.en?.timeOffCalendar?.months || EN_MONTHS).slice(0, 12);
  const today = toKey(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [actioning, setActioning] = useState(null);
  const [minDiffMinutes, setMinDiffMinutes] = useState(10);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [sendToKenjoRow, setSendToKenjoRow] = useState(null);
  const [sendToKenjoStart, setSendToKenjoStart] = useState('');
  const [sendToKenjoEnd, setSendToKenjoEnd] = useState('');
  const [sendingToKenjo, setSendingToKenjo] = useState(false);
  const [addAttendanceOpen, setAddAttendanceOpen] = useState(false);
  const [kenjoEmployees, setKenjoEmployees] = useState([]);
  const [addAttendanceEmployeesLoading, setAddAttendanceEmployeesLoading] = useState(false);
  const [addAttendanceForm, setAddAttendanceForm] = useState({
    userId: '',
    employeeName: '',
    date: toKey(new Date()),
    start: '',
    end: '',
    breaks: [],
  });
  const [addAttendanceStaged, setAddAttendanceStaged] = useState(null);
  const [addAttendanceSaving, setAddAttendanceSaving] = useState(false);
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    if (!addAttendanceOpen) return;
    setAddAttendanceEmployeesLoading(true);
    getKenjoUsers()
      .then((list) => setKenjoEmployees(Array.isArray(list) ? list : []))
      .catch(() => setKenjoEmployees([]))
      .finally(() => setAddAttendanceEmployeesLoading(false));
  }, [addAttendanceOpen]);

  const addBreakToForm = () => {
    setAddAttendanceForm((f) => ({
      ...f,
      breaks: [...(f.breaks || []), { start: '', end: '' }],
    }));
  };

  const updateBreak = (index, field, value) => {
    setAddAttendanceForm((f) => {
      const next = [...(f.breaks || [])];
      next[index] = { ...(next[index] || {}), [field]: value };
      return { ...f, breaks: next };
    });
  };

  const saveAddAttendanceForm = () => {
    const { userId, employeeName, date, start, end, breaks } = addAttendanceForm;
    if (!userId || !date || !start || !end) return;
    setAddAttendanceStaged({
      userId,
      employeeName: employeeName || (kenjoEmployees.find((u) => u._id === userId)?.displayName ?? ''),
      date,
      start,
      end,
      breaks: breaks || [],
    });
    setAddAttendanceOpen(false);
    setAddAttendanceForm({
      userId: '',
      employeeName: '',
      date: toKey(new Date()),
      start: '',
      end: '',
      breaks: [],
    });
  };

  const handleCalendarDayClick = (dayKey) => {
    if (!dayKey) return;
    if (fromDate && toDate) {
      setFromDate(dayKey);
      setToDate('');
      return;
    }
    if (!fromDate) {
      setFromDate(dayKey);
      setToDate('');
      return;
    }
    const from = fromDate;
    const to = dayKey;
    if (to < from) {
      setFromDate(to);
      setToDate(from);
    } else {
      setToDate(to);
    }
  };

  const sendStagedAttendanceToKenjo = async () => {
    if (!addAttendanceStaged) return;
    setAddAttendanceSaving(true);
    try {
      const startVal = addAttendanceStaged.start.length === 5 ? `${addAttendanceStaged.start}:00` : addAttendanceStaged.start;
      const endVal = addAttendanceStaged.end.length === 5 ? `${addAttendanceStaged.end}:00` : addAttendanceStaged.end;
      await createAttendanceInKenjo(
        addAttendanceStaged.userId,
        addAttendanceStaged.date,
        startVal,
        endVal
      );
      setStatus((s) => t('syncWithKenjo.attendanceCreated') + (s || ''));
      setAddAttendanceStaged(null);
    } catch (err) {
      setStatus(t('syncWithKenjo.failedCreateAttendance') + (err?.message || ''));
    } finally {
      setAddAttendanceSaving(false);
    }
  };

  const runCompare = useCallback(async () => {
    const from = toKey(fromDate);
    const to = toKey(toDate || fromDate);
    if (!from || !to) {
      setStatus(t('syncWithKenjo.selectStartDate'));
      return;
    }
    if (from > to) {
      setStatus(t('syncWithKenjo.fromBeforeTo'));
      return;
    }
    setLoading(true);
    setProgress(0);
    setStatus(t('syncWithKenjo.loadingStatus'));
    const progressInterval = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + 5));
    }, 200);
    try {
      const data = await compareCortexWithKenjo(from, to, minDiffMinutes);
      setResult(data);
      const s = data?.stats || {};
      setStatus(
        `${t('syncWithKenjo.done')} ${t('syncWithKenjo.cortex')}: ${s.totalExcelRows ?? 0} | ${t('syncWithKenjo.kenjo')}: ${s.totalKenjoRows ?? 0} | ` +
          `${t('syncWithKenjo.matched')}: ${s.totalMatched ?? 0} | ${t('syncWithKenjo.conflicts')}: ${(data?.conflicts ?? []).length} | ` +
          `${t('syncWithKenjo.cortexNoMatch')}: ${s.unmatchedExcel ?? 0} | ${t('syncWithKenjo.kenjoNoMatch')}: ${s.unmatchedKenjo ?? 0}`
      );
    } catch (err) {
      setStatus(t('syncWithKenjo.errorPrefix') + (err?.message || String(err)));
      setResult(null);
    } finally {
      clearInterval(progressInterval);
      setProgress(100);
      setLoading(false);
    }
  }, [fromDate, toDate, minDiffMinutes, t]);

  const handleIgnore = async (conflictKey) => {
    setActioning(conflictKey);
    try {
      await ignoreConflict(conflictKey);
      setResult((prev) => ({
        ...prev,
        conflicts: (prev?.conflicts ?? []).filter((c) => c.conflictKey !== conflictKey),
      }));
      setStatus((s) => t('syncWithKenjo.ignored') + (s || ''));
    } catch (err) {
      setStatus(t('syncWithKenjo.ignoreFailed') + (err?.message || ''));
    } finally {
      setActioning(null);
    }
  };

  const handleFix = async (c) => {
    const key = c.conflictKey;
    setActioning(key);
    try {
      await fixConflictInKenjo(c.kenjoAttendanceId, c.cortexStartIso, c.cortexEndIso);
      setResult((prev) => ({
        ...prev,
        conflicts: (prev?.conflicts ?? []).filter((x) => x.conflictKey !== key),
      }));
      setStatus((s) => t('syncWithKenjo.updatedKenjo') + (s || ''));
    } catch (err) {
      setStatus(t('syncWithKenjo.fixFailed') + (err?.message || ''));
    } finally {
      setActioning(null);
    }
  };

  const openSendToKenjo = (r) => {
    setSendToKenjoRow(r);
    setSendToKenjoStart(toTimeInputValue(r.app_login));
    setSendToKenjoEnd(toTimeInputValue(r.app_logout));
  };

  const handleCreateInKenjo = async () => {
    if (!sendToKenjoRow || !sendToKenjoStart || !sendToKenjoEnd) return;
    setSendingToKenjo(true);
    try {
      await createAttendanceInKenjo(
        sendToKenjoRow.userId,
        sendToKenjoRow.date,
        sendToKenjoStart,
        sendToKenjoEnd
      );
      const row = sendToKenjoRow;
      setResult((prev) => ({
        ...prev,
        kenjoNoMatch: (prev?.kenjoNoMatch ?? []).filter(
          (x) => x.userId !== row.userId || x.date !== row.date
        ),
      }));
      setStatus((s) => t('syncWithKenjo.attendanceCreated') + (s || ''));
      setSendToKenjoRow(null);
    } catch (err) {
      setStatus(t('syncWithKenjo.createFailed') + (err?.message || ''));
    } finally {
      setSendingToKenjo(false);
    }
  };

  const hideKenjoNoMatchRow = (r) => {
    setResult((prev) => ({
      ...prev,
      kenjoNoMatch: (prev?.kenjoNoMatch ?? []).filter(
        (x) => x.userId !== r.userId || x.date !== r.date
      ),
    }));
  };

  const conflicts = result?.conflicts ?? [];
  const unmatchedCortex = result?.unmatchedCortex ?? [];
  const kenjoNoMatch = result?.kenjoNoMatch ?? [];
  const hasUnmatched = unmatchedCortex.length > 0;

  return (
    <section className="card sync-kenjo-page">
      <h2>{t('syncWithKenjo.title')}</h2>
      <p className="muted">
        {t('syncWithKenjo.instructions')}
      </p>

      <div className="sync-period-row">
        <div className="sync-range-calendar-wrap">
          <div className="sync-range-calendar">
            <div className="sync-range-calendar-header">
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <span>{t('syncWithKenjo.month')}</span>
                <select
                  value={`${calendarYear}-${String(calendarMonth).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [yStr, mStr] = e.target.value.split('-');
                    const y = Number(yStr);
                    const m = Number(mStr);
                    setCalendarYear(y);
                    setCalendarMonth(m);
                    const first = `${y}-${String(m).padStart(2, '0')}-01`;
                    const lastDate = new Date(y, m, 0).getDate();
                    const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
                    setFromDate(first);
                    setToDate(last);
                  }}
                  disabled={loading}
                >
                  {(() => {
                    const opts = [];
                    const baseYear = new Date().getFullYear();
                    for (let year = baseYear - 1; year <= baseYear + 1; year++) {
                      for (let m = 1; m <= 12; m++) {
                        const value = `${year}-${String(m).padStart(2, '0')}`;
                        const label = `${monthNames[m - 1]} ${year}`;
                        opts.push(
                          <option key={value} value={value}>
                            {label}
                          </option>
                        );
                      }
                    }
                    return opts;
                  })()}
                </select>
              </label>
            </div>
          </div>
          <div className="sync-period-buttons">
            <button
              type="button"
              onClick={runCompare}
              disabled={loading}
              className="btn-primary"
            >
              {t('syncWithKenjo.compareWithCortex')}
            </button>
            <button
              type="button"
              onClick={() => setAddAttendanceOpen(true)}
              disabled={loading}
              className="btn-secondary"
            >
              {t('syncWithKenjo.addAttendance')}
            </button>
          </div>
        </div>
        <label className="sync-min-diff">
          {t('syncWithKenjo.minDifference')}
          <select
            value={minDiffMinutes}
            onChange={(e) => setMinDiffMinutes(Number(e.target.value))}
            disabled={loading}
            title={t('syncWithKenjo.minDiffTitle')}
          >
            <option value={5}>{t('syncWithKenjo.minOption').replace('{n}', '5')}</option>
            <option value={10}>{t('syncWithKenjo.minOption').replace('{n}', '10')}</option>
            <option value={20}>{t('syncWithKenjo.minOption').replace('{n}', '20')}</option>
          </select>
        </label>
      </div>

      {addAttendanceOpen && (
        <div className="sync-modal-overlay" onClick={() => setAddAttendanceOpen(false)}>
          <div className="sync-modal sync-modal-add-attendance" onClick={(e) => e.stopPropagation()}>
            <h3>{t('syncWithKenjo.addAttendance')}</h3>
            <div className="sync-modal-fields">
              <label>
                {t('syncWithKenjo.employee')}
                <select
                  value={addAttendanceForm.userId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = kenjoEmployees.find((u) => u._id === id)?.displayName ?? '';
                    setAddAttendanceForm((f) => ({ ...f, userId: id, employeeName: name }));
                  }}
                  disabled={addAttendanceEmployeesLoading}
                >
                  <option value="">{t('syncWithKenjo.selectEmployee')}</option>
                  {kenjoEmployees.map((emp) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.displayName || emp.firstName + ' ' + (emp.lastName || '') || emp._id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('syncWithKenjo.date')}
                <input
                  type="date"
                  value={addAttendanceForm.date}
                  onChange={(e) => setAddAttendanceForm((f) => ({ ...f, date: e.target.value }))}
                />
              </label>
              <label>
                {t('syncWithKenjo.startTime')}
                <input
                  type="time"
                  value={addAttendanceForm.start}
                  onChange={(e) => setAddAttendanceForm((f) => ({ ...f, start: e.target.value }))}
                />
              </label>
              <label>
                {t('syncWithKenjo.endTime')}
                <input
                  type="time"
                  value={addAttendanceForm.end}
                  onChange={(e) => setAddAttendanceForm((f) => ({ ...f, end: e.target.value }))}
                />
              </label>
            </div>
            <div className="sync-modal-breaks">
              <button type="button" className="btn-secondary btn-small" onClick={addBreakToForm}>
                {t('syncWithKenjo.addBreak')}
              </button>
              {(addAttendanceForm.breaks || []).map((br, idx) => (
                <div key={idx} className="sync-break-row">
                  <span className="sync-break-label">{t('syncWithKenjo.breakLabel').replace('{n}', String(idx + 1))}</span>
                  <label>
                    {t('syncWithKenjo.startBreak')}
                    <input
                      type="time"
                      value={br.start || ''}
                      onChange={(e) => updateBreak(idx, 'start', e.target.value)}
                    />
                  </label>
                  <label>
                    {t('syncWithKenjo.endBreak')}
                    <input
                      type="time"
                      value={br.end || ''}
                      onChange={(e) => updateBreak(idx, 'end', e.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="sync-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setAddAttendanceOpen(false)}>
                {t('syncWithKenjo.cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={saveAddAttendanceForm}
                disabled={
                  !addAttendanceForm.userId ||
                  !addAttendanceForm.date ||
                  !addAttendanceForm.start ||
                  !addAttendanceForm.end
                }
              >
                {t('syncWithKenjo.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="sync-progress-wrap">
          <div className="sync-progress-bar">
            <div className="sync-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {status && <p className="sync-status">{status}</p>}

      {result != null && (
        <div className="sync-unmatched-toggle">
          <button
            type="button"
            className={showUnmatched ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setShowUnmatched((v) => !v)}
          >
            {t('syncWithKenjo.kenjoNoMatch')} ({kenjoNoMatch.length})
          </button>
        </div>
      )}

      {showUnmatched && (
        <div className="sync-table-wrap sync-unmatched-table">
          <h3>{t('syncWithKenjo.kenjoNoMatchHeading')}</h3>
          {kenjoNoMatch.length === 0 ? (
            <p className="muted">{t('syncWithKenjo.noRecords')}</p>
          ) : (
          <table className="sync-table">
            <thead>
              <tr>
                <th>{t('syncWithKenjo.date')}</th>
                <th>{t('syncWithKenjo.name')}</th>
                <th>{t('syncWithKenjo.transporterId')}</th>
                <th>{t('syncWithKenjo.cortexStart')}</th>
                <th>{t('syncWithKenjo.cortexEnd')}</th>
                <th>{t('syncWithKenjo.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {kenjoNoMatch.map((r, idx) => (
                <tr key={`${r.date}-${r.name}-${idx}`}>
                  <td>{r.date}</td>
                  <td>{r.name}</td>
                  <td>{r.transporter_id}</td>
                  <td>
                    <button
                      type="button"
                      className="sync-time-link"
                      onClick={() => openSendToKenjo(r)}
                      title={t('syncWithKenjo.clickToCorrectAndSend')}
                    >
                      {r.app_login || '—'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="sync-time-link"
                      onClick={() => openSendToKenjo(r)}
                      title={t('syncWithKenjo.clickToCorrectAndSend')}
                    >
                      {r.app_logout || '—'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={() => openSendToKenjo(r)}
                    >
                      {t('syncWithKenjo.sendToKenjo')}
                    </button>
                    <button
                      type="button"
                      className="btn-ignore btn-small"
                      onClick={() => hideKenjoNoMatchRow(r)}
                      title={t('syncWithKenjo.hideFromList')}
                    >
                      {t('syncWithKenjo.ignore')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      )}

      {sendToKenjoRow && (
        <div className="sync-modal-overlay" onClick={() => !sendingToKenjo && setSendToKenjoRow(null)}>
          <div className="sync-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('syncWithKenjo.createAttendanceInKenjo')}</h3>
            <p className="sync-modal-meta">{sendToKenjoRow.date} — {sendToKenjoRow.name}</p>
            <div className="sync-modal-fields">
              <label>
                {t('syncWithKenjo.startTime')}
                <input
                  type="time"
                  value={sendToKenjoStart}
                  onChange={(e) => setSendToKenjoStart(e.target.value)}
                  disabled={sendingToKenjo}
                />
              </label>
              <label>
                {t('syncWithKenjo.endTime')}
                <input
                  type="time"
                  value={sendToKenjoEnd}
                  onChange={(e) => setSendToKenjoEnd(e.target.value)}
                  disabled={sendingToKenjo}
                />
              </label>
            </div>
            <div className="sync-modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSendToKenjoRow(null)}
                disabled={sendingToKenjo}
              >
                {t('syncWithKenjo.cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateInKenjo}
                disabled={sendingToKenjo || !sendToKenjoStart || !sendToKenjoEnd}
              >
                {sendingToKenjo ? '…' : t('syncWithKenjo.createInKenjo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="sync-table-wrap">
          <table className="sync-table">
            <thead>
              <tr>
                <th>{t('syncWithKenjo.date')}</th>
                <th>{t('syncWithKenjo.name')}</th>
                <th>{t('syncWithKenjo.cortexStart')}</th>
                <th>{t('syncWithKenjo.cortexEnd')}</th>
                <th>{t('syncWithKenjo.kenjoStart')}</th>
                <th>{t('syncWithKenjo.kenjoEnd')}</th>
                <th>{t('syncWithKenjo.difference')}</th>
                <th>{t('syncWithKenjo.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => (
                <tr key={c.conflictKey}>
                  <td>{c.date}</td>
                  <td>{c.name}</td>
                  <td>{c.excelStart}</td>
                  <td>{c.excelEnd}</td>
                  <td>{formatKenjoTime(c.kenjoStartIso) || c.kenjoStart}</td>
                  <td>{formatKenjoTime(c.kenjoEndIso) || c.kenjoEnd}</td>
                  <td className="sync-reason"><DifferenceCell conflict={c} t={t} /></td>
                  <td>
                    <button
                      type="button"
                      className="btn-ignore"
                      onClick={() => handleIgnore(c.conflictKey)}
                      disabled={actioning === c.conflictKey}
                      title={t('syncWithKenjo.confirmTimeHide')}
                    >
                      {t('syncWithKenjo.ignore')}
                    </button>
                    <button
                      type="button"
                      className="btn-fix"
                      onClick={() => handleFix(c)}
                      disabled={actioning === c.conflictKey}
                      title={t('syncWithKenjo.sendCortexToKenjo')}
                    >
                      {t('syncWithKenjo.fix')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && conflicts.length === 0 && !loading && (
        <p className="muted">{t('syncWithKenjo.noConflictsInPeriod')}</p>
      )}

      {addAttendanceStaged && (
        <div className="sync-staged-attendance">
          <h3>{t('syncWithKenjo.attendanceToSend')}</h3>
          <p className="sync-staged-meta">
            {addAttendanceStaged.employeeName} — {addAttendanceStaged.date} — {addAttendanceStaged.start} – {addAttendanceStaged.end}
            {addAttendanceStaged.breaks?.length > 0 && (
              <span> — {addAttendanceStaged.breaks.length} break(s)</span>
            )}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={sendStagedAttendanceToKenjo}
            disabled={addAttendanceSaving}
          >
            {addAttendanceSaving ? '…' : t('syncWithKenjo.save')}
          </button>
        </div>
      )}

      <style>{`
        .sync-period-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .sync-period {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
        }
        .sync-range-calendar-wrap {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 1rem;
        }
        .sync-range-calendar {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 0.75rem;
          background: #fafafa;
        }
        .sync-range-calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .sync-range-calendar-nav {
          background: none;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          color: #333;
        }
        .sync-range-calendar-nav:hover:not(:disabled) {
          color: #1976d2;
        }
        .sync-range-calendar-nav:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .sync-range-calendar-title {
          font-weight: 600;
          font-size: 0.95rem;
        }
        .sync-range-calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1.75rem);
          gap: 2px;
          margin-bottom: 2px;
          font-size: 0.7rem;
          color: #666;
        }
        .sync-range-calendar-wday {
          text-align: center;
        }
        .sync-range-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1.75rem);
          gap: 2px;
        }
        .sync-range-calendar-day {
          width: 1.75rem;
          height: 1.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          border: none;
          border-radius: 4px;
          background: #fff;
          cursor: pointer;
          color: #333;
        }
        .sync-range-calendar-day:hover:not(:disabled) {
          background: #e3f2fd;
        }
        .sync-range-calendar-day:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .sync-range-calendar-day--empty {
          background: transparent;
          cursor: default;
        }
        .sync-range-calendar-day--range {
          background: #bbdefb;
        }
        .sync-range-calendar-day--start,
        .sync-range-calendar-day--end {
          background: #1976d2;
          color: #fff;
        }
        .sync-range-calendar-day--start:hover:not(:disabled),
        .sync-range-calendar-day--end:hover:not(:disabled) {
          background: #1565c0;
        }
        .sync-period-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          justify-content: center;
        }
        .sync-min-diff {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.9rem;
        }
        .sync-min-diff select {
          padding: 0.4rem 0.6rem;
          min-width: 6rem;
        }
        .sync-period label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .sync-period input[type="date"] {
          padding: 0.4rem 0.6rem;
        }
        .btn-primary {
          padding: 0.5rem 1rem;
          background: #1976d2;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-secondary {
          padding: 0.5rem 1rem;
          background: #6b7280;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }
        .sync-unmatched-toggle {
          margin-bottom: 1rem;
        }
        .sync-unmatched-table h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
        }
        .sync-progress-wrap {
          margin-bottom: 1rem;
        }
        .sync-progress-bar {
          height: 8px;
          background: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
        }
        .sync-progress-fill {
          height: 100%;
          background: #1976d2;
          transition: width 0.2s ease;
        }
        .sync-status {
          margin-bottom: 1rem;
          font-size: 0.95rem;
          color: #333;
        }
        .sync-table-wrap {
          overflow-x: auto;
          margin-top: 1rem;
        }
        .sync-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        .sync-table th,
        .sync-table td {
          padding: 0.5rem 0.75rem;
          border: 1px solid #ddd;
          text-align: left;
        }
        .sync-table th {
          background: #f5f5f5;
          font-weight: 600;
        }
        .sync-reason {
          max-width: 220px;
          color: #555;
        }
        .btn-ignore,
        .btn-fix {
          padding: 0.35rem 0.6rem;
          margin-right: 0.35rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .btn-ignore {
          background: #6b7280;
          color: #fff;
        }
        .btn-fix {
          background: #2563eb;
          color: #fff;
        }
        .btn-ignore:disabled,
        .btn-fix:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .sync-time-link {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: #1976d2;
          cursor: pointer;
          text-decoration: underline;
        }
        .sync-time-link:hover {
          color: #0d47a1;
        }
        .btn-small {
          padding: 0.35rem 0.6rem;
          font-size: 0.85rem;
        }
        .sync-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .sync-modal {
          background: #fff;
          padding: 1.5rem;
          border-radius: 8px;
          min-width: 280px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .sync-modal h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
        }
        .sync-modal-meta {
          margin: 0 0 1rem 0;
          color: #666;
          font-size: 0.9rem;
        }
        .sync-modal-fields {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .sync-modal-fields label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.9rem;
        }
        .sync-modal-fields input[type="time"] {
          padding: 0.4rem 0.6rem;
        }
        .sync-modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }
        .sync-modal-add-attendance .sync-modal-fields {
          display: grid;
          gap: 0.75rem;
        }
        .sync-modal-breaks {
          margin: 1rem 0;
          padding-top: 0.75rem;
          border-top: 1px solid #eee;
        }
        .sync-modal-breaks > button {
          margin-bottom: 0.75rem;
        }
        .sync-break-row {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .sync-break-label {
          font-weight: 600;
          font-size: 0.9rem;
          width: 100%;
        }
        .sync-break-row label {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-size: 0.85rem;
        }
        .sync-staged-attendance {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
        }
        .sync-staged-attendance h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
        }
        .sync-staged-meta {
          margin: 0 0 0.75rem 0;
          color: #333;
          font-size: 0.95rem;
        }
      `}</style>
    </section>
  );
}
