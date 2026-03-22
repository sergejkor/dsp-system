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

export function isLikelyPaveEmail({ subject, fromEmail, rawBodyText, rawBodyHtml }) {
  const from = String(fromEmail || '').toLowerCase();
  const text = `${subject || ''}\n${rawBodyText || ''}\n${rawBodyHtml || ''}`.toLowerCase();
  const subjectValue = String(subject || '');
  const subjectLooksPave =
    /inspection\s+[a-z0-9-]{6,}\s+of\s+.+\s+is\s+(completed|complete|expired|processed|in\s+progress)/i.test(subjectValue) ||
    /^\s*(?:your\s+)?inspection\s+[a-z0-9-]{6,}\b/i.test(subjectValue);
  return (
    from.includes('pave') ||
    from.includes('paveapi') ||
    text.includes('dashboard.paveapi.com/park/') ||
    text.includes('click.connect.justeattakeaway.com') ||
    subjectLooksPave
  );
}

export default function parsePaveEmail({ subject, fromEmail, rawBodyText, rawBodyHtml }) {
  const body = `${rawBodyText || ''}\n${rawBodyHtml || ''}`;
  const urlPatterns = [
    /https:\/\/dashboard\.paveapi\.com\/park\/[A-Za-z0-9-]+(?:\?[^\s<>"')\]]*)?/i,
    /https:\/\/click\.connect\.justeattakeaway\.com\/\?[^\s<>"')\]]+/i,
  ];
  let report_url = null;
  for (const p of urlPatterns) {
    const m = body.match(p);
    if (m?.[0]) {
      report_url = m[0];
      break;
    }
  }

  const subjectParts = extractReportIdAndVehicleFromSubject(subject);

  let external_report_id = subjectParts.external_report_id;
  if (!external_report_id && report_url) {
    const m = report_url.match(/\/park\/([A-Za-z0-9-]+)/i);
    if (m) external_report_id = m[1];
  }

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
    String(report_url).toLowerCase().includes('click.connect.justeattakeaway.com')
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
    },
    warnings,
  };
}

