import { useEffect, useState, useRef } from 'react';
import { getMonthDays, uploadDayFile } from '../services/calendarApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { translations } from '../translations';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function isSunday(dayKey) {
  if (!dayKey) return false;
  return new Date(dayKey + 'T12:00:00').getDay() === 0;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
  const { t, language } = useAppSettings();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);

  function loadMonth() {
    setLoading(true);
    setError('');
    getMonthDays(year, month)
      .then(setDays)
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMonth();
  }, [year, month]);

  function handleUploadClick(dayKey) {
    setError('');
    setMessage('');
    setUploading(dayKey);
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('data-day', dayKey);
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  function handleFileChange(e) {
    const input = e.target;
    const dayKey = input.getAttribute('data-day');
    const file = input.files?.[0];
    if (!dayKey || !file) return;
    setUploading(dayKey);
    setError('');
    setMessage('');
    uploadDayFile(dayKey, file)
      .then((result) => {
        setMessage(`File saved. (${result.rowCount} rows for ${dayKey})`);
        setError('');
        loadMonth();
      })
      .catch((err) => {
        setMessage('');
        if (err.code === 'DATE_MISMATCH') {
          setError(t('cortexUploads.errors.dateMismatch'));
        } else if (err.code === 'NO_DATE_IN_FILE') {
          setError(t('cortexUploads.errors.noDateInFile'));
        } else if (err.code === 'SUNDAY_NOT_ALLOWED') {
          setError(t('cortexUploads.errors.sundayNotAllowed'));
        } else if (err.code === 'ALREADY_HAS_FILE') {
          setError(t('cortexUploads.errors.alreadyHasFile'));
        } else {
          setError(t('cortexUploads.errors.generic') + (err.message || ''));
        }
      })
      .finally(() => {
        setUploading(null);
        input.value = '';
      });
  }

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month - 1 + 1, 0).getDate();
  const startWeekday = ((firstDay.getDay() + 6) % 7);
  const dayMap = new Map(days.map((d) => [d.day_key, d]));

  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ empty: true, day: null, day_key: null });
  }
  for (let d = 1; d <= lastDay; d++) {
    const dayKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const info = dayMap.get(dayKey) || { day_key: dayKey, day: d, upload_count: 0 };
    cells.push({ empty: false, day: d, day_key: dayKey, ...info });
  }

  const monthsArray = (translations[language]?.cortexUploads?.months || translations.en?.cortexUploads?.months || EN_MONTHS).slice(0, 12);

  return (
    <section className="card">
      <h2>{t('cortexUploads.title')}</h2>
      <p className="muted">
        {t('cortexUploads.instructions')}
      </p>

      {(message || error) && (
        <p className={`calendar-upload-status ${error ? 'calendar-upload-status--failed' : 'calendar-upload-status--saved'}`}>
          <strong>{t('cortexUploads.status')}:</strong> {error ? error : message}
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <label>
          {t('cortexUploads.year')}
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
        <label>
          {t('cortexUploads.month')}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            style={{ marginLeft: '0.5rem' }}
          >
            {monthsArray.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {loading ? (
        <p className="muted">{t('cortexUploads.loading')}</p>
      ) : (
        <div className="calendar-grid">
          <div className="calendar-weekdays">
            {WEEKDAY_KEYS.map((key) => (
              <div key={key} className="calendar-weekday">{t(`cortexUploads.weekdays.${key}`)}</div>
            ))}
          </div>
          <div className="calendar-days">
            {cells.map((cell, idx) => (
              <div
                key={cell.empty ? `empty-${idx}` : cell.day_key}
                className={`calendar-cell ${cell.empty ? 'calendar-cell--empty' : ''}`}
              >
                {cell.empty ? (
                  ''
                ) : (
                  <>
                    <div className="calendar-cell-header">
                      <span className="calendar-cell-day">{cell.day}</span>
                      {!isSunday(cell.day_key) && (
                        <span className="calendar-cell-header-right">
                          {Number(cell.upload_count) > 0 && (
                            <span className="calendar-cell-badge" title={t('cortexUploads.uploads')}>
                              {cell.upload_count}
                            </span>
                          )}
                          <span
                            className={`calendar-cell-status ${Number(cell.upload_count) > 0 ? 'calendar-cell-status--loaded' : 'calendar-cell-status--missing'}`}
                            title={Number(cell.upload_count) > 0 ? t('cortexUploads.fileLoaded') : t('cortexUploads.noFileYet')}
                          >
                            {Number(cell.upload_count) > 0 ? '✓' : '✗'}
                          </span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="calendar-cell-upload"
                      onClick={() => handleUploadClick(cell.day_key)}
                      disabled={uploading === cell.day_key || isSunday(cell.day_key) || Number(cell.upload_count) > 0}
                      title={isSunday(cell.day_key) ? t('cortexUploads.uploadDisabledSunday') : Number(cell.upload_count) > 0 ? t('cortexUploads.alreadyHasFile') : undefined}
                    >
                      {uploading === cell.day_key ? '…' : isSunday(cell.day_key) ? '—' : Number(cell.upload_count) > 0 ? t('cortexUploads.uploaded') : t('cortexUploads.uploadExcel')}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
