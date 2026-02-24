const { Pool } = require('pg');

let pool = null;
let lastPoolConfig = null;

const isConfigured = () => {
  if (process.env.DATABASE_URL) return true;
  return Boolean(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD);
};

const buildPoolConfig = () => {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hostFromUrl = (() => {
    if (!hasDatabaseUrl) return '';
    try {
      return new URL(process.env.DATABASE_URL).hostname || '';
    } catch {
      return '';
    }
  })();
  const localHost = String(hostFromUrl || process.env.PGHOST || '').toLowerCase();
  const sslEnabled = hasDatabaseUrl
    ? !(localHost.includes('localhost') || localHost.includes('127.0.0.1'))
    : false;

  const common = {
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  };

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ...common
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT || 5432),
    ...common
  };
};

const getPool = () => {
  if (!isConfigured()) {
    throw new Error('Database not configured. Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD.');
  }
  if (!pool) {
    lastPoolConfig = buildPoolConfig();
    pool = new Pool(lastPoolConfig);
    pool.on('error', (err) => {
      console.error('[db] Pool error', err?.message || err);
      // Allow automatic recreation on next query if a pooled client dies.
      pool = null;
    });
  }
  return pool;
};

const query = (text, params) => getPool().query(text, params);

const close = async () => {
  if (!pool) return;
  const current = pool;
  pool = null;
  lastPoolConfig = null;
  await current.end();
};

const getDiagnostics = () => {
  const sslEnabled = Boolean(lastPoolConfig?.ssl && lastPoolConfig.ssl !== false);
  if (!pool) return { sslEnabled, totalCount: 0, idleCount: 0, waitingCount: 0 };
  return {
    sslEnabled,
    totalCount: Number(pool.totalCount || 0),
    idleCount: Number(pool.idleCount || 0),
    waitingCount: Number(pool.waitingCount || 0)
  };
};

module.exports = { isConfigured, query, close, getDiagnostics };
