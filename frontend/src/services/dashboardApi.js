/**
 * Dashboard snapshot API.
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

/** @returns {Promise<import('../types/dashboard.js').DashboardSummary>} */
export async function getDashboardSummary() {
  const res = await fetch(`${API_BASE}/api/dashboard/summary`, { headers: getHeaders() });
  return handle(res);
}
