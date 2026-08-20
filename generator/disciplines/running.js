'use strict';

/* Phase 2.5 — running, behind the Discipline interface.

   Progression gates on PACE OFF A TIME TRIAL, not on a week index: every
   target pace derives from the most recent trial, and improvement re-derives
   the targets. Easy runs are the deliberate exception — they carry DURATION
   and EFFORT only, never a pace target. A pace target on an easy day breaks
   the whole concurrent structure: the easy day exists to add aerobic volume
   without loading recovery, and pinning a number to it turns it into a third
   quality session. */

const fatigue = require('../fatigueVector');

const SESSION_TYPES = [
  { id: 'easy_run', fatigue: fatigue.normalizeVector({ systemic: 2, kneeExtensor: 2, posterior: 2, shoulderGirdle: 0, connective: 3, aerobic: 4 }), durationMin: 30, constraints: [] },
  { id: 'tempo_run', fatigue: fatigue.normalizeVector({ systemic: 4, kneeExtensor: 4, posterior: 3, shoulderGirdle: 0, connective: 4, aerobic: 7 }), durationMin: 30, constraints: [] },
  { id: 'interval_run', fatigue: fatigue.normalizeVector({ systemic: 6, kneeExtensor: 6, posterior: 5, shoulderGirdle: 0, connective: 6, aerobic: 9 }), durationMin: 35, constraints: ['hard_conditioning'] }
];

function demand(profile, role) {
  if (role === 'maintain') {
    // Aerobic fitness decays faster than strength: the maintain floor is one
    // QUALITY session, not one easy jog.
    return { sessionsPerWeek: { min: 1, target: 1, max: 2 }, sessionTypes: ['tempo_run'] };
  }
  if (role === 'develop') {
    return { sessionsPerWeek: { min: 2, target: 2, max: 3 }, sessionTypes: ['easy_run', 'tempo_run'] };
  }
  return { sessionsPerWeek: { min: 3, target: 3, max: 4 }, sessionTypes: ['easy_run', 'tempo_run', 'interval_run'] };
}

function paceSecPerMi(state) {
  const trialSec = Number(state?.timeTrialSec);
  const trialMi = Number(state?.timeTrialMi) || 2;
  if (!Number.isFinite(trialSec) || trialSec <= 0) return null;
  return trialSec / trialMi;
}

/* Target paces derive from the trial. Tempo ~ trial pace + 30-40s/mi;
   intervals at trial pace for 400-800m reps. Easy carries NO pace on purpose. */
function prescriptions(state) {
  const pace = paceSecPerMi(state);
  const fmt = (sec) => {
    if (!Number.isFinite(sec)) return null;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}/mi`;
  };
  return {
    easy_run: {
      name: 'Easy Run', durationMin: 30, effort: 'conversational',
      detail: '30 min at a pace you could hold a conversation at. No watch-chasing — this session adds aerobic volume without costing recovery.'
    },
    tempo_run: {
      name: 'Tempo Run', durationMin: 30, effort: 'comfortably hard',
      paceTarget: pace ? fmt(pace + 35) : null,
      detail: pace
        ? `10 min easy, 15 min at ${fmt(pace + 35)}, 5 min easy.`
        : '10 min easy, 15 min comfortably hard, 5 min easy. Log a 2-mile time trial to get paces.'
    },
    interval_run: {
      name: 'Interval Run', durationMin: 35, effort: 'hard',
      paceTarget: pace ? fmt(pace) : null,
      detail: pace
        ? `6 x 800m at ${fmt(pace)} with 2:30 jog recoveries.`
        : '6 x 800m hard with 2:30 jog recoveries. Log a 2-mile time trial to get paces.'
    }
  };
}

/* Progression: a new trial re-derives every pace. Between trials, interval rep
   count builds 6 -> 8 before pace moves — volume before intensity. */
function progress(state, loggedSessions) {
  const next = { ...(state || {}) };
  for (const session of Array.isArray(loggedSessions) ? loggedSessions : []) {
    if (session?.type === 'time_trial' && Number(session?.timeSec) > 0) {
      next.timeTrialSec = Number(session.timeSec);
      next.timeTrialMi = Number(session.distanceMi) || 2;
      next.trialAt = session?.performedAt || next.trialAt || null;
    }
    if (session?.type === 'interval_run' && session?.completed) {
      next.intervalReps = Math.min(8, Number(next.intervalReps || 6) + 1);
    }
  }
  return next;
}

/* §7 running timeline: pace bands, not one rate. Slower than 10:00/mi improves
   20-30 s/mi per month; 8-10:00 improves 10-15; 7-8:00 improves 5-8; under
   7:00 improves 2-4. Walk the bands from current to goal and report a RANGE
   with the assumption stated — never a single date. */
const PACE_BANDS = [
  { floorSec: 600, gainLo: 20, gainHi: 30 },
  { floorSec: 480, gainLo: 10, gainHi: 15 },
  { floorSec: 420, gainLo: 5, gainHi: 8 },
  { floorSec: 0, gainLo: 2, gainHi: 4 }
];

function projectTimeline(state, goal) {
  const current = paceSecPerMi(state);
  const goalSec = Number(goal?.timeSec);
  const goalMi = Number(goal?.distanceMi) || 2;
  if (!Number.isFinite(current) || !Number.isFinite(goalSec) || goalSec <= 0) return null;
  const goalPace = goalSec / goalMi;
  if (goalPace >= current) {
    return { reachable: true, monthsLo: 0, monthsHi: 0, assumption: 'Goal pace is at or slower than the current trial.' };
  }
  let paceLo = current;
  let paceHi = current;
  let months = 0;
  while (paceHi > goalPace && months < 36) {
    months += 1;
    const bandLo = PACE_BANDS.find((b) => paceLo > b.floorSec) || PACE_BANDS[PACE_BANDS.length - 1];
    const bandHi = PACE_BANDS.find((b) => paceHi > b.floorSec) || PACE_BANDS[PACE_BANDS.length - 1];
    paceLo -= bandLo.gainHi;   // optimistic walker
    paceHi -= bandHi.gainLo;   // conservative walker
  }
  if (paceHi > goalPace) return { reachable: false, beyondMonths: 36, assumption: '3 quality sessions per week, bands from trained-runner improvement rates.' };
  let monthsLo = 0;
  let walk = current;
  while (walk > goalPace && monthsLo < 36) {
    monthsLo += 1;
    const band = PACE_BANDS.find((b) => walk > b.floorSec) || PACE_BANDS[PACE_BANDS.length - 1];
    walk -= band.gainHi;
  }
  return {
    reachable: true,
    monthsLo,
    monthsHi: months,
    assumption: '3 runs per week with 1-2 quality sessions; improvement rates by pace band, slowing as pace improves.'
  };
}

/* Build session descriptors for one week. The composer places them; running
   does not own the calendar. */
function build(request) {
  const state = request?.state || {};
  const count = Math.max(1, Math.min(4, Number(request?.sessionsPerWeek) || 3));
  const rx = prescriptions(state);
  const order = count >= 3 ? ['interval_run', 'tempo_run', 'easy_run', 'easy_run'] : count === 2 ? ['tempo_run', 'easy_run'] : ['tempo_run'];
  return order.slice(0, count).map((id) => ({
    discipline: 'running',
    sessionType: id,
    fatigue: SESSION_TYPES.find((s) => s.id === id)?.fatigue || null,
    ...rx[id]
  }));
}

module.exports = {
  id: 'running',
  sessionTypes: SESSION_TYPES,
  demand,
  progress,
  projectTimeline,
  prescriptions,
  build
};
