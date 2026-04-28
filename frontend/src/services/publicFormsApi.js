import { API_BASE, apiBaseHeaders } from './apiClient.js';

async function fetchWithRetry(url, options, { retries = 2, backoffMs = 700 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error).toLowerCase();
      const isNetworkError = message.includes('failed to fetch') || message.includes('network error');
      if (!isNetworkError || attempt >= retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

async function parseApiResponse(res) {
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return res.json().catch(() => ({}));
  }
  const text = await res.text().catch(() => '');
  return { error: text || 'Request failed' };
}

async function submitMultipart(urlPath, payload, files) {
  const form = new FormData();
  form.append('payload', JSON.stringify(payload || {}));
  for (const file of files || []) {
    form.append('files', file);
  }

  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}${urlPath}`, {
      method: 'POST',
      body: form,
      headers: {
        ...apiBaseHeaders(),
      },
    });
  } catch (error) {
    throw new Error(`Cannot reach the backend at ${API_BASE}. ${String(error?.message || error)}`);
  }
  const out = await parseApiResponse(res);
  if (!res.ok) {
    throw new Error(out.error || 'Submission failed');
  }
  return out;
}

async function submitJson(urlPath, payload) {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}${urlPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...apiBaseHeaders(),
      },
      body: JSON.stringify(payload || {}),
    });
  } catch (error) {
    throw new Error(`Cannot reach the backend at ${API_BASE}. ${String(error?.message || error)}`);
  }
  const out = await parseApiResponse(res);
  if (!res.ok) {
    throw new Error(out.error || 'Submission failed');
  }
  return out;
}

export function submitPersonalQuestionnaire(payload) {
  return submitJson('/api/public/personal-fragebogen', payload);
}

export function submitDamageReport(payload, files) {
  return submitMultipart('/api/public/schadenmeldung', payload, files);
}

export async function getDamageReportOptions() {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/api/public/schadenmeldung/options`, {
      cache: 'no-store',
      headers: {
        ...apiBaseHeaders(),
      },
    });
  } catch (error) {
    throw new Error(`Cannot reach the backend at ${API_BASE}. ${String(error?.message || error)}`);
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(out.error || 'Failed to load options');
  }
  return {
    drivers: Array.isArray(out?.drivers) ? out.drivers : [],
    cars: Array.isArray(out?.cars) ? out.cars : [],
  };
}

export async function searchAddressSuggestions(query) {
  const qs = new URLSearchParams({ q: String(query || '') });
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/api/public/address-search?${qs.toString()}`, {
      cache: 'no-store',
      headers: {
        ...apiBaseHeaders(),
      },
    });
  } catch (error) {
    throw new Error(`Cannot reach the backend at ${API_BASE}. ${String(error?.message || error)}`);
  }
  const out = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(out.error || 'Address search failed');
  }
  return Array.isArray(out) ? out : [];
}
