import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import RentalDocuments from './RentalDocuments';
import { useAppSettings } from '../context/AppSettingsContext';
import { getFleetRentals, saveFleetRental, getDrivenRoutes } from '../services/fleetRentalsApi';
import { monthRentalCost, rentalStatus, rentalTotals, rentalSource, rentalOverlapsMonth, updateRentalPricing, rentalPricingFields, rentalFinancials } from '../utils/rentalCalculations';
import { fleetRentalsCopy } from './fleetRentalsCopy';
import './fleetRentals.css';
import { bavarianBusinessDays } from '../utils/bavarianBusinessDays';

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const title = car => car.license_plate || car.vehicle_id || `#${car.id}`;
const sourceClass = rentalSource;

function RentalDialog({ car, copy: c, locale, onClose, onSaved }) {
  const dialog = useRef(null);
  const navigate = useNavigate();
  const documents = useRef(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const isLmr = rentalSource(car) === 'lmr';
  const [form, setForm] = useState(() => Object.fromEntries(['active_from', 'active_to', 'daily_rate', 'daily_km', 'monthly_rate', 'monthly_km', 'total_price', 'total_km', 'extra_km_rate', 'odometer_start', 'odometer_end', 'notes'].map(key => [key, car[key] ?? ''])));
  const [saving, setSaving] = useState(false);
  const originalForm = useRef(JSON.stringify(form));
  const busy = saving || documentBusy;
  const [error, setError] = useState('');
  const totals = rentalTotals(form);
  const businessDays = useMemo(() => bavarianBusinessDays(form.active_from, form.active_to), [form.active_from, form.active_to]);
  const finances = rentalFinancials({ ...form, service_type: car.service_type });
  const pricingFields = rentalPricingFields(form);
  const money = value => value == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value);
  const number = value => value == null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  const change = event => setForm(current => updateRentalPricing(current, event.target.name, event.target.value));
  const field = (name, label, type = 'number', step = '0.01') => <label className="fr-field" key={name}>
    <span>{label}</span><input name={name} type={type} value={pricingFields[name] ?? form[name]} onChange={change}
      required={type === 'date'} min={type === 'date' ? name === 'active_to' ? form.active_from || '1900-01-01' : '1900-01-01' : '0'}
      max={type === 'number' ? '99999999' : '9999-12-31'} step={type === 'number' ? step : undefined} />
  </label>;
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (totals.days == null) { setError(c.errorDates); return; }
    if (!isLmr && form.odometer_end !== '' && (form.odometer_start === '' || Number(form.odometer_end) < Number(form.odometer_start))) { setError(c.errorOdometer); return; }
    setSaving(true); setError('');
    try { onSaved(await saveFleetRental(car.id, { ...form, revision: car.revision })); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return createPortal(<dialog ref={dialog} className="fr-dialog" data-portal-localized aria-labelledby="fr-dialog-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit}>
      <header className="fr-dialog-header"><div><span className="fr-eyebrow">{c.details}</span><h2 id="fr-dialog-title">{title(car)}</h2>
        <p>{[car.fleet_provider, car.service_type, car.model, car.station].filter(Boolean).join(' · ')}</p></div>
        <button className="fr-icon" type="button" aria-label={c.close} disabled={busy} onClick={onClose}>×</button></header>
      <div className={`fr-dialog-body ${isLmr ? 'fr-lmr-dialog' : ''}`}><fieldset disabled={saving} className="fr-editor">
        <section><h3>{c.period}</h3><div className="fr-fields">{field('active_from', c.from, 'date')}{field('active_to', c.to, 'date')}</div><p className="fr-help">{c.inclusive}</p></section>
        {!isLmr && <><section><h3>{c.pricing}</h3><div className="fr-fields">{field('daily_rate', c.rate)}{field('daily_km', c.dailyKm)}{field('monthly_rate', c.monthlyRate)}{field('monthly_km', c.monthlyKm)}{field('total_price', c.totalPricing)}{field('total_km', c.totalKm)}{field('extra_km_rate', c.extraRate, 'number', '0.0001')}</div><p className="fr-help">{c.linkedPricingHelp}</p></section>
        <section><h3>{c.odometer}</h3><div className="fr-fields">{field('odometer_start', c.startKm)}{field('odometer_end', c.endKm)}</div>
          {car.mileage != null && <p className="fr-help">{c.currentKm}: {number(Number(car.mileage))} km</p>}</section></>}
        <label className="fr-field"><span>{c.notes}</span><textarea name="notes" rows="3" maxLength="5000" value={form.notes} onChange={change} placeholder={c.notesPlaceholder} /></label>
      </fieldset>{!isLmr && <aside className="fr-summary"><h3>{c.summary}</h3><div className="fr-days"><strong>{number(totals.days)}</strong><span>{c.days}</span></div>
        <div className="fr-days fr-business-days"><strong>{number(businessDays)}</strong><span>{c.businessDays}</span></div>
        <p className="fr-help fr-business-help">{c.businessDaysHelp}</p>
        <dl>{[[c.base, money(totals.base)], [c.allowance, totals.allowance == null ? '—' : `${number(totals.allowance)} km`],
          [c.driven, totals.driven == null ? '—' : `${number(totals.driven)} km`],
          [c.difference, totals.difference == null ? '—' : `${totals.difference > 0 ? '+' : ''}${number(totals.difference)} km`],
          [c.extra, money(totals.extra)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <p className="fr-help">{c.balanceHelp}</p>
        <section className="fr-financials"><h3>{c.financialResult}</h3>
          <p className="fr-help">{car.service_type || c.noServiceType}{finances.dailyIncome != null && <> · {money(finances.dailyIncome)} {c.netPerDay}</>}</p>
          {finances.dailyIncome == null && <p className="fr-help">{c.unknownService}</p>}
          <table><thead><tr><th></th><th>{c.net}</th><th>{c.gross}</th></tr></thead><tbody>
            <tr><th>{c.weReceive}</th><td>{money(finances.incomeNet)}</td><td>{money(finances.incomeGross)}</td></tr>
            <tr><th>{c.wePay}</th><td>{money(finances.costNet)}</td><td>{money(finances.costGross)}</td></tr>
            <tr className={`fr-margin ${finances.marginNet == null ? '' : finances.marginNet >= 0 ? 'positive' : 'negative'}`}><th>{c.resultDifference}</th>
              <td>{finances.marginNet > 0 ? '+' : ''}{money(finances.marginNet)}</td><td>{finances.marginGross > 0 ? '+' : ''}{money(finances.marginGross)}</td></tr>
          </tbody></table>
          <p className="fr-help">{c.vatHelp}</p>
          {finances.estimated && <p className="fr-help">{c.estimatedResult}</p>}
        </section>
      </aside>}
        <RentalDocuments ref={documents} carId={car.id} copy={c} onBusyChange={setDocumentBusy} disabled={saving} />
      </div>
      <footer className="fr-dialog-footer">{error && <p className="fr-error" role="alert">{error}</p>}<div className="fr-footer-actions"><div className="fr-related-actions">
        <button type="button" className="fr-button" disabled={busy} onClick={() => {
          if (JSON.stringify(form) !== originalForm.current && !window.confirm(c.unsavedNavigation)) return;
          const params = new URLSearchParams({ add: '1', vehicle: title(car), vin: car.vin || '' });
          navigate(`/damages?${params}`);
        }}>{c.addDamage}</button>
        <button type="button" className="fr-button" disabled={busy} onClick={() => documents.current?.uploadProtocol()}>{c.uploadProtocol}</button>
      </div><div className="fr-save-actions"><button type="button" className="fr-button" disabled={busy} onClick={onClose}>{c.cancel}</button><button className="fr-button primary" type="submit" disabled={busy}>{saving ? c.saving : c.save}</button></div></div></footer>
    </form>
  </dialog>, document.body);
}

export default function FleetRentalsPage() {
  const { language } = useAppSettings();
  const c = fleetRentalsCopy[language] || fleetRentalsCopy.en;
  const locale = language === 'de' ? 'de-DE' : 'en-GB';
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [cars, setCars] = useState([]);
  const [routes, setRoutes] = useState({});
  const [routesError, setRoutesError] = useState('');
  const [routesLoading, setRoutesLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const requestId = useRef(0);
  const today = localDate();
  const [year, monthNumber] = month.split('-').map(Number);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const first = `${month}-01`, last = `${month}-${dayCount}`;
  const days = Array.from({ length: dayCount }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const money = value => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value);
  const formatDate = value => value ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`)) : '—';
  async function load() {
    const id = ++requestId.current;
    setLoading(true); setError(''); setNotice(''); setRefreshVersion(value => value + 1);
    try { const rows = await getFleetRentals(); if (id === requestId.current) setCars(rows); }
    catch (err) { if (id === requestId.current) setError(err.message); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  useEffect(() => { load(); return () => { requestId.current++; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setRoutes({}); setRoutesLoading(true); setRoutesError('');
    getDrivenRoutes(month).then(rows => {
      if (!cancelled) setRoutes(Object.fromEntries(rows.map(row => [row.date, row.count])));
    }).catch(err => { if (!cancelled) setRoutesError(err.message); })
      .finally(() => { if (!cancelled) setRoutesLoading(false); });
    return () => { cancelled = true; };
  }, [month, refreshVersion]);
  const filtered = useMemo(() => cars.filter(car => (!source || car.fleet_provider === source)
    && (!status || rentalStatus(car, today) === status)
    && [car.license_plate, car.vehicle_id, car.model, car.station, car.vin].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase())), [cars, source, status, search, today]);
  const monthly = filtered.filter(car => rentalOverlapsMonth(car, first, last));
  const pricedRentals = monthly.filter(car => rentalSource(car) !== 'lmr');
  const monthlyCost = pricedRentals.reduce((sum, car) => sum + (monthRentalCost(car, first, last) ?? 0), 0);
  const unknownRates = pricedRentals.filter(car => car.daily_rate == null && car.total_price == null).length;
  const soon = localDate(new Date(new Date().setDate(new Date().getDate() + 7)));
  function shiftMonth(delta) { setMonth(localDate(new Date(year, monthNumber - 1 + delta, 1)).slice(0, 7)); }
  return <main className="fr-page" data-portal-localized>
    <header className="fr-heading"><div><span className="fr-eyebrow">FLEET / RENTALS</span><h1>{c.title}</h1><p>{c.subtitle}</p></div><button className="fr-button" disabled={loading} onClick={load}>↻ {c.refresh}</button></header>
    {notice && <div className="fr-notice" role="status">{c.saved}</div>}
    {error ? <div className="fr-error" role="alert">{error} <button className="fr-button" onClick={load}>{c.retry}</button></div> : <>
      <section className="fr-kpis" aria-label={c.summary}>
        {[[c.vehicles, monthly.length, ''], [c.monthlyCost, money(monthlyCost), unknownRates ? `${unknownRates} ${c.missingRates}` : c.knownOnly],
          [c.ending, monthly.filter(car => rentalStatus(car, today) === 'active' && car.active_to <= soon).length, c.today],
          [c.lmrVehicles, monthly.filter(car => rentalSource(car) === 'lmr').length, c.lmrSeparate]].map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{loading ? '—' : value}</strong><small>{hint || '\u00a0'}</small></article>)}
      </section>
      <section className="fr-calendar">
        <div className="fr-toolbar"><div className="fr-month"><button className="fr-icon" onClick={() => shiftMonth(-1)} aria-label={c.previous}>‹</button>
          <h2>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1))}</h2>
          <button className="fr-icon" onClick={() => shiftMonth(1)} aria-label={c.next}>›</button><button className="fr-button" onClick={() => setMonth(today.slice(0, 7))}>{c.today}</button></div>
          <div className="fr-filters"><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={c.search} aria-label={c.search} />
            <select aria-label={c.allSources} value={source} onChange={e => setSource(e.target.value)}><option value="">{c.allSources}</option>{[...new Set(cars.map(car => car.fleet_provider))].sort().map(value => <option key={value}>{value}</option>)}</select>
            <select aria-label={c.allStatus} value={status} onChange={e => setStatus(e.target.value)}><option value="">{c.allStatus}</option>{['active', 'upcoming', 'ended'].map(value => <option key={value} value={value}>{c[value]}</option>)}</select></div>
        </div>
        {routesError && <p className="fr-error" role="alert">{c.routesError}</p>}
        {loading ? <div className="fr-empty" role="status">{c.loading}</div> : <div className="fr-scroll"><div className="fr-grid" style={{ '--fr-days': dayCount }}>
          <div className="fr-grid-header"><div className="fr-vehicle-heading">{c.vehicle} <span>{monthly.length}</span></div><div className="fr-day-headings">{days.map((day, i) => {
            const date = new Date(`${day}T12:00:00`);
            return <div key={day} className={`${[0, 6].includes(date.getDay()) ? 'weekend' : ''} ${day === today ? 'today' : ''}`}><small>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)}</small><strong>{i + 1}</strong><span className="fr-driven-routes" title={`${c.drivenRoutes}: ${routes[day] ?? c.noRouteData}`}><small>Driven<br />Roots</small><b>{routesLoading || routesError ? '—' : routes[day] ?? '—'}</b></span></div>;
          })}</div></div>
          {monthly.map(car => {
            const state = rentalStatus(car, today);
            const visible = state !== 'missing' && car.active_from <= last && car.active_to >= first;
            const start = visible ? Number((car.active_from < first ? first : car.active_from).slice(-2)) : 1;
            const end = visible ? Number((car.active_to > last ? last : car.active_to).slice(-2)) : 1;
            const label = `${title(car)} · ${formatDate(car.active_from)} – ${formatDate(car.active_to)}`;
            return <div className="fr-grid-row" key={car.id}><button className="fr-vehicle" onClick={() => setSelected(car)}><div><strong>{title(car)}</strong><span className={`fr-status ${state}`}>{c[state]}</span></div><small>{[car.fleet_provider, car.model || car.station].filter(Boolean).join(' · ')}</small></button>
              <div className="fr-track"><div className="fr-cells" aria-hidden="true">{days.map(day => <span key={day} className={`${[0, 6].includes(new Date(`${day}T12:00:00`).getDay()) ? 'weekend' : ''} ${day === today ? 'today' : ''}`} />)}</div>
                {visible ? <button className={`fr-bar ${sourceClass(car)}`} style={{ gridColumn: `${start} / ${end + 1}` }} title={label} aria-label={label} onClick={() => setSelected(car)}><span>{formatDate(car.active_from)} – {formatDate(car.active_to)}</span></button>
                  : <button className="fr-no-period" onClick={() => setSelected(car)}>{state === 'missing' ? `＋ ${c.setup}` : c.outside}</button>}
              </div></div>;
          })}
        {!monthly.length && <div className="fr-empty">{c.empty}</div>}
        </div></div>}
        <footer className="fr-legend"><span><i className="lmr" /> LMR</span><span><i className="rental" /> Rental</span><span><i className="self" /> Self source</span><small>{c.legend} {c.routesNote}</small></footer>
      </section>
    </>}
    {selected && <RentalDialog car={selected} copy={c} locale={locale} onClose={() => setSelected(null)} onSaved={saved => {
      setCars(rows => rows.map(car => car.id === saved.id ? saved : car)); setSelected(null); setNotice(c.saved);
    }} />}
  </main>;
}
