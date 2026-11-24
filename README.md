# YG 5X Trade Records

A single-page site with a small Node API. Trades come from a Google Sheet. The server syncs every 15 minutes into a local SQLite file (`data/trades.db`), and the page reads them from `/api/data`.

```
Google Sheet ──(CSV export, every 15 min)──> Node (Express) ──> SQLite data/trades.db
                                                   │
                                   GET /api/data ──┴──> public/index.html (charts, tabs, calculator)
```

## Run

Requires Node 22.13 or newer (uses the built-in `node:sqlite`, so there is no native build step).

```bash
npm install
cp .env.example .env      # fill in SHEET_ID and the tab gids
npm start                 # http://localhost:3000
npm run dev               # same, restarts on file changes
npm run sync              # one manual sync, prints a result table
npm test
```

With no `SHEET_ID` set, the 5X tab shows the bundled November 2026 trade sheet (`data/seed.json`), marked "Sample data".

## Google Sheet setup

1. Tabs are read by their id (`gid`, the number after `#gid=` in the URL), so renaming a tab is safe. The ids for 5X Gold, 5X Crypto, Gold Indicator and BTC Indicator are in `src/channels.js`; override them with `SHEET_GID_*` in `.env`. Tabs are never read by name, because Google returns the first tab's data for a name that doesn't exist.
2. Share the sheet as **Anyone with the link: Viewer**. A private sheet returns HTTP 401, the sync logs it, and the site keeps the last good data.
3. Put the sheet ID in `.env`.
4. Columns are matched by header name, so order doesn't matter and title rows above the header are fine:

| Column | Required | Accepted headers |
|---|---|---|
| Date | yes | Date |
| Pips or R | at least one (or Entry + Exit + Side) | Pips, R, R Multiple |
| Side | recommended | Side, Type, Direction (BUY/SELL/Long/Short) |
| Entry, Exit, TP, SL | optional | Entry, Exit, TP, SL |
| Result | optional | Result (TP/SL/B.E/Win/Loss); otherwise taken from the sign of Pips/R |
| RR | optional | RR (`1:2.5`) |
| Time | optional | Time |

R per trade: an explicit `R` column wins. Otherwise SL = −1R, B.E = 0R, TP = the RR value. If none of those are available, R is calculated as `pips ÷ |entry − SL|`. Rows without a valid date (totals, notes) are skipped.

## API

| Route | Purpose |
|---|---|
| `GET /api/data` | All channels with config, trades and sync status (cached in memory, rebuilt after each sync) |
| `GET /api/health` | Sync status per channel |
| `POST /api/sync` | Manual sync; needs header `x-sync-token` equal to `SYNC_TOKEN`; disabled when unset |

## Things to confirm

- **BTC lot maths:** `src/channels.js` assumes 1 lot = 1 BTC and 1 pip = $1. Gold is $10 per pip per lot, which matches the sheet's pips. Adjust `pipValuePerLot` to your broker.
- **Total Gained %** = (final capital − starting capital) ÷ starting capital, at the lot size and capital in the calculator (opens at 1.00 lot and $10,000). **R** is per trade only: SL = −1R, TP = its RR, B.E = 0R.
- **Win rate** = wins ÷ (wins + losses); breakevens are excluded.
- The copy calculator uses a fixed lot size, with no spread, commission or slippage, and says so on the page.

## Deploy

Any host with a persistent disk and a long-running Node process (VPS + pm2, Render or Railway with a volume). Serverless hosts don't fit, because they have neither a persistent SQLite file nor a 15-minute timer.
