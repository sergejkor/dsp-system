import React from 'react';
import PersonalQuestionnaireForm, { createEmptyPersonalQuestionnaire } from '../components/PersonalQuestionnaireForm.jsx';
import { submitPersonalQuestionnaire } from '../services/publicFormsApi.js';

export default function PersonalQuestionnairePublicPage() {
  const [form, setForm] = React.useState(createEmptyPersonalQuestionnaire());
  const [files, setFiles] = React.useState([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await submitPersonalQuestionnaire(form, files);
      setSuccess('Your form has been submitted successfully.');
      setForm(createEmptyPersonalQuestionnaire());
      setFiles([]);
    } catch (submitError) {
      setError(submitError.message || 'Failed to submit the questionnaire');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="public-page-shell">
      <div className="public-page-card">
        <header className="public-page-header">
          <h1>Personalfragebogen</h1>
          <p>Please complete the form below. This page submits directly into the internal intake workflow.</p>
        </header>

        {error ? <div className="chat-error" style={{ marginTop: '1rem' }}>{error}</div> : null}
        {success ? <div className="chat-loading" style={{ marginTop: '1rem' }}>{success}</div> : null}

        <form className="public-page-form" onSubmit={handleSubmit}>
          <PersonalQuestionnaireForm value={form} onChange={setForm} disabled={submitting} locale="de" />

          <section className="public-form-section">
            <div className="public-form-section-head">
              <h3>Attachments</h3>
              <p>Optional: add supporting files for the review team.</p>
            </div>

            <label className="public-form-field">
              <span>Files</span>
              <input
                className="public-form-control"
                type="file"
                multiple
                disabled={submitting}
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
            </label>
          </section>

          <div className="public-page-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
