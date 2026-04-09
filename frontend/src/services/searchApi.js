import { API_BASE } from '../config/apiBase.js';
import { getAuthHeaders } from './authStore.js';

function authOpts(opts = {}) {
  return {
    ...opts,
    headers: {
      ...getAuthHeaders(),
      ...(opts.headers || {}),
    },
  };
}

export async function searchGlobal(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return { items: [] };
  const res = await fetch(`${API_BASE}/api/search/global?q=${encodeURIComponent(q)}`, authOpts());
  const raw = await res.text().catch(() => '');
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const detail = data.error || data.message || '';
    if (res.status === 401) throw new Error('Unauthorized');
    if (res.status === 404) throw new Error('Search API route is not available on the server');
    throw new Error(detail || `Search failed (${res.status})`);
  }
  return data;
}
