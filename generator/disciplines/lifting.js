'use strict';

/* Phase 2.1 — lifting, behind the Discipline interface.

   The interface every discipline implements:

     Discipline {
       id,
       demand(profile, role) -> { sessionsPerWeek: {min, target, max}, sessionTypes: [] },
       sessionTypes: [{ id, fatigue: FatigueVector, durationMin, constraints: [] }],
       progress(state, loggedSessions) -> newState,
       projectTimeline(state, goal, profile) -> TimelineProjection | null,
       build(request) -> plan
     }

   Progression rules live INSIDE the discipline — lifting uses double
   progression on carried state, running will gate on pace off a time trial,
   rucking runs a two-variable wave. They are deliberately not unified.

   Strength and hypertrophy are ONE module with a bias parameter; the split
   exists only in an enum (`discipline: 'bodybuilding' | 'powerbuilding'`), and
   the same buildSplit/fillSlots/scoring serves both. This module is a seam,
   not a rewrite: build() delegates to the engine unchanged, so plans are
   byte-identical to calling it directly. The Phase 2 composition work swaps
   what sits behind build() without the callers changing. */

const engine = require('../trainingEngine.oblueprint');
const progressionState = require('../progressionState');
const progressionPlanUpdate = require('../progressionPlanUpdate');
const fatigue = require('../fatigueVector');

/* Session types with their fatigue vectors — the same numbers the P6 ordering
   constraints run on in the engine. */
const SESSION_TYPES = [
  { id: 'heavy_squat', fatigue: fatigue.normalizeVector({ systemic: 8, kneeExtensor: 9, posterior: 6, shoulderGirdle: 1, connective: 5, aerobic: 2 }), durationMin: 75, constraints: [] },
  { id: 'heavy_deadlift', fatigue: fatigue.normalizeVector({ systemic: 9, kneeExtensor: 4, posterior: 9, shoulderGirdle: 3, connective: 6, aerobic: 2 }), durationMin: 75, constraints: [] },
  { id: 'heavy_bench', fatigue: fatigue.normalizeVector({ systemic: 6, kneeExtensor: 0, posterior: 1, shoulderGirdle: 8, connective: 4, aerobic: 1 }), durationMin: 60, constraints: [] },
  { id: 'volume_upper', fatigue: fatigue.normalizeVector({ systemic: 6, kneeExtensor: 0, posterior: 2, shoulderGirdle: 7, connective: 4, aerobic: 1 }), durationMin: 60, constraints: [] },
  { id: 'volume_lower', fatigue: fatigue.normalizeVector({ systemic: 8, kneeExtensor: 7, posterior: 8, shoulderGirdle: 1, connective: 6, aerobic: 2 }), durationMin: 60, constraints: [] },
  { id: 'isolation_block', fatigue: fatigue.normalizeVector({ systemic: 2, kneeExtensor: 0, posterior: 0, shoulderGirdle: 5, connective: 2, aerobic: 1 }), durationMin: 45, constraints: [] }
];

function demand(profile, role) {
  const days = Math.max(2, Math.min(6, Number(profile?.daysPerWeek || 4)));
  if (role === 'maintain') {
    // Minimum effective dose: one heavy exposure per week at ~85% of the top
    // set holds strength; no progression.
    return { sessionsPerWeek: { min: 1, target: 2, max: 2 }, sessionTypes: ['heavy_bench', 'volume_lower'] };
  }
  if (role === 'develop') {
    return { sessionsPerWeek: { min: 2, target: Math.min(4, days), max: Math.min(5, days) }, sessionTypes: SESSION_TYPES.map((s) => s.id) };
  }
  return { sessionsPerWeek: { min: 3, target: days, max: days }, sessionTypes: SESSION_TYPES.map((s) => s.id) };
}

/* Double progression on carried state — generator/progressionState.js is the
   single authority; this is a pass-through so the interface owns the seam
   without duplicating the rules. */
function progress(state, loggedSessions) {
  let next = state;
  for (const session of Array.isArray(loggedSessions) ? loggedSessions : []) {
    next = progressionState.advance(
      { ...next },
      session?.sets || [],
      Number(session?.prescribedSetCount) || (session?.sets || []).length,
      { readiness: session?.readiness, performedAt: session?.performedAt }
    );
  }
  return next;
}

