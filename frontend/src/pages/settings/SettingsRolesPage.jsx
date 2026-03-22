import { useEffect, useState } from 'react';
import { getRoles, getRole, getPermissions, createRole, updateRole, setRolePermissions } from '../../services/settingsApi';

export default function SettingsRolesPage() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    Promise.all([getRoles(), getPermissions()])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const byCategory = permissions.reduce((acc, p) => {
    const cat = p.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <>
      <h3>Roles & Permissions</h3>
      <p className="muted">Manage roles and assign permissions. Permissions are enforced on the backend.</p>
      {error && <p className="settings-msg settings-msg--err">{error}</p>}
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}

      <div className="settings-toolbar">
        <button type="button" onClick={() => setModal({ type: 'add' })}>+ Add Role</button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Description</th>
                <th>System</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr><td colSpan={6} className="settings-empty">No roles. Run seed:settings.</td></tr>
              ) : (
                roles.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td><code>{r.code}</code></td>
                    <td>{r.description || '—'}</td>
                    <td>{r.is_system_role ? 'Yes' : 'No'}</td>
                    <td>{r.is_active !== false ? 'Yes' : 'No'}</td>
                    <td>
                      <button type="button" className="settings-act" onClick={() => setModal({ type: 'edit', role: r })}>Edit</button>
                      <button type="button" className="settings-act" onClick={() => setModal({ type: 'permissions', role: r })}>Permissions</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'add' && (
        <RoleFormModal
          onClose={() => setModal(null)}
          onSaved={() => { setMessage('Role added'); setModal(null); load(); }}
          onError={setError}
        />
      )}
      {modal?.type === 'edit' && modal.role && (
        <RoleFormModal
          role={modal.role}
          onClose={() => setModal(null)}
          onSaved={() => { setMessage('Role updated'); setModal(null); load(); }}
          onError={setError}
        />
      )}
      {modal?.type === 'permissions' && modal.role && (
        <RolePermissionsModal
          role={modal.role}
          permissions={permissions}
          byCategory={byCategory}
          onClose={() => setModal(null)}
          onSaved={() => { setMessage('Permissions saved'); setModal(null); load(); }}
          onError={setError}
        />
      )}

      <style>{`
        .settings-toolbar { margin-bottom: 1rem; }
        .settings-table-wrap { overflow: auto; }
        .settings-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .settings-table th, .settings-table td { border: 1px solid #e5e7eb; padding: 0.4rem 0.6rem; text-align: left; }
        .settings-table th { background: #f9fafb; }
        .settings-empty { color: #6b7280; text-align: center; padding: 1rem !important; }
        .settings-act { margin-right: 0.25rem; padding: 0.2rem 0.4rem; font-size: 0.8rem; cursor: pointer; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
      `}</style>
    </>
  );
}

function RoleFormModal({ role, onClose, onSaved, onError }) {
  const [form, setForm] = useState(role ? { name: role.name, code: role.code, description: role.description || '', is_active: role.is_active !== false } : { name: '', code: '', description: '', is_active: true });
  const [saving, setSaving] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name?.trim()) { onError('Name is required'); return; }
    setSaving(true);
    onError('');
    const promise = role ? updateRole(role.id, form) : createRole(form);
    promise.then(onSaved).catch((e) => { onError(e.message); setSaving(false); });
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>{role ? 'Edit Role' : 'Add Role'}</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="settings-modal-body">
          <label>Name * <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Code <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. manager" disabled={!!role?.is_system_role} /></label>
          <label>Description <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
          {role && <label><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>}
          <div className="settings-modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
      <style>{`
        .settings-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .settings-modal { background: #fff; border-radius: 12px; max-width: 440px; width: 90%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
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

function RolePermissionsModal({ role, permissions, byCategory, onClose, onSaved, onError }) {
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRole(role.id)
      .then((r) => {
        const perms = r.permissions || [];
        const ids = perms.map((p) => (typeof p === 'object' ? p.id : p));
        setSelected(new Set(ids));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [role.id]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleCategory(categoryPerms) {
    const ids = categoryPerms.map((p) => p.id);
    const all = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  function handleSave() {
    setSaving(true);
    onError('');
    setRolePermissions(role.id, Array.from(selected))
      .then(onSaved)
      .catch((e) => { onError(e.message); setSaving(false); });
  }

  if (loading) return <div className="settings-modal-backdrop"><div className="settings-modal"><p>Loading…</p></div></div>;

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal settings-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>Permissions — {role.name}</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="settings-modal-body">
          {Object.entries(byCategory).map(([cat, perms]) => (
            <div key={cat} className="settings-perm-category">
              <div className="settings-perm-cat-header">
                <strong>{cat}</strong>
                <button type="button" className="settings-act" onClick={() => toggleCategory(perms)}>
                  {perms.every((p) => selected.has(p.id)) ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="settings-perm-list">
                {perms.map((p) => (
                  <label key={p.id} className="settings-perm-item">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span>{p.label || p.code}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="settings-modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save permissions'}</button>
          </div>
        </div>
      </div>
      <style>{`
        .settings-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .settings-modal { background: #fff; border-radius: 12px; max-width: 440px; width: 90%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .settings-modal--wide { max-width: 560px; }
        .settings-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; }
        .settings-modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .settings-modal-body { padding: 1rem; }
        .settings-perm-category { margin-bottom: 1rem; }
        .settings-perm-cat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .settings-perm-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .settings-perm-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; cursor: pointer; }
        .settings-modal-footer { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
      `}</style>
    </div>
  );
}
