# RiseForIt Scoring Audit — Code-Level Answers to 40 Questions

Read-only audit of `D:\Jasons Web` (RiseForIt fitness web app), July 13, 2026. All file paths are relative to the repo root. Line numbers are approximate but verified against source.

---

## Executive summary: what exists vs. what's missing

**Critical framing: there are TWO scoring systems that don't share code.**

1. **The six-axis spider graph** (`js/identity-engine.js`) runs **100% client-side in the browser off localStorage**. One shared growth/decay model drives all six axes (strength, cardio, consistency, nutrition, recovery, progress) from raw 14-day activity *counts*. No physiological normalization of any kind.
2. **A backend monthly points leaderboard** (`core/leaderboardRoutes.js`) computes points (workouts×25, check-ins×10, etc.) from Postgres on-demand per request. The leaderboard page *approximates* six axes from this breakdown for other users' radars.

**Exists and works:** Postgres (Neon) with real tables for workouts (`app_training_workouts`, sets in jsonb), daily check-ins (`app_daily_checkins`, one jsonb blob per day), health daily rollup (`app_health_daily`: steps/active_minutes/sleep_minutes/distance/gym_visit/wake_result with per-metric `sources` provenance), lift history with Epley e1RM (`app_training_lift_history`), progress photos. Strava + Fitbit OAuth sync (minimal fields). The rise alarm (clean/snoozed wake), GPS gym geofence (161 m haversine), a 759-exercise library with equipment/muscle/mechanic metadata, per-exercise prescribed `restSec`, per-workout timer start/end timestamps, Mifflin–St Jeor calorie targets, the "8,000 steps = 1 cardio credit" rule, 14-day rolling window + idle decay, rank tiers (Peasant→Squire→Specialist→Knight→King) with Berserker/Ranger/Mage specialist classifiers implemented in code.

