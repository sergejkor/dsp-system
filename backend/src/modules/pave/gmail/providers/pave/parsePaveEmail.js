const PAVE_REPORT_ID_RE = /\bAMDE-[A-Z0-9-]{4,}\b/i;

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/gi, '/')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeUrlCandidate(url) {
  return decodeHtmlEntities(String(url || '').trim()).replace(/[)>.,;]+$/g, '');
}

function collectUrlCandidates(text) {
  const source = decodeHtmlEntities(text);
  const matches = source.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  const unique = [];
  for (const raw of matches) {
    const normalized = normalizeUrlCandidate(raw);
    if (!normalized) continue;
    if (!unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}

function extractExternalReportIdFromUrl(url) {
  const value = String(url || '').trim();
  if (!value) return null;
  const direct = value.match(/\/park\/([A-Za-z0-9-]+)/i);
  if (direct?.[1]) return direct[1];
  const queryId = value.match(/[?&](?:reportId|report_id|inspectionId|inspection_id|sessionKey|session_key|id)=([A-Za-z0-9-]+)/i);
  if (queryId?.[1]) return queryId[1];
  const embedded = value.match(PAVE_REPORT_ID_RE);
  return embedded?.[0] || null;
}

function scoreReportUrlCandidate(url) {
  const value = String(url || '').toLowerCase();
  let score = 0;
  if (!value.startsWith('http://') && !value.startsWith('https://')) return -1;
  if (value.includes('dashboard.paveapi.com/park/')) score += 100;
  if (value.includes('paveapi.com')) score += 60;
  if (value.includes('/park/')) score += 40;
  if (value.includes('click.connect.justeattakeaway.com')) score += 30;
  if (value.includes('inspection') || value.includes('report')) score += 10;
  if (PAVE_REPORT_ID_RE.test(value)) score += 15;
  return score;
}

function pickBestReportUrl(urls) {
  const list = Array.isArray(urls) ? urls : [];
  let best = null;
  let bestScore = -1;
  for (const candidate of list) {
    const score = scoreReportUrlCandidate(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function parseLanguageFromUrl(url) {
  try {
    const u = new URL(url);
    const l = u.searchParams.get('l');
    return l ? String(l).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function extractReportIdAndVehicleFromSubject(subject) {
  const s = String(subject || '').trim();
  // Example:
  // "our inspection AMDE-JWLICL014X of 2021 MERCEDES 314 CDI SPRINTER is completed"
  const m = s.match(/inspection\s+([A-Z0-9-]{6,})\s+of\s+(.+?)\s+is\s+(completed|complete|expired|processed|in\s+progress)/i);
  if (m) {
    return {
      external_report_id: m[1],
      vehicle_label: m[2].trim(),
      status: String(m[3] || '').toLowerCase().replace(/\s+/g, '_'),
    };
  }
  // Fallback: "Your inspection AMDE-XXXX..." without strict suffix.
  const idOnly = s.match(/^\s*(?:your\s+)?inspection\s+([A-Z0-9-]{6,})\b/i);
  if (idOnly) {
    return {
      external_report_id: idOnly[1],
      vehicle_label: null,
      status: null,
    };
  }
  return { external_report_id: null, vehicle_label: null, status: null };
}

function extractExternalReportIdFromText(text) {
  const value = String(text || '');
  const match = value.match(PAVE_REPORT_ID_RE);
  return match?.[0] || null;
}

export function isLikelyPaveEmail({ subject, fromEmail, rawBodyText, rawBodyHtml }) {
  const from = String(fromEmail || '').toLowerCase();
  const textRaw = `${subject || ''}\n${rawBodyText || ''}\n${rawBodyHtml || ''}`;
  const text = textRaw.toLowerCase();
  const subjectValue = String(subject || '');
  const subjectLooksPave =
    /inspection\s+[a-z0-9-]{6,}\s+of\s+.+\s+is\s+(completed|complete|expired|processed|in\s+progress)/i.test(subjectValue) ||
    /^\s*(?:your\s+)?inspection\s+[a-z0-9-]{6,}\b/i.test(subjectValue);
  const urls = collectUrlCandidates(textRaw);
  const reportUrl = pickBestReportUrl(urls);
  return (
    from.includes('pave') ||
    from.includes('paveapi') ||
    text.includes(' condition report') ||
    text.includes('vehicle condition report') ||
    text.includes('pave inspection') ||
    text.includes('dashboard.paveapi.com/park/') ||
    text.includes('paveapi.com') ||
    text.includes('/park/') ||
    text.includes('click.connect.justeattakeaway.com') ||
    Boolean(extractExternalReportIdFromText(textRaw)) ||
    Boolean(reportUrl) ||
    subjectLooksPave
  );
}

export default function parsePaveEmail({ subject, fromEmail, rawBodyText, rawBodyHtml }) {
  const body = `${rawBodyText || ''}\n${rawBodyHtml || ''}`;
  const urls = collectUrlCandidates(body);
  let report_url = pickBestReportUrl(urls);

  const subjectParts = extractReportIdAndVehicleFromSubject(subject);

  let external_report_id =
    subjectParts.external_report_id ||
    extractExternalReportIdFromUrl(report_url) ||
    extractExternalReportIdFromText(body);

  // If the mail client stripped links from plain text, we can still open the report from the AMDE id in the subject.
  let urlSynthesized = false;
  if (!report_url && external_report_id) {
    report_url = `https://dashboard.paveapi.com/park/${encodeURIComponent(external_report_id)}?l=en`;
    urlSynthesized = true;
  }

  // Tracking links (click.connect...) are often not directly downloadable.
  // If we have a deterministic external_report_id from the subject, prefer the direct dashboard URL.
  if (
    report_url &&
    external_report_id &&
    (
      String(report_url).toLowerCase().includes('click.connect.justeattakeaway.com') ||
      !String(report_url).toLowerCase().includes('dashboard.paveapi.com/park/')
    )
  ) {
    report_url = `https://dashboard.paveapi.com/park/${encodeURIComponent(external_report_id)}?l=en`;
    urlSynthesized = true;
  }

  const language = report_url ? parseLanguageFromUrl(report_url) : null;
  const status = subjectParts.status || (String(subject || '').toLowerCase().includes('completed') ? 'completed' : null);
  const vehicle_label = subjectParts.vehicle_label || null;

  const warnings = [];
  if (!report_url) warnings.push('PAVE report URL not found');
  if (urlSynthesized) warnings.push('PAVE report URL synthesized from subject external_report_id');
  if (!external_report_id) warnings.push('PAVE external_report_id not found');
  if (!vehicle_label) warnings.push('PAVE vehicle_label not found in subject');

  return {
    provider: 'pave',
    external_report_id,
    vehicle_label,
    report_url,
    language,
    status,
    raw_extraction_payload: {
      subject: subject || null,
      from_email: fromEmail || null,
      matched_url: report_url || null,
      candidate_urls: urls,
    },
    warnings,
  };
}

