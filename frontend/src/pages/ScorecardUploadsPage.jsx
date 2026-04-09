import { useEffect, useState, useRef, useMemo } from 'react';
import { getScorecardWeeks, uploadScorecardFile, getScorecardEmployees } from '../services/scorecardApi';
import { useAppSettings } from '../context/AppSettingsContext';

const REPORT_COLUMNS = [
  { key: 'transporter_id', label: 'Transporter ID' },
  { key: 'names', label: 'Names' },
  { key: 'total_score', label: 'Total Score' },
  { key: 'rating', label: 'Rating' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'dcr', label: 'DCR' },
  { key: 'dsc_dpmo', label: 'DSC DPMO' },
  { key: 'lor_dpmo', label: 'LoR DPMO' },
  { key: 'pod', label: 'POD' },
  { key: 'cc', label: 'CC' },
  { key: 'ce', label: 'CE' },
  { key: 'cdf_dpmo', label: 'CDF DPMO' },
  { key: 'cdf', label: 'CDF' },
];

function formatCdf(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (Number.isFinite(n)) {
    if (n <= 1 && n >= 0) return `${(n * 100).toFixed(2)}%`;
    if (n > 1 && n <= 100) return `${n.toFixed(2)}%`;
    return `${n.toFixed(2)}%`;
  }
  return String(val).includes('%') ? String(val) : `${val}%`;
}

function getRating(totalScore) {
  const s = Number(totalScore);
  if (!Number.isFinite(s)) return '—';
  if (s < 50) return 'POOR';
  if (s < 70) return 'FAIR';
  if (s < 84.99) return 'GREAT';
  if (s < 92.99) return 'FANTASTIC';
  return 'FANTASTIC PLUS';
}

