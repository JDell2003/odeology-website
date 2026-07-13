// core/scoringGather.js
// v2 scoring (SCORING_ENGINE_V2): every piece of scoring SQL lives in this
// module so the engine (core/scoringEngine.js) stays pure and DB-free.
// This module owns:
//   - scoringV2Enabled(): the master feature flag (env var, default OFF)
//   - ensureScoringSchema(): additive-only migrations for the v2 score tables
//   - gatherUserScoringInputs(): reads raw rows -> one plain object for the engine
//     (added by Task 3)
'use strict';

const db = require('./db');

// Master feature flag. Default false — the owner flips SCORING_ENGINE_V2=true
// on Railway after reviewing DEPLOYMENT.md. Read per-call so tests can toggle it.
function scoringV2Enabled() {
  return String(process.env.SCORING_ENGINE_V2 || '').trim().toLowerCase() === 'true';
}

let schemaEnsured = false;
let schemaEnsurePromise = null;

async function ensureScoringSchema() {
  if (schemaEnsured) return;
  if (!db.isConfigured()) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;

  schemaEnsurePromise = (async () => {
    await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;').catch(() => null);

    // 1b. Authoritative daily score snapshot (enables sustain gates + honest
    // decay + history). One row per user per day.
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_score_snapshots (
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        day date NOT NULL,
        strength numeric(5,2) NOT NULL DEFAULT 0,
        cardio numeric(5,2) NOT NULL DEFAULT 0,
        consistency numeric(5,2) NOT NULL DEFAULT 0,
        nutrition numeric(5,2) NOT NULL DEFAULT 0,
        recovery numeric(5,2) NOT NULL DEFAULT 0,
        progress numeric(5,2) NOT NULL DEFAULT 0,
        rank text NOT NULL DEFAULT 'peasant',
        caste text,
        weeks_at_rank int NOT NULL DEFAULT 0,
        normalized boolean NOT NULL DEFAULT false, -- false = self-improvement-only (sex missing)
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, day)
      );
    `);

    // 1c. Append-only event ledger (explainability + audit + anomaly flags).
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_score_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        axis text NOT NULL,
        delta numeric(6,2),
        reason_code text NOT NULL,
        provenance text,                    -- 'device' | 'self_report' | 'implausible'
        trust_multiplier numeric(3,2),
        source_ref text,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_score_events_user_time ON app_score_events (user_id, created_at DESC);');

    // 1d. Edit audit (fixes upsert-in-place destroying history).
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_edit_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        table_name text NOT NULL,
        row_key text NOT NULL,
        field text,
        old_value jsonb,
        new_value jsonb,
        actor text NOT NULL DEFAULT 'user'
      );
    `);

    schemaEnsured = true;
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

// ---------------------------------------------------------------------------
// gatherUserScoringInputs(dbi, userId, sinceDate?) -> plain inputs object for
// core/scoringEngine.js computeAxes(). All SQL for the engine lives HERE.
// ---------------------------------------------------------------------------
const C = require('./scoringConstants');
const engine = require('./scoringEngine');

const DAY_MS = 86_400_000;

function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function daysAgoOf(dayIso, todayIso) {
  return Math.round((new Date(`${todayIso}T00:00:00Z`) - new Date(`${dayIso}T00:00:00Z`)) / DAY_MS);
}

// Map a lift-history exercise_key onto the four main lifts. Best-effort name
// match; anything ambiguous (romanian deadlift, split squat...) is excluded.
// TODO(owner): curate an explicit exercise_key -> main-lift map if these
// heuristics miss house exercise names.
function mapMainLift(keyRaw) {
  const key = String(keyRaw || '').toLowerCase();
  if (!key) return null;
  if (/(romanian|rdl|stiff|single|split|bulgarian|pistol|goblet|sissy|hack)/.test(key)) return null;
  if (/deadlift/.test(key)) return 'deadlift';
  if (/(overhead[\s_-]?press|military[\s_-]?press|\bohp\b|shoulder[\s_-]?press)/.test(key)) return 'ohp';
  if (/bench/.test(key) && !/close[\s_-]?grip|decline/.test(key)) return 'bench';
  if (/squat/.test(key) && !/front/.test(key)) return 'squat';
  return null;
}

function normalizeGoalModeFromProfile(profileRow) {
  const phase = String(profileRow?.strength?.phase || '').toLowerCase();
  if (phase === 'cut') return 'cut';
  if (phase === 'bulk') return 'bulk';
  if (phase === 'maintain') return 'maintain';
  const goals = String(profileRow?.goals || '').toLowerCase();
  if (/\bcut|lose|lean\b/.test(goals)) return 'cut';
  if (/\bbulk|gain|build|swole\b/.test(goals)) return 'bulk';
  return 'maintain';
}

function minutesOfDayInTz(ts, timezone) {
  if (!ts) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || process.env.DEFAULT_TZ || 'America/New_York',
      hour: 'numeric', minute: 'numeric', hour12: false
    });
    const parts = fmt.formatToParts(new Date(ts));
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  } catch {
    return null;
  }
}

