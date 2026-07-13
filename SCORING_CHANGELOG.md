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
