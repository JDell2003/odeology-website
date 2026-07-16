// Health integrations: link Strava / Fitbit accounts, sync steps, cardio
// minutes and sleep into a per-day table, and accept manual entries as a
// fallback for users without a wearable.
//
// Provider credentials come from env vars; when absent the connect endpoints
// respond gracefully so the UI can show a "not configured yet" state:
//   STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET
//   FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET
//   HEALTH_OAUTH_SECRET (optional; falls back to a derived constant)

const crypto = require('crypto');
const db = require('./db');
const { enqueueUserRecompute, scoringV2Enabled, scoringWriteAllowed, recordScoringFlag } = require('./scoringGather');
const scoringConstants = require('./scoringConstants');

const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.HEALTH_MAX_BODY_BYTES || 100_000));
const SYNC_STALE_MS = Math.max(60_000, Number(process.env.HEALTH_SYNC_STALE_MS || 15 * 60_000));
const OAUTH_STATE_MAX_AGE_MS = 10 * 60_000;
const SUMMARY_DAYS = 7;

let schemaEnsured = false;
let schemaEnsurePromise = null;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function oauthSecret() {
  return String(process.env.HEALTH_OAUTH_SECRET || process.env.SESSION_SECRET || 'ode-health-oauth-v1');
}

function signState(userId) {
  const ts = Date.now();
  const mac = crypto.createHmac('sha256', oauthSecret()).update(`${userId}.${ts}`).digest('hex').slice(0, 24);
  return `${userId}.${ts}.${mac}`;
}

function verifyState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 3) return null;
  const [userId, tsRaw, mac] = parts;
  const ts = Number(tsRaw);
  if (!userId || !Number.isFinite(ts) || Date.now() - ts > OAUTH_STATE_MAX_AGE_MS) return null;
  const expected = crypto.createHmac('sha256', oauthSecret()).update(`${userId}.${ts}`).digest('hex').slice(0, 24);
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return userId;
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
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(payload));
  return true;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
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
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;
  if (!db.isConfigured()) return;

  schemaEnsurePromise = (async () => {
    await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;').catch(() => null);
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_health_connections (
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        provider text NOT NULL,
        access_token text,
        refresh_token text,
        token_expires_at timestamptz,
        external_id text,
        external_name text,
        scopes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        last_sync_at timestamptz,
        last_sync_error text,
        PRIMARY KEY (user_id, provider)
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_health_daily (
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        day date NOT NULL,
        steps integer,
        active_minutes integer,
        sleep_minutes integer,
        sources jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, day)
      );
    `);
    await db.query(`ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS distance_meters integer;`);
    await db.query(`ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS gym_visit boolean;`);
    await db.query(`ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS wake_result text;`);
    // v2 scoring (SCORING_ENGINE_V2) — 1f. Wake timestamps for sleep-regularity
    // (today only the calendar day is stored).
    await db.query(`ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS wake_at timestamptz;`);
    await db.query(`ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS sleep_start_at timestamptz;`);
    // Task 8 — cardio v2: graded intensity needs vigorous minutes + VO2max +
    // resting HR (Fitbit heart scope / Strava HR), and Strava distance/type.
    await db.query(`ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS vigorous_minutes integer;`);
    await db.query(`ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS vo2max numeric;`);
    await db.query(`ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS resting_hr integer;`);
    await db.query(`ALTER TABLE app_health_activities ADD COLUMN IF NOT EXISTS provider text;`);
    await db.query(`ALTER TABLE app_health_activities ADD COLUMN IF NOT EXISTS external_id text;`);
    await db.query(`ALTER TABLE app_health_activities ADD COLUMN IF NOT EXISTS avg_hr integer;`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_health_activities_provider_ext ON app_health_activities(user_id, provider, external_id) WHERE external_id IS NOT NULL;`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_health_activities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        kind text NOT NULL DEFAULT 'walk',
        started_at timestamptz NOT NULL DEFAULT now(),
        duration_seconds integer NOT NULL,
        distance_meters integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
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
  try {
    const result = await db.query(
      `SELECT user_id FROM app_sessions WHERE session_token_hash = $1 AND expires_at > now() LIMIT 1;`,
      [sha256Hex(token)]
    );
    return result.rows?.[0]?.user_id || null;
  } catch {
    return null;
  }
}

function baseUrlFromRequest(req) {
  const explicit = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' ? 'https' : 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000');
  return `${proto}://${host}`;
}

