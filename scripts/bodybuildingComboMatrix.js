const fs = require('fs');
const path = require('path');

const trainingRoutes = require('../core/trainingRoutes');
const engine = require('../generator/trainingEngine.oblueprint.js');

const REPORT_PATH_DEFAULT = path.join(__dirname, '..', 'reports', 'bodybuilding-5day-combo-matrix.json');
const LEGACY_UI_PRIORITY_FALLBACK = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'arms', label: 'Arms' },
  { key: 'quads', label: 'Quads' },
  { key: 'hamstrings_glutes', label: 'Hamstrings/Glutes' },
  { key: 'calves', label: 'Calves' },
  { key: 'abs', label: 'Abs' }
];
const MATRIX_PRIORITY_OPTIONS = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'arms', label: 'Arms' },
  { key: 'legs', label: 'Legs' },
  { key: 'glutes', label: 'Glutes' },
  { key: 'abs', label: 'Abs' }
];
const SUPPORTED_DAY_COUNTS = [2, 3, 4, 5, 6];
const SUPPORTED_PRIORITY_COUNTS = [1, 2, 3];
const CORE_FAILURE_INVARIANTS = [
  'fullbodyb_abs_exact_2',
  'lower_core_priority',
  'upper_core_priority',
  'legs_abs_exact_2',
  'push_core_priority',
  'upperfocus_abs_exact_2'
];

const ROUTE_BANNED_NAME_PATTERNS = [
  /\bchains?\b/,
  /\bkneeling\s*squat\b/,
  /\bfloor\s*press\b/,
  /\boverhead\s*squat\b/,
  /\bpistol\s*squat\b/,
  /\baxle\b/,
  /\blog\b/,
  /\byoke\b/,
  /\bstone\b/,
  /\bfarmers?\b/,
  /\bsandbag\b/,
  /\bjammer\b/,
  /\bbehind(?:[\s-]*the)?[\s-]*neck\b/,
  /\bgironda\b/,
  /\bsternum\s*chin\b/,
  /\bmuscle[\s-]*ups?\b/,
  /\bmini\s*band\b/,
  /\bresistance\s*band\b/,
  /\bboard\s*press\b/,
  /\bguillotine\b/,
  /\bneck\s*press\b/,
  /\bspeed\b/,
  /\bdynamic\s*effort\b/,
  /\btempo\b/,
  /\bpaused?\b/,
  /\bbosu\b/,
  /\bbalance\s*board\b/,
  /\bpowerlifting\b/
];

function parsePositiveEnumCsv(raw, allowed, fallback) {
  const tokens = String(raw || '')
    .split(',')
    .map((value) => Number(String(value || '').trim()))
    .filter((value) => Number.isFinite(value));
  const picked = [];
  for (const token of tokens) {
    if (!allowed.includes(token) || picked.includes(token)) continue;
    picked.push(token);
  }
  return picked.length ? picked : fallback.slice();
}

function parseArgs(argv) {
  const out = {
    runs: 1,
    timeoutMs: 60_000,
    out: REPORT_PATH_DEFAULT,
    comboFilters: [],
    rerunFailures: '',
    filterFailedInvariant: '',
    calvesFailuresOnly: false,
    filterCoreFailures: false,
    rerunSource: REPORT_PATH_DEFAULT,
    days: [5],
    priorityCounts: [3],
    explicitDays: false,
    explicitPriorityCounts: false
  };
  for (const entry of argv) {
    if (entry.startsWith('--runs=')) {
      const value = Math.max(1, Math.min(10, Number(entry.slice('--runs='.length)) || 1));
      out.runs = value;
    } else if (entry.startsWith('--timeoutMs=')) {
      const value = Math.max(5_000, Number(entry.slice('--timeoutMs='.length)) || 60_000);
      out.timeoutMs = value;
    } else if (entry.startsWith('--out=')) {
      out.out = path.resolve(entry.slice('--out='.length));
    } else if (entry.startsWith('--combo=')) {
      out.comboFilters.push(entry.slice('--combo='.length));
    } else if (entry.startsWith('--rerun-failures=')) {
      out.rerunFailures = String(entry.slice('--rerun-failures='.length) || '').trim().toLowerCase();
    } else if (entry.startsWith('--filter-failed-invariant=')) {
      out.filterFailedInvariant = String(entry.slice('--filter-failed-invariant='.length) || '').trim().toLowerCase();
    } else if (entry === '--calves-failures') {
      out.calvesFailuresOnly = true;
    } else if (entry === '--filter-core-failures') {
      out.filterCoreFailures = true;
      out.days = SUPPORTED_DAY_COUNTS.slice();
      out.priorityCounts = SUPPORTED_PRIORITY_COUNTS.slice();
      out.explicitDays = true;
      out.explicitPriorityCounts = true;
      out.out = path.join(__dirname, '..', 'reports', 'bodybuilding-core-focused.json');
    } else if (entry.startsWith('--rerun-source=')) {
      out.rerunSource = path.resolve(entry.slice('--rerun-source='.length));
    } else if (entry.startsWith('--days=')) {
      out.days = parsePositiveEnumCsv(entry.slice('--days='.length), SUPPORTED_DAY_COUNTS, out.days);
      out.explicitDays = true;
    } else if (entry.startsWith('--priority-counts=')) {
      out.priorityCounts = parsePositiveEnumCsv(entry.slice('--priority-counts='.length), SUPPORTED_PRIORITY_COUNTS, out.priorityCounts);
      out.explicitPriorityCounts = true;
    }
  }
  return out;
}

function loadFailureRerunTargets(reportPath, failedInvariantFilter = '') {
  try {
    if (!fs.existsSync(reportPath)) return [];
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const failures = Array.isArray(report?.failures) ? report.failures : [];
    return failures
      .filter((entry) => {
        if (!failedInvariantFilter) return true;
        return String(entry?.error?.failedInvariant || '').trim().toLowerCase() === failedInvariantFilter;
      })
      .map((entry) => ({
        comboKey: normalizeComboFilterLabel(entry?.combo || []),
        failedInvariant: String(entry?.error?.failedInvariant || '').trim().toLowerCase(),
        dayCount: Number(entry?.dayCount || 0) || null,
        priorityCount: Number(entry?.priorityCount || 0) || null
      }))
      .filter((entry) => entry.comboKey && entry.dayCount && entry.priorityCount);
  } catch {
    return [];
  }
}

function extractLegacyUiPriorityOptions() {
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'training.js'), 'utf8');
    const match = src.match(/\[\s*\{ key: 'chest', label: 'Chest' }[\s\S]*?\{ key: 'abs', label: 'Abs' }\s*\]/);
    if (!match) return LEGACY_UI_PRIORITY_FALLBACK.slice();
    const parsed = Function(`return (${match[0]});`)();
    if (!Array.isArray(parsed) || !parsed.length) return LEGACY_UI_PRIORITY_FALLBACK.slice();
    return parsed
      .map((entry) => ({
        key: String(entry?.key || '').trim(),
        label: String(entry?.label || '').trim()
      }))
      .filter((entry) => entry.key && entry.label);
  } catch {
    return LEGACY_UI_PRIORITY_FALLBACK.slice();
  }
}

function extractUiPriorityOptions() {
  return MATRIX_PRIORITY_OPTIONS.slice();
}

function combinationsOfCount(list, count) {
  const out = [];
  const target = Math.max(1, Math.floor(Number(count) || 0));
  if (!Array.isArray(list) || !list.length || target > list.length) return out;
  const walk = (startIndex, bucket) => {
    if (bucket.length === target) {
      out.push(bucket.slice());
      return;
    }
    for (let idx = startIndex; idx < list.length; idx += 1) {
      bucket.push(list[idx]);
      walk(idx + 1, bucket);
      bucket.pop();
    }
  };
  walk(0, []);
  return out;
}

function normalizeComboFilterLabel(raw) {
  return String(raw || '')
    .split(',')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

function normalizePriorityLabel(value) {
  return String(value || '').trim().toLowerCase();
}

function buildExactRerunTargets(priorityOptions, rerunTargets) {
  const optionMap = new Map(
    (Array.isArray(priorityOptions) ? priorityOptions : []).map((entry) => [
      normalizePriorityLabel(entry?.label),
      entry
    ])
  );
  return (Array.isArray(rerunTargets) ? rerunTargets : [])
    .map((entry) => {
      const labels = String(entry?.comboKey || '')
        .split('|')
        .map((value) => normalizePriorityLabel(value))
        .filter(Boolean);
      const combo = labels.map((label) => optionMap.get(label)).filter(Boolean);
      if (!combo.length || combo.length !== labels.length) return null;
      return {
        comboKey: entry.comboKey,
        dayCount: Number(entry.dayCount || 0) || null,
        priorityCount: Number(entry.priorityCount || 0) || null,
        combo
      };
    })
    .filter((entry) => entry && entry.dayCount && entry.priorityCount);
}

function isCalvesFailureCombo(combo) {
  const labels = combo.map((entry) => String(entry?.label || '').trim());
  const lookup = new Set(labels);
  if (!lookup.has('Calves')) return false;
  const named = [
    ['Chest', 'Back', 'Calves'],
    ['Chest', 'Shoulders', 'Calves'],
    ['Chest', 'Arms', 'Calves'],
    ['Back', 'Shoulders', 'Calves'],
    ['Back', 'Arms', 'Calves'],
    ['Shoulders', 'Arms', 'Calves']
  ];
  return named.some((target) => target.every((label) => lookup.has(label)));
}

function buildClassicPayload(combo, runIndex = 0, daysPerWeek = 5) {
  return {
    discipline: 'bodybuilding',
    experience: 'beginner',
    daysPerWeek,
    phase: 'bulk',
    targetWeightLb: null,
    timePerSession: '75+',
    trainingAgeBucket: '',
    emphasis: combo.map((entry) => entry.key),
    equipmentStylePref: 'mix',
    unavailableDays: [],
    equipmentAccess: {
      bodyweight: true,
      dumbbell: true,
      barbell: true,
      cable: true,
      machine: true
    },
    strength: {
      bodyweight: 180,
      height: 70,
      benchWeight: 185,
      benchReps: 8,
      lowerMovement: 'Back Squat',
      lowerWeight: 225,
      lowerReps: 8,
      hingeMovement: 'Romanian Deadlift',
      hingeWeight: 225,
      hingeReps: 8,
      phase: 'bulk',
      targetWeightLb: null,
      timePerSession: '75+',
      trainingAgeBucket: '',
      emphasis: combo.map((entry) => entry.key),
      equipmentStylePref: 'mix',
      injury: {
        has: false,
        joints: [],
        note: ''
      },
      injurySeverityByJoint: {}
    },
    profile: {
      firstName: 'Combo Matrix',
      age: null,
      locationCity: '',
      locationState: '',
      goals: '',
      injuries: ''
    },
    planSeed: 100_000 + (daysPerWeek * 1_000) + runIndex
  };
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function snapshotExerciseForMatrix(exercise) {
  return {
    name: String(exercise?.name || '').trim(),
    canonicalName: String(exercise?.canonicalName || '').trim() || undefined,
    pattern: exercise?.pattern,
    style: exercise?.style,
    primary: exercise?.primary,
    secondary: exercise?.secondary,
    sets: exercise?.sets,
    reps: exercise?.reps
  };
}

function flattenPlanExercises(weeks) {
  const out = [];
  for (const week of Array.isArray(weeks) ? weeks : []) {
    for (const day of Array.isArray(week?.days) ? week.days : []) {
      for (const exercise of Array.isArray(day?.exercises) ? day.exercises : []) {
        out.push({ week, day, exercise });
      }
    }
  }
  return out;
}

function withSuppressedConsole(fn) {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  try {
    return fn();
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  }
}

function isLowerHeavyDay(dayType = '') {
  return ['legs', 'lower', 'lowerfocus', 'fullbodyb'].includes(String(dayType || '').trim().toLowerCase());
}

function isQuadPattern(truth, exercise) {
  const name = normalizeName(exercise?.name);
  const pattern = String(exercise?.pattern || '').trim().toLowerCase();
  return pattern === 'squat'
    || pattern === 'lunge'
    || /(squat|leg press|hack squat|lunge|split squat|leg extension)/.test(name)
    || ['Quads', 'Legs'].includes(String(truth?.primaryMuscle || ''));
}

function isHingePattern(truth, exercise) {
  const name = normalizeName(exercise?.name);
  const pattern = String(exercise?.pattern || '').trim().toLowerCase();
  return pattern === 'hinge'
    || Boolean(truth?.hingeLoadingHigh)
    || Boolean(truth?.controlledHingeAllowed)
    || /(deadlift|romanian deadlift|\brdl\b|good morning|hip thrust|glute bridge|pull through|back extension|hyperextension)/.test(name);
}

const CANONICAL_MOVEMENT_FAMILY_OVERRIDES = [
  {
    canonicalFamily: 'horizontal_row',
    currentKey: 'back_horizontal_pull',
    patterns: [
      /\bcable row\b/,
      /\bchest-supported row\b/,
      /\bdumbbell incline row\b/,
      /\bleverage high row\b/,
      /\bt-bar row with handle\b/,
      /\bbent over row\b/,
      /\bbent-over row\b/
    ]
  },
  {
    canonicalFamily: 'vertical_pull',
    currentKey: 'back_vertical_pull',
    patterns: [
      /\blat pulldown\b/,
      /\bv-bar pulldown\b/,
      /\bclose-grip front lat pulldown\b/,
      /\bwide-grip lat pulldown\b/,
      /\bpull-up\b/,
      /\bpull up\b/,
      /\bchin-up\b/,
      /\bchin up\b/
    ]
  },
  {
    canonicalFamily: 'calf_raise',
    currentKey: 'calves',
    patterns: [
      /\bcalf press\b/,
      /\bcalf press on the leg press machine\b/,
      /\bcalf raise\b/,
      /\bstanding calf raise\b/,
      /\bseated calf raise\b/,
      /\bbarbell seated calf raise\b/,
      /\bdumbbell seated one-leg calf raise\b/,
      /\bsmith machine calf raise\b/
    ]
  },
  {
    canonicalFamily: 'squat_leg_press',
    currentKey: 'quad',
    patterns: [
      /\bhack squat\b/,
      /\bbarbell hack squat\b/,
      /\bleg press\b/,
      /\bsmith machine leg press\b/,
      /\bback squat\b/,
      /\bbarbell squat\b/,
      /\bfront squat\b/,
      /\bdumbbell squat\b/,
      /\blunge\b/,
      /\bsplit squat\b/
    ]
  },
  {
    canonicalFamily: 'core_flexion',
    currentKey: 'core_flexion',
    patterns: [
      /\bab crunch machine\b/,
      /\bcable crunch\b/,
      /\brope crunch\b/,
      /\breverse crunch\b/,
      /\bcable reverse crunch\b/,
      /\bkneeling cable crunch\b/
    ]
  },
  {
    canonicalFamily: 'core_rotation_or_stability',
    currentKey: 'core_rotation_or_stability',
    patterns: [
      /\bpallof hold\b/,
      /\bpallof press\b/,
      /\bseated barbell twist\b/,
      /\bcable oblique crunch\b/,
      /\brussian twist\b/
    ]
  },
  {
    canonicalFamily: 'hinge_posterior_chain',
    currentKey: 'hinge',
    patterns: [
      /\bromanian deadlift\b/,
      /\bstiff-leg deadlift\b/,
      /\bgood morning\b/,
      /\bback extension\b/,
      /\bhyperextension\b/,
      /\bglute ham raise\b/
    ]
  }
];

function canonicalMovementFamilyOverride(exercise) {
  const name = normalizeName(exercise?.name);
  for (const entry of CANONICAL_MOVEMENT_FAMILY_OVERRIDES) {
    if (entry.patterns.some((pattern) => pattern.test(name))) return entry;
  }
  return null;
}

function resolvedCanonicalMovementFamily(exercise, truth) {
  const shared = trainingRoutes?._private?.getCanonicalMovementFamily;
  if (typeof shared === 'function') {
    const family = shared(exercise);
    if (family) return String(family);
  }
  return canonicalFamilyFromExercise(exercise, truth);
}

function movementFamilyKey(exercise, truth) {
  const override = canonicalMovementFamilyOverride(exercise);
  if (override?.currentKey) return override.currentKey;
  if (truth?.shoulderPressPattern) return 'shoulder_press';
  if (truth?.lateralDeltPattern) return 'lateral_delt';
  if (truth?.rearDeltPattern) return 'rear_delt';
  if (truth?.directArmType && truth.directArmType !== 'none') return `arm_${truth.directArmType}`;
  if (truth?.directCalf) return 'calves';
  if (truth?.directAb) return `core_${truth.coreFamily || 'general'}`;
  if (truth?.pressRole === 'chest_press') return 'chest_press';
  if (truth?.pressRole === 'mixed') return 'mixed_press';
  if (truth?.pullRole === 'back_builder') return `back_${truth.movementFamily || 'pull'}`;
  if (isHingePattern(truth, exercise)) return 'hinge';
  if (isQuadPattern(truth, exercise)) return 'quad';
  if (String(truth?.primaryMuscle || '') === 'Glutes') return 'glutes';
  return String(truth?.movementFamily || exercise?.pattern || truth?.primaryMuscle || 'general').toLowerCase();
}

function lowerMovementFamilyKey(exercise, truth) {
  const name = normalizeName(exercise?.name);
  if (isHingePattern(truth, exercise)) return 'hinge';
  if (/(leg extension)/.test(name)) return 'leg_extension';
  if (/(leg curl|ham curl|glute ham raise)/.test(name)) return 'ham_curl';
  if (/(calf)/.test(name) || truth?.directCalf) return 'calves';
  if (isQuadPattern(truth, exercise)) return 'quad';
  if (truth?.directAb) return 'core';
  return null;
}

function listifyField(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  return text ? [text] : [];
}

function exerciseDatabaseFields(exercise, truth) {
  return {
    primaryMuscles: listifyField(exercise?.primaryMuscles).length
      ? listifyField(exercise?.primaryMuscles)
      : listifyField(exercise?.primary || truth?.primaryMuscle),
    secondaryMuscles: listifyField(exercise?.secondaryMuscles),
    targetRegion: String(exercise?.targetRegion || truth?.primaryMuscle || '').trim() || null,
    subMuscleGroups: listifyField(exercise?.subMuscleGroups).length
      ? listifyField(exercise?.subMuscleGroups)
      : listifyField(exercise?.sub || truth?.subMuscle),
    equipment: listifyField(exercise?.equipment),
    mechanic: String(exercise?.mechanic || '').trim() || null,
    force: String(exercise?.force || '').trim() || null,
    category: String(exercise?.category || '').trim() || null
  };
}

function broadFamilyGroupFromCurrentKey(key) {
  const value = String(key || '').trim().toLowerCase();
  if (value === 'chest_press' || value === 'mixed_press') return 'chest_press';
  if (value === 'shoulder_press') return 'shoulder_press';
  if (value === 'lateral_delt') return 'lateral_raise';
  if (value === 'rear_delt') return 'rear_delt';
  if (value === 'back_horizontal_pull') return 'horizontal_row';
  if (value === 'back_vertical_pull') return 'vertical_pull';
  if (value === 'arm_biceps') return 'biceps_curl';
  if (value === 'arm_triceps') return 'triceps_extension_pushdown';
  if (value === 'core_flexion') return 'core_flexion';
  if (value === 'core_rotation') return 'core_rotation';
  if (value === 'core_stability') return 'core_stability';
  if (value === 'core_rotation_or_stability') return 'core_rotation_or_stability';
  if (value === 'quad') return 'squat_leg_press';
  if (value === 'hinge' || value === 'glutes') return 'hinge_posterior_chain';
  if (value === 'calves') return 'calf_raise';
  return value || 'general';
}

function canonicalFamilyFromExercise(exercise, truth) {
  const override = canonicalMovementFamilyOverride(exercise);
  if (override?.canonicalFamily) return override.canonicalFamily;
  const name = normalizeName(exercise?.name);
  const current = broadFamilyGroupFromCurrentKey(movementFamilyKey(exercise, truth));
  if (/crossover|pec deck|fly/.test(name) && !truth?.rearDeltPattern) return 'chest_fly_isolation';
  if (truth?.pressRole === 'chest_press') return 'chest_press_compound';
  if (truth?.shoulderPressPattern) return 'shoulder_press_compound';
  if (truth?.lateralDeltPattern) return 'lateral_delt_isolation';
  if (truth?.rearDeltPattern) return 'rear_delt_isolation';
  if (truth?.pullRole === 'back_builder' && String(truth?.movementFamily || '') === 'horizontal_pull') return 'horizontal_row';
  if (truth?.pullRole === 'back_builder' && String(truth?.movementFamily || '') === 'vertical_pull') return 'vertical_pull';
  if (truth?.directArmType === 'biceps') return 'biceps_curl';
  if (truth?.directArmType === 'triceps') return 'triceps_extension_pushdown';
  if (truth?.directAb && String(truth?.coreFamily || '') === 'flexion') return 'core_flexion';
  if (truth?.directAb && String(truth?.coreFamily || '') === 'rotation') return 'core_rotation';
  if (truth?.directAb) return 'core_stability';
  if (truth?.directCalf) return 'calf_raise';
  if (isHingePattern(truth, exercise) || String(truth?.glutePrimaryStrength || '') !== 'none') return 'hinge_posterior_chain';
  if (isQuadPattern(truth, exercise)) return 'squat_leg_press';
  return current;
}

function canonicalFamilyFromDatabaseFields(fields) {
  const primary = fields.primaryMuscles.join(' ').toLowerCase();
  const secondary = fields.secondaryMuscles.join(' ').toLowerCase();
  const target = String(fields.targetRegion || '').toLowerCase();
  const sub = fields.subMuscleGroups.join(' ').toLowerCase();
  if (/chest/.test(primary) && /(fly|crossover|pec)/.test(String(fields.category || '').toLowerCase())) return 'chest_fly_isolation';
  if (/chest/.test(primary)) return 'chest_press_compound';
  if (/shoulder/.test(primary) && /rear/.test(sub)) return 'rear_delt_isolation';
  if (/shoulder/.test(primary) && /lateral|side/.test(sub)) return 'lateral_delt_isolation';
  if (/shoulder/.test(primary)) return 'shoulder_press_compound';
  if (/back/.test(primary) && /lats|width|vertical/.test(sub)) return 'vertical_pull';
  if (/back/.test(primary)) return 'horizontal_row';
  if (/biceps/.test(primary)) return 'biceps_curl';
  if (/triceps/.test(primary)) return 'triceps_extension_pushdown';
  if (/abs|core/.test(primary) || /abs|core/.test(target)) {
    if (/rotation|oblique/.test(sub)) return 'core_rotation';
    if (/stability|plank|pallof/.test(sub)) return 'core_stability';
    return 'core_flexion';
  }
  if (/calf/.test(primary) || /calf/.test(target)) return 'calf_raise';
  if (/glute|hamstring/.test(primary) || /glute|hamstring/.test(secondary)) return 'hinge_posterior_chain';
  if (/quad|leg/.test(primary) || /quad|leg/.test(target)) return 'squat_leg_press';
  return 'general';
}

function conflictBetweenTargetAndPrimary(fields) {
  const target = String(fields.targetRegion || '').trim().toLowerCase();
  const primary = fields.primaryMuscles.map((item) => String(item || '').trim().toLowerCase());
  if (!target || !primary.length) return false;
  if (primary.some((item) => item.includes(target) || target.includes(item))) return false;
  const compatible = [
    ['abs', 'core'],
    ['core', 'abs'],
    ['legs', 'quads'],
    ['legs', 'hamstrings'],
    ['legs', 'glutes'],
    ['shoulders', 'delts']
  ];
  if (compatible.some(([left, right]) => target.includes(left) && primary.some((item) => item.includes(right)))) return false;
  return true;
}

function nameImpliedFamily(exercise) {
  const override = canonicalMovementFamilyOverride(exercise);
  if (override?.canonicalFamily) return override.canonicalFamily;
  const name = normalizeName(exercise?.name);
  if (/crossover|pec deck|fly/.test(name) && !/rear delt|reverse fly/.test(name)) return 'chest_fly_isolation';
  if (/bench press|chest press|incline press|decline press/.test(name)) return 'chest_press_compound';
  if (/shoulder press|overhead press|military press/.test(name)) return 'shoulder_press_compound';
  if (/lateral raise|side lateral/.test(name)) return 'lateral_delt_isolation';
  if (/rear delt|reverse fly|reverse pec deck|face pull/.test(name)) return 'rear_delt_isolation';
  if (/pulldown|pull-up|pull up|chin-up|chin up/.test(name)) return 'vertical_pull';
  if (/row/.test(name)) return 'horizontal_row';
  if (/curl|preacher|hammer/.test(name) && !/leg curl|hamstring curl/.test(name)) return 'biceps_curl';
  if (/triceps|pushdown|extension|skull crusher/.test(name) && !/leg extension/.test(name)) return 'triceps_extension_pushdown';
  if (/crunch|sit-up|sit up|reverse crunch/.test(name)) return 'core_flexion';
  if (/twist|oblique|woodchop|wood chop|pallof|plank|rollout|hold/.test(name)) return 'core_rotation_or_stability';
  if (/calf/.test(name)) return 'calf_raise';
  if (/deadlift|rdl|romanian|hip thrust|glute bridge|back extension|hyperextension/.test(name)) return 'hinge_posterior_chain';
  if (/squat|leg press|hack squat|lunge|split squat|step up|step-up/.test(name)) return 'squat_leg_press';
  return 'general';
}

function isAcceptablePrioritySpecificDuplication(familyGroup, priorityGroups = [], exercises = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '')));
  if (familyGroup === 'chest_press' && priorities.has('Chest') && exercises.length <= 2) return true;
  if (familyGroup === 'biceps_curl' && priorities.has('Arms') && exercises.length <= 2) return true;
  if (familyGroup === 'triceps_extension_pushdown' && priorities.has('Arms') && exercises.length <= 2) return true;
  if ((familyGroup === 'core_flexion' || familyGroup === 'core_rotation' || familyGroup === 'core_stability') && (priorities.has('Abs') || priorities.has('Core')) && exercises.length <= 2) return true;
  if (familyGroup === 'calf_raise' && priorities.has('Calves') && exercises.length <= 2) return true;
  return false;
}

