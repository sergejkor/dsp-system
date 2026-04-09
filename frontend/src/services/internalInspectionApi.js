import { API_BASE } from '../config/apiBase.js';
import { apiBaseHeaders, authHeaders, checkUnauthorized } from './apiClient.js';
import { REQUIRED_SHOT_IDS } from './overlayRegistry.js';

function authOpts(options = {}) {
  return { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } };
}

async function parseJson(res) {
  return res.json().catch(() => ({}));
}

async function ensureOk(res, fallbackMessage) {
  if (await checkUnauthorized(res)) {
    throw new Error('Unauthorized');
  }
  const out = await parseJson(res);
  if (!res.ok) {
    throw new Error(out.error || fallbackMessage);
  }
  return out;
}

async function ensurePublicOk(res, fallbackMessage) {
  const out = await parseJson(res);
  if (!res.ok) {
    throw new Error(out.error || fallbackMessage);
  }
  return out;
}

export async function resolveVehicleByVin(vin) {
  const normalizedVin = String(vin || '').trim();
  const res = await fetch(`${API_BASE}/api/vehicles/by-vin/${encodeURIComponent(normalizedVin)}`, {
    headers: { ...apiBaseHeaders() },
  });
  return ensurePublicOk(res, 'Failed to resolve vehicle by VIN');
}

export async function submitPublicInspection({ vin, operatorName, vehicleType, notes, shots }) {
  const form = new FormData();
  form.append('vin', String(vin || '').trim());
  form.append('operatorName', String(operatorName || '').trim());
  form.append('vehicleType', String(vehicleType || '').trim());
  form.append('source', 'qr');
  if (String(notes || '').trim()) {
    form.append('notes', String(notes).trim());
  }

  for (const shotId of REQUIRED_SHOT_IDS) {
    const shot = shots?.[shotId];
    if (!shot?.blob) {
      throw new Error(`Missing required shot: ${shotId}`);
    }
    form.append('photos', shot.blob, `${shotId}.jpg`);
    form.append('shotTypes', shotId);
  }

  const res = await fetch(`${API_BASE}/api/public/fleet-inspections`, {
    method: 'POST',
    headers: { ...apiBaseHeaders() },
    body: form,
  });
  return ensurePublicOk(res, 'Failed to submit inspection');
}

export async function listFleetInspections(filters = {}) {
  const qs = new URLSearchParams();
  if (filters.search) qs.set('search', filters.search);
  if (filters.status) qs.set('status', filters.status);
  if (filters.result) qs.set('result', filters.result);
  if (filters.carId) qs.set('carId', filters.carId);
  if (filters.limit) qs.set('limit', String(filters.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/fleet-inspections${suffix}`, authOpts());
  return ensureOk(res, 'Failed to load internal inspections');
}

export async function getFleetInspection(id) {
  const res = await fetch(`${API_BASE}/api/fleet-inspections/${id}`, authOpts());
  return ensureOk(res, 'Failed to load inspection details');
}

export async function getInspectionPhotoBlob(inspectionId, photoId) {
  const res = await fetch(
    `${API_BASE}/api/fleet-inspections/${inspectionId}/photos/${photoId}/download`,
    authOpts(),
  );
  if (await checkUnauthorized(res)) throw new Error('Unauthorized');
  if (!res.ok) {
    const out = await parseJson(res);
    throw new Error(out.error || 'Failed to load inspection photo');
  }
  return res.blob();
}
