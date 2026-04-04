import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppSettings } from '../context/AppSettingsContext';
import * as authApi from '../services/authApi';

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

export default function SidebarUser({ unreadNotificationTotal = 0 }) {
  const { user, logout } = useAuth();
  const { t, language, setLanguage, setTheme, isDark } = useAppSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [showChangePwd, setShowChangePwd] = useState(false);

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
  const avatarUrl = String(user.avatar_url || '').trim();
  const notificationsActive = location.pathname === '/personal-fragebogen-notifications';
  const settingsActive = location.pathname.startsWith('/settings');

  async function handleLogout() {
    await logout();
    window.location.href = '/login';
  }

  return (
    <>
      <div className="topbar-user-card-shell">
        <div className="sidebar-user-card topbar-user-card">
          <div className="sidebar-user-card-head">
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
          <div className="sidebar-user-utilities">
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
          </div>
          <div className="sidebar-user-preferences">
            <label className="sidebar-user-pref-field">
              <span>{t('appearance.language')}</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">{t('appearance.english')}</option>
                <option value="de">{t('appearance.german')}</option>
              </select>
            </label>
          </div>
          <div className="sidebar-user-actions">
            <button type="button" className="sidebar-user-btn" onClick={() => setShowChangePwd(true)}>{t('user.changePassword')}</button>
            <button type="button" className="sidebar-user-btn" onClick={handleLogout}>{t('user.logout')}</button>
          </div>
        </div>
      </div>
      {showChangePwd && (
        <ChangePasswordModal
          onClose={() => setShowChangePwd(false)}
          onSaved={() => setShowChangePwd(false)}
        />
      )}
    </>
  );
}

function ChangePasswordModal({ onClose, onSaved }) {
  const { logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPwd !== confirm) { setError('New password and confirmation do not match'); return; }
    if (newPwd.length < 8) { setError('New password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      await authApi.changePassword(current, newPwd);
      onSaved();
      await logout();
      window.location.href = '/login';
    } catch (e) {
      setError(e.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>Change password</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="settings-modal-body">
          {error && <p className="settings-msg settings-msg--err" style={{ marginBottom: '0.5rem' }}>{error}</p>}
          <label>Current password <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></label>
          <label>New password (min 8) <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
          <label>Confirm new password <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
          <div className="settings-modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Change password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
