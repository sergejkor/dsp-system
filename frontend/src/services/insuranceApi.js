import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getInsuranceOverview(year) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  const res = await fetch(`${API_BASE}/api/insurance/overview?${params.toString()}`, authOpts());
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || 'Failed to load overview');
  return out.overview;
}

export async function getInsuranceVehicles(paramsObj = {}) {
  const params = new URLSearchParams();
  Object.entries(paramsObj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const res = await fetch(`${API_BASE}/api/insurance/vehicles?${params.toString()}`, authOpts());
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || 'Failed to load vehicles');
  return out;
}

export async function getInsuranceVehicleById(id) {
  const res = await fetch(`${API_BASE}/api/insurance/vehicles/${id}`, authOpts());
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || 'Failed to load vehicle');
  return out.vehicle;
}

export async function getInsuranceVehicleByPlate(plate, year) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (plate) params.set('plate', String(plate));

  const res = await fetch(`${API_BASE}/api/insurance/vehicle?${params.toString()}`, authOpts());
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || 'Failed to load vehicle');
  return out.vehicle;
}

