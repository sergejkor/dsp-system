import 'dotenv/config';
import xlsx from 'xlsx';
import { pool, query } from '../src/db.js';

/**
 * Import damage cases from Schadenstabelle.xlsx into damage_cases table.
 *
 * NOTE: You may need to adjust the column names below to match
 * the exact headers in your Excel file.
 */

function getCell(row, key) {
  const v = row[key];
  return v === undefined || v === null ? '' : v;
}

function toDateIso(value) {
  if (!value) return null;
  // xlsx can give Date, number (Excel serial) or string
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number') {
    const d = xlsx.SSF.parse_date_code(value);
    if (!d) return null;
    const y = d.y;
    const m = String(d.m).padStart(2, '0');
    const day = String(d.d).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(value).trim();
  if (!s) return null;
  // try yyyy-mm-dd or dd.mm.yyyy
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const [, d, mm, y] = m;
    return `${y}-${mm.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function toTextOrDate(value) {
  if (value === undefined || value === null) return null;
  // Many columns are "date-like" but stored as TEXT; Excel may store them as serial numbers.
  if (typeof value === 'number' || value instanceof Date) return toDateIso(value);
  const s = String(value).trim();
  if (!s) return null;
  // If user typed date-like text, normalize it too.
  const maybe = toDateIso(s);
  return maybe || s;
}

async function main() {
  const filePath = process.argv[2] || './data/sheets-export/Schadenstabelle.xlsx';
  const sheetArg = process.argv[3] || null; // optional: sheet name or index
  console.log('Reading Excel file:', filePath);

  const wb = xlsx.readFile(filePath);
  const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function readMatrix(sheetName) {
    const sheet = wb.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  }

  function findHeader(matrix) {
    const keywords = [
      'date',
      'fahrer',
      'schadensnummer',
      'kurzbeschreibung',
      'kommentare',
      'offen',
      'geschlossen',
      'unfallnummer',
      'aktenzeichen',
      'kosten',
    ];
    let best = { score: 0, rowIdx: -1, header: null };
    const maxScan = Math.min(matrix.length, 500);
    for (let i = 0; i < maxScan; i += 1) {
      const row = matrix[i];
      if (!Array.isArray(row)) continue;
      const cells = row.map((c) => norm(c));
      if (cells.every((c) => !c)) continue;
      let score = 0;
      for (const k of keywords) {
        if (cells.some((c) => c.includes(k))) score += 1;
      }
      if (score > best.score) {
        best = { score, rowIdx: i, header: row.map((c) => String(c || '').trim()) };
      }
      if (score >= 6) break;
    }
    return best;
  }

  let selectedSheetNames = wb.SheetNames;
  if (sheetArg) {
    const asNum = Number(sheetArg);
    if (Number.isFinite(asNum) && wb.SheetNames[asNum]) {
      selectedSheetNames = [wb.SheetNames[asNum]];
    } else if (wb.SheetNames.includes(sheetArg)) {
      selectedSheetNames = [sheetArg];
    } else {
      console.warn('Sheet argument not found, scanning all sheets.');
    }
  }

  let chosen = null;
  for (const name of selectedSheetNames) {
    const matrix = readMatrix(name);
    const headerInfo = findHeader(matrix);
    if (!chosen || headerInfo.score > chosen.headerInfo.score) {
      chosen = { sheetName: name, matrix, headerInfo };
    }
  }

  if (!chosen || chosen.headerInfo.rowIdx === -1 || chosen.headerInfo.score < 3) {
    console.error('Could not find header row on any sheet.');
    console.error('Sheets:', wb.SheetNames);
    const first = wb.SheetNames[0];
    const preview = readMatrix(first);
    console.error(`First 20 rows preview from sheet "${first}":`);
    for (let i = 0; i < Math.min(preview.length, 20); i += 1) {
      console.error(i + 1, preview[i]);
    }
    process.exit(1);
  }

  const { sheetName, matrix } = chosen;
  const headerRowIdx = chosen.headerInfo.rowIdx;
  const header = chosen.headerInfo.header;
  console.log('Using sheet:', sheetName);

  const colIndex = new Map();
  header.forEach((h, idx) => {
    if (!h) return;
    colIndex.set(norm(h), idx);
  });

  const get = (rowArr, key) => {
    const idx = colIndex.get(norm(key));
    if (idx == null) return '';
    return rowArr[idx];
  };

  const dataRows = matrix.slice(headerRowIdx + 1);
  console.log('Header row:', headerRowIdx + 1);
  console.log('Data rows found:', dataRows.length);

  let inserted = 0;
  let processed = 0;

  for (const rowArr of dataRows) {
    if (!Array.isArray(rowArr)) continue;
    // Stop if row is completely empty
    const any = rowArr.some((v) => String(v || '').trim() !== '');
    if (!any) continue;

    const date = toDateIso(get(rowArr, 'Date'));
    const unfallnummer = String(get(rowArr, 'Unfallnummer (Datum_Kennzeichen)') || '').trim() || null;
    const fahrer = String(get(rowArr, 'Fahrer') || '').trim() || null;
    const schadensnummer = String(get(rowArr, 'Schadensnummer') || '').trim() || null;
    const polizeiliches_aktenzeichen = toTextOrDate(get(rowArr, 'Polizeiliches Aktenzeichen'));
    const vorgang_angelegt = toTextOrDate(get(rowArr, 'Vorgang angelegt'));
    const fahrerformular_vollstaendig = toTextOrDate(get(rowArr, 'Fahrerformular vollständig'));
    const meldung_an_partner_abgegeben = toTextOrDate(get(rowArr, 'Meldung an Partner abgegeben'));
    const deckungszusage_erhalten = toTextOrDate(get(rowArr, 'Deckungszusage erhalten'));
    const kostenuebernahme_eigene_versicherung = toTextOrDate(get(rowArr, 'Kostenübernahme eigene Versicherung'));
    const kostenuebernahme_fremde_versicherung = toTextOrDate(get(rowArr, 'Kostenübernahme fremde Versicherung'));
    const kosten_alfamile_raw = get(rowArr, 'Kosten Alfamile');
    const regress_fahrer = toTextOrDate(get(rowArr, 'Regress Fahrer'));
    const offen_geschlossen = toTextOrDate(get(rowArr, 'Offen/geschlossen'));
    const heute = toTextOrDate(get(rowArr, 'Heute'));
    const alter_tage_lt_90 = toTextOrDate(get(rowArr, 'Alter/Tage: <90'));
    const kurzbeschreibung = toTextOrDate(get(rowArr, 'Kurzbeschreibung'));
    const kommentare = toTextOrDate(get(rowArr, 'Kommentare'));

    const kosten_alfamile =
      kosten_alfamile_raw !== '' && kosten_alfamile_raw != null
        ? Number(String(kosten_alfamile_raw).replace(',', '.'))
        : null;

    // Required fields
    if (!unfallnummer || !fahrer || !schadensnummer) continue;

    processed += 1;
    const res = await query(
      `INSERT INTO damages (
         date,
         unfallnummer,
         fahrer,
         schadensnummer,
         polizeiliches_aktenzeichen,
         vorgang_angelegt,
         fahrerformular_vollstaendig,
         meldung_an_partner_abgegeben,
         deckungszusage_erhalten,
         kostenuebernahme_eigene_versicherung,
         kostenuebernahme_fremde_versicherung,
         kosten_alfamile,
         regress_fahrer,
         offen_geschlossen,
         heute,
         alter_tage_lt_90,
         kurzbeschreibung,
         kommentare
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT ON CONSTRAINT uq_damages_schadensnummer_cons DO UPDATE SET
         date = EXCLUDED.date,
         unfallnummer = EXCLUDED.unfallnummer,
         fahrer = EXCLUDED.fahrer,
         polizeiliches_aktenzeichen = EXCLUDED.polizeiliches_aktenzeichen,
         vorgang_angelegt = EXCLUDED.vorgang_angelegt,
         fahrerformular_vollstaendig = EXCLUDED.fahrerformular_vollstaendig,
         meldung_an_partner_abgegeben = EXCLUDED.meldung_an_partner_abgegeben,
         deckungszusage_erhalten = EXCLUDED.deckungszusage_erhalten,
         kostenuebernahme_eigene_versicherung = EXCLUDED.kostenuebernahme_eigene_versicherung,
         kostenuebernahme_fremde_versicherung = EXCLUDED.kostenuebernahme_fremde_versicherung,
         kosten_alfamile = EXCLUDED.kosten_alfamile,
         regress_fahrer = EXCLUDED.regress_fahrer,
         offen_geschlossen = EXCLUDED.offen_geschlossen,
         heute = EXCLUDED.heute,
         alter_tage_lt_90 = EXCLUDED.alter_tage_lt_90,
         kurzbeschreibung = EXCLUDED.kurzbeschreibung,
         kommentare = EXCLUDED.kommentare,
         updated_at = NOW()
       RETURNING id`,
      [
        date,
        unfallnummer,
        fahrer,
        schadensnummer,
        polizeiliches_aktenzeichen,
        vorgang_angelegt,
        fahrerformular_vollstaendig,
        meldung_an_partner_abgegeben,
        deckungszusage_erhalten,
        kostenuebernahme_eigene_versicherung,
        kostenuebernahme_fremde_versicherung,
        Number.isFinite(kosten_alfamile) ? kosten_alfamile : null,
        regress_fahrer,
        offen_geschlossen,
        heute,
        alter_tage_lt_90,
        kurzbeschreibung,
        kommentare,
      ]
    );
    if (res?.rows?.[0]?.id) inserted += 1;
  }

  console.log(`Import finished. Processed ${processed} data rows, inserted ${inserted}.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Import failed:', err);
  pool.end().catch(() => {});
  process.exit(1);
});