function deviceOrSelf(source) {
  const s = String(source || '').toLowerCase();
  if (!s || s === 'manual') return 'self_report';
  return 'device'; // strava | fitbit | gps | alarm
}

async function gatherUserScoringInputs(dbi, userId, sinceDate) {
  const dbc = dbi || db;
  const today = sinceDate ? new Date(sinceDate) : new Date();
  const todayIso = isoDay(today);
  const maxWindow = Math.max(C.windows.strengthDays, C.windows.consistencyDays, C.windows.progressDays);

  const [profileRes, liftsRes, healthRes, checkinsRes, workoutsRes, snapshotsRes, flagsRes] = await Promise.all([
    dbc.query(
      `SELECT sex, dob::text AS dob, timezone, age, experience, days_per_week, goals, strength,
              last_weighin_lb, eval_weight_lb
       FROM app_training_profiles WHERE user_id = $1 LIMIT 1;`,
      [userId]
    ),
    dbc.query(
      `SELECT exercise_key, last_weight_lb, last_reps, last_estimated_1rm_lb, last_performed_at::text AS last_performed_at,
              best_weight_lb, best_reps, best_estimated_1rm_lb, best_performed_at::text AS best_performed_at, last_source
       FROM app_training_lift_history WHERE user_id = $1;`,
      [userId]
    ),
    dbc.query(
      `SELECT day::text AS day, steps, active_minutes, sleep_minutes, vigorous_minutes,
              distance_meters, vo2max, resting_hr, gym_visit,
              wake_result, wake_at, sleep_start_at, sources
       FROM app_health_daily
       WHERE user_id = $1 AND day > ($2::date - INTERVAL '${maxWindow} days');`,
      [userId, todayIso]
    ),
    dbc.query(
      `SELECT day::text AS day, data, sources
       FROM app_daily_checkins
       WHERE user_id = $1 AND day > ($2::date - INTERVAL '${maxWindow} days');`,
      [userId, todayIso]
    ),
    dbc.query(
      `SELECT COALESCE(performed_at, created_at::date)::text AS day, duration_ms, timer_started_at, timer_ended_at, entries
       FROM app_training_workouts
       WHERE user_id = $1 AND COALESCE(performed_at, created_at::date) > ($2::date - INTERVAL '${maxWindow} days');`,
      [userId, todayIso]
    ),
    dbc.query(
      `SELECT day::text AS day, strength, cardio, consistency, nutrition, recovery, progress, rank, weeks_at_rank
       FROM app_score_snapshots
       WHERE user_id = $1 AND day < $2::date
       ORDER BY day DESC LIMIT 70;`,
      [userId, todayIso]
    ),
    dbc.query(
      `SELECT reason_code, source_ref
       FROM app_score_events
       WHERE user_id = $1 AND reason_code LIKE 'flag_%'
         AND created_at > now() - INTERVAL '${C.windows.strengthDays} days';`,
      [userId]
    ).catch(() => ({ rows: [] }))
  ]);

  // Task 7: lifts flagged implausible (e1RM jump) or from voided workouts earn
  // zero trust — exclude them from the strength bank entirely.
  const flaggedLiftKeys = new Set(
    (flagsRes.rows || [])
      .filter((r) => r.reason_code === 'flag_e1rm_jump' && r.source_ref)
      .map((r) => String(r.source_ref))
  );

  const profileRow = profileRes.rows?.[0] || {};
  const strengthBlob = profileRow.strength && typeof profileRow.strength === 'object' ? profileRow.strength : {};
  const bodyweightLb = Number(profileRow.last_weighin_lb) || Number(profileRow.eval_weight_lb) || Number(strengthBlob.bodyweight) || null;
  const experienceRaw = String(profileRow.experience || '').toLowerCase();
  const experience = experienceRaw === 'advanced' ? 'advanced' : experienceRaw === 'intermediate' ? 'intermediate' : 'beginner';
  const timezone = profileRow.timezone || process.env.DEFAULT_TZ || null;
  const profile = {
    sex: profileRow.sex || null,
    dob: profileRow.dob || null,
    age: Number(profileRow.age) || null,
    timezone,
    bodyweightLb,
    experience
  };
  const goalMode = normalizeGoalModeFromProfile(profileRow);

  // --- strength ---
  const bestE1rmByLift = {};
  const allTimeByLift = {};
  let lastLiftDay = null;
  for (const row of liftsRes.rows || []) {
    if (flaggedLiftKeys.has(String(row.exercise_key || ''))) continue; // trust x0
    const lift = mapMainLift(row.exercise_key);
    if (!lift) continue;
    const lastAt = row.last_performed_at || null;
    const bestAt = row.best_performed_at || null;
    if (lastAt && (!lastLiftDay || lastAt > lastLiftDay)) lastLiftDay = lastAt;
    const windowCut = isoDay(new Date(today - C.windows.strengthDays * DAY_MS));
    // best within the rolling window: consider both stored aggregates
    const candidates = [];
    if (lastAt && lastAt >= windowCut && Number(row.last_estimated_1rm_lb) > 0) candidates.push(Number(row.last_estimated_1rm_lb));
    if (bestAt && bestAt >= windowCut && Number(row.best_estimated_1rm_lb) > 0) candidates.push(Number(row.best_estimated_1rm_lb));
    if (candidates.length) {
      bestE1rmByLift[lift] = Math.max(bestE1rmByLift[lift] || 0, ...candidates);
    }
    if (Number(row.best_estimated_1rm_lb) > 0) {
      allTimeByLift[lift] = Math.max(allTimeByLift[lift] || 0, Number(row.best_estimated_1rm_lb));
    }
  }
  const windowVals = Object.values(bestE1rmByLift).filter((v) => v > 0);
  const baselineVals = Object.values(allTimeByLift).filter((v) => v > 0);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const currentAvgRelStrength = bodyweightLb && mean(windowVals) ? mean(windowVals) / bodyweightLb : null;
  const baselineAvgRelStrength = bodyweightLb && mean(baselineVals) ? mean(baselineVals) / bodyweightLb : null;

  // --- day maps ---
  const healthByDay = new Map((healthRes.rows || []).map((r) => [r.day, r]));
  const checkinByDay = new Map((checkinsRes.rows || []).map((r) => [r.day, r]));
  const workoutDays = new Set((workoutsRes.rows || []).map((r) => r.day).filter(Boolean));

  let lastWorkoutDay = null;
  for (const d of workoutDays) if (!lastWorkoutDay || d > lastWorkoutDay) lastWorkoutDay = d;
  const strengthIdleDays = lastLiftDay || lastWorkoutDay
    ? daysAgoOf((lastLiftDay && lastWorkoutDay) ? (lastLiftDay > lastWorkoutDay ? lastLiftDay : lastWorkoutDay) : (lastLiftDay || lastWorkoutDay), todayIso)
    : 999;

  // Trust ladder (Task 6): a lift session is device-verified when the
  // workout's timer window falls on a day with a GPS-verified gym visit
  // (gym_visit=true from the geofence check-in); otherwise self_report.
  const workoutTimerDays = new Set(
    (workoutsRes.rows || [])
      .filter((r) => r.timer_started_at && r.timer_ended_at)
      .map((r) => r.day)
      .filter(Boolean)
  );
  const lastLiftHealth = lastLiftDay ? healthByDay.get(lastLiftDay) : null;
  const strengthProvenance = (lastLiftHealth?.gym_visit === true && workoutTimerDays.has(lastLiftDay))
    ? 'device' : 'self_report';

  // --- cardio (14d) — Task 8: graded minutes-at-intensity + VO2max ---
  // Dedupe: app_health_daily already holds ONE row per day; upsertDaily
  // COALESCE-merges providers so the same run reported in-app and via a
  // wearable does not double-count active_minutes. We split total active
  // minutes into vigorous (from the vigorous_minutes column) and the moderate
  // remainder, and take the most recent non-null VO2max in the window.
  let cardioModerate14 = 0, cardioVigorous14 = 0;
  let cardioDeviceMinutes = 0, cardioTotalMinutes = 0;
  let lastCardioDay = null;
  let stepsSum = 0, stepsDays = 0;
  let latestVo2max = null, latestVo2maxDay = null;
  for (let i = 0; i < C.windows.cardioDays; i++) {
    const day = isoDay(new Date(today - i * DAY_MS));
    const h = healthByDay.get(day);
    if (!h) continue;
    const mins = Number(h.active_minutes) || 0;
    const vig = Math.min(mins, Number(h.vigorous_minutes) || 0);
    const mod = Math.max(0, mins - vig);
    if (mins > 0) {
      cardioModerate14 += mod;
      cardioVigorous14 += vig;
      cardioTotalMinutes += mins;
      if (deviceOrSelf((h.sources || {}).activeMinutes) === 'device') cardioDeviceMinutes += mins;
      if (!lastCardioDay || day > lastCardioDay) lastCardioDay = day;
    }
    if (Number(h.steps) > 0) { stepsSum += Number(h.steps); stepsDays += 1; }
    if (Number(h.vo2max) > 0 && (!latestVo2maxDay || day > latestVo2maxDay)) {
      latestVo2max = Number(h.vo2max);
      latestVo2maxDay = day;
    }
  }
  const cardio = {
    weeklyModerateMinutes: (cardioModerate14 / C.windows.cardioDays) * 7,
    weeklyVigorousMinutes: (cardioVigorous14 / C.windows.cardioDays) * 7,
    vo2max: latestVo2max,
    stepsAvgPerDay: stepsDays ? stepsSum / stepsDays : 0,
    provenance: cardioTotalMinutes > 0 && cardioDeviceMinutes >= cardioTotalMinutes / 2 ? 'device' : 'self_report',
    idleDays: lastCardioDay ? daysAgoOf(lastCardioDay, todayIso) : 999,
    pauseActive: false
  };

  // --- consistency (28d) ---
  const consistencyDays = [];
  let lastActiveDay = null;
  for (let i = 0; i < C.windows.consistencyDays; i++) {
    const day = isoDay(new Date(today - i * DAY_MS));
    const h = healthByDay.get(day);
    const ck = checkinByDay.get(day);
    const worked = workoutDays.has(day);
    const active = Boolean(worked || ck || (h && ((Number(h.active_minutes) || 0) >= 20 || (Number(h.steps) || 0) >= C.cardio.stepGoal || h.gym_visit === true)));
    const provenance = worked || ck ? 'self_report' : h ? deviceOrSelf((h.sources || {}).activeMinutes || (h.sources || {}).steps) : 'self_report';
    // device-verified activity counts fully; a bare check-in is self-report
    const prov = (h && (h.gym_visit === true || deviceOrSelf((h.sources || {}).activeMinutes) === 'device')) ? 'device' : provenance;
    consistencyDays.push({ daysAgo: i, active, provenance: prov });
    if (active && (!lastActiveDay || day > lastActiveDay)) lastActiveDay = day;
  }
  const consistency = {
    days: consistencyDays,
    idleDays: lastActiveDay ? daysAgoOf(lastActiveDay, todayIso) : 999,
    pauseActive: false
  };

  // --- nutrition (14d) ---
  const nutritionDays = [];
  let lastNutritionDay = null;
  for (let i = 0; i < C.windows.nutritionDays; i++) {
    const day = isoDay(new Date(today - i * DAY_MS));
    const ck = checkinByDay.get(day);
    if (!ck) continue;
    const data = ck.data && typeof ck.data === 'object' ? ck.data : {};
    const macros = data.macros && typeof data.macros === 'object' ? data.macros : {};
    nutritionDays.push({
      daysAgo: i,
      calories: Number(macros.calories) || null,
      proteinG: Number(macros.proteinG) || null,
      mealsOnPlan: data.mealsOnPlan || null,
      provenance: 'self_report'
    });
    if (!lastNutritionDay || day > lastNutritionDay) lastNutritionDay = day;
  }
  const nutrition = {
    days: nutritionDays,
    calorieTargetKcal: null, // TODO(owner): surface the client Mifflin target server-side
    weightKg: bodyweightLb ? bodyweightLb / 2.2046226218 : null,
    goalMode,
    idleDays: lastNutritionDay ? daysAgoOf(lastNutritionDay, todayIso) : 999,
    pauseActive: false
  };

  // --- recovery (14d) ---
  const recoveryDays = [];
  let lastRecoveryDay = null;
  for (let i = 0; i < C.windows.recoveryDays; i++) {
    const day = isoDay(new Date(today - i * DAY_MS));
    const h = healthByDay.get(day);
    const ck = checkinByDay.get(day);
    const data = ck?.data && typeof ck.data === 'object' ? ck.data : {};
    let sleepMinutes = Number(h?.sleep_minutes) || null;
    let provenance = h?.sleep_minutes ? deviceOrSelf((h.sources || {}).sleepMinutes) : null;
    if (!sleepMinutes && Number(data.sleepHours) > 0) {
      sleepMinutes = Number(data.sleepHours) * 60;
      provenance = 'self_report';
    }
    const mood = Number(data.mood);
    if (!sleepMinutes && !Number.isFinite(mood)) continue;
    recoveryDays.push({
      daysAgo: i,
      sleepMinutes: sleepMinutes || null,
      wakeAtMinutesOfDay: minutesOfDayInTz(h?.wake_at, timezone),
      restedness1to5: Number.isFinite(mood) ? mood : null,
      provenance: provenance || 'self_report'
    });
    if (!lastRecoveryDay || day > lastRecoveryDay) lastRecoveryDay = day;
  }
  // consecutive training days ending today/yesterday (grind detector)
  let consecutiveTrainingDays = 0;
  for (let i = 0; i < C.windows.consistencyDays; i++) {
    const day = isoDay(new Date(today - i * DAY_MS));
    if (workoutDays.has(day)) consecutiveTrainingDays += 1;
    else if (i > 0) break;
  }
  const age = engine.ageFrom(profile, today);
  const recovery = {
    days: recoveryDays,
    consecutiveTrainingDays,
    isSenior: Boolean(age && age >= 65),
    idleDays: lastRecoveryDay ? daysAgoOf(lastRecoveryDay, todayIso) : 999,
    pauseActive: false
  };

  // --- progress (28d) ---
  const weighins = [];
  let lastWeighinDay = null;
  for (let i = 0; i < C.windows.progressDays; i++) {
    const day = isoDay(new Date(today - i * DAY_MS));
    const ck = checkinByDay.get(day);
    const w = Number(ck?.data?.weightLb);
    if (Number.isFinite(w) && w > 0) {
      weighins.push({ daysAgo: i, weightLb: w });
      if (!lastWeighinDay || day > lastWeighinDay) lastWeighinDay = day;
    }
  }
  const liftImprovementRatio = currentAvgRelStrength && baselineAvgRelStrength
    ? currentAvgRelStrength / baselineAvgRelStrength : null;
  const progress = {
    weighins,
    goalMode,
    experience,
    liftImprovementRatio,
    idleDays: lastWeighinDay ? daysAgoOf(lastWeighinDay, todayIso) : 999,
    pauseActive: false
  };

  // --- previous snapshot + sustain weeks ---
  const snapshots = snapshotsRes.rows || [];
  const prevScores = snapshots.length ? {
    strength: Number(snapshots[0].strength), cardio: Number(snapshots[0].cardio),
    consistency: Number(snapshots[0].consistency), nutrition: Number(snapshots[0].nutrition),
    recovery: Number(snapshots[0].recovery), progress: Number(snapshots[0].progress)
  } : {};
  // For each rank, count consecutive days (walking back from the latest
  // snapshot) where that rank's avg/floor/pierce gates were met.
  const weeksAtCandidate = {};
  for (const [id, gate] of Object.entries(C.ranks)) {
    let run = 0;
    for (let i = 0; i < snapshots.length; i++) {
      const s = snapshots[i];
      const v = engine.AXES.map((a) => Number(s[a]) || 0);
      const avg = v.reduce((x, y) => x + y, 0) / v.length;
      const min = Math.min(...v);
      const spike = Math.max(...v);
      const byAvg = avg >= gate.avg && min >= (gate.floor || 0);
      const byPierce = !gate.noPierce && spike >= (gate.spike || 999);
      // require an unbroken daily run
      if ((byAvg || byPierce) && daysAgoOf(s.day, todayIso) === i + 1) run += 1;
      else break;
    }
    weeksAtCandidate[id] = Math.floor(run / 7);
  }

  return {
    profile,
    strength: {
      bestE1rmByLift,
      currentAvgRelStrength,
      baselineAvgRelStrength,
      idleDays: strengthIdleDays,
      provenance: strengthProvenance,
      pauseActive: false
    },
    cardio,
    consistency,
    nutrition,
    recovery,
    progress,
    weeksAtCandidate,
    prevScores,
    prevSnapshot: snapshots[0] || null,
    recentSnapshots: snapshots,
    todayIso
  };
}