const PROVIDERS = {
  strava: {
    label: 'Strava',
    configured: () => Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET),
    authorizeUrl(req, state) {
      const redirectUri = `${baseUrlFromRequest(req)}/api/health/connect/strava/callback`;
      const params = new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        approval_prompt: 'auto',
        scope: 'read,activity:read_all',
        state
      });
      return `https://www.strava.com/oauth/authorize?${params.toString()}`;
      // NOTE: Strava's activity:read already returns per-activity heartrate,
      // distance, and type; no extra scope needed (unlike Fitbit's heart scope).
    },
    async exchangeCode(req, code) {
      const resp = await fetch('https://www.strava.com/api/v3/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code'
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.access_token) throw new Error(data?.message || 'Strava token exchange failed');
      const athlete = data.athlete || {};
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
        externalId: athlete.id ? String(athlete.id) : null,
        externalName: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || null,
        scopes: 'read,activity:read_all'
      };
    },
    async refresh(conn) {
      const resp = await fetch('https://www.strava.com/api/v3/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: conn.refresh_token
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.access_token) throw new Error('Strava token refresh failed');
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || conn.refresh_token,
        expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null
      };
    },
    // Strava gives activities (cardio), not steps or sleep.
    async fetchDaily(conn) {
      const after = Math.floor((Date.now() - SUMMARY_DAYS * 86_400_000) / 1000);
      const resp = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
        { headers: { Authorization: `Bearer ${conn.access_token}` } }
      );
      if (resp.status === 401) throw Object.assign(new Error('unauthorized'), { needsRefresh: true });
      if (!resp.ok) throw new Error(`Strava activities fetch failed (${resp.status})`);
      const activities = await resp.json().catch(() => []);
      return mapStravaActivitiesByDay(activities);
    }
  },
  fitbit: {
    label: 'Fitbit',
    configured: () => Boolean(process.env.FITBIT_CLIENT_ID && process.env.FITBIT_CLIENT_SECRET),
    authorizeUrl(req, state) {
      const redirectUri = `${baseUrlFromRequest(req)}/api/health/connect/fitbit/callback`;
      // Task 8 — cardio v2: 'heart' scope unlocks resting HR, HR zones and the
      // cardio-fitness (VO2max) score. Configurable so the owner can roll it
      // out only once the Fitbit app registration also requests 'heart'
      // (otherwise Fitbit returns 403 in prod — see DEPLOYMENT.md OWNER ACTIONS).
      const scope = String(process.env.FITBIT_SCOPES || 'activity sleep profile heart').trim();
      const params = new URLSearchParams({
        client_id: process.env.FITBIT_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        state
      });
      return `https://www.fitbit.com/oauth2/authorize?${params.toString()}`;
    },
    async exchangeCode(req, code) {
      const redirectUri = `${baseUrlFromRequest(req)}/api/health/connect/fitbit/callback`;
      const basic = Buffer.from(`${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`).toString('base64');
      const resp = await fetch('https://api.fitbit.com/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        }).toString()
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.access_token) throw new Error(data?.errors?.[0]?.message || 'Fitbit token exchange failed');
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        externalId: data.user_id || null,
        externalName: null,
        scopes: data.scope || 'activity sleep'
      };
    },
    async refresh(conn) {
      const basic = Buffer.from(`${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`).toString('base64');
      const resp = await fetch('https://api.fitbit.com/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: conn.refresh_token
        }).toString()
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.access_token) throw new Error('Fitbit token refresh failed');
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || conn.refresh_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null
      };
    },
    // Fitbit gives steps, active minutes, and sleep per day.
    async fetchDaily(conn) {
      const byDay = new Map();
      const headers = { Authorization: `Bearer ${conn.access_token}` };
      const hasHeartScope = /(^|\s)heart(\s|$)/.test(String(conn.scopes || process.env.FITBIT_SCOPES || ''));
      for (let i = 0; i < SUMMARY_DAYS; i++) {
        const day = dayKey(new Date(Date.now() - i * 86_400_000));
        // Task 8 — cardio v2: also pull HR summary (resting HR) when the heart
        // scope is present. VO2max (cardioscore) is fetched once per sync below.
        const requests = [
          fetch(`https://api.fitbit.com/1/user/-/activities/date/${day}.json`, { headers }),
          fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${day}.json`, { headers })
        ];
        if (hasHeartScope) {
          requests.push(fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${day}/1d.json`, { headers }));
        }
        const [actResp, sleepResp, hrResp] = await Promise.all(requests);
        if (actResp.status === 401 || sleepResp.status === 401) {
          throw Object.assign(new Error('unauthorized'), { needsRefresh: true });
        }
        const entry = {};
        if (actResp.ok) {
          const act = await actResp.json().catch(() => ({}));
          const summary = act?.summary || {};
          if (Number.isFinite(Number(summary.steps))) entry.steps = Number(summary.steps);
          const fairly = Number(summary.fairlyActiveMinutes || 0);
          const very = Number(summary.veryActiveMinutes || 0);
          const active = fairly + very;
          if (active > 0) entry.activeMinutes = active;
          if (very > 0) entry.vigorousMinutes = very; // "very active" ~= vigorous intensity
        }
        if (sleepResp.ok) {
          const sleep = await sleepResp.json().catch(() => ({}));
          const minutes = Number(sleep?.summary?.totalMinutesAsleep || 0);
          if (minutes > 0) entry.sleepMinutes = minutes;
        }
        if (hrResp && hrResp.ok) {
          const hr = await hrResp.json().catch(() => ({}));
          const rest = Number(hr?.['activities-heart']?.[0]?.value?.restingHeartRate);
          if (Number.isFinite(rest) && rest > 0) entry.restingHr = rest;
        }
        if (Object.keys(entry).length) byDay.set(day, entry);
      }
      // VO2max / cardio-fitness score (single call; needs the heart scope).
      if (hasHeartScope) {
        try {
          const vo2Resp = await fetch('https://api.fitbit.com/1/user/-/cardioscore/date/today.json', { headers });
          if (vo2Resp.ok) {
            const vo2 = await vo2Resp.json().catch(() => ({}));
            const raw = vo2?.cardioScore?.[0]?.value?.vo2Max ?? vo2?.['cardioscore']?.[0]?.value?.vo2Max;
            // Fitbit sometimes returns a range like "42-46" — take the midpoint.
            const parseVo2 = (v) => {
              if (v == null) return null;
              const parts = String(v).split('-').map(Number).filter(Number.isFinite);
              if (!parts.length) return null;
              return parts.reduce((a, b) => a + b, 0) / parts.length;
            };
            const vo2max = parseVo2(raw);
            if (vo2max) {
              const today = dayKey(new Date());
              const entry = byDay.get(today) || {};
              entry.vo2max = vo2max;
              byDay.set(today, entry);
            }
          }
        } catch { /* VO2max is optional; never fail the sync over it */ }
      }
      return byDay;
    }
  }
};

