import { useEffect, useState } from 'react';
import { getFeatureFlags, setFeatureFlag } from '../../services/settingsApi';

export default function SettingsFeaturesPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getFeatureFlags()
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key, enabled) {
    setError('');
    setFeatureFlag(key, enabled)
      .then(() => { setMessage('Saved'); setList((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f))); })
      .catch((e) => setError(e.message));
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <h3>Feature Flags</h3>
      <p className="muted">Enable or disable features without code changes.</p>
      {error && <p className="settings-msg settings-msg--err">{error}</p>}
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}

      <div className="settings-feature-list">
        {list.length === 0 ? (
          <p className="muted">No feature flags. Run seed:settings.</p>
        ) : (
          list.map((f) => (
            <div key={f.key} className="settings-feature-row">
              <div className="settings-feature-info">
                <strong>{f.label || f.key}</strong>
                {f.description && <span className="settings-feature-desc">{f.description}</span>}
              </div>
              <label className="settings-toggle">
                <input type="checkbox" checked={!!f.enabled} onChange={(e) => toggle(f.key, e.target.checked)} />
                <span>{f.enabled ? 'On' : 'Off'}</span>
              </label>
            </div>
          ))
        )}
      </div>
      <style>{`
        .settings-feature-list { display: flex; flex-direction: column; gap: 0.75rem; max-width: 560px; }
        .settings-feature-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 8px; }
        .settings-feature-info { display: flex; flex-direction: column; gap: 0.25rem; }
        .settings-feature-desc { font-size: 0.85rem; color: #6b7280; }
        .settings-toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
      `}</style>
    </>
  );
}
