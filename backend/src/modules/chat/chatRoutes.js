import { Router } from 'express';
import multer from 'multer';

import authMiddleware from '../auth/authMiddleware.js';
import { CHAT_MAX_FILE_BYTES } from './chatConfig.js';
import chatService from './chatService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CHAT_MAX_FILE_BYTES,
    files: 1,
  },
});

router.use(authMiddleware.requireAuth);

function getCurrentUserId(req) {
  return Number(req.user?.id);
}

function sendChatError(res, error) {
  const payload = chatService.formatChatError(error);
  return res.status(payload.status).json(payload.body);
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, module: 'chat' });
});

router.get('/rooms', async (req, res) => {
  try {
    const rooms = await chatService.listRoomsForUser(getCurrentUserId(req));
    res.json({ items: rooms });
  } catch (error) {
    console.error('GET /api/chat/rooms', error);
    sendChatError(res, error);
  }
});

router.post('/direct/:userId', async (req, res) => {
  try {
    const room = await chatService.getOrCreateDirectRoom(getCurrentUserId(req), req.params.userId);
    res.json(room);
  } catch (error) {
    console.error('POST /api/chat/direct/:userId', error);
    sendChatError(res, error);
  }
});

router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const result = await chatService.listMessagesForRoom(getCurrentUserId(req), req.params.roomId, {
      cursor: req.query.cursor,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (error) {
    console.error('GET /api/chat/rooms/:roomId/messages', error);
    sendChatError(res, error);
  }
});

router.post('/rooms/:roomId/messages', async (req, res) => {
  try {
    const message = await chatService.sendTextMessage({
      roomId: req.params.roomId,
      senderId: getCurrentUserId(req),
      body: req.body?.body,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json(message);
  } catch (error) {
    console.error('POST /api/chat/rooms/:roomId/messages', error);
    sendChatError(res, error);
  }
});

router.post('/rooms/:roomId/attachments', upload.single('file'), async (req, res) => {
  try {
    const message = await chatService.sendAttachmentMessage({
      roomId: req.params.roomId,
      senderId: getCurrentUserId(req),
      body: req.body?.body,
      file: req.file,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json(message);
  } catch (error) {
    console.error('POST /api/chat/rooms/:roomId/attachments', error);
    sendChatError(res, error);
  }
});

router.get('/attachments/:attachmentId/download', async (req, res) => {
  try {
    const attachment = await chatService.getAttachmentDownload(
      req.params.attachmentId,
      getCurrentUserId(req),
      req.ip,
      req.get('user-agent')
    );
    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.original_name || attachment.stored_name)}"`
    );
    res.sendFile(attachment.absolute_path);
  } catch (error) {
    console.error('GET /api/chat/attachments/:attachmentId/download', error);
    sendChatError(res, error);
  }
});

router.post('/rooms/:roomId/read', async (req, res) => {
  try {
    const result = await chatService.markRoomAsRead({
      roomId: req.params.roomId,
      userId: getCurrentUserId(req),
    });
    res.json(result);
  } catch (error) {
    console.error('POST /api/chat/rooms/:roomId/read', error);
    sendChatError(res, error);
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await chatService.listUsersForDirectChats(getCurrentUserId(req));
    res.json({ items: users });
  } catch (error) {
    console.error('GET /api/chat/users', error);
    sendChatError(res, error);
  }
});

export default router;
