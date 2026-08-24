import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const standardFontsDir = path.resolve(here, '../../../node_modules/pdfjs-dist/standard_fonts');
const standardFontDataUrl = `${pathToFileURL(standardFontsDir).href}/`;

const COMPANY_METRICS = [
  { key: 'safe_driving_fico', label: /Safe Driving Metric \(FICO\)/i },
  { key: 'vsa_compliance', label: /Vehicle Audit \(VSA\) Compliance/i },
  { key: 'speeding_event_rate', label: /Speeding Event Rate \(Per 100 Trips\)/i },
  { key: 'breach_of_contract', label: /Breach of Contract \(BOC\)/i },
  { key: 'mentor_adoption_rate', label: /Mentor Adoption Rate/i },
  { key: 'working_hours_compliance', label: /Working Hours Compliance \(WHC\)/i },
  { key: 'comprehensive_audit_score', label: /Comprehensive Audit Score \(CAS\)/i },
  { key: 'customer_escalation_dpmo', label: /Customer Escalation DPMO/i },
  { key: 'delivery_completion_rate_dcr', label: /Delivery Completion Rate\s*\(DCR\)/i },
  { key: 'customer_delivery_feedback_dpmo', label: /Customer Delivery Feedback/i },
  { key: 'dnr_dpmo', label: /Delivered Not Received\s*\(DNR DPMO\)/i },
  { key: 'lor_dpmo', label: /Lost on Road \(LoR\) DPMO/i },
  { key: 'dsc_dpmo', label: /Delivery Success Conditions \(DSC DPMO\)/i },
  { key: 'photo_on_delivery_pod', label: /Photo-On-Delivery/i },
  { key: 'contact_compliance', label: /Contact Compliance/i },
  { key: 'capacity_reliability', label: /Capacity Reliability/i },
];

const EMPLOYEE_ID_RE = /^[A-Z0-9]{10,}$/i;
const METRIC_TIER_RE = '(?:Fantastic Plus|Fantastic|Great|Fair|Poor|N\\/A|NA)';

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isCompanyMetricValue(value) {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  return new RegExp(`^(?:-?\\d+(?:\\.\\d+)?%?\\|${METRIC_TIER_RE}|None|In Compliance|N\\/A|\\?)$`, 'i').test(text);
}

function extractCompanyMetricPrefix(value) {
  const text = normalizeWhitespace(value);
  if (!text) return null;
  const match = text.match(new RegExp(`^(-?\\d+(?:\\.\\d+)?%?\\|${METRIC_TIER_RE}|None|In Compliance|N\\/A|\\?)`, 'i'));
  return match ? normalizeWhitespace(match[1]) : null;
}

function groupItemsIntoLines(items) {
  const rows = [];
  for (const item of items) {
    const text = normalizeWhitespace(item.text);
    if (!text) continue;
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 1.5);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    const sorted = row.items.slice().sort((a, b) => a.x - b.x);
    return {
      y: row.y,
      items: sorted,
      text: normalizeWhitespace(sorted.map((item) => item.text).join(' ')),
    };
  });
}

