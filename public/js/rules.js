// Lot size rule book: max lot grows by LOT_PER_STEP for every CAPITAL_STEP of capital.
//   capital <  $1,000 -> max 0.20 lot
//   capital <  $2,000 -> max 0.40 lot
//   capital <  $3,000 -> max 0.60 lot
//   ...and so on: +0.20 lot per extra $1,000.
export const CAPITAL_STEP = 1000;
export const LOT_PER_STEP = 0.2;

export function maxLotFor(capital) {
  if (!(capital > 0)) return 0;
  return Math.round(LOT_PER_STEP * (Math.floor(capital / CAPITAL_STEP) + 1) * 100) / 100;
}

/** Rows for the rule book table: the first `base` brackets, plus the bracket containing `capital` if beyond them. */
export function ruleRows(capital, base = 3) {
  const bracket = capital > 0 ? Math.floor(capital / CAPITAL_STEP) : 0;
  const idxs = [...Array(base).keys()];
  if (bracket >= base) idxs.push(bracket);
  return idxs.map((i) => ({
    from: i * CAPITAL_STEP,
    below: (i + 1) * CAPITAL_STEP,
    maxLot: Math.round(LOT_PER_STEP * (i + 1) * 100) / 100, // bracket i: [i*1000, (i+1)*1000)
    current: i === bracket,
    gap: i > base, // rows were skipped before this one
  }));
}
