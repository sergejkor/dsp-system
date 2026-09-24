import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required Atlas IMAP configuration: ${name}`);
  return value;
}

function lookbackDays() {
  const raw = Number(process.env.ATLAS_IMAP_LOOKBACK_DAYS || 7);
  return Math.max(1, Math.min(365, Number.isFinite(raw) ? Math.trunc(raw) : 7));
}

function sinceDate(days) {
  const result = new Date();
  result.setUTCDate(result.getUTCDate() - days);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function addressList(value) {
  return (value?.value || []).map((entry) => ({
    address: String(entry.address || '').trim(),
    name: String(entry.name || '').trim(),
  })).filter((entry) => entry.address);
}

export async function fetchAtlasEmails() {
  const user = required('ATLAS_IMAP_USER');
  const pass = required('ATLAS_IMAP_PASSWORD');
  const port = Number(process.env.ATLAS_IMAP_PORT || 993);
  const secure = String(process.env.ATLAS_IMAP_SECURE || 'true').toLowerCase() !== 'false';
  const sender = String(process.env.ATLAS_MAIL_FROM || 'aahmedmi@amazon.de').trim();
  const subject = String(process.env.ATLAS_MAIL_SUBJECT || 'List for AlfaMile GmbH').trim();
  const client = new ImapFlow({
    host: String(process.env.ATLAS_IMAP_HOST || 'imap.goneo.de').trim(),
    port,
    secure,
    auth: { user, pass },
    logger: false,
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.mailboxOpen(String(process.env.ATLAS_IMAP_MAILBOX || 'INBOX').trim());
    const uids = await client.search({ since: sinceDate(lookbackDays()), from: sender, subject }, { uid: true });
    const emails = [];
    for (const imapUid of (uids || []).sort((a, b) => a - b)) {
      const fetched = await client.fetchOne(imapUid, { source: true, uid: true }, { uid: true });
      if (!fetched?.source) continue;
      const parsed = await simpleParser(fetched.source);
      const from = addressList(parsed.from);
      const to = addressList(parsed.to);
      emails.push({
        messageId: parsed.messageId || `atlas-imap-${imapUid}`,
        imapUid: fetched.uid ?? imapUid,
        subject: parsed.subject || '',
        fromEmail: from[0]?.address || '',
        fromName: from[0]?.name || null,
        toEmail: to.map((entry) => entry.address).join(', ') || null,
        cc: addressList(parsed.cc).map((entry) => entry.address).join(', ') || null,
        receivedAt: parsed.date || null,
        sentAt: parsed.date || null,
        rawBodyText: parsed.text || '',
        rawBodyHtml: typeof parsed.html === 'string' ? parsed.html : '',
      });
    }
    return emails;
  } catch (error) {
    const safe = new Error(`Atlas IMAP sync failed: ${String(error?.message || error).replaceAll(pass, '[redacted]')}`);
    throw safe;
  } finally {
    if (connected) await client.logout().catch(() => {});
  }
}

export default { fetchAtlasEmails };
