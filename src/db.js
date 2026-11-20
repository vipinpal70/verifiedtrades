import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite'; // built into Node >= 22.13, no native build step

export function openDb(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS trades (
      id       INTEGER PRIMARY KEY,
      channel  TEXT    NOT NULL,
      seq      INTEGER NOT NULL,          -- row order in the sheet
      date     TEXT    NOT NULL,          -- YYYY-MM-DD
      time     TEXT,                      -- HH:MM
      side     TEXT CHECK (side IN ('BUY','SELL') OR side IS NULL),
      entry    REAL, exit REAL, tp REAL, sl REAL,
      result   TEXT NOT NULL CHECK (result IN ('TP','SL','BE')),
      pips     REAL,
      r        REAL
    );
    CREATE INDEX IF NOT EXISTS idx_trades_channel_date ON trades (channel, date, time);

    CREATE TABLE IF NOT EXISTS sync_log (
      id        INTEGER PRIMARY KEY,
      channel   TEXT NOT NULL,
      source    TEXT NOT NULL,            -- 'sheet' | 'seed'
      synced_at TEXT NOT NULL,            -- ISO timestamp
      ok        INTEGER NOT NULL,
      rows      INTEGER NOT NULL DEFAULT 0,
      skipped   INTEGER NOT NULL DEFAULT 0,
      error     TEXT
    );
  `);
  return db;
}

/** Sheet is the source of truth: replace a channel's rows atomically. */
export function replaceChannelTrades(db, channelId, trades) {
  const del = db.prepare('DELETE FROM trades WHERE channel = ?');
  const ins = db.prepare(`INSERT INTO trades (channel, seq, date, time, side, entry, exit, tp, sl, result, pips, r)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN IMMEDIATE');
  try {
    del.run(channelId);
    trades.forEach((t, i) => ins.run(channelId, i + 1, t.date, t.time, t.side, t.entry, t.exit, t.tp, t.sl, t.result, t.pips, t.r));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function countTrades(db, channelId) {
  const sql = channelId ? 'SELECT COUNT(*) AS n FROM trades WHERE channel = ?' : 'SELECT COUNT(*) AS n FROM trades';
  const stmt = db.prepare(sql);
  return (channelId ? stmt.get(channelId) : stmt.get()).n;
}

export function getAllTrades(db) {
  return db.prepare(`SELECT channel, seq, date, time, side, entry, exit, tp, sl, result, pips, r
                     FROM trades ORDER BY channel, date, time, seq`).all();
}

export function logSync(db, { channel, source, ok, rows = 0, skipped = 0, error = null }) {
  db.prepare(`INSERT INTO sync_log (channel, source, synced_at, ok, rows, skipped, error) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(channel, source, new Date().toISOString(), ok ? 1 : 0, rows, skipped, error);
  db.prepare(`DELETE FROM sync_log WHERE id NOT IN (SELECT id FROM sync_log ORDER BY id DESC LIMIT 500)`).run();
}

/** Latest sync row per channel, plus the latest successful one. */
export function syncStatus(db) {
  const latest = db.prepare(`SELECT channel, source, synced_at, ok, rows, skipped, error FROM sync_log
                             WHERE id IN (SELECT MAX(id) FROM sync_log GROUP BY channel)`).all();
  const lastOk = db.prepare(`SELECT channel, MAX(synced_at) AS synced_at, source FROM sync_log WHERE ok = 1 GROUP BY channel`).all();
  return { latest, lastOk };
}
