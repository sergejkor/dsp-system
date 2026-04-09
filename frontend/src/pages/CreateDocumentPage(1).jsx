import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCreateDocumentTemplates, generateCreateDocument } from '../services/settingsApi.js';
import { getEmployee, listEmployees } from '../services/employeesApi.js';
import { getKenjoEmployeeProfile, getKenjoUsers } from '../services/kenjoApi.js';

function formatDateNormal(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return String(value);
  return `${d}.${m}.${y}`;
}

function toDateInputValue(value) {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function employeeLabel(employee) {
  const fullName = [employee?.first_name || employee?.firstName, employee?.last_name || employee?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fullName) return fullName;
  return (
    employee?.display_name ||
    employee?.displayName ||
    employee?.email ||
    employee?.personal_number ||
    `Employee ${employee?.id ?? ''}`.trim()
  );
}

function formatFileNamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildAddressParts(employeeDetails) {
  const address = employeeDetails?.address || null;
  if (address) {
    return {
      street: String(address.streetName || address.street || '').trim(),
      houseNumber: String(address.houseNumber || '').trim(),
      postalCode: String(address.postalCode || address.zip || '').trim(),
      city: String(address.city || '').trim(),
      country: String(address.country || '').trim(),
      addressLine1: String(address.addressLine1 || address.additionalAddress || '').trim(),
    };
  }
  return {
    street: String(employeeDetails?.street_name || '').trim(),
    houseNumber: String(employeeDetails?.house_number || '').trim(),
    postalCode: String(employeeDetails?.postal_code || '').trim(),
    city: String(employeeDetails?.city || '').trim(),
    country: String(employeeDetails?.country || '').trim(),
    addressLine1: '',
  };
}

function buildAddressLine(employeeDetails) {
  const parts = buildAddressParts(employeeDetails);
  const firstLine = [parts.street, parts.houseNumber, parts.addressLine1].filter(Boolean).join(' ').trim();
  const secondLine = [parts.postalCode, parts.city].filter(Boolean).join(' ').trim();
  const lines = [firstLine, secondLine, parts.country].filter(Boolean);
  return lines.length ? lines.join(', ') : '-';
}

function templateSupportsGeneration(template) {
  const fileName = String(template?.file_name || '').toLowerCase();
  const mimeType = String(template?.mime_type || '').toLowerCase();
  return (
    fileName.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

function triggerDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'generated-document.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function normalizeLookupValue(value) {
  return String(value || '').trim().toLowerCase();
}

function findKenjoMatch(selectedEmployee, kenjoUsers) {
  const wantedEmail = normalizeLookupValue(selectedEmployee?.email);
  const wantedPn = normalizeLookupValue(selectedEmployee?.pn || selectedEmployee?.employee_id);
  const wantedName = normalizeLookupValue(
    selectedEmployee?.display_name ||
    [selectedEmployee?.first_name, selectedEmployee?.last_name].filter(Boolean).join(' ')
  );

  return (kenjoUsers || []).find((user) => {
    const userEmail = normalizeLookupValue(user?.email);
    const userEmployeeNumber = normalizeLookupValue(user?.employeeNumber);
    const userTransporterId = normalizeLookupValue(user?.transportationId);
    const userName = normalizeLookupValue(
      user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    );

    if (wantedEmail && userEmail && wantedEmail === userEmail) return true;
    if (wantedPn && userEmployeeNumber && wantedPn === userEmployeeNumber) return true;
    if (wantedPn && userTransporterId && wantedPn === userTransporterId) return true;
    if (wantedName && userName && wantedName === userName) return true;
    return false;
  }) || null;
}

export default function CreateDocumentPage() {
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [contractFrom, setContractFrom] = useState('');
  const [contractTo, setContractTo] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([listEmployees({ onlyActive: true }), getCreateDocumentTemplates()])
      .then(([employeeRows, templateRows]) => {
        if (cancelled) return;
        setEmployees(Array.isArray(employeeRows) ? employeeRows : []);
        setTemplates(Array.isArray(templateRows) ? templateRows : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load Create Document data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setEmployeeDetails(null);
      setContractFrom('');
      setContractTo('');
      return;
    }
    let cancelled = false;
    setDetailsLoading(true);
    setError('');
    const selectedEmployee = employees.find((row) => String(row.id) === String(selectedEmployeeId));
    const kenjoUserId = String(selectedEmployee?.kenjo_user_id || '').trim();
    const loadEmployeeDetails = async () => {
      const localData = await getEmployee(selectedEmployeeId);
      if (kenjoUserId) {
        const kenjoProfile = await getKenjoEmployeeProfile(kenjoUserId);
        return { ...localData, ...kenjoProfile };
      }
      const kenjoUsers = await getKenjoUsers().catch(() => []);
      const match = findKenjoMatch(selectedEmployee || localData, kenjoUsers);
      if (match?._id) {
        const kenjoProfile = await getKenjoEmployeeProfile(match._id);
        return { ...localData, ...kenjoProfile };
      }
      return localData;
    };

    loadEmployeeDetails()
      .then((data) => {
        if (cancelled) return;
        setEmployeeDetails(data);
        setContractFrom(toDateInputValue(data?.work?.startDate || data?.entry_date || data?.start_date));
        setContractTo(toDateInputValue(data?.work?.contractEnd || data?.austrittsdatum || data?.contract_end));
      })
      .catch((e) => {
        if (!cancelled) {
          setEmployeeDetails(null);
          setError(e.message || 'Failed to load employee details');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEmployeeId, employees]);

  const selectedTemplate = useMemo(
    () => templates.find((row) => String(row.id) === String(selectedTemplateId)) || null,
    [templates, selectedTemplateId]
  );

  const selectedEmployee = useMemo(
    () => employees.find((row) => String(row.id) === String(selectedEmployeeId)) || null,
    [employees, selectedEmployeeId]
  );

  const employeeAddress = useMemo(() => buildAddressLine(employeeDetails), [employeeDetails]);
  const addressParts = useMemo(() => buildAddressParts(employeeDetails), [employeeDetails]);

  const previewData = useMemo(() => {
    const firstName = String(
      employeeDetails?.firstName ||
      employeeDetails?.first_name ||
      selectedEmployee?.first_name ||
      selectedEmployee?.firstName ||
      ''
    ).trim();
    const lastName = String(
      employeeDetails?.lastName ||
      employeeDetails?.last_name ||
      selectedEmployee?.last_name ||
      selectedEmployee?.lastName ||
      ''
    ).trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const email = String(employeeDetails?.email || employeeDetails?.account?.email || selectedEmployee?.email || '').trim();
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return {
      firstName,
      lastName,
      fullName,
      email,
      addressLine: employeeAddress,
      street: addressParts.street,
      houseNumber: addressParts.houseNumber,
      postalCode: addressParts.postalCode,
      city: addressParts.city,
      country: addressParts.country,
      contractFrom,
      contractTo,
      todayIso,
    };
  }, [employeeAddress, addressParts, contractFrom, contractTo, employeeDetails, selectedEmployee]);

  const needsManualDates = selectedTemplate?.requires_manual_dates === true;
  const effectiveContractFrom = needsManualDates
    ? contractFrom
    : toDateInputValue(employeeDetails?.work?.startDate || employeeDetails?.entry_date || employeeDetails?.start_date);
  const effectiveContractTo = needsManualDates
    ? contractTo
    : toDateInputValue(employeeDetails?.work?.contractEnd || employeeDetails?.austrittsdatum || employeeDetails?.contract_end);
  const canCreate = !!selectedEmployeeId && !!selectedTemplateId && !!effectiveContractFrom && !!effectiveContractTo && !creating;
  const selectedTemplateIsSupported = !selectedTemplate || templateSupportsGeneration(selectedTemplate);

  async function handleCreateDocument() {
    if (!canCreate) return;
    if (!selectedTemplateIsSupported) {
      setError('Only DOCX templates can be generated. Please upload a DOCX sample in Settings.');
      return;
    }
    if (effectiveContractTo && effectiveContractFrom && effectiveContractTo < effectiveContractFrom) {
      setError('Contract end must be on or after contract start.');
      return;
    }

    setCreating(true);
    setError('');
    setMessage('');
    try {
      const replacements = {
        firstName: previewData.firstName,
        lastName: previewData.lastName,
        fullName: previewData.fullName,
        employeeName: previewData.fullName,
        email: previewData.email,
        address: previewData.addressLine,
        street: previewData.street,
        houseNumber: previewData.houseNumber,
        postalCode: previewData.postalCode,
        city: previewData.city,
        country: previewData.country,
        contractStart: formatDateNormal(effectiveContractFrom),
        contractFrom: formatDateNormal(effectiveContractFrom),
        contractEnd: formatDateNormal(effectiveContractTo),
        contractTo: formatDateNormal(effectiveContractTo),
        today: formatDateNormal(previewData.todayIso),
      };

      const fileNameBase = [
        selectedTemplate?.document_key || selectedTemplate?.name || 'document',
        formatFileNamePart(previewData.firstName),
        formatFileNamePart(previewData.lastName),
      ].filter(Boolean).join('_');

      const generated = await generateCreateDocument({
        templateId: selectedTemplateId,
        replacements,
        fileName: `${fileNameBase || 'generated-document'}.docx`,
      });

      triggerDownload(generated.blob, generated.fileName);
      setMessage('Document created and downloaded.');
    } catch (e) {
      setError(e.message || 'Failed to create document');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ marginBottom: '0.35rem' }}>Create Document</h2>
        <p className="muted" style={{ margin: 0, maxWidth: '64rem' }}>
          Choose an employee, choose one of the uploaded DOCX templates from{' '}
          <Link to="/settings/create-documents">Settings - Create Document</Link>, check the contract dates and create
          a ready-to-download file with the employee data already filled in.
        </p>
      </div>

      {message ? <div className="settings-msg settings-msg--ok">{message}</div> : null}
      {error ? <div className="settings-msg settings-msg--err">{error}</div> : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 380px) minmax(320px, 1fr)',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '1rem 1.1rem',
            background: '#fff',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <strong>Employee</strong>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              disabled={loading}
              style={{ padding: '0.65rem 0.75rem' }}
            >
              <option value="">Select employee...</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeLabel(employee)}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '1rem' }}>
            <strong>Document template</strong>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={loading || templates.length === 0}
              style={{ padding: '0.65rem 0.75rem' }}
            >
              <option value="">Select document...</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          {needsManualDates ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginTop: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <strong>From</strong>
                <input type="date" value={contractFrom} onChange={(e) => setContractFrom(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <strong>To</strong>
                <input type="date" value={contractTo} onChange={(e) => setContractTo(e.target.value)} />
              </label>
            </div>
          ) : (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.85rem 0.95rem',
                borderRadius: 12,
                background: '#f8fafc',
                border: '1px solid #dbe2ea',
              }}
            >
              <div className="muted small">Dates source</div>
              <div style={{ marginTop: '0.35rem' }}>This template uses contract dates automatically from the employee profile.</div>
            </div>
          )}

          {!selectedTemplateIsSupported ? (
            <div className="settings-msg settings-msg--err" style={{ marginTop: '1rem' }}>
              This template file is not a DOCX file. Upload a DOCX sample in Settings to generate documents.
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleCreateDocument}
            disabled={!canCreate || !selectedTemplateIsSupported}
            style={{ marginTop: '1rem', width: '100%' }}
          >
            {creating ? 'Creating document...' : 'Create Document'}
          </button>

          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 0.95rem',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #dbe2ea',
            }}
          >
            <div className="muted small">Uploaded templates available</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{templates.length}</div>
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '1rem 1.1rem',
            background: '#f8fafc',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Current selection</h3>

          {detailsLoading ? (
            <p className="muted">Loading employee details...</p>
          ) : selectedEmployeeId ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: '0.85rem' }}>
                <div>
                  <div className="muted small">Employee</div>
                  <div>{previewData.fullName || employeeLabel(selectedEmployee || {})}</div>
                </div>
                <div>
                  <div className="muted small">Address</div>
                  <div>{previewData.addressLine}</div>
                </div>
                <div>
                  <div className="muted small">Contract start</div>
                  <div>{formatDateNormal(effectiveContractFrom)}</div>
                </div>
                <div>
                  <div className="muted small">Contract end</div>
                  <div>{formatDateNormal(effectiveContractTo)}</div>
                </div>
                <div>
                  <div className="muted small">Today</div>
                  <div>{formatDateNormal(previewData.todayIso)}</div>
                </div>
                <div>
                  <div className="muted small">Template</div>
                  <div>{selectedTemplate ? selectedTemplate.name : 'No template selected yet'}</div>
                </div>
              </div>

              {selectedTemplate?.description ? (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.85rem 0.95rem',
                    borderRadius: 12,
                    background: '#fff',
                    border: '1px solid #dbe2ea',
                  }}
                >
                  <div className="muted small">Template notes</div>
                  <div style={{ marginTop: '0.35rem' }}>{selectedTemplate.description}</div>
                </div>
              ) : null}

              <div
                style={{
                  marginTop: '1rem',
                  borderTop: '1px solid #dbe2ea',
                  paddingTop: '1rem',
                }}
              >
                <strong>Used placeholders</strong>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.45rem',
                    marginTop: '0.65rem',
                  }}
                >
                  {[
                    '{{fullName}}',
                    '{{address}}',
                    '{{street}}',
                    '{{houseNumber}}',
                    '{{postalCode}}',
                    '{{city}}',
                    '{{contractStart}}',
                    '{{contractEnd}}',
                    '{{today}}',
                  ].map((token) => (
                    <code key={token} style={{ background: '#e5eefc', color: '#1d4ed8', padding: '0.2rem 0.45rem', borderRadius: 8 }}>
                      {token}
                    </code>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="muted">
              First choose an employee. Then choose one of the uploaded templates and the page will prepare the ready
              values for document generation.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
