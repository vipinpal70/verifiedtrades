// One entry per tab on the site / per tab in the Google Sheet.
// pipSize: price move that equals 1 pip. pipValuePerLot: USD per pip for 1.00 lot.
// XAUUSD: 1 lot = 100 oz, 1 pip = $0.10 move -> $10 per pip per lot (matches the trade sheet pips).
// BTCUSD: ASSUMPTION 1 lot = 1 BTC and 1 "pip" = $1 move -> $1 per pip per lot. Check against your broker.
// defaultTab: the tab name in the "YG Trades Report" sheet (override with the tabEnv variable).
export const CHANNELS = [
  { id: '5x', name: '5X Channel', instrument: 'XAUUSD', pipSize: 0.1, pipValuePerLot: 10, gidEnv: 'SHEET_GID_5X', tabEnv: 'SHEET_TAB_5X', defaultTab: '5X' },
  { id: 'gold', name: 'GOLD Indicator', instrument: 'XAUUSD', pipSize: 0.1, pipValuePerLot: 10, gidEnv: 'SHEET_GID_GOLD', tabEnv: 'SHEET_TAB_GOLD', defaultTab: 'Gold Indicator' },
  { id: 'btc', name: 'BTC Indicator', instrument: 'BTCUSD', pipSize: 1, pipValuePerLot: 1, gidEnv: 'SHEET_GID_BTC', tabEnv: 'SHEET_TAB_BTC', defaultTab: 'BTC Indicator' },
];

export const channelById = (id) => CHANNELS.find((c) => c.id === id);
