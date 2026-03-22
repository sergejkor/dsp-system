function pickFirst(patterns, text) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return String(m[1]).trim();
  }
  return null;
}

function normalizeSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

export function extractReportLinkAndMetadata({ subject, fromEmail, rawBodyText, rawBodyHtml }) {
  const text = `${subject || ''}\n${fromEmail || ''}\n${rawBodyText || ''}`.trim();
  const html = rawBodyHtml || '';

  // Extract first http(s) URL.
  const urlMatchText = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  const urlMatchHtml = html.match(/https?:\/\/[^\s<>"')\]]+/i);
  const extracted_report_url = urlMatchText?.[0] || urlMatchHtml?.[0] || null;

  // Heuristic metadata extraction (best-effort).
  const plate_number = pickFirst(
    [
      /(?:Kennzeichen|Kfz-Kennzeichen|Vehicle Plate|Plate)\s*[:\-]?\s*([A-Z0-9]{2,3}\s*[-]?\s*[A-Z0-9]{1,2}\s*[-]?\s*\d{1,4}\s*[A-Z0-9]{0,2})/i,
      /(?:plate)\s*[:\-]?\s*([A-Z0-9\- ]{4,12})/i,
    ],
    text
  );

  const vehicle_id = pickFirst(
    [
      /(?:Vehicle(?:\s+)?ID|Fahrzeugnummer|Vehicle Number|VIN)\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{8,17})/i,
      /(?:vehicle)\s*id\s*[:\-]?\s*([A-Za-z0-9\-]{4,32})/i,
    ],
    text
  );

  const report_date = pickFirst(
    [
      /(?:Report\s*Date|Berichtsdatum|Datum)\s*[:\-]?\s*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/i,
      /(?:Incident\s*Date|Unfalldatum)\s*[:\-]?\s*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/i,
    ],
    text
  );

  const incident_date = pickFirst(
    [
      /(?:Incident\s*Date|Unfalldatum|Schadendatum)\s*[:\-]?\s*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/i,
    ],
    text
  );

  const driver_name = pickFirst(
    [
      /(?:Driver|Fahrer|Verursacher|Driver Name)\s*[:\-]?\s*([A-Z][a-zA-ZÀ-ÖØ-öø-ÿ'`\- ]{2,60})/i,
    ],
    text
  );

  const reference_number = pickFirst(
    [
      /(?:Reference(?:\s+)?Number|Referenznummer|Aktenzeichen|Ref(?:\.|erence)?|Vorgangsnummer)\s*[:\-]?\s*([A-Z0-9\-]{3,64})/i,
    ],
    text
  );

  const status = pickFirst(
    [/Status\s*[:\-]?\s*([A-Za-z0-9 _\-]{2,32})/i],
    text
  );

  const warnings = [];
  if (!extracted_report_url) warnings.push('Report URL not found in email body');

  const extracted_payload = {
    plate_number: plate_number || null,
    vehicle_id: vehicle_id || null,
    report_date: report_date || null,
    incident_date: incident_date || null,
    driver_name: driver_name || null,
    status: status || null,
    reference_number: reference_number || null,
  };

  return { extracted_report_url, extracted_payload, warnings };
}

