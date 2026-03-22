import { useEffect, useState } from 'react';
import { useAppSettings } from '../../context/AppSettingsContext';
import { getSettingsByGroup, updateSettingsGroup, resetSettingsGroup } from '../../services/settingsApi';

export default function SettingsGeneralPage() {
  const { language, theme, setLanguage, setTheme, t } = useAppSettings();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSettingsByGroup('general')
      .then((obj) => {
        setData(obj);
        setDraft(obj);
      })
      .catch((e) => {
        // If the backend does not yet have a 'general' settings group/items,
        // we still want the page to work for language/theme toggles.
        if (e?.message && e.message.includes('Group not found')) {
          setData({});
          setDraft({});
          setError('');
        } else {
          setError(e.message);
        }
      })
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
    updateSettingsGroup('general', payload)
      .then((updated) => {
        setData(updated);
        setDraft(updated);
        setMessage('Saved.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  function handleReset() {
    if (!confirm('Restore default values for General settings?')) return;
    setSaving(true);
    resetSettingsGroup('general')
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
  // If there are no DB-backed general settings, still show appearance controls above.
  if (items.length === 0) {
    return (
      <>
        <h3>{t('general.title')}</h3>
        <p className="muted">{t('general.description')}</p>

        <div className="appearance-section card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>{t('appearance.language')} / {t('appearance.theme')}</h4>
          <div className="settings-form" style={{ maxWidth: '100%' }}>
            <label className="settings-row">
              <span className="settings-label">{t('appearance.language')}</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: '0.4rem 0.6rem', minWidth: '140px' }}>
                <option value="en">{t('appearance.english')}</option>
                <option value="de">{t('appearance.german')}</option>
              </select>
            </label>
            <label className="settings-row">
              <span className="settings-label">{t('appearance.theme')}</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value)} style={{ padding: '0.4rem 0.6rem', minWidth: '140px' }}>
                <option value="light">{t('appearance.light')}</option>
                <option value="dark">{t('appearance.dark')}</option>
              </select>
            </label>
          </div>
        </div>

        <p className="muted">No general settings stored in the database yet. You can still change language and theme above.</p>
      </>
    );
  }

  return (
    <>
      <h3>{t('general.title')}</h3>
      <p className="muted">{t('general.description')}</p>

      <div className="appearance-section card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>{t('appearance.language')} / {t('appearance.theme')}</h4>
        <div className="settings-form" style={{ maxWidth: '100%' }}>
          <label className="settings-row">
            <span className="settings-label">{t('appearance.language')}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: '0.4rem 0.6rem', minWidth: '140px' }}>
              <option value="en">{t('appearance.english')}</option>
              <option value="de">{t('appearance.german')}</option>
            </select>
          </label>
          <label className="settings-row">
            <span className="settings-label">{t('appearance.theme')}</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} style={{ padding: '0.4rem 0.6rem', minWidth: '140px' }}>
              <option value="light">{t('appearance.light')}</option>
              <option value="dark">{t('appearance.dark')}</option>
            </select>
          </label>
        </div>
      </div>

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
        .settings-label { min-width: 180px; font-size: 0.9rem; }
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
