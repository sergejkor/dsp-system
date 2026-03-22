import createEmailProvider from './gmail/emailProviders/createEmailProvider.js';
import parsePaveEmail, { isLikelyPaveEmail } from './gmail/providers/pave/parsePaveEmail.js';
import { syncGmailReports } from './paveGmailSyncService.js';

export async function backfillPaveReports({
  dateFrom,
  dateTo,
  maxEmails = 500,
  provider = 'pave',
  sender = '',
  subjectContains = '',
  reprocessExisting = false,
} = {}) {
  const emailProvider = createEmailProvider();
  if (typeof emailProvider.fetchHistoricalEmails !== 'function') {
    throw new Error('Configured email provider does not support historical search');
  }

  const maxRaw = Number(maxEmails);
  const maxResults = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 500;

  const tHistSearch = Date.now();
  const histRaw = await emailProvider.fetchHistoricalEmails({
    dateFrom,
    dateTo,
    maxResults,
    sender: sender || undefined,
    subjectContains: subjectContains || undefined,
  });
  const historicalSearchMs = Date.now() - tHistSearch;

  const scannedEmails =
    histRaw && typeof histRaw === 'object' && Array.isArray(histRaw.emails)
      ? histRaw.emails
      : Array.isArray(histRaw)
        ? histRaw
        : [];
  const gmailQuery = histRaw && typeof histRaw === 'object' && histRaw.gmailQuery ? String(histRaw.gmailQuery) : null;
  const gmailResultSizeEstimate =
    histRaw && typeof histRaw === 'object' && histRaw.resultSizeEstimate != null ? histRaw.resultSizeEstimate : null;

  const scanned = Array.isArray(scannedEmails) ? scannedEmails.length : 0;
  const matchedEmails = (Array.isArray(scannedEmails) ? scannedEmails : []).filter((e) => {
    if (String(provider || '').toLowerCase() !== 'pave') return true;
    if (!isLikelyPaveEmail(e)) return false;
    const parsed = parsePaveEmail(e);
    return Boolean(parsed?.report_url && parsed?.external_report_id);
  });

  let syncResult;
  if (!matchedEmails.length) {
    syncResult = {
      mode: 'backfill',
      total: 0,
      scanned: 0,
      matched: 0,
      skipped: 0,
      failed: 0,
      partial: 0,
      filteredOut: 0,
      imported: 0,
      duplicateSkipped: 0,
      emailsProcessed: 0,
      timings: {
        historicalSearchMs,
        emailSearchMs: historicalSearchMs,
        totalPipelineMs: historicalSearchMs,
      },
      note:
        scanned === 0
          ? `No emails returned from Gmail. Use dates as yyyy-mm-dd (we convert to Gmail after:/before:). Clear Subject filter to widen search. Query was: ${gmailQuery || '(unknown)'}`
          : 'Emails were fetched but none matched PAVE rules (subject/body).',
    };
  } else {
    syncResult = await syncGmailReports({
      mode: 'backfill',
      force: Boolean(reprocessExisting),
      reprocessFailed: Boolean(reprocessExisting),
      reprocessPartial: Boolean(reprocessExisting),
      reprocessSparse: Boolean(reprocessExisting),
      sourceEmails: matchedEmails,
      limit: matchedEmails.length,
    });
    if (syncResult.timings && typeof syncResult.timings === 'object') {
      syncResult.timings.historicalSearchMs = historicalSearchMs;
      // Historical list fetch is the "email search" for backfill (sync uses sourceEmails → sync emailSearchMs is 0).
      syncResult.timings.emailSearchMs = historicalSearchMs;
      syncResult.timings.totalPipelineMs = historicalSearchMs + (Number(syncResult.timings.totalMs) || 0);
    }
  }

  const pagesFetched =
    histRaw && typeof histRaw === 'object' && histRaw.pagesFetched != null ? Number(histRaw.pagesFetched) : null;
  const listMatchCount =
    histRaw && typeof histRaw === 'object' && histRaw.listIds != null ? Number(histRaw.listIds) : null;
  const imapMailbox = histRaw && typeof histRaw === 'object' && histRaw.imapMailbox ? String(histRaw.imapMailbox) : null;
  const imapSearch =
    histRaw && typeof histRaw === 'object' && histRaw.imapSearch && typeof histRaw.imapSearch === 'object'
      ? histRaw.imapSearch
      : null;
  const imapScannedIds =
    histRaw && typeof histRaw === 'object' && histRaw.scannedIds != null ? Number(histRaw.scannedIds) : null;

  return {
    success: true,
    scanned,
    matched: matchedEmails.length,
    hint: syncResult.note || undefined,
    gmailQuery,
    gmailResultSizeEstimate,
    pagesFetched,
    listMatchCount,
    imapMailbox,
    imapSearch,
    imapScannedIds,
    created: syncResult.created || 0,
    updated: syncResult.updated || 0,
    skipped: (syncResult.skipped || 0) + (syncResult.duplicateSkipped || 0),
    failed: syncResult.failed || 0,
    partial: syncResult.partial || 0,
    historicalSearchMs,
    timings: syncResult.timings || { historicalSearchMs, emailSearchMs: historicalSearchMs },
    details: syncResult,
  };
}

export default {
  backfillPaveReports,
};

