const BASE_URL = 'https://api.kenjo.io/api/v1';

let cachedAuthHeader = null;
let cachedExpiresAtMs = 0;

function parseIsoToMs(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export async function getAuthHeader() {
  const now = Date.now();
  if (cachedAuthHeader && now < cachedExpiresAtMs - 60_000) {
    return cachedAuthHeader;
  }

  const apiKey = process.env.KENJO_API_KEY;
  if (!apiKey) {
    throw new Error('Missing KENJO_API_KEY in environment');
  }

  const resp = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Kenjo login failed ${resp.status}: ${text}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Kenjo login returned invalid JSON');
  }

  const token = String(json?.token || '').trim();
  if (!token.toLowerCase().startsWith('bearer ')) {
    throw new Error(`Unexpected token format from Kenjo: ${token}`);
  }

  cachedAuthHeader = token;
  const expiresIso = json?.['X-Expires-After'];
  cachedExpiresAtMs = parseIsoToMs(expiresIso) || now + 50 * 60 * 1000;

  return cachedAuthHeader;
}

export const kenjoAuth = {
  getAuthHeader,
};

export default kenjoAuth;

