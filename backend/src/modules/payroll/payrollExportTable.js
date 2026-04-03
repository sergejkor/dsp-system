import * as XLSX from 'xlsx';

function formatMonthLabel(month) {
  const raw = String(month || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return raw || 'Payroll';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const dt = new Date(year, monthIndex, 1);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(dt);
}

function formatDate(value) {
  const raw = String(value || '').slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return value || '';
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function exportPayrollTableToExcel(month, rows) {
  const monthLabel = formatMonthLabel(month);
  const headers = [
    'Name',
    'PN',
    'Working days',
    'Krank',
    'Urlaub',
    'Carryover days',
    'Rest Urlaub',
    'Total bonus',
    'Abzug',
    'Verpfl. mehr',
    'Fahrtengeld',
    'Bonus',
    'Eintrittsdatum',
    'Austrittsdatum',
    'Vorschuss',
  ];

  const dataRows = (Array.isArray(rows) ? rows : []).map((row) => [
    row?.name || '',
    row?.pn || '',
    Number(row?.working_days) || 0,
    Number(row?.krank_days) || 0,
    Number(row?.urlaub_days) || 0,
    round2(row?.carryover_days),
    round2(row?.rest_urlaub),
    round2(row?.total_bonus),
    round2(row?.abzug),
    round2(row?.verpfl_mehr),
    round2(row?.fahrt_geld),
    round2(row?.bonus),
    formatDate(row?.eintrittsdatum),
    formatDate(row?.austrittsdatum),
    round2(row?.vorschuss),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Payroll month', monthLabel],
    [],
    headers,
    ...dataRows,
  ]);

  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  const sheetName = `Payroll ${monthLabel}`.slice(0, 31);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export default {
  exportPayrollTableToExcel,
};
