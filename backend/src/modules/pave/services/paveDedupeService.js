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
  externalReportId,
  inspectionDate,
  fileSha256,
}) {
  if (externalReportId && inspectionDate) {
    const exact = (await query(
      `SELECT pr.*, (
         SELECT COUNT(*)::int FROM pave_report_items pri WHERE pri.pave_report_id = pr.id
       ) AS item_count
       FROM pave_reports pr
       LEFT JOIN downloaded_reports dr ON dr.id = pr.downloaded_report_id
       WHERE pr.external_report_id = $1 AND pr.inspection_date = $2
       ORDER BY pr.updated_at DESC
       LIMIT 1`,
      [externalReportId, inspectionDate]
    )).rows[0];
    if (exact) return { existing: exact, reason: 'exact_external_id_and_date' };
  }

  if (externalReportId) {
    const byExternal = (await query(
      `SELECT pr.*, (
         SELECT COUNT(*)::int FROM pave_report_items pri WHERE pri.pave_report_id = pr.id
       ) AS item_count
       FROM pave_reports pr
       WHERE pr.external_report_id = $1
       ORDER BY pr.inspection_date DESC NULLS LAST, pr.updated_at DESC
       LIMIT 1`,
      [externalReportId]
    )).rows[0];
    if (byExternal) return { existing: byExternal, reason: 'external_id_only' };
  }

  // IMPORTANT:
  // Some portal downloads can return identical placeholder bytes for different AMDE sessions.
  // To avoid collapsing multiple session keys into one record, we only use file_sha256
  // when external_report_id (AMDE session-key) is missing.
  if (!externalReportId && fileSha256) {
    const bySha = (await query(
      `SELECT pr.*, (
         SELECT COUNT(*)::int FROM pave_report_items pri WHERE pri.pave_report_id = pr.id
       ) AS item_count
       FROM pave_reports pr
       JOIN downloaded_reports dr ON dr.id = pr.downloaded_report_id
       WHERE dr.file_sha256 = $1
       ORDER BY pr.updated_at DESC
       LIMIT 1`,
      [fileSha256]
    )).rows[0];
    if (bySha) return { existing: bySha, reason: 'file_sha' };
  }

  return { existing: null, reason: null };
}

