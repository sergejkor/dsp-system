import { useEffect, useState } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { getAuthHeaders } from '../services/authStore';

const API = `${import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com'}/api/car-planning/atlas`;

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const body = await response.text();
  const summary = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  throw new Error(
    response.status === 404
      ? 'Atlas API is not available on the server yet. Please reload after the backend update.'
      : `Atlas API returned ${response.status}${summary ? `: ${summary}` : ''}`
  );
}
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export default function AtlasUpload() {
  const { language } = useAppSettings();
  const de = language === 'de';
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${API}/status?date=${date}`, { headers: getAuthHeaders(), signal: controller.signal });
        const data = await readApiResponse(response);
        if (!response.ok) throw new Error(data.error || 'Atlas status unavailable');
        if (active) { setStatus(data); setError(''); }
      } catch (err) { if (active) setError(err.message); }
    };
    setStatus(null);
    load();
    const timer = setInterval(load, 30000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [date, refresh]);
  const statusText = {
    waiting: de ? 'Wartet auf Atlas und Excel' : 'Waiting for Atlas and Excel',
    sent: de ? 'An #atlas_update gesendet' : 'Sent to #atlas_update',
    closed: de ? 'Prüfhinweis an #atlas_update gesendet' : 'Action required — notice sent to #atlas_update',
    sending: de ? 'Versand gestartet – bei längerem Status Slack prüfen' : 'Sending started — check Slack if this persists',
    uncertain: de ? 'Versand unklar – #atlas_update prüfen, keine automatische Wiederholung' : 'Delivery uncertain — check #atlas_update; automatic retry stopped',
  };
  return <section className="atlas-upload" aria-label="Atlas">
    <div className="atlas-upload-controls">
      <strong className="atlas-upload-title">Atlas</strong>
      <label className="atlas-upload-date">{de ? 'Tourdatum' : 'Route date'}
        <input type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} />
      </label>
    </div>
    <div role="status" className="atlas-upload-status">
      {status?.sharedExcel && <div className="atlas-upload-file" title={status.sharedExcel.file_name}><span>{status.sharedExcel.file_name}</span> · {status.routes} {de ? 'Touren · verfügbar bis Mitternacht (Berlin)' : 'routes · available until midnight (Berlin)'}</div>}
      {status && <div className="atlas-upload-state">{status.enabled ? statusText[status.status] : (de ? 'Automatisierung nicht verfügbar' : 'Automation unavailable')}</div>}
      {status?.error && <div>{status.error}</div>}
    </div>
    {error && <div role="alert" className="car-planning-error">{error}</div>}
  </section>;
}
