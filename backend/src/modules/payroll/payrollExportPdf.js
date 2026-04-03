import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

function formatCurrency(value) {
  return `${round2(value).toFixed(2)} EUR`;
}

function buildTableRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => [
    row?.name || '',
    row?.pn || '',
    String(Number(row?.working_days) || 0),
    String(Number(row?.krank_days) || 0),
    String(Number(row?.urlaub_days) || 0),
    String(round2(row?.carryover_days).toFixed(2)),
    String(round2(row?.rest_urlaub).toFixed(2)),
    formatCurrency(row?.total_bonus),
    formatCurrency(row?.abzug),
    formatCurrency(row?.verpfl_mehr),
    formatCurrency(row?.fahrt_geld),
    formatCurrency(row?.bonus),
    formatDate(row?.eintrittsdatum),
    formatDate(row?.austrittsdatum),
    formatCurrency(row?.vorschuss),
  ]);
}

export async function exportPayrollTableToPdf(month, rows) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 1190;
  const pageHeight = 842;
  const margin = 28;
  const rowHeight = 18;
  const headerHeight = 22;
  const titleGap = 18;
  const columns = [
    { label: 'Name', width: 150 },
    { label: 'PN', width: 48 },
    { label: 'Work', width: 42 },
    { label: 'Krank', width: 48 },
    { label: 'Urlaub', width: 48 },
    { label: 'Carryover', width: 58 },
    { label: 'Rest Urlaub', width: 62 },
    { label: 'Total bonus', width: 72 },
    { label: 'Abzug', width: 68 },
    { label: 'Verpfl.', width: 68 },
    { label: 'Fahrt', width: 68 },
    { label: 'Bonus', width: 60 },
    { label: 'Eintritt', width: 62 },
    { label: 'Austritt', width: 62 },
    { label: 'Vorschuss', width: 72 },
  ];
  const headers = columns.map((col) => col.label);
  const tableRows = buildTableRows(rows);

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawPageHeader = () => {
    page.drawText(`Payroll month: ${formatMonthLabel(month)}`, {
      x: margin,
      y: pageHeight - margin,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.17, 0.28),
    });
    y = pageHeight - margin - titleGap;
  };

  const drawTableHeader = () => {
    let x = margin;
    page.drawRectangle({
      x: margin,
      y: y - headerHeight + 4,
      width: columns.reduce((sum, col) => sum + col.width, 0),
      height: headerHeight,
      color: rgb(0.92, 0.95, 0.99),
      borderColor: rgb(0.77, 0.82, 0.88),
      borderWidth: 1,
    });
    headers.forEach((header, index) => {
      page.drawText(header, {
        x: x + 3,
        y: y - 12,
        size: 8,
        font: fontBold,
        color: rgb(0.13, 0.18, 0.24),
        maxWidth: columns[index].width - 6,
      });
      x += columns[index].width;
    });
    y -= headerHeight;
  };

  const ensureRoom = () => {
    if (y - rowHeight < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      drawPageHeader();
      drawTableHeader();
    }
  };

  drawPageHeader();
  drawTableHeader();

  tableRows.forEach((cells, rowIndex) => {
    ensureRoom();
    let x = margin;
    if (rowIndex % 2 === 0) {
      page.drawRectangle({
        x: margin,
        y: y - rowHeight + 3,
        width: columns.reduce((sum, col) => sum + col.width, 0),
        height: rowHeight,
        color: rgb(0.985, 0.989, 0.995),
      });
    }
    cells.forEach((cell, index) => {
      page.drawText(String(cell || ''), {
        x: x + 3,
        y: y - 11,
        size: 7.5,
        font,
        color: rgb(0.12, 0.16, 0.22),
        maxWidth: columns[index].width - 6,
      });
      x += columns[index].width;
    });
    y -= rowHeight;
  });

  return pdfDoc.save();
}

export default {
  exportPayrollTableToPdf,
};
