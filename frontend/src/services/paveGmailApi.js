import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function fetchWithRetry(url, fetchOptions, { retries = 2, backoffMs = 700 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, fetchOptions);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      const isNetworkFail = msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network error');
      if (!isNetworkFail) throw err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

export async function syncPaveGmailReports({
  limit = 20,
  force = false,
  reprocessFailed = false,
  reprocessPartial = false,
  reprocessSparse = false,
} = {}) {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/api/pave/sync`, authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit,
        force,
        reprocessFailed,
        reprocessPartial,
        reprocessSparse,
      }),
    }));
  } catch (err) {
    throw new Error(`Network error while calling /api/pave/sync: ${String(err?.message || err)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to sync Gmail reports');
  if (data.ok === false) throw new Error(data.error || 'Sync failed');
  return data;
}

export async function backfillPaveGmailReports(body = {}) {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/api/pave/backfill`, authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }));
  } catch (err) {
    throw new Error(`Network error while calling /api/pave/backfill: ${String(err?.message || err)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to backfill Gmail reports');
  if (data.success === false) throw new Error(data.error || 'Backfill failed');
  return data;
}

export async function getCarsWithoutPaveInspection() {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/api/pave/gmail/cars-without-inspection`, authOpts());
  } catch (err) {
    throw new Error(`Network error: ${String(err?.message || err)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Failed to load cars (${res.status})`);
  return data;
}

export async function getPaveGmailInspectionStats() {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/api/pave/gmail/inspection-stats`, authOpts());
  } catch (err) {
    throw new Error(`Network error while calling inspection stats: ${String(err?.message || err)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Failed to load inspection stats (${res.status})`);
  return data;
}

/** Imported PAVE reports linked to a `cars.id` (VIN last 4 or same license plate). */
export async function getPaveGmailReportsByCar(carId) {
  const id = Number(carId);
  if (!Number.isFinite(id)) throw new Error('Invalid car id');
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/api/pave/gmail/by-car/${id}/reports`, authOpts());
  } catch (err) {
    throw new Error(`Network error while loading PAVE reports for car: ${String(err?.message || err)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Failed to load PAVE reports for car (${res.status})`);
  }
  return Array.isArray(data) ? data : [];
}

export async function getPaveGmailReports(filters = {}) {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/api/pave/gmail/reports${qs(filters)}`, authOpts());
  } catch (err) {
    throw new Error(`Network error while calling /api/pave/gmail/reports: ${String(err?.message || err)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Failed to load Gmail reports (${res.status})`);
  }
  return data;
}

/** REPORT_PORTAL_USERNAME / REPORT_PORTAL_PASSWORD from server env (same as Gmail sync). */
export async function getPavePortalCredentials() {
  const res = await fetch(`${API_BASE}/api/pave/portal/credentials`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load portal credentials');
  return data;
}

export async function downloadPaveGmailReportFile(reportId, fileName) {
  const res = await fetch(`${API_BASE}/api/pave/gmail/reports/${reportId}/download`, authOpts());
  if (!res.ok) throw new Error('Failed to download file');
  const blob = await res.blob();
  const name = fileName || 'report';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

