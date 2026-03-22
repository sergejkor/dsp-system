import { useEffect, useState } from 'react';
import { getSecuritySettings, updateSecuritySettings } from '../../services/settingsApi';

export default function SettingsSecurityPage() {
  const [data, setData] = useState({});
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSecuritySettings()
      .then((obj) => {
        setData(obj);
        setDraft(obj);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const entries = Object.entries(draft || {}).filter(([, v]) => v && typeof v === 'object' && 'label' in v);
  const hasChanges = entries.some(([k]) => (draft[k]?.value !== undefined && draft[k]?.value !== data[k]?.value));

  function handleSave() {
    const payload = {};
    entries.forEach(([key]) => { if (draft[key]?.value !== data[key]?.value) payload[key] = draft[key]?.value; });
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    setError('');
    updateSecuritySettings(payload)
      .then((updated) => {
        setData(updated);
        setDraft(updated);
        setMessage('Security settings saved.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  if (loading) return <p className="muted">Loading…</p>;

  if (entries.length === 0) return <p className="muted">No security settings. Run seed:settings.</p>;

  return (
    <>
      <h3>Security</h3>
      <p className="muted">Password policy, session timeout, lockout, and related options.</p>
      {error && <p className="settings-msg settings-msg--err">{error}</p>}
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}

      <div className="settings-form">
        {entries.map(([key, item]) => {
          const val = item.value;
          const isNum = typeof val === 'number';
          return (
            <label key={key} className="settings-row">
              <span className="settings-label">{item.label || key.replace(/_/g, ' ')}</span>
              <input
                type={isNum ? 'number' : 'text'}
                value={isNum ? (val ?? '') : (typeof val === 'object' ? JSON.stringify(val) : (val ?? ''))}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({ ...d, [key]: { ...d[key], value: isNum ? (v === '' ? null : Number(v)) : v } }));
                }}
              />
            </label>
          );
        })}
        <div className="settings-actions">
          <button type="button" onClick={handleSave} disabled={!hasChanges || saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <style>{`
        .settings-form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 520px; }
        .settings-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .settings-label { min-width: 220px; font-size: 0.9rem; text-transform: capitalize; }
        .settings-row input { flex: 1; min-width: 120px; padding: 0.4rem; }
        .settings-actions { margin-top: 1rem; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
      `}</style>
    </>
  );
}
