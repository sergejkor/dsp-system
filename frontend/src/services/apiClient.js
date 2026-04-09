import { getAuthHeaders, clearToken } from './authStore.js';
import { API_BASE } from '../config/apiBase.js';

export { API_BASE };

export function apiBaseHeaders() {
  try {
    const baseUrl = new URL(API_BASE);
    if (baseUrl.hostname.includes('ngrok')) {
      return { 'ngrok-skip-browser-warning': 'true' };
    }
  } catch (_error) {}
  return {};
}

export function authHeaders() {
  return { ...apiBaseHeaders(), ...getAuthHeaders() };
}

export function mergeAuth(options = {}) {
  return { ...options, headers: { ...apiBaseHeaders(), ...getAuthHeaders(), ...(options.headers || {}) } };
}

export async function checkUnauthorized(res) {
  if (res?.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    return true;
  }
  return false;
}
