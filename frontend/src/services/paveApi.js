/**
 * PAVE integration API - all calls go to our backend, never to PAVE directly.
 */
import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function getPaveSessions(filters = {}) {
  const res = await fetch(`${API_BASE}/api/pave/sessions${qs(filters)}`, authOpts());
  if (!res.ok) throw new Error('Failed to load PAVE sessions');
  return res.json();
}

export async function createPaveSession(body) {
  const res = await fetch(`${API_BASE}/api/pave/sessions`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to create session');
  return data;
}

export async function getPaveSession(id) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}`, authOpts());
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load session');
  return res.json();
}

export async function updatePaveSession(id, body) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}`, authOpts({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update session');
  return data;
}

export async function deletePaveSession(id, fromPave = false) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}${fromPave ? '?from_pave=true' : ''}`, authOpts({ method: 'DELETE' }));
  if (res.status === 204) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || 'Failed to delete session');
}

export async function resyncPaveSession(id) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}/resync`, authOpts({ method: 'POST' }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Resync failed');
  return data;
}

export async function resendPaveSms(id) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}/resend-sms`, authOpts({ method: 'POST' }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Resend SMS failed');
  return data;
}

export async function getPaveSessionPhotos(id) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}/photos`, authOpts());
  if (!res.ok) throw new Error('Failed to load photos');
  return res.json();
}

export async function getPaveSessionNotes(id) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}/notes`, authOpts());
  if (!res.ok) throw new Error('Failed to load notes');
  return res.json();
}

export async function getPaveSessionDamages(id) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}/damages`, authOpts());
  if (!res.ok) throw new Error('Failed to load damages');
  return res.json();
}

export async function getPaveSessionTimeline(id) {
  const res = await fetch(`${API_BASE}/api/pave/sessions/${id}/timeline`, authOpts());
  if (!res.ok) throw new Error('Failed to load timeline');
  return res.json();
}

export async function getPaveAnalytics() {
  const res = await fetch(`${API_BASE}/api/pave/analytics/summary`, authOpts());
  if (!res.ok) throw new Error('Failed to load analytics');
  return res.json();
}

export function getPaveExportUrl(filters = {}) {
  return `${API_BASE}/api/pave/export${qs(filters)}`;
}

export async function getPaveCallbacks() {
  const res = await fetch(`${API_BASE}/api/pave/settings/callbacks`, authOpts());
  if (!res.ok) throw new Error('Failed to load callbacks');
  return res.json();
}

export async function createPaveCallback(body) {
  const res = await fetch(`${API_BASE}/api/pave/settings/callbacks`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create callback');
  return data;
}

export async function updatePaveCallback(event, body) {
  const res = await fetch(`${API_BASE}/api/pave/settings/callbacks/${encodeURIComponent(event)}`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update callback');
  return data;
}

export async function deletePaveCallback(event) {
  const res = await fetch(`${API_BASE}/api/pave/settings/callbacks/${encodeURIComponent(event)}`, authOpts({ method: 'DELETE' }));
  if (res.status === 204) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || 'Failed to delete callback');
}
