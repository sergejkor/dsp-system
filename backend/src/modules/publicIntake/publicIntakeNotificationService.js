import settingsService from '../settings/settingsService.js';

function requireEnv(name) {
  const value = process.env[name];
  if (value == null || String(value).trim() === '') {
    throw new Error(`Missing env var: ${name}`);
  }
  return String(value).trim();
}

function stringOrNull(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function parseEmailList(...values) {
  return values
    .flatMap((value) => String(value || '').split(/[;,]/))
    .map((value) => value.trim())
    .filter((value, index, list) => value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && list.indexOf(value) === index);
}

async function getAppAccessToken() {
  const tenantId = requireEnv('MICROSOFT_TENANT_ID');
  const clientId = requireEnv('MICROSOFT_CLIENT_ID');
  const clientSecret = requireEnv('MICROSOFT_CLIENT_SECRET');

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('scope', 'https://graph.microsoft.com/.default');

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(
      `Microsoft token acquisition failed: ${res.status} ${data?.error_description || data?.error || 'no access_token'}`
    );
  }

  return data.access_token;
}

async function buildRecipients() {
  const dbValue = await settingsService.getSetting('personalfragebogen', 'notification_emails').catch(() => null);
  return parseEmailList(
    dbValue,
    process.env.PERSONALFRAGEBOGEN_NOTIFY_EMAILS,
    process.env.PERSONAL_QUESTIONNAIRE_NOTIFY_EMAILS,
    process.env.PUBLIC_INTAKE_NOTIFY_EMAILS,
    process.env.MICROSOFT_GRAPH_USER_EMAIL
  );
}

function buildReviewUrl(submissionId) {
  const baseUrl = stringOrNull(process.env.DSP_SYSTEM_BASE_URL) || 'https://dsp-system.alfamile.com';
  return `${baseUrl.replace(/\/+$/, '')}/personal-fragebogen-review?id=${encodeURIComponent(submissionId)}`;
}

function buildTemplateContext({ submissionId, summary, createdAt }) {
  return {
    submissionId: String(submissionId ?? ''),
    firstName: summary?.firstName || '',
    lastName: summary?.lastName || '',
    fullName: [summary?.firstName, summary?.lastName].filter(Boolean).join(' ').trim(),
    email: summary?.email || '',
    phone: summary?.phone || '',
    startDate: summary?.startDate || '',
    createdAt: createdAt || new Date().toISOString(),
    reviewUrl: buildReviewUrl(submissionId),
  };
}

function renderTemplate(template, context) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = context?.[key];
    return value == null || value === '' ? '—' : String(value);
  });
}

async function getNotificationTemplates() {
  const [subject, body] = await Promise.all([
    settingsService.getSetting('personalfragebogen', 'notification_subject').catch(() => null),
    settingsService.getSetting('personalfragebogen', 'notification_body').catch(() => null),
  ]);

  return {
    subject: stringOrNull(subject) || 'New Personalfragebogen: {{firstName}} {{lastName}}',
    body:
      stringOrNull(body) ||
      'A new Personalfragebogen has been submitted.\n\nSubmission ID: {{submissionId}}\nName: {{firstName}} {{lastName}}\nEmail: {{email}}\nPhone: {{phone}}\nStart date: {{startDate}}\nReceived at: {{createdAt}}\n\nOpen review page: {{reviewUrl}}',
  };
}

export async function sendPersonalQuestionnaireNotification({ submissionId, summary, createdAt }) {
  const senderEmail = stringOrNull(process.env.MICROSOFT_GRAPH_USER_EMAIL);
  const recipients = await buildRecipients();
  if (!senderEmail || !recipients.length) return { skipped: true, reason: 'notification email not configured' };

  const accessToken = await getAppAccessToken();
  const templates = await getNotificationTemplates();
  const context = buildTemplateContext({ submissionId, summary, createdAt });
  const subject = renderTemplate(templates.subject, context);
  const bodyText = renderTemplate(templates.body, context);

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: 'Text',
          content: bodyText,
        },
        toRecipients: recipients.map((email) => ({
          emailAddress: { address: email },
        })),
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(`Graph sendMail failed: ${res.status} ${message}`.trim());
  }

  return { skipped: false, recipients };
}