// ---------------------------------------------------------------------------
// Task 4 — persistence + recompute triggers.
// ---------------------------------------------------------------------------

// Single-instance guard key for the nightly job (arbitrary constant; must be
// stable across replicas so only one Railway instance computes per tick).
const NIGHTLY_ADVISORY_LOCK_KEY = 727274637;

async function computeAndPersistUserScore(userId, { now = new Date() } = {}) {
  const inputs = await gatherUserScoringInputs(db, userId, now);
  const result = engine.computeAxes(inputs, inputs.prevScores, now);

  // weeks_at_rank: unbroken run of consecutive snapshot days holding this rank
  // (walking back from yesterday), plus today, floored to weeks.
  let run = 0;
  for (let i = 0; i < (inputs.recentSnapshots || []).length; i++) {
    const s = inputs.recentSnapshots[i];
    const daysAgo = Math.round((new Date(`${inputs.todayIso}T00:00:00Z`) - new Date(`${s.day}T00:00:00Z`)) / DAY_MS);
    if (s.rank === result.rank && daysAgo === i + 1) run += 1;
    else break;
  }
  const weeksAtRank = Math.floor((run + 1) / 7);

  await db.query(
    `
      INSERT INTO app_score_snapshots
        (user_id, day, strength, cardio, consistency, nutrition, recovery, progress,
         rank, caste, weeks_at_rank, normalized, computed_at)
      VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
      ON CONFLICT (user_id, day) DO UPDATE SET
        strength = EXCLUDED.strength, cardio = EXCLUDED.cardio,
        consistency = EXCLUDED.consistency, nutrition = EXCLUDED.nutrition,
        recovery = EXCLUDED.recovery, progress = EXCLUDED.progress,
        rank = EXCLUDED.rank, caste = EXCLUDED.caste,
        weeks_at_rank = EXCLUDED.weeks_at_rank, normalized = EXCLUDED.normalized,
        computed_at = now();
    `,
    [
      userId, inputs.todayIso,
      result.axes.strength, result.axes.cardio, result.axes.consistency,
      result.axes.nutrition, result.axes.recovery, result.axes.progress,
      result.rank, result.caste, weeksAtRank, result.normalized
    ]
  );

  for (const ev of result.events) {
    await db.query(
      `INSERT INTO app_score_events (user_id, axis, delta, reason_code, provenance, trust_multiplier, source_ref, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb);`,
      [userId, ev.axis, ev.delta ?? null, ev.reason_code, ev.provenance ?? null,
        ev.trust_multiplier ?? null, ev.source_ref ?? null, JSON.stringify(ev.detail || {})]
    ).catch(() => null); // events are explanatory — never fail the snapshot
  }

  return { ...result, weeksAtRank };
}

