import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppSettings } from '../context/AppSettingsContext';
import * as authApi from '../services/authApi';

export default function SidebarUser() {
  const { user, logout } = useAuth();
  const { t } = useAppSettings();
  const [showChangePwd, setShowChangePwd] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    await logout();
    window.location.href = '/login';
  }

  return (
    <>
      <div className="sidebar-user">
        <span className="sidebar-user-email" title={user.email}>{user.email}</span>
        <div className="sidebar-user-actions">
          <button type="button" className="sidebar-user-btn" onClick={() => setShowChangePwd(true)}>{t('user.changePassword')}</button>
          <button type="button" className="sidebar-user-btn" onClick={handleLogout}>{t('user.logout')}</button>
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
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
