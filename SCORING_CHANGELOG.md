# SCORING_CHANGELOG — Scoring Engine v2 (SCORING_ENGINE_V2)

Running log of the Work Order implementation (Tasks 1-11), July 13, 2026.
Everything here ships **behind `SCORING_ENGINE_V2` (default `false`)** — flag off means
zero user-facing change. The owner flips the flag on Railway after reviewing
`DEPLOYMENT.md`.

---

## Task 1 — Schema migrations (`feat(scoring): v2 schema`)

**What changed**

- `core/trainingRoutes.js` — ensureSchema(): added `ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS`
  `sex text`, `dob date`, `timezone text` (1a) and `ALTER TABLE app_daily_checkins ADD COLUMN IF NOT EXISTS sources jsonb DEFAULT '{}'` (1e).
- `core/scoringGather.js` — **new module** (all scoring SQL will live here; engine stays pure).
  Ships `scoringV2Enabled()` (the master flag) and `ensureScoringSchema()` creating
  `app_score_snapshots` (1b), `app_score_events` + index (1c), `app_edit_audit` (1d) —
  exactly the columns in the Work Order.
- `core/healthRoutes.js` — ensureSchema(): `ALTER TABLE app_health_daily ADD COLUMN IF NOT EXISTS wake_at timestamptz, sleep_start_at timestamptz` (1f). Exported `ensureSchema` for boot wiring.
- `server.js` — boot block inside `server.listen` callback runs
  `trainingRoutes.ensureSchema() → healthRoutes.ensureSchema() → scoringGather.ensureScoringSchema()`
  so migrations auto-apply on Railway deploy (Task 11 B).
- Onboarding write path: `POST /api/training/onboarding` now calls the new
  `upsertScoringIdentity()` (best-effort, never fails onboarding) which persists
  sex/dob/timezone with COALESCE merge semantics.
- New endpoints `GET/POST /api/training/scoring-profile` (auth required): read/write
  sex/dob/timezone; GET also reports the flag state for the client modal.
- `js/scoring-profile-modal.js` + include in `overview.html` — one-time, non-blocking
  modal asking existing users for sex/dob. **Renders only when the server reports
  `enabled:true` (flag on)**, so nothing user-facing changes at flag-off. Sends the
  browser IANA timezone automatically.

**Deviations from the doc (live code wins)**

- The doc said to wire `ensureScoringSchema()` "next to the other schema ensures" in
  `server.js` — in reality **no** schema ensures ran at startup (all are lazy per-route
  with `schemaEnsured` guards). Added a boot block in the `server.listen` callback and
  additively exported `ensureSchema` from `trainingRoutes`/`healthRoutes`; the lazy
  guards remain as fallback.
- The doc referenced `validatePlanInputs` as the onboarding entry point; the live
  Oblueprint onboarding paths don't call it, so sex/dob capture is a separate helper
  invoked at the top of the `POST /api/training/onboarding` handler (covers every branch).
- The onboarding *UI* was not extended with sex/dob questions (that would be a
  user-facing change at flag-off). Backend accepts the fields; the flag-gated modal
  covers capture. `// TODO(owner):` consider adding sex/dob to the onboarding quiz UI
  once the flag is on.

**Acceptance criteria**

- App boots / existing flows unchanged: code-reviewed; all changes are additive
  (`IF NOT EXISTS` only), no column dropped/renamed. Boot smoke test **pending — could
  not run Node locally** (see Environment note at bottom).
- All tables/columns exist: SQL matches Work Order 1a-1f verbatim.
- Onboarding stores sex/dob: implemented (plus `/api/training/scoring-profile`).
- Nothing destructive: confirmed — zero `DROP`/`DELETE`/renames in the diff.

**Tests**: schema SQL is exercised implicitly; endpoint validation covered by
Task 10 tests where pure (normalizers). Run status: pending (no local Node — see note).

---

## Task 2 — Constants module (`feat(scoring): constants module`)

**What changed**

- `core/scoringConstants.js` — the delivered, fully-populated constants file dropped in
  **byte-for-byte as handed off**. No numbers were edited or invented. Confidence tags
  (HIGH / MEDIUM / DESIGN / VERIFY-PRECISION) preserved.
