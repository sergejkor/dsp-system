function updateNestedValue(state, section, key, value) {
  return {
    ...state,
    [section]: {
      ...(state?.[section] || {}),
      [key]: value,
    },
  };
}

function Field({ label, type = 'text', value, onChange, placeholder, disabled, textarea = false }) {
  const controlProps = {
    className: 'public-form-control',
    type,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    placeholder,
    disabled,
  };
  return (
    <label className="public-form-field">
      <span>{label}</span>
      {textarea ? <textarea {...controlProps} rows={4} /> : <input {...controlProps} />}
    </label>
  );
}

export function createEmptyPersonalQuestionnaire() {
  return {
    account: { email: '', language: 'de' },
    personal: {
      salutation: '',
      firstName: '',
      middleName: '',
      lastName: '',
      birthName: '',
      birthDate: '',
      birthPlace: '',
      nationality: '',
      maritalStatus: '',
    },
    work: {
      startDate: '',
      contractEnd: '',
      probationUntil: '',
      jobTitle: '',
      transportationId: '',
      employeeNumber: '',
      weeklyHours: '40',
    },
    address: {
      street: '',
      zipCode: '',
      city: '',
      country: 'Germany',
    },
    home: {
      privateEmail: '',
      phone: '',
      mobilePhone: '',
    },
    financial: {
      iban: '',
      bic: '',
      taxId: '',
      socialSecurityNumber: '',
    },
    extra: {
      drivingLicenseNumber: '',
      drivingLicenseExpiry: '',
      notes: '',
    },
  };
}

export default function PersonalQuestionnaireForm({ value, onChange, disabled = false }) {
  const state = value || createEmptyPersonalQuestionnaire();
  const setField = (section, key) => (nextValue) => onChange(updateNestedValue(state, section, key, nextValue));

  return (
    <div className="public-form-sections">
      <section className="public-form-section">
        <h3>Personal</h3>
        <div className="public-form-grid">
          <Field label="Salutation" value={state.personal.salutation} onChange={setField('personal', 'salutation')} disabled={disabled} />
          <Field label="First name" value={state.personal.firstName} onChange={setField('personal', 'firstName')} disabled={disabled} />
          <Field label="Middle name" value={state.personal.middleName} onChange={setField('personal', 'middleName')} disabled={disabled} />
          <Field label="Last name" value={state.personal.lastName} onChange={setField('personal', 'lastName')} disabled={disabled} />
          <Field label="Birth name" value={state.personal.birthName} onChange={setField('personal', 'birthName')} disabled={disabled} />
          <Field label="Birth date" type="date" value={state.personal.birthDate} onChange={setField('personal', 'birthDate')} disabled={disabled} />
          <Field label="Birth place" value={state.personal.birthPlace} onChange={setField('personal', 'birthPlace')} disabled={disabled} />
          <Field label="Nationality" value={state.personal.nationality} onChange={setField('personal', 'nationality')} disabled={disabled} />
          <Field label="Marital status" value={state.personal.maritalStatus} onChange={setField('personal', 'maritalStatus')} disabled={disabled} />
        </div>
      </section>

      <section className="public-form-section">
        <h3>Contact</h3>
        <div className="public-form-grid">
          <Field label="Work email" type="email" value={state.account.email} onChange={setField('account', 'email')} disabled={disabled} />
          <Field label="Private email" type="email" value={state.home.privateEmail} onChange={setField('home', 'privateEmail')} disabled={disabled} />
          <Field label="Phone" value={state.home.phone} onChange={setField('home', 'phone')} disabled={disabled} />
          <Field label="Mobile phone" value={state.home.mobilePhone} onChange={setField('home', 'mobilePhone')} disabled={disabled} />
          <Field label="Street" value={state.address.street} onChange={setField('address', 'street')} disabled={disabled} />
          <Field label="ZIP code" value={state.address.zipCode} onChange={setField('address', 'zipCode')} disabled={disabled} />
          <Field label="City" value={state.address.city} onChange={setField('address', 'city')} disabled={disabled} />
          <Field label="Country" value={state.address.country} onChange={setField('address', 'country')} disabled={disabled} />
        </div>
      </section>

      <section className="public-form-section">
        <h3>Work</h3>
        <div className="public-form-grid">
          <Field label="Start date" type="date" value={state.work.startDate} onChange={setField('work', 'startDate')} disabled={disabled} />
          <Field label="Contract end" type="date" value={state.work.contractEnd} onChange={setField('work', 'contractEnd')} disabled={disabled} />
          <Field label="Probation until" type="date" value={state.work.probationUntil} onChange={setField('work', 'probationUntil')} disabled={disabled} />
          <Field label="Job title" value={state.work.jobTitle} onChange={setField('work', 'jobTitle')} disabled={disabled} />
          <Field label="Transportation ID" value={state.work.transportationId} onChange={setField('work', 'transportationId')} disabled={disabled} />
          <Field label="Employee number" value={state.work.employeeNumber} onChange={setField('work', 'employeeNumber')} disabled={disabled} />
          <Field label="Weekly hours" type="number" value={state.work.weeklyHours} onChange={setField('work', 'weeklyHours')} disabled={disabled} />
        </div>
      </section>

      <section className="public-form-section">
        <h3>Financial</h3>
        <div className="public-form-grid">
          <Field label="IBAN" value={state.financial.iban} onChange={setField('financial', 'iban')} disabled={disabled} />
          <Field label="BIC" value={state.financial.bic} onChange={setField('financial', 'bic')} disabled={disabled} />
          <Field label="Tax ID" value={state.financial.taxId} onChange={setField('financial', 'taxId')} disabled={disabled} />
          <Field label="Social Security Number" value={state.financial.socialSecurityNumber} onChange={setField('financial', 'socialSecurityNumber')} disabled={disabled} />
        </div>
      </section>

      <section className="public-form-section">
        <h3>Additional</h3>
        <div className="public-form-grid">
          <Field label="Driving license number" value={state.extra.drivingLicenseNumber} onChange={setField('extra', 'drivingLicenseNumber')} disabled={disabled} />
          <Field label="Driving license expiry" type="date" value={state.extra.drivingLicenseExpiry} onChange={setField('extra', 'drivingLicenseExpiry')} disabled={disabled} />
          <Field label="Notes" value={state.extra.notes} onChange={setField('extra', 'notes')} disabled={disabled} textarea />
        </div>
      </section>
    </div>
  );
}
