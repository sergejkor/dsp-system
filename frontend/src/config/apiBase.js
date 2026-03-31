/**
 * API origin for fetch(). In Vite dev, empty string = same origin + `/api` proxy (see vite.config.js).
 * Set VITE_BACKEND_URL in .env / .env.production to override (e.g. https://api.alfamile.com).
 */
function resolveApiBase() {
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
