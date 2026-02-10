const { Pool } = require('pg');

let pool = null;

const isConfigured = () => {
  if (process.env.DATABASE_URL) return true;
  return Boolean(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD);
};

const buildPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true }
    };
  }

  return {
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT || 5432),
    ssl: { rejectUnauthorized: true }
  };
};

const getPool = () => {
  if (!isConfigured()) {
    throw new Error('Database not configured. Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD.');
  }
  if (!pool) {
    pool = new Pool(buildPoolConfig());
    pool.on('error', (err) => {
      console.error('[db] Pool error', err?.message || err);
    });
  }
  return pool;
};

const query = (text, params) => getPool().query(text, params);

const close = async () => {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
};

module.exports = { isConfigured, query, close };

