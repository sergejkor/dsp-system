import { API_BASE } from '../config/apiBase.js';
import { getAuthHeaders } from './authStore.js';
import { checkUnauthorized } from './apiClient.js';

function buildUrl(path) {
  return `${API_BASE}${path}`;
}

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || res.statusText || 'Chat request failed');
    error.code = data.code || 'CHAT_REQUEST_FAILED';
    error.details = data.details || null;
    error.status = res.status;
    throw error;
  }
  return data;
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  await checkUnauthorized(response);
  return parseJson(response);
}

export function listRooms() {
  return request('/api/chat/rooms');
}

export function listChatUsers() {
  return request('/api/chat/users');
}

export function getOrCreateDirectRoom(userId) {
  return request(`/api/chat/direct/${userId}`, { method: 'POST' });
}

export function listMessages(roomId, { cursor = null, limit = 30 } = {}) {
  const url = new URL(buildUrl(`/api/chat/rooms/${roomId}/messages`));
  if (cursor != null && cursor !== '') url.searchParams.set('cursor', String(cursor));
  if (limit != null) url.searchParams.set('limit', String(limit));
  return request(url.pathname + url.search, { method: 'GET' });
}

export function sendMessage(roomId, body) {
  return request(`/api/chat/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

export function uploadAttachment(roomId, { file, body }) {
  const formData = new FormData();
  formData.append('file', file);
  if (body) formData.append('body', body);
  return request(`/api/chat/rooms/${roomId}/attachments`, {
    method: 'POST',
    body: formData,
  });
}

export function markRoomRead(roomId) {
  return request(`/api/chat/rooms/${roomId}/read`, { method: 'POST' });
}

export async function downloadAttachment(attachment) {
  const response = await fetch(buildUrl(`/api/chat/attachments/${attachment.id}/download`), {
    headers: { ...getAuthHeaders() },
  });

  await checkUnauthorized(response);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to download attachment');
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = attachment.original_name || attachment.stored_name || 'attachment';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}
