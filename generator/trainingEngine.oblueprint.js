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
const HOME_DEFAULTS = ['dumbbell'];
const GYM_DEFAULTS = ['barbell', 'dumbbell', 'machine', 'cable'];
const MUSCLE_KEYS = ['Chest', 'Back', 'Legs', 'Glutes', 'Shoulders', 'Arms', 'Core', 'Forearms', 'Neck'];
const LARGE_MUSCLES = new Set(['Chest', 'Back', 'Legs', 'Glutes']);
const SMALL_MUSCLES = new Set(['Shoulders', 'Arms', 'Core', 'Abs', 'Forearms', 'Neck']);
const BODYBUILDING_MAX_SETS_PER_EXERCISE = 4;
const PRIORITY_SET_BONUS = {
  Chest: 4,
  Back: 4,
  Glutes: 4,
  Shoulders: 4,
  Arms: 4,
  Core: 3
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
    exclude: [/\bfly\b/, /\bcrossover\b/, /\bpec\s*deck\b/, /\bto\b/, /\bjammer\b/, /\bclose[-\s]*grip\b/, /\bone[-\s]*arm\b/, /\bsingle[-\s]*arm\b/, /\bkneeling\b/]
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
const INJURY_JOINT_MAP = { Back: 'spine', Knee: 'knee', Hip: 'hip', Shoulder: 'shoulder', Elbow: 'elbow' };

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
    'smith machine': 'smith',
    smith: 'smith',
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
      'barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bands', 'bodyweight', 'pullup_bar',
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
  if (/(rear delt|reverse fly|face pull|reverse pec deck)/.test(n)) return 'rear_delt';
  if (/(fly|crossover|pec deck)/.test(n)) return 'chest_fly';
  if (/(lateral raise|side lateral)/.test(n)) return 'lateral_raise';
  if (/\bcurl\b/.test(n)) return 'curl';
  if (/(triceps|extension|pushdown|skull crusher)/.test(n)) return 'triceps_extension';
  if (/(calf raise)/.test(n)) return 'calves';
  if (/(crunch|rollout|wood chop|pallof|ab wheel|hanging knee|hanging leg)/.test(n)) return 'core';
  return null;
}

function normalizeBodybuildingDisplayName(name, user) {
  const raw = String(name || '').trim();
  if (!(user?.discipline === 'bodybuilding' || user?.discipline === 'powerbuilding')) return raw;
  if (!raw) return raw;
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
      if (wantsBiceps && !wantsTriceps) return /(curl|preacher|hammer|incline curl|barbell curl|dumbbell curl)/.test(nn);
      if (wantsTriceps && !wantsBiceps) return /(triceps|extension|pushdown|skull crusher)/.test(nn);
      return /(curl|triceps|extension|pushdown|skull crusher)/.test(nn);
    }
    if (slot?.muscleTarget === 'Core') return /(crunch|rollout|wood chop|pallof|ab wheel|hanging knee|hanging leg)/.test(normalizeName(name));
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
      isCalisthenicsLike: isCalisthenicsLikeExercise(ex)
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
    .replace(/â€“|â€”|âˆ’/g, '-')
    .replace(/\s+/g, '');
  if (!compact) return null;
  if (compact === '<6m' || compact === '<6months') return '<6m';
  if (compact === '6-24m' || compact === '6-24months') return '6-24m';
  if (compact === '2-5y' || compact === '2-5yr' || compact === '2-5yrs' || compact === '2-5years') return '2-5y';
  if (compact === '5y+' || compact === '5+y' || compact === '5+yr' || compact === '5+yrs' || compact === '5+years') return '5y+';
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
  const home = new Set(HOME_DEFAULTS);
  const gym = new Set(GYM_DEFAULTS);
  let allowedEquipment = [];
  if (src.location === 'Home') {
    if (Array.isArray(src.equipmentAccess) && src.equipmentAccess.length > 0) {
      if (!userEquipNorm.length) return { error: 'NO_USABLE_EQUIPMENT_HOME' };
      allowedEquipment = [...new Set([...userEquipNorm])].sort();
    } else {
      allowedEquipment = [...HOME_DEFAULTS];
    }
  } else {
    allowedEquipment = [...new Set([...gym, ...userEquipNorm])].sort();
  }
  if (discipline === 'bodybuilding' || discipline === 'powerbuilding') {
    allowedEquipment = allowedEquipment.filter((eq) => !['bodyweight', 'pullup_bar', 'bands'].includes(eq));
    if (!allowedEquipment.length) {
      return invalidInput('equipmentAccess', 'Bodybuilding/Powerbuilding requires at least one non-bodyweight equipment type.');
    }
  }

  const painProfiles = src.painProfilesByArea && typeof src.painProfilesByArea === 'object' ? src.painProfilesByArea : {};
  const injuryMap = {};
  (Array.isArray(src.painAreas) ? src.painAreas : []).forEach((area) => {
    const profile = painProfiles[area] || {};
    const adjusted = adjustSeverity(profile.severity, profile.recency);
    if (!adjusted) return;
    if (area === 'Wrist') injuryMap.Wrist = adjusted;
    const joint = INJURY_JOINT_MAP[area];
    if (joint) injuryMap[joint] = adjusted;
  });

  const preferredDays = src.preferredDays.map(toWeekday).filter(Boolean);
  const phase = src.primaryGoal === 'Build size' ? 'surplus' : src.primaryGoal === 'Cut fat' ? 'deficit' : 'recomp';

  const rawPlanSeed = Number(src.planSeed);
  const planSeed = Number.isFinite(rawPlanSeed) ? Math.floor(rawPlanSeed) : buildPlanSeed();

  return {
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
    preferredDays,
    planSeed,
    _selectionCursor: 0
  };
}

