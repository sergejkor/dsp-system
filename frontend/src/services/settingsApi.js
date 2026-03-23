/**
 * Settings API client. All calls go to backend /api/settings.
 * Uses Bearer token from authStore for authentication.
 */
import { getAuthHeaders, clearToken } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function getHeaders() {
  const h = { 'Content-Type': 'application/json' };
  Object.assign(h, getAuthHeaders());
  return h;
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

/** Wrap fetch to turn network errors into a clearer message. */
async function fetchWithHint(url, opts = {}) {
  try {
    return await fetch(url, opts);
  } catch (e) {
    if (e?.message === 'Failed to fetch' || e?.name === 'TypeError') {
      throw new Error(`Cannot reach the backend at ${API_BASE}. Make sure the server is running (e.g. npm run dev in the backend folder).`);
    }
    throw e;
  }
}

export async function getEffectivePermissions() {
  const res = await fetchWithHint(`${API_BASE}/api/settings/permissions/effective`, { headers: getHeaders() });
  return handle(res);
}

export async function getGroups() {
  const res = await fetchWithHint(`${API_BASE}/api/settings/groups`, { headers: getHeaders() });
  return handle(res);
}

export async function getSettingsByGroup(groupKey) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/${encodeURIComponent(groupKey)}`, { headers: getHeaders() });
  return handle(res);
}

export async function updateSettingsGroup(groupKey, payload) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/${encodeURIComponent(groupKey)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function resetSettingsGroup(groupKey) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/${encodeURIComponent(groupKey)}/reset`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return handle(res);
}

// Users
export async function getUsers(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithHint(`${API_BASE}/api/settings/users${q ? `?${q}` : ''}`, { headers: getHeaders() });
  return handle(res);
}

export async function getUser(id) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users/${id}`, { headers: getHeaders() });
  return handle(res);
}

export async function createUser(data) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateUser(id, data) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function lockUser(id) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users/${id}/lock`, { method: 'POST', headers: getHeaders() });
  return handle(res);
}

export async function unlockUser(id) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users/${id}/unlock`, { method: 'POST', headers: getHeaders() });
  return handle(res);
}

export async function deactivateUser(id) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users/${id}/deactivate`, { method: 'POST', headers: getHeaders() });
  return handle(res);
}

export async function reactivateUser(id) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users/${id}/reactivate`, { method: 'POST', headers: getHeaders() });
  return handle(res);
}

// Roles
export async function getRoles() {
  const res = await fetchWithHint(`${API_BASE}/api/settings/roles`, { headers: getHeaders() });
  return handle(res);
}

export async function getRole(id) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/roles/${id}`, { headers: getHeaders() });
  return handle(res);
}

export async function createRole(data) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/roles`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateRole(id, data) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/roles/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function setRolePermissions(roleId, permissionIds) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/roles/${roleId}/permissions`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ permission_ids: permissionIds }),
  });
  return handle(res);
}

// Permissions
export async function getPermissions() {
  const res = await fetchWithHint(`${API_BASE}/api/settings/permissions`, { headers: getHeaders() });
  return handle(res);
}

export async function setUserPermissionOverrides(userId, overrides) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users/${userId}/permissions`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ overrides }),
  });
  return handle(res);
}

export async function getUserPermissionOverrides(userId) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/users/${userId}`, { headers: getHeaders() });
  const user = await handle(res);
  const permRes = await fetchWithHint(`${API_BASE}/api/settings/permissions`, { headers: getHeaders() });
  const allPerms = await handle(permRes);
  return { user, allPerms };
}

// Lookups
export async function getLookupGroups() {
  const res = await fetchWithHint(`${API_BASE}/api/settings/lookups`, { headers: getHeaders() });
  return handle(res);
}

export async function getLookupValues(groupKey, activeOnly = true) {
  const res = await fetchWithHint(
    `${API_BASE}/api/settings/lookups/${encodeURIComponent(groupKey)}${activeOnly === false ? '?active=false' : ''}`,
    { headers: getHeaders() }
  );
  return handle(res);
}

export async function createLookupValue(groupKey, data) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/lookups/${encodeURIComponent(groupKey)}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateLookupValue(groupKey, id, data) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/lookups/${encodeURIComponent(groupKey)}/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function reorderLookupValues(groupKey, valueIds) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/lookups/${encodeURIComponent(groupKey)}/reorder`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ value_ids: valueIds }),
  });
  return handle(res);
}

// Feature flags
export async function getFeatureFlags() {
  const res = await fetchWithHint(`${API_BASE}/api/settings/features`, { headers: getHeaders() });
  return handle(res);
}

export async function setFeatureFlag(key, enabled) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/features/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ enabled }),
  });
  return handle(res);
}

// Integrations
export async function getIntegrations() {
  const res = await fetchWithHint(`${API_BASE}/api/settings/integrations`, { headers: getHeaders() });
  return handle(res);
}

export async function getIntegration(key) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/integrations/${encodeURIComponent(key)}`, { headers: getHeaders() });
  return handle(res);
}

export async function updateIntegration(key, data) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/integrations/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function testIntegration(key) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/integrations/${encodeURIComponent(key)}/test`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return handle(res);
}

// Security
export async function getSecuritySettings() {
  const res = await fetchWithHint(`${API_BASE}/api/settings/security`, { headers: getHeaders() });
  return handle(res);
}

export async function updateSecuritySettings(payload) {
  const res = await fetchWithHint(`${API_BASE}/api/settings/security`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

// Audit
export async function getAuditLog(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithHint(`${API_BASE}/api/settings/audit${q ? `?${q}` : ''}`, { headers: getHeaders() });
  return handle(res);
}
