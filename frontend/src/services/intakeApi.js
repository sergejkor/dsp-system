import { authHeaders, API_BASE, checkUnauthorized } from './apiClient.js';

function authOpts(options = {}) {
  return { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } };
}

async function parseJson(res) {
  return res.json().catch(() => ({}));
}

async function ensureOk(res, fallbackMessage) {
  if (await checkUnauthorized(res)) {
    throw new Error('Unauthorized');
  }
  const out = await parseJson(res);
  if (!res.ok) {
    throw new Error(out.error || fallbackMessage);
  }
  return out;
}

export async function getIntakeSummary() {
  const res = await fetch(`${API_BASE}/api/intake/summary`, authOpts());
  return ensureOk(res, 'Failed to load intake summary');
}

export async function listPersonalQuestionnaires(status = 'all') {
  const qs = new URLSearchParams();
  if (status && status !== 'all') qs.set('status', status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/intake/personal-questionnaires${suffix}`, authOpts());
  return ensureOk(res, 'Failed to load personal questionnaires');
}

export async function getPersonalQuestionnaire(id) {
  const res = await fetch(`${API_BASE}/api/intake/personal-questionnaires/${id}`, authOpts());
  return ensureOk(res, 'Failed to load personal questionnaire');
}

export async function updatePersonalQuestionnaire(id, payload, status = 'reviewing') {
  const res = await fetch(`${API_BASE}/api/intake/personal-questionnaires/${id}`, authOpts({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, status }),
  }));
  return ensureOk(res, 'Failed to save personal questionnaire');
}

export async function deletePersonalQuestionnaire(id) {
  const res = await fetch(`${API_BASE}/api/intake/personal-questionnaires/${id}`, authOpts({
    method: 'DELETE',
  }));
  return ensureOk(res, 'Failed to delete personal questionnaire');
}

export async function markPersonalQuestionnaireUnread(id) {
  const res = await fetch(`${API_BASE}/api/intake/personal-questionnaires/${id}/unread`, authOpts({
    method: 'POST',
  }));
  return ensureOk(res, 'Failed to mark personal questionnaire as unread');
}

export async function uploadPersonalQuestionnaireFiles(id, files, documentName) {
  const form = new FormData();
  for (const file of files || []) form.append('files', file);
  if (documentName) form.append('documentName', documentName);
  const res = await fetch(`${API_BASE}/api/intake/personal-questionnaires/${id}/files`, authOpts({
    method: 'POST',
    body: form,
  }));
  return ensureOk(res, 'Failed to upload personal questionnaire files');
}

export async function downloadPersonalQuestionnaireFile(id, fileId, suggestedName) {
  const res = await fetch(`${API_BASE}/api/intake/personal-questionnaires/${id}/files/${fileId}/download`, authOpts());
  if (await checkUnauthorized(res)) throw new Error('Unauthorized');
  if (!res.ok) throw new Error('Failed to download file');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName || 'submission-file';
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveAndSendPersonalQuestionnaire(id) {
  const res = await fetch(`${API_BASE}/api/intake/personal-questionnaires/${id}/save-and-send`, authOpts({
    method: 'POST',
  }));
  return ensureOk(res, 'Failed to save and send personal questionnaire');
}

export async function listDamageReports(status = 'all') {
  const qs = new URLSearchParams();
  if (status && status !== 'all') qs.set('status', status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/intake/damage-reports${suffix}`, authOpts());
  return ensureOk(res, 'Failed to load damage reports');
}

export async function getDamageReport(id) {
  const res = await fetch(`${API_BASE}/api/intake/damage-reports/${id}`, authOpts());
  return ensureOk(res, 'Failed to load damage report');
}

export async function updateDamageReport(id, payload, status = 'reviewing') {
  const res = await fetch(`${API_BASE}/api/intake/damage-reports/${id}`, authOpts({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, status }),
  }));
  return ensureOk(res, 'Failed to save damage report');
}

export async function markDamageReportUnread(id) {
  const res = await fetch(`${API_BASE}/api/intake/damage-reports/${id}/unread`, authOpts({
    method: 'POST',
  }));
  return ensureOk(res, 'Failed to mark damage report as unread');
}

export async function uploadDamageReportFiles(id, files) {
  const form = new FormData();
  for (const file of files || []) form.append('files', file);
  const res = await fetch(`${API_BASE}/api/intake/damage-reports/${id}/files`, authOpts({
    method: 'POST',
    body: form,
  }));
  return ensureOk(res, 'Failed to upload damage report files');
}

export async function downloadDamageReportFile(id, fileId, suggestedName) {
  const res = await fetch(`${API_BASE}/api/intake/damage-reports/${id}/files/${fileId}/download`, authOpts());
  if (await checkUnauthorized(res)) throw new Error('Unauthorized');
  if (!res.ok) throw new Error('Failed to download file');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName || 'damage-report-file';
  a.click();
  URL.revokeObjectURL(url);
}
