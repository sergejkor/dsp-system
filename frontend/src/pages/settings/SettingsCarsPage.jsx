import { useEffect, useState } from 'react';
import { getSettingsByGroup, updateSettingsGroup } from '../../services/settingsApi';

export default function SettingsCarsPage() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSettingsByGroup('cars')
      .then((obj) => { setData(obj); setDraft(obj); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = data && Object.keys(draft).some((k) => draft[k]?.value !== data[k]?.value);
  const items = Object.entries(draft || {});

  function handleSave() {
    const payload = {};
    items.forEach(([key, item]) => { if (item?.value !== data?.[key]?.value) payload[key] = item?.value; });
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    updateSettingsGroup('cars', payload).then((updated) => { setData(updated); setDraft(updated); setMessage('Saved.'); }).catch((e) => setError(e.message)).finally(() => setSaving(false));
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="settings-msg settings-msg--err">{error}</p>;
  if (items.length === 0) return <p className="muted">No cars/fleet settings defined.</p>;

  return (
    <>
      <h3>Cars / Fleet Settings</h3>
      <p className="muted">Fleet-related rules, maintenance intervals, expiry warnings.</p>
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}
      <div className="settings-form">
        {items.map(([key, item]) => (
          <label key={key} className="settings-row">
            <span className="settings-label">{item.label || key}</span>
            {item.value_type === 'number' && <input type="number" value={item.value ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...item, value: e.target.value === '' ? null : Number(e.target.value) } }))} />}
            {item.value_type === 'boolean' && <input type="checkbox" checked={!!item.value} onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...item, value: e.target.checked } }))} />}
            {(item.value_type === 'string' || !item.value_type) && <input type="text" value={item.value ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...item, value: e.target.value } }))} />}
            {item.unit && <span className="settings-unit">{item.unit}</span>}
          </label>
        ))}
        <div className="settings-actions"><button type="button" onClick={handleSave} disabled={!hasChanges || saving}>{saving ? 'Saving…' : 'Save'}</button></div>
      </div>
      <style>{`.settings-form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 520px; } .settings-row { display: flex; align-items: center; gap: 0.5rem; } .settings-label { min-width: 220px; } .settings-actions { margin-top: 1rem; } .settings-msg { padding: 0.5rem; border-radius: 6px; } .settings-msg--ok { background: #d1fae5; color: #065f46; } .settings-msg--err { background: #fee2e2; color: #991b1b; }`}</style>
    </>
  );
}
