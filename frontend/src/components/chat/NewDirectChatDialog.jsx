import React from 'react';
import { getChatCopy } from './chatCopy.js';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-dialog-close-icon">
      <path d="M7.28 7.28a.75.75 0 0 1 1.06 0L12 10.94l3.66-3.66a.75.75 0 1 1 1.06 1.06L13.06 12l3.66 3.66a.75.75 0 1 1-1.06 1.06L12 13.06l-3.66 3.66a.75.75 0 0 1-1.06-1.06L10.94 12 7.28 8.34a.75.75 0 0 1 0-1.06Z" fill="currentColor" />
    </svg>
  );
}

function buildInitials(label) {
  const parts = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  return String(label || 'U').slice(0, 2).toUpperCase();
}

export default function NewDirectChatDialog({
  open,
  users,
  loading,
  error,
  creating,
  onClose,
  onSelectUser,
  copy = getChatCopy('en'),
}) {
  const [query, setQuery] = React.useState('');

  if (!open) return null;

  const filteredUsers = users.filter((user) => {
    const haystack = [user.name, user.email].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(String(query || '').trim().toLowerCase());
  });

  return (
    <div className="chat-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="chat-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="chat-dialog-head">
          <div>
            <h3>{copy.directDialogTitle}</h3>
            <p>{copy.directDialogSubtitle}</p>
          </div>
          <button type="button" className="chat-dialog-close" onClick={onClose} aria-label={copy.close}>
            <CloseIcon />
          </button>
        </div>

        <div className="chat-dialog-body">
          <input
            type="search"
            className="chat-dialog-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
          />

          {loading ? <div className="chat-dialog-empty">{copy.usersLoading}</div> : null}
          {!loading && error ? <div className="chat-dialog-empty chat-dialog-empty--error">{error}</div> : null}
          {!loading && !users.length && !error ? <div className="chat-dialog-empty">{copy.usersEmpty}</div> : null}
          {!loading && users.length && !filteredUsers.length ? <div className="chat-dialog-empty">{copy.usersSearchEmpty}</div> : null}

          {!loading
            ? filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="chat-dialog-user"
                  disabled={creating}
                  onClick={() => onSelectUser(user)}
                >
                  <span className="chat-dialog-user-avatar" aria-hidden="true">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.name} className="chat-dialog-user-avatar-image" />
                    ) : (
                      buildInitials(user.name || user.email || 'U')
                    )}
                  </span>
                  <span className="chat-dialog-user-meta">
                    <span className="chat-dialog-user-name">{user.name}</span>
                    <span className="chat-dialog-user-email">{user.email || copy.userNoEmail}</span>
                  </span>
                  <span className="chat-dialog-user-open">{copy.openShort}</span>
                </button>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
