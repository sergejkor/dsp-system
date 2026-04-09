import { getCvConfig } from './cvConfig.js';
import { mergeBoxes } from './utils.js';

function touchesBorder(box, zone) {
  const localX = box.x - zone.x;
  const localY = box.y - zone.y;
  return localX <= 1
    || localY <= 1
    || localX + box.w >= zone.w - 1
    || localY + box.h >= zone.h - 1;
}

export class CandidateExtractor {
  extract(zoneResults, vehicleType, shotType) {
    const config = getCvConfig(vehicleType);
    const boxes = [];

    for (const zoneResult of zoneResults) {
      const zoneArea = zoneResult.zone.w * zoneResult.zone.h;
      const minArea = Math.max(config.candidateMinArea, Math.round(zoneArea * 0.0025));
      const maxArea = Math.max(minArea * 3, Math.round(zoneArea * config.candidateMaxAreaRatio));

      for (const region of zoneResult.rawCandidateRegions || []) {
        const reasonCodes = ['component_detected'];
        if (region.area < minArea) {
          reasonCodes.push('filtered_tiny_region');
          continue;
        }
        if (region.area > maxArea) {
          reasonCodes.push('filtered_large_region');
          continue;
        }
        const borderTouch = touchesBorder(region, zoneResult.zone);
        if (borderTouch) {
          reasonCodes.push('border_touching');
        }
        const initialConfidence = Math.max(
          0.18,
          Math.min(
            0.94,
            (1 - Math.min(zoneResult.ssimScore ?? 0.9, 1)) * 0.55
            + zoneResult.changeRatio * 1.5
            + zoneResult.edgeChangeScore * 0.75,
          ),
        );
        boxes.push({
          zoneName: zoneResult.zoneName,
          zone: zoneResult.zone,
          bbox: { x: region.x, y: region.y, w: region.w, h: region.h },
          area: region.area,
          changeScore: zoneResult.changeRatio,
          sourceMethods: ['ssim', 'absdiff', 'edge_diff'],
          initialConfidence,
          borderTouch,
          reasonCodes,
          shotType,
          debug: {
            ssimScore: zoneResult.ssimScore,
            edgeChangeScore: zoneResult.edgeChangeScore,
            zoneChangeRatio: zoneResult.changeRatio,
          },
        });
      }
    }

    const merged = mergeBoxes(
      boxes.map((item) => ({
        ...item.bbox,
        area: item.area,
        zoneName: item.zoneName,
        payload: item,
      })),
      config.candidateMergeDistance,
    );

    return merged.map((box) => {
      const source = box.payload || boxes.find((item) => item.bbox.x === box.x && item.bbox.y === box.y) || boxes[0];
      return {
        ...source,
        bbox: { x: box.x, y: box.y, w: box.w, h: box.h },
        area: box.area || source.area,
        reasonCodes: Array.from(new Set([
          ...(source.reasonCodes || []),
          ...(box.w !== source.bbox.w || box.h !== source.bbox.h ? ['merged_adjacent_regions'] : []),
        ])),
      };
    });
  }
}

export default new CandidateExtractor();
