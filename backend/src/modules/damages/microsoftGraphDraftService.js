function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') {
    throw new Error(`Missing env var: ${name}`);
  }
  return String(v).trim();
}

async function getAppAccessToken() {
  const tenantId = requireEnv('MICROSOFT_TENANT_ID');
  const clientId = requireEnv('MICROSOFT_CLIENT_ID');
  const clientSecret = requireEnv('MICROSOFT_CLIENT_SECRET');

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const scope = 'https://graph.microsoft.com/.default';

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('scope', scope);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Microsoft token acquisition failed: ${res.status} ${data.error_description || data.error || ''}`.trim()
    );
  }

  if (!data.access_token) {
    throw new Error(`Microsoft token acquisition failed: no access_token in response`);
  }

  return data.access_token;
}

function deriveOutlookComposeUrl(message) {
  // Graph v1.0 typically returns webLink for messages created via the Outlook mail API.
  if (message?.webLink) return message.webLink;
  if (message?.id) return `https://outlook.office.com/mail/deeplink/compose/${message.id}`;
  return null;
}

/**
 * Creates a Microsoft Graph draft email with a PDF attachment.
 * @param {object} args
 * @param {Buffer} args.pdfBytes
 * @param {string} args.fileName
 * @param {string} args.subject
 * @param {string} args.bodyText
 * @param {string[]} args.to
 * @param {string[]} args.cc
 */
export async function createOutlookDraftWithPdfAttachment({
  pdfBytes,
  fileName,
  subject,
  bodyText,
  to,
  cc,
}) {
  const userEmail = requireEnv('MICROSOFT_GRAPH_USER_EMAIL');
  const accessToken = await getAppAccessToken();

  const isSmall = pdfBytes.length < 3 * 1024 * 1024;
  if (!isSmall) {
    throw new Error('Large attachment flow not implemented yet');
  }

  const toRecipients = (to || []).filter(Boolean).map((email) => ({
    emailAddress: { address: email },
  }));
  const ccRecipients = (cc || []).filter(Boolean).map((email) => ({
    emailAddress: { address: email },
  }));

  if (!toRecipients.length) {
    // Graph draft can fail without recipients; fall back to the configured service mailbox.
    toRecipients.push({ emailAddress: { address: userEmail } });
  }

  const base64 = Buffer.isBuffer(pdfBytes) ? pdfBytes.toString('base64') : Buffer.from(pdfBytes).toString('base64');

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: subject || '',
      body: {
        contentType: 'Text',
        content: bodyText || '',
      },
      toRecipients,
      ccRecipients,
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: fileName,
          contentType: 'application/pdf',
          contentBytes: base64,
        },
      ],
    }),
  });

  const message = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Graph create draft failed: ${res.status} ${message?.error?.message || JSON.stringify(message)}`);
  }

  return {
    messageId: message?.id || null,
    composeUrl: deriveOutlookComposeUrl(message),
  };
}

