const { generatePlan } = require('../core/trainingEngine');

function signatureFor(ex) {
  const keys = Array.isArray(ex.muscleKeys) ? ex.muscleKeys.slice().sort().join(',') : '';
  return `${ex.movementPattern || ''}|${keys}|${ex.equipmentClass || ''}`;
}

function analyzePlan(plan) {
  const week = (plan.weeks || [])[0];
  if (!week) return null;
  const nulls = [];
  const duplicatesByDay = [];
  const nearDupByDay = [];
  const requiredChecks = [];

  for (const day of week.days || []) {
    const ids = new Set();
    const sigs = new Set();
    let dupCount = 0;
    let nearDupCount = 0;
    let hasChest = false;
    let hasRow = false;
    let hasVertical = false;
    let hasKnee = false;
    let hasHinge = false;

    for (const ex of day.exercises || []) {
      if (!ex.exerciseId) {
        nulls.push({ intentKey: ex.intentKey, slotId: ex.slotId, movementPattern: ex.movementPattern });
      } else {
        if (ids.has(ex.exerciseId)) dupCount += 1;
        ids.add(ex.exerciseId);
      }

      const sig = signatureFor(ex);
      if (sigs.has(sig)) nearDupCount += 1;
      sigs.add(sig);

      const intent = String(ex.intentKey || '').toLowerCase();
      if (intent.includes('chest_press')) hasChest = true;
      if (intent.includes('row_compound')) hasRow = true;
      if (intent.includes('vertical_pull')) hasVertical = true;
      if (intent.includes('knee_dominant')) hasKnee = true;
      if (intent.includes('hip_hinge')) hasHinge = true;
    }

    duplicatesByDay.push({ day: day.label, count: dupCount });
    nearDupByDay.push({ day: day.label, count: nearDupCount });

    const focus = String(day.focus || '').toLowerCase();
    const isLower = focus.includes('legs') || focus.includes('lower');
    const isPullDay = focus.includes('pull') && !focus.includes('lower');
    if (focus.includes('push')) requiredChecks.push({ day: day.label, ok: hasChest });
    if (isPullDay) requiredChecks.push({ day: day.label, ok: hasRow && hasVertical });
    if (isLower) requiredChecks.push({ day: day.label, ok: hasKnee && hasHinge });
  }

  return { nulls, duplicatesByDay, nearDupByDay, requiredChecks };
}

function runTest(label, overrides = {}) {
  const input = {
    discipline: 'bodybuilding',
    daysPerWeek: 5,
    experience: 'advanced',
    equipmentAccess: overrides.equipmentAccess || {
      bodyweight: true,
      dumbbell: true,
      barbell: true,
      cable: true,
      machine: true
    },
    strength: {
      bodyweight: 185,
      height: 70,
      benchWeight: 225,
      benchReps: 5,
      lowerWeight: 315,
      lowerReps: 5,
      hingeWeight: 275,
      hingeReps: 5,
      pullWeight: 140,
      pullReps: 8,
      phase: 'bulk',
      targetWeightLb: 195,
      trainingAgeBucket: '5_plus',
      timePerSession: '60_75',
      equipmentStylePref: 'mix',
      emphasis: ['chest'],
      injurySeverityByJoint: {
        shoulder: 0,
        elbow: 0,
        wrist: 0,
        back: 0,
        hip: 0,
        knee: 0,
        ankle: 0
      }
    }
  };

  const plan = generatePlan(input);
  const report = analyzePlan(plan);
  console.log(`\n${label}`);
  console.log(`null_count: ${report.nulls.length}`);
  if (report.nulls.length) console.log('nulls:', report.nulls);
  console.log('dup_by_day:', report.duplicatesByDay);
  console.log('near_dup_by_day:', report.nearDupByDay);
  console.log('required_intents:', report.requiredChecks);
}

runTest('Test A: normal equipment');
runTest('Test B: restricted equipment', {
  equipmentAccess: {
    bodyweight: false,
    dumbbell: false,
    barbell: false,
    cable: false,
    machine: false
  }
});
