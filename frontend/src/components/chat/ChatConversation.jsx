import React from 'react';
import { getChatCopy } from './chatCopy.js';

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-message-attachment-icon">
      <path d="M15.53 6.22a3.75 3.75 0 0 1 5.3 5.3l-8.49 8.5a5.25 5.25 0 0 1-7.42-7.43l8.14-8.14a2.75 2.75 0 0 1 3.89 3.89L9.17 16.1a1.25 1.25 0 1 1-1.77-1.77l6.72-6.72a.75.75 0 0 1 1.06 1.06L8.46 15.4a.25.25 0 1 0 .35.36l7.78-7.79a1.25 1.25 0 0 0-1.77-1.77L6.68 14.34a3.75 3.75 0 1 0 5.3 5.3l8.5-8.49a2.25 2.25 0 0 0-3.18-3.18l-1.95 1.95a.75.75 0 1 1-1.06-1.06l1.94-1.94Z" fill="currentColor" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-composer-send-icon">
      <path d="M20.7 3.32a.75.75 0 0 1 .92.96l-5.25 15.5a.75.75 0 0 1-1.39.07l-2.1-4.92-4.92-2.1a.75.75 0 0 1 .07-1.39l15.5-5.25a.75.75 0 0 1 1.17.73Z" fill="currentColor" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-composer-upload-icon">
      <path d="M11.25 4.75a.75.75 0 0 1 1.5 0v8.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 1.06-1.06l2.72 2.72V4.75ZM5.75 18a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11A.75.75 0 0 1 5.75 18Z" fill="currentColor" />
    </svg>
  );
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function formatAttachmentSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  let size = sizeBytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function roomSubtitle(room, currentUserId, copy) {
  if (!room) return '';
  if (room.type === 'global') return copy.generalHint;
  const peer = (room.participants || []).find((participant) => Number(participant.id) !== Number(currentUserId)) || (room.participants || [])[0];
  return peer?.email || copy.directParticipants;
}

export default function ChatConversation({
  currentUserId,
  room,
  messages,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onSendMessage,
  sending,
  sendError,
  copy = getChatCopy('en'),
  onDownloadAttachment,
}) {
  const [draft, setDraft] = React.useState('');
  const [selectedFile, setSelectedFile] = React.useState(null);
  const fileInputRef = React.useRef(null);
  const messagesViewportRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [room?.id, messages.length]);

  async function handleSubmit(event) {
    event.preventDefault();
    const body = String(draft || '').trim();
    if (!body && !selectedFile) return;
    await onSendMessage?.({ body, file: selectedFile });
    setDraft('');
    setSelectedFile(null);
  }

  if (!room) {
    return (
      <section className="chat-conversation chat-conversation--empty chat-surface">
        <div className="chat-empty-state">
          <h2>{copy.roomsTitle}</h2>
          <p>{copy.noMessagesSelected}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="chat-conversation chat-surface">
      <header className="chat-conversation-head">
        <div>
          <h2>{room.name}</h2>
          <p>{roomSubtitle(room, currentUserId, copy)}</p>
        </div>
        <div className={`chat-realtime-pill ${sending ? 'is-busy' : ''}`}>
          {sending ? copy.sending : 'Secure channel'}
        </div>
      </header>

      <div className="chat-messages" ref={messagesViewportRef}>
        {hasMore ? (
          <button type="button" className="chat-load-older-btn" onClick={onLoadMore}>
            {loadingMore ? copy.loadingOlder : copy.loadOlder}
          </button>
        ) : null}

        {loading ? <div className="chat-message-empty">{copy.messagesLoading}</div> : null}
        {!loading && !messages.length ? (
          <div className="chat-message-empty">{room.type === 'global' ? copy.generalEmpty : copy.directEmpty}</div>
        ) : null}

        {!loading
          ? messages.map((message) => {
              const isOwn = Number(message.sender_id) === Number(currentUserId);
              return (
                <article key={message.id} className={`chat-message ${isOwn ? 'is-own' : ''}`}>
                  <div className="chat-message-bubble">
                    {!isOwn && room.type === 'global' && message.sender?.name ? (
                      <div className="chat-message-author">{message.sender.name}</div>
                    ) : null}

                    {message.body ? <div className="chat-message-text">{message.body}</div> : null}

                    {message.attachments?.length
                      ? message.attachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            className="chat-message-attachment"
                            onClick={() => onDownloadAttachment?.(attachment)}
                          >
                            <AttachmentIcon />
                            <span className="chat-message-attachment-meta">
                              <span className="chat-message-attachment-name">{attachment.original_name}</span>
                              <span className="chat-message-attachment-size">{formatAttachmentSize(attachment.size_bytes)}</span>
                            </span>
                          </button>
                        ))
                      : null}

                    <div className="chat-message-time">{formatTimestamp(message.created_at)}</div>
                  </div>
                </article>
              );
            })
          : null}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-composer" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          className="chat-hidden-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setSelectedFile(file);
            event.target.value = '';
          }}
        />

        <button type="button" className="chat-composer-secondary-btn" onClick={() => fileInputRef.current?.click()} title={copy.attachFile}>
          <UploadIcon />
        </button>

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={room.type === 'global' ? copy.composerGeneralPlaceholder : copy.composerPlaceholder}
          rows={1}
        />

        <button
          type="submit"
          className="chat-composer-send-btn"
          disabled={sending || (!String(draft || '').trim() && !selectedFile)}
        >
          <SendIcon />
          <span>{copy.send}</span>
        </button>
      </form>

      {selectedFile ? <div className="chat-composer-file">{selectedFile.name}</div> : null}
      {sendError ? <div className="chat-message-empty chat-message-empty--error">{sendError}</div> : null}
    </section>
  );
}
