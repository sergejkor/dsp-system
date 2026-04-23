import { query } from '../../../db.js';

function countNonEmpty(obj, keys) {
  let n = 0;
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && String(v).trim?.() !== '') n += 1;
  }
  return n;
}

const SUMMARY_KEYS = [
  'provider',
  'external_report_id',
  'report_url',
  'vehicle_label',
  'vin',
  'vin_display',
  'inspection_date',
  'inspection_language',
  'total_grade',
  'total_grade_label',
  'total_damage_score',
  'front_score',
  'back_score',
  'left_score',
  'right_score',
  'windshield_status',
  'status',
];

export function isIncomingParseRicher(existing, incoming, incomingItems = []) {
  if (!existing) return true;
  const existingScore = countNonEmpty(existing, SUMMARY_KEYS) + (Number(existing.item_count) || 0);
  const incomingScore = countNonEmpty(incoming, SUMMARY_KEYS) + (Array.isArray(incomingItems) ? incomingItems.length : 0);
  return incomingScore > existingScore;
}

export async function findExistingPaveReportForDedupe({
  incomingEmailId,
  externalReportId,
  inspectionDate,
  fileSha256,
}) {
  // Reprocessing the same incoming email should update its own row instead of inserting
  // a second copy. Across different emails we now keep separate rows, because the PAVE
  // page groups data by month and repeated monthly inspections must stay visible.
  if (incomingEmailId) {
    const byIncoming = (await query(
      `SELECT pr.*, (
         SELECT COUNT(*)::int FROM pave_report_items pri WHERE pri.pave_report_id = pr.id
       ) AS item_count
       FROM pave_reports pr
       WHERE pr.incoming_email_id = $1
       ORDER BY pr.updated_at DESC
       LIMIT 1`,
      [incomingEmailId]
    )).rows[0];
    if (byIncoming) return { existing: byIncoming, reason: 'incoming_email' };
  }

  return { existing: null, reason: null };
}

