import { useEffect, useMemo, useState } from 'react';
import {
  getCreateDocumentTemplates,
  uploadCreateDocumentTemplate,
  updateCreateDocumentTemplate,
  deleteCreateDocumentTemplate,
  downloadCreateDocumentTemplate,
} from '../../services/settingsApi';

const PLACEHOLDER_TOKENS = [
  '{{firstName}}',
  '{{lastName}}',
  '{{fullName}}',
  '{{address}}',
  '{{street}}',
  '{{houseNumber}}',
  '{{postalCode}}',
  '{{city}}',
  '{{country}}',
  '{{contractStart}}',
  '{{contractEnd}}',
  '{{today}}',
];

function formatDateTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${d}.${m}.${y} ${hh}:${mm}`;
  }
  return String(value);
}

function formatFileSize(size) {
  const bytes = Number(size) || 0;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function SettingsCreateDocumentsPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    documentKey: '',
    description: '',
    requiresManualDates: false,
    file: null,
  });

  async function loadTemplates() {
    setLoading(true);
    setError('');
    try {
      const rows = await getCreateDocumentTemplates();
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  const canUpload = useMemo(() => !!form.name.trim() && !!form.file && !saving, [form, saving]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!canUpload) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await uploadCreateDocumentTemplate({
        name: form.name,
        documentKey: form.documentKey,
        description: form.description,
        requiresManualDates: form.requiresManualDates,
        file: form.file,
      });
      setForm({ name: '', documentKey: '', description: '', requiresManualDates: false, file: null });
      const fileInput = document.getElementById('create-document-template-file');
      if (fileInput) fileInput.value = '';
      setMessage('Template uploaded.');
      await loadTemplates();
    } catch (e2) {
      setError(e2.message || 'Failed to upload template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this document template?')) return;
    setError('');
    setMessage('');
    try {
      await deleteCreateDocumentTemplate(id);
      setTemplates((current) => current.filter((row) => row.id !== id));
      setMessage('Template deleted.');
    } catch (e) {
      setError(e.message || 'Failed to delete template');
    }
  }

  async function handleDownload(template) {
    setError('');
    try {
      const blob = await downloadCreateDocumentTemplate(template.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = template.file_name || `template-${template.id}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Failed to download template');
    }
  }

  async function handleToggleRequiresManualDates(template, checked) {
    setError('');
    setMessage('');
    try {
      const updated = await updateCreateDocumentTemplate(template.id, { requiresManualDates: checked });
      setTemplates((current) => current.map((row) => (row.id === template.id ? { ...row, ...updated } : row)));
      setMessage('Template updated.');
    } catch (e) {
      setError(e.message || 'Failed to update template');
    }
  }

  return (
    <>
      <h3>Create Document</h3>
      <p className="muted">
        Upload template files for employee documents. These templates will later be used on the Create Document page to
        generate a ready-to-download contract or agreement with employee data already filled in.
      </p>

      {message && <p className="settings-msg settings-msg--ok">{message}</p>}
      {error && <p className="settings-msg settings-msg--err">{error}</p>}

      <form className="settings-form" onSubmit={handleUpload}>
        <label className="settings-row settings-row--stack">
          <span className="settings-label">Template name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
            placeholder="Fixed-term contract"
            disabled={saving}
          />
        </label>

        <label className="settings-row settings-row--stack">
          <span className="settings-label">Template key / document code</span>
          <input
            type="text"
            value={form.documentKey}
            onChange={(e) => setForm((current) => ({ ...current, documentKey: e.target.value }))}
            placeholder="employment_contract_fixed_term"
            disabled={saving}
          />
          <small className="muted">Optional stable key for later mapping in the Create Document page.</small>
        </label>

        <label className="settings-row settings-row--stack">
          <span className="settings-label">Explanation / notes</span>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
            placeholder="Use this sample for fixed-term contracts with start and end date."
            disabled={saving}
          />
        </label>

        <label className="settings-row settings-row--stack">
          <span className="settings-label">Template file</span>
          <input
            id="create-document-template-file"
            type="file"
            accept=".docx"
            onChange={(e) => setForm((current) => ({ ...current, file: e.target.files?.[0] || null }))}
            disabled={saving}
          />
          <small className="muted">
            Generation currently supports DOCX templates only.
          </small>
        </label>

        <label className="settings-row" style={{ alignItems: 'center', gap: '0.6rem' }}>
          <input
            type="checkbox"
            checked={form.requiresManualDates}
            onChange={(e) => setForm((current) => ({ ...current, requiresManualDates: e.target.checked }))}
            disabled={saving}
          />
          <span className="settings-label" style={{ minWidth: 0 }}>
            Need manual dates "From / To" on Create Document page
          </span>
        </label>

        <div className="settings-actions">
          <button type="submit" disabled={!canUpload}>
            {saving ? 'Uploading…' : 'Upload template'}
          </button>
        </div>
      </form>

      <div className="settings-token-box" style={{ marginTop: '1.25rem' }}>
        <strong>How to prepare the sample document</strong>
        <p className="muted" style={{ margin: '0.65rem 0 0' }}>
          Put placeholders directly inside the document text where employee data should appear. When the Create Document
          page generates a file, these placeholders will be replaced with values from the employee profile and from the
          selected contract dates.
        </p>
        <div className="settings-token-list">
          {PLACEHOLDER_TOKENS.map((token) => (
            <code key={token}>{token}</code>
          ))}
        </div>
        <p className="muted" style={{ margin: '0.85rem 0 0' }}>
          Example: write <code>{'{{fullName}}'}</code> where the employee name should appear,{' '}
          <code>{'{{contractStart}}'}</code> and <code>{'{{contractEnd}}'}</code> for contract dates, and{' '}
          <code>{'{{today}}'}</code> at the bottom for today&apos;s date.
        </p>
        <p className="muted" style={{ margin: '0.85rem 0 0' }}>
          Important: keep each placeholder as one plain text block in Word. Do not split a placeholder across different
          colors, bold parts or text boxes, otherwise the generator may not detect it correctly.
        </p>
      </div>

      <div className="settings-template-list" style={{ marginTop: '1.25rem' }}>
        <h4 style={{ marginBottom: '0.75rem' }}>Uploaded templates</h4>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="muted">No document templates uploaded yet.</p>
        ) : (
          <div className="settings-template-grid">
            {templates.map((template) => (
              <div key={template.id} className="settings-template-card">
                <div className="settings-template-card__head">
                  <div>
                    <strong>{template.name}</strong>
                    {template.document_key ? <div className="muted small">{template.document_key}</div> : null}
                  </div>
                </div>
                <div className="muted small" style={{ marginTop: '0.45rem' }}>
                  File: {template.file_name}
                </div>
                <div className="muted small">Size: {formatFileSize(template.file_size)}</div>
                <div className="muted small">Updated: {formatDateTime(template.updated_at)}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem' }}>
                  <input
                    type="checkbox"
                    checked={template.requires_manual_dates === true}
                    onChange={(e) => handleToggleRequiresManualDates(template, e.target.checked)}
                  />
                  <span className="muted small">Need manual dates "From / To"</span>
                </label>
                {template.description ? <p style={{ marginTop: '0.7rem' }}>{template.description}</p> : null}
                <div className="settings-actions">
                  <button type="button" onClick={() => handleDownload(template)}>
                    Download
                  </button>
                  <button type="button" onClick={() => handleDelete(template.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .settings-form { display: flex; flex-direction: column; gap: 0.9rem; max-width: 760px; }
        .settings-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .settings-row--stack { align-items: stretch; flex-direction: column; gap: 0.4rem; }
        .settings-label { min-width: 220px; font-size: 0.9rem; font-weight: 600; }
        .settings-row input[type=text], .settings-row textarea, .settings-row input[type=file] {
          width: 100%;
          min-width: 120px;
          padding: 0.55rem 0.7rem;
          font: inherit;
        }
        .settings-row textarea { resize: vertical; min-height: 120px; }
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
        .settings-actions { display: flex; gap: 0.5rem; margin-top: 0.9rem; flex-wrap: wrap; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
        .settings-template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 0.9rem;
        }
        .settings-template-card {
          border: 1px solid #dbe2ea;
          border-radius: 14px;
          padding: 0.95rem 1rem;
          background: #fff;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }
        .settings-template-card__head {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: flex-start;
        }
      `}</style>
    </>
  );
}
