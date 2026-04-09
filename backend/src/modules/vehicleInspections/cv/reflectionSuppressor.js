import { clamp, cropGray, mean, normalizeFloatMap, computeSobel } from './utils.js';
import { getCvConfig } from './cvConfig.js';

export class ReflectionSuppressor {
  refine(referenceGrayImage, currentGrayImage, candidates, vehicleType, shotType) {
    const config = getCvConfig(vehicleType);
    return (candidates || []).map((candidate) => {
      const refCrop = referenceGrayImage
        ? cropGray(referenceGrayImage.data, referenceGrayImage.width, referenceGrayImage.height, candidate.bbox)
        : null;
      const curCrop = cropGray(currentGrayImage.data, currentGrayImage.width, currentGrayImage.height, candidate.bbox);
      const currentBrightness = mean(curCrop.data);
      const referenceBrightness = refCrop ? mean(refCrop.data) : currentBrightness;
      const curGradient = mean(normalizeFloatMap(computeSobel(curCrop.data, curCrop.width, curCrop.height)));
      const refGradient = refCrop
        ? mean(normalizeFloatMap(computeSobel(refCrop.data, refCrop.width, refCrop.height)))
        : curGradient;
      const brightDelta = currentBrightness - referenceBrightness;
      const gradientDelta = Math.abs(curGradient - refGradient);
      let reflectionPenalty = 0;
      const debugPenalties = [];

      if (brightDelta > config.reflectionPenaltyBrightDelta && gradientDelta < config.reflectionPenaltyLowTexture) {
        reflectionPenalty += 0.32;
        debugPenalties.push('bright_low_texture_change');
      }
      if ((candidate.zone?.reflectionRisk || 0) > 0.65 && brightDelta > 0.09) {
        reflectionPenalty += 0.18;
        debugPenalties.push('high_reflection_zone');
      }
      if (candidate.borderTouch && brightDelta > 0.06) {
        reflectionPenalty += 0.12;
        debugPenalties.push('border_highlight');
      }
      if ((candidate.bbox.y / currentGrayImage.height) < 0.28 && brightDelta > 0.08) {
        reflectionPenalty += 0.12;
        debugPenalties.push('upper_body_glare');
      }

      const nextConfidence = clamp(candidate.initialConfidence * (1 - reflectionPenalty), 0.05, 0.97);

      return {
        ...candidate,
        initialConfidence: nextConfidence,
        reflectionPenalty: clamp(reflectionPenalty, 0, 0.95),
        reasonCodes: Array.from(new Set([
          ...(candidate.reasonCodes || []),
          ...debugPenalties,
        ])),
        debug: {
          ...(candidate.debug || {}),
          currentBrightness,
          referenceBrightness,
          currentGradient: curGradient,
          referenceGradient: refGradient,
          brightDelta,
          gradientDelta,
          reflectionPenalty: clamp(reflectionPenalty, 0, 0.95),
          shotType,
        },
      };
    });
  }
}

export default new ReflectionSuppressor();
