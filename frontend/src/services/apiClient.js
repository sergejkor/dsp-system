import { getAuthHeaders, clearToken } from './authStore.js';

export const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

export function authHeaders() {
  return { ...getAuthHeaders() };
}

export function mergeAuth(options = {}) {
  return { ...options, headers: { ...getAuthHeaders(), ...(options.headers || {}) } };
}

export async function checkUnauthorized(res) {
  if (res?.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    return true;
  }
  return false;
}