**Missing / not implemented:** no server-side or scheduled scoring (all spider math is in-browser, per-device); no score-history table (only current + previous-day snapshots in localStorage); no sex/bodyweight/age normalization (sex isn't even a stored column); no per-user timezone (and the check-in day key is UTC while health day key is server-local — they can disagree); no per-set timestamps or actual rest logging; no cross-source workout dedupe (only a binary 1-credit/day cap client-side); no trust ladder / provenance-weighted scoring (provenance is stored but ignored by points); no edit audit log (upsert-in-place destroys history); no "sustained N weeks" rank gate; no scoring tests or fixtures; Strava HR/distance/type fetched but discarded; Fitbit HR zones/resting HR/VO2max/sleep stages never requested. `docs/spider-graph-research-prompt.md` is a design spec for the intended normalized system — almost none of it is implemented.

---

## A. Platform & architecture

### 1. Stack

- **Frontend:** plain HTML + vanilla JS (IIFE modules attached to `window.*`, heavy localStorage use). No React/React Native/framework, no build step. Pages are root-level `.html` files with scripts in `js/`.
- **Backend:** Node.js with the **raw `http` module — not Express** (`package.json` has no express). `server.js:1728`: `const server = http.createServer(async (req, res) => {`. Route modules in `core/` are plain functions dispatched by URL prefix, e.g. `server.js:1821`: `if (await leaderboardRoutes(req, res, url)) {`. Note: `index.js` at repo root is a *grocery price scraper*, not the app entry; `package.json:8` → `"start": "node server.js"`.
- **Database:** **Postgres via Neon** (`@neondatabase/serverless ^1.1.0` + `pg ^8.18.0`). `core/db.js` builds the pool, switching to the Neon serverless driver when the connection string is `*.neon.tech`:

```js
// core/db.js:78-95
const getPool = () => {
  ...
  lastPoolConfig = buildPoolConfig();
  const useNeonServerless = isNeonConnectionString(lastPoolConfig?.connectionString);
  pool = useNeonServerless ? createNeonPool(lastPoolConfig) : new PgPool(lastPoolConfig);
```

- **Schema:** no migrations — every route module runs `CREATE TABLE IF NOT EXISTS` at startup ("ensureSchema" pattern). Tables relevant to scoring (full definitions appear under the questions below): `app_users`, `app_user_profiles` (jsonb blob), `app_training_profiles`, `app_training_plans`, `app_training_workouts`, `app_training_lift_history`, `app_daily_checkins`, `app_progress_photos`, `app_training_events`, `app_health_connections`, `app_health_daily`, `app_health_activities`, plus non-scoring tables (trainers, forum, store, messaging, grocery lists, etc.).

### 2. Where does scoring run?

**Client-side, on-demand, in the browser.** The spider engine auto-runs when its script loads on any page that includes it:

```js
// js/identity-engine.js:314-316
// Auto-run on load so the pages that include this file get real stats
try { refresh(); } catch (e) { /* keep the page alive */ }
```

It reads localStorage keys `ode_identity_profile_v1` (onboarding answers), `ode_identity_activity_v1` (rolling activity from `js/identity-activity.js`), and its own state `ode_identity_engine_v1`, then writes `ovIdentityStats` / `ovIdentityStatsPrev`, which the Overview radar (`js/overview-identity.js`) and Arena/leaderboard (`js/leaderboard.js`) render. There is **no backend job, no cron, no server-side axis computation**. The separate backend *points* leaderboard is computed per-request inside `GET /api/leaderboard` (`core/leaderboardRoutes.js:1343` calls `scoreUserForMonth`). Consequence: spider scores are per-browser/per-device, not canonical.

### 3. Recompute frequency

**On page open plus immediately after any logged activity — never nightly.** `refresh()` runs at script load (above) and is re-triggered by the activity logger:

```js
// js/identity-activity.js:84
window.RiseIdentityEngine && window.RiseIdentityEngine.refresh({ force: true })
```

`refresh` is idempotent within a day and simulates missed days since last run, capped by `maxCatchupDays: 30` (`js/identity-engine.js:66`). The only `setInterval` in the codebase is `server.js:2535` — `setInterval(runMonthlyRefresh, 6 * 60 * 60 * 1000)` — which is the **Walmart grocery-price scraper**, unrelated to scoring.

---

## B. User profile / normalization inputs

### 4. Onboarding fields actually stored

Auth identity (`core/authRoutes.js:9301`, no body metrics):

```sql
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  username text UNIQUE, email text UNIQUE, phone text,
  display_name text NOT NULL, password_hash text,
  auth_provider text NOT NULL DEFAULT 'local',
  last_seen timestamptz, last_login timestamptz,
  admin_notes text NOT NULL DEFAULT ''
);
```

Structured training profile (`core/trainingRoutes.js:8930-8958` + subsequent `ALTER`s):

```sql
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
  location_city text, location_state text,
  goals text,
  profile_image text
);
-- ALTER ADD COLUMN: calorie_offset int DEFAULT 0, no_progress_iterations int DEFAULT 0,
--   flagged boolean DEFAULT false, eval_weight_lb numeric, eval_weight_at date,
--   last_weighin_lb numeric, last_weighin_at date,
--   equipment_access jsonb DEFAULT '{}', bio text, injuries text
```

Plus a schemaless blob `app_user_profiles` (`core/profileRoutes.js:75-80`): `profile jsonb NOT NULL DEFAULT '{}'::jsonb` — deep-merged with no field validation.

Field-by-field:

| Requested field | Stored? | Where / type |
|---|---|---|
| sex/gender | **Not a stored column.** Used transiently in the client macro calculator (`nutritionState.selections.sex`, `js/main.js:~5306`); could land in the untyped `profile` jsonb blob but is not enforced anywhere. | — |
| age | Yes | `app_training_profiles.age int` (clamped 13–120, `trainingRoutes.js:~9419`) |
| DOB | **Not implemented** (age only) | — |
| height | Yes, inside jsonb | `strength.height` (inches, validated `trainingRoutes.js:10642-10649`) — no dedicated column |
| weight | Yes | `strength.bodyweight` (jsonb) + columns `last_weighin_lb numeric`, `eval_weight_lb numeric` |
| goal | Yes | `goals text` (free-form) + `strength.phase` (bulk/cut/maintain enum) |
| training experience | Yes | `experience text` + `strength.trainingAgeBucket` (jsonb) |
| activity level | **Not a stored column.** Client macro engine uses `dayActivity` (SEDENTARY/MODERATE/ACTIVE, `js/main.js:5982`), not persisted as a typed field. | — |

Write path: `POST /api/training/onboarding` (`trainingRoutes.js:12502`), validated by `validatePlanInputs` (`trainingRoutes.js:10614-10708`). The marketing quiz (`js/client-quiz.js`) writes to `app_leads.snapshot` — lead-gen, not the training profile.

### 5. Goal: free field or fixed options?

**Mixed.** The DB `goals` column is unconstrained text, but the *operative* goal mode used by the math is a fixed enum. Server:

```js
// core/trainingRoutes.js:10430-10435
function normalizeGoalMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'cut') return 'cut';
  if (v === 'bulk') return 'bulk';
  return null;
}
```

Client macro engine has the fuller set (`js/main.js:378-395`, `resolveGoalModeForMath`): **CUT, BULK (aka BUILD), STRENGTH, RECOMP, MAINTAIN** — with automatic inference from goal-vs-current weight when ambiguous. Onboarding `strength.phase` accepts bulk/cut/maintain (`trainingRoutes.js:10655-10662`). Quiz `bodyGoal` options are "A few sizes smaller / Athletic / Ripped / Swole", mapped to `Cut / Definition`, `Bulk`, `Maintain / Recomp` (`js/client-quiz.js:84-89, 301-305`).

### 6. Units per user?

**No per-user unit preference is stored — everything normalizes to imperial (lb/inches) at input; distances in meters.**

```js
// js/client-quiz.js:251-273
function weightLb(a) {
  const w = Number(a.weightValue);
  return a.weightUnit === 'kg' ? w * 2.20462 : w;   // -> lb
}
```

Server-side lift weights: `unitRaw.startsWith('kg') ? raw * 2.2046226218 : raw` (`trainingRoutes.js:9658`). BMR math converts to metric internally (`js/main.js:5962-5964`). All stored columns are `_lb`; distance stored as `distance_meters` (`healthRoutes.js:130`). No mi/km preference exists.

### 7. Training age / experience field

**Yes — explicit, not inferred from logs.** Two fields: `app_training_profiles.experience text`, normalized to a 3-value enum:

```js
// core/trainingEngine.js:36-42
function normalizeExperience(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'beginner' || v === 'novice') return 'beginner';
  if (v === 'intermediate') return 'intermediate';
  if (v === 'advanced') return 'advanced';
  return 'beginner';
}
```

Plus `strength.trainingAgeBucket`, required for the bodybuilding-v2 flow (`trainingRoutes.js:10654-10657`: `if (!trainingAgeBucket) return { ok:false, error:'Select training age' }`).

---

## C. Daily check-in data

### 8. Check-in model

Table (`core/trainingRoutes.js:9110-9117`) — **the entire payload is one opaque jsonb blob**:

```sql
CREATE TABLE IF NOT EXISTS app_daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- UNIQUE (user_id, day)
```

What the "Daily Dash" modal actually captures (`js/main.js:10713-10755`):

```js
return {
  day,
  weightLb: toNum(weightEl?.value),
  sleepHours,
  stress: stressVal || null,          // low | medium | high
  waterOz,
  trainedToday: ...,                   // strength axis flag
  cardioMinutes: toNum(cardioMinEl?.value),
  steps: toNum(stepsEl?.value),
  recovery: { sleepHours, stress, waterOz },
  bodyfatPct: toNum(bodyfatEl?.value),
  circumferences: { waistIn, chestIn, hipsIn },
  macros: { calories, proteinG, carbG, fatG },
  mood: toNum(moodEl?.value),          // 1..5
  mealPrep: mealPrepEl?.value || null, // yes | no
  mealPrepWhy, moodWhy,
  mealsOnPlan: mealsOkEl?.value || null,
  extras: { mealPrepWhy, moodWhy, sleepHours, stress, waterOz },
  meals: mealList
};
```

Saved via `POST /api/training/checkin` (`trainingRoutes.js:12332-12371`) with `INSERT ... ON CONFLICT (user_id, day) DO UPDATE`. On save the client also fires `POST /api/training/weighin` with the weight (feeds the auto-adjust engine). Progress photos are a separate table/endpoint (Q35).

### 9. Required vs optional; backfill

**Server-side, only `day` is required and validated; every metric is optional.**

```js
// core/trainingRoutes.js:12341-12344
const day = String(payload?.day || '').trim();
if (!isDateIso(day)) return sendJson(res, 400, { error: 'Missing day (YYYY-MM-DD)' });
const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
const serialized = JSON.stringify(data || {});
if (serialized.length > 50_000) return sendJson(res, 400, { error: 'Check-in too large' });
```

`isDateIso` is just a regex (`trainingRoutes.js:8853`). **Backfill: the API accepts any date — past or future.** Restrictions are client-side only: `js/main.js:11029` limits editing to the current program week and `≤ today` (`const isEditableDay = (iso) => iso >= currentWeekStartIso && iso <= currentWeekEndIso && iso <= todayIso();`), and `main.js:11057` blocks future days in the UI. The separate `/api/health/manual` endpoint does enforce a server-side ±1-year bound (`healthRoutes.js:621`). Client shows a 7-point "completion" progress bar (weight, sleep, water, mood, mealPrep, meals, any measurement — `main.js:10757-10776`) but it never blocks saving.

### 10. Day boundary / timezone

**No per-user timezone is stored anywhere.** Two inconsistent conventions:

- Check-ins & recap use the **UTC calendar date** from the client: `js/main.js:10611` / `js/daily-recap.js:55`: `new Date().toISOString().slice(0, 10)`.
- Health rollups use **server-local time**:

```js
// core/healthRoutes.js:373-379
function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;  // local, not UTC
}
```

So `app_daily_checkins.day` and `app_health_daily.day` can disagree near midnight. The server stores whatever `day` string the client sends (`$2::date`) with no tz conversion.

---

## D. Strength / workout-program data

### 11. Completed-workout model

One row per (plan, week, day) with sets embedded in jsonb — **no normalized sets table**:

```sql
-- core/trainingRoutes.js:9026-9049
CREATE TABLE IF NOT EXISTS app_training_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES app_training_plans(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  performed_at date,
  week_index int NOT NULL,
  day_index int NOT NULL,
  readiness int,
  duration_ms bigint,
  timer_started_at timestamptz,
  timer_ended_at timestamptz,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT ''
);
-- UNIQUE (plan_id, week_index, day_index)
```

Each `entries[]` element is built client-side (`js/training.js:3285-3306`):

```js
return {
  exerciseId: ex.exerciseId || ex.id,
  baseId: ex.baseId,
  exerciseName: ex.displayName || ex.name || ...,
  prescribed: { sets, reps, repsTarget, restSec, projectedWeight, projectedUnit, rirTarget },
  target: { weight: null },
  actual: { weight: <lastSet.weight>, reps: <lastSet.reps>, rpe: null },
  sets,        // [{ weight, reps, note }, ...]  <-- actual logged sets
  notes: ''
};
```

Save path: `POST /api/training/log` (`trainingRoutes.js:12888-12949`) → `upsertWorkoutLog` (`:9936-9984`, UPSERT on plan/week/day) → `upsertLiftHistoryEntries` → `applyProgressionFromLog` → emits `'Workout Logged'` event. A sibling `POST /api/training/log-draft` (`:12846-12886`) autosaves to the same table without progression. Per-exercise bests are denormalized into `app_training_lift_history` (`:9052-9070`): `last_weight_lb, last_reps, last_estimated_1rm_lb, last_performed_at, best_weight_lb, best_reps, best_estimated_1rm_lb, best_performed_at` keyed `(user_id, exercise_key)`.

### 12. Exercise library

**Yes — 759 exercises** from the vendored free-exercise-db dataset, loaded from `free-exercise-db/dist/exercises.json` by `core/exerciseCatalog.js:4` and indexed by `id`. Representative entry:

```json
{
  "name": "3/4 Sit-Up",
  "force": "pull",
  "level": "beginner",
  "mechanic": "compound",
  "equipment": "body only",
  "primaryMuscles": ["abdominals"],
  "secondaryMuscles": ["obliques", "hip flexors"],
  "category": "strength",
  "id": "3_4_Sit-Up",
  "subMuscleGroups": ["upper abs"],
  "targetRegion": "abs_upper",
  "isStretch": false,
  "isIsometric": false,
  "primaryMuscleGroup": "core",
  "subMuscleGroup": "upper_abs"
}
```

Equipment is free text (barbell/dumbbell/machine/cable/body only/…), bucketed by `equipmentClass()` (`exerciseCatalog.js:119`). **There is no dedicated `isMainLift` boolean** — compound/isolation rides on `mechanic`, and the generator derives `stimulusType` + an internal `isMain` at prescription time (`core/trainingEngine.js` `INTENT_MAP` `:1485-1501`; `restSec: isMain ? 180 : 135` at `:3837`).

### 13. Projected duration / rest targets on generated workouts

**Per-exercise rest target: yes.** Every generated exercise carries `restSec` (`core/trainingEngine.js:3149`: `const rx = (sets, reps, restSec) => ({ sets, reps, restSec, pct: null });`; scheme values 90/150/180/240 s depending on role — `:3138-3142`, `:3754-3862`).

**Projected total duration: computed internally, not persisted per workout.** An estimator exists and feeds the volume budget only:

```js
// core/trainingEngine.js:1594-1615
function estimateExerciseMinutes(ex) {
  const sets = Number(ex?.sets) || 0;
  if (sets <= 0) return 0;
  const restSec = Number(ex?.restSec) || 0;
  const workSetMin = (stimulus === 'compound') ? 0.85 : 0.6;
  const restMin = Math.max(0, sets - 1) * (restSec / 60);
  const transitionMin = 0.6;
  return (sets * workSetMin) + restMin + transitionMin;
}
```

The plan exposes `wseBudgetPerSession` / `wseBudgetPerWeek` (`:~4736`), but no `projectedDurationMinutes` on individual days. So the raw material for a plausibility timer exists (prescribed restSec + this estimator + actual `duration_ms`), but nothing compares them today.

### 14. Workout "complete" detection

**Explicit "End workout" button + confirmation, gated on the workout timer** — not "all sets logged." Sets autosave continuously as drafts. `js/training.js`: button label toggles on timer state (`:15080`); `confirmEndWorkout` (`:4111-4136`) → `endWorkoutTimer` (`:4138-4192`) computes `durationMs`, credits the identity engine (`RiseActivity.log('workouts')` / `'strengthWorkouts'`, `:4177`), then `persistFinishedWorkoutTimer` → `POST /api/training/log`. The server accepts whatever entries are sent — **no completeness validation**.

### 15. Start/end timestamps

**Per workout only.** `app_training_workouts`: `performed_at date`, `timer_started_at timestamptz`, `timer_ended_at timestamptz`, `duration_ms bigint` (+ row `created_at`/`updated_at`). Client payload fields: `timerStartedAt`, `timerEndedAt`, `durationMs`, `performedAt` (`js/training.js:3315-3318`). **Per set: no timestamps** — each set is only `{ weight, reps, note }` (`training.js:3277-3283`).

### 16. 1RM / e1RM

**Yes — Epley, in two independent implementations.** No Brzycki, no `0.0333` variant.

```js
// core/trainingEngine.js:689-695  (plan generation baselines)
function epley1rm(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r) || r <= 0) return w;
  return w * (1 + r / 30);
}
```

```js
// core/trainingRoutes.js:10017-10023  (logged-lift history)
function estimateLiftOneRepMax(weightRaw, repsRaw) {
  const weight = normalizeLiftWeight(weightRaw);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const reps = normalizeLiftReps(repsRaw);
  const repCount = Number.isFinite(reps) && reps > 0 ? Math.max(1, Math.min(30, reps)) : 1;
  return Math.round((weight * (1 + (repCount / 30))) * 100) / 100;
}
```

Output persists to `app_training_lift_history.last_estimated_1rm_lb` / `best_estimated_1rm_lb`. **The e1RM is NOT used by the spider-graph strength axis** — that axis just counts workouts.

---

## E. Cardio & integrations

### 17. Strava

Scope `read,activity:read` (`core/healthRoutes.js:188`). **Only `moving_time` (→ minutes) and the start date survive; type, distance, HR, and pace are fetched and discarded:**

```js
// core/healthRoutes.js:236-255
// Strava gives activities (cardio), not steps or sleep.
async fetchDaily(conn) {
  const after = Math.floor((Date.now() - SUMMARY_DAYS * 86_400_000) / 1000);
  const resp = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
    { headers: { Authorization: `Bearer ${conn.access_token}` } });
  ...
  (activities).forEach((activity) => {
    const start = String(activity.start_date_local || activity.start_date || '').slice(0, 10);
    const minutes = Math.round(Number(activity.moving_time || 0) / 60);
    const entry = byDay.get(start) || { activeMinutes: 0 };
    entry.activeMinutes += Math.max(0, minutes);
    byDay.set(start, entry);
  });
  return byDay;
}
```

Storage: per-day rollup `app_health_daily` (below) via `upsertDaily()` with `sources.activeMinutes = 'strava'`. Tokens in `app_health_connections` (`healthRoutes.js:102-116`: provider, access_token, refresh_token, token_expires_at, external_id/name, scopes, last_sync_at/error). **No per-activity Strava table.**

```sql
-- core/healthRoutes.js:119-132
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
-- ALTER ADD: distance_meters integer, gym_visit boolean, wake_result text
```

### 18. Fitbit

Scope `activity sleep profile` (`healthRoutes.js:266`) — **no `heart` scope**. Pulled per day (`:318-347`): `summary.steps`, `fairlyActiveMinutes + veryActiveMinutes` (→ active_minutes), `sleep.summary.totalMinutesAsleep` (→ sleep_minutes). **HR zones, resting HR, VO2max, and sleep stages: not requested, not stored.** Client copy confirms: "Steps, active minutes, and sleep" (`js/account.js:~1735`).

### 19. Dedupe across app + Strava/Fitbit

**No true cross-source event dedupe.** Two partial mitigations:

- Client (localStorage layer) caps cardio at **1 binary credit per day** and never downgrades:

```js
// js/identity-activity.js:119-138
var stepGoal = 8000;
var didCardio = (Number(payload.cardioSessions) > 0
    || Number(payload.cardioMinutes) >= 15
    || Number(payload.distanceMiles) > 0
    || Number(payload.steps) >= stepGoal) ? 1 : 0;
// Never let an edited check-in erase a cardio session logged some
// other way (e.g. a synced walk) — only upgrade.
bucket.cardioSessions = Math.max(Number(bucket.cardioSessions) || 0, didCardio);
```

- Server `upsertDaily` (`healthRoutes.js:389-401`) uses `COALESCE` per metric keyed `(user_id, day)` — last-writer-replaces, not additive (except the in-house GPS activity, which *adds* active_minutes/distance, `:674-685`).

There is no activity-ID or time-overlap reconciliation; the same run recorded in-app and on Strava can double-feed `active_minutes`.

### 20. Cardio calculation / "8,000 steps = 1 credit"

**Yes, the 8,000-step rule is in code, three places:**

```js
// core/healthRoutes.js:351-359  (server daily points)
function dayPoints(row) {
  let points = 0;
  if (row?.gym_visit === true) points += 10;
  if (String(row?.wake_result || '') === 'clean') points += 5;
  if ((Number(row?.distance_meters) || 0) >= 1000 || (Number(row?.active_minutes) || 0) >= 20) points += 3;
  if ((Number(row?.steps) || 0) >= 8000) points += 2;
  return points;
}
```

- `js/identity-activity.js:121` — `var stepGoal = 8000;` flips the daily binary `cardioSessions` credit (feeds the spider cardio axis).
- `js/main.js:1447` — `const did = Number(b.cardioSessions) > 0 || Number(stepsEl?.value) >= 8000;`

Full rule: cardio counts for the day if a session is logged OR cardioMinutes ≥ 15 OR any distance OR steps ≥ 8,000 — a binary credit, not graded. `docs/spider-graph-research-prompt.md:65` flags this as a weak fallback to redesign.

---

## F. Current scoring internals

### 21. Scoring functions per axis

**There is no per-axis formula — one shared growth model drives all six axes from activity counts.** Seed at onboarding:

```js
// js/identity-engine.js:131-145
var seedFrom = function (profile) {
  var answers = (profile && profile.answers) || {};
  var seed = {};
  var readinessSum = 0;
  for (var i = 0; i < AXES.length; i++) {
    var axis = AXES[i];
    var r = axisReadiness(answers, axis);          // keyword-scored 0..1 from quiz text
    readinessSum += r;
    var span = axis === 'progress' ? CONFIG.progressSeedSpan : CONFIG.seedSpan;
    seed[axis] = clamp(CONFIG.seedMin + r * span, 0, 34); // always still a peasant
  }
  var overall = readinessSum / AXES.length;
  seed.__band = overall < 0.33 ? 'weak' : overall < 0.66 ? 'regular' : 'strong';
  return seed;
};
```

Daily growth (the actual scoring):

```js
// js/identity-engine.js:151-181
var advanceOneDay = function (stats, seed, goals, activity) {
  var goalSet = {};
  (goals || []).forEach(function (g) { goalSet[g] = true; });
  var consistGate = CONFIG.consistFloor + (1 - CONFIG.consistFloor) * (clamp(stats.consistency, 0, 100) / 100);
  var totals = (activity && activity.totals) || {};
  var signalFor = {
    strength: (totals.strengthWorkouts != null ? totals.strengthWorkouts : totals.workouts) || 0,
    cardio: totals.cardioSessions || 0,
    consistency: Math.max(totals.checkins || 0, totals.activeDays || 0),
    nutrition: totals.mealsOnPlan || 0,
    recovery: totals.sleepLogs || 0,
    progress: totals.measurements || 0
  };
  for (var i = 0; i < AXES.length; i++) {
    var axis = AXES[i];
    var v = stats[axis];
    // ~10 logged actions in the window = full (1.0) signal.
    var signal = clamp(signalFor[axis] / 10, 0, 1);
    if (signal > 0) {
      var isGoal = !!goalSet[axis];
      var factor = isGoal ? CONFIG.goalFactor : CONFIG.nonGoalFactor;
      if (!isGoal && v >= CONFIG.nonGoalSoftCap) factor *= CONFIG.nonGoalOverCap;
      var talent = signal >= CONFIG.talentSignal ? CONFIG.talentBonus : 1;
      var diminish = Math.pow(1 - clamp(v, 0, 100) / 100, CONFIG.diminishPow);
      v += CONFIG.baseRate * signal * factor * talent * consistGate * diminish;
    }
    stats[axis] = clamp(v, 0, 100);
  }
  return stats;
};
```

Config constants (`identity-engine.js:48-67`): `baseRate: 6`, `goalFactor: 0.5`, `nonGoalFactor: 1.0`, `nonGoalSoftCap: 70`, `nonGoalOverCap: 0.15`, `talentSignal: 0.85`, `talentBonus: 1.4`, `consistFloor: 0.25`, `diminishPow: 1.5`. **No sex/age/bodyweight normalization, no 1RM input, no VO2max — each axis maps to exactly one 14-day activity counter.**

Two other "scoring" codepaths, neither shared with the above:

- Backend monthly points — `core/leaderboardRoutes.js:856` `scoreUserForMonth`: workouts×25, check-ins×10, meal-prep +5/day, meals-on-plan +5/day, grocery plans×15, measurements up to +3/day. Produces `points`, not axes.
- Leaderboard axis *approximation* for other users' radars (`js/leaderboard.js:544-551`):

```js
return {
  strength: clampStat(workouts * 5),
  cardio: clampStat(workouts * 2.5 + streak * 1.5),
  consistency: clampStat(streak * 3.5 + checkins * 2.4),
  nutrition: clampStat(Number(b.mealsOnPlanDays || 0) * 5 + Number(b.mealPrepDays || 0) * 2.5 + Number(b.groceryPlans || 0) * 3),
  recovery: clampStat(25 + streak * 1.6 + Number(b.mealPrepDays || 0) * 1.4),
  progress: clampStat(Number(b.measurementDays || 0) * 8 + Number(b.measurementBonus || 0) * 1.4)
};
```

### 22. 14-day rolling window + decay-when-idle

**Both implemented.** Window:

```js
// js/identity-activity.js:35, 47-51
var WINDOW_DAYS = 14;
...
var rebuild = function (store) {
  var days = Object.keys(store.days).sort();
  // Trim outside the rolling window.
  var cutoff = dayKey(new Date(Date.now() - WINDOW_DAYS * 86400000));
  days.forEach(function (d) { if (d < cutoff) delete store.days[d]; });
```

Decay (config `identity-engine.js:63-66`: `consistDecay: 4.0, consistGrace: 2, otherDecay: 1.2, otherGrace: 5`):

```js
// js/identity-engine.js:288-296  (inside refresh(); mirrored in simulate() :200-208)
} else {
  var idleSoFar = lastActiveSeen ? daysBetween(lastActiveSeen, theDay) : (i + 1);
  AXES.forEach(function (a) {
    var grace = a === 'consistency' ? CONFIG.consistGrace : CONFIG.otherGrace;
    if (idleSoFar <= grace) return;
    var rate = a === 'consistency' ? CONFIG.consistDecay : CONFIG.otherDecay;
    stats[a] = Math.max(seed[a], stats[a] - rate);
  });
}
```

Consistency drops 4 pts/idle day after 2 grace days; all other axes 1.2 pts/day after 5; floor = onboarding seed. Catch-up simulation capped at 30 days.

### 23. 0–100 scale

**Yes, natively 0–100.** `identity-engine.js:69-70`: `var round = function (v) { return Math.round(clamp(v, 0, 100)); };` applied on every write. There is **no calibrated raw→0-100 mapping** (no percentiles/standards) — the scale is emergent from seed (4–34) + `baseRate: 6`/day growth with `(1 - v/100)^1.5` diminishing returns. The leaderboard approximation multiplies raw counts by constants then `clampStat` 0–100 (`js/leaderboard.js:524`).

### 24. Score-history table

**Not implemented.** No table stores axis scores or any score time series; no INSERT of axis scores to Postgres anywhere. Only localStorage snapshots exist:

```js
// js/identity-engine.js:228-231
var writeStats = function (stats, prev) {
  if (prev) writeJSON('ovIdentityStatsPrev', prev);
  writeJSON('ovIdentityStats', stats);
};
```

— current + previous day only, plus the engine's single-day state `ode_identity_engine_v1` and a one-day caste snapshot `lbChampSnap` (`js/leaderboard.js:1265`). Raw inputs (workouts, check-ins) are historical in Postgres, so history could be recomputed, but computed scores are never persisted.

---

## G. Ranks & gates

### 25. Rank assignment

**Threshold rings on the six axes — average + per-axis floor, with a single-axis "pierce" path for the lower tiers.** All client-side in `js/leaderboard.js`:

```js
// js/leaderboard.js:586-612
const TIER_RINGS = [
  { id: 'squire', avg: 35, spike: 60, floor: 0 },
  { id: 'specialist', avg: 50, spike: 78, floor: 0 },
  { id: 'knight', avg: 68, floor: 45, noPierce: true },
  { id: 'king', avg: 82, floor: 60, noPierce: true }
];
const TIER_ORDER = ['peasant', 'squire', 'specialist', 'knight', 'king'];

const radarTierId = (stats) => {
  const { avg, spike, min } = radarReach(stats);
  let tier = 'peasant';
  for (const ring of TIER_RINGS) {
    const coversByAvg = avg >= ring.avg && min >= (ring.floor || 0);
    const coversByPierce = !ring.noPierce && spike >= ring.spike;
    if (coversByAvg || coversByPierce) tier = ring.id;
  }
  return tier;
};
```

Caveats: a second, partly-contradictory `CASTES` predicate table coexists in the same file (`:450-496` — e.g. King `min >= 75 && spread <= 22`, Knight `strength >= 62 && consistency >= 70`), and the UI copy (`:185-188`) quotes yet other numbers ("King: 85+ avg or one stat at 98"). The leaderboard also maps *display* rank position to caste via seat counts (`casteForGameRank`, `:1891-1900`: rank ≤12 king, ≤150 knight, …) for its largely fabricated population. Bronze/silver/gold are just top-3 row styles (`:255`); the backend awards `champion/top_3/top_10` badges by leaderboard position (`core/leaderboardRoutes.js:217-224`).

### 26. Berserker / Ranger / Mage

**Implemented as real classifiers** (not just copy). When `radarTierId` returns `'specialist'`, `pickCaste` (`:614-618`) dispatches on graph shape:

```js
// js/leaderboard.js
berserker: check: (s) => s.strength >= 78 && s.recovery <= 45 && s.consistency <= 60   // :460
ranger:    check: (s) => s.cardio >= 68 && s.cardio >= s.strength + 10                 // :472
mage:      check: (s) => s.nutrition >= 70 && s.progress >= 58 && s.strength < 58      // :478
```

The classifier is duplicated in `js/overview-identity.js`, and the classes appear in `js/kingdom.js` / `js/cutscenes.js` for the world UI.

### 27. Sustained-for-N-weeks check

**Not implemented — ranks are instantaneous** off current `ovIdentityStats`, softened only by day-scale stickiness: held tier promotes at most one tier per day and demotes only after stats sit below tier for **3+ active days** (`js/leaderboard.js:1285-1289`, `:1496-1497`: "The tier you hold is sticky (3-day demotion grace, one-tier-per-day climbs)"). No code counts weeks at a tier. The "sustained 8+ weeks for King" in `docs/spider-graph-research-prompt.md` is design intent only.

---

## H. Anti-cheat / verification

### 28. Daily alarm

**Built.** Frontend `alarm.html` ("Rise Alarm", localStorage `ode_rise_alarm_v1`; wake-lock; user must complete a typed "wake mission" to dismiss — `alarm.html:204, 425-519`). Server:

```js
// core/healthRoutes.js:741-765
// Wake-up result from the rise alarm: clean wake earns points, snooze does
// not, and the armed->dismissed window doubles as the sleep log.
if (url.pathname === '/api/health/wake' && req.method === 'POST') {
  const result = String(payload?.result || '').toLowerCase() === 'clean' ? 'clean' : 'snoozed';
  const sleepMinutes = Number(payload?.sleepMinutes);
  const day = dayKey(new Date());
  const sleepValid = Number.isFinite(sleepMinutes) && sleepMinutes >= 60 && sleepMinutes <= 16 * 60;
  await db.query(`INSERT INTO app_health_daily (user_id, day, sleep_minutes, wake_result, sources, updated_at)
    VALUES ($1, $2, $3, $4, '{"sleepMinutes":"alarm","wake":"alarm"}'::jsonb, now())
    ON CONFLICT (user_id, day) DO UPDATE SET ...`, [userId, day, sleepValid ? Math.round(sleepMinutes) : null, result]);
  return sendJson(res, 200, { ok: true, result, pointsEarned: result === 'clean' ? 5 : 0 });
}
```

Hit/miss = `wake_result` `'clean'` (+5 pts) vs `'snoozed'` (0). **Timestamp: only the calendar `day` (server-local) + row `updated_at`** — no dedicated wake-time timestamp, and a no-show produces no record at all. The armed→dismissed window doubles as `sleep_minutes` (validated 60–960 min).

### 29. GPS / geofence

**Implemented.** `activity.html` has (a) a live GPS distance tracker via `navigator.geolocation.watchPosition` with `enableHighAccuracy`, junk-fix filtering (`accuracy > 50` ignored), and permission-denied handling (`:304-350`); (b) a gym check-in posting lat/lng/accuracy to `/api/health/gym-checkin` (`:418-444`). Server geofence:

```js
// core/healthRoutes.js:361-371, 690-737
const GYM_RADIUS_METERS = 161; // 0.1 miles
...
const gym = profileResult.rows?.[0]?.profile?.health?.gym || null;  // saved gym lat/lng
const distance = haversineMeters(lat, lng, gymLat, gymLng);
// Give credit when the GPS accuracy circle overlaps the gym radius.
const within = distance - Math.min(accuracy, 50) <= GYM_RADIUS_METERS;
if (within) { /* app_health_daily.gym_visit = true (+10 pts) */ }
```

Gym coordinates are saved into the `app_user_profiles.profile.health.gym` blob (`activity.html:469-474`). Radius is 161 m (0.1 mi) — tighter than the 0.5 mi the research doc floats.

### 30. Device-vs-manual provenance

**Yes, on `app_health_daily` only — via the per-metric `sources` jsonb column.** Examples: Fitbit sync → `sources.steps = 'fitbit'`; Strava → `sources.activeMinutes = 'strava'` (`healthRoutes.js:385-388, 439-441`); manual entry → `'manual'` (`:646`); in-house GPS → `'{"activity":"gps"}'` (`:677`); gym check-in → `'{"gymVisit":"gps"}'` (`:721`); alarm → `'{"sleepMinutes":"alarm","wake":"alarm"}'` (`:755`). So a Strava-synced value IS distinguishable from a typed-in one. **Caveats:** `app_daily_checkins` and the localStorage identity layer carry no provenance, and `dayPoints()` awards identical points regardless of source — the docs' ×1.0/×0.7/×0 trust ladder is **not implemented**.

### 31. What stops fake edits?

**Range clamps only. No audit log, no versioning, no rate limits.**

```js
// core/healthRoutes.js:630-638 (manual entry)
if (steps !== null && (... steps < 0 || steps > 200_000)) { 'Steps must be between 0 and 200,000' }
if (sleepHours !== null && (... sleepHours < 0 || sleepHours > 24)) { ... }
if (activeMinutes !== null && (... activeMinutes < 0 || activeMinutes > 1440)) { ... }
```

Other clamps: manual day within ±1 year (`:621-623`); GPS activity 30 s–12 h and 0–400 km (`:662-667`); wake sleep 60–960 min; weigh-in 50–700 lb (`trainingRoutes.js:10471`); age 13–120. But `app_health_daily` and `app_daily_checkins` are **upsert-in-place** — editing a past day silently overwrites; the old value is gone (single `updated_at`, no history). Check-in payload contents are entirely unvalidated jsonb (only a 50 KB size cap). No endpoint rate limiting beyond `MAX_BODY_BYTES`. No anomaly detection (e.g., 1RM-jump flags) exists.

---

## I. Nutrition, recovery, progress

### 32. Nutrition/meal logging

**Partial — both, but neither in a queryable table.** (a) The daily check-in blob stores self-reported totals: `data.macros = { calories, proteinG, carbG, fatG }`, plus `data.mealsOnPlan` and per-meal `data.meals[]` (`js/main.js:10736-10754`). (b) A meal-plan/grocery system (`core/groceriesRoutes.js:77-96`) stores plans in `app_grocery_lists` (`totals jsonb, items jsonb, meta jsonb` with `meta.macroTargets`) and `app_custom_foods` (`food jsonb`). That's planning, not consumption logging. **No normalized food-diary table.** The spider nutrition axis consumes only the `mealsOnPlan` count.

### 33. Calorie/protein targets

**Computed client-side — Mifflin–St Jeor + PAL + workout energy, tagged `'mifflin_st_jeor'`:**

```js
// js/main.js:5980-5992
const sexConst = sexNorm === 'female' ? -161 : 5;
const bmr = Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * ageYears) + sexConst);
const palByDayActivity = { SEDENTARY: 1.25, MODERATE: 1.45, ACTIVE: 1.65 };
const metByEffort = { LIGHT: 3.5, AVERAGE: 5.0, INTENSE: 6.0 };
...
const baseline = (bmr * pal);
const netWorkoutWeekly = Math.max(0, (met - 1) * 3.5 * weightKg / 200 * minutesPerSession * sessionsPerWeek);
const maintenance = roundTo10(clamp((baseline + workoutDaily), bmr * 1.20, bmr * 2.40));
```

Goal calories via `computeGoalCalories` (`main.js:5592`; cut floor `bmr * 1.10` at `:5623`). Protein in g/lb by tier (`main.js:5733-5734`, factors `0.85 / 0.95 / 1.05` g/lb at `:6150`). The server doesn't recompute — `groceriesRoutes.js:451-464` accepts client `meta.macroTargets` and only rescales proportionally. Separately, the server nudges calories over time via the weigh-in driven `calorie_offset` (±1200 kcal clamp — see Q38).

### 34. Sleep data

Three paths, all totals in hours/minutes — **no stages ever**:

1. Manual check-in blob: `data.sleepHours` (+ duplicated in `data.recovery` / `data.extras`).
2. `app_health_daily.sleep_minutes integer` from: Fitbit `totalMinutesAsleep` (`healthRoutes.js:341-342`), manual `/api/health/manual` (`sleepHours * 60`, 0–24 h validated, `:626-645`), or the rise alarm's armed→dismissed window (60–960 min, `:749-762`).
3. No HealthKit/phone-health integration exists. The spider recovery axis counts `sleepLogs` occurrences only — it never reads durations.

### 35. Progress: weight history, measurements, photos

- **Weight history: no dedicated time-series table.** Only snapshots on `app_training_profiles` (`last_weighin_lb/last_weighin_at`, `eval_weight_lb/eval_weight_at`, upserted by `upsertWeighin`, `trainingRoutes.js:10453-10500`). Daily weights are recoverable from `app_daily_checkins.data.weightLb`, but only by parsing blobs.
- **Measurements: no dedicated table** — `data.circumferences { waistIn, chestIn, hipsIn }` and `data.bodyfatPct` inside the check-in blob; timestamp = the row's `day`/`updated_at`.
- **Photos: dedicated, timestamped table:**

```sql
-- core/trainingRoutes.js:9124-9132
CREATE TABLE IF NOT EXISTS app_progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day date NOT NULL,
  pose text NOT NULL,                      -- front | side | back
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  image_data_url text NOT NULL DEFAULT ''  -- base64 stored inline in Postgres
);
-- UNIQUE (user_id, day, pose)
```

Saved via `POST /api/training/progress-photos` (`trainingRoutes.js:12466-12475`). Also relevant: `app_health_daily` is a true per-day series for steps/active/sleep/distance/gym_visit/wake_result, and `app_training_lift_history` holds per-exercise last/best e1RM with `performed_at` dates.

---

## J. Edge cases & scale

### 36. Missing days / gaps

**No row at all in storage; synthesized as null-valued days at read time; streaks break on the first gap.** The health overview builds a continuous 7-day window on read:

```js
// core/healthRoutes.js:483-499
const byDay = new Map((daysResult.rows || []).map((row) => [row.day, row]));
for (let i = SUMMARY_DAYS - 1; i >= 0; i--) {
  const key = dayKey(new Date(Date.now() - i * 86_400_000));
  const row = byDay.get(key) || {};
  days.push({ day: key, steps: row.steps ?? null, activeMinutes: row.active_minutes ?? null, ... });
}
```

Never filled-forward. Client streak (`js/identity-activity.js:47-78`) walks back consecutive days and stops at the first absent day (yesterday grace only). No streak-freeze mechanic. `app_daily_checkins` is likewise sparse.

### 37. Cold start

Graceful empty states, no seeded defaults, no minimum-data guard on scoring: health overview returns all-null days / `weekPoints: 0` / `configured:false` when API keys are missing (`healthRoutes.js:501-521`); activity store initializes `{ streak: 0, totals: {}, days: {} }` (`identity-activity.js:44`); first weigh-in just establishes a baseline with no adjustment (`trainingRoutes.js:10474-10489`); gym check-in with no saved gym returns `{ ok:true, hasGym:false }`. A brand-new user's spider = onboarding seed values (4–34 per axis from quiz-keyword readiness) which then grow/decay; there is no "insufficient data" state. The doc's minimum-logging-cadence guards are unimplemented.

### 38. Goal / bodyweight change mid-stream

**History is left as-is — no recompute.** The only adaptive mechanism is forward-looking: a bi-weekly weigh-in evaluation that adjusts future `calorie_offset` (clamped ±1200 kcal) and flags the user after 4 no-progress iterations:

```js
// core/trainingRoutes.js:10453-10545 (upsertWeighin)
if (daysSince != null && daysSince >= 14) {
  const weeklyLoss = (Number(evalWeight) - w) * weekScale;
  ...
  nextOffset = clampInt(existingOffset + deltaKcal, -1200, 1200, existingOffset);
  nextIterations = existingIter + 1;
  if (nextIterations >= 4) nextFlagged = true;
```

Grep for `recompute|recalc` in `core/` finds nothing relevant. Changing `goals` triggers no back-fill; past points, logged workouts, and lift history are never restated. (Since spider scores aren't persisted anyway, "history" here means the raw logs.)

### 39. Active users / data volume

**Not determinable from the repo — no seed data, no hardcoded counts.** Analytics are live SQL aggregates (`core/adminRoutes.js:525-645`, e.g. `SELECT COUNT(*) AS users_month FROM app_users WHERE created_at ...`) against the external Neon DB, whose credentials are env vars not in the repo. The only named accounts are the owner allowlist defaults (`core/authRoutes.js:145-166`: `OWNER_USERNAMES = ... 'RiseForIt,RiseForItOwner,jason,odeology,odeology_'`). Realistic inference: single-owner project, user count unknown from code. The leaderboard UI fabricates a large fake population client-side for ambience (`js/leaderboard.js:1891+`), which should not be mistaken for real scale.

### 40. Existing tests / fixtures for scoring

**None for scoring.** All tests in `tests/` target the workout generator / training engine and trainer pages: `trainingEngine.oblueprint.test.js`, `powerbuilding.priority.matrix/.logic/.execution`, `militaryHybrid.matrix/.logic/.execution`, `cut-mode.policy.test.js`, frontend wiring tests, trainer-page tests. `js/workoutTest.js` is an in-browser QA harness for generated programs. **Zero coverage** of `identity-engine.js`, `identity-activity.js`, `dayPoints`, streaks, or rank tiers. Useful mirror for new scoring tests: the training-engine tests show the house style (plain Node test files against pure functions), and `identity-engine.js` deliberately exposes a **pure, deterministic `simulate()`** (`:183-208`, "used by tests and by refresh") plus `window.RiseIdentityEngine = { refresh, simulate, seedFrom, AXES, config }` — it was built to be testable; the tests were just never written.

---

## Appendix: key file index

| Area | Files |
|---|---|
| Server entry / dispatch | `server.js` (raw `http`, `:1728`, `:1821`) |
| DB pool | `core/db.js` (Postgres/Neon) |
| Spider engine (6 axes, growth/decay) | `js/identity-engine.js` (duplicate copy at repo root `identity-engine.js`) |
| Activity window/streaks (14-day) | `js/identity-activity.js` |
| Ranks/castes/tiers | `js/leaderboard.js`, `js/overview-identity.js` |
| Backend points leaderboard | `core/leaderboardRoutes.js` |
| Workouts, check-ins, lift history, photos, profiles | `core/trainingRoutes.js` (schema `:8889-9137`) |
| Training/plan generation, e1RM, rest, duration est. | `core/trainingEngine.js`, `core/workoutGenerator.js` |
| Exercise library (759) | `core/exerciseCatalog.js` + `free-exercise-db/dist/exercises.json` |
| Health daily, Strava/Fitbit, alarm, geofence, points | `core/healthRoutes.js`, `activity.html`, `alarm.html` |
| Nutrition targets / Daily Dash | `js/main.js`, `core/groceriesRoutes.js` |
| Design intent (mostly unimplemented) | `docs/spider-graph-research-prompt.md` |
| Tests (non-scoring) | `tests/*.test.js`, `js/workoutTest.js` |
