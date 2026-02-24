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
const HOME_DEFAULTS = ['bodyweight', 'dumbbell', 'bands'];
const GYM_DEFAULTS = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];
const MUSCLE_KEYS = ['Chest', 'Back', 'Legs', 'Glutes', 'Shoulders', 'Arms', 'Core', 'Forearms', 'Neck'];
const LARGE_MUSCLES = new Set(['Chest', 'Back', 'Legs', 'Glutes']);
const SMALL_MUSCLES = new Set(['Shoulders', 'Arms', 'Core', 'Abs', 'Forearms', 'Neck']);

const EXP_CFG = {
  '<6m': { large: 10, small: 6, maintenance: 0.7, add: 2, maxLarge: 14, maxSmall: 10, maxDifficulty: 3, diffTarget: 2 },
  '6–24m': { large: 14, small: 8, maintenance: 0.65, add: 4, maxLarge: 18, maxSmall: 12, maxDifficulty: 4, diffTarget: 3 },
  '2–5y': { large: 18, small: 10, maintenance: 0.6, add: 6, maxLarge: 22, maxSmall: 14, maxDifficulty: 5, diffTarget: 4 },
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

function preprocessExercises(exercises) {
  const src = Array.isArray(exercises) ? exercises : [];
  const out = [];
  for (const ex of src) {
    const name = String(ex?.name || '').trim();
    if (!name) return { error: 'INVALID_EXERCISE_RECORD', name: '', badField: 'name' };
    const style = String(ex?.style || '').trim();
    if (!STYLE_ENUM.has(style)) return { error: 'INVALID_EXERCISE_RECORD', name, badField: 'style' };
    const pattern = String(ex?.pattern || '').trim();
    if (!PATTERN_ENUM.has(pattern)) return { error: 'INVALID_EXERCISE_RECORD', name, badField: 'pattern' };
    out.push({
      ...ex,
      name,
      primary: String(ex?.primary || '').trim() === 'Abs' ? 'Core' : ex?.primary,
      nameLower: name.toLowerCase(),
      equipmentNorm: normalizeEquipmentTags(ex?.equipment || [])
    });
  }
  return { exercises: out.sort((a, b) => a.name.localeCompare(b.name)) };
}

function resolveDiscipline(trainingFeel) {
  if (trainingFeel === 'Aesthetic bodybuilding') return 'bodybuilding';
  if (trainingFeel === 'Powerbuilding') return 'powerbuilding';
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
  const out = new Set();
  (Array.isArray(movementsToAvoid) ? movementsToAvoid : []).forEach((v) => {
    const key = String(v || '').trim().toLowerCase();
    (AVOID_MAP[key] || []).forEach((token) => out.add(String(token).toLowerCase()));
  });
  return [...out].sort();
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
    ['experience', ['<6m', '6–24m', '2–5y', '5y+']],
    ['location', ['Home', 'Commercial gym']],
    ['trainingStyle', ['Mostly machines/cables', 'Mostly free weights', 'Balanced mix']],
    ['outputStyle', ['RPE/RIR cues', 'Simple sets x reps']],
    ['closeToFailure', ['Yes', 'No']]
  ];
  for (const [field, allowed] of requiredEnum) {
    if (!allowed.includes(src[field])) return invalidInput(field, `Expected one of: ${allowed.join(', ')}`);
  }
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
      allowedEquipment = [...new Set(['bodyweight', ...userEquipNorm])].sort();
    } else {
      allowedEquipment = [...HOME_DEFAULTS];
    }
  } else {
    allowedEquipment = [...new Set([...gym, ...userEquipNorm])].sort();
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

  return {
    ...src,
    discipline,
    phase,
    daysPerWeek: Math.floor(daysPerWeek),
    sessionCap: SESSION_CAP[sessionLengthMin],
    userEquipNorm,
    allowedEquipment: allowedEquipment.sort(),
    avoidNameContainsTokens: normalizeAvoidTokens(src.movementsToAvoid),
    injuryMap,
    preferredDays
  };
}

