import { readFileSync } from 'node:fs';
import { CHANNELS, channelById } from './channels.js';
import { parseCsv } from './csv.js';
import { parseSheetRows } from './normalize.js';
import { countTrades, logSync, replaceChannelTrades } from './db.js';

const MAX_BYTES = 5 * 1024 * 1024;

/** CSV URL for a tab: by gid (exact export) when set, otherwise by tab name (gviz endpoint). */
export function sheetCsvUrl(sheetId, { gid, tab }) {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}`;
  return gid
    ? `${base}/export?format=csv&gid=${encodeURIComponent(gid)}`
    : `${base}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
}

/** The sheet tab for a channel, or null if that channel is not configured. */
export function sheetSource(cfg, channelId) {
  if (!cfg.sheetId) return null;
  const gid = cfg.gids?.[channelId];
  const tab = cfg.tabs?.[channelId];
  if (gid) return { gid };
  if (tab && tab !== '-') return { tab };
  return null;
}

async function fetchCsv(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`HTTP ${res.status}: the sheet is private. Share it as "Anyone with the link: Viewer".`);
  }
  if (res.status === 400) throw new Error('HTTP 400: tab not found. Check the tab name / gid in .env.');
  if (!res.ok) throw new Error(`Sheet request failed: HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  // A private sheet redirects to a Google login page (HTML) instead of CSV.
  if (!type.includes('text/csv')) throw new Error(`Expected CSV, got "${type}". Is the sheet shared as "Anyone with the link"?`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Sheet CSV larger than 5 MB, refusing');
  return text;
}

export async function syncChannel(db, channel, cfg) {
  const source = sheetSource(cfg, channel.id);
  if (!source) return { channel: channel.id, skipped: true };
  try {
    const rows = parseCsv(await fetchCsv(sheetCsvUrl(cfg.sheetId, source)));
    const { trades, skipped, skippedRows } = parseSheetRows(rows, channel, cfg);
    const warning = skippedRows.length
      ? `Unreadable rows (check the date): ${skippedRows.map((r) => `row ${r.row} "${r.date}"`).join(', ')}`
      : undefined;
    // Guard: an empty parse while we hold data usually means the sheet layout changed. Keep old data.
    if (trades.length === 0 && countTrades(db, channel.id) > 0) {
      throw new Error('Sheet returned 0 trades; keeping previous data');
    }
    replaceChannelTrades(db, channel.id, trades);
    logSync(db, { channel: channel.id, source: 'sheet', ok: true, rows: trades.length, skipped, error: warning?.slice(0, 500) ?? null });
    return { channel: channel.id, ok: true, rows: trades.length, skipped, warning };
  } catch (err) {
    logSync(db, { channel: channel.id, source: 'sheet', ok: false, error: String(err.message).slice(0, 500) });
    return { channel: channel.id, ok: false, error: err.message };
  }
}

export async function syncAll(db, cfg) {
  const results = [];
  for (const ch of CHANNELS) results.push(await syncChannel(db, ch, cfg));
  return results;
}

/** Loads bundled sample data for channels that have no rows yet and no sheet tab configured. */
export function seedIfEmpty(db, cfg, seedFile) {
  const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
  for (const [channelId, rows] of Object.entries(seed)) {
    const ch = channelById(channelId);
    if (!ch || sheetSource(cfg, channelId) || countTrades(db, channelId) > 0) continue;
    const header = Object.keys(rows[0]);
    const { trades, skipped } = parseSheetRows([header, ...rows.map((r) => header.map((h) => r[h]))], ch, cfg);
    replaceChannelTrades(db, channelId, trades);
    logSync(db, { channel: channelId, source: 'seed', ok: true, rows: trades.length, skipped });
  }
}
