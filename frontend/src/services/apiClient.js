import { getAuthHeaders, clearToken } from './authStore.js';
import { API_BASE } from '../config/apiBase.js';

export { API_BASE };

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