// Consistency points per day: show up at the gym, win the wake-up, move.
function dayPoints(row) {
  let points = 0;
  if (row?.gym_visit === true) points += 10;
  if (String(row?.wake_result || '') === 'clean') points += 5;
  if ((Number(row?.distance_meters) || 0) >= 1000 || (Number(row?.active_minutes) || 0) >= 20) points += 3;
  if ((Number(row?.steps) || 0) >= 8000) points += 2;
  return points;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const GYM_RADIUS_METERS = 161; // 0.1 miles

function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// v2 scoring (SCORING_ENGINE_V2) — Task 7 timezone fix: when the flag is on,
// the day boundary comes from the user's stored IANA timezone (falling back to
// DEFAULT_TZ, then to the legacy server-local key). Flag off -> legacy dayKey
// so the two existing conventions are NOT collapsed by guessing.
async function resolveUserDayKey(userId) {
  if (!scoringV2Enabled()) return dayKey(new Date());
  try {
    const tzRes = await db.query(
      'SELECT timezone FROM app_training_profiles WHERE user_id = $1 LIMIT 1;',
      [userId]
    );
    const tz = tzRes.rows?.[0]?.timezone || process.env.DEFAULT_TZ || null;
    if (!tz) return dayKey(new Date()); // TODO(owner): set DEFAULT_TZ on Railway
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date());
  } catch {
    return dayKey(new Date());
  }
}

