import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getAdvances(employeeId, month = null) {
  const params = new URLSearchParams({ employeeId: String(employeeId) });
  if (month) params.set('month', String(month).slice(0, 7));
  const response = await fetch(`${API_BASE}/api/advances?${params}`, authOpts());
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load advances');
  }
  return response.json();
}

/**
 * Save up to 3 advance lines for an employee for a month (YYYY-MM).
 * lines: [ { amount, code_comment }, ... ]
 */
export async function saveAdvances(employeeId, month, lines) {
  const response = await fetch(`${API_BASE}/api/advances`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employeeId: String(employeeId),
      month: String(month).slice(0, 7),
      lines: Array.isArray(lines) ? lines.slice(0, 3) : [],
    }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save advances');
  }
  return response.json();
}
