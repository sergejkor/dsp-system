import { google } from 'googleapis';

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') throw new Error(`Missing env var: ${name}`);
  return String(v).trim();
}

function decodeBase64Url(data) {
  if (!data) return '';
  // Gmail uses base64url encoding (\"-\" and \"_\" instead of \"+\" and \"/\").
  const b64 = String(data).replace(/-/g, '+').replace(/_/g, '/');
  const buf = Buffer.from(b64, 'base64');
  return buf.toString('utf8');
}

function getHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  const h = (headers || []).find((x) => String(x.name).toLowerCase() === target);
  return h ? h.value : '';
}

function extractBodyFromPayload(payload) {
  let text = '';
  let html = '';

  function walk(part) {
    if (!part) return;
    const mimeType = part.mimeType || '';

    // If this part is the actual body content.
    if (part.body && part.body.data) {
      const content = decodeBase64Url(part.body.data);
      if (mimeType === 'text/plain' && !text) text = content;
      if (mimeType === 'text/html' && !html) html = content;
      return;
    }

    // Otherwise recurse into sub-parts.
    if (Array.isArray(part.parts)) {
      for (const p of part.parts) walk(p);
    }
  }

  walk(payload);
  return { text: text || '', html: html || '' };
}

function pickSentAt(parsed) {
  // Some mails include Date in headers; otherwise Gmail internalDate is used.
  return parsed || null;
}

function parseDateSafe(s) {
  const d = s ? new Date(s) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Gmail search operators after:/before: expect slashes (yyyy/mm/dd), not ISO hyphens.
 * HTML <input type="date"> sends yyyy-mm-dd → convert so queries are not silently empty.
 */
function normalizeGmailSearchDate(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = iso[1];
    const mo = String(parseInt(iso[2], 10));
    const da = String(parseInt(iso[3], 10));
    return `${y}/${mo}/${da}`;
  }
  return s;
}

