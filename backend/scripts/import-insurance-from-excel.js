import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { query, pool } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function toDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  // Excel иногда отдает числа строками с немецкими разделителями:
  //   - "3.570,55" (точка=тысячи, запятая=десятичные)
  //   - "5170.55" (десятичные точкой, без тысяч)
  //   - "3 570,55" (пробелы как разделители)
  const raw = String(value).replace(/\s+/g, '').trim();
  if (!raw) return null;

  // убираем валютные символы/неожиданные символы, оставляя digits, '.' и ','
  const s = raw.replace(/[^\d.,-]/g, '');
  if (!s) return null;

  // оба разделителя: '.' тысячи, ',' десятичные
  if (s.includes(',') && s.includes('.')) {
    const norm = s.replace(/\./g, '').replace(',', '.');
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }

  // только запятая: десятичные запятая
  if (s.includes(',')) {
    const norm = s.replace(',', '.');
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }

  // только точки:
  // если формат "1.234.567" без десятичных — убираем точки как тысячи
  const thousandsOnly = s.match(/^\d{1,3}(?:\.\d{3})+$/);
  if (thousandsOnly) {
    const norm = s.replace(/\./g, '');
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }

  // иначе считаем точку десятичной (пример: 5170.55)
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function isTotalsRow(row) {
  const plate = trimOrNull(row['Kennzeichen']);
  const typ = trimOrNull(row['Typ']);
  const hersteller = trimOrNull(row['Hersteller']);
  if (!plate && !typ && !hersteller) return true;
  if (!plate && (typ || hersteller)) return false;
  if (plate && /^summe/i.test(plate)) return true;
  return false;
}

function readSheetRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

async function upsertVehicleRow(year, importId, raw) {
  if (isTotalsRow(raw)) return { skipped: 1 };

  const plate = trimOrNull(raw['Kennzeichen']);
  if (!plate) return { skipped: 1 };

  const payload = {
    insurance_year: year,
    plate_number: plate,
    vehicle_type: trimOrNull(raw['Typ']),
    manufacturer: trimOrNull(raw['Hersteller']),
    vehicle_usage:
      trimOrNull(raw['Fahrzeugverwendung']) ??
      trimOrNull(raw['Fahrzeug-\nverwendung']) ??
      null,
    wkz_2007: trimOrNull(raw['WKZ 2007']),
    status: trimOrNull(raw['Status']),
    liability_start: toDate(raw['Beginn Haftpflicht']),
    liability_end: toDate(raw['Ablauf Haftpflicht']),
    premium_total_eur: toNumber(raw['Prämie EUR']),
    claims_count: toNumber(raw['Anzahl Schäden']) ?? 0,
    customer_claims_count: toNumber(raw['Anzahl Kundenschäden']) ?? 0,
    contract_start: toDate(raw['Vers.-Beginn Haftpflicht']),
    contract_end: toDate(raw['Vers.-Ablauf Haftpflicht']),
    premium_liability_eur: toNumber(raw['Haftpflichtprämie EUR']),
    premium_full_casco_eur: toNumber(raw['Vollkaskoprämie EUR']),
    premium_partial_casco_eur: toNumber(raw['Teilkaskoprämie EUR']),
    premium_additional_1_eur: toNumber(raw['Zusatztarif1 Prämie EUR']),
    tariff_liability: trimOrNull(raw['Tarif Haftpflicht']),
    tariff_full_casco: trimOrNull(raw['Tarif Vollkasko']),
    tariff_partial_casco: trimOrNull(raw['Tarif Teilkasko']),
    vin: trimOrNull(raw['Fahrgestellnummer']),
    first_registration: toDate(raw['Erstzulassung']),
    holder: trimOrNull(raw['Halter']),
  };

  const values = [
    payload.insurance_year,
    payload.plate_number,
    payload.vehicle_type,
    payload.manufacturer,
    payload.vehicle_usage,
    payload.wkz_2007,
    payload.status,
    payload.liability_start,
    payload.liability_end,
    payload.premium_total_eur,
    payload.claims_count,
    payload.customer_claims_count,
    payload.contract_start,
    payload.contract_end,
    payload.premium_liability_eur,
    payload.premium_full_casco_eur,
    payload.premium_partial_casco_eur,
    payload.premium_additional_1_eur,
    payload.tariff_liability,
    payload.tariff_full_casco,
    payload.tariff_partial_casco,
    payload.vin,
    payload.first_registration,
    payload.holder,
    importId,
    raw ? JSON.stringify(raw) : null,
  ];

  const sql = `
    INSERT INTO insurance_vehicle_records (
      insurance_year, plate_number, vehicle_type, manufacturer, vehicle_usage,
      wkz_2007, status, liability_start, liability_end,
      premium_total_eur, claims_count, customer_claims_count,
      contract_start, contract_end,
      premium_liability_eur, premium_full_casco_eur, premium_partial_casco_eur,
      premium_additional_1_eur,
      tariff_liability, tariff_full_casco, tariff_partial_casco,
      vin, first_registration, holder,
      import_id, raw_source_row, created_at, updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,$12,
      $13,$14,
      $15,$16,$17,
      $18,
      $19,$20,$21,
      $22,$23,$24,
      $25,
      $26,
      NOW(), NOW()
    )
    ON CONFLICT ON CONSTRAINT uq_insurance_vehicle_year_plate
    DO UPDATE SET
      vehicle_type = EXCLUDED.vehicle_type,
      manufacturer = EXCLUDED.manufacturer,
      vehicle_usage = EXCLUDED.vehicle_usage,
      wkz_2007 = EXCLUDED.wkz_2007,
      status = EXCLUDED.status,
      liability_start = EXCLUDED.liability_start,
      liability_end = EXCLUDED.liability_end,
      premium_total_eur = EXCLUDED.premium_total_eur,
      claims_count = EXCLUDED.claims_count,
      customer_claims_count = EXCLUDED.customer_claims_count,
      contract_start = EXCLUDED.contract_start,
      contract_end = EXCLUDED.contract_end,
      premium_liability_eur = EXCLUDED.premium_liability_eur,
      premium_full_casco_eur = EXCLUDED.premium_full_casco_eur,
      premium_partial_casco_eur = EXCLUDED.premium_partial_casco_eur,
      premium_additional_1_eur = EXCLUDED.premium_additional_1_eur,
      tariff_liability = EXCLUDED.tariff_liability,
      tariff_full_casco = EXCLUDED.tariff_full_casco,
      tariff_partial_casco = EXCLUDED.tariff_partial_casco,
      vin = EXCLUDED.vin,
      first_registration = EXCLUDED.first_registration,
      holder = EXCLUDED.holder,
      import_id = EXCLUDED.import_id,
      raw_source_row = EXCLUDED.raw_source_row,
      updated_at = NOW()
    RETURNING xmax::text = '0' AS inserted
  `;

  const res = await query(sql, values);
  const inserted = res.rows[0]?.inserted === true;
  return inserted ? { inserted: 1 } : { updated: 1 };
}

