const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { DbUnavailableError, isTransientPgError } = require('./dbErrors');

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const OWNER_BACKUP_COOKIE_NAME = process.env.OWNER_BACKUP_COOKIE_NAME || `${COOKIE_NAME}_owner_backup`;
const SESSION_TTL_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30));
const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.AUTH_MAX_BODY_BYTES || 200_000));
const ONLINE_WINDOW_MS = Math.max(30_000, Number(process.env.ONLINE_WINDOW_MS || 180_000));

let schemaEnsured = false;
let schemaEnsurePromise = null;
let schemaTransientBackoffUntil = 0;
let lastSchemaTransientError = null;
const SCHEMA_RETRY_DELAYS_MS = [200, 600, 1400];
const AUTH_SCHEMA_BACKOFF_MS = Math.max(1000, Number(process.env.AUTH_SCHEMA_BACKOFF_MS || 15_000));
const AUTH_TRANSIENT_LOG_THROTTLE_MS = Math.max(1000, Number(process.env.AUTH_TRANSIENT_LOG_THROTTLE_MS || 10_000));
const authTransientLogByContext = new Map();

function toEpochMs(raw) {
  if (!raw) return NaN;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isLastSeenOnline(lastSeenRaw) {
  const ts = toEpochMs(lastSeenRaw);
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) <= ONLINE_WINDOW_MS;
}

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

function csvToSet(raw) {
  const out = new Set();
  String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((s) => out.add(s));
  return out;
}

const OWNER_USERNAMES = csvToSet(process.env.OWNER_USERNAMES || 'odeology,odeology_,odeology_owner,jason');
const OWNER_EMAILS = csvToSet(process.env.OWNER_EMAILS || '');
const OWNER_EMAIL_DOMAIN = String(process.env.OWNER_EMAIL_DOMAIN || 'odeology.com').trim().toLowerCase();
const OWNER_DISPLAY_NAMES = csvToSet(process.env.OWNER_DISPLAY_NAMES || 'odeology,odeology_');
const OWNER_USER_IDS = csvToSet(process.env.OWNER_USER_IDS || '');

