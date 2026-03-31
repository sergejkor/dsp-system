import { API_BASE } from './apiClient.js';

async function submitMultipart(urlPath, payload, files) {
  const form = new FormData();
  form.append('payload', JSON.stringify(payload || {}));
  for (const file of files || []) {
    form.append('files', file);
  }

  const res = await fetch(`${API_BASE}${urlPath}`, {
    method: 'POST',
    body: form,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(out.error || 'Submission failed');
  }
  return out;
}

export function submitPersonalQuestionnaire(payload, files) {
  return submitMultipart('/api/public/personal-fragebogen', payload, files);
}

export function submitDamageReport(payload, files) {
  return submitMultipart('/api/public/schadenmeldung', payload, files);
}

export async function searchAddressSuggestions(query) {
  const qs = new URLSearchParams({ q: String(query || '') });
  const res = await fetch(`${API_BASE}/api/public/address-search?${qs.toString()}`);
  const out = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(out.error || 'Address search failed');
  }
  return Array.isArray(out) ? out : [];
}
