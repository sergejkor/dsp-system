import React from 'react';
import { useSearchParams } from 'react-router-dom';

import ChatConversation from '../components/chat/ChatConversation';
import ChatRoomList from '../components/chat/ChatRoomList';
import NewDirectChatDialog from '../components/chat/NewDirectChatDialog';
import { useAuth } from '../context/AuthContext';
import * as chatApi from '../services/chatApi';
import { createChatSocket } from '../services/chatSocket';
import '../components/chat/chat.css';

function upsertRoom(list, room) {
  if (!room?.id) return list;
  const next = [...(list || [])];
  const index = next.findIndex((item) => Number(item.id) === Number(room.id));
  if (index >= 0) next[index] = room;
  else next.push(room);
  return next.sort((left, right) => {
    if (left.type === 'global' && right.type !== 'global') return -1;
    if (right.type === 'global' && left.type !== 'global') return 1;
    return new Date(right.last_message_at || 0).getTime() - new Date(left.last_message_at || 0).getTime();
  });
}

function upsertMessage(messages, message) {
  if (!message?.id) return messages;
  if ((messages || []).some((item) => Number(item.id) === Number(message.id))) return messages;
  return [...(messages || []), message].sort((left, right) => Number(left.id) - Number(right.id));
}

export default function ChatPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rooms, setRooms] = React.useState([]);
  const [roomsLoading, setRoomsLoading] = React.useState(true);
  const [messages, setMessages] = React.useState([]);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState(null);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [socketStatus, setSocketStatus] = React.useState('connecting');
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [chatUsers, setChatUsers] = React.useState([]);
  const [chatUsersLoading, setChatUsersLoading] = React.useState(false);

  const activeRoomId = Number(searchParams.get('room')) || null;
  const activeRoom = rooms.find((room) => Number(room.id) === Number(activeRoomId)) || null;
  const messagesViewportRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);
  const markReadInFlightRef = React.useRef(new Set());

  const scrollToBottom = React.useCallback((behavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const loadRooms = React.useCallback(async () => {
    setRoomsLoading(true);
    try {
      const data = await chatApi.listRooms();
      const items = Array.isArray(data?.items) ? data.items : [];
      setRooms(items);
      setError('');

      const selectedExists = items.some((room) => Number(room.id) === Number(activeRoomId));
      if ((!activeRoomId || !selectedExists) && items.length) {
        setSearchParams({ room: String(items[0].id) }, { replace: true });
      }
    } catch (requestError) {
      setError(requestError.message || 'Failed to load chat rooms');
    } finally {
      setRoomsLoading(false);
    }
  }, [activeRoomId, setSearchParams]);

  const markRoomRead = React.useCallback(async (roomId) => {
    const numericRoomId = Number(roomId);
    if (!numericRoomId || markReadInFlightRef.current.has(numericRoomId)) return;
    markReadInFlightRef.current.add(numericRoomId);
    try {
      await chatApi.markRoomRead(numericRoomId);
      setRooms((current) =>
        current.map((room) =>
          Number(room.id) === numericRoomId ? { ...room, unread_count: 0 } : room
        )
      );
    } catch (_error) {
      // ignore temporary read errors
    } finally {
      markReadInFlightRef.current.delete(numericRoomId);
    }
  }, []);

  const loadMessages = React.useCallback(
    async (roomId, { cursor = null, prepend = false } = {}) => {
      const numericRoomId = Number(roomId);
      if (!numericRoomId) return;
      const viewport = messagesViewportRef.current;
      const previousHeight = prepend ? viewport?.scrollHeight || 0 : 0;

      setMessagesLoading(true);
      try {
        const data = await chatApi.listMessages(numericRoomId, { cursor, limit: 30 });
        const items = Array.isArray(data?.items) ? data.items : [];
        setMessages((current) => (prepend ? [...items, ...current] : items));
        setNextCursor(data?.next_cursor || null);
        setError('');

        if (prepend && viewport) {
          window.requestAnimationFrame(() => {
            viewport.scrollTop = viewport.scrollHeight - previousHeight;
          });
        } else {
          window.requestAnimationFrame(() => scrollToBottom());
        }
      } catch (requestError) {
        setError(requestError.message || 'Failed to load messages');
      } finally {
        setMessagesLoading(false);
      }
    },
    [scrollToBottom]
  );

  React.useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  React.useEffect(() => {
    if (!activeRoomId) return;
    loadMessages(activeRoomId, { prepend: false });
  }, [activeRoomId, loadMessages]);

  React.useEffect(() => {
    if (activeRoom?.unread_count > 0) {
      markRoomRead(activeRoom.id);
    }
  }, [activeRoom?.id, activeRoom?.unread_count, markRoomRead]);

  React.useEffect(() => {
    if (!user?.id) return undefined;
    const socket = createChatSocket({
      onStatusChange: setSocketStatus,
      onEvent: ({ event, payload }) => {
        if (event === 'chat.message.created' && payload?.message) {
          if (Number(payload.roomId) === Number(activeRoomId)) {
            setMessages((current) => upsertMessage(current, payload.message));
            window.requestAnimationFrame(() => scrollToBottom('smooth'));
            if (Number(payload.message.sender_id) !== Number(user.id)) {
              markRoomRead(payload.roomId);
            }
          }
        }

        if (event === 'chat.room.updated' && payload?.room) {
          setRooms((current) => upsertRoom(current, payload.room));
        }

        if (event === 'chat.message.read' && Number(payload?.userId) === Number(user.id)) {
          setRooms((current) =>
            current.map((room) =>
              Number(room.id) === Number(payload.roomId) ? { ...room, unread_count: 0 } : room
            )
          );
        }
      },
    });

    return () => socket.close();
  }, [activeRoomId, markRoomRead, scrollToBottom, user?.id]);

  React.useEffect(() => {
    if (socketStatus === 'connected') return undefined;
    const timerId = window.setInterval(() => {
      loadRooms();
      if (activeRoomId) loadMessages(activeRoomId, { prepend: false });
    }, 15000);
    return () => window.clearInterval(timerId);
  }, [activeRoomId, loadMessages, loadRooms, socketStatus]);

  async function handleSend() {
    const trimmed = String(draft || '').trim();
    if (!trimmed || !activeRoom) return;
    setIsSending(true);
    try {
      const message = await chatApi.sendMessage(activeRoom.id, trimmed);
      setDraft('');
      setMessages((current) => upsertMessage(current, message));
      scrollToBottom('smooth');
      const roomsData = await chatApi.listRooms();
      setRooms(Array.isArray(roomsData?.items) ? roomsData.items : []);
    } catch (requestError) {
      setError(requestError.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }

  async function handleAttachFile(file) {
    if (!file || !activeRoom) return;
    setIsUploading(true);
    try {
      const message = await chatApi.uploadAttachment(activeRoom.id, { file, body: draft });
      setDraft('');
      setMessages((current) => upsertMessage(current, message));
      scrollToBottom('smooth');
      const roomsData = await chatApi.listRooms();
      setRooms(Array.isArray(roomsData?.items) ? roomsData.items : []);
    } catch (requestError) {
      setError(requestError.message || 'Failed to upload attachment');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleOpenNewDirectChat() {
    setIsDialogOpen(true);
    if (chatUsers.length || chatUsersLoading) return;
    setChatUsersLoading(true);
    try {
      const data = await chatApi.listChatUsers();
      setChatUsers(Array.isArray(data?.items) ? data.items : []);
    } catch (requestError) {
      setError(requestError.message || 'Failed to load users');
    } finally {
      setChatUsersLoading(false);
    }
  }

  async function handleSelectDirectUser(targetUser) {
    try {
      const room = await chatApi.getOrCreateDirectRoom(targetUser.id);
      setRooms((current) => upsertRoom(current, room));
      setSearchParams({ room: String(room.id) });
      setIsDialogOpen(false);
    } catch (requestError) {
      setError(requestError.message || 'Failed to open direct chat');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Internal Chat</h1>
          <div className="page-subtitle">Realtime team communication inside the current workspace.</div>
        </div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="chat-page">
        <div className="chat-surface">
          <ChatRoomList
            rooms={rooms}
            activeRoomId={activeRoomId}
            onSelectRoom={(roomId) => setSearchParams({ room: String(roomId) })}
            onOpenNewDirectChat={handleOpenNewDirectChat}
          />
        </div>

        <div className="chat-surface">
          {roomsLoading && !rooms.length ? (
            <div className="chat-message-empty">Loading chat rooms…</div>
          ) : (
            <ChatConversation
              currentUserId={user?.id}
              room={activeRoom}
              messages={messages}
              loading={messagesLoading}
              hasMore={Boolean(nextCursor)}
              onLoadMore={() => loadMessages(activeRoomId, { cursor: nextCursor, prepend: true })}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
              onAttachFile={handleAttachFile}
              isSending={isSending || socketStatus === 'reconnecting'}
              isUploading={isUploading}
              onDownloadAttachment={chatApi.downloadAttachment}
              messagesViewportRef={messagesViewportRef}
              messagesEndRef={messagesEndRef}
            />
          )}
        </div>
      </div>

      <NewDirectChatDialog
        open={isDialogOpen}
        users={chatUsers}
        loading={chatUsersLoading}
        onClose={() => setIsDialogOpen(false)}
        onSelectUser={handleSelectDirectUser}
      />
    </>
  );
}
