/**
 * Analytics API client. Uses Bearer token from authStore.
 */
import { getToken } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function getHeaders() {
  const t = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function getOverview(params = {}) {
  const res = await fetch(`${API_BASE}/api/analytics/overview${qs(params)}`, { headers: getHeaders() });
  return handle(res);
}

export async function getFiltersMeta() {
  const res = await fetch(`${API_BASE}/api/analytics/filters/meta`, { headers: getHeaders() });
  return handle(res);
}

export async function getSavedViews() {
  const res = await fetch(`${API_BASE}/api/analytics/saved-views`, { headers: getHeaders() });
  return handle(res);
}

export async function createSavedView(body) {
  const res = await fetch(`${API_BASE}/api/analytics/saved-views`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create view');
  return data;
}

export async function updateSavedView(id, body) {
  const res = await fetch(`${API_BASE}/api/analytics/saved-views/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body || {}),
  });
  return handle(res);
}

export async function deleteSavedView(id) {
  const res = await fetch(`${API_BASE}/api/analytics/saved-views/${id}`, { method: 'DELETE', headers: getHeaders() });
  if (res.status === 204) return;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete view');
}

export async function getDomainData(domain, params = {}) {
  const res = await fetch(`${API_BASE}/api/analytics/${encodeURIComponent(domain)}${qs(params)}`, { headers: getHeaders() });
  return handle(res);
}

export async function getDrilldown(metricKey, params = {}) {
  const res = await fetch(`${API_BASE}/api/analytics/drilldown/${encodeURIComponent(metricKey)}${qs(params)}`, { headers: getHeaders() });
  return handle(res);
}

/**
 * Export CSV: fetches with auth and triggers download.
 */
export async function exportCsv(params = {}) {
  const res = await fetch(`${API_BASE}/api/analytics/export/csv${qs(params)}`, { headers: getHeaders() });
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Export failed');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const match = disposition && disposition.match(/filename="?([^";]+)"?/);
  const name = match ? match[1] : `analytics-export-${new Date().toISOString().slice(0, 10)}.csv`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
