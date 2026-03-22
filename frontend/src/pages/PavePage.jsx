import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getPaveGmailReports,
  getPaveGmailInspectionStats,
  getCarsWithoutPaveInspection,
  syncPaveGmailReports,
  downloadPaveGmailReportFile,
  backfillPaveGmailReports,
} from '../services/paveGmailApi';
import { formatPaveInspectionDate, paveInspectionDateHint } from '../utils/paveInspectionDateDisplay.js';

function formatDate(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 19) : d;
  return s ? s.replace('T', ' ') : '—';
}

/** @param {unknown} a @param {unknown} b @param {'asc'|'desc'} dir */
function sortCompare(a, b, dir) {
  const mul = dir === 'asc' ? 1 : -1;
  const empty = (x) => x == null || x === '';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1 * mul;
  if (empty(b)) return -1 * mul;
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * mul;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * mul;
}

/** @param {object} r @param {string} key */
function rowSortValue(r, key) {
  switch (key) {
    case 'inspection_date':
      return (
        r.inspection_date_effective ??
        r.inspection_date ??
        r.report_date ??
        r.incident_date ??
        r.source_email_received_at ??
        ''
      );
    case 'external_report_id':
      return r.external_report_id ?? '';
    case 'vehicle':
      return r.vehicle_label || r.vehicle_id || r.plate_number || '';
    case 'vin':
      return r.vin_display || r.vin || '';
    case 'fleet_plate':
      return r.matched_license_plate ?? '';
    case 'grade':
      return r.total_grade != null && r.total_grade !== '' ? Number(r.total_grade) : null;
    case 'total_damage_score':
      return r.total_damage_score != null && r.total_damage_score !== '' ? Number(r.total_damage_score) : null;
    case 'front_score':
      return r.front_score != null && r.front_score !== '' ? Number(r.front_score) : null;
    case 'back_score':
      return r.back_score != null && r.back_score !== '' ? Number(r.back_score) : null;
    case 'left_score':
      return r.left_score != null && r.left_score !== '' ? Number(r.left_score) : null;
    case 'right_score':
      return r.right_score != null && r.right_score !== '' ? Number(r.right_score) : null;
    case 'status':
      return r.status ?? '';
    case 'ingest':
      return r.incoming_processing_status ?? '';
    case 'created_at':
      return r.created_at ?? '';
    default:
      return '';
  }
}

