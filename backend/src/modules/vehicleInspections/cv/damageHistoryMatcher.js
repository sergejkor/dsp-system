import { centerDistance, computeIoU } from './utils.js';
import { getCvConfig } from './cvConfig.js';

export class DamageHistoryMatcher {
  constructor(repository) {
    this.repository = repository;
  }

  async match(vehicleId, shotType, candidates, vehicleType) {
    const config = getCvConfig(vehicleType);
    const history = await this.repository.listConfirmedDamageHistory(vehicleId, shotType);

    return (candidates || []).map((candidate) => {
      let best = null;
      for (const historyCandidate of history) {
        const overlap = computeIoU(candidate.normalizedBbox, historyCandidate.normalizedBbox);
        const distance = centerDistance(candidate.normalizedBbox, historyCandidate.normalizedBbox);
        const score = overlap - distance * 0.2;
        if (!best || score > best.score) {
          best = {
            score,
            overlap,
            distance,
            historyCandidate,
          };
        }
      }

      let historyStatus = 'no_history_overlap';
      if (best?.overlap >= config.existingDamageIoUThreshold) {
        historyStatus = 'likely_existing_damage';
      } else if (best?.overlap >= config.changedExistingIoUThreshold) {
        historyStatus = 'existing_damage_changed';
      }

      return {
        ...candidate,
        historyStatus,
        overlapWithHistory: best?.overlap || 0,
        matchedDamageId: best?.historyCandidate?.id || null,
        reasonCodes: Array.from(new Set([
          ...(candidate.reasonCodes || []),
          historyStatus,
        ])),
      };
    });
  }
}

export default DamageHistoryMatcher;
