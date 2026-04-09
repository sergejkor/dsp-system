import React from 'react';
import { Link, useLocation } from 'react-router-dom';

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-launcher-icon">
      <path
        d="M12 3.25c-4.97 0-9 3.56-9 7.95 0 2.31 1.11 4.4 2.9 5.85l-.75 3.1a.75.75 0 0 0 1.02.86l3.53-1.56c.73.13 1.5.2 2.3.2 4.97 0 9-3.56 9-7.95s-4.03-7.95-9-7.95Zm-3.5 7.9a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm3.5 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm3.5 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function ChatLauncherButton() {
  const location = useLocation();
  const isActive = location.pathname.startsWith('/chat');

  return (
    <Link
      to="/chat"
      className={`chat-launcher-btn ${isActive ? 'is-active' : ''}`}
      title="Chat"
      aria-label="Open chat"
    >
      <ChatBubbleIcon />
      <span>Chat</span>
    </Link>
  );
}
