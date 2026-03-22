import path from 'path';
import fs from 'fs/promises';
import { query } from '../../db.js';
import createEmailProvider from './gmail/emailProviders/createEmailProvider.js';
import {
  downloadReportFromPortal,
  PavePortalDownloadSession,
  probePdfBufferParseable,
} from './gmail/reportDownloadService.js';
import parsePaveEmail, { isLikelyPaveEmail } from './gmail/providers/pave/parsePaveEmail.js';
import parsePavePdf from './gmail/providers/pave/parsePavePdf.js';
import {
  mergeHtmlAndPdfReportSummary,
  htmlSummaryLooksUsable,
} from './gmail/providers/pave/extractPaveReportSummaryFromPage.js';
import { findExistingPaveReportForDedupe, isIncomingParseRicher } from './services/paveDedupeService.js';
import { replacePaveReportItems, upsertPaveReportSummary } from './services/paveReportPersistenceService.js';
import { effectiveInspectionDate, withInspectionDateEffective } from './paveReportDateUtils.js';

let syncRunningGlobal = false;

/**
 * Drop PDF parser "missing" warnings when HTML+PDF merge already has that field (avoids noisy partials).
 */
function filterPdfWarningsSupersededByMerge(parseWarnings, merged, itemCount) {
  if (!Array.isArray(parseWarnings)) return parseWarnings || [];
  const hasInsp = !!merged?.inspection_date;
  const hasVeh = !!(merged?.vehicle_label && String(merged.vehicle_label).trim());
  const hasVin =
    (!!merged?.vin && String(merged.vin).trim()) || (!!merged?.vin_display && String(merged.vin_display).trim());
  const n = (x) => x != null && x !== '' && !Number.isNaN(Number(x));
  return parseWarnings.filter((raw) => {
    const w = String(raw);
    if (w.includes('inspection_date missing') && hasInsp) return false;
    if (w.includes('vehicle_label missing') && hasVeh) return false;
    if (w.includes('vin missing') && hasVin) return false;
    if (w.includes('front_score missing') && n(merged?.front_score)) return false;
    if (w.includes('back_score missing') && n(merged?.back_score)) return false;
    if (w.includes('left_score missing') && n(merged?.left_score)) return false;
    if (w.includes('right_score missing') && n(merged?.right_score)) return false;
    if (w.includes('total_damage_score missing') && n(merged?.total_damage_score)) return false;
    if (w.includes('total_grade missing') && n(merged?.total_grade)) return false;
    if (w.includes('No damage items parsed from PAVE PDF') && itemCount > 0) return false;
    return true;
  });
}

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

async function withTimeout(taskPromise, timeoutMs, timeoutMessage) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function normalizeEmailProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

