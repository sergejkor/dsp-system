import test from 'node:test';
import assert from 'node:assert/strict';
import { InspectionAnalysisService } from '../inspectionAnalysisService.js';
import { createSyntheticVehicleBuffer } from './helpers.js';

const SHOTS = ['front_left', 'left_side', 'rear_left', 'rear', 'rear_right', 'right_side', 'front_right', 'front'];

class FakeRepository {
  constructor(currentBundle, referenceBundle) {
    this.currentBundle = currentBundle;
    this.referenceBundle = referenceBundle;
    this.saved = null;
    this.failed = null;
  }

  async ensureTables() {}

  async getInspectionBundle(inspectionId) {
    return String(inspectionId) === String(this.currentBundle.inspection.id)
      ? this.currentBundle
      : this.referenceBundle;
  }

  async findReferenceInspection() {
    return this.referenceBundle;
  }

  async listConfirmedDamageHistory() {
    return [];
  }

  async saveAnalysis(result) {
    this.saved = result;
    return result;
  }

  async markAnalysisFailed(_inspectionId, message) {
    this.failed = message;
  }
}

test('InspectionAnalysisService detects candidate change against approved reference inspection', async () => {
  const referencePhotos = [];
  const currentPhotos = [];

  for (const shot of SHOTS) {
    referencePhotos.push({
      id: `${shot}-ref`,
      inspection_id: 10,
      shot_type: shot,
      file_content: await createSyntheticVehicleBuffer(),
    });
    currentPhotos.push({
      id: `${shot}-cur`,
      inspection_id: 20,
      shot_type: shot,
      file_content: await createSyntheticVehicleBuffer({ addScratch: shot === 'left_side' }),
    });
  }

  const repository = new FakeRepository(
    {
      inspection: {
        id: 20,
        car_id: 1,
        vehicle_id: 'veh_1',
        inspection_vehicle_type: 'sprinter_high_roof_long',
      },
      photos: currentPhotos,
    },
    {
      inspection: {
        id: 10,
        car_id: 1,
        vehicle_id: 'veh_1',
        inspection_vehicle_type: 'sprinter_high_roof_long',
      },
      photos: referencePhotos,
    },
  );

  const events = [];
  const service = new InspectionAnalysisService({
    repository,
    debugStorage: { saveCandidateOverlay: async () => null },
    eventPublisher: {
      publishNewDamageEvent: async (...args) => {
        events.push(args);
      },
    },
  });

  const result = await service.analyzeInspection(20);

  assert.ok(result.summary.newDamageCandidates >= 1);
  const leftSide = result.shots.find((shot) => shot.shotType === 'left_side');
  assert.ok(leftSide);
  assert.ok(leftSide.candidates.some((candidate) => candidate.label === 'likely_new_damage' || candidate.label === 'uncertain'));
  assert.equal(events.length, result.summary.newDamageCandidates > 0 ? 1 : 0);
  assert.equal(repository.failed, null);
});
