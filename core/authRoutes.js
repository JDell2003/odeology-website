const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { DbUnavailableError, isTransientPgError } = require('./dbErrors');

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const SESSION_TTL_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30));
const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.AUTH_MAX_BODY_BYTES || 200_000));

let schemaEnsured = false;
const SCHEMA_RETRY_DELAYS_MS = [200, 600, 1400];

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizePhone(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;
  const hasPlus = value.startsWith('+');
  value = value.replace(/[^\d+]/g, '');
  if (hasPlus) value = '+' + value.replace(/[^\d]/g, '');
  else value = value.replace(/[^\d]/g, '');
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  return value;
}

function safeReturnTo(raw) {
  const value = String(raw || '/').trim();
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
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

function isSecureRequest(req) {
  if (String(process.env.COOKIE_SECURE || '') === '1') return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (proto === 'https') return true;
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function setCookieHeader(value, req) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieHeader(req) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
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
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function logTransientDbError(err, context) {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return;
  const d = db.getDiagnostics ? db.getDiagnostics() : {};
  console.warn('[auth][db-transient]', {
    context: context || 'unknown',
    code: err?.code || null,
    message: err?.message || String(err),
    sslEnabled: Boolean(d?.sslEnabled),
    totalCount: Number(d?.totalCount || 0),
    idleCount: Number(d?.idleCount || 0),
    waitingCount: Number(d?.waitingCount || 0)
  });
}

function sendDbUnavailable(res) {
  return sendJson(res, 503, {
    ok: false,
    error: 'DB_UNAVAILABLE',
    message: 'Service temporarily unavailable. Try again.'
  });
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (!db.isConfigured()) return;
  const schemaStatements = [
    'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    `
    CREATE TABLE IF NOT EXISTS app_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      username text UNIQUE,
      email text UNIQUE,
      phone text,
      display_name text NOT NULL,
      password_hash text,
      auth_provider text NOT NULL DEFAULT 'local',
      last_seen timestamptz,
      last_login timestamptz,
      admin_notes text NOT NULL DEFAULT ''
    );
  `,
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_seen timestamptz;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login timestamptz;',
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';",
    'CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_key ON app_users(phone) WHERE phone IS NOT NULL;',
    `
    CREATE TABLE IF NOT EXISTS app_identities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      provider text NOT NULL,
      provider_user_id text NOT NULL,
      email text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(provider, provider_user_id)
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_identities_user_id ON app_identities(user_id);',
    `
    CREATE TABLE IF NOT EXISTS app_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_token_hash text UNIQUE NOT NULL,
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at);',
    `
    CREATE TABLE IF NOT EXISTS app_oauth_states (
      state_hash text PRIMARY KEY,
      return_to text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_oauth_states_expires_at ON app_oauth_states(expires_at);'
  ];

  for (let attempt = 0; attempt <= SCHEMA_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      for (const sql of schemaStatements) {
        await db.query(sql);
      }
      schemaEnsured = true;
      return;
    } catch (err) {
      if (!isTransientPgError(err)) throw err;
      logTransientDbError(err, `ensureSchema:attempt_${attempt + 1}`);
      if (attempt >= SCHEMA_RETRY_DELAYS_MS.length) {
        throw new DbUnavailableError('Database unavailable while ensuring auth schema', err);
      }
      await sleep(SCHEMA_RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function getUserFromRequest(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = sha256Hex(token);

  const result = await db.query(
    `
      SELECT u.id, u.username, u.email, u.display_name
      FROM app_sessions s
      JOIN app_users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
        AND s.expires_at > now()
      LIMIT 1;
    `,
    [tokenHash]
  );

  const row = result.rows?.[0];
  if (!row) return null;
  try {
    await db.query('UPDATE app_users SET last_seen = now() WHERE id = $1;', [row.id]);
  } catch {
    // ignore
  }
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name
  };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.query(
    `
      INSERT INTO app_sessions (session_token_hash, user_id, expires_at)
      VALUES ($1, $2, $3);
    `,
    [tokenHash, userId, expiresAt]
  );

  await db.query('UPDATE app_users SET last_login = now(), last_seen = now() WHERE id = $1;', [userId]);

  return token;
}

async function deleteSessionByToken(token) {
  if (!token) return;
  const tokenHash = sha256Hex(token);
  await db.query('DELETE FROM app_sessions WHERE session_token_hash = $1;', [tokenHash]);
}

async function handleLocalSignup(req, res) {
  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const username = String(payload?.username || '').trim().toLowerCase();
  const email = normalizeEmail(payload?.email);
  const phoneRaw = String(payload?.phone || '').trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const displayName = String(payload?.displayName || '').trim();
  const password = String(payload?.password || '');

  if (!username || username.length < 3) return sendJson(res, 400, { error: 'Username must be at least 3 characters' });
  if (!/^[a-z0-9_]+$/.test(username)) return sendJson(res, 400, { error: 'Username can only use letters, numbers, underscores' });
  if (!email) return sendJson(res, 400, { error: 'Enter a valid email address' });
  if (phoneRaw && !phone) return sendJson(res, 400, { error: 'Enter a valid phone number (or leave it blank)' });
  if (!displayName || displayName.length < 2) return sendJson(res, 400, { error: 'Display name must be at least 2 characters' });
  if (!password || password.length < 8) return sendJson(res, 400, { error: 'Password must be at least 8 characters' });

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const created = await db.query(
      `
        INSERT INTO app_users (username, email, phone, display_name, password_hash, auth_provider)
        VALUES ($1, $2, $3, $4, $5, 'local')
        RETURNING id, username, email, display_name;
      `,
      [username, email, phone, displayName, passwordHash]
    );
    const user = created.rows[0];
    const token = await createSession(user.id);
    return sendJson(
      res,
      200,
      { user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name } },
      { 'Set-Cookie': setCookieHeader(token, req) }
    );
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg.includes('app_users_username_key')) return sendJson(res, 409, { error: 'Username already taken' });
    if (msg.includes('app_users_email_key')) return sendJson(res, 409, { error: 'Email already in use' });
    if (msg.includes('app_users_phone_key')) return sendJson(res, 409, { error: 'Phone number already in use' });
    return sendJson(res, 500, { error: 'Failed to create user' });
  }
}

async function handleLocalLogin(req, res) {
  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const identifierRaw = String(payload?.username || payload?.identifier || '').trim();
  const identifierLower = identifierRaw.toLowerCase();
  const username = identifierLower;
  const email = normalizeEmail(identifierRaw);
  const phone = normalizePhone(identifierRaw);
  const password = String(payload?.password || '');
  if (!identifierRaw || !password) return sendJson(res, 400, { error: 'Missing sign-in info or password' });

  const result = await db.query(
    `
      SELECT id, username, email, display_name, password_hash
      FROM app_users
      WHERE username = $1
         OR email = $2
         OR phone = $3
      LIMIT 1;
    `,
    [username, email, phone]
  );
  const row = result.rows?.[0];
  if (!row || !row.password_hash) return sendJson(res, 401, { error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return sendJson(res, 401, { error: 'Invalid credentials' });

  const token = await createSession(row.id);
  return sendJson(
    res,
    200,
    { user: { id: row.id, username: row.username, email: row.email, displayName: row.display_name } },
    { 'Set-Cookie': setCookieHeader(token, req) }
  );
}

async function handleLogout(req, res) {
  if (!db.isConfigured()) {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookieHeader(req) });
  }
  await ensureSchema();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  try {
    await deleteSessionByToken(token);
  } catch {
    // ignore
  }
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookieHeader(req) });
}

