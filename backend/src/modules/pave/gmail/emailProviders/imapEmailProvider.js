import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import parsePaveEmail, { isLikelyPaveEmail } from '../providers/pave/parsePaveEmail.js';

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') throw new Error(`Missing env var: ${name}`);
  return String(v).trim();
}

function defaultImapMailbox() {
  const host = String(process.env.IMAP_HOST || 'imap.gmail.com').trim().toLowerCase();
  if (host.includes('gmail.com')) return '[Gmail]/All Mail';
  return 'INBOX';
}

function defaultPaveSender() {
  return String(process.env.PAVE_IMAP_FROM || 'support@discoveryloft.com').trim();
}

function clampMaxResults(maxResults, fallback = 20) {
  return Math.max(1, Math.min(20000, Number(maxResults) || fallback));
}

function defaultPaveSubjectContains() {
  return String(process.env.PAVE_IMAP_SUBJECT || 'inspection').trim();
}

function looksLikePaveEmail(email) {
  const parsed = parsePaveEmail(email || {});
  return (
    isLikelyPaveEmail(email || {}) ||
    Boolean(parsed?.external_report_id) ||
    Boolean(parsed?.report_url)
  );
}

function pickLikelyPaveEmails(emails, maxResults) {
  const list = Array.isArray(emails) ? emails : [];
  const max = clampMaxResults(maxResults, 20);
  const filtered = list.filter((email) => looksLikePaveEmail(email));
  return filtered.slice(0, max);
}

async function withImapClient(fn) {
  const user = requireEnv('GMAIL_USER');
  const pass = requireEnv('GMAIL_APP_PASSWORD');
  const host = process.env.IMAP_HOST || 'imap.gmail.com';
  const port = Number(process.env.IMAP_PORT || 993);
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout();
  }
}

function imapMailboxName() {
  return String(process.env.IMAP_MAILBOX || defaultImapMailbox()).trim() || defaultImapMailbox();
}

async function fetchBySearch(search, { maxResults = 20 } = {}) {
  const mailbox = imapMailboxName();
  const max = clampMaxResults(maxResults, 20);

  return withImapClient(async (client) => {
    const t0 = Date.now();
    let openedMailbox = mailbox;
    try {
      await client.mailboxOpen(mailbox);
    } catch (error) {
      const host = String(process.env.IMAP_HOST || 'imap.gmail.com').trim().toLowerCase();
      const gmailFallbacks =
        host.includes('gmail.com') && mailbox !== 'INBOX'
          ? ['[Google Mail]/All Mail', 'INBOX']
          : [];
      let opened = false;
      for (const candidate of gmailFallbacks) {
        try {
          await client.mailboxOpen(candidate);
          openedMailbox = candidate;
          opened = true;
          console.warn('[pave-email] imap mailbox fallback used', {
            requestedMailbox: mailbox,
            openedMailbox: candidate,
            error: String(error?.message || error),
          });
          break;
        } catch (_) {}
      }
      if (!opened) throw error;
    }
    const uids = await client.search(search);
    const list = Array.isArray(uids) ? uids.filter(Boolean) : [];
    // Newest first (higher UID last in many servers — take last max items then reverse)
    const sorted = [...list].sort((a, b) => Number(a) - Number(b));
    const targetUids = sorted.slice(-max).reverse();
    const searchMs = Date.now() - t0;

    console.log('[pave-email] imap fetchBySearch', {
      mailbox: openedMailbox,
      search,
      uidCandidates: list.length,
      selectedForFetch: targetUids.length,
      maxResults: max,
      searchMs,
    });

    const out = [];
    const t1 = Date.now();
    // Single ImapFlow connection: keep sequential fetches (parallel fetchOne is unsafe on one client).
    for (const uid of targetUids) {
      const msg = await client.fetchOne(uid, { source: true, uid: true });
      if (!msg?.source) continue;
      const parsed = await simpleParser(msg.source);
      parsed._imap = { uid };
      out.push({
        messageId: parsed.messageId || String(uid),
        threadId: null,
        subject: parsed.subject || null,
        fromEmail: parsed.from?.text || null,
        fromName: parsed.from?.value?.[0]?.name || null,
        toEmail: parsed.to?.text || null,
        cc: parsed.cc?.text || null,
        receivedAt: parsed.date ? parsed.date.toISOString() : null,
        sentAt: parsed.date ? parsed.date.toISOString() : null,
        rawBodyText: parsed.text || '',
        rawBodyHtml: parsed.html || '',
        rawMessage: parsed,
      });
    }
    const fetchMs = Date.now() - t1;
    console.log('[pave-email] imap fetch bodies done', { fetchMs, messages: out.length, note: 'sequential IMAP fetch (one connection)' });

    return out;
  });
}