async function ensureDirs() {
  const dir = path.resolve(process.cwd(), 'backend-uploads/pave-gmail');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * True when a stored pave_reports row is missing core parsed fields (list shows "—" / date falls back to email).
 * Used to re-queue emails that were marked processed/partial but never got portal/PDF data.
 * @param {number} incomingEmailId
 */
export async function incomingPaveSummaryLooksIncomplete(incomingEmailId) {
  const r = (
    await query(
      `SELECT inspection_date, vin, vin_display, total_grade
       FROM pave_reports
       WHERE incoming_email_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [incomingEmailId],
    )
  ).rows[0];
  if (!r) return false;
  const vinEmpty = !String(r.vin || '').trim() && !String(r.vin_display || '').trim();
  if (r.inspection_date == null) return true;
  if (vinEmpty && r.total_grade == null) return true;
  return false;
}

async function upsertIncomingEmail({
  provider,
  email,
  force = false,
  reprocessFailed = false,
  reprocessPartial = false,
  reprocessSparse = false,
}) {
  const providerNorm = normalizeEmailProvider(provider);
  const existing = (await query(
    `SELECT
       ie.id,
       ie.processing_status,
       EXISTS (
         SELECT 1
         FROM pave_reports pr
         WHERE pr.incoming_email_id = ie.id
       ) AS has_report_row
     FROM incoming_emails ie
     WHERE ie.provider = $1 AND ie.message_id = $2`,
    [providerNorm, email.messageId]
  )).rows[0];

  if (existing) {
    const st = String(existing.processing_status || '').toLowerCase();
    const hasReportRow = Boolean(existing.has_report_row);
    let sparseSummary = false;
    if (reprocessSparse && hasReportRow) {
      sparseSummary = await incomingPaveSummaryLooksIncomplete(existing.id);
    }
    const shouldReprocess =
      force ||
      (st === 'failed' && reprocessFailed) ||
      (st === 'partial' && reprocessPartial) ||
      !hasReportRow ||
      sparseSummary;
    if (!shouldReprocess) return { action: 'skip', id: existing.id, existing };
    await query(
      `UPDATE incoming_emails
       SET
         thread_id = $2,
         subject = $3,
         from_email = $4,
         from_name = $5,
         to_email = $6,
         cc = $7,
         received_at = $8,
         sent_at = $9,
         raw_body_text = $10,
         raw_body_html = $11,
         updated_at = NOW()
       WHERE id = $1`,
      [
        existing.id,
        email.threadId || null,
        email.subject || null,
        email.fromEmail || null,
        email.fromName || null,
        email.toEmail || null,
        email.cc || null,
        email.receivedAt || null,
        email.sentAt || null,
        email.rawBodyText || null,
        email.rawBodyHtml || null,
      ]
    );
    return { action: 'reprocess', id: existing.id, existing };
  }

  const res = await query(
    `INSERT INTO incoming_emails (
      provider, message_id, thread_id, subject, from_email, from_name, to_email, cc,
      received_at, sent_at, raw_body_text, raw_body_html, processing_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id`,
    [
      providerNorm,
      email.messageId,
      email.threadId || null,
      email.subject || null,
      email.fromEmail || null,
      email.fromName || null,
      email.toEmail || null,
      email.cc || null,
      email.receivedAt || null,
      email.sentAt || null,
      email.rawBodyText || null,
      email.rawBodyHtml || null,
      'pending',
    ]
  );
  return { action: 'insert', id: res.rows[0].id, existing: null };
}

async function deleteParsedForIncoming(incomingEmailId, { deleteDownloadedReports = true } = {}) {
  await query(
    `DELETE FROM pave_report_items
     WHERE pave_report_id IN (SELECT id FROM pave_reports WHERE incoming_email_id = $1)`,
    [incomingEmailId]
  );
  await query(`DELETE FROM pave_reports WHERE incoming_email_id = $1`, [incomingEmailId]);
  if (deleteDownloadedReports) {
    await query(`DELETE FROM downloaded_reports WHERE incoming_email_id = $1`, [incomingEmailId]);
  }
}

/**
 * Clear sparse pave rows and set incoming back to pending so stage B can re-download/parse.
 * Keeps downloaded_reports by default (faster re-parse when PDF on disk is fine).
 * @param {string} providerNorm
 * @param {number} maxRows
 */
async function requeueSparsePaveIncomingEmails(providerNorm, maxRows = 100) {
  const lim = Math.max(1, Math.min(2000, Number(maxRows) || 100));
  const res = await query(
    `SELECT DISTINCT ie.id, ie.received_at
     FROM incoming_emails ie
     INNER JOIN pave_reports pr ON pr.incoming_email_id = ie.id
     WHERE ie.provider = $1
       AND ie.extracted_report_url IS NOT NULL
       AND (
         pr.inspection_date IS NULL
         OR (
           NULLIF(TRIM(COALESCE(pr.vin, '')), '') IS NULL
           AND NULLIF(TRIM(COALESCE(pr.vin_display, '')), '') IS NULL
           AND pr.total_grade IS NULL
         )
       )
     ORDER BY ie.received_at DESC NULLS LAST, ie.id DESC
     LIMIT $2`,
    [providerNorm, lim],
  );
  const ids = (res.rows || []).map((r) => r.id);
  for (const id of ids) {
    await deleteParsedForIncoming(id, { deleteDownloadedReports: false });
    await updateIncomingProcessingStatus(id, { processing_status: 'pending', parsing_errors: null });
  }
  return ids.length;
}

async function updateIncomingProcessingStatus(incomingEmailId, patch) {
  const { processing_status, parsing_errors, extracted_report_url, raw_extraction_payload } = patch || {};
  const sets = [];
  const values = [];
  let idx = 1;

  if (processing_status !== undefined) {
    sets.push(`processing_status = $${idx}`);
    values.push(processing_status);
    idx++;
  }
  if (parsing_errors !== undefined) {
    sets.push(`parsing_errors = $${idx}`);
    values.push(parsing_errors);
    idx++;
  }
  if (extracted_report_url !== undefined) {
    sets.push(`extracted_report_url = $${idx}`);
    values.push(extracted_report_url);
    idx++;
  }
  if (raw_extraction_payload !== undefined) {
    sets.push(`raw_extraction_payload = $${idx}`);
    if (raw_extraction_payload != null && typeof raw_extraction_payload === 'object') {
      values.push(safeJsonStringify(raw_extraction_payload));
    } else {
      values.push(raw_extraction_payload);
    }
    idx++;
  }
  if (!sets.length) return;

  values.push(incomingEmailId);
  await query(
    `UPDATE incoming_emails SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
    values
  );
}

async function selectPendingReportDownloads(providerNorm, limit) {
  const lim = Math.max(1, Math.min(5000, Number(limit) || 1));
  const res = await query(
    `SELECT id, message_id, thread_id, subject, from_email, extracted_report_url,
            raw_body_text, raw_body_html, raw_extraction_payload
     FROM incoming_emails ie
     WHERE ie.provider = $1
       AND ie.extracted_report_url IS NOT NULL
       AND ie.processing_status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM pave_reports pr WHERE pr.incoming_email_id = ie.id)
     ORDER BY ie.received_at ASC NULLS LAST, ie.id ASC
     LIMIT $2`,
    [providerNorm, lim]
  );
  return res.rows || [];
}

async function runPool(items, concurrency, fn) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return;
  let next = 0;
  async function worker(workerId) {
    while (true) {
      const idx = next++;
      if (idx >= list.length) break;
      await fn(list[idx], workerId, idx);
    }
  }
  const n = Math.min(Math.max(1, concurrency), list.length);
  await Promise.all(Array.from({ length: n }, (_, w) => worker(w)));
}

/**
 * Stage B: download + parse + persist one queued incoming row.
 */
async function processReportJob({
  row,
  storageDir,
  provider,
  providerImpl,
  perEmailTimeoutMs,
  portalSession,
  workerId,
  results,
  timingAgg,
}) {
  const incomingEmailId = row.id;
  const emailRef = row.message_id || `incoming:${incomingEmailId}`;
  const extracted_report_url = row.extracted_report_url;
  const emailObj = {
    messageId: row.message_id,
    threadId: row.thread_id,
    subject: row.subject,
    fromEmail: row.from_email,
    rawBodyText: row.raw_body_text,
    rawBodyHtml: row.raw_body_html,
  };

  const p = parsePaveEmail({
    subject: row.subject,
    fromEmail: row.from_email,
    rawBodyText: row.raw_body_text,
    rawBodyHtml: row.raw_body_html,
  });
  const parsedEmailProvider = p.provider || 'pave';
  const parsedExternalReportId = p.external_report_id || null;
  const parsedVehicleLabel = p.vehicle_label || null;
  const parsedInspectionLanguage = p.language || null;
  const parsedStatus = p.status || null;
  const extracted_payload = p.raw_extraction_payload || {};
  const warnings = Array.isArray(p.warnings) ? p.warnings : [];

  let downloaded = null;
  let downloadedReportId = null;

  const existingDownloaded = (
    await query(
      `SELECT id, source_url, file_path, file_name, mime_type, file_sha256
       FROM downloaded_reports
       WHERE incoming_email_id = $1 AND source_url = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [incomingEmailId, extracted_report_url]
    )
  ).rows[0];

  const hasPortalCreds =
    !!String(process.env.REPORT_PORTAL_USERNAME || '').trim() &&
    !!String(process.env.REPORT_PORTAL_PASSWORD || '').trim();

  if (existingDownloaded?.file_path) {
    try {
      const buf = await fs.readFile(existingDownloaded.file_path);
      const cacheOk = buf?.length && (await probePdfBufferParseable(buf));
      if (buf?.length && !cacheOk && hasPortalCreds) {
        console.warn('[pave-sync] cached file is not a parseable PDF; discarding cache and re-downloading', {
          incomingEmailId,
          downloadedReportId: existingDownloaded.id,
          path: existingDownloaded.file_path,
        });
        await query(`DELETE FROM downloaded_reports WHERE id = $1`, [existingDownloaded.id]);
        downloaded = null;
        downloadedReportId = null;
      } else {
        downloadedReportId = existingDownloaded.id;
        downloaded = {
          buffer: buf,
          filePath: existingDownloaded.file_path,
          fileName: existingDownloaded.file_name,
          mimeType: existingDownloaded.mime_type,
          fileSha256: existingDownloaded.file_sha256,
          via: 'cache',
          htmlReportSummary: null,
        };
      }
    } catch (_) {
      downloaded = null;
      downloadedReportId = null;
    }
  }

  const page = portalSession?.pageForWorker(workerId);
  const dlStart = Date.now();
  if (!downloaded) {
    downloaded = await withTimeout(
      downloadReportFromPortal({
        reportUrl: extracted_report_url,
        storageDir,
        portalSession,
        page,
      }),
      perEmailTimeoutMs,
      `Per-email timeout after ${perEmailTimeoutMs}ms during download/processing`
    );
    const dlMs = Date.now() - dlStart;
    timingAgg.downloadMsTotal += dlMs;
    if (downloaded.via === 'http') {
      timingAgg.httpDownloads += 1;
      results.stageBHttpDownloads = (results.stageBHttpDownloads || 0) + 1;
    } else {
      timingAgg.playwrightDownloads += 1;
      results.stageBPlaywrightDownloads = (results.stageBPlaywrightDownloads || 0) + 1;
    }

    const fileSize = downloaded.buffer?.length ?? null;
    if (downloaded.pdfDownloadFailed) {
      downloadedReportId = null;
    } else {
      const downloadedRes = await query(
        `INSERT INTO downloaded_reports (
          incoming_email_id, source_url, file_name, mime_type, file_size, file_path,
          download_status, file_sha256
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id`,
        [
          incomingEmailId,
          extracted_report_url,
          downloaded.fileName || null,
          downloaded.mimeType || null,
          fileSize,
          downloaded.filePath,
          'downloaded',
          downloaded.fileSha256 || null,
        ]
      );
      downloadedReportId = downloadedRes.rows[0].id;
    }
  } else {
    timingAgg.cacheHits += 1;
    results.stageBCacheHits = (results.stageBCacheHits || 0) + 1;
  }

  const htmlSummary = downloaded.htmlReportSummary || null;

  const parseStart = Date.now();
  let parsedPavePdf;
  if (downloaded.pdfDownloadFailed || !downloaded.buffer?.length) {
    const reason =
      downloaded.pdfFailureReason ||
      'HTML summary extracted; PDF download failed or no PDF bytes (portal partial result).';
    parsedPavePdf = {
      report: {},
      items: [],
      warnings: [reason],
      rawParsedPayload: null,
    };
  } else {
    parsedPavePdf = await parsePavePdf(downloaded.buffer);
  }
  timingAgg.pdfParseMsTotal += Date.now() - parseStart;

  const report = parsedPavePdf?.report || {};
  const items = Array.isArray(parsedPavePdf?.items) ? parsedPavePdf.items : [];
  let parseWarnings = (Array.isArray(parsedPavePdf?.warnings) ? parsedPavePdf.warnings : []).concat(warnings || []);

  const merged = mergeHtmlAndPdfReportSummary(htmlSummary, report, { vehicle_label: parsedVehicleLabel });

  parseWarnings = filterPdfWarningsSupersededByMerge(parseWarnings, merged, items.length);

  const pdfHardFail = parseWarnings.some((w) => /Failed to parse PDF|Invalid PDF structure/i.test(String(w)));
  const htmlOk = htmlSummaryLooksUsable(htmlSummary);
  const pdfMissing = !!downloaded.pdfDownloadFailed;

  if (pdfMissing && htmlOk) {
    parseWarnings.push(
      'HTML summary extracted from report page; PDF download or PDF response failed. Damage lines may be empty.'
    );
  }

  if (pdfHardFail && htmlOk && !pdfMissing) {
    parseWarnings.push('Summary extracted from report page; PDF damage parsing failed or PDF unreadable.');
  }

  const summarySource =
    htmlOk && pdfMissing
      ? 'html_only_pdf_download_failed'
      : htmlOk && pdfHardFail
        ? 'html_only_pdf_unreadable'
        : htmlOk && items.length
          ? 'html_and_pdf'
          : htmlOk
            ? 'html_and_pdf_partial_items'
            : pdfHardFail && !htmlOk
              ? 'http_bytes_invalid_pdf_no_html'
              : 'pdf';

  const incomingSummary = {
    provider: parsedEmailProvider || 'pave',
    external_report_id: parsedExternalReportId || null,
    report_url: extracted_report_url || null,
    vehicle_label: merged.vehicle_label,
    vin: merged.vin,
    vin_display: merged.vin_display,
    inspection_date: merged.inspection_date,
    inspection_language: parsedInspectionLanguage || null,
    total_grade: merged.total_grade ?? null,
    total_grade_label: merged.total_grade_label || null,
    total_damage_score: merged.total_damage_score ?? null,
    front_score: merged.front_score ?? null,
    back_score: merged.back_score ?? null,
    left_score: merged.left_score ?? null,
    right_score: merged.right_score ?? null,
    windshield_status: merged.windshield_status || null,
    status: parsedStatus || null,
  };

  const rawExtractedPayloadForRow = {
    email_extracted_payload: extracted_payload,
    parse_email_warnings: warnings,
    parsed_pdf: parsedPavePdf?.rawParsedPayload || null,
    html_report_summary: htmlSummary,
    summary_source: summarySource,
  };

  const dedupe = await findExistingPaveReportForDedupe({
    externalReportId: incomingSummary.external_report_id,
    inspectionDate: incomingSummary.inspection_date,
    fileSha256: downloaded.fileSha256 || null,
  });

  let createdReportRowId = null;
  let reportAction = null;

  if (dedupe.existing && !isIncomingParseRicher(dedupe.existing, incomingSummary, items)) {
    createdReportRowId = dedupe.existing.id;
    reportAction = 'duplicateSkipped';
    results.duplicateSkipped += 1;
  } else {
    const upsert = await upsertPaveReportSummary({
      existingId: dedupe.existing?.id || null,
      incomingEmailId,
      downloadedReportId,
      summary: incomingSummary,
      warningsText: parseWarnings.join('; '),
      errorsText: null,
      rawExtractedPayload: rawExtractedPayloadForRow,
    });
    createdReportRowId = upsert.id;
    reportAction = upsert.action;
    await replacePaveReportItems({ paveReportId: createdReportRowId, items });
  }

  if (!createdReportRowId) {
    await updateIncomingProcessingStatus(incomingEmailId, {
      processing_status: 'partial',
      parsing_errors: 'Downloaded report parsed but no report row inserted',
    });
    results.partial += 1;
  } else {
    await updateIncomingProcessingStatus(incomingEmailId, {
      processing_status: parseWarnings.length ? 'partial' : 'processed',
      parsing_errors: parseWarnings.length ? parseWarnings.join('; ') : null,
    });
    if (reportAction === 'updated') {
      results.updated += 1;
      results.imported += 1;
    } else if (reportAction === 'created') {
      results.created += 1;
      results.imported += 1;
    }
  }

  if (createdReportRowId) {
    const imapUid = row.raw_extraction_payload?._ingestion_meta?.imapUid;
    const rawMessage = imapUid != null && imapUid !== undefined ? { _imap: { uid: imapUid } } : null;
    await providerImpl.markAsProcessed({
      messageId: emailObj.messageId,
      threadId: emailObj.threadId,
      rawMessage,
    });
  }

  results.stageBCompleted += 1;
  results.emailsProcessed += 1;
  console.log('[pave-sync] stageB email done', { emailRef, action: reportAction });
}

export async function syncGmailReports({
  limit = 20,
  force = false,
  mode = 'manual',
  reprocessFailed = false,
  reprocessPartial = false,
  /** Re-download/re-parse when pave_reports exists but VIN/grade/inspection_date are still empty */
  reprocessSparse = false,
  sourceEmails = null,
} = {}) {
  const provider = process.env.EMAIL_PROVIDER || '';
  const providerImpl = createEmailProvider();
  const perEmailTimeoutMs = Number(process.env.PAVE_SYNC_PER_EMAIL_TIMEOUT_MS || 120000);

  if (syncRunningGlobal) {
    console.log('[pave-sync] sync already running; skipping new run', { mode });
    return {
      mode,
      total: 0,
      scanned: 0,
      matched: 0,
      emailsProcessed: 0,
      created: 0,
      updated: 0,
      duplicateSkipped: 0,
      imported: 0,
      skipped: 1,
      filteredOut: 0,
      failed: 0,
      partial: 0,
      note: 'sync already running',
      timings: { totalMs: 0, skippedBecauseSyncRunning: true },
    };
  }

  syncRunningGlobal = true;
  const syncStarted = Date.now();
  const providerNorm = normalizeEmailProvider(provider);
  const reportConc = Math.max(1, Math.min(8, Number(process.env.PAVE_REPORT_PROCESS_CONCURRENCY || 3)));
  const processMax = Math.min(
    5000,
    Math.max(1, Number(process.env.PAVE_REPORT_PROCESS_MAX_PER_RUN || limit || 100))
  );
  const pendingDownloadCap = reprocessSparse
    ? Math.min(2000, Math.max(processMax, Number(process.env.PAVE_REQUEUE_SPARSE_MAX || 200)))
    : processMax;

  const timings = {
    emailSearchMs: 0,
    emailParseMsTotal: 0,
    stageAMs: 0,
    stageBMs: 0,
    stageBQueued: 0,
    portalLoginMs: 0,
    sessionReuseCount: 0,
    loginPerformedCount: 0,
    downloadMsTotal: 0,
    pdfParseMsTotal: 0,
    duplicateSkipped: 0,
    matchingEmailsFound: 0,
    totalMs: 0,
  };

  const tSearch = Date.now();
  const rawList = Array.isArray(sourceEmails)
    ? sourceEmails
    : await providerImpl.fetchUnreadEmails({ maxResults: Number(limit) || 20 });
  timings.emailSearchMs = Date.now() - tSearch;

  const emails = Array.isArray(rawList) ? rawList.slice(0, limit) : [];

  const storageDir = await ensureDirs();

  const results = {
    mode,
    total: emails.length,
    scanned: emails.length,
    matched: 0,
    emailsProcessed: 0,
    created: 0,
    updated: 0,
    duplicateSkipped: 0,
    imported: 0,
    skipped: 0,
    filteredOut: 0,
    failed: 0,
    partial: 0,
    stageAQueued: 0,
    stageBQueued: 0,
    stageBCompleted: 0,
    stageBHttpDownloads: 0,
    stageBPlaywrightDownloads: 0,
    stageBCacheHits: 0,
    sparseRequeued: 0,
    timings,
  };
  console.log('[pave-sync] sync start', {
    mode,
    provider,
    scanned: emails.length,
    limit,
    reprocessSparse,
    perEmailTimeoutMs,
    reportConcurrency: reportConc,
    reportProcessMaxPerRun: processMax,
    pendingDownloadCap,
    emailSearchMs: timings.emailSearchMs,
  });

  try {
    if (reprocessSparse) {
      const n = await requeueSparsePaveIncomingEmails(providerNorm, pendingDownloadCap);
      results.sparseRequeued = n;
      if (n) console.log('[pave-sync] requeued sparse pave imports for re-parse', { count: n, cap: pendingDownloadCap });
    }

    const tStageA = Date.now();
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      let incomingEmailId = null;
      try {
        const emailRef = email.messageId || `idx:${i + 1}`;
        const subjectShort = String(email.subject || '').slice(0, 100);
        console.log('[pave-sync] email start', { index: i + 1, total: emails.length, emailRef, subject: subjectShort });
        const paveMatch = isLikelyPaveEmail({
          subject: email.subject,
          fromEmail: email.fromEmail,
          rawBodyText: email.rawBodyText,
          rawBodyHtml: email.rawBodyHtml,
        });
        if (!paveMatch) {
          results.filteredOut += 1;
          console.log('[pave-sync] email filtered', { index: i + 1, total: emails.length, emailRef });
          continue;
        }

        const { action, id } = await upsertIncomingEmail({
          provider,
          email,
          force,
          reprocessFailed,
          reprocessPartial,
          reprocessSparse,
        });
        incomingEmailId = id;

        if (action === 'skip') {
          results.skipped += 1;
          console.log('[pave-sync] email skipped', {
            index: i + 1,
            total: emails.length,
            emailRef,
            reason: 'already-processed-and-reprocess-disabled',
          });
          continue;
        }
        if (action === 'reprocess' || action === 'insert') {
          if (action === 'reprocess') {
            const hasDownloaded = (await query(
              `SELECT 1 FROM downloaded_reports WHERE incoming_email_id = $1 LIMIT 1`,
              [incomingEmailId]
            )).rows.length > 0;
            // If we already downloaded bytes before, keep downloaded_reports so we can re-parse without re-downloading.
            await deleteParsedForIncoming(incomingEmailId, { deleteDownloadedReports: !hasDownloaded });
          }
          await updateIncomingProcessingStatus(incomingEmailId, { processing_status: 'pending', parsing_errors: null });
        }

        const tParse = Date.now();
        const p = parsePaveEmail({
          subject: email.subject,
          fromEmail: email.fromEmail,
          rawBodyText: email.rawBodyText,
          rawBodyHtml: email.rawBodyHtml,
        });
        const parseEmailMs = Date.now() - tParse;
        timings.emailParseMsTotal += parseEmailMs;

        const extracted_report_url = p.report_url || null;
        const extracted_payload = {
          ...(p.raw_extraction_payload || {}),
          _ingestion_meta: {
            imapUid: email.rawMessage?._imap?.uid,
          },
        };
        await updateIncomingProcessingStatus(incomingEmailId, {
          extracted_report_url,
          raw_extraction_payload: extracted_payload,
        });

        if (!extracted_report_url) {
          await updateIncomingProcessingStatus(incomingEmailId, {
            processing_status: 'failed',
            parsing_errors: 'Report URL not found in email body',
          });
          results.failed += 1;
          console.log('[pave-sync] email no-report-url', { index: i + 1, total: emails.length, emailRef });
          continue;
        }
        results.matched += 1;
        results.stageAQueued = (results.stageAQueued || 0) + 1;

        await updateIncomingProcessingStatus(incomingEmailId, {
          processing_status: 'pending',
          parsing_errors: null,
        });

        console.log('[pave-sync] stageA queued for report download', {
          index: i + 1,
          total: emails.length,
          emailRef,
          parseEmailMs,
          matched: results.matched,
        });
      } catch (err) {
        results.failed += 1;
        if (incomingEmailId) {
          try {
            await updateIncomingProcessingStatus(incomingEmailId, {
              processing_status: 'failed',
              parsing_errors: String(err?.message || err || 'Unknown error'),
            });
          } catch (_) {}
        }
        console.error('[pave-sync] stageA error:', err);
      }
    }
    timings.stageAMs = Date.now() - tStageA;

    const pendingJobs = await selectPendingReportDownloads(providerNorm, pendingDownloadCap);
    results.stageBQueued = pendingJobs.length;
    timings.stageBQueued = pendingJobs.length;

    console.log('[pave-sync] stageB start', {
      queued: pendingJobs.length,
      concurrency: reportConc,
      processMaxPerRun: processMax,
    });

    const tStageB = Date.now();
    const timingAgg = {
      downloadMsTotal: 0,
      pdfParseMsTotal: 0,
      httpDownloads: 0,
      playwrightDownloads: 0,
      cacheHits: 0,
    };

    const hasPortal =
      !!String(process.env.REPORT_PORTAL_USERNAME || '').trim() &&
      !!String(process.env.REPORT_PORTAL_PASSWORD || '').trim();

    let portalSession = null;
    if (hasPortal && pendingJobs.length > 0) {
      portalSession = new PavePortalDownloadSession({ concurrency: reportConc });
      await portalSession.init();
    }
    try {
      await runPool(pendingJobs, reportConc, async (row, workerId) => {
        try {
          await processReportJob({
            row,
            storageDir,
            provider,
            providerImpl,
            perEmailTimeoutMs,
            portalSession,
            workerId,
            results,
            timingAgg,
          });
        } catch (err) {
          results.failed += 1;
          try {
            await updateIncomingProcessingStatus(row.id, {
              processing_status: 'failed',
              parsing_errors: String(err?.message || err || 'Unknown error'),
            });
          } catch (_) {}
          const errMsg = String(err?.message || err);
          const phase =
            errMsg.includes('PAVE_PDF_CONTROL_MISSING') || errMsg.includes('pdf button missing')
              ? 'report page loaded; pdf control missing / selector timeout'
              : errMsg.includes('PAVE_LOGIN_FAILURE') || errMsg.includes('login page')
                ? 'login failure'
                : errMsg.includes('PAVE_REPORT_SHELL_TIMEOUT')
                  ? 'report shell timeout'
                  : undefined;
          console.error('[pave-sync] stageB job failed', {
            incomingEmailId: row.id,
            phase,
            error: errMsg,
          });
        }
      });
    } finally {
      if (portalSession) await portalSession.close();
    }

    timings.stageBMs = Date.now() - tStageB;
    timings.downloadMsTotal = timingAgg.downloadMsTotal;
    timings.pdfParseMsTotal = timingAgg.pdfParseMsTotal;
    timings.portalLoginMs = portalSession?.stats?.loginMsTotal ?? 0;
    timings.sessionReuseCount = portalSession?.getSessionReuseCount?.() ?? 0;
    timings.loginPerformedCount = portalSession?.getLoginCount?.() ?? 0;
    timings.duplicateSkipped = results.duplicateSkipped;
    timings.matchingEmailsFound = results.matched;
    timings.totalMs = Date.now() - syncStarted;
    results.timings = timings;

    console.log('[pave-sync] timings summary', timings);
  } finally {
    syncRunningGlobal = false;
    console.log('[pave-sync] sync end', {
      mode,
      scanned: results.scanned,
      matched: results.matched,
      imported: results.imported,
      filteredOut: results.filteredOut,
      skipped: results.skipped,
      partial: results.partial,
      failed: results.failed,
      sparseRequeued: results.sparseRequeued,
      stageAQueued: results.stageAQueued,
      stageBQueued: results.stageBQueued,
      stageBCompleted: results.stageBCompleted,
      timings: results.timings,
    });
  }

  return results;
}

/** Scalar SQL: fleet car plate when full VIN (alnum) last 4 chars match `cars.vin` last 4. */
const SQL_MATCHED_PLATE_BY_VIN_SUFFIX = `(
  SELECT c.license_plate
  FROM cars c
  WHERE c.vin IS NOT NULL
    AND LENGTH(REGEXP_REPLACE(UPPER(TRIM(c.vin)), '[^A-Z0-9]', '', 'g')) >= 4
    AND LENGTH(
      REGEXP_REPLACE(
        UPPER(COALESCE(NULLIF(TRIM(pr.vin_display), ''), NULLIF(TRIM(pr.vin), ''), '')),
        '[^A-Z0-9]',
        '',
        'g'
      )
    ) >= 4
    AND RIGHT(REGEXP_REPLACE(UPPER(TRIM(c.vin)), '[^A-Z0-9]', '', 'g'), 4) =
        RIGHT(
          REGEXP_REPLACE(
            UPPER(COALESCE(NULLIF(TRIM(pr.vin_display), ''), NULLIF(TRIM(pr.vin), ''), '')),
            '[^A-Z0-9]',
            '',
            'g'
          ),
          4
        )
  ORDER BY c.id
  LIMIT 1
)`;

/**
 * Dashboard KPIs for imported PAVE reports (email/portal pipeline), plus fleet context.
 */
export async function getPaveGmailInspectionStats() {
  const agg = await query(`
    SELECT
      COUNT(*)::int AS total_inspections,
      COUNT(*) FILTER (WHERE pr.status ILIKE '%completed%')::int AS completed_email_status,
      COUNT(*) FILTER (WHERE pr.status ILIKE '%expired%')::int AS expired_email_status,
      COUNT(*) FILTER (WHERE pr.status ILIKE '%progress%')::int AS in_progress_email_status,
      COUNT(*) FILTER (WHERE inc.processing_status IN ('partial', 'failed'))::int AS needs_review_ingest,
      COUNT(*) FILTER (
        WHERE EXISTS (SELECT 1 FROM pave_report_items pri WHERE pri.pave_report_id = pr.id)
          OR COALESCE(pr.total_damage_score, 0) > 0
      )::int AS reports_with_damages,
      AVG(pr.total_grade) FILTER (WHERE pr.total_grade IS NOT NULL)::float AS avg_grade,
      COUNT(*) FILTER (WHERE pr.total_grade IS NOT NULL)::int AS with_grade,
      COUNT(*) FILTER (
        WHERE pr.created_at::date = CURRENT_DATE
          OR pr.inspection_date = CURRENT_DATE
      )::int AS today_inspections
    FROM pave_reports pr
    JOIN incoming_emails inc ON inc.id = pr.incoming_email_id
  `);
  const matched = await query(`
    SELECT COUNT(*)::int AS n
    FROM pave_reports pr
    WHERE EXISTS (
      SELECT 1
      FROM cars c
      WHERE c.vin IS NOT NULL
        AND LENGTH(REGEXP_REPLACE(UPPER(TRIM(c.vin)), '[^A-Z0-9]', '', 'g')) >= 4
        AND LENGTH(
          REGEXP_REPLACE(
            UPPER(COALESCE(NULLIF(TRIM(pr.vin_display), ''), NULLIF(TRIM(pr.vin), ''), '')),
            '[^A-Z0-9]',
            '',
            'g'
          )
        ) >= 4
        AND RIGHT(REGEXP_REPLACE(UPPER(TRIM(c.vin)), '[^A-Z0-9]', '', 'g'), 4) =
            RIGHT(
              REGEXP_REPLACE(
                UPPER(COALESCE(NULLIF(TRIM(pr.vin_display), ''), NULLIF(TRIM(pr.vin), ''), '')),
                '[^A-Z0-9]',
                '',
                'g'
              ),
              4
            )
    )
  `);
  const cars = await query(`SELECT COUNT(*)::int AS n FROM cars`);

  const a = agg.rows[0] || {};
  return {
    totalInspections: a.total_inspections ?? 0,
    completed: a.completed_email_status ?? 0,
    expired: a.expired_email_status ?? 0,
    inProgress: a.in_progress_email_status ?? 0,
    needsReview: a.needs_review_ingest ?? 0,
    damagesFound: a.reports_with_damages ?? 0,
    avgGrade: a.avg_grade != null ? Math.round(Number(a.avg_grade) * 100) / 100 : null,
    withGrade: a.with_grade ?? 0,
    todaysInspections: a.today_inspections ?? 0,
    inspectionsMatchedToFleet: matched.rows[0]?.n ?? 0,
    totalCarsInDb: cars.rows[0]?.n ?? 0,
  };
}

/**
 * Fleet cars with no imported `pave_reports` row matching VIN last 4 (same rule as `matched_license_plate`).
 * Plus cars where VIN is missing or too short to match.
 */
export async function getCarsWithoutPaveInspection() {
  const noReport = await query(`
    SELECT c.id, c.vehicle_id, c.license_plate, c.vin, c.model, c.year, c.status, c.station
    FROM cars c
    WHERE c.vin IS NOT NULL
      AND LENGTH(REGEXP_REPLACE(UPPER(TRIM(c.vin)), '[^A-Z0-9]', '', 'g')) >= 4
      AND NOT EXISTS (
        SELECT 1 FROM pave_reports pr
        WHERE LENGTH(
          REGEXP_REPLACE(
            UPPER(COALESCE(NULLIF(TRIM(pr.vin_display), ''), NULLIF(TRIM(pr.vin), ''), '')),
            '[^A-Z0-9]',
            '',
            'g'
          )
        ) >= 4
          AND RIGHT(REGEXP_REPLACE(UPPER(TRIM(c.vin)), '[^A-Z0-9]', '', 'g'), 4) =
              RIGHT(
                REGEXP_REPLACE(
                  UPPER(COALESCE(NULLIF(TRIM(pr.vin_display), ''), NULLIF(TRIM(pr.vin), ''), '')),
                  '[^A-Z0-9]',
                  '',
                  'g'
                ),
                4
              )
      )
    ORDER BY c.license_plate NULLS LAST, c.vehicle_id NULLS LAST, c.id
  `);
  const noVin = await query(`
    SELECT c.id, c.vehicle_id, c.license_plate, c.vin, c.model, c.year, c.status, c.station
    FROM cars c
    WHERE c.vin IS NULL
       OR LENGTH(REGEXP_REPLACE(UPPER(TRIM(COALESCE(c.vin, ''))), '[^A-Z0-9]', '', 'g')) < 4
    ORDER BY c.license_plate NULLS LAST, c.vehicle_id NULLS LAST, c.id
  `);
  return {
    withoutMatchingReport: noReport.rows || [],
    withoutVinForMatch: noVin.rows || [],
  };
}

/**
 * Imported Gmail/portal `pave_reports` linked to a fleet car:
 * - same VIN last-4 rule as `matched_license_plate` on the PAVE list, or
 * - exact license plate match on `pr.plate_number` (for cars without a usable VIN on file).
 * @param {number|string} carId - `cars.id`
 * @returns {Promise<object[]>} same row shape as {@link listPaveGmailReports}
 */
export async function listPaveGmailReportsForCar(carId) {
  const id = Number(carId);
  if (!Number.isFinite(id) || id <= 0) return [];

  const carCheck = await query(`SELECT 1 FROM cars WHERE id = $1`, [id]);
  if (!carCheck.rows?.length) return [];

  const matchCar = `
    (
      EXISTS (
        SELECT 1 FROM cars c
        WHERE c.id = $1
          AND c.vin IS NOT NULL
          AND LENGTH(REGEXP_REPLACE(UPPER(TRIM(c.vin)), '[^A-Z0-9]', '', 'g')) >= 4
          AND LENGTH(
            REGEXP_REPLACE(
              UPPER(COALESCE(NULLIF(TRIM(pr.vin_display), ''), NULLIF(TRIM(pr.vin), ''), '')),
              '[^A-Z0-9]',
              '',
              'g'
            )
          ) >= 4
          AND RIGHT(REGEXP_REPLACE(UPPER(TRIM(c.vin)), '[^A-Z0-9]', '', 'g'), 4) =
              RIGHT(
                REGEXP_REPLACE(
                  UPPER(COALESCE(NULLIF(TRIM(pr.vin_display), ''), NULLIF(TRIM(pr.vin), ''), '')),
                  '[^A-Z0-9]',
                  '',
                  'g'
                ),
                4
              )
      )
      OR EXISTS (
        SELECT 1 FROM cars c
        WHERE c.id = $1
          AND NULLIF(TRIM(c.license_plate), '') IS NOT NULL
          AND NULLIF(TRIM(pr.plate_number), '') IS NOT NULL
          AND TRIM(UPPER(pr.plate_number)) = TRIM(UPPER(c.license_plate))
      )
    )
  `;

  const q = `
    SELECT
      pr.id,
      pr.incoming_email_id,
      pr.downloaded_report_id,
      pr.plate_number,
      pr.vehicle_id,
      pr.driver_name,
      pr.report_type,
      pr.report_date,
      pr.incident_date,
      pr.location,
      pr.mileage,
      pr.status,
      pr.reference_number,
      pr.external_report_id,
      pr.provider,
      pr.report_url,
      pr.vehicle_label,
      pr.vin,
      pr.vin_display,
      pr.inspection_date,
      pr.inspection_language,
      pr.total_grade,
      pr.total_grade_label,
      pr.total_damage_score,
      pr.front_score,
      pr.back_score,
      pr.left_score,
      pr.right_score,
      pr.windshield_status,
      pr.notes,
      pr.created_at,
      inc.subject AS source_email_subject,
      inc.from_email AS source_email_from,
      inc.received_at AS source_email_received_at,
      inc.extracted_report_url AS extracted_report_url,
      dr.file_name AS downloaded_file_name,
      dr.mime_type AS downloaded_mime_type,
      dr.file_path AS downloaded_file_path,
      inc.processing_status AS incoming_processing_status,
      ${SQL_MATCHED_PLATE_BY_VIN_SUFFIX} AS matched_license_plate
    FROM pave_reports pr
    JOIN incoming_emails inc ON inc.id = pr.incoming_email_id
    LEFT JOIN downloaded_reports dr ON dr.id = pr.downloaded_report_id
    WHERE ${matchCar}
    ORDER BY pr.created_at DESC
    LIMIT 200
  `;
  const res = await query(q, [id]);
  return (res.rows || []).map(withInspectionDateEffective);
}

export async function listPaveGmailReports(filters = {}) {
  const params = [];
  const where = ['1=1'];
  let idx = 1;

  if (filters.plate_number) {
    where.push(`pr.plate_number ILIKE $${idx}`);
    params.push(`%${String(filters.plate_number).trim()}%`);
    idx++;
  }
  if (filters.driver_name) {
    where.push(`pr.driver_name ILIKE $${idx}`);
    params.push(`%${String(filters.driver_name).trim()}%`);
    idx++;
  }
  if (filters.report_type) {
    where.push(`pr.report_type ILIKE $${idx}`);
    params.push(`%${String(filters.report_type).trim()}%`);
    idx++;
  }
  if (filters.status) {
    where.push(`pr.status ILIKE $${idx}`);
    params.push(`%${String(filters.status).trim()}%`);
    idx++;
  }
  if (filters.date_from) {
    where.push(`COALESCE(pr.inspection_date, pr.report_date) >= $${idx}`);
    params.push(filters.date_from);
    idx++;
  }
  if (filters.date_to) {
    where.push(`COALESCE(pr.inspection_date, pr.report_date) <= $${idx}`);
    params.push(filters.date_to);
    idx++;
  }

  const q = `
    SELECT
      pr.id,
      pr.incoming_email_id,
      pr.downloaded_report_id,
      pr.plate_number,
      pr.vehicle_id,
      pr.driver_name,
      pr.report_type,
      pr.report_date,
      pr.incident_date,
      pr.location,
      pr.mileage,
      pr.status,
      pr.reference_number,
      pr.external_report_id,
      pr.provider,
      pr.report_url,
      pr.vehicle_label,
      pr.vin,
      pr.vin_display,
      pr.inspection_date,
      pr.inspection_language,
      pr.total_grade,
      pr.total_grade_label,
      pr.total_damage_score,
      pr.front_score,
      pr.back_score,
      pr.left_score,
      pr.right_score,
      pr.windshield_status,
      pr.notes,
      pr.created_at,
      inc.subject AS source_email_subject,
      inc.from_email AS source_email_from,
      inc.received_at AS source_email_received_at,
      inc.extracted_report_url AS extracted_report_url,
      dr.file_name AS downloaded_file_name,
      dr.mime_type AS downloaded_mime_type,
      dr.file_path AS downloaded_file_path,
      inc.processing_status AS incoming_processing_status,
      ${SQL_MATCHED_PLATE_BY_VIN_SUFFIX} AS matched_license_plate
    FROM pave_reports pr
    JOIN incoming_emails inc ON inc.id = pr.incoming_email_id
    LEFT JOIN downloaded_reports dr ON dr.id = pr.downloaded_report_id
    WHERE ${where.join(' AND ')}
    ORDER BY pr.created_at DESC
  `;
  const res = await query(q, params);
  return (res.rows || []).map(withInspectionDateEffective);
}

export async function getPaveGmailReportDetail(reportId) {
  const id = Number(reportId);
  if (!Number.isFinite(id)) return null;
  const pr = (
    await query(
      `SELECT pr.*, ${SQL_MATCHED_PLATE_BY_VIN_SUFFIX} AS matched_license_plate
       FROM pave_reports pr
       WHERE pr.id = $1`,
      [id]
    )
  ).rows[0];
  if (!pr) return null;

  const inc = (await query(`SELECT * FROM incoming_emails WHERE id = $1`, [pr.incoming_email_id])).rows[0] || null;
  const dr = pr.downloaded_report_id
    ? (await query(`SELECT * FROM downloaded_reports WHERE id = $1`, [pr.downloaded_report_id])).rows[0] || null
    : null;
  const items = (await query(
    `SELECT id, pave_report_id, side, component, damage_type, severity, repair_method, grade_score, sort_order, raw_payload
     FROM pave_report_items
     WHERE pave_report_id = $1
     ORDER BY sort_order NULLS LAST, id ASC`,
    [pr.id]
  )).rows || [];

  const report = {
    ...pr,
    inspection_date_effective: effectiveInspectionDate(pr, inc?.received_at),
  };
  return { report, incomingEmail: inc, downloadedReport: dr, items };
}

