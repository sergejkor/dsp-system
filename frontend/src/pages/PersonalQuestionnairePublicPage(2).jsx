import { useMemo, useState } from 'react';
import PersonalQuestionnaireForm, { createEmptyPersonalQuestionnaire } from '../components/PersonalQuestionnaireForm.jsx';
import {
  PERSONAL_QUESTIONNAIRE_LOCALES,
  getPersonalQuestionnaireCopy,
  getPersonalQuestionnaireGermanLanguageValue,
  isPersonalQuestionnaireRtl,
  normalizePersonalQuestionnaireLocale,
} from '../components/personalQuestionnaireI18n.js';
import { submitPersonalQuestionnaire } from '../services/publicFormsApi.js';

function getChildrenValidationCopy(locale) {
  const map = {
    en: { children: 'Children', howManyKids: 'How many kids?', childName: 'Child name', childBirthDate: 'Child birth date' },
    de: { children: 'Kinder', howManyKids: 'Wie viele Kinder?', childName: 'Name des Kindes', childBirthDate: 'Geburtsdatum des Kindes' },
    ru: { children: 'Дети', howManyKids: 'Сколько детей?', childName: 'Имя ребенка', childBirthDate: 'Дата рождения ребенка' },
    fr: { children: 'Enfants', howManyKids: "Combien d'enfants ?", childName: "Nom de l'enfant", childBirthDate: "Date de naissance de l'enfant" },
    it: { children: 'Figli', howManyKids: 'Quanti figli?', childName: 'Nome del bambino', childBirthDate: 'Data di nascita del bambino' },
    es: { children: 'Hijos', howManyKids: '¿Cuántos hijos?', childName: 'Nombre del niño', childBirthDate: 'Fecha de nacimiento del niño' },
    pl: { children: 'Dzieci', howManyKids: 'Ile dzieci?', childName: 'Imię dziecka', childBirthDate: 'Data urodzenia dziecka' },
    uk: { children: 'Діти', howManyKids: 'Скільки дітей?', childName: "Ім'я дитини", childBirthDate: 'Дата народження дитини' },
    nl: { children: 'Kinderen', howManyKids: 'Hoeveel kinderen?', childName: 'Naam van het kind', childBirthDate: 'Geboortedatum van het kind' },
    ro: { children: 'Copii', howManyKids: 'Câți copii?', childName: 'Numele copilului', childBirthDate: 'Data nașterii copilului' },
    hu: { children: 'Gyermekek', howManyKids: 'Hány gyerek?', childName: 'A gyermek neve', childBirthDate: 'A gyermek születési dátuma' },
    ar: { children: 'الأطفال', howManyKids: 'كم عدد الأطفال؟', childName: 'اسم الطفل', childBirthDate: 'تاريخ ميلاد الطفل' },
  };
  return map[locale] || map.en;
}

function getValidationCopy(locale) {
  const map = {
    en: {
      completeFields: 'Please complete the following fields',
      taxIdInvalid: 'Tax ID must contain exactly 11 numbers.',
    },
    de: {
      completeFields: 'Bitte füllen Sie die folgenden Felder aus',
      taxIdInvalid: 'Die Steuer-ID muss genau 11 Ziffern enthalten.',
    },
    ru: {
      completeFields: 'Пожалуйста, заполните следующие поля',
      taxIdInvalid: 'Налоговый номер должен содержать ровно 11 цифр.',
    },
    fr: {
      completeFields: 'Veuillez remplir les champs suivants',
      taxIdInvalid: "L'identifiant fiscal doit contenir exactement 11 chiffres.",
    },
    it: {
      completeFields: 'Compila i seguenti campi',
      taxIdInvalid: "Il codice fiscale deve contenere esattamente 11 cifre.",
    },
    es: {
      completeFields: 'Por favor complete los siguientes campos',
      taxIdInvalid: 'El ID fiscal debe contener exactamente 11 números.',
    },
    pl: {
      completeFields: 'Proszę uzupełnić następujące pola',
      taxIdInvalid: 'Numer podatkowy musi zawierać dokładnie 11 cyfr.',
    },
    uk: {
      completeFields: 'Будь ласка, заповніть такі поля',
      taxIdInvalid: 'Податковий номер має містити рівно 11 цифр.',
    },
    nl: {
      completeFields: 'Vul de volgende velden in',
      taxIdInvalid: 'Het belastingnummer moet precies 11 cijfers bevatten.',
    },
    ro: {
      completeFields: 'Vă rugăm să completați următoarele câmpuri',
      taxIdInvalid: 'ID-ul fiscal trebuie să conțină exact 11 cifre.',
    },
    hu: {
      completeFields: 'Kérjük, töltse ki a következő mezőket',
      taxIdInvalid: 'Az adóazonosítónak pontosan 11 számjegyet kell tartalmaznia.',
    },
    ar: {
      completeFields: 'يرجى إكمال الحقول التالية',
      taxIdInvalid: 'يجب أن يحتوي الرقم الضريبي على 11 رقمًا بالضبط.',
    },
  };
  return map[locale] || map.en;
}

