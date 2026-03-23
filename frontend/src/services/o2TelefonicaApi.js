import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getO2List() {
  const response = await fetch(`${API_BASE}/api/o2-telefonica`, authOpts());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to load O2 Telefonica list');
  }
  return response.json();
}

export async function createO2Entry(data) {
  const response = await fetch(`${API_BASE}/api/o2-telefonica`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || response.statusText || 'Failed to create');
  }
  return response.json();
}

export async function updateO2Entry(id, data) {
  const response = await fetch(`${API_BASE}/api/o2-telefonica/${id}`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || response.statusText || 'Failed to update');
  }
  return response.json();
}

export async function deleteO2Entry(id) {
  const response = await fetch(`${API_BASE}/api/o2-telefonica/${id}`, authOpts({
    method: 'DELETE',
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || response.statusText || 'Failed to delete');
  }
  return data;
}
