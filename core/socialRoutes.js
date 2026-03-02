const crypto = require('crypto');
const db = require('./db');
const { DbUnavailableError, isTransientPgError } = require('./dbErrors');

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const SCHEMA_RETRY_DELAYS_MS = [200, 600, 1400];
let schemaEnsured = false;
let schemaEnsurePromise = null;
const CACHE_TTL_MS = 30000;
const friendsCache = new Map();
const friendRequestsCache = new Map();
const warningsCache = new Map();

function getCache(map, key) {
  const cached = map.get(key);
  if (!cached) return null;
  if (Date.now() - cached.at > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return cached.value;
}

function setCache(map, key, value) {
  map.set(key, { at: Date.now(), value });
}

function clearCachesForUser(userId) {
  if (!userId) return;
  friendsCache.delete(userId);
  friendRequestsCache.delete(userId);
  warningsCache.delete(userId);
}

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

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isUuid(input) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(input || '').trim());
}

function normalizeBody(input, maxLen) {
  const s = String(input || '').trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function daysBetweenIso(aIso, bIso) {
  if (!aIso || !bIso) return null;
  const a = new Date(`${String(aIso).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(bIso).slice(0, 10)}T00:00:00Z`);
  const ta = a.getTime();
  const tb = b.getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.floor((tb - ta) / (24 * 60 * 60 * 1000));
}

function parseGoalMode(profile) {
  const raw = String(profile?.nutrition?.goalMode || profile?.training_intake?.goal || '').toLowerCase();
  if (raw.includes('cut')) return 'cut';
  if (raw.includes('build') || raw.includes('bulk')) return 'bulk';
  if (raw.includes('recomp')) return 'recomp';
  return null;
}

function parsePhaseRate(rateRaw, weightLb) {
  const raw = String(rateRaw || '').toLowerCase().trim();
  if (!raw) return null;
  if (raw.includes('lb/week')) {
    const n = parseFloat(raw.replace('lb/week', '').trim());
    return Number.isFinite(n) ? n : null;
  }
  if (raw.includes('%')) {
    const n = parseFloat(raw.replace('%', '').trim());
    if (!Number.isFinite(n) || !Number.isFinite(weightLb)) return null;
    return (n / 100) * weightLb;
  }
  return null;
}

function orderPair(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.localeCompare(right) <= 0) return [left, right];
  return [right, left];
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (!db.isConfigured()) return;
  if (schemaEnsurePromise) return schemaEnsurePromise;

  schemaEnsurePromise = (async () => {
    for (let attempt = 0; attempt <= SCHEMA_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

        await db.query(`
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
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS app_sessions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            session_token_hash text UNIQUE NOT NULL,
            user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL
          );
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);');
        await db.query('CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at);');

        await db.query(`
          CREATE TABLE IF NOT EXISTS app_user_profiles (
            user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            profile jsonb NOT NULL DEFAULT '{}'::jsonb
          );
        `);

        await db.query(`
          CREATE TABLE IF NOT EXISTS app_friend_requests (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            from_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            to_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            status text NOT NULL DEFAULT 'pending',
            responded_at timestamptz
          );
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status ON app_friend_requests(to_user_id, status, created_at);');
        await db.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_requests_pending ON app_friend_requests(from_user_id, to_user_id) WHERE status = \'pending\';');

        await db.query(`
          CREATE TABLE IF NOT EXISTS app_friends (
            user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            friend_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, friend_id)
          );
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_friends_user_id ON app_friends(user_id);');

        await db.query(`
          CREATE TABLE IF NOT EXISTS app_message_threads (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            last_message_at timestamptz,
            last_message_text text,
            user_a uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            user_b uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE
          );
        `);
        await db.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_message_threads_pair ON app_message_threads(user_a, user_b);');

        await db.query(`
          CREATE TABLE IF NOT EXISTS app_messages (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            thread_id uuid NOT NULL REFERENCES app_message_threads(id) ON DELETE CASCADE,
            sender_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            receiver_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            body text NOT NULL DEFAULT '',
            created_at timestamptz NOT NULL DEFAULT now()
          );
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON app_messages(thread_id, created_at);');

        schemaEnsured = true;
        return;
      } catch (err) {
        const transient = err instanceof DbUnavailableError || isTransientPgError(err) || isTransientPgError(err?.cause);
        if (!transient) throw err;
        if (attempt >= SCHEMA_RETRY_DELAYS_MS.length) {
          throw (err instanceof DbUnavailableError ? err : new DbUnavailableError('Database unavailable while ensuring social schema', err));
        }
        await sleep(SCHEMA_RETRY_DELAYS_MS[attempt]);
      }
    }
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return schemaEnsurePromise;
}

async function resolveUserFromSession(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const result = await db.query(
    `
      SELECT u.id, u.username, u.display_name
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
  return { id: row.id, username: row.username, displayName: row.display_name };
}

async function socialRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/friends') && !url.pathname.startsWith('/api/messages')) return false;
  if (!db.isConfigured()) return sendJson(res, 501, { ok: false, error: 'Database not configured' });
  await ensureSchema();

  const user = await resolveUserFromSession(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'Not authenticated' });

  if (url.pathname === '/api/friends/list' && req.method === 'GET') {
    const cached = getCache(friendsCache, user.id);
    if (cached) return sendJson(res, 200, cached);
    const result = await db.query(
      `
        SELECT f.friend_id AS id,
               u.username,
               u.display_name,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_friends f
        JOIN app_users u ON u.id = f.friend_id
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE f.user_id = $1
        ORDER BY u.display_name ASC, u.username ASC;
      `,
      [user.id]
    );
    const payload = {
      ok: true,
      friends: (result.rows || []).map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        photoDataUrl: row.photo || null
      }))
    };
    setCache(friendsCache, user.id, payload);
    return sendJson(res, 200, payload);
  }

  if (url.pathname === '/api/friends/warnings' && req.method === 'GET') {
    const cached = getCache(warningsCache, user.id);
    if (cached) return sendJson(res, 200, cached);
    try {
      const friendResult = await db.query(
      `
        SELECT f.friend_id AS id,
               u.username,
               u.display_name,
               p.profile->'profile'->>'photoDataUrl' AS photo,
               p.profile AS profile_json,
               tp.eval_weight_lb,
               tp.eval_weight_at,
               tp.last_weighin_lb,
               tp.last_weighin_at,
               tp.experience,
               pl.id AS plan_id,
               pl.days_per_week
        FROM app_friends f
        JOIN app_users u ON u.id = f.friend_id
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        LEFT JOIN app_training_profiles tp ON tp.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT id, days_per_week
          FROM app_training_plans
          WHERE user_id = u.id AND active = true
          ORDER BY updated_at DESC
          LIMIT 1
        ) pl ON true
        WHERE f.user_id = $1
        ORDER BY u.display_name ASC, u.username ASC;
      `,
      [user.id]
      );

      const friends = friendResult.rows || [];
      if (!friends.length) {
        const payload = { ok: true, warnings: [], status: 'You have no friends — you’re lonely. Go add some people.' };
        setCache(warningsCache, user.id, payload);
        return sendJson(res, 200, payload);
      }

      const warnings = [];
      const sinceDate = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000));
      const sinceIso = sinceDate.toISOString().slice(0, 10);
      const sinceTs = sinceDate.toISOString();

      const friendIds = friends.map((f) => f.id).filter(Boolean);
      const logsByUser = new Map();
      if (friendIds.length) {
        const logsRes = await db.query(
          `
            SELECT user_id, performed_at, updated_at, entries
            FROM app_training_workouts
            WHERE user_id = ANY($1)
              AND (performed_at >= $2 OR updated_at >= $3);
          `,
          [friendIds, sinceIso, sinceTs]
        );
        (logsRes.rows || []).forEach((row) => {
          const key = String(row.user_id);
          const list = logsByUser.get(key) || [];
          list.push(row);
          logsByUser.set(key, list);
        });
      }

      for (const friend of friends) {
        const profile = friend.profile_json || {};
        const goalMode = parseGoalMode(profile);
        const lastWeighinAt = friend.last_weighin_at ? String(friend.last_weighin_at).slice(0, 10) : null;
        const lastWeighinLb = friend.last_weighin_lb != null ? Number(friend.last_weighin_lb) : null;
        const evalWeightAt = friend.eval_weight_at ? String(friend.eval_weight_at).slice(0, 10) : null;
        const evalWeightLb = friend.eval_weight_lb != null ? Number(friend.eval_weight_lb) : null;

        const rateRaw = profile?.nutrition?.phaseRate || profile?.training_intake?.phaseRate || '';
        const baselineWeight = Number.isFinite(evalWeightLb) ? evalWeightLb : (Number.isFinite(lastWeighinLb) ? lastWeighinLb : null);
        const parsedRate = parsePhaseRate(rateRaw, baselineWeight);
        const targetPerWeek = (() => {
          if (goalMode === 'cut') return Number.isFinite(parsedRate) ? parsedRate : 1.0;
          if (goalMode === 'bulk') return Number.isFinite(parsedRate) ? -Math.abs(parsedRate) : -0.5;
          if (goalMode === 'recomp') return 0;
          return null;
        })();

        const daysSinceWeighin = daysBetweenIso(lastWeighinAt, new Date().toISOString().slice(0, 10));
        if (daysSinceWeighin != null && daysSinceWeighin >= 14) {
          warnings.push({
            friendId: friend.id,
            username: friend.username,
            displayName: friend.display_name,
            photoDataUrl: friend.photo || null,
            severity: 'med',
            type: 'weight',
            message: `Contact @${friend.username || 'friend'}: missed weigh-in for 14+ days.`
          });
        }

        const daysSinceBaseline = daysBetweenIso(evalWeightAt, new Date().toISOString().slice(0, 10));
        if (Number.isFinite(lastWeighinLb) && Number.isFinite(evalWeightLb) && daysSinceBaseline != null && daysSinceBaseline >= 14 && Number.isFinite(targetPerWeek) && goalMode && goalMode !== 'recomp') {
          const projected = evalWeightLb - (targetPerWeek * (daysSinceBaseline / 7));
          const delta = lastWeighinLb - projected;
          const offTrackThreshold = 8;
          if (goalMode === 'cut' && delta > offTrackThreshold) {
            warnings.push({
              friendId: friend.id,
              username: friend.username,
              displayName: friend.display_name,
              photoDataUrl: friend.photo || null,
              severity: 'high',
              type: 'weight',
              message: `Contact @${friend.username || 'friend'}: expected ~${Math.round(projected)} lb, last weigh-in ${Math.round(lastWeighinLb)} lb.`
            });
          }
          if (goalMode === 'bulk' && delta < -offTrackThreshold) {
            warnings.push({
              friendId: friend.id,
              username: friend.username,
              displayName: friend.display_name,
              photoDataUrl: friend.photo || null,
              severity: 'high',
              type: 'weight',
              message: `Contact @${friend.username || 'friend'}: expected ~${Math.round(projected)} lb, last weigh-in ${Math.round(lastWeighinLb)} lb.`
            });
          }
        }

        if (friend.plan_id) {
          const logs = logsByUser.get(String(friend.id)) || [];
          const expected = Number(friend.days_per_week || 0) * 2;
          if (expected >= 2 && logs.length < Math.max(1, Math.round(expected * 0.4))) {
            warnings.push({
              friendId: friend.id,
              username: friend.username,
              displayName: friend.display_name,
              photoDataUrl: friend.photo || null,
              severity: 'med',
              type: 'workout',
              message: `Contact @${friend.username || 'friend'}: ${logs.length} of ${expected} sessions logged in the last 14 days.`
            });
          }

          let suspicious = false;
          for (const log of logs) {
            const entries = Array.isArray(log.entries) ? log.entries : [];
            let prescribedTotal = 0;
            let loggedTotal = 0;
            entries.forEach((entry) => {
              const pres = Number(entry?.prescribed?.sets);
              if (Number.isFinite(pres)) prescribedTotal += pres;
              const sets = Array.isArray(entry?.sets) ? entry.sets : [];
              sets.forEach((set) => {
                if (Number.isFinite(Number(set?.weight)) || Number.isFinite(Number(set?.reps))) loggedTotal += 1;
              });
            });
            if (prescribedTotal >= 8 && loggedTotal <= Math.max(2, Math.round(prescribedTotal * 0.35))) {
              suspicious = true;
              break;
            }
            if (prescribedTotal === 0 && loggedTotal <= 1 && entries.length) {
              suspicious = true;
              break;
            }
          }
          if (suspicious) {
            warnings.push({
              friendId: friend.id,
              username: friend.username,
              displayName: friend.display_name,
              photoDataUrl: friend.photo || null,
              severity: 'high',
              type: 'workout',
              message: `Contact @${friend.username || 'friend'}: workout logs look incomplete vs projected volume.`
            });
          }
        }
      }

      const payload = {
        ok: true,
        warnings,
        status: warnings.length ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'No warnings right now.'
      };
      setCache(warningsCache, user.id, payload);
      return sendJson(res, 200, payload);
    } catch {
      const payload = { ok: true, warnings: [], status: 'No warnings right now.' };
      setCache(warningsCache, user.id, payload);
      return sendJson(res, 200, payload);
    }
  }

  if (url.pathname === '/api/friends/request' && req.method === 'POST') {
    let payload;
    try {
      payload = await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(err);
          }
        });
      });
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
    }
    const targetUserId = String(payload?.targetUserId || '').trim();
    if (!isUuid(targetUserId)) return sendJson(res, 400, { ok: false, error: 'Invalid account.' });
    if (targetUserId === user.id) return sendJson(res, 400, { ok: false, error: 'Cannot add yourself.' });

    const friendCheck = await db.query(
      'SELECT 1 FROM app_friends WHERE user_id = $1 AND friend_id = $2 LIMIT 1;',
      [user.id, targetUserId]
    );
    if (friendCheck.rows?.length) return sendJson(res, 200, { ok: true, alreadyFriends: true });

    await db.query(
      `
        INSERT INTO app_friend_requests (from_user_id, to_user_id, status)
        VALUES ($1, $2, 'pending')
        ON CONFLICT ON CONSTRAINT uq_friend_requests_pending
        DO UPDATE SET updated_at = now(), status = 'pending', responded_at = null;
      `,
      [user.id, targetUserId]
    );
    clearCachesForUser(user.id);
    clearCachesForUser(targetUserId);
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/friends/requests' && req.method === 'GET') {
    const cached = getCache(friendRequestsCache, user.id);
    if (cached) return sendJson(res, 200, cached);
    const result = await db.query(
      `
        SELECT r.id,
               r.created_at,
               u.id AS from_user_id,
               u.username,
               u.display_name,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_friend_requests r
        JOIN app_users u ON u.id = r.from_user_id
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE r.to_user_id = $1 AND r.status = 'pending'
        ORDER BY r.created_at DESC
        LIMIT 200;
      `,
      [user.id]
    );
    const payload = {
      ok: true,
      requests: (result.rows || []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        fromUserId: row.from_user_id,
        username: row.username,
        displayName: row.display_name || row.username || 'Account',
        photoDataUrl: row.photo || null
      }))
    };
    setCache(friendRequestsCache, user.id, payload);
    return sendJson(res, 200, payload);
  }

  if (url.pathname === '/api/friends/respond' && req.method === 'POST') {
    let payload;
    try {
      payload = await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(err);
          }
        });
      });
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
    }
    const requestId = String(payload?.requestId || '').trim();
    const action = String(payload?.action || '').trim().toLowerCase();
    if (!isUuid(requestId)) return sendJson(res, 400, { ok: false, error: 'Invalid request.' });
    if (!['accept', 'reject'].includes(action)) return sendJson(res, 400, { ok: false, error: 'Invalid action.' });

    const reqRow = await db.query(
      `
        SELECT id, from_user_id
        FROM app_friend_requests
        WHERE id = $1 AND to_user_id = $2 AND status = 'pending'
        LIMIT 1;
      `,
      [requestId, user.id]
    );
    const row = reqRow.rows?.[0];
    if (!row) return sendJson(res, 404, { ok: false, error: 'Request not found.' });

    if (action === 'reject') {
      await db.query(
        'UPDATE app_friend_requests SET status = $1, responded_at = now(), updated_at = now() WHERE id = $2;',
        ['rejected', requestId]
      );
      clearCachesForUser(user.id);
      clearCachesForUser(row.from_user_id);
      return sendJson(res, 200, { ok: true });
    }

    await db.query(
      'UPDATE app_friend_requests SET status = $1, responded_at = now(), updated_at = now() WHERE id = $2;',
      ['accepted', requestId]
    );
    await db.query(
      `
        INSERT INTO app_friends (user_id, friend_id)
        VALUES ($1, $2), ($2, $1)
        ON CONFLICT DO NOTHING;
      `,
      [user.id, row.from_user_id]
    );
    clearCachesForUser(user.id);
    clearCachesForUser(row.from_user_id);
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/messages/threads' && req.method === 'GET') {
    const result = await db.query(
      `
        SELECT t.id,
               t.last_message_at,
               t.last_message_text,
               CASE WHEN t.user_a = $1 THEN t.user_b ELSE t.user_a END AS friend_id,
               u.username,
               u.display_name,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_message_threads t
        JOIN app_users u ON u.id = CASE WHEN t.user_a = $1 THEN t.user_b ELSE t.user_a END
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE t.user_a = $1 OR t.user_b = $1
        ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC
        LIMIT 200;
      `,
      [user.id]
    );
    return sendJson(res, 200, {
      ok: true,
      threads: (result.rows || []).map((row) => ({
        threadId: row.id,
        friendId: row.friend_id,
        username: row.username,
        displayName: row.display_name || row.username || 'Account',
        photoDataUrl: row.photo || null,
        lastMessage: row.last_message_text || null,
        lastMessageAt: row.last_message_at
      }))
    });
  }

  if (url.pathname === '/api/messages/thread' && req.method === 'GET') {
    const friendId = String(url.searchParams.get('friendId') || '').trim();
    if (!isUuid(friendId)) return sendJson(res, 400, { ok: false, error: 'Invalid friend.' });
    const friendCheck = await db.query(
      'SELECT 1 FROM app_friends WHERE user_id = $1 AND friend_id = $2 LIMIT 1;',
      [user.id, friendId]
    );
    if (!friendCheck.rows?.length) return sendJson(res, 403, { ok: false, error: 'Not friends yet.' });

    const [a, b] = orderPair(user.id, friendId);
    const threadRow = await db.query(
      'SELECT id FROM app_message_threads WHERE user_a = $1 AND user_b = $2 LIMIT 1;',
      [a, b]
    );
    const threadId = threadRow.rows?.[0]?.id || null;
    let messages = [];
    if (threadId) {
      const msgRows = await db.query(
        `
          SELECT id, sender_id, receiver_id, body, created_at
          FROM app_messages
          WHERE thread_id = $1
          ORDER BY created_at ASC
          LIMIT 200;
        `,
        [threadId]
      );
      messages = (msgRows.rows || []).map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        receiverId: row.receiver_id,
        body: row.body,
        createdAt: row.created_at
      }));
    }

    const friendRow = await db.query(
      'SELECT display_name, username FROM app_users WHERE id = $1 LIMIT 1;',
      [friendId]
    );
    const friendName = friendRow.rows?.[0]?.display_name || friendRow.rows?.[0]?.username || 'Conversation';

    return sendJson(res, 200, { ok: true, friendName, messages });
  }

  if (url.pathname === '/api/messages/send' && req.method === 'POST') {
    let payload;
    try {
      payload = await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(err);
          }
        });
      });
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
    }
    const toUserId = String(payload?.toUserId || '').trim();
    const body = normalizeBody(payload?.body, 2000);
    if (!isUuid(toUserId)) return sendJson(res, 400, { ok: false, error: 'Invalid recipient.' });
    if (!body) return sendJson(res, 400, { ok: false, error: 'Message is empty.' });
    if (toUserId === user.id) return sendJson(res, 400, { ok: false, error: 'Cannot message yourself.' });

    const friendCheck = await db.query(
      'SELECT 1 FROM app_friends WHERE user_id = $1 AND friend_id = $2 LIMIT 1;',
      [user.id, toUserId]
    );
    if (!friendCheck.rows?.length) return sendJson(res, 403, { ok: false, error: 'Not friends yet.' });

    const [a, b] = orderPair(user.id, toUserId);
    let threadId = null;
    const existing = await db.query(
      'SELECT id FROM app_message_threads WHERE user_a = $1 AND user_b = $2 LIMIT 1;',
      [a, b]
    );
    if (existing.rows?.[0]?.id) {
      threadId = existing.rows[0].id;
    } else {
      const inserted = await db.query(
        `
          INSERT INTO app_message_threads (user_a, user_b, last_message_at, last_message_text)
          VALUES ($1, $2, now(), $3)
          RETURNING id;
        `,
        [a, b, body]
      );
      threadId = inserted.rows?.[0]?.id || null;
    }

    if (!threadId) return sendJson(res, 500, { ok: false, error: 'Could not create thread.' });

    await db.query(
      `
        INSERT INTO app_messages (thread_id, sender_id, receiver_id, body)
        VALUES ($1, $2, $3, $4);
      `,
      [threadId, user.id, toUserId, body]
    );
    await db.query(
      'UPDATE app_message_threads SET last_message_at = now(), last_message_text = $1 WHERE id = $2;',
      [body, threadId]
    );

    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

module.exports = socialRoutes;
