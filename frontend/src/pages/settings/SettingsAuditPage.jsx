import { useEffect, useState } from 'react';
import { getAuditLog } from '../../services/settingsApi';
import { formatPortalDateTime } from '../../utils/portalLocale.js';

export default function SettingsAuditPage() {
  const [result, setResult] = useState({ items: [], limit: 100, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setLoading(true);
    getAuditLog({ limit: 100, offset: 0, entity_type: entityType || undefined })
      .then(setResult)
      .catch(() => setResult({ items: [] }))
      .finally(() => setLoading(false));
  }, [entityType]);

  const items = result.items || [];

  return (
    <>
      <h3>Audit Log</h3>
      <p className="muted">Track who changed what and when.</p>

      <div className="settings-toolbar">
        <label>
          Entity type
          {' '}
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">All</option>
            <option value="user">User</option>
            <option value="role">Role</option>
            <option value="role_permissions">Role permissions</option>
            <option value="settings">Settings</option>
            <option value="feature_flag">Feature flag</option>
            <option value="security_settings">Security</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Entity</th>
                <th>ID</th>
                <th>Action</th>
                <th>Changed by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="settings-empty">No audit entries.</td></tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id}>
                    <td>{a.changed_at ? formatPortalDateTime(a.changed_at) : '—'}</td>
                    <td>{a.entity_type}</td>
                    <td>{a.entity_id}</td>
                    <td>{a.action}</td>
                    <td>{a.changed_by ?? '—'}</td>
                    <td><button type="button" className="settings-act" onClick={() => setDetail(a)}>Details</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="settings-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h4>Audit entry</h4>
              <button type="button" className="settings-modal-close" onClick={() => setDetail(null)}>×</button>
            </div>
            <div className="settings-modal-body code-box">
              <pre>{JSON.stringify({ entity_type: detail.entity_type, entity_id: detail.entity_id, action: detail.action, changed_by: detail.changed_by, changed_at: detail.changed_at, old_value: detail.old_value_json ?? detail.old_value, new_value: detail.new_value_json ?? detail.new_value }, null, 2)}</pre>
            </div>
          </div>
          <style>{`
            .settings-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
            .settings-modal { background: #fff; border-radius: 12px; max-width: 560px; width: 90%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
            .settings-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; }
            .settings-modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
            .settings-modal-body { padding: 1rem; }
            .settings-modal-body pre { margin: 0; font-size: 0.8rem; overflow: auto; }
          `}</style>
        </div>
      )}

      <style>{`
        .settings-toolbar { margin-bottom: 1rem; }
        .settings-table-wrap { overflow: auto; }
        .settings-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .settings-table th, .settings-table td { border: 1px solid #e5e7eb; padding: 0.4rem 0.6rem; text-align: left; }
        .settings-table th { background: #f9fafb; }
        .settings-empty { color: #6b7280; text-align: center; padding: 1rem !important; }
        .settings-act { padding: 0.2rem 0.4rem; font-size: 0.8rem; cursor: pointer; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
      `}</style>
    </>
  );
}
