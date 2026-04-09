import { getCvConfig } from './cvConfig.js';
import {
  computeSobel,
  computeSsim,
  connectedComponents,
  cropGray,
  mean,
  normalizeFloatMap,
} from './utils.js';

function buildChangeMask(refGray, curGray, width, height, config) {
  const gradientsRef = normalizeFloatMap(computeSobel(refGray, width, height));
  const gradientsCur = normalizeFloatMap(computeSobel(curGray, width, height));
  const mask = new Uint8Array(width * height);
  const absDiffs = new Float32Array(width * height);
  let changed = 0;
  for (let i = 0; i < absDiffs.length; i += 1) {
    const absDiff = Math.abs(curGray[i] - refGray[i]);
    const edgeDiff = Math.abs(gradientsCur[i] - gradientsRef[i]);
    absDiffs[i] = absDiff;
    if (absDiff >= config.diffThreshold && edgeDiff >= config.edgeThreshold * 0.6) {
      mask[i] = 1;
      changed += 1;
    }
  }
  return {
    mask,
    changedRatio: absDiffs.length ? changed / absDiffs.length : 0,
    absDiffs,
    gradientsRef,
    gradientsCur,
  };
}

export class ZoneComparator {
  compare(referenceGrayImage, currentGrayImage, zones, vehicleType) {
    const config = getCvConfig(vehicleType);
    return zones.map((zone) => {
      const refCrop = cropGray(referenceGrayImage.data, referenceGrayImage.width, referenceGrayImage.height, zone);
      const curCrop = cropGray(currentGrayImage.data, currentGrayImage.width, currentGrayImage.height, zone);
      const width = Math.min(refCrop.width, curCrop.width);
      const height = Math.min(refCrop.height, curCrop.height);
      const refSlice = refCrop.data.subarray(0, width * height);
      const curSlice = curCrop.data.subarray(0, width * height);
      const ssimScore = computeSsim(refSlice, curSlice);
      const { mask, changedRatio, absDiffs, gradientsRef, gradientsCur } = buildChangeMask(refSlice, curSlice, width, height, config);
      const components = connectedComponents(mask, width, height).map((component) => ({
        ...component,
        x: component.x + zone.x,
        y: component.y + zone.y,
      }));

      const edgeDeltaSamples = new Float32Array(width * height);
      for (let i = 0; i < edgeDeltaSamples.length; i += 1) {
        edgeDeltaSamples[i] = Math.abs((gradientsCur[i] || 0) - (gradientsRef[i] || 0));
      }

      return {
        zoneName: zone.name,
        zone,
        ssimScore,
        changeRatio: changedRatio,
        edgeChangeScore: mean(edgeDeltaSamples),
        rawCandidateRegions: components,
        debug: {
          averageAbsDiff: mean(absDiffs),
          changedPixelRatio: changedRatio,
        },
      };
    });
  }

  scanSingleImage(currentGrayImage, zones, vehicleType) {
    const config = getCvConfig(vehicleType);
    return zones.map((zone) => {
      const crop = cropGray(currentGrayImage.data, currentGrayImage.width, currentGrayImage.height, zone);
      const gradients = normalizeFloatMap(computeSobel(crop.data, crop.width, crop.height));
      const values = [];
      for (let i = 0; i < crop.data.length; i += 1) {
        const localDeviation = Math.abs(crop.data[i] - 0.5);
        const score = localDeviation * 0.5 + gradients[i] * 0.5;
        values.push(score);
      }
      const mask = new Uint8Array(crop.width * crop.height);
      let changed = 0;
      for (let i = 0; i < values.length; i += 1) {
        if (values[i] > Math.max(config.diffThreshold * 1.15, 0.15) && gradients[i] > config.edgeThreshold * 0.6) {
          mask[i] = 1;
          changed += 1;
        }
      }
      const components = connectedComponents(mask, crop.width, crop.height).map((component) => ({
        ...component,
        x: component.x + zone.x,
        y: component.y + zone.y,
      }));
      return {
        zoneName: zone.name,
        zone,
        ssimScore: null,
        changeRatio: crop.data.length ? changed / crop.data.length : 0,
        edgeChangeScore: mean(gradients),
        rawCandidateRegions: components,
        debug: {
          baselineMode: true,
        },
      };
    });
  }
}

export default new ZoneComparator();