/* §7 — the strength timeline. The ceiling term is what makes it honest:
   someone regaining a lift they have held before sits far under their
   ceiling and moves fast; someone approaching the same number for the first
   time is near it and crawls. Efficiency falls with the cube of proximity.
   Output is a RANGE with the assumption stated, never a single date, and an
   unreachable goal returns the honest number plus a reachable milestone. */
const LIFT_MULTIPLIER = { bench: 1.5, squat: 2.0, deadlift: 2.5 };
const AGE_FACTOR = { '<6m': 0.85, '6-24m': 1.0, '2-5y': 1.1, '5y+': 1.15 };

function projectStrengthTimeline({ current, goal, repMin, repMax, loadStep, frequencyPerWeek, ceiling, adherence = 0.85 }) {
  const exposuresPerCycle = (repMax - repMin) + 1;
  const baseWeeksPerCycle = exposuresPerCycle / Math.max(1, frequencyPerWeek);
  let load = Number(current);
  let weeks = 0;
  let cycles = 0;
  while (load < goal && weeks < 130) {
    const proximity = Math.min(load / ceiling, 0.99);
    const efficiency = Math.max(1 - Math.pow(proximity, 3), 0.15);
    weeks += baseWeeksPerCycle / (adherence * efficiency);
    load += loadStep;
    cycles += 1;
  }
  if (load < goal) return { reachable: false, beyondMonths: 30 };
  return {
    reachable: true,
    weeks: Math.round(weeks),
    rangeWeeks: [Math.round(weeks * 0.75), Math.round(weeks * 1.35)],
    cycles
  };
}

function projectTimeline(state, goal, profile) {
  const lift = String(goal?.lift || '');
  const goalLb = Number(goal?.weight);
  const current = Number(state?.currentLb);
  if (!LIFT_MULTIPLIER[lift] || !Number.isFinite(goalLb) || !Number.isFinite(current) || current <= 0) return null;
  const bodyweight = Number(profile?.bodyweightLb) || 200;
  const age = String(profile?.experience || '6-24m');
  const priorBest = Number(state?.priorBestLb) || current;
  const ceiling = Math.max(priorBest * 1.05, bodyweight * LIFT_MULTIPLIER[lift] * (AGE_FACTOR[age] || 1));
  const cfg = lift === 'bench'
    ? { repMin: 6, repMax: 8, loadStep: 10, frequencyPerWeek: Number(profile?.frequency?.[lift]) || 3 }
    : { repMin: 5, repMax: 8, loadStep: 15, frequencyPerWeek: Number(profile?.frequency?.[lift]) || (lift === 'squat' ? 2 : 1) };
  const result = projectStrengthTimeline({ current, goal: goalLb, ceiling, ...cfg });
  if (!result) return null;
  const assumption = `${cfg.frequencyPerWeek}x/week double progression (${cfg.repMin}-${cfg.repMax} reps, +${cfg.loadStep} lb per cycle), 85% adherence, ceiling ${Math.round(ceiling)} lb from ${priorBest > current ? 'a prior best of ' + Math.round(priorBest) : 'bodyweight and training age'}.`;
  if (!result.reachable) {
    // The honest number plus a reachable milestone.
    let milestone = goalLb;
    let milestoneResult = result;
    while (!milestoneResult.reachable && milestone > current + 20) {
      milestone -= 25;
      milestoneResult = projectStrengthTimeline({ current, goal: milestone, ceiling, ...cfg });
    }
    return {
      reachable: false,
      beyondMonths: 30,
      assumption,
      milestone: milestoneResult.reachable
        ? { weight: milestone, rangeWeeks: milestoneResult.rangeWeeks }
        : null
    };
  }
  return { reachable: true, rangeWeeks: result.rangeWeeks, cycles: result.cycles, assumption };
}

/* The engine, unchanged. Same function the routes call today, so a plan built
   through the discipline interface is byte-identical to one built without it. */
function build(request) {
  return engine.buildOblueprintPlan(request?.payload, request?.exercises);
}

module.exports = {
  id: 'lifting',
  sessionTypes: SESSION_TYPES,
  demand,
  progress,
  projectTimeline,
  projectStrengthTimeline,
  build,
  applyLoggedSession: progressionPlanUpdate.applyLoggedSession
};
