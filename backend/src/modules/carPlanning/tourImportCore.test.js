import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from './tourImportCore.js';

const cars = [
  { id: 1, service_type: 'Rivian' },
  { id: 2, service_type: 'Medium VN' },
  { id: 3, service_type: 'Rivian' }
];
const baseRow = { rowNumber: 1, route: 'CA_A1', type: 'Rivian', driverId: 'driver', errors: [] };

test('keeps automatic allocation route-compatible while accepting a locked manual cross-type choice', () => {
  const [automatic] = allocate([{ ...baseRow, locked: false, systemLocked: false }], cars, new Map(), () => null);
  assert.deepEqual(automatic.candidates, [1, 3]);
  assert.deepEqual(automatic.manualCandidates, [1, 2, 3]);

  const [manual] = allocate([{
    ...baseRow, carId: 2, systemCarId: 1, locked: true, systemLocked: false
  }], cars, new Map(), () => null);
  assert.equal(manual.carId, 2);
  assert.notEqual(manual.systemCarId, 2);
  assert.equal(manual.systemVehicleType, 'Rivian');
  assert.equal(manual.assignmentMode, 'EV_SUBSTITUTION');
});
