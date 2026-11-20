// Turns loosely formatted sheet rows into clean trade objects.
// Headers are matched case/space/punctuation-insensitively against the aliases below.

const ALIASES = {
  date: ['date', 'tradedate', 'day'],
  time: ['time', 'entrytime'],
  side: ['side', 'type', 'direction', 'action', 'buysell', 'order'],
  entry: ['entry', 'entryprice', 'open', 'openprice'],
  exit: ['exit', 'exitprice', 'close', 'closeprice'],
  tp: ['tp', 'takeprofit', 'target'],
  sl: ['sl', 'stoploss', 'stop'],
  result: ['result', 'outcome', 'status'],
  pips: ['pips', 'pip', 'netpips', 'points'],
  r: ['r', 'rmultiple', 'rgained', 'rresult', 'netr'],
  rr: ['rr', 'rrr', 'riskreward', 'riskrewardratio'],
};

/** "1:2.5" or "2.5" -> 2.5. "0", blanks and junk -> null. */
export function parseRR(v) {
  const s = String(v ?? '').trim();
  const mt = s.match(/^1\s*:\s*(\d*\.?\d+)$/) ?? s.match(/^(\d*\.?\d+)$/);
  const n = mt ? Number(mt[1]) : null;
  return n > 0 ? n : null;
}

/**
 * Tabs differ (5X/BTC write 6/30/2026, Gold writes 20/04/2026), so detect per tab:
 * any first part > 12 means DMY, any second part > 12 means MDY, otherwise use the configured default.
 */
export function detectDateFormat(values, fallback = 'MDY') {
  let dmy = false, mdy = false;
  for (const v of values) {
    const mt = String(v ?? '').trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?$/);
    if (!mt) continue;
    if (Number(mt[1]) > 12) dmy = true;
    if (Number(mt[2]) > 12) mdy = true;
  }
  if (dmy && mdy) throw new Error('Date column mixes DD/MM and MM/DD formats');
  return dmy ? 'DMY' : mdy ? 'MDY' : fallback;
}

const headerKey = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function mapHeaders(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const k = headerKey(h);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (idx[field] === undefined && aliases.includes(k)) idx[field] = i;
    }
  });
  return idx;
}

export function parseNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim()
    .replace(/[−–—]/g, '-') // unicode minus / dashes
    .replace(/[,\s$]/g, '')
    .replace(/r$/i, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseDate(v, { dateFormat = 'MDY', defaultYear = new Date().getFullYear() } = {}) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let y, m, d;
  let mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mt) { [, y, m, d] = mt.map(Number); }
  else if ((mt = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) {
    const a = Number(mt[1]), b = Number(mt[2]);
    [m, d] = dateFormat === 'DMY' ? [b, a] : [a, b];
    y = mt[3] ? Number(mt[3]) : Number(defaultYear);
    if (y < 100) y += 2000;
  } else {
    // "2 Nov 2026", "2 November", "Nov 2, 2026". Strict on purpose: new Date('Totals 2026') is a valid date in V8.
    const dm = s.match(/^(\d{1,2})\s+([a-z]{3,})\.?,?\s*(\d{4})?$/i);
    const md = s.match(/^([a-z]{3,})\.?\s+(\d{1,2}),?\s*(\d{4})?$/i);
    const [name, day, year] = dm ? [dm[2], dm[1], dm[3]] : md ? [md[1], md[2], md[3]] : [];
    const mi = name ? MONTHS.indexOf(name.slice(0, 3).toLowerCase()) : -1;
    if (mi === -1) return null;
    m = mi + 1; d = Number(day); y = year ? Number(year) : Number(defaultYear);
  }
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseTime(v) {
  const mt = String(v ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!mt) return null;
  let h = Number(mt[1]);
  const min = Number(mt[2]);
  const ap = mt[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function parseSide(v) {
  const s = String(v ?? '').toLowerCase();
  if (/buy|long/.test(s)) return 'BUY';
  if (/sell|short/.test(s)) return 'SELL';
  return null;
}

export function parseResult(v) {
  const s = String(v ?? '').toUpperCase().replace(/(?<=\bB)[.\s-]+(?=E\b)/, ''); // "B.E" / "B E" / "B-E" -> "BE"
  if (/\bTP\b|WIN|PROFIT/.test(s)) return 'TP';
  if (/\bSL\b|LOSS|STOP/.test(s)) return 'SL';
  if (/\bBE\b|BREAK/.test(s)) return 'BE';
  return null;
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/** Returns a trade object, or null if the row is not a trade (blank, note, totals row). */
export function normalizeRow(cells, idx, channel, opts = {}) {
  const get = (f) => (idx[f] === undefined ? undefined : cells[idx[f]]);
  const date = parseDate(get('date'), opts);
  if (!date) return null;

  const side = parseSide(get('side'));
  const entry = parseNumber(get('entry'));
  const exit = parseNumber(get('exit'));
  const tp = parseNumber(get('tp'));
  const sl = parseNumber(get('sl'));
  let pips = parseNumber(get('pips'));
  let r = parseNumber(get('r'));

  if (pips === null && side && entry !== null && exit !== null) {
    pips = round1((side === 'BUY' ? exit - entry : entry - exit) / channel.pipSize);
  }
  let result = parseResult(get('result'));
  const rr = parseRR(get('rr'));

  // R priority: explicit R column > the sheet's own outcome (SL = -1R, BE = 0R, TP = RR) > computed from prices.
  if (r === null && result === 'SL') r = -1;
  if (r === null && result === 'BE') r = 0;
  if (r === null && result === 'TP' && rr) r = rr;
  if (r === null && pips !== null && entry !== null && sl !== null) {
    const riskPips = Math.abs(entry - sl) / channel.pipSize;
    if (riskPips > 0) r = round2(pips / riskPips);
  }
  if (pips === null && r === null) return null;

  const signal = pips ?? r;
  if (!result) result = signal > 0 ? 'TP' : signal < 0 ? 'SL' : 'BE';

  return { channel: channel.id, date, time: parseTime(get('time')), side, entry, exit, tp, sl, result, pips, r };
}

/** Finds the header row (allows title rows above it) and normalizes every data row. */
export function parseSheetRows(rows, channel, opts = {}) {
  const headerAt = rows.findIndex((row) => {
    const idx = mapHeaders(row);
    return idx.date !== undefined && (idx.pips !== undefined || idx.r !== undefined || idx.entry !== undefined);
  });
  if (headerAt === -1) throw new Error(`No header row with Date + Pips/R/Entry columns found for ${channel.id}`);

  const idx = mapHeaders(rows[headerAt]);
  const body = rows.slice(headerAt + 1);
  const dateFormat = detectDateFormat(body.map((r) => r[idx.date]), opts.dateFormat);
  const rowOpts = { ...opts, dateFormat };
  const trades = [];
  const skippedRows = []; // sheet row numbers that look like trades but could not be read (typos)
  let skipped = 0;
  body.forEach((cells, i) => {
    if (cells.every((c) => String(c).trim() === '')) return;
    const t = normalizeRow(cells, idx, channel, rowOpts);
    if (t) { trades.push(t); return; }
    skipped++;
    const looksLikeTrade = parseSide(cells[idx.side]) || parseResult(cells[idx.result]);
    if (looksLikeTrade) skippedRows.push({ row: headerAt + i + 2, date: String(cells[idx.date] ?? '') });
  });
  return { trades, skipped, skippedRows };
}
