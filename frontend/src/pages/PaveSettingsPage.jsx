import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPaveCallbacks, createPaveCallback, updatePaveCallback, deletePaveCallback } from '../services/paveApi';

const CALLBACK_EVENTS = ['SESSION:SMS_PROCESS', 'SESSION:STAGE_CHANGE', 'SESSION:STATUS_CHANGE', 'SESSION:COMPLETE', 'SESSION:NOTE_INSERT'];

export default function PaveSettingsPage() {
  const [callbacks, setCallbacks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ event: CALLBACK_EVENTS[0], url: '' });

  function load() {
    getPaveCallbacks()
      .then(setCallbacks)
      .catch((e) => { setError(e.message); setCallbacks([]); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function handleCreate(e) {
    e.preventDefault();
    if (!form.url.trim()) return;
    createPaveCallback({ event: form.event, url: form.url.trim() })
      .then(() => { setMessage('Callback created'); load(); setForm({ ...form, url: '' }); })
      .catch((e) => setError(e.message));
  }

  function handleDelete(event) {
    if (!confirm(`Delete callback for ${event}?`)) return;
    deletePaveCallback(event).then(() => { setMessage('Deleted'); load(); }).catch((e) => setError(e.message));
  }

  if (loading && callbacks === null) return <section className="card"><p>Loading…</p></section>;

  const list = Array.isArray(callbacks) ? callbacks : (callbacks?.callbacks || callbacks?.data || []);

  return (
    <section className="card">
      <h2>PAVE Settings</h2>
      <p className="muted">Callback (webhook) configuration. PAVE will POST to your URL on each event.</p>
      <p><Link to="/pave">← Back to PAVE</Link></p>
      {error && <p style={{ color: '#c62828' }}>{error}</p>}
      {message && <p style={{ color: '#2e7d32' }}>{message}</p>}

      <h3>Webhook endpoint</h3>
      <p>Configure PAVE to send webhooks to: <code>{import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/pave/webhook</code></p>

      <h3>Create callback</h3>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <label>Event
          <select value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}>
            {CALLBACK_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
        </label>
        <label>URL <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://your-server.com/api/pave/webhook" style={{ width: 320 }} /></label>
        <button type="submit">Add callback</button>
      </form>

      <h3>Configured callbacks</h3>
      {list.length === 0 ? (
        <p className="muted">No callbacks configured. Create one above.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {list.map((c) => (
            <li key={c.event || c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
              <span><strong>{c.event || c.name}</strong> → {c.url || c.endpoint || '—'}</span>
              <button type="button" onClick={() => handleDelete(c.event || c.name)} style={{ color: '#c62828', fontSize: '0.85rem' }}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
