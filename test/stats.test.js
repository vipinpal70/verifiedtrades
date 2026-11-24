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

const T = (date, pips, result, r) => ({ date, time: '10:00', pips, result, r, pipValuePerLot: 10 });

test('return %, drawdown % and monthly % are measured against capital', () => {
  // $10,000 at 1 lot ($10/pip): +2,000 -> 12,000, -3,000 -> 9,000, +4,000 -> 13,000
  const s = computeStats([T('2026-01-05', 200, 'TP', 2), T('2026-01-06', -300, 'SL', -1), T('2026-02-01', 400, 'TP', 4)], { lots: 1, balance: 10000 });
  assert.equal(s.gainPct, 30);
  assert.equal(s.maxDrawdownPct, 25); // 12,000 -> 9,000
  assert.equal(s.profitFactor, 2);    // 6,000 / 3,000
  assert.deepEqual(s.months.map((m) => m.pct), [-10, 40]);
  assert.deepEqual(s.equity.map((e) => e.pct), [0, 20, -10, 30]);
  assert.equal(s.wipedOutAt, null);
  const half = computeStats([T('2026-01-05', 200, 'TP', 2)], { lots: 0.5, balance: 20000 });
  assert.equal(half.gainPct, 5);
});

test('reports the trade that wipes the account out', () => {
  const s = computeStats([T('2026-01-05', 50, 'TP', 1), T('2026-01-06', -200, 'SL', -1), T('2026-01-07', 900, 'TP', 3)], { lots: 1, balance: 1000 });
  assert.equal(s.wipedOutAt.n, 2);
  assert.equal(s.wipedOutAt.trade.date, '2026-01-06');
});
