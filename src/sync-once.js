// `npm run sync` — one manual sync, prints the result, exits.
import { config } from './config.js';
import { openDb } from './db.js';
import { syncAll } from './sync.js';

const db = openDb(config.dbFile);
const results = await syncAll(db, config);
console.table(results.map(({ warning, ...r }) => r));
for (const r of results) if (r.warning) console.warn(`! ${r.channel}: ${r.warning}`);
db.close();
process.exitCode = results.some((r) => r.ok === false) ? 1 : 0;
