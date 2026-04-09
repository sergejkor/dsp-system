import test from 'node:test';
import assert from 'node:assert/strict';
import candidateExtractor from '../cv/candidateExtractor.js';

test('CandidateExtractor filters tiny and overly large regions', () => {
  const zone = { name: 'front_door', x: 100, y: 100, w: 200, h: 140, reliability: 0.85 };
  const out = candidateExtractor.extract([
    {
      zoneName: zone.name,
      zone,
      ssimScore: 0.71,
      changeRatio: 0.14,
      edgeChangeScore: 0.16,
      rawCandidateRegions: [
        { x: 100, y: 100, w: 3, h: 3, area: 9 },
        { x: 110, y: 110, w: 60, h: 34, area: 2040 },
        { x: 100, y: 100, w: 190, h: 130, area: 24700 },
      ],
    },
  ], 'sprinter_high_roof_long', 'left_side');

  assert.equal(out.length, 1);
  assert.ok(out[0].bbox.w >= 60);
  assert.ok(out[0].bbox.h >= 34);
});