function isOwnerUser(userLike) {
  const userId = String(userLike?.id || '').trim().toLowerCase();
  const username = String(userLike?.username || '').trim().toLowerCase();
  const email = String(userLike?.email || '').trim().toLowerCase();
  const displayName = String(userLike?.display_name || userLike?.displayName || '').trim().toLowerCase();
  const adminNotes = String(userLike?.admin_notes || userLike?.adminNotes || '').trim().toLowerCase();
  if (userId && OWNER_USER_IDS.has(userId)) return true;
  if (adminNotes.includes('owner')) return true;
  if (username && OWNER_USERNAMES.has(username)) return true;
  if (email && OWNER_EMAILS.has(email)) return true;
  if (displayName && OWNER_DISPLAY_NAMES.has(displayName)) return true;
  if (email && OWNER_EMAIL_DOMAIN && email.endsWith(`@${OWNER_EMAIL_DOMAIN}`)) return true;
  if (username.includes('odeology') || displayName.includes('odeology')) return true;
  return false;
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

function setNamedCookieHeader(name, value, req, maxAgeSeconds) {
  const cookieName = String(name || '').trim();
  if (!cookieName) return '';
  const maxAge = Number.isFinite(Number(maxAgeSeconds))
    ? Math.max(0, Math.floor(Number(maxAgeSeconds)))
    : SESSION_TTL_DAYS * 24 * 60 * 60;
  const parts = [
    `${cookieName}=${encodeURIComponent(String(value || ''))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearNamedCookieHeader(name, req) {
  const cookieName = String(name || '').trim();
  if (!cookieName) return '';
  const parts = [
    `${cookieName}=`,
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
  const key = String(context || 'unknown');
  const now = Date.now();
  const last = Number(authTransientLogByContext.get(key) || 0);
  if (now - last < AUTH_TRANSIENT_LOG_THROTTLE_MS) return;
  authTransientLogByContext.set(key, now);
  const d = db.getDiagnostics ? db.getDiagnostics() : {};
  console.warn('[auth][db-transient]', {
    context: key,
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

async function handleAccountsList(req, res, url) {
  const user = await getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return true;
  }

  const q = String(url.searchParams.get('q') || '').trim();
  const limitParam = Number(url.searchParams.get('limit') || 0);
  const searchLimit = Math.min(250, Math.max(1, limitParam || 50));
  let rows = [];
  if (q) {
    const pattern = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.display_name,
               u.last_seen,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE u.id <> $2
          AND (
            username ILIKE $1
            OR display_name ILIKE $1
          )
        ORDER BY display_name ASC, username ASC
        LIMIT $3;
      `,
      [pattern, user.id, searchLimit]
    );
    rows = result.rows || [];
  } else {
    const countResult = await db.query('SELECT COUNT(*)::int AS count FROM app_users;');
    const totalCountRaw = Number(countResult.rows?.[0]?.count || 0);
    const totalCount = Math.max(0, totalCountRaw - 1);
    const cap = 5000;
    const listLimit = totalCount >= cap ? 250 : Math.min(totalCount || 0, cap);
    const result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.display_name,
               u.last_seen,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE u.id <> $1
        ORDER BY u.created_at DESC
        LIMIT $2;
      `,
      [user.id, listLimit]
    );
    rows = result.rows || [];
    sendJson(res, 200, {
      ok: true,
      count: rows.length,
      total: totalCount,
      capped: totalCount >= cap,
      accounts: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        photoDataUrl: row.photo || null,
        lastSeen: row.last_seen || null,
        isOnline: isLastSeenOnline(row.last_seen)
      }))
    });
    return true;
  }

  sendJson(res, 200, {
    ok: true,
    count: rows.length,
    total: rows.length,
    capped: false,
    accounts: rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      photoDataUrl: row.photo || null,
      lastSeen: row.last_seen || null,
      isOnline: isLastSeenOnline(row.last_seen)
    }))
  });
  return true;
}

async function requireOwnerActor(req, res) {
  const actor = await getUserFromRequest(req);
  if (!actor) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return null;
  }
  if (!actor.isOwner) {
    sendJson(res, 403, { ok: false, error: 'OWNER_REQUIRED' });
    return null;
  }
  return actor;
}

async function handleOwnerAccountsList(req, res, url) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;

  const q = String(url.searchParams.get('q') || '').trim();
  const limitParam = Number(url.searchParams.get('limit') || 0);
  const limit = Math.max(1, Math.min(10000, limitParam || 2000));
  const values = [actor.id];
  let whereSql = '';
  if (q) {
    const qIndex = values.push(`%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
    whereSql = `WHERE (u.username ILIKE $${qIndex} OR u.display_name ILIKE $${qIndex} OR u.email ILIKE $${qIndex})`;
  }
  values.push(limit);
  const limitIndex = values.length;

  let result;
  try {
    result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.email,
               u.display_name,
               u.created_at,
               u.last_seen,
               u.last_login,
               p.profile->'profile'->>'photoDataUrl' AS photo,
               tp.onboarding_complete,
               tp.discipline,
               tp.days_per_week,
               tp.updated_at AS training_updated_at,
               plan.id AS active_plan_id,
               plan.updated_at AS active_plan_updated_at,
               (
                 SELECT MAX(m.created_at)
                 FROM app_messages m
                 WHERE m.sender_id = $1
                   AND m.receiver_id = u.id
               ) AS last_owner_message_at,
               (
                 SELECT COUNT(*)::int
                 FROM app_messages m
                 WHERE m.sender_id = $1
                   AND m.receiver_id = u.id
               ) AS owner_message_count
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        LEFT JOIN app_training_profiles tp ON tp.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT id, updated_at
          FROM app_training_plans t
          WHERE t.user_id = u.id
            AND t.active = true
          ORDER BY t.updated_at DESC
          LIMIT 1
        ) AS plan ON true
        ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT $${limitIndex};
      `,
      values
    );
  } catch (err) {
    const code = String(err?.code || '');
    if (code !== '42P01') throw err;
    result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.email,
               u.display_name,
               u.created_at,
               u.last_seen,
               u.last_login,
               p.profile->'profile'->>'photoDataUrl' AS photo,
               NULL::boolean AS onboarding_complete,
               NULL::text AS discipline,
               NULL::int AS days_per_week,
               NULL::timestamptz AS training_updated_at,
               NULL::uuid AS active_plan_id,
               NULL::timestamptz AS active_plan_updated_at,
               (
                 SELECT MAX(m.created_at)
                 FROM app_messages m
                 WHERE m.sender_id = $1
                   AND m.receiver_id = u.id
               ) AS last_owner_message_at,
               (
                 SELECT COUNT(*)::int
                 FROM app_messages m
                 WHERE m.sender_id = $1
                   AND m.receiver_id = u.id
               ) AS owner_message_count
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT $${limitIndex};
      `,
      values
    );
  }

  const accounts = (result.rows || []).map((row) => ({
    id: row.id,
    username: row.username || null,
    email: row.email || null,
    displayName: row.display_name || row.username || 'Account',
    photoDataUrl: row.photo || null,
    createdAt: row.created_at || null,
    lastSeen: row.last_seen || null,
    isOnline: isLastSeenOnline(row.last_seen),
    lastLogin: row.last_login || null,
    onboardingComplete: Boolean(row.onboarding_complete),
    discipline: row.discipline || null,
    daysPerWeek: Number.isFinite(Number(row.days_per_week)) ? Number(row.days_per_week) : null,
    trainingUpdatedAt: row.training_updated_at || null,
    hasActivePlan: Boolean(row.active_plan_id),
    activePlanUpdatedAt: row.active_plan_updated_at || null,
    ownerMessageCount: Number(row.owner_message_count || 0),
    lastOwnerMessageAt: row.last_owner_message_at || null
  }));

  return sendJson(res, 200, { ok: true, count: accounts.length, accounts });
}

