'use strict';

/* Phase 2.5c — work capacity, behind the Discipline interface.

   Carries, sled work, med ball and bodyweight standards — repeatable
   mixed-modal output, not maximal anything. Task shapes are ported from the
   military module's conditioning circuits (workCapacityTask in
   militaryHybrid.oblueprint.js), which already encode the useful rule: the
   circuit degrades by equipment, sled -> loaded carry -> bodyweight, and it
   is always one clean round per set with full transitions.

   Progression is on DENSITY, not load: same round, less rest, then one more
   round — capacity is the ability to repeat, and repeating is what gets
   progressed. Connective cost is real (loaded carries) so the sessions
   declare it and the placement layer spaces them off rucks. */

const fatigue = require('../fatigueVector');

const SESSION_TYPES = [
  { id: 'carry_circuit', fatigue: fatigue.normalizeVector({ systemic: 6, kneeExtensor: 4, posterior: 5, shoulderGirdle: 5, connective: 7, aerobic: 7 }), durationMin: 30, constraints: ['hard_conditioning'] },
  { id: 'sled_circuit', fatigue: fatigue.normalizeVector({ systemic: 6, kneeExtensor: 6, posterior: 5, shoulderGirdle: 3, connective: 5, aerobic: 8 }), durationMin: 30, constraints: ['hard_conditioning'] },
  { id: 'bodyweight_circuit', fatigue: fatigue.normalizeVector({ systemic: 5, kneeExtensor: 4, posterior: 3, shoulderGirdle: 4, connective: 4, aerobic: 7 }), durationMin: 25, constraints: ['hard_conditioning'] }
];

function demand(profile, role) {
  if (role === 'maintain') {
    return { sessionsPerWeek: { min: 1, target: 1, max: 1 }, sessionTypes: ['bodyweight_circuit'] };
  }
  return { sessionsPerWeek: { min: 1, target: 2, max: 2 }, sessionTypes: SESSION_TYPES.map((s) => s.id) };
}

/* Density progression: rest drops 15s per clean week to a floor, then a round
   is added and rest resets. Same shape as the ruck wave — one variable moves
   at a time. */
function progress(state, loggedSessions) {
  const next = { rounds: 4, restSec: 150, ...(state || {}) };
  const cleanWeeks = (Array.isArray(loggedSessions) ? loggedSessions : [])
    .filter((s) => s?.type === 'week_complete' && s?.allRoundsClean).length;
  for (let i = 0; i < cleanWeeks; i += 1) {
    if (next.restSec > 90) next.restSec -= 15;
    else { next.rounds = Math.min(6, next.rounds + 1); next.restSec = 150; }
  }
  return next;
}

/* Standards (2-mile, max push-ups, plank) belong to the military module's
   test days; a general work-capacity goal has no honest single number to
   project onto. Null until a concrete standard is declared. */
function projectTimeline() {
  return null;
}

/* Every circuit the equipment allows, best first. Two sessions a week are
   two DIFFERENT circuits - the same circuit twice in a week trains the
   test, not the capacity. */
function circuitCandidates(equipment) {
  const eq = new Set((Array.isArray(equipment) ? equipment : []).map((x) => String(x).toLowerCase()));
  const list = [];
  if (eq.has('sled')) {
    list.push({
      sessionType: 'sled_circuit',
      name: 'Sprint-Drag-Carry Circuit',
      detail: '1 round = 25 m sprint + 25 m sled drag + 25 m lateral shuffle + 25 m carry. Move fast, keep transitions organized.'
    });
  }
  if (eq.has('kettlebell') || eq.has('dumbbell')) {
    list.push({
      sessionType: 'carry_circuit',
      name: 'Shuttle + Loaded Carry Circuit',
      detail: '1 round = 20 m shuttle out + 20 m shuttle back + 30 m loaded carry. Accelerate under control, stay tall on the carry.'
    });
  }
  list.push({
    sessionType: 'bodyweight_circuit',
    name: 'Bodyweight Work-Capacity Circuit',
    detail: '1 round = 8 controlled step-ups/side + 6 push-ups + 20 sec plank. Repeatable output without impact-heavy sprinting.'
  });
  return list;
}

function pickCircuit(equipment) {
  return circuitCandidates(equipment)[0];
}

function build(request) {
  const state = { rounds: 4, restSec: 150, ...(request?.state || {}) };
  const candidates = circuitCandidates(request?.equipment);
  const count = Math.max(1, Math.min(2, Number(request?.sessionsPerWeek) || 1));
  const sessions = [];
  for (let i = 0; i < count; i += 1) {
    const circuit = candidates[i % candidates.length];
    sessions.push({
      discipline: 'workCapacity',
      sessionType: circuit.sessionType,
      name: circuit.name,
      fatigue: SESSION_TYPES.find((s) => s.id === circuit.sessionType)?.fatigue || null,
      rounds: state.rounds,
      restSec: state.restSec,
      detail: `${state.rounds} rounds, ${state.restSec} sec rest between. ${circuit.detail}`
    });
  }
  return sessions;
}

module.exports = {
  id: 'workCapacity',
  sessionTypes: SESSION_TYPES,
  demand,
  progress,
  projectTimeline,
  pickCircuit,
  circuitCandidates,
  build
};
