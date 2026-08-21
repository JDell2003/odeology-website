'use strict';

/* generator/progressionState.js — Engine v2 Phase 1 §2.

   The whole point of this module: PROGRESSION STATE IS CARRIED, NEVER
   RE-DERIVED.

   The bug it replaces: applyLogAdjustments built its rep ranges once, from
   week 1, while the baked ladder prescribed a climbing rep target per week. By
   week 3 the ladder asked for 8 and the state still believed the target was 6,
   so logging 7 — a genuine miss — read as clearing 6 and earned a load jump.
   Two systems disagreeing about what the rep target was. There is now one, and
   it lives here.

   repsCurrent is THE prescribed rep target. Nothing computes a rep target from
   a week index again.

   Gating semantics come from docs/progression-gating-salvage.md, salvaged
   before the dead adaptive layer was deleted in §1.6:
     - gate on the WORST set, not the average and not the top set
     - completion is part of the gate; a session with dropped sets is not a clear
     - a single miss holds; only a second consecutive miss backs the load off
     - a deload exits on one clean week, not after a fixed duration
*/

/* Movement classes. These derive from the exercise's OWN style and projection
   family — which §3 made trustworthy. Before that fix an isolation movement
   could inherit a compound slot's identity and, with it, compound rep bounds. */
const CLASS_BOUNDS = {
  lower_compound: { repMin: 5, repMax: 8, loadStep: 15 },
  upper_compound: { repMin: 6, repMax: 8, loadStep: 10 },
  accessory_compound: { repMin: 8, repMax: 12, loadStep: 5 },
  isolation: { repMin: 12, repMax: 15, loadStep: 5 }
};

const LOWER_COMPOUND_FAMILIES = new Set(['squat_pattern', 'hinge_pattern', 'leg_press', 'hip_thrust']);
const UPPER_COMPOUND_FAMILIES = new Set(['chest_press', 'shoulder_press', 'horizontal_pull', 'vertical_pull']);

/* Core work is prescribed in its own band and is not a loaded isolation in the
   12-15 sense, so it keeps accessory bounds — a plank or a crunch should not be
   driven to 15 reps and a 5 lb step. */
const CORE_FAMILIES = new Set(['core_flexion', 'core_rotation', 'core_stability']);

function movementClassFor(exercise) {
  const style = String(exercise?.style || '');
  const family = String(exercise?.projectionFamily || '');
  if (CORE_FAMILIES.has(family)) return 'accessory_compound';
  if (style === 'Isolation') return 'isolation';
  if (LOWER_COMPOUND_FAMILIES.has(family)) return 'lower_compound';
  if (UPPER_COMPOUND_FAMILIES.has(family)) return 'upper_compound';
  return 'accessory_compound';
}

function boundsFor(exercise) {
  return CLASS_BOUNDS[movementClassFor(exercise)];
}

/* Plate maths. Barbells and dumbbells move in 2.5 lb steps, selectorised stacks
   in 5. The load STEP is a training decision (CLASS_BOUNDS above); this is only
   about what the equipment can physically express. */
function incrementFor(exercise) {
  const loadNote = String(exercise?.projectionLoadNote || '').toLowerCase();
  const family = String(exercise?.projectionFamily || '');
  if (/machine|cable|stack/.test(loadNote)) return 5;
  if (CORE_FAMILIES.has(family)) return 5;
  return 2.5;
}

function roundToIncrement(value, increment) {
  const step = Number(increment) || 2.5;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n / step) * step;
}

/* §2.2 — one message per branch, naming what actually happened.

   This exists because "Plateau detected; adding a set" was firing during a
   scheduled 0.70x deload: a message from a branch that had not run. This text
   goes on screen in §6, and wrong text there is worse than none. */
const DECISIONS = {
  deload_exit: (s) => `Recovery week done and every set cleared. Back to ${s.load} lb for ${s.repsCurrent}.`,
  deload_hold: (s) => `Still in the recovery week. Repeat ${s.load} lb for ${s.repsCurrent}, well short of failure.`,
  reps_up: (s) => `Every set hit ${s.repsCurrent - 1}. Same ${s.load} lb, go for ${s.repsCurrent} this time.`,
  load_up: (s, step) => `Cleared the top of the range, so the weight goes up ${step} lb to ${s.load} and reps reset to ${s.repsCurrent}.`,
  hold: (s) => `Came up short of the target. Repeat ${s.load} lb for ${s.repsCurrent} before adding anything.`,
  deload_enter: (s) => `Two sessions short of target, so the weight drops 10% to ${s.load} for ${s.repsCurrent}. Clear it once and normal progression resumes.`,
  readiness_hold: () => 'Logged as a low-readiness session, so nothing moved. A bad night should not push your weights up or down.'
};

