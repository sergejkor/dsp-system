import { useEffect, useMemo, useState } from 'react';
import { getSettingsByGroup, updateSettingsGroup, resetSettingsGroup } from '../../services/settingsApi';

const PDF_SECTION_TEMPLATES = [
  ['submission', 'Submission', [['submissionId', 'Submission ID'], ['status', 'Status'], ['employeeRef', 'Employee ref']]],
  ['employerFields', 'Employer fields', [['jobTitle', 'Job title'], ['workEmail', 'Work e-mail'], ['startDate', 'Start date'], ['employeeNumber', 'Personal Nr.'], ['workMobile', 'Work Mobile'], ['weeklyHours', 'Weekly hours'], ['probationUntil', 'Probation until'], ['contractEnd', 'Contract end'], ['managerName', 'Manager']]],
  ['identity', 'Identity', [['firstName', 'First name'], ['middleName', 'Middle name'], ['lastName', 'Last name'], ['language', 'Language'], ['taxClass', 'Tax class']]],
  ['personalData', 'Personal data', [['birthdate', 'Birth day'], ['birthPlace', 'Birth place'], ['birthName', 'Birth name'], ['gender', 'Gender'], ['nationality', 'Nationality'], ['maritalStatus', 'Marital status']]],
  ['address', 'Address', [['streetName', 'Street name'], ['houseNumber', 'House number'], ['addressLine2', 'Address line 2'], ['postalCode', 'Postal code'], ['city', 'City'], ['country', 'Country']]],
  ['privateContactFamily', 'Private contact / family', [['privateEmail', 'Private e-mail'], ['personalMobile', 'Personal mobile'], ['childrenCount', 'Children'], ['childrenNames', 'Child names / birth date']]],
  ['financial', 'Financial', [['bankName', 'Bank name'], ['accountHolderName', 'Account holder'], ['iban', 'IBAN'], ['bic', 'BIC'], ['taxId', 'Tax ID'], ['nationalInsuranceNumber', 'SV number'], ['insuranceCompany', 'Insurance company'], ['churchTax', 'Church tax'], ['churchTaxType', 'Church tax type']]],
  ['driverLicense', 'Driver license', [['licenseIssueDate', 'Driving license issue date'], ['licenseExpiryDate', 'Driving license expiry date'], ['licenseAuthority', 'Driving license authority']]],
  ['uniform', 'Uniform', [['jacke', 'Jacke'], ['hose', 'Hose'], ['shirt', 'Shirt'], ['schuhe', 'Schuhe']]],
];

const PDF_SUMMARY_CARD_TEMPLATES = [
  ['language', 'Language'],
  ['taxClass', 'Tax class'],
  ['managerName', 'Manager'],
  ['startDate', 'Start date'],
  ['employeeNumber', 'Personal Nr.'],
  ['workMobile', 'Work mobile'],
];

