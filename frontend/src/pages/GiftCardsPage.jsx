import { useState, useMemo } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { getEligible, saveGiftCard, getIssuedGiftCards } from '../services/giftCardsApi';

function getRating(totalScore) {
  const s = Number(totalScore);
  if (!Number.isFinite(s)) return '—';
  if (s < 50) return 'POOR';
  if (s < 70) return 'FAIR';
  if (s < 84.99) return 'GREAT';
  if (s < 92.99) return 'FANTASTIC';
  return 'FANTASTIC PLUS';
}

/** Get Monday (start) and Sunday (end) of ISO week (year, week). Returns { start: YYYY-MM-DD, end: YYYY-MM-DD }. */
function getISOWeekRange(year, week) {
  const jan4 = new Date(year, 0, 4);
  const jan1 = new Date(year, 0, 1);
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() - (jan4.getDay() === 0 ? 6 : jan4.getDay() - 1));
  const mon = new Date(firstMonday);
  mon.setDate(firstMonday.getDate() + (week - 1) * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    start: `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`,
    end: `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`,
  };
}

/** Format YYYY-MM-DD as DD.MM.YYYY */
function formatDDMMYYYY(iso) {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** ISO week number for a date (local). */
function getISOWeekNum(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const thu = new Date(d);
  thu.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + 3);
  const jan1 = new Date(thu.getFullYear(), 0, 1);
  const weekNum = 1 + Math.floor((thu - jan1) / 86400000 / 7);
  return { year: thu.getFullYear(), week: weekNum };
}

/** Build list of week options: { value: 'year-week', label: 'Year-W (start – end)' } for last ~52 weeks. */
function buildWeekOptions() {
  const now = new Date();
  const options = [];
  const seen = new Set();
  for (let i = 0; i < 52; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7 * i);
    const { year, week } = getISOWeekNum(d);
    const value = `${year}-${week}`;
    if (seen.has(value)) continue;
    seen.add(value);
    const { start, end } = getISOWeekRange(year, week);
    const label = `${year}-W${String(week).padStart(2, '0')} (${formatDDMMYYYY(start)} – ${formatDDMMYYYY(end)})`;
    options.push({ value, label });
  }
  return options;
}

const WEEK_OPTIONS = buildWeekOptions();