function isAcceptableHorizontalRowDuplication(dayType = '', priorityGroups = [], exercises = []) {
  const normalizedType = String(dayType || '').trim().toLowerCase();
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '')));
  return Array.isArray(exercises)
    && exercises.length <= 2
    && (normalizedType === 'pull' || (normalizedType === 'upper' && priorities.has('Back')));
}

function isAcceptableSquatLegPressStructure(dayType = '', exercises = []) {
  const normalizedType = String(dayType || '').trim().toLowerCase();
  if (!['legs', 'lower', 'lowerfocus'].includes(normalizedType)) return false;
  if (!Array.isArray(exercises) || exercises.length !== 2) return false;
  const roles = exercises.map((item) => lowerMainRoleKey(item?.exerciseName || item?.name));
  const distinctRoles = new Set(roles);
  if (distinctRoles.size < 2) return false;
  if (roles.includes('other')) return false;
  return true;
}

function classifyHingePosteriorDuplicationType(dayType = '', priorityGroups = [], exercises = [], dayInventory = []) {
  const hingeExercises = (Array.isArray(exercises) ? exercises : []).map((item) => ({
    exerciseName: item?.exerciseName || item?.name || '',
    name: item?.exerciseName || item?.name || ''
  }));
  if (hingeExercises.length < 2) return null;
  const structure = evaluateHingePosteriorStructure(dayType, priorityGroups, hingeExercises, dayInventory);
  if (structure.realSameRoleRedundancy) return null;
  if (structure.wouldBreakStructure) return 'acceptable_posterior_chain_structure';
  if (structure.hamstringsSelected && structure.lowerHeavy && structure.quadPatternPresent && structure.subtypeCounts.length >= 2) {
    return 'acceptable_posterior_chain_structure';
  }
  if (structure.subtypeCounts.length >= 2) {
    return 'acceptable_posterior_chain_structure';
  }
  return null;
}

function classifyAcceptableDuplicationType(familyGroup, dayType = '', priorityGroups = [], exercises = [], dayInventory = []) {
  if (familyGroup === 'horizontal_row' && isAcceptableHorizontalRowDuplication(dayType, priorityGroups, exercises)) {
    return 'acceptable_priority_specific_duplication';
  }
  if (familyGroup === 'vertical_pull') {
    return classifyVerticalPullDuplicationType(priorityGroups, exercises);
  }
  if (familyGroup === 'core_flexion') {
    return classifyCoreFlexionDuplicationType(priorityGroups, exercises);
  }
  if (familyGroup === 'squat_leg_press' && isAcceptableSquatLegPressStructure(dayType, exercises)) {
    return 'acceptable_lower_structure';
  }
  if (familyGroup === 'hinge_posterior_chain') {
    return classifyHingePosteriorDuplicationType(dayType, priorityGroups, exercises, dayInventory);
  }
  if (isAcceptablePrioritySpecificDuplication(familyGroup, priorityGroups, exercises)) {
    return 'acceptable_priority_specific_duplication';
  }
  return null;
}

function lowerMainRoleKey(exerciseName = '') {
  const name = normalizeName(exerciseName);
  if (/smith machine leg press|leg press/.test(name)) return 'leg_press';
  if (/barbell hack squat|hack squat/.test(name)) return 'hack_squat';
  if (/front squat/.test(name)) return 'front_squat';
  if (/back squat|barbell squat|\bsquat\b/.test(name) && !/split squat|lunge/.test(name)) return 'squat';
  if (/split squat|lunge|step up|step-up/.test(name)) return 'unilateral';
  if (/leg extension/.test(name)) return 'leg_extension';
  return 'other';
}

function isClearlyRedundantSquatLegPressPair(items = []) {
  if (!Array.isArray(items) || items.length !== 2) return false;
  const roles = items.map((item) => lowerMainRoleKey(item?.exerciseName || item?.name));
  if (roles.includes('other')) return false;
  return roles[0] === roles[1] && !['unilateral', 'leg_extension'].includes(roles[0]);
}

function isDirectQuadAccessory(exerciseName = '') {
  const role = lowerMainRoleKey(exerciseName);
  return role === 'leg_extension' || role === 'unilateral';
}

function verticalPullRoleKey(exerciseName = '') {
  const name = normalizeName(exerciseName);
  if (/wide-grip/.test(name)) return 'wide_grip_pulldown';
  if (/close-grip front lat pulldown|close grip front lat pulldown/.test(name)) return 'close_grip_front_pulldown';
  if (/v-bar pulldown/.test(name)) return 'v_bar_pulldown';
  if (/full range-?of-?motion lat pulldown/.test(name)) return 'full_rom_pulldown';
  if (/lat pulldown/.test(name)) return 'lat_pulldown';
  if (/chin-up|chin up/.test(name)) return 'chin_up';
  if (/pull-up|pull up/.test(name)) return 'pull_up';
  return 'other_vertical_pull';
}

function coreFlexionRoleKey(exerciseName = '') {
  const name = normalizeName(exerciseName);
  if (/cable reverse crunch|cable bench reverse crunch|reverse crunch/.test(name)) return 'reverse_crunch_lower_abs';
  if (/3\/4 sit-up|3\/4 sit up|decline sit-up|decline sit up|sit-up|sit up/.test(name)) return 'situp_variation';
  if (/ab crunch machine|rope crunch|cable crunch|\bcrunch\b/.test(name)) return 'upper_abs_crunch';
  return 'other_core_flexion';
}

function classifyCoreFlexionDuplicationType(priorityGroups = [], exercises = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').trim().toLowerCase()));
  const absSelected = priorities.has('abs') || priorities.has('core');
  const items = Array.isArray(exercises) ? exercises : [];
  if (items.length < 2) return null;
  const roleKeys = items.map((item) => coreFlexionRoleKey(item?.exerciseName || item?.name));
  if (roleKeys.some((role) => role === 'other_core_flexion')) return null;
  const distinctRoles = new Set(roleKeys).size;
  if (distinctRoles < roleKeys.length) return null;
  if (absSelected && items.length <= 2) return 'acceptable_priority_specific_duplication';
  return null;
}

function classifyVerticalPullDuplicationType(priorityGroups = [], exercises = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').trim().toLowerCase()));
  const items = Array.isArray(exercises) ? exercises : [];
  if (!priorities.has('back')) return null;
  if (items.length !== 2) return null;
  const roleKeys = items.map((item) => verticalPullRoleKey(item?.exerciseName || item?.name));
  if (roleKeys.some((role) => role === 'other_vertical_pull')) return null;
  if (roleKeys[0] === roleKeys[1]) return null;
  return 'acceptable_priority_specific_duplication';
}

function buildSquatPrioritySafety(priorityGroups = [], familyItems = [], targetExerciseName = '', proposedReplacement = '') {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '')));
  const quadsSelected = priorities.has('Quads') || priorities.has('Legs');
  const hamGlutesSelected = priorities.has('Hamstrings/Glutes') || priorities.has('Glutes');
  const replacingDirectQuadAccessory = isDirectQuadAccessory(targetExerciseName);
  const directQuadAccessoriesBefore = familyItems.filter((item) => isDirectQuadAccessory(item?.exerciseName || item?.name));
  const isOnlyDirectQuadAccessory = replacingDirectQuadAccessory && directQuadAccessoriesBefore.length <= 1;
  const replacementIsHamCurl = /seated leg curl|lying leg curl|hamstring curl|leg curl/i.test(String(proposedReplacement || ''));

  if (quadsSelected && /leg extensions?/i.test(String(targetExerciseName || ''))) {
    return {
      prioritySafe: false,
      reason: 'quads_priority_blocks_leg_extension_replacement'
    };
  }
  if (quadsSelected && isOnlyDirectQuadAccessory) {
    return {
      prioritySafe: false,
      reason: 'quads_priority_blocks_only_direct_quad_accessory_removal'
    };
  }
  if (!quadsSelected && hamGlutesSelected && /leg extensions?/i.test(String(targetExerciseName || '')) && replacementIsHamCurl) {
    return {
      prioritySafe: true,
      reason: 'hamstrings_glutes_priority_allows_leg_extension_to_ham_curl_swap'
    };
  }
  return {
    prioritySafe: true,
    reason: 'priority_safe'
  };
}

function classifyHingePosteriorSubtype(exerciseName = '') {
  const name = normalizeName(exerciseName);
  if (/hip thrust|glute bridge/.test(name)) return 'hip thrust / glute bridge';
  if (/glute ham raise|glute-ham raise|ghr/.test(name)) return 'glute-ham raise';
  if (/seated leg curl|lying leg curl|hamstring curl|leg curl/.test(name)) return 'hamstring curl';
  if (/back extension|hyperextension/.test(name)) return 'back extension/hyperextension';
  if (/deadlift|romanian deadlift|\brdl\b|stiff-leg deadlift|good morning|pull through/.test(name)) return 'hip hinge';
  return 'other posterior accessory';
}

function buildHingePosteriorPatternKey(items = []) {
  return items
    .map((item) => classifyHingePosteriorSubtype(item?.exerciseName || item?.name))
    .sort()
    .join(' + ');
}

function hasRequiredQuadPattern(dayInventory = []) {
  return dayInventory.some((item) => item?.canonicalFamily === 'squat_leg_press');
}

function hasAccessoryFamily(dayInventory = [], family) {
  return dayInventory.some((item) => {
    const canonical = String(item?.canonicalFamily || '');
    if (family === 'calves') return canonical === 'calf_raise';
    if (family === 'core') return canonical === 'core_flexion' || canonical === 'core_rotation_or_stability';
    return false;
  });
}

function evaluateHingePosteriorStructure(dayType = '', priorityGroups = [], hingeItems = [], dayInventory = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').trim().toLowerCase()));
  const hamstringsSelected = priorities.has('hamstrings/glutes') || priorities.has('hamstrings_glutes') || priorities.has('glutes');
  const lowerHeavy = isLowerHeavyDay(dayType);
  const quadPatternPresent = hasRequiredQuadPattern(dayInventory);
  const calfAccessoryPresent = hasAccessoryFamily(dayInventory, 'calves');
  const coreAccessoryPresent = hasAccessoryFamily(dayInventory, 'core');
  const subtypes = hingeItems.map((item) => classifyHingePosteriorSubtype(item?.exerciseName || item?.name));
  const subtypeCounts = new Map();
  for (const subtype of subtypes) subtypeCounts.set(subtype, Number(subtypeCounts.get(subtype) || 0) + 1);
  const sameRoleRedundancy = [...subtypeCounts.values()].some((count) => count > 1);
  const uniqueSubtypeCount = subtypeCounts.size;
  const hasPrimaryHinge = subtypes.includes('hip hinge') || subtypes.includes('hip thrust / glute bridge');
  const hasKneeFlexion = subtypes.includes('hamstring curl') || subtypes.includes('glute-ham raise');
  const hasPosteriorAccessory = subtypes.includes('back extension/hyperextension') || subtypes.includes('other posterior accessory');
  const posteriorStructureComplete = hasPrimaryHinge && (hasKneeFlexion || hasPosteriorAccessory);
  const wouldBreakStructure = Boolean(
    lowerHeavy
    && quadPatternPresent
    && posteriorStructureComplete
    && hingeItems.length <= 3
    && uniqueSubtypeCount >= 2
  );
  const acceptablePrioritySpecificDuplication = Boolean(
    hamstringsSelected
    && !sameRoleRedundancy
    && lowerHeavy
    && quadPatternPresent
    && posteriorStructureComplete
    && uniqueSubtypeCount >= 2
  );
  return {
    hamstringsSelected,
    lowerHeavy,
    quadPatternPresent,
    calfAccessoryPresent,
    coreAccessoryPresent,
    wouldBreakStructure,
    acceptablePrioritySpecificDuplication,
    realSameRoleRedundancy: sameRoleRedundancy,
    subtypeCounts: [...subtypeCounts.entries()].map(([subtype, count]) => ({ subtype, count }))
  };
}

function buildSquatLegPressSafetySimulation(plan, priorityGroups = []) {
  const rows = [];
  const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
  for (const week of weeks) {
    for (const day of Array.isArray(week?.days) ? week.days : []) {
      const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
      const familyItems = exercises
        .map((exercise, exerciseIndex) => ({
          exerciseIndex,
          exercise,
          exerciseName: String(exercise?.name || '').trim(),
          canonicalFamily: trainingRoutes._private.getCanonicalMovementFamily(exercise)
        }))
        .filter((item) => item.canonicalFamily === 'squat_leg_press');
      if (familyItems.length < 2) continue;
      const normalizedDayType = String(day?.dayType || '').trim().toLowerCase();
      const clearlyRedundantPair = familyItems.length === 2 && isClearlyRedundantSquatLegPressPair(familyItems);
      if (familyItems.length < 3 && !clearlyRedundantPair) continue;

      const keepIndexes = new Set(trainingRoutes._private.simulateCanonicalKeepIndexes(
        normalizedDayType,
        'squat_leg_press',
        exercises,
        priorityGroups.map((value) => String(value || '').toLowerCase())
      ));
      let replaceTargets = familyItems.filter((item) => !keepIndexes.has(item.exerciseIndex));
      if (clearlyRedundantPair && !replaceTargets.length) {
        replaceTargets = familyItems.slice(1);
      }

      for (const target of replaceTargets) {
        const others = exercises.filter((_, idx) => idx !== target.exerciseIndex);
        const replacement = trainingRoutes._private.simulateTargetedCanonicalReplacement(
          normalizedDayType,
          'squat_leg_press',
          target.exercise,
          others,
          priorityGroups.map((value) => String(value || '').toLowerCase()),
          {
            currentIndex: target.exerciseIndex,
            missingHinge: !others.some((exercise) => trainingRoutes._private.getCanonicalMovementFamily(exercise) === 'hinge_posterior_chain')
          }
        );
        const attemptRoles = Array.isArray(replacement?.attemptDiagnostics) ? replacement.attemptDiagnostics : [];
        const selectedRole = attemptRoles.find((entry) => entry?.selectedCandidate) || null;
        const selectedCandidate = selectedRole
          ? (selectedRole.candidateAttempts || []).find((candidate) => candidate.candidateName === selectedRole.selectedCandidate) || null
          : null;
        const firstCandidate = selectedRole?.candidateAttempts?.[0]
          || attemptRoles.flatMap((entry) => Array.isArray(entry.candidateAttempts) ? entry.candidateAttempts : [])[0]
          || null;
        const chosenCandidate = selectedCandidate || firstCandidate;
        const safety = chosenCandidate?.safetySimulation || null;
        const prioritySafety = buildSquatPrioritySafety(
          priorityGroups,
          familyItems,
          target.exerciseName,
          chosenCandidate?.candidateName || ''
        );
        const finalAccept = Boolean(safety?.finalValidatorWouldPass) && Boolean(prioritySafety.prioritySafe);
        rows.push({
          combo: [],
          week: Number(week?.weekIndex || 0) || 1,
          day: String(day?.day || '').trim() || null,
          dayType: String(day?.dayType || '').trim() || null,
          squatLegPressExercises: familyItems.map((item) => item.exerciseName),
          exerciseBeingReplaced: target.exerciseName,
          proposedReplacement: chosenCandidate?.candidateName || null,
          finalValidatorWouldPass: safety ? Boolean(safety.finalValidatorWouldPass) : false,
          prioritySafe: Boolean(prioritySafety.prioritySafe),
          acceptRejectDecision: finalAccept ? 'accept' : 'reject',
          reason: !prioritySafety.prioritySafe
            ? prioritySafety.reason
            : (safety?.finalValidatorReason
              || selectedRole?.failureReasons?.[0]
              || attemptRoles[0]?.failureReasons?.[0]
              || (finalAccept ? 'accepted' : 'no_candidate'))
        });
      }
    }
  }
  return rows;
}

function buildHingePosteriorChainDiagnostic(comboRuns) {
  const rows = [];
  for (const comboResult of comboRuns) {
    for (const detail of Array.isArray(comboResult.redundancyDetails) ? comboResult.redundancyDetails : []) {
      if (detail?.repeatedMovementFamily !== 'hinge_posterior_chain') continue;
      const selectedPriorities = Array.isArray(detail?.selectedPriorities) && detail.selectedPriorities.length
        ? detail.selectedPriorities
        : comboResult.combo;
      const hingeExercises = (Array.isArray(detail.exercises) ? detail.exercises : []).map((entry) => ({
        exerciseName: entry.exerciseName,
        subtype: classifyHingePosteriorSubtype(entry.exerciseName)
      }));
      const structure = evaluateHingePosteriorStructure(
        detail?.dayType,
        selectedPriorities,
        hingeExercises,
        []
      );
      rows.push({
        combo: comboResult.combo,
        week: detail.week,
        day: detail.day,
        dayType: detail.dayType,
        selectedPriorities,
        hingePosteriorExercises: hingeExercises,
        hamstringsGlutesSelected: structure.hamstringsSelected,
        lowerHeavyDay: structure.lowerHeavy,
        requiredQuadPatternPresent: Boolean(detail?.hasQuadPattern),
        calfAccessoryPresent: Boolean(detail?.hasCalfAccessory),
        coreAccessoryPresent: Boolean(detail?.hasCoreAccessory),
        wouldBreakStructure: Boolean(
          (structure.lowerHeavy && detail?.hasQuadPattern && hingeExercises.length <= 3 && structure.subtypeCounts.length >= 2)
          || (structure.lowerHeavy && !detail?.hasQuadPattern)
        ),
        acceptablePrioritySpecificDuplication: Boolean(
          structure.hamstringsSelected
          && structure.lowerHeavy
          && detail?.hasQuadPattern
          && structure.subtypeCounts.length >= 2
          && !structure.realSameRoleRedundancy
        ),
        realSameRoleRedundancy: Boolean(structure.realSameRoleRedundancy),
        subtypeCounts: structure.subtypeCounts,
        topPattern: buildHingePosteriorPatternKey(hingeExercises)
      });
    }
  }
  return rows.sort((left, right) => {
    const comboCmp = (left.combo || []).join(' + ').localeCompare((right.combo || []).join(' + '));
    if (comboCmp) return comboCmp;
    const weekCmp = Number(left.week || 0) - Number(right.week || 0);
    if (weekCmp) return weekCmp;
    return String(left.dayType || '').localeCompare(String(right.dayType || ''));
  });
}

function buildTopRepeatedHingePosteriorPatterns(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row?.topPattern || 'unknown');
    const entry = grouped.get(key) || {
      pattern: key,
      count: 0,
      acceptablePrioritySpecificDuplication: 0,
      realSameRoleRedundancy: 0,
      examples: []
    };
    entry.count += 1;
    if (row?.acceptablePrioritySpecificDuplication) entry.acceptablePrioritySpecificDuplication += 1;
    if (row?.realSameRoleRedundancy) entry.realSameRoleRedundancy += 1;
    if (entry.examples.length < 3) {
      entry.examples.push({
        combo: row.combo,
        week: row.week,
        day: row.day,
        dayType: row.dayType
      });
    }
    grouped.set(key, entry);
  }
  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
    .slice(0, 10);
}

function buildDayFamilyInventory(day, user) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  return exercises.map((exercise, exerciseIndex) => {
    const truth = engine.buildExerciseTruth(exercise, user);
    const fields = exerciseDatabaseFields(exercise, truth);
    const canonicalFamily = resolvedCanonicalMovementFamily(exercise, truth);
    const cleanupFamily = resolvedCanonicalMovementFamily(exercise, truth);
    const warningFamily = resolvedCanonicalMovementFamily(exercise, truth);
    const currentFamily = resolvedCanonicalMovementFamily(exercise, truth);
    const legacyFamily = broadFamilyGroupFromCurrentKey(movementFamilyKey(exercise, truth));
    const dbFamily = canonicalFamilyFromDatabaseFields(fields);
    const impliedFamily = nameImpliedFamily(exercise);
    return {
      exerciseIndex,
      exerciseName: String(exercise?.name || '').trim(),
      exercise,
      truth,
      fields,
      canonicalFamily,
      cleanupFamily,
      warningFamily,
      currentFamily,
      legacyFamily,
      dbFamily,
      impliedFamily,
      currentLogicClassifiedCorrectly: canonicalFamily === cleanupFamily && canonicalFamily === warningFamily && canonicalFamily === currentFamily,
      targetPrimaryConflict: conflictBetweenTargetAndPrimary(fields),
      nameDbMismatch: impliedFamily !== 'general' && dbFamily !== 'general' && impliedFamily !== dbFamily
    };
  });
}

