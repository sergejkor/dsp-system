import { API_BASE, authHeaders, checkUnauthorized } from './apiClient.js';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}/api/ev-monitoring${path}`, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  if (await checkUnauthorized(response)) throw new Error('AUTH_REQUIRED');
  const body = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error(body?.error || 'EV_MONITORING_REQUEST_FAILED'); error.latest = body?.latest; throw error; }
  return body;
}
export const refreshEvMonitoring = () => request('/refresh', { method: 'POST' });
export const getLatestEvMonitoring = () => request('/latest');
