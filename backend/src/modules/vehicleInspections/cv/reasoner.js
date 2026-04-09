import { clamp } from './utils.js';
import { getCvConfig } from './cvConfig.js';

export class DamageReasoner {
  classify(quality, alignment, candidates, vehicleType, shotType, options = {}) {
    const config = getCvConfig(vehicleType);
    const baselineMode = Boolean(options.baselineMode);

    return (candidates || []).map((candidate) => {
      const zoneReliability = candidate.zone?.reliability ?? 0.75;
      const qualityFactor = quality?.qualityScore ?? 0.4;
      const alignmentFactor = baselineMode ? 0.72 : (alignment?.alignmentScore ?? 0.2);
      const reflectionFactor = 1 - Math.min(candidate.reflectionPenalty || 0, 0.9);
      const historyPenalty = candidate.historyStatus === 'likely_existing_damage' ? 0.5 : 1;
      const structuralBoost = Math.min(0.28, (candidate.debug?.edgeChangeScore || 0) * 1.8);
      const changeBoost = Math.min(0.35, (candidate.changeScore || 0) * 1.3);
      const baseScore = candidate.initialConfidence || 0.2;
      const combinedScore = clamp(
        baseScore * 0.3
        + qualityFactor * 0.18
        + alignmentFactor * 0.16
        + zoneReliability * 0.12
        + reflectionFactor * 0.08
        + structuralBoost
        + changeBoost,
        0,
        1,
      ) * historyPenalty;

      const reasonCodes = [
        ...(candidate.reasonCodes || []),
        qualityFactor >= 0.65 ? 'good_quality' : 'quality_limited',
        alignmentFactor >= config.alignmentMinScore ? 'good_alignment' : 'alignment_limited',
        zoneReliability >= 0.8 ? 'reliable_zone' : 'low_reliability_zone',
      ];

      let label = 'uncertain';
      if (baselineMode) {
        label = combinedScore >= config.reviewRequiredThreshold ? 'uncertain' : 'likely_false_positive';
        reasonCodes.push('baseline_mode_no_reference');
      } else if ((candidate.reflectionPenalty || 0) >= config.reflectionPenaltyHigh && combinedScore < config.newDamageConfidenceThreshold) {
        label = 'likely_false_positive';
        reasonCodes.push('reflection_penalized');
      } else if (candidate.historyStatus === 'likely_existing_damage') {
        label = 'likely_existing_damage';
      } else if (candidate.historyStatus === 'existing_damage_changed' && combinedScore >= config.reviewRequiredThreshold) {
        label = 'existing_damage_changed';
      } else if (combinedScore >= config.newDamageConfidenceThreshold && (qualityFactor >= 0.45) && (alignmentFactor >= config.alignmentMinScore * 0.85)) {
        label = 'likely_new_damage';
      } else if (combinedScore < config.reviewRequiredThreshold * 0.72) {
        label = 'likely_false_positive';
      }

      return {
        ...candidate,
        label,
        confidence: clamp(combinedScore, 0.01, 0.99),
        comparisonScore: combinedScore,
        reasonCodes: Array.from(new Set(reasonCodes)),
        debug: {
          ...(candidate.debug || {}),
          qualityFactor,
          alignmentFactor,
          zoneReliability,
          reflectionFactor,
          shotType,
        },
      };
    });
  }
}

export default new DamageReasoner();
