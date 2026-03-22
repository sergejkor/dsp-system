import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') throw new Error(`Missing env var: ${name}`);
  return String(v).trim();
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
  return String(process.env.IMAP_MAILBOX || 'INBOX').trim() || 'INBOX';
}

async function fetchBySearch(search, { maxResults = 20 } = {}) {
  const mailbox = imapMailboxName();
  const max = Math.max(1, Math.min(20000, Number(maxResults) || 20));

  return withImapClient(async (client) => {
    const t0 = Date.now();
    await client.mailboxOpen(mailbox);
    const uids = await client.search(search);
    const list = Array.isArray(uids) ? uids.filter(Boolean) : [];
    // Newest first (higher UID last in many servers — take last max items then reverse)
    const sorted = [...list].sort((a, b) => Number(a) - Number(b));
    const targetUids = sorted.slice(-max).reverse();
    const searchMs = Date.now() - t0;

    console.log('[pave-email] imap fetchBySearch', {
      mailbox,
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
    // Intentionally fetches all inbox mails (read + unread); DB dedupe/status controls re-import behavior.
    return fetchBySearch({}, { maxResults });
  },

  async fetchHistoricalEmails(criteria = {}) {
    const { dateFrom, dateTo, maxResults = 200, sender, subjectContains } = criteria;
    const search = {};
    if (dateFrom) search.since = new Date(`${dateFrom}T00:00:00Z`);
    if (dateTo) search.before = new Date(`${dateTo}T23:59:59Z`);
    if (sender) search.from = String(sender).trim();
    if (subjectContains) search.subject = String(subjectContains).trim();
    const emails = await fetchBySearch(search, { maxResults });
    return {
      emails,
      imapMailbox: imapMailboxName(),
      imapSearch: search,
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