function SortableTh({ label, colKey, activeKey, dir, onSort }) {
  const active = activeKey === colKey;
  return (
    <th className="pave-sort-th">
      <button
        type="button"
        className="pave-sort-btn"
        onClick={() => onSort(colKey)}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className="pave-sort-label">{label}</span>
        <span className={`pave-sort-arrows${active ? ' pave-sort-arrows--active' : ''}`} aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}

export default function PavePage() {
  const [searchParams] = useSearchParams();
  const returnKey = searchParams.get('return');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [inspectStats, setInspectStats] = useState(null);
  const [statsError, setStatsError] = useState('');

  const [gmailReports, setGmailReports] = useState([]);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailError, setGmailError] = useState('');
  const [gmailPlate, setGmailPlate] = useState('');
  const [gmailDriver, setGmailDriver] = useState('');
  const [gmailReportType, setGmailReportType] = useState('');
  const [gmailStatus, setGmailStatus] = useState('');
  const [gmailDateFrom, setGmailDateFrom] = useState('');
  const [gmailDateTo, setGmailDateTo] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [backfillDateFrom, setBackfillDateFrom] = useState('');
  const [backfillDateTo, setBackfillDateTo] = useState('');
  const [backfillMaxEmails, setBackfillMaxEmails] = useState(500);
  const [backfillSender, setBackfillSender] = useState('');
  const [backfillSubject, setBackfillSubject] = useState('');
  const [backfillReprocess, setBackfillReprocess] = useState(false);
  const [gmailReprocessSparse, setGmailReprocessSparse] = useState(true);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const [showPendingCars, setShowPendingCars] = useState(false);
  const [pendingCarsPayload, setPendingCarsPayload] = useState(null);
  const [pendingCarsLoading, setPendingCarsLoading] = useState(false);
  const [pendingCarsError, setPendingCarsError] = useState('');

  const sortedGmailReports = useMemo(() => {
    const list = Array.isArray(gmailReports) ? [...gmailReports] : [];
    list.sort((ra, rb) => {
      const va = rowSortValue(ra, sortKey);
      const vb = rowSortValue(rb, sortKey);
      return sortCompare(va, vb, sortDir);
    });
    return list;
  }, [gmailReports, sortKey, sortDir]);

  function handleSortClick(colKey) {
    if (sortKey === colKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(colKey);
      setSortDir(colKey === 'created_at' || colKey === 'inspection_date' ? 'desc' : 'asc');
    }
  }

  function loadStats() {
    setStatsError('');
    getPaveGmailInspectionStats()
      .then(setInspectStats)
      .catch((e) => {
        setInspectStats(null);
        setStatsError(e.message);
      });
  }

  function loadGmail() {
    setGmailLoading(true);
    setGmailError('');
    const filters = {
      plate_number: gmailPlate || undefined,
      driver_name: gmailDriver || undefined,
      report_type: gmailReportType || undefined,
      status: gmailStatus || undefined,
      date_from: gmailDateFrom || undefined,
      date_to: gmailDateTo || undefined,
    };
    getPaveGmailReports(filters)
      .then((list) => setGmailReports(Array.isArray(list) ? list : []))
      .catch((e) => setGmailError(e.message))
      .finally(() => setGmailLoading(false));
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadGmail();
  }, [gmailPlate, gmailDriver, gmailReportType, gmailStatus, gmailDateFrom, gmailDateTo]);

  useEffect(() => {
    if (!showPendingCars) return undefined;
    let cancelled = false;
    setPendingCarsLoading(true);
    setPendingCarsError('');
    getCarsWithoutPaveInspection()
      .then((d) => {
        if (!cancelled) setPendingCarsPayload(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setPendingCarsError(e.message);
          setPendingCarsPayload(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPendingCarsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showPendingCars]);

  function runSync() {
    setAdminBusy(true);
    syncPaveGmailReports({
      limit: gmailReprocessSparse ? 150 : 30,
      force: false,
      reprocessSparse: gmailReprocessSparse,
    })
      .then((r) => {
        const extra = r?.sparseRequeued ? ` (${r.sparseRequeued} incomplete row(s) re-queued)` : '';
        setMessage(`Sync completed${extra}`);
        loadGmail();
        loadStats();
      })
      .catch((e) => setError(e.message))
      .finally(() => setAdminBusy(false));
  }

  function handleBackfill() {
    setAdminBusy(true);
    backfillPaveGmailReports({
      dateFrom: backfillDateFrom || undefined,
      dateTo: backfillDateTo || undefined,
      maxEmails: Number(backfillMaxEmails) || 500,
      provider: 'pave',
      sender: backfillSender.trim() || undefined,
      subjectContains: backfillSubject.trim() || undefined,
      reprocessExisting: backfillReprocess,
    })
      .then((r) => {
        const hint = r.hint ? ` — ${r.hint}` : '';
        const q =
          (r.scanned ?? 0) === 0 && r.gmailQuery
            ? ` [Gmail query: ${r.gmailQuery}]`
            : '';
        setMessage(
          `Backfill done: scanned=${r.scanned ?? 0}, matched=${r.matched ?? 0}, created=${r.created ?? 0}, updated=${r.updated ?? 0}, skipped=${r.skipped ?? 0}, failed=${r.failed ?? 0}${hint}${q}`
        );
        loadGmail();
        loadStats();
      })
      .catch((e) => setError(e.message))
      .finally(() => setAdminBusy(false));
  }

  const s = inspectStats;

  return (
    <section className="card pave-page">
      <h2>PAVE Inspections</h2>
      <p className="muted">
        Condition reports imported from PAVE emails. Fleet plate matches when the last <strong>4</strong> alphanumeric
        VIN characters (masks like <code>*</code> ignored) equal a vehicle in <strong>cars</strong>.
      </p>
      <p className="pave-toolbar" style={{ marginTop: 0 }}>
        <Link to="/pave/new" className="pave-btn pave-btn--primary">+ New PAVE session</Link>
        <Link to="/pave/settings" className="pave-btn">PAVE API settings</Link>
      </p>

      {returnKey && (
        <p className="pave-return-msg">
          Returned from inspection: <strong>{returnKey}</strong>.{' '}
          <Link to="/pave">Open PAVE Inspections</Link> and use filters if needed.
        </p>
      )}
      {error && <p className="pave-msg pave-msg--err">{error}</p>}
      {message && <p className="pave-msg pave-msg--ok">{message}</p>}
      {statsError && <p className="pave-msg pave-msg--err">{statsError}</p>}

      {s && (
        <>
          <div className="pave-kpis">
            <div className="pave-kpi">
              <span className="pave-kpi-val">{s.totalInspections}</span>
              <span className="pave-kpi-lbl">Total inspections</span>
            </div>
            <div className="pave-kpi">
              <span className="pave-kpi-val">{s.inProgress}</span>
              <span className="pave-kpi-lbl">In progress (email)</span>
            </div>
            <div className="pave-kpi">
              <span className="pave-kpi-val">{s.completed}</span>
              <span className="pave-kpi-lbl">Completed (email)</span>
            </div>
            <div className="pave-kpi">
              <span className="pave-kpi-val">{s.expired}</span>
              <span className="pave-kpi-lbl">Expired (email)</span>
            </div>
            <div className="pave-kpi">
              <span className="pave-kpi-val">{s.needsReview}</span>
              <span className="pave-kpi-lbl">Needs review (ingest)</span>
            </div>
            <div className="pave-kpi">
              <span className="pave-kpi-val">{s.damagesFound}</span>
              <span className="pave-kpi-lbl">With damage data</span>
            </div>
            <div className="pave-kpi">
              <span className="pave-kpi-val">{s.avgGrade ?? '—'}</span>
              <span className="pave-kpi-lbl">Avg grade</span>
            </div>
            <div className="pave-kpi">
              <span className="pave-kpi-val">{s.todaysInspections}</span>
              <span className="pave-kpi-lbl">Today</span>
            </div>
          </div>
          <div className="pave-fleet-stats">
            <div className="pave-fleet-stat">
              <strong>{s.totalCarsInDb}</strong>
              <span>Total cars in database</span>
            </div>
            <div className="pave-fleet-stat">
              <strong>{s.inspectionsMatchedToFleet}</strong>
              <span>Inspections matched to fleet (VIN last 4)</span>
            </div>
            <div className="pave-fleet-stat">
              <strong>{s.withGrade}</strong>
              <span>Reports with grade parsed</span>
            </div>
          </div>
        </>
      )}

      <div className="pave-pending-toolbar">
        <button
          type="button"
          className={`pave-btn${showPendingCars ? ' pave-btn--active' : ''}`}
          onClick={() => setShowPendingCars((v) => !v)}
        >
          {showPendingCars ? '▼ Hide' : '▶ Show'} vehicles without PAVE inspection
        </button>
        <span className="muted pave-pending-hint">
          Uses the same <strong>VIN last 4</strong> match as the table; email-imported reports only.
        </span>
      </div>

      {showPendingCars && (
        <div className="pave-pending-panel">
          {pendingCarsLoading && <p className="muted">Loading fleet list…</p>}
          {pendingCarsError && <p className="pave-msg pave-msg--err">{pendingCarsError}</p>}
          {!pendingCarsLoading && !pendingCarsError && pendingCarsPayload && (
            <>
              <h3 className="pave-pending-h3">
                No matching imported report ({pendingCarsPayload.withoutMatchingReport?.length ?? 0})
              </h3>
              <p className="muted small">
                VIN has ≥4 alphanumeric characters in DB, but no row in PAVE inspections matches the last 4 (masked VINs
                on reports count).
              </p>
              <div className="pave-table-wrap">
                <table className="pave-table">
                  <thead>
                    <tr>
                      <th>License plate</th>
                      <th>Vehicle ID</th>
                      <th>VIN</th>
                      <th>Model / year</th>
                      <th>Status</th>
                      <th>Station</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pendingCarsPayload.withoutMatchingReport || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="pave-empty">
                          All fleet vehicles with a usable VIN have at least one matching imported inspection.
                        </td>
                      </tr>
                    ) : (
                      (pendingCarsPayload.withoutMatchingReport || []).map((c) => (
                        <tr key={c.id}>
                          <td><strong>{c.license_plate || '—'}</strong></td>
                          <td>{c.vehicle_id || '—'}</td>
                          <td>{c.vin || '—'}</td>
                          <td>{[c.model, c.year].filter(Boolean).join(' · ') || '—'}</td>
                          <td>{c.status || '—'}</td>
                          <td>{c.station || '—'}</td>
                          <td className="pave-actions">
                            <Link to={`/pave/new?car_id=${c.id}`} className="pave-act">
                              Start PAVE
                            </Link>
                            <Link to="/cars" className="pave-act">
                              Cars
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <h3 className="pave-pending-h3" style={{ marginTop: '1.25rem' }}>
                VIN missing or too short to match ({pendingCarsPayload.withoutVinForMatch?.length ?? 0})
              </h3>
              <p className="muted small">Add a full VIN in <strong>Cars</strong> to match future email reports.</p>
              <div className="pave-table-wrap">
                <table className="pave-table">
                  <thead>
                    <tr>
                      <th>License plate</th>
                      <th>Vehicle ID</th>
                      <th>VIN</th>
                      <th>Model / year</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pendingCarsPayload.withoutVinForMatch || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="pave-empty">No such vehicles.</td>
                      </tr>
                    ) : (
                      (pendingCarsPayload.withoutVinForMatch || []).map((c) => (
                        <tr key={c.id}>
                          <td><strong>{c.license_plate || '—'}</strong></td>
                          <td>{c.vehicle_id || '—'}</td>
                          <td>{c.vin || '—'}</td>
                          <td>{[c.model, c.year].filter(Boolean).join(' · ') || '—'}</td>
                          <td>{c.status || '—'}</td>
                          <td className="pave-actions">
                            <Link to={`/pave/new?car_id=${c.id}`} className="pave-act">
                              Start PAVE
                            </Link>
                            <Link to="/cars" className="pave-act">
                              Cars
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <div className="pave-admin-tools">
        <h3 style={{ marginTop: 0 }}>Admin tools</h3>
        <div className="pave-toolbar">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={gmailReprocessSparse}
              onChange={(e) => setGmailReprocessSparse(e.target.checked)}
            />
            Re-fetch incomplete imports (missing inspection date / VIN / grade in DB)
          </label>
          <button type="button" onClick={runSync} className="pave-btn pave-btn--primary" disabled={adminBusy}>
            {adminBusy ? 'Running…' : 'Sync now'}
          </button>
        </div>
        <div className="pave-toolbar">
          <input type="date" value={backfillDateFrom} onChange={(e) => setBackfillDateFrom(e.target.value)} />
          <input type="date" value={backfillDateTo} onChange={(e) => setBackfillDateTo(e.target.value)} />
          <input
            type="number"
            min={1}
            max={5000}
            value={backfillMaxEmails}
            onChange={(e) => setBackfillMaxEmails(e.target.value)}
            placeholder="Max emails"
            style={{ width: 130 }}
          />
          <input
            type="text"
            value={backfillSender}
            onChange={(e) => setBackfillSender(e.target.value)}
            placeholder="From filter (optional)"
            className="pave-search"
            style={{ width: 220 }}
          />
          <input
            type="text"
            value={backfillSubject}
            onChange={(e) => setBackfillSubject(e.target.value)}
            placeholder="Subject contains (optional)"
            className="pave-search"
            style={{ width: 160 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={backfillReprocess}
              onChange={(e) => setBackfillReprocess(e.target.checked)}
            />
            Reprocess existing
          </label>
          <button type="button" onClick={handleBackfill} className="pave-btn" disabled={adminBusy}>
            {adminBusy ? 'Running…' : 'Run backfill'}
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginBottom: '0.5rem' }}>
        Rows with <strong>(email received)</strong> still lack a parsed inspection date until portal/PDF succeeds.
      </p>

      {gmailError && <p className="pave-msg pave-msg--err">{gmailError}</p>}
      <div className="pave-toolbar">
        <input type="text" placeholder="Plate…" value={gmailPlate} onChange={(e) => setGmailPlate(e.target.value)} className="pave-search" />
        <input type="text" placeholder="Driver…" value={gmailDriver} onChange={(e) => setGmailDriver(e.target.value)} className="pave-search" />
        <input type="text" placeholder="Report type…" value={gmailReportType} onChange={(e) => setGmailReportType(e.target.value)} className="pave-search" />
        <input type="text" placeholder="Status…" value={gmailStatus} onChange={(e) => setGmailStatus(e.target.value)} className="pave-search" />
        <input type="date" value={gmailDateFrom} onChange={(e) => setGmailDateFrom(e.target.value)} />
        <input type="date" value={gmailDateTo} onChange={(e) => setGmailDateTo(e.target.value)} />
        <button type="button" onClick={() => { loadGmail(); loadStats(); }}>Refresh</button>
        <button type="button" onClick={runSync} className="pave-btn pave-btn--primary" disabled={adminBusy}>
          Sync
        </button>
      </div>

      {gmailLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="pave-table-wrap">
          <table className="pave-table">
            <thead>
              <tr>
                <SortableTh label="Inspection date" colKey="inspection_date" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="external_report_id" colKey="external_report_id" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="Vehicle" colKey="vehicle" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="VIN (as on report)" colKey="vin" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="Fleet plate (VIN last 4)" colKey="fleet_plate" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="Grade (1–5)" colKey="grade" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="total_damage_score" colKey="total_damage_score" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="front" colKey="front_score" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="back" colKey="back_score" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="left" colKey="left_score" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="right" colKey="right_score" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="status" colKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="ingest" colKey="ingest" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <SortableTh label="created_at" colKey="created_at" activeKey={sortKey} dir={sortDir} onSort={handleSortClick} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {gmailReports.length === 0 ? (
                <tr><td colSpan={15} className="pave-empty">No imported inspections.</td></tr>
              ) : (
                sortedGmailReports.map((r) => {
                  const dateHint = paveInspectionDateHint(r);
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong title={r.inspection_date_effective ? `effective: ${r.inspection_date_effective}` : undefined}>
                          {formatPaveInspectionDate(
                            r.inspection_date_effective ?? r.inspection_date ?? r.report_date ?? r.incident_date ?? r.source_email_received_at,
                          )}
                        </strong>
                        {dateHint ? (
                          <span className="muted" title="Not from parsed inspection_date on report">
                            {' '}
                            ({dateHint})
                          </span>
                        ) : null}
                      </td>
                      <td>{r.external_report_id || '—'}</td>
                      <td><strong>{r.vehicle_label || r.vehicle_id || r.plate_number || '—'}</strong></td>
                      <td><strong>{r.vin_display || r.vin || '—'}</strong></td>
                      <td>
                        <strong>{r.matched_license_plate || '—'}</strong>
                      </td>
                      <td>
                        <strong>{r.total_grade ?? '—'}</strong>
                        {r.total_grade_label ? <span className="muted"> ({r.total_grade_label})</span> : null}
                      </td>
                      <td>{r.total_damage_score ?? '—'}</td>
                      <td>{r.front_score ?? '—'}</td>
                      <td>{r.back_score ?? '—'}</td>
                      <td>{r.left_score ?? '—'}</td>
                      <td>{r.right_score ?? '—'}</td>
                      <td>{r.status || '—'}</td>
                      <td title={r.incoming_processing_status === 'partial' ? 'See detail page for parsing notes' : ''}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background:
                              r.incoming_processing_status === 'processed'
                                ? '#e8f5e9'
                                : r.incoming_processing_status === 'partial'
                                  ? '#fff3e0'
                                  : r.incoming_processing_status === 'failed'
                                    ? '#ffebee'
                                    : '#f5f5f5',
                          }}
                        >
                          {r.incoming_processing_status || '—'}
                        </span>
                      </td>
                      <td>{formatDate(r.created_at)}</td>
                      <td className="pave-actions">
                        <Link to={`/pave/gmail/${r.id}`} className="pave-act">View</Link>
                        {r.downloaded_file_name && (
                          <button
                            type="button"
                            className="pave-act"
                            onClick={() => downloadPaveGmailReportFile(r.id, r.downloaded_file_name)}
                          >
                            Open file
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .pave-page { max-width: 100%; }
        .pave-return-msg { background: #e3f2fd; padding: 0.5rem; border-radius: 6px; margin-bottom: 0.5rem; }
        .pave-msg { padding: 0.5rem; border-radius: 6px; margin-bottom: 0.5rem; }
        .pave-msg--err { background: #ffebee; color: #b71c1c; }
        .pave-msg--ok { background: #e8f5e9; color: #1b5e20; }
        .pave-kpis { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
        .pave-kpi { background: #f5f5f5; padding: 0.5rem 0.75rem; border-radius: 8px; min-width: 90px; }
        .pave-kpi-val { display: block; font-size: 1.25rem; font-weight: 700; }
        .pave-kpi-lbl { font-size: 0.8rem; color: #666; }
        .pave-fleet-stats {
          display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;
          padding: 0.75rem 1rem; background: #e8eaf6; border-radius: 8px; border: 1px solid #c5cae9;
        }
        .pave-fleet-stat { display: flex; flex-direction: column; gap: 0.15rem; min-width: 160px; }
        .pave-fleet-stat strong { font-size: 1.35rem; }
        .pave-fleet-stat span { font-size: 0.8rem; color: #444; }
        .pave-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
        .pave-search { width: 240px; padding: 0.4rem; }
        .pave-btn { padding: 0.4rem 0.75rem; border-radius: 6px; text-decoration: none; background: #f5f5f5; color: #333; border: 1px solid #ccc; font-size: 0.9rem; display: inline-block; }
        .pave-btn--primary { background: #1976d2; color: #fff; border-color: #1976d2; }
        .pave-btn--active { background: #e3f2fd; border-color: #90caf9; }
        .pave-pending-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
        .pave-pending-hint { font-size: 0.8rem; max-width: 520px; line-height: 1.35; }
        .pave-pending-panel {
          margin-bottom: 1.25rem; padding: 0.75rem 1rem; background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px;
        }
        .pave-pending-h3 { margin: 0 0 0.35rem; font-size: 1rem; }
        .pave-pending-panel .small { font-size: 0.8rem; margin: 0 0 0.5rem; }
        .pave-admin-tools { background: #fafafa; border: 1px solid #ececec; border-radius: 10px; padding: 0.75rem; margin-bottom: 1rem; }
        .pave-table-wrap { overflow: auto; }
        .pave-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .pave-table th, .pave-table td { border: 1px solid #ddd; padding: 0.35rem 0.5rem; text-align: left; }
        .pave-table th { background: #f5f5f5; }
        .pave-sort-th { padding: 0 !important; vertical-align: bottom; }
        .pave-sort-btn {
          display: flex; align-items: center; justify-content: space-between; gap: 0.35rem;
          width: 100%; margin: 0; padding: 0.4rem 0.5rem; border: none; background: transparent;
          font: inherit; text-align: left; cursor: pointer; color: inherit;
        }
        .pave-sort-btn:hover { background: rgba(0,0,0,0.04); }
        .pave-sort-label { flex: 1; min-width: 0; line-height: 1.25; }
        .pave-sort-arrows { flex-shrink: 0; font-size: 0.7rem; opacity: 0.45; width: 1.1em; text-align: center; }
        .pave-sort-arrows--active { opacity: 1; color: #1976d2; font-weight: 700; }
        .pave-empty { text-align: center; color: #666; }
        .pave-link { color: #1976d2; text-decoration: none; }
        .pave-actions { white-space: nowrap; }
        .pave-act { margin-right: 0.25rem; padding: 0.15rem 0.35rem; font-size: 0.75rem; cursor: pointer; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; text-decoration: none; color: #333; }
      `}</style>
    </section>
  );
}