function computeWeeklyTargets(user) {
  const cfg = EXP_CFG[user.experience];
  const stressMult = STRESS_MULT[user.stress] || 1;
  const sleepMult = user.sleepHours < 5 ? 0.8 : user.sleepHours < 6 ? 0.9 : 1.0;
  const prioritySet = new Set(user.priorityGroups || []);
  const targets = {};
  for (const muscle of MUSCLE_KEYS) {
    const base = LARGE_MUSCLES.has(muscle) ? cfg.large : cfg.small;
    let n = Math.round(base * stressMult * sleepMult);
    if (user.activityLevel === 'Very active' && (muscle === 'Legs' || muscle === 'Glutes')) n = Math.round(n * 0.9);
    if (prioritySet.has(muscle)) n += cfg.add + Number(PRIORITY_SET_BONUS[muscle] || 0);
    else n = Math.round(n * cfg.maintenance);
    const minClamp = LARGE_MUSCLES.has(muscle) ? 6 : 4;
    const maxClamp = LARGE_MUSCLES.has(muscle) ? cfg.maxLarge : cfg.maxSmall;
    if (user.phase === 'deficit') n = Math.max(minClamp, n - 1);
    targets[muscle] = Math.max(minClamp, Math.min(maxClamp, n));
  }
  return { targets, stressMultiplier: stressMult };
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
  const split = forceUpperLower && d >= 5
    ? ['Upper', 'Lower', 'Upper', 'Lower', ...Array.from({ length: Math.max(0, d - 4) }).map((_, i) => (i % 2 ? 'Lower' : 'Upper'))]
    : (
      d === 2 ? ['Upper', 'Lower']
        : d === 3 ? ['Push', 'Pull', 'Legs']
          : d === 4 ? ['Upper', 'Lower', 'Upper', 'Lower']
            : d === 5 ? ['Push', 'Pull', 'Legs', 'Upper', 'Lower']
              : ['Push', 'Pull', 'Legs', 'DeltsArms', 'Upper', 'Lower']
    );
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

function buildDayBlueprint(dayType, user, weekType) {
  const slots = [];
  if (dayType === 'Push') {
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
    slots.push(makeSlot('pull_core_rot', 'CoreStability', 'Isolation', 'Core', { primaryAllowed: ['Core'], subPreferred: ['Obliques', 'Abs-Lower'], optional: true }));
  } else if (dayType === 'Legs') {
    slots.push(makeSlot('legs_squat', 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads'] }));
    slots.push(makeSlot('legs_hinge', 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Hamstrings-Hinge', 'Glutes'] }));
    slots.push(makeSlot('legs_iso', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Quads', 'Hamstrings-Curl'] }));
    slots.push(makeSlot('legs_calf', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'] }));
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
    slots.push(makeSlot('lower_calf', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Calves'] }));
    slots.push(makeSlot('lower_core', 'CoreFlexion', 'Isolation', 'Core', { primaryAllowed: ['Core'], subPreferred: ['Abs-Lower', 'Abs-Upper'] }));
  }

  if (user.discipline === 'powerbuilding') {
    if (dayType === 'Push' || dayType === 'Upper') slots.unshift(makeSlot(`pb_bench_${dayType.toLowerCase()}`, 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    if (dayType === 'Legs' || dayType === 'Lower') slots.unshift(makeSlot(`pb_sq_${dayType.toLowerCase()}`, 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'] }));
    if ((dayType === 'Legs' || dayType === 'Lower') && !slots.some((s) => String(s.id || '').startsWith('pb_hinge_'))) {
      slots.unshift(makeSlot(`pb_hinge_${dayType.toLowerCase()}`, 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'] }));
    }
  }
  if ((user.priorityGroups || []).includes('Glutes') && !slots.some((s) => s.id.includes('glute'))) {
    slots.push(makeSlot(`${dayType.toLowerCase()}_glute_addon`, 'Isolation', 'Isolation', 'Glutes', { primaryAllowed: ['Glutes', 'Legs'], subPreferred: ['Glutes'], optional: true }));
  }

  const prioritySet = new Set(user.priorityGroups || []);
  const addPrioritySlot = (id, pattern, styleRequired, muscleTarget, opts = {}) => {
    if (slots.some((s) => s.id === id)) return;
    slots.push(makeSlot(id, pattern, styleRequired, muscleTarget, opts));
  };
  if (prioritySet.has('Chest') && (dayType === 'Push' || dayType === 'Upper')) {
    addPrioritySlot(`${dayType.toLowerCase()}_chest_priority`, 'Isolation', 'Isolation', 'Chest', { primaryAllowed: ['Chest'], optional: true });
  }
  if (prioritySet.has('Shoulders') && (dayType === 'Push' || dayType === 'Pull' || dayType === 'Upper' || dayType === 'DeltsArms')) {
    const shoulderPref = dayType === 'Pull' ? ['Rear'] : ['Lateral', 'Rear'];
    addPrioritySlot(`${dayType.toLowerCase()}_shoulder_priority`, 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: shoulderPref, optional: true });
  }
  if (prioritySet.has('Arms') && (dayType === 'Push' || dayType === 'Pull' || dayType === 'Upper')) {
    if (dayType === 'Push') {
      addPrioritySlot(`${dayType.toLowerCase()}_tri_priority`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'], optional: true });
    } else if (dayType === 'Pull') {
      addPrioritySlot(`${dayType.toLowerCase()}_bi_priority`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: true });
    } else {
      addPrioritySlot(`${dayType.toLowerCase()}_arms_priority_bi`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: true });
      addPrioritySlot(`${dayType.toLowerCase()}_arms_priority_tri`, 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'], optional: true });
    }
  }
  if (prioritySet.has('Back') && (dayType === 'Pull' || dayType === 'Upper')) {
    addPrioritySlot(`${dayType.toLowerCase()}_back_priority`, dayType === 'Pull' ? 'HorizontalPull' : 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], optional: true });
  }
  if (prioritySet.has('Core') && !slots.some((s) => s.id.includes('core_priority'))) {
    addPrioritySlot(`${dayType.toLowerCase()}_core_priority`, 'CoreStability', 'Isolation', 'Core', { primaryAllowed: ['Core'], optional: true });
  }

  if (weekType === 'deload') return slots;
  return slots;
}

function buildWeekBlueprint(discipline, split, user, weekType) {
  return split.map((s) => ({ day: s.day, dayType: s.dayType, slots: buildDayBlueprint(s.dayType, user, weekType), discipline }));
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
  let reject = false;
  let penalty = 0;
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
  const wrist = Number(user.injuryMap?.Wrist || 0);
  if (wrist >= 7) {
    if (Number(ex.elbow) === 3 || Number(ex.shoulder) === 3) reject = true;
    if (Number(ex.elbow) === 2 || Number(ex.shoulder) === 2) penalty += 12;
  } else if (wrist >= 5) {
    if (Number(ex.elbow) === 3) reject = true;
    if (Number(ex.elbow) === 2) penalty += 7;
  }
  return { reject, penalty };
}

function scoreExercise(ex, slot, user, dayType = '') {
  let score = 0;
  if (user.trainingStyle === 'Mostly machines/cables') {
    const hasMC = ex.equipmentNorm.includes('machine') || ex.equipmentNorm.includes('cable');
    const onlyBasic = ex.equipmentNorm.every((x) => ['barbell', 'bodyweight'].includes(x));
    if (hasMC) score += 14;
    if (onlyBasic) score -= 10;
  } else if (user.trainingStyle === 'Mostly free weights') {
    const hasFW = ex.equipmentNorm.includes('barbell') || ex.equipmentNorm.includes('dumbbell');
    if (hasFW) score += 14;
  }
  if (slot.primaryAllowed && slot.primaryAllowed.includes(ex.primary)) score += 30;
  if (slot.subPreferred && slot.subPreferred.includes(ex.sub)) score += 20;
  if (slot.subFallback && slot.subFallback.includes(ex.sub)) score += 10;
  if (slot.muscleTarget && Array.isArray(ex.secondaryMuscles) && ex.secondaryMuscles.includes(slot.muscleTarget)) score += 8;
  if (isBodybuildingStapleForSlot(ex, slot, user, dayType)) score += 18;
  else if (user.discipline === 'bodybuilding' || user.discipline === 'powerbuilding') score -= 28;
  score += (10 - Math.abs(Number(ex.difficulty || 0) - EXP_CFG[user.experience].diffTarget) * 3);
  const basePenalty = (Number(ex.spine) + Number(ex.knee) + Number(ex.hip) + Number(ex.shoulder) + Number(ex.elbow)) * 2;
  const jointEval = evaluateJoint(ex, user);
  return score - basePenalty - jointEval.penalty;
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
    if (weekPicked.has(ex.name)) return false;
    if (isHardBannedExercise(ex)) return false;
    if ((user.discipline === 'bodybuilding' || user.discipline === 'powerbuilding') && ex.isCalisthenicsLike) return false;
    if (!isBodybuildingStapleForSlot(ex, slot, user, dayType)) return false;
    if (!ex.equipmentNorm.some((eq) => user.allowedEquipment.includes(eq))) return false;
    if (matchesAvoid(ex.nameLower, user.avoidNameContainsTokens)) return false;
    if (dayType === 'Pull' && /(lateral raise|side lateral)/.test(ex.nameLower)) return false;
    const joint = evaluateJoint(ex, user);
    if (joint.reject) return false;
    if (ex.pattern !== slot.pattern) return false;
    if (slot.styleRequired && ex.style !== slot.styleRequired) return false;
    if (!slot.styleRequired && ['Mobility', 'Cardio'].includes(ex.style) && !['Mobility', 'Cardio'].includes(slot.pattern)) return false;
    if (Number(ex.difficulty) > maxDiff) return false;
    if (dayState && String(slot.styleRequired || '') === 'Isolation') {
      const fam = slotExerciseFamily(ex);
      if (fam) {
        if (dayState.families.has(fam)) return false;
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
  const dayState = { families: new Set(), counts: { chest_fly: 0, rear_delt: 0, bench_press: 0 }, dayKey };
  for (const slot of dayBlueprint.slots) {
    let eligible = filterEligible(slot, exercises, user, weekPicked, dayState, dayBlueprint?.dayType || '', weekState);
    if (!eligible.length && slot.styleRequired === 'Compound') {
      if (slot.pattern === 'VerticalPush') {
        const alt = { ...slot, pattern: 'Isolation', styleRequired: 'Isolation', primaryAllowed: ['Shoulders'] };
        eligible = filterEligible(alt, exercises, user, weekPicked, dayState, dayBlueprint?.dayType || '', weekState);
      } else if (slot.pattern === 'Squat') {
        const alt = { ...slot, pattern: 'Lunge', styleRequired: 'Compound' };
        eligible = filterEligible(alt, exercises, user, weekPicked, dayState, dayBlueprint?.dayType || '', weekState);
      }
    }
    if (!eligible.length) {
      if (slot.optional) continue;
      return structuredNoEligible(slot, user);
    }
    eligible = eligible
      .map((ex) => ({ ex, score: scoreExercise(ex, slot, user, dayBlueprint?.dayType || '') }))
      .sort((a, b) => (b.score - a.score) || a.ex.name.localeCompare(b.ex.name));
    const chosen = pickCandidate(eligible, slot) || eligible[0].ex;
    weekPicked.add(chosen.name);
    const displayName = normalizeBodybuildingDisplayName(chosen.name, user);
    if (String(slot.styleRequired || '') === 'Isolation') {
      const fam = slotExerciseFamily(chosen);
      if (fam) {
        dayState.families.add(fam);
        dayState.counts[fam] = Number(dayState.counts[fam] || 0) + 1;
        if (fam === 'rear_delt' && weekState) weekState.rearDeltDays.add(dayKey);
      }
    }
    if (slot.pattern === 'HorizontalPush' && String(chosen?.style || '') === 'Compound') {
      const n = normalizeName(chosen?.name);
      if (/\bbench press\b/.test(n)) dayState.counts.bench_press = Number(dayState.counts.bench_press || 0) + 1;
    }
    if (weekState && slot.pattern === 'Hinge' && String(chosen?.style || '') === 'Compound') {
      if (isHeavyDeadliftPatternName(chosen?.name)) weekState.heavyDeadliftCount = Number(weekState.heavyDeadliftCount || 0) + 1;
    }
    picked.push({
      slotId: slot.id,
      optional: slot.optional,
      muscleTarget: slot.muscleTarget,
      ...chosen,
      name: displayName
    });
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
      const ordered = exList.slice().sort((a, b) => (a.style === 'Compound' ? -1 : 1) - (b.style === 'Compound' ? -1 : 1));
      ordered.forEach((ex, exIdx) => {
        const remaining = ordered.length - exIdx;
        const minForThis = ex.style === 'Compound' ? 2 : 2;
        const sets = Math.min(
          BODYBUILDING_MAX_SETS_PER_EXERCISE,
          Math.max(minForThis, Math.floor(budget / remaining))
        );
        budget -= sets;
        const rr = repsRestByExercise(ex, weekType, user, ex.slotId);
        const item = {
          name: ex.name,
          pattern: ex.pattern,
          primary: ex.primary,
          sub: ex.sub,
          equipment: ex.equipmentNorm,
          style: ex.style,
          difficulty: ex.difficulty,
          sets,
          reps: rr.reps,
          restSec: rr.restSec,
          progressionRule: progressionRuleForExercise(ex, user),
          flags: ['avoidFilteredOk', 'injurySafeOk'],
          muscleTarget: muscle,
          slotId: ex.slotId,
          optional: ex.optional
        };
        const rir = rirForExercise(ex, user, weekType);
        if (rir) item.rir = rir;
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

function applySessionCapTrimming(day, sessionCap, priorityGroups) {
  const list = day.exercises.slice();
  const isPriority = (ex) => priorityGroups.includes(ex.muscleTarget) || priorityGroups.includes(ex.primary);
  const removeFirst = (predicate) => {
    const idx = list.findIndex(predicate);
    if (idx >= 0) {
      list.splice(idx, 1);
      return true;
    }
    return false;
  };

  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.style === 'Isolation' && !isPriority(ex))) break;
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.pattern === 'Lunge')) break;
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ['CoreFlexion', 'CoreStability', 'CoreRotation'].includes(ex.pattern))) break;
  }
  while (list.length > sessionCap) {
    const arms = list.filter((ex) => ex.primary === 'Arms' || ex.muscleTarget === 'Arms');
    if (arms.length <= 1) break;
    const idx = list.findIndex((ex) => ex.primary === 'Arms' || ex.muscleTarget === 'Arms');
    if (idx >= 0) list.splice(idx, 1);
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.style === 'Isolation')) break;
  }
  while (list.length > sessionCap) {
    if (!removeFirst((ex) => ex.style === 'Compound' && ex.sets <= 2)) break;
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
    return m === 'Arms' || /(curl|triceps|pushdown|skull crusher|extension)/.test(n);
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
  moveAll((ex) => isCompound(ex) && !isArms(ex) && !isCalves(ex) && !isCore(ex));
  moveAll((ex) => !isCompound(ex) && !isArms(ex) && !isCalves(ex) && !isCore(ex));
  moveAll((ex) => isArms(ex) && !isCalves(ex) && !isCore(ex));
  moveAll((ex) => isCalves(ex));
  moveAll((ex) => isCore(ex));
  moveAll(() => true);
  return ordered;
}

function weekPattern(blockLength) {
  if (blockLength === 4) return ['base', 'volume', 'intensification', 'deload'];
  return ['base', 'volume', 'volume', 'deload', 'intensification', 'intensification', 'intensification', 'deload'];
}

function buildWeeks(blockLength, schedule, user, exercises, targets) {
  const types = weekPattern(blockLength);
  const weeks = [];
  for (let i = 0; i < blockLength; i += 1) {
    const weekType = types[i];
    const targetsForWeek = scaleTargets(targets, weekType, blockLength, i + 1);
    const blueprint = buildWeekBlueprint(user.discipline, schedule, user, weekType);
    const weekPicked = new Set();
    const weekState = {
      rearDeltDays: new Set(),
      heavyDeadliftCount: 0,
      priorityGroups: new Set(user.priorityGroups || [])
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
    prescribed = prescribed.map((d) => applySessionCapTrimming(d, user.sessionCap, user.priorityGroups || []));
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
    weeks.push({ weekIndex: i + 1, weekType, days: prescribed.map((d) => ({ dayType: d.dayType, exercises: d.exercises.map(({ muscleTarget, slotId, optional, ...rest }) => rest) })) });
  }
  return { weeks };
}

function enforceHardPlanRules(weeks, discipline = null) {
  const sanitized = [];
  let filteredCount = 0;
  for (const week of Array.isArray(weeks) ? weeks : []) {
    const nextDays = [];
    for (const day of Array.isArray(week?.days) ? week.days : []) {
      const nextExercises = [];
      for (const ex of Array.isArray(day?.exercises) ? day.exercises : []) {
        if (isHardBannedExercise(ex)) {
          filteredCount += 1;
          continue;
        }
        if ((discipline === 'bodybuilding' || discipline === 'powerbuilding') && isCalisthenicsLikeExercise(ex)) {
          filteredCount += 1;
          continue;
        }
        nextExercises.push({
          ...ex,
          sets: Math.max(1, Math.min(BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(ex.sets) || 1))
        });
      }
      if (!nextExercises.length) {
        return {
          error: 'NO_ELIGIBLE_EXERCISE',
          slotId: `week_${week?.weekIndex || '?'}_day_${day?.dayType || '?'}`,
          reason: 'All exercises removed by hard safety rules.'
        };
      }
      nextDays.push({ ...day, exercises: nextExercises });
    }
    sanitized.push({ ...week, days: nextDays });
  }
  return { weeks: sanitized, filteredCount };
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

  const { targets, stressMultiplier } = computeWeeklyTargets(user);
  let schedule = buildSplit(user, user.daysPerWeek >= 5 && user.sessionLengthMin === '30');
  let weeksResult = buildWeeks(user.timeline === '4 weeks' ? 4 : 8, schedule, user, PREPROCESSED_CACHE, targets);

  if (weeksResult.error && user.daysPerWeek >= 5 && user.sessionLengthMin === '30') {
    schedule = buildSplit(user, true);
    weeksResult = buildWeeks(user.timeline === '4 weeks' ? 4 : 8, schedule, user, PREPROCESSED_CACHE, targets);
  }
  if (weeksResult.error) return weeksResult;
  const safeResult = enforceHardPlanRules(weeksResult.weeks, user.discipline);
  if (safeResult.error) return safeResult;

  return {
    meta: {
      version: '1.0',
      discipline: user.discipline,
      phase: user.phase,
      blockLength: user.timeline === '4 weeks' ? 4 : 8,
      daysPerWeek: user.daysPerWeek,
      sessionCap: user.sessionCap,
      allowedEquipment: user.allowedEquipment,
      priorityGroups: user.priorityGroups || [],
      stressMultiplier,
      notes: safeResult.filteredCount ? [`Filtered ${safeResult.filteredCount} banned exercise option(s).`] : []
    },
    schedule: schedule.map((s) => ({ day: s.day, dayType: s.dayType })),
    weeks: safeResult.weeks
  };
}

module.exports = {
  STYLE_ENUM,
  PATTERN_ENUM,
  normalizeEquipmentTags,
  preprocessExercises,
  normalizeUserInput,
  computeWeeklyTargets,
  buildSplit,
  buildWeekBlueprint,
  fillSlots,
  allocateSetsReps,
  applySessionCapTrimming,
  buildWeeks,
  buildOblueprintPlan
};
