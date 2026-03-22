import { useEffect, useState } from 'react';
import { getSettingsByGroup, updateSettingsGroup, resetSettingsGroup } from '../../services/settingsApi';

export default function SettingsPayrollPage() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSettingsByGroup('payroll')
      .then((obj) => {
        setData(obj);
        setDraft(obj);
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
    updateSettingsGroup('payroll', payload)
      .then((updated) => {
        setData(updated);
        setDraft(updated);
        setMessage('Payroll settings saved.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  function handleReset() {
    if (!confirm('Restore default payroll values?')) return;
    setSaving(true);
    resetSettingsGroup('payroll')
      .then((updated) => {
        setData(updated);
        setDraft(updated);
        setMessage('Defaults restored.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="settings-msg settings-msg--err">{error}</p>;

  const items = Object.entries(draft || {});
  if (items.length === 0) return <p className="muted">No payroll settings. Run seed:settings to create defaults.</p>;

  return (
    <>
      <h3>Payroll Settings</h3>
      <p className="muted">Calculation format, currency, lock day, export behavior.</p>
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}
      <div className="settings-form">
        {items.map(([key, item]) => (
          <label key={key} className="settings-row">
            <span className="settings-label">{item.label || key}</span>
            {item.value_type === 'number' && (
              <input
                type="number"
                value={item.value ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...item, value: e.target.value === '' ? null : Number(e.target.value) } }))}
              />
            )}
            {item.value_type === 'boolean' && (
              <input
                type="checkbox"
                checked={!!item.value}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...item, value: e.target.checked } }))}
              />
            )}
            {(item.value_type === 'string' || !item.value_type) && (
              <input
                type="text"
                value={item.value ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...item, value: e.target.value } }))}
              />
            )}
            {item.unit && <span className="settings-unit">{item.unit}</span>}
          </label>
        ))}
        <div className="settings-actions">
          <button type="button" onClick={handleSave} disabled={!hasChanges || saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={handleReset} disabled={saving}>Restore defaults</button>
        </div>
      </div>
      <style>{`
        .settings-form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 520px; }
        .settings-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .settings-label { min-width: 220px; font-size: 0.9rem; }
        .settings-row input[type=text], .settings-row input[type=number] { flex: 1; min-width: 120px; padding: 0.4rem; }
        .settings-unit { color: #6b7280; font-size: 0.85rem; }
        .settings-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
      `}</style>
    </>
  );
}
