import { getCvConfig } from './cvConfig.js';
import { clamp, computeLaplacianVariance, mean, stdDev, toGray } from './utils.js';

export class QualityGate {
  analyze(image, vehicleType, shotType) {
    const config = getCvConfig(vehicleType);
    if (!image?.data || !image.width || !image.height) {
      return {
        passed: false,
        blurScore: 0,
        brightnessScore: 0,
        contrastScore: 0,
        overexposedRatio: 1,
        warnings: ['decode_failed'],
        failReasons: ['decode_failed'],
        qualityScore: 0,
        shotType,
      };
    }

    const gray = toGray(image);
    const blurScore = computeLaplacianVariance(gray, image.width, image.height);
    const brightnessScore = mean(gray);
    const contrastScore = stdDev(gray);
    let overexposedPixels = 0;
    for (let i = 0; i < gray.length; i += 1) {
      if (gray[i] >= 0.98) overexposedPixels += 1;
    }
    const overexposedRatio = gray.length ? overexposedPixels / gray.length : 1;

    const warnings = [];
    const failReasons = [];

    const effectiveWidth = image.originalWidth || image.width;
    const effectiveHeight = image.originalHeight || image.height;

    if (effectiveWidth < config.minWidth || effectiveHeight < config.minHeight) {
      failReasons.push('resolution_too_low');
    }
    if (blurScore < config.blurThreshold) {
      warnings.push('soft_focus');
      if (blurScore < config.blurThreshold * 0.55) failReasons.push('blur_too_high');
    }
    if (brightnessScore < config.brightnessMin) {
      warnings.push('too_dark');
      if (brightnessScore < config.brightnessMin * 0.7) failReasons.push('too_dark');
    }
    if (brightnessScore > config.brightnessMax) {
      warnings.push('too_bright');
      if (brightnessScore > config.brightnessMax + 0.08) failReasons.push('too_bright');
    }
    if (contrastScore < config.contrastMin) {
      warnings.push('low_contrast');
    }
    if (overexposedRatio > config.overexposureMaxRatio) {
      warnings.push('overexposed');
      if (overexposedRatio > config.overexposureMaxRatio * 1.6) failReasons.push('overexposed');
    }

    const blurFactor = clamp(blurScore / (config.blurThreshold * 1.8), 0, 1);
    const brightnessFactor = clamp(
      1 - Math.abs(brightnessScore - 0.52) / 0.52,
      0,
      1,
    );
    const contrastFactor = clamp(contrastScore / (config.contrastMin * 2.2), 0, 1);
    const exposureFactor = clamp(1 - overexposedRatio / Math.max(0.001, config.overexposureMaxRatio * 2), 0, 1);

    const qualityScore = clamp(
      blurFactor * 0.38
      + brightnessFactor * 0.24
      + contrastFactor * 0.18
      + exposureFactor * 0.2,
      0,
      1,
    );

    return {
      passed: failReasons.length === 0,
      blurScore,
      brightnessScore,
      contrastScore,
      overexposedRatio,
      warnings,
      failReasons,
      qualityScore,
      shotType,
      imageWidth: effectiveWidth,
      imageHeight: effectiveHeight,
    };
  }
}

export default new QualityGate();