// Users worth recomputing: anyone with scoring-relevant activity or an
// existing snapshot in the last 30 days.
async function listActiveScoringUserIds(limit = 2000) {
  const res = await db.query(
    `
      SELECT DISTINCT user_id FROM (
        SELECT user_id FROM app_training_workouts WHERE created_at > now() - INTERVAL '30 days'
        UNION SELECT user_id FROM app_daily_checkins WHERE updated_at > now() - INTERVAL '30 days'
        UNION SELECT user_id FROM app_health_daily WHERE updated_at > now() - INTERVAL '30 days'
        UNION SELECT user_id FROM app_score_snapshots WHERE day > CURRENT_DATE - 30
      ) u LIMIT $1;
    `,
    [limit]
  );
  return (res.rows || []).map((r) => r.user_id);
}

// Nightly/periodic full pass. Wrapped in a session-scoped advisory lock held on
// ONE pooled client so multiple Railway replicas never double-run (Task 11 C).
async function runScoringRecomputePass({ log = console } = {}) {
  if (!scoringV2Enabled() || !db.isConfigured()) return { ran: false, reason: 'disabled' };
  await ensureScoringSchema();
  return await db.withClient(async (client) => {
    const lockRes = await client.query('SELECT pg_try_advisory_lock($1) AS locked;', [NIGHTLY_ADVISORY_LOCK_KEY]);
    if (!lockRes.rows?.[0]?.locked) {
      log.log('[scoring] recompute pass skipped - another instance holds the advisory lock');
      return { ran: false, reason: 'locked' };
    }
    try {
      const userIds = await listActiveScoringUserIds();
      let ok = 0, failed = 0;
      for (const userId of userIds) {
        try {
          await computeAndPersistUserScore(userId);
          ok += 1;
        } catch (err) {
          failed += 1;
          log.error('[scoring] recompute failed for user', userId, err?.message || err);
        }
      }
      log.log(`[scoring] recompute pass done: ${ok} ok, ${failed} failed`);
      return { ran: true, ok, failed };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1);', [NIGHTLY_ADVISORY_LOCK_KEY]).catch(() => null);
    }
  });
}

