import { API_BASE, mergeAuth, checkUnauthorized } from './apiClient.js';

async function request(path = '', options = {}) {
  const response = await fetch(`${API_BASE}/api/fleet-rentals${path}`, mergeAuth(options));
  await checkUnauthorized(response);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Unable to load rental data.');
  return body;
}
export const getFleetRentals = () => request();
export const getRentalDocuments = id => request(`/${id}/documents`);
export const uploadRentalDocument = (id, file, type) => {
  const body = new FormData();
  body.append('file', file);
  body.append('document_type', type);
  return request(`/${id}/documents`, { method: 'POST', body });
};
export async function getRentalDocumentFile(id, documentId) {
  const response = await fetch(`${API_BASE}/api/fleet-rentals/${id}/documents/${documentId}`, mergeAuth());
  await checkUnauthorized(response);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to open document.');
  }
  return response.blob();
}
export const getDrivenRoutes = month => request(`/driven-routes?month=${encodeURIComponent(month)}`);
export const saveFleetRental = (id, data) => request(`/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
