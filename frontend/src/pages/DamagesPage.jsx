import { useEffect, useMemo, useRef, useState } from 'react';
import { createDamage, deleteDamageFile, downloadDamageFile, getDamageById, getDamageFiles, getDamages, saveInsuranceReport, updateDamage, uploadDamageFiles } from '../services/damagesApi';
import { getCars, getDrivers } from '../services/carPlanningApi';
import { getKenjoEmployeeProfile } from '../services/kenjoApi';

function formatDate(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 10) : d;
  if (!s) return '—';
  const [y, m, day] = s.split('-');
  return day && m && y ? `${day}.${m}.${y}` : s;
}

export default function DamagesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

  function load() {
    setLoading(true);
    setError('');
    getDamages()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message || 'Failed to load damages'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(() => ([
    { key: 'case_closed', label: 'Case Closed', noSort: true },
    { key: 'date', label: 'Date' },
    { key: 'unfallnummer', label: 'Unfallnummer' },
    { key: 'fahrer', label: 'Fahrer' },
    { key: 'schadensnummer', label: 'Schadensnummer' },
    { key: 'vorgang_angelegt', label: 'Vorgang angelegt' },
    { key: 'fahrerformular_vollstaendig', label: 'Fahrerformular vollständig' },
    { key: 'meldung_an_partner_abgegeben', label: 'Meldung an Partner abgegeben' },
  ]), []);

  function toggleSort(nextKey) {
    setSortKey((prevKey) => {
      if (prevKey === nextKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir('asc');
      return nextKey;
    });
  }

  function sortIcon(key) {
    if (sortKey !== key) return '⇅';
    return sortDir === 'asc' ? '▲' : '▼';
  }

  const filteredSortedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? rows
      : rows.filter((r) => {
          const parts = [
            r.date ? formatDate(r.date) : '',
            r.unfallnummer || '',
            r.fahrer || '',
            r.schadensnummer || '',
            r.vorgang_angelegt || '',
            r.fahrerformular_vollstaendig || '',
            r.meldung_an_partner_abgegeben || '',
            r.case_closed ? 'closed' : '',
          ];
          return parts.join(' ').toLowerCase().includes(q);
        });

    const dir = sortDir === 'asc' ? 1 : -1;
    const getVal = (r) => {
      const v = r?.[sortKey];
      if (sortKey === 'case_closed') return v ? '1' : '0';
      if (sortKey === 'date') return v ? String(v).slice(0, 10) : '';
      return v == null ? '' : String(v);
    };
    return [...base].sort((a, b) => {
      const va = getVal(a).toLowerCase();
      const vb = getVal(b).toLowerCase();
      const c = va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true });
      return dir * c;
    });
  }, [rows, search, sortKey, sortDir]);

  async function handleCaseClosedChange(row, checked) {
    setError('');
    try {
      await updateDamage(row.id, { case_closed: checked });
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, case_closed: checked } : x)));
    } catch (e) {
      setError(e.message || 'Failed to update case');
    }
  }

  return (
    <section className="card damages-page">
      <h2>Damages</h2>
      <p className="muted">Manage damages: view, edit, add and upload files per case.</p>

      {error && <p className="cars-message cars-message--error">{error}</p>}

      <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="damages-search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="cars-btn cars-btn--primary"
          onClick={() => setAddOpen(true)}
        >
          + Add Damage
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="cars-table-wrap">
          <table className="cars-table">
            <thead>
              <tr>
                {columns.map((c) =>
                  c.noSort ? (
                    <th key={c.key} className="damages-th-nosort">
                      {c.label}
                    </th>
                  ) : (
                    <th
                      key={c.key}
                      className="damages-th-sort"
                      onClick={() => toggleSort(c.key)}
                      title="Sort"
                    >
                      <span className="damages-th-label">{c.label}</span>
                      <span className={`damages-sort-icon ${sortKey === c.key ? 'is-active' : ''}`}>
                        {sortIcon(c.key)}
                      </span>
                    </th>
                  ),
                )}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="cars-empty">
                    No damage cases.
                  </td>
                </tr>
              ) : (
                filteredSortedRows.map((r) => (
                  <tr key={r.id} className={r.case_closed ? 'damages-row-case-closed' : ''}>
                    <td className="damages-td-checkbox">
                      <input
                        type="checkbox"
                        checked={!!r.case_closed}
                        onChange={(e) => handleCaseClosedChange(r, e.target.checked)}
                        aria-label="Case closed"
                      />
                    </td>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.unfallnummer || '—'}</td>
                    <td>{r.fahrer || '—'}</td>
                    <td>{r.schadensnummer || '—'}</td>
                    <td>{r.vorgang_angelegt || '—'}</td>
                    <td>{r.fahrerformular_vollstaendig || '—'}</td>
                    <td>{r.meldung_an_partner_abgegeben || '—'}</td>
                    <td className="cars-actions-cell">
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                          type="button"
                          onClick={() => setActionsOpenId((id) => (id === r.id ? null : r.id))}
                          title="Actions"
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            border: 'none',
                            backgroundColor: 'rgba(15,23,42,0.1)',
                            borderRadius: '999px',
                            padding: '0.15rem 0.4rem',
                            cursor: 'pointer',
                          }}
                        >
                          ⋮
                        </button>
                        {actionsOpenId === r.id && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              marginTop: '0.25rem',
                              background: '#fff',
                              border: '1px solid #ddd',
                              borderRadius: '6px',
                              boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                              minWidth: '140px',
                              zIndex: 50,
                              display: 'flex',
                              flexDirection: 'column',
                              pointerEvents: 'auto',
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="cars-action-menu-item"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActionsOpenId(null);
                                setTimeout(() => setViewId(r.id), 0);
                              }}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="cars-action-menu-item"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActionsOpenId(null);
                                setTimeout(() => setEditId(r.id), 0);
                              }}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <DamageEditModal
          mode="add"
          saving={saving}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load(); }}
          onError={setError}
          setSaving={setSaving}
        />
      )}
      {viewId && (
        <DamageViewModal
          id={viewId}
          onClose={() => setViewId(null)}
          onError={setError}
        />
      )}
      {editId && (
        <DamageEditModal
          mode="edit"
          id={editId}
          saving={saving}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); load(); }}
          onError={setError}
          setSaving={setSaving}
        />
      )}
      <style>{`
        /* Page-only typography: slightly more compact (20–25%) */
        .damages-page h2 { font-size: 1.35rem; line-height: 1.25; }
        .damages-page .muted { font-size: 0.85rem; line-height: 1.35; }
        .damages-page .cars-btn { font-size: 0.82rem; padding: 0.42rem 0.65rem; }
        .damages-page .cars-table { font-size: 0.82rem; }
        .damages-page .cars-table th { font-size: 0.78rem; }
        .damages-page .cars-table th,
        .damages-page .cars-table td { padding: 0.32rem 0.5rem; }
        .damages-search {
          min-width: 240px;
          flex: 1;
          max-width: 420px;
          padding: 0.45rem 0.65rem;
          border: 1px solid var(--border, #d1d5db);
          border-radius: 10px;
          background: var(--input-bg, #fff);
          color: var(--text, #111827);
          font-size: 0.82rem;
        }
        .damages-th-sort { cursor: pointer; user-select: none; white-space: nowrap; }
        .damages-th-sort:hover { background: rgba(15,23,42,0.04); }
        .damages-th-nosort { text-align: center; white-space: nowrap; font-size: 0.78rem; }
        .damages-td-checkbox { text-align: center; vertical-align: middle; }
        .damages-row-case-closed { background: #d1fae5 !important; }
        body.dark .damages-row-case-closed { background: rgba(34, 197, 94, 0.2) !important; }
        .damages-th-label { margin-right: 0.35rem; }
        .damages-sort-icon { opacity: 0.55; font-size: 0.78rem; }
        .damages-sort-icon.is-active { opacity: 0.95; }
        /* Column sizing (1=Case closed, 2=Date, 3=Unfallnummer, …) */
        .damages-page .cars-table th:nth-child(3),
        .damages-page .cars-table td:nth-child(3) { min-width: 230px; }
        .damages-page .cars-table th:nth-child(5),
        .damages-page .cars-table td:nth-child(5) { min-width: 150px; max-width: 190px; }

        .damages-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 1rem;
        }
        .damages-modal {
          width: min(980px, 100%);
          max-height: 90vh;
          overflow: auto;
          background: var(--bg-card, #fff);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 12px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.25);
        }
        .damages-modal-header {
          position: sticky;
          top: 0;
          background: var(--bg-card, #fff);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.9rem 1.1rem;
          border-bottom: 1px solid var(--border, #e5e7eb);
          z-index: 1;
        }
        .damages-modal-header h3 {
          margin: 0;
          font-size: 0.95rem;
        }
        .damages-modal-close {
          border: none;
          background: rgba(15,23,42,0.08);
          width: 34px;
          height: 34px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 1.2rem;
          line-height: 1;
        }
        .damages-modal-close:hover { background: rgba(15,23,42,0.12); }
        .damages-modal-body { padding: 1rem 1.1rem; }
        .damages-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        .damages-form-grid label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.78rem;
        }
        .damages-form-grid input,
        .damages-form-grid select,
        .damages-form-grid textarea {
          padding: 0.42rem 0.55rem;
          border: 1px solid var(--border, #d1d5db);
          border-radius: 8px;
          background: var(--input-bg, #fff);
          color: var(--text, #111827);
          font-size: 0.82rem;
        }
        .damages-form-grid textarea { resize: vertical; }
        .damages-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.9rem 1.1rem;
          border-top: 1px solid var(--border, #e5e7eb);
          background: var(--bg-card, #fff);
        }
        .damages-btn-primary {
          background: #1976d2;
          color: #fff;
          border: none;
          padding: 0.48rem 0.9rem;
          border-radius: 10px;
          cursor: pointer;
          font-size: 0.82rem;
        }
        .damages-btn-secondary {
          background: transparent;
          border: 1px solid var(--border, #d1d5db);
          padding: 0.48rem 0.9rem;
          border-radius: 10px;
          cursor: pointer;
          font-size: 0.82rem;
        }
        @media (max-width: 820px) {
          .damages-form-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}

const ALL_FIELDS = [
  { key: 'case_closed', label: 'Case Closed', type: 'checkbox' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'unfallnummer', label: 'Unfallnummer (Datum_Kennzeichen)' },
  { key: 'fahrer', label: 'Fahrer' },
  { key: 'schadensnummer', label: 'Schadensnummer' },
  { key: 'polizeiliches_aktenzeichen', label: 'Polizeiliches Aktenzeichen' },
  { key: 'vorgang_angelegt', label: 'Vorgang angelegt' },
  { key: 'fahrerformular_vollstaendig', label: 'Fahrerformular vollständig' },
  { key: 'meldung_an_partner_abgegeben', label: 'Meldung an Partner abgegeben' },
  { key: 'deckungszusage_erhalten', label: 'Deckungszusage erhalten' },
  { key: 'kostenuebernahme_eigene_versicherung', label: 'Kostenübernahme eigene Versicherung' },
  { key: 'kostenuebernahme_fremde_versicherung', label: 'Kostenübernahme fremde Versicherung' },
  { key: 'kosten_alfamile', label: 'Kosten Alfamile', type: 'number' },
  { key: 'regress_fahrer', label: 'Regress Fahrer' },
  { key: 'offen_geschlossen', label: 'Offen/geschlossen' },
  { key: 'heute', label: 'Heute' },
  { key: 'alter_tage_lt_90', label: 'Alter/Tage: <90' },
  { key: 'kurzbeschreibung', label: 'Kurzbeschreibung' },
  { key: 'kommentare', label: 'Kommentare', type: 'textarea' },
];

function DamageViewModal({ id, onClose, onError }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDamageById(id)
      .then(setData)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="damages-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="damages-modal" onClick={(e) => e.stopPropagation()}>
        <div className="damages-modal-header">
          <h3>View Damage</h3>
          <button type="button" className="damages-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="damages-modal-body">
          {loading || !data ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <div className="damages-form-grid">
                {ALL_FIELDS.map((f) => (
                  <label key={f.key} style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                    {f.label}
                    {f.type === 'textarea' ? (
                      <textarea rows={4} value={data.damage?.[f.key] ?? ''} readOnly />
                    ) : f.type === 'checkbox' ? (
                      <input type="checkbox" checked={!!data.damage?.[f.key]} readOnly disabled />
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text')}
                        value={
                          f.type === 'date'
                            ? (data.damage?.[f.key]?.slice?.(0, 10) || '')
                            : (data.damage?.[f.key] ?? '')
                        }
                        readOnly
                      />
                    )}
                  </label>
                ))}
              </div>

              <FilesBlock
                damageId={id}
                readOnly
                initialFiles={data.files || []}
              />
            </>
          )}
        </div>
        <div className="damages-modal-footer">
          <button type="button" className="damages-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DamageEditModal({ mode, id, saving, setSaving, onClose, onSaved, onError }) {
  const isAdd = mode === 'add';
  const [loading, setLoading] = useState(!isAdd);
  const [files, setFiles] = useState([]);
  const [insuranceReportOpen, setInsuranceReportOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    case_closed: false,
    date: '',
    unfallnummer: '',
    fahrer: '',
    schadensnummer: '',
    polizeiliches_aktenzeichen: '',
    vorgang_angelegt: '',
    fahrerformular_vollstaendig: '',
    meldung_an_partner_abgegeben: '',
    deckungszusage_erhalten: '',
    kostenuebernahme_eigene_versicherung: '',
    kostenuebernahme_fremde_versicherung: '',
    kosten_alfamile: '',
    regress_fahrer: '',
    offen_geschlossen: '',
    heute: '',
    alter_tage_lt_90: '',
    kurzbeschreibung: '',
    kommentare: '',
  }));
  const [newFiles, setNewFiles] = useState([]);

  useEffect(() => {
    if (isAdd) return;
    setLoading(true);
    getDamageById(id)
      .then((data) => {
        const d = data.damage || {};
        setForm((prev) => ({
          ...prev,
          ...d,
          case_closed: !!d.case_closed,
          date: d.date?.slice?.(0, 10) || '',
        }));
        setFiles(data.files || []);
      })
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, [id, isAdd]);

  const title = isAdd ? 'Add Damage' : 'Edit Damage';

  const requiredMissing = useMemo(() => {
    const miss = [];
    if (!String(form.unfallnummer || '').trim()) miss.push('unfallnummer');
    if (!String(form.fahrer || '').trim()) miss.push('fahrer');
    if (!String(form.schadensnummer || '').trim()) miss.push('schadensnummer');
    return miss;
  }, [form]);

  async function handleSave() {
    if (requiredMissing.length) {
      onError(`Required: ${requiredMissing.join(', ')}`);
      return;
    }
    try {
      setSaving(true);
      let saved = null;
      if (isAdd) saved = await createDamage(form);
      else saved = await updateDamage(id, form);
      const damageId = isAdd ? saved.id : id;
      if (newFiles.length) {
        await uploadDamageFiles(damageId, newFiles);
      }
      onSaved();
    } catch (e) {
      onError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="damages-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="damages-modal" onClick={(e) => e.stopPropagation()}>
        <div className="damages-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {isAdd && (
              <button
                type="button"
                className="damages-btn-secondary"
                style={{ padding: '0.35rem 0.6rem', borderRadius: 10 }}
                onClick={() => setInsuranceReportOpen(true)}
              >
                Report to insurance
              </button>
            )}
          </div>
          <button type="button" className="damages-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="damages-modal-body">
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <div className="damages-form-grid">
                {ALL_FIELDS.map((f) => (
                  <label key={f.key} style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                    {f.label}{['unfallnummer','fahrer','schadensnummer'].includes(f.key) ? ' *' : ''}
                    {f.type === 'textarea' ? (
                      <textarea
                        rows={4}
                        value={form[f.key] ?? ''}
                        onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                    ) : f.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={!!form[f.key]}
                        onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.checked }))}
                      />
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text')}
                        value={form[f.key] ?? ''}
                        onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>

              {!isAdd && (
                <FilesBlock
                  damageId={id}
                  initialFiles={files}
                  onFilesChange={setFiles}
                />
              )}

              <div style={{ marginTop: '0.75rem' }}>
                <label>
                  Upload files
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                  />
                </label>
              </div>
            </>
          )}
        </div>
        <div className="damages-modal-footer">
          <button type="button" className="damages-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="damages-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {insuranceReportOpen && (
        <InsuranceReportModal
          damageId={isAdd ? null : id}
          damageDraft={form}
          onClose={() => setInsuranceReportOpen(false)}
          onSaved={() => setInsuranceReportOpen(false)}
          onError={onError}
          setSaving={setSaving}
        />
      )}
    </div>
  );
}

function normalizeName(s) {
  return String(s || '').trim();
}

function extractPlateFromUnfallnummer(unfallnummer) {
  const s = String(unfallnummer || '').trim();
  if (!s) return '';
  const parts = s.split('_');
  return parts.length >= 2 ? parts[parts.length - 1].trim() : '';
}

function mapKenjoEmployeeToDriverDetails(emp) {
  if (!emp) return null;
  const firstName = emp.firstName || emp.first_name || emp.personalEmp?.firstName || emp.personalEmp?.first_name || '';
  const lastName = emp.lastName || emp.last_name || emp.personalEmp?.lastName || emp.personalEmp?.last_name || '';
  const fullName =
    normalizeName(emp.displayName) ||
    normalizeName([firstName, lastName].filter(Boolean).join(' ')) ||
    normalizeName(emp.name) ||
    '';
  const phoneNumber =
    normalizeName(emp.personalPhone) ||
    normalizeName(emp.phoneNumber) ||
    normalizeName(emp.phone) ||
    normalizeName(emp.mobile) ||
    normalizeName(emp.home?.personalPhone) ||
    normalizeName(emp.home?.personalMobile) ||
    normalizeName(emp.personalEmp?.personalPhone) ||
    normalizeName(emp.personalEmp?.phone) ||
    normalizeName(emp.personalEmp?.mobile) ||
    normalizeName(emp.personal?.mobile) ||
    normalizeName(emp.work?.workMobile) ||
    '';
  const birthDate =
    (emp.birthdate && String(emp.birthdate).slice(0, 10)) ||
    (emp.birthDate && String(emp.birthDate).slice(0, 10)) ||
    (emp.personal?.birthdate && String(emp.personal.birthdate).slice(0, 10)) ||
    (emp.personalEmp?.birthdate && String(emp.personalEmp.birthdate).slice(0, 10)) ||
    (emp.personalEmp?.birthDate && String(emp.personalEmp.birthDate).slice(0, 10)) ||
    (emp.personalEmp?.dateOfBirth && String(emp.personalEmp.dateOfBirth).slice(0, 10)) ||
    '';
  const streetBase =
    normalizeName(emp.address?.streetName) ||
    normalizeName(emp.address?.street) ||
    normalizeName(emp.homeEmp?.streetName) ||
    normalizeName(emp.homeEmp?.street) ||
    normalizeName(emp.homeEmp?.address?.streetName) ||
    normalizeName(emp.homeEmp?.address?.street) ||
    normalizeName(emp.personalEmp?.streetName) ||
    normalizeName(emp.personalEmp?.street) ||
    normalizeName(emp.personalEmp?.address?.streetName) ||
    normalizeName(emp.personalEmp?.address?.street) ||
    '';
  const houseNumber =
    normalizeName(emp.address?.houseNumber) ||
    normalizeName(emp.homeEmp?.houseNumber) ||
    normalizeName(emp.homeEmp?.address?.houseNumber) ||
    normalizeName(emp.personalEmp?.houseNumber) ||
    normalizeName(emp.personalEmp?.address?.houseNumber) ||
    '';
  const street = [streetBase, houseNumber].filter(Boolean).join(' ');
  const zip =
    normalizeName(emp.address?.zipCode) ||
    normalizeName(emp.address?.postalCode) ||
    normalizeName(emp.address?.zip) ||
    normalizeName(emp.homeEmp?.zipCode) ||
    normalizeName(emp.homeEmp?.zip) ||
    normalizeName(emp.personalEmp?.zipCode) ||
    normalizeName(emp.personalEmp?.zip) ||
    '';
  const city =
    normalizeName(emp.address?.city) ||
    normalizeName(emp.homeEmp?.city) ||
    normalizeName(emp.personalEmp?.city) ||
    '';
  const addressLine =
    normalizeName(emp.address) ||
    normalizeName(emp.homeEmp?.address) ||
    normalizeName(emp.personalEmp?.address) ||
    '';
  return {
    id: emp.id || emp._id,
    firstName: normalizeName(firstName) || null,
    lastName: normalizeName(lastName) || null,
    fullName: fullName || '',
    street: street || null,
    zip: zip || null,
    city: city || null,
    addressLine: addressLine || null,
    phoneNumber: phoneNumber || null,
    birthDate: birthDate || null,
  };
}

function InsuranceReportModal({ damageId, damageDraft, onClose, onSaved, onError, setSaving }) {
  const [cars, setCars] = useState([]);
  const [carQuery, setCarQuery] = useState(extractPlateFromUnfallnummer(damageDraft?.unfallnummer) || '');
  const [carOpen, setCarOpen] = useState(false);
  const carRef = useRef(null);
  const [drivers, setDrivers] = useState([]);
  const [driverQuery, setDriverQuery] = useState('');
  const [driverOpen, setDriverOpen] = useState(false);
  const driverRef = useRef(null);

  const [form, setForm] = useState(() => ({
    damageType: 'liability',
    schunckClaimNumber: '26101249',
    licensePlate: extractPlateFromUnfallnummer(damageDraft?.unfallnummer) || '',
    damageDate: damageDraft?.date || '',
    time: '',
    yourClaimNumber: damageDraft?.schadensnummer || '',
    insurerClaimNumber: 'SD70003357710',
    policyHolder: '251626 ALFAMILE',
    vatDeductible: null,
    trailer: { hasTrailer: false, licensePlate: '', external: false },
    driver: {
      employeeId: '',
      fullName: '',
      street: '',
      zip: '',
      city: '',
      phoneNumber: '',
      birthDate: '',
      alcoholDrugs: null,
      tested: null,
      licenseNumber: '',
      licenseIssuer: '',
      licenseDate: '',
      licenseClasses: '',
      tripType: '',
    },
    general: { cause: '', weather: '', road: '', placeCategory: '' },
    accident: {
      zip: '',
      city: '',
      street: '',
      extra: '',
      policeInvolved: false,
      policeStation: '',
      witnesses: null,
      warnedWho: '',
    },
    kasko: {
      ownDamage: false,
      damageAmountEur: '',
      damagedWhat: '',
      inspectionPlace: '',
      contact: '',
      regulationToBank: '',
      leasingVehicle: null,
      repairPlanned: null,
    },
    police: { leasing: null },
    opponent: {
      lastNameCompany: '',
      firstNameContact: '',
      street: '',
      city: '',
      damagedWhat: '',
      phone: '',
      email: '',
      plate: '',
    },
    liability: { objections: null, claimsSelfCaused: null, description: '' },
    notes: '',
  }));

  useEffect(() => {
    getCars()
      .then((list) => setCars(Array.isArray(list) ? list : []))
      .catch(() => setCars([]));
    getDrivers()
      .then((list) => setDrivers(Array.isArray(list) ? list : []))
      .catch(() => setDrivers([]));
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (carRef.current && !carRef.current.contains(e.target)) setCarOpen(false);
      if (driverRef.current && !driverRef.current.contains(e.target)) setDriverOpen(false);
    }
    if (driverOpen || carOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [driverOpen, carOpen]);

  const carOptions = useMemo(() => {
    const q = carQuery.trim().toLowerCase();
    const base = !q
      ? cars
      : cars.filter((c) => {
          const plate = String(c.license_plate || '').toLowerCase();
          const vin = String(c.vin || '').toLowerCase();
          const vehicleId = String(c.vehicle_id || '').toLowerCase();
          return plate.includes(q) || vin.includes(q) || vehicleId.includes(q);
        });
    return base
      .map((c) => ({
        id: c.id,
        label: c.license_plate || c.vehicle_id || c.vin || String(c.id),
      }))
      .filter((o) => o.label)
      .slice(0, 25);
  }, [cars, carQuery]);

  const driverOptions = useMemo(() => {
    const q = driverQuery.trim().toLowerCase();
    const base = !q
      ? drivers
      : drivers.filter((d) => String(d.display_name || '').toLowerCase().includes(q));
    return base.slice(0, 25).map((d) => ({
      id: d.id || d._id,
      fullName: d.display_name || d.transporter_id || d.id,
    })).filter((d) => d.id && d.fullName);
  }, [drivers, driverQuery]);

  async function handleSelectDriver(opt) {
    setDriverQuery(opt.fullName);
    setDriverOpen(false);
    setForm((p) => ({ ...p, driver: { ...p.driver, employeeId: opt.id, fullName: opt.fullName } }));
    try {
      const emp = await getKenjoEmployeeProfile(opt.id);
      const details = mapKenjoEmployeeToDriverDetails(emp);
      if (details) {
        setForm((p) => ({
          ...p,
          driver: {
            employeeId: details.id,
            fullName: details.fullName || opt.fullName,
            street: details.street || details.addressLine || '',
            zip: details.zip || '',
            city: details.city || '',
            phoneNumber: details.phoneNumber || '',
            birthDate: details.birthDate || '',
            alcoholDrugs: p.driver.alcoholDrugs,
            tested: p.driver.tested,
            licenseNumber: p.driver.licenseNumber,
            licenseIssuer: p.driver.licenseIssuer,
            licenseDate: p.driver.licenseDate,
            licenseClasses: p.driver.licenseClasses,
            tripType: p.driver.tripType,
          },
        }));
      }
    } catch {
      // ignore kenjo detail errors, keep selection
    }
  }

  function handleSelectCar(opt) {
    setCarQuery(opt.label);
    setCarOpen(false);
    setForm((p) => ({ ...p, licensePlate: opt.label }));
  }

  async function handleSaveSend() {
    const missing = [];
    if (!form.damageType) missing.push('Damage Type');
    if (!String(form.licensePlate || '').trim()) missing.push('Vehicle License Plate');
    if (!String(form.damageDate || '').trim()) missing.push('Damage Date');
    if (!String(form.driver.employeeId || '').trim()) missing.push('Driver');
    if (missing.length) {
      onError(`Required: ${missing.join(', ')}`);
      return;
    }
    try {
      setSaving(true);
      let id = damageId;
      if (!id) {
        const draft = damageDraft || {};
        let date = draft.date || form.damageDate || null;
        if (date) {
          date = String(date).slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            date = null;
          }
        }
        // schadensnummer is UNIQUE in DB — do not use insurer/SCHUNCK template defaults as fallback
        // (they repeat across sessions and cause uq_damages_schadensnummer violations).
        const draftSchadensnummer = String(draft.schadensnummer || '').trim();
        const yourClaimNumber = String(form.yourClaimNumber || '').trim();
        const insurerDefault = String(form.insurerClaimNumber || '').trim();
        const schunckDefault = String(form.schunckClaimNumber || '').trim();

        // If the parent draft already contains one of the built-in template defaults,
        // treat it as "not provided" and generate something unique instead.
        const safeDraftSchadensnummer =
          draftSchadensnummer &&
          draftSchadensnummer !== insurerDefault &&
          draftSchadensnummer !== schunckDefault
            ? draftSchadensnummer
            : '';

        const safeYourClaimNumber =
          yourClaimNumber && yourClaimNumber !== insurerDefault && yourClaimNumber !== schunckDefault
            ? yourClaimNumber
            : '';

        const schadensRef = safeDraftSchadensnummer || safeYourClaimNumber || `DRAFT-${Date.now()}`;
        const payload = {
          unfallnummer:
            draft.unfallnummer ||
            form.yourClaimNumber ||
            form.insurerClaimNumber ||
            form.schunckClaimNumber ||
            form.licensePlate ||
            'KFZ',
          fahrer: draft.fahrer || form.driver.fullName || 'Unbekannt',
          schadensnummer: schadensRef,
          date,
        };
        const created = await createDamage(payload);
        id = created.id;
      }
      await saveInsuranceReport(id, form);
      onSaved();
    } catch (e) {
      onError(e.message || 'Failed to save insurance report');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="damages-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 2100 }}>
      <div className="damages-modal" style={{ width: 'min(1040px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="damages-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Car Damage Report (KFZ Schadenanzeige)</h3>
            <button type="button" className="damages-btn-primary" onClick={handleSaveSend}>
              Save & send
            </button>
          </div>
          <button type="button" className="damages-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="damages-modal-body">
          <Section title="1. General Information">
            <div className="damages-form-grid">
              <label>
                Damage Type (Schadenart) *
                <select value={form.damageType} onChange={(e) => setForm((p) => ({ ...p, damageType: e.target.value }))}>
                  <option value="liability">Liability (Haftpflicht)</option>
                  <option value="partial">Partial Coverage (Teilkasko)</option>
                  <option value="full">Full Coverage (Vollkasko)</option>
                </select>
              </label>
              <label>
                SCHUNCK Claim Number
                <input value={form.schunckClaimNumber} onChange={(e) => setForm((p) => ({ ...p, schunckClaimNumber: e.target.value }))} />
              </label>
              <label>
                Vehicle License Plate (Kennzeichen KFZ) *
                <div ref={carRef} style={{ position: 'relative' }}>
                  <input
                    value={carQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCarQuery(v);
                      setCarOpen(true);
                      setForm((p) => ({ ...p, licensePlate: v }));
                    }}
                    onFocus={() => setCarOpen(true)}
                    placeholder="Search car…"
                  />
                  {carOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border, #d1d5db)', borderRadius: 8, marginTop: 4, maxHeight: 220, overflow: 'auto', zIndex: 10 }}>
                      {carOptions.map((opt) => (
                        <div
                          key={`${opt.id}-${opt.label}`}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectCar(opt); }}
                          style={{ padding: '0.45rem 0.55rem', cursor: 'pointer' }}
                        >
                          {opt.label}
                        </div>
                      ))}
                      {carOptions.length === 0 && (
                        <div style={{ padding: '0.45rem 0.55rem', color: '#666' }}>No results</div>
                      )}
                    </div>
                  )}
                </div>
              </label>
              <label>
                Damage Date (Schadendatum) *
                <input type="date" value={form.damageDate} onChange={(e) => setForm((p) => ({ ...p, damageDate: e.target.value }))} />
              </label>
              <label>
                Time (Uhrzeit)
                <input type="time" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} />
              </label>
              <label>
                Your Claim Number (Ihre Schadennummer)
                <input value={form.yourClaimNumber} onChange={(e) => setForm((p) => ({ ...p, yourClaimNumber: e.target.value }))} />
              </label>
              <label>
                Insurer Claim Number (Schadennr. Versicherer)
                <input value={form.insurerClaimNumber} onChange={(e) => setForm((p) => ({ ...p, insurerClaimNumber: e.target.value }))} />
              </label>
              <label>
                Policy Holder (Versicherungsnehmer)
                <input value={form.policyHolder} onChange={(e) => setForm((p) => ({ ...p, policyHolder: e.target.value }))} />
              </label>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>VAT Deductible (Vorsteuerabzugsberechtigt)</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="vat" checked={form.vatDeductible === true} onChange={() => setForm((p) => ({ ...p, vatDeductible: true }))} />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="vat" checked={form.vatDeductible === false} onChange={() => setForm((p) => ({ ...p, vatDeductible: false }))} />
                    No
                  </label>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Allgemeine Daten">
            <div className="damages-form-grid">
              <label>
                Schadenursache
                <select
                  value={form.general.cause}
                  onChange={(e) => setForm((p) => ({ ...p, general: { ...p.general, cause: e.target.value } }))}
                >
                  <option value="">&lt;Bitte auswählen&gt;</option>
                  <option value="Abbiegeschaden (010)">Abbiegeschaden (010)</option>
                  <option value="Auffahrschaden (015)">Auffahrschaden (015)</option>
                  <option value="Ausscherschaden (017)">Ausscherschaden (017)</option>
                  <option value="Be- / entlade- / Ein- / Aussteigeschaden (020)">Be- / entlade- / Ein- / Aussteigeschaden (020)</option>
                  <option value="Brand- / Explosion (025)">Brand- / Explosion (025)</option>
                  <option value="Reifenpanne (029)">Reifenpanne (029)</option>
                  <option value="Brems- / Betriebs- / Bruchschaden (030)">Brems- / Betriebs- / Bruchschaden (030)</option>
                  <option value="Panne Sonstige (031)">Panne Sonstige (031)</option>
                  <option value="Diebstahlschaden (035)">Diebstahlschaden (035)</option>
                  <option value="Ein- / Ausparken PKW (040)">Ein- / Ausparken PKW (040)</option>
                  <option value="Fremdschaden Regress durch VR bei UG (045)">Fremdschaden Regress durch VR bei UG (045)</option>
                  <option value="Geschwindigkeitsschaden (050)">Geschwindigkeitsschaden (050)</option>
                  <option value="Glasbruchschaden (055)">Glasbruchschaden (055)</option>
                  <option value="Höhenschaden (060)">Höhenschaden (060)</option>
                  <option value="Hydraulik-/Umweltschaden (065)">Hydraulik-/Umweltschaden (065)</option>
                  <option value="Ladungsschaden (065)">Ladungsschaden (065)</option>
                  <option value="Marderbiss (070)">Marderbiss (070)</option>
                  <option value="Mut- und böswillige Zerstörung (075)">Mut- und böswillige Zerstörung (075)</option>
                  <option value="Rangierschaden (080)">Rangierschaden (080)</option>
                  <option value="Umbruchschaden (082)">Umbruchschaden (082)</option>
                  <option value="Schmorschaden (085)">Schmorschaden (085)</option>
                  <option value="sonstiger Schaden (090)">sonstiger Schaden (090)</option>
                  <option value="Spurschaden (095)">Spurschaden (095)</option>
                  <option value="VR Sonstiges (098)">VR Sonstiges (098)</option>
                  <option value="Unbekannt - SM liegt noch nicht vor (099)">Unbekannt - SM liegt noch nicht vor (099)</option>
                  <option value="Streifschaden (100)">Streifschaden (100)</option>
                  <option value="Sturm- / Hagel- / Blitzschaden (105)">Sturm- / Hagel- / Blitzschaden (105)</option>
                  <option value="Teilkaskoabkommen (110)">Teilkaskoabkommen (110)</option>
                  <option value="Transportschaden (115)">Transportschaden (115)</option>
                  <option value="Überschwemmungsschaden (120)">Überschwemmungsschaden (120)</option>
                  <option value="Unterschlagung (125)">Unterschlagung (125)</option>
                  <option value="Vermischungsschaden (130)">Vermischungsschaden (130)</option>
                  <option value="Vorwärtsschaden (135)">Vorwärtsschaden (135)</option>
                  <option value="Wild- / Tierschaden (140)">Wild- / Tierschaden (140)</option>
                  <option value="Witterung (Glatteis, Aquaplaning usw.) (145)">Witterung (Glatteis, Aquaplaning usw.)  (145)</option>
                  <option value="Fahrzeugsicherung/Bedienung/Übernahme (150)">Fahrzeugsicherung/Bedienung/Übernahme (150)</option>
                </select>
              </label>
              <label>
                Witterungsverhältnisse
                <select
                  value={form.general.weather}
                  onChange={(e) => setForm((p) => ({ ...p, general: { ...p.general, weather: e.target.value } }))}
                >
                  <option value="">&lt;Bitte auswählen&gt;</option>
                  <option value="Tageslicht">Tageslicht</option>
                  <option value="Dämmerung">Dämmerung</option>
                  <option value="Dunkelheit">Dunkelheit</option>
                  <option value="sonnig">sonnig</option>
                  <option value="bewölkt">bewölkt</option>
                  <option value="Nebel">Nebel</option>
                  <option value="Regen">Regen</option>
                  <option value="Schnee">Schnee</option>
                  <option value="Hagel">Hagel</option>
                </select>
              </label>
              <label>
                Strassenverhältnisse
                <select
                  value={form.general.road}
                  onChange={(e) => setForm((p) => ({ ...p, general: { ...p.general, road: e.target.value } }))}
                >
                  <option value="">&lt;Bitte auswählen&gt;</option>
                  <option value="trocken">trocken</option>
                  <option value="nass">nass</option>
                  <option value="vereist">vereist</option>
                  <option value="schmierig">schmierig</option>
                </select>
              </label>
              <label>
                Schadenort Kategorie
                <select
                  value={form.general.placeCategory}
                  onChange={(e) => setForm((p) => ({ ...p, general: { ...p.general, placeCategory: e.target.value } }))}
                >
                  <option value="">&lt;Bitte auswählen&gt;</option>
                  <option value="Autobahn">Autobahn</option>
                  <option value="Außerorts">Außerorts</option>
                  <option value="Innerorts">Innerorts</option>
                  <option value="Gewerbegebiet">Gewerbegebiet</option>
                  <option value="Wohngebiet">Wohngebiet</option>
                  <option value="30-Zone">30-Zone</option>
                  <option value="Grundstück">Grundstück</option>
                  <option value="Sonstiges">Sonstiges</option>
                </select>
              </label>
            </div>
          </Section>

          <Section title="2. Trailer Information (Anhänger)">
            <div className="damages-form-grid">
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>Was a trailer attached?</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="trailer" checked={form.trailer.hasTrailer === true} onChange={() => setForm((p) => ({ ...p, trailer: { ...p.trailer, hasTrailer: true } }))} />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="trailer" checked={form.trailer.hasTrailer === false} onChange={() => setForm((p) => ({ ...p, trailer: { ...p.trailer, hasTrailer: false, licensePlate: '' } }))} />
                    No
                  </label>
                </div>
              </div>
              {form.trailer.hasTrailer && (
                <label>
                  Trailer License Plate
                  <input value={form.trailer.licensePlate} onChange={(e) => setForm((p) => ({ ...p, trailer: { ...p.trailer, licensePlate: e.target.value } }))} />
                </label>
              )}
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>External Trailer (Fremder Anhänger)</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="exttrailer" checked={form.trailer.external === true} onChange={() => setForm((p) => ({ ...p, trailer: { ...p.trailer, external: true } }))} />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="exttrailer" checked={form.trailer.external === false} onChange={() => setForm((p) => ({ ...p, trailer: { ...p.trailer, external: false } }))} />
                    No
                  </label>
                </div>
              </div>
            </div>
          </Section>

          <Section title="3. Driver Information (Fahrer)">
            <div className="damages-form-grid">
              <label style={{ gridColumn: '1 / -1' }}>
                Driver Name / First Name (Name / Vorname) *
                <div ref={driverRef} style={{ position: 'relative' }}>
                  <input
                    value={driverQuery}
                    onChange={(e) => { setDriverQuery(e.target.value); setDriverOpen(true); }}
                    onFocus={() => setDriverOpen(true)}
                    placeholder="Search driver…"
                  />
                  {driverOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border, #d1d5db)', borderRadius: 8, marginTop: 4, maxHeight: 220, overflow: 'auto', zIndex: 10 }}>
                      {driverOptions.map((opt) => (
                        <div
                          key={opt.id}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectDriver(opt); }}
                          style={{ padding: '0.45rem 0.55rem', cursor: 'pointer' }}
                        >
                          {opt.fullName}
                        </div>
                      ))}
                      {driverOptions.length === 0 && (
                        <div style={{ padding: '0.45rem 0.55rem', color: '#666' }}>No results</div>
                      )}
                    </div>
                  )}
                </div>
              </label>
              <label>
                Straße
                <input value={form.driver.street} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, street: e.target.value } }))} />
              </label>
              <label>
                PLZ
                <input value={form.driver.zip} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, zip: e.target.value } }))} />
              </label>
              <label>
                Ort
                <input value={form.driver.city} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, city: e.target.value } }))} />
              </label>
              <label>
                Date of Birth
                <input type="date" value={form.driver.birthDate} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, birthDate: e.target.value } }))} />
              </label>
              <label>
                Mobil Tel.
                <input value={form.driver.phoneNumber} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, phoneNumber: e.target.value } }))} />
              </label>
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>Alkohol-/Drogenkonsum</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="alcohol" checked={form.driver.alcoholDrugs === true} onChange={() => setForm((p) => ({ ...p, driver: { ...p.driver, alcoholDrugs: true } }))} />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="alcohol" checked={form.driver.alcoholDrugs === false} onChange={() => setForm((p) => ({ ...p, driver: { ...p.driver, alcoholDrugs: false } }))} />
                    No
                  </label>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>getestet</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="tested" checked={form.driver.tested === true} onChange={() => setForm((p) => ({ ...p, driver: { ...p.driver, tested: true } }))} />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="tested" checked={form.driver.tested === false} onChange={() => setForm((p) => ({ ...p, driver: { ...p.driver, tested: false } }))} />
                    No
                  </label>
                </div>
              </div>
              <label>
                Führerschein-Nummer
                <input value={form.driver.licenseNumber} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, licenseNumber: e.target.value } }))} />
              </label>
              <label>
                Führerschein-Aussteller
                <input value={form.driver.licenseIssuer} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, licenseIssuer: e.target.value } }))} />
              </label>
              <label>
                Führerschein-Datum
                <input type="date" value={form.driver.licenseDate} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, licenseDate: e.target.value } }))} />
              </label>
              <label>
                Führerschein-Klassen
                <input value={form.driver.licenseClasses} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, licenseClasses: e.target.value } }))} />
              </label>
              <label>
                Art der Fahrt
                <select value={form.driver.tripType} onChange={(e) => setForm((p) => ({ ...p, driver: { ...p.driver, tripType: e.target.value } }))}>
                  <option value="">&lt;Bitte auswählen&gt;</option>
                  <option value="Geschäftsfahrt">Geschäftsfahrt</option>
                  <option value="Privatfahrt">Privatfahrt</option>
                  <option value="Wohnung / Arbeitsstätte">Wohnung / Arbeitsstätte</option>
                </select>
              </label>
            </div>
          </Section>

          <Section title="4. Accident Details">
            <div className="damages-form-grid">
              <label>
                PLZ
                <input value={form.accident.zip} onChange={(e) => setForm((p) => ({ ...p, accident: { ...p.accident, zip: e.target.value } }))} />
              </label>
              <label>
                Ort
                <input value={form.accident.city} onChange={(e) => setForm((p) => ({ ...p, accident: { ...p.accident, city: e.target.value } }))} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Straße
                <input value={form.accident.street} onChange={(e) => setForm((p) => ({ ...p, accident: { ...p.accident, street: e.target.value } }))} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Zusatz
                <input value={form.accident.extra} onChange={(e) => setForm((p) => ({ ...p, accident: { ...p.accident, extra: e.target.value } }))} />
              </label>
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>Police Involved</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="police" checked={form.accident.policeInvolved === true} onChange={() => setForm((p) => ({ ...p, accident: { ...p.accident, policeInvolved: true } }))} />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="police" checked={form.accident.policeInvolved === false} onChange={() => setForm((p) => ({ ...p, accident: { ...p.accident, policeInvolved: false, policeReportNumber: '' } }))} />
                    No
                  </label>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>Zeugen</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="witnesses" checked={form.accident.witnesses === true} onChange={() => setForm((p) => ({ ...p, accident: { ...p.accident, witnesses: true } }))} />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="witnesses" checked={form.accident.witnesses === false} onChange={() => setForm((p) => ({ ...p, accident: { ...p.accident, witnesses: false } }))} />
                    No
                  </label>
                </div>
              </div>
              <label style={{ gridColumn: '1 / -1' }}>
                Polizeidienststelle/Ansprechpartner/TB-Nr.
                <input value={form.accident.policeStation} onChange={(e) => setForm((p) => ({ ...p, accident: { ...p.accident, policeStation: e.target.value } }))} />
              </label>
              <label>
                Wer wurde verwarnt?
                <select value={form.accident.warnedWho} onChange={(e) => setForm((p) => ({ ...p, accident: { ...p.accident, warnedWho: e.target.value } }))}>
                  <option value="">&lt;Bitte auswählen&gt;</option>
                  <option value="Fahrer">Fahrer</option>
                  <option value="Unfallgegner">Unfallgegner</option>
                  <option value="Beide">Beide</option>
                </select>
              </label>
            </div>
          </Section>
          <Section title="5. Schäden am eigenen Kfz (Kasko)">
            <div className="damages-form-grid">
              <label>
                Schadenhöhe ca. EUR
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.kasko.damageAmountEur}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, kasko: { ...p.kasko, damageAmountEur: e.target.value } }))
                  }
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Was wurde beschädigt?
                <textarea
                  rows={3}
                  value={form.kasko.damagedWhat}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, kasko: { ...p.kasko, damagedWhat: e.target.value } }))
                  }
                />
              </label>
              <label>
                Besichtigungsort
                <input
                  value={form.kasko.inspectionPlace}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, kasko: { ...p.kasko, inspectionPlace: e.target.value } }))
                  }
                />
              </label>
              <label>
                Adr./Telef./Ansprechpartner
                <input
                  value={form.kasko.contact}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, kasko: { ...p.kasko, contact: e.target.value } }))
                  }
                />
              </label>
              <label>
                Regulierung an Bankverb.
                <input
                  value={form.kasko.regulationToBank}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, kasko: { ...p.kasko, regulationToBank: e.target.value } }))
                  }
                />
              </label>
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>Leasing-Fahrzeug</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="leasingVehicle"
                      checked={form.kasko.leasingVehicle === true}
                      onChange={() =>
                        setForm((p) => ({ ...p, kasko: { ...p.kasko, leasingVehicle: true } }))
                      }
                    />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="leasingVehicle"
                      checked={form.kasko.leasingVehicle === false}
                      onChange={() =>
                        setForm((p) => ({ ...p, kasko: { ...p.kasko, leasingVehicle: false } }))
                      }
                    />
                    No
                  </label>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>Reparatur geplant</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="repairPlanned"
                      checked={form.kasko.repairPlanned === true}
                      onChange={() =>
                        setForm((p) => ({ ...p, kasko: { ...p.kasko, repairPlanned: true } }))
                      }
                    />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="repairPlanned"
                      checked={form.kasko.repairPlanned === false}
                      onChange={() =>
                        setForm((p) => ({ ...p, kasko: { ...p.kasko, repairPlanned: false } }))
                      }
                    />
                    No
                  </label>
                </div>
              </div>
            </div>
          </Section>

          <Section title="6. Unfallgegner / Anspruchsteller">
            <div className="damages-form-grid">
              <label>
                Nachname / Firma
                <input
                  value={form.opponent.lastNameCompany}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      opponent: { ...p.opponent, lastNameCompany: e.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Vorname/Ansprechpartner
                <input
                  value={form.opponent.firstNameContact}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      opponent: { ...p.opponent, firstNameContact: e.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Straße
                <input
                  value={form.opponent.street}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, opponent: { ...p.opponent, street: e.target.value } }))
                  }
                />
              </label>
              <label>
                Ort
                <input
                  value={form.opponent.city}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, opponent: { ...p.opponent, city: e.target.value } }))
                  }
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Was wurde beschädigt?
                <textarea
                  rows={3}
                  value={form.opponent.damagedWhat}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      opponent: { ...p.opponent, damagedWhat: e.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Telefon
                <input
                  value={form.opponent.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, opponent: { ...p.opponent, phone: e.target.value } }))
                  }
                />
              </label>
              <label>
                e-Mail
                <input
                  value={form.opponent.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, opponent: { ...p.opponent, email: e.target.value } }))
                  }
                />
              </label>
              <label>
                Kennzeichen
                <input
                  value={form.opponent.plate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, opponent: { ...p.opponent, plate: e.target.value } }))
                  }
                />
              </label>
            </div>
          </Section>

          <Section title="7. Schadenschilderung">
            <div className="damages-form-grid">
              <label style={{ gridColumn: '1 / -1' }}>
                Schadenschilderung
                <textarea
                  rows={4}
                  value={form.liability.description}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      liability: { ...p.liability, description: e.target.value },
                    }))
                  }
                />
              </label>
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>Haftungseinwände</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="liabObjection"
                      checked={form.liability.objections === true}
                      onChange={() =>
                        setForm((p) => ({ ...p, liability: { ...p.liability, objections: true } }))
                      }
                    />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="liabObjection"
                      checked={form.liability.objections === false}
                      onChange={() =>
                        setForm((p) => ({ ...p, liability: { ...p.liability, objections: false } }))
                      }
                    />
                    No
                  </label>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>
                  Ansprüche an UG selbst veranlasst
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="claimsSelf"
                      checked={form.liability.claimsSelfCaused === true}
                      onChange={() =>
                        setForm((p) => ({
                          ...p,
                          liability: { ...p.liability, claimsSelfCaused: true },
                        }))
                      }
                    />
                    Yes
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="claimsSelf"
                      checked={form.liability.claimsSelfCaused === false}
                      onChange={() =>
                        setForm((p) => ({
                          ...p,
                          liability: { ...p.liability, claimsSelfCaused: false },
                        }))
                      }
                    />
                    No
                  </label>
                </div>
              </div>
            </div>
          </Section>

          <Section title="8. Additional Notes">
            <div className="damages-form-grid">
              <label style={{ gridColumn: '1 / -1' }}>
                Additional Comments
                <textarea rows={4} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </label>
            </div>
          </Section>

          <Section title="9. Files for report">
            <div className="damages-form-grid">
              <label style={{ gridColumn: '1 / -1' }}>
                Upload files for this report
                <input
                  type="file"
                  multiple
                  onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                />
              </label>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{title}</div>
      {children}
    </div>
  );
}

function FilesBlock({ damageId, initialFiles = [], onFilesChange, readOnly }) {
  const [files, setFiles] = useState(initialFiles);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFiles(initialFiles);
  }, [damageId]);

  async function reload() {
    setLoading(true);
    try {
      const fresh = await getDamageFiles(damageId);
      setFiles(fresh);
      onFilesChange?.(fresh);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(fileId) {
    await deleteDamageFile(damageId, fileId);
    await reload();
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Files</strong>
        {!readOnly && (
          <button type="button" className="cars-action" onClick={reload} disabled={loading}>
            Refresh
          </button>
        )}
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : files.length === 0 ? (
        <p className="muted">No files.</p>
      ) : (
        <table className="cars-table" style={{ marginTop: '0.5rem' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td>{f.file_name || '—'}</td>
                <td>{f.mime_type || '—'}</td>
                <td>{f.file_size != null ? `${f.file_size} B` : '—'}</td>
                <td>{formatDate(f.created_at)}</td>
                <td className="cars-actions-cell">
                  <button
                    type="button"
                    className="cars-action"
                    onClick={() => downloadDamageFile(damageId, f.id, f.file_name || `damage-${damageId}-${f.id}`)}
                  >
                    Download
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      className="cars-action cars-action--danger"
                      onClick={() => handleDelete(f.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

