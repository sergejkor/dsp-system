import React from 'react';

import ChatConversation from '../components/chat/ChatConversation.jsx';
import { getChatCopy } from '../components/chat/chatCopy.js';
import NewDirectChatDialog from '../components/chat/NewDirectChatDialog.jsx';
import ChatRoomList from '../components/chat/ChatRoomList.jsx';
import { useAppSettings } from '../context/AppSettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  downloadAttachment,
  getOrCreateDirectRoom,
  listChatUsers,
  listMessages,
  listRooms,
  markRoomRead,
  sendMessage,
  uploadAttachment,
} from '../services/chatApi.js';
import { getUsers } from '../services/settingsApi.js';
import { createChatSocket } from '../services/chatSocket.js';
import '../components/chat/chat.css';

function sortRooms(items) {
  return [...items].sort((left, right) => {
    if (left.type === 'global' && right.type !== 'global') return -1;
    if (right.type === 'global' && left.type !== 'global') return 1;
    return new Date(right.last_message_at || 0).getTime() - new Date(left.last_message_at || 0).getTime();
  });
}

function normalizeRoomItems(items, currentUserId, activeRoomId = null) {
  const normalizedActiveRoomId = Number(activeRoomId) || 0;
  return sortRooms(
    (items || []).map((room) => {
      const normalizedRoom = { ...room, current_user_id: currentUserId };
      if (normalizedActiveRoomId && Number(normalizedRoom.id) === normalizedActiveRoomId) {
        normalizedRoom.unread_count = 0;
      }
      return normalizedRoom;
    })
  );
}

function mergeRooms(prevRooms, nextRoom, currentUserId, activeRoomId = null) {
  const enrichedRoom = nextRoom ? { ...nextRoom, current_user_id: currentUserId } : null;
  const next = [...prevRooms];
  const index = next.findIndex((room) => Number(room.id) === Number(enrichedRoom?.id));
  const normalizedActiveRoomId = Number(activeRoomId) || 0;
  const normalizedIncomingRoomId = Number(enrichedRoom?.id) || 0;
  if (enrichedRoom) {
    if (normalizedActiveRoomId && normalizedIncomingRoomId === normalizedActiveRoomId) {
      // Active room is considered read locally; avoid stale unread overwrite from out-of-order ws packets.
      enrichedRoom.unread_count = 0;
    }
    if (index >= 0) next[index] = { ...next[index], ...enrichedRoom };
    else next.push(enrichedRoom);
  }
  return sortRooms(next);
}

function markRoomAsReadInList(prevRooms, roomId) {
  const numericRoomId = Number(roomId);
  if (!numericRoomId) return prevRooms;
  return prevRooms.map((room) =>
    Number(room.id) === numericRoomId ? { ...room, unread_count: 0 } : room
  );
}

function mergeMessageList(prevMessages, incomingMessage) {
  const exists = prevMessages.some((message) => Number(message.id) === Number(incomingMessage.id));
  if (exists) {
    return prevMessages.map((message) =>
      Number(message.id) === Number(incomingMessage.id) ? incomingMessage : message
    );
  }
  return [...prevMessages, incomingMessage].sort((left, right) => Number(left.id) - Number(right.id));
}

function mapPortalUser(rawUser) {
  const firstName = rawUser?.first_name || rawUser?.firstName || '';
  const lastName = rawUser?.last_name || rawUser?.lastName || '';
  const fullName =
    rawUser?.name ||
    rawUser?.full_name ||
    rawUser?.display_name ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    rawUser?.email ||
    'User';

  return {
    id: rawUser?.id,
    name: fullName,
    email: rawUser?.email || '',
    avatar_url: rawUser?.avatar_url || rawUser?.avatarUrl || rawUser?.photo_url || '',
  };
}

function normalizeUiError(error, fallbackMessage) {
  const message = String(error?.message || '').trim();
  if (!message) return fallbackMessage;
  if (message === 'Unauthorized') {
    return 'Your session has expired. Please sign in again.';
  }
  return message;
}

