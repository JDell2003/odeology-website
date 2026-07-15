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
