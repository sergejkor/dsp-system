import { useState } from 'react';
import PersonalQuestionnaireForm, { createEmptyPersonalQuestionnaire } from '../components/PersonalQuestionnaireForm.jsx';
import { submitPersonalQuestionnaire } from '../services/publicFormsApi.js';

export default function PersonalQuestionnairePublicPage() {
  const [form, setForm] = useState(createEmptyPersonalQuestionnaire);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(null);
    try {
      const result = await submitPersonalQuestionnaire(form, []);
      setSuccess(result?.submission || { id: null });
      setForm(createEmptyPersonalQuestionnaire());
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
            <h1>Personalfragebogen</h1>
            <p>Please fill in your details. After submission, our team will review the data and continue onboarding.</p>
          </div>
        </header>

        {error && <div className="analytics-error">{error}</div>}
        {success && (
          <div className="cars-message cars-message--success">
            Personalfragebogen submitted successfully{success.id ? ` (ID ${success.id})` : ''}.
          </div>
        )}

        <form onSubmit={handleSubmit} className="public-page-form">
          <PersonalQuestionnaireForm value={form} onChange={setForm} disabled={saving} />

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
