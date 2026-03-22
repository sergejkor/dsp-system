import 'dotenv/config';
import fs from 'fs/promises';
import { query } from '../src/db.js';
import parsePaveEmail from '../src/modules/pave/gmail/providers/pave/parsePaveEmail.js';
import parsePavePdf from '../src/modules/pave/gmail/providers/pave/parsePavePdf.js';
import { findExistingPaveReportForDedupe, isIncomingParseRicher } from '../src/modules/pave/services/paveDedupeService.js';
import { replacePaveReportItems, upsertPaveReportSummary } from '../src/modules/pave/services/paveReportPersistenceService.js';

function extractExternalIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/park\/([A-Za-z0-9-]+)/i);
  return m?.[1] || null;
}

function parseIntSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const argLimit = parseIntSafe(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]);
  const limit = argLimit ?? 500;

  const rows = (
    await query(
      `SELECT
         ie.id AS incoming_email_id,
         ie.subject,
         ie.from_email,
         ie.raw_body_text,
         ie.raw_body_html,
         ie.extracted_report_url,
         ie.message_id,
         ie.thread_id,
         dr.id AS downloaded_report_id,
         dr.file_path,
         dr.file_name,
         dr.mime_type,
         dr.file_sha256,
         dr.source_url
       FROM incoming_emails ie
       JOIN downloaded_reports dr ON dr.incoming_email_id = ie.id
       LEFT JOIN pave_reports pr ON pr.incoming_email_id = ie.id
       WHERE ie.provider = 'gmail'
         AND pr.id IS NULL
         AND dr.file_path IS NOT NULL
       ORDER BY dr.updated_at DESC
       LIMIT $1`,
      [limit]
    )
  ).rows;

  let created = 0;
  let skippedForDedupe = 0;
  let failed = 0;

  console.log(`[pave-reparse-missing] found ${rows.length} incoming emails with downloaded_reports but no pave_reports`);

  for (const row of rows) {
    const incomingEmailId = row.incoming_email_id;
    const emailRef = `incoming_email_id=${incomingEmailId}`;
    try {
      const buffer = await fs.readFile(row.file_path);
      const parsedEmail = parsePaveEmail({
        subject: row.subject,
        fromEmail: row.from_email,
        rawBodyText: row.raw_body_text,
        rawBodyHtml: row.raw_body_html,
      });

      let externalReportId = parsedEmail?.external_report_id || null;
      if (!externalReportId) externalReportId = extractExternalIdFromUrl(row.extracted_report_url) || extractExternalIdFromUrl(parsedEmail?.report_url);

      const parsedPavePdf = await parsePavePdf(buffer);
      const report = parsedPavePdf?.report || {};
      const items = Array.isArray(parsedPavePdf?.items) ? parsedPavePdf.items : [];

      const parseWarnings = (Array.isArray(parsedPavePdf?.warnings) ? parsedPavePdf.warnings : []).concat(parsedEmail?.warnings || []);
      const incomingSummary = {
        provider: 'pave',
        external_report_id: externalReportId || null,
        report_url: parsedEmail?.report_url || row.source_url || row.extracted_report_url || null,
        vehicle_label: report.vehicle_label || parsedEmail?.vehicle_label || null,
        vin: report.vin || null,
        inspection_date: report.inspection_date || null,
        inspection_language: parsedEmail?.language || null,
        total_grade: report.total_grade ?? null,
        total_grade_label: report.total_grade_label || null,
        total_damage_score: report.total_damage_score ?? null,
        front_score: report.front_score ?? null,
        back_score: report.back_score ?? null,
        left_score: report.left_score ?? null,
        right_score: report.right_score ?? null,
        windshield_status: report.windshield_status || null,
        status: parsedEmail?.status || null,
      };

      const dedupe = await findExistingPaveReportForDedupe({
        externalReportId: incomingSummary.external_report_id,
        inspectionDate: incomingSummary.inspection_date,
        fileSha256: row.file_sha256 || null,
      });

      if (dedupe.existing && !isIncomingParseRicher(dedupe.existing, incomingSummary, items)) {
        skippedForDedupe += 1;
        // Still update the incoming processing status so the UI knows it was attempted.
        await query(
          `UPDATE incoming_emails
           SET processing_status = 'partial',
               parsing_errors = COALESCE(parsing_errors, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [`duplicateSkipped (dedupe exists), warnings=${parseWarnings.join('; ')}`, incomingEmailId]
        );
        continue;
      }

      const upsert = await upsertPaveReportSummary({
        existingId: dedupe.existing?.id || null,
        incomingEmailId,
        downloadedReportId: row.downloaded_report_id,
        summary: incomingSummary,
        warningsText: parseWarnings.join('; '),
        errorsText: null,
        rawExtractedPayload: {
          email_extracted_payload: parsedEmail?.raw_extraction_payload || null,
          parse_email_warnings: parsedEmail?.warnings || [],
          parsed_pdf: parsedPavePdf?.rawParsedPayload || null,
        },
      });

      await replacePaveReportItems({
        paveReportId: upsert.id,
        items,
      });

      created += 1;
      await query(
        `UPDATE incoming_emails
         SET processing_status = $1,
             parsing_errors = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [parseWarnings.length ? 'partial' : 'processed', parseWarnings.length ? parseWarnings.join('; ') : null, incomingEmailId]
      );

      console.log('[pave-reparse-missing] created', { emailRef, externalReportId });
    } catch (e) {
      failed += 1;
      console.error('[pave-reparse-missing] failed', { emailRef, error: String(e?.message || e) });
      try {
        await query(
          `UPDATE incoming_emails
           SET processing_status = 'failed',
               parsing_errors = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [`${String(e?.message || e)}`, incomingEmailId]
        );
      } catch (_) {}
    }
  }

  console.log('[pave-reparse-missing] done', { created, skippedForDedupe, failed });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

