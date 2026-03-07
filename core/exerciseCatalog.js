const fs = require('fs');
const path = require('path');

const DATASET_PATH = path.join(__dirname, '..', 'free-exercise-db', 'dist', 'exercises.json');

let datasetCache = null;
let idIndex = null;

function invalidateDatasetCache() {
  datasetCache = null;
  idIndex = null;
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadDataset() {
  if (datasetCache) return datasetCache;
  const data = safeReadJson(DATASET_PATH);
  datasetCache = Array.isArray(data) ? data : [];
  return datasetCache;
}

function buildIdIndex() {
  if (idIndex) return idIndex;
  const list = loadDataset();
  const map = new Map();
  for (const ex of list) {
    const id = String(ex?.id || '').trim();
    if (!id) continue;
    map.set(id, ex);
  }
  idIndex = map;
  return map;
}

function normalizeText(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTextArray(input) {
  if (Array.isArray(input)) return input.map((x) => String(x || '').trim()).filter(Boolean);
  if (input == null) return [];
  const one = String(input).trim();
  return one ? [one] : [];
}

function normalizeStretchFlag(raw) {
  if (raw === true || raw === false) return raw;
  const v = normalizeText(raw);
  if (v === 'true' || v === 'yes' || v === '1') return true;
  if (v === 'false' || v === 'no' || v === '0') return false;
  return null;
}

function isStretchLikeName(name) {
  const n = normalizeText(name);
  if (n.includes('on your back quad stretch')) return true;
  return /(stretch|stretching|mobility|warmup|warm up|activation|rehab|therapy|rehabilitation|cooldown|cool down|release|smr|myofascial|prehab)/.test(n);
}

function isStretchLikeCategory(category) {
  const c = normalizeText(category);
  return /(stretch|stretching|mobility|warmup|warm up|cardio|plyometric|rehab|therapy|rehabilitation)/.test(c);
}

function isStretchLikeMechanic(mechanic) {
  const m = normalizeText(mechanic);
  return /(stretch|mobility|rehab|therapy|warmup|warm up)/.test(m);
}

function isStretchLikeEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const explicit = normalizeStretchFlag(entry?.isStretch);
  if (explicit === true) return true;
  if (explicit === false) return false;
  return isStretchLikeName(entry?.name)
    || isStretchLikeCategory(entry?.category)
    || isStretchLikeMechanic(entry?.mechanic);
}

function isIsometricLikeName(name) {
  const n = normalizeText(name);
  return /(isometric|static hold|iso hold|plank|side plank|hollow hold|wall sit|l sit|v sit|dead hang|pause hold)/.test(n);
}

function isIsometricLikeCategory(category) {
  const c = normalizeText(category);
  return /(isometric|static hold)/.test(c);
}

function isIsometricLikeMechanic(mechanic) {
  const m = normalizeText(mechanic);
  return /(isometric|static hold)/.test(m);
}

function isIsometricLikeEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const explicit = normalizeStretchFlag(entry?.isIsometric);
  if (explicit === true) return true;
  if (explicit === false) return false;
  const force = normalizeText(entry?.force);
  return isIsometricLikeName(entry?.name)
    || isIsometricLikeCategory(entry?.category)
    || isIsometricLikeMechanic(entry?.mechanic)
    || force === 'static';
}

function equipmentClass(entry) {
  const eq = String(entry?.equipment || '').toLowerCase();
  if (eq.includes('barbell')) return 'barbell';
  if (eq.includes('dumbbell') || eq.includes('kettlebell')) return 'dumbbell';
  if (eq.includes('cable')) return 'cable';
  if (eq.includes('machine') || eq.includes('smith')) return 'machine';
  if (eq.includes('body')) return 'bodyweight';
  return 'other';
}

