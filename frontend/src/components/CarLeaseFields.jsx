import { useAppSettings } from '../context/AppSettingsContext';

export const isLeasedCar = source => ['lmr', 'rental', 'lmr rental', 'self source'].includes(String(source || '').trim().toLowerCase());

export default function CarLeaseFields({ form, setForm }) {
  const { language } = useAppSettings();
  if (!isLeasedCar(form.fleet_provider)) return null;
  const de = language === 'de';
  return <div data-portal-localized style={{ gridColumn: '1 / -1' }}>
    <div className="form-grid">
      <label>{de ? 'Leasing von' : 'Lease from'}<input type="date" required min="1900-01-01" max={form.active_to || '9999-12-31'} value={form.active_from || ''} onChange={e => setForm({ ...form, active_from: e.target.value })} /></label>
      <label>{de ? 'Leasing bis' : 'Lease until'}<input type="date" required min={form.active_from || '1900-01-01'} max="9999-12-31" value={form.active_to || ''} onChange={e => setForm({ ...form, active_to: e.target.value })} /></label>
    </div>
    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{de ? 'Gemeinsamer Zeitraum mit Car Planning und Mietkalender. Nach dem letzten Tag ist das Fahrzeug automatisch für die Planung gesperrt (Zeitzone Berlin).' : 'Shared with Car Planning and Rental Calendar. After the final day the vehicle is automatically unavailable for planning (Berlin time).'}</p>
  </div>;
}
