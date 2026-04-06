import { PDFParse } from 'pdf-parse';

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

function normalizeWhitespace(s) {
  return String(s || '').replace(/\r/g, '\n').replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ');
}

function parseSummary(text) {
  const inspection_date = pick(
    [
      /Inspection Date\s*[:\-]?\s*([0-9]{4}[.\-/][0-9]{2}[.\-/][0-9]{2})/i,
      /Date\s*[:\-]?\s*([0-9]{4}[.\-/][0-9]{2}[.\-/][0-9]{2})/i,
    ],
    text
  );
  const vehicle_label = pick(
    [
      /Vehicle\s*[:\-]?\s*([^\n]{4,120})/i,
      /Model\s*[:\-]?\s*([^\n]{4,120})/i,
    ],
    text
  );
  const vin = pick([/\bVIN\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{8,17})/i], text);

  const front_score = num(pick([/Front(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
  const back_score = num(pick([/Back(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
  const left_score = num(pick([/Left(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
  const right_score = num(pick([/Right(?:\s+Score)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i], text));

  const total_damage_score = num(pick([/Total Damage Score\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
  const total_grade = num(pick([/Total Grade\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i], text));
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
    total_grade,
    total_grade_label: total_grade_label || null,
    windshield_status: windshield_status || null,
  };
}

function parseDamageItems(text) {
  const lines = normalizeWhitespace(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  let sort = 1;

  // Heuristic for typical PAVE entries like "Left Roof Line ... Scratch ... Medium ... Repair ... 72"
  const sideRx = /\b(Front|Back|Left|Right|Rear)\b/i;
  const damageTypeRx = /\b(Scratch|Dent|Crack|Broken|Chip|Scuff|Damage)\b/i;
  const severityRx = /\b(Low|Minor|Medium|High|Severe)\b/i;
  const repairRx = /\b(Repair|Replace|Paint|Polish|None)\b/i;
  const scoreRx = /\b([0-9]{1,3}(?:[.,][0-9]+)?)\b/;

  for (const line of lines) {
    if (!sideRx.test(line)) continue;
    if (!damageTypeRx.test(line) && !repairRx.test(line)) continue;

    const side = pick([/\b(Front|Back|Left|Right|Rear)\b/i], line);
    const damage_type = pick([/\b(Scratch|Dent|Crack|Broken|Chip|Scuff|Damage)\b/i], line);
    const severity = pick([/\b(Low|Minor|Medium|High|Severe)\b/i], line);
    const repair_method = pick([/\b(Repair|Replace|Paint|Polish|None)\b/i], line);
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
    const items = parseDamageItems(text);
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
  } finally {
    await parser.destroy().catch(() => {});
  }
}

