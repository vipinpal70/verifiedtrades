import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { CHANNELS } from './channels.js';
import { getAllTrades, openDb, syncStatus } from './db.js';
import { seedIfEmpty, syncAll } from './sync.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const db = openDb(config.dbFile);
seedIfEmpty(db, config, root('data/seed.json'));

// ---- Cached API payload, rebuilt after every sync -------------------------
let payload = null;
function buildPayload() {
  const all = getAllTrades(db);
  const status = syncStatus(db);
  payload = {
    generatedAt: new Date().toISOString(),
    syncIntervalMin: config.syncIntervalMin,
    channels: CHANNELS.map(({ gidEnv, defaultGid, ...ch }) => {
      const lastOk = status.lastOk.find((s) => s.channel === ch.id);
      const latest = status.latest.find((s) => s.channel === ch.id);
      return {
        ...ch,
        source: lastOk?.source ?? null,          // 'sheet' | 'seed' | null
        lastSyncedAt: lastOk?.synced_at ?? null,
        lastError: latest && !latest.ok ? latest.error : null,
        trades: all.filter((t) => t.channel === ch.id).map(({ channel, ...t }) => t),
      };
    }),
  };
}
buildPayload();

let syncing = null;
async function runSync() {
  if (syncing) return syncing; // never overlap runs
  syncing = (async () => {
    try {
      const results = await syncAll(db, config);
      buildPayload();
      for (const r of results) {
        if (r.ok === false) console.warn(`[sync] ${r.channel}: ${r.error}`);
        else if (r.warning) console.warn(`[sync] ${r.channel}: ${r.warning}`);
      }
      return results;
    } finally { syncing = null; }
  })();
  return syncing;
}

// ---- HTTP ------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'",
  });
  next();
});

app.get('/api/data', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(payload);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, sheetConfigured: Boolean(config.sheetId), syncing: Boolean(syncing), ...syncStatus(db) });
});

// Manual refresh, only when SYNC_TOKEN is set.
app.post('/api/sync', async (req, res) => {
  const given = Buffer.from(String(req.get('x-sync-token') ?? ''));
  const expected = Buffer.from(config.syncToken);
  if (!config.syncToken || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.json({ results: await runSync() });
});

// no-cache = browser revalidates via ETag on each load, so edits show up immediately (304s keep it cheap).
app.use(express.static(root('public'), { index: 'index.html', setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const server = app.listen(config.port, () => {
  console.log(`Trade records running on http://localhost:${config.port}`);
  if (!config.sheetId) console.log('SHEET_ID not set: serving bundled sample data only.');
});

// ---- Scheduler -------------------------------------------------------------
let timer = null;
if (config.sheetId) {
  runSync();
  timer = setInterval(runSync, config.syncIntervalMin * 60_000);
}

function shutdown() {
  clearInterval(timer);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
