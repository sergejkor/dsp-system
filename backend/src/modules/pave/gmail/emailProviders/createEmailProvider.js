import gmailEmailProvider from './gmailEmailProvider.js';
import imapEmailProvider from './imapEmailProvider.js';

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') throw new Error(`Missing env var: ${name}`);
  return String(v).trim();
}

export default function createEmailProvider() {
  const provider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (!provider) throw new Error('EMAIL_PROVIDER is required (gmail|imap)');

  if (provider === 'gmail') {
    // Validations happen inside provider too.
    requireEnv('GMAIL_USER');
    return gmailEmailProvider;
  }

  if (provider === 'imap') {
    return imapEmailProvider;
  }

  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}

