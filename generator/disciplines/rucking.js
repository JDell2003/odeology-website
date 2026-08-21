'use strict';

/* Phase 2.5b — rucking, behind the Discipline interface.

   Progression is a TWO-VARIABLE WAVE, load and distance, never both at once:
   load climbs +5 lb per week; when the accumulated climb reaches +15 lb the
   load drops 10 lb and the BASELINE distance grows 2 miles. Weekly mileage
   never grows more than 20%, and the long ruck stays under half the week's
   ruck miles — base volume carries the adaptation, the long day expresses it.

   The long ruck declares connective 9: rucking's cost is connective tissue
   under load for time, which recovers slowest — this is what activates the
   dormant P6 rule (no posterior >=7 within 24h before connective >=8). */

const fatigue = require('../fatigueVector');

const SESSION_TYPES = [
  { id: 'short_ruck', fatigue: fatigue.normalizeVector({ systemic: 4, kneeExtensor: 4, posterior: 5, shoulderGirdle: 3, connective: 6, aerobic: 5 }), durationMin: 60, constraints: [] },
  { id: 'long_ruck', fatigue: fatigue.normalizeVector({ systemic: 5, kneeExtensor: 5, posterior: 7, shoulderGirdle: 4, connective: 9, aerobic: 6 }), durationMin: 150, constraints: ['no_heavy_posterior_24h_before'] }
];

function demand(profile, role) {
  if (role === 'maintain') {
    // Load carried holds; distance reduces. One session keeps the tissue
    // adapted without spending the connective budget.
    return { sessionsPerWeek: { min: 1, target: 1, max: 1 }, sessionTypes: ['short_ruck'] };
  }
  return { sessionsPerWeek: { min: 1, target: 2, max: 2 }, sessionTypes: ['short_ruck', 'long_ruck'] };
}

/* The wave, one step per completed week. */
function advanceWave(state) {
  const next = { ...(state || {}) };
  next.loadLb = Number(next.loadLb) || 20;
  next.loadDeltaLb = Number(next.loadDeltaLb) || 0;
  next.weeklyBaseMi = Number(next.weeklyBaseMi) || 8;
  next.loadLb += 5;
  next.loadDeltaLb += 5;
  if (next.loadDeltaLb >= 15) {
    next.loadLb -= 10;
    next.loadDeltaLb = 0;
    next.weeklyBaseMi += 2;
  }
  return next;
}

function weeklyPrescription(state, priorWeeklyMi = null, sessionCount = 2) {
  const loadLb = Number(state?.loadLb) || 20;
  let weeklyMi = Number(state?.weeklyBaseMi) || 8;
  // Mileage growth cap: never more than 20% over the prior week.
  if (Number.isFinite(Number(priorWeeklyMi)) && priorWeeklyMi > 0) {
    weeklyMi = Math.min(weeklyMi, Math.round(priorWeeklyMi * 1.2 * 10) / 10);
  }
  /* The under-half rule's domain is THREE or more sessions, where a base of
     short rucks carries the volume and the long day expresses it. At two
     sessions there is no base to hide behind: the long ruck carries the
     bigger half (60%) or it is not long - at 8 weekly miles the old rule
     shipped a 3.9 mi "Long Ruck" next to a 4.1 mi "Short Ruck". */
  const n = Math.max(1, Number(sessionCount) || 2);
  const longMi = n >= 3
    ? Math.round(Math.min(weeklyMi * 0.49, weeklyMi - 2) * 10) / 10
    : Math.round(weeklyMi * 0.6 * 10) / 10;
  const shortMi = Math.round((weeklyMi - longMi) * 10) / 10;
  return { loadLb, weeklyMi, longMi: Math.max(2, longMi), shortMi: Math.max(2, shortMi) };
}

function progress(state, loggedSessions) {
  let next = { ...(state || {}) };
  const completedWeeks = (Array.isArray(loggedSessions) ? loggedSessions : [])
    .filter((s) => s?.type === 'week_complete').length;
  for (let i = 0; i < completedWeeks; i += 1) next = advanceWave(next);
  return next;
}

/* Simulate the wave forward and count — the honest projection is the plan's
   own progression run to the goal, as a range with the assumption stated. */
function projectTimeline(state, goal) {
  const goalMi = Number(goal?.miles);
  if (!Number.isFinite(goalMi) || goalMi <= 0) return null;
  let cursor = { ...(state || {}) };
  cursor.weeklyBaseMi = Number(cursor.weeklyBaseMi) || 8;
  let weeks = 0;
  let prior = cursor.weeklyBaseMi;
  while (weeks < 104) {
    const rx = weeklyPrescription(cursor, prior, 2);
    if (rx.longMi >= goalMi) break;
    prior = rx.weeklyMi;
    cursor = advanceWave(cursor);
    weeks += 1;
  }
  if (weeks >= 104) return { reachable: false, beyondMonths: 24, assumption: 'Two rucks per week on the load/distance wave.' };
  return {
    reachable: true,
    weeksLo: Math.max(1, Math.round(weeks * 0.85)),
    weeksHi: Math.round(weeks * 1.3),
    assumption: 'Two rucks per week; load +5 lb weekly, dropping 10 and adding 2 base miles at +15; weekly mileage growth capped at 20%; the long day carries ~60% of the weekly miles.'
  };
}

function build(request) {
  const state = request?.state || {};
  const count = Math.max(1, Math.min(2, Number(request?.sessionsPerWeek) || 2));
  const rx = weeklyPrescription(state, request?.priorWeeklyMi ?? null, count);
  const sessions = [{
    discipline: 'rucking',
    sessionType: 'short_ruck',
    name: 'Short Ruck',
    fatigue: SESSION_TYPES[0].fatigue,
    loadLb: rx.loadLb,
    distanceMi: rx.shortMi,
    durationMin: Math.round(rx.shortMi * 17),
    detail: `${rx.shortMi} mi at ${rx.loadLb} lb, brisk walk. Base volume carries the adaptation.`
  }];
  if (count >= 2) {
    sessions.push({
      discipline: 'rucking',
      sessionType: 'long_ruck',
      name: 'Long Ruck',
      fatigue: SESSION_TYPES[1].fatigue,
      loadLb: rx.loadLb,
      distanceMi: rx.longMi,
      durationMin: Math.round(rx.longMi * 18),
      detail: `${rx.longMi} mi at ${rx.loadLb} lb. The week's long day carries the bigger half of the miles; the short day keeps the base honest.`
    });
  }
  return sessions;
}

module.exports = {
  id: 'rucking',
  sessionTypes: SESSION_TYPES,
  demand,
  progress,
  projectTimeline,
  advanceWave,
  weeklyPrescription,
  build
};
