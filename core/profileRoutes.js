const crypto = require('crypto');
const db = require('./db');

const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.PROFILE_MAX_BODY_BYTES || 400_000));

let schemaEnsured = false;
let schemaEnsurePromise = null;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function parseCookies(header) {
  const src = String(header || '');
  const out = {};
  src.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
  return true;
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;
  if (!db.isConfigured()) return;

  const safeQuery = async (sql) => {
    try {
      await db.query(sql);
    } catch (err) {
      const code = String(err?.code || '');
      if (code === '23505' || code === '42P07') return;
      throw err;
    }
  };

  schemaEnsurePromise = (async () => {
    await safeQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_user_profiles (
        user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        profile jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    schemaEnsured = true;
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

async function resolveUserIdFromSession(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  const tokenHash = sha256Hex(token);

  try {
    const result = await db.query(
      `
        SELECT user_id
        FROM app_sessions
        WHERE session_token_hash = $1
          AND expires_at > now()
        LIMIT 1;
      `,
      [tokenHash]
    );
    return result.rows?.[0]?.user_id || null;
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, patch) {
  const out = isPlainObject(target) ? { ...target } : {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  });
  return out;
}

module.exports = async function profileRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/profile')) return false;

  if (!db.isConfigured()) {
    return sendJson(res, 501, { error: 'Database not configured' });
  }

  await ensureSchema();
  const userId = await resolveUserIdFromSession(req);
  if (!userId) return sendJson(res, 401, { error: 'Not signed in' });

  if (url.pathname === '/api/profile' && req.method === 'GET') {
    try {
      const result = await db.query(
        `
          SELECT user_id, created_at, updated_at, profile
          FROM app_user_profiles
          WHERE user_id = $1
          LIMIT 1;
        `,
        [userId]
      );
      return sendJson(res, 200, { profile: result.rows?.[0] || null });
    } catch (err) {
      console.error('[profile-get]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to load profile' });
    }
  }

  if (url.pathname === '/api/profile' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const incoming = payload?.profile && typeof payload.profile === 'object'
      ? payload.profile
      : (payload?.data && typeof payload.data === 'object' ? payload.data : null);
    if (!incoming) return sendJson(res, 400, { error: 'Missing profile payload' });

    const replace = Boolean(payload?.replace);

    try {
      const existing = await db.query(
        'SELECT profile FROM app_user_profiles WHERE user_id = $1 LIMIT 1;',
        [userId]
      );
      const current = existing.rows?.[0]?.profile && typeof existing.rows[0].profile === 'object'
        ? existing.rows[0].profile
        : {};
      const merged = replace ? incoming : deepMerge(current, incoming);

      await db.query(
        `
          INSERT INTO app_user_profiles (user_id, profile)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (user_id) DO UPDATE
          SET profile = EXCLUDED.profile,
              updated_at = now();
        `,
        [userId, JSON.stringify(merged)]
      );

      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[profile-save]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to save profile' });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
};