function mapMuscleDescriptorToKeys(raw) {
  const m = normalizeText(raw);
  const keys = new Set();
  if (!m) return keys;
  if (m.includes('pullover')) {
    keys.add('lats');
    keys.add('upperBack');
  }
  if (/(chest|pec|pectoral|clavicular|stern(al)?|upper chest|mid chest|lower chest|inner chest|outer chest)/.test(m)) keys.add('chest');
  if (/(lats|latissimus|lower lats|upper lats|lat width|teres major)/.test(m)) keys.add('lats');
  if (/(upper back|middle back|mid back|back thickness|rhomboid|trap|trapezius|teres minor|infraspinatus|rear upper back)/.test(m)) keys.add('upperBack');
  if (/(front delt|anterior delt|front deltoid|anterior deltoid)/.test(m)) keys.add('deltsFront');
  if (/(side delt|lateral delt|middle delt|medial delt|side deltoid|lateral deltoid)/.test(m)) keys.add('deltsSide');
  if (/(rear delt|posterior delt|rear deltoid|posterior deltoid)/.test(m)) keys.add('deltsRear');
  if (/(bicep|brachialis|brachioradialis)/.test(m)) keys.add('biceps');
  if (/(tricep|triceps|long head triceps|lateral head triceps|medial head triceps)/.test(m)) keys.add('triceps');
  if (/(quadricep|quad|vastus|rectus femoris)/.test(m)) keys.add('quads');
  if (/(hamstring|biceps femoris|semitendinosus|semimembranosus)/.test(m)) keys.add('hamstrings');
  if (/(glute|glute max|glute med|glute min|gluteus)/.test(m)) keys.add('glutes');
  if (/(calf|gastrocnemius|soleus|tibialis)/.test(m)) keys.add('calves');
  if (/(abdom|abs|oblique|core|transverse abdominis|rectus abdominis)/.test(m)) keys.add('abs');
  return keys;
}

function mapPrimaryMuscles(entry) {
  const nameNorm = normalizeText(entry?.name);
  const out = new Set();
  if (nameNorm.includes('pullover')) {
    out.add('lats');
    out.add('upperBack');
    return Array.from(out);
  }
  const primary = toTextArray(entry?.primaryMuscles);
  for (const raw of primary) {
    for (const key of mapMuscleDescriptorToKeys(raw)) out.add(key);
  }
  if (!out.size && Array.isArray(entry?.muscleKeys) && entry.muscleKeys.length) {
    out.add(String(entry.muscleKeys[0] || '').trim());
  }
  return Array.from(out).filter(Boolean);
}

function mapSecondaryMuscles(entry) {
  const out = new Set();
  const secondary = toTextArray(entry?.secondaryMuscles);
  const subMuscles = toTextArray(entry?.subMuscleGroups);
  const targetRegion = toTextArray(entry?.targetRegion);
  const list = [...secondary, ...subMuscles, ...targetRegion];
  for (const raw of list) {
    for (const key of mapMuscleDescriptorToKeys(raw)) out.add(key);
  }
  return Array.from(out);
}

function mapMuscles(entry) {
  const out = new Set();
  for (const key of mapPrimaryMuscles(entry)) out.add(key);
  for (const key of mapSecondaryMuscles(entry)) out.add(key);
  return Array.from(out);
}

function equipmentMatches(access, eqClass) {
  const allow = access && typeof access === 'object' ? access : {};
  if (eqClass === 'barbell') return Boolean(allow.barbell);
  if (eqClass === 'dumbbell') return Boolean(allow.dumbbell);
  if (eqClass === 'cable') return Boolean(allow.cable);
  if (eqClass === 'machine') return Boolean(allow.machine);
  if (eqClass === 'bodyweight') return Boolean(allow.bodyweight);
  return true;
}

function scoreByPreference(eqClass, pref) {
  const p = String(pref || '').toLowerCase();
  if (!p || p === 'mix') return 0;
  if (p === 'barbell' && eqClass === 'barbell') return 0.25;
  if (p === 'dumbbell' && eqClass === 'dumbbell') return 0.25;
  if (p === 'machine' && (eqClass === 'machine' || eqClass === 'cable')) return 0.25;
  return 0;
}

