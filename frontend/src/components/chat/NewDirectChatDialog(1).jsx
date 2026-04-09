import React from 'react';

function buildInitials(label) {
  const words = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return 'US';
}

export default function NewDirectChatDialog({
  open,
  users,
  loading = false,
  error = '',
  creating = false,
  copy,
  onClose,
  onSelectUser,
}) {
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filteredUsers = React.useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return users;
    return users.filter((user) => {
      const haystack = `${user.name || ''} ${user.email || ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [users, query]);

  if (!open) return null;

  return (
    <div className="chat-dialog-backdrop" onClick={onClose}>
      <div className="chat-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="chat-dialog-header">
          <div>
            <h3>{copy.directDialogTitle}</h3>
            <p>{copy.directDialogSubtitle}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {copy.close}
          </button>
        </div>

        <div className="chat-dialog-body">
          <div className="chat-dialog-search">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
            />
          </div>

          {loading ? <div className="chat-loading">{copy.usersLoading}</div> : null}
          {error ? <div className="chat-error">{error}</div> : null}

          {!loading && !error ? (
            <div className="chat-user-list">
              {filteredUsers.length === 0 ? (
                <div className="chat-empty-state">
                  {users.length === 0 ? copy.usersEmpty : copy.usersSearchEmpty}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="chat-user-item"
                    onClick={() => onSelectUser?.(user)}
                    disabled={creating}
                  >
                    <span className="chat-user-avatar" aria-hidden="true">
                      {user.avatar_url ? <img src={user.avatar_url} alt={user.name} /> : buildInitials(user.name)}
                    </span>
                    <span className="chat-user-main">
                      <span className="chat-user-name">{user.name}</span>
                      <span className="chat-user-email">{user.email || copy.userNoEmail}</span>
                    </span>
                    <span className="btn-secondary">{creating ? '...' : copy.openShort}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="chat-dialog-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {copy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
