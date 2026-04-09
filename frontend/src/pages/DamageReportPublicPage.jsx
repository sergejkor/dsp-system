import { useEffect, useMemo, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import DamageReportForm, { createEmptyDamageReport } from '../components/DamageReportForm.jsx';
import { DAMAGE_REPORT_LOCALES, getDamageReportCopy, normalizeDamageReportLocale } from '../components/damageReportI18n.js';
import { getDamageReportOptions, submitDamageReport } from '../services/publicFormsApi.js';

const LANG_STORAGE_KEY = 'damage_report_public_lang';
const ALL_ATTACHMENT_CATEGORIES = [
  { key: 'generalSituation', required: true },
  { key: 'opponentLicensePlate', required: false },
  { key: 'ourDamages', required: true },
  { key: 'opponentDamages', required: false },
  { key: 'damagedProperty', required: false },
  { key: 'other', required: false },
];

const COMPANY_INSURANCE_DEFAULT = {
  companyName: 'AlfaMile UG',
  street: 'Nadistr. 16',
  cityLine: '80809 München',
  hrb: 'HRB 28268576',
  contactEmail: 'unfall@alfamile.com',
  phone: '0176 31555520',
  insurance: 'VHV',
  insuranceNumber: 'K 73-319078/ff DNO',
};

const COPY = {
  en: {
    pageTitle: 'Schadenmeldung',
    pageSubtitle: 'Use this form to report a damage case. The report will appear in the system for internal follow-up.',
    statusTitle: 'Status',
    submit: 'Submit',
    submitting: 'Submitting...',
    success: 'Schadenmeldung submitted successfully',
    languageModalTitle: 'Welcome to the Schadenmeldung page of AlfaMile GmbH.',
    languageModalBody: 'Please select the language for filling out the form.',
    continue: 'Continue',
    driverVehicleSection: 'Driver & Vehicle',
    driverLabel: 'Driver',
    driverPlaceholder: 'Select or type a driver',
    vehicleLabel: 'Vehicle (License plate)',
    vehiclePlaceholder: 'Select a license plate',
    rentalCar: 'Rental car (If not in the list)',
    rentalCarLicensePlate: 'Input rental car license plate',
    accidentSection: 'Accident',
    accidentTypeLabel: 'Accident type',
    accidentWithAnotherCar: 'Accident with another car',
    accidentWithoutOtherCar: 'Accident without other car',
    thirdPartyPropertyDamaged: 'Third-party property damaged?',
    ownerFirstName: 'Property owner first name',
    ownerLastName: 'Property owner last name',
    ownerPhone: 'Contact phone',
    ownerEmail: 'Contact email',
    opponentSection: 'Opponent',
    opponentName: 'Opponent name',
    opponentEmail: 'Opponent email',
    opponentPhone: 'Opponent phone',
    opponentInsuranceNumber: 'Opponent insurance number',
    incidentDate: 'Incident date',
    incidentTime: 'Incident time',
    location: 'Location',
    locationPlaceholder: 'Search address or enter manually',
    useCurrentLocation: 'Use current location',
    locating: 'Locating...',
    searching: 'Searching...',
    noAddresses: 'No addresses found',
    street: 'Street',
    houseNumber: 'House number',
    zipCode: 'ZIP code',
    city: 'City',
    policeOnSite: 'Was police on site?',
    policeStation: 'Police station',
    yes: 'Yes',
    no: 'No',
    damageSummary: 'Damage summary',
    description: 'Description',
    descriptionPlaceholder: 'Please describe the incident in your preferred language with as much detail as possible.',
    witnesses: 'Witnesses',
    attachmentsTitle: 'Required photos',
    chooseFiles: 'Choose files',
    noFilesSelected: 'No files selected',
    requiredLabel: 'Required',
    generalSituation: 'General situation',
    opponentLicensePlate: 'Opponent license plate',
    ourDamages: 'Our damages',
    opponentDamages: 'Opponent damages',
    damagedProperty: 'Damaged third-party property',
    other: 'Other files',
    missingAttachments: 'Please upload all required photo categories.',
  },
  de: {
    pageTitle: 'Schadenmeldung',
    pageSubtitle: 'Bitte nutzen Sie dieses Formular zur Meldung eines Schadenfalls.',
    statusTitle: 'Status',
    submit: 'Senden',
    submitting: 'Wird gesendet...',
    success: 'Schadenmeldung erfolgreich gesendet',
    languageModalTitle: 'Willkommen auf der Schadenmeldung-Seite von AlfaMile GmbH.',
    languageModalBody: 'Bitte wählen Sie die Sprache zum Ausfüllen aus.',
    continue: 'Weiter',
    driverVehicleSection: 'Fahrer & Fahrzeug',
    driverLabel: 'Fahrer',
    driverPlaceholder: 'Fahrer wählen oder eingeben',
    vehicleLabel: 'Fahrzeug (Kennzeichen)',
    vehiclePlaceholder: 'Kennzeichen wählen oder eingeben',
    rentalCar: 'Mietwagen (wenn nicht in der Liste)',
    opponentSection: 'Unfallgegner',
    opponentName: 'Name des Unfallgegners',
    opponentEmail: 'E-Mail des Unfallgegners',
    opponentPhone: 'Telefon des Unfallgegners',
    opponentInsuranceNumber: 'Versicherungsnummer des Unfallgegners',
    incidentDate: 'Schadendatum',
    incidentTime: 'Schadenzeit',
    location: 'Ort',
    locationPlaceholder: 'Adresse suchen oder manuell eingeben',
    useCurrentLocation: 'Aktuellen Standort verwenden',
    locating: 'Standort wird ermittelt...',
    searching: 'Suche...',
    noAddresses: 'Keine Adressen gefunden',
    street: 'Straße',
    houseNumber: 'Hausnummer',
    zipCode: 'PLZ',
    city: 'Stadt',
    policeOnSite: 'War die Polizei vor Ort?',
    policeStation: 'Polizeidienststelle',
    yes: 'Ja',
    no: 'Nein',
    damageSummary: 'Schadenzusammenfassung',
    description: 'Beschreibung',
    descriptionPlaceholder: 'Bitte beschreiben Sie den Vorfall in Ihrer bevorzugten Sprache so detailliert wie möglich.',
    witnesses: 'Zeugen',
    attachmentsTitle: 'Pflichtfotos',
    chooseFiles: 'Dateien auswählen',
    noFilesSelected: 'Keine Datei ausgewählt',
    requiredLabel: 'Pflicht',
    generalSituation: 'Gesamtsituation',
    opponentLicensePlate: 'Kennzeichen des Unfallgegners',
    ourDamages: 'Unsere Schäden',
    opponentDamages: 'Schäden beim Unfallgegner',
    other: 'Weitere Dateien',
    missingAttachments: 'Bitte laden Sie alle Pflichtfoto-Kategorien hoch.',
  },
  ru: {
    pageTitle: 'Schadenmeldung',
    pageSubtitle: 'Используйте эту форму для отправки информации о повреждении.',
    statusTitle: 'Статус',
    submit: 'Отправить',
    submitting: 'Отправка...',
    success: 'Schadenmeldung успешно отправлен',
    languageModalTitle: 'Добро пожаловать на страницу Schadenmeldung AlfaMile GmbH.',
    languageModalBody: 'Выберите язык для заполнения формы.',
    continue: 'Продолжить',
    driverVehicleSection: 'Водитель и автомобиль',
    driverLabel: 'Водитель',
    driverPlaceholder: 'Выберите или введите водителя',
    vehicleLabel: 'Автомобиль (номер)',
    vehiclePlaceholder: 'Выберите или введите номер',
    rentalCar: 'Арендованный автомобиль (если нет в списке)',
    opponentSection: 'Оппонент',
    opponentName: 'Имя оппонента',
    opponentEmail: 'E-mail оппонента',
    opponentPhone: 'Телефон оппонента',
    opponentInsuranceNumber: 'Номер страховки оппонента',
    incidentDate: 'Дата происшествия',
    incidentTime: 'Время происшествия',
    location: 'Локация',
    locationPlaceholder: 'Поиск адреса или ручной ввод',
    useCurrentLocation: 'Использовать текущую геолокацию',
    locating: 'Определение местоположения...',
    searching: 'Поиск...',
    noAddresses: 'Адрес не найден',
    street: 'Улица',
    houseNumber: 'Номер дома',
    zipCode: 'Почтовый индекс',
    city: 'Город',
    policeOnSite: 'Полиция была на месте?',
    policeStation: 'Полицейская станция',
    yes: 'Да',
    no: 'Нет',
    damageSummary: 'Краткое описание ущерба',
    description: 'Описание',
    descriptionPlaceholder: 'Пожалуйста, опишите ситуацию на удобном для вас языке как можно подробнее.',
    witnesses: 'Свидетели',
    attachmentsTitle: 'Обязательные фото',
    chooseFiles: 'Выбрать файлы',
    noFilesSelected: 'Файл не выбран',
    requiredLabel: 'Обязательно',
    generalSituation: 'Общая ситуация',
    opponentLicensePlate: 'Номер машины оппонента',
    ourDamages: 'Наши повреждения',
    opponentDamages: 'Повреждения оппонента',
    other: 'Другие файлы',
    missingAttachments: 'Пожалуйста, загрузите все обязательные категории фото.',
  },
};

function normalizeLocale(locale) {
  return normalizeDamageReportLocale(locale);
}

function createEmptyAttachmentGroups() {
  return ALL_ATTACHMENT_CATEGORIES.reduce((acc, item) => {
    acc[item.key] = [];
    return acc;
  }, {});
}

function getActiveAttachmentCategories(form) {
  const withoutOtherCar = form?.accidentType === 'without_other_car';
  const thirdPartyDamaged = withoutOtherCar && !!form?.thirdPartyPropertyDamaged;
  if (withoutOtherCar) {
    return ALL_ATTACHMENT_CATEGORIES
      .map((item) => {
        if (item.key === 'opponentLicensePlate' || item.key === 'opponentDamages') {
          return { ...item, hidden: true, required: false };
        }
        if (item.key === 'damagedProperty') {
          return { ...item, hidden: !thirdPartyDamaged, required: thirdPartyDamaged };
        }
        if (item.key === 'generalSituation' || item.key === 'ourDamages') {
          return { ...item, required: true };
        }
        return item;
      })
      .filter((item) => !item.hidden);
  }
  return ALL_ATTACHMENT_CATEGORIES
    .map((item) => {
      if (item.key === 'opponentLicensePlate' || item.key === 'opponentDamages') {
        return { ...item, required: true };
      }
      if (item.key === 'damagedProperty') {
        return { ...item, hidden: true, required: false };
      }
      return item;
    })
    .filter((item) => !item.hidden);
}

function mapGroupedFiles(groups, categories) {
  const files = [];
  for (const item of categories) {
    const list = Array.isArray(groups[item.key]) ? groups[item.key] : [];
    for (const file of list) files.push(file);
  }
  return files;
}

export default function DamageReportPublicPage() {
  const [form, setForm] = useState(createEmptyDamageReport);
  const [attachmentGroups, setAttachmentGroups] = useState(createEmptyAttachmentGroups);
  const [options, setOptions] = useState({ drivers: [], cars: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [showLanguageModal, setShowLanguageModal] = useState(true);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [showInsuranceQr, setShowInsuranceQr] = useState(false);
  const [companyInsurance, setCompanyInsurance] = useState(COMPANY_INSURANCE_DEFAULT);
  const [locale, setLocale] = useState(() => normalizeLocale(localStorage.getItem(LANG_STORAGE_KEY)));
  const [modalLocale, setModalLocale] = useState(() => normalizeLocale(localStorage.getItem(LANG_STORAGE_KEY)));
  const [validationErrors, setValidationErrors] = useState({});

  const copy = useMemo(() => {
    const legacy = getDamageReportCopy(locale) || {};
    const base = COPY[locale] || COPY.en;
    return {
      ...base,
      pageTitle: legacy.pageTitle || base.pageTitle,
      pageSubtitle: legacy.pageSubtitle || base.pageSubtitle,
      submit: legacy.submit || base.submit,
      submitting: legacy.submitting || base.submitting,
      languageModalTitle: legacy.modalTitle || base.languageModalTitle,
      languageModalBody: legacy.modalBody || base.languageModalBody,
      continue: legacy.continue || base.continue,
      chooseFiles: legacy.uploadFiles || base.chooseFiles,
      noFilesSelected: legacy.noFilesSelected || base.noFilesSelected,
      useCurrentLocation: legacy.useCurrentLocation || base.useCurrentLocation,
      locating: legacy.locating || base.locating,
      incidentDate: legacy.incidentDate || base.incidentDate,
      incidentTime: legacy.incidentTime || base.incidentTime,
      location: legacy.location || base.location,
      damageSummary: legacy.damageSummary || base.damageSummary,
      description: legacy.description || base.description,
      witnesses: legacy.witnesses || base.witnesses,
    };
  }, [locale]);
  const activeAttachmentCategories = useMemo(() => getActiveAttachmentCategories(form), [form]);

  const localeChoices = useMemo(
    () =>
      (Array.isArray(DAMAGE_REPORT_LOCALES) ? DAMAGE_REPORT_LOCALES : []).map((item) => ({
        locale: item.locale,
        label: item.label || item.nativeLabel || item.germanValue || item.locale,
      })),
    []
  );

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

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(LANG_STORAGE_KEY, locale);
    setModalLocale(locale);
  }, [locale]);

  const attachmentSummary = useMemo(() => {
    return activeAttachmentCategories.reduce((acc, item) => {
      const list = attachmentGroups[item.key] || [];
      acc[item.key] = list.length ? list.map((file) => file.name).join(', ') : copy.noFilesSelected;
      return acc;
    }, {});
  }, [activeAttachmentCategories, attachmentGroups, copy.noFilesSelected]);

  const companyInsuranceQrValue = useMemo(() => {
    const lines = [
      companyInsurance.companyName,
      companyInsurance.street,
      companyInsurance.cityLine,
      `HRB: ${companyInsurance.hrb}`,
      `Contact e-mail: ${companyInsurance.contactEmail}`,
      `Phone: ${companyInsurance.phone}`,
      `Insurance: ${companyInsurance.insurance}`,
      `Insurance number: ${companyInsurance.insuranceNumber}`,
    ];
    return lines.filter(Boolean).join('\n');
  }, [companyInsurance]);

  function setAttachmentFiles(categoryKey, files) {
    const nextAttachments = {
      ...attachmentGroups,
      [categoryKey]: Array.from(files || []),
    };
    setAttachmentGroups(nextAttachments);
    if (Object.keys(validationErrors).length) {
      setValidationErrors(validateForm(form, nextAttachments));
    }
  }

  function validateForm(nextForm = form, nextAttachments = attachmentGroups) {
    const next = {};
    const requiredText = 'Required field';
    const isRentalCar = nextForm.rentalCar === true || nextForm.rentalCar === 'true' || nextForm.rentalCar === 1;
    const withOtherCar = String(nextForm.accidentType || '').trim() !== 'without_other_car';
    if (!String(nextForm.driverName || '').trim()) next.driverName = requiredText;
    if (isRentalCar) {
      if (!String(nextForm.rentalCarLicensePlate || '').trim()) next.rentalCarLicensePlate = requiredText;
    } else if (!String(nextForm.licensePlate || '').trim()) {
      next.licensePlate = requiredText;
    }
    if (!String(nextForm.incidentDate || '').trim()) next.incidentDate = requiredText;
    if (!String(nextForm.incidentTime || '').trim()) next.incidentTime = requiredText;
    if (nextForm.policeOnSite !== true && nextForm.policeOnSite !== false) next.policeOnSite = requiredText;
    if (!String(nextForm.streetName || '').trim()) next.streetName = requiredText;
    if (!String(nextForm.city || '').trim()) next.city = requiredText;
    if (withOtherCar && !String(nextForm.opponentName || '').trim()) next.opponentName = requiredText;
    if (withOtherCar && !String(nextForm.opponentPhone || '').trim()) next.opponentPhone = requiredText;
    if (!String(nextForm.description || '').trim()) next.description = requiredText;
    for (const item of getActiveAttachmentCategories(nextForm)) {
      if (item.required && !(nextAttachments[item.key] && nextAttachments[item.key].length)) {
        next[`attachment.${item.key}`] = requiredText;
      }
    }
    return next;
  }

  function handleFormChange(nextForm) {
    const isRentalCar = nextForm.rentalCar === true || nextForm.rentalCar === 'true' || nextForm.rentalCar === 1;
    const normalizedForm = isRentalCar
      ? nextForm
      : { ...nextForm, rentalCarLicensePlate: '' };
    setForm(normalizedForm);
    if (Object.keys(validationErrors).length) {
      setValidationErrors(validateForm(normalizedForm, attachmentGroups));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(null);
    try {
      const isRentalCar = form.rentalCar === true || form.rentalCar === 'true' || form.rentalCar === 1;
      const normalizedForm = isRentalCar ? form : { ...form, rentalCarLicensePlate: '' };
      if (!isRentalCar && form.rentalCarLicensePlate) {
        setForm(normalizedForm);
      }
      const nextValidationErrors = validateForm(normalizedForm, attachmentGroups);
      setValidationErrors(nextValidationErrors);
      if (Object.keys(nextValidationErrors).length) {
        throw new Error('Please fill all required fields marked with *.');
      }
      const files = mapGroupedFiles(attachmentGroups, activeAttachmentCategories);
      const payload = {
        ...normalizedForm,
        attachmentCategories: Object.fromEntries(
          activeAttachmentCategories.map((item) => [item.key, (attachmentGroups[item.key] || []).map((f) => f.name)])
        ),
      };
      const result = await submitDamageReport(payload, files);
      setSuccess(result?.report || { id: null });
      setForm(createEmptyDamageReport());
      setAttachmentGroups(createEmptyAttachmentGroups());
      setValidationErrors({});
    } catch (err) {
      setError(err?.message || 'Submission failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="public-page-shell">
      {showLanguageModal && (
        <div className="public-language-modal-backdrop">
          <div className="public-language-modal">
            <h2>{copy.languageModalTitle}</h2>
            <p>{copy.languageModalBody}</p>
            <label className="public-form-field public-page-language-switch">
              <span>Language</span>
              <select
                className="public-form-control"
                value={modalLocale}
                onChange={(e) => setModalLocale(e.target.value)}
              >
                {localeChoices.map((item) => (
                  <option key={item.locale} value={item.locale}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="public-language-modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setLocale(modalLocale);
                  setShowLanguageModal(false);
                }}
              >
                {copy.continue}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInsuranceModal && (
        <div className="public-language-modal-backdrop">
          <div className="public-language-modal">
            <h2>Company Insurance Data</h2>
            <div className="public-form-grid">
              <label className="public-form-field">
                <span>Company name</span>
                <input
                  className="public-form-control"
                  value={companyInsurance.companyName}
                  onChange={(e) => setCompanyInsurance((prev) => ({ ...prev, companyName: e.target.value }))}
                />
              </label>
              <label className="public-form-field">
                <span>Street</span>
                <input
                  className="public-form-control"
                  value={companyInsurance.street}
                  onChange={(e) => setCompanyInsurance((prev) => ({ ...prev, street: e.target.value }))}
                />
              </label>
              <label className="public-form-field">
                <span>City</span>
                <input
                  className="public-form-control"
                  value={companyInsurance.cityLine}
                  onChange={(e) => setCompanyInsurance((prev) => ({ ...prev, cityLine: e.target.value }))}
                />
              </label>
              <label className="public-form-field">
                <span>HRB</span>
                <input
                  className="public-form-control"
                  value={companyInsurance.hrb}
                  onChange={(e) => setCompanyInsurance((prev) => ({ ...prev, hrb: e.target.value }))}
                />
              </label>
              <label className="public-form-field">
                <span>Contact e-mail</span>
                <input
                  className="public-form-control"
                  value={companyInsurance.contactEmail}
                  onChange={(e) => setCompanyInsurance((prev) => ({ ...prev, contactEmail: e.target.value }))}
                />
              </label>
              <label className="public-form-field">
                <span>Phone</span>
                <input
                  className="public-form-control"
                  value={companyInsurance.phone}
                  onChange={(e) => setCompanyInsurance((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </label>
              <label className="public-form-field">
                <span>Insurance</span>
                <input
                  className="public-form-control"
                  value={companyInsurance.insurance}
                  onChange={(e) => setCompanyInsurance((prev) => ({ ...prev, insurance: e.target.value }))}
                />
              </label>
              <label className="public-form-field">
                <span>Insurance number</span>
                <input
                  className="public-form-control"
                  value={companyInsurance.insuranceNumber}
                  onChange={(e) => setCompanyInsurance((prev) => ({ ...prev, insuranceNumber: e.target.value }))}
                />
              </label>
            </div>

            <div className="public-language-modal-actions public-company-insurance-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowInsuranceQr(true)}
                title="Show QR"
              >
                <span className="public-qr-inline-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
                    <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
                  </svg>
                </span>
                Show QR
              </button>
              <button type="button" className="btn-primary" onClick={() => setShowInsuranceModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showInsuranceQr && (
        <div className="public-language-modal-backdrop public-qr-modal-backdrop">
          <div className="public-language-modal public-qr-modal">
            <h2>Company Insurance QR</h2>
            <div className="public-company-insurance-qr public-company-insurance-qr--modal">
              <QRCodeCanvas value={companyInsuranceQrValue} size={360} level="M" includeMargin />
            </div>
            <div className="public-language-modal-actions">
              <button type="button" className="btn-primary" onClick={() => setShowInsuranceQr(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="public-page-card">
        <header className="public-page-header">
          <div>
            <h1>{copy.pageTitle}</h1>
            <p>{copy.pageSubtitle}</p>
          </div>
          <div className="public-page-actions public-page-header-actions">
            <button type="button" className="btn-primary" onClick={() => setShowInsuranceModal(true)}>
              Show Company Insurance Data
            </button>
          </div>
        </header>

        {error && <div className="analytics-error">{error}</div>}
        {success && (
          <div className="public-language-modal-backdrop">
            <div className="public-language-modal public-success-modal">
              <h2>{copy.success}</h2>
              <p>{success.id ? `ID ${success.id}` : 'ID not available'}</p>
              <div className="public-language-modal-actions">
                <button type="button" className="btn-primary" onClick={() => setSuccess(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="public-page-form">
          <DamageReportForm
            value={form}
            onChange={handleFormChange}
            disabled={saving}
            options={options}
            copy={copy}
            errors={validationErrors}
          />

          <section className="public-form-section">
            <h3>{copy.attachmentsTitle}</h3>
            <div className="public-form-grid">
              {activeAttachmentCategories.map((item) => {
                const inputId = `attachment-${item.key}`;
                const attachmentError = validationErrors[`attachment.${item.key}`];
                return (
                  <label key={item.key} className={`public-form-field public-form-field--boxed${attachmentError ? ' is-invalid' : ''}`}>
                    <span>
                      {copy[item.key] || item.key}
                      {item.required ? ' *' : ''}
                    </span>
                    <div className="public-file-picker">
                      <input
                        id={inputId}
                        className="public-file-picker-input"
                        type="file"
                        multiple
                        disabled={saving}
                        onChange={(e) => setAttachmentFiles(item.key, e.target.files)}
                      />
                      <button
                        type="button"
                        className="btn-primary public-file-picker-btn"
                        disabled={saving}
                        onClick={() => document.getElementById(inputId)?.click()}
                      >
                        {copy.chooseFiles}
                      </button>
                      <p className="muted small">{attachmentSummary[item.key]}</p>
                      {attachmentError ? <small className="public-field-error">{attachmentError}</small> : null}
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          <div className="public-page-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? copy.submitting : copy.submit}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
