import React from 'react';
import { getChatCopy } from './chatCopy.js';
import { resolvePortalLocale } from '../../utils/portalLocale.js';

function GeneralIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-room-list-icon">
      <path
        d="M12 3.25c4.83 0 8.75 3.58 8.75 8 0 4.42-3.92 8-8.75 8-.77 0-1.52-.09-2.23-.25l-3.52 1.56a.75.75 0 0 1-1.03-.85l.74-3.08A7.63 7.63 0 0 1 3.25 11.25c0-4.42 3.92-8 8.75-8Zm-4 7.25a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DirectIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-room-list-icon">
      <path
        d="M9 6.25a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Zm6.5 1a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5ZM3.75 18a4.75 4.75 0 0 1 9.5 0 .75.75 0 0 1-1.5 0 3.25 3.25 0 1 0-6.5 0 .75.75 0 0 1-1.5 0Zm11.5-.25a3.75 3.75 0 0 1 5 0 .75.75 0 1 1-1.06 1.06 2.25 2.25 0 0 0-2.88-.28.75.75 0 1 1-1.06-.78Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-room-list-plus-icon">
      <path d="M12 5.25a.75.75 0 0 1 .75.75v5.25H18a.75.75 0 0 1 0 1.5h-5.25V18a.75.75 0 0 1-1.5 0v-5.25H6a.75.75 0 0 1 0-1.5h5.25V6a.75.75 0 0 1 .75-.75Z" fill="currentColor" />
    </svg>
  );
}

function formatPreview(message, copy) {
  if (!message) return copy.noMessagesYet;
  if (message.message_type === 'file' && !message.body) return message.attachments?.[0]?.original_name || copy.attachmentLabel;
  if (message.message_type === 'mixed' && message.attachments?.length) {
    return `${message.body || 'Message'} · ${message.attachments[0].original_name}`;
  }
  return message.body || 'System message';
}

function formatRoomTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(resolvePortalLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function buildInitials(label) {
  const parts = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  return String(label || 'U').slice(0, 2).toUpperCase();
}

function getDirectPeer(room, currentUserId) {
  if (!room || room.type !== 'direct') return null;
  const participants = Array.isArray(room.participants) ? room.participants : [];
  return (
    participants.find((participant) => Number(participant.id) !== Number(currentUserId)) ||
    participants[0] ||
    null
  );
}

export default function ChatRoomList({
  rooms,
  currentUserId,
  selectedRoomId,
  loading,
  error,
  onSelectRoom,
  onStartDirectChat,
  copy = getChatCopy('en'),
}) {
  return (
    <aside className="chat-room-list chat-surface">
      <div className="chat-room-list-head">
        <div>
          <h2>{copy.roomsTitle}</h2>
          <p>{copy.roomsSubtitle}</p>
        </div>
        <button type="button" className="chat-room-list-action btn-primary" onClick={onStartDirectChat}>
          <PlusIcon />
          <span>{copy.newChat}</span>
        </button>
      </div>

      <div className="chat-room-list-scroll">
        {loading ? <div className="chat-room-list-empty">{copy.roomsLoading}</div> : null}
        {!loading && error ? <div className="chat-room-list-empty chat-room-list-empty--error">{error}</div> : null}

        {!loading && !error
          ? rooms.map((room) => {
              const isActive = Number(selectedRoomId) === Number(room.id);
              const isGeneral = room.type === 'global';
              const directPeer = getDirectPeer(room, currentUserId);
              const avatarUrl = directPeer?.avatar_url || '';
              const avatarLabel = directPeer?.name || room.name || 'Chat';

              return (
                <button
                  key={room.id}
                  type="button"
                  className={`chat-room-list-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => onSelectRoom(room.id)}
                >
                  <span className="chat-room-list-avatar" aria-hidden="true">
                    {!isGeneral && avatarUrl ? (
                      <img src={avatarUrl} alt={avatarLabel} className="chat-room-list-avatar-image" />
                    ) : isGeneral ? (
                      <GeneralIcon />
                    ) : (
                      <span className="chat-room-list-avatar-fallback">{buildInitials(avatarLabel)}</span>
                    )}
                  </span>
                  <span className="chat-room-list-body">
                    <span className="chat-room-list-row">
                      <span className="chat-room-list-title">{room.name}</span>
                      <span className="chat-room-list-time">{formatRoomTime(room.last_message_at)}</span>
                    </span>
                    <span className="chat-room-list-row">
                      <span className="chat-room-list-preview">{formatPreview(room.last_message, copy)}</span>
                      {room.unread_count > 0 ? (
                        <span className="chat-room-list-badge">
                          {room.unread_count > 99 ? '99+' : room.unread_count}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })
          : null}

        {!loading && !rooms.length && !error ? <div className="chat-room-list-empty">{copy.roomsEmpty}</div> : null}
      </div>
    </aside>
  );
}
