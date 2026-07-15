'use strict';

/* generator/cardioPrescription.js
   Optional conditioning block, attached to a plan as plan.conditioning ONLY when
   the user opts in (user.wantsCardio). Purely additive — it never touches the
   resistance selection/split/validation core, so a plan without it is byte-for-byte
   the same as before.

   Progression mirrors the lifting philosophy (add volume, then intensity):
   add duration for `cycleWeeks` weeks, then step the intensity up and reset the
   duration — the cardio analogue of add-reps-then-load. Evidence: the app has a
   Cardio spider axis anchored on graded minutes-at-intensity (WHO), so volume then
   intensity is the right lever. */

const CARDIO_CONFIG = {
  cycleWeeks: 4,          // add minutes for 4 weeks, then bump intensity + reset
  baseMinutes: 20,
  minuteStep: 5,          // +5 min/week within a cycle
  weeks: 16,
  // Intensity ladder — each new cycle steps up one rung (add-volume-then-intensity).
  intensityLadder: [
    'Zone 2 — easy, conversational pace',
    'Zone 2-3 — steady, slightly harder to talk',
    'Zone 3 + short pickups — steady with 4-6 x 30s faster surges',
    'Intervals — repeat hard/easy blocks (e.g. 4-6 x 2min hard / 2min easy)'
  ]
};

// Sessions/week from discipline + goal. Fat-loss and military lean into more
// conditioning; a bulking lifter gets the minimum to protect recovery.
function sessionsPerWeekFor(user) {
  const discipline = String(user?.discipline || '').trim().toLowerCase();
  if (discipline === 'military') return 4;
  const goal = String(user?.primaryGoal || '').trim();
  if (goal === 'Cut fat') return 3;
  if (goal === 'Recomp') return 2;
  return 1; // Build size / surplus — keep it minimal
}

function buildConditioningPlan(user) {
  if (!user || !user.wantsCardio) return null;
  const sessions = sessionsPerWeekFor(user);
  const { cycleWeeks, baseMinutes, minuteStep, weeks, intensityLadder } = CARDIO_CONFIG;
  const weeklyTable = [];
  for (let week = 1; week <= weeks; week += 1) {
    const cycle = Math.floor((week - 1) / cycleWeeks);
    const pos = (week - 1) % cycleWeeks;
    const minutes = baseMinutes + (minuteStep * pos);
    const intensity = intensityLadder[Math.min(cycle, intensityLadder.length - 1)];
    const lastWeekOfCycle = pos === cycleWeeks - 1;
    weeklyTable.push({
      week,
      sessionsPerWeek: sessions,
      minutesPerSession: minutes,
      intensity,
      note: lastWeekOfCycle
        ? `Peak duration at ${minutes} min. Next cycle: intensity steps up and duration resets to ${baseMinutes} min.`
        : `Same intensity — add ${minuteStep} min (${minutes} min this week).`
    });
  }
  return {
    sessionsPerWeek: sessions,
    cycleWeeks,
    modality: 'Mixed steady-state + intervals',
    progressionMode: 'add_volume_then_intensity',
    philosophy: 'Add duration for a few weeks, then raise intensity and reset the duration — the cardio version of add-reps-then-load.',
    weeklyTable
  };
}

module.exports = { CARDIO_CONFIG, sessionsPerWeekFor, buildConditioningPlan };
