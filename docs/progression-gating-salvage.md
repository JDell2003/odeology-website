# Salvage: the progression gating model (from the deleted adaptive layer)

Engine v2 Phase 0 §1.6 deleted four functions from
`generator/trainingEngine.oblueprint.js` that had no production callers:
`buildNextSessionRecommendation`, `simulateAdaptiveProjectionImpact`,
`updateAdaptiveProjectionState`, `buildAdaptiveRecalibration` — plus their
helpers and a duplicate implementation in `js/workoutTest.js`.

They were never wired in, but the **gating model inside them was the correct
one**, and Phase 1 §2.2 reimplements it. This file is the salvage so the
reasoning is not lost with the code.

## The classification, verbatim in behaviour

From `buildNextSessionRecommendation`, given the prescribed set count and the
logged sets for one exercise:

```js
const repRange       = parseRepsRange(currentRow.repRange || exercise.reps);
const prescribedSets = currentRow.sets || exercise.sets;
const logged         = summarizeLoggedSets(lastEntry, prescribedSets);

// EARNED — every prescribed set completed AND the slowest set reached the top
// of the range. Note it gates on minReps, not average: one set falling short
// means the load was not owned.
const allSetsAtTop = logged.completedSets >= prescribedSets
  && prescribedSets > 0
  && logged.minReps >= repRange.max;

// HOLD — inside the range but not at the top. Also the deliberate landing spot
// for a partially completed session.
const insideRange = logged.completedSets >= Math.max(1, prescribedSets - 1)
  && logged.averageReps >= repRange.min;

// BACK OFF — missed the bottom of the range by more than a rep or two.
const severeMiss = logged.completedSets > 0
  && logged.minReps < Math.max(1, repRange.min - 2);
```

Decision order (first match wins):

| Order | Condition | Action |
|---|---|---|
| 1 | current row tagged `deload` | `exit_deload` if the deload week was completed cleanly, else `continue_deload` |
| 2 | `underperformCount >= 2 \|\| familyUnderperformCount >= 3` | `deload` |
| 3 | `allSetsAtTop` | `increase` |
| 4 | `severeMiss && underperformCount >= 1` | `decrease` |
| 5 | `insideRange` | `hold` |
| 6 | anything logged at all | `hold` — "stabilize execution before changing the load" |

## What is worth keeping

1. **Gate on `minReps`, not `averageReps` or the top set.** A load is earned
   only when the *worst* set cleared the target. Averaging lets one strong
   opening set carry three fading ones and ratchets the load past what the
   lifter can actually complete.
2. **Completion is part of the gate.** `completedSets >= prescribedSets`. A
   session with sets dropped is not a session that earned a jump.
3. **Two failure scales, not one.** `underperformCount` on the exercise and
   `familyUnderperformCount` across the movement family (thresholds 2 and 3).
   A single lift stalling is a lift problem; a family stalling is a recovery
   problem, and only the second should reach for a deload.
4. **A single miss holds, it does not punish.** Only a *severe* miss (more than
   two reps under the bottom) plus prior history backs the load off. This is the
   behaviour §2.2 specifies as "single miss: hold, repeat the same prescription".
5. **Deload has an explicit exit condition.** `continue_deload` vs `exit_deload`
   is decided by whether the deload week itself was completed cleanly, rather
   than by a fixed duration.

## What to leave behind

- `familyAdjustments` / the ±3% capped-at-±15% family coefficient. It was
  initialised to 1.0 and nothing ever mutated it, so it was never exercised, and
  a multiplicative per-family drift term is hard to reason about against fixed
  ladder bounds. §2.2 uses explicit `repMin`/`repMax`/`loadStep` per movement
  class instead.
- The 16-week projection simulation. Plans are 4 or 8 weeks; §2.3 replaces the
  baked ladder with cold-start-plus-`advance()`.
- The recommendation *copy* ("Adaptive progression nudged the jump upward
  slightly"). It described behaviour the code did not implement.

## Where it lands

Phase 1 §2.2 `advance(state, loggedSets, prescribedSetCount)`. The `cleared`
condition there is points 1 and 2 above:

```js
const cleared = loggedSets.length >= prescribedSetCount
  && loggedSets.every((s) => s.reps >= state.repsCurrent);
```

Points 3–5 are the failStreak, deload and readiness-hold branches around it.
