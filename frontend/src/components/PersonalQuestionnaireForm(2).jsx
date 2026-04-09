import { useEffect, useState } from 'react';
import { searchAddressSuggestions } from '../services/publicFormsApi.js';

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

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  textarea = false,
  required = false,
  pattern,
  title,
  maxLength,
  minLength,
}) {
  const props = {
    className: 'public-form-control',
    type,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
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

function SelectField({ label, value, onChange, disabled, options, required = false }) {
  return (
    <label className="public-form-field">
      <span>{label}{required ? ' *' : ''}</span>
      <select className="public-form-control" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} required={required}>
        <option value="">Select...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const TAX_CLASS_OPTIONS = ['1', '2', '3', '4', '5', '6'].map((value) => ({ value, label: value }));
const LANGUAGE_OPTIONS = [
  'English',
  'Русский',
  'Deutsch',
  'Français',
  'Italiano',
  'Español',
  'Polski',
  'Українська',
  'Nederlands',
  'Română',
  'Magyar',
  'العربية',
].map((value) => ({ value, label: value }));
const MARITAL_STATUS_OPTIONS = [
  { value: 'ledig', label: 'ledig' },
  { value: 'verhairatet', label: 'verhairatet' },
  { value: 'geschieden', label: 'geschieden' },
  { value: 'verwitwet', label: 'verwitwet' },
];
const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Non-Binary', label: 'Non-Binary' },
];
const UNIFORM_SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((value) => ({ value, label: value }));
const SHOE_SIZE_OPTIONS = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'].map((value) => ({ value, label: value }));
const YES_NO_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
];
const CHURCH_TAX_OPTIONS = [
  'Roman Catholic',
  'Protestant (Evangelical Church - EKD)',
  'Old Catholic',
  'Jewish Community',
  'Free Religious Community',
  'Evangelical Free Church',
].map((value) => ({ value, label: value }));
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
const NATIONALITY_OPTIONS = [
  'Afghan','Albanian','Algerian','American','Andorran','Angolan','Argentine','Armenian','Australian','Austrian','Azerbaijani',
  'Bahamian','Bahraini','Bangladeshi','Barbadian','Belarusian','Belgian','Belizean','Beninese','Bhutanese','Bolivian','Bosnian','Botswanan','Brazilian','British','Bruneian','Bulgarian','Burkinabé','Burmese','Burundian',
  'Cambodian','Cameroonian','Canadian','Cape Verdean','Central African','Chadian','Chilean','Chinese','Colombian','Comorian','Congolese','Costa Rican','Croatian','Cuban','Cypriot','Czech',
  'Danish','Djiboutian','Dominican','Dutch',
  'East Timorese','Ecuadorian','Egyptian','Emirati','Equatorial Guinean','Eritrean','Estonian','Ethiopian',
  'Fijian','Filipino','Finnish','French',
  'Gabonese','Gambian','Georgian','German','Ghanaian','Greek','Grenadian','Guatemalan','Guinean','Guyanese',
  'Haitian','Honduran','Hungarian',
  'Icelandic','Indian','Indonesian','Iranian','Iraqi','Irish','Israeli','Italian','Ivorian',
  'Jamaican','Japanese','Jordanian',
  'Kazakh','Kenyan','Kuwaiti','Kyrgyz',
  'Lao','Latvian','Lebanese','Liberian','Libyan','Liechtensteiner','Lithuanian','Luxembourgish',
  'Malagasy','Malawian','Malaysian','Maldivian','Malian','Maltese','Mauritanian','Mauritian','Mexican','Moldovan','Monégasque','Mongolian','Montenegrin','Moroccan','Mozambican',
  'Namibian','Nepalese','New Zealander','Nicaraguan','Nigerien','Nigerian','North Korean','North Macedonian','Norwegian',
  'Omani',
  'Pakistani','Palestinian','Panamanian','Papua New Guinean','Paraguayan','Peruvian','Polish','Portuguese',
  'Qatari',
  'Romanian','Russian','Rwandan',
  'Saint Lucian','Salvadoran','Samoan','Saudi','Scottish','Senegalese','Serbian','Seychellois','Sierra Leonean','Singaporean','Slovak','Slovenian','Somali','South African','South Korean','Spanish','Sri Lankan','Sudanese','Surinamese','Swedish','Swiss','Syrian',
  'Taiwanese','Tajik','Tanzanian','Thai','Togolese','Tongan','Trinidadian','Tunisian','Turkish','Turkmen',
  'Ugandan','Ukrainian','Uruguayan','Uzbek',
  'Venezuelan','Vietnamese',
  'Welsh',
  'Yemeni',
  'Zambian','Zimbabwean',
].map((value) => ({ value, label: value }));

export function createEmptyPersonalQuestionnaire() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    taxClass: '',
    account: {
      email: '',
      language: '',
    },
    personal: {
      firstName: '',
      lastName: '',
      displayName: '',
      birthdate: '',
      birthPlace: '',
      birthName: '',
      gender: '',
      nationality: '',
    },
    address: {
      streetName: '',
      houseNumber: '',
      addressLine1: '',
      postalCode: '',
      city: '',
      country: 'Germany',
    },
    home: {
      maritalStatus: '',
      personalMobile: '',
      childrenCount: '',
      childrenNames: '',
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
    extra: {
    },
    uniform: {
      jacke: '',
      hose: '',
      shirt: '',
      schuhe: '',
    },
  };
}

