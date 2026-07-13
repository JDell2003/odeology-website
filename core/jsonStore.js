// Durable JSON storage for the small file-backed feature stores
// (onboarding insights, trainer website/funnel configs, funnel events,
// workout-db suggestions). Railway's container filesystem is wiped on
// every deploy, so in production these live in a Postgres key/value
// table; without a DATABASE_URL we fall back to the same data/*.json
// files local dev has always used.
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DATA_DIR = path.join(__dirname, '..', 'data');

let ensurePromise = null;
function ensureTable() {
  if (!ensurePromise) {
    ensurePromise = db.query(`
      CREATE TABLE IF NOT EXISTS json_store (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `).catch((err) => {
      ensurePromise = null; // retry on next call
      throw err;
    });
  }
  return ensurePromise;
}

const fileFor = (key) => path.join(DATA_DIR, `${key}.json`);

function readFileFallback(key, fallback) {
  try {
    const file = fileFor(key);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
  } catch (err) {
    return fallback;
  }
}

function writeFileFallback(key, value) {
  const file = fileFor(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, file);
}

/* Read a store. DB is the source of truth when configured; a key that
   has never been written in the DB falls back to the seed file shipped
   in the repo (so pre-DB data and empty seeds keep working). */
async function getJson(key, fallback) {
  if (!db.isConfigured()) return readFileFallback(key, fallback);
  try {
    await ensureTable();
    const res = await db.query('SELECT value FROM json_store WHERE key = $1', [key]);
    if (res.rows.length) return res.rows[0].value;
    return readFileFallback(key, fallback);
  } catch (err) {
    console.error(`[json-store] read '${key}' failed, using file fallback:`, err?.message || err);
    return readFileFallback(key, fallback);
  }
}

async function setJson(key, value) {
  if (!db.isConfigured()) { writeFileFallback(key, value); return; }
  await ensureTable();
  await db.query(
    `INSERT INTO json_store (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
  // Best-effort local mirror so a dev copy of prod data is easy to inspect.
  try { writeFileFallback(key, value); } catch (err) { /* read-only fs is fine */ }
}

module.exports = { getJson, setJson };