export default function ScorecardUploadsPage() {
  const { t } = useAppSettings();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportYear, setReportYear] = useState(null);
  const [reportWeek, setReportWeek] = useState(null);
  const [reportRows, setReportRows] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  const reportRowsSorted = useMemo(() => {
    return [...reportRows].sort((a, b) => (Number(b.total_score) ?? 0) - (Number(a.total_score) ?? 0));
  }, [reportRows]);

  function loadWeeks() {
    setLoading(true);
    setError('');
    getScorecardWeeks(year)
      .then(setWeeks)
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadWeeks();
  }, [year]);

  function handleUploadClick(weekNum) {
    setError('');
    setMessage('');
    setUploading(weekNum);
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('data-week', String(weekNum));
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  function handleCreateWeeklyReport(w, y) {
    setReportYear(y ?? year);
    setReportWeek(w);
    setReportOpen(true);
    setReportRows([]);
    setReportLoading(true);
    getScorecardEmployees(y ?? year, w)
      .then(setReportRows)
      .catch(() => setReportRows([]))
      .finally(() => setReportLoading(false));
  }

  function handleFileChange(e) {
    const input = e.target;
    const weekNum = Number(input.getAttribute('data-week'));
    const file = input.files?.[0];
    if (!weekNum || !file) return;
    setUploading(weekNum);
    setError('');
    setMessage('');
    uploadScorecardFile(year, weekNum, file)
      .then((res) => {
        const n = res.employeeRows ?? 0;
        setMessage(
          n > 0
            ? t('scorecardUploads.savedWithKpi').replace('{week}', String(weekNum)).replace('{year}', String(year)).replace('{n}', String(n))
            : t('scorecardUploads.savedShort').replace('{week}', String(weekNum)).replace('{year}', String(year))
        );
        setError('');
        loadWeeks();
      })
      .catch((err) => {
        setMessage('');
        if (err.code === 'INVALID_FILE_TYPE') {
          setError(t('scorecardUploads.errors.invalidFileType'));
        } else {
          setError(t('scorecardUploads.errors.genericPrefix') + (err.message || ''));
        }
      })
      .finally(() => {
        setUploading(null);
        input.value = '';
      });
  }

  return (
    <section className="card">
      <h2>{t('scorecardUploads.title')}</h2>
      <p className="muted">
        {t('scorecardUploads.instructions')}
      </p>

      {(message || error) && (
        <p className={`scorecard-status ${error ? 'scorecard-status--failed' : 'scorecard-status--saved'}`}>
          <strong>{t('scorecardUploads.statusLabel')}:</strong> {error ? error : message}
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <label>
          {t('scorecardUploads.year')}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ marginLeft: '0.5rem' }}
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {loading ? (
        <p className="muted">{t('scorecardUploads.loadingWeeks')}</p>
      ) : (
        <div className="scorecard-grid">
          <div className="scorecard-grid-header scorecard-grid-header--with-report">
            <span>{t('scorecardUploads.week')}</span>
            <span>{t('scorecardUploads.status')}</span>
            <span>{t('scorecardUploads.action')}</span>
            <span>{t('scorecardUploads.report')}</span>
          </div>
          {weeks.map(({ week, has_upload }) => (
            <div key={week} className={`scorecard-row scorecard-row--with-report ${has_upload ? '' : 'scorecard-row--no-upload'}`}>
              <span className="scorecard-week">
                {t('scorecardUploads.week')} {week}
              </span>
              <span
                className={`scorecard-icon ${has_upload ? 'scorecard-icon--ok' : 'scorecard-icon--missing'}`}
                title={has_upload ? t('scorecardUploads.uploadedTooltip') : t('scorecardUploads.notUploadedTooltip')}
              >
                {has_upload ? '✓' : '✗'}
              </span>
              <button
                type="button"
                className="scorecard-upload-btn"
                onClick={() => handleUploadClick(week)}
                disabled={uploading === week}
              >
                {uploading === week
                  ? '…'
                  : has_upload
                    ? t('scorecardUploads.replacePdf')
                    : t('scorecardUploads.uploadPdf')}
              </button>
              <div className="scorecard-row-actions">
                {has_upload && (
                  <button
                    type="button"
                    className="btn-primary scorecard-report-btn"
                    onClick={() => handleCreateWeeklyReport(week)}
                  >
                    {t('scorecardUploads.createWeeklyReport')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {reportOpen && (
        <div className="scorecard-modal-backdrop scorecard-modal-fullpage" onClick={() => setReportOpen(false)}>
          <div className="scorecard-modal scorecard-modal-fullpage-inner" onClick={(e) => e.stopPropagation()}>
            <div className="scorecard-modal-header">
              <h3>
                {t('scorecardUploads.scorecardEmployeesTitle')
                  .replace('{week}', String(reportWeek ?? '—'))
                  .replace('{year}', String(reportYear ?? '—'))}
              </h3>
              <button type="button" className="scorecard-modal-close" onClick={() => setReportOpen(false)}>×</button>
            </div>
            <div className="scorecard-modal-body scorecard-modal-body-fullpage">
              {reportLoading ? (
                <p className="muted">{t('scorecardUploads.loading')}</p>
              ) : reportRows.length === 0 ? (
                <p className="muted">{t('scorecardUploads.noDataForWeek')}</p>
              ) : (
                <div className="scorecard-report-table-wrap scorecard-report-table-wrap-fullpage">
                  <table className="scorecard-report-table scorecard-report-table-fullpage">
                    <thead>
                      <tr>
                        {REPORT_COLUMNS.map((col) => (
                          <th key={col.key}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportRowsSorted.map((row, idx) => (
                        <tr key={idx}>
                          {REPORT_COLUMNS.map((col) => {
                            let val;
                            if (col.key === 'names') {
                              const first = row.first_name != null && row.first_name !== '' ? row.first_name : '';
                              const last = row.last_name != null && row.last_name !== '' ? row.last_name : '';
                              val = (first || last)
                                ? `${first} ${last}`.trim()
                                : (row.display_name || row.transporter_id || '—');
                            } else if (col.key === 'cdf') val = formatCdf(row.cdf);
                            else if (col.key === 'rating') val = getRating(row.total_score);
                            else val = row[col.key] ?? '—';
                            return <td key={col.key}>{val}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
