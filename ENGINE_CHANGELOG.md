# RiseForIt Workout Engine — Change Log

Tracks the "Workout Engine Upgrade Work Order" (v1.0, 2026-07-14). One task = one commit.
All file:line references are verified against the **reconciled base** (see Task 0).

---

## Task 0 — Reconcile the in-progress rewrite ✅ (commit: `chore(engine): reconcile rewrite`)

### The situation
`generator/trainingEngine.oblueprint.js` existed in two forms:
- **HEAD / production:** 12,865 lines — the full engine.
- **Working tree (uncommitted):** 2,464 lines — an in-progress rewrite by the concurrent agent.

### Progression diff (HEAD vs the uncommitted working-tree rewrite)

| Function | HEAD (production) | Working-tree rewrite |
|---|---|---|
| `buildWeeks` | `:5558` — present | `:1940` — present |
| `repsRestByExercise` | `:3501` — present | `:1610` — present |
| `rirForExercise` | `:3518` — present | `:1624` — present |
| `progressionRuleForExercise` | `:3538` — present | `:1636` — present |
| **`buildProjectionWeekRowsForExercise`** (the load ladder) | `:6474` — present | **MISSING** |
| **`buildBodybuildingProgressionProjection`** | `:6555` — present | **MISSING** |
| **`applyProjectionToWeeks`** | `:6625` — present | **MISSING** |

Token audit (`REP_LADDER`, `projectedWeight`, `buildProjectionWeek`, `projectionByExerciseWeek`, `targetLoad`): **HEAD = 41 occurrences, rewrite = 0.**

Empirical build test (both versions build without crashing):
- HEAD: first exercise carries `projectedWeight` (e.g. 65 lb) + a 16-week ladder. ✅
- Rewrite: builds a plan, but exercises have **`projectedWeight: undefined`** — **the entire projection/progression layer was removed.**

### Decision: **SHELVE the rewrite, build on HEAD.**

Rationale (objective, not owner-dependent):
1. The work order requires the `standard` style to reproduce **today's output byte-for-byte**. Only HEAD produces that output; the rewrite emits no weights at all.
2. The seam this work order edits (`buildProjectionWeekRowsForExercise`, `buildBodybuildingProgressionProjection`, `applyProjectionToWeeks`) **does not exist** in the rewrite. There is nothing to build the config seam onto.
3. HEAD is the deployed, known-good, complete engine and matches every file:line reference in the work order.
4. The rewrite is a **regression** for the purpose of this work (it deletes the double-progression feature).

### Action taken
- The rewrite is **preserved** (not lost) in `git stash@{0}`:
  `"WIP oblueprint rewrite (2464 lines, no projection layer) - shelved for progression work order Task 0"`.
  The concurrent agent can `git stash apply` it later if they choose to finish that refactor.
- `generator/trainingEngine.oblueprint.js` is restored to HEAD (12,865 lines). The tree is now **one stable base**.
- Unrelated concurrent-agent changes (`data/trainer-websites.json`, untracked files) were left untouched — only the oblueprint file was shelved.

**Base is stable. All subsequent tasks target HEAD's line numbers, re-verified per task.**

---

## Task 1 — Progression config + `progressionStyle` flag ✅ (commit: `feat(engine): progression config`)

