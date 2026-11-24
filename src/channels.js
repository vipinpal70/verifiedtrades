// One entry per tab in the "YG Trades Report" Google Sheet.
// group: channels sharing a group appear under one site tab, with a button per channel (groupLabel).
// pipSize: price move that equals 1 pip. pipValuePerLot: USD per pip for 1.00 lot.
// XAUUSD: 1 lot = 100 oz, 1 pip = $0.10 move -> $10 per pip per lot (matches the trade sheet pips).
// BTCUSD: ASSUMPTION 1 lot = 1 BTC and 1 point = $1 move -> $1 per point per lot. Check against your broker.
// defaultGid: the tab's id (number after #gid= in its URL). It survives renames. Override with the gidEnv variable.
// Tabs are never looked up by name: for an unknown name Google silently returns the FIRST tab's data.
export const CHANNELS = [
  { id: '5x', name: '5X Gold', group: '5x', groupName: '5X Channel', groupLabel: 'Gold', instrument: 'XAUUSD', pipLabel: 'Pips', pipSize: 0.1, pipValuePerLot: 10, gidEnv: 'SHEET_GID_5X', defaultGid: '0' },
  { id: '5x-crypto', name: '5X Crypto', group: '5x', groupName: '5X Channel', groupLabel: 'Crypto', instrument: 'BTCUSD', pipLabel: 'Points', pipSize: 1, pipValuePerLot: 1, gidEnv: 'SHEET_GID_5X_CRYPTO', defaultGid: '1868589016' },
  { id: 'gold', name: 'GOLD Indicator', instrument: 'XAUUSD', pipLabel: 'Pips', pipSize: 0.1, pipValuePerLot: 10, gidEnv: 'SHEET_GID_GOLD', defaultGid: '65941045' },
  { id: 'btc', name: 'BTC Indicator', instrument: 'BTCUSD', pipLabel: 'Points', pipSize: 1, pipValuePerLot: 1, gidEnv: 'SHEET_GID_BTC', defaultGid: '1218398461' },
];

export const channelById = (id) => CHANNELS.find((c) => c.id === id);
