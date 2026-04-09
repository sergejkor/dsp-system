import { PDFParse } from 'pdf-parse';

const SIDE_TOKEN_MAP = new Map([
  ['front', 'Front'],
  ['vorne', 'Front'],
  ['back', 'Back'],
  ['rear', 'Back'],
  ['hinten', 'Back'],
  ['left', 'Left'],
  ['links', 'Left'],
  ['right', 'Right'],
  ['rechts', 'Right'],
]);

function pick(patterns, text) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return String(m[1]).trim();
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
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeWhitespace(s) {
  return normalizePdfText(s);
}

function parseSummary(text) {
  const inspection_date = pick(
    [
      /Inspection Date\s*[:\-]?\s*([0-9]{4}[.\-/][0-9]{2}[.\-/][0-9]{2})/i,
      /Date\s*[:\-]?\s*([0-9]{4}[.\-/][0-9]{2}[.\-/][0-9]{2})/i,
      /Inspektionsdatum\s*[:\-]?\s*([0-9]{2}[.\-/][0-9]{2}[.\-/][0-9]{4})/i,
    ],
    text
  );
  const vehicle_label = pick(
    [
      /Vehicle\s*[:\-]?\s*([^\n]{4,120})/i,
      /Model\s*[:\-]?\s*([^\n]{4,120})/i,
      /Baujahr,\s*Marke,\s*Modell\s*([^\n]{4,120})/i,
    ],
    text
  );
  const vin = pick([/\bVIN\s*[:\-]?\s*([A-HJ-NPR-Z0-9*]{8,20})/i, /\bFIN\s*[:\-]?\s*([A-HJ-NPR-Z0-9*]{8,20})/i], text);

  const front_score = num(pick([/Front(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i, /Vorne\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
  const back_score = num(pick([/Back(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i, /Rear(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i, /Hinten\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
  const left_score = num(pick([/Left(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i, /Links\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
  const right_score = num(pick([/Right(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i, /Rechts\s*([0-9]+(?:[.,][0-9]+)?)/i], text));

  const total_damage_score = num(pick([/Total Damage Score\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i, /Gesamtschadenpunktzahl\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
  const total_grade = pick([/Total Grade\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]+)?)/i, /Gesamtnote\s*([0-9]+(?:\s*\/\s*[0-9]+)?)/i], text);
  const total_grade_label = pick([/Total Grade(?:\s+Label)?\s*[:\-]?\s*([A-Za-z0-9 _-]{1,40})/i], text);
  const windshield_status = pick([/Windshield\s*[:\-]?\s*([A-Za-z0-9 _-]{1,40})/i], text);

  return {
    inspection_date: inspection_date ? inspection_date.slice(0, 10).replace(/\./g, '-').replace(/\//g, '-') : null,
    vehicle_label: vehicle_label || null,
    vin: vin || null,
    front_score,
    back_score,
    left_score,
    right_score,
    total_damage_score,
    total_grade: num(total_grade) ?? total_grade,
    total_grade_label: total_grade_label || null,
    windshield_status: windshield_status || null,
  };
}

export function inferSideFromComponent(component) {
  const normalized = String(component || '').toLowerCase();
  if (/\b(right|rechts)\b/i.test(normalized)) return 'Right';
  if (/\b(left|links)\b/i.test(normalized)) return 'Left';
  if (/\b(front|vorne)\b/i.test(normalized)) return 'Front';
  if (/\b(back|rear|hinten)\b/i.test(normalized)) return 'Back';
  return null;
}

export function extractVehicleCompositeFromPdfText(text) {
  return pick([
    /Baujahr,\s*Marke,\s*Modell\s*([^\n]{4,120})/i,
    /\bVehicle\s*[:\-]?\s*([^\n]{4,120})/i,
  ], normalizeWhitespace(text));
}

export function extractSummaryField(text, key) {
  if (key === 'inspection_date') {
    return pick(
      [
        /Inspection Date\s*[:\-]?\s*([0-9]{4}[.\-/][0-9]{2}[.\-/][0-9]{2})/i,
        /Date\s*[:\-]?\s*([0-9]{4}[.\-/][0-9]{2}[.\-/][0-9]{2})/i,
        /Inspektionsdatum\s*[:\-]?\s*([0-9]{2}[.\-/][0-9]{2}[.\-/][0-9]{4})/i,
      ],
      normalizeWhitespace(text),
    );
  }
  if (key === 'total_grade') {
    return pick(
      [
        /Total Grade\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]+)?)/i,
        /Gesamtnote\s*([0-9]+(?:\s*\/\s*[0-9]+)?)/i,
      ],
      normalizeWhitespace(text),
    );
  }
  const summary = parseSummary(normalizeWhitespace(text));
  const value = summary?.[key];
  if (value == null) return null;
  return String(value);
}

export function extractDamageItems(text) {
  const lines = normalizeWhitespace(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  let sort = 1;

  // Heuristic for typical PAVE entries like "Left Roof Line ... Scratch ... Medium ... Repair ... 72"
  const sideRx = /\b(Front|Back|Left|Right|Rear|Vorne|Hinten|Links|Rechts)\b/i;
  const damageTypeRx = /\b(Scratch|Dent|Crack|Broken|Chip|Scuff|Damage|Kratzer|Delle|Riss|Schaden)\b/i;
  const severityRx = /\b(Low|Minor|Medium|High|Severe|Niedrig|Mittel|Hoch)\b/i;
  const repairRx = /\b(Repair|Replace|Paint|Polish|None|Lackierung|Austausch)\b/i;
  const scoreRx = /\b([0-9]{1,3}(?:[.,][0-9]+)?)\b/;

  for (const line of lines) {
    if (!sideRx.test(line)) continue;
    if (!damageTypeRx.test(line) && !repairRx.test(line)) continue;

    const sideRaw = pick([/\b(Front|Back|Left|Right|Rear|Vorne|Hinten|Links|Rechts)\b/i], line);
    const side = sideRaw ? (SIDE_TOKEN_MAP.get(String(sideRaw).toLowerCase()) || sideRaw) : inferSideFromComponent(line);
    const damage_type = pick([/\b(Scratch|Dent|Crack|Broken|Chip|Scuff|Damage|Kratzer|Delle|Riss|Schaden)\b/i], line);
    const severity = pick([/\b(Low|Minor|Medium|High|Severe|Niedrig|Mittel|Hoch)\b/i], line);
    const repair_method = pick([/\b(Repair|Replace|Paint|Polish|None|Lackierung|Austausch)\b/i], line);
    const grade_score = num(pick([/\b([0-9]{1,3}(?:[.,][0-9]+)?)\s*$/], line)) ?? num(pick([scoreRx], line));

    // Component is line minus tokens if possible.
    let component = line;
    for (const token of [side, damage_type, severity, repair_method]) {
      if (token) component = component.replace(new RegExp(token, 'i'), '').trim();
    }
    component = component.replace(/\s{2,}/g, ' ').replace(/[|;]+/g, ' ').trim();
    if (!component) component = null;

    items.push({
      side: side || null,
      component,
      damage_type: damage_type || null,
      severity: severity || null,
      repair_method: repair_method || null,
      grade_score,
      sort_order: sort++,
      raw_payload: { line },
    });
  }

  return items;
}

export default async function parsePavePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.parse();
    const text = result?.text || '';
    const report = parseSummary(text);
    const items = extractDamageItems(text);
    const warnings = [];
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
  } catch (error) {
    return {
      report: {},
      items: [],
      warnings: [String(error?.message || error || 'Failed to parse PAVE PDF')],
      rawParsedPayload: {
        page_count: null,
        text_preview: '',
      },
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

