import { getAuthHeaders } from './authStore.js';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function authOpts(opts = {}) {
  return { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } };
}

export async function getPayrollHealth() {
  const response = await fetch(`${API_BASE}/api/payroll/health`, authOpts());
  if (!response.ok) throw new Error('Payroll health failed');
  return response.json();
}

/** Get KPI data by weeks for an employee (for DA Performance). */
export async function getEmployeeKpi(kenjoEmployeeId, employeeNumber) {
  const params = new URLSearchParams();
  if (kenjoEmployeeId) params.set('kenjo_employee_id', kenjoEmployeeId);
  if (employeeNumber) params.set('employee_number', employeeNumber);
  const response = await fetch(`${API_BASE}/api/payroll/kpi?${params}`, authOpts());
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load KPI data');
  }
  return response.json();
}

export async function saveEmployeeKpiComment(employeeId, year, week, comment) {
  const response = await fetch(`${API_BASE}/api/payroll/kpi/comment`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employee_id: employeeId,
      year,
      week,
      comment,
    }),
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Failed to save KPI comment');
  }
  return data;
}

export async function calculatePayroll(month, fromDate, toDate) {
  const params = new URLSearchParams({ month, from: fromDate, to: toDate });
  const response = await fetch(`${API_BASE}/api/payroll/calculate?${params}`, authOpts());
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Payroll calculation failed');
  }
  return response.json();
}

export async function savePayrollManualEntry(periodId, employeeId, payload) {
  const response = await fetch(`${API_BASE}/api/payroll/manual-entry`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      period_id: periodId,
      employee_id: employeeId,
      working_days: payload.working_days,
      total_bonus: payload.total_bonus,
      abzug: payload.abzug,
      bonus: payload.bonus,
      vorschuss: payload.vorschuss,
    }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Save manual entry failed');
  }
  return response.json();
}

/** lines: [ { amount, comment }, { amount, comment }, { amount, comment } ] */
export async function savePayrollAbzug(periodId, employeeId, lines) {
  const response = await fetch(`${API_BASE}/api/payroll/abzug`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period_id: periodId, employee_id: employeeId, lines: lines || [] }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Save Abzug failed');
  }
  return response.json();
}

export async function savePayrollBonus(periodId, employeeId, amount, comment) {
  const response = await fetch(`${API_BASE}/api/payroll/bonus`, authOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      period_id: periodId,
      employee_id: employeeId,
      amount: Number(amount) || 0,
      comment: String(comment ?? '').trim(),
    }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Save Bonus failed');
  }
  return response.json();
}

/** Export payroll table to ADP/Alfamile Excel; triggers download. */
export async function exportPayrollToAdp(month, rows) {
  const response = await fetch(`${API_BASE}/api/payroll/export-adp`, authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, rows }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Export failed');
  }
  const blob = await response.blob();
  const disp = response.headers.get('Content-Disposition') || '';
  const filename = disp.match(/filename="?([^";]+)"?/)?.[1]?.trim() || `Variable_Daten_Alfamile_${String(month).replace(/\D/g, '').slice(0, 6)}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
