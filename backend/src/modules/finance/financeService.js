import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import {
  parseAnnualOverview,
  parseMonthlyDetail,
  extractMonthlySeriesFromAnnual,
} from './financeParser.js';
import { runProphetForecast } from './financeForecast.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SNAPSHOT = path.join(__dirname, '../../../data/finance/workbook-snapshot.json');

const MONTH_SHEET_RE = /^(\d{2}) (\d{4})$/;

/** For /api/health — verify deploy and data file on the server. */
export function getFinanceHealthInfo() {
  return {
    routeMounted: true,
    snapshotRelative: 'backend/data/finance/workbook-snapshot.json',
    snapshotExists: fs.existsSync(DEFAULT_SNAPSHOT),
    snapshotAbsolutePath: DEFAULT_SNAPSHOT,
  };
}

function loadWorkbookMatrices() {
  const xlsxPath = process.env.FINANCE_XLSX_PATH;
  if (xlsxPath && fs.existsSync(xlsxPath)) {
    const wb = XLSX.readFile(xlsxPath);
    const sheets = {};
    for (const name of wb.SheetNames) {
      sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
    }
    return { sheets, source: 'FINANCE_XLSX_PATH' };
  }
  if (fs.existsSync(DEFAULT_SNAPSHOT)) {
    const snap = JSON.parse(fs.readFileSync(DEFAULT_SNAPSHOT, 'utf8'));
    return { sheets: snap.sheets || {}, source: 'data/finance/workbook-snapshot.json' };
  }
  return { sheets: null, source: null };
}

/**
 * @returns {Promise<object>}
 */
export async function getFinanceBundle() {
  const { sheets, source } = loadWorkbookMatrices();
  if (!sheets) {
    return {
      ok: false,
      error: 'no_finance_data',
      hint: 'Place workbook-snapshot.json under backend/data/finance or set FINANCE_XLSX_PATH to an .xlsx file.',
      meta: { source: null },
    };
  }

  const tabelle1 = sheets.Tabelle1;
  const annualOverview = parseAnnualOverview(tabelle1 || []);

  const monthSheetNames = Object.keys(sheets).filter((n) => MONTH_SHEET_RE.test(n));
  monthSheetNames.sort((a, b) => {
    const [, ma, ya] = a.match(MONTH_SHEET_RE);
    const [, mb, yb] = b.match(MONTH_SHEET_RE);
    if (ya !== yb) return Number(ya) - Number(yb);
    return Number(ma) - Number(mb);
  });

  const monthlySheets = {};
  for (const n of monthSheetNames) {
    monthlySheets[n] = parseMonthlyDetail(sheets[n], n);
  }

  const forecastMonths = Number(process.env.FINANCE_FORECAST_MONTHS || 12);
  const forecastTargets = [
    { key: 'summeFahrten', rowCode: '1041', label: 'Summe Fahrten' },
    { key: 'erlöseParcel', rowCode: '1021', label: 'Erlöse Parcel' },
    { key: 'betriebsergebnis', rowCode: '1300', label: 'Betriebsergebnis' },
  ];

  const forecasts = {};
  for (const t of forecastTargets) {
    const history = extractMonthlySeriesFromAnnual(annualOverview.tableRows, t.rowCode);
    const forecast = runProphetForecast(history, forecastMonths);
    forecasts[t.key] = {
      key: t.key,
      rowCode: t.rowCode,
      label: t.label,
      history,
      forecast,
    };
  }

  return {
    ok: true,
    meta: {
      source,
      currency: 'EUR',
      generatedAt: new Date().toISOString(),
      sheetNames: Object.keys(sheets),
      monthSheetNames,
    },
    annualOverview: {
      periods: annualOverview.periods,
      tableRows: annualOverview.tableRows,
      headerRowIndex: annualOverview.headerRowIndex,
    },
    monthlySheets,
    forecasts,
  };
}