function createDefaultPdfLayoutSchema() {
  return {
    summaryCards: PDF_SUMMARY_CARD_TEMPLATES.map(([cardId, label]) => ({
      id: cardId,
      sourceCardId: cardId,
      label,
      visible: true,
      isCustom: false,
      manualValue: '',
    })),
    sections: PDF_SECTION_TEMPLATES.map(([sectionId, title, rows]) => ({
      id: sectionId,
      sourceSectionId: sectionId,
      title,
      visible: true,
      isCustom: false,
      rows: rows.map(([rowId, label]) => ({
        id: rowId,
        sourceRowId: rowId,
        label,
        visible: true,
        isCustom: false,
        manualValue: '',
      })),
    })),
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeLayoutSchema(value) {
  const fallback = createDefaultPdfLayoutSchema();
  const summaryCards = Array.isArray(value?.summaryCards) ? value.summaryCards : fallback.summaryCards;
  const sections = Array.isArray(value?.sections) ? value.sections : fallback.sections;
  return {
    summaryCards: summaryCards.map((card, cardIndex) => ({
      id: String(card?.id || `card-${cardIndex + 1}`),
      sourceCardId: card?.sourceCardId || null,
      label: String(card?.label || `Card ${cardIndex + 1}`),
      visible: card?.visible !== false,
      isCustom: card?.isCustom === true,
      manualValue: String(card?.manualValue || ''),
    })),
    sections: sections.map((section, sectionIndex) => ({
      id: String(section?.id || `section-${sectionIndex + 1}`),
      sourceSectionId: section?.sourceSectionId || null,
      title: String(section?.title || `Section ${sectionIndex + 1}`),
      visible: section?.visible !== false,
      isCustom: section?.isCustom === true,
      rows: Array.isArray(section?.rows)
        ? section.rows.map((row, rowIndex) => ({
            id: String(row?.id || `row-${rowIndex + 1}`),
            sourceRowId: row?.sourceRowId || null,
            label: String(row?.label || `Field ${rowIndex + 1}`),
            visible: row?.visible !== false,
            isCustom: row?.isCustom === true,
            manualValue: String(row?.manualValue || ''),
          }))
        : [],
    })),
  };
}

const REQUIRED_ITEMS = {
  notification_emails: { key: 'notification_emails', label: 'Notification e-mail(s)', value_type: 'string', value: '', description: 'Comma-separated e-mail addresses that receive a notification for each new Personalfragebogen submission.' },
  notification_subject: { key: 'notification_subject', label: 'Notification e-mail subject', value_type: 'string', value: 'New Personalfragebogen: {{firstName}} {{lastName}}', description: 'Subject template for the outgoing notification e-mail.' },
  notification_body: { key: 'notification_body', label: 'Notification e-mail text', value_type: 'string', value: 'A new Personalfragebogen has been submitted.\n\nSubmission ID: {{submissionId}}\nName: {{firstName}} {{lastName}}\nEmail: {{email}}\nPhone: {{phone}}\nStart date: {{startDate}}\nReceived at: {{createdAt}}\n\nOpen review page: {{reviewUrl}}', description: 'Body template for the outgoing notification e-mail.' },
  pdf_company_name: { key: 'pdf_company_name', label: 'PDF company name', value_type: 'string', value: 'AlfaMile GmbH', description: 'Company name shown in the Personalfragebogen PDF header.' },
  pdf_title: { key: 'pdf_title', label: 'PDF title', value_type: 'string', value: 'Personalfragebogen', description: 'Main title shown in the Personalfragebogen PDF header.' },
  pdf_font_family: { key: 'pdf_font_family', label: 'PDF font family', value_type: 'string', value: 'Segoe UI', description: 'Canvas font family used when rebuilding the PDF.' },
  pdf_header_title_size: { key: 'pdf_header_title_size', label: 'PDF header title size', value_type: 'number', value: 40, description: 'Font size of the main PDF title.' },
  pdf_body_font_size: { key: 'pdf_body_font_size', label: 'PDF body font size', value_type: 'number', value: 15, description: 'Base font size used in PDF content blocks.' },
  pdf_header_color_start: { key: 'pdf_header_color_start', label: 'PDF header color start', value_type: 'string', value: '#173d7a', description: 'Gradient start color for the PDF header.' },
  pdf_header_color_end: { key: 'pdf_header_color_end', label: 'PDF header color end', value_type: 'string', value: '#2f7ec9', description: 'Gradient end color for the PDF header.' },
  pdf_accent_color: { key: 'pdf_accent_color', label: 'PDF accent color', value_type: 'string', value: '#2f7ec9', description: 'Accent color used for section markers in the PDF.' },
  pdf_layout_schema: { key: 'pdf_layout_schema', label: 'PDF content builder', value_type: 'json', value: createDefaultPdfLayoutSchema(), description: 'Section order, visibility, and manual blocks for the Personalfragebogen PDF.' },
};

const AVAILABLE_VARIABLES = ['{{submissionId}}', '{{firstName}}', '{{lastName}}', '{{fullName}}', '{{email}}', '{{phone}}', '{{startDate}}', '{{contractEnd}}', '{{employeeNumber}}', '{{managerName}}', '{{jobTitle}}', '{{address}}', '{{city}}', '{{country}}', '{{createdAt}}', '{{reviewUrl}}', '{{today}}'];

function withRequiredItems(obj) {
  const base = obj || {};
  const out = { ...base };
  Object.entries(REQUIRED_ITEMS).forEach(([key, fallback]) => {
    if (!out[key]) {
      out[key] = { ...fallback, value: fallback.value_type === 'json' ? deepClone(fallback.value) : fallback.value };
    } else if (fallback.value_type === 'json') {
      out[key] = { ...out[key], value: normalizeLayoutSchema(out[key].value) };
    }
  });
  return out;
}

function moveItem(list, index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SettingsPersonalfragebogenPage() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    getSettingsByGroup('personalfragebogen')
      .then((obj) => {
        const merged = withRequiredItems(obj);
        setData(merged);
        setDraft(merged);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = useMemo(() => data && Object.keys(draft).some((key) => JSON.stringify(draft[key]?.value) !== JSON.stringify(data[key]?.value)), [data, draft]);

  function setItemValue(key, value) {
    setDraft((current) => ({ ...current, [key]: { ...(current[key] || REQUIRED_ITEMS[key]), value } }));
  }

  function updateLayout(mutator) {
    setDraft((current) => {
      const nextLayout = normalizeLayoutSchema(current.pdf_layout_schema?.value);
      const updated = normalizeLayoutSchema(mutator(deepClone(nextLayout)));
      return { ...current, pdf_layout_schema: { ...(current.pdf_layout_schema || REQUIRED_ITEMS.pdf_layout_schema), value: updated } };
    });
  }

  function handleSave() {
    const payload = {};
    Object.entries(draft).forEach(([key, item]) => {
      if (JSON.stringify(item?.value) !== JSON.stringify(data?.[key]?.value)) payload[key] = item?.value;
    });
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    updateSettingsGroup('personalfragebogen', payload)
      .then((updated) => {
        const merged = withRequiredItems(updated);
        setData(merged);
        setDraft(merged);
        setMessage('Personalfragebogen settings saved.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  function handleReset() {
    if (!confirm('Restore default values for Personalfragebogen settings?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    resetSettingsGroup('personalfragebogen')
      .then((updated) => {
        const merged = withRequiredItems(updated);
        setData(merged);
        setDraft(merged);
        setMessage('Defaults restored.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  const layoutSchema = normalizeLayoutSchema(draft.pdf_layout_schema?.value);
  const summaryCards = layoutSchema.summaryCards;
  const layoutSections = layoutSchema.sections;

  if (loading) return <p className="muted">Loading...</p>;
  if (error) return <p className="settings-msg settings-msg--err">{error}</p>;

  return (
    <>
      <h3>Personalfragebogen</h3>
      <p className="muted">Configure notifications and rebuild logic for the Personalfragebogen PDF.</p>
      {message && <p className="settings-msg settings-msg--ok">{message}</p>}
      <div className="settings-form">
        <label className="settings-row settings-row--stack"><span className="settings-label">{draft.notification_emails?.label}</span><input type="text" value={draft.notification_emails?.value ?? ''} placeholder="hr@alfamile.com, office@alfamile.com" onChange={(e) => setItemValue('notification_emails', e.target.value)} disabled={saving} /><small className="muted">{draft.notification_emails?.description}</small></label>
        <label className="settings-row settings-row--stack"><span className="settings-label">{draft.notification_subject?.label}</span><input type="text" value={draft.notification_subject?.value ?? ''} onChange={(e) => setItemValue('notification_subject', e.target.value)} disabled={saving} /><small className="muted">{draft.notification_subject?.description}</small></label>
        <label className="settings-row settings-row--stack"><span className="settings-label">{draft.notification_body?.label}</span><textarea rows={10} value={draft.notification_body?.value ?? ''} onChange={(e) => setItemValue('notification_body', e.target.value)} disabled={saving} /><small className="muted">{draft.notification_body?.description}</small></label>

        <div className="settings-token-box"><strong>Available variables</strong><div className="settings-token-list">{AVAILABLE_VARIABLES.map((token) => <code key={token}>{token}</code>)}</div></div>

        <div className="settings-token-box">
          <strong>Personalfragebogen PDF layout</strong>
          <p className="muted" style={{ marginTop: '0.4rem', marginBottom: '0.8rem' }}>These settings are used when the review page rebuilds and downloads the Personalfragebogen PDF.</p>
          <label className="settings-row settings-row--stack"><span className="settings-label">{draft.pdf_company_name?.label}</span><input type="text" value={draft.pdf_company_name?.value ?? ''} onChange={(e) => setItemValue('pdf_company_name', e.target.value)} disabled={saving} /><small className="muted">{draft.pdf_company_name?.description}</small></label>
          <label className="settings-row settings-row--stack"><span className="settings-label">{draft.pdf_title?.label}</span><input type="text" value={draft.pdf_title?.value ?? ''} onChange={(e) => setItemValue('pdf_title', e.target.value)} disabled={saving} /><small className="muted">{draft.pdf_title?.description}</small></label>
          <label className="settings-row settings-row--stack"><span className="settings-label">{draft.pdf_font_family?.label}</span><input type="text" value={draft.pdf_font_family?.value ?? ''} onChange={(e) => setItemValue('pdf_font_family', e.target.value)} disabled={saving} /><small className="muted">{draft.pdf_font_family?.description}</small></label>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}><span className="settings-label">{draft.pdf_header_title_size?.label}</span><input type="number" min="16" max="72" value={draft.pdf_header_title_size?.value ?? 40} onChange={(e) => setItemValue('pdf_header_title_size', e.target.value)} disabled={saving} /><small className="muted">{draft.pdf_header_title_size?.description}</small></label>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}><span className="settings-label">{draft.pdf_body_font_size?.label}</span><input type="number" min="10" max="28" value={draft.pdf_body_font_size?.value ?? 15} onChange={(e) => setItemValue('pdf_body_font_size', e.target.value)} disabled={saving} /><small className="muted">{draft.pdf_body_font_size?.description}</small></label>
          </div>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}><span className="settings-label">{draft.pdf_header_color_start?.label}</span><input type="text" value={draft.pdf_header_color_start?.value ?? ''} onChange={(e) => setItemValue('pdf_header_color_start', e.target.value)} disabled={saving} /><small className="muted">{draft.pdf_header_color_start?.description}</small></label>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}><span className="settings-label">{draft.pdf_header_color_end?.label}</span><input type="text" value={draft.pdf_header_color_end?.value ?? ''} onChange={(e) => setItemValue('pdf_header_color_end', e.target.value)} disabled={saving} /><small className="muted">{draft.pdf_header_color_end?.description}</small></label>
            <label className="settings-row settings-row--stack" style={{ flex: 1 }}><span className="settings-label">{draft.pdf_accent_color?.label}</span><input type="text" value={draft.pdf_accent_color?.value ?? ''} onChange={(e) => setItemValue('pdf_accent_color', e.target.value)} disabled={saving} /><small className="muted">{draft.pdf_accent_color?.description}</small></label>
          </div>
          <div className="pdf-builder-summary">
            <div><strong>PDF content builder</strong><div className="muted">{layoutSections.filter((section) => section.visible).length} visible blocks, {layoutSections.length} total blocks</div></div>
            <button type="button" onClick={() => setBuilderOpen(true)} disabled={saving}>Open builder</button>
          </div>
        </div>

        <div className="settings-actions"><button type="button" onClick={handleSave} disabled={!hasChanges || saving}>{saving ? 'Saving...' : 'Save'}</button><button type="button" onClick={handleReset} disabled={saving}>Restore defaults</button></div>
      </div>

      {builderOpen && (
        <div className="pdf-builder-modal-backdrop" onClick={() => setBuilderOpen(false)}>
          <div className="pdf-builder-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-builder-modal-header">
              <div><h4 style={{ margin: 0 }}>Personalfragebogen PDF content builder</h4><p className="muted" style={{ margin: '0.35rem 0 0' }}>Reorder blocks, hide fields, rename labels, and add your own manual notes or sections.</p></div>
              <button type="button" className="btn-secondary" onClick={() => setBuilderOpen(false)}>Close</button>
            </div>
            <div className="pdf-builder-toolbar">
              <button type="button" onClick={() => updateLayout((layout) => { layout.summaryCards.push({ id: uid('custom-card'), sourceCardId: null, label: 'Custom card', visible: true, isCustom: true, manualValue: '' }); return layout; })}>Add custom card</button>
              <button type="button" onClick={() => updateLayout((layout) => { layout.sections.push({ id: uid('custom-section'), sourceSectionId: null, title: 'Custom block', visible: true, isCustom: true, rows: [{ id: uid('custom-row'), sourceRowId: null, label: 'Manual text', visible: true, isCustom: true, manualValue: '' }] }); return layout; })}>Add custom block</button>
            </div>
            <div className="pdf-builder-section-card">
              <div className="pdf-builder-section-head">
                <div>
                  <strong>Top summary cards</strong>
                  <div className="muted">These cards are shown under the PDF header, above the first content block.</div>
                </div>
              </div>
              <div className="pdf-builder-row-list">
                {summaryCards.map((card, cardIndex) => (
                  <div className="pdf-builder-row-card" key={card.id}>
                    <label className="pdf-builder-checkbox"><input type="checkbox" checked={card.visible !== false} onChange={(e) => updateLayout((layout) => { layout.summaryCards[cardIndex].visible = e.target.checked; return layout; })} /><span>Visible</span></label>
                    <input type="text" value={card.label} onChange={(e) => updateLayout((layout) => { layout.summaryCards[cardIndex].label = e.target.value; return layout; })} />
                    <div className="pdf-builder-controls">
                      <button type="button" onClick={() => updateLayout((layout) => { layout.summaryCards = moveItem(layout.summaryCards, cardIndex, -1); return layout; })} disabled={cardIndex === 0}>Up</button>
                      <button type="button" onClick={() => updateLayout((layout) => { layout.summaryCards = moveItem(layout.summaryCards, cardIndex, 1); return layout; })} disabled={cardIndex === summaryCards.length - 1}>Down</button>
                      {card.isCustom && <button type="button" className="btn-danger-soft" onClick={() => updateLayout((layout) => { layout.summaryCards.splice(cardIndex, 1); return layout; })}>Delete card</button>}
                    </div>
                    {card.isCustom && <textarea rows={3} value={card.manualValue || ''} placeholder="Write custom card text here. Variables like {{fullName}} or {{address}} are supported." onChange={(e) => updateLayout((layout) => { layout.summaryCards[cardIndex].manualValue = e.target.value; return layout; })} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="pdf-builder-section-list">
              {layoutSections.map((section, sectionIndex) => (
                <div className="pdf-builder-section-card" key={section.id}>
                  <div className="pdf-builder-section-head">
                    <label className="pdf-builder-checkbox"><input type="checkbox" checked={section.visible !== false} onChange={(e) => updateLayout((layout) => { layout.sections[sectionIndex].visible = e.target.checked; return layout; })} /><span>Visible</span></label>
                    <input type="text" value={section.title} onChange={(e) => updateLayout((layout) => { layout.sections[sectionIndex].title = e.target.value; return layout; })} />
                    <div className="pdf-builder-controls">
                      <button type="button" onClick={() => updateLayout((layout) => ({ ...layout, sections: moveItem(layout.sections, sectionIndex, -1) }))} disabled={sectionIndex === 0}>Up</button>
                      <button type="button" onClick={() => updateLayout((layout) => ({ ...layout, sections: moveItem(layout.sections, sectionIndex, 1) }))} disabled={sectionIndex === layoutSections.length - 1}>Down</button>
                      {section.isCustom && <button type="button" className="btn-danger-soft" onClick={() => updateLayout((layout) => { layout.sections.splice(sectionIndex, 1); return layout; })}>Delete block</button>}
                    </div>
                  </div>
                  <div className="pdf-builder-row-list">
                    {section.rows.map((row, rowIndex) => (
                      <div className="pdf-builder-row-card" key={row.id}>
                        <label className="pdf-builder-checkbox"><input type="checkbox" checked={row.visible !== false} onChange={(e) => updateLayout((layout) => { layout.sections[sectionIndex].rows[rowIndex].visible = e.target.checked; return layout; })} /><span>Visible</span></label>
                        <input type="text" value={row.label} onChange={(e) => updateLayout((layout) => { layout.sections[sectionIndex].rows[rowIndex].label = e.target.value; return layout; })} />
                        <div className="pdf-builder-controls">
                          <button type="button" onClick={() => updateLayout((layout) => { layout.sections[sectionIndex].rows = moveItem(layout.sections[sectionIndex].rows, rowIndex, -1); return layout; })} disabled={rowIndex === 0}>Up</button>
                          <button type="button" onClick={() => updateLayout((layout) => { layout.sections[sectionIndex].rows = moveItem(layout.sections[sectionIndex].rows, rowIndex, 1); return layout; })} disabled={rowIndex === section.rows.length - 1}>Down</button>
                          {row.isCustom && <button type="button" className="btn-danger-soft" onClick={() => updateLayout((layout) => { layout.sections[sectionIndex].rows.splice(rowIndex, 1); return layout; })}>Delete row</button>}
                        </div>
                        {row.isCustom && <textarea rows={3} value={row.manualValue || ''} placeholder="Write manual text here. Variables like {{fullName}} or {{address}} are supported." onChange={(e) => updateLayout((layout) => { layout.sections[sectionIndex].rows[rowIndex].manualValue = e.target.value; return layout; })} />}
                      </div>
                    ))}
                  </div>
                  <div className="pdf-builder-section-actions">
                    <button type="button" onClick={() => updateLayout((layout) => { layout.sections[sectionIndex].rows.push({ id: uid('custom-row'), sourceRowId: null, label: 'Manual text', visible: true, isCustom: true, manualValue: '' }); return layout; })}>Add manual row</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="settings-token-box" style={{ marginTop: '1rem' }}><strong>Variables for manual rows</strong><div className="settings-token-list">{AVAILABLE_VARIABLES.map((token) => <code key={token}>{token}</code>)}</div></div>
          </div>
        </div>
      )}

      <style>{`
        .settings-form { display: flex; flex-direction: column; gap: 0.9rem; max-width: 860px; }
        .settings-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .settings-row--stack { align-items: stretch; flex-direction: column; gap: 0.4rem; }
        .settings-label { min-width: 220px; font-size: 0.9rem; font-weight: 600; }
        .settings-row input[type=text], .settings-row input[type=number], .settings-row textarea { width: 100%; min-width: 120px; padding: 0.55rem 0.7rem; font: inherit; }
        .settings-row textarea { resize: vertical; min-height: 180px; }
        .settings-token-box { border: 1px solid #dbe2ea; border-radius: 12px; padding: 0.85rem 1rem; background: #f8fafc; }
        .settings-token-list { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.6rem; }
        .settings-token-list code { background: #e5eefc; color: #1d4ed8; padding: 0.2rem 0.45rem; border-radius: 8px; }
        .settings-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .settings-msg { padding: 0.5rem; border-radius: 6px; }
        .settings-msg--ok { background: #d1fae5; color: #065f46; }
        .settings-msg--err { background: #fee2e2; color: #991b1b; }
        .pdf-builder-summary { margin-top: 0.9rem; display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; padding: 0.8rem 0.95rem; border-radius: 12px; background: #ffffff; border: 1px solid #dbe2ea; }
        .pdf-builder-modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1.5rem; }
        .pdf-builder-modal { width: min(1100px, 100%); max-height: calc(100vh - 3rem); overflow: auto; background: #fff; border-radius: 20px; padding: 1.2rem; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28); }
        .pdf-builder-modal-header, .pdf-builder-toolbar, .pdf-builder-section-head, .pdf-builder-controls, .pdf-builder-section-actions { display: flex; gap: 0.6rem; align-items: center; justify-content: space-between; }
        .pdf-builder-toolbar { margin: 1rem 0; justify-content: flex-start; }
        .pdf-builder-section-list { display: flex; flex-direction: column; gap: 1rem; }
        .pdf-builder-section-card { border: 1px solid #dbe2ea; border-radius: 16px; padding: 0.95rem; background: #f8fafc; }
        .pdf-builder-section-head input[type=text] { flex: 1; min-width: 220px; }
        .pdf-builder-row-list { display: flex; flex-direction: column; gap: 0.7rem; margin-top: 0.9rem; }
        .pdf-builder-row-card { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.75rem; border-radius: 12px; background: #ffffff; border: 1px solid #e2e8f0; }
        .pdf-builder-row-card input[type=text], .pdf-builder-row-card textarea { width: 100%; }
        .pdf-builder-checkbox { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.92rem; font-weight: 600; }
        .btn-danger-soft { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
      `}</style>
    </>
  );
}
