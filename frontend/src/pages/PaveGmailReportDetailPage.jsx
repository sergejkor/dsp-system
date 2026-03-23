import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAuthHeaders } from '../services/authStore.js';
import { downloadPaveGmailReportFile, getPavePortalCredentials } from '../services/paveGmailApi.js';
import { formatPaveInspectionDate, paveInspectionDateHint } from '../utils/paveInspectionDateDisplay.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function fmtDate(d) {
  return formatPaveInspectionDate(d);
}

/** PAVE login uses input[name=username|password] — same as server-side Playwright. */
function buildPortalFillBookmarklet(username, password) {
  const u = JSON.stringify(String(username ?? ''));
  const p = JSON.stringify(String(password ?? ''));
  return `javascript:(function(){var u=${u},p=${p};var iu=document.querySelector('input[name="username"]'),ip=document.querySelector('input[name="password"]');if(iu){iu.value=u;iu.dispatchEvent(new Event('input',{bubbles:true}));}if(ip){ip.value=p;ip.dispatchEvent(new Event('input',{bubbles:true}));}})();`;
}

export default function PaveGmailReportDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [portalMsg, setPortalMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/pave/gmail/reports/${id}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j?.error || 'Failed to load');
        setData(j);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <section className="card pave-page"><p className="muted">Loading…</p></section>;
  if (error) return <section className="card pave-page"><p className="pave-msg pave-msg--err">{error}</p><Link to="/pave">Back</Link></section>;
  if (!data?.report) return <section className="card pave-page"><p className="muted">Not found</p><Link to="/pave">Back</Link></section>;

  const { report, incomingEmail, downloadedReport, items } = data;
  const inspectionDateHint = paveInspectionDateHint({
    ...report,
    source_email_received_at: incomingEmail?.received_at,
  });
  const rawPayload =
    report.raw_extracted_payload && typeof report.raw_extracted_payload === 'string'
      ? (() => {
          try {
            return JSON.parse(report.raw_extracted_payload);
          } catch {
            return {};
          }
        })()
      : report.raw_extracted_payload || {};
  const summarySource = rawPayload.summary_source;
  const htmlNote =
    summarySource === 'html_only_pdf_download_failed'
      ? 'Summary fields (vehicle, inspection date, VIN as shown) were taken from the live PAVE report page. PDF download did not complete — damage lines may be empty.'
      : summarySource === 'html_only_pdf_unreadable'
        ? 'Summary fields were taken from the live PAVE report page. PDF could not be parsed (invalid structure or unreadable). Damage lines may be empty.'
        : summarySource === 'html_and_pdf' || summarySource === 'html_and_pdf_partial_items'
          ? 'Summary was merged from the report page and the PDF.'
          : null;

  return (
    <section className="card pave-page">
      <h2>PAVE inspection detail</h2>
      <p className="muted"><Link to="/pave">Back to /pave</Link></p>

      <div className="pave-gmail-detail-grid">
        <div className="pave-gmail-detail-block">
          <h3>Summary</h3>
          {htmlNote && (
            <p className="pave-summary-note" style={{ background: '#e8f4fd', padding: '0.5rem 0.75rem', borderRadius: 6, marginBottom: '0.5rem' }}>
              {htmlNote}
            </p>
          )}
          <table className="pave-table">
            <tbody>
              <tr><th>provider</th><td>{report.provider || '—'}</td></tr>
              <tr><th>external_report_id</th><td>{report.external_report_id || '—'}</td></tr>
              <tr><th>vehicle_label</th><td><strong>{report.vehicle_label || report.vehicle_id || report.plate_number || '—'}</strong></td></tr>
              <tr><th>VIN (display)</th><td><strong>{report.vin_display || report.vin || '—'}</strong></td></tr>
              <tr>
                <th>Fleet plate (match)</th>
                <td>
                  <strong>{report.matched_license_plate || '—'}</strong>
                  {report.matched_license_plate ? (
                    <span className="muted" title="Same last 4 alphanumeric VIN characters as a car in the fleet DB">
                      {' '}
                      (VIN last 4)
                    </span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <th>inspection_date</th>
                <td>
                  <strong>
                    {formatPaveInspectionDate(
                      report.inspection_date_effective
                        ?? report.inspection_date
                        ?? report.report_date
                        ?? report.incident_date
                        ?? incomingEmail?.received_at,
                    )}
                  </strong>
                  {inspectionDateHint ? (
                    <span className="muted" title="Fallback when report inspection_date is missing">
                      {' '}
                      ({inspectionDateHint})
                    </span>
                  ) : null}
                </td>
              </tr>
              <tr><th>language</th><td>{report.inspection_language || '—'}</td></tr>
              <tr><th>total_grade</th><td><strong>{report.total_grade ?? '—'}</strong> {report.total_grade_label ? <span>({report.total_grade_label})</span> : null}</td></tr>
              <tr><th>total_damage_score</th><td>{report.total_damage_score ?? '—'}</td></tr>
              <tr><th>front/back/left/right</th><td>{report.front_score ?? '—'} / {report.back_score ?? '—'} / {report.left_score ?? '—'} / {report.right_score ?? '—'}</td></tr>
              <tr><th>windshield_status</th><td>{report.windshield_status || '—'}</td></tr>
              <tr><th>status</th><td>{report.status || '—'}</td></tr>
              <tr><th>notes</th><td>{report.notes || '—'}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="pave-gmail-detail-block">
          <h3>Source email</h3>
          <table className="pave-table">
            <tbody>
              <tr><th>subject</th><td>{incomingEmail?.subject || '—'}</td></tr>
              <tr><th>from</th><td>{incomingEmail?.from_email || '—'}</td></tr>
              <tr><th>received_at</th><td>{fmtDate(incomingEmail?.received_at)}</td></tr>
              <tr><th>extracted_report_url</th><td style={{ wordBreak: 'break-word' }}>{incomingEmail?.extracted_report_url || '—'}</td></tr>
              <tr><th>source report URL</th><td style={{ wordBreak: 'break-word' }}>{report.report_url || '—'}</td></tr>
              <tr><th>processing_status</th><td>{incomingEmail?.processing_status || '—'}</td></tr>
              <tr><th>parsing_errors</th><td style={{ whiteSpace: 'pre-wrap' }}>{incomingEmail?.parsing_errors || '—'}</td></tr>
            </tbody>
          </table>

          <div style={{ marginTop: '0.75rem' }}>
            {report?.report_url ? (
              <>
                <a
                  href={report.report_url}
                  className="pave-act"
                  style={{ marginRight: '0.5rem' }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open source report
                </a>
                <button
                  type="button"
                  className="pave-act"
                  style={{ marginRight: '0.5rem' }}
                  onClick={async () => {
                    setPortalMsg('');
                    try {
                      const cred = await getPavePortalCredentials();
                      if (!cred.configured || !cred.username || !cred.password) {
                        setPortalMsg('Set REPORT_PORTAL_USERNAME and REPORT_PORTAL_PASSWORD in backend .env (same as Gmail sync).');
                        return;
                      }
                      window.open(report.report_url, '_blank', 'noopener,noreferrer');
                      const bm = buildPortalFillBookmarklet(cred.username, cred.password);
                      await navigator.clipboard.writeText(bm);
                      setPortalMsg(
                        'Report opened in a new tab. Bookmarklet copied: on the PAVE login page, paste into the address bar and press Enter to fill username/password (some browsers block javascript: URLs — then use Copy username / password below).',
                      );
                    } catch (e) {
                      setPortalMsg(String(e?.message || e));
                    }
                  }}
                >
                  Open + copy login helper
                </button>
                <button
                  type="button"
                  className="pave-act"
                  style={{ marginRight: '0.5rem' }}
                  onClick={async () => {
                    setPortalMsg('');
                    try {
                      const cred = await getPavePortalCredentials();
                      if (!cred.username) {
                        setPortalMsg('Portal username not configured (REPORT_PORTAL_USERNAME).');
                        return;
                      }
                      await navigator.clipboard.writeText(cred.username);
                      setPortalMsg('Username copied to clipboard.');
                    } catch (e) {
                      setPortalMsg(String(e?.message || e));
                    }
                  }}
                >
                  Copy username
                </button>
                <button
                  type="button"
                  className="pave-act"
                  onClick={async () => {
                    setPortalMsg('');
                    try {
                      const cred = await getPavePortalCredentials();
                      if (!cred.password) {
                        setPortalMsg('Portal password not configured (REPORT_PORTAL_PASSWORD).');
                        return;
                      }
                      await navigator.clipboard.writeText(cred.password);
                      setPortalMsg('Password copied to clipboard.');
                    } catch (e) {
                      setPortalMsg(String(e?.message || e));
                    }
                  }}
                >
                  Copy password
                </button>
                {portalMsg ? (
                  <p className="muted" style={{ marginTop: '0.5rem', maxWidth: 640 }}>
                    {portalMsg}
                  </p>
                ) : null}
              </>
            ) : null}
            {downloadedReport?.file_path ? (
              <button
                type="button"
                className="pave-act"
                onClick={() => downloadPaveGmailReportFile(report.id, downloadedReport.file_name)}
              >
                Open downloaded file
              </button>
            ) : (
              <div className="muted">No downloaded file</div>
            )}
          </div>
        </div>

        <div className="pave-gmail-detail-block">
          <h3>Damage items</h3>
          <table className="pave-table">
            <thead>
              <tr>
                <th>#</th>
                <th>side</th>
                <th>component</th>
                <th>damage type</th>
                <th>severity</th>
                <th>repair method</th>
                <th>grade score</th>
              </tr>
            </thead>
            <tbody>
              {!Array.isArray(items) || items.length === 0 ? (
                <tr><td colSpan={7} className="pave-empty">No parsed damage items.</td></tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={it.id || idx}>
                    <td>{it.sort_order || idx + 1}</td>
                    <td>{it.side || '—'}</td>
                    <td>{it.component || '—'}</td>
                    <td>{it.damage_type || '—'}</td>
                    <td>{it.severity || '—'}</td>
                    <td>{it.repair_method || '—'}</td>
                    <td>{it.grade_score ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pave-gmail-detail-block">
          <h3>Raw payload/debug</h3>
          <div className="muted">raw_extracted_payload (PDF parse + HTML snapshot metadata)</div>
          <pre className="pave-pre">{JSON.stringify(rawPayload, null, 2)}</pre>
          {report.parsing_warnings && (
            <>
              <div className="muted" style={{ marginTop: '0.75rem' }}>parsing_warnings</div>
              <pre className="pave-pre">{report.parsing_warnings}</pre>
            </>
          )}
          {report.parsing_errors && (
            <>
              <div className="muted" style={{ marginTop: '0.75rem' }}>parsing_errors</div>
              <pre className="pave-pre">{report.parsing_errors}</pre>
            </>
          )}
        </div>
      </div>

      <style>{`
        .pave-page { max-width: 1200px; margin: 0 auto; }
        .pave-gmail-detail-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
        .pave-gmail-detail-block { background: #fafafa; padding: 0.75rem; border-radius: 8px; border: 1px solid #eee; }
        @media (min-width: 980px) { .pave-gmail-detail-grid { grid-template-columns: 1fr 1fr; } .pave-gmail-detail-block:last-child { grid-column: 1 / -1; } }
        .pave-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.25rem; }
        .pave-table th, .pave-table td { border: 1px solid #ddd; padding: 0.35rem 0.5rem; text-align: left; }
        .pave-pre { background: #111; color: #d7d7d7; padding: 0.75rem; border-radius: 8px; overflow: auto; max-height: 360px; }
        .muted { color: #666; }
      `}</style>
    </section>
  );
}

