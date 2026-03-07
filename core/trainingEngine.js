/*
POWERLIFTING ENGINE CONTRACT

- Main lift prescriptions come ONLY from intensity_type
- Block schemes do NOT override powerlifting prescriptions
- Frequency is resolved strictly by daysPerWeek
- Bench is always highest priority
- Deloads may be scheduled OR reactive
*/

const {
  selectExerciseIdsByIntent,
  getExerciseById,
  equipmentClass,
  mapMuscles,
  isValidForIntent,
  isBlacklistedEntry,
  isCalisthenicsLikeEntry,
  isStretchLikeEntry,
  isIsometricLikeEntry
} = require('./exerciseCatalog');
const BODYBUILDING_MAX_SETS_PER_EXERCISE = 4;

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeExperience(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'beginner' || v === 'novice') return 'beginner';
  if (v === 'intermediate') return 'intermediate';
  if (v === 'advanced') return 'advanced';
  return 'beginner';
}

const MUSCLE_KEYS = [
  'chest', 'lats', 'upperBack', 'deltsFront', 'deltsSide', 'deltsRear', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'abs'
];

const TARGET_MUSCLE_KEYS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'
];

const MUSCLE_KEY_TO_TARGET = {
  chest: 'chest',
  lats: 'back',
  upperBack: 'back',
  deltsFront: 'shoulders',
  deltsSide: 'shoulders',
  deltsRear: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  abs: 'abs'
};

const TARGET_TO_SLOT_MUSCLE = {
  chest: 'chest',
  back: 'lats',
  shoulders: 'deltsSide',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  abs: 'abs'
};

const EMPHASIS_TO_MUSCLES = {
  chest: [{ key: 'chest', w: 1 }],
  upperChest: [{ key: 'chest', w: 1 }],
  midChest: [{ key: 'chest', w: 1 }],
  back: [{ key: 'lats', w: 0.6 }, { key: 'upperBack', w: 0.4 }],
  shoulders: [{ key: 'deltsSide', w: 0.5 }, { key: 'deltsRear', w: 0.3 }, { key: 'deltsFront', w: 0.2 }],
  deltsSide: [{ key: 'deltsSide', w: 1 }],
  deltsRear: [{ key: 'deltsRear', w: 1 }],
  deltsFront: [{ key: 'deltsFront', w: 1 }],
  latsWidth: [{ key: 'lats', w: 1 }],
  upperBackThickness: [{ key: 'upperBack', w: 1 }],
  traps: [{ key: 'upperBack', w: 1 }],
  arms: [{ key: 'biceps', w: 0.5 }, { key: 'triceps', w: 0.5 }],
  biceps: [{ key: 'biceps', w: 1 }],
  triceps: [{ key: 'triceps', w: 1 }],
  forearms: [{ key: 'biceps', w: 1 }],
  legs: [{ key: 'quads', w: 0.4 }, { key: 'hamstrings', w: 0.3 }, { key: 'glutes', w: 0.3 }],
  quads: [{ key: 'quads', w: 1 }],
  hamstrings_glutes: [{ key: 'hamstrings', w: 0.55 }, { key: 'glutes', w: 0.45 }],
  hamstrings: [{ key: 'hamstrings', w: 1 }],
  glutes: [{ key: 'glutes', w: 1 }],
  calves: [{ key: 'calves', w: 1 }],
  abs: [{ key: 'abs', w: 1 }]
};

const INTENT_NEIGHBORS = {
  chest_press_horizontal_compound: ['chest_press_incline_compound', 'chest_press_horizontal_machine'],
  chest_press_incline_compound: ['chest_press_horizontal_compound', 'chest_fly_isolation'],
  lats_vertical_pull_compound: ['upperBack_horizontal_row_compound'],
  upperBack_horizontal_row_compound: ['lats_vertical_pull_compound'],
  quads_knee_dominant_compound: ['quads_knee_dominant_machine', 'hamstrings_hip_hinge_compound'],
  hamstrings_hip_hinge_compound: ['hamstrings_hip_hinge_machine', 'quads_knee_dominant_compound'],
  delts_overhead_press_compound: ['delts_side_isolation', 'chest_press_incline_compound'],
  biceps_curl_isolation: ['arms_superset_isolation'],
  triceps_extension_isolation: ['arms_superset_isolation'],
  calves_isolation: ['calves_isolation'],
  abs_isolation: ['abs_isolation']
};

