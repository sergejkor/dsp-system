import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getKenjoHealth() {
  const response = await fetch(`${API_BASE}/api/kenjo/health`, authOpts());
  if (!response.ok) throw new Error('Kenjo health failed');
  return response.json();
}

export async function getKenjoUsers() {
  const response = await fetch(`${API_BASE}/api/kenjo/users`, authOpts());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Kenjo users request failed');
  }
  return response.json();
}

/** Sync kenjo_employees table from Kenjo API (for payroll KPI matching by transporter ID). */
export async function syncKenjoEmployees() {
  const response = await fetch(`${API_BASE}/api/kenjo/sync-employees`, authOpts({ method: 'POST' }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || response.statusText || 'Sync failed');
  }
  return response.json();
}

export async function getKenjoEmployeeProfile(id) {
  const response = await fetch(`${API_BASE}/api/kenjo/employees/${encodeURIComponent(id)}`, authOpts());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Kenjo employee profile request failed');
  }
  return response.json();
}

export async function getKenjoCustomFields() {
  const response = await fetch(`${API_BASE}/api/kenjo/custom-fields`, authOpts());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Kenjo custom fields request failed');
  }
  return data;
}

/**
 * Deactivate employee in Kenjo. Payload: { terminationDate (YYYY-MM-DD), reason? }
 */
export async function deactivateEmployeeInKenjo(employeeId, { terminationDate, reason }) {
  const response = await fetch(`${API_BASE}/api/kenjo/employees/${encodeURIComponent(employeeId)}/deactivate`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminationDate: terminationDate || null, reason: reason || null }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || response.statusText || 'Deactivation failed');
  }
  return response.json();
}

/**
 * Update employee profile in Kenjo. Payload: { personal?, work?, address?, home?, financial? }
 */
export async function updateEmployeeProfileInKenjo(employeeId, payload) {
  const response = await fetch(`${API_BASE}/api/kenjo/employees/${encodeURIComponent(employeeId)}/profile`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || response.statusText || 'Update profile failed');
  }
  return response.json();
}

export async function compareCortexWithKenjo(from, to, minDiff) {
  const params = new URLSearchParams({ from, to });
  if (minDiff != null && minDiff !== '') params.set('minDiff', String(minDiff));
  const response = await fetch(`${API_BASE}/api/kenjo/compare?${params}`, authOpts());
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || response.statusText || 'Compare failed');
  }
  return response.json();
}

export async function ignoreConflict(conflictKey) {
  const response = await fetch(`${API_BASE}/api/kenjo/conflicts/ignore`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conflictKey }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Ignore failed');
  }
  return response.json();
}

export async function fixConflictInKenjo(attendanceId, startTime, endTime) {
  const response = await fetch(`${API_BASE}/api/kenjo/conflicts/fix`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attendanceId, startTime, endTime }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Fix failed');
  }
  return response.json();
}

export async function createAttendanceInKenjo(userId, date, startTime, endTime) {
  const response = await fetch(`${API_BASE}/api/kenjo/attendances/create`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, date, startTime, endTime }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Create attendance failed');
  }
  return response.json();
}

export async function updateEmployeeContractEnd(employeeId, contractEnd) {
  const response = await fetch(`${API_BASE}/api/kenjo/employees/${encodeURIComponent(employeeId)}/work`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contractEnd: contractEnd || null }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Update contract end failed');
  }
  return response.json();
}

export async function getContracts(employeeId) {
  const response = await fetch(`${API_BASE}/api/contracts?employeeId=${encodeURIComponent(employeeId)}`, authOpts());
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load contracts');
  }
  return response.json();
}

export async function createContract(kenjoEmployeeId, startDate, endDate) {
  const response = await fetch(`${API_BASE}/api/contracts`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kenjo_employee_id: kenjoEmployeeId,
      start_date: startDate || null,
      end_date: endDate || null,
    }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create contract');
  }
  return response.json();
}

/** Sync time-off from Kenjo into DB (last 2 years + next year). */
export async function syncTimeOff() {
  const response = await fetch(`${API_BASE}/api/kenjo/sync-time-off`, authOpts({ method: 'POST' }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || response.statusText || 'Sync time-off failed');
  }
  return response.json();
}

/** Get time-off records for a month (YYYY-MM). */
export async function getTimeOff(month) {
  const response = await fetch(`${API_BASE}/api/kenjo/time-off?month=${encodeURIComponent(month)}`, authOpts());
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load time-off');
  }
  return response.json();
}

/** Get raw time-off response from Kenjo API for a date range (for debugging). */
export async function getTimeOffRaw(from, to) {
  const params = new URLSearchParams({ from, to });
  const response = await fetch(`${API_BASE}/api/kenjo/time-off/raw?${params}`, authOpts());
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load raw time-off');
  }
  return response.json();
}