function summarizeCleanupCause({ finalItems, rawItems, familyGroup, priorityGroups, dayType, dayInventory }) {
  if (finalItems.some((item) => !item.currentLogicClassifiedCorrectly)) return 'actual_production_classifier_problem';
  const acceptableType = classifyAcceptableDuplicationType(familyGroup, dayType, priorityGroups, finalItems, dayInventory);
  if (acceptableType) return acceptableType;
  if (familyGroup === 'core_flexion') {
    const roleKeys = finalItems.map((item) => coreFlexionRoleKey(item?.exerciseName || item?.name));
    if (roleKeys.length > 1 && roleKeys.every((role) => role === 'upper_abs_crunch')) {
      return 'no_safe_replacement_found';
    }
  }
  if (!rawItems.length) return 'cleanup_logic_not_running';
  if (rawItems.length === finalItems.length) return 'cleanup_logic_not_running';
  return 'cleanup_logic_running_but_no_replacement_found';
}

function isTargetCleanupFamily(familyGroup) {
  return familyGroup === 'horizontal_row' || familyGroup === 'squat_leg_press';
}

function buildCleanupDiagnosticLookup(plan) {
  const lookup = new Map();
  const entries = Array.isArray(plan?.meta?._finalVisibleCleanupDiagnostics) ? plan.meta._finalVisibleCleanupDiagnostics : [];
  for (const entry of entries) {
    const key = [
      String(entry?.week ?? ''),
      String(entry?.day || ''),
      String(entry?.dayType || '').trim().toLowerCase(),
      String(entry?.family || '').trim().toLowerCase()
    ].join('|');
    const bucket = lookup.get(key) || [];
    bucket.push(entry);
    lookup.set(key, bucket);
  }
  return lookup;
}

function classifyCleanupDiagnosticCause(diag, fallbackCause) {
  if (!diag) return fallbackCause;
  if (fallbackCause === 'acceptable_priority_specific_duplication' || fallbackCause === 'acceptable_lower_structure') return fallbackCause;
  if (diag.cleanupOverwrittenLater) return 'cleanup_overwritten_later';
  if (diag.skipReason === 'would_break_structure') return 'cleanup_skipped_would_break_structure';
  if (diag.skipReason === 'would_remove_only_quad_pattern') return 'cleanup_skipped_would_remove_only_quad_pattern';
  if (diag.thresholdMismatch && !diag.cleanupTriggered && Number(diag.familyCountBeforeCleanup || 0) >= Number(diag.warningThresholdUsed || 2)) {
    return 'cleanup_threshold_mismatch';
  }
  if (diag.cleanupTriggered && Array.isArray(diag.replacementSelected) && !diag.replacementSelected.length) {
    return 'cleanup_logic_running_but_no_replacement_found';
  }
  if (!diag.cleanupTriggered) return 'cleanup_logic_not_running';
  return fallbackCause;
}

function selectRelevantCleanupDiagnostic(diags = []) {
  if (!Array.isArray(diags) || !diags.length) return null;
  const ranked = diags.slice().sort((left, right) => {
    const leftScore = Number(Boolean(left?.cleanupOverwrittenLater)) * 100
      + Number(Boolean(left?.cleanupTriggered)) * 10
      + Number(left?.cleanupPhase === 'post_finalize');
    const rightScore = Number(Boolean(right?.cleanupOverwrittenLater)) * 100
      + Number(Boolean(right?.cleanupTriggered)) * 10
      + Number(right?.cleanupPhase === 'post_finalize');
    return rightScore - leftScore;
  });
  return ranked[0] || null;
}

function buildPlanSignature(plan) {
  return JSON.stringify((Array.isArray(plan?.weeks) ? plan.weeks : []).map((week) => ({
    weekIndex: Number(week?.weekIndex || 0),
    days: (Array.isArray(week?.days) ? week.days : []).map((day) => ({
      day: String(day?.day || ''),
      dayType: String(day?.dayType || ''),
      exercises: (Array.isArray(day?.exercises) ? day.exercises : []).map((exercise) => String(exercise?.name || ''))
    }))
  })));
}

function directSetSummary(plan, user) {
  const totals = {
    chest: 0,
    back: 0,
    shoulders: 0,
    arms: 0,
    biceps: 0,
    triceps: 0,
    glutes: 0,
    legs: 0,
    abs: 0
  };
  for (const { exercise } of flattenPlanExercises(plan?.weeks)) {
    const truth = engine.buildExerciseTruth(exercise, user);
    const sets = Math.max(0, Number(exercise?.sets || 0));
    if (truth?.pressRole === 'chest_press' || truth?.pressRole === 'mixed' || String(truth?.primaryMuscle || '') === 'Chest') totals.chest += sets;
    if (truth?.pullRole === 'back_builder' || String(truth?.primaryMuscle || '') === 'Back') totals.back += sets;
    if (truth?.shoulderPressPattern || truth?.lateralDeltPattern || truth?.rearDeltPattern || String(truth?.primaryMuscle || '') === 'Shoulders') totals.shoulders += sets;
    if (truth?.directArmType === 'biceps') {
      totals.arms += sets;
      totals.biceps += sets;
    }
    if (truth?.directArmType === 'triceps') {
      totals.arms += sets;
      totals.triceps += sets;
    }
    if (truth?.glutePrimaryStrength && truth.glutePrimaryStrength !== 'none') totals.glutes += sets;
    if (isQuadPattern(truth, exercise) || isHingePattern(truth, exercise) || ['Legs', 'Quads'].includes(String(truth?.primaryMuscle || ''))) totals.legs += sets;
    if (truth?.directAb) totals.abs += sets;
  }
  return totals;
}

function analyzeWarnings(plan, rawPlan, user) {
  const warnings = [];
  const redundancyDetails = [];
  const labelAuditMap = new Map();
  const canonicalMapBuckets = new Map();
  const cleanupDiagnosticLookup = buildCleanupDiagnosticLookup(plan);
  const week = Array.isArray(plan?.weeks) ? plan.weeks[0] : null;
  const weekPlan = week ? { ...plan, weeks: [week] } : { ...plan, weeks: [] };
  const rawWeek = Array.isArray(rawPlan?.weeks) ? rawPlan.weeks[0] : null;
  const directSets = directSetSummary(weekPlan, user);
  const priorityGroups = Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [];
  const weeklyTargets = plan?.meta?.weeklyTargets || {};
  const days = Array.isArray(week?.days) ? week.days : [];
  let rearDeltDays = 0;
  let rearDeltSets = 0;

  days.forEach((day, dayIndex) => {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    const dayInventory = buildDayFamilyInventory(day, user);
    const rawDay = Array.isArray(rawWeek?.days) ? rawWeek.days[dayIndex] : null;
    const rawInventory = rawDay ? buildDayFamilyInventory(rawDay, user) : [];
    const nameCounts = new Map();
    const familyCounts = new Map();
    let shoulderPressCount = 0;
    let lateralCount = 0;
    let rearDeltCount = 0;
    let hasQuad = false;
    let hasHinge = false;
    const lowerFamilies = new Set();
    exercises.forEach((exercise) => {
      const truth = engine.buildExerciseTruth(exercise, user);
      const sets = Math.max(0, Number(exercise?.sets || 0));
      const nameKey = normalizeName(exercise?.name);
      nameCounts.set(nameKey, Number(nameCounts.get(nameKey) || 0) + 1);
      const familyKey = resolvedCanonicalMovementFamily(exercise, truth);
      familyCounts.set(familyKey, Number(familyCounts.get(familyKey) || 0) + 1);
      if (truth?.shoulderPressPattern) shoulderPressCount += 1;
      if (truth?.lateralDeltPattern) lateralCount += 1;
      if (truth?.rearDeltPattern) {
        rearDeltCount += 1;
        rearDeltSets += sets;
      }
      if (isQuadPattern(truth, exercise)) hasQuad = true;
      if (isHingePattern(truth, exercise)) hasHinge = true;
      const lowerFamily = lowerMovementFamilyKey(exercise, truth);
      if (lowerFamily) lowerFamilies.add(lowerFamily);
    });
    if (rearDeltCount > 0) rearDeltDays += 1;
    const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    if (duplicateNames.length) {
      warnings.push({
        type: 'duplicate_exercise_names',
        severity: 'warning',
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null,
        duplicateNames
      });
      warnings.push({
        type: 'exact_same_exercise_twice_in_day',
        severity: 'warning',
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null,
        duplicateNames
      });
    }
    const duplicateFamilies = [...familyCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([family, count]) => ({ family, count }));
    const reportableDuplicateFamilies = duplicateFamilies.filter((duplicate) => {
      const familyGroup = String(duplicate.family || '');
      const finalItems = dayInventory.filter((item) => item.canonicalFamily === familyGroup);
      return !classifyAcceptableDuplicationType(familyGroup, day?.dayType, priorityGroups, finalItems, dayInventory);
    });
    if (reportableDuplicateFamilies.length) {
      warnings.push({
        type: 'duplicate_movement_families',
        severity: 'warning',
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null,
        duplicateFamilies: reportableDuplicateFamilies
      });
      for (const duplicate of reportableDuplicateFamilies) {
        const familyGroup = String(duplicate.family || '');
        const finalItems = dayInventory.filter((item) => item.canonicalFamily === familyGroup);
        const rawItems = rawInventory.filter((item) => item.canonicalFamily === familyGroup);
        const cause = summarizeCleanupCause({
          finalItems,
          rawItems,
          familyGroup,
          priorityGroups,
          dayType: day?.dayType,
          dayInventory
        });
        const cleanupDiagnosticKey = [
          String(Number(week?.weekIndex || 0) || 1),
          String(day?.day || '').trim() || '',
          String(day?.dayType || '').trim().toLowerCase(),
          familyGroup
        ].join('|');
        const cleanupDiagnostic = isTargetCleanupFamily(familyGroup)
          ? selectRelevantCleanupDiagnostic(cleanupDiagnosticLookup.get(cleanupDiagnosticKey) || [])
          : null;
        const resolvedCause = isTargetCleanupFamily(familyGroup)
          ? classifyCleanupDiagnosticCause(cleanupDiagnostic, cause)
          : cause;
        const detail = {
          combo: [],
          week: Number(week?.weekIndex || 0) || 1,
          dayIndex,
          day: String(day?.day || '').trim() || null,
          dayType: String(day?.dayType || '').trim() || null,
          selectedPriorities: priorityGroups.slice(),
          repeatedMovementFamily: familyGroup,
          currentLogicFamily: duplicate.family,
          count: duplicate.count,
          cause: resolvedCause,
          acceptablePrioritySpecificDuplication: resolvedCause === 'acceptable_priority_specific_duplication',
          hasQuadPattern: hasQuad,
          hasHingePattern: hasHinge,
          hasCalfAccessory: dayInventory.some((item) => item.canonicalFamily === 'calf_raise'),
          hasCoreAccessory: dayInventory.some((item) => item.canonicalFamily === 'core_flexion' || item.canonicalFamily === 'core_rotation_or_stability'),
          fullDayExercises: exercises.map((exercise) => snapshotExerciseForMatrix(exercise)),
          cleanupDiagnostic,
          exercises: finalItems.map((item) => ({
            exerciseIndex: item.exerciseIndex,
            exerciseName: item.exerciseName,
            exerciseSnapshot: snapshotExerciseForMatrix(item.exercise),
            primaryMuscles: item.fields.primaryMuscles,
            secondaryMuscles: item.fields.secondaryMuscles,
            targetRegion: item.fields.targetRegion,
            subMuscleGroups: item.fields.subMuscleGroups,
            equipment: item.fields.equipment,
            mechanic: item.fields.mechanic,
            force: item.fields.force,
            category: item.fields.category,
            dbFamily: item.dbFamily,
            impliedFamily: item.impliedFamily,
            canonicalFamily: item.canonicalFamily,
            cleanupFamily: item.cleanupFamily,
            warningFamily: item.warningFamily,
            currentLogicFamily: item.currentFamily,
            legacyFamily: item.legacyFamily,
            currentLogicClassifiedCorrectly: item.currentLogicClassifiedCorrectly,
            targetPrimaryConflict: item.targetPrimaryConflict,
            nameDbMismatch: item.nameDbMismatch
          }))
        };
        redundancyDetails.push(detail);
        for (const item of finalItems) {
          if (item.targetPrimaryConflict || item.nameDbMismatch || !item.currentLogicClassifiedCorrectly) {
            const key = item.exerciseName;
            const existing = labelAuditMap.get(key) || {
              exerciseName: item.exerciseName,
              issues: new Set(),
              fields: item.fields,
              dbFamily: item.dbFamily,
              impliedFamily: item.impliedFamily,
              canonicalFamily: item.canonicalFamily,
              cleanupFamily: item.cleanupFamily,
              warningFamily: item.warningFamily,
              currentLogicFamily: item.currentFamily,
              legacyFamily: item.legacyFamily
            };
            if (item.targetPrimaryConflict) existing.issues.add('target_region_conflicts_with_primary_muscles');
            if (item.nameDbMismatch) existing.issues.add('name_implies_different_family_than_db_label');
            if (!item.currentLogicClassifiedCorrectly) existing.issues.add('actual_production_classifier_problem');
            labelAuditMap.set(key, existing);
          }
          const familyBucket = canonicalMapBuckets.get(item.canonicalFamily) || new Set();
          familyBucket.add(item.exerciseName);
          canonicalMapBuckets.set(item.canonicalFamily, familyBucket);
        }
      }
    }
    if (shoulderPressCount > 1) {
      warnings.push({
        type: 'duplicate_shoulder_press_patterns',
        severity: 'warning',
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null,
        shoulderPressCount
      });
    }
    if (lateralCount > 2) {
      warnings.push({
        type: 'lateral_delt_over_cap',
        severity: 'warning',
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null,
        lateralCount
      });
    }
    if (isLowerHeavyDay(day?.dayType) && !hasHinge) {
      warnings.push({
        type: 'missing_hinge_on_lower_day',
        severity: 'warning',
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null
      });
    }
    if (['legs', 'lower', 'lowerfocus'].includes(String(day?.dayType || '').trim().toLowerCase()) && !hasQuad) {
      warnings.push({
        type: 'missing_quad_pattern_on_lower_day',
        severity: 'warning',
        dayIndex,
        day: String(day?.day || '').trim() || null,
        dayType: String(day?.dayType || '').trim() || null
      });
    }
    day.__lowerFamiliesForMatrix = [...lowerFamilies];
  });

  for (let i = 0; i < days.length - 1; i += 1) {
    const current = days[i];
    const next = days[i + 1];
    if (!isLowerHeavyDay(current?.dayType) || !isLowerHeavyDay(next?.dayType)) continue;
    const left = new Set(Array.isArray(current?.__lowerFamiliesForMatrix) ? current.__lowerFamiliesForMatrix : []);
    const right = new Set(Array.isArray(next?.__lowerFamiliesForMatrix) ? next.__lowerFamiliesForMatrix : []);
    const overlap = [...left].filter((family) => right.has(family));
    if (overlap.length >= 3) {
      warnings.push({
        type: 'back_to_back_lower_family_repetition',
        severity: 'warning',
        firstDay: String(current?.day || '').trim() || null,
        secondDay: String(next?.day || '').trim() || null,
        overlap
      });
    }
  }
  days.forEach((day) => { delete day.__lowerFamiliesForMatrix; });

  if (directSets.abs > 14) {
    warnings.push({
      type: 'core_sets_over_cap',
      severity: 'warning',
      directCoreSets: directSets.abs
    });
  }

  const priorities = new Set(priorityGroups);
  const rearDeltDayCap = priorities.has('Shoulders') && priorities.has('Back') ? 4 : priorities.has('Shoulders') ? 3 : 2;
  if (rearDeltDays > rearDeltDayCap || rearDeltSets > 12) {
    warnings.push({
      type: 'rear_delt_over_cap',
      severity: 'warning',
      rearDeltDays,
      rearDeltSets,
      allowedDayCap: rearDeltDayCap,
      hardSetCap: 12
    });
  }

  const priorityChecks = [
    { key: 'Chest', directKey: 'chest', target: Number(weeklyTargets?.Chest || 0) },
    { key: 'Back', directKey: 'back', target: Number(weeklyTargets?.Back || 0) },
    { key: 'Shoulders', directKey: 'shoulders', target: Number(weeklyTargets?.Shoulders || 0) },
    { key: 'Arms', directKey: 'arms', target: Number(weeklyTargets?.Arms || (Number(weeklyTargets?.Biceps || 0) + Number(weeklyTargets?.Triceps || 0))) },
    { key: 'Glutes', directKey: 'glutes', target: Number(weeklyTargets?.Glutes || 0) },
    { key: 'Legs', directKey: 'legs', target: Number(weeklyTargets?.Legs || (Number(weeklyTargets?.Quads || 0) + Number(weeklyTargets?.Hamstrings || 0) + Number(weeklyTargets?.Glutes || 0))) },
    { key: 'Abs', directKey: 'abs', target: Number(weeklyTargets?.Abs || weeklyTargets?.Core || 0) },
    { key: 'Core', directKey: 'abs', target: Number(weeklyTargets?.Core || weeklyTargets?.Abs || 0) }
  ];
  for (const check of priorityChecks) {
    if (!priorities.has(check.key)) continue;
    if (check.target <= 0) continue;
    const direct = Number(directSets[check.directKey] || 0);
    if (direct < Math.max(6, Math.floor(check.target * 0.75))) {
      warnings.push({
        type: 'priority_volume_underfilled',
        severity: 'warning',
        priority: check.key,
        directSets: direct,
        target: check.target
      });
    }
  }

  const bannedOrNovelty = flattenPlanExercises(weekPlan?.weeks).filter(({ exercise }) => {
    const name = normalizeName(exercise?.name);
    return ROUTE_BANNED_NAME_PATTERNS.some((rx) => rx.test(name))
      || (/\bneck\b/.test(name) && !priorities.has('Neck'))
      || /\bnovelty\b/.test(name);
  }).map(({ exercise, day }) => ({
    exercise: String(exercise?.name || '').trim(),
    day: String(day?.day || '').trim() || null,
    dayType: String(day?.dayType || '').trim() || null
  }));
  if (bannedOrNovelty.length) {
    warnings.push({
      type: 'banned_or_novelty_or_neck',
      severity: 'warning',
      items: bannedOrNovelty
    });
  }

  const rawSignature = rawPlan?.error ? null : buildPlanSignature(rawPlan);
  const finalSignature = buildPlanSignature(plan);
  if (rawSignature && rawSignature !== finalSignature) {
    warnings.push({
      type: 'final_visible_plan_differs_from_raw_builder',
      severity: 'info'
    });
  }

  return {
    warnings,
    metrics: {
      directSets,
      rearDeltDays,
      rearDeltSets,
      bicepsDirectSets: directSets.biceps,
      tricepsDirectSets: directSets.triceps
    },
    redundancyDetails,
    databaseLabelAudit: [...labelAuditMap.values()].map((entry) => ({
      exerciseName: entry.exerciseName,
      issues: [...entry.issues].sort(),
      fields: entry.fields,
      dbFamily: entry.dbFamily,
      impliedFamily: entry.impliedFamily,
      canonicalFamily: entry.canonicalFamily,
      cleanupFamily: entry.cleanupFamily,
      warningFamily: entry.warningFamily,
      currentLogicFamily: entry.currentLogicFamily
    })),
    canonicalMovementFamilyMapProposal: [...canonicalMapBuckets.entries()]
      .map(([family, names]) => ({
        canonicalFamily: family,
        exercises: [...names].sort()
      }))
      .sort((a, b) => a.canonicalFamily.localeCompare(b.canonicalFamily)),
    familyConsistencyCheck: [...labelAuditMap.values()].map((entry) => ({
      exerciseName: entry.exerciseName,
      canonicalFamily: entry.canonicalFamily,
      cleanupFamily: entry.cleanupFamily,
      warningFamily: entry.warningFamily,
      currentFamily: entry.currentLogicFamily,
      legacyFamily: entry.legacyFamily,
      consistent: entry.canonicalFamily === entry.cleanupFamily
        && entry.canonicalFamily === entry.warningFamily
        && entry.canonicalFamily === entry.currentLogicFamily
    })).sort((a, b) => Number(a.consistent) - Number(b.consistent) || a.exerciseName.localeCompare(b.exerciseName)),
    squatLegPressSafetySimulation: buildSquatLegPressSafetySimulation(plan, priorityGroups)
  };
}

function collectContractWarnings(plan) {
  return Array.isArray(plan?.meta?.validationWarnings)
    ? plan.meta.validationWarnings.map((warning) => ({ ...warning }))
    : [];
}

function classifyRootPattern(type, context = {}) {
  const message = String(context?.message || '').toLowerCase();
  const functionName = String(context?.functionName || '').toLowerCase();
  const code = String(context?.error || '').toLowerCase();
  if (type === 'failure') {
    if (code === 'plan_build_timeout' || message.includes('timed out') || String(context?.failedStage || '').toLowerCase().includes('timeout')) return 'timeout_or_worker_path';
    if (functionName.includes('assertbodybuildingplanbyengine') || message.includes('validation')) return 'validators_too_strict_or_final_validation';
    if (message.includes('rear-delt') || message.includes('rear delt')) return 'rear_delt_frequency_or_volume';
    if (message.includes('delts+arms') || message.includes('deltsarms')) return 'delts_arms_role_repair';
    if (message.includes('hinge') || message.includes('lower')) return 'lower_day_structure_or_repair';
    return 'builder_or_route_failure_other';
  }
  if (type === 'warning') {
    if (context?.warningType && String(context.warningType).startsWith('soft_')) return 'validators_too_strict_or_final_validation';
    if (context?.warningType && ['day_structure_not_ideal', 'same_day_redundancy', 'soft_pull_structure', 'soft_shoulder_press_presence', 'soft_core_volume', 'soft_lower_day_ordering', 'soft_missing_weekly_rdl', 'soft_missing_hamstring_curl', 'soft_rear_delt_frequency', 'soft_lateral_raise_cap', 'soft_arm_role', 'soft_priority_fulfillment'].includes(String(context.warningType))) {
      return 'validators_too_strict_or_final_validation';
    }
    if (context?.warningType === 'priority_volume_underfilled') return 'priority_volume_underfilled';
    if (['duplicate_exercise_names', 'exact_same_exercise_twice_in_day', 'duplicate_movement_families', 'duplicate_shoulder_press_patterns', 'lateral_delt_over_cap'].includes(context?.warningType)) return 'same_day_redundancy';
    if (['missing_hinge_on_lower_day', 'missing_quad_pattern_on_lower_day', 'back_to_back_lower_family_repetition'].includes(context?.warningType)) return 'lower_day_structure_or_repair';
    if (context?.warningType === 'rear_delt_over_cap') return 'rear_delt_frequency_or_volume';
    if (context?.warningType === 'banned_or_novelty_or_neck') return 'banned_or_novelty_selection';
    if (context?.warningType === 'final_visible_plan_differs_from_raw_builder') return 'late_route_repair_changes_visible_output';
    if (context?.warningType === 'core_sets_over_cap') return 'core_volume_too_high';
    return 'quality_warning_other';
  }
  return 'other';
}

