import zoneProvider from './zoneProvider.js';
import { clamp, computeSobel, normalizeFloatMap, toGray } from './utils.js';

function expectedVehicleBox() {
  return { x: 0.06, y: 0.12, w: 0.88, h: 0.76 };
}

export class VehicleRegionEstimator {
  estimate(image, vehicleType, shotType) {
    const gray = toGray(image);
    const gradients = normalizeFloatMap(computeSobel(gray, image.width, image.height));
    const zones = zoneProvider.getZones(vehicleType, shotType, { width: image.width, height: image.height });
    const x1 = Math.min(...zones.map((zone) => zone.x));
    const y1 = Math.min(...zones.map((zone) => zone.y));
    const x2 = Math.max(...zones.map((zone) => zone.x + zone.w));
    const y2 = Math.max(...zones.map((zone) => zone.y + zone.h));
    const expected = expectedVehicleBox();
    let left = Math.min(x1, Math.round(expected.x * image.width));
    let top = Math.min(y1, Math.round(expected.y * image.height));
    let right = Math.max(x2, Math.round((expected.x + expected.w) * image.width));
    let bottom = Math.max(y2, Math.round((expected.y + expected.h) * image.height));

    const projectionX = new Float32Array(image.width);
    const projectionY = new Float32Array(image.height);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const value = gradients[y * image.width + x];
        projectionX[x] += value;
        projectionY[y] += value;
      }
    }

    const thresholdX = Math.max(...projectionX) * 0.22;
    const thresholdY = Math.max(...projectionY) * 0.22;
    for (let x = left; x < right; x += 1) {
      if (projectionX[x] >= thresholdX) {
        left = x;
        break;
      }
    }
    for (let x = right - 1; x >= left; x -= 1) {
      if (projectionX[x] >= thresholdX) {
        right = x + 1;
        break;
      }
    }
    for (let y = top; y < bottom; y += 1) {
      if (projectionY[y] >= thresholdY) {
        top = y;
        break;
      }
    }
    for (let y = bottom - 1; y >= top; y -= 1) {
      if (projectionY[y] >= thresholdY) {
        bottom = y + 1;
        break;
      }
    }

    const bbox = {
      x: left,
      y: top,
      w: Math.max(1, right - left),
      h: Math.max(1, bottom - top),
    };

    const boxAreaRatio = (bbox.w * bbox.h) / (image.width * image.height);
    const confidence = clamp(0.45 + boxAreaRatio * 0.7, 0, 0.96);
    return {
      vehicleBbox: bbox,
      mask: null,
      confidence,
      methodUsed: 'zone_projection_refine',
      zones,
    };
  }
}

export default new VehicleRegionEstimator();