- DOTS stays disabled (`strength.dotsUpgrade.enabled = false`) — the allometric
  normalizer (BW^0.67, sex-adjusted per lift) is the working default per the Work Order.
  Same for the McCulloch table: the linear age handicap in `age.*` is the default.

**Acceptance criteria**

- `require('./core/scoringConstants')` loads: plain CommonJS module, `'use strict'`,
  no dependencies — verified by inspection; Node run pending (see Environment note).
- Every axis reads from it / no magic numbers in `scoringEngine.js`: enforced in Task 3
  (engine reads everything from `C.*`).

---

## Task 3 — Engine core (`feat(scoring): engine core`)

**What changed**

- `core/scoringEngine.js` — **new, pure, zero DB imports.** Implements the Work Order
  skeleton verbatim where given (`ageFrom`, `trustMultiplier`, `normalizeStrength`
  piecewise-linear band map + age handicap, `selfImprovement`, `blend`,
  `applyDecayOrPause`, `computeRank` with sustain-weeks + caste dispatch) plus the six
  `compute*` axis functions the doc asked to be implemented:
  - Strength: allometric bands → 60/40 blend with self-improvement → trust multiplier →
    best-recent bank (fresh dips inside the window can only glide down at the decay
    rate, never crash) → decay past 12 idle days.
  - Cardio: WHO minutes-at-intensity grading (150→50 pts, 300→75 pts, slope continues
    to 100), VO2max path anchored at the 50th percentile = 50 pts (sex × age-decade),
    steps as a hard-capped (40 pt) fallback.
  - Consistency: recency-weighted active-day fraction over 28 d.
  - Nutrition: per-day credit (calorie band + protein floor = 1.0, one criterion or
    meals-on-plan = 0.5) against `logDaysForFullCredit`/7.
  - Recovery: duration (sleep bands) 0.5 / wake-regularity 0.3 / restedness 0.2,
    grind penalty after 7 straight training days.
  - Progress: 7-day-half-life EMA weight trend vs goal-appropriate safe rate;
    **matching beats exceeding** (crash-cut protection); insufficient data → pause,
    not decay.
  All numbers come from `C.*`. Every axis pushes an explanatory event object.
- `core/scoringConstants.js` — appended an `engineExtras` block (AGENT-ADDED, DESIGN
  tags) for three values the axes needed that the file didn't carry: grind penalty
  fraction, wake-regularity band, sleep falloff bounds. **No existing value touched** —
  this follows the doc's rule "if the engine needs a value not present, add it to this
  file with a confidence tag rather than inlining it".
- `core/scoringGather.js` — `gatherUserScoringInputs(db, userId, sinceDate)` reads
  `app_training_profiles`, `app_training_lift_history`, `app_health_daily`,
  `app_daily_checkins`, `app_training_workouts`, `app_score_snapshots` and returns the
  one plain object the engine consumes. Includes `mapMainLift()` exercise_key
  heuristics (`// TODO(owner)`: curate explicit map), goal-mode normalization,
  provenance classification (strava/fitbit/gps/alarm → device; manual → self_report),
  and sustain-week computation from consecutive snapshot days.

**Deviations / notes (live code wins)**

- The doc's context said Postgres is used "via `core/db.js getPool()`" — the live
  `db.js` exports `query()` (no `getPool` export). Gather uses `db.query()`.
- `app_training_lift_history` stores per-exercise aggregates (`last_*`/`best_*`), not
  a full time series — "best e1RM within 42 days" is approximated from those two
  aggregates and their dates. Noted as an accepted approximation.
- Server-side Mifflin calorie target isn't computed anywhere today, so
  `calorieTargetKcal` is `null` for now (protein floor + meals-on-plan still grade);
  `// TODO(owner)` marks where to wire it.

**Acceptance criteria**

- Engine has zero DB imports: it requires only `./scoringConstants` — verified.
- Every number from constants: verified by inspection (only structural interpolation
  arithmetic inline).
- computeRank respects sustain weeks: King requires `weeksAtCandidate.king >= 8`.
- Sex-missing users get `normalized=false` + valid self score: `normalizeStrength`
  returns `standard:null` → blend falls back to self-improvement only.
- Task 10 tests pass: written in Task 10; run pending (no local Node — see note).

---