async function importFile(filePath, year) {
  const fileName = path.basename(filePath);
  console.log(`Importing file ${fileName} for year ${year}...`);

  const rows = readSheetRows(filePath);
  const totalRows = rows.length;

  const impRes = await query(
    `INSERT INTO insurance_imports (source_file_name, source_type, insurance_year, rows_count)
     VALUES ($1,$2,$3,$4)
     RETURNING id`,
    [fileName, 'vehicle_contracts', year, totalRows],
  );
  const importId = impRes.rows[0].id;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rows) {
    const r = await upsertVehicleRow(year, importId, raw);
    inserted += r.inserted || 0;
    updated += r.updated || 0;
    skipped += r.skipped || 0;
  }

  await query(
    `UPDATE insurance_imports
     SET inserted_count = $1, updated_count = $2, skipped_count = $3, updated_at = NOW()
     WHERE id = $4`,
    [inserted, updated, skipped, importId],
  );

  console.log(`Done ${fileName}: inserted=${inserted}, updated=${updated}, skipped=${skipped}`);
  return { inserted, updated, skipped, total: totalRows };
}

async function main() {
  try {
    const file2024 = path.resolve('C:\\Users\\serge\\Downloads\\KFZVertraege_20260318_212534.xlsx');
    const file2025 = path.resolve('C:\\Users\\serge\\Downloads\\KFZVertraege_20260318_211455.xlsx');
    const file2026 = path.resolve('C:\\Users\\serge\\Downloads\\KFZVertraege_20260318_210113.xlsx');

    const r2024 = await importFile(file2024, 2024);
    const r2025 = await importFile(file2025, 2025);
    const r2026 = await importFile(file2026, 2026);

    console.log('Summary:', { '2024': r2024, '2025': r2025, '2026': r2026 });
  } catch (e) {
    console.error('Import failed', e);
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
if (isMain) main();

