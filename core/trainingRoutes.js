const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { generatePlan, applyLogAdjustments, normalizeExperience } = require('./trainingEngine');
const { resolveWorkoutExercises } = require('./exerciseResolver');
const enrichPlanWithExerciseMedia = async () => {};

const MAX_BODY_BYTES = Math.max(50_000, Number(process.env.TRAINING_MAX_BODY_BYTES || 1_500_000));

let schemaEnsured = false;
let schemaEnsurePromise = null;

const mediaEnrichInFlight = new Set();
const QUOTE_BANK_PATH = path.join(__dirname, 'quoteBank.json');

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

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safeText(raw, maxLen) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function normalizeDiscipline(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'powerlifting') return 'powerlifting';
  if (v === 'bodybuilding') return 'bodybuilding';
  if (v === 'calisthenics') return 'calisthenics';
  return null;
}

function normalizeEquipmentAccess(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const keys = ['bodyweight', 'dumbbell', 'barbell', 'cable', 'machine'];
  const out = {};
  keys.forEach((k) => { out[k] = Boolean(src[k]); });
  // Keep a sane default so we never end up with "no equipment" profiles.
  if (!Object.values(out).some(Boolean)) out.bodyweight = true;
  return out;
}

function buildResolverProfile({ discipline, strength, equipmentAccess }) {
  const goalModeRaw = String(strength?.goalMode || '').trim().toLowerCase();
  const goals = Array.isArray(strength?.goals) ? strength.goals : [];
  const goalMode = goalModeRaw
    || (goals.includes('strength') ? 'strength' : goals.includes('muscle') ? 'muscle' : '');
  return {
    discipline,
    goalMode,
    equipmentAccess: normalizeEquipmentAccess(equipmentAccess || {})
  };
}

function planNeedsResolution(plan) {
  try {
    for (const week of plan?.weeks || []) {
      for (const day of week?.days || []) {
        for (const ex of day?.exercises || []) {
          if (!ex?.movementName || !ex?.displayName || !Object.prototype.hasOwnProperty.call(ex, 'mediaPath')) {
            return true;
          }
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function normalizeWeekdayIndexList(input) {
  const raw = Array.isArray(input) ? input : [];
  const out = [];
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    const i = Math.max(0, Math.min(6, Math.floor(n)));
    if (!out.includes(i)) out.push(i);
  }
  return out;
}

function normalizeDataUrlImage(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!s.startsWith('data:image/')) return null;
  if (s.length > 1_000_000) return null;
  return s;
}

function isDateIso(raw) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '').trim());
}

function normalizeProgressPose(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'front') return 'front';
  if (v === 'side') return 'side';
  if (v === 'back') return 'back';
  return null;
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (!db.isConfigured()) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;

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
    await safeQuery('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text;');
    await safeQuery('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_seen timestamptz;');
    await safeQuery('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login timestamptz;');
    await safeQuery("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';");
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_key ON app_users(phone) WHERE phone IS NOT NULL;');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_token_hash text UNIQUE NOT NULL,
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_profiles (
        user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        onboarding_complete boolean NOT NULL DEFAULT false,
        discipline text,
        experience text,
        days_per_week int,
        strength jsonb NOT NULL DEFAULT '{}'::jsonb,
        first_name text,
        age int,
        location_city text,
        location_state text,
        goals text,
        profile_image text
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_profiles_updated_at ON app_training_profiles(updated_at);');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS calorie_offset int NOT NULL DEFAULT 0;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS no_progress_iterations int NOT NULL DEFAULT 0;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS eval_weight_lb numeric;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS eval_weight_at date;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS last_weighin_lb numeric;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS last_weighin_at date;');
    await safeQuery("ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS equipment_access jsonb NOT NULL DEFAULT '{}'::jsonb;");
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS bio text;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS injuries text;');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        active boolean NOT NULL DEFAULT true,
        version int NOT NULL DEFAULT 1,
        discipline text NOT NULL,
        days_per_week int NOT NULL,
        plan jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_plans_user_id ON app_training_plans(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_plans_active ON app_training_plans(user_id, active);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_workouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES app_training_plans(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        performed_at date,
        week_index int NOT NULL,
        day_index int NOT NULL,
        entries jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes text NOT NULL DEFAULT ''
      );
    `);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_training_workouts_plan_week_day ON app_training_workouts(plan_id, week_index, day_index);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_workouts_user_id ON app_training_workouts(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_workouts_plan_id ON app_training_workouts(plan_id);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        event_type text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_events_user_id ON app_training_events(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_events_type ON app_training_events(event_type);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_daily_checkins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        day date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        data jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_daily_checkins_user_day ON app_daily_checkins(user_id, day);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_daily_checkins_user_id ON app_daily_checkins(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_daily_checkins_updated_at ON app_daily_checkins(updated_at);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_progress_photos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        day date NOT NULL,
        pose text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        image_data_url text NOT NULL DEFAULT ''
      );
    `);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_progress_photos_user_day_pose ON app_progress_photos(user_id, day, pose);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_progress_photos_user_id ON app_progress_photos(user_id);');

    schemaEnsured = true;
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

async function resolveUserFromSession(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const result = await db.query(
    `
      SELECT u.id, u.display_name
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
  return { id: row.id, displayName: row.display_name };
}

async function getActivePlan(userId) {
  const result = await db.query(
    `
      SELECT id, version, discipline, days_per_week, plan, updated_at
      FROM app_training_plans
      WHERE user_id = $1 AND active = true
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [userId]
  );
  return result.rows?.[0] || null;
}

