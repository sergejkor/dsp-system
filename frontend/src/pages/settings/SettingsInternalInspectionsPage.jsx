import { useEffect, useMemo, useState } from 'react';
import { getSettingsByGroup, updateSettingsGroup } from '../../services/settingsApi';

function itemValue(source, key, fallback = '') {
  return source?.[key]?.value ?? fallback;
}

export default function SettingsInternalInspectionsPage() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    enabled: true,
    reminderMessage: '',
    reminderStartTime: '10:00',
    reminderIntervalMinutes: 60,
    publicBaseUrl: 'https://fleetcheck.alfamile.com',
    defaultCountryCode: '+49',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSettingsByGroup('internal_inspections')
      .then((obj) => {
        setData(obj);
        setForm({
          enabled: itemValue(obj, 'enabled', true) !== false,
          reminderMessage: itemValue(obj, 'reminder_message', ''),
          reminderStartTime: itemValue(obj, 'reminder_start_time', '10:00'),
          reminderIntervalMinutes: Number(itemValue(obj, 'reminder_interval_minutes', 60) || 60),
          publicBaseUrl: itemValue(obj, 'public_base_url', 'https://fleetcheck.alfamile.com'),
          defaultCountryCode: itemValue(obj, 'default_country_code', '+49'),
        });
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load internal inspection settings'))
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = useMemo(() => {
    if (!data) return false;
    return (
      form.enabled !== (itemValue(data, 'enabled', true) !== false)
      || form.reminderMessage !== itemValue(data, 'reminder_message', '')
      || form.reminderStartTime !== itemValue(data, 'reminder_start_time', '10:00')
      || Number(form.reminderIntervalMinutes || 0) !== Number(itemValue(data, 'reminder_interval_minutes', 60) || 60)
      || form.publicBaseUrl !== itemValue(data, 'public_base_url', 'https://fleetcheck.alfamile.com')
      || form.defaultCountryCode !== itemValue(data, 'default_country_code', '+49')
    );
  }, [data, form]);

  function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    setError('');
    setMessage('');

    updateSettingsGroup('internal_inspections', {
      enabled: form.enabled,
      reminder_message: form.reminderMessage,
      reminder_start_time: form.reminderStartTime,
      reminder_interval_minutes: Number(form.reminderIntervalMinutes || 60),
      public_base_url: form.publicBaseUrl,
      default_country_code: form.defaultCountryCode,
    })
      .then((updated) => {
        setData(updated);
        setMessage('Internal inspection reminder settings saved.');
      })
      .catch((saveError) => setError(saveError.message || 'Failed to save internal inspection settings'))
      .finally(() => setSaving(false));
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error && !data) return <p className="settings-msg settings-msg--err">{error}</p>;

  return (
    <>
      <h3>Internal inspections</h3>
      <p className="muted">
        Configure same-day WhatsApp reminders for drivers who are marked with Upwards Control in Car Planning.
      </p>
      {message ? <p className="settings-msg settings-msg--ok">{message}</p> : null}
      {error ? <p className="settings-msg settings-msg--err">{error}</p> : null}

      <div className="settings-form settings-form--internal-inspections">
        <label className="settings-row settings-row--toggle">
          <span className="settings-label">Enable reminders</span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
          />
        </label>

        <label className="settings-row settings-row--stacked">
          <span className="settings-label">WhatsApp message</span>
          <textarea
            value={form.reminderMessage}
            onChange={(event) => setForm((current) => ({ ...current, reminderMessage: event.target.value }))}
            rows={5}
          />
          <small className="muted">
            Available placeholders: <code>{'{{driverName}}'}</code>, <code>{'{{licensePlate}}'}</code>, <code>{'{{vin}}'}</code>, <code>{'{{inspectionUrl}}'}</code>, <code>{'{{planDate}}'}</code>
          </small>
        </label>

        <div className="settings-inline-grid">
          <label className="settings-row settings-row--stacked">
            <span className="settings-label">Reminder start time</span>
            <input
              type="time"
              value={form.reminderStartTime}
              onChange={(event) => setForm((current) => ({ ...current, reminderStartTime: event.target.value }))}
            />
          </label>

          <label className="settings-row settings-row--stacked">
            <span className="settings-label">Reminder interval</span>
            <input
              type="number"
              min="5"
              max="720"
              value={form.reminderIntervalMinutes}
              onChange={(event) => setForm((current) => ({ ...current, reminderIntervalMinutes: Number(event.target.value || 0) }))}
            />
          </label>
        </div>

        <div className="settings-inline-grid">
          <label className="settings-row settings-row--stacked">
            <span className="settings-label">FleetCheck public URL</span>
            <input
              type="text"
              value={form.publicBaseUrl}
              onChange={(event) => setForm((current) => ({ ...current, publicBaseUrl: event.target.value }))}
              placeholder="https://fleetcheck.alfamile.com"
            />
          </label>

          <label className="settings-row settings-row--stacked">
            <span className="settings-label">Default country code</span>
            <input
              type="text"
              value={form.defaultCountryCode}
              onChange={(event) => setForm((current) => ({ ...current, defaultCountryCode: event.target.value }))}
              placeholder="+49"
            />
          </label>
        </div>

        <div className="settings-preview-card">
          <strong>Preview</strong>
          <p style={{ margin: '0.45rem 0 0' }}>
            {form.reminderMessage
              .replaceAll('{{driverName}}', 'John Driver')
              .replaceAll('{{licensePlate}}', 'MA-AB 1234')
              .replaceAll('{{vin}}', 'W1VTESTVIN1234567')
              .replaceAll('{{planDate}}', '2026-04-13')
              .replaceAll('{{inspectionUrl}}', `${form.publicBaseUrl?.replace(/\/+$/, '') || 'https://fleetcheck.alfamile.com'}/fleet-check?vin=W1VTESTVIN1234567`)}
          </p>
        </div>

        <div className="settings-actions">
          <button type="button" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <style>{`
        .settings-form--internal-inspections {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 760px;
        }
        .settings-row--toggle {
          justify-content: space-between;
          align-items: center;
        }
        .settings-row--stacked {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.45rem;
        }
        .settings-row--stacked textarea,
        .settings-row--stacked input {
          width: 100%;
          padding: 0.7rem 0.8rem;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          font: inherit;
        }
        .settings-inline-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1rem;
        }
        .settings-preview-card {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 0.9rem 1rem;
          background: #f8fafc;
        }
      `}</style>
    </>
  );
}
