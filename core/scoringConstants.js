// core/scoringConstants.js
// SINGLE SOURCE OF TRUTH FOR ALL SCORING TUNABLES.
// Do NOT scatter magic numbers in scoringEngine.js — read them from here.
//
// Confidence tags on each block:
//   HIGH             = settled/canonical published value — trust it.
//   MEDIUM           = well-established but approximate — fine to ship, refine later.
//   DESIGN           = owner product decision (not a scientific constant).
//   VERIFY-PRECISION = a working value is provided; exact form (DOTS/McCulloch) can be
//                      swapped for the official coefficient set later. NOT a blocker.
'use strict';

module.exports = {
  version: '1.0-filled',

  // DESIGN. Axis blend: normalized standard vs self-improvement.
  blend: { standardWeight: 0.60, selfWeight: 0.40 },

  // DESIGN. Trust ladder multipliers by provenance.
  trust: { device: 1.00, self_report: 0.70, implausible: 0.00 },

  // DESIGN. Rolling windows (days) and recency weighting.
  windows: {
    strengthDays: 42,          // best-recent e1RM bank (strength is retained for weeks)
    cardioDays: 14,
    consistencyDays: 28,
    nutritionDays: 14,
    recoveryDays: 14,
    progressDays: 28,
    recencyHalfLifeDays: 10
  },

  // Per-axis decay: points/idle-day after grace (idle) days.
  // MEDIUM — anchored to detraining timelines (strength retained weeks; VO2max falls 2-4 wks;
  // habits collapse fast). Tunable.
  decay: {
    strength:    { graceDays: 12, perDay: 0.4 },  // MEDIUM: minimal strength loss < ~3-4 wks
    cardio:      { graceDays: 5,  perDay: 1.3 },   // MEDIUM: measurable VO2max loss by 2-4 wks
    consistency: { graceDays: 2,  perDay: 4.0 },   // DESIGN: kept from current app; habit is fragile
    nutrition:   { graceDays: 3,  perDay: 1.5 },   // DESIGN
    recovery:    { graceDays: 3,  perDay: 1.5 },   // DESIGN
    progress:    { graceDays: 7,  perDay: 1.0 }    // DESIGN
  },

  // Part C — consistency pairs with the training schedule (behind
  // SCORING_CONSISTENCY_PAIRED). Per-day completion = done/expected of the
  // day's expected actions. A completed SCHEDULED workout weighs heaviest, so
  // "checked in but skipped a planned session" scores clearly lower than
  // "checked in + trained". On a rest day only the check-in is expected, so a
  // bare check-in is full (no "no-workout" penalty).
  consistencyPairing: {
    checkin: 1,   // a check-in (daily check-in OR the wake check-in)
    workout: 3,   // heaviest — only expected on a scheduled training day
    other:   0.5  // bonus per other completed action (cardio, meals, unplanned workout)
  },

  // STRENGTH normalization.
  strength: {
    mainLifts: ['bench', 'squat', 'deadlift', 'ohp'],   // map exercise_key -> these

    // WORKING DEFAULT = allometric scaling (load / bodyweight^0.67), sex-adjusted per lift.
    // HIGH on the 0.67 exponent; MEDIUM on the per-lift female:male ratios (upper-body ~0.6,
    // lower-body ~0.72-0.74 from strength meta-analyses).
    coefficients: {
      method: 'allometric',
      exponent: 0.67,                                    // HIGH
      femaleFactorByLift: { bench: 0.60, ohp: 0.61, squat: 0.73, deadlift: 0.74 }  // MEDIUM
    },

    // Relative-strength standards as MULTIPLES OF BODYWEIGHT (1RM), by sex.
    // MEDIUM — widely-used training standards; these anchor the 0-100 map:
    //   at/below noviceMult -> ~25 ; intermediateMult -> ~50 ; advancedMult -> ~80 ; eliteMult -> ~100
    bwMultipleStandards: {
      male: {
        bench:    { novice: 0.75, intermediate: 1.25, advanced: 1.75, elite: 2.00 },
        squat:    { novice: 1.25, intermediate: 1.75, advanced: 2.25, elite: 2.75 },
        deadlift: { novice: 1.50, intermediate: 2.00, advanced: 2.50, elite: 3.00 },
        ohp:      { novice: 0.50, intermediate: 0.75, advanced: 1.05, elite: 1.25 }
      },
      female: {
        bench:    { novice: 0.50, intermediate: 0.75, advanced: 1.10, elite: 1.40 },
        squat:    { novice: 1.00, intermediate: 1.35, advanced: 1.80, elite: 2.25 },
        deadlift: { novice: 1.15, intermediate: 1.60, advanced: 2.10, elite: 2.60 },
        ohp:      { novice: 0.35, intermediate: 0.55, advanced: 0.80, elite: 1.00 }
      }
    },
    anchorPoints: { novice: 25, intermediate: 50, advanced: 80, elite: 100 }, // DESIGN mapping

    // OPTIONAL ACCURACY UPGRADE (VERIFY-PRECISION): swap the allometric normalizer for the
    // official DOTS coefficients. Do NOT paste coefficients from memory — copy the published
    // men's/women's coefficient block from the OpenLifter source (github.com/openpowerlifting/
    // opl-data -> DOTS) and set method:'dots'. Until then, allometric above is the real default.
    dotsUpgrade: { enabled: false, note: 'Insert official DOTS coefficients before enabling.' },

    estimator: 'epley',            // HIGH: already computed in app_training_lift_history
    estimatorReliableMaxReps: 10,  // HIGH: e1RM from >~10 reps is unreliable — down-weight
    implausibleWeeklyGainPct: 12   // DESIGN: e1RM jump/week above this -> flag, trust x0
  },

  // AGE adjustment.
  age: {
    // WORKING DEFAULT (MEDIUM): gentle per-year handicap past 40 and scaling under 20.
    // VERIFY-PRECISION: replace with the McCulloch age-coefficient table for exactness.
    strengthPerYearOver40: 0.006,   // ~0.6%/yr
    strengthPerYearUnder20: 0.010,
    vo2maxPercentPerDecade: 0.10    // HIGH: ~10% VO2max decline per decade
  },

  // CARDIO.
  cardio: {
    // HIGH: WHO 2020 volume. Moderate 150 min/wk = solid; 300+ = high. Vigorous counts double.
    whoMinutesAnchors: { moderateMin150Points: 50, moderateMin300Points: 75, vigorousMultiplier: 2 },

    // MEDIUM: FRIEND-registry ~50th-percentile VO2max (mL/kg/min) by sex x age decade.
    // Use as the midpoint anchor (50 pts); scale around it. p20/p95 grid is the optional upgrade.
    vo2max50thBySexDecade: {
      male:   { '20': 48.0, '30': 44.0, '40': 40.0, '50': 36.0, '60': 31.0, '70': 24.4 },
      female: { '20': 37.6, '30': 35.0, '40': 32.0, '50': 28.0, '60': 25.0, '70': 18.3 }
    },

    // HIGH: MET values (2024 Compendium-style) for the 20 most common activities.
    metValues: {
      walking_3_5mph: 4.3, walking_4mph: 5.0, jogging_general: 7.0, running_5mph: 8.3,
      running_6mph: 9.8, running_7mph: 11.0, cycling_leisure: 4.0, cycling_moderate: 8.0,
      cycling_vigorous: 10.0, swimming_leisure: 6.0, swimming_laps: 9.8, rowing_moderate: 7.0,
      elliptical: 5.0, stair_climber: 9.0, jump_rope: 12.3, hiking: 6.0, basketball: 6.5,
      soccer: 7.0, tennis_singles: 8.0, hiit_calisthenics: 8.0
    },

    stepsFallbackCapPoints: 40,   // DESIGN: steps alone can never exceed this
    stepGoal: 8000                // kept only as the weak fallback threshold
  },

  // NUTRITION.
  nutrition: {
    // HIGH/MEDIUM: within the 1.6-2.2 g/kg evidence band (Morton 2018 ~1.62 ceiling for FFM;
    // ISSN 2017 1.4-2.0; higher when cutting to spare lean mass).
    proteinGPerKg: { cut: 2.2, maintain: 1.8, gain: 1.8 },
    perMealProteinG: { perKg: 0.25, absoluteMin: 20, absoluteMax: 40 }, // HIGH (ISSN 2017)
    calorieBandPct: 0.10,          // HIGH-ish: +/-10% of Mifflin target = on-plan
    logDaysForFullCredit: 5        // MEDIUM: frequent self-monitoring predicts outcomes (Burke)
  },

  // RECOVERY.
  recovery: {
    sleepBands: { adultMinHours: 7, adultMaxHours: 9, seniorMinHours: 7, seniorMaxHours: 8 }, // HIGH
    weights: { duration: 0.5, regularity: 0.3, restedness: 0.2 }, // DESIGN
    regularityMatters: true,       // HIGH: Windred 2024 — regularity predicts mortality > duration
    punishGrindAfterDaysStraight: 7 // DESIGN
  },

  // PROGRESS.
  progress: {
    emaHalfLifeDays: 7,            // DESIGN
    safeFatLossPctBWPerWeek: { min: 0.5, max: 1.0 }, // HIGH: Garthe 2011 (~0.7% spares lean mass)
    // MEDIUM: muscle-gain rate model by training age (%BW/month) — Lyle McDonald / Aragon style.
    muscleGainPctBWPerMonth: { beginner: 1.25, intermediate: 0.75, advanced: 0.375 },
    dailyScaleNoisePct: 1.5,      // HIGH: daily bodyweight swings ~1-2% from water/food
    rewardMatchingNotExceeding: true // DESIGN: crash-cut protection
  },

  // RANK GATES. DESIGN — absolute 0-100, unlimited holders. Tuned so King ~ top 0.5-1%,
  // Knight ~ top 10%, Squire reachable in weeks. Refine against real percentiles later.
  ranks: {
    squire:     { avg: 35, spike: 60, floor: 0,  sustainWeeks: 0 },
    specialist: { avg: 50, spike: 80, floor: 0,  sustainWeeks: 0 },
    knight:     { avg: 70, floor: 62, sustainWeeks: 2, noPierce: true },
    king:       { avg: 85, floor: 80, sustainWeeks: 8, noPierce: true }
  },

  // Caste classifiers (already real in leaderboard.js — drive off authoritative axes).
  castes: {
    berserker: (s) => s.strength >= 78 && s.recovery <= 45 && s.consistency <= 60,
    ranger:    (s) => s.cardio >= 68 && s.cardio >= s.strength + 10,
    mage:      (s) => s.nutrition >= 70 && s.progress >= 58 && s.strength < 58
  },

  // Plausibility timer. DESIGN.
  plausibility: {
    voidBelowFractionOfProjected: 0.40,   // finished < 40% of projected duration -> void
    lateSubmissionGraceHours: 24          // forgot-to-submit still counts within this window
  },

  // ---------------------------------------------------------------------------
  // AGENT-ADDED (Task 3, per the Work Order rule: "if the engine needs a value
  // not present, add it to this file with a confidence tag rather than inlining
  // it"). None of the values above were modified.
  // ---------------------------------------------------------------------------
  engineExtras: {
    // DESIGN(agent): score dock applied when consecutiveTrainingDays >=
    // recovery.punishGrindAfterDaysStraight (no rest day in a week).
    grindPenaltyFraction: 0.20,
    // DESIGN(agent): wake-time regularity mapping — standard deviation of wake
    // times <= fullCreditStdMinutes earns 100, fading to 0 at zeroCreditStdMinutes.
    // Inspired by Sleep Regularity Index banding; tune freely.
    regularity: { fullCreditStdMinutes: 60, zeroCreditStdMinutes: 180 },
    // DESIGN(agent): sleep-duration falloff outside the recommended band —
    // zero credit at (band floor x floorZeroFraction) and (band ceiling x
    // ceilingZeroFactor); linear in between.
    sleep: { floorZeroFraction: 0.5, ceilingZeroFactor: 2 },
    // Task 7 integrity thresholds.
    integrity: {
      kcalPerLbBodyFat: 3500,            // HIGH(agent): canonical energy density of body mass
      calorieMismatchKcal: 1000,         // DESIGN(agent): reported-vs-implied balance gap that flags junk logging
      maxTrustedGpsAccuracyMeters: 150,  // DESIGN(agent): worse GPS accuracy than this is treated as spoof-suspect
      rateLimit: { windowMinutes: 5, maxWrites: 30 } // DESIGN(agent): per-user, per-endpoint write throttle
    }
  }
};