async function handleGoogleStart(req, res, url) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) return sendJson(res, 501, { error: 'Google auth not configured' });
  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  const state = crypto.randomBytes(16).toString('hex');
  const stateHash = sha256Hex(state);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.query(
    'INSERT INTO app_oauth_states (state_hash, return_to, expires_at) VALUES ($1, $2, $3) ON CONFLICT (state_hash) DO UPDATE SET return_to = EXCLUDED.return_to, expires_at = EXCLUDED.expires_at;',
    [stateHash, returnTo, expiresAt]
  );

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}

async function handleGoogleCallback(req, res, url) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    res.writeHead(302, { Location: '/?auth=google_config_missing' });
    return res.end();
  }
  if (!db.isConfigured()) {
    res.writeHead(302, { Location: '/?auth=db_missing' });
    return res.end();
  }
  await ensureSchema();

  const code = String(url.searchParams.get('code') || '');
  const state = String(url.searchParams.get('state') || '');
  if (!code || !state) {
    res.writeHead(302, { Location: '/?auth=google_failed' });
    return res.end();
  }

  const stateHash = sha256Hex(state);
  const stateRow = await db.query(
    `
      SELECT return_to
      FROM app_oauth_states
      WHERE state_hash = $1
        AND expires_at > now()
      LIMIT 1;
    `,
    [stateHash]
  );
  const returnTo = safeReturnTo(stateRow.rows?.[0]?.return_to);
  await db.query('DELETE FROM app_oauth_states WHERE state_hash = $1;', [stateHash]);

  if (!stateRow.rows?.[0]) {
    res.writeHead(302, { Location: '/?auth=google_state' });
    return res.end();
  }

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString()
  });

  if (!tokenResp.ok) {
    res.writeHead(302, { Location: '/?auth=google_token' });
    return res.end();
  }

  const tokenJson = await tokenResp.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    res.writeHead(302, { Location: '/?auth=google_token' });
    return res.end();
  }

  const userInfoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!userInfoResp.ok) {
    res.writeHead(302, { Location: '/?auth=google_userinfo' });
    return res.end();
  }

  const info = await userInfoResp.json();
  const providerUserId = String(info.sub || '');
  const email = info.email ? String(info.email).toLowerCase() : null;
  const emailVerified = Boolean(info.email_verified);
  const displayName = String(info.name || info.given_name || (email ? email.split('@')[0] : 'Member'));

  if (!providerUserId || !email || !emailVerified) {
    res.writeHead(302, { Location: '/?auth=google_profile' });
    return res.end();
  }

  let userId = null;

  const existingIdentity = await db.query(
    `
      SELECT u.id
      FROM app_identities i
      JOIN app_users u ON u.id = i.user_id
      WHERE i.provider = 'google'
        AND i.provider_user_id = $1
      LIMIT 1;
    `,
    [providerUserId]
  );
  userId = existingIdentity.rows?.[0]?.id || null;

  if (!userId) {
    const existingByEmail = await db.query('SELECT id FROM app_users WHERE email = $1 LIMIT 1;', [email]);
    userId = existingByEmail.rows?.[0]?.id || null;
  }

  if (!userId) {
    const created = await db.query(
      `
        INSERT INTO app_users (email, display_name, auth_provider)
        VALUES ($1, $2, 'google')
        RETURNING id;
      `,
      [email, displayName]
    );
    userId = created.rows?.[0]?.id || null;
  }

  if (!userId) {
    res.writeHead(302, { Location: '/?auth=google_user_create' });
    return res.end();
  }

  await db.query(
    `
      INSERT INTO app_identities (user_id, provider, provider_user_id, email)
      VALUES ($1, 'google', $2, $3)
      ON CONFLICT (provider, provider_user_id) DO UPDATE SET email = EXCLUDED.email;
    `,
    [userId, providerUserId, email]
  );

  const token = await createSession(userId);
  res.writeHead(302, {
    'Set-Cookie': setCookieHeader(token, req),
    Location: returnTo || '/'
  });
  res.end();
}

