import { getAuthHeaders, clearToken } from './authStore.js';
import { API_BASE } from '../config/apiBase.js';

function buildUrl(path) {
  return `${API_BASE}${path}`;
}

async function handleJson(response) {
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!response.ok) {
    const error = new Error(data.error || response.statusText || 'Chat request failed');
    error.code = data.code || 'CHAT_REQUEST_FAILED';
    error.details = data.details || null;
    throw error;
  }
  return data;
}

async function fetchWithAuth(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });
  return handleJson(response);
}

export function listRooms() {
  return fetchWithAuth('/api/chat/rooms');
}

export function listChatUsers() {
  return fetchWithAuth('/api/chat/users');
}

export function getOrCreateDirectRoom(userId) {
  return fetchWithAuth(`/api/chat/direct/${userId}`, { method: 'POST' });
}

export function listMessages(roomId, { cursor = null, limit = 30 } = {}) {
  const url = new URL(buildUrl(`/api/chat/rooms/${roomId}/messages`));
  if (cursor != null && cursor !== '') url.searchParams.set('cursor', String(cursor));
  url.searchParams.set('limit', String(limit));
  return fetchWithAuth(`${url.pathname}${url.search}`);
}

export function sendMessage(roomId, body) {
  return fetchWithAuth(`/api/chat/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

export function uploadAttachment(roomId, { file, body = '' }) {
  const formData = new FormData();
  formData.append('file', file);
  if (body) formData.append('body', body);
  return fetchWithAuth(`/api/chat/rooms/${roomId}/attachments`, {
    method: 'POST',
    body: formData,
  });
}

export function markRoomRead(roomId) {
  return fetchWithAuth(`/api/chat/rooms/${roomId}/read`, {
    method: 'POST',
  });
}

export async function downloadAttachment(attachment) {
  const response = await fetch(buildUrl(`/api/chat/attachments/${attachment.id}/download`), {
    headers: { ...getAuthHeaders() },
  });
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to download attachment');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.original_name || attachment.stored_name || 'attachment';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
