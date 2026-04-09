import React from 'react';

function buildInitials(label) {
  const words = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return 'CH';
}

function formatRoomTime(value, language) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatPreview(room, copy) {
  const message = room?.last_message;
  if (!message) {
    return room?.type === 'global' ? copy.generalHint : copy.noMessagesYet;
  }
  if (message.message_type === 'file' && !message.body) {
    return copy.attachmentLabel;
  }
  if (message.message_type === 'mixed') {
    return `${message.body || copy.noMessagesYet} · ${copy.attachmentLabel}`;
  }
  return message.body || copy.noMessagesYet;
}

export default function ChatRoomList({
  rooms,
  selectedRoomId,
  loading = false,
  error = '',
  copy,
  language = 'en',
  onSelectRoom,
  onStartDirectChat,
}) {
  return (
    <div className="card chat-card chat-sidebar">
      <div className="chat-room-toolbar">
        <div>
          <h2>{copy.roomsTitle}</h2>
          <p>{copy.roomsSubtitle}</p>
        </div>
        <button type="button" className="btn-primary" onClick={onStartDirectChat}>
          {copy.newChat}
        </button>
      </div>

      {loading ? <div className="chat-loading">{copy.roomsLoading}</div> : null}
      {error ? <div className="chat-error">{error}</div> : null}

      {!loading && !error ? (
        <div className="chat-room-list">
          {rooms.length === 0 ? (
            <div className="chat-empty-state">{copy.roomsEmpty}</div>
          ) : (
            rooms.map((room) => {
              const active = Number(selectedRoomId) === Number(room.id);
              const avatarLabel = room.type === 'global' ? 'GE' : buildInitials(room.name);
              const avatarUrl =
                room.type === 'direct'
                  ? room.participants?.find((participant) => participant.id !== room.current_user_id)?.avatar_url ||
                    room.participants?.[0]?.avatar_url ||
                    ''
                  : '';

              return (
                <button
                  key={room.id}
                  type="button"
                  className={`chat-room-item ${active ? 'is-active' : ''}`}
                  onClick={() => onSelectRoom?.(room)}
                >
                  <span className="chat-room-avatar" aria-hidden="true">
                    {avatarUrl ? <img src={avatarUrl} alt={room.name} /> : avatarLabel}
                  </span>

                  <span className="chat-room-content">
                    <span className="chat-room-topline">
                      <span className="chat-room-name">{room.name}</span>
                      <span className="chat-room-meta">{formatRoomTime(room.last_message_at, language)}</span>
                    </span>
                    <span className="chat-room-preview">{formatPreview(room, copy)}</span>
                  </span>

                  {room.unread_count > 0 ? (
                    <span className="chat-room-badge">{room.unread_count > 99 ? '99+' : room.unread_count}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