// Map Strava activities into per-day cardio metrics (extracted + exported
// for testing). Vigorous when avg HR ~>=146 / max >=165, or a high-intensity
// sport type. Same activity id is de-duplicated by the app_health_activities
// (user, provider, external_id) unique index on insert.
function mapStravaActivitiesByDay(activities) {
  const byDay = new Map();
  (Array.isArray(activities) ? activities : []).forEach((activity) => {
    const start = String(activity.start_date_local || activity.start_date || '').slice(0, 10);
    if (!start) return;
    const minutes = Math.max(0, Math.round(Number(activity.moving_time || 0) / 60));
    const distance = Math.max(0, Math.round(Number(activity.distance || 0)));
    const type = String(activity.type || activity.sport_type || '').toLowerCase();
    const avgHr = Number(activity.average_heartrate) || null;
    const maxHr = Number(activity.max_heartrate) || null;
    const vigorousType = /run|race|virtualrun|swim|rowing|hiit|workout|crossfit/.test(type);
    const isVigorous = (avgHr && avgHr >= 146) || (maxHr && maxHr >= 165) || vigorousType;
    const entry = byDay.get(start) || { activeMinutes: 0, vigorousMinutes: 0, distanceMeters: 0, providerActivityIds: [] };
    entry.activeMinutes += minutes;
    if (isVigorous) entry.vigorousMinutes += minutes;
    entry.distanceMeters += distance;
    if (avgHr) entry.avgHr = avgHr;
    if (activity.id != null) entry.providerActivityIds.push(String(activity.id));
    byDay.set(start, entry);
  });
  return byDay;
}

async function upsertDaily(userId, day, metrics, source) {
  const steps = Number.isFinite(metrics.steps) ? Math.max(0, Math.round(metrics.steps)) : null;
  const activeMinutes = Number.isFinite(metrics.activeMinutes) ? Math.max(0, Math.round(metrics.activeMinutes)) : null;
  const sleepMinutes = Number.isFinite(metrics.sleepMinutes) ? Math.max(0, Math.round(metrics.sleepMinutes)) : null;
  // Task 8 — cardio v2 metrics.
  const vigorousMinutes = Number.isFinite(metrics.vigorousMinutes) ? Math.max(0, Math.round(metrics.vigorousMinutes)) : null;
  const distanceMeters = Number.isFinite(metrics.distanceMeters) ? Math.max(0, Math.round(metrics.distanceMeters)) : null;
  const vo2max = Number.isFinite(metrics.vo2max) ? Math.round(metrics.vo2max * 10) / 10 : null;
  const restingHr = Number.isFinite(metrics.restingHr) ? Math.max(0, Math.round(metrics.restingHr)) : null;
  const sourcePatch = {};
  if (steps !== null) sourcePatch.steps = source;
  if (activeMinutes !== null) sourcePatch.activeMinutes = source;
  if (sleepMinutes !== null) sourcePatch.sleepMinutes = source;
  if (vigorousMinutes !== null) sourcePatch.vigorousMinutes = source;
  if (vo2max !== null) sourcePatch.vo2max = source;
  await db.query(
    `
      INSERT INTO app_health_daily (user_id, day, steps, active_minutes, sleep_minutes, vigorous_minutes, distance_meters, vo2max, resting_hr, sources, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
      ON CONFLICT (user_id, day) DO UPDATE SET
        steps = COALESCE(EXCLUDED.steps, app_health_daily.steps),
        active_minutes = COALESCE(EXCLUDED.active_minutes, app_health_daily.active_minutes),
        sleep_minutes = COALESCE(EXCLUDED.sleep_minutes, app_health_daily.sleep_minutes),
        vigorous_minutes = COALESCE(EXCLUDED.vigorous_minutes, app_health_daily.vigorous_minutes),
        distance_meters = COALESCE(EXCLUDED.distance_meters, app_health_daily.distance_meters),
        vo2max = COALESCE(EXCLUDED.vo2max, app_health_daily.vo2max),
        resting_hr = COALESCE(EXCLUDED.resting_hr, app_health_daily.resting_hr),
        sources = app_health_daily.sources || EXCLUDED.sources,
        updated_at = now();
    `,
    [userId, day, steps, activeMinutes, sleepMinutes, vigorousMinutes, distanceMeters, vo2max, restingHr, JSON.stringify(sourcePatch)]
  );
}

async function saveConnectionTokens(userId, provider, tokens) {
  await db.query(
    `
      UPDATE app_health_connections
      SET access_token = $3, refresh_token = $4, token_expires_at = $5, updated_at = now()
      WHERE user_id = $1 AND provider = $2;
    `,
    [userId, provider, tokens.accessToken, tokens.refreshToken, tokens.expiresAt]
  );
}

