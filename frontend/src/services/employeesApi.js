import { getAuthHeaders } from './authStore.js';

import { API_BASE } from '../config/apiBase.js';

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

export async function getEmployeeVacationSummary(employeeId, year) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeId)}/vacation-summary${params.toString() ? `?${params.toString()}` : ''}`,
    authOpts()
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee vacation summary failed');
  return out;
}

export async function updateEmployeeLocalSettings(employeeId, payload) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeId)}/local-settings`,
    authOpts({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vacationDaysOverride: payload?.vacationDaysOverride ?? null,
        vacationDaysOverrideYear: payload?.vacationDaysOverrideYear ?? null,
        totalYearVacation: payload?.totalYearVacation ?? payload?.vacationDaysOverride ?? null,
        totalYearVacationYear: payload?.totalYearVacationYear ?? payload?.vacationDaysOverrideYear ?? null,
      }),
    })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee local settings update failed');
  return out;
}

export async function getEmployeeContractExtensions(employeeRef) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/contract-extensions`,
    authOpts()
  );
  if (!response.ok) throw new Error('Employee contract extensions load failed');
  return response.json();
}

export async function addEmployeeContractExtension(employeeRef, payload) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/contract-extensions`,
    authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: payload?.startDate || '',
        endDate: payload?.endDate || '',
      }),
    })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee contract extension save failed');
  return out;
}

export async function getEmployeeContracts(employeeRef) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/contracts`,
    authOpts()
  );
  if (!response.ok) throw new Error('Employee contracts load failed');
  return response.json();
}

export async function addEmployeeContract(employeeRef, payload) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/contracts`,
    authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: payload?.startDate || '',
        endDate: payload?.endDate ?? null,
      }),
    })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee contract save failed');
  return out;
}

export async function terminateEmployeeContract(employeeRef, payload) {
  const form = new FormData();
  form.append('contractStartDate', payload?.contractStartDate || '');
  if (payload?.contractEndDate != null) {
    form.append('contractEndDate', payload.contractEndDate);
  }
  form.append('terminationDate', payload?.terminationDate || '');
  form.append('terminationType', payload?.terminationType || '');
  if (payload?.terminationInitiator) {
    form.append('terminationInitiator', payload.terminationInitiator);
  }
  if (payload?.file) {
    form.append('file', payload.file);
  }

  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/contracts/terminate`,
    authOpts({
      method: 'POST',
      body: form,
    })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee contract termination failed');
  return out;
}

export async function getEmployeeRescues(employeeRef) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/rescues`,
    authOpts()
  );
  if (!response.ok) throw new Error('Employee rescues load failed');
  return response.json();
}

export async function addEmployeeRescue(employeeRef, rescueDate) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/rescues`,
    authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rescueDate }),
    })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee rescue save failed');
  return out;
}

export async function deleteEmployeeRescue(employeeRef, rescueId) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/rescues/${encodeURIComponent(rescueId)}`,
    authOpts({ method: 'DELETE' })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee rescue delete failed');
  return out;
}

export async function getEmployeeDocuments(employeeRef) {
  const response = await fetch(`${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/documents`, authOpts());
  if (!response.ok) throw new Error('Employee documents load failed');
  return response.json();
}

export async function uploadEmployeeDocument(employeeRef, file, documentType, fileName = '') {
  const form = new FormData();
  form.append('file', file);
  form.append('document_type', documentType);
  if (fileName) {
    form.append('file_name', fileName);
  }
  let response;
  try {
    response = await fetch(
      `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/documents`,
      authOpts({ method: 'POST', body: form })
    );
  } catch (error) {
    throw new Error('Document upload request failed');
  }
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee document upload failed');
  return out;
}

export async function downloadEmployeeDocument(employeeRef, docId, fileName) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/documents/${encodeURIComponent(docId)}/download`,
    authOpts()
  );
  if (!response.ok) throw new Error('Employee document download failed');
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName || `employee-document-${docId}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function viewEmployeeDocument(employeeRef, docId) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/documents/${encodeURIComponent(docId)}/download`,
    authOpts()
  );
  if (!response.ok) throw new Error('Employee document view failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Popup was blocked while opening the document');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

export async function deleteEmployeeDocument(employeeRef, docId) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/documents/${encodeURIComponent(docId)}`,
    authOpts({ method: 'DELETE' })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee document delete failed');
  return out;
}

export async function deleteEmployeeDocumentsBulk(employeeRef, docIds) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/documents`,
    authOpts({
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docIds: Array.isArray(docIds) ? docIds : [] }),
    })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Employee documents bulk delete failed');
  return out;
}

export async function deleteImportedSourceDocuments(employeeRef, docId) {
  const response = await fetch(
    `${API_BASE}/api/employees/${encodeURIComponent(employeeRef)}/documents/${encodeURIComponent(docId)}/import-source`,
    authOpts({ method: 'DELETE' })
  );
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(out.error || 'Imported source delete failed');
  return out;
}
