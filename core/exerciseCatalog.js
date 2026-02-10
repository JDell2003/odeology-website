const fs = require('fs');
const path = require('path');

const DATASET_PATH = path.join(__dirname, '..', 'free-exercise-db', 'dist', 'exercises.json');

let datasetCache = null;
let idIndex = null;

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

function equipmentClass(entry) {
  const eq = String(entry?.equipment || '').toLowerCase();
  if (eq.includes('barbell')) return 'barbell';
  if (eq.includes('dumbbell') || eq.includes('kettlebell')) return 'dumbbell';
  if (eq.includes('cable')) return 'cable';
  if (eq.includes('machine') || eq.includes('smith')) return 'machine';
  if (eq.includes('body')) return 'bodyweight';
  return 'other';
}

function mapMuscles(entry) {
  const prim = Array.isArray(entry?.primaryMuscles) ? entry.primaryMuscles : [];
  const sec = Array.isArray(entry?.secondaryMuscles) ? entry.secondaryMuscles : [];
  const list = [...prim, ...sec].map((m) => String(m || '').toLowerCase());
  const out = new Set();
  for (const m of list) {
    if (m.includes('chest')) out.add('chest');
    if (m.includes('lats')) out.add('lats');
    if (m.includes('back')) out.add('upperBack');
    if (m.includes('front') && m.includes('deltoid')) out.add('deltsFront');
    if (m.includes('side') && m.includes('deltoid')) out.add('deltsSide');
    if (m.includes('rear') && m.includes('deltoid')) out.add('deltsRear');
    if (m.includes('bicep')) out.add('biceps');
    if (m.includes('tricep')) out.add('triceps');
    if (m.includes('quadricep') || m.includes('quad')) out.add('quads');
    if (m.includes('hamstring')) out.add('hamstrings');
    if (m.includes('glute')) out.add('glutes');
    if (m.includes('calf')) out.add('calves');
    if (m.includes('abdom')) out.add('abs');
  }
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

function isBadName(name) {
  const n = normalizeText(name);
  if (n.includes('on your back quad stretch')) return true;
  return /(stretch|stretching|mobility|warmup|warm up|activation|rehab|therapy|rehabilitation|cooldown|cool down|release|smr|myofascial|prehab)/.test(n);
}

function isBandName(name) {
  const n = normalizeText(name);
  return /(^|\b)(band|bands|resistance band|mini band)(\b|$)/.test(n);
}

function isInvalidCategory(category) {
  const c = normalizeText(category);
  return /(stretch|stretching|mobility|warmup|warm up|cardio|plyometric|rehab|therapy|rehabilitation)/.test(c);
}

function isInvalidMechanic(mechanic) {
  const m = normalizeText(mechanic);
  return /(stretch|mobility|rehab|therapy|warmup|warm up)/.test(m);
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
  if (isBadName(entry?.name) || isBandName(entry?.name) || isBandName(entry?.equipment) || isInvalidCategory(entry?.category) || isInvalidMechanic(entry?.mechanic)) return false;
  const stimulus = String(intent?.stimulusType || '').toLowerCase();
  const mech = normalizeText(entry?.mechanic || '');
  if (stimulus === 'compound' && !mech.includes('compound')) return false;
  if (stimulus === 'isolation' && mech.includes('compound')) return true;
  if (!matchesIntentPattern(entry, intent)) return false;
  return true;
}

function selectExerciseIdsByIntent(intent, opts = {}) {
  const list = loadDataset();
  const access = opts.equipmentAccess || {};
  const pref = opts.equipmentStylePref || 'mix';
  const stimulus = String(opts.stimulusType || intent?.stimulusType || '').toLowerCase();
  const movementPattern = opts.movementPattern || intent?.movementPattern || null;
  const injuryProfile = opts.injurySeverityByJoint || opts.injuryProfile || null;
  const dayLeverageCount = Number(opts.dayLeverageCount || 0);
  const allowClass = Array.isArray(intent.allowedEquipmentClass)
    ? new Set(intent.allowedEquipmentClass)
    : intent.allowedEquipmentClass ? new Set([intent.allowedEquipmentClass]) : null;

  const wantMuscles = Array.isArray(intent.muscleKeys) ? intent.muscleKeys : [];
  const wantTokens = tokensFromName(intent.searchHint || intent.intentKey || '');

  const candidates = [];
  for (const ex of list) {
    if (!isValidForIntent(ex, intent)) continue;
    const id = String(ex?.id || '').trim();
    if (!id) continue;
    const eqClass = equipmentClass(ex);
    if (allowClass && !allowClass.has(eqClass) && !allowClass.has('any')) continue;
    if (!equipmentMatches(access, eqClass)) continue;
    if (isBandName(ex?.name) || isBandName(ex?.equipment)) continue;

    const nameNorm = normalizeText(ex?.name || '');
    const leverageLike = /(leverage|smith)/.test(nameNorm);
    const injuryHigh = maxInjurySeverity(injuryProfile) >= 5 || highInjuryForPattern(movementPattern, injuryProfile);
    if (leverageLike && dayLeverageCount >= 1 && !injuryHigh) continue;

    const muscles = mapMuscles(ex);
    const muscleOverlap = wantMuscles.length
      ? wantMuscles.filter((m) => muscles.includes(m)).length / wantMuscles.length
      : 0;

    const mech = normalizeText(ex?.mechanic || '');
    if (stimulus === 'isolation' && mech.includes('compound') && muscleOverlap < 0.6) continue;

    const nameTokens = tokensFromName(ex?.name || '');
    const nameScore = tokenOverlapScore(nameTokens, wantTokens);

    let score = 0;
    score += muscleOverlap * 0.6;
    score += nameScore * 0.2;
    score += scoreByPreference(eqClass, pref);

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
  getExerciseById,
  selectExerciseIdsByIntent,
  equipmentClass,
  mapMuscles,
  isValidForIntent
};
