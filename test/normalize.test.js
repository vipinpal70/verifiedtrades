import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.js';
import { parseDate, parseNumber, parseSheetRows } from '../src/normalize.js';
import { channelById } from '../src/channels.js';

const gold = channelById('5x');

test('parseCsv handles quotes, commas and CRLF', () => {
  assert.deepEqual(parseCsv('a,"b,c","d""e"\r\n1,2,3\n'), [['a', 'b,c', 'd"e'], ['1', '2', '3']]);
});

test('parseNumber accepts sheet-style numbers', () => {
  assert.equal(parseNumber('+301'), 301);
  assert.equal(parseNumber('−427'), -427);
  assert.equal(parseNumber('3,960.11'), 3960.11);
  assert.equal(parseNumber('2.5R'), 2.5);
  assert.equal(parseNumber('1:2.7'), null);
  assert.equal(parseNumber(''), null);
});

test('parseDate respects MDY / DMY and default year', () => {
  assert.equal(parseDate('11/2', { dateFormat: 'MDY', defaultYear: 2026 }), '2026-11-02');
  assert.equal(parseDate('2/11/2026', { dateFormat: 'DMY' }), '2026-11-02');
  assert.equal(parseDate('2026-11-02'), '2026-11-02');
  assert.equal(parseDate('Totals'), null);
  assert.equal(parseDate('2 Nov 2026'), '2026-11-02');
  assert.equal(parseDate('Nov 2', { defaultYear: 2026 }), '2026-11-02');
});

test('parseSheetRows skips title/total rows and derives pips + R', () => {
  const csv = [
    'November trades,,,,,,,',
    'Date,Time,Side,Entry,Exit,TP,SL,Result',
    '11/2,19:29,SELL,"3,960.11","3,929.93","3,929.93","3,971.26",TP',
    '11/10,17:23,Buy,4062.98,4020.24,4165.04,4020.24,SL',
    ',,,,,,,',
    'Totals,,,,,,,',
  ].join('\n');
  const { trades, skipped } = parseSheetRows(parseCsv(csv), gold, { dateFormat: 'MDY', defaultYear: 2026 });
  assert.equal(trades.length, 2);
  assert.equal(skipped, 1);
  assert.equal(trades[0].pips, 301.8);
  assert.equal(trades[0].r, 2.71);
  assert.equal(trades[1].side, 'BUY');
  assert.equal(trades[1].r, -1);
  assert.equal(trades[1].result, 'SL');
});

test('missing header row throws (keeps old data)', () => {
  assert.throws(() => parseSheetRows([['foo', 'bar'], ['1', '2']], gold));
});