async function getUserFromSessionToken(token) {
  const sessionToken = String(token || '').trim();
  if (!sessionToken) return null;
  const tokenHash = sha256Hex(sessionToken);
  const result = await db.query(
    `
      SELECT u.id, u.username, u.email, u.display_name, COALESCE(u.admin_notes, '') AS admin_notes
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
  return {
    id: row.id,
    username: row.username || null,
    email: row.email || null,
    displayName: row.display_name || row.username || 'User',
    isOwner: isOwnerUser(row)
  };
}

async function getOwnerImpersonationContext(req, activeUser) {
  const user = activeUser && typeof activeUser === 'object' ? activeUser : null;
  if (!user?.id) return null;
  const cookies = parseCookies(req.headers.cookie);
  const backupToken = String(cookies[OWNER_BACKUP_COOKIE_NAME] || '').trim();
  if (!backupToken) return null;

  const ownerUser = await getUserFromSessionToken(backupToken);
  if (!ownerUser?.isOwner) return null;
  if (String(ownerUser.id) === String(user.id)) return null;

  return {
    active: true,
    owner: {
      id: ownerUser.id,
      username: ownerUser.username || null,
      displayName: ownerUser.displayName || ownerUser.username || 'Owner'
    },
    viewing: {
      id: user.id,
      username: user.username || null,
      displayName: user.displayName || user.username || 'Account'
    }
  };
}

async function handleOwnerImpersonateStart(req, res, url, targetUserId) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;

  const userId = String(targetUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendJson(res, 400, { ok: false, error: 'Invalid account id' });
  if (userId === actor.id) return sendJson(res, 400, { ok: false, error: 'Choose a different account to view' });

  const target = await db.query('SELECT id FROM app_users WHERE id = $1 LIMIT 1;', [userId]);
  if (!target.rows?.[0]?.id) return sendJson(res, 404, { ok: false, error: 'Account not found' });

  const cookies = parseCookies(req.headers.cookie);
  const ownerToken = String(cookies[COOKIE_NAME] || '').trim();
  if (!ownerToken) return sendJson(res, 401, { ok: false, error: 'No active owner session' });

  const targetToken = await createSession(userId, { updateLogin: false });
  const returnTo = safeReturnTo(url.searchParams.get('returnTo') || '/overview.html');
  const cookieHeaders = [
    setCookieHeader(targetToken, req),
    setNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, ownerToken, req)
  ].filter(Boolean);

  res.writeHead(302, {
    Location: returnTo,
    'Set-Cookie': cookieHeaders
  });
  res.end();
  return true;
}

async function handleOwnerImpersonateExit(req, res, url) {
  const cookies = parseCookies(req.headers.cookie);
  const backupToken = String(cookies[OWNER_BACKUP_COOKIE_NAME] || '').trim();
  const returnTo = safeReturnTo(url.searchParams.get('returnTo') || '/owner-accounts.html');
  if (!backupToken) {
    res.writeHead(302, {
      Location: returnTo,
      'Set-Cookie': clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req)
    });
    res.end();
    return true;
  }

  const backupUser = await getUserFromSessionToken(backupToken);
  if (!backupUser || !backupUser.isOwner) {
    return sendJson(
      res,
      403,
      { ok: false, error: 'Owner backup session is invalid' },
      { 'Set-Cookie': clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req) }
    );
  }

  const currentToken = String(cookies[COOKIE_NAME] || '').trim();
  if (currentToken && currentToken !== backupToken) {
    try {
      await deleteSessionByToken(currentToken);
    } catch {
      // ignore cleanup failure
    }
  }

  res.writeHead(302, {
    Location: returnTo,
    'Set-Cookie': [
      setCookieHeader(backupToken, req),
      clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req)
    ]
  });
  res.end();
  return true;
}

async function handleOwnerAccountDetail(req, res, targetUserId) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;
  const userId = String(targetUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendJson(res, 400, { ok: false, error: 'Invalid account id' });

  const userResult = await db.query(
    `
      SELECT u.id, u.username, u.email, u.display_name, u.created_at, u.last_seen, u.last_login,
             p.profile AS profile_json
      FROM app_users u
      LEFT JOIN app_user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1;
    `,
    [userId]
  );
  const userRow = userResult.rows?.[0];
  if (!userRow) return sendJson(res, 404, { ok: false, error: 'Account not found' });

  let trainingProfile = null;
  try {
    const trainingProfileResult = await db.query(
      `
        SELECT onboarding_complete, discipline, experience, days_per_week, goals, injuries, updated_at
        FROM app_training_profiles
        WHERE user_id = $1
        LIMIT 1;
      `,
      [userId]
    );
    trainingProfile = trainingProfileResult.rows?.[0] || null;
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
  }

  let activePlan = null;
  try {
    const activePlanResult = await db.query(
      `
        SELECT id, discipline, days_per_week, updated_at
        FROM app_training_plans
        WHERE user_id = $1
          AND active = true
        ORDER BY updated_at DESC
        LIMIT 1;
      `,
      [userId]
    );
    activePlan = activePlanResult.rows?.[0] || null;
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
  }

  let workoutStats = { totalLoggedWorkouts: 0, lastWorkoutAt: null };
  if (activePlan?.id) {
    try {
      const logsResult = await db.query(
        `
          SELECT COUNT(*)::int AS total_logged_workouts, MAX(updated_at) AS last_workout_at
          FROM app_training_workouts
          WHERE user_id = $1
            AND plan_id = $2;
        `,
        [userId, activePlan.id]
      );
      workoutStats = {
        totalLoggedWorkouts: Number(logsResult.rows?.[0]?.total_logged_workouts || 0),
        lastWorkoutAt: logsResult.rows?.[0]?.last_workout_at || null
      };
    } catch (err) {
      if (String(err?.code || '') !== '42P01') throw err;
    }
  }

  const ownerMessageStatsResult = await db.query(
    `
      SELECT COUNT(*)::int AS owner_message_count, MAX(created_at) AS last_owner_message_at
      FROM app_messages
      WHERE sender_id = $1
        AND receiver_id = $2;
    `,
    [actor.id, userId]
  );

  return sendJson(res, 200, {
    ok: true,
    account: {
      id: userRow.id,
      username: userRow.username || null,
      email: userRow.email || null,
      displayName: userRow.display_name || userRow.username || 'Account',
      createdAt: userRow.created_at || null,
      lastSeen: userRow.last_seen || null,
      lastLogin: userRow.last_login || null,
      profile: userRow.profile_json && typeof userRow.profile_json === 'object' ? userRow.profile_json : {},
      trainingProfile: trainingProfile ? {
        onboardingComplete: Boolean(trainingProfile.onboarding_complete),
        discipline: trainingProfile.discipline || null,
        experience: trainingProfile.experience || null,
        daysPerWeek: Number.isFinite(Number(trainingProfile.days_per_week)) ? Number(trainingProfile.days_per_week) : null,
        goals: trainingProfile.goals || null,
        injuries: trainingProfile.injuries || null,
        updatedAt: trainingProfile.updated_at || null
      } : null,
      activePlan: activePlan ? {
        id: activePlan.id,
        discipline: activePlan.discipline || null,
        daysPerWeek: Number.isFinite(Number(activePlan.days_per_week)) ? Number(activePlan.days_per_week) : null,
        updatedAt: activePlan.updated_at || null
      } : null,
      workoutStats,
      ownerMessageStats: {
        count: Number(ownerMessageStatsResult.rows?.[0]?.owner_message_count || 0),
        lastAt: ownerMessageStatsResult.rows?.[0]?.last_owner_message_at || null
      }
    }
  });
}

async function handleOwnerAccountPasswordUpdate(req, res, targetUserId) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;
  const userId = String(targetUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendJson(res, 400, { ok: false, error: 'Invalid account id' });

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  const nextPassword = String(payload?.password || '');
  if (!nextPassword || nextPassword.length < 8) return sendJson(res, 400, { ok: false, error: 'Password must be at least 8 characters' });
  if (nextPassword.length > 128) return sendJson(res, 400, { ok: false, error: 'Password is too long' });

  const passwordHash = await bcrypt.hash(nextPassword, 12);
  const updated = await db.query(
    `
      UPDATE app_users
      SET password_hash = $2, auth_provider = 'local'
      WHERE id = $1
      RETURNING id;
    `,
    [userId, passwordHash]
  );
  if (!updated.rows?.[0]?.id) return sendJson(res, 404, { ok: false, error: 'Account not found' });

  // Invalidate all sessions so new password takes effect immediately.
  await db.query('DELETE FROM app_sessions WHERE user_id = $1;', [userId]);
  return sendJson(res, 200, { ok: true });
}

async function handleOwnerAccountDelete(req, res, targetUserId) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;
  const userId = String(targetUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendJson(res, 400, { ok: false, error: 'Invalid account id' });
  if (userId === actor.id) return sendJson(res, 400, { ok: false, error: 'Cannot delete your own owner account' });

  const deleted = await db.query(
    `
      DELETE FROM app_users
      WHERE id = $1
      RETURNING id;
    `,
    [userId]
  );
  if (!deleted.rows?.[0]?.id) return sendJson(res, 404, { ok: false, error: 'Account not found' });
  return sendJson(res, 200, { ok: true });
}

async function ensureSchema(options = {}) {
  if (schemaEnsured) return;
  if (!db.isConfigured()) return;
  const fastFail = options?.fastFail === true;
  if (schemaEnsurePromise) {
    if (!fastFail) return await schemaEnsurePromise;
    throw new DbUnavailableError('Database unavailable while ensuring auth schema', lastSchemaTransientError || null);
  }
  const retryDelays = fastFail ? [] : SCHEMA_RETRY_DELAYS_MS;
  if (schemaTransientBackoffUntil > Date.now()) {
    throw new DbUnavailableError('Database unavailable while ensuring auth schema', lastSchemaTransientError || null);
  }
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
    ,
    `
    CREATE TABLE IF NOT EXISTS app_user_profiles (
      user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      profile jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `
  ];

  schemaEnsurePromise = (async () => {
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        for (const sql of schemaStatements) {
          await db.query(sql);
        }
        schemaEnsured = true;
        schemaTransientBackoffUntil = 0;
        lastSchemaTransientError = null;
        return;
      } catch (err) {
        if (!isTransientPgError(err)) throw err;
        logTransientDbError(err, `ensureSchema:attempt_${attempt + 1}${fastFail ? ':fast' : ''}`);
        if (attempt >= retryDelays.length) {
          lastSchemaTransientError = err;
          schemaTransientBackoffUntil = Date.now() + AUTH_SCHEMA_BACKOFF_MS;
          throw new DbUnavailableError('Database unavailable while ensuring auth schema', err);
        }
        await sleep(retryDelays[attempt]);
      }
    }
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

async function getUserFromRequest(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema({ fastFail: true });

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = sha256Hex(token);

  const result = await db.query(
    `
      SELECT u.id, u.username, u.email, u.display_name
           , COALESCE(u.admin_notes, '') AS admin_notes
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
    displayName: row.display_name,
    isOwner: isOwnerUser(row)
  };
}

async function createSession(userId, options = {}) {
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

  if (options.updateLogin !== false) {
    await db.query('UPDATE app_users SET last_login = now(), last_seen = now() WHERE id = $1;', [userId]);
  }

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
      { user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, isOwner: isOwnerUser(user) } },
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
           , COALESCE(admin_notes, '') AS admin_notes
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
    { user: { id: row.id, username: row.username, email: row.email, displayName: row.display_name, isOwner: isOwnerUser(row) } },
    { 'Set-Cookie': setCookieHeader(token, req) }
  );
}

