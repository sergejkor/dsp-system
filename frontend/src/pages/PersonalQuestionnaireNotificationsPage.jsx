import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listDamageReports, listPersonalQuestionnaires } from '../services/intakeApi.js';

function displayPersonalName(row) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || row?.email || `Submission ${row?.id}`;
}

function displayDamageName(row) {
  return row?.driver_name || row?.reporter_name || `Report ${row?.id}`;
}

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

export default function PersonalQuestionnaireNotificationsPage() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canOpenPersonal = isSuperAdmin || hasPermission('page_employees');
  const canOpenDamage = isSuperAdmin || hasPermission('page_damages');
  const [personalRows, setPersonalRows] = useState([]);
  const [damageRows, setDamageRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      canOpenPersonal ? listPersonalQuestionnaires('all') : Promise.resolve([]),
      canOpenDamage ? listDamageReports('all') : Promise.resolve([]),
    ])
      .then(([personalList, damageList]) => {
        if (cancelled) return;
        setPersonalRows(Array.isArray(personalList) ? personalList : []);
        setDamageRows(Array.isArray(damageList) ? damageList : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load notifications');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canOpenPersonal, canOpenDamage]);

  const hasNotifications = useMemo(
    () => personalRows.length > 0 || damageRows.length > 0,
    [personalRows.length, damageRows.length]
  );

  return (
    <section className="intake-page">
      <header className="analytics-header">
        <div>
          <h1>Notifications</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            All incoming Personalfragebogen and Schadenmeldung submissions. New entries stay marked with a red indicator until you open them.
          </p>
        </div>
      </header>

      {error && <div className="analytics-error">{error}</div>}

      <div className="dashboard-two-col">
        {canOpenPersonal && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Personalfragebogen</h3>
            {loading ? (
              <p className="muted">Loading notifications...</p>
            ) : personalRows.length === 0 ? (
              <p className="muted">No Personalfragebogen submissions yet.</p>
            ) : (
              <div className="notification-list">
                {personalRows.map((row) => (
                  <Link
                    key={`personal-${row.id}`}
                    to={`/personal-fragebogen-review?id=${row.id}`}
                    className={`notification-item ${row.is_new ? 'is-new' : ''}`}
                  >
                    <div className="notification-item-main">
                      <div className="notification-item-title-row">
                        {row.is_new && <span className="notification-new-dot" aria-hidden="true" />}
                        <strong>{displayPersonalName(row)}</strong>
                      </div>
                      <span className="muted small">{row.email || 'No email'} · {row.status}</span>
                    </div>
                    <span className="notification-item-time">{formatDateTime(row.created_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {canOpenDamage && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Schadenmeldung</h3>
            {loading ? (
              <p className="muted">Loading notifications...</p>
            ) : damageRows.length === 0 ? (
              <p className="muted">No Schadenmeldung submissions yet.</p>
            ) : (
              <div className="notification-list">
                {damageRows.map((row) => (
                  <Link
                    key={`damage-${row.id}`}
                    to={`/schadenmeldung-review?id=${row.id}`}
                    className={`notification-item ${row.is_new ? 'is-new' : ''}`}
                  >
                    <div className="notification-item-main">
                      <div className="notification-item-title-row">
                        {row.is_new && <span className="notification-new-dot" aria-hidden="true" />}
                        <strong>{displayDamageName(row)}</strong>
                      </div>
                      <span className="muted small">{row.license_plate || 'No plate'} · {row.status}</span>
                    </div>
                    <span className="notification-item-time">{formatDateTime(row.created_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!loading && !hasNotifications && !error && (
        <div className="card">
          <p className="muted">No incoming notifications yet.</p>
        </div>
      )}
    </section>
  );
}
