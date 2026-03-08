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
const ONLINE_WINDOW_MS = Math.max(30_000, Number(process.env.ONLINE_WINDOW_MS || 180_000));

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

async function touchUserLastSeen(userId) {
  const id = String(userId || '').trim();
  if (!id) return;
  try {
    await db.query(
      `
        UPDATE app_users
        SET last_seen = now()
        WHERE id = $1
          AND (last_seen IS NULL OR last_seen < now() - interval '30 seconds');
      `,
      [id]
    );
  } catch {
    // ignore best-effort presence update
  }
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

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', () => reject(new Error('Invalid request body')));
  });
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

function normalizeDataUrlImage(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!s.startsWith('data:image/')) return null;
  if (s.length > 1_000_000) return null;
  return s;
}

function normalizeGroupName(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  return s.slice(0, 80);
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

function parseGoalWeightLb(profile) {
  const candidates = [
    profile?.nutrition?.goalWeightLbs,
    profile?.nutrition?.goalWeightLb,
    profile?.nutrition?.goal_weight_lb,
    profile?.nutrition?.targetWeightLbs,
    profile?.nutrition?.targetWeightLb,
    profile?.training_intake?.goalWeightLbs,
    profile?.training_intake?.goalWeightLb,
    profile?.training_intake?.goal_weight_lb,
    profile?.training_intake?.targetWeightLbs,
    profile?.training_intake?.targetWeightLb
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n < 60 || n > 800) continue;
    return n;
  }
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
        await db.query(`ALTER TABLE app_messages ADD COLUMN IF NOT EXISTS thread_id uuid;`);
        await db.query(`ALTER TABLE app_messages ADD COLUMN IF NOT EXISTS sender_id uuid;`);
        await db.query(`ALTER TABLE app_messages ADD COLUMN IF NOT EXISTS receiver_id uuid;`);
        await db.query(`ALTER TABLE app_messages ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';`);
        await db.query(`ALTER TABLE app_messages ADD COLUMN IF NOT EXISTS image_data_url text NOT NULL DEFAULT '';`);
        await db.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_thread') THEN
              ALTER TABLE app_messages
                ADD CONSTRAINT fk_messages_thread FOREIGN KEY (thread_id) REFERENCES app_message_threads(id) ON DELETE CASCADE;
            END IF;
          END $$;
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON app_messages(thread_id, created_at);');

        await db.query(`
          CREATE TABLE IF NOT EXISTS app_message_groups (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            leader_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            name text NOT NULL,
            archived boolean NOT NULL DEFAULT false
          );
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_message_groups_leader ON app_message_groups(leader_user_id, created_at DESC);');

        await db.query(`
          CREATE TABLE IF NOT EXISTS app_message_group_members (
            group_id uuid NOT NULL REFERENCES app_message_groups(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            role text NOT NULL DEFAULT 'member',
            joined_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (group_id, user_id)
          );
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_message_group_members_user ON app_message_group_members(user_id, joined_at DESC);');

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
           , u.email
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
  await touchUserLastSeen(row.id);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email || null,
    isOwner: isOwnerUser(row)
  };
}

async function createMessageGroupForLeader(leaderUserId, groupName, memberIds) {
  const leaderId = String(leaderUserId || '').trim();
  const name = normalizeGroupName(groupName);
  if (!isUuid(leaderId)) return { ok: false, status: 400, error: 'Invalid leader account.' };
  if (!name) return { ok: false, status: 400, error: 'Group name is required.' };

  const uniqueMembers = Array.from(new Set(
    (Array.isArray(memberIds) ? memberIds : [])
      .map((id) => String(id || '').trim())
      .filter((id) => isUuid(id) && id !== leaderId)
  ));
  if (!uniqueMembers.length) return { ok: false, status: 400, error: 'Select at least one friend.' };

  const validFriends = await db.query(
    `
      SELECT friend_id
      FROM app_friends
      WHERE user_id = $1
        AND friend_id = ANY($2::uuid[]);
    `,
    [leaderId, uniqueMembers]
  );
  const allowed = new Set((validFriends.rows || []).map((row) => String(row.friend_id || '')));
  const invalid = uniqueMembers.find((id) => !allowed.has(id));
  if (invalid) return { ok: false, status: 400, error: 'Group members must be current friends of the group leader.' };

  let groupId = null;
  try {
    await db.query('BEGIN');
    const inserted = await db.query(
      `
        INSERT INTO app_message_groups (leader_user_id, name)
        VALUES ($1, $2)
        RETURNING id;
      `,
      [leaderId, name]
    );
    groupId = String(inserted.rows?.[0]?.id || '').trim();
    if (!isUuid(groupId)) {
      await db.query('ROLLBACK');
      return { ok: false, status: 500, error: 'Failed to create group.' };
    }

    await db.query(
      `
        INSERT INTO app_message_group_members (group_id, user_id, role)
        VALUES ($1, $2, 'leader')
        ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role;
      `,
      [groupId, leaderId]
    );

    if (uniqueMembers.length) {
      await db.query(
        `
          INSERT INTO app_message_group_members (group_id, user_id, role)
          SELECT $1, x::uuid, 'member'
          FROM unnest($2::text[]) AS x
          ON CONFLICT (group_id, user_id) DO NOTHING;
        `,
        [groupId, uniqueMembers]
      );
    }

    await db.query('COMMIT');
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    return { ok: false, status: 500, error: 'Failed to create group.' };
  }

  return {
    ok: true,
    group: {
      id: groupId,
      name,
      leaderUserId: leaderId,
      memberCount: uniqueMembers.length + 1
    }
  };
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
               u.phone,
               u.last_seen,
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
        phone: row.phone || null,
        photoDataUrl: row.photo || null,
        lastSeen: row.last_seen || null,
        isOnline: isLastSeenOnline(row.last_seen)
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
               u.email,
               u.phone,
               u.last_seen,
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
        const goalWeightLb = parseGoalWeightLb(profile);
        const currentWeightLb = Number.isFinite(lastWeighinLb)
          ? lastWeighinLb
          : (Number.isFinite(evalWeightLb) ? evalWeightLb : null);
        const friendLastSeen = friend.last_seen || null;
        const friendIsOnline = isLastSeenOnline(friendLastSeen);
        const friendEmail = String(friend.email || '').trim() || null;
        const friendPhone = String(friend.phone || '').trim() || null;
        const buildWarning = ({ severity = 'med', type = 'weight', message = '' } = {}) => ({
          friendId: friend.id,
          username: friend.username,
          displayName: friend.display_name,
          email: friendEmail,
          phone: friendPhone,
          photoDataUrl: friend.photo || null,
          lastSeen: friendLastSeen,
          isOnline: friendIsOnline,
          goalMode,
          goalWeightLb: Number.isFinite(goalWeightLb) ? goalWeightLb : null,
          currentWeightLb: Number.isFinite(currentWeightLb) ? currentWeightLb : null,
          severity,
          type,
          message
        });

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
          warnings.push(buildWarning({
            severity: 'med',
            type: 'weight',
            message: `Contact @${friend.username || 'friend'}: missed weigh-in for 14+ days.`
          }));
        }

        const daysSinceBaseline = daysBetweenIso(evalWeightAt, new Date().toISOString().slice(0, 10));
        if (Number.isFinite(lastWeighinLb) && Number.isFinite(evalWeightLb) && daysSinceBaseline != null && daysSinceBaseline >= 14 && Number.isFinite(targetPerWeek) && goalMode && goalMode !== 'recomp') {
          const projected = evalWeightLb - (targetPerWeek * (daysSinceBaseline / 7));
          const delta = lastWeighinLb - projected;
          const offTrackThreshold = 8;
          if (goalMode === 'cut' && delta > offTrackThreshold) {
            warnings.push(buildWarning({
              severity: 'high',
              type: 'weight',
              message: `Contact @${friend.username || 'friend'}: expected ~${Math.round(projected)} lb, last weigh-in ${Math.round(lastWeighinLb)} lb.`
            }));
          }
          if (goalMode === 'bulk' && delta < -offTrackThreshold) {
            warnings.push(buildWarning({
              severity: 'high',
              type: 'weight',
              message: `Contact @${friend.username || 'friend'}: expected ~${Math.round(projected)} lb, last weigh-in ${Math.round(lastWeighinLb)} lb.`
            }));
          }
        }

        if (friend.plan_id) {
          const logs = logsByUser.get(String(friend.id)) || [];
          const expected = Number(friend.days_per_week || 0) * 2;
          if (expected >= 2 && logs.length < Math.max(1, Math.round(expected * 0.4))) {
            warnings.push(buildWarning({
              severity: 'med',
              type: 'workout',
              message: `Contact @${friend.username || 'friend'}: ${logs.length} of ${expected} sessions logged in the last 14 days.`
            }));
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
            warnings.push(buildWarning({
              severity: 'high',
              type: 'workout',
              message: `Contact @${friend.username || 'friend'}: workout logs look incomplete vs projected volume.`
            }));
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
        ON CONFLICT (from_user_id, to_user_id) WHERE (status = 'pending')
        DO UPDATE SET updated_at = now(), status = 'pending', responded_at = null;
      `,
      [user.id, targetUserId]
    );
    clearCachesForUser(user.id);
    clearCachesForUser(targetUserId);
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/friends/requests' && req.method === 'GET') {
    const forceFresh = String(url.searchParams.get('fresh') || '').trim() === '1';
    if (!forceFresh) {
      const cached = getCache(friendRequestsCache, user.id);
      if (cached) return sendJson(res, 200, cached);
    }
    const result = await db.query(
      `
        SELECT r.id,
               r.created_at,
               u.id AS from_user_id,
               u.username,
               u.display_name,
               u.last_seen,
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
        photoDataUrl: row.photo || null,
        lastSeen: row.last_seen || null,
        isOnline: isLastSeenOnline(row.last_seen)
      }))
    };
    if (!forceFresh) setCache(friendRequestsCache, user.id, payload);
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
          SELECT id, sender_id, receiver_id, body, image_data_url, created_at
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
        imageDataUrl: String(row.image_data_url || ''),
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
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err?.message || 'Invalid JSON' });
    }
    const toUserId = String(payload?.toUserId || '').trim();
    const body = normalizeBody(payload?.body, 2000);
    const imageDataUrl = normalizeDataUrlImage(payload?.imageDataUrl);
    if (!isUuid(toUserId)) return sendJson(res, 400, { ok: false, error: 'Invalid recipient.' });
    if (!body && !imageDataUrl) return sendJson(res, 400, { ok: false, error: 'Message is empty.' });
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
        INSERT INTO app_messages (thread_id, sender_id, receiver_id, body, image_data_url)
        VALUES ($1, $2, $3, $4, $5);
      `,
      [threadId, user.id, toUserId, body || '', imageDataUrl || '']
    );
    const previewText = body || '[Image]';
    await db.query(
      'UPDATE app_message_threads SET last_message_at = now(), last_message_text = $1 WHERE id = $2;',
      [previewText, threadId]
    );

    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/messages/groups/friends' && req.method === 'GET') {
    const result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.display_name,
               u.last_seen,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_friends f
        JOIN app_users u ON u.id = f.friend_id
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE f.user_id = $1
        ORDER BY u.display_name ASC, u.username ASC
        LIMIT 300;
      `,
      [user.id]
    );
    return sendJson(res, 200, {
      ok: true,
      friends: (result.rows || []).map((row) => ({
        id: row.id,
        username: row.username || null,
        displayName: row.display_name || row.username || 'Account',
        photoDataUrl: row.photo || null,
        lastSeen: row.last_seen || null,
        isOnline: isLastSeenOnline(row.last_seen)
      }))
    });
  }

  if (url.pathname === '/api/messages/groups/create' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err?.message || 'Invalid JSON' });
    }
    const created = await createMessageGroupForLeader(
      user.id,
      payload?.name,
      payload?.memberIds
    );
    if (!created.ok) return sendJson(res, created.status || 400, { ok: false, error: created.error || 'Failed to create group.' });
    return sendJson(res, 200, { ok: true, group: created.group });
  }

  if (url.pathname === '/api/messages/owner/accounts' && req.method === 'GET') {
    if (!user.isOwner) return sendJson(res, 403, { ok: false, error: 'Owner access required.' });
    const q = normalizeBody(url.searchParams.get('q'), 120);
    const limit = Math.max(1, Math.min(2000, Number(url.searchParams.get('limit') || 500)));
    const values = [user.id];
    let whereSql = 'WHERE u.id <> $1';
    if (q) {
      values.push(`%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
      whereSql += ' AND (u.username ILIKE $2 OR u.display_name ILIKE $2 OR u.email ILIKE $2)';
    }
    values.push(limit);
    const limitIdx = values.length;

    const result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.display_name,
               u.email,
               u.created_at,
               p.profile->'profile'->>'photoDataUrl' AS photo,
               t.last_message_at,
               t.last_message_text,
               (
                 SELECT COUNT(*)::int
                 FROM app_messages m
                 WHERE (m.sender_id = $1 AND m.receiver_id = u.id)
                    OR (m.sender_id = u.id AND m.receiver_id = $1)
               ) AS message_count
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT last_message_at, last_message_text
          FROM app_message_threads mt
          WHERE (mt.user_a = $1 AND mt.user_b = u.id)
             OR (mt.user_a = u.id AND mt.user_b = $1)
          LIMIT 1
        ) t ON true
        ${whereSql}
        ORDER BY COALESCE(t.last_message_at, u.created_at) DESC
        LIMIT $${limitIdx};
      `,
      values
    );

    return sendJson(res, 200, {
      ok: true,
      count: Number(result.rows?.length || 0),
      accounts: (result.rows || []).map((row) => ({
        id: row.id,
        username: row.username || null,
        displayName: row.display_name || row.username || 'Account',
        email: row.email || null,
        photoDataUrl: row.photo || null,
        createdAt: row.created_at || null,
        lastMessageAt: row.last_message_at || null,
        lastMessageText: row.last_message_text || null,
        messageCount: Number(row.message_count || 0)
      }))
    });
  }

  if (url.pathname === '/api/messages/owner/friends' && req.method === 'GET') {
    if (!user.isOwner) return sendJson(res, 403, { ok: false, error: 'Owner access required.' });
    const leaderUserId = String(url.searchParams.get('userId') || '').trim();
    if (!isUuid(leaderUserId)) return sendJson(res, 400, { ok: false, error: 'Invalid account.' });
    const result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.display_name,
               u.last_seen,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_friends f
        JOIN app_users u ON u.id = f.friend_id
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE f.user_id = $1
        ORDER BY u.display_name ASC, u.username ASC
        LIMIT 300;
      `,
      [leaderUserId]
    );
    return sendJson(res, 200, {
      ok: true,
      friends: (result.rows || []).map((row) => ({
        id: row.id,
        username: row.username || null,
        displayName: row.display_name || row.username || 'Account',
        photoDataUrl: row.photo || null,
        lastSeen: row.last_seen || null,
        isOnline: isLastSeenOnline(row.last_seen)
      }))
    });
  }

  if (url.pathname === '/api/messages/owner/groups/create' && req.method === 'POST') {
    if (!user.isOwner) return sendJson(res, 403, { ok: false, error: 'Owner access required.' });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err?.message || 'Invalid JSON' });
    }
    const leaderUserId = String(payload?.userId || '').trim();
    const created = await createMessageGroupForLeader(
      leaderUserId,
      payload?.name,
      payload?.memberIds
    );
    if (!created.ok) return sendJson(res, created.status || 400, { ok: false, error: created.error || 'Failed to create group.' });
    return sendJson(res, 200, { ok: true, group: created.group });
  }

  if (url.pathname === '/api/messages/owner/thread' && req.method === 'GET') {
    if (!user.isOwner) return sendJson(res, 403, { ok: false, error: 'Owner access required.' });
    const targetUserId = String(url.searchParams.get('userId') || '').trim();
    if (!isUuid(targetUserId)) return sendJson(res, 400, { ok: false, error: 'Invalid recipient.' });
    if (targetUserId === user.id) return sendJson(res, 400, { ok: false, error: 'Cannot open self thread.' });

    const [a, b] = orderPair(user.id, targetUserId);
    const threadRow = await db.query(
      'SELECT id FROM app_message_threads WHERE user_a = $1 AND user_b = $2 LIMIT 1;',
      [a, b]
    );
    const threadId = threadRow.rows?.[0]?.id || null;

    const userRow = await db.query(
      'SELECT display_name, username, email FROM app_users WHERE id = $1 LIMIT 1;',
      [targetUserId]
    );
    if (!userRow.rows?.[0]) return sendJson(res, 404, { ok: false, error: 'Recipient not found.' });

    let messages = [];
    if (threadId) {
      const msgRows = await db.query(
        `
          SELECT id, sender_id, receiver_id, body, image_data_url, created_at
          FROM app_messages
          WHERE thread_id = $1
          ORDER BY created_at ASC
          LIMIT 400;
        `,
        [threadId]
      );
      messages = (msgRows.rows || []).map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        receiverId: row.receiver_id,
        body: row.body || '',
        imageDataUrl: String(row.image_data_url || ''),
        createdAt: row.created_at
      }));
    }

    return sendJson(res, 200, {
      ok: true,
      account: {
        id: targetUserId,
        username: userRow.rows[0].username || null,
        displayName: userRow.rows[0].display_name || userRow.rows[0].username || 'Account',
        email: userRow.rows[0].email || null
      },
      messages
    });
  }

  if ((url.pathname === '/api/messages/owner/message/delete' || url.pathname === '/api/messages/owner/delete-message') && req.method === 'POST') {
    if (!user.isOwner) return sendJson(res, 403, { ok: false, error: 'Owner access required.' });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err?.message || 'Invalid JSON' });
    }

    const targetUserId = String(payload?.userId || '').trim();
    const messageId = String(payload?.messageId || '').trim();
    if (!isUuid(targetUserId)) return sendJson(res, 400, { ok: false, error: 'Invalid recipient.' });
    if (!isUuid(messageId)) return sendJson(res, 400, { ok: false, error: 'Invalid message id.' });
    if (targetUserId === user.id) return sendJson(res, 400, { ok: false, error: 'Invalid thread.' });

    const [a, b] = orderPair(user.id, targetUserId);
    const threadRow = await db.query(
      'SELECT id FROM app_message_threads WHERE user_a = $1 AND user_b = $2 LIMIT 1;',
      [a, b]
    );
    const threadId = String(threadRow.rows?.[0]?.id || '').trim();
    if (!isUuid(threadId)) return sendJson(res, 200, { ok: true, deleted: false, deletedMessageId: messageId });

    const deleted = await db.query(
      `
        DELETE FROM app_messages
        WHERE id = $1 AND thread_id = $2
        RETURNING id;
      `,
      [messageId, threadId]
    );
    if (!deleted.rows?.length) return sendJson(res, 200, { ok: true, deleted: false, deletedMessageId: messageId });

    const latestRow = await db.query(
      `
        SELECT body, image_data_url, created_at
        FROM app_messages
        WHERE thread_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1;
      `,
      [threadId]
    );

    if (latestRow.rows?.[0]) {
      const row = latestRow.rows[0];
      const body = String(row.body || '').trim();
      const hasImage = String(row.image_data_url || '').trim().length > 0;
      const previewText = body || (hasImage ? '[Image]' : '');
      await db.query(
        `
          UPDATE app_message_threads
          SET last_message_at = $2,
              last_message_text = $3
          WHERE id = $1;
        `,
        [threadId, row.created_at, previewText]
      );
    } else {
      await db.query(
        `
          UPDATE app_message_threads
          SET last_message_at = NULL,
              last_message_text = ''
          WHERE id = $1;
        `,
        [threadId]
      );
    }

    return sendJson(res, 200, { ok: true, deleted: true, deletedMessageId: messageId });
  }

  if (url.pathname === '/api/messages/owner/send' && req.method === 'POST') {
    if (!user.isOwner) return sendJson(res, 403, { ok: false, error: 'Owner access required.' });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err?.message || 'Invalid JSON' });
    }
    const toUserId = String(payload?.toUserId || '').trim();
    const subject = normalizeBody(payload?.subject, 140);
    const body = normalizeBody(payload?.body, 4000);
    const imageDataUrl = normalizeDataUrlImage(payload?.imageDataUrl);
    if (!isUuid(toUserId)) return sendJson(res, 400, { ok: false, error: 'Invalid recipient.' });
    if (toUserId === user.id) return sendJson(res, 400, { ok: false, error: 'Cannot message yourself.' });
    if (!body && !imageDataUrl) return sendJson(res, 400, { ok: false, error: 'Message is empty.' });

    const userCheck = await db.query('SELECT 1 FROM app_users WHERE id = $1 LIMIT 1;', [toUserId]);
    if (!userCheck.rows?.length) return sendJson(res, 404, { ok: false, error: 'Recipient not found.' });

    const finalBody = subject ? `[${subject}]\n\n${body || ''}`.trim() : (body || '');
    const previewText = finalBody || '[Image]';
    const [a, b] = orderPair(user.id, toUserId);
    const threadUpsert = await db.query(
      `
        INSERT INTO app_message_threads (user_a, user_b, last_message_at, last_message_text)
        VALUES ($1, $2, now(), $3)
        ON CONFLICT (user_a, user_b)
        DO UPDATE SET last_message_at = now(), last_message_text = EXCLUDED.last_message_text
        RETURNING id;
      `,
      [a, b, previewText]
    );
    const threadId = String(threadUpsert.rows?.[0]?.id || '').trim();
    if (!isUuid(threadId)) return sendJson(res, 500, { ok: false, error: 'Could not create thread.' });

    await db.query(
      `
        INSERT INTO app_messages (thread_id, sender_id, receiver_id, body, image_data_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at;
      `,
      [threadId, user.id, toUserId, finalBody, imageDataUrl || '']
    );

    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/messages/owner/stats' && req.method === 'GET') {
    if (!user.isOwner) return sendJson(res, 403, { ok: false, error: 'Owner access required.' });
    const recipientsRow = await db.query(
      'SELECT COUNT(*)::int AS count FROM app_users WHERE id <> $1;',
      [user.id]
    );
    const count = Number(recipientsRow.rows?.[0]?.count || 0);
    return sendJson(res, 200, { ok: true, recipients: count });
  }

  if (url.pathname === '/api/messages/owner/broadcast' && req.method === 'POST') {
    if (!user.isOwner) return sendJson(res, 403, { ok: false, error: 'Owner access required.' });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err?.message || 'Invalid JSON' });
    }

    const subject = normalizeBody(payload?.subject, 140);
    const messageBody = normalizeBody(payload?.body, 4000);
    const imageDataUrl = normalizeDataUrlImage(payload?.imageDataUrl);
    if (!messageBody && !imageDataUrl) return sendJson(res, 400, { ok: false, error: 'Message is empty.' });
    const finalBody = subject ? `[${subject}]\n\n${messageBody || ''}`.trim() : (messageBody || '');
    const previewText = finalBody || '[Image]';

    const recipientsResult = await db.query(
      `
        SELECT id
        FROM app_users
        WHERE id <> $1
        ORDER BY created_at ASC;
      `,
      [user.id]
    );
    const recipients = (recipientsResult.rows || []).map((r) => String(r.id || '')).filter(Boolean);
    if (!recipients.length) return sendJson(res, 200, { ok: true, sent: 0, recipients: 0 });

    let sent = 0;
    try {
      await db.query('BEGIN');
      for (const toUserId of recipients) {
        const [a, b] = orderPair(user.id, toUserId);
        const threadUpsert = await db.query(
          `
            INSERT INTO app_message_threads (user_a, user_b, last_message_at, last_message_text)
            VALUES ($1, $2, now(), $3)
            ON CONFLICT (user_a, user_b)
            DO UPDATE SET last_message_at = now(), last_message_text = EXCLUDED.last_message_text
            RETURNING id;
          `,
          [a, b, previewText]
        );
        const threadId = String(threadUpsert.rows?.[0]?.id || '').trim();
        if (!isUuid(threadId)) continue;
        await db.query(
          `
            INSERT INTO app_messages (thread_id, sender_id, receiver_id, body, image_data_url)
            VALUES ($1, $2, $3, $4, $5);
          `,
          [threadId, user.id, toUserId, finalBody, imageDataUrl || '']
        );
        sent += 1;
      }
      await db.query('COMMIT');
    } catch (err) {
      try { await db.query('ROLLBACK'); } catch {}
      return sendJson(res, 500, { ok: false, error: 'Failed to send mass message.' });
    }

    return sendJson(res, 200, { ok: true, sent, recipients: recipients.length });
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

module.exports = socialRoutes;
