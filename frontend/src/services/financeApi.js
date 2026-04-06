import { getToken } from './authStore.js';

import { API_BASE } from '../config/apiBase.js';

function getHeaders() {
  const t = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        data.error ||
          'Finance API not found (404). Deploy the latest backend with /api/finance, or point the frontend to a backend that includes it (VITE_BACKEND_URL).',
      );
    }
    throw new Error(data.error || data.hint || res.statusText || 'Request failed');
  }
  return data;
}

export async function getFinance() {
  const res = await fetch(`${API_BASE}/api/finance`, { headers: getHeaders() });
  return handle(res);
}
