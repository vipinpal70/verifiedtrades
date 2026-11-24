// Pure stats functions: no DOM. Used by the page and by `npm test`.

/** win | loss | be. The sheet's Result label decides (a B.E can still show a few pips); numbers only as fallback. */
export function outcome(t) {
  if (t.result === 'TP') return 'win';
  if (t.result === 'SL') return 'loss';
  if (t.result === 'BE') return 'be';
  const v = t.pips ?? t.r;
  if (v > 0) return 'win';
  if (v < 0) return 'loss';
  return 'be';
}

export const sortTrades = (trades) =>
  [...trades].sort((a, b) =>
    `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`) || (a.seq ?? 0) - (b.seq ?? 0));

/** USD result of a trade at a fixed lot size. Needs t.pipValuePerLot. */
export const tradeUsd = (t, lots) => (t.pips == null || !t.pipValuePerLot ? 0 : t.pips * t.pipValuePerLot * lots);

/**
 * @param trades  trades (any order); each may carry pipValuePerLot for USD maths
 * @param lots    lot size used for the "if you copied" USD figures
 * @param balance starting capital; return % and drawdown % are measured against the account
 */
export function computeStats(trades, { lots = 0, balance = 0 } = {}) {
  const ts = sortTrades(trades);
  const s = {
    count: ts.length, wins: 0, losses: 0, be: 0,
    totalR: 0, totalPips: 0, totalUsd: 0,
    grossWinR: 0, grossLossR: 0, grossWinUsd: 0, grossLossUsd: 0,
    maxWinStreak: 0, maxDrawdownR: 0, maxDrawdownUsd: 0, maxDrawdownPct: 0,
    wipedOutAt: null, // { n, trade } of the first trade that takes the account to zero or below
    best: null, first: ts[0]?.date ?? null, last: ts.at(-1)?.date ?? null,
    months: [], equity: [{ r: 0, pips: 0, usd: 0, pct: 0, trade: null }],
  };
  const pctOf = (usd) => (balance > 0 ? (usd / balance) * 100 : 0);
  const months = new Map();
  let streak = 0, cumR = 0, cumPips = 0, cumUsd = 0, peakR = 0, peakUsd = 0;

  for (const t of ts) {
    const o = outcome(t);
    const r = t.r ?? 0, p = t.pips ?? 0, u = tradeUsd(t, lots);
    if (o === 'win') { s.wins++; streak++; s.maxWinStreak = Math.max(s.maxWinStreak, streak); s.grossWinR += r; }
    else if (o === 'loss') { s.losses++; streak = 0; s.grossLossR += Math.abs(r); }
    else s.be++;

    cumR += r; cumPips += p; cumUsd += u;
    peakR = Math.max(peakR, cumR); peakUsd = Math.max(peakUsd, cumUsd);
    s.maxDrawdownR = Math.max(s.maxDrawdownR, peakR - cumR);
    s.maxDrawdownUsd = Math.max(s.maxDrawdownUsd, peakUsd - cumUsd);
    if (u > 0) s.grossWinUsd += u; else s.grossLossUsd -= u;
    if (balance > 0) {
      const peak = balance + peakUsd;
      s.maxDrawdownPct = Math.max(s.maxDrawdownPct, ((peakUsd - cumUsd) / peak) * 100);
      if (!s.wipedOutAt && balance + cumUsd <= 0) s.wipedOutAt = { n: s.equity.length, trade: t };
    }
    s.equity.push({ r: cumR, pips: cumPips, usd: cumUsd, pct: pctOf(cumUsd), trade: t });
    if (!s.best || r > (s.best.r ?? 0)) s.best = t;

    const key = t.date.slice(0, 7);
    const m = months.get(key) ?? { month: key, count: 0, wins: 0, losses: 0, r: 0, pips: 0, usd: 0 };
    m.count++; m.r += r; m.pips += p; m.usd += u;
    if (o === 'win') m.wins++; else if (o === 'loss') m.losses++;
    months.set(key, m);
  }

  s.totalR = cumR; s.totalPips = cumPips; s.totalUsd = cumUsd;
  s.winRate = s.wins + s.losses ? s.wins / (s.wins + s.losses) : null; // breakevens excluded
  s.gainPct = pctOf(cumUsd);
  s.profitFactor = s.grossLossUsd > 0 ? s.grossWinUsd / s.grossLossUsd : null; // same at any lot size
  s.avgWinR = s.wins ? s.grossWinR / s.wins : null;
  s.months = [...months.values()].map((m) => ({ ...m, pct: pctOf(m.usd), winRate: m.wins + m.losses ? m.wins / (m.wins + m.losses) : null }));
  return s;
}
