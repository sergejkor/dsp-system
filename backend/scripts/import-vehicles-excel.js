/**
 * Import vehicles from VehiclesData.xlsx into the cars table.
 * Usage: node scripts/import-vehicles-excel.js [path-to-file]
 * Default path: ../Downloads/VehiclesData.xlsx (relative to backend) or set VEHICLES_EXCEL_PATH.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';
import { query } from '../src/db.js';

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
  }
  return null;
}

function pickStr(row, ...keys) {
  const v = pick(row, ...keys);
  return v != null ? String(v).trim() : null;
}

function pickNum(row, ...keys) {
  const v = pick(row, ...keys);
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseDate(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && val > 0) {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  return null;
}

function normalizeStatus(s) {
  if (!s) return 'Active';
  const u = String(s).toUpperCase();
  if (u === 'ACTIVE' || u === 'OPERATIONAL') return 'Active';
  if (u.includes('MAINTENANCE') || u.includes('WARTUNG')) return 'Maintenance';
  if (u.includes('OUT OF SERVICE') || u.includes('AUSSER DIENST')) return 'Out of Service';
  if (u.includes('DECOMMISSIONED') || u.includes('AUSGESCHIEDEN')) return 'Decommissioned';
  return 'Active';
}

function rowToCar(row) {
  const vehicleId = pickStr(row, 'Vehicle ID', 'vehicle_id', 'VehicleID', 'FIN', 'fin');
  const vin = pickStr(row, 'VIN', 'vin', 'FIN', 'fin');
  if (!vehicleId && !vin) return null;
  const id = vehicleId || vin;
  const modelPart = pickStr(row, 'Fahrzeugname', 'Vehicle Model', 'model', 'Model', 'Modell', 'Marke');
  const model = modelPart || (row.Modell && row.Marke ? `${row.Marke} ${row.Modell}`.trim() : null);
  return {
    vehicle_id: id,
    license_plate: pickStr(row, 'License Plate', 'license_plate', 'Nummernschild', 'Plate'),
    vin: vin || id,
    model,
    year: pickNum(row, 'Year', 'year', 'Jahr'),
    fuel_type: pickStr(row, 'Fuel Type', 'fuel_type', 'FuelType'),
    vehicle_type: pickStr(row, 'Vehicle Type', 'vehicle_type', 'VehicleType', 'Typus', 'serviceTier'),
    status: normalizeStatus(pickStr(row, 'Status', 'status', 'Betriebsstatus')),
    station: pickStr(row, 'Station', 'station', 'stationCode'),
    fleet_provider: pickStr(row, 'Fleet Provider', 'fleet_provider', 'Fahrzeuganbieter', 'subcontractorName'),
    mileage: pickNum(row, 'Mileage', 'mileage') ?? 0,
    registration_expiry: parseDate(pick(row, 'Registration Expiry', 'registration_expiry', 'Datum des Ablaufs der Registrierung')),
    insurance_expiry: parseDate(pick(row, 'Insurance Expiry', 'insurance_expiry')),
    lease_expiry: parseDate(pick(row, 'Lease Expiry', 'lease_expiry', 'Enddatum des Eigentums')),
  };
}

async function run() {
  const pathArg = process.argv[2];
  const envPath = process.env.VEHICLES_EXCEL_PATH;
  const defaultPath = resolve(process.cwd(), '..', 'Downloads', 'VehiclesData.xlsx');
  const filePath = pathArg || envPath || defaultPath;

  console.log('Reading:', filePath);
  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (e) {
    console.error('File not found or unreadable:', e.message);
    process.exit(1);
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    console.error('No sheet in workbook');
    process.exit(1);
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  console.log('Rows in sheet:', rows.length);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const car = rowToCar(rows[i]);
    if (!car) {
      skipped++;
      continue;
    }
    try {
      const existed = (await query('SELECT 1 FROM cars WHERE vehicle_id = $1', [car.vehicle_id])).rows.length > 0;
      await query(
        `INSERT INTO cars (
          vehicle_id, license_plate, vin, model, year, fuel_type, vehicle_type, status,
          station, fleet_provider, mileage, registration_expiry, insurance_expiry, lease_expiry
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (vehicle_id) DO UPDATE SET
          license_plate = EXCLUDED.license_plate,
          vin = EXCLUDED.vin,
          model = EXCLUDED.model,
          year = EXCLUDED.year,
          fuel_type = EXCLUDED.fuel_type,
          vehicle_type = EXCLUDED.vehicle_type,
          status = EXCLUDED.status,
          station = EXCLUDED.station,
          fleet_provider = EXCLUDED.fleet_provider,
          mileage = EXCLUDED.mileage,
          registration_expiry = EXCLUDED.registration_expiry,
          insurance_expiry = EXCLUDED.insurance_expiry,
          lease_expiry = EXCLUDED.lease_expiry,
          updated_at = NOW()`,
        [
          car.vehicle_id, car.license_plate, car.vin, car.model, car.year, car.fuel_type,
          car.vehicle_type, car.status, car.station, car.fleet_provider, car.mileage,
          car.registration_expiry, car.insurance_expiry, car.lease_expiry,
        ]
      );
      if (existed) updated++;
      else inserted++;
    } catch (e) {
      console.error('Row', i + 2, car.vehicle_id, e.message);
    }
  }

  const total = inserted + updated;
  console.log('Done. Inserted:', inserted, 'Updated:', updated, 'Skipped:', skipped);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
