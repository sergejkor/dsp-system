import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { query } from '../src/db.js';

/**
 * Import Autoplan.xlsx into car_planning table.
 *
 * Usage (from backend folder):
 *   node scripts/import-autoplan.js "C:\Users\serge\Downloads\Autoplan.xlsx"
 */

function parseHeaderDate(header, year) {
  const s = String(header || '').trim();
  // Match like "4. Jan.", "19.Apr.", "02. May", "3. Mrz."
  const m = s.match(/^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\.?$/) || s.match(/^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\.?$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monName = m[2].toLowerCase().replace(/[^a-zäöü]/g, '');
  const map = {
    jan: 1,
    januar: 1,
    'jan.': 1,
    feb: 2,
    februar: 2,
    'feb.': 2,
    mrz: 3,
    märz: 3,
    mar: 3,
    'mrz.': 3,
    apr: 4,
    april: 4,
    'apr.': 4,
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
      console.error('Expected first column to be "Kennzeichen" (vehicle id/plate). Detected headers:', headers);
      process.exit(1);
    }

    const vehicleCol = 0;
    const year = new Date().getFullYear();

    const dateCols = [];
    for (let col = 1; col < headers.length; col++) {
      const iso = parseHeaderDate(headers[col], year);
      if (iso) {
        dateCols.push({ col, iso });
      }
    }

    if (!dateCols.length) {
      console.error('Could not parse any date columns from Autoplan.xlsx headers.');
      console.error('Detected headers:', headers);
      process.exit(1);
    }

    console.log('Using vehicle column:', headers[vehicleCol]);
    console.log('Detected date columns:', dateCols.map((d) => `${headers[d.col]} -> ${d.iso}`).join(', '));

    let imported = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawVehicle = String(row[vehicleCol] || '').trim();
      if (!rawVehicle) continue;

      // Match ONLY by numeric part of the plate/vehicle id.
      // Extract digits from Excel value: e.g. "M-AZ 1659E" -> "1659"
      const digits = rawVehicle.replace(/[^0-9]/g, '');
      if (!digits) continue;

      // Find car where numeric part of license_plate OR vehicle_id matches.
      let carRes = await query(
        `SELECT id
         FROM cars
         WHERE regexp_replace(COALESCE(license_plate, ''), '[^0-9]', '', 'g') = $1
            OR regexp_replace(COALESCE(vehicle_id, ''), '[^0-9]', '', 'g') = $1
         LIMIT 1`,
        [digits]
      );
      let car = carRes.rows[0];
      if (!car) {
        // Auto-create car if not found so that planning still works.
        const insertRes = await query(
          `INSERT INTO cars (vehicle_id, license_plate, status, created_at, updated_at)
           VALUES ($1, $2, 'Active', NOW(), NOW())
           RETURNING id`,
          [rawVehicle, rawVehicle]
        );
        car = insertRes.rows[0];
        console.log(`Created car for "${rawVehicle}" with id ${car.id}`);
      }

      for (const { col, iso } of dateCols) {
        const rawDriver = String(row[col] || '').trim();
        if (!rawDriver) continue;

        await query(
          `INSERT INTO car_planning (car_id, plan_date, driver_identifier, abfahrtskontrolle, updated_at)
           VALUES ($1, $2, NULLIF(TRIM($3), ''), false, NOW())
           ON CONFLICT (car_id, plan_date) DO UPDATE SET
             driver_identifier = EXCLUDED.driver_identifier,
             updated_at = NOW()`,
          [car.id, iso, rawDriver]
        );

        imported++;
      }
    }

    console.log(`Imported / updated ${imported} planning rows from Autoplan.`);
  } catch (err) {
    console.error('Autoplan import failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();

