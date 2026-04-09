import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppSettings } from '../context/AppSettingsContext.jsx';
import ChatRoomList from '../components/chat/ChatRoomList.jsx';
import ChatConversation from '../components/chat/ChatConversation.jsx';
import NewDirectChatDialog from '../components/chat/NewDirectChatDialog.jsx';
import { getChatCopy } from '../components/chat/chatCopy.js';
import {
  getOrCreateDirectRoom,
  listChatUsers,
  listMessages,
  listRooms,
  markRoomRead,
  sendMessage,
  uploadAttachment,
} from '../services/chatApi.js';
import { createChatSocket } from '../services/chatSocket.js';
import { getUsers } from '../services/settingsApi.js';
import '../components/chat/chat.css';

function sortRooms(items) {
  return [...items].sort((left, right) => {
    if (left.type === 'global' && right.type !== 'global') return -1;
    if (right.type === 'global' && left.type !== 'global') return 1;
    return new Date(right.last_message_at || 0).getTime() - new Date(left.last_message_at || 0).getTime();
  });
}

function mergeRooms(prevRooms, nextRoom, currentUserId) {
  const enrichedRoom = nextRoom ? { ...nextRoom, current_user_id: currentUserId } : null;
  const next = [...prevRooms];
  const index = next.findIndex((room) => Number(room.id) === Number(enrichedRoom?.id));
  if (enrichedRoom) {
    if (index >= 0) next[index] = { ...next[index], ...enrichedRoom };
    else next.push(enrichedRoom);
  }
  return sortRooms(next);
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

function mapUsersForChat(items, currentUserId) {
  return (items || [])
    .filter((candidate) => Number(candidate.id) !== Number(currentUserId))
    .map((candidate) => ({
      id: candidate.id,
      name:
        candidate.name ||
        candidate.full_name ||
        [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() ||
        candidate.email,
      email: candidate.email || null,
      avatar_url: candidate.avatar_url || null,
    }));
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
      const items = (response.items || []).map((room) => ({ ...room, current_user_id: currentUserId }));
      setRooms(sortRooms(items));
      setSelectedRoomId((prev) => prev || items[0]?.id || null);
    } catch (_error) {
      setRoomsError(copy.roomUnavailable);
    } finally {
      setRoomsLoading(false);
    }
  }, [copy.roomUnavailable, currentUserId]);

  const loadRoomMessages = React.useCallback(async (roomId, { cursor = null, appendOlder = false } = {}) => {
    if (!roomId) return;
    setMessagesByRoom((prev) => ({
      ...prev,
      [roomId]: {
        ...(prev[roomId] || { items: [], nextCursor: null, loaded: false }),
        loading: !appendOlder,
        loadingMore: appendOlder,
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
          },
        };
      });
      await markRoomRead(roomId);
    } catch (_error) {
      setMessagesByRoom((prev) => ({
        ...prev,
        [roomId]: {
          ...(prev[roomId] || { items: [], nextCursor: null, loaded: false }),
          loading: false,
          loadingMore: false,
          loaded: true,
          error: copy.messagesUnavailable,
        },
      }));
    }
  }, [copy.messagesUnavailable]);

  const loadChatUsers = React.useCallback(async () => {
    setChatUsersLoading(true);
    setChatUsersError('');
    try {
      const response = await listChatUsers();
      const primaryUsers = mapUsersForChat(response.items || [], currentUserId);
      if (primaryUsers.length > 0) {
        setChatUsers(primaryUsers);
        return;
      }

      const fallback = await getUsers({ limit: 500 });
      const fallbackUsers = mapUsersForChat(fallback.items || [], currentUserId);
      setChatUsers(fallbackUsers);
      if (!fallbackUsers.length) {
        setChatUsersError(copy.usersUnavailable);
      }
    } catch (_error) {
      try {
        const fallback = await getUsers({ limit: 500 });
        const fallbackUsers = mapUsersForChat(fallback.items || [], currentUserId);
        setChatUsers(fallbackUsers);
        setChatUsersError(fallbackUsers.length ? '' : copy.usersUnavailable);
      } catch (_fallbackError) {
        setChatUsersError(copy.usersUnavailable);
      }
    } finally {
      setChatUsersLoading(false);
    }
  }, [copy.usersUnavailable, currentUserId]);

  React.useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  React.useEffect(() => {
    if (!selectedRoomId) return;
    const roomState = messagesByRoom[selectedRoomId];
    if (roomState?.loading || roomState?.loadingMore) return;
    if (roomState?.loaded) {
      markRoomRead(selectedRoomId).catch(() => {});
      return;
    }
    loadRoomMessages(selectedRoomId);
  }, [selectedRoomId, messagesByRoom, loadRoomMessages]);

  React.useEffect(() => {
    const socket = createChatSocket({
      onStatusChange: setSocketState,
      onEvent: (packet) => {
        if (packet.event === 'chat.message.created' && packet.payload?.message) {
          const roomId = Number(packet.payload.roomId);
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
          if (roomId === Number(selectedRoomId)) {
            markRoomRead(roomId).catch(() => {});
          }
        }

        if (packet.event === 'chat.room.updated' && packet.payload?.room) {
          setRooms((prev) => mergeRooms(prev, packet.payload.room, currentUserId));
        }
      },
    });

    return () => socket.close();
  }, [currentUserId, selectedRoomId]);

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
            items: mergeMessageList(existing.items || [], createdMessage),
          },
        };
      });
      await markRoomRead(selectedRoomId);
      await loadRooms();
    } catch (_error) {
      setSendError(copy.sendUnavailable);
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
    await loadChatUsers();
  }

  async function handleSelectDirectUser(targetUser) {
    setCreatingDirect(true);
    setChatUsersError('');
    try {
      const room = await getOrCreateDirectRoom(targetUser.id);
      setRooms((prev) => mergeRooms(prev, room, currentUserId));
      setSelectedRoomId(room.id);
      setIsDirectDialogOpen(false);
      await loadRoomMessages(room.id);
    } catch (_error) {
      setChatUsersError(copy.usersUnavailable);
    } finally {
      setCreatingDirect(false);
    }
  }

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
          selectedRoomId={selectedRoomId}
          loading={roomsLoading}
          error={roomsError}
          copy={copy}
          language={language}
          onSelectRoom={(room) => setSelectedRoomId(room.id)}
          onStartDirectChat={handleOpenDirectDialog}
        />

        <ChatConversation
          room={selectedRoom}
          currentUserId={currentUserId}
          messages={selectedRoomMessagesState.items || []}
          loading={selectedRoomMessagesState.loading}
          loadingMore={selectedRoomMessagesState.loadingMore}
          hasMore={Boolean(selectedRoomMessagesState.nextCursor)}
          language={language}
          copy={copy}
          onLoadMore={() =>
            loadRoomMessages(selectedRoomId, {
              cursor: selectedRoomMessagesState.nextCursor,
              appendOlder: true,
            })
          }
          onSendMessage={handleSendMessage}
          sending={selectedRoomMessagesState.sending}
          sendError={sendError || selectedRoomMessagesState.error}
        />
      </div>

      <NewDirectChatDialog
        open={isDirectDialogOpen}
        users={chatUsers}
        loading={chatUsersLoading}
        error={chatUsersError}
        creating={creatingDirect}
        copy={copy}
        onClose={() => setIsDirectDialogOpen(false)}
        onSelectUser={handleSelectDirectUser}
      />
    </section>
  );
}