function computeWeeklyTargets(user) {
  const cfg = EXP_CFG[user.experience];
  const stressMult = STRESS_MULT[user.stress] || 1;
  const sleepMult = user.sleepHours < 5 ? 0.8 : user.sleepHours < 6 ? 0.9 : 1.0;
  const targets = {};
  for (const muscle of MUSCLE_KEYS) {
    const base = LARGE_MUSCLES.has(muscle) ? cfg.large : cfg.small;
    let n = Math.round(base * stressMult * sleepMult);
    if (user.activityLevel === 'Very active' && (muscle === 'Legs' || muscle === 'Glutes')) n = Math.round(n * 0.9);
    if ((user.priorityGroups || []).includes(muscle)) n += cfg.add;
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
              : ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs']
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
    slots.push(makeSlot('push_vp', 'VerticalPush', 'Compound', 'Shoulders', { primaryAllowed: ['Shoulders'], optional: true }));
    slots.push(makeSlot('push_ch_iso', 'Isolation', 'Isolation', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('push_sh_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral', 'Rear'] }));
    slots.push(makeSlot('push_tri_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long', 'Triceps-Lateral'] }));
    slots.push(makeSlot('push_core_opt', 'CoreStability', null, 'Core', { optional: true }));
  } else if (dayType === 'Pull') {
    slots.push(makeSlot('pull_vpull', 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], subPreferred: ['Lats-Width'] }));
    slots.push(makeSlot('pull_hpull', 'HorizontalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], subPreferred: ['Lats-Thickness', 'UpperBack'] }));
    slots.push(makeSlot('pull_rear_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders', 'Back'], subPreferred: ['Rear', 'UpperBack'], optional: true }));
    slots.push(makeSlot('pull_bi_iso', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'] }));
    slots.push(makeSlot('pull_core_rot', 'CoreRotation', null, 'Core', { optional: true }));
  } else if (dayType === 'Legs') {
    slots.push(makeSlot('legs_squat', 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads'] }));
    slots.push(makeSlot('legs_hinge', 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Hamstrings-Hinge', 'Glutes'] }));
    slots.push(makeSlot('legs_iso', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Quads', 'Hamstrings-Curl'] }));
    slots.push(makeSlot('legs_calf', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Calves', 'Calves-Gastrocnemius', 'Calves-Soleus'] }));
    slots.push(makeSlot('legs_lunge_opt', 'Lunge', 'Compound', 'Legs', { optional: true }));
  } else if (dayType === 'Upper') {
    slots.push(makeSlot('upper_hp', 'HorizontalPush', 'Compound', 'Chest', { primaryAllowed: ['Chest'] }));
    slots.push(makeSlot('upper_hpull', 'HorizontalPull', 'Compound', 'Back', { primaryAllowed: ['Back'] }));
    slots.push(makeSlot('upper_v_any', 'VerticalPull', 'Compound', 'Back', { primaryAllowed: ['Back'], optional: true }));
    slots.push(makeSlot('upper_sh_iso', 'Isolation', 'Isolation', 'Shoulders', { primaryAllowed: ['Shoulders'], subPreferred: ['Lateral', 'Rear'] }));
    slots.push(makeSlot('upper_bi', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Biceps-Long', 'Biceps-Short'], optional: true }));
    slots.push(makeSlot('upper_tri', 'Isolation', 'Isolation', 'Arms', { primaryAllowed: ['Arms'], subPreferred: ['Triceps-Long'], optional: true }));
    slots.push(makeSlot('upper_core', 'CoreStability', null, 'Core', { optional: true }));
  } else if (dayType === 'Lower') {
    slots.push(makeSlot('lower_squat', 'Squat', 'Compound', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Quads'] }));
    slots.push(makeSlot('lower_hinge', 'Hinge', 'Compound', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Hamstrings-Hinge', 'Glutes'] }));
    slots.push(makeSlot('lower_iso', 'Isolation', 'Isolation', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'], subPreferred: ['Glutes', 'Hamstrings-Curl'] }));
    slots.push(makeSlot('lower_calf', 'Isolation', 'Isolation', 'Legs', { primaryAllowed: ['Legs'], subPreferred: ['Calves'], optional: true }));
    slots.push(makeSlot('lower_lunge_opt', 'Lunge', 'Compound', 'Legs', { optional: true }));
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

function scoreExercise(ex, slot, user) {
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
  score += (10 - Math.abs(Number(ex.difficulty || 0) - EXP_CFG[user.experience].diffTarget) * 3);
  const basePenalty = (Number(ex.spine) + Number(ex.knee) + Number(ex.hip) + Number(ex.shoulder) + Number(ex.elbow)) * 2;
  const jointEval = evaluateJoint(ex, user);
  return score - basePenalty - jointEval.penalty;
}

function filterEligible(slot, exercises, user, weekPicked) {
  const maxDiff = EXP_CFG[user.experience].maxDifficulty;
  return exercises.filter((ex) => {
    if (weekPicked.has(ex.name)) return false;
    if (!ex.equipmentNorm.some((eq) => user.allowedEquipment.includes(eq))) return false;
    if (matchesAvoid(ex.nameLower, user.avoidNameContainsTokens)) return false;
    const joint = evaluateJoint(ex, user);
    if (joint.reject) return false;
    if (ex.pattern !== slot.pattern) return false;
    if (slot.styleRequired && ex.style !== slot.styleRequired) return false;
    if (!slot.styleRequired && ['Mobility', 'Cardio'].includes(ex.style) && !['Mobility', 'Cardio'].includes(slot.pattern)) return false;
    if (Number(ex.difficulty) > maxDiff) return false;
    return true;
  });
}

function fillSlots(dayBlueprint, exercises, user, weekPicked) {
  const picked = [];
  for (const slot of dayBlueprint.slots) {
    let eligible = filterEligible(slot, exercises, user, weekPicked);
    if (!eligible.length && slot.styleRequired === 'Compound') {
      if (slot.pattern === 'VerticalPush') {
        const alt = { ...slot, pattern: 'Isolation', styleRequired: 'Isolation', primaryAllowed: ['Shoulders'] };
        eligible = filterEligible(alt, exercises, user, weekPicked);
      } else if (slot.pattern === 'Squat') {
        const alt = { ...slot, pattern: 'Lunge', styleRequired: 'Compound' };
        eligible = filterEligible(alt, exercises, user, weekPicked);
      }
    }
    if (!eligible.length) {
      if (slot.optional) continue;
      return structuredNoEligible(slot, user);
    }
    eligible = eligible
      .map((ex) => ({ ex, score: scoreExercise(ex, slot, user) }))
      .sort((a, b) => (b.score - a.score) || a.ex.name.localeCompare(b.ex.name));
    const chosen = eligible[0].ex;
    weekPicked.add(chosen.name);
    picked.push({
      slotId: slot.id,
      optional: slot.optional,
      muscleTarget: slot.muscleTarget,
      ...chosen
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
        const sets = Math.max(minForThis, Math.floor(budget / remaining));
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
  return outDays;
}

function applySessionCapTrimming(day, sessionCap, priorityGroups) {
  const list = day.exercises.slice();
  const isPriority = (ex) => priorityGroups.includes(ex.muscleTarget) || priorityGroups.includes(ex.primary);
  const removeFirst = (predicate) => {
    const idx = list.findIndex(predicate);
    if (idx >= 0) list.splice(idx, 1);
  };

  while (list.length > sessionCap) removeFirst((ex) => ex.style === 'Isolation' && !isPriority(ex));
  while (list.length > sessionCap) removeFirst((ex) => ex.pattern === 'Lunge');
  while (list.length > sessionCap) removeFirst((ex) => ['CoreFlexion', 'CoreStability', 'CoreRotation'].includes(ex.pattern));
  while (list.length > sessionCap) {
    const arms = list.filter((ex) => ex.primary === 'Arms' || ex.muscleTarget === 'Arms');
    if (arms.length <= 1) break;
    const idx = list.findIndex((ex) => ex.primary === 'Arms' || ex.muscleTarget === 'Arms');
    if (idx >= 0) list.splice(idx, 1);
  }
  while (list.length > sessionCap) removeFirst((ex) => ex.style === 'Isolation');
  while (list.length > sessionCap) removeFirst((ex) => ex.style === 'Compound' && ex.sets <= 2);

  return { ...day, exercises: list };
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
    const filledDays = [];
    for (const dayBp of blueprint) {
      const filled = fillSlots(dayBp, exercises, user, weekPicked);
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
          return { ...ex, sets: Math.max(minSets, scaled) };
        })
      }));
    }
    prescribed = prescribed.map((d) => applySessionCapTrimming(d, user.sessionCap, user.priorityGroups || []));
    weeks.push({ weekIndex: i + 1, weekType, days: prescribed.map((d) => ({ dayType: d.dayType, exercises: d.exercises.map(({ muscleTarget, slotId, optional, ...rest }) => rest) })) });
  }
  return { weeks };
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
      notes: []
    },
    schedule: schedule.map((s) => ({ day: s.day, dayType: s.dayType })),
    weeks: weeksResult.weeks
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
