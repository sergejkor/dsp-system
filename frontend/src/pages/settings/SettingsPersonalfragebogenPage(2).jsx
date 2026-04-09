import { useEffect, useState } from 'react';
import { getSettingsByGroup, updateSettingsGroup, resetSettingsGroup } from '../../services/settingsApi';

const DEFAULT_KEY = 'notification_emails';

function withRequiredItems(obj) {
  const base = obj || {};
  const out = { ...base };
  if (!out[DEFAULT_KEY]) {
    out[DEFAULT_KEY] = {
      key: DEFAULT_KEY,
      label: 'Notification e-mail(s)',
      value_type: 'string',
      value: '',
      description: 'Comma-separated e-mail addresses that receive a notification for each new Personalfragebogen submission.',
    };
  }
  return out;
}

export default function SettingsPersonalfragebogenPage() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSettingsByGroup('personalfragebogen')
      .then((obj) => {
        const merged = withRequiredItems(obj);
        setData(merged);
        setDraft(merged);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = data && Object.keys(draft).some((k) => draft[k]?.value !== data[k]?.value);

  function handleSave() {
    const payload = {};
    Object.entries(draft).forEach(([key, item]) => {
      if (item?.value !== data?.[key]?.value) payload[key] = item?.value;
    });
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    updateSettingsGroup('personalfragebogen', payload)
      .then((updated) => {
        const merged = withRequiredItems(updated);
        setData(merged);
        setDraft(merged);
        setMessage('Personalfragebogen settings saved.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  function handleReset() {
    if (!confirm('Restore default values for Personalfragebogen settings?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    resetSettingsGroup('personalfragebogen')
      .then((updated) => {
        const merged = withRequiredItems(updated);
        setData(merged);
        setDraft(merged);
        setMessage('Defaults restored.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="settings-msg settings-msg--err">{error}</p>;

  const item = draft[DEFAULT_KEY];

  return (
    <>
      <h3>Personalfragebogen</h3>
      <p className="muted">Configure where notifications for new Personalfragebogen submissions are sent.</p>
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}
      <div className="settings-form">
        <label className="settings-row settings-row--stack">
          <span className="settings-label">{item?.label || 'Notification e-mail(s)'}</span>
          <input
            type="text"
            value={item?.value ?? ''}
            placeholder="hr@alfamile.com, office@alfamile.com"
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                [DEFAULT_KEY]: { ...(current[DEFAULT_KEY] || {}), ...item, value: e.target.value },
              }))
            }
            disabled={saving}
          />
          <small className="muted">
            {item?.description || 'Use commas to separate multiple e-mail addresses.'}
          </small>
        </label>
        <div className="settings-actions">
          <button type="button" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={handleReset} disabled={saving}>
            Restore defaults
          </button>
        </div>
      </div>
      <style>{`
        .settings-form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 640px; }
        .settings-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .settings-row--stack { align-items: stretch; flex-direction: column; gap: 0.4rem; }
        .settings-label { min-width: 220px; font-size: 0.9rem; font-weight: 600; }
        .settings-row input[type=text] { width: 100%; min-width: 120px; padding: 0.55rem 0.7rem; }
        .settings-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
      `}</style>
    </>
  );
}
