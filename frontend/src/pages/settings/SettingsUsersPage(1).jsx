import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  getUsers,
  getRoles,
  createUser,
  updateUser,
  lockUser,
  unlockUser,
  deactivateUser,
  reactivateUser,
} from '../../services/settingsApi';
import { resetPassword, setLoginEnabled } from '../../services/authApi';

const AVATAR_MAX_SIZE = 256;

function buildUserName(user) {
  return user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

async function optimizeAvatarFile(file) {
  if (!file) return '';
  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('Please choose an image file');
  }
  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceUrl);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, AVATAR_MAX_SIZE / Math.max(image.width || 1, image.height || 1));
  const width = Math.max(1, Math.round((image.width || 1) * scale));
  const height = Math.max(1, Math.round((image.height || 1) * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to prepare image');
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function AvatarPreview({ user, size = 'md' }) {
  const displayName = buildUserName(user);
  const avatarUrl = String(user?.avatar_url || '').trim();
  const initials = buildInitials(displayName);
  return (
    <div className={`settings-user-avatar settings-user-avatar--${size}`} aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt={displayName} className="settings-user-avatar-image" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function AvatarField({ value, onChange, onError }) {
  const previewUser = { full_name: 'Preview', avatar_url: value };

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const optimized = await optimizeAvatarFile(file);
      onChange(optimized);
    } catch (error) {
      onError(error.message || 'Failed to prepare image');
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="settings-avatar-field">
      <AvatarPreview user={previewUser} size="lg" />
      <div className="settings-avatar-controls">
        <input type="file" accept="image/*" onChange={handleFileChange} />
        <div className="settings-avatar-actions">
          <button type="button" className="settings-act" onClick={() => onChange('')}>Remove photo</button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsUsersPage() {
  const { isSuperAdmin, user, loadUser } = useAuth();
  const [list, setList] = useState({ items: [], total: 0 });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resettingPasswordFor, setResettingPasswordFor] = useState(null);

  function load() {
    setLoading(true);
    const params = { limit: 100, offset: 0 };
    if (statusFilter) params.status = statusFilter;
    Promise.all([getUsers(params), getRoles()])
      .then(([users, r]) => {
        setList(users);
        setRoles(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  const filtered = search.trim()
    ? list.items.filter(
        (u) =>
          buildUserName(u).toLowerCase().includes(search.toLowerCase()) ||
          String(u.email || '').toLowerCase().includes(search.toLowerCase()) ||
          String(u.role_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : list.items;

  function handleLock(id) {
    lockUser(id).then(() => { setMessage('User locked'); load(); }).catch((e) => setError(e.message));
  }

  function handleReactivate(id) {
    reactivateUser(id).then(() => { setMessage('User reactivated'); load(); }).catch((e) => setError(e.message));
  }

  function handleDeactivate(id) {
    if (!confirm('Deactivate this user?')) return;
    deactivateUser(id).then(() => { setMessage('User deactivated'); load(); setModal(null); }).catch((e) => setError(e.message));
  }

  return (
    <>
      <h3>Users & Access</h3>
      <p className="muted">Manage system users, roles, access and profile photos.</p>
      {error && <p className="settings-msg settings-msg--err">{error}</p>}
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}

      <div className="settings-toolbar">
        <input
          type="text"
          placeholder="Search by name, email, role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="settings-search"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="invited">Invited</option>
        </select>
        {isSuperAdmin && <button type="button" onClick={() => setModal({ type: 'add' })}>+ Add User</button>}
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Login</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="settings-empty">No users.</td></tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id}>
                    <td><AvatarPreview user={u} size="sm" /></td>
                    <td>{buildUserName(u)}</td>
                    <td>{u.email}</td>
                    <td>{u.role_name || u.role_code || '—'}</td>
                    <td><span className={`settings-badge settings-badge--${u.status || 'active'}`}>{u.status || 'active'}</span></td>
                    <td>{u.login_enabled ? 'Yes' : 'No'}{u.is_locked ? ' (locked)' : ''}</td>
                    <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                    <td className="settings-actions-cell">
                      <button type="button" className="settings-act" onClick={() => setModal({ type: 'edit', user: u })}>Edit</button>
                      {isSuperAdmin && (
                        <>
                          <button type="button" className="settings-act" onClick={() => setResettingPasswordFor(u)}>Reset pwd</button>
                          <button
                            type="button"
                            className="settings-act"
                            onClick={() => setLoginEnabled(u.id, !u.login_enabled).then(() => { setMessage('Saved'); load(); }).catch((e) => setError(e.message))}
                          >
                            {u.login_enabled ? 'Disable login' : 'Enable login'}
                          </button>
                          {u.is_locked ? (
                            <button type="button" className="settings-act" onClick={() => unlockUser(u.id).then(load)}>Unlock</button>
                          ) : (
                            <button type="button" className="settings-act" onClick={() => handleLock(u.id)}>Lock</button>
                          )}
                          {u.status === 'active' ? (
                            <button type="button" className="settings-act settings-act--danger" onClick={() => handleDeactivate(u.id)}>Deactivate</button>
                          ) : (
                            <button type="button" className="settings-act" onClick={() => handleReactivate(u.id)}>Reactivate</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'add' && (
        <AddUserModal
          roles={roles}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setModal(null)}
          onSaved={() => { setMessage('User added'); setModal(null); load(); }}
          onError={setError}
        />
      )}
      {resettingPasswordFor && (
        <ResetPasswordModal
          user={resettingPasswordFor}
          onClose={() => setResettingPasswordFor(null)}
          onSaved={() => { setMessage('Password reset'); setResettingPasswordFor(null); load(); }}
          onError={setError}
        />
      )}
      {modal?.type === 'edit' && modal.user && (
        <EditUserModal
          user={modal.user}
          roles={roles}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setMessage('Saved');
            setModal(null);
            if (modal.user.id === user?.id) {
              await loadUser();
            }
            load();
          }}
          onError={setError}
        />
      )}

      <style>{`
        .settings-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
        .settings-search { width: 240px; padding: 0.4rem; }
        .settings-table-wrap { overflow: auto; }
        .settings-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .settings-table th, .settings-table td { border: 1px solid #e5e7eb; padding: 0.4rem 0.6rem; text-align: left; vertical-align: middle; }
        .settings-table th { background: #f9fafb; }
        .settings-empty { color: #6b7280; text-align: center; padding: 1rem !important; }
        .settings-badge { padding: 2px 8px; border-radius: 6px; font-size: 0.8rem; }
        .settings-badge--active { background: #d1fae5; color: #065f46; }
        .settings-badge--inactive { background: #e5e7eb; color: #374151; }
        .settings-badge--suspended { background: #fee2e2; color: #991b1b; }
        .settings-badge--invited { background: #dbeafe; color: #1e40af; }
        .settings-actions-cell { white-space: nowrap; }
        .settings-act { margin-right: 0.25rem; padding: 0.2rem 0.4rem; font-size: 0.8rem; cursor: pointer; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
        .settings-act--danger { color: #b91c1c; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
        .settings-user-avatar { border-radius: 999px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; background: linear-gradient(135deg, #7aa8ff, #4f6cf0); box-shadow: inset 0 1px 0 rgba(255,255,255,0.35); }
        .settings-user-avatar--sm { width: 36px; height: 36px; font-size: 0.72rem; }
        .settings-user-avatar--md { width: 48px; height: 48px; font-size: 0.9rem; }
        .settings-user-avatar--lg { width: 76px; height: 76px; font-size: 1.2rem; }
        .settings-user-avatar-image { width: 100%; height: 100%; object-fit: cover; display: block; }
        .settings-avatar-field { display: flex; align-items: center; gap: 0.9rem; }
        .settings-avatar-controls { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
        .settings-avatar-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      `}</style>
    </>
  );
}

function ResetPasswordModal({ user, onClose, onSaved, onError }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!password || password.length < 8) { onError('Password must be at least 8 characters'); return; }
    setSaving(true);
    onError('');
    resetPassword(user.id, password)
      .then(onSaved)
      .catch((e) => { onError(e.message); setSaving(false); });
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>Reset password - {user.email}</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="settings-modal-body">
          <label>New password (min 8 characters) <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
          <div className="settings-modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Reset password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddUserModal({ roles, isSuperAdmin, onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', role_id: '', department_id: '', station_id: '', notes: '', status: 'active',
    password: '', login_enabled: false, avatar_url: '',
  });
  const [saving, setSaving] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.email?.trim()) { onError('Email is required'); return; }
    setSaving(true);
    onError('');
    const payload = { ...form, role_id: form.role_id ? Number(form.role_id) : null };
    if (form.password) payload.password = form.password;
    if (isSuperAdmin) payload.login_enabled = form.login_enabled;
    createUser(payload)
      .then(onSaved)
      .catch((e) => { onError(e.message); setSaving(false); });
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>Add User</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="settings-modal-body">
          <label>Photo <AvatarField value={form.avatar_url} onChange={(value) => setForm({ ...form, avatar_url: value })} onError={onError} /></label>
          <label>First name <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
          <label>Last name <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
          <label>Email * <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          {isSuperAdmin && <label>Initial password (optional) <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to set later" autoComplete="new-password" /></label>}
          <label>Phone <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Role <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
            <option value="">—</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
          </select></label>
          {isSuperAdmin && <label><input type="checkbox" checked={form.login_enabled} onChange={(e) => setForm({ ...form, login_enabled: e.target.checked })} /> Login enabled</label>}
          <label>Department <input value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} /></label>
          <label>Station <input value={form.station_id} onChange={(e) => setForm({ ...form, station_id: e.target.value })} /></label>
          <label>Notes <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></label>
          <div className="settings-modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add User'}</button>
          </div>
        </form>
      </div>
      <style>{`
        .settings-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .settings-modal { background: #fff; border-radius: 12px; max-width: 520px; width: 92%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .settings-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; }
        .settings-modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .settings-modal-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .settings-modal-body label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
        .settings-modal-body input, .settings-modal-body select, .settings-modal-body textarea { padding: 0.4rem; }
        .settings-modal-footer { margin-top: 0.5rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
      `}</style>
    </div>
  );
}

function EditUserModal({ user, roles, onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    full_name: user.full_name || '',
    phone: user.phone || '',
    role_id: user.role_id ?? '',
    department_id: user.department_id || '',
    station_id: user.station_id || '',
    notes: user.notes || '',
    status: user.status || 'active',
    avatar_url: user.avatar_url || '',
  });
  const [saving, setSaving] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    onError('');
    updateUser(user.id, {
      ...form,
      role_id: form.role_id ? Number(form.role_id) : null,
    })
      .then(onSaved)
      .catch((e) => { onError(e.message); setSaving(false); });
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>Edit User - {user.email}</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="settings-modal-body">
          <label>Photo <AvatarField value={form.avatar_url} onChange={(value) => setForm({ ...form, avatar_url: value })} onError={onError} /></label>
          <label>First name <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
          <label>Last name <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
          <label>Phone <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Role <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
            <option value="">—</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
          </select></label>
          <label>Department <input value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} /></label>
          <label>Station <input value={form.station_id} onChange={(e) => setForm({ ...form, station_id: e.target.value })} /></label>
          <label>Status <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="invited">Invited</option>
          </select></label>
          <label>Notes <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></label>
          <div className="settings-modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
      <style>{`
        .settings-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .settings-modal { background: #fff; border-radius: 12px; max-width: 520px; width: 92%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .settings-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; }
        .settings-modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .settings-modal-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .settings-modal-body label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
        .settings-modal-body input, .settings-modal-body select, .settings-modal-body textarea { padding: 0.4rem; }
        .settings-modal-footer { margin-top: 0.5rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
      `}</style>
    </div>
  );
}
