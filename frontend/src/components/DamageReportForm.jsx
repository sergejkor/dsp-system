import { useEffect, useMemo, useRef, useState } from 'react';
import { searchAddressSuggestions } from '../services/publicFormsApi.js';

function setField(state, key, value) {
  return { ...(state || {}), [key]: value };
}

function setFields(state, nextPatch) {
  return { ...(state || {}), ...(nextPatch || {}) };
}

const OPPONENT_INSURANCE_OPTIONS = [
  'Allianz',
  'HUK-Coburg',
  'HUK24',
  'AXA',
  'ERGO',
  'DEVK',
  'R+V Versicherung',
  'HDI',
  'VHV Versicherungen',
  'Gothaer',
  'Württembergische',
  'LVM Versicherung',
  'Signal Iduna',
  'Barmenia',
  'Debeka',
  'Generali',
  'Zurich Gruppe Deutschland',
  'Concordia',
  'Provinzial',
  'Itzehoer Versicherung',
  'WGV Versicherung',
  'Verti Versicherung',
  'CosmosDirekt',
  'Sparkassen DirektVersicherung',
  'DA Direkt',
  'Kravag',
  'Basler Versicherung',
  'Nürnberger Versicherung',
  'Janitos Versicherung',
  'HanseMerkur',
  'Other',
];

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
  error = '',
  required = false,
}) {
  const controlProps = {
    className: `public-form-control${error ? ' is-invalid' : ''}`,
    type,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    disabled,
    placeholder,
    list,
    autoComplete,
  };
  return (
    <label className={`public-form-field public-form-field--boxed${error ? ' is-invalid' : ''}`}>
      <span>{label}{required ? ' *' : ''}</span>
      {textarea ? <textarea {...controlProps} rows={5} /> : <input {...controlProps} />}
      {error ? <small className="public-field-error">{error}</small> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options = [],
  disabled,
  error = '',
  required = false,
}) {
  return (
    <label className={`public-form-field public-form-field--boxed${error ? ' is-invalid' : ''}`}>
      <span>{label}{required ? ' *' : ''}</span>
      <select
        className={`public-form-control${error ? ' is-invalid' : ''}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {error ? <small className="public-field-error">{error}</small> : null}
    </label>
  );
}

function ComboField({
  label,
  value,
  onChange,
  options = [],
  disabled,
  placeholder = '',
  allowCustom = true,
  error = '',
  required = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const id = useMemo(() => `combo-${Math.random().toString(36).slice(2, 9)}`, []);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return options.slice(0, 80);
    return options.filter((item) => String(item || '').toLowerCase().includes(q)).slice(0, 80);
  }, [options, query]);

  return (
    <label className={`public-form-field public-form-field--boxed public-combo${error ? ' is-invalid' : ''}`}>
      <span>{label}{required ? ' *' : ''}</span>
      <div className="public-combo-control">
        <input
          className={`public-form-control${error ? ' is-invalid' : ''}`}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          readOnly={!allowCustom}
          onChange={(e) => {
            if (!allowCustom) return;
            const next = e.target.value;
            setQuery(next);
            onChange(next);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          aria-expanded={open}
          aria-controls={id}
        />
        <button
          type="button"
          className="public-combo-toggle"
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Toggle options"
        >
          ▼
        </button>
      </div>
      {open && (
        <div id={id} className="public-address-suggestions public-combo-menu">
          {!filtered.length && <button type="button" className="public-address-suggestion" disabled>No options</button>}
          {filtered.map((item) => (
            <button
              key={item}
              type="button"
              className="public-address-suggestion"
              onMouseDown={(event) => {
                event.preventDefault();
                setQuery(item);
                onChange(item);
                setOpen(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {error ? <small className="public-field-error">{error}</small> : null}
    </label>
  );
}

export function createEmptyDamageReport() {
  return {
    accidentType: 'with_other_car',
    rentalCar: false,
    rentalCarLicensePlate: '',
    thirdPartyPropertyDamaged: false,
    opponentName: '',
    opponentEmail: '',
    opponentPhone: '',
    opponentInsurance: '',
    opponentInsuranceOther: '',
    ownerFirstName: '',
    ownerLastName: '',
    ownerPhone: '',
    ownerEmail: '',
    witnessesPresent: false,
    witnessName: '',
    witnessSurname: '',
    witnessPhone: '',
    witnessEmail: '',
    driverName: '',
    licensePlate: '',
    incidentDate: todayDateIso(),
    incidentTime: '',
    location: '',
    streetName: '',
    houseNumber: '',
    zipCode: '',
    city: '',
    opponentInsuranceNumber: '',
    policeOnSite: null,
    policeStation: '',
    description: '',
  };
}

async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    lat: String(lat),
    lon: String(lon),
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
  if (!response.ok) throw new Error('Reverse geocode failed');
  const data = await response.json().catch(() => ({}));
  const address = data?.address || {};
  return {
    location: data?.display_name || '',
    streetName: String(address.road || '').trim(),
    houseNumber: String(address.house_number || '').trim(),
    zipCode: String(address.postcode || '').trim(),
    city: String(address.city || address.town || address.village || '').trim(),
  };
}

export default function DamageReportForm({ value, onChange, disabled = false, options = {}, copy = {}, errors = {} }) {
  const state = value || createEmptyDamageReport();
  const handle = (key) => (nextValue) => onChange(setField(state, key, nextValue));

  const drivers = (Array.isArray(options?.drivers) ? options.drivers : [])
    .map((driver) => String(driver?.name || '').trim())
    .filter(Boolean);
  const cars = (Array.isArray(options?.cars) ? options.cars : [])
    .map((car) => String(car?.licensePlate || '').trim())
    .filter(Boolean);

  const [addressQuery, setAddressQuery] = useState(state.location || '');
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isLocationFocused, setIsLocationFocused] = useState(false);
  const [locating, setLocating] = useState(false);
  const suppressSuggestionsUntilRef = useRef(0);

  useEffect(() => {
    setAddressQuery(state.location || '');
  }, [state.location]);

  useEffect(() => {
    if (Date.now() < suppressSuggestionsUntilRef.current) {
      setShowAddressSuggestions(false);
      return undefined;
    }
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
          setShowAddressSuggestions(isLocationFocused && rows.length > 0);
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
  }, [addressQuery, isLocationFocused]);

  function handleLocationChange(nextValue) {
    setAddressQuery(nextValue);
    onChange(setField(state, 'location', nextValue));
  }

  function applyAddressSuggestion(item) {
    suppressSuggestionsUntilRef.current = Date.now() + 900;
    setIsLocationFocused(false);
    const patch = {
      location: item?.label || state.location || '',
      streetName: item?.streetName || '',
      houseNumber: item?.houseNumber || '',
      zipCode: item?.postalCode || '',
      city: item?.city || '',
    };
    onChange(setFields(state, patch));
    setAddressQuery(patch.location);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }

  async function handleUseCurrentLocation() {
    if (!navigator.geolocation) return;
    setIsLocationFocused(false);
    setLocating(true);
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        });
      });
      const lat = position?.coords?.latitude;
      const lon = position?.coords?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('No location');
      const resolved = await reverseGeocode(lat, lon);
      suppressSuggestionsUntilRef.current = Date.now() + 1200;
      onChange(setFields(state, resolved));
      setAddressQuery(resolved.location || state.location || '');
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
    } catch {
      // silent fail to avoid blocking form
    } finally {
      setLocating(false);
    }
  }

  function renderLocationFields() {
    return (
      <>
        <label className={`public-form-field public-form-field--boxed public-address-search-field${errors.location ? ' is-invalid' : ''}`}>
          <span>{copy.location || 'Location'}</span>
          <input
            className={`public-form-control${errors.location ? ' is-invalid' : ''}`}
            type="text"
            value={addressQuery}
            disabled={disabled}
            onChange={(e) => handleLocationChange(e.target.value)}
            placeholder={copy.locationPlaceholder || 'Search address or enter manually'}
            autoComplete="off"
            onFocus={() => {
              setIsLocationFocused(true);
              if (addressSuggestions.length && Date.now() >= suppressSuggestionsUntilRef.current) {
                setShowAddressSuggestions(true);
              }
            }}
            onBlur={() => {
              setIsLocationFocused(false);
              setTimeout(() => setShowAddressSuggestions(false), 120);
            }}
          />
          <button
            type="button"
            className="btn-secondary public-location-btn"
            disabled={disabled || locating}
            onClick={handleUseCurrentLocation}
          >
            {locating ? (copy.locating || 'Locating...') : (copy.useCurrentLocation || 'Use current location')}
          </button>
          {showAddressSuggestions && (
            <div className="public-address-suggestions">
              {addressLoading && <button type="button" className="public-address-suggestion" disabled>{copy.searching || 'Searching...'}</button>}
              {!addressLoading && !addressSuggestions.length && (
                <button type="button" className="public-address-suggestion" disabled>
                  {copy.noAddresses || 'No addresses found'}
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
          {errors.location ? <small className="public-field-error">{errors.location}</small> : null}
        </label>
        <Field label={copy.street || 'Street'} value={state.streetName} onChange={handle('streetName')} disabled={disabled} required error={errors.streetName} />
        <Field label={copy.houseNumber || 'House number'} value={state.houseNumber} onChange={handle('houseNumber')} disabled={disabled} />
        <Field label={copy.zipCode || 'ZIP code'} value={state.zipCode} onChange={handle('zipCode')} disabled={disabled} />
        <Field label={copy.city || 'City'} value={state.city} onChange={handle('city')} disabled={disabled} required error={errors.city} />
      </>
    );
  }

  const withoutOtherCar = state.accidentType === 'without_other_car';
  const withOtherCar = !withoutOtherCar;
  const showThirdPartyOwner = withoutOtherCar && state.thirdPartyPropertyDamaged;

  return (
    <div className="public-form-sections">
      <section className="public-form-section">
        <h3>{copy.driverVehicleSection || 'Driver & Vehicle'}</h3>
        <div className="public-form-grid">
          <ComboField
            label={copy.driverLabel || 'Driver'}
            value={state.driverName}
            onChange={handle('driverName')}
            disabled={disabled}
            placeholder={copy.driverPlaceholder || 'Select or type a driver'}
            options={drivers}
            required
            error={errors.driverName}
          />
          <ComboField
            label={copy.vehicleLabel || 'Vehicle (License plate)'}
            value={state.licensePlate}
            onChange={handle('licensePlate')}
            disabled={disabled || !!state.rentalCar}
            placeholder={copy.vehiclePlaceholder || 'Select a license plate'}
            options={cars}
            allowCustom={false}
            required={!state.rentalCar}
            error={!state.rentalCar ? errors.licensePlate : ''}
          />
          <label className="public-form-field public-form-field--boxed">
            <span>{copy.rentalCar || 'Rental car'}</span>
            <div className="public-radio-row">
              <label>
                <input
                  type="checkbox"
                  checked={!!state.rentalCar}
                  onChange={(e) =>
                    onChange(
                      setFields(state, {
                        rentalCar: e.target.checked,
                        licensePlate: e.target.checked ? '' : state.licensePlate,
                        rentalCarLicensePlate: e.target.checked ? state.rentalCarLicensePlate : '',
                      })
                    )
                  }
                />{' '}
                {copy.yes || 'Yes'}
              </label>
            </div>
          </label>
          {state.rentalCar && (
            <Field
              label={copy.rentalCarLicensePlate || 'Rental car license plate'}
              value={state.rentalCarLicensePlate}
              onChange={handle('rentalCarLicensePlate')}
              disabled={disabled}
              required
              error={errors.rentalCarLicensePlate}
            />
          )}
        </div>
      </section>

      <section className="public-form-section">
        <h3>{copy.accidentSection || 'Accident'}</h3>
        <div className="public-form-grid">
          <SelectField
            label={copy.accidentTypeLabel || 'Accident type'}
            value={state.accidentType}
            onChange={(nextValue) =>
              onChange(
                setFields(state, {
                  accidentType: nextValue,
                })
              )
            }
            disabled={disabled}
            options={[
              { value: 'with_other_car', label: copy.accidentWithAnotherCar || 'Accident with another car' },
              { value: 'without_other_car', label: copy.accidentWithoutOtherCar || 'Accident without other car' },
            ]}
          />
          <Field
            label={copy.incidentDate || 'Incident date'}
            type="date"
            value={state.incidentDate}
            onChange={handle('incidentDate')}
            disabled={disabled}
            required
            error={errors.incidentDate}
          />
          <Field
            label={copy.incidentTime || 'Incident time'}
            type="time"
            value={state.incidentTime}
            onChange={handle('incidentTime')}
            disabled={disabled}
            required
            error={errors.incidentTime}
          />
          <label className={`public-form-field public-form-field--boxed${errors.policeOnSite ? ' is-invalid' : ''}`}>
            <span>{copy.policeOnSite || 'Police on site?'} *</span>
            <div className="public-radio-row">
              <label><input type="radio" name="policeOnSite" checked={state.policeOnSite === true} onChange={() => onChange(setFields(state, { policeOnSite: true }))} /> {copy.yes || 'Yes'}</label>
              <label><input type="radio" name="policeOnSite" checked={state.policeOnSite === false} onChange={() => onChange(setFields(state, { policeOnSite: false, policeStation: '' }))} /> {copy.no || 'No'}</label>
            </div>
            {errors.policeOnSite ? <small className="public-field-error">{errors.policeOnSite}</small> : null}
          </label>
          {state.policeOnSite && (
            <Field label={copy.policeStation || 'Police station'} value={state.policeStation} onChange={handle('policeStation')} disabled={disabled} />
          )}
          {withoutOtherCar && (
            <label className="public-form-field public-form-field--boxed">
              <span>{copy.thirdPartyPropertyDamaged || 'Third-party property damaged?'}</span>
              <div className="public-radio-row">
                <label>
                  <input
                    type="radio"
                    name="thirdPartyPropertyDamaged"
                    checked={state.thirdPartyPropertyDamaged === true}
                    onChange={() => onChange(setFields(state, { thirdPartyPropertyDamaged: true }))}
                  />{' '}
                  {copy.yes || 'Yes'}
                </label>
                <label>
                  <input
                    type="radio"
                    name="thirdPartyPropertyDamaged"
                    checked={state.thirdPartyPropertyDamaged === false}
                    onChange={() =>
                      onChange(
                        setFields(state, {
                          thirdPartyPropertyDamaged: false,
                          ownerFirstName: '',
                          ownerLastName: '',
                          ownerPhone: '',
                          ownerEmail: '',
                        })
                      )
                    }
                  />{' '}
                  {copy.no || 'No'}
                </label>
              </div>
            </label>
          )}
          {renderLocationFields()}
          {showThirdPartyOwner && (
            <>
              <Field label={copy.ownerFirstName || 'Property owner first name'} value={state.ownerFirstName} onChange={handle('ownerFirstName')} disabled={disabled} />
              <Field label={copy.ownerLastName || 'Property owner last name'} value={state.ownerLastName} onChange={handle('ownerLastName')} disabled={disabled} />
              <Field label={copy.ownerPhone || 'Contact phone'} value={state.ownerPhone} onChange={handle('ownerPhone')} disabled={disabled} />
              <Field label={copy.ownerEmail || 'Contact email'} type="email" value={state.ownerEmail} onChange={handle('ownerEmail')} disabled={disabled} />
            </>
          )}
          {withOtherCar && (
            <>
              <Field
                label={copy.opponentName || 'Opponent name'}
                value={state.opponentName}
                onChange={handle('opponentName')}
                disabled={disabled}
                required
                error={errors.opponentName}
              />
              <Field label={copy.opponentEmail || 'Opponent email'} type="email" value={state.opponentEmail} onChange={handle('opponentEmail')} disabled={disabled} />
              <Field
                label={copy.opponentPhone || 'Opponent phone'}
                value={state.opponentPhone}
                onChange={handle('opponentPhone')}
                disabled={disabled}
                required
                error={errors.opponentPhone}
              />
              <SelectField
                label={copy.opponentInsurance || 'Opponent insurance'}
                value={state.opponentInsurance || ''}
                onChange={(nextValue) =>
                  onChange(
                    setFields(state, {
                      opponentInsurance: nextValue,
                      opponentInsuranceOther: nextValue === 'Other' ? state.opponentInsuranceOther : '',
                    })
                  )
                }
                disabled={disabled}
                options={[
                  { value: '', label: copy.selectInsurance || 'Select insurance' },
                  ...OPPONENT_INSURANCE_OPTIONS.map((name) => ({ value: name, label: name })),
                ]}
              />
              {state.opponentInsurance === 'Other' && (
                <Field
                  label={copy.opponentInsuranceOther || 'Please provide your insurance company name'}
                  value={state.opponentInsuranceOther}
                  onChange={handle('opponentInsuranceOther')}
                  disabled={disabled}
                />
              )}
              <Field
                label={copy.opponentInsuranceNumber || 'Opponent insurance number'}
                value={state.opponentInsuranceNumber}
                onChange={handle('opponentInsuranceNumber')}
                disabled={disabled}
              />
              <label className="public-form-field public-form-field--boxed">
                <span>{copy.witnesses || 'Witnesses'}</span>
                <div className="public-radio-row">
                  <label>
                    <input
                      type="radio"
                      name="witnessesPresent"
                      checked={state.witnessesPresent === true}
                      onChange={() => onChange(setFields(state, { witnessesPresent: true }))}
                    />{' '}
                    {copy.yes || 'Yes'}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="witnessesPresent"
                      checked={state.witnessesPresent === false}
                      onChange={() =>
                        onChange(
                          setFields(state, {
                            witnessesPresent: false,
                            witnessName: '',
                            witnessSurname: '',
                            witnessPhone: '',
                            witnessEmail: '',
                          })
                        )
                      }
                    />{' '}
                    {copy.no || 'No'}
                  </label>
                </div>
              </label>
              {state.witnessesPresent && (
                <>
                  <Field label={copy.witnessName || 'Witness name'} value={state.witnessName} onChange={handle('witnessName')} disabled={disabled} />
                  <Field label={copy.witnessSurname || 'Witness surname'} value={state.witnessSurname} onChange={handle('witnessSurname')} disabled={disabled} />
                  <Field label={copy.witnessPhone || 'Witness phone'} value={state.witnessPhone} onChange={handle('witnessPhone')} disabled={disabled} />
                  <Field label={copy.witnessEmail || 'Witness email'} type="email" value={state.witnessEmail} onChange={handle('witnessEmail')} disabled={disabled} />
                </>
              )}
            </>
          )}
          <Field
            label={copy.description || 'Description'}
            value={state.description}
            onChange={handle('description')}
            disabled={disabled}
            textarea
            required
            error={errors.description}
            placeholder={
              copy.descriptionPlaceholder ||
              'Please describe the incident in your preferred language with as much detail as possible.'
            }
          />
        </div>
      </section>
    </div>
  );
}
