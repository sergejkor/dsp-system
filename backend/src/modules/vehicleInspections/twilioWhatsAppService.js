function stringOrNull(value, maxLen = 4000) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

export function normalizePhoneForWhatsApp(value, defaultCountryCode = '+49') {
  const raw = stringOrNull(value, 255);
  if (!raw) return null;

  let normalized = raw.replace(/[\s()-]/g, '');
  if (normalized.toLowerCase().startsWith('whatsapp:')) {
    normalized = normalized.slice('whatsapp:'.length);
  }
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }
  if (!normalized.startsWith('+')) {
    const countryCode = stringOrNull(defaultCountryCode, 8) || '+49';
    if (normalized.startsWith('0')) {
      normalized = `${countryCode}${normalized.slice(1)}`;
    } else {
      normalized = `${countryCode}${normalized}`;
    }
  }

  const compact = normalized.replace(/[^\d+]/g, '');
  if (!/^\+\d{7,20}$/.test(compact)) {
    return null;
  }
  return `whatsapp:${compact}`;
}

function getTwilioConfig() {
  return {
    accountSid: stringOrNull(process.env.TWILIO_ACCOUNT_SID, 128),
    authToken: stringOrNull(process.env.TWILIO_AUTH_TOKEN, 255),
    from: stringOrNull(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER, 64),
    statusCallback: stringOrNull(process.env.TWILIO_WHATSAPP_STATUS_CALLBACK_URL, 2000),
  };
}

export async function sendWhatsAppMessage({ to, body, defaultCountryCode = '+49' }) {
  const config = getTwilioConfig();
  if (!config.accountSid || !config.authToken || !config.from) {
    throw new Error('Twilio WhatsApp is not configured on the server');
  }

  const toAddress = normalizePhoneForWhatsApp(to, defaultCountryCode);
  const fromAddress = normalizePhoneForWhatsApp(config.from, defaultCountryCode);
  const text = stringOrNull(body, 4000);

  if (!toAddress) throw new Error('Recipient WhatsApp number is missing or invalid');
  if (!fromAddress) throw new Error('Server WhatsApp sender number is missing or invalid');
  if (!text) throw new Error('WhatsApp message body is empty');

  const form = new URLSearchParams();
  form.set('To', toAddress);
  form.set('From', fromAddress);
  form.set('Body', text);
  if (config.statusCallback) {
    form.set('StatusCallback', config.statusCallback);
  }

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  );

  const payload = await response.json().catch(async () => {
    const textPayload = await response.text().catch(() => '');
    return { message: textPayload };
  });

  if (!response.ok) {
    throw new Error(payload?.message || 'Twilio WhatsApp send failed');
  }

  return {
    sid: payload?.sid || null,
    status: payload?.status || 'queued',
    to: payload?.to || toAddress,
    from: payload?.from || fromAddress,
    raw: payload,
  };
}

export default {
  normalizePhoneForWhatsApp,
  sendWhatsAppMessage,
};
