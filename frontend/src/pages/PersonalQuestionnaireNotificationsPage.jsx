import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPersonalQuestionnaires } from '../services/intakeApi.js';

function displayName(row) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || row?.email || `Submission ${row?.id}`;
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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listPersonalQuestionnaires('all')
      .then((list) => {
        if (cancelled) return;
        setRows(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load Personalfragebogen notifications');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="intake-page">
      <header className="analytics-header">
        <div>
          <h1>Personalfragebogen Notifications</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            All incoming Personalfragebogen submissions. New submissions are marked with a red indicator until you open them.
          </p>
        </div>
      </header>

      {error && <div className="analytics-error">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="muted">Loading notifications...</p>
        ) : rows.length === 0 ? (
          <p className="muted">No Personalfragebogen submissions yet.</p>
        ) : (
          <div className="notification-list">
            {rows.map((row) => (
              <Link
                key={row.id}
                to={`/personal-fragebogen-review?id=${row.id}`}
                className={`notification-item ${row.is_new ? 'is-new' : ''}`}
              >
                <div className="notification-item-main">
                  <div className="notification-item-title-row">
                    {row.is_new && <span className="notification-new-dot" aria-hidden="true" />}
                    <strong>{displayName(row)}</strong>
                  </div>
                  <span className="muted small">{row.email || 'No email'} · {row.status}</span>
                </div>
                <span className="notification-item-time">{formatDateTime(row.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
