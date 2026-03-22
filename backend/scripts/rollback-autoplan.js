import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { query } from '../src/db.js';

function parseHeaderDate(header, year) {
  const s = String(header || '').trim();
  const m =
    s.match(/^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\.?$/) ||
    s.match(/^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\.?$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monName = m[2].toLowerCase().replace(/[^a-zäöü]/g, '');
  const map = {
    jan: 1,
    januar: 1,
    feb: 2,
    februar: 2,
    mrz: 3,
    märz: 3,
    mar: 3,
    apr: 4,
    april: 4,
    may: 5,
    mai: 5,
    jun: 6,
    juni: 6,
    jul: 7,
    juli: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    okt: 10,
    oct: 10,
    oktober: 10,
    nov: 11,
    november: 11,
    dez: 12,
    dec: 12,
    dezember: 12,
  };
  const key = Object.keys(map).find((k) => monName.startsWith(k));
  if (!key) return null;
  const month = map[key];
  const y = year || new Date().getFullYear();
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

async function run() {
  try {
    const fileArg = process.argv[2] || 'Autoplan.xlsx';
    const absPath = path.isAbsolute(fileArg)
      ? fileArg
      : path.join(process.cwd(), fileArg);

    if (!fs.existsSync(absPath)) {
      console.error('File not found:', absPath);
      process.exit(1);
    }

    const wb = xlsx.readFile(absPath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) {
      console.log('Sheet is empty.');
      return;
    }

    const headers = rows[0];
    if (!headers.length || String(headers[0]).trim().toLowerCase() !== 'kennzeichen') {
      console.error('Expected first column to be \"Kennzeichen\" (vehicle id/plate). Detected headers:', headers);
      process.exit(1);
    }

    const vehicleCol = 0;
    const year = new Date().getFullYear();

    const dateCols = [];
    for (let col = 1; col < headers.length; col++) {
      const iso = parseHeaderDate(headers[col], year);
      if (iso) {
        dateCols.push(iso);
      }
    }

    if (!dateCols.length) {
      console.error('Could not parse any date columns from Autoplan.xlsx headers.');
      console.error('Detected headers:', headers);
      process.exit(1);
    }

    const dateSet = Array.from(new Set(dateCols));

    // Collect all numeric parts of plates from file.
    const digitSet = new Set();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawVehicle = String(row[vehicleCol] || '').trim();
      if (!rawVehicle) continue;
      const digits = rawVehicle.replace(/[^0-9]/g, '');
      if (!digits) continue;
      digitSet.add(digits);
    }

    if (!digitSet.size) {
      console.log('No vehicle rows with digits found, nothing to rollback.');
      return;
    }

    const digitArray = Array.from(digitSet);

    // Find all car_ids that match these plates.
    const carRes = await query(
      `SELECT id
       FROM cars
       WHERE regexp_replace(COALESCE(license_plate, ''), '[^0-9]', '', 'g') = ANY($1::text[])
          OR regexp_replace(COALESCE(vehicle_id, ''), '[^0-9]', '', 'g') = ANY($1::text[])`,
      [digitArray]
    );
    const carIds = carRes.rows.map((r) => r.id);
    if (!carIds.length) {
      console.log('No matching cars found in DB, nothing to rollback.');
      return;
    }

    // Delete planning rows for these cars and these dates.
    const delRes = await query(
      `DELETE FROM car_planning
       WHERE car_id = ANY($1::int[])
         AND plan_date = ANY($2::date[])
       RETURNING car_id, plan_date`,
      [carIds, dateSet]
    );

    console.log(`Rolled back ${delRes.rowCount} planning rows imported from Autoplan.`);
  } catch (err) {
    console.error('Rollback Autoplan failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();

