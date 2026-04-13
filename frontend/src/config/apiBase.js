/**
 * API origin for fetch(). In Vite dev, empty string = same origin + `/api` proxy (see vite.config.js).
 * Set VITE_BACKEND_URL in .env / .env.production to override (e.g. https://api.alfamile.com).
 */
function isLocalLikeHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
  if (host === '0.0.0.0') return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host.endsWith('.local')) return true;
  if (!host.includes('.')) return true;
  return false;
}

function normalizeApiBase(value) {
  const normalized = String(value || '').trim().replace(/\/$/, '');
  return /^https?:\/\//i.test(normalized) ? normalized : '';
}

function readRuntimeApiBase() {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search || '');
    const fromQuery = normalizeApiBase(params.get('apiBase') || params.get('backendUrl') || '');
    if (fromQuery) {
      window.localStorage?.setItem('fleetcheck_api_base', fromQuery);
      return fromQuery;
    }
    const fromStorage = normalizeApiBase(window.localStorage?.getItem('fleetcheck_api_base') || '');
    if (fromStorage) {
      return fromStorage;
    }
  } catch (_error) {}
  return '';
}

function resolveApiBase() {
  const raw = import.meta.env.VITE_BACKEND_URL;
  const envBase = normalizeApiBase(raw);
  if (typeof window !== 'undefined') {
    const host = String(window.location.hostname || '').toLowerCase();
    if (isLocalLikeHost(host)) {
      return 'http://127.0.0.1:3001';
    }
    const runtimeApiBase = readRuntimeApiBase();
    if (runtimeApiBase) {
      return runtimeApiBase;
    }
    if (envBase) {
      return envBase;
    }
    if (host.startsWith('fleetcheck.') || host.startsWith('fleet-check.')) {
      return 'https://api.alfamile.com';
    }
  }
  if (envBase) {
    return envBase;
  }
  if (import.meta.env.DEV) {
    return '';
  }
  return 'https://api.alfamile.com';
}

export const API_BASE = resolveApiBase();
