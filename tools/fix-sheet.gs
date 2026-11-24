/**
 * One-off corrections for the "YG Trades Report" sheet (Extensions > Apps Script).
 *   1. Run previewFixes  - changes nothing, lists what would change.
 *   2. Run applyFixes    - makes the changes and logs every old and new value.
 * A row is changed only if columns A:J still show exactly the `before` values. Safe to run twice.
 * To undo: File > Version history.
 */
var FIXES = [
  // Date typos
  { gid: 65941045, row: 67, before: ['12/52026', '11:00 am', 'BUY', '4720.27', '4713.37', '4734.13', '4713.37', '-1', 'SL', '-69'], set: { A: '12/5/2026' } },
  { gid: 65941045, row: 240, before: ['10/7/20026', '11:49 am', 'BUY', '4120', '4114.09', '4131.77', '4114.09', '-1', 'SL', '-59'], set: { A: '10/7/2026' } },
  { gid: 65941045, row: 241, before: ['10/7/20026', '2:54 pm', 'BUY', '4102.4', '4112.62', '4112.62', '4097.4', '2', 'TP', '102'], set: { A: '10/7/2026' } },
  { gid: 65941045, row: 242, before: ['10/7/20026', '4:27 pm', 'SELL', '4106.09', '4096.44', '4096.44', '4110.8', '2', 'TP', '96'], set: { A: '10/7/2026' } },
  { gid: 65941045, row: 243, before: ['10/7/20026', '6:54 pm', 'SELL', '4097.11', '4085.93', '4085.93', '4101.87', '2', 'TP', '111'], set: { A: '10/7/2026' } },
  // Direction: exit, TP, SL, result and pips all agree on BUY
  { gid: 0, row: 76, before: ['10/13/2026', '19:41', 'SELL', '4171.02', '4157.79', '4199.69', '4157.79', '-1', 'SL', '-132'], set: { C: 'BUY' } },
  { gid: 65941045, row: 22, before: ['27/04/2026', '12:34 pm', 'SELL', '4717.52', '4712.69', '4727.19', '4712.69', '-1', 'SL', '-48.3'], set: { C: 'BUY' } },
  { gid: 65941045, row: 503, before: ['15/10/2026', '10:48 pm', 'SELL', '4150.82', '4177.31', '4177.31', '4145.6', '5', 'TP', '264'], set: { C: 'BUY' } },
  { gid: 1218398461, row: 46, before: ['6/12/2026', '09:45', 'B', '63773.5', '63305.8', '64709.1', '63305.8', '-1', 'SL', '-467'], set: { C: 'BUY' } },
  { gid: 1218398461, row: 88, before: ['9/3/2026', '16:45', 'SELL', '77894.7', '82270.9', '82270.9', '77058.4', '5', 'TP', '4376'], set: { C: 'BUY' } },
  { gid: 1218398461, row: 100, before: ['9/21/2026', '11:45', 'SELL', '81786.6', '87260.9', '87260.9', '80791.7', '5.5', 'TP', '5474'], set: { C: 'BUY' } },
  // Direction to SELL: TP is below entry, SL above, TP:SL = 2:1 (stays B.E, 0 pips)
  { gid: 65941045, row: 304, before: ['3/8/2026', '3:51 pm', 'BUY', '4052.89', '4052.89', '4044.29', '4057.2', '0', 'B.E', '0'], set: { C: 'SELL' } },
  // Missing minus sign: stopped out at SL, result SL
  { gid: 65941045, row: 91, before: ['18/5/2026', '9:56 pm', 'SELL', '4541.09', '4544.71', '4531.71', '4544.71', '-1', 'SL', '36.2'], set: { J: -36.2 } },
  { gid: 65941045, row: 325, before: ['12/8/2026', '8:21 pm', 'SELL', '4418.44', '4423.07', '4409.18', '4423.07', '-1', 'SL', '46'], set: { J: -46 } },
  // TP and SL swapped (same mistake row 240 had): BUY stopped at 4137.09 = -76 pips, TP:SL = 2:1
  { gid: 65941045, row: 450, before: ['28/9/2026', '9:56 pm', 'BUY', '4144.75', '4160.1', '4137.09', '4160.1', '-1', 'SL', '-76'], set: { E: 4137.09, F: 4160.1, G: 4137.09 } }
];

function previewFixes() { runFixes_(false); }
function applyFixes() { runFixes_(true); }

function runFixes_(apply) {
  var sheets = SpreadsheetApp.getActive().getSheets();
  var counts = { fix: 0, done: 0, skipped: 0 };
  FIXES.forEach(function (f) {
    var sheet = sheets.filter(function (s) { return s.getSheetId() === f.gid; })[0];
    if (!sheet) { counts.skipped++; Logger.log('SKIPPED: no tab with id ' + f.gid); return; }
    var label = sheet.getName() + ' row ' + f.row;
    var range = sheet.getRange(f.row, 1, 1, 10);
    var now = range.getDisplayValues()[0].map(function (v) { return String(v).trim(); });
    var formulas = range.getFormulas()[0];
    var cols = Object.keys(f.set);
    var index = function (c) { return c.charCodeAt(0) - 65; };

    var after = f.before.slice();
    cols.forEach(function (c) { after[index(c)] = String(f.set[c]); });
    if (now.join('|') === after.join('|')) { counts.done++; Logger.log('already fixed: ' + label); return; }
    if (now.join('|') !== f.before.join('|')) { counts.skipped++; Logger.log('SKIPPED, row has changed: ' + label + ' -> ' + now.join(' | ')); return; }
    if (cols.some(function (c) { return formulas[index(c)]; })) { counts.skipped++; Logger.log('SKIPPED, cell is a formula: ' + label); return; }

    counts.fix++;
    cols.forEach(function (c) {
      Logger.log((apply ? 'CHANGED ' : 'would change ') + label + ' ' + c + f.row + ': ' + now[index(c)] + ' -> ' + f.set[c]);
      if (!apply) return;
      var cell = sheet.getRange(f.row, index(c) + 1);
      if (c === 'A') cell.setNumberFormat('@'); // keep the date exactly as typed
      cell.setValue(f.set[c]);
    });
  });
  Logger.log((apply ? 'Rows changed: ' : 'Rows to change: ') + counts.fix + ', already fixed: ' + counts.done + ', skipped: ' + counts.skipped);
}
