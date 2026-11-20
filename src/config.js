import { CHANNELS } from './channels.js';

try { process.loadEnvFile(); } catch { /* no .env file: rely on real env vars */ }

const env = process.env;

export const config = {
  port: Number(env.PORT) || 3000,
  dbFile: env.DB_FILE || 'data/trades.db',
  sheetId: (env.SHEET_ID || '').trim(),
  gids: Object.fromEntries(CHANNELS.map((c) => [c.id, (env[c.gidEnv] || '').trim()])),
  // Tab names are used when no gid is set. Set a tab name to "-" to skip that channel.
  tabs: Object.fromEntries(CHANNELS.map((c) => [c.id, (env[c.tabEnv] ?? c.defaultTab).trim()])),
  dateFormat: env.DATE_FORMAT === 'DMY' ? 'DMY' : 'MDY',
  defaultYear: Number(env.DEFAULT_YEAR) || new Date().getFullYear(),
  syncIntervalMin: Math.max(1, Number(env.SYNC_INTERVAL_MIN) || 15),
  syncToken: env.SYNC_TOKEN || '',
};
