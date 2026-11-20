import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeStats } from '../public/js/stats.js';
import { parseSheetRows } from '../src/normalize.js';
import { channelById } from '../src/channels.js';

// The bundled seed is the November 2026 trade sheet: 13 trades, 11-2, +3,483 pips.
const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'))['5x'];
const header = Object.keys(seed[0]);
const ch = channelById('5x');
const { trades } = parseSheetRows([header, ...seed.map((r) => header.map((h) => r[h]))], ch, { dateFormat: 'MDY' });

test('stats reproduce the November trade sheet', () => {
  const s = computeStats(trades.map((t) => ({ ...t, pipValuePerLot: ch.pipValuePerLot })), { lots: 1 });
  assert.equal(s.count, 13);
  assert.equal(s.wins, 11);
  assert.equal(s.losses, 2);
  assert.equal(s.totalPips, 3483);
  assert.equal(s.totalUsd, 34830); // 3,483 pips x $10/pip at 1 lot
  assert.equal(s.maxWinStreak, 8);
  assert.equal(s.months.length, 1);
  assert.equal(s.equity.length, 14);
  assert.ok(Math.abs(s.winRate - 11 / 13) < 1e-9);
});

test('empty input is safe', () => {
  const s = computeStats([]);
  assert.equal(s.count, 0);
  assert.equal(s.winRate, null);
  assert.equal(s.profitFactor, null);
});