const NOVELTY_NAME_PATTERNS = [
  /\bfrankenstein\b/i,
  /\bguillotine\b/i,
  /\bjammer\b/i,
  /\btwist\b/i,
  /\bwith a twist\b/i,
  /\bside[\s-]*to[\s-]*side\b/i,
  /\brocky\b/i,
  /\bwindmill\b/i,
  /\baround the world\b/i,
  /\bodd\b/i,
  /\bspecial\b/i,
  /\bone[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/i,
  /\bsingle[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/i,
  /\brear\s*delt\s*row\b/i,
  /\balternating\b.*\braise\b/i
];

const STRICT_DAY_REJECT_NAME_PATTERNS = [
  /\bpin\s*press(es)?\b/i,
  /\bfloor\b/i,
  /\blying\b/i,
  /\bsupine\b/i,
  /\bprone\b/i,
  /\bfrankenstein\b/i,
  /\baxle\b/i,
  /\blog\b/i,
  /\byoke\b/i,
  /\bstone\b/i,
  /\bfarmers?\b/i,
  /\bsandbag\b/i,
  /\bpush[\s-]*ups?\b/i,
  /\bpull[\s-]*ups?\b/i,
  /\bchin[\s-]*ups?\b/i,
  /\bmuscle[\s-]*ups?\b/i,
  /\bboard press\b/i,
  /\banti[-\s]*gravity press\b/i,
  /\btechnique\b/i,
  /\bneck\s*press\b/i,
  /\bspeed\b/i,
  /\bdynamic\s*effort\b/i,
  /\btempo\b/i,
  /\bpaused?\b/i,
  /\bdeadlift\b.*\bsingle\b/i,
  /\bsingle\b.*\bdeadlift\b/i,
  /\bkneeling\b(?!.*\b(crunch|ab|core|rollout)\b)/i,
  /\bone[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/i,
  /\bsingle[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/i,
  /\bone[-\s]*arm\b.*\bpull[\s-]*down\b/i,
  /\bsingle[-\s]*arm\b.*\bpull[\s-]*down\b/i,
  /\bone[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/i,
  /\bsingle[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/i,
  /\bsquat\s*with\s*plate\s*movers\b/i,
  /\bcalf\s*raise\s*on\s*a\s*dumbbell\b/i,
  /\bone[-\s]*arm\b.*\bshoulder\s*press\b/i,
  /\bsingle[-\s]*arm\b.*\bshoulder\s*press\b/i,
  /^(?!.*\b(lying|seated)\b).*\bhamstring\s*curls?\b/i,
  /^(?!.*\b(lying|seated)\b).*\bleg\s*curls?\b/i,
  /\bbosu\b/i,
  /\bbalance\s*board\b/i,
  /\bgironda\b/i,
  /\bsternum chin\b/i,
  /\bkneeling squat\b/i,
  /\boverhead squat\b/i,
  /\bbehind[-\s]*the[-\s]*neck\b/i,
  /\b(bench|press|curl|extension|squat|deadlift|row)\b.*\bto\b.*\b(bench|press|curl|extension|squat|deadlift|row)\b/i,
  /\bside[\s-]*to[\s-]*side\b/i,
  /\bwith a twist\b/i,
  /\brocky\b/i,
  /\bjammer\b/i
];

function normalizeEquipmentMajorityBucket(prefRaw) {
  const pref = String(prefRaw || '').trim().toLowerCase();
  if (!pref || pref === 'mix' || pref === 'balanced' || pref === 'balanced mix') return null;
  if (pref.includes('machine')) return 'machine';
  if (pref.includes('barbell') || pref.includes('dumbbell') || pref.includes('free')) return 'free';
  return null;
}

function equipmentBucketFromClass(eqClassRaw) {
  const eq = String(eqClassRaw || '').toLowerCase();
  if (eq === 'barbell' || eq === 'dumbbell') return 'free';
  if (eq === 'machine' || eq === 'cable') return 'machine';
  return 'other';
}

function bodybuildRole(ex) {
  const role = String(ex?.slotRole || '').toUpperCase();
  if (role === 'MAIN' || role === 'SECONDARY' || role === 'ISOLATION' || role === 'WEAKPOINT') return role;
  const stimulus = String(ex?.stimulusType || '').toLowerCase();
  if (stimulus === 'compound') return 'SECONDARY';
  return 'ISOLATION';
}

function maxSetsForBodybuildingExercise(ex, backPriority = false) {
  const role = bodybuildRole(ex);
  const baseCap = role === 'MAIN' ? 5 : 4;
  const nameNorm = String(ex?.name || '').toLowerCase();
  if (nameNorm.includes('pullover')) return Math.min(baseCap, backPriority ? 3 : 2);
  return baseCap;
}

function isolationFamilyKey(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  if (/(rear delt|reverse fly|reverse pec deck|face pull)/.test(n)) return 'rear_delt';
  if (/(fly|pec deck|crossover)/.test(n)) return 'chest_fly';
  if (/(lateral raise|side raise)/.test(n)) return 'lateral_raise';
  if (/(front.*raise|raise.*front)/.test(n)) return 'front_raise';
  if (/(curl)/.test(n)) return 'curl';
  if (/(triceps|pushdown|skull crusher|extension)/.test(n)) return 'triceps_extension';
  if (/(kickback|abduction|hip thrust|glute bridge)/.test(n)) return 'glute_iso';
  if (/(ab|crunch|rollout|leg raise)/.test(n)) return 'abs_iso';
  if (/(calf raise)/.test(n)) return 'calf_raise';
  return null;
}

function noveltyPenaltyForName(name) {
  const n = String(name || '');
  if (!n) return 0;
  return NOVELTY_NAME_PATTERNS.some((rx) => rx.test(n)) ? 0.4 : 0;
}

function isStapleForIntent(entry, intentKey) {
  const name = String(entry?.name || '').toLowerCase();
  const intent = String(intentKey || '').toLowerCase();
  if (!name) return false;
  if (intent.includes('chest_press')) {
    return /(bench press|incline press|dumbbell press|machine press|chest press)/.test(name);
  }
  if (intent.includes('row_compound')) {
    if (/(rear delt row)/.test(name)) return false;
    return /(chest supported row|cable row|dumbbell row|barbell row|machine row|t-?bar row|seal row)/.test(name);
  }
  if (intent.includes('vertical_pull')) {
    return /(pulldown|pull up|pull-up|chin up|chin-up)/.test(name)
      && !/(sternum|gironda|one[-\s]*arm|single[-\s]*arm)/.test(name);
  }
  if (intent.includes('knee_dominant')) {
    return /(squat|hack squat|leg press|split squat|lunge)/.test(name)
      && !/(kneeling|overhead|frankenstein|one leg|single leg|sissy)/.test(name);
  }
  if (intent.includes('hip_hinge')) {
    return /(deadlift|romanian deadlift|\brdl\b|hip hinge|hip thrust|glute bridge|good morning)/.test(name)
      && !/(hanging bar good morning)/.test(name);
  }
  if (intent.includes('overhead_press')) {
    return /(overhead press|dumbbell shoulder press|machine shoulder press|shoulder press)/.test(name);
  }
  if (intent.includes('delts_side_isolation')) return /(lateral raise)/.test(name);
  if (intent.includes('delts_rear_isolation')) return /(rear delt fly|face pull|reverse pec deck)/.test(name);
  return false;
}

function isMainWhitelistForIntent(entry, intentKey) {
  const name = String(entry?.name || '').toLowerCase();
  const intent = String(intentKey || '').toLowerCase();
  if (!name) return false;
  if (intent.includes('chest_press')) {
    return /(bench press|incline bench|incline press|dumbbell press|machine press|chest press)/.test(name)
      && !/(close[-\s]*grip.*to| to .*skull|to .*extension)/.test(name);
  }
  if (intent.includes('overhead_press')) {
    return /(seated dumbbell shoulder press|dumbbell shoulder press|machine shoulder press|landmine press|high incline press|seated dumbbell press|seated machine shoulder press)/.test(name)
      && !/(behind[-\s]*the[-\s]*neck)/.test(name);
  }
  return true;
}

function normalizeEmphasisKey(raw) {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!base) return null;
  const packed = base.replace(/\s+/g, '');
  const aliases = {
    shoulders: 'shoulders',
    shoulder: 'shoulders',
    delts: 'shoulders',
    deltsside: 'deltsSide',
    deltside: 'deltsSide',
    sidedelts: 'deltsSide',
    lateral: 'deltsSide',
    lateralraise: 'deltsSide',
    deltsrear: 'deltsRear',
    reardelts: 'deltsRear',
    deltsfront: 'deltsFront',
    frontdelts: 'deltsFront',
    chest: 'chest',
    upperchest: 'upperChest',
    midchest: 'midChest',
    back: 'back',
    lats: 'latsWidth',
    latswidth: 'latsWidth',
    upperback: 'upperBackThickness',
    upperbackthickness: 'upperBackThickness',
    traps: 'traps',
    arms: 'arms',
    biceps: 'biceps',
    triceps: 'triceps',
    forearms: 'forearms',
    legs: 'legs',
    glutes: 'glutes',
    hamstrings: 'hamstrings',
    quads: 'quads',
    calves: 'calves',
    abs: 'abs',
    core: 'abs'
  };
  return aliases[packed] || packed;
}

function normalizeEmphasisList(raw) {
  const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : []);
  const out = [];
  for (const x of list) {
    const v = normalizeEmphasisKey(x);
    if (!v || out.includes(v)) continue;
    out.push(v);
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}

function expandEmphasisSelections(picks) {
  const list = normalizeEmphasisList(Array.isArray(picks) ? picks : []);
  const out = [];
  for (const e of list) {
    if (e === 'shoulders') {
      ['deltsSide', 'deltsRear', 'deltsFront'].forEach((k) => { if (!out.includes(k)) out.push(k); });
      continue;
    }
    if (e === 'back') {
      ['lats', 'upperBack'].forEach((k) => { if (!out.includes(k)) out.push(k); });
      continue;
    }
    if (e === 'arms') {
      ['biceps', 'triceps'].forEach((k) => { if (!out.includes(k)) out.push(k); });
      continue;
    }
    if (e === 'legs') {
      ['quads', 'hamstrings', 'glutes'].forEach((k) => { if (!out.includes(k)) out.push(k); });
      continue;
    }
    const mapping = EMPHASIS_TO_MUSCLES[e] || [];
    if (!mapping.length && MUSCLE_KEYS.includes(e) && !out.includes(e)) {
      out.push(e);
      continue;
    }
    for (const part of mapping) if (!out.includes(part.key)) out.push(part.key);
  }
  return out;
}

function toTargetMuscleKey(raw) {
  const key = String(raw || '').trim();
  if (!key) return null;
  const mapped = MUSCLE_KEY_TO_TARGET[key] || key;
  return TARGET_MUSCLE_KEYS.includes(mapped) ? mapped : null;
}

function resolvePriorityTargetMuscles(emphasis) {
  const picks = normalizeEmphasisList(emphasis);
  const out = [];
  for (const e of picks) {
    const push = (k) => {
      const t = toTargetMuscleKey(k);
      if (t && !out.includes(t)) out.push(t);
    };
    if (e === 'shoulders' || e === 'deltsSide' || e === 'deltsRear' || e === 'deltsFront') {
      push('shoulders');
      continue;
    }
    if (e === 'back' || e === 'latsWidth' || e === 'upperBackThickness' || e === 'traps') {
      push('back');
      continue;
    }
    if (e === 'arms') {
      push('biceps');
      push('triceps');
      continue;
    }
    if (e === 'legs') {
      push('quads');
      push('hamstrings');
      push('glutes');
      continue;
    }
    const mapped = EMPHASIS_TO_MUSCLES[e] || [];
    if (mapped.length) {
      for (const part of mapped) push(part.key);
      continue;
    }
    push(e);
  }
  return out;
}

function initTargetTally(targets) {
  const keys = Object.keys(targets || {}).filter((k) => TARGET_MUSCLE_KEYS.includes(k));
  const out = {};
  for (const k of keys) out[k] = 0;
  return out;
}

function resolveEmphasisWeights(emphasis) {
  const picks = normalizeEmphasisList(emphasis);
  const weights = {};
  for (const key of MUSCLE_KEYS) weights[key] = 1;
  for (const e of picks) {
    const mapping = EMPHASIS_TO_MUSCLES[e];
    if (!mapping) continue;
    for (const part of mapping) {
      weights[part.key] = Math.max(weights[part.key] || 1, 1.2 + 0.2 * part.w);
    }
  }
  return weights;
}

function trainingAgeBand(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === '0_6') return '0_6';
  if (v === '6_18') return '6_18';
  if (v === '18_36') return '18_36';
  if (v === '3_5') return '3_5';
  if (v === '5_plus') return '5_plus';
  return '6_18';
}

function volumeTargetsForAge(band) {
  if (band === '0_6') return { min: 8, max: 12 };
  if (band === '6_18' || band === '18_36') return { min: 10, max: 16 };
  return { min: 12, max: 20 };
}

function timeToWseRange(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === '30_45') return { min: 30, max: 45 };
  if (v === '45_60') return { min: 45, max: 60 };
  if (v === '60_75') return { min: 60, max: 75 };
  if (v === '75_90') return { min: 75, max: 90 };
  if (v === '75_90_plus') return { min: 75, max: 90 };
  return { min: 45, max: 60 };
}

function mapTimeRangeToMinutes(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 45;
  if (/^\d+$/.test(v)) return clampInt(v, 20, 120, 45);
  if (v === '30_45') return 38;
  if (v === '45_60') return 53;
  if (v === '60_75') return 68;
  if (v === '75_90' || v === '75_90_plus' || v === '75+') return 83;
  return 45;
}

function computeStrengthSubTier({ bodyweight, bench1rm, squat1rm, deadlift1rm }) {
  const bw = Number(bodyweight);
  if (!Number.isFinite(bw) || bw <= 0) return { tier: 1, liftTiers: {}, flags: {} };

  const liftDefs = [
    { key: 'bench', value: bench1rm, thresholds: [1.0, 1.25, 1.5] },
    { key: 'squat', value: squat1rm, thresholds: [1.25, 1.75, 2.25] },
    { key: 'deadlift', value: deadlift1rm, thresholds: [1.5, 2.0, 2.5] }
  ];

  const tiers = [];
  const liftTiers = {};
  const flags = {};

  for (const def of liftDefs) {
    const val = Number(def.value);
    if (!Number.isFinite(val) || val <= 0) continue;
    const mult = val / bw;
    const [t1, t2, t3] = def.thresholds;
    if (mult > t3) flags[def.key] = 'possible_elite';
    const tier = mult < t1 ? 1 : mult < t2 ? 2 : 3;
    liftTiers[def.key] = tier;
    tiers.push(tier);
  }

  const avg = tiers.length ? Math.round(tiers.reduce((a, b) => a + b, 0) / tiers.length) : 1;
  return { tier: clampInt(avg, 1, 3, 1), liftTiers, flags };
}

function fallbackStrengthFromBodyweight(exp, bodyweight) {
  const bw = Number(bodyweight);
  if (!Number.isFinite(bw) || bw <= 0) return null;
  const tier = normalizeExperience(exp);
  const ratios = tier === 'advanced'
    ? { press: 0.8, leg: 1.3, hinge: 1.6, pull: 0.75 }
    : tier === 'intermediate'
      ? { press: 0.65, leg: 1.05, hinge: 1.25, pull: 0.6 }
      : { press: 0.5, leg: 0.85, hinge: 1.0, pull: 0.5 };
  return {
    press1rm: roundTo(bw * ratios.press, 5),
    leg1rm: roundTo(bw * ratios.leg, 5),
    hinge1rm: roundTo(bw * ratios.hinge, 5),
    pull1rm: roundTo(bw * ratios.pull, 5)
  };
}

function wseMultiplierForStimulus(stimulus) {
  return stimulus === 'compound' ? 1.25 : 1.0;
}

function intentAllowedByInjury(intentKey, injuryProfile) {
  const sev = injuryProfile && typeof injuryProfile === 'object' ? injuryProfile : {};
  const shoulder = Number(sev.shoulder || 0);
  const elbow = Number(sev.elbow || 0);
  const wrist = Number(sev.wrist || 0);
  const back = Number(sev.back || 0);
  const hip = Number(sev.hip || 0);
  const knee = Number(sev.knee || 0);
  const ankle = Number(sev.ankle || 0);

  if (shoulder >= 6 && (intentKey.includes('overhead') || intentKey.includes('dip'))) return false;
  if (elbow >= 6 && (intentKey.includes('triceps_extension') || intentKey.includes('biceps_curl'))) return false;
  if (wrist >= 6 && (intentKey.includes('curl') || intentKey.includes('press'))) return false;
  if (back >= 6 && (intentKey.includes('hinge') || intentKey.includes('row_compound'))) return false;
  if (hip >= 6 && intentKey.includes('hip')) return false;
  if (knee >= 6 && intentKey.includes('knee_dominant')) return false;
  if (ankle >= 6 && intentKey.includes('calves')) return false;
  return true;
}

function experienceRank(exp) {
  const e = normalizeExperience(exp);
  if (e === 'beginner') return 0;
  if (e === 'intermediate') return 1;
  return 2;
}

function meetsExperienceMin(exp, min) {
  return experienceRank(exp) >= experienceRank(min);
}

function normalizePowerliftingEventType(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'bench_only' || v === 'bench-only') return 'bench_only';
  if (v === 'full_power' || v === 'full-power') return 'full_power';
  return 'full_power';
}

function roundTo(value, increment) {
  const v = Number(value);
  const inc = Number(increment);
  if (!Number.isFinite(v)) return null;
  if (!Number.isFinite(inc) || inc <= 0) return Math.round(v);
  return Math.round(v / inc) * inc;
}

function normalizeNameForProjection(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBodybuildingExerciseName(rawName) {
  const raw = String(rawName || '').trim();
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

function pickBaselineValue(baselines, keys) {
  const src = baselines && typeof baselines === 'object' ? baselines : {};
  for (const key of keys) {
    const val = Number(src?.[key]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return null;
}

function nonLoadExercise(entry) {
  if (isStretchLikeEntry(entry)) return true;
  if (isIsometricLikeEntry(entry)) return true;
  const name = normalizeNameForProjection(entry?.name);
  const cat = normalizeNameForProjection(entry?.category);
  const mech = normalizeNameForProjection(entry?.mechanic);
  return /(stretch|mobility|warmup|activation|rehab|therapy|prehab|cooldown|cool down|release|smr)/.test(name)
    || /(stretch|mobility|warmup|activation|rehab|therapy|prehab|cooldown|cool down)/.test(cat)
    || /(stretch|mobility|warmup|activation|rehab|therapy|prehab|cooldown|cool down)/.test(mech);
}

function isoRatioByMuscle(key) {
  const ratios = {
    chest: 0.3,
    lats: 0.32,
    upperBack: 0.32,
    deltsFront: 0.2,
    deltsSide: 0.16,
    deltsRear: 0.16,
    biceps: 0.25,
    triceps: 0.25,
    quads: 0.35,
    hamstrings: 0.35,
    glutes: 0.4,
    calves: 0.45,
    abs: 0.2
  };
  return ratios[key] || 0.25;
}

function ratioForExercise({ movement, name, stimulus, muscleKeys, eqClass }) {
  const clean = normalizeNameForProjection(name);
  if (stimulus === 'isolation') {
    const keys = Array.isArray(muscleKeys) ? muscleKeys : [];
    const ratios = keys.map((k) => isoRatioByMuscle(k)).filter((r) => Number.isFinite(r));
    const base = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0.25;
    return base * (eqClass === 'cable' ? 0.85 : 1);
  }

  let ratio = 1;
  if (movement === 'press' || movement === 'ohp') {
    if (clean.includes('overhead') || clean.includes('military')) ratio = 0.65;
    else if (clean.includes('incline')) ratio = 0.9;
    else if (clean.includes('dip')) ratio = 0.8;
  } else if (movement === 'row' || movement === 'vertical_pull') {
    if (clean.includes('pulldown')) ratio = 0.7;
    else if (clean.includes('pull up') || clean.includes('chin up')) ratio = 0.8;
    else ratio = 0.9;
  } else if (movement === 'squat') {
    if (clean.includes('leg press')) ratio = 1.6;
    else if (clean.includes('hack')) ratio = 1.2;
    else if (clean.includes('split squat') || clean.includes('lunge')) ratio = 0.5;
  } else if (movement === 'hinge') {
    if (clean.includes('romanian') || clean.includes('rdl')) ratio = 0.75;
    else if (clean.includes('hip thrust')) ratio = 0.85;
    else if (clean.includes('good morning')) ratio = 0.6;
    else if (clean.includes('back extension')) ratio = 0.4;
  }

  const eqMult = eqClass === 'dumbbell'
    ? 0.85
    : eqClass === 'machine'
      ? 0.9
      : eqClass === 'cable'
        ? 0.75
        : eqClass === 'bodyweight'
          ? 0.6
          : 1;
  return ratio * eqMult;
}

function epley1rm(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r) || r <= 0) return w;
  return w * (1 + r / 30);
}

function normalizeWeekdayIndexList(input) {
  const raw = Array.isArray(input) ? input : [];
  const out = [];
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    const i = Math.max(0, Math.min(6, Math.floor(n)));
    if (!out.includes(i)) out.push(i);
  }
  return out;
}

function preferredWeekdayPattern(daysPerWeek) {
  const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (n === 2) return [1, 4];
  if (n === 3) return [1, 3, 5];
  if (n === 4) return [1, 2, 4, 5];
  if (n === 5) return [1, 2, 3, 4, 5];
  if (n === 6) return [1, 2, 3, 4, 5, 6];
  return [0, 1, 2, 3, 4, 5, 6];
}

function buildTrainingSchedule(daysPerWeek, unavailableDays, preferredDays) {
  const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
  const unavailable = new Set(normalizeWeekdayIndexList(unavailableDays));
  const preferred = normalizeWeekdayIndexList(preferredDays).filter((d) => !unavailable.has(d));
  const available = [1, 2, 3, 4, 5, 6, 0].filter((d) => !unavailable.has(d));
  if (!n) return [];
  if (available.length < n) return [];

  if (preferred.length) {
    const chosen = [];
    for (const d of preferred) {
      if (chosen.length >= n) break;
      if (!chosen.includes(d)) chosen.push(d);
    }
    for (const d of available) {
      if (chosen.length >= n) break;
      if (!chosen.includes(d)) chosen.push(d);
    }
    const weekdayOrder = new Map([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [0, 6]]);
    chosen.sort((a, b) => (weekdayOrder.get(a) ?? 99) - (weekdayOrder.get(b) ?? 99));
    return chosen.slice(0, n);
  }

  const pattern = preferredWeekdayPattern(n);
  const chosen = [];
  for (const d of pattern) {
    if (chosen.length >= n) break;
    if (!unavailable.has(d) && !chosen.includes(d)) chosen.push(d);
  }
  for (const d of available) {
    if (chosen.length >= n) break;
    if (!chosen.includes(d)) chosen.push(d);
  }
  const weekdayOrder = new Map([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [0, 6]]);
  chosen.sort((a, b) => (weekdayOrder.get(a) ?? 99) - (weekdayOrder.get(b) ?? 99));
  return chosen.slice(0, n);
}

function bodybuildingRules(experience) {
  const exp = normalizeExperience(experience);
  if (exp === 'beginner') {
    return {
      structure: ['3â€“4 training days/week', 'Simple Upper/Lower or PPL', 'Fixed weekly structure'],
      intensity: ['RPE cap â‰¤ 8', 'No failure training', 'No intensity techniques'],
      volume: ['2â€“3 working sets/exercise', '4â€“5 exercises/session'],
      progression: ['Hit top reps on all sets â†’ +2.5â€“5 lb next session', 'Otherwise keep load the same'],
      deload: ['Every 6â€“8 weeks', 'Volume âˆ’40% â€¢ Load âˆ’10% â€¢ RPE cap â‰¤ 7']
    };
  }
  return {
    structure: ['Asynchronous microcycle (6â€“10 days)', 'PPL + Arms/Weak points', 'Rest days autoregulated'],
    intensity: ['Most sets RPE 8â€“9', 'Main lifts final set RPE 9â€“10', 'Failure only on machines/isolations (final set)'],
    volume: ['2â€“4 working sets/exercise', '4â€“6 exercises/session', 'Max 1 intensity technique/exercise'],
    progression: ['If performance â†‘ and recovery good â†’ +1 rep OR +2.5â€“5 lb', 'If stall + recovery good â†’ +1 set OR adjust rep target', 'If performance â†“ or recovery poor â†’ reduce volume or load'],
    deload: ['Trigger: stall 2 exposures OR strength â†“ 2 sessions OR joint pain â†‘ OR RPE harder at same load', 'Deload 1 microcycle: Volume âˆ’40â€“50% â€¢ Load âˆ’10â€“15% â€¢ RPE cap â‰¤ 7']
  };
}

function exerciseSubstitutions({ discipline, baseId }) {
  const d = String(discipline || '').toLowerCase();
  const b = String(baseId || '').toLowerCase();
  if (d === 'calisthenics') {
    const map = {
      push: ['Incline Push-up', 'Ring Push-up'],
      dip: ['Assisted Dips', 'Ring Dips'],
      pull: ['Band-Assisted Pull-up', 'Chin-up'],
      row: ['Ring Rows', 'Inverted Rows'],
      leg: ['Split Squat', 'Step-up'],
      hinge: ['Hip Hinge', 'Single-Leg RDL'],
      core: ['Dead Bug', 'Hollow Hold Regression'],
      endurance: ['Easy EMOM', 'Zone 2 (walk/bike)'],
      skill_handstand: ['Wall Handstand Hold', 'Pike Handstand Hold'],
      skill_muscle_up: ['Transition Drills', 'Chest-to-Bar Pull-up'],
      skill_l_sit: ['Tuck Sit', 'Compression Hold'],
      skill_front_lever: ['Tuck Lever', 'Scap Pulls']
    };
    return Array.isArray(map[b]) ? map[b] : [];
  }
  if (d !== 'bodybuilding') return [];

  const map = {
    press: ['Dumbbell Bench Press', 'Machine Chest Press'],
    press2: ['Incline Dumbbell Press', 'Machine Incline Press'],
    row: ['Chest-Supported Row', 'Seated Cable Row'],
    row2: ['Machine Row', 'One-Arm Dumbbell Row'],
    pull: ['Lat Pulldown', 'Assisted Pull-up'],
    pull2: ['Neutral-Grip Pulldown', 'Pull-ups'],
    leg: ['Leg Press', 'Hack Squat'],
    leg2: ['Leg Press', 'Goblet Squat'],
    leg3: ['Hack Squat', 'Bulgarian Split Squat'],
    hinge: ['Romanian Deadlift', 'Hip Hinge Machine'],
    ohp: ['Machine Shoulder Press', 'Dumbbell Shoulder Press'],
    delts: ['Cable Lateral Raise', 'Machine Lateral Raise'],
    rear: ['Cable Rear Delt Fly', 'Reverse Pec Deck'],
    bi: ['Dumbbell Curl', 'Cable Curl'],
    tri: ['Rope Pushdown', 'Machine Dip'],
    tri2: ['Overhead Cable Extension', 'Skull Crusher'],
    arms: ['Cable Curl', 'Rope Pushdown'],
    calf: ['Seated Calf Raise', 'Leg Press Calf Raise'],
    core: ['Machine Crunch', 'Weighted Cable Crunch'],
    core2: ['Hanging Knee Raise', 'Captainâ€™s Chair Raise']
  };

  return Array.isArray(map[b]) ? map[b] : [];
}

function lbs(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

function asDateIso(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function recencyFactor(dateIso) {
  const iso = asDateIso(dateIso);
  if (!iso) return 1;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return 1;
  const days = Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
  // <= 6w: no penalty. 3mo: small. 6mo: moderate. 1y+: aggressive.
  if (days <= 42) return 1.0;
  if (days <= 90) return 0.97;
  if (days <= 180) return 0.92;
  if (days <= 365) return 0.85;
  if (days <= 730) return 0.80;
  return 0.75;
}

function pctOfTrainingMax(trainingMax, pct, increment) {
  const tm = Number(trainingMax);
  const p = Number(pct);
  if (!Number.isFinite(tm) || tm <= 0) return null;
  if (!Number.isFinite(p) || p <= 0) return null;
  return roundTo(tm * p, increment);
}

function experienceDefaults(exp) {
  const e = normalizeExperience(exp);
  if (e === 'advanced') return { mainIncUpper: 2.5, mainIncLower: 5 };
  if (e === 'intermediate') return { mainIncUpper: 2.5, mainIncLower: 5 };
  return { mainIncUpper: 2.5, mainIncLower: 5 };
}

function weekProgressionPattern(discipline, experience) {
  const exp = normalizeExperience(experience);
  if (discipline === 'powerlifting') {
    // 8-week block with two deloads. Load ramps are applied per intensity type (see prescribing()).
    const ramp = exp === 'advanced'
      ? [0.00, 0.01, 0.02, -0.06, 0.01, 0.02, 0.03, -0.05]
      : exp === 'intermediate'
        ? [0.00, 0.01, 0.02, -0.06, 0.01, 0.02, 0.03, -0.05]
        : [0.00, 0.01, 0.02, -0.06, 0.01, 0.02, 0.03, -0.05];

    const deloadWeeks = new Set([4, 8]);
    return ramp.map((delta, i) => {
      const w = i + 1;
      return {
        label: `Week ${w}`,
        pl: { delta, deload: deloadWeeks.has(w) }
      };
    });
  }

  if (discipline === 'bodybuilding') {
    // Progression is driven by the autoreg engine (applyLogAdjustments), not a fixed 4-week deload.
    // Provide a longer runway of normal weeks; deload weeks are marked in plan.meta.autoreg.deloadWeeks.
    const weeks = [];
    const total = 12;
    for (let i = 1; i <= total; i += 1) {
      const phase = (i - 1) % 3;
      weeks.push({ label: `Week ${i}`, repBias: phase === 0 ? 'base' : 'plus' });
    }
    return weeks;
  }

  return [
    { label: 'Week 1', repBias: 'base' },
    { label: 'Week 2', repBias: 'plus' },
    { label: 'Week 3', repBias: 'plus' },
    { label: 'Week 4', repBias: 'deload' }
  ];
}

function parseRepRange(rawReps) {
  const s = String(rawReps || '').trim().toLowerCase();
  const m = s.match(/(\d+)\s*-\s*(\d+)/);
  if (m) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo && hi <= 50) return { min: lo, max: hi };
  }
  const n = s.match(/(\d+)/);
  if (n) {
    const v = Number(n[1]);
    if (Number.isFinite(v) && v > 0 && v <= 50) return { min: v, max: v };
  }
  return null;
}

function isLowerBaseId(baseId) {
  const b = String(baseId || '').toLowerCase();
  return b.startsWith('leg')
    || b.startsWith('hinge')
    || b.includes('squat')
    || b.includes('dead')
    || b.includes('quad')
    || b.includes('hamstring')
    || b.includes('glute')
    || b.includes('knee_dominant')
    || b.includes('hip_hinge');
}

function isArmBaseId(baseId) {
  const b = String(baseId || '').toLowerCase();
  return b.includes('biceps')
    || b.includes('triceps')
    || b.includes('curl')
    || b.includes('extension')
    || b.includes('pushdown')
    || b.includes('skull')
    || b.includes('arm');
}

function isBackBaseId(baseId) {
  const b = String(baseId || '').toLowerCase();
  return b.includes('back')
    || b.includes('row')
    || b.includes('lats')
    || b.includes('lat')
    || b.includes('pull');
}

function isBadRepQuality(noteText) {
  const t = String(noteText || '').toLowerCase();
  return /(cheat|cheated|momentum|bounce|bounced|partial|half\s*reps?|short\s*rom|bad\s*form|ugly\s*reps?|eg[o0]\s*reps?)/.test(t);
}

function chooseDeloadPct() {
  // Deterministic mid-point defaults within required bands.
  return { loadMult: 0.88, setMult: 0.65 }; // load -12%, sets -35%
}

function midRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return Math.floor((min + max) / 2);
}

function chooseIncrementLb(exp, baseId, defaults, opts = {}) {
  const discipline = String(opts?.discipline || '').trim().toLowerCase();
  const elite = Boolean(opts?.elite);
  if (discipline === 'bodybuilding') {
    if (elite) return 5;
    if (isArmBaseId(baseId)) return 5;
    if (isLowerBaseId(baseId) || isBackBaseId(baseId)) return 10;
    return 5;
  }
  const isBeginner = normalizeExperience(exp) === 'beginner';
  if (isBeginner) return isLowerBaseId(baseId) ? 10 : 5;
  const inc = isLowerBaseId(baseId) ? defaults.mainIncLower : defaults.mainIncUpper;
  return Number.isFinite(inc) && inc > 0 ? inc : (isLowerBaseId(baseId) ? 5 : 2.5);
}

function resolvePowerliftingFrequencies(daysPerWeek) {
  const d = clampInt(daysPerWeek, 2, 6, 4);
  if (d === 3) return { bench: 3, squat: 2, deadlift: 1 };
  if (d === 4) return { bench: 4, squat: 3, deadlift: 1 };
  if (d === 5) return { bench: 4, squat: 3, deadlift: 2 };
  return { bench: 4, squat: 3, deadlift: 2 };
}

function fatigueCostToPoints(cost) {
  const c = String(cost || '').trim().toLowerCase();
  if (c === 'low') return 1;
  if (c === 'medium') return 2;
  if (c === 'high') return 3;
  return 2;
}

function pickDeterministic(list, keyFn) {
  const items = Array.isArray(list) ? list.slice() : [];
  items.sort((a, b) => String(keyFn(a) || '').localeCompare(String(keyFn(b) || ''), 'en'));
  return items[0] || null;
}

function buildPowerliftingTemplate(daysPerWeek) {
  const d = clampInt(daysPerWeek, 2, 6, 3);
  if (d === 2) {
    return [
      {
        label: 'Day 1',
        focus: 'Squat + Bench',
        exercises: [
          { baseId: 'squat', name: 'Back Squat', kind: 'main_lower' },
          { baseId: 'bench', name: 'Bench Press', kind: 'main_upper' },
          { baseId: 'row', name: 'Chest-Supported Row', kind: 'assist_upper' },
          { baseId: 'core', name: 'Plank', kind: 'assist_core' }
        ]
      },
      {
        label: 'Day 2',
        focus: 'Deadlift + Press',
        exercises: [
          { baseId: 'deadlift', name: 'Deadlift', kind: 'main_lower' },
          { baseId: 'bench_var', name: 'Close-Grip Bench Press', kind: 'main_upper' },
          { baseId: 'ohp', name: 'Overhead Press', kind: 'assist_upper' },
          { baseId: 'pull', name: 'Lat Pulldown / Pull-ups', kind: 'assist_upper' }
        ]
      }
    ];
  }
  if (d === 3) {
    return [
      {
        label: 'Day 1',
        focus: 'Squat + Bench',
        exercises: [
          { baseId: 'squat', name: 'Back Squat', kind: 'main_lower' },
          { baseId: 'bench', name: 'Bench Press', kind: 'main_upper' },
          { baseId: 'row', name: 'Row', kind: 'assist_upper' },
          { baseId: 'ham', name: 'Romanian Deadlift', kind: 'assist_lower' }
        ]
      },
      {
        label: 'Day 2',
        focus: 'Deadlift + Press',
        exercises: [
          { baseId: 'deadlift', name: 'Deadlift', kind: 'main_lower' },
          { baseId: 'ohp', name: 'Overhead Press', kind: 'main_upper' },
          { baseId: 'pull', name: 'Pull-ups / Pulldown', kind: 'assist_upper' },
          { baseId: 'core', name: 'Hanging Knee Raise', kind: 'assist_core' }
        ]
      },
      {
        label: 'Day 3',
        focus: 'Bench + Squat Variant',
        exercises: [
          { baseId: 'bench_vol', name: 'Bench Press (Volume)', kind: 'main_upper' },
          { baseId: 'squat_var', name: 'Paused Squat', kind: 'assist_lower' },
          { baseId: 'tri', name: 'Triceps Pressdown', kind: 'assist_upper' },
          { baseId: 'rear', name: 'Rear Delt Fly', kind: 'assist_upper' }
        ]
      }
    ];
  }
  if (d === 4) {
    return [
      {
        label: 'Day 1',
        focus: 'Squat (Heavy)',
        exercises: [
          { baseId: 'squat', name: 'Back Squat', kind: 'main_lower' },
          { baseId: 'bench_light', name: 'Bench Press (Technique)', kind: 'assist_upper' },
          { baseId: 'ham', name: 'Romanian Deadlift', kind: 'assist_lower' },
          { baseId: 'core', name: 'Cable Crunch', kind: 'assist_core' }
        ]
      },
      {
        label: 'Day 2',
        focus: 'Bench (Heavy)',
        exercises: [
          { baseId: 'bench', name: 'Bench Press', kind: 'main_upper' },
          { baseId: 'row', name: 'Row', kind: 'assist_upper' },
          { baseId: 'ohp', name: 'Overhead Press', kind: 'assist_upper' },
          { baseId: 'bi', name: 'Biceps Curl', kind: 'assist_upper' }
        ]
      },
      {
        label: 'Day 3',
        focus: 'Deadlift (Heavy)',
        exercises: [
          { baseId: 'deadlift', name: 'Deadlift', kind: 'main_lower' },
          { baseId: 'squat_var', name: 'Front Squat', kind: 'assist_lower' },
          { baseId: 'pull', name: 'Lat Pulldown / Pull-ups', kind: 'assist_upper' },
          { baseId: 'glute', name: 'Back Extension', kind: 'assist_lower' }
        ]
      },
      {
        label: 'Day 4',
        focus: 'Bench (Volume) + Squat (Volume)',
        exercises: [
          { baseId: 'bench_vol', name: 'Bench Press (Volume)', kind: 'main_upper' },
          { baseId: 'squat_vol', name: 'Back Squat (Volume)', kind: 'main_lower' },
          { baseId: 'tri', name: 'Triceps Extension', kind: 'assist_upper' },
          { baseId: 'delts', name: 'Lateral Raise', kind: 'assist_upper' }
        ]
      }
    ];
  }
  const template = [
    {
      label: 'Day 1',
      focus: 'Squat (Heavy)',
      exercises: [
        { baseId: 'squat', name: 'Back Squat', kind: 'main_lower' },
        { baseId: 'bench_light', name: 'Bench Press (Technique)', kind: 'assist_upper' },
        { baseId: 'ham', name: 'Romanian Deadlift', kind: 'assist_lower' },
        { baseId: 'core', name: 'Plank', kind: 'assist_core' }
      ]
    },
    {
      label: 'Day 2',
      focus: 'Bench (Heavy)',
      exercises: [
        { baseId: 'bench', name: 'Bench Press', kind: 'main_upper' },
        { baseId: 'row', name: 'Row', kind: 'assist_upper' },
        { baseId: 'tri', name: 'Triceps Pressdown', kind: 'assist_upper' },
        { baseId: 'rear', name: 'Rear Delt Fly', kind: 'assist_upper' }
      ]
    },
    {
      label: 'Day 3',
      focus: 'Deadlift (Heavy)',
      exercises: [
        { baseId: 'deadlift', name: 'Deadlift', kind: 'main_lower' },
        { baseId: 'squat_var', name: 'Front Squat', kind: 'assist_lower' },
        { baseId: 'pull', name: 'Pulldown / Pull-ups', kind: 'assist_upper' },
        { baseId: 'glute', name: 'Hip Thrust', kind: 'assist_lower' }
      ]
    },
    {
      label: 'Day 4',
      focus: 'Bench (Volume)',
      exercises: [
        { baseId: 'bench_vol', name: 'Bench Press (Volume)', kind: 'main_upper' },
        { baseId: 'ohp', name: 'Overhead Press', kind: 'assist_upper' },
        { baseId: 'row2', name: 'Cable Row', kind: 'assist_upper' },
        { baseId: 'bi', name: 'Biceps Curl', kind: 'assist_upper' }
      ]
    },
    {
      label: 'Day 5',
      focus: 'Squat (Volume)',
      exercises: [
        { baseId: 'squat_vol', name: 'Back Squat (Volume)', kind: 'main_lower' },
        { baseId: 'dead_var', name: 'Paused Deadlift', kind: 'assist_lower' },
        { baseId: 'leg', name: 'Leg Curl', kind: 'assist_lower' },
        { baseId: 'calf', name: 'Calf Raise', kind: 'assist_lower' }
      ]
    },
    {
      label: 'Day 6',
      focus: 'Hypertrophy Upper',
      exercises: [
        { baseId: 'press', name: 'Incline Dumbbell Press', kind: 'assist_upper' },
        { baseId: 'pull3', name: 'Lat Pulldown', kind: 'assist_upper' },
        { baseId: 'delts', name: 'Lateral Raise', kind: 'assist_upper' },
        { baseId: 'tri2', name: 'Overhead Triceps Extension', kind: 'assist_upper' }
      ]
    }
  ];
  return template.slice(0, d);
}

function buildBodybuildingTemplate(daysPerWeek) {
  const d = clampInt(daysPerWeek, 2, 6, 4);
  const makeSlot = (slotId, intentKey, movementPattern, stimulusType, muscleKeys, foundationFlag, allowedEquipmentClass = ['any'], slotRole = null) => {
    const role = slotRole
      || (stimulusType === 'compound'
        ? (foundationFlag ? 'MAIN' : 'SECONDARY')
        : 'ISOLATION');
    return {
      slotId,
      intentKey,
      movementPattern,
      stimulusType,
      muscleKeys,
      foundationFlag,
      allowedEquipmentClass,
      slotRole: role
    };
  };

  const pushDay = {
    label: 'Day 1',
    focus: 'Push',
    exercises: [
      makeSlot('bb-d1-s1', 'chest_press_horizontal_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['barbell', 'dumbbell', 'machine', 'cable']),
      makeSlot('bb-d1-s2', 'chest_press_incline_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['dumbbell', 'barbell', 'machine']),
      makeSlot('bb-d1-s3', 'delts_side_isolation', 'isolation', 'isolation', ['deltsSide'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d1-s4', 'triceps_extension_isolation', 'isolation', 'isolation', ['triceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d1-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const pullDay = {
    label: 'Day 2',
    focus: 'Pull',
    exercises: [
      makeSlot('bb-d2-s1', 'lats_vertical_pull_compound', 'vertical_pull', 'compound', ['lats', 'biceps'], true, ['cable', 'machine']),
      makeSlot('bb-d2-s2', 'upperBack_horizontal_row_compound', 'row', 'compound', ['upperBack', 'lats'], true, ['machine', 'cable', 'dumbbell', 'barbell']),
      makeSlot('bb-d2-s3', 'delts_rear_isolation', 'isolation', 'isolation', ['deltsRear'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d2-s4', 'biceps_curl_isolation', 'isolation', 'isolation', ['biceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d2-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const legsDay = {
    label: 'Day 3',
    focus: 'Legs',
    exercises: [
      makeSlot('bb-d3-s1', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-d3-s2', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-d3-s3', 'calves_isolation', 'isolation', 'isolation', ['calves'], false, ['machine', 'dumbbell']),
      makeSlot('bb-d3-s4', 'abs_isolation', 'core', 'isolation', ['abs'], false, ['cable', 'machine']),
      makeSlot('bb-d3-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const fullBodyA = {
    label: 'Day 1',
    focus: 'Full body',
    exercises: [
      makeSlot('bb-fb1-s1', 'chest_press_horizontal_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-fb1-s2', 'upperBack_horizontal_row_compound', 'row', 'compound', ['upperBack', 'lats'], true, ['machine', 'cable', 'dumbbell', 'barbell']),
      makeSlot('bb-fb1-s3', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-fb1-s4', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-fb1-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const fullBodyB = {
    label: 'Day 2',
    focus: 'Full body',
    exercises: [
      makeSlot('bb-fb2-s1', 'chest_press_incline_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-fb2-s2', 'lats_vertical_pull_compound', 'vertical_pull', 'compound', ['lats', 'biceps'], true, ['cable', 'machine']),
      makeSlot('bb-fb2-s3', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-fb2-s4', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-fb2-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const fullBodyC = {
    label: 'Day 3',
    focus: 'Full body',
    exercises: [
      makeSlot('bb-fb3-s1', 'delts_overhead_press_compound', 'ohp', 'compound', ['deltsFront', 'triceps'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-fb3-s2', 'upperBack_horizontal_row_compound', 'row', 'compound', ['upperBack', 'lats'], true, ['machine', 'cable', 'dumbbell', 'barbell']),
      makeSlot('bb-fb3-s3', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-fb3-s4', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-fb3-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const upperA = {
    label: 'Day 1',
    focus: 'Upper',
    exercises: [
      makeSlot('bb-u1-s1', 'chest_press_horizontal_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['barbell', 'dumbbell', 'machine', 'cable']),
      makeSlot('bb-u1-s2', 'upperBack_horizontal_row_compound', 'row', 'compound', ['upperBack', 'lats'], true, ['machine', 'cable', 'dumbbell', 'barbell']),
      makeSlot('bb-u1-s3', 'delts_side_isolation', 'isolation', 'isolation', ['deltsSide'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-u1-s4', 'biceps_curl_isolation', 'isolation', 'isolation', ['biceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-u1-s5', 'triceps_extension_isolation', 'isolation', 'isolation', ['triceps'], false, ['cable', 'machine', 'dumbbell'])
    ]
  };

  const upperB = {
    label: 'Day 3',
    focus: 'Upper',
    exercises: [
      makeSlot('bb-u2-s1', 'chest_press_incline_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['dumbbell', 'barbell', 'machine']),
      makeSlot('bb-u2-s2', 'lats_vertical_pull_compound', 'vertical_pull', 'compound', ['lats', 'biceps'], true, ['cable', 'machine']),
      makeSlot('bb-u2-s3', 'delts_rear_isolation', 'isolation', 'isolation', ['deltsRear'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-u2-s4', 'arms_superset_isolation', 'isolation', 'isolation', ['biceps', 'triceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-u2-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const lowerA = {
    label: 'Day 2',
    focus: 'Lower',
    exercises: [
      makeSlot('bb-l1-s1', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-l1-s2', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-l1-s3', 'calves_isolation', 'isolation', 'isolation', ['calves'], false, ['machine', 'dumbbell']),
      makeSlot('bb-l1-s4', 'abs_isolation', 'core', 'isolation', ['abs'], false, ['cable', 'machine']),
      makeSlot('bb-l1-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const lowerB = {
    label: 'Day 4',
    focus: 'Lower',
    exercises: [
      makeSlot('bb-l2-s1', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-l2-s2', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-l2-s3', 'calves_isolation', 'isolation', 'isolation', ['calves'], false, ['machine', 'dumbbell']),
      makeSlot('bb-l2-s4', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT'),
      makeSlot('bb-l2-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const weakpointUpper = {
    label: 'Day 4',
    focus: 'Weakpoint',
    exercises: [
      makeSlot('bb-w1-s1', 'chest_press_incline_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['dumbbell', 'barbell', 'machine']),
      makeSlot('bb-w1-s2', 'lats_vertical_pull_compound', 'vertical_pull', 'compound', ['lats', 'biceps'], true, ['cable', 'machine']),
      makeSlot('bb-w1-s3', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT'),
      makeSlot('bb-w1-s4', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT'),
      makeSlot('bb-w1-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const weakpointLower = {
    label: 'Day 5',
    focus: 'Weakpoint',
    exercises: [
      makeSlot('bb-w2-s1', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-w2-s2', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-w2-s3', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT'),
      makeSlot('bb-w2-s4', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT'),
      makeSlot('bb-w2-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const bodypartA = {
    label: 'Day 1',
    focus: 'Chest + Tris',
    exercises: [
      makeSlot('bb-bp1-s1', 'chest_press_horizontal_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['barbell', 'dumbbell', 'machine', 'cable']),
      makeSlot('bb-bp1-s2', 'chest_press_incline_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], false, ['dumbbell', 'barbell', 'machine']),
      makeSlot('bb-bp1-s3', 'triceps_extension_isolation', 'isolation', 'isolation', ['triceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-bp1-s4', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT'),
      makeSlot('bb-bp1-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const bodypartB = {
    label: 'Day 2',
    focus: 'Back + Biceps',
    exercises: [
      makeSlot('bb-bp2-s1', 'lats_vertical_pull_compound', 'vertical_pull', 'compound', ['lats', 'biceps'], true, ['cable', 'machine']),
      makeSlot('bb-bp2-s2', 'upperBack_horizontal_row_compound', 'row', 'compound', ['upperBack', 'lats'], true, ['machine', 'cable', 'dumbbell', 'barbell']),
      makeSlot('bb-bp2-s3', 'biceps_curl_isolation', 'isolation', 'isolation', ['biceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-bp2-s4', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT'),
      makeSlot('bb-bp2-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const bodypartC = {
    label: 'Day 3',
    focus: 'Legs',
    exercises: [
      makeSlot('bb-bp3-s1', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-bp3-s2', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-bp3-s3', 'calves_isolation', 'isolation', 'isolation', ['calves'], false, ['machine', 'dumbbell']),
      makeSlot('bb-bp3-s4', 'abs_isolation', 'core', 'isolation', ['abs'], false, ['cable', 'machine']),
      makeSlot('bb-bp3-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  const bodypartD = {
    label: 'Day 4',
    focus: 'Delts + Arms',
    exercises: [
      makeSlot('bb-bp4-s1', 'delts_overhead_press_compound', 'ohp', 'compound', ['deltsFront', 'triceps'], true, ['dumbbell', 'machine', 'barbell']),
      makeSlot('bb-bp4-s2', 'delts_side_isolation', 'isolation', 'isolation', ['deltsSide'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-bp4-s3', 'delts_rear_isolation', 'isolation', 'isolation', ['deltsRear'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-bp4-s4', 'biceps_curl_isolation', 'isolation', 'isolation', ['biceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-bp4-s5', 'triceps_extension_isolation', 'isolation', 'isolation', ['triceps'], false, ['cable', 'machine', 'dumbbell'])
    ]
  };

  const bodypartE = {
    label: 'Day 5',
    focus: 'Upper',
    exercises: [
      makeSlot('bb-bp5-s1', 'chest_press_horizontal_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['barbell', 'dumbbell', 'machine', 'cable']),
      makeSlot('bb-bp5-s2', 'upperBack_horizontal_row_compound', 'row', 'compound', ['upperBack', 'lats'], true, ['machine', 'cable', 'dumbbell', 'barbell']),
      makeSlot('bb-bp5-s3', 'lats_vertical_pull_compound', 'vertical_pull', 'compound', ['lats', 'biceps'], false, ['cable', 'machine']),
      makeSlot('bb-bp5-s4', 'chest_fly_isolation', 'isolation', 'isolation', ['chest'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-bp5-s5', 'delts_rear_isolation', 'isolation', 'isolation', ['deltsRear'], false, ['cable', 'machine', 'dumbbell'])
    ]
  };

  const bodypartF = {
    label: 'Day 6',
    focus: 'Legs',
    exercises: [
      makeSlot('bb-bp6-s1', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-bp6-s2', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-bp6-s3', 'calves_isolation', 'isolation', 'isolation', ['calves'], false, ['machine', 'dumbbell']),
      makeSlot('bb-bp6-s4', 'abs_isolation', 'core', 'isolation', ['abs'], false, ['cable', 'machine']),
      makeSlot('bb-bp6-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'], 'WEAKPOINT')
    ]
  };

  if (d === 2) return [upperA, lowerA];
  if (d === 3) return [fullBodyA, fullBodyB, fullBodyC];
  if (d === 4) return [upperA, lowerA, upperB, lowerB];
  if (d === 5) return [pushDay, pullDay, legsDay, weakpointUpper, weakpointLower];
  if (d === 6) return [bodypartA, bodypartB, bodypartC, bodypartD, bodypartE, bodypartF];
  return [pushDay, pullDay, legsDay].slice(0, d);
}

const INTENT_DEFS = {
  chest_press_horizontal_compound: { searchHint: 'bench press', stimulusType: 'compound' },
  chest_press_incline_compound: { searchHint: 'incline press', stimulusType: 'compound' },
  chest_fly_isolation: { searchHint: 'chest fly', stimulusType: 'isolation' },
  lats_vertical_pull_compound: { searchHint: 'lat pulldown pull-up', stimulusType: 'compound' },
  upperBack_horizontal_row_compound: { searchHint: 'row', stimulusType: 'compound' },
  delts_overhead_press_compound: { searchHint: 'overhead press', stimulusType: 'compound' },
  delts_side_isolation: { searchHint: 'lateral raise', stimulusType: 'isolation' },
  delts_rear_isolation: { searchHint: 'rear delt fly', stimulusType: 'isolation' },
  biceps_curl_isolation: { searchHint: 'biceps curl', stimulusType: 'isolation' },
  triceps_extension_isolation: { searchHint: 'triceps extension pushdown', stimulusType: 'isolation' },
  quads_knee_dominant_compound: { searchHint: 'squat leg press', stimulusType: 'compound' },
  hamstrings_hip_hinge_compound: { searchHint: 'romanian deadlift hip hinge', stimulusType: 'compound' },
  calves_isolation: { searchHint: 'calf raise', stimulusType: 'isolation' },
  abs_isolation: { searchHint: 'ab crunch', stimulusType: 'isolation' },
  glutes_isolation: { searchHint: 'glute kickback hip abduction', stimulusType: 'isolation' },
  arms_superset_isolation: { searchHint: 'biceps curl triceps extension', stimulusType: 'isolation' },
  accessory_flex: { searchHint: 'cable curl lateral raise', stimulusType: 'isolation' }
};

const INTENT_MOVEMENT_OVERRIDES = {
  chest_press_horizontal_compound: 'press',
  chest_press_incline_compound: 'press',
  delts_overhead_press_compound: 'ohp',
  lats_vertical_pull_compound: 'vertical_pull',
  upperBack_horizontal_row_compound: 'row',
  quads_knee_dominant_compound: 'squat',
  hamstrings_hip_hinge_compound: 'hinge'
};

function getBaselineWeeklySetsByTier(experienceTier, experienceSubTier) {
  const tier = normalizeExperience(experienceTier);
  const subTier = clampInt(experienceSubTier, 1, 3, 1);
  const range = tier === 'advanced'
    ? [18, 22]
    : tier === 'intermediate'
      ? [14, 18]
      : [10, 14];
  if (subTier <= 1) return range[0];
  if (subTier >= 3) return range[1];
  return Math.round((range[0] + range[1]) / 2);
}

function resolvePriorityMuscles(emphasis) {
  const picks = normalizeEmphasisList(emphasis);
  return expandEmphasisSelections(picks);
}

function computeVolumeTargets({ experienceTier, experienceSubTier, emphasis, timePerSession, daysPerWeek }) {
  const tier = normalizeExperience(experienceTier);
  const subTier = clampInt(experienceSubTier, 1, 3, 1);
  const priorityTargets = resolvePriorityTargetMuscles(emphasis);
  const prioritySet = new Set(priorityTargets);
  const sessionMin = mapTimeRangeToMinutes(timePerSession);
  const days = clampInt(daysPerWeek, 2, 7, 4);
  const recoveryStrong = sessionMin >= 60 && days >= 5;

  const basePriority = tier === 'advanced' ? 16 : tier === 'intermediate' ? 14 : 12;
  const baseSupport = tier === 'advanced' ? 9 : tier === 'intermediate' ? 8 : 7;
  const baseMaintenance = tier === 'advanced' ? 5 : 4;
  const subTierBoost = subTier >= 3 ? 1 : subTier <= 1 ? 0 : 0.5;

  const priorityAim = clampInt(Math.round(basePriority + subTierBoost + (recoveryStrong ? 1 : 0)), 10, 20, 14);
  const supportAim = clampInt(Math.round(baseSupport + (subTier >= 3 ? 1 : 0)), 6, 10, 8);
  const maintenanceAim = clampInt(Math.round(baseMaintenance), 2, 6, 4);

  const targets = {};
  for (const k of TARGET_MUSCLE_KEYS) targets[k] = maintenanceAim;

  // Keep large movers at support by default; these carry most growth in bodybuilding phases.
  for (const k of ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes']) {
    targets[k] = Math.max(targets[k], supportAim);
  }

  // If a region is priority, elevate that whole muscle target (not per-head quotas).
  for (const k of priorityTargets) {
    targets[k] = priorityAim;
  }

  // Synergy support: big pressing/pulling/lower priorities pull supporting muscles up to support range.
  if (prioritySet.has('back')) targets.biceps = Math.max(targets.biceps, supportAim);
  if (prioritySet.has('chest') || prioritySet.has('shoulders')) targets.triceps = Math.max(targets.triceps, supportAim);
  if (prioritySet.has('quads') || prioritySet.has('glutes') || prioritySet.has('hamstrings')) {
    targets.hamstrings = Math.max(targets.hamstrings, supportAim);
    targets.glutes = Math.max(targets.glutes, supportAim);
  }

  return {
    targets,
    targetKeys: TARGET_MUSCLE_KEYS.slice(),
    ranges: {
      priority: [10, 20],
      support: [6, 10],
      maintenance: [2, 6]
    },
    aims: {
      priority: priorityAim,
      support: supportAim,
      maintenance: maintenanceAim
    },
    priorityTargets
  };
}

function wseBudgetForPlan({ timePerSession, daysPerWeek }) {
  const perSession = mapTimeRangeToMinutes(timePerSession);
  const perWeek = perSession * Math.max(1, Number(daysPerWeek || 0));
  return { perSession, perWeek };
}

function estimateExerciseMinutes(ex) {
  const sets = Number(ex?.sets) || 0;
  if (sets <= 0) return 0;
  const restSec = Number(ex?.restSec) || 0;
  const stimulus = String(ex?.stimulusType || '').toLowerCase();
  const workSetMin = stimulus === 'compound' ? 0.85 : 0.6;
  const restMin = Math.max(0, sets - 1) * (restSec / 60);
  const transitionMin = 0.6;
  return (sets * workSetMin) + restMin + transitionMin;
}

function estimateDayMinutes(day) {
  let total = 0;
  for (const ex of day?.exercises || []) total += estimateExerciseMinutes(ex);
  return total;
}

function computeWseForWeek(week) {
  let totalMinutes = 0;
  for (const day of week.days || []) totalMinutes += estimateDayMinutes(day);
  return totalMinutes;
}

function patternFlagsForExercise(ex) {
  const stimulus = String(ex?.stimulusType || '').toLowerCase();
  if (stimulus !== 'compound' && stimulus !== 'isolation') return {};
  const movement = String(ex?.movementPattern || '').toLowerCase();
  const intent = String(ex?.intentKey || '').toLowerCase();
  const muscleKeys = Array.isArray(ex?.muscleKeys) ? ex.muscleKeys : [];
  const isCompound = stimulus === 'compound';
  return {
    horizontalPush: isCompound && (movement === 'press' || intent.includes('chest_press')) && !intent.includes('overhead'),
    verticalPush: isCompound && (movement === 'ohp' || intent.includes('overhead')),
    horizontalPull: isCompound && (movement === 'row' || intent.includes('row_compound')),
    verticalPull: isCompound && movement === 'vertical_pull',
    hinge: isCompound && (movement === 'hinge' || intent.includes('hip_hinge')),
    knee: isCompound && (movement === 'squat' || intent.includes('knee_dominant')),
    rearUpperBack: muscleKeys.includes('deltsRear') || muscleKeys.includes('upperBack') || intent.includes('delts_rear')
  };
}

function computePatternTotals(week) {
  const totals = {
    horizontalPush: 0,
    horizontalPull: 0,
    verticalPush: 0,
    verticalPull: 0,
    hinge: 0,
    knee: 0,
    rearUpperBack: 0
  };
  for (const day of week.days || []) {
    for (const ex of day.exercises || []) {
      const sets = Number(ex.sets) || 0;
      if (sets <= 0) continue;
      const flags = patternFlagsForExercise(ex);
      Object.entries(flags).forEach(([key, on]) => {
        if (on) totals[key] += sets;
      });
    }
  }
  return totals;
}

function computeGuardrailDeficits(patternTotals) {
  const minHinge = 7;
  const minKnee = 7;
  const minRearUpperBack = 5;
  const horizRatio = 1.05;
  const vertRatio = 1.0;

  const horizTarget = Math.ceil((patternTotals.horizontalPush || 0) * horizRatio);
  const vertTarget = Math.ceil((patternTotals.verticalPush || 0) * vertRatio);

  return {
    horizontalPull: Math.max(0, horizTarget - (patternTotals.horizontalPull || 0)),
    verticalPull: Math.max(0, vertTarget - (patternTotals.verticalPull || 0)),
    hinge: Math.max(0, minHinge - (patternTotals.hinge || 0)),
    knee: Math.max(0, minKnee - (patternTotals.knee || 0)),
    rearUpperBack: Math.max(0, minRearUpperBack - (patternTotals.rearUpperBack || 0))
  };
}

function mapMuscleNamesToKeys(list) {
  const src = Array.isArray(list) ? list : [];
  const out = new Set();
  for (const raw of src) {
    const m = String(raw || '').toLowerCase();
    if (/(chest|pec|clavicular|stern(al)?|upper chest|mid chest|lower chest)/.test(m)) out.add('chest');
    if (/(lats|latissimus|lower lats|upper lats|lat width)/.test(m)) out.add('lats');
    if (/(upper back|middle back|mid back|back thickness|rhomboid|trap|trapezius|infraspinatus|teres)/.test(m)) out.add('upperBack');
    if (/(front delt|anterior delt|front deltoid|anterior deltoid)/.test(m)) out.add('deltsFront');
    if (/(side delt|lateral delt|middle delt|medial delt|side deltoid|lateral deltoid)/.test(m)) out.add('deltsSide');
    if (/(rear delt|posterior delt|rear deltoid|posterior deltoid)/.test(m)) out.add('deltsRear');
    if (/(bicep|brachialis|brachioradialis)/.test(m)) out.add('biceps');
    if (/(tricep|triceps|long head triceps|lateral head triceps|medial head triceps)/.test(m)) out.add('triceps');
    if (/(quadricep|quad|vastus|rectus femoris)/.test(m)) out.add('quads');
    if (/(hamstring|biceps femoris|semitendinosus|semimembranosus)/.test(m)) out.add('hamstrings');
    if (/(glute|glute max|glute med|glute min|gluteus)/.test(m)) out.add('glutes');
    if (/(calf|gastrocnemius|soleus|tibialis)/.test(m)) out.add('calves');
    if (/(abdom|abs|oblique|core|transverse abdominis|rectus abdominis)/.test(m)) out.add('abs');
  }
  return Array.from(out);
}

function primaryMuscleKeysForExercise(ex) {
  const entry = ex?.exerciseId ? getExerciseById(ex.exerciseId) : null;
  if (entry?.name) {
    const nameNorm = String(entry.name || '').toLowerCase();
    if (nameNorm.includes('pullover')) {
      return ['lats', 'upperBack'];
    }
  }
  const primary = entry?.primaryMuscles ? mapMuscleNamesToKeys(entry.primaryMuscles) : [];
  if (primary.length) return primary;
  const subFirst = entry?.subMuscleGroups ? mapMuscleNamesToKeys(entry.subMuscleGroups) : [];
  if (subFirst.length) return [subFirst[0]];
  const keys = Array.isArray(ex?.muscleKeys) ? ex.muscleKeys : [];
  return keys.length ? [keys[0]] : [];
}

function secondaryMuscleKeysForExercise(ex) {
  const entry = ex?.exerciseId ? getExerciseById(ex.exerciseId) : null;
  if (!entry) return [];
  const targetRegion = entry?.targetRegion ? [entry.targetRegion] : [];
  const fromSecondary = Array.isArray(entry?.secondaryMuscles) ? entry.secondaryMuscles : [];
  const fromSubMuscles = Array.isArray(entry?.subMuscleGroups) ? entry.subMuscleGroups : [];
  return mapMuscleNamesToKeys([...fromSecondary, ...fromSubMuscles, ...targetRegion]);
}

function countSetsByMuscle(ex, sets) {
  const out = {};
  const s = Number(sets) || 0;
  if (!s) return out;
  const primary = primaryMuscleKeysForExercise(ex);
  const secondary = secondaryMuscleKeysForExercise(ex).filter((k) => !primary.includes(k));
  for (const k of primary) out[k] = (out[k] || 0) + s;
  for (const k of secondary) out[k] = (out[k] || 0) + (s * 0.5);
  return out;
}

function primaryTargetMusclesForExercise(ex) {
  const out = new Set();
  for (const key of primaryMuscleKeysForExercise(ex)) {
    const mapped = toTargetMuscleKey(key);
    if (mapped) out.add(mapped);
  }
  return Array.from(out);
}

function secondaryTargetMusclesForExercise(ex) {
  const primary = new Set(primaryTargetMusclesForExercise(ex));
  const out = new Set();
  for (const key of secondaryMuscleKeysForExercise(ex)) {
    const mapped = toTargetMuscleKey(key);
    if (mapped && !primary.has(mapped)) out.add(mapped);
  }
  return Array.from(out);
}

function countDirectSetsByTarget(ex, sets) {
  const out = {};
  const s = Number(sets) || 0;
  if (!s) return out;
  for (const k of primaryTargetMusclesForExercise(ex)) {
    out[k] = (out[k] || 0) + s;
  }
  return out;
}

function countEffectiveSetsByTarget(ex, sets) {
  const out = countDirectSetsByTarget(ex, sets);
  const s = Number(sets) || 0;
  if (!s) return out;
  for (const k of secondaryTargetMusclesForExercise(ex)) {
    out[k] = (out[k] || 0) + (s * 0.5);
  }

  // Conservative overlap heuristics when secondary flags are sparse.
  const stimulus = String(ex?.stimulusType || '').toLowerCase();
  const movement = String(ex?.movementPattern || '').toLowerCase();
  const prim = new Set(primaryTargetMusclesForExercise(ex));
  if (stimulus === 'compound') {
    if ((movement === 'vertical_pull' || movement === 'row') && !prim.has('biceps')) {
      out.biceps = (out.biceps || 0) + (s * 0.35);
    }
    if ((movement === 'press' || movement === 'ohp') && !prim.has('triceps')) {
      out.triceps = (out.triceps || 0) + (s * 0.35);
    }
  }
  return out;
}

function tuneSetsForWeek({ week, targets, wseBudgetWeek, wseBudgetSession, priorityMuscles }) {
  const prioritySet = new Set(Array.isArray(priorityMuscles) ? priorityMuscles : []);
  const priorityTargetSet = new Set(Array.from(prioritySet).map((k) => toTargetMuscleKey(k)).filter(Boolean));
  const backPriority = prioritySet.has('lats') || prioritySet.has('upperBack') || priorityTargetSet.has('back');
  const targetKeys = Object.keys(targets || {}).filter((k) => TARGET_MUSCLE_KEYS.includes(k));
  const capFor = (ex) => maxSetsForBodybuildingExercise(ex, backPriority);
  const minFor = () => 1;
  if (!targetKeys.length) return;

  const calcByMuscle = () => {
    const direct = {};
    const effective = {};
    for (const m of targetKeys) {
      direct[m] = 0;
      effective[m] = 0;
    }
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        const sets = Number(ex.sets) || 0;
        const directContrib = countDirectSetsByTarget(ex, sets);
        const effectiveContrib = countEffectiveSetsByTarget(ex, sets);
        for (const [k, v] of Object.entries(directContrib)) if (direct[k] != null) direct[k] += v;
        for (const [k, v] of Object.entries(effectiveContrib)) if (effective[k] != null) effective[k] += v;
      }
    }
    return { direct, effective };
  };

  const adjustedDirectTarget = (k, directTotals, effectiveTotals) => {
    const base = Number(targets?.[k] || 0);
    const overlap = Math.max(0, Number(effectiveTotals?.[k] || 0) - Number(directTotals?.[k] || 0));
    if (priorityTargetSet.has(k)) return base;
    if (base >= 6) {
      return Math.max(6, Math.round(base - (overlap * 0.45)));
    }
    return Math.max(2, Math.round(base - (overlap * 0.7)));
  };

  let totals = calcByMuscle();
  let directTotals = totals.direct;
  let effectiveTotals = totals.effective;
  let patterns = computePatternTotals(week);
  let wse = computeWseForWeek(week);

  const deficitScore = (ex, guardrailDeficits) => {
    const keys = primaryTargetMusclesForExercise(ex);
    let score = 0;
    for (const k of keys) {
      const target = adjustedDirectTarget(k, directTotals, effectiveTotals);
      const cur = directTotals[k] || 0;
      if (target > cur) score += (target - cur);
    }
    const flags = patternFlagsForExercise(ex);
    if (flags.horizontalPull) score += guardrailDeficits.horizontalPull * 1.2;
    if (flags.verticalPull) score += guardrailDeficits.verticalPull * 1.2;
    if (flags.hinge) score += guardrailDeficits.hinge * 1.1;
    if (flags.knee) score += guardrailDeficits.knee * 1.1;
    if (flags.rearUpperBack) score += guardrailDeficits.rearUpperBack * 1.1;
    return score;
  };

  // Add sets to fill deficits within WSE budget.
  for (let iter = 0; iter < 200; iter += 1) {
    if (wse >= wseBudgetWeek) break;
    const guardrailDeficits = computeGuardrailDeficits(patterns);
    let best = null;
    let bestScore = 0;
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        if (ex.blockType === 'superset') continue;
        const cap = capFor(ex);
        if ((Number(ex.sets) || 0) >= cap) continue;
        const score = deficitScore(ex, guardrailDeficits);
        if (score > bestScore) {
          bestScore = score;
          best = ex;
        }
      }
    }
    if (!best || bestScore <= 0) break;
    best.sets = (Number(best.sets) || 0) + 1;
    totals = calcByMuscle();
    directTotals = totals.direct;
    effectiveTotals = totals.effective;
    patterns = computePatternTotals(week);
    wse = computeWseForWeek(week);
  }

  const canReduceForGuardrails = (ex) => {
    const flags = patternFlagsForExercise(ex);
    if (!Object.values(flags).some(Boolean)) return true;
    const next = { ...patterns };
    const sets = Number(ex.sets) || 0;
    if (flags.horizontalPull) next.horizontalPull = Math.max(0, next.horizontalPull - 1);
    if (flags.verticalPull) next.verticalPull = Math.max(0, next.verticalPull - 1);
    if (flags.hinge) next.hinge = Math.max(0, next.hinge - 1);
    if (flags.knee) next.knee = Math.max(0, next.knee - 1);
    if (flags.rearUpperBack) next.rearUpperBack = Math.max(0, next.rearUpperBack - 1);
    if (flags.horizontalPush) next.horizontalPush = Math.max(0, next.horizontalPush - 1);
    if (flags.verticalPush) next.verticalPush = Math.max(0, next.verticalPush - 1);

    const currentDeficits = computeGuardrailDeficits(patterns);
    const nextDeficits = computeGuardrailDeficits(next);
    if (sets <= 1) return false;
    return !Object.keys(nextDeficits).some((k) => nextDeficits[k] > currentDeficits[k]);
  };

  const reduceSet = (ex) => {
    ex.sets = Math.max(minFor(), (Number(ex.sets) || 0) - 1);
    totals = calcByMuscle();
    directTotals = totals.direct;
    effectiveTotals = totals.effective;
    patterns = computePatternTotals(week);
    wse = computeWseForWeek(week);
  };

  // Reduce if over budget (prioritize non-priority isolation first).
  for (let iter = 0; iter < 240; iter += 1) {
    if (wse <= wseBudgetWeek) break;
    let candidate = null;
    let candidateScore = -Infinity;
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        if (ex.blockType === 'superset') continue;
        if ((Number(ex.sets) || 0) <= minFor()) continue;
        if (!canReduceForGuardrails(ex)) continue;
        const keys = primaryTargetMusclesForExercise(ex);
        const isPriority = keys.some((k) => priorityTargetSet.has(k));
        const stimulus = String(ex.stimulusType || '').toLowerCase();
        const hasBuffer = keys.some((k) => adjustedDirectTarget(k, directTotals, effectiveTotals) < (directTotals[k] || 0));
        const score = (isPriority ? -2 : 2)
          + (stimulus === 'isolation' ? 2 : 0)
          + (hasBuffer ? 1 : -1);
        if (score > candidateScore) {
          candidateScore = score;
          candidate = ex;
        }
      }
    }
    if (!candidate) break;
    reduceSet(candidate);
  }

  if (Number.isFinite(wseBudgetSession)) {
    const softCap = Number(wseBudgetSession) + 5;
    for (const day of week.days || []) {
      let dayMinutes = estimateDayMinutes(day);
      let guard = 0;
      while (dayMinutes > softCap && guard < 120) {
        guard += 1;
        let candidate = null;
        let candidateScore = -Infinity;
        for (const ex of day.exercises || []) {
          if (ex.blockType === 'superset') continue;
          if ((Number(ex.sets) || 0) <= minFor()) continue;
          if (!canReduceForGuardrails(ex)) continue;
          const keys = primaryTargetMusclesForExercise(ex);
          const isPriority = keys.some((k) => priorityTargetSet.has(k));
          const stimulus = String(ex.stimulusType || '').toLowerCase();
          const hasBuffer = keys.some((k) => adjustedDirectTarget(k, directTotals, effectiveTotals) < (directTotals[k] || 0));
          const score = (isPriority ? -2 : 2)
            + (stimulus === 'isolation' ? 2 : 0)
            + (hasBuffer ? 1 : -1);
          if (score > candidateScore) {
            candidateScore = score;
            candidate = ex;
          }
        }
        if (!candidate) break;
        reduceSet(candidate);
        dayMinutes = estimateDayMinutes(day);
      }
    }
  }

  for (const day of week.days || []) {
    for (const ex of day.exercises || []) {
      const cap = capFor(ex);
      if ((Number(ex.sets) || 0) > cap) ex.sets = cap;
    }
  }
}

function finalizeBodybuildingWeek({ week, targets, wseBudgetSession, priorityMuscles, warnings }) {
  const priorityList = Array.isArray(priorityMuscles) ? priorityMuscles : [];
  const prioritySet = new Set(priorityList);
  const priorityTargetSet = new Set(priorityList.map((k) => toTargetMuscleKey(k)).filter(Boolean));
  const topPriorityTarget = Array.from(priorityTargetSet)[0] || null;
  const backPriority = prioritySet.has('lats') || prioritySet.has('upperBack') || priorityTargetSet.has('back');
  const targetKeys = Object.keys(targets || {}).filter((k) => TARGET_MUSCLE_KEYS.includes(k));
  const capFor = (ex) => maxSetsForBodybuildingExercise(ex, backPriority);
  const minFor = () => 1;
  const softCap = Number.isFinite(wseBudgetSession) ? Number(wseBudgetSession) + 5 : null;
  const warningList = Array.isArray(warnings) ? warnings : [];
  if (!targetKeys.length) return;

  const calcTotals = () => {
    const direct = {};
    const effective = {};
    for (const m of targetKeys) {
      direct[m] = 0;
      effective[m] = 0;
    }
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        const sets = Number(ex.sets) || 0;
        const directContrib = countDirectSetsByTarget(ex, sets);
        const effectiveContrib = countEffectiveSetsByTarget(ex, sets);
        for (const [k, v] of Object.entries(directContrib)) if (direct[k] != null) direct[k] += v;
        for (const [k, v] of Object.entries(effectiveContrib)) if (effective[k] != null) effective[k] += v;
      }
    }
    return { direct, effective };
  };

  const adjustedDirectTarget = (k, directTotals, effectiveTotals) => {
    const base = Number(targets?.[k] || 0);
    const overlap = Math.max(0, Number(effectiveTotals?.[k] || 0) - Number(directTotals?.[k] || 0));
    if (priorityTargetSet.has(k)) return base;
    if (base >= 6) return Math.max(6, Math.round(base - (overlap * 0.45)));
    return Math.max(2, Math.round(base - (overlap * 0.7)));
  };

  const canReduceForGuardrails = (ex, patterns) => {
    const flags = patternFlagsForExercise(ex);
    if (!Object.values(flags).some(Boolean)) return true;
    const next = { ...patterns };
    const sets = Number(ex.sets) || 0;
    if (flags.horizontalPull) next.horizontalPull = Math.max(0, next.horizontalPull - 1);
    if (flags.verticalPull) next.verticalPull = Math.max(0, next.verticalPull - 1);
    if (flags.hinge) next.hinge = Math.max(0, next.hinge - 1);
    if (flags.knee) next.knee = Math.max(0, next.knee - 1);
    if (flags.rearUpperBack) next.rearUpperBack = Math.max(0, next.rearUpperBack - 1);
    if (flags.horizontalPush) next.horizontalPush = Math.max(0, next.horizontalPush - 1);
    if (flags.verticalPush) next.verticalPush = Math.max(0, next.verticalPush - 1);

    const currentDeficits = computeGuardrailDeficits(patterns);
    const nextDeficits = computeGuardrailDeficits(next);
    if (sets <= 1) return false;
    return !Object.keys(nextDeficits).some((k) => nextDeficits[k] > currentDeficits[k]);
  };

  const reduceSet = (ex) => {
    ex.sets = Math.max(minFor(), (Number(ex.sets) || 0) - 1);
  };

  const addSet = (ex) => {
    ex.sets = (Number(ex.sets) || 0) + 1;
  };

  const dayWithinBudget = (day) => {
    if (!Number.isFinite(softCap)) return true;
    return estimateDayMinutes(day) <= softCap;
  };

  const tryAddSetToExercise = (day, ex) => {
    if ((Number(ex.sets) || 0) >= capFor(ex)) return false;
    addSet(ex);
    if (!dayWithinBudget(day)) {
      reduceSet(ex);
      return false;
    }
    return true;
  };

  const tryAddSetForMuscle = (muscleKey) => {
    let best = null;
    let bestDay = null;
    let bestScore = -Infinity;
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        if (ex.blockType === 'superset') continue;
        const keys = primaryTargetMusclesForExercise(ex);
        if (!keys.includes(muscleKey)) continue;
        if ((Number(ex.sets) || 0) >= capFor(ex)) continue;
        const stimulus = String(ex.stimulusType || '').toLowerCase();
        const role = String(ex.slotRole || '').toUpperCase();
        let score = 0;
        if (stimulus === 'isolation') score += 2;
        if (role === 'WEAKPOINT') score += 2;
        if (role === 'MAIN') score -= 1;
        score += Number(ex.sets || 0) * -0.1;
        if (score > bestScore) {
          bestScore = score;
          best = ex;
          bestDay = day;
        }
      }
    }
    if (!best || !bestDay) return false;
    return tryAddSetToExercise(bestDay, best);
  };

  const tryAddSetForGuardrail = (flagKey) => {
    let best = null;
    let bestDay = null;
    let bestScore = -Infinity;
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        if (ex.blockType === 'superset') continue;
        const flags = patternFlagsForExercise(ex);
        if (!flags[flagKey]) continue;
        if ((Number(ex.sets) || 0) >= capFor(ex)) continue;
        const stimulus = String(ex.stimulusType || '').toLowerCase();
        let score = 0;
        if (stimulus === 'compound') score += 2;
        score += Number(ex.sets || 0) * -0.1;
        if (score > bestScore) {
          bestScore = score;
          best = ex;
          bestDay = day;
        }
      }
    }
    if (!best || !bestDay) return false;
    return tryAddSetToExercise(bestDay, best);
  };

  const enforceDayBudgets = () => {
    if (!Number.isFinite(softCap)) return;
    let guard = 0;
    for (const day of week.days || []) {
      let dayMinutes = estimateDayMinutes(day);
      while (dayMinutes > softCap && guard < 200) {
        guard += 1;
        const patterns = computePatternTotals(week);
        let candidate = null;
        let bestSets = -Infinity;
        const tryPick = (predicate) => {
          for (const ex of day.exercises || []) {
            if (ex.blockType === 'superset') continue;
            if ((Number(ex.sets) || 0) <= minFor()) continue;
            if (!canReduceForGuardrails(ex, patterns)) continue;
            if (!predicate(ex)) continue;
            const sets = Number(ex.sets) || 0;
            if (sets > bestSets) {
              bestSets = sets;
              candidate = ex;
            }
          }
          return candidate;
        };

        const isPriority = (ex) => primaryTargetMusclesForExercise(ex).some((k) => priorityTargetSet.has(k));
        const isCore = (ex) => primaryTargetMusclesForExercise(ex).includes('abs');
        const isIso = (ex) => String(ex.stimulusType || '').toLowerCase() === 'isolation';

        if (!tryPick((ex) => isCore(ex) && !priorityTargetSet.has('abs'))) {
          if (!tryPick((ex) => !isPriority(ex) && isIso(ex))) {
            if (!tryPick((ex) => !isPriority(ex))) {
              tryPick((ex) => isPriority(ex));
            }
          }
        }

        if (!candidate) break;
        reduceSet(candidate);
        dayMinutes = estimateDayMinutes(day);
      }
    }
  };

  // Cap core volume if core is not a priority.
  let totals = calcTotals();
  let directTotals = totals.direct;
  let effectiveTotals = totals.effective;
  if (!priorityTargetSet.has('abs') && Number(directTotals.abs || 0) > 8) {
    let guard = 0;
    while (Number(directTotals.abs || 0) > 8 && guard < 120) {
      guard += 1;
      const patterns = computePatternTotals(week);
      let reduced = false;
      for (const day of week.days || []) {
        for (const ex of day.exercises || []) {
          if (ex.blockType === 'superset') continue;
          if ((Number(ex.sets) || 0) <= minFor()) continue;
          if (!primaryTargetMusclesForExercise(ex).includes('abs')) continue;
          if (!canReduceForGuardrails(ex, patterns)) continue;
          reduceSet(ex);
          reduced = true;
          break;
        }
        if (reduced) break;
      }
      totals = calcTotals();
      directTotals = totals.direct;
      effectiveTotals = totals.effective;
      if (!reduced) break;
    }
  }

  // Fill muscle deficits (priority first).
  totals = calcTotals();
  directTotals = totals.direct;
  effectiveTotals = totals.effective;
  const deficits = () => {
    const out = {};
    for (const m of targetKeys) {
      const t = adjustedDirectTarget(m, directTotals, effectiveTotals);
      const cur = Number(directTotals?.[m] || 0);
      if (t > cur) out[m] = t - cur;
    }
    return out;
  };

  const muscleOrder = [
    ...Array.from(priorityTargetSet),
    ...targetKeys.filter((m) => !priorityTargetSet.has(m))
  ];

  let guard = 0;
  let deficitMap = deficits();
  while (Object.keys(deficitMap).length && guard < 240) {
    guard += 1;
    let progress = false;
    for (const m of muscleOrder) {
      if (!deficitMap[m]) continue;
      if (tryAddSetForMuscle(m)) {
        progress = true;
        totals = calcTotals();
        directTotals = totals.direct;
        effectiveTotals = totals.effective;
        deficitMap = deficits();
      }
    }
    if (!progress) break;
    enforceDayBudgets();
    totals = calcTotals();
    directTotals = totals.direct;
    effectiveTotals = totals.effective;
    deficitMap = deficits();
  }

  // Enforce guardrails after quota attempts.
  let patternTotals = computePatternTotals(week);
  let guardrailDeficits = computeGuardrailDeficits(patternTotals);
  guard = 0;
  while (Object.values(guardrailDeficits).some((v) => v > 0) && guard < 160) {
    guard += 1;
    let progress = false;
    for (const key of Object.keys(guardrailDeficits)) {
      if (guardrailDeficits[key] <= 0) continue;
      if (tryAddSetForGuardrail(key)) {
        progress = true;
        patternTotals = computePatternTotals(week);
        guardrailDeficits = computeGuardrailDeficits(patternTotals);
      }
    }
    if (!progress) break;
    enforceDayBudgets();
    patternTotals = computePatternTotals(week);
    guardrailDeficits = computeGuardrailDeficits(patternTotals);
  }

  // Final time enforcement.
  enforceDayBudgets();
  for (const day of week.days || []) {
    for (const ex of day.exercises || []) {
      const cap = capFor(ex);
      if ((Number(ex.sets) || 0) > cap) ex.sets = cap;
    }
  }

  const enforcePerSessionMuscleCap = () => {
    const allowTopPriority10 = Number.isFinite(Number(wseBudgetSession)) && Number(wseBudgetSession) >= 75 && !!topPriorityTarget;
    const capForMuscle = (muscle) => (allowTopPriority10 && muscle === topPriorityTarget ? 10 : 8);
    let guard = 0;
    for (const day of week.days || []) {
      let dayTotals = {};
      const calcDayTotals = () => {
        const totals = {};
        for (const m of targetKeys) totals[m] = 0;
        for (const ex of day.exercises || []) {
          const sets = Number(ex.sets) || 0;
          const contrib = countEffectiveSetsByTarget(ex, sets);
          for (const [k, v] of Object.entries(contrib)) totals[k] = (totals[k] || 0) + v;
        }
        return totals;
      };
      dayTotals = calcDayTotals();
      while (guard < 200) {
        guard += 1;
        const over = Object.entries(dayTotals).filter(([k, v]) => v > capForMuscle(k));
        if (!over.length) break;
        const [overKey] = over.sort((a, b) => b[1] - a[1])[0];
        const patterns = computePatternTotals(week);
        let candidate = null;
        let bestScore = -Infinity;
        for (const ex of day.exercises || []) {
          if ((Number(ex.sets) || 0) <= minFor()) continue;
          if (!canReduceForGuardrails(ex, patterns)) continue;
          const keys = primaryTargetMusclesForExercise(ex);
          if (!keys.includes(overKey)) continue;
          const isPriority = keys.some((k) => priorityTargetSet.has(k));
          const isIso = String(ex.stimulusType || '').toLowerCase() === 'isolation';
          const score = (isPriority ? 0 : 2) + (isIso ? 2 : 0) - (Number(ex.sets) || 0) * 0.1;
          if (score > bestScore) {
            bestScore = score;
            candidate = ex;
          }
        }
        if (!candidate) break;
        reduceSet(candidate);
        dayTotals = calcDayTotals();
      }
    }
  };

  enforcePerSessionMuscleCap();
  totals = calcTotals();
  directTotals = totals.direct;
  effectiveTotals = totals.effective;
  deficitMap = deficits();
  patternTotals = computePatternTotals(week);
  guardrailDeficits = computeGuardrailDeficits(patternTotals);

  if (Object.keys(deficitMap).length) {
    const topMissing = Object.entries(deficitMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} (-${Math.round(v)})`)
      .join(', ');
    warningList.push(`Could not fully hit weekly muscle targets: ${topMissing}.`);
  }
  if (Object.values(guardrailDeficits).some((v) => v > 0)) {
    warningList.push('Guardrail minimums could not be fully met within the session cap.');
  }
  if (Number.isFinite(softCap)) {
    const over = week.days.some((d) => estimateDayMinutes(d) > softCap);
    if (over) warningList.push('One or more days exceeded the session time cap after adjustments.');
  }
}

function assertBodybuildingPlanIntegrity({ weeks, priorityMuscles }) {
  const prioritySet = new Set(Array.isArray(priorityMuscles) ? priorityMuscles : []);
  const backPriority = prioritySet.has('lats') || prioritySet.has('upperBack');
  const capFor = (ex) => maxSetsForBodybuildingExercise(ex, backPriority);

  for (const week of weeks || []) {
    let pulloverCount = 0;
    let heavyDeadliftCount = 0;
    const rearDeltDays = new Set();
    const rearDeltDayCap = prioritySet.has('deltsRear') || prioritySet.has('deltsSide') ? 3 : 2;
    for (const day of week.days || []) {
      const dayKey = `${week?.index || '?'}:${String(day?.label || day?.focus || '').toLowerCase()}`;
      let hasRearDelt = false;
      for (const ex of day.exercises || []) {
        const entry = ex?.exerciseId ? getExerciseById(ex.exerciseId) : null;
        const entryLike = entry || { name: ex?.name || '', category: '', instructions: '' };
        if (isBlacklistedEntry(entryLike)) {
          throw new Error(`Banned exercise detected: ${entryLike?.name || ex?.name || ex?.intentKey}`);
        }
        const nameNorm = String(entryLike?.name || ex?.name || '').toLowerCase();
        if (STRICT_DAY_REJECT_NAME_PATTERNS.some((rx) => rx.test(nameNorm))) {
          throw new Error(`Rejected exercise detected: ${entryLike?.name || ex?.name || ex?.intentKey}`);
        }
        const sets = Number(ex?.sets) || 0;
        const cap = capFor(ex);
        if (Number.isFinite(sets) && sets > cap) {
          throw new Error(`Set cap violated: ${entryLike?.name || ex?.name || ex?.intentKey} (${sets} > ${cap})`);
        }
        if (/(deadlift|romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(nameNorm) && !/(hip thrust|glute bridge)/.test(nameNorm)) {
          heavyDeadliftCount += 1;
        }
        if (/(rear delt|reverse fly|face pull|reverse pec deck)/.test(nameNorm)) {
          hasRearDelt = true;
        }
        if (nameNorm.includes('pullover')) {
          pulloverCount += 1;
          const pulloverCap = backPriority ? 3 : 2;
          if (sets > pulloverCap) {
            throw new Error(`Pullover set cap violated: ${entryLike?.name || ex?.name || ex?.intentKey} (${sets} > ${pulloverCap})`);
          }
        }
      }
      if (hasRearDelt) rearDeltDays.add(dayKey);
    }
    if (!backPriority && pulloverCount > 1) {
      throw new Error(`Pullover frequency violated: ${pulloverCount} sessions in week ${week.index || '?'}`);
    }
    if (heavyDeadliftCount > 1) {
      throw new Error(`Heavy deadlift frequency violated: ${heavyDeadliftCount} sessions in week ${week.index || '?'}`);
    }
    if (rearDeltDays.size > rearDeltDayCap) {
      throw new Error(`Rear delt frequency violated: ${rearDeltDays.size} sessions in week ${week.index || '?'}`);
    }
  }
}

function chooseIntentForInjury(intentKey, injuryProfile) {
  if (intentAllowedByInjury(intentKey, injuryProfile)) return intentKey;
  const neighbors = INTENT_NEIGHBORS[intentKey] || [];
  for (const n of neighbors) {
    if (intentAllowedByInjury(n, injuryProfile)) return n;
  }
  return intentKey;
}

function signatureForSlot(movementPattern, muscleKeys, equipmentClassValue) {
  const keys = Array.isArray(muscleKeys) ? muscleKeys.slice().sort().join(',') : '';
  return `${movementPattern || ''}|${keys}|${equipmentClassValue || ''}`;
}

const PRIORITY_ISO_RULES = {
  deltsSide: { intent: 'delts_side_isolation', minSlots: 2, distinctDays: true, leadDays: 2 },
  deltsRear: { intent: 'delts_rear_isolation', minSlots: 2, distinctDays: true, leadDays: 1 },
  biceps: { intent: 'biceps_curl_isolation', minSlots: 2, distinctDays: true },
  triceps: { intent: 'triceps_extension_isolation', minSlots: 2, distinctDays: true },
  chest: { intent: 'chest_press_horizontal_compound', minSlots: 2, distinctDays: true, forceCompound: true },
  glutes: { intent: 'glutes_isolation', minSlots: 2, distinctDays: true },
  abs: { intent: 'abs_isolation', minSlots: 2, distinctDays: true },
  lats: { intent: 'lats_vertical_pull_compound', minSlots: 2, distinctDays: true, forceCompound: true },
  upperBack: { intent: 'upperBack_horizontal_row_compound', minSlots: 2, distinctDays: true, forceCompound: true }
};

const PRIORITY_ISO_INTENT_TO_MUSCLE = {
  delts_side_isolation: 'deltsSide',
  delts_rear_isolation: 'deltsRear',
  biceps_curl_isolation: 'biceps',
  triceps_extension_isolation: 'triceps',
  chest_press_horizontal_compound: 'chest',
  glutes_isolation: 'glutes',
  abs_isolation: 'abs',
  lats_vertical_pull_compound: 'lats',
  upperBack_horizontal_row_compound: 'upperBack'
};

function initPriorityIsoState(priorityMuscles) {
  const priorityList = Array.isArray(priorityMuscles) ? priorityMuscles : [];
  const set = new Set(priorityList);
  const rules = {};
  const counts = {};
  const days = {};
  const leadCounts = {};
  const leadDays = {};
  const keyOrder = [];
  for (const [key, rule] of Object.entries(PRIORITY_ISO_RULES)) {
    if (!set.has(key)) continue;
    rules[key] = rule;
    counts[key] = 0;
    days[key] = new Set();
    if (rule.leadDays) {
      leadCounts[key] = 0;
      leadDays[key] = new Set();
    }
  }
  for (const key of priorityList) {
    if (rules[key] && !keyOrder.includes(key)) keyOrder.push(key);
  }
  for (const key of Object.keys(rules)) {
    if (!keyOrder.includes(key)) keyOrder.push(key);
  }
  return { rules, counts, days, leadCounts, leadDays, keyOrder };
}

function recordPriorityIso(ex, dayKey, state) {
  if (!state || !ex?.intentKey) return;
  for (const [key, rule] of Object.entries(state.rules || {})) {
    if (ex.intentKey !== rule.intent) continue;
    if (rule.distinctDays) {
      if (state.days[key].has(dayKey)) return;
      state.days[key].add(dayKey);
    }
    state.counts[key] = (state.counts[key] || 0) + 1;
    return;
  }
}

function recordPriorityLead(ex, dayKey, state) {
  if (!state || !ex?.intentKey) return;
  for (const [key, rule] of Object.entries(state.rules || {})) {
    if (!rule.leadDays) continue;
    if (ex.intentKey !== rule.intent) continue;
    if (state.leadDays[key].has(dayKey)) return;
    state.leadDays[key].add(dayKey);
    state.leadCounts[key] = (state.leadCounts[key] || 0) + 1;
    return;
  }
}

function applyPriorityLeadPlacement(dayKey, exercises, state) {
  if (!state || !Array.isArray(exercises)) return;
  for (const [key, rule] of Object.entries(state.rules || {})) {
    if (!rule.leadDays) continue;
    if ((state.leadCounts?.[key] || 0) >= rule.leadDays) continue;
    if (state.leadDays?.[key]?.has(dayKey)) continue;
    const idx = exercises.findIndex((ex) => ex?.intentKey === rule.intent);
    if (idx < 0) continue;
    const targetIdx = exercises.length > 1 ? 1 : 0;
    if (idx === targetIdx) {
      if (idx >= 0) {
        exercises[idx].priorityLead = true;
        recordPriorityLead(exercises[idx], dayKey, state);
      }
      continue;
    }
    const [ex] = exercises.splice(idx, 1);
    ex.priorityLead = true;
    exercises.splice(targetIdx, 0, ex);
    recordPriorityLead(ex, dayKey, state);
  }
}

function organizeBodybuildingDayExercises(focus, exercises) {
  if (!Array.isArray(exercises) || exercises.length <= 1) return exercises;
  const dayType = dayTypeFromFocus(focus);
  const remaining = exercises.slice();
  const ordered = [];

  const exIntent = (ex) => String(ex?.intentKey || '').toLowerCase();
  const exMove = (ex) => String(ex?.movementPattern || '').toLowerCase();
  const exName = (ex) => String(ex?.name || '').toLowerCase();
  const isCompound = (ex) => {
    const stimulus = String(ex?.stimulusType || '').toLowerCase();
    if (stimulus === 'compound') return true;
    const intent = exIntent(ex);
    const move = exMove(ex);
    if (['press', 'ohp', 'row', 'vertical_pull', 'squat', 'hinge'].includes(move)) return true;
    if (/(chest_press|overhead_press|row_compound|vertical_pull|knee_dominant|hip_hinge)/.test(intent)) return true;
    const name = exName(ex);
    return /(bench|press|row|pulldown|pull[-\s]*up|deadlift|rdl|squat|leg press|hack squat|hip thrust|glute bridge)/.test(name)
      && !/(curl|lateral raise|rear delt|fly|pushdown|extension|kickback|crunch|rollout|calf)/.test(name);
  };
  const isIsolation = (ex) => !isCompound(ex);

  const isAbs = (ex) => {
    const intent = exIntent(ex);
    if (intent.includes('abs')) return true;
    if (/(\babs?\b|crunch|rollout|leg raise|\bcore\b)/.test(exName(ex))) return true;
    return primaryMuscleKeysForExercise(ex).includes('abs');
  };

  const isCalves = (ex) => {
    const intent = exIntent(ex);
    if (intent.includes('calves')) return true;
    if (/calf/.test(exName(ex))) return true;
    return primaryMuscleKeysForExercise(ex).includes('calves');
  };

  const isDirectArmWork = (ex) => {
    const intent = exIntent(ex);
    const keys = primaryMuscleKeysForExercise(ex);
    if (intent.includes('biceps_curl') || intent.includes('triceps_extension') || intent.includes('arms_superset')) return true;
    if (isIsolation(ex) && keys.length && keys.every((k) => k === 'biceps' || k === 'triceps')) return true;
    return /(curl|pushdown|skull|triceps extension|biceps)/.test(exName(ex));
  };

  const isPushMain = (ex) => {
    const intent = exIntent(ex);
    const move = exMove(ex);
    return isCompound(ex) && (intent.includes('chest_press') || intent.includes('overhead_press') || move === 'press' || move === 'ohp');
  };

  const isPullMain = (ex) => {
    const intent = exIntent(ex);
    const move = exMove(ex);
    return isCompound(ex) && (intent.includes('row_compound') || intent.includes('vertical_pull') || move === 'row' || move === 'vertical_pull');
  };

  const isLegMain = (ex) => {
    const intent = exIntent(ex);
    const move = exMove(ex);
    return isCompound(ex) && (intent.includes('knee_dominant') || intent.includes('hip_hinge') || move === 'squat' || move === 'hinge');
  };

  const heavinessScore = (ex) => {
    let score = 0;
    const role = String(ex?.slotRole || '').toUpperCase();
    if (role === 'MAIN') score += 10000;
    else if (role === 'SECONDARY') score += 5000;
    const projected = ex?.projected && typeof ex.projected === 'object' ? ex.projected : null;
    if (projected?.unit === 'lb' && Number.isFinite(Number(projected?.value))) {
      score += Number(projected.value);
    }
    const sets = Number(ex?.sets) || 0;
    score += sets * 50;
    const rr = parseRepRange(ex?.reps);
    if (rr?.min != null) score += Math.max(0, 30 - rr.min) * 5;
    return score;
  };

  const pickMain = () => {
    const compounds = remaining.filter((ex) => isCompound(ex) && !isAbs(ex) && !isCalves(ex));
    if (!compounds.length) return null;
    let candidates = compounds;
    if (dayType === 'push') candidates = compounds.filter(isPushMain);
    else if (dayType === 'pull') candidates = compounds.filter(isPullMain);
    else if (dayType === 'legs') candidates = compounds.filter(isLegMain);
    if (!candidates.length) candidates = compounds;
    let best = candidates[0];
    let bestScore = heavinessScore(best);
    for (let i = 1; i < candidates.length; i += 1) {
      const ex = candidates[i];
      const score = heavinessScore(ex);
      if (score > bestScore) {
        best = ex;
        bestScore = score;
      }
    }
    return best;
  };

  const pushByFilterInOriginalOrder = (predicate) => {
    const kept = [];
    for (const ex of remaining) {
      if (predicate(ex)) ordered.push(ex);
      else kept.push(ex);
    }
    remaining.length = 0;
    remaining.push(...kept);
  };

  const main = pickMain();
  if (main) {
    const idx = remaining.indexOf(main);
    if (idx >= 0) {
      ordered.push(main);
      remaining.splice(idx, 1);
    }
  }

  pushByFilterInOriginalOrder((ex) => isCompound(ex) && !isAbs(ex) && !isCalves(ex));
  pushByFilterInOriginalOrder((ex) => isIsolation(ex) && !isDirectArmWork(ex) && !isCalves(ex) && !isAbs(ex));
  pushByFilterInOriginalOrder((ex) => isDirectArmWork(ex) && !isCalves(ex) && !isAbs(ex));
  pushByFilterInOriginalOrder((ex) => !isCalves(ex) && !isAbs(ex));
  pushByFilterInOriginalOrder((ex) => isCalves(ex));
  pushByFilterInOriginalOrder((ex) => isAbs(ex));

  exercises.length = 0;
  exercises.push(...ordered);
  return exercises;
}

function dayTypeFromFocus(focus) {
  const f = String(focus || '').toLowerCase();
  if (f.includes('full')) return 'fullbody';
  if (f.includes('priority') || f.includes('weakpoint')) return 'priority';
  if (f.includes('legs') || f.includes('lower')) return 'legs';
  if (f.includes('back') || f.includes('pull')) return 'pull';
  if (f.includes('chest') || f.includes('push')) return 'push';
  if (f.includes('delts') || f.includes('shoulder') || f.includes('arms')) return 'shoulders_arms';
  if (f.includes('upper')) return 'upper';
  return 'other';
}

function isPriorityAllowedOnDay(priorityKey, dayType, daysPerWeek) {
  const normalizedKey = priorityKey === 'back'
    ? 'lats'
    : priorityKey === 'shoulders'
      ? 'deltsSide'
      : priorityKey;
  const upperKeys = new Set(['chest', 'deltsSide', 'deltsRear', 'deltsFront', 'biceps', 'triceps', 'lats', 'upperBack']);
  const lowerKeys = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'abs']);
  if (dayType === 'fullbody' || dayType === 'priority') return true;
  if (dayType === 'upper') return upperKeys.has(normalizedKey);
  if (dayType === 'push') return ['chest', 'deltsSide', 'deltsFront', 'triceps'].includes(normalizedKey);
  if (dayType === 'pull') return ['lats', 'upperBack', 'biceps', 'deltsRear'].includes(normalizedKey);
  if (dayType === 'shoulders_arms') return ['deltsSide', 'deltsRear', 'deltsFront', 'biceps', 'triceps'].includes(normalizedKey);
  if (dayType === 'legs') {
    if (Number(daysPerWeek || 0) <= 4) return true;
    return lowerKeys.has(normalizedKey);
  }
  return Number(daysPerWeek || 0) <= 4 ? true : false;
}

function isPrimaryPriorityDay(dayType, daysPerWeek) {
  if (Number(daysPerWeek || 0) < 6) return true;
  return dayType === 'priority' || dayType === 'shoulders_arms';
}

function pickForcedPriorityIntent(dayKey, dayIntentSet, state, dayType, daysPerWeek) {
  if (!state) return null;
  const keys = Array.isArray(state.keyOrder) && state.keyOrder.length ? state.keyOrder : Object.keys(PRIORITY_ISO_RULES);
  const passes = [
    (k) => isPrimaryPriorityDay(dayType, daysPerWeek),
    () => true
  ];
  for (const pass of passes) {
    for (const key of keys) {
      const rule = state.rules?.[key];
      if (!rule) continue;
      if (!pass(key)) continue;
      if (!isPriorityAllowedOnDay(key, dayType, daysPerWeek)) continue;
      const current = Number(state.counts?.[key] || 0);
      if (current >= rule.minSlots) continue;
      if (rule.distinctDays && state.days?.[key]?.has(dayKey)) continue;
      if (dayIntentSet?.has(rule.intent)) continue;
      return {
        intent: rule.intent,
        muscleKey: PRIORITY_ISO_INTENT_TO_MUSCLE[rule.intent] || key,
        forceCompound: Boolean(rule.forceCompound)
      };
    }
  }
  return null;
}

function chooseAccessoryFlexMuscle({ targets, weekTally, dayTally, avoid, dayType, daysPerWeek }) {
  const safeTargets = targets && typeof targets === 'object' ? targets : {};
  const avoidTargetSet = new Set((Array.isArray(avoid) ? avoid : []).map((k) => toTargetMuscleKey(k)).filter(Boolean));
  const allowedForDay = (key) => isPriorityAllowedOnDay(key, dayType, daysPerWeek);
  let best = null;
  let bestDef = -Infinity;
  const targetKeys = Object.keys(safeTargets).filter((k) => TARGET_MUSCLE_KEYS.includes(k));
  for (const m of targetKeys) {
    if (avoidTargetSet.has(m)) continue;
    const dayAllowKey = m === 'back' ? 'lats' : m === 'shoulders' ? 'deltsSide' : m;
    if (!allowedForDay(dayAllowKey)) continue;
    const t = Number(safeTargets?.[m] || 0);
    const curWeek = Number(weekTally?.[m] || 0);
    const curDay = Number(dayTally?.[m] || 0);
    const deficit = t - (curWeek + curDay);
    if (deficit > bestDef) {
      bestDef = deficit;
      best = m;
    }
  }
  return TARGET_TO_SLOT_MUSCLE[best] || 'chest';
}

const ACCESSORY_FLEX_HINTS = {
  chest: 'machine chest press',
  lats: 'lat pulldown',
  upperBack: 'row',
  deltsFront: 'front raise',
  deltsSide: 'lateral raise',
  deltsRear: 'rear delt fly',
  biceps: 'biceps curl',
  triceps: 'triceps pushdown',
  quads: 'leg extension',
  hamstrings: 'leg curl',
  glutes: 'hip thrust',
  calves: 'calf raise',
  abs: 'ab crunch'
};

function requiredIntentGroupsForFocus(focus) {
  const f = String(focus || '').toLowerCase();
  if (f.includes('push')) {
    return [
      ['chest_press_horizontal_compound', 'chest_press_incline_compound']
    ];
  }
  if (f.includes('pull') && !f.includes('lower')) {
    return [
      ['lats_vertical_pull_compound'],
      ['upperBack_horizontal_row_compound']
    ];
  }
  if (f.includes('legs') || f.includes('lower')) {
    return [
      ['quads_knee_dominant_compound'],
      ['hamstrings_hip_hinge_compound']
    ];
  }
  return [];
}

function intentGroupForSlot(intentKey, focus) {
  const groups = requiredIntentGroupsForFocus(focus);
  return groups.find((g) => g.includes(intentKey)) || null;
}

function selectExerciseForIntent({
  intentKey,
  slot,
  equipmentAccess,
  equipmentStylePref,
  usedDay,
  usedWeek,
  allowWeekRepeat,
  searchHintOverride,
  daySignatureSet,
  dayIntentSet,
  strict,
  injuryProfile,
  dayLeverageCount,
  weekNameSet,
  backPriority,
  dayIsolationFamilies,
  disallowBodyweight,
  disallowCalisthenics,
  forceHackSquatStart,
  pickOffset = 0,
  preferredMajorityBucket = null,
  equipmentBucketCounts = null,
  remainingSlotsCount = 0
}) {
  const def = INTENT_DEFS[intentKey] || {};
  const intent = {
    intentKey,
    searchHint: searchHintOverride || def.searchHint || slot.intentKey,
    muscleKeys: slot.muscleKeys || [],
    allowedEquipmentClass: slot.allowedEquipmentClass || ['any'],
    stimulusType: slot.stimulusType || def.stimulusType || null,
    movementPattern: slot.movementPattern || null
  };
  const candidates = selectExerciseIdsByIntent(intent, {
    equipmentAccess,
    equipmentStylePref,
    stimulusType: intent.stimulusType,
    movementPattern: intent.movementPattern,
    injurySeverityByJoint: injuryProfile,
    dayLeverageCount,
    disallowBodyweight,
    disallowCalisthenics
  });
  const role = bodybuildRole(slot);
  const isMainOrSecondary = role === 'MAIN' || role === 'SECONDARY';
  const bucketCounts = equipmentBucketCounts && typeof equipmentBucketCounts === 'object'
    ? equipmentBucketCounts
    : { free: 0, machine: 0, other: 0 };
  const targetMajority = 0.55;
  const remaining = Math.max(0, Number(remainingSlotsCount) || 0);
  const rescored = candidates.map((c) => {
    const entry = getExerciseById(c.id);
    let score = Number(c.score || 0);
    const name = String(entry?.name || c.name || '').toLowerCase();
    if (entry && isMainOrSecondary && isStapleForIntent(entry, intentKey)) score += 0.9;
    const novelty = noveltyPenaltyForName(name);
    score -= novelty * (isMainOrSecondary ? 2 : 1);
    if (isMainOrSecondary && /\blandmine\b/.test(name)) score -= 0.25;
    if (preferredMajorityBucket) {
      const bucket = equipmentBucketFromClass(c.eqClass);
      const thisIsPreferred = bucket === preferredMajorityBucket;
      const totalNow = Number(bucketCounts.free || 0) + Number(bucketCounts.machine || 0) + Number(bucketCounts.other || 0);
      const prefNow = Number(bucketCounts[preferredMajorityBucket] || 0);
      const projectedTotal = totalNow + remaining + 1;
      const targetPreferred = Math.ceil(projectedTotal * targetMajority);
      const maxPossiblePreferred = prefNow + (thisIsPreferred ? 1 : 0) + remaining;
      const preferredNeededNow = targetPreferred - (prefNow + remaining);
      if (thisIsPreferred) score += 0.55;
      else score -= 0.2;
      if (!thisIsPreferred && preferredNeededNow > 0) score -= 0.8;
      if (thisIsPreferred && preferredNeededNow > 0) score += 0.35;
      if (!thisIsPreferred && maxPossiblePreferred < targetPreferred) score -= 1.2;
    }
    return { ...c, score };
  }).sort((a, b) => b.score - a.score || String(a.name || '').localeCompare(String(b.name || '')));
  const hasMainWhitelistCandidates = role === 'MAIN'
    ? rescored.some((c) => {
      const entry = getExerciseById(c.id);
      return entry && isMainWhitelistForIntent(entry, intentKey);
    })
    : false;
  const filtered = rescored.filter((c) => !usedDay.has(c.id) && (allowWeekRepeat ? true : !usedWeek.has(c.id)));
  const nearFiltered = daySignatureSet
    ? filtered.filter((c) => !daySignatureSet.has(signatureForSlot(slot.movementPattern, slot.muscleKeys, c.eqClass)))
    : filtered;
  const prioritizeForMain = (list) => {
    const src = Array.isArray(list) ? list : [];
    const forceHack = Boolean(forceHackSquatStart) && String(intentKey || '').toLowerCase().includes('quads_knee_dominant_compound');
    if (forceHack) {
      const hack = src.filter((c) => /\bhack\s*squat\b/i.test(String(getExerciseById(c.id)?.name || '')));
      if (hack.length) return hack;
      const machineKnee = src.filter((c) => {
        const entry = getExerciseById(c.id);
        const n = String(entry?.name || '').toLowerCase();
        const eq = String(c.eqClass || '').toLowerCase();
        return (/(leg press|squat)/.test(n) && !/(lunge|split squat|step up|side lunge|lateral lunge)/.test(n)) && eq === 'machine';
      });
      if (machineKnee.length) return machineKnee;
      const nonLunge = src.filter((c) => {
        const entry = getExerciseById(c.id);
        const n = String(entry?.name || '').toLowerCase();
        return !/(lunge|split squat|step up|side lunge|lateral lunge)/.test(n);
      });
      if (nonLunge.length) return nonLunge;
    }
    if (role !== 'MAIN') return src;
    const whitelist = src.filter((c) => {
      const entry = getExerciseById(c.id);
      return entry && isMainWhitelistForIntent(entry, intentKey);
    });
    if (whitelist.length) return whitelist;
    const staple = src.filter((c) => {
      const entry = getExerciseById(c.id);
      return entry && isStapleForIntent(entry, intentKey);
    });
    if (!staple.length) return src;
    if (String(intentKey || '').toLowerCase().includes('chest_press')) {
      const stapleNonLandmine = staple.filter((c) => {
        const entry = getExerciseById(c.id);
        const n = String(entry?.name || '').toLowerCase();
        return !/\blandmine\b/.test(n);
      });
      if (stapleNonLandmine.length) return stapleNonLandmine;
    }
    return staple;
  };
  const pickFrom = (list) => {
    const valid = [];
    for (const c of list || []) {
      const entry = getExerciseById(c.id);
      if (!entry) continue;
      if (!isValidForIntent(entry, intent)) continue;
      if (isBlacklistedEntry(entry)) continue;
      if (disallowBodyweight && equipmentClass(entry) === 'bodyweight') continue;
      if (disallowCalisthenics && isCalisthenicsLikeEntry(entry)) continue;
      if (role === 'MAIN' && hasMainWhitelistCandidates && !isMainWhitelistForIntent(entry, intentKey)) continue;
      const nameNorm = String(entry?.name || '').toLowerCase();
      if (strict && STRICT_DAY_REJECT_NAME_PATTERNS.some((rx) => rx.test(nameNorm))) continue;
      if (!backPriority && intentKey.includes('chest') && nameNorm.includes('pullover')) continue;
      if (!backPriority && weekNameSet && weekNameSet.has('pullover') && nameNorm.includes('pullover')) continue;
      if (String(intent?.stimulusType || '').toLowerCase() === 'isolation' && dayIsolationFamilies instanceof Set) {
        const fam = isolationFamilyKey(entry?.name || '');
        if (fam && dayIsolationFamilies.has(fam)) continue;
      }
      valid.push({ candidate: c, entry });
    }
    if (!valid.length) return null;
    const idx = Math.max(0, Math.floor(Number(pickOffset) || 0)) % valid.length;
    return valid[idx];
  };
  const nearMain = prioritizeForMain(nearFiltered);
  const filteredMain = prioritizeForMain(filtered);
  const rescoredMain = prioritizeForMain(rescored);
  const pickResult = strict
    ? (pickFrom(nearMain) || pickFrom(filteredMain) || pickFrom(rescoredMain) || pickFrom(nearFiltered) || pickFrom(filtered) || pickFrom(rescored))
    : (pickFrom(nearMain) || pickFrom(filteredMain) || pickFrom(rescoredMain) || pickFrom(nearFiltered) || pickFrom(filtered) || pickFrom(rescored));
  const pick = pickResult ? pickResult.candidate : null;
  const pickEntry = pickResult ? pickResult.entry : null;
  const canUseAsSwap = (id) => {
    const entry = getExerciseById(id);
    if (!entry) return false;
    if (!isValidForIntent(entry, intent)) return false;
    if (isBlacklistedEntry(entry)) return false;
    if (disallowBodyweight && equipmentClass(entry) === 'bodyweight') return false;
    if (disallowCalisthenics && isCalisthenicsLikeEntry(entry)) return false;
    const name = String(entry?.name || '').toLowerCase();
    if (String(intent?.stimulusType || '').toLowerCase() === 'isolation' && dayIsolationFamilies instanceof Set) {
      const fam = isolationFamilyKey(entry?.name || '');
      if (fam && dayIsolationFamilies.has(fam)) return false;
    }
    return !/(^|\b)(band|bands|resistance band|mini band)(\b|$)/.test(name);
  };
  const swapPool = (rescored || []).filter((c) => !pick || c.id !== pick.id).slice(0, 80);
  const swapCandidates = Array.from(new Set(
    swapPool.map((c) => c.id).filter((id) => canUseAsSwap(id))
  )).slice(0, 3);
  if (!pick) return { exerciseId: null, swapCandidates: [] };
  usedDay.add(pick.id);
  if (!allowWeekRepeat) usedWeek.add(pick.id);
  if (dayIntentSet) dayIntentSet.add(intentKey);
  return {
    exerciseId: pick.id,
    name: pickEntry?.name || pick.name || null,
    swapCandidates,
    equipmentClass: pick.eqClass || null,
    isLeverage: /(leverage|smith)/.test(String(pick.name || '').toLowerCase())
  };
}

function validateBodybuildingDay(day) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const ids = new Set();
  const sigs = new Set();
  const isoFamilies = new Set();
  let hasChestPress = false;
  let hasRow = false;
  let hasVerticalPull = false;
  let hasKnee = false;
  let hasHinge = false;
  let rowCount = 0;
  let verticalCount = 0;
  let chestFlyCount = 0;
  let benchPressCompoundCount = 0;
  let chestPressCompoundCount = 0;
  let hasTricepsIso = false;
  let hasBicepsIso = false;
  let hasShoulderPress = false;
  let hasHamCurl = false;
  let hasCalves = false;
  let hasAbs = false;
  let firstRequiredIndex = null;

  for (let i = 0; i < exercises.length; i += 1) {
    const ex = exercises[i];
    if (ex.exerciseId) {
      if (ids.has(ex.exerciseId)) return false;
      ids.add(ex.exerciseId);
    }
    if (ex.signature) {
      if (sigs.has(ex.signature)) return false;
      sigs.add(ex.signature);
    }
    const intent = String(ex.intentKey || '').toLowerCase();
    const exNameNorm = String(ex?.name || '').toLowerCase();
    if (intent.includes('chest_press')) hasChestPress = true;
    if (intent.includes('row_compound')) {
      hasRow = true;
      rowCount += 1;
    }
    if (intent.includes('vertical_pull')) {
      hasVerticalPull = true;
      verticalCount += 1;
    }
    if (intent.includes('knee_dominant')) hasKnee = true;
    if (intent.includes('hip_hinge')) hasHinge = true;
    if (String(ex.stimulusType || '') === 'compound' && Number(ex.restSec || 0) < 120) return false;
    if (String(ex.stimulusType || '').toLowerCase() === 'compound' && /\bbench press\b/.test(exNameNorm)) {
      benchPressCompoundCount += 1;
    }
    if (String(ex.stimulusType || '').toLowerCase() === 'compound') {
      if (/(bench|chest press|incline press|decline press|dumbbell press|machine press)/.test(exNameNorm)) chestPressCompoundCount += 1;
      if (/(overhead press|shoulder press|military press)/.test(exNameNorm)) hasShoulderPress = true;
    } else if (String(ex.stimulusType || '').toLowerCase() === 'isolation') {
      if (/(triceps|extension|pushdown|skull crusher)/.test(exNameNorm)) hasTricepsIso = true;
      if (/(curl|preacher|hammer)/.test(exNameNorm)) hasBicepsIso = true;
      if (/(seated leg curl|lying leg curl|hamstring curl|leg curl)/.test(exNameNorm)) hasHamCurl = true;
      if (/calf/.test(exNameNorm)) hasCalves = true;
      if (/(crunch|rollout|ab|pallof|wood chop|twist)/.test(exNameNorm)) hasAbs = true;
    }

    if (ex.exerciseId) {
      const entry = getExerciseById(ex.exerciseId);
      if (!isValidForIntent(entry, { intentKey: ex.intentKey, stimulusType: ex.stimulusType, movementPattern: ex.movementPattern })) return false;
    }

    const isRequiredCompound = intent.includes('chest_press')
      || intent.includes('row_compound')
      || intent.includes('vertical_pull')
      || intent.includes('knee_dominant')
      || intent.includes('hip_hinge')
      || intent.includes('overhead_press')
      || String(ex.stimulusType || '').toLowerCase() === 'compound';
    if (firstRequiredIndex == null && isRequiredCompound) firstRequiredIndex = i;
    const isIsolation = String(ex.stimulusType || '').toLowerCase() === 'isolation'
      || intent.includes('calves')
      || intent.includes('abs');
    if (firstRequiredIndex == null && isIsolation) {
      if (!ex.priorityLead) return false;
    }
    if (isIsolation) {
      const fam = isolationFamilyKey(ex?.name || '');
      if (fam) {
        if (isoFamilies.has(fam)) return false;
        isoFamilies.add(fam);
        if (fam === 'chest_fly') chestFlyCount += 1;
      }
    }
  }

  const focus = String(day?.focus || '').toLowerCase();
  const isLower = focus.includes('legs') || focus.includes('lower');
  const isPullDay = focus.includes('pull') && !focus.includes('lower');
  if (focus.includes('push') && !hasChestPress) return false;
  if (benchPressCompoundCount > 1) return false;
  if (focus.includes('push') && !hasShoulderPress) return false;
  if (focus.includes('push') && !hasTricepsIso) return false;
  if (focus.includes('chest') && chestFlyCount > 1) return false;
  if (isPullDay && (!hasVerticalPull || !hasRow || rowCount > 1 || verticalCount < 1 || !hasBicepsIso)) return false;
  if (isPullDay && exercises.some((ex) => /(lateral raise|side lateral)/.test(String(ex?.name || '').toLowerCase()))) return false;
  if (isLower && !hasKnee) return false;
  if (isLower && !(hasHinge || hasHamCurl)) return false;
  if (isLower && (!hasCalves || !hasAbs)) return false;
  if (focus.includes('delts') && focus.includes('arms')) {
    const biIsoCount = exercises.filter((ex) => String(ex?.stimulusType || '').toLowerCase() === 'isolation' && /(curl|preacher|hammer)/.test(String(ex?.name || '').toLowerCase())).length;
    const triIsoCount = exercises.filter((ex) => String(ex?.stimulusType || '').toLowerCase() === 'isolation' && /(triceps|extension|pushdown|skull crusher)/.test(String(ex?.name || '').toLowerCase())).length;
    if (biIsoCount !== 1 || triIsoCount !== 1) return false;
  }
  if ((focus.includes('push') || focus.includes('upper')) && chestPressCompoundCount >= 2 && chestFlyCount > 0) return false;

  const first = exercises[0] || null;
  const second = exercises[1] || null;
  const intentFirst = String(first?.intentKey || '').toLowerCase();
  const intentSecond = String(second?.intentKey || '').toLowerCase();
  if (focus.includes('push')) {
    if (!(intentFirst.includes('chest_press') || intentSecond.includes('chest_press'))) return false;
  }
  if (isPullDay) {
    if (!(intentFirst.includes('row_compound') || intentFirst.includes('vertical_pull'))) return false;
    if (!(intentFirst.includes('row_compound') || intentSecond.includes('row_compound'))) return false;
    if (!(intentFirst.includes('vertical_pull') || intentSecond.includes('vertical_pull'))) return false;
  }
  if (isLower) {
    if (!(intentFirst.includes('knee_dominant') || intentFirst.includes('hip_hinge'))) return false;
    if (!(intentFirst.includes('knee_dominant') || intentSecond.includes('knee_dominant'))) return false;
    if (!(intentFirst.includes('hip_hinge') || intentSecond.includes('hip_hinge'))) return false;
  }
  return true;
}

function validateBodybuildingDayStrict(day, backPriority, preferredMajorityBucket = null) {
  if (!validateBodybuildingDay(day)) return false;
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const isoFamilies = new Set();
  let preferredCount = 0;
  let eligibleCount = 0;
  for (const ex of exercises) {
    if (!ex?.exerciseId) return false;
    const entry = getExerciseById(ex.exerciseId);
    if (!entry) return false;
    if (!isValidForIntent(entry, { intentKey: ex.intentKey, stimulusType: ex.stimulusType, movementPattern: ex.movementPattern })) return false;
    if (isBlacklistedEntry(entry)) return false;
    const nameNorm = String(entry?.name || ex?.name || '').toLowerCase();
    if (STRICT_DAY_REJECT_NAME_PATTERNS.some((rx) => rx.test(nameNorm))) return false;
    const cap = maxSetsForBodybuildingExercise(ex, backPriority);
    if ((Number(ex?.sets) || 0) > cap) return false;
    if (preferredMajorityBucket) {
      const bucket = equipmentBucketFromClass(ex?.equipmentClass || equipmentClass(entry));
      if (bucket === 'free' || bucket === 'machine') {
        eligibleCount += 1;
        if (bucket === preferredMajorityBucket) preferredCount += 1;
      }
    }
    if (String(ex?.stimulusType || '').toLowerCase() === 'isolation') {
      const fam = isolationFamilyKey(entry?.name || ex?.name || '');
      if (fam) {
        if (isoFamilies.has(fam)) return false;
        isoFamilies.add(fam);
      }
    }
  }
  if (preferredMajorityBucket && eligibleCount >= 3) {
    if ((preferredCount / eligibleCount) < 0.55) return false;
  }
  return true;
}

function buildCalisthenicsTemplate(daysPerWeek, baselines) {
  const d = clampInt(daysPerWeek, 2, 6, 4);
  const b = baselines && typeof baselines === 'object' ? baselines : {};
  const equip = b.equipment && typeof b.equipment === 'object' ? b.equipment : { none: true };
  const goals = Array.isArray(b.goals) && b.goals.length ? b.goals : ['strength'];
  const exp = normalizeExperience(b.experience);

  // Persistent soreness/fatigue: reduce volume/intensity at generation time.
  const fatigue = String(b.fatigue || '').toLowerCase();
  const volumeMult = fatigue === 'high' ? 0.70 : fatigue === 'medium' ? 0.85 : 1.0;

  const canDo = {
    push5: Number(b.pushups || 0) >= 5,
    pull5: Number(b.pullups || 0) >= 5,
    dip5: Number(b.dips || 0) >= 5,
    hold3: (sec) => Number(sec || 0) >= 3
  };

  const repScheme = (() => {
    const has = (k) => goals.includes(k);
    // Volume precedes intensity for beginners.
    if (exp === 'beginner') {
      if (has('endurance')) return { strength: '6-10', assist: '12-20' };
      return { strength: has('strength') ? '5-8' : '6-12', assist: '10-20' };
    }
    if (has('strength') && !has('endurance')) return { strength: '3-6', assist: '8-15' };
    if (has('hypertrophy')) return { strength: '6-10', assist: '10-20' };
    if (has('endurance')) return { strength: '8-12', assist: '15-30' };
    return { strength: '5-8', assist: '10-20' };
  })();

  const restScheme = {
    skill: 150,
    strength: goals.includes('strength') ? 180 : 150,
    assist: 90
  };

  const scaleSets = (base) => {
    const scaled = Math.max(1, Math.round(Number(base || 1) * volumeMult));
    return exp === 'beginner' ? Math.min(4, scaled) : Math.min(6, scaled);
  };

  const rx = (sets, reps, restSec) => ({ sets, reps, restSec, pct: null });

  const warmup = (label) => ({
    baseId: `warmup_${label.replace(/\\s+/g, '_').toLowerCase()}`,
    name: `Warm-up: ${label} (6 min)`,
    kind: 'assist_mob',
    block: 'warmup',
    tempo: 'easy',
    coaching: {
      progress: 'Nasal breathing, full ROM, control the tempo.',
      regress: 'If anything pinches, cut range and slow down.'
    },
    prescription: rx(1, '6m', 0)
  });

  const mainPush = () => {
    const max = Number(b.pushups || 0);
    const wantsLoad = goals.includes('strength') && equip.weights && max >= 15 && exp !== 'beginner';
    if (!canDo.push5) {
      return {
        baseId: 'push',
        name: 'Incline / Knee Push-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '3111',
        coaching: {
          progress: 'Form â†’ reps â†’ sets â†’ lower the incline (harder lever) â†’ load.',
          regress: 'If you cannot hit 5 clean reps, increase incline or use knees.'
        },
        prescription: rx(scaleSets(3), '6-12', restScheme.strength)
      };
    }
    if (wantsLoad) {
      return {
        baseId: 'push',
        name: 'Weighted Push-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Form â†’ reps â†’ sets â†’ load (small jumps).',
          regress: 'If reps drop below 5, remove load and rebuild reps.'
        },
        prescription: rx(scaleSets(4), '4-8', restScheme.strength)
      };
    }
    if (max >= 20 && exp !== 'beginner') {
      return {
        baseId: 'push',
        name: 'Archer Push-up / Pseudo Planche Push-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Form â†’ reps â†’ sets â†’ leverage (lean/ROM) before load.',
          regress: 'If you canâ€™t hold positions for 3s, return to strict push-ups.'
        },
        prescription: rx(scaleSets(4), '4-8', restScheme.strength)
      };
    }
    if (max >= 12) {
      return {
        baseId: 'push',
        name: equip.rings ? 'Ring Push-up (deep)' : 'Decline Push-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '3111',
        coaching: {
          progress: 'Reps first to the top of range; then add a set; then increase leverage.',
          regress: 'If reps drop below 5, go back to strict push-ups.'
        },
        prescription: rx(scaleSets(4), repScheme.strength, restScheme.strength)
      };
    }
    return {
      baseId: 'push',
      name: 'Strict Push-up',
      kind: 'main_upper',
      block: 'strength',
      tempo: '3111',
      coaching: {
        progress: 'Add reps until top of range, then add a set, then progress the variation.',
        regress: 'If you cannot get 5+ clean reps, use incline.'
      },
      prescription: rx(scaleSets(4), repScheme.strength, restScheme.strength)
    };
  };

  const mainDip = () => {
    const max = Number(b.dips || 0);
    const wantsLoad = goals.includes('strength') && equip.weights && max >= 15 && exp !== 'beginner';
    if (!canDo.dip5) {
      return {
        baseId: 'dip',
        name: 'Assisted Dips / Bench Dips',
        kind: 'main_upper',
        block: 'strength',
        tempo: '3111',
        coaching: {
          progress: 'Build strict 3Ã—8 before moving to parallel-bar dips.',
          regress: 'Shorten ROM or add assistance if reps drop below 5.'
        },
        prescription: rx(scaleSets(3), '6-12', restScheme.strength)
      };
    }
    if (wantsLoad) {
      return {
        baseId: 'dip',
        name: 'Weighted Dips',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Reps â†’ sets â†’ load (small jumps).',
          regress: 'If reps fall below 5, remove load.'
        },
        prescription: rx(scaleSets(4), '3-6', restScheme.strength)
      };
    }
    return {
      baseId: 'dip',
      name: equip.rings && max >= 10 && exp !== 'beginner' ? 'Ring Dips' : 'Parallel-Bar Dips',
      kind: 'main_upper',
      block: 'strength',
      tempo: '3111',
      coaching: {
        progress: 'Add reps first; when you hit top of range, add a set, then increase difficulty.',
        regress: 'If you cannot hit 5 clean reps, add assistance.'
      },
      prescription: rx(scaleSets(3), repScheme.strength, restScheme.strength)
    };
  };

  const mainPull = () => {
    const max = Number(b.pullups || 0);
    const wantsLoad = goals.includes('strength') && equip.weights && max >= 12 && exp !== 'beginner';
    if (!canDo.pull5) {
      return {
        baseId: 'pull',
        name: equip.bands ? 'Band-Assisted Pull-up' : 'Eccentric Pull-up (negatives)',
        kind: 'main_upper',
        block: 'strength',
        tempo: equip.bands ? '3111' : '5010',
        coaching: {
          progress: 'Form â†’ reps. Reduce assistance over time until you can do 5 strict reps.',
          regress: 'If you cannot control a 3s lower, use more assistance.'
        },
        prescription: rx(scaleSets(4), '3-6', restScheme.strength)
      };
    }
    if (wantsLoad) {
      return {
        baseId: 'pull',
        name: 'Weighted Pull-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Reps â†’ sets â†’ load (2.5â€“5 lb jumps).',
          regress: 'If reps drop below 3â€“4, remove load and rebuild.'
        },
        prescription: rx(scaleSets(4), '3-6', restScheme.strength)
      };
    }
    if (max >= 15 && exp !== 'beginner') {
      return {
        baseId: 'pull',
        name: 'Chest-to-Bar Pull-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Increase ROM and strictness before adding load.',
          regress: 'If you canâ€™t get 5 reps, go back to strict pull-ups.'
        },
        prescription: rx(scaleSets(4), '4-8', restScheme.strength)
      };
    }
    return {
      baseId: 'pull',
      name: 'Strict Pull-up',
      kind: 'main_upper',
      block: 'strength',
      tempo: '2111',
      coaching: {
        progress: 'Add reps until top of range, then add a set, then progress leverage/load.',
        regress: 'If reps drop below 5, add a band or reduce sets.'
      },
      prescription: rx(scaleSets(4), repScheme.strength, restScheme.strength)
    };
  };

  const assistRow = () => ({
    baseId: 'row',
    name: equip.rings ? 'Ring Rows' : 'Inverted Rows',
    kind: 'assist_upper',
    block: 'assist',
    tempo: '3111',
    coaching: {
      progress: 'Reps â†’ sets â†’ lever length (feet forward / lower rings).',
      regress: 'Raise the bar/rings if you canâ€™t get 8 reps.'
    },
    prescription: rx(scaleSets(3), repScheme.assist, restScheme.assist)
  });

  const mainLegs = () => {
    const name = exp === 'advanced' ? 'Pistol Squat'
      : exp === 'intermediate' ? 'Box Pistol / Shrimp Squat Progression'
        : 'Bulgarian Split Squat';
    return {
      baseId: 'leg',
      name,
      kind: 'main_lower',
      block: 'strength',
      tempo: '3111',
      coaching: {
        progress: 'Form â†’ reps â†’ sets â†’ leverage before load.',
        regress: 'If you canâ€™t control the bottom, reduce range or add support.'
      },
      prescription: rx(scaleSets(4), exp === 'beginner' ? '8-12/leg' : '6-10/leg', restScheme.strength)
    };
  };

  const assistHinge = () => ({
    baseId: 'hinge',
    name: equip.weights ? 'Single-Leg RDL (loaded)' : 'Hip Hinge (Good Morning / Single-Leg RDL)',
    kind: 'assist_lower',
    block: 'assist',
    tempo: '3111',
    coaching: {
      progress: 'Reps â†’ sets â†’ ROM before load.',
      regress: 'Shorten ROM if back rounds.'
    },
    prescription: rx(scaleSets(3), exp === 'beginner' ? '10-15' : repScheme.assist, restScheme.assist)
  });

  const assistCore = () => {
    const hollow = Number(b.holds?.hollowHoldSec || 0);
    const name = canDo.hold3(hollow) && hollow >= 30 ? 'Hollow Hold (hard)' : canDo.hold3(hollow) ? 'Hollow Hold' : 'Hollow Body Regression';
    return {
      baseId: 'core',
      name,
      kind: 'assist_core',
      block: 'assist',
      tempo: 'isometric',
      coaching: {
        progress: 'Time â†’ lever length. Build to 30â€“45s holds.',
        regress: 'If you canâ€™t hold 3s, bend knees and tuck.'
      },
      prescription: rx(scaleSets(3), '20-40s', 60)
    };
  };

  const enduranceBlock = () => ({
    baseId: 'endurance',
    name: 'Optional Endurance: EMOM / Density (8â€“12 min)',
    kind: 'assist_cond',
    block: 'endurance',
    tempo: 'smooth',
    coaching: {
      progress: 'Increase density before adding difficulty.',
      regress: 'If soreness persists, skip this block for 1â€“2 weeks.'
    },
    prescription: rx(1, '8-12m', 0)
  });

  const pickSkills = () => {
    const hsHold = Number(b.holds?.handstandHoldSec || 0);
    const support = Number(b.holds?.supportHoldSec || 0);
    const hollow = Number(b.holds?.hollowHoldSec || 0);
    const pullups = Number(b.pullups || 0);
    const dips = Number(b.dips || 0);

    const catalog = [
      {
        key: 'handstand',
        baseId: 'skill_handstand',
        name: hsHold >= 20 ? 'Handstand (quality practice)' : hsHold >= 3 ? 'Wall Handstand Hold' : 'Pike Handstand Hold',
        qualifies: true,
        prescription: rx(5, hsHold >= 20 ? '20-40s' : '10-25s', restScheme.skill),
        coaching: {
          progress: 'Quality holds â†’ longer holds â†’ harder variations before adding volume.',
          regress: 'If you canâ€™t hold 3s with form, return to pike holds.'
        }
      },
      {
        key: 'muscle_up',
        baseId: 'skill_muscle_up',
        name: (equip.bar || equip.rings) && pullups >= 10 && dips >= 10 ? 'Muscle-up Practice' : 'Muscle-up Progression (transition drills)',
        qualifies: Boolean(equip.bar || equip.rings),
        prescription: rx(4, (pullups >= 10 && dips >= 10) ? '2-4' : '3-5', restScheme.skill),
        coaching: {
          progress: 'Pull height â†’ transition â†’ dip-out.',
          regress: 'If reps drop below 2, return to transition drills.'
        }
      },
      {
        key: 'l_sit',
        baseId: 'skill_l_sit',
        name: support >= 20 && hollow >= 20 ? 'L-sit Hold' : 'Tuck Sit / Compression Hold',
        qualifies: true,
        prescription: rx(5, '10-25s', restScheme.skill),
        coaching: {
          progress: 'Time â†’ extend one leg â†’ full L.',
          regress: 'If you canâ€™t hold 3s, keep knees tucked.'
        }
      },
      {
        key: 'front_lever',
        baseId: 'skill_front_lever',
        name: pullups >= 8 && (equip.bar || equip.rings) ? 'Tuck Front Lever Holds' : 'Scap + Row Prep (Front Lever)',
        qualifies: Boolean(equip.bar || equip.rings),
        prescription: rx(5, pullups >= 8 ? '8-15s' : '6-10', restScheme.skill),
        coaching: {
          progress: 'Hold time â†’ harder tuck â†’ one-leg â†’ straddle.',
          regress: 'If you canâ€™t hold 3s, return to scap prep.'
        }
      }
    ].filter((s) => s.qualifies);

    const preferred = Array.isArray(b.preferredSkills) && b.preferredSkills.length ? b.preferredSkills : null;
    const preferredEligible = preferred ? catalog.filter((s) => preferred.includes(s.key)) : [];
    const pool = preferredEligible.length ? preferredEligible : catalog;
    const n = goals.includes('skill') ? 2 : 1;
    return pool.slice(0, n);
  };

  const skillBlock = () => pickSkills().map((s) => ({
    baseId: s.baseId,
    name: s.name,
    kind: 'skill',
    block: 'skill',
    tempo: 'quality',
    coaching: s.coaching,
    prescription: s.prescription
  }));

  const dayForPatterns = (label, focus, patterns) => {
    const out = [];
    const warmParts = [];
    if (patterns.includes('push')) warmParts.push('wrists + shoulders');
    if (patterns.includes('pull')) warmParts.push('scap + lats');
    if (patterns.includes('legs')) warmParts.push('hips + ankles');
    out.push(warmup(warmParts.length ? warmParts.join(' + ') : 'full body'));

    out.push(...skillBlock());

    if (patterns.includes('push')) out.push(mainDip(), mainPush());
    if (patterns.includes('pull')) out.push(mainPull(), assistRow());
    if (patterns.includes('legs')) out.push(mainLegs(), assistHinge());

    out.push(assistCore());

    const capacityOk = fatigue !== 'high'
      && goals.includes('endurance')
      && Number(b.pushups || 0) >= 8
      && Number(b.pullups || 0) >= 5
      && Number(b.dips || 0) >= 8;
    if (capacityOk) out.push(enduranceBlock());

    return { label, focus, exercises: out };
  };

  const schedule = (() => {
    // PUSH, PULL, LEGS roughly 2x/week. Combine patterns per day if needed.
    if (d === 2) return [['push', 'pull', 'legs'], ['push', 'pull', 'legs']];
    if (d === 3) return [['push', 'pull'], ['legs', 'push'], ['pull', 'legs']];
    if (d === 4) return [['push', 'pull'], ['legs'], ['push', 'pull'], ['legs']];
    if (d === 5) return [['push', 'pull'], ['legs'], ['push', 'pull'], ['legs'], ['skill']];
    return [['push', 'pull'], ['legs'], ['push', 'pull'], ['legs'], ['push', 'pull'], ['legs']];
  })();

  const days = schedule.map((patterns, idx) => {
    if (patterns.includes('skill')) {
      return {
        label: `Day ${idx + 1}`,
        focus: 'Skill + Recovery',
        exercises: [warmup('shoulders + hips + spine'), ...skillBlock(), assistCore()]
      };
    }
    const hasPush = patterns.includes('push');
    const hasPull = patterns.includes('pull');
    const hasLegs = patterns.includes('legs');
    const focus = hasPush && hasPull ? 'Push + Pull'
      : hasLegs ? 'Legs'
        : hasPush ? 'Push'
          : hasPull ? 'Pull'
            : 'Full Body';
    return dayForPatterns(`Day ${idx + 1}`, focus, patterns);
  });

  return days.slice(0, d);
}

function loadPowerliftingDb() {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const raw = require('../data/powerlifting-exercises.json');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function resolvePowerliftingFrequenciesV2({ daysPerWeek, eventType } = {}) {
  const freq = resolvePowerliftingFrequencies(daysPerWeek);
  const ev = normalizePowerliftingEventType(eventType);
  if (ev === 'bench_only') {
    // Increase bench by +1 exposure, capped at 4 days/week (never above 4).
    freq.bench = Math.min(4, Number(freq.bench || 0) + 1);
    // Keep squat/deadlift exposures optional and low-fatigue via technique only.
    freq.squat = Math.min(1, Number(freq.squat || 0));
    freq.deadlift = Math.min(1, Number(freq.deadlift || 0));
  }
  return { ...freq, eventType: ev };
}

function buildPowerliftingTemplateV2({ daysPerWeek, experience, eventType } = {}) {
  const d = clampInt(daysPerWeek, 2, 6, 4);
  const exp = normalizeExperience(experience);
  const freq = resolvePowerliftingFrequenciesV2({ daysPerWeek: d, eventType });
  const db = loadPowerliftingDb();

  const maxFatiguePerDay = d >= 5 ? 8 : 7;

  const exposures = [];
  const add = (lift, weeklyRole, intensityType, fatiguePoints, priority) => {
    exposures.push({ lift, weeklyRole, intensityType, fatiguePoints, priority });
  };

  // Bench priority always. Build exposures deterministically by frequency targets.
  add('bench', 'heavy', exp === 'beginner' ? 'strength' : 'heavy_single', 3, 1);
  add('bench', 'volume', 'volume', 2, 3);
  add('bench', 'technique', 'technique', 1, 5);
  if (freq.bench >= 4) add('bench', exp === 'beginner' ? 'volume' : 'performance', exp === 'beginner' ? 'volume' : 'heavy_single', 3, 2);

  if (freq.eventType === 'bench_only') {
    // Bench-only: no heavy squat/deadlift exposures. Only optional light technique work (low fatigue).
    if (freq.squat >= 1) add('squat', 'technique', 'technique', 1, 6);
    if (freq.deadlift >= 1) add('deadlift', 'technique', 'technique', 1, 7);
  } else {
    add('squat', 'heavy', 'strength', 3, 4);
    add('squat', 'volume', 'volume', 3, 6);
    if (freq.squat >= 3) add('squat', 'technique', 'technique', 2, 7);

    add('deadlift', 'heavy', exp === 'beginner' ? 'strength' : 'heavy_single', 3, 8);
    if (freq.deadlift >= 2) add('deadlift', 'volume', 'volume', 2, 9);
  }

  exposures.sort((a, b) => (a.priority - b.priority) || String(a.lift).localeCompare(String(b.lift), 'en'));

  const days = Array.from({ length: d }, (_, i) => ({
    label: `Day ${i + 1}`,
    focus: '',
    fatigue: 0,
    exposures: []
  }));

  const placeExposure = (ex) => {
    // Greedy: place on lowest-fatigue day that can fit and avoids stacking squat+deadlift heavies together.
    const candidates = days
      .map((day, idx) => ({ day, idx }))
      .filter(({ day }) => (day.fatigue + ex.fatiguePoints) <= maxFatiguePerDay)
      // Prefer spreading the same lift across different days (e.g., bench frequency).
      .map(({ day, idx }) => ({ day, idx, hasSameLift: day.exposures.some((e) => e.lift === ex.lift) }))
      .filter(({ day }) => {
        if (ex.intensityType !== 'heavy_single' && ex.weeklyRole !== 'heavy') return true;
        const hasHeavyLower = day.exposures.some((e) => (e.lift === 'squat' || e.lift === 'deadlift') && (e.weeklyRole === 'heavy' || e.intensityType === 'heavy_single'));
        const isLowerHeavy = (ex.lift === 'squat' || ex.lift === 'deadlift') && (ex.weeklyRole === 'heavy' || ex.intensityType === 'heavy_single');
        return !(hasHeavyLower && isLowerHeavy);
      })
      .sort((a, b) => (Number(a.hasSameLift) - Number(b.hasSameLift)) || (a.day.fatigue - b.day.fatigue) || (a.idx - b.idx));

    const target = candidates[0]?.day || days.reduce((best, cur) => (cur.fatigue < best.fatigue ? cur : best), days[0]);
    target.exposures.push(ex);
    target.fatigue += ex.fatiguePoints;
  };

  exposures.forEach(placeExposure);

  const nameForLift = (lift) => lift === 'bench' ? 'Bench' : lift === 'squat' ? 'Squat' : 'Deadlift';
  for (const day of days) {
    const lifts = Array.from(new Set(day.exposures.map((e) => e.lift)));
    day.focus = lifts.length ? lifts.map(nameForLift).join(' + ') : 'Full body';
  }

  const findExercise = (lift, intensityType, weeklyRole) => {
    const candidates = db.filter((row) => {
      if (!row || typeof row !== 'object') return false;
      const rowLift = String(row.lift || '').trim().toLowerCase();
      const it = String(row.intensity_type || '').trim().toLowerCase();
      if (rowLift !== lift) return false;
      if (it !== intensityType) return false;
      if (!meetsExperienceMin(exp, row.experience_min)) return false;
      return true;
    });

    // Preference: competition_specific on heavy/performance, technique category on technique days.
    const desiredCategory = weeklyRole === 'technique' ? 'technique' : (weeklyRole === 'heavy' || weeklyRole === 'performance') ? 'competition_specific' : null;
    const filtered = desiredCategory
      ? candidates.filter((c) => String(c.category || '').trim().toLowerCase() === desiredCategory)
      : candidates;

    return pickDeterministic(filtered.length ? filtered : candidates, (x) => x.id) || null;
  };

  const accessoryPool = db.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const cat = String(row.category || '').trim().toLowerCase();
    if (cat !== 'accessory') return false;
    if (!meetsExperienceMin(exp, row.experience_min)) return false;
    return true;
  });

  const accessoryByLift = (liftHint) => {
    const mapped = accessoryPool.filter((x) => {
      const l = String(x.lift || '').trim().toLowerCase();
      if (liftHint === 'upper') return l === 'upper';
      if (liftHint === 'lower') return l === 'lower';
      if (liftHint === 'core') return l === 'core';
      return true;
    });
    return pickDeterministic(mapped, (x) => x.id) || pickDeterministic(accessoryPool, (x) => x.id);
  };

  return days.map((day) => {
    const exercises = [];

    for (const ex of day.exposures) {
      const chosen = findExercise(ex.lift, ex.intensityType, ex.weeklyRole);
      if (!chosen) continue;
      exercises.push({
        baseId: String(chosen.id),
        name: String(chosen.name),
        kind: ex.lift === 'bench' ? 'main_upper' : 'main_lower',
        powerlifting: {
          lift: ex.lift,
          weeklyRole: ex.weeklyRole,
          intensityType: ex.intensityType,
          fatigueCost: chosen.fatigue_cost,
          skillRequirement: chosen.skill_requirement,
          percentageRange: chosen.percentage_range,
          repRange: chosen.rep_range,
          rpeRange: chosen.rpe_range,
          category: chosen.category
        }
      });
    }

    // Accessories: 2 slots (upper pull + core) by default; 3 on 5-6 day plans.
    const accessorySlots = d >= 5 ? 3 : 2;
    const upper = accessoryByLift('upper');
    const core = accessoryByLift('core');
    const lower = accessoryByLift('lower');
    const acc = [upper, core, d >= 5 ? lower : null].filter(Boolean).slice(0, accessorySlots);
    for (const a of acc) {
      exercises.push({
        baseId: String(a.id),
        name: String(a.name),
        kind: a.lift === 'core' ? 'assist_core' : (a.lift === 'lower' ? 'assist_lower' : 'assist_upper'),
        powerlifting: {
          lift: String(a.lift || '').toLowerCase(),
          weeklyRole: 'accessory',
          intensityType: 'accessory',
          fatigueCost: a.fatigue_cost,
          skillRequirement: a.skill_requirement,
          percentageRange: a.percentage_range,
          repRange: a.rep_range,
          rpeRange: a.rpe_range,
          category: a.category
        }
      });
    }

    return { label: day.label, focus: day.focus, exercises };
  });
}

function prescribing(discipline, exerciseKind, weekMeta, experience, exercise) {
  const exp = normalizeExperience(experience);

  if (discipline === 'powerlifting') {
    const pl = exercise?.powerlifting && typeof exercise.powerlifting === 'object' ? exercise.powerlifting : null;
    const intensityType = String(pl?.intensityType || '').trim().toLowerCase() || null;
    const range = Array.isArray(pl?.percentageRange) ? pl.percentageRange : null;
    const delta = Number(weekMeta?.pl?.delta || 0);
    const deload = Boolean(weekMeta?.pl?.deload);
    const deloadPct = chooseDeloadPct();

    const maxIntensity = exp === 'advanced' ? 0.95 : exp === 'intermediate' ? 0.92 : 0.88;
    const clampPct = (p) => Math.max(0.50, Math.min(maxIntensity, p));
    const pctMid = (lo, hi) => (Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : null);

    const repRange = Array.isArray(pl?.repRange) ? pl.repRange : null;
    const repsFromRange = repRange && repRange.length === 2
      ? `${Math.max(1, Number(repRange[0]) || 1)}-${Math.max(1, Number(repRange[1]) || 1)}`
      : null;

    if (intensityType === 'heavy_single') {
      const lo = Number(range?.[0] ?? 0.88);
      const hi = Number(range?.[1] ?? 0.93);
      const pctBase = clampPct((pctMid(lo, hi) ?? 0.90) + delta);
      const pct = deload ? clampPct(pctBase * deloadPct.loadMult) : pctBase;
      const setsBase = exp === 'advanced' ? 3 : 2;
      const sets = deload ? Math.max(1, Math.round(setsBase * deloadPct.setMult)) : setsBase;
      return { sets, reps: '1', restSec: 240, pct };
    }

    if (intensityType === 'strength') {
      const lo = Number(range?.[0] ?? 0.75);
      const hi = Number(range?.[1] ?? 0.85);
      const pctBase = clampPct((pctMid(lo, hi) ?? 0.80) + delta);
      const pct = deload ? clampPct(pctBase * deloadPct.loadMult) : pctBase;
      const setsBase = 4;
      const sets = deload ? Math.max(1, Math.round(setsBase * deloadPct.setMult)) : setsBase;
      return { sets, reps: repRange ? String(Math.min(5, Math.max(3, Number(repRange[1]) || 5))) : '4', restSec: 210, pct };
    }

    if (intensityType === 'volume') {
      const lo = Number(range?.[0] ?? 0.62);
      const hi = Number(range?.[1] ?? 0.75);
      const pctBase = clampPct((pctMid(lo, hi) ?? 0.70) + delta);
      const pct = deload ? clampPct(pctBase * deloadPct.loadMult) : pctBase;
      const setsBase = 4;
      const sets = deload ? Math.max(1, Math.round(setsBase * deloadPct.setMult)) : setsBase;
      return { sets, reps: repsFromRange || '6-8', restSec: 150, pct };
    }

    if (intensityType === 'technique') {
      const lo = Number(range?.[0] ?? 0.60);
      const hi = Number(range?.[1] ?? 0.72);
      const pctBase = clampPct((pctMid(lo, hi) ?? 0.66) + delta);
      const pct = deload ? clampPct(pctBase * deloadPct.loadMult) : pctBase;
      const setsBase = 3;
      const sets = deload ? Math.max(1, Math.round(setsBase * deloadPct.setMult)) : setsBase;
      return { sets, reps: repsFromRange || '3', restSec: 150, pct };
    }

    // Accessories: no % prescription.
    if (exerciseKind === 'assist_lower') return { sets: 3, reps: exp === 'advanced' ? '8-12' : '10-12', restSec: 120, pct: null };
    if (exerciseKind === 'assist_upper') return { sets: 3, reps: exp === 'advanced' ? '8-12' : '10-15', restSec: 90, pct: null };
    if (exerciseKind === 'assist_core') return { sets: 3, reps: '10-15', restSec: 60, pct: null };
    return { sets: 3, reps: '10-15', restSec: 90, pct: null };
  }

  if (discipline === 'bodybuilding') {
    const deload = weekMeta?.repBias === 'deload';
    const subTier = clampInt(exercise?.experienceSubTier ?? weekMeta?.experienceSubTier, 1, 3, 1);
    const stimulus = String(exercise?.stimulusType || '').toLowerCase();
    const role = String(exercise?.slotRole || '').toUpperCase();
    const isMainRole = role === 'MAIN';
    const isSecondaryRole = role === 'SECONDARY';
    const isWeakpointRole = role === 'WEAKPOINT';
    const isIsoRole = role === 'ISOLATION';
    const isCompound = stimulus === 'compound' || isMainRole || isSecondaryRole || String(exerciseKind || '').includes('main');
    const isFoundation = Boolean(exercise?.foundationFlag) || isMainRole;
    const isWeakpointIso = isWeakpointRole || String(exercise?.intentKey || '').toLowerCase() === 'accessory_flex';

    const compoundPctFromReps = (reps) => {
      const rr = parseRepRange(reps);
      const hi = rr?.max ?? null;
      if (!hi) return 0.72;
      if (hi <= 6) return 0.78;
      if (hi <= 8) return 0.75;
      if (hi <= 10) return 0.72;
      return 0.70;
    };

    const mainSets = exp === 'advanced' ? 5 : exp === 'intermediate' ? 4 : 3;
    const secondarySets = exp === 'advanced' ? 4 : exp === 'intermediate' ? 3 : 2;
    const isoSets = exp === 'advanced' ? 4 : exp === 'intermediate' ? 3 : 2;
    const weakpointSets = exp === 'advanced' ? 4 : exp === 'intermediate' ? 4 : 3;
    const deloadSets = (s) => clampInt(Math.round(s * 0.65), 1, 10, s);

    const compoundRir = subTier >= 3 ? 0 : subTier <= 1 ? 2 : 1;
    const isoRir = subTier >= 3 ? 0 : 1;

    if (isCompound) {
      const isMain = isMainRole || isFoundation;
      const reps = isMain ? '6-10' : '8-12';
      const repsOut = deload ? (isMain ? '8-10' : '10-12') : reps;
      const pct = compoundPctFromReps(repsOut);
      const setsBase = isMain ? mainSets : secondarySets;
      const sets = deload ? deloadSets(setsBase) : setsBase;
      const cap = isMain ? 5 : 4;
      return {
        sets: Math.min(sets, cap),
        reps: repsOut,
        restSec: isMain ? 180 : 135,
        pct,
        rirTarget: compoundRir
      };
    }

    const reps = isWeakpointIso ? '12-25' : '10-20';
    const repsOut = deload ? '12-15' : reps;
    const setsBase = isWeakpointIso ? weakpointSets : isoSets;
    const sets = deload ? deloadSets(setsBase) : setsBase;
    const cap = 4;
    return {
      sets: Math.min(sets, cap),
      reps: repsOut,
      restSec: isWeakpointIso ? 60 : 75,
      pct: 0.65,
      rirTarget: isoRir
    };
  }

  const deload = weekMeta?.repBias === 'deload';
  if (exerciseKind === 'skill') return { sets: deload ? 2 : 3, reps: '10-15m', restSec: 60, pct: null };
  if (exerciseKind === 'assist_cond') return { sets: 1, reps: deload ? '15-20m' : '20-30m', restSec: 0, pct: null };
  if (exerciseKind === 'assist_mob') return { sets: 1, reps: deload ? '8-10m' : '10-15m', restSec: 0, pct: null };
  if (exerciseKind === 'main_lower') return { sets: deload ? 2 : 4, reps: deload ? '8-10' : '6-12', restSec: 90, pct: null };
  return { sets: deload ? 2 : 4, reps: deload ? '8-12' : '6-12', restSec: 90, pct: null };
}

function estimateStrengthBaselines(input) {
  const discipline = String(input?.discipline || '').trim().toLowerCase();
  const experience = normalizeExperience(input?.experience);

  if (discipline === 'powerlifting') {
    const squat = lbs(input?.strength?.squat);
    const bench = lbs(input?.strength?.bench);
    const deadlift = lbs(input?.strength?.deadlift);
    const squatAdj = squat ? squat * recencyFactor(input?.strength?.squatDate) : null;
    const benchAdj = bench ? bench * recencyFactor(input?.strength?.benchDate) : null;
    const deadliftAdj = deadlift ? deadlift * recencyFactor(input?.strength?.deadliftDate) : null;
    const tmFactor = 0.9;
    return {
      squat1rm: squatAdj ? roundTo(squatAdj, 5) : squat,
      bench1rm: benchAdj ? roundTo(benchAdj, 2.5) : bench,
      deadlift1rm: deadliftAdj ? roundTo(deadliftAdj, 5) : deadlift,
      trainingMax: {
        squat: squatAdj ? roundTo(squatAdj * tmFactor, 5) : (squat ? roundTo(squat * tmFactor, 5) : null),
        bench: benchAdj ? roundTo(benchAdj * tmFactor, 2.5) : (bench ? roundTo(bench * tmFactor, 2.5) : null),
        deadlift: deadliftAdj ? roundTo(deadliftAdj * tmFactor, 5) : (deadlift ? roundTo(deadlift * tmFactor, 5) : null)
      },
      experience
    };
  }

  if (discipline === 'bodybuilding') {
    const hasV2 = input?.strength?.benchWeight != null || input?.strength?.lowerWeight != null || input?.strength?.hingeWeight != null;
    const bw = lbs(input?.strength?.bodyweight);
    const height = clampInt(input?.strength?.height, 36, 96, null);
    const trainingAgeYears = experience === 'advanced'
      ? 6
      : experience === 'intermediate'
        ? 3
        : 1;
    const goalMode = String(input?.strength?.goalMode || '').trim().toLowerCase() || null;
    const injury = input?.strength?.injury && typeof input.strength.injury === 'object' ? input.strength.injury : null;
    const phase = String(input?.strength?.phase || input?.phase || '').trim().toLowerCase() || null;
    const targetWeightLb = Number(input?.strength?.targetWeightLb ?? input?.targetWeightLb);
    const trainingAgeBucket = trainingAgeBand(input?.strength?.trainingAgeBucket || input?.trainingAgeBucket);
    const timePerSession = String(input?.strength?.timePerSession || input?.timePerSession || '').trim().toLowerCase() || null;
    const equipmentStylePref = String(input?.strength?.equipmentStylePref || input?.equipmentStylePref || 'mix').trim().toLowerCase();
    const emphasis = normalizeEmphasisList(input?.strength?.emphasis || input?.emphasis);
    const injurySeverityByJoint = input?.strength?.injurySeverityByJoint && typeof input.strength.injurySeverityByJoint === 'object'
      ? input.strength.injurySeverityByJoint
      : {};

    let press1rm = null;
    let pull1rm = null;
    let leg1rm = null;
    let hinge1rm = null;
    let pullBaselineConfidence = 'low';
    const workingWeights = {
      press: lbs(input?.strength?.benchWeight),
      pull: lbs(input?.strength?.pullWeight),
      lower: lbs(input?.strength?.lowerWeight),
      hinge: lbs(input?.strength?.hingeWeight)
    };
    const benchMax = lbs(input?.strength?.bench);
    const squatMax = lbs(input?.strength?.squat);
    const deadliftMax = lbs(input?.strength?.deadlift);

    if (hasV2) {
      const bench1rmRaw = epley1rm(input?.strength?.benchWeight, input?.strength?.benchReps);
      const lower1rmRaw = epley1rm(input?.strength?.lowerWeight, input?.strength?.lowerReps);
      const hinge1rmRaw = epley1rm(input?.strength?.hingeWeight, input?.strength?.hingeReps);
      press1rm = bench1rmRaw ? roundTo(bench1rmRaw, 5) : null;
      hinge1rm = hinge1rmRaw ? roundTo(hinge1rmRaw, 5) : null;
      const legProxy = Math.max(Number(lower1rmRaw || 0), Number(hinge1rmRaw || 0) * 0.9);
      leg1rm = legProxy > 0 ? roundTo(legProxy, 5) : null;
      pull1rm = press1rm ? roundTo(press1rm * 0.9, 5) : null;
      const pullAnchor = epley1rm(input?.strength?.pullWeight, input?.strength?.pullReps);
      if (pullAnchor) {
        pull1rm = roundTo(pullAnchor, 5);
        pullBaselineConfidence = 'high';
      }
    } else {
      const press1rmRaw = epley1rm(input?.strength?.pressWeight, input?.strength?.pressReps);
      const pull1rmRaw = epley1rm(input?.strength?.pullWeight, input?.strength?.pullReps);
      const leg1rmRaw = epley1rm(input?.strength?.legWeight, input?.strength?.legReps);
      press1rm = press1rmRaw ? press1rmRaw * recencyFactor(input?.strength?.pressDate) : null;
      pull1rm = pull1rmRaw ? pull1rmRaw * recencyFactor(input?.strength?.pullDate) : null;
      leg1rm = leg1rmRaw ? leg1rmRaw * recencyFactor(input?.strength?.legDate) : null;
      press1rm = press1rm ? roundTo(press1rm, 5) : null;
      pull1rm = pull1rm ? roundTo(pull1rm, 5) : null;
      leg1rm = leg1rm ? roundTo(leg1rm, 5) : null;
    }

    if (!press1rm && Number.isFinite(benchMax) && benchMax > 0) {
      press1rm = roundTo(benchMax, 5);
    }
    if (!leg1rm && Number.isFinite(squatMax) && squatMax > 0) {
      leg1rm = roundTo(squatMax, 5);
    }
    if (!hinge1rm && Number.isFinite(deadliftMax) && deadliftMax > 0) {
      hinge1rm = roundTo(deadliftMax, 5);
    }
    if (!pull1rm) {
      const fallbackPull = Math.max(
        Number(press1rm || 0) * 0.9,
        Number(hinge1rm || 0) * 0.6,
        Number(leg1rm || 0) * 0.6
      );
      pull1rm = fallbackPull > 0 ? roundTo(fallbackPull, 5) : pull1rm;
    }
    if ((!press1rm || !leg1rm || !hinge1rm || !pull1rm) && Number.isFinite(bw)) {
      const fallback = fallbackStrengthFromBodyweight(experience, bw);
      if (fallback) {
        if (!press1rm) press1rm = fallback.press1rm;
        if (!leg1rm) leg1rm = fallback.leg1rm;
        if (!hinge1rm) hinge1rm = fallback.hinge1rm;
        if (!pull1rm) pull1rm = fallback.pull1rm;
      }
    }
    if (!Number.isFinite(workingWeights.press) && Number.isFinite(press1rm)) {
      workingWeights.press = roundTo(press1rm * 0.7, 2.5);
    }
    if (!Number.isFinite(workingWeights.pull) && Number.isFinite(pull1rm)) {
      workingWeights.pull = roundTo(pull1rm * 0.7, 2.5);
    }
    if (!Number.isFinite(workingWeights.lower) && Number.isFinite(leg1rm)) {
      workingWeights.lower = roundTo(leg1rm * 0.7, 5);
    }
    if (!Number.isFinite(workingWeights.hinge) && Number.isFinite(hinge1rm)) {
      workingWeights.hinge = roundTo(hinge1rm * 0.7, 5);
    }

      return {
        bodyweight: bw,
        heightIn: height,
        trainingAgeYears,
        trainingAgeBucket,
        timePerSession,
        phase,
        targetWeightLb: Number.isFinite(targetWeightLb) ? targetWeightLb : null,
        equipmentStylePref,
        emphasis,
        injurySeverityByJoint,
        pullBaselineConfidence,
        goalMode,
        injury,
        press1rm,
        pull1rm,
        leg1rm,
        hinge1rm,
        workingWeights,
        experience
      };
  }

  if (discipline === 'calisthenics') {
    const normalizeGoalList = (raw) => {
      const src = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : []);
      const out = [];
      for (const x of src) {
        const v = String(x || '').trim().toLowerCase();
        if (!v) continue;
        const mapped = v === 'hypertrophy' ? 'hypertrophy'
          : v === 'strength' ? 'strength'
            : v === 'endurance' ? 'endurance'
              : v === 'skill' || v === 'skills' ? 'skill'
                : null;
        if (!mapped) continue;
        if (!out.includes(mapped)) out.push(mapped);
      }
      return out;
    };

    const normalizeEquipment = (raw) => {
      const src = raw && typeof raw === 'object' ? raw : {};
      const keys = ['bar', 'rings', 'bands', 'weights', 'none'];
      const out = {};
      keys.forEach((k) => { out[k] = Boolean(src[k]); });
      if (!Object.values(out).some(Boolean)) out.none = true;
      if (out.none) {
        out.bar = false;
        out.rings = false;
        out.bands = false;
        out.weights = false;
      }
      return out;
    };

    const normalizePreferredSkills = (raw) => {
      const src = Array.isArray(raw) ? raw : [];
      const out = [];
      for (const x of src) {
        const v = String(x || '').trim().toLowerCase();
        if (!v) continue;
        const mapped = v === 'handstand' ? 'handstand'
          : (v === 'muscleup' || v === 'muscle_up' || v === 'muscle-up') ? 'muscle_up'
            : (v === 'l_sit' || v === 'l-sit' || v === 'lsit') ? 'l_sit'
              : (v === 'front_lever' || v === 'front-lever' || v === 'frontlever') ? 'front_lever'
                : (v === 'planche') ? 'planche'
                  : null;
        if (!mapped) continue;
        if (!out.includes(mapped)) out.push(mapped);
      }
      return out.slice(0, 6);
    };

    const fatigueRaw = String(input?.strength?.fatigue || '').trim().toLowerCase();
    const fatigue = fatigueRaw === 'high' ? 'high' : fatigueRaw === 'medium' ? 'medium' : fatigueRaw === 'low' ? 'low' : null;

    return {
      pushups: clampInt(input?.strength?.pushups, 0, 300, 0),
      pullups: clampInt(input?.strength?.pullups, 0, 100, 0),
      dips: clampInt(input?.strength?.dips, 0, 200, 0),
      holds: {
        hollowHoldSec: clampNumber(input?.strength?.hollowHoldSec, 0, 600, null),
        supportHoldSec: clampNumber(input?.strength?.supportHoldSec, 0, 600, null),
        handstandHoldSec: clampNumber(input?.strength?.handstandHoldSec, 0, 600, null)
      },
      equipment: normalizeEquipment(input?.strength?.equipment),
      goals: normalizeGoalList(input?.strength?.goals),
      fatigue,
      preferredSkills: normalizePreferredSkills(input?.strength?.preferredSkills),
      skills: {
        handstand: Boolean(input?.strength?.handstand),
        muscleUp: Boolean(input?.strength?.muscleUp)
      },
      experience
    };
  }

  return { experience };
}

function projectedForExercise({ discipline, exercise, exerciseEntry, exerciseKind, baselines, prescription, weekIndex }) {
  if (discipline === 'powerlifting') {
    const inc = exercise.baseId === 'bench' || exercise.baseId.startsWith('bench') ? 2.5 : 5;
    const tms = baselines?.trainingMax || {};
    const tm = exercise.baseId.includes('squat') ? tms.squat
      : exercise.baseId.includes('dead') ? tms.deadlift
        : exercise.baseId.includes('bench') ? tms.bench
          : null;
    if (prescription?.pct && tm) return { value: pctOfTrainingMax(tm, prescription.pct, inc), unit: 'lb' };
    return { value: null, unit: 'lb' };
  }

  if (discipline === 'bodybuilding') {
    const kind = String(exerciseKind || '').toLowerCase();
    const stimulus = String(exercise?.stimulusType || '').toLowerCase();
    const movement = String(exercise?.movementPattern || '').toLowerCase();
    const muscleKeys = Array.isArray(exercise?.muscleKeys) ? exercise.muscleKeys : [];
    const entry = exerciseEntry || null;
    if (entry && nonLoadExercise(entry)) return { value: null, unit: 'lb', confidence: 'low' };

    const eqClass = entry ? equipmentClass(entry) : String(exercise?.equipmentClass || '').toLowerCase() || null;
    if (eqClass === 'bodyweight') return { value: null, unit: 'bw', confidence: 'low' };

    const baseKey = (() => {
      if (stimulus === 'isolation') {
        if (muscleKeys.some((m) => ['biceps', 'lats', 'upperBack'].includes(m))) return 'pull1rm';
        if (muscleKeys.some((m) => ['quads'].includes(m))) return 'leg1rm';
        if (muscleKeys.some((m) => ['hamstrings', 'glutes'].includes(m))) return 'hinge1rm';
        if (muscleKeys.some((m) => ['calves', 'abs'].includes(m))) return 'leg1rm';
        return 'press1rm';
      }
      if (movement === 'squat') return 'leg1rm';
      if (movement === 'hinge') return 'hinge1rm';
      if (movement === 'row' || movement === 'vertical_pull') return 'pull1rm';
      return 'press1rm';
    })();

    const base = pickBaselineValue(baselines, [
      baseKey,
      'press1rm',
      'pull1rm',
      'leg1rm',
      'hinge1rm'
    ]);

    const pullConf = String(baselines?.pullBaselineConfidence || 'low').toLowerCase();
    const confidence = eqClass === 'barbell'
      ? (baseKey === 'pull1rm' && pullConf === 'low' ? 'medium' : 'high')
      : eqClass === 'dumbbell'
        ? 'medium'
        : 'low';

    if (Number.isFinite(base) && base > 0) {
      const ratio = ratioForExercise({
        movement,
        name: entry?.name || exercise?.name || '',
        stimulus: stimulus || (kind.includes('main') ? 'compound' : 'isolation'),
        muscleKeys,
        eqClass
      });
      const pct = Number(prescription?.pct);
      const rr = parseRepRange(prescription?.reps);
      const repMax = rr?.max ?? null;
      let basePct = stimulus === 'isolation' ? 0.55 : 0.62;
      if (Number.isFinite(repMax)) {
        if (repMax >= 15) basePct = 0.5;
        else if (repMax >= 12) basePct = 0.55;
        else if (repMax >= 10) basePct = 0.6;
        else if (repMax >= 6) basePct = 0.65;
      }
      const subTierMeta = computeStrengthSubTier({
        bodyweight: baselines?.bodyweight,
        bench1rm: baselines?.press1rm,
        squat1rm: baselines?.leg1rm,
        deadlift1rm: baselines?.hinge1rm
      });
      const eliteFlag = Object.values(subTierMeta?.flags || {}).some((v) => v === 'possible_elite');
      const tier = Number(subTierMeta?.tier || 1);
      const conservativeMult = eliteFlag ? 0.65 : tier >= 3 ? 0.7 : tier === 2 ? 0.75 : 0.8;
      const pctUsed = Number.isFinite(pct) && pct > 0 ? pct : (basePct * conservativeMult);
      const inc = (movement === 'squat' || movement === 'hinge') ? 5 : 2.5;
      const bump = weekIndex >= 1 && weekIndex <= 2 ? 1.015 : 1;
      const est1rm = Number.isFinite(ratio) ? base * ratio : null;
      let value = Number.isFinite(est1rm) ? roundTo(est1rm * pctUsed * bump, inc) : null;
      const cap = Number.isFinite(est1rm)
        ? Math.min(est1rm, est1rm * (stimulus === 'isolation' ? 0.7 : 0.8))
        : null;
      if (Number.isFinite(value) && Number.isFinite(cap)) value = Math.min(value, cap);
      if (Number.isFinite(value)) value = Math.max(5, value);
      const ww = baselines?.workingWeights && typeof baselines.workingWeights === 'object' ? baselines.workingWeights : {};
      const clampWeight = baseKey === 'press1rm'
        ? ww.press
        : baseKey === 'pull1rm'
          ? ww.pull
          : baseKey === 'hinge1rm'
            ? ww.hinge
            : ww.lower;
      if (Number.isFinite(clampWeight) && clampWeight > 0 && Number.isFinite(value)) {
        value = Math.min(value, clampWeight * 1.35);
      }
      return { value: Number.isFinite(value) ? value : null, unit: 'lb', confidence };
    }
    return { value: null, unit: 'lb', confidence };
  }

  if (discipline === 'calisthenics') {
    const pullups = baselines?.pullups || 0;
    const dips = baselines?.dips || 0;
    const equip = baselines?.equipment && typeof baselines.equipment === 'object' ? baselines.equipment : {};
    const hasWeights = Boolean(equip.weights);
    if (exercise.baseId.includes('pull') && pullups >= 12 && hasWeights) return { value: 10, unit: 'lb', note: 'Add load' };
    if (exercise.baseId.includes('dip') && dips >= 15 && hasWeights) return { value: 15, unit: 'lb', note: 'Add load' };
    return { value: null, unit: 'bw', note: 'Bodyweight' };
  }

  return { value: null, unit: 'lb' };
}

function generatePlan(input) {
  const discipline = String(input?.discipline || '').trim().toLowerCase();
  if (!['powerlifting', 'bodybuilding', 'calisthenics'].includes(discipline)) {
    throw new Error('Invalid discipline');
  }

  const daysPerWeek = clampInt(input?.daysPerWeek, 2, 6, 3);
  const experience = normalizeExperience(input?.experience);
  const baselines = estimateStrengthBaselines({ discipline, strength: input?.strength, experience });
  const strengthSubTier = discipline === 'bodybuilding'
    ? computeStrengthSubTier({
      bodyweight: baselines?.bodyweight,
      bench1rm: baselines?.press1rm,
      squat1rm: baselines?.leg1rm,
      deadlift1rm: baselines?.hinge1rm
    })
    : null;
  const weeksMeta = weekProgressionPattern(discipline, experience);

  const powerliftingEventType = discipline === 'powerlifting'
    ? normalizePowerliftingEventType(input?.strength?.eventType)
    : null;
  const powerliftingSeedDeloadWeeks = discipline === 'powerlifting'
    ? weeksMeta
      .map((wm, idx) => (wm?.pl?.deload ? idx + 1 : null))
      .filter((n) => Number.isFinite(Number(n)) && Number(n) > 0)
    : [];

  const template = discipline === 'powerlifting'
    ? (buildPowerliftingTemplateV2({ daysPerWeek, experience, eventType: powerliftingEventType }) || buildPowerliftingTemplate(daysPerWeek))
    : discipline === 'bodybuilding'
      ? buildBodybuildingTemplate(daysPerWeek)
      : buildCalisthenicsTemplate(daysPerWeek, baselines);

  const bodybuildingMeta = discipline === 'bodybuilding'
    ? {
      phase: String(input?.strength?.phase || input?.phase || 'bulk').trim().toLowerCase(),
      targetWeightLb: Number(input?.strength?.targetWeightLb ?? input?.targetWeightLb) || null,
      trainingAgeBucket: trainingAgeBand(input?.strength?.trainingAgeBucket || input?.trainingAgeBucket),
      timePerSession: String(input?.strength?.timePerSession || input?.timePerSession || '').trim().toLowerCase(),
      equipmentStylePref: String(input?.strength?.equipmentStylePref || input?.equipmentStylePref || 'mix').trim().toLowerCase(),
      emphasis: normalizeEmphasisList(input?.strength?.emphasis || input?.emphasis),
      experienceSubTier: strengthSubTier?.tier || 1,
      injuryProfile: input?.strength?.injurySeverityByJoint && typeof input.strength.injurySeverityByJoint === 'object'
        ? input.strength.injurySeverityByJoint
        : {},
      equipmentAccess: input?.equipmentAccess || input?.strength?.equipmentAccess || {}
    }
    : null;

  const defaults = experienceDefaults(experience);

  const bbTargets = discipline === 'bodybuilding'
    ? computeVolumeTargets({
      experienceTier: experience,
      experienceSubTier: bodybuildingMeta?.experienceSubTier,
      emphasis: bodybuildingMeta?.emphasis,
      timePerSession: bodybuildingMeta?.timePerSession,
      daysPerWeek
    })
    : null;
  const bbPriorityMuscles = discipline === 'bodybuilding'
    ? resolvePriorityMuscles(bodybuildingMeta?.emphasis)
    : [];
  const bbWseBudget = discipline === 'bodybuilding'
    ? wseBudgetForPlan({ timePerSession: bodybuildingMeta?.timePerSession, daysPerWeek })
    : null;
  const planWarnings = [];

  const weeks = weeksMeta.map((wm, weekIndex) => {
    const usedWeek = new Set();
    const weekNameSet = new Set();
    const weekMuscleTally = initTargetTally(bbTargets?.targets || {});
    const priorityIsoState = discipline === 'bodybuilding' ? initPriorityIsoState(bbPriorityMuscles) : null;
    const days = template.map((day, dayIndex) => {
      if (discipline !== 'bodybuilding') {
        const exercises = [];
        for (const ex of day.exercises || []) {
          const templateRx = discipline === 'calisthenics' && ex?.prescription && typeof ex.prescription === 'object' ? ex.prescription : null;
          const prescription = templateRx || prescribing(discipline, ex.kind, wm, experience, ex);
          const projected = projectedForExercise({
            discipline,
            exercise: ex,
            exerciseKind: ex.kind,
            baselines,
            prescription,
            weekIndex
          });
          const baseId = String(ex.baseId);
          const increment = baseId.includes('bench') || baseId.includes('press') ? defaults.mainIncUpper : defaults.mainIncLower;

          exercises.push({
            id: `${baseId}:${weekIndex + 1}:${dayIndex + 1}:${exercises.length + 1}`,
            baseId,
            exerciseId: null,
            name: ex.name,
            sets: prescription.sets,
            reps: prescription.reps,
            restSec: prescription.restSec,
            projected,
            block: ex?.block || null,
            tempo: ex?.tempo || null,
            coaching: ex?.coaching && typeof ex.coaching === 'object' ? ex.coaching : null,
            tags: discipline === 'powerlifting'
              ? (ex.powerlifting && typeof ex.powerlifting === 'object' ? ex.powerlifting : null)
              : null,
            substitutions: exerciseSubstitutions({ discipline, baseId }),
            progression: (() => {
              if (discipline === 'calisthenics') {
                const rr = parseRepRange(prescription.reps);
                const repsTarget = rr ? rr.max : null;
                return { type: 'reps', repsTarget, technique: 'none' };
              }
              return { type: 'load', increment };
            })()
          });
        }
        return {
          id: `day:${weekIndex + 1}:${dayIndex + 1}`,
          label: day.label,
          focus: day.focus,
          exercises
        };
      }

      let usedWeekTemp = null;
      const buildBodybuildingDay = ({ strictMode, pickOffset }) => {
        const usedDay = new Set();
        const daySignatureSet = new Set();
        const dayIntentSet = new Set();
        const dayIsolationFamilies = new Set();
        let dayLeverageCount = 0;
        const muscleTally = initTargetTally(bbTargets?.targets || {});
        const exercises = [];
        const dayKey = `w${weekIndex + 1}-d${dayIndex + 1}`;
        const dayType = dayTypeFromFocus(day.focus);
        const backPriority = bbPriorityMuscles.includes('lats') || bbPriorityMuscles.includes('upperBack');
        const preferredMajorityBucket = normalizeEquipmentMajorityBucket(bodybuildingMeta?.equipmentStylePref || 'mix');
        const equipmentBucketCounts = { free: 0, machine: 0, other: 0 };

        for (let slotIndex = 0; slotIndex < (day.exercises || []).length; slotIndex += 1) {
          const slot = (day.exercises || [])[slotIndex];
          let slotIntent = chooseIntentForInjury(String(slot.intentKey), bodybuildingMeta?.injuryProfile || {});
          let slotMuscles = Array.isArray(slot.muscleKeys) ? slot.muscleKeys.slice() : [];
          let searchHintOverride = null;
          let slotRoleOverride = null;
          let slotStimulusOverride = null;
          let slotMovementOverride = null;
          const requiredGroup = intentGroupForSlot(slotIntent, day.focus);
          const focus = String(day.focus || '').toLowerCase();
          const isLower = focus.includes('legs') || focus.includes('lower');
          const isPullDay = focus.includes('pull') && !focus.includes('lower');

          if (focus.includes('push') && slotIndex === 0) {
            slotIntent = 'chest_press_horizontal_compound';
          }
          if (isPullDay && slotIndex === 0) {
            slotIntent = 'lats_vertical_pull_compound';
          }
          const requiredPlaced = dayIntentSet.has('chest_press_horizontal_compound')
            || dayIntentSet.has('chest_press_incline_compound')
            || dayIntentSet.has('lats_vertical_pull_compound')
            || dayIntentSet.has('upperBack_horizontal_row_compound')
            || dayIntentSet.has('quads_knee_dominant_compound')
            || dayIntentSet.has('hamstrings_hip_hinge_compound');
          const isIsolationSlot = String(slot.stimulusType || '').toLowerCase() === 'isolation'
            || String(slot.intentKey || '').includes('calves')
            || String(slot.intentKey || '').includes('abs');
          if (!requiredPlaced && isIsolationSlot) {
            if (focus.includes('push')) slotIntent = 'chest_press_incline_compound';
            else if (isPullDay) slotIntent = 'upperBack_horizontal_row_compound';
            else if (isLower) slotIntent = 'hamstrings_hip_hinge_compound';
          }
          if (isLower && slotIndex === 0 && slotIntent === 'quads_knee_dominant_compound' && !searchHintOverride) {
            searchHintOverride = 'hack squat machine';
          }

          const forcedIntent = isIsolationSlot ? pickForcedPriorityIntent(dayKey, dayIntentSet, priorityIsoState, dayType, daysPerWeek) : null;
          if (forcedIntent) {
            slotIntent = forcedIntent.intent;
            const forcedMuscle = forcedIntent.muscleKey || null;
            if (forcedMuscle) slotMuscles = [forcedMuscle];
            searchHintOverride = forcedMuscle ? (ACCESSORY_FLEX_HINTS[forcedMuscle] || null) : null;
            if (forcedIntent.forceCompound) {
              slotStimulusOverride = 'compound';
              slotRoleOverride = 'SECONDARY';
              slotMovementOverride = INTENT_MOVEMENT_OVERRIDES[slotIntent] || null;
            }
          } else if (slotIntent === 'accessory_flex') {
            const avoid = slotMuscles.slice();
            const pickMuscle = chooseAccessoryFlexMuscle({
              targets: bbTargets?.targets,
              weekTally: weekMuscleTally,
              dayTally: muscleTally,
              avoid,
              dayType,
              daysPerWeek
            });
            slotMuscles = [pickMuscle];
            searchHintOverride = ACCESSORY_FLEX_HINTS[pickMuscle] || null;
          }

          const supersetId = slotIntent === 'arms_superset_isolation'
            ? `ss:${weekIndex + 1}:${dayIndex + 1}:${slot.slotId}`
            : null;

          const buildExercise = (intentKey, muscleKeys, hintOverride) => {
            const remainingSlotsCount = Math.max(0, ((day.exercises || []).length - slotIndex - 1));
            const intentSlot = {
              ...slot,
              intentKey,
              muscleKeys,
              experienceSubTier: bodybuildingMeta?.experienceSubTier,
              slotRole: slotRoleOverride || slot.slotRole,
              stimulusType: slotStimulusOverride || slot.stimulusType,
              movementPattern: slotMovementOverride || slot.movementPattern
            };
            const selection = selectExerciseForIntent({
              intentKey,
              slot: intentSlot,
              equipmentAccess: bodybuildingMeta?.equipmentAccess || {},
              equipmentStylePref: bodybuildingMeta?.equipmentStylePref || 'mix',
              usedDay,
              usedWeek: usedWeekTemp,
              allowWeekRepeat: Boolean(slot.foundationFlag),
              searchHintOverride: hintOverride,
              daySignatureSet,
              dayIntentSet,
              strict: strictMode,
              injuryProfile: bodybuildingMeta?.injuryProfile || {},
              dayLeverageCount,
              weekNameSet,
              backPriority,
              dayIsolationFamilies,
              disallowBodyweight: true,
              disallowCalisthenics: true,
              forceHackSquatStart: isLower && slotIndex === 0 && intentKey === 'quads_knee_dominant_compound',
              pickOffset,
              preferredMajorityBucket,
              equipmentBucketCounts,
              remainingSlotsCount
            });

            if (!selection.exerciseId && requiredGroup && requiredGroup.includes(intentKey)) {
              const relaxedSlot = { ...intentSlot, allowedEquipmentClass: ['any'] };
              const relaxedPick = selectExerciseForIntent({
                intentKey,
                slot: relaxedSlot,
                equipmentAccess: bodybuildingMeta?.equipmentAccess || {},
                equipmentStylePref: bodybuildingMeta?.equipmentStylePref || 'mix',
                usedDay,
                usedWeek: usedWeekTemp,
                allowWeekRepeat: Boolean(slot.foundationFlag),
                searchHintOverride: hintOverride,
                daySignatureSet,
                dayIntentSet,
                strict: strictMode,
                injuryProfile: bodybuildingMeta?.injuryProfile || {},
                dayLeverageCount,
                weekNameSet,
                backPriority,
                dayIsolationFamilies,
                disallowBodyweight: true,
                disallowCalisthenics: true,
                forceHackSquatStart: isLower && slotIndex === 0 && intentKey === 'quads_knee_dominant_compound',
                pickOffset,
                preferredMajorityBucket,
                equipmentBucketCounts,
                remainingSlotsCount
              });
              if (relaxedPick.exerciseId) {
                selection.exerciseId = relaxedPick.exerciseId;
                selection.swapCandidates = relaxedPick.swapCandidates;
                selection.equipmentClass = relaxedPick.equipmentClass;
                selection.name = relaxedPick.name || selection.name;
              }
            }

            const def = INTENT_DEFS[intentKey] || {};
            const exerciseKind = def.stimulusType === 'compound' ? 'main_upper' : 'assist_upper';
            const prescription = prescribing(discipline, exerciseKind, wm, experience, { ...intentSlot, stimulusType: def.stimulusType || slot.stimulusType });
            const entry = selection.exerciseId ? getExerciseById(selection.exerciseId) : null;
            const projectedFinal = projectedForExercise({
              discipline,
              exercise: intentSlot,
              exerciseEntry: entry,
              exerciseKind,
              baselines,
              prescription,
              weekIndex
            });

            const increment = (muscleKeys || []).some((m) => ['quads', 'hamstrings', 'glutes'].includes(m))
              ? defaults.mainIncLower
              : defaults.mainIncUpper;

            const eqClass = selection.equipmentClass || null;
            const signature = signatureForSlot(slot.movementPattern, muscleKeys || slot.muscleKeys || [], eqClass);
            const out = {
              id: `${intentKey}:${weekIndex + 1}:${dayIndex + 1}:${exercises.length + 1}`,
              baseId: intentKey,
              exerciseId: selection.exerciseId,
              name: normalizeBodybuildingExerciseName(selection.name || entry?.name || intentKey),
              slotId: slot.slotId,
              intentKey,
              slotRole: slot.slotRole || intentSlot.slotRole || null,
              muscleKeys: muscleKeys || slot.muscleKeys || [],
              movementPattern: slot.movementPattern,
              stimulusType: def.stimulusType || slot.stimulusType,
              foundationFlag: Boolean(slot.foundationFlag),
              allowedEquipmentClass: slot.allowedEquipmentClass || ['any'],
              equipmentClass: eqClass,
              signature,
              sets: prescription.sets,
              reps: prescription.reps,
              restSec: prescription.restSec,
              rirTarget: Number.isFinite(prescription.rirTarget) ? prescription.rirTarget : null,
              projected: projectedFinal,
              blockType: supersetId ? 'superset' : 'single',
              supersetId,
              swapCandidates: selection.swapCandidates || [],
              coaching: null,
              tags: null,
              substitutions: [],
              progression: (() => {
                const rr = parseRepRange(prescription.reps);
                const repsTarget = rr ? (experience === 'beginner' ? rr.max : rr.min) : null;
                return { type: 'load', increment, repsTarget, technique: 'none', setsCap: maxSetsForBodybuildingExercise({ ...slot, name: selection.name || entry?.name || intentKey }, backPriority) };
              })()
            };
            recordPriorityIso(out, dayKey, priorityIsoState);
            const contrib = countDirectSetsByTarget(out, Number(out.sets) || 0);
            for (const [mk, v] of Object.entries(contrib)) {
              muscleTally[mk] = (muscleTally[mk] || 0) + v;
            }
            if (out.name) {
              const nameNorm = String(out.name || '').toLowerCase();
              if (nameNorm.includes('pullover')) weekNameSet.add('pullover');
            }
            if (out.exerciseId && out.signature) daySignatureSet.add(out.signature);
            const bucket = equipmentBucketFromClass(out.equipmentClass);
            equipmentBucketCounts[bucket] = (equipmentBucketCounts[bucket] || 0) + 1;
            if (String(out.stimulusType || '').toLowerCase() === 'isolation') {
              const fam = isolationFamilyKey(out.name || '');
              if (fam) dayIsolationFamilies.add(fam);
            }
            if (selection.isLeverage) dayLeverageCount += 1;
            return out;
          };

          if (slotIntent === 'arms_superset_isolation') {
            exercises.push(buildExercise('biceps_curl_isolation', ['biceps']));
            exercises.push(buildExercise('triceps_extension_isolation', ['triceps']));
          } else {
            let intentCandidates = [slotIntent];
            if (requiredGroup) {
              const ordered = [slotIntent, ...requiredGroup];
              intentCandidates = Array.from(new Set(ordered));
            } else {
              const neighbors = INTENT_NEIGHBORS[slotIntent] || [];
              intentCandidates = Array.from(new Set([slotIntent, ...neighbors]));
            }

            if (isPullDay && slotIndex === 1) {
              const needRow = !dayIntentSet.has('upperBack_horizontal_row_compound');
              const needPull = !dayIntentSet.has('lats_vertical_pull_compound');
              if (needRow) intentCandidates = ['upperBack_horizontal_row_compound'];
              else if (needPull) intentCandidates = ['lats_vertical_pull_compound'];
            }

            let built = null;
            for (const candidateIntent of intentCandidates) {
              if (dayIntentSet.has(candidateIntent)) continue;
              const out = buildExercise(candidateIntent, slotMuscles, searchHintOverride);
              if (out.exerciseId) {
                built = out;
                break;
              }
            }

            if (!built && slotIntent === 'accessory_flex') {
              const altMuscle = chooseAccessoryFlexMuscle({
                targets: bbTargets?.targets,
                weekTally: weekMuscleTally,
                dayTally: muscleTally,
                avoid: slotMuscles,
                dayType,
                daysPerWeek
              });
              const altHint = ACCESSORY_FLEX_HINTS[altMuscle] || null;
              const altOut = buildExercise(slotIntent, [altMuscle], altHint);
              built = altOut;
            }

            exercises.push(built || buildExercise(slotIntent, slotMuscles, searchHintOverride));
          }
        }
        applyPriorityLeadPlacement(dayKey, exercises, priorityIsoState);
        organizeBodybuildingDayExercises(day.focus, exercises);
        return exercises;
      };

      // Strict validator pass: retry with alternate candidates until day is clean.
      let attempts = 0;
      let finalExercises = [];
      const backPriorityForDay = bbPriorityMuscles.includes('lats') || bbPriorityMuscles.includes('upperBack');
      const preferredMajorityBucketForDay = normalizeEquipmentMajorityBucket(bodybuildingMeta?.equipmentStylePref || 'mix');
      while (attempts < 8) {
        attempts += 1;
        usedWeekTemp = new Set(usedWeek);
        const dayExercises = buildBodybuildingDay({
          strictMode: true,
          pickOffset: attempts - 1
        });
        const dayObj = { ...day, exercises: dayExercises };
        if (validateBodybuildingDayStrict(dayObj, backPriorityForDay, preferredMajorityBucketForDay)) {
          // Commit usedWeek from temp by re-running selection to ensure usedWeek updated.
          for (const ex of dayExercises) {
            if (ex.exerciseId && !ex.foundationFlag) usedWeek.add(ex.exerciseId);
          }
          finalExercises = dayExercises;
          break;
        }
      }

      if (!finalExercises.length) {
        planWarnings.push(`${day.label} failed strict generation; rebuilding day with hard fallback.`);
        usedWeekTemp = new Set(usedWeek);
        const fallbackDay = buildBodybuildingDay({
          strictMode: true,
          pickOffset: 0
        }).filter((ex) => {
          if (!ex?.exerciseId) return false;
          const entry = getExerciseById(ex.exerciseId);
          if (!entry) return false;
          const nameNorm = String(entry?.name || '').toLowerCase();
          return !STRICT_DAY_REJECT_NAME_PATTERNS.some((rx) => rx.test(nameNorm));
        });
        const fallbackObj = { ...day, exercises: fallbackDay };
        if (validateBodybuildingDayStrict(fallbackObj, backPriorityForDay, preferredMajorityBucketForDay)) {
          for (const ex of fallbackDay) {
            if (ex.exerciseId && !ex.foundationFlag) usedWeek.add(ex.exerciseId);
          }
          finalExercises = fallbackDay;
        }
      }

      if (!finalExercises.length) {
        throw new Error(`Could not generate a strict-valid bodybuilding day for ${day.label}.`);
      }

      if (finalExercises.length) {
        for (const ex of finalExercises) {
          const sets = Number(ex.sets) || 0;
          const contrib = countDirectSetsByTarget(ex, sets);
          for (const [k, v] of Object.entries(contrib)) {
            weekMuscleTally[k] = (weekMuscleTally[k] || 0) + v;
          }
        }
      }

      return {
        id: `day:${weekIndex + 1}:${dayIndex + 1}`,
        label: day.label,
        focus: day.focus,
        exercises: finalExercises
      };
    });

    const week = { index: weekIndex + 1, label: wm.label, days };
    if (discipline === 'bodybuilding') {
      tuneSetsForWeek({
        week,
        targets: bbTargets?.targets || {},
        wseBudgetWeek: bbWseBudget?.perWeek || 0,
        wseBudgetSession: bbWseBudget?.perSession || null,
        priorityMuscles: bbPriorityMuscles
      });
      finalizeBodybuildingWeek({
        week,
        targets: bbTargets?.targets || {},
        wseBudgetSession: bbWseBudget?.perSession || null,
        priorityMuscles: bbPriorityMuscles,
        warnings: planWarnings
      });
    }
    return week;
  });

  const wseBudget = discipline === 'bodybuilding'
    ? bbWseBudget
    : null;
  const phase = discipline === 'bodybuilding' ? bodybuildingMeta?.phase || 'bulk' : null;
  const currentWeight = discipline === 'bodybuilding' ? Number(baselines?.bodyweight) : null;
  const targetWeightLb = discipline === 'bodybuilding' ? (bodybuildingMeta?.targetWeightLb || null) : null;
  const plannedRate = phase === 'bulk' ? 0.75 : phase === 'cut' ? 1.25 : 0;
  const plannedWeeksToGoal = (Number.isFinite(currentWeight) && Number.isFinite(targetWeightLb) && plannedRate)
    ? Math.ceil(Math.abs(targetWeightLb - currentWeight) / plannedRate)
    : null;
  const plannedGoalDate = plannedWeeksToGoal
    ? (() => {
      const d = new Date();
      d.setDate(d.getDate() + plannedWeeksToGoal * 7);
      return d.toISOString().slice(0, 10);
    })()
    : null;

  if (discipline === 'bodybuilding') {
    assertBodybuildingPlanIntegrity({ weeks, priorityMuscles: bbPriorityMuscles });
  }

  return {
    meta: {
      discipline,
      daysPerWeek,
      experience,
      units: 'lb',
      weeks: weeks.length,
      createdAt: new Date().toISOString(),
      phase,
      targetWeightLb,
      trainingAgeBucket: bodybuildingMeta?.trainingAgeBucket || null,
      timePerSession: bodybuildingMeta?.timePerSession || null,
      equipmentStylePref: bodybuildingMeta?.equipmentStylePref || null,
      emphasis: bodybuildingMeta?.emphasis || [],
      injuryProfile: bodybuildingMeta?.injuryProfile || {},
      wseBudgetPerSession: wseBudget?.perSession || null,
      wseBudgetPerWeek: wseBudget?.perWeek || null,
      mesocycleLengthWeeks: discipline === 'bodybuilding' ? 10 : null,
      experienceSubTier: discipline === 'bodybuilding' ? (bodybuildingMeta?.experienceSubTier || null) : null,
      priorityMuscles: discipline === 'bodybuilding' ? bbPriorityMuscles : [],
      plannedRate,
      plannedGoalDate,
      warnings: planWarnings.length ? planWarnings : [],
      autoreg: discipline === 'powerlifting'
        ? {
          deloadWeeks: powerliftingSeedDeloadWeeks,
          nextScheduledDeloadWeek: (normalizeExperience(experience) === 'beginner' ? 6 : 5),
          eventType: powerliftingEventType
        }
        : discipline === 'bodybuilding'
          ? {
            deloadWeeks: [],
            nextScheduledDeloadWeek: 6
          }
          : null,
      schedule: {
        unavailableDays: normalizeWeekdayIndexList(input?.strength?.unavailableDays),
        preferredDays: normalizeWeekdayIndexList(input?.strength?.preferredDays || input?.preferredDays),
        weekdays: buildTrainingSchedule(
          daysPerWeek,
          input?.strength?.unavailableDays,
          input?.strength?.preferredDays || input?.preferredDays
        )
      },
      rules: discipline === 'bodybuilding' ? bodybuildingRules(experience) : null
    },
    baselines: {
      ...baselines,
      powerlifting: discipline === 'powerlifting'
        ? {
          lastPerformed: {
            squat: asDateIso(input?.strength?.squatDate),
            bench: asDateIso(input?.strength?.benchDate),
            deadlift: asDateIso(input?.strength?.deadliftDate)
          }
        }
        : null
      ,
      bodybuilding: discipline === 'bodybuilding'
        ? {
          lastPerformed: {
            press: asDateIso(input?.strength?.pressDate),
            pull: asDateIso(input?.strength?.pullDate),
            leg: asDateIso(input?.strength?.legDate)
          },
          subTier: strengthSubTier?.tier || null,
          subTierFlags: strengthSubTier?.flags || null,
          movements: {
            press: String(input?.strength?.pressMovement || '').trim() || null,
            pull: String(input?.strength?.pullMovement || input?.strength?.pullAnchorMovement || '').trim() || null,
            leg: String(input?.strength?.legMovement || input?.strength?.lowerMovement || '').trim() || null,
            hinge: String(input?.strength?.hingeMovement || '').trim() || null
          }
        }
        : null
    },
    weeks
  };
}

function applyLogAdjustments({ plan, workoutLog, experience }) {
  if (!plan || typeof plan !== 'object') return plan;
  const discipline = String(plan?.meta?.discipline || '').trim().toLowerCase();
  const exp = normalizeExperience(experience || plan?.meta?.experience);
  const defaults = experienceDefaults(exp);

  const weekIndex = clampInt(workoutLog?.weekIndex, 1, 52, null);
  const dayIndex = clampInt(workoutLog?.dayIndex, 1, 7, null);
  if (!weekIndex || !dayIndex) return plan;

  const done = Array.isArray(workoutLog?.entries) ? workoutLog.entries : [];
  const byBase = new Map();
  for (const entry of done) {
    const baseId = String(entry?.baseId || '').trim();
    if (!baseId) continue;
    const actualW = Number(entry?.actual?.weight);
    const actualR = Number(entry?.actual?.reps);
    const actualRpe = Number(entry?.actual?.rpe);
    const targetW = Number(entry?.target?.weight ?? entry?.prescribed?.projectedWeight);
    const repsTarget = Number(entry?.prescribed?.repsTarget) || null;
    const noteText = String(entry?.notes || '').trim().toLowerCase();
    byBase.set(baseId, {
      actualW: Number.isFinite(actualW) ? actualW : null,
      actualR: Number.isFinite(actualR) ? actualR : null,
      actualRpe: Number.isFinite(actualRpe) ? actualRpe : null,
      targetW: Number.isFinite(targetW) ? targetW : null,
      repsTarget,
      noteText
    });
  }

  const updated = JSON.parse(JSON.stringify(plan));
  updated.meta = { ...(updated.meta || {}) };

  const autoreg = updated.meta.autoreg && typeof updated.meta.autoreg === 'object' ? updated.meta.autoreg : {};
  const deloadWeeks = Array.isArray(autoreg.deloadWeeks) ? autoreg.deloadWeeks : [];
  const states = autoreg.states && typeof autoreg.states === 'object' ? autoreg.states : {};
  const lastDecision = autoreg.lastDecision && typeof autoreg.lastDecision === 'object' ? autoreg.lastDecision : {};
  const weekRegs = autoreg.weekRegressions && typeof autoreg.weekRegressions === 'object' ? autoreg.weekRegressions : {};

  const isDeloadWeek = deloadWeeks.includes(weekIndex);

  const tmByLift = (() => {
    const tm = plan?.baselines?.trainingMax || {};
    return {
      squat: Number(tm.squat),
      bench: Number(tm.bench),
      deadlift: Number(tm.deadlift)
    };
  })();
  const isBodybuilding = discipline === 'bodybuilding';
  const bbStrengthMeta = isBodybuilding
    ? computeStrengthSubTier({
      bodyweight: plan?.baselines?.bodyweight,
      bench1rm: plan?.baselines?.press1rm,
      squat1rm: plan?.baselines?.leg1rm,
      deadlift1rm: plan?.baselines?.hinge1rm
    })
    : null;
  const bbIsElite = Boolean(bbStrengthMeta && Object.values(bbStrengthMeta.flags || {}).some((v) => v === 'possible_elite'));

  // Build rep ranges from the plan once (best-effort).
  const repRanges = new Map();
  for (const wk of updated.weeks || []) {
    for (const day of wk?.days || []) {
      for (const ex of day?.exercises || []) {
        const baseId = String(ex?.baseId || '').trim();
        if (!baseId || repRanges.has(baseId)) continue;
        const rr = parseRepRange(ex?.reps);
        if (rr) repRanges.set(baseId, rr);
      }
    }
  }

  const powerliftingTagByBase = (() => {
    if (discipline !== 'powerlifting') return new Map();
    const map = new Map();
    for (const wk of updated.weeks || []) {
      for (const day of wk?.days || []) {
        for (const ex of day?.exercises || []) {
          const baseId = String(ex?.baseId || '').trim();
          if (!baseId || map.has(baseId)) continue;
          const tags = ex?.tags && typeof ex.tags === 'object' ? ex.tags : null;
          if (tags) map.set(baseId, tags);
        }
      }
    }
    return map;
  })();

  const setsCapByBase = (() => {
    const map = new Map();
    for (const wk of updated.weeks || []) {
      for (const day of wk?.days || []) {
        for (const ex of day?.exercises || []) {
          const baseId = String(ex?.baseId || '').trim();
          if (!baseId) continue;
          const fromProg = Number(ex?.progression?.setsCap);
          const cap = Number.isFinite(fromProg) && fromProg > 0
            ? fromProg
            : maxSetsForBodybuildingExercise(ex, false);
          const prev = map.get(baseId);
          if (!Number.isFinite(prev) || cap > prev) map.set(baseId, cap);
        }
      }
    }
    return map;
  })();

  const getOrInitState = (baseId) => {
    const key = String(baseId || '').trim();
    if (!key) return null;
    const existing = states[key] && typeof states[key] === 'object' ? states[key] : null;
    if (existing) return existing;

    // Seed from the current target weight when available.
    const perf = byBase.get(key);
    const seededW = Number.isFinite(perf?.targetW) ? perf.targetW : null;
    const rr = repRanges.get(key) || null;
    const repMin = rr?.min ?? null;
    const repMax = rr?.max ?? null;
    const repTarget = exp === 'beginner'
      ? (repMax ?? perf?.repsTarget ?? null)
      : (repMin ?? midRange(repMin, repMax) ?? perf?.repsTarget ?? null);
    states[key] = {
      workingWeight: seededW,
      repTarget: Number.isFinite(repTarget) ? repTarget : null,
      setsTarget: null,
      setsCap: setsCapByBase.get(key) || BODYBUILDING_MAX_SETS_PER_EXERCISE,
      stallWeeks: 0,
      significantMissStreak: 0,
      regressStreak: 0,
      successStreak: 0,
      lastSuccessWeight: null,
      lastSuccessReps: null,
      technique: 'none'
    };
    return states[key];
  };

  const decisionsThisLog = {};
  let regressionsThisLog = 0;
  let poorRecoveryFlag = false;
  const readinessRaw = Number(workoutLog?.readiness);
  const readiness = Number.isFinite(readinessRaw) ? clampInt(readinessRaw, 1, 10, null) : null;
  const readinessGood = !Number.isFinite(readiness) || readiness >= 7;
  const dayNotesText = String(workoutLog?.notes || '').trim().toLowerCase();
  if (/(poor\s*recovery|low\s*energy|fatigue|run\s*down|exhaust|sick|sleep\s*depriv|no\s*sleep|stress(ed)?)/.test(dayNotesText)) {
    poorRecoveryFlag = true;
  }
  if (Number.isFinite(readiness) && readiness <= 3) poorRecoveryFlag = true;

  const techniqueScoresByLift = (() => {
    if (discipline !== 'powerlifting') return null;

    const keyPhrases = /(unstable|form|grindy)/;
    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));

    const dayPlan = (() => {
      const wk = (updated.weeks || []).find((w) => Number(w?.index) === Number(weekIndex)) || null;
      const d = wk ? (wk.days || [])[Number(dayIndex) - 1] : null;
      return d || null;
    })();

    const prescribedByBase = new Map();
    for (const ex of dayPlan?.exercises || []) {
      const baseId = String(ex?.baseId || '').trim();
      if (!baseId) continue;
      prescribedByBase.set(baseId, {
        reps: String(ex?.reps || '').trim(),
        tags: ex?.tags && typeof ex.tags === 'object' ? ex.tags : null
      });
    }

    const penalty = {
      bench: { miss: false, overshoot: false, keyword: false },
      squat: { miss: false, overshoot: false, keyword: false },
      deadlift: { miss: false, overshoot: false, keyword: false }
    };

    for (const entry of done) {
      const baseId = String(entry?.baseId || '').trim();
      if (!baseId) continue;
      const pres = prescribedByBase.get(baseId) || null;
      const tags = pres?.tags || powerliftingTagByBase.get(baseId) || null;
      const lift = String(tags?.lift || '').trim().toLowerCase();
      if (!['bench', 'squat', 'deadlift'].includes(lift)) continue;

      const actualR = Number(entry?.actual?.reps);
      const actualRpe = Number(entry?.actual?.rpe);
      const notes = String(entry?.notes || '').trim().toLowerCase();

      const repsTargetFromEntry = Number(entry?.prescribed?.repsTarget);
      const rr = parseRepRange(pres?.reps);
      const prescribedReps = Number.isFinite(repsTargetFromEntry)
        ? repsTargetFromEntry
        : rr ? rr.min : null;

      const rpeRange = Array.isArray(tags?.rpeRange) ? tags.rpeRange : null;
      const rpeTarget = rpeRange && rpeRange.length === 2
        ? (Number(rpeRange[0]) + Number(rpeRange[1])) / 2
        : 8;

      if (Number.isFinite(prescribedReps) && Number.isFinite(actualR) && actualR < prescribedReps) penalty[lift].miss = true;
      if (Number.isFinite(actualRpe) && Number.isFinite(rpeTarget) && actualRpe > rpeTarget) penalty[lift].overshoot = true;
      if (keyPhrases.test(notes) || keyPhrases.test(dayNotesText)) penalty[lift].keyword = true;
    }

    const scoreFor = (p) => {
      let score = 1.0;
      if (p.miss) score -= 0.15;
      if (p.overshoot) score -= 0.10;
      if (p.keyword) score -= 0.10;
      return clamp01(score);
    };

    return {
      bench: scoreFor(penalty.bench),
      squat: scoreFor(penalty.squat),
      deadlift: scoreFor(penalty.deadlift)
    };
  })();

  for (const [baseId, perf] of byBase.entries()) {
    const st = getOrInitState(baseId);
    if (!st) continue;

    const rr = repRanges.get(baseId) || null;
    const repMin = rr?.min ?? null;
    const repMax = rr?.max ?? null;
    const repMid = rr ? midRange(rr.min, rr.max) : null;

    const actualW = perf.actualW;
    const actualR = perf.actualR;
    const targetW = perf.targetW;
    const repTarget = Number.isFinite(st.repTarget)
      ? st.repTarget
      : (Number.isFinite(perf.repsTarget) ? perf.repsTarget : (repMax ?? null));

    const repQualityOk = !isBadRepQuality(perf.noteText);
    const painFlag = /(pain|hurt|ache|injur|tendon|joint)/.test(perf.noteText || '');
    if (painFlag) poorRecoveryFlag = true;

    const hasNumbers = Number.isFinite(actualW) && Number.isFinite(actualR) && Number.isFinite(targetW);
    if (!hasNumbers || !repQualityOk) {
      st.regressStreak = Math.min(6, Number(st.regressStreak || 0) + 1);
      st.successStreak = 0;
      regressionsThisLog += 1;
      decisionsThisLog[baseId] = {
        type: 'none',
        message: !repQualityOk ? 'Rep quality flagged; holding progression until reps are controlled.' : 'Missing numbers; no progression change applied.'
      };
      continue;
    }

    const exceeds = actualW > targetW && actualR >= repTarget;
    const hits = actualW === targetW && actualR >= repTarget;
    const slightMiss = actualW === targetW && actualR >= (repMin ?? 1) && (repTarget - actualR === 1 || repTarget - actualR === 2);
    const significantMiss = actualW === targetW && (!repMin ? (repTarget - actualR >= 3) : (actualR < repMin || repTarget - actualR >= 3));

    // No progression changes are applied during a deload week.
    if (isDeloadWeek) {
      st.stallWeeks = 0;
      st.regressStreak = 0;
      st.significantMissStreak = 0;
      st.successStreak = 0;
      st.technique = 'none';
      decisionsThisLog[baseId] = { type: 'deload', message: 'Deload week; progression paused.' };
      continue;
    }

    const inc = chooseIncrementLb(exp, baseId, defaults, { discipline, elite: bbIsElite });

    if (exceeds) {
      st.workingWeight = actualW;
      st.lastSuccessWeight = actualW;
      st.lastSuccessReps = actualR;
      st.significantMissStreak = 0;
      st.regressStreak = 0;
      st.stallWeeks = 0;
      st.technique = 'none';
      if (isBodybuilding) {
        st.successStreak = Math.min(3, Number(st.successStreak || 0) + 1);
        st.repTarget = Number.isFinite(repTarget) ? repTarget : st.repTarget;
        decisionsThisLog[baseId] = { type: 'hold', message: 'Exceeded target; holding this load once to confirm.' };
        continue;
      }

      // Do not force a load jump next time; push reps (or sets if reps maxed).
      if (repMax != null && repTarget >= repMax) {
        if (discipline === 'bodybuilding') {
          st.repTarget = repTarget;
          decisionsThisLog[baseId] = { type: 'reps', message: 'Exceeded target weight; keep load and repeat top reps.' };
        } else {
          st.setsTarget = clampInt(Number(st.setsTarget || 0) + 1, 1, st.setsCap || BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(st.setsTarget || 0) + 1);
          decisionsThisLog[baseId] = { type: 'sets', message: 'Exceeded target weight; keep load and add a set (reps already maxed).' };
        }
      } else {
        const nextReps = repMax != null ? Math.min(repMax, repTarget + 1) : (repTarget + 1);
        st.repTarget = nextReps;
        decisionsThisLog[baseId] = { type: 'reps', message: 'Exceeded target weight; keep load and push reps next time.' };
      }
      continue;
    }

    if (hits) {
      st.lastSuccessWeight = actualW;
      st.lastSuccessReps = actualR;
      st.significantMissStreak = 0;
      st.regressStreak = 0;
      st.technique = 'none';
      st.stallWeeks = 0;
      if (isBodybuilding) {
        st.successStreak = Math.min(3, Number(st.successStreak || 0) + 1);
        if (st.successStreak >= 2) {
          st.workingWeight = roundTo((Number.isFinite(st.workingWeight) ? st.workingWeight : actualW) + inc, inc);
          st.repTarget = repMid ?? repMin ?? repTarget;
          st.successStreak = 0;
          decisionsThisLog[baseId] = { type: 'load', message: 'Confirmed target twice; adding weight next session.' };
        } else {
          st.workingWeight = Number.isFinite(st.workingWeight) ? st.workingWeight : actualW;
          st.repTarget = Number.isFinite(repTarget) ? repTarget : st.repTarget;
          decisionsThisLog[baseId] = { type: 'hold', message: 'Hit target; repeat same load once to confirm.' };
        }
        continue;
      }

      if (exp === 'beginner') {
        // Beginners bias load, but never at the expense of falling below the rep range.
        st.workingWeight = roundTo((Number.isFinite(st.workingWeight) ? st.workingWeight : actualW) + inc, inc);
        decisionsThisLog[baseId] = { type: 'load', message: 'Hit target; increasing load next time.' };
      } else {
        // Double progression: reps -> load (then reset reps toward mid-range).
        if (repMax != null && repTarget >= repMax) {
          st.workingWeight = roundTo((Number.isFinite(st.workingWeight) ? st.workingWeight : actualW) + inc, inc);
          st.repTarget = repMid ?? (repMin ?? repTarget);
          decisionsThisLog[baseId] = { type: 'load', message: 'Hit top of range; adding small load and resetting reps to mid-range.' };
        } else {
          const nextReps = repMax != null ? Math.min(repMax, repTarget + 1) : (repTarget + 1);
          st.repTarget = nextReps;
          decisionsThisLog[baseId] = { type: 'reps', message: 'Hit target; keeping load and adding reps within range.' };
        }
      }
      continue;
    }

    if (slightMiss) {
      st.significantMissStreak = 0;
      st.regressStreak = 0;
      st.successStreak = 0;
      st.technique = 'none';
      st.workingWeight = Number.isFinite(st.workingWeight) ? st.workingWeight : targetW;
      const nextReps = repMax != null ? Math.min(repMax, Math.max(repMin ?? 1, actualR + 1)) : (actualR + 1);
      st.repTarget = nextReps;
      st.stallWeeks = Math.min(6, Number(st.stallWeeks || 0) + 1);
      decisionsThisLog[baseId] = { type: 'reps', message: 'Slight miss; keep load and push reps next time.' };
      continue;
    }

    if (significantMiss) {
      st.significantMissStreak = Math.min(6, Number(st.significantMissStreak || 0) + 1);
      st.regressStreak = Math.min(6, Number(st.regressStreak || 0) + 1);
      st.successStreak = 0;
      regressionsThisLog += 1;
      st.technique = 'none';
      st.workingWeight = Number.isFinite(st.workingWeight) ? st.workingWeight : targetW;
      st.stallWeeks = Math.min(6, Number(st.stallWeeks || 0) + 1);

      if (st.significantMissStreak >= 2) {
        const mult = 0.93; // 7% reset default inside 5-10%
        st.workingWeight = roundTo(st.workingWeight * mult, inc);
        st.repTarget = repMid ?? repTarget;
        st.significantMissStreak = 0;
        decisionsThisLog[baseId] = { type: 'load', message: 'Missed significantly twice; reduce load 5â€“10% and reset reps to mid-range.' };
      } else {
        st.repTarget = repMid ?? repTarget;
        decisionsThisLog[baseId] = { type: 'reps', message: 'Significant miss; keep load and retry with a mid-range rep target.' };
      }
      continue;
    }

    // Unclassified: treat as regression and hold.
    st.regressStreak = Math.min(6, Number(st.regressStreak || 0) + 1);
    st.successStreak = 0;
    regressionsThisLog += 1;
    st.stallWeeks = Math.min(6, Number(st.stallWeeks || 0) + 1);
    decisionsThisLog[baseId] = { type: 'none', message: 'Performance did not meet target; holding load and reassessing next exposure.' };
  }

  if (discipline === 'bodybuilding' && readinessGood) {
    for (const [baseId, st] of Object.entries(states)) {
      if (!st || typeof st !== 'object') continue;
      if (Number(st.stallWeeks || 0) < 2) continue;
      st.setsTarget = clampInt(Number(st.setsTarget || 0) + 1, 1, st.setsCap || BODYBUILDING_MAX_SETS_PER_EXERCISE, Number(st.setsTarget || 0) + 1);
      st.stallWeeks = 0;
      decisionsThisLog[baseId] = { type: 'sets', message: 'Plateau detected; adding a set (recovery is good).' };
    }
  }

  if (discipline === 'bodybuilding' && Number.isFinite(readiness) && readiness <= 3) {
    for (const [baseId, st] of Object.entries(states)) {
      if (!st || typeof st !== 'object') continue;
      if (!byBase.has(baseId)) continue;
      const baseSets = Number.isFinite(st.setsTarget) ? st.setsTarget : null;
      if (Number.isFinite(baseSets) && baseSets > 1) {
        st.setsTarget = clampInt(baseSets - 1, 1, st.setsCap || BODYBUILDING_MAX_SETS_PER_EXERCISE, baseSets - 1);
      }
      decisionsThisLog[baseId] = { type: 'volume', message: 'Low readiness; trimming a set next session.' };
    }
  }

  // Technique gate (powerlifting): if score < 0.8, freeze next-week intensity progression for that lift.
  if (discipline === 'powerlifting' && techniqueScoresByLift) {
    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
    const nextWeek = (updated.weeks || []).find((w) => Number(w?.index) === Number(weekIndex + 1)) || null;
    const curWeek = (updated.weeks || []).find((w) => Number(w?.index) === Number(weekIndex)) || null;

    const pctFor = (lift, projectedValue) => {
      const tm = tmByLift?.[lift];
      if (!Number.isFinite(tm) || tm <= 0) return null;
      const v = Number(projectedValue);
      if (!Number.isFinite(v) || v <= 0) return null;
      return clamp01(v / tm);
    };

    const capMapForLift = (lift) => {
      const caps = new Map();
      for (const day of curWeek?.days || []) {
        for (const ex of day?.exercises || []) {
          const tags = ex?.tags && typeof ex.tags === 'object' ? ex.tags : null;
          if (!tags) continue;
          if (String(tags.lift || '').toLowerCase() !== lift) continue;
          const it = String(tags.intensityType || '').toLowerCase();
          if (!it || it === 'accessory') continue;
          const pct = pctFor(lift, ex?.projected?.value);
          if (!Number.isFinite(pct)) continue;
          const prev = caps.get(it);
          if (!Number.isFinite(prev) || pct > prev) caps.set(it, pct);
        }
      }
      // Fallback: overall cap for the lift.
      let overall = null;
      for (const v of caps.values()) overall = overall == null ? v : Math.max(overall, v);
      return { caps, overall };
    };

    const roundForLift = (lift, value) => {
      const inc = lift === 'bench' ? 2.5 : 5;
      return roundTo(value, inc);
    };

    const applyFreeze = (lift) => {
      const score = Number(techniqueScoresByLift[lift]);
      if (!Number.isFinite(score) || score >= 0.8) return;
      const { caps, overall } = capMapForLift(lift);
      if (!nextWeek) return;

      for (const day of nextWeek.days || []) {
        for (const ex of day.exercises || []) {
          const tags = ex?.tags && typeof ex.tags === 'object' ? ex.tags : null;
          if (!tags) continue;
          if (String(tags.lift || '').toLowerCase() !== lift) continue;
          const it = String(tags.intensityType || '').toLowerCase();
          if (!it || it === 'accessory') continue;
          if (!ex.projected || typeof ex.projected !== 'object') continue;
          if (!Number.isFinite(ex.projected.value)) continue;

          const nextPct = pctFor(lift, ex.projected.value);
          const cap = caps.get(it) ?? overall;
          if (!Number.isFinite(nextPct) || !Number.isFinite(cap)) continue;
          if (nextPct <= cap + 1e-6) continue;

          const tm = tmByLift?.[lift];
          if (!Number.isFinite(tm) || tm <= 0) continue;
          const capped = roundForLift(lift, tm * cap);
          if (Number.isFinite(capped) && capped > 0) ex.projected.value = capped;
        }
      }

      weekRegs[String(weekIndex + 1)] = {
        ...(weekRegs[String(weekIndex + 1)] || {}),
        techniqueGate: { lift, score, at: new Date().toISOString() }
      };
    };

    applyFreeze('bench');
    applyFreeze('squat');
    applyFreeze('deadlift');

    autoreg.techniqueScores = autoreg.techniqueScores && typeof autoreg.techniqueScores === 'object'
      ? autoreg.techniqueScores
      : {};
    autoreg.techniqueScores[`${weekIndex}:${dayIndex}`] = {
      byLift: techniqueScoresByLift,
      at: new Date().toISOString()
    };
  }

  // Deload scheduling logic (all disciplines).
  let triggerDeload = false;
  if (discipline === 'bodybuilding' || discipline === 'powerlifting' || discipline === 'calisthenics') {
    // Multiple lifts regressing in same logged workout.
    if (regressionsThisLog >= 2) triggerDeload = true;
    if (poorRecoveryFlag) triggerDeload = true;

    // Same lift regresses twice consecutively.
    for (const [baseId, st] of Object.entries(states)) {
      if (!st || typeof st !== 'object') continue;
      if (Number(st.regressStreak || 0) >= 2) triggerDeload = true;
    }

    // Scheduled deloads.
    const scheduleEvery = discipline === 'powerlifting'
      ? (exp === 'beginner' ? 6 : 5)
      : discipline === 'bodybuilding'
        ? 6
        : exp === 'beginner' ? 7 : 5;
    const nextScheduled = clampInt(autoreg.nextScheduledDeloadWeek, 2, 52, null) || scheduleEvery;
    const nextWeekIndex = weekIndex + 1;
    const scheduledHit = nextWeekIndex >= nextScheduled;

    if (scheduledHit) triggerDeload = true;

    if (triggerDeload) {
      const nextIdx = weekIndex + 1;
      if (!deloadWeeks.includes(nextIdx)) deloadWeeks.push(nextIdx);

      // Move the next scheduled marker forward once we schedule a deload.
      const bumped = nextIdx + scheduleEvery;
      autoreg.nextScheduledDeloadWeek = bumped;

      // Reset regression streaks on deload scheduling.
      for (const st of Object.values(states)) {
        if (!st || typeof st !== 'object') continue;
        st.regressStreak = 0;
        st.stallWeeks = 0;
        st.successStreak = 0;
        st.technique = 'none';
      }
      weekRegs[String(nextIdx)] = { reason: poorRecoveryFlag ? 'poor_recovery' : (scheduledHit ? 'scheduled' : 'regression'), at: new Date().toISOString() };
    }
  }

  // Apply deload modifications to any deload weeks (forward-only).
  const deloadSet = new Set(deloadWeeks.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0));
  const deloadPct = chooseDeloadPct();

  // Reproject all future weeks from current states (bodybuilding only).
  if (discipline === 'bodybuilding') {
    // Snapshot current state for forward projection.
    const projState = {};
    for (const [baseId, st] of Object.entries(states)) projState[baseId] = JSON.parse(JSON.stringify(st));

    for (const week of updated.weeks || []) {
      const wi = Number(week?.index);
      if (!Number.isFinite(wi) || wi <= weekIndex) continue;
      const deload = deloadSet.has(wi);

      for (const day of week.days || []) {
        for (const ex of day.exercises || []) {
          const baseId = String(ex?.baseId || '').trim();
          if (!baseId) continue;
          if (!ex.projected || typeof ex.projected !== 'object') continue;
          if (ex.projected.unit !== 'lb') continue;
          if (!Number.isFinite(ex.projected.value)) continue;

          const st = projState[baseId] || getOrInitState(baseId);
          if (!st) continue;

          const inc = chooseIncrementLb(exp, baseId, defaults, { discipline, elite: bbIsElite });
          const rr = repRanges.get(baseId) || null;
          const repMin = rr?.min ?? null;
          const repMax = rr?.max ?? null;

          const baseWorking = Number.isFinite(st.workingWeight) ? st.workingWeight : ex.projected.value;
          const setsBase = Number.isFinite(st.setsTarget) ? st.setsTarget : ex.sets;
          const repsTarget = Number.isFinite(st.repTarget)
            ? st.repTarget
            : (repMax ?? null);

          ex.progression = ex.progression && typeof ex.progression === 'object' ? ex.progression : {};
          ex.progression.repsTarget = Number.isFinite(repsTarget) ? repsTarget : null;
          ex.progression.technique = deload ? 'none' : (st.technique || 'none');
          ex.progression.setsCap = st.setsCap || ex.progression.setsCap || maxSetsForBodybuildingExercise(ex, false);
          const maxCap = Number(ex.progression.setsCap) || BODYBUILDING_MAX_SETS_PER_EXERCISE;

          if (deload) {
            ex.sets = clampInt(Math.round(Number(setsBase || ex.sets) * deloadPct.setMult), 1, maxCap, ex.sets);
            ex.projected.value = roundTo(baseWorking * deloadPct.loadMult, inc);
          } else {
            ex.sets = clampInt(Number(setsBase || ex.sets), 1, maxCap, ex.sets);
            ex.projected.value = roundTo(baseWorking, inc);
          }
        }
      }

      // Advance projection state as-if the user hits targets (not deload weeks).
      if (!deload) {
        for (const [baseId, st] of Object.entries(projState)) {
          if (!st || typeof st !== 'object') continue;
          const rr = repRanges.get(baseId) || null;
          const repMin = rr?.min ?? null;
          const repMax = rr?.max ?? null;
          const repMid = rr ? midRange(rr.min, rr.max) : null;
          const inc = chooseIncrementLb(exp, baseId, defaults, { discipline, elite: bbIsElite });

          st.successStreak = Math.min(3, Number(st.successStreak || 0) + 1);
          if (st.successStreak >= 2) {
            st.workingWeight = Number.isFinite(st.workingWeight) ? roundTo(st.workingWeight + inc, inc) : st.workingWeight;
            st.repTarget = repMid ?? repMin ?? st.repTarget;
            st.successStreak = 0;
          } else if (Number.isFinite(repMax) && !Number.isFinite(st.repTarget)) {
            st.repTarget = repMax;
          }
        }
      }
    }
  }

  // For non-bodybuilding plans, still apply deload multipliers to future weeks when scheduled.
  if (discipline !== 'bodybuilding' && deloadSet.size) {
    for (const week of updated.weeks || []) {
      const wi = Number(week?.index);
      if (!Number.isFinite(wi) || wi <= weekIndex) continue;
      const deload = deloadSet.has(wi);
      if (!deload) continue;
      for (const day of week.days || []) {
        for (const ex of day.exercises || []) {
          const baseId = String(ex?.baseId || '').trim();
          if (!baseId) continue;
          if (!ex.projected || typeof ex.projected !== 'object') continue;
          if (ex.projected.unit !== 'lb') continue;
          if (!Number.isFinite(ex.projected.value)) continue;
          const inc = chooseIncrementLb(exp, baseId, defaults, { discipline, elite: bbIsElite });
          ex.sets = clampInt(Math.round(Number(ex.sets || 0) * deloadPct.setMult), 1, 12, ex.sets);
          ex.projected.value = roundTo(Number(ex.projected.value) * deloadPct.loadMult, inc);
          ex.progression = ex.progression && typeof ex.progression === 'object' ? ex.progression : {};
          ex.progression.technique = 'none';
        }
      }
    }
  }

  // Persist decisions for UI transparency.
  for (const [baseId, d] of Object.entries(decisionsThisLog)) {
    lastDecision[baseId] = { ...(d || {}), weekIndex, at: new Date().toISOString() };
  }

  updated.meta.autoreg = { ...autoreg, deloadWeeks, states, lastDecision, weekRegressions: weekRegs };
  updated.meta = { ...(updated.meta || {}), updatedAt: new Date().toISOString() };
  return updated;
}

module.exports = { generatePlan, applyLogAdjustments, normalizeExperience, assertBodybuildingPlanIntegrity };

