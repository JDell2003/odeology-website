'use strict';

/* generator/progressionSchemes.js
   The ONE place progression numbers live. Consumed only by
   buildProjectionWeekRowsForExercise + progressionRuleForExercise in
   generator/trainingEngine.oblueprint.js, selected by user.progressionStyle.

   How a scheme drives the 16-week ladder (see buildProjectionWeekRowsForExercise):
     - cycleWeeks .......... weeks per rep-cycle. Reps climb +1/week from the
                             base for `cycleWeeks` weeks, then the load steps up
                             and reps reset to the base. So the effective rep
                             ceiling = repBase + cycleWeeks - 1.
     - repBase ............. bottom of the rep cycle. 'rangeMin' = the bottom of
                             the exercise's own rep range (today's behavior).
                             A number pins every main lift to that base.
     - accessoryRepBase .... optional. Used for accessories (isolation families
                             + bodyweight/loaded-bodyweight movements like
                             pullups) instead of repBase. (Applied in Task 2.)
     - loadStepByFamily .... lb added to the working load each cycle, keyed by
                             estimate.family (the projection family, NOT the raw
                             lift name). `_default` covers everything unlisted.
                             The step is added then rounded to the exercise's own
                             achievable increment (roundProjectedLoad), so plate
                             math still holds.
     - resetRepsToBase ..... reps drop back to the base at each new cycle.

   Family-key legend (estimate.family from conservativeFamilyEstimate):
     chest_press = flat/incline barbell+db+machine presses (Jason's "bench")
     horizontal_pull = rows            vertical_pull = pulldowns/pull-ups
     shoulder_press = overhead press   squat_pattern = squats
     hinge_pattern = deadlift/RDL      leg_press, hip_thrust = big lower movers
     *_iso / lateral_raise / rear_delt / calves / core_* / single_leg = isolation
*/

module.exports = {
  // DEFAULT — reproduces current production output byte-for-byte.
  // repBase 'rangeMin' + cycleWeeks 4 + flat +5 == the old
  // REP_LADDER_CYCLE_WEEKS / REP_LADDER_LOAD_STEP_LB constants. Do NOT change.
  standard: {
    label: 'Standard',
    cycleWeeks: 4,
    repBase: 'rangeMin',
    repCeiling: 'rangeMinPlus3', // documentation; effective ceiling = repBase + cycleWeeks - 1
    loadStepByFamily: { _default: 5 },
    resetRepsToBase: true
  },

  // Jason's scheme — a first-class, selectable style. Powerbuilding default.
  // base 6 mains / base 8 accessories, +1 rep/week for 4 weeks, then reset reps
  // and add PER-LIFT load (deadlift/squat +20, main upper compounds +10,
  // isolation +5). Evidence: overload-progression method matters less than the
  // presence of progressive overload (PMID 38286426); a lower-rep double
  // progression is strength-leaning and correct for powerbuilding (PMC7927075).
  double_progression: {
    label: 'Double Progression',
    cycleWeeks: 4,               // 6 -> 9 over 4 weeks
    repBase: 6,
    repCeiling: 9,
    accessoryRepBase: 8,         // pullups / isolation start at 8
    loadStepByFamily: {
      squat_pattern: 20, hinge_pattern: 20, leg_press: 20, hip_thrust: 20, // big lower movers
      chest_press: 10, horizontal_pull: 10, vertical_pull: 10, shoulder_press: 10, // main upper compounds
      _default: 5                // isolation / small movements
    },
    resetRepsToBase: true
  },

  // Hypertrophy-tuned variant for the bodybuilding discipline: higher reps,
  // smaller jumps. cycleWeeks 5 so reps span the stated 8->12 (base + cycle-1).
  // Evidence: hypertrophy is achievable across ~6-30 reps taken near failure
  // (PMC7927075); undulating vs linear is a wash (PMC5571788).
  hypertrophy_double: {
    label: 'Hypertrophy Double Progression',
    cycleWeeks: 5,               // 8 -> 12 over 5 weeks
    repBase: 8,
    repCeiling: 12,
    accessoryRepBase: 8,
    loadStepByFamily: {
      squat_pattern: 15, hinge_pattern: 15, leg_press: 15, hip_thrust: 15,
      chest_press: 10, horizontal_pull: 10, vertical_pull: 10, shoulder_press: 10,
      _default: 5
    },
    resetRepsToBase: true
  }
};