async function getProfile(userId) {
  const result = await db.query(
    `
      SELECT user_id, onboarding_complete, discipline, experience, days_per_week,
             strength, equipment_access, first_name, age, location_city, location_state, goals, profile_image,
             calorie_offset, no_progress_iterations, flagged, eval_weight_lb, eval_weight_at,
             last_weighin_lb, last_weighin_at, bio, injuries, updated_at
      FROM app_training_profiles
      WHERE user_id = $1
      LIMIT 1;
    `,
    [userId]
  );
  return result.rows?.[0] || null;
}

async function upsertProfile(userId, data) {
  const discipline = normalizeDiscipline(data?.discipline);
  const experience = normalizeExperience(data?.experience);
  const daysPerWeek = clampInt(data?.daysPerWeek, 2, 6, null);
  const strength = data?.strength && typeof data.strength === 'object' ? data.strength : {};
  strength.unavailableDays = normalizeWeekdayIndexList(data?.unavailableDays ?? strength?.unavailableDays);
  const equipmentAccess = normalizeEquipmentAccess(data?.equipmentAccess);
  const firstName = safeText(data?.profile?.firstName, 80);
  const age = clampInt(data?.profile?.age, 13, 120, null);
  const locationCity = safeText(data?.profile?.locationCity, 80);
  const locationState = safeText(data?.profile?.locationState, 40);
  const goals = safeText(data?.profile?.goals, 240);
  const injuries = safeText(data?.profile?.injuries, 400);
  const profileImage = normalizeDataUrlImage(data?.profileImage?.dataUrl || data?.profileImage || null);

  if (!discipline) throw new Error('Missing discipline');
  if (!daysPerWeek) throw new Error('Missing training days');

  await db.query(
    `
      INSERT INTO app_training_profiles (
        user_id, updated_at, onboarding_complete, discipline, experience, days_per_week,
        strength, equipment_access, first_name, age, location_city, location_state, goals, injuries, profile_image
      )
      VALUES ($1, now(), true, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (user_id) DO UPDATE SET
        updated_at = now(),
        onboarding_complete = true,
        discipline = EXCLUDED.discipline,
        experience = EXCLUDED.experience,
        days_per_week = EXCLUDED.days_per_week,
        strength = EXCLUDED.strength,
        equipment_access = EXCLUDED.equipment_access,
        first_name = EXCLUDED.first_name,
        age = EXCLUDED.age,
        location_city = EXCLUDED.location_city,
        location_state = EXCLUDED.location_state,
        goals = EXCLUDED.goals,
        injuries = EXCLUDED.injuries,
        profile_image = COALESCE(EXCLUDED.profile_image, app_training_profiles.profile_image);
    `,
    [
      userId,
      discipline,
      experience,
      daysPerWeek,
      JSON.stringify(strength),
      JSON.stringify(equipmentAccess),
      firstName,
      age,
      locationCity,
      locationState,
      goals,
      injuries,
      profileImage
    ]
  );
}

function countExercisesWithoutGif(plan) {
  let missing = 0;
  try {
    for (const week of plan?.weeks || []) {
      for (const day of week?.days || []) {
        for (const ex of day?.exercises || []) {
          if (!ex?.gifUrl) missing += 1;
        }
      }
    }
  } catch {
    return missing;
  }
  return missing;
}

function queuePlanMediaEnrichment({ planId, planObj, equipmentAccess } = {}) {
  const id = String(planId || '').trim();
  if (!id || !planObj) return;
  if (mediaEnrichInFlight.has(id)) return;
  mediaEnrichInFlight.add(id);

  setImmediate(async () => {
    try {
      const cloned = JSON.parse(JSON.stringify(planObj));
      const beforeMissing = countExercisesWithoutGif(cloned);
      await enrichPlanWithExerciseMedia(cloned, {
        equipmentAccess,
        maxExercises: 40,
        timeBudgetMs: 10_000
      });
      const afterMissing = countExercisesWithoutGif(cloned);
      if (afterMissing < beforeMissing) {
        await db.query(
          'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
          [JSON.stringify(cloned), id]
        );
      }
    } catch {
      // ignore
    } finally {
      mediaEnrichInFlight.delete(id);
    }
  });
}

async function createNewPlan(userId, { discipline, daysPerWeek, experience, strength, equipmentAccess }) {
  const plan = generatePlan({ discipline, daysPerWeek, experience, strength });
  try {
    resolveWorkoutExercises(plan, buildResolverProfile({ discipline, strength, equipmentAccess }));
  } catch {
    // ignore resolver errors
  }
  await db.query('UPDATE app_training_plans SET active = false, updated_at = now() WHERE user_id = $1 AND active = true;', [userId]);
  const inserted = await db.query(
    `
      INSERT INTO app_training_plans (user_id, active, version, discipline, days_per_week, plan)
      VALUES ($1, true, 1, $2, $3, $4::jsonb)
      RETURNING id, version, discipline, days_per_week, plan, updated_at;
    `,
    [userId, discipline, daysPerWeek, JSON.stringify(plan)]
  );
  const row = inserted.rows?.[0] || null;
  if (row?.id) {
    // Best-effort: attach a couple gifs quickly, then finish in the background.
    try {
      const planObj = row.plan && typeof row.plan === 'object' ? row.plan : JSON.parse(String(row.plan || '{}'));
      const beforeMissing = countExercisesWithoutGif(planObj);
      await enrichPlanWithExerciseMedia(planObj, { equipmentAccess: equipmentAccess || null, maxExercises: 50, timeBudgetMs: 300 });
      const afterMissing = countExercisesWithoutGif(planObj);
      if (afterMissing < beforeMissing) {
        await db.query(
          'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
          [JSON.stringify(planObj), row.id]
        );
        row.plan = planObj;
      }
      queuePlanMediaEnrichment({ planId: row.id, planObj, equipmentAccess: equipmentAccess || null });
    } catch {
      // ignore
    }
  }
  return row;
}

