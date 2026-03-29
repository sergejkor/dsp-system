import { getAuthHeaders } from './authStore.js';

import { API_BASE } from '../config/apiBase.js';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getFines() {
  const res = await fetch(`${API_BASE}/api/fines`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load fines');
  return data;
}

export async function getFinesEmployees() {
  const res = await fetch(`${API_BASE}/api/fines/employees`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load employees');
  return data;
}

export async function createFine(payload) {
  const res = await fetch(`${API_BASE}/api/fines`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create fine');
  return data;
}

export async function updateFine(id, payload) {
  const res = await fetch(`${API_BASE}/api/fines/${id}`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update fine');
  return data;
}

export async function deleteFine(id) {
  const res = await fetch(`${API_BASE}/api/fines/${id}`, authOpts({
    method: 'DELETE',
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete fine');
  return data;
}

export async function uploadFineDocument(id, file) {
  const form = new FormData();
  form.append('file', file);
  // #region agent log
  fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H1',location:'frontend/src/services/finesApi.js:uploadFineDocument:before',message:'fine_upload_request_start',data:{fineId:id,hasFile:!!file,fileName:file?.name||null,size:file?.size||0},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const res = await fetch(`${API_BASE}/api/fines/${id}/documents`, authOpts({
    method: 'POST',
    body: form,
  }));
  const data = await res.json().catch(() => ({}));
  // #region agent log
  fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H1',location:'frontend/src/services/finesApi.js:uploadFineDocument:after',message:'fine_upload_response',data:{fineId:id,status:res.status,ok:res.ok,error:data?.error||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!res.ok) throw new Error(data.error || 'Failed to upload fine document');
  return data;
}

export async function getFineDocuments(id) {
  const res = await fetch(`${API_BASE}/api/fines/${id}/documents`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load fine documents');
  return data;
}

export async function downloadFineDocument(id, docId, fileName = 'fine-document.bin') {
  const res = await fetch(`${API_BASE}/api/fines/${id}/documents/${docId}/download`, authOpts());
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to download fine document');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deleteFineDocument(id, docId) {
  const res = await fetch(`${API_BASE}/api/fines/${id}/documents/${docId}`, authOpts({
    method: 'DELETE',
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete fine document');
  return data;
}

