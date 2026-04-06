import { API_BASE } from '../config/apiBase.js';
import { getToken } from './authStore.js';

function buildSocketUrl() {
  const base = API_BASE && String(API_BASE).trim() ? new URL(API_BASE) : new URL(window.location.origin);
  const wsUrl = new URL(base.origin);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.pathname = '/api/chat/ws';
  const token = getToken();
  if (token) wsUrl.searchParams.set('token', token);
  return wsUrl.toString();
}

export function createChatSocket({ onEvent, onStatusChange }) {
  let socket = null;
  let reconnectTimerId = null;
  let disposed = false;
  let reconnectAttempt = 0;

  function cleanup() {
    window.clearTimeout(reconnectTimerId);
    reconnectTimerId = null;
  }

  function scheduleReconnect() {
    if (disposed) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
    reconnectAttempt += 1;
    reconnectTimerId = window.setTimeout(connect, delay);
    onStatusChange?.('reconnecting');
  }

  function connect() {
    cleanup();
    try {
      socket = new window.WebSocket(buildSocketUrl());
    } catch (_error) {
      scheduleReconnect();
      return;
    }

    onStatusChange?.('connecting');

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      onStatusChange?.('connected');
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'));
        if (payload?.event) onEvent?.(payload);
      } catch (_error) {
        // ignore malformed payloads
      }
    });

    socket.addEventListener('close', () => {
      if (!disposed) scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      onStatusChange?.('error');
    });
  }

  connect();

  return {
    close() {
      disposed = true;
      cleanup();
      try {
        socket?.close();
      } catch (_error) {
        // ignore close errors
      }
    },
  };
}
