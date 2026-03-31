import { useEffect, useMemo, useState } from 'react';
import { getSettingsByGroup, updateSettingsGroup, resetSettingsGroup } from '../../services/settingsApi';

const REQUIRED_ITEMS = {
  notification_emails: {
    key: 'notification_emails',
    label: 'Notification e-mail(s)',
    value_type: 'string',
    value: '',
    description: 'Comma-separated e-mail addresses that receive a notification for each new Schadenmeldung submission.',
  },
  notification_subject: {
    key: 'notification_subject',
    label: 'Notification e-mail subject',
    value_type: 'string',
    value: 'New Schadenmeldung: {{driverName}}',
    description: 'Subject template for the outgoing notification e-mail.',
  },
  notification_body: {
    key: 'notification_body',
    label: 'Notification e-mail text',
    value_type: 'string',
    value:
      'A new Schadenmeldung has been submitted.\n\nReport ID: {{reportId}}\nDriver: {{driverName}}\nReporter: {{reporterName}}\nEmail: {{email}}\nPhone: {{phone}}\nLicense plate: {{licensePlate}}\nIncident date: {{incidentDate}}\nReceived at: {{createdAt}}\n\nOpen review page: {{reviewUrl}}',
    description: 'Body template for the outgoing notification e-mail.',
  },
};

const AVAILABLE_VARIABLES = [
  '{{reportId}}',
  '{{driverName}}',
  '{{reporterName}}',
  '{{email}}',
  '{{phone}}',
  '{{licensePlate}}',
  '{{incidentDate}}',
  '{{createdAt}}',
  '{{reviewUrl}}',
];

function withRequiredItems(obj) {
  const base = obj || {};
  const out = { ...base };
  Object.entries(REQUIRED_ITEMS).forEach(([key, fallback]) => {
    if (!out[key]) out[key] = { ...fallback };
  });
  return out;
}

export default function SettingsSchadenmeldungPage() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSettingsByGroup('schadenmeldung')
      .then((obj) => {
        const merged = withRequiredItems(obj);
        setData(merged);
        setDraft(merged);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = useMemo(
    () => data && Object.keys(draft).some((key) => draft[key]?.value !== data[key]?.value),
    [data, draft]
  );

  function setItemValue(key, value) {
    setDraft((current) => ({
      ...current,
      [key]: { ...(current[key] || REQUIRED_ITEMS[key]), value },
    }));
  }

  function handleSave() {
    const payload = {};
    Object.entries(draft).forEach(([key, item]) => {
      if (item?.value !== data?.[key]?.value) payload[key] = item?.value;
    });
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    updateSettingsGroup('schadenmeldung', payload)
      .then((updated) => {
        const merged = withRequiredItems(updated);
        setData(merged);
        setDraft(merged);
        setMessage('Schadenmeldung settings saved.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  function handleReset() {
    if (!confirm('Restore default values for Schadenmeldung settings?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    resetSettingsGroup('schadenmeldung')
      .then((updated) => {
        const merged = withRequiredItems(updated);
        setData(merged);
        setDraft(merged);
        setMessage('Defaults restored.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  if (loading) return <p className="muted">Loading...</p>;
  if (error) return <p className="settings-msg settings-msg--err">{error}</p>;

  return (
    <>
      <h3>Schadenmeldung</h3>
      <p className="muted">Configure who receives damage report notifications and what the incoming e-mail looks like.</p>
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}

      <div className="settings-form">
        <label className="settings-row settings-row--stack">
          <span className="settings-label">{draft.notification_emails?.label}</span>
          <input
            type="text"
            value={draft.notification_emails?.value ?? ''}
            placeholder="info@alfamile.com, office@alfamile.com"
            onChange={(e) => setItemValue('notification_emails', e.target.value)}
            disabled={saving}
          />
          <small className="muted">{draft.notification_emails?.description}</small>
        </label>

        <label className="settings-row settings-row--stack">
          <span className="settings-label">{draft.notification_subject?.label}</span>
          <input
            type="text"
            value={draft.notification_subject?.value ?? ''}
            onChange={(e) => setItemValue('notification_subject', e.target.value)}
            disabled={saving}
          />
          <small className="muted">{draft.notification_subject?.description}</small>
        </label>

        <label className="settings-row settings-row--stack">
          <span className="settings-label">{draft.notification_body?.label}</span>
          <textarea
            rows={10}
            value={draft.notification_body?.value ?? ''}
            onChange={(e) => setItemValue('notification_body', e.target.value)}
            disabled={saving}
          />
          <small className="muted">{draft.notification_body?.description}</small>
        </label>

        <div className="settings-token-box">
          <strong>Available variables</strong>
          <div className="settings-token-list">
            {AVAILABLE_VARIABLES.map((token) => (
              <code key={token}>{token}</code>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button type="button" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={handleReset} disabled={saving}>
            Restore defaults
          </button>
        </div>
      </div>

      <style>{`
        .settings-form { display: flex; flex-direction: column; gap: 0.9rem; max-width: 760px; }
        .settings-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .settings-row--stack { align-items: stretch; flex-direction: column; gap: 0.4rem; }
        .settings-label { min-width: 220px; font-size: 0.9rem; font-weight: 600; }
        .settings-row input[type=text], .settings-row textarea {
          width: 100%;
          min-width: 120px;
          padding: 0.55rem 0.7rem;
          font: inherit;
        }
        .settings-row textarea { resize: vertical; min-height: 180px; }
        .settings-token-box {
          border: 1px solid #dbe2ea;
          border-radius: 12px;
          padding: 0.85rem 1rem;
          background: #f8fafc;
        }
        .settings-token-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 0.6rem;
        }
        .settings-token-list code {
          background: #e5eefc;
          color: #1d4ed8;
          padding: 0.2rem 0.45rem;
          border-radius: 8px;
        }
        .settings-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
      `}</style>
    </>
  );
}
