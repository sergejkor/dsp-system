import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getKenjoHealth, getKenjoUsers, getContracts, createContract } from '../services/kenjoApi';
import { useAppSettings } from '../context/AppSettingsContext';

export default function KenjoSyncPage() {
  const { t } = useAppSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [health, setHealth] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [editingContractEnd, setEditingContractEnd] = useState(null);
  const [savingContractEnd, setSavingContractEnd] = useState(false);
  const navigate = useNavigate();

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  const formatDateDDMMYYYY = (val) => {
    if (!val || !String(val).match(/^\d{4}-\d{2}-\d{2}$/)) return null;
    const [y, m, d] = String(val).trim().split('-');
    return `${d}.${m}.${y}`;
  };

  const parseDateDDMMYYYYToISO = (val) => {
    if (!val) return null;
    const s = String(val).trim();
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  };

  const SortArrow = ({ column }) => {
    if (sortBy !== column) return <span className="kenjo-sync-sort-icon kenjo-sync-sort-icon--inactive">↕</span>;
    return <span className="kenjo-sync-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const [previousContracts, setPreviousContracts] = useState([]);

  useEffect(() => {
    if (!editingContractEnd?.userId) return;
    let isMounted = true;
    getContracts(editingContractEnd.userId)
      .then((list) => isMounted && setPreviousContracts(Array.isArray(list) ? list : []))
      .catch(() => isMounted && setPreviousContracts([]));
    return () => { isMounted = false; };
  }, [editingContractEnd?.userId]);

  const openEditContractEnd = (u) => (e) => {
    e.stopPropagation();
    setEditingContractEnd({
      userId: u._id,
      userName: u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      currentContractEnd: u.contractEnd || '',
      newContractStart: '',
      newContractEnd: '',
    });
    setPreviousContracts([]);
  };

  const handleSaveNewContract = async () => {
    if (!editingContractEnd) return;
    const startIso = parseDateDDMMYYYYToISO(editingContractEnd.newContractStart);
    if (!startIso) {
      setError(t('employeeList.dateFormatHint'));
      return;
    }
    const endIso =
      editingContractEnd.newContractEnd && parseDateDDMMYYYYToISO(editingContractEnd.newContractEnd);
    if (editingContractEnd.newContractEnd && !endIso) {
      setError(t('employeeList.dateFormatHint'));
      return;
    }
    setSavingContractEnd(true);
    setError('');
    try {
      await createContract(editingContractEnd.userId, startIso, endIso || null);
      const endDate = endIso || null;
      setUsers((prev) =>
        prev.map((u) =>
          u._id === editingContractEnd.userId ? { ...u, contractEnd: endDate } : u
        )
      );
      setEditingContractEnd(null);
      setPreviousContracts([]);
    } catch (err) {
      setError('Failed to save contract: ' + (err?.message || err));
    } finally {
      setSavingContractEnd(false);
    }
  };

  const getContractEndStyle = (contractEnd) => {
    if (!contractEnd || !String(contractEnd).match(/^\d{4}-\d{2}-\d{2}$/)) return {};
    const end = new Date(contractEnd + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (end < today) return { color: '#b91c1c' };
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    const endMonth = end.getMonth();
    const endYear = end.getFullYear();
    const isThisMonth = endYear === thisYear && endMonth === thisMonth;
    const nextMonth = thisMonth === 11 ? { month: 0, year: thisYear + 1 } : { month: thisMonth + 1, year: thisYear };
    const isNextMonth = endYear === nextMonth.year && endMonth === nextMonth.month;
    if (isThisMonth || isNextMonth) return { color: '#ca8a04' };
    return {};
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const h = await getKenjoHealth();
        if (isMounted) setHealth(h);
      } catch (e) {
        if (isMounted) setError('Kenjo health error: ' + String(e?.message || e));
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setError('');
    setLoading(true);
    getKenjoUsers()
      .then((data) => {
        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        if (isMounted) setUsers(list);
      })
      .catch((e) => {
        if (isMounted) setError('Kenjo users error: ' + String(e?.message || e));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAndSortedUsers = [...users]
    .filter((u) => {
      // text search
      if (query.trim()) {
      const q = query.toLowerCase();
      const name = (u.displayName || `${u.firstName || ''} ${u.lastName || ''}`).toLowerCase();
      const email = (u.email || '').toLowerCase();
      const role = (u.jobTitle || '').toLowerCase();
      if (!name.includes(q) && !email.includes(q) && !role.includes(q)) {
        return false;
      }
      }

      // active / inactive filter
      if (statusFilter === 'active') return !!u.isActive;
      if (statusFilter === 'inactive') return !u.isActive;
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      let av;
      let bv;
      switch (sortBy) {
        case 'pn':
          av = (a.employeeNumber || '').toString();
          bv = (b.employeeNumber || '').toString();
          break;
        case 'email':
          av = (a.email || '').toLowerCase();
          bv = (b.email || '').toLowerCase();
          break;
        case 'role':
          av = (a.jobTitle || '').toLowerCase();
          bv = (b.jobTitle || '').toLowerCase();
          break;
        case 'status':
          av = a.isActive ? 1 : 0;
          bv = b.isActive ? 1 : 0;
          break;
        case 'startDate':
          av = a.startDate || '';
          bv = b.startDate || '';
          break;
        case 'contractEnd':
          av = a.contractEnd || '';
          bv = b.contractEnd || '';
          break;
        default:
          av = (a.displayName || `${a.firstName || ''} ${a.lastName || ''}`).toLowerCase();
          bv = (b.displayName || `${b.firstName || ''} ${b.lastName || ''}`).toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

  return (
    <section className="card">
      <h2>{t('employeeList.title')}</h2>
      {error && <p className="error-text">{error}</p>}

      <div className="kenjo-sync-toolbar">
        {loading && <span className="muted">Loading…</span>}
        <input
          type="text"
          placeholder={t('employeeList.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="kenjo-sync-search-input"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="kenjo-sync-status-filter"
        >
          <option value="active">{t('employeeList.filterActiveOnly')}</option>
          <option value="inactive">{t('employeeList.filterInactiveOnly')}</option>
          <option value="all">{t('employeeList.filterAll')}</option>
        </select>
      </div>

      {users.length > 0 && (
        <div className="table-wrapper kenjo-sync-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="kenjo-sync-table">
            <thead>
              <tr>
                <th className="kenjo-sync-th-sort" onClick={() => handleSort('pn')}>
                  {t('employeeList.columns.pn')} <SortArrow column="pn" />
                </th>
                <th className="kenjo-sync-th-sort" onClick={() => handleSort('name')}>
                  {t('employeeList.columns.name')} <SortArrow column="name" />
                </th>
                <th className="kenjo-sync-th-sort" onClick={() => handleSort('email')}>
                  {t('employeeList.columns.email')} <SortArrow column="email" />
                </th>
                <th className="kenjo-sync-th-sort" onClick={() => handleSort('role')}>
                  {t('employeeList.columns.role')} <SortArrow column="role" />
                </th>
                <th className="kenjo-sync-th-sort" onClick={() => handleSort('status')}>
                  {t('employeeList.columns.active')} <SortArrow column="status" />
                </th>
                <th className="kenjo-sync-th-sort" onClick={() => handleSort('startDate')}>
                  {t('employeeList.columns.startDate')} <SortArrow column="startDate" />
                </th>
                <th className="kenjo-sync-th-sort" onClick={() => handleSort('contractEnd')}>
                  {t('employeeList.columns.contractEnd')} <SortArrow column="contractEnd" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedUsers.map((u) => (
                <tr
                  key={u._id || u.email}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    navigate('/employee', {
                      state: { kenjoEmployeeId: u._id || u.employeeId || u.email },
                    })
                  }
                >
                  <td>{u.employeeNumber ?? '—'}</td>
                  <td>{u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td>{u.email ?? '—'}</td>
                  <td>{u.jobTitle ?? '—'}</td>
                  <td>{u.isActive ? t('employeeList.active') : t('employeeList.inactive')}</td>
                  <td>{formatDateDDMMYYYY(u.startDate) ?? '—'}</td>
                  <td style={getContractEndStyle(u.contractEnd)} onClick={(e) => e.stopPropagation()}>
                    <span>{formatDateDDMMYYYY(u.contractEnd) ?? t('employeeList.unbefristet')}</span>
                    <button
                      type="button"
                      className="kenjo-sync-edit-contract"
                      onClick={openEditContractEnd(u)}
                      title={t('employeeList.columns.contractEnd')}
                      aria-label={t('employeeList.columns.contractEnd')}
                    >
                      ✎
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {users.length === 0 && !loading && !error && (
        <p className="muted">{t('employeeList.noUsers')}</p>
      )}

      {editingContractEnd && (
        <div className="kenjo-sync-modal-overlay" onClick={() => !savingContractEnd && setEditingContractEnd(null)}>
          <div className="kenjo-sync-modal kenjo-sync-modal-contracts" onClick={(e) => e.stopPropagation()}>
            <h3>{t('employeeList.newContractTitle')}</h3>
            <p className="kenjo-sync-modal-meta">{editingContractEnd.userName}</p>

            {previousContracts.length > 0 && (
              <div className="kenjo-sync-modal-section">
                <h4>{t('employeeList.previousContracts')}</h4>
                <ul className="kenjo-sync-contract-list">
                  {previousContracts.map((c, i) => (
                    <li key={c.id || i}>
                      {formatDateDDMMYYYY(c.start_date) ?? c.start_date} – {c.end_date ? (formatDateDDMMYYYY(c.end_date) ?? c.end_date) : t('employeeList.unbefristet')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {previousContracts.length >= 2 && (
              <p className="kenjo-sync-modal-warning">
                {t('employeeList.nextShouldBeUnbefristet')}
              </p>
            )}

            <div className="kenjo-sync-modal-section">
              <h4>{t('employeeList.newContractSection')}</h4>
              <label>
                {t('employeeList.startDateLabel')}
                <input
                  type="text"
                  placeholder="DD.MM.YYYY"
                  value={editingContractEnd.newContractStart || ''}
                  onChange={(e) =>
                    setEditingContractEnd((prev) => (prev ? { ...prev, newContractStart: e.target.value } : null))
                  }
                  disabled={savingContractEnd}
                />
              </label>
              <label>
                {t('employeeList.endDateLabel')}
                <input
                  type="text"
                  placeholder="DD.MM.YYYY"
                  value={editingContractEnd.newContractEnd || ''}
                  onChange={(e) =>
                    setEditingContractEnd((prev) => (prev ? { ...prev, newContractEnd: e.target.value } : null))
                  }
                  disabled={savingContractEnd}
                />
              </label>
              <p className="kenjo-sync-modal-hint">{t('employeeList.dateFormatHint')}</p>
            </div>

            <div className="kenjo-sync-modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingContractEnd(null)}
                disabled={savingContractEnd}
              >
                {t('employeeList.cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveNewContract}
                disabled={savingContractEnd}
              >
                {savingContractEnd ? t('employeeList.savingDots') : t('employeeList.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .kenjo-sync-table-wrap { overflow-x: auto; }
        .kenjo-sync-table {
          width: 100%;
          border-collapse: collapse;
        }
        .kenjo-sync-table th,
        .kenjo-sync-table td {
          padding: 0.6rem 1.25rem;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .kenjo-sync-table th:not(:last-child),
        .kenjo-sync-table td:not(:last-child) {
          padding-right: 1.5rem;
        }
        .kenjo-sync-table th {
          background: rgba(148, 163, 184, 0.12);
          font-weight: 600;
          white-space: nowrap;
        }
        .kenjo-sync-th-sort {
          cursor: pointer;
          user-select: none;
        }
        .kenjo-sync-th-sort:hover {
          background: rgba(148, 163, 184, 0.2);
        }
        .kenjo-sync-sort-icon {
          margin-left: 0.25rem;
          opacity: 1;
        }
        .kenjo-sync-sort-icon--inactive {
          opacity: 0.35;
        }
        .kenjo-sync-table td {
          vertical-align: top;
        }
        .kenjo-sync-table th:nth-child(1), .kenjo-sync-table td:nth-child(1) { min-width: 4.5rem; }
        .kenjo-sync-table th:nth-child(2), .kenjo-sync-table td:nth-child(2) { min-width: 11rem; }
        .kenjo-sync-table th:nth-child(3), .kenjo-sync-table td:nth-child(3) { min-width: 16rem; }
        .kenjo-sync-table th:nth-child(4), .kenjo-sync-table td:nth-child(4) { min-width: 9rem; }
        .kenjo-sync-table th:nth-child(5), .kenjo-sync-table td:nth-child(5) { min-width: 5.5rem; }
        .kenjo-sync-table th:nth-child(6), .kenjo-sync-table td:nth-child(6) { min-width: 7rem; }
        .kenjo-sync-table th:nth-child(7), .kenjo-sync-table td:nth-child(7) { min-width: 7rem; }
        .kenjo-sync-table td span + .kenjo-sync-edit-contract { margin-left: 0.35rem; }
        .kenjo-sync-edit-contract {
          background: none;
          border: none;
          padding: 0.2rem;
          cursor: pointer;
          font-size: 0.9rem;
          color: var(--text-muted);
          vertical-align: middle;
        }
        .kenjo-sync-edit-contract:hover {
          color: #3b82f6;
        }
        .kenjo-sync-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .kenjo-sync-modal {
          background: var(--bg-card);
          color: var(--text);
          padding: 1.5rem;
          border-radius: 8px;
          min-width: 280px;
          box-shadow: 0 4px 20px var(--shadow);
          border: 1px solid var(--border);
        }
        .kenjo-sync-modal h3 { margin: 0 0 0.5rem 0; font-size: 1.1rem; }
        .kenjo-sync-modal-meta { margin: 0 0 1rem 0; color: var(--text-muted); font-size: 0.9rem; }
        .kenjo-sync-modal label { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; font-size: 0.9rem; }
        .kenjo-sync-modal input[type="date"] { padding: 0.4rem 0.6rem; }
        .kenjo-sync-modal-hint { margin: 0 0 1rem 0; font-size: 0.8rem; color: var(--text-muted); }
        .kenjo-sync-modal-section { margin-bottom: 1rem; }
        .kenjo-sync-modal-section h4 { margin: 0 0 0.5rem 0; font-size: 0.95rem; font-weight: 600; }
        .kenjo-sync-contract-list { margin: 0 0 0.5rem 0; padding-left: 1.25rem; font-size: 0.9rem; }
        .kenjo-sync-modal-warning { margin: 0 0 1rem 0; padding: 0.5rem 0.75rem; background: rgba(251, 191, 36, 0.12); color: #fbbf24; border-radius: 6px; font-size: 0.9rem; font-weight: 500; }
        .kenjo-sync-modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
        .btn-primary { padding: 0.5rem 1rem; background: #3b82f6; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
        .btn-secondary { padding: 0.5rem 1rem; background: #6b7280; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
      `}</style>
    </section>
  );
}

