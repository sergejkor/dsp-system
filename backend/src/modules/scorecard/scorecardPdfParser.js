import { PDFParse } from 'pdf-parse';

/**
 * Extract text from PDF pages 2 and 3 only.
 * Returns { page2: string, page3: string }.
 */
async function getPageTexts(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ partial: [2, 3] });
    await parser.destroy();
    const page2 = result.getPageText(2) || '';
    const page3 = result.getPageText(3) || '';
    return { page2, page3 };
  } catch (err) {
    await parser.destroy().catch(() => {});
    throw err;
  }
}

/**
 * Parse page 2 (Company Scorecard) text into a flat object with one column per metric.
 */
function parseCompanyScorecardPage(pageText) {
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

  const rankMatch = pageText.match(/Rank\s+at\s+DBX9:\s*(\d+)\s*\(\s*(-?\d+)\s*WoW\)/i);
  if (rankMatch) {
    out.rank_at_dbx9 = parseInt(rankMatch[1], 10);
    out.rank_wow = parseInt(rankMatch[2], 10);
  }

  const overallMatch = pageText.match(/Overall\s+Score:\s*([\d.]+)\s*\|\s*(\w+)/i);
  if (overallMatch) {
    out.overall_score = parseFloat(overallMatch[1]);
    out.overall_tier = overallMatch[2].trim();
  }

  const valueTierRegex = /(\d+(?:\.\d+)?%?|None|In Compliance)\s*\|\s*(\w+(?:\s+\w+)?)/g;
  const valueOnlyRegex = /(\d+(?:\.\d+)?%?)\s*\|\s*(\w+)/g;
  const pairs = [];
  let m;
  while ((m = valueTierRegex.exec(pageText)) !== null) {
    pairs.push({ value: m[1], tier: m[2].trim() });
  }
  const metricOrder = [
    'safe_driving_fico',
    'vsa_compliance',
    'speeding_event_rate',
    'breach_of_contract',
    'mentor_adoption_rate',
    'working_hours_compliance',
    'comprehensive_audit_score',
    'delivery_completion_rate_dcr',
    'customer_escalation_dpmo',
    'dnr_dpmo',
    'lor_dpmo',
    'dsc_dpmo',
    'photo_on_delivery_pod',
    'contact_compliance',
    'customer_delivery_feedback_dpmo',
    'capacity_reliability',
  ];
  for (let i = 0; i < metricOrder.length && i < pairs.length; i++) {
    const key = metricOrder[i];
    out[key] = `${pairs[i].value}|${pairs[i].tier}`;
  }

  const focusMatch = pageText.match(/Recommended\s+Focus\s+Areas\s*([\s\S]*?)(?=Current\s+Week|$)/i);
  if (focusMatch) {
    const lines = focusMatch[1].split(/\n/).map((s) => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
    out.recommended_focus_areas = lines.slice(0, 5).join('; ');
  }

  return out;
}

/**
 * Parse page 3 (Employees/DSP Weekly Summary) table: Transporter ID, Delivered, DCR, DSC DPMO, LoR DPMO, POD, CC, CE, CDF DPMO.
 */
function parseEmployeesScorecardPage(pageText) {
  const rows = [];
  const lines = pageText.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const headerLine = lines.find((l) => /Transporter\s+ID/i.test(l) && /Delivered/i.test(l));
  if (!headerLine) return rows;
  const headerIdx = lines.indexOf(headerLine);
  const dataLines = lines.slice(headerIdx + 1);
  const skipPatterns = [/DSP\s+WEEKLY\s+SUMMARY/i, /Page\s+\d+/i];
  for (const line of dataLines) {
    if (skipPatterns.some((p) => p.test(line))) break;
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    const transporterId = tokens[0];
    if (!/^[A-Z0-9]{10,}$/i.test(transporterId)) continue;
    rows.push({
      transporter_id: transporterId,
      delivered: parseInt(tokens[1], 10) || null,
      dcr: tokens[2] ?? null,
      dsc_dpmo: tokens[3] ?? null,
      lor_dpmo: tokens[4] ?? null,
      pod: tokens[5] ?? null,
      cc: tokens[6] ?? null,
      ce: tokens[7] ?? null,
      cdf_dpmo: tokens[8] ?? null,
    });
  }
  return rows;
}

/**
 * Parse scorecard PDF buffer: extract pages 2 and 3, return { company, employees }.
 */
export async function parseScorecardPdf(buffer) {
  const { page2: page2Text, page3: page3Text } = await getPageTexts(buffer);
  const company = parseCompanyScorecardPage(page2Text);
  const employees = parseEmployeesScorecardPage(page3Text);
  return { company, employees };
}