async function upsertWorkoutLog({ userId, planId, weekIndex, dayIndex, performedAt, entries, notes }) {
  const perfDate = performedAt ? String(performedAt).slice(0, 10) : null;
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeNotes = safeText(notes, 2000) || '';
  const result = await db.query(
    `
      INSERT INTO app_training_workouts (
        user_id, plan_id, updated_at, performed_at, week_index, day_index, entries, notes
      )
      VALUES ($1, $2, now(), $3::date, $4, $5, $6::jsonb, $7)
      ON CONFLICT (plan_id, week_index, day_index) DO UPDATE SET
        updated_at = now(),
        performed_at = COALESCE(EXCLUDED.performed_at, app_training_workouts.performed_at),
        entries = EXCLUDED.entries,
        notes = EXCLUDED.notes
      RETURNING id, updated_at;
    `,
    [userId, planId, perfDate, weekIndex, dayIndex, JSON.stringify(safeEntries), safeNotes]
  );
  return result.rows?.[0] || null;
}

async function listWorkoutLogs({ userId, planId }) {
  const result = await db.query(
    `
      SELECT week_index, day_index, performed_at, entries, notes, updated_at
      FROM app_training_workouts
      WHERE user_id = $1 AND plan_id = $2
      ORDER BY week_index ASC, day_index ASC;
    `,
    [userId, planId]
  );
  return result.rows || [];
}

async function patchProjectedWeight({ userId, planId, weekIndex, dayIndex, exerciseId, nextProjected }) {
  const planRow = await db.query(
    'SELECT id, version, plan FROM app_training_plans WHERE id = $1 AND user_id = $2 AND active = true LIMIT 1;',
    [planId, userId]
  );
  const row = planRow.rows?.[0];
  if (!row) return null;
  const plan = row.plan && typeof row.plan === 'object' ? row.plan : JSON.parse(String(row.plan || '{}'));
  const week = (plan.weeks || []).find((w) => Number(w.index) === Number(weekIndex));
  if (!week) return null;
  const day = (week.days || [])[Number(dayIndex) - 1];
  if (!day) return null;
  const ex = (day.exercises || []).find((e) => String(e.id) === String(exerciseId));
  if (!ex) return null;
  const next = Number(nextProjected);
  if (!Number.isFinite(next) || next <= 0) return null;
  ex.projected = ex.projected && typeof ex.projected === 'object' ? ex.projected : {};
  ex.projected.value = next;
  ex.projected.unit = ex.projected.unit || 'lb';
  plan.meta = { ...(plan.meta || {}), updatedAt: new Date().toISOString() };

  const updated = await db.query(
    `
      UPDATE app_training_plans
      SET updated_at = now(),
          version = version + 1,
          plan = $3::jsonb
      WHERE id = $1 AND user_id = $2
      RETURNING id, version, discipline, days_per_week, plan, updated_at;
    `,
    [planId, userId, JSON.stringify(plan)]
  );
  return updated.rows?.[0] || null;
}

async function applyProgressionFromLog({ userId, planId, logPayload }) {
  const planRow = await db.query(
    'SELECT id, version, plan FROM app_training_plans WHERE id = $1 AND user_id = $2 AND active = true LIMIT 1;',
    [planId, userId]
  );
  const row = planRow.rows?.[0];
  if (!row) return null;
  const plan = row.plan && typeof row.plan === 'object' ? row.plan : JSON.parse(String(row.plan || '{}'));
  const updatedPlan = applyLogAdjustments({
    plan,
    workoutLog: logPayload,
    experience: plan?.meta?.experience
  });
  if (!updatedPlan) return null;

  const updated = await db.query(
    `
      UPDATE app_training_plans
      SET updated_at = now(),
          version = version + 1,
          plan = $3::jsonb
      WHERE id = $1 AND user_id = $2
      RETURNING id, version, discipline, days_per_week, plan, updated_at;
    `,
    [planId, userId, JSON.stringify(updatedPlan)]
  );
  return updated.rows?.[0] || null;
}

async function patchProfile(userId, data) {
  const profileImage = data?.profileImage ? normalizeDataUrlImage(data.profileImage) : null;
  const bio = data?.bio != null ? safeText(data.bio, 220) : null;

  if (!profileImage && bio == null) return null;

  await db.query(
    `
      INSERT INTO app_training_profiles (user_id, profile_image, bio, onboarding_complete)
      VALUES ($1, $2, $3, false)
      ON CONFLICT (user_id) DO UPDATE
      SET profile_image = COALESCE(EXCLUDED.profile_image, app_training_profiles.profile_image),
          bio = COALESCE(EXCLUDED.bio, app_training_profiles.bio),
          updated_at = now();
    `,
    [userId, profileImage, bio]
  );
  return await getProfile(userId);
}

function normalizeGoalMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'cut') return 'cut';
  if (v === 'bulk') return 'bulk';
  return null;
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

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function upsertWeighin({ userId, weightLb, goalMode }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const profile = await getProfile(userId);

  const existingOffset = Number(profile?.calorie_offset) || 0;
  const existingIter = Number(profile?.no_progress_iterations) || 0;
  const existingFlagged = !!profile?.flagged;
  const evalWeight = profile?.eval_weight_lb == null ? null : Number(profile.eval_weight_lb);
  const evalAt = profile?.eval_weight_at ? String(profile.eval_weight_at).slice(0, 10) : null;

  let nextOffset = existingOffset;
  let nextIterations = existingIter;
  let nextFlagged = existingFlagged;
  let adjusted = false;
  let deltaKcal = 0;
  let recommendation = null;
  let warning = null;

  const w = clampNumber(weightLb, 50, 700, null);
  if (!w) return { ok: false, error: 'Invalid weight' };

  if (!evalAt || !Number.isFinite(evalWeight)) {
    // Establish baseline for weekly checks.
    await db.query(
      `
        INSERT INTO app_training_profiles (user_id, eval_weight_lb, eval_weight_at, last_weighin_lb, last_weighin_at, onboarding_complete)
        VALUES ($1, $2, $3, $2, $3, false)
        ON CONFLICT (user_id) DO UPDATE
        SET last_weighin_lb = EXCLUDED.last_weighin_lb,
            last_weighin_at = EXCLUDED.last_weighin_at,
            updated_at = now();
      `,
      [userId, w, todayIso]
    );
    const updated = await getProfile(userId);
    return { ok: true, profile: updated, adjusted: false, deltaKcal: 0, iterations: updated?.no_progress_iterations || 0, flagged: !!updated?.flagged, recommendation: null, warning: null };
  }

  const daysSince = daysBetweenIso(evalAt, todayIso);
  // Always store the latest weigh-in.
  await db.query(
    `
      UPDATE app_training_profiles
      SET last_weighin_lb = $2,
          last_weighin_at = $3,
          updated_at = now()
      WHERE user_id = $1;
    `,
    [userId, w, todayIso]
  );

  if (daysSince != null && daysSince >= 7) {
    const expRaw = String(profile?.experience || '').trim().toLowerCase();
    const bulkTargets = (() => {
      // Defaults to the "intermediate" guidance range, since that's where most users live.
      if (expRaw.includes('beginner')) return { label: 'Beginner', min: 0.5, max: 1.0 };
      if (expRaw.includes('intermediate')) return { label: 'Intermediate', min: 0.25, max: 0.5 };
      if (expRaw.includes('advanced')) return { label: 'Advanced', min: 0.25, max: 0.5 };
      return { label: 'Intermediate', min: 0.25, max: 0.5 };
    })();

    // Normalize into an approximate weekly pace even if the user checked in late (e.g., 9–10 days).
    const weekScale = 7 / Math.max(7, Number(daysSince) || 7);
    const weeklyLoss = (Number(evalWeight) - w) * weekScale; // positive = losing
    const weeklyGain = (w - Number(evalWeight)) * weekScale; // positive = gaining

    const applyAdjustment = (delta, msg, rec) => {
      deltaKcal = delta;
      nextOffset = clampInt(existingOffset + deltaKcal, -1200, 1200, existingOffset);
      nextIterations = existingIter + 1;
      if (nextIterations >= 4) nextFlagged = true;
      adjusted = true;
      recommendation = rec || null;
      warning = msg || null;
    };

    const resetIterations = () => {
      nextIterations = 0;
      adjusted = false;
      deltaKcal = 0;
      recommendation = null;
      warning = null;
    };

    if (!goalMode) {
      resetIterations();
    } else if (goalMode === 'cut') {
      // Cut guidance:
      // - Ideal: ~1.5–2.0 lb/week loss
      // - Too slow: under 1.5 lb/week (or gaining)
      // - Too fast: over 2.0 lb/week; hard cap: 3.0 lb/week
      const pace = weeklyLoss;
      if (!Number.isFinite(pace)) {
        resetIterations();
      } else if (pace <= 0) {
        applyAdjustment(-200, `Cut pace: ${pace.toFixed(2)} lb/week (not losing). Auto-adjusted -200 kcal to tighten the deficit.`, 'run');
      } else if (pace < 1.5) {
        applyAdjustment(-200, `Cut pace: ${pace.toFixed(2)} lb/week (under 1.5). Auto-adjusted -200 kcal to get back on track (~1.5–2.0 lb/week).`, 'run');
      } else if (pace > 3.0) {
        applyAdjustment(+200, `Cut pace: ${pace.toFixed(2)} lb/week (over 3.0). Auto-adjusted +200 kcal to slow the cut (safer pace).`, null);
      } else if (pace > 2.0) {
        applyAdjustment(+200, `Cut pace: ${pace.toFixed(2)} lb/week (over 2.0). Auto-adjusted +200 kcal to slow the cut toward ~1.5–2.0 lb/week.`, null);
      } else {
        resetIterations();
      }
    } else if (goalMode === 'bulk') {
      // Bulk guidance:
      // - Beginner: 0.5–1.0 lb/week
      // - Intermediate/Advanced: 0.25–0.5 lb/week
      // - Hard cap: >2.0 lb/week gain (too fast)
      const pace = weeklyGain;
      if (!Number.isFinite(pace)) {
        resetIterations();
      } else if (pace > 2.0) {
        applyAdjustment(-200, `Bulk pace: ${pace.toFixed(2)} lb/week (over 2.0). Auto-adjusted -200 kcal to reduce unnecessary fat gain.`, 'bulk_supplement');
      } else if (pace <= 0) {
        applyAdjustment(+200, `Bulk pace: ${pace.toFixed(2)} lb/week (not gaining). Auto-adjusted +200 kcal to move toward your target gain range.`, 'bulk_supplement');
      } else if (pace < bulkTargets.min) {
        applyAdjustment(+200, `Bulk pace: ${pace.toFixed(2)} lb/week (below ${bulkTargets.label} target ${bulkTargets.min}–${bulkTargets.max}). Auto-adjusted +200 kcal.`, 'bulk_supplement');
      } else if (pace > bulkTargets.max) {
        applyAdjustment(-200, `Bulk pace: ${pace.toFixed(2)} lb/week (above ${bulkTargets.label} target ${bulkTargets.min}–${bulkTargets.max}). Auto-adjusted -200 kcal.`, 'bulk_supplement');
      } else {
        resetIterations();
      }
    } else {
      resetIterations();
    }

    await db.query(
      `
        UPDATE app_training_profiles
        SET calorie_offset = $2,
            no_progress_iterations = $3,
            flagged = $4,
            eval_weight_lb = $5,
            eval_weight_at = $6,
            updated_at = now()
        WHERE user_id = $1;
      `,
      [userId, nextOffset, nextIterations, nextFlagged, w, todayIso]
    );
  }

  const updated = await getProfile(userId);
  return {
    ok: true,
    profile: updated,
    adjusted,
    deltaKcal,
    iterations: Number(updated?.no_progress_iterations) || 0,
    flagged: !!updated?.flagged,
    recommendation,
    warning
  };
}

