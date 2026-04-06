import { pool, query } from '../../db.js';
import auditLogService from '../settings/auditLogService.js';
import {
  CHAT_MAX_MESSAGE_LENGTH,
  CHAT_MESSAGE_RATE_LIMIT,
  CHAT_MESSAGE_RATE_WINDOW_MS,
  CHAT_UPLOAD_RATE_LIMIT,
  CHAT_UPLOAD_RATE_WINDOW_MS,
} from './chatConfig.js';
import { emitToUsers } from './chatRealtime.js';
import { enforceRateLimit } from './chatRateLimit.js';
import { deleteStoredFile, resolveStoredPath, saveAttachmentFile } from './chatStorageService.js';

class ChatError extends Error {
  constructor(message, status = 400, code = 'CHAT_ERROR', details = null) {
    super(message);
    this.name = 'ChatError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function trimMessageBody(body) {
  return String(body || '').trim();
}

function buildDirectKey(userA, userB) {
  const [firstId, secondId] = [Number(userA), Number(userB)].sort((a, b) => a - b);
  return `${firstId}:${secondId}`;
}

function fullNameFromUser(user) {
  const fullName = String(user?.full_name || '').trim();
  if (fullName) return fullName;
  const fallback = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return fallback || user?.email || `User #${user?.id ?? ''}`.trim();
}

function mapParticipant(row) {
  return {
    id: row.id,
    name: fullNameFromUser(row),
    email: row.email || null,
    avatar_url: row.avatar_url || null,
  };
}

function mapMessageRow(row) {
  return {
    id: Number(row.id),
    room_id: Number(row.room_id),
    sender_id: row.sender_id != null ? Number(row.sender_id) : null,
    body: row.body || '',
    message_type: row.message_type,
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    sender: row.sender_id
      ? {
          id: Number(row.sender_id),
          name: fullNameFromUser(row),
          email: row.sender_email || null,
          avatar_url: row.sender_avatar_url || null,
        }
      : null,
    attachments: [],
  };
}

async function getUserById(userId, db = pool) {
  const res = await db.query(
    `SELECT id, email, first_name, last_name, full_name, avatar_url, status, login_enabled, is_locked
     FROM settings_users
     WHERE id = $1`,
    [userId]
  );
  return res.rows?.[0] || null;
}

async function assertUserExists(userId, db = pool) {
  const user = await getUserById(userId, db);
  if (!user) {
    throw new ChatError('User not found', 404, 'CHAT_USER_NOT_FOUND');
  }
  return user;
}

async function getRoomById(roomId, db = pool) {
  const res = await db.query(
    `SELECT id, name, type, direct_key, created_at, updated_at
     FROM chat_rooms
     WHERE id = $1`,
    [roomId]
  );
  return res.rows?.[0] || null;
}

async function getRoomParticipantIds(roomId, db = pool) {
  const res = await db.query(
    `SELECT user_id
     FROM chat_room_participants
     WHERE room_id = $1`,
    [roomId]
  );
  return (res.rows || []).map((row) => Number(row.user_id));
}

async function ensureRoomMembership(roomId, userId, db = pool) {
  const res = await db.query(
    `SELECT r.id, r.name, r.type, r.direct_key, r.created_at, r.updated_at
     FROM chat_rooms r
     JOIN chat_room_participants p ON p.room_id = r.id
     WHERE r.id = $1 AND p.user_id = $2`,
    [roomId, userId]
  );

  if (!res.rows?.[0]) {
    throw new ChatError('Room not found or access denied', 404, 'CHAT_ROOM_NOT_FOUND');
  }

  return res.rows[0];
}

async function getRoomParticipants(roomIds, db = pool) {
  if (!roomIds?.length) return new Map();
  const res = await db.query(
    `SELECT p.room_id, u.id, u.email, u.first_name, u.last_name, u.full_name, u.avatar_url
     FROM chat_room_participants p
     JOIN settings_users u ON u.id = p.user_id
     WHERE p.room_id = ANY($1::int[])
     ORDER BY p.room_id, COALESCE(NULLIF(TRIM(u.full_name), ''), TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), u.email) ASC`,
    [roomIds]
  );

  const grouped = new Map();
  for (const row of res.rows || []) {
    const roomId = Number(row.room_id);
    const list = grouped.get(roomId) || [];
    list.push(mapParticipant(row));
    grouped.set(roomId, list);
  }
  return grouped;
}

async function getUnreadCounts(userId, roomIds, db = pool) {
  if (!roomIds?.length) return new Map();
  const res = await db.query(
    `SELECT m.room_id, COUNT(*)::int AS unread_count
     FROM chat_messages m
     WHERE m.room_id = ANY($1::int[])
       AND m.deleted_at IS NULL
       AND COALESCE(m.sender_id, 0) <> $2
       AND NOT EXISTS (
         SELECT 1
         FROM chat_message_reads mr
         WHERE mr.message_id = m.id
           AND mr.user_id = $2
       )
     GROUP BY m.room_id`,
    [roomIds, userId]
  );

  const unreadByRoom = new Map();
  for (const row of res.rows || []) {
    unreadByRoom.set(Number(row.room_id), Number(row.unread_count));
  }
  return unreadByRoom;
}

async function getLastMessages(roomIds, db = pool) {
  if (!roomIds?.length) return new Map();
  const res = await db.query(
    `SELECT DISTINCT ON (m.room_id)
        m.id,
        m.room_id,
        m.sender_id,
        m.body,
        m.message_type,
        m.created_at,
        m.updated_at,
        m.edited_at,
        m.deleted_at,
        u.email AS sender_email,
        u.first_name AS sender_first_name,
        u.last_name AS sender_last_name,
        u.full_name,
        u.avatar_url AS sender_avatar_url
     FROM chat_messages m
     LEFT JOIN settings_users u ON u.id = m.sender_id
     WHERE m.room_id = ANY($1::int[])
       AND m.deleted_at IS NULL
     ORDER BY m.room_id, m.id DESC`,
    [roomIds]
  );

  const map = new Map();
  for (const row of res.rows || []) {
    map.set(Number(row.room_id), mapMessageRow(row));
  }
  return map;
}

async function enrichMessagesWithAttachments(messages, db = pool) {
  if (!messages?.length) return messages || [];
  const messageIds = messages.map((message) => Number(message.id));
  const res = await db.query(
    `SELECT id, message_id, original_name, stored_name, mime_type, extension, size_bytes, storage_disk, storage_path, created_at
     FROM chat_attachments
     WHERE message_id = ANY($1::bigint[])
     ORDER BY id ASC`,
    [messageIds]
  );

  const attachmentMap = new Map();
  for (const row of res.rows || []) {
    const messageId = Number(row.message_id);
    const list = attachmentMap.get(messageId) || [];
    list.push({
      id: Number(row.id),
      message_id: messageId,
      original_name: row.original_name,
      stored_name: row.stored_name,
      mime_type: row.mime_type,
      extension: row.extension,
      size_bytes: Number(row.size_bytes),
      storage_disk: row.storage_disk,
      storage_path: row.storage_path,
      created_at: row.created_at,
    });
    attachmentMap.set(messageId, list);
  }

  return messages.map((message) => ({
    ...message,
    attachments: attachmentMap.get(Number(message.id)) || [],
  }));
}

async function hydrateRoomSummariesForUser(userId, roomIds, db = pool) {
  if (!roomIds?.length) return [];

  const roomRes = await db.query(
    `SELECT r.id, r.name, r.type, r.direct_key, r.created_at, r.updated_at
     FROM chat_rooms r
     JOIN chat_room_participants p ON p.room_id = r.id
     WHERE p.user_id = $1
       AND r.id = ANY($2::int[])
     ORDER BY r.id ASC`,
    [userId, roomIds]
  );

  const rooms = roomRes.rows || [];
  const foundRoomIds = rooms.map((room) => Number(room.id));
  const [participantsByRoom, unreadByRoom, lastMessageByRoom] = await Promise.all([
    getRoomParticipants(foundRoomIds, db),
    getUnreadCounts(userId, foundRoomIds, db),
    getLastMessages(foundRoomIds, db),
  ]);

  return rooms
    .map((room) => {
      const roomId = Number(room.id);
      const participants = participantsByRoom.get(roomId) || [];
      const lastMessage = lastMessageByRoom.get(roomId) || null;
      const directPeer =
        room.type === 'direct'
          ? participants.find((participant) => Number(participant.id) !== Number(userId)) || participants[0] || null
          : null;

      return {
        id: roomId,
        name:
          room.type === 'global'
            ? room.name || 'General'
            : room.type === 'direct'
              ? directPeer?.name || room.name || 'Direct chat'
              : room.name || 'Group chat',
        type: room.type,
        participants,
        last_message: lastMessage,
        last_message_at: lastMessage?.created_at || room.updated_at || room.created_at,
        unread_count: unreadByRoom.get(roomId) || 0,
      };
    })
    .sort((left, right) => {
      if (left.type === 'global' && right.type !== 'global') return -1;
      if (right.type === 'global' && left.type !== 'global') return 1;
      return new Date(right.last_message_at || 0).getTime() - new Date(left.last_message_at || 0).getTime();
    });
}

async function hydrateRoomSummaryForUser(userId, roomId, db = pool) {
  const rooms = await hydrateRoomSummariesForUser(userId, [roomId], db);
  return rooms[0] || null;
}

async function broadcastRoomUpdated(roomId, participantIds) {
  const uniqueUserIds = [...new Set((participantIds || []).map((value) => Number(value)).filter(Boolean))];
  const summaries = await Promise.all(
    uniqueUserIds.map(async (userId) => [userId, await hydrateRoomSummaryForUser(userId, roomId)]),
  );
  const summaryMap = new Map(summaries);

  emitToUsers(uniqueUserIds, 'chat.room.updated', (userId) => ({
    room: summaryMap.get(Number(userId)) || null,
  }));
}

async function createMessageReadRecords(roomId, userId, db = pool) {
  const latestUnreadRes = await db.query(
    `SELECT m.id
     FROM chat_messages m
     WHERE m.room_id = $1
       AND m.deleted_at IS NULL
       AND COALESCE(m.sender_id, 0) <> $2
       AND NOT EXISTS (
         SELECT 1 FROM chat_message_reads mr
         WHERE mr.message_id = m.id
           AND mr.user_id = $2
       )
     ORDER BY m.id DESC
     LIMIT 1`,
    [roomId, userId]
  );

  const latestUnreadMessageId = latestUnreadRes.rows?.[0]?.id ? Number(latestUnreadRes.rows[0].id) : null;

  const insertedRes = await db.query(
    `INSERT INTO chat_message_reads (message_id, user_id, read_at)
     SELECT m.id, $2, NOW()
     FROM chat_messages m
     WHERE m.room_id = $1
       AND m.deleted_at IS NULL
       AND COALESCE(m.sender_id, 0) <> $2
       AND NOT EXISTS (
         SELECT 1 FROM chat_message_reads mr
         WHERE mr.message_id = m.id
           AND mr.user_id = $2
       )
     ON CONFLICT (message_id, user_id) DO NOTHING
     RETURNING message_id`,
    [roomId, userId]
  );

  return {
    messageIds: (insertedRes.rows || []).map((row) => Number(row.message_id)),
    latestUnreadMessageId,
  };
}

async function insertMessage({
  roomId,
  senderId,
  body,
  messageType,
  attachmentRecord = null,
  dbClient,
}) {
  const messageRes = await dbClient.query(
    `INSERT INTO chat_messages (room_id, sender_id, body, message_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id`,
    [roomId, senderId, body || null, messageType]
  );
  const messageId = Number(messageRes.rows[0].id);

  if (attachmentRecord) {
    await dbClient.query(
      `INSERT INTO chat_attachments (message_id, original_name, stored_name, mime_type, extension, size_bytes, storage_disk, storage_path, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        messageId,
        attachmentRecord.original_name,
        attachmentRecord.stored_name,
        attachmentRecord.mime_type,
        attachmentRecord.extension,
        attachmentRecord.size_bytes,
        attachmentRecord.storage_disk,
        attachmentRecord.storage_path,
      ]
    );
  }

  await dbClient.query('UPDATE chat_rooms SET updated_at = NOW() WHERE id = $1', [roomId]);

  return messageId;
}

async function hydrateMessageById(messageId, db = pool) {
  const res = await db.query(
    `SELECT m.id, m.room_id, m.sender_id, m.body, m.message_type, m.created_at, m.updated_at, m.edited_at, m.deleted_at,
            u.email AS sender_email,
            u.first_name AS sender_first_name,
            u.last_name AS sender_last_name,
            u.full_name,
            u.avatar_url AS sender_avatar_url
     FROM chat_messages m
     LEFT JOIN settings_users u ON u.id = m.sender_id
     WHERE m.id = $1`,
    [messageId]
  );

  const row = res.rows?.[0];
  if (!row) return null;
  const messages = await enrichMessagesWithAttachments([mapMessageRow(row)], db);
  return messages[0] || null;
}

export async function ensureGlobalRoom(db = pool) {
  const existing = await db.query(
    `SELECT id, name, type
     FROM chat_rooms
     WHERE type = 'global'
     LIMIT 1`
  );
  if (existing.rows?.[0]) return existing.rows[0];

  try {
    const created = await db.query(
      `INSERT INTO chat_rooms (name, type, created_at, updated_at)
       VALUES ('General', 'global', NOW(), NOW())
       RETURNING id, name, type`
    );
    return created.rows[0];
  } catch (_error) {
    const fallback = await db.query(
      `SELECT id, name, type
       FROM chat_rooms
       WHERE type = 'global'
       LIMIT 1`
    );
    if (fallback.rows?.[0]) return fallback.rows[0];
    throw _error;
  }
}

export async function backfillGlobalRoomParticipants(db = pool) {
  const globalRoom = await ensureGlobalRoom(db);
  await db.query(
    `INSERT INTO chat_room_participants (room_id, user_id, joined_at)
     SELECT $1, u.id, NOW()
     FROM settings_users u
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [globalRoom.id]
  );
  return globalRoom;
}

export async function ensureUserInGlobalRoom(userId, db = pool) {
  await assertUserExists(userId, db);
  const globalRoom = await ensureGlobalRoom(db);
  await db.query(
    `INSERT INTO chat_room_participants (room_id, user_id, joined_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [globalRoom.id, userId]
  );
  return globalRoom;
}

export async function listUsersForDirectChats(currentUserId, db = pool) {
  const res = await db.query(
    `SELECT id, email, first_name, last_name, full_name, avatar_url
     FROM settings_users
     WHERE id <> $1
       AND status = 'active'
       AND COALESCE(is_locked, false) = false
       AND COALESCE(login_enabled, false) = true
     ORDER BY COALESCE(NULLIF(TRIM(full_name), ''), TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), email) ASC`,
    [currentUserId]
  );

  return (res.rows || []).map(mapParticipant);
}

export async function listRoomsForUser(userId, db = pool) {
  await ensureUserInGlobalRoom(userId, db);

  const roomRes = await db.query(
    `SELECT r.id
     FROM chat_rooms r
     JOIN chat_room_participants p ON p.room_id = r.id
     WHERE p.user_id = $1`,
    [userId]
  );

  const roomIds = (roomRes.rows || []).map((row) => Number(row.id));
  return hydrateRoomSummariesForUser(userId, roomIds, db);
}

export async function getOrCreateDirectRoom(currentUserId, targetUserId, db = pool) {
  const numericTargetUserId = Number(targetUserId);
  if (!Number.isInteger(numericTargetUserId)) {
    throw new ChatError('Invalid direct chat target', 400, 'CHAT_INVALID_TARGET');
  }
  if (numericTargetUserId === Number(currentUserId)) {
    throw new ChatError('Cannot create direct chat with yourself', 400, 'CHAT_SELF_DIRECT');
  }

  const targetUser = await assertUserExists(numericTargetUserId, db);
  if (targetUser.status !== 'active' || targetUser.is_locked || !targetUser.login_enabled) {
    throw new ChatError('Target user is not available for chat', 400, 'CHAT_TARGET_UNAVAILABLE');
  }

  await ensureUserInGlobalRoom(currentUserId, db);
  await ensureUserInGlobalRoom(numericTargetUserId, db);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const directKey = buildDirectKey(currentUserId, numericTargetUserId);
    const roomRes = await client.query(
      `INSERT INTO chat_rooms (name, type, direct_key, created_at, updated_at)
       VALUES (NULL, 'direct', $1, NOW(), NOW())
       ON CONFLICT (direct_key)
       DO UPDATE SET updated_at = chat_rooms.updated_at
       RETURNING id`,
      [directKey]
    );
    const roomId = Number(roomRes.rows[0].id);

    await client.query(
      `INSERT INTO chat_room_participants (room_id, user_id, joined_at)
       VALUES ($1, $2, NOW()), ($1, $3, NOW())
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [roomId, currentUserId, numericTargetUserId]
    );

    await client.query('COMMIT');

    await broadcastRoomUpdated(roomId, [currentUserId, numericTargetUserId]);
    return hydrateRoomSummaryForUser(currentUserId, roomId, db);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listMessagesForRoom(userId, roomId, options = {}, db = pool) {
  const numericRoomId = Number(roomId);
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const cursor = options.cursor != null && String(options.cursor).trim() !== '' ? Number(options.cursor) : null;
  if (cursor != null && !Number.isFinite(cursor)) {
    throw new ChatError('Invalid cursor', 400, 'CHAT_INVALID_CURSOR');
  }

  await ensureRoomMembership(numericRoomId, userId, db);

  const res = await db.query(
    `SELECT m.id, m.room_id, m.sender_id, m.body, m.message_type, m.created_at, m.updated_at, m.edited_at, m.deleted_at,
            u.email AS sender_email,
            u.first_name AS sender_first_name,
            u.last_name AS sender_last_name,
            u.full_name,
            u.avatar_url AS sender_avatar_url
     FROM chat_messages m
     LEFT JOIN settings_users u ON u.id = m.sender_id
     WHERE m.room_id = $1
       AND m.deleted_at IS NULL
       AND ($2::bigint IS NULL OR m.id < $2)
     ORDER BY m.id DESC
     LIMIT $3`,
    [numericRoomId, cursor, limit]
  );

  const rows = res.rows || [];
  const messages = await enrichMessagesWithAttachments(rows.map(mapMessageRow), db);
  messages.reverse();

  return {
    items: messages,
    next_cursor: rows.length === limit ? Number(rows[rows.length - 1].id) : null,
  };
}

export async function sendTextMessage({ roomId, senderId, body, ipAddress, userAgent }) {
  const normalizedBody = trimMessageBody(body);
  if (!normalizedBody) {
    throw new ChatError('Message body is required', 400, 'CHAT_MESSAGE_EMPTY');
  }
  if (normalizedBody.length > CHAT_MAX_MESSAGE_LENGTH) {
    throw new ChatError(
      `Message exceeds ${CHAT_MAX_MESSAGE_LENGTH} characters`,
      400,
      'CHAT_MESSAGE_TOO_LONG'
    );
  }

  enforceRateLimit({
    action: 'message',
    userId: senderId,
    limit: CHAT_MESSAGE_RATE_LIMIT,
    windowMs: CHAT_MESSAGE_RATE_WINDOW_MS,
  });

  const room = await ensureRoomMembership(roomId, senderId);
  const participantIds = await getRoomParticipantIds(room.id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const messageId = await insertMessage({
      roomId: room.id,
      senderId,
      body: normalizedBody,
      messageType: 'text',
      dbClient: client,
    });
    await client.query(
      `INSERT INTO chat_message_reads (message_id, user_id, read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [messageId, senderId]
    );
    await client.query('COMMIT');

    const message = await hydrateMessageById(messageId);
    emitToUsers(participantIds, 'chat.message.created', { roomId: Number(room.id), message });
    await broadcastRoomUpdated(room.id, participantIds);
    return message;
  } catch (error) {
    await client.query('ROLLBACK');
    await auditLogService
      .log('chat_message', roomId, 'send_failed', null, { reason: error.message }, senderId, ipAddress, userAgent)
      .catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function sendAttachmentMessage({ roomId, senderId, body, file, ipAddress, userAgent }) {
  enforceRateLimit({
    action: 'upload',
    userId: senderId,
    limit: CHAT_UPLOAD_RATE_LIMIT,
    windowMs: CHAT_UPLOAD_RATE_WINDOW_MS,
  });

  const normalizedBody = trimMessageBody(body);
  if (normalizedBody.length > CHAT_MAX_MESSAGE_LENGTH) {
    throw new ChatError(
      `Message exceeds ${CHAT_MAX_MESSAGE_LENGTH} characters`,
      400,
      'CHAT_MESSAGE_TOO_LONG'
    );
  }

  const room = await ensureRoomMembership(roomId, senderId);
  const participantIds = await getRoomParticipantIds(room.id);
  const storedFile = await saveAttachmentFile(file);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const messageType = normalizedBody ? 'mixed' : 'file';
    const messageId = await insertMessage({
      roomId: room.id,
      senderId,
      body: normalizedBody || null,
      messageType,
      attachmentRecord: storedFile,
      dbClient: client,
    });
    await client.query(
      `INSERT INTO chat_message_reads (message_id, user_id, read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [messageId, senderId]
    );
    await client.query('COMMIT');

    const message = await hydrateMessageById(messageId);
    emitToUsers(participantIds, 'chat.message.created', { roomId: Number(room.id), message });
    await broadcastRoomUpdated(room.id, participantIds);
    return message;
  } catch (error) {
    await client.query('ROLLBACK');
    await deleteStoredFile(storedFile.storage_path);
    await auditLogService
      .log('chat_attachment', roomId, 'upload_failed', null, { reason: error.message }, senderId, ipAddress, userAgent)
      .catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function markRoomAsRead({ roomId, userId }) {
  const room = await ensureRoomMembership(roomId, userId);
  const participantIds = await getRoomParticipantIds(room.id);
  const result = await createMessageReadRecords(room.id, userId);

  emitToUsers(participantIds, 'chat.message.read', {
    roomId: Number(room.id),
    userId: Number(userId),
    messageIds: result.messageIds,
    lastReadMessageId: result.latestUnreadMessageId,
  });
  await broadcastRoomUpdated(room.id, participantIds);

  return {
    room_id: Number(room.id),
    read_message_ids: result.messageIds,
    last_read_message_id: result.latestUnreadMessageId,
  };
}

export async function getAttachmentDownload(attachmentId, userId, ipAddress, userAgent, db = pool) {
  const res = await db.query(
    `SELECT a.id, a.original_name, a.stored_name, a.mime_type, a.extension, a.size_bytes, a.storage_disk, a.storage_path,
            m.room_id
     FROM chat_attachments a
     JOIN chat_messages m ON m.id = a.message_id
     JOIN chat_room_participants p ON p.room_id = m.room_id
     WHERE a.id = $1
       AND p.user_id = $2
     LIMIT 1`,
    [attachmentId, userId]
  );

  const row = res.rows?.[0];
  if (!row) {
    await auditLogService
      .log('chat_attachment', attachmentId, 'download_denied', null, { user_id: userId }, userId, ipAddress, userAgent)
      .catch(() => {});
    throw new ChatError('Attachment not found or access denied', 404, 'CHAT_ATTACHMENT_NOT_FOUND');
  }

  return {
    id: Number(row.id),
    room_id: Number(row.room_id),
    original_name: row.original_name,
    stored_name: row.stored_name,
    mime_type: row.mime_type,
    extension: row.extension,
    size_bytes: Number(row.size_bytes),
    storage_disk: row.storage_disk,
    storage_path: row.storage_path,
    absolute_path: resolveStoredPath(row.storage_path),
  };
}

export function formatChatError(error) {
  if (error instanceof ChatError || error?.code?.startsWith?.('CHAT_') || error?.code === 'RATE_LIMITED') {
    return {
      status: error.status || 400,
      body: {
        error: error.message || 'Chat request failed',
        code: error.code || 'CHAT_ERROR',
        details: error.details || null,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: error?.message || 'Internal server error',
      code: 'CHAT_INTERNAL_ERROR',
    },
  };
}

export default {
  ensureGlobalRoom,
  backfillGlobalRoomParticipants,
  ensureUserInGlobalRoom,
  listUsersForDirectChats,
  listRoomsForUser,
  getOrCreateDirectRoom,
  listMessagesForRoom,
  sendTextMessage,
  sendAttachmentMessage,
  markRoomAsRead,
  getAttachmentDownload,
  formatChatError,
};
