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

/* Timeline projection is Phase 2.7 (§7, the ceiling term). Returning null is
   the honest answer until it exists — never a fabricated date. */
function projectTimeline() {
  return null;
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
  build,
  applyLoggedSession: progressionPlanUpdate.applyLoggedSession
};
