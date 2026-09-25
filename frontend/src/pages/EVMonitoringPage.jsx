import { useEffect, useState } from 'react';
import { refreshEvMonitoring } from '../services/evMonitoringApi.js';
import { useAppSettings } from '../context/AppSettingsContext.jsx';
import './EVMonitoringPage.css';

const dash = (value) => value === null || value === undefined || value === '' ? '—' : value;
const formatSoc = (value) => { if (value === null || value === undefined || value === '') return '—'; const numeric = Number(value); return Number.isFinite(numeric) ? Math.round(numeric) + '%' : '—'; };
function chargingStateText(value) { if (value == null || value === '') return '—'; if (typeof value === 'string' || typeof value === 'number') return String(value); if (typeof value === 'object') return value.formattedValue || value.value || value.status || '—'; return '—'; }
function statusText(provider) { return provider?.status === 'connected' ? 'Connected' : provider?.errorCode === 'AUTH_REQUIRED' ? 'Anmeldung erforderlich' : 'Error'; }
export default function EVMonitoringPage() {
  const { language } = useAppSettings(); const [result, setResult] = useState(null); const [error, setError] = useState('');
  useEffect(() => { let active = true; refreshEvMonitoring().then((data) => active && setResult(data)).catch((err) => { if (!active) return; setError('LIVE refresh failed'); if (err.latest) setResult(err.latest); }); return () => { active = false; }; }, []);
  const locale = language === 'de' ? 'de-DE' : 'en-GB'; const dateTime = result?.checkedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.checkedAt)) : '—';
  if (!result) return <main className="ev-page"><p className="ev-loading" role="status">EV-Daten werden aktualisiert...</p>{error && <p className="ev-error">{error}</p>}</main>;
  const cards = [['Total EV', result.summary.totalVehicles], ['At least 90%', result.summary.okVehicles], ['Below 90%', result.summary.belowThreshold], ['Data issues', (result.summary.errorVehicles || 0) + (result.summary.staleVehicles || 0) + (result.summary.providerErrors || 0)]];
  return <main className="ev-page"><header className="ev-header"><div><span>FLEET / EV</span><h1>EV Monitoring</h1><p>Last live check: {dateTime}</p></div></header>{error && <p className="ev-error">LIVE refresh failed — displaying the most recent stored check.</p>}
    <section className="ev-cards">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="ev-providers">{Object.entries(result.providers).map(([key, provider]) => <article key={key}><div><strong>{key === 'rivian' ? 'Rivian FleetOS' : 'Geotab'}</strong><span>{provider.vehicleCount} vehicles</span></div><b className={provider.status === 'connected' ? 'connected' : 'failed'}>{statusText(provider)}</b></article>)}</section>
    <section className="ev-table-wrap"><table className="ev-table"><thead><tr><th>Vehicle</th><th>Source</th><th>SOC</th><th>Charging</th><th>Battery Power</th><th>Telemetry</th><th>Status</th></tr></thead><tbody>{result.vehicles.map((vehicle) => <tr key={`${vehicle.source}:${vehicle.externalId}`}><td>{vehicle.vehicleName}</td><td>{vehicle.source === 'rivian' ? 'Rivian' : 'Geotab'}</td><td><strong className={vehicle.soc !== null && vehicle.soc < result.threshold ? 'low' : 'good'}>{formatSoc(vehicle.soc)}</strong></td><td>{chargingStateText(vehicle.chargingState)}</td><td>{vehicle.chargingPowerW === null ? '—' : `${vehicle.chargingPowerW} W`}</td><td>{vehicle.socTimestamp ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(vehicle.socTimestamp)) : '—'}{vehicle.stale ? ' · stale' : ''}</td><td><span className={`ev-status ${vehicle.status}`}>{vehicle.status}</span></td></tr>)}</tbody></table>{!result.vehicles.length && <p className="ev-empty">No EV telemetry is currently available.</p>}</section>
  </main>;
}