export default {
  async fetchUnreadEmails({ maxResults = 20 } = {}) {
    // Gmail IMAP header searches are not always reliable enough on shared mailboxes.
    // Try the narrowest PAVE-focused search first, then widen and locally filter.
    const max = clampMaxResults(maxResults, 20);
    const sender = defaultPaveSender();
    const subject = defaultPaveSubjectContains();

    if (sender && subject) {
      const narrowed = await fetchBySearch({ from: sender, subject }, { maxResults: Math.max(max, 100) });
      const narrowedMatches = pickLikelyPaveEmails(narrowed, max);
      if (narrowedMatches.length > 0) {
        console.log('[pave-email] imap narrow search matched PAVE emails', {
          strategy: 'from+subject',
          scanned: Array.isArray(narrowed) ? narrowed.length : 0,
          matched: narrowedMatches.length,
          sender,
          subject,
        });
        return narrowedMatches;
      }
    }

    if (sender) {
      const bySender = await fetchBySearch({ from: sender }, { maxResults: Math.max(max, 250) });
      const bySenderMatches = pickLikelyPaveEmails(bySender, max);
      if (bySenderMatches.length > 0) {
        console.log('[pave-email] imap sender search matched PAVE emails', {
          strategy: 'from',
          scanned: Array.isArray(bySender) ? bySender.length : 0,
          matched: bySenderMatches.length,
          sender,
        });
        return bySenderMatches;
      }
    }

    const broadPool = Math.min(5000, Math.max(500, max * 20));
    const broad = await fetchBySearch({}, { maxResults: broadPool });
    const broadMatches = pickLikelyPaveEmails(broad, max);
    console.log('[pave-email] imap broad fallback filtered PAVE emails', {
      strategy: 'all-mail-local-filter',
      scanned: Array.isArray(broad) ? broad.length : 0,
      matched: broadMatches.length,
      broadPool,
    });
    if (broadMatches.length > 0) return broadMatches;
    return Array.isArray(broad) ? broad.slice(0, max) : [];
  },

  async fetchHistoricalEmails(criteria = {}) {
    const { dateFrom, dateTo, maxResults = 200, sender, subjectContains } = criteria;
    const max = clampMaxResults(maxResults, 200);
    const search = {};
    if (dateFrom) search.since = new Date(`${dateFrom}T00:00:00Z`);
    if (dateTo) search.before = new Date(`${dateTo}T23:59:59Z`);
    const effectiveSender = sender ? String(sender).trim() : defaultPaveSender();
    const effectiveSubject = subjectContains ? String(subjectContains).trim() : defaultPaveSubjectContains();

    let searchUsed = { ...search };
    let emails = [];

    if (effectiveSender && effectiveSubject) {
      searchUsed = { ...search, from: effectiveSender, subject: effectiveSubject };
      emails = await fetchBySearch(searchUsed, { maxResults: Math.max(max, 250) });
      const narrowedMatches = pickLikelyPaveEmails(emails, max);
      if (narrowedMatches.length > 0) {
        emails = narrowedMatches;
      } else {
        emails = [];
      }
    }

    if (!emails.length && effectiveSender) {
      searchUsed = { ...search, from: effectiveSender };
      const bySender = await fetchBySearch(searchUsed, { maxResults: Math.max(max, 500) });
      const bySenderMatches = pickLikelyPaveEmails(bySender, max);
      if (bySenderMatches.length > 0) {
        emails = bySenderMatches;
      }
    }

    if (!emails.length) {
      searchUsed = { ...search };
      const broadPool = Math.min(5000, Math.max(1000, max * 20));
      const broad = await fetchBySearch(searchUsed, { maxResults: broadPool });
      emails = pickLikelyPaveEmails(broad, max);
    }

    return {
      emails,
      imapMailbox: imapMailboxName(),
      imapSearch: searchUsed,
      scannedIds: emails.length,
    };
  },

  async markAsProcessed({ messageId, threadId, rawMessage }) {
    // We rely on imap UID stored as _imap in rawMessage for marking as seen.
    await withImapClient(async (client) => {
      await client.mailboxOpen(imapMailboxName());
      const uid = rawMessage?._imap?.uid;
      if (uid) {
        await client.messageFlagsAdd(uid, ['\\Seen']);
      }
    });
  },
};