function gmailSubjectClause(subjectContains) {
  const s = String(subjectContains || '').trim();
  if (!s) return null;
  if (/[\s"]/.test(s)) {
    const esc = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `subject:"${esc}"`;
  }
  return `subject:${s}`;
}

function buildMessageFromGmail({ message }) {
  const headers = message.payload?.headers || [];
  const subject = getHeader(headers, 'Subject') || null;
  const from = getHeader(headers, 'From') || null;
  const fromName = getHeader(headers, 'From') || null; // Gmail doesn't separate name easily without parsing
  const toEmail = getHeader(headers, 'To') || null;
  const cc = getHeader(headers, 'Cc') || null;
  const receivedAt = parseDateSafe(message.internalDate ? new Date(Number(message.internalDate)) : null);
  const sentAt = parseDateSafe(getHeader(headers, 'Date')) || receivedAt;

  const { text, html } = extractBodyFromPayload(message.payload);
  return {
    messageId: message.id,
    threadId: message.threadId,
    subject,
    fromEmail: from,
    fromName,
    toEmail,
    cc,
    receivedAt: receivedAt ? receivedAt.toISOString() : null,
    sentAt: pickSentAt(sentAt ? sentAt.toISOString() : null),
    rawBodyText: text,
    rawBodyHtml: html,
    rawMessage: message,
  };
}

export async function createGmailClient() {
  const clientId = requireEnv('GMAIL_CLIENT_ID');
  const clientSecret = requireEnv('GMAIL_CLIENT_SECRET');
  const refreshToken = requireEnv('GMAIL_REFRESH_TOKEN');

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return gmail;
}

/** Gmail allows up to 500 ids per messages.list page */
const GMAIL_LIST_MAX_PAGE = 500;

async function listMessageIdsWithPagination(gmail, gmailUser, q, maxTotal) {
  const cap = Math.max(1, Math.min(20000, Number(maxTotal) || 500));
  const ids = [];
  let pageToken = undefined;
  let pagesFetched = 0;
  let lastEstimate = null;

  while (ids.length < cap) {
    const pageSize = Math.min(GMAIL_LIST_MAX_PAGE, cap - ids.length);
    const listRes = await gmail.users.messages.list({
      userId: gmailUser,
      q,
      maxResults: pageSize,
      pageToken: pageToken || undefined,
    });
    pagesFetched += 1;
    lastEstimate = listRes.data.resultSizeEstimate ?? lastEstimate;
    const batch = (listRes.data.messages || []).map((m) => m.id).filter(Boolean);
    for (const id of batch) {
      if (ids.length >= cap) break;
      ids.push(id);
    }
    pageToken = listRes.data.nextPageToken;
    if (!pageToken || batch.length === 0) break;
  }

  return { ids, pagesFetched, resultSizeEstimate: lastEstimate };
}

async function fetchMessagesByIdsParallel(gmail, gmailUser, ids) {
  const concurrency = Math.max(1, Math.min(20, Number(process.env.PAVE_GMAIL_MESSAGE_FETCH_CONCURRENCY || 8)));
  const out = new Array(ids.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= ids.length) break;
      const id = ids[i];
      const msg = await gmail.users.messages.get({ userId: gmailUser, id, format: 'full' });
      out[i] = buildMessageFromGmail({ message: msg.data });
    }
  }

  const n = Math.min(concurrency, ids.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export default {
  async fetchUnreadEmails({ maxResults = 20 } = {}) {
    const gmailUser = requireEnv('GMAIL_USER');
    const gmail = await createGmailClient();
    const t0 = Date.now();

    const q = String(process.env.PAVE_GMAIL_QUERY || 'in:anywhere').trim();
    const maxTotal = Number(maxResults) || 20;

    const { ids, pagesFetched, resultSizeEstimate } = await listMessageIdsWithPagination(gmail, gmailUser, q, maxTotal);
    const listMs = Date.now() - t0;

    const t1 = Date.now();
    const full = ids.length ? await fetchMessagesByIdsParallel(gmail, gmailUser, ids) : [];
    const fetchMs = Date.now() - t1;

    console.log('[pave-email] gmail fetchUnreadEmails', {
      query: q,
      pagesFetched,
      listIds: ids.length,
      resultSizeEstimate,
      listMs,
      fetchBodiesMs: fetchMs,
      messageFetchConcurrency: Number(process.env.PAVE_GMAIL_MESSAGE_FETCH_CONCURRENCY || 8),
    });

    return full;
  },

  async fetchHistoricalEmails(criteria = {}) {
    const gmailUser = requireEnv('GMAIL_USER');
    const gmail = await createGmailClient();
    const t0 = Date.now();

    const { dateFrom, dateTo, maxResults = 200, sender, subjectContains } = criteria;

    const baseHistorical = String(process.env.PAVE_GMAIL_HISTORICAL_QUERY || 'in:anywhere').trim();
    const parts = [baseHistorical];
    const after = normalizeGmailSearchDate(dateFrom);
    const before = normalizeGmailSearchDate(dateTo);
    if (after) parts.push(`after:${after}`);
    if (before) parts.push(`before:${before}`);
    if (sender) parts.push(`from:${String(sender).trim()}`);
    const subj = gmailSubjectClause(subjectContains);
    if (subj) parts.push(subj);
    const q = parts.join(' ');

    const maxTotal = Number(maxResults) || 200;
    const { ids, pagesFetched, resultSizeEstimate } = await listMessageIdsWithPagination(gmail, gmailUser, q, maxTotal);
    const listMs = Date.now() - t0;

    const t1 = Date.now();
    const out = ids.length ? await fetchMessagesByIdsParallel(gmail, gmailUser, ids) : [];
    const fetchMs = Date.now() - t1;

    console.log('[pave-email] gmail fetchHistoricalEmails', {
      query: q,
      pagesFetched,
      listIds: ids.length,
      maxRequested: maxTotal,
      resultSizeEstimate,
      listMs,
      fetchBodiesMs: fetchMs,
      messageFetchConcurrency: Number(process.env.PAVE_GMAIL_MESSAGE_FETCH_CONCURRENCY || 8),
    });

    return {
      emails: out,
      gmailQuery: q,
      resultSizeEstimate,
      pagesFetched,
      listIds: ids.length,
    };
  },

  async markAsProcessed({ messageId }) {
    const gmailUser = requireEnv('GMAIL_USER');
    const gmail = await createGmailClient();
    // Remove the UNREAD label.
    await gmail.users.messages.modify({
      userId: gmailUser,
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
  },
};

