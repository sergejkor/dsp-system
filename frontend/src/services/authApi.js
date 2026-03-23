import { getToken, setToken, clearToken } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com';

function getHeaders() {
  const t = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email: (email || '').trim(), password: password || '' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  setToken(data.token);
  return data;
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: getHeaders() });
  } catch (_) {}
  clearToken();
}

export async function me() {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getHeaders() });
  if (res.status === 401) {
    clearToken();
    return null;
  }
  return handle(res);
}

export async function changePassword(currentPassword, newPassword) {
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  return handle(res);
}

export async function resetPassword(userId, newPassword) {
  const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
  });
  return handle(res);
}

export async function lockUser(id) {
  const res = await fetch(`${API_BASE}/api/auth/users/${id}/lock`, { method: 'POST', headers: getHeaders() });
  return handle(res);
}

export async function unlockUser(id) {
  const res = await fetch(`${API_BASE}/api/auth/users/${id}/unlock`, { method: 'POST', headers: getHeaders() });
  return handle(res);
}

export async function setLoginEnabled(userId, enabled) {
  const res = await fetch(`${API_BASE}/api/auth/users/${userId}/login-enabled`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ login_enabled: enabled }),
  });
  return handle(res);
}

export { getToken, setToken, clearToken };
