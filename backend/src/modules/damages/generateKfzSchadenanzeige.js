import fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib';

/** Maps app report keys → AcroForm text field names in KFZ Schadenanzeige template */
const pdfFieldMap = {
  damageNumber: 'NRM',
  date: 'DATUM',
  time: 'UHRZEIT',
  plateNumber: 'KENNZEICHEN',
  locationZip: 'SchadenortPlz',
  locationCity: 'SchadenortOrt',
  locationStreet: 'SchadenortStrasse',
  insuredName: 'VN',
  insurerDamageNumber: 'NR',
  cause: 'SCHADENURSACHE',
  driverName: 'VERURSACHER_NAME',
  trailerCountry: 'Auflieger_Land',
  otherVehicleFaxOrField: 'AST_TELEFAX',
  otherVehiclePlate: 'AST_KZCH',
};

/**
 * @param {Record<string, unknown>} report – insurance report object from frontend
 * @param {string|number} damageId
 */
export function mapReportToKfzPayload(report, damageId) {
  const g = report.general || {};
  const acc = report.accident || {};
  const d = report.driver || {};
  const opp = report.opponent || {};
  const trailer = report.trailer || {};
  return {
    damageId: String(damageId),
    plateNumber: report.licensePlate || '',
    damageNumber: report.yourClaimNumber || report.your_claim_number || '',
    date: report.damageDate || '',
    time: report.time || '',
    locationZip: g.zip || acc.zip || '',
    locationCity: g.city || acc.city || '',
    locationStreet: g.street || acc.street || '',
    insuredName: report.policyHolder || report.insuredName || '',
    insurerDamageNumber: report.insurerClaimNumber || '',
    cause: g.cause || '',
    driverName: d.fullName || d.name || '',
    trailerCountry: trailer.country || '',
    otherVehicleFaxOrField: opp.phone || opp.email || '',
    otherVehiclePlate: opp.plate || '',
  };
}

/**
 * Fills AcroForm fields when the template exposes them.
 * @returns {Promise<Uint8Array|null>} PDF bytes, or null to signal “use coordinate fallback”
 */
export async function generateKfzSchadenanzeige(templatePath, payload) {
  const templateBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  let form;
  try {
    form = pdfDoc.getForm();
  } catch {
    return null;
  }

  // Clear any pre-existing values in the template before filling,
  // so users never see leftovers from older data.
  try {
    for (const field of form.getFields()) {
      try {
        field.setText('');
      } catch {
        // Ignore non-text fields
      }
    }
  } catch {
    // If getFields/setText fail for some template versions, we'll still try filling below.
  }

  let filled = 0;
  for (const [payloadKey, pdfFieldName] of Object.entries(pdfFieldMap)) {
    const value = payload[payloadKey];
    if (value == null || value === '') continue;
    try {
      const field = form.getTextField(pdfFieldName);
      field.setText(String(value));
      filled += 1;
    } catch {
      // Not a text field or missing in this template version
    }
  }

  if (filled === 0) return null;

  try {
    form.flatten();
  } catch {
    // Some templates fail flatten; output is still usable
  }

  return pdfDoc.save();
}
