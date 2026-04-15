import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getO2List, createO2Entry, updateO2Entry, deleteO2Entry } from '../services/o2TelefonicaApi';
import { getKenjoUsers } from '../services/kenjoApi';
import { useAppSettings } from '../context/AppSettingsContext';

const OTHER_VALUE = '__OTHER__';

const defaultAddForm = () => ({
  selectedEmployeeId: '',
  name: '',
  kenjo_user_id: '',
  phone_number: '',
  sim_card_number: '',
  pin1: '',
  pin2: '',
  puk1: '',
  puk2: '',
});

export default function O2TelefonicaPage() {
  const { isDark } = useAppSettings();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [pinPukDialog, setPinPukDialog] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(defaultAddForm());
  const [addSaving, setAddSaving] = useState(false);
  const [employeesList, setEmployeesList] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const menuRef = useRef(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const modalBackdropStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2, 6, 23, 0.46)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '7vh 1rem 1rem',
    zIndex: 1000,
  };
  const editModalBackdropStyle = {
    ...modalBackdropStyle,
    padding: '3vh 1rem 1rem',
  };
  const modalCardStyle = {
    background: isDark ? '#0f172a' : '#fff',
    color: isDark ? '#e2e8f0' : '#111827',
    borderRadius: 12,
    boxShadow: '0 20px 40px rgba(2, 6, 23, 0.32)',
    border: isDark ? '1px solid rgba(148, 163, 184, 0.26)' : '1px solid rgba(15, 23, 42, 0.08)',
  };
  const editModalCardStyle = {
    ...modalCardStyle,
    maxHeight: '92vh',
    overflowY: 'auto',
  };
  const modalMutedTextStyle = {
    margin: 0,
    color: isDark ? '#94a3b8' : '#64748b',
    fontSize: '0.9rem',
  };
  const modalValueStyle = {
    margin: 0,
    padding: '0.48rem 0.72rem',
    borderRadius: 10,
    background: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(248, 250, 252, 0.95)',
    border: isDark ? '1px solid rgba(71, 85, 105, 0.9)' : '1px solid rgba(226, 232, 240, 0.95)',
    color: isDark ? '#f8fafc' : '#0f172a',
    boxShadow: isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'inset 0 1px 0 rgba(255,255,255,0.75)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  };
  const deleteSummaryStyle = {
    margin: '0 0 1rem',
    padding: '0.85rem 1rem',
    borderRadius: 12,
    background: isDark ? 'rgba(30, 41, 59, 0.75)' : 'rgba(248, 250, 252, 0.95)',
    border: isDark ? '1px solid rgba(148, 163, 184, 0.18)' : '1px solid rgba(226, 232, 240, 0.95)',
    color: isDark ? '#e2e8f0' : '#334155',
  };
  const modalInputStyle = {
    width: '100%',
    padding: '0.5rem',
    boxSizing: 'border-box',
    borderRadius: 8,
    border: isDark ? '1px solid #334155' : '1px solid #d1d5db',
    background: isDark ? '#111827' : '#fff',
    color: isDark ? '#e5e7eb' : '#111827',
  };

  const filteredList = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (row) =>
        (row.name || '').toLowerCase().includes(q) ||
        (row.phone_number || '').toLowerCase().includes(q) ||
        (row.sim_card_number || '').toLowerCase().includes(q)
    );
  }, [list, searchQuery]);

  const sortedList = useMemo(() => {
    const rows = [...filteredList];
    const key = sortConfig?.key;
    const direction = sortConfig?.direction === 'desc' ? 'desc' : 'asc';
    if (!key) return rows;
    rows.sort((left, right) => {
      const leftValue = String(left?.[key] || '').toLowerCase();
      const rightValue = String(right?.[key] || '').toLowerCase();
      const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
      return direction === 'desc' ? -result : result;
    });
    return rows;
  }, [filteredList, sortConfig]);

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  const renderSortIcon = (key) => {
    if (sortConfig?.key !== key) {
      return (
        <span
          aria-hidden="true"
          style={{
            fontSize: '0.78rem',
            letterSpacing: '-0.15em',
            color: isDark ? '#94a3b8' : '#94a3b8',
          }}
        >
          ▲▼
        </span>
      );
    }
    return (
      <span
        aria-hidden="true"
        style={{
          fontSize: '0.82rem',
          color: isDark ? '#60a5fa' : '#2563eb',
          fontWeight: 700,
        }}
      >
        {sortConfig.direction === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const loadList = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getO2List();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(String(e?.message || e));
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (!addOpen && !editRow) return;
    setEmployeesLoading(true);
    getKenjoUsers()
      .then((arr) => {
        const active = (arr || []).filter((u) => u.isActive !== false);
        setEmployeesList(active);
      })
      .catch(() => setEmployeesList([]))
      .finally(() => setEmployeesLoading(false));
  }, [addOpen, editRow]);

  useEffect(() => {
    if (!menuOpenId) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpenId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpenId]);

  const openPinPuk = (row) => {
    setMenuOpenId(null);
    setPinPukDialog(row);
  };

  const getSubmitName = () => {
    if (addForm.selectedEmployeeId === OTHER_VALUE) return addForm.name?.trim() || '';
    const emp = employeesList.find((u) => String(u._id || u.id) === addForm.selectedEmployeeId);
    return emp ? (emp.displayName || [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '') : '';
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const name = getSubmitName();
    if (!name) {
      setError(addForm.selectedEmployeeId === OTHER_VALUE ? 'Enter name or select an employee.' : 'Select an employee or OTHER and enter name.');
      return;
    }
    if (!addForm.phone_number?.trim() || !addForm.sim_card_number?.trim()) {
      setError('Phone number and SIM card number are required.');
      return;
    }
    setAddSaving(true);
    setError('');
    try {
      await createO2Entry({
        name,
        kenjo_user_id: addForm.selectedEmployeeId === OTHER_VALUE ? null : addForm.kenjo_user_id || null,
        phone_number: addForm.phone_number,
        sim_card_number: addForm.sim_card_number,
        pin1: addForm.pin1,
        pin2: addForm.pin2,
        puk1: addForm.puk1,
        puk2: addForm.puk2,
      });
      setAddOpen(false);
      setAddForm(defaultAddForm());
      await loadList();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <section className="card">
      <h2>O2 Telefonica</h2>
      {error && <p className="error-text" style={{ marginBottom: '1rem' }}>{error}</p>}

      <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 500 }}>Search</span>
          <input
            type="text"
            placeholder="Name, phone, SIM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', minWidth: 200, maxWidth: 320 }}
          />
        </label>
        <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
          Add Entry
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: 0,
                      border: 'none',
                      background: 'none',
                      color: isDark ? '#e5e7eb' : '#111827',
                      font: 'inherit',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Name</span>
                    {renderSortIcon('name')}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => toggleSort('phone_number')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: 0,
                      border: 'none',
                      background: 'none',
                      color: isDark ? '#e5e7eb' : '#111827',
                      font: 'inherit',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Phone number</span>
                    {renderSortIcon('phone_number')}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => toggleSort('sim_card_number')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: 0,
                      border: 'none',
                      background: 'none',
                      color: isDark ? '#e5e7eb' : '#111827',
                      font: 'inherit',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>SIM card number</span>
                    {renderSortIcon('sim_card_number')}
                  </button>
                </th>
                <th style={{ width: 48, padding: '0.5rem' }} />
              </tr>
            </thead>
            <tbody>
              {sortedList.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '1.5rem', color: '#666', textAlign: 'center' }}>
                    {list.length === 0
                      ? 'No entries yet. Click "Add entry" to add users with phone and SIM.'
                      : 'No matches for your search.'}
                  </td>
                </tr>
              ) : (
                sortedList.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{row.name ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{row.phone_number ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{row.sim_card_number ?? '—'}</td>
                    <td style={{ padding: '0.5rem', position: 'relative' }}>
                      <div
                        ref={menuOpenId === row.id ? menuRef : undefined}
                        style={{ position: 'relative', display: 'inline-block' }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === row.id ? null : row.id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.25rem 0.5rem',
                            fontSize: '1.1rem',
                            lineHeight: 1,
                          }}
                          title="Actions"
                          aria-label="Open menu"
                        >
                          &#8942;
                        </button>
                        {menuOpenId === row.id && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '100%',
                              marginTop: '2px',
                              background: '#fff',
                              border: '1px solid #e5e7eb',
                              borderRadius: 8,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              zIndex: 100,
                              minWidth: 160,
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPinPuk(row);
                              }}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.5rem 0.75rem',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                              }}
                            >
                              Show PIN and PUK
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(null);
                                const existingKenjoId = row.kenjo_user_id ? String(row.kenjo_user_id) : '';
                                setEditRow({
                                  ...row,
                                  selectedEmployeeId: existingKenjoId || OTHER_VALUE,
                                });
                              }}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.5rem 0.75rem',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(null);
                                setDeleteRow(row);
                              }}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.5rem 0.75rem',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                color: '#b91c1c',
                              }}
                            >
                              Delete
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

      {/* PIN/PUK dialog */}
      {pinPukDialog && (
        <div
          style={modalBackdropStyle}
          onClick={() => setPinPukDialog(null)}
        >
          <div
            style={{
              ...modalCardStyle,
              padding: '1.5rem',
              borderRadius: 12,
              minWidth: 320,
              width: 'min(420px, calc(100vw - 2rem))',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>PIN and PUK — {pinPukDialog.name || '—'}</h3>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1.5rem' }}>
              <dt style={{ fontWeight: 600 }}>PIN1</dt>
              <dd style={modalValueStyle}>{pinPukDialog.pin1 ?? '—'}</dd>
              <dt style={{ fontWeight: 600 }}>PIN2</dt>
              <dd style={modalValueStyle}>{pinPukDialog.pin2 ?? '—'}</dd>
              <dt style={{ fontWeight: 600 }}>PUK1</dt>
              <dd style={modalValueStyle}>{pinPukDialog.puk1 ?? '—'}</dd>
              <dt style={{ fontWeight: 600 }}>PUK2</dt>
              <dd style={modalValueStyle}>{pinPukDialog.puk2 ?? '—'}</dd>
            </dl>
            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button type="button" className="btn-primary" onClick={() => setPinPukDialog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {editRow && createPortal(
        <div
          style={editModalBackdropStyle}
          onClick={() => !editSaving && setEditRow(null)}
        >
          <form
            style={{ ...editModalCardStyle, padding: '1.5rem', minWidth: 360 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editRow) return;
              const selectedEmployeeId = editRow.selectedEmployeeId || '';
              const selectedEmp = employeesList.find((u) => String(u._id || u.id) === selectedEmployeeId);
              const derivedName =
                selectedEmployeeId === OTHER_VALUE
                  ? (editRow.name || '').trim()
                  : (selectedEmp?.displayName || [selectedEmp?.firstName, selectedEmp?.lastName].filter(Boolean).join(' ') || '').trim();
              if (!derivedName) {
                alert(selectedEmployeeId === OTHER_VALUE ? 'Enter name or select an employee.' : 'Select an employee.');
                return;
              }
              if (!editRow.phone_number?.trim() || !editRow.sim_card_number?.trim()) {
                alert('Phone number and SIM card number are required.');
                return;
              }
              setEditSaving(true);
              try {
                const payload = {
                  name: derivedName,
                  kenjo_user_id: selectedEmployeeId === OTHER_VALUE ? null : selectedEmployeeId || null,
                  phone_number: editRow.phone_number,
                  sim_card_number: editRow.sim_card_number,
                  pin1: editRow.pin1,
                  pin2: editRow.pin2,
                  puk1: editRow.puk1,
                  puk2: editRow.puk2,
                };
                const updated = await updateO2Entry(editRow.id, payload);
                setList((prev) =>
                  prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
                );
                setEditRow(null);
              } catch (err) {
                alert(String(err?.message || err));
              } finally {
                setEditSaving(false);
              }
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Edit entry</h3>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Name</label>
              {employeesLoading ? (
                <p style={modalMutedTextStyle}>Loading employees…</p>
              ) : (
                <>
                  <select
                    value={editRow.selectedEmployeeId || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === OTHER_VALUE) {
                        setEditRow((r) => ({ ...r, selectedEmployeeId: OTHER_VALUE, kenjo_user_id: '', name: r.name || '' }));
                      } else {
                        const emp = employeesList.find((u) => String(u._id || u.id) === val);
                        const displayName = emp ? (emp.displayName || [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '') : '';
                        setEditRow((r) => ({ ...r, selectedEmployeeId: val, kenjo_user_id: val || '', name: displayName }));
                      }
                    }}
                    style={{ ...modalInputStyle, marginBottom: editRow.selectedEmployeeId === OTHER_VALUE ? '0.5rem' : 0 }}
                  >
                    <option value="">— Select —</option>
                    {(employeesList || []).map((u) => (
                      <option key={u._id || u.id} value={u._id || u.id}>
                        {u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u._id}
                      </option>
                    ))}
                    <option value={OTHER_VALUE}>Not assigned number</option>
                  </select>
                  {editRow.selectedEmployeeId === OTHER_VALUE && (
                    <input
                      type="text"
                      placeholder="Enter name manually"
                      value={editRow.name || ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, name: e.target.value }))}
                      style={{ ...modalInputStyle, marginTop: '0.5rem' }}
                    />
                  )}
                </>
              )}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Phone number *</label>
              <input
                type="text"
                value={editRow.phone_number || ''}
                onChange={(e) => setEditRow((r) => ({ ...r, phone_number: e.target.value }))}
                style={modalInputStyle}
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>SIM card number *</label>
              <input
                type="text"
                value={editRow.sim_card_number || ''}
                onChange={(e) => setEditRow((r) => ({ ...r, sim_card_number: e.target.value }))}
                style={modalInputStyle}
              />
            </div>
            <div style={{ marginBottom: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>PIN1</label>
                <input
                  type="text"
                  value={editRow.pin1 || ''}
                  onChange={(e) => setEditRow((r) => ({ ...r, pin1: e.target.value }))}
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>PIN2</label>
                <input
                  type="text"
                  value={editRow.pin2 || ''}
                  onChange={(e) => setEditRow((r) => ({ ...r, pin2: e.target.value }))}
                  style={modalInputStyle}
                />
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>PUK1</label>
                <input
                  type="text"
                  value={editRow.puk1 || ''}
                  onChange={(e) => setEditRow((r) => ({ ...r, puk1: e.target.value }))}
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>PUK2</label>
                <input
                  type="text"
                  value={editRow.puk2 || ''}
                  onChange={(e) => setEditRow((r) => ({ ...r, puk2: e.target.value }))}
                  style={modalInputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditRow(null)}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={editSaving}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
      {deleteRow && (
        <div
          style={modalBackdropStyle}
          onClick={() => setDeleteRow(null)}
        >
          <div
            style={{ ...modalCardStyle, maxWidth: 420, width: '90%', padding: '1.25rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.75rem' }}>Delete number</h3>
            <p style={deleteSummaryStyle}>
              Are you sure to delete this Number{' '}
              <strong>{deleteRow.phone_number || deleteRow.sim_card_number || deleteRow.name}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary" onClick={() => setDeleteRow(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ backgroundColor: '#b91c1c', borderColor: '#b91c1c' }}
                onClick={async () => {
                  try {
                    await deleteO2Entry(deleteRow.id);
                    setList((prev) => prev.filter((r) => r.id !== deleteRow.id));
                    setDeleteRow(null);
                  } catch (e) {
                    alert(String(e?.message || e));
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add entry dialog */}
      {addOpen && (
        <div
          style={modalBackdropStyle}
          onClick={() => {
            if (!addSaving) {
              setAddOpen(false);
              setAddForm(defaultAddForm());
            }
          }}
        >
          <form
            style={{ ...modalCardStyle, padding: '1.5rem', minWidth: 360 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddSubmit}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Add entry</h3>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Name *</label>
              {employeesLoading ? (
                <p style={modalMutedTextStyle}>Loading employees…</p>
              ) : (
                <>
                  <select
                    value={addForm.selectedEmployeeId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === OTHER_VALUE) {
                        setAddForm((f) => ({ ...f, selectedEmployeeId: OTHER_VALUE, name: '', kenjo_user_id: '' }));
                      } else {
                        const emp = employeesList.find((u) => String(u._id || u.id) === val);
                        const displayName = emp ? (emp.displayName || [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '') : '';
                        setAddForm((f) => ({ ...f, selectedEmployeeId: val, name: displayName, kenjo_user_id: val || '' }));
                      }
                    }}
                    style={{ ...modalInputStyle, marginBottom: addForm.selectedEmployeeId === OTHER_VALUE ? '0.5rem' : 0 }}
                  >
                    <option value="">— Select —</option>
                    {(employeesList || []).map((u) => (
                      <option key={u._id || u.id} value={u._id || u.id}>
                        {u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u._id}
                      </option>
                    ))}
                    <option value={OTHER_VALUE}>Not assigned number</option>
                  </select>
                  {addForm.selectedEmployeeId === OTHER_VALUE && (
                    <input
                      type="text"
                      placeholder="Enter name manually"
                      value={addForm.name}
                      onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                      style={{ ...modalInputStyle, marginTop: '0.5rem' }}
                    />
                  )}
                </>
              )}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Phone number *</label>
              <input
                type="text"
                value={addForm.phone_number}
                onChange={(e) => setAddForm((f) => ({ ...f, phone_number: e.target.value }))}
                style={modalInputStyle}
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>SIM card number *</label>
              <input
                type="text"
                value={addForm.sim_card_number}
                onChange={(e) => setAddForm((f) => ({ ...f, sim_card_number: e.target.value }))}
                style={modalInputStyle}
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>PIN1</label>
              <input
                type="text"
                value={addForm.pin1}
                onChange={(e) => setAddForm((f) => ({ ...f, pin1: e.target.value }))}
                style={modalInputStyle}
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>PIN2</label>
              <input
                type="text"
                value={addForm.pin2}
                onChange={(e) => setAddForm((f) => ({ ...f, pin2: e.target.value }))}
                style={modalInputStyle}
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>PUK1</label>
              <input
                type="text"
                value={addForm.puk1}
                onChange={(e) => setAddForm((f) => ({ ...f, puk1: e.target.value }))}
                style={modalInputStyle}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>PUK2</label>
              <input
                type="text"
                value={addForm.puk2}
                onChange={(e) => setAddForm((f) => ({ ...f, puk2: e.target.value }))}
                style={modalInputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (!addSaving) {
                    setAddOpen(false);
                    setAddForm(defaultAddForm());
                  }
                }}
                disabled={addSaving}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={addSaving}>
                {addSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
