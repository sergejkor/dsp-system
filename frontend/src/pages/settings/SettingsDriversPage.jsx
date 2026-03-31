import { useEffect, useMemo, useState } from 'react';
import { getSettingsByGroup, updateSettingsGroup, resetSettingsGroup } from '../../services/settingsApi';
import {
  normalizeEmployeeDocumentTypeSettings,
  serializeEmployeeDocumentTypeSettings,
} from '../../utils/employeeDocumentTypeSettings';

function createEmptyDocumentType() {
  return {
    type: '',
    exactNameEnabled: false,
    exactNames: [],
    exactNamesText: '',
  };
}

function exactNamesToText(exactNames) {
  return Array.isArray(exactNames) ? exactNames.join('\n') : '';
}

function textToExactNames(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function decorateDocumentTypesForEditing(value) {
  return normalizeEmployeeDocumentTypeSettings(value).map((item) => ({
    ...item,
    exactNamesText: exactNamesToText(item.exactNames),
  }));
}

function normalizeDocumentTypesForSaving(value) {
  return normalizeEmployeeDocumentTypeSettings(
    (Array.isArray(value) ? value : []).map((item) => ({
      type: item?.type,
      exactNameEnabled: item?.exactNameEnabled === true,
      exactNames: textToExactNames(item?.exactNamesText),
    }))
  );
}

const PLACEHOLDER_TOKENS = [
  '{{firstName}}',
  '{{lastName}}',
  '{{suffix}}',
  '{{startDate}}',
  '{{selectedDate}}',
];

export default function SettingsDriversPage() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [documentTypes, setDocumentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadGroup() {
    setLoading(true);
    setError('');
    try {
      const obj = await getSettingsByGroup('drivers');
      setData(obj);
      setDraft(obj);
      setDocumentTypes(decorateDocumentTypesForEditing(obj?.employee_document_types?.value));
    } catch (e) {
      setError(e.message || 'Failed to load driver settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroup();
  }, []);

  const otherItems = useMemo(
    () => Object.entries(draft || {}).filter(([key]) => key !== 'employee_document_types'),
    [draft]
  );
  const serializedCurrentDocumentTypes = useMemo(
    () => serializeEmployeeDocumentTypeSettings(normalizeDocumentTypesForSaving(documentTypes)),
    [documentTypes]
  );
  const serializedSavedDocumentTypes = useMemo(
    () => serializeEmployeeDocumentTypeSettings(data?.employee_document_types?.value),
    [data]
  );
  const hasOtherChanges =
    !!data &&
    otherItems.some(([key, item]) => JSON.stringify(item?.value) !== JSON.stringify(data?.[key]?.value));
  const hasDocumentTypeChanges = serializedCurrentDocumentTypes !== serializedSavedDocumentTypes;
  const hasChanges = hasOtherChanges || hasDocumentTypeChanges;

  function updateDocumentType(index, patch) {
    setDocumentTypes((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  }

  async function handleSave() {
    const payload = {};
    otherItems.forEach(([key, item]) => {
      if (JSON.stringify(item?.value) !== JSON.stringify(data?.[key]?.value)) {
        payload[key] = item?.value;
      }
    });
    if (hasDocumentTypeChanges) {
      payload.employee_document_types = normalizeDocumentTypesForSaving(documentTypes);
    }
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateSettingsGroup('drivers', payload);
      setData(updated);
      setDraft(updated);
      setDocumentTypes(decorateDocumentTypesForEditing(updated?.employee_document_types?.value));
      setMessage('Saved.');
    } catch (e) {
      setError(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await resetSettingsGroup('drivers');
      setData(updated);
      setDraft(updated);
      setDocumentTypes(decorateDocumentTypesForEditing(updated?.employee_document_types?.value));
      setMessage('Reset to defaults.');
    } catch (e) {
      setError(e.message || 'Failed to reset settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading...</p>;
  if (error) return <p className="settings-msg settings-msg--err">{error}</p>;

  return (
    <>
      <h3>Driver Settings</h3>
      <p className="muted">Driver-related rules, onboarding, attendance and employee document upload types.</p>
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}
      {error && <p className="settings-msg settings-msg--err">{error}</p>}

      <section className="settings-section">
        <h4>Employee Page Document Types</h4>
        <p className="muted">
          Control which document types appear on the employee page. If a type needs an exact document name, enable it
          and enter one template per line.
        </p>
        <div className="settings-token-list">
          {PLACEHOLDER_TOKENS.map((token) => (
            <code key={token}>{token}</code>
          ))}
        </div>
        <p className="muted" style={{ marginTop: '0.65rem' }}>
          Example: <code>Arbeitsvertrag_{'{{firstName}}'}_{'{{lastName}}'}_Stand_{'{{startDate}}'}</code>
        </p>

        <div className="driver-doc-type-list">
          {documentTypes.map((item, index) => (
            <div key={`${item.type || 'new'}-${index}`} className="driver-doc-type-card">
              <label className="settings-row settings-row--stack">
                <span className="settings-label">Type of document</span>
                <input
                  type="text"
                  value={item.type}
                  onChange={(e) => updateDocumentType(index, { type: e.target.value })}
                  placeholder="Vertrag"
                />
              </label>

              <label className="settings-row" style={{ alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={item.exactNameEnabled === true}
                  onChange={(e) =>
                    updateDocumentType(index, {
                      exactNameEnabled: e.target.checked,
                      exactNamesText: e.target.checked ? item.exactNamesText : '',
                    })
                  }
                />
                <span className="settings-label" style={{ minWidth: 0 }}>
                  Need exact document name
                </span>
              </label>

              {item.exactNameEnabled ? (
                <label className="settings-row settings-row--stack">
                  <span className="settings-label">Exact document names (one per line)</span>
                  <textarea
                    rows={6}
                    value={item.exactNamesText ?? ''}
                    onChange={(e) => updateDocumentType(index, { exactNamesText: e.target.value })}
                    placeholder="Anmeldung_{{firstName}}_{{lastName}}"
                  />
                </label>
              ) : null}

              <div className="settings-actions">
                <button
                  type="button"
                  onClick={() => setDocumentTypes((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Delete type
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="settings-actions">
          <button type="button" onClick={() => setDocumentTypes((current) => [...current, createEmptyDocumentType()])}>
            Add document type
          </button>
        </div>
      </section>

      {otherItems.length ? (
        <section className="settings-section" style={{ marginTop: '1.25rem' }}>
          <h4>Other Driver Settings</h4>
          <div className="settings-form">
            {otherItems.map(([key, item]) => (
              <label key={key} className="settings-row">
                <span className="settings-label">{item.label || key}</span>
                {item.value_type === 'number' ? (
                  <input
                    type="number"
                    value={item.value ?? ''}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        [key]: {
                          ...item,
                          value: e.target.value === '' ? null : Number(e.target.value),
                        },
                      }))
                    }
                  />
                ) : item.value_type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={!!item.value}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        [key]: {
                          ...item,
                          value: e.target.checked,
                        },
                      }))
                    }
                  />
                ) : (
                  <input
                    type="text"
                    value={item.value ?? ''}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        [key]: {
                          ...item,
                          value: e.target.value,
                        },
                      }))
                    }
                  />
                )}
                {item.unit && <span className="settings-unit">{item.unit}</span>}
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <div className="settings-actions" style={{ marginTop: '1.25rem' }}>
        <button type="button" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={handleReset} disabled={saving}>
          Reset to defaults
        </button>
      </div>

      <style>{`
        .settings-section {
          border: 1px solid #dbe2ea;
          border-radius: 14px;
          padding: 1rem;
          background: #fff;
        }
        .settings-form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 720px; }
        .settings-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .settings-row--stack { display: flex; align-items: stretch; flex-direction: column; gap: 0.35rem; }
        .settings-label { min-width: 220px; font-weight: 600; }
        .settings-row input[type=text], .settings-row input[type=number], .settings-row textarea {
          width: 100%;
          padding: 0.55rem 0.7rem;
          font: inherit;
        }
        .settings-row textarea {
          resize: vertical;
          min-height: 120px;
        }
        .settings-unit { color: #64748b; }
        .settings-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
        .driver-doc-type-list {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          margin-top: 1rem;
        }
        .driver-doc-type-card {
          border: 1px solid #dbe2ea;
          border-radius: 12px;
          padding: 0.9rem;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .settings-token-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 0.75rem;
        }
        .settings-token-list code {
          background: #e5eefc;
          color: #1d4ed8;
          padding: 0.2rem 0.45rem;
          border-radius: 8px;
        }
      `}</style>
    </>
  );
}
