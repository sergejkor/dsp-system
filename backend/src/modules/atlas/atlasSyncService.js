import { query, withTransaction } from '../../db.js';
import { fetchAtlasEmails } from './atlasImapService.js';
import { parseAtlasShipments } from './atlasEmailParser.js';
import { toAtlasServiceDate } from './atlasDateUtils.js';

const EXPECTED_BODY = 'Please find below the list of your Atlas shipment of the day';
const EXPECTED_HEADER = 'Tracking ID - Route code - Transporter ID';

function isAtlasEmail(email) {
  const expectedFrom = String(process.env.ATLAS_MAIL_FROM || 'aahmedmi@amazon.de').trim().toLowerCase();
  const expectedSubject = String(process.env.ATLAS_MAIL_SUBJECT || 'List for AlfaMile GmbH').trim().toLowerCase();
  const body = String(email.rawBodyText || '');
  return String(email.fromEmail || '').trim().toLowerCase() === expectedFrom &&
    String(email.subject || '').trim().toLowerCase() === expectedSubject &&
    body.includes(EXPECTED_BODY) && body.includes(EXPECTED_HEADER);
}

async function saveFailure(email, error) {
  const messageId = String(email.messageId || `atlas-imap-${email.imapUid}`);
  await query(`
    INSERT INTO incoming_emails
      (provider, message_id, subject, from_email, from_name, to_email, cc, received_at, sent_at,
       raw_body_text, raw_body_html, processing_status, parsing_errors, raw_extraction_payload)
    VALUES ('atlas_goneo', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'failed', $11, $12::jsonb)
    ON CONFLICT (provider, message_id) DO UPDATE SET
      processing_status = 'failed', parsing_errors = EXCLUDED.parsing_errors,
      raw_extraction_payload = EXCLUDED.raw_extraction_payload, updated_at = NOW()
  `, [messageId, email.subject, email.fromEmail, email.fromName, email.toEmail, email.cc,
    email.receivedAt, email.sentAt, email.rawBodyText, email.rawBodyHtml,
    String(error?.message || error).slice(0, 2000), JSON.stringify({ imapUid: email.imapUid })]);
}

async function importEmail(email, shipments, serviceDate) {
  return withTransaction(async () => {
    const incoming = (await query(`
      INSERT INTO incoming_emails
        (provider, message_id, subject, from_email, from_name, to_email, cc, received_at, sent_at,
         raw_body_text, raw_body_html, processing_status, parsing_errors, raw_extraction_payload)
      VALUES ('atlas_goneo', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NULL, $11::jsonb)
      ON CONFLICT (provider, message_id) DO UPDATE SET
        subject = EXCLUDED.subject, from_email = EXCLUDED.from_email, from_name = EXCLUDED.from_name,
        to_email = EXCLUDED.to_email, cc = EXCLUDED.cc, received_at = EXCLUDED.received_at,
        sent_at = EXCLUDED.sent_at, raw_body_text = EXCLUDED.raw_body_text,
        raw_body_html = EXCLUDED.raw_body_html, processing_status = 'pending', parsing_errors = NULL,
        raw_extraction_payload = EXCLUDED.raw_extraction_payload, updated_at = NOW()
      RETURNING id
    `, [String(email.messageId || `atlas-imap-${email.imapUid}`), email.subject, email.fromEmail,
      email.fromName, email.toEmail, email.cc, email.receivedAt, email.sentAt,
      email.rawBodyText, email.rawBodyHtml,
      JSON.stringify({ imapUid: email.imapUid, serviceDate, shipmentCount: shipments.length,
        routeCount: new Set(shipments.map((shipment) => shipment.routeCode)).size })])).rows[0];

    for (const shipment of shipments) {
      await query(`
        INSERT INTO atlas_shipments (incoming_email_id, service_date, tracking_id, route_code, transporter_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (service_date, tracking_id) DO UPDATE SET
          incoming_email_id = EXCLUDED.incoming_email_id, route_code = EXCLUDED.route_code,
          transporter_id = EXCLUDED.transporter_id, updated_at = NOW()
      `, [incoming.id, serviceDate, shipment.trackingId, shipment.routeCode, shipment.transporterId]);
    }
    await query(`UPDATE incoming_emails SET processing_status = 'processed', updated_at = NOW() WHERE id = $1`, [incoming.id]);
    return incoming.id;
  });
}

export async function syncAtlasEmails({ fetchEmails = fetchAtlasEmails } = {}) {
  const emails = await fetchEmails();
  const result = { emailsScanned: emails.length, emailsMatched: 0, emailsImported: 0, shipmentsImported: 0, routes: 0, errors: [] };
  for (const email of emails) {
    if (!isAtlasEmail(email)) continue;
    result.emailsMatched += 1;
    try {
      const shipments = parseAtlasShipments(email.rawBodyText);
      if (!shipments.length) throw new Error('Atlas email contains no valid shipment rows');
      const dateSource = email.sentAt || email.receivedAt;
      const serviceDate = toAtlasServiceDate(dateSource, process.env.ATLAS_TIMEZONE || 'Europe/Berlin');
      await importEmail(email, shipments, serviceDate);
      result.emailsImported += 1;
      result.shipmentsImported += shipments.length;
      result.routes += new Set(shipments.map((shipment) => shipment.routeCode)).size;
    } catch (error) {
      result.errors.push({ messageId: email.messageId, error: String(error?.message || error) });
      try { await saveFailure(email, error); } catch (persistError) {
        result.errors[result.errors.length - 1].persistenceError = String(persistError?.message || persistError);
      }
    }
  }
  return result;
}

export default { syncAtlasEmails };
