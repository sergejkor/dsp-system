import { API_BASE } from '../config/apiBase.js';
import { getToken } from './authStore.js';

function buildSocketUrl() {
  const baseUrl =
    API_BASE && String(API_BASE).trim()
      ? new URL(API_BASE)
      : new URL(window.location.origin);
  const wsUrl = new URL(baseUrl.origin);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.pathname = '/api/chat/ws';
  const token = getToken();
  if (token) wsUrl.searchParams.set('token', token);
  return wsUrl.toString();
}

export function createChatSocket({ onEvent, onStatusChange }) {
  let socket = null;
  let reconnectTimerId = null;
  let pingTimerId = null;
  let disposed = false;
  let reconnectAttempt = 0;

  function cleanupTimers() {
    window.clearTimeout(reconnectTimerId);
    window.clearInterval(pingTimerId);
    reconnectTimerId = null;
    pingTimerId = null;
  }

  function scheduleReconnect() {
    if (disposed) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
    reconnectAttempt += 1;
    reconnectTimerId = window.setTimeout(connect, delay);
    onStatusChange?.('reconnecting');
  }

  function connect() {
    cleanupTimers();

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
      pingTimerId = window.setInterval(() => {
        if (socket?.readyState === window.WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'));
        if (payload?.event) onEvent?.(payload);
      } catch (_error) {
        // Ignore malformed payloads.
      }
    });

    socket.addEventListener('close', () => {
      cleanupTimers();
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
      cleanupTimers();
      try {
        socket?.close();
      } catch (_error) {
        // ignore close errors
      }
      socket = null;
    },
  };
}
