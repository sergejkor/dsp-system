import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticVehicleBuffer } from './helpers.js';
import alignmentEngine from '../cv/alignmentEngine.js';
import { loadImageData } from '../cv/utils.js';

test('AlignmentEngine recovers translation between similar shots', async () => {
  const referenceBuffer = await createSyntheticVehicleBuffer();
  const currentBuffer = await createSyntheticVehicleBuffer({ shiftX: 18, shiftY: 10 });

  const referenceImage = await loadImageData(referenceBuffer, { width: 960, height: 640, fit: 'contain' });
  const currentImage = await loadImageData(currentBuffer, { width: 960, height: 640, fit: 'contain' });

  const result = await alignmentEngine.align(
    referenceImage,
    currentImage,
    'sprinter_high_roof_long',
    'left_side',
  );

  assert.ok(result.alignmentScore > 0.5);
  assert.ok(result.methodUsed);
  assert.equal(result.alignedCurrentImage.width, referenceImage.width);
});
