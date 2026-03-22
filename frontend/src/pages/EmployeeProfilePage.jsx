import { useEffect, useState } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { getKenjoEmployeeProfile, updateEmployeeProfileInKenjo, deactivateEmployeeInKenjo } from '../services/kenjoApi';
import { getEmployee } from '../services/employeesApi';
import { saveAdvances } from '../services/advancesApi';
import { getEmployeeKpi, saveEmployeeKpiComment } from '../services/payrollApi';
import { getPaveSessions } from '../services/paveApi';

/** KPI rating: <50 POOR, <70 FAIR, <85 GREAT, <93 FANTASTIC, >=93 FANTASTIC PLUS */
function getKpiRatingLabel(kpi) {
  const n = Number(kpi);
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  if (n < 50) return 'POOR';
  if (n < 70) return 'FAIR';
  if (n < 84.99) return 'GREAT';
  if (n < 92.99) return 'FANTASTIC';
  return 'FANTASTIC PLUS';
}

const TERMINATION_REASONS = [
  { group: '1. Safety Violations', options: ['Reckless or unsafe driving', 'Speeding or ignoring traffic laws', 'Using a mobile phone while driving', 'Failure to follow safety procedures', 'Creating dangerous situations during deliveries'] },
  { group: '2. Attendance and Punctuality Issues', options: ['No call / no show', 'Repeated lateness', 'Leaving work early without authorization', 'Excessive absences'] },
  { group: '3. Poor Performance', options: ['Failure to complete assigned delivery routes', 'Low delivery completion rate', 'Frequent undelivered or returned packages', 'Failure to meet required performance metrics (KPIs)'] },
  { group: '4. Customer Complaints', options: ['Delivering packages to incorrect addresses', 'Mishandling or damaging packages', 'Unprofessional or inappropriate behavior', 'Repeated customer complaints'] },
  { group: '5. Violation of Company Policies', options: ['Smoking in company vehicles', 'Transporting unauthorized passengers', 'Personal use of company vehicles', 'Failure to follow delivery procedures'] },
  { group: '6. Theft or Fraud', options: ['Theft of packages or company property', 'Falsifying work or delivery data', 'Time theft or misuse of work hours'] },
  { group: '7. Workplace Misconduct', options: ['Fighting or aggressive behavior', 'Harassment or discrimination', 'Threatening coworkers or customers', 'Alcohol or drug use while on duty'] },
  { group: '8. Failure to Meet Job Requirements', options: ['Invalid or suspended driver\'s license', 'Failure to complete required training', 'Failure to comply with Amazon DSP or Amazon Logistics requirements'] },
];

