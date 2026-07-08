const { Pool: PgPool } = require('pg');
const { DbUnavailableError, isTransientPgError } = require('./dbErrors');

let pool = null;
let lastPoolConfig = null;
let lastDriver = 'pg';
const DB_QUERY_TIMEOUT_MS = Math.max(1000, Number(process.env.DB_QUERY_TIMEOUT_MS || 15000));

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

const isConfigured = () => {
  if (getDatabaseUrl()) return true;
  return Boolean(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD);
};

const isNeonConnectionString = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  try {
    return /\.neon\.tech$/i.test(new URL(text).hostname || '');
  } catch {
    return text.includes('.neon.tech');
  }
};

const createNeonPool = (config) => {
  const { Pool: NeonPool, neonConfig } = require('@neondatabase/serverless');
  const ws = require('ws');
  if (!neonConfig.webSocketConstructor) {
    neonConfig.webSocketConstructor = ws;
  }
  return new NeonPool(config);
};

const buildPoolConfig = () => {
  const databaseUrl = getDatabaseUrl();
  const hasDatabaseUrl = Boolean(databaseUrl);
  const hostFromUrl = (() => {
    if (!hasDatabaseUrl) return '';
    try {
      return new URL(databaseUrl).hostname || '';
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
    connectionTimeoutMillis: Math.max(1000, Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000)),
    keepAlive: true,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  };

  if (process.env.DATABASE_URL) {
    return {
      connectionString: databaseUrl,
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
    const useNeonServerless = isNeonConnectionString(lastPoolConfig?.connectionString);
    pool = useNeonServerless ? createNeonPool(lastPoolConfig) : new PgPool(lastPoolConfig);
    lastDriver = useNeonServerless ? 'neon-serverless' : 'pg';
    pool.on('error', (err) => {
      console.error('[db] Pool error', err?.message || err);
      // Allow automatic recreation on next query if a pooled client dies.
      pool = null;
      lastDriver = 'pg';
    });
  }
  return pool;
};

const resetPool = async () => {
  if (!pool) return;
  const current = pool;
  pool = null;
  lastPoolConfig = null;
  try {
    await current.end();
  } catch {
    // ignore pool shutdown failures
  }
};

async function query(text, params) {
  const activePool = getPool();
  let timeoutId = null;
  let timedOut = false;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        reject(new DbUnavailableError(`Database query timed out after ${DB_QUERY_TIMEOUT_MS}ms`));
      }, DB_QUERY_TIMEOUT_MS);
    });
    return await Promise.race([
      activePool.query(text, params),
      timeoutPromise
    ]);
  } catch (err) {
    if (timedOut || err instanceof DbUnavailableError || isTransientPgError(err)) {
      // Only tear the pool down on real connection-level failures. A single
      // slow query must not destroy every warm connection - that turns one
      // timeout into a site-wide 503 storm while fresh pools cold-start.
      if (!timedOut) await resetPool();
      if (err instanceof DbUnavailableError) throw err;
      throw new DbUnavailableError('Database temporarily unavailable', err);
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const close = async () => {
  await resetPool();
};

const getDiagnostics = () => {
  const sslEnabled = Boolean(lastPoolConfig?.ssl && lastPoolConfig.ssl !== false);
  if (!pool) return { driver: lastDriver, sslEnabled, totalCount: 0, idleCount: 0, waitingCount: 0 };
  return {
    driver: lastDriver,
    sslEnabled,
    totalCount: Number(pool.totalCount || 0),
    idleCount: Number(pool.idleCount || 0),
    waitingCount: Number(pool.waitingCount || 0)
  };
};

module.exports = { isConfigured, query, close, getDiagnostics };
