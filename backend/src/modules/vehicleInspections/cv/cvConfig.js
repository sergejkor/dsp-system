const DEFAULTS = {
  analysisWidth: 960,
  analysisHeight: 640,
  minWidth: 720,
  minHeight: 480,
  blurThreshold: 85,
  brightnessMin: 0.16,
  brightnessMax: 0.88,
  contrastMin: 0.09,
  overexposureMaxRatio: 0.18,
  alignmentSearchRatio: 0.09,
  alignmentScaleCandidates: [0.94, 0.97, 1, 1.03, 1.06],
  alignmentStepDivisor: 18,
  alignmentMinScore: 0.46,
  candidateMinArea: 42,
  candidateMaxAreaRatio: 0.3,
  candidateMergeDistance: 18,
  diffThreshold: 0.11,
  edgeThreshold: 0.09,
  ssimWarningThreshold: 0.88,
  gradientPenaltyThreshold: 0.05,
  reflectionPenaltyBrightDelta: 0.17,
  reflectionPenaltyLowTexture: 0.04,
  reflectionPenaltyHigh: 0.55,
  newDamageConfidenceThreshold: 0.66,
  reviewRequiredThreshold: 0.46,
  existingDamageIoUThreshold: 0.52,
  changedExistingIoUThreshold: 0.22,
};

const PER_VEHICLE_TYPE = {
  sprinter_high_roof_long: {
    blurThreshold: 80,
    candidateMaxAreaRatio: 0.28,
    reflectionPenaltyBrightDelta: 0.15,
  },
  peugeot_boxer: {
    blurThreshold: 82,
    alignmentMinScore: 0.44,
  },
  rivian_edv: {
    blurThreshold: 92,
    brightnessMin: 0.18,
    candidateMinArea: 48,
    reflectionPenaltyBrightDelta: 0.14,
  },
};

export function getCvConfig(vehicleType) {
  return {
    ...DEFAULTS,
    ...(PER_VEHICLE_TYPE[String(vehicleType || '').trim()] || {}),
  };
}

export default {
  DEFAULTS,
  PER_VEHICLE_TYPE,
  getCvConfig,
};