function validatePublicPersonalQuestionnaire(form, locale, copy) {
  const personal = form?.personal || {};
  const address = form?.address || {};
  const home = form?.home || {};
  const financial = form?.financial || {};
  const uniform = form?.uniform || {};
  const missing = [];
  const validationCopy = getValidationCopy(locale);
  const childrenCopy = getChildrenValidationCopy(locale);

  if (!String(form?.firstName || '').trim()) missing.push(copy.firstName);
  if (!String(form?.lastName || '').trim()) missing.push(copy.lastName);
  if (!String(personal.birthdate || '').trim()) missing.push(copy.birthDay);
  if (!String(personal.birthPlace || '').trim()) missing.push(copy.birthPlace);
  if (!String(personal.birthName || '').trim()) missing.push(copy.birthName);
  if (!String(personal.gender || '').trim()) missing.push(copy.gender);
  if (!String(personal.nationality || '').trim()) missing.push(copy.nationality);
  if (!String(home.maritalStatus || '').trim()) missing.push(copy.maritalStatus);
  if (!String(address.streetName || '').trim()) missing.push(copy.streetName);
  if (!String(address.houseNumber || '').trim()) missing.push(copy.houseNumber);
  if (!String(address.postalCode || '').trim()) missing.push(copy.postalCode);
  if (!String(address.city || '').trim()) missing.push(copy.city);
  if (!String(financial.taxId || '').trim()) missing.push(copy.taxId);
  if (!String(uniform.jacke || '').trim()) missing.push(copy.jacke);
  if (!String(uniform.hose || '').trim()) missing.push(copy.hose);
  if (!String(uniform.shirt || '').trim()) missing.push(copy.shirt);
  if (!String(uniform.schuhe || '').trim()) missing.push(copy.schuhe);

  const childrenHas = String(home.childrenHas || '').trim();
  if (!childrenHas) missing.push(childrenCopy.children);
  if (childrenHas === 'Ja') {
    const count = Number(home.childrenCount || 0);
    if (!Number.isInteger(count) || count < 1 || count > 6) {
      missing.push(childrenCopy.howManyKids);
    } else {
      const details = Array.isArray(home.childrenDetails) ? home.childrenDetails : [];
      for (let index = 0; index < count; index += 1) {
        if (!String(details[index]?.name || '').trim()) missing.push(`${childrenCopy.childName} ${index + 1}`);
        if (!String(details[index]?.birthdate || '').trim()) missing.push(`${childrenCopy.childBirthDate} ${index + 1}`);
      }
    }
  }

  if (financial.taxId && !/^\d{11}$/.test(String(financial.taxId).trim())) {
    return validationCopy.taxIdInvalid;
  }

  return missing.length ? `${validationCopy.completeFields}: ${missing.join(', ')}` : '';
}

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
      setForm((current) => {
        if (current?.account?.language) return current;
        return {
          ...current,
          account: {
            ...(current?.account || {}),
            language: getPersonalQuestionnaireGermanLanguageValue(normalized),
          },
        };
      });
    }
  }

  function handleFormKeyDown(event) {
    if (event.key === 'Enter' && event.target?.tagName !== 'TEXTAREA' && event.target?.type !== 'submit' && event.target?.type !== 'button') {
      event.preventDefault();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validatePublicPersonalQuestionnaire(form, activeLocale, copy);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }
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
            <h2>{getPersonalQuestionnaireCopy(pendingLocale).modalTitle}</h2>
            <p>{getPersonalQuestionnaireCopy(pendingLocale).modalBody}</p>
            <p className="public-language-modal-prompt">{getPersonalQuestionnaireCopy(pendingLocale).modalPrompt}</p>

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
              <button type="button" className="btn-primary" onClick={() => updateUiLocale(pendingLocale, { initializeFormLanguage: true })}>
                {getPersonalQuestionnaireCopy(pendingLocale).continue}
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
                onChange={(e) => updateUiLocale(e.target.value)}
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
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate className="public-page-form">
          <PersonalQuestionnaireForm value={form} onChange={setForm} disabled={saving || !uiLocale} locale={activeLocale} />

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