async function handleLogout(req, res) {
  if (!db.isConfigured()) {
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': [clearCookieHeader(req), clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req)] }
    );
  }
  await ensureSchema();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  try {
    await deleteSessionByToken(token);
  } catch {
    // ignore
  }
  return sendJson(
    res,
    200,
    { ok: true },
    { 'Set-Cookie': [clearCookieHeader(req), clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req)] }
  );
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
    maybeCleanup().catch(() => {});
    const ownerAccountMatch = url.pathname.match(/^\/api\/auth\/owner\/account\/([0-9a-fA-F-]{36})$/);
    const ownerAccountPasswordMatch = url.pathname.match(/^\/api\/auth\/owner\/account\/([0-9a-fA-F-]{36})\/password$/);
    const ownerImpersonateMatch = url.pathname.match(/^\/api\/auth\/owner\/impersonate\/([0-9a-fA-F-]{36})$/);

    if (url.pathname === '/api/auth/google/ready' && req.method === 'GET') {
      const missing = [];
      if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
      if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
      if (!process.env.GOOGLE_REDIRECT_URI) missing.push('GOOGLE_REDIRECT_URI');
      return sendJson(res, 200, { ok: missing.length === 0, missing });
    }

    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      try {
        const user = await getUserFromRequest(req);
        const impersonation = user ? await getOwnerImpersonationContext(req, user) : null;
        sendJson(res, 200, { user, impersonation });
      } catch (err) {
        if (err instanceof DbUnavailableError || isTransientPgError(err)) {
          logTransientDbError(err, `authRoutes:${req.method}:${url.pathname}`);
          sendJson(res, 200, { user: null, impersonation: null, dbUnavailable: true });
          return true;
        }
        throw err;
      }
      return true;
    }

    if (url.pathname === '/api/auth/accounts' && req.method === 'GET') {
      return await handleAccountsList(req, res, url);
    }

    if (url.pathname === '/api/auth/owner/accounts' && req.method === 'GET') {
      return await handleOwnerAccountsList(req, res, url);
    }

    if (ownerAccountMatch && req.method === 'GET') {
      return await handleOwnerAccountDetail(req, res, ownerAccountMatch[1]);
    }

    if (ownerAccountPasswordMatch && req.method === 'PATCH') {
      return await handleOwnerAccountPasswordUpdate(req, res, ownerAccountPasswordMatch[1]);
    }

    if (ownerAccountMatch && req.method === 'DELETE') {
      return await handleOwnerAccountDelete(req, res, ownerAccountMatch[1]);
    }

    if (ownerImpersonateMatch && req.method === 'GET') {
      return await handleOwnerImpersonateStart(req, res, url, ownerImpersonateMatch[1]);
    }

    if (url.pathname === '/api/auth/owner/impersonation/exit' && req.method === 'GET') {
      return await handleOwnerImpersonateExit(req, res, url);
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