async function extractPdfPages(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  try {
    const pdf = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = (content.items || [])
        .map((item) => ({
          text: item.str || '',
          x: item.transform?.[4] || 0,
          y: item.transform?.[5] || 0,
          w: item.width || 0,
        }))
        .filter((item) => normalizeWhitespace(item.text));
      const lines = groupItemsIntoLines(items);
      pages.push({
        number: pageNumber,
        items,
        lines,
        text: lines.map((line) => line.text).join('\n'),
      });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

function parseRankMovement(rawMovement) {
  const text = normalizeWhitespace(rawMovement);
  const sign = text.startsWith('↓') || text.startsWith('-') ? -1 : 1;
  const amount = parseInt(text.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(amount) ? sign * Math.abs(amount) : null;
}

function extractInlineMetricValue(lines, labelRegex) {
  for (const line of lines) {
    const match = line.text.match(labelRegex);
    if (!match) continue;
    const after = normalizeWhitespace(line.text.slice((match.index || 0) + match[0].length).replace(/^[?:-]\s*/, ''));
    const value = extractCompanyMetricPrefix(after);
    if (value && isCompanyMetricValue(value)) return value;
  }
  return null;
}

function extractPositionedMetricValue(page, labelRegex) {
  for (const line of page.lines) {
    const labelItem = line.items.find((item) => labelRegex.test(item.text));
    if (!labelItem) continue;
    const candidates = page.items
      .filter((item) => Math.abs(item.y - labelItem.y) <= 2.5)
      .filter((item) => item.x > labelItem.x + labelItem.w + 4)
      .filter((item) => isCompanyMetricValue(item.text))
      .sort((a, b) => a.x - b.x);
    if (candidates.length > 0) return normalizeWhitespace(candidates[0].text);
  }
  return null;
}

function parseCompanyScorecardPage(page) {
  const out = {
    rank_at_dbx9: null,
    rank_wow: null,
    overall_score: null,
    overall_tier: null,
    safe_driving_fico: null,
    vsa_compliance: null,
    speeding_event_rate: null,
    breach_of_contract: null,
    mentor_adoption_rate: null,
    working_hours_compliance: null,
    comprehensive_audit_score: null,
    delivery_completion_rate_dcr: null,
    customer_escalation_dpmo: null,
    dnr_dpmo: null,
    lor_dpmo: null,
    dsc_dpmo: null,
    photo_on_delivery_pod: null,
    contact_compliance: null,
    customer_delivery_feedback_dpmo: null,
    capacity_reliability: null,
    recommended_focus_areas: null,
  };

  const rankMatch = page.text.match(/Rank\s+at\s+DBX9:\s*(\d+)\s*\(\s*([↑↓+-]?\s*\d+)\s*WoW\)/i);
  if (rankMatch) {
    out.rank_at_dbx9 = parseInt(rankMatch[1], 10);
    out.rank_wow = parseRankMovement(rankMatch[2]);
  }

  const overallMatch = page.text.match(/Overall\s+Score:\s*([\d.]+)\s*\|\s*([^\n]+)/i);
  if (overallMatch) {
    out.overall_score = parseFloat(overallMatch[1]);
    out.overall_tier = normalizeWhitespace(overallMatch[2]);
  }

  for (const metric of COMPANY_METRICS) {
    out[metric.key] =
      extractInlineMetricValue(page.lines, metric.label) ||
      extractPositionedMetricValue(page, metric.label) ||
      null;
  }

  const lines = page.lines.map((line) => line.text);
  const focusStart = lines.findIndex((line) => /^Recommended Focus Areas$/i.test(line));
  if (focusStart >= 0) {
    const focusLines = [];
    for (let i = focusStart + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^Current Week Tips$/i.test(line)) break;
      const cleaned = normalizeWhitespace(line.replace(/^\d+\.\s*/, ''));
      if (cleaned && !/^Page\s+\d+/i.test(cleaned)) focusLines.push(cleaned);
    }
    if (focusLines.length > 0) out.recommended_focus_areas = focusLines.join('; ');
  }

  return out;
}

function parseEmployeeRow(line) {
  const text = normalizeWhitespace(line);
  if (!text) return null;
  if (/^(?:Page\s+\d+|DSP WEEKLY SUMMARY|CC\s*-|POD\s*-|CE\s*-|No\.|S\b|#\b|Transporter ID\b)/i.test(text)) return null;
  if (/(?:DPMO|Drivers With Working Hour Exceptions|\*Blank Sheet)/i.test(text) && !EMPLOYEE_ID_RE.test(text)) return null;

  const tokens = text.split(/\s+/);
  const transporterIdx = tokens.findIndex((token) => EMPLOYEE_ID_RE.test(token));
  if (transporterIdx < 0) return null;

  const values = tokens.slice(transporterIdx);
  if (values.length < 9) return null;
  const [transporter_id, delivered, dcr, dsc_dpmo, lor_dpmo, pod, cc, ce, cdf_dpmo] = values;
  if (!/^\d+$/.test(delivered)) return null;

  return {
    transporter_id,
    delivered: parseInt(delivered, 10) || null,
    dcr: dcr ?? null,
    dsc_dpmo: dsc_dpmo ?? null,
    lor_dpmo: lor_dpmo ?? null,
    pod: pod ?? null,
    cc: cc ?? null,
    ce: ce ?? null,
    cdf_dpmo: cdf_dpmo ?? null,
  };
}

function parseEmployeesScorecardPages(pages) {
  const rows = [];
  const seen = new Set();

  for (const page of pages) {
    for (const line of page.lines) {
      const row = parseEmployeeRow(line.text);
      if (!row) continue;
      const key = JSON.stringify(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return rows;
}

export async function parseScorecardPdf(buffer) {
  const pages = await extractPdfPages(buffer);
  const companyPage = pages.find((page) => /DSP WEEKLY SCORECARD/i.test(page.text) && /Overall Score:/i.test(page.text));
  const employeePages = pages.filter((page) => /DSP WEEKLY SUMMARY/i.test(page.text) && /Transporter ID/i.test(page.text));

  if (!companyPage) {
    throw new Error('Company scorecard section not found in PDF.');
  }
  if (employeePages.length === 0) {
    throw new Error('Employee summary section not found in PDF.');
  }

  const company = parseCompanyScorecardPage(companyPage);
  const employees = parseEmployeesScorecardPages(employeePages);
  return { company, employees };
}
