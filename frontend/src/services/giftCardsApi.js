import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getEligible(fromDate, toDate, weekKeys = []) {
  const params = new URLSearchParams();
  if (Array.isArray(weekKeys) && weekKeys.length > 0) {
    params.set('weeks', weekKeys.join(','));
  } else {
    const from = (fromDate || '').toString().slice(0, 10);
    const to = (toDate || '').toString().slice(0, 10);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
  }
  const res = await fetch(
    `${API_BASE}/api/gift-cards/eligible?${params.toString()}`,
    authOpts()
  );
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to load');
  return data;
}

export async function saveGiftCard(periodMonth, transporterId, issued, giftCardAmount = 0) {
  const res = await fetch(`${API_BASE}/api/gift-cards/save`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      period_month: periodMonth,
      transporter_id: transporterId,
      issued: !!issued,
      gift_card_amount: giftCardAmount,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to save');
  return data;
}

export async function getIssuedGiftCards() {
  const res = await fetch(`${API_BASE}/api/gift-cards/issued`, authOpts());
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const { clearToken } = await import('./authStore.js');
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Failed to load issued gift cards');
  return data;
}
