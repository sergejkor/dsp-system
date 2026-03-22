import { query } from '../../db.js';

const FANTASTIC_PLUS_MIN_SCORE = 93;

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const year = monday.getFullYear();
  const start = new Date(year, 0, 1);
  const week = Math.ceil((((monday - start) / 86400000) + start.getDay() + 1) / 7);
  return { year, week };
}

function getWeeksInRange(fromDate, toDate) {
  const weeks = [];
  const seen = new Set();
  const from = new Date(fromDate + 'T12:00:00');
  const to = new Date(toDate + 'T12:00:00');
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    const { year, week } = getISOWeek(s);
    const key = `${year}-${week}`;
    if (!seen.has(key)) {
      seen.add(key);
      weeks.push({ year, week });
    }
  }
  weeks.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.week - b.week));
  return weeks;
}

function getMondayOfISOWeek(year, week) {
  const jan4 = new Date(year, 0, 4);
  const firstMon = new Date(year, 0, 1);
  firstMon.setDate(1 - (jan4.getDay() === 0 ? 6 : jan4.getDay() - 1));
  const mon = new Date(firstMon);
  mon.setDate(firstMon.getDate() + (week - 1) * 7);
  return mon;
}

/**
 * Get employees who had KPI >= 93 (Fantastic Plus) in all selected weeks.
 * Data is taken only from kpi_data.
 * @param {string} fromDate - optional, used when weeks not provided
 * @param {string} toDate - optional
 * @param {string[]} weekKeys - e.g. ['2025-10', '2025-11'] (year-week)
 */
async function getEligible(fromDate, toDate, weekKeys = []) {
  let weeks = [];
  if (Array.isArray(weekKeys) && weekKeys.length > 0) {
    weeks = weekKeys
      .map((s) => String(s).trim())
      .filter(Boolean)
      .map((key) => {
        const [y, w] = key.split('-').map(Number);
        return { year: y, week: w };
      })
      .filter((w) => Number.isFinite(w.year) && Number.isFinite(w.week) && w.week >= 1 && w.week <= 53);
  } else {
    const from = (fromDate || '').toString().slice(0, 10);
    const to = (toDate || '').toString().slice(0, 10);
    if (!from || !to || from > to) return [];
    weeks = getWeeksInRange(from, to);
  }
  if (weeks.length === 0) return [];

  const yearArr = weeks.map((w) => w.year);
  const weekArr = weeks.map((w) => w.week);
  const firstMon = getMondayOfISOWeek(weeks[0].year, weeks[0].week);
  const periodMonthYYYYMM = firstMon.getFullYear() + '-' + String(firstMon.getMonth() + 1).padStart(2, '0');

  // Only kpi_data. Employees who have kpi >= 93 in every selected week. DISTINCT ON: ORDER BY must match.
  const res = await query(
    `WITH weeks_list AS (
       SELECT unnest($1::int[]) AS year, unnest($2::int[]) AS week
     ),
     weeks_with_data AS (
       SELECT DISTINCT k.year, k.week FROM kpi_data k
       INNER JOIN weeks_list w ON k.year = w.year AND k.week = w.week
     ),
     num_weeks AS (SELECT COUNT(*)::int AS n FROM weeks_with_data),
     eligible AS (
       SELECT k.employee_id, MAX(k.kpi) AS kpi
       FROM kpi_data k
       INNER JOIN weeks_list w ON k.year = w.year AND k.week = w.week
       WHERE k.kpi >= $3
       GROUP BY k.employee_id
       HAVING COUNT(DISTINCT (k.year, k.week)) = (SELECT n FROM num_weeks)
     ),
     with_key AS (
       SELECT
         LOWER(COALESCE(k.transporter_id, k.kenjo_user_id, '')) AS sort_key,
         COALESCE(k.transporter_id, k.kenjo_user_id) AS transporter_id,
         k.first_name,
         k.last_name,
         e.kpi AS total_score
       FROM eligible e
       JOIN kenjo_employees k ON (
         LOWER(TRIM(k.kenjo_user_id)) = LOWER(TRIM(e.employee_id))
         OR LOWER(TRIM(k.transporter_id)) = LOWER(TRIM(e.employee_id))
         OR LOWER(TRIM(COALESCE(k.employee_number, ''))) = LOWER(TRIM(e.employee_id))
       )
       WHERE COALESCE(k.transporter_id, k.kenjo_user_id) IS NOT NULL
     ),
     distinct_emp AS (
       SELECT transporter_id, first_name, last_name, total_score
       FROM (
         SELECT DISTINCT ON (sort_key) transporter_id, first_name, last_name, total_score, sort_key
         FROM with_key
         ORDER BY sort_key, total_score DESC NULLS LAST
       ) sub
     )
     SELECT
       r.transporter_id,
       r.first_name,
       r.last_name,
       r.total_score,
       g.issued AS gift_card_issued,
       g.gift_card_amount
     FROM distinct_emp r
     LEFT JOIN gift_cards g ON g.transporter_id = r.transporter_id AND g.period_month = $4
     ORDER BY r.total_score DESC NULLS LAST, r.last_name, r.first_name`,
    [yearArr, weekArr, FANTASTIC_PLUS_MIN_SCORE, periodMonthYYYYMM]
  );

  const rows = res?.rows || [];
  return rows.map((r) => ({
    transporter_id: r.transporter_id,
    first_name: r.first_name,
    last_name: r.last_name,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.transporter_id,
    total_score: r.total_score,
    delivered: null,
    dcr: null,
    dsc_dpmo: null,
    lor_dpmo: null,
    pod: null,
    cc: null,
    ce: null,
    cdf_dpmo: null,
    cdf: null,
    gift_card_issued: !!r.gift_card_issued,
    gift_card_amount: r.gift_card_amount != null ? Number(r.gift_card_amount) : 0,
  }));
}

/**
 * Upsert gift card record: period_month, transporter_id, issued, gift_card_amount.
 */
async function saveGiftCard(periodMonth, transporterId, issued, giftCardAmount = 0) {
  const period = (periodMonth || '').toString().slice(0, 7);
  const tid = (transporterId || '').toString().trim();
  if (!period || !tid) throw new Error('period_month and transporter_id are required');

  await query(
    `INSERT INTO gift_cards (period_month, transporter_id, gift_card_amount, issued, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (period_month, transporter_id) DO UPDATE SET
       gift_card_amount = EXCLUDED.gift_card_amount,
       issued = EXCLUDED.issued,
       updated_at = NOW()`,
    [period, tid, Number(giftCardAmount) || 0, !!issued]
  );
  return { period_month: period, transporter_id: tid, issued: !!issued, gift_card_amount: Number(giftCardAmount) || 0 };
}

/**
 * Get employees who already received a gift card (any period).
 */
async function getIssued() {
  const res = await query(
    `SELECT
       g.transporter_id,
       g.gift_card_amount,
       g.issued,
       g.period_month,
       k.first_name,
       k.last_name
     FROM gift_cards g
     LEFT JOIN kenjo_employees k ON k.transporter_id = g.transporter_id
     WHERE g.issued = TRUE
     ORDER BY g.period_month DESC, k.last_name NULLS LAST, k.first_name NULLS LAST, g.transporter_id`
  );

  return (res?.rows || []).map((r) => ({
    transporter_id: r.transporter_id,
    first_name: r.first_name,
    last_name: r.last_name,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.transporter_id,
    period_month: r.period_month,
    gift_card_amount: r.gift_card_amount != null ? Number(r.gift_card_amount) : 0,
  }));
}

export default {
  getEligible,
  saveGiftCard,
  getIssued,
};
