const TOKEN_KEY = 'authToken';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeaders() {
  const t = getToken();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}
