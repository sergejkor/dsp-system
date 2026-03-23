import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getFines() {
  const res = await fetch(`${API_BASE}/api/fines`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load fines');
  return data;
}

export async function getFinesEmployees() {
  const res = await fetch(`${API_BASE}/api/fines/employees`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load employees');
  return data;
}

export async function createFine(payload) {
  const res = await fetch(`${API_BASE}/api/fines`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create fine');
  return data;
}

export async function updateFine(id, payload) {
  const res = await fetch(`${API_BASE}/api/fines/${id}`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update fine');
  return data;
}

