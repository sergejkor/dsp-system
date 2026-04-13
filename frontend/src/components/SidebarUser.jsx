import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppSettings } from '../context/AppSettingsContext';
import { listRooms } from '../services/chatApi.js';
import { createChatSocket } from '../services/chatSocket.js';

function prettifyRole(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildInitials(label) {
  const words = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return 'US';
}

function mergeRoomSummary(prevRooms, incomingRoom) {
  if (!incomingRoom?.id) return prevRooms;
  const nextRooms = Array.isArray(prevRooms) ? [...prevRooms] : [];
  const targetId = Number(incomingRoom.id);
  const index = nextRooms.findIndex((room) => Number(room?.id) === targetId);
  if (index >= 0) {
    nextRooms[index] = { ...nextRooms[index], ...incomingRoom };
  } else {
    nextRooms.push(incomingRoom);
  }
  return nextRooms;
}

function sumUnreadRooms(rooms) {
  return (rooms || []).reduce(
    (sum, room) => sum + Math.max(0, Number(room?.unread_count) || 0),
    0
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-user-utility-icon">
      <path
        d="M4 6.75h16a1.25 1.25 0 0 1 1.25 1.25v8A2.25 2.25 0 0 1 19 18.25H5A2.25 2.25 0 0 1 2.75 16V8A1.25 1.25 0 0 1 4 6.75Zm0 1.5.13.1L12 13.83l7.87-5.48.13-.1H4Zm15.75 1.55-7.32 5.1a.75.75 0 0 1-.86 0l-7.32-5.1V16c0 .41.34.75.75.75h14c.41 0 .75-.34.75-.75V9.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-user-utility-icon">
      <path
        d="M12 3.25c-4.97 0-9 3.56-9 7.95 0 2.31 1.11 4.4 2.9 5.85l-.75 3.1a.75.75 0 0 0 1.02.86l3.53-1.56c.73.13 1.5.2 2.3.2 4.97 0 9-3.56 9-7.95s-4.03-7.95-9-7.95Zm-3.5 7.9a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm3.5 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm3.5 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-user-utility-icon">
      <path
        d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.1 3.5-.96-.55c-.08-.27-.18-.53-.31-.78l.28-1.06a1 1 0 0 0-.26-.99l-1.27-1.27a1 1 0 0 0-.99-.26l-1.06.28c-.25-.13-.51-.23-.78-.31l-.55-.96a1 1 0 0 0-.87-.5h-1.8a1 1 0 0 0-.87.5l-.55.96c-.27.08-.53.18-.78.31l-1.06-.28a1 1 0 0 0-.99.26L5.15 8.62a1 1 0 0 0-.26.99l.28 1.06c-.13.25-.23.51-.31.78l-.96.55a1 1 0 0 0-.5.87v1.8a1 1 0 0 0 .5.87l.96.55c.08.27.18.53.31.78l-.28 1.06a1 1 0 0 0 .26.99l1.27 1.27a1 1 0 0 0 .99.26l1.06-.28c.25.13.51.23.78.31l.55.96a1 1 0 0 0 .87.5h1.8a1 1 0 0 0 .87-.5l.55-.96c.27-.08.53-.18.78-.31l1.06.28a1 1 0 0 0 .99-.26l1.27-1.27a1 1 0 0 0 .26-.99l-.28-1.06c.13-.25.23-.51.31-.78l.96-.55a1 1 0 0 0 .5-.87v-1.8a1 1 0 0 0-.5-.87ZM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-user-utility-icon">
      <path
        d="M12 6.25A5.75 5.75 0 1 0 17.75 12 5.76 5.76 0 0 0 12 6.25Zm0-4a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3A.75.75 0 0 1 12 2.25Zm0 17a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V20A.75.75 0 0 1 12 19.25Zm9.75-8a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5Zm-17 0a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5Zm12.72-5.47a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm-12.66 12.66a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm13.72 1.06a.75.75 0 0 1 1.06-1.06l1.06 1.06a.75.75 0 1 1-1.06 1.06Zm-12.66-12.66a.75.75 0 0 1 1.06-1.06l1.06 1.06A.75.75 0 0 1 7.22 8.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-user-utility-icon">
      <path
        d="M14.7 2.25a.75.75 0 0 1 .64 1.14A8.25 8.25 0 1 0 20.6 14.7a.75.75 0 0 1 1.14.64A9.75 9.75 0 1 1 14.7 2.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-user-utility-icon">
      <path
        d="M12 3.25a8.75 8.75 0 1 0 0 17.5 8.75 8.75 0 0 0 0-17.5Zm6.99 8h-2.38a14.8 14.8 0 0 0-1.1-4.14A7.28 7.28 0 0 1 18.99 11.25Zm-6.24-6.42c1.08.58 2.16 2.48 2.72 5.42h-5.44c.56-2.94 1.64-4.84 2.72-5.42Zm-3.26 2.28a14.8 14.8 0 0 0-1.1 4.14H5.01a7.28 7.28 0 0 1 4.48-4.14ZM5.01 12.75h3.38c.11 1.46.48 2.87 1.1 4.14a7.28 7.28 0 0 1-4.48-4.14Zm5.02 0h5.94c-.12 1.36-.47 2.69-1.03 3.86-.83 1.73-1.79 2.64-2.44 2.64s-1.61-.91-2.44-2.64a12.7 12.7 0 0 1-1.03-3.86Zm5.48 4.14a14.8 14.8 0 0 0 1.1-4.14h2.38a7.28 7.28 0 0 1-4.48 4.14Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-user-utility-icon">
      <path
        d="M10.75 3.75A2.75 2.75 0 0 0 8 6.5v2a.75.75 0 0 0 1.5 0v-2c0-.69.56-1.25 1.25-1.25h5.75c.69 0 1.25.56 1.25 1.25v11c0 .69-.56 1.25-1.25 1.25h-5.75c-.69 0-1.25-.56-1.25-1.25v-2a.75.75 0 0 0-1.5 0v2A2.75 2.75 0 0 0 10.75 20.25h5.75A2.75 2.75 0 0 0 19.25 17.5v-11a2.75 2.75 0 0 0-2.75-2.75h-5.75ZM4.22 11.47a.75.75 0 0 0 0 1.06l2.5 2.5a.75.75 0 1 0 1.06-1.06l-1.22-1.22H14a.75.75 0 0 0 0-1.5H6.56l1.22-1.22a.75.75 0 0 0-1.06-1.06l-2.5 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function SidebarUser({ unreadNotificationTotal = 0 }) {
  const { user, logout } = useAuth();
  const { t, language, setLanguage, setTheme, isDark } = useAppSettings();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const displayName = useMemo(() => {
    return (
      user.full_name ||
      user.name ||
      user.display_name ||
      user.displayName ||
      String(user.email || '').split('@')[0] ||
      'User'
    );
  }, [user]);

  const subtitle = useMemo(() => {
    return user.role_name || prettifyRole(user.role_code) || user.email || '';
  }, [user]);

  const initials = useMemo(() => buildInitials(displayName), [displayName]);
  const avatarUrl = String(
    user.avatar_url || user.avatarUrl || user.photo_url || user.photoUrl || ''
  ).trim();
  const chatActive = location.pathname.startsWith('/chat');
  const notificationsActive = location.pathname === '/personal-fragebogen-notifications';
  const settingsActive = location.pathname.startsWith('/settings');
  const [chatRoomsSummary, setChatRoomsSummary] = useState([]);
  const unreadChatTotal = useMemo(() => sumUnreadRooms(chatRoomsSummary), [chatRoomsSummary]);

  const refreshChatUnread = useCallback(async () => {
    try {
      const response = await listRooms();
      setChatRoomsSummary(response.items || []);
    } catch (_error) {
      // Keep previous value if rooms cannot be loaded right now.
    }
  }, []);

  async function handleLogout() {
    await logout();
    window.location.href = '/login';
  }

  function toggleLanguage() {
    setLanguage(language === 'de' ? 'en' : 'de');
  }

  useEffect(() => {
    refreshChatUnread();
  }, [refreshChatUnread, location.pathname]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      refreshChatUnread();
    }, 1500);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshChatUnread();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshChatUnread]);

  useEffect(() => {
    const socket = createChatSocket({
      onStatusChange: () => {},
      onEvent: (packet) => {
        if (packet.event === 'chat.room.updated' && packet.payload?.room) {
          setChatRoomsSummary((prev) => mergeRoomSummary(prev, packet.payload.room));
        }
        if (packet.event === 'chat.message.read' && packet.payload?.roomId) {
          const roomId = Number(packet.payload.roomId);
          setChatRoomsSummary((prev) =>
            (prev || []).map((room) =>
              Number(room?.id) === roomId ? { ...room, unread_count: 0 } : room
            )
          );
        }
        if (packet.event === 'chat.message.created') {
          const roomId = Number(packet.payload?.roomId);
          const senderId = Number(packet.payload?.message?.sender_id || packet.payload?.message?.sender?.id || 0);
          const currentUserId = Number(user?.id || 0);
          if (roomId && senderId && currentUserId && senderId !== currentUserId) {
            setChatRoomsSummary((prev) => {
              const exists = (prev || []).some((room) => Number(room?.id) === roomId);
              if (!exists) return prev;
              return (prev || []).map((room) =>
                Number(room?.id) === roomId
                  ? { ...room, unread_count: (Number(room?.unread_count) || 0) + 1 }
                  : room
              );
            });
            refreshChatUnread();
          } else {
            refreshChatUnread();
          }
        }
      },
    });
    return () => socket.close();
  }, [refreshChatUnread, user?.id]);

  return (
    <div className="topbar-user-card-shell">
      <div className="sidebar-user-card topbar-user-card topbar-user-card--compact">
        <div className="sidebar-user-card-head topbar-user-card-head">
          <div className="sidebar-user-avatar" aria-hidden="true">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="sidebar-user-avatar-image" />
            ) : (
              initials
            )}
          </div>
          <div className="sidebar-user-meta">
            <div className="sidebar-user-name" title={displayName}>{displayName}</div>
            <span className="sidebar-user-email" title={subtitle || user.email}>{subtitle || user.email}</span>
          </div>
        </div>

        <div className="sidebar-user-utilities topbar-user-utilities">
          <div className="sidebar-user-icons-row" role="toolbar" aria-label={t('nav.accountTools')}>
            <button
              type="button"
              className="sidebar-user-language-btn"
              onClick={toggleLanguage}
              title={`${t('appearance.language')}: ${language === 'de' ? t('appearance.german') : t('appearance.english')}`}
            >
              <GlobeIcon />
              <span>{language === 'de' ? 'DE' : 'EN'}</span>
            </button>
            <button
              type="button"
              className={`sidebar-user-utility-btn ${chatActive ? 'is-active' : ''}`}
              onClick={() => navigate('/chat')}
              title="Chat"
            >
              <ChatIcon />
              {unreadChatTotal > 0 ? (
                <span className="sidebar-user-utility-badge">
                  {unreadChatTotal > 99 ? '99+' : unreadChatTotal}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={`sidebar-user-utility-btn ${notificationsActive ? 'is-active' : ''}`}
              onClick={() => navigate('/personal-fragebogen-notifications')}
              title="Notifications"
            >
              <MailIcon />
              {unreadNotificationTotal > 0 && (
                <span className="sidebar-user-utility-badge">
                  {unreadNotificationTotal > 99 ? '99+' : unreadNotificationTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`sidebar-user-utility-btn ${settingsActive ? 'is-active' : ''}`}
              onClick={() => navigate('/settings')}
              title={t('nav.settings')}
            >
              <SettingsIcon />
            </button>
            <button
              type="button"
              className="sidebar-user-utility-btn"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title={`${t('appearance.theme')}: ${isDark ? t('appearance.dark') : t('appearance.light')}`}
            >
              {isDark ? <MoonIcon /> : <SunIcon />}
            </button>
            <button
              type="button"
              className="sidebar-user-utility-btn"
              onClick={handleLogout}
              title={t('user.logout')}
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