export default function ChatPage() {
  const { user } = useAuth();
  const { language } = useAppSettings();
  const copy = React.useMemo(() => getChatCopy(language), [language]);
  const currentUserId = Number(user?.id || 0);

  const [rooms, setRooms] = React.useState([]);
  const [roomsLoading, setRoomsLoading] = React.useState(true);
  const [roomsError, setRoomsError] = React.useState('');
  const [selectedRoomId, setSelectedRoomId] = React.useState(null);
  const [messagesByRoom, setMessagesByRoom] = React.useState({});
  const [socketState, setSocketState] = React.useState('connecting');
  const [isDirectDialogOpen, setIsDirectDialogOpen] = React.useState(false);
  const [chatUsers, setChatUsers] = React.useState([]);
  const [chatUsersLoading, setChatUsersLoading] = React.useState(false);
  const [chatUsersError, setChatUsersError] = React.useState('');
  const [creatingDirect, setCreatingDirect] = React.useState(false);
  const [sendError, setSendError] = React.useState('');

  const unreadTotal = React.useMemo(
    () => (rooms || []).reduce((sum, room) => sum + Math.max(0, Number(room?.unread_count) || 0), 0),
    [rooms]
  );

  const markRoomAsReadOptimistic = React.useCallback((roomId) => {
    setRooms((prev) => markRoomAsReadInList(prev, roomId));
  }, []);

  React.useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('chat-unread-total-changed', {
        detail: { total: unreadTotal, activeRoomId: selectedRoomId },
      })
    );
  }, [unreadTotal, selectedRoomId]);

  const buildRoomsError = React.useCallback(
    (error) => {
      if (error?.status === 401) {
        return 'Your session has expired. Please sign in again.';
      }
      return copy.roomUnavailable;
    },
    [copy.roomUnavailable]
  );

  const selectedRoom = React.useMemo(
    () => rooms.find((room) => Number(room.id) === Number(selectedRoomId)) || null,
    [rooms, selectedRoomId]
  );

  const selectedRoomMessagesState = selectedRoomId
    ? messagesByRoom[selectedRoomId] || { items: [], nextCursor: null, loading: false, loadingMore: false, loaded: false }
    : { items: [], nextCursor: null, loading: false, loadingMore: false, loaded: false };

  const loadRooms = React.useCallback(async () => {
    setRoomsLoading(true);
    setRoomsError('');
    try {
      const response = await listRooms();
      const items = normalizeRoomItems(response.items || [], currentUserId, selectedRoomId);
      setRooms(items);
      setSelectedRoomId((prev) => prev || items[0]?.id || null);
    } catch (error) {
      setRoomsError(normalizeUiError(error, buildRoomsError(error)));
    } finally {
      setRoomsLoading(false);
    }
  }, [buildRoomsError, currentUserId, selectedRoomId]);

  const refreshRoomsQuietly = React.useCallback(async () => {
    try {
      const response = await listRooms();
      const items = normalizeRoomItems(response.items || [], currentUserId, selectedRoomId);
      setRooms(items);
      setSelectedRoomId((prev) => prev || items[0]?.id || null);
    } catch (_error) {
      // Ignore background refresh failures and keep the last known snapshot.
    }
  }, [currentUserId, selectedRoomId]);

  const loadRoomMessages = React.useCallback(
    async (roomId, { cursor = null, appendOlder = false } = {}) => {
      if (!roomId) return;

      setMessagesByRoom((prev) => ({
        ...prev,
        [roomId]: {
          ...(prev[roomId] || { items: [], nextCursor: null, loaded: false }),
          loading: !appendOlder,
          loadingMore: appendOlder,
          error: '',
        },
      }));

      try {
        const response = await listMessages(roomId, { cursor, limit: 30 });
        setMessagesByRoom((prev) => {
          const existing = prev[roomId] || { items: [], nextCursor: null };
          const items = appendOlder
            ? [...(response.items || []), ...existing.items].sort((left, right) => Number(left.id) - Number(right.id))
            : response.items || [];

          return {
            ...prev,
            [roomId]: {
              items,
              nextCursor: response.next_cursor,
              loading: false,
              loadingMore: false,
              loaded: true,
              error: '',
            },
          };
        });
        await markRoomRead(roomId);
        markRoomAsReadOptimistic(roomId);
      } catch (error) {
        setMessagesByRoom((prev) => ({
          ...prev,
          [roomId]: {
            ...(prev[roomId] || { items: [], nextCursor: null, loaded: false }),
            loading: false,
            loadingMore: false,
            loaded: true,
            error: normalizeUiError(error, copy.messagesUnavailable),
          },
        }));
      }
    },
    [copy.messagesUnavailable, markRoomAsReadOptimistic]
  );

  const loadChatUsers = React.useCallback(async () => {
    setChatUsersLoading(true);
    setChatUsersError('');

    try {
      let items = [];

      try {
        const response = await listChatUsers();
        items = response.items || [];
      } catch (_chatUsersError) {
        items = [];
      }

      if (!items.length) {
        const response = await getUsers({ limit: 500 });
        const rawUsers = Array.isArray(response) ? response : response.items || response.users || [];
        items = rawUsers.map(mapPortalUser);
      }

      const uniqueUsers = [];
      const seen = new Set();
      items.forEach((candidate) => {
        const mapped = mapPortalUser(candidate);
        const id = Number(mapped.id || 0);
        if (!id || id === currentUserId || seen.has(id)) return;
        seen.add(id);
        uniqueUsers.push(mapped);
      });

      setChatUsers(uniqueUsers);
    } catch (error) {
      setChatUsersError(normalizeUiError(error, copy.usersUnavailable));
    } finally {
      setChatUsersLoading(false);
    }
  }, [copy.usersUnavailable, currentUserId]);

  const refreshSelectedRoomMessagesQuietly = React.useCallback(
    async (roomIdValue = selectedRoomId) => {
      const roomId = Number(roomIdValue);
      if (!roomId) return;

      try {
        const response = await listMessages(roomId, { limit: 30 });
        setMessagesByRoom((prev) => {
          const existing = prev[roomId] || { items: [], nextCursor: null, loaded: true };
          const incomingItems = Array.isArray(response.items) ? response.items : [];
          const mergedItems = incomingItems.reduce(
            (items, message) => mergeMessageList(items, message),
            existing.items || []
          );

          return {
            ...prev,
            [roomId]: {
              ...existing,
              items: mergedItems,
              nextCursor: existing.nextCursor ?? response.next_cursor,
              loading: false,
              loadingMore: false,
              loaded: true,
              error: '',
            },
          };
        });

        await markRoomRead(roomId);
        markRoomAsReadOptimistic(roomId);
      } catch (_error) {
        // Keep the current message snapshot if the silent refresh fails.
      }
    },
    [selectedRoomId, markRoomAsReadOptimistic]
  );

  React.useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  React.useEffect(() => {
    const roomsTimerId = window.setInterval(() => {
      refreshRoomsQuietly();
    }, 5000);

    const messagesTimerId = selectedRoomId
      ? window.setInterval(() => {
          refreshSelectedRoomMessagesQuietly(selectedRoomId);
        }, 2500)
      : null;

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      refreshRoomsQuietly();
      if (selectedRoomId) refreshSelectedRoomMessagesQuietly(selectedRoomId);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(roomsTimerId);
      if (messagesTimerId) window.clearInterval(messagesTimerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshRoomsQuietly, refreshSelectedRoomMessagesQuietly, selectedRoomId]);

  React.useEffect(() => {
    if (!selectedRoomId) return;
    markRoomAsReadOptimistic(selectedRoomId);
  }, [selectedRoomId, markRoomAsReadOptimistic]);

  React.useEffect(() => {
    if (!selectedRoomId) return;
    const roomState = messagesByRoom[selectedRoomId];
    if (roomState?.loading || roomState?.loadingMore) return;
    if (roomState?.loaded) {
      markRoomRead(selectedRoomId)
        .then(() => markRoomAsReadOptimistic(selectedRoomId))
        .catch(() => {});
      return;
    }
    loadRoomMessages(selectedRoomId);
  }, [selectedRoomId, messagesByRoom, loadRoomMessages, markRoomAsReadOptimistic]);

  React.useEffect(() => {
    const socket = createChatSocket({
      onStatusChange: setSocketState,
      onEvent: (packet) => {
        if (packet.event === 'chat.message.created' && packet.payload?.message) {
          const roomId = Number(packet.payload.roomId);
          const senderId = Number(packet.payload?.message?.sender_id || packet.payload?.message?.sender?.id || 0);
          setMessagesByRoom((prev) => {
            const existing = prev[roomId] || { items: [], nextCursor: null, loading: false, loadingMore: false, loaded: true };
            return {
              ...prev,
              [roomId]: {
                ...existing,
                loaded: true,
                items: mergeMessageList(existing.items || [], packet.payload.message),
              },
            };
          });
          setRooms((prev) => {
            const next = (prev || []).map((room) => {
              if (Number(room.id) !== roomId) return room;
              if (roomId === Number(selectedRoomId)) {
                return { ...room, unread_count: 0, last_message_at: packet.payload?.message?.created_at || room.last_message_at };
              }
              if (senderId && senderId === Number(currentUserId)) {
                return { ...room, last_message_at: packet.payload?.message?.created_at || room.last_message_at };
              }
              return {
                ...room,
                unread_count: (Number(room.unread_count) || 0) + 1,
                last_message_at: packet.payload?.message?.created_at || room.last_message_at,
              };
            });
            return sortRooms(next);
          });
          if (roomId === Number(selectedRoomId)) {
            markRoomRead(roomId)
              .then(() => markRoomAsReadOptimistic(roomId))
              .catch(() => {});
          }
        }

        if (packet.event === 'chat.room.updated' && packet.payload?.room) {
          setRooms((prev) => mergeRooms(prev, packet.payload.room, currentUserId, selectedRoomId));
        }

        if (packet.event === 'chat.message.read' && Number(packet.payload?.userId) === Number(currentUserId)) {
          const roomId = Number(packet.payload?.roomId);
          if (roomId) markRoomAsReadOptimistic(roomId);
        }

        if (packet.event === 'chat.message.read' && Number(packet.payload?.userId) !== Number(currentUserId)) {
          const roomId = Number(packet.payload?.roomId);
          const lastReadMessageId = Number(packet.payload?.lastReadMessageId || 0);
          if (roomId && lastReadMessageId) {
            setRooms((prev) =>
              (prev || []).map((room) =>
                Number(room.id) === roomId
                  ? {
                      ...room,
                      last_read_message_id_by_others: Math.max(
                        Number(room.last_read_message_id_by_others || 0),
                        lastReadMessageId
                      ),
                    }
                  : room
              )
            );
          }
        }
      },
    });

    return () => socket.close();
  }, [currentUserId, selectedRoomId, markRoomAsReadOptimistic]);

  async function handleSendMessage({ body, file }) {
    if (!selectedRoomId) return;
    setSendError('');

    setMessagesByRoom((prev) => ({
      ...prev,
      [selectedRoomId]: {
        ...(prev[selectedRoomId] || { items: [], nextCursor: null, loaded: true }),
        sending: true,
      },
    }));

    try {
      const createdMessage = file
        ? await uploadAttachment(selectedRoomId, { file, body })
        : await sendMessage(selectedRoomId, body);

      setMessagesByRoom((prev) => {
        const existing = prev[selectedRoomId] || { items: [], nextCursor: null, loaded: true };
        return {
          ...prev,
          [selectedRoomId]: {
            ...existing,
            sending: false,
            loaded: true,
            error: '',
            items: mergeMessageList(existing.items || [], createdMessage),
          },
        };
      });

      await markRoomRead(selectedRoomId);
      markRoomAsReadOptimistic(selectedRoomId);
      await loadRooms();
    } catch (error) {
      setSendError(normalizeUiError(error, copy.sendUnavailable));
      setMessagesByRoom((prev) => ({
        ...prev,
        [selectedRoomId]: {
          ...(prev[selectedRoomId] || { items: [], nextCursor: null, loaded: true }),
          sending: false,
        },
      }));
    }
  }

  async function handleOpenDirectDialog() {
    setIsDirectDialogOpen(true);
    if (!chatUsers.length) {
      await loadChatUsers();
    }
  }

  async function handleSelectDirectUser(targetUser) {
    setCreatingDirect(true);
    setChatUsersError('');
    try {
      const room = await getOrCreateDirectRoom(targetUser.id);
      if (!room?.id) {
        throw new Error('Direct chat room could not be created.');
      }
      setRooms((prev) => mergeRooms(prev, room, currentUserId));
      setSelectedRoomId(room.id);
      setIsDirectDialogOpen(false);
      await loadRoomMessages(room.id);
    } catch (error) {
      setChatUsersError(normalizeUiError(error, copy.usersUnavailable));
    } finally {
      setCreatingDirect(false);
    }
  }

  const handleSelectRoom = React.useCallback(
    (roomId) => {
      setSelectedRoomId(roomId);
      markRoomAsReadOptimistic(roomId);
    },
    [markRoomAsReadOptimistic]
  );

  return (
    <section className="chat-page">
      <header className="chat-page-header">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <span className="chat-page-status" data-state={socketState}>
          {socketState === 'connected'
            ? copy.statusConnected
            : socketState === 'reconnecting'
              ? copy.statusReconnecting
              : socketState === 'error'
                ? copy.statusError
                : copy.statusConnecting}
        </span>
      </header>

      <div className="chat-layout">
        <ChatRoomList
          rooms={rooms}
          currentUserId={currentUserId}
          selectedRoomId={selectedRoomId}
          loading={roomsLoading}
          error={roomsError}
          onSelectRoom={handleSelectRoom}
          onStartDirectChat={handleOpenDirectDialog}
          copy={copy}
        />

        <ChatConversation
          room={selectedRoom}
          currentUserId={currentUserId}
          messages={selectedRoomMessagesState.items || []}
          loading={selectedRoomMessagesState.loading}
          loadingMore={selectedRoomMessagesState.loadingMore}
          hasMore={Boolean(selectedRoomMessagesState.nextCursor)}
          onLoadMore={() =>
            loadRoomMessages(selectedRoomId, {
              cursor: selectedRoomMessagesState.nextCursor,
              appendOlder: true,
            })
          }
          onSendMessage={handleSendMessage}
          sending={selectedRoomMessagesState.sending}
          sendError={sendError || selectedRoomMessagesState.error}
          onDownloadAttachment={downloadAttachment}
          copy={copy}
        />
      </div>

      <NewDirectChatDialog
        open={isDirectDialogOpen}
        users={chatUsers}
        loading={chatUsersLoading}
        error={chatUsersError}
        creating={creatingDirect}
        onClose={() => setIsDirectDialogOpen(false)}
        onSelectUser={handleSelectDirectUser}
        copy={copy}
      />
    </section>
  );
}
