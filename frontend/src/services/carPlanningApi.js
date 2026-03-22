import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

async function fetchWithHint(url, opts = {}) {
  try {
    return await fetch(url, opts);
  } catch (err) {
    if (err?.name === 'TypeError' && (err?.message === 'Failed to fetch' || err?.message?.includes('fetch'))) {
      throw new Error('Backend not reachable. Check that the server is running and the URL is correct.');
    }
    throw err;
  }
}

export async function getCars() {
  const res = await fetchWithHint(`${API_BASE}/api/car-planning/cars`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to load cars');
  return Array.isArray(data) ? data : [];
}

export async function getDrivers() {
  const res = await fetchWithHint(`${API_BASE}/api/car-planning/drivers`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to load drivers');
  return Array.isArray(data) ? data : [];
}

export async function getPlanningData(dates) {
  if (!dates || dates.length === 0) return { carStates: {}, slots: [] };
  const q = dates.join(',');
  const res = await fetchWithHint(
    `${API_BASE}/api/car-planning/data?dates=${encodeURIComponent(q)}`,
    authOpts()
  );
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to load planning');
  return { carStates: data.carStates || {}, slots: data.slots || [] };
}

export async function savePlanningData(carStates, slots) {
  const res = await fetchWithHint(`${API_BASE}/api/car-planning/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ carStates: carStates || {}, slots: slots || [] }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to save');
  return data;
}

export async function getReport(date) {
  const res = await fetchWithHint(
    `${API_BASE}/api/car-planning/report?date=${encodeURIComponent(date || '')}`,
    authOpts()
  );
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to load report');
  return Array.isArray(data) ? data : [];
}

export async function addCar(numberPlate, vin, sourceType, activeFrom, activeTo) {
  const res = await fetchWithHint(`${API_BASE}/api/car-planning/add-car`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      number_plate: numberPlate,
      vin,
      source_type: sourceType,
      active_from: activeFrom || null,
      active_to: activeTo || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to add car');
  return data;
}
