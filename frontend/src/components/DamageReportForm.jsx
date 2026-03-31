function setField(state, key, value) {
  return { ...(state || {}), [key]: value };
}

function Field({ label, type = 'text', value, onChange, disabled, textarea = false }) {
  const controlProps = {
    className: 'public-form-control',
    type,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    disabled,
  };
  return (
    <label className="public-form-field">
      <span>{label}</span>
      {textarea ? <textarea {...controlProps} rows={5} /> : <input {...controlProps} />}
    </label>
  );
}

export function createEmptyDamageReport() {
  return {
    reporterName: '',
    reporterEmail: '',
    reporterPhone: '',
    driverName: '',
    licensePlate: '',
    incidentDate: '',
    incidentTime: '',
    location: '',
    description: '',
    damageSummary: '',
    witnesses: '',
  };
}

export default function DamageReportForm({ value, onChange, disabled = false }) {
  const state = value || createEmptyDamageReport();
  const handle = (key) => (nextValue) => onChange(setField(state, key, nextValue));

  return (
    <div className="public-form-sections">
      <section className="public-form-section">
        <h3>Reporter</h3>
        <div className="public-form-grid">
          <Field label="Reporter name" value={state.reporterName} onChange={handle('reporterName')} disabled={disabled} />
          <Field label="Reporter email" type="email" value={state.reporterEmail} onChange={handle('reporterEmail')} disabled={disabled} />
          <Field label="Reporter phone" value={state.reporterPhone} onChange={handle('reporterPhone')} disabled={disabled} />
          <Field label="Driver name" value={state.driverName} onChange={handle('driverName')} disabled={disabled} />
          <Field label="License plate" value={state.licensePlate} onChange={handle('licensePlate')} disabled={disabled} />
          <Field label="Incident date" type="date" value={state.incidentDate} onChange={handle('incidentDate')} disabled={disabled} />
          <Field label="Incident time" type="time" value={state.incidentTime} onChange={handle('incidentTime')} disabled={disabled} />
          <Field label="Location" value={state.location} onChange={handle('location')} disabled={disabled} />
          <Field label="Damage summary" value={state.damageSummary} onChange={handle('damageSummary')} disabled={disabled} textarea />
          <Field label="Description" value={state.description} onChange={handle('description')} disabled={disabled} textarea />
          <Field label="Witnesses" value={state.witnesses} onChange={handle('witnesses')} disabled={disabled} textarea />
        </div>
      </section>
    </div>
  );
}
