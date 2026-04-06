import { useEffect, useMemo, useState } from 'react';
import { getSettingsByGroup, updateSettingsGroup, resetSettingsGroup } from '../../services/settingsApi';

const REQUIRED_ITEMS = {
  notification_emails: {
    key: 'notification_emails',
    label: 'Notification e-mail(s)',
    value_type: 'string',
    value: '',
    description: 'Comma-separated e-mail addresses that receive a notification for each new Personalfragebogen submission.',
  },
  notification_subject: {
    key: 'notification_subject',
    label: 'Notification e-mail subject',
    value_type: 'string',
    value: 'New Personalfragebogen: {{firstName}} {{lastName}}',
    description: 'Subject template for the outgoing notification e-mail.',
  },
  notification_body: {
    key: 'notification_body',
    label: 'Notification e-mail text',
    value_type: 'string',
    value:
      'A new Personalfragebogen has been submitted.\n\nSubmission ID: {{submissionId}}\nName: {{firstName}} {{lastName}}\nEmail: {{email}}\nPhone: {{phone}}\nStart date: {{startDate}}\nReceived at: {{createdAt}}\n\nOpen review page: {{reviewUrl}}',
    description: 'Body template for the outgoing notification e-mail.',
  },
  pdf_company_name: {
    key: 'pdf_company_name',
    label: 'PDF company name',
    value_type: 'string',
    value: 'AlfaMile GmbH',
    description: 'Company name shown in the Personalfragebogen PDF header.',
  },
  pdf_title: {
    key: 'pdf_title',
    label: 'PDF title',
    value_type: 'string',
    value: 'Personalfragebogen',
    description: 'Main title shown in the Personalfragebogen PDF header.',
  },
  pdf_font_family: {
    key: 'pdf_font_family',
    label: 'PDF font family',
    value_type: 'string',
    value: 'Segoe UI',
    description: 'Canvas font family used when rebuilding the PDF.',
  },
  pdf_header_title_size: {
    key: 'pdf_header_title_size',
    label: 'PDF header title size',
    value_type: 'number',
    value: 40,
    description: 'Font size of the main PDF title.',
  },
  pdf_body_font_size: {
    key: 'pdf_body_font_size',
    label: 'PDF body font size',
    value_type: 'number',
    value: 15,
    description: 'Base font size used in PDF content blocks.',
  },
  pdf_header_color_start: {
    key: 'pdf_header_color_start',
    label: 'PDF header color start',
    value_type: 'string',
    value: '#173d7a',
    description: 'Gradient start color for the PDF header.',
  },
  pdf_header_color_end: {
    key: 'pdf_header_color_end',
    label: 'PDF header color end',
    value_type: 'string',
    value: '#2f7ec9',
    description: 'Gradient end color for the PDF header.',
  },
  pdf_accent_color: {
    key: 'pdf_accent_color',
    label: 'PDF accent color',
    value_type: 'string',
    value: '#2f7ec9',
    description: 'Accent color used for section markers in the PDF.',
  },
};

const AVAILABLE_VARIABLES = [
  '{{submissionId}}',
  '{{firstName}}',
  '{{lastName}}',
  '{{fullName}}',
  '{{email}}',
  '{{phone}}',
  '{{startDate}}',
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

  return (
    <>
      <h3>Personalfragebogen</h3>
      <p className="muted">Configure who receives notifications and what the incoming notification e-mail looks like.</p>
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}

      <div className="settings-form">
        <label className="settings-row settings-row--stack">
          <span className="settings-label">{draft.notification_emails?.label}</span>
          <input
            type="text"
            value={draft.notification_emails?.value ?? ''}
            placeholder="hr@alfamile.com, office@alfamile.com"
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

        <div className="settings-token-box">
          <strong>Personalfragebogen PDF layout</strong>
          <p className="muted" style={{ marginTop: '0.4rem', marginBottom: '0.8rem' }}>
            These settings are used when the review page rebuilds and downloads the Personalfragebogen PDF.
          </p>

          <label className="settings-row settings-row--stack">
            <span className="settings-label">{draft.pdf_company_name?.label}</span>
            <input
              type="text"
              value={draft.pdf_company_name?.value ?? ''}
              onChange={(e) => setItemValue('pdf_company_name', e.target.value)}
              disabled={saving}
            />
            <small className="muted">{draft.pdf_company_name?.description}</small>
          </label>

          <label className="settings-row settings-row--stack">
            <span className="settings-label">{draft.pdf_title?.label}</span>
            <input
              type="text"
              value={draft.pdf_title?.value ?? ''}
              onChange={(e) => setItemValue('pdf_title', e.target.value)}
              disabled={saving}
            />
            <small className="muted">{draft.pdf_title?.description}</small>
          </label>

          <label className="settings-row settings-row--stack">
            <span className="settings-label">{draft.pdf_font_family?.label}</span>
            <input
              type="text"
              value={draft.pdf_font_family?.value ?? ''}
              onChange={(e) => setItemValue('pdf_font_family', e.target.value)}
              disabled={saving}
            />
            <small className="muted">{draft.pdf_font_family?.description}</small>
          </label>

          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}>
              <span className="settings-label">{draft.pdf_header_title_size?.label}</span>
              <input
                type="number"
                min="16"
                max="72"
                value={draft.pdf_header_title_size?.value ?? 40}
                onChange={(e) => setItemValue('pdf_header_title_size', e.target.value)}
                disabled={saving}
              />
              <small className="muted">{draft.pdf_header_title_size?.description}</small>
            </label>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}>
              <span className="settings-label">{draft.pdf_body_font_size?.label}</span>
              <input
                type="number"
                min="10"
                max="28"
                value={draft.pdf_body_font_size?.value ?? 15}
                onChange={(e) => setItemValue('pdf_body_font_size', e.target.value)}
                disabled={saving}
              />
              <small className="muted">{draft.pdf_body_font_size?.description}</small>
            </label>
          </div>

          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}>
              <span className="settings-label">{draft.pdf_header_color_start?.label}</span>
              <input
                type="text"
                value={draft.pdf_header_color_start?.value ?? ''}
                onChange={(e) => setItemValue('pdf_header_color_start', e.target.value)}
                disabled={saving}
              />
              <small className="muted">{draft.pdf_header_color_start?.description}</small>
            </label>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}>
              <span className="settings-label">{draft.pdf_header_color_end?.label}</span>
              <input
                type="text"
                value={draft.pdf_header_color_end?.value ?? ''}
                onChange={(e) => setItemValue('pdf_header_color_end', e.target.value)}
                disabled={saving}
              />
              <small className="muted">{draft.pdf_header_color_end?.description}</small>
            </label>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}>
              <span className="settings-label">{draft.pdf_accent_color?.label}</span>
              <input
                type="text"
                value={draft.pdf_accent_color?.value ?? ''}
                onChange={(e) => setItemValue('pdf_accent_color', e.target.value)}
                disabled={saving}
              />
              <small className="muted">{draft.pdf_accent_color?.description}</small>
            </label>
          </div>
        </div>

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
