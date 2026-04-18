const fs = require('fs');
const path = require('path');

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
const MUSCLE_KEYS = ['Chest', 'Back', 'Legs', 'Glutes', 'Shoulders', 'Arms', 'Core', 'Calves', 'Forearms', 'Neck'];
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
const STRESS_MULT = { Low: 1.0, Medium: 0.93, High: 0.85 };
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

function buildPlanSeed() {
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

function structuredNoEligible(slot, user) {
  return {
    error: 'NO_ELIGIBLE_EXERCISE',
    slotId: slot.id,
    pattern: slot.pattern,
    requiredStyle: slot.styleRequired || null,
    allowedEquipment: [...user.allowedEquipment],
    avoidTokens: [...user.avoidNameContainsTokens],
    injuryMap: user.injuryMap
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
    dumbbells: 'dumbbell',
    machines: 'machine',
    'smith machine': 'machine',
    smith: 'machine',
    'pull-up bar': 'pullup_bar',
    'pullup bar': 'pullup_bar',
    'body weight': 'bodyweight',
    bands: 'bands',
    barbell: 'barbell',
    cables: 'cable',
    kettlebells: 'kettlebell',
    'medicine ball': 'medicineball',
    'stability ball': 'stabilityball',
    sled: 'sled',
    'body only': 'bodyweight',
    dumbbell: 'dumbbell',
    machine: 'machine',
    cable: 'cable',
    kettlebell: 'kettlebell',
    medicineball: 'medicineball',
    stabilityball: 'stabilityball',
    bodyweight: 'bodyweight',
    pullup_bar: 'pullup_bar'
  };
  const out = new Set();
  (Array.isArray(list) ? list : []).forEach((entry) => {
    const raw = String(entry || '').trim().toLowerCase();
    if (!raw) return;
    const token = map[raw] || raw.replace(/\s+/g, '_');
    if ([
      'barbell', 'dumbbell', 'cable', 'machine', 'bands', 'bodyweight', 'pullup_bar',
      'kettlebell', 'medicineball', 'stabilityball', 'sled'
    ].includes(token)) out.add(token);
  });
  return [...out].sort();
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

function isDirectTricepsName(name) {
  const n = normalizeName(name);
  return (
    /(triceps|pushdown|pressdown|skull crusher|kickback|overhead triceps|triceps extension|rope extension|lying extension)/.test(n)
    || (/\bextension\b/.test(n) && /(triceps|rope|cable|dumbbell|ez-bar|barbell|overhead|lying)/.test(n))
  ) && !/(wrist|neck|leg extension|hip extension|back extension|shoulder extension)/.test(n);
}

function canonicalExerciseIdFor(ex) {
  const explicit = String(ex?.id || '').trim();
  if (explicit) return explicit;
  return normalizeName(ex?.name).replace(/\s+/g, '-');
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
    : /(hip thrust|glute bridge|pull through|kickback)/.test(lower) || (subMuscle === 'Glutes' && /(bridge|kickback)/.test(lower))
      ? 'primary'
      : /\babductor\b/.test(lower) || subMuscle === 'Glutes'
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
  return {
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
}

function shouldTrackPriorityDebug(user) {
  const priorities = new Set(Array.isArray(user?.priorityGroups) ? user.priorityGroups : []);
  return Number(user?.daysPerWeek || 0) <= 3 && (priorities.has('Calves') || priorities.has('Core'));
}

function ensurePriorityDebugTrace(user) {
  if (!shouldTrackPriorityDebug(user)) return null;
  user.debugTrace = user.debugTrace || {};
  if (!user.debugTrace.lowFrequencyPriorityTrace) {
    const priorities = new Set(Array.isArray(user?.priorityGroups) ? user.priorityGroups : []);
    user.debugTrace.lowFrequencyPriorityTrace = {
      calf: {
        priorityDetected: priorities.has('Calves'),
        reservedSlots: [],
        eligiblePools: [],
        initialSelections: [],
        trimmed: [],
        reinforced: [],
        finalExercises: [],
        removedAtStep: null
      },
      abs: {
        priorityDetected: priorities.has('Core'),
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
    progressionRule: progressionRuleForExercise(chosen, user),
    flags: ['avoidFilteredOk', 'injurySafeOk'],
    muscleTarget: slot.muscleTarget,
    slotId: slot.id,
    optional: slot.optional,
    ...extra
  };
  const rir = rirForExercise(chosen, user, extra.weekType);
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
      const wantsBiceps = Array.isArray(slot?.subPreferred) && slot.subPreferred.some((s) => /biceps/i.test(String(s || '')));
      const wantsTriceps = Array.isArray(slot?.subPreferred) && slot.subPreferred.some((s) => /triceps/i.test(String(s || '')));
      const bicepsMatch = isDirectBicepsName(nn);
      const tricepsMatch = isDirectTricepsName(nn);
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
    out.push({
      ...ex,
      name,
      primary: String(ex?.primary || '').trim() === 'Abs' ? 'Core' : ex?.primary,
      nameLower: name.toLowerCase(),
      equipmentNorm: normalizeEquipmentTags(ex?.equipment || []),
      requiredEquipment: inferRequiredEquipment(ex),
      isCalisthenicsLike: isCalisthenicsLikeExercise(ex),
      canonicalTruth: buildExerciseTruth({
        ...ex,
        name,
        primary: String(ex?.primary || '').trim() === 'Abs' ? 'Core' : ex?.primary,
        requiredEquipment: inferRequiredEquipment(ex)
      })
    });
  }
  return { exercises: out.sort((a, b) => a.name.localeCompare(b.name)) };
}

function resolveDiscipline(trainingFeel) {
  if (trainingFeel === 'Aesthetic bodybuilding') return 'bodybuilding';
  if (trainingFeel === 'Powerbuilding') return 'powerbuilding';
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
  const map = {
    su: 'Su', sun: 'Su', sunday: 'Su',
    mo: 'Mo', mon: 'Mo', monday: 'Mo',
    tu: 'Tu', tue: 'Tu', tuesday: 'Tu',
    we: 'We', wed: 'We', wednesday: 'We',
    th: 'Th', thu: 'Th', thursday: 'Th',
    fr: 'Fr', fri: 'Fr', friday: 'Fr',
    sa: 'Sa', sat: 'Sa', saturday: 'Sa'
  };
  return map[v] || null;
}

function normalizeAvoidTokens(movementsToAvoid) {
  const out = new Set(ALWAYS_AVOID_TOKENS);
  (Array.isArray(movementsToAvoid) ? movementsToAvoid : []).forEach((v) => {
    const key = String(v || '').trim().toLowerCase();
    (AVOID_MAP[key] || []).forEach((token) => out.add(String(token).toLowerCase()));
  });
  return [...out].sort();
}

function normalizePriorityGroups(raw) {
  const out = [];
  const aliases = {
    chest: 'Chest',
    back: 'Back',
    legs: 'Legs',
    glutes: 'Glutes',
    shoulders: 'Shoulders',
    shoulder: 'Shoulders',
    arms: 'Arms',
    abs: 'Core',
    core: 'Core',
    calves: 'Calves',
    calf: 'Calves',
    forearms: 'Forearms',
    neck: 'Neck'
  };
  (Array.isArray(raw) ? raw : []).forEach((entry) => {
    const key = String(entry || '').trim().toLowerCase();
    const mapped = aliases[key] || null;
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
  const upperPriorityCount = priorities.filter((group) => ['Chest', 'Back', 'Shoulders', 'Arms'].includes(group)).length;
  const lowerPriorityCount = priorities.filter((group) => ['Legs', 'Glutes', 'Calves'].includes(group)).length;
  const corePriority = priorities.includes('Core');
  const allowed = Array.isArray(user?.allowedEquipment) ? user.allowedEquipment : [];
  const nonBodyweightTools = allowed.filter((eq) => eq !== 'bodyweight');
  const minimalEquipment = nonBodyweightTools.length <= 1;
  const bodyweightDominant = allowed.includes('bodyweight') && allowed.length <= 2;
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
  const forearmPriorityFlag = priorities.includes('Arms') && (complexity !== 'low' || Number(user?.daysPerWeek || 0) >= 4);
  const neckEligibleFlag = complexity !== 'low'
    && Number(user?.daysPerWeek || 0) >= 4
    && maxInjury < 7
    && Number(user?.injuryMap?.spine || 0) < 5
    && Number(user?.injuryMap?.shoulder || 0) < 7
    && !user?.injuryNoteFlags?.cervicalContraindication;
  const aestheticTrunkPriority = priorities.includes('Core') || (user?.focus === 'Aesthetic' && ['deficit', 'recomp'].includes(String(user?.phase || '')));
  const coreDiversityNeed = priorities.includes('Core')
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
  return {
    priorityRanking,
    priorityRankMap,
    upperPriorityCount,
    lowerPriorityCount,
    corePriority,
    priorityBias: upperPriorityCount > lowerPriorityCount ? 'upper' : lowerPriorityCount > upperPriorityCount ? 'lower' : 'balanced',
    minimalEquipment,
    bodyweightDominant,
    allowWeeklyRepeat: minimalEquipment || bodyweightDominant || Number(user?.daysPerWeek || 0) >= 5,
    sessionBandwidth,
    recovery,
    complexity,
    preferredEnvironment,
    injuryCount,
    constraintSeverity,
    specializationLevel,
    movementTolerance,
    armSpecializationSubtype,
    forearmPriorityFlag,
    neckEligibleFlag,
    coreDiversityNeed,
    aestheticTrunkPriority,
    priorityVolumeAggressiveness,
    smallAccessoryRecovery,
    minimalEquipmentAccessoryMode
  };
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

  const preferredDays = src.preferredDays.map(toWeekday).filter(Boolean);
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
    _selectionCursor: 0,
    debugTrace: null
  };
  normalized.profile = deriveUserProfile(normalized);
  if (shouldTrackPriorityDebug(normalized)) normalized.debugTrace = {};
  return normalized;
}

function computeWeeklyTargets(user) {
  const cfg = EXP_CFG[user.experience];
  const profile = user?.profile || deriveUserProfile(user);
  const stressMult = STRESS_MULT[user.stress] || 1;
  const sleepMult = user.sleepHours < 5 ? 0.8 : user.sleepHours < 6 ? 0.9 : 1.0;
  const prioritySet = new Set(profile.priorityRanking || []);
  const sessionMult = profile.sessionBandwidth === 'tight' ? 0.82 : profile.sessionBandwidth === 'wide' ? 1.08 : 0.96;
  const recoveryMult = profile.recovery === 'good' ? 1 : 0.92;
  const frequencyMult = Number(user.daysPerWeek || 0) >= 5 ? 1.05 : Number(user.daysPerWeek || 0) <= 2 ? 0.92 : 1;
  const priorityAddByRank = { 1: 8, 2: 6, 3: 4 };
  const targets = {};
  const frequencyTargets = {};
  for (const muscle of MUSCLE_KEYS) {
    if (muscle === 'Forearms') {
      let n = 0;
      if (profile.forearmPriorityFlag) {
        n = profile.smallAccessoryRecovery === 'high' ? 8 : profile.smallAccessoryRecovery === 'medium' ? 6 : 4;
        if (profile.priorityVolumeAggressiveness === 'high') n += 2;
      } else if (profile.armSpecializationSubtype !== 'none' && profile.minimalEquipmentAccessoryMode) {
        n = 2;
      }
      targets[muscle] = n;
      frequencyTargets[muscle] = n >= 8 ? 3 : n >= 4 ? 2 : n > 0 ? 1 : 0;
      continue;
    }
    if (muscle === 'Neck') {
      let n = 0;
      if (profile.neckEligibleFlag) {
        n = profile.complexity === 'high' ? 6 : 4;
      }
      targets[muscle] = n;
      frequencyTargets[muscle] = n >= 6 ? 3 : n >= 4 ? 2 : n > 0 ? 1 : 0;
      continue;
    }
    if (muscle === 'Calves') {
      let n = prioritySet.has('Calves') ? (profile.sessionBandwidth === 'tight' ? 6 : 8) : 2;
      if (prioritySet.has('Calves') && Number(user?.daysPerWeek || 0) <= 3) n += 2;
      targets[muscle] = n;
      frequencyTargets[muscle] = n >= 8 ? Math.min(3, Number(user?.daysPerWeek || 0)) : n >= 4 ? 2 : 1;
      continue;
    }
    const base = LARGE_MUSCLES.has(muscle) ? cfg.large : cfg.small;
    let n = Math.round(base * stressMult * sleepMult * sessionMult * recoveryMult * frequencyMult);
    if (user.activityLevel === 'Very active' && (muscle === 'Legs' || muscle === 'Glutes')) n = Math.round(n * 0.9);
    if (prioritySet.has(muscle)) {
      const rank = Number(profile.priorityRankMap?.[muscle] || 1);
      n += cfg.add + Number(PRIORITY_SET_BONUS[muscle] || 0) + Number(priorityAddByRank[rank] || 0);
    } else {
      n = Math.round(n * cfg.maintenance);
      if (profile.priorityBias === 'upper' && ['Legs', 'Glutes'].includes(muscle)) n = Math.round(n * 0.8);
      if (profile.priorityBias === 'lower' && ['Chest', 'Back', 'Shoulders', 'Arms'].includes(muscle)) n = Math.round(n * 0.82);
    }
    const minClamp = muscle === 'Core' ? 2 : LARGE_MUSCLES.has(muscle) ? 6 : 4;
    const maxClamp = LARGE_MUSCLES.has(muscle) ? cfg.maxLarge : cfg.maxSmall;
    if (user.phase === 'deficit') n = Math.max(minClamp, n - 1);
    if (user.phase === 'recomp') n = Math.max(minClamp, Math.round(n * 0.97));
    if (muscle === 'Core' && profile.coreDiversityNeed >= 3) n += 2;
    targets[muscle] = Math.max(minClamp, Math.min(maxClamp, n));
    const directSetTarget = targets[muscle];
    frequencyTargets[muscle] = directSetTarget >= 18 ? 3 : directSetTarget >= 10 ? 2 : 1;
  }
  return { targets, frequencyTargets, stressMultiplier: stressMult };
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
  const d = user.daysPerWeek;
  const profile = user?.profile || deriveUserProfile(user);
  const priorities = new Set(user?.priorityGroups || []);
  const lowFreqSmallMuscleBias = d <= 3 && priorities.has('Core') && priorities.has('Calves');
  let split = [];
  if (forceUpperLower && d >= 5) {
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

function buildDayBlueprint(dayType, user, weekType, opts = {}) {
  const slots = [];
  const constrainedRebuild = Boolean(opts?.constrainedRebuild);
  const prioritySet = new Set(user.priorityGroups || []);
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
    slots.push(makeSlot('fba_shoulders', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral'], optional: !(isLowFrequencyPriorityPlan && prioritySet.has('Shoulders')) || hasUpperLimbConstraint }));
    slots.push(makeSlot('fba_arms', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], optional: !(isLowFrequencyPriorityPlan && prioritySet.has('Arms')) || hasUpperLimbConstraint }));
    slots.push(makeSlot('fba_core', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], optional: !(isLowFrequencyPriorityPlan && prioritySet.has('Core')) || !hasDedicatedCoreAccess }));
  } else if (dayType === 'FullBodyB') {
    slots.push(makeSlot('fbb_vpull', 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'] }));
    slots.push(makeSlot('fbb_hinge', 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Hamstrings-Hinge', 'Glutes'] }));
    slots.push(makeSlot('fbb_press', 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('fbb_leg_iso', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs', 'Glutes'], optional: true }));
    slots.push(makeSlot('fbb_calf', 'Isolation', 'Isolation', 'Calves', { primaryAllowed: ['Legs'], subPreferred: ['Calves'], optional: !(isLowFrequencyPriorityPlan && prioritySet.has('Calves')) }));
    slots.push(makeSlot('fbb_core', 'CoreStability', 'Isolation', 'Core', { primaryAllowed: ['Core'], optional: !(isLowFrequencyPriorityPlan && prioritySet.has('Core')) || !hasDedicatedCoreAccess }));
  } else if (dayType === 'UpperFocus') {
    slots.push(makeSlot('uf_hp', 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('uf_hpull', 'HorizontalPull', 'Compound', 'Back', { primaryAllowed: ['Back'] }));
    slots.push(makeSlot('uf_vpull', 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], optional: true }));
    slots.push(makeSlot('uf_ch_iso', 'Isolation', 'Isolation', 'Chest', { primaryAllowed: ['Chest'], optional: true }));
    slots.push(makeSlot('uf_sh_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral'], optional: (!(prioritySet.has('Shoulders') || prioritySet.has('Chest') || isLowFrequencyPriorityPlan)) || hasUpperLimbConstraint }));
    slots.push(makeSlot('uf_bi_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: (!(prioritySet.has('Arms') && isLowFrequencyPriorityPlan)) || hasUpperLimbConstraint }));
    slots.push(makeSlot('uf_tri_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'], optional: (!(prioritySet.has('Arms') && isLowFrequencyPriorityPlan)) || hasUpperLimbConstraint }));
    slots.push(makeSlot('uf_core', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], optional: (!(prioritySet.has('Core') && isLowFrequencyPriorityPlan)) || !hasDedicatedCoreAccess }));
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
    if (dayType === 'Push' || dayType === 'Upper') slots.unshift(makeSlot(`pb_bench_${dayType.toLowerCase()}`, 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    if (dayType === 'Legs' || dayType === 'Lower') slots.unshift(makeSlot(`pb_sq_${dayType.toLowerCase()}`, 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'] }));
    if ((dayType === 'Legs' || dayType === 'Lower') && !slots.some((s) => String(s.id || '').startsWith('pb_hinge_'))) {
      slots.unshift(makeSlot(`pb_hinge_${dayType.toLowerCase()}`, 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'] }));
    }
  }
  if (
    (user.priorityGroups || []).includes('Glutes')
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
    if (['Arms', 'Shoulders', 'Core', 'Calves'].includes(String(muscleTarget || '')) && prioritySet.has(muscleTarget)) return false;
    return baseOptional;
  };
  if (prioritySet.has('Chest') && (dayType === 'Push' || dayType === 'Upper')) {
    addPrioritySlot(`${dayType.toLowerCase()}_chest_priority`, 'Isolation', 'Isolation', 'Chest', { primaryAllowed: ['Chest'], optional: true });
  }
  if (prioritySet.has('Chest') && isLowFrequencyPriorityPlan && ['FullBodyA', 'FullBodyB', 'UpperFocus'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_chest_priority`, 'Isolation', 'Isolation', 'Chest', {
      primaryAllowed: ['Chest'],
      optional: hasUpperLimbConstraint || dayType === 'FullBodyB'
    });
  }
  if (prioritySet.has('Shoulders') && (dayType === 'Push' || dayType === 'Pull' || dayType === 'Upper' || dayType === 'DeltsArms')) {
    const shoulderPref = dayType === 'Pull' ? ['Rear'] : ['Lateral', 'Rear'];
    addPrioritySlot(`${dayType.toLowerCase()}_shoulder_priority`, 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: shoulderPref, optional: priorityOptional('Shoulders', true) });
  }
  if (prioritySet.has('Shoulders') && isLowFrequencyPriorityPlan && ['FullBodyA', 'FullBodyB', 'UpperFocus'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_shoulder_priority`, 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral', 'Rear'], optional: hasUpperLimbConstraint });
  }
  if (prioritySet.has('Arms') && (dayType === 'Push' || dayType === 'Pull' || dayType === 'Upper')) {
    if (dayType === 'Push') {
      addPrioritySlot(`${dayType.toLowerCase()}_tri_priority`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'], optional: priorityOptional('Arms', true) });
    } else if (dayType === 'Pull') {
      addPrioritySlot(`${dayType.toLowerCase()}_bi_priority`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: priorityOptional('Arms', true) });
    } else {
      addPrioritySlot(`${dayType.toLowerCase()}_arms_priority_bi`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: priorityOptional('Arms', true) });
      addPrioritySlot(`${dayType.toLowerCase()}_arms_priority_tri`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'], optional: priorityOptional('Arms', true) });
    }
  }
  if (prioritySet.has('Arms') && isLowFrequencyPriorityPlan && ['FullBodyA', 'FullBodyB', 'UpperFocus'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_arms_priority`, 'Isolation', 'Isolation', 'Arms', {
      primaryAllowed: ['Arms'],
      subPreferred: dayType === 'FullBodyB' ? ['Biceps-Long', 'Biceps-Short'] : ['Triceps-Long', 'Biceps-Long', 'Triceps-Lateral'],
      optional: hasUpperLimbConstraint
    });
  }
  if (prioritySet.has('Back') && (dayType === 'Pull' || dayType === 'Upper')) {
    addPrioritySlot(`${dayType.toLowerCase()}_back_priority`, dayType === 'Pull' ? 'HorizontalPull' : 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], optional: true });
  }
  if (prioritySet.has('Core') && !slots.some((s) => s.id.includes('core_priority'))) {
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
  if (prioritySet.has('Legs') && ['Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_legs_priority`, 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads', 'Hamstrings-Curl'], optional: true });
  }
  if (prioritySet.has('Calves') && ['Legs', 'Lower', 'LowerFocus', 'FullBodyA', 'FullBodyB', 'UpperFocus'].includes(dayType)) {
    addPrioritySlot(`${dayType.toLowerCase()}_calves_priority`, 'Isolation', 'Isolation', 'Calves', {
      primaryAllowed: ['Legs'],
      subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'],
      optional: Number(user?.daysPerWeek || 0) > 3 ? !['Legs', 'Lower', 'LowerFocus'].includes(dayType) : false
    });
  }
  if (user?.profile?.forearmPriorityFlag && ['Pull', 'Upper', 'UpperFocus', 'DeltsArms'].includes(dayType)) {
    const forearmSub = dayType === 'Pull' ? ['Brachioradialis', 'Extensors', 'Grip'] : ['Flexors', 'Extensors', 'Grip'];
    addPrioritySlot(`${dayType.toLowerCase()}_forearm_priority`, 'Isolation', 'Isolation', 'Forearms', { primaryAllowed: ['Forearms', 'Arms'], subPreferred: forearmSub, optional: true });
  }
  if (user?.profile?.neckEligibleFlag && ['Upper', 'UpperFocus', 'Pull', 'DeltsArms'].includes(dayType)) {
    const neckSub = dayType === 'Pull' ? ['Extensors', 'LateralFlexors'] : dayType === 'DeltsArms' ? ['LateralFlexors'] : ['Flexors', 'Extensors'];
    addPrioritySlot(`${dayType.toLowerCase()}_neck_priority`, 'Isolation', 'Isolation', 'Neck', {
      primaryAllowed: ['Neck'],
      subPreferred: neckSub,
      optional: !(user?.profile?.complexity === 'high' && user?.profile?.sessionBandwidth !== 'tight')
    });
  }
  if (user?.profile?.priorityBias === 'upper' && !prioritySet.has('Legs') && !prioritySet.has('Glutes')) {
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
      if (prioritySet.has(slot.muscleTarget) && !requiredPriorityMuscles.has(slot.muscleTarget)) {
        const blockedByConstraint = (hasUpperLimbConstraint && ['Arms', 'Shoulders'].includes(String(slot.muscleTarget || '')))
          || (!hasDedicatedCoreAccess && String(slot.muscleTarget || '') === 'Core');
        if (!blockedByConstraint) {
          required = true;
          requiredPriorityMuscles.add(slot.muscleTarget);
        }
      }
      if (isLowFrequencyPriorityPlan && prioritySet.has('Calves') && slot.muscleTarget === 'Calves') required = true;
      if (isLowFrequencyPriorityPlan && prioritySet.has('Core') && slot.muscleTarget === 'Core' && hasDedicatedCoreAccess) required = true;
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
  if (user.trainingStyle === 'Mostly machines/cables') {
    const hasMC = requiredEquipment.includes('machine') || requiredEquipment.includes('cable') || ex.equipmentNorm.includes('machine') || ex.equipmentNorm.includes('cable');
    const onlyBasic = requiredEquipment.length && requiredEquipment.every((x) => ['barbell', 'bodyweight', 'dumbbell'].includes(x));
    if (hasMC) score += 14;
    if (onlyBasic) score -= 10;
  } else if (user.trainingStyle === 'Mostly free weights') {
    const hasFW = requiredEquipment.includes('barbell') || requiredEquipment.includes('dumbbell') || ex.equipmentNorm.includes('barbell') || ex.equipmentNorm.includes('dumbbell');
    if (hasFW) score += 14;
  }
  if (slot.primaryAllowed && slot.primaryAllowed.includes(ex.primary)) score += 30;
  if (slot.subPreferred && slot.subPreferred.includes(ex.sub)) score += 20;
  if (slot.subFallback && slot.subFallback.includes(ex.sub)) score += 10;
  if (slot.muscleTarget && Array.isArray(ex.secondaryMuscles) && ex.secondaryMuscles.includes(slot.muscleTarget)) score += 8;
  if (isBodybuildingStapleForSlot(ex, slot, user, dayType)) score += 18;
  else if (user.discipline === 'bodybuilding' || user.discipline === 'powerbuilding') score -= 28;
  if (user?.profile?.minimalEquipment && ex.isCalisthenicsLike) score += 10;
  if (user?.profile?.priorityBias === 'upper' && ['Chest', 'Back', 'Shoulders', 'Arms'].includes(slot.muscleTarget)) score += 4;
  if (user?.profile?.priorityBias === 'lower' && ['Legs', 'Glutes'].includes(slot.muscleTarget)) score += 4;
  if (slot?.muscleTarget && user?.profile?.priorityRankMap?.[slot.muscleTarget]) {
    const rank = Number(user.profile.priorityRankMap[slot.muscleTarget] || 0);
    score += rank === 1 ? 10 : rank === 2 ? 7 : 4;
  }
  score += (10 - Math.abs(Number(ex.difficulty || 0) - EXP_CFG[user.experience].diffTarget) * 3);
  const basePenalty = (Number(ex.spine) + Number(ex.knee) + Number(ex.hip) + Number(ex.shoulder) + Number(ex.elbow)) * 2;
  const jointEval = evaluateJoint(ex, user);
  const quality = hypertrophyQualityModifiers(ex, slot, user, dayType);
  return score + quality.bonus - basePenalty - jointEval.penalty - quality.penalty;
}

function isHeavyDeadliftPatternName(name) {
  const n = normalizeName(name);
  if (!n) return false;
  if (!/(deadlift|romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(n)) return false;
  return !/(hip thrust|glute bridge)/.test(n);
}

function filterEligible(slot, exercises, user, weekPicked, dayState = null, dayType = '', weekState = null) {
  const maxDiff = EXP_CFG[user.experience].maxDifficulty;
  return exercises.filter((ex) => {
    const corePattern = ['CoreFlexion', 'CoreStability', 'CoreRotation'].includes(String(ex?.pattern || ''));
    const lowerPriorityRepeat = ['Legs', 'Glutes'].includes(String(slot?.muscleTarget || ''))
      && (user?.priorityGroups || []).some((group) => group === 'Legs' || group === 'Glutes')
      && ['Squat', 'Hinge', 'Lunge', 'Isolation'].includes(String(ex?.pattern || ''));
    const lowFreqSmallPriorityRepeat = Number(user?.daysPerWeek || 0) <= 3
      && (
        ((user?.priorityGroups || []).includes('Calves') && String(slot?.muscleTarget || '') === 'Calves')
        || ((user?.priorityGroups || []).includes('Core') && String(slot?.muscleTarget || '') === 'Core')
      );
    if (weekPicked.has(ex.name) && !user?.profile?.allowWeeklyRepeat && !corePattern && !lowerPriorityRepeat && !lowFreqSmallPriorityRepeat) return false;
    if (isHardBannedExercise(ex)) return false;
    if ((user.discipline === 'bodybuilding' || user.discipline === 'powerbuilding') && ex.isCalisthenicsLike && !user?.profile?.bodyweightDominant) return false;
    if (!isBodybuildingStapleForSlot(ex, slot, user, dayType)) return false;
    if (!isExerciseCompatibleWithEquipment(ex, user)) return false;
    if (matchesAvoid(ex.nameLower, user.avoidNameContainsTokens)) return false;
    if (dayType === 'Pull' && /(lateral raise|side lateral)/.test(ex.nameLower)) return false;
    if (violatesDayTypeQuality(ex, dayType)) return false;
    const joint = evaluateJoint(ex, user);
    if (joint.reject) return false;
    if (ex.pattern !== slot.pattern) return false;
    if (slot.styleRequired && ex.style !== slot.styleRequired) return false;
    if (Array.isArray(slot.primaryAllowed) && slot.primaryAllowed.length) {
      const primary = String(ex?.primary || '');
      const secondary = Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles : [];
      const primaryMatch = slot.primaryAllowed.includes(primary);
      const secondaryMatch = secondary.some((muscle) => slot.primaryAllowed.includes(String(muscle || '')));
      if (!primaryMatch && !secondaryMatch) return false;
    }
    if (!slot.styleRequired && ['Mobility', 'Cardio'].includes(ex.style) && !['Mobility', 'Cardio'].includes(slot.pattern)) return false;
    if (Number(ex.difficulty) > maxDiff) return false;
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
          if (count >= 2) return false;
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
}

function fillSlots(dayBlueprint, exercises, user, weekPicked, weekState = null) {
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
  const dayState = { families: new Set(), names: new Set(), counts: { chest_fly: 0, rear_delt: 0, bench_press: 0 }, dayKey };
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
      return structuredNoEligible(slot, user);
    }
    eligible = eligible
      .map((ex) => ({ ex, score: scoreExercise(ex, effectiveSlot, user, dayBlueprint?.dayType || '') }))
      .sort((a, b) => (b.score - a.score) || a.ex.name.localeCompare(b.ex.name));
    const chosen = pickCandidate(eligible, slot) || eligible[0].ex;
    weekPicked.add(chosen.name);
    const displayName = normalizeBodybuildingDisplayName(chosen.name, user);
    dayState.names.add(chosen.name);
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
  const isMainPB = user.discipline === 'powerbuilding' && /^pb_/.test(String(slotId || ''));
  if (weekType === 'deload') return { reps: isCompound ? '6-10' : '10-15', restSec: isCompound ? 150 : 75, rir: '3-4' };
  if (isMainPB) {
    if (slotId.includes('bench')) return { reps: weekType === 'intensification' ? '3-5' : '6-10', restSec: weekType === 'intensification' ? 180 : 150 };
    if (slotId.includes('sq')) return { reps: weekType === 'intensification' ? '3-5' : '5-8', restSec: 180 };
  }
  if (isCorePattern) return { reps: weekType === 'intensification' ? '8-15' : '8-20', restSec: 60 };
  if (isCompound) return { reps: weekType === 'intensification' ? '6-10' : '6-12', restSec: weekType === 'intensification' ? 150 : 120 };
  return { reps: weekType === 'intensification' ? '10-15' : '10-20', restSec: 75 };
}

function rirForExercise(ex, user, weekType) {
  if (user.outputStyle === 'Simple sets x reps') return null;
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
  if (user.discipline === 'powerbuilding' && ex.style === 'Compound') {
    return 'Rep-first progression: hit top reps at target RIR, then increase load 2.5-5% next exposure; reset to bottom reps.';
  }
  return 'If all sets hit top reps with target RIR, add load next session; if missed twice, reduce load 5% and rebuild reps.';
}

function allocateSetsReps(days, weekType, targets, user) {
  const dayIdxByMuscle = {};
  days.forEach((day, idx) => {
    day.exercises.forEach((ex) => {
      const m = ex.muscleTarget || ex.primary || 'Core';
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
      const m = ex.muscleTarget || ex.primary || 'Core';
      byMuscle[m] = byMuscle[m] || [];
      byMuscle[m].push(ex);
    });
    const finalExercises = [];
    Object.entries(byMuscle).forEach(([muscle, exList]) => {
      const key = `${idx}:${muscle}`;
      let budget = Math.max(exList.length * 2, setsBudgetByDayMuscle[key] || (exList.length * 2));
      if (user?.profile?.sessionBandwidth === 'tight') budget = Math.min(budget, exList.length * 3);
      const ordered = exList.slice().sort((a, b) => (a.style === 'Compound' ? -1 : 1) - (b.style === 'Compound' ? -1 : 1));
      ordered.forEach((ex, exIdx) => {
        const remaining = ordered.length - exIdx;
        const isPriorityMuscle = Boolean(user?.profile?.priorityRankMap?.[muscle]);
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

  if (user.discipline === 'powerbuilding' && user.focus === 'Strength') {
    outDays.forEach((day) => {
      day.exercises.forEach((ex) => {
        if (ex.style === 'Isolation') ex.sets = Math.max(2, Math.floor(ex.sets * 0.9));
      });
    });
  }
  outDays.forEach((day) => {
    day.exercises.forEach((ex) => {
      ex.sets = Math.max(1, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(ex.sets) || 1));
    });
  });
  return outDays;
}

function applySessionCapTrimming(day, sessionCap, priorityGroups, profile = null, user = null) {
  const list = day.exercises.slice();
  const isPriority = (ex) => {
    const primary = String(ex?.primary || ex?.muscleTarget || '');
    const sub = String(ex?.sub || '');
    if (priorityGroups.includes(ex?.muscleTarget) || priorityGroups.includes(primary)) return true;
    if (priorityGroups.includes('Calves') && (Boolean(ex?.directCalf) || /calves/i.test(sub))) return true;
    if (priorityGroups.includes('Core') && Boolean(ex?.directAb)) return true;
    if (priorityGroups.includes('Arms') && ['biceps', 'triceps'].includes(String(ex?.directArmType || ''))) return true;
    if (priorityGroups.includes('Shoulders') && (Boolean(ex?.shoulderPressPattern) || Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern))) return true;
    if (primary === 'Forearms' && profile?.forearmPriorityFlag) return true;
    if (primary === 'Neck' && profile?.neckEligibleFlag) return true;
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

function organizeDayExerciseOrder(dayType, exercises) {
  const src = Array.isArray(exercises) ? exercises.slice() : [];
  if (src.length <= 1) return src;
  const remaining = src.slice();
  const ordered = [];
  const type = String(dayType || '');
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
    const n = normalizeName(ex?.name);
    const m = String(ex?.muscleTarget || ex?.primary || '');
    return m === 'Neck' || /(neck flexion|neck extension|neck lateral|neck resistance|head harness)/.test(n);
  };
  const isCompound = (ex) => String(ex?.style || '') === 'Compound';
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
  takeFirst(isMainCandidate);
  moveAll((ex) => isCompound(ex) && !isArms(ex) && !isForearms(ex) && !isNeck(ex) && !isCalves(ex) && !isCore(ex));
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
  const eligible = filterEligible(slot, allExercises, user, usedNames, null, dayType, null)
    .filter((candidate) => String(candidate?.name || '') !== String(exercise?.name || ''));
  if (!eligible.length) return null;
  const scored = eligible
    .map((ex) => ({ ex, score: scoreExercise(ex, slot, user, dayType) }))
    .sort((a, b) => (b.score - a.score) || a.ex.name.localeCompare(b.ex.name));
  const chosen = scored[0]?.ex || null;
  if (!chosen) return null;
  return {
    ...chosen,
    name: normalizeBodybuildingDisplayName(chosen.name, user),
    slotId: slot.id,
    optional: false,
    muscleTarget: slot.muscleTarget
  };
}

function repairAndValidatePlan(weeks, user, exercises) {
  const isInvalidForFinal = (candidate, dayType) => isHardBannedExercise(candidate)
    || ((user.discipline === 'bodybuilding' || user.discipline === 'powerbuilding') && candidate.isCalisthenicsLike && !user?.profile?.bodyweightDominant)
    || !isExerciseCompatibleWithEquipment(candidate, user)
    || evaluateJoint(candidate, user).reject
    || violatesDayTypeQuality(candidate, dayType || '');
  const sanitized = [];
  let filteredCount = 0;
  for (const week of Array.isArray(weeks) ? weeks : []) {
    const nextDays = [];
    for (const day of Array.isArray(week?.days) ? week.days : []) {
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
        usedNames.add(candidate.name);
        nextExercises.push({
          ...candidate,
          sets: Math.max(1, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(candidate.sets) || 1))
        });
      }
      const trimmed = applySessionCapTrimming({ ...day, exercises: nextExercises }, user.sessionCap, user.priorityGroups || [], user.profile, user);
      const finalExercises = [];
      const finalNames = new Set();
      for (const ex of Array.isArray(trimmed.exercises) ? trimmed.exercises : []) {
        let candidate = ex;
        if (isInvalidForFinal(candidate, trimmed.dayType || '')) {
          filteredCount += 1;
          candidate = findReplacementExerciseForPlan(candidate, user, exercises, trimmed.dayType || '', finalNames);
        }
        if (!candidate || isInvalidForFinal(candidate, trimmed.dayType || '') || finalNames.has(candidate.name)) continue;
        finalNames.add(candidate.name);
        finalExercises.push(candidate);
      }
      if (!Array.isArray(finalExercises) || !finalExercises.length) {
        return {
          error: 'NO_ELIGIBLE_EXERCISE',
          slotId: `week_${week?.weekIndex || '?'}_day_${day?.dayType || '?'}`,
          reason: 'No safe exercises remained after repair.'
        };
      }
      nextDays.push({
        ...trimmed,
        exercises: organizeDayExerciseOrder(trimmed.dayType, finalExercises)
      });
    }
    if (nextDays.length !== Number(user?.daysPerWeek || 0)) {
      return {
        error: 'PLAN_VALIDATION_FAILED',
        field: 'daysPerWeek',
        reason: `Expected ${user?.daysPerWeek} training days, got ${nextDays.length}.`
      };
    }
    sanitized.push({ ...week, days: nextDays });
  }
  return { weeks: sanitized, filteredCount };
}

function weekPattern(blockLength) {
  if (blockLength === 4) return ['base', 'volume', 'intensification', 'deload'];
  return ['base', 'volume', 'volume', 'deload', 'intensification', 'intensification', 'intensification', 'deload'];
}

function buildWeeks(blockLength, schedule, user, exercises, targets, opts = {}) {
  const types = weekPattern(blockLength);
  const weeks = [];
  for (let i = 0; i < blockLength; i += 1) {
    const weekType = types[i];
    const targetsForWeek = scaleTargets(targets, weekType, blockLength, i + 1);
    const blueprint = buildWeekBlueprint(user.discipline, schedule, user, weekType, opts);
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
      const filled = fillSlots(dayBp, exercises, user, weekPicked, weekState);
      if (filled.error) return filled;
      filledDays.push({ dayType: dayBp.dayType, day: dayBp.day, exercises: filled.exercises });
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
    prescribed = prescribed.map((d) => applySessionCapTrimming(d, user.sessionCap, user.priorityGroups || [], user.profile, user));
    prescribed = prescribed.map((d) => ({
      ...d,
      exercises: (d.exercises || []).map((ex) => ({
        ...ex,
        sets: Math.max(1, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(ex.sets) || 1))
      }))
    }));
    prescribed = prescribed.map((d) => ({
      ...d,
      exercises: organizeDayExerciseOrder(d.dayType, d.exercises || [])
    }));
    weeks.push({ weekIndex: i + 1, weekType, days: prescribed });
  }
  return { weeks };
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
      'Add reps within the prescribed range first.',
      'Add load once all sets reach the top of the rep range with the target effort.',
      'Add sets only when recovery is solid and a priority muscle still under-responds.'
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

function buildAdaptiveRecalibration(context = {}) {
  const planMeta = context?.planMeta || {};
  const checkIn = context?.checkIn || {};
  const actions = [];
  const issues = [];
  const phase = String(context?.phase || planMeta?.phase || 'recomp');
  const bodyweightRate = Number(checkIn.bodyweightWeeklyChangePct || 0);
  const fatigueScore = Number(checkIn.fatigueScore || 0);
  const adherence = Number(checkIn.adherencePct || 100);
  const sessionCompletion = Number(checkIn.sessionCompletionPct || adherence);
  const plateauWeeks = Number(checkIn.plateauWeeks || 0);
  const priorityResponse = String(checkIn.priorityMuscleResponse || 'neutral');
  const jointIrritation = String(checkIn.jointIrritationTrend || 'stable');
  const performanceTrend = String(checkIn.performanceTrend || 'stable');
  const priorityPerformanceTrend = String(checkIn.priorityPerformanceTrend || performanceTrend);
  const measurementTrend = String(checkIn.bodyMeasurementTrend || 'unknown');
  const photoTrend = String(checkIn.photosTrend || 'unknown');

  if (phase === 'surplus' && bodyweightRate < 0.2) {
    issues.push('Bodyweight is gaining too slowly for a productive bulk.');
    actions.push('Increase daily calories by 100-150 and keep protein in target range.');
  } else if (phase === 'surplus' && bodyweightRate > 0.7) {
    issues.push('Bodyweight is gaining faster than the recommended lean-gain pace.');
    actions.push('Reduce daily calories by 100-150 and keep training performance stable.');
  }
  if (phase === 'deficit' && bodyweightRate > -0.3) {
    issues.push('Bodyweight loss is too slow for the current cut target.');
    actions.push('Reduce daily calories by 100-150 or tighten adherence before changing training volume.');
  } else if (phase === 'deficit' && bodyweightRate < -1.0) {
    issues.push('Bodyweight is dropping fast enough to risk recovery and lean-mass retention.');
    actions.push('Add 100-150 daily calories and avoid increasing training volume.');
  }
  if (fatigueScore >= 8) {
    issues.push('Fatigue is too high to keep accumulating quality hypertrophy work.');
    actions.push('Cut 20-30% of non-priority isolation volume and consider a deload if performance is also down.');
  } else if (fatigueScore >= 6) {
    actions.push('Hold volume steady and avoid adding sets until fatigue settles.');
  }
  if (performanceTrend === 'down' && fatigueScore >= 6) {
    issues.push('Performance trend is dropping while fatigue is elevated.');
    actions.push('Use a deload or remove 2-4 weekly sets from the hardest-to-recover maintenance work before changing priority-muscle staples.');
  } else if (performanceTrend === 'down' && fatigueScore <= 5) {
    actions.push('Keep fatigue controlled, tighten execution quality, and assess whether the main movement load progression is too aggressive.');
  }
  if (jointIrritation === 'rising') {
    issues.push('Joint irritation is rising.');
    actions.push('Replace the most aggravating exercise with a safer variation and reduce local volume by 2-4 sets for that area.');
  }
  if (plateauWeeks >= 4 && priorityResponse !== 'improving') {
    issues.push('A meaningful plateau has developed on priority work.');
    actions.push('Swap 1 low-response movement for a better-tolerated staple and add 2-4 weekly sets to the lagging priority muscle if recovery allows.');
  } else if (plateauWeeks >= 2 && fatigueScore <= 5) {
    actions.push('Push progression through reps or load on the main priority movements before changing the split.');
  }
  if (priorityResponse === 'poor' && fatigueScore <= 6) {
    actions.push('Shift 2-4 weekly sets from maintenance muscles toward the lagging priority muscle and move one priority exercise earlier in the session.');
  }
  if (priorityPerformanceTrend === 'down' && fatigueScore <= 6) {
    actions.push('Keep the split structure, but replace the weakest-performing priority exercise with a more stable staple before adding more volume.');
  }
  if (measurementTrend === 'stalled' && photoTrend === 'stalled' && plateauWeeks >= 4 && adherence >= 85) {
    issues.push('Visual and measurement progress appear stalled despite acceptable adherence.');
    actions.push('Escalate specialization only for the lagging priority muscle by 2-4 weekly sets if recovery and joint status remain acceptable.');
  }
  if (sessionCompletion < 85 && adherence >= 85) {
    issues.push('The plan may be too dense to complete consistently.');
    actions.push('Remove one lower-value accessory per session and keep reserved priority work intact.');
  }
  if (adherence < 80) {
    issues.push('Adherence is too low to justify adding more complexity or volume.');
    actions.push('Simplify the plan, reduce novelty, and keep only the highest-value priority work until adherence improves.');
  }

  return {
    status: issues.length ? 'adjust' : 'hold',
    issues,
    actions,
    nextReviewDays: fatigueScore >= 8 || jointIrritation === 'rising' ? 14 : 21
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
    state.names.add(String(ex?.name || ''));
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
  const priorities = new Set(user?.priorityGroups || []);
  const needCalves = priorities.has('Calves');
  const needCore = priorities.has('Core');
  if (!needCalves && !needCore) return weeks;
  const targetCalfDays = Math.min(2, Number(user?.daysPerWeek || 0));
  const targetCoreDays = needCore ? Math.min(2, Number(user?.daysPerWeek || 0)) : 0;
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
  if (!Array.isArray(weeks) || !weeks.length) return weeks;
  if (!(user?.priorityGroups || []).includes('Shoulders')) return weeks;
  if (Number(user?.daysPerWeek || 0) < 4) return weeks;
  if (Number(user?.injuryMap?.shoulder || 0) >= 6) return weeks;
  const isDirectShoulder = (ex) => {
    const name = normalizeName(ex?.name);
    const primary = String(ex?.primary || ex?.muscleTarget || '');
    return primary === 'Shoulders' || /(lateral raise|rear delt|reverse fly|shoulder press|overhead press|military press)/.test(name);
  };
  const isShoulderPress = (ex) => /(shoulder press|overhead press|military press)/.test(normalizeName(ex?.name));
  const isLateralOrRear = (ex) => /(lateral raise|rear delt|reverse fly|face pull|reverse pec deck)/.test(normalizeName(ex?.name));
  return weeks.map((week) => {
    const days = (week?.days || []).map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] }));
    const shoulderDays = days.filter((day) => day.exercises.some(isDirectShoulder));
    let hasPress = days.some((day) => day.exercises.some(isShoulderPress));
    let hasLateralRear = days.some((day) => day.exercises.some(isLateralOrRear));
    const candidateDayOrder = ['Push', 'Pull', 'UpperFocus', 'Upper', 'DeltsArms', 'FullBodyA', 'FullBodyB'];

    const addShoulderExercise = (day, wantPress = false) => {
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
    return { ...week, days };
  });
}

function reinforceArmPriorityVisibility(weeks, user, exercises) {
  if (!Array.isArray(weeks) || !weeks.length) return weeks;
  if (!(user?.priorityGroups || []).includes('Arms')) return weeks;
  if (Number(user?.daysPerWeek || 0) < 4) return weeks;
  const isDirectBiceps = (ex) => isDirectBicepsName(ex?.name);
  const isDirectTriceps = (ex) => isDirectTricepsName(ex?.name);
  return weeks.map((week) => {
    const days = (week?.days || []).map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] }));
    let bicepsDays = days.filter((day) => day.exercises.some(isDirectBiceps)).length;
    let tricepsDays = days.filter((day) => day.exercises.some(isDirectTriceps)).length;
    const addArmExercise = (day, target) => {
      const slot = {
        id: `${String(day?.dayType || 'day').toLowerCase()}_elite_${target}_arm`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Arms',
        primaryAllowed: ['Arms'],
        subPreferred: target === 'biceps' ? ['Biceps-Long', 'Biceps-Short'] : ['Triceps-Long', 'Triceps-Lateral'],
        subFallback: null,
        optional: false
      };
      const dayState = buildCurrentDayState(day);
      const eligible = filterEligible(slot, exercises, user, new Set(), dayState, day?.dayType || '', null)
        .filter((candidate) => target === 'biceps' ? isDirectBiceps(candidate) : isDirectTriceps(candidate))
        .map((candidate) => ({ candidate, score: scoreExercise(candidate, slot, user, day?.dayType || '') }))
        .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
      const chosen = eligible[0]?.candidate;
      if (!chosen) return false;
      const rr = repsRestByExercise(chosen, String(week?.weekType || 'base'), user, slot.id);
      const item = buildExerciseOutput(chosen, user, { ...slot, optional: false }, 2, rr, { weekType: String(week?.weekType || 'base') });
      const replaceIdx = day.exercises.findIndex((ex) => {
        const primary = String(ex?.primary || ex?.muscleTarget || '');
        return primary === 'Core' || (String(ex?.style || '') === 'Isolation' && !['Arms', 'Shoulders'].includes(primary));
      });
      if (replaceIdx >= 0) {
        day.exercises.splice(replaceIdx, 1, item);
      } else {
        const compoundReplaceIdx = day.exercises.findIndex((ex) => {
          const primary = String(ex?.primary || ex?.muscleTarget || '');
          return String(ex?.style || '') === 'Compound'
            && !['Arms', 'Shoulders', 'Legs', 'Glutes'].includes(primary)
            && !(user?.priorityGroups || []).includes(primary);
        });
        if (compoundReplaceIdx >= 0) day.exercises.splice(compoundReplaceIdx, 1, item);
        else if ((day.exercises || []).length < Number(user?.sessionCap || 6)) day.exercises.push(item);
        else return false;
      }
      day.exercises = organizeDayExerciseOrder(day.dayType, day.exercises);
      return true;
    };
    const order = ['Push', 'Pull', 'UpperFocus', 'Upper', 'DeltsArms', 'FullBodyA', 'FullBodyB'];
    if (tricepsDays < 1) {
      for (const type of order) {
        const day = days.find((entry) => String(entry?.dayType || '') === type && !entry.exercises.some(isDirectTriceps));
        if (day && addArmExercise(day, 'triceps')) { tricepsDays += 1; break; }
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
    return { ...week, days };
  });
}

function flattenPlanExercises(weeks) {
  return (Array.isArray(weeks) ? weeks : []).flatMap((week) => (week?.days || []).flatMap((day) => day?.exercises || []));
}

function summarizeDirectSetsByMuscle(weeks) {
  return flattenPlanExercises(weeks).reduce((acc, ex) => {
    const muscle = String(ex?.primary || 'Core');
    acc[muscle] = Number(acc[muscle] || 0) + Number(ex?.sets || 0);
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

function buildEliteQaReport(plan, user) {
  const exercises = flattenPlanExercises(plan?.weeks);
  const days = (plan?.weeks?.[0]?.days || []).length;
  const directSets = summarizeDirectSetsByMuscle(plan?.weeks);
  const priorityGroups = Array.isArray(user?.priorityGroups) ? user.priorityGroups : [];
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
    if (group === 'Calves') {
      const calfDays = (plan?.weeks?.[0]?.days || []).filter((day) => (day?.exercises || []).some((ex) => Boolean(ex?.directCalf))).length;
      const calfTargetDays = Number(user?.daysPerWeek || 0) <= 3 ? Math.min(2, Number(user?.daysPerWeek || 0)) : 2;
      if (calfDays < calfTargetDays) {
        scores.emphasis -= 4;
        notes.push('Calf emphasis is not visible enough.');
      }
    } else if (group === 'Core') {
      const coreVarietyTarget = Number(user?.daysPerWeek || 0) >= 4 ? 2 : (priorityGroups.includes('Calves') ? 2 : 1);
      if (countDistinctCoreFamiliesFromPlan(plan?.weeks) < coreVarietyTarget) {
        scores.emphasis -= 3;
        notes.push('Ab emphasis lacks enough direct core variety.');
      }
    } else if ((directSets[group] || 0) < 6 && ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes'].includes(group)) {
      scores.emphasis -= 3;
      notes.push(`${group} emphasis is not getting enough direct work.`);
    }
  }
  if (priorityGroups.includes('Shoulders')) {
    const shoulderDays = (plan?.weeks?.[0]?.days || []).filter((day) => (day?.exercises || []).some((ex) => {
      return String(ex?.primary || ex?.muscleTarget || '') === 'Shoulders' || Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern) || Boolean(ex?.shoulderPressPattern);
    })).length;
    const hasPress = exercises.some((ex) => Boolean(ex?.shoulderPressPattern));
    const hasLateralRear = exercises.some((ex) => Boolean(ex?.lateralDeltPattern) || Boolean(ex?.rearDeltPattern));
    if (Number(user?.daysPerWeek || 0) >= 4 && shoulderDays < 2) {
      scores.emphasis -= 4;
      notes.push('Shoulder emphasis is not clearly repeated across the week.');
    }
    if (!hasPress || !hasLateralRear) {
      scores.emphasis -= 3;
      notes.push('Shoulder emphasis is missing either a press pattern or clear lateral/rear delt work.');
    }
  }
  if (priorityGroups.includes('Arms')) {
    const hasBiceps = exercises.some((ex) => String(ex?.directArmType || '') === 'biceps');
    const hasTriceps = exercises.some((ex) => String(ex?.directArmType || '') === 'triceps');
    const armDays = (plan?.weeks?.[0]?.days || []).filter((day) => (day?.exercises || []).some((ex) => {
      return ['biceps', 'triceps'].includes(String(ex?.directArmType || ''));
    })).length;
    if (!hasBiceps || !hasTriceps) {
      scores.emphasis -= 4;
      notes.push('Arm emphasis is missing either direct biceps work or direct triceps work.');
    }
    if (Number(user?.daysPerWeek || 0) >= 4 && armDays < 2) {
      scores.emphasis -= 3;
      notes.push('Arm emphasis is not clearly repeated across the week.');
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

function materializePlanResult(user, schedule, safeWeeks, safeResult, targets, frequencyTargets, stressMultiplier, notes = []) {
  const outputWeeks = safeWeeks.map((week) => ({
    ...week,
    days: (week.days || []).map((day) => ({
      dayType: day.dayType,
      exercises: (day.exercises || []).map(({ muscleTarget, slotId, optional, requiredEquipment, isCalisthenicsLike, nameLower, canonicalTruth, ...rest }) => ({
        ...rest,
        requiredEquipment: Array.isArray(rest?.requiredEquipment) ? rest.requiredEquipment : requiredEquipment,
        primaryMuscle: rest?.primaryMuscle || canonicalTruth?.primaryMuscle || rest?.primary,
        subMuscle: rest?.subMuscle || canonicalTruth?.subMuscle || rest?.sub
      }))
    }))
  }));
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
      priorityGroups: user.priorityGroups || [],
      weeklyTargets: targets,
      frequencyTargets,
      stressMultiplier,
      profile: user.profile,
      nutritionModel: buildNutritionModel(user),
      progressionModel: buildProgressionModel(user, targets, frequencyTargets),
      recoveryModel: buildRecoveryModel(user),
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
  plan.meta.eliteQa = buildEliteQaReport(plan, user);
  return plan;
}

function buildFinalConstrainedRebuild(user, exercises, targets, frequencyTargets, stressMultiplier, reason = '') {
  const schedule = buildConstrainedSchedule(user);
  const weeksResult = buildWeeks(user.timeline === '4 weeks' ? 4 : 8, schedule, user, exercises, targets, { constrainedRebuild: true });
  if (weeksResult.error) return weeksResult;
  const safeResult = repairAndValidatePlan(weeksResult.weeks, user, exercises);
  if (safeResult.error) return safeResult;
  return extractInternalPlanState(
    schedule,
    reinforceLowFrequencyPriorityAccessories(safeResult.weeks, user, exercises),
    safeResult,
    [reason || 'Used final constrained rebuild mode to preserve validity and constraints.'],
    { constrainedRebuild: true }
  );
}

function buildSafeBasePlanner(user, exercises, targets, frequencyTargets, stressMultiplier) {
  let schedule = buildSplit(user, user.daysPerWeek >= 5 && user.sessionLengthMin === '30');
  let weeksResult = buildWeeks(user.timeline === '4 weeks' ? 4 : 8, schedule, user, exercises, targets);
  if (weeksResult.error && user.daysPerWeek >= 5 && user.sessionLengthMin === '30') {
    schedule = buildSplit(user, true);
    weeksResult = buildWeeks(user.timeline === '4 weeks' ? 4 : 8, schedule, user, exercises, targets);
  }
  if (weeksResult.error) {
    const rebuilt = buildFinalConstrainedRebuild(user, exercises, targets, frequencyTargets, stressMultiplier, 'Used final constrained rebuild mode after main build exhaustion.');
    if (!rebuilt.error) return rebuilt;
    return weeksResult;
  }
  const safeResult = repairAndValidatePlan(weeksResult.weeks, user, exercises);
  if (safeResult.error) {
    const rebuilt = buildFinalConstrainedRebuild(user, exercises, targets, frequencyTargets, stressMultiplier, 'Used final constrained rebuild mode after sanitize/repair exhaustion.');
    if (!rebuilt.error) return rebuilt;
    return safeResult;
  }
  return extractInternalPlanState(
    schedule,
    reinforceLowFrequencyPriorityAccessories(safeResult.weeks, user, exercises),
    safeResult,
    [],
    { constrainedRebuild: false }
  );
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

function isNarrowShouldersArmsUser(user) {
  return hasExactPriorities(user, ['Shoulders', 'Arms']);
}

function isNarrowBackArmsUser(user) {
  return hasExactPriorities(user, ['Back', 'Arms']);
}

function isNarrowChestCoreUser(user) {
  return hasExactPriorities(user, ['Chest', 'Core']);
}

function isNarrowCoreCalvesUser(user) {
  return hasExactPriorities(user, ['Core', 'Calves']);
}

function isGluteDominantPriorityUser(user) {
  return hasExactPriorities(user, ['Legs', 'Glutes'])
    || hasExactPriorities(user, ['Legs', 'Glutes', 'Calves'])
    || hasExactPriorities(user, ['Glutes', 'Core']);
}

function gluteStrengthRank(value) {
  const rank = { none: 0, assist: 1, secondary: 2, primary: 3 };
  return Number(rank[String(value || 'none')] || 0);
}

function shouldUpgradeExerciseTaste(exercise, user, dayType = '') {
  const name = normalizeName(exercise?.name);
  if (!name) return false;
  if (/\bjm press\b|\bmachine shoulder \(military\) press\b|\bincline barbell triceps extension\b|\bside laterals? to front raise\b/.test(name)) return true;
  if (/^row$/.test(name)) return true;
  if (isUnsupportedBentOverRowName(name)) return true;
  if (isCoachSideEyeAccessory(exercise, user)) return true;
  if (String(dayType || '').toLowerCase() === 'push' && /(rear delt row)/.test(name)) return true;
  if ((user?.priorityGroups || []).includes('Shoulders') && /(front raise)/.test(name)) return true;
  return false;
}

function buildQualityReplacement(day, exercise, slot, user, exercises, weekType, predicate = null) {
  const dayWithoutCurrent = {
    ...day,
    exercises: (day?.exercises || []).filter((entry) => entry !== exercise)
  };
  const dayState = buildCurrentDayState(dayWithoutCurrent);
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
    .flatMap((candidateSlot) => filterEligible(candidateSlot, exercises, user, new Set(), dayState, day?.dayType || '', null)
      .filter((candidate) => String(candidate?.name || '') !== String(exercise?.canonicalName || exercise?.name || ''))
      .map((candidate) => ({
        candidate,
        slot: candidateSlot,
        score: scoreExercise(candidate, candidateSlot, user, day?.dayType || '') + qualityReplacementPreference(candidate, exercise, candidateSlot, user, day?.dayType || '')
      })))
    .sort((a, b) => (b.score - a.score) || a.candidate.name.localeCompare(b.candidate.name));
  if (typeof predicate === 'function') eligible = eligible.filter(({ candidate }) => predicate(candidate));
  const selected = eligible[0] || null;
  const replacement = selected?.candidate || null;
  if (!replacement) return null;
  const effectiveSlot = selected?.slot || slot;
  const rr = repsRestByExercise(replacement, String(weekType || 'base'), user, effectiveSlot.id);
  const sets = effectiveSlot.styleRequired === 'Isolation'
    ? Math.min(3, Math.max(2, Number(exercise?.sets || 2)))
    : Math.max(2, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(exercise?.sets || 3)));
  return buildExerciseOutput(replacement, user, { ...effectiveSlot, optional: false }, sets, rr, { weekType: String(weekType || 'base') });
}

function exerciseDirectlyServesPriority(exercise, muscle, user) {
  const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
  const name = normalizeName(exercise?.name);
  switch (String(muscle || '')) {
    case 'Chest':
      return truth.primaryMuscle === 'Chest'
        || truth.pressRole === 'chest_press'
        || truth.pressRole === 'mixed'
        || /(fly|crossover|pec deck)/.test(name);
    case 'Back':
      return truth.primaryMuscle === 'Back'
        || truth.pullRole === 'back_builder';
    case 'Shoulders':
      return truth.primaryMuscle === 'Shoulders'
        || truth.pressRole === 'shoulder_press'
        || truth.directDeltSubtype !== 'none';
    case 'Arms':
      return truth.primaryMuscle === 'Arms'
        || truth.directArmSubtype !== 'none'
        || isDirectBicepsName(name)
        || isDirectTricepsName(name);
    case 'Core':
      return truth.coreFamily !== 'none' || truth.directAb;
    case 'Legs':
      return truth.primaryMuscle === 'Legs'
        || ['squat', 'lunge'].includes(String(truth.movementFamily || ''))
        || /(leg extension|leg curl|hamstring curl|glute ham)/.test(name);
    case 'Glutes':
      return truth.primaryMuscle === 'Glutes'
        || gluteStrengthRank(truth.glutePrimaryStrength) >= 2;
    case 'Calves':
      return truth.directCalf;
    default:
      return false;
  }
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
  if (['Legs', 'Glutes', 'Calves'].includes(muscle)) return lowerDays.has(type);
  if (muscle === 'Core') return true;
  return false;
}

function buildPriorityIdentitySlot(dayType, muscle) {
  const dayKey = String(dayType || 'day').toLowerCase();
  switch (String(muscle || '')) {
    case 'Chest':
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
    case 'Legs':
      return {
        id: `${dayKey}_priority_identity_legs`,
        pattern: 'Isolation',
        styleRequired: 'Isolation',
        muscleTarget: 'Legs',
        primaryAllowed: ['Legs'],
        subPreferred: ['Quads', 'Hamstrings-Curl'],
        subFallback: null,
        optional: false
      };
    case 'Glutes':
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
      if (truth.directAb && !priorities.includes('Core')) score += 4;
      if (truth.directCalf && !priorities.includes('Calves')) score += 4;
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

function buildNarrowIdentityReplacementSlot(day, user) {
  if (isNarrowShouldersArmsUser(user)) {
    const shoulderCount = countExercisesByPredicate(day, (exercise) => {
      const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
      return truth.shoulderPressPattern || truth.lateralDeltPattern || truth.rearDeltPattern;
    });
    return shoulderCount <= 1
      ? buildPriorityIdentitySlot(day?.dayType || '', 'Shoulders')
      : buildPriorityIdentitySlot(day?.dayType || '', 'Arms');
  }
  if (isNarrowBackArmsUser(user)) {
    const backCount = countExercisesByPredicate(day, (exercise) => exerciseDirectlyServesPriority(exercise, 'Back', user));
    return backCount <= 1
      ? buildPriorityIdentitySlot(day?.dayType || '', 'Back')
      : buildPriorityIdentitySlot(day?.dayType || '', 'Arms');
  }
  if (isNarrowChestCoreUser(user)) {
    const coreCount = countExercisesByPredicate(day, (exercise) => exerciseDirectlyServesPriority(exercise, 'Core', user));
    return coreCount <= 0
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
    maxChestPresses = ['FullBodyA', 'FullBodyB'].includes(type) ? 1 : 0;
  } else if (isNarrowChestCoreUser(user) && ['Push', 'Upper', 'UpperFocus'].includes(type)) {
    maxChestPresses = 2;
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
      if (gluteStrengthRank(truth.glutePrimaryStrength) >= 3) return null;
      if (exerciseDirectlyServesPriority(exercise, 'Core', user) && priorities.includes('Core')) return null;
      if (exerciseDirectlyServesPriority(exercise, 'Calves', user) && priorities.includes('Calves')) return null;
      if (String(exercise?.style || '') === 'Compound' && compoundCount <= compoundFloor) return null;
      let score = 0;
      if (isAssembledLowerAccessory(exercise)) score += 28;
      if (/(leg extension|leg extensions)/.test(normalizeName(exercise?.name))) score += 24;
      if (/(seated leg curl|leg curl)/.test(normalizeName(exercise?.name))) score += 18;
      if (/(glute ham raise)/.test(normalizeName(exercise?.name))) score += 16;
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
  const targetGluteCount = ['LowerFocus', 'Legs'].includes(String(day?.dayType || '')) ? 2 : 1;
  let gluteCount = nextDay.exercises.filter((exercise) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    return gluteStrengthRank(truth.glutePrimaryStrength) >= 3;
  }).length;
  while (gluteCount < targetGluteCount) {
    const replaceIdx = findGlutePriorityReplacementIndex(nextDay, user);
    if (replaceIdx < 0) break;
    const current = nextDay.exercises[replaceIdx];
    const slot = buildPriorityIdentitySlot(nextDay?.dayType || '', 'Glutes');
    const replacement = buildQualityReplacement(nextDay, current, slot, user, exercises, weekType, (candidate) => {
      const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
      return gluteStrengthRank(truth.glutePrimaryStrength) >= 3
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
  const currentIsChestPress = isChestPressPatternName(exercise?.name);
  if (String(day?.dayType || '') === 'DeltsArms' || hasShoulderPriority) {
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
  const targetPressCount = String(day?.dayType || '') === 'DeltsArms' ? 1 : 2;
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
    if (replacement) nextDay.exercises.splice(idx, 1, replacement);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function polishDuplicateShoulderPresses(day, user, exercises, weekType) {
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const pressIndexes = [];
  nextDay.exercises.forEach((exercise, index) => {
    const truth = exercise?.canonicalTruth || buildExerciseTruth(exercise, user);
    if (truth.shoulderPressPattern) pressIndexes.push(index);
  });
  if (pressIndexes.length <= 1) return nextDay;
  for (let i = 1; i < pressIndexes.length; i += 1) {
    const idx = pressIndexes[i];
    const current = nextDay.exercises[idx];
    const shoulderSlot = {
      id: `${String(nextDay?.dayType || 'day').toLowerCase()}_quality_shoulder_iso`,
      pattern: 'Isolation',
      styleRequired: 'Isolation',
      muscleTarget: 'Shoulders',
      primaryAllowed: ['Shoulders'],
      subPreferred: ['Lateral', 'Rear'],
      subFallback: null,
      optional: false
    };
    let replacement = buildQualityReplacement(
      nextDay,
      current,
      shoulderSlot,
      user,
      exercises,
      weekType,
      (candidate) => {
        const truth = candidate?.canonicalTruth || buildExerciseTruth(candidate, user);
        return truth.lateralDeltPattern || truth.rearDeltPattern;
      }
    );
    if (!replacement && (String(nextDay?.dayType || '') === 'DeltsArms' || isNarrowShouldersArmsUser(user) || (user?.priorityGroups || []).includes('Arms'))) {
      const armSlot = buildPriorityIdentitySlot(nextDay?.dayType || '', 'Arms');
      replacement = buildQualityReplacement(
        nextDay,
        current,
        armSlot,
        user,
        exercises,
        weekType,
        (candidate) => exerciseDirectlyServesPriority(candidate, 'Arms', user) && !isCoachSideEyeAccessory(candidate, user)
      );
    }
    if (replacement) nextDay.exercises.splice(idx, 1, replacement);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
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
  else if (isNarrowBackArmsUser(user)) maxChestPresses = ['FullBodyA', 'FullBodyB'].includes(type) ? 1 : 0;
  else if (isNarrowChestCoreUser(user)) maxChestPresses = 2;
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

function polishLowerFatigueStacking(day, user, exercises, weekType) {
  if (!['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day?.dayType || ''))) return day;
  const nextDay = { ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.slice() : [] };
  const posteriorIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (isPosteriorChainFatigueExercise(exercise)) acc.push(index);
    return acc;
  }, []);
  const hipBridgeIndexes = nextDay.exercises.reduce((acc, exercise, index) => {
    if (/(hip thrust|glute bridge)/.test(normalizeName(exercise?.name))) acc.push(index);
    return acc;
  }, []);
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
    if (replacement) nextDay.exercises.splice(idx, 1, replacement);
  }
  nextDay.exercises = organizeDayExerciseOrder(nextDay.dayType || '', nextDay.exercises);
  return nextDay;
}

function upgradePlanQualityPass(baseState, user, exercises) {
  if (!baseState || baseState.error) return baseState;
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
      const polishedUpperPresses = polishUpperPressRedundancy(
        polishedShoulders,
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
      const polishedIdentity = polishPriorityDominanceSessionIdentity(
        polishedChestPresses,
        user,
        exercises,
        String(week?.weekType || 'base')
      );
      const polishedNarrowIdentity = polishNarrowPrioritySessionIdentity(
        polishedIdentity,
        user,
        exercises,
        String(week?.weekType || 'base')
      );
      const polishedGlutePriority = polishGlutePriorityExpression(
        polishedNarrowIdentity,
        user,
        exercises,
        String(week?.weekType || 'base')
      );
      const polishedAssembledLower = polishAssembledLowerDay(
        polishedGlutePriority,
        user,
        exercises,
        String(week?.weekType || 'base')
      );
      const polishedLowerFatigue = polishLowerFatigueStacking(
        polishedAssembledLower,
        user,
        exercises,
        String(week?.weekType || 'base')
      );
      const polishedDay = polishShortSessionHipDominantClustering(
        polishedLowerFatigue,
        user,
        exercises,
        String(week?.weekType || 'base')
      );
      return {
        ...day,
        exercises: organizeDayExerciseOrder(day?.dayType || '', polishedDay.exercises || [])
      };
    });
    return polishCorePriorityFamilyExpression({ ...week, days: nextDays }, user, exercises, String(week?.weekType || 'base'));
  });
  const repaired = repairAndValidatePlan(upgradedWeeks, user, exercises);
  if (repaired.error) return baseState;
  return extractInternalPlanState(
    baseState.schedule,
    reinforceArmPriorityVisibility(
      reinforceShoulderPriorityVisibility(
        reinforceLowFrequencyPriorityAccessories(repaired.weeks, user, exercises),
        user,
        exercises
      ),
      user,
      exercises
    ),
    repaired,
    baseState.notes,
    {
      ...baseState.stageMeta,
      constrainedRebuild: Boolean(baseState?.stageMeta?.constrainedRebuild)
    }
  );
}

function attachAdaptiveCoachingLayer(plan, user, targets, frequencyTargets, stressMultiplier) {
  if (!plan || plan.error) return plan;
  const materialized = materializePlanResult(
    user,
    plan.schedule,
    plan.weeks,
    { filteredCount: plan.filteredCount },
    targets,
    frequencyTargets,
    stressMultiplier,
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

  const { targets, frequencyTargets, stressMultiplier } = computeWeeklyTargets(user);
  const safeBase = buildSafeBasePlanner(user, PREPROCESSED_CACHE, targets, frequencyTargets, stressMultiplier);
  if (safeBase?.error) return safeBase;
  const qualityUpgraded = upgradePlanQualityPass(safeBase, user, PREPROCESSED_CACHE);
  if (qualityUpgraded?.error) return qualityUpgraded;
  const plan = attachAdaptiveCoachingLayer(qualityUpgraded, user, targets, frequencyTargets, stressMultiplier);
  if (plan?.error) return plan;
  applyEliteGradingLayer(plan, user);
  if (!['elite', 'good'].includes(plan?.meta?.eliteQa?.tier)) {
    const rebuiltState = buildFinalConstrainedRebuild(user, PREPROCESSED_CACHE, targets, frequencyTargets, stressMultiplier, 'Used final constrained rebuild mode after elite QA downgrade.');
    if (!rebuiltState.error) {
      const rebuiltPlan = attachAdaptiveCoachingLayer(rebuiltState, user, targets, frequencyTargets, stressMultiplier);
      applyEliteGradingLayer(rebuiltPlan, user);
      const currentScore = Number(plan?.meta?.eliteQa?.score || 0);
      const rebuiltScore = Number(rebuiltPlan?.meta?.eliteQa?.score || 0);
      if (rebuiltScore >= currentScore || ['elite', 'good'].includes(rebuiltPlan?.meta?.eliteQa?.tier)) return rebuiltPlan;
    }
  }
  return plan;
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
  buildAdaptiveRecalibration,
  buildSafeBasePlanner,
  upgradePlanQualityPass,
  attachAdaptiveCoachingLayer,
  applyEliteGradingLayer,
  buildConstrainedSchedule,
  buildFinalConstrainedRebuild,
  buildEliteQaReport,
  buildOblueprintPlan
};
