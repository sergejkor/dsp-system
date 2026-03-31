import nodemailer from 'nodemailer';
import settingsService from '../settings/settingsService.js';

let transporterPromise = null;

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

async function buildRecipients() {
  const dbValue = await settingsService.getSetting('personalfragebogen', 'notification_emails').catch(() => null);
  return parseEmailList(
    dbValue,
    process.env.PERSONALFRAGEBOGEN_NOTIFY_EMAILS,
    process.env.PERSONAL_QUESTIONNAIRE_NOTIFY_EMAILS,
    process.env.PUBLIC_INTAKE_NOTIFY_EMAILS
  );
}

async function buildDamageRecipients() {
  const dbValue = await settingsService.getSetting('schadenmeldung', 'notification_emails').catch(() => null);
  return parseEmailList(
    dbValue,
    process.env.SCHADENMELDUNG_NOTIFY_EMAILS,
    process.env.DAMAGE_REPORT_NOTIFY_EMAILS,
    process.env.PUBLIC_INTAKE_NOTIFY_EMAILS
  );
}

function buildReviewUrl(submissionId) {
  const baseUrl = stringOrNull(process.env.DSP_SYSTEM_BASE_URL) || 'https://dsp-system.alfamile.com';
  return `${baseUrl.replace(/\/+$/, '')}/personal-fragebogen-review?id=${encodeURIComponent(submissionId)}`;
}

function buildDamageReviewUrl(reportId) {
  const baseUrl = stringOrNull(process.env.DSP_SYSTEM_BASE_URL) || 'https://dsp-system.alfamile.com';
  return `${baseUrl.replace(/\/+$/, '')}/schadenmeldung-review?id=${encodeURIComponent(reportId)}`;
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

function buildDamageTemplateContext({ reportId, summary, createdAt }) {
  return {
    reportId: String(reportId ?? ''),
    reporterName: summary?.reporterName || '',
    driverName: summary?.driverName || '',
    email: summary?.reporterEmail || '',
    phone: summary?.reporterPhone || '',
    licensePlate: summary?.licensePlate || '',
    incidentDate: summary?.incidentDate || '',
    createdAt: createdAt || new Date().toISOString(),
    reviewUrl: buildDamageReviewUrl(reportId),
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

async function getDamageNotificationTemplates() {
  const [subject, body] = await Promise.all([
    settingsService.getSetting('schadenmeldung', 'notification_subject').catch(() => null),
    settingsService.getSetting('schadenmeldung', 'notification_body').catch(() => null),
  ]);

  return {
    subject: stringOrNull(subject) || 'New Schadenmeldung: {{driverName}}',
    body:
      stringOrNull(body) ||
      'A new Schadenmeldung has been submitted.\n\nReport ID: {{reportId}}\nDriver: {{driverName}}\nReporter: {{reporterName}}\nEmail: {{email}}\nPhone: {{phone}}\nLicense plate: {{licensePlate}}\nIncident date: {{incidentDate}}\nReceived at: {{createdAt}}\n\nOpen review page: {{reviewUrl}}',
  };
}

function getSmtpConfig() {
  const host = stringOrNull(process.env.SMTP_HOST) || 'smtp.goneo.de';
  const port = Number(process.env.SMTP_PORT || 465);
  const secureRaw = stringOrNull(process.env.SMTP_SECURE);
  const secure = secureRaw == null ? port === 465 : !['false', '0', 'no'].includes(secureRaw.toLowerCase());
  const user = stringOrNull(process.env.SMTP_USER);
  const pass = stringOrNull(process.env.SMTP_PASS);
  const from = stringOrNull(process.env.SMTP_FROM) || user;

  return { host, port, secure, user, pass, from };
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const config = getSmtpConfig();
      if (!config.user || !config.pass || !config.from) {
        throw new Error('SMTP is not configured. Set SMTP_USER, SMTP_PASS and optionally SMTP_FROM in backend/.env');
      }

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

      await transporter.verify();
      return transporter;
    })().catch((error) => {
      transporterPromise = null;
      throw error;
    });
  }
  return transporterPromise;
}

export async function sendPersonalQuestionnaireNotification({ submissionId, summary, createdAt }) {
  const recipients = await buildRecipients();
  if (!recipients.length) return { skipped: true, reason: 'notification email not configured' };

  const transporter = await getTransporter();
  const templates = await getNotificationTemplates();
  const context = buildTemplateContext({ submissionId, summary, createdAt });
  const subject = renderTemplate(templates.subject, context);
  const bodyText = renderTemplate(templates.body, context);
  const { from } = getSmtpConfig();

  const info = await transporter.sendMail({
    from,
    to: recipients.join(', '),
    subject,
    text: bodyText,
  });

  return {
    skipped: false,
    recipients,
    messageId: info?.messageId || null,
  };
}

export async function sendDamageReportNotification({ reportId, summary, createdAt }) {
  const recipients = await buildDamageRecipients();
  if (!recipients.length) return { skipped: true, reason: 'notification email not configured' };

  const transporter = await getTransporter();
  const templates = await getDamageNotificationTemplates();
  const context = buildDamageTemplateContext({ reportId, summary, createdAt });
  const subject = renderTemplate(templates.subject, context);
  const bodyText = renderTemplate(templates.body, context);
  const { from } = getSmtpConfig();

  const info = await transporter.sendMail({
    from,
    to: recipients.join(', '),
    subject,
    text: bodyText,
  });

  return {
    skipped: false,
    recipients,
    messageId: info?.messageId || null,
  };
}
