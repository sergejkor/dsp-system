import { useEffect, useMemo, useState } from 'react';
import { searchAddressSuggestions } from '../services/publicFormsApi.js';
import {
  getPersonalQuestionnaireCopy,
  getPersonalQuestionnaireOptions,
  normalizePersonalQuestionnaireLocale,
} from './personalQuestionnaireI18n.js';

function formatDateDisplay(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}.${month}.${year}`;
}

function parseDateDisplay(value) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function applyEnglishValidationMessage(event, title) {
  const { validity } = event.target;
  if (validity.valueMissing) {
    event.target.setCustomValidity('Please fill out this field.');
    return;
  }
  if (validity.typeMismatch) {
    event.target.setCustomValidity('Please enter a valid value.');
    return;
  }
  if (validity.patternMismatch) {
    event.target.setCustomValidity(title || 'Please match the requested format.');
    return;
  }
  if (validity.tooShort || validity.tooLong) {
    event.target.setCustomValidity(title || 'Please enter a valid value.');
    return;
  }
  event.target.setCustomValidity('');
}

function updateTopLevel(state, key, value) {
  return { ...(state || {}), [key]: value };
}

function updateNestedValue(state, section, key, value) {
  return {
    ...(state || {}),
    [section]: {
      ...((state && state[section]) || {}),
      [key]: value,
    },
  };
}

function normalizeChildrenCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const clamped = Math.max(1, Math.min(6, Math.trunc(num)));
  return String(clamped);
}

function syncChildrenDetails(details, countValue) {
  const count = Number(countValue);
  if (!Number.isFinite(count) || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => ({
    name: String(details?.[index]?.name || ''),
    birthdate: String(details?.[index]?.birthdate || ''),
  }));
}

function serializeChildrenDetails(details) {
  return (Array.isArray(details) ? details : [])
    .map((item) => {
      const name = String(item?.name || '').trim();
      const birthdate = String(item?.birthdate || '').trim();
      if (!name && !birthdate) return '';
      if (name && birthdate) return `${name} - ${birthdate}`;
      return name || birthdate;
    })
    .filter(Boolean)
    .join('\n');
}

function Field({ label, type = 'text', value, onChange, placeholder, disabled, textarea = false, required = false, pattern, title, maxLength, minLength }) {
  const props = {
    className: 'public-form-control',
    type,
    value: value ?? '',
    onChange: (e) => {
      e.target.setCustomValidity('');
      onChange(e.target.value);
    },
    onInvalid: (e) => applyEnglishValidationMessage(e, title),
    placeholder,
    disabled,
    required,
    pattern,
    title,
    maxLength,
    minLength,
  };
  return (
    <label className="public-form-field">
      <span>{label}{required ? ' *' : ''}</span>
      {textarea ? <textarea {...props} rows={4} /> : <input {...props} />}
    </label>
  );
}

function DateField({ label, value, onChange, disabled, required = false }) {
  const [displayValue, setDisplayValue] = useState(formatDateDisplay(value));

  useEffect(() => {
    setDisplayValue(formatDateDisplay(value));
  }, [value]);

  const handleChange = (event) => {
    const raw = String(event.target.value || '').replace(/[^\d.]/g, '').slice(0, 10);
    setDisplayValue(raw);
    event.target.setCustomValidity('');
    const iso = parseDateDisplay(raw);
    onChange(iso || '');
  };

  const handleBlur = () => {
    if (!displayValue) {
      onChange('');
      return;
    }
    const iso = parseDateDisplay(displayValue);
    if (iso) {
      setDisplayValue(formatDateDisplay(iso));
      onChange(iso);
    }
  };

  return (
    <label className="public-form-field">
      <span>{label}{required ? ' *' : ''}</span>
      <input
        className="public-form-control"
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onInvalid={(e) => applyEnglishValidationMessage(e, 'Please use format DD.MM.YYYY.')}
        placeholder="DD.MM.YYYY"
        disabled={disabled}
        required={required}
        pattern="\d{2}\.\d{2}\.\d{4}"
        title="Please use format DD.MM.YYYY."
        maxLength={10}
        dir="ltr"
        lang="en"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, disabled, options, placeholder, required = false }) {
  return (
    <label className="public-form-field">
      <span>{label}{required ? ' *' : ''}</span>
      <select
        className="public-form-control"
        value={value ?? ''}
        onChange={(e) => {
          e.target.setCustomValidity('');
          onChange(e.target.value);
        }}
        onInvalid={(e) => applyEnglishValidationMessage(e)}
        disabled={disabled}
        required={required}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }) {
  return (
    <section className="public-form-section">
      <div className="public-form-section-head">
        <h3>{title}</h3>
      </div>
      <div className="public-form-grid">{children}</div>
    </section>
  );
}

const TAX_CLASS_OPTIONS = ['1', '2', '3', '4', '5', '6'].map((value) => ({ value, label: value }));
const UNIFORM_SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((value) => ({ value, label: value }));
const SHOE_SIZE_OPTIONS = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'].map((value) => ({ value, label: value }));
const INSURANCE_COMPANY_OPTIONS = [
  'Techniker Krankenkasse (TK)',
  'BARMER',
  'DAK-Gesundheit',
  'AOK Bayern',
  'AOK Baden-Württemberg',
  'AOK Hessen',
  'AOK Niedersachsen',
  'AOK Nordost',
  'AOK Nordwest',
  'AOK PLUS',
  'KKH (Kaufmännische Krankenkasse)',
  'hkk Krankenkasse',
  'HEK (Hanseatische Krankenkasse)',
  'KNAPPSCHAFT',
  'BIG direkt gesund',
  'IKK classic',
  'IKK gesund plus',
  'IKK Südwest',
  'Audi BKK',
  'SBK (Siemens-BKK)',
  'pronova BKK',
  'mhplus Krankenkasse',
  'Mobil Krankenkasse',
  'Novitas BKK',
  'VIACTIV Krankenkasse',
  'vivida bkk',
  'SECURVITA Krankenkasse',
  'Salus BKK',
  'R+V BKK',
  'BKK24',
].map((value) => ({ value, label: value }));

export function createEmptyPersonalQuestionnaire() {
  return {
    firstName: '',
    lastName: '',
    taxClass: '',
    account: {
      email: '',
      language: '',
    },
    personal: {
      firstName: '',
      middleName: '',
      lastName: '',
      birthdate: '',
      birthPlace: '',
      birthName: '',
      gender: '',
      nationality: '',
    },
    work: {
      jobTitle: '',
      startDate: '',
      employeeNumber: '',
      workMobile: '',
      weeklyHours: '',
      probationUntil: '',
      contractEnd: '',
      managerName: '',
    },
    address: {
      streetName: '',
      houseNumber: '',
      addressLine1: '',
      postalCode: '',
      city: '',
      country: 'Deutschland',
    },
    home: {
      maritalStatus: '',
      personalMobile: '',
      childrenHas: '',
      childrenCount: '',
      childrenNames: '',
      childrenDetails: [],
      privateEmail: '',
    },
    financial: {
      bankName: '',
      accountHolderName: '',
      iban: '',
      bic: '',
      taxId: '',
      nationalInsuranceNumber: '',
      insuranceCompany: '',
      churchTax: '',
      churchTaxType: '',
    },
    dspLocal: {
      fuehrerschein_aufstellungsdatum: '',
      fuehrerschein_aufstellungsbehoerde: '',
      fuehrerschein_ablaufsdatum: '',
    },
    uniform: {
      jacke: '',
      hose: '',
      shirt: '',
      schuhe: '',
    },
  };
}

export default function PersonalQuestionnaireForm({ value, onChange, disabled = false, locale = 'de' }) {
  const normalizedLocale = normalizePersonalQuestionnaireLocale(locale);
  const copy = getPersonalQuestionnaireCopy(normalizedLocale);
  const localizedOptions = useMemo(() => getPersonalQuestionnaireOptions(normalizedLocale), [normalizedLocale]);
  const state = value || createEmptyPersonalQuestionnaire();
  const setTop = (key) => (next) => onChange(updateTopLevel(state, key, next));
  const setNested = (section, key) => (next) => onChange(updateNestedValue(state, section, key, next));
  const [addressSearch, setAddressSearch] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const dynamicChildrenCopy = useMemo(() => {
    const map = {
      en: { childrenToggle: 'Children', childrenCount: 'How many kids?', childName: 'Child name', childBirthDate: 'Child birth date' },
      de: { childrenToggle: 'Kinder', childrenCount: 'Wie viele Kinder?', childName: 'Name des Kindes', childBirthDate: 'Geburtsdatum des Kindes' },
      ru: { childrenToggle: 'Дети', childrenCount: 'Сколько детей?', childName: 'Имя ребенка', childBirthDate: 'Дата рождения ребенка' },
      fr: { childrenToggle: 'Enfants', childrenCount: "Combien d'enfants ?", childName: "Nom de l'enfant", childBirthDate: "Date de naissance de l'enfant" },
      it: { childrenToggle: 'Figli', childrenCount: 'Quanti figli?', childName: 'Nome del bambino', childBirthDate: 'Data di nascita del bambino' },
      es: { childrenToggle: 'Hijos', childrenCount: '¿Cuántos hijos?', childName: 'Nombre del niño', childBirthDate: 'Fecha de nacimiento del niño' },
      pl: { childrenToggle: 'Dzieci', childrenCount: 'Ile dzieci?', childName: 'Imię dziecka', childBirthDate: 'Data urodzenia dziecka' },
      uk: { childrenToggle: 'Діти', childrenCount: 'Скільки дітей?', childName: "Ім'я дитини", childBirthDate: 'Дата народження дитини' },
      nl: { childrenToggle: 'Kinderen', childrenCount: 'Hoeveel kinderen?', childName: 'Naam van het kind', childBirthDate: 'Geboortedatum van het kind' },
      ro: { childrenToggle: 'Copii', childrenCount: 'Câți copii?', childName: 'Numele copilului', childBirthDate: 'Data nașterii copilului' },
      hu: { childrenToggle: 'Gyermekek', childrenCount: 'Hány gyerek?', childName: 'A gyermek neve', childBirthDate: 'A gyermek születési dátuma' },
      ar: { childrenToggle: 'الأطفال', childrenCount: 'كم عدد الأطفال؟', childName: 'اسم الطفل', childBirthDate: 'تاريخ ميلاد الطفل' },
    };
    return map[normalizedLocale] || map.en;
  }, [normalizedLocale]);
  const childrenHasValue = state.home?.childrenHas || (Number(state.home?.childrenCount || 0) > 0 ? 'Ja' : '');
  const childrenCountValue = state.home?.childrenCount ? normalizeChildrenCount(state.home.childrenCount) : '';
  const childrenDetails = useMemo(
    () => syncChildrenDetails(state.home?.childrenDetails, childrenCountValue),
    [state.home?.childrenDetails, childrenCountValue]
  );

  useEffect(() => {
    const street = state.address?.streetName || '';
    const house = state.address?.houseNumber || '';
    const zip = state.address?.postalCode || '';
    const city = state.address?.city || '';
    const nextLabel = [street, house].filter(Boolean).join(' ');
    const tail = [zip, city].filter(Boolean).join(' ');
    setAddressSearch([nextLabel, tail].filter(Boolean).join(', '));
  }, [state.address?.streetName, state.address?.houseNumber, state.address?.postalCode, state.address?.city]);

  useEffect(() => {
    const q = String(addressSearch || '').trim();
    if (q.length < 3) {
      setAddressSuggestions([]);
      setAddressSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    setAddressSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchAddressSuggestions(q);
        if (!cancelled) setAddressSuggestions(results);
      } catch {
        if (!cancelled) setAddressSuggestions([]);
      } finally {
        if (!cancelled) setAddressSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addressSearch]);

  const applyAddressSuggestion = (suggestion) => {
    onChange({
      ...state,
      address: {
        ...(state.address || {}),
        streetName: suggestion.streetName || '',
        houseNumber: suggestion.houseNumber || '',
        postalCode: suggestion.postalCode || '',
        city: suggestion.city || '',
        country: suggestion.country === 'Germany' ? 'Deutschland' : (suggestion.country || state.address?.country || 'Deutschland'),
        addressLine1: suggestion.addressLine1 || '',
      },
    });
    setAddressSuggestions([]);
  };

  const setChildrenHas = (nextValue) => {
    if (nextValue === 'Ja') {
      const nextCount = normalizeChildrenCount(state.home?.childrenCount || '1') || '1';
      const nextDetails = syncChildrenDetails(state.home?.childrenDetails, nextCount);
      onChange({
        ...state,
        home: {
          ...(state.home || {}),
          childrenHas: 'Ja',
          childrenCount: nextCount,
          childrenDetails: nextDetails,
          childrenNames: serializeChildrenDetails(nextDetails),
        },
      });
      return;
    }
    onChange({
      ...state,
      home: {
        ...(state.home || {}),
        childrenHas: nextValue === 'Nein' ? 'Nein' : '',
        childrenCount: '',
        childrenDetails: [],
        childrenNames: '',
      },
    });
  };

  const setChildrenCount = (nextValue) => {
    const normalizedCount = normalizeChildrenCount(nextValue);
    const nextDetails = syncChildrenDetails(state.home?.childrenDetails, normalizedCount);
    onChange({
      ...state,
      home: {
        ...(state.home || {}),
        childrenHas: state.home?.childrenHas || 'Ja',
        childrenCount: normalizedCount,
        childrenDetails: nextDetails,
        childrenNames: serializeChildrenDetails(nextDetails),
      },
    });
  };

  const setChildDetail = (index, key, nextValue) => {
    const nextDetails = syncChildrenDetails(state.home?.childrenDetails, childrenCountValue);
    nextDetails[index] = {
      ...(nextDetails[index] || { name: '', birthdate: '' }),
      [key]: nextValue,
    };
    onChange({
      ...state,
      home: {
        ...(state.home || {}),
        childrenHas: state.home?.childrenHas || 'Ja',
        childrenCount: childrenCountValue,
        childrenDetails: nextDetails,
        childrenNames: serializeChildrenDetails(nextDetails),
      },
    });
  };

  return (
    <div className="public-form-sections">
      <Section title={copy.identity}>
        <Field label={copy.firstName} value={state.firstName} onChange={setTop('firstName')} disabled={disabled} required />
        <Field label={copy.middleName} value={state.personal.middleName} onChange={setNested('personal', 'middleName')} disabled={disabled} />
        <Field label={copy.lastName} value={state.lastName} onChange={setTop('lastName')} disabled={disabled} required />
        <SelectField label={copy.language} value={state.account.language} onChange={setNested('account', 'language')} disabled={disabled} options={localizedOptions.languages} placeholder={copy.selectPlaceholder} />
        <SelectField label={copy.taxClass} value={state.taxClass} onChange={setTop('taxClass')} disabled={disabled} options={TAX_CLASS_OPTIONS} placeholder={copy.selectPlaceholder} />
      </Section>

      <Section title={copy.personalData}>
        <DateField label={copy.birthDay} value={state.personal.birthdate} onChange={setNested('personal', 'birthdate')} disabled={disabled} required />
        <Field label={copy.birthPlace} value={state.personal.birthPlace} onChange={setNested('personal', 'birthPlace')} disabled={disabled} required />
        <Field label={copy.birthName} value={state.personal.birthName} onChange={setNested('personal', 'birthName')} disabled={disabled} required />
        <SelectField label={copy.gender} value={state.personal.gender} onChange={setNested('personal', 'gender')} disabled={disabled} options={localizedOptions.genders} placeholder={copy.selectPlaceholder} required />
        <SelectField label={copy.nationality} value={state.personal.nationality} onChange={setNested('personal', 'nationality')} disabled={disabled} options={localizedOptions.nationalities} placeholder={copy.selectPlaceholder} required />
        <SelectField label={copy.maritalStatus} value={state.home.maritalStatus} onChange={setNested('home', 'maritalStatus')} disabled={disabled} options={localizedOptions.maritalStatuses} placeholder={copy.selectPlaceholder} required />
      </Section>

      <Section title={copy.address}>
        <label className="public-form-field public-address-search-field" style={{ gridColumn: '1 / -1' }}>
          <span>{copy.addressSearch}</span>
          <input
            className="public-form-control"
            type="text"
            value={addressSearch}
            onChange={(e) => setAddressSearch(e.target.value)}
            placeholder={copy.searchAddressPlaceholder}
            disabled={disabled}
          />
          <small className="muted">{copy.addressHelp}</small>
          {addressSearchLoading && <div className="public-address-suggestions">{copy.searching}</div>}
          {!addressSearchLoading && addressSuggestions.length > 0 && (
            <div className="public-address-suggestions">
              {addressSuggestions.map((suggestion) => (
                <button key={suggestion.id} type="button" className="public-address-suggestion" onClick={() => applyAddressSuggestion(suggestion)}>
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}
        </label>
        <Field label={copy.streetName} value={state.address.streetName} onChange={setNested('address', 'streetName')} disabled={disabled} required />
        <Field label={copy.houseNumber} value={state.address.houseNumber} onChange={setNested('address', 'houseNumber')} disabled={disabled} required />
        <Field label={copy.addressLine2} value={state.address.addressLine1} onChange={setNested('address', 'addressLine1')} disabled={disabled} />
        <Field label={copy.postalCode} value={state.address.postalCode} onChange={setNested('address', 'postalCode')} disabled={disabled} required />
        <Field label={copy.city} value={state.address.city} onChange={setNested('address', 'city')} disabled={disabled} required />
        <Field label={copy.country} value={state.address.country} onChange={setNested('address', 'country')} disabled={disabled} />
      </Section>

      <Section title={copy.privateContactFamily}>
        <Field label={copy.privateEmail} type="email" value={state.home.privateEmail} onChange={setNested('home', 'privateEmail')} disabled={disabled} />
        <Field label={copy.personalMobile} value={state.home.personalMobile} onChange={setNested('home', 'personalMobile')} disabled={disabled} />
        <SelectField
          label={dynamicChildrenCopy.childrenToggle}
          value={childrenHasValue}
          onChange={setChildrenHas}
          disabled={disabled}
          options={localizedOptions.yesNo}
          placeholder={copy.selectPlaceholder}
          required
        />
        {childrenHasValue === 'Ja' && (
          <SelectField
            label={dynamicChildrenCopy.childrenCount}
            value={childrenCountValue}
            onChange={setChildrenCount}
            disabled={disabled}
            options={['1', '2', '3', '4', '5', '6'].map((value) => ({ value, label: value }))}
            placeholder={copy.selectPlaceholder}
            required
          />
        )}
        {childrenHasValue === 'Ja' && childrenCountValue && childrenDetails.map((child, index) => (
          <div key={`child-${index}`} className="public-form-grid" style={{ gridColumn: '1 / -1' }}>
            <Field
              label={`${dynamicChildrenCopy.childName} ${index + 1}`}
              value={child.name}
              onChange={(next) => setChildDetail(index, 'name', next)}
              disabled={disabled}
              required
            />
            <DateField
              label={`${dynamicChildrenCopy.childBirthDate} ${index + 1}`}
              value={child.birthdate}
              onChange={(next) => setChildDetail(index, 'birthdate', next)}
              disabled={disabled}
              required
            />
          </div>
        ))}
      </Section>

      <Section title={copy.financial}>
        <Field label={copy.bankName} value={state.financial.bankName} onChange={setNested('financial', 'bankName')} disabled={disabled} />
        <Field label={copy.accountHolder} value={state.financial.accountHolderName} onChange={setNested('financial', 'accountHolderName')} disabled={disabled} />
        <Field label={copy.iban} value={state.financial.iban} onChange={setNested('financial', 'iban')} disabled={disabled} />
        <Field label={copy.bic} value={state.financial.bic} onChange={setNested('financial', 'bic')} disabled={disabled} />
        <Field label={copy.taxId} value={state.financial.taxId} onChange={setNested('financial', 'taxId')} disabled={disabled} pattern="[0-9]{11}" title="Tax ID must contain exactly 11 digits" minLength={11} maxLength={11} required />
        <Field label={copy.svNumber} value={state.financial.nationalInsuranceNumber} onChange={setNested('financial', 'nationalInsuranceNumber')} disabled={disabled} pattern="[0-9]{8}[A-Z][0-9]{3}" title="Use format like 18140287K073" minLength={12} maxLength={12} />
        <SelectField label={copy.insuranceCompany} value={state.financial.insuranceCompany} onChange={setNested('financial', 'insuranceCompany')} disabled={disabled} options={INSURANCE_COMPANY_OPTIONS} placeholder={copy.selectPlaceholder} />
        <SelectField label={copy.churchTax} value={state.financial.churchTax} onChange={setNested('financial', 'churchTax')} disabled={disabled} options={localizedOptions.yesNo} placeholder={copy.selectPlaceholder} />
        {state.financial.churchTax === 'Ja' && (
          <SelectField label={copy.churchTaxType} value={state.financial.churchTaxType} onChange={setNested('financial', 'churchTaxType')} disabled={disabled} options={localizedOptions.churchTaxTypes} placeholder={copy.selectPlaceholder} />
        )}
      </Section>

      <Section title={copy.driverLicense}>
        <DateField label={copy.drivingLicenseIssueDate} value={state.dspLocal.fuehrerschein_aufstellungsdatum} onChange={setNested('dspLocal', 'fuehrerschein_aufstellungsdatum')} disabled={disabled} />
        <DateField label={copy.drivingLicenseExpiryDate} value={state.dspLocal.fuehrerschein_ablaufsdatum} onChange={setNested('dspLocal', 'fuehrerschein_ablaufsdatum')} disabled={disabled} />
        <Field label={copy.drivingLicenseAuthority} value={state.dspLocal.fuehrerschein_aufstellungsbehoerde} onChange={setNested('dspLocal', 'fuehrerschein_aufstellungsbehoerde')} disabled={disabled} />
      </Section>

      <Section title={copy.uniform}>
        <SelectField label={copy.jacke} value={state.uniform.jacke} onChange={setNested('uniform', 'jacke')} disabled={disabled} options={UNIFORM_SIZE_OPTIONS} placeholder={copy.selectPlaceholder} required />
        <SelectField label={copy.hose} value={state.uniform.hose} onChange={setNested('uniform', 'hose')} disabled={disabled} options={UNIFORM_SIZE_OPTIONS} placeholder={copy.selectPlaceholder} required />
        <SelectField label={copy.shirt} value={state.uniform.shirt} onChange={setNested('uniform', 'shirt')} disabled={disabled} options={UNIFORM_SIZE_OPTIONS} placeholder={copy.selectPlaceholder} required />
        <SelectField label={copy.schuhe} value={state.uniform.schuhe} onChange={setNested('uniform', 'schuhe')} disabled={disabled} options={SHOE_SIZE_OPTIONS} placeholder={copy.selectPlaceholder} required />
      </Section>
    </div>
  );
}