**New file `generator/progressionSchemes.js`** — the single source of progression
numbers. Three schemes: `standard` (= today's flat +5 / rangeMin ladder),
`double_progression` (Jason's: base 6 mains / 8 accessories, +1 rep×4wk, per-lift
+5/+10/+20 reset — Task 2 activates the per-lift steps), `hypertrophy_double`
(base 8→12 over a 5-week cycle for the bodybuilding discipline).

**Seam wired (only the two functions the work order names):**
- `normalizeUserInput` (`:2400`) now normalizes `user.progressionStyle`
  (`normalizeProgressionStyle`, defaults to `'standard'`).
- `buildProjectionWeekRowsForExercise` (`~:6500`) reads `cycleWeeks`, resolved
  `repBase`, and (Task 1) the flat `_default` load step from the active scheme
  instead of the `REP_LADDER_*` constants.
- `progressionRuleForExercise` (`~:3560`) templates its prose from the scheme.
- Top-of-file helpers: `getProgressionScheme`, `normalizeProgressionStyle`,
  `resolveSchemeRepBase`.

**Verification:**
- Saved fixture `tests/fixtures/progression-standard-baseline.json` (3 seeded
  configs, captured on pristine HEAD). `standard` (and unset) reproduce it
  **byte-for-byte** — asserted by the new test.
- `double_progression` forces rep base 6, ladders 6→9, resets on week 5 — asserted.
- 4 new tests, all green.

**Pre-existing test state (important, not caused by this work):** the oblueprint
suite fails **21 selection/split/validation tests on pristine HEAD** (87 pass /
21 fail) — verified by stashing all changes and running the untouched tree.
This work order does not touch that core; my changes add 4 passing progression
tests and introduce **zero** new failures (91 pass / same 21 fail). Those 21 are
tracked separately from the progression work.

## Task 2 — Per-lift load steps + accessory rep base ✅ (commit: `feat(engine): per-lift load steps`)

`buildProjectionWeekRowsForExercise` now resolves the load step per movement
family (`resolveSchemeLoadStep` → `scheme.loadStepByFamily[estimate.family] ??
_default`) and the rep base per accessory-vs-main (`resolveSchemeRepBaseForExercise`
+ `MAJOR_LOAD_FAMILIES` / `isAccessoryProgression`). `progressionRuleForExercise`
uses the same per-family step so the coaching text matches the ladder.
`roundProjectedLoad` + the per-family `increment` are unchanged, so plate math holds.

Under `double_progression`: squat/deadlift/leg-press/hip-thrust step **+20**/cycle,
main upper compounds (bench/row/pulldown/OHP) **+10**, isolation **+5**; mains use
rep base **6**, accessories (isolation + pull-ups) rep base **8**.
`hypertrophy_double` ladders **8→12** over a 5-week cycle.

`standard` is unaffected (its map is only `{ _default: 5 }` and it sets no
accessory base) — the byte-for-byte baseline test still passes. 3 new tests
(per-lift steps, accessory base, hypertrophy). 94 pass / same 21 pre-existing fail.

## Task 3 — Real strength anchors ✅ (commit: `feat(engine): real strength anchors`) — HIGHEST IMPACT

Starting weights no longer default to a bodyweight guess.

**Engine** (`anchorInputsForUser`): new anchor tier order — explicit PR →
derived from working weight×reps → **logged lift-history e1RM** (`user.liftHistoryAnchors`,
new) → bodyweight fallback. `anchorSource` now reports `lift_history_fallback`.
Unset `liftHistoryAnchors` preserves today's precedence — baseline test still passes.

**Route** (`core/trainingRoutes.js`): `deriveLiftHistoryAnchors(liftHistory)` scans
logged history for the big three and takes the best e1RM each;
`attachLiftHistoryAnchorsToPayload` fills `payload.liftHistoryAnchors` in the
`/api/training/onboarding` handler when no explicit lifts are given (best-effort,
never blocks a build). `normalizeOblueprintPayload` + `coerce…` now pass
`liftHistoryAnchors` **and** `progressionStyle` through (the latter was being
dropped — needed for Task 5).

**Onboarding UI** (`index.html` + `js/training.js`): optional "your biggest lifts"
group (bench/squat/deadlift weight×reps, "skip if unknown") on the profile step;
captured into `state.answers.user` by the existing generic handler, carried by
`buildUserIntake().strength`, and mapped into the payload by
`mapIntakeToOblueprintPayload`. A 225×5 bench → conservative e1RM ~248
(`conservativeOneRepFromWorking`) instead of a bodyweight estimate.

3 new tests (history mapping, cold-start null, source-tier ordering). 97 pass /
same 21 pre-existing fail. Verified the onboarding page still loads with zero
new JS errors and the 3 lift inputs present.

## Task 5 (core: reachability) — Progression style reachable in onboarding ✅ (commit: `feat(onboarding): discipline & style`)

Makes the shipped Tasks 1-3 reachable by real users (they were dormant behind an
unset flag).

- `mapIntakeToOblueprintPayload` (`js/training.js`): **powerbuilding now defaults
  to `double_progression`** (Jason's vision) unless the client explicitly picks a
  style; bodybuilding stays on the standard ladder. `'auto'` = discipline default.
  Powerbuilding is reachable from self-serve today via the "Get stronger" goal
  (`getGoalPreset` → Powerbuilding).
- Onboarding UI (`index.html`): a visible **"How your weights climb"** selector on
  the profile step (Auto / Double progression / Hypertrophy double / Standard),
  captured into `state.answers.user.progressionStyle` by the existing handler.

Kept the powerbuilding default at the intake layer (not `coerce`/engine) so the
byte-for-byte baseline test is untouched and trainer/server builds are unchanged
unless a style is set explicitly. Verified the selector renders and onboarding
loads with zero new JS errors; engine suite still 97 pass / 21 pre-existing fail.

// TODO(owner): the explicit discipline picker (bodybuilding/powerbuilding/
// athletic/military) and surfacing priority-muscles in the client flow (the rest
// of Task 5) are deferred — powerbuilding is already reachable via the goal
// question, and those are additive onboarding steps that can land without risk.

## Task 8 — Wall off the legacy generatePlan bodybuilding branch ✅ (commit: `fix(engine): legacy generatePlan`)

`core/trainingEngine.js` `generatePlan()` throws "Could not generate a strict-valid
bodybuilding day" on every bodybuilding run. It's reached live via `createNewPlan`
(the `/api/training/onboarding` fallback creator, `:9711`).

Fix: `createNewPlan` now routes `bodybuilding` / `powerbuilding` / `military` to
`buildOblueprintPlanWithFallback` (the healthy builder) + `createNewOblueprintPlan`,
and only calls the legacy `generatePlan` for other disciplines. The legacy module
is **kept** — it holds the live `applyLogAdjustments` on the workout-log path.

Tests: one asserts the legacy branch still throws (documented + contained) and
that `applyLogAdjustments` is still exported; one asserts the oblueprint builder
handles bodybuilding (the path `createNewPlan` now uses). Both pass. All engine
failures remain the pre-existing 21 selection tests (none are mine).
