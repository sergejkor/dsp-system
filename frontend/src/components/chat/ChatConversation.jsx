import React from 'react';
import { downloadAttachment } from '../../services/chatApi.js';

function buildInitials(label) {
  const words = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return 'US';
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatConversation({
  room,
  currentUserId,
  messages,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onSendMessage,
  sending = false,
  sendError = '',
}) {
  const [body, setBody] = React.useState('');
  const [file, setFile] = React.useState(null);
  const endRef = React.useRef(null);

  React.useEffect(() => {
    setBody('');
    setFile(null);
  }, [room?.id]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [room?.id, messages.length]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!body.trim() && !file) return;
    await onSendMessage?.({ body, file });
    setBody('');
    setFile(null);
  }

  if (!room) {
    return (
      <div className="card chat-card chat-panel">
        <div className="chat-empty-state">Выберите General или личный чат слева, чтобы начать переписку.</div>
      </div>
    );
  }

  return (
    <div className="card chat-card chat-panel">
      <div className="chat-panel-header">
        <div className="chat-panel-header-main">
          <div>
            <h2>{room.name}</h2>
            <p>
              {room.type === 'global'
                ? 'Общая комната для всех зарегистрированных пользователей'
                : `Участников: ${room.participants?.length || 0}`}
            </p>
          </div>
        </div>
      </div>

      <div className="chat-panel-messages">
        {hasMore ? (
          <button type="button" className="btn-secondary" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Загружаю историю…' : 'Load older messages'}
          </button>
        ) : null}

        {loading ? <div className="chat-loading">Загружаю сообщения…</div> : null}

        {!loading && messages.length === 0 ? (
          <div className="chat-empty-state">
            {room.type === 'global'
              ? 'General уже готов. Отправьте первое сообщение в общую комнату.'
              : 'Личный чат создан. Можно отправлять первое сообщение.'}
          </div>
        ) : null}

        {!loading
          ? messages.map((message) => {
              const isOwn = Number(message.sender?.id || message.sender_id) === Number(currentUserId);
              const authorName = message.sender?.name || 'System';
              const avatarUrl = message.sender?.avatar_url || '';
              return (
                <div key={message.id} className={`chat-message-row ${isOwn ? 'is-own' : ''}`}>
                  <span className="chat-message-avatar" aria-hidden="true">
                    {avatarUrl ? <img src={avatarUrl} alt={authorName} /> : buildInitials(authorName)}
                  </span>

                  <div className="chat-message-bubble">
                    <div className="chat-message-topline">
                      <span className="chat-message-author">
                        {room.type === 'global' || !isOwn ? authorName : 'You'}
                      </span>
                      <span className="chat-message-time">{formatTime(message.created_at)}</span>
                    </div>

                    {message.body ? <div className="chat-message-body">{message.body}</div> : null}

                    {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                      <div className="chat-attachment-list">
                        {message.attachments.map((attachment) => (
                          <div key={attachment.id} className="chat-attachment">
                            <div className="chat-attachment-main">
                              <div className="chat-attachment-name">{attachment.original_name}</div>
                              <div className="chat-attachment-meta">
                                {attachment.mime_type || 'file'} · {formatBytes(attachment.size_bytes)}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => downloadAttachment(attachment)}
                            >
                              Download
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          : null}
        <div ref={endRef} />
      </div>

      <div className="chat-composer">
        {sendError ? <div className="chat-error">{sendError}</div> : null}

        <form className="chat-composer-form" onSubmit={handleSubmit}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={room.type === 'global' ? 'Напишите сообщение для общей комнаты…' : 'Напишите сообщение…'}
            disabled={sending}
          />

          <div className="chat-composer-actions">
            <label className="chat-composer-file">
              <span>Attach file</span>
              <input
                type="file"
                disabled={sending}
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <span className="chat-composer-file-name">{file ? file.name : 'No file selected'}</span>
            </label>

            <button type="submit" className="btn-primary" disabled={sending || (!body.trim() && !file)}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