function isUnsupportedBuildError(error) {
  const code = String(error?.error || '').trim().toUpperCase();
  const message = `${String(error?.message || '')} ${String(error?.reason || '')}`.toLowerCase();
  if (/unsupported|not supported/.test(message)) return true;
  if (code === 'UNSUPPORTED') return true;
  if (code === 'INVALID_INPUT' && /unsupported/.test(message)) return true;
  return false;
}

async function evaluateRun(combo, runIndex, settings, scenario) {
  const comboLabel = combo.map((entry) => entry.label).join(' + ');
  const classicPayload = buildClassicPayload(combo, runIndex, scenario.dayCount);
  const normalizedPayload = trainingRoutes._private.coerceClassicBodybuildingToOblueprintPayload(classicPayload);
  const shouldBuildRawPlan = !settings.expandedMode;
  const rawStartedAt = Date.now();
  const rawPlan = shouldBuildRawPlan
    ? withSuppressedConsole(() => engine.buildOblueprintPlan(normalizedPayload, { profileTiming: true, fastBuild: true }))
    : null;
  const rawElapsedMs = shouldBuildRawPlan ? (Date.now() - rawStartedAt) : 0;
  let rawRouteValidationFailed = false;
  let rawRouteValidationError = null;
  let rawContractWarnings = [];
  if (shouldBuildRawPlan && !rawPlan?.error) {
    const rawValidation = withSuppressedConsole(() => trainingRoutes._private.validateBodybuildingPlanContract(rawPlan));
    rawContractWarnings = Array.isArray(rawValidation?.warnings) ? rawValidation.warnings.slice() : collectContractWarnings(rawPlan);
    if (!rawValidation?.ok) {
      rawRouteValidationFailed = true;
      rawRouteValidationError = rawValidation.error;
    }
  }

  const finalStartedAt = Date.now();
  const built = await trainingRoutes._private.runTrainingPlanBuildWithTimeout(
    normalizedPayload,
    { fastBuild: true, profileTiming: true },
    { routeName: `combo-matrix:${comboLabel}:run${runIndex + 1}`, timeoutMs: settings.timeoutMs }
  );
  const finalElapsedMs = Date.now() - finalStartedAt;
  const finalPlan = built?.plan || null;
  const error = built?.error || null;
  let finalRouteValidationFailed = false;
  let finalRouteValidationError = null;
  let finalContractWarnings = [];
  if (finalPlan) {
    const finalValidation = withSuppressedConsole(() => trainingRoutes._private.validateBodybuildingPlanContract(finalPlan));
    finalContractWarnings = Array.isArray(finalValidation?.warnings) ? finalValidation.warnings.slice() : collectContractWarnings(finalPlan);
    if (!finalValidation?.ok) {
      finalRouteValidationFailed = true;
      finalRouteValidationError = finalValidation.error;
    }
  }

  const analysis = finalPlan
    ? analyzeWarnings(finalPlan, rawPlan, normalizedPayload)
    : { warnings: [], metrics: {} };
  const combinedWarnings = [
    ...analysis.warnings,
    ...finalContractWarnings
  ];

  const unsupported = !finalPlan && !finalRouteValidationFailed && isUnsupportedBuildError(error);

  return {
    combo: combo.map((entry) => entry.label),
    comboKeys: combo.map((entry) => entry.key),
    dayCount: scenario.dayCount,
    priorityCount: scenario.priorityCount,
    normalizedPriorityGroups: Array.isArray(normalizedPayload?.priorityGroups) ? normalizedPayload.priorityGroups.slice() : [],
    runIndex,
    rawElapsedMs,
    finalElapsedMs,
    status: unsupported ? 'UNSUPPORTED' : (finalPlan && !error && !finalRouteValidationFailed ? 'PASS' : 'FAIL'),
    unsupported,
    error: error || (finalRouteValidationError ? {
      error: 'FINAL_ROUTE_VALIDATION_FAILED',
      message: String(finalRouteValidationError?.message || 'Final route validation failed'),
      reason: String(finalRouteValidationError?.message || 'Final route validation failed'),
      functionName: 'assertBodybuildingPlanByEngine',
      failedStage: 'assertBodybuildingPlanByEngine'
    } : null),
    timedOut: String(error?.error || '').trim() === 'PLAN_BUILD_TIMEOUT' || String(error?.failedStage || '').trim() === 'worker-timeout',
    failedStage: error?.failedStage || error?.stage || (finalRouteValidationFailed ? 'assertBodybuildingPlanByEngine' : null),
    functionName: error?.functionName || (finalRouteValidationFailed ? 'assertBodybuildingPlanByEngine' : null),
    builderReturnedPlanButRouteValidationFailed: rawPlan && !rawPlan.error && rawRouteValidationFailed,
    finalReturnedPlanExists: Boolean(finalPlan),
    finalRouteValidationFailed,
    rawRouteValidationError: rawRouteValidationError ? String(rawRouteValidationError?.message || 'Raw route validation failed') : null,
    rawBuilderPlanExists: Boolean(rawPlan && !rawPlan.error),
    warnings: combinedWarnings,
    metrics: analysis.metrics,
    redundancyDetails: Array.isArray(analysis.redundancyDetails) ? analysis.redundancyDetails : [],
    databaseLabelAudit: Array.isArray(analysis.databaseLabelAudit) ? analysis.databaseLabelAudit : [],
    canonicalMovementFamilyMapProposal: Array.isArray(analysis.canonicalMovementFamilyMapProposal) ? analysis.canonicalMovementFamilyMapProposal : [],
    familyConsistencyCheck: Array.isArray(analysis.familyConsistencyCheck) ? analysis.familyConsistencyCheck : [],
    squatLegPressSafetySimulation: Array.isArray(analysis.squatLegPressSafetySimulation) ? analysis.squatLegPressSafetySimulation : [],
    finalVisibleCleanupLog: Array.isArray(finalPlan?.meta?._finalVisibleCleanupLog) ? finalPlan.meta._finalVisibleCleanupLog : [],
    finalVisibleCleanupDiagnostics: Array.isArray(finalPlan?.meta?._finalVisibleCleanupDiagnostics) ? finalPlan.meta._finalVisibleCleanupDiagnostics : [],
    finalVisibleCleanupSummary: finalPlan?.meta?._finalVisibleCleanupSummary || null,
    contractWarnings: finalContractWarnings,
    rawContractWarnings,
    rawPlanMeta: rawPlan?.meta?.eliteQa ? {
      eliteQa: rawPlan.meta.eliteQa,
      ceilingQa: rawPlan.meta.ceilingQa || null
    } : null
  };
}

function summarizeComboRuns(comboRuns) {
  const firstFail = comboRuns.find((run) => run.status === 'FAIL') || null;
  const firstUnsupported = comboRuns.find((run) => run.status === 'UNSUPPORTED') || null;
  const passingRuns = comboRuns.filter((run) => run.status === 'PASS');
  const allWarnings = passingRuns.flatMap((run) => Array.isArray(run.warnings) ? run.warnings : []);
  const normalizedPriorityGroups = comboRuns[0]?.normalizedPriorityGroups || [];
  const unsupported = comboRuns.some((run) => run.unsupported);
  const summary = {
    combo: comboRuns[0]?.combo || [],
    comboKeys: comboRuns[0]?.comboKeys || [],
    dayCount: comboRuns[0]?.dayCount || null,
    priorityCount: comboRuns[0]?.priorityCount || null,
    normalizedPriorityGroups,
    runs: comboRuns.length,
    status: firstFail ? 'FAIL' : (unsupported ? 'UNSUPPORTED' : 'PASS'),
    unsupported,
    timedOut: comboRuns.some((run) => run.timedOut),
    failedStage: firstFail?.failedStage || firstUnsupported?.failedStage || null,
    functionName: firstFail?.functionName || firstUnsupported?.functionName || null,
    error: firstFail?.error || firstUnsupported?.error || null,
    builderReturnedPlanButRouteValidationFailed: comboRuns.some((run) => run.builderReturnedPlanButRouteValidationFailed),
    finalReturnedPlanExists: comboRuns.some((run) => run.finalReturnedPlanExists),
    finalRouteValidationFailed: comboRuns.some((run) => run.finalRouteValidationFailed),
    warningCount: allWarnings.length,
    warnings: allWarnings,
    metrics: passingRuns[0]?.metrics || {},
    redundancyDetails: passingRuns.flatMap((run) => Array.isArray(run.redundancyDetails) ? run.redundancyDetails : []),
    databaseLabelAudit: passingRuns.flatMap((run) => Array.isArray(run.databaseLabelAudit) ? run.databaseLabelAudit : []),
    canonicalMovementFamilyMapProposal: passingRuns.flatMap((run) => Array.isArray(run.canonicalMovementFamilyMapProposal) ? run.canonicalMovementFamilyMapProposal : []),
    familyConsistencyCheck: passingRuns.flatMap((run) => Array.isArray(run.familyConsistencyCheck) ? run.familyConsistencyCheck : []),
    squatLegPressSafetySimulation: passingRuns.flatMap((run) => Array.isArray(run.squatLegPressSafetySimulation) ? run.squatLegPressSafetySimulation : []),
    finalVisibleCleanupLog: passingRuns.flatMap((run) => Array.isArray(run.finalVisibleCleanupLog) ? run.finalVisibleCleanupLog : []),
    finalVisibleCleanupDiagnostics: passingRuns.flatMap((run) => Array.isArray(run.finalVisibleCleanupDiagnostics) ? run.finalVisibleCleanupDiagnostics : []),
    finalVisibleCleanupSummary: passingRuns.find((run) => run.finalVisibleCleanupSummary)?.finalVisibleCleanupSummary || null,
    runResults: comboRuns.map((run) => ({
      runIndex: run.runIndex,
      status: run.status,
      timedOut: run.timedOut,
      failedStage: run.failedStage,
      functionName: run.functionName,
      error: run.error ? {
        error: run.error.error || null,
        message: run.error.message || null,
        reason: run.error.reason || null,
        functionName: run.error.functionName || null,
        failedStage: run.error.failedStage || run.error.stage || null
      } : null,
      rawElapsedMs: run.rawElapsedMs,
      finalElapsedMs: run.finalElapsedMs,
      finalReturnedPlanExists: run.finalReturnedPlanExists
    }))
  };

  const acceptableExceptions = [];
  if (summary.status === 'PASS') {
    const rearDeltDays = Number(summary?.metrics?.rearDeltDays || 0);
    const rearDeltSets = Number(summary?.metrics?.rearDeltSets || 0);
    if (normalizedPriorityGroups.includes('Shoulders') && normalizedPriorityGroups.includes('Back') && rearDeltDays === 4 && rearDeltSets <= 12) {
      acceptableExceptions.push({
        type: 'shoulders_back_rear_delt_4_day_allowance',
        rearDeltDays,
        rearDeltSets
      });
    }
    const absSets = Number(summary?.metrics?.directSets?.abs || 0);
    if (normalizedPriorityGroups.includes('Core') && absSets >= 8 && absSets <= 14) {
      acceptableExceptions.push({
        type: 'abs_priority_core_volume_in_expected_band',
        directCoreSets: absSets
      });
    }
    if (normalizedPriorityGroups.includes('Arms')) {
      acceptableExceptions.push({
        type: 'arms_priority_allows_biceps_and_triceps_direct_work',
        bicepsDirectSets: Number(summary?.metrics?.bicepsDirectSets || 0),
        tricepsDirectSets: Number(summary?.metrics?.tricepsDirectSets || 0)
      });
    }
  }
  summary.acceptableExceptions = acceptableExceptions;
  return summary;
}

