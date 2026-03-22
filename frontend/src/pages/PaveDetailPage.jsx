import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getPaveSession, resyncPaveSession } from '../services/paveApi';

const POLL_INTERVAL_MS = 20000;

function formatDate(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 19) : d;
  return s ? s.replace('T', ' ') : '—';
}

export default function PaveDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoModal, setPhotoModal] = useState(null);

  function load() {
    if (!id) return;
    getPaveSession(id)
      .then(setSession)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!session || !id) return;
    const done = ['COMPLETE', 'EXPIRED'].includes(session.status);
    if (done) return;
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [id, session?.status]);

  function handleResync() {
    resyncPaveSession(id).then(load).catch((e) => setError(e.message));
  }

  if (loading && !session) return <section className="card"><p>Loading…</p></section>;
  if (error && !session) return <section className="card"><p style={{ color: '#c62828' }}>{error}</p><Link to="/pave">Back to list</Link></section>;
  if (!session) return <section className="card"><p>Session not found.</p><Link to="/pave">Back to list</Link></section>;

  const v = session.vehicle || {};
  const s = session.inspection_summary || {};
  const loc = session.location;

  return (
    <section className="card pave-detail">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Inspection: {session.session_key}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ padding: '4px 8px', borderRadius: 6, background: '#e0e0e0', fontSize: '0.9rem' }}>{session.status}</span>
          <button type="button" onClick={handleResync}>Re-sync</button>
          {s.landing_page_url && <a href={s.landing_page_url} target="_blank" rel="noopener noreferrer">Landing Page</a>}
          {s.condition_report_url && <a href={s.condition_report_url} target="_blank" rel="noopener noreferrer">Condition Report PDF</a>}
          <Link to="/pave">Back to list</Link>
        </div>
      </div>
      {error && <p style={{ color: '#c62828', marginBottom: '0.5rem' }}>{error}</p>}

      <section className="pave-detail-section">
        <h3>Session summary</h3>
        <dl className="pave-dl">
          <dt>Session key</dt><dd>{session.session_key}</dd>
          <dt>Status</dt><dd>{session.status}</dd>
          <dt>Theme / Language</dt><dd>{session.theme} / {session.language}</dd>
          <dt>Created</dt><dd>{formatDate(session.created_at)}</dd>
          <dt>Started</dt><dd>{formatDate(session.inspect_started_at)}</dd>
          <dt>Ended</dt><dd>{formatDate(session.inspect_ended_at)}</dd>
          <dt>Capture URL</dt><dd>{session.capture_url ? <a href={session.capture_url} target="_blank" rel="noopener noreferrer">Open</a> : '—'}</dd>
          <dt>Sync state</dt><dd>{session.sync_state || '—'} {session.sync_error && <span style={{ color: '#c62828' }}>({session.sync_error})</span>}</dd>
          <dt>Last webhook</dt><dd>{formatDate(session.last_webhook_at)}</dd>
        </dl>
      </section>

      {v.vin && (
        <section className="pave-detail-section">
          <h3>Vehicle</h3>
          <dl className="pave-dl">
            <dt>VIN</dt><dd>{v.vin}</dd>
            <dt>Year / Make / Model</dt><dd>{v.year} {v.make} {v.model}</dd>
            <dt>Trim</dt><dd>{v.trim || '—'}</dd>
            <dt>Body type</dt><dd>{v.body_type || '—'}</dd>
            <dt>Transmission</dt><dd>{v.transmission || '—'}</dd>
            <dt>Fuel type</dt><dd>{v.fuel_type || '—'}</dd>
            <dt>Engine</dt><dd>{v.engine || '—'}</dd>
            <dt>Exterior / Interior</dt><dd>{v.ext_color || '—'} / {v.int_color || '—'}</dd>
            <dt>Odometer</dt><dd>{v.odom_reading != null ? `${v.odom_reading} ${v.odom_unit || 'km'}` : '—'}</dd>
          </dl>
        </section>
      )}

      <section className="pave-detail-section">
        <h3>Internal links</h3>
        <p>Car ID: {session.car_id ?? '—'} · Driver: {session.driver_id || '—'} · Employee: {session.employee_id || '—'}</p>
      </section>

      {(s.overall_grade != null || s.damage_count != null) && (
        <section className="pave-detail-section">
          <h3>Inspection summary</h3>
          <p>Grade: <strong>{s.overall_grade ?? '—'}</strong> · Damage count: <strong>{s.damage_count ?? 0}</strong> · Max damage grade: {s.max_damage_grade || '—'} · Estimate: {s.estimate_total != null ? `${s.estimate_total} ${s.currency || ''}` : '—'}</p>
        </section>
      )}

      {session.photos?.length > 0 && (
        <section className="pave-detail-section">
          <h3>Photos</h3>
          <div className="pave-photos-grid">
            {session.photos.map((p) => (
              <div key={p.id} className="pave-photo-card">
                {p.photo_url ? <img src={p.photo_url} alt={p.photo_label} onClick={() => setPhotoModal(p)} style={{ cursor: 'pointer', maxWidth: 120, maxHeight: 90 }} /> : <div style={{ width: 120, height: 90, background: '#eee' }}>No image</div>}
                <div>{p.photo_label || p.photo_code}</div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>{p.approved ? 'Approved' : 'Rejected'} {p.approved_message || p.rejection_code}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {photoModal && (
        <div className="pave-modal-backdrop" onClick={() => setPhotoModal(null)}>
          <div className="pave-modal" onClick={(e) => e.stopPropagation()}>
            <img src={photoModal.photo_url} alt={photoModal.photo_label} style={{ maxWidth: '90vw', maxHeight: '90vh' }} />
            <p>{photoModal.photo_label}</p>
            <button type="button" onClick={() => setPhotoModal(null)}>Close</button>
          </div>
        </div>
      )}

      {session.damages?.length > 0 && (
        <section className="pave-detail-section">
          <h3>Damages</h3>
          <table className="pave-table" style={{ fontSize: '0.9rem' }}>
            <thead><tr><th>Type</th><th>Panel</th><th>Severity</th><th>Description</th><th>Estimate</th></tr></thead>
            <tbody>
              {session.damages.map((d) => (
                <tr key={d.id}>
                  <td>{d.damage_type || d.damage_code}</td>
                  <td>{d.panel}</td>
                  <td>{d.severity_grade}</td>
                  <td>{d.description || '—'}</td>
                  <td>{d.repair_estimate_amount != null ? `${d.repair_estimate_amount} ${d.currency || ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {loc && (loc.address || loc.city) && (
        <section className="pave-detail-section">
          <h3>Location</h3>
          <p>{loc.address} {loc.city} {loc.region} {loc.postal_code} {loc.country}</p>
          {loc.latitude != null && <p>Lat/Lon: {loc.latitude}, {loc.longitude}</p>}
        </section>
      )}

      {session.notes?.length > 0 && (
        <section className="pave-detail-section">
          <h3>Notes</h3>
          <ul>{session.notes.map((n) => <li key={n.id}><strong>{n.title}</strong> {n.description} — {formatDate(n.inserted_at)}</li>)}</ul>
        </section>
      )}

      <style>{`
        .pave-detail-section { margin-bottom: 1.5rem; }
        .pave-detail-section h3 { margin: 0 0 0.5rem 0; font-size: 1rem; }
        .pave-dl { display: grid; grid-template-columns: 140px 1fr; gap: 0.25rem 1rem; margin: 0; font-size: 0.9rem; }
        .pave-dl dt { color: #666; }
        .pave-photos-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; }
        .pave-photo-card { border: 1px solid #ddd; padding: 0.5rem; border-radius: 6px; }
        .pave-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .pave-modal { background: #fff; padding: 1rem; border-radius: 8px; max-width: 95vw; }
        .pave-table { width: 100%; border-collapse: collapse; }
        .pave-table th, .pave-table td { border: 1px solid #ddd; padding: 0.35rem; text-align: left; }
      `}</style>
    </section>
  );
}