function tokenOverlapScore(a, b) {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  let inter = 0;
  for (const t of b) if (set.has(t)) inter += 1;
  const union = a.length + b.length - inter;
  return union ? inter / union : 0;
}

function tokensFromName(name) {
  const norm = normalizeText(name);
  return norm ? norm.split(' ') : [];
}

const PREFERRED_BY_INTENT = {
  chest_press_horizontal_compound: [
    /bench press/,
    /dumbbell bench/,
    /barbell bench/,
    /machine press/
  ],
  chest_press_incline_compound: [
    /incline/,
    /incline press/,
    /smith/,
    /machine press/
  ],
  chest_fly_isolation: [
    /fly/,
    /pec deck/,
    /cable cross/
  ],
  delts_side_isolation: [
    /lateral raise/,
    /side lateral/,
    /cable lateral/
  ],
  delts_rear_isolation: [
    /rear delt fly/,
    /reverse pec deck/,
    /face pull/
  ],
  lats_vertical_pull_compound: [
    /pulldown/,
    /pull up/,
    /chin/
  ],
  upperBack_horizontal_row_compound: [
    /chest supported row/,
    /machine row/,
    /cable row/,
    /seal row/,
    /t-?bar row/
  ],
  hamstrings_hip_hinge_compound: [
    /romanian deadlift/,
    /\brdl\b/,
    /hip hinge/,
    /hip thrust/,
    /glute bridge/,
    /back extension/
  ],
  quads_knee_dominant_compound: [
    /squat/,
    /leg press/,
    /hack squat/,
    /split squat/
  ],
  glutes_isolation: [
    /kickback/,
    /abduction/,
    /hip thrust/,
    /glute bridge/
  ]
};

function preferredBoost(intentKey, name) {
  const rules = PREFERRED_BY_INTENT[intentKey];
  if (!rules || !name) return 0;
  const n = normalizeText(name);
  return rules.some((rule) => rule.test(n)) ? 0.35 : 0;
}

function isBadName(name) {
  return isStretchLikeName(name);
}