export default function GiftCardsPage() {
  const { t } = useAppSettings();
  const defaultWeek = useMemo(() => {
    const { year, week } = getISOWeekNum(new Date());
    return `${year}-${week}`;
  }, []);

  const [selectedWeeks, setSelectedWeeks] = useState([defaultWeek]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [issuedRows, setIssuedRows] = useState([]);
  const [issuedLoading, setIssuedLoading] = useState(false);
  const [issuedError, setIssuedError] = useState('');

  const { start: fromDate, periodMonth } = useMemo(() => {
    if (!selectedWeeks.length) return { start: '', periodMonth: '' };
    const [y, w] = (selectedWeeks[0] || '').split('-').map(Number);
    if (!y || !w) return { start: '', periodMonth: '' };
    const { start } = getISOWeekRange(y, w);
    // Use Monday of the selected ISO week as month reference
    const mon = new Date(start);
    const m = mon.getMonth() + 1;
    return { start, periodMonth: `${mon.getFullYear()}-${String(m).padStart(2, '0')}` };
  }, [selectedWeeks]);

  const periodMonthFromFirst = useMemo(() => {
    if (!selectedWeeks.length) return '';
    const [y, w] = (selectedWeeks[0] || '').split('-').map(Number);
    if (!y || !w) return '';
    const { start } = getISOWeekRange(y, w);
    return start ? start.slice(0, 7) : '';
  }, [selectedWeeks]);

  async function handleShow() {
    setError('');
    setLoading(true);
    setRows([]);
    try {
      const data = await getEligible(null, null, selectedWeeks);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleIssued(row, checked) {
    setError('');
    setSavingId(row.transporter_id);
    try {
      await saveGiftCard(periodMonth, row.transporter_id, checked, row.gift_card_amount ?? 0);
      setRows((prev) =>
        prev.map((r) =>
          r.transporter_id === row.transporter_id ? { ...r, gift_card_issued: !!checked } : r
        )
      );
    } catch (e) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSavingId(null);
    }
  }

  async function handleShowIssued() {
    setIssuedError('');
    setIssuedLoading(true);
    setIssuedRows([]);
    try {
      const data = await getIssuedGiftCards();
      setIssuedRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setIssuedError(e?.message || 'Failed to load issued gift cards');
      setIssuedRows([]);
    } finally {
      setIssuedLoading(false);
    }
  }

  return (
    <section className="gift-cards-page card">
      <h2>{t('giftCards.title')}</h2>
      <p className="muted">{t('giftCards.instructions')}</p>

      <div className="gift-cards-controls">
        <label className="gift-cards-label">
          {t('giftCards.weeks')}
          <select
            className="gift-cards-select gift-cards-select-multi"
            multiple
            value={selectedWeeks}
            onChange={(e) => {
              const next = Array.from(e.target.selectedOptions, (o) => o.value);
              setSelectedWeeks(next.length ? next : [defaultWeek]);
            }}
          >
            {WEEK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="gift-cards-hint">{t('giftCards.weeksHint')}</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-primary gift-cards-show-btn"
            onClick={handleShow}
            disabled={loading}
          >
            {loading ? t('giftCards.loading') : t('giftCards.show')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleShowIssued}
            disabled={issuedLoading}
          >
            {issuedLoading ? 'Loading issued…' : 'Gift card recipients'}
          </button>
        </div>
      </div>

      {error && <p className="gift-cards-error">{error}</p>}

      {rows.length > 0 && (
        <div className="gift-cards-table-wrap">
          <table className="gift-cards-table">
            <thead>
              <tr>
                <th>{t('giftCards.name')}</th>
                <th>{t('giftCards.totalScore')}</th>
                <th>{t('giftCards.rating')}</th>
                <th>{t('giftCards.giftCardIssued')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.transporter_id}>
                  <td>{row.name || row.transporter_id}</td>
                  <td>{row.total_score != null ? Number(row.total_score) : '—'}</td>
                  <td>{getRating(row.total_score)}</td>
                  <td>
                    <label className="gift-cards-checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!row.gift_card_issued}
                        disabled={savingId === row.transporter_id}
                        onChange={(e) => handleToggleIssued(row, e.target.checked)}
                      />
                      <span>{row.gift_card_issued ? t('giftCards.yes') : t('giftCards.no')}</span>
                    </label>
                    {!!row.gift_card_issued && (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Amount"
                        value={row.gift_card_amount ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRows((prev) =>
                            prev.map((r) =>
                              r.transporter_id === row.transporter_id
                                ? { ...r, gift_card_amount: val === '' ? '' : Number(val) || 0 }
                                : r
                            )
                          );
                        }}
                        style={{ marginLeft: '0.75rem', width: '6rem' }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 && selectedWeeks.length > 0 && (
        <p className="muted">{t('giftCards.noEligible')}</p>
      )}

      {issuedError && <p className="gift-cards-error" style={{ marginTop: '0.75rem' }}>{issuedError}</p>}

      {issuedRows.length > 0 && (
        <div className="gift-cards-table-wrap" style={{ marginTop: '1rem' }}>
          <h3 style={{ margin: '0 0 0.5rem' }}>Employees who got gift cards in this period ({periodMonthFromFirst || '—'})</h3>
          <table className="gift-cards-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Transporter ID</th>
                <th>Gift card amount</th>
              </tr>
            </thead>
            <tbody>
              {issuedRows.map((r) => (
                <tr key={r.transporter_id}>
                  <td>{r.name}</td>
                  <td>{r.transporter_id}</td>
                  <td>{r.gift_card_amount != null ? Number(r.gift_card_amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
