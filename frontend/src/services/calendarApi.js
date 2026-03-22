import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getCalendarHealth() {
  const response = await fetch(`${API_BASE}/api/calendar/health`, authOpts());
  if (!response.ok) throw new Error('Calendar health failed');
  return response.json();
}

export async function getWeeks(year) {
  const y = year ?? new Date().getFullYear();
  const response = await fetch(`${API_BASE}/api/calendar/weeks?year=${y}`, authOpts());
  if (!response.ok) throw new Error('Failed to load weeks');
  return response.json();
}

export async function getMonthWorkDays(year, month) {
  const y = year ?? new Date().getFullYear();
  const m = month ?? new Date().getMonth() + 1;
  const response = await fetch(
    `${API_BASE}/api/calendar/month-work-days?year=${y}&month=${m}`
  );
  if (!response.ok) throw new Error('Failed to load month work days');
  return response.json();
}

export async function getWorkDays(year) {
  const y = year ?? new Date().getFullYear();
  const response = await fetch(`${API_BASE}/api/calendar/work-days?year=${y}`, authOpts());
  if (!response.ok) throw new Error('Failed to load work days');
  return response.json();
}

export async function getCalendarDays(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const response = await fetch(
    `${API_BASE}/api/calendar/days?${params.toString()}`,
    authOpts()
  );
  if (!response.ok) throw new Error('Failed to load calendar days');
  return response.json();
}

export async function getMonthDays(year, month) {
  const y = year ?? new Date().getFullYear();
  const m = month ?? new Date().getMonth() + 1;
  const response = await fetch(
    `${API_BASE}/api/calendar/month-days?year=${y}&month=${m}`,
    authOpts()
  );
  if (!response.ok) throw new Error('Failed to load month days');
  return response.json();
}

export async function uploadDayFile(dayKey, file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE}/api/calendar/days/${dayKey}/upload`, authOpts({
    method: 'POST',
    body: formData,
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data.error || response.statusText || 'Upload failed';
    const err = new Error(msg);
    err.code = data.code;
    err.response = response;
    throw err;
  }
  return data;
}
