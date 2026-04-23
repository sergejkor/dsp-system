import { useEffect, useMemo, useState } from 'react';
import { getPushDevicesOverview } from '../../services/settingsApi.js';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function StatusBadge({ active, trueLabel = 'Yes', falseLabel = 'No' }) {
  return (
    <span className={`settings-badge ${active ? 'settings-badge--active' : 'settings-badge--inactive'}`}>
      {active ? trueLabel : falseLabel}
    </span>
  );
}

export default function SettingsPushDevicesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    setError('');
    getPushDevicesOverview()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((loadError) => setError(loadError.message || 'Failed to load FleetCheck device status'))
      .finally(() => setLoading(false));
  }, []);

  const filteredRows = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !query || [
        row.display_name,
        row.employee_ref,
        row.transporter_id,
        row.kenjo_user_id,
      ].some((value) => String(value || '').toLowerCase().includes(query));

      if (!matchesSearch) return false;
      if (filter === 'installed') return row.app_installed === true;
      if (filter === 'notifications-enabled') return row.notifications_enabled === true;
      if (filter === 'missing-notifications') return row.app_installed === true && row.notifications_enabled !== true;
      if (filter === 'no-app') return row.app_installed !== true;
      return true;
    });
  }, [filter, rows, search]);

  const summary = useMemo(() => {
    const installed = rows.filter((row) => row.app_installed === true).length;
    const notificationsEnabled = rows.filter((row) => row.notifications_enabled === true).length;
    return {
      total: rows.length,
      installed,
      notificationsEnabled,
      withoutApp: rows.length - installed,
      withoutNotifications: installed - notificationsEnabled,
    };
  }, [rows]);

  return (
    <>
      <h3>FleetCheck app status</h3>
      <p className="muted">
        Check which active drivers already installed FleetCheck and which of them allowed push notifications.
      </p>

      {error ? <p className="settings-msg settings-msg--err">{error}</p> : null}

      <div className="settings-push-summary">
        <div className="settings-push-card">
          <strong>{summary.total}</strong>
          <span>Active drivers</span>
        </div>
        <div className="settings-push-card">
          <strong>{summary.installed}</strong>
          <span>App installed</span>
        </div>
        <div className="settings-push-card">
          <strong>{summary.notificationsEnabled}</strong>
          <span>Notifications enabled</span>
        </div>
        <div className="settings-push-card">
          <strong>{summary.withoutNotifications}</strong>
          <span>Installed but notifications off</span>
        </div>
      </div>

      <div className="settings-toolbar">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="settings-search"
          placeholder="Search by driver, employee ref, transporter ID…"
        />
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All active drivers</option>
          <option value="installed">App installed</option>
          <option value="notifications-enabled">Notifications enabled</option>
          <option value="missing-notifications">Installed, notifications off</option>
          <option value="no-app">No app installed</option>
        </select>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Employee ref</th>
                <th>Transporter ID</th>
                <th>App installed</th>
                <th>Notifications enabled</th>
                <th>Devices</th>
                <th>Platform</th>
                <th>Language</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="settings-empty">No matching drivers.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.kenjo_user_id || row.employee_ref || row.transporter_id || row.display_name}>
                    <td>{row.display_name || '—'}</td>
                    <td>{row.employee_ref || '—'}</td>
                    <td>{row.transporter_id || '—'}</td>
                    <td><StatusBadge active={row.app_installed === true} /></td>
                    <td><StatusBadge active={row.notifications_enabled === true} /></td>
                    <td>{Number(row.device_count || 0)}</td>
                    <td>{row.platforms || '—'}</td>
                    <td>{row.locales || '—'}</td>
                    <td>{formatDateTime(row.last_seen_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .settings-push-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
          margin: 1rem 0;
        }
        .settings-push-card {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.9rem 1rem;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #f8fafc;
        }
        .settings-push-card strong {
          font-size: 1.25rem;
          line-height: 1.1;
        }
        .settings-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .settings-search {
          width: min(420px, 100%);
          padding: 0.5rem 0.65rem;
        }
        .settings-table-wrap {
          overflow: auto;
        }
        .settings-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
        }
        .settings-table th,
        .settings-table td {
          border: 1px solid #e5e7eb;
          padding: 0.5rem 0.65rem;
          text-align: left;
          vertical-align: middle;
        }
        .settings-table th {
          background: #f9fafb;
        }
        .settings-empty {
          color: #6b7280;
          text-align: center;
          padding: 1rem !important;
        }
        .settings-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .settings-badge--active {
          background: #d1fae5;
          color: #065f46;
        }
        .settings-badge--inactive {
          background: #e5e7eb;
          color: #374151;
        }
      `}</style>
    </>
  );
}