function Section({ title, subtitle, children }) {
  return (
    <section className="public-form-section">
      <div className="public-form-section-head">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="public-form-grid">{children}</div>
    </section>
  );
}

export default function PersonalQuestionnaireForm({ value, onChange, disabled = false }) {
  const state = value || createEmptyPersonalQuestionnaire();
  const setTop = (key) => (next) => onChange(updateTopLevel(state, key, next));
  const setNested = (section, key) => (next) => onChange(updateNestedValue(state, section, key, next));
  const [addressSearch, setAddressSearch] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);

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
        if (!cancelled) {
          setAddressSuggestions(results);
        }
      } catch (_) {
        if (!cancelled) {
          setAddressSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setAddressSearchLoading(false);
        }
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
        country: suggestion.country || state.address?.country || 'Germany',
        addressLine1: suggestion.addressLine1 || '',
      },
    });
    setAddressSuggestions([]);
  };

  return (
    <div className="public-form-sections">
      <Section
        title="Identity"
        subtitle="Main employee identity fields from the profile page."
      >
        <Field label="First name" value={state.firstName} onChange={setTop('firstName')} disabled={disabled} required />
        <Field label="Middle name" value={state.personal.middleName} onChange={setNested('personal', 'middleName')} disabled={disabled} />
        <Field label="Last name" value={state.lastName} onChange={setTop('lastName')} disabled={disabled} required />
        <SelectField label="Language" value={state.account.language} onChange={setNested('account', 'language')} disabled={disabled} options={LANGUAGE_OPTIONS} />
        <SelectField label="Tax Class" value={state.taxClass} onChange={setTop('taxClass')} disabled={disabled} options={TAX_CLASS_OPTIONS} />
      </Section>

      <Section
        title="Personal Data"
        subtitle="Personal profile fields that are visible on the employee page."
      >
        <Field label="Birth day" type="date" value={state.personal.birthdate} onChange={setNested('personal', 'birthdate')} disabled={disabled} required />
        <Field label="Birth place" value={state.personal.birthPlace} onChange={setNested('personal', 'birthPlace')} disabled={disabled} required />
        <Field label="Birth name" value={state.personal.birthName} onChange={setNested('personal', 'birthName')} disabled={disabled} />
        <SelectField label="Gender" value={state.personal.gender} onChange={setNested('personal', 'gender')} disabled={disabled} options={GENDER_OPTIONS} required />
        <SelectField label="Nationality" value={state.personal.nationality} onChange={setNested('personal', 'nationality')} disabled={disabled} options={NATIONALITY_OPTIONS} required />
        <SelectField
          label="Marital status"
          value={state.home.maritalStatus}
          onChange={setNested('home', 'maritalStatus')}
          disabled={disabled}
          options={MARITAL_STATUS_OPTIONS}
          required
        />
      </Section>

      <Section
        title="Address"
        subtitle="Structured address fields instead of one compressed line."
      >
        <label className="public-form-field public-address-search-field" style={{ gridColumn: '1 / -1' }}>
          <span>Address search</span>
          <input
            className="public-form-control"
            type="text"
            value={addressSearch}
            onChange={(e) => setAddressSearch(e.target.value)}
            placeholder="Start typing your address..."
            disabled={disabled}
          />
          <small className="muted">Suggestions use OpenStreetMap address data.</small>
          {addressSearchLoading && <div className="public-address-suggestions">Searching...</div>}
          {!addressSearchLoading && addressSuggestions.length > 0 && (
            <div className="public-address-suggestions">
              {addressSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className="public-address-suggestion"
                  onClick={() => applyAddressSuggestion(suggestion)}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}
        </label>
        <Field label="Street name" value={state.address.streetName} onChange={setNested('address', 'streetName')} disabled={disabled} required />
        <Field label="House number" value={state.address.houseNumber} onChange={setNested('address', 'houseNumber')} disabled={disabled} required />
        <Field label="Address line 2" value={state.address.addressLine1} onChange={setNested('address', 'addressLine1')} disabled={disabled} />
        <Field label="Postal code" value={state.address.postalCode} onChange={setNested('address', 'postalCode')} disabled={disabled} required />
        <Field label="City" value={state.address.city} onChange={setNested('address', 'city')} disabled={disabled} required />
        <Field label="Country" value={state.address.country} onChange={setNested('address', 'country')} disabled={disabled} />
      </Section>

      <Section
        title="Private Contact & Family"
        subtitle="Private contact details and children information from the employee profile."
      >
        <Field label="Private email" type="email" value={state.home.privateEmail} onChange={setNested('home', 'privateEmail')} disabled={disabled} />
        <Field label="Personal mobile" value={state.home.personalMobile} onChange={setNested('home', 'personalMobile')} disabled={disabled} />
        <Field label="Children" type="number" value={state.home.childrenCount} onChange={setNested('home', 'childrenCount')} disabled={disabled} required />
        <Field label="Child names and Birth date" value={state.home.childrenNames} onChange={setNested('home', 'childrenNames')} disabled={disabled} textarea />
      </Section>

      <Section
        title="Financial"
        subtitle="Banking and tax details needed later on the employee page."
      >
        <Field label="Bank name" value={state.financial.bankName} onChange={setNested('financial', 'bankName')} disabled={disabled} />
        <Field label="Name on card / account holder" value={state.financial.accountHolderName} onChange={setNested('financial', 'accountHolderName')} disabled={disabled} />
        <Field label="IBAN" value={state.financial.iban} onChange={setNested('financial', 'iban')} disabled={disabled} />
        <Field label="BIC" value={state.financial.bic} onChange={setNested('financial', 'bic')} disabled={disabled} />
        <Field
          label="Tax ID"
          value={state.financial.taxId}
          onChange={setNested('financial', 'taxId')}
          disabled={disabled}
          pattern="[0-9]{11}"
          title="Tax ID must contain exactly 11 digits"
          minLength={11}
          maxLength={11}
        />
        <Field
          label="SV-number"
          value={state.financial.nationalInsuranceNumber}
          onChange={setNested('financial', 'nationalInsuranceNumber')}
          disabled={disabled}
          pattern="[0-9]{8}[A-Z][0-9]{3}"
          title="Use format like 18140287K073"
          minLength={12}
          maxLength={12}
        />
        <SelectField
          label="Insurance Company"
          value={state.financial.insuranceCompany}
          onChange={setNested('financial', 'insuranceCompany')}
          disabled={disabled}
          options={INSURANCE_COMPANY_OPTIONS}
        />
        <SelectField label="Church tax" value={state.financial.churchTax} onChange={setNested('financial', 'churchTax')} disabled={disabled} options={YES_NO_OPTIONS} />
        {state.financial.churchTax === 'Yes' && (
          <SelectField
            label="Church tax type"
            value={state.financial.churchTaxType}
            onChange={setNested('financial', 'churchTaxType')}
            disabled={disabled}
            options={CHURCH_TAX_OPTIONS}
          />
        )}
      </Section>

      <Section
        title="Driver License"
        subtitle="Local DSP fields shown on the employee profile."
      >
        <Field
          label="Driving license issue date"
          type="date"
          value={state.dspLocal.fuehrerschein_aufstellungsdatum}
          onChange={setNested('dspLocal', 'fuehrerschein_aufstellungsdatum')}
          disabled={disabled}
        />
        <Field
          label="Driving license expiry date"
          type="date"
          value={state.dspLocal.fuehrerschein_ablaufsdatum}
          onChange={setNested('dspLocal', 'fuehrerschein_ablaufsdatum')}
          disabled={disabled}
        />
        <Field
          label="Driving license issuing authority"
          value={state.dspLocal.fuehrerschein_aufstellungsbehoerde}
          onChange={setNested('dspLocal', 'fuehrerschein_aufstellungsbehoerde')}
          disabled={disabled}
        />
      </Section>

      <Section
        title="Uniform"
        subtitle="Please choose the uniform sizes needed for onboarding."
      >
        <SelectField label="Jacke" value={state.uniform.jacke} onChange={setNested('uniform', 'jacke')} disabled={disabled} options={UNIFORM_SIZE_OPTIONS} />
        <SelectField label="Hose" value={state.uniform.hose} onChange={setNested('uniform', 'hose')} disabled={disabled} options={UNIFORM_SIZE_OPTIONS} />
        <SelectField label="Shirt" value={state.uniform.shirt} onChange={setNested('uniform', 'shirt')} disabled={disabled} options={UNIFORM_SIZE_OPTIONS} />
        <SelectField label="Schuhe" value={state.uniform.schuhe} onChange={setNested('uniform', 'schuhe')} disabled={disabled} options={SHOE_SIZE_OPTIONS} />
      </Section>
    </div>
  );
}
