import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxLotFor, ruleRows } from '../public/js/rules.js';

test('rule book brackets', () => {
  assert.equal(maxLotFor(500), 0.2);
  assert.equal(maxLotFor(999), 0.2);
  assert.equal(maxLotFor(1000), 0.4);
  assert.equal(maxLotFor(1999), 0.4);
  assert.equal(maxLotFor(2000), 0.6);
  assert.equal(maxLotFor(2999), 0.6);
  assert.equal(maxLotFor(10000), 2.2); // pattern continued: +0.2 per $1,000
  assert.equal(maxLotFor(0), 0);
});

test('rule book table rows highlight the current bracket', () => {
  assert.deepEqual(ruleRows(1500).map((r) => r.current), [false, true, false]);
  assert.deepEqual(ruleRows(500).map((r) => r.maxLot), [0.2, 0.4, 0.6]);
  const rows = ruleRows(10000);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.at(-1), { from: 10000, below: 11000, maxLot: 2.2, current: true, gap: true });
});
