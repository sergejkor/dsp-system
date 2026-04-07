import { useEffect, useMemo, useState } from 'react';
import DamageReportForm, { createEmptyDamageReport } from '../components/DamageReportForm.jsx';
import { getDamageReportOptions, submitDamageReport } from '../services/publicFormsApi.js';

function formatFiles(files) {
  if (!files?.length) return 'No files selected';
  return files.map((file) => file.name).join(', ');
}

export default function DamageReportPublicPage() {
  const [form, setForm] = useState(createEmptyDamageReport);
  const [files, setFiles] = useState([]);
  const [options, setOptions] = useState({ drivers: [], cars: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const fileLabel = useMemo(() => formatFiles(files), [files]);

  useEffect(() => {
    let cancelled = false;
    getDamageReportOptions()
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch(() => {
        if (!cancelled) setOptions({ drivers: [], cars: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(null);
    try {
      const result = await submitDamageReport(form, files);
      setSuccess(result?.report || { id: null });
      setForm(createEmptyDamageReport());
      setFiles([]);
    } catch (err) {
      setError(err?.message || 'Submission failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="public-page-shell">
      <div className="public-page-card">
        <header className="public-page-header">
          <div>
            <h1>Schadenmeldung</h1>
            <p>Use this form to report a damage case. The report will appear in the system for internal follow-up.</p>
          </div>
        </header>

        {error && <div className="analytics-error">{error}</div>}
        {success && (
          <div className="cars-message cars-message--success">
            Schadenmeldung submitted successfully{success.id ? ` (ID ${success.id})` : ''}.
          </div>
        )}

        <form onSubmit={handleSubmit} className="public-page-form">
          <DamageReportForm value={form} onChange={setForm} disabled={saving} options={options} />

          <section className="public-form-section">
            <h3>Attachments</h3>
            <label className="public-form-field">
              <span>Upload photos or files</span>
              <input
                className="public-form-control"
                type="file"
                multiple
                disabled={saving}
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </label>
            <p className="muted small">{fileLabel}</p>
          </section>

          <div className="public-page-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
