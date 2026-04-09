import { PDFParse } from 'pdf-parse';
import { inspectionRawToIsoDate } from '../../../paveInspectionDateParse.js';
import { isGarbageVehicleLabel } from './extractPaveReportSummaryFromPage.js';

function pick(patterns, text) {
  for (const p of patterns) {
    // String.match(/g/) omits capture groups; we only need the first match with groups.
    const re = p.global ? new RegExp(p.source, p.flags.replace('g', '')) : p;
    const m = text.match(re);
    if (m && m[1] != null && String(m[1]).trim() !== '') return String(m[1]).trim();
  }
  return null;
}

function num(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function normalizePdfText(s) {
  return String(s || '')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Year + make + model line common on German PAVE PDFs */
export function extractVehicleCompositeFromPdfText(text) {
  const t = normalizePdfText(text);
  const mVin = t.match(/(\d{4}\s+[\w\s\-]{6,95}?)\s+VIN\s*#/i);
  if (mVin) {
    let chunk = mVin[1].replace(/\s+/g, ' ').trim();
    const half = Math.floor(chunk.length / 2);
    if (half > 12) {
      const a = chunk.slice(0, half).trim();
      const b = chunk.slice(half).trim();
      if (a === b) chunk = a;
    }
    const dup = chunk.match(/^(.+?)\s+\1$/);
    if (dup) chunk = dup[1].trim();
    if (chunk.length >= 8) return chunk;
  }
  const m = t.match(
    /(?:BAUJAHR|Baujahr|Modelljahr)\s*[,:]?\s*(?:MARKE|Modell)?\s*[,:]?\s*(\d{4})\s+([A-ZÄÖÜa-z][^\n]{1,45}?)\s+([A-Za-z0-9äöüß][^\n]{2,70}?)(?=\n|$|,)/im,
  );
  if (m) return `${m[1]} ${m[2]} ${m[3]}`.replace(/\s+/g, ' ').trim();
  const m2 = t.match(
    /\b(20[0-9]{2}|19[0-9]{2})\s+([A-ZÄÖÜ][A-Za-zäöüß\-]{1,28})\s+([A-Z0-9][A-Za-z0-9äöüß\-.]{1,40})\b/,
  );
  if (m2) return `${m2[1]} ${m2[2]} ${m2[3]}`.replace(/\s+/g, ' ').trim();
  return null;
}

export function extractSummaryField(text, field) {
  const t = normalizePdfText(text);
  const map = {
    inspection_date: [
      /INSPECTION\s+DATE\s*[:\-]?\s*([^\n]+)/i,
      /INSPEKTIONSDATUM\s*[:\-]?\s*([0-9]{1,2}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i,
      /Inspektionsdatum\s*[:\-]?\s*([^\n]+)/i,
      /Datum\s+der\s+Inspektion\s*[:\-]?\s*([0-9]{1,2}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i,
      /Inspection\s*Date\s*[:\-]?\s*([0-9]{1,4}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i,
      /\bDate\s*[:\-]?\s*([0-9]{1,4}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i,
    ],
    vehicle_label: [
      /Fahrzeug\s*(?:daten|info)?\s*[:\-]?\s*([^\n]{3,140})/i,
      /Fahrzeuginformationen\s*[:\-]?\s*([^\n]{3,160})/i,
      /\bVehicle\s+Label\s*[:\-]\s*([^\n]{3,140})/i,
      // "Vehicle:" data lines — not "Vehicle Condition Report" (no colon after Vehicle)
      /\bVehicle\s*[:\-]\s*([^\n]{3,140})/i,
      /\bModel\s*[:\-]?\s*([^\n]{3,140})/i,
    ],
    vin: [
      /\bVIN\s*#\s*([A-HJ-NPR-Z0-9*]{8,24})/i,
      /\bFIN\s*[:\-]?\s*([A-HJ-NPR-Z0-9*]{8,22})/i,
      /\bVIN\s*[:\-]?\s*([A-HJ-NPR-Z0-9*]{8,22})/i,
      /\bFahrzeugidentifikationsnummer\s*[:\-]?\s*([A-HJ-NPR-Z0-9*]{8,22})/i,
    ],
    front_score: [
      /Front\s+Side\s*[:\-]?\s*(?:\n+\s*)?([0-9]+(?:[.,][0-9]+)?)/im,
      /\bVorne\b\s*(?:\([^)]*\)\s*)?[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bFront\w*\s*(?:score|bewertung|note)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bFront(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    ],
    back_score: [
      /Back\s+Side\s*[:\-]?\s*(?:\n+\s*)?([0-9]+(?:[.,][0-9]+)?)/im,
      /Rear\s+Side\s*[:\-]?\s*(?:\n+\s*)?([0-9]+(?:[.,][0-9]+)?)/im,
      /\bHinten\b\s*(?:\([^)]*\)\s*)?[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bHeck\b\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bRückseite\b\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bBack(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bRear(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    ],
    left_score: [
      /Left\s+Side\s*[:\-]?\s*(?:\n+\s*)?([0-9]+(?:[.,][0-9]+)?)/im,
      /\bLinks\b\s*(?:\([^)]*\)\s*)?[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bLeft(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    ],
    right_score: [
      /Right\s+Side\s*[:\-]?\s*(?:\n+\s*)?([0-9]+(?:[.,][0-9]+)?)/im,
      /\bRechts\b\s*(?:\([^)]*\)\s*)?[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bRight(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    ],
    total_damage_score: [
      /Right\s+Side\s*[:\-]?[\s\n]+\d+[\s\n]+(\d+)[\s\n]+TOTAL/gim,
      /Gesamt\s*(?:schaden|schadens)\w*\s*(?:punktzahl|score|wert)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /Schadens\s*score\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /Total\s*Damage\s*Score\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bDamage\s*Score\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    ],
    total_grade: [
      /([1-5])(GREAT|GOOD|FAIR|POOR|EXCELLENT)\b/i,
      /GESAMTNOTE\s*[:\-]?\s*([1-5](?:\s*\/\s*5)?|[0-9]+(?:[.,][0-9]+)?)/i,
      /GESAMTBEWERTUNG\s*[:\-]?\s*([1-5](?:\s*\/\s*5)?|[0-9]+(?:[.,][0-9]+)?)/i,
      /ZUSTANDSBEWERTUNG\s*[:\-]?\s*([1-5](?:\s*\/\s*5)?|[0-9]+(?:[.,][0-9]+)?)/i,
      /\bNote\s*[:\-]?\s*([1-5](?:\s*\/\s*5)?)/i,
      /Total\s+Grade\s*(?:Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /TOTAL\s+GRADE\s+SCORE\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\bGrade\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    ],
    total_grade_label: [
      /GESAMTNOTE\s*[:\-]?\s*([A-ZÄÖÜa-z]{2,24})/i,
      /\bTotal\s+Grade\s+Label\s*[:\-]\s*([A-Za-z]{2,24})\b/i,
    ],
    windshield_status: [
      /\bWindschutzscheibe\w*\s*[:\-]?\s*([A-Za-zäöüß0-9 _-]{1,48})/i,
      /\bWindshield(?:\s+Status)?\s*[:\-]?\s*([A-Za-z0-9 _-]{1,40})/i,
    ],
  };
  return pick(map[field] || [], t);
}

export function normalizeDamageSide(token) {
  if (!token) return null;
  const u = String(token).trim();
  if (/^(front|vorne)$/i.test(u)) return 'Front';
  if (/^(back|rear|hinten|heck|rückseite|ruckseite)$/i.test(u)) return 'Back';
  if (/^left$/i.test(u) || /^links$/i.test(u)) return 'Left';
  if (/^right$/i.test(u) || /^rechts$/i.test(u)) return 'Right';
  if (/^(Front|Back|Left|Right)$/i.test(u)) return u.charAt(0).toUpperCase() + u.slice(1).toLowerCase();
  return null;
}

export function inferSideFromComponent(component = '') {
  const c = String(component || '');
  if (/\bleft\b/i.test(c) || /\blinks\b/i.test(c)) return 'Left';
  if (/\bright\b/i.test(c) || /\brechts\b/i.test(c)) return 'Right';
  if (/\bfront\b/i.test(c) || /\bvorne\b/i.test(c)) return 'Front';
  if (/\bback\b/i.test(c) || /\brear\b/i.test(c) || /\bhinten\b/i.test(c) || /\bheck\b/i.test(c)) return 'Back';
  return null;
}

export function extractDamageItems(text) {
  const lines = normalizePdfText(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  const componentLike =
    /\b(door|panel|line|roof|bumper|mirror|wheel|fender|quarter|hood|tailgate|trunk|rocker|window|windshield|tür|kotflügel|scheibe|stoß|stoss|dach|kotflügel)\b/i;
  const sideRx = /\b(Front|Back|Left|Right|Rear|Vorne|Hinten|Links|Rechts|Heck)\b/i;
  const damageTypeRx =
    /\b(Scratch|Dent|Crack|Broken|Chip|Scuff|Damage|Ding|Tear|Kratzer|Delle|Riss|Bruch|Beschädigung|Steinschlag)\b/i;
  const severityRx = /\b(Very Low|Low|Minor|Medium|High|Severe|gering|mittel|hoch|niedrig|leicht)\b/i;
  const repairRx = /\b(Repair|Replace|Paint|Polish|None|PDR|Reparatur|Austausch|Lackierung)\b/i;
  const scoreEndRx = /\b([0-9]{1,3}(?:[.,][0-9]+)?)\s*$/;

  let inDamageSection = false;
  for (const line of lines) {
    if (
      /damage\s+items?|detected\s+damages?|damage\s+overview|schäden|schadenübersicht|festgestellte\s+schäden|schadensliste/i.test(
        line,
      )
    ) {
      inDamageSection = true;
    }
    if (/summary|totals?|vehicle\s+details?|zusammenfassung|gesamtwertung|fahrzeugdaten/i.test(line)) inDamageSection = false;

    const maybeComponent = sideRx.test(line) && componentLike.test(line);
    if (!maybeComponent && !inDamageSection) continue;
    if (!damageTypeRx.test(line) && !repairRx.test(line) && !severityRx.test(line) && !maybeComponent) continue;

    const rawSide = pick([sideRx], line);
    const side = normalizeDamageSide(rawSide) || inferSideFromComponent(line);
    const damage_type = pick([damageTypeRx], line);
    const severity = pick([severityRx], line);
    const repair_method = pick([repairRx], line);
    const grade_score = num(pick([scoreEndRx], line));

    let component = line;
    for (const token of [side, damage_type, severity, repair_method]) {
      if (token) component = component.replace(new RegExp(String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
    }
    component = component
      .replace(/\b\d+(?:[.,]\d+)?\b$/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[|;]+/g, ' ')
      .trim();
    if (!component) component = null;
    if (!component && !damage_type) continue;
    if (component && component.length < 3) continue;

    items.push({
      side: side || null,
      component,
      damage_type: damage_type || null,
      severity: severity || null,
      repair_method: repair_method || null,
      grade_score,
      sort_order: items.length + 1,
      raw_payload: { line },
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const key = `${it.side || ''}|${it.component || ''}|${it.damage_type || ''}|${it.severity || ''}|${it.repair_method || ''}|${it.grade_score ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...it, sort_order: deduped.length + 1 });
  }
  return deduped;
}

function isJunkGradeLabel(s) {
  if (s == null || s === '') return true;
  const u = String(s).replace(/\s+/g, ' ').trim().toUpperCase();
  if (u.includes('TOTAL GRADE SCORE')) return true;
  if (/^SCORE(\s+ALL)?$/i.test(String(s).trim())) return true;
  return false;
}

function parseSummary(text) {
  const tnorm = normalizePdfText(text);
  const gluedGrade = tnorm.match(/([1-5])(GREAT|GOOD|FAIR|POOR|EXCELLENT)\b/i);
  const inspectionDateRaw = extractSummaryField(text, 'inspection_date');
  let vehicle_label = extractVehicleCompositeFromPdfText(text);
  if (!vehicle_label || isGarbageVehicleLabel(vehicle_label)) {
    const v2 = extractSummaryField(text, 'vehicle_label');
    vehicle_label = v2 && !isGarbageVehicleLabel(v2) ? v2 : null;
  }
  const total_grade_raw = extractSummaryField(text, 'total_grade');
  let total_grade = null;
  if (total_grade_raw && String(total_grade_raw).includes('/')) {
    const m = String(total_grade_raw).match(/([1-5])\s*\/\s*5/);
    if (m) total_grade = num(m[1]);
  }
  if (total_grade == null) total_grade = num(total_grade_raw);
  if (total_grade == null && gluedGrade) total_grade = num(gluedGrade[1]);
  let total_grade_label = null;
  if (gluedGrade) total_grade_label = gluedGrade[2];
  if (!total_grade_label) {
    const raw = extractSummaryField(text, 'total_grade_label');
    if (raw && !isJunkGradeLabel(raw)) total_grade_label = raw;
  }
  return {
    inspection_date: inspectionRawToIsoDate(inspectionDateRaw),
    vehicle_label: vehicle_label || null,
    vin: extractSummaryField(text, 'vin') || null,
    front_score: num(extractSummaryField(text, 'front_score')),
    back_score: num(extractSummaryField(text, 'back_score')),
    left_score: num(extractSummaryField(text, 'left_score')),
    right_score: num(extractSummaryField(text, 'right_score')),
    total_damage_score: num(extractSummaryField(text, 'total_damage_score')),
    total_grade,
    total_grade_label: total_grade_label || null,
    windshield_status: extractSummaryField(text, 'windshield_status') || null,
  };
}

export default async function parsePavePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    let result;
    try {
      // pdf-parse v2+: getText() returns TextResult { text, total, pages }, not a string.
      const textResult = await parser.getText();
      const rawText =
        typeof textResult === 'string'
          ? textResult
          : textResult != null && typeof textResult.text === 'string'
            ? textResult.text
            : '';
      const totalPages =
        textResult != null && typeof textResult === 'object' && textResult.total != null
          ? textResult.total
          : parser?.doc?.numPages ?? null;
      result = { text: rawText, total: totalPages };
    } catch (err) {
      return {
        report: {
          inspection_date: null,
          vehicle_label: null,
          vin: null,
          front_score: null,
          back_score: null,
          left_score: null,
          right_score: null,
          total_damage_score: null,
          total_grade: null,
          total_grade_label: null,
          windshield_status: null,
        },
        items: [],
        warnings: [`Failed to parse PDF: ${String(err?.message || err)}`],
        rawParsedPayload: { page_count: null, text_preview: '' },
      };
    }

    const text = normalizePdfText(result?.text || '');
    const report = parseSummary(text);
    const items = extractDamageItems(text);
    const warnings = [];
    if (!report.inspection_date) warnings.push('inspection_date missing');
    if (!report.vehicle_label) warnings.push('vehicle_label missing');
    if (!report.vin) warnings.push('vin missing');
    if (report.front_score == null) warnings.push('front_score missing');
    if (report.back_score == null) warnings.push('back_score missing');
    if (report.left_score == null) warnings.push('left_score missing');
    if (report.right_score == null) warnings.push('right_score missing');
    if (report.total_damage_score == null) warnings.push('total_damage_score missing');
    if (report.total_grade == null) warnings.push('total_grade missing');
    if (!items.length) warnings.push('No damage items parsed from PAVE PDF');
    return {
      report,
      items,
      warnings,
      rawParsedPayload: {
        page_count: result?.total ?? null,
        text_preview: text.slice(0, 200000),
      },
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

