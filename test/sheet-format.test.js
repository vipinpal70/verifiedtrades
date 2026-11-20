// Rows copied from the real "YG Trades Report" sheet (5X tab), in the quoted form the gviz CSV endpoint returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.js';
import { parseSheetRows } from '../src/normalize.js';
import { channelById } from '../src/channels.js';
import { sheetCsvUrl, sheetSource } from '../src/sync.js';

const csv = `"Date","Time","Direction","Entry","Exit","TP","SL","RR","Result","Pips"
"6/30/2026","19:30","SELL","4025.95","3972.95","3972.95","4066","1:1.3","TP","530"
"7/1/2026","17:52","SELL","4026.99","4026.99","4000","4037.52","1:2.5","B.E","0"
"7/2/2026","18:51","SELL","4116.24","4131.91","4070.71","4131.91","0","SL","-156"
"7/21/2026","0:55","SELL","4013.63","4036","3933","4036","0","SL","-223"
"8/3/2026","17:25","BUY","4061.37","4051.59","4085.21","4051.59","0","SL","-97"
`;

test('parses the YG Trades Report layout', () => {
  const { trades, skipped } = parseSheetRows(parseCsv(csv), channelById('5x'), { dateFormat: 'MDY' });
  assert.equal(skipped, 0);
  assert.equal(trades.length, 5);

  const [win, be, loss, night, buyLoss] = trades;
  assert.deepEqual(
    { date: win.date, time: win.time, side: win.side, result: win.result, pips: win.pips, r: win.r },
    { date: '2026-06-30', time: '19:30', side: 'SELL', result: 'TP', pips: 530, r: 1.3 }, // from RR "1:1.3"
  );
  assert.equal(be.result, 'BE');
  assert.equal(be.r, 0);
  assert.equal(loss.result, 'SL');
  assert.equal(loss.r, -1);
  assert.equal(night.time, '00:55');
  assert.equal(buyLoss.side, 'BUY');
  assert.equal(buyLoss.r, -1); // sheet pips -97 vs 97.8 pip risk would compute -0.99; SL counts as -1R
});

test('Gold tab: DD/MM dates, am/pm times, plain RR numbers, typo rows reported', () => {
  const gold = `"Date","Time","Direction","Entry","Exit","TP","SL","RR","Result","Pips"
"20/04/2026","4:30 pm","SELL","4794.43","4786.73","4786.73","4797.2","2.7","TP","77.4"
"05/06/2026","9:38 am","BUY","4794.89","4790.92","4802.82","4790.92","0","SL","-39.7"
"10/7/20026","2:54 pm","BUY","4102.4","4112.62","4112.62","4097.4","2","TP","102"
"Total Pips","","","","","","","","","27043.1"`;
  const { trades, skippedRows } = parseSheetRows(parseCsv(gold), channelById('gold'), { dateFormat: 'MDY' });
  assert.equal(trades.length, 2);
  assert.deepEqual([trades[0].date, trades[0].time, trades[0].r], ['2026-04-20', '16:30', 2.7]);
  assert.equal(trades[1].date, '2026-06-05'); // 05/06 read as 5 June because the tab is DD/MM
  assert.deepEqual(skippedRows, [{ row: 4, date: '10/7/20026' }]); // Total row is not reported
});

test('falls back to price-based R when there is no Result/RR', () => {
  const rows = parseCsv('Date,Side,Entry,SL,Pips\n6/30/2026,SELL,4025.95,4066,530\n');
  assert.equal(parseSheetRows(rows, channelById('5x'), {}).trades[0].r, 1.32);
});

test('tabs are addressed by name unless a gid is given', () => {
  const cfg = { sheetId: 'abc', gids: { '5x': '0', gold: '' }, tabs: { '5x': '5X', gold: 'Gold Indicator', btc: '-' } };
  assert.deepEqual(sheetSource(cfg, '5x'), { gid: '0' });
  assert.deepEqual(sheetSource(cfg, 'gold'), { tab: 'Gold Indicator' });
  assert.equal(sheetSource(cfg, 'btc'), null);
  assert.equal(sheetSource({ ...cfg, sheetId: '' }, 'gold'), null);
  assert.match(sheetCsvUrl('abc', { tab: 'Gold Indicator' }), /gviz\/tq\?tqx=out:csv&headers=1&sheet=Gold%20Indicator$/);
  assert.match(sheetCsvUrl('abc', { gid: '0' }), /export\?format=csv&gid=0$/);
});
