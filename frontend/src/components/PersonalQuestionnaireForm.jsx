import React from 'react';
import { getPersonalQuestionnaireCopy } from './personalQuestionnaireI18n.js';

export function createEmptyPersonalQuestionnaire() {
  return {
    firstName: '',
    lastName: '',
    taxClass: '',
    account: {
      language: 'de',
      email: '',
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
      managerKenjoId: '',
    },
    address: {
      streetName: '',
      houseNumber: '',
      addressLine1: '',
      postalCode: '',
      city: '',
      country: '',
    },
    home: {
      maritalStatus: '',
      privateEmail: '',
      personalMobile: '',
      childrenCount: '',
      childrenNames: '',
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
      fuehrerschein_ablaufsdatum: '',
      fuehrerschein_aufstellungsbehoerde: '',
    },
    uniform: {
      jacke: '',
      hose: '',
      shirt: '',
      schuhe: '',
    },
  };
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

function Field({ label, children }) {
  return (
    <label className="public-form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function PersonalQuestionnaireForm({
  value,
  onChange,
  disabled = false,
  locale = 'de',
}) {
  const copy = getPersonalQuestionnaireCopy(locale);
  const form = React.useMemo(() => ({ ...createEmptyPersonalQuestionnaire(), ...(value || {}) }), [value]);

  function updateRoot(key, nextValue) {
    onChange?.({ ...form, [key]: nextValue });
  }

  function updateGroup(groupKey, fieldKey, nextValue) {
    onChange?.({
      ...form,
      [groupKey]: {
        ...(form[groupKey] || {}),
        [fieldKey]: nextValue,
      },
    });
  }

  function updateName(key, nextValue) {
    onChange?.({
      ...form,
      [key]: nextValue,
      personal: {
        ...(form.personal || {}),
        [key]: nextValue,
      },
    });
  }

  return (
    <div className="public-form-sections">
      <Section title={copy.identity}>
        <Field label={copy.firstName}>
          <input className="public-form-control" value={form.firstName || ''} disabled={disabled} onChange={(e) => updateName('firstName', e.target.value)} />
        </Field>
        <Field label={copy.middleName}>
          <input className="public-form-control" value={form.personal?.middleName || ''} disabled={disabled} onChange={(e) => updateGroup('personal', 'middleName', e.target.value)} />
        </Field>
        <Field label={copy.lastName}>
          <input className="public-form-control" value={form.lastName || ''} disabled={disabled} onChange={(e) => updateName('lastName', e.target.value)} />
        </Field>
        <Field label={copy.language}>
          <select className="public-form-control" value={form.account?.language || 'de'} disabled={disabled} onChange={(e) => updateGroup('account', 'language', e.target.value)}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
            <option value="ru">Russian</option>
          </select>
        </Field>
        <Field label={copy.taxClass}>
          <input className="public-form-control" value={form.taxClass || ''} disabled={disabled} onChange={(e) => updateRoot('taxClass', e.target.value)} />
        </Field>
      </Section>

      <Section title={copy.personalData}>
        <Field label={copy.birthDay}>
          <input className="public-form-control" type="date" value={form.personal?.birthdate || ''} disabled={disabled} onChange={(e) => updateGroup('personal', 'birthdate', e.target.value)} />
        </Field>
        <Field label={copy.birthPlace}>
          <input className="public-form-control" value={form.personal?.birthPlace || ''} disabled={disabled} onChange={(e) => updateGroup('personal', 'birthPlace', e.target.value)} />
        </Field>
        <Field label={copy.birthName}>
          <input className="public-form-control" value={form.personal?.birthName || ''} disabled={disabled} onChange={(e) => updateGroup('personal', 'birthName', e.target.value)} />
        </Field>
        <Field label={copy.gender}>
          <input className="public-form-control" value={form.personal?.gender || ''} disabled={disabled} onChange={(e) => updateGroup('personal', 'gender', e.target.value)} />
        </Field>
        <Field label={copy.nationality}>
          <input className="public-form-control" value={form.personal?.nationality || ''} disabled={disabled} onChange={(e) => updateGroup('personal', 'nationality', e.target.value)} />
        </Field>
        <Field label={copy.maritalStatus}>
          <input className="public-form-control" value={form.home?.maritalStatus || ''} disabled={disabled} onChange={(e) => updateGroup('home', 'maritalStatus', e.target.value)} />
        </Field>
      </Section>

      <Section title={copy.address}>
        <Field label={copy.streetName}>
          <input className="public-form-control" value={form.address?.streetName || ''} disabled={disabled} onChange={(e) => updateGroup('address', 'streetName', e.target.value)} />
        </Field>
        <Field label={copy.houseNumber}>
          <input className="public-form-control" value={form.address?.houseNumber || ''} disabled={disabled} onChange={(e) => updateGroup('address', 'houseNumber', e.target.value)} />
        </Field>
        <Field label={copy.addressLine2}>
          <input className="public-form-control" value={form.address?.addressLine1 || ''} disabled={disabled} onChange={(e) => updateGroup('address', 'addressLine1', e.target.value)} />
        </Field>
        <Field label={copy.postalCode}>
          <input className="public-form-control" value={form.address?.postalCode || ''} disabled={disabled} onChange={(e) => updateGroup('address', 'postalCode', e.target.value)} />
        </Field>
        <Field label={copy.city}>
          <input className="public-form-control" value={form.address?.city || ''} disabled={disabled} onChange={(e) => updateGroup('address', 'city', e.target.value)} />
        </Field>
        <Field label={copy.country}>
          <input className="public-form-control" value={form.address?.country || ''} disabled={disabled} onChange={(e) => updateGroup('address', 'country', e.target.value)} />
        </Field>
      </Section>

      <Section title={copy.privateContactFamily}>
        <Field label={copy.privateEmail}>
          <input className="public-form-control" type="email" value={form.home?.privateEmail || ''} disabled={disabled} onChange={(e) => updateGroup('home', 'privateEmail', e.target.value)} />
        </Field>
        <Field label={copy.personalMobile}>
          <input className="public-form-control" value={form.home?.personalMobile || ''} disabled={disabled} onChange={(e) => updateGroup('home', 'personalMobile', e.target.value)} />
        </Field>
        <Field label={copy.children}>
          <input className="public-form-control" value={form.home?.childrenCount || ''} disabled={disabled} onChange={(e) => updateGroup('home', 'childrenCount', e.target.value)} />
        </Field>
        <Field label={copy.childNamesBirthDate}>
          <textarea className="public-form-control" value={form.home?.childrenNames || ''} disabled={disabled} onChange={(e) => updateGroup('home', 'childrenNames', e.target.value)} />
        </Field>
      </Section>

      <Section title={copy.financial}>
        <Field label={copy.bankName}>
          <input className="public-form-control" value={form.financial?.bankName || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'bankName', e.target.value)} />
        </Field>
        <Field label={copy.accountHolder}>
          <input className="public-form-control" value={form.financial?.accountHolderName || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'accountHolderName', e.target.value)} />
        </Field>
        <Field label={copy.iban}>
          <input className="public-form-control" value={form.financial?.iban || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'iban', e.target.value)} />
        </Field>
        <Field label={copy.bic}>
          <input className="public-form-control" value={form.financial?.bic || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'bic', e.target.value)} />
        </Field>
        <Field label={copy.taxId}>
          <input className="public-form-control" value={form.financial?.taxId || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'taxId', e.target.value)} />
        </Field>
        <Field label={copy.svNumber}>
          <input className="public-form-control" value={form.financial?.nationalInsuranceNumber || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'nationalInsuranceNumber', e.target.value)} />
        </Field>
        <Field label={copy.insuranceCompany}>
          <input className="public-form-control" value={form.financial?.insuranceCompany || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'insuranceCompany', e.target.value)} />
        </Field>
        <Field label={copy.churchTax}>
          <input className="public-form-control" value={form.financial?.churchTax || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'churchTax', e.target.value)} />
        </Field>
        <Field label={copy.churchTaxType}>
          <input className="public-form-control" value={form.financial?.churchTaxType || ''} disabled={disabled} onChange={(e) => updateGroup('financial', 'churchTaxType', e.target.value)} />
        </Field>
      </Section>

      <Section title={copy.driverLicense}>
        <Field label={copy.drivingLicenseIssueDate}>
          <input className="public-form-control" type="date" value={form.dspLocal?.fuehrerschein_aufstellungsdatum || ''} disabled={disabled} onChange={(e) => updateGroup('dspLocal', 'fuehrerschein_aufstellungsdatum', e.target.value)} />
        </Field>
        <Field label={copy.drivingLicenseExpiryDate}>
          <input className="public-form-control" type="date" value={form.dspLocal?.fuehrerschein_ablaufsdatum || ''} disabled={disabled} onChange={(e) => updateGroup('dspLocal', 'fuehrerschein_ablaufsdatum', e.target.value)} />
        </Field>
        <Field label={copy.drivingLicenseAuthority}>
          <input className="public-form-control" value={form.dspLocal?.fuehrerschein_aufstellungsbehoerde || ''} disabled={disabled} onChange={(e) => updateGroup('dspLocal', 'fuehrerschein_aufstellungsbehoerde', e.target.value)} />
        </Field>
      </Section>

      <Section title={copy.uniform}>
        <Field label={copy.jacke}>
          <input className="public-form-control" value={form.uniform?.jacke || ''} disabled={disabled} onChange={(e) => updateGroup('uniform', 'jacke', e.target.value)} />
        </Field>
        <Field label={copy.hose}>
          <input className="public-form-control" value={form.uniform?.hose || ''} disabled={disabled} onChange={(e) => updateGroup('uniform', 'hose', e.target.value)} />
        </Field>
        <Field label={copy.shirt}>
          <input className="public-form-control" value={form.uniform?.shirt || ''} disabled={disabled} onChange={(e) => updateGroup('uniform', 'shirt', e.target.value)} />
        </Field>
        <Field label={copy.schuhe}>
          <input className="public-form-control" value={form.uniform?.schuhe || ''} disabled={disabled} onChange={(e) => updateGroup('uniform', 'schuhe', e.target.value)} />
        </Field>
      </Section>
    </div>
  );
}
