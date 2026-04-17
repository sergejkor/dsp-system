import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppSettings } from '../context/AppSettingsContext';
import {
  getFines,
  getFinesEmployees,
  createFine,
  updateFine,
  deleteFine,
  uploadFineDocument,
  getFineDocuments,
  downloadFineDocument,
  deleteFineDocument,
} from '../services/finesApi';
import { getCars } from '../services/carsApi';

function formatDate(value) {
  if (!value) return '-';
  const s = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return String(value);
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function toDateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export default function FinesPage() {
  const { t } = useAppSettings();
  const [employees, setEmployees] = useState([]);
  const [cars, setCars] = useState([]);
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('add');
  const [editingFine, setEditingFine] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [docFile, setDocFile] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docUploading, setDocUploading] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState(null);
  const [actionsMenuPos, setActionsMenuPos] = useState(null);
  const actionsMenuFineRef = useRef(null);

  const [form, setForm] = useState({
    kenjo_employee_id: '',
    car_id: '',
    created_date: '',
    receipt_date: '',
    case_number: '',
    amount: '',
    has_fine_points: false,
    fine_points: '',
    processing_date: '',
    paid_by: '',
    notify_online: false,
    notify_email: false,
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [emps, carsList, fs] = await Promise.all([getFinesEmployees(), getCars(), getFines()]);
        setEmployees(Array.isArray(emps) ? emps : []);
        setCars(Array.isArray(carsList) ? carsList : []);
        setFines(Array.isArray(fs) ? fs : []);
      } catch (e) {
        setError(e?.message || 'Failed to load fines');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function openAddDialog() {
    setDialogMode('add');
    setEditingFine(null);
    setForm({
      kenjo_employee_id: '',
      car_id: '',
      created_date: '',
      receipt_date: '',
      case_number: '',
      amount: '',
      has_fine_points: false,
      fine_points: '',
      processing_date: '',
      paid_by: '',
      notify_online: false,
      notify_email: false,
    });
    setDocFile(null);
    setDocs([]);
    setDialogOpen(true);
  }

  function openEditDialog(fine) {
    setDialogMode('edit');
    setEditingFine(fine);
    setForm({
      kenjo_employee_id: fine.kenjo_employee_id || '',
      car_id: fine.car_id != null ? String(fine.car_id) : '',
      created_date: toDateInputValue(fine.created_date),
      receipt_date: toDateInputValue(fine.receipt_date),
      case_number: fine.case_number || '',
      amount: fine.amount != null ? String(fine.amount) : '',
      has_fine_points: !!fine.has_fine_points,
      fine_points: fine.fine_points != null ? String(fine.fine_points) : '',
      processing_date: toDateInputValue(fine.processing_date),
      paid_by: fine.paid_by || '',
      notify_online: !!fine.notify_online,
      notify_email: !!fine.notify_email,
    });
    setDocFile(null);
    setDocs([]);
    setDialogOpen(true);
  }

  function openViewDialog(fine) {
    setDialogMode('view');
    setEditingFine(fine);
    setForm({
      kenjo_employee_id: fine.kenjo_employee_id || '',
      car_id: fine.car_id != null ? String(fine.car_id) : '',
      created_date: toDateInputValue(fine.created_date),
      receipt_date: toDateInputValue(fine.receipt_date),
      case_number: fine.case_number || '',
      amount: fine.amount != null ? String(fine.amount) : '',
      has_fine_points: !!fine.has_fine_points,
      fine_points: fine.fine_points != null ? String(fine.fine_points) : '',
      processing_date: toDateInputValue(fine.processing_date),
      paid_by: fine.paid_by || '',
      notify_online: !!fine.notify_online,
      notify_email: !!fine.notify_email,
    });
    setDocFile(null);
    setDocs([]);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    setDialogOpen(false);
    setEditingFine(null);
    setDialogMode('add');
  }

  function closeActionsMenu() {
    setActionsOpenId(null);
    setActionsMenuPos(null);
    actionsMenuFineRef.current = null;
  }

  async function handleSave() {
    if (!form.kenjo_employee_id) {
      setError('Employee is required');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      kenjo_employee_id: form.kenjo_employee_id,
      car_id: form.car_id || null,
      created_date: form.created_date || null,
      receipt_date: form.receipt_date || null,
      case_number: form.case_number || null,
      amount: form.amount !== '' ? Number(form.amount) : null,
      has_fine_points: !!form.has_fine_points,
      fine_points: form.has_fine_points && form.fine_points !== '' ? Number(form.fine_points) : null,
      processing_date: form.processing_date || null,
      paid_by: form.paid_by || null,
      notify_online: !!form.notify_online,
      notify_email: !!form.notify_email,
    };
    try {
      if (editingFine) {
        await updateFine(editingFine.id, payload);
      } else {
        await createFine(payload);
      }
      const refreshed = await getFines();
      setFines(Array.isArray(refreshed) ? refreshed : []);
      setDialogOpen(false);
      setEditingFine(null);
      setDialogMode('add');
      setDocFile(null);
      setDocs([]);
    } catch (e) {
      setError(e?.message || 'Failed to save fine');
    } finally {
      setSaving(false);
    }
  }

  const employeesById = useMemo(() => {
    const map = new Map();
    for (const e of employees) {
      map.set(e.id, e.name);
    }
    return map;
  }, [employees]);

  const carsById = useMemo(() => {
    const map = new Map();
    for (const car of cars) {
      map.set(Number(car.id), car);
    }
    return map;
  }, [cars]);

  const carOptions = useMemo(() => (
    (cars || []).map((car) => {
      const parts = [car.license_plate || null, car.vehicle_id || null, car.vin || null].filter(Boolean);
      return {
        value: String(car.id),
        label: parts.length ? parts.join(' / ') : `Car ${car.id}`,
      };
    })
  ), [cars]);

  useEffect(() => {
    let cancelled = false;
    if (!dialogOpen || !editingFine?.id) {
      setDocs([]);
      return () => {};
    }
    getFineDocuments(editingFine.id)
      .then((rows) => {
        if (!cancelled) setDocs(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, editingFine?.id]);

  useEffect(() => {
    if (!actionsOpenId) return;
    function onKeyDown(event) {
      if (event.key === 'Escape') closeActionsMenu();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', closeActionsMenu, true);
    window.addEventListener('resize', closeActionsMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', closeActionsMenu, true);
      window.removeEventListener('resize', closeActionsMenu);
    };
  }, [actionsOpenId]);

  const filteredFines = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return fines;
    return fines.filter((fine) => {
      const employeeName = employeesById.get(fine.kenjo_employee_id) || '';
      const linkedCar = fine.car_id != null ? carsById.get(Number(fine.car_id)) : null;
      const carSearchLabel = linkedCar
        ? [linkedCar.license_plate, linkedCar.vehicle_id, linkedCar.vin].filter(Boolean).join(' ')
        : '';
      return [
        employeeName,
        carSearchLabel,
        fine.kenjo_employee_id,
        fine.case_number,
        fine.paid_by,
        fine.receipt_date,
        fine.created_date,
      ].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [fines, search, employeesById, carsById]);

  const isViewMode = dialogMode === 'view';

  return (
    <section className="fines-page card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: '1.35rem' }}>{t('fines.title')}</h2>
          <p className="muted" style={{ margin: 0 }}>
            Manage traffic fines for employees, with dates, amounts, points and payer.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openAddDialog}>
          {t('fines.addFine')}
        </button>
      </div>
      <div style={{ marginBottom: '0.75rem' }}>
        <input
          type="text"
          placeholder="Search fines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '360px' }}
        />
      </div>

      {error && <p className="error-text" style={{ marginBottom: '0.5rem' }}>{error}</p>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('fines.employee')}</th>
                <th style={{ textAlign: 'left' }}>{t('fines.createdDate')}</th>
                <th style={{ textAlign: 'left' }}>{t('fines.receiptDate')}</th>
                <th style={{ textAlign: 'left' }}>{t('fines.caseNumber')}</th>
                <th style={{ textAlign: 'right', width: '6rem' }}>{t('fines.amount')}</th>
                <th style={{ textAlign: 'center', width: '6rem' }}>{t('fines.finePoints')}</th>
                <th style={{ textAlign: 'left' }}>{t('fines.processingDate')}</th>
                <th style={{ textAlign: 'center', width: '4rem' }}>{t('fines.paidBy')}</th>
                <th style={{ textAlign: 'center', width: '4rem' }}>{t('fines.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredFines.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '0.75rem' }}>No fines yet.</td>
                </tr>
              ) : (
                filteredFines.map((fine) => (
                  <tr key={fine.id}>
                    <td style={{ textAlign: 'left' }}>{employeesById.get(fine.kenjo_employee_id) || fine.kenjo_employee_id}</td>
                    <td style={{ textAlign: 'left' }}>{formatDate(fine.created_date)}</td>
                    <td style={{ textAlign: 'left' }}>{formatDate(fine.receipt_date)}</td>
                    <td style={{ textAlign: 'left' }}>{fine.case_number || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{fine.amount != null ? Number(fine.amount).toFixed(2) : '-'}</td>
                    <td style={{ textAlign: 'center' }}>{fine.has_fine_points ? (fine.fine_points ?? '-') : '-'}</td>
                    <td style={{ textAlign: 'left' }}>{formatDate(fine.processing_date)}</td>
                    <td style={{ textAlign: 'center' }}>{fine.paid_by || '-'}</td>
                    <td className="fines-actions-cell" style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="fines-action-menu-trigger"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const nextId = actionsOpenId === fine.id ? null : fine.id;
                          if (!nextId) {
                            closeActionsMenu();
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          const menuWidth = 176;
                          const menuHeight = 154;
                          const viewportPadding = 8;
                          const openUpTop = Math.round(rect.top - menuHeight - 10);
                          const openDownTop = Math.round(rect.bottom + 8);
                          const nextTop =
                            openUpTop >= viewportPadding
                              ? openUpTop
                              : Math.min(
                                  Math.max(viewportPadding, openDownTop),
                                  Math.max(viewportPadding, window.innerHeight - menuHeight - 12),
                                );
                          const nextLeft = Math.min(
                            Math.max(viewportPadding, Math.round(rect.left - menuWidth + rect.width)),
                            Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
                          );
                          setActionsOpenId(nextId);
                          setActionsMenuPos({ top: nextTop, left: nextLeft });
                          actionsMenuFineRef.current = fine;
                        }}
                        title="Actions"
                        aria-haspopup="menu"
                        aria-expanded={actionsOpenId === fine.id}
                      >
                        <span aria-hidden="true">&#8942;</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen && typeof document !== 'undefined' && createPortal(
        <div className="fines-modal-backdrop" onClick={closeDialog}>
          <div className="fines-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fines-modal-header">
              <h3>{isViewMode ? 'View fine' : editingFine ? 'Edit fine' : t('fines.addFine')}</h3>
              <button
                type="button"
                className="fines-modal-close"
                onClick={closeDialog}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="fines-modal-body">
              <label className="form-label">
                {t('fines.employee')}
                <select
                  value={form.kenjo_employee_id}
                  onChange={(e) => setForm((f) => ({ ...f, kenjo_employee_id: e.target.value }))}
                  disabled={isViewMode}
                >
                  <option value="">- Select -</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Car
                <select
                  value={form.car_id}
                  onChange={(e) => setForm((f) => ({ ...f, car_id: e.target.value }))}
                  disabled={isViewMode}
                >
                  <option value="">- Select car -</option>
                  {carOptions.map((car) => (
                    <option key={car.value} value={car.value}>{car.label}</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                {t('fines.createdDate')}
                <input
                  type="date"
                  lang="de-DE"
                  value={form.created_date}
                  onChange={(e) => setForm((f) => ({ ...f, created_date: e.target.value }))}
                  disabled={isViewMode}
                />
              </label>
              <label className="form-label">
                Accident date
                <input
                  type="date"
                  lang="de-DE"
                  value={form.receipt_date}
                  onChange={(e) => setForm((f) => ({ ...f, receipt_date: e.target.value }))}
                  disabled={isViewMode}
                />
              </label>
              <label className="form-label">
                {t('fines.caseNumber')}
                <input
                  type="text"
                  value={form.case_number}
                  onChange={(e) => setForm((f) => ({ ...f, case_number: e.target.value }))}
                  disabled={isViewMode}
                />
              </label>
              <label className="form-label">
                {t('fines.amount')}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  disabled={isViewMode}
                />
              </label>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={form.has_fine_points}
                  disabled={isViewMode}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      has_fine_points: checked,
                      fine_points: checked ? (f.fine_points || '1') : '',
                    }));
                  }}
                />
                <span>{t('fines.finePointsCheckbox')}</span>
                {form.has_fine_points && (
                  <select
                    value={form.fine_points}
                    onChange={(e) => setForm((f) => ({ ...f, fine_points: e.target.value }))}
                    disabled={isViewMode}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                )}
              </label>
              <label className="form-label">
                {t('fines.processingDate')}
                <input
                  type="date"
                  lang="de-DE"
                  value={form.processing_date}
                  onChange={(e) => setForm((f) => ({ ...f, processing_date: e.target.value }))}
                  disabled={isViewMode}
                />
              </label>
              <label className="form-label">
                {t('fines.paidBy')}
                <select
                  value={form.paid_by}
                  onChange={(e) => setForm((f) => ({ ...f, paid_by: e.target.value }))}
                  disabled={isViewMode}
                >
                  <option value="">-</option>
                  <option value="MA">{t('fines.paidByMa')}</option>
                  <option value="AB">{t('fines.paidByAb')}</option>
                </select>
              </label>
              <label className="form-label" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={form.notify_online}
                  disabled={isViewMode}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((f) => ({ ...f, notify_online: checked, notify_email: checked ? false : f.notify_email }));
                  }}
                />
                <span>Online</span>
              </label>
              <label className="form-label" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={form.notify_email}
                  disabled={isViewMode}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((f) => ({ ...f, notify_email: checked, notify_online: checked ? false : f.notify_online }));
                  }}
                />
                <span>Email</span>
              </label>
              <div className="form-label" style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Documents</div>
                {editingFine ? (
                  <>
                    {!isViewMode ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={!docFile || docUploading}
                          onClick={async () => {
                            if (!docFile || !editingFine?.id) return;
                            setDocUploading(true);
                            try {
                              const row = await uploadFineDocument(editingFine.id, docFile);
                              setDocs((prev) => [row, ...(prev || [])]);
                              setDocFile(null);
                            } catch (e) {
                              setError(e?.message || 'Failed to upload document');
                            } finally {
                              setDocUploading(false);
                            }
                          }}
                        >
                          {docUploading ? 'Uploading...' : 'Upload'}
                        </button>
                      </div>
                    ) : null}
                    {docs.length > 0 ? (
                      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                        {docs.map((d) => (
                          <li key={d.id}>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '0.15rem 0.45rem', marginRight: '0.45rem' }}
                              onClick={() => downloadFineDocument(editingFine.id, d.id, d.file_name || `fine-document-${d.id}.bin`)}
                            >
                              Download
                            </button>
                            {!isViewMode ? (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '0.15rem 0.45rem', marginRight: '0.45rem' }}
                                onClick={async () => {
                                  if (!editingFine?.id) return;
                                  if (!window.confirm('Delete this file?')) return;
                                  try {
                                    await deleteFineDocument(editingFine.id, d.id);
                                    setDocs((prev) => prev.filter((x) => x.id !== d.id));
                                  } catch (e) {
                                    setError(e?.message || 'Failed to delete document');
                                  }
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                            {d.file_name || `Document ${d.id}`}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted" style={{ margin: '0.45rem 0 0' }}>No documents uploaded.</p>
                    )}
                  </>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Save fine first, then upload documents in Edit Fine modal.</p>
                )}
              </div>
            </div>
            <div className="fines-modal-footer">
              <button type="button" className="btn-secondary" onClick={closeDialog} disabled={saving}>
                {isViewMode ? 'Close' : t('fines.cancel')}
              </button>
              {!isViewMode ? (
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : t('fines.save')}
                </button>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}
      {actionsOpenId && actionsMenuPos && actionsMenuFineRef.current && typeof document !== 'undefined' && createPortal(
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeActionsMenu();
            }
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 5000 }}
        >
          <div
            className="fines-actions-menu"
            style={{
              position: 'fixed',
              top: actionsMenuPos.top,
              left: actionsMenuPos.left,
            }}
          >
            <button
              type="button"
              className="fines-action-menu-item"
              onClick={() => {
                openViewDialog(actionsMenuFineRef.current);
                closeActionsMenu();
              }}
            >
              View
            </button>
            <button
              type="button"
              className="fines-action-menu-item"
              onClick={() => {
                openEditDialog(actionsMenuFineRef.current);
                closeActionsMenu();
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="fines-action-menu-item fines-action-menu-item--danger"
              onClick={async () => {
                const selectedFine = actionsMenuFineRef.current;
                closeActionsMenu();
                if (!selectedFine || !window.confirm('Delete this fine?')) return;
                try {
                  setError('');
                  await deleteFine(selectedFine.id);
                  const refreshed = await getFines();
                  setFines(Array.isArray(refreshed) ? refreshed : []);
                } catch (e) {
                  setError(e?.message || 'Failed to delete fine');
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>,
        document.body
      )}
      <style>{`
        .fines-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 4000;
        }
        .fines-modal {
          background: #fff;
          border-radius: 8px;
          max-width: 640px;
          width: 95%;
          max-height: 90vh;
          overflow: hidden;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.35);
          display: flex;
          flex-direction: column;
        }
        .fines-modal-header {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .fines-modal-header h3 {
          margin: 0;
          font-size: 1.05rem;
        }
        .fines-modal-close {
          background: none;
          border: none;
          font-size: 1.4rem;
          line-height: 1;
          cursor: pointer;
          padding: 0 0.25rem;
          color: #6b7280;
        }
        .fines-modal-close:hover {
          color: #111827;
        }
        .fines-modal-body {
          padding: 1rem 1rem 0.5rem;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem 1rem;
        }
        .fines-modal-footer {
          padding: 0.75rem 1rem 1rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          border-top: 1px solid #e5e7eb;
        }
        .fines-actions-cell {
          white-space: nowrap;
        }
        .fines-action-menu-trigger {
          border: 1px solid var(--border);
          background: var(--bg-card-strong);
          color: var(--text);
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          min-width: 2rem;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
        }
        .fines-action-menu-trigger:hover {
          background: rgba(59, 130, 246, 0.12);
        }
        .fines-action-menu-trigger:focus-visible {
          outline: 2px solid rgba(59, 130, 246, 0.45);
          outline-offset: 2px;
        }
        .fines-actions-menu {
          background: var(--bg-card-strong);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 12px 36px rgba(5, 13, 29, 0.34);
          min-width: 170px;
          z-index: 5001;
          display: flex;
          flex-direction: column;
        }
        .fines-action-menu-item {
          padding: 0.45rem 0.7rem;
          font-size: 0.88rem;
          text-align: left;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text);
        }
        .fines-action-menu-item:hover {
          background: rgba(59, 130, 246, 0.12);
        }
        .fines-action-menu-item--danger {
          color: #c62828;
        }
      `}</style>
    </section>
  );
}

