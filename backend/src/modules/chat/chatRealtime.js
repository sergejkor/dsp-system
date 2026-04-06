import { WebSocketServer } from 'ws';

import authService from '../auth/authService.js';

const userConnections = new Map();
let websocketServer = null;

function addConnection(userId, socket) {
  const key = Number(userId);
  const sockets = userConnections.get(key) || new Set();
  sockets.add(socket);
  userConnections.set(key, sockets);
}

function removeConnection(userId, socket) {
  const key = Number(userId);
  const sockets = userConnections.get(key);
  if (!sockets) return;
  sockets.delete(socket);
  if (!sockets.size) {
    userConnections.delete(key);
  }
}

function sendEvent(socket, event, payload) {
  if (!socket || socket.readyState !== 1) return;
  socket.send(JSON.stringify({ event, payload }));
}

function resolveTokenFromUpgradeRequest(request) {
  const rawUrl = new URL(request.url, 'http://localhost');
  const tokenFromQuery = rawUrl.searchParams.get('token');
  if (tokenFromQuery) return tokenFromQuery;

  const header = request.headers?.authorization;
  if (header && String(header).toLowerCase().startsWith('bearer ')) {
    return String(header).slice(7).trim();
  }

  const cookie = request.headers?.cookie;
  if (cookie) {
    const match = String(cookie).match(/auth_token=([^;]+)/);
    if (match) return match[1].trim();
  }

  return null;
}

async function authenticateUpgradeRequest(request) {
  const token = resolveTokenFromUpgradeRequest(request);
  if (!token) return null;

  const session = await authService.getSessionByToken(token);
  if (!session) return null;

  const user = await authService.getUserWithRole(session.user_id);
  if (!user) return null;

  return { token, session, user };
}

export function initChatRealtime(httpServer) {
  if (websocketServer) return websocketServer;

  websocketServer = new WebSocketServer({ noServer: true });

  websocketServer.on('connection', (socket, request, authContext) => {
    socket.userId = authContext.user.id;
    addConnection(authContext.user.id, socket);

    sendEvent(socket, 'chat.connected', {
      userId: authContext.user.id,
      connectedAt: new Date().toISOString(),
    });

    socket.on('message', (buffer) => {
      try {
        const payload = JSON.parse(String(buffer || '{}'));
        if (payload?.type === 'ping') {
          sendEvent(socket, 'chat.pong', { at: new Date().toISOString() });
        }
      } catch (_error) {
        // Ignore malformed client messages.
      }
    });

    socket.on('close', () => {
      removeConnection(authContext.user.id, socket);
    });

    socket.on('error', () => {
      removeConnection(authContext.user.id, socket);
    });
  });

  httpServer.on('upgrade', async (request, socket, head) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname !== '/api/chat/ws') {
        return;
      }

      const authContext = await authenticateUpgradeRequest(request);
      if (!authContext) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      websocketServer.handleUpgrade(request, socket, head, (ws) => {
        websocketServer.emit('connection', ws, request, authContext);
      });
    } catch (_error) {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  return websocketServer;
}

export function emitToUser(userId, event, payload) {
  const sockets = userConnections.get(Number(userId));
  if (!sockets) return;
  sockets.forEach((socket) => sendEvent(socket, event, payload));
}

export function emitToUsers(userIds, event, payloadByUserOrValue) {
  const uniqueUserIds = [...new Set((userIds || []).map((value) => Number(value)).filter(Boolean))];
  uniqueUserIds.forEach((userId) => {
    const payload =
      typeof payloadByUserOrValue === 'function'
        ? payloadByUserOrValue(userId)
        : payloadByUserOrValue;
    emitToUser(userId, event, payload);
  });
}

export default {
  initChatRealtime,
  emitToUser,
  emitToUsers,
};
