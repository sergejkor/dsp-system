const ROW_PATTERN = /^\s*([^\s-][\s\S]*?)\s+-\s*([^\s-][\s\S]*?)\s+-\s*(.*?)\s*$/;

export function parseAtlasShipments(bodyText) {
  const shipments = [];
  const byTrackingId = new Map();
  for (const line of String(bodyText || '').split(/\r?\n/)) {
    const match = line.match(ROW_PATTERN);
    if (!match) continue;
    const trackingId = match[1].trim();
    const routeCode = match[2].trim();
    const transporterId = match[3].trim() || null;
    if (!trackingId || !routeCode || !/^[A-Z0-9]{6,64}$/i.test(trackingId) || !/^[A-Z0-9_]{1,128}$/i.test(routeCode)) continue;
    const existing = byTrackingId.get(trackingId);
    if (existing) {
      if (existing.routeCode !== routeCode || existing.transporterId !== transporterId) {
        throw new Error(`Conflicting Atlas shipment for tracking ID ${trackingId}: route or transporter differs within the same email`);
      }
      continue;
    }
    const shipment = { trackingId, routeCode, transporterId };
    byTrackingId.set(trackingId, shipment);
    shipments.push(shipment);
  }
  return shipments;
}

export default parseAtlasShipments;
