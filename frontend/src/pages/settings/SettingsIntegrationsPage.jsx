import { useEffect, useState } from 'react';
import { getIntegrations, getIntegration, updateIntegration, testIntegration } from '../../services/settingsApi';
import { formatPortalDateTime } from '../../utils/portalLocale.js';

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
          list.map((integration) => (
            <div key={integration.integration_key || integration.key} className="settings-integration-card">
              <div className="settings-integration-header">
                <strong>{integration.label || integration.integration_key || integration.key}</strong>
                <span className="settings-badge settings-badge--active">{integration.is_enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <p className="settings-integration-meta">
                Last sync:
                {' '}
                {integration.last_sync_at ? formatPortalDateTime(integration.last_sync_at) : '—'}
                {' · '}
                Status:
                {' '}
                {integration.last_sync_status || '—'}
              </p>
              <div className="settings-integration-actions">
                <button type="button" className="settings-act" onClick={() => setModal({ key: integration.integration_key || integration.key, label: integration.label })}>Edit</button>
                <button type="button" className="settings-act" onClick={() => handleTest(integration.integration_key || integration.key)}>Test connection</button>
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
      .then((configValue) => setConfig(configValue.public_config_json || configValue))
      .catch(() => setConfig({}))
      .finally(() => setLoading(false));
  }, [integrationKey]);

  function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    onError('');
    updateIntegration(integrationKey, config)
      .then(onSaved)
      .catch((error) => { onError(error.message); setSaving(false); });
  }

  if (loading) return <div className="settings-modal-backdrop"><div className="settings-modal"><p>Loading…</p></div></div>;

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>{label || integrationKey}</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="settings-modal-body">
          <label className="settings-form-field">
            <span>Config JSON</span>
            <textarea
              className="settings-textarea"
              rows={14}
              value={JSON.stringify(config, null, 2)}
              onChange={(event) => {
                try {
                  setConfig(JSON.parse(event.target.value || '{}'));
                } catch {
                  onError('Invalid JSON');
                }
              }}
            />
          </label>
          <div className="settings-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