async function syncProvider(userId, conn) {
  const provider = PROVIDERS[conn.provider];
  if (!provider || !provider.configured()) return;
  let working = conn;
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  try {
    if (conn.refresh_token && expiresAt && expiresAt < Date.now() + 60_000) {
      const tokens = await provider.refresh(conn);
      await saveConnectionTokens(userId, conn.provider, tokens);
      working = { ...conn, access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
    }
    let byDay;
    try {
      byDay = await provider.fetchDaily(working);
    } catch (err) {
      if (err?.needsRefresh && working.refresh_token) {
        const tokens = await provider.refresh(working);
        await saveConnectionTokens(userId, conn.provider, tokens);
        working = { ...working, access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
        byDay = await provider.fetchDaily(working);
      } else {
        throw err;
      }
    }
    for (const [day, metrics] of byDay.entries()) {
      await upsertDaily(userId, day, metrics, conn.provider);
    }
    await db.query(
      `UPDATE app_health_connections SET last_sync_at = now(), last_sync_error = NULL, updated_at = now() WHERE user_id = $1 AND provider = $2;`,
      [userId, conn.provider]
    );
    // v2 scoring (SCORING_ENGINE_V2): synced device data should refresh the
    // user's score. No-op while the flag is off.
    enqueueUserRecompute(userId);
  } catch (err) {
    await db.query(
      `UPDATE app_health_connections SET last_sync_error = $3, updated_at = now() WHERE user_id = $1 AND provider = $2;`,
      [userId, conn.provider, String(err?.message || 'sync failed').slice(0, 300)]
    ).catch(() => null);
  }
}

async function loadConnections(userId) {
  const result = await db.query(
    `SELECT provider, access_token, refresh_token, token_expires_at, external_id, external_name, last_sync_at, last_sync_error, created_at
     FROM app_health_connections WHERE user_id = $1;`,
    [userId]
  );
  return result.rows || [];
}

async function handleOverview(req, res, userId) {
  const connections = await loadConnections(userId);

  // Best-effort inline sync for stale connections.
  for (const conn of connections) {
    const last = conn.last_sync_at ? new Date(conn.last_sync_at).getTime() : 0;
    if (Date.now() - last > SYNC_STALE_MS) {
      await syncProvider(userId, conn);
    }
  }

  const daysResult = await db.query(
    `
      SELECT day::text AS day, steps, active_minutes, sleep_minutes, distance_meters, gym_visit, wake_result, sources
      FROM app_health_daily
      WHERE user_id = $1 AND day > (CURRENT_DATE - INTERVAL '${SUMMARY_DAYS} days')
      ORDER BY day ASC;
    `,
    [userId]
  );
  const byDay = new Map((daysResult.rows || []).map((row) => [row.day, row]));
  const days = [];
  for (let i = SUMMARY_DAYS - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000));
    const row = byDay.get(key) || {};
    days.push({
      day: key,
      steps: row.steps ?? null,
      activeMinutes: row.active_minutes ?? null,
      sleepMinutes: row.sleep_minutes ?? null,
      distanceMeters: row.distance_meters ?? null,
      gymVisit: row.gym_visit === true,
      wakeResult: row.wake_result || null,
      points: dayPoints(row),
      sources: row.sources || {}
    });
  }

  const fresh = await loadConnections(userId);
  return sendJson(res, 200, {
    ok: true,
    weekPoints: days.reduce((sum, d) => sum + d.points, 0),
    gymVisitsWeek: days.filter((d) => d.gymVisit).length,
    distanceWeekMeters: days.reduce((sum, d) => sum + (Number(d.distanceMeters) || 0), 0),
    providers: Object.entries(PROVIDERS).map(([id, provider]) => {
      const conn = fresh.find((c) => c.provider === id);
      return {
        id,
        label: provider.label,
        configured: provider.configured(),
        connected: Boolean(conn),
        externalName: conn?.external_name || null,
        lastSyncAt: conn?.last_sync_at || null,
        lastSyncError: conn?.last_sync_error || null,
        connectedAt: conn?.created_at || null
      };
    }),
    days
  });
}

