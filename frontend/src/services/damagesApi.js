import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getDamages() {
  const res = await fetch(`${API_BASE}/api/damages`, authOpts());
  if (!res.ok) throw new Error('Failed to load damages');
  return res.json();
}

export async function getDamageById(id) {
  const res = await fetch(`${API_BASE}/api/damages/${id}`, authOpts());
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Failed to load damage');
  return out;
}

export async function createDamage(data) {
  const res = await fetch(`${API_BASE}/api/damages`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Failed to create damage');
  return out;
}

export async function updateDamage(id, data) {
  const res = await fetch(`${API_BASE}/api/damages/${id}`, authOpts({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Failed to update damage');
  return out;
}

export async function getDamageFiles(id) {
  const res = await fetch(`${API_BASE}/api/damages/${id}/files`, authOpts());
  if (!res.ok) throw new Error('Failed to load files');
  return res.json();
}

export async function uploadDamageFiles(id, files) {
  const form = new FormData();
  for (const f of files || []) form.append('files', f);
  const res = await fetch(`${API_BASE}/api/damages/${id}/files`, authOpts({
    method: 'POST',
    body: form,
  }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Failed to upload files');
  return out;
}

export async function downloadDamageFile(id, fileId, suggestedName) {
  const res = await fetch(`${API_BASE}/api/damages/${id}/files/${fileId}/download`, authOpts());
  if (!res.ok) throw new Error('Failed to download file');
  const blob = await res.blob();
  const name = suggestedName || 'damage-document';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function deleteDamageFile(id, fileId) {
  const res = await fetch(`${API_BASE}/api/damages/${id}/files/${fileId}`, authOpts({ method: 'DELETE' }));
  if (res.status === 204) return;
  const out = await res.json().catch(() => ({}));
  throw new Error(out.error || 'Failed to delete file');
}

export async function saveInsuranceReport(damageId, report) {
  const res = await fetch(`${API_BASE}/api/damages/${damageId}/save-and-send`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report }),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to save insurance report');
  }
  if (!data.success) {
    throw new Error(data.message || 'Save and send failed');
  }
  if (data.pdfBase64) {
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${data.pdfBase64}`;
    link.download = data.fileName || 'damage.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  if (data.outlook?.composeUrl) {
    const url = String(data.outlook.composeUrl);
    // Some browsers block `window.open('mailto:...')`. Use direct navigation for mailto.
    if (url.toLowerCase().startsWith('mailto:')) {
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
  return { ok: true, ...data };
}

