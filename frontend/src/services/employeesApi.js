import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getEmployeesHealth() {
  const response = await fetch(`${API_BASE}/api/employees/health`, authOpts());
  if (!response.ok) throw new Error('Employees health failed');
  return response.json();
}

export async function listEmployees({ search = '', onlyActive = true } = {}) {
  const params = new URLSearchParams();
  if (search && search.trim()) params.set('search', search.trim());
  if (onlyActive) params.set('onlyActive', 'true');

  const url =
    `${API_BASE}/api/employees` + (params.toString() ? `?${params.toString()}` : '');

  const response = await fetch(url, authOpts());
  if (!response.ok) throw new Error('Employees list failed');
  return response.json();
}

export async function getEmployee(employeeId) {
  const response = await fetch(`${API_BASE}/api/employees/${encodeURIComponent(employeeId)}`, authOpts());
  if (!response.ok) throw new Error('Employee load failed');
  return response.json();
}