const BANNED_NAME_TOKEN_PATTERNS = [
  /\bchains?\b/i,
  /\bbands?\b/i,
  /\bbanded\b/i,
  /\bstrongman\b/i,
  /\baxle\b/i,
  /\blog\b/i,
  /\byoke\b/i,
  /\bstone\b/i,
  /\bboulders?\b/i,
  /\batlas\b/i,
  /\bfarmers?\b/i,
  /\bfarmer'?s\b/i,
  /\bsandbag\b/i,
  /\bkeg\b/i,
  /\bsled\b/i,
  /\btire\b/i,
  /\bcircus\b/i,
  /\bzercher\s*carry\b/i,
  /\bcarry\b/i,
  /\bbalance\s*board\b/i,
  /\bwobble\s*board\b/i,
  /\bbosu\b/i,
  /\bindo\s*board\b/i,
  /\bboard\s*press\b/i,
  /\banti[-\s]*gravity\s*press\b/i,
  /\bpowerlifting\b/i,
  /\btechnique\b/i,
  /\bneck\s*press\b/i,
  /\bspeed\b/i,
  /\bdynamic\s*effort\b/i,
  /\btempo\b/i,
  /\bpaused?\b/i,
  /\bgironda\b/i,
  /\bsternum\s*chin\b/i,
  /\bkneeling\s*squat\b/i,
  /\bkneeling\b(?!.*\b(crunch|ab|core|rollout)\b)/i,
  /\boverhead\s*squat\b/i,
  /\bone[-\s]*arm\s*floor\s*press\b/i,
  /\bone[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/i,
  /\bsingle[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/i,
  /\bone[-\s]*arm\b.*\bpull[\s-]*down\b/i,
  /\bsingle[-\s]*arm\b.*\bpull[\s-]*down\b/i,
  /\bone[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/i,
  /\bsingle[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/i,
  /\bsquat\s*with\s*plate\s*movers\b/i,
  /\bcalf\s*raise\s*on\s*a\s*dumbbell\b/i,
  /\bbehind[-\s]*the[-\s]*neck\b/i,
  /\bside\s*lunge\b/i,
  /\blateral\s*lunge\b/i,
  /\bcossack\s*squat\b/i,
  /\b(bench|press|curl|extension|squat|deadlift|row)\b.*\bto\b.*\b(bench|press|curl|extension|squat|deadlift|row)\b/i,
  /\bhanging\s*bar\s*good\s*morning\b/i
  ,
  /\bisometric\b/i,
  /\bisometric\s*chest\s*squeezes?\b/i,
  /\bchest\s*squeezes?\b/i,
  /\biso[-\s]*hold\b/i,
  /\bstatic\s*hold\b/i,
  /\bplank\b/i,
  /\bside\s*plank\b/i,
  /\bhollow\s*hold\b/i,
  /\bwall\s*sit\b/i,
  /\bl[-\s]*sit\b/i,
  /\bv[-\s]*sit\b/i
];

const STRICT_NAME_ONLY_BAN_PATTERNS = [
  /\bfloor\b/i,
  /\blying\b/i,
  /\bsupine\b/i,
  /\bprone\b/i,
  /\bbehind[-\s]*the[-\s]*head\b/i,
  /\bbehind[-\s]*the[-\s]*neck\b/i
];

const BANNED_CATEGORY_PATTERNS = [
  /\bstrongman\b/i
];

function isBlacklistedName(name) {
  const n = normalizeText(name);
  return BANNED_NAME_TOKEN_PATTERNS.some((rule) => rule.test(n));
}

function isBlacklistedCategory(category) {
  const c = normalizeText(category);
  return BANNED_CATEGORY_PATTERNS.some((rule) => rule.test(c));
}

function isStrictNameOnlyBanned(name) {
  const n = normalizeText(name);
  return STRICT_NAME_ONLY_BAN_PATTERNS.some((rule) => rule.test(n));
}

function isGenericHamstringCurlName(name) {
  const n = normalizeText(name);
  const isHamCurl = /\bhamstring\s*curls?\b/.test(n) || /\bleg\s*curls?\b/.test(n);
  const isSpecific = /\b(lying|seated)\b/.test(n);
  return isHamCurl && !isSpecific;
}

function isBlacklistedEntry(entry) {
  if (!entry) return false;
  const name = String(entry?.name || '');
  const category = String(entry?.category || '');
  const instructions = String(entry?.instructions || '');
  if (isStretchLikeEntry(entry)) return true;
  if (isIsometricLikeEntry(entry)) return true;
  if (isBlacklistedName(name)) return true;
  if (isGenericHamstringCurlName(name)) return true;
  if (isStrictNameOnlyBanned(name)) return true;
  if (isBlacklistedCategory(category)) return true;
  if (isBlacklistedName(instructions)) return true;
  if (isMisTaggedOneArmBarbellPress(entry)) return true;
  if (isBandName(name) || isBandName(entry?.equipment)) return true;
  const nameNorm = normalizeText(name);
  if (nameNorm.includes('deadlift') && (nameNorm.includes('axle') || isBlacklistedCategory(category))) return true;
  return false;
}

function isBlacklistedCategoryOrLevel(entry) {
  const c = normalizeText(entry?.category);
  if (isBlacklistedCategory(c)) return true;
  return false;
}

function isMisTaggedOneArmBarbellPress(entry) {
  const name = normalizeText(entry?.name);
  const eq = normalizeText(entry?.equipment);
  const mech = normalizeText(entry?.mechanic);
  if (/one arm floor press/.test(name)) return true;
  const isOneArm = /\bone arm\b/.test(name);
  const isPress = /\bpress\b/.test(name);
  const isLandmine = /\blandmine\b/.test(name);
  const isBarbell = eq.includes('barbell') || name.includes('barbell');
  if (isOneArm && isPress && !isLandmine && isBarbell) return true;
  return false;
}

function isBandName(name) {
  const n = normalizeText(name);
  return /(^|\b)(band|bands|resistance band|mini band)(\b|$)/.test(n);
}

const CALISTHENICS_NAME_PATTERNS = [
  /\bpull[\s-]*up\b/i,
  /\bchin[\s-]*up\b/i,
  /\bpush[\s-]*up\b/i,
  /\bmuscle[\s-]*up\b/i,
  /\bdips?\b/i,
  /\bburpees?\b/i,
  /\bhandstand\b/i,
  /\binverted\s*row\b/i,
  /\bhuman\s*flag\b/i,
  /\bdragon\s*flag\b/i,
  /\btoes?\s*to\s*bar\b/i
];

function isCalisthenicsLikeEntry(entry) {
  if (!entry) return false;
  const name = normalizeText(entry?.name || '');
  const category = normalizeText(entry?.category || '');
  const mechanic = normalizeText(entry?.mechanic || '');
  const equipment = normalizeText(entry?.equipment || '');
  if (equipmentClass(entry) === 'bodyweight') return true;
  if (/(calisthenics|bodyweight|gymnastics)/.test(category)) return true;
  if (/(calisthenics|bodyweight|gymnastics)/.test(mechanic)) return true;
  return CALISTHENICS_NAME_PATTERNS.some((rx) => rx.test(name));
}

function isInvalidCategory(category) {
  return isStretchLikeCategory(category) || isIsometricLikeCategory(category);
}

function isInvalidMechanic(mechanic) {
  return isStretchLikeMechanic(mechanic) || isIsometricLikeMechanic(mechanic);
}

function isCompoundLike(entry) {
  const mech = normalizeText(entry?.mechanic || '');
  const cat = normalizeText(entry?.category || '');
  if (mech.includes('compound')) return true;
  if (cat.includes('powerlifting') || cat.includes('olympic') || cat.includes('strongman')) return true;
  const n = normalizeText(entry?.name || '');
  return /(squat|deadlift|press|row|pulldown|pull up|pull-up|leg press|hack|hinge|overhead)/.test(n);
}

function matchesIntentPattern(entry, intent) {
  const key = normalizeText(intent?.intentKey || '');
  const pattern = normalizeText(intent?.movementPattern || '');
  const name = normalizeText(entry?.name || '');

  if (key.includes('chest_press')) return /(bench|chest|incline|decline)/.test(name);
  if (key.includes('chest_fly')) return /(fly|crossover|pec deck)/.test(name) && !/(rear delt|reverse fly|face pull|reverse pec deck)/.test(name);
  if (key.includes('delts_rear')) return /(rear delt|reverse fly|face pull|reverse pec deck)/.test(name);
  if (key.includes('delts_side')) return /(lateral raise|side lateral|cable lateral|machine lateral)/.test(name);
  if (key.includes('triceps_extension')) return /(triceps|extension|pushdown|skull crusher)/.test(name);
  if (key.includes('biceps_curl')) return /(curl|preacher|hammer curl)/.test(name);
  if (pattern === 'press') return /(press|bench|chest|incline|decline)/.test(name);
  if (key.includes('overhead_press') || pattern === 'ohp') return /(overhead|shoulder press|military press)/.test(name);
  if (key.includes('vertical_pull') || pattern === 'vertical pull' || pattern === 'vertical_pull') {
    return /(pulldown|pull up|pull-up|chin up|chin-up|lat pull)/.test(name);
  }
  if (key.includes('row_compound') || pattern === 'row') return /row/.test(name);
  if (key.includes('knee_dominant') || pattern === 'squat') return /(squat|leg press|hack|lunge|split squat)/.test(name);
  if (key.includes('hip_hinge') || pattern === 'hinge') {
    return /(deadlift|hinge|rdl|romanian|good morning|hip thrust|back extension)/.test(name);
  }
  return true;
}

function maxInjurySeverity(injuryProfile) {
  if (!injuryProfile || typeof injuryProfile !== 'object') return 0;
  let max = 0;
  for (const v of Object.values(injuryProfile)) {
    const n = Number(v || 0);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

function highInjuryForPattern(pattern, injuryProfile) {
  const sev = injuryProfile && typeof injuryProfile === 'object' ? injuryProfile : {};
  const p = normalizeText(pattern);
  const shoulder = Number(sev.shoulder || 0);
  const back = Number(sev.back || 0);
  const knee = Number(sev.knee || 0);
  const hip = Number(sev.hip || 0);
  if ((p === 'press' || p === 'ohp') && shoulder >= 5) return true;
  if ((p === 'row' || p === 'vertical_pull') && (shoulder >= 5 || back >= 5)) return true;
  if (p === 'squat' && (knee >= 5 || hip >= 5)) return true;
  if (p === 'hinge' && (back >= 5 || hip >= 5)) return true;
  return false;
}

function isValidForIntent(entry, intent) {
  if (!entry) return false;
  if (isBadName(entry?.name)
    || isStretchLikeEntry(entry)
    || isIsometricLikeEntry(entry)
    || isBlacklistedEntry(entry)
    || isBlacklistedCategory(entry?.category)
    || isBlacklistedCategoryOrLevel(entry)
    || isMisTaggedOneArmBarbellPress(entry)
    || isInvalidCategory(entry?.category)
    || isInvalidMechanic(entry?.mechanic)
  ) return false;
  const nameNorm = normalizeText(entry?.name || '');
  if (nameNorm.includes('axle')) return false;
  const stimulus = String(intent?.stimulusType || '').toLowerCase();
  const intentKey = String(intent?.intentKey || '').toLowerCase();
  const mech = normalizeText(entry?.mechanic || '');
  if (stimulus === 'compound' && !mech.includes('compound')) return false;
  if (intentKey.includes('delts_rear') && mech.includes('compound')) return false;
  if (stimulus === 'isolation' && mech.includes('compound')) return false;
  if (!matchesIntentPattern(entry, intent)) return false;
  return true;
}

function selectExerciseIdsByIntent(intent, opts = {}) {
  const list = loadDataset();
  const access = opts.equipmentAccess || {};
  const pref = opts.equipmentStylePref || 'mix';
  const intentKey = String(intent?.intentKey || '').toLowerCase();
  const stimulus = String(opts.stimulusType || intent?.stimulusType || '').toLowerCase();
  const movementPattern = opts.movementPattern || intent?.movementPattern || null;
  const injuryProfile = opts.injurySeverityByJoint || opts.injuryProfile || null;
  const disallowBodyweight = Boolean(opts.disallowBodyweight);
  const disallowCalisthenics = Boolean(opts.disallowCalisthenics);
  const dayLeverageCount = Number(opts.dayLeverageCount || 0);
  const allowClass = Array.isArray(intent.allowedEquipmentClass)
    ? new Set(intent.allowedEquipmentClass)
    : intent.allowedEquipmentClass ? new Set([intent.allowedEquipmentClass]) : null;

  const wantMuscles = Array.isArray(intent.muscleKeys) ? intent.muscleKeys : [];
  const wantTokens = tokensFromName(intent.searchHint || intent.intentKey || '');

  const candidates = [];
  for (const ex of list) {
    if (!isValidForIntent(ex, intent)) continue;
    if (isBlacklistedName(ex?.name) || isStrictNameOnlyBanned(ex?.name) || isBlacklistedCategory(ex?.category) || isMisTaggedOneArmBarbellPress(ex)) continue;
    const id = String(ex?.id || '').trim();
    if (!id) continue;
    const eqClass = equipmentClass(ex);
    if (disallowBodyweight && eqClass === 'bodyweight') continue;
    if (disallowCalisthenics && isCalisthenicsLikeEntry(ex)) continue;
    if (allowClass && !allowClass.has(eqClass) && !allowClass.has('any')) continue;
    if (!equipmentMatches(access, eqClass)) continue;
    if (isBandName(ex?.name) || isBandName(ex?.equipment)) continue;

    const nameNorm = normalizeText(ex?.name || '');
    const leverageLike = /(leverage|smith)/.test(nameNorm);
    const injuryHigh = maxInjurySeverity(injuryProfile) >= 5 || highInjuryForPattern(movementPattern, injuryProfile);
    if (leverageLike && dayLeverageCount >= 1 && !injuryHigh) continue;

    const primaryMuscles = mapPrimaryMuscles(ex);
    const secondaryMuscles = mapSecondaryMuscles(ex).filter((m) => !primaryMuscles.includes(m));
    const muscles = Array.from(new Set([...primaryMuscles, ...secondaryMuscles]));
    const primaryHits = wantMuscles.filter((m) => primaryMuscles.includes(m)).length;
    const secondaryHits = wantMuscles.filter((m) => secondaryMuscles.includes(m)).length;
    const muscleOverlap = wantMuscles.length
      ? ((primaryHits + (secondaryHits * 0.6)) / wantMuscles.length)
      : 0;

    const mech = normalizeText(ex?.mechanic || '');
    if (stimulus === 'isolation' && mech.includes('compound') && muscleOverlap < 0.6) continue;

    const nameTokens = tokensFromName(ex?.name || '');
    const nameScore = tokenOverlapScore(nameTokens, wantTokens);
    const descriptorTokens = tokensFromName([
      ...toTextArray(ex?.subMuscleGroups),
      ...toTextArray(ex?.targetRegion)
    ].join(' '));
    const descriptorScore = tokenOverlapScore(descriptorTokens, wantTokens);

    let score = 0;
    score += muscleOverlap * 0.6;
    score += descriptorScore * 0.12;
    score += nameScore * 0.2;
    score += scoreByPreference(eqClass, pref);
    score += preferredBoost(intent?.intentKey, ex?.name || '');

    if (intentKey.includes('quads_knee_dominant_compound')) {
      if (/\bhack\s*squat\b/i.test(nameNorm)) score += 0.9;
      else if (/\bleg\s*press\b/i.test(nameNorm)) score += 0.55;
      if (/\b(lunge|split\s*squat|step\s*up)\b/i.test(nameNorm)) score -= 0.45;
      if (/\b(barbell)\b/i.test(nameNorm) && !/\bhack\s*squat\b/i.test(nameNorm)) score -= 0.2;
      if (eqClass === 'machine') score += 0.2;
    }

    if (stimulus === 'compound') {
      if (pref === 'mix' || !pref) {
        if (eqClass === 'barbell') score += 0.35;
        if (eqClass === 'dumbbell') score += 0.25;
        if (eqClass === 'cable') score += 0.05;
      }
      if (pref === 'barbell') {
        if (eqClass === 'barbell') score += 0.45;
        if (eqClass === 'dumbbell') score += 0.15;
        if (eqClass === 'machine' || eqClass === 'cable') score -= 0.05;
      }
    }

    if (stimulus === 'isolation' && muscleOverlap >= 0.6) {
      if (eqClass === 'cable' || eqClass === 'machine') score += 0.1;
    }

    if (stimulus === 'compound' && highInjuryForPattern(movementPattern, injuryProfile)) {
      if (eqClass === 'machine' || eqClass === 'cable') score += 0.2;
      if (eqClass === 'barbell' || eqClass === 'dumbbell') score -= 0.05;
    }

    candidates.push({ id, score, eqClass, muscles, name: ex?.name || '' });
  }

  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return candidates;
}

function getExerciseById(exerciseId) {
  if (!exerciseId) return null;
  const index = buildIdIndex();
  return index.get(String(exerciseId)) || null;
}

module.exports = {
  loadDataset,
  invalidateDatasetCache,
  getExerciseById,
  selectExerciseIdsByIntent,
  equipmentClass,
  mapMuscles,
  isValidForIntent,
  isBlacklistedEntry,
  isCalisthenicsLikeEntry,
  isStretchLikeEntry,
  isIsometricLikeEntry
};
