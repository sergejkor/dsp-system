import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAtlasRoutesWithStore, resolveAtlasRouteAssignments } from '../atlasReconciliationService.js';

test('resolves exact route matches, missing drivers, and ambiguous routes', () => {
  const matches = resolveAtlasRouteAssignments(
    [' ca_a120 ', 'CA_A123', 'CA_A124', 'CA_A12'],
    [
      { routencode: 'CA_A120', driver_name: ' Alice Example ' },
      { routencode: 'ca_a123', driver_name: '' },
      { routencode: 'CA_A124', driver_name: 'Bob Example' },
      { routencode: ' CA_A124 ', driver_name: 'Carol Example' },
      { routencode: 'CA_A1200', driver_name: 'Wrong route prefix' },
    ],
  );
  assert.deepEqual(matches, [
    { routeCode: 'CA_A12', driverName: null, matchStatus: 'UNMATCHED' },
    { routeCode: 'CA_A120', driverName: 'Alice Example', matchStatus: 'MATCHED' },
    { routeCode: 'CA_A123', driverName: null, matchStatus: 'UNMATCHED' },
    { routeCode: 'CA_A124', driverName: null, matchStatus: 'AMBIGUOUS' },
  ]);
});

function createMemoryStore({ routes, dailyRows = [] }) {
  const assignments = new Map();
  let rows = dailyRows;
  return {
    assignments,
    async getAtlasRoutes() { return routes; },
    async getDailyRows() { return rows; },
    setDailyRows(next) { rows = next; },
    async replaceAssignments(date, next) {
      for (const [key, value] of assignments) if (value.serviceDate === date) assignments.delete(key);
      for (const item of next) assignments.set(`${date}:${item.routeCode}`, { serviceDate: date, ...item });
    },
  };
}

test('reconciliation is idempotent on repeat', async () => {
  const store = createMemoryStore({
    routes: ['ca_a120', 'CA_A124'],
    dailyRows: [
      { routencode: 'CA_A120', driver_name: 'Alice Example' },
      { routencode: 'CA_A124', driver_name: 'Bob Example' },
    ],
  });
  const first = await reconcileAtlasRoutesWithStore('2026-09-24', store);
  const stateAfterFirst = [...store.assignments.values()];
  const second = await reconcileAtlasRoutesWithStore('2026-09-24', store);
  assert.deepEqual(second, first);
  assert.deepEqual([...store.assignments.values()], stateAfterFirst);
  assert.equal(store.assignments.size, 2);
});

test('an Atlas-first unmatched route becomes matched when Excel rows arrive', async () => {
  const store = createMemoryStore({ routes: ['CA_A120'] });
  const beforeExcel = await reconcileAtlasRoutesWithStore('2026-09-24', store);
  assert.deepEqual(beforeExcel[0], { routeCode: 'CA_A120', driverName: null, matchStatus: 'UNMATCHED' });

  store.setDailyRows([{ routencode: ' ca_a120 ', driver_name: 'Alice Example' }]);
  const afterExcel = await reconcileAtlasRoutesWithStore('2026-09-24', store);
  assert.deepEqual(afterExcel[0], { routeCode: 'CA_A120', driverName: 'Alice Example', matchStatus: 'MATCHED' });
});
