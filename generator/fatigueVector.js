'use strict';

/* Phase 2.1 — the FatigueVector.

   A session declares what it costs on six tissue axes, 0-10. `connective` is
   the axis that matters most for hybrid athletes: rucking, running and
   grappling all load it heavily and it recovers slowest, so it carries the
   lowest weekly budget and the longest decay. That single choice encodes most
   of what is known about why hybrid athletes get hurt.

   The per-day-type loads and the ordering constraints already run in
   production (P6, generator/trainingEngine.oblueprint.js). This module is the
   interface the discipline modules program against: lifting today; running,
   rucking, work capacity and martial arts declare their own session types
   against the same axes as they land. */

const FATIGUE_AXES = ['systemic', 'kneeExtensor', 'posterior', 'shoulderGirdle', 'connective', 'aerobic'];

function emptyVector() {
  const v = {};
  for (const axis of FATIGUE_AXES) v[axis] = 0;
  return v;
}

function normalizeVector(raw) {
  const v = emptyVector();
  for (const axis of FATIGUE_AXES) {
    const n = Number(raw?.[axis]);
    v[axis] = Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0;
  }
  return v;
}

function addVectors(a, b) {
  const v = emptyVector();
  for (const axis of FATIGUE_AXES) v[axis] = Number(a?.[axis] || 0) + Number(b?.[axis] || 0);
  return v;
}

function scaleVector(vector, factor) {
  const v = emptyVector();
  const f = Number(factor);
  for (const axis of FATIGUE_AXES) v[axis] = Number(vector?.[axis] || 0) * (Number.isFinite(f) ? f : 1);
  return v;
}

/* Weekly budget per axis, derived from the recovery inputs the engine already
   composes (sleep, stress, phase, joint severity). DESIGN, NOT VALIDATED —
   the shape follows militaryHybrid.buildRecoveryTier, which has never run in
   production; treat these numbers as a starting point to be tuned from logged
   readiness, not as settled values. `connective` deliberately gets the lowest
   budget and the slowest recovery. */
const BASE_WEEKLY_AXIS_BUDGET = {
  systemic: 34,
  kneeExtensor: 26,
  posterior: 26,
  shoulderGirdle: 26,
  connective: 20,
  aerobic: 30
};

function deriveAxisBudgets(user) {
  const sleep = String(user?.sleepHours || user?.sleep || '');
  const stress = String(user?.stress || '').toLowerCase();
  let multiplier = 1;
  if (/^(4|5|<6|4-5|5-6)/.test(sleep)) multiplier -= 0.15;
  else if (/^(8|9|8-9|9\+)/.test(sleep)) multiplier += 0.05;
  if (/high/.test(stress)) multiplier -= 0.1;
  else if (/low/.test(stress)) multiplier += 0.05;
  const budgets = {};
  for (const axis of FATIGUE_AXES) {
    budgets[axis] = Math.round(BASE_WEEKLY_AXIS_BUDGET[axis] * multiplier);
  }
  return budgets;
}

module.exports = {
  FATIGUE_AXES,
  BASE_WEEKLY_AXIS_BUDGET,
  emptyVector,
  normalizeVector,
  addVectors,
  scaleVector,
  deriveAxisBudgets
};