export default function EmployeeProfilePage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const kenjoEmployeeId = location.state?.kenjoEmployeeId ?? searchParams.get('kenjo_employee_id');
  const localEmployeeId = location.state?.employeeId;
  const [employee, setEmployee] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localEmployee, setLocalEmployee] = useState(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeactivateForm, setShowDeactivateForm] = useState(false);
  const [deactivateDate, setDeactivateDate] = useState('');
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [advanceMonth, setAdvanceMonth] = useState('');
  const [advanceLines, setAdvanceLines] = useState([{ amount: '', code_comment: '' }, { amount: '', code_comment: '' }, { amount: '', code_comment: '' }]);
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceError, setAdvanceError] = useState('');
  const [showDaPerformance, setShowDaPerformance] = useState(false);
  const [showDaPerformanceGraph, setShowDaPerformanceGraph] = useState(false);
  const [kpiRows, setKpiRows] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiError, setKpiError] = useState('');
  const [showKpiCommentDialog, setShowKpiCommentDialog] = useState(false);
  const [kpiCommentWeekKey, setKpiCommentWeekKey] = useState('');
  const [kpiCommentText, setKpiCommentText] = useState('');
  const [kpiCommentSaving, setKpiCommentSaving] = useState(false);
  const [paveSessions, setPaveSessions] = useState([]);

  useEffect(() => {
    if (!kenjoEmployeeId && !localEmployeeId) return;
    setLoading(true);
    setError('');
    (async () => {
      try {
        if (kenjoEmployeeId) {
          const data = await getKenjoEmployeeProfile(kenjoEmployeeId);
          setEmployee(data);
        }
        if (localEmployeeId) {
          const loc = await getEmployee(localEmployeeId);
          setLocalEmployee(loc);
        }
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [kenjoEmployeeId, localEmployeeId]);

  useEffect(() => {
    if (employee) {
      setDraft({
        ...employee,
        dspLocal: employee.dspLocal ?? {
          fuehrerschein_aufstellungsdatum: '',
          fuehrerschein_aufstellungsbehoerde: '',
        },
      });
      setIsEditing(false);
    }
  }, [employee]);

  useEffect(() => {
    if (!showDaPerformance || !kenjoEmployeeId || !employee) return;
    setKpiLoading(true);
    setKpiError('');
    const pn = employee?.work?.employeeNumber ?? employee?.account?.employeeNumber ?? '';
    getEmployeeKpi(kenjoEmployeeId, pn)
      .then((rows) => setKpiRows(Array.isArray(rows) ? rows : []))
      .catch((e) => setKpiError(String(e?.message || e)))
      .finally(() => setKpiLoading(false));
  }, [showDaPerformance, kenjoEmployeeId, employee]);

  const openKpiCommentFromMain = async () => {
    if (!kenjoEmployeeId || !employee) return;
    try {
      let rows = kpiRows;
      if (!rows.length) {
        setKpiLoading(true);
        setKpiError('');
        const pn = employee?.work?.employeeNumber ?? employee?.account?.employeeNumber ?? '';
        const loaded = await getEmployeeKpi(kenjoEmployeeId, pn);
        rows = Array.isArray(loaded) ? loaded : [];
        setKpiRows(rows);
      }
      if (!rows.length) {
        setKpiError('No KPI data found for this employee.');
        return;
      }
      const first = rows[0];
      setKpiCommentWeekKey(`${first.year}-${first.week}`);
      setKpiCommentText(first.comment || '');
      setShowKpiCommentDialog(true);
    } catch (e) {
      setKpiError(String(e?.message || e));
    } finally {
      setKpiLoading(false);
    }
  };

  useEffect(() => {
    if (!kenjoEmployeeId) return;
    getPaveSessions({ driver_id: kenjoEmployeeId }).then(setPaveSessions).catch(() => setPaveSessions([]));
  }, [kenjoEmployeeId]);


  if (!kenjoEmployeeId && !localEmployeeId) {
    return (
      <section className="card">
        <h2>Employee Profile</h2>
        <p>No employee selected. Please open this page from Kenjo Sync or the employees list.</p>
      </section>
    );
  }

  if (loading && !employee) {
    return (
      <section className="card">
        <h2>Employee Profile</h2>
        <p>Loading employee data from Kenjo…</p>
      </section>
    );
  }

  if (error && !employee) {
    return (
      <section className="card">
        <h2>Employee Profile</h2>
        <p className="error-text">Error loading employee: {error}</p>
      </section>
    );
  }

  if (!employee) {
    return null;
  }

  const current = isEditing && draft ? draft : employee;

  const {
    firstName,
    lastName,
    displayName,
    email,
    externalId,
    personal,
    account,
    work,
    address,
    home,
    financial,
    createdAt,
    updatedAt,
  } = current;

  const fullName =
    displayName || personal?.displayName || [firstName, lastName].filter(Boolean).join(' ');
  const isActive = account?.isActive ?? false;
  const jobTitle = work?.jobTitle;
  const transportationId = work?.transportationId;

  const formatDate = (value) => {
    if (!value) return '—';
    const s = String(value);
    const iso = s.includes('T') ? s.split('T')[0] : s;
    if (!iso) return '—';
    return iso;
  };

  const onFieldChange = (field, value) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const onNestedChange = (section, field, value) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            [section]: {
              ...(prev[section] || {}),
              [field]: value,
            },
          }
        : prev,
    );
  };

  const renderText = (label, value, onChange) => (
    <p>
      <strong>{label}</strong>{' '}
      {isEditing && onChange ? (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '60%' }}
        />
      ) : (
        value || '—'
      )}
    </p>
  );

  const renderLocalDate = (label, value, onChange) => (
    <p>
      <strong>{label}</strong>{' '}
      {isEditing && onChange ? (
        <input
          type="date"
          value={value ? String(value).slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '60%' }}
        />
      ) : (
        formatDate(value) || '—'
      )}
    </p>
  );

  const handleStartEditing = () => {
    setError('');
    setDraft({
      ...employee,
      dspLocal: employee.dspLocal ?? {
        fuehrerschein_aufstellungsdatum: '',
        fuehrerschein_aufstellungsbehoerde: '',
      },
    });
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setDraft(employee);
    setIsEditing(false);
  };

  const handleSaveEditing = async () => {
    if (!draft) {
      setIsEditing(false);
      return;
    }
    if (kenjoEmployeeId) {
      setSaving(true);
      setError('');
      try {
        const personal = draft.personal ? { ...draft.personal, lastName: draft.lastName ?? draft.personal.lastName } : undefined;
        const work = draft.work ? { ...draft.work } : undefined;
        const address = draft.address ? { ...draft.address } : undefined;
        const home = draft.home ? { ...draft.home } : undefined;
        const financial = draft.financial ? { ...draft.financial } : undefined;
        await updateEmployeeProfileInKenjo(kenjoEmployeeId, {
          personal: personal && Object.keys(personal).length ? personal : undefined,
          work: work && Object.keys(work).length ? work : undefined,
          address: address && Object.keys(address).length ? address : undefined,
          home: home && Object.keys(home).length ? home : undefined,
          financial: financial && Object.keys(financial).length ? financial : undefined,
          dspLocal: draft.dspLocal || undefined,
        });
        setEmployee(draft);
        setError('');
        setIsEditing(false);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setSaving(false);
      }
    } else {
      setEmployee(draft);
      setIsEditing(false);
    }
  };

  const openDeactivateConfirm = () => {
    setDeactivateError('');
    setShowDeactivateConfirm(true);
  };

  const closeDeactivateConfirm = () => {
    setShowDeactivateConfirm(false);
  };

  const onDeactivateConfirmYes = () => {
    setShowDeactivateConfirm(false);
    setDeactivateDate('');
    setDeactivateReason('');
    setDeactivateError('');
    setShowDeactivateForm(true);
  };

  const closeDeactivateForm = () => {
    setShowDeactivateForm(false);
    setDeactivateDate('');
    setDeactivateReason('');
    setDeactivateError('');
  };

  const submitDeactivate = async () => {
    if (!kenjoEmployeeId) return;
    const termDate = deactivateDate.trim() ? deactivateDate.trim().slice(0, 10) : null;
    if (!termDate) {
      setDeactivateError('Please select a termination date.');
      return;
    }
    setDeactivating(true);
    setDeactivateError('');
    try {
      await deactivateEmployeeInKenjo(kenjoEmployeeId, {
        terminationDate: termDate,
        reason: deactivateReason.trim() || null,
      });
      const updated = await getKenjoEmployeeProfile(kenjoEmployeeId);
      setEmployee(updated);
      closeDeactivateForm();
    } catch (e) {
      setDeactivateError(String(e?.message || e));
    } finally {
      setDeactivating(false);
    }
  };

  const monthOptions = (() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      list.push({ value: key, label: `${monthNames[d.getMonth()]} ${y}` });
    }
    return list;
  })();

  const openAdvanceDialog = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setAdvanceMonth(`${y}-${m}`);
    setAdvanceLines([{ amount: '', code_comment: '' }, { amount: '', code_comment: '' }, { amount: '', code_comment: '' }]);
    setAdvanceError('');
    setShowAdvanceDialog(true);
  };

  const closeAdvanceDialog = () => {
    setShowAdvanceDialog(false);
    setAdvanceError('');
  };

  const openDaPerformance = () => {
    setShowDaPerformance(true);
    setShowDaPerformanceGraph(false);
    setKpiError('');
    setKpiRows([]);
  };

  const setAdvanceLine = (index, field, value) => {
    setAdvanceLines((prev) => {
      const next = prev.slice();
      next[index] = { ...(next[index] || {}), [field]: value };
      return next;
    });
  };

  const submitAdvance = async () => {
    if (!kenjoEmployeeId || !advanceMonth) return;
    setAdvanceSaving(true);
    setAdvanceError('');
    try {
      await saveAdvances(kenjoEmployeeId, advanceMonth, advanceLines);
      closeAdvanceDialog();
    } catch (e) {
      setAdvanceError(String(e?.message || e));
    } finally {
      setAdvanceSaving(false);
    }
  };

  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>{fullName}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isEditing ? (
            <>
              <button type="button" className="btn-secondary" onClick={handleCancelEditing} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveEditing} disabled={saving}>
                {saving ? 'Saving…' : 'Save and send to Kenjo'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary" onClick={handleStartEditing}>
                Edit
              </button>
              {kenjoEmployeeId && (
                <button type="button" className="btn-secondary" onClick={openAdvanceDialog}>
                  Add Advance
                </button>
              )}
              {kenjoEmployeeId && (
                <button type="button" className="btn-secondary" onClick={openDaPerformance}>
                  DA Performance
                </button>
              )}
              {kenjoEmployeeId && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={openKpiCommentFromMain}
                  disabled={kpiLoading}
                >
                  Add comment
                </button>
              )}
              {kenjoEmployeeId && (
                <>
                  <Link to={`/pave/new?driver_id=${encodeURIComponent(kenjoEmployeeId)}`} className="btn-secondary">Create PAVE Session</Link>
                  <Link to={`/pave?driver_id=${encodeURIComponent(kenjoEmployeeId)}`} className="btn-secondary">View PAVE History</Link>
                </>
              )}
              {kenjoEmployeeId && isActive && (
                <button type="button" className="btn-secondary" onClick={openDeactivateConfirm} style={{ color: '#b91c1c' }}>
                  Deactivate employee
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showDeactivateConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <p style={{ margin: '0 0 1rem' }}>Are you sure you want to deactivate the employee?</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={closeDeactivateConfirm}>No</button>
              <button type="button" className="btn-primary" onClick={onDeactivateConfirmYes}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {showAdvanceDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 520, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Add Advance</h3>
            {advanceError && <p className="error-text" style={{ margin: '0 0 0.5rem' }}>{advanceError}</p>}
            <p style={{ marginBottom: '0.25rem' }}><strong>Month</strong></p>
            <select
              value={advanceMonth}
              onChange={(e) => setAdvanceMonth(e.target.value)}
              style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p style={{ marginBottom: '0.5rem' }}><strong>Advances for this month</strong></p>
            <div style={{ marginBottom: '0.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.75rem' }}>
              <span style={{ fontWeight: 600 }}>Amount</span>
              <span style={{ fontWeight: 600 }}>Comment</span>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={advanceLines[i]?.amount ?? ''}
                  onChange={(e) => setAdvanceLine(i, 'amount', e.target.value)}
                  style={{ padding: '0.5rem' }}
                />
                <input
                  type="text"
                  placeholder="Comment"
                  value={advanceLines[i]?.code_comment ?? ''}
                  onChange={(e) => setAdvanceLine(i, 'code_comment', e.target.value)}
                  style={{ padding: '0.5rem' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={closeAdvanceDialog} disabled={advanceSaving}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitAdvance} disabled={advanceSaving}>
                {advanceSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDaPerformance && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 560, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>DA Performance — KPI by week</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!kpiLoading && kpiRows.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowDaPerformanceGraph(true)}
                  >
                    Show graph
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowDaPerformance(false)}
                >
                  Close
                </button>
              </div>
            </div>
            {kpiError && <p className="error-text" style={{ margin: '0 0 0.5rem' }}>{kpiError}</p>}
            {kpiLoading ? (
              <p style={{ margin: 0, color: '#666' }}>Loading KPI data…</p>
            ) : (
              <>
                {kpiRows.length > 0 && (() => {
                  const nums = kpiRows
                    .map((r) => Number(r.kpi))
                    .filter((v) => Number.isFinite(v) && v !== 0);
                  if (!nums.length) return null;
                  const avg = nums.reduce((sum, v) => sum + v, 0) / nums.length;
                  return (
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#111827' }}>
                      <strong>Average KPI:</strong> {avg.toFixed(2)} ({getKpiRatingLabel(avg)})
                    </p>
                  );
                })()}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Year</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Week</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem' }}>KPI</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Rating</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '1rem', color: '#666', textAlign: 'center' }}>
                          No KPI data found for this employee.
                        </td>
                      </tr>
                    ) : (
                      kpiRows.map((row, idx) => (
                        <tr key={`${row.year}-${row.week}-${idx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{row.year}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{row.week}</td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{row.kpi != null ? Number(row.kpi) : '—'}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{getKpiRatingLabel(row.kpi)}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{row.comment ?? ''}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-primary" onClick={() => setShowDaPerformance(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {showKpiCommentDialog && kpiRows.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }} onClick={() => !kpiCommentSaving && setShowKpiCommentDialog(false)}>
          <div style={{ background: 'white', padding: '1.25rem', borderRadius: 12, width: '90%', maxWidth: 480, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Add KPI comment</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <span>Calendar week</span>
                <select
                  value={kpiCommentWeekKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setKpiCommentWeekKey(key);
                    const [yStr, wStr] = key.split('-');
                    const row = kpiRows.find((r) => String(r.year) === yStr && String(r.week) === wStr);
                    setKpiCommentText(row?.comment || '');
                  }}
                >
                  {kpiRows.map((r) => (
                    <option key={`${r.year}-${r.week}`} value={`${r.year}-${r.week}`}>
                      {r.year} – week {r.week}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <span>Comment</span>
                <textarea
                  rows={3}
                  value={kpiCommentText}
                  onChange={(e) => setKpiCommentText(e.target.value)}
                  style={{ resize: 'vertical', padding: '0.5rem' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowKpiCommentDialog(false)}
                disabled={kpiCommentSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={kpiCommentSaving || !kpiCommentWeekKey}
                onClick={async () => {
                  if (!kpiRows.length || !kpiCommentWeekKey) return;
                  const [yStr, wStr] = kpiCommentWeekKey.split('-');
                  const row = kpiRows.find((r) => String(r.year) === yStr && String(r.week) === wStr);
                  if (!row?.employee_id) return;
                  setKpiCommentSaving(true);
                  try {
                    await saveEmployeeKpiComment(row.employee_id, row.year, row.week, kpiCommentText);
                    // обновим локально без повторного запроса
                    setKpiRows((prev) =>
                      prev.map((r) =>
                        r.year === row.year && r.week === row.week ? { ...r, comment: kpiCommentText } : r
                      )
                    );
                    setShowKpiCommentDialog(false);
                  } catch (e) {
                    alert(String(e?.message || e));
                  } finally {
                    setKpiCommentSaving(false);
                  }
                }}
              >
                {kpiCommentSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDaPerformanceGraph && kpiRows.length > 0 && (() => {
        const KPI_THRESHOLDS = [
          { value: 93, label: 'FANTASTIC PLUS', color: '#059669' },
          { value: 92.99, label: 'FANTASTIC', color: '#2563eb' },
          { value: 84.99, label: 'GREAT', color: '#7c3aed' },
          { value: 70, label: 'FAIR', color: '#d97706' },
          { value: 50, label: 'POOR', color: '#dc2626' },
        ];
        const chartW = 900;
        const chartH = 480;
        const pad = { top: 28, right: 28, bottom: 56, left: 52 };
        const plotW = chartW - pad.left - pad.right;
        const plotH = chartH - pad.top - pad.bottom;
        const points = [...kpiRows].reverse().map((r) => ({ ...r, kpiNum: Number(r.kpi) })).filter((p) => Number.isFinite(p.kpiNum) && p.kpiNum !== 0);
        const yMin = 0;
        const yMax = 100;
        const yScale = (v) => pad.top + plotH - (Number(v) - yMin) / (yMax - yMin) * plotH;
        const xScale = (i) => pad.left + (i / Math.max(1, points.length - 1)) * plotW;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, width: '92vw', maxWidth: 960, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: '0 0 1rem' }}>KPI by week — Graph</h3>
              <div style={{ overflowX: 'auto', overflowY: 'auto' }}>
                <svg width={chartW} height={chartH} style={{ display: 'block', minWidth: chartW }} viewBox={`0 0 ${chartW} ${chartH}`}>
                  <line x1={pad.left} y1={pad.top} x2={pad.left} y2={chartH - pad.bottom} stroke="#e5e7eb" strokeWidth="1" />
                  <line x1={pad.left} y1={chartH - pad.bottom} x2={chartW - pad.right} y2={chartH - pad.bottom} stroke="#e5e7eb" strokeWidth="1" />
                  {[0, 25, 50, 75, 100].map((v) => (
                    <g key={v}>
                      <line x1={pad.left} y1={yScale(v)} x2={chartW - pad.right} y2={yScale(v)} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="2,2" />
                      <text x={pad.left - 8} y={yScale(v) + 5} textAnchor="end" fontSize="12" fill="#6b7280">{v}</text>
                    </g>
                  ))}
                  {KPI_THRESHOLDS.map(({ value, label, color }) => (
                    <g key={value}>
                      <line x1={pad.left} y1={yScale(value)} x2={chartW - pad.right} y2={yScale(value)} stroke={color} strokeWidth="1.5" opacity="0.85" />
                      <text x={chartW - pad.right + 6} y={yScale(value) + 4} fontSize="11" fill={color} fontWeight="600">{label}</text>
                    </g>
                  ))}
                  {points.length > 0 && (
                    <g>
                      <polyline
                        fill="none"
                        stroke="#0f172a"
                        strokeWidth="2.5"
                        points={points.map((p, i) => `${xScale(i)},${yScale(p.kpiNum)}`).join(' ')}
                      />
                      {points.map((p, i) => (
                        <circle key={`${p.year}-${p.week}`} cx={xScale(i)} cy={yScale(p.kpiNum)} r="5" fill="#0f172a" />
                      ))}
                    </g>
                  )}
                  {points.length > 0 && points.map((p, i) => {
                    const x = xScale(i);
                    const y = chartH - 22;
                    return (
                      <text key={`x-${i}`} x={x} y={y} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90, ${x}, ${y})`}>
                        {p.year} W{p.week}
                      </text>
                    );
                  })}
                </svg>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn-primary" onClick={() => setShowDaPerformanceGraph(false)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showDeactivateForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 480, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Deactivation of employee</h3>
            {deactivateError && <p className="error-text" style={{ margin: '0 0 0.5rem' }}>{deactivateError}</p>}
            <p style={{ marginBottom: '0.5rem' }}><strong>Termination date</strong></p>
            <input
              type="date"
              value={deactivateDate}
              onChange={(e) => setDeactivateDate(e.target.value)}
              style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
            />
            <p style={{ marginBottom: '0.5rem' }}><strong>Reason for termination</strong></p>
            <select
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
            >
              <option value="">— Select reason —</option>
              {TERMINATION_REASONS.map(({ group, options }) => (
                <optgroup key={group} label={group}>
                  {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={closeDeactivateForm} disabled={deactivating}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitDeactivate} disabled={deactivating}>
                {deactivating ? 'Sending…' : 'Save and send to Kenjo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {kenjoEmployeeId && paveSessions.length >= 0 && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f5f5f5', borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>PAVE Inspections</h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            Last: {paveSessions[0] ? (
              <>Grade <strong>{paveSessions[0].overall_grade ?? '—'}</strong>, {paveSessions[0].inspect_ended_at ? new Date(paveSessions[0].inspect_ended_at).toLocaleDateString() : '—'}</>
            ) : '—'}
            {' · '}Total completed: <strong>{paveSessions.filter((s) => s.status === 'COMPLETE').length}</strong>
            {' · '}Expired: <strong>{paveSessions.filter((s) => s.status === 'EXPIRED').length}</strong>
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Link to={`/pave/new?driver_id=${encodeURIComponent(kenjoEmployeeId)}`} className="btn-secondary">Create PAVE Session</Link>
            <Link to={`/pave?driver_id=${encodeURIComponent(kenjoEmployeeId)}`} className="btn-secondary">View PAVE History</Link>
          </div>
        </div>
      )}

      <div className="grid two-columns">
        <div>
          {renderText('Status', isActive ? 'Active' : 'Inactive')}
          {renderText('Job title', jobTitle)}
          {renderText('First Name', firstName)}
          {renderText('Last Name', lastName, (v) => onFieldChange('lastName', v))}
          {renderText('Email', email || personal?.email || account?.email, (v) => onFieldChange('email', v))}
          {renderText('Start date', formatDate(work?.startDate), (v) => onNestedChange('work', 'startDate', v))}
          {renderText('Birth day', formatDate(personal?.birthdate))}
          {renderText(
            'Address',
            address
              ? [address.streetName, address.houseNumber, address.addressLine1].filter(Boolean).join(' ')
              : '',
            (v) => {
              const parts = String(v || '').split(' ');
              onNestedChange('address', 'streetName', parts[0] || '');
            },
          )}
          {renderText(
            'Postal code',
            address?.postalCode || address?.zip,
            (v) => onNestedChange('address', 'postalCode', v),
          )}
          {renderText('City', address?.city, (v) => onNestedChange('address', 'city', v))}
          {renderText('Country', address?.country, (v) => onNestedChange('address', 'country', v))}
          {renderText('Personal Nr.', work?.employeeNumber || externalId, (v) => onNestedChange('work', 'employeeNumber', v))}
        </div>
        <div>
          {renderText('Marital status', home?.maritalStatus, (v) => onNestedChange('home', 'maritalStatus', v))}
          {renderText(
            'Mobile Phone',
            personal?.mobile || home?.personalMobile,
            (v) => onNestedChange('personal', 'mobile', v),
          )}
          {renderText('Language', account?.language)}
          {renderText('Job Title', jobTitle, (v) => onNestedChange('work', 'jobTitle', v))}
          {renderText('Weekly hours', work?.weeklyHours, (v) => onNestedChange('work', 'weeklyHours', v))}
          {renderText('Probation until', formatDate(work?.probationUntil), (v) =>
            onNestedChange('work', 'probationUntil', v),
          )}
          {renderText('Contract end', formatDate(work?.contractEnd), (v) => onNestedChange('work', 'contractEnd', v))}
          {renderText(
            'Manager',
            work?.managerName || employee?.manager?.displayName,
            (v) => onNestedChange('work', 'managerName', v),
          )}
        </div>
      </div>

      <hr style={{ margin: '1.5rem 0' }} />

      <div className="grid two-columns">
        <div>
          {renderText('Transporter ID', transportationId)}
          {renderText('Gender', personal?.gender, (v) => onNestedChange('personal', 'gender', v))}
          {renderText('Nationality', personal?.nationality)}
          {renderText('Bank name', financial?.bankName, (v) => onNestedChange('financial', 'bankName', v))}
          {renderText(
            'Name on card',
            financial?.accountHolderName || financial?.nameOnCard,
            (v) => onNestedChange('financial', 'accountHolderName', v),
          )}
          {renderText('IBAN', financial?.iban, (v) => onNestedChange('financial', 'iban', v))}
          {renderText('Steuer ID', financial?.steuerId || financial?.taxIdentificationNumber || financial?.taxNumber)}
          {renderText('SV-number', financial?.nationalInsuranceNumber || financial?.socialInsuranceNumber)}
        </div>
        <div>
          {renderText(
            'Children',
            Array.isArray(home?.children) ? String(home.children.length) : '',
          )}
          {renderText(
            'Child names',
            Array.isArray(home?.children) && home.children.length
              ? home.children
                  .map((ch) =>
                    [ch.childFirstName, ch.childLastName, ch.firstName, ch.lastName, ch.name]
                      .filter(Boolean)
                      .join(' '),
                  )
                  .filter(Boolean)
                  .join(', ')
              : '',
          )}
          {Array.isArray(current.customFields) &&
            current.customFields.length > 0 &&
            current.customFields.map((f) => {
              const name =
                f.name ||
                f.label ||
                f.fieldLabel ||
                f.displayName ||
                '—';
              const type = (f.type || f.fieldType || '').toString().toLowerCase();

              const rawValue = f.value;
              let displayValue = '—';
              if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
                if (Array.isArray(rawValue)) {
                  displayValue = rawValue
                    .map((v) =>
                      v && typeof v === 'object'
                        ? v.label || v.name || v.value || JSON.stringify(v)
                        : String(v),
                    )
                    .join(', ');
                } else if (typeof rawValue === 'boolean' || type === 'boolean') {
                  displayValue = rawValue ? 'Yes' : 'No';
                } else if (type === 'date') {
                  displayValue = formatDate(rawValue);
                } else if (type === 'number') {
                  const num = Number(rawValue);
                  displayValue = Number.isFinite(num) ? String(num) : String(rawValue);
                } else if (rawValue && typeof rawValue === 'object') {
                  displayValue =
                    rawValue.label ||
                    rawValue.name ||
                    rawValue.value ||
                    JSON.stringify(rawValue);
                } else {
                  displayValue = String(rawValue);
                }
              }

              return renderText(name, displayValue);
            })}
          {renderLocalDate(
            'Führerschein Aufstellungsdatum',
            current?.dspLocal?.fuehrerschein_aufstellungsdatum,
            (v) =>
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      dspLocal: { ...(prev.dspLocal || {}), fuehrerschein_aufstellungsdatum: v },
                    }
                  : prev,
              ),
          )}
          {renderText(
            'Führerschein Aufstellungsbehörde',
            current?.dspLocal?.fuehrerschein_aufstellungsbehoerde,
            (v) =>
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      dspLocal: { ...(prev.dspLocal || {}), fuehrerschein_aufstellungsbehoerde: v },
                    }
                  : prev,
              ),
          )}
        </div>
      </div>
    </section>
  );
}