function createState(exercise, startingLoad, opts = null) {
  /* A day's FIRST compound is its heavy anchor and keeps its class bounds.
     A compound sitting SECOND or later on the same day is hypertrophy work,
     not a second heavy attempt - every compound seeding at the class floor
     is how a bodybuilding day shipped four movements at 6 flat. The caller
     (ensureStates, which walks the day in order) says which is which; the
     movementClass stays truthful and secondaryCompound records why the
     bounds differ from it. */
  const secondary = Boolean(opts?.secondaryCompound);
  const trueClass = movementClassFor(exercise);
  const bounds = secondary && (trueClass === 'lower_compound' || trueClass === 'upper_compound')
    ? CLASS_BOUNDS.accessory_compound
    : boundsFor(exercise);
  const load = Number(startingLoad);
  return {
    exerciseKey: String(exercise?.canonicalExerciseId || ''),
    movementClass: trueClass,
    secondaryCompound: secondary,
    load: Number.isFinite(load) && load > 0 ? load : null,
    repsCurrent: bounds.repMin,
    repMin: bounds.repMin,
    repMax: bounds.repMax,
    loadStep: bounds.loadStep,
    increment: incrementFor(exercise),
    failStreak: 0,
    deloadActive: false,
    lastExposureAt: null,
    lastDecision: null
  };
}

/* The only function permitted to change a target.

   loggedSets: [{ weight, reps }] as logged, in order
   prescribedSetCount: how many sets were asked for */
function advance(state, loggedSets, prescribedSetCount, options = {}) {
  const sets = Array.isArray(loggedSets) ? loggedSets.filter((s) => Number(s?.reps) > 0) : [];
  const needed = Math.max(1, Number(prescribedSetCount) || sets.length || 1);
  const readiness = Number(options?.readiness);

  // Readiness gate first: a bad night must not ratchet loads up OR trigger a
  // back-off. The session still counts as done; the state simply does not move.
  if (Number.isFinite(readiness) && readiness > 0 && readiness <= 3) {
    state.lastDecision = { branch: 'readiness_hold', message: DECISIONS.readiness_hold(state) };
    return state;
  }

  // Completion is part of the gate, and the gate is the WORST set.
  const cleared = sets.length >= needed && sets.every((s) => Number(s.reps) >= state.repsCurrent);

  if (state.deloadActive) {
    if (cleared) {
      state.deloadActive = false;
      state.failStreak = 0;
      state.lastDecision = { branch: 'deload_exit', message: DECISIONS.deload_exit(state) };
    } else {
      state.lastDecision = { branch: 'deload_hold', message: DECISIONS.deload_hold(state) };
    }
    state.lastExposureAt = options?.performedAt || state.lastExposureAt;
    return state;
  }

  if (cleared) {
    state.failStreak = 0;
    if (state.repsCurrent < state.repMax) {
      state.repsCurrent += 1;
      state.lastDecision = { branch: 'reps_up', message: DECISIONS.reps_up(state) };
    } else {
      const step = state.loadStep;
      state.load = roundToIncrement(Number(state.load || 0) + step, state.increment);
      state.repsCurrent = state.repMin;
      state.lastDecision = { branch: 'load_up', message: DECISIONS.load_up(state, step) };
    }
    state.lastExposureAt = options?.performedAt || state.lastExposureAt;
    return state;
  }

  state.failStreak += 1;
  if (state.failStreak >= 2) {
    state.load = roundToIncrement(Number(state.load || 0) * 0.90, state.increment);
    state.repsCurrent = state.repMin;
    state.failStreak = 0;
    state.deloadActive = true;
    state.lastDecision = { branch: 'deload_enter', message: DECISIONS.deload_enter(state) };
  } else {
    // A single miss holds. It does not punish, and it does not advance.
    state.lastDecision = { branch: 'hold', message: DECISIONS.hold(state) };
  }
  state.lastExposureAt = options?.performedAt || state.lastExposureAt;
  return state;
}

/* §2.3 — forward simulation for weeks that have not happened yet, under a
   clean-sessions assumption. That assumption is exactly why what this returns
   is a PROJECTION and must be labelled as one rather than shown as a
   prescription. Once a week is logged, its successor becomes a real target. */
function project(state, weeks) {
  const out = [];
  let cursor = { ...state };
  const total = Math.max(0, Number(weeks) || 0);
  for (let i = 0; i < total; i += 1) {
    out.push({ week: i + 1, load: cursor.load, reps: cursor.repsCurrent, projected: true });
    cursor = advance({ ...cursor }, [{ reps: cursor.repsCurrent }], 1, {});
  }
  return out;
}

module.exports = {
  CLASS_BOUNDS,
  DECISIONS,
  movementClassFor,
  boundsFor,
  incrementFor,
  roundToIncrement,
  createState,
  advance,
  project
};
