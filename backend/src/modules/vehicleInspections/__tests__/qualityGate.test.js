import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import qualityGate from '../cv/qualityGate.js';
import { loadImageData } from '../cv/utils.js';
import { createSyntheticVehicleBuffer } from './helpers.js';

test('QualityGate flags blurred image lower than sharp image', async () => {
  const sharpBuffer = await createSyntheticVehicleBuffer();
  const blurredBuffer = await sharp(sharpBuffer).blur(4.2).jpeg().toBuffer();

  const sharpImage = await loadImageData(sharpBuffer, { width: 960, height: 640, fit: 'contain' });
  sharpImage.originalWidth = 960;
  sharpImage.originalHeight = 640;
  const blurredImage = await loadImageData(blurredBuffer, { width: 960, height: 640, fit: 'contain' });
  blurredImage.originalWidth = 960;
  blurredImage.originalHeight = 640;

  const sharpResult = qualityGate.analyze(sharpImage, 'sprinter_high_roof_long', 'left_side');
  const blurredResult = qualityGate.analyze(blurredImage, 'sprinter_high_roof_long', 'left_side');

  assert.ok(sharpResult.blurScore > blurredResult.blurScore);
  assert.ok(sharpResult.qualityScore > blurredResult.qualityScore);
});

test('QualityGate warns on dark image', async () => {
  const darkBuffer = await createSyntheticVehicleBuffer({ brightness: 0.3 });
  const darkImage = await loadImageData(darkBuffer, { width: 960, height: 640, fit: 'contain' });
  darkImage.originalWidth = 960;
  darkImage.originalHeight = 640;
  const result = qualityGate.analyze(darkImage, 'sprinter_high_roof_long', 'front');
  assert.ok(result.warnings.includes('too_dark') || result.failReasons.includes('too_dark'));
});
