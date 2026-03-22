import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';

function shaToMime(fileName, mimeType) {
  const s = String(fileName || '').toLowerCase();
  if (mimeType) return mimeType;
  if (s.endsWith('.pdf')) return 'application/pdf';
  if (s.endsWith('.xlsx') || s.endsWith('.xls')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (s.endsWith('.csv')) return 'text/csv';
  if (s.endsWith('.html') || s.endsWith('.htm')) return 'text/html';
  return 'application/octet-stream';
}

function extractByRegexPatterns(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return String(m[1]).trim();
  }
  return null;
}

function normalizeHeaderKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function mapRowObjectToPaveReportRow(rowObj) {
  const keys = Object.keys(rowObj || {});
  const norm = {};
  for (const k of keys) norm[normalizeHeaderKey(k)] = rowObj[k];

  const plate_number =
    norm.plate_number ||
    norm.kennzeichen ||
    norm.kfz_kennzeichen ||
    norm.vehicle_plate ||
    norm.plate ||
    norm.veh_plate ||
    null;

  const vehicle_id = norm.vehicle_id || norm.vin || norm.fahrzeugnummer || norm.vehicle_number || null;
  const driver_name = norm.driver_name || norm.fahrer || norm.verursacher || null;
  const report_type = norm.report_type || norm.typ || norm.type || null;
  const report_date = norm.report_date || norm.berichtsdatum || norm.datum || null;
  const incident_date = norm.incident_date || norm.unfalldatum || norm.schadendatum || null;
  const location = norm.location || norm.ort || norm.schadenort || null;
  const mileage = norm.mileage || norm.odom || norm.odometer || norm.km || null;
  const damage_description = norm.damage_description || norm.beschreibung || norm.schadenbeschreibung || norm.damage || null;
  const cost_estimate = norm.cost_estimate || norm.cost || norm.estimate || norm.kosten || norm.kosten_schaden || null;
  const status = norm.status || null;
  const reference_number = norm.reference_number || norm.referenznummer || norm.aktnummer || norm.reference || null;
  const external_report_id = norm.external_report_id || norm.report_id || norm.reports_id || null;
  const notes = norm.notes || norm.note || null;

  return {
    plate_number: plate_number ? String(plate_number).trim() : null,
    vehicle_id: vehicle_id ? String(vehicle_id).trim() : null,
    driver_name: driver_name ? String(driver_name).trim() : null,
    report_type: report_type ? String(report_type).trim() : null,
    report_date: report_date ? String(report_date).slice(0, 10) : null,
    incident_date: incident_date ? String(incident_date).slice(0, 10) : null,
    location: location ? String(location).trim() : null,
    mileage: mileage != null && mileage !== '' ? String(mileage).trim() : null,
    damage_description: damage_description ? String(damage_description).trim() : null,
    cost_estimate: cost_estimate != null && cost_estimate !== '' ? Number(cost_estimate) : null,
    status: status ? String(status).trim() : null,
    reference_number: reference_number ? String(reference_number).trim() : null,
    external_report_id: external_report_id ? String(external_report_id).trim() : null,
    notes: notes ? String(notes).trim() : null,
  };
}

function fileTypeFromName(fileName, mimeType) {
  const m = shaToMime(fileName, mimeType);
  const lower = String(fileName || '').toLowerCase();
  if (m.includes('pdf') || lower.endsWith('.pdf')) return 'pdf';
  if (m.includes('spreadsheet') || lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel';
  if (m.includes('csv') || lower.endsWith('.csv')) return 'csv';
  if (m.includes('html') || lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  return 'unknown';
}

export async function parseDownloadedReport({ buffer, fileName, mimeType }) {
  const type = fileTypeFromName(fileName, mimeType);
  const warnings = [];

  if (type === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      await parser.load();
      const text = (await parser.getText?.()) || '';
      // Best-effort regex extraction for PDFs.
      const plate_number = extractByRegexPatterns(text, [
        /(?:Kennzeichen|Plate)\s*[:\-]?\s*([A-Z0-9\- ]{4,16})/i,
      ]);
      const driver_name = extractByRegexPatterns(text, [
        /(?:Driver|Fahrer|Verursacher)\s*[:\-]?\s*([A-Z][a-zA-ZÀ-ÖØ-öø-ÿ'`\- ]{2,60})/i,
      ]);
      const report_date = extractByRegexPatterns(text, [
        /(?:Report\s*Date|Berichtsdatum|Datum)\s*[:\-]?\s*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/i,
      ]);
      const incident_date = extractByRegexPatterns(text, [
        /(?:Incident\s*Date|Unfalldatum|Schadendatum)\s*[:\-]?\s*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/i,
      ]);
      const reference_number = extractByRegexPatterns(text, [
        /(?:Reference\s*Number|Referenznummer|Aktenzeichen)\s*[:\-]?\s*([A-Z0-9\-]{3,64})/i,
      ]);

      return {
        rows: [
          mapRowObjectToPaveReportRow({
            plate_number,
            driver_name,
            report_date,
            incident_date,
            reference_number,
          }),
        ],
        warnings,
        rawParsedText: text.slice(0, 200000),
      };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (type === 'excel') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const rows = (Array.isArray(json) ? json : []).filter((r) => Object.values(r).some((v) => v != null && String(v).trim() !== ''));
    if (!rows.length) warnings.push('Excel parsed but returned empty rows');
    return {
      rows: rows.length ? rows.map((r) => mapRowObjectToPaveReportRow(r)) : [mapRowObjectToPaveReportRow({})],
      warnings,
      rawParsedPayload: json,
    };
  }

  if (type === 'csv') {
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return { rows: [mapRowObjectToPaveReportRow({})], warnings: ['CSV too short'], rawParsedText: text };

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map((h) => h.trim());
    const rows = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(delimiter);
      if (cols.length !== headers.length) continue;
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cols[i]));
      rows.push(mapRowObjectToPaveReportRow(obj));
    }
    if (!rows.length) warnings.push('CSV parsed but returned 0 mapped rows');
    return { rows: rows.length ? rows : [mapRowObjectToPaveReportRow({})], warnings, rawParsedText: text.slice(0, 200000) };
  }

  if (type === 'html') {
    const text = buffer.toString('utf8');
    warnings.push('HTML parsing is best-effort (regex/table not fully supported yet)');
    // Try to extract plate number and reference.
    const plate_number = extractByRegexPatterns(text, [/([A-Z0-9]{2,3}-?[A-Z0-9]{1,2}[- ]?\d{1,4})/i]);
    const reference_number = extractByRegexPatterns(text, [/Reference\s*[:\-]?\s*([A-Z0-9\-]{3,64})/i]);
    return {
      rows: [mapRowObjectToPaveReportRow({ plate_number, reference_number })],
      warnings,
      rawParsedText: text.slice(0, 200000),
    };
  }

  return {
    rows: [mapRowObjectToPaveReportRow({})],
    warnings: [`Unknown file type: ${type}`],
    rawParsedText: buffer.toString('utf8').slice(0, 200000),
  };
}