async function trainingRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/training')) return false;
  const pathname = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;

  function validatePlanInputs(payload) {
    const discipline = normalizeDiscipline(payload?.discipline);
    const experience = normalizeExperience(payload?.experience);
    const daysPerWeek = clampInt(payload?.daysPerWeek, 2, 6, null);
    if (!discipline) return { ok: false, error: 'Missing discipline' };
    if (!daysPerWeek) return { ok: false, error: 'Missing days per week' };

    const strength = payload?.strength && typeof payload.strength === 'object' ? payload.strength : {};
    if (discipline === 'powerlifting') {
      const squat = Number(strength?.squat);
      const bench = Number(strength?.bench);
      const deadlift = Number(strength?.deadlift);
      const bw = Number(strength?.bodyweight);
      const goalBw = Number(strength?.goalBodyweight);
      const eventType = String(strength?.eventType || '').trim();
      if (!Number.isFinite(squat) || squat <= 0) return { ok: false, error: 'Enter a valid squat' };
      if (!Number.isFinite(bench) || bench <= 0) return { ok: false, error: 'Enter a valid bench' };
      if (!Number.isFinite(deadlift) || deadlift <= 0) return { ok: false, error: 'Enter a valid deadlift' };
      if (!Number.isFinite(bw) || bw <= 0) return { ok: false, error: 'Enter current bodyweight' };
      if (!Number.isFinite(goalBw) || goalBw <= 0) return { ok: false, error: 'Enter goal bodyweight' };
      if (!['full_power', 'bench_only'].includes(eventType)) return { ok: false, error: 'Select event type' };
    }
    if (discipline === 'bodybuilding') {
      const bw = Number(strength?.bodyweight);
      if (!Number.isFinite(bw) || bw <= 0) return { ok: false, error: 'Enter current bodyweight' };

      const hasV2 = strength?.benchWeight != null || strength?.lowerWeight != null || strength?.hingeWeight != null;
      if (hasV2) {
        const height = Number(strength?.height);
        const benchW = Number(strength?.benchWeight);
        const benchR = Number(strength?.benchReps);
        const lowerW = Number(strength?.lowerWeight);
        const lowerR = Number(strength?.lowerReps);
        const hingeW = Number(strength?.hingeWeight);
        const hingeR = Number(strength?.hingeReps);
        if (!Number.isFinite(height) || height <= 0) return { ok: false, error: 'Enter height' };
        if (!Number.isFinite(benchW) || benchW <= 0 || !Number.isFinite(benchR) || benchR <= 0) return { ok: false, error: 'Enter bench working set (weight + reps)' };
        if (!Number.isFinite(lowerW) || lowerW <= 0 || !Number.isFinite(lowerR) || lowerR <= 0) return { ok: false, error: 'Enter squat/leg press working set (weight + reps)' };
        if (!Number.isFinite(hingeW) || hingeW <= 0 || !Number.isFinite(hingeR) || hingeR <= 0) return { ok: false, error: 'Enter deadlift/RDL working set (weight + reps)' };
        const timePerSession = String(strength?.timePerSession || '').trim();
        const trainingAgeBucket = String(strength?.trainingAgeBucket || '').trim();
        const phase = String(strength?.phase || payload?.phase || '').trim().toLowerCase();
        if (!timePerSession) return { ok: false, error: 'Select training time per session' };
        if (!trainingAgeBucket) return { ok: false, error: 'Select training age' };
        if (!phase) return { ok: false, error: 'Select phase' };
        if (['bulk', 'cut'].includes(phase)) {
          const target = Number(strength?.targetWeightLb ?? payload?.targetWeightLb);
          if (!Number.isFinite(target) || target <= 0) return { ok: false, error: 'Enter target weight' };
        }
        const injury = strength?.injury && typeof strength.injury === 'object' ? strength.injury : null;
        const severity = strength?.injurySeverityByJoint && typeof strength.injurySeverityByJoint === 'object'
          ? strength.injurySeverityByJoint
          : {};
        if (injury?.has && Array.isArray(injury?.joints)) {
          for (const j of injury.joints) {
            const v = Number(severity?.[j]);
            if (!Number.isFinite(v) || v < 1 || v > 10) {
              return { ok: false, error: 'Enter injury severity for each selected joint' };
            }
          }
        }
      } else {
        const pw = Number(strength?.pressWeight);
        const pr = Number(strength?.pressReps);
        const rw = Number(strength?.pullWeight);
        const rr = Number(strength?.pullReps);
        const lw = Number(strength?.legWeight);
        const lr = Number(strength?.legReps);
        const pressDate = String(strength?.pressDate || '').trim();
        const pullDate = String(strength?.pullDate || '').trim();
        const legDate = String(strength?.legDate || '').trim();
        const pressMovement = String(strength?.pressMovement || '').trim();
        const pullMovement = String(strength?.pullMovement || '').trim();
        const legMovement = String(strength?.legMovement || '').trim();
        if (!Number.isFinite(pw) || pw <= 0 || !Number.isFinite(pr) || pr <= 0) return { ok: false, error: 'Enter best pressing weight + reps' };
        if (!Number.isFinite(rw) || rw <= 0 || !Number.isFinite(rr) || rr <= 0) return { ok: false, error: 'Enter best pulling weight + reps' };
        if (!Number.isFinite(lw) || lw <= 0 || !Number.isFinite(lr) || lr <= 0) return { ok: false, error: 'Enter best leg movement weight + reps' };
        if (!isDateIso(pressDate) || !isDateIso(pullDate) || !isDateIso(legDate)) {
          return { ok: false, error: 'Enter the last-performed date for each movement' };
        }
        if (!pressMovement || !pullMovement || !legMovement) {
          return { ok: false, error: 'Select movements for pressing, pulling, and legs' };
        }
      }
    }
    if (discipline === 'calisthenics') {
      const pushups = Number(strength?.pushups);
      const pullups = Number(strength?.pullups);
      const dips = Number(strength?.dips);
      if (!Number.isFinite(pushups) || pushups < 0) return { ok: false, error: 'Enter max pushups' };
      if (!Number.isFinite(pullups) || pullups < 0) return { ok: false, error: 'Enter max pullups' };
      if (!Number.isFinite(dips) || dips < 0) return { ok: false, error: 'Enter max dips' };
    }

    return { ok: true, discipline, experience, daysPerWeek, strength };
  }

  // Public, no-account preview plan. Does not write to DB.
  if (pathname === '/api/training/preview' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const validated = validatePlanInputs(payload);
    if (!validated.ok) return sendJson(res, 400, { error: validated.error });

      try {
        const plan = generatePlan({
          discipline: validated.discipline,
          daysPerWeek: validated.daysPerWeek,
          experience: validated.experience,
          strength: validated.strength
        });
        try {
          resolveWorkoutExercises(plan, buildResolverProfile({
            discipline: validated.discipline,
            strength: validated.strength,
            equipmentAccess: payload?.equipmentAccess || null
          }));
        } catch {
          // ignore resolver errors
        }
        try {
          // Don't block preview with slow ExerciseDB calls.
          await enrichPlanWithExerciseMedia(plan, { equipmentAccess: payload?.equipmentAccess || null, maxExercises: 60, timeBudgetMs: 250 });
        } catch {
        // ignore
      }
      plan.meta = { ...(plan.meta || {}), preview: true };
      return sendJson(res, 200, {
        ok: true,
        plan: {
          id: null,
          version: 0,
          discipline: validated.discipline,
          days_per_week: validated.daysPerWeek,
          plan,
          updated_at: new Date().toISOString(),
          preview: true
        }
      });
    } catch (err) {
      console.error('[training-preview]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to build preview plan' });
    }
  }

  if (pathname === '/api/training/quote-bank' && req.method === 'GET') {
    try {
      const raw = fs.readFileSync(QUOTE_BANK_PATH, 'utf8');
      const json = JSON.parse(raw);
      return sendJson(res, 200, { ok: true, quotes: Array.isArray(json) ? json : [] });
    } catch (err) {
      return sendJson(res, 200, { ok: true, quotes: [] });
    }
  }

  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  const user = await resolveUserFromSession(req);
  if (!user) return sendJson(res, 401, { error: 'Not authenticated' });

    if (pathname === '/api/training/state' && req.method === 'GET') {
      const profile = await getProfile(user.id);
      const plan = await getActivePlan(user.id);
      try {
        const equipmentAccess = profile?.equipment_access && typeof profile.equipment_access === 'object' ? profile.equipment_access : null;
        const planObj = plan?.plan && typeof plan.plan === 'object' ? plan.plan : null;
        if (planObj) {
          if (planNeedsResolution(planObj)) {
            try {
              resolveWorkoutExercises(planObj, buildResolverProfile({
                discipline: planObj?.meta?.discipline,
                strength: profile?.strength,
                equipmentAccess
              }));
              await db.query(
                'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
                [JSON.stringify(planObj), plan.id]
              );
            } catch {
              // ignore
            }
          }
          // Kaggle media is local; we can enrich quickly without blocking the UX.
          try {
            const beforeMissing = countExercisesWithoutGif(planObj);
            await enrichPlanWithExerciseMedia(planObj, { equipmentAccess, maxExercises: 140, timeBudgetMs: 350 });
            const afterMissing = countExercisesWithoutGif(planObj);
          if (afterMissing < beforeMissing) {
            await db.query(
              'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
              [JSON.stringify(planObj), plan.id]
            );
          }
        } catch {
          // ignore
        }
        // Finish whatever is left in the background.
        queuePlanMediaEnrichment({ planId: plan.id, planObj, equipmentAccess });
      }
    } catch {
      // ignore
    }
    return sendJson(res, 200, { user, profile, plan });
  }

  if (pathname === '/api/training/reset' && req.method === 'POST') {
    try {
      await db.query('DELETE FROM app_training_plans WHERE user_id = $1;', [user.id]);
      await db.query(
        `
          INSERT INTO app_training_profiles (
            user_id, updated_at, onboarding_complete, discipline, experience, days_per_week,
            strength, equipment_access, first_name, age, location_city, location_state, goals, injuries, profile_image, bio
          )
          VALUES (
            $1, now(), false, NULL, NULL, NULL,
            '{}'::jsonb, '{}'::jsonb, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
          )
          ON CONFLICT (user_id) DO UPDATE SET
            updated_at = now(),
            onboarding_complete = false,
            discipline = NULL,
            experience = NULL,
            days_per_week = NULL,
            strength = '{}'::jsonb,
            equipment_access = '{}'::jsonb,
            first_name = NULL,
            age = NULL,
            location_city = NULL,
            location_state = NULL,
            goals = NULL,
            injuries = NULL,
            profile_image = NULL,
            bio = NULL;
        `,
        [user.id]
      );
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[training-reset]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to reset training data' });
    }
  }

  if (pathname === '/api/training/checkin' && req.method === 'GET') {
    const day = String(url.searchParams.get('day') || '').trim();
    if (!isDateIso(day)) return sendJson(res, 400, { error: 'Missing day (YYYY-MM-DD)' });
    try {
      const result = await db.query(
        `
          SELECT id, day, data, updated_at
          FROM app_daily_checkins
          WHERE user_id = $1 AND day = $2::date
          LIMIT 1;
        `,
        [user.id, day]
      );
      const row = result.rows?.[0] || null;
      return sendJson(res, 200, { checkin: row });
    } catch (err) {
      console.error('[training-checkin-get]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to load check-in' });
    }
  }

  if (pathname === '/api/training/checkin' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const day = String(payload?.day || '').trim();
    if (!isDateIso(day)) return sendJson(res, 400, { error: 'Missing day (YYYY-MM-DD)' });
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const serialized = JSON.stringify(data || {});
    if (serialized.length > 50_000) return sendJson(res, 400, { error: 'Check-in too large' });

    try {
      const result = await db.query(
        `
          INSERT INTO app_daily_checkins (user_id, day, data)
          VALUES ($1, $2::date, $3::jsonb)
          ON CONFLICT (user_id, day) DO UPDATE
          SET data = EXCLUDED.data,
              updated_at = now()
          RETURNING id, day, data, updated_at;
        `,
        [user.id, day, serialized]
      );
      const row = result.rows?.[0] || null;
      return sendJson(res, 200, { ok: true, checkin: row });
    } catch (err) {
      console.error('[training-checkin-post]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to save check-in' });
    }
  }

  if (pathname === '/api/training/weighin' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const weightLb = Number(payload?.weightLb);
    const goalMode = normalizeGoalMode(payload?.goalMode);
    try {
      const result = await upsertWeighin({ userId: user.id, weightLb, goalMode });
      if (!result.ok) return sendJson(res, 400, { error: result.error || 'Invalid weigh-in' });
      return sendJson(res, 200, result);
    } catch (err) {
      console.error('[training-weighin]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to save weigh-in' });
    }
  }

  if (pathname === '/api/training/profile' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    try {
      const profile = await patchProfile(user.id, { profileImage: payload?.profileImage, bio: payload?.bio });
      if (!profile) return sendJson(res, 400, { error: 'Invalid profile update' });
      return sendJson(res, 200, { ok: true, profile });
    } catch (err) {
      console.error('[training-profile]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to update profile' });
    }
  }

  if (pathname === '/api/training/progress-photos' && req.method === 'GET') {
    const pose = normalizeProgressPose(url.searchParams.get('pose') || '');
    const limit = clampInt(url.searchParams.get('limit') || 60, 1, 365, 60);
    try {
      const result = await db.query(
        `
          SELECT id, day::text AS day, pose, created_at, updated_at, image_data_url
          FROM app_progress_photos
          WHERE user_id = $1
            AND ($2::text IS NULL OR pose = $2::text)
          ORDER BY day DESC, updated_at DESC
          LIMIT $3;
        `,
        [user.id, pose, limit]
      );
      const photos = (result.rows || []).map((r) => ({
        id: r.id,
        day: String(r.day || '').slice(0, 10),
        pose: String(r.pose || ''),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        imageDataUrl: String(r.image_data_url || '')
      }));
      return sendJson(res, 200, { ok: true, photos });
    } catch (err) {
      console.error('[training-progress-photos-get]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to load progress photos' });
    }
  }

  if (pathname === '/api/training/progress-photos' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const day = String(payload?.day || '').trim();
    const pose = normalizeProgressPose(payload?.pose);
    const imageDataUrl = normalizeDataUrlImage(payload?.imageDataUrl);
    if (!isDateIso(day)) return sendJson(res, 400, { error: 'Missing day (YYYY-MM-DD)' });
    if (!pose) return sendJson(res, 400, { error: 'Missing pose (front|side|back)' });
    if (!imageDataUrl) return sendJson(res, 400, { error: 'Missing imageDataUrl' });

    try {
      const result = await db.query(
        `
          INSERT INTO app_progress_photos (user_id, day, pose, image_data_url)
          VALUES ($1, $2::date, $3::text, $4::text)
          ON CONFLICT (user_id, day, pose) DO UPDATE
          SET image_data_url = EXCLUDED.image_data_url,
              updated_at = now()
          RETURNING id, day::text AS day, pose, created_at, updated_at, image_data_url;
        `,
        [user.id, day, pose, imageDataUrl]
      );
      const row = result.rows?.[0] || null;
      return sendJson(res, 200, {
        ok: true,
        photo: row ? {
          id: row.id,
          day: String(row.day || '').slice(0, 10),
          pose: String(row.pose || ''),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          imageDataUrl: String(row.image_data_url || '')
        } : null
      });
    } catch (err) {
      console.error('[training-progress-photos-post]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to save progress photo' });
    }
  }

  if (pathname === '/api/training/onboarding' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const validated = validatePlanInputs(payload);
    if (!validated.ok) return sendJson(res, 400, { error: validated.error });

    try {
      await upsertProfile(user.id, payload);
      const plan = await createNewPlan(user.id, {
        discipline: validated.discipline,
        daysPerWeek: validated.daysPerWeek,
        experience: validated.experience,
        strength: validated.strength,
        equipmentAccess: payload?.equipmentAccess || null
      });
      const logs = plan ? await listWorkoutLogs({ userId: user.id, planId: plan.id }) : [];
      return sendJson(res, 200, { ok: true, plan, logs });
    } catch (err) {
      console.error('[training-onboarding]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to save onboarding' });
    }
  }

  if (pathname === '/api/training/logs' && req.method === 'GET') {
    const planId = String(url.searchParams.get('planId') || '').trim();
    if (!planId) return sendJson(res, 400, { error: 'Missing planId' });
    try {
      const logs = await listWorkoutLogs({ userId: user.id, planId });
      return sendJson(res, 200, { logs });
    } catch (err) {
      console.error('[training-logs]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to load logs' });
    }
  }

  if (pathname === '/api/training/log' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const planId = safeText(payload?.planId, 80);
    const weekIndex = clampInt(payload?.weekIndex, 1, 52, null);
    const dayIndex = clampInt(payload?.dayIndex, 1, 7, null);
    if (!planId || !weekIndex || !dayIndex) return sendJson(res, 400, { error: 'Missing plan/week/day' });

    try {
      await upsertWorkoutLog({
        userId: user.id,
        planId,
        weekIndex,
        dayIndex,
        performedAt: payload?.performedAt || null,
        entries: payload?.entries || [],
        notes: payload?.notes || ''
      });
      const updatedPlan = await applyProgressionFromLog({
        userId: user.id,
        planId,
        logPayload: {
          weekIndex,
          dayIndex,
          entries: payload?.entries || [],
          notes: payload?.notes || ''
        }
      });
      return sendJson(res, 200, { ok: true, plan: updatedPlan });
    } catch (err) {
      console.error('[training-log]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to save log' });
    }
  }

  if (pathname === '/api/training/event' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const eventType = safeText(payload?.eventType, 80);
    const data = payload?.payload && typeof payload.payload === 'object' ? payload.payload : {};
    if (!eventType) return sendJson(res, 400, { error: 'Missing eventType' });
    try {
      await db.query(
        `INSERT INTO app_training_events (user_id, event_type, payload) VALUES ($1, $2, $3::jsonb);`,
        [user.id, eventType, JSON.stringify(data)]
      );
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[training-event]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to log event' });
    }
  }

  if (pathname === '/api/training/override' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const planId = safeText(payload?.planId, 80);
    const weekIndex = clampInt(payload?.weekIndex, 1, 52, null);
    const dayIndex = clampInt(payload?.dayIndex, 1, 7, null);
    const exerciseId = safeText(payload?.exerciseId, 120);
    const projected = Number(payload?.projected);
    if (!planId || !weekIndex || !dayIndex || !exerciseId) return sendJson(res, 400, { error: 'Missing override params' });
    if (!Number.isFinite(projected) || projected <= 0) return sendJson(res, 400, { error: 'Invalid projected value' });

    try {
      const plan = await patchProjectedWeight({ userId: user.id, planId, weekIndex, dayIndex, exerciseId, nextProjected: projected });
      if (!plan) return sendJson(res, 404, { error: 'Plan or exercise not found' });
      return sendJson(res, 200, { ok: true, plan });
    } catch (err) {
      console.error('[training-override]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to update plan' });
    }
  }

  return sendJson(res, 404, { error: 'Unknown training route' });
}

module.exports = trainingRoutes;
