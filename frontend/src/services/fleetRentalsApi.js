import { API_BASE, mergeAuth, checkUnauthorized } from './apiClient.js';

async function request(path = '', options = {}) {
  const response = await fetch(`${API_BASE}/api/fleet-rentals${path}`, mergeAuth(options));
  await checkUnauthorized(response);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Unable to load rental data.');
  return body;
}
export const getFleetRentals = () => request();
export const getDrivenRoutes = month => request(`/driven-routes?month=${encodeURIComponent(month)}`);
export const saveFleetRental = (id, data) => request(`/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
