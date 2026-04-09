import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCreateDocumentTemplates } from '../services/settingsApi.js';
import { getEmployee, listEmployees } from '../services/employeesApi.js';
import { getKenjoEmployeeProfile } from '../services/kenjoApi.js';
import { useAppSettings } from '../context/AppSettingsContext.jsx';

function formatDateNormal(value) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return String(value);
  return `${d}.${m}.${y}`;
}

function employeeLabel(employee) {
  const parts = [employee?.first_name, employee?.last_name].filter(Boolean);
  const fullName = parts.join(' ').trim();
  if (fullName) return fullName;
  return employee?.email || employee?.personal_number || `Employee ${employee?.id ?? ''}`.trim();
}

function buildAddressLine(employeeDetails) {
  const address = employeeDetails?.address || null;
  if (address) {
    const firstLine = [address.streetName, address.houseNumber, address.addressLine1].filter(Boolean).join(' ').trim();
    const secondLine = [address.postalCode || address.zip, address.city].filter(Boolean).join(' ').trim();
    const parts = [firstLine, secondLine, address.country].filter(Boolean);
    if (parts.length) return parts.join(', ');
  }

  const fallback = [
    employeeDetails?.street_name,
    employeeDetails?.house_number,
    employeeDetails?.postal_code,
    employeeDetails?.city,
  ].filter(Boolean);
  return fallback.length ? fallback.join(', ') : '—';
}

export default function CreateDocumentPage() {
  const { isDark } = useAppSettings();
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      listEmployees({ onlyActive: true }),
      getCreateDocumentTemplates(),
    ])
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
      return;
    }
    let cancelled = false;
    setDetailsLoading(true);
    const selectedEmployee = employees.find((row) => String(row.id) === String(selectedEmployeeId));
    const kenjoUserId = String(selectedEmployee?.kenjo_user_id || '').trim();
    const loader = kenjoUserId ? getKenjoEmployeeProfile(kenjoUserId) : getEmployee(selectedEmployeeId);
    loader
      .then((data) => {
        if (!cancelled) setEmployeeDetails(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load employee details');
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

  const employeeAddress = useMemo(() => {
    return buildAddressLine(employeeDetails);
  }, [employeeDetails]);

  const pageStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    background: isDark ? 'linear-gradient(180deg, rgba(7, 18, 35, 0.96), rgba(10, 24, 45, 0.92))' : '#ffffff',
    border: isDark ? '1px solid rgba(132, 162, 214, 0.26)' : undefined,
    boxShadow: isDark ? '0 20px 40px rgba(1, 8, 22, 0.32)' : undefined,
    color: isDark ? '#eaf2ff' : '#111827',
  };
  const panelStyle = {
    border: isDark ? '1px solid rgba(132, 162, 214, 0.24)' : '1px solid var(--border)',
    borderRadius: 14,
    padding: '1rem 1.1rem',
    background: isDark ? 'rgba(9, 21, 39, 0.88)' : '#fff',
    color: isDark ? '#eaf2ff' : '#111827',
    boxShadow: isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'none',
  };
  const altPanelStyle = {
    ...panelStyle,
    background: isDark ? 'rgba(12, 27, 49, 0.82)' : '#f8fafc',
  };
  const statCardStyle = {
    marginTop: '1rem',
    padding: '0.85rem 0.95rem',
    borderRadius: 12,
    background: isDark ? 'rgba(16, 34, 58, 0.92)' : '#f8fafc',
    border: isDark ? '1px solid rgba(132, 162, 214, 0.22)' : '1px solid #dbe2ea',
  };
  const dividerStyle = {
    marginTop: '1rem',
    borderTop: isDark ? '1px solid rgba(132, 162, 214, 0.2)' : '1px solid #dbe2ea',
    paddingTop: '1rem',
  };
  const headingStyle = {
    color: isDark ? '#f8fbff' : '#111827',
  };
  const helperTextStyle = {
    color: isDark ? '#9bb0d1' : '#6b7280',
  };

  return (
    <section className="card" style={pageStyle}>
      <div>
        <h2 style={{ marginBottom: '0.35rem', ...headingStyle }}>Create Document</h2>
        <p className="muted" style={{ margin: 0, maxWidth: '60rem' }}>
          Choose an employee and then choose one of the document templates uploaded in{' '}
          <Link to="/settings/create-documents">Settings → Create Document</Link>. This page now reads those uploaded
          templates directly.
        </p>
      </div>

      {error && (
        <div className="settings-msg settings-msg--err" style={{ maxWidth: '60rem' }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 360px) minmax(280px, 1fr)',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <div style={panelStyle}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <strong>Employee</strong>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              disabled={loading}
              style={{ padding: '0.6rem 0.7rem' }}
            >
              <option value="">Select employee…</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeLabel(employee)}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '1rem' }}>
            <strong>Document template</strong>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={loading || templates.length === 0}
              style={{ padding: '0.6rem 0.7rem' }}
            >
              <option value="">Select document…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <div style={statCardStyle}>
            <div className="muted small">Uploaded templates available</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, ...headingStyle }}>{templates.length}</div>
          </div>
        </div>

        <div style={altPanelStyle}>
          <h3 style={{ marginTop: 0, ...headingStyle }}>Current selection</h3>

          {detailsLoading ? (
            <p className="muted">Loading employee details…</p>
          ) : selectedEmployeeId ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: '0.85rem' }}>
              <div>
                <div className="muted small">Employee</div>
                <div>{employeeLabel(employeeDetails || {})}</div>
              </div>
              <div>
                <div className="muted small">Address</div>
                <div>{employeeAddress}</div>
              </div>
              <div>
                <div className="muted small">Contract start</div>
                <div>{formatDateNormal(employeeDetails?.work?.startDate || employeeDetails?.entry_date || employeeDetails?.start_date)}</div>
              </div>
              <div>
                <div className="muted small">Contract end</div>
                <div>{formatDateNormal(employeeDetails?.work?.contractEnd || employeeDetails?.austrittsdatum || employeeDetails?.contract_end)}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="muted small">Template</div>
                <div>{selectedTemplate ? selectedTemplate.name : 'No template selected yet'}</div>
                {selectedTemplate?.description ? (
                  <p style={{ margin: '0.45rem 0 0' }}>{selectedTemplate.description}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="muted">
              First choose an employee. Then the uploaded templates from Settings will be available here for document
              creation.
            </p>
          )}

          <div style={dividerStyle}>
            <strong>Next step</strong>
            <p style={{ margin: '0.45rem 0 0', ...helperTextStyle }}>
              The page is now connected to the uploaded document templates. The remaining step is the generator itself:
              contract dates, placeholder replacement and automatic file download after pressing <em>Create Document</em>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
