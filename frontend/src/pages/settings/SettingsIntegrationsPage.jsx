import { useEffect, useState } from 'react';
import { getIntegrations, getIntegration, updateIntegration, testIntegration } from '../../services/settingsApi';

export default function SettingsIntegrationsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getIntegrations()
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleTest(key) {
    testIntegration(key).then(() => setMessage(`Test requested for ${key}`)).catch((e) => setError(e.message));
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <h3>Integrations</h3>
      <p className="muted">Configure and monitor external integrations. Credentials are not shown.</p>
      {error && <p className="settings-msg settings-msg--err">{error}</p>}
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}

      <div className="settings-integration-cards">
        {list.length === 0 ? (
          <p className="muted">No integrations. Run seed:settings.</p>
        ) : (
          list.map((i) => (
            <div key={i.integration_key || i.key} className="settings-integration-card">
              <div className="settings-integration-header">
                <strong>{i.label || i.integration_key || i.key}</strong>
                <span className="settings-badge settings-badge--active">{i.is_enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <p className="settings-integration-meta">Last sync: {i.last_sync_at ? new Date(i.last_sync_at).toLocaleString() : '—'} · Status: {i.last_sync_status || '—'}</p>
              <div className="settings-integration-actions">
                <button type="button" className="settings-act" onClick={() => setModal({ key: i.integration_key || i.key, label: i.label })}>Edit</button>
                <button type="button" className="settings-act" onClick={() => handleTest(i.integration_key || i.key)}>Test connection</button>
              </div>
            </div>
          ))
        )}
      </div>

      {modal && (
        <IntegrationEditModal
          integrationKey={modal.key}
          label={modal.label}
          onClose={() => setModal(null)}
          onSaved={() => { setMessage('Saved'); setModal(null); getIntegrations().then(setList); }}
          onError={setError}
        />
      )}

      <style>{`
        .settings-integration-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
        .settings-integration-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 1rem; }
        .settings-integration-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .settings-integration-meta { font-size: 0.85rem; color: #6b7280; margin: 0 0 0.75rem 0; }
        .settings-integration-actions { display: flex; gap: 0.5rem; }
        .settings-badge { padding: 2px 8px; border-radius: 6px; font-size: 0.8rem; }
        .settings-badge--active { background: #d1fae5; color: #065f46; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
        .settings-act { padding: 0.2rem 0.4rem; font-size: 0.8rem; cursor: pointer; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
      `}</style>
    </>
  );
}

function IntegrationEditModal({ integrationKey, label, onClose, onSaved, onError }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getIntegration(integrationKey)
      .then((c) => setConfig(c.public_config_json || c))
      .catch(() => setConfig({}))
      .finally(() => setLoading(false));
  }, [integrationKey]);

  function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    onError('');
    updateIntegration(integrationKey, config)
      .then(onSaved)
      .catch((e) => { onError(e.message); setSaving(false); });
  }

  if (loading) return <div className="settings-modal-backdrop"><div className="settings-modal"><p>Loading…</p></div></div>;

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>Edit — {label || integrationKey}</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="settings-modal-body">
          <p className="muted">Public config only. Secrets are managed server-side.</p>
          <label>Base URL <input value={config.base_url || ''} onChange={(e) => setConfig({ ...config, base_url: e.target.value })} /></label>
          <label>Environment <input value={config.environment || ''} onChange={(e) => setConfig({ ...config, environment: e.target.value })} /></label>
          <label>Enabled <input type="checkbox" checked={!!config.is_enabled} onChange={(e) => setConfig({ ...config, is_enabled: e.target.checked })} /></label>
          <div className="settings-modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
      <style>{`
        .settings-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .settings-modal { background: #fff; border-radius: 12px; max-width: 440px; width: 90%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .settings-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; }
        .settings-modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .settings-modal-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .settings-modal-body label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
        .settings-modal-body input { padding: 0.4rem; }
        .settings-modal-footer { margin-top: 0.5rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
      `}</style>
    </div>
  );
}
