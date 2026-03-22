import { query } from '../../../db.js';

function sanitizeForJson(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value.replace(/\u0000/g, '');
  if (Array.isArray(value)) return value.map((x) => sanitizeForJson(x));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeForJson(v);
    return out;
  }
  return value;
}

function safeJsonStringify(value) {
  return JSON.stringify(sanitizeForJson(value));
}

export async function upsertPaveReportSummary({
  existingId = null,
  incomingEmailId,
  downloadedReportId,
  summary,
  warningsText = null,
  errorsText = null,
  rawExtractedPayload = null,
}) {
  if (existingId) {
    const res = await query(
      `UPDATE pave_reports
       SET
         incoming_email_id = $2,
         downloaded_report_id = $3,
         provider = COALESCE($4, provider),
         external_report_id = COALESCE($5, external_report_id),
         report_url = COALESCE($6, report_url),
         vehicle_label = COALESCE($7, vehicle_label),
         vin = COALESCE($8, vin),
         vin_display = COALESCE($9, vin_display),
         inspection_date = COALESCE($10, inspection_date),
         inspection_language = COALESCE($11, inspection_language),
         total_grade = COALESCE($12, total_grade),
         total_grade_label = COALESCE($13, total_grade_label),
         total_damage_score = COALESCE($14, total_damage_score),
         front_score = COALESCE($15, front_score),
         back_score = COALESCE($16, back_score),
         left_score = COALESCE($17, left_score),
         right_score = COALESCE($18, right_score),
         windshield_status = COALESCE($19, windshield_status),
         status = COALESCE($20, status),
         raw_extracted_payload = COALESCE($21, raw_extracted_payload),
         parsing_warnings = COALESCE($22, parsing_warnings),
         parsing_errors = COALESCE($23, parsing_errors),
         warnings = COALESCE($24, warnings),
         errors = COALESCE($25, errors),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [
        existingId,
        incomingEmailId,
        downloadedReportId,
        summary.provider || null,
        summary.external_report_id || null,
        summary.report_url || null,
        summary.vehicle_label || null,
        summary.vin || null,
        summary.vin_display ?? null,
        summary.inspection_date || null,
        summary.inspection_language || null,
        summary.total_grade ?? null,
        summary.total_grade_label || null,
        summary.total_damage_score ?? null,
        summary.front_score ?? null,
        summary.back_score ?? null,
        summary.left_score ?? null,
        summary.right_score ?? null,
        summary.windshield_status || null,
        summary.status || null,
        rawExtractedPayload ? safeJsonStringify(rawExtractedPayload) : null,
        warningsText,
        errorsText,
        warningsText,
        errorsText,
      ]
    );
    return { id: res.rows[0].id, action: 'updated' };
  }

  const ins = await query(
    `INSERT INTO pave_reports (
      incoming_email_id,
      downloaded_report_id,
      provider,
      external_report_id,
      report_url,
      vehicle_label,
      vin,
      vin_display,
      inspection_date,
      inspection_language,
      total_grade,
      total_grade_label,
      total_damage_score,
      front_score,
      back_score,
      left_score,
      right_score,
      windshield_status,
      status,
      raw_extracted_payload,
      parsing_warnings,
      parsing_errors,
      warnings,
      errors
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
    RETURNING id`,
    [
      incomingEmailId,
      downloadedReportId,
      summary.provider || null,
      summary.external_report_id || null,
      summary.report_url || null,
      summary.vehicle_label || null,
      summary.vin || null,
      summary.vin_display ?? null,
      summary.inspection_date || null,
      summary.inspection_language || null,
      summary.total_grade ?? null,
      summary.total_grade_label || null,
      summary.total_damage_score ?? null,
      summary.front_score ?? null,
      summary.back_score ?? null,
      summary.left_score ?? null,
      summary.right_score ?? null,
      summary.windshield_status || null,
      summary.status || null,
      rawExtractedPayload ? safeJsonStringify(rawExtractedPayload) : null,
      warningsText,
      errorsText,
      warningsText,
      errorsText,
    ]
  );
  return { id: ins.rows[0].id, action: 'created' };
}

export async function replacePaveReportItems({ paveReportId, items }) {
  await query(`DELETE FROM pave_report_items WHERE pave_report_id = $1`, [paveReportId]);
  for (const [i, it] of (Array.isArray(items) ? items : []).entries()) {
    await query(
      `INSERT INTO pave_report_items (
         pave_report_id, side, component, damage_type, severity, repair_method, grade_score, sort_order, raw_payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        paveReportId,
        it.side || null,
        it.component || null,
        it.damage_type || null,
        it.severity || null,
        it.repair_method || null,
        it.grade_score ?? null,
        it.sort_order ?? i + 1,
        safeJsonStringify(it.raw_payload || {}),
      ]
    );
  }
}

