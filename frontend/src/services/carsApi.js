import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

function params(q) {
  const p = new URLSearchParams();
  if (q?.search) p.set('search', q.search);
  if (q?.status) p.set('status', q.status);
  if (q?.vehicle_type) p.set('vehicle_type', q.vehicle_type);
  if (q?.station) p.set('station', q.station);
  if (q?.fleet_provider) p.set('fleet_provider', q.fleet_provider);
  return p.toString();
}

export async function getCarsKpis() {
  const res = await fetch(`${API_BASE}/api/cars/kpis`, authOpts());
  if (!res.ok) throw new Error('Failed to load cars KPIs');
  return res.json();
}

export async function getCars(filters = {}) {
  const q = params(filters);
  const res = await fetch(`${API_BASE}/api/cars${q ? `?${q}` : ''}`, authOpts());
  if (!res.ok) throw new Error('Failed to load cars');
  return res.json();
}

export async function getCarById(id) {
  const res = await fetch(`${API_BASE}/api/cars/${id}`, authOpts());
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('Failed to load car');
  }
  return res.json();
}

export async function createCar(data) {
  const res = await fetch(`${API_BASE}/api/cars`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || res.statusText || 'Failed to create car');
  return out;
}

export async function updateCar(id, data) {
  const res = await fetch(`${API_BASE}/api/cars/${id}`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || res.statusText || 'Failed to update car');
  return out;
}

export async function assignDriver(carId, kenjoEmployeeId) {
  const res = await fetch(`${API_BASE}/api/cars/${carId}/assign-driver`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kenjo_employee_id: kenjoEmployeeId }),
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || res.statusText || 'Failed to assign driver');
  return out;
}

export async function addMaintenance(carId, data) {
  const res = await fetch(`${API_BASE}/api/cars/${carId}/maintenance`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || res.statusText || 'Failed to add maintenance');
  return out;
}

export async function deleteCar(id) {
  const res = await fetch(`${API_BASE}/api/cars/${id}`, authOpts({ method: 'DELETE' }));
  if (res.status === 204) return;
  const out = await res.json().catch(() => ({}));
  throw new Error(out.error || res.statusText || 'Failed to delete car');
}

export async function addCarComment(carId, comment) {
  const res = await fetch(`${API_BASE}/api/cars/${carId}/comments`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || res.statusText || 'Failed to add comment');
  return out;
}

export async function uploadCarDocument(carId, file, documentType, expiryDate) {
  const form = new FormData();
  form.append('file', file);
  form.append('document_type', documentType);
  if (expiryDate) form.append('expiry_date', expiryDate);
  const res = await fetch(`${API_BASE}/api/cars/${carId}/documents`, authOpts({
    method: 'POST',
    body: form,
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || res.statusText || 'Failed to upload document');
  return out;
}

/** Trigger download of a car document (fetches blob and saves as file). suggestedName e.g. doc.file_name || doc.document_type + '.pdf' */
export async function downloadCarDocument(carId, docId, suggestedName) {
  const res = await fetch(`${API_BASE}/api/cars/${carId}/documents/${docId}/download`, authOpts());
  if (!res.ok) throw new Error('Failed to download document');
  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') || '';
  const match = disp.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i) || disp.match(/filename=["']?([^"';]+)["']?/i);
  const name = suggestedName || (match ? decodeURIComponent(match[1].trim()) : `document-${docId}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
