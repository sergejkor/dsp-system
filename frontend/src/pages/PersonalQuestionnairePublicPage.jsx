import { useMemo, useState } from 'react';
import PersonalQuestionnaireForm, { createEmptyPersonalQuestionnaire } from '../components/PersonalQuestionnaireForm(3).jsx';
import {
  PERSONAL_QUESTIONNAIRE_LOCALES,
  getPersonalQuestionnaireCopy,
  getPersonalQuestionnaireGermanLanguageValue,
  isPersonalQuestionnaireRtl,
  normalizePersonalQuestionnaireLocale,
} from '../components/personalQuestionnaireI18n.js';
import { submitPersonalQuestionnaire } from '../services/publicFormsApi.js';

export default function PersonalQuestionnairePublicPage() {
  const [form, setForm] = useState(createEmptyPersonalQuestionnaire);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [uiLocale, setUiLocale] = useState(null);
  const [pendingLocale, setPendingLocale] = useState('en');
  const activeLocale = normalizePersonalQuestionnaireLocale(uiLocale || pendingLocale || 'en');
  const copy = useMemo(() => getPersonalQuestionnaireCopy(activeLocale), [activeLocale]);

  function updateUiLocale(nextLocale, { initializeFormLanguage = false } = {}) {
    const normalized = normalizePersonalQuestionnaireLocale(nextLocale);
    setUiLocale(normalized);
    setPendingLocale(normalized);
    if (initializeFormLanguage) {
      setForm((current) => ({
        ...(current || createEmptyPersonalQuestionnaire()),
        account: {
          ...((current && current.account) || {}),
          language: ((current && current.account && current.account.language) || '').trim()
            || getPersonalQuestionnaireGermanLanguageValue(normalized),
        },
      }));
    }
  }

  function handleFormKeyDown(event) {
    if (
      event.key === 'Enter'
      && event.target?.tagName !== 'TEXTAREA'
      && event.target?.type !== 'submit'
      && event.target?.type !== 'button'
    ) {
      event.preventDefault();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(null);
    try {
      const result = await submitPersonalQuestionnaire(form, []);
      setSuccess(result?.submission || { id: null });
      setForm({
        ...createEmptyPersonalQuestionnaire(),
        account: {
          email: '',
          language: getPersonalQuestionnaireGermanLanguageValue(activeLocale),
        },
      });
    } catch (err) {
      setError(err?.message || 'Submission failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="public-page-shell" dir={isPersonalQuestionnaireRtl(activeLocale) ? 'rtl' : 'ltr'}>
      {!uiLocale && (
        <div className="public-language-modal-backdrop">
          <div className="public-language-modal" dir={isPersonalQuestionnaireRtl(pendingLocale) ? 'rtl' : 'ltr'}>
            <h2>{copy.modalTitle}</h2>
            <p>{copy.modalBody}</p>
            <p className="public-language-modal-prompt">{copy.modalPrompt}</p>

            <div className="public-language-grid">
              {PERSONAL_QUESTIONNAIRE_LOCALES.map((option) => (
                <button
                  key={option.locale}
                  type="button"
                  className={`public-language-option ${pendingLocale === option.locale ? 'is-active' : ''}`}
                  onClick={() => setPendingLocale(option.locale)}
                >
                  {option.nativeLabel}
                </button>
              ))}
            </div>

            <div className="public-page-actions public-language-modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => updateUiLocale(pendingLocale, { initializeFormLanguage: true })}
              >
                {copy.continue}
              </button>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="public-language-modal-backdrop">
          <div className="public-language-modal" dir={isPersonalQuestionnaireRtl(activeLocale) ? 'rtl' : 'ltr'}>
            <h2>{copy.statusTitle}</h2>
            <p><strong>{copy.thankYouTitle}</strong></p>
            <p>{copy.thankYouBody1}</p>
            <p>{copy.thankYouBody2}</p>

            <div className="public-page-actions public-language-modal-actions">
              <button type="button" className="btn-primary" onClick={() => setSuccess(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="public-page-card">
        <header className="public-page-header">
          <div>
            <h1>Personalfragebogen</h1>
            <p>{copy.pageSubtitle}</p>
          </div>

          {uiLocale && (
            <label className="public-form-field public-page-language-switch">
              <span>{copy.changeLanguage}</span>
              <select
                className="public-form-control"
                value={activeLocale}
                onChange={(event) => updateUiLocale(event.target.value)}
              >
                {PERSONAL_QUESTIONNAIRE_LOCALES.map((option) => (
                  <option key={option.locale} value={option.locale}>
                    {option.nativeLabel}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>

        {error && <div className="analytics-error">{error}</div>}

        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="public-page-form">
          <PersonalQuestionnaireForm
            value={form}
            onChange={setForm}
            disabled={saving || !uiLocale}
            locale={activeLocale}
          />

          <div className="public-page-actions">
            <button type="submit" className="btn-primary" disabled={saving || !uiLocale}>
              {saving ? copy.submitting : copy.submit}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