## Task 4 — Persistence + recompute triggers (`feat(scoring): recompute + persist`)

**What changed**

- `core/scoringGather.js` — `computeAndPersistUserScore()` (gather → engine → upsert
  today's `app_score_snapshots` row → append `app_score_events`; `weeks_at_rank`
  derived from the unbroken run of same-rank snapshot days), `listActiveScoringUserIds()`
  (activity or snapshot in last 30 days), `runScoringRecomputePass()` — the periodic
  job, **wrapped in `pg_try_advisory_lock` (key 727274637) held on a single pooled
  client** so Railway replicas never double-run; lock released in `finally`.
  `enqueueUserRecompute()` — debounced per-user on-write recompute.
- `core/db.js` — additive `withClient(fn)` export (session-scoped advisory locks need
  lock+unlock on the SAME connection; `db.query()` uses the pool and can't guarantee that).
- `core/scoringRoutes.js` — **new**: `GET /api/score` (session auth mirroring
  `healthRoutes`): latest snapshot + last 20 explanatory events; computes inline once
  for first-time users; returns `{ enabled:false }` when the flag is off.
- `server.js` — `scoringRoutes` registered in the dispatch chain (after healthRoutes);
  recompute pass runs at boot + every 6 h via `setInterval` — **separate from the
  grocery-scraper interval at the bottom of server.js** as the Work Order requires.
- On-write hooks (all no-ops while flag off): `POST /api/training/log`,
  `POST /api/training/checkin` (trainingRoutes), provider sync success, `/api/health/manual`,
  `/api/health/activity`, `/api/health/gym-checkin` (on verified visit), `/api/health/wake`
  (healthRoutes) → `enqueueUserRecompute(userId)`.

**Acceptance criteria**

- Flag on → logging a workout updates the snapshot within one request cycle:
  enqueue fires 250 ms after the write (debounced); GET /api/score also computes
  inline when no snapshot exists.
- Nightly writes one row/user/day: `ON CONFLICT (user_id, day) DO UPDATE`.
- GET /api/score returns axes + rank + explanations: implemented.
- Flag off → zero behavior change: every entry point checks `scoringV2Enabled()`.
- Advisory lock prevents double-run: single-client lock + unlock in `finally`.
- Test run: pending (no local Node — see Environment note).

---

## Task 5 — Client becomes display-only (`feat(scoring): client renders server score`)

**What changed**

- `js/identity-engine.js` — new server-authoritative layer: memoized
  `fetchServerScore()` calls `GET /api/score`; when `enabled` it caches mode
  `ode_scoring_v2_mode='server'` and writes the server axes into `ovIdentityStats`
  (with `__server`, `__serverRank`, `__serverCaste`, `__serverDay` markers) and fires a
  `rise-identity-server-score` event. In server mode `refresh()` returns the server
  stats; a `force` refresh (user just logged something) re-polls the server, whose
  own on-write hook recomputed the score. **Locally computed stats in server mode are
  tagged `__estimated:true`** — a clearly-labeled offline fallback. Flag off →
  `enabled:false` caches mode 'local' and the legacy engine is byte-identical in
  behavior.
- `js/overview-identity.js` — boot now gives the memoized score fetch up to 900 ms to
  land (only when server mode is already cached) so the first radar paint shows the
  authoritative axes.
- `js/leaderboard.js` — new `statsForSelf()`: the signed-in user's radar/caste always
  comes from the server axes; **the `casteStatsFromRow` points-approximation can no
  longer shadow self** (it remains only for other users' rows, which have no server
  score). Swapped at all three self call sites (caste hero, arena row, scarcity chip).

**Acceptance criteria**

- Signed-in radar matches GET /api/score: axes are copied verbatim (rounded to ints,
  matching the UI's existing 0-100 int convention).
- Offline shows clearly-labeled estimate: `__estimated:true` tag.
- Browser cannot change the authoritative score: it lives in Postgres; the client
  only renders it.

---

## Task 6 — Trust ladder wiring (`feat(scoring): trust ladder`)

**What changed**

- Provenance mapping (`core/scoringGather.js` `deviceOrSelf()`): strava | fitbit |
  gps | alarm → `device` (×1.00); manual / in-app → `self_report` (×0.70);
  `implausible` → ×0 (multipliers straight from `C.trust`).
- Lift sessions: tagged `device` only when the workout has a real timer window
  (timer_started_at + timer_ended_at) on a day whose `gym_visit=true` came from the
  GPS geofence check-in; otherwise `self_report`.
- `POST /api/training/checkin` now stamps `sources = {"checkin":"manual"}` on
  `app_daily_checkins` (merged with `||` on update) — provenance recorded going forward.
- `core/scoringEngine.js`: every axis event now records `provenance` + the applied
  `trust_multiplier` (dominant provenance for windowed axes). Multipliers were already
  applied inside each `compute*` (Task 3); consistency now also tracks the device
  share of credit.

**Acceptance criteria**

- Strava-synced run out-tiers same minutes typed in: device ×1.0 vs manual ×0.7 on
  cardio credit.
- Events show the multiplier: `trust_multiplier` set on all six axis events.
- Honest self-report never scores zero: self_report multiplier is 0.70; only
  `implausible` zeroes credit.

---

## Task 7 — Integrity / anti-gaming (`feat(scoring): integrity`)

**What changed** (every behavior change is flag-gated; flag off = legacy behavior)

- **Edit audit**: `POST /api/training/checkin` and `POST /api/health/manual` read the
  old row before their upsert overwrites it and append `app_edit_audit` (old→new).
- **Rate limits**: `scoringWriteAllowed()` in-memory token bucket (30 writes / 5 min /
  user / endpoint, tagged in `C.engineExtras.integrity.rateLimit`) on checkin, log,
  health-manual, health-activity, gym-checkin, wake → HTTP 429.
- **Anomaly flags** → `app_score_events` (`reason_code='flag_*'`, provenance
  `implausible`, trust ×0):
  - `flag_e1rm_jump`: on `POST /api/training/log`, incoming best-set e1RM vs stored
    best BEFORE the upsert; weekly gain > `C.strength.implausibleWeeklyGainPct` flags
    the lift; gather **excludes flagged exercise keys from the strength bank**.
  - `flag_workout_voided`: plausibility timer — actual `durationMs` vs projected
    duration (prescribed sets/restSec through the generator's own
    `estimateExerciseMinutes`, exported additively from `core/trainingEngine.js`);
    void below `C.plausibility.voidBelowFractionOfProjected` **unless** submitted with
    no timer within `lateSubmissionGraceHours` (late_ok).
  - `flag_gps_accuracy`: gym check-in with GPS accuracy worse than
    `maxTrustedGpsAccuracyMeters` (150 m, tagged) is flagged and NOT credited.
  - `detectCalorieMismatch()` (reported calories vs bodyweight-trend-implied balance,
    3500 kcal/lb) ships pure + tested but stays dormant until a server-side
    maintenance-calorie target exists (`// TODO(owner)` from Task 3).
- **Timezone fix**: `resolveUserDayKey()` — flag on → day boundary from the user's
  stored IANA timezone (fallback `DEFAULT_TZ`, then legacy server-local); applied at
  every health write (manual/activity/gym-checkin/wake). Flag off → the two legacy
  day-key conventions are left exactly as they are (per the guardrail).
- Wake endpoint now also persists `wake_at` + derived `sleep_start_at` (1f columns)
  so sleep-regularity has real timestamps.
- `C.engineExtras.integrity` block added (tagged AGENT-ADDED / DESIGN+HIGH).

**Acceptance criteria**

- Editing a past day leaves an audit row: implemented for check-ins and manual health
  edits.
- 10-second "45-minute" workout is voided: `assessWorkoutPlausibility` → 'void' flag;
  flagged lifts excluded from the bank.
- Genuine late submit still counts: `late_ok` verdict inside 24 h grace.
- Impossible 1RM leaps flagged, not scored: `flag_e1rm_jump` + gather exclusion.

---

## Task 8 — Cardio rebuild + integrations (`feat(scoring): cardio v2`)

**What changed**

- Graded minutes-at-intensity already lands the score (Task 3 `computeCardio` →
  `gradeWhoMinutes` + MET/VO2max). Task 8 supplies the *data*: `app_health_daily`
  gains `vigorous_minutes`, `vo2max`, `resting_hr` (additive columns);
  `app_health_activities` gains `provider`, `external_id`, `avg_hr` + a unique
  `(user_id, provider, external_id)` index for dedupe.
- **Strava** (`fetchDaily`): stops discarding distance/type/HR. Splits moving-time
  into moderate vs **vigorous** minutes (avg HR ≥146, max HR ≥165, or a high-intensity
  activity type), and keeps `distance_meters` — all persisted via `upsertDaily`.
- **Fitbit**: authorize scope now includes `heart` (env-overridable `FITBIT_SCOPES`,
  default `activity sleep profile heart`). When the heart scope is present, `fetchDaily`
  also pulls resting HR (`activities/heart`) and the cardio-fitness **VO2max**
  (`cardioscore`, range midpoint parsed); "very active" minutes map to vigorous.
  **Requires the Fitbit app registration to add `heart`** — recorded in DEPLOYMENT.md /
  OWNER ACTIONS, else Fitbit 403s in prod.
- `upsertDaily` persists the new metrics with per-metric `sources` provenance and
  COALESCE merge.
- Gather cardio block: reads vigorous minutes + latest-in-window VO2max, splits
  moderate/vigorous, feeds the engine. **Dedupe**: `app_health_daily` is one row/day
  and providers COALESCE-merge, so the same run in-app + on Strava never double-counts
  active minutes; device-verified minutes win the provenance tie.
- Steps demoted: the engine only falls back to steps (capped at
  `C.cardio.stepsFallbackCapPoints`) when no minutes/VO2max signal exists.

**Deviations (live code wins)**

- The doc pointed at rewriting the binary 8,000-step credit in `js/identity-activity.js`,
  `js/main.js`, and `dayPoints()`. Those are the **legacy** points/localStorage paths;
  touching them changes flag-off behavior, which the guardrails forbid. The v2 cardio
  axis already grades intensity server-side and demotes steps — the legacy binary credit
  stays as-is until the owner flips the flag. Noted as an intentional deviation.

**Acceptance criteria**

- Cardio reflects intensity not just steps: moderate/vigorous split + WHO grading + VO2max.
- HR used when present: Strava avg/max HR drives the vigorous split; Fitbit resting HR
  + VO2max stored.
- A run synced twice counts once: single day-row + COALESCE merge + activity unique index.
- Test run: pending (no local Node — see note).

---

## Task 9 — Ranks consolidation (`feat(scoring): ranks unified`)

**What changed** (all in `js/leaderboard.js`; C.ranks on the server stays the one gate)

- **One authoritative gate**: when the signed-in user has a server score,
  `radarTierId()` returns `stats.__serverRank` and `pickCaste()` returns
  `stats.__serverCaste` directly — the server's C.ranks result (already sustain-gated)
  decides the rank. The client `TIER_RINGS` / `CASTES` tables are now explicitly a
  **cosmetic fallback** for other users' rows and offline.
- **Reconciled the divergent numbers** so the fallback can never contradict the gate:
  `TIER_RINGS` specialist 78→80, knight 68/45→70/62, king 82/60→85/80; the `CASTES`
  King `check` floor 75→80 and Knight `check` 62/70→70/62 — matching
  `C.ranks`. The `CASTES` predicate table is annotated cosmetic (styling/blurbs/next-level).
- **Sustain weeks**: rank is driven off `app_score_snapshots` with the sustain gate
  (King = 8 weeks) server-side (Task 3 `computeRank` + Task 4 `weeks_at_rank`); a
  momentary King-level spike does not promote. The 3-day demotion stickiness stays as
  UX polish.
- **UI copy** (the rules panel) rewritten to state the real gates: King = avg 85+, every
  stat > 80, held 8 weeks, no single-stat path; Knight = avg 70+, floor 62, 2 weeks,
  no pierce. Removed the contradictory "single stat at 98 / pierced to 92" King/Knight
  claims.
- **Fabricated population** annotated cosmetic-only — it never feeds a real score or rank.

**Acceptance criteria**

- A momentary King-level spike does NOT promote until sustained 8 weeks: enforced by
  the server sustain gate; the client honors the server rank.
- One gate table everywhere: C.ranks authoritative; client tables reconciled + cosmetic.
- Unlimited holders: no seat cap on the authoritative path (only the cosmetic game rows
  use seat counts).
