import { useEffect, useState } from 'react';
import { getLookupGroups, getLookupValues, createLookupValue, updateLookupValue } from '../../services/settingsApi';

export default function SettingsLookupsPage() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    getLookupGroups().then(setGroups).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedGroup) { setValues([]); return; }
    getLookupValues(selectedGroup, !showInactive).then(setValues).catch((e) => setError(e.message));
  }, [selectedGroup, showInactive]);

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <h3>Statuses & Lookup Values</h3>
      <p className="muted">Edit dropdown and status values used across the app. Changes apply without code deploy.</p>
      {error && <p className="settings-msg settings-msg--err">{error}</p>}
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}

      <div className="settings-toolbar">
        <label>Group <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
          <option value="">— Select group —</option>
          {groups.map((g) => <option key={g.id} value={g.key}>{g.label || g.key}</option>)}
        </select></label>
        <label><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
        {selectedGroup && (
          <button type="button" onClick={() => setModal({ type: 'add', groupKey: selectedGroup })}>+ Add value</button>
        )}
      </div>

      {selectedGroup && (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Label</th>
                <th>Color</th>
                <th>Order</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {values.length === 0 ? (
                <tr><td colSpan={6} className="settings-empty">No values. Add one with + Add value.</td></tr>
              ) : (
                values.map((v) => (
                  <tr key={v.id}>
                    <td><code>{v.value_key}</code></td>
                    <td>{v.label}</td>
                    <td>{v.color ? <span className="settings-color-dot" style={{ background: v.color }} title={v.color} /> : '—'}</td>
                    <td>{v.sort_order ?? '—'}</td>
                    <td>{v.is_active !== false ? 'Yes' : 'No'}</td>
                    <td>
                      <button type="button" className="settings-act" onClick={() => setModal({ type: 'edit', groupKey: selectedGroup, value: v })}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'add' && (
        <LookupValueModal
          groupKey={modal.groupKey}
          onClose={() => setModal(null)}
          onSaved={() => { setMessage('Value added'); setModal(null); getLookupValues(selectedGroup, !showInactive).then(setValues); }}
          onError={setError}
        />
      )}
      {modal?.type === 'edit' && modal.value && (
        <LookupValueModal
          groupKey={modal.groupKey}
          value={modal.value}
          onClose={() => setModal(null)}
          onSaved={() => { setMessage('Saved'); setModal(null); getLookupValues(selectedGroup, !showInactive).then(setValues); }}
          onError={setError}
        />
      )}

      <style>{`
        .settings-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
        .settings-table-wrap { overflow: auto; }
        .settings-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .settings-table th, .settings-table td { border: 1px solid #e5e7eb; padding: 0.4rem 0.6rem; text-align: left; }
        .settings-table th { background: #f9fafb; }
        .settings-empty { color: #6b7280; text-align: center; padding: 1rem !important; }
        .settings-color-dot { display: inline-block; width: 14px; height: 14px; border-radius: 50%; border: 1px solid #ccc; }
        .settings-act { margin-right: 0.25rem; padding: 0.2rem 0.4rem; font-size: 0.8rem; cursor: pointer; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
      `}</style>
    </>
  );
}

function LookupValueModal({ groupKey, value, onClose, onSaved, onError }) {
  const [form, setForm] = useState(value ? { value_key: value.value_key, label: value.label || '', color: value.color || '', sort_order: value.sort_order ?? '', is_active: value.is_active !== false } : { value_key: '', label: '', color: '', sort_order: '', is_active: true });
  const [saving, setSaving] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.value_key?.trim() && !value) { onError('Key is required'); return; }
    const key = (form.value_key || value?.value_key || '').trim();
    if (!key) { onError('Key is required'); return; }
    setSaving(true);
    onError('');
    const payload = { value_key: key, label: form.label || key, color: form.color || null, sort_order: form.sort_order === '' ? null : Number(form.sort_order), is_active: form.is_active };
    const promise = value ? updateLookupValue(groupKey, value.id, payload) : createLookupValue(groupKey, payload);
    promise.then(onSaved).catch((e) => { onError(e.message); setSaving(false); });
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h4>{value ? 'Edit lookup value' : 'Add lookup value'} — {groupKey}</h4>
          <button type="button" className="settings-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="settings-modal-body">
          <label>Key * <input value={form.value_key} onChange={(e) => setForm({ ...form, value_key: e.target.value })} required disabled={!!value} placeholder="e.g. active" /></label>
          <label>Label <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Display label" /></label>
          <label>Color <input type="text" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#hex or name" /></label>
          <label>Sort order <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></label>
          <label><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
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
        .settings-modal-body input { padding: 0.4rem; }
        .settings-modal-footer { margin-top: 0.5rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
      `}</style>
    </div>
  );
}
