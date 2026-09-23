import test from 'node:test';
import assert from 'node:assert/strict';
import { matchUser } from './kenjoCompareService.js';

const users = [
  { _id: 'cosmin', firstName: 'Cosmin', lastName: 'Lata', transportationId: 'T-COSMIN' },
  { _id: 'raluca', firstName: 'Raluca', lastName: 'Lata', transportationId: 'T-RALUCA' },
  { _id: 'ahmad-souki', firstName: 'Ahmad', lastName: 'Al Souki', transportationId: 'T-SOUKI' },
];

test('Kenjo compare prioritizes transporter IDs', () => {
  assert.equal(matchUser(users, 'Any, Name', 'T-RALUCA'), 'raluca');
  assert.equal(matchUser(users, 'Cosmin,Lata', 't-cosmin'), 'cosmin');
});

test('Kenjo compare only uses a complete name as a fallback', () => {
  assert.equal(matchUser(users, 'Cosmin,Lata', ''), 'cosmin');
  assert.equal(matchUser(users, 'Lata,Cosmin', ''), 'cosmin');
  assert.equal(matchUser(users, 'Cosmin', ''), null);
  assert.equal(matchUser(users, 'Ahmad,Shikh', 'unknown-id'), null);
  assert.equal(matchUser(users, 'Cosmin,Lata', 'unknown-id'), 'cosmin');
});
