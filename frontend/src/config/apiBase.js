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

function resolveApiBase() {
  if (typeof window !== 'undefined') {
    const host = String(window.location.hostname || '').toLowerCase();
    if (isLocalLikeHost(host)) {
      return 'http://127.0.0.1:3001';
    }
  }
  const raw = import.meta.env.VITE_BACKEND_URL;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return '';
  }
  return 'https://api.alfamile.com';
}

export const API_BASE = resolveApiBase();