async function cleanupExpired() {
  if (!db.isConfigured()) return;
  await ensureSchema();
  await db.query('DELETE FROM app_sessions WHERE expires_at <= now();');
  await db.query('DELETE FROM app_oauth_states WHERE expires_at <= now();');
}

let lastCleanupAt = 0;

async function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanupAt < 30 * 60 * 1000) return;
  lastCleanupAt = now;
  try {
    await cleanupExpired();
  } catch {
    // ignore
  }
}

module.exports = async function authRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/auth/')) return false;
  try {
    await maybeCleanup();

    if (url.pathname === '/api/auth/google/ready' && req.method === 'GET') {
      const missing = [];
      if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
      if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
      if (!process.env.GOOGLE_REDIRECT_URI) missing.push('GOOGLE_REDIRECT_URI');
      return sendJson(res, 200, { ok: missing.length === 0, missing });
    }

    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      sendJson(res, 200, { user });
      return true;
    }

    if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
      await handleLocalSignup(req, res);
      return true;
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      await handleLocalLogin(req, res);
      return true;
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      await handleLogout(req, res);
      return true;
    }

    if (url.pathname === '/api/auth/google/start' && req.method === 'GET') {
      await handleGoogleStart(req, res, url);
      return true;
    }

    if (url.pathname === '/api/auth/google/callback' && req.method === 'GET') {
      await handleGoogleCallback(req, res, url);
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
    return true;
  } catch (err) {
    if (err instanceof DbUnavailableError || isTransientPgError(err)) {
      logTransientDbError(err, `authRoutes:${req.method}:${url.pathname}`);
      sendDbUnavailable(res);
      return true;
    }
    throw err;
  }
};
