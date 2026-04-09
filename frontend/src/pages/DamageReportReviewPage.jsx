import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DamageReportForm, { createEmptyDamageReport } from '../components/DamageReportForm.jsx';
import {
  addDamageReportToDamages,
  downloadDamageReportFile,
  getDamageReport,
  listDamageReports,
  markDamageReportUnread,
  updateDamageReport,
  uploadDamageReportFiles,
} from '../services/intakeApi.js';

function displayName(row) {
  return row?.driver_name || row?.reporter_name || `Damage report ${row?.id}`;
}

function normalizePayload(payload) {
  const normalized = { ...createEmptyDamageReport(), ...(payload || {}) };
  if (String(normalized.descriptionDe || '').trim()) {
    normalized.description = normalized.descriptionDe;
  }
  return normalized;
}

async function translateDescriptionToGerman(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  try {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: 'de',
      dt: 't',
      q: source,
    });
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`);
    if (!response.ok) return source;
    const data = await response.json().catch(() => null);
    const parts = Array.isArray(data?.[0]) ? data[0] : [];
    const translated = parts
      .map((part) => (Array.isArray(part) ? String(part[0] || '') : ''))
      .join('')
      .trim();
    return translated || source;
  } catch {
    return source;
  }
}

const REVIEW_COPY_DE = {
  driverVehicleSection: 'Fahrer & Fahrzeug',
  driverLabel: 'Fahrer',
  driverPlaceholder: 'Fahrer wählen',
  vehicleLabel: 'Fahrzeug (Kennzeichen)',
  vehiclePlaceholder: 'Kennzeichen wählen',
  rentalCar: 'Mietwagen',
  rentalCarLicensePlate: 'Kennzeichen vom Mietwagen',
  accidentSection: 'Unfall',
  accidentTypeLabel: 'Unfallart',
  accidentWithAnotherCar: 'Unfall mit anderem Fahrzeug',
  accidentWithoutOtherCar: 'Unfall ohne anderes Fahrzeug',
  thirdPartyPropertyDamaged: 'Fremdes Eigentum beschädigt?',
  ownerFirstName: 'Vorname Eigentümer',
  ownerLastName: 'Nachname Eigentümer',
  ownerPhone: 'Kontakt Telefon',
  ownerEmail: 'Kontakt E-Mail',
  opponentName: 'Unfallgegner Name',
  opponentEmail: 'Unfallgegner E-Mail',
  opponentPhone: 'Unfallgegner Telefon',
  opponentInsurance: 'Versicherung Unfallgegner',
  selectInsurance: 'Versicherung wählen',
  opponentInsuranceOther: 'Bitte Versicherungsname angeben',
  opponentInsuranceNumber: 'Versicherungsnummer Unfallgegner',
  incidentDate: 'Unfalldatum',
  incidentTime: 'Unfallzeit',
  location: 'Ort',
  locationPlaceholder: 'Adresse suchen oder manuell eingeben',
  useCurrentLocation: 'Aktuellen Standort verwenden',
  locating: 'Standort wird ermittelt...',
  searching: 'Suche...',
  noAddresses: 'Keine Adressen gefunden',
  street: 'Straße',
  houseNumber: 'Hausnummer',
  zipCode: 'PLZ',
  city: 'Stadt',
  policeOnSite: 'War die Polizei vor Ort?',
  policeStation: 'Polizeidienststelle',
  yes: 'Ja',
  no: 'Nein',
  description: 'Beschreibung',
  descriptionPlaceholder: 'Beschreibung (automatisch auf Deutsch übersetzt).',
  witnesses: 'Zeugen',
  witnessName: 'Zeuge Vorname',
  witnessSurname: 'Zeuge Nachname',
  witnessPhone: 'Zeuge Telefon',
  witnessEmail: 'Zeuge E-Mail',
};

export default function DamageReportReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(createEmptyDamageReport());
  const [status, setStatus] = useState('reviewing');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [markingUnread, setMarkingUnread] = useState(false);
  const [addingToDamages, setAddingToDamages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [translatedForId, setTranslatedForId] = useState(null);

  async function loadList(nextStatus = statusFilter) {
    setLoading(true);
    try {
      const list = await listDamageReports(nextStatus);
      setRows(Array.isArray(list) ? list : []);
      const requestedId = searchParams.get('id');
      if (requestedId && list.some((row) => Number(row.id) === Number(requestedId))) {
        setSelectedId(requestedId);
      } else if (!selectedId && list?.length) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load damage reports');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id) {
    if (!id) return;
    try {
      const data = await getDamageReport(id);
      setDetail(data);
      const normalized = normalizePayload(data?.payload);
      setForm(normalized);
      setStatus(data?.status || 'reviewing');
      const source = String(data?.payload?.description || '').trim();
      const german = String(data?.payload?.descriptionDe || '').trim();
      const needsUiFallbackTranslation =
        source &&
        (!german || german === source) &&
        Number(id) !== Number(translatedForId);
      if (needsUiFallbackTranslation) {
        const translated = await translateDescriptionToGerman(source);
        setForm((prev) => ({
          ...(prev || normalized),
          description: translated || source,
        }));
        setTranslatedForId(Number(id));
      }
    } catch (err) {
      setError(err?.message || 'Failed to load damage report');
    }
  }

  useEffect(() => {
    loadList('all');
  }, []);

  useEffect(() => {
    const requestedId = searchParams.get('id');
    if (!requestedId) return;
    setSelectedId(requestedId);
  }, [searchParams]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  const selectedRow = useMemo(
    () => rows.find((row) => Number(row.id) === Number(selectedId)) || detail,
    [rows, selectedId, detail]
  );

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateDamageReport(selectedId, form, status);
      setDetail((prev) => ({ ...(prev || {}), ...updated, payload: normalizePayload(updated?.payload || form) }));
      setRows((prev) => prev.map((row) => (row.id === selectedId ? { ...row, ...updated } : row)));
      setMessage('Damage report saved.');
    } catch (err) {
      setError(err?.message || 'Failed to save damage report');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || !selectedId) return;
    setUploading(true);
    setError('');
    try {
      await uploadDamageReportFiles(selectedId, files);
      await loadDetail(selectedId);
      setMessage(`Uploaded ${files.length} file(s).`);
    } catch (err) {
      setError(err?.message || 'Failed to upload files');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleUnread() {
    if (!selectedId) return;
    setMarkingUnread(true);
    setError('');
    setMessage('');
    try {
      const unreadId = Number(selectedId);
      await markDamageReportUnread(unreadId);
      const nextRows = await listDamageReports(statusFilter);
      setRows(Array.isArray(nextRows) ? nextRows : []);
      setSelectedId(null);
      setDetail(null);
      setForm(createEmptyDamageReport());
      setSearchParams({});
      setMessage('Damage report marked as unread.');
    } catch (err) {
      setError(err?.message || 'Failed to mark damage report as unread');
    } finally {
      setMarkingUnread(false);
    }
  }

  async function handleAddToDamages() {
    if (!selectedId) return;
    setAddingToDamages(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateDamageReport(selectedId, form, status);
      setDetail((prev) => ({ ...(prev || {}), ...updated, payload: normalizePayload(updated?.payload || form) }));
      setRows((prev) => prev.map((row) => (row.id === selectedId ? { ...row, ...updated } : row)));

      const result = await addDamageReportToDamages(selectedId);
      const copiedFiles = Number(result?.copiedFiles || 0);
      const damageId = result?.damage?.id;
      if (result?.created) {
        setMessage(
          `Added to damages${damageId ? ` as case #${damageId}` : ''}${copiedFiles ? ` and copied ${copiedFiles} attachment(s)` : ''}.`
        );
      } else {
        setMessage(
          `This damage report is already in damages${damageId ? ` as case #${damageId}` : ''}.`
        );
      }
    } catch (err) {
      setError(err?.message || 'Failed to add damage report to damages');
    } finally {
      setAddingToDamages(false);
    }
  }

  return (
    <section className="intake-page">
      <header className="analytics-header">
        <div>
          <h1>Schadenmeldung Review</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Review public damage reports and keep their internal processing status up to date.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <label className="public-form-field" style={{ minWidth: 180 }}>
            <span>Status</span>
            <select
              className="public-form-control"
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStatusFilter(next);
                loadList(next);
              }}
            >
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="reviewing">Reviewing</option>
              <option value="error">Error</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </div>
      </header>

      {error && <div className="analytics-error">{error}</div>}
      {message && <div className="cars-message cars-message--success">{message}</div>}

      <div className="intake-layout">
        <aside className="intake-sidebar">
          {loading ? (
            <p className="muted">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="muted">No damage reports yet.</p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`intake-list-item ${Number(selectedId) === Number(row.id) ? 'is-active' : ''} ${row.is_new ? 'is-new' : ''}`}
                onClick={() => {
                  setSelectedId(row.id);
                  setSearchParams({ id: String(row.id) });
                }}
              >
                <div className="intake-list-item-title-row">
                  {row.is_new && <span className="notification-new-dot" aria-hidden="true" />}
                  <strong>{displayName(row)}</strong>
                </div>
                <span>{row.status}</span>
                <span>{row.license_plate || 'No plate'}</span>
              </button>
            ))
          )}
        </aside>

        <div className="intake-detail">
          {!selectedRow ? (
            <div className="card"><p className="muted">Select a damage report.</p></div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="intake-detail-header">
                  <div>
                    <h2 style={{ marginBottom: '0.35rem' }}>{displayName(selectedRow)}</h2>
                    <p className="muted small" style={{ margin: 0 }}>
                      Report #{selectedRow.id}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'end' }}>
                    <label className="public-form-field" style={{ minWidth: 180 }}>
                      <span>Processing status</span>
                      <select className="public-form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="submitted">Submitted</option>
                        <option value="reviewing">Reviewing</option>
                        <option value="error">Error</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={saving || markingUnread || addingToDamages || uploading}
                      onClick={handleAddToDamages}
                    >
                      {addingToDamages ? 'Adding...' : 'Add to damages'}
                    </button>
                    <button type="button" className="btn-primary" disabled={saving || markingUnread || addingToDamages} onClick={handleSave}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" className="btn-secondary" disabled={saving || markingUnread || addingToDamages || uploading} onClick={handleUnread}>
                      {markingUnread ? 'Working...' : 'Unread'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <DamageReportForm value={form} onChange={setForm} disabled={saving} copy={REVIEW_COPY_DE} />
              </div>

              <div className="card">
                <div className="intake-detail-header">
                  <div>
                    <h3 style={{ marginBottom: '0.35rem' }}>Attachments</h3>
                    <p className="muted small" style={{ margin: 0 }}>
                      Public files and any additional internal files for this report.
                    </p>
                  </div>
                  <label className="btn-secondary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                    {uploading ? 'Uploading...' : 'Add files'}
                    <input type="file" multiple hidden disabled={uploading} onChange={handleFileUpload} />
                  </label>
                </div>
                <div className="intake-files">
                  {(detail?.files || []).length === 0 ? (
                    <p className="muted">No files uploaded yet.</p>
                  ) : (
                    detail.files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="intake-file-row"
                        onClick={() => downloadDamageReportFile(selectedId, file.id, file.file_name)}
                      >
                        <span>{file.file_name}</span>
                        <span>{file.source_kind}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
