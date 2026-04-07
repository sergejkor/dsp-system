import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDamageReports, listPersonalQuestionnaires } from '../services/intakeApi.js';

function formatDateTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  const hours = String(dt.getHours()).padStart(2, '0');
  const minutes = String(dt.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function titleForItem(item) {
  if (item.type === 'damage') {
    return (
      String(item?.row?.reporter_name || '').trim() ||
      String(item?.row?.driver_name || '').trim() ||
      `Damage report ${item?.row?.id}`
    );
  }
  const row = item?.row || {};
  return [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || row?.email || `Submission ${row?.id}`;
}

export default function PersonalQuestionnaireNotificationsPage() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const canEmployees = isSuperAdmin || hasPermission('page_employees');
    const canDamages = isSuperAdmin || hasPermission('page_damages');

    const personalPromise = canEmployees ? listPersonalQuestionnaires('all') : Promise.resolve([]);
    const damagePromise = canDamages ? listDamageReports('all') : Promise.resolve([]);

    Promise.allSettled([personalPromise, damagePromise])
      .then(([personalResult, damageResult]) => {
        if (cancelled) return;

        const personalRows =
          personalResult.status === 'fulfilled' && Array.isArray(personalResult.value)
            ? personalResult.value.map((row) => ({
                id: `personal-${row.id}`,
                type: 'personal',
                row,
                is_new: !!row.is_new,
                created_at: row.created_at,
              }))
            : [];

        const damageRows =
          damageResult.status === 'fulfilled' && Array.isArray(damageResult.value)
            ? damageResult.value.map((row) => ({
                id: `damage-${row.id}`,
                type: 'damage',
                row,
                is_new: !!row.is_new,
                created_at: row.created_at,
              }))
            : [];

        const merged = [...personalRows, ...damageRows].sort((a, b) => {
          const aTime = new Date(a.created_at || 0).getTime() || 0;
          const bTime = new Date(b.created_at || 0).getTime() || 0;
          return bTime - aTime;
        });

        setRows(merged);
        window.dispatchEvent(new CustomEvent('intake-summary-refresh'));

        const personalError = personalResult.status === 'rejected' ? personalResult.reason?.message : '';
        const damageError = damageResult.status === 'rejected' ? damageResult.reason?.message : '';
        const err = [personalError, damageError].filter(Boolean).join(' | ');
        setError(err || '');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasPermission, isSuperAdmin]);

  return (
    <section className="intake-page">
      <header className="analytics-header">
        <div>
          <h1>Notifications</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Incoming Personalfragebogen and Schadenmeldung submissions. New submissions are marked with a red indicator until you open them.
          </p>
        </div>
      </header>

      {error && <div className="analytics-error">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="muted">Loading notifications...</p>
        ) : rows.length === 0 ? (
          <p className="muted">No incoming notifications yet.</p>
        ) : (
          <div className="notification-list">
            {rows.map((item) => {
              const row = item.row || {};
              const isDamage = item.type === 'damage';
              const target = isDamage ? `/schadenmeldung-review?id=${row.id}` : `/personal-fragebogen-review?id=${row.id}`;
              const subtitle = isDamage
                ? `${row.driver_name || 'No driver'} · ${row.status || 'submitted'}`
                : `${row.email || 'No email'} · ${row.status || 'submitted'}`;
              return (
                <Link
                  key={item.id}
                  to={target}
                  className={`notification-item ${item.is_new ? 'is-new' : ''}`}
                >
                  <div className="notification-item-main">
                    <div className="notification-item-title-row">
                      {item.is_new && <span className="notification-new-dot" aria-hidden="true" />}
                      <strong>{titleForItem(item)}</strong>
                    </div>
                    <span className="muted small">
                      {isDamage ? 'Schadenmeldung' : 'Personalfragebogen'} · {subtitle}
                    </span>
                  </div>
                  <span className="notification-item-time">{formatDateTime(row.created_at)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

