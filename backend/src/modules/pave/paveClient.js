/**
 * Server-side PAVE API client.
 * Auth: API-Key, API-Token (HMAC-SHA256 of timestamp with secret), API-Timestamp (UTC ISO).
 * Never expose API key/secret in frontend.
 */
import crypto from 'crypto';

const PAVE_BASE = process.env.PAVE_BASE_URL || 'https://openapi.paveapi.com';

function getAuthHeaders() {
  const apiKey = process.env.PAVE_API_KEY;
  const apiSecret = process.env.PAVE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('PAVE_API_KEY and PAVE_API_SECRET must be set');
  }
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const token = crypto.createHmac('sha256', apiSecret).update(timestamp).digest('hex');
  return {
    'API-Key': apiKey,
    'API-Token': token,
    'API-Timestamp': timestamp,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

async function paveRequest(method, path, body = null, opts = {}) {
  const url = path.startsWith('http') ? path : `${PAVE_BASE}${path}`;
  const headers = getAuthHeaders();
  const config = {
    method,
    headers: { ...headers, ...opts.headers },
  };
  if (body != null && method !== 'GET') {
    config.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(url, config);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || res.statusText || `PAVE ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function createSession(body) {
  return paveRequest('POST', '/v1/sessions', body);
}

export async function getSession(sessionKey) {
  return paveRequest('GET', `/v1/sessions/${encodeURIComponent(sessionKey)}`);
}

export async function getSessionPhotos(sessionKey) {
  return paveRequest('GET', `/v1/sessions/${encodeURIComponent(sessionKey)}/photos`);
}

export async function getSessionNotes(sessionKey) {
  return paveRequest('GET', `/v1/sessions/${encodeURIComponent(sessionKey)}/notes`);
}

export async function getSessionResults(sessionKey) {
  return paveRequest('GET', `/v1/sessions/${encodeURIComponent(sessionKey)}/results`);
}

export async function updateSession(sessionKey, body) {
  return paveRequest('PUT', `/v1/sessions/${encodeURIComponent(sessionKey)}`, body);
}

export async function deleteSession(sessionKey) {
  return paveRequest('DELETE', `/v1/sessions/${encodeURIComponent(sessionKey)}`);
}

export async function listCallbacks() {
  return paveRequest('GET', '/v1/callbacks');
}

export async function getCallback(event) {
  return paveRequest('GET', `/v1/callbacks/${encodeURIComponent(event)}`);
}

export async function createCallback(body) {
  return paveRequest('POST', '/v1/callbacks', body);
}

export async function updateCallback(event, body) {
  return paveRequest('PUT', `/v1/callbacks/${encodeURIComponent(event)}`, body);
}

export async function deleteCallback(event) {
  return paveRequest('DELETE', `/v1/callbacks/${encodeURIComponent(event)}`);
}

/** Resend SMS if supported by PAVE (optional). */
export async function resendSms(sessionKey) {
  return paveRequest('POST', `/v1/sessions/${encodeURIComponent(sessionKey)}/resend-sms`, {});
}

export default {
  createSession,
  getSession,
  getSessionPhotos,
  getSessionNotes,
  getSessionResults,
  updateSession,
  deleteSession,
  listCallbacks,
  getCallback,
  createCallback,
  updateCallback,
  deleteCallback,
  resendSms,
};
