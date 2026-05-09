const EXERCISE_LABEL_NORMALIZATION = {
  muscleMap: {
    Chest: ['chest'],
    Back: ['lats', 'middle back', 'lower back', 'traps'],
    Shoulders: ['shoulders'],
    Arms: ['biceps', 'triceps'],
    Quads: ['quadriceps'],
    'Hamstrings/Glutes': ['hamstrings', 'glutes'],
    Calves: ['calves'],
    Abs: ['abdominals', 'obliques']
  },
  equipmentMap: {
    Bodyweight: ['body only'],
    Dumbbells: ['dumbbell'],
    Barbell: ['barbell'],
    Cable: ['cable'],
    Machines: ['machine'],
    Kettlebells: ['kettlebells'],
    Other: ['other', 'exercise ball']
  }
};

const PRIORITY_MUSCLE_TARGETS = {
  Chest: ['chest'],
  Back: ['lats', 'middle back', 'lower back', 'traps'],
  Shoulders: ['shoulders'],
  Arms: ['biceps', 'triceps'],
  Quads: ['quadriceps'],
  'Hamstrings/Glutes': ['hamstrings', 'glutes'],
  Calves: ['calves'],
  Abs: ['abdominals', 'obliques']
};

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[+/]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLookup(map, canonicalResolver) {
  const lookup = new Map();
  Object.entries(map || {}).forEach(([label, dbLabels]) => {
    const canonical = canonicalResolver(label);
    if (!canonical) return;
    lookup.set(normalizeKey(label), canonical);
    (Array.isArray(dbLabels) ? dbLabels : []).forEach((dbLabel) => {
      lookup.set(normalizeKey(dbLabel), canonical);
    });
  });
  return lookup;
}

const muscleLookup = buildLookup(EXERCISE_LABEL_NORMALIZATION.muscleMap, (label) => {
  switch (label) {
    case 'Chest': return 'Chest';
    case 'Back': return 'Back';
    case 'Shoulders': return 'Shoulders';
    case 'Arms': return 'Arms';
    case 'Quads': return 'Legs';
    case 'Hamstrings/Glutes': return 'Glutes';
    case 'Calves': return 'Calves';
    case 'Abs': return 'Core';
    default: return '';
  }
});

[
  ['legs', 'Legs'],
  ['glutes', 'Glutes'],
  ['hamstrings', 'Glutes'],
  ['core', 'Core'],
  ['abs', 'Core'],
  ['obliques', 'Core'],
  ['abdominals', 'Core'],
  ['forearms', 'Forearms'],
  ['neck', 'Neck']
].forEach(([alias, canonical]) => {
  muscleLookup.set(normalizeKey(alias), canonical);
});

const equipmentLookup = buildLookup(EXERCISE_LABEL_NORMALIZATION.equipmentMap, (label) => {
  switch (label) {
    case 'Bodyweight': return 'bodyweight';
    case 'Dumbbells': return 'dumbbell';
    case 'Barbell': return 'barbell';
    case 'Cable': return 'cable';
    case 'Machines': return 'machine';
    case 'Kettlebells': return 'kettlebell';
    case 'Other': return 'other';
    default: return '';
  }
});

[
  ['bodyweight', 'bodyweight'],
  ['body only', 'bodyweight'],
  ['dumbbell', 'dumbbell'],
  ['dumbbells', 'dumbbell'],
  ['barbell', 'barbell'],
  ['cable', 'cable'],
  ['machine', 'machine'],
  ['machines', 'machine'],
  ['smith machine', 'machine'],
  ['kettlebell', 'kettlebell'],
  ['kettlebells', 'kettlebell'],
  ['exercise ball', 'other'],
  ['other', 'other']
].forEach(([alias, canonical]) => {
  equipmentLookup.set(normalizeKey(alias), canonical);
});

function normalizeMuscleLabel(value) {
  const key = normalizeKey(value);
  return muscleLookup.get(key) || String(value || '').trim();
}

function normalizeMuscleLabels(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => normalizeMuscleLabel(value))
    .filter(Boolean)));
}

function normalizeEquipmentLabel(value) {
  const key = normalizeKey(value);
  return equipmentLookup.get(key) || key;
}

function getPriorityMuscleTargets(priorityLabel) {
  const key = String(priorityLabel || '').trim();
  return Array.isArray(PRIORITY_MUSCLE_TARGETS[key]) ? PRIORITY_MUSCLE_TARGETS[key].slice() : [];
}

module.exports = {
  EXERCISE_LABEL_NORMALIZATION,
  PRIORITY_MUSCLE_TARGETS,
  getPriorityMuscleTargets,
  normalizeMuscleLabel,
  normalizeMuscleLabels,
  normalizeEquipmentLabel
};
