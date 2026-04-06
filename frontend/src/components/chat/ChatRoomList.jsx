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

function formatRoomTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatPreview(room) {
  const message = room?.last_message;
  if (!message) {
    return room?.type === 'global' ? 'Общая комната для всех сотрудников' : 'Сообщений пока нет';
  }
  if (message.message_type === 'file' && !message.body) {
    return 'Вложение';
  }
  if (message.message_type === 'mixed') {
    return `${message.body || 'Сообщение'} · вложение`;
  }
  return message.body || 'Системное сообщение';
}

export default function ChatRoomList({
  rooms,
  selectedRoomId,
  loading = false,
  error = '',
  onSelectRoom,
  onStartDirectChat,
}) {
  return (
    <div className="card chat-card chat-sidebar">
      <div className="chat-room-toolbar">
        <div>
          <h2>Chats</h2>
          <p>General и личные переписки сотрудников.</p>
        </div>
        <button type="button" className="btn-primary" onClick={onStartDirectChat}>
          New chat
        </button>
      </div>

      {loading ? <div className="chat-loading">Загружаю комнаты…</div> : null}
      {error ? <div className="chat-error">{error}</div> : null}

      {!loading && !error ? (
        <div className="chat-room-list">
          {rooms.length === 0 ? (
            <div className="chat-empty-state">Комнаты пока не появились. После синхронизации будет доступна хотя бы General.</div>
          ) : (
            rooms.map((room) => {
              const active = Number(selectedRoomId) === Number(room.id);
              const avatarLabel = room.type === 'global' ? 'GE' : buildInitials(room.name);
              const avatarUrl = room.type === 'direct'
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
                      <span className="chat-room-meta">{formatRoomTime(room.last_message_at)}</span>
                    </span>
                    <span className="chat-room-preview">{formatPreview(room)}</span>
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
