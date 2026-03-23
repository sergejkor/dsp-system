import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getScorecardWeeks(year) {
  const y = year ?? new Date().getFullYear();
  const response = await fetch(`${API_BASE}/api/scorecard/weeks?year=${y}`, authOpts());
  if (!response.ok) throw new Error('Failed to load scorecard weeks');
  return response.json();
}

export async function getScorecardEmployees(year, week) {
  const response = await fetch(
    `${API_BASE}/api/scorecard/weeks/${year}/${week}/employees`,
    authOpts()
  );
  if (!response.ok) throw new Error('Failed to load scorecard employees');
  return response.json();
}

export async function uploadScorecardFile(year, week, file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(
    `${API_BASE}/api/scorecard/weeks/${year}/${week}/upload`,
    authOpts({ method: 'POST', body: formData })
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data.error || response.statusText || 'Upload failed';
    const err = new Error(msg);
    err.code = data.code;
    throw err;
  }
  return data;
}
