import { useEffect, useMemo, useState } from 'react';
import { searchAddressSuggestions } from '../services/publicFormsApi.js';

function setField(state, key, value) {
  return { ...(state || {}), [key]: value };
}

function setFields(state, nextPatch) {
  return { ...(state || {}), ...(nextPatch || {}) };
}

function todayDateIso() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  disabled,
  textarea = false,
  placeholder = '',
  list,
  autoComplete,
}) {
  const controlProps = {
    className: 'public-form-control',
    type,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    disabled,
    placeholder,
    list,
    autoComplete,
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
    opponentName: '',
    opponentEmail: '',
    opponentPhone: '',
    driverName: '',
    licensePlate: '',
    incidentDate: todayDateIso(),
    incidentTime: '',
    location: '',
    streetName: '',
    houseNumber: '',
    zipCode: '',
    city: '',
    description: '',
    damageSummary: '',
    witnesses: '',
  };
}

export default function DamageReportForm({ value, onChange, disabled = false, options = {} }) {
  const state = value || createEmptyDamageReport();
  const handle = (key) => (nextValue) => onChange(setField(state, key, nextValue));

  const drivers = Array.isArray(options?.drivers) ? options.drivers : [];
  const cars = Array.isArray(options?.cars) ? options.cars : [];

  const [addressQuery, setAddressQuery] = useState(state.location || '');
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);

  useEffect(() => {
    setAddressQuery(state.location || '');
  }, [state.location]);

  useEffect(() => {
    const query = String(addressQuery || '').trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const rows = await searchAddressSuggestions(query);
        if (!cancelled) {
          setAddressSuggestions(rows);
          setShowAddressSuggestions(true);
        }
      } catch {
        if (!cancelled) {
          setAddressSuggestions([]);
          setShowAddressSuggestions(false);
        }
      } finally {
        if (!cancelled) {
          setAddressLoading(false);
        }
      }
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addressQuery]);

  const driverListId = useMemo(() => 'damage-driver-options', []);
  const carListId = useMemo(() => 'damage-car-options', []);

  function handleLocationChange(nextValue) {
    setAddressQuery(nextValue);
    onChange(setField(state, 'location', nextValue));
  }

  function applyAddressSuggestion(item) {
    const patch = {
      location: item?.label || state.location || '',
      streetName: item?.streetName || '',
      houseNumber: item?.houseNumber || '',
      zipCode: item?.postalCode || '',
      city: item?.city || '',
    };
    onChange(setFields(state, patch));
    setAddressQuery(patch.location);
    setShowAddressSuggestions(false);
  }

  return (
    <div className="public-form-sections">
      <section className="public-form-section">
        <h3>Driver & Vehicle</h3>
        <div className="public-form-grid">
          <Field
            label="Driver"
            value={state.driverName}
            onChange={handle('driverName')}
            disabled={disabled}
            placeholder="Select or type a driver"
            list={driverListId}
            autoComplete="off"
          />
          <Field
            label="Vehicle (License plate)"
            value={state.licensePlate}
            onChange={handle('licensePlate')}
            disabled={disabled}
            placeholder="Select or type a license plate"
            list={carListId}
            autoComplete="off"
          />
        </div>
        <datalist id={driverListId}>
          {drivers.map((driver) => (
            <option key={driver.id || driver.name} value={driver.name || ''} />
          ))}
        </datalist>
        <datalist id={carListId}>
          {cars.map((car) => (
            <option key={car.id || car.licensePlate} value={car.licensePlate || ''} label={car.label || car.licensePlate || ''} />
          ))}
        </datalist>
      </section>

      <section className="public-form-section">
        <h3>Opponent</h3>
        <div className="public-form-grid">
          <Field label="Opponent name" value={state.opponentName} onChange={handle('opponentName')} disabled={disabled} />
          <Field label="Opponent email" type="email" value={state.opponentEmail} onChange={handle('opponentEmail')} disabled={disabled} />
          <Field label="Opponent phone" value={state.opponentPhone} onChange={handle('opponentPhone')} disabled={disabled} />
          <Field label="Incident date" type="date" value={state.incidentDate} onChange={handle('incidentDate')} disabled={disabled} />
          <Field label="Incident time" type="time" value={state.incidentTime} onChange={handle('incidentTime')} disabled={disabled} />

          <label className="public-form-field public-address-search-field">
            <span>Location</span>
            <input
              className="public-form-control"
              type="text"
              value={addressQuery}
              disabled={disabled}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="Search address or enter manually"
              autoComplete="off"
              onFocus={() => {
                if (addressSuggestions.length) setShowAddressSuggestions(true);
              }}
              onBlur={() => {
                setTimeout(() => setShowAddressSuggestions(false), 120);
              }}
            />
            {showAddressSuggestions && (
              <div className="public-address-suggestions">
                {addressLoading && <button type="button" className="public-address-suggestion" disabled>Searching…</button>}
                {!addressLoading && !addressSuggestions.length && (
                  <button type="button" className="public-address-suggestion" disabled>
                    No addresses found
                  </button>
                )}
                {!addressLoading &&
                  addressSuggestions.map((item) => (
                    <button
                      key={item.id || item.label}
                      type="button"
                      className="public-address-suggestion"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyAddressSuggestion(item);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>
            )}
          </label>

          <Field label="Street" value={state.streetName} onChange={handle('streetName')} disabled={disabled} />
          <Field label="House number" value={state.houseNumber} onChange={handle('houseNumber')} disabled={disabled} />
          <Field label="ZIP code" value={state.zipCode} onChange={handle('zipCode')} disabled={disabled} />
          <Field label="City" value={state.city} onChange={handle('city')} disabled={disabled} />
          <Field label="Damage summary" value={state.damageSummary} onChange={handle('damageSummary')} disabled={disabled} textarea />
          <Field label="Description" value={state.description} onChange={handle('description')} disabled={disabled} textarea />
          <Field label="Witnesses" value={state.witnesses} onChange={handle('witnesses')} disabled={disabled} textarea />
        </div>
      </section>
    </div>
  );
}