function buildRootPatternReport(failures, warnings) {
  const grouped = new Map();
  for (const failure of failures) {
    const key = classifyRootPattern('failure', failure.error || failure);
    const entry = grouped.get(key) || { key, count: 0, combos: new Set(), examples: [] };
    entry.count += 1;
    entry.combos.add((failure.combo || []).join(' + '));
    if (entry.examples.length < 5) {
      entry.examples.push({
        combo: failure.combo,
        failedStage: failure.failedStage,
        functionName: failure.functionName,
        message: failure?.error?.message || failure?.error?.reason || null
      });
    }
    grouped.set(key, entry);
  }
  for (const warning of warnings) {
    const key = classifyRootPattern('warning', { warningType: warning.warningType });
    const entry = grouped.get(key) || { key, count: 0, combos: new Set(), examples: [] };
    entry.count += 1;
    entry.combos.add((warning.combo || []).join(' + '));
    if (entry.examples.length < 5) {
      entry.examples.push({
        combo: warning.combo,
        warningType: warning.warningType
      });
    }
    grouped.set(key, entry);
  }
  return [...grouped.values()]
    .map((entry) => ({
      key: entry.key,
      count: entry.count,
      combos: [...entry.combos].sort(),
      examples: entry.examples
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function buildValidatorContractAudit(comboRuns) {
  const contractRows = Array.isArray(trainingRoutes?._private?.getBodybuildingValidationContractTable?.())
    ? trainingRoutes._private.getBodybuildingValidationContractTable()
    : [];
  const counts = new Map();
  for (const comboResult of comboRuns) {
    if (comboResult.status === 'FAIL' && comboResult?.error?.contractId) {
      const entry = counts.get(comboResult.error.contractId) || { combos: new Set(), examples: [] };
      entry.combos.add(comboResult.combo.join(' + '));
      if (entry.examples.length < 5) {
        entry.examples.push({
          combo: comboResult.combo,
          message: comboResult?.error?.message || null
        });
      }
      counts.set(comboResult.error.contractId, entry);
    }
    for (const warning of Array.isArray(comboResult.warnings) ? comboResult.warnings : []) {
      const key = String(warning?.type || '') === 'validation_contract_warning'
        ? String(warning?.warningType || '')
        : (String(warning?.source || '') === 'validation_contract' ? String(warning?.warningType || '') : '');
      if (!key) continue;
      const entry = counts.get(key) || { combos: new Set(), examples: [] };
      entry.combos.add(comboResult.combo.join(' + '));
      if (entry.examples.length < 5) {
        entry.examples.push({
          combo: comboResult.combo,
          message: warning?.message || null
        });
      }
      counts.set(key, entry);
    }
  }
  return contractRows
    .map((row) => {
      const bucket = counts.get(row.id) || { combos: new Set(), examples: [] };
      return {
        invariantName: row.id,
        currentBehavior: row.currentBehavior,
        shouldBehavior: row.shouldBehavior,
        repairBeforeAssert: row.repairBeforeAssert,
        affectedComboCount: bucket.combos.size,
        affectedCombos: [...bucket.combos].sort(),
        examples: bucket.examples
      };
    })
    .filter((row) => row.affectedComboCount > 0)
    .sort((a, b) => b.affectedComboCount - a.affectedComboCount || a.invariantName.localeCompare(b.invariantName));
}

function buildRedundancyFamilySummary(comboRuns) {
  const grouped = new Map();
  for (const comboResult of comboRuns) {
    for (const detail of Array.isArray(comboResult.redundancyDetails) ? comboResult.redundancyDetails : []) {
      const key = String(detail?.repeatedMovementFamily || 'general');
      const entry = grouped.get(key) || { family: key, count: 0, combos: new Set(), causes: new Map() };
      entry.count += 1;
      entry.combos.add(comboResult.combo.join(' + '));
      const cause = String(detail?.cause || 'unknown');
      entry.causes.set(cause, Number(entry.causes.get(cause) || 0) + 1);
      grouped.set(key, entry);
    }
  }
  return [...grouped.values()]
    .map((entry) => ({
      family: entry.family,
      count: entry.count,
      affectedCombos: [...entry.combos].sort(),
      causes: [...entry.causes.entries()].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause))
    }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

function buildDatabaseLabelAudit(comboRuns) {
  const grouped = new Map();
  for (const comboResult of comboRuns) {
    for (const entry of Array.isArray(comboResult.databaseLabelAudit) ? comboResult.databaseLabelAudit : []) {
      const current = grouped.get(entry.exerciseName) || {
        exerciseName: entry.exerciseName,
        issues: new Set(),
        fields: entry.fields,
        dbFamily: entry.dbFamily,
        impliedFamily: entry.impliedFamily,
        canonicalFamily: entry.canonicalFamily,
        currentLogicFamily: entry.currentLogicFamily
      };
      for (const issue of Array.isArray(entry.issues) ? entry.issues : []) current.issues.add(issue);
      grouped.set(entry.exerciseName, current);
    }
  }
  return [...grouped.values()]
    .map((entry) => ({
      exerciseName: entry.exerciseName,
      issues: [...entry.issues].sort(),
      fields: entry.fields,
      dbFamily: entry.dbFamily,
      impliedFamily: entry.impliedFamily,
      canonicalFamily: entry.canonicalFamily,
      currentLogicFamily: entry.currentLogicFamily
    }))
    .sort((a, b) => b.issues.length - a.issues.length || a.exerciseName.localeCompare(b.exerciseName));
}

function buildCanonicalMovementFamilyMapProposal(comboRuns) {
  const grouped = new Map();
  for (const comboResult of comboRuns) {
    for (const entry of Array.isArray(comboResult.canonicalMovementFamilyMapProposal) ? comboResult.canonicalMovementFamilyMapProposal : []) {
      const bucket = grouped.get(entry.canonicalFamily) || new Set();
      for (const name of Array.isArray(entry.exercises) ? entry.exercises : []) bucket.add(name);
      grouped.set(entry.canonicalFamily, bucket);
    }
  }
  return [...grouped.entries()]
    .map(([canonicalFamily, names]) => ({
      canonicalFamily,
      exercises: [...names].sort()
    }))
    .sort((a, b) => a.canonicalFamily.localeCompare(b.canonicalFamily));
}

function buildFamilyConsistencyCheck(comboRuns) {
  const grouped = new Map();
  for (const comboResult of comboRuns) {
    for (const entry of Array.isArray(comboResult.familyConsistencyCheck) ? comboResult.familyConsistencyCheck : []) {
      const existing = grouped.get(entry.exerciseName) || {
        exerciseName: entry.exerciseName,
        canonicalFamily: entry.canonicalFamily,
        cleanupFamily: entry.cleanupFamily,
        warningFamily: entry.warningFamily,
        currentFamily: entry.currentFamily,
        legacyFamily: entry.legacyFamily,
        consistent: true
      };
      existing.consistent = existing.consistent && Boolean(entry.consistent);
      grouped.set(entry.exerciseName, existing);
    }
  }
  return [...grouped.values()].sort((a, b) => Number(a.consistent) - Number(b.consistent) || a.exerciseName.localeCompare(b.exerciseName));
}

function buildFinalVisibleCleanupSummary(comboRuns) {
  const summary = {
    sameDayRedundancyBefore: 0,
    sameDayRedundancyAfter: 0,
    horizontal_row: { before: 0, after: 0 },
    squat_leg_press: { before: 0, after: 0 },
    shoulder_press: { before: 0, after: 0 }
  };
  for (const comboResult of comboRuns) {
    const entry = comboResult.finalVisibleCleanupSummary;
    if (!entry) continue;
    summary.sameDayRedundancyBefore += Number(entry.sameDayRedundancyBefore || 0);
    summary.sameDayRedundancyAfter += Number(entry.sameDayRedundancyAfter || 0);
    summary.horizontal_row.before += Number(entry.horizontal_row?.before || 0);
    summary.horizontal_row.after += Number(entry.horizontal_row?.after || 0);
    summary.squat_leg_press.before += Number(entry.squat_leg_press?.before || 0);
    summary.squat_leg_press.after += Number(entry.squat_leg_press?.after || 0);
    summary.shoulder_press.before += Number(entry.shoulder_press?.before || 0);
    summary.shoulder_press.after += Number(entry.shoulder_press?.after || 0);
  }
  return summary;
}

function buildTopCleanupRules(redundancyFamilySummary, databaseLabelAudit) {
  const topFamilies = redundancyFamilySummary.slice(0, 6);
  const rules = [];
  for (const family of topFamilies) {
    rules.push({
      rule: `Tighten ${family.family} same-day cleanup`,
      rationale: family.causes.map((entry) => `${entry.cause}:${entry.count}`).join(', ')
    });
  }
  if (databaseLabelAudit.some((entry) => entry.issues.includes('should_be_manually_mapped_to_canonical_movement_family'))) {
    rules.push({
      rule: 'Add manual canonical movement-family overrides for mislabeled exercises',
      rationale: 'Repeated classifier mismatch in redundancy audit'
    });
  }
  if (databaseLabelAudit.some((entry) => entry.issues.includes('name_implies_different_family_than_db_label'))) {
    rules.push({
      rule: 'Normalize name-vs-database family conflicts before cleanup scoring',
      rationale: 'Name-implied families and DB labels diverge'
    });
  }
  if (databaseLabelAudit.some((entry) => entry.issues.includes('target_region_conflicts_with_primary_muscles'))) {
    rules.push({
      rule: 'Guard cleanup against target-region / primary-muscle conflicts',
      rationale: 'Some DB-facing labels are internally inconsistent'
    });
  }
  rules.push({
    rule: 'Compare raw-builder and final-visible redundancy before replacing accessories',
    rationale: 'Late route repair still changes visible output for every combo'
  });
  rules.push({
    rule: 'Log replacement-pool exhaustion for duplicate family cleanup',
    rationale: 'Need proof when cleanup runs but no acceptable replacement exists'
  });
  return rules.slice(0, 10);
}

function buildFamilyCleanupDiagnosticSection(comboRuns, family) {
  const rows = [];
  for (const comboResult of comboRuns) {
    const detailLookup = new Map(
      (Array.isArray(comboResult.redundancyDetails) ? comboResult.redundancyDetails : [])
        .filter((detail) => detail?.repeatedMovementFamily === family && detail?.cleanupDiagnostic)
        .map((detail) => {
          const key = [
            String(detail?.week ?? ''),
            String(detail?.day || ''),
            String(detail?.dayType || '').trim().toLowerCase(),
            family
          ].join('|');
          return [key, detail];
        })
    );
    for (const diag of Array.isArray(comboResult.finalVisibleCleanupDiagnostics) ? comboResult.finalVisibleCleanupDiagnostics : []) {
      if (diag?.family !== family) continue;
      const key = [
        String(diag?.week ?? ''),
        String(diag?.day || ''),
        String(diag?.dayType || '').trim().toLowerCase(),
        family
      ].join('|');
      const detail = detailLookup.get(key);
      if (!detail) continue;
      rows.push({
        combo: comboResult.combo,
        cause: String(detail?.cause || 'unknown'),
        diagnostic: {
          ...diag,
          combo: comboResult.combo
        }
      });
    }
  }
  const grouped = new Map();
  for (const row of rows) {
    const bucket = grouped.get(row.cause) || [];
    bucket.push(row.diagnostic);
    grouped.set(row.cause, bucket);
  }
  return [...grouped.entries()]
    .map(([cause, diagnostics]) => ({
      cause,
      count: diagnostics.length,
      diagnostics: diagnostics.sort((left, right) => {
        const comboCmp = (left.combo || []).join(' + ').localeCompare((right.combo || []).join(' + '));
        if (comboCmp) return comboCmp;
        return String(left.day || '').localeCompare(String(right.day || ''));
      })
    }))
    .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));
}

function buildHorizontalRowSafetySimulation(comboRuns) {
  const rows = [];
  for (const comboResult of comboRuns) {
    for (const diag of Array.isArray(comboResult.finalVisibleCleanupDiagnostics) ? comboResult.finalVisibleCleanupDiagnostics : []) {
      if (diag?.family !== 'horizontal_row') continue;
      for (const replacementAttempt of Array.isArray(diag.replacementCandidatesAttempted) ? diag.replacementCandidatesAttempted : []) {
        for (const roleAttempt of Array.isArray(replacementAttempt.attemptedReplacementRoles) ? replacementAttempt.attemptedReplacementRoles : []) {
          for (const candidate of Array.isArray(roleAttempt.candidateAttempts) ? roleAttempt.candidateAttempts : []) {
            const safety = candidate?.safetySimulation;
            if (!safety || safety.acceptDecision !== 'reject') continue;
            rows.push({
              combo: comboResult.combo,
              week: diag.week,
              day: diag.day,
              dayType: diag.dayType,
              cleanupPhase: diag.cleanupPhase,
              exerciseBeingReplaced: replacementAttempt.exerciseName,
              proposedReplacement: candidate.candidateName,
              wouldCreateDuplicateExerciseName: Boolean(safety.wouldCreateDuplicateExerciseName),
              wouldCreateDuplicateIsolationFamily: Boolean(safety.wouldCreateDuplicateIsolationFamily),
              finalValidatorWouldPass: Boolean(safety.finalValidatorWouldPass),
              finalValidatorReason: safety.finalValidatorReason || null,
              acceptRejectDecision: safety.acceptDecision
            });
          }
        }
      }
    }
  }
  return rows.sort((left, right) => {
    const comboCmp = (left.combo || []).join(' + ').localeCompare((right.combo || []).join(' + '));
    if (comboCmp) return comboCmp;
    const exerciseCmp = String(left.exerciseBeingReplaced || '').localeCompare(String(right.exerciseBeingReplaced || ''));
    if (exerciseCmp) return exerciseCmp;
    return String(left.proposedReplacement || '').localeCompare(String(right.proposedReplacement || ''));
  });
}

function familyPrioritySelected(family, priorities = []) {
  const set = new Set((Array.isArray(priorities) ? priorities : []).map((value) => String(value || '').trim().toLowerCase()));
  if (family === 'squat_leg_press') return set.has('quads') || set.has('legs');
  if (family === 'core_flexion') return set.has('abs') || set.has('core');
  if (family === 'vertical_pull' || family === 'horizontal_row') return set.has('back');
  return false;
}

function classifyRemainingFamilyNeed(detail) {
  const family = String(detail?.repeatedMovementFamily || '');
  const dayType = String(detail?.dayType || '').trim().toLowerCase();
  const priorities = Array.isArray(detail?.selectedPriorities) ? detail.selectedPriorities : [];
  const names = (Array.isArray(detail?.exercises) ? detail.exercises : []).map((entry) => String(entry?.exerciseName || ''));
  if (family === 'squat_leg_press') {
    const roles = names.map((name) => lowerMainRoleKey(name));
    const sameRole = roles.length > 1 && roles.every((role) => role === roles[0]) && !['unilateral', 'leg_extension', 'other'].includes(roles[0]);
    const acceptable = isAcceptableSquatLegPressStructure(dayType, names.map((exerciseName) => ({ exerciseName })));
    return {
      acceptablePrioritySpecificDuplication: acceptable,
      structuralNeeded: acceptable || (['legs', 'lower', 'lowerfocus'].includes(dayType) && !sameRole),
      realSameRoleRedundancy: sameRole
    };
  }
  if (family === 'core_flexion') {
    const absSelected = familyPrioritySelected(family, priorities);
    const roleKeys = names.map((name) => coreFlexionRoleKey(name));
    const sameRole = roleKeys.length > 1 && roleKeys.every((role) => role === roleKeys[0]);
    return {
      acceptablePrioritySpecificDuplication: absSelected && names.length <= 2,
      structuralNeeded: absSelected && names.length <= 2,
      realSameRoleRedundancy: sameRole
    };
  }
  if (family === 'vertical_pull') {
    const backSelected = familyPrioritySelected(family, priorities);
    const roleKeys = names.map((name) => verticalPullRoleKey(name));
    const distinctRoles = new Set(roleKeys).size === roleKeys.length;
    const horizontalRowCount = Array.isArray(detail?.fullDayExercises)
      ? detail.fullDayExercises.filter((exercise) => trainingRoutes._private.getCanonicalMovementFamily(exercise) === 'horizontal_row').length
      : 0;
    const acceptable = backSelected && names.length <= 2 && distinctRoles && (dayType === 'pull' || dayType === 'upper') && horizontalRowCount <= 1;
    return {
      acceptablePrioritySpecificDuplication: acceptable,
      structuralNeeded: acceptable,
      realSameRoleRedundancy: !distinctRoles
    };
  }
  if (family === 'horizontal_row') {
    return {
      acceptablePrioritySpecificDuplication: Boolean(detail?.acceptablePrioritySpecificDuplication),
      structuralNeeded: false,
      realSameRoleRedundancy: false
    };
  }
  return {
    acceptablePrioritySpecificDuplication: false,
    structuralNeeded: false,
    realSameRoleRedundancy: false
  };
}

function simulateRemainingFamilyReplacement(detail) {
  const family = String(detail?.repeatedMovementFamily || '');
  const dayType = String(detail?.dayType || '').trim().toLowerCase();
  const priorities = (Array.isArray(detail?.selectedPriorities) ? detail.selectedPriorities : []).map((value) => String(value || '').toLowerCase());
  const exercises = (Array.isArray(detail?.fullDayExercises) ? detail.fullDayExercises : []).map((exercise) => ({ ...exercise }));
  if (!family || !exercises.length) {
    return {
      cleanupWouldBreakValidation: true,
      cleanupWouldUnderfillPriorityVolume: false,
      possibleSafeReplacement: null,
      acceptRejectDecision: 'reject'
    };
  }
  const familyEntries = exercises
    .map((exercise, exerciseIndex) => ({
      exerciseIndex,
      exercise,
      exerciseName: String(exercise?.name || '').trim(),
      canonicalFamily: trainingRoutes._private.getCanonicalMovementFamily(exercise)
    }))
    .filter((entry) => entry.canonicalFamily === family);
  if (!familyEntries.length) {
    return {
      cleanupWouldBreakValidation: true,
      cleanupWouldUnderfillPriorityVolume: false,
      possibleSafeReplacement: null,
      acceptRejectDecision: 'reject'
    };
  }
  const keepIndexes = new Set(trainingRoutes._private.simulateCanonicalKeepIndexes(dayType, family, exercises, priorities));
  let replaceTargets = familyEntries.filter((entry) => !keepIndexes.has(entry.exerciseIndex));
  if (family === 'squat_leg_press' && familyEntries.length === 2 && isClearlyRedundantSquatLegPressPair(familyEntries.map((entry) => ({ exerciseName: entry.exerciseName }))) && !replaceTargets.length) {
    replaceTargets = familyEntries.slice(1);
  }
  let possibleSafeReplacement = null;
  for (const target of replaceTargets) {
    const others = exercises.filter((_, idx) => idx !== target.exerciseIndex);
    const replacement = trainingRoutes._private.simulateTargetedCanonicalReplacement(
      dayType,
      family,
      target.exercise,
      others,
      priorities,
      {
        currentIndex: target.exerciseIndex,
        missingVerticalPull: family === 'horizontal_row' && !others.some((exercise) => trainingRoutes._private.getCanonicalMovementFamily(exercise) === 'vertical_pull'),
        missingHinge: family === 'squat_leg_press' && !others.some((exercise) => trainingRoutes._private.getCanonicalMovementFamily(exercise) === 'hinge_posterior_chain')
      }
    );
    const attempts = Array.isArray(replacement?.attemptDiagnostics) ? replacement.attemptDiagnostics : [];
    for (const roleAttempt of attempts) {
      for (const candidate of Array.isArray(roleAttempt?.candidateAttempts) ? roleAttempt.candidateAttempts : []) {
        const safety = candidate?.safetySimulation;
        if (!safety?.finalValidatorWouldPass) continue;
        possibleSafeReplacement = {
          replace: target.exerciseName,
          with: candidate.candidateName,
          reason: roleAttempt?.replacementRole || replacement?.reason || 'safe_candidate_found'
        };
        break;
      }
      if (possibleSafeReplacement) break;
    }
    if (possibleSafeReplacement) break;
  }
  const cleanupWouldUnderfillPriorityVolume = familyPrioritySelected(family, priorities) && !possibleSafeReplacement;
  return {
    cleanupWouldBreakValidation: !possibleSafeReplacement,
    cleanupWouldUnderfillPriorityVolume,
    possibleSafeReplacement,
    acceptRejectDecision: possibleSafeReplacement ? 'accept' : 'reject'
  };
}

function buildRemainingRedundancyDiagnostic(comboRuns) {
  const targetFamilies = new Set(['squat_leg_press', 'core_flexion', 'vertical_pull', 'horizontal_row']);
  const rows = [];
  for (const comboResult of comboRuns) {
    for (const detail of Array.isArray(comboResult.redundancyDetails) ? comboResult.redundancyDetails : []) {
      if (!targetFamilies.has(String(detail?.repeatedMovementFamily || ''))) continue;
      const need = classifyRemainingFamilyNeed(detail);
      const simulation = simulateRemainingFamilyReplacement(detail);
      rows.push({
        combo: comboResult.combo,
        week: detail.week,
        day: detail.day,
        dayType: detail.dayType,
        selectedPriorities: comboResult.combo,
        family: detail.repeatedMovementFamily,
        exercisesCausingWarning: (Array.isArray(detail.exercises) ? detail.exercises : []).map((entry) => String(entry?.exerciseName || '')),
        acceptablePrioritySpecificDuplication: need.acceptablePrioritySpecificDuplication,
        structuralOrNeeded: need.structuralNeeded,
        cleanupWouldBreakValidation: simulation.cleanupWouldBreakValidation,
        cleanupWouldUnderfillPriorityVolume: simulation.cleanupWouldUnderfillPriorityVolume,
        possibleSafeReplacement: simulation.possibleSafeReplacement,
        acceptRejectDecision: (need.acceptablePrioritySpecificDuplication || need.structuralNeeded) ? 'reject' : simulation.acceptRejectDecision
      });
    }
  }
  return rows.sort((left, right) => {
    const familyCmp = String(left.family || '').localeCompare(String(right.family || ''));
    if (familyCmp) return familyCmp;
    const comboCmp = (left.combo || []).join(' + ').localeCompare((right.combo || []).join(' + '));
    if (comboCmp) return comboCmp;
    return String(left.dayType || '').localeCompare(String(right.dayType || ''));
  });
}

function buildWarningSummaryForResult(comboResult) {
  const warningSummaryMap = new Map();
  for (const warning of Array.isArray(comboResult.warnings) ? comboResult.warnings : []) {
    const key = String(
      (String(warning?.type || '') === 'validation_contract_warning' ? warning?.warningType : null)
      || warning?.type
      || 'warning'
    );
    warningSummaryMap.set(key, Number(warningSummaryMap.get(key) || 0) + 1);
  }
  return [...warningSummaryMap.entries()]
    .map(([warningType, count]) => ({ warningType, count }))
    .sort((a, b) => b.count - a.count || a.warningType.localeCompare(b.warningType));
}

function slugFromMessage(raw, fallback = 'unknown') {
  const out = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return out || fallback;
}

function previewStack(stack) {
  const lines = String(stack || '')
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  return lines.length ? lines.slice(0, 2).join(' | ') : null;
}

function buildErrorObjectPreview(error) {
  if (!error || typeof error !== 'object') return null;
  try {
    const picked = {};
    const allowed = [
      'error',
      'message',
      'reason',
      'functionName',
      'stage',
      'failedStage',
      'validatorSection',
      'failedInvariant',
      'day',
      'dayType',
      'week',
      'dayIndex',
      'exerciseIndex',
      'exerciseName',
      'exerciseNames',
      'rawDayPreview',
      'rawExercisePreview',
      'missingRequirement',
      'slotId',
      'pattern',
      'workerExitCode',
      'timeoutMs',
      'elapsedMs'
    ];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(error, key)) continue;
      picked[key] = error[key];
    }
    return JSON.stringify(picked);
  } catch {
    return null;
  }
}

function deriveFailureClassification(error, fallbackStage = '', fallbackFunctionName = '') {
  const validatorSection = String(error?.validatorSection || '').trim();
  const failedInvariant = String(error?.failedInvariant || '').trim();
  if (validatorSection || failedInvariant) {
    return {
      validatorSection: validatorSection || null,
      failedInvariant: failedInvariant || null,
      classificationSource: 'native'
    };
  }
  const errorCode = String(error?.error || '').trim();
  const message = String(error?.message || error?.reason || '').trim();
  const functionName = String(error?.functionName || fallbackFunctionName || '').trim();
  const stage = String(error?.failedStage || error?.stage || fallbackStage || '').trim();
  const missingRequirement = String(error?.missingRequirement || '').trim();
  const slotId = String(error?.slotId || '').trim();

  if (missingRequirement) {
    return {
      validatorSection: functionName || stage || 'plan build repair',
      failedInvariant: missingRequirement,
      classificationSource: 'derived_missing_requirement'
    };
  }
  if (errorCode === 'NO_ELIGIBLE_EXERCISE') {
    return {
      validatorSection: 'exercise selection',
      failedInvariant: slotId || String(error?.pattern || '').trim() || 'no_eligible_exercise',
      classificationSource: 'derived_selection'
    };
  }
  if (errorCode === 'PLAN_BUILD_WORKER_EXIT') {
    return {
      validatorSection: 'worker execution',
      failedInvariant: 'worker_exit',
      classificationSource: 'derived_worker_exit'
    };
  }
  if (errorCode === 'PLAN_BUILD_TIMEOUT') {
    return {
      validatorSection: 'worker execution',
      failedInvariant: 'timeout',
      classificationSource: 'derived_timeout'
    };
  }
  if (errorCode === 'PLAN_BUILD_FAILED' && functionName) {
    return {
      validatorSection: functionName,
      failedInvariant: slugFromMessage(message || stage, 'plan_build_failed'),
      classificationSource: 'derived_plan_build_failed'
    };
  }
  if (stage || functionName || errorCode) {
    return {
      validatorSection: functionName || stage || null,
      failedInvariant: errorCode ? slugFromMessage(errorCode, 'unknown') : slugFromMessage(message || stage, 'unknown'),
      classificationSource: 'derived_fallback'
    };
  }
  return {
    validatorSection: null,
    failedInvariant: null,
    classificationSource: 'unknown'
  };
}

function buildFailureReportEntry(entry) {
  const rawError = entry?.error && typeof entry.error === 'object' ? entry.error : null;
  const classification = deriveFailureClassification(rawError, entry?.failedStage, entry?.functionName);
  const rawErrorKeys = rawError ? Object.keys(rawError).sort() : [];
  return {
    combo: entry.combo,
    dayCount: entry.dayCount,
    priorityCount: entry.priorityCount,
    selectedPriorities: entry.combo,
    normalizedPriorityGroups: entry.normalizedPriorityGroups,
    failedStage: entry.failedStage,
    functionName: entry.functionName,
    timedOut: entry.timedOut,
    builderReturnedPlanButRouteValidationFailed: entry.builderReturnedPlanButRouteValidationFailed,
    finalReturnedPlanExists: entry.finalReturnedPlanExists,
    error: rawError ? {
      error: rawError.error || null,
      message: rawError.message || null,
      reason: rawError.reason || null,
      functionName: rawError.functionName || null,
      stage: rawError.stage || null,
      failedStage: rawError.failedStage || rawError.stage || null,
      validatorSection: classification.validatorSection,
      failedInvariant: classification.failedInvariant,
      classificationSource: classification.classificationSource,
      week: rawError.week ?? rawError.lastKnownWeek ?? null,
      dayIndex: rawError.dayIndex ?? null,
      day: rawError.day || rawError.lastKnownDay || null,
      dayType: rawError.dayType || rawError.lastKnownDayType || null,
      exerciseIndex: rawError.exerciseIndex ?? null,
      exerciseName: rawError.exerciseName || null,
      exerciseNames: rawError.exerciseNames || null,
      exerciseKeys: rawError.exerciseKeys || null,
      rawExercisePreview: rawError.rawExercisePreview || null,
      rawDayPreview: rawError.rawDayPreview || null,
      finalVisibleDayExercises: rawError.finalVisibleDayExercises || rawError.exerciseNames || null,
      selectedPriorities: rawError.selectedPriorities || null,
      weekType: rawError.weekType || null,
      requiredStyle: rawError.requiredStyle || null,
      muscleTarget: rawError.muscleTarget || null,
      directCoreExercises: rawError.directCoreExercises || null,
      directCoreExerciseCount: Number.isFinite(Number(rawError.directCoreExerciseCount)) ? Number(rawError.directCoreExerciseCount) : null,
      directCoreExerciseCountBucket: rawError.directCoreExerciseCountBucket || null,
      directCoreSetCount: typeof rawError.directCoreSetCount === 'number' && Number.isFinite(rawError.directCoreSetCount)
        ? rawError.directCoreSetCount
        : null,
      coreMovementFamilySubroles: rawError.coreMovementFamilySubroles || null,
      absSelected: typeof rawError.absSelected === 'boolean' ? rawError.absSelected : null,
      exactTwoAbsRequired: typeof rawError.exactTwoAbsRequired === 'boolean' ? rawError.exactTwoAbsRequired : null,
      coreMissingFromInitialBuild: typeof rawError.coreMissingFromInitialBuild === 'boolean' ? rawError.coreMissingFromInitialBuild : null,
      coreRemovedOrReplacedLater: typeof rawError.coreRemovedOrReplacedLater === 'boolean' ? rawError.coreRemovedOrReplacedLater : null,
      safeCoreInsertionOrReplacementExists: typeof rawError.safeCoreInsertionOrReplacementExists === 'boolean' ? rawError.safeCoreInsertionOrReplacementExists : null,
      unsafeCoreCandidateExists: typeof rawError.unsafeCoreCandidateExists === 'boolean' ? rawError.unsafeCoreCandidateExists : null,
      addingCoreWouldBreakValidation: typeof rawError.addingCoreWouldBreakValidation === 'boolean' ? rawError.addingCoreWouldBreakValidation : null,
      addingCoreWouldDuplicateNames: typeof rawError.addingCoreWouldDuplicateNames === 'boolean' ? rawError.addingCoreWouldDuplicateNames : null,
      addingCoreWouldDuplicateFamilies: typeof rawError.addingCoreWouldDuplicateFamilies === 'boolean' ? rawError.addingCoreWouldDuplicateFamilies : null,
      candidateDiagnostics: rawError.candidateDiagnostics || null,
      lowerExerciseFamilies: rawError.lowerExerciseFamilies || null,
      quadPatternExistedBeforeCleanup: typeof rawError.quadPatternExistedBeforeCleanup === 'boolean' ? rawError.quadPatternExistedBeforeCleanup : null,
      initialQuadPatternCount: rawError.initialQuadPatternCount ?? null,
      finalQuadPatternCount: rawError.finalQuadPatternCount ?? null,
      cleanupRemovedOnlyQuadPattern: typeof rawError.cleanupRemovedOnlyQuadPattern === 'boolean' ? rawError.cleanupRemovedOnlyQuadPattern : null,
      cleanupTouchedDay: typeof rawError.cleanupTouchedDay === 'boolean' ? rawError.cleanupTouchedDay : null,
      cleanupTouchedPasses: rawError.cleanupTouchedPasses || null,
      cleanupActionLog: rawError.cleanupActionLog || null,
      initialExerciseNames: rawError.initialExerciseNames || null,
      initialExerciseFamilies: rawError.initialExerciseFamilies || null,
      missingQuadPatternOrigin: rawError.missingQuadPatternOrigin || null,
      safeQuadReplacementAvailable: typeof rawError.safeQuadReplacementAvailable === 'boolean' ? rawError.safeQuadReplacementAvailable : null,
      quadRepairAttempted: rawError.quadRepairAttempted || null,
      quadRepairFailureReason: rawError.quadRepairFailureReason || null,
      weekExerciseList: rawError.weekExerciseList || null,
      failedDayExercises: rawError.failedDayExercises || null,
      hingeDeadliftExercisesInWeek: rawError.hingeDeadliftExercisesInWeek || null,
      heavyDeadliftExercisesInWeek: rawError.heavyDeadliftExercisesInWeek || null,
      countedHeavyDeadliftExerciseNames: rawError.countedHeavyDeadliftExerciseNames || null,
      heavyDeadliftByDay: rawError.heavyDeadliftByDay || null,
      legsSelected: typeof rawError.legsSelected === 'boolean' ? rawError.legsSelected : null,
      glutesSelected: typeof rawError.glutesSelected === 'boolean' ? rawError.glutesSelected : null,
      sameDayHeavyHingeCount: rawError.sameDayHeavyHingeCount ?? null,
      weeklyHeavyHingeExposureDays: rawError.weeklyHeavyHingeExposureDays ?? null,
      repeatedHeavyHingeRole: rawError.repeatedHeavyHingeRole || null,
      sameDayHeavyHingeStacking: typeof rawError.sameDayHeavyHingeStacking === 'boolean' ? rawError.sameDayHeavyHingeStacking : null,
      weeklyHeavyHingeStacking: typeof rawError.weeklyHeavyHingeStacking === 'boolean' ? rawError.weeklyHeavyHingeStacking : null,
      heavyDeadliftFalsePositiveCount: rawError.heavyDeadliftFalsePositiveCount ?? null,
      falsePositiveClassification: typeof rawError.falsePositiveClassification === 'boolean' ? rawError.falsePositiveClassification : null,
      safeHeavyHingeReplacementExists: typeof rawError.safeHeavyHingeReplacementExists === 'boolean' ? rawError.safeHeavyHingeReplacementExists : null,
      safeHeavyHingeReplacementCandidate: rawError.safeHeavyHingeReplacementCandidate || null,
      removingOrReplacingWouldBreakLowerDayStructure: typeof rawError.removingOrReplacingWouldBreakLowerDayStructure === 'boolean' ? rawError.removingOrReplacingWouldBreakLowerDayStructure : null,
      heavyDeadliftIssueKind: rawError.heavyDeadliftIssueKind || null,
      hardFailReason: rawError.hardFailReason || null,
      softenedToWarning: typeof rawError.softenedToWarning === 'boolean' ? rawError.softenedToWarning : null,
      calfDirectSets: rawError.calfDirectSets ?? null,
      calfExposureDays: rawError.calfExposureDays || null,
      workerExitCode: rawError.workerExitCode ?? null,
      workerMessageType: rawError.workerMessageType || null,
      workerMessageReceived: typeof rawError.workerMessageReceived === 'boolean' ? rawError.workerMessageReceived : null,
      timeoutMs: rawError.timeoutMs ?? null,
      elapsedMs: rawError.elapsedMs ?? null,
      didTimeoutFire: typeof rawError.didTimeoutFire === 'boolean' ? rawError.didTimeoutFire : null,
      terminateCalled: typeof rawError.terminateCalled === 'boolean' ? rawError.terminateCalled : null,
      terminateReason: rawError.terminateReason || null,
      workerExitedBeforeTimeout: typeof rawError.workerExitedBeforeTimeout === 'boolean' ? rawError.workerExitedBeforeTimeout : null,
      workerExitedAfterTimeout: typeof rawError.workerExitedAfterTimeout === 'boolean' ? rawError.workerExitedAfterTimeout : null,
      firstHeartbeatStage: rawError.firstHeartbeatStage || null,
      heartbeatStageHistory: Array.isArray(rawError.heartbeatStageHistory) ? rawError.heartbeatStageHistory : [],
      lastHeartbeatStage: rawError.lastHeartbeatStage || null,
      lastBuilderStage: rawError.lastBuilderStage || null,
      lastRepairOrPolishFunction: rawError.lastRepairOrPolishFunction || null,
      planShapeType: rawError.planShapeType || null,
      isOblueprintPlanShape: typeof rawError.isOblueprintPlanShape === 'boolean' ? rawError.isOblueprintPlanShape : null,
      weeksLength: rawError.weeksLength ?? null,
      firstWeekDayCount: rawError.firstWeekDayCount ?? null,
      totalDayCount: rawError.totalDayCount ?? null,
      totalExerciseCount: rawError.totalExerciseCount ?? null,
      dayTypesPresent: rawError.dayTypesPresent || null,
      dayCount: rawError.dayCount ?? null,
      branchEntered: rawError.branchEntered || null,
      workerExitAfterMessage: typeof rawError.workerExitAfterMessage === 'boolean' ? rawError.workerExitAfterMessage : null,
      processExitCalled: typeof rawError.processExitCalled === 'boolean' ? rawError.processExitCalled : null,
      processExitCode: rawError.processExitCode ?? null,
      processExitStackPreview: previewStack(rawError.processExitStack),
      uncaughtExceptionMessage: rawError.uncaughtExceptionMessage || null,
      uncaughtExceptionStackPreview: previewStack(rawError.uncaughtExceptionStack),
      unhandledRejectionMessage: rawError.unhandledRejectionMessage || null,
      unhandledRejectionStackPreview: previewStack(rawError.unhandledRejectionStack),
      assertCallStarted: typeof rawError.assertCallStarted === 'boolean' ? rawError.assertCallStarted : null,
      assertCallReturnedSuccess: typeof rawError.assertCallReturnedSuccess === 'boolean' ? rawError.assertCallReturnedSuccess : null,
      assertCallThrew: typeof rawError.assertCallThrew === 'boolean' ? rawError.assertCallThrew : null,
      assertCallFinally: typeof rawError.assertCallFinally === 'boolean' ? rawError.assertCallFinally : null,
      lastSectionStarted: rawError.lastSectionStarted || null,
      lastSectionCompleted: rawError.lastSectionCompleted || null,
      currentRunningSection: rawError.currentRunningSection || null,
      currentRunningSectionElapsedMs: rawError.currentRunningSectionElapsedMs ?? null,
      sectionDurationsMs: rawError.sectionDurationsMs || null,
      stackPreview: previewStack(rawError.stack || rawError.terminateStack || rawError.processExitStack),
      rawErrorKeys,
      rawErrorMessage: rawError.message || rawError.reason || null,
      rawErrorObjectPreview: buildErrorObjectPreview(rawError)
    } : null,
    runs: entry.runResults
  };
}

function buildUnknownFailureDiagnostic(failureEntries) {
  return failureEntries
    .filter((entry) => !entry?.error?.validatorSection || !entry?.error?.failedInvariant)
    .map((entry) => ({
      combo: entry.combo,
      dayCount: entry.dayCount,
      priorityCount: entry.priorityCount,
      rawErrorKeys: entry?.error?.rawErrorKeys || [],
      rawErrorMessage: entry?.error?.rawErrorMessage || entry?.error?.message || entry?.error?.reason || null,
      rawStage: entry?.error?.stage || entry?.error?.failedStage || entry?.failedStage || null,
      rawFunctionName: entry?.error?.functionName || entry?.functionName || null,
      stackPreview: entry?.error?.stackPreview || null
    }))
    .sort((a, b) => {
      const comboCmp = (a.combo || []).join(' + ').localeCompare((b.combo || []).join(' + '));
      if (comboCmp) return comboCmp;
      const dayCmp = Number(a.dayCount || 0) - Number(b.dayCount || 0);
      if (dayCmp) return dayCmp;
      return Number(a.priorityCount || 0) - Number(b.priorityCount || 0);
    });
}

function buildMissingQuadPatternDiagnostic(failureEntries) {
  const rows = failureEntries.filter((entry) => entry?.error?.failedInvariant === 'missing_quad_pattern');
  const groupCounts = (items, keyFn) => {
    const counts = new Map();
    for (const item of items) {
      const key = keyFn(item);
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
  };
  return {
    total: rows.length,
    byDayCount: groupCounts(rows, (row) => row.dayCount),
    byPriorityCount: groupCounts(rows, (row) => row.priorityCount),
    byDayType: groupCounts(rows, (row) => row?.error?.dayType || 'unknown'),
    bySelectedPriorities: groupCounts(rows, (row) => row.combo.join(' + ')),
    byOrigin: groupCounts(rows, (row) => row?.error?.missingQuadPatternOrigin || 'unknown'),
    bySafeRepairCandidate: groupCounts(rows, (row) => String(Boolean(row?.error?.safeQuadReplacementAvailable))),
    byRepairFailureReason: groupCounts(rows, (row) => row?.error?.quadRepairFailureReason || 'unknown'),
    rows: rows
      .map((row) => ({
        combo: row.combo,
        dayCount: row.dayCount,
        priorityCount: row.priorityCount,
        selectedPriorities: row.selectedPriorities,
        week: row?.error?.week ?? null,
        day: row?.error?.day ?? null,
        dayType: row?.error?.dayType ?? null,
        finalVisibleDayExercises: row?.error?.finalVisibleDayExercises || [],
        lowerExerciseFamilies: row?.error?.lowerExerciseFamilies || [],
        quadPatternExistedBeforeCleanup: row?.error?.quadPatternExistedBeforeCleanup ?? null,
        cleanupRemovedOnlyQuadPattern: row?.error?.cleanupRemovedOnlyQuadPattern ?? null,
        cleanupTouchedPasses: row?.error?.cleanupTouchedPasses || [],
        safeQuadReplacementAvailable: row?.error?.safeQuadReplacementAvailable ?? null,
        quadRepairFailureReason: row?.error?.quadRepairFailureReason || null,
        missingQuadPatternOrigin: row?.error?.missingQuadPatternOrigin || null,
        cleanupActionLog: row?.error?.cleanupActionLog || [],
        quadRepairAttempted: row?.error?.quadRepairAttempted || []
      }))
      .sort((a, b) => {
        const dayCmp = Number(a.dayCount || 0) - Number(b.dayCount || 0);
        if (dayCmp) return dayCmp;
        const priCmp = Number(a.priorityCount || 0) - Number(b.priorityCount || 0);
        if (priCmp) return priCmp;
        return (a.combo || []).join(' + ').localeCompare((b.combo || []).join(' + '));
      })
  };
}

function buildWorkerExitDiagnostic(failureEntries) {
  const rows = failureEntries
    .filter((entry) => {
      const code = String(entry?.error?.error || '').trim();
      const invariant = String(entry?.error?.failedInvariant || '').trim();
      const section = String(entry?.error?.validatorSection || '').trim();
      return code === 'PLAN_BUILD_WORKER_EXIT'
        || code === 'PLAN_BUILD_TIMEOUT'
        || (section === 'worker execution' && ['worker_exit', 'timeout'].includes(invariant));
    })
    .map((entry) => {
      let rootCause = 'unknown worker exit';
      if (entry?.error?.didTimeoutFire || entry?.error?.terminateReason === 'timeout' || String(entry?.error?.error || '') === 'PLAN_BUILD_TIMEOUT') {
        rootCause = 'timeout';
      } else if (entry?.error?.uncaughtExceptionMessage || entry?.error?.unhandledRejectionMessage || entry?.error?.processExitCalled) {
        rootCause = 'crash';
      } else if ((entry?.error?.workerMessageReceived || entry?.error?.workerErrorPostMessageStarted || entry?.error?.assertCallThrew)
        && (entry?.error?.validatorSection || entry?.error?.failedInvariant)) {
        rootCause = 'structured validation error not delivered';
      }
      return {
        combo: entry.combo,
        dayCount: entry.dayCount,
        priorityCount: entry.priorityCount,
        selectedPriorities: entry.selectedPriorities,
        errorCode: entry?.error?.error || null,
        message: entry?.error?.message || entry?.error?.reason || null,
        workerExitCode: entry?.error?.workerExitCode ?? null,
        didTimeoutFire: typeof entry?.error?.didTimeoutFire === 'boolean' ? entry.error.didTimeoutFire : null,
        terminateCalled: typeof entry?.error?.terminateCalled === 'boolean' ? entry.error.terminateCalled : null,
        terminateReason: entry?.error?.terminateReason || null,
        lastHeartbeatStage: entry?.error?.lastHeartbeatStage || null,
        lastBuilderStage: entry?.error?.lastBuilderStage || null,
        lastRepairOrPolishFunction: entry?.error?.lastRepairOrPolishFunction || null,
        validatorSection: entry?.error?.validatorSection || null,
        failedInvariant: entry?.error?.failedInvariant || null,
        uncaughtException: entry?.error?.uncaughtExceptionMessage || null,
        unhandledRejection: entry?.error?.unhandledRejectionMessage || null,
        stackPreview: entry?.error?.stackPreview || null,
        week: entry?.error?.week ?? null,
        day: entry?.error?.day ?? null,
        dayType: entry?.error?.dayType ?? null,
        workerMessageType: entry?.error?.workerMessageType || null,
        workerMessageReceived: typeof entry?.error?.workerMessageReceived === 'boolean' ? entry.error.workerMessageReceived : null,
        workerExitAfterMessage: typeof entry?.error?.workerExitAfterMessage === 'boolean' ? entry.error.workerExitAfterMessage : null,
        processExitCalled: typeof entry?.error?.processExitCalled === 'boolean' ? entry.error.processExitCalled : null,
        processExitCode: entry?.error?.processExitCode ?? null,
        assertCallStarted: typeof entry?.error?.assertCallStarted === 'boolean' ? entry.error.assertCallStarted : null,
        assertCallReturnedSuccess: typeof entry?.error?.assertCallReturnedSuccess === 'boolean' ? entry.error.assertCallReturnedSuccess : null,
        assertCallThrew: typeof entry?.error?.assertCallThrew === 'boolean' ? entry.error.assertCallThrew : null,
        assertCallFinally: typeof entry?.error?.assertCallFinally === 'boolean' ? entry.error.assertCallFinally : null,
        lastSectionStarted: entry?.error?.lastSectionStarted || null,
        lastSectionCompleted: entry?.error?.lastSectionCompleted || null,
        rootCause
      };
    });

  const groupCounts = (items, keyFn) => {
    const counts = new Map();
    for (const item of items) {
      const key = keyFn(item);
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
  };

  return {
    total: rows.length,
    byRootCause: groupCounts(rows, (row) => row.rootCause),
    byLastHeartbeatStage: groupCounts(rows, (row) => row.lastHeartbeatStage || 'none'),
    byLastRepairOrPolishFunction: groupCounts(rows, (row) => row.lastRepairOrPolishFunction || 'none'),
    byDayCount: groupCounts(rows, (row) => row.dayCount),
    byPriorityCount: groupCounts(rows, (row) => row.priorityCount),
    rows: rows.sort((a, b) => {
      const dayCmp = Number(a.dayCount || 0) - Number(b.dayCount || 0);
      if (dayCmp) return dayCmp;
      const priCmp = Number(a.priorityCount || 0) - Number(b.priorityCount || 0);
      if (priCmp) return priCmp;
      return (a.combo || []).join(' + ').localeCompare((b.combo || []).join(' + '));
    })
  };
}

function buildTimeoutProfilingReport(failureEntries) {
  const rows = failureEntries
    .filter((entry) => String(entry?.error?.failedInvariant || '').trim() === 'timeout'
      || String(entry?.error?.error || '').trim() === 'PLAN_BUILD_TIMEOUT')
    .map((entry) => ({
      combo: entry.combo,
      dayCount: entry.dayCount,
      priorityCount: entry.priorityCount,
      selectedPriorities: entry.selectedPriorities,
      lastHeartbeatStage: entry?.error?.lastHeartbeatStage || null,
      heartbeatStageHistory: Array.isArray(entry?.error?.heartbeatStageHistory) ? entry.error.heartbeatStageHistory : [],
      firstCheckpointReached: entry?.error?.firstHeartbeatStage || null,
      lastCheckpointReached: entry?.error?.lastHeartbeatStage || null,
      lastBuilderStage: entry?.error?.lastBuilderStage || null,
      currentValidatorSection: entry?.error?.validatorSection || null,
      validatorSectionDurations: entry?.error?.sectionDurationsMs || {},
      lastCompletedValidatorSection: entry?.error?.lastSectionCompleted || null,
      sectionCurrentlyRunning: entry?.error?.currentRunningSection || entry?.error?.lastSectionStarted || null,
      currentSectionElapsedMs: entry?.error?.currentRunningSectionElapsedMs ?? null,
      week: entry?.error?.week ?? null,
      day: entry?.error?.day ?? null,
      dayType: entry?.error?.dayType ?? null,
      exerciseList: entry?.error?.exerciseNames || entry?.error?.finalVisibleDayExercises || [],
      planShapeType: entry?.error?.planShapeType || null,
      isOblueprintPlanShape: entry?.error?.isOblueprintPlanShape ?? null,
      weeksLength: entry?.error?.weeksLength ?? null,
      firstWeekDayCount: entry?.error?.firstWeekDayCount ?? null,
      totalDayCount: entry?.error?.totalDayCount ?? null,
      totalExerciseCount: entry?.error?.totalExerciseCount ?? null,
      dayTypesPresent: entry?.error?.dayTypesPresent || [],
      branchEntered: entry?.error?.branchEntered || null,
      workerExitCode: entry?.error?.workerExitCode ?? null,
      didTimeoutFire: typeof entry?.error?.didTimeoutFire === 'boolean' ? entry.error.didTimeoutFire : null,
      terminateReason: entry?.error?.terminateReason || null
    }));

  const groupCounts = (items, keyFn) => {
    const counts = new Map();
    for (const item of items) {
      const key = keyFn(item);
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
  };

  return {
    total: rows.length,
    largestPlanShapeSizes: rows.reduce((acc, row) => ({
      maxWeeksLength: Math.max(Number(acc.maxWeeksLength || 0), Number(row.weeksLength || 0)),
      maxFirstWeekDayCount: Math.max(Number(acc.maxFirstWeekDayCount || 0), Number(row.firstWeekDayCount || 0)),
      maxTotalDayCount: Math.max(Number(acc.maxTotalDayCount || 0), Number(row.totalDayCount || 0)),
      maxTotalExerciseCount: Math.max(Number(acc.maxTotalExerciseCount || 0), Number(row.totalExerciseCount || 0))
    }), {
      maxWeeksLength: 0,
      maxFirstWeekDayCount: 0,
      maxTotalDayCount: 0,
      maxTotalExerciseCount: 0
    }),
    byCurrentSection: groupCounts(rows, (row) => row.sectionCurrentlyRunning || row.currentValidatorSection || row.lastBuilderStage || row.lastHeartbeatStage || 'unknown'),
    byLastCompletedSection: groupCounts(rows, (row) => row.lastCompletedValidatorSection || 'none'),
    byBranchEntered: groupCounts(rows, (row) => row.branchEntered || 'none'),
    rows: rows.sort((a, b) => {
      const dayCmp = Number(a.dayCount || 0) - Number(b.dayCount || 0);
      if (dayCmp) return dayCmp;
      const priCmp = Number(a.priorityCount || 0) - Number(b.priorityCount || 0);
      if (priCmp) return priCmp;
      return (a.combo || []).join(' + ').localeCompare((b.combo || []).join(' + '));
    })
  };
}

function buildHeavyDeadliftCountDiagnostic(failureEntries) {
  const rows = failureEntries
    .filter((entry) => String(entry?.error?.failedInvariant || '').trim() === 'heavy_deadlift_count')
    .map((entry) => {
      const heavyByDay = Array.isArray(entry?.error?.heavyDeadliftByDay) ? entry.error.heavyDeadliftByDay : [];
      const heavyPatterns = Array.isArray(entry?.error?.heavyDeadliftExercisesInWeek) ? entry.error.heavyDeadliftExercisesInWeek : [];
      const hingePatterns = Array.isArray(entry?.error?.hingeDeadliftExercisesInWeek) ? entry.error.hingeDeadliftExercisesInWeek : [];
      const falsePositive = Boolean(entry?.error?.falsePositiveClassification) || Number(entry?.error?.heavyDeadliftFalsePositiveCount || 0) > 0;
      const sameDayStacking = Boolean(entry?.error?.sameDayHeavyHingeStacking) || heavyByDay.some((item) => Number(item?.count || 0) > 1);
      const weeklyStacking = Boolean(entry?.error?.weeklyHeavyHingeStacking) || (!sameDayStacking && heavyPatterns.length > 1);
      const prioritySpecificAcceptable = !sameDayStacking
        && weeklyStacking
        && Boolean(entry?.error?.glutesSelected)
        && heavyPatterns.every((item) => Boolean(item?.trueHeavyHinge));
      return {
        combo: entry.combo,
        dayCount: entry.dayCount,
        priorityCount: entry.priorityCount,
        selectedPriorities: entry.selectedPriorities,
        week: entry?.error?.week ?? null,
        day: entry?.error?.day ?? null,
        dayType: entry?.error?.dayType ?? null,
        fullWeekExerciseList: entry?.error?.weekExerciseList || [],
        failedDayExerciseList: entry?.error?.failedDayExercises || entry?.error?.exerciseNames || [],
        hingeDeadliftExercisesInWeek: hingePatterns,
        heavyDeadliftExercisesInWeek: heavyPatterns,
        countedHeavyDeadliftExerciseNames: entry?.error?.countedHeavyDeadliftExerciseNames || [],
        legsSelected: entry?.error?.legsSelected ?? null,
        glutesSelected: entry?.error?.glutesSelected ?? null,
        sameDayHeavyHingeCount: entry?.error?.sameDayHeavyHingeCount ?? null,
        weeklyHeavyHingeExposureDays: entry?.error?.weeklyHeavyHingeExposureDays ?? null,
        repeatedHeavyHingeRole: entry?.error?.repeatedHeavyHingeRole ?? null,
        sameDayHeavyHingeStacking: sameDayStacking,
        weeklyHeavyHingeStacking: weeklyStacking,
        falsePositiveClassification: falsePositive,
        safeReplacementExists: entry?.error?.safeHeavyHingeReplacementExists ?? null,
        safeReplacementCandidate: entry?.error?.safeHeavyHingeReplacementCandidate || null,
        removingOrReplacingWouldBreakLowerDayStructure: entry?.error?.removingOrReplacingWouldBreakLowerDayStructure ?? null,
        prioritySpecificAcceptablePosteriorChainWorkBeingTreatedTooStrictly: prioritySpecificAcceptable,
        hardFailReason: entry?.error?.hardFailReason ?? null,
        softenedToWarning: entry?.error?.softenedToWarning ?? null,
        groupedCause: falsePositive
          ? 'false positive classification'
          : sameDayStacking
            ? 'same-day heavy hinge stacking'
            : prioritySpecificAcceptable
              ? 'priority-specific acceptable posterior-chain work being treated too strictly'
              : ((entry?.error?.safeHeavyHingeReplacementExists === false || entry?.error?.removingOrReplacingWouldBreakLowerDayStructure) ? 'no safe replacement' : 'weekly heavy hinge stacking')
      };
    });

  const groupCounts = (items, keyFn) => {
    const counts = new Map();
    for (const item of items) {
      const key = keyFn(item);
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
  };

  const topRepeatedHeavyHingePatterns = groupCounts(rows, (row) => row.countedHeavyDeadliftExerciseNames.join(' + ')).slice(0, 10);

  return {
    total: rows.length,
    byDayCount: groupCounts(rows, (row) => row.dayCount),
    byPriorityCount: groupCounts(rows, (row) => row.priorityCount),
    byDayType: groupCounts(rows, (row) => row.dayType || 'unknown'),
    bySelectedPriorities: groupCounts(rows, (row) => (row.combo || []).join(' + ')),
    byGroupedCause: groupCounts(rows, (row) => row.groupedCause),
    bySafeReplacementExists: groupCounts(rows, (row) => String(Boolean(row.safeReplacementExists))),
    rows: rows.sort((a, b) => {
      const dayCmp = Number(a.dayCount || 0) - Number(b.dayCount || 0);
      if (dayCmp) return dayCmp;
      const priCmp = Number(a.priorityCount || 0) - Number(b.priorityCount || 0);
      if (priCmp) return priCmp;
      return (a.combo || []).join(' + ').localeCompare((b.combo || []).join(' + '));
    }),
    topRepeatedHeavyHingePatterns
  };
}

function buildTopWarningFamilies(rows) {
  const grouped = new Map();
  for (const row of rows) {
    for (const detail of Array.isArray(row.redundancyDetails) ? row.redundancyDetails : []) {
      const family = String(detail?.repeatedMovementFamily || 'general');
      grouped.set(family, Number(grouped.get(family) || 0) + 1);
    }
  }
  return [...grouped.entries()]
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

function buildExpandedMatrixReport(testResults, settings, priorityOptions) {
  const failures = testResults.filter((row) => row.status === 'FAIL').map(buildFailureReportEntry);
  const unsupported = testResults.filter((row) => row.status === 'UNSUPPORTED');
  const passing = testResults.filter((row) => row.status === 'PASS');
  const passesWithWarnings = passing.filter((row) => row.warningCount > 0);
  const cleanPasses = passing.filter((row) => row.warningCount === 0);
  const focusedMode = Boolean(settings.filterFailedInvariant || settings.rerunFailures);
  const expectedTotalTests = focusedMode
    ? (Number(settings.expectedFocusedTestCount || 0) || testResults.length)
    : settings.days.reduce(
      (sum, dayCount) => sum + settings.priorityCounts.reduce((inner, priorityCount) => inner + combinationsOfCount(priorityOptions, priorityCount).length, 0),
      0
    );
  const actualTotalTests = testResults.length;

  const suiteRows = [];
  for (const dayCount of settings.days) {
    for (const priorityCount of settings.priorityCounts) {
      const rows = testResults.filter((row) => row.dayCount === dayCount && row.priorityCount === priorityCount);
      if (!rows.length) continue;
      const rowFailures = rows.filter((row) => row.status === 'FAIL').map(buildFailureReportEntry);
      const rowUnsupported = rows.filter((row) => row.status === 'UNSUPPORTED');
      const rowPassing = rows.filter((row) => row.status === 'PASS');
      const rowPassesWithWarnings = rowPassing.filter((row) => row.warningCount > 0);
      const rowCleanPasses = rowPassing.filter((row) => row.warningCount === 0);
      suiteRows.push({
        dayCount,
        priorityCount,
        totalCombos: rows.length,
        passed: rowPassing.length,
        failed: rowFailures.length,
        unsupported: rowUnsupported.length,
        passesWithWarnings: rowPassesWithWarnings.length,
        cleanPasses: rowCleanPasses.length,
        sameDayRedundancy: rows.reduce((sum, row) => sum + (Array.isArray(row.redundancyDetails) ? row.redundancyDetails.length : 0), 0),
        hardFailures: rowFailures.length,
        topWarningFamilies: buildTopWarningFamilies(rowPassing).slice(0, 10),
        failedCombos: rowFailures.map((row) => row.combo.join(' + ')).sort(),
        validatorFailures: rowFailures.reduce((acc, row) => {
          const key = `${row?.error?.validatorSection || 'unknown'} / ${row?.error?.failedInvariant || 'unknown'}`;
          acc.set(key, Number(acc.get(key) || 0) + 1);
          return acc;
        }, new Map())
      });
    }
  }

  const mapCounts = (rows, keyFn) => {
    const counts = new Map();
    for (const row of rows) {
      const key = keyFn(row);
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
  };

  return {
    expectedTotalTests,
    actualTotalTests,
    settings: {
      parsedDays: settings.days.slice(),
      parsedPriorityCounts: settings.priorityCounts.slice(),
      uiPriorityButtons: priorityOptions.map((entry) => entry.label)
    },
    overall: {
      totalTests: actualTotalTests,
      passed: passing.length,
      failed: failures.length,
      unsupported: unsupported.length,
      passesWithWarnings: passesWithWarnings.length,
      cleanPasses: cleanPasses.length
    },
    bySuite: suiteRows.map((row) => ({
      ...row,
      validatorFailures: [...row.validatorFailures.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    })),
    failuresByDayCount: mapCounts(failures, (row) => row.dayCount),
    failuresByPriorityCount: mapCounts(failures, (row) => row.priorityCount),
    failuresByCombo: mapCounts(failures, (row) => row.combo.join(' + ')),
    failuresByValidator: mapCounts(failures, (row) => `${row?.error?.validatorSection || 'unknown'} / ${row?.error?.failedInvariant || 'unknown'}`),
    unknownFailuresByMessageAndFunction: mapCounts(
      failures.filter((row) => `${row?.error?.validatorSection || 'unknown'} / ${row?.error?.failedInvariant || 'unknown'}` === 'unknown / unknown'),
      (row) => `${row?.error?.rawFunctionName || row?.functionName || 'unknown'} | ${row?.error?.rawErrorMessage || row?.error?.message || row?.error?.reason || 'unknown'}`
    ),
    sameDayRedundancyByDayCount: settings.days.map((dayCount) => ({
      dayCount,
      count: passing
        .filter((row) => row.dayCount === dayCount)
        .reduce((sum, row) => sum + (Array.isArray(row.redundancyDetails) ? row.redundancyDetails.length : 0), 0)
    })),
    topWarningFamilies: buildTopWarningFamilies(passing).slice(0, 10),
    unknownFailureDiagnostic: buildUnknownFailureDiagnostic(failures)
  };
}

function printConsoleSummary(report) {
  console.log('');
  if (report.expandedMatrixReport) {
    console.log('BODYBUILDING EXPANDED MATRIX');
    console.log(`Tests: ${report.expandedMatrixReport.overall.totalTests} | Passed: ${report.expandedMatrixReport.overall.passed} | Failed: ${report.expandedMatrixReport.overall.failed} | Unsupported: ${report.expandedMatrixReport.overall.unsupported} | Passes with warnings: ${report.expandedMatrixReport.overall.passesWithWarnings} | Clean passes: ${report.expandedMatrixReport.overall.cleanPasses}`);
    console.log(`Parsed days: ${report.expandedMatrixReport.settings.parsedDays.join(', ')} | Parsed priority counts: ${report.expandedMatrixReport.settings.parsedPriorityCounts.join(', ')}`);
    console.log(`Expected tests: ${report.expandedMatrixReport.expectedTotalTests} | Actual tests: ${report.expandedMatrixReport.actualTotalTests}`);
  } else {
    console.log('BODYBUILDING 5-DAY 3-PRIORITY COMBO MATRIX');
    console.log(`Combos: ${report.summary.totalCombos} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed} | Passes with warnings: ${report.summary.passesWithWarnings} | Clean passes: ${report.summary.cleanPasses}`);
  }
  console.log('');
  if (report.expandedMatrixReport) {
    console.log('PHASE 1 SUITES');
    for (const row of report.expandedMatrixReport.bySuite) {
      const topFamilies = row.topWarningFamilies.map((entry) => `${entry.family}:${entry.count}`).join(', ') || 'none';
      console.log(`  - days=${row.dayCount} | priorities=${row.priorityCount} | total=${row.totalCombos} | passed=${row.passed} | failed=${row.failed} | unsupported=${row.unsupported} | warnings=${row.passesWithWarnings} | clean=${row.cleanPasses} | same_day_redundancy=${row.sameDayRedundancy} | topFamilies=${topFamilies}`);
    }
    console.log('');
  }
  console.log('HARD FAILURES');
  if (!report.failures.length) console.log('  none');
  report.failures.forEach((failure) => {
    console.log(`  - ${failure.combo.join(' + ')} | days=${failure.dayCount || 'unknown'} | priorities=${failure.priorityCount || 'unknown'} | stage=${failure.failedStage || 'unknown'} | fn=${failure.functionName || 'unknown'} | code=${failure.error?.error || 'unknown'} | section=${failure.error?.validatorSection || 'unknown'} | invariant=${failure.error?.failedInvariant || 'unknown'} | msg=${failure.error?.message || failure.error?.reason || 'unknown'}`);
  });
  console.log('');
  console.log('UNKNOWN FAILURE DIAGNOSTIC');
  if (!Array.isArray(report.unknownFailureDiagnostic) || !report.unknownFailureDiagnostic.length) console.log('  none');
  for (const row of Array.isArray(report.unknownFailureDiagnostic) ? report.unknownFailureDiagnostic : []) {
    console.log(`  - ${row.combo.join(' + ')} | days=${row.dayCount || 'unknown'} | priorities=${row.priorityCount || 'unknown'} | rawKeys=${row.rawErrorKeys.join(', ') || 'none'} | rawStage=${row.rawStage || 'unknown'} | rawFn=${row.rawFunctionName || 'unknown'} | rawMsg=${row.rawErrorMessage || 'unknown'} | stack=${row.stackPreview || 'none'}`);
  }
  console.log('');
  console.log('TIMEOUT PROFILING REPORT');
  if (!report.timeoutProfilingReport || !report.timeoutProfilingReport.total) {
    console.log('  none');
  } else {
    console.log(`  - total=${report.timeoutProfilingReport.total}`);
    console.log(`  - byCurrentSection=${report.timeoutProfilingReport.byCurrentSection.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - byLastCompletedSection=${report.timeoutProfilingReport.byLastCompletedSection.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - byBranchEntered=${report.timeoutProfilingReport.byBranchEntered.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - largestPlanShapeSizes=weeks:${report.timeoutProfilingReport.largestPlanShapeSizes.maxWeeksLength}, firstWeekDays:${report.timeoutProfilingReport.largestPlanShapeSizes.maxFirstWeekDayCount}, totalDays:${report.timeoutProfilingReport.largestPlanShapeSizes.maxTotalDayCount}, totalExercises:${report.timeoutProfilingReport.largestPlanShapeSizes.maxTotalExerciseCount}`);
    for (const row of report.timeoutProfilingReport.rows) {
      const durations = Object.entries(row.validatorSectionDurations || {})
        .map(([key, value]) => `${key}:${value}`)
        .join(', ') || 'none';
      const exerciseList = Array.isArray(row.exerciseList) && row.exerciseList.length ? row.exerciseList.join(' | ') : 'none';
      console.log(`  - ${row.combo.join(' + ')} | days=${row.dayCount || 'unknown'} | priorities=${row.priorityCount || 'unknown'} | firstCheckpointReached=${row.firstCheckpointReached || 'none'} | lastCheckpointReached=${row.lastCheckpointReached || 'none'} | branchEntered=${row.branchEntered || 'none'} | planShapeType=${row.planShapeType || 'none'} | isOblueprintPlanShape=${String(row.isOblueprintPlanShape)} | weeksLength=${row.weeksLength ?? 'unknown'} | firstWeekDayCount=${row.firstWeekDayCount ?? 'unknown'} | totalDayCount=${row.totalDayCount ?? 'unknown'} | totalExerciseCount=${row.totalExerciseCount ?? 'unknown'} | dayTypesPresent=${Array.isArray(row.dayTypesPresent) ? row.dayTypesPresent.join('/') : 'none'} | lastHeartbeatStage=${row.lastHeartbeatStage || 'none'} | lastBuilderStage=${row.lastBuilderStage || 'none'} | currentValidatorSection=${row.currentValidatorSection || 'none'} | lastCompletedValidatorSection=${row.lastCompletedValidatorSection || 'none'} | sectionCurrentlyRunning=${row.sectionCurrentlyRunning || 'none'} | currentSectionElapsedMs=${row.currentSectionElapsedMs ?? 'unknown'} | week=${row.week ?? 'unknown'} | day=${row.day || 'unknown'} | dayType=${row.dayType || 'unknown'} | workerExitCode=${row.workerExitCode ?? 'unknown'} | didTimeoutFire=${String(row.didTimeoutFire)} | terminateReason=${row.terminateReason || 'none'} | sectionDurations=${durations} | exercises=${exerciseList}`);
    }
  }
  console.log('');
  console.log('WORKER_EXIT DIAGNOSTIC');
  if (!report.workerExitDiagnostic || !report.workerExitDiagnostic.total) {
    console.log('  none');
  } else {
    console.log(`  - total=${report.workerExitDiagnostic.total}`);
    console.log(`  - byRootCause=${report.workerExitDiagnostic.byRootCause.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - byLastHeartbeatStage=${report.workerExitDiagnostic.byLastHeartbeatStage.slice(0, 10).map((entry) => `${entry.key}:${entry.count}`).join(', ') || 'none'}`);
    console.log(`  - byLastRepairOrPolishFunction=${report.workerExitDiagnostic.byLastRepairOrPolishFunction.slice(0, 10).map((entry) => `${entry.key}:${entry.count}`).join(', ') || 'none'}`);
    for (const row of report.workerExitDiagnostic.rows) {
      console.log(`  - ${row.combo.join(' + ')} | days=${row.dayCount || 'unknown'} | priorities=${row.priorityCount || 'unknown'} | code=${row.errorCode || 'unknown'} | rootCause=${row.rootCause} | msg=${row.message || 'unknown'} | workerExitCode=${row.workerExitCode ?? 'unknown'} | didTimeoutFire=${String(row.didTimeoutFire)} | terminateCalled=${String(row.terminateCalled)} | terminateReason=${row.terminateReason || 'none'} | lastHeartbeatStage=${row.lastHeartbeatStage || 'none'} | lastBuilderStage=${row.lastBuilderStage || 'none'} | lastRepairOrPolishFunction=${row.lastRepairOrPolishFunction || 'none'} | section=${row.validatorSection || 'none'} | invariant=${row.failedInvariant || 'none'} | uncaughtException=${row.uncaughtException || 'none'} | unhandledRejection=${row.unhandledRejection || 'none'} | week=${row.week ?? 'unknown'} | day=${row.day || 'unknown'} | dayType=${row.dayType || 'unknown'} | workerMessageType=${row.workerMessageType || 'none'} | workerMessageReceived=${String(row.workerMessageReceived)} | stack=${row.stackPreview || 'none'}`);
    }
  }
  console.log('');
  console.log('MISSING_QUAD_PATTERN DIAGNOSTIC');
  if (!report.missingQuadPatternDiagnostic || !report.missingQuadPatternDiagnostic.total) {
    console.log('  none');
  } else {
    console.log(`  - total=${report.missingQuadPatternDiagnostic.total}`);
    console.log(`  - byDayCount=${report.missingQuadPatternDiagnostic.byDayCount.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - byPriorityCount=${report.missingQuadPatternDiagnostic.byPriorityCount.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - byDayType=${report.missingQuadPatternDiagnostic.byDayType.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - byOrigin=${report.missingQuadPatternDiagnostic.byOrigin.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - bySafeRepairCandidate=${report.missingQuadPatternDiagnostic.bySafeRepairCandidate.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
    console.log(`  - byRepairFailureReason=${report.missingQuadPatternDiagnostic.byRepairFailureReason.map((entry) => `${entry.key}:${entry.count}`).join(', ')}`);
  }
  console.log('');
  console.log('SOFT WARNINGS');
  if (!report.passesWithWarnings.length) console.log('  none');
  report.passesWithWarnings.forEach((entry) => {
    const counts = entry.warningSummary.map((item) => `${item.warningType}:${item.count}`).join(', ');
    console.log(`  - ${entry.combo.join(' + ')} | ${counts}`);
  });
  console.log('');
  console.log('ACCEPTABLE PRIORITY-SPECIFIC EXCEPTIONS');
  if (!report.acceptableExceptions.length) console.log('  none');
  report.acceptableExceptions.forEach((entry) => {
    console.log(`  - ${entry.combo.join(' + ')} | ${entry.type}`);
  });
  console.log('');
  console.log('REPEATED ROOT PATTERNS');
  if (!report.rootPatterns.length) console.log('  none');
  report.rootPatterns.forEach((entry) => {
    console.log(`  - ${entry.key}: ${entry.count}`);
  });
  console.log('');
  console.log('VALIDATOR CONTRACT AUDIT');
  if (!report.validatorContractAudit.length) console.log('  none');
  report.validatorContractAudit.forEach((entry) => {
    console.log(`  - ${entry.invariantName} | current=${entry.currentBehavior} | should=${entry.shouldBehavior} | repair=${entry.repairBeforeAssert} | affected=${entry.affectedComboCount}`);
  });
  console.log('');
  console.log('REDUNDANCY BY FAMILY');
  if (!report.redundancyFamilySummary.length) console.log('  none');
  report.redundancyFamilySummary.forEach((entry) => {
    const causes = entry.causes.map((item) => `${item.cause}:${item.count}`).join(', ');
    console.log(`  - ${entry.family}: ${entry.count} | ${causes}`);
  });
  console.log('');
  console.log('DATABASE LABEL AUDIT');
  if (!report.databaseLabelAudit.length) console.log('  none');
  report.databaseLabelAudit.slice(0, 20).forEach((entry) => {
    console.log(`  - ${entry.exerciseName} | issues=${entry.issues.join(', ')} | db=${entry.dbFamily} | implied=${entry.impliedFamily} | canonical=${entry.canonicalFamily} | current=${entry.currentLogicFamily}`);
  });
  console.log('');
  console.log('CANONICAL MOVEMENT-FAMILY MAP PROPOSAL');
  if (!report.canonicalMovementFamilyMapProposal.length) console.log('  none');
  report.canonicalMovementFamilyMapProposal.forEach((entry) => {
    console.log(`  - ${entry.canonicalFamily}: ${entry.exercises.join(', ')}`);
  });
  console.log('');
  console.log('FAMILY CONSISTENCY CHECK');
  if (!report.familyConsistencyCheck.length) console.log('  none');
  report.familyConsistencyCheck.slice(0, 20).forEach((entry) => {
    console.log(`  - ${entry.exerciseName} | canonical=${entry.canonicalFamily} | cleanup=${entry.cleanupFamily} | warning=${entry.warningFamily} | current=${entry.currentFamily} | consistent=${String(entry.consistent)}`);
  });
  console.log('');
  console.log('FINAL VISIBLE CLEANUP SUMMARY');
  if (!report.finalVisibleCleanupSummary) console.log('  none');
  if (report.finalVisibleCleanupSummary) {
    console.log(`  - same_day_redundancy before=${report.finalVisibleCleanupSummary.sameDayRedundancyBefore} after=${report.finalVisibleCleanupSummary.sameDayRedundancyAfter}`);
    console.log(`  - horizontal_row before=${report.finalVisibleCleanupSummary.horizontal_row.before} after=${report.finalVisibleCleanupSummary.horizontal_row.after}`);
    console.log(`  - squat_leg_press before=${report.finalVisibleCleanupSummary.squat_leg_press.before} after=${report.finalVisibleCleanupSummary.squat_leg_press.after}`);
    console.log(`  - shoulder_press before=${report.finalVisibleCleanupSummary.shoulder_press.before} after=${report.finalVisibleCleanupSummary.shoulder_press.after}`);
  }
  console.log('');
  console.log('HORIZONTAL_ROW CLEANUP DIAGNOSTIC');
  if (!Array.isArray(report.horizontalRowCleanupDiagnostic) || !report.horizontalRowCleanupDiagnostic.length) console.log('  none');
  for (const group of Array.isArray(report.horizontalRowCleanupDiagnostic) ? report.horizontalRowCleanupDiagnostic : []) {
    console.log(`  - cause=${group.cause} count=${group.count}`);
    for (const diag of group.diagnostics) {
      console.log(`    ${JSON.stringify(diag)}`);
    }
  }
  console.log('');
  console.log('SQUAT_LEG_PRESS CLEANUP DIAGNOSTIC');
  if (!Array.isArray(report.squatLegPressCleanupDiagnostic) || !report.squatLegPressCleanupDiagnostic.length) console.log('  none');
  for (const group of Array.isArray(report.squatLegPressCleanupDiagnostic) ? report.squatLegPressCleanupDiagnostic : []) {
    console.log(`  - cause=${group.cause} count=${group.count}`);
    for (const diag of group.diagnostics) {
      console.log(`    ${JSON.stringify(diag)}`);
    }
  }
  console.log('');
  console.log('HORIZONTAL_ROW SAFETY SIMULATION');
  if (!Array.isArray(report.horizontalRowSafetySimulation) || !report.horizontalRowSafetySimulation.length) console.log('  none');
  for (const row of Array.isArray(report.horizontalRowSafetySimulation) ? report.horizontalRowSafetySimulation : []) {
    console.log(`  - ${row.combo.join(' + ')} | replace=${row.exerciseBeingReplaced} | proposed=${row.proposedReplacement} | duplicateName=${String(row.wouldCreateDuplicateExerciseName)} | duplicateIsolationFamily=${String(row.wouldCreateDuplicateIsolationFamily)} | validatorPass=${String(row.finalValidatorWouldPass)} | validatorReason=${row.finalValidatorReason || 'none'} | decision=${row.acceptRejectDecision}`);
  }
  console.log('');
  console.log('SQUAT_LEG_PRESS SAFETY SIMULATION');
  if (!Array.isArray(report.squatLegPressSafetySimulation) || !report.squatLegPressSafetySimulation.length) console.log('  none');
  for (const row of Array.isArray(report.squatLegPressSafetySimulation) ? report.squatLegPressSafetySimulation : []) {
    console.log(`  - ${row.combo.join(' + ')} | week=${row.week} | day=${row.day || 'null'} | dayType=${row.dayType || 'null'} | squat=${row.squatLegPressExercises.join(' / ')} | replace=${row.exerciseBeingReplaced} | proposed=${row.proposedReplacement || 'none'} | validatorPass=${String(row.finalValidatorWouldPass)} | decision=${row.acceptRejectDecision} | reason=${row.reason}`);
  }
  console.log('');
  console.log('HINGE_POSTERIOR_CHAIN DIAGNOSTIC');
  if (!Array.isArray(report.hingePosteriorChainDiagnostic) || !report.hingePosteriorChainDiagnostic.length) console.log('  none');
  for (const row of Array.isArray(report.hingePosteriorChainDiagnostic) ? report.hingePosteriorChainDiagnostic : []) {
    const hingeList = row.hingePosteriorExercises.map((item) => `${item.exerciseName} [${item.subtype}]`).join(' / ');
    console.log(`  - ${row.combo.join(' + ')} | week=${row.week} | day=${row.day || 'null'} | dayType=${row.dayType || 'null'} | priorities=${row.selectedPriorities.join(', ')} | hinge=${hingeList} | hamstringsSelected=${String(row.hamstringsGlutesSelected)} | lowerHeavy=${String(row.lowerHeavyDay)} | quadPattern=${String(row.requiredQuadPatternPresent)} | calves=${String(row.calfAccessoryPresent)} | core=${String(row.coreAccessoryPresent)} | wouldBreakStructure=${String(row.wouldBreakStructure)} | acceptablePrioritySpecificDuplication=${String(row.acceptablePrioritySpecificDuplication)} | realSameRoleRedundancy=${String(row.realSameRoleRedundancy)}`);
  }
  console.log('');
  console.log('TOP 10 REPEATED HINGE/POSTERIOR PATTERNS');
  if (!Array.isArray(report.topRepeatedHingePosteriorPatterns) || !report.topRepeatedHingePosteriorPatterns.length) console.log('  none');
  for (const row of Array.isArray(report.topRepeatedHingePosteriorPatterns) ? report.topRepeatedHingePosteriorPatterns : []) {
    console.log(`  - ${row.pattern} | count=${row.count} | acceptable=${row.acceptablePrioritySpecificDuplication} | realRedundancy=${row.realSameRoleRedundancy}`);
  }
  console.log('');
  console.log('REMAINING REDUNDANCY DIAGNOSTIC');
  if (!Array.isArray(report.remainingRedundancyDiagnostic) || !report.remainingRedundancyDiagnostic.length) console.log('  none');
  for (const row of Array.isArray(report.remainingRedundancyDiagnostic) ? report.remainingRedundancyDiagnostic : []) {
    const replacement = row.possibleSafeReplacement
      ? `${row.possibleSafeReplacement.replace} -> ${row.possibleSafeReplacement.with}`
      : 'none';
    console.log(`  - family=${row.family} | ${row.combo.join(' + ')} | week=${row.week} | day=${row.day || 'null'} | dayType=${row.dayType || 'null'} | priorities=${row.selectedPriorities.join(', ')} | exercises=${row.exercisesCausingWarning.join(' / ')} | acceptable=${String(row.acceptablePrioritySpecificDuplication)} | structural=${String(row.structuralOrNeeded)} | breakValidation=${String(row.cleanupWouldBreakValidation)} | underfillPriority=${String(row.cleanupWouldUnderfillPriorityVolume)} | safeReplacement=${replacement} | decision=${row.acceptRejectDecision}`);
  }
  console.log('');
  console.log('TOP 10 CLEANUP RULES');
  if (!report.topCleanupRules.length) console.log('  none');
  report.topCleanupRules.forEach((entry) => {
    console.log(`  - ${entry.rule} | ${entry.rationale}`);
  });
  console.log('');
  if (Array.isArray(report.calvesDiagnostics) && report.calvesDiagnostics.length) {
    console.log('CALVES FAILURE DIAGNOSTIC REPORT');
    report.calvesDiagnostics.forEach((entry) => {
      console.log(`  - ${entry.combo.join(' + ')} | stage=${entry.failedStage || 'unknown'} | fn=${entry.functionName || 'unknown'} | section=${entry.validatorSection || 'unknown'} | invariant=${entry.failedInvariant || 'unknown'} | timeoutMs=${entry.timeoutMs ?? 'unknown'} | elapsedMs=${entry.elapsedMs ?? 'unknown'} | didTimeoutFire=${String(entry.didTimeoutFire)} | terminateCalled=${String(entry.terminateCalled)} | terminateReason=${entry.terminateReason || 'unknown'} | workerExitedBeforeTimeout=${String(entry.workerExitedBeforeTimeout)} | workerExitedAfterTimeout=${String(entry.workerExitedAfterTimeout)} | assertStartedAt=${entry.assertStartedAt ?? 'unknown'} | assertFinishedAt=${entry.assertFinishedAt ?? 'unknown'} | assertElapsedMs=${entry.assertElapsedMs ?? 'unknown'} | lastStarted=${entry.lastSectionStarted || 'unknown'} | lastCompleted=${entry.lastSectionCompleted || 'unknown'} | assertCallStarted=${String(entry.assertCallStarted)} | assertCallReturnedSuccess=${String(entry.assertCallReturnedSuccess)} | assertCallThrew=${String(entry.assertCallThrew)} | assertCallFinally=${String(entry.assertCallFinally)} | assertFinally=${String(entry.assertFinallyReached)} | workerBeforeFinalPost=${String(entry.workerBeforeFinalPostMessage)} | workerAfterFinalPost=${String(entry.workerAfterFinalPostMessage)} | parentMessageType=${entry.workerMessageType || 'unknown'} | parentReceivedFinal=${String(entry.workerMessageReceived)} | exitAfterMessage=${String(entry.workerExitAfterMessage)} | processExit=${String(entry.processExitCalled)} | week=${entry.lastKnownWeek ?? 'unknown'} | dayType=${entry.lastKnownDayType || 'unknown'} | msg=${entry.error?.message || entry.error?.reason || 'unknown'}`);
      if (Array.isArray(entry.exerciseNames) && entry.exerciseNames.length) {
        console.log(`    exercises: ${entry.exerciseNames.join(' | ')}`);
      }
      if (Array.isArray(entry.exerciseKeys) && entry.exerciseKeys.length) {
        console.log(`    exerciseKeys: ${entry.exerciseKeys.join(', ')}`);
      }
      if (entry.rawExercisePreview) {
        console.log(`    rawExercisePreview: ${entry.rawExercisePreview}`);
      }
      if (entry.rawDayPreview) {
        console.log(`    rawDayPreview: ${entry.rawDayPreview}`);
      }
      if (Array.isArray(entry.calfExposureDays) && entry.calfExposureDays.length) {
        console.log(`    calfExposureDays: ${entry.calfExposureDays.map((item) => `${item.day || '?'}:${item.dayType || '?'}:${item.directSets || 0}`).join(', ')}`);
      }
      if (entry.error?.stack) {
        console.log(`    stack: ${entry.error.stack.split('\n')[0]}`);
      }
      if (entry.processExitStack) {
        console.log(`    processExitStack: ${entry.processExitStack.split('\n')[0]}`);
      }
    });
    console.log('');
  }
  console.log('');
  console.log(`Report written to ${report.reportPath}`);
}

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.TRAINING_MATRIX_QUIET = '1';
  const settings = parseArgs(process.argv.slice(2));
  const rerunInvariant = settings.filterFailedInvariant || (settings.rerunFailures === 'timeout' ? 'timeout' : '');
  const expandedMode = settings.explicitDays || settings.explicitPriorityCounts || Boolean(rerunInvariant) || Boolean(settings.filterCoreFailures);
  settings.expandedMode = expandedMode;
  const priorityOptions = expandedMode ? extractUiPriorityOptions() : extractLegacyUiPriorityOptions();
  const filterKeys = new Set(settings.comboFilters.map(normalizeComboFilterLabel).filter(Boolean));
  const rerunTargets = settings.filterCoreFailures
    ? loadFailureRerunTargets(settings.rerunSource).filter((entry) => CORE_FAILURE_INVARIANTS.includes(String(entry?.failedInvariant || '').trim().toLowerCase()))
    : (rerunInvariant ? loadFailureRerunTargets(settings.rerunSource || settings.out, rerunInvariant) : []);
  const exactRerunTargets = (rerunInvariant || settings.filterCoreFailures) ? buildExactRerunTargets(priorityOptions, rerunTargets) : [];
  const rerunTargetKeys = new Set(exactRerunTargets.map((entry) => `${entry.dayCount}|${entry.priorityCount}|${entry.comboKey}`));
  const dayCounts = expandedMode
    ? (exactRerunTargets.length && !settings.explicitDays ? [...new Set(exactRerunTargets.map((entry) => entry.dayCount))].sort((a, b) => a - b) : settings.days.slice())
    : [5];
  const priorityCounts = expandedMode
    ? (exactRerunTargets.length && !settings.explicitPriorityCounts ? [...new Set(exactRerunTargets.map((entry) => entry.priorityCount))].sort((a, b) => a - b) : settings.priorityCounts.slice())
    : [3];
  const testResults = [];

  if (rerunInvariant || settings.filterCoreFailures) {
    for (const target of exactRerunTargets) {
      const comboKey = target.combo.map((entry) => normalizePriorityLabel(entry?.label)).sort().join('|');
      if (filterKeys.size && !filterKeys.has(comboKey)) continue;
      const runs = [];
      for (let runIndex = 0; runIndex < settings.runs; runIndex += 1) {
        // eslint-disable-next-line no-await-in-loop
        runs.push(await evaluateRun(target.combo, runIndex, settings, { dayCount: target.dayCount, priorityCount: target.priorityCount }));
      }
      testResults.push(summarizeComboRuns(runs));
    }
  } else {
    for (const dayCount of dayCounts) {
      for (const priorityCount of priorityCounts) {
        const combos = combinationsOfCount(priorityOptions, priorityCount).filter((combo) => {
          if (settings.calvesFailuresOnly && !isCalvesFailureCombo(combo)) return false;
          const comboKey = combo.map((entry) => String(entry?.label || '').trim().toLowerCase()).sort().join('|');
          if (rerunTargetKeys.size && !rerunTargetKeys.has(`${dayCount}|${priorityCount}|${comboKey}`)) return false;
          if (!filterKeys.size) return true;
          return filterKeys.has(comboKey);
        });
        for (const combo of combos) {
          const runs = [];
          for (let runIndex = 0; runIndex < settings.runs; runIndex += 1) {
            // eslint-disable-next-line no-await-in-loop
            runs.push(await evaluateRun(combo, runIndex, settings, { dayCount, priorityCount }));
          }
          testResults.push(summarizeComboRuns(runs));
        }
      }
    }
  }

  const failures = [];
  const unsupported = [];
  const passesWithWarnings = [];
  const cleanPasses = [];
  const acceptableExceptions = [];
  const warningPatternRows = [];

  for (const comboResult of testResults) {
    if (comboResult.status === 'FAIL') {
      failures.push(comboResult);
      continue;
    }
    if (comboResult.status === 'UNSUPPORTED') {
      unsupported.push(comboResult);
      continue;
    }
    const warningSummary = buildWarningSummaryForResult(comboResult);
    warningSummary.forEach((entry) => {
      warningPatternRows.push({
        combo: comboResult.combo,
        warningType: entry.warningType
      });
    });
    if (warningSummary.length) {
      passesWithWarnings.push({
        combo: comboResult.combo,
        dayCount: comboResult.dayCount,
        priorityCount: comboResult.priorityCount,
        normalizedPriorityGroups: comboResult.normalizedPriorityGroups,
        warningCount: comboResult.warningCount,
        warningSummary,
        metrics: comboResult.metrics
      });
    } else {
      cleanPasses.push({
        combo: comboResult.combo,
        dayCount: comboResult.dayCount,
        priorityCount: comboResult.priorityCount,
        normalizedPriorityGroups: comboResult.normalizedPriorityGroups,
        metrics: comboResult.metrics
      });
    }
    comboResult.acceptableExceptions.forEach((exception) => {
      acceptableExceptions.push({
        combo: comboResult.combo,
        dayCount: comboResult.dayCount,
        priorityCount: comboResult.priorityCount,
        normalizedPriorityGroups: comboResult.normalizedPriorityGroups,
        ...exception
      });
    });
  }

  const focusedRerunTargets = (rerunInvariant || settings.filterCoreFailures)
    ? exactRerunTargets.map((entry) => ({
      dayCount: entry.dayCount,
      priorityCount: entry.priorityCount,
      selectedPriorities: entry.combo.map((item) => String(item?.label || ''))
    }))
    : [];

  const report = {
    reportPath: settings.out,
    generatedAt: new Date().toISOString(),
    settings: {
      runs: settings.runs,
      timeoutMs: settings.timeoutMs,
      days: dayCounts,
      priorityCounts,
      expandedMode,
      rerunFailures: settings.rerunFailures || null,
      filterFailedInvariant: settings.filterFailedInvariant || null,
      rerunTargetCount: exactRerunTargets.length || 0,
      expectedFocusedTestCount: (rerunInvariant || settings.filterCoreFailures) ? exactRerunTargets.length : null,
      actualFocusedTestCount: (rerunInvariant || settings.filterCoreFailures) ? testResults.length : null
    },
    matrix: {
      uiPriorityOptions: priorityOptions,
      totalCombos: testResults.length,
      focusedRerunTargets
    },
    summary: {
      totalCombos: testResults.length,
      totalTests: testResults.length,
      passed: testResults.length - failures.length - unsupported.length,
      failed: failures.length,
      unsupported: unsupported.length,
      warnings: passesWithWarnings.reduce((sum, entry) => sum + entry.warningCount, 0),
      passesWithWarnings: passesWithWarnings.length,
      cleanPasses: cleanPasses.length
    },
    failures: failures.map(buildFailureReportEntry),
    unsupported: unsupported.map((entry) => ({
      combo: entry.combo,
      dayCount: entry.dayCount,
      priorityCount: entry.priorityCount,
      normalizedPriorityGroups: entry.normalizedPriorityGroups,
      error: entry.error ? {
        error: entry.error.error || null,
        message: entry.error.message || null,
        reason: entry.error.reason || null
      } : null
    })),
    passesWithWarnings,
    cleanPasses,
    acceptableExceptions,
    validatorContractAudit: buildValidatorContractAudit(testResults),
    redundancyFamilySummary: buildRedundancyFamilySummary(testResults),
    databaseLabelAudit: buildDatabaseLabelAudit(testResults),
    canonicalMovementFamilyMapProposal: buildCanonicalMovementFamilyMapProposal(testResults),
    familyConsistencyCheck: buildFamilyConsistencyCheck(testResults),
    finalVisibleCleanupSummary: buildFinalVisibleCleanupSummary(testResults),
    finalVisibleCleanupLog: testResults.flatMap((entry) => Array.isArray(entry.finalVisibleCleanupLog) ? entry.finalVisibleCleanupLog.map((log) => ({
      ...log,
      combo: entry.combo,
      dayCount: entry.dayCount,
      priorityCount: entry.priorityCount
    })) : []),
    finalVisibleCleanupDiagnostics: testResults.flatMap((entry) => Array.isArray(entry.finalVisibleCleanupDiagnostics) ? entry.finalVisibleCleanupDiagnostics.map((diag) => ({
      ...diag,
      combo: entry.combo,
      dayCount: entry.dayCount,
      priorityCount: entry.priorityCount
    })) : []),
    redundancyDetails: testResults.flatMap((entry) => (Array.isArray(entry.redundancyDetails) ? entry.redundancyDetails.map((detail) => ({
      ...detail,
      combo: entry.combo,
      dayCount: entry.dayCount,
      priorityCount: entry.priorityCount
    })) : [])),
    horizontalRowCleanupDiagnostic: buildFamilyCleanupDiagnosticSection(testResults, 'horizontal_row'),
    squatLegPressCleanupDiagnostic: buildFamilyCleanupDiagnosticSection(testResults, 'squat_leg_press'),
    hingePosteriorChainDiagnostic: buildHingePosteriorChainDiagnostic(testResults),
    horizontalRowSafetySimulation: buildHorizontalRowSafetySimulation(testResults),
    squatLegPressSafetySimulation: testResults.flatMap((entry) => Array.isArray(entry.squatLegPressSafetySimulation) ? entry.squatLegPressSafetySimulation.map((row) => ({
      ...row,
      combo: entry.combo,
      dayCount: entry.dayCount,
      priorityCount: entry.priorityCount
    })) : []),
    remainingRedundancyDiagnostic: buildRemainingRedundancyDiagnostic(testResults),
    topRepeatedHingePosteriorPatterns: [],
    topCleanupRules: buildTopCleanupRules(
      buildRedundancyFamilySummary(testResults),
      buildDatabaseLabelAudit(testResults)
    ),
    unknownFailureDiagnostic: buildUnknownFailureDiagnostic(failures.map(buildFailureReportEntry)),
    timeoutProfilingReport: buildTimeoutProfilingReport(failures.map(buildFailureReportEntry)),
    workerExitDiagnostic: buildWorkerExitDiagnostic(failures.map(buildFailureReportEntry)),
    missingQuadPatternDiagnostic: buildMissingQuadPatternDiagnostic(failures.map(buildFailureReportEntry)),
    heavyDeadliftCountDiagnostic: buildHeavyDeadliftCountDiagnostic(failures.map(buildFailureReportEntry)),
    calvesDiagnostics: failures
      .filter((entry) => entry.combo.includes('Calves'))
      .map((entry) => ({
        combo: entry.combo,
        normalizedPriorityGroups: entry.normalizedPriorityGroups,
        failedStage: entry.failedStage,
        functionName: entry.functionName,
        lastHeartbeatStage: entry.error?.lastHeartbeatStage || null,
        lastBuilderStage: entry.error?.lastBuilderStage || null,
        lastRepairOrPolishFunction: entry.error?.lastRepairOrPolishFunction || null,
        lastKnownWeek: entry.error?.lastKnownWeek ?? null,
        lastKnownDay: entry.error?.lastKnownDay || null,
        lastKnownDayType: entry.error?.lastKnownDayType || null,
        validatorSection: entry.error?.validatorSection || null,
        failedInvariant: entry.error?.failedInvariant || null,
        lastSectionStarted: entry.error?.lastSectionStarted || null,
        lastSectionCompleted: entry.error?.lastSectionCompleted || null,
        assertFinallyReached: typeof entry.error?.assertFinallyReached === 'boolean' ? entry.error.assertFinallyReached : null,
        assertReturnedSuccessfully: typeof entry.error?.assertReturnedSuccessfully === 'boolean' ? entry.error.assertReturnedSuccessfully : null,
        assertCallStarted: typeof entry.error?.assertCallStarted === 'boolean' ? entry.error.assertCallStarted : null,
        assertCallReturnedSuccess: typeof entry.error?.assertCallReturnedSuccess === 'boolean' ? entry.error.assertCallReturnedSuccess : null,
        assertCallThrew: typeof entry.error?.assertCallThrew === 'boolean' ? entry.error.assertCallThrew : null,
        assertCallFinally: typeof entry.error?.assertCallFinally === 'boolean' ? entry.error.assertCallFinally : null,
        thrownMessage: entry.error?.thrownMessage || null,
        assertStartedAt: entry.error?.assertStartedAt ?? null,
        assertFinishedAt: entry.error?.assertFinishedAt ?? null,
        assertElapsedMs: entry.error?.assertElapsedMs ?? null,
        dayIndex: entry.error?.dayIndex ?? null,
        exerciseIndex: entry.error?.exerciseIndex ?? null,
        exerciseName: entry.error?.exerciseName || null,
        exerciseNames: entry.error?.exerciseNames || null,
        exerciseKeys: entry.error?.exerciseKeys || null,
        rawExercisePreview: entry.error?.rawExercisePreview || null,
        rawDayPreview: entry.error?.rawDayPreview || null,
        selectedSplit: entry.error?.selectedSplit || null,
        weeklyTargets: entry.error?.weeklyTargets || null,
        calfTargetSets: entry.error?.calfTargetSets ?? null,
        calfDirectSets: entry.error?.calfDirectSets ?? null,
        calfExposureDays: entry.error?.calfExposureDays || null,
        calfExposureByWeek: entry.error?.calfExposureByWeek || null,
        processExitCalled: typeof entry.error?.processExitCalled === 'boolean' ? entry.error.processExitCalled : null,
        processExitCode: entry.error?.processExitCode ?? null,
        processExitStack: entry.error?.processExitStack || null,
        workerAfterAssertSuccess: typeof entry.error?.workerAfterAssertSuccess === 'boolean' ? entry.error.workerAfterAssertSuccess : null,
        workerSuccessPayloadBuildStarted: typeof entry.error?.workerSuccessPayloadBuildStarted === 'boolean' ? entry.error.workerSuccessPayloadBuildStarted : null,
        workerSuccessPayloadBuildCompleted: typeof entry.error?.workerSuccessPayloadBuildCompleted === 'boolean' ? entry.error.workerSuccessPayloadBuildCompleted : null,
        workerSuccessPostMessageStarted: typeof entry.error?.workerSuccessPostMessageStarted === 'boolean' ? entry.error.workerSuccessPostMessageStarted : null,
        workerSuccessPostMessageCompleted: typeof entry.error?.workerSuccessPostMessageCompleted === 'boolean' ? entry.error.workerSuccessPostMessageCompleted : null,
        workerAssertErrorCaught: typeof entry.error?.workerAssertErrorCaught === 'boolean' ? entry.error.workerAssertErrorCaught : null,
        workerErrorSerializeStarted: typeof entry.error?.workerErrorSerializeStarted === 'boolean' ? entry.error.workerErrorSerializeStarted : null,
        workerErrorSerializeCompleted: typeof entry.error?.workerErrorSerializeCompleted === 'boolean' ? entry.error.workerErrorSerializeCompleted : null,
        workerErrorPostMessageStarted: typeof entry.error?.workerErrorPostMessageStarted === 'boolean' ? entry.error.workerErrorPostMessageStarted : null,
        workerErrorPostMessageCompleted: typeof entry.error?.workerErrorPostMessageCompleted === 'boolean' ? entry.error.workerErrorPostMessageCompleted : null,
        workerBeforeAssertCall: typeof entry.error?.workerBeforeAssertCall === 'boolean' ? entry.error.workerBeforeAssertCall : null,
        workerAfterAssertFinally: typeof entry.error?.workerAfterAssertFinally === 'boolean' ? entry.error.workerAfterAssertFinally : null,
        workerBeforeFinalResultBuild: typeof entry.error?.workerBeforeFinalResultBuild === 'boolean' ? entry.error.workerBeforeFinalResultBuild : null,
        workerAfterFinalResultBuild: typeof entry.error?.workerAfterFinalResultBuild === 'boolean' ? entry.error.workerAfterFinalResultBuild : null,
        workerBeforeFinalPostMessage: typeof entry.error?.workerBeforeFinalPostMessage === 'boolean' ? entry.error.workerBeforeFinalPostMessage : null,
        workerAfterFinalPostMessage: typeof entry.error?.workerAfterFinalPostMessage === 'boolean' ? entry.error.workerAfterFinalPostMessage : null,
        workerBeforeProcessNaturalExit: typeof entry.error?.workerBeforeProcessNaturalExit === 'boolean' ? entry.error.workerBeforeProcessNaturalExit : null,
        workerMessageReceived: typeof entry.error?.workerMessageReceived === 'boolean' ? entry.error.workerMessageReceived : null,
        workerMessageType: entry.error?.workerMessageType || null,
        workerExitCode: entry.error?.workerExitCode ?? null,
        workerExitAfterMessage: typeof entry.error?.workerExitAfterMessage === 'boolean' ? entry.error.workerExitAfterMessage : null,
        workerSpawnedAt: entry.error?.workerSpawnedAt ?? null,
        timeoutMs: entry.error?.timeoutMs ?? null,
        elapsedMs: entry.error?.elapsedMs ?? null,
        didTimeoutFire: typeof entry.error?.didTimeoutFire === 'boolean' ? entry.error.didTimeoutFire : null,
        timeoutTimerScheduled: typeof entry.error?.timeoutTimerScheduled === 'boolean' ? entry.error.timeoutTimerScheduled : null,
        timeoutTimerCleared: typeof entry.error?.timeoutTimerCleared === 'boolean' ? entry.error.timeoutTimerCleared : null,
        terminateCalled: typeof entry.error?.terminateCalled === 'boolean' ? entry.error.terminateCalled : null,
        terminateReason: entry.error?.terminateReason || null,
        terminateStack: entry.error?.terminateStack || null,
        terminateElapsedMs: entry.error?.terminateElapsedMs ?? null,
        workerExitedBeforeTimeout: typeof entry.error?.workerExitedBeforeTimeout === 'boolean' ? entry.error.workerExitedBeforeTimeout : null,
        workerExitedAfterTimeout: typeof entry.error?.workerExitedAfterTimeout === 'boolean' ? entry.error.workerExitedAfterTimeout : null,
        lastWorkerDiagnosticStage: entry.error?.lastWorkerDiagnosticStage || null,
        uncaughtExceptionMessage: entry.error?.uncaughtExceptionMessage || null,
        unhandledRejectionMessage: entry.error?.unhandledRejectionMessage || null,
        error: entry.error
      })),
    rootPatterns: buildRootPatternReport(
      failures,
      warningPatternRows
    ),
    combos: testResults,
    expandedMatrixReport: expandedMode ? buildExpandedMatrixReport(testResults, {
      ...settings,
      days: dayCounts,
      priorityCounts,
      expectedFocusedTestCount: (rerunInvariant || settings.filterCoreFailures) ? exactRerunTargets.length : null
    }, priorityOptions) : null
  };
  report.topRepeatedHingePosteriorPatterns = buildTopRepeatedHingePosteriorPatterns(report.hingePosteriorChainDiagnostic);

  fs.mkdirSync(path.dirname(settings.out), { recursive: true });
  fs.writeFileSync(settings.out, JSON.stringify(report, null, 2));
  printConsoleSummary(report);
}

main().catch((err) => {
  console.error('bodybuildingComboMatrix failed', err);
  process.exitCode = 1;
});
