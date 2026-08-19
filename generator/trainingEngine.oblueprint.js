const fs = require('fs');
const path = require('path');
const {
  getPriorityMuscleTargets,
  normalizeMuscleLabel,
  normalizeMuscleLabels,
  normalizeEquipmentLabel
} = require('../core/exerciseLabelNormalization');
const {
  DEBUG_COMBO_LABEL,
  evaluateGlutesLegsCoreDebugCombo,
  matchesGlutesLegsCoreDebugCombo
} = require('../js/training-debug-combo');
const powerbuildingPriority = require('./powerbuildingPriority.oblueprint');
const militaryHybrid = require('./militaryHybrid.oblueprint');
const PROGRESSION_SCHEMES = require('./progressionSchemes');
const { buildConditioningPlan } = require('./cardioPrescription');

// Progression style seam (see generator/progressionSchemes.js). Unknown/unset
// style falls back to 'standard', which reproduces pre-seam output byte-for-byte.
function getProgressionScheme(user) {
  const key = String((user && user.progressionStyle) || '').trim();
  return PROGRESSION_SCHEMES[key] || PROGRESSION_SCHEMES.standard;
}
function normalizeProgressionStyle(value) {
  const key = String(value || '').trim();
  return PROGRESSION_SCHEMES[key] ? key : 'standard';
}
// Resolve the rep base for a scheme against an exercise's own rep range.
// 'rangeMin' == today's behavior (bottom of the slot's range).
function resolveSchemeRepBase(scheme, repRange) {
  if (!scheme || scheme.repBase === 'rangeMin' || scheme.repBase == null) return repRange.min;
  const n = Number(scheme.repBase);
  return Number.isFinite(n) ? n : repRange.min;
}
// The compound "main lift" families. Everything else (isolation) — and any
// bodyweight/loaded-bodyweight movement like a pull-up — counts as an accessory,
// which gets the scheme's accessoryRepBase (e.g. base 8 under double_progression).
const MAJOR_LOAD_FAMILIES = new Set([
  'chest_press', 'horizontal_pull', 'vertical_pull', 'shoulder_press',
  'squat_pattern', 'hinge_pattern', 'hip_thrust', 'leg_press'
]);
function isAccessoryProgression(family, progressionMode) {
  if (progressionMode && progressionMode !== 'external_load') return true;
  return !MAJOR_LOAD_FAMILIES.has(String(family || ''));
}
// Rep base honoring the accessory override (accessories keep their own base).
function resolveSchemeRepBaseForExercise(scheme, repRange, family, progressionMode) {
  if (scheme && scheme.accessoryRepBase != null && isAccessoryProgression(family, progressionMode)) {
    const n = Number(scheme.accessoryRepBase);
    if (Number.isFinite(n)) return n;
  }
  return resolveSchemeRepBase(scheme, repRange);
}
// Per-lift load step: scheme.loadStepByFamily[family] ?? _default. Under
// 'standard' the map is only { _default: 5 }, so every family resolves to 5 —
// byte-for-byte with the old flat REP_LADDER_LOAD_STEP_LB.
function resolveSchemeLoadStep(scheme, family) {
  const map = (scheme && scheme.loadStepByFamily) || {};
  const perFamily = map[String(family || '')];
  const step = perFamily != null ? perFamily : map._default;
  const n = Number(step);
  return Number.isFinite(n) ? n : 5;
}

const STYLE_ENUM = new Set(['Compound', 'Isolation', 'Mobility', 'Skill', 'Cardio', 'Power', 'Plyo']);
const PATTERN_ENUM = new Set([
  'HorizontalPush',
  'VerticalPush',
  'HorizontalPull',
  'VerticalPull',
  'Squat',
  'Hinge',
  'Lunge',
  'Carry',
  'CoreFlexion',
  'CoreStability',
  'CoreRotation',
  'Isolation',
  'Mobility',
  'Power',
  'Plyo',
  'Cardio'
]);
const WEEKDAY_DEFAULT_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const HOME_DEFAULTS = ['bodyweight', 'dumbbell'];
const GYM_DEFAULTS = ['bodyweight', 'barbell', 'dumbbell', 'machine', 'cable'];
const MUSCLE_KEYS = ['Chest', 'Back', 'Quads', 'Hamstrings/Glutes', 'Shoulders', 'Arms', 'Abs', 'Calves', 'Forearms', 'Neck', 'Legs', 'Glutes', 'Core'];
const LARGE_MUSCLES = new Set(['Chest', 'Back', 'Legs', 'Glutes']);
const SMALL_MUSCLES = new Set(['Shoulders', 'Arms', 'Core', 'Abs', 'Calves', 'Forearms', 'Neck']);
const BODYBUILDING_MAX_SETS_PER_EXERCISE = 4;
const PRIORITY_SET_BONUS = {
  Chest: 4,
  Back: 4,
  Glutes: 4,
  Shoulders: 4,
  Arms: 4,
  Core: 3,
  Calves: 3
};
const DIRECT_TARGET_KEYS = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps', 'Calves', 'Abs'];
const DIRECT_TARGET_RANGES = {
  Chest: { normal: [8, 10], priority: [12, 16], size: 'large' },
  Back: { normal: [10, 12], priority: [14, 18], size: 'large' },
  Shoulders: { normal: [8, 10], priority: [14, 18], size: 'small' },
  Quads: { normal: [8, 10], priority: [12, 16], size: 'large' },
  Hamstrings: { normal: [8, 10], priority: [12, 16], size: 'large' },
  Glutes: { normal: [8, 10], priority: [12, 16], size: 'large' },
  Biceps: { normal: [4, 6], priority: [8, 12], size: 'small' },
  Triceps: { normal: [4, 6], priority: [8, 12], size: 'small' },
  Calves: { normal: [4, 6], priority: [8, 12], size: 'small' },
  Abs: { normal: [4, 6], priority: [8, 12], size: 'small' }
};
const PRIORITY_ORDER_MULTIPLIER = { 1: 1.35, 2: 1.2, 3: 1.1 };
const PRIORITY_ORDER_BAND_OFFSET = { 1: 1, 2: 0, 3: -1 };
const DIRECT_TARGET_CAPS = {
  large: { normal: 18, priority: 20 },
  small: { normal: 12, priority: 14 }
};
const ALWAYS_AVOID_TOKENS = [
  'chain', 'chains',
  'kneeling squat',
  'one arm floor press',
  'one-arm floor press',
  'floor press',
  'floor',
  'lying',
  'prone',
  'supine',
  'board press',
  'anti-gravity press',
  'powerlifting',
  'good morning',
  'pistol squat',
  'overhead squat',
  'frankenstein squat',
  'axle',
  'log',
  'yoke',
  'stone',
  'farmers',
  'sandbag',
  'landmine linear jammer',
  'with a twist',
  'side to side',
  'rocky',
  'behind the neck',
  'behind neck',
  'competition',
  'technique',
  'neck press',
  'speed box squat',
  'speed squat',
  'dynamic effort',
  'tempo',
  'paused',
  'pause',
  'deadlift (single)',
  'single deadlift',
  'one arm lat pulldown',
  'one-arm lat pulldown',
  'single-arm lat pulldown',
  'one-arm shoulder press',
  'single-arm shoulder press',
  'one leg barbell squat',
  'single leg barbell squat',
  'squat with plate movers',
  'calf raise on a dumbbell',
  'bosu',
  'balance board',
  'rear delt row',
  'gironda',
  'sternum chin',
  'band', 'bands',
  'mini band',
  'resistance band'
];
const HARD_BANNED_NAME_PATTERNS = [
  /\bchains?\b/,
  /\bkneeling\s*squat\b/,
  /\bone[-\s]?arm\s*floor\s*press\b/,
  /\bpin\s*press(es)?\b/,
  /\bfloor\s*press\b/,
  /\bfloor\b/,
  /\blying\b/,
  /\bprone\b/,
  /\bsupine\b/,
  /\bboard\s*press\b/,
  /\banti[-\s]?gravity\s*press\b/,
  /\bpowerlifting\b/,
  /\bcompetition\b/,
  /\btechnique\b/,
  /\bneck\s*press\b/,
  /\bspeed\b/,
  /\bdynamic\s*effort\b/,
  /\btempo\b/,
  /\bpaused?\b/,
  /\bgood\s*morning\b/,
  /\boverhead\s*squat\b/,
  /\bpistol\s*squat\b/,
  /\bfrankenstein\b/,
  /\baxle\b/,
  /\blog\b/,
  /\byoke\b/,
  /\bstone\b/,
  /\bfarmers?\b/,
  /\bsandbag\b/,
  /\bjammer\b/,
  /\bdeadlift\b.*\bsingle\b/,
  /\bsingle\b.*\bdeadlift\b/,
  /\bkneeling\b(?!.*\b(crunch|ab|core|rollout)\b)/,
  /\bone[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/,
  /\bsingle[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/,
  /\bone[-\s]*arm\b.*\bpull[\s-]*down\b/,
  /\bsingle[-\s]*arm\b.*\bpull[\s-]*down\b/,
  /\bone[-\s]*arm\b.*\bshoulder\s*press\b/,
  /\bsingle[-\s]*arm\b.*\bshoulder\s*press\b/,
  /\bone[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/,
  /\bsingle[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/,
  /\bsquat\s*with\s*plate\s*movers\b/,
  /\bcalf\s*raise\s*on\s*a\s*dumbbell\b/,
  /\bbosu\b/,
  /\bbalance\s*board\b/,
  /^(?!.*\b(lying|seated)\b).*\bhamstring\s*curls?\b/i,
  /^(?!.*\b(lying|seated)\b).*\bleg\s*curls?\b/i,
  /\b(bench|press|curl|extension|squat|deadlift|row)\b.*\bto\b.*\b(bench|press|curl|extension|squat|deadlift|row)\b/,
  /\bwith\s*a\s*twist\b/,
  /\bside[\s-]*to[\s-]*side\b/,
  /\brocky\b/,
  /\bbehind(?:[\s-]*the)?[\s-]*neck\b/,
  /\brear\s*delt\s*row\b/,
  /\bgironda\b/,
  /\bsternum\s*chin\b/,
  /\bmini\s*band\b/,
  /\bresistance\s*band\b/,
  /\bbanded\b/
];

const NOVELTY_NAME_PATTERNS = [
  /\bfrankenstein\b/,
  /\brocky\b/,
  /\bjammer\b/,
  /\bwith\s*a\s*twist\b/,
  /\bside[\s-]*to[\s-]*side\b/,
  /\baround\s*the\s*world\b/,
  /\bodd\b/,
  /\bspecial\b/,
  /\bwindmill\b/,
  /\bpin\s*press(es)?\b/,
  /\bbehind(?:[\s-]*the)?[\s-]*neck\b/
];

const STAPLE_PATTERN_RULES = {
  HorizontalPush: {
    include: [/\bbench\b/, /\bpress\b/, /\bchest\s*press\b/, /\bincline\s*press\b/, /\bdecline\s*press\b/],
    exclude: [/\bfly\b/, /\bcrossover\b/, /\bpec\s*deck\b/, /\bto\b/, /\bjammer\b/, /\bclose[-\s]*grip\b/, /\bjm\s*press\b/, /\bone[-\s]*arm\b/, /\bsingle[-\s]*arm\b/, /\bkneeling\b/]
  },
  VerticalPush: {
    include: [/\boverhead\s*press\b/, /\bshoulder\s*press\b/, /\bmilitary\s*press\b/],
    exclude: [/\bbehind[\s-]*neck\b/, /\bjammer\b/, /\bone[-\s]*arm\b/, /\bsingle[-\s]*arm\b/]
  },
  HorizontalPull: {
    include: [/\brow\b/, /\bchest[\s-]*supported\s*row\b/, /\bcable\s*row\b/, /\bmachine\s*row\b/, /\bt[\s-]*bar\s*row\b/, /\bseal\s*row\b/],
    exclude: [/\brear\s*delt\s*row\b/, /\bkneeling\b/]
  },
  VerticalPull: {
    include: [/\bpull[\s-]*down\b/, /\bpulldown\b/, /\blat\s*pull[\s-]*down\b/, /\bchin[\s-]*up\b/, /\bpull[\s-]*up\b/],
    exclude: [/\bside[\s-]*to[\s-]*side\b/, /\brocky\b/, /\bgironda\b/, /\bsternum\b/, /\bkneeling\b/, /\bone[-\s]*arm\b/, /\bsingle[-\s]*arm\b/]
  },
  Squat: {
    include: [/\bhack\s*squat\b/, /\bleg\s*press\b/, /\bsquat\b/],
    exclude: [/\bfrankenstein\b/, /\bkneeling\b/, /\boverhead\b/, /\bsissy\b/]
  },
  Hinge: {
    include: [/\bdeadlift\b/, /\bromanian\b/, /\brdl\b/, /\bhip\s*thrust\b/, /\bglute\s*bridge\b/],
    exclude: [/\baxle\b/, /\blog\b/, /\byoke\b/, /\bstone\b/, /\bsandbag\b/]
  },
  Lunge: {
    include: [/\blunge\b/, /\bsplit\s*squat\b/, /\bstep[\s-]*up\b/],
    exclude: [/\bside\s*lunge\b/, /\blateral\s*lunge\b/]
  }
};

const CALISTHENICS_NAME_PATTERNS = [
  /\bpush[\s-]*ups?\b/,
  /\bpull[\s-]*ups?\b/,
  /\bchin[\s-]*ups?\b/,
  /\bmuscle[\s-]*ups?\b/,
  /\binverted\s*row\b/,
  /\bbodyweight\s*row\b/,
  /\bburpees?\b/,
  /\bmountain\s*climbers?\b/,
  /\bbear\s*crawl\b/,
  /\binchworm\b/,
  /\bhandstand\b/,
  /\bhuman\s*flag\b/,
  /\bdragon\s*flag\b/,
  /\bl[\s-]*sit\b/,
  /\bv[\s-]*sit\b/,
  /\bhollow\s*hold\b/,
  /\bplanks?\b/,
  /\btoes?\s*to\s*bar\b/,
  /\bsit[\s-]*ups?\b/
];

const EXPERIENCE_CANONICAL = ['<6m', '6-24m', '2-5y', '5y+'];
const EXP_CFG = {
  '<6m': { large: 10, small: 6, maintenance: 0.7, add: 2, maxLarge: 14, maxSmall: 10, maxDifficulty: 3, diffTarget: 2 },
  '6-24m': { large: 14, small: 8, maintenance: 0.65, add: 4, maxLarge: 18, maxSmall: 12, maxDifficulty: 4, diffTarget: 3 },
  '2-5y': { large: 18, small: 10, maintenance: 0.6, add: 6, maxLarge: 22, maxSmall: 14, maxDifficulty: 5, diffTarget: 4 },
  '5y+': { large: 22, small: 12, maintenance: 0.55, add: 8, maxLarge: 26, maxSmall: 16, maxDifficulty: 5, diffTarget: 4 }
};
/* STRESS_MULT is gone. It was computed, threaded through four function
   signatures and written to plan.meta.stressMultiplier, and it multiplied
   nothing — every plan was scaled by 1.0 regardless of the value stored.

   Deleted rather than applied, deliberately. Stress already reaches volume
   through deriveUserProfile: recovery = sleepHours >= 7 && stress !== High,
   which shifts every target via the +-0.08 recovery term in chooseTargetInRange.
   Applying a second 0.85 scalar on top would double-count it and push several
   muscles under their landmark band minimums, which the volume model is not
   allowed to do. A graded, per-axis recovery budget replaces this properly in
   phase 3. */
const SESSION_CAP = { '30': 4, '45': 5, '60': 6, '75+': 7 };
const DISTRO = {
  1: [1.0],
  2: [0.6, 0.4],
  3: [0.4, 0.3, 0.3],
  4: [0.3, 0.25, 0.25, 0.2]
};
const AVOID_MAP = {
  'flat bench': ['bench press'],
  'overhead press': ['overhead press', 'shoulder press', 'military press', 'push press'],
  dips: ['dip'],
  'barbell hinge': ['deadlift', 'romanian', 'stiff', 'rack pull'],
  'deep squat': ['squat']
};
const INJURY_JOINT_MAP = { Back: 'spine', Knee: 'knee', Hip: 'hip', Shoulder: 'shoulder', Elbow: 'elbow', Ankle: 'ankle' };

let EXERCISE_CACHE = null;
let PREPROCESSED_CACHE = null;
const OBLUEPRINT_PROFILE_TIMING = process.env.OBLUEPRINT_PROFILE_TIMING === '1';
const MAX_CONSTRAINED_REBUILD_ATTEMPTS = 2;
const MAX_REPLACEMENT_ATTEMPTS_PER_DAY = 24;
const MAX_FINAL_POLISH_PASSES = 2;
const LOWER_BODY_LOOP_GUARD_LIMITS = {
  priorityRepair: 24,
  lowerDayConstruction: 24,
  wideSessionFill: 18,
  glutePriority: 10,
  lowerCoachCleanup: 10,
  assembledLower: 10,
  hipCluster: 10,
  lowerFatigue: 10,
  routeRepair: 10
};

function plannerNowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function createPlannerRuntime(opts = {}) {
  return {
    profileTiming: Boolean(opts?.profileTiming || OBLUEPRINT_PROFILE_TIMING),
    heartbeat: typeof opts?.heartbeat === 'function' ? opts.heartbeat : null,
    timings: Object.create(null),
    counters: Object.create(null),
    caches: {
      exerciseTruth: new Map(),
      qualityReplacementPools: new Map(),
      baseEligibleByDayType: new Map()
    },
    state: {
      constrainedRebuildAttempts: 0,
      replacementAttemptsByDay: new Map(),
      lowerBodyLoopCounts: new Map(),
      comboStageStarts: new Map(),
      comboStartedAt: plannerNowMs(),
      builderBudgetStartedAt: plannerNowMs(),
      lowerBodyDegradeApplied: false,
      lowerBodyDegradeReason: '',
      selectedSplit: [],
      currentStage: '',
      lastAttemptedRepair: '',
      missingRequirement: '',
      lastBuilderStage: '',
      lastRepairOrPolishFunction: '',
      lastKnownWeek: null,
      lastKnownDay: '',
      lastKnownDayType: '',
      weeklyTargets: null,
      calfTargetSets: null,
      calfExposureByWeek: []
    }
  };
}

function withPlannerTiming(user, key, fn) {
  const runtime = user?._plannerRuntime || null;
  if (!runtime?.profileTiming) return fn();
  const start = plannerNowMs();
  try {
    return fn();
  } finally {
    runtime.timings[key] = Number(runtime.timings[key] || 0) + (plannerNowMs() - start);
  }
}

function recordPlannerCount(user, key, delta = 1) {
  const runtime = user?._plannerRuntime || null;
  if (!runtime) return;
  runtime.counters[key] = Number(runtime.counters[key] || 0) + Number(delta || 0);
}

function snapshotPlannerRuntime(user) {
  const runtime = user?._plannerRuntime || null;
  if (!runtime) return null;
  const timings = Object.fromEntries(
    Object.entries(runtime.timings).map(([key, value]) => [key, Math.round(Number(value || 0) * 100) / 100])
  );
  return {
    timings,
    counters: { ...runtime.counters }
  };
}

function shouldTrackCalvesComboDiagnostics(user) {
  return hasPriorityGroup(user, 'Calves');
}

function buildCalvesExposureSnapshot(weeks, user) {
  const safeWeeks = Array.isArray(weeks) ? weeks : [];
  return safeWeeks.map((week, weekIndex) => {
    const days = (Array.isArray(week?.days) ? week.days : []).map((day, dayIndex) => {
      const exposures = (Array.isArray(day?.exercises) ? day.exercises : [])
        .filter((exercise) => {
          const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
          return Boolean(truth?.directCalf);
        })
        .map((exercise) => ({
          name: String(exercise?.name || '').trim() || null,
          sets: Math.max(0, Number(exercise?.sets || 0))
        }));
      return {
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null,
        calfExerciseCount: exposures.length,
        calfExercises: exposures
      };
    }).filter((day) => day.calfExerciseCount > 0);
    return {
      weekIndex: Number(week?.weekIndex ?? weekIndex),
      calfDays: days.length,
      calfSets: days.reduce((sum, day) => sum + day.calfExercises.reduce((inner, exercise) => inner + Number(exercise?.sets || 0), 0), 0),
      days
    };
  });
}

function emitPlannerDiagnosticHeartbeat(user, stage, payload = {}) {
  const runtime = user?._plannerRuntime || null;
  const state = runtime?.state || null;
  if (state) {
    state.lastBuilderStage = String(stage || state.lastBuilderStage || '').trim();
    if (payload?.lastRepairOrPolishFunction) state.lastRepairOrPolishFunction = String(payload.lastRepairOrPolishFunction || '').trim();
    if (Number.isFinite(Number(payload?.lastKnownWeek))) state.lastKnownWeek = Number(payload.lastKnownWeek);
    if (payload?.lastKnownDay) state.lastKnownDay = String(payload.lastKnownDay || '').trim();
    if (payload?.lastKnownDayType) state.lastKnownDayType = String(payload.lastKnownDayType || '').trim();
    if (Array.isArray(payload?.selectedSplit)) state.selectedSplit = payload.selectedSplit;
    if (payload?.weeklyTargets && typeof payload.weeklyTargets === 'object') state.weeklyTargets = payload.weeklyTargets;
    if (Number.isFinite(Number(payload?.calfTargetSets))) state.calfTargetSets = Number(payload.calfTargetSets);
    if (Array.isArray(payload?.calfExposureByWeek)) state.calfExposureByWeek = payload.calfExposureByWeek;
  }
  const heartbeat = runtime?.heartbeat;
  if (typeof heartbeat !== 'function') return;
  heartbeat(String(stage || '').trim() || 'builder', {
    ...payload,
    failedCombo: Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [],
    priorityGroups: Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [],
    lastBuilderStage: state?.lastBuilderStage || String(stage || '').trim() || 'builder',
    lastRepairOrPolishFunction: state?.lastRepairOrPolishFunction || payload?.lastRepairOrPolishFunction || '',
    lastKnownWeek: Number.isFinite(Number(state?.lastKnownWeek)) ? Number(state.lastKnownWeek) : payload?.lastKnownWeek,
    lastKnownDay: state?.lastKnownDay || payload?.lastKnownDay || '',
    lastKnownDayType: state?.lastKnownDayType || payload?.lastKnownDayType || '',
    selectedSplit: Array.isArray(state?.selectedSplit) ? state.selectedSplit.slice() : [],
    weeklyTargets: state?.weeklyTargets || payload?.weeklyTargets || null,
    calfTargetSets: Number.isFinite(Number(state?.calfTargetSets)) ? Number(state.calfTargetSets) : payload?.calfTargetSets,
    calfExposureByWeek: Array.isArray(state?.calfExposureByWeek) ? state.calfExposureByWeek : (Array.isArray(payload?.calfExposureByWeek) ? payload.calfExposureByWeek : [])
  });
}

function dayExerciseSignature(day) {
  return (Array.isArray(day?.exercises) ? day.exercises : [])
    .map((exercise) => String(exercise?.canonicalExerciseId || exercise?.name || ''))
    .join('|');
}

function replacementSlotSignature(slot) {
  return [
    String(slot?.id || ''),
    String(slot?.pattern || ''),
    String(slot?.styleRequired || ''),
    String(slot?.muscleTarget || ''),
    Array.isArray(slot?.primaryAllowed) ? slot.primaryAllowed.join(',') : '',
    Array.isArray(slot?.subPreferred) ? slot.subPreferred.join(',') : '',
    Array.isArray(slot?.subFallback) ? slot.subFallback.join(',') : ''
  ].join('|');
}

/* Plan generation is deterministic in planSeed and nothing else, so an unseeded
   build is unreproducible by construction. Under the test runner that silently
   turns any suite that forgets to pin a seed into a flaky test that passes until
   it doesn't. Pin the default there; production keeps a fresh random seed so two
   users with identical answers do not get identical plans. */
const TEST_PLAN_SEED = 424242;

function inTestContext() {
  return process.env.NODE_ENV === 'test'
    || process.env.RISEFORIT_TEST_SEED === '1'
    || typeof process.env.NODE_TEST_CONTEXT === 'string';
}

function buildPlanSeed() {
  if (inTestContext()) return TEST_PLAN_SEED;
  return Math.floor(Math.random() * 1_000_000_000) ^ Date.now();
}

function hashString(value) {
  const s = String(value || '');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function invalidInput(field, reason) {
  return { error: 'INVALID_INPUT', field, reason };
}

function coreSubroleForExercise(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const name = normalizeName(exercise?.name);
  if (truth?.coreFamily === 'flexion') {
    if (/(cable reverse crunch|reverse crunch)/.test(name)) return 'reverse_crunch_lower_abs';
    if (/(3\/4 sit-up|3\/4 sit up|decline sit-up|decline sit up|sit-up|sit up)/.test(name)) return 'situp_variation';
    if (/(ab crunch machine|rope crunch|cable crunch|standing rope crunch|cable seated crunch|\bcrunch\b)/.test(name)) return 'upper_abs_crunch';
    return 'other_core_flexion';
  }
  if (truth?.coreFamily === 'rotation' || truth?.coreFamily === 'stability') {
    if (/(pallof hold|pallof press)/.test(name)) return 'anti_rotation_stability';
    if (/(seated barbell twist|cable oblique crunch|russian twist)/.test(name)) return 'rotation_oblique';
  }
  return '';
}

function snapshotCoreDiagnosticExercise(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  return {
    name: String(exercise?.displayName || exercise?.name || '').trim(),
    pattern: String(exercise?.pattern || '').trim() || null,
    style: String(exercise?.style || '').trim() || null,
    primary: String(exercise?.primary || '').trim() || null,
    directAb: Boolean(truth?.directAb),
    coreFamily: String(truth?.coreFamily || 'none'),
    coreSubrole: coreSubroleForExercise(exercise, user) || null
  };
}

function bucketCountLabel(count) {
  const n = Number(count || 0);
  if (n <= 0) return '0';
  if (n === 1) return '1';
  if (n === 2) return '2';
  return '3+';
}

function countDirectCoreExercises(list, user = null) {
  return (Array.isArray(list) ? list : []).filter((exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    return Boolean(truth?.directAb);
  }).length;
}

function requiredCorePresenceForSlot(slot, dayType = '', currentDayExercises = []) {
  const slotId = String(slot?.id || '');
  const normalizedDayType = String(dayType || '');
  if (/_abs_exact_2$/i.test(slotId)) return 2;
  if (slotId.includes('_core_priority')) {
    if (['FullBodyB', 'Legs', 'UpperFocus', 'Upper', 'Lower', 'Push'].includes(normalizedDayType)) return 2;
    return Math.max(1, countDirectCoreExercises(currentDayExercises));
  }
  return 1;
}

function isCoreSlotAlreadySatisfied(slot, dayType = '', currentDayExercises = [], user = null) {
  if (String(slot?.muscleTarget || '') !== 'Core') return false;
  const currentCount = countDirectCoreExercises(currentDayExercises, user);
  return currentCount >= requiredCorePresenceForSlot(slot, dayType, currentDayExercises);
}

function buildSlotEligibilityDiagnostic(slot, exercises, user, weekPicked, dayState = null, dayType = '', weekState = null) {
  const sourceExercises = getBaseEligibleExercises(exercises, user, dayType);
  const blocked = {
    weekRepeat: 0,
    stapleMismatch: 0,
    patternMismatch: 0,
    styleMismatch: 0,
    muscleMismatch: 0,
    duplicateName: 0,
    duplicateFamily: 0,
    weeklyCoreDiversityCap: 0,
    otherDayCap: 0
  };
  const preDayCap = [];
  const eligible = [];
  for (const ex of sourceExercises) {
    const corePattern = ['CoreFlexion', 'CoreStability', 'CoreRotation'].includes(String(ex?.pattern || ''));
    const lowerPriorityRepeat = ['Legs', 'Glutes'].includes(String(slot?.muscleTarget || ''))
      && (hasPriorityGroup(user, 'Quads') || hasPriorityGroup(user, 'Hamstrings/Glutes'))
      && ['Squat', 'Hinge', 'Lunge', 'Isolation'].includes(String(ex?.pattern || ''));
    const lowFreqSmallPriorityRepeat = Number(user?.daysPerWeek || 0) <= 3
      && (
        (hasPriorityGroup(user, 'Calves') && String(slot?.muscleTarget || '') === 'Calves')
        || (hasPriorityGroup(user, 'Abs') && String(slot?.muscleTarget || '') === 'Core')
      );
    if (weekPicked.has(ex.name) && !user?.profile?.allowWeeklyRepeat && !corePattern && !lowerPriorityRepeat && !lowFreqSmallPriorityRepeat) {
      blocked.weekRepeat += 1;
      continue;
    }
    if (!isBodybuildingStapleForSlot(ex, slot, user, dayType)) {
      blocked.stapleMismatch += 1;
      continue;
    }
    if (ex.pattern !== slot.pattern) {
      blocked.patternMismatch += 1;
      continue;
    }
    if (slot.styleRequired && ex.style !== slot.styleRequired) {
      blocked.styleMismatch += 1;
      continue;
    }
    if (!slotMatchesExerciseMuscles(slot, ex, user)) {
      blocked.muscleMismatch += 1;
      continue;
    }
    if (!slot.styleRequired && ['Mobility', 'Cardio'].includes(ex.style) && !['Mobility', 'Cardio'].includes(slot.pattern)) {
      blocked.otherDayCap += 1;
      continue;
    }
    preDayCap.push(ex);
    if (dayState?.names?.has(ex.name)) {
      blocked.duplicateName += 1;
      continue;
    }
    const family = slotExerciseFamily(ex);
    if (dayState && family === 'lunge' && dayState.families.has('lunge')) {
      blocked.otherDayCap += 1;
      continue;
    }
    if (dayState && String(slot.styleRequired || '') === 'Isolation') {
      const fam = family;
      if (fam) {
        if (dayState.families.has(fam)) {
          blocked.duplicateFamily += 1;
          continue;
        }
        if (fam.startsWith('core_') && weekState && user?.profile?.coreDiversityNeed >= 3) {
          const seen = weekState.coreFamilies || new Map();
          const count = Number(seen.get(fam) || 0);
          if (count >= 2) {
            blocked.weeklyCoreDiversityCap += 1;
            continue;
          }
        }
        if (fam === 'rear_delt' && weekState) {
          if (!weekState.priorityGroups?.has('Shoulders') && !['Pull', 'DeltsArms'].includes(String(dayType || ''))) {
            blocked.otherDayCap += 1;
            continue;
          }
          const maxRearDeltDays = weekState.priorityGroups?.has('Shoulders') ? 3 : 2;
          const dayKey = String(dayState.dayKey || '');
          const alreadyOnDay = weekState.rearDeltDays.has(dayKey);
          if (!alreadyOnDay && weekState.rearDeltDays.size >= maxRearDeltDays) {
            blocked.otherDayCap += 1;
            continue;
          }
        }
        if (fam === 'neck' && weekState && Number(weekState.neckDays || 0) >= 3 && !weekState.neckDayKeys?.has(dayState.dayKey)) {
          blocked.otherDayCap += 1;
          continue;
        }
        if (fam === 'forearm' && weekState && Number(weekState.forearmDays || 0) >= 3 && !weekState.forearmDayKeys?.has(dayState.dayKey)) {
          blocked.otherDayCap += 1;
          continue;
        }
      }
    }
    if (dayState && slot.pattern === 'HorizontalPush' && String(ex?.style || '') === 'Compound') {
      const n = normalizeName(ex?.name);
      if (/\bbench press\b/.test(n) && Number(dayState.counts.bench_press || 0) >= 1) {
        blocked.otherDayCap += 1;
        continue;
      }
    }
    if (weekState && slot.pattern === 'Hinge' && String(ex?.style || '') === 'Compound') {
      if (isHeavyDeadliftPatternName(ex?.name) && Number(weekState.heavyDeadliftCount || 0) >= 1) {
        blocked.otherDayCap += 1;
        continue;
      }
    }
    eligible.push(ex);
  }
  return {
    slotId: String(slot?.id || ''),
    pattern: String(slot?.pattern || ''),
    styleRequired: String(slot?.styleRequired || '') || null,
    muscleTarget: String(slot?.muscleTarget || '') || null,
    preDayCapCount: preDayCap.length,
    eligibleCount: eligible.length,
    blocked,
    samplePreDayCapExercises: preDayCap.slice(0, 5).map((exercise) => snapshotCoreDiagnosticExercise(exercise, user)),
    sampleEligibleExercises: eligible.slice(0, 5).map((exercise) => snapshotCoreDiagnosticExercise(exercise, user))
  };
}

function structuredNoEligible(slot, user, context = {}) {
  const absSelected = hasPriorityGroup(user, 'Abs');
  const currentDayExercises = Array.isArray(context?.currentDayExercises) ? context.currentDayExercises : [];
  const directCoreExercises = currentDayExercises
    .filter((exercise) => Boolean((exercise?.canonicalTruth || buildExerciseTruth(exercise, user))?.directAb))
    .map((exercise) => snapshotCoreDiagnosticExercise(exercise, user));
  return {
    error: 'NO_ELIGIBLE_EXERCISE',
    slotId: slot.id,
    pattern: slot.pattern,
    reason: String(slot?.muscleTarget || '') === 'Core' ? 'no_safe_core_candidate' : null,
    requiredStyle: slot.styleRequired || null,
    muscleTarget: slot.muscleTarget || null,
    allowedEquipment: [...user.allowedEquipment],
    avoidTokens: [...user.avoidNameContainsTokens],
    injuryMap: user.injuryMap,
    selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [],
    priorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : 0,
    dayCount: Number(user?.daysPerWeek || 0) || null,
    week: Number.isFinite(Number(context?.week)) ? Number(context.week) : null,
    weekType: String(context?.weekType || '') || null,
    day: String(context?.day || '') || null,
    dayType: String(context?.dayType || '') || null,
    finalVisibleDayExercises: currentDayExercises.map((exercise) => snapshotCoreDiagnosticExercise(exercise, user)),
    directCoreExercises,
    directCoreExerciseCount: directCoreExercises.length,
    directCoreExerciseCountBucket: bucketCountLabel(directCoreExercises.length),
    directCoreSetCount: null,
    coreMovementFamilySubroles: directCoreExercises.map((exercise) => ({
      name: exercise.name,
      coreFamily: exercise.coreFamily,
      coreSubrole: exercise.coreSubrole
    })),
    absSelected,
    exactTwoAbsRequired: /_abs_exact_2$/i.test(String(slot?.id || '')),
    coreMissingFromInitialBuild: true,
    coreRemovedOrReplacedLater: false,
    safeCoreInsertionOrReplacementExists: false,
    unsafeCoreCandidateExists: Array.isArray(context?.candidateDiagnostics)
      ? context.candidateDiagnostics.some((entry) => Number(entry?.preDayCapCount || 0) > 0)
      : false,
    addingCoreWouldBreakValidation: Array.isArray(context?.candidateDiagnostics)
      ? context.candidateDiagnostics.some((entry) => Number(entry?.preDayCapCount || 0) > 0 && Number(entry?.eligibleCount || 0) < 1)
      : false,
    addingCoreWouldDuplicateNames: Array.isArray(context?.candidateDiagnostics)
      ? context.candidateDiagnostics.some((entry) => Number(entry?.blocked?.duplicateName || 0) > 0)
      : false,
    addingCoreWouldDuplicateFamilies: Array.isArray(context?.candidateDiagnostics)
      ? context.candidateDiagnostics.some((entry) => Number(entry?.blocked?.duplicateFamily || 0) > 0)
      : false,
    candidateDiagnostics: Array.isArray(context?.candidateDiagnostics) ? context.candidateDiagnostics : []
  };
}

function loadExercisesRaw() {
  if (EXERCISE_CACHE) return EXERCISE_CACHE;
  const filePath = path.join(__dirname, '..', 'data', 'exercises.master.js');
  const src = fs.readFileSync(filePath, 'utf8');
  const expr = src.replace(/^\s*export\s+const\s+exercises\s*=\s*/, '').replace(/;\s*$/, '');
  EXERCISE_CACHE = Function(`return (${expr});`)();
  return EXERCISE_CACHE;
}

function normalizeEquipmentTags(list) {
  const map = {
    'smith machine': 'machine',
    smith: 'machine',
    'pull-up bar': 'pullup_bar',
    'pullup bar': 'pullup_bar',
    'body weight': 'bodyweight',
    bands: 'bands',
    cables: 'cable',
    'medicine ball': 'medicineball',
    'stability ball': 'stabilityball',
    sled: 'sled',
    medicineball: 'medicineball',
    stabilityball: 'stabilityball',
    pullup_bar: 'pullup_bar'
  };
  const out = new Set();
  (Array.isArray(list) ? list : []).forEach((entry) => {
    const raw = String(entry || '').trim();
    if (!raw) return;
    const normalized = normalizeEquipmentLabel(raw);
    const token = ({
      bodyweight: 'bodyweight',
      dumbbell: 'dumbbell',
      barbell: 'barbell',
      cable: 'cable',
      machine: 'machine',
      kettlebell: 'kettlebell',
      other: 'other'
    }[normalized]) || map[String(raw || '').trim().toLowerCase()] || String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
    if ([
      'barbell', 'dumbbell', 'cable', 'machine', 'bands', 'bodyweight', 'pullup_bar',
      'kettlebell', 'medicineball', 'stabilityball', 'sled', 'other'
    ].includes(token)) out.add(token);
  });
  return [...out].sort();
}

function normalizeSlotPrimaryAllowed(slot) {
  return normalizeMuscleLabels(Array.isArray(slot?.primaryAllowed) ? slot.primaryAllowed : []);
}

function normalizeExercisePrimaryMuscles(ex) {
  return normalizeMuscleLabels([
    ex?.primary,
    ...(Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles : [])
  ]);
}

function normalizeDbMuscleTarget(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!key) return '';
  if (key === 'chest') return 'chest';
  if (key === 'shoulders' || key === 'shoulder' || key === 'lateral' || key === 'rear') return 'shoulders';
  if (key === 'biceps' || key.startsWith('biceps ')) return 'biceps';
  if (key === 'triceps' || key.startsWith('triceps ')) return 'triceps';
  if (key === 'quads' || key === 'quadriceps') return 'quadriceps';
  if (key === 'hamstrings' || key.startsWith('hamstrings ')) return 'hamstrings';
  if (key === 'glutes') return 'glutes';
  if (key === 'calves' || key.startsWith('calves ')) return 'calves';
  if (key === 'abdominals' || key === 'abs lower' || key === 'abs upper' || key === 'lowerabs' || key === 'tva' || key === 'core') return 'abdominals';
  if (key === 'obliques') return 'obliques';
  if (key === 'lats' || key.startsWith('lats ')) return 'lats';
  if (key === 'middle back' || key === 'mid back' || key === 'upperback' || key === 'upper back') return 'middle back';
  if (key === 'lower back' || key === 'lowerback') return 'lower back';
  if (key === 'traps' || key === 'trapezius') return 'traps';
  return key;
}

function normalizeDbMuscleTargets(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => normalizeDbMuscleTarget(value))
    .filter(Boolean)));
}

function deriveDirectMuscleTargets(rawPrimary, rawSub) {
  const primary = normalizeDbMuscleTarget(rawPrimary);
  const sub = String(rawSub || '').trim();
  const out = [];
  const push = (...values) => {
    values.forEach((value) => {
      const normalized = normalizeDbMuscleTarget(value);
      if (normalized && !out.includes(normalized)) out.push(normalized);
    });
  };

  if (primary === 'arms') {
    if (/^biceps/i.test(sub)) push('biceps');
    else if (/^triceps/i.test(sub)) push('triceps');
  } else if (primary === 'legs') {
    if (/^quads?$/i.test(sub)) push('quadriceps');
    else if (/^hamstrings/i.test(sub)) push('hamstrings');
    else if (/^glutes$/i.test(sub)) push('glutes');
    else if (/^calves/i.test(sub)) push('calves');
  } else if (primary === 'core') {
    if (/^obliques$/i.test(sub)) push('obliques');
    else if (/^(abs|tva)/i.test(sub)) push('abdominals');
  } else if (primary === 'back') {
    if (/^lats/i.test(sub)) push('lats');
    else if (/^upperback$/i.test(sub)) push('middle back', 'traps');
    else if (/^lowerback$/i.test(sub)) push('lower back');
  }

  if (!out.length) push(primary);
  return out;
}

function priorityGroupToDirectTargets(group) {
  switch (String(group || '')) {
    case 'Chest': return ['Chest'];
    case 'Back': return ['Back'];
    case 'Shoulders': return ['Shoulders'];
    case 'Arms': return ['Biceps', 'Triceps'];
    case 'Quads':
    case 'Legs':
      return ['Quads'];
    case 'Hamstrings/Glutes':
    case 'Glutes':
      return ['Hamstrings', 'Glutes'];
    case 'Calves': return ['Calves'];
    case 'Abs':
    case 'Core':
      return ['Abs'];
    default: return [];
  }
}

function canonicalPriorityGroup(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'chest') return 'Chest';
  if (key === 'back') return 'Back';
  if (key === 'shoulders' || key === 'shoulder') return 'Shoulders';
  if (key === 'arms') return 'Arms';
  if (key === 'quads' || key === 'quadriceps' || key === 'legs') return 'Quads';
  if (key === 'hamstrings/glutes' || key === 'hamstrings & glutes' || key === 'hamstrings and glutes' || key === 'glutes') return 'Hamstrings/Glutes';
  if (key === 'abs' || key === 'core') return 'Abs';
  if (key === 'calves' || key === 'calf') return 'Calves';
  if (key === 'forearms') return 'Forearms';
  if (key === 'neck') return 'Neck';
  return '';
}

function getPriorityGroupStructuralAliases(group) {
  switch (canonicalPriorityGroup(group) || String(group || '')) {
    case 'Chest': return ['Chest'];
    case 'Back': return ['Back'];
    case 'Shoulders': return ['Shoulders'];
    case 'Arms': return ['Arms'];
    case 'Quads': return ['Quads', 'Legs'];
    case 'Hamstrings/Glutes': return ['Hamstrings/Glutes', 'Glutes', 'Legs'];
    case 'Abs': return ['Abs', 'Core'];
    case 'Calves': return ['Calves'];
    case 'Forearms': return ['Forearms'];
    case 'Neck': return ['Neck'];
    case 'Legs': return ['Quads', 'Hamstrings/Glutes', 'Legs'];
    case 'Glutes': return ['Hamstrings/Glutes', 'Glutes', 'Legs'];
    case 'Core': return ['Abs', 'Core'];
    default: return [String(group || '')].filter(Boolean);
  }
}

function priorityGroupsOverlap(a, b) {
  const left = new Set(getPriorityGroupStructuralAliases(a));
  return getPriorityGroupStructuralAliases(b).some((alias) => left.has(alias));
}

function hasPriorityGroup(userOrList, target) {
  const priorities = Array.isArray(userOrList) ? userOrList : (Array.isArray(userOrList?.priorityGroups) ? userOrList.priorityGroups : []);
  return priorities.some((entry) => priorityGroupsOverlap(entry, target));
}

function directTargetSize(key) {
  return DIRECT_TARGET_RANGES[key]?.size === 'large' ? 'large' : 'small';
}

function directTargetCap(key, isPriority = false) {
  const size = directTargetSize(key);
  return Number(DIRECT_TARGET_CAPS[size]?.[isPriority ? 'priority' : 'normal'] || (size === 'large' ? 20 : 14));
}

function isSmallPriorityDirectTarget(key) {
  return ['Abs', 'Calves', 'Biceps', 'Triceps'].includes(String(key || ''));
}

function getDirectPriorityRankMap(user) {
  const rankMap = {};
  const ranking = Array.isArray(user?.profile?.priorityRanking) ? user.profile.priorityRanking : (Array.isArray(user?.priorityGroups) ? user.priorityGroups : []);
  ranking.slice(0, 3).forEach((group, index) => {
    const rank = index + 1;
    priorityGroupToDirectTargets(group).forEach((target) => {
      if (!rankMap[target]) rankMap[target] = rank;
    });
  });
  return rankMap;
}

function getPriorityDirectTargets(user) {
  const set = new Set();
  (Array.isArray(user?.priorityGroups) ? user.priorityGroups : []).forEach((group) => {
    priorityGroupToDirectTargets(group).forEach((target) => set.add(target));
  });
  return set;
}

function chooseTargetInRange(rangeMin, rangeMax, user, key, isPriority = false) {
  const profile = user?.profile || deriveUserProfile(user);
  let score = 0.5;
  const dayCount = Number(user?.daysPerWeek || 0);
  if (dayCount >= 6) score += 0.18;
  else if (dayCount >= 5) score += 0.12;
  else if (dayCount <= 3) score -= 0.12;
  if (profile.sessionBandwidth === 'wide') score += 0.1;
  else if (profile.sessionBandwidth === 'tight') score -= 0.12;
  if (profile.recovery === 'good') score += 0.08;
  else score -= 0.04;
  if (user?.experience === '5y+') score += 0.08;
  else if (user?.experience === '2-5y') score += 0.04;
  else if (user?.experience === '<6m') score -= 0.08;
  if (String(user?.phase || '') === 'deficit') score -= 0.08;
  else if (String(user?.phase || '') === 'recomp') score -= 0.04;
  if (user?.activityLevel === 'Very active' && ['Quads', 'Hamstrings', 'Glutes'].includes(String(key || ''))) score -= 0.05;
  if (isPriority) score += 0.04;
  score = Math.max(0, Math.min(1, score));
  return Math.round(rangeMin + ((rangeMax - rangeMin) * score));
}

function resolveDirectFrequencyTarget(key, targetSets, isPriority, user) {
  const dayCount = Number(user?.daysPerWeek || 0);
  if (isPriority) {
    if (isSmallPriorityDirectTarget(key)) {
      if (targetSets >= 12 && dayCount >= 5) return Math.min(4, dayCount);
      if (targetSets >= 8) return Math.min(3, dayCount);
      return Math.min(2, dayCount);
    }
    if (targetSets >= 16 && dayCount >= 5) return Math.min(3, dayCount);
    return Math.min(2, dayCount);
  }
  if (targetSets >= 10 && dayCount >= 4) return 2;
  return 1;
}

function getExerciseDirectTargetKeys(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const direct = Array.isArray(exercise?.directMuscleTargets) ? exercise.directMuscleTargets : getExerciseDirectMuscleTargets(exercise);
  const out = new Set();
  if (direct.includes('chest') || truth.pressRole === 'chest_press' || truth.pressRole === 'mixed') out.add('Chest');
  if (direct.some((value) => ['lats', 'middle back', 'lower back', 'traps'].includes(value)) || truth.pullRole === 'back_builder') out.add('Back');
  if (direct.includes('shoulders') || truth.directDeltSubtype !== 'none' || truth.pressRole === 'shoulder_press') out.add('Shoulders');
  if (direct.includes('quadriceps')) out.add('Quads');
  if (direct.includes('hamstrings')) out.add('Hamstrings');
  if (direct.includes('glutes')) out.add('Glutes');
  if (direct.includes('biceps') || truth.directArmType === 'biceps') out.add('Biceps');
  if (direct.includes('triceps') || truth.directArmType === 'triceps') out.add('Triceps');
  if (direct.includes('calves') || truth.directCalf) out.add('Calves');
  if (direct.includes('abdominals') || direct.includes('obliques') || truth.directAb || truth.coreFamily !== 'none') out.add('Abs');
  return [...out];
}

function getSlotMuscleTargets(slot) {
  const explicit = [];
  const subPreferred = Array.isArray(slot?.subPreferred) ? slot.subPreferred : [];
  subPreferred.forEach((value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    if (raw === 'Quads') explicit.push('quadriceps');
    else if (raw === 'Hamstrings-Curl' || raw === 'Hamstrings-Hinge') explicit.push('hamstrings');
    else if (raw === 'Glutes') explicit.push('glutes');
    else if (raw === 'Calves' || raw === 'Calves-Gastrocnemius' || raw === 'Calves-Soleus') explicit.push('calves');
    else if (raw === 'Abs-Lower' || raw === 'Abs-Upper' || raw === 'TVA') explicit.push('abdominals');
    else if (raw === 'Obliques') explicit.push('obliques');
    else if (raw === 'Biceps-Long' || raw === 'Biceps-Short') explicit.push('biceps');
    else if (raw === 'Triceps-Long' || raw === 'Triceps-Lateral' || raw === 'Triceps-Press' || raw === 'Triceps-Overhead' || raw === 'Triceps-Pushdown') explicit.push('triceps');
    else if (raw === 'Lats-Width' || raw === 'Lats-Thickness') explicit.push('lats');
    else if (raw === 'UpperBack') explicit.push('middle back', 'traps');
  });
  /* This used to `return explicit` here, which turned subPreferred from a
     PREFERENCE into the slot's only acceptable answer. `lower_squat` is
     Squat/Compound/primaryAllowed:['Legs']/subPreferred:['Quads'], so it
     resolved to ['quadriceps'] alone and 'Legs' was discarded — and the
     support-muscle test then required the literal token 'quadriceps', which a
     barbell squat does not carry because quads are its PRIMARY and land in
     directMuscleTargets instead. The slot was unfillable at every equipment
     tier including a full gym: it fell back to a Hinge, and a full-gym Lower
     day came out as Barbell Glute Bridge + Romanian Deadlift + leg curl +
     calves + abs. Two hinges and no quad work at all.

     subPreferred still steers scoring; it no longer excludes. */
  const broad = [];
  (Array.isArray(slot?.primaryAllowed) ? slot.primaryAllowed : []).forEach((value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    if (raw === 'Chest') broad.push(...getPriorityMuscleTargets('Chest'));
    else if (raw === 'Back') broad.push(...getPriorityMuscleTargets('Back'));
    else if (raw === 'Shoulders') broad.push(...getPriorityMuscleTargets('Shoulders'));
    else if (raw === 'Arms') broad.push(...getPriorityMuscleTargets('Arms'));
    else if (raw === 'Calves') broad.push(...getPriorityMuscleTargets('Calves'));
    else if (raw === 'Core') broad.push(...getPriorityMuscleTargets('Abs'));
    else if (raw === 'Glutes') broad.push(...getPriorityMuscleTargets('Hamstrings/Glutes'));
    else if (raw === 'Legs') broad.push('quadriceps', 'hamstrings', 'glutes');
  });
  return Array.from(new Set([...explicit, ...broad]));
}

function getExerciseMuscleTargets(ex) {
  if (Array.isArray(ex?.dbMuscleTargets) && ex.dbMuscleTargets.length) return ex.dbMuscleTargets;
  return normalizeDbMuscleTargets([
    ex?.rawPrimary || ex?.primary,
    ...(Array.isArray(ex?.rawSecondaryMuscles) ? ex.rawSecondaryMuscles : []),
    ...(Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles : [])
  ]);
}

function getExerciseDirectMuscleTargets(ex) {
  if (Array.isArray(ex?.directMuscleTargets) && ex.directMuscleTargets.length) return ex.directMuscleTargets;
  return normalizeDbMuscleTargets([ex?.rawPrimary || ex?.primary]);
}

function getExerciseSupportMuscleTargets(ex) {
  if (Array.isArray(ex?.supportMuscleTargets) && ex.supportMuscleTargets.length) return ex.supportMuscleTargets;
  return normalizeDbMuscleTargets([
    ex?.rawPrimary || ex?.primary,
    ...(Array.isArray(ex?.rawSecondaryMuscles) ? ex.rawSecondaryMuscles : []),
    ...(Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles : [])
  ]);
}

function slotMatchesExerciseDirectMuscle(slot, ex) {
  const exactTargets = getSlotMuscleTargets(slot);
  if (exactTargets.length) {
    const exerciseTargets = getExerciseDirectMuscleTargets(ex);
    return exerciseTargets.some((muscle) => exactTargets.includes(muscle));
  }
  const allowed = normalizeSlotPrimaryAllowed(slot);
  if (!allowed.length) return true;
  const exerciseMuscles = normalizeMuscleLabels([ex?.primary]);
  return exerciseMuscles.some((muscle) => allowed.includes(muscle));
}

function slotMatchesExerciseSupportMuscle(slot, ex) {
  const exactTargets = getSlotMuscleTargets(slot);
  if (exactTargets.length) {
    const exerciseTargets = getExerciseSupportMuscleTargets(ex);
    return exerciseTargets.some((muscle) => exactTargets.includes(muscle));
  }
  const allowed = normalizeSlotPrimaryAllowed(slot);
  if (!allowed.length) return true;
  const exerciseMuscles = normalizeExercisePrimaryMuscles(ex);
  return exerciseMuscles.some((muscle) => allowed.includes(muscle));
}

function slotRequiresDirectMuscleMatch(slot, user = null) {
  const isIsolation = String(slot?.styleRequired || '') === 'Isolation';
  const slotId = String(slot?.id || '');
  const isPrioritySlot = slotId.includes('_priority');
  const isRequiredPrioritySlot = Boolean(user && !slot?.optional && hasPriorityGroup(user, String(slot?.muscleTarget || '')));
  return isIsolation || isPrioritySlot || isRequiredPrioritySlot;
}

function slotMatchesExerciseMuscles(slot, ex, user = null) {
  return slotRequiresDirectMuscleMatch(slot, user)
    ? slotMatchesExerciseDirectMuscle(slot, ex)
    : slotMatchesExerciseSupportMuscle(slot, ex);
}

function normalizeName(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHardBannedExercise(ex) {
  const name = normalizeName(ex?.name);
  if (!name) return false;
  if (HARD_BANNED_NAME_PATTERNS.some((rx) => rx.test(name))) return true;
  if (/\bone arm\b/.test(name) && /\bfloor press\b/.test(name)) return true;
  const equipment = normalizeName(Array.isArray(ex?.equipment) ? ex.equipment.join(' ') : ex?.equipment);
  if (/\bband(s)?\b/.test(equipment)) return true;
  return false;
}

function isCalisthenicsLikeExercise(ex) {
  const name = normalizeName(ex?.name);
  if (!name) return false;
  if (CALISTHENICS_NAME_PATTERNS.some((rx) => rx.test(name))) return true;
  const eqNorm = normalizeEquipmentTags(ex?.equipment || []);
  const bodyOnly = eqNorm.length && eqNorm.every((eq) => eq === 'bodyweight' || eq === 'pullup_bar');
  if (bodyOnly) return true;
  const usesBodyweight = eqNorm.includes('bodyweight') || eqNorm.includes('pullup_bar');
  const noMachineOrCable = !eqNorm.includes('machine') && !eqNorm.includes('cable');
  const dipLike = /\bdips?\b/.test(name);
  const pullLike = /\bpull[\s-]*up\b|\bchin[\s-]*up\b/.test(name);
  if (usesBodyweight && noMachineOrCable && (dipLike || pullLike)) return true;
  return false;
}

function isNoveltyExerciseName(name) {
  const n = normalizeName(name);
  if (!n) return false;
  return NOVELTY_NAME_PATTERNS.some((rx) => rx.test(n));
}

function matchesStaplePatternRule(name, pattern) {
  const n = normalizeName(name);
  const rule = STAPLE_PATTERN_RULES[pattern];
  if (!rule) return true;
  if (Array.isArray(rule.exclude) && rule.exclude.some((rx) => rx.test(n))) return false;
  if (!Array.isArray(rule.include) || !rule.include.length) return true;
  return rule.include.some((rx) => rx.test(n));
}

function slotExerciseFamily(ex) {
  const n = normalizeName(ex?.name);
  if (!n) return null;
  if (/(walking lunge|rear lunge|split squat|bulgarian|skater squat|step up|step-up)/.test(n)) return 'lunge';
  if (/(rear delt|reverse fly|face pull|reverse pec deck)/.test(n)) return 'rear_delt';
  if (/(fly|crossover|pec deck)/.test(n)) return 'chest_fly';
  if (/(lateral raise|side lateral)/.test(n)) return 'lateral_raise';
  if (/(reverse curl|hammer curl|wrist curl|wrist roller|plate pinch|pronation|supination|finger curl|hand squeeze)/.test(n)) return 'forearm';
  if (/(neck resistance|neck flexion|neck extension|neck lateral|head harness)/.test(n)) return 'neck';
  if (/\bcurl\b/.test(n)) return 'curl';
  if (isHeavyTricepsPressName(n)) return 'triceps_press';
  if (isOverheadTricepsExtensionName(n)) return 'triceps_overhead';
  if (isPushdownTricepsName(n)) return 'triceps_pushdown';
  if (/(triceps|extension|pushdown|skull crusher)/.test(n)) return 'triceps_extension';
  if (/(calf raise)/.test(n)) return 'calves';
  if (/(reverse crunch|leg raise|hanging knee|hanging leg|tuck crunch|hip raise|leg pull in)/.test(n)) return 'core_reverse';
  if (/(pallof hold|plank|dead bug|vacuum|anti extension|fallout)/.test(n)) return 'core_stability';
  if (/(wood chop|pallof|twist|rotation|side bend|oblique|reach through)/.test(n)) return 'core_oblique';
  if (/(plank|dead bug|vacuum|anti extension|fallout)/.test(n)) return 'core_stability';
  if (/(crunch|rollout|ab wheel)/.test(n)) return 'core_flexion';
  return null;
}

function normalizeBodybuildingDisplayName(name, user) {
  const raw = String(name || '').trim();
  if (!(user?.discipline === 'bodybuilding' || user?.discipline === 'powerbuilding')) return raw;
  if (!raw) return raw;
  if (user?.discipline === 'powerbuilding') {
    if (/^seated dumbbell inner biceps curl$/i.test(raw)) return 'Dumbbell Curl';
    if (/^flexor incline dumbbell curls?$/i.test(raw)) return 'Incline Dumbbell Curl';
    if (/^high cable curls?$/i.test(raw) || /^overhead cable curls?$/i.test(raw)) return 'Cable Curl';
    if (/^machine preacher curls?$/i.test(raw)) return 'Machine Preacher Curl';
    if (/^cable rope overhead triceps extension$/i.test(raw) || /^dumbbell one arm triceps? extension$/i.test(raw)) return 'Overhead Triceps Extension';
    if (/^triceps pushdown$/i.test(raw)) return 'Triceps Pushdown';
    if (/^cable seated lateral raise$/i.test(raw) || /^seated side lateral raise$/i.test(raw) || /^side lateral raise$/i.test(raw) || /^bent over low-pulley side lateral$/i.test(raw)) return 'Dumbbell Lateral Raise';
    if (/^seated bent-over rear delt raise$/i.test(raw) || /^bent over dumbbell rear delt raise with head on bench$/i.test(raw) || /^reverse flyes(?: with external rotation)?$/i.test(raw)) return 'Rear Delt Raise';
    if (/^cable bench reverse crunch$/i.test(raw)) return 'Reverse Crunch';
    if (/^cable oblique crunch$/i.test(raw)) return 'Cable Crunch';
    if (/^cable pallof hold$/i.test(raw)) return 'Pallof Press';
    if (/^machine bench press$/i.test(raw) || /^leverage chest press$/i.test(raw) || /^leverage incline chest press$/i.test(raw) || /^leverage decline chest press$/i.test(raw)) return 'Machine Chest Press';
    if (/^chest-supported row$/i.test(raw)) return 'Chest-Supported Row';
    if (/^chest-supported dumbbell row$/i.test(raw)) return 'Chest-Supported Row';
    if (/^dumbbell incline row$/i.test(raw)) return 'One-Arm Dumbbell Row';
  }
  if (/^shotgun row$/i.test(raw) && Array.isArray(user?.allowedEquipment) && user.allowedEquipment.includes('cable') && !user.allowedEquipment.includes('dumbbell')) {
    return 'Shotgun Cable Row';
  }
  if (/^chest-supported row$/i.test(raw) && Array.isArray(user?.allowedEquipment) && user.allowedEquipment.includes('machine') && !user.allowedEquipment.includes('dumbbell')) {
    return 'Machine Chest-Supported Row';
  }
  if ((/\bhamstring\s*curls?\b/i.test(raw) || /\bleg\s*curls?\b/i.test(raw)) && !/\b(lying|seated)\b/i.test(raw)) {
    return 'Seated Hamstring Curl';
  }
  if (/^neck\s*press$/i.test(raw)) return 'Bench Press';
  if (/one[-\s]*leg\b.*\bbarbell\b.*\bsquat/i.test(raw) || /single[-\s]*leg\b.*\bbarbell\b.*\bsquat/i.test(raw)) return 'Hack Squat';
  if (/^bench press\s*\(technique\)$/i.test(raw)) return 'Bench Press';
  if (/^speed\s+box\s+squat$/i.test(raw) || /^speed\s+squat$/i.test(raw)) return 'Box Squat';
  if (/^one[-\s]*arm\s+lat\s+pull[\s-]*down$/i.test(raw) || /^single[-\s]*arm\s+lat\s+pull[\s-]*down$/i.test(raw)) return 'Lat Pulldown';
  if (/^bench press\s*\(competition\)$/i.test(raw)) return 'Bench Press';
  if (/deadlift\s*\(single\)/i.test(raw)) return 'Barbell Deadlift';
  if (/^chest-supported row$/i.test(raw) && Array.isArray(user?.allowedEquipment) && user.allowedEquipment.includes('dumbbell') && !user.allowedEquipment.includes('machine') && !user.allowedEquipment.includes('cable')) {
    return 'Chest-Supported Dumbbell Row';
  }
  return raw
    .replace(/\s*\(competition\)\s*/ig, ' ')
    .replace(/\s*\(technique\)\s*/ig, ' ')
    .replace(/\bspeed\b/ig, ' ')
    .replace(/\bdynamic\s*effort\b/ig, ' ')
    .replace(/\btempo\b/ig, ' ')
    .replace(/\bpaused?\b/ig, ' ')
    .replace(/\s*\(single\)\s*/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDirectBicepsName(name) {
  const n = normalizeName(name);
  return /(preacher|hammer curl|incline curl|barbell curl|dumbbell curl|cable curl|\breverse curl\b|\bcurl\b)/.test(n)
    && !/(leg curl|hamstring curl|wrist curl|reverse wrist|palms-down|palms-up)/.test(n);
}

function isHeavyTricepsPressName(name) {
  const n = normalizeName(name);
  return /\b(close[-\s]*grip (barbell )?bench press|close[-\s]*grip bench press|smith machine close[-\s]*grip bench press|jm press|dip machine|dips? - triceps version|weighted bench dip|seated triceps press)\b/.test(n);
}

function isPushdownTricepsName(name) {
  const n = normalizeName(name);
  return /\b(triceps pushdown|triceps pressdown|reverse grip triceps pushdown|pushdown|pressdown)\b/.test(n);
}

function isOverheadTricepsExtensionName(name) {
  const n = normalizeName(name);
  return /\b(overhead triceps|cable rope overhead triceps extension|cable one arm tricep extension|cable one arm triceps extension|dumbbell one arm tricep extension|dumbbell one arm triceps extension|one arm tricep extension|one arm triceps extension|rope overhead triceps extension|overhead.*tricep|overhead.*triceps)\b/.test(n);
}

function tricepsMovementFamily(name) {
  const n = normalizeName(name);
  if (isHeavyTricepsPressName(n)) return 'press';
  if (isOverheadTricepsExtensionName(n)) return 'overhead';
  if (isPushdownTricepsName(n)) return 'pushdown';
  if (isDirectTricepsName(n)) return 'extension';
  return 'none';
}

function isDirectTricepsName(name) {
  const n = normalizeName(name);
  return (
    isHeavyTricepsPressName(n)
    || isPushdownTricepsName(n)
    || isOverheadTricepsExtensionName(n)
    || /(triceps|skull ?crusher|skull crusher|kickback|triceps extension|rope extension|lying extension|tate press|machine triceps extension)/.test(n)
    || (/\bextension\b/.test(n) && /(triceps|rope|cable|dumbbell|ez-bar|barbell|overhead|lying)/.test(n))
  ) && !/(wrist|neck|leg extension|hip extension|back extension|shoulder extension)/.test(n);
}

function canonicalExerciseIdFor(ex) {
  const explicit = String(ex?.id || '').trim();
  if (explicit) return explicit;
  return normalizeName(ex?.name).replace(/\s+/g, '-');
}

function exerciseDayIdentityKey(ex) {
  return normalizeName(ex?.canonicalTruth?.canonicalName || ex?.canonicalName || ex?.name || '');
}

function sameDayExerciseExists(day, candidate, exclude = null) {
  const key = exerciseDayIdentityKey(candidate);
  if (!key) return false;
  return (Array.isArray(day?.exercises) ? day.exercises : []).some((exercise) => exercise !== exclude && exerciseDayIdentityKey(exercise) === key);
}

function tricepsFamiliesOnDay(day, exclude = null) {
  const families = new Set();
  for (const exercise of Array.isArray(day?.exercises) ? day.exercises : []) {
    if (exercise === exclude) continue;
    const truth = exercise?.canonicalTruth || null;
    const directArmType = String(truth?.directArmType || exercise?.directArmType || '').toLowerCase();
    if (directArmType !== 'triceps' && !isDirectTricepsName(exercise?.name)) continue;
    const family = tricepsMovementFamily(exercise?.name);
    if (family && family !== 'none') families.add(family);
  }
  return families;
}

function inferMovementFamily(ex) {
  const family = slotExerciseFamily(ex);
  if (family) return family;
  const pattern = String(ex?.pattern || '').trim();
  const map = {
    HorizontalPush: 'horizontal_push',
    VerticalPush: 'vertical_push',
    HorizontalPull: 'horizontal_pull',
    VerticalPull: 'vertical_pull',
    Squat: 'squat',
    Hinge: 'hinge',
    Lunge: 'lunge',
    Carry: 'carry',
    CoreFlexion: 'core_flexion',
    CoreStability: 'core_stability',
    CoreRotation: 'core_rotation',
    Isolation: 'isolation'
  };
  return map[pattern] || 'general';
}

function buildExerciseTruth(ex, user = null) {
  const runtime = user?._plannerRuntime || null;
  const cacheKey = runtime
    ? `${String(user?.discipline || '')}|${canonicalExerciseIdFor(ex)}`
    : '';
  if (runtime?.caches?.exerciseTruth?.has(cacheKey)) {
    recordPlannerCount(user, 'exerciseTruthCacheHits');
    return runtime.caches.exerciseTruth.get(cacheKey);
  }
  recordPlannerCount(user, 'exerciseTruthBuilds');
  const name = String(ex?.name || '').trim();
  const lower = normalizeName(name);
  const movementFamily = inferMovementFamily(ex);
  const movementTags = Array.isArray(ex?.movementTags) ? ex.movementTags.map((tag) => String(tag || '').toLowerCase()) : [];
  const requiredEquipment = Array.isArray(ex?.requiredEquipment) && ex.requiredEquipment.length
    ? [...new Set(ex.requiredEquipment.map((token) => String(token || '').trim().toLowerCase()).filter(Boolean))]
    : inferRequiredEquipment(ex);
  const primaryMuscle = String(ex?.primary || ex?.muscleTarget || '').trim() === 'Abs'
    ? 'Core'
    : String(ex?.primary || ex?.muscleTarget || '').trim();
  const subMuscle = String(ex?.sub || '').trim();
  const directArmType = /(wrist curl|reverse wrist|pronation|supination|wrist roller|plate pinch|hand squeeze|finger curl)/.test(lower)
    ? 'forearm'
    : isDirectBicepsName(lower)
      ? 'biceps'
      : isDirectTricepsName(lower)
        ? 'triceps'
        : 'none';
  const directCalf = /\bcalf\b/.test(lower) || /calves/i.test(subMuscle);
  const directAb = ['CoreFlexion', 'CoreStability', 'CoreRotation'].includes(String(ex?.pattern || '').trim()) || primaryMuscle === 'Core';
  const shoulderPressPattern = /(shoulder press|overhead press|military press)/.test(lower);
  const lateralDeltPattern = /(lateral raise|side lateral)/.test(lower);
  const rearDeltPattern = /(rear delt|reverse fly|face pull|reverse pec deck)/.test(lower);
  const directDeltSubtype = ['front', 'lateral', 'rear', 'none'].includes(String(ex?.directDeltSubtype || '').trim().toLowerCase())
    ? String(ex.directDeltSubtype).trim().toLowerCase()
    : lateralDeltPattern
      ? 'lateral'
      : rearDeltPattern
        ? 'rear'
        : shoulderPressPattern || /\bfront raise\b/.test(lower)
          ? 'front'
          : 'none';
  const directArmSubtype = ['biceps', 'triceps', 'forearm', 'none'].includes(String(ex?.directArmSubtype || '').trim().toLowerCase())
    ? String(ex.directArmSubtype).trim().toLowerCase()
    : directArmType;
  const straightBar = /(straight bar|barbell curl|incline barbell triceps extension|standing military press|seated barbell military press|barbell shoulder press|smith machine overhead shoulder press|bent over two[- ]arm long bar row)/.test(lower)
    || (/\bbarbell\b/.test(lower) && /(curl|extension|press|row)/.test(lower) && !/\bdumbbell\b|\bcable\b|\bmachine\b/.test(lower));
  const wristExtensionHeavy = /(wrist curl|reverse wrist curl|palms down|palms up)/.test(lower)
    || (straightBar && /(shoulder press|overhead press|military press|curl|extension)/.test(lower));
  const neutralGripFriendly = /(neutral|hammer|rope)/.test(lower)
    || requiredEquipment.some((token) => ['dumbbell', 'cable', 'machine'].includes(token));
  const shoulderOverhead = shoulderPressPattern || /\bupright row\b/.test(lower);
  const forwardKneeTravelHigh = /(walking lunge|rear lunge|split squat|bulgarian|front foot elevated|sissy squat|pistol squat|skater squat|step up|step-up)/.test(lower)
    || (String(ex?.pattern || '') === 'Lunge');
  const deepKneeFlexionHigh = /(hack squat|front squat|back squat|chair squat|deep squat|sissy squat|pistol squat)/.test(lower)
    || (String(ex?.pattern || '') === 'Squat' && Number(ex?.knee || 0) >= 2);
  const axialLoadHigh = Number(ex?.spine || 0) >= 2
    || /\b(back squat|front squat|good morning|conventional deadlift|stiff leg deadlift|barbell deadlift)\b/.test(lower);
  const hingePattern = movementFamily === 'hinge'
    || /(deadlift|romanian deadlift|\brdl\b|stiff[-\s]*leg|good morning|hip thrust|glute bridge|pull through|back extension|hyperextension)/.test(lower);
  const unsupportedHipHingeLoad = ((/\b(bent over|bent-over)\b/.test(lower) || /\bsmith machine bent over row\b/.test(lower)) && /\brow\b/.test(lower))
    && !/(chest supported|head on bench|supported row|seal row)/.test(lower);
  const deepHipFlexionHigh = /\b(romanian deadlift from deficit|deficit rdl|stiff leg deadlift|good morning)\b/.test(lower)
    || (hingePattern && /\b(romanian deadlift|\brdl\b|deadlift)\b/.test(lower) && requiredEquipment.includes('barbell'));
  const hingeLoadingHigh = unsupportedHipHingeLoad
    || /\b(conventional deadlift|stiff leg deadlift|romanian deadlift from deficit|good morning|bent over two-arm long bar row)\b/.test(lower)
    || (hingePattern && requiredEquipment.includes('barbell') && /\b(romanian deadlift|\brdl\b|deadlift)\b/.test(lower))
    || (hingePattern && axialLoadHigh);
  const controlledHingeAllowed = /\b(hip thrust|glute bridge|pull through|back extension|hyperextension)\b/.test(lower)
    || (hingePattern && !hingeLoadingHigh && !deepHipFlexionHigh);
  const elbowSupinationStress = directArmType === 'biceps' && !/(hammer curl|reverse curl|neutral)/.test(lower);
  const skullcrusherLike = /(skull crusher|lying extension|incline barbell triceps extension|overhead triceps)/.test(lower);
  const progressionFriendly = !isNoveltyExerciseName(name)
    && Number(ex?.difficulty || 0) <= 4
    && !/\b(one arm|single arm)\b/.test(lower)
    && (requiredEquipment.some((token) => ['machine', 'cable', 'dumbbell'].includes(token)) || /supported|seated|press|row|curl|extension|raise|pulldown|leg press|hack squat|hip thrust|romanian deadlift|rdl/.test(lower));
  const pressRole = ['chest_press', 'shoulder_press', 'mixed', 'none'].includes(String(ex?.pressRole || '').trim().toLowerCase())
    ? String(ex.pressRole).trim().toLowerCase()
    : shoulderPressPattern && isChestPressPatternName(name)
      ? 'mixed'
      : shoulderPressPattern
        ? 'shoulder_press'
        : isChestPressPatternName(name)
          ? 'chest_press'
          : 'none';
  const pullRole = ['back_builder', 'rear_delt', 'mixed', 'none'].includes(String(ex?.pullRole || '').trim().toLowerCase())
    ? String(ex.pullRole).trim().toLowerCase()
    : rearDeltPattern || /\brow to neck\b/.test(lower)
      ? 'rear_delt'
      : ['horizontal_pull', 'vertical_pull'].includes(movementFamily)
        ? 'back_builder'
        : 'none';
  const supportType = ['unsupported', 'chest_supported', 'machine_supported', 'cable_supported', 'seated_stable', 'other'].includes(String(ex?.supportType || '').trim().toLowerCase())
    ? String(ex.supportType).trim().toLowerCase()
    : /(chest supported|head on bench|supported row|seal row)/.test(lower)
      ? 'chest_supported'
      : movementTags.includes('machinestable')
        ? 'machine_supported'
        : movementTags.includes('supported') && requiredEquipment.includes('cable')
          ? 'cable_supported'
          : movementTags.includes('supported') && /\bseated\b/.test(lower)
            ? 'seated_stable'
            : movementTags.includes('supported')
              ? 'other'
              : 'unsupported';
  const overloadFriendliness = ['low', 'medium', 'high'].includes(String(ex?.overloadFriendliness || '').trim().toLowerCase())
    ? String(ex.overloadFriendliness).trim().toLowerCase()
    : progressionFriendly && ['chest_supported', 'machine_supported', 'cable_supported', 'seated_stable'].includes(supportType)
      ? 'high'
      : progressionFriendly
        ? 'medium'
        : 'low';
  const fatigueClass = ['low', 'medium', 'high'].includes(String(ex?.fatigueClass || '').trim().toLowerCase())
    ? String(ex.fatigueClass).trim().toLowerCase()
    : hingeLoadingHigh || axialLoadHigh || deepHipFlexionHigh
      ? 'high'
      : String(ex?.style || '') === 'Compound' || unsupportedHipHingeLoad
        ? 'medium'
        : 'low';
  const glutePrimaryStrength = ['none', 'assist', 'secondary', 'primary'].includes(String(ex?.glutePrimaryStrength || '').trim().toLowerCase())
    ? String(ex.glutePrimaryStrength).trim().toLowerCase()
    : /(hip thrust|glute bridge|pull through)/.test(lower) || (subMuscle === 'Glutes' && /\bbridge\b/.test(lower))
      ? 'primary'
      : /\b(kickback|abductor)\b/.test(lower) || subMuscle === 'Glutes'
        ? 'secondary'
        : /(glute ham raise|seated leg curl|leg curl|romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(lower)
          || (Array.isArray(ex?.secondaryMuscles) && ex.secondaryMuscles.some((muscle) => /glutes/i.test(String(muscle || ''))))
          ? 'assist'
          : 'none';
  const coreFamily = ['flexion', 'stability', 'rotation', 'none'].includes(String(ex?.coreFamily || '').trim().toLowerCase())
    ? String(ex.coreFamily).trim().toLowerCase()
    : String(ex?.pattern || '') === 'CoreFlexion'
      ? 'flexion'
      : String(ex?.pattern || '') === 'CoreStability'
        ? 'stability'
        : String(ex?.pattern || '') === 'CoreRotation'
          ? 'rotation'
          : 'none';
  const truth = {
    canonicalExerciseId: canonicalExerciseIdFor(ex),
    canonicalName: name,
    displayName: normalizeBodybuildingDisplayName(name, user),
    requiredEquipment,
    primaryMuscle,
    subMuscle,
    movementFamily,
    directDeltSubtype,
    directArmType,
    directArmSubtype,
    directCalf,
    directAb,
    shoulderPressPattern,
    lateralDeltPattern,
    rearDeltPattern,
    straightBar,
    wristExtensionHeavy,
    neutralGripFriendly,
    shoulderOverhead,
    forwardKneeTravelHigh,
    deepKneeFlexionHigh,
    axialLoadHigh,
    deepHipFlexionHigh,
    hingeLoadingHigh,
    controlledHingeAllowed,
    elbowSupinationStress,
    skullcrusherLike,
    progressionFriendly,
    pressRole,
    pullRole,
    supportType,
    overloadFriendliness,
    fatigueClass,
    glutePrimaryStrength,
    coreFamily
  };
  if (runtime?.caches?.exerciseTruth) runtime.caches.exerciseTruth.set(cacheKey, truth);
  return truth;
}

function shouldTrackPriorityDebug(user) {
  return Number(user?.daysPerWeek || 0) <= 3 && (hasPriorityGroup(user, 'Calves') || hasPriorityGroup(user, 'Abs'));
}

function ensurePriorityDebugTrace(user) {
  if (!shouldTrackPriorityDebug(user)) return null;
  user.debugTrace = user.debugTrace || {};
  if (!user.debugTrace.lowFrequencyPriorityTrace) {
    const priorities = new Set(Array.isArray(user?.priorityGroups) ? user.priorityGroups : []);
    user.debugTrace.lowFrequencyPriorityTrace = {
      calf: {
        priorityDetected: hasPriorityGroup([...priorities], 'Calves'),
        reservedSlots: [],
        eligiblePools: [],
        initialSelections: [],
        trimmed: [],
        reinforced: [],
        finalExercises: [],
        removedAtStep: null
      },
      abs: {
        priorityDetected: hasPriorityGroup([...priorities], 'Abs'),
        reservedSlots: [],
        eligiblePools: [],
        initialSelections: [],
        trimmed: [],
        reinforced: [],
        finalExercises: [],
        removedAtStep: null
      }
    };
  }
  return user.debugTrace.lowFrequencyPriorityTrace;
}

function recordPriorityDebug(user, bucket, key, value) {
  const trace = ensurePriorityDebugTrace(user);
  if (!trace || !trace[bucket]) return;
  const target = trace[bucket];
  if (Array.isArray(target[key])) target[key].push(value);
  else target[key] = value;
}

function shouldTrackAbsGlutesLegsComboDebug(user) {
  return matchesGlutesLegsCoreDebugCombo({
    discipline: user?.discipline,
    daysPerWeek: user?.daysPerWeek,
    phase: user?.phase,
    sessionLengthMin: user?.sessionLengthMin,
    location: user?.location,
    priorityGroups: user?.priorityGroups,
    allowedEquipment: user?.allowedEquipment,
    injuryMap: user?.injuryMap,
    injuryNotes: user?.injuryNotes
  }, { builderNormalized: true });
}

function logAbsGlutesLegsComboDebug(user, event, payload = {}) {
  if (!shouldTrackAbsGlutesLegsComboDebug(user)) return;
  const runtime = user?._plannerRuntime || null;
  const elapsedMs = runtime?.state?.comboStartedAt ? Math.round(plannerNowMs() - runtime.state.comboStartedAt) : undefined;
  try {
    console.info(`[training-debug][${DEBUG_COMBO_LABEL}][builder] ${event}`, {
      at: new Date().toISOString(),
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
      ...payload
    });
  } catch {
    // ignore logging failures
  }
}

function logDebugComboMatchEval(locationTag, evaluation) {
  const evalObj = evaluation && typeof evaluation === 'object' ? evaluation : {};
  try {
    console.info('DEBUG_COMBO_MATCH_EVAL', {
      location: locationTag,
      matched: Boolean(evalObj.matched),
      reasonIfFalse: String(evalObj.reasonIfFalse || ''),
      rawPriorityGroups: Array.isArray(evalObj.rawPriorityGroups) ? evalObj.rawPriorityGroups : [],
      normalizedPriorityGroups: Array.isArray(evalObj.normalizedPriorityGroups) ? evalObj.normalizedPriorityGroups : [],
      discipline: evalObj.discipline || '',
      trainingFeel: evalObj.trainingFeel || '',
      daysPerWeek: Number(evalObj.daysPerWeek || 0) || 0,
      sessionLengthMin: evalObj.sessionLengthMin || '',
      locationValue: evalObj.location || '',
      primaryGoal: evalObj.primaryGoal || '',
      phase: evalObj.phase || '',
      normalizedEquipmentAccess: Array.isArray(evalObj.normalizedEquipmentAccess) ? evalObj.normalizedEquipmentAccess : [],
      painAreas: Array.isArray(evalObj.painAreas) ? evalObj.painAreas : [],
      injuryMap: Array.isArray(evalObj.injuryMapKeys) ? evalObj.injuryMapKeys : [],
      injuryNotes: evalObj.injuryNotes || ''
    });
  } catch {
    // ignore logging failures
  }
}

function getLowerBodyRepairLoopLimit(user, stage) {
  return Number(LOWER_BODY_LOOP_GUARD_LIMITS[String(stage || '')] || 12);
}

function buildLowerBodyGuardKey(stage, meta = {}) {
  const stageKey = String(stage || meta?.stage || 'lower-body repair').trim() || 'lower-body repair';
  const weekKey = Number.isFinite(Number(meta?.week)) ? Number(meta.week) : 'na';
  const dayKey = String(meta?.day || 'na').trim() || 'na';
  const dayTypeKey = String(meta?.dayType || 'na').trim() || 'na';
  return `${stageKey}|week:${weekKey}|day:${dayKey}|dayType:${dayTypeKey}`;
}

function getLowerBodyGuardState(user, stage, meta = {}) {
  if (!shouldTrackAbsGlutesLegsComboDebug(user) || !isNarrowPosteriorCoreUser(user)) return null;
  const runtime = user?._plannerRuntime || null;
  if (!runtime?.state?.lowerBodyLoopCounts) return null;
  const guardKey = buildLowerBodyGuardKey(stage, meta);
  const maxAttempts = getLowerBodyRepairLoopLimit(user, stage);
  const existing = runtime.state.lowerBodyLoopCounts.get(guardKey);
  if (existing && typeof existing === 'object') {
    existing.maxAttempts = maxAttempts;
    existing.guardKey = guardKey;
    return existing;
  }
  const created = {
    attempt: 0,
    maxAttempts,
    lastAttemptedRepair: '',
    lastRepairSucceeded: false,
    lastStructuralResult: null,
    guardKey
  };
  runtime.state.lowerBodyLoopCounts.set(guardKey, created);
  return created;
}

function resetLowerBodyRepairLoopGuard(user, stage, meta = {}, successMeta = {}) {
  if (!shouldTrackAbsGlutesLegsComboDebug(user) || !isNarrowPosteriorCoreUser(user)) return;
  const runtime = user?._plannerRuntime || null;
  if (!runtime?.state?.lowerBodyLoopCounts) return;
  const guardKey = buildLowerBodyGuardKey(stage, meta);
  runtime.state.lowerBodyLoopCounts.set(guardKey, {
    attempt: 0,
    maxAttempts: getLowerBodyRepairLoopLimit(user, stage),
    lastAttemptedRepair: String(successMeta?.lastAttemptedRepair || meta?.lastAttemptedRepair || ''),
    lastRepairSucceeded: true,
    lastStructuralResult: successMeta?.currentStructuralResult || meta?.currentStructuralResult || null,
    guardKey
  });
}

function resolveCurrentLowerDayStructuralResult(day) {
  if (!['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) return null;
  return buildLowerCoachCleanupStructuralResult(day);
}

function getPowerbuildingPatternBlockProfile(user) {
  if (String(user?.discipline || '') === 'military' && user?.profile?.military) {
    const military = user.profile.military;
    return {
      militaryMode: true,
      avoidBenchPattern: Boolean(military.pushupRestricted),
      avoidDeadliftPattern: Boolean(military.hingeBlocked),
      avoidSquatPattern: Boolean(military.squatBlocked),
      barbellUnavailable: !(Array.isArray(user?.allowedEquipment) && user.allowedEquipment.includes('barbell')),
      lowRecovery: String(military.recoveryTier || '') === 'low',
      severeBackOrHipPain: Math.max(Number(user?.injuryMap?.spine || 0), Number(user?.injuryMap?.back || 0), Number(user?.injuryMap?.hip || 0)) >= 6,
      severeKneePain: Number(user?.injuryMap?.knee || 0) >= 6
    };
  }
  const pb = user?.profile?.powerbuilding || null;
  if (String(user?.discipline || '') !== 'powerbuilding' || !pb) return null;
  return {
    militaryMode: false,
    avoidBenchPattern: Boolean(pb.avoidBenchPattern),
    avoidDeadliftPattern: Boolean(pb.avoidDeadliftPattern),
    avoidSquatPattern: Boolean(pb.avoidSquatPattern),
    barbellUnavailable: !(Array.isArray(user?.allowedEquipment) && user.allowedEquipment.includes('barbell')),
    lowRecovery: String(pb.recoveryTier || '') === 'low',
    severeBackOrHipPain: Math.max(Number(user?.injuryMap?.spine || 0), Number(user?.injuryMap?.back || 0), Number(user?.injuryMap?.hip || 0)) >= 6,
    severeKneePain: Number(user?.injuryMap?.knee || 0) >= 6
  };
}

function allowPowerbuildingPosteriorSubstitute(dayType, user) {
  const profile = getPowerbuildingPatternBlockProfile(user);
  if (!profile) return false;
  if (!['Lower', 'LowerFocus', 'FullBodyB'].includes(String(dayType || ''))) return false;
  return profile.lowRecovery || profile.severeBackOrHipPain || profile.avoidDeadliftPattern || profile.avoidSquatPattern || profile.barbellUnavailable;
}

function allowPowerbuildingNonSquatLower(dayType, user) {
  const profile = getPowerbuildingPatternBlockProfile(user);
  if (!profile) return false;
  return ['Lower', 'LowerFocus', 'FullBodyB'].includes(String(dayType || ''))
    && (profile.militaryMode || profile.avoidSquatPattern || profile.severeKneePain);
}

function buildLowerBodyRepairLoopLimitError(user, meta = {}) {
  const runtime = user?._plannerRuntime || null;
  return {
    error: 'LOWER_BODY_REPAIR_LOOP_LIMIT',
    message: String(meta?.message || 'Lower-body repair exceeded max iterations.'),
    functionName: String(meta?.functionName || 'lowerBodyRepairLoopGuard'),
    stage: String(meta?.stage || 'lower-body repair'),
    failedStage: String(meta?.failedStage || meta?.stage || 'lower-body repair'),
    priorityGroups: Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [],
    selectedSplit: Array.isArray(meta?.selectedSplit)
      ? meta.selectedSplit
      : (Array.isArray(runtime?.state?.selectedSplit) ? runtime.state.selectedSplit.slice() : []),
    day: meta?.day ? String(meta.day) : undefined,
    dayType: meta?.dayType ? String(meta.dayType) : undefined,
    week: Number.isFinite(Number(meta?.week)) ? Number(meta.week) : undefined,
    lastAttemptedRepair: meta?.lastAttemptedRepair ? String(meta.lastAttemptedRepair) : undefined,
    missingRequirement: meta?.missingRequirement ? String(meta.missingRequirement) : undefined,
    attempt: Number.isFinite(Number(meta?.attempt)) ? Number(meta.attempt) : undefined,
    maxAttempts: Number.isFinite(Number(meta?.maxAttempts)) ? Number(meta.maxAttempts) : undefined,
    reason: meta?.reason ? String(meta.reason) : undefined,
    lastRepairSucceeded: typeof meta?.lastRepairSucceeded === 'boolean' ? meta.lastRepairSucceeded : undefined,
    currentStructuralResult: meta?.currentStructuralResult || undefined,
    guardKey: meta?.guardKey ? String(meta.guardKey) : undefined
  };
}

function ensureLowerBodyBuilderBudget(user, stage, meta = {}) {
  if (!shouldTrackAbsGlutesLegsComboDebug(user) || !isNarrowPosteriorCoreUser(user)) return;
  const runtime = user?._plannerRuntime || null;
  const startedAt = Number(runtime?.state?.builderBudgetStartedAt || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return;
  if (runtime?.state) {
    runtime.state.currentStage = String(stage || runtime.state.currentStage || 'builder');
    runtime.state.lastAttemptedRepair = String(meta?.lastAttemptedRepair || runtime.state.lastAttemptedRepair || '');
    runtime.state.missingRequirement = String(meta?.missingRequirement || runtime.state.missingRequirement || '');
  }
  const elapsedMs = Math.round(plannerNowMs() - startedAt);
  if (elapsedMs <= 8000) return;
  throw buildLowerBodyRepairLoopLimitError(user, {
    ...meta,
    message: 'Lower-body repair exceeded internal builder budget.',
    functionName: String(meta?.functionName || 'buildOblueprintPlan'),
    stage: runtime?.state?.currentStage || String(stage || 'builder'),
    failedStage: runtime?.state?.currentStage || String(stage || 'builder'),
    lastAttemptedRepair: runtime?.state?.lastAttemptedRepair || meta?.lastAttemptedRepair,
    missingRequirement: runtime?.state?.missingRequirement || meta?.missingRequirement
  });
}

function bumpLowerBodyRepairLoopGuard(user, stage, meta = {}) {
  if (!shouldTrackAbsGlutesLegsComboDebug(user) || !isNarrowPosteriorCoreUser(user)) return;
  const runtime = user?._plannerRuntime || null;
  const key = String(stage || 'lower-body repair');
  const state = getLowerBodyGuardState(user, key, meta);
  if (!runtime?.state || !state) return;
  runtime.state.currentStage = key;
  runtime.state.lastAttemptedRepair = String(meta?.lastAttemptedRepair || runtime.state.lastAttemptedRepair || '');
  runtime.state.missingRequirement = String(meta?.missingRequirement || runtime.state.missingRequirement || '');
  ensureLowerBodyBuilderBudget(user, key, meta);
  const structuralResult = meta?.currentStructuralResult || null;
  state.attempt = Number(state.attempt || 0) + 1;
  state.maxAttempts = getLowerBodyRepairLoopLimit(user, key);
  state.lastAttemptedRepair = String(meta?.lastAttemptedRepair || state.lastAttemptedRepair || '');
  if (typeof meta?.lastRepairSucceeded === 'boolean') state.lastRepairSucceeded = meta.lastRepairSucceeded;
  if (structuralResult) state.lastStructuralResult = structuralResult;
  const nextCount = state.attempt;
  const maxAttempts = state.maxAttempts;
  if (nextCount > maxAttempts) {
    if (structuralResult?.ok) {
      state.lastRepairSucceeded = true;
      return {
        exceeded: true,
        suppressed: true,
        guardKey: state.guardKey,
        state: { ...state }
      };
    }
    throw buildLowerBodyRepairLoopLimitError(user, {
      ...meta,
      stage: key,
      failedStage: key,
      attempt: nextCount,
      maxAttempts,
      lastRepairSucceeded: state.lastRepairSucceeded,
      currentStructuralResult: structuralResult || state.lastStructuralResult || undefined,
      guardKey: state.guardKey
    });
  }
  return {
    exceeded: false,
    suppressed: false,
    guardKey: state.guardKey,
    state: { ...state }
  };
}

function markLowerBodyGracefulDegrade(user, reason = '') {
  if (!shouldTrackAbsGlutesLegsComboDebug(user) || !isNarrowPosteriorCoreUser(user)) return;
  const runtime = user?._plannerRuntime || null;
  if (!runtime?.state) return;
  if (runtime.state.lowerBodyDegradeApplied) return;
  runtime.state.lowerBodyDegradeApplied = true;
  runtime.state.lowerBodyDegradeReason = String(reason || '').trim();
  logAbsGlutesLegsComboDebug(user, 'lower-body-degrade-applied', {
    stage: 'lower-body graceful degradation',
    reason: runtime.state.lowerBodyDegradeReason || 'Preserved valid lower-day structure before ideal volume.'
  });
}

function isLowerBodyGracefulDegradeApplied(user) {
  return Boolean(user?._plannerRuntime?.state?.lowerBodyDegradeApplied);
}

function logComboStageEnter(user, stage, payload = {}) {
  const runtime = user?._plannerRuntime || null;
  if (runtime?.state?.comboStageStarts) runtime.state.comboStageStarts.set(String(stage || ''), plannerNowMs());
  if (runtime?.state) {
    runtime.state.currentStage = String(stage || '');
    if (payload?.lastRepairOrPolishFunction) runtime.state.lastRepairOrPolishFunction = String(payload.lastRepairOrPolishFunction || '');
  }
  ensureLowerBodyBuilderBudget(user, stage, payload);
  const plannerSelectedPriorities = Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [];
  const plannerDaysPerWeek = Number.isFinite(Number(user?.daysPerWeek))
    ? Number(user.daysPerWeek)
    : (Number.isFinite(Number(user?.days)) ? Number(user.days) : undefined);
  const plannerWeeksLength = Array.isArray(payload?.plan?.weeks)
    ? payload.plan.weeks.length
    : (Array.isArray(payload?.weeks) ? payload.weeks.length : undefined);
  const assertStageMeta = {
    functionName: 'logComboStageEnter',
    fileName: 'generator/trainingEngine.oblueprint.js',
    elapsedMs: plannerNowMs(),
    requestedDayCount: plannerDaysPerWeek,
    requestedPriorityCount: plannerSelectedPriorities.length || undefined,
    selectedPriorities: plannerSelectedPriorities,
    planExists: Boolean(payload?.plan || payload?.weeks || user?.workout_plan),
    weeksLength: Number.isFinite(Number(plannerWeeksLength)) ? Number(plannerWeeksLength) : undefined,
    callBoundary: 'worker_final_validation_stage_enter'
  };
  const stageMap = {
    'split selection': 'split selected',
    'blueprint construction': 'week build started',
    'lower day construction': 'lower day repair started',
    'priority repair': 'priority repair started',
    'final validation': 'assert_validation_started_callsite_B'
  };
  const heartbeatStage = stageMap[String(stage || '')];
  if (heartbeatStage) emitPlannerDiagnosticHeartbeat(
    user,
    heartbeatStage,
    String(stage || '') === 'final validation' ? assertStageMeta : payload
  );
  if (String(stage || '') === 'final validation') {
    emitPlannerDiagnosticHeartbeat(user, 'after_assert_validation_started_callsite_B', assertStageMeta);
  }
  if (!shouldTrackAbsGlutesLegsComboDebug(user)) return;
  logAbsGlutesLegsComboDebug(user, 'stage-enter', {
    stage,
    ...payload
  });
}

function logComboStageExit(user, stage, payload = {}) {
  if (!shouldTrackAbsGlutesLegsComboDebug(user)) return;
  const runtime = user?._plannerRuntime || null;
  ensureLowerBodyBuilderBudget(user, stage, payload);
  const startedAt = runtime?.state?.comboStageStarts?.get(String(stage || ''));
  const durationMs = Number.isFinite(Number(startedAt)) ? Math.round(plannerNowMs() - startedAt) : undefined;
  logAbsGlutesLegsComboDebug(user, 'stage-exit', {
    stage,
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...payload
  });
}

function attachAbsGlutesLegsDebugMeta(err, user, meta = {}) {
  if (!shouldTrackAbsGlutesLegsComboDebug(user)) return err;
  const src = err && typeof err === 'object' ? err : { message: String(err || 'Unknown error') };
  const out = {
    ...src,
    stage: src.stage || meta.stage || undefined,
    failedStage: src.failedStage || meta.failedStage || meta.stage || undefined,
    slotId: src.slotId || meta.slotId || undefined,
    day: src.day || meta.day || undefined,
    dayType: src.dayType || meta.dayType || undefined,
    week: Number.isFinite(Number(src.week)) ? Number(src.week) : (Number.isFinite(Number(meta.week)) ? Number(meta.week) : undefined),
    muscleTarget: src.muscleTarget || meta.muscleTarget || undefined
  };
  logAbsGlutesLegsComboDebug(user, 'stage-failure', {
    stage: out.stage || null,
    failedStage: out.failedStage || null,
    slotId: out.slotId || null,
    day: out.day || null,
    dayType: out.dayType || null,
    week: out.week ?? null,
    muscleTarget: out.muscleTarget || null,
    error: out.error || null,
    reason: out.reason || out.message || null
  });
  return out;
}

function buildExerciseOutput(chosen, user, slot, sets, rr, extra = {}) {
  const baseTruth = chosen?.canonicalTruth || buildExerciseTruth(chosen, user);
  const truth = {
    ...baseTruth,
    displayName: normalizeBodybuildingDisplayName(baseTruth.canonicalName || chosen?.name, user)
  };
  const item = {
    ...chosen,
    name: truth.displayName,
    displayName: truth.displayName,
    canonicalExerciseId: truth.canonicalExerciseId,
    canonicalName: truth.canonicalName,
    requiredEquipment: truth.requiredEquipment,
    primaryMuscle: truth.primaryMuscle,
    subMuscle: truth.subMuscle,
    movementFamily: truth.movementFamily,
    directDeltSubtype: truth.directDeltSubtype,
    directArmType: truth.directArmType,
    directArmSubtype: truth.directArmSubtype,
    directCalf: truth.directCalf,
    directAb: truth.directAb,
    shoulderPressPattern: truth.shoulderPressPattern,
    lateralDeltPattern: truth.lateralDeltPattern,
    rearDeltPattern: truth.rearDeltPattern,
    straightBar: truth.straightBar,
    wristExtensionHeavy: truth.wristExtensionHeavy,
    neutralGripFriendly: truth.neutralGripFriendly,
    shoulderOverhead: truth.shoulderOverhead,
    forwardKneeTravelHigh: truth.forwardKneeTravelHigh,
    deepKneeFlexionHigh: truth.deepKneeFlexionHigh,
    axialLoadHigh: truth.axialLoadHigh,
    deepHipFlexionHigh: truth.deepHipFlexionHigh,
    hingeLoadingHigh: truth.hingeLoadingHigh,
    controlledHingeAllowed: truth.controlledHingeAllowed,
    elbowSupinationStress: truth.elbowSupinationStress,
    skullcrusherLike: truth.skullcrusherLike,
    progressionFriendly: truth.progressionFriendly,
    pressRole: truth.pressRole,
    pullRole: truth.pullRole,
    supportType: truth.supportType,
    overloadFriendliness: truth.overloadFriendliness,
    fatigueClass: truth.fatigueClass,
    glutePrimaryStrength: truth.glutePrimaryStrength,
    coreFamily: truth.coreFamily,
    sets,
    reps: rr.reps,
    restSec: rr.restSec,
    progressionRule: progressionRuleForExercise({ ...chosen, slotId: slot.id }, user),
    flags: ['avoidFilteredOk', 'injurySafeOk'],
    muscleTarget: slot.muscleTarget,
    slotId: slot.id,
    optional: slot.optional,
    ...extra
  };
  const rir = rirForExercise(chosen, user, extra.weekType, slot.id);
  if (rir) item.rir = rir;
  return item;
}

function isBodybuildingStapleForSlot(ex, slot, user, dayType) {
  if (!(user?.discipline === 'bodybuilding' || user?.discipline === 'powerbuilding')) return true;
  if (isNoveltyExerciseName(ex?.name)) return false;
  const name = String(ex?.name || '');
  const pattern = String(slot?.pattern || '');
  const styleRequired = String(slot?.styleRequired || '');
  if (styleRequired === 'Compound' && STAPLE_PATTERN_RULES[pattern]) {
    return matchesStaplePatternRule(name, pattern);
  }
  if (styleRequired === 'Isolation') {
    if (slot?.muscleTarget === 'Chest') {
      const nn = normalizeName(name);
      return (/\bfly\b|\bcrossover\b|\bpec deck\b/.test(nn)) && !/(rear delt|reverse fly|face pull|reverse pec deck)/.test(nn);
    }
    if (slot?.muscleTarget === 'Shoulders') {
      const nn = normalizeName(name);
      const pref = Array.isArray(slot?.subPreferred) ? slot.subPreferred.map((x) => String(x || '').toLowerCase()) : [];
      const wantsRear = pref.some((p) => p.includes('rear'));
      const wantsLateral = pref.some((p) => p.includes('lateral') || p.includes('side'));
      if (wantsRear && !wantsLateral) return /(rear delt|reverse fly|face pull|rear raise|reverse pec deck)/.test(nn);
      if (wantsLateral && !wantsRear) return /(lateral raise|side lateral)/.test(nn);
      return /(lateral raise|rear delt|reverse fly|face pull|rear raise|reverse pec deck)/.test(nn);
    }
    if (slot?.muscleTarget === 'Arms') {
      const nn = normalizeName(name);
      const prefs = Array.isArray(slot?.subPreferred) ? slot.subPreferred.map((s) => String(s || '').toLowerCase()) : [];
      const wantsBiceps = prefs.some((s) => s.includes('biceps'));
      const wantsTriceps = prefs.some((s) => s.includes('triceps'));
      const wantsTricepsPress = prefs.includes('triceps-press');
      const wantsTricepsOverhead = prefs.includes('triceps-overhead');
      const wantsTricepsPushdown = prefs.includes('triceps-pushdown');
      const bicepsMatch = isDirectBicepsName(nn);
      const tricepsMatch = isDirectTricepsName(nn);
      if (wantsTricepsPress) return isHeavyTricepsPressName(nn);
      if (wantsTricepsOverhead) return isOverheadTricepsExtensionName(nn);
      if (wantsTricepsPushdown) return isPushdownTricepsName(nn);
      if (wantsBiceps && !wantsTriceps) return bicepsMatch;
      if (wantsTriceps && !wantsBiceps) return tricepsMatch;
      return bicepsMatch || tricepsMatch;
    }
    if (slot?.muscleTarget === 'Legs') {
      const nn = normalizeName(name);
      const pref = Array.isArray(slot?.subPreferred) ? slot.subPreferred.map((x) => String(x || '').toLowerCase()) : [];
      const wantsCalves = pref.some((p) => p.includes('calves'));
      const wantsHamCurl = pref.some((p) => p.includes('hamstrings-curl') || p.includes('hamstring'));
      const wantsQuads = pref.some((p) => p.includes('quads'));
      if (wantsCalves) return /\bcalf\b/.test(nn);
      if (wantsHamCurl) return /(leg curl|hamstring curl|glute ham)/.test(nn);
      if (wantsQuads) return /(leg extension)/.test(nn);
      return /(leg extension|leg curl|hamstring curl|glute ham|calf|adductor|abductor)/.test(nn);
    }
    if (slot?.muscleTarget === 'Glutes') {
      const nn = normalizeName(name);
      return /(glute|kickback|pull through|abductor|adductor|bridge|hip thrust|glute ham)/.test(nn);
    }
    if (slot?.muscleTarget === 'Forearms') {
      const nn = normalizeName(name);
      return /(wrist curl|reverse wrist|reverse curl|hammer curl|pronation|supination|finger curl|wrist roller|plate pinch|hand squeeze)/.test(nn);
    }
    if (slot?.muscleTarget === 'Neck') {
      const nn = normalizeName(name);
      return /(neck resistance|neck flexion|neck extension|neck lateral|head harness)/.test(nn);
    }
    if (slot?.muscleTarget === 'Core') {
      const nn = normalizeName(name);
      if (slot?.pattern === 'CoreFlexion') return /(crunch|rope crunch|cable crunch|ab wheel|rollout)/.test(nn);
      if (slot?.pattern === 'CoreStability') return /(plank|dead bug|vacuum|fallout|anti extension|stability|pallof hold)/.test(nn);
      if (slot?.pattern === 'CoreRotation') return /(wood chop|pallof|twist|rotation|side bend|oblique|cable lift|reach through)/.test(nn);
      return /(crunch|rollout|wood chop|pallof|ab wheel|hanging knee|hanging leg|side bend|twist|cable lift|reach through)/.test(nn);
    }
  }
  if (dayType === 'Push' && pattern === 'HorizontalPush') return matchesStaplePatternRule(name, 'HorizontalPush');
  if (dayType === 'Pull' && (pattern === 'VerticalPull' || pattern === 'HorizontalPull')) return matchesStaplePatternRule(name, pattern);
  if (dayType === 'Legs' && (pattern === 'Squat' || pattern === 'Hinge')) return matchesStaplePatternRule(name, pattern);
  if (styleRequired === 'Compound' && slot?.muscleTarget === 'Arms') {
    const nn = normalizeName(name);
    const prefs = Array.isArray(slot?.subPreferred) ? slot.subPreferred.map((s) => String(s || '').toLowerCase()) : [];
    if (prefs.includes('triceps-press')) return isHeavyTricepsPressName(nn);
    return isHeavyTricepsPressName(nn) || isDirectTricepsName(nn);
  }
  return true;
}

function preprocessExercises(exercises) {
  const src = Array.isArray(exercises) ? exercises : [];
  const out = [];
  for (const ex of src) {
    const name = String(ex?.name || '').trim();
    if (!name) return { error: 'INVALID_EXERCISE_RECORD', name: '', badField: 'name' };
    if (isHardBannedExercise(ex)) continue;
    const style = String(ex?.style || '').trim();
    if (!STYLE_ENUM.has(style)) return { error: 'INVALID_EXERCISE_RECORD', name, badField: 'style' };
    const pattern = String(ex?.pattern || '').trim();
    if (!PATTERN_ENUM.has(pattern)) return { error: 'INVALID_EXERCISE_RECORD', name, badField: 'pattern' };
    const rawPrimary = String(ex?.primary || '').trim();
    const rawSub = String(ex?.sub || '').trim();
    const rawSecondaryMuscles = Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles.slice() : [];
    const normalizedPrimary = normalizeMuscleLabel(String(ex?.primary || '').trim() === 'Abs' ? 'Core' : ex?.primary);
    const normalizedSecondary = normalizeMuscleLabels(Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles : []);
    const dbMuscleTargets = normalizeDbMuscleTargets([rawPrimary, ...rawSecondaryMuscles]);
    const directMuscleTargets = deriveDirectMuscleTargets(rawPrimary, rawSub);
    const supportMuscleTargets = normalizeDbMuscleTargets([rawPrimary, ...rawSecondaryMuscles]);
    out.push({
      ...ex,
      name,
      rawPrimary,
      rawSub,
      rawSecondaryMuscles,
      dbMuscleTargets,
      directMuscleTargets,
      supportMuscleTargets,
      primary: normalizedPrimary,
      nameLower: name.toLowerCase(),
      equipmentNorm: normalizeEquipmentTags(ex?.equipment || []),
      // An explicit requiredEquipment on the row wins over what the name
      // implies. inferRequiredEquipment ADDS tokens parsed from the name on top
      // of the equipment field — "Bulgarian Split Squat" forces 'dumbbell' even
      // on a row tagged Bodyweight — so without this the data cannot override
      // the name. buildExerciseTruth already honours the field; this makes the
      // two agree. No-op for every row that carries it today.
      requiredEquipment: Array.isArray(ex?.requiredEquipment) && ex.requiredEquipment.length
        ? [...new Set(ex.requiredEquipment.map((token) => String(token || '').trim().toLowerCase()).filter(Boolean))]
        : inferRequiredEquipment(ex),
      isCalisthenicsLike: isCalisthenicsLikeExercise(ex),
      secondaryMuscles: normalizedSecondary,
      canonicalTruth: buildExerciseTruth({
        ...ex,
        name,
        rawPrimary,
        rawSub,
        rawSecondaryMuscles,
        dbMuscleTargets,
        directMuscleTargets,
        supportMuscleTargets,
        primary: normalizedPrimary,
        secondaryMuscles: normalizedSecondary,
        requiredEquipment: inferRequiredEquipment(ex)
      })
    });
  }
  return { exercises: out.sort((a, b) => a.name.localeCompare(b.name)) };
}

function resolveDiscipline(trainingFeel) {
  if (trainingFeel === 'Aesthetic bodybuilding') return 'bodybuilding';
  if (trainingFeel === 'Powerbuilding') return 'powerbuilding';
  if (trainingFeel === 'Military Hybrid') return 'military';
  return null;
}

function normalizeExperienceTier(raw) {
  const compact = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/\s+/g, '')
    .replace(/months?/g, 'months')
    .replace(/years?/g, 'years')
    .replace(/yrs?/g, 'yr');
  if (!compact) return null;
  if (['<6m', '<6months', '0-6m', '0-6months'].includes(compact)) return '<6m';
  if (['6-24m', '6-24months', '6to24m', '6to24months', '6-18m', '6-18months', '18-36m', '18-36months'].includes(compact)) return '6-24m';
  if (['2-5y', '2-5yr', '2-5years', '2to5y', '2to5yr', '2to5years', '3-5y', '3-5yr', '3-5years'].includes(compact)) return '2-5y';
  if (['5y+', '5+y', '5+yr', '5+years', '5plusy', '5plusyr', '5plusyears'].includes(compact)) return '5y+';
  return null;
}

function toWeekday(value) {
  const v = String(value || '').trim().toLowerCase();
  // Single-letter forms are the vocabulary of TRAINING_WEEKDAY_CODES in
  // core/trainingRoutes.js ('SU','M','T','W','TH','F','S'), which is what the
  // classic bridge emits. They were not accepted here, so a 3-day classic
  // payload arrived as ['M','W','F'], only 'W' resolved, the count no longer
  // matched daysPerWeek and the whole choice was discarded for a default. That
  // is why every classic user trained on consecutive days regardless of intent.
  const map = {
    su: 'Su', sun: 'Su', sunday: 'Su',
    mo: 'Mo', m: 'Mo', mon: 'Mo', monday: 'Mo',
    tu: 'Tu', t: 'Tu', tue: 'Tu', tues: 'Tu', tuesday: 'Tu',
    we: 'We', w: 'We', wed: 'We', wednesday: 'We',
    th: 'Th', thu: 'Th', thur: 'Th', thurs: 'Th', thursday: 'Th',
    fr: 'Fr', f: 'Fr', fri: 'Fr', friday: 'Fr',
    sa: 'Sa', s: 'Sa', sat: 'Sa', saturday: 'Sa'
  };
  return map[v] || null;
}

/* Conventional weekday spreads for a user who did not pick days. Mirrors
   preferredWeekdayPattern in core/trainingRoutes.js so both entry paths agree.
   Rest falls between sessions instead of all landing at the end of the week. */
const DEFAULT_TRAINING_DAY_SPREAD = {
  1: ['Mo'],
  2: ['Mo', 'Th'],
  3: ['Mo', 'We', 'Fr'],
  4: ['Mo', 'Tu', 'Th', 'Fr'],
  5: ['Mo', 'Tu', 'We', 'Fr', 'Sa'],
  6: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  7: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
};

function derivePreferredDays(daysPerWeek, preferredDaysRaw, unavailableDaysRaw) {
  const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
  const preferred = (Array.isArray(preferredDaysRaw) ? preferredDaysRaw : []).map(toWeekday).filter(Boolean);
  if (preferred.length === n) return preferred.slice(0, n);
  const blocked = new Set((Array.isArray(unavailableDaysRaw) ? unavailableDaysRaw : []).map(toWeekday).filter(Boolean));
  const available = WEEKDAY_DEFAULT_ORDER.filter((day) => !blocked.has(day));
  if (!n) return [];
  if (available.length < n) return preferred.slice(0, n);
  const chosen = [];
  preferred.forEach((day) => {
    if (chosen.length < n && !blocked.has(day) && !chosen.includes(day)) chosen.push(day);
  });
  // Fill from a SPREAD, not from the head of the week. Taking the first n
  // weekdays gives everyone who did not pick days a block of consecutive
  // sessions (Mo,Tu,We,Th) and a four-day gap, which is the worst available
  // recovery distribution and also starves the placement solver in phase 5.
  DEFAULT_TRAINING_DAY_SPREAD[n]?.forEach((day) => {
    if (chosen.length < n && !blocked.has(day) && !chosen.includes(day)) chosen.push(day);
  });
  available.forEach((day) => {
    if (chosen.length < n && !chosen.includes(day)) chosen.push(day);
  });
  return chosen.slice(0, n);
}

function normalizeAvoidTokens(movementsToAvoid) {
  const out = new Set(ALWAYS_AVOID_TOKENS);
  (Array.isArray(movementsToAvoid) ? movementsToAvoid : []).forEach((v) => {
    const key = String(v || '').trim().toLowerCase();
    if (key) out.add(key);
    (AVOID_MAP[key] || []).forEach((token) => out.add(String(token).toLowerCase()));
    if (key === 'bench press') out.add('bench');
    if (key === 'deadlift') {
      out.add('romanian');
      out.add('stiff');
      out.add('rack pull');
    }
    if (key === 'squat') {
      out.add('hack squat');
      out.add('leg press');
      out.add('box squat');
    }
  });
  return [...out].sort();
}

function normalizePriorityGroups(raw) {
  const out = [];
  (Array.isArray(raw) ? raw : []).forEach((entry) => {
    const mapped = canonicalPriorityGroup(entry);
    if (!mapped || !MUSCLE_KEYS.includes(mapped)) return;
    if (out.includes(mapped)) return;
    out.push(mapped);
  });
  return out;
}

function adjustSeverity(severity, recency) {
  const s = Math.max(1, Math.min(10, Number(severity) || 0));
  if (!s) return null;
  if (recency === 'Recent') return Math.min(10, s + 1);
  if (recency === 'Old') return Math.max(1, s - 1);
  return s;
}

function normalizePainNotes(painProfilesByArea) {
  const notes = [];
  const src = painProfilesByArea && typeof painProfilesByArea === 'object' ? painProfilesByArea : {};
  for (const value of Object.values(src)) {
    if (!value || typeof value !== 'object') continue;
    for (const key of ['notes', 'avoidNotes', 'whatHurts', 'avoid']) {
      const text = String(value?.[key] || '').trim();
      if (text) notes.push(text.toLowerCase());
    }
  }
  return notes.join(' ');
}

function deriveInjuryNoteFlags(text = '') {
  const notes = String(text || '').toLowerCase();
  return {
    deepKneeFlexionIntolerance: /(deep knee|deep squat|deep flexion|full knee bend)/.test(notes),
    forwardKneeTravelIntolerance: /(forward knee travel|knees over toes|knee[- ]forward)/.test(notes),
    ankleKneeForwardIntolerance: /(ankle.*knee[- ]forward|knee[- ]forward.*ankle|ankle irritation.*forward knee)/.test(notes),
    straightBarIntolerance: /(straight bar|straight[- ]bar|barbell curl|barbell extension)/.test(notes),
    wristExtensionIntolerance: /(wrist extension|extended wrist|wrist bent back)/.test(notes),
    cervicalContraindication: /(neck pain|cervical|concussion|whiplash)/.test(notes),
    avoidStraightBar: /(straight bar|straight[- ]bar|barbell.*worse|straight bars? feel worse)/.test(notes),
    avoidWristExtension: /(wrist extension|extended wrist|wrist bent back|extension tolerance is limited)/.test(notes),
    preferNeutralGrip: /(neutral grip|neutral grips|neutral handles|dumbbells.*feel better|neutral grips feel better)/.test(notes),
    avoidDeepKneeFlexion: /(deep knee|deep squat|deep flexion|full knee bend)/.test(notes),
    avoidForwardKneeTravel: /(forward knee travel|knees over toes|knee[- ]forward)/.test(notes),
    avoidOverheadVolume: /(overhead volume|overhead pressing|overhead work|overhead\b)/.test(notes),
    avoidDeepStretchPressing: /(deep stretch pressing|deep stretch|bottom range pressing|pinchy.*press)/.test(notes),
    avoidAggressiveSupination: /(aggressive supinated|supinated pulling|supination)/.test(notes),
    avoidSkullcrusherPatterns: /(skull crusher|skull-crusher|crusher style|overhead triceps.*flare)/.test(notes),
    avoidHeavyAxialLoad: /(heavy axial load|axial loading|heavy spinal loading)/.test(notes),
    avoidFloorDeadliftPattern: /(deadlift.*from the floor|from the floor|floor deadlift)/.test(notes),
    avoidDeepHipFlexion: /(deep hip flexion|very deep flexion|deep flexion|hip flexion.*irritat|hip gets irritated.*deep|moderate stance is better|wide[- ]stance work)/.test(notes),
    allowControlledHinge: /(controlled hinges? are okay|controlled hinge.*okay|hinges? are okay)/.test(notes)
  };
}

function inferRequiredEquipment(ex) {
  const required = new Set(normalizeEquipmentTags(ex?.equipment || []));
  const name = normalizeName(ex?.name);
  if (!name) return [...required];
  if (/\bsmith\b/.test(name)) required.add('machine');
  if (/\b(machine|leg press|hack squat|pec deck|chest press|calf press)\b/.test(name)) required.add('machine');
  if (/\b(cable|pulldown|pushdown|rope crunch|face pull|crossover|seated cable row)\b/.test(name)) required.add('cable');
  if (/\b(barbell|front squat|back squat|romanian deadlift|deadlift|hip thrust|bench press)\b/.test(name)) required.add('barbell');
  if (/\b(dumbbell|goblet|bulgarian split squat)\b/.test(name)) required.add('dumbbell');
  if (/\b(bodyweight|push up|push-up|pull up|pull-up|chin up|chin-up|plank|sit up|sit-up|bodyweight squat)\b/.test(name)) required.add('bodyweight');
  if (/\b(pull ?up|chin ?up|hanging knee|hanging leg|toes to bar|captains chair|parallel bars)\b/.test(name)) required.add('pullup_bar');
  return [...required];
}

function isExerciseCompatibleWithEquipment(ex, user) {
  const required = Array.isArray(ex?.requiredEquipment) && ex.requiredEquipment.length
    ? ex.requiredEquipment
    : inferRequiredEquipment(ex);
  if (!required.length) return true;
  const allowed = new Set(Array.isArray(user?.allowedEquipment) ? user.allowedEquipment : []);
  for (const token of required) {
    if (token === 'bodyweight' && allowed.has('bodyweight')) continue;
    if (!allowed.has(token)) return false;
  }
  return true;
}

function deriveUserProfile(user) {
  const priorities = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  const priorityRanking = priorities.slice(0, 3);
  const priorityRankMap = priorityRanking.reduce((acc, muscle, idx) => {
    acc[muscle] = idx + 1;
    return acc;
  }, {});
  const upperPriorityCount = priorities.filter((group) => ['Chest', 'Back', 'Shoulders', 'Arms'].some((target) => priorityGroupsOverlap(group, target))).length;
  const lowerPriorityCount = priorities.filter((group) => ['Quads', 'Hamstrings/Glutes', 'Calves'].some((target) => priorityGroupsOverlap(group, target))).length;
  const corePriority = hasPriorityGroup(priorities, 'Abs');
  const allowed = Array.isArray(user?.allowedEquipment) ? user.allowedEquipment : [];
  const nonBodyweightTools = allowed.filter((eq) => eq !== 'bodyweight');
  const minimalEquipment = nonBodyweightTools.length <= 1;
  const bodyweightDominant = allowed.includes('bodyweight') && allowed.length <= 2;
  const constrainedFreeWeightOnly = allowed.length <= 2
    && !allowed.includes('cable')
    && !allowed.includes('machine')
    && !allowed.includes('smith')
    && !allowed.includes('pullup_bar');
  const sessionBandwidth = user?.sessionCap <= 4 ? 'tight' : user?.sessionCap >= 7 ? 'wide' : 'normal';
  const recovery = Number(user?.sleepHours || 7) >= 7 && String(user?.stress || 'Medium') !== 'High' ? 'good' : 'average';
  const complexity = EXP_CFG[user?.experience]?.maxDifficulty <= 3 ? 'low' : EXP_CFG[user?.experience]?.maxDifficulty >= 5 ? 'high' : 'medium';
  const preferredEnvironment = user?.trainingStyle === 'Mostly machines/cables'
    ? 'machine_dominant'
    : user?.trainingStyle === 'Mostly free weights'
      ? 'free_weight_dominant'
      : 'mixed';
  const injuryCount = Object.keys(user?.injuryMap || {}).filter((key) => Number(user?.injuryMap?.[key] || 0) > 0).length;
  const maxInjury = Math.max(0, ...Object.values(user?.injuryMap || {}).map((value) => Number(value) || 0));
  const constraintSeverity = maxInjury >= 7 || minimalEquipment ? 'high' : maxInjury >= 5 || sessionBandwidth === 'tight' ? 'medium' : 'low';
  const specializationLevel = priorityRanking.length >= 3 || (priorityRanking.length >= 2 && Number(user?.daysPerWeek || 0) >= 5)
    ? 'high'
    : priorityRanking.length >= 2
      ? 'medium'
      : 'general';
  const movementTolerance = maxInjury >= 7 ? 'restricted' : maxInjury >= 5 ? 'guarded' : 'normal';
  const forearmPriorityFlag = hasPriorityGroup(priorities, 'Arms') && (complexity !== 'low' || Number(user?.daysPerWeek || 0) >= 4);
  const neckEligibleFlag = complexity !== 'low'
    && Number(user?.daysPerWeek || 0) >= 4
    && maxInjury < 7
    && Number(user?.injuryMap?.spine || 0) < 5
    && Number(user?.injuryMap?.shoulder || 0) < 7
    && !user?.injuryNoteFlags?.cervicalContraindication;
  const aestheticTrunkPriority = hasPriorityGroup(priorities, 'Abs') || (user?.focus === 'Aesthetic' && ['deficit', 'recomp'].includes(String(user?.phase || '')));
  const coreDiversityNeed = hasPriorityGroup(priorities, 'Abs')
    ? (complexity === 'high' ? 4 : complexity === 'medium' ? 3 : 2)
    : (aestheticTrunkPriority && complexity !== 'low' && sessionBandwidth !== 'tight' ? 2 : 1);
  const priorityVolumeAggressiveness = specializationLevel === 'high' && recovery === 'good'
    ? 'high'
    : specializationLevel === 'medium'
      ? 'medium'
      : 'low';
  const smallAccessoryRecovery = recovery === 'good' && Number(user?.daysPerWeek || 0) <= 5 ? 'high' : recovery === 'average' ? 'medium' : 'low';
  const minimalEquipmentAccessoryMode = minimalEquipment || (allowed.length <= 2 && !allowed.includes('cable') && !allowed.includes('machine'));
  const armSpecializationSubtype = priorities.includes('Arms')
    ? forearmPriorityFlag ? 'full_arm_plus_forearm' : 'upper_arm_only'
    : 'none';
  const profile = {
    priorityRanking,
    priorityRankMap,
    upperPriorityCount,
    lowerPriorityCount,
    corePriority,
    priorityBias: upperPriorityCount > lowerPriorityCount ? 'upper' : lowerPriorityCount > upperPriorityCount ? 'lower' : 'balanced',
    minimalEquipment,
    bodyweightDominant,
    allowWeeklyRepeat: minimalEquipment || bodyweightDominant || constrainedFreeWeightOnly || Number(user?.daysPerWeek || 0) >= 5,
    sessionBandwidth,
    recovery,
    complexity,
    preferredEnvironment,
    injuryCount,
    constraintSeverity,
    specializationLevel,
    movementTolerance,
    constrainedFreeWeightOnly,
    armSpecializationSubtype,
    forearmPriorityFlag,
    neckEligibleFlag,
    coreDiversityNeed,
    aestheticTrunkPriority,
    priorityVolumeAggressiveness,
    smallAccessoryRecovery,
    minimalEquipmentAccessoryMode
  };
  if (String(user?.discipline || '') === 'powerbuilding') {
    profile.powerbuilding = powerbuildingPriority.buildPowerbuildingProfile({ ...user, profile });
  }
  if (String(user?.discipline || '') === 'military') {
    profile.military = militaryHybrid.buildMilitaryProfile({ ...user, profile });
  }
  return profile;
}

function normalizeUserInput(input) {
  const src = input && typeof input === 'object' ? input : null;
  if (!src) return invalidInput('input', 'Input must be an object');

  const discipline = resolveDiscipline(src.trainingFeel);
  if (!discipline) return { error: 'UNSUPPORTED_DISCIPLINE' };

  const requiredEnum = [
    ['primaryGoal', ['Build size', 'Cut fat', 'Recomp']],
    ['timeline', ['4 weeks', '8 weeks', '12+ weeks']],
    ['focus', ['Size', 'Strength', 'Aesthetic']],
    ['location', ['Home', 'Commercial gym']],
    ['trainingStyle', ['Mostly machines/cables', 'Mostly free weights', 'Balanced mix']],
    ['outputStyle', ['RPE/RIR cues', 'Simple sets x reps']],
    ['closeToFailure', ['Yes', 'No']]
  ];
  for (const [field, allowed] of requiredEnum) {
    if (!allowed.includes(src[field])) return invalidInput(field, `Expected one of: ${allowed.join(', ')}`);
  }
  const experience = normalizeExperienceTier(src.experience);
  if (!experience) return invalidInput('experience', `Expected one of: ${EXPERIENCE_CANONICAL.join(', ')}`);
  const daysPerWeek = Number(src.daysPerWeek);
  if (!Number.isFinite(daysPerWeek) || daysPerWeek < 2 || daysPerWeek > 6) return invalidInput('daysPerWeek', 'Must be between 2 and 6');
  const sessionLengthMin = String(src.sessionLengthMin || '');
  if (!SESSION_CAP[sessionLengthMin]) return invalidInput('sessionLengthMin', 'Must be one of 30,45,60,75+');
  if (!Array.isArray(src.priorityGroups)) return invalidInput('priorityGroups', 'Must be an array');
  if (!Array.isArray(src.movementsToAvoid)) return invalidInput('movementsToAvoid', 'Must be an array');
  if (!Array.isArray(src.preferredDays)) return invalidInput('preferredDays', 'Must be an array');
  if (!Array.isArray(src.equipmentAccess)) return invalidInput('equipmentAccess', 'Must be an array');

  const userEquipNorm = normalizeEquipmentTags(src.equipmentAccess);
  let allowedEquipment = [];
  if (src.location === 'Home') {
    if (Array.isArray(src.equipmentAccess) && src.equipmentAccess.length > 0) {
      if (!userEquipNorm.length) return { error: 'NO_USABLE_EQUIPMENT_HOME' };
      allowedEquipment = [...new Set([...userEquipNorm])].sort();
    } else {
      allowedEquipment = [...HOME_DEFAULTS];
    }
  } else {
    allowedEquipment = userEquipNorm.length ? [...new Set(userEquipNorm)].sort() : [...GYM_DEFAULTS];
  }

  const painProfiles = src.painProfilesByArea && typeof src.painProfilesByArea === 'object' ? src.painProfilesByArea : {};
  const injuryMap = {};
  (Array.isArray(src.painAreas) ? src.painAreas : []).forEach((area) => {
    const profile = painProfiles[area] || {};
    const adjusted = adjustSeverity(profile.severity, profile.recency);
    if (!adjusted) return;
    if (area === 'Wrist') {
      injuryMap.Wrist = adjusted;
      injuryMap.wrist = adjusted;
    }
    const joint = INJURY_JOINT_MAP[area];
    if (joint) injuryMap[joint] = adjusted;
  });
  const injuryNotes = normalizePainNotes(painProfiles);
  const injuryNoteFlags = deriveInjuryNoteFlags(injuryNotes);

  const preferredDays = derivePreferredDays(daysPerWeek, src.preferredDays, src.unavailableDays);
  const phase = src.primaryGoal === 'Build size' ? 'surplus' : src.primaryGoal === 'Cut fat' ? 'deficit' : 'recomp';

  const rawPlanSeed = Number(src.planSeed);
  const planSeed = Number.isFinite(rawPlanSeed) ? Math.floor(rawPlanSeed) : buildPlanSeed();

  const normalized = {
    ...src,
    discipline,
    experience,
    phase,
    daysPerWeek: Math.floor(daysPerWeek),
    sessionCap: SESSION_CAP[sessionLengthMin],
    userEquipNorm,
    allowedEquipment: allowedEquipment.sort(),
    avoidNameContainsTokens: normalizeAvoidTokens(src.movementsToAvoid),
    priorityGroups: normalizePriorityGroups(src.priorityGroups),
    injuryMap,
    injuryNotes,
    injuryNoteFlags,
    preferredDays,
    planSeed,
    progressionStyle: normalizeProgressionStyle(src.progressionStyle),
    wantsCardio: src.wantsCardio === true || src.wantsCardio === 'true' || src.wantsCardio === 1 || src.wantsCardio === '1',
    _selectionCursor: 0,
    debugTrace: null
  };
  normalized.profile = deriveUserProfile(normalized);
  if (shouldTrackPriorityDebug(normalized)) normalized.debugTrace = {};
  return normalized;
}

function computeWeeklyTargets(user) {
  const profile = user?.profile || deriveUserProfile(user);
  const targets = {};
  const frequencyTargets = {};
  const directPrioritySet = getPriorityDirectTargets(user);
  const directRankMap = getDirectPriorityRankMap(user);
  const posteriorPriority = hasPriorityGroup(user, 'Hamstrings/Glutes');
  const posteriorRank = Math.min(
    Number(directRankMap.Hamstrings || 99),
    Number(directRankMap.Glutes || 99)
  );
  let posteriorSplitTarget = null;
  if (posteriorPriority) {
    const [posteriorMin, posteriorMax] = DIRECT_TARGET_RANGES.Hamstrings.priority;
    let combined = chooseTargetInRange(posteriorMin, posteriorMax, user, 'Hamstrings', true);
    combined = Math.round(combined * Number(PRIORITY_ORDER_MULTIPLIER[posteriorRank] || 1));
    posteriorSplitTarget = Math.max(1, Math.round(combined / 2));
  }
  DIRECT_TARGET_KEYS.forEach((key) => {
    const cfg = DIRECT_TARGET_RANGES[key];
    const isPosteriorKey = key === 'Hamstrings' || key === 'Glutes';
    const isPriority = isPosteriorKey ? posteriorPriority : directPrioritySet.has(key);
    let rangeMin;
    let rangeMax;
    let n;
    if (isPosteriorKey && posteriorSplitTarget != null) {
      rangeMin = Math.max(1, Math.round(cfg.priority[0] / 2));
      rangeMax = Math.max(rangeMin, Math.round(cfg.priority[1] / 2));
      n = posteriorSplitTarget;
    } else {
      const [normalMin, normalMax] = cfg.normal;
      rangeMin = isPriority ? cfg.priority[0] : normalMin;
      rangeMax = isPriority ? cfg.priority[1] : normalMax;
      n = chooseTargetInRange(normalMin, normalMax, user, key, false);
      if (isPriority) {
        const rank = Number(directRankMap[key] || 1);
        const scaled = Math.round(n * Number(PRIORITY_ORDER_MULTIPLIER[rank] || 1));
        const bandTarget = chooseTargetInRange(cfg.priority[0], cfg.priority[1], user, key, true) + Number(PRIORITY_ORDER_BAND_OFFSET[rank] || 0);
        n = Math.max(scaled, bandTarget);
      }
    }
    const cap = directTargetCap(key, isPriority);
    targets[key] = Math.max(rangeMin, Math.min(Math.min(cap, rangeMax), n));
    frequencyTargets[key] = resolveDirectFrequencyTarget(key, targets[key], isPriority, user);
  });
  targets.Arms = Number(targets.Biceps || 0) + Number(targets.Triceps || 0);
  targets.Legs = Number(targets.Quads || 0) + Number(targets.Hamstrings || 0) + Number(targets.Glutes || 0);
  targets['Hamstrings/Glutes'] = Number(targets.Hamstrings || 0) + Number(targets.Glutes || 0);
  targets.Abs = Number(targets.Abs || 0);
  targets.Core = Number(targets.Abs || 0);
  frequencyTargets.Arms = Math.max(Number(frequencyTargets.Biceps || 0), Number(frequencyTargets.Triceps || 0));
  frequencyTargets.Legs = Math.max(Number(frequencyTargets.Quads || 0), Number(frequencyTargets.Hamstrings || 0), Number(frequencyTargets.Glutes || 0));
  frequencyTargets['Hamstrings/Glutes'] = Math.max(Number(frequencyTargets.Hamstrings || 0), Number(frequencyTargets.Glutes || 0));
  frequencyTargets.Abs = Number(frequencyTargets.Abs || 0);
  frequencyTargets.Core = Number(frequencyTargets.Abs || 0);
  if (profile.forearmPriorityFlag) {
    targets.Forearms = profile.smallAccessoryRecovery === 'high' ? 6 : 4;
    frequencyTargets.Forearms = Number(user?.daysPerWeek || 0) >= 5 ? 3 : 2;
  } else {
    targets.Forearms = 0;
    frequencyTargets.Forearms = 0;
  }
  targets.Neck = profile.neckEligibleFlag && hasPriorityGroup(user, 'Neck') ? (profile.complexity === 'high' ? 6 : 4) : 0;
  frequencyTargets.Neck = targets.Neck >= 6 ? 3 : targets.Neck >= 4 ? 2 : 0;
  logAbsGlutesLegsComboDebug(user, 'weekly-targets', {
    normalizedPriorityGroups: Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [],
    legsInterpretation: getPriorityGroupStructuralAliases('Legs'),
    targetWeeklySets: {
      Abs: Number(targets.Abs || 0),
      Core: Number(targets.Core || 0),
      Glutes: Number(targets.Glutes || 0),
      Quads: Number(targets.Quads || 0),
      Hamstrings: Number(targets.Hamstrings || 0),
      Calves: Number(targets.Calves || 0)
    },
    targetWeeklyFrequency: {
      Abs: Number(frequencyTargets.Abs || 0),
      Core: Number(frequencyTargets.Core || 0),
      Glutes: Number(frequencyTargets.Glutes || 0),
      Quads: Number(frequencyTargets.Quads || 0),
      Hamstrings: Number(frequencyTargets.Hamstrings || 0),
      Calves: Number(frequencyTargets.Calves || 0)
    }
  });
  if (shouldTrackCalvesComboDiagnostics(user)) {
    emitPlannerDiagnosticHeartbeat(user, 'weekly targets computed', {
      weeklyTargets: {
        targetWeeklySets: {
          Calves: Number(targets.Calves || 0),
          Quads: Number(targets.Quads || 0),
          Hamstrings: Number(targets.Hamstrings || 0),
          Glutes: Number(targets.Glutes || 0),
          Abs: Number(targets.Abs || 0)
        },
        targetWeeklyFrequency: {
          Calves: Number(frequencyTargets.Calves || 0),
          Quads: Number(frequencyTargets.Quads || 0),
          Hamstrings: Number(frequencyTargets.Hamstrings || 0),
          Glutes: Number(frequencyTargets.Glutes || 0),
          Abs: Number(frequencyTargets.Abs || 0)
        }
      },
      calfTargetSets: Number(targets.Calves || 0)
    });
  }
  return { targets, frequencyTargets };
}

function scaleTargets(baseTargets, weekType, blockLength, weekIndex) {
  const src = baseTargets && typeof baseTargets === 'object' ? baseTargets : {};
  let mult = 1.0;
  if (blockLength === 4) {
    if (weekType === 'volume') mult = 1.1;
    if (weekType === 'intensification') mult = 1.15;
  } else {
    if (weekType === 'volume') mult = 1.1;
    if (weekType === 'intensification') mult = 1.15;
  }
  const out = {};
  Object.entries(src).forEach(([muscle, value]) => {
    const n = Math.round((Number(value) || 0) * mult);
    const minClamp = LARGE_MUSCLES.has(muscle) ? 6 : 4;
    out[muscle] = Math.max(minClamp, n);
  });
  return out;
}

function buildSplit(user, forceUpperLower = false) {
  if (String(user?.discipline || '') === 'powerbuilding') {
    return powerbuildingPriority.buildPowerbuildingSplit(user);
  }
  if (String(user?.discipline || '') === 'military') {
    return militaryHybrid.buildMilitarySplit(user);
  }
  const d = user.daysPerWeek;
  const profile = user?.profile || deriveUserProfile(user);
  const lowFreqSmallMuscleBias = d <= 3 && hasPriorityGroup(user, 'Abs') && hasPriorityGroup(user, 'Calves');
  let split = [];
  if (isNarrowBackArmsUser(user)) {
    if (d === 2) split = ['Pull', 'UpperFocus'];
    else if (d === 3) split = ['Pull', 'UpperFocus', 'Pull'];
    else if (d === 4) split = ['Pull', 'UpperFocus', 'Pull', 'Lower'];
    else if (d === 5) split = ['Pull', 'Lower', 'UpperFocus', 'Pull', 'Lower'];
    else split = ['Pull', 'Lower', 'UpperFocus', 'Pull', 'Upper', 'Lower'];
  } else if (isNarrowShouldersArmsUser(user)) {
    if (d === 2) split = ['DeltsArms', 'UpperFocus'];
    else if (d === 3) split = ['DeltsArms', 'UpperFocus', 'DeltsArms'];
    else if (d === 4) split = ['DeltsArms', 'UpperFocus', 'Upper', 'Lower'];
    else if (d === 5) split = ['DeltsArms', 'Lower', 'UpperFocus', 'DeltsArms', 'Upper'];
    else split = ['DeltsArms', 'Lower', 'UpperFocus', 'DeltsArms', 'Upper', 'Lower'];
  } else if (isNarrowChestCoreUser(user)) {
    if (d === 2) split = ['Push', 'UpperFocus'];
    else if (d === 3) split = ['Push', 'UpperFocus', 'Push'];
    else if (d === 4) split = ['Push', 'UpperFocus', 'Lower', 'Push'];
    else if (d === 5) split = ['Push', 'Lower', 'UpperFocus', 'Push', 'Lower'];
    else split = ['Push', 'Lower', 'UpperFocus', 'Push', 'Upper', 'Lower'];
  } else if (isNarrowPosteriorCoreUser(user)) {
    if (d === 2) split = ['LowerFocus', 'FullBodyB'];
    else if (d === 3) split = ['LowerFocus', 'FullBodyB', 'Lower'];
    else if (d === 4) split = ['LowerFocus', 'Upper', 'Lower', 'UpperFocus'];
    else if (d === 5) split = ['LowerFocus', 'Upper', 'Lower', 'FullBodyB', 'UpperFocus'];
    else split = ['LowerFocus', 'Upper', 'Lower', 'FullBodyB', 'UpperFocus', 'Lower'];
  } else if (forceUpperLower && d >= 5) {
    split = ['Upper', 'Lower', 'Upper', 'Lower', ...Array.from({ length: Math.max(0, d - 4) }).map((_, i) => (i % 2 ? 'Lower' : 'Upper'))];
  } else if (lowFreqSmallMuscleBias && d === 2) {
    split = ['FullBodyA', 'FullBodyB'];
  } else if (lowFreqSmallMuscleBias && d === 3) {
    split = ['FullBodyA', 'LowerFocus', 'FullBodyB'];
  } else if (d === 2) {
    split = profile.priorityBias === 'upper'
      ? ['UpperFocus', 'Lower']
      : profile.priorityBias === 'lower'
        ? ['Upper', 'LowerFocus']
        : ['FullBodyA', 'FullBodyB'];
  } else if (d === 3) {
    split = profile.sessionBandwidth === 'tight' || profile.complexity === 'low'
      ? (
        profile.priorityBias === 'upper'
          ? ['FullBodyA', 'UpperFocus', 'FullBodyB']
          : profile.priorityBias === 'lower'
            ? ['LowerFocus', 'FullBodyA', 'FullBodyB']
            : ['FullBodyA', 'FullBodyB', 'FullBodyA']
      )
      : profile.priorityBias === 'lower'
        ? ['LowerFocus', 'Upper', 'Lower']
        : profile.priorityBias === 'upper'
          ? ['Push', 'Pull', 'UpperFocus']
          : ['Push', 'Pull', 'Legs'];
  } else if (d === 4) {
    split = profile.priorityBias === 'lower'
      ? ['Upper', 'LowerFocus', 'Upper', 'Lower']
      : profile.priorityBias === 'upper'
        ? ['Push', 'Pull', profile.specializationLevel === 'high' ? 'DeltsArms' : 'UpperFocus', 'Lower']
        : profile.complexity === 'high' && profile.sessionBandwidth !== 'tight'
          ? ['Push', 'Pull', 'Upper', 'Lower']
          : ['Upper', 'Lower', 'Upper', 'Lower'];
  } else if (d === 5) {
    split = profile.priorityBias === 'lower'
      ? ['Push', 'Pull', 'LowerFocus', 'Upper', 'Lower']
      : profile.priorityBias === 'upper'
        ? ['Push', 'Pull', 'Legs', 'UpperFocus', 'DeltsArms']
        : ['Push', 'Pull', 'Legs', 'Upper', 'Lower'];
  } else {
    split = profile.priorityBias === 'lower'
      ? ['Push', 'Pull', 'Lower', 'Upper', 'LowerFocus', 'DeltsArms']
      : profile.priorityBias === 'upper'
        ? ['Push', 'Pull', 'Legs', 'DeltsArms', 'UpperFocus', 'Lower']
        : ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'DeltsArms'];
  }
  const days = user.preferredDays.length === d ? user.preferredDays.slice(0, d) : WEEKDAY_DEFAULT_ORDER.slice(0, d);
  return split.map((dayType, i) => ({ day: days[i], dayType }));
}

function makeSlot(id, pattern, styleRequired, muscleTarget, opts = {}) {
  return {
    id,
    pattern,
    styleRequired,
    muscleTarget,
    primaryAllowed: opts.primaryAllowed || null,
    subPreferred: opts.subPreferred || null,
    subFallback: opts.subFallback || null,
    optional: Boolean(opts.optional),
    notes: opts.notes || ''
  };
}

function priorityRankForGroup(user, group) {
  const ranking = Array.isArray(user?.profile?.priorityRanking) ? user.profile.priorityRanking : (Array.isArray(user?.priorityGroups) ? user.priorityGroups : []);
  const idx = ranking.findIndex((entry) => priorityGroupsOverlap(entry, group));
  return idx >= 0 ? idx + 1 : 99;
}

function countBlueprintSlots(slots, predicate) {
  return (Array.isArray(slots) ? slots : []).filter((slot) => predicate(slot)).length;
}

/* A day can hold at most one isolation exercise per movement family - fillSlots
   rejects a second same-family pick, and rear delts are additionally capped at
   one per day. Shoulders only has two named isolation families (lateral_raise,
   rear_delt), so a day can never carry more than two shoulder isolation slots.
   The region-exact priority slots below duplicate a region the base blueprint
   already covers (push_sh_iso is Lateral, pull_rear_iso is Rear), which pushes
   those days to three. On plans of 3 days or fewer those slots are REQUIRED, so
   the unfillable third turns a good plan into NO_ELIGIBLE_EXERCISE, ten failed
   attempts, and a safe-fallback plan.

   When the day is already at capacity for a muscle, sharpen the existing slot's
   region preference instead of adding a slot that cannot be filled. The region
   guarantee is preserved and no prescribed volume is lost - weekly sets are
   distributed by allocateSetsReps across whatever slots exist.

   Capacity is counted per REGION GROUP, not per muscle: a Push day carries both
   a triceps and (on Upper/DeltsArms) a biceps slot, and sharpening a biceps slot
   with a triceps region would be worse than the duplicate. Only slots competing
   for the same pool count toward capacity, and only they are candidates to
   sharpen. */
const REGION_GROUPS = [
  ['Lateral', 'Rear', 'Front'],
  ['Triceps-Pushdown', 'Triceps-Long', 'Triceps-Lateral', 'Triceps-Overhead'],
  ['Biceps-Long', 'Biceps-Short']
];
// Distinct isolation families the selector can draw on for one region group in a
// single day (fillSlots allows one exercise per family, rear delts one per day).
const REGION_GROUP_CAPACITY = 2;

function regionGroupFor(region) {
  return REGION_GROUPS.find((group) => group.includes(region)) || [region];
}

function ensureRegionExactSlot(slots, addPrioritySlot, id, muscleTarget, region, opts = {}) {
  // Only intervene when the slot is REQUIRED, which is the <=3-day case. On a
  // 4+ day plan these slots are optional, so an unfillable one is skipped
  // harmlessly and the day is unaffected - reconciling there would trade a real
  // exercise for nothing and change output that was never broken.
  if (opts.optional !== false) {
    addPrioritySlot(id, 'Isolation', 'Isolation', muscleTarget, opts);
    return;
  }
  const group = regionGroupFor(region);
  const existing = (Array.isArray(slots) ? slots : []).filter((slot) => {
    if (String(slot?.muscleTarget || '') !== muscleTarget) return false;
    if (String(slot?.styleRequired || '') !== 'Isolation') return false;
    const prefs = Array.isArray(slot?.subPreferred) ? slot.subPreferred : [];
    // An unconstrained slot competes for every pool this muscle can draw from.
    return !prefs.length || prefs.some((pref) => group.includes(pref));
  });
  if (existing.length < REGION_GROUP_CAPACITY) {
    addPrioritySlot(id, 'Isolation', 'Isolation', muscleTarget, opts);
    return;
  }
  // A slot whose top preference is a DIFFERENT region of the same group has
  // already been claimed - by the day's own blueprint or by an earlier call
  // here. Sharpening it again would silently trade one region for another
  // (a Push/UpperFocus day losing its lateral raise so a rear delt can land),
  // so leave it alone. When every candidate is claimed the group is genuinely
  // at capacity and the region is already covered by its siblings.
  const claimed = (slot) => {
    const top = Array.isArray(slot?.subPreferred) ? slot.subPreferred[0] : null;
    return Boolean(top) && top !== region && group.includes(top);
  };
  const open = existing.filter((slot) => !claimed(slot));
  if (!open.length) return;
  // Prefer sharpening a slot the day must fill, so the region guarantee lands
  // somewhere that actually gets picked. Never promote an optional slot to
  // required: the muscle's required-ness is already carried by the general
  // *_priority slot, and forcing a deliberately-optional slot (pull_rear_iso
  // shares its pool with Back) just moves the unfillable-slot failure earlier.
  const byPreference = [
    open.find((slot) => !slot?.optional && Array.isArray(slot?.subPreferred) && slot.subPreferred.includes(region)),
    open.find((slot) => !slot?.optional && (!Array.isArray(slot?.subPreferred) || !slot.subPreferred.length)),
    open.find((slot) => Array.isArray(slot?.subPreferred) && slot.subPreferred.includes(region)),
    open.find((slot) => !Array.isArray(slot?.subPreferred) || !slot.subPreferred.length)
  ];
  const covering = byPreference.find(Boolean);
  if (!covering) return;
  const rest = (Array.isArray(covering.subPreferred) ? covering.subPreferred : []).filter((value) => value !== region);
  covering.subPreferred = [region, ...rest];
}

function appendExactPrioritySlots(slots, dayType, user, addPrioritySlot, priorityOptional, hasDedicatedCoreAccess, hasUpperLimbConstraint) {
  const priorities = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  const day = String(dayType || '');
  const dayCount = Number(user?.daysPerWeek || 0);
  const shoulderRank = priorityRankForGroup(user, 'Shoulders');
  const armRank = priorityRankForGroup(user, 'Arms');
  const absRank = priorityRankForGroup(user, 'Abs');

  if (hasPriorityGroup(priorities, 'Shoulders') && ['Push', 'Pull', 'Upper', 'UpperFocus', 'DeltsArms'].includes(day)) {
    if (['Push', 'Upper', 'UpperFocus', 'DeltsArms'].includes(day)) {
      ensureRegionExactSlot(slots, addPrioritySlot, `${day.toLowerCase()}_shoulder_lat_exact`, 'Shoulders', 'Lateral', {
        primaryAllowed: ['Shoulders'],
        subPreferred: ['Lateral'],
        optional: priorityOptional('Shoulders', true) || hasUpperLimbConstraint
      });
    }
    if (['Pull', 'Upper', 'UpperFocus', 'DeltsArms'].includes(day)) {
      ensureRegionExactSlot(slots, addPrioritySlot, `${day.toLowerCase()}_shoulder_rear_exact`, 'Shoulders', 'Rear', {
        primaryAllowed: ['Shoulders'],
        subPreferred: ['Rear'],
        optional: priorityOptional('Shoulders', true) || hasUpperLimbConstraint
      });
    }
  }

  if (hasPriorityGroup(priorities, 'Arms')) {
    if (['Pull', 'Upper', 'UpperFocus', 'DeltsArms'].includes(day)) {
      ensureRegionExactSlot(slots, addPrioritySlot, `${day.toLowerCase()}_biceps_exact`, 'Arms', 'Biceps-Long', {
        primaryAllowed: ['Arms'],
        subPreferred: ['Biceps-Long', 'Biceps-Short'],
        optional: priorityOptional('Arms', true) || hasUpperLimbConstraint
      });
    }
    if (day === 'Push') {
      ensureRegionExactSlot(slots, addPrioritySlot, `${day.toLowerCase()}_triceps_pushdown_exact`, 'Arms', 'Triceps-Pushdown', {
        primaryAllowed: ['Arms'],
        subPreferred: ['Triceps-Pushdown', 'Triceps-Lateral', 'Triceps-Long'],
        optional: priorityOptional('Arms', true) || hasUpperLimbConstraint
      });
    }
    if (['Upper', 'UpperFocus', 'DeltsArms'].includes(day)) {
      const tricepsPref = day === 'UpperFocus'
        ? ['Triceps-Overhead', 'Triceps-Long', 'Triceps-Pushdown']
        : ['Triceps-Pushdown', 'Triceps-Overhead', 'Triceps-Lateral'];
      ensureRegionExactSlot(slots, addPrioritySlot, `${day.toLowerCase()}_triceps_exact`, 'Arms', tricepsPref[0], {
        primaryAllowed: ['Arms'],
        subPreferred: tricepsPref,
        optional: priorityOptional('Arms', true) || hasUpperLimbConstraint
      });
    }
  }

  if (hasPriorityGroup(priorities, 'Abs') && hasDedicatedCoreAccess && ['Push', 'Pull', 'Legs', 'Upper', 'UpperFocus', 'DeltsArms', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB'].includes(day)) {
    const existingCore = countBlueprintSlots(slots, (slot) => String(slot?.muscleTarget || '') === 'Core');
    if (['FullBodyB', 'Legs', 'UpperFocus'].includes(day) && existingCore >= 2) return;
    const preferRotation = ['Pull', 'Upper', 'DeltsArms'].includes(day);
    const preferStability = ['Legs', 'Lower', 'LowerFocus', 'FullBodyB'].includes(day);
    const pattern = preferRotation ? 'CoreRotation' : preferStability ? 'CoreStability' : 'CoreFlexion';
    const subPreferred = pattern === 'CoreRotation'
      ? ['Obliques', 'TVA']
      : pattern === 'CoreStability'
        ? ['TVA', 'LowerAbs']
        : ['Abs-Lower', 'Abs-Upper'];
    addPrioritySlot(`${day.toLowerCase()}_abs_exact_${existingCore}`, pattern, 'Isolation', 'Core', {
      primaryAllowed: ['Core'],
      subPreferred,
      optional: priorityOptional('Core', true)
    });
  }

  if (hasPriorityGroup(priorities, 'Quads') && ['Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB'].includes(day)) {
    addPrioritySlot(`${day.toLowerCase()}_quads_exact`, 'Isolation', 'Isolation', 'Legs', {
      primaryAllowed: ['Legs'],
      subPreferred: ['Quads'],
      optional: priorityOptional('Legs', true)
    });
  }

  if (hasPriorityGroup(priorities, 'Hamstrings/Glutes') && ['Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB'].includes(day)) {
    addPrioritySlot(`${day.toLowerCase()}_hamstrings_exact`, 'Isolation', 'Isolation', 'Legs', {
      primaryAllowed: ['Legs'],
      subPreferred: ['Hamstrings-Curl'],
      optional: priorityOptional('Glutes', true)
    });
    addPrioritySlot(`${day.toLowerCase()}_glutes_exact`, 'Isolation', 'Isolation', 'Glutes', {
      primaryAllowed: ['Glutes', 'Legs'],
      subPreferred: ['Glutes'],
      optional: priorityOptional('Glutes', true)
    });
  }

  if (hasPriorityGroup(priorities, 'Calves') && ['Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB', 'UpperFocus'].includes(day)) {
    addPrioritySlot(`${day.toLowerCase()}_calves_exact`, 'Isolation', 'Isolation', 'Calves', {
      primaryAllowed: ['Legs'],
      subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
      optional: priorityOptional('Calves', true)
    });
  }
}

function buildDayBlueprint(dayType, user, weekType, opts = {}) {
  const slots = [];
  const constrainedRebuild = Boolean(opts?.constrainedRebuild);
  const prioritySet = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  const isLowFrequencyPriorityPlan = Number(user?.daysPerWeek || 0) <= 3;
  const hasUpperLimbConstraint = Math.max(
    Number(user?.injuryMap?.shoulder || 0),
    Number(user?.injuryMap?.elbow || 0),
    Number(user?.injuryMap?.wrist || 0)
  ) >= 6;
  const hasDedicatedCoreAccess = (user?.allowedEquipment || []).some((token) => ['bodyweight', 'cable', 'machine', 'pullup_bar'].includes(String(token || '')));
  if (dayType === 'FullBodyA') {
    slots.push(makeSlot('fba_hp', 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('fba_hpull', 'HorizontalPull', 'Compound', 'Back', { primaryAllowed: ['Back'] }));
    slots.push(makeSlot('fba_squat', 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads'] }));
    slots.push(makeSlot('fba_shoulders', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral'], optional: !(isLowFrequencyPriorityPlan && hasPriorityGroup(prioritySet, 'Shoulders')) || hasUpperLimbConstraint }));
    slots.push(makeSlot('fba_arms', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], optional: !(isLowFrequencyPriorityPlan && hasPriorityGroup(prioritySet, 'Arms')) || hasUpperLimbConstraint }));
    slots.push(makeSlot('fba_core', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], optional: !(isLowFrequencyPriorityPlan && hasPriorityGroup(prioritySet, 'Abs')) || !hasDedicatedCoreAccess }));
  } else if (dayType === 'FullBodyB') {
    slots.push(makeSlot('fbb_vpull', 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'] }));
    slots.push(makeSlot('fbb_hinge', 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Hamstrings-Hinge', 'Glutes'] }));
    slots.push(makeSlot('fbb_press', 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('fbb_leg_iso', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs', 'Glutes'], optional: true }));
    slots.push(makeSlot('fbb_calf', 'Isolation', 'Isolation', 'Calves', { primaryAllowed: ['Legs'], subPreferred: ['Calves'], optional: !(isLowFrequencyPriorityPlan && hasPriorityGroup(prioritySet, 'Calves')) }));
    slots.push(makeSlot('fbb_core', 'CoreStability', 'Isolation', 'Core', { primaryAllowed: ['Core'], optional: !(isLowFrequencyPriorityPlan && hasPriorityGroup(prioritySet, 'Abs')) || !hasDedicatedCoreAccess }));
  } else if (dayType === 'UpperFocus') {
    slots.push(makeSlot('uf_hp', 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('uf_hpull', 'HorizontalPull', 'Compound', 'Back', { primaryAllowed: ['Back'] }));
    slots.push(makeSlot('uf_vpull', 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], optional: true }));
    slots.push(makeSlot('uf_ch_iso', 'Isolation', 'Isolation', 'Chest', { primaryAllowed: ['Chest'], optional: true }));
    slots.push(makeSlot('uf_sh_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral'], optional: (!(hasPriorityGroup(prioritySet, 'Shoulders') || hasPriorityGroup(prioritySet, 'Chest') || isLowFrequencyPriorityPlan)) || hasUpperLimbConstraint }));
    slots.push(makeSlot('uf_bi_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: (!(hasPriorityGroup(prioritySet, 'Arms') && isLowFrequencyPriorityPlan)) || hasUpperLimbConstraint }));
    slots.push(makeSlot('uf_tri_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'], optional: (!(hasPriorityGroup(prioritySet, 'Arms') && isLowFrequencyPriorityPlan)) || hasUpperLimbConstraint }));
    slots.push(makeSlot('uf_core', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], optional: (!(hasPriorityGroup(prioritySet, 'Abs') && isLowFrequencyPriorityPlan)) || !hasDedicatedCoreAccess }));
  } else if (dayType === 'LowerFocus') {
    slots.push(makeSlot('lf_squat', 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads'] }));
    slots.push(makeSlot('lf_hinge', 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Hamstrings-Hinge', 'Glutes'] }));
    slots.push(makeSlot('lf_leg_iso', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads', 'Hamstrings-Curl'] }));
    slots.push(makeSlot('lf_glute_iso', 'Isolation', 'Isolation', 'Glutes', { primaryAllowed: ['Glutes', 'Legs'], subPreferred: ['Glutes'], optional: true }));
    slots.push(makeSlot('lf_calf', 'Isolation', 'Isolation', 'Calves', { primaryAllowed: ['Legs'], subPreferred: ['Calves'] }));
    slots.push(makeSlot('lf_core', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], optional: true }));
  } else if (dayType === 'Push') {
    slots.push(makeSlot('push_hp', 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('push_vp', 'VerticalPush', 'Compound', 'Shoulders', { primaryAllowed: ['Shoulders'] }));
    slots.push(makeSlot('push_ch_iso', 'Isolation', 'Isolation', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('push_sh_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral'] }));
    slots.push(makeSlot('push_tri_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'] }));
    slots.push(makeSlot('push_core_opt', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], subPreferred: ['Abs-Lower', 'Abs-Upper'], optional: true }));
  } else if (dayType === 'Pull') {
    slots.push(makeSlot('pull_vpull', 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], subPreferred: ['Lats-Width'] }));
    slots.push(makeSlot('pull_hpull', 'HorizontalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], subPreferred: ['Lats-Thickness', 'UpperBack'] }));
    slots.push(makeSlot('pull_rear_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders', 'Back'], subPreferred: ['Rear', 'UpperBack'], optional: true }));
    slots.push(makeSlot('pull_bi_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'] }));
    slots.push(makeSlot('pull_core_rot', 'CoreRotation', 'Isolation', 'Core', { primaryAllowed: ['Core'], subPreferred: ['Obliques', 'Abs-Lower'], optional: true }));
  } else if (dayType === 'Legs') {
    slots.push(makeSlot('legs_squat', 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads'] }));
    slots.push(makeSlot('legs_hinge', 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Hamstrings-Hinge', 'Glutes'] }));
    slots.push(makeSlot('legs_iso', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Quads', 'Hamstrings-Curl'] }));
    slots.push(makeSlot('legs_calf', 'Isolation', 'Isolation', 'Calves', { primaryAllowed: ['Legs'], subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'] }));
    slots.push(makeSlot('legs_lunge_opt', 'Lunge', 'Compound', 'Legs', { optional: true }));
    slots.push(makeSlot('legs_core_opt', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], subPreferred: ['Abs-Lower', 'Abs-Upper'] }));
  } else if (dayType === 'DeltsArms') {
    slots.push(makeSlot('da_vp', 'VerticalPush', 'Compound', 'Shoulders', { primaryAllowed: ['Shoulders'] }));
    slots.push(makeSlot('da_side_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral'] }));
    slots.push(makeSlot('da_rear_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Rear'] }));
    slots.push(makeSlot('da_bi_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'] }));
    slots.push(makeSlot('da_tri_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'] }));
    slots.push(makeSlot('da_core_opt', 'CoreStability', 'Isolation', 'Core', { primaryAllowed: ['Core'], subPreferred: ['Obliques', 'Abs-Lower'], optional: true }));
  } else if (dayType === 'Upper') {
    slots.push(makeSlot('upper_hp', 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('upper_hpull', 'HorizontalPull', 'Compound', 'Back', { primaryAllowed: ['Back'] }));
    slots.push(makeSlot('upper_v_any', 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], optional: true }));
    slots.push(makeSlot('upper_sh_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral'] }));
    slots.push(makeSlot('upper_core', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], subPreferred: ['Abs-Lower', 'Abs-Upper'], optional: true }));
  } else if (dayType === 'Lower') {
    slots.push(makeSlot('lower_squat', 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads'] }));
    slots.push(makeSlot('lower_ham_curl', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Hamstrings-Curl'] }));
    slots.push(makeSlot('lower_iso', 'Isolation', 'Isolation', 'Glutes', { primaryAllowed: ['Glutes', 'Legs'], subPreferred: ['Glutes'] }));
    slots.push(makeSlot('lower_calf', 'Isolation', 'Isolation', 'Calves', { primaryAllowed: ['Legs'], subPreferred: ['Calves'] }));
    slots.push(makeSlot('lower_core', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], subPreferred: ['Abs-Lower', 'Abs-Upper'], optional: true }));
  }

  if (user.discipline === 'powerbuilding') {
    const nextSlots = powerbuildingPriority.applyPowerbuildingBlueprint(dayType, user, slots, makeSlot);
    slots.length = 0;
    slots.push(...nextSlots);
  }
  if (user.discipline === 'military') {
    const nextSlots = militaryHybrid.applyMilitaryBlueprint(dayType, user, slots, makeSlot);
    slots.length = 0;
    slots.push(...nextSlots);
  }
  if (
    hasPriorityGroup(user, 'Hamstrings/Glutes')
    && ['Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB'].includes(dayType)
    && !slots.some((s) => s.id.includes('glute'))
  ) {
    slots.push(makeSlot(`${dayType.toLowerCase()}_glute_addon`, 'Isolation', 'Isolation', 'Glutes', { primaryAllowed: ['Glutes', 'Legs'], subPreferred: ['Glutes'], optional: true }));
  }

  const addPrioritySlot = (id, pattern, styleRequired, muscleTarget, opts = {}) => {
    if (slots.some((s) => s.id === id)) return;
    slots.push(makeSlot(id, pattern, styleRequired, muscleTarget, opts));
  };
  const priorityOptional = (muscleTarget, baseOptional = true) => {
    if (hasUpperLimbConstraint && ['Arms', 'Shoulders'].includes(String(muscleTarget || ''))) return true;
    if (!hasDedicatedCoreAccess && String(muscleTarget || '') === 'Core') return true;
    if (!isLowFrequencyPriorityPlan) return baseOptional;
    if (String(muscleTarget || '') === 'Core' && hasPriorityGroup(prioritySet, 'Abs')) return false;
    if (['Arms', 'Shoulders', 'Calves'].includes(String(muscleTarget || '')) && hasPriorityGroup(prioritySet, muscleTarget)) return false;
    return baseOptional;
  };
  if (hasPriorityGroup(prioritySet, 'Chest') && (dayType === 'Push' || dayType === 'Upper')) {
    addPrioritySlot(`${dayType.toLowerCase()}_chest_priority`, 'Isolation', 'Isolation', 'Chest', { primaryAllowed: ['Chest'], optional: true });
  }
  if (hasPriorityGroup(prioritySet, 'Chest') && isLowFrequencyPriorityPlan && ['FullBodyA', 'FullBodyB', 'UpperFocus'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_chest_priority`, 'Isolation', 'Isolation', 'Chest', {
      primaryAllowed: ['Chest'],
      optional: hasUpperLimbConstraint || dayType === 'FullBodyB'
    });
  }
  if (hasPriorityGroup(prioritySet, 'Shoulders') && (dayType === 'Push' || dayType === 'Pull' || dayType === 'Upper' || dayType === 'DeltsArms')) {
    const shoulderPref = dayType === 'Pull' ? ['Rear'] : ['Lateral', 'Rear'];
    addPrioritySlot(`${dayType.toLowerCase()}_shoulder_priority`, 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: shoulderPref, optional: priorityOptional('Shoulders', true) });
  }
  if (hasPriorityGroup(prioritySet, 'Shoulders') && isLowFrequencyPriorityPlan && ['FullBodyA', 'FullBodyB', 'UpperFocus'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_shoulder_priority`, 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral', 'Rear'], optional: hasUpperLimbConstraint });
  }
  if (hasPriorityGroup(prioritySet, 'Arms') && (dayType === 'Push' || dayType === 'Pull' || dayType === 'Upper')) {
    if (dayType === 'Push') {
      addPrioritySlot(`${dayType.toLowerCase()}_tri_priority`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'], optional: priorityOptional('Arms', true) });
    } else if (dayType === 'Pull') {
      addPrioritySlot(`${dayType.toLowerCase()}_bi_priority`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: priorityOptional('Arms', true) });
    } else {
      addPrioritySlot(`${dayType.toLowerCase()}_arms_priority_bi`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: priorityOptional('Arms', true) });
      addPrioritySlot(`${dayType.toLowerCase()}_arms_priority_tri`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'], optional: priorityOptional('Arms', true) });
    }
  }
  if (hasPriorityGroup(prioritySet, 'Arms') && isLowFrequencyPriorityPlan && ['FullBodyA', 'FullBodyB', 'UpperFocus'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_arms_priority`, 'Isolation', 'Isolation', 'Arms', {
      primaryAllowed: ['Arms'],
      subPreferred: dayType === 'FullBodyB' ? ['Biceps-Long', 'Biceps-Short'] : ['Triceps-Long', 'Biceps-Long', 'Triceps-Lateral'],
      optional: hasUpperLimbConstraint
    });
  }
  if (hasPriorityGroup(prioritySet, 'Back') && (dayType === 'Pull' || dayType === 'Upper')) {
    addPrioritySlot(`${dayType.toLowerCase()}_back_priority`, dayType === 'Pull' ? 'HorizontalPull' : 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], optional: true });
  }
  if (hasPriorityGroup(prioritySet, 'Abs') && !slots.some((s) => s.id.includes('core_priority'))) {
    const existingCorePatterns = new Set(slots.filter((s) => s.muscleTarget === 'Core').map((s) => s.pattern));
    const preferredCorePatterns = ['Pull', 'Upper', 'DeltsArms'].includes(dayType)
      ? ['CoreRotation', 'CoreFlexion', 'CoreStability']
      : ['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(dayType)
        ? ['CoreStability', 'CoreRotation', 'CoreFlexion']
        : ['CoreFlexion', 'CoreRotation', 'CoreStability'];
    const corePattern = preferredCorePatterns.find((pattern) => !existingCorePatterns.has(pattern)) || preferredCorePatterns[0];
    const isPrimaryCoreAllocationDay = Number(user?.daysPerWeek || 0) >= 5
      ? ['Push', 'Pull', 'Legs'].includes(dayType)
      : ['Push', 'Pull', 'Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB', 'Upper'].includes(dayType);
    const canForceDedicatedCoreSlot = !user?.profile?.minimalEquipmentAccessoryMode
      && user?.profile?.constraintSeverity !== 'high'
      && user?.profile?.sessionBandwidth !== 'tight';
    const coreSub = corePattern === 'CoreRotation'
      ? ['Obliques', 'TVA']
      : corePattern === 'CoreStability'
        ? ['TVA', 'LowerAbs']
        : ['LowerAbs', 'UpperAbs'];
    addPrioritySlot(`${dayType.toLowerCase()}_core_priority`, corePattern, 'Isolation', 'Core', {
      primaryAllowed: ['Core'],
      subPreferred: coreSub,
      optional: !(
        isPrimaryCoreAllocationDay
        && user?.profile?.coreDiversityNeed >= 3
        && canForceDedicatedCoreSlot
      ) || !hasDedicatedCoreAccess
    });
  }
  if (hasPriorityGroup(prioritySet, 'Quads') && ['Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_legs_priority`, 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads'], optional: true });
  }
  if (hasPriorityGroup(prioritySet, 'Calves') && ['Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB', 'UpperFocus'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_calves_priority`, 'Isolation', 'Isolation', 'Calves', {
      primaryAllowed: ['Legs'],
      subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
      optional: Number(user?.daysPerWeek || 0) > 3 ? !['Legs', 'Lower', 'LowerFocus'].includes(dayType) : false
    });
  }
  appendExactPrioritySlots(slots, dayType, user, addPrioritySlot, priorityOptional, hasDedicatedCoreAccess, hasUpperLimbConstraint);
  if (user?.profile?.forearmPriorityFlag && ['Pull', 'Upper', 'UpperFocus', 'DeltsArms'].includes(dayType)) {
    const forearmSub = dayType === 'Pull' ? ['Brachioradialis', 'Extensors', 'Grip'] : ['Flexors', 'Extensors', 'Grip'];
    addPrioritySlot(`${dayType.toLowerCase()}_forearm_priority`, 'Isolation', 'Isolation', 'Forearms', { primaryAllowed: ['Forearms', 'Arms'], subPreferred: forearmSub, optional: true });
  }
  if (hasPriorityGroup(prioritySet, 'Neck') && user?.profile?.neckEligibleFlag && ['Upper', 'UpperFocus', 'Pull', 'DeltsArms'].includes(dayType)) {
    const neckSub = dayType === 'Pull' ? ['Extensors', 'LateralFlexors'] : dayType === 'DeltsArms' ? ['LateralFlexors'] : ['Flexors', 'Extensors'];
    addPrioritySlot(`${dayType.toLowerCase()}_neck_priority`, 'Isolation', 'Isolation', 'Neck', {
      primaryAllowed: ['Neck'],
      subPreferred: neckSub,
      optional: !(user?.profile?.complexity === 'high' && user?.profile?.sessionBandwidth !== 'tight')
    });
  }
  if (user?.profile?.priorityBias === 'upper' && !hasPriorityGroup(prioritySet, 'Quads') && !hasPriorityGroup(prioritySet, 'Hamstrings/Glutes')) {
    if (dayType === 'Legs') {
      slots.forEach((slot) => {
        if (['legs_iso', 'legs_calf', 'legs_lunge_opt', 'legs_core_opt'].includes(slot.id)) slot.optional = true;
      });
    }
    if (dayType === 'Lower') {
      slots.forEach((slot) => {
        if (['lower_iso', 'lower_calf', 'lower_core'].includes(slot.id)) slot.optional = true;
      });
    }
    if (dayType === 'LowerFocus') {
      slots.forEach((slot) => {
        if (['lf_glute_iso', 'lf_calf', 'lf_core'].includes(slot.id)) slot.optional = true;
      });
    }
  }

  if (user?.profile?.sessionBandwidth === 'tight') {
    for (let i = 0; i < slots.length; i += 1) {
      if (i >= 3) slots[i].optional = true;
    }
  }
  if (constrainedRebuild) {
    const requiredPriorityMuscles = new Set();
    let preservedCompounds = 0;
    const compoundTarget = ['FullBodyA', 'FullBodyB', 'LowerFocus', 'Legs'].includes(dayType) ? 3 : 2;
    for (const slot of slots) {
      let required = false;
      if (String(slot.styleRequired || '') === 'Compound' && preservedCompounds < compoundTarget) {
        required = true;
        preservedCompounds += 1;
      }
      if (hasPriorityGroup(prioritySet, slot.muscleTarget) && !requiredPriorityMuscles.has(slot.muscleTarget)) {
        const blockedByConstraint = (hasUpperLimbConstraint && ['Arms', 'Shoulders'].includes(String(slot.muscleTarget || '')))
          || (!hasDedicatedCoreAccess && String(slot.muscleTarget || '') === 'Core');
        if (!blockedByConstraint) {
          required = true;
          requiredPriorityMuscles.add(slot.muscleTarget);
        }
      }
      if (isLowFrequencyPriorityPlan && hasPriorityGroup(prioritySet, 'Calves') && slot.muscleTarget === 'Calves') required = true;
      if (isLowFrequencyPriorityPlan && hasPriorityGroup(prioritySet, 'Abs') && slot.muscleTarget === 'Core' && hasDedicatedCoreAccess) required = true;
      if (slot.muscleTarget === 'Neck' || slot.muscleTarget === 'Forearms') required = false;
      slot.optional = !required;
    }
  }
  const calfSlots = slots.filter((slot) => slot.muscleTarget === 'Calves');
  const coreSlots = slots.filter((slot) => slot.muscleTarget === 'Core');
  if (calfSlots.length) {
    recordPriorityDebug(user, 'calf', 'reservedSlots', {
      stage: 'blueprint',
      dayType,
      weekType,
      slotIds: calfSlots.map((slot) => slot.id),
      required: calfSlots.some((slot) => !slot.optional)
    });
  }
  if (coreSlots.length) {
    recordPriorityDebug(user, 'abs', 'reservedSlots', {
      stage: 'blueprint',
      dayType,
      weekType,
      slotIds: coreSlots.map((slot) => slot.id),
      required: coreSlots.some((slot) => !slot.optional)
    });
  }
  if (weekType === 'deload') return slots;
  return slots;
}

function buildWeekBlueprint(discipline, split, user, weekType, opts = {}) {
  return split.map((s) => ({ day: s.day, dayType: s.dayType, slots: buildDayBlueprint(s.dayType, user, weekType, opts), discipline }));
}

function matchesAvoid(nameLower, tokens) {
  for (const token of tokens) {
    if (token.includes(' ')) {
      if (nameLower.includes(token)) return true;
    } else {
      const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(nameLower)) return true;
    }
  }
  return false;
}

function evaluateJoint(ex, user) {
  const name = normalizeName(ex?.name);
  let reject = false;
  let penalty = 0;
  const noteFlags = user?.injuryNoteFlags || {};
  const truth = ex?.canonicalTruth || buildExerciseTruth(ex, user);
  const movementTags = Array.isArray(ex?.movementTags) ? ex.movementTags.map((tag) => String(tag || '').toLowerCase()) : [];
  const hasFreeWeightTag = movementTags.includes('freeweight');
  const hasSupportedTag = movementTags.includes('supported') || movementTags.includes('machinestable');
  for (const joint of ['spine', 'knee', 'hip', 'shoulder', 'elbow']) {
    const sev = Number(user.injuryMap?.[joint] || 0);
    const stress = Number(ex?.[joint] || 0);
    if (!sev) continue;
    if (sev >= 7) {
      if (stress === 3) reject = true;
      if (stress === 2) penalty += 10;
    } else if (sev >= 5) {
      if (stress === 3) reject = true;
      if (stress === 2) penalty += 6;
    } else if (stress === 3) penalty += 4;
  }
  const wrist = Number(user.injuryMap?.wrist || user.injuryMap?.Wrist || 0);
  if (wrist >= 7) {
    if (Number(ex.elbow) === 3 || Number(ex.shoulder) === 3) reject = true;
    if (Number(ex.elbow) === 2 || Number(ex.shoulder) === 2) penalty += 12;
  } else if (wrist >= 5) {
    if (Number(ex.elbow) === 3) reject = true;
    if (Number(ex.elbow) === 2) penalty += 7;
  }
  if (wrist >= 5 || noteFlags.straightBarIntolerance || noteFlags.wristExtensionIntolerance || noteFlags.avoidStraightBar || noteFlags.avoidWristExtension) {
    if (truth.straightBar || truth.wristExtensionHeavy) reject = true;
    if ((noteFlags.preferNeutralGrip || noteFlags.avoidStraightBar || noteFlags.avoidWristExtension) && !truth.neutralGripFriendly && (truth.straightBar || truth.shoulderPressPattern)) penalty += 10;
  }
  const shoulder = Number(user.injuryMap?.shoulder || 0);
  if (shoulder >= 7 && /\b(overhead press|shoulder press|military press|upright row|dip|behind neck)\b/.test(name)) reject = true;
  else if (shoulder >= 5 && /\b(overhead press|shoulder press|military press|upright row)\b/.test(name)) penalty += 10;
  if ((noteFlags.avoidOverheadVolume || noteFlags.avoidDeepStretchPressing) && truth.shoulderOverhead) reject = true;
  const elbow = Number(user.injuryMap?.elbow || 0);
  if (elbow >= 7 && /\b(skull crusher|crusher|overhead triceps|barbell curl)\b/.test(name)) reject = true;
  else if (elbow >= 5 && /\b(skull crusher|crusher|overhead triceps)\b/.test(name)) penalty += 8;
  if (noteFlags.avoidAggressiveSupination && truth.elbowSupinationStress) reject = true;
  if (noteFlags.avoidSkullcrusherPatterns && truth.skullcrusherLike) reject = true;
  const knee = Number(user.injuryMap?.knee || 0);
  const hip = Number(user.injuryMap?.hip || 0);
  if (knee >= 7 && /\b(sissy squat|walking lunge|jump squat|pistol squat)\b/.test(name)) reject = true;
  if ((knee >= 5 || noteFlags.deepKneeFlexionIntolerance || noteFlags.forwardKneeTravelIntolerance || noteFlags.ankleKneeForwardIntolerance || noteFlags.avoidForwardKneeTravel)
    && truth.forwardKneeTravelHigh) reject = true;
  if ((knee >= 5 || noteFlags.deepKneeFlexionIntolerance || noteFlags.forwardKneeTravelIntolerance || noteFlags.ankleKneeForwardIntolerance || noteFlags.avoidDeepKneeFlexion)
    && truth.deepKneeFlexionHigh) reject = true;
  const spine = Number(user.injuryMap?.spine || 0);
  if (spine >= 7 && /\b(good morning|conventional deadlift|stiff leg deadlift)\b/.test(name)) reject = true;
  if ((noteFlags.avoidHeavyAxialLoad && truth.axialLoadHigh) || (noteFlags.avoidFloorDeadliftPattern && isHeavyDeadliftPatternName(name))) reject = true;
  if ((noteFlags.avoidDeepHipFlexion || hip >= 5) && truth.deepHipFlexionHigh) reject = true;
  if ((noteFlags.avoidHeavyAxialLoad || noteFlags.avoidFloorDeadliftPattern || noteFlags.avoidDeepHipFlexion || spine >= 4 || hip >= 5) && truth.hingeLoadingHigh) reject = true;
  const ankle = Number(user.injuryMap?.ankle || 0);
  if (ankle >= 7 && /\b(jump squat|box jump|bounding|skater squat)\b/.test(name)) reject = true;
  if ((ankle >= 5 || noteFlags.ankleKneeForwardIntolerance || noteFlags.avoidForwardKneeTravel) && truth.forwardKneeTravelHigh) reject = true;
  if ((knee >= 5 || ankle >= 5) && /\bcalf raise\b/.test(name) && !hasSupportedTag && Number(ex.knee || 0) >= 2) penalty += 8;
  return { reject, penalty };
}

function violatesDayTypeQuality(ex, dayType) {
  const type = String(dayType || '');
  const pattern = String(ex?.pattern || '');
  const primary = String(ex?.primary || '');
  if (type === 'Push') return ['HorizontalPull', 'VerticalPull'].includes(pattern);
  if (type === 'Pull') return ['HorizontalPush', 'VerticalPush'].includes(pattern);
  if (type === 'Legs' || type === 'Lower' || type === 'LowerFocus') {
    return ['HorizontalPush', 'VerticalPush', 'HorizontalPull', 'VerticalPull'].includes(pattern)
      || (primary === 'Arms' || primary === 'Shoulders') && pattern === 'Isolation';
  }
  if (type === 'DeltsArms') return ['Squat', 'Hinge', 'Lunge'].includes(pattern);
  return false;
}

function hypertrophyQualityModifiers(ex, slot, user, dayType = '') {
  const name = normalizeName(ex?.name);
  const truth = ex?.canonicalTruth || buildExerciseTruth(ex, user);
  const requiredEquipment = Array.isArray(ex?.requiredEquipment) ? ex.requiredEquipment : [];
  const isCompound = String(ex?.style || '') === 'Compound';
  let bonus = 0;
  let penalty = 0;

  if (violatesDayTypeQuality(ex, dayType)) penalty += 40;

  if (/\b(clean|snatch|jerk|balance|skill|technique|guillotine)\b/.test(name)) penalty += 24;
  if (/\bjm press\b/.test(name)) penalty += 18;
  if (/\bmachine shoulder \(military\) press\b|\bmilitary press\b/.test(name)) penalty += 20;
  if (/\bincline barbell triceps extension\b/.test(name)) penalty += 18;
  if (/\bside laterals? to front raise\b|\bfront raise\b/.test(name) && slot?.muscleTarget === 'Shoulders') penalty += 12;
  if (/^row$/.test(name) || /^\brow\b$/.test(name)) penalty += 16;
  if (/\b(one arm|single arm)\b/.test(name) && isCompound && (user?.profile?.complexity !== 'high')) penalty += 10;
  if (/\b(conventional deadlift|deadlift)\b/.test(name) && !/\b(romanian|rdl|stiff|hip thrust|glute bridge)\b/.test(name)) penalty += 12;
  if (/\b(wide grip|close grip)\b/.test(name) && user?.profile?.complexity === 'low') penalty += 4;

  if (isCompound && /(chest press|bench press|incline bench|incline press|row|pulldown|lat pull|leg press|hack squat|hip thrust|romanian deadlift|rdl)/.test(name)) bonus += 14;
  if (!isCompound && /(lateral raise|rear delt|reverse fly|pec deck|crossover|pushdown|triceps extension|preacher curl|curl|leg curl|leg extension|calf raise|pallof|crunch|ab wheel)/.test(name)) bonus += 10;
  if (!isCompound && /(wrist curl|reverse wrist|reverse curl|hammer curl|pronation|supination|neck flexion|neck extension|neck lateral)/.test(name)) bonus += 10;
  if (!isCompound && /(reverse curl|hammer curl|pronation|supination)/.test(name)) bonus += 4;
  if (/(supported|machine|seated cable row|chest supported|smith machine|leverage)/.test(name)) bonus += 6;
  if (slot?.muscleTarget === 'Chest' && /(incline|chest press|bench press|crossover|pec deck)/.test(name)) bonus += 8;
  if (slot?.muscleTarget === 'Back' && /(row|pulldown|pull down|lat pull|chest supported)/.test(name)) bonus += 8;
  if (slot?.muscleTarget === 'Shoulders' && /(lateral raise|rear delt|reverse fly|machine shoulder press|shoulder press)/.test(name)) bonus += 8;
  if (slot?.muscleTarget === 'Arms' && /(curl|pushdown|triceps|extension)/.test(name)) bonus += 8;
  if (slot?.muscleTarget === 'Legs' && /(leg press|hack squat|squat|leg extension|leg curl|calf)/.test(name)) bonus += 8;
  if (slot?.muscleTarget === 'Calves' && /\bcalf\b/.test(name)) bonus += 12;
  if (slot?.muscleTarget === 'Glutes' && /(hip thrust|glute bridge|rdl|romanian deadlift|abductor|glute|pull through)/.test(name)) bonus += 8;
  if (slot?.muscleTarget === 'Forearms' && /(wrist curl|reverse wrist|reverse curl|hammer curl|pronation|supination|wrist roller|plate pinch)/.test(name)) bonus += 12;
  if (slot?.muscleTarget === 'Neck' && /(neck flexion|neck extension|neck lateral|neck resistance|head harness)/.test(name)) bonus += 12;
  if (slot?.muscleTarget === 'Core' && /(reverse crunch|hanging knee|leg raise|tuck crunch)/.test(name)) bonus += 6;
  if (slot?.muscleTarget === 'Core' && /(pallof|wood chop|rotation|side bend|oblique)/.test(name)) bonus += 6;
  if (slot?.muscleTarget === 'Core' && /(plank|dead bug|vacuum|fallout|rollout)/.test(name)) bonus += 6;

  if (user?.profile?.sessionBandwidth === 'tight') {
    if (requiredEquipment.includes('machine') || requiredEquipment.includes('cable')) bonus += 5;
    if (/(supported|seated)/.test(name)) bonus += 3;
    if (/\b(barbell)\b/.test(name) && /(squat|deadlift|row)/.test(name)) penalty += 4;
  }
  if (user?.profile?.complexity === 'low') {
    if (Number(ex?.difficulty || 0) >= 4) penalty += 8;
    if (/\b(landmine|zercher|jefferson|gironda|sternum|frankenstein)\b/.test(name)) penalty += 18;
  } else if (user?.profile?.complexity === 'high' && isCompound && Number(ex?.difficulty || 0) >= 3) {
    bonus += 3;
  }
  if (user?.profile?.preferredEnvironment === 'machine_dominant') {
    if (requiredEquipment.includes('machine') || requiredEquipment.includes('cable')) bonus += 4;
  } else if (user?.profile?.preferredEnvironment === 'free_weight_dominant') {
    if (requiredEquipment.includes('barbell') || requiredEquipment.includes('dumbbell')) bonus += 4;
  }
  if ((user?.injuryNoteFlags?.straightBarIntolerance || user?.injuryNoteFlags?.wristExtensionIntolerance || user?.injuryNoteFlags?.avoidStraightBar || user?.injuryNoteFlags?.avoidWristExtension) && truth.straightBar) penalty += 16;
  if ((user?.injuryNoteFlags?.straightBarIntolerance || user?.injuryNoteFlags?.wristExtensionIntolerance || user?.injuryNoteFlags?.avoidStraightBar || user?.injuryNoteFlags?.avoidWristExtension) && truth.wristExtensionHeavy) penalty += 22;
  if ((user?.injuryNoteFlags?.deepKneeFlexionIntolerance || user?.injuryNoteFlags?.forwardKneeTravelIntolerance || user?.injuryNoteFlags?.ankleKneeForwardIntolerance)
    && /\b(walking lunge|rear lunge|split squat|bulgarian|sissy squat|pistol squat|skater squat)\b/.test(name)) penalty += 24;
  if (slot?.muscleTarget === 'Forearms' && /(palms-down|palms-up|wrist curl)/.test(name) && !user?.profile?.minimalEquipmentForearmFallbackMode) penalty += 8;
  if (slot?.muscleTarget === 'Forearms' && user?.profile?.armSpecializationSubtype === 'full_arm_plus_forearm') bonus += 8;
  if (slot?.muscleTarget === 'Neck' && user?.profile?.neckEligibleFlag) bonus += 6;
  if (slot?.muscleTarget === 'Core' && user?.profile?.coreDiversityNeed >= 3) bonus += 4;
  if (Number(ex?.stabilityRating || 0) >= 4) bonus += 4;
  if (Number(ex?.fatigueCost || 0) >= 4) penalty += 6;
  return { bonus, penalty };
}

function scoreExercise(ex, slot, user, dayType = '') {
  let score = 0;
  const requiredEquipment = Array.isArray(ex?.requiredEquipment) ? ex.requiredEquipment : [];
  const narrowPriorities = getGoalIdentityPriorityMuscles(user);
  const relevantNarrowPriorities = getGoalIdentityPrioritiesForDay(dayType, user);
  if (user.trainingStyle === 'Mostly machines/cables') {
    const hasMC = requiredEquipment.includes('machine') || requiredEquipment.includes('cable') || ex.equipmentNorm.includes('machine') || ex.equipmentNorm.includes('cable');
    const onlyBasic = requiredEquipment.length && requiredEquipment.every((x) => ['barbell', 'bodyweight', 'dumbbell'].includes(x));
    if (hasMC) score += 14;
    if (onlyBasic) score -= 10;
  } else if (user.trainingStyle === 'Mostly free weights') {
    const hasFW = requiredEquipment.includes('barbell') || requiredEquipment.includes('dumbbell') || ex.equipmentNorm.includes('barbell') || ex.equipmentNorm.includes('dumbbell');
    if (hasFW) score += 14;
  }
  if (slotMatchesExerciseSupportMuscle(slot, ex)) score += 30;
  if (slot.subPreferred && slot.subPreferred.includes(ex.sub)) score += 20;
  if (slot.subFallback && slot.subFallback.includes(ex.sub)) score += 10;
  if (slot.muscleTarget) {
    const slotTargets = getSlotMuscleTargets(slot);
    const exerciseTargets = getExerciseSupportMuscleTargets(ex);
    if (slotTargets.some((target) => exerciseTargets.includes(target))) score += 8;
  }
  if (isBodybuildingStapleForSlot(ex, slot, user, dayType)) score += 18;
  else if (user.discipline === 'bodybuilding' || user.discipline === 'powerbuilding') score -= 28;
  if (user?.profile?.minimalEquipment && ex.isCalisthenicsLike) score += 10;
  if (user?.profile?.priorityBias === 'upper' && ['Chest', 'Back', 'Shoulders', 'Arms'].includes(slot.muscleTarget)) score += 4;
  if (user?.profile?.priorityBias === 'lower' && ['Legs', 'Glutes'].includes(slot.muscleTarget)) score += 4;
  if (slot?.muscleTarget && user?.profile?.priorityRankMap?.[slot.muscleTarget]) {
    const rank = Number(user.profile.priorityRankMap[slot.muscleTarget] || 0);
    score += rank === 1 ? 10 : rank === 2 ? 7 : 4;
  }
  if (isNarrowPriorityUser(user)) {
    if (narrowPriorities.some((muscle) => exerciseDirectlyServesPriority(ex, muscle, user))) score += 18;
    if (slot?.muscleTarget && narrowPriorities.includes(String(slot.muscleTarget || '')) && exerciseDirectlyServesPriority(ex, slot.muscleTarget, user)) score += 20;
    if (relevantNarrowPriorities.length && !relevantNarrowPriorities.some((muscle) => exerciseDirectlyServesPriority(ex, muscle, user))) {
      if (String(ex?.style || '') === 'Compound') score -= 18;
      else score -= 10;
    }
  }
  score += (10 - Math.abs(Number(ex.difficulty || 0) - EXP_CFG[user.experience].diffTarget) * 3);
  const basePenalty = (Number(ex.spine) + Number(ex.knee) + Number(ex.hip) + Number(ex.shoulder) + Number(ex.elbow)) * 2;
  const jointEval = evaluateJoint(ex, user);
  const quality = hypertrophyQualityModifiers(ex, slot, user, dayType);
  return score + quality.bonus - basePenalty - jointEval.penalty - quality.penalty;
}

function getBaseEligibleExercises(exercises, user, dayType = '') {
  const runtime = user?._plannerRuntime || null;
  const cacheKey = `${String(dayType || '')}|${String(user?.experience || '')}`;
  const cached = runtime?.caches?.baseEligibleByDayType?.get(cacheKey) || null;
  if (cached) {
    recordPlannerCount(user, 'baseEligibleCacheHits');
    return cached;
  }
  const maxDiff = EXP_CFG[user.experience].maxDifficulty;
  const filtered = (Array.isArray(exercises) ? exercises : []).filter((ex) => {
    if (isHardBannedExercise(ex)) return false;
    if ((user.discipline === 'bodybuilding' || user.discipline === 'powerbuilding') && ex.isCalisthenicsLike && !user?.profile?.bodyweightDominant) return false;
    if (!isExerciseCompatibleWithEquipment(ex, user)) return false;
    if (matchesAvoid(ex.nameLower, user.avoidNameContainsTokens)) return false;
    if (dayType === 'Pull' && /(lateral raise|side lateral)/.test(ex.nameLower)) return false;
    if (violatesDayTypeQuality(ex, dayType)) return false;
    if (evaluateJoint(ex, user).reject) return false;
    if (Number(ex.difficulty) > maxDiff) return false;
    return true;
  });
  runtime?.caches?.baseEligibleByDayType?.set(cacheKey, filtered);
  recordPlannerCount(user, 'baseEligibleCacheMisses');
  return filtered;
}

function isHeavyDeadliftPatternName(name) {
  const n = normalizeName(name);
  if (!n) return false;
  if (!/(deadlift|romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(n)) return false;
  return !/(hip thrust|glute bridge)/.test(n);
}

function filterEligible(slot, exercises, user, weekPicked, dayState = null, dayType = '', weekState = null) {
  return withPlannerTiming(user, 'candidatePoolBuildingMs', () => {
    const sourceExercises = getBaseEligibleExercises(exercises, user, dayType);
    const currentDayExercises = Array.isArray(dayState?.currentExercises) ? dayState.currentExercises : [];
    const relaxWeeklyCoreDiversityCap = String(slot?.muscleTarget || '') === 'Core'
      && hasPriorityGroup(user, 'Abs')
      && countDirectCoreExercises(currentDayExercises, user) < requiredCorePresenceForSlot(slot, dayType, currentDayExercises);
    return sourceExercises.filter((ex) => {
      const corePattern = ['CoreFlexion', 'CoreStability', 'CoreRotation'].includes(String(ex?.pattern || ''));
      const lowerPriorityRepeat = ['Legs', 'Glutes'].includes(String(slot?.muscleTarget || ''))
        && (hasPriorityGroup(user, 'Quads') || hasPriorityGroup(user, 'Hamstrings/Glutes'))
        && ['Squat', 'Hinge', 'Lunge', 'Isolation'].includes(String(ex?.pattern || ''));
      const lowFreqSmallPriorityRepeat = Number(user?.daysPerWeek || 0) <= 3
        && (
          (hasPriorityGroup(user, 'Calves') && String(slot?.muscleTarget || '') === 'Calves')
          || (hasPriorityGroup(user, 'Abs') && String(slot?.muscleTarget || '') === 'Core')
        );
      if (weekPicked.has(ex.name) && !user?.profile?.allowWeeklyRepeat && !corePattern && !lowerPriorityRepeat && !lowFreqSmallPriorityRepeat) return false;
      if (!isBodybuildingStapleForSlot(ex, slot, user, dayType)) return false;
      if (ex.pattern !== slot.pattern) return false;
      if (slot.styleRequired && ex.style !== slot.styleRequired) return false;
      if (!slotMatchesExerciseMuscles(slot, ex, user)) return false;
      if (!slot.styleRequired && ['Mobility', 'Cardio'].includes(ex.style) && !['Mobility', 'Cardio'].includes(slot.pattern)) return false;
      if (dayState?.names?.has(ex.name)) return false;
      const family = slotExerciseFamily(ex);
      if (dayState && family === 'lunge' && dayState.families.has('lunge')) return false;
      if (dayState && String(slot.styleRequired || '') === 'Isolation') {
        const fam = family;
        if (fam) {
          if (dayState.families.has(fam)) return false;
          if (fam === 'neck' && weekState && Number(weekState.neckDays || 0) >= 3 && !weekState.neckDayKeys?.has(dayState.dayKey)) return false;
          if (fam === 'forearm' && weekState && Number(weekState.forearmDays || 0) >= 3 && !weekState.forearmDayKeys?.has(dayState.dayKey)) return false;
          if (fam.startsWith('core_') && weekState && user?.profile?.coreDiversityNeed >= 3) {
            const seen = weekState.coreFamilies || new Map();
            const count = Number(seen.get(fam) || 0);
            if (count >= 2 && !relaxWeeklyCoreDiversityCap) return false;
          }
          if (fam === 'chest_fly' && Number(dayState.counts.chest_fly || 0) >= 1) return false;
          if (fam === 'rear_delt' && Number(dayState.counts.rear_delt || 0) >= 1) return false;
          if (fam === 'rear_delt' && weekState) {
            if (!weekState.priorityGroups?.has('Shoulders') && !['Pull', 'DeltsArms'].includes(String(dayType || ''))) return false;
            const maxRearDeltDays = weekState.priorityGroups?.has('Shoulders') ? 3 : 2;
            const dayKey = String(dayState.dayKey || '');
            const alreadyOnDay = weekState.rearDeltDays.has(dayKey);
            if (!alreadyOnDay && weekState.rearDeltDays.size >= maxRearDeltDays) return false;
          }
        }
      }
      if (dayState && slot.pattern === 'HorizontalPush' && String(ex?.style || '') === 'Compound') {
        const n = normalizeName(ex?.name);
        if (/\bbench press\b/.test(n) && Number(dayState.counts.bench_press || 0) >= 1) return false;
      }
      if (weekState && slot.pattern === 'Hinge' && String(ex?.style || '') === 'Compound') {
        if (isHeavyDeadliftPatternName(ex?.name) && Number(weekState.heavyDeadliftCount || 0) >= 1) return false;
      }
      return true;
    });
  });
}

function fillSlots(dayBlueprint, exercises, user, weekPicked, weekState = null, fillContext = {}) {
  const pickCandidate = (list, slot) => {
    const pool = list.slice(0, Math.min(6, list.length));
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0].ex;
    const cursor = Number(user?._selectionCursor || 0);
    const seed = Number(user?.planSeed || 0);
    const h = hashString(`${slot?.id || ''}|${cursor}|${seed}|${dayBlueprint?.day || ''}|${dayBlueprint?.dayType || ''}`);
    const idx = Math.abs(h) % pool.length;
    user._selectionCursor = cursor + 1;
    return pool[idx].ex;
  };

  const picked = [];
  const dayKey = `${String(dayBlueprint?.dayType || '')}:${String(dayBlueprint?.day || '')}`;
  const dayState = { families: new Set(), names: new Set(), counts: { chest_fly: 0, rear_delt: 0, bench_press: 0 }, dayKey, currentExercises: picked };
  const buildFallbackSlots = (slot) => {
    const out = [{ ...slot }];
    const baseOpts = {
      primaryAllowed: slot.primaryAllowed,
      subPreferred: slot.subPreferred,
      subFallback: slot.subFallback,
      optional: slot.optional
    };
    if (slot.pattern === 'VerticalPush') {
      out.push({ ...slot, pattern: 'HorizontalPush' });
      out.push({ ...slot, pattern: 'Isolation', styleRequired: 'Isolation', muscleTarget: 'Shoulders', primaryAllowed: ['Shoulders'] });
    } else if (slot.pattern === 'HorizontalPush') {
      out.push({ ...slot, pattern: 'Isolation', styleRequired: 'Isolation', muscleTarget: 'Chest', primaryAllowed: ['Chest'] });
    } else if (slot.pattern === 'VerticalPull') {
      out.push({ ...slot, pattern: 'HorizontalPull' });
    } else if (slot.pattern === 'HorizontalPull') {
      out.push({ ...slot, pattern: 'VerticalPull' });
    } else if (slot.pattern === 'Squat') {
      out.push({ ...slot, pattern: 'Hinge', styleRequired: 'Compound', muscleTarget: 'Glutes', primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Hamstrings-Hinge', 'Glutes'] });
      out.push({ ...slot, pattern: 'Lunge', styleRequired: 'Compound' });
      out.push({ ...slot, pattern: 'Isolation', styleRequired: 'Isolation', muscleTarget: 'Legs', primaryAllowed: ['Legs', 'Glutes'] });
    } else if (slot.pattern === 'Hinge') {
      out.push({ ...slot, pattern: 'Isolation', styleRequired: 'Isolation', muscleTarget: 'Glutes', primaryAllowed: ['Glutes', 'Legs'] });
      out.push({ ...slot, pattern: 'Squat', styleRequired: 'Compound', ...baseOpts });
    } else if (slot.pattern === 'Lunge') {
      out.push({ ...slot, pattern: 'Squat', styleRequired: 'Compound' });
      out.push({ ...slot, pattern: 'Isolation', styleRequired: 'Isolation', muscleTarget: 'Legs', primaryAllowed: ['Legs', 'Glutes'] });
    } else if (String(slot.styleRequired || '') === 'Isolation') {
      if (slot.muscleTarget === 'Chest') out.push({ ...slot, pattern: 'HorizontalPush', styleRequired: 'Compound', primaryAllowed: ['Chest'] });
      if (slot.muscleTarget === 'Shoulders') out.push({ ...slot, pattern: 'VerticalPush', styleRequired: 'Compound', primaryAllowed: ['Shoulders'] });
      if (slot.muscleTarget === 'Back') out.push({ ...slot, pattern: 'HorizontalPull', styleRequired: 'Compound', primaryAllowed: ['Back'] });
      if (slot.muscleTarget === 'Arms') out.push({ ...slot, pattern: 'Isolation', styleRequired: 'Isolation', muscleTarget: 'Arms', primaryAllowed: ['Arms'] });
      if (slot.muscleTarget === 'Legs') {
        const pref = Array.isArray(slot.subPreferred) ? slot.subPreferred.map((x) => String(x || '').toLowerCase()) : [];
        if (pref.some((entry) => entry.includes('hamstrings-curl') || entry.includes('hamstring'))) {
          out.push({ ...slot, pattern: 'Hinge', styleRequired: 'Compound', muscleTarget: 'Glutes', primaryAllowed: ['Legs', 'Glutes'] });
          out.push({ ...slot, pattern: 'Isolation', styleRequired: 'Isolation', muscleTarget: 'Glutes', primaryAllowed: ['Glutes', 'Legs'], subPreferred: ['Glutes'] });
          out.push({ ...slot, pattern: 'Lunge', styleRequired: 'Compound', muscleTarget: 'Legs', primaryAllowed: ['Legs'] });
          out.push({ ...slot, pattern: 'Squat', styleRequired: 'Compound', muscleTarget: 'Legs', primaryAllowed: ['Legs'] });
        } else if (pref.some((entry) => entry.includes('quads'))) {
          out.push({ ...slot, pattern: 'Squat', styleRequired: 'Compound', muscleTarget: 'Legs', primaryAllowed: ['Legs'] });
          out.push({ ...slot, pattern: 'Lunge', styleRequired: 'Compound', muscleTarget: 'Legs', primaryAllowed: ['Legs'] });
        }
      }
      if (slot.muscleTarget === 'Glutes') {
        out.push({ ...slot, pattern: 'Hinge', styleRequired: 'Compound', muscleTarget: 'Glutes', primaryAllowed: ['Legs', 'Glutes'] });
        out.push({ ...slot, pattern: 'Lunge', styleRequired: 'Compound', muscleTarget: 'Legs', primaryAllowed: ['Legs'] });
        out.push({ ...slot, pattern: 'Squat', styleRequired: 'Compound', muscleTarget: 'Legs', primaryAllowed: ['Legs'] });
      }
      if (slot.muscleTarget === 'Core') {
        out.push({ ...slot, pattern: 'CoreStability', styleRequired: 'Isolation', primaryAllowed: ['Core'] });
        out.push({ ...slot, pattern: 'CoreRotation', styleRequired: 'Isolation', primaryAllowed: ['Core'] });
      }
    }
    return out;
  };
  for (const slot of dayBlueprint.slots) {
    if (isCoreSlotAlreadySatisfied(slot, dayBlueprint?.dayType || '', picked, user)) continue;
    let eligible = [];
    let effectiveSlot = slot;
    for (const candidateSlot of buildFallbackSlots(slot)) {
      eligible = filterEligible(candidateSlot, exercises, user, weekPicked, dayState, dayBlueprint?.dayType || '', weekState);
      if (eligible.length) {
        effectiveSlot = candidateSlot;
        break;
      }
    }
    if (slot.muscleTarget === 'Calves') {
      recordPriorityDebug(user, 'calf', 'eligiblePools', {
        dayType: dayBlueprint?.dayType || '',
        slotId: slot.id,
        eligibleCount: eligible.length
      });
    }
    if (slot.muscleTarget === 'Core') {
      recordPriorityDebug(user, 'abs', 'eligiblePools', {
        dayType: dayBlueprint?.dayType || '',
        slotId: slot.id,
        eligibleCount: eligible.length
      });
    }
    if (!eligible.length) {
      if (slot.optional) continue;
      const candidateDiagnostics = buildFallbackSlots(slot).map((candidateSlot) => buildSlotEligibilityDiagnostic(
        candidateSlot,
        exercises,
        user,
        weekPicked,
        dayState,
        dayBlueprint?.dayType || '',
        weekState
      ));
      return structuredNoEligible(slot, user, {
        week: fillContext?.week,
        weekType: fillContext?.weekType,
        day: dayBlueprint?.day,
        dayType: dayBlueprint?.dayType,
        currentDayExercises: picked,
        candidateDiagnostics
      });
    }
    eligible = eligible
      .map((ex) => ({ ex, score: scoreExercise(ex, effectiveSlot, user, dayBlueprint?.dayType || '') }))
      .sort((a, b) => (b.score - a.score) || a.ex.name.localeCompare(b.ex.name));
    const chosen = pickCandidate(eligible, slot) || eligible[0].ex;
    weekPicked.add(chosen.name);
    const displayName = normalizeBodybuildingDisplayName(chosen.name, user);
    dayState.names.add(exerciseDayIdentityKey(chosen));
    const fam = slotExerciseFamily(chosen);
    if (fam) {
      if (fam === 'lunge' || String(slot.styleRequired || '') === 'Isolation') {
        dayState.families.add(fam);
        dayState.counts[fam] = Number(dayState.counts[fam] || 0) + 1;
      }
      if (fam === 'rear_delt' && weekState) weekState.rearDeltDays.add(dayKey);
      if (fam === 'neck' && weekState) {
        weekState.neckDayKeys = weekState.neckDayKeys || new Set();
        if (!weekState.neckDayKeys.has(dayKey)) {
          weekState.neckDayKeys.add(dayKey);
          weekState.neckDays = Number(weekState.neckDays || 0) + 1;
        }
      }
      if (fam === 'forearm' && weekState) {
        weekState.forearmDayKeys = weekState.forearmDayKeys || new Set();
        if (!weekState.forearmDayKeys.has(dayKey)) {
          weekState.forearmDayKeys.add(dayKey);
          weekState.forearmDays = Number(weekState.forearmDays || 0) + 1;
        }
      }
      if (fam.startsWith('core_') && weekState) {
        weekState.coreFamilies = weekState.coreFamilies || new Map();
        weekState.coreFamilies.set(fam, Number(weekState.coreFamilies.get(fam) || 0) + 1);
      }
    }
    if (effectiveSlot.pattern === 'HorizontalPush' && String(chosen?.style || '') === 'Compound') {
      const n = normalizeName(chosen?.name);
      if (/\bbench press\b/.test(n)) dayState.counts.bench_press = Number(dayState.counts.bench_press || 0) + 1;
    }
    if (weekState && effectiveSlot.pattern === 'Hinge' && String(chosen?.style || '') === 'Compound') {
      if (isHeavyDeadliftPatternName(chosen?.name)) weekState.heavyDeadliftCount = Number(weekState.heavyDeadliftCount || 0) + 1;
    }
    const item = {
      slotId: effectiveSlot.id,
      optional: effectiveSlot.optional,
      muscleTarget: effectiveSlot.muscleTarget,
      ...chosen,
      name: displayName,
      displayName,
      canonicalExerciseId: chosen?.canonicalTruth?.canonicalExerciseId || canonicalExerciseIdFor(chosen),
      canonicalTruth: chosen?.canonicalTruth || buildExerciseTruth(chosen, user)
    };
    if (effectiveSlot.muscleTarget === 'Calves') {
      recordPriorityDebug(user, 'calf', 'initialSelections', {
        dayType: dayBlueprint?.dayType || '',
        slotId: effectiveSlot.id,
        canonicalExerciseId: item.canonicalExerciseId,
        displayName
      });
    }
    if (effectiveSlot.muscleTarget === 'Core') {
      recordPriorityDebug(user, 'abs', 'initialSelections', {
        dayType: dayBlueprint?.dayType || '',
        slotId: effectiveSlot.id,
        canonicalExerciseId: item.canonicalExerciseId,
        displayName
      });
    }
    picked.push(item);
  }
  return { exercises: picked };
}

function repsRestByExercise(ex, weekType, user, slotId) {
  const isCompound = ex.style === 'Compound';
  const isCorePattern = ['CoreFlexion', 'CoreStability', 'CoreRotation'].includes(ex.pattern);
  const pbOverride = user.discipline === 'powerbuilding'
    ? powerbuildingPriority.repOverride(slotId, weekType)
    : null;
  const militaryOverride = user.discipline === 'military'
    ? militaryHybrid.repOverride(slotId, weekType)
    : null;
  if (weekType === 'deload') return { reps: isCompound ? '6-10' : '10-15', restSec: isCompound ? 150 : 75, rir: '3-4' };
  if (pbOverride) return pbOverride;
  if (militaryOverride) return militaryOverride;
  if (isCorePattern) return { reps: weekType === 'intensification' ? '8-15' : '8-20', restSec: 60 };
  if (isCompound) return { reps: weekType === 'intensification' ? '6-10' : '6-12', restSec: weekType === 'intensification' ? 150 : 120 };
  return { reps: weekType === 'intensification' ? '10-15' : '10-20', restSec: 75 };
}

function rirForExercise(ex, user, weekType, slotId = '') {
  if (user.outputStyle === 'Simple sets x reps') return null;
  if (user.discipline === 'powerbuilding') {
    const override = powerbuildingPriority.rirOverride(ex, user, weekType, slotId);
    if (override) return override;
  }
  if (user.discipline === 'military') {
    const override = militaryHybrid.rirOverride(user, weekType, slotId);
    if (override) return override;
  }
  if (weekType === 'deload') return '3-4';
  const isCompound = ex.style === 'Compound';
  if (user.closeToFailure === 'Yes') {
    if (isCompound) return '1-3';
    if (user.phase === 'deficit') return '1-2';
    return '0-2';
  }
  return '2-4';
}

function progressionRuleForExercise(ex, user) {
  if (user.discipline === 'powerbuilding' && ex?.slotId) {
    const override = powerbuildingPriority.progressionRuleOverride(ex, user, ex.slotId);
    if (override) return override;
  }
  if (user.discipline === 'military' && ex?.slotId) {
    const override = militaryHybrid.progressionRuleOverride(ex.slotId);
    if (override) return override;
  }
  const scheme = getProgressionScheme(user);
  const cycleWeeks = Math.max(1, Number(scheme.cycleWeeks) || REP_LADDER_CYCLE_WEEKS);
  // Per-lift step so the coaching text matches the ladder (standard = flat +5).
  const family = (typeof projectionFamilyForExercise === 'function') ? projectionFamilyForExercise(ex, user) : null;
  const step = resolveSchemeLoadStep(scheme, family);
  if (user.discipline === 'powerbuilding' && ex.style === 'Compound') {
    return `Rep ladder: same weight all cycle, add 1 rep each week for ${cycleWeeks} weeks; then add ${step} lb and drop back to the starting reps.`;
  }
  return `Rep ladder: keep the weight the same and add 1 rep each week; after week ${cycleWeeks}, add ${step} lb and reset to the starting reps.`;
}

function priorityBudgetTargetForExercise(ex, user) {
  const directTargets = getExerciseDirectTargetKeys(ex, user);
  const directSet = new Set(directTargets);
  if (hasPriorityGroup(user, 'Shoulders') && directSet.has('Shoulders')) return 'Shoulders';
  if (hasPriorityGroup(user, 'Arms')) {
    if (directSet.has('Biceps')) return 'Biceps';
    if (directSet.has('Triceps')) return 'Triceps';
  }
  if (hasPriorityGroup(user, 'Abs') && directSet.has('Abs')) return 'Abs';
  if (hasPriorityGroup(user, 'Quads') && directSet.has('Quads')) return 'Quads';
  if (hasPriorityGroup(user, 'Hamstrings/Glutes')) {
    if (directSet.has('Hamstrings')) return 'Hamstrings';
    if (directSet.has('Glutes')) return 'Glutes';
  }
  if (hasPriorityGroup(user, 'Calves') && directSet.has('Calves')) return 'Calves';
  return String(ex?.muscleTarget || ex?.primary || 'Core');
}

function neckAllowedForUser(user) {
  return hasPriorityGroup(user, 'Neck');
}

function isNeckExercise(exercise, user = null) {
  const name = normalizeName(exercise?.name);
  const primary = String(exercise?.primaryMuscle || exercise?.primary || '').trim();
  const target = String(exercise?.muscleTarget || '').trim();
  if (primary === 'Neck' || target === 'Neck') return true;
  if (/\bneck\b/.test(name)) return true;
  const truth = exercise?.canonicalTruth || (user ? buildExerciseTruth(exercise, user) : null);
  if (String(truth?.primaryMuscle || '') === 'Neck') return true;
  if (String(truth?.subMuscle || '').toLowerCase().includes('neck')) return true;
  return false;
}

function exercisePriorityOrderRank(ex, user) {
  if (!user) return Number.isFinite(Number(ex?.priorityOrderRank)) ? Number(ex.priorityOrderRank) : 99;
  const groups = [];
  if (exerciseDirectlyServesPriority(ex, 'Shoulders', user)) groups.push('Shoulders');
  if (exerciseDirectlyServesPriority(ex, 'Arms', user)) groups.push('Arms');
  if (exerciseDirectlyServesPriority(ex, 'Abs', user) || exerciseDirectlyServesPriority(ex, 'Core', user)) groups.push('Abs');
  if (exerciseDirectlyServesPriority(ex, 'Quads', user)) groups.push('Quads');
  if (exerciseDirectlyServesPriority(ex, 'Hamstrings/Glutes', user) || exerciseDirectlyServesPriority(ex, 'Glutes', user)) groups.push('Hamstrings/Glutes');
  if (exerciseDirectlyServesPriority(ex, 'Calves', user)) groups.push('Calves');
  if (exerciseDirectlyServesPriority(ex, 'Chest', user)) groups.push('Chest');
  if (exerciseDirectlyServesPriority(ex, 'Back', user)) groups.push('Back');
  const ranked = groups
    .map((group) => priorityRankForGroup(user, group))
    .filter((rank) => Number.isFinite(rank) && rank < 99);
  return ranked.length ? Math.min(...ranked) : 99;
}

function allocateSetsReps(days, weekType, targets, user) {
  const dayIdxByMuscle = {};
  days.forEach((day, idx) => {
    day.exercises.forEach((ex) => {
      const m = priorityBudgetTargetForExercise(ex, user);
      dayIdxByMuscle[m] = dayIdxByMuscle[m] || [];
      if (!dayIdxByMuscle[m].includes(idx)) dayIdxByMuscle[m].push(idx);
    });
  });
  const setsBudgetByDayMuscle = {};
  Object.entries(targets).forEach(([muscle, target]) => {
    const daysFor = dayIdxByMuscle[muscle] || [];
    if (!daysFor.length) return;
    const pct = DISTRO[Math.min(4, daysFor.length)] || Array.from({ length: daysFor.length }).map(() => 1 / daysFor.length);
    daysFor.forEach((dayIdx, i) => {
      const key = `${dayIdx}:${muscle}`;
      setsBudgetByDayMuscle[key] = (setsBudgetByDayMuscle[key] || 0) + Math.max(0, Math.round(target * pct[i]));
    });
  });

  const outDays = days.map((day, idx) => {
    const byMuscle = {};
    day.exercises.forEach((ex) => {
      const m = priorityBudgetTargetForExercise(ex, user);
      byMuscle[m] = byMuscle[m] || [];
      byMuscle[m].push(ex);
    });
    const finalExercises = [];
    Object.entries(byMuscle).forEach(([muscle, exList]) => {
      const key = `${idx}:${muscle}`;
      let budget = Math.max(exList.length * 2, setsBudgetByDayMuscle[key] || (exList.length * 2));
      if (user?.profile?.sessionBandwidth === 'tight') budget = Math.min(budget, exList.length * 3);
      const ordered = exList.slice().sort((a, b) => {
        const rankDiff = exercisePriorityOrderRank(a, user) - exercisePriorityOrderRank(b, user);
        if (rankDiff) return rankDiff;
        return (a.style === 'Compound' ? -1 : 1) - (b.style === 'Compound' ? -1 : 1);
      });
      ordered.forEach((ex, exIdx) => {
        const remaining = ordered.length - exIdx;
        const isPriorityMuscle = exercisePriorityOrderRank(ex, user) < 99 || Boolean(user?.profile?.priorityRankMap?.[muscle]);
        const minForThis = ex.style === 'Compound' && isPriorityMuscle ? 3 : 2;
        const sets = Math.min(
          BODYBUILDING_MAX_SETS_PER_EXERCISE,
          Math.max(minForThis, Math.floor(budget / remaining))
        );
        budget -= sets;
        const rr = repsRestByExercise(ex, weekType, user, ex.slotId);
        const item = buildExerciseOutput(ex, user, {
          id: ex.slotId,
          muscleTarget: muscle,
          optional: ex.optional
        }, sets, rr, {
          priorityOrderRank: exercisePriorityOrderRank(ex, user),
          weekType,
          pattern: ex.pattern,
          primary: ex.primary,
          sub: ex.sub,
          equipment: ex.equipmentNorm,
          style: ex.style,
          difficulty: ex.difficulty
        });
        finalExercises.push(item);
      });
    });
    return { ...day, exercises: finalExercises };
  });

  const adjustedDays = user.discipline === 'powerbuilding'
    ? powerbuildingPriority.adjustPowerbuildingDayVolumes(outDays, user)
    : outDays;
  if (user.discipline === 'powerbuilding' && user.focus === 'Strength') {
    adjustedDays.forEach((day) => {
      day.exercises.forEach((ex) => {
        if (ex.style === 'Isolation') ex.sets = Math.max(1, Math.floor(ex.sets * 0.9));
      });
    });
  }
  adjustedDays.forEach((day) => {
    day.exercises.forEach((ex) => {
      ex.sets = Math.max(1, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(ex.sets) || 1));
    });
  });
  return adjustedDays;
}

function applySessionCapTrimming(day, sessionCap, priorityGroups, profile = null, user = null) {
  const list = day.exercises.slice();
  const isPriority = (ex) => {
    const primary = String(ex?.primary || ex?.muscleTarget || '');
    const sub = String(ex?.sub || '');
    if (hasPriorityGroup(priorityGroups, ex?.muscleTarget) || hasPriorityGroup(priorityGroups, primary)) return true;
    if (hasPriorityGroup(priorityGroups, 'Calves') && (Boolean(ex?.directCalf) || /calves/i.test(sub))) return true;
    if (hasPriorityGroup(priorityGroups, 'Abs') && Boolean(ex?.directAb)) return true;
    if (hasPriorityGroup(priorityGroups, 'Arms') && ['biceps', 'triceps'].includes(String(ex?.directArmType || ''))) return true;
    if (hasPriorityGroup(priorityGroups, 'Shoulders') && (Boolean(ex?.shoulderPressPattern) || Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern))) return true;
    if (primary === 'Forearms' && profile?.forearmPriorityFlag) return true;
    if (isNeckExercise(ex, user) && profile?.neckEligibleFlag && neckAllowedForUser({ priorityGroups })) return true;
    return false;
  };
  const removeFirst = (predicate, stage) => {
    const idx = list.findIndex(predicate);
    if (idx >= 0) {
      const [removed] = list.splice(idx, 1);
      if (removed?.directCalf) {
        recordPriorityDebug(user, 'calf', 'trimmed', {
          stage,
          dayType: day?.dayType || '',
          canonicalExerciseId: removed?.canonicalExerciseId || canonicalExerciseIdFor(removed),
          displayName: removed?.displayName || removed?.name || ''
        });
      }
      if (removed?.directAb) {
        recordPriorityDebug(user, 'abs', 'trimmed', {
          stage,
          dayType: day?.dayType || '',
          canonicalExerciseId: removed?.canonicalExerciseId || canonicalExerciseIdFor(removed),
          displayName: removed?.displayName || removed?.name || ''
        });
      }
      return true;
    }
    return false;
  };

  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.style === 'Isolation' && !isPriority(ex), 'non_priority_isolation')) break;
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.pattern === 'Lunge' && !isPriority(ex), 'non_priority_lunge')) break;
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ['CoreFlexion', 'CoreStability', 'CoreRotation'].includes(ex.pattern) && !isPriority(ex), 'non_priority_core')) break;
  }
  while (list.length > sessionCap) {
    const arms = list.filter((ex) => ex.primary === 'Arms' || ex.muscleTarget === 'Arms');
    if (arms.length <= 1) break;
    const idx = list.findIndex((ex) => (ex.primary === 'Arms' || ex.muscleTarget === 'Arms') && !isPriority(ex));
    if (idx >= 0) removeFirst((_, innerIdx) => innerIdx === idx, 'extra_non_priority_arm');
    else break;
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.style === 'Isolation' && ex.optional, 'optional_isolation')) break;
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.style === 'Isolation' && !isPriority(ex), 'remaining_non_priority_isolation')) break;
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.style === 'Compound' && ex.sets <= 2, 'low_set_compound')) break;
  }

  return { ...day, exercises: list };
}

function organizeDayExerciseOrder(dayType, exercises, user = null) {
  const src = Array.isArray(exercises) ? exercises.slice() : [];
  if (src.length <= 1) return src;
  const remaining = src.slice();
  const ordered = [];
  const type = String(dayType || '');
  const isPowerbuilding = String(user?.discipline || '') === 'powerbuilding';
  const takePowerbuildingAnchor = () => {
    if (String(user?.discipline || '') !== 'powerbuilding') return;
    const idx = remaining.findIndex((ex) => String(ex?.slotId || '').startsWith('pb_'));
    if (idx >= 0) ordered.push(...remaining.splice(idx, 1));
  };
  const isCore = (ex) => {
    const p = String(ex?.pattern || '');
    const m = String(ex?.muscleTarget || ex?.primary || '');
    const n = normalizeName(ex?.name);
    return p === 'CoreFlexion' || p === 'CoreStability' || p === 'CoreRotation' || m === 'Core' || /(crunch|rollout|wood chop|pallof|ab wheel|twist)/.test(n);
  };
  const isCalves = (ex) => {
    const n = normalizeName(ex?.name);
    return /\bcalf\b/.test(n) || /calves/i.test(String(ex?.sub || ''));
  };
  const isArms = (ex) => {
    const n = normalizeName(ex?.name);
    const m = String(ex?.muscleTarget || ex?.primary || '');
    return m === 'Arms' || isDirectBicepsName(n) || isDirectTricepsName(n);
  };
  const isForearms = (ex) => {
    const n = normalizeName(ex?.name);
    const m = String(ex?.muscleTarget || ex?.primary || '');
    return m === 'Forearms' || /(wrist curl|reverse wrist|reverse curl|hammer curl|pronation|supination|wrist roller|plate pinch|hand squeeze)/.test(n);
  };
  const isNeck = (ex) => {
    return isNeckExercise(ex, user);
  };
  const isCompound = (ex) => String(ex?.style || '') === 'Compound';
  const isDirectPriorityAccessory = (ex) => !isCompound(ex) && exercisePriorityOrderRank(ex, user) < 99;
  const priorityRank = (ex) => exercisePriorityOrderRank(ex, user);
  const takeFirst = (predicate) => {
    const idx = remaining.findIndex(predicate);
    if (idx >= 0) ordered.push(...remaining.splice(idx, 1));
  };
  const moveAll = (predicate) => {
    for (let i = 0; i < remaining.length;) {
      if (predicate(remaining[i])) ordered.push(...remaining.splice(i, 1));
      else i += 1;
    }
  };
  const isMainCandidate = (ex) => {
    const p = String(ex?.pattern || '');
    if (!isCompound(ex)) return false;
    if (type === 'Push') return p === 'HorizontalPush' || p === 'VerticalPush';
    if (type === 'Pull') return p === 'HorizontalPull' || p === 'VerticalPull';
    if (type === 'Legs' || type === 'Lower') return p === 'Squat' || p === 'Hinge';
    if (type === 'DeltsArms') return p === 'VerticalPush';
    if (type === 'Upper') return p === 'HorizontalPush' || p === 'HorizontalPull';
    return false;
  };
  takePowerbuildingAnchor();
  takeFirst(isMainCandidate);
  if (isPowerbuilding) {
    moveAll((ex) => isCompound(ex) && !isArms(ex) && !isForearms(ex) && !isNeck(ex) && !isCalves(ex) && !isCore(ex));
    [1, 2, 3].forEach((rank) => {
      moveAll((ex) => isDirectPriorityAccessory(ex) && priorityRank(ex) === rank && !isArms(ex) && !isForearms(ex) && !isNeck(ex) && !isCalves(ex) && !isCore(ex));
    });
  } else {
    [1, 2, 3].forEach((rank) => {
      moveAll((ex) => isDirectPriorityAccessory(ex) && priorityRank(ex) === rank && !isForearms(ex) && !isNeck(ex));
    });
    moveAll((ex) => isCompound(ex) && !isArms(ex) && !isForearms(ex) && !isNeck(ex) && !isCalves(ex) && !isCore(ex));
  }
  moveAll((ex) => !isCompound(ex) && !isArms(ex) && !isForearms(ex) && !isNeck(ex) && !isCalves(ex) && !isCore(ex));
  moveAll((ex) => isArms(ex) && !isForearms(ex) && !isNeck(ex) && !isCalves(ex) && !isCore(ex));
  moveAll((ex) => isForearms(ex));
  moveAll((ex) => isNeck(ex));
  moveAll((ex) => isCalves(ex));
  moveAll((ex) => isCore(ex));
  moveAll(() => true);
  return ordered;
}

function buildFallbackSlotFromExercise(ex) {
  return {
    id: String(ex?.slotId || ex?.pattern || 'repair_slot'),
    pattern: String(ex?.pattern || 'Isolation'),
    styleRequired: String(ex?.style || 'Isolation'),
    muscleTarget: String(ex?.muscleTarget || ex?.primary || 'Core'),
    primaryAllowed: [String(ex?.primary || ex?.muscleTarget || 'Core')].filter(Boolean),
    subPreferred: ex?.sub ? [String(ex.sub)] : null,
    subFallback: null,
    optional: false
  };
}

function findReplacementExerciseForPlan(exercise, user, allExercises, dayType, usedNames) {
  const slot = buildFallbackSlotFromExercise(exercise);
  const currentKey = exerciseDayIdentityKey(exercise);
  const eligible = filterEligible(slot, allExercises, user, usedNames, null, dayType, null)
    .filter((candidate) => exerciseDayIdentityKey(candidate) !== currentKey)
    .filter((candidate) => !usedNames?.has(exerciseDayIdentityKey(candidate)))
    .filter((candidate) => neckAllowedForUser(user) || !isNeckExercise(candidate, user));
  if (!eligible.length) return null;
  const scored = eligible
    .map((ex) => ({ ex, score: scoreExercise(ex, slot, user, dayType) }))
    .sort((a, b) => (b.score - a.score) || a.ex.name.localeCompare(b.ex.name));
  const chosen = scored[0]?.ex || null;
  if (!chosen) return null;
  // The prescription belongs to the SLOT, not to the movement: a replacement
  // stands in for the exercise it displaces and must inherit its sets, reps,
  // rest, rep-ladder state and coaching text. `chosen` is a raw database row
  // with none of those, so without this carry-over a swapped exercise renders
  // as "3xundefined" and drops out of the rep ladder entirely.
  const carried = {};
  for (const key of [
    'sets', 'reps', 'restSec', 'rest', 'rir', 'repLadder', 'progressionRule',
    'weekType', 'flags', 'priorityOrderRank', 'projected', 'projectedWeight',
    'projectedUnit', 'progression'
  ]) {
    if (exercise && exercise[key] !== undefined) carried[key] = exercise[key];
  }
  return {
    ...chosen,
    ...carried,
    name: normalizeBodybuildingDisplayName(chosen.name, user),
    slotId: slot.id || exercise?.slotId,
    optional: false,
    muscleTarget: slot.muscleTarget
  };
}

function buildExactPriorityRepairSlot(dayType, target, variant = '') {
  const dayKey = String(dayType || 'day').toLowerCase();
  if (target === 'Shoulders') {
    return {
      id: `${dayKey}_repair_shoulders_${variant || 'lat'}`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Shoulders',
      primaryAllowed: ['Shoulders'],
      subPreferred: variant === 'rear' ? ['Rear'] : ['Lateral'],
      subFallback: null,
      optional: false
    };
  }
  if (target === 'Biceps') {
    return {
      id: `${dayKey}_repair_biceps`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Arms',
      primaryAllowed: ['Arms'],
      subPreferred: ['Biceps-Long', 'Biceps-Short'],
      subFallback: null,
      optional: false
    };
  }
  if (target === 'Triceps') {
    const prefs = variant === 'overhead'
      ? ['Triceps-Overhead', 'Triceps-Long']
      : variant === 'pushdown'
        ? ['Triceps-Pushdown', 'Triceps-Lateral']
        : ['Triceps-Pushdown', 'Triceps-Overhead', 'Triceps-Lateral'];
    return {
      id: `${dayKey}_repair_triceps_${variant || 'mixed'}`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Arms',
      primaryAllowed: ['Arms'],
      subPreferred: prefs,
      subFallback: null,
      optional: false
    };
  }
  if (target === 'Abs') {
    const pattern = variant === 'rotation' ? 'CoreRotation' : variant === 'stability' ? 'CoreStability' : 'CoreFlexion';
    const subPreferred = pattern === 'CoreRotation'
      ? ['Obliques', 'TVA']
      : pattern === 'CoreStability'
        ? ['TVA', 'LowerAbs']
        : ['Abs-Lower', 'Abs-Upper'];
    return {
      id: `${dayKey}_repair_abs_${variant || 'flexion'}`,
      pattern,
      styleRequired: 'Isolation',
      muscleTarget: 'Core',
      primaryAllowed: ['Core'],
      subPreferred,
      subFallback: null,
      optional: false
    };
  }
  return null;
}

function currentWeekDirectSets(days) {
  return summarizeDirectSetsByMuscle([{ days: Array.isArray(days) ? days : [] }]);
}

function isDirectCoreExercise(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  return Boolean(truth?.directAb);
}

function directCoreSetsForExercise(exercise, user = null) {
  if (!isDirectCoreExercise(exercise, user)) return 0;
  return Math.max(0, Number(exercise?.sets || 0) || 0);
}

function buildWeekDirectCoreSnapshot(week, user = null) {
  const days = Array.isArray(week?.days) ? week.days : [];
  const entries = [];
  let totalSets = 0;
  let exposures = 0;
  days.forEach((day, dayIndex) => {
    const dayEntries = [];
    (Array.isArray(day?.exercises) ? day.exercises : []).forEach((exercise, exerciseIndex) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      if (!truth?.directAb) return;
      const sets = Math.max(0, Number(exercise?.sets || 0) || 0);
      if (!sets) return;
      const pattern = String(exercise?.pattern || '').trim();
      const name = normalizeName(exercise?.name);
      const isAntiRotation = /pallof|anti[\s-]*rotation/.test(name);
      const familyRank = isAntiRotation
        ? 3
        : pattern === 'CoreRotation'
          ? 2
          : pattern === 'CoreStability'
            ? 1
            : 0;
      dayEntries.push({
        dayIndex,
        exerciseIndex,
        sets,
        pattern,
        name,
        day: day?.day,
        dayType: day?.dayType,
        familyRank,
        isAntiRotation
      });
      totalSets += sets;
    });
    if (dayEntries.length) exposures += 1;
    entries.push(...dayEntries);
  });
  return { totalSets, exposures, entries };
}

function buildCoreVolumeReplacementSpecs(dayType) {
  const type = String(dayType || '');
  const lowerDay = ['Lower', 'LowerFocus', 'Legs'].includes(type);
  const fullBodyDay = ['FullBodyA', 'FullBodyB'].includes(type);
  const upperDay = ['Push', 'Pull', 'Upper', 'UpperFocus', 'DeltsArms'].includes(type) || fullBodyDay;
  const specs = [];
  if (lowerDay || fullBodyDay) {
    specs.push({
      key: 'calves',
      slot: {
        id: `${String(type || 'day').toLowerCase()}_core_cleanup_calf`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Calves',
        primaryAllowed: ['Legs'],
        subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
        subFallback: null,
        optional: false
      },
      predicate: (candidate, user) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return Boolean(truth?.directCalf);
      }
    });
    specs.push({
      key: 'hamstring_curl',
      slot: {
        id: `${String(type || 'day').toLowerCase()}_core_cleanup_hamcurl`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Legs',
        primaryAllowed: ['Legs'],
        subPreferred: ['Hamstrings-Curl'],
        subFallback: ['Hamstrings'],
        optional: false
      },
      predicate: (candidate, user) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        const name = normalizeName(candidate?.name);
        return truth?.primaryMuscle === 'Legs' && /(leg curl|hamstring curl|glute ham raise)/.test(name);
      }
    });
    specs.push({
      key: 'glute_accessory',
      slot: {
        id: `${String(type || 'day').toLowerCase()}_core_cleanup_glute`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Glutes',
        primaryAllowed: ['Glutes', 'Legs'],
        subPreferred: ['Glutes'],
        subFallback: null,
        optional: false
      },
      predicate: (candidate, user) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return isRealPosteriorChainBuilder(candidate, user) && !truth?.hingeLoadingHigh;
      }
    });
  }
  if (upperDay) {
    specs.push({
      key: 'maintenance_pull',
      slot: {
        id: `${String(type || 'day').toLowerCase()}_core_cleanup_pull`,
        pattern: 'Compound',
        styleRequired: 'Compound',
        muscleTarget: 'Back',
        primaryAllowed: ['Back'],
        subPreferred: ['Lats', 'UpperBack'],
        subFallback: null,
        optional: false
      },
      predicate: (candidate, user) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth?.primaryMuscle === 'Back' && String(candidate?.style || '') === 'Compound';
      }
    });
    specs.push({
      key: 'maintenance_press',
      slot: {
        id: `${String(type || 'day').toLowerCase()}_core_cleanup_press`,
        pattern: 'Compound',
        styleRequired: 'Compound',
        muscleTarget: 'Chest',
        primaryAllowed: ['Chest', 'Shoulders'],
        subPreferred: ['Chest'],
        subFallback: null,
        optional: false
      },
      predicate: (candidate, user) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return (truth?.primaryMuscle === 'Chest' || truth?.primaryMuscle === 'Shoulders') && String(candidate?.style || '') === 'Compound';
      }
    });
  }
  return specs;
}

function canTrimCoreWithoutBreakingStructure(day) {
  const structure = resolveCurrentLowerDayStructuralResult(day);
  return !structure || Boolean(structure.ok);
}

function trimExcessWeeklyDirectCoreVolume(week, user, exercises) {
  if (!(hasPriorityGroup(user, 'Abs') || hasPriorityGroup(user, 'Core'))) return week;
  const nextWeek = {
    ...week,
    days: Array.isArray(week?.days)
      ? week.days.map((day) => ({
        ...day,
        exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : []
      }))
      : []
  };
  let snapshot = buildWeekDirectCoreSnapshot(nextWeek, user);
  let trimAttempts = 0;
  let replacementAttempts = 0;
  let removalAttempts = 0;
  let noProgressCount = 0;
  let totalIterations = 0;
  const MAX_CORE_CLEANUP_ITERATIONS = 200;
  const MAX_CORE_CLEANUP_NO_PROGRESS = 25;
  const buildCoreCleanupMeta = (extra = {}) => ({
    functionName: 'trimExcessWeeklyDirectCoreVolume',
    fileName: 'generator/trainingEngine.oblueprint.js',
    elapsedMs: plannerNowMs(),
    requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
    requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
    selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
    weeksLength: 1,
    totalDayCount: Array.isArray(nextWeek?.days) ? nextWeek.days.length : 0,
    totalExerciseCount: Array.isArray(nextWeek?.days)
      ? nextWeek.days.reduce((sum, day) => sum + (Array.isArray(day?.exercises) ? day.exercises.length : 0), 0)
      : 0,
    weekIndex: Number.isFinite(Number(nextWeek?.weekIndex)) ? Number(nextWeek.weekIndex) : undefined,
    coreSetCountBefore: snapshot.totalSets,
    coreSetCountAfter: snapshot.totalSets,
    coreExerciseCount: Array.isArray(snapshot?.entries) ? snapshot.entries.length : 0,
    trimAttempts,
    replacementAttempts,
    removalAttempts,
    noProgressCount,
    totalIterations,
    ...extra
  });
  emitPlannerDiagnosticHeartbeat(user, 'entered_cleanup_excess_core_volume', buildCoreCleanupMeta({
    callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_entered'
  }));
  logAbsGlutesLegsComboDebug(user, 'core-volume-cleanup-entry', {
    week: nextWeek?.weekIndex || null,
    directCoreSets: snapshot.totalSets,
    directCoreExposures: snapshot.exposures
  });
  if (snapshot.totalSets <= 14) {
    logAbsGlutesLegsComboDebug(user, 'core-volume-cleanup-exit', {
      week: nextWeek?.weekIndex || null,
      directCoreSets: snapshot.totalSets,
      directCoreExposures: snapshot.exposures,
      trimmed: false
    });
    emitPlannerDiagnosticHeartbeat(user, 'cleanup_excess_core_volume_completed', buildCoreCleanupMeta({
      callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_completed_early'
    }));
    return nextWeek;
  }
  const sortedEntries = () => buildWeekDirectCoreSnapshot(nextWeek, user).entries
    .sort((a, b) => a.familyRank - b.familyRank || b.sets - a.sets || a.dayIndex - b.dayIndex || b.exerciseIndex - a.exerciseIndex);
  emitPlannerDiagnosticHeartbeat(user, 'before_week_loop', buildCoreCleanupMeta({
    callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_before_week_loop'
  }));
  while (snapshot.totalSets > 14) {
    totalIterations += 1;
    if (totalIterations === 1) {
      emitPlannerDiagnosticHeartbeat(user, 'week_loop_started', buildCoreCleanupMeta({
        callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_week_loop_started'
      }));
    }
    if (totalIterations > MAX_CORE_CLEANUP_ITERATIONS || noProgressCount >= MAX_CORE_CLEANUP_NO_PROGRESS) {
      emitPlannerDiagnosticHeartbeat(user, 'cleanup_excess_core_volume_degraded', buildCoreCleanupMeta({
        callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_no_progress_guard',
        guardReason: totalIterations > MAX_CORE_CLEANUP_ITERATIONS ? 'max_iterations' : 'no_progress'
      }));
      break;
    }
    let changed = false;
    emitPlannerDiagnosticHeartbeat(user, 'before_core_counting', buildCoreCleanupMeta({
      callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_before_core_counting'
    }));
    const candidates = sortedEntries();
    emitPlannerDiagnosticHeartbeat(user, 'after_core_counting', buildCoreCleanupMeta({
      callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_core_counting',
      coreExerciseCount: candidates.length
    }));
    emitPlannerDiagnosticHeartbeat(user, 'before_day_loop', buildCoreCleanupMeta({
      callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_before_day_loop'
    }));
    for (const entry of candidates) {
      emitPlannerDiagnosticHeartbeat(user, 'day_loop_started', buildCoreCleanupMeta({
        callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_day_loop_started',
        dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
        coreExerciseCount: candidates.length
      }));
      const day = nextWeek.days[entry.dayIndex];
      if (!day) continue;
      const current = day.exercises?.[entry.exerciseIndex];
      if (!current || !isDirectCoreExercise(current, user)) continue;
      const currentDayCoreCount = (day.exercises || []).filter((exercise) => isDirectCoreExercise(exercise, user)).length;
      const wouldDropExposure = currentDayCoreCount === 1 && snapshot.exposures <= 2;
      const replacementSpecs = buildCoreVolumeReplacementSpecs(day?.dayType || '');
      emitPlannerDiagnosticHeartbeat(user, 'before_trim_candidate_selection', buildCoreCleanupMeta({
        callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_before_trim_candidate_selection',
        dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
        coreExerciseCount: currentDayCoreCount
      }));
      emitPlannerDiagnosticHeartbeat(user, 'after_trim_candidate_selection', buildCoreCleanupMeta({
        callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_trim_candidate_selection',
        dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
        trimCandidateCount: replacementSpecs.length
      }));
      for (const spec of replacementSpecs) {
        trimAttempts += 1;
        replacementAttempts += 1;
        emitPlannerDiagnosticHeartbeat(user, 'before_replacement_attempt', buildCoreCleanupMeta({
          callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_before_replacement_attempt',
          dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
          replacementKey: spec.key
        }));
        const replacement = buildQualityReplacement(day, current, spec.slot, user, exercises, String(week?.weekType || 'base'), (candidate) => spec.predicate(candidate, user));
        if (!replacement) {
          emitPlannerDiagnosticHeartbeat(user, 'after_replacement_attempt', buildCoreCleanupMeta({
            callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_replacement_attempt',
            dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
            replacementKey: spec.key,
            replacementFound: false
          }));
          continue;
        }
        const trialWeek = {
          ...nextWeek,
          days: nextWeek.days.map((candidateDay, candidateIndex) => candidateIndex !== entry.dayIndex
            ? candidateDay
            : {
              ...candidateDay,
              exercises: (candidateDay.exercises || []).map((exercise, exerciseIndex) => exerciseIndex === entry.exerciseIndex ? replacement : exercise)
            })
        };
        trialWeek.days[entry.dayIndex].exercises = organizeDayExerciseOrder(trialWeek.days[entry.dayIndex].dayType || '', trialWeek.days[entry.dayIndex].exercises || [], user);
        const trialSnapshot = buildWeekDirectCoreSnapshot(trialWeek, user);
        if (trialSnapshot.exposures < 2 || !canTrimCoreWithoutBreakingStructure(trialWeek.days[entry.dayIndex])) {
          emitPlannerDiagnosticHeartbeat(user, 'after_replacement_attempt', buildCoreCleanupMeta({
            callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_replacement_attempt',
            dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
            replacementKey: spec.key,
            replacementFound: true,
            coreSetCountAfter: trialSnapshot.totalSets
          }));
          continue;
        }
        const previousSets = snapshot.totalSets;
        nextWeek.days = trialWeek.days;
        snapshot = trialSnapshot;
        noProgressCount = snapshot.totalSets < previousSets ? 0 : (noProgressCount + 1);
        logAbsGlutesLegsComboDebug(user, 'core-volume-cleanup-trim', {
          week: nextWeek?.weekIndex || null,
          day: day?.day || null,
          dayType: day?.dayType || null,
          action: 'replace',
          replacementKey: spec.key,
          removedExercise: current?.name || null,
          directCoreSets: snapshot.totalSets,
          directCoreExposures: snapshot.exposures
        });
        emitPlannerDiagnosticHeartbeat(user, 'after_replacement_attempt', buildCoreCleanupMeta({
          callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_replacement_attempt',
          dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
          replacementKey: spec.key,
          replacementFound: true,
          coreSetCountAfter: snapshot.totalSets
        }));
        changed = true;
        break;
      }
      if (changed) break;
      if (wouldDropExposure) continue;
      trimAttempts += 1;
      removalAttempts += 1;
      emitPlannerDiagnosticHeartbeat(user, 'before_removal_attempt', buildCoreCleanupMeta({
        callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_before_removal_attempt',
        dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined
      }));
      const trialWeek = {
        ...nextWeek,
        days: nextWeek.days.map((candidateDay, candidateIndex) => candidateIndex !== entry.dayIndex
          ? candidateDay
          : {
            ...candidateDay,
            exercises: (candidateDay.exercises || []).filter((_, exerciseIndex) => exerciseIndex !== entry.exerciseIndex)
          })
      };
      trialWeek.days[entry.dayIndex].exercises = organizeDayExerciseOrder(trialWeek.days[entry.dayIndex].dayType || '', trialWeek.days[entry.dayIndex].exercises || [], user);
      const trialSnapshot = buildWeekDirectCoreSnapshot(trialWeek, user);
      if (trialSnapshot.exposures < 2 || !canTrimCoreWithoutBreakingStructure(trialWeek.days[entry.dayIndex])) {
        emitPlannerDiagnosticHeartbeat(user, 'after_removal_attempt', buildCoreCleanupMeta({
          callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_removal_attempt',
          dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
          coreSetCountAfter: trialSnapshot.totalSets
        }));
        continue;
      }
      const previousSets = snapshot.totalSets;
      nextWeek.days = trialWeek.days;
      snapshot = trialSnapshot;
      noProgressCount = snapshot.totalSets < previousSets ? 0 : (noProgressCount + 1);
      logAbsGlutesLegsComboDebug(user, 'core-volume-cleanup-trim', {
        week: nextWeek?.weekIndex || null,
        day: day?.day || null,
        dayType: day?.dayType || null,
        action: 'remove',
        removedExercise: current?.name || null,
        directCoreSets: snapshot.totalSets,
        directCoreExposures: snapshot.exposures
      });
      emitPlannerDiagnosticHeartbeat(user, 'after_removal_attempt', buildCoreCleanupMeta({
        callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_removal_attempt',
        dayIndex: Number.isFinite(Number(entry?.dayIndex)) ? Number(entry.dayIndex) : undefined,
        coreSetCountAfter: snapshot.totalSets
      }));
      changed = true;
      break;
    }
    if (changed) {
      emitPlannerDiagnosticHeartbeat(user, 'after_day_processed', buildCoreCleanupMeta({
        callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_day_processed',
        coreSetCountAfter: snapshot.totalSets
      }));
      continue;
    }
    noProgressCount += 1;
    logAbsGlutesLegsComboDebug(user, 'core-volume-cleanup-skip', {
      week: nextWeek?.weekIndex || null,
      directCoreSets: snapshot.totalSets,
      directCoreExposures: snapshot.exposures,
      reason: 'no_safe_non_core_replacement_or_removal'
    });
    break;
  }
  emitPlannerDiagnosticHeartbeat(user, 'after_week_processed', buildCoreCleanupMeta({
    callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_after_week_processed',
    coreSetCountAfter: snapshot.totalSets
  }));
  logAbsGlutesLegsComboDebug(user, 'core-volume-cleanup-exit', {
    week: nextWeek?.weekIndex || null,
    directCoreSets: snapshot.totalSets,
    directCoreExposures: snapshot.exposures,
    trimmed: true
  });
  return nextWeek;
}

function cleanupExcessCoreVolumeInSuccessfulPlan(weeks, user, exercises) {
  emitPlannerDiagnosticHeartbeat(user, 'entered_exact_cleanup_excess_core_volume_function', {
    functionName: 'cleanupExcessCoreVolumeInSuccessfulPlan',
    fileName: 'generator/trainingEngine.oblueprint.js',
    elapsedMs: plannerNowMs(),
    weeksLength: Array.isArray(weeks) ? weeks.length : 0,
    totalDayCount: Array.isArray(weeks) ? weeks.reduce((sum, week) => sum + (Array.isArray(week?.days) ? week.days.length : 0), 0) : 0,
    totalExerciseCount: Array.isArray(weeks) ? weeks.reduce((sum, week) => sum + ((Array.isArray(week?.days) ? week.days : []).reduce((daySum, day) => daySum + (Array.isArray(day?.exercises) ? day.exercises.length : 0), 0)), 0) : 0,
    requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
    requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
    selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
    callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_exact_entry'
  });
  if (String(process.env.OBLUEPRINT_BYPASS_CORE_CLEANUP_FOR_TIMEOUT_DIAG || '').trim() === '1') {
    emitPlannerDiagnosticHeartbeat(user, 'core_cleanup_bypassed_for_timeout_diag', {
      functionName: 'cleanupExcessCoreVolumeInSuccessfulPlan',
      fileName: 'generator/trainingEngine.oblueprint.js',
      elapsedMs: plannerNowMs(),
      weeksLength: Array.isArray(weeks) ? weeks.length : 0,
      totalDayCount: Array.isArray(weeks) ? weeks.reduce((sum, week) => sum + (Array.isArray(week?.days) ? week.days.length : 0), 0) : 0,
      totalExerciseCount: Array.isArray(weeks) ? weeks.reduce((sum, week) => sum + ((Array.isArray(week?.days) ? week.days : []).reduce((daySum, day) => daySum + (Array.isArray(day?.exercises) ? day.exercises.length : 0), 0)), 0) : 0,
      requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
      requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
      selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
      callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_bypassed'
    });
    return weeks;
  }
  if (!Array.isArray(weeks) || !weeks.length) return weeks;
  if (!(hasPriorityGroup(user, 'Abs') || hasPriorityGroup(user, 'Core'))) return weeks;
  emitPlannerDiagnosticHeartbeat(user, 'entered_cleanup_excess_core_volume', {
    functionName: 'cleanupExcessCoreVolumeInSuccessfulPlan',
    fileName: 'generator/trainingEngine.oblueprint.js',
    elapsedMs: plannerNowMs(),
    weeksLength: weeks.length,
    totalDayCount: weeks.reduce((sum, week) => sum + (Array.isArray(week?.days) ? week.days.length : 0), 0),
    totalExerciseCount: weeks.reduce((sum, week) => sum + ((Array.isArray(week?.days) ? week.days : []).reduce((daySum, day) => daySum + (Array.isArray(day?.exercises) ? day.exercises.length : 0), 0)), 0),
    requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
    requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
    selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
    callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_entered'
  });
  const result = weeks.map((week) => trimExcessWeeklyDirectCoreVolume(week, user, exercises));
  emitPlannerDiagnosticHeartbeat(user, 'cleanup_excess_core_volume_completed', {
    functionName: 'cleanupExcessCoreVolumeInSuccessfulPlan',
    fileName: 'generator/trainingEngine.oblueprint.js',
    elapsedMs: plannerNowMs(),
    weeksLength: result.length,
    totalDayCount: result.reduce((sum, week) => sum + (Array.isArray(week?.days) ? week.days.length : 0), 0),
    totalExerciseCount: result.reduce((sum, week) => sum + ((Array.isArray(week?.days) ? week.days : []).reduce((daySum, day) => daySum + (Array.isArray(day?.exercises) ? day.exercises.length : 0), 0)), 0),
    requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
    requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
    selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
    callBoundary: 'cleanupExcessCoreVolumeInSuccessfulPlan_completed'
  });
  return result;
}

function isBackToBackLowerHeavyDayType(dayType) {
  return ['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(dayType || ''));
}

function buildBackToBackLowerCleanupStructuralResult(day) {
  const base = buildLowerCoachCleanupStructuralResult(day);
  if (String(day?.dayType || '') !== 'FullBodyB') return base;
  if (!base.ok && !['missing_hinge_pattern', 'missing_quad_pattern'].includes(String(base.missingRequirement || ''))) return base;
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const families = exercises.map((exercise) => projectionFamilyForExercise(exercise)).filter(Boolean);
  const hasHinge = families.some((family) => family === 'hip_thrust' || family === 'hinge_pattern');
  const hasQuad = families.some((family) => ['squat_pattern', 'leg_press', 'leg_extension', 'single_leg'].includes(family));
  if (!hasHinge) {
    return {
      ok: false,
      missingRequirement: 'missing_hinge_pattern',
      reason: 'Lower-heavy full-body day must include one hinge pattern.',
      duplicates: Array.isArray(base?.duplicates) ? base.duplicates : []
    };
  }
  if (!hasQuad) {
    return {
      ok: false,
      missingRequirement: 'missing_quad_pattern',
      reason: 'Lower-heavy full-body day must include at least one quad pattern.',
      duplicates: Array.isArray(base?.duplicates) ? base.duplicates : []
    };
  }
  return {
    ok: true,
    missingRequirement: '',
    reason: '',
    duplicates: Array.isArray(base?.duplicates) ? base.duplicates : []
  };
}

function countDirectCoreExposureOnDay(day, user = null) {
  return (Array.isArray(day?.exercises) ? day.exercises : []).filter((exercise) => isDirectCoreExercise(exercise, user)).length;
}

function backToBackLowerFamilies(day) {
  return (Array.isArray(day?.exercises) ? day.exercises : []).map((exercise, index) => ({
    index,
    exercise,
    family: projectionFamilyForExercise(exercise)
  })).filter((entry) => ['hip_thrust', 'hinge_pattern', 'squat_pattern', 'leg_press', 'leg_extension', 'ham_curl'].includes(entry.family));
}

function findBackToBackLowerCleanupIndex(day, family) {
  const entries = backToBackLowerFamilies(day).filter((entry) => entry.family === family);
  return entries[entries.length - 1]?.index ?? -1;
}

function buildBackToBackLowerReplacementSpecs(dayType, repeatedFamily) {
  const dayKey = String(dayType || 'day').toLowerCase();
  if (repeatedFamily === 'hip_thrust') {
    return [
      {
        key: 'controlled_hinge',
        slot: {
          id: `${dayKey}_btb_hinge`,
          pattern: 'Compound',
          styleRequired: 'Compound',
          muscleTarget: 'Glutes',
          primaryAllowed: ['Glutes', 'Legs'],
          subPreferred: ['Hamstrings', 'Glutes'],
          subFallback: null,
          optional: false
        },
        predicate: (candidate, user) => {
          const name = normalizeName(candidate?.name);
          const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
          return (projectionFamilyForExercise(candidate, user) === 'hinge_pattern')
            && /(romanian deadlift|\brdl\b|stiff[-\s]*leg|pull through|pull-through|back extension|hyperextension)/.test(name)
            && (truth.progressionFriendly || truth.controlledHingeAllowed);
        }
      },
      {
        key: 'hamstring_curl',
        slot: {
          id: `${dayKey}_btb_hamcurl`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Legs',
          primaryAllowed: ['Legs'],
          subPreferred: ['Hamstrings-Curl'],
          subFallback: ['Hamstrings'],
          optional: false
        },
        predicate: (candidate, user) => /(leg curl|hamstring curl|glute ham raise)/.test(normalizeName(candidate?.name))
          && projectionFamilyForExercise(candidate, user) === 'ham_curl'
      }
    ];
  }
  if (repeatedFamily === 'leg_extension') {
    return [
      {
        key: 'hamstring_curl',
        slot: {
          id: `${dayKey}_btb_legext_hamcurl`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Legs',
          primaryAllowed: ['Legs'],
          subPreferred: ['Hamstrings-Curl'],
          subFallback: ['Hamstrings'],
          optional: false
        },
        predicate: (candidate, user) => /(leg curl|hamstring curl|glute ham raise)/.test(normalizeName(candidate?.name))
          && projectionFamilyForExercise(candidate, user) === 'ham_curl'
      },
      {
        key: 'calves',
        slot: {
          id: `${dayKey}_btb_legext_calf`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Calves',
          primaryAllowed: ['Legs'],
          subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
          subFallback: null,
          optional: false
        },
        predicate: (candidate, user) => projectionFamilyForExercise(candidate, user) === 'calves'
      },
      {
        key: 'glute_accessory',
        slot: {
          id: `${dayKey}_btb_legext_glute`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Glutes',
          primaryAllowed: ['Glutes', 'Legs'],
          subPreferred: ['Glutes'],
          subFallback: null,
          optional: false
        },
        predicate: (candidate, user) => isRealPosteriorChainBuilder(candidate, user) && !/(hip thrust|glute bridge)/.test(normalizeName(candidate?.name))
      }
    ];
  }
  if (repeatedFamily === 'ham_curl') {
    return [
      {
        key: 'calves',
        slot: {
          id: `${dayKey}_btb_hamcurl_calf`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Calves',
          primaryAllowed: ['Legs'],
          subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
          subFallback: null,
          optional: false
        },
        predicate: (candidate, user) => projectionFamilyForExercise(candidate, user) === 'calves'
      },
      {
        key: 'glute_accessory',
        slot: {
          id: `${dayKey}_btb_hamcurl_glute`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Glutes',
          primaryAllowed: ['Glutes', 'Legs'],
          subPreferred: ['Glutes'],
          subFallback: null,
          optional: false
        },
        predicate: (candidate, user) => isRealPosteriorChainBuilder(candidate, user) && !/(hip thrust|glute bridge)/.test(normalizeName(candidate?.name))
      }
    ];
  }
  if (repeatedFamily === 'squat_pattern' || repeatedFamily === 'leg_press') {
    return [
      {
        key: 'hamstring_curl',
        slot: {
          id: `${dayKey}_btb_squat_hamcurl`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Legs',
          primaryAllowed: ['Legs'],
          subPreferred: ['Hamstrings-Curl'],
          subFallback: ['Hamstrings'],
          optional: false
        },
        predicate: (candidate, user) => /(leg curl|hamstring curl|glute ham raise)/.test(normalizeName(candidate?.name))
          && projectionFamilyForExercise(candidate, user) === 'ham_curl'
      },
      {
        key: 'glute_accessory',
        slot: {
          id: `${dayKey}_btb_squat_glute`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Glutes',
          primaryAllowed: ['Glutes', 'Legs'],
          subPreferred: ['Glutes'],
          subFallback: null,
          optional: false
        },
        predicate: (candidate, user) => isRealPosteriorChainBuilder(candidate, user) && !/(hip thrust|glute bridge)/.test(normalizeName(candidate?.name))
      }
    ];
  }
  return [];
}

function buildBackToBackDaySnapshot(day, user = null, fallbackDay = '') {
  const src = day && typeof day === 'object' ? day : {};
  const exercises = Array.isArray(src?.exercises) ? src.exercises : [];
  return {
    day: String(src?.day || fallbackDay || '').trim() || null,
    dayType: String(src?.dayType || '').trim() || null,
    directCoreExposureCount: exercises.filter((exercise) => isDirectCoreExercise(exercise, user)).length,
    structure: buildBackToBackLowerCleanupStructuralResult(src),
    exercises: exercises.map((exercise, index) => ({
      index,
      name: String(exercise?.name || '').trim() || null,
      family: projectionFamilyForExercise(exercise, user) || '',
      directCore: isDirectCoreExercise(exercise, user)
    }))
  };
}

function buildBackToBackCleanupWeekSnapshot(week, user = null, options = {}) {
  const src = week && typeof week === 'object' ? week : {};
  const days = Array.isArray(src?.days) ? src.days : [];
  const schedule = Array.isArray(options?.schedule) ? options.schedule : [];
  const hydrateDay = (day, index) => ({
    ...(day || {}),
    day: String(day?.day || schedule[index]?.day || '').trim() || day?.day,
    dayType: String(day?.dayType || schedule[index]?.dayType || '').trim() || day?.dayType
  });
  const hydratedDays = days.map((day, index) => hydrateDay(day, index));
  const wednesdayLower = hydratedDays.find((day) => /^we(d)?$/i.test(String(day?.day || '')) || (String(day?.dayType || '') === 'Lower' && !hydratedDays.some((candidate) => /^we(d)?$/i.test(String(candidate?.day || '')))));
  const thursdayFullBodyB = hydratedDays.find((day) => /^th(u)?$/i.test(String(day?.day || '')) || (String(day?.dayType || '') === 'FullBodyB' && !hydratedDays.some((candidate) => /^th(u)?$/i.test(String(candidate?.day || '')))));
  return {
    week: Number.isFinite(Number(src?.weekIndex)) ? Number(src.weekIndex) : null,
    backToBackCleanupTouchedFinalPlan: Boolean(options?.touched),
    wednesdayLower: wednesdayLower ? buildBackToBackDaySnapshot(wednesdayLower, user, 'We') : null,
    thursdayFullBodyB: thursdayFullBodyB ? buildBackToBackDaySnapshot(thursdayFullBodyB, user, 'Th') : null,
    thursdayCoreExposureCount: thursdayFullBodyB ? countDirectCoreExposureOnDay(thursdayFullBodyB, user) : 0
  };
}

function buildShoulderPressCleanupDaySnapshot(day, user = null, options = {}) {
  const src = day && typeof day === 'object' ? day : {};
  const fallbackDay = String(options?.fallbackDay || '').trim();
  const exercises = Array.isArray(src?.exercises) ? src.exercises : [];
  return {
    day: String(src?.day || fallbackDay || '').trim() || null,
    dayType: String(src?.dayType || '').trim() || null,
    shoulderPressCount: exercises.filter((exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return Boolean(truth?.shoulderPressPattern);
    }).length,
    exercises: exercises.map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return {
        index,
        name: String(exercise?.name || '').trim() || null,
        shoulderPressPattern: Boolean(truth?.shoulderPressPattern),
        lateralDeltPattern: Boolean(truth?.lateralDeltPattern),
        rearDeltPattern: Boolean(truth?.rearDeltPattern)
      };
    })
  };
}

function cleanupBackToBackLowerDayRedundancyInWeek(week, user, exercises) {
  if (!shouldTrackAbsGlutesLegsComboDebug(user)) return week;
  const nextWeek = {
    ...week,
    days: Array.isArray(week?.days)
      ? week.days.map((day) => ({
        ...day,
        exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : []
      }))
      : []
  };
  let touched = false;
  logAbsGlutesLegsComboDebug(user, 'before_back_to_back_cleanup_week_snapshot', buildBackToBackCleanupWeekSnapshot(nextWeek, user, {
    touched
  }));
  for (let dayIndex = 1; dayIndex < nextWeek.days.length; dayIndex += 1) {
    const firstDay = nextWeek.days[dayIndex - 1];
    const secondDay = nextWeek.days[dayIndex];
    if (!isBackToBackLowerHeavyDayType(firstDay?.dayType) || !isBackToBackLowerHeavyDayType(secondDay?.dayType)) continue;
    const firstFamilies = new Set(backToBackLowerFamilies(firstDay).map((entry) => entry.family));
    const repeatedFamilies = ['leg_extension', 'hip_thrust', 'ham_curl', 'leg_press', 'squat_pattern']
      .filter((family) => firstFamilies.has(family) && backToBackLowerFamilies(secondDay).some((entry) => entry.family === family));
    logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_entry', {
      week: nextWeek?.weekIndex || null,
      firstDay: firstDay?.day || null,
      firstDayType: firstDay?.dayType || null,
      secondDay: secondDay?.day || null,
      secondDayType: secondDay?.dayType || null,
      repeatedFamilies
    });
    if (!repeatedFamilies.length) {
      logAbsGlutesLegsComboDebug(user, 'repeatedFamilies detected', {
        week: nextWeek?.weekIndex || null,
        firstDay: firstDay?.day || null,
        secondDay: secondDay?.day || null,
        repeatedFamilies
      });
      logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_skip', {
        week: nextWeek?.weekIndex || null,
        firstDay: firstDay?.day || null,
        secondDay: secondDay?.day || null,
        reason: 'no_repeated_family'
      });
      continue;
    }
    let changed = false;
    let lastRejectionReason = 'no_replacement_found';
    for (const repeatedFamily of repeatedFamilies) {
      const replaceIdx = findBackToBackLowerCleanupIndex(secondDay, repeatedFamily);
      if (replaceIdx < 0) {
        lastRejectionReason = 'no_replacement_found';
        continue;
      }
      const current = secondDay.exercises?.[replaceIdx];
      if (!current) {
        lastRejectionReason = 'no_replacement_found';
        continue;
      }
      const selectedFamily = projectionFamilyForExercise(current, user);
      const replacementSpecs = buildBackToBackLowerReplacementSpecs(secondDay?.dayType || '', repeatedFamily);
      logAbsGlutesLegsComboDebug(user, 'repeatedFamilies detected', {
        week: nextWeek?.weekIndex || null,
        firstDay: firstDay?.day || null,
        secondDay: secondDay?.day || null,
        repeatedFamilies
      });
      logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_target', {
        week: nextWeek?.weekIndex || null,
        firstDay: firstDay?.day || null,
        secondDay: secondDay?.day || null,
        repeatedFamily,
        selectedExerciseIndex: replaceIdx,
        selectedExerciseName: current?.name || null,
        selectedExerciseFamily: selectedFamily || '',
        replacementSpecs: replacementSpecs.map((spec) => spec.key)
      });
      if ((repeatedFamily === 'squat_pattern' || repeatedFamily === 'leg_press')
        && backToBackLowerFamilies(secondDay).filter((entry) => ['squat_pattern', 'leg_press', 'leg_extension', 'single_leg'].includes(entry.family)).length <= 1) {
        lastRejectionReason = 'would_remove_only_quad_pattern';
        continue;
      }
      for (const spec of replacementSpecs) {
        const replacement = buildQualityReplacement(secondDay, current, spec.slot, user, exercises, String(week?.weekType || 'base'), (candidate) => spec.predicate(candidate, user));
        const replacementFamily = replacement ? projectionFamilyForExercise(replacement, user) : '';
        if (!replacement) {
          lastRejectionReason = 'no_replacement_found';
          logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_replacement_attempt', {
            week: nextWeek?.weekIndex || null,
            firstDay: firstDay?.day || null,
            secondDay: secondDay?.day || null,
            repeatedFamily,
            selectedExerciseIndex: replaceIdx,
            selectedExerciseName: current?.name || null,
            selectedExerciseFamily: selectedFamily || '',
            replacementSpec: spec.key,
            buildQualityReplacementResult: null,
            rejectionReason: lastRejectionReason
          });
          continue;
        }
        if (normalizeName(replacement?.name) === normalizeName(current?.name)) {
          lastRejectionReason = 'replacement_same_family';
          logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_replacement_attempt', {
            week: nextWeek?.weekIndex || null,
            firstDay: firstDay?.day || null,
            secondDay: secondDay?.day || null,
            repeatedFamily,
            selectedExerciseIndex: replaceIdx,
            selectedExerciseName: current?.name || null,
            selectedExerciseFamily: selectedFamily || '',
            replacementSpec: spec.key,
            buildQualityReplacementResult: {
              name: replacement?.name || null,
              family: replacementFamily || ''
            },
            rejectionReason: lastRejectionReason
          });
          continue;
        }
        if (replacementFamily && replacementFamily === repeatedFamily) {
          lastRejectionReason = 'replacement_same_family';
          logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_replacement_attempt', {
            week: nextWeek?.weekIndex || null,
            firstDay: firstDay?.day || null,
            secondDay: secondDay?.day || null,
            repeatedFamily,
            selectedExerciseIndex: replaceIdx,
            selectedExerciseName: current?.name || null,
            selectedExerciseFamily: selectedFamily || '',
            replacementSpec: spec.key,
            buildQualityReplacementResult: {
              name: replacement?.name || null,
              family: replacementFamily || ''
            },
            rejectionReason: lastRejectionReason
          });
          continue;
        }
        const trialDay = {
          ...secondDay,
          exercises: (secondDay.exercises || []).map((exercise, exerciseIndex) => exerciseIndex === replaceIdx ? replacement : exercise)
        };
        if ((trialDay.exercises || []).some((exercise, exerciseIndex) => exerciseIndex !== replaceIdx && normalizeName(exercise?.name) === normalizeName(replacement?.name))) {
          lastRejectionReason = 'duplicate_name';
          logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_replacement_attempt', {
            week: nextWeek?.weekIndex || null,
            firstDay: firstDay?.day || null,
            secondDay: secondDay?.day || null,
            repeatedFamily,
            selectedExerciseIndex: replaceIdx,
            selectedExerciseName: current?.name || null,
            selectedExerciseFamily: selectedFamily || '',
            replacementSpec: spec.key,
            buildQualityReplacementResult: {
              name: replacement?.name || null,
              family: replacementFamily || ''
            },
            rejectionReason: lastRejectionReason
          });
          continue;
        }
        trialDay.exercises = organizeDayExerciseOrder(trialDay.dayType || '', trialDay.exercises || [], user);
        const structure = buildBackToBackLowerCleanupStructuralResult(trialDay);
        if (!structure.ok) {
          lastRejectionReason = 'structural_validator_failed';
          logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_replacement_attempt', {
            week: nextWeek?.weekIndex || null,
            firstDay: firstDay?.day || null,
            secondDay: secondDay?.day || null,
            repeatedFamily,
            selectedExerciseIndex: replaceIdx,
            selectedExerciseName: current?.name || null,
            selectedExerciseFamily: selectedFamily || '',
            replacementSpec: spec.key,
            buildQualityReplacementResult: {
              name: replacement?.name || null,
              family: replacementFamily || ''
            },
            rejectionReason: lastRejectionReason,
            structuralResult: structure
          });
          continue;
        }
        if (hasPriorityGroup(user, 'Abs') && countDirectCoreExposureOnDay(secondDay, user) > 0 && countDirectCoreExposureOnDay(trialDay, user) < 1) {
          lastRejectionReason = 'would_remove_core_exposure';
          logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_replacement_attempt', {
            week: nextWeek?.weekIndex || null,
            firstDay: firstDay?.day || null,
            secondDay: secondDay?.day || null,
            repeatedFamily,
            selectedExerciseIndex: replaceIdx,
            selectedExerciseName: current?.name || null,
            selectedExerciseFamily: selectedFamily || '',
            replacementSpec: spec.key,
            buildQualityReplacementResult: {
              name: replacement?.name || null,
              family: replacementFamily || ''
            },
            rejectionReason: lastRejectionReason
          });
          continue;
        }
        logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_replacement_attempt', {
          week: nextWeek?.weekIndex || null,
          firstDay: firstDay?.day || null,
          secondDay: secondDay?.day || null,
          repeatedFamily,
          selectedExerciseIndex: replaceIdx,
          selectedExerciseName: current?.name || null,
          selectedExerciseFamily: selectedFamily || '',
          replacementSpec: spec.key,
          buildQualityReplacementResult: {
            name: replacement?.name || null,
            family: replacementFamily || ''
          },
          rejectionReason: ''
        });
        nextWeek.days[dayIndex] = trialDay;
        logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_swap', {
          week: nextWeek?.weekIndex || null,
          firstDay: firstDay?.day || null,
          secondDay: secondDay?.day || null,
          repeatedFamily,
          removedExercise: current?.name || null,
          replacementExercise: replacement?.name || null,
          replacementFamily: projectionFamilyForExercise(replacement, user)
        });
        changed = true;
        touched = true;
        break;
      }
      if (changed) break;
    }
    if (!changed) {
      logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_skip', {
        week: nextWeek?.weekIndex || null,
        firstDay: firstDay?.day || null,
        secondDay: secondDay?.day || null,
        repeatedFamilies,
        reason: lastRejectionReason || 'no_replacement_found'
      });
    }
  }
  nextWeek.__backToBackCleanupTouchedFinalPlan = touched;
  logAbsGlutesLegsComboDebug(user, 'after_back_to_back_cleanup_week_snapshot', buildBackToBackCleanupWeekSnapshot(nextWeek, user, {
    touched
  }));
  logAbsGlutesLegsComboDebug(user, 'back_to_back_lower_cleanup_exit', {
    week: nextWeek?.weekIndex || null,
    backToBackCleanupTouchedFinalPlan: touched
  });
  return nextWeek;
}

function cleanupBackToBackLowerDayRedundancyInSuccessfulPlan(weeks, user, exercises) {
  if (!Array.isArray(weeks) || !weeks.length) return weeks;
  if (!shouldTrackAbsGlutesLegsComboDebug(user)) return weeks;
  return weeks.map((week) => cleanupBackToBackLowerDayRedundancyInWeek(week, user, exercises));
}

function armPriorityRepairTarget(user, targets, key) {
  const configured = Number(targets?.[key] || 8);
  const favorable = hasPriorityGroup(user, 'Arms')
    && Number(user?.daysPerWeek || 0) >= 5
    && String(user?.profile?.sessionBandwidth || '') !== 'tight'
    && Math.max(
      Number(user?.injuryMap?.shoulder || 0),
      Number(user?.injuryMap?.elbow || 0),
      Number(user?.injuryMap?.wrist || 0)
    ) < 6;
  return favorable ? Math.min(12, Math.max(configured, 10)) : configured;
}

function chooseNeckReplacementSpec(day, days, user, targets) {
  const directSets = currentWeekDirectSets(days);
  const dayType = String(day?.dayType || '');
  const canUseBiceps = ['Pull', 'UpperFocus', 'DeltsArms', 'Upper'].includes(dayType);
  const canUseTriceps = ['Push', 'UpperFocus', 'DeltsArms', 'Upper'].includes(dayType);
  const canUseShoulders = ['Push', 'Pull', 'UpperFocus', 'DeltsArms', 'Upper'].includes(dayType);
  const canUseAbs = ['Push', 'Pull', 'Legs', 'UpperFocus', 'DeltsArms', 'Upper', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB'].includes(dayType);

  const bicepsTarget = armPriorityRepairTarget(user, targets, 'Biceps');
  const tricepsTarget = armPriorityRepairTarget(user, targets, 'Triceps');
  const bicepsSets = Number(directSets?.Biceps || 0);
  const tricepsSets = Number(directSets?.Triceps || 0);
  const shouldersSets = Number(directSets?.Shoulders || 0);
  const absSets = Number(directSets?.Abs || 0);

  if (hasPriorityGroup(user, 'Arms') && canUseBiceps && bicepsSets < bicepsTarget) {
    return {
      slot: buildExactPriorityRepairSlot(dayType, 'Biceps'),
      predicate: (candidate) => String(candidate?.canonicalTruth?.directArmType || buildExerciseTruth(candidate, user).directArmType) === 'biceps'
    };
  }
  if (hasPriorityGroup(user, 'Arms') && canUseTriceps && tricepsSets < tricepsTarget) {
    const family = tricepsSets < 8 ? 'pushdown' : 'overhead';
    return {
      slot: buildExactPriorityRepairSlot(dayType, 'Triceps', family),
      predicate: (candidate) => String(candidate?.canonicalTruth?.directArmType || buildExerciseTruth(candidate, user).directArmType) === 'triceps'
    };
  }
  if (hasPriorityGroup(user, 'Shoulders') && canUseShoulders && shouldersSets < Number(targets?.Shoulders || 0)) {
    return {
      slot: buildExactPriorityRepairSlot(dayType, 'Shoulders', 'lateral'),
      predicate: (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.lateralDeltPattern || truth.rearDeltPattern;
      }
    };
  }
  if (hasPriorityGroup(user, 'Abs') && canUseAbs && absSets < Number(targets?.Abs || 0)) {
    const existingFamilies = new Set((day?.exercises || []).map((ex) => String(ex?.coreFamily || 'none')).filter((family) => family !== 'none'));
    const variant = !existingFamilies.has('rotation') ? 'rotation' : !existingFamilies.has('stability') ? 'stability' : 'flexion';
    return {
      slot: buildExactPriorityRepairSlot(dayType, 'Abs', variant),
      predicate: (candidate) => Boolean(buildExerciseTruth(candidate, user).directAb)
    };
  }
  return null;
}

function findPriorityRepairReplacementIndex(day, user) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const ranked = exercises
    .map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      if (isNeckExercise(exercise, user)) return { index, score: 100 };
      let score = 0;
      if (String(exercise?.style || '') === 'Isolation') score += 40;
      if (exercise?.optional) score += 16;
      if (!exercisePriorityOrderRank(exercise, user) || exercisePriorityOrderRank(exercise, user) < 99) score -= 30;
      if (truth.directAb && !hasPriorityGroup(user, 'Abs')) score += 8;
      if (truth.directCalf && !hasPriorityGroup(user, 'Calves')) score += 8;
      if (String(exercise?.style || '') === 'Compound' && truth.progressionFriendly) score -= 16;
      score += index;
      return { index, score };
    })
    .sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked[0]?.index ?? -1;
}

function insertOrReplacePriorityExercise(day, user, exercises, weekType, slot, predicate = null) {
  if (!slot) return false;
  const nextDay = day;
  if ((nextDay?.exercises || []).length < Number(user?.sessionCap || 99)) {
    const replacement = buildQualityReplacement(nextDay, { sets: 2, style: slot.styleRequired, slotId: slot.id, primary: slot.muscleTarget, muscleTarget: slot.muscleTarget }, slot, user, exercises, weekType, predicate);
    if (replacement) {
      nextDay.exercises.push(replacement);
      nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises, user);
      return true;
    }
  }
  const replaceIdx = findPriorityRepairReplacementIndex(nextDay, user);
  if (replaceIdx < 0) return false;
  const current = nextDay.exercises[replaceIdx];
  const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, predicate);
  if (!replacement) return false;
  nextDay.exercises.splice(replaceIdx, 1, replacement);
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises, user);
  return true;
}

function repairVisiblePriorityStructure(weeks, user, exercises, targets = {}) {
  if (!Array.isArray(weeks) || !weeks.length) return weeks;
  const nextWeeks = weeks.map((week) => ({
    ...week,
    days: (week?.days || []).map((day) => ({
      ...day,
      exercises: (day?.exercises || []).slice()
    }))
  }));
  const shoulderDays = ['DeltsArms', 'UpperFocus', 'Pull', 'Push', 'Upper'];
  const bicepsDays = ['Pull', 'UpperFocus', 'DeltsArms', 'Upper'];
  const tricepsDays = ['Push', 'UpperFocus', 'DeltsArms', 'Upper'];
  const absDays = ['Push', 'Pull', 'Legs', 'UpperFocus', 'DeltsArms', 'Upper'];

  nextWeeks.forEach((week) => {
    const days = week?.days || [];
    days.forEach((day) => {
      for (let index = (day?.exercises || []).length - 1; index >= 0; index -= 1) {
        const current = day.exercises[index];
        if (neckAllowedForUser(user) || !isNeckExercise(current, user)) continue;
        const spec = chooseNeckReplacementSpec(day, days, user, targets);
        if (spec?.slot) {
          const replacement = buildQualityReplacement(day, current, spec.slot, user, exercises, String(week?.weekType || 'base'), spec.predicate);
          if (replacement && !isNeckExercise(replacement, user)) {
            day.exercises.splice(index, 1, replacement);
            continue;
          }
        }
        day.exercises.splice(index, 1);
      }
      day.exercises = organizeDayExerciseOrder(day.dayType || '', day.exercises || [], user);
    });
    const countBy = (predicate) => days.reduce((sum, day) => sum + (day.exercises || []).filter(predicate).length, 0);
    const familySet = () => new Set(days.flatMap((day) => (day.exercises || []).map((ex) => String(ex?.coreFamily || 'none')).filter((family) => family !== 'none')));

    if (hasPriorityGroup(user, 'Shoulders')) {
      let totalShoulders = countBy((ex) => exerciseDirectlyServesPriority(ex, 'Shoulders', user));
      let lateralRear = countBy((ex) => Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern));
      for (const [variant, needed] of [['lateral', 1], ['rear', 1]]) {
        while ((variant === 'lateral'
          ? countBy((ex) => Boolean(ex?.lateralDeltPattern))
          : countBy((ex) => Boolean(ex?.rearDeltPattern))) < needed) {
          const day = days.find((entry) => shoulderDays.includes(String(entry?.dayType || '')));
          if (!day) break;
          const slot = buildExactPriorityRepairSlot(day.dayType, 'Shoulders', variant);
          const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), slot, (candidate) => {
            const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
            return variant === 'lateral' ? truth.lateralDeltPattern : truth.rearDeltPattern;
          });
          if (!ok) break;
        }
      }
      totalShoulders = countBy((ex) => exerciseDirectlyServesPriority(ex, 'Shoulders', user));
      lateralRear = countBy((ex) => Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern));
      while (Number(user?.daysPerWeek || 0) >= 5 && totalShoulders < 3) {
        const day = days.find((entry) => shoulderDays.includes(String(entry?.dayType || '')));
        if (!day) break;
        const slot = buildExactPriorityRepairSlot(day.dayType, 'Shoulders', lateralRear < 2 ? 'rear' : 'lateral');
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), slot, (candidate) => {
          const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
          return truth.lateralDeltPattern || truth.rearDeltPattern;
        });
        if (!ok) break;
        totalShoulders = countBy((ex) => exerciseDirectlyServesPriority(ex, 'Shoulders', user));
        lateralRear = countBy((ex) => Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern));
      }
    }

    if (hasPriorityGroup(user, 'Arms')) {
      while (countBy((ex) => String(ex?.directArmType || '') === 'biceps') < 2) {
        const day = days.find((entry) => bicepsDays.includes(String(entry?.dayType || '')));
        if (!day) break;
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), buildExactPriorityRepairSlot(day.dayType, 'Biceps'), (candidate) => String(candidate?.canonicalTruth?.directArmType || buildExerciseTruth(candidate, user).directArmType) === 'biceps');
        if (!ok) break;
      }
      while (countBy((ex) => String(ex?.directArmType || '') === 'triceps') < 2) {
        const family = countBy((ex) => tricepsMovementFamily(ex?.name) === 'pushdown') < 1 ? 'pushdown' : 'overhead';
        const day = days.find((entry) => tricepsDays.includes(String(entry?.dayType || '')));
        if (!day) break;
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), buildExactPriorityRepairSlot(day.dayType, 'Triceps', family), (candidate) => String(candidate?.canonicalTruth?.directArmType || buildExerciseTruth(candidate, user).directArmType) === 'triceps');
        if (!ok) break;
      }
      const desiredBicepsSets = armPriorityRepairTarget(user, targets, 'Biceps');
      const desiredTricepsSets = armPriorityRepairTarget(user, targets, 'Triceps');
      while (Number(currentWeekDirectSets(days)?.Biceps || 0) < 8) {
        const day = days.find((entry) => bicepsDays.includes(String(entry?.dayType || '')));
        if (!day) break;
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), buildExactPriorityRepairSlot(day.dayType, 'Biceps'), (candidate) => String(candidate?.canonicalTruth?.directArmType || buildExerciseTruth(candidate, user).directArmType) === 'biceps');
        if (!ok) break;
      }
      while (Number(currentWeekDirectSets(days)?.Triceps || 0) < 8) {
        const day = days.find((entry) => tricepsDays.includes(String(entry?.dayType || '')));
        if (!day) break;
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), buildExactPriorityRepairSlot(day.dayType, 'Triceps', 'pushdown'), (candidate) => String(candidate?.canonicalTruth?.directArmType || buildExerciseTruth(candidate, user).directArmType) === 'triceps');
        if (!ok) break;
      }
      while (Number(currentWeekDirectSets(days)?.Biceps || 0) < desiredBicepsSets && Number(currentWeekDirectSets(days)?.Biceps || 0) < 12) {
        const day = days.find((entry) => bicepsDays.includes(String(entry?.dayType || '')));
        if (!day) break;
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), buildExactPriorityRepairSlot(day.dayType, 'Biceps'), (candidate) => String(candidate?.canonicalTruth?.directArmType || buildExerciseTruth(candidate, user).directArmType) === 'biceps');
        if (!ok) break;
      }
      while (Number(currentWeekDirectSets(days)?.Triceps || 0) < desiredTricepsSets && Number(currentWeekDirectSets(days)?.Triceps || 0) < 12) {
        const day = days.find((entry) => tricepsDays.includes(String(entry?.dayType || '')));
        if (!day) break;
        const family = countBy((ex) => tricepsMovementFamily(ex?.name) === 'pushdown') < 1 ? 'pushdown' : 'overhead';
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), buildExactPriorityRepairSlot(day.dayType, 'Triceps', family), (candidate) => String(candidate?.canonicalTruth?.directArmType || buildExerciseTruth(candidate, user).directArmType) === 'triceps');
        if (!ok) break;
      }
    }

    if (hasPriorityGroup(user, 'Abs')) {
      while (countBy((ex) => Boolean(ex?.directAb)) < 3 && Number(user?.daysPerWeek || 0) >= 5 && Number(currentWeekDirectSets(days)?.Abs || 0) < 12) {
        bumpLowerBodyRepairLoopGuard(user, 'priorityRepair', {
          functionName: 'repairVisiblePriorityStructure',
          week: week?.weekIndex,
          lastAttemptedRepair: 'add-core-priority-exposure',
          missingRequirement: 'core exposure'
        });
        const currentFamilies = familySet();
        const variant = !currentFamilies.has('flexion') ? 'flexion' : !currentFamilies.has('rotation') ? 'rotation' : 'stability';
        const day = days.find((entry) => absDays.includes(String(entry?.dayType || '')));
        if (!day) break;
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), buildExactPriorityRepairSlot(day.dayType, 'Abs', variant), (candidate) => Boolean(buildExerciseTruth(candidate, user).directAb));
        if (!ok) break;
        if (isNarrowPosteriorCoreUser(user) && countBy((ex) => Boolean(ex?.directAb)) >= 2) {
          markLowerBodyGracefulDegrade(user, 'Met minimum lower-body core presence without chasing full ideal core volume.');
          break;
        }
      }
      while (familySet().size < Math.min(3, Number(user?.daysPerWeek || 0) >= 5 ? 3 : 2)) {
        bumpLowerBodyRepairLoopGuard(user, 'priorityRepair', {
          functionName: 'repairVisiblePriorityStructure',
          week: week?.weekIndex,
          lastAttemptedRepair: 'diversify-core-family',
          missingRequirement: 'core family diversity'
        });
        const currentFamilies = familySet();
        const variant = !currentFamilies.has('rotation') ? 'rotation' : !currentFamilies.has('stability') ? 'stability' : 'flexion';
        const day = days.find((entry) => absDays.includes(String(entry?.dayType || '')) && !(entry.exercises || []).some((ex) => String(ex?.coreFamily || '') === variant));
        if (!day) break;
        const ok = insertOrReplacePriorityExercise(day, user, exercises, String(week?.weekType || 'base'), buildExactPriorityRepairSlot(day.dayType, 'Abs', variant), (candidate) => Boolean(buildExerciseTruth(candidate, user).directAb));
        if (!ok) break;
        if (isNarrowPosteriorCoreUser(user) && familySet().size >= 2) {
          markLowerBodyGracefulDegrade(user, 'Accepted minimum core variety after lower-body structure requirements were met.');
          break;
        }
      }
    }

    week.days = days.map((day) => ({
      ...day,
      exercises: organizeDayExerciseOrder(day.dayType || '', day.exercises || [], user)
    }));
  });
  return nextWeeks;
}

function sameMuscleReplacementPredicate(current, day, user, preferDifferentTricepsFamily = false) {
  const currentTruth = current?.canonicalTruth || buildExerciseTruth(current, user);
  const existingTricepsFamilies = tricepsFamiliesOnDay(day, current);
  return (candidate) => {
    if (sameDayExerciseExists(day, candidate, current)) return false;
    const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
    if (currentTruth.directArmType === 'biceps') return String(truth?.directArmType || '') === 'biceps';
    if (currentTruth.directArmType === 'triceps') {
      if (String(truth?.directArmType || '') !== 'triceps') return false;
      if (!preferDifferentTricepsFamily) return true;
      const family = tricepsMovementFamily(candidate?.name);
      return family === 'none' || !existingTricepsFamilies.has(family);
    }
    if (currentTruth.directAb) return Boolean(truth?.directAb);
    if (currentTruth.directCalf) return Boolean(truth?.directCalf);
    if (currentTruth.lateralDeltPattern || currentTruth.rearDeltPattern || currentTruth.shoulderPressPattern) {
      return Boolean(truth?.lateralDeltPattern || truth?.rearDeltPattern || truth?.shoulderPressPattern);
    }
    const currentTargets = new Set(getExerciseDirectTargetKeys(current, user));
    const candidateTargets = new Set(getExerciseDirectTargetKeys(candidate, user));
    return [...currentTargets].some((target) => candidateTargets.has(target))
      || String(candidate?.muscleTarget || candidate?.primary || '') === String(current?.muscleTarget || current?.primary || '');
  };
}

function dedupeAndDiversifyDay(day, user, exercises) {
  const nextDay = {
    ...day,
    exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : []
  };
  const weekType = 'base';
  const seen = new Set();
  for (let index = 0; index < nextDay.exercises.length; index += 1) {
    const current = nextDay.exercises[index];
    const key = exerciseDayIdentityKey(current);
    if (!key || !seen.has(key)) {
      seen.add(key);
      continue;
    }
    const slot = buildFallbackSlotFromExercise(current);
    let replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, sameMuscleReplacementPredicate(current, nextDay, user));
    if (!replacement) replacement = findReplacementExerciseForPlan(current, user, exercises, nextDay.dayType || '', seen);
    if (replacement && !sameDayExerciseExists(nextDay, replacement, current)) {
      nextDay.exercises.splice(index, 1, replacement);
      seen.add(exerciseDayIdentityKey(replacement));
      continue;
    }
    nextDay.exercises.splice(index, 1);
    index -= 1;
  }

  const seenTriFamilies = new Set();
  for (let index = 0; index < nextDay.exercises.length; index += 1) {
    const current = nextDay.exercises[index];
    const truth = current?.canonicalTruth || buildExerciseTruth(current, user);
    if (String(truth?.directArmType || '') !== 'triceps') continue;
    const family = tricepsMovementFamily(current?.name);
    if (!family || family === 'none' || !seenTriFamilies.has(family)) {
      if (family && family !== 'none') seenTriFamilies.add(family);
      continue;
    }
    const slot = buildFallbackSlotFromExercise(current);
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, sameMuscleReplacementPredicate(current, nextDay, user, true));
    if (replacement && !sameDayExerciseExists(nextDay, replacement, current)) {
      nextDay.exercises.splice(index, 1, replacement);
      const replacementFamily = tricepsMovementFamily(replacement?.name);
      if (replacementFamily && replacementFamily !== 'none') seenTriFamilies.add(replacementFamily);
    }
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises, user);
  return nextDay;
}

function dayDuplicateKeys(day) {
  const seen = new Set();
  const duplicates = [];
  for (const exercise of Array.isArray(day?.exercises) ? day.exercises : []) {
    const key = exerciseDayIdentityKey(exercise);
    if (!key) continue;
    if (seen.has(key)) duplicates.push(key);
    else seen.add(key);
  }
  return duplicates;
}

function enforceFinalVisibleDedupeInvariant(weeks, user, exercises) {
  if (!Array.isArray(weeks)) return weeks;
  const nextWeeks = weeks.map((week) => ({
    ...week,
    days: (week?.days || []).map((day) => ({
      ...day,
      exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : []
    }))
  }));
  for (let weekIndex = 0; weekIndex < nextWeeks.length; weekIndex += 1) {
    const week = nextWeeks[weekIndex];
    for (let dayIndex = 0; dayIndex < (week?.days || []).length; dayIndex += 1) {
      let nextDay = week.days[dayIndex];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        nextDay = dedupeAndDiversifyDay(nextDay, user, exercises);
        const duplicates = dayDuplicateKeys(nextDay);
        if (!duplicates.length) break;
        for (let exIdx = 0; exIdx < nextDay.exercises.length; exIdx += 1) {
          const current = nextDay.exercises[exIdx];
          const key = exerciseDayIdentityKey(current);
          if (!key) continue;
          const firstIdx = nextDay.exercises.findIndex((exercise) => exerciseDayIdentityKey(exercise) === key);
          if (firstIdx === exIdx) continue;
          const preferDifferentTricepsFamily = String(current?.canonicalTruth?.directArmType || buildExerciseTruth(current, user).directArmType) === 'triceps';
          const slot = buildFallbackSlotFromExercise(current);
          const replacement = buildQualityReplacement(
            nextDay,
            current,
            slot,
            user,
            exercises,
            'base',
            sameMuscleReplacementPredicate(current, nextDay, user, preferDifferentTricepsFamily)
          );
          if (replacement && !sameDayExerciseExists(nextDay, replacement, current)) {
            nextDay.exercises.splice(exIdx, 1, replacement);
          } else {
            nextDay.exercises.splice(exIdx, 1);
            exIdx -= 1;
          }
        }
      }
      const finalDuplicates = dayDuplicateKeys(nextDay);
      if (finalDuplicates.length) {
        finalDuplicates.forEach((duplicateKey) => {
          const duplicateExercise = (nextDay.exercises || []).find((exercise) => exerciseDayIdentityKey(exercise) === duplicateKey);
          console.warn('FINAL_DEDUPE_FAILED', {
            week: Number(week?.weekIndex || weekIndex + 1),
            day: String(nextDay?.dayType || ''),
            dayIndex,
            duplicateExerciseName: String(duplicateExercise?.canonicalName || duplicateExercise?.name || duplicateKey)
          });
        });
      }
      week.days[dayIndex] = {
        ...nextDay,
        exercises: organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises || [], user)
      };
    }
  }
  return nextWeeks;
}

function repairAndValidatePlan(weeks, user, exercises) {
  return withPlannerTiming(user, 'finalPolishRepairMs', () => {
    logComboStageEnter(user, 'final validation');
    const finalValidationMeta = {
      functionName: 'repairAndValidatePlan',
      fileName: 'generator/trainingEngine.oblueprint.js',
      elapsedMs: plannerNowMs(),
      requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
      requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
      selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
      planExists: Array.isArray(weeks),
      weeksLength: Array.isArray(weeks) ? weeks.length : undefined,
      callBoundary: 'repairAndValidatePlan_after_logComboStageEnter'
    };
    emitPlannerDiagnosticHeartbeat(user, 'after_final_validation_logcombo_enter', finalValidationMeta);
    emitPlannerDiagnosticHeartbeat(user, 'before_final_validation_plan_shape_check', finalValidationMeta);
    const weeksArray = Array.isArray(weeks) ? weeks : [];
    emitPlannerDiagnosticHeartbeat(user, 'after_final_validation_plan_shape_check', {
      ...finalValidationMeta,
      planExists: true,
      weeksLength: weeksArray.length,
      callBoundary: 'repairAndValidatePlan_after_plan_shape_check'
    });
    const isInvalidForFinal = (candidate, dayType) => isHardBannedExercise(candidate)
      || (!neckAllowedForUser(user) && isNeckExercise(candidate, user))
      || ((user.discipline === 'bodybuilding' || user.discipline === 'powerbuilding') && candidate.isCalisthenicsLike && !user?.profile?.bodyweightDominant)
      || !isExerciseCompatibleWithEquipment(candidate, user)
      || evaluateJoint(candidate, user).reject
      || violatesDayTypeQuality(candidate, dayType || '');
    emitPlannerDiagnosticHeartbeat(user, 'before_final_validation_normalization', {
      ...finalValidationMeta,
      planExists: true,
      weeksLength: weeksArray.length,
      callBoundary: 'repairAndValidatePlan_before_normalization'
    });
    const sanitized = [];
    let filteredCount = 0;
    let firstDayProcessed = false;
    for (const week of weeksArray) {
      emitPlannerDiagnosticHeartbeat(user, 'before_week_normalization_loop', {
        ...finalValidationMeta,
        planExists: true,
        weeksLength: weeksArray.length,
        callBoundary: 'repairAndValidatePlan_before_week_loop',
        week: Number.isFinite(Number(week?.weekIndex)) ? Number(week.weekIndex) : undefined
      });
      const nextDays = [];
      for (const day of Array.isArray(week?.days) ? week.days : []) {
        emitPlannerDiagnosticHeartbeat(user, 'entered_day_normalization_loop', {
          ...finalValidationMeta,
          planExists: true,
          weeksLength: weeksArray.length,
          callBoundary: 'repairAndValidatePlan_day_loop',
          week: Number.isFinite(Number(week?.weekIndex)) ? Number(week.weekIndex) : undefined,
          dayType: String(day?.dayType || '').trim() || undefined,
          dayExerciseCount: Array.isArray(day?.exercises) ? day.exercises.length : 0
        });
        const nextExercises = [];
        const usedNames = new Set();
        for (const ex of Array.isArray(day?.exercises) ? day.exercises : []) {
          let candidate = ex;
          const invalid = isInvalidForFinal(candidate, day?.dayType || '');
          if (invalid) {
            filteredCount += 1;
            candidate = findReplacementExerciseForPlan(candidate, user, exercises, day?.dayType || '', usedNames);
          }
          if (!candidate) continue;
          usedNames.add(exerciseDayIdentityKey(candidate));
          nextExercises.push({
            ...candidate,
            sets: Math.max(1, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(candidate.sets) || 1))
          });
        }
        emitPlannerDiagnosticHeartbeat(user, 'before_apply_session_cap_trimming', {
          ...finalValidationMeta,
          callBoundary: 'repairAndValidatePlan_before_apply_session_cap_trimming',
          week: Number.isFinite(Number(week?.weekIndex)) ? Number(week.weekIndex) : undefined,
          dayType: String(day?.dayType || '').trim() || undefined,
          dayExerciseCount: nextExercises.length
        });
        const powerbuildingPolishedDay = user.discipline === 'powerbuilding'
          ? powerbuildingPriority.polishPowerbuildingDay({ ...day, exercises: nextExercises }, user)
          : { ...day, exercises: nextExercises };
        const trimmed = applySessionCapTrimming(powerbuildingPolishedDay, user.sessionCap, user.priorityGroups || [], user.profile, user);
        emitPlannerDiagnosticHeartbeat(user, 'after_apply_session_cap_trimming', {
          ...finalValidationMeta,
          callBoundary: 'repairAndValidatePlan_after_apply_session_cap_trimming',
          week: Number.isFinite(Number(week?.weekIndex)) ? Number(week.weekIndex) : undefined,
          dayType: String(trimmed?.dayType || day?.dayType || '').trim() || undefined,
          dayExerciseCount: Array.isArray(trimmed?.exercises) ? trimmed.exercises.length : 0
        });
        emitPlannerDiagnosticHeartbeat(user, 'before_dedupe_and_diversify_day', {
          ...finalValidationMeta,
          callBoundary: 'repairAndValidatePlan_before_dedupe_and_diversify_day',
          week: Number.isFinite(Number(week?.weekIndex)) ? Number(week.weekIndex) : undefined,
          dayType: String(trimmed?.dayType || day?.dayType || '').trim() || undefined,
          dayExerciseCount: Array.isArray(trimmed?.exercises) ? trimmed.exercises.length : 0
        });
        const deduped = dedupeAndDiversifyDay(trimmed, user, exercises);
        emitPlannerDiagnosticHeartbeat(user, 'after_dedupe_and_diversify_day', {
          ...finalValidationMeta,
          callBoundary: 'repairAndValidatePlan_after_dedupe_and_diversify_day',
          week: Number.isFinite(Number(week?.weekIndex)) ? Number(week.weekIndex) : undefined,
          dayType: String(deduped?.dayType || trimmed?.dayType || '').trim() || undefined,
          dayExerciseCount: Array.isArray(deduped?.exercises) ? deduped.exercises.length : 0
        });
        const finalExercises = [];
        const finalNames = new Set();
        for (const ex of Array.isArray(deduped.exercises) ? deduped.exercises : []) {
          let candidate = ex;
          if (isInvalidForFinal(candidate, deduped.dayType || '')) {
            filteredCount += 1;
            candidate = findReplacementExerciseForPlan(candidate, user, exercises, deduped.dayType || '', finalNames);
          }
          const candidateKey = exerciseDayIdentityKey(candidate);
          if (!candidate || isInvalidForFinal(candidate, deduped.dayType || '') || finalNames.has(candidateKey)) continue;
          finalNames.add(candidateKey);
          finalExercises.push(candidate);
        }
        if (!Array.isArray(finalExercises) || !finalExercises.length) {
          return attachAbsGlutesLegsDebugMeta({
            error: 'NO_ELIGIBLE_EXERCISE',
            slotId: `week_${week?.weekIndex || '?'}_day_${day?.dayType || '?'}`,
            reason: 'No safe exercises remained after repair.'
          }, user, {
            stage: 'final validation',
            failedStage: 'final validation',
            week: week?.weekIndex,
            day: day?.day,
            dayType: day?.dayType
          });
        }
        const finalizedDay = user.discipline === 'powerbuilding'
          ? powerbuildingPriority.polishPowerbuildingDay({ ...deduped, exercises: finalExercises }, user)
          : { ...deduped, exercises: finalExercises };
        nextDays.push({
          ...finalizedDay,
          exercises: organizeDayExerciseOrder(finalizedDay.dayType, finalizedDay.exercises, user)
        });
        if (!firstDayProcessed) {
          firstDayProcessed = true;
          emitPlannerDiagnosticHeartbeat(user, 'after_first_day_processed', {
            ...finalValidationMeta,
            callBoundary: 'repairAndValidatePlan_after_first_day_processed',
            week: Number.isFinite(Number(week?.weekIndex)) ? Number(week.weekIndex) : undefined,
            dayType: String(deduped?.dayType || '').trim() || undefined,
            dayExerciseCount: finalExercises.length
          });
        }
      }
      if (nextDays.length !== Number(user?.daysPerWeek || 0)) {
        return attachAbsGlutesLegsDebugMeta({
          error: 'PLAN_VALIDATION_FAILED',
          field: 'daysPerWeek',
          reason: `Expected ${user?.daysPerWeek} training days, got ${nextDays.length}.`
        }, user, {
          stage: 'final validation',
          failedStage: 'final validation'
        });
      }
      sanitized.push({ ...week, days: nextDays });
    }
    emitPlannerDiagnosticHeartbeat(user, 'after_final_validation_normalization', {
      ...finalValidationMeta,
      planExists: true,
      weeksLength: sanitized.length,
      callBoundary: 'repairAndValidatePlan_after_normalization'
    });
    logComboStageExit(user, 'final validation', {
      weeks: sanitized.length,
      filteredCount
    });
    emitPlannerDiagnosticHeartbeat(user, 'before_generator_final_return', {
      ...finalValidationMeta,
      planExists: true,
      weeksLength: sanitized.length,
      callBoundary: 'repairAndValidatePlan_before_return'
    });
    return { weeks: sanitized, filteredCount };
  });
}

function buildCleanupChainHeartbeatMeta(user, weeks, callBoundary, functionName) {
  const weekList = Array.isArray(weeks) ? weeks : [];
  const dayList = weekList.flatMap((week) => Array.isArray(week?.days) ? week.days : []);
  const exerciseList = dayList.flatMap((day) => Array.isArray(day?.exercises) ? day.exercises : []);
  return {
    functionName,
    fileName: 'generator/trainingEngine.oblueprint.js',
    elapsedMs: plannerNowMs(),
    weeksLength: weekList.length,
    totalDayCount: dayList.length,
    totalExerciseCount: exerciseList.length,
    requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
    requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
    selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
    callBoundary
  };
}

/* Rep-ladder progression (owner spec, 2026-07-12): every week in the
   block uses the SAME structure - same exercises, same sets, same
   weight. Reps climb by 1 each week; after the 4-week cycle the load
   goes up 5 lb and reps drop back to the starting count. Week types no
   longer vary (no volume/intensification/deload restructuring). */
function weekPattern(blockLength) {
  return Array.from({ length: blockLength }, () => 'base');
}

function buildWeeks(blockLength, schedule, user, exercises, targets, opts = {}) {
  return withPlannerTiming(user, 'buildWeeksMs', () => {
    const types = weekPattern(blockLength);
    const weeks = [];
    for (let i = 0; i < blockLength; i += 1) {
      const weekType = types[i];
      const targetsForWeek = scaleTargets(targets, weekType, blockLength, i + 1);
      logComboStageEnter(user, 'blueprint construction', {
        week: i + 1,
        weekType
      });
      const blueprint = withPlannerTiming(user, 'blueprintDayConstructionMs', () => buildWeekBlueprint(user.discipline, schedule, user, weekType, opts));
      logComboStageExit(user, 'blueprint construction', {
        week: i + 1,
        weekType,
        selectedSplit: Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : []
      });
      logComboStageEnter(user, 'lower day construction', {
        week: i + 1,
        weekType,
        lowerDayCount: Array.isArray(blueprint) ? blueprint.filter((day) => ['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))).length : 0
      });
      logComboStageExit(user, 'lower day construction', {
        week: i + 1,
        weekType,
        lowerDayCount: Array.isArray(blueprint) ? blueprint.filter((day) => ['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))).length : 0
      });
      const weekPicked = new Set();
      const weekState = {
        rearDeltDays: new Set(),
        heavyDeadliftCount: 0,
        priorityGroups: new Set(user.priorityGroups || []),
        neckDayKeys: new Set(),
        forearmDayKeys: new Set(),
        coreFamilies: new Map(),
        neckDays: 0,
        forearmDays: 0
      };
      const filledDays = [];
      for (const dayBp of blueprint) {
        logComboStageEnter(user, 'slot filling', {
          week: i + 1,
          day: dayBp.day,
          dayType: dayBp.dayType
        });
        const filled = fillSlots(dayBp, exercises, user, weekPicked, weekState, {
          week: i + 1,
          weekType
        });
        if (filled.error) return attachAbsGlutesLegsDebugMeta(filled, user, {
          stage: 'slot filling',
          failedStage: 'slot filling',
          week: i + 1,
          day: dayBp.day,
          dayType: dayBp.dayType,
          muscleTarget: filled?.muscleTarget
        });
        logComboStageExit(user, 'slot filling', {
          week: i + 1,
          day: dayBp.day,
          dayType: dayBp.dayType,
          exerciseCount: Array.isArray(filled?.exercises) ? filled.exercises.length : 0
        });
        filledDays.push({ dayType: dayBp.dayType, day: dayBp.day, exercises: filled.exercises });
        /* SLOT TRACE (env SLOT_TRACE=<dayType|*>). Records, per required slot,
           whether fillSlots filled it — so mechanism (b) "never filled" is
           distinguishable from mechanism (a) "filled then removed". A logger
           that only watched removal would print the same thing under (b) as a
           logger that does not work. */
        if (process.env.SLOT_TRACE && i === 0) {
          const want = String(process.env.SLOT_TRACE);
          if (want === '*' || want === String(dayBp.dayType)) {
            const picked = Array.isArray(filled.exercises) ? filled.exercises : [];
            const bySlot = new Map();
            for (const ex of picked) bySlot.set(String(ex.slotId || ''), ex);
            const lines = (dayBp.slots || []).map((s) => {
              const hit = bySlot.get(String(s.id || s.slotId || ''));
              return `    ${String(s.id || s.slotId).padEnd(28)} optional=${String(Boolean(s.optional)).padEnd(5)} `
                + `pattern=${String(s.pattern).padEnd(15)} filled=${hit ? 'YES  ' + hit.name : 'NO'}`;
            });
            process.stderr.write(`\n@@SLOTTRACE ${dayBp.dayType} — ${(dayBp.slots || []).length} slots, `
              + `${picked.length} picked\n${lines.join('\n')}\n`
              + `    picked slotIds: ${JSON.stringify(picked.map((e) => e.slotId))}\n`);
          }
        }
      }
      let prescribed = allocateSetsReps(filledDays, weekType, targetsForWeek, user);
      if (weekType === 'deload') {
        prescribed = prescribed.map((day) => ({
          ...day,
          exercises: (day.exercises || []).map((ex) => {
            const scaled = Math.round(Number(ex.sets || 0) * 0.6);
            const minSets = ex.style === 'Compound' ? 1 : 1;
            return {
              ...ex,
              sets: Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Math.max(minSets, scaled))
            };
          })
        }));
      }
      /* SLOT TRACE — day contents after each pass, so a compound that vanishes
         is attributed to the exact pass that dropped it. */
      const __trace = (label) => {
        if (!process.env.SLOT_TRACE || i !== 0) return;
        const want = String(process.env.SLOT_TRACE);
        for (const d of prescribed) {
          if (want !== '*' && want !== String(d.dayType)) continue;
          const ex = d.exercises || [];
          process.stderr.write(`@@PASS ${String(label).padEnd(42)} ${String(d.dayType).padEnd(12)} `
            + `${String(ex.length).padStart(2)} ex  ${ex.map((e) => `${e.name}[${e.pattern}]`).join(' | ')}\n`);
        }
      };
      __trace('after allocateSetsReps');
      if (user.discipline === 'powerbuilding') {
        prescribed = prescribed.map((d) => powerbuildingPriority.polishPowerbuildingDay(d, user));
        __trace('after polishPowerbuildingDay');
      }
      prescribed = prescribed.map((d) => applySessionCapTrimming(d, user.sessionCap, user.priorityGroups || [], user.profile, user));
      __trace('after applySessionCapTrimming');
      prescribed = prescribed.map((d) => ({
        ...d,
        exercises: (d.exercises || []).map((ex) => ({
          ...ex,
          sets: Math.max(1, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(ex.sets) || 1))
        }))
      }));
      prescribed = prescribed.map((d) => ({
        ...d,
        exercises: organizeDayExerciseOrder(d.dayType, d.exercises || [], user)
      }));
      __trace('after organizeDayExerciseOrder');
      // Rep ladder: week 1 prescribes the bottom of each exercise's rep
      // range, and every later week adds 1 rep at the same weight. Only
      // plain numeric prescriptions ladder - timed holds and text-based
      // targets keep their original wording.
      const ladderOffset = i % 4;
      prescribed = prescribed.map((d) => ({
        ...d,
        exercises: (d.exercises || []).map((ex) => {
          const repsText = String(ex.reps || '').trim();
          if (!/^\d+(\s*-\s*\d+)?$/.test(repsText)) return ex;
          const range = parseRepRangeText(repsText);
          const target = range.min + ladderOffset;
          return {
            ...ex,
            reps: String(target),
            repLadder: { start: range.min, rangeTop: range.max, weekTarget: target, cycleWeeks: 4, loadStepLb: 5 }
          };
        })
      }));
      weeks.push({ weekIndex: i + 1, weekType, days: prescribed });
    }
    return { weeks };
  });
}

function buildNutritionModel(user) {
  const weightLb = Number(user?.weightLb || 0);
  const bodyFatPct = Math.max(0, Math.min(60, Number(user?.bodyFatPct || 0)));
  const leanMassLb = weightLb > 0 ? weightLb * (1 - (bodyFatPct / 100)) : 0;
  const proteinFloor = weightLb > 0 ? Math.round(Math.max(120, Math.min(weightLb * 0.82, leanMassLb * 1.05 || weightLb * 0.82))) : 140;
  const proteinCeiling = weightLb > 0 ? Math.round(Math.max(proteinFloor + 20, Math.min(weightLb, leanMassLb * 1.2 || weightLb))) : 180;
  const maintenanceCalories = weightLb > 0 ? Math.round(weightLb * (user?.activityLevel === 'Very active' ? 16 : user?.activityLevel === 'Active' ? 15 : 14)) : 2500;
  const phase = String(user?.phase || 'recomp');
  const calorieDelta = phase === 'surplus' ? 220 : phase === 'deficit' ? -350 : 0;
  const calorieTarget = maintenanceCalories + calorieDelta;
  const weeklyRate = phase === 'surplus'
    ? 'Target bodyweight gain of roughly 0.25-0.5% per week.'
    : phase === 'deficit'
      ? 'Target bodyweight loss of roughly 0.5-0.75% per week.'
      : 'Keep bodyweight trend mostly stable and judge progress by performance and physique changes.';
  return {
    proteinTargetG: { min: proteinFloor, max: proteinCeiling },
    calorieTarget,
    calorieAdjustmentPhaseRule: phase === 'surplus'
      ? 'If average weekly gain is below target for 2 straight check-ins, add 100-150 kcal/day. If gain is too fast, remove 100-150 kcal/day.'
      : phase === 'deficit'
        ? 'If weekly loss is too slow for 2 straight check-ins, remove 100-150 kcal/day. If loss is too fast or performance drops hard, add 100-150 kcal/day.'
        : 'If bodyweight climbs while performance and measurements do not improve, trim 100 kcal/day. If performance stalls with stable bodyweight, add 75-125 kcal/day.',
    bodyweightTrendRule: weeklyRate
  };
}

function buildProgressionModel(user, targets, frequencyTargets) {
  return {
    defaultEffortTargets: {
      compounds: user?.profile?.complexity === 'low' ? '2-3 RIR' : '1-3 RIR',
      isolations: user?.profile?.complexity === 'low' ? '1-3 RIR' : '0-2 RIR on stable exercises'
    },
    overloadPriority: [
      'Keep the weight the same and add 1 rep to every set each week.',
      'After the 4th week, add 5 lb and drop the reps back to where the cycle started.',
      'Sets stay the same all cycle - do not add sets to force progress.'
    ],
    volumeLandmarks: {
      weeklyTargets: targets,
      frequencyTargets
    },
    progressionCheckWindowDays: 14,
    plateauRule: 'If a key lift or priority-muscle movement does not progress for 2-3 exposures and fatigue is acceptable, adjust exercise choice or add 2-4 weekly sets to the lagging muscle.'
  };
}

function buildRecoveryModel(user) {
  return {
    deloadTriggers: [
      'Performance down for 2+ weeks across multiple movements.',
      'Joint irritation rising across the block.',
      'Session completion dropping below target because of fatigue.',
      'Sleep, soreness, and motivation all trending worse together.'
    ],
    defaultDeload: {
      setReduction: 'Reduce direct sets by roughly 35-45%.',
      effortReduction: 'Keep 3-4 RIR and avoid failure.',
      duration: 'Use a 1-week deload before rebuilding volume.'
    },
    specializationGuardrail: 'Forearm, neck, and extra core work should be removed before cutting high-value main hypertrophy work when recovery gets tight.'
  };
}

function parseRepRangeText(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/(\d+)\s*-\s*(\d+)/);
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) return { min, max };
  }
  const single = Number(text);
  if (Number.isFinite(single) && single > 0) return { min: single, max: single };
  return { min: 8, max: 12 };
}

function roundProjectedLoad(value, increment) {
  const inc = Number(increment) || 2.5;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value / inc) * inc;
}

function clampProjectedLoad(value, minValue, maxValue, increment) {
  if (!Number.isFinite(value)) return null;
  const clamped = Math.max(Number(minValue || 0), Math.min(Number(maxValue || value), value));
  return roundProjectedLoad(clamped, increment);
}

function conservativeOneRepFromWorking(weight, reps) {
  const load = Number(weight || 0);
  const repCount = Math.max(1, Math.min(12, Number(reps || 0) || 1));
  if (!Number.isFinite(load) || load <= 0) return null;
  if (repCount <= 1) return load;
  const factor = 1 + ((repCount - 1) * 0.025);
  return Math.round(load * factor * 10) / 10;
}

function normalizeAnchorVariationName(value) {
  return normalizeName(value || '');
}

function movementLooksLikePressAnchor(value) {
  const name = normalizeAnchorVariationName(value);
  if (!name) return false;
  return /(bench|chest press|machine chest press|incline|decline|dumbbell bench|db bench|db press|chest machine)/.test(name);
}

function movementLooksLikeLowerAnchor(value) {
  const name = normalizeAnchorVariationName(value);
  if (!name) return false;
  return /(front squat|hack squat|leg press|goblet squat|squat|split squat|bulgarian|lunge)/.test(name);
}

function movementLooksLikeHingeAnchor(value) {
  const name = normalizeAnchorVariationName(value);
  if (!name) return false;
  return /(romanian deadlift|\brdl\b|hip thrust|glute bridge|pull through|pull-through|dumbbell rdl|deadlift|stiff leg)/.test(name);
}

function bodyweightFallbackAnchors(user) {
  const bodyweight = Math.max(0, Number(user?.weightLb || user?.bodyweight || user?.bodyweightLb || 0));
  if (!Number.isFinite(bodyweight) || bodyweight <= 0) return {
    bench1rm: 95,
    squat1rm: 135,
    deadlift1rm: 165
  };
  const expMult = user?.experience === '<6m'
    ? 0.9
    : user?.experience === '6-24m'
      ? 1
      : user?.experience === '2-5y'
        ? 1.08
        : 1.15;
  return {
    bench1rm: roundProjectedLoad(bodyweight * 0.65 * expMult, 5),
    squat1rm: roundProjectedLoad(bodyweight * 0.95 * expMult, 5),
    deadlift1rm: roundProjectedLoad(bodyweight * 1.15 * expMult, 5)
  };
}

/* §0.1 — layoff decay.

   Strength does not sit still. Someone who last pulled 600 fifteen months ago
   is not a 600 deadlifter today, and programming them as one is the difference
   between a usable first month and an injury. Before this, a returning lifter
   who reported a 600 deadlift was programmed off 600.

   The multiplier is inverted from what the name suggests and that is
   deliberate: a longer training history means a SLOWER loss, so 5y+ carries the
   smallest decay rate. The floor at 55% is there because nobody detrains to
   nothing — the movement pattern and the connective adaptation outlast the
   peak. Two weeks is free; that is a deload, not a layoff. */
const LAYOFF_DECAY_MULTIPLIER = { '<6m': 1.0, '6-24m': 0.85, '2-5y': 0.7, '5y+': 0.6 };
const LAYOFF_RAMP_WEEKS_THRESHOLD = 8;
const LAYOFF_RAMP_FACTOR = 0.70;
const LAYOFF_RAMP_DURATION_WEEKS = 4;

function decayAnchor(e1rm, weeksSince, experience) {
  const value = Number(e1rm);
  if (!Number.isFinite(value) || value <= 0) return value;
  const weeks = Number(weeksSince);
  if (!Number.isFinite(weeks) || weeks <= 2) return value;
  const multiplier = LAYOFF_DECAY_MULTIPLIER[String(experience || '')] ?? 0.85;
  const rate = 0.012 * multiplier;
  return Math.max(value * Math.exp(-rate * (weeks - 2)), value * 0.55);
}

/* Weeks since this family was last trained heavy. Accepts either a week count
   or a date, per family, and falls back to the whole-profile value. */
function weeksSinceHeavyFor(user, family) {
  const src = user?.lastTrainedHeavy;
  const raw = (src && typeof src === 'object') ? (src[family] ?? src.all) : src;
  if (raw == null || raw === '') return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return Math.max(0, asNumber);
  const asDate = Date.parse(String(raw));
  if (!Number.isFinite(asDate)) return null;
  const planNow = Number(user?.planNowMs);
  const now = Number.isFinite(planNow) ? planNow : Date.parse(String(user?.planGeneratedAt || '')) || null;
  if (!now) return null;
  return Math.max(0, (now - asDate) / (7 * 24 * 3600 * 1000));
}

function anchorInputsForUser(user) {
  const explicitBench = Math.max(0, Number(user?.bench || 0));
  const explicitSquat = Math.max(0, Number(user?.squat || 0));
  const explicitDeadlift = Math.max(0, Number(user?.deadlift || 0));
  const benchWorkingWeight = Math.max(0, Number(user?.benchWeight || user?.benchWorkingWeight || 0));
  const benchWorkingReps = Math.max(0, Number(user?.benchReps || user?.benchWorkingReps || 0));
  const lowerWorkingWeight = Math.max(0, Number(user?.lowerWeight || user?.lowerBodyWeight || 0));
  const lowerWorkingReps = Math.max(0, Number(user?.lowerReps || user?.lowerBodyReps || 0));
  const hingeWorkingWeight = Math.max(0, Number(user?.hingeWeight || user?.hingeWorkingWeight || 0));
  const hingeWorkingReps = Math.max(0, Number(user?.hingeReps || user?.hingeWorkingReps || 0));
  const benchVariation = String(user?.benchVariation || user?.benchMovement || '').trim();
  const lowerVariation = String(user?.lowerMovement || user?.lowerBodyMovement || '').trim();
  const hingeVariation = String(user?.hingeMovement || '').trim();
  const derivedBench = benchWorkingWeight > 0 && (movementLooksLikePressAnchor(benchVariation) || !benchVariation)
    ? conservativeOneRepFromWorking(benchWorkingWeight, benchWorkingReps)
    : null;
  const derivedSquat = lowerWorkingWeight > 0 && (movementLooksLikeLowerAnchor(lowerVariation) || !lowerVariation)
    ? conservativeOneRepFromWorking(lowerWorkingWeight, lowerWorkingReps)
    : null;
  const derivedDeadlift = hingeWorkingWeight > 0 && (movementLooksLikeHingeAnchor(hingeVariation) || !hingeVariation)
    ? conservativeOneRepFromWorking(hingeWorkingWeight, hingeWorkingReps)
    : null;
  // Returning-user tier: real e1RM from logged history (best_estimated_1rm_lb),
  // threaded in by the route as user.liftHistoryAnchors. Sits between derived
  // working-weight and the bodyweight guess. Unset => today's precedence exactly.
  const historyBench = Math.max(0, Number(user?.liftHistoryAnchors?.bench1rm || 0));
  const historySquat = Math.max(0, Number(user?.liftHistoryAnchors?.squat1rm || 0));
  const historyDeadlift = Math.max(0, Number(user?.liftHistoryAnchors?.deadlift1rm || 0));
  const bodyweightFallback = bodyweightFallbackAnchors(user);
  const rawBench = explicitBench || derivedBench || historyBench || bodyweightFallback.bench1rm;
  const rawSquat = explicitSquat || derivedSquat || historySquat || bodyweightFallback.squat1rm;
  const rawDeadlift = explicitDeadlift || derivedDeadlift || historyDeadlift || bodyweightFallback.deadlift1rm;

  /* §0.1 — decay each family by how long since it was last trained heavy. The
     bodyweight fallback is already a guess about someone training now, so it is
     left alone; only a number the user actually reported gets decayed. */
  const experience = String(user?.experience || '');
  const layoff = {};
  const decayFamily = (family, value, reported) => {
    const weeks = weeksSinceHeavyFor(user, family);
    if (!reported || weeks == null || weeks <= 2) return value;
    const decayed = decayAnchor(value, weeks, experience);
    layoff[family] = {
      weeksSinceHeavy: Math.round(weeks),
      reported: Math.round(value),
      decayed: Math.round(decayed),
      rampWeeks: weeks > LAYOFF_RAMP_WEEKS_THRESHOLD ? LAYOFF_RAMP_DURATION_WEEKS : 0,
      rampFactor: weeks > LAYOFF_RAMP_WEEKS_THRESHOLD ? LAYOFF_RAMP_FACTOR : 1,
      reason: weeks > LAYOFF_RAMP_WEEKS_THRESHOLD
        ? `Last trained heavy about ${Math.round(weeks / 4.345)} months ago, so this starts from `
          + `${Math.round(decayed)} rather than ${Math.round(value)}, and the first `
          + `${LAYOFF_RAMP_DURATION_WEEKS} weeks sit near ${Math.round(LAYOFF_RAMP_FACTOR * 100)}% of that. `
          + 'Connective tissue re-adapts slower than muscle and far slower than the nervous system, which '
          + 'is why coming back feels fine in week one and hurts in week three.'
        : `Last trained heavy about ${Math.round(weeks)} weeks ago, so this starts from ${Math.round(decayed)} rather than ${Math.round(value)}.`
    };
    return decayed;
  };
  const bench = decayFamily('bench', rawBench, Boolean(explicitBench || derivedBench || historyBench));
  const squat = decayFamily('squat', rawSquat, Boolean(explicitSquat || derivedSquat || historySquat));
  const deadlift = decayFamily('deadlift', rawDeadlift, Boolean(explicitDeadlift || derivedDeadlift || historyDeadlift));
  const explicitCount = [explicitBench, explicitSquat, explicitDeadlift].filter((value) => Number.isFinite(value) && value > 0).length;
  const workingCount = [derivedBench, derivedSquat, derivedDeadlift].filter((value) => Number.isFinite(value) && value > 0).length;
  const historyCount = [historyBench, historySquat, historyDeadlift].filter((value) => Number.isFinite(value) && value > 0).length;
  const anchorSource = explicitCount > 0
    ? 'explicit_pr'
    : workingCount > 0
      ? 'working_weight_fallback'
      : historyCount > 0
        ? 'lift_history_fallback'
        : 'bodyweight_family_fallback';
  return {
    anchorSource,
    inputBench: explicitBench > 0 ? explicitBench : null,
    inputSquat: explicitSquat > 0 ? explicitSquat : null,
    inputDeadlift: explicitDeadlift > 0 ? explicitDeadlift : null,
    benchWorkingWeight: benchWorkingWeight > 0 ? benchWorkingWeight : null,
    benchWorkingReps: benchWorkingReps > 0 ? benchWorkingReps : null,
    benchVariation: benchVariation || null,
    lowerWorkingWeight: lowerWorkingWeight > 0 ? lowerWorkingWeight : null,
    lowerWorkingReps: lowerWorkingReps > 0 ? lowerWorkingReps : null,
    lowerVariation: lowerVariation || null,
    hingeWorkingWeight: hingeWorkingWeight > 0 ? hingeWorkingWeight : null,
    hingeWorkingReps: hingeWorkingReps > 0 ? hingeWorkingReps : null,
    hingeVariation: hingeVariation || null,
    derivedBenchEstimate: Number.isFinite(derivedBench) ? roundProjectedLoad(derivedBench, 2.5) : null,
    derivedSquatEstimate: Number.isFinite(derivedSquat) ? roundProjectedLoad(derivedSquat, 5) : null,
    derivedDeadliftEstimate: Number.isFinite(derivedDeadlift) ? roundProjectedLoad(derivedDeadlift, 5) : null,
    bodyweightFallbackBench: bodyweightFallback.bench1rm,
    bodyweightFallbackSquat: bodyweightFallback.squat1rm,
    bodyweightFallbackDeadlift: bodyweightFallback.deadlift1rm,
    bench1rm: bench > 0 ? bench : null,
    squat1rm: squat > 0 ? squat : null,
    deadlift1rm: deadlift > 0 ? deadlift : null,
    layoff: Object.keys(layoff).length ? layoff : null
  };
}

function anchorWorkingWeights(user) {
  const anchors = anchorInputsForUser(user);
  return {
    ...anchors,
    benchWorking: Number.isFinite(anchors.bench1rm) ? roundProjectedLoad(anchors.bench1rm * 0.72, 2.5) : null,
    squatWorking: Number.isFinite(anchors.squat1rm) ? roundProjectedLoad(anchors.squat1rm * 0.72, 5) : null,
    deadliftWorking: Number.isFinite(anchors.deadlift1rm) ? roundProjectedLoad(anchors.deadlift1rm * 0.7, 5) : null
  };
}

function classifyAnchorStrengthStatus(user, anchorLoads) {
  const standardsByTier = {
    '<6m': { bench: 105, squat: 155, deadlift: 185 },
    '6-24m': { bench: 155, squat: 225, deadlift: 275 },
    '2-5y': { bench: 205, squat: 315, deadlift: 385 },
    '5y+': { bench: 245, squat: 365, deadlift: 455 }
  };
  const standard = standardsByTier[String(user?.experience || '6-24m')] || standardsByTier['6-24m'];
  const ratios = [
    Number.isFinite(anchorLoads?.bench1rm) ? anchorLoads.bench1rm / standard.bench : null,
    Number.isFinite(anchorLoads?.squat1rm) ? anchorLoads.squat1rm / standard.squat : null,
    Number.isFinite(anchorLoads?.deadlift1rm) ? anchorLoads.deadlift1rm / standard.deadlift : null
  ].filter((value) => Number.isFinite(value) && value > 0);
  const score = ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : null;
  const status = !Number.isFinite(score)
    ? 'anchor_limited'
    : score >= 1.15
      ? 'above_standard'
      : score <= 0.85
        ? 'below_standard'
        : 'on_track';
  return {
    status,
    score: Number.isFinite(score) ? Math.round(score * 100) / 100 : null,
    standards: standard,
    confidence: anchorLoads?.anchorSource === 'explicit_pr'
      ? 'high'
      : anchorLoads?.anchorSource === 'working_weight_fallback'
        ? 'medium'
        : 'low',
    reason: anchorLoads?.anchorSource === 'explicit_pr'
      ? 'Compared explicit anchor lifts against training-age standards.'
      : anchorLoads?.anchorSource === 'working_weight_fallback'
        ? 'Compared conservative anchor estimates derived from working weights and reps.'
        : 'Used conservative bodyweight and family fallback because direct anchor data was limited.'
  };
}

function projectionFamilyForExercise(exercise, user) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const name = normalizeName(exercise?.name);
  if (truth.pressRole === 'chest_press') return 'chest_press';
  if (truth.shoulderPressPattern) return 'shoulder_press';
  if (truth.pullRole === 'back_builder' && truth.movementFamily === 'vertical_pull') return 'vertical_pull';
  if (truth.pullRole === 'back_builder' && truth.movementFamily === 'horizontal_pull') return 'horizontal_pull';
  if (truth.movementFamily === 'squat') return /\bleg press\b/.test(name) ? 'leg_press' : 'squat_pattern';
  if (truth.movementFamily === 'lunge') return 'single_leg';
  if (truth.movementFamily === 'hinge') {
    if (/(hip thrust|glute bridge|bridge)/.test(name)) return 'hip_thrust';
    return 'hinge_pattern';
  }
  if (truth.directArmSubtype === 'biceps') return 'biceps_iso';
  if (truth.directArmSubtype === 'triceps') return 'triceps_iso';
  if (truth.directCalf) return 'calves';
  if (truth.directAb || truth.coreFamily !== 'none') {
    if (truth.coreFamily === 'rotation') return 'core_rotation';
    if (truth.coreFamily === 'stability') return 'core_stability';
    return 'core_flexion';
  }
  if (truth.lateralDeltPattern) return 'lateral_raise';
  if (truth.rearDeltPattern) return 'rear_delt';
  if (/(leg extension)/.test(name)) return 'leg_extension';
  if (/(leg curl|hamstring curl|glute ham)/.test(name)) return 'ham_curl';
  if (/(fly|crossover|pec deck)/.test(name)) return 'chest_iso';
  return truth.primaryMuscle === 'Chest'
    ? 'chest_iso'
    : truth.primaryMuscle === 'Back'
      ? 'horizontal_pull'
      : truth.primaryMuscle === 'Shoulders'
        ? 'lateral_raise'
        : truth.primaryMuscle === 'Arms'
          ? 'biceps_iso'
          : truth.primaryMuscle === 'Legs'
            ? 'leg_extension'
            : truth.primaryMuscle === 'Glutes'
              ? 'hip_thrust'
              : 'general';
}

function projectionLoadShapeForExercise(exercise) {
  const required = Array.isArray(exercise?.requiredEquipment) ? exercise.requiredEquipment : inferRequiredEquipment(exercise);
  const eq = required.includes('barbell')
    ? 'barbell'
    : required.includes('dumbbell')
      ? 'dumbbell'
      : required.includes('machine')
        ? 'machine'
        : required.includes('cable')
          ? 'cable'
          : required.includes('bodyweight')
            ? 'bodyweight'
            : 'other';
  const isSingleHandle = eq === 'dumbbell';
  const increment = eq === 'barbell'
    ? (String(exercise?.primaryMuscle || exercise?.primary || '') === 'Legs' || String(exercise?.movementFamily || '') === 'hinge' ? 5 : 2.5)
    : eq === 'dumbbell'
      ? 2.5
      : (eq === 'machine' || eq === 'cable')
        ? 5
        : 2.5;
  return {
    equipmentClass: eq,
    increment,
    loadUnitNote: isSingleHandle ? 'per hand' : eq === 'bodyweight' ? 'bodyweight' : 'total load'
  };
}

function progressionModeForExercise(exercise) {
  const shape = projectionLoadShapeForExercise(exercise);
  const name = normalizeName(exercise?.displayName || exercise?.name);
  if (/(weighted pull up|weighted chin up|weighted dip|belted dip)/.test(name)) return 'loaded_bodyweight';
  if (/(assisted pull up|assisted chin up|assisted dip)/.test(name)) return 'assisted_bodyweight';
  if (shape.equipmentClass === 'bodyweight') {
    if (/(plank|hollow hold|dead bug|vacuum|wall sit|isometric|fallout)/.test(name)) return 'bodyweight_tempo_progression';
    return 'bodyweight_rep_progression';
  }
  return 'external_load';
}

function parseRepsRange(repsText) {
  const src = String(repsText || '').trim();
  const m = src.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const n = src.match(/(\d+)/);
  const value = n ? Number(n[1]) : 10;
  return { min: value, max: value };
}

function summarizeLoggedSets(entry, prescribedSets = 0) {
  const sets = Array.isArray(entry?.sets) ? entry.sets : [];
  const completed = sets
    .map((set) => ({ weight: Number(set?.weight || 0), reps: Number(set?.reps || 0) }))
    .filter((set) => Number.isFinite(set.reps) && set.reps > 0);
  const considered = prescribedSets > 0 ? completed.slice(0, prescribedSets) : completed;
  const reps = considered.map((set) => set.reps).filter((value) => Number.isFinite(value) && value > 0);
  const weights = considered.map((set) => set.weight).filter((value) => Number.isFinite(value) && value > 0);
  return {
    completedSets: considered.length,
    averageReps: reps.length ? Math.round((reps.reduce((sum, value) => sum + value, 0) / reps.length) * 10) / 10 : null,
    minReps: reps.length ? Math.min(...reps) : null,
    maxReps: reps.length ? Math.max(...reps) : null,
    topWeight: weights.length ? Math.max(...weights) : null,
    repsBySet: reps
  };
}

function progressionTargetText(mode, payload = {}) {
  if (mode === 'external_load' || mode === 'loaded_bodyweight') {
    return Number.isFinite(Number(payload?.load)) ? `${Number(payload.load)} lb` : 'N/A';
  }
  if (mode === 'assisted_bodyweight') {
    return Number.isFinite(Number(payload?.assistance)) ? `${Number(payload.assistance)} lb assistance` : 'Reduce assistance';
  }
  if (mode === 'bodyweight_tempo_progression') return payload?.tempo || payload?.duration || 'More control / tempo';
  if (payload?.repRange) return payload.repRange;
  return 'Rep progression';
}

function nextBodyweightTarget(row = {}, mode = 'bodyweight_rep_progression', direction = 'hold') {
  const range = parseRepsRange(row?.repRange);
  if (mode === 'bodyweight_tempo_progression') {
    if (direction === 'increase') return 'Add 5-10s or slow the eccentric';
    if (direction === 'decrease') return 'Shorten hold slightly and restore control';
    if (direction === 'deload' || direction === 'continue_deload') return 'Cut hold time by ~25%';
    return 'Repeat with the same control standard';
  }
  if (mode === 'assisted_bodyweight') {
    if (direction === 'increase') return 'Reduce assistance slightly';
    if (direction === 'decrease') return 'Increase assistance slightly';
    if (direction === 'deload' || direction === 'continue_deload') return 'Use more assistance for recovery';
    return `${range.min}-${range.max} reps`;
  }
  if (direction === 'increase') return `${range.min + 1}-${range.max + 1} reps`;
  if (direction === 'decrease') return `${Math.max(1, range.min - 2)}-${Math.max(range.min, range.max - 2)} reps`;
  if (direction === 'deload' || direction === 'continue_deload') return `${Math.max(1, range.min - 2)}-${Math.max(range.min, range.max - 1)} easy reps`;
  return `${range.min}-${range.max} reps`;
}

function decisionMovementFamilyForName(name = '', fallbackFamily = '') {
  const n = normalizeName(name);
  if (!n) return String(fallbackFamily || 'general');
  if (/(bench press|incline .*press|incline .*bench|chest press|machine chest press|cable chest press|leverage chest press|dumbbell press)/.test(n)) return 'chest_press';
  if (/(shoulder press|overhead press|military press)/.test(n)) return 'shoulder_press';
  if (/(chest supported|incline row|seal row|dumbbell row|cable row|machine row|\brow\b)/.test(n)) return 'horizontal_pull';
  if (/(pulldown|pull down|pull up|chin up|lat pull)/.test(n)) return 'vertical_pull';
  if (/(front squat|hack squat|leg press|goblet squat|back squat|\bsquat\b)/.test(n)) return 'squat_pattern';
  if (/(romanian deadlift|\brdl\b|hip thrust|glute bridge|pull through|deadlift)/.test(n)) return 'hinge_pattern';
  if (/(hammer curl|preacher curl|incline curl|\bcurl\b)/.test(n) && !/(leg curl|hamstring curl)/.test(n)) return 'biceps_iso';
  if (/(pushdown|pressdown|skull crusher|triceps|extension)/.test(n) && !/(leg extension|neck extension|back extension)/.test(n)) return 'triceps_iso';
  if (/\bcalf\b/.test(n)) return 'calves';
  if (/(pallof|rotation|wood chop|oblique|side bend)/.test(n)) return 'core_rotation';
  if (/(plank|dead bug|vacuum|fallout|anti extension)/.test(n)) return 'core_stability';
  if (/(crunch|reverse crunch|leg raise|ab wheel|rollout)/.test(n)) return 'core_flexion';
  return String(fallbackFamily || 'general');
}

function decisionVariantGroupForName(name = '', fallbackFamily = '') {
  const n = normalizeName(name);
  const family = decisionMovementFamilyForName(n, fallbackFamily);
  if (!n) return family;
  if (/(barbell bench press|bench press medium grip|barbell bench press medium grip|medium grip barbell bench press)/.test(n)) return 'barbell_bench_press';
  if (/(cable chest press|standing cable chest press)/.test(n)) return 'cable_chest_press';
  if (/(barbell shoulder press|seated military press|seated barbell military press)/.test(n)) return 'barbell_shoulder_press';
  if (/(chest supported dumbbell row|dumbbell incline row)/.test(n)) return 'chest_supported_dumbbell_row';
  if (/(machine chest press|leverage chest press)/.test(n)) return 'machine_chest_press';
  if (/(back squat|back squat volume|front squat)/.test(n)) return 'barbell_squat_variant';
  if (/(hack squat|barbell hack squat)/.test(n)) return 'hack_squat_variant';
  return family;
}

function isExplicitDecisionVariantGroup(variantGroup, family) {
  return Boolean(variantGroup) && String(variantGroup) !== String(family || '');
}

function isCloseDecisionVariantPair(sourceExerciseName = '', candidateExerciseName = '', family = '') {
  const sourceName = String(sourceExerciseName || '').trim();
  const candidateName = String(candidateExerciseName || '').trim();
  if (!sourceName || !candidateName) return false;
  if (normalizeName(sourceName) === normalizeName(candidateName)) return false;
  const sourceFamily = decisionMovementFamilyForName(sourceName, family);
  const candidateFamily = decisionMovementFamilyForName(candidateName, family);
  if (sourceFamily !== candidateFamily) return false;
  const sourceGroup = decisionVariantGroupForName(sourceName, sourceFamily);
  const candidateGroup = decisionVariantGroupForName(candidateName, candidateFamily);
  if (!isExplicitDecisionVariantGroup(sourceGroup, sourceFamily)) return false;
  return sourceGroup === candidateGroup;
}

function safeDecisionSourceExerciseLabel(decisionSource, decisionSourceExercise, fallbackFamily = '') {
  const label = String(decisionSourceExercise || '').trim();
  if (label && label.toLowerCase() !== 'undefined') return label;
  if (String(decisionSource || '') === 'anchor_fallback') {
    return fallbackFamily === 'bodyweight' ? 'Bodyweight progression' : 'Anchor fallback';
  }
  if (String(decisionSource || '') === 'movement_family') return 'Movement-family fallback';
  if (String(decisionSource || '') === 'close_variant') return 'Close variant fallback';
  return 'No direct logged exercise available';
}

function normalizeDecisionRecord(record = {}, fallbackFamily = '') {
  const name = String(record?.exerciseName || record?.displayName || record?.name || '').trim();
  const family = String(record?.projectionFamily || decisionMovementFamilyForName(name, fallbackFamily) || fallbackFamily || 'general');
  return {
    ...record,
    exerciseName: name || 'Unknown exercise',
    canonicalExerciseId: String(record?.canonicalExerciseId || record?.exerciseId || record?.id || '').trim(),
    projectionFamily: family,
    variantGroup: String(record?.variantGroup || decisionVariantGroupForName(name, family) || family),
    snapshot: record?.snapshot || null
  };
}

function resolveDecisionSourceHierarchy({
  exercise = null,
  currentRow = null,
  exactRecords = [],
  candidateRecords = [],
  anchorLabel = 'Anchor fallback'
} = {}) {
  const exerciseName = String(exercise?.displayName || exercise?.name || currentRow?.exercise || '').trim();
  const exerciseId = String(exercise?.canonicalExerciseId || currentRow?.canonicalExerciseId || '').trim();
  const family = String(exercise?.projectionFamily || currentRow?.family || decisionMovementFamilyForName(exerciseName, 'general'));
  const exact = (Array.isArray(exactRecords) ? exactRecords : [])
    .map((record) => normalizeDecisionRecord(record, family))
    .find((record) => record?.exerciseName || record?.canonicalExerciseId);
  if (exact) {
    return {
      decisionSource: 'exact_exercise',
      decisionSourceExercise: safeDecisionSourceExerciseLabel('exact_exercise', exact.exerciseName, family),
      primaryRecord: exact
    };
  }
  const candidates = (Array.isArray(candidateRecords) ? candidateRecords : [])
    .map((record) => normalizeDecisionRecord(record, family))
    .filter((record) => record.exerciseName);
  const closeVariant = candidates.find((record) => isCloseDecisionVariantPair(exerciseName, record.exerciseName, family));
  if (closeVariant) {
    return {
      decisionSource: 'close_variant',
      decisionSourceExercise: safeDecisionSourceExerciseLabel('close_variant', closeVariant.exerciseName, family),
      primaryRecord: closeVariant
    };
  }
  const familyRecord = candidates.find((record) => record.projectionFamily === family);
  if (familyRecord) {
    return {
      decisionSource: 'movement_family',
      decisionSourceExercise: safeDecisionSourceExerciseLabel('movement_family', familyRecord.exerciseName, family),
      primaryRecord: familyRecord
    };
  }
  return {
    decisionSource: 'anchor_fallback',
    decisionSourceExercise: safeDecisionSourceExerciseLabel('anchor_fallback', anchorLabel, family),
    primaryRecord: null
  };
}

function enforceRecommendationTargetConsistency({
  recommendation,
  nextTarget,
  currentRow = null,
  nextRow = null,
  exercise = null,
  mode = 'external_load'
} = {}) {
  if (mode !== 'external_load' && mode !== 'loaded_bodyweight') return String(nextTarget || '');
  const currentLoad = Number(currentRow?.targetLoad || 0);
  const nextLoad = Number(nextRow?.targetLoad || 0);
  const step = Number(exercise?.projectionIncrement || exercise?.projectedIncrement || nextRow?.increment || 5) || 5;
  if (!Number.isFinite(currentLoad) || currentLoad <= 0) return String(nextTarget || '');
  if (recommendation === 'increase') {
    const enforced = Number.isFinite(nextLoad) && nextLoad > currentLoad ? nextLoad : roundProjectedLoad(currentLoad + step, step);
    return `${enforced} lb`;
  }
  if (recommendation === 'hold') return `${currentLoad} lb`;
  if (recommendation === 'decrease') {
    const lowered = Number.isFinite(nextLoad) && nextLoad < currentLoad ? nextLoad : roundProjectedLoad(Math.max(step, currentLoad - step), step);
    return `${lowered} lb`;
  }
  if (recommendation === 'deload' || recommendation === 'continue_deload') {
    const deloaded = roundProjectedLoad(currentLoad * 0.88, step);
    return `${deloaded} lb`;
  }
  return String(nextTarget || '');
}


function phaseProjectionMultiplier(user) {
  return user?.phase === 'deficit' ? 0.96 : user?.phase === 'surplus' ? 1.03 : 1;
}

function experienceProjectionMultiplier(user) {
  return user?.experience === '<6m'
    ? 0.92
    : user?.experience === '6-24m'
      ? 1
      : user?.experience === '2-5y'
        ? 1.05
        : 1.08;
}

function conservativeFamilyEstimate(exercise, user, anchors, strengthStatus) {
  const family = projectionFamilyForExercise(exercise, user);
  const shape = projectionLoadShapeForExercise(exercise);
  const bench = Number(anchors?.bench1rm || 0);
  const squat = Number(anchors?.squat1rm || 0);
  const deadlift = Number(anchors?.deadlift1rm || 0);
  const workingBench = Number(anchors?.benchWorking || 0);
  const workingSquat = Number(anchors?.squatWorking || 0);
  const workingDeadlift = Number(anchors?.deadliftWorking || 0);
  const upperPullComposite = (bench * 0.35) + (deadlift * 0.28);
  const phaseMult = phaseProjectionMultiplier(user);
  const expMult = experienceProjectionMultiplier(user);
  const statusMult = strengthStatus?.status === 'above_standard' ? 1.04 : strengthStatus?.status === 'below_standard' ? 0.94 : 1;
  const baseByFamily = {
    chest_press: workingBench || (bench * 0.7),
    chest_iso: (bench * 0.22),
    shoulder_press: (bench * 0.46),
    horizontal_pull: roundProjectedLoad(upperPullComposite * 0.72, 2.5),
    vertical_pull: roundProjectedLoad(upperPullComposite * 0.66, 5),
    biceps_iso: (bench * 0.12) + (deadlift * 0.05),
    triceps_iso: (bench * 0.17) + (deadlift * 0.02),
    squat_pattern: workingSquat || (squat * 0.7),
    leg_press: squat * 1.12,
    single_leg: squat * 0.22,
    leg_extension: squat * 0.3,
    hinge_pattern: workingDeadlift || (deadlift * 0.62),
    hip_thrust: deadlift * 0.78,
    ham_curl: deadlift * 0.22,
    lateral_raise: (bench * 0.075) + (deadlift * 0.01),
    rear_delt: (bench * 0.09) + (deadlift * 0.015),
    calves: squat * 0.38,
    core_flexion: squat * 0.18,
    core_rotation: (bench * 0.1) + (deadlift * 0.05),
    core_stability: 0,
    general: (workingBench || (bench * 0.6) || workingSquat || (squat * 0.5) || workingDeadlift || (deadlift * 0.45))
  };
  let estimate = Number(baseByFamily[family] || baseByFamily.general || 0);
  if (!Number.isFinite(estimate) || estimate <= 0) {
    const fallbackValue = shape.equipmentClass === 'bodyweight'
      ? null
      : clampProjectedLoad(
        shape.equipmentClass === 'barbell'
          ? ((workingBench || bench || workingSquat || squat || workingDeadlift || deadlift) * 0.45)
          : shape.equipmentClass === 'dumbbell'
            ? ((workingBench || bench || workingDeadlift || deadlift) * 0.12)
            : ((workingBench || bench || workingSquat || squat || workingDeadlift || deadlift) * 0.22),
        shape.equipmentClass === 'barbell' ? 45 : 10,
        shape.equipmentClass === 'barbell' ? 315 : 120,
        shape.increment
      );
    return {
      family,
      equipmentClass: shape.equipmentClass,
      increment: shape.increment,
      loadUnitNote: shape.loadUnitNote,
      value: fallbackValue,
      confidence: 'low'
    };
  }
  estimate *= phaseMult * expMult * statusMult;
  if (shape.equipmentClass === 'dumbbell') estimate *= 0.5;
  if (shape.equipmentClass === 'machine') estimate *= 1.02;
  if (shape.equipmentClass === 'cable') estimate *= 0.9;
  const clampsByFamily = {
    chest_press: [45, Math.max(95, bench * 0.82)],
    chest_iso: [10, Math.max(35, bench * 0.32)],
    shoulder_press: [20, Math.max(65, bench * 0.58)],
    horizontal_pull: [30, Math.max(85, upperPullComposite * 0.9)],
    vertical_pull: [40, Math.max(90, upperPullComposite * 0.82)],
    biceps_iso: [10, Math.max(45, ((bench * 0.12) + (deadlift * 0.05)) * 1.1)],
    triceps_iso: [15, Math.max(55, ((bench * 0.17) + (deadlift * 0.02)) * 1.1)],
    squat_pattern: [45, Math.max(135, squat * 0.82)],
    leg_press: [90, Math.max(180, squat * 1.3)],
    single_leg: [10, Math.max(40, squat * 0.3)],
    leg_extension: [25, Math.max(90, squat * 0.38)],
    hinge_pattern: [45, Math.max(135, deadlift * 0.75)],
    hip_thrust: [65, Math.max(155, deadlift * 0.92)],
    ham_curl: [30, Math.max(95, deadlift * 0.3)],
    lateral_raise: [5, Math.max(25, (bench * 0.075) + (deadlift * 0.01))],
    rear_delt: [10, Math.max(35, (bench * 0.09) + (deadlift * 0.015))],
    calves: [25, Math.max(135, squat * 0.5)],
    core_flexion: [15, Math.max(70, squat * 0.28)],
    core_rotation: [10, Math.max(45, ((bench * 0.1) + (deadlift * 0.05)) * 1.15)],
    core_stability: [0, 0],
    general: [10, Math.max(65, estimate * 1.15)]
  };
  const [minValue, maxValue] = clampsByFamily[family] || clampsByFamily.general;
  const confidence = ['chest_press', 'squat_pattern', 'hinge_pattern', 'leg_press', 'hip_thrust'].includes(family)
    ? 'high'
    : ['horizontal_pull', 'vertical_pull', 'shoulder_press', 'ham_curl', 'leg_extension'].includes(family)
      ? 'medium'
      : 'low';
  const value = family === 'core_stability'
    ? null
    : clampProjectedLoad(estimate, minValue, maxValue, shape.increment);
  return {
    family,
    equipmentClass: shape.equipmentClass,
    increment: shape.increment,
    loadUnitNote: shape.loadUnitNote,
    value,
    confidence
  };
}

function projectionDeloadWeeks(user, exerciseLibrary = []) {
  // Rep-ladder progression has no scheduled deload weeks: reps resetting
  // to the cycle's starting count every 4 weeks is the built-in relief.
  return [];
}

/* Rep-ladder projection (owner spec): fixed 4-week cycles. Weeks 1-4 keep
   the SAME load while the rep target climbs by 1 each week from the
   bottom of the exercise's rep range; at each new cycle the load goes up
   a flat 5 lb and reps reset to the starting count. Sets never change.
   No hold or deload rows - the rep reset at each cycle is the built-in
   relief. Non-load movements ladder reps the same way and reset against
   a harder variation each cycle. */
const REP_LADDER_CYCLE_WEEKS = 4;
const REP_LADDER_LOAD_STEP_LB = 5;

function buildProjectionWeekRowsForExercise(exercise, user, estimate, deloadWeeks, anchorStatus) {
  const repRange = parseRepRangeText(exercise?.reps);
  const setsBase = Math.max(1, Number(exercise?.sets || 0) || 3);
  const progressionMode = progressionModeForExercise(exercise);
  // Progression scheme (default 'standard' == the old REP_LADDER_* constants).
  const scheme = getProgressionScheme(user);
  const family = estimate && estimate.family;
  const cycleWeeks = Math.max(1, Number(scheme.cycleWeeks) || REP_LADDER_CYCLE_WEEKS);
  // Accessory (isolation / bodyweight) movements keep the scheme's accessory base
  // (e.g. base 8 pull-ups) instead of the main-lift base.
  const repBase = resolveSchemeRepBaseForExercise(scheme, repRange, family, progressionMode);
  const minRep = repBase; // base of the rep cycle (repRange.min under 'standard')
  // Per-lift load step (deadlift/squat +20, main upper +10, isolation +5 under
  // double_progression; flat +5 for everything under 'standard').
  const loadStep = resolveSchemeLoadStep(scheme, family);
  const increment = Number(estimate?.increment || 2.5);
  const baseLoad = Number(estimate?.value || 0);
  const rows = [];
  for (let week = 1; week <= 16; week += 1) {
    const cycle = Math.floor((week - 1) / cycleWeeks);
    const pos = (week - 1) % cycleWeeks;
    const repTarget = minRep + pos;
    const lastWeekOfCycle = pos === cycleWeeks - 1;
    if (progressionMode !== 'external_load' && progressionMode !== 'loaded_bodyweight') {
      rows.push({
        week,
        exercise: exercise.displayName || exercise.name,
        canonicalExerciseId: exercise.canonicalExerciseId,
        targetLoad: null,
        repRange: `${repTarget}`,
        sets: setsBase,
        tag: 'normal',
        deloadLabel: null,
        progressionMode,
        note: progressionMode === 'bodyweight_tempo_progression'
          ? (lastWeekOfCycle ? 'Cycle ends this week. Next week reps reset and the tempo/position gets harder.' : 'Same difficulty as last week - add 1 rep.')
          : progressionMode === 'assisted_bodyweight'
            ? (lastWeekOfCycle ? 'Cycle ends this week. Next week reps reset with less assistance.' : 'Same assistance as last week - add 1 rep.')
            : (lastWeekOfCycle ? 'Cycle ends this week. Next week reps reset against a harder version.' : 'Same difficulty as last week - add 1 rep.'),
        displayTarget: `${repTarget} reps`,
        postDeloadReturnTarget: null
      });
      continue;
    }
    if (!Number.isFinite(baseLoad) || baseLoad <= 0) {
      rows.push({
        week,
        exercise: exercise.displayName || exercise.name,
        canonicalExerciseId: exercise.canonicalExerciseId,
        targetLoad: null,
        repRange: `${repTarget}`,
        sets: setsBase,
        tag: 'normal',
        deloadLabel: null,
        progressionMode,
        note: 'Non-load exercise or bodyweight-focused slot.',
        displayTarget: 'N/A',
        postDeloadReturnTarget: null
      });
      continue;
    }
    const load = roundProjectedLoad(baseLoad + (loadStep * cycle), increment);
    rows.push({
      week,
      exercise: exercise.displayName || exercise.name,
      canonicalExerciseId: exercise.canonicalExerciseId,
      targetLoad: load,
      repRange: `${repTarget}`,
      sets: setsBase,
      tag: 'normal',
      deloadLabel: null,
      progressionMode,
      note: lastWeekOfCycle
        ? `Last week of this cycle at ${load} lb. Next week: +${loadStep} lb and reps reset to ${minRep}.`
        : `Same weight as last week - add 1 rep (${repTarget} this week).`,
      displayTarget: `${load} lb`,
      postDeloadReturnTarget: null
    });
  }
  return rows;
}

function summarizeProjectionRows(rows = []) {
  const byWeek = new Map(rows.map((row) => [Number(row.week), row]));
  return {
    week1: byWeek.get(1)?.targetLoad ?? null,
    week8: byWeek.get(8)?.targetLoad ?? null,
    week16: byWeek.get(16)?.targetLoad ?? null
  };
}

function buildBodybuildingProgressionProjection(user, weeks) {
  const flattened = flattenPlanExercises(weeks);
  const exerciseMap = new Map();
  for (const exercise of flattened) {
    const key = String(exercise?.canonicalExerciseId || exercise?.name || '');
    if (!key || exerciseMap.has(key)) continue;
    exerciseMap.set(key, exercise);
  }
  const exerciseLibrary = Array.from(exerciseMap.values());
  const anchors = anchorWorkingWeights(user);
  const anchorStatus = classifyAnchorStrengthStatus(user, anchors);
  const deloadWeeks = projectionDeloadWeeks(user, exerciseLibrary);
  const familyAdjustments = {};
  const exerciseSummaries = [];
  const weeklyTable = [];
  for (const exercise of exerciseLibrary) {
    const estimate = conservativeFamilyEstimate(exercise, user, anchors, anchorStatus);
    familyAdjustments[estimate.family] = Number(familyAdjustments[estimate.family] || 1);
    const rows = buildProjectionWeekRowsForExercise(exercise, user, estimate, deloadWeeks, anchorStatus);
    weeklyTable.push(...rows);
    const rangeSummary = summarizeProjectionRows(rows);
    exerciseSummaries.push({
      canonicalExerciseId: exercise.canonicalExerciseId,
      exercise: exercise.displayName || exercise.name,
      family: estimate.family,
      progressionMode: progressionModeForExercise(exercise),
      equipmentClass: estimate.equipmentClass,
      loadUnitNote: estimate.loadUnitNote,
      confidence: estimate.confidence,
      startingLoad: estimate.value,
      week1Load: rangeSummary.week1,
      week8Load: rangeSummary.week8,
      week16Load: rangeSummary.week16,
      repRange: String(exercise?.reps || '8-12'),
      sets: Number(exercise?.sets || 0) || 3,
      major: ['chest_press', 'horizontal_pull', 'vertical_pull', 'squat_pattern', 'hinge_pattern', 'hip_thrust', 'leg_press', 'shoulder_press'].includes(estimate.family)
    });
  }
  const projectionByExerciseWeek = {};
  weeklyTable.forEach((row) => {
    const key = `${String(row.canonicalExerciseId)}:${Number(row.week)}`;
    projectionByExerciseWeek[key] = row;
  });
  return {
    anchorInputs: anchors,
    modeledAs: anchorStatus.status,
    anchorScore: anchorStatus.score,
    standards: anchorStatus.standards,
    classificationConfidence: anchorStatus.confidence,
    classificationReason: anchorStatus.reason,
    deloadWeeks,
    familyAdjustments,
    adaptiveRules: {
      overperform: 'After 2 strong overperformances in the same movement family, raise that family coefficient by 3%, capped at +15%.',
      underperform: 'After 2 weak performances in the same movement family, lower that family coefficient by 3%, capped at -15%.',
      stall: 'If a family stalls, hold load first, then reset reps or schedule a deload before changing the exercise.'
    },
    exerciseSummaries: exerciseSummaries.sort((a, b) => Number(b.major) - Number(a.major) || String(a.exercise).localeCompare(String(b.exercise))),
    weeklyTable: weeklyTable.sort((a, b) => Number(a.week) - Number(b.week) || String(a.exercise).localeCompare(String(b.exercise))),
    projectionByExerciseWeek
  };
}

function projectionLoadNoteForExercise(exercise, projection) {
  const summary = Array.isArray(projection?.exerciseSummaries)
    ? projection.exerciseSummaries.find((entry) => String(entry?.canonicalExerciseId || '') === String(exercise?.canonicalExerciseId || ''))
    : null;
  return summary?.loadUnitNote || null;
}

function applyProjectionToWeeks(weeks, projection) {
  return (Array.isArray(weeks) ? weeks : []).map((week) => {
    const weekIndex = Number(week?.weekIndex || 0);
    return {
      ...week,
      days: (week?.days || []).map((day) => ({
        ...day,
        exercises: (day?.exercises || []).map((exercise) => {
          const row = projection?.projectionByExerciseWeek?.[`${String(exercise?.canonicalExerciseId || exercise?.name)}:${weekIndex}`] || null;
          if (!row) return exercise;
          if (!Number.isFinite(Number(row?.targetLoad))) {
            return {
              ...exercise,
              progression: {
                ...(exercise?.progression || {}),
                projectionTag: row.tag,
                projectionNote: row.note,
                progressionMode: row.progressionMode || progressionModeForExercise(exercise),
                deloadLabel: row.deloadLabel || null,
                postDeloadReturnTarget: row.postDeloadReturnTarget || null,
                displayTarget: row.displayTarget || null
              },
              projectionFamily: projectionFamilyForExercise(exercise),
              projectionLoadNote: projectionLoadNoteForExercise(exercise, projection)
            };
          }
          return {
            ...exercise,
            projected: { value: Number(row.targetLoad), unit: 'lb' },
            projectedWeight: Number(row.targetLoad),
            projectedUnit: 'lb',
            progression: {
              ...(exercise?.progression || {}),
              projectionTag: row.tag,
              projectionNote: row.note,
              progressionMode: row.progressionMode || progressionModeForExercise(exercise),
              deloadLabel: row.deloadLabel || null,
              postDeloadReturnTarget: row.postDeloadReturnTarget || null,
              displayTarget: row.displayTarget || null
            },
            projectionFamily: projectionFamilyForExercise(exercise),
            projectionLoadNote: projectionLoadNoteForExercise(exercise, projection)
          };
        })
      }))
    };
  });
}

function createAdaptiveProjectionState(user, projection) {
  const familyAdjustments = { ...(projection?.familyAdjustments || {}) };
  Object.keys(familyAdjustments).forEach((family) => {
    familyAdjustments[family] = Number(familyAdjustments[family] || 1);
  });
  return {
    modeledAs: projection?.modeledAs || 'on_track',
    familyAdjustments,
    overperformanceStreaks: {},
    underperformanceStreaks: {},
    history: [],
    phase: user?.phase || 'recomp'
  };
}






function buildConstrainedSchedule(user) {
  const d = Number(user?.daysPerWeek || 0);
  const days = user.preferredDays.length === d ? user.preferredDays.slice(0, d) : WEEKDAY_DEFAULT_ORDER.slice(0, d);
  let split = [];
  if (d === 2) split = ['FullBodyA', 'FullBodyB'];
  else if (d === 3) split = ['FullBodyA', 'LowerFocus', 'FullBodyB'];
  else if (d === 4) split = ['Upper', 'LowerFocus', 'UpperFocus', 'Lower'];
  else if (d === 5) split = ['Push', 'Pull', 'LowerFocus', 'UpperFocus', 'Lower'];
  else split = ['Push', 'Pull', 'LowerFocus', 'UpperFocus', 'Lower', 'DeltsArms'];
  return split.map((dayType, index) => ({ day: days[index], dayType }));
}

function extractInternalPlanState(schedule, weeks, safeResult = {}, notes = [], meta = {}) {
  return {
    schedule,
    weeks,
    filteredCount: Number(safeResult?.filteredCount || 0),
    notes: Array.isArray(notes) ? notes.slice() : [],
    stageMeta: { ...(meta || {}) }
  };
}

function buildCurrentDayState(day) {
  const state = { families: new Set(), names: new Set(), counts: { chest_fly: 0, rear_delt: 0, bench_press: 0 }, dayKey: String(day?.dayType || '') };
  for (const ex of Array.isArray(day?.exercises) ? day.exercises : []) {
    state.names.add(exerciseDayIdentityKey(ex));
    const fam = slotExerciseFamily(ex);
    if (fam) {
      state.families.add(fam);
      state.counts[fam] = Number(state.counts[fam] || 0) + 1;
    }
    if (/\bbench press\b/.test(normalizeName(ex?.name))) state.counts.bench_press = Number(state.counts.bench_press || 0) + 1;
  }
  return state;
}

function reinforceLowFrequencyPriorityAccessories(weeks, user, exercises) {
  if (!Array.isArray(weeks) || !weeks.length) return weeks;
  if (Number(user?.daysPerWeek || 0) > 3) return weeks;
  const needCalves = hasPriorityGroup(user, 'Calves');
  const needCore = hasPriorityGroup(user, 'Abs');
  if (!needCalves && !needCore) return weeks;
  const targetCalfDays = Math.min(2, Number(user?.daysPerWeek || 0));
  const targetCoreDays = needCore ? Math.min(2, Number(user?.daysPerWeek || 0)) : 0;
  const priorities = new Set((user?.priorityGroups || []).map((value) => String(value || '')));
  return weeks.map((week) => {
    const days = Array.isArray(week?.days) ? week.days.map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] })) : [];
    let calfDays = days.filter((day) => day.exercises.some((ex) => /\bcalf\b/.test(normalizeName(ex?.name)))).length;
    let coreDays = days.filter((day) => day.exercises.some((ex) => slotExerciseFamily(ex)?.startsWith('core_') || String(ex?.primary || ex?.muscleTarget || '') === 'Core')).length;
    const injectPriorityExercise = (day, slot, sets = 2) => {
      const dayState = buildCurrentDayState(day);
      const eligible = filterEligible(slot, exercises, user, new Set(), dayState, day?.dayType || '', null)
        .map((ex) => ({ ex, score: scoreExercise(ex, slot, user, day?.dayType || '') }))
        .sort((a, b) => (b.score - a.score) || a.ex.name.localeCompare(b.ex.name));
      const chosen = eligible[0]?.ex;
      if (!chosen) return false;
      const replaceIdx = day.exercises.findIndex((ex) => {
        const primary = String(ex?.primary || ex?.muscleTarget || '');
        return !['Calves', 'Core', 'Chest', 'Back', 'Shoulders', 'Arms'].includes(primary)
          && (String(ex?.style || '') === 'Isolation' || (!priorities.has(primary) && String(ex?.style || '') === 'Compound'));
      });
      const rr = repsRestByExercise(chosen, String(week?.weekType || 'base'), user, slot.id);
      const item = buildExerciseOutput(chosen, user, { ...slot, optional: false }, sets, rr, { weekType: String(week?.weekType || 'base') });
      if (replaceIdx >= 0) day.exercises.splice(replaceIdx, 1, item);
      else if ((day.exercises || []).length < Number(user?.sessionCap || 5)) day.exercises.push(item);
      else return false;
      day.exercises = organizeDayExerciseOrder(day.dayType, day.exercises);
      if (slot.muscleTarget === 'Calves') {
        recordPriorityDebug(user, 'calf', 'reinforced', {
          dayType: day?.dayType || '',
          canonicalExerciseId: item.canonicalExerciseId,
          displayName: item.displayName
        });
      }
      if (slot.muscleTarget === 'Core') {
        recordPriorityDebug(user, 'abs', 'reinforced', {
          dayType: day?.dayType || '',
          canonicalExerciseId: item.canonicalExerciseId,
          displayName: item.displayName
        });
      }
      return true;
    };
    for (const day of days) {
      if (needCalves && calfDays < targetCalfDays && !day.exercises.some((ex) => /\bcalf\b/.test(normalizeName(ex?.name)))) {
        const calfSlot = {
          id: `${String(day?.dayType || 'day').toLowerCase()}_elite_calf_reinforce`,
          pattern: 'Isolation',
          styleRequired: 'Isolation',
          muscleTarget: 'Calves',
          primaryAllowed: ['Legs'],
          subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
          subFallback: null,
          optional: false
        };
        if (injectPriorityExercise(day, calfSlot, 3)) calfDays += 1;
      }
      if (needCore && coreDays < targetCoreDays && !day.exercises.some((ex) => slotExerciseFamily(ex)?.startsWith('core_') || String(ex?.primary || ex?.muscleTarget || '') === 'Core')) {
        const corePattern = coreDays === 0 ? 'CoreFlexion' : 'CoreStability';
        const coreSlot = {
          id: `${String(day?.dayType || 'day').toLowerCase()}_elite_core_reinforce`,
          pattern: corePattern,
          styleRequired: 'Isolation',
          muscleTarget: 'Core',
          primaryAllowed: ['Core'],
          subPreferred: corePattern === 'CoreFlexion' ? ['Abs-Lower', 'Abs-Upper'] : ['TVA', 'Obliques'],
          subFallback: null,
          optional: false
        };
        if (injectPriorityExercise(day, coreSlot, 2)) coreDays += 1;
      }
    }
    return { ...week, days };
  });
}

function reinforceShoulderPriorityVisibility(weeks, user, exercises) {
  emitPlannerDiagnosticHeartbeat(user, 'entered_reinforce_shoulder_priority_visibility', {
    functionName: 'reinforceShoulderPriorityVisibility',
    fileName: 'generator/trainingEngine.oblueprint.js',
    elapsedMs: plannerNowMs(),
    weeksLength: Array.isArray(weeks) ? weeks.length : 0,
    totalDayCount: Array.isArray(weeks) ? weeks.reduce((sum, week) => sum + (Array.isArray(week?.days) ? week.days.length : 0), 0) : 0,
    totalExerciseCount: Array.isArray(weeks) ? weeks.reduce((sum, week) => sum + ((Array.isArray(week?.days) ? week.days : []).reduce((daySum, day) => daySum + (Array.isArray(day?.exercises) ? day.exercises.length : 0), 0)), 0) : 0,
    requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
    selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
    loopIterationCount: 0,
    replacementAttempts: 0,
    noProgressCount: 0
  });
  if (!Array.isArray(weeks) || !weeks.length) return weeks;
  if (!(user?.priorityGroups || []).includes('Shoulders')) return weeks;
  if (Number(user?.daysPerWeek || 0) < 4) return weeks;
  if (Number(user?.injuryMap?.shoulder || 0) >= 6) return weeks;
  const MAX_VISIBILITY_ATTEMPTS = 24;
  const isDirectShoulder = (ex) => {
    const name = normalizeName(ex?.name);
    const primary = String(ex?.primary || ex?.muscleTarget || '');
    return primary === 'Shoulders' || /(lateral raise|rear delt|reverse fly|shoulder press|overhead press|military press)/.test(name);
  };
  const isShoulderPress = (ex) => /(shoulder press|overhead press|military press)/.test(normalizeName(ex?.name));
  const isLateralOrRear = (ex) => /(lateral raise|rear delt|reverse fly|face pull|reverse pec deck)/.test(normalizeName(ex?.name));
  return weeks.map((week, weekIndex) => {
    const days = (week?.days || []).map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] }));
    let loopIterationCount = 0;
    let replacementAttempts = 0;
    let noProgressCount = 0;
    const initialShoulderDays = days.filter((day) => day.exercises.some(isDirectShoulder)).length;
    let hasPress = days.some((day) => day.exercises.some(isShoulderPress));
    let hasLateralRear = days.some((day) => day.exercises.some(isLateralOrRear));
    const candidateDayOrder = ['Push', 'Pull', 'UpperFocus', 'Upper', 'DeltsArms', 'FullBodyA', 'FullBodyB'];

    const addShoulderExercise = (day, wantPress = false) => {
      loopIterationCount += 1;
      replacementAttempts += 1;
      if (replacementAttempts > MAX_VISIBILITY_ATTEMPTS) {
        noProgressCount += 1;
        emitPlannerDiagnosticHeartbeat(user, 'visibility_reinforcement_degraded', {
          functionName: 'reinforceShoulderPriorityVisibility',
          fileName: 'generator/trainingEngine.oblueprint.js',
          elapsedMs: plannerNowMs(),
          weekIndex,
          weeksLength: Array.isArray(weeks) ? weeks.length : 0,
          totalDayCount: days.length,
          totalExerciseCount: days.reduce((sum, entry) => sum + (Array.isArray(entry?.exercises) ? entry.exercises.length : 0), 0),
          requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
          selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
          loopIterationCount,
          replacementAttempts,
          noProgressCount
        });
        return false;
      }
      const slot = wantPress
        ? {
            id: `${String(day?.dayType || 'day').toLowerCase()}_elite_shoulder_press`,
            pattern: 'VerticalPush',
            styleRequired: 'Compound',
            muscleTarget: 'Shoulders',
            primaryAllowed: ['Shoulders'],
            subPreferred: null,
            subFallback: null,
            optional: false
          }
        : {
            id: `${String(day?.dayType || 'day').toLowerCase()}_elite_shoulder_iso`,
            pattern: 'Isolation',
            styleRequired: 'Isolation',
            muscleTarget: 'Shoulders',
            primaryAllowed: ['Shoulders'],
            subPreferred: ['Lateral', 'Rear'],
            subFallback: null,
            optional: false
          };
      const dayState = buildCurrentDayState(day);
      const eligible = filterEligible(slot, exercises, user, new Set(), dayState, day?.dayType || '', null)
        .map((candidate) => ({ candidate, score: scoreExercise(candidate, slot, user, day?.dayType || '') }))
        .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
      const chosen = eligible[0]?.candidate;
      if (!chosen) return false;
      const beforeSignature = JSON.stringify(days.map((entry) => (entry?.exercises || []).map((exercise) => String(exercise?.name || ''))));
      const rr = repsRestByExercise(chosen, String(week?.weekType || 'base'), user, slot.id);
      const item = buildExerciseOutput(chosen, user, { ...slot, optional: false }, wantPress ? 3 : 2, rr, { weekType: String(week?.weekType || 'base') });
      const replaceIdx = day.exercises.findIndex((ex) => {
        const primary = String(ex?.primary || ex?.muscleTarget || '');
        return primary === 'Core' || primary === 'Arms' || (String(ex?.style || '') === 'Isolation' && primary !== 'Shoulders');
      });
      if (replaceIdx >= 0) day.exercises.splice(replaceIdx, 1, item);
      else if ((day.exercises || []).length < Number(user?.sessionCap || 6)) day.exercises.push(item);
      else return false;
      day.exercises = organizeDayExerciseOrder(day.dayType, day.exercises);
      const afterSignature = JSON.stringify(days.map((entry) => (entry?.exercises || []).map((exercise) => String(exercise?.name || ''))));
      if (beforeSignature === afterSignature) noProgressCount += 1;
      return true;
    };

    if (!hasPress) {
      for (const type of candidateDayOrder) {
        const day = days.find((entry) => String(entry?.dayType || '') === type);
        if (day && addShoulderExercise(day, true)) {
          hasPress = true;
          break;
        }
      }
    }
    if (!hasLateralRear) {
      for (const type of candidateDayOrder) {
        const day = days.find((entry) => String(entry?.dayType || '') === type);
        if (day && addShoulderExercise(day, false)) {
          hasLateralRear = true;
          break;
        }
      }
    }
    const refreshedShoulderDays = days.filter((day) => day.exercises.some(isDirectShoulder));
    if (refreshedShoulderDays.length < 2) {
      for (const type of candidateDayOrder) {
        const day = days.find((entry) => String(entry?.dayType || '') === type && !entry.exercises.some(isDirectShoulder));
        if (day && addShoulderExercise(day, !hasPress)) {
          if (days.filter((entry) => entry.exercises.some(isDirectShoulder)).length >= 2) break;
        }
      }
    }
    emitPlannerDiagnosticHeartbeat(user, 'after_reinforce_shoulder_priority_visibility', {
      functionName: 'reinforceShoulderPriorityVisibility',
      fileName: 'generator/trainingEngine.oblueprint.js',
      elapsedMs: plannerNowMs(),
      weekIndex,
      weeksLength: Array.isArray(weeks) ? weeks.length : 0,
      totalDayCount: days.length,
      totalExerciseCount: days.reduce((sum, entry) => sum + (Array.isArray(entry?.exercises) ? entry.exercises.length : 0), 0),
      requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
      selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
      loopIterationCount,
      replacementAttempts,
      noProgressCount,
      beforeShoulderDayCount: initialShoulderDays,
      afterShoulderDayCount: days.filter((day) => day.exercises.some(isDirectShoulder)).length
    });
    return { ...week, days };
  });
}

function reinforceArmPriorityVisibility(weeks, user, exercises) {
  emitPlannerDiagnosticHeartbeat(user, 'entered_reinforce_arm_priority_visibility', {
    functionName: 'reinforceArmPriorityVisibility',
    fileName: 'generator/trainingEngine.oblueprint.js',
    elapsedMs: plannerNowMs(),
    weeksLength: Array.isArray(weeks) ? weeks.length : 0,
    totalDayCount: Array.isArray(weeks) ? weeks.reduce((sum, week) => sum + (Array.isArray(week?.days) ? week.days.length : 0), 0) : 0,
    totalExerciseCount: Array.isArray(weeks) ? weeks.reduce((sum, week) => sum + ((Array.isArray(week?.days) ? week.days : []).reduce((daySum, day) => daySum + (Array.isArray(day?.exercises) ? day.exercises.length : 0), 0)), 0) : 0,
    requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
    selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
    loopIterationCount: 0,
    replacementAttempts: 0,
    noProgressCount: 0
  });
  if (!Array.isArray(weeks) || !weeks.length) return weeks;
  if (!(user?.priorityGroups || []).includes('Arms')) return weeks;
  const MAX_VISIBILITY_ATTEMPTS = 64;
  const MAX_NO_PROGRESS = 16;
  const isDirectBiceps = (ex) => isDirectBicepsName(ex?.name);
  const isDirectTriceps = (ex) => isDirectTricepsName(ex?.name);
  const tricepsFamilyOf = (ex) => tricepsMovementFamily(ex?.name);
  const summarizeArmWork = (days) => {
    const summary = {
      bicepsSets: 0,
      tricepsSets: 0,
      bicepsExercises: [],
      tricepsExercises: [],
      tricepsFamilies: new Set()
    };
    (Array.isArray(days) ? days : []).forEach((day, dayIdx) => {
      (day?.exercises || []).forEach((exercise, exIdx) => {
        const sets = Math.max(0, Number(exercise?.sets || 0));
        if (isDirectBiceps(exercise)) {
          summary.bicepsSets += sets;
          summary.bicepsExercises.push({ day, dayIdx, exIdx, exercise });
        }
        if (isDirectTriceps(exercise)) {
          summary.tricepsSets += sets;
          summary.tricepsExercises.push({ day, dayIdx, exIdx, exercise });
          const family = tricepsFamilyOf(exercise);
          if (family !== 'none') summary.tricepsFamilies.add(family);
        }
      });
    });
    return summary;
  };
  const preferredDayOrderByFamily = {
    press: ['Push', 'Upper', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB', 'Pull'],
    overhead: ['UpperFocus', 'Upper', 'DeltsArms', 'Push', 'FullBodyA', 'FullBodyB', 'Pull'],
    pushdown: ['Push', 'Upper', 'Pull', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB'],
    extension: ['Push', 'Upper', 'Pull', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB']
  };
  const buildArmSlot = (dayType, target, family) => {
    if (target === 'triceps' && family === 'press') {
      return {
        id: `${String(dayType || 'day').toLowerCase()}_elite_triceps_press`,
        pattern: 'HorizontalPush',
        styleRequired: 'Compound',
        muscleTarget: 'Arms',
        primaryAllowed: ['Arms', 'Chest'],
        subPreferred: ['Triceps-Press'],
        subFallback: null,
        optional: false
      };
    }
    if (target === 'triceps' && family === 'overhead') {
      return {
        id: `${String(dayType || 'day').toLowerCase()}_elite_triceps_overhead`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Arms',
        primaryAllowed: ['Arms'],
        subPreferred: ['Triceps-Overhead', 'Triceps-Long'],
        subFallback: ['Triceps-Lateral'],
        optional: false
      };
    }
    if (target === 'triceps' && family === 'pushdown') {
      return {
        id: `${String(dayType || 'day').toLowerCase()}_elite_triceps_pushdown`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Arms',
        primaryAllowed: ['Arms'],
        subPreferred: ['Triceps-Pushdown', 'Triceps-Lateral'],
        subFallback: ['Triceps-Long'],
        optional: false
      };
    }
    return {
      id: `${String(dayType || 'day').toLowerCase()}_elite_${target}_arm`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Arms',
      primaryAllowed: ['Arms'],
      subPreferred: target === 'biceps'
        ? ['Biceps-Long', 'Biceps-Short']
        : ['Triceps-Long', 'Triceps-Lateral'],
      subFallback: null,
      optional: false
    };
  };
  return weeks.map((week, weekIndex) => {
    const days = (week?.days || []).map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] }));
    const weekType = String(week?.weekType || 'base');
    let loopIterationCount = 0;
    let replacementAttempts = 0;
    let noProgressCount = 0;
    const currentSignature = () => JSON.stringify(days.map((day) => (day?.exercises || []).map((exercise) => `${String(exercise?.name || '')}:${Number(exercise?.sets || 0)}`)));
    let armSummary = summarizeArmWork(days);
    let bicepsDays = days.filter((day) => day.exercises.some(isDirectBiceps)).length;
    let tricepsDays = days.filter((day) => day.exercises.some(isDirectTriceps)).length;
    const chooseReplaceIndex = (day, target, family = null) => {
      if (target === 'triceps') {
        if (family) {
          const existingTriceps = (day?.exercises || [])
            .map((exercise, index) => ({ exercise, index }))
            .filter(({ exercise }) => isDirectTriceps(exercise) && tricepsFamilyOf(exercise) !== family);
          if (existingTriceps.length) return existingTriceps.at(-1)?.index ?? -1;
        }
        const directBicepsIndexes = (day?.exercises || [])
          .map((exercise, index) => ({ exercise, index }))
          .filter(({ exercise }) => isDirectBiceps(exercise));
        if (directBicepsIndexes.length > 1) return directBicepsIndexes.at(-1)?.index ?? -1;
      }
      const replaceIdx = day.exercises.findIndex((ex) => {
        const primary = String(ex?.primary || ex?.muscleTarget || '');
        return primary === 'Core' || (String(ex?.style || '') === 'Isolation' && !['Arms', 'Shoulders'].includes(primary));
      });
      if (replaceIdx >= 0) return replaceIdx;
      const compoundReplaceIdx = day.exercises.findIndex((ex) => {
        const primary = String(ex?.primary || ex?.muscleTarget || '');
        return String(ex?.style || '') === 'Compound'
          && !['Arms', 'Shoulders', 'Legs', 'Glutes'].includes(primary)
          && !(user?.priorityGroups || []).includes(primary);
      });
      if (compoundReplaceIdx >= 0) return compoundReplaceIdx;
      if (target === 'triceps' && family) {
        const fallbackBiIdx = day.exercises.findIndex((ex) => isDirectBiceps(ex));
        if (fallbackBiIdx >= 0) return fallbackBiIdx;
      }
      return -1;
    };
    const addArmExercise = (day, target, family = null) => {
      loopIterationCount += 1;
      replacementAttempts += 1;
      if (replacementAttempts > MAX_VISIBILITY_ATTEMPTS || noProgressCount > MAX_NO_PROGRESS) {
        emitPlannerDiagnosticHeartbeat(user, 'visibility_reinforcement_degraded', {
          functionName: 'reinforceArmPriorityVisibility',
          fileName: 'generator/trainingEngine.oblueprint.js',
          elapsedMs: plannerNowMs(),
          weekIndex,
          weeksLength: Array.isArray(weeks) ? weeks.length : 0,
          totalDayCount: days.length,
          totalExerciseCount: days.reduce((sum, entry) => sum + (Array.isArray(entry?.exercises) ? entry.exercises.length : 0), 0),
          requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
          selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
          loopIterationCount,
          replacementAttempts,
          noProgressCount
        });
        return false;
      }
      const slot = buildArmSlot(day?.dayType || '', target, family);
      const dayState = buildCurrentDayState(day);
      const beforeSignature = currentSignature();
      const baseEligible = target === 'triceps' && family === 'press'
        ? getBaseEligibleExercises(exercises, user, day?.dayType || '')
        : filterEligible(slot, exercises, user, new Set(), dayState, day?.dayType || '', null);
      const eligible = baseEligible
        .filter((candidate) => {
          if (target === 'biceps') return isDirectBiceps(candidate);
          if (!isDirectTriceps(candidate)) return false;
          if (!family) return true;
          return tricepsMovementFamily(candidate?.name) === family;
        })
        .filter((candidate) => {
          if (target === 'triceps' && family === 'press') return String(candidate?.style || '') === 'Compound';
          return true;
        })
        .filter((candidate) => !sameDayExerciseExists(day, candidate))
        .map((candidate) => ({ candidate, score: scoreExercise(candidate, slot, user, day?.dayType || '') }))
        .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
      const chosen = eligible[0]?.candidate;
      if (!chosen) return false;
      const rr = repsRestByExercise(chosen, weekType, user, slot.id);
      const baseSets = target === 'triceps'
        ? family === 'press'
          ? 4
          : family === 'overhead' || family === 'pushdown'
            ? 3
            : 3
        : 3;
      const item = buildExerciseOutput(chosen, user, { ...slot, optional: false }, baseSets, rr, { weekType });
      const replaceIdx = chooseReplaceIndex(day, target, family);
      if (replaceIdx >= 0) day.exercises.splice(replaceIdx, 1, item);
      else if ((day.exercises || []).length < Number(user?.sessionCap || 6)) day.exercises.push(item);
      else return false;
      day.exercises = organizeDayExerciseOrder(day.dayType, day.exercises);
      if (beforeSignature === currentSignature()) noProgressCount += 1;
      else noProgressCount = 0;
      return true;
    };
    const ensureTricepsFamily = (family) => {
      armSummary = summarizeArmWork(days);
      if (armSummary.tricepsExercises.some(({ exercise }) => tricepsFamilyOf(exercise) === family)) return true;
      const order = preferredDayOrderByFamily[family] || preferredDayOrderByFamily.extension;
      for (const type of order) {
        const day = days.find((entry) => String(entry?.dayType || '') === type);
        if (!day) continue;
        if (family !== 'press' && day.exercises.some((exercise) => tricepsFamilyOf(exercise) === family)) return true;
        if (addArmExercise(day, 'triceps', family)) {
          armSummary = summarizeArmWork(days);
          return true;
        }
      }
      return false;
    };
    const order = ['Push', 'Pull', 'UpperFocus', 'Upper', 'DeltsArms', 'FullBodyA', 'FullBodyB'];
    if (tricepsDays < 1) {
      for (const type of order) {
        const day = days.find((entry) => String(entry?.dayType || '') === type && !entry.exercises.some(isDirectTriceps));
        if (day && addArmExercise(day, 'triceps', 'pushdown')) { tricepsDays += 1; break; }
      }
    }
    if (bicepsDays < 1) {
      for (const type of order) {
        const day = days.find((entry) => String(entry?.dayType || '') === type && !entry.exercises.some(isDirectBiceps));
        if (day && addArmExercise(day, 'biceps')) { bicepsDays += 1; break; }
      }
    }
    const totalArmExposureDays = days.filter((day) => day.exercises.some((ex) => isDirectBiceps(ex) || isDirectTriceps(ex))).length;
    if (totalArmExposureDays < 2) {
      for (const type of order) {
        const day = days.find((entry) => String(entry?.dayType || '') === type && !entry.exercises.some((ex) => isDirectBiceps(ex) || isDirectTriceps(ex)));
        if (day && addArmExercise(day, bicepsDays <= tricepsDays ? 'biceps' : 'triceps')) {
          if (days.filter((entry) => entry.exercises.some((ex) => isDirectBiceps(ex) || isDirectTriceps(ex))).length >= 2) break;
        }
      }
    }
    ensureTricepsFamily('press');
    ensureTricepsFamily('overhead');
    ensureTricepsFamily('pushdown');

    armSummary = summarizeArmWork(days);
    const minTricepsExercises = Number(user?.daysPerWeek || 0) >= 5 ? 3 : 2;
    while (armSummary.tricepsExercises.length < minTricepsExercises) {
      const beforeSignature = currentSignature();
      let added = false;
      for (const family of ['pushdown', 'overhead', 'extension']) {
        for (const type of preferredDayOrderByFamily[family] || order) {
          const day = days.find((entry) => String(entry?.dayType || '') === type);
          if (day && addArmExercise(day, 'triceps', family)) {
            added = true;
            break;
          }
        }
        if (added) break;
      }
      armSummary = summarizeArmWork(days);
      loopIterationCount += 1;
      if (beforeSignature === currentSignature()) noProgressCount += 1;
      else noProgressCount = 0;
      if (!added) break;
      if (loopIterationCount > MAX_VISIBILITY_ATTEMPTS || noProgressCount > MAX_NO_PROGRESS) {
        emitPlannerDiagnosticHeartbeat(user, 'visibility_reinforcement_degraded', {
          functionName: 'reinforceArmPriorityVisibility',
          fileName: 'generator/trainingEngine.oblueprint.js',
          elapsedMs: plannerNowMs(),
          weekIndex,
          weeksLength: Array.isArray(weeks) ? weeks.length : 0,
          totalDayCount: days.length,
          totalExerciseCount: days.reduce((sum, entry) => sum + (Array.isArray(entry?.exercises) ? entry.exercises.length : 0), 0),
          requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
          selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
          loopIterationCount,
          replacementAttempts,
          noProgressCount
        });
        break;
      }
    }

    const applyArmSetBalancing = () => {
      armSummary = summarizeArmWork(days);
      const familyPriority = { press: 0, overhead: 1, pushdown: 2, extension: 3, none: 4 };
      const tricepsEntries = armSummary.tricepsExercises.slice().sort((a, b) => (
        (familyPriority[tricepsFamilyOf(a.exercise)] ?? 9) - (familyPriority[tricepsFamilyOf(b.exercise)] ?? 9)
      ));
      tricepsEntries.forEach(({ exercise }) => {
        const family = tricepsFamilyOf(exercise);
        const minSets = family === 'press' ? 4 : family === 'overhead' || family === 'pushdown' ? 3 : 2;
        exercise.sets = Math.max(minSets, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(exercise?.sets || minSets)));
      });
      let refreshed = summarizeArmWork(days);
      const bicepsEntries = refreshed.bicepsExercises.slice();
      const desiredTricepsSets = refreshed.bicepsSets >= 8
        ? Math.max(refreshed.bicepsSets, Math.min(12, refreshed.bicepsSets + 2))
        : refreshed.bicepsSets;
      bicepsEntries.forEach(({ exercise }) => {
        const maxSets = 3;
        exercise.sets = Math.max(3, Math.min(maxSets, Number(exercise?.sets || 3)));
      });
      refreshed = summarizeArmWork(days);
      const triOrdered = refreshed.tricepsExercises.slice().sort((a, b) => (
        (familyPriority[tricepsFamilyOf(a.exercise)] ?? 9) - (familyPriority[tricepsFamilyOf(b.exercise)] ?? 9)
      ));
      for (const { exercise } of triOrdered) {
        if (refreshed.tricepsSets >= desiredTricepsSets) break;
        const nextSets = Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(exercise?.sets || 0) + 1);
        if (nextSets > Number(exercise?.sets || 0)) {
          exercise.sets = nextSets;
          refreshed = summarizeArmWork(days);
        }
      }
      while (refreshed.tricepsSets < refreshed.bicepsSets || (refreshed.bicepsSets >= 8 && refreshed.tricepsSets < desiredTricepsSets)) {
        const beforeSignature = currentSignature();
        loopIterationCount += 1;
        const extraBiceps = refreshed.bicepsExercises.slice().sort((a, b) => b.exIdx - a.exIdx);
        const replaced = extraBiceps.some(({ day }) => addArmExercise(day, 'triceps', refreshed.tricepsFamilies.has('pushdown') ? (refreshed.tricepsFamilies.has('overhead') ? 'extension' : 'overhead') : 'pushdown'));
        refreshed = summarizeArmWork(days);
        if (beforeSignature === currentSignature()) noProgressCount += 1;
        else noProgressCount = 0;
        if (!replaced) break;
        if (loopIterationCount > MAX_VISIBILITY_ATTEMPTS || noProgressCount > MAX_NO_PROGRESS) {
          emitPlannerDiagnosticHeartbeat(user, 'visibility_reinforcement_degraded', {
            functionName: 'reinforceArmPriorityVisibility',
            fileName: 'generator/trainingEngine.oblueprint.js',
            elapsedMs: plannerNowMs(),
            weekIndex,
            weeksLength: Array.isArray(weeks) ? weeks.length : 0,
            totalDayCount: days.length,
            totalExerciseCount: days.reduce((sum, entry) => sum + (Array.isArray(entry?.exercises) ? entry.exercises.length : 0), 0),
            requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
            selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
            loopIterationCount,
            replacementAttempts,
            noProgressCount
          });
          break;
        }
        const tricepsOrdered = refreshed.tricepsExercises.slice().sort((a, b) => (
          (familyPriority[tricepsFamilyOf(a.exercise)] ?? 9) - (familyPriority[tricepsFamilyOf(b.exercise)] ?? 9)
        ));
        for (const { exercise } of tricepsOrdered) {
          if (refreshed.tricepsSets >= refreshed.bicepsSets && (!(refreshed.bicepsSets >= 8) || refreshed.tricepsSets >= desiredTricepsSets)) break;
          const nextSets = Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(exercise?.sets || 0) + 1);
          if (nextSets > Number(exercise?.sets || 0)) {
            exercise.sets = nextSets;
            refreshed = summarizeArmWork(days);
          }
        }
        if (!extraBiceps.length) break;
      }
      let finalSummary = summarizeArmWork(days);
      if (finalSummary.bicepsSets > finalSummary.tricepsSets) {
        for (const { exercise } of finalSummary.bicepsExercises.slice().sort((a, b) => b.exIdx - a.exIdx)) {
          if (finalSummary.bicepsSets <= finalSummary.tricepsSets) break;
          const nextSets = Math.max(2, Number(exercise?.sets || 2) - 1);
          if (nextSets < Number(exercise?.sets || 2)) {
            exercise.sets = nextSets;
            finalSummary = summarizeArmWork(days);
          }
        }
      }
    };
    applyArmSetBalancing();
    const trimExtraDirectArmWork = () => {
      let refreshed = summarizeArmWork(days);
      const maxBicepsExercises = 2;
      const maxTricepsExercises = 3;
      const removableBiceps = refreshed.bicepsExercises.slice().sort((a, b) => b.exIdx - a.exIdx);
      for (const { day, exIdx } of removableBiceps) {
        refreshed = summarizeArmWork(days);
        if (refreshed.bicepsExercises.length <= maxBicepsExercises) break;
        if ((day?.exercises || []).length <= 2) continue;
        day.exercises.splice(exIdx, 1);
        day.exercises = organizeDayExerciseOrder(day.dayType, day.exercises);
      }
      refreshed = summarizeArmWork(days);
      const keepTriKeys = new Set();
      ['press', 'overhead', 'pushdown'].forEach((family) => {
        const kept = refreshed.tricepsExercises.find(({ exercise }) => tricepsFamilyOf(exercise) === family);
        if (kept) keepTriKeys.add(`${kept.dayIdx}:${kept.exIdx}`);
      });
      const removableTriceps = refreshed.tricepsExercises
        .slice()
        .filter(({ exercise, dayIdx, exIdx }) => {
          const key = `${dayIdx}:${exIdx}`;
          if (keepTriKeys.has(key)) return false;
          return true;
        })
        .sort((a, b) => b.exIdx - a.exIdx);
      for (const { day, exIdx } of removableTriceps) {
        refreshed = summarizeArmWork(days);
        if (refreshed.tricepsExercises.length <= maxTricepsExercises) break;
        if ((day?.exercises || []).length <= 2) continue;
        day.exercises.splice(exIdx, 1);
        day.exercises = organizeDayExerciseOrder(day.dayType, day.exercises);
      }
    };
    trimExtraDirectArmWork();
    applyArmSetBalancing();
    emitPlannerDiagnosticHeartbeat(user, 'after_reinforce_arm_priority_visibility', {
      functionName: 'reinforceArmPriorityVisibility',
      fileName: 'generator/trainingEngine.oblueprint.js',
      elapsedMs: plannerNowMs(),
      weekIndex,
      weeksLength: Array.isArray(weeks) ? weeks.length : 0,
      totalDayCount: days.length,
      totalExerciseCount: days.reduce((sum, entry) => sum + (Array.isArray(entry?.exercises) ? entry.exercises.length : 0), 0),
      requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
      selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
      loopIterationCount,
      replacementAttempts,
      noProgressCount
    });
    return { ...week, days };
  });
}

function flattenPlanExercises(weeks) {
  return (Array.isArray(weeks) ? weeks : []).flatMap((week) => (week?.days || []).flatMap((day) => day?.exercises || []));
}

function summarizeDirectSetsByMuscle(weeks) {
  return flattenPlanExercises(weeks).reduce((acc, ex) => {
    const directTargets = getExerciseDirectTargetKeys(ex);
    directTargets.forEach((muscle) => {
      acc[muscle] = Number(acc[muscle] || 0) + Number(ex?.sets || 0);
    });
    return acc;
  }, {});
}

function countDistinctCoreFamiliesFromPlan(weeks) {
  const families = new Set();
  for (const ex of flattenPlanExercises(weeks)) {
    const fam = slotExerciseFamily(ex);
    if (fam && fam.startsWith('core_')) families.add(fam);
  }
  return families.size;
}

function countDaysMatchingExercisePredicate(weeks, predicate) {
  const days = (weeks?.[0]?.days || []);
  return days.filter((day) => (day?.exercises || []).some((exercise) => predicate(exercise, day))).length;
}

function getPriorityGroupTargetKeys(group) {
  const mapped = priorityGroupToDirectTargets(group);
  if (mapped.length) return mapped;
  if (DIRECT_TARGET_KEYS.includes(String(group || ''))) return [String(group)];
  return [];
}

function getPriorityGroupDirectSetCount(directSets, group) {
  return getPriorityGroupTargetKeys(group).reduce((sum, key) => sum + Number(directSets?.[key] || 0), 0);
}

function getPriorityGroupFrequencyTarget(frequencyTargets, group) {
  return getPriorityGroupTargetKeys(group).reduce((max, key) => Math.max(max, Number(frequencyTargets?.[key] || 0)), 0);
}

function getPriorityGroupWeeklyTarget(targets, group) {
  return getPriorityGroupTargetKeys(group).reduce((sum, key) => sum + Number(targets?.[key] || 0), 0);
}

function buildCeilingQaReport(plan, user) {
  const exercises = flattenPlanExercises(plan?.weeks);
  const weekDays = plan?.weeks?.[0]?.days || [];
  const priorityGroups = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  const directSets = summarizeDirectSetsByMuscle(plan?.weeks);
  const weeklyTargets = plan?.meta?.weeklyTargets || {};
  const frequencyTargets = plan?.meta?.frequencyTargets || {};
  const scores = {
    priorityDominance: 10,
    overloadQuality: 10,
    stimulusToFatigue: 10,
    exerciseTaste: 10,
    constraintRespect: 10,
    identityClarity: 10,
    junkControl: 10
  };
  const notes = [];
  const chestPressCount = exercises.filter((exercise) => isChestPressPatternName(exercise?.name)).length;
  const unsupportedBackBuilders = exercises.filter((exercise) => String(exercise?.pullRole || '') === 'back_builder' && String(exercise?.supportType || '') === 'unsupported').length;
  const lowOverloadPriorityExercises = exercises.filter((exercise) => {
    const primary = String(exercise?.primary || exercise?.muscleTarget || '');
    return hasPriorityGroup(priorityGroups, primary) && String(exercise?.overloadFriendliness || '') === 'low';
  }).length;
  const highFatigueLowerExercises = exercises.filter((exercise) => {
    const primary = String(exercise?.primary || exercise?.muscleTarget || '');
    return ['Legs', 'Glutes'].includes(primary) && String(exercise?.fatigueClass || '') === 'high';
  }).length;
  const weakTasteCount = exercises.filter((exercise) => shouldUpgradeExerciseTaste(exercise, user, '')).length;
  const assembledLowerCount = exercises.filter((exercise) => isAssembledLowerAccessory(exercise)).length;
  const noteSensitiveCount = exercises.filter((exercise) => {
    if ((Number(user?.injuryMap?.shoulder || 0) >= 5) && Boolean(exercise?.shoulderOverhead)) return true;
    if ((Number(user?.injuryMap?.Wrist || 0) >= 5 || user?.injuryNoteFlags?.straightBarIntolerance || user?.injuryNoteFlags?.wristExtensionIntolerance)
      && (Boolean(exercise?.straightBar) || Boolean(exercise?.wristExtensionHeavy))) return true;
    if ((Number(user?.injuryMap?.knee || 0) >= 5 || user?.injuryNoteFlags?.deepKneeFlexionIntolerance || user?.injuryNoteFlags?.forwardKneeTravelIntolerance)
      && Boolean(exercise?.forwardKneeTravelHigh)) return true;
    return false;
  }).length;
  const duplicateShoulderPressDays = weekDays.filter((day) => {
    const pressCount = (day?.exercises || []).filter((exercise) => Boolean(exercise?.shoulderPressPattern)).length;
    return pressCount > 1;
  }).length;
  const duplicateChestPressDays = weekDays.filter((day) => {
    const pressCount = (day?.exercises || []).filter((exercise) => isChestPressPatternName(exercise?.name)).length;
    return pressCount > 2;
  }).length;
  const constrainedEquipment = Boolean(user?.profile?.minimalEquipmentAccessoryMode || user?.profile?.bodyweightDominant);
  const backPriority = hasPriorityGroup(priorityGroups, 'Back');
  const directPriorityDays = {};
  priorityGroups.forEach((priority) => {
    directPriorityDays[priority] = countDaysMatchingExercisePredicate(plan?.weeks, (exercise) => exerciseDirectlyServesPriority(exercise, priority, user));
  });

  for (const priority of priorityGroups) {
    const directSetsForPriority = getPriorityGroupDirectSetCount(directSets, priority);
    const exposureDays = Number(directPriorityDays[priority] || 0);
    const targetSetsForPriority = getPriorityGroupWeeklyTarget(weeklyTargets, priority);
    const targetFrequencyForPriority = getPriorityGroupFrequencyTarget(frequencyTargets, priority);
    if (priorityGroupsOverlap(priority, 'Abs')) {
      const targetFamilies = hasPriorityGroup(priorityGroups, 'Calves') || Number(user?.daysPerWeek || 0) >= 4 ? 2 : 1;
      const familyCount = countDistinctCoreFamiliesFromPlan(plan?.weeks);
      if (familyCount < targetFamilies) {
        scores.priorityDominance -= 1.5;
        scores.identityClarity -= 1.0;
        notes.push('Core emphasis is present but still not varied enough to dominate the week.');
      }
      if (exposureDays < Math.max(1, targetFrequencyForPriority)) {
        scores.priorityDominance -= 1.0;
        notes.push('Core is not showing up often enough to clearly dominate the week.');
      }
      continue;
    }
    if (priorityGroupsOverlap(priority, 'Calves')) {
      const targetDays = Math.max(1, targetFrequencyForPriority);
      if (exposureDays < targetDays) {
        scores.priorityDominance -= 1.0;
        notes.push('Calf work is present, but not frequent enough to feel like a true specialization focus.');
      }
      continue;
    }
    if (priorityGroupsOverlap(priority, 'Hamstrings/Glutes')) {
      const glutePrimaryCount = exercises.filter((exercise) => isRealPosteriorChainBuilder(exercise, user)).length;
      if (glutePrimaryCount < Math.max(2, Number(user?.daysPerWeek || 0) >= 4 ? 3 : 2)) {
        scores.priorityDominance -= 1.5;
        scores.identityClarity -= 1.0;
        notes.push('Glute priority still leans too much on general lower work instead of glute-primary builders.');
      }
      continue;
    }
    if (targetSetsForPriority > 0 && directSetsForPriority < Math.max(6, Math.floor(targetSetsForPriority * 0.75))) {
      scores.priorityDominance -= 1.0;
      notes.push(`${priority} does not get enough direct high-value work to fully dominate the week.`);
    }
    if (targetFrequencyForPriority > 0 && exposureDays < targetFrequencyForPriority) {
      scores.identityClarity -= 1.0;
      notes.push(`${priority} is present, but not repeated clearly enough across the week.`);
    }
  }

  if (isNarrowBackArmsUser(user) && chestPressCount > 1) {
    scores.priorityDominance -= 2.0;
    scores.junkControl -= 1.0;
    notes.push('Back + Arms still carries chest pressing that dilutes the stated goal.');
  }
  if (isNarrowShouldersArmsUser(user) && chestPressCount > 1) {
    scores.priorityDominance -= 2.0;
    scores.identityClarity -= 1.0;
    notes.push('Shoulders + Arms still carries chest pressing that a physique coach would trim down.');
  }
  if (isNarrowCoreCalvesUser(user) && chestPressCount > 0) {
    scores.priorityDominance -= 1.5;
    scores.identityClarity -= 1.0;
    notes.push('Core + Calves still shows generic pressing that takes identity away from the specialization goal.');
  }

  if (unsupportedBackBuilders > 0 && backPriority && !constrainedEquipment) {
    scores.overloadQuality -= Math.min(2, unsupportedBackBuilders * 0.7);
    scores.exerciseTaste -= Math.min(2, unsupportedBackBuilders * 0.7);
    notes.push('A stronger coach would prefer more supported, overload-friendly back work.');
  }
  if (lowOverloadPriorityExercises > 0 && !constrainedEquipment) {
    scores.overloadQuality -= Math.min(1.5, lowOverloadPriorityExercises * 0.5);
    notes.push('Some priority work is still built around lower-quality overload choices.');
  }
  if (highFatigueLowerExercises > Math.max(2, Number(user?.daysPerWeek || 0) <= 4 ? 2 : 3)) {
    scores.stimulusToFatigue -= 1.5;
    notes.push('Lower-body fatigue is still stacked harder than needed for the likely growth return.');
  }
  if (duplicateShoulderPressDays > 0 || duplicateChestPressDays > 0) {
    scores.stimulusToFatigue -= 1.0;
    notes.push('Pressing redundancy is still costing recovery without adding enough new stimulus.');
  }
  if (weakTasteCount > 0) {
    scores.exerciseTaste -= Math.min(2.5, weakTasteCount * 0.7);
    notes.push('A few exercise selections are valid, but still not fully coach-clean.');
  }
  if (noteSensitiveCount > 0) {
    scores.constraintRespect -= Math.min(3, noteSensitiveCount);
    notes.push('Some choices still respect constraints more literally than intelligently.');
  }
  if (assembledLowerCount > 1) {
    scores.junkControl -= Math.min(2, (assembledLowerCount - 1) * 0.6);
    scores.exerciseTaste -= Math.min(1.5, (assembledLowerCount - 1) * 0.5);
    notes.push('There is still some lower-body filler that a sharper hypertrophy coach would consolidate.');
  }

  Object.keys(scores).forEach((key) => {
    scores[key] = Math.max(1, Math.round(scores[key] * 10) / 10);
  });
  const average = Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length;
  const score = Math.round(average * 10) / 10;
  let tier = 'elite';
  if (score < 6.5) tier = 'compromised';
  else if (score < 7.5) tier = 'decent';
  else if (score < 8.5) tier = 'good';
  else if (score < 9.5) tier = 'very_strong';
  return {
    tier,
    score,
    scores,
    notes: [...new Set(notes)]
  };
}

function buildEliteQaReport(plan, user) {
  const exercises = flattenPlanExercises(plan?.weeks);
  const days = (plan?.weeks?.[0]?.days || []).length;
  const directSets = summarizeDirectSetsByMuscle(plan?.weeks);
  const priorityGroups = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  const weeklyTargets = plan?.meta?.weeklyTargets || {};
  const frequencyTargets = plan?.meta?.frequencyTargets || {};
  const notes = [];
  const scores = {
    validity: 10,
    safety: 10,
    emphasis: 10,
    hypertrophy: 10,
    progression: 10,
    recovery: 10,
    exerciseTaste: 10,
    adaptability: 10
  };
  const weakTasteCount = exercises.filter((ex) => {
    const name = normalizeName(ex?.name);
    return /\bjm press\b|\bmachine shoulder \(military\) press\b|\bincline barbell triceps extension\b|\bside laterals? to front raise\b/.test(name) || /^row$/.test(name);
  }).length;
  const hasCoachObjection = exercises.some((ex) => {
    if ((Number(user?.injuryMap?.shoulder || 0) >= 5 || user?.injuryNoteFlags?.avoidOverheadVolume) && Boolean(ex?.shoulderOverhead)) return true;
    if ((Number(user?.injuryMap?.wrist || 0) >= 5 || user?.injuryNoteFlags?.avoidStraightBar || user?.injuryNoteFlags?.avoidWristExtension) && (Boolean(ex?.straightBar) || Boolean(ex?.wristExtensionHeavy))) return true;
    return false;
  });
  if (days !== Number(user?.daysPerWeek || 0)) {
    scores.validity = 2;
    notes.push('Day count does not match requested frequency.');
  }
  if (exercises.some((ex) => !isExerciseCompatibleWithEquipment(ex, user))) {
    scores.validity = 0;
    notes.push('Equipment compatibility failed final elite QA.');
  }
  if (exercises.some((ex) => evaluateJoint(ex, user).reject)) {
    scores.safety = 0;
    notes.push('Injury compatibility failed final elite QA.');
  }
  if (weakTasteCount) {
    scores.exerciseTaste = Math.max(3, 10 - (weakTasteCount * 2));
    notes.push('Some exercise choices still look second-tier instead of coach-level.');
  }
  if (hasCoachObjection) {
    scores.safety = Math.min(scores.safety, 6);
    scores.exerciseTaste = Math.min(scores.exerciseTaste, 6);
    notes.push('A coach would likely object to at least one note-sensitive exercise choice.');
  }
  if ((user?.profile?.sessionBandwidth === 'tight') && (plan?.weeks?.[0]?.days || []).some((day) => (day?.exercises || []).length > 4)) {
    scores.hypertrophy = Math.max(5, scores.hypertrophy - 2);
    notes.push('A tight-session day still carries too much density.');
  }
  for (const group of priorityGroups) {
    if (priorityGroupsOverlap(group, 'Calves')) {
      const calfDays = (plan?.weeks?.[0]?.days || []).filter((day) => (day?.exercises || []).some((ex) => Boolean(ex?.directCalf))).length;
      const calfTargetDays = Math.max(1, getPriorityGroupFrequencyTarget(frequencyTargets, group));
      if (calfDays < calfTargetDays) {
        scores.emphasis -= 4;
        notes.push('Calf emphasis is not visible enough.');
      }
    } else if (priorityGroupsOverlap(group, 'Abs')) {
      const coreVarietyTarget = Number(user?.daysPerWeek || 0) >= 4 ? 2 : (hasPriorityGroup(priorityGroups, 'Calves') ? 2 : 1);
      if (countDistinctCoreFamiliesFromPlan(plan?.weeks) < coreVarietyTarget) {
        scores.emphasis -= 3;
        notes.push('Ab emphasis lacks enough direct core variety.');
      }
    } else if (getPriorityGroupWeeklyTarget(weeklyTargets, group) > 0 && getPriorityGroupDirectSetCount(directSets, group) < Math.max(6, Math.floor(getPriorityGroupWeeklyTarget(weeklyTargets, group) * 0.75))) {
      scores.emphasis -= 3;
      notes.push(`${group} emphasis is not getting enough direct work.`);
    }
  }
  if (hasPriorityGroup(priorityGroups, 'Shoulders')) {
    const shoulderDays = (plan?.weeks?.[0]?.days || []).filter((day) => (day?.exercises || []).some((ex) => {
      return String(ex?.primary || ex?.muscleTarget || '') === 'Shoulders' || Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern) || Boolean(ex?.shoulderPressPattern);
    })).length;
    const hasPress = exercises.some((ex) => Boolean(ex?.shoulderPressPattern));
    const hasLateralRear = exercises.some((ex) => Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern));
    const lateralRearCount = exercises.filter((ex) => Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern)).length;
    const shoulderPressCount = exercises.filter((ex) => Boolean(ex?.shoulderPressPattern)).length;
    if (Number(user?.daysPerWeek || 0) >= 4 && shoulderDays < 2) {
      scores.emphasis -= 4;
      notes.push('Shoulder emphasis is not clearly repeated across the week.');
    }
    if (!hasPress || !hasLateralRear) {
      scores.emphasis -= 3;
      notes.push('Shoulder emphasis is missing either a press pattern or clear lateral/rear delt work.');
    }
    if (lateralRearCount < 2 || shoulderPressCount > lateralRearCount + 1) {
      scores.emphasis -= 3;
      notes.push('Shoulder emphasis still leans too much on pressing instead of lateral/rear delt identity.');
    }
  }
  if (hasPriorityGroup(priorityGroups, 'Arms')) {
    const hasBiceps = exercises.some((ex) => String(ex?.directArmType || '') === 'biceps');
    const hasTriceps = exercises.some((ex) => String(ex?.directArmType || '') === 'triceps');
    const armDays = (plan?.weeks?.[0]?.days || []).filter((day) => (day?.exercises || []).some((ex) => {
      return ['biceps', 'triceps'].includes(String(ex?.directArmType || ''));
    })).length;
    const bicepsSets = exercises.reduce((sum, ex) => sum + (String(ex?.directArmType || '') === 'biceps' ? Number(ex?.sets || 0) : 0), 0);
    const tricepsSets = exercises.reduce((sum, ex) => sum + (String(ex?.directArmType || '') === 'triceps' ? Number(ex?.sets || 0) : 0), 0);
    const tricepsFamilies = new Set(exercises
      .filter((ex) => String(ex?.directArmType || '') === 'triceps')
      .map((ex) => tricepsMovementFamily(ex?.name))
      .filter((family) => family !== 'none'));
    if (!hasBiceps || !hasTriceps) {
      scores.emphasis -= 4;
      notes.push('Arm emphasis is missing either direct biceps work or direct triceps work.');
    }
    if (armDays < Math.max(Number(frequencyTargets?.Biceps || 0), Number(frequencyTargets?.Triceps || 0), 2)) {
      scores.emphasis -= 3;
      notes.push('Arm emphasis is not clearly repeated across the week.');
    }
    if (tricepsSets < bicepsSets) {
      scores.emphasis -= 4;
      notes.push('Arm emphasis still over-allocates biceps compared with direct triceps volume.');
    }
    if (!tricepsFamilies.has('press') || !tricepsFamilies.has('overhead') || !tricepsFamilies.has('pushdown')) {
      scores.emphasis -= 3;
      notes.push('Arm emphasis is missing one of the needed triceps families: press, overhead extension, or pushdown.');
    }
  }
  if (!Array.isArray(plan?.meta?.progressionModel?.overloadPriority) || !plan?.meta?.progressionModel?.overloadPriority?.length) {
    scores.progression = 4;
    notes.push('Progression model is incomplete.');
  }
  if (!Array.isArray(plan?.meta?.recoveryModel?.deloadTriggers) || !plan?.meta?.recoveryModel?.deloadTriggers?.length) {
    scores.recovery = 4;
    notes.push('Recovery model is incomplete.');
  }
  if (!Array.isArray(plan?.meta?.adaptiveCheckInModel?.trackedSignals) || !plan?.meta?.adaptiveCheckInModel?.trackedSignals?.length) {
    scores.adaptability = 4;
    notes.push('Adaptive check-in model is incomplete.');
  }
  const average = Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length;
  const minScore = Math.min(...Object.values(scores));
  let tier = 'elite';
  if (scores.validity <= 2 || scores.safety <= 2) tier = 'fail';
  else if (average < 6.5 || minScore <= 4) tier = 'questionable';
  else if (average < 9 || minScore < 8 || notes.length) tier = 'good';
  return {
    tier,
    score: Math.round(average * 10) / 10,
    scores,
    notes
  };
}

function buildShoulderPriorityWeeklyRepairSnapshot(weeks, user) {
  const safeWeeks = Array.isArray(weeks) ? weeks : [];
  const normalizedPriorityGroups = Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [];
  const shoulderExposureDays = [];
  let shoulderPressDayCount = 0;
  let lateralDeltSlots = 0;
  let rearDeltSlots = 0;
  safeWeeks.forEach((week, weekIndex) => {
    (Array.isArray(week?.days) ? week.days : []).forEach((day, dayIndex) => {
      const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
      const shoulderExercises = exercises.filter((exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        return Boolean(
          truth?.shoulderPressPattern
          || truth?.lateralDeltPattern
          || truth?.rearDeltPattern
          || String(exercise?.primary || exercise?.muscleTarget || '') === 'Shoulders'
        );
      });
      if (!shoulderExercises.length) return;
      const hasShoulderPress = shoulderExercises.some((exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        return Boolean(truth?.shoulderPressPattern);
      });
      if (hasShoulderPress) shoulderPressDayCount += 1;
      shoulderExercises.forEach((exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        if (truth?.lateralDeltPattern) lateralDeltSlots += 1;
        if (truth?.rearDeltPattern) rearDeltSlots += 1;
      });
      shoulderExposureDays.push({
        weekIndex: Number(week?.weekIndex ?? weekIndex),
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null,
        shoulderPressDay: hasShoulderPress,
        shoulderExerciseNames: shoulderExercises.map((exercise) => String(exercise?.name || '').trim()).filter(Boolean)
      });
    });
  });
  return {
    shoulder_priority_selected: hasPriorityGroup(normalizedPriorityGroups, 'Shoulders'),
    priorityGroups: normalizedPriorityGroups,
    shoulderExposureDayCount: shoulderExposureDays.length,
    shoulderPressDayCount,
    lateralDeltSlots,
    rearDeltSlots,
    shoulderExposureDays
  };
}

function applyWeeklyShoulderPriorityRepairGuard(weeks, user) {
  const snapshot = buildShoulderPriorityWeeklyRepairSnapshot(weeks, user);
  try {
    console.info('[training-debug][shoulder-priority][builder] shoulder_priority_weekly_check', snapshot);
  } catch {
    // ignore logging failures
  }
  if (!snapshot.shoulder_priority_selected) {
    try {
      console.info('[training-debug][shoulder-priority][builder] shoulder_priority_weekly_repair_skip', {
        shoulder_priority_selected: false,
        priorityGroups: snapshot.priorityGroups,
        shoulderExposureDayCount: snapshot.shoulderExposureDayCount,
        shoulderPressDayCount: snapshot.shoulderPressDayCount,
        lateralDeltSlots: snapshot.lateralDeltSlots,
        rearDeltSlots: snapshot.rearDeltSlots,
        reason: 'shoulders_not_selected'
      });
    } catch {
      // ignore logging failures
    }
    return weeks;
  }
  return weeks;
}

/* Rep-ladder normalization: the block is 4 identical weeks - week 1's
   days, exercises, order, and sets are cloned into every later week,
   with only the rep target climbing by 1 per week from the bottom of
   each exercise's range. Runs at final assembly so no repair or quality
   pass can reintroduce week-to-week drift (different exercises, set
   counts, or deload trims between weeks). Non-numeric prescriptions
   (timed holds etc.) keep their wording on every week. */
function normalizeRepLadderWeeks(weeks) {
  const list = Array.isArray(weeks) ? weeks : [];
  if (!list.length) return list;
  const ladderEx = (ex, offset) => {
    const repsText = String(ex?.reps || '').trim();
    if (!/^\d+(\s*-\s*\d+)?$/.test(repsText)) return { ...ex };
    const start = Number(ex?.repLadder?.start) || parseRepRangeText(repsText).min;
    return {
      ...ex,
      reps: String(start + offset),
      repLadder: {
        start,
        weekTarget: start + offset,
        cycleWeeks: REP_LADDER_CYCLE_WEEKS,
        loadStepLb: REP_LADDER_LOAD_STEP_LB
      }
    };
  };
  const baseWeek = list[0];
  return list.map((week, index) => ({
    ...week,
    weekType: 'base',
    days: (baseWeek?.days || []).map((day) => ({
      ...day,
      exercises: (day?.exercises || []).map((ex) => ladderEx(ex, index % REP_LADDER_CYCLE_WEEKS))
    }))
  }));
}

function materializePlanResult(user, schedule, safeWeeks, safeResult, targets, frequencyTargets, notes = []) {
  return withPlannerTiming(user, 'finalRenderingOutputMs', () => {
    const ladderWeeks = normalizeRepLadderWeeks(safeWeeks);
    const progressionProjection = buildBodybuildingProgressionProjection(user, ladderWeeks);
    const adaptiveProjectionState = createAdaptiveProjectionState(user, progressionProjection);
    const weeksWithProjection = applyProjectionToWeeks(ladderWeeks, progressionProjection);
    const projectionMeta = {
      ...progressionProjection,
      adaptiveProjectionState
    };
    delete projectionMeta.projectionByExerciseWeek;
    const outputWeeks = weeksWithProjection.map((week) => {
      const { __backToBackCleanupTouchedFinalPlan, ...weekRest } = week || {};
      return {
      ...weekRest,
      days: (week.days || []).map((day) => ({
        dayType: day.dayType,
        exercises: (day.exercises || []).map(({ muscleTarget, slotId, optional, requiredEquipment, isCalisthenicsLike, nameLower, canonicalTruth, ...rest }) => ({
          ...rest,
          requiredEquipment: Array.isArray(rest?.requiredEquipment) ? rest.requiredEquipment : requiredEquipment,
          primaryMuscle: rest?.primaryMuscle || canonicalTruth?.primaryMuscle || rest?.primary,
          subMuscle: rest?.subMuscle || canonicalTruth?.subMuscle || rest?.sub
        }))
      }))
    };
    });
    const flattenedExercises = flattenPlanExercises(outputWeeks);
    const forcedCompromises = [];
    if (user?.injuryNoteFlags?.avoidStraightBar || user?.injuryNoteFlags?.avoidWristExtension) {
      flattenedExercises.forEach((ex) => {
        if (ex?.straightBar || ex?.wristExtensionHeavy) forcedCompromises.push(ex.displayName || ex.name);
      });
    }
    const priorityTrace = ensurePriorityDebugTrace(user);
    if (priorityTrace?.calf) {
      priorityTrace.calf.finalExercises = flattenedExercises.filter((ex) => ex?.directCalf).map((ex) => ({
        canonicalExerciseId: ex.canonicalExerciseId,
        displayName: ex.displayName || ex.name
      }));
    }
    if (priorityTrace?.abs) {
      priorityTrace.abs.finalExercises = flattenedExercises.filter((ex) => ex?.directAb).map((ex) => ({
        canonicalExerciseId: ex.canonicalExerciseId,
        displayName: ex.displayName || ex.name
      }));
    }
    if (priorityTrace?.calf && !priorityTrace.calf.finalExercises.length) priorityTrace.calf.removedAtStep = priorityTrace.calf.trimmed.at(-1)?.stage || 'not-selected';
    if (priorityTrace?.abs && !priorityTrace.abs.finalExercises.length) priorityTrace.abs.removedAtStep = priorityTrace.abs.trimmed.at(-1)?.stage || 'not-selected';
    const plan = {
      meta: {
        version: '2.0',
        plannerStages: {
          safeBasePlanner: false,
          qualityUpgradePass: false,
          adaptiveCoachingLayer: false,
          eliteGradingLayer: false
        },
        discipline: user.discipline,
        phase: user.phase,
        blockLength: user.timeline === '4 weeks' ? 4 : 8,
        daysPerWeek: user.daysPerWeek,
        sessionCap: user.sessionCap,
        allowedEquipment: user.allowedEquipment,
        preferredDays: Array.isArray(user.preferredDays) ? user.preferredDays.slice() : [],
        schedule: {
          preferredDays: Array.isArray(user.preferredDays) ? user.preferredDays.slice() : []
        },
        priorityGroups: user.priorityGroups || [],
        weeklyTargets: targets,
        frequencyTargets,
        profile: user.profile,
        // §0.1 — what the layoff did to each anchor, and why. This is on the
        // plan rather than in a log because the user has to be told: a lifter
        // who reported a 600 deadlift and is handed 250 deserves the reason,
        // or they will simply load the bar to 600.
        layoff: anchorInputsForUser(user).layoff,
        nutritionModel: buildNutritionModel(user),
        progressionModel: buildProgressionModel(user, targets, frequencyTargets),
        recoveryModel: buildRecoveryModel(user),
        autoreg: {
          deloadWeeks: Array.isArray(progressionProjection?.deloadWeeks) ? progressionProjection.deloadWeeks.slice() : [],
          projectionModelStatus: progressionProjection?.modeledAs || 'on_track',
          adaptiveProjectionState,
          familyAdjustments: progressionProjection?.familyAdjustments || {}
        },
        progressionProjection: projectionMeta,
        adaptiveCheckInModel: {
          reviewEveryDays: 14,
          escalationWindowDays: 28,
          trackedSignals: [
            'performance',
            'bodyweightTrend',
            'adherence',
            'sessionCompletion',
            'fatigue',
            'jointIrritation',
            'priorityMuscleResponse',
            'photosMeasurements'
          ]
        },
        notes: [
          ...(safeResult?.filteredCount ? [`Filtered ${safeResult.filteredCount} banned exercise option(s).`] : []),
          ...notes,
          ...(forcedCompromises.length ? [`Forced compromise on note-sensitive exercise selection: ${forcedCompromises.join(', ')}.`] : [])
        ],
        debug: priorityTrace ? { lowFrequencyPriorityTrace: priorityTrace } : undefined
      },
      schedule: schedule.map((s) => ({ day: s.day, dayType: s.dayType })),
      weeks: outputWeeks
    };
    const runtimeProfile = snapshotPlannerRuntime(user);
    if (runtimeProfile) plan.meta.runtimeProfile = runtimeProfile;
    plan.meta.eliteQa = buildEliteQaReport(plan, user);
    plan.meta.ceilingQa = buildCeilingQaReport(plan, user);
    if (shouldTrackAbsGlutesLegsComboDebug(user)) {
      (outputWeeks || []).forEach((week, weekIndex) => {
        logAbsGlutesLegsComboDebug(user, 'final_returned_week_snapshot', buildBackToBackCleanupWeekSnapshot(week, user, {
          touched: Boolean(weeksWithProjection?.[weekIndex]?.__backToBackCleanupTouchedFinalPlan),
          schedule
        }));
      });
    }
    if (hasPriorityGroup(user, 'Shoulders')) {
      (weeksWithProjection || []).forEach((week) => {
        (week?.days || []).forEach((day, dayIndex) => {
          const exerciseList = Array.isArray(day?.exercises) ? day.exercises : [];
          const hasShoulderPress = exerciseList.some((exercise) => {
            const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
            return Boolean(truth?.shoulderPressPattern);
          });
          if (!hasShoulderPress) return;
          try {
            console.info('[training-debug][shoulder-priority][builder] final_returned_day_snapshot', buildShoulderPressCleanupDaySnapshot(day, user, {
              fallbackDay: schedule?.[dayIndex]?.day || ''
            }));
          } catch {
            // ignore logging failures
          }
        });
      });
    }
    return plan;
  });
}

function buildFinalConstrainedRebuild(user, exercises, targets, frequencyTargets, reason = '') {
  const runtime = user?._plannerRuntime || null;
  if (runtime) {
    runtime.state.constrainedRebuildAttempts += 1;
    recordPlannerCount(user, 'constrainedRebuildAttempts');
    if (runtime.state.constrainedRebuildAttempts > MAX_CONSTRAINED_REBUILD_ATTEMPTS) {
      return {
        error: 'PLAN_RUNTIME_GUARD',
        field: 'constrainedRebuild',
        reason: `Exceeded constrained rebuild cap (${MAX_CONSTRAINED_REBUILD_ATTEMPTS}).`
      };
    }
  }
  return withPlannerTiming(user, 'constrainedRebuildMs', () => {
    const schedule = buildConstrainedSchedule(user);
    const weeksResult = buildWeeks(user.timeline === '4 weeks' ? 4 : 8, schedule, user, exercises, targets, { constrainedRebuild: true });
    if (weeksResult.error) return weeksResult;
    const safeResult = repairAndValidatePlan(weeksResult.weeks, user, exercises);
    emitPlannerDiagnosticHeartbeat(user, 'after_generator_final_return', {
      functionName: 'buildFinalConstrainedRebuild',
      fileName: 'generator/trainingEngine.oblueprint.js',
      elapsedMs: plannerNowMs(),
      requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
      requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
      selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
      planExists: Boolean(safeResult && !safeResult.error),
      weeksLength: Array.isArray(safeResult?.weeks) ? safeResult.weeks.length : undefined,
      callBoundary: 'buildFinalConstrainedRebuild_after_repairAndValidatePlan'
    });
    if (safeResult.error) return safeResult;
    emitPlannerDiagnosticHeartbeat(user, 'before_reinforce_low_frequency_priority_accessories', buildCleanupChainHeartbeatMeta(
      user,
      safeResult.weeks,
      'buildFinalConstrainedRebuild_before_reinforce_low_frequency_priority_accessories',
      'buildFinalConstrainedRebuild'
    ));
    const polishedWeeks = (safeResult.weeks || []).map((week) => ({
      ...week,
      days: (week?.days || []).map((day) => applyFinalNarrowPriorityDayPolish(day, user, exercises, String(week?.weekType || 'base'), {
        weekIndex: week?.weekIndex
      }))
    }));
    const reinforcedWeeks = reinforceLowFrequencyPriorityAccessories(polishedWeeks, user, exercises);
    emitPlannerDiagnosticHeartbeat(user, 'after_reinforce_low_frequency_priority_accessories', buildCleanupChainHeartbeatMeta(
      user,
      reinforcedWeeks,
      'buildFinalConstrainedRebuild_after_reinforce_low_frequency_priority_accessories',
      'buildFinalConstrainedRebuild'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_cleanup_excess_core_volume', buildCleanupChainHeartbeatMeta(
      user,
      reinforcedWeeks,
      'buildFinalConstrainedRebuild_before_cleanup_excess_core_volume',
      'buildFinalConstrainedRebuild'
    ));
    const coreCleanupInputWeeks = reinforcedWeeks;
    emitPlannerDiagnosticHeartbeat(user, 'before_core_cleanup_direct_call', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        coreCleanupInputWeeks,
        'buildFinalConstrainedRebuild_before_core_cleanup_direct_call',
        'buildFinalConstrainedRebuild'
      ),
      cleanupFunctionType: typeof cleanupExcessCoreVolumeInSuccessfulPlan,
      cleanupFunctionName: String(cleanupExcessCoreVolumeInSuccessfulPlan?.name || '')
    });
    const coreCleanedWeeks = cleanupExcessCoreVolumeInSuccessfulPlan(coreCleanupInputWeeks, user, exercises);
    emitPlannerDiagnosticHeartbeat(user, 'after_core_cleanup_direct_call', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        coreCleanedWeeks,
        'buildFinalConstrainedRebuild_after_core_cleanup_direct_call',
        'buildFinalConstrainedRebuild'
      ),
      cleanupFunctionType: typeof cleanupExcessCoreVolumeInSuccessfulPlan,
      cleanupFunctionName: String(cleanupExcessCoreVolumeInSuccessfulPlan?.name || '')
    });
    emitPlannerDiagnosticHeartbeat(user, 'after_cleanup_excess_core_volume', buildCleanupChainHeartbeatMeta(
      user,
      coreCleanedWeeks,
      'buildFinalConstrainedRebuild_after_cleanup_excess_core_volume',
      'buildFinalConstrainedRebuild'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_cleanup_back_to_back_lower_redundancy', buildCleanupChainHeartbeatMeta(
      user,
      coreCleanedWeeks,
      'buildFinalConstrainedRebuild_before_cleanup_back_to_back_lower_redundancy',
      'buildFinalConstrainedRebuild'
    ));
    const finalWeeks = cleanupBackToBackLowerDayRedundancyInSuccessfulPlan(
      coreCleanedWeeks,
      user,
      exercises
    );
    emitPlannerDiagnosticHeartbeat(user, 'after_cleanup_back_to_back_lower_redundancy', buildCleanupChainHeartbeatMeta(
      user,
      finalWeeks,
      'buildFinalConstrainedRebuild_after_cleanup_back_to_back_lower_redundancy',
      'buildFinalConstrainedRebuild'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_final_weeks_assignment', buildCleanupChainHeartbeatMeta(
      user,
      finalWeeks,
      'buildFinalConstrainedRebuild_before_final_weeks_assignment',
      'buildFinalConstrainedRebuild'
    ));
    const guardedFinalWeeks = applyWeeklyShoulderPriorityRepairGuard(finalWeeks, user);
    emitPlannerDiagnosticHeartbeat(user, 'after_final_weeks_assignment', buildCleanupChainHeartbeatMeta(
      user,
      guardedFinalWeeks,
      'buildFinalConstrainedRebuild_after_final_weeks_assignment',
      'buildFinalConstrainedRebuild'
    ));
    if (shouldTrackCalvesComboDiagnostics(user)) {
      emitPlannerDiagnosticHeartbeat(user, 'constrained rebuild completed', {
        calfExposureByWeek: buildCalvesExposureSnapshot(guardedFinalWeeks, user)
      });
    }
    emitPlannerDiagnosticHeartbeat(user, 'before_return_successful_plan', buildCleanupChainHeartbeatMeta(
      user,
      guardedFinalWeeks,
      'buildFinalConstrainedRebuild_before_return_successful_plan',
      'buildFinalConstrainedRebuild'
    ));
    return extractInternalPlanState(
      schedule,
      guardedFinalWeeks,
      { ...safeResult, weeks: guardedFinalWeeks },
      [reason || 'Used final constrained rebuild mode to preserve validity and constraints.'],
      {
        constrainedRebuild: true,
        constrainedRebuildAttempts: runtime?.state?.constrainedRebuildAttempts || 0
      }
    );
  });
}

function buildSafeBasePlanner(user, exercises, targets, frequencyTargets) {
  return withPlannerTiming(user, 'safeBasePlannerMs', () => {
    logComboStageEnter(user, 'split selection');
    let schedule = withPlannerTiming(user, 'splitSelectionMs', () => buildSplit(user, user.daysPerWeek >= 5 && user.sessionLengthMin === '30'));
    if (user?._plannerRuntime?.state) {
      user._plannerRuntime.state.selectedSplit = Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : [];
    }
    if (shouldTrackCalvesComboDiagnostics(user)) {
      emitPlannerDiagnosticHeartbeat(user, 'split selected', {
        selectedSplit: Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : []
      });
    }
    logAbsGlutesLegsComboDebug(user, 'selected-split', {
      stage: 'split selection',
      selectedSplit: Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : []
    });
    logComboStageExit(user, 'split selection', {
      selectedSplit: Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : []
    });
    let weeksResult = buildWeeks(user.timeline === '4 weeks' ? 4 : 8, schedule, user, exercises, targets);
    if (weeksResult.error && user.daysPerWeek >= 5 && user.sessionLengthMin === '30') {
      logComboStageEnter(user, 'split selection', { fallbackUpperLower: true });
      schedule = withPlannerTiming(user, 'splitSelectionMs', () => buildSplit(user, true));
      if (user?._plannerRuntime?.state) {
        user._plannerRuntime.state.selectedSplit = Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : [];
      }
      if (shouldTrackCalvesComboDiagnostics(user)) {
        emitPlannerDiagnosticHeartbeat(user, 'split selected', {
          selectedSplit: Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : []
        });
      }
      logAbsGlutesLegsComboDebug(user, 'selected-split', {
        stage: 'split selection',
        selectedSplit: Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : [],
        fallbackUpperLower: true
      });
      logComboStageExit(user, 'split selection', {
        selectedSplit: Array.isArray(schedule) ? schedule.map((entry) => ({ day: entry.day, dayType: entry.dayType })) : [],
        fallbackUpperLower: true
      });
      weeksResult = buildWeeks(user.timeline === '4 weeks' ? 4 : 8, schedule, user, exercises, targets);
    }
    if (weeksResult.error) {
      const rebuilt = buildFinalConstrainedRebuild(user, exercises, targets, frequencyTargets, 'Used final constrained rebuild mode after main build exhaustion.');
      if (!rebuilt.error) return rebuilt;
      return attachAbsGlutesLegsDebugMeta(weeksResult, user, {
        stage: 'blueprint construction',
        failedStage: weeksResult?.failedStage || weeksResult?.stage || 'blueprint construction'
      });
    }
    const safeResult = repairAndValidatePlan(weeksResult.weeks, user, exercises);
    emitPlannerDiagnosticHeartbeat(user, 'after_generator_final_return', {
      functionName: 'buildSafeBasePlanner',
      fileName: 'generator/trainingEngine.oblueprint.js',
      elapsedMs: plannerNowMs(),
      requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
      requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
      selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
      planExists: Boolean(safeResult && !safeResult.error),
      weeksLength: Array.isArray(safeResult?.weeks) ? safeResult.weeks.length : undefined,
      callBoundary: 'buildSafeBasePlanner_after_repairAndValidatePlan'
    });
    if (safeResult.error) {
      const rebuilt = buildFinalConstrainedRebuild(user, exercises, targets, frequencyTargets, 'Used final constrained rebuild mode after sanitize/repair exhaustion.');
      if (!rebuilt.error) return rebuilt;
      return attachAbsGlutesLegsDebugMeta(safeResult, user, {
        stage: 'final validation',
        failedStage: safeResult?.failedStage || safeResult?.stage || 'final validation'
      });
    }
    emitPlannerDiagnosticHeartbeat(user, 'before_reinforce_low_frequency_priority_accessories', buildCleanupChainHeartbeatMeta(
      user,
      safeResult.weeks,
      'buildSafeBasePlanner_before_reinforce_low_frequency_priority_accessories',
      'buildSafeBasePlanner'
    ));
    const reinforcedWeeks = reinforceLowFrequencyPriorityAccessories(safeResult.weeks, user, exercises);
    emitPlannerDiagnosticHeartbeat(user, 'after_reinforce_low_frequency_priority_accessories', buildCleanupChainHeartbeatMeta(
      user,
      reinforcedWeeks,
      'buildSafeBasePlanner_after_reinforce_low_frequency_priority_accessories',
      'buildSafeBasePlanner'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_cleanup_excess_core_volume', buildCleanupChainHeartbeatMeta(
      user,
      reinforcedWeeks,
      'buildSafeBasePlanner_before_cleanup_excess_core_volume',
      'buildSafeBasePlanner'
    ));
    const coreCleanupInputWeeks = reinforcedWeeks;
    emitPlannerDiagnosticHeartbeat(user, 'before_core_cleanup_direct_call', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        coreCleanupInputWeeks,
        'buildSafeBasePlanner_before_core_cleanup_direct_call',
        'buildSafeBasePlanner'
      ),
      cleanupFunctionType: typeof cleanupExcessCoreVolumeInSuccessfulPlan,
      cleanupFunctionName: String(cleanupExcessCoreVolumeInSuccessfulPlan?.name || '')
    });
    const coreCleanedWeeks = cleanupExcessCoreVolumeInSuccessfulPlan(coreCleanupInputWeeks, user, exercises);
    emitPlannerDiagnosticHeartbeat(user, 'after_core_cleanup_direct_call', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        coreCleanedWeeks,
        'buildSafeBasePlanner_after_core_cleanup_direct_call',
        'buildSafeBasePlanner'
      ),
      cleanupFunctionType: typeof cleanupExcessCoreVolumeInSuccessfulPlan,
      cleanupFunctionName: String(cleanupExcessCoreVolumeInSuccessfulPlan?.name || '')
    });
    emitPlannerDiagnosticHeartbeat(user, 'after_cleanup_excess_core_volume', buildCleanupChainHeartbeatMeta(
      user,
      coreCleanedWeeks,
      'buildSafeBasePlanner_after_cleanup_excess_core_volume',
      'buildSafeBasePlanner'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_cleanup_back_to_back_lower_redundancy', buildCleanupChainHeartbeatMeta(
      user,
      coreCleanedWeeks,
      'buildSafeBasePlanner_before_cleanup_back_to_back_lower_redundancy',
      'buildSafeBasePlanner'
    ));
    const finalWeeks = cleanupBackToBackLowerDayRedundancyInSuccessfulPlan(
      coreCleanedWeeks,
      user,
      exercises
    );
    emitPlannerDiagnosticHeartbeat(user, 'after_cleanup_back_to_back_lower_redundancy', buildCleanupChainHeartbeatMeta(
      user,
      finalWeeks,
      'buildSafeBasePlanner_after_cleanup_back_to_back_lower_redundancy',
      'buildSafeBasePlanner'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_final_weeks_assignment', buildCleanupChainHeartbeatMeta(
      user,
      finalWeeks,
      'buildSafeBasePlanner_before_final_weeks_assignment',
      'buildSafeBasePlanner'
    ));
    const guardedFinalWeeks = applyWeeklyShoulderPriorityRepairGuard(finalWeeks, user);
    emitPlannerDiagnosticHeartbeat(user, 'after_final_weeks_assignment', buildCleanupChainHeartbeatMeta(
      user,
      guardedFinalWeeks,
      'buildSafeBasePlanner_after_final_weeks_assignment',
      'buildSafeBasePlanner'
    ));
    if (shouldTrackCalvesComboDiagnostics(user)) {
      emitPlannerDiagnosticHeartbeat(user, 'safe base planner completed', {
        calfExposureByWeek: buildCalvesExposureSnapshot(guardedFinalWeeks, user)
      });
    }
    emitPlannerDiagnosticHeartbeat(user, 'before_return_successful_plan', buildCleanupChainHeartbeatMeta(
      user,
      guardedFinalWeeks,
      'buildSafeBasePlanner_before_return_successful_plan',
      'buildSafeBasePlanner'
    ));
    return extractInternalPlanState(
      schedule,
      guardedFinalWeeks,
      { ...safeResult, weeks: guardedFinalWeeks },
      [],
      { constrainedRebuild: false }
    );
  });
}

function buildUpgradeSlotFromExercise(exercise, user = null, dayType = '') {
  const name = normalizeName(exercise?.name);
  const priorities = new Set(Array.isArray(user?.priorityGroups) ? user.priorityGroups : []);
  if (/\bweighted?\s*bench\s*dips?\b|\bbench\s*dips?\b/.test(name)) {
    if (priorities.has('Arms')) {
      return {
        id: `${String(dayType || 'day').toLowerCase()}_upgrade_arm_iso`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Arms',
        primaryAllowed: ['Arms'],
        subPreferred: ['Triceps-Long', 'Triceps-Lateral'],
        subFallback: null,
        optional: false
      };
    }
    return {
      id: `${String(dayType || 'day').toLowerCase()}_upgrade_chest_press`,
      pattern: 'HorizontalPush',
      styleRequired: 'Compound',
      muscleTarget: 'Chest',
      primaryAllowed: ['Chest'],
      subPreferred: null,
      subFallback: null,
      optional: false
    };
  }
  if (/\btricep dumbbell kickback\b|\bdumbbell kickback\b/.test(name)) {
    return {
      id: `${String(dayType || 'day').toLowerCase()}_upgrade_arm_iso`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Arms',
      primaryAllowed: ['Arms'],
      subPreferred: ['Triceps-Long', 'Triceps-Lateral'],
      subFallback: null,
      optional: false
    };
  }
  return {
    id: String(exercise?.slotId || exercise?.pattern || 'upgrade_slot'),
    pattern: String(exercise?.pattern || 'Isolation'),
    styleRequired: String(exercise?.style || 'Isolation'),
    muscleTarget: String(exercise?.muscleTarget || exercise?.primary || 'Core'),
    primaryAllowed: [String(exercise?.primary || exercise?.muscleTarget || 'Core')].filter(Boolean),
    subPreferred: exercise?.sub ? [String(exercise.sub)] : null,
    subFallback: null,
    optional: false
  };
}

function isUnsupportedBentOverRowName(name) {
  const n = normalizeName(name);
  if (!n) return false;
  return /\bbent over\b/.test(n)
    && /\brow\b/.test(n)
    && !/(chest supported|head on bench|supported row|seal row)/.test(n);
}

function isChestPressPatternName(name) {
  const n = normalizeName(name);
  if (!n) return false;
  return /(bench press|chest press|incline .*press|decline .*press|cable chest press|leverage chest press|machine bench press)/.test(n)
    && !/(shoulder press|overhead press|military press|push press)/.test(n);
}

function pressJobFamiliesForExercise(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const families = [];
  if (truth.pressRole === 'chest_press' || truth.pressRole === 'mixed' || isChestPressPatternName(exercise?.name)) families.push('chest_press');
  if (truth.pressRole === 'shoulder_press' || truth.pressRole === 'mixed' || truth.shoulderPressPattern) families.push('shoulder_press');
  return families;
}

function isCoachSideEyeAccessory(exercise, user) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  const elbowSeverity = Math.max(
    Number(user?.injuryMap?.elbow || 0),
    Number(user?.injuryMap?.Wrist || 0)
  );
  if (/\bweighted?\s*bench\s*dips?\b|\bbench\s*dips?\b/.test(name)) {
    if (
      user?.profile?.complexity === 'low'
      || elbowSeverity >= 3
      || truth.skullcrusherLike
      || !truth.progressionFriendly
      || Array.isArray(user?.allowedEquipment) && user.allowedEquipment.some((token) => ['dumbbell', 'cable', 'machine'].includes(String(token || '')))
    ) return true;
  }
  if (/\btricep dumbbell kickback\b|\bdumbbell kickback\b/.test(name) && (
    user?.profile?.complexity !== 'high'
    || elbowSeverity >= 4
    || Array.isArray(user?.allowedEquipment) && user.allowedEquipment.some((token) => ['cable', 'machine'].includes(String(token || '')))
  )) return true;
  return false;
}

function qualityReplacementPreference(candidate, currentExercise, slot, user, dayType = '') {
  const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
  const currentTruth = currentExercise?.canonicalTruth || buildExerciseTruth(currentExercise, user);
  const name = normalizeName(candidate?.name);
  const slotId = String(slot?.id || '');
  let bonus = 0;
  if (truth.progressionFriendly) bonus += 10;
  if (/(supported|chest supported|seated|machine|cable|leverage|smith machine)/.test(name)) bonus += 6;
  if (truth.lateralDeltPattern || truth.rearDeltPattern) bonus += 3;
  if (truth.directArmType !== 'none') bonus += 3;
  if (isUnsupportedBentOverRowName(currentExercise?.name) && /(supported|chest supported|seated|cable|machine|leverage)/.test(name) && /\brow\b/.test(name)) bonus += 14;
  if (isCoachSideEyeAccessory(currentExercise, user) && truth.directArmType === 'triceps') bonus += 22;
  if (String(dayType || '') === 'DeltsArms' && (truth.lateralDeltPattern || truth.rearDeltPattern)) bonus += 8;
  if (['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(dayType || '')) && !truth.hingeLoadingHigh && truth.progressionFriendly) bonus += 6;
  if (slot?.muscleTarget === 'Chest' && isChestPressPatternName(candidate?.name) && !/\b(one arm|single arm)\b/.test(name)) bonus += 8;
  if (slot?.muscleTarget === 'Arms' && truth.directArmType === 'triceps' && !isCoachSideEyeAccessory(candidate, user)) bonus += 8;
  if ((slot?.muscleTarget === 'Biceps' || /repair_biceps/i.test(slotId)) && truth.directArmType === 'biceps') {
    bonus += 10;
    if (/(high cable curl|cable curl|overhead cable curl)/.test(name)) bonus += 8;
    if (/(incline dumbbell curl|incline curl)/.test(name)) bonus += 8;
    if (/\bhammer curl\b/.test(name)) bonus += 6;
    if (/\bpreacher\b/.test(name)) bonus += 6;
  }
  if (slot?.muscleTarget === 'Core' && truth.directAb) bonus += 8;
  if (slot?.muscleTarget === 'Core' && truth.coreFamily !== currentTruth.coreFamily) bonus += 10;
  if (slot?.muscleTarget === 'Glutes') bonus += gluteStrengthRank(truth.glutePrimaryStrength) * 8;
  if (slot?.muscleTarget === 'Glutes' && truth.fatigueClass === 'high') bonus -= 10;
  if (slot?.muscleTarget === 'Back' && truth.pullRole === 'back_builder') bonus += 8;
  if (slot?.muscleTarget === 'Back' && ['chest_supported', 'machine_supported', 'cable_supported', 'seated_stable'].includes(truth.supportType)) bonus += 10;
  if (slot?.muscleTarget === 'Back' && truth.supportType === 'unsupported') bonus -= 10;
  if (truth.overloadFriendliness === 'high') bonus += 6;
  else if (truth.overloadFriendliness === 'low') bonus -= 4;
  if (/\b(one arm|single arm)\b/.test(name)) bonus -= 5;
  if (isCoachSideEyeAccessory(candidate, user)) bonus -= 24;
  if (slot?.muscleTarget === 'Shoulders' && truth.shoulderPressPattern) bonus -= 10;
  if (slot?.muscleTarget === 'Arms' && truth.shoulderPressPattern) bonus -= 16;
  if (slot?.muscleTarget === 'Legs' && /(adductor|abductor|kickback)/.test(name) && currentTruth.progressionFriendly) bonus -= 8;
  return bonus;
}

function hasExactPriorities(user, expected) {
  const current = Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [];
  if (current.length !== expected.length) return false;
  return expected.every((entry) => current.includes(entry));
}

function getGoalIdentityPriorityMuscles(user) {
  const priorities = Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [];
  if (priorities.length <= 2) return priorities;
  if (hasExactPriorities(user, ['Chest', 'Shoulders', 'Arms'])) return ['Chest', 'Shoulders', 'Arms'];
  if (hasExactPriorities(user, ['Back', 'Shoulders', 'Arms'])) return ['Back', 'Shoulders', 'Arms'];
  if (hasExactPriorities(user, ['Quads', 'Hamstrings/Glutes', 'Calves'])) return ['Quads', 'Hamstrings/Glutes', 'Calves'];
  return [];
}

function isNarrowPriorityUser(user) {
  return getGoalIdentityPriorityMuscles(user).length > 0;
}

function isUpperNarrowPriorityUser(user) {
  const priorities = getGoalIdentityPriorityMuscles(user);
  return priorities.length > 0 && priorities.every((muscle) => ['Chest', 'Back', 'Shoulders', 'Arms', 'Abs'].includes(String(muscle || '')));
}

function isLowerNarrowPriorityUser(user) {
  const priorities = getGoalIdentityPriorityMuscles(user);
  return priorities.length > 0 && priorities.every((muscle) => ['Quads', 'Hamstrings/Glutes', 'Calves', 'Abs'].includes(String(muscle || '')));
}

function getGoalIdentityPrioritiesForDay(dayType, user) {
  return getGoalIdentityPriorityMuscles(user)
    .filter((muscle) => isPriorityRelevantToDay(dayType, muscle));
}

function getNarrowPriorityComboOrder(user, dayType = '') {
  const type = String(dayType || '');
  if (isNarrowBackArmsUser(user) && ['Pull', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(type)) return ['Back', 'Arms'];
  if (isNarrowShouldersArmsUser(user) && ['Push', 'Upper', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB'].includes(type)) return ['Shoulders', 'Arms'];
  if (isNarrowChestCoreUser(user) && ['Push', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(type)) return ['Chest', 'Abs'];
  if (isNarrowPosteriorCoreUser(user) && ['Lower', 'LowerFocus', 'Legs', 'FullBodyA', 'FullBodyB'].includes(type)) return ['Hamstrings/Glutes', 'Abs'];
  if (isNarrowCoreCalvesUser(user) && ['FullBodyA', 'FullBodyB', 'Upper', 'UpperFocus', 'Lower', 'LowerFocus', 'Legs'].includes(type)) return ['Abs', 'Calves'];
  return [];
}

function isNarrowShouldersArmsUser(user) {
  return hasExactPriorities(user, ['Shoulders', 'Arms']);
}

function isNarrowBackArmsUser(user) {
  return hasExactPriorities(user, ['Back', 'Arms']);
}

function isBackShouldersArmsUser(user) {
  return hasExactPriorities(user, ['Back', 'Shoulders', 'Arms']);
}

function isNarrowChestCoreUser(user) {
  return hasExactPriorities(user, ['Chest', 'Abs']);
}

function isChestShouldersArmsUser(user) {
  return hasExactPriorities(user, ['Chest', 'Shoulders', 'Arms']);
}

function isNarrowCoreCalvesUser(user) {
  return hasExactPriorities(user, ['Abs', 'Calves']);
}

function isNarrowPosteriorCoreUser(user) {
  return hasExactPriorities(user, ['Hamstrings/Glutes', 'Abs'])
    || hasExactPriorities(user, ['Quads', 'Hamstrings/Glutes', 'Abs']);
}

function isGluteDominantPriorityUser(user) {
  return hasExactPriorities(user, ['Quads', 'Hamstrings/Glutes'])
    || hasExactPriorities(user, ['Quads', 'Hamstrings/Glutes', 'Calves'])
    || isNarrowPosteriorCoreUser(user);
}

function gluteStrengthRank(value) {
  const rank = { none: 0, assist: 1, secondary: 2, primary: 3 };
  return Number(rank[String(value || 'none')] || 0);
}

function isRealPosteriorChainBuilder(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  if (/\b(thigh abductor|thigh adductor|abductor|adductor|kickback)\b/.test(name)) return false;
  if (/(hip thrust|glute bridge|pull through|glute ham raise|seated leg curl|lying leg curl|leg curl|hamstring curl|romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(name)) return true;
  return gluteStrengthRank(truth.glutePrimaryStrength) >= 3 && truth.progressionFriendly;
}

function isMeaningfulLowerPriorityExercise(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  if (isRealPosteriorChainBuilder(exercise, user)) return false;
  if (truth.directCalf) return true;
  if (truth.primaryMuscle === 'Legs') return true;
  if (['squat', 'lunge'].includes(String(truth.movementFamily || ''))) return true;
  return /(leg press|hack squat|leg extension|split squat|lunge|step[\s-]*up|calf raise)/.test(name);
}

function isPosteriorCoreRelevantLowerDay(dayType, user) {
  return isNarrowPosteriorCoreUser(user) && ['Lower', 'LowerFocus', 'Legs', 'FullBodyA', 'FullBodyB'].includes(String(dayType || ''));
}

function exerciseSatisfiesDayPriorityIdentity(exercise, muscle, user, dayType = '') {
  if (String(muscle || '') === 'Glutes' && isPosteriorCoreRelevantLowerDay(dayType, user)) {
    return isRealPosteriorChainBuilder(exercise, user);
  }
  return exerciseDirectlyServesPriority(exercise, muscle, user);
}

function shouldUpgradeExerciseTaste(exercise, user, dayType = '') {
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  if (/\bjm press\b|\bmachine shoulder \(military\) press\b|\bincline barbell triceps extension\b|\bside laterals? to front raise\b/.test(name)) return true;
  if (/\bchair squat\b|\bthigh adductor\b|\bthigh abductor\b|\bone-legged cable kickback\b|\btricep dumbbell kickback\b/.test(name)) return true;
  if (/^row$/.test(name)) return true;
  if (isUnsupportedBentOverRowName(name)) return true;
  if (isCoachSideEyeAccessory(exercise, user)) return true;
  if (String(dayType || '').toLowerCase() === 'push' && /(rear delt row)/.test(name)) return true;
  if ((user?.priorityGroups || []).includes('Shoulders') && /(front raise)/.test(name)) return true;
  return false;
}

function buildQualityReplacement(day, exercise, slot, user, exercises, weekType, predicate = null) {
  return withPlannerTiming(user, 'replacementLogicMs', () => {
    const dayKey = `${String(day?.dayType || '')}:${dayExerciseSignature(day)}`;
    const runtime = user?._plannerRuntime || null;
    const attempts = runtime?.state?.replacementAttemptsByDay || null;
    const nextAttempts = Number(attempts?.get(dayKey) || 0) + 1;
    if (attempts) attempts.set(dayKey, nextAttempts);
    recordPlannerCount(user, 'replacementAttempts');
    if (nextAttempts > MAX_REPLACEMENT_ATTEMPTS_PER_DAY) {
      recordPlannerCount(user, 'replacementAttemptCapHits');
      return null;
    }

    const dayWithoutCurrent = {
      ...day,
      exercises: (day?.exercises || []).filter((entry) => entry !== exercise)
    };
    const existingKeys = new Set((dayWithoutCurrent?.exercises || []).map((entry) => exerciseDayIdentityKey(entry)).filter(Boolean));
    const existingTricepsFamilies = tricepsFamiliesOnDay(dayWithoutCurrent);
    const dayState = buildCurrentDayState(dayWithoutCurrent);
    const dayStateSignature = dayExerciseSignature(dayWithoutCurrent);
    const slotVariants = [{ ...slot }];
    if (String(slot?.muscleTarget || '') === 'Glutes') {
      slotVariants.push({
        ...slot,
        id: `${String(slot?.id || 'slot')}_glute_iso_wide`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        primaryAllowed: ['Glutes', 'Legs'],
        subPreferred: ['Glutes']
      });
      slotVariants.push({
        ...slot,
        id: `${String(slot?.id || 'slot')}_glute_hinge`,
        pattern: 'Hinge',
        styleRequired: 'Compound',
        primaryAllowed: ['Glutes', 'Legs'],
        subPreferred: ['Glutes', 'Hamstrings-Hinge']
      });
    } else if (String(slot?.muscleTarget || '') === 'Back') {
      slotVariants.push({
        ...slot,
        id: `${String(slot?.id || 'slot')}_back_hpull`,
        pattern: 'HorizontalPull',
        styleRequired: 'Compound',
        primaryAllowed: ['Back'],
        subPreferred: ['Lats-Thickness', 'UpperBack']
      });
      slotVariants.push({
        ...slot,
        id: `${String(slot?.id || 'slot')}_back_vpull`,
        pattern: 'VerticalPull',
        styleRequired: 'Compound',
        primaryAllowed: ['Back'],
        subPreferred: ['Lats-Width', 'UpperBack']
      });
    } else if (String(slot?.muscleTarget || '') === 'Core') {
      slotVariants.push({
        ...slot,
        id: `${String(slot?.id || 'slot')}_core_flex`,
        pattern: 'CoreFlexion',
        styleRequired: 'Isolation',
        primaryAllowed: ['Core'],
        subPreferred: ['Abs-Lower', 'Abs-Upper']
      });
      slotVariants.push({
        ...slot,
        id: `${String(slot?.id || 'slot')}_core_stability`,
        pattern: 'CoreStability',
        styleRequired: 'Isolation',
        primaryAllowed: ['Core'],
        subPreferred: ['TVA', 'LowerAbs']
      });
      slotVariants.push({
        ...slot,
        id: `${String(slot?.id || 'slot')}_core_rotation`,
        pattern: 'CoreRotation',
        styleRequired: 'Isolation',
        primaryAllowed: ['Core'],
        subPreferred: ['Obliques', 'TVA']
      });
    }
    let eligible = slotVariants
      .flatMap((candidateSlot) => {
        const poolKey = `${String(day?.dayType || '')}|${dayStateSignature}|${replacementSlotSignature(candidateSlot)}`;
        let basePool = runtime?.caches?.qualityReplacementPools?.get(poolKey) || null;
        if (!basePool) {
          basePool = filterEligible(candidateSlot, exercises, user, new Set(), dayState, day?.dayType || '', null);
          runtime?.caches?.qualityReplacementPools?.set(poolKey, basePool);
          recordPlannerCount(user, 'qualityReplacementPoolMisses');
        } else {
          recordPlannerCount(user, 'qualityReplacementPoolHits');
        }
        return basePool
          .filter((candidate) => exerciseDayIdentityKey(candidate) !== exerciseDayIdentityKey(exercise))
          .filter((candidate) => !existingKeys.has(exerciseDayIdentityKey(candidate)))
          .filter((candidate) => neckAllowedForUser(user) || !isNeckExercise(candidate, user))
          .map((candidate) => ({
            candidate,
            slot: candidateSlot,
            score: scoreExercise(candidate, candidateSlot, user, day?.dayType || '') + qualityReplacementPreference(candidate, exercise, candidateSlot, user, day?.dayType || '')
              + (() => {
                let bonus = 0;
                const currentReq = new Set(Array.isArray(exercise?.requiredEquipment) ? exercise.requiredEquipment : Array.isArray(exercise?.canonicalTruth?.requiredEquipment) ? exercise.canonicalTruth.requiredEquipment : []);
                const candidateReq = new Set(Array.isArray(candidate?.requiredEquipment) ? candidate.requiredEquipment : Array.isArray(candidate?.canonicalTruth?.requiredEquipment) ? candidate.canonicalTruth.requiredEquipment : []);
                const overlap = [...candidateReq].filter((token) => currentReq.has(token)).length;
                if (overlap > 0) bonus += overlap * 4;
                const candidateTruth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
                const tricepsRepair = String(candidateTruth?.directArmType || '') === 'triceps'
                  && (String(candidateSlot?.muscleTarget || '') === 'Triceps' || String(slot?.muscleTarget || '') === 'Triceps' || /triceps/i.test(String(candidateSlot?.id || slot?.id || '')));
                if (tricepsRepair) {
                  const family = tricepsMovementFamily(candidate?.name);
                  if (family !== 'none') bonus += existingTricepsFamilies.has(family) ? -8 : 12;
                }
                return bonus;
              })()
          }));
      })
      .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
    if (typeof predicate === 'function') eligible = eligible.filter(({ candidate }) => predicate(candidate));
    const tricepsVarietyContext = String(slot?.muscleTarget || '') === 'Triceps'
      || /triceps/i.test(String(slot?.id || ''));
    if (tricepsVarietyContext) {
      const tricepsVarietyEligible = eligible.filter(({ candidate }) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        if (String(truth?.directArmType || '') !== 'triceps') return false;
        const family = tricepsMovementFamily(candidate?.name);
        return family !== 'none' && !existingTricepsFamilies.has(family);
      });
      if (tricepsVarietyEligible.length) eligible = tricepsVarietyEligible;
    }
    const selected = eligible[0] || null;
    const replacement = selected?.candidate || null;
    if (!replacement) return null;
    const effectiveSlot = selected?.slot || slot;
    const rr = repsRestByExercise(replacement, String(weekType || 'base'), user, effectiveSlot.id);
    const sets = effectiveSlot.styleRequired === 'Isolation'
      ? Math.min(3, Math.max(2, Number(exercise?.sets || 2)))
      : Math.max(2, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(exercise?.sets || 3)));
    return buildExerciseOutput(replacement, user, { ...effectiveSlot, optional: false }, sets, rr, { weekType: String(weekType || 'base') });
  });
}

function exerciseDirectlyServesPriority(exercise, muscle, user) {
  const directTargets = new Set(getExerciseDirectTargetKeys(exercise, user));
  const wanted = new Set(priorityGroupToDirectTargets(muscle));
  if (String(muscle || '') === 'Back' && wanted.size === 0) wanted.add('Back');
  if (String(muscle || '') === 'Shoulders' && wanted.size === 0) wanted.add('Shoulders');
  if (String(muscle || '') === 'Chest' && wanted.size === 0) wanted.add('Chest');
  if (String(muscle || '') === 'Calves' && wanted.size === 0) wanted.add('Calves');
  if (String(muscle || '') === 'Abs' && wanted.size === 0) wanted.add('Abs');
  if (String(muscle || '') === 'Biceps' && wanted.size === 0) wanted.add('Biceps');
  if (String(muscle || '') === 'Triceps' && wanted.size === 0) wanted.add('Triceps');
  if (String(muscle || '') === 'Quads' && wanted.size === 0) wanted.add('Quads');
  if (String(muscle || '') === 'Hamstrings' && wanted.size === 0) wanted.add('Hamstrings');
  if (String(muscle || '') === 'Glutes' && wanted.size === 0) wanted.add('Glutes');
  return [...wanted].some((target) => directTargets.has(target));
}

function isPriorityRelevantToDay(dayType, muscle) {
  const type = String(dayType || '');
  const upperDays = new Set(['Push', 'Pull', 'Upper', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB']);
  const lowerDays = new Set(['Lower', 'LowerFocus', 'Legs', 'FullBodyA', 'FullBodyB']);
  if (['Chest', 'Back', 'Shoulders', 'Arms'].includes(muscle)) {
    if (type === 'Push' && muscle === 'Back') return false;
    if (type === 'Pull' && muscle === 'Chest') return false;
    if (type === 'DeltsArms' && (muscle === 'Chest' || muscle === 'Back')) return false;
    return upperDays.has(type);
  }
  if (['Quads', 'Hamstrings/Glutes', 'Calves', 'Legs', 'Glutes'].includes(muscle)) return lowerDays.has(type);
  if (muscle === 'Abs' || muscle === 'Core') return true;
  return false;
}

function buildPriorityIdentitySlot(dayType, muscle) {
  const dayKey = String(dayType || 'day').toLowerCase();
  switch (String(muscle || '')) {
    case 'Chest':
      if (['Push', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(String(dayType || ''))) {
        return {
          id: `${dayKey}_priority_identity_chest`,
          pattern: 'HorizontalPush',
          styleRequired: 'Compound',
          muscleTarget: 'Chest',
          primaryAllowed: ['Chest'],
          subPreferred: null,
          subFallback: null,
          optional: false
        };
      }
      return {
        id: `${dayKey}_priority_identity_chest`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Chest',
        primaryAllowed: ['Chest'],
        subPreferred: ['Chest'],
        subFallback: null,
        optional: false
      };
    case 'Back':
      return {
        id: `${dayKey}_priority_identity_back`,
        pattern: ['Pull', 'Upper', 'UpperFocus'].includes(String(dayType || '')) ? 'VerticalPull' : 'HorizontalPull',
        styleRequired: 'Compound',
        muscleTarget: 'Back',
        primaryAllowed: ['Back'],
        subPreferred: ['Lats-Width', 'Lats-Thickness', 'UpperBack'],
        subFallback: null,
        optional: false
      };
    case 'Shoulders':
      if (['Push', 'Upper', 'UpperFocus', 'DeltsArms'].includes(String(dayType || ''))) {
        return {
          id: `${dayKey}_priority_identity_shoulders`,
          pattern: 'VerticalPush',
          styleRequired: 'Compound',
          muscleTarget: 'Shoulders',
          primaryAllowed: ['Shoulders'],
          subPreferred: null,
          subFallback: null,
          optional: false
        };
      }
      return {
        id: `${dayKey}_priority_identity_shoulders`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Shoulders',
        primaryAllowed: ['Shoulders'],
        subPreferred: ['Lateral', 'Rear'],
        subFallback: null,
        optional: false
      };
    case 'Arms':
      return {
        id: `${dayKey}_priority_identity_arms`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Arms',
        primaryAllowed: ['Arms'],
        subPreferred: ['Pull', 'FullBodyB'].includes(String(dayType || ''))
          ? ['Biceps-Long', 'Biceps-Short', 'Triceps-Long']
          : ['Triceps-Long', 'Triceps-Lateral', 'Biceps-Long'],
        subFallback: null,
        optional: false
      };
    case 'Abs':
    case 'Core':
      return {
        id: `${dayKey}_priority_identity_core`,
        pattern: ['Pull', 'Upper', 'DeltsArms'].includes(String(dayType || '')) ? 'CoreRotation' : 'CoreFlexion',
        styleRequired: 'Isolation',
        muscleTarget: 'Core',
        primaryAllowed: ['Core'],
        subPreferred: ['Obliques', 'Abs-Lower', 'Abs-Upper'],
        subFallback: null,
        optional: false
      };
    case 'Quads':
    case 'Legs':
      return {
        id: `${dayKey}_priority_identity_legs`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Legs',
        primaryAllowed: ['Legs'],
        subPreferred: ['Quads'],
        subFallback: null,
        optional: false
      };
    case 'Hamstrings/Glutes':
    case 'Glutes':
      if (['Lower', 'LowerFocus', 'Legs', 'FullBodyA', 'FullBodyB'].includes(String(dayType || ''))) {
        return {
          id: `${dayKey}_priority_identity_glutes`,
          pattern: 'Hinge',
          styleRequired: 'Compound',
          muscleTarget: 'Glutes',
          primaryAllowed: ['Glutes', 'Legs'],
          subPreferred: ['Glutes', 'Hamstrings-Hinge'],
          subFallback: null,
          optional: false
        };
      }
      return {
        id: `${dayKey}_priority_identity_glutes`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Glutes',
        primaryAllowed: ['Glutes', 'Legs'],
        subPreferred: ['Glutes'],
        subFallback: null,
        optional: false
      };
    case 'Calves':
      return {
        id: `${dayKey}_priority_identity_calves`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Calves',
        primaryAllowed: ['Legs'],
        subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
        subFallback: null,
        optional: false
      };
    default:
      return null;
  }
}

function findPriorityInsertionCandidate(day, user, exercises, weekType, targetMuscle, predicate = null) {
  const slot = buildPriorityIdentitySlot(day?.dayType || '', targetMuscle);
  if (!slot) return null;
  const dayState = buildCurrentDayState(day);
  const slotVariants = [{ ...slot }];
  if (String(slot?.muscleTarget || '') === 'Glutes') {
    slotVariants.push({
      ...slot,
      id: `${String(slot?.id || 'slot')}_insert_glute_iso`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      primaryAllowed: ['Glutes', 'Legs'],
      subPreferred: ['Glutes']
    });
  } else if (String(slot?.muscleTarget || '') === 'Core') {
    slotVariants.push({
      ...slot,
      id: `${String(slot?.id || 'slot')}_insert_core_flex`,
      pattern: 'CoreFlexion',
      styleRequired: 'Isolation',
      primaryAllowed: ['Core'],
      subPreferred: ['Abs-Lower', 'Abs-Upper']
    });
    slotVariants.push({
      ...slot,
      id: `${String(slot?.id || 'slot')}_insert_core_stability`,
      pattern: 'CoreStability',
      styleRequired: 'Isolation',
      primaryAllowed: ['Core'],
      subPreferred: ['TVA', 'LowerAbs']
    });
    slotVariants.push({
      ...slot,
      id: `${String(slot?.id || 'slot')}_insert_core_rotation`,
      pattern: 'CoreRotation',
      styleRequired: 'Isolation',
      primaryAllowed: ['Core'],
      subPreferred: ['Obliques', 'TVA']
    });
  }
  const eligible = slotVariants
    .flatMap((candidateSlot) => filterEligible(candidateSlot, exercises, user, new Set(), dayState, day?.dayType || '', null)
      .filter((candidate) => (typeof predicate === 'function'
        ? predicate(candidate)
        : exerciseDirectlyServesPriority(candidate, targetMuscle, user)))
      .map((candidate) => ({
        candidate,
        slot: candidateSlot,
        score: scoreExercise(candidate, candidateSlot, user, day?.dayType || '')
      })))
    .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
  const chosen = eligible[0]?.candidate || null;
  const effectiveSlot = eligible[0]?.slot || slot;
  if (!chosen) return null;
  const rr = repsRestByExercise(chosen, String(weekType || 'base'), user, effectiveSlot.id);
  const sets = String(effectiveSlot?.styleRequired || '') === 'Compound' ? 3 : 2;
  return buildExerciseOutput(chosen, user, effectiveSlot, sets, rr, { weekType: String(weekType || 'base') });
}

function ensureComboPresenceOnDay(day, user, exercises, weekType) {
  const comboOrder = getNarrowPriorityComboOrder(user, day?.dayType || '');
  if (comboOrder.length !== 2) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  for (const muscle of comboOrder) {
    const predicate = (exercise) => exerciseSatisfiesDayPriorityIdentity(exercise, muscle, user, nextDay?.dayType || '');
    if ((nextDay.exercises || []).some((exercise) => predicate(exercise))) continue;
    let replaceIdx = findPriorityIdentityReplacementIndex(nextDay, muscle, user);
    if (replaceIdx < 0) replaceIdx = findComboBalanceReplacementIndex(nextDay, muscle, user);
    if (replaceIdx >= 0) {
      const current = nextDay.exercises[replaceIdx];
      const slot = buildPriorityIdentitySlot(nextDay.dayType || '', muscle);
      if (slot) {
        const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
          return predicate(candidate);
        });
        if (replacement) {
          nextDay.exercises.splice(replaceIdx, 1, replacement);
          continue;
        }
      }
    }
    if ((nextDay.exercises || []).length >= Number(user?.sessionCap || 0)) continue;
    const added = findPriorityInsertionCandidate(nextDay, user, exercises, weekType, muscle, predicate);
    if (added) nextDay.exercises.push(added);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function ensurePosteriorCoreLowerDayShape(day, user, exercises, weekType, opts = {}) {
  if (!isPosteriorCoreRelevantLowerDay(day?.dayType || '', user)) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const ensureShapePiece = (slotMuscle, predicate) => {
    if ((nextDay.exercises || []).some((exercise) => predicate(exercise))) return true;
    const structuralResult = resolveCurrentLowerDayStructuralResult(nextDay);
    const guardOutcome = bumpLowerBodyRepairLoopGuard(user, 'lowerDayConstruction', {
      functionName: 'ensurePosteriorCoreLowerDayShape',
      week: opts?.weekIndex,
      day: nextDay?.day,
      dayType: nextDay?.dayType,
      lastAttemptedRepair: `ensure-${slotMuscle}`,
      missingRequirement: slotMuscle,
      currentStructuralResult: structuralResult
    });
    if (guardOutcome?.suppressed) return true;
    let replaceIdx = findPriorityIdentityReplacementIndex(nextDay, slotMuscle, user);
    if (replaceIdx < 0) replaceIdx = findComboBalanceReplacementIndex(nextDay, slotMuscle, user);
    if (replaceIdx >= 0) {
      const current = nextDay.exercises[replaceIdx];
      const slot = buildPriorityIdentitySlot(nextDay.dayType || '', slotMuscle);
      if (slot) {
        const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, predicate);
        if (replacement) {
          nextDay.exercises.splice(replaceIdx, 1, replacement);
          nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
          const repairedStructure = resolveCurrentLowerDayStructuralResult(nextDay);
          if (repairedStructure?.ok) {
            resetLowerBodyRepairLoopGuard(user, 'lowerDayConstruction', {
              week: opts?.weekIndex,
              day: nextDay?.day,
              dayType: nextDay?.dayType,
              lastAttemptedRepair: `ensure-${slotMuscle}`
            }, {
              lastAttemptedRepair: `ensure-${slotMuscle}`,
              currentStructuralResult: repairedStructure
            });
          }
          return true;
        }
      }
    }
    if ((nextDay.exercises || []).length >= Number(user?.sessionCap || 0)) return false;
    const added = findPriorityInsertionCandidate(nextDay, user, exercises, weekType, slotMuscle, predicate);
    if (!added) return false;
    nextDay.exercises.push(added);
    nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
    const repairedStructure = resolveCurrentLowerDayStructuralResult(nextDay);
    if (repairedStructure?.ok) {
      resetLowerBodyRepairLoopGuard(user, 'lowerDayConstruction', {
        week: opts?.weekIndex,
        day: nextDay?.day,
        dayType: nextDay?.dayType,
        lastAttemptedRepair: `ensure-${slotMuscle}`
      }, {
        lastAttemptedRepair: `ensure-${slotMuscle}`,
        currentStructuralResult: repairedStructure
      });
    }
    return true;
  };

  ensureShapePiece('Glutes', (exercise) => isRealPosteriorChainBuilder(exercise, user));
  ensureShapePiece('Legs', (exercise) => isMeaningfulLowerPriorityExercise(exercise, user));
  ensureShapePiece('Core', (exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user));
  return nextDay;
}

function minimumWideSessionFillCount(dayType, user) {
  if (user?.profile?.sessionBandwidth !== 'wide') return 0;
  const comboOrder = getNarrowPriorityComboOrder(user, dayType);
  if (comboOrder.length !== 2) return 0;
  if (['FullBodyA', 'FullBodyB'].includes(String(dayType || ''))) return 6;
  if (['Lower', 'LowerFocus', 'Legs', 'Upper', 'UpperFocus', 'Push', 'Pull', 'DeltsArms'].includes(String(dayType || ''))) return 5;
  return 0;
}

function enforceWideSessionPriorityFill(day, user, exercises, weekType, opts = {}) {
  const minimumFill = minimumWideSessionFillCount(day?.dayType || '', user);
  if (!minimumFill) return day;
  const comboOrder = getNarrowPriorityComboOrder(user, day?.dayType || '');
  if (comboOrder.length !== 2) return day;
  const nextDay = ensurePosteriorCoreLowerDayShape(ensureComboPresenceOnDay(day, user, exercises, weekType), user, exercises, weekType, opts);
  if (nextDay?.error) return nextDay;
  const minimumTarget = Math.min(Number(user?.sessionCap || 0), minimumFill);
  while ((nextDay.exercises || []).length < Math.min(Number(user?.sessionCap || 0), minimumFill)) {
    bumpLowerBodyRepairLoopGuard(user, 'wideSessionFill', {
      functionName: 'enforceWideSessionPriorityFill',
      day: nextDay?.day,
      dayType: nextDay?.dayType,
      lastAttemptedRepair: 'add-priority-fill',
      missingRequirement: 'wide-session lower-body fill'
    });
    let targetMuscle = comboOrder[0];
    let predicate = (exercise) => exerciseSatisfiesDayPriorityIdentity(exercise, targetMuscle, user, nextDay?.dayType || '');
    if (isPosteriorCoreRelevantLowerDay(nextDay?.dayType || '', user)) {
      const posteriorCount = countExercisesByPredicate(nextDay, (exercise) => isRealPosteriorChainBuilder(exercise, user));
      const secondaryLowerCount = countExercisesByPredicate(nextDay, (exercise) => isMeaningfulLowerPriorityExercise(exercise, user));
      const coreCount = countExercisesByPredicate(nextDay, (exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user));
      const minimumPosterior = isLowerBodyGracefulDegradeApplied(user) ? 1 : 1;
      const minimumLegs = isLowerBodyGracefulDegradeApplied(user) ? 1 : 1;
      const minimumCore = isLowerBodyGracefulDegradeApplied(user) ? 1 : 1;
      if (posteriorCount < minimumPosterior) {
        targetMuscle = 'Glutes';
        predicate = (exercise) => isRealPosteriorChainBuilder(exercise, user);
      } else if (secondaryLowerCount < minimumLegs) {
        targetMuscle = 'Legs';
        predicate = (exercise) => isMeaningfulLowerPriorityExercise(exercise, user);
      } else if (coreCount < minimumCore) {
        targetMuscle = 'Core';
        predicate = (exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user);
      } else {
        const counts = [
          { muscle: 'Glutes', count: posteriorCount, predicate: (exercise) => isRealPosteriorChainBuilder(exercise, user) },
          { muscle: 'Core', count: coreCount, predicate: (exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user) }
        ].sort((a, b) => a.count - b.count || a.muscle.localeCompare(b.muscle));
        targetMuscle = counts[0]?.muscle || 'Glutes';
        predicate = counts[0]?.predicate || predicate;
        if (isPosteriorCoreRelevantLowerDay(nextDay?.dayType || '', user) && (nextDay.exercises || []).length >= minimumTarget) {
          markLowerBodyGracefulDegrade(user, 'Preserved valid lower-day structure and stopped before ideal lower-body volume chase.');
          break;
        }
      }
    } else {
      const counts = comboOrder
        .map((muscle) => ({
          muscle,
          count: countExercisesByPredicate(nextDay, (exercise) => exerciseSatisfiesDayPriorityIdentity(exercise, muscle, user, nextDay?.dayType || ''))
        }))
        .sort((a, b) => a.count - b.count || a.muscle.localeCompare(b.muscle));
      targetMuscle = counts[0]?.muscle || comboOrder[0];
      predicate = (exercise) => exerciseSatisfiesDayPriorityIdentity(exercise, targetMuscle, user, nextDay?.dayType || '');
    }
    const added = findPriorityInsertionCandidate(nextDay, user, exercises, weekType, targetMuscle, predicate);
    if (!added) break;
    nextDay.exercises.push(added);
    nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  }
  return nextDay;
}

function finalizePressJobTradeoff(day, user, exercises, weekType) {
  const type = String(day?.dayType || '');
  if (!['Push', 'Upper', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB'].includes(type)) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const replacementFor = (current, slot) => {
    if (!slot) return null;
    return buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      if (slot.muscleTarget === 'Shoulders') return truth.lateralDeltPattern || truth.rearDeltPattern;
      if (slot.muscleTarget === 'Arms') return exerciseDirectlyServesPriority(candidate, 'Arms', user) && !isCoachSideEyeAccessory(candidate, user);
      if (slot.muscleTarget === 'Core') return exerciseDirectlyServesPriority(candidate, 'Core', user);
      return exerciseDirectlyServesPriority(candidate, slot.muscleTarget, user);
    });
  };

  if (isNarrowShouldersArmsUser(user)) {
    const pressIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      if (truth.shoulderPressPattern || isChestPressPatternName(exercise?.name)) acc.push(index);
      return acc;
    }, []);
    for (let i = pressIndexes.length - 1; i >= 1; i -= 1) {
      const idx = pressIndexes[i];
      const current = nextDay.exercises[idx];
      const shoulderIsoCount = countExercisesByPredicate(nextDay, (exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        return truth.lateralDeltPattern || truth.rearDeltPattern;
      });
      const replacement = (shoulderIsoCount < 1
        ? replacementFor(current, buildShoulderIsoReplacementSlot(type))
        : null)
        || replacementFor(current, buildPriorityIdentitySlot(type, 'Arms'));
      if (replacement) nextDay.exercises.splice(idx, 1, replacement);
      else if (nextDay.exercises.length > 4) nextDay.exercises.splice(idx, 1);
    }
  }

  if (isChestShouldersArmsUser(user)) {
    const chestPressIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
      if (isChestPressPatternName(exercise?.name)) acc.push(index);
      return acc;
    }, []);
    const maxChestPresses = type === 'Push' ? 2 : ['Upper', 'UpperFocus'].includes(type) ? 1 : 2;
    for (let i = chestPressIndexes.length - 1; i >= maxChestPresses; i -= 1) {
      const idx = chestPressIndexes[i];
      const current = nextDay.exercises[idx];
      const shoulderIsoCount = countExercisesByPredicate(nextDay, (exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        return truth.lateralDeltPattern || truth.rearDeltPattern;
      });
      const replacement = (shoulderIsoCount < 1
        ? replacementFor(current, buildShoulderIsoReplacementSlot(type))
        : null)
        || replacementFor(current, buildPriorityIdentitySlot(type, 'Arms'));
      if (replacement) nextDay.exercises.splice(idx, 1, replacement);
      else if (nextDay.exercises.length > 4) nextDay.exercises.splice(idx, 1);
    }
  }

  if (isNarrowChestCoreUser(user)) {
    const chestPressIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
      if (isChestPressPatternName(exercise?.name)) acc.push(index);
      return acc;
    }, []);
    const coreCount = countExercisesByPredicate(nextDay, (exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user));
    const maxChestPresses = type === 'Push' ? 2 : 1;
    const overCap = chestPressIndexes.length > maxChestPresses;
    const needsCoreBeforeExtraChest = chestPressIndexes.length >= 2 && coreCount < 1;
    if (overCap || needsCoreBeforeExtraChest) {
      for (let i = chestPressIndexes.length - 1; i >= 1; i -= 1) {
        const idx = chestPressIndexes[i];
        const current = nextDay.exercises[idx];
        const replacement = replacementFor(current, buildPriorityIdentitySlot(type, 'Core'));
        if (replacement) {
          nextDay.exercises.splice(idx, 1, replacement);
          break;
        }
      }
    }
  }

  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function forceFinalPressOverflowSwap(day, replaceIdx, user, exercises, weekType, replacementSpecs) {
  const current = Array.isArray(day?.exercises) ? day.exercises[replaceIdx] : null;
  if (!current) return false;
  for (const spec of Array.isArray(replacementSpecs) ? replacementSpecs : []) {
    if (!spec?.slot || typeof spec?.predicate !== 'function') continue;
    const replacement = buildQualityReplacement(day, current, spec.slot, user, exercises, weekType, spec.predicate);
    if (!replacement) continue;
    day.exercises.splice(replaceIdx, 1, replacement);
    return true;
  }
  return false;
}

function enforceFinalPressJobHardGuardDay(day, user, exercises, weekType) {
  const type = String(day?.dayType || '');
  if (!['Push', 'Upper', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB'].includes(type)) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const shoulderIsoSlot = buildShoulderIsoReplacementSlot(type);
  const armSlot = buildPriorityIdentitySlot(type, 'Arms');
  const coreSlot = buildPriorityIdentitySlot(type, 'Core');
  const strictBicepsOrTriceps = (candidate) => {
    const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
    return ['biceps', 'triceps'].includes(String(truth.directArmSubtype || '')) && !isCoachSideEyeAccessory(candidate, user);
  };
  const strictTriceps = (candidate) => {
    const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
    return String(truth.directArmSubtype || '') === 'triceps' && !isCoachSideEyeAccessory(candidate, user);
  };
  const strictShoulderIso = (candidate) => {
    const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
    return truth.lateralDeltPattern || truth.rearDeltPattern;
  };
  const strictCore = (candidate) => {
    const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
    const name = normalizeName(candidate?.name);
    return truth.directAb && /(crunch|reverse crunch|pallof|oblique)/.test(name);
  };
  const collectIndexes = (family) => nextDay.exercises.reduce((acc, exercise, index) => {
    if (pressJobFamiliesForExercise(exercise, user).includes(family)) acc.push(index);
    return acc;
  }, []);

  if (isNarrowShouldersArmsUser(user)) {
    const shoulderPressIndexes = collectIndexes('shoulder_press');
    for (let i = shoulderPressIndexes.length - 1; i >= 1; i -= 1) {
      const idx = shoulderPressIndexes[i];
      const replaced = forceFinalPressOverflowSwap(nextDay, idx, user, exercises, weekType, [
        { slot: shoulderIsoSlot, predicate: strictShoulderIso },
        { slot: armSlot, predicate: strictBicepsOrTriceps }
      ]);
      if (!replaced && nextDay.exercises.length > 4) nextDay.exercises.splice(idx, 1);
    }
  }

  if (isChestShouldersArmsUser(user)) {
    const chestPressIndexes = collectIndexes('chest_press');
    const maxChestPresses = type === 'Push' ? 2 : 1;
    for (let i = chestPressIndexes.length - 1; i >= maxChestPresses; i -= 1) {
      const idx = chestPressIndexes[i];
      const replaced = forceFinalPressOverflowSwap(nextDay, idx, user, exercises, weekType, [
        { slot: shoulderIsoSlot, predicate: strictShoulderIso },
        { slot: armSlot, predicate: strictTriceps }
      ]);
      if (!replaced && nextDay.exercises.length > 4) nextDay.exercises.splice(idx, 1);
    }
  }

  if (isNarrowChestCoreUser(user)) {
    const chestPressIndexes = collectIndexes('chest_press');
    const maxChestPresses = type === 'Push' ? 2 : 1;
    const coreCount = countExercisesByPredicate(nextDay, (exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user));
    const needsSwap = chestPressIndexes.length > maxChestPresses || (chestPressIndexes.length >= 2 && coreCount < 1);
    if (needsSwap) {
      const minAllowedChestCount = type === 'Push' ? 1 : 0;
      for (let i = chestPressIndexes.length - 1; i >= minAllowedChestCount; i -= 1) {
        const idx = chestPressIndexes[i];
        const replaced = forceFinalPressOverflowSwap(nextDay, idx, user, exercises, weekType, [
          { slot: coreSlot, predicate: strictCore }
        ]);
        if (replaced) break;
        if (chestPressIndexes.length > maxChestPresses && nextDay.exercises.length > 4) {
          nextDay.exercises.splice(idx, 1);
          break;
        }
      }
    }
  }

  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises || []);
  return nextDay;
}

function applyFinalNarrowPriorityDayPolish(day, user, exercises, weekType, opts = {}) {
  return withPlannerTiming(user, 'narrowGoalCleanupMs', () => {
    let nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
    let priorSignature = '';
    for (let passIndex = 0; passIndex < MAX_FINAL_POLISH_PASSES; passIndex += 1) {
      const beforeSignature = dayExerciseSignature(nextDay);
      nextDay = ensureComboPresenceOnDay(nextDay, user, exercises, weekType);
      nextDay = ensurePosteriorCoreLowerDayShape(nextDay, user, exercises, weekType, opts);
      nextDay = polishNarrowPrioritySessionOrder(nextDay, user);
      nextDay = enforceNarrowPriorityOffGoalCap(nextDay, user);
      if (passIndex === 0) {
        nextDay = ensureComboPresenceOnDay(nextDay, user, exercises, weekType);
        nextDay = ensurePosteriorCoreLowerDayShape(nextDay, user, exercises, weekType, opts);
      }
      nextDay = enforceWideSessionPriorityFill(nextDay, user, exercises, weekType, opts);
      nextDay = finalizePressJobTradeoff(nextDay, user, exercises, weekType);
      nextDay = enforceFinalPressJobHardGuardDay(nextDay, user, exercises, weekType);
      const afterSignature = dayExerciseSignature(nextDay);
      recordPlannerCount(user, 'finalPolishPasses');
      if (afterSignature === beforeSignature || afterSignature === priorSignature) {
        if (afterSignature === priorSignature) recordPlannerCount(user, 'finalPolishRepeatStops');
        break;
      }
      priorSignature = beforeSignature;
    }
    return {
      ...nextDay,
      exercises: organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises || [])
    };
  });
}

function minimumCompoundFloorForIdentity(dayType, user = null, targetMuscle = '') {
  const type = String(dayType || '');
  if (targetMuscle === 'Core' && isNarrowCoreCalvesUser(user) && ['FullBodyA', 'FullBodyB', 'Upper', 'UpperFocus'].includes(type)) return 1;
  if (targetMuscle === 'Glutes' && isGluteDominantPriorityUser(user) && ['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(type)) return 1;
  if (['FullBodyA', 'FullBodyB'].includes(type)) return 2;
  if (['Lower', 'LowerFocus', 'Legs', 'Upper', 'UpperFocus', 'Push', 'Pull'].includes(type)) return 2;
  if (type === 'DeltsArms') return 1;
  return 1;
}

function findPriorityIdentityReplacementIndex(day, targetMuscle, user) {
  const priorities = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const compoundCount = exercises.filter((exercise) => String(exercise?.style || '') === 'Compound').length;
  const compoundFloor = minimumCompoundFloorForIdentity(day?.dayType || '', user, targetMuscle);
  const ranked = exercises
    .map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      const servesTarget = exerciseDirectlyServesPriority(exercise, targetMuscle, user);
      const servesAnyPriority = priorities.some((muscle) => exerciseDirectlyServesPriority(exercise, muscle, user));
      if (servesTarget) return null;
      if (servesAnyPriority && String(exercise?.style || '') !== 'Compound') return null;
      if (String(exercise?.style || '') === 'Compound' && compoundCount <= compoundFloor) return null;
      let score = 0;
      if (!servesAnyPriority) score += 40;
      if (String(exercise?.style || '') === 'Isolation') score += 24;
      if (exercise?.optional) score += 8;
      if (truth.directAb && !hasPriorityGroup(priorities, 'Abs')) score += 4;
      if (truth.directCalf && !hasPriorityGroup(priorities, 'Calves')) score += 4;
      if (truth.primaryMuscle === 'Chest' && String(day?.dayType || '') === 'Pull') score += 18;
      if (truth.primaryMuscle === 'Back' && String(day?.dayType || '') === 'Push') score += 18;
      if (String(exercise?.style || '') === 'Compound' && index === 0) score -= 12;
      if (truth.progressionFriendly && String(exercise?.style || '') === 'Compound') score -= 6;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked[0]?.index ?? -1;
}

function findComboBalanceReplacementIndex(day, targetMuscle, user) {
  const comboOrder = getNarrowPriorityComboOrder(user, day?.dayType || '');
  if (comboOrder.length !== 2) return -1;
  const otherComboMuscles = comboOrder.filter((muscle) => String(muscle || '') !== String(targetMuscle || ''));
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const ranked = exercises
    .map((exercise, index) => {
      if (exerciseDirectlyServesPriority(exercise, targetMuscle, user)) return null;
      const servesAnyPriority = (user?.priorityGroups || []).some((muscle) => exerciseDirectlyServesPriority(exercise, muscle, user));
      const servesOtherCombo = otherComboMuscles.some((muscle) => exerciseDirectlyServesPriority(exercise, muscle, user));
      let score = 0;
      if (!servesAnyPriority) score += 40;
      if (servesOtherCombo) score += String(exercise?.style || '') === 'Isolation' ? 28 : 12;
      if (isOffGoalMaintenanceExercise(exercise, user, day?.dayType || '')) score += 18;
      if (String(exercise?.style || '') === 'Isolation') score += 8;
      score += index;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked[0]?.index ?? -1;
}

function polishPriorityDominanceSessionIdentity(day, user, exercises, weekType) {
  const priorities = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  if (!priorities.length) return day;
  const relevantPriorities = priorities.filter((muscle) => isPriorityRelevantToDay(day?.dayType || '', muscle));
  if (!relevantPriorities.length) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const replacementCap = ['FullBodyA', 'FullBodyB'].includes(String(day?.dayType || '')) ? 1 : 2;
  let replacements = 0;
  for (const muscle of relevantPriorities) {
    if (replacements >= replacementCap) break;
    if (nextDay.exercises.some((exercise) => exerciseDirectlyServesPriority(exercise, muscle, user))) continue;
    const slot = buildPriorityIdentitySlot(nextDay.dayType || '', muscle);
    if (!slot) continue;
    const replaceIdx = findPriorityIdentityReplacementIndex(nextDay, muscle, user);
    if (replaceIdx < 0) continue;
    const current = nextDay.exercises[replaceIdx];
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      if (!exerciseDirectlyServesPriority(candidate, muscle, user)) return false;
      if (muscle === 'Shoulders') {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.lateralDeltPattern || truth.rearDeltPattern || truth.shoulderPressPattern;
      }
      if (muscle === 'Glutes') {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return !truth.hingeLoadingHigh || truth.controlledHingeAllowed;
      }
      return true;
    });
    if (!replacement) continue;
    nextDay.exercises.splice(replaceIdx, 1, replacement);
    replacements += 1;
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function countExercisesByPredicate(day, predicate) {
  return (Array.isArray(day?.exercises) ? day.exercises : []).filter((exercise) => predicate(exercise)).length;
}

function buildShoulderIsoReplacementSlot(dayType) {
  return {
    id: `${String(dayType || 'day').toLowerCase()}_quality_shoulder_iso`,
    pattern: 'Isolation',
    styleRequired: 'Isolation',
    muscleTarget: 'Shoulders',
    primaryAllowed: ['Shoulders'],
    subPreferred: ['Lateral', 'Rear'],
    subFallback: null,
    optional: false
  };
}

function buildShoulderPressDuplicateReplacementSpecs(dayType, user) {
  const dayKey = String(dayType || 'day').toLowerCase();
  return [
    {
      key: 'lateral_raise',
      slot: {
        id: `${dayKey}_quality_shoulder_lateral`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Shoulders',
        primaryAllowed: ['Shoulders'],
        subPreferred: ['Lateral'],
        subFallback: null,
        optional: false
      },
      predicate: (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.lateralDeltPattern;
      }
    },
    {
      key: 'rear_delt',
      slot: {
        id: `${dayKey}_quality_shoulder_rear`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Shoulders',
        primaryAllowed: ['Shoulders'],
        subPreferred: ['Rear'],
        subFallback: null,
        optional: false
      },
      predicate: (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.rearDeltPattern;
      }
    },
    {
      key: 'shoulder_iso',
      slot: buildShoulderIsoReplacementSlot(dayType),
      predicate: (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.lateralDeltPattern || truth.rearDeltPattern;
      }
    }
  ];
}

function buildShoulderFallbackDayState(day) {
  const state = buildCurrentDayState(day);
  state.families = new Set([...state.families].filter((family) => !['lateral_raise', 'rear_delt'].includes(String(family || ''))));
  state.counts = {
    ...state.counts,
    lateral_raise: 0,
    rear_delt: 0
  };
  return state;
}

function shoulderReplacementEquipmentOverlapBonus(candidate, current) {
  const currentReq = new Set(Array.isArray(current?.requiredEquipment)
    ? current.requiredEquipment
    : Array.isArray(current?.canonicalTruth?.requiredEquipment)
      ? current.canonicalTruth.requiredEquipment
      : []);
  const candidateReq = new Set(Array.isArray(candidate?.requiredEquipment)
    ? candidate.requiredEquipment
    : Array.isArray(candidate?.canonicalTruth?.requiredEquipment)
      ? candidate.canonicalTruth.requiredEquipment
      : []);
  const overlap = [...candidateReq].filter((token) => currentReq.has(token)).length;
  return overlap > 0 ? overlap * 6 : 0;
}

function buildFallbackShoulderIsolationReplacement(day, exercise, spec, user, exercises, weekType) {
  const dayWithoutCurrent = {
    ...day,
    exercises: (Array.isArray(day?.exercises) ? day.exercises : []).filter((entry) => entry !== exercise)
  };
  const existingKeys = new Set((dayWithoutCurrent.exercises || []).map((entry) => exerciseDayIdentityKey(entry)).filter(Boolean));
  const dayState = buildShoulderFallbackDayState(dayWithoutCurrent);
  let eligible = filterEligible(spec.slot, exercises, user, new Set(), dayState, day?.dayType || '', null)
    .filter((candidate) => exerciseDayIdentityKey(candidate) !== exerciseDayIdentityKey(exercise))
    .filter((candidate) => !existingKeys.has(exerciseDayIdentityKey(candidate)))
    .filter((candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      return !truth.shoulderPressPattern
        && (truth.lateralDeltPattern || truth.rearDeltPattern)
        && !isCoachSideEyeAccessory(candidate, user)
        && exerciseDirectlyServesPriority(candidate, 'Shoulders', user);
    });
  if (typeof spec?.predicate === 'function') eligible = eligible.filter((candidate) => spec.predicate(candidate));
  const ranked = eligible
    .map((candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      let bonus = shoulderReplacementEquipmentOverlapBonus(candidate, exercise);
      if (spec?.key === 'lateral_raise' && truth.lateralDeltPattern) bonus += 18;
      if (spec?.key === 'rear_delt' && truth.rearDeltPattern) bonus += 18;
      if (spec?.key === 'shoulder_iso' && (truth.lateralDeltPattern || truth.rearDeltPattern)) bonus += 10;
      return {
        candidate,
        score: scoreExercise(candidate, spec.slot, user, day?.dayType || '')
          + qualityReplacementPreference(candidate, exercise, spec.slot, user, day?.dayType || '')
          + bonus
      };
    })
    .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
  const selected = ranked[0]?.candidate || null;
  if (!selected) {
    return {
      replacement: null,
      candidateCount: ranked.length,
      topCandidateNames: ranked.slice(0, 5).map(({ candidate }) => String(candidate?.name || '')).filter(Boolean),
      rejectionReason: ranked.length ? 'no_safe_ranked_candidate' : 'empty_candidate_pool'
    };
  }
  const rr = repsRestByExercise(selected, String(weekType || 'base'), user, spec.slot.id);
  const sets = spec.slot.styleRequired === 'Isolation'
    ? Math.min(3, Math.max(2, Number(exercise?.sets || 2)))
    : Math.max(2, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(exercise?.sets || 3)));
  return {
    replacement: buildExerciseOutput(selected, user, { ...spec.slot, optional: false }, sets, rr, { weekType: String(weekType || 'base') }),
    candidateCount: ranked.length,
    topCandidateNames: ranked.slice(0, 5).map(({ candidate }) => String(candidate?.name || '')).filter(Boolean),
    rejectionReason: ''
  };
}

function shoulderLateralEquipmentBucket(exercise) {
  const required = Array.isArray(exercise?.requiredEquipment) && exercise.requiredEquipment.length
    ? exercise.requiredEquipment
    : inferRequiredEquipment(exercise);
  const normalized = normalizeEquipmentTags(required || []);
  if (normalized.includes('cable')) return 'cable';
  if (normalized.includes('dumbbell')) return 'dumbbell';
  if (normalized.includes('machine')) return 'machine';
  if (normalized.includes('bodyweight')) return 'bodyweight';
  return 'other';
}

function shoulderLateralKeepScore(exercise, user) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const name = normalizeName(exercise?.name);
  let score = 0;
  if (truth.progressionFriendly) score += 10;
  if (shoulderLateralEquipmentBucket(exercise) === 'cable') score += 6;
  if (shoulderLateralEquipmentBucket(exercise) === 'machine') score += 4;
  if (/(seated|supported|bench)/.test(name)) score += 3;
  score += Math.max(0, Number(exercise?.sets || 0));
  return score;
}

function pickPreferredLateralRaiseKeepIndexes(lateralEntries, user) {
  const entries = Array.isArray(lateralEntries) ? lateralEntries.slice() : [];
  if (entries.length <= 2) return new Set(entries.map((entry) => entry.index));
  const ranked = entries
    .map((entry) => ({
      ...entry,
      bucket: shoulderLateralEquipmentBucket(entry.exercise),
      keepScore: shoulderLateralKeepScore(entry.exercise, user)
    }))
    .sort((a, b) => (b.keepScore - a.keepScore) || a.index - b.index || String(a.exercise?.name || '').localeCompare(String(b.exercise?.name || '')));
  const keep = new Set();
  const bestCable = ranked.find((entry) => entry.bucket === 'cable');
  const bestNonCable = ranked.find((entry) => entry.bucket !== 'cable');
  if (bestCable) keep.add(bestCable.index);
  if (bestNonCable && keep.size < 2) keep.add(bestNonCable.index);
  for (const entry of ranked) {
    if (keep.size >= 2) break;
    keep.add(entry.index);
  }
  return keep;
}

function buildShoulderLateralReplacementSpecs(day, user) {
  const specs = [];
  const rearDeltCount = countExercisesByPredicate(day, (exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    return truth.rearDeltPattern;
  });
  if (rearDeltCount < 1) {
    specs.push({
      key: 'rear_delt',
      slot: buildExactPriorityRepairSlot(day?.dayType || '', 'Shoulders', 'rear'),
      predicate: (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.rearDeltPattern && !truth.lateralDeltPattern;
      }
    });
  }
  if (hasPriorityGroup(user, 'Arms')) {
    specs.push({
      key: 'arms_iso',
      slot: buildPriorityIdentitySlot(day?.dayType || '', 'Arms'),
      predicate: (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.directArmType !== 'none' && !truth.lateralDeltPattern && !truth.rearDeltPattern && !truth.shoulderPressPattern && !isCoachSideEyeAccessory(candidate, user);
      }
    });
  }
  if (hasPriorityGroup(user, 'Chest')) {
    specs.push({
      key: 'chest_accessory',
      slot: {
        id: `${String(day?.dayType || 'day').toLowerCase()}_quality_chest_accessory`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Chest',
        primaryAllowed: ['Chest'],
        subPreferred: ['Chest'],
        subFallback: null,
        optional: false
      },
      predicate: (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.primaryMuscle === 'Chest' && !isChestPressPatternName(candidate?.name);
      }
    });
  }
  specs.push({
    key: 'back_maintenance',
    slot: {
      id: `${String(day?.dayType || 'day').toLowerCase()}_quality_back_maintenance`,
      pattern: 'HorizontalPull',
      styleRequired: 'Compound',
      muscleTarget: 'Back',
      primaryAllowed: ['Back'],
      subPreferred: ['UpperBack', 'Lats-Thickness'],
      subFallback: null,
      optional: false
    },
    predicate: (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      return truth.pullRole === 'back_builder'
        && ['chest_supported', 'machine_supported', 'cable_supported', 'seated_stable'].includes(String(truth.supportType || ''))
        && !truth.lateralDeltPattern
        && !truth.rearDeltPattern;
    }
  });
  return specs.filter((spec) => spec?.slot);
}

function shoulderLateralFallbackNameBonus(categoryKey, candidateName = '') {
  const name = normalizeName(candidateName);
  if (!name) return 0;
  if (categoryKey === 'rear_delt') {
    if (/(cable rear delt fly|reverse flyes with external rotation|reverse machine flyes|reverse flyes|seated bent[-\s]*over rear delt raise|bent over dumbbell rear delt raise|face pull|rear[-\s]*delt rows?)/.test(name)) return 28;
    if (/(rear delt|reverse fly|reverse pec deck)/.test(name)) return 18;
  }
  if (categoryKey === 'arms_iso') {
    if (/(triceps pushdown|cable one arm tricep extension|seated triceps press|triceps extension|standing one[-\s]*arm cable curl|machine preacher curl|zottman curl|alternate incline dumbbell curl)/.test(name)) return 24;
    if (/(curl|triceps|pushdown|extension|preacher)/.test(name)) return 12;
  }
  if (categoryKey === 'chest_accessory') {
    if (/(single[-\s]*arm cable crossover|cable crossover|cable chest press|flat bench cable flyes|butterfly)/.test(name)) return 24;
    if (/(fly|crossover|butterfly)/.test(name)) return 12;
  }
  if (categoryKey === 'back_maintenance') {
    if (/(cable row|chest-supported row|leverage high row|v-bar pulldown|lat pulldown)/.test(name)) return 24;
    if (/(row|pulldown)/.test(name)) return 10;
  }
  return 0;
}

function buildBroadLateralReductionFallback(day, exercise, spec, user, exercises, weekType) {
  const dayWithoutCurrent = {
    ...day,
    exercises: (Array.isArray(day?.exercises) ? day.exercises : []).filter((entry) => entry !== exercise)
  };
  const existingKeys = new Set((dayWithoutCurrent.exercises || []).map((entry) => exerciseDayIdentityKey(entry)).filter(Boolean));
  const sourceExercises = getBaseEligibleExercises(exercises, user, day?.dayType || '');
  const ranked = sourceExercises
    .filter((candidate) => exerciseDayIdentityKey(candidate) !== exerciseDayIdentityKey(exercise))
    .filter((candidate) => !existingKeys.has(exerciseDayIdentityKey(candidate)))
    .filter((candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      if (truth.lateralDeltPattern || truth.shoulderPressPattern) return false;
      if (isCoachSideEyeAccessory(candidate, user)) return false;
      return typeof spec?.predicate === 'function' ? spec.predicate(candidate) : true;
    })
    .map((candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      let score = scoreExercise(candidate, spec.slot, user, day?.dayType || '')
        + qualityReplacementPreference(candidate, exercise, spec.slot, user, day?.dayType || '')
        + shoulderReplacementEquipmentOverlapBonus(candidate, exercise)
        + shoulderLateralFallbackNameBonus(spec?.key, candidate?.name);
      if (spec?.key === 'rear_delt' && truth.rearDeltPattern) score += 16;
      if (spec?.key === 'arms_iso' && truth.directArmType !== 'none') score += 14;
      if (spec?.key === 'chest_accessory' && String(truth?.primaryMuscle || '') === 'Chest' && !isChestPressPatternName(candidate?.name)) score += 14;
      if (spec?.key === 'back_maintenance' && truth.pullRole === 'back_builder') score += 14;
      return { candidate, score };
    })
    .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
  const selected = ranked[0]?.candidate || null;
  if (!selected) return null;
  const rr = repsRestByExercise(selected, String(weekType || 'base'), user, spec.slot.id);
  const sets = spec.slot.styleRequired === 'Isolation'
    ? Math.min(3, Math.max(2, Number(exercise?.sets || 2)))
    : Math.max(2, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(exercise?.sets || 3)));
  return buildExerciseOutput(selected, user, { ...spec.slot, optional: false }, sets, rr, { weekType: String(weekType || 'base') });
}

function polishLateralRaiseRedundancy(day, user, exercises, weekType) {
  if (!hasPriorityGroup(user, 'Shoulders')) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const hadShoulderPress = countExercisesByPredicate(nextDay, (exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    return truth.shoulderPressPattern;
  }) > 0;
  const hadRearDelt = countExercisesByPredicate(nextDay, (exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    return truth.rearDeltPattern;
  }) > 0;
  const lateralEntries = nextDay.exercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise }) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return truth.lateralDeltPattern;
    });
  if (lateralEntries.length <= 2) return nextDay;
  const keepIndexes = pickPreferredLateralRaiseKeepIndexes(lateralEntries, user);
  const extraIndexes = lateralEntries
    .map((entry) => entry.index)
    .filter((index) => !keepIndexes.has(index))
    .sort((a, b) => b - a);
  for (const idx of extraIndexes) {
    const current = nextDay.exercises[idx];
    if (!current) continue;
    const remainingLateralCount = countExercisesByPredicate(nextDay, (exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return truth.lateralDeltPattern;
    });
    if (remainingLateralCount <= 1) break;
    let replaced = false;
    for (const spec of buildShoulderLateralReplacementSpecs(nextDay, user)) {
      let replacement = buildQualityReplacement(nextDay, current, spec.slot, user, exercises, weekType, spec.predicate);
      if (!replacement) {
        replacement = buildBroadLateralReductionFallback(nextDay, current, spec, user, exercises, weekType);
      }
      if (!replacement) continue;
      const trialDay = {
        ...nextDay,
        exercises: nextDay.exercises.map((exercise, exerciseIndex) => exerciseIndex === idx ? replacement : exercise)
      };
      const trialNames = new Set();
      let hasDuplicate = false;
      (trialDay.exercises || []).forEach((exercise) => {
        const key = exerciseDayIdentityKey(exercise);
        if (!key) return;
        if (trialNames.has(key)) hasDuplicate = true;
        trialNames.add(key);
      });
      const trialShoulderPressCount = countExercisesByPredicate(trialDay, (exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        return truth.shoulderPressPattern;
      });
      const trialRearDeltCount = countExercisesByPredicate(trialDay, (exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        return truth.rearDeltPattern;
      });
      if (hasDuplicate) continue;
      if (hadShoulderPress && trialShoulderPressCount < 1) continue;
      if (hadRearDelt && trialRearDeltCount < 1) continue;
      nextDay.exercises.splice(idx, 1, replacement);
      replaced = true;
      break;
    }
    if (replaced) continue;
    const lateralAfterRemoval = remainingLateralCount - 1;
    const exercisesAfterRemoval = (nextDay.exercises || []).length - 1;
    const shoulderPressAfterRemoval = countExercisesByPredicate(nextDay, (exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return truth.shoulderPressPattern;
    });
    const rearDeltAfterRemoval = countExercisesByPredicate(nextDay, (exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return truth.rearDeltPattern;
    });
    if (lateralAfterRemoval >= 1
      && exercisesAfterRemoval >= 5
      && (!hadShoulderPress || shoulderPressAfterRemoval >= 1)
      && (!hadRearDelt || rearDeltAfterRemoval >= 1)
    ) {
      nextDay.exercises.splice(idx, 1);
    }
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises, user);
  return nextDay;
}

function buildNarrowIdentityReplacementSlot(day, user) {
  if (isNarrowShouldersArmsUser(user)) {
    const shoulderIsoCount = countExercisesByPredicate(day, (exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return truth.lateralDeltPattern || truth.rearDeltPattern;
    });
    return shoulderIsoCount < 1
      ? buildShoulderIsoReplacementSlot(day?.dayType || '')
      : buildPriorityIdentitySlot(day?.dayType || '', 'Arms');
  }
  if (isChestShouldersArmsUser(user)) {
    const type = String(day?.dayType || '');
    const maxChestPresses = type === 'Push' ? 2 : 1;
    const chestPressCount = countExercisesByPredicate(day, (exercise) => isChestPressPatternName(exercise?.name));
    const shoulderIsoCount = countExercisesByPredicate(day, (exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return truth.lateralDeltPattern || truth.rearDeltPattern;
    });
    if (chestPressCount >= maxChestPresses) {
      return shoulderIsoCount < 1
        ? buildShoulderIsoReplacementSlot(type)
        : buildPriorityIdentitySlot(day?.dayType || '', 'Arms');
    }
    if (chestPressCount <= 0) return buildPriorityIdentitySlot(day?.dayType || '', 'Chest');
    if (shoulderIsoCount < 1) return buildShoulderIsoReplacementSlot(type);
    return buildPriorityIdentitySlot(day?.dayType || '', 'Arms');
  }
  if (isNarrowBackArmsUser(user)) {
    const backCount = countExercisesByPredicate(day, (exercise) => exerciseDirectlyServesPriority(exercise, 'Back', user));
    return backCount <= 1
      ? buildPriorityIdentitySlot(day?.dayType || '', 'Back')
      : buildPriorityIdentitySlot(day?.dayType || '', 'Arms');
  }
  if (isNarrowChestCoreUser(user)) {
    const chestPressCount = countExercisesByPredicate(day, (exercise) => isChestPressPatternName(exercise?.name));
    const coreCount = countExercisesByPredicate(day, (exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user));
    const maxChestPresses = String(day?.dayType || '') === 'Push' ? 2 : 1;
    return (coreCount <= 0 || chestPressCount >= maxChestPresses)
      ? buildPriorityIdentitySlot(day?.dayType || '', 'Core')
      : buildPriorityIdentitySlot(day?.dayType || '', 'Chest');
  }
  if (isNarrowCoreCalvesUser(user)) {
    return buildPriorityIdentitySlot(day?.dayType || '', 'Core');
  }
  if (isGluteDominantPriorityUser(user) && ['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) {
    return buildPriorityIdentitySlot(day?.dayType || '', 'Glutes');
  }
  return null;
}

function polishNarrowPrioritySessionIdentity(day, user, exercises, weekType) {
  const type = String(day?.dayType || '');
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  let maxChestPresses = null;
  if (isNarrowShouldersArmsUser(user) && ['Push', 'Upper', 'UpperFocus', 'DeltsArms'].includes(type)) {
    maxChestPresses = type === 'DeltsArms' ? 0 : 1;
  } else if (isNarrowBackArmsUser(user) && ['Pull', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(type)) {
    maxChestPresses = 0;
  } else if (isBackShouldersArmsUser(user) && ['Push', 'Pull', 'Upper', 'UpperFocus', 'DeltsArms'].includes(type)) {
    maxChestPresses = 0;
  } else if (isChestShouldersArmsUser(user) && ['Push', 'Upper', 'UpperFocus'].includes(type)) {
    maxChestPresses = type === 'Push' ? 2 : 1;
  } else if (isNarrowChestCoreUser(user) && ['Push', 'Upper', 'UpperFocus'].includes(type)) {
    maxChestPresses = type === 'Push' ? 2 : 1;
  } else if (isNarrowCoreCalvesUser(user) && ['FullBodyA', 'FullBodyB', 'Upper', 'UpperFocus'].includes(type)) {
    maxChestPresses = 0;
  }
  if (maxChestPresses == null) return nextDay;
  const chestPressIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isChestPressPatternName(exercise?.name)) acc.push(index);
    return acc;
  }, []);
  if (chestPressIndexes.length <= maxChestPresses) return nextDay;
  for (let i = chestPressIndexes.length - 1; i >= maxChestPresses; i -= 1) {
    const idx = chestPressIndexes[i];
    const current = nextDay.exercises[idx];
    const slot = buildNarrowIdentityReplacementSlot(nextDay, user);
    if (!slot) break;
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      if (slot.muscleTarget === 'Shoulders') {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.lateralDeltPattern || truth.rearDeltPattern;
      }
      if (slot.muscleTarget === 'Back') return exerciseDirectlyServesPriority(candidate, 'Back', user);
      if (slot.muscleTarget === 'Arms') return exerciseDirectlyServesPriority(candidate, 'Arms', user) && !isCoachSideEyeAccessory(candidate, user);
      if (slot.muscleTarget === 'Core') return exerciseDirectlyServesPriority(candidate, 'Core', user);
      return exerciseDirectlyServesPriority(candidate, slot.muscleTarget, user);
    });
    if (replacement) nextDay.exercises.splice(idx, 1, replacement);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function isOffGoalMaintenanceExercise(exercise, user, dayType = '') {
  const priorities = getGoalIdentityPrioritiesForDay(dayType, user);
  if (!priorities.length) return false;
  if (priorities.some((muscle) => exerciseDirectlyServesPriority(exercise, muscle, user))) return false;
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  if (String(exercise?.style || '') === 'Isolation') return true;
  if (isUpperNarrowPriorityUser(user) && ['Push', 'Pull', 'Upper', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB'].includes(String(dayType || ''))) {
    return ['Chest', 'Back', 'Shoulders', 'Arms'].includes(String(truth.primaryMuscle || ''));
  }
  if (isLowerNarrowPriorityUser(user) && ['Lower', 'LowerFocus', 'Legs', 'FullBodyA', 'FullBodyB'].includes(String(dayType || ''))) {
    return ['Legs', 'Glutes', 'Calves'].includes(String(truth.primaryMuscle || ''));
  }
  return false;
}

function pickLeastRepresentedGoalPriority(day, user) {
  const comboOrder = getNarrowPriorityComboOrder(user, day?.dayType || '');
  if (comboOrder.length) {
    const rankedCombo = comboOrder
      .map((muscle) => ({
        muscle,
        count: countExercisesByPredicate(day, (exercise) => exerciseDirectlyServesPriority(exercise, muscle, user))
      }))
      .sort((a, b) => a.count - b.count || comboOrder.indexOf(a.muscle) - comboOrder.indexOf(b.muscle));
    return rankedCombo[0]?.muscle || null;
  }
  const priorities = getGoalIdentityPrioritiesForDay(day?.dayType || '', user);
  if (!priorities.length) return null;
  const ranked = priorities
    .map((muscle) => ({
      muscle,
      count: countExercisesByPredicate(day, (exercise) => exerciseDirectlyServesPriority(exercise, muscle, user))
    }))
    .sort((a, b) => a.count - b.count || a.muscle.localeCompare(b.muscle));
  return ranked[0]?.muscle || null;
}

function polishNarrowPriorityGoalDominance(day, user, exercises, weekType) {
  if (!isNarrowPriorityUser(user)) return day;
  const dayType = String(day?.dayType || '');
  const relevantPriorities = getGoalIdentityPrioritiesForDay(dayType, user);
  if (!relevantPriorities.length) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const directPriorityCount = countExercisesByPredicate(nextDay, (exercise) => {
    return relevantPriorities.some((muscle) => exerciseDirectlyServesPriority(exercise, muscle, user));
  });
  const offGoalCompounds = nextDay.exercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise }) => String(exercise?.style || '') === 'Compound' && isOffGoalMaintenanceExercise(exercise, user, dayType));
  const perDayCap = ['FullBodyA', 'FullBodyB'].includes(dayType) ? 1 : 0;
  const replacementBudget = Math.max(0, offGoalCompounds.length - perDayCap)
    + Math.max(0, offGoalCompounds.length - Math.max(1, directPriorityCount));
  if (!replacementBudget) return nextDay;
  let replacements = 0;
  for (const { index } of offGoalCompounds.sort((a, b) => b.index - a.index)) {
    if (replacements >= replacementBudget) break;
    const current = nextDay.exercises[index];
    const targetMuscle = pickLeastRepresentedGoalPriority(nextDay, user);
    const slot = buildPriorityIdentitySlot(dayType, targetMuscle);
    if (!slot) continue;
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      return exerciseDirectlyServesPriority(candidate, targetMuscle, user);
    });
    if (!replacement) continue;
    nextDay.exercises.splice(index, 1, replacement);
    replacements += 1;
  }
  const withComboPresence = ensureComboPresenceOnDay(nextDay, user, exercises, weekType);
  nextDay.exercises = withComboPresence.exercises;
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function polishNarrowPrioritySessionOrder(day, user) {
  if (!isNarrowPriorityUser(user)) return day;
  const comboOrder = getNarrowPriorityComboOrder(user, day?.dayType || '');
  const relevantPriorities = comboOrder.length ? comboOrder : getGoalIdentityPrioritiesForDay(day?.dayType || '', user);
  if (!relevantPriorities.length) return day;
  const isPosteriorCoreDay = isPosteriorCoreRelevantLowerDay(day?.dayType || '', user);
  const remaining = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
  const ordered = [];
  const pushFirst = (predicate) => {
    const idx = remaining.findIndex(predicate);
    if (idx >= 0) ordered.push(...remaining.splice(idx, 1));
  };
  if (isPosteriorCoreDay) {
    pushFirst((exercise) => exerciseSatisfiesDayPriorityIdentity(exercise, 'Glutes', user, day?.dayType || ''));
    pushFirst((exercise) => isMeaningfulLowerPriorityExercise(exercise, user));
    pushFirst((exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user));
  } else {
    for (const muscle of relevantPriorities.slice(0, 2)) {
      pushFirst((exercise) => exerciseDirectlyServesPriority(exercise, muscle, user));
    }
  }
  const bucketScore = (exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    let score = 0;
    relevantPriorities.forEach((muscle, index) => {
      if (exerciseDirectlyServesPriority(exercise, muscle, user)) score += index === 0 ? 40 : 30;
    });
    if (isPosteriorCoreDay && isMeaningfulLowerPriorityExercise(exercise, user)) score += 34;
    if (String(exercise?.style || '') === 'Compound') score += 8;
    if (truth.directArmSubtype !== 'none' || truth.directDeltSubtype !== 'none' || truth.coreFamily !== 'none') score += 4;
    if (isOffGoalMaintenanceExercise(exercise, user, day?.dayType || '')) score -= 30;
    return score;
  };
  remaining.sort((a, b) => {
    const scoreDiff = bucketScore(b) - bucketScore(a);
    if (scoreDiff) return scoreDiff;
    if (String(a?.style || '') !== String(b?.style || '')) return String(a?.style || '') === 'Compound' ? -1 : 1;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
  ordered.push(...remaining);
  return {
    ...day,
    exercises: ordered
  };
}

function enforceNarrowPriorityOffGoalCap(day, user) {
  const comboOrder = getNarrowPriorityComboOrder(user, day?.dayType || '');
  if (comboOrder.length !== 2) return day;
  const isPosteriorCoreDay = isPosteriorCoreRelevantLowerDay(day?.dayType || '', user);
  const source = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
  if (!source.length) return day;
  const remaining = source.slice();
  const ordered = [];
  const pullFirstPriority = (muscle) => {
    const idx = remaining.findIndex((exercise) => exerciseSatisfiesDayPriorityIdentity(exercise, muscle, user, day?.dayType || ''));
    if (idx >= 0) ordered.push(...remaining.splice(idx, 1));
  };
  pullFirstPriority(comboOrder[0]);
  if (isPosteriorCoreDay) {
    const lowerSupportIdx = remaining.findIndex((exercise) => isMeaningfulLowerPriorityExercise(exercise, user));
    if (lowerSupportIdx >= 0) ordered.push(...remaining.splice(lowerSupportIdx, 1));
  }
  pullFirstPriority(comboOrder[1]);
  const comboEstablished = comboOrder.every((muscle) => ordered.some((exercise) => exerciseSatisfiesDayPriorityIdentity(exercise, muscle, user, day?.dayType || '')));
  const directPriorityRemaining = remaining.filter((exercise) => comboOrder.some((muscle) => exerciseSatisfiesDayPriorityIdentity(exercise, muscle, user, day?.dayType || '')));
  const protectedLowerRemaining = isPosteriorCoreDay ? remaining.filter((exercise) => isMeaningfulLowerPriorityExercise(exercise, user)) : [];
  const offGoalRemaining = remaining.filter((exercise) => {
    if (comboOrder.some((muscle) => exerciseSatisfiesDayPriorityIdentity(exercise, muscle, user, day?.dayType || ''))) return false;
    if (isPosteriorCoreDay && isMeaningfulLowerPriorityExercise(exercise, user)) return false;
    return true;
  });
  directPriorityRemaining.sort((a, b) => {
    const aScore = comboOrder.reduce((sum, muscle, index) => sum + (exerciseSatisfiesDayPriorityIdentity(a, muscle, user, day?.dayType || '') ? (index === 0 ? 20 : 16) : 0), 0);
    const bScore = comboOrder.reduce((sum, muscle, index) => sum + (exerciseSatisfiesDayPriorityIdentity(b, muscle, user, day?.dayType || '') ? (index === 0 ? 20 : 16) : 0), 0);
    if (bScore !== aScore) return bScore - aScore;
    if (String(a?.style || '') !== String(b?.style || '')) return String(a?.style || '') === 'Compound' ? -1 : 1;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
  ordered.push(...directPriorityRemaining);
  if (isPosteriorCoreDay) {
    ordered.push(...protectedLowerRemaining
      .filter((exercise) => !ordered.includes(exercise))
      .sort((a, b) => {
        if (String(a?.style || '') !== String(b?.style || '')) return String(a?.style || '') === 'Compound' ? -1 : 1;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      })
      .slice(0, user?.profile?.sessionBandwidth === 'wide' ? 2 : 1));
  }
  const directPriorityCount = ordered.filter((exercise) => comboOrder.some((muscle) => exerciseSatisfiesDayPriorityIdentity(exercise, muscle, user, day?.dayType || ''))).length;
  let allowedOffGoalSlots = 0;
  if (isPosteriorCoreDay) {
    if (comboEstablished && ordered.length < 4) allowedOffGoalSlots = 1;
    else if (comboEstablished && user?.profile?.sessionBandwidth === 'wide' && ordered.length < 5) allowedOffGoalSlots = 1;
  } else if (comboEstablished && directPriorityCount < 3) {
    allowedOffGoalSlots = 1;
  } else if (comboEstablished && directPriorityCount === 3 && ordered.length < 4) {
    allowedOffGoalSlots = 1;
  }
  const keptOffGoal = offGoalRemaining
    .sort((a, b) => {
      if (String(a?.style || '') !== String(b?.style || '')) return String(a?.style || '') === 'Compound' ? -1 : 1;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    })
    .slice(0, allowedOffGoalSlots);
  ordered.push(...keptOffGoal);
  return {
    ...day,
    exercises: ordered
  };
}

function polishNarrowPriorityWeekIdentity(week, user, exercises, weekType) {
  if (!isNarrowPriorityUser(user)) return week;
  const nextWeek = {
    ...week,
    days: Array.isArray(week?.days) ? week.days.map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] })) : []
  };
  const priorities = getGoalIdentityPriorityMuscles(user);
  for (const muscle of priorities) {
    const minimumExposure = muscle === 'Core' || muscle === 'Calves'
      ? Math.min(2, Number(user?.daysPerWeek || 0))
      : Number(user?.daysPerWeek || 0) >= 4 ? 2 : 1;
    const currentExposure = nextWeek.days.filter((day) => {
      return (day?.exercises || []).some((exercise) => exerciseDirectlyServesPriority(exercise, muscle, user));
    }).length;
    if (currentExposure >= minimumExposure) continue;
    const candidateDays = nextWeek.days.filter((day) => isPriorityRelevantToDay(day?.dayType || '', muscle));
    for (const day of candidateDays) {
      if ((day?.exercises || []).some((exercise) => exerciseDirectlyServesPriority(exercise, muscle, user))) continue;
      const replaceIdx = findPriorityIdentityReplacementIndex(day, muscle, user);
      if (replaceIdx < 0) continue;
      const current = day.exercises[replaceIdx];
      const slot = buildPriorityIdentitySlot(day?.dayType || '', muscle);
      if (!slot) continue;
      const replacement = buildQualityReplacement(day, current, slot, user, exercises, weekType, (candidate) => {
        return exerciseDirectlyServesPriority(candidate, muscle, user);
      });
      if (!replacement) continue;
      day.exercises.splice(replaceIdx, 1, replacement);
      day.exercises = organizeDayExerciseOrder(day.dayType || '', day.exercises);
      break;
    }
  }
  nextWeek.days = nextWeek.days.map((day) => {
    return applyFinalNarrowPriorityDayPolish(day, user, exercises, weekType, {
      weekIndex: week?.weekIndex
    });
  });
  return nextWeek;
}

function buildCoreFamilySlot(dayType, family) {
  const dayKey = String(dayType || 'day').toLowerCase();
  if (family === 'rotation') {
    return {
      id: `${dayKey}_priority_core_rotation`,
      pattern: 'CoreRotation',
      styleRequired: 'Isolation',
      muscleTarget: 'Core',
      primaryAllowed: ['Core'],
      subPreferred: ['Obliques', 'TVA'],
      subFallback: null,
      optional: false
    };
  }
  if (family === 'stability') {
    return {
      id: `${dayKey}_priority_core_stability`,
      pattern: 'CoreStability',
      styleRequired: 'Isolation',
      muscleTarget: 'Core',
      primaryAllowed: ['Core'],
      subPreferred: ['TVA', 'LowerAbs'],
      subFallback: null,
      optional: false
    };
  }
  return {
    id: `${dayKey}_priority_core_flexion`,
    pattern: 'CoreFlexion',
    styleRequired: 'Isolation',
    muscleTarget: 'Core',
    primaryAllowed: ['Core'],
    subPreferred: ['Abs-Lower', 'Abs-Upper'],
    subFallback: null,
    optional: false
  };
}

function polishCorePriorityFamilyExpression(week, user, exercises, weekType) {
  if (!isNarrowCoreCalvesUser(user)) return week;
  const nextWeek = {
    ...week,
    days: Array.isArray(week?.days) ? week.days.map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] })) : []
  };
  const currentFamilies = new Set();
  nextWeek.days.forEach((day) => {
    (day?.exercises || []).forEach((exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      if (truth.coreFamily !== 'none') currentFamilies.add(truth.coreFamily);
    });
  });
  if (currentFamilies.size >= 2) return nextWeek;
  const missingFamilies = ['flexion', 'stability', 'rotation'].filter((family) => !currentFamilies.has(family));
  for (const family of missingFamilies) {
    for (const day of nextWeek.days) {
      const coreIdx = (day?.exercises || []).findIndex((exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        return truth.coreFamily !== 'none';
      });
      if (coreIdx < 0) continue;
      const current = day.exercises[coreIdx];
      const slot = buildCoreFamilySlot(day?.dayType || '', family);
      const replacement = buildQualityReplacement(day, current, slot, user, exercises, weekType, (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.coreFamily === family;
      });
      if (!replacement) continue;
      day.exercises.splice(coreIdx, 1, replacement);
      day.exercises = organizeDayExerciseOrder(day.dayType || '', day.exercises);
      return nextWeek;
    }
  }
  return nextWeek;
}

function findGlutePriorityReplacementIndex(day, user) {
  const priorities = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const compoundCount = exercises.filter((exercise) => String(exercise?.style || '') === 'Compound').length;
  const compoundFloor = minimumCompoundFloorForIdentity(day?.dayType || '', user, 'Glutes');
  const ranked = exercises
    .map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      if (isRealPosteriorChainBuilder(exercise, user)) return null;
      if (exerciseDirectlyServesPriority(exercise, 'Core', user) && hasPriorityGroup(priorities, 'Abs')) return null;
      if (exerciseDirectlyServesPriority(exercise, 'Calves', user) && hasPriorityGroup(priorities, 'Calves')) return null;
      if (String(exercise?.style || '') === 'Compound' && compoundCount <= compoundFloor) return null;
      let score = 0;
      if (isAssembledLowerAccessory(exercise)) score += 28;
      if (/(leg extension|leg extensions)/.test(normalizeName(exercise?.name))) score += 24;
      if (/(seated leg curl|leg curl)/.test(normalizeName(exercise?.name))) score += 18;
      if (truth.fatigueClass === 'high') score += 12;
      if (String(exercise?.style || '') === 'Isolation') score += 8;
      if (exercise?.optional) score += 6;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked[0]?.index ?? -1;
}

function polishGlutePriorityExpression(day, user, exercises, weekType) {
  if (!isGluteDominantPriorityUser(user)) return day;
  if (!['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const targetGluteCount = isLowerBodyGracefulDegradeApplied(user)
    ? 1
    : (['LowerFocus', 'Legs'].includes(String(day?.dayType || '')) ? 2 : 1);
  let gluteCount = nextDay.exercises.filter((exercise) => {
    return isRealPosteriorChainBuilder(exercise, user);
  }).length;
  while (gluteCount < targetGluteCount) {
    bumpLowerBodyRepairLoopGuard(user, 'glutePriority', {
      functionName: 'polishGlutePriorityExpression',
      day: nextDay?.day,
      dayType: nextDay?.dayType,
      lastAttemptedRepair: 'replace-with-glute-builder',
      missingRequirement: 'glute posterior-chain bias'
    });
    const replaceIdx = findGlutePriorityReplacementIndex(nextDay, user);
    if (replaceIdx < 0) break;
    const current = nextDay.exercises[replaceIdx];
    const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', 'Glutes');
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      return isRealPosteriorChainBuilder(candidate, user)
        && (truth.fatigueClass !== 'high' || truth.controlledHingeAllowed);
    });
    if (!replacement) break;
    nextDay.exercises.splice(replaceIdx, 1, replacement);
    gluteCount += 1;
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function chooseUpperRedundancyReplacementSlot(day, exercise, user) {
  const priorities = new Set(Array.isArray(user?.priorityGroups) ? user.priorityGroups : []);
  const hasShoulderPriority = priorities.has('Shoulders');
  const hasArmPriority = priorities.has('Arms');
  const type = String(day?.dayType || '');
  const currentIsChestPress = isChestPressPatternName(exercise?.name);
  const chestPressCount = countExercisesByPredicate(day, (entry) => isChestPressPatternName(entry?.name));
  const shoulderDirectCount = countExercisesByPredicate(day, (entry) => {
    const truth = entry?.canonicalTruth || buildExerciseTruth(entry, user);
    return truth.lateralDeltPattern || truth.rearDeltPattern || truth.shoulderPressPattern;
  });
  const shoulderIsoCount = countExercisesByPredicate(day, (entry) => {
    const truth = entry?.canonicalTruth || buildExerciseTruth(entry, user);
    return truth.lateralDeltPattern || truth.rearDeltPattern;
  });
  const armDirectCount = countExercisesByPredicate(day, (entry) => exerciseDirectlyServesPriority(entry, 'Arms', user) && !isCoachSideEyeAccessory(entry, user));
  if (isNarrowChestCoreUser(user)) {
    return buildPriorityIdentitySlot(day?.dayType || '', 'Core');
  }
  if (isChestShouldersArmsUser(user)) {
    const maxChestPresses = type === 'Push' ? 2 : 1;
    if (currentIsChestPress && chestPressCount >= maxChestPresses) {
      if (shoulderIsoCount < 1) return buildShoulderIsoReplacementSlot(type);
      return buildPriorityIdentitySlot(day?.dayType || '', 'Arms');
    }
    if (shoulderIsoCount < 1) return buildShoulderIsoReplacementSlot(type);
    return buildPriorityIdentitySlot(day?.dayType || '', 'Arms');
  }
  if (String(day?.dayType || '') === 'DeltsArms' || hasShoulderPriority) {
    return buildShoulderIsoReplacementSlot(type);
  }
  if (hasArmPriority) {
    return {
      id: `${String(day?.dayType || 'day').toLowerCase()}_quality_arm_iso`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Arms',
      primaryAllowed: ['Arms'],
      subPreferred: currentIsChestPress ? ['Triceps-Long', 'Triceps-Lateral'] : ['Biceps-Long', 'Biceps-Short', 'Triceps-Long'],
      subFallback: null,
      optional: false
    };
  }
  return {
    id: `${String(day?.dayType || 'day').toLowerCase()}_quality_shoulder_iso`,
    pattern: 'Isolation',
    styleRequired: 'Isolation',
    muscleTarget: 'Shoulders',
    primaryAllowed: ['Shoulders'],
    subPreferred: ['Lateral', 'Rear'],
    subFallback: null,
    optional: false
  };
}

function polishUpperPressRedundancy(day, user, exercises, weekType) {
  if (!['Push', 'Upper', 'UpperFocus', 'DeltsArms'].includes(String(day?.dayType || ''))) return day;
  const priorities = new Set(Array.isArray(user?.priorityGroups) ? user.priorityGroups : []);
  const upperPriorityCount = ['Chest', 'Shoulders', 'Arms'].filter((group) => priorities.has(group)).length;
  if (upperPriorityCount < 2 && String(day?.dayType || '') !== 'DeltsArms') return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const pressIndexes = [];
  nextDay.exercises.forEach((exercise, index) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    if (truth.shoulderPressPattern || isChestPressPatternName(exercise?.name)) pressIndexes.push(index);
  });
  let targetPressCount = String(day?.dayType || '') === 'DeltsArms' ? 1 : 2;
  if (isNarrowShouldersArmsUser(user)) targetPressCount = 1;
  else if (isNarrowChestCoreUser(user)) targetPressCount = String(day?.dayType || '') === 'Push' ? 2 : 1;
  else if (isChestShouldersArmsUser(user)) targetPressCount = String(day?.dayType || '') === 'Push' ? 2 : 1;
  if (pressIndexes.length <= targetPressCount) return nextDay;
  for (let i = pressIndexes.length - 1; i >= targetPressCount; i -= 1) {
    const idx = pressIndexes[i];
    const current = nextDay.exercises[idx];
    const slot = chooseUpperRedundancyReplacementSlot(nextDay, current, user);
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      if (slot.muscleTarget === 'Shoulders') return truth.lateralDeltPattern || truth.rearDeltPattern;
      if (slot.muscleTarget === 'Arms') return truth.directArmType !== 'none';
      return true;
    });
    if (replacement) {
      nextDay.exercises.splice(idx, 1, replacement);
      continue;
    }
    const shoulderDirectCount = countExercisesByPredicate(nextDay, (exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return truth.lateralDeltPattern || truth.rearDeltPattern || truth.shoulderPressPattern;
    });
    const armDirectCount = countExercisesByPredicate(nextDay, (exercise) => exerciseDirectlyServesPriority(exercise, 'Arms', user) && !isCoachSideEyeAccessory(exercise, user));
    if ((isNarrowShouldersArmsUser(user) || isNarrowChestCoreUser(user) || isChestShouldersArmsUser(user)) && shoulderDirectCount >= 2 && (armDirectCount >= 1 || nextDay.exercises.length > 4)) {
      nextDay.exercises.splice(idx, 1);
    }
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function polishDuplicateShoulderPresses(day, user, exercises, weekType) {
  if (!hasPriorityGroup(user, 'Shoulders')) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const pressIndexes = [];
  nextDay.exercises.forEach((exercise, index) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    if (truth.shoulderPressPattern) pressIndexes.push(index);
  });
  try {
    console.info('[training-debug][shoulder-priority][builder] before_shoulder_press_cleanup_day_snapshot', buildShoulderPressCleanupDaySnapshot(nextDay, user));
    console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_cleanup_entry', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null,
      shoulderPressCount: pressIndexes.length
    });
    console.info('[training-debug][shoulder-priority][builder] detected_shoulder_press_names', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null,
      names: pressIndexes.map((index) => String(nextDay.exercises?.[index]?.name || '')).filter(Boolean)
    });
  } catch {
    // ignore logging failures
  }
  if (pressIndexes.length <= 1) {
    try {
      console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_skip', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        reason: 'no_duplicate_presses'
      });
      console.info('[training-debug][shoulder-priority][builder] after_shoulder_press_cleanup_day_snapshot', buildShoulderPressCleanupDaySnapshot(nextDay, user));
    } catch {
      // ignore logging failures
    }
    return nextDay;
  }
  for (let i = 1; i < pressIndexes.length; i += 1) {
    const idx = pressIndexes[i];
    const current = nextDay.exercises[idx];
    const currentTruth = current?.canonicalTruth || buildExerciseTruth(current, user);
    if (!currentTruth?.shoulderPressPattern) {
      try {
        console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_skip', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          exerciseIndex: idx,
          exerciseName: current?.name || null,
          reason: 'second_press_not_classified'
        });
      } catch {
        // ignore logging failures
      }
      continue;
    }
    try {
      console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_detected', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        exerciseIndex: idx,
        exerciseName: current?.name || null
      });
    } catch {
      // ignore logging failures
    }
    const replacementSpecs = [
      ...buildShoulderPressDuplicateReplacementSpecs(nextDay?.dayType || '', user)
    ];
    let replacement = null;
    let replacementKey = '';
    for (const spec of replacementSpecs) {
      const candidate = buildQualityReplacement(
        nextDay,
        current,
        spec.slot,
        user,
        exercises,
        weekType,
        spec.predicate
      );
      try {
        const candidateTruth = candidate?.canonicalTruth || (candidate ? buildExerciseTruth(candidate, user) : null);
        console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_replacement_attempt', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          exerciseIndex: idx,
          exerciseName: current?.name || null,
          replacementKey: spec.key,
          replacementName: candidate?.name || null,
          replacementShoulderPressPattern: Boolean(candidateTruth?.shoulderPressPattern),
          replacementLateralDeltPattern: Boolean(candidateTruth?.lateralDeltPattern),
          replacementRearDeltPattern: Boolean(candidateTruth?.rearDeltPattern)
        });
      } catch {
        // ignore logging failures
      }
      if (candidate) {
        replacement = candidate;
        replacementKey = spec.key;
        break;
      }
    }
    if (!replacement) {
      for (const spec of replacementSpecs) {
        const fallback = buildFallbackShoulderIsolationReplacement(
          nextDay,
          current,
          spec,
          user,
          exercises,
          weekType
        );
        try {
          console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_fallback_pool', {
            day: nextDay?.day || null,
            dayType: nextDay?.dayType || null,
            exerciseIndex: idx,
            exerciseName: current?.name || null,
            replacementKey: spec.key,
            candidateCount: Number(fallback?.candidateCount || 0),
            topCandidateNames: Array.isArray(fallback?.topCandidateNames) ? fallback.topCandidateNames : [],
            replacementName: fallback?.replacement?.name || null,
            rejectionReason: fallback?.rejectionReason || ''
          });
        } catch {
          // ignore logging failures
        }
        if (fallback?.replacement) {
          replacement = fallback.replacement;
          replacementKey = `${spec.key}_fallback`;
          break;
        }
      }
    }
    if (replacement) {
      nextDay.exercises.splice(idx, 1, replacement);
      try {
        console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_swap', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          exerciseIndex: idx,
          removedExercise: current?.name || null,
          replacementExercise: replacement?.name || null,
          replacementKey
        });
      } catch {
        // ignore logging failures
      }
      continue;
    }
    try {
      console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_skip', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        exerciseIndex: idx,
        exerciseName: current?.name || null,
        reason: 'no_safe_shoulder_isolation_replacement'
      });
    } catch {
      // ignore logging failures
    }
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  try {
    console.info('[training-debug][shoulder-priority][builder] shoulder_press_duplicate_exit', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null,
      shoulderPressCount: nextDay.exercises.filter((exercise) => {
        const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
        return truth.shoulderPressPattern;
      }).length,
      exercises: nextDay.exercises.map((exercise) => String(exercise?.name || ''))
    });
    console.info('[training-debug][shoulder-priority][builder] after_shoulder_press_cleanup_day_snapshot', buildShoulderPressCleanupDaySnapshot(nextDay, user));
  } catch {
    // ignore logging failures
  }
  return nextDay;
}

function polishChestPressRedundancy(day, user, exercises, weekType) {
  const type = String(day?.dayType || '');
  if (!['Push', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(type)) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const chestPressIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isChestPressPatternName(exercise?.name)) acc.push(index);
    return acc;
  }, []);
  let maxChestPresses = 2;
  if (isNarrowShouldersArmsUser(user)) maxChestPresses = ['FullBodyA', 'FullBodyB'].includes(type) ? 1 : 0;
  else if (isNarrowBackArmsUser(user)) maxChestPresses = 0;
  else if (isBackShouldersArmsUser(user)) maxChestPresses = 0;
  else if (isChestShouldersArmsUser(user)) maxChestPresses = type === 'Push' ? 2 : 1;
  else if (isNarrowChestCoreUser(user)) maxChestPresses = type === 'Push' ? 2 : 1;
  if (chestPressIndexes.length <= maxChestPresses) return nextDay;
  for (let i = chestPressIndexes.length - 1; i >= maxChestPresses; i -= 1) {
    const idx = chestPressIndexes[i];
    const current = nextDay.exercises[idx];
    const slot = buildNarrowIdentityReplacementSlot(nextDay, user)
      || buildPriorityIdentitySlot(nextDay?.dayType || '', 'Shoulders')
      || buildPriorityIdentitySlot(nextDay?.dayType || '', 'Arms');
    if (!slot) break;
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      if (slot.muscleTarget === 'Shoulders') {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.lateralDeltPattern || truth.rearDeltPattern;
      }
      if (slot.muscleTarget === 'Arms') return exerciseDirectlyServesPriority(candidate, 'Arms', user) && !isCoachSideEyeAccessory(candidate, user);
      if (slot.muscleTarget === 'Back') return exerciseDirectlyServesPriority(candidate, 'Back', user);
      if (slot.muscleTarget === 'Core') return exerciseDirectlyServesPriority(candidate, 'Core', user);
      return true;
    });
    if (replacement) nextDay.exercises.splice(idx, 1, replacement);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function polishBackBuilderSupport(day, user, exercises, weekType) {
  if (!(user?.priorityGroups || []).includes('Back')) return day;
  const type = String(day?.dayType || '');
  if (!['Pull', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(type)) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const unsupportedIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (String(exercise?.pullRole || '') === 'back_builder' && String(exercise?.supportType || '') === 'unsupported') acc.push(index);
    return acc;
  }, []);
  if (!unsupportedIndexes.length) return nextDay;
  for (const idx of unsupportedIndexes) {
    const current = nextDay.exercises[idx];
    const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', 'Back')
      || {
        id: `${type.toLowerCase()}_quality_back_support`,
        pattern: 'HorizontalPull',
        styleRequired: 'Compound',
        muscleTarget: 'Back',
        primaryAllowed: ['Back'],
        subPreferred: ['Lats-Thickness', 'UpperBack'],
        subFallback: null,
        optional: false
      };
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      return truth.pullRole === 'back_builder' && ['chest_supported', 'machine_supported', 'cable_supported', 'seated_stable'].includes(String(truth.supportType || ''));
    });
    if (replacement) nextDay.exercises.splice(idx, 1, replacement);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function hasDirectPriorityVolume(day, muscle, user, minimum = 2) {
  const count = countExercisesByPredicate(day, (exercise) => exerciseDirectlyServesPriority(exercise, muscle, user));
  return count >= minimum;
}

function polishBackDominantChestLeak(day, user, exercises, weekType) {
  const type = String(day?.dayType || '');
  const backDominant = isNarrowBackArmsUser(user) || isBackShouldersArmsUser(user);
  if (!backDominant) return day;
  if (!['Push', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(type)) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const chestPressIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isChestPressPatternName(exercise?.name)) acc.push(index);
    return acc;
  }, []);
  if (!chestPressIndexes.length) return nextDay;
  for (let i = chestPressIndexes.length - 1; i >= 0; i -= 1) {
    const idx = chestPressIndexes[i];
    const current = nextDay.exercises[idx];
    const replacementSlots = [
      buildPriorityIdentitySlot(nextDay?.dayType || '', 'Shoulders'),
      buildPriorityIdentitySlot(nextDay?.dayType || '', 'Arms')
    ].filter(Boolean);
    let replacement = null;
    for (const slot of replacementSlots) {
      replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        if (slot.muscleTarget === 'Shoulders') return truth.lateralDeltPattern || truth.rearDeltPattern || truth.shoulderPressPattern;
        if (slot.muscleTarget === 'Arms') return exerciseDirectlyServesPriority(candidate, 'Arms', user) && !isCoachSideEyeAccessory(candidate, user);
        return false;
      });
      if (replacement) break;
    }
    if (replacement) {
      nextDay.exercises.splice(idx, 1, replacement);
      continue;
    }
    const shoulderReady = hasDirectPriorityVolume(nextDay, 'Shoulders', user, 2);
    const armReady = hasDirectPriorityVolume(nextDay, 'Arms', user, 2);
    if ((shoulderReady || armReady) && nextDay.exercises.length > 4) nextDay.exercises.splice(idx, 1);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function isHipDominantQualityExercise(exercise) {
  const name = normalizeName(exercise?.name);
  return /(romanian deadlift|\brdl\b|stiff[-\s]*leg|hip thrust|glute bridge)/.test(name);
}

function isPosteriorChainFatigueExercise(exercise) {
  const name = normalizeName(exercise?.name);
  return isHipDominantQualityExercise(exercise) || /(glute ham raise|back extension|hyperextension)/.test(name);
}

function isAssembledLowerAccessory(exercise) {
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  return /(thigh adductor|thigh abductor|abductor|adductor|kickback)/.test(name);
}

function isCoachCleanupLowerCandidate(exercise) {
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  if (isAssembledLowerAccessory(exercise)) return true;
  if (/\bchair squat\b/.test(name)) return true;
  return false;
}

function hasSafePowerbuildingPosteriorSubstitute(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const normalized = normalizeName(exercise?.name);
  if (!normalized) return false;
  if (/(deadlift|romanian deadlift|\brdl\b|stiff[-\s]*leg|good morning)/.test(normalized)) return false;
  if (/(hip thrust|glute bridge|pull through|pull-through|glute ham raise|seated leg curl|lying leg curl|leg curl|hamstring curl|back extension|hyperextension)/.test(normalized)) {
    return truth.progressionFriendly || truth.controlledHingeAllowed || truth.directHamstring;
  }
  return false;
}

function buildLowerCoachCleanupStructuralResult(day, user = null) {
  const dayTypeRaw = String(day?.dayType || '');
  const dayType = dayTypeRaw.toLowerCase();
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const names = [];
  const duplicates = [];
  let hasInvalidExercise = false;
  let hasHinge = false;
  let hasQuadPattern = false;
  let hasSafePosteriorSubstitute = false;
  for (const exercise of exercises) {
    const normalized = normalizeName(exercise?.name);
    if (!normalized) {
      hasInvalidExercise = true;
      continue;
    }
    if (names.includes(normalized)) duplicates.push(String(exercise?.name || normalized));
    else names.push(normalized);
    if (/(deadlift|romanian deadlift|\brdl\b|hip thrust|glute bridge|good morning|back extension|hyperextension)/.test(normalized) && !/(axle|log|yoke|stone|sandbag|single)/.test(normalized)) {
      hasHinge = true;
    }
    if (hasSafePowerbuildingPosteriorSubstitute(exercise, user)) hasSafePosteriorSubstitute = true;
    if ((/(hack squat|leg press|front squat|barbell full squat|back squat|smith squat|squat)/.test(normalized)
      && !/(kneeling|overhead|frankenstein|chair|plie|side split|one leg|single leg|sissy|box squat|speed|split squat|lunge|step up)/.test(normalized))
      || isLowerCoachCleanupLegExtensionPatternName(normalized)
      || /(lunge|split squat|step up)/.test(normalized)) {
      hasQuadPattern = true;
    }
  }
  if (hasInvalidExercise) {
    return {
      ok: false,
      missingRequirement: 'invalid_lower_day_exercise_object',
      reason: 'Lower day contains an invalid or unnamed exercise.',
      duplicates
    };
  }
  if (duplicates.length) {
    return {
      ok: false,
      missingRequirement: 'duplicate_exercise_names',
      reason: 'Lower day contains duplicate exercise names.',
      duplicates
    };
  }
  const relaxedPosteriorAllowed = allowPowerbuildingPosteriorSubstitute(dayTypeRaw, user);
  const relaxedQuadAllowed = allowPowerbuildingNonSquatLower(dayTypeRaw, user);
  if ((dayType === 'lower' || dayType === 'lowerfocus') && !hasHinge && !(relaxedPosteriorAllowed && hasSafePosteriorSubstitute)) {
    return {
      ok: false,
      missingRequirement: 'missing_hinge_pattern',
      reason: 'Lower day must include one hinge pattern.',
      duplicates
    };
  }
  if ((dayType === 'lower' || dayType === 'lowerfocus') && !hasQuadPattern && !relaxedQuadAllowed) {
    return {
      ok: false,
      missingRequirement: 'missing_quad_pattern',
      reason: 'Lower day must include at least one quad pattern.',
      duplicates
    };
  }
  return {
    ok: true,
    missingRequirement: '',
    reason: '',
    duplicates
  };
}

function lowerCoachCleanupFamilyLabel(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const normalized = normalizeName(exercise?.name);
  if (!normalized) return 'invalid';
  if (countLowerCoachCleanupQuadPatterns([exercise], user) > 0) return 'squat_leg_press';
  if (isLowerCoachCleanupHingeCandidate(exercise, user)) return 'hinge_posterior_chain';
  if (truth.directCalf) return 'calves';
  if (truth.directAb) return 'core';
  if (/(leg curl|hamstring curl|glute ham raise)/.test(normalized)) return 'hamstring_curl';
  if (String(truth?.directArmType || '') === 'biceps') return 'biceps_iso';
  if (String(truth?.directArmType || '') === 'triceps') return 'triceps_iso';
  if (String(truth?.directShoulderHead || '') === 'rear') return 'rear_delt_iso';
  return String(truth?.primaryMuscle || truth?.movementPattern || 'other') || 'other';
}

function buildLowerCoachCleanupExerciseSnapshot(exercises, user = null) {
  return (Array.isArray(exercises) ? exercises : []).map((exercise) => ({
    name: String(exercise?.name || '').trim(),
    family: lowerCoachCleanupFamilyLabel(exercise, user)
  }));
}

function diagnoseLowerCoachCleanupQuadRepair(day, user, exercises, weekType) {
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const cleanupIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isCoachCleanupLowerCandidate(exercise)) acc.push(index);
    return acc;
  }, []);
  const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', 'Legs');
  if (!slot) {
    return {
      safeQuadReplacementAvailable: false,
      attempted: [],
      failureReason: 'missing_legs_slot'
    };
  }
  const attempted = [];
  for (let i = cleanupIndexes.length - 1; i >= 0; i -= 1) {
    const idx = cleanupIndexes[i];
    const current = nextDay.exercises[idx];
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      return exerciseDirectlyServesPriority(candidate, 'Legs', user) && truth.progressionFriendly && !isCoachCleanupLowerCandidate(candidate);
    });
    if (!replacement) {
      attempted.push({
        replacedExercise: String(current?.name || '').trim(),
        replacement: null,
        repairedOk: false,
        reason: 'no_candidate'
      });
      continue;
    }
    const trialDay = {
      ...nextDay,
      exercises: nextDay.exercises.map((exercise, exerciseIndex) => (exerciseIndex === idx ? replacement : exercise))
    };
    trialDay.exercises = organizeDayExerciseOrder(trialDay.dayType || '', trialDay.exercises);
    const structure = buildLowerCoachCleanupStructuralResult(trialDay, user);
    attempted.push({
      replacedExercise: String(current?.name || '').trim(),
      replacement: String(replacement?.name || '').trim(),
      repairedOk: Boolean(structure.ok),
      reason: structure.ok ? 'safe_quad_repair_found' : String(structure.missingRequirement || 'invalid_lower_day_structure')
    });
    if (structure.ok) {
      return {
        safeQuadReplacementAvailable: true,
        attempted,
        failureReason: 'safe_quad_repair_found'
      };
    }
  }
  return {
    safeQuadReplacementAvailable: false,
    attempted,
    failureReason: attempted.length ? 'repair_candidates_rejected' : 'no_cleanup_candidates'
  };
}

function buildLowerCoachCleanupStructuralError(user, day, result, meta = {}) {
  const structure = result && typeof result === 'object' ? result : {};
  return {
    error: 'PLAN_BUILD_FAILED',
    message: String(structure.reason || 'Lower day failed structural validation.'),
    reason: String(structure.reason || 'Lower day failed structural validation.'),
    functionName: 'polishLowerCoachCleanup',
    stage: 'lowerCoachCleanup',
    failedStage: 'lowerCoachCleanup',
    week: Number(meta?.weekIndex || 0) || undefined,
    day: String(day?.day || '').trim() || undefined,
    dayType: String(day?.dayType || '').trim() || undefined,
    missingRequirement: String(structure.missingRequirement || 'invalid_lower_day_structure'),
    duplicates: Array.isArray(structure.duplicates) ? structure.duplicates.slice() : undefined,
    priorityGroups: Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : undefined,
    exerciseNames: Array.isArray(meta?.finalExerciseNames) ? meta.finalExerciseNames.slice() : undefined,
    lowerExerciseFamilies: Array.isArray(meta?.finalExerciseFamilies) ? meta.finalExerciseFamilies.slice() : undefined,
    quadPatternExistedBeforeCleanup: typeof meta?.quadPatternExistedBeforeCleanup === 'boolean' ? meta.quadPatternExistedBeforeCleanup : undefined,
    initialQuadPatternCount: Number.isFinite(Number(meta?.initialQuadPatternCount)) ? Number(meta.initialQuadPatternCount) : undefined,
    finalQuadPatternCount: Number.isFinite(Number(meta?.finalQuadPatternCount)) ? Number(meta.finalQuadPatternCount) : undefined,
    cleanupRemovedOnlyQuadPattern: typeof meta?.cleanupRemovedOnlyQuadPattern === 'boolean' ? meta.cleanupRemovedOnlyQuadPattern : undefined,
    cleanupTouchedDay: typeof meta?.cleanupTouchedDay === 'boolean' ? meta.cleanupTouchedDay : undefined,
    cleanupTouchedPasses: Array.isArray(meta?.cleanupTouchedPasses) ? meta.cleanupTouchedPasses.slice() : undefined,
    cleanupActionLog: Array.isArray(meta?.cleanupActionLog) ? meta.cleanupActionLog.slice() : undefined,
    initialExerciseNames: Array.isArray(meta?.initialExerciseNames) ? meta.initialExerciseNames.slice() : undefined,
    initialExerciseFamilies: Array.isArray(meta?.initialExerciseFamilies) ? meta.initialExerciseFamilies.slice() : undefined,
    missingQuadPatternOrigin: meta?.missingQuadPatternOrigin ? String(meta.missingQuadPatternOrigin) : undefined,
    safeQuadReplacementAvailable: typeof meta?.safeQuadReplacementAvailable === 'boolean' ? meta.safeQuadReplacementAvailable : undefined,
    quadRepairAttempted: Array.isArray(meta?.quadRepairAttempted) ? meta.quadRepairAttempted.slice() : undefined,
    quadRepairFailureReason: meta?.quadRepairFailureReason ? String(meta.quadRepairFailureReason) : undefined
  };
}

function buildLowerFatigueStructuralError(user, day, result) {
  const structure = result && typeof result === 'object' ? result : {};
  return {
    error: 'PLAN_BUILD_FAILED',
    message: String(structure.reason || 'Lower day failed structural validation.'),
    reason: String(structure.reason || 'Lower day failed structural validation.'),
    functionName: 'polishLowerFatigueStacking',
    stage: 'lowerFatigue',
    failedStage: 'lowerFatigue',
    day: String(day?.day || '').trim() || undefined,
    dayType: String(day?.dayType || '').trim() || undefined,
    missingRequirement: String(structure.missingRequirement || 'invalid_lower_day_structure'),
    duplicates: Array.isArray(structure.duplicates) ? structure.duplicates.slice() : undefined,
    priorityGroups: Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : undefined
  };
}

function isLowerCoachCleanupHingeCandidate(exercise, user = null) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  if (/(axle|log|yoke|stone|sandbag|single)/.test(name)) return false;
  if (/(deadlift|romanian deadlift|\brdl\b|hip thrust|glute bridge|good morning|pull through|pull-through|back extension|hyperextension)/.test(name)) return true;
  return String(truth?.movementPattern || '') === 'hinge_pattern';
}

function isLowerCoachCleanupLegExtensionPatternName(normalizedName) {
  const name = normalizeName(normalizedName);
  if (!name) return false;
  return /(?:^|[\s-])(single leg|single-leg|machine|cable)?[\s-]*leg extension(?:s)?(?:$|[\s-])/.test(` ${name} `);
}

function countLowerCoachCleanupQuadPatterns(exercises, user = null) {
  return (Array.isArray(exercises) ? exercises : []).filter((exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    const normalized = normalizeName(exercise?.name);
    if (!normalized) return false;
    if (truth.primaryMuscle === 'Legs' && ['squat', 'lunge'].includes(String(truth.movementFamily || ''))) return true;
    return ((/(hack squat|leg press|front squat|barbell full squat|back squat|smith squat|squat)/.test(normalized)
      && !/(kneeling|overhead|frankenstein|chair|plie|side split|one leg|single leg|sissy|box squat|speed|split squat|lunge|step up)/.test(normalized))
      || isLowerCoachCleanupLegExtensionPatternName(normalized)
      || /(lunge|split squat|step up)/.test(normalized));
  }).length;
}

function findLowerCoachCleanupHingeReplacementIndex(day, user, { absPriority = false } = {}) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const quadCount = countLowerCoachCleanupQuadPatterns(exercises, user);
  const ranked = exercises
    .map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      const name = normalizeName(exercise?.name);
      if (!name || isLowerCoachCleanupHingeCandidate(exercise, user)) return null;
      let score = -1000;
      const isQuadPattern = ((truth.primaryMuscle === 'Legs' && ['squat', 'lunge'].includes(String(truth.movementFamily || '')))
        || isLowerCoachCleanupLegExtensionPatternName(name)
        || /(leg press|hack squat|split squat|lunge|step[\s-]*up|squat)/.test(name));
      if (isQuadPattern && quadCount <= 1) return null;
      if (isCoachCleanupLowerCandidate(exercise)) score = 50;
      else if (truth.directCalf) score = 40;
      else if (truth.directAb) score = absPriority ? -100 : 8;
      else if (String(exercise?.style || '') === 'Isolation' && !exerciseDirectlyServesPriority(exercise, 'Legs', user)) score = 30;
      else if (String(exercise?.style || '') === 'Isolation') score = 18;
      else if (!exerciseDirectlyServesPriority(exercise, 'Legs', user) && !isRealPosteriorChainBuilder(exercise, user)) score = 14;
      if (isRealPosteriorChainBuilder(exercise, user) && !/(glute ham raise|seated leg curl|lying leg curl|leg curl|hamstring curl)/.test(name)) score = -100;
      if (score <= -100) return null;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked[0]?.index ?? -1;
}

function findLowerCoachCleanupPosteriorReplacementIndex(day, user) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const ranked = exercises
    .map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      const name = normalizeName(exercise?.name);
      if (!name || hasSafePowerbuildingPosteriorSubstitute(exercise, user)) return null;
      let score = -1000;
      if (isCoachCleanupLowerCandidate(exercise)) score = 60;
      else if (truth.directCalf) score = 40;
      else if (truth.directAb) score = 24;
      else if (String(exercise?.style || '') === 'Isolation') score = 18;
      else score = 10;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked[0]?.index ?? -1;
}

function findLowerCoachCleanupQuadReplacementIndex(day, user) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const posteriorCount = exercises.filter((exercise) => isLowerCoachCleanupHingeCandidate(exercise, user) || hasSafePowerbuildingPosteriorSubstitute(exercise, user)).length;
  const ranked = exercises
    .map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      const name = normalizeName(exercise?.name);
      if (!name) return null;
      if (countLowerCoachCleanupQuadPatterns([exercise], user) > 0) return null;
      let score = -1000;
      if (isCoachCleanupLowerCandidate(exercise)) score = 70;
      else if (truth.directCalf) score = 42;
      else if (truth.directAb) score = 26;
      else if (String(exercise?.style || '') === 'Isolation' && !exerciseDirectlyServesPriority(exercise, 'Legs', user)) score = 34;
      else if (String(exercise?.style || '') === 'Isolation') score = 18;
      else if (isLowerCoachCleanupHingeCandidate(exercise, user) || hasSafePowerbuildingPosteriorSubstitute(exercise, user)) score = posteriorCount > 1 ? 24 : -100;
      else score = 12;
      if (score <= -100) return null;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked[0]?.index ?? -1;
}

function attemptLowerCoachCleanupPosteriorSubstituteRepair(day, user, exercises, weekType) {
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const replacementSlots = [
    {
      id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_glute_support`,
      pattern: 'Hinge',
      styleRequired: 'Compound',
      muscleTarget: 'Glutes',
      primaryAllowed: ['Glutes', 'Legs'],
      subPreferred: ['Glutes', 'Hamstrings-Hinge'],
      subFallback: null,
      optional: false
    },
    {
      id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_hamstring_support`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Legs',
      primaryAllowed: ['Legs'],
      subPreferred: ['Hamstrings-Curl'],
      subFallback: null,
      optional: false
    }
  ];
  const rejectionReasons = [];
  let availableCandidates = 0;
  for (const slot of replacementSlots) {
    const replaceIdx = findLowerCoachCleanupPosteriorReplacementIndex(nextDay, user);
    const current = replaceIdx >= 0
      ? nextDay.exercises[replaceIdx]
      : { sets: 2, style: slot.styleRequired, slotId: slot.id, primary: slot.muscleTarget, muscleTarget: slot.muscleTarget };
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      if (!hasSafePowerbuildingPosteriorSubstitute(candidate, user)) return false;
      if (String(slot.styleRequired || '') === 'Isolation') return String(candidate?.style || '') === 'Isolation';
      return truth.progressionFriendly || truth.controlledHingeAllowed;
    });
    if (!replacement) {
      rejectionReasons.push(`no_posterior_candidate_for_${String(slot.muscleTarget || '').toLowerCase()}`);
      continue;
    }
    availableCandidates += 1;
    if (replaceIdx >= 0) nextDay.exercises.splice(replaceIdx, 1, replacement);
    else if ((nextDay.exercises || []).length < Number(user?.sessionCap || 0)) nextDay.exercises.push(replacement);
    else {
      rejectionReasons.push(`session_cap_blocked_${String(slot.muscleTarget || '').toLowerCase()}`);
      continue;
    }
    nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
    const repairedStructure = buildLowerCoachCleanupStructuralResult(nextDay, user);
    if (repairedStructure.ok) {
      return {
        repaired: true,
        day: nextDay,
        availableHingeCandidatesCount: availableCandidates,
        rejectionReasons
      };
    }
    rejectionReasons.push(repairedStructure.missingRequirement || `invalid_posterior_repair_${String(slot.muscleTarget || '').toLowerCase()}`);
  }
  return {
    repaired: false,
    day,
    availableHingeCandidatesCount: availableCandidates,
    rejectionReasons
  };
}

function attemptLowerCoachCleanupHingeRepair(day, user, exercises, weekType) {
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const priorities = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
  const absPriority = priorities.includes('Abs') || priorities.includes('Core');
  const slotOrder = (priorities.includes('Glutes') || priorities.includes('Hamstrings/Glutes'))
    ? ['Glutes', 'Legs']
    : ['Legs', 'Glutes'];
  const rejectionReasons = [];
  let availableHingeCandidatesCount = 0;

  for (const muscle of slotOrder) {
    const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', muscle);
    if (!slot) {
      rejectionReasons.push(`missing_slot_${String(muscle || '').toLowerCase()}`);
      continue;
    }
    const replaceIdx = findLowerCoachCleanupHingeReplacementIndex(nextDay, user, { absPriority });
    const current = replaceIdx >= 0
      ? nextDay.exercises[replaceIdx]
      : { sets: 2, style: slot.styleRequired, slotId: slot.id, primary: slot.muscleTarget, muscleTarget: slot.muscleTarget };
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      if (!isLowerCoachCleanupHingeCandidate(candidate, user)) return false;
      if (muscle === 'Glutes') return isRealPosteriorChainBuilder(candidate, user) && (truth.progressionFriendly || truth.controlledHingeAllowed);
      return (truth.primaryMuscle === 'Legs' || isRealPosteriorChainBuilder(candidate, user)) && (truth.progressionFriendly || truth.controlledHingeAllowed);
    });
    if (!replacement) {
      rejectionReasons.push(`no_hinge_candidate_for_${String(muscle || '').toLowerCase()}`);
      continue;
    }
    availableHingeCandidatesCount += 1;
    if (replaceIdx >= 0) {
      nextDay.exercises.splice(replaceIdx, 1, replacement);
    } else if ((nextDay.exercises || []).length < Number(user?.sessionCap || 0)) {
      nextDay.exercises.push(replacement);
    } else {
      rejectionReasons.push(`session_cap_blocked_${String(muscle || '').toLowerCase()}`);
      continue;
    }
    nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
    const repairedStructure = buildLowerCoachCleanupStructuralResult(nextDay, user);
    if (repairedStructure.ok) {
      return {
        repaired: true,
        day: nextDay,
        availableHingeCandidatesCount,
        rejectionReasons
      };
    }
    rejectionReasons.push(repairedStructure.missingRequirement || `invalid_repair_${String(muscle || '').toLowerCase()}`);
  }

  return {
    repaired: false,
    day,
    availableHingeCandidatesCount,
    rejectionReasons
  };
}

function attemptLowerCoachCleanupQuadRepair(day, user, exercises, weekType) {
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', 'Legs') || {
    id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_quad_support`,
    pattern: 'Squat',
    styleRequired: 'Compound',
    muscleTarget: 'Legs',
    primaryAllowed: ['Legs'],
    subPreferred: ['Quads'],
    subFallback: null,
    optional: false
  };
  const rejectionReasons = [];
  let availableQuadCandidatesCount = 0;
  const replaceIdx = findLowerCoachCleanupQuadReplacementIndex(nextDay, user);
  const current = replaceIdx >= 0
    ? nextDay.exercises[replaceIdx]
    : { sets: 2, style: slot.styleRequired, slotId: slot.id, primary: slot.muscleTarget, muscleTarget: slot.muscleTarget };
  const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
    const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
    const name = normalizeName(candidate?.name);
    if (!exerciseDirectlyServesPriority(candidate, 'Legs', user)) return false;
    if (!(truth.progressionFriendly || String(candidate?.style || '') === 'Isolation')) return false;
    return countLowerCoachCleanupQuadPatterns([candidate], user) > 0
      || /(leg press|hack squat|split squat|lunge|step[\s-]*up|squat|leg extension)/.test(name);
  });
  if (!replacement) {
    rejectionReasons.push('no_quad_candidate');
  } else {
    availableQuadCandidatesCount += 1;
    if (replaceIdx >= 0) {
      nextDay.exercises.splice(replaceIdx, 1, replacement);
    } else if ((nextDay.exercises || []).length < Number(user?.sessionCap || 0)) {
      nextDay.exercises.push(replacement);
    } else {
      rejectionReasons.push('session_cap_blocked_legs');
    }
    nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
    const repairedStructure = buildLowerCoachCleanupStructuralResult(nextDay, user);
    if (repairedStructure.ok) {
      return {
        repaired: true,
        day: nextDay,
        availableQuadCandidatesCount,
        rejectionReasons
      };
    }
    rejectionReasons.push(repairedStructure.missingRequirement || 'invalid_quad_repair');
  }
  return {
    repaired: false,
    day,
    availableQuadCandidatesCount,
    rejectionReasons
  };
}

function isPowerbuildingTrueHingeExercise(exercise) {
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  return /(deadlift|romanian deadlift|\brdl\b|hip thrust|glute bridge|pull[\s-]*through|back extension|hyperextension)/.test(name);
}

function findPowerbuildingTrueHingeReplacementIndex(day, user) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const quadCount = countLowerCoachCleanupQuadPatterns(exercises, user);
  const ranked = exercises
    .map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      const name = normalizeName(exercise?.name);
      if (!name || isPowerbuildingTrueHingeExercise(exercise)) return null;
      let score = -1000;
      const isQuadPattern = countLowerCoachCleanupQuadPatterns([exercise], user) > 0;
      if (isQuadPattern && quadCount <= 1) return null;
      if (truth.directCalf) score = 60;
      else if (truth.directAb) score = 54;
      else if (isCoachCleanupLowerCandidate(exercise)) score = 48;
      else if (String(exercise?.style || '') === 'Isolation' && !exerciseDirectlyServesPriority(exercise, 'Legs', user)) score = 40;
      else if (String(exercise?.style || '') === 'Isolation') score = 28;
      else if (isLowerCoachCleanupHingeCandidate(exercise, user)) score = 22;
      else score = 12;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked[0]?.index ?? -1;
}

function polishPowerbuildingTrueHingeExposure(day, user, exercises, weekType) {
  if (String(user?.discipline || '') !== 'powerbuilding') return day;
  if (!['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  if (Number(user?.daysPerWeek || 0) < 4) return day;
  const avoidDeadlift = (Array.isArray(user?.movementsToAvoid) ? user.movementsToAvoid : [])
    .some((value) => /deadlift/i.test(String(value || '')));
  if (avoidDeadlift) return day;
  if (Math.max(Number(user?.injuryMap?.spine || 0), Number(user?.injuryMap?.back || 0), Number(user?.injuryMap?.hip || 0)) >= 6) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  if (nextDay.exercises.some((exercise) => isPowerbuildingTrueHingeExercise(exercise))) return nextDay;
  const slot = {
    id: `${String(nextDay?.dayType || 'day').toLowerCase()}_powerbuilding_hinge`,
    pattern: 'Hinge',
    styleRequired: 'Compound',
    muscleTarget: 'Glutes',
    primaryAllowed: ['Glutes', 'Legs'],
    subPreferred: ['Glutes', 'Hamstrings-Hinge'],
    subFallback: null,
    optional: false
  };
  const replaceIdx = findPowerbuildingTrueHingeReplacementIndex(nextDay, user);
  const current = replaceIdx >= 0
    ? nextDay.exercises[replaceIdx]
    : { sets: 2, style: slot.styleRequired, slotId: slot.id, primary: slot.muscleTarget, muscleTarget: slot.muscleTarget };
  const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
    const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
    return isPowerbuildingTrueHingeExercise(candidate) && (truth.progressionFriendly || truth.controlledHingeAllowed);
  });
  if (!replacement) return nextDay;
  if (replaceIdx >= 0) nextDay.exercises.splice(replaceIdx, 1, replacement);
  else if ((nextDay.exercises || []).length < Number(user?.sessionCap || 0)) nextDay.exercises.push(replacement);
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  const structure = buildLowerCoachCleanupStructuralResult(nextDay, user);
  return structure.ok ? nextDay : day;
}

function polishPowerbuildingPullCompoundSupport(day, user, exercises, weekType) {
  if (String(user?.discipline || '') !== 'powerbuilding') return day;
  if (Number(user?.daysPerWeek || 0) < 3) return day;
  if (!['Push', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const hasPullCompound = nextDay.exercises.some((exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    return String(exercise?.style || '') === 'Compound' && truth.pullRole === 'back_builder';
  });
  if (hasPullCompound) return nextDay;
  const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', 'Back') || {
    id: `${String(nextDay?.dayType || 'day').toLowerCase()}_powerbuilding_back_support`,
    pattern: 'HorizontalPull',
    styleRequired: 'Compound',
    muscleTarget: 'Back',
    primaryAllowed: ['Back'],
    subPreferred: ['Lats-Thickness', 'UpperBack', 'Lats-Width'],
    subFallback: null,
    optional: false
  };
  const replacementIndex = nextDay.exercises
    .map((exercise, index) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      let score = -1000;
      if (String(exercise?.slotId || '').startsWith('pb_')) return null;
      if (String(exercise?.style || '') === 'Isolation') score = 50;
      else if (truth.pressRole === 'chest_press' || truth.pressRole === 'mixed') score = 26;
      else if (truth.directCalf || truth.directAb) score = 18;
      else score = 8;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.index - a.index)[0]?.index ?? -1;
  if (replacementIndex < 0) return nextDay;
  const current = nextDay.exercises[replacementIndex];
  const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
    const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
    return String(candidate?.style || '') === 'Compound' && truth.pullRole === 'back_builder';
  });
  if (!replacement) return nextDay;
  nextDay.exercises.splice(replacementIndex, 1, replacement);
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function polishCoachSideEyeArmAccessories(day, user, exercises, weekType) {
  if (!['Push', 'Pull', 'Upper', 'UpperFocus', 'DeltsArms', 'FullBodyA', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const sideEyeIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isCoachSideEyeAccessory(exercise, user)) acc.push(index);
    return acc;
  }, []);
  if (!sideEyeIndexes.length) return nextDay;
  for (let i = sideEyeIndexes.length - 1; i >= 0; i -= 1) {
    const idx = sideEyeIndexes[i];
    const current = nextDay.exercises[idx];
    const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', 'Arms');
    if (!slot) continue;
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      return exerciseDirectlyServesPriority(candidate, 'Arms', user)
        && !isCoachSideEyeAccessory(candidate, user)
        && truth.directArmType !== 'none';
    });
    if (replacement) {
      nextDay.exercises.splice(idx, 1, replacement);
      continue;
    }
    if (nextDay.exercises.length > 5 && hasDirectPriorityVolume(nextDay, 'Arms', user, 2)) nextDay.exercises.splice(idx, 1);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function polishLowerCoachCleanup(day, user, exercises, weekType, opts = {}) {
  if (!['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const initialExerciseNames = nextDay.exercises.map((exercise) => String(exercise?.name || '').trim());
  const initialExerciseFamilies = buildLowerCoachCleanupExerciseSnapshot(nextDay.exercises, user);
  const initialQuadPatternCount = countLowerCoachCleanupQuadPatterns(nextDay.exercises, user);
  const cleanupActionLog = [];
  let bestValidDay = null;
  const attemptMissingHingeRepair = (candidateDay) => {
    if (allowPowerbuildingPosteriorSubstitute(candidateDay?.dayType || '', user)) {
      return attemptLowerCoachCleanupPosteriorSubstituteRepair(candidateDay, user, exercises, weekType);
    }
    return attemptLowerCoachCleanupHingeRepair(candidateDay, user, exercises, weekType);
  };
  const attemptMissingQuadRepair = (candidateDay) => attemptLowerCoachCleanupQuadRepair(candidateDay, user, exercises, weekType);
  const rememberBestValidDay = (candidateDay) => {
    const structure = buildLowerCoachCleanupStructuralResult(candidateDay, user);
    if (!structure.ok) return structure;
    bestValidDay = {
      ...candidateDay,
      exercises: Array.isArray(candidateDay?.exercises) ? candidateDay.exercises.slice() : []
    };
    return structure;
  };
  const cleanupIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isCoachCleanupLowerCandidate(exercise)) acc.push(index);
    return acc;
  }, []);
  if (!cleanupIndexes.length) return nextDay;
  const stableWorkCount = nextDay.exercises.filter((exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    return truth.progressionFriendly || truth.directCalf || truth.directAb;
  }).length;
  if (stableWorkCount < 3) return nextDay;
  const slotOrder = isGluteDominantPriorityUser(user)
    ? ['Glutes', 'Legs', 'Core', 'Calves']
    : ['Legs', 'Glutes', 'Core', 'Calves'];
  rememberBestValidDay(nextDay);
  for (let i = cleanupIndexes.length - 1; i >= 0; i -= 1) {
    const idx = cleanupIndexes[i];
    const current = nextDay.exercises[idx];
    let replacement = null;
    for (const muscle of slotOrder) {
      const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', muscle);
      if (!slot) continue;
      replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        const name = normalizeName(candidate?.name);
        if (muscle === 'Legs') return exerciseDirectlyServesPriority(candidate, 'Legs', user) && truth.progressionFriendly && !isCoachCleanupLowerCandidate(candidate);
        if (muscle === 'Glutes') return isRealPosteriorChainBuilder(candidate, user) && truth.progressionFriendly && !truth.hingeLoadingHigh;
        if (muscle === 'Core') return truth.directAb && truth.progressionFriendly;
        if (muscle === 'Calves') return truth.directCalf;
        return false;
      });
      if (replacement) break;
    }
    if (replacement) {
      bumpLowerBodyRepairLoopGuard(user, 'lowerCoachCleanup', {
        functionName: 'polishLowerCoachCleanup',
        week: opts?.weekIndex,
        day: nextDay?.day,
        dayType: nextDay?.dayType,
        lastAttemptedRepair: 'cleanup-lower-accessory',
        missingRequirement: 'degraded_lower_day_cleanup'
      });
      nextDay.exercises.splice(idx, 1, replacement);
      nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
      const replacedStructure = rememberBestValidDay(nextDay);
      cleanupActionLog.push({
        action: 'replace_cleanup_candidate',
        replacedExercise: String(current?.name || '').trim(),
        replacementExercise: String(replacement?.name || '').trim(),
        structureOk: Boolean(replacedStructure.ok),
        resultingMissingRequirement: replacedStructure.ok ? '' : String(replacedStructure.missingRequirement || '')
      });
      if (!replacedStructure.ok && bestValidDay) {
        logAbsGlutesLegsComboDebug(user, 'lower-coach-cleanup-degraded', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          skippedCleanup: true,
          lastAttemptedRepair: 'cleanup-lower-accessory',
          missingRequirement: replacedStructure.missingRequirement || 'invalid_lower_day_structure',
          action: 'restore_last_structurally_valid_day_after_invalid_replacement'
        });
        return bestValidDay;
      }
      if (!replacedStructure.ok && ['missing_hinge_pattern', 'missing_quad_pattern'].includes(String(replacedStructure.missingRequirement || ''))) {
        logAbsGlutesLegsComboDebug(user, replacedStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-missing-quad' : 'lower-coach-cleanup-missing-hinge', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null
        });
        logAbsGlutesLegsComboDebug(user, replacedStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-attempt' : 'lower-coach-cleanup-hinge-repair-attempt', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null
        });
        const structuralRepair = replacedStructure.missingRequirement === 'missing_quad_pattern'
          ? attemptMissingQuadRepair(nextDay)
          : attemptMissingHingeRepair(nextDay);
        if (structuralRepair.repaired) {
          const repairedStructure = rememberBestValidDay(structuralRepair.day);
          logAbsGlutesLegsComboDebug(user, replacedStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-success' : 'lower-coach-cleanup-hinge-repair-success', {
            day: nextDay?.day || null,
            dayType: nextDay?.dayType || null,
            availableHingeCandidatesCount: structuralRepair.availableHingeCandidatesCount,
            availableQuadCandidatesCount: structuralRepair.availableQuadCandidatesCount,
            rejectionReasons: structuralRepair.rejectionReasons
          });
          if (repairedStructure.ok) {
            resetLowerBodyRepairLoopGuard(user, 'lowerCoachCleanup', {
              week: opts?.weekIndex,
              day: nextDay?.day,
              dayType: nextDay?.dayType,
              lastAttemptedRepair: replacedStructure.missingRequirement === 'missing_quad_pattern' ? 'quad-repair' : 'hinge-repair'
            }, {
              lastAttemptedRepair: replacedStructure.missingRequirement === 'missing_quad_pattern' ? 'quad-repair' : 'hinge-repair',
              currentStructuralResult: repairedStructure
            });
            return structuralRepair.day;
          }
        }
        logAbsGlutesLegsComboDebug(user, replacedStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-failed' : 'lower-coach-cleanup-hinge-repair-failed', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          availableHingeCandidatesCount: structuralRepair.availableHingeCandidatesCount,
          availableQuadCandidatesCount: structuralRepair.availableQuadCandidatesCount,
          rejectionReasons: structuralRepair.rejectionReasons
        });
        if (bestValidDay) return bestValidDay;
      }
      continue;
    }
    const removedDay = {
      ...nextDay,
      exercises: nextDay.exercises.filter((_, exerciseIndex) => exerciseIndex !== idx)
    };
    removedDay.exercises = organizeDayExerciseOrder(removedDay.dayType || '', removedDay.exercises);
    const removedStructure = buildLowerCoachCleanupStructuralResult(removedDay, user);
    cleanupActionLog.push({
      action: 'remove_cleanup_candidate',
      removedExercise: String(current?.name || '').trim(),
      structureOk: Boolean(removedStructure.ok),
      resultingMissingRequirement: removedStructure.ok ? '' : String(removedStructure.missingRequirement || '')
    });
    if (removedDay.exercises.length >= 4 && removedStructure.ok) {
      rememberBestValidDay(removedDay);
      logAbsGlutesLegsComboDebug(user, 'lower-coach-cleanup-degraded', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        skippedCleanup: true,
        lastAttemptedRepair: 'cleanup-lower-accessory',
        missingRequirement: 'degraded_lower_day_cleanup',
        action: 'remove_cleanup_candidate_keep_structural_day'
      });
      return removedDay;
    }
    const currentStructure = buildLowerCoachCleanupStructuralResult(nextDay, user);
    if (['missing_hinge_pattern', 'missing_quad_pattern'].includes(String(currentStructure.missingRequirement || ''))) {
      logAbsGlutesLegsComboDebug(user, currentStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-missing-quad' : 'lower-coach-cleanup-missing-hinge', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null
      });
      logAbsGlutesLegsComboDebug(user, currentStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-attempt' : 'lower-coach-cleanup-hinge-repair-attempt', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null
      });
      const structuralRepair = currentStructure.missingRequirement === 'missing_quad_pattern'
        ? attemptMissingQuadRepair(nextDay)
        : attemptMissingHingeRepair(nextDay);
      if (structuralRepair.repaired) {
        const repairedStructure = rememberBestValidDay(structuralRepair.day);
        logAbsGlutesLegsComboDebug(user, currentStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-success' : 'lower-coach-cleanup-hinge-repair-success', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          availableHingeCandidatesCount: structuralRepair.availableHingeCandidatesCount,
          availableQuadCandidatesCount: structuralRepair.availableQuadCandidatesCount,
          rejectionReasons: structuralRepair.rejectionReasons
        });
        if (repairedStructure.ok) {
          resetLowerBodyRepairLoopGuard(user, 'lowerCoachCleanup', {
            week: opts?.weekIndex,
            day: nextDay?.day,
            dayType: nextDay?.dayType,
            lastAttemptedRepair: currentStructure.missingRequirement === 'missing_quad_pattern' ? 'quad-repair' : 'hinge-repair'
          }, {
            lastAttemptedRepair: currentStructure.missingRequirement === 'missing_quad_pattern' ? 'quad-repair' : 'hinge-repair',
            currentStructuralResult: repairedStructure
          });
          return structuralRepair.day;
        }
      }
      logAbsGlutesLegsComboDebug(user, currentStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-failed' : 'lower-coach-cleanup-hinge-repair-failed', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        availableHingeCandidatesCount: structuralRepair.availableHingeCandidatesCount,
        availableQuadCandidatesCount: structuralRepair.availableQuadCandidatesCount,
        rejectionReasons: structuralRepair.rejectionReasons
      });
      if (bestValidDay) return bestValidDay;
    }
    if (currentStructure.ok) {
      rememberBestValidDay(nextDay);
      logAbsGlutesLegsComboDebug(user, 'lower-coach-cleanup-degraded', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        skippedCleanup: true,
        lastAttemptedRepair: 'cleanup-lower-accessory',
        missingRequirement: 'degraded_lower_day_cleanup',
        action: 'keep_best_current_day'
      });
      return nextDay;
    }
    if (bestValidDay) {
      logAbsGlutesLegsComboDebug(user, 'lower-coach-cleanup-degraded', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        skippedCleanup: true,
        lastAttemptedRepair: 'cleanup-lower-accessory',
        missingRequirement: currentStructure.missingRequirement || 'invalid_lower_day_structure',
        action: 'restore_last_structurally_valid_day_after_cleanup_stall'
      });
      return bestValidDay;
    }
    const finalQuadPatternCount = countLowerCoachCleanupQuadPatterns(nextDay.exercises, user);
    const quadRepair = diagnoseLowerCoachCleanupQuadRepair(nextDay, user, exercises, weekType);
    throw buildLowerCoachCleanupStructuralError(user, nextDay, currentStructure, {
      weekIndex: opts?.weekIndex,
      finalExerciseNames: nextDay.exercises.map((exercise) => String(exercise?.name || '').trim()),
      finalExerciseFamilies: buildLowerCoachCleanupExerciseSnapshot(nextDay.exercises, user),
      quadPatternExistedBeforeCleanup: initialQuadPatternCount > 0,
      initialQuadPatternCount,
      finalQuadPatternCount,
      cleanupRemovedOnlyQuadPattern: initialQuadPatternCount > 0 && finalQuadPatternCount < 1,
      cleanupTouchedDay: cleanupActionLog.length > 0,
      cleanupTouchedPasses: ['polishLowerCoachCleanup'],
      cleanupActionLog,
      initialExerciseNames,
      initialExerciseFamilies,
      missingQuadPatternOrigin: initialQuadPatternCount > 0 && finalQuadPatternCount < 1 ? 'removed_later' : 'missing_from_initial_build',
      safeQuadReplacementAvailable: quadRepair.safeQuadReplacementAvailable,
      quadRepairAttempted: quadRepair.attempted,
      quadRepairFailureReason: quadRepair.failureReason
    });
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  const finalStructure = buildLowerCoachCleanupStructuralResult(nextDay, user);
  if (!finalStructure.ok && ['missing_hinge_pattern', 'missing_quad_pattern'].includes(String(finalStructure.missingRequirement || ''))) {
    logAbsGlutesLegsComboDebug(user, finalStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-missing-quad' : 'lower-coach-cleanup-missing-hinge', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null
    });
    logAbsGlutesLegsComboDebug(user, finalStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-attempt' : 'lower-coach-cleanup-hinge-repair-attempt', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null
    });
    const structuralRepair = finalStructure.missingRequirement === 'missing_quad_pattern'
      ? attemptMissingQuadRepair(nextDay)
      : attemptMissingHingeRepair(nextDay);
    if (structuralRepair.repaired) {
      const repairedStructure = rememberBestValidDay(structuralRepair.day);
      logAbsGlutesLegsComboDebug(user, finalStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-success' : 'lower-coach-cleanup-hinge-repair-success', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        availableHingeCandidatesCount: structuralRepair.availableHingeCandidatesCount,
        availableQuadCandidatesCount: structuralRepair.availableQuadCandidatesCount,
        rejectionReasons: structuralRepair.rejectionReasons
      });
      if (repairedStructure.ok) {
        resetLowerBodyRepairLoopGuard(user, 'lowerCoachCleanup', {
          week: opts?.weekIndex,
          day: nextDay?.day,
          dayType: nextDay?.dayType,
          lastAttemptedRepair: finalStructure.missingRequirement === 'missing_quad_pattern' ? 'quad-repair' : 'hinge-repair'
        }, {
          lastAttemptedRepair: finalStructure.missingRequirement === 'missing_quad_pattern' ? 'quad-repair' : 'hinge-repair',
          currentStructuralResult: repairedStructure
        });
        return structuralRepair.day;
      }
    }
    logAbsGlutesLegsComboDebug(user, finalStructure.missingRequirement === 'missing_quad_pattern' ? 'lower-coach-cleanup-quad-repair-failed' : 'lower-coach-cleanup-hinge-repair-failed', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null,
      availableHingeCandidatesCount: structuralRepair.availableHingeCandidatesCount,
      availableQuadCandidatesCount: structuralRepair.availableQuadCandidatesCount,
      rejectionReasons: structuralRepair.rejectionReasons
    });
    if (bestValidDay) return bestValidDay;
  }
  if (!finalStructure.ok && bestValidDay) {
    logAbsGlutesLegsComboDebug(user, 'lower-coach-cleanup-degraded', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null,
      skippedCleanup: true,
      lastAttemptedRepair: 'cleanup-lower-accessory',
      missingRequirement: finalStructure.missingRequirement || 'invalid_lower_day_structure',
      action: 'restore_last_structurally_valid_day_after_final_cleanup_validation'
    });
    return bestValidDay;
  }
  if (!finalStructure.ok) {
    const finalQuadPatternCount = countLowerCoachCleanupQuadPatterns(nextDay.exercises, user);
    const quadRepair = diagnoseLowerCoachCleanupQuadRepair(nextDay, user, exercises, weekType);
    throw buildLowerCoachCleanupStructuralError(user, nextDay, finalStructure, {
      weekIndex: opts?.weekIndex,
      finalExerciseNames: nextDay.exercises.map((exercise) => String(exercise?.name || '').trim()),
      finalExerciseFamilies: buildLowerCoachCleanupExerciseSnapshot(nextDay.exercises, user),
      quadPatternExistedBeforeCleanup: initialQuadPatternCount > 0,
      initialQuadPatternCount,
      finalQuadPatternCount,
      cleanupRemovedOnlyQuadPattern: initialQuadPatternCount > 0 && finalQuadPatternCount < 1,
      cleanupTouchedDay: cleanupActionLog.length > 0,
      cleanupTouchedPasses: ['polishLowerCoachCleanup'],
      cleanupActionLog,
      initialExerciseNames,
      initialExerciseFamilies,
      missingQuadPatternOrigin: initialQuadPatternCount > 0 && finalQuadPatternCount < 1 ? 'removed_later' : 'missing_from_initial_build',
      safeQuadReplacementAvailable: quadRepair.safeQuadReplacementAvailable,
      quadRepairAttempted: quadRepair.attempted,
      quadRepairFailureReason: quadRepair.failureReason
    });
  }
  return nextDay;
}

function polishAssembledLowerDay(day, user, exercises, weekType) {
  if (!['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const assembledIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isAssembledLowerAccessory(exercise)) acc.push(index);
    return acc;
  }, []);
  if (assembledIndexes.length < 2) return nextDay;
  const stableLowerCount = nextDay.exercises.filter((exercise) => {
    const name = normalizeName(exercise?.name);
    return /(leg press|hack squat|leg extension|leg curl|hamstring curl|glute ham raise|calf raise|squat|hip thrust|glute bridge)/.test(name);
  }).length;
  if (stableLowerCount < 3) return nextDay;
  const replacementSlots = [
    {
      id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_leg_iso`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Legs',
      primaryAllowed: ['Legs'],
      subPreferred: ['Quads', 'Hamstrings-Curl'],
      subFallback: null,
      optional: false
    },
    {
      id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_glute_iso`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Glutes',
      primaryAllowed: ['Glutes', 'Legs'],
      subPreferred: ['Glutes'],
      subFallback: null,
      optional: false
    },
    {
      id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_core`,
      pattern: 'CoreFlexion',
      styleRequired: 'Isolation',
      muscleTarget: 'Core',
      primaryAllowed: ['Core'],
      subPreferred: ['Abs-Lower', 'Abs-Upper'],
      subFallback: null,
      optional: false
    }
  ];
  for (let i = assembledIndexes.length - 1; i >= 1; i -= 1) {
    bumpLowerBodyRepairLoopGuard(user, 'assembledLower', {
      functionName: 'polishAssembledLowerDay',
      day: nextDay?.day,
      dayType: nextDay?.dayType,
      lastAttemptedRepair: 'replace-assembled-lower-accessory',
      missingRequirement: 'stable lower-day exercise mix'
    });
    const idx = assembledIndexes[i];
    const current = nextDay.exercises[idx];
    let replacement = null;
    for (const slot of replacementSlots) {
      replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        if (slot.muscleTarget === 'Legs') return truth.progressionFriendly && !isAssembledLowerAccessory(candidate);
        if (slot.muscleTarget === 'Glutes') return truth.progressionFriendly && !truth.hingeLoadingHigh;
        return truth.progressionFriendly;
      });
      if (replacement) break;
    }
    if (replacement) nextDay.exercises.splice(idx, 1, replacement);
    break;
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function polishShortSessionHipDominantClustering(day, user, exercises, weekType) {
  if (!(user?.profile?.complexity === 'low' || user?.profile?.sessionBandwidth === 'tight')) return day;
  if (!['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  let hipIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isHipDominantQualityExercise(exercise)) acc.push(index);
    return acc;
  }, []);
  if (hipIndexes.length < 3) return nextDay;
  const hasCalf = nextDay.exercises.some((exercise) => /\bcalf\b/.test(normalizeName(exercise?.name)));
  const replacementSlots = [];
  if (!hasCalf) {
    replacementSlots.push({
      id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_calf`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Calves',
      primaryAllowed: ['Legs'],
      subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
      subFallback: null,
      optional: false
    });
  }
  replacementSlots.push({
    id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_leg_iso`,
    pattern: 'Isolation',
    styleRequired: 'Isolation',
    muscleTarget: 'Legs',
    primaryAllowed: ['Legs'],
    subPreferred: ['Hamstrings-Curl', 'Quads'],
    subFallback: null,
    optional: false
  });
  replacementSlots.push({
    id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_core`,
    pattern: 'CoreFlexion',
    styleRequired: 'Isolation',
    muscleTarget: 'Core',
    primaryAllowed: ['Core'],
    subPreferred: ['Abs-Lower', 'Abs-Upper'],
    subFallback: null,
    optional: false
  });
  for (let i = hipIndexes.length - 1; i >= 2; i -= 1) {
    bumpLowerBodyRepairLoopGuard(user, 'hipCluster', {
      functionName: 'polishShortSessionHipDominantClustering',
      day: nextDay?.day,
      dayType: nextDay?.dayType,
      lastAttemptedRepair: 'reduce-hip-dominant-cluster',
      missingRequirement: 'balanced lower-day movement clustering'
    });
    const idx = hipIndexes[i];
    const current = nextDay.exercises[idx];
    let replacement = null;
    for (const slot of replacementSlots) {
      replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType);
      if (replacement) break;
    }
    if (replacement) nextDay.exercises.splice(idx, 1, replacement);
    hipIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
      if (isHipDominantQualityExercise(exercise)) acc.push(index);
      return acc;
    }, []);
    if (hipIndexes.length < 3) break;
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function polishLowerFatigueStacking(day, user, exercises, weekType, opts = {}) {
  if (!['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  if (String(user?.discipline || '') === 'powerbuilding'
    && String(user?.profile?.sessionBandwidth || '') === 'tight'
    && nextDay.exercises.length <= 4) {
    return nextDay;
  }
  let bestValidDay = null;
  const logLowerFatigueStructuralResult = (structure) => {
    const src = structure && typeof structure === 'object' ? structure : {};
    logAbsGlutesLegsComboDebug(user, 'lower-fatigue-structural-result', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null,
      ok: Boolean(src.ok),
      missingRequirement: src.missingRequirement || '',
      reason: src.reason || ''
    });
  };
  const rememberBestValidDay = (candidateDay) => {
    const structure = buildLowerCoachCleanupStructuralResult(candidateDay, user);
    if (!structure.ok) return structure;
    bestValidDay = {
      ...candidateDay,
      exercises: Array.isArray(candidateDay?.exercises) ? candidateDay.exercises.slice() : []
    };
    return structure;
  };
  const posteriorIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isPosteriorChainFatigueExercise(exercise)) acc.push(index);
    return acc;
  }, []);
  const hipBridgeIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (/(hip thrust|glute bridge)/.test(normalizeName(exercise?.name))) acc.push(index);
    return acc;
  }, []);
  logAbsGlutesLegsComboDebug(user, 'lower-fatigue-entry', {
    day: nextDay?.day || null,
    dayType: nextDay?.dayType || null,
    posteriorCount: posteriorIndexes.length,
    hipBridgeCount: hipBridgeIndexes.length
  });
  if (posteriorIndexes.length <= 2 && hipBridgeIndexes.length <= 1) return nextDay;
  const indexesToReplace = [];
  if (hipBridgeIndexes.length > 1) indexesToReplace.push(...hipBridgeIndexes.slice(1));
  if (indexesToReplace.length === 0 && posteriorIndexes.length > 2) indexesToReplace.push(...posteriorIndexes.slice(2));
  const replacementSlots = [
    buildPriorityIdentitySlot(nextDay?.dayType || '', 'Legs'),
    buildPriorityIdentitySlot(nextDay?.dayType || '', 'Calves'),
    buildPriorityIdentitySlot(nextDay?.dayType || '', 'Core'),
    buildPriorityIdentitySlot(nextDay?.dayType || '', 'Glutes')
  ].filter(Boolean);
  rememberBestValidDay(nextDay);
  for (const idx of indexesToReplace.sort((a, b) => b - a)) {
    const current = nextDay.exercises[idx];
    let replacement = null;
    for (const slot of replacementSlots) {
      replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        if (slot.muscleTarget === 'Legs') return exerciseDirectlyServesPriority(candidate, 'Legs', user) && !isPosteriorChainFatigueExercise(candidate);
        if (slot.muscleTarget === 'Calves') return exerciseDirectlyServesPriority(candidate, 'Calves', user);
        if (slot.muscleTarget === 'Core') return exerciseDirectlyServesPriority(candidate, 'Core', user);
        if (slot.muscleTarget === 'Glutes') return exerciseDirectlyServesPriority(candidate, 'Glutes', user) && !truth.hingeLoadingHigh;
        return true;
      });
      if (replacement) break;
    }
    if (!replacement) {
      const currentStructure = buildLowerCoachCleanupStructuralResult(nextDay, user);
      logLowerFatigueStructuralResult(currentStructure);
      if (currentStructure.ok) {
        rememberBestValidDay(nextDay);
        logAbsGlutesLegsComboDebug(user, 'lower-fatigue-degraded', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          skippedCleanup: true,
          lastAttemptedRepair: 'reduce-posterior-fatigue-stack',
          missingRequirement: 'degraded_lower_day_fatigue_cleanup',
          action: 'keep_best_current_day'
        });
        return nextDay;
      }
      if (bestValidDay) {
        logAbsGlutesLegsComboDebug(user, 'lower-fatigue-degraded', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          skippedCleanup: true,
          lastAttemptedRepair: 'reduce-posterior-fatigue-stack',
          missingRequirement: currentStructure.missingRequirement || 'invalid_lower_day_structure',
          action: 'restore_last_structurally_valid_day_after_fatigue_stall'
        });
        return bestValidDay;
      }
      logAbsGlutesLegsComboDebug(user, 'lower-fatigue-structural-failure', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        missingRequirement: currentStructure.missingRequirement || 'invalid_lower_day_structure',
        reason: currentStructure.reason || 'Lower day failed structural validation.'
      });
      throw buildLowerFatigueStructuralError(user, nextDay, currentStructure);
    }
    try {
      bumpLowerBodyRepairLoopGuard(user, 'lowerFatigue', {
        functionName: 'polishLowerFatigueStacking',
        week: opts?.weekIndex,
        day: nextDay?.day,
        dayType: nextDay?.dayType,
        lastAttemptedRepair: 'reduce-posterior-fatigue-stack',
        missingRequirement: 'degraded_lower_day_fatigue_cleanup'
      });
    } catch (err) {
      if (String(err?.error || '') !== 'LOWER_BODY_REPAIR_LOOP_LIMIT') throw err;
      const structuralResult = buildLowerCoachCleanupStructuralResult(nextDay, user);
      logLowerFatigueStructuralResult(structuralResult);
      if (structuralResult.ok) {
        const fallbackDay = bestValidDay || nextDay;
        logAbsGlutesLegsComboDebug(user, 'lower-fatigue-degraded', {
          day: nextDay?.day || null,
          dayType: nextDay?.dayType || null,
          skippedCleanup: true,
          lastAttemptedRepair: 'reduce-posterior-fatigue-stack',
          missingRequirement: 'degraded_lower_day_fatigue_cleanup',
          action: bestValidDay ? 'restore_last_structurally_valid_day_after_fatigue_stall' : 'keep_best_current_day'
        });
        return fallbackDay;
      }
      logAbsGlutesLegsComboDebug(user, 'lower-fatigue-structural-failure', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        missingRequirement: structuralResult.missingRequirement || 'invalid_lower_day_structure',
        reason: structuralResult.reason || 'Lower day failed structural validation.'
      });
      throw buildLowerFatigueStructuralError(user, nextDay, structuralResult);
    }
    nextDay.exercises.splice(idx, 1, replacement);
    nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
    const replacedStructure = rememberBestValidDay(nextDay);
    logLowerFatigueStructuralResult(replacedStructure);
    if (!replacedStructure.ok && bestValidDay) {
      logAbsGlutesLegsComboDebug(user, 'lower-fatigue-degraded', {
        day: nextDay?.day || null,
        dayType: nextDay?.dayType || null,
        skippedCleanup: true,
        lastAttemptedRepair: 'reduce-posterior-fatigue-stack',
        missingRequirement: replacedStructure.missingRequirement || 'invalid_lower_day_structure',
        action: 'restore_last_structurally_valid_day_after_invalid_replacement'
      });
      return bestValidDay;
    }
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  const finalStructure = buildLowerCoachCleanupStructuralResult(nextDay, user);
  logLowerFatigueStructuralResult(finalStructure);
  if (!finalStructure.ok && bestValidDay) {
    logAbsGlutesLegsComboDebug(user, 'lower-fatigue-degraded', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null,
      skippedCleanup: true,
      lastAttemptedRepair: 'reduce-posterior-fatigue-stack',
      missingRequirement: finalStructure.missingRequirement || 'invalid_lower_day_structure',
      action: 'restore_last_structurally_valid_day_after_final_fatigue_validation'
    });
    return bestValidDay;
  }
  if (!finalStructure.ok) {
    logAbsGlutesLegsComboDebug(user, 'lower-fatigue-structural-failure', {
      day: nextDay?.day || null,
      dayType: nextDay?.dayType || null,
      missingRequirement: finalStructure.missingRequirement || 'invalid_lower_day_structure',
      reason: finalStructure.reason || 'Lower day failed structural validation.'
    });
    throw buildLowerFatigueStructuralError(user, nextDay, finalStructure);
  }
  return nextDay;
}

function polishBackPriorityFrequency(week, user, exercises, weekType) {
  if (!(user?.priorityGroups || []).includes('Back')) return week;
  if (Number(user?.daysPerWeek || 0) < 4) return week;
  const nextWeek = {
    ...week,
    days: Array.isArray(week?.days) ? week.days.map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] })) : []
  };
  const exposureDays = nextWeek.days.filter((day) => (day?.exercises || []).some((exercise) => exerciseDirectlyServesPriority(exercise, 'Back', user))).length;
  if (exposureDays >= 2) return nextWeek;
  const candidateDays = nextWeek.days.filter((day) => ['Upper', 'UpperFocus', 'DeltsArms', 'Push', 'FullBodyA', 'FullBodyB'].includes(String(day?.dayType || '')));
  for (const day of candidateDays) {
    if ((day?.exercises || []).some((exercise) => exerciseDirectlyServesPriority(exercise, 'Back', user))) continue;
    const replaceIdx = findPriorityIdentityReplacementIndex(day, 'Back', user);
    if (replaceIdx < 0) continue;
    const current = day.exercises[replaceIdx];
    const slot = buildPriorityIdentitySlot(day?.dayType || '', 'Back');
    if (!slot) continue;
    const replacement = buildQualityReplacement(day, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      return truth.pullRole === 'back_builder'
        && ['chest_supported', 'machine_supported', 'cable_supported', 'seated_stable'].includes(String(truth.supportType || ''));
    });
    if (!replacement) continue;
    day.exercises.splice(replaceIdx, 1, replacement);
    day.exercises = organizeDayExerciseOrder(day.dayType || '', day.exercises);
    return nextWeek;
  }
  return nextWeek;
}

function upgradePlanQualityPass(baseState, user, exercises) {
  if (!baseState || baseState.error) return baseState;
  return withPlannerTiming(user, 'qualityUpgradePassMs', () => {
    const upgradedWeeks = (Array.isArray(baseState.weeks) ? baseState.weeks : []).map((week) => {
      const nextDays = (week?.days || []).map((day) => {
        const usedNames = new Set();
        const upgradedExercises = (day?.exercises || []).map((exercise) => {
          let current = { ...exercise };
          if (shouldUpgradeExerciseTaste(current, user, day?.dayType || '')) {
            const slot = buildUpgradeSlotFromExercise(current, user, day?.dayType || '');
            const dayState = buildCurrentDayState({ ...day, exercises: (day?.exercises || []).filter((ex) => ex !== exercise) });
            const eligible = filterEligible(slot, exercises, user, new Set(), dayState, day?.dayType || '', null)
              .filter((candidate) => String(candidate?.name || '') !== String(current?.name || ''))
              .map((candidate) => ({
                candidate,
                score: scoreExercise(candidate, slot, user, day?.dayType || '') + qualityReplacementPreference(candidate, current, slot, user, day?.dayType || '')
              }))
              .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
            const replacement = eligible[0]?.candidate || null;
            if (replacement) {
              const rr = {
                reps: exercise?.reps || repsRestByExercise(replacement, String(week?.weekType || 'base'), user, slot.id).reps,
                restSec: Number(exercise?.restSec || 0) || repsRestByExercise(replacement, String(week?.weekType || 'base'), user, slot.id).restSec
              };
              current = buildExerciseOutput(
                replacement,
                user,
                { ...slot, optional: Boolean(exercise?.optional) },
                Math.max(1, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(exercise?.sets || 2))),
                rr,
                { weekType: String(week?.weekType || 'base') }
              );
              current.progressionRule = exercise?.progressionRule || current.progressionRule;
              if (exercise?.rir) current.rir = exercise.rir;
              if (exercise?.flags) current.flags = exercise.flags;
            }
          }
          usedNames.add(String(current?.name || ''));
          return current;
        });
        const polishedShoulders = polishDuplicateShoulderPresses(
          { ...day, exercises: upgradedExercises },
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedLateralRedundancy = polishLateralRaiseRedundancy(
          polishedShoulders,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedUpperPresses = polishUpperPressRedundancy(
          polishedLateralRedundancy,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedChestPresses = polishChestPressRedundancy(
          polishedUpperPresses,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedChestLeak = polishBackDominantChestLeak(
          polishedChestPresses,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedBackSupport = polishBackBuilderSupport(
          polishedChestLeak,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedIdentity = polishPriorityDominanceSessionIdentity(
          polishedBackSupport,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedPowerbuildingPull = polishPowerbuildingPullCompoundSupport(
          polishedIdentity,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedNarrowIdentity = polishNarrowPrioritySessionIdentity(
          polishedPowerbuildingPull,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedNarrowDominance = polishNarrowPriorityGoalDominance(
          polishedNarrowIdentity,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedGlutePriority = polishGlutePriorityExpression(
          polishedNarrowDominance,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedArmAccessories = polishCoachSideEyeArmAccessories(
          polishedGlutePriority,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedLowerCleanup = polishLowerCoachCleanup(
          polishedArmAccessories,
          user,
          exercises,
          String(week?.weekType || 'base'),
          { weekIndex: week?.weekIndex }
        );
        const polishedPowerbuildingHinge = polishPowerbuildingTrueHingeExposure(
          polishedLowerCleanup,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedAssembledLower = polishAssembledLowerDay(
          polishedPowerbuildingHinge,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const polishedLowerFatigue = polishLowerFatigueStacking(
          polishedAssembledLower,
          user,
          exercises,
          String(week?.weekType || 'base'),
          { weekIndex: week?.weekIndex }
        );
        const polishedDay = polishShortSessionHipDominantClustering(
          polishedLowerFatigue,
          user,
          exercises,
          String(week?.weekType || 'base')
        );
        const finalizedPowerbuildingDay = user?.discipline === 'powerbuilding'
          ? powerbuildingPriority.polishPowerbuildingDay({ ...day, exercises: polishedDay.exercises || [] }, user)
          : { ...day, exercises: polishedDay.exercises || [] };
        let orderedDay = {
          ...finalizedPowerbuildingDay,
          exercises: organizeDayExerciseOrder(day?.dayType || '', finalizedPowerbuildingDay.exercises || [], user)
        };
        orderedDay = enforceNarrowPriorityOffGoalCap(polishNarrowPrioritySessionOrder(orderedDay, user), user);
        if (user?.discipline === 'powerbuilding') {
          const shoulderPriority = Number(user?.profile?.powerbuilding?.priorityRanks?.Shoulders || 99) <= 2;
          if (shoulderPriority && String(orderedDay?.dayType || '') === 'Pull') {
            const hasRearDelt = (orderedDay.exercises || []).some((exercise) => Boolean((exercise?.canonicalTruth || buildExerciseTruth(exercise, user))?.rearDeltPattern));
            if (!hasRearDelt) {
              const replaceIndex = (orderedDay.exercises || []).findIndex((exercise) => {
                const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
                return truth.directArmType === 'biceps' || truth.directArmType === 'triceps' || truth.coreFamily !== 'none';
              });
              if (replaceIndex >= 0) {
                const replacement = buildQualityReplacement(
                  orderedDay,
                  orderedDay.exercises[replaceIndex],
                  {
                    id: `${String(orderedDay.dayType || 'day').toLowerCase()}_pb_rear_delt_repair`,
                    pattern: 'Isolation',
                    styleRequired: 'Isolation',
                    muscleTarget: 'Shoulders',
                    primaryAllowed: ['Shoulders', 'Back'],
                    subPreferred: ['Rear', 'UpperBack'],
                    subFallback: null,
                    optional: false
                  },
                  user,
                  exercises,
                  String(week?.weekType || 'base'),
                  (candidate) => Boolean((candidate?.canonicalTruth || buildExerciseTruth(candidate, user))?.rearDeltPattern)
                );
                if (replacement) {
                  orderedDay.exercises.splice(replaceIndex, 1, replacement);
                }
              }
            }
          }
          orderedDay = powerbuildingPriority.polishPowerbuildingDay(orderedDay, user);
          orderedDay = {
            ...orderedDay,
            exercises: organizeDayExerciseOrder(orderedDay?.dayType || '', orderedDay.exercises || [], user)
          };
        }
        return orderedDay;
      });
      const polishedBackFrequency = polishBackPriorityFrequency(
        { ...week, days: nextDays },
        user,
        exercises,
        String(week?.weekType || 'base')
      );
      return polishNarrowPriorityWeekIdentity(
        polishCorePriorityFamilyExpression(polishedBackFrequency, user, exercises, String(week?.weekType || 'base')),
        user,
        exercises,
        String(week?.weekType || 'base')
      );
    });
    const repaired = repairAndValidatePlan(upgradedWeeks, user, exercises);
    emitPlannerDiagnosticHeartbeat(user, 'after_generator_final_return', {
      functionName: 'upgradeBlueprintStateToOutputPlan',
      fileName: 'generator/trainingEngine.oblueprint.js',
      elapsedMs: plannerNowMs(),
      requestedDayCount: Number.isFinite(Number(user?.daysPerWeek)) ? Number(user.daysPerWeek) : undefined,
      requestedPriorityCount: Array.isArray(user?.priorityGroups) ? user.priorityGroups.length : undefined,
      selectedPriorities: Array.isArray(user?.priorityGroups) ? user.priorityGroups.map((value) => String(value || '')) : [],
      planExists: Boolean(repaired && !repaired.error),
      weeksLength: Array.isArray(repaired?.weeks) ? repaired.weeks.length : undefined,
      callBoundary: 'upgradeBlueprintStateToOutputPlan_after_repairAndValidatePlan'
    });
    if (repaired.error) return baseState;
    emitPlannerDiagnosticHeartbeat(user, 'before_reinforce_low_frequency_priority_accessories', buildCleanupChainHeartbeatMeta(
      user,
      repaired.weeks,
      'upgradeBlueprintStateToOutputPlan_before_reinforce_low_frequency_priority_accessories',
      'upgradeBlueprintStateToOutputPlan'
    ));
    const reinforcedWeeks = reinforceLowFrequencyPriorityAccessories(repaired.weeks, user, exercises)
      .map((week) => ({
        ...week,
        days: (week?.days || []).map((day) => applyFinalNarrowPriorityDayPolish(day, user, exercises, String(week?.weekType || 'base'), {
          weekIndex: week?.weekIndex
        }))
      }));
    emitPlannerDiagnosticHeartbeat(user, 'after_reinforce_low_frequency_priority_accessories', buildCleanupChainHeartbeatMeta(
      user,
      reinforcedWeeks,
      'upgradeBlueprintStateToOutputPlan_after_reinforce_low_frequency_priority_accessories',
      'upgradeBlueprintStateToOutputPlan'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_cleanup_excess_core_volume', buildCleanupChainHeartbeatMeta(
      user,
      reinforcedWeeks,
      'upgradeBlueprintStateToOutputPlan_before_cleanup_excess_core_volume',
      'upgradeBlueprintStateToOutputPlan'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_reinforce_shoulder_priority_visibility', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        reinforcedWeeks,
        'upgradeBlueprintStateToOutputPlan_before_reinforce_shoulder_priority_visibility',
        'upgradeBlueprintStateToOutputPlan'
      ),
      loopIterationCount: 0,
      replacementAttempts: 0,
      noProgressCount: 0
    });
    const shoulderVisibleWeeks = reinforceShoulderPriorityVisibility(
      reinforcedWeeks,
      user,
      exercises
    );
    emitPlannerDiagnosticHeartbeat(user, 'after_reinforce_shoulder_priority_visibility', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        shoulderVisibleWeeks,
        'upgradeBlueprintStateToOutputPlan_after_reinforce_shoulder_priority_visibility',
        'upgradeBlueprintStateToOutputPlan'
      ),
      loopIterationCount: 0,
      replacementAttempts: 0,
      noProgressCount: 0
    });
    emitPlannerDiagnosticHeartbeat(user, 'before_reinforce_arm_priority_visibility', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        shoulderVisibleWeeks,
        'upgradeBlueprintStateToOutputPlan_before_reinforce_arm_priority_visibility',
        'upgradeBlueprintStateToOutputPlan'
      ),
      loopIterationCount: 0,
      replacementAttempts: 0,
      noProgressCount: 0
    });
    const armVisibleWeeks = reinforceArmPriorityVisibility(
      shoulderVisibleWeeks,
      user,
      exercises
    );
    emitPlannerDiagnosticHeartbeat(user, 'after_reinforce_arm_priority_visibility', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        armVisibleWeeks,
        'upgradeBlueprintStateToOutputPlan_after_reinforce_arm_priority_visibility',
        'upgradeBlueprintStateToOutputPlan'
      ),
      loopIterationCount: 0,
      replacementAttempts: 0,
      noProgressCount: 0
    });
    const coreCleanupInputWeeks = armVisibleWeeks;
    emitPlannerDiagnosticHeartbeat(user, 'before_core_cleanup_direct_call', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        coreCleanupInputWeeks,
        'upgradeBlueprintStateToOutputPlan_before_core_cleanup_direct_call',
        'upgradeBlueprintStateToOutputPlan'
      ),
      cleanupFunctionType: typeof cleanupExcessCoreVolumeInSuccessfulPlan,
      cleanupFunctionName: String(cleanupExcessCoreVolumeInSuccessfulPlan?.name || '')
    });
    const coreCleanedWeeks = cleanupExcessCoreVolumeInSuccessfulPlan(coreCleanupInputWeeks, user, exercises);
    emitPlannerDiagnosticHeartbeat(user, 'after_core_cleanup_direct_call', {
      ...buildCleanupChainHeartbeatMeta(
        user,
        coreCleanedWeeks,
        'upgradeBlueprintStateToOutputPlan_after_core_cleanup_direct_call',
        'upgradeBlueprintStateToOutputPlan'
      ),
      cleanupFunctionType: typeof cleanupExcessCoreVolumeInSuccessfulPlan,
      cleanupFunctionName: String(cleanupExcessCoreVolumeInSuccessfulPlan?.name || '')
    });
    emitPlannerDiagnosticHeartbeat(user, 'after_cleanup_excess_core_volume', buildCleanupChainHeartbeatMeta(
      user,
      coreCleanedWeeks,
      'upgradeBlueprintStateToOutputPlan_after_cleanup_excess_core_volume',
      'upgradeBlueprintStateToOutputPlan'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_cleanup_back_to_back_lower_redundancy', buildCleanupChainHeartbeatMeta(
      user,
      coreCleanedWeeks,
      'upgradeBlueprintStateToOutputPlan_before_cleanup_back_to_back_lower_redundancy',
      'upgradeBlueprintStateToOutputPlan'
    ));
    const finalWeeks = cleanupBackToBackLowerDayRedundancyInSuccessfulPlan(
      coreCleanedWeeks,
      user,
      exercises
    );
    emitPlannerDiagnosticHeartbeat(user, 'after_cleanup_back_to_back_lower_redundancy', buildCleanupChainHeartbeatMeta(
      user,
      finalWeeks,
      'upgradeBlueprintStateToOutputPlan_after_cleanup_back_to_back_lower_redundancy',
      'upgradeBlueprintStateToOutputPlan'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_final_weeks_assignment', buildCleanupChainHeartbeatMeta(
      user,
      finalWeeks,
      'upgradeBlueprintStateToOutputPlan_before_final_weeks_assignment',
      'upgradeBlueprintStateToOutputPlan'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'after_final_weeks_assignment', buildCleanupChainHeartbeatMeta(
      user,
      finalWeeks,
      'upgradeBlueprintStateToOutputPlan_after_final_weeks_assignment',
      'upgradeBlueprintStateToOutputPlan'
    ));
    emitPlannerDiagnosticHeartbeat(user, 'before_return_successful_plan', buildCleanupChainHeartbeatMeta(
      user,
      finalWeeks,
      'upgradeBlueprintStateToOutputPlan_before_return_successful_plan',
      'upgradeBlueprintStateToOutputPlan'
    ));
    return extractInternalPlanState(
      baseState.schedule,
      finalWeeks,
      repaired,
      baseState.notes,
      {
        ...baseState.stageMeta,
        constrainedRebuild: Boolean(baseState?.stageMeta?.constrainedRebuild)
      }
    );
  });
}

function attachAdaptiveCoachingLayer(plan, user, targets, frequencyTargets) {
  if (!plan || plan.error) return plan;
  const materialized = materializePlanResult(
    user,
    plan.schedule,
    plan.weeks,
    { filteredCount: plan.filteredCount },
    targets,
    frequencyTargets,
    plan.notes
  );
  materialized.meta.plannerStages.safeBasePlanner = true;
  materialized.meta.plannerStages.qualityUpgradePass = true;
  materialized.meta.plannerStages.adaptiveCoachingLayer = true;
  return materialized;
}

function applyEliteGradingLayer(plan, user) {
  if (!plan || plan.error) return plan;
  plan.meta.eliteQa = buildEliteQaReport(plan, user);
  plan.meta.ceilingQa = buildCeilingQaReport(plan, user);
  plan.meta.plannerStages.eliteGradingLayer = true;
  return plan;
}

function buildOblueprintPlan(input, opts = {}) {
  if (!PREPROCESSED_CACHE) {
    const raw = opts.exercises || loadExercisesRaw();
    const pre = preprocessExercises(raw);
    if (pre.error) return pre;
    PREPROCESSED_CACHE = pre.exercises;
  }
  const user = normalizeUserInput(input);
  if (user.error) return user;
  user._plannerRuntime = createPlannerRuntime(opts);
  try {
    logDebugComboMatchEval('builder', evaluateGlutesLegsCoreDebugCombo({
      discipline: user?.discipline,
      daysPerWeek: user?.daysPerWeek,
      phase: user?.phase,
      sessionLengthMin: user?.sessionLengthMin,
      location: user?.location,
      priorityGroups: user?.priorityGroups,
      allowedEquipment: user?.allowedEquipment,
      injuryMap: user?.injuryMap,
      injuryNotes: user?.injuryNotes
    }, { builderNormalized: true }));
    logAbsGlutesLegsComboDebug(user, 'normalized-user', {
      normalizedPriorityGroups: Array.isArray(user?.priorityGroups) ? user.priorityGroups.slice() : [],
      legsInterpretation: {
        structuralAliases: getPriorityGroupStructuralAliases('Legs'),
        directTargets: priorityGroupToDirectTargets('Legs')
      },
      allowedEquipment: Array.isArray(user?.allowedEquipment) ? user.allowedEquipment.slice() : [],
      sessionLengthMin: user?.sessionLengthMin || null,
      phase: user?.phase || null
    });

    const { targets, frequencyTargets } = computeWeeklyTargets(user);
    /* SLOT TRACE, plan level. The per-day pipeline is proven clean — every
       required slot fills and no pass removes anything — so the rewrite happens
       among these stages. Prints contents, not counts, because the shipped day
       turned out to be a DIFFERENT day rather than a trimmed one. */
    const __planTrace = (label, weeks) => {
      if (!process.env.SLOT_TRACE) return;
      const want = String(process.env.SLOT_TRACE);
      const wk = (Array.isArray(weeks) ? weeks : []).find((w) => Number(w?.weekIndex ?? w?.index) === 1) || (weeks || [])[0];
      for (const d of (wk?.days || [])) {
        if (want !== '*' && want !== String(d.dayType)) continue;
        const ex = d.exercises || [];
        process.stderr.write(`@@PLAN ${String(label).padEnd(34)} ${String(d.dayType).padEnd(12)} `
          + `${String(ex.length).padStart(2)} ex  ${ex.map((e) => `${e.name}[${e.pattern}]`).join(' | ')}\n`);
      }
    };
    const safeBase = buildSafeBasePlanner(user, PREPROCESSED_CACHE, targets, frequencyTargets);
    __planTrace('buildSafeBasePlanner', safeBase?.weeks);
    if (safeBase?.error) return attachAbsGlutesLegsDebugMeta(safeBase, user, {
      stage: safeBase?.stage || safeBase?.failedStage || 'builder',
      failedStage: safeBase?.failedStage || safeBase?.stage || 'builder'
    });
    const qualityUpgraded = upgradePlanQualityPass(safeBase, user, PREPROCESSED_CACHE);
    __planTrace('upgradePlanQualityPass', qualityUpgraded?.weeks);
    if (qualityUpgraded?.error) return attachAbsGlutesLegsDebugMeta(qualityUpgraded, user, {
      stage: qualityUpgraded?.stage || qualityUpgraded?.failedStage || 'builder',
      failedStage: qualityUpgraded?.failedStage || qualityUpgraded?.stage || 'builder'
    });
    logComboStageEnter(user, 'priority repair');
    const priorityRepairedWeeks = repairVisiblePriorityStructure(qualityUpgraded.weeks, user, PREPROCESSED_CACHE, targets);
    __planTrace('repairVisiblePriorityStructure', priorityRepairedWeeks);
    logComboStageExit(user, 'priority repair');
    logComboStageEnter(user, 'final dedupe');
    const dedupedWeeks = enforceFinalVisibleDedupeInvariant(
      priorityRepairedWeeks,
      user,
      PREPROCESSED_CACHE
    );
    logComboStageExit(user, 'final dedupe');
    __planTrace('enforceFinalVisibleDedupeInvariant', dedupedWeeks);
    logComboStageEnter(user, 'route repair');
    const repairedState = {
      ...qualityUpgraded,
      weeks: dedupedWeeks
    };
    logComboStageExit(user, 'route repair');
    const plan = attachAdaptiveCoachingLayer(repairedState, user, targets, frequencyTargets);
    __planTrace('attachAdaptiveCoachingLayer', plan?.weeks);
    if (plan?.error) return attachAbsGlutesLegsDebugMeta(plan, user, {
      stage: plan?.stage || plan?.failedStage || 'route repair',
      failedStage: plan?.failedStage || plan?.stage || 'route repair'
    });
    // Optional conditioning block (Task 6). Additive: only present when the user
    // opted in, and it never touches the resistance weeks — a plan without it is
    // unchanged.
    if (plan && typeof plan === 'object' && user?.wantsCardio) {
      try {
        const conditioning = buildConditioningPlan(user);
        if (conditioning) plan.conditioning = conditioning;
      } catch { /* conditioning is optional — never fail a build over it */ }
    }
    if (user?.discipline === 'powerbuilding' && Array.isArray(plan?.weeks)) {
      const shoulderPriority = Number(user?.profile?.powerbuilding?.priorityRanks?.Shoulders || 99) <= 2;
      plan.weeks = plan.weeks.map((week) => ({
        ...week,
        days: (Array.isArray(week?.days) ? week.days : []).map((day) => {
          let nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
          if (shoulderPriority && String(nextDay?.dayType || '') === 'Pull') {
            const hasRearDelt = nextDay.exercises.some((exercise) => Boolean((exercise?.canonicalTruth || buildExerciseTruth(exercise, user))?.rearDeltPattern));
            if (!hasRearDelt) {
              const replaceIndex = nextDay.exercises.findIndex((exercise) => {
                const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
                return truth.directArmType === 'biceps' || truth.directArmType === 'triceps' || truth.coreFamily !== 'none';
              });
              if (replaceIndex >= 0) {
                const replacement = buildQualityReplacement(
                  nextDay,
                  nextDay.exercises[replaceIndex],
                  {
                    id: `${String(nextDay.dayType || 'day').toLowerCase()}_pb_rear_delt_repair`,
                    pattern: 'Isolation',
                    styleRequired: 'Isolation',
                    muscleTarget: 'Shoulders',
                    primaryAllowed: ['Shoulders', 'Back'],
                    subPreferred: ['Rear', 'UpperBack'],
                    subFallback: null,
                    optional: false
                  },
                  user,
                  PREPROCESSED_CACHE,
                  String(week?.weekType || 'base'),
                  (candidate) => Boolean((candidate?.canonicalTruth || buildExerciseTruth(candidate, user))?.rearDeltPattern)
                );
                if (replacement) nextDay.exercises.splice(replaceIndex, 1, replacement);
              }
            }
          }
          nextDay = powerbuildingPriority.polishPowerbuildingDay(nextDay, user);
          return {
            ...nextDay,
            exercises: organizeDayExerciseOrder(nextDay?.dayType || '', nextDay.exercises || [], user)
          };
        })
      }));
    }
    if (user?.discipline === 'military') {
      const militaryPlan = militaryHybrid.finalizeMilitaryPlan(plan, user);
      if (opts?.fastBuild) {
        militaryPlan.meta = militaryPlan.meta && typeof militaryPlan.meta === 'object' ? militaryPlan.meta : {};
        militaryPlan.meta.plannerStages = militaryPlan.meta.plannerStages && typeof militaryPlan.meta.plannerStages === 'object'
          ? militaryPlan.meta.plannerStages
          : {};
        militaryPlan.meta.plannerStages.eliteGradingLayer = false;
        militaryPlan.meta.fastBuild = true;
      }
      return militaryPlan;
    }
    if (opts?.fastBuild) {
      plan.meta = plan.meta && typeof plan.meta === 'object' ? plan.meta : {};
      plan.meta.plannerStages = plan.meta.plannerStages && typeof plan.meta.plannerStages === 'object'
        ? plan.meta.plannerStages
        : {};
      plan.meta.plannerStages.eliteGradingLayer = false;
      plan.meta.fastBuild = true;
      return plan;
    }
    applyEliteGradingLayer(plan, user);
    if (!['elite', 'good'].includes(plan?.meta?.eliteQa?.tier)) {
      const rebuiltState = buildFinalConstrainedRebuild(user, PREPROCESSED_CACHE, targets, frequencyTargets, 'Used final constrained rebuild mode after elite QA downgrade.');
      if (!rebuiltState?.error) {
        const rebuiltPlan = attachAdaptiveCoachingLayer({
          ...rebuiltState,
          weeks: enforceFinalVisibleDedupeInvariant(
            repairVisiblePriorityStructure(rebuiltState.weeks, user, PREPROCESSED_CACHE, targets),
            user,
            PREPROCESSED_CACHE
          )
        }, user, targets, frequencyTargets);
        applyEliteGradingLayer(rebuiltPlan, user);
        const currentScore = Number(plan?.meta?.eliteQa?.score || 0);
        const rebuiltScore = Number(rebuiltPlan?.meta?.eliteQa?.score || 0);
        const currentCeilingScore = Number(plan?.meta?.ceilingQa?.score || 0);
        const rebuiltCeilingScore = Number(rebuiltPlan?.meta?.ceilingQa?.score || 0);
        if (rebuiltScore >= currentScore || rebuiltCeilingScore >= currentCeilingScore || ['elite', 'good'].includes(rebuiltPlan?.meta?.eliteQa?.tier)) return rebuiltPlan;
      }
    }
    return plan;
  } catch (err) {
    return attachAbsGlutesLegsDebugMeta(err, user, {
      stage: err?.stage || err?.failedStage || 'builder',
      failedStage: err?.failedStage || err?.stage || 'builder'
    });
  }
}

module.exports = {
  STYLE_ENUM,
  PATTERN_ENUM,
  normalizeEquipmentTags,
  buildExerciseTruth,
  preprocessExercises,
  normalizeUserInput,
  deriveInjuryNoteFlags,
  deriveUserProfile,
  isExerciseCompatibleWithEquipment,
  computeWeeklyTargets,
  buildSplit,
  buildWeekBlueprint,
  fillSlots,
  allocateSetsReps,
  applySessionCapTrimming,
  repairAndValidatePlan,
  buildWeeks,
  buildNutritionModel,
  buildProgressionModel,
  buildRecoveryModel,
  projectionFamilyForExercise,
  isCloseDecisionVariantPair,
  safeDecisionSourceExerciseLabel,
  resolveDecisionSourceHierarchy,
  enforceRecommendationTargetConsistency,
  progressionModeForExercise,
  buildBodybuildingProgressionProjection,
  createAdaptiveProjectionState,
  buildSafeBasePlanner,
  upgradePlanQualityPass,
  attachAdaptiveCoachingLayer,
  applyEliteGradingLayer,
  buildConstrainedSchedule,
  buildFinalConstrainedRebuild,
  buildCeilingQaReport,
  buildEliteQaReport,
  buildOblueprintPlan
};