// Lightweight per-user recompute after a write (log/check-in/sync) so the
// user's own score feels responsive. Debounced in-memory; fire-and-forget.
const pendingUserRecomputes = new Set();
function enqueueUserRecompute(userId) {
  if (!scoringV2Enabled() || !db.isConfigured() || !userId) return;
  if (pendingUserRecomputes.has(userId)) return;
  pendingUserRecomputes.add(userId);
  setTimeout(async () => {
    pendingUserRecomputes.delete(userId);
    try {
      await ensureScoringSchema();
      await computeAndPersistUserScore(userId);
    } catch (err) {
      console.error('[scoring] on-write recompute failed', err?.message || err);
    }
  }, 250);
}

// ---------------------------------------------------------------------------
// Task 7 — integrity utilities shared by the route modules.
// ---------------------------------------------------------------------------

// Per-user, per-endpoint in-memory token bucket. Only bites when the flag is
// on; legacy behavior is untouched otherwise.
const writeBuckets = new Map();
function scoringWriteAllowed(userId, endpoint) {
  if (!scoringV2Enabled()) return true;
  const lim = C.engineExtras.integrity.rateLimit;
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  let bucket = writeBuckets.get(key);
  if (!bucket || now - bucket.start > lim.windowMinutes * 60_000) {
    bucket = { start: now, count: 0 };
    writeBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (writeBuckets.size > 10_000) writeBuckets.clear(); // crude memory guard
  return bucket.count <= lim.maxWrites;
}

// Append an anomaly flag to the score-event ledger (reason_code 'flag_*',
// provenance 'implausible', trust x0 on the offending delta).
async function recordScoringFlag(userId, { axis, reasonCode, sourceRef = null, detail = {} } = {}) {
  if (!scoringV2Enabled() || !db.isConfigured() || !userId) return;
  try {
    await ensureScoringSchema();
    await db.query(
      `INSERT INTO app_score_events (user_id, axis, delta, reason_code, provenance, trust_multiplier, source_ref, detail)
       VALUES ($1, $2, 0, $3, 'implausible', 0, $4, $5::jsonb);`,
      [userId, axis, reasonCode, sourceRef, JSON.stringify(detail || {})]
    );
  } catch (err) {
    console.error('[scoring] failed to record flag', reasonCode, err?.message || err);
  }
}

module.exports = {
  scoringV2Enabled, ensureScoringSchema, gatherUserScoringInputs, mapMainLift,
  computeAndPersistUserScore, listActiveScoringUserIds, runScoringRecomputePass,
  enqueueUserRecompute, NIGHTLY_ADVISORY_LOCK_KEY,
  scoringWriteAllowed, recordScoringFlag
};