module.exports = async function healthRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/health')) return false;

  if (!db.isConfigured()) {
    return sendJson(res, 501, { error: 'Database not configured' });
  }
  await ensureSchema();

  // OAuth callbacks arrive as top-level navigations; identify the user via
  // the signed state (and fall back to the session cookie).
  const callbackMatch = url.pathname.match(/^\/api\/health\/connect\/(strava|fitbit)\/callback$/);
  if (callbackMatch && req.method === 'GET') {
    const providerId = callbackMatch[1];
    const provider = PROVIDERS[providerId];
    const fail = (code) => redirect(res, `/account.html?healthError=${encodeURIComponent(code)}`);
    if (!provider?.configured()) return fail('not_configured');
    if (url.searchParams.get('error')) return fail('denied');
    const stateUser = verifyState(url.searchParams.get('state'));
    const sessionUser = await resolveUserIdFromSession(req);
    const userId = stateUser && sessionUser && stateUser === sessionUser ? stateUser : (stateUser || sessionUser);
    if (!userId) return fail('session');
    const code = String(url.searchParams.get('code') || '').trim();
    if (!code) return fail('missing_code');
    try {
      const tokens = await provider.exchangeCode(req, code);
      await db.query(
        `
          INSERT INTO app_health_connections
            (user_id, provider, access_token, refresh_token, token_expires_at, external_id, external_name, scopes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id, provider) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            token_expires_at = EXCLUDED.token_expires_at,
            external_id = EXCLUDED.external_id,
            external_name = EXCLUDED.external_name,
            scopes = EXCLUDED.scopes,
            updated_at = now(),
            last_sync_error = NULL;
        `,
        [userId, providerId, tokens.accessToken, tokens.refreshToken, tokens.expiresAt, tokens.externalId, tokens.externalName, tokens.scopes]
      );
      const conns = await loadConnections(userId);
      const conn = conns.find((c) => c.provider === providerId);
      if (conn) await syncProvider(userId, conn);
      return redirect(res, `/account.html?healthConnected=${providerId}`);
    } catch (err) {
      console.error(`[health] ${providerId} callback failed:`, err?.message || err);
      return fail('exchange_failed');
    }
  }

  const startMatch = url.pathname.match(/^\/api\/health\/connect\/(strava|fitbit)\/start$/);
  if (startMatch && req.method === 'GET') {
    const providerId = startMatch[1];
    const provider = PROVIDERS[providerId];
    if (!provider?.configured()) {
      return redirect(res, `/account.html?healthError=not_configured&provider=${providerId}`);
    }
    const userId = await resolveUserIdFromSession(req);
    if (!userId) return redirect(res, '/?authMode=login');
    return redirect(res, provider.authorizeUrl(req, signState(userId)));
  }

  const userId = await resolveUserIdFromSession(req);
  if (!userId) return sendJson(res, 401, { error: 'Not signed in' });

  if (url.pathname === '/api/health/overview' && req.method === 'GET') {
    return await handleOverview(req, res, userId);
  }

  if (url.pathname === '/api/health/disconnect' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const provider = String(payload?.provider || '').trim().toLowerCase();
    if (!PROVIDERS[provider]) return sendJson(res, 400, { error: 'Unknown provider' });
    await db.query(
      'DELETE FROM app_health_connections WHERE user_id = $1 AND provider = $2;',
      [userId, provider]
    );
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/health/manual' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    // v2 scoring (SCORING_ENGINE_V2) — Task 7 integrity (no-ops flag-off).
    if (!scoringWriteAllowed(userId, 'health-manual')) {
      return sendJson(res, 429, { error: 'Too many manual entries - slow down and try again shortly' });
    }
    const rawDay = String(payload?.day || '').trim();
    const day = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : await resolveUserDayKey(userId);
    const dayTime = new Date(`${day}T12:00:00`).getTime();
    if (!Number.isFinite(dayTime) || dayTime > Date.now() + 86_400_000 || Date.now() - dayTime > 366 * 86_400_000) {
      return sendJson(res, 400, { error: 'Pick a day within the last year' });
    }
    const steps = payload.steps === undefined || payload.steps === null || payload.steps === ''
      ? null : Number(payload.steps);
    const sleepHours = payload.sleepHours === undefined || payload.sleepHours === null || payload.sleepHours === ''
      ? null : Number(payload.sleepHours);
    const activeMinutes = payload.activeMinutes === undefined || payload.activeMinutes === null || payload.activeMinutes === ''
      ? null : Number(payload.activeMinutes);
    if (steps !== null && (!Number.isFinite(steps) || steps < 0 || steps > 200_000)) {
      return sendJson(res, 400, { error: 'Steps must be between 0 and 200,000' });
    }
    if (sleepHours !== null && (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24)) {
      return sendJson(res, 400, { error: 'Sleep must be between 0 and 24 hours' });
    }
    if (activeMinutes !== null && (!Number.isFinite(activeMinutes) || activeMinutes < 0 || activeMinutes > 1440)) {
      return sendJson(res, 400, { error: 'Active minutes must be between 0 and 1440' });
    }
    if (steps === null && sleepHours === null && activeMinutes === null) {
      return sendJson(res, 400, { error: 'Enter at least one value' });
    }
    // v2 scoring — Task 7 edit audit: capture the old row before the upsert
    // overwrites it (flag-gated).
    if (scoringV2Enabled()) {
      try {
        const prevRow = await db.query(
          'SELECT steps, active_minutes, sleep_minutes FROM app_health_daily WHERE user_id = $1 AND day = $2::date LIMIT 1;',
          [userId, day]
        );
        if (prevRow.rows?.length) {
          await db.query(
            `INSERT INTO app_edit_audit (user_id, table_name, row_key, field, old_value, new_value, actor)
             VALUES ($1, 'app_health_daily', $2, 'manual_metrics', $3::jsonb, $4::jsonb, 'user');`,
            [userId, day, JSON.stringify(prevRow.rows[0]),
              JSON.stringify({ steps, active_minutes: activeMinutes, sleep_minutes: sleepHours === null ? null : sleepHours * 60 })]
          );
        }
      } catch (err) {
        console.error('[scoring] manual edit-audit failed', err?.message || err);
      }
    }
    await upsertDaily(userId, day, {
      steps: steps === null ? NaN : steps,
      activeMinutes: activeMinutes === null ? NaN : activeMinutes,
      sleepMinutes: sleepHours === null ? NaN : sleepHours * 60
    }, 'manual');
    enqueueUserRecompute(userId); // v2 scoring: no-op while flag off
    return sendJson(res, 200, { ok: true });
  }

  // Finish a GPS-tracked session (walk/run/ride) from the in-house tracker.
  if (url.pathname === '/api/health/activity' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const durationSeconds = Math.round(Number(payload?.durationSeconds));
    const distanceMeters = Math.round(Number(payload?.distanceMeters));
    const kind = ['walk', 'run', 'ride'].includes(String(payload?.kind || '').toLowerCase())
      ? String(payload.kind).toLowerCase() : 'walk';
    if (!Number.isFinite(durationSeconds) || durationSeconds < 30 || durationSeconds > 12 * 3600) {
      return sendJson(res, 400, { error: 'Sessions must be between 30 seconds and 12 hours' });
    }
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > 400_000) {
      return sendJson(res, 400, { error: 'Distance looks wrong' });
    }
    if (!scoringWriteAllowed(userId, 'health-activity')) {
      return sendJson(res, 429, { error: 'Too many activity submissions - slow down and try again shortly' });
    }
    await db.query(
      `INSERT INTO app_health_activities (user_id, kind, duration_seconds, distance_meters) VALUES ($1, $2, $3, $4);`,
      [userId, kind, durationSeconds, distanceMeters]
    );
    const day = await resolveUserDayKey(userId);
    const minutes = Math.round(durationSeconds / 60);
    await db.query(
      `
        INSERT INTO app_health_daily (user_id, day, active_minutes, distance_meters, sources, updated_at)
        VALUES ($1, $2, $3, $4, '{"activity":"gps"}'::jsonb, now())
        ON CONFLICT (user_id, day) DO UPDATE SET
          active_minutes = COALESCE(app_health_daily.active_minutes, 0) + EXCLUDED.active_minutes,
          distance_meters = COALESCE(app_health_daily.distance_meters, 0) + EXCLUDED.distance_meters,
          sources = app_health_daily.sources || EXCLUDED.sources,
          updated_at = now();
      `,
      [userId, day, minutes, distanceMeters]
    );
    enqueueUserRecompute(userId); // v2 scoring: no-op while flag off
    return sendJson(res, 200, { ok: true, day, minutes, distanceMeters });
  }

  // GPS gym check-in: within 0.1 miles of the user's saved gym location.
  if (url.pathname === '/api/health/gym-checkin' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const lat = Number(payload?.lat);
    const lng = Number(payload?.lng);
    const accuracy = Math.max(0, Number(payload?.accuracy) || 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return sendJson(res, 400, { error: 'Invalid location' });
    }
    // v2 scoring — Task 7 integrity: throttle + GPS accuracy spoof flag.
    if (!scoringWriteAllowed(userId, 'gym-checkin')) {
      return sendJson(res, 429, { error: 'Too many check-in attempts - slow down and try again shortly' });
    }
    if (scoringV2Enabled() && accuracy > scoringConstants.engineExtras.integrity.maxTrustedGpsAccuracyMeters) {
      await recordScoringFlag(userId, {
        axis: 'consistency',
        reasonCode: 'flag_gps_accuracy',
        sourceRef: null,
        detail: { accuracy, lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }
      });
      return sendJson(res, 200, { ok: true, hasGym: true, within: false, suspicious: true });
    }
    const profileResult = await db.query(
      'SELECT profile FROM app_user_profiles WHERE user_id = $1 LIMIT 1;',
      [userId]
    );
    const gym = profileResult.rows?.[0]?.profile?.health?.gym || null;
    const gymLat = Number(gym?.lat);
    const gymLng = Number(gym?.lng);
    if (!Number.isFinite(gymLat) || !Number.isFinite(gymLng)) {
      return sendJson(res, 200, { ok: true, hasGym: false });
    }
    const distance = haversineMeters(lat, lng, gymLat, gymLng);
    // Give credit when the GPS accuracy circle overlaps the gym radius.
    const within = distance - Math.min(accuracy, 50) <= GYM_RADIUS_METERS;
    if (within) {
      const day = await resolveUserDayKey(userId);
      await db.query(
        `
          INSERT INTO app_health_daily (user_id, day, gym_visit, sources, updated_at)
          VALUES ($1, $2, true, '{"gymVisit":"gps"}'::jsonb, now())
          ON CONFLICT (user_id, day) DO UPDATE SET
            gym_visit = true,
            sources = app_health_daily.sources || EXCLUDED.sources,
            updated_at = now();
        `,
        [userId, day]
      );
      enqueueUserRecompute(userId); // v2 scoring: no-op while flag off
    }
    return sendJson(res, 200, {
      ok: true,
      hasGym: true,
      within,
      distanceMeters: Math.round(distance),
      gymName: gym?.name || 'your gym'
    });
  }

  // Wake-up result from the rise alarm: clean wake earns points, snooze does
  // not, and the armed->dismissed window doubles as the sleep log.
  if (url.pathname === '/api/health/wake' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const result = String(payload?.result || '').toLowerCase() === 'clean' ? 'clean' : 'snoozed';
    const sleepMinutes = Number(payload?.sleepMinutes);
    if (!scoringWriteAllowed(userId, 'wake')) {
      return sendJson(res, 429, { error: 'Too many wake submissions - slow down and try again shortly' });
    }
    const day = await resolveUserDayKey(userId);
    const sleepValid = Number.isFinite(sleepMinutes) && sleepMinutes >= 60 && sleepMinutes <= 16 * 60;
    // v2 scoring — Task 7 / 1f: persist the wake timestamp (and the implied
    // sleep start) so sleep-regularity can be scored. Additive columns only.
    const wakeAt = new Date();
    const sleepStartAt = sleepValid ? new Date(wakeAt.getTime() - Math.round(sleepMinutes) * 60_000) : null;
    await db.query(
      `
        INSERT INTO app_health_daily (user_id, day, sleep_minutes, wake_result, wake_at, sleep_start_at, sources, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, '{"sleepMinutes":"alarm","wake":"alarm"}'::jsonb, now())
        ON CONFLICT (user_id, day) DO UPDATE SET
          sleep_minutes = COALESCE(EXCLUDED.sleep_minutes, app_health_daily.sleep_minutes),
          wake_result = EXCLUDED.wake_result,
          wake_at = COALESCE(EXCLUDED.wake_at, app_health_daily.wake_at),
          sleep_start_at = COALESCE(EXCLUDED.sleep_start_at, app_health_daily.sleep_start_at),
          sources = app_health_daily.sources || EXCLUDED.sources,
          updated_at = now();
      `,
      [userId, day, sleepValid ? Math.round(sleepMinutes) : null, result, wakeAt, sleepStartAt]
    );
    enqueueUserRecompute(userId); // v2 scoring: no-op while flag off
    return sendJson(res, 200, { ok: true, result, pointsEarned: result === 'clean' ? 5 : 0 });
  }

  return sendJson(res, 404, { error: 'Not found' });
};

// v2 scoring (SCORING_ENGINE_V2): let server.js run the additive migrations at
// boot (they otherwise only run lazily on the first /api/health request).
module.exports.ensureSchema = ensureSchema;
module.exports.syncProvider = syncProvider;
module.exports.mapStravaActivitiesByDay = mapStravaActivitiesByDay;
module.exports.loadConnections = loadConnections;
module.exports.saveConnectionTokens = saveConnectionTokens;
