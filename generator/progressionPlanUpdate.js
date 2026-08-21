'use strict';

/* generator/progressionPlanUpdate.js — Engine v2 Phase 1 §2.1/§2.3.

   Applies a logged session to a plan through progressionState.advance, and
   rewrites the plan's future weeks from the resulting state.

   §2.3: the baked ladder is no longer the source of a later week's numbers. It
   climbed reps by week index, independently of what anyone actually lifted,
   which is precisely the second writer §2.1 exists to remove. Week 1 still comes
   from the anchor. Every later week is either
     - a real target, once its predecessor has been logged, or
     - a PROJECTION simulated forward under a clean-sessions assumption,
   and it is marked as such via exercise.progression.isProjection so the UI can
   say which it is showing rather than implying a prescription. */

const progression = require('./progressionState');

const PROGRESSION_STATE_KEY = 'progressionState';

function planWeekIndex(week) {
  const next = Number(week?.weekIndex);
  if (Number.isFinite(next)) return next;
  const legacy = Number(week?.index);
  return Number.isFinite(legacy) ? legacy : NaN;
}

function exerciseKeyOf(source) {
  return String(source?.canonicalExerciseId || source?.baseId || '').trim();
}

function currentLoadOf(exercise) {
  const projected = Number(exercise?.projected?.value);
  if (Number.isFinite(projected) && projected > 0) return projected;
  const flat = Number(exercise?.projectedWeight);
  return Number.isFinite(flat) && flat > 0 ? flat : null;
}

/* Seed state for every exercise the plan contains that does not have one yet.
   §2.0 established there is nothing contaminated to inherit, so this seeds
   normally: load from the plan's own week-1 anchor, reps from the movement
   class's own floor. */
function ensureStates(plan) {
  const meta = plan.meta && typeof plan.meta === 'object' ? plan.meta : (plan.meta = {});
  const states = meta[PROGRESSION_STATE_KEY] && typeof meta[PROGRESSION_STATE_KEY] === 'object'
    ? meta[PROGRESSION_STATE_KEY]
    : (meta[PROGRESSION_STATE_KEY] = {});
  const firstWeek = (plan.weeks || []).find((w) => planWeekIndex(w) === 1) || (plan.weeks || [])[0];
  /* Powerbuilding and military prescribe their own rep schemes; positional
     demotion is a bodybuilding rule. An exercise that is a day's heavy
     anchor somewhere keeps that identity everywhere (first appearance
     wins, matching how states are keyed). */
  const positional = !['powerbuilding', 'military'].includes(String(meta?.discipline || plan?.discipline || ''));
  for (const day of firstWeek?.days || []) {
    let compoundIdx = 0;
    for (const exercise of day?.exercises || []) {
      const isCompound = String(exercise?.style || '') === 'Compound';
      const secondaryCompound = positional && isCompound && compoundIdx >= 1;
      if (isCompound) compoundIdx += 1;
      const key = exerciseKeyOf(exercise);
      if (!key || states[key]) continue;
      states[key] = progression.createState(exercise, currentLoadOf(exercise), { secondaryCompound });
    }
  }
  return states;
}

/* Write a state's numbers onto one exercise. Reps are written as a single
   number because that is what the state carries — a target, not a range. */
function applyStateToExercise(exercise, state, { isProjection }) {
  if (Number.isFinite(Number(state.load)) && Number(state.load) > 0) {
    exercise.projected = { value: Number(state.load), unit: exercise?.projected?.unit || 'lb' };
    exercise.projectedWeight = Number(state.load);
    exercise.projectedUnit = exercise.projected.unit;
  }
  exercise.reps = String(state.repsCurrent);
  exercise.progression = {
    ...(exercise.progression || {}),
    repsTarget: state.repsCurrent,
    repMin: state.repMin,
    repMax: state.repMax,
    loadStep: state.loadStep,
    movementClass: state.movementClass,
    deloadActive: Boolean(state.deloadActive),
    isProjection: Boolean(isProjection),
    // The rule shown to the user. True by construction now: it describes the
    // branch advance() will actually take next.
    rule: state.repsCurrent < state.repMax
      ? `Hit ${state.repsCurrent} on every set and you go to ${state.repsCurrent + 1} at the same weight.`
      : `Hit ${state.repsCurrent} on every set and the weight goes up ${state.loadStep} lb, back to ${state.repMin} reps.`
  };
  if (state.lastDecision) {
    exercise.progression.lastDecision = state.lastDecision.message;
    exercise.progression.lastDecisionBranch = state.lastDecision.branch;
  }
  // The baked ladder no longer describes this exercise.
  delete exercise.repLadder;
}

/* Rewrite every week after `fromWeek` from state. The week immediately after a
   logged one carries the real advanced target; the rest are simulated forward
   and flagged as projections. */
function reprojectForward(plan, states, fromWeek) {
  const byKey = new Map();
  for (const [key, state] of Object.entries(states)) byKey.set(key, { ...state });

  for (const week of plan.weeks || []) {
    const weekIndex = planWeekIndex(week);
    if (!Number.isFinite(weekIndex) || weekIndex <= fromWeek) continue;
    const stepsAhead = weekIndex - fromWeek;
    for (const day of week?.days || []) {
      for (const exercise of day?.exercises || []) {
        const key = exerciseKeyOf(exercise);
        const state = byKey.get(key);
        if (!state) continue;
        // stepsAhead 1 is the real next target; beyond that we are guessing at
        // sessions that have not happened.
        applyStateToExercise(exercise, state, { isProjection: stepsAhead > 1 });
      }
    }
    // Advance every state one clean session for the next week out.
    for (const [key, state] of byKey.entries()) {
      byKey.set(key, progression.advance({ ...state }, [{ reps: state.repsCurrent }], 1, {}));
    }
  }
}

/* The live entry point. Returns a new plan; never mutates the input. */
function applyLoggedSession(plan, logPayload) {
  if (!plan || typeof plan !== 'object') return plan;
  const weekIndex = Number(logPayload?.weekIndex);
  if (!Number.isFinite(weekIndex) || weekIndex < 1) return plan;

  const next = JSON.parse(JSON.stringify(plan));
  const states = ensureStates(next);
  const readiness = Number(logPayload?.readiness);
  const entries = Array.isArray(logPayload?.entries) ? logPayload.entries : [];
  const decisions = {};

  for (const entry of entries) {
    const key = exerciseKeyOf(entry);
    if (!key) continue;
    let state = states[key];
    if (!state) {
      // Logged an exercise the plan's week 1 did not contain (a manual swap).
      // Seed from what was actually prescribed for it.
      state = progression.createState(
        { canonicalExerciseId: key, style: entry?.style, projectionFamily: entry?.projectionFamily },
        Number(entry?.prescribed?.projectedWeight)
      );
      states[key] = state;
    }
    const sets = Array.isArray(entry?.sets) ? entry.sets : [];
    const prescribedSets = Number(entry?.prescribed?.sets) || sets.length || 1;
    states[key] = progression.advance(state, sets, prescribedSets, {
      readiness,
      performedAt: logPayload?.performedAt || null
    });
    decisions[key] = states[key].lastDecision;
  }

  reprojectForward(next, states, weekIndex);

  next.meta = next.meta || {};
  next.meta[PROGRESSION_STATE_KEY] = states;
  next.meta.lastProgressionDecisions = decisions;
  next.meta.updatedAt = new Date().toISOString();
  return next;
}

module.exports = {
  PROGRESSION_STATE_KEY,
  ensureStates,
  applyLoggedSession,
  reprojectForward,
  exerciseKeyOf
};
