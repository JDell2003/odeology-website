const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../generator/trainingEngine.oblueprint');
const trainingRoutes = require('../core/trainingRoutes');

function baseInput(overrides = {}) {
  return {
    name: 'Powerbuilding Test',
    primaryGoal: 'Build size',
    timeline: '8 weeks',
    focus: 'Strength',
    experience: '2-5y',
    location: 'Commercial gym',
    trainingStyle: 'Balanced mix',
    outputStyle: 'RPE/RIR cues',
    closeToFailure: 'No',
    daysPerWeek: 4,
    sessionLengthMin: '60',
    priorityGroups: ['Chest', 'Back'],
    movementsToAvoid: [],
    preferredDays: ['Mo', 'Tu', 'Th', 'Fr'],
    equipmentAccess: ['Dumbbells', 'Barbell', 'Cable', 'Machines'],
    painAreas: [],
    painProfilesByArea: {},
    weightLb: 185,
    bodyweight: 185,
    bench: 225,
    squat: 315,
    deadlift: 405,
    benchVariation: '',
    benchWeight: 205,
    benchReps: 5,
    lowerMovement: 'Back squat',
    lowerWeight: 275,
    lowerReps: 5,
    hingeMovement: 'Deadlift',
    hingeWeight: 365,
    hingeReps: 5,
    sleepHours: 7,
    activityLevel: 'Active',
    stress: 'Low',
    trainingFeel: 'Powerbuilding',
    planSeed: 12345,
    ...overrides
  };
}

function flattenExercises(plan) {
  return (plan?.weeks || []).flatMap((week) => (week.days || []).flatMap((day) => day.exercises || []));
}

function hasStrengthAnchor(plan) {
  return flattenExercises(plan).some((exercise) => /rep-first progression/i.test(String(exercise?.progressionRule || '')) && /^[3-6]$|4-6|3-5/.test(String(exercise?.reps || '').trim()));
}

function exerciseNames(plan) {
  return flattenExercises(plan).map((exercise) => String(exercise?.name || ''));
}

function totalSets(plan, predicate = null) {
  return flattenExercises(plan).reduce((sum, exercise) => {
    if (predicate && !predicate(exercise)) return sum;
    return sum + (Number(exercise?.sets || 0) || 0);
  }, 0);
}

function inferRequiredEquipment(name, equipment = []) {
  const required = new Set((Array.isArray(equipment) ? equipment : []).map((x) => String(x || '').trim().toLowerCase()));
  const lower = String(name || '').trim().toLowerCase();
  if (/\bsmith\b/.test(lower)) required.add('machine');
  if (/\b(machine|leg press|hack squat|pec deck|chest press|calf press)\b/.test(lower)) required.add('machine');
  if (/\b(cable|pulldown|pushdown|rope crunch|face pull|crossover|seated cable row)\b/.test(lower)) required.add('cable');
  if (/\b(barbell|front squat|back squat|romanian deadlift|deadlift|hip thrust|bench press)\b/.test(lower)) required.add('barbell');
  if (/\b(dumbbell|goblet|bulgarian split squat)\b/.test(lower)) required.add('dumbbell');
  if (/\b(bodyweight|push up|push-up|pull up|pull-up|chin up|chin-up|plank|sit up|sit-up|bodyweight squat)\b/.test(lower)) required.add('bodyweight');
  return Array.from(required);
}

function assertAllowedEquipmentOnly(plan) {
  const allowed = new Set((plan?.meta?.allowedEquipment || []).map((x) => String(x || '').trim().toLowerCase()));
  for (const ex of flattenExercises(plan)) {
    const required = Array.isArray(ex?.requiredEquipment) && ex.requiredEquipment.length
      ? ex.requiredEquipment.map((token) => String(token || '').trim().toLowerCase())
      : inferRequiredEquipment(ex.name, ex.equipment);
    for (const token of required) {
      assert.ok(allowed.has(token), `${ex.name} requires unavailable equipment: ${token}`);
    }
  }
}

test('powerbuilding infers bench emphasis from accepted fields', () => {
  const normalized = engine.normalizeUserInput(baseInput({
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    benchVariation: 'Paused bench',
    benchWeight: 245,
    benchReps: 5
  }));
  assert.equal(normalized?.error, undefined, normalized?.reason || normalized?.error);
  assert.equal(normalized.profile.powerbuilding.emphasis, 'bench');
});

test('powerbuilding plan stays route-valid and differs from bodybuilding structure', () => {
  const bodybuilding = engine.buildOblueprintPlan(baseInput({
    trainingFeel: 'Aesthetic bodybuilding',
    focus: 'Aesthetic',
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    outputStyle: 'Simple sets x reps',
    planSeed: 4321
  }), { fastBuild: true });
  const powerbuilding = trainingRoutes._private.buildOblueprintPlanWithFallback(baseInput({
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    closeToFailure: 'Yes',
    planSeed: 4321
  }));
  assert.equal(bodybuilding?.error, undefined, bodybuilding?.reason || bodybuilding?.error);
  assert.equal(powerbuilding?.error, undefined, powerbuilding?.error?.reason || powerbuilding?.error?.error || 'powerbuilding build failed');
  assert.doesNotThrow(() => trainingRoutes._private.assertPowerbuildingPlanByEngine(powerbuilding.plan));
  const bodybuildingSplit = bodybuilding.weeks[0].days.map((day) => day.dayType).join('|');
  const powerbuildingSplit = powerbuilding.plan.weeks[0].days.map((day) => day.dayType).join('|');
  assert.notEqual(powerbuildingSplit, bodybuildingSplit);
  assert.ok(
    flattenExercises(powerbuilding.plan).some((exercise) => /rep-first progression/i.test(String(exercise?.progressionRule || '')) && /^[3-6]$|4-6|3-5/.test(String(exercise?.reps || '').trim())),
    'expected visible strength-specific rep-first work'
  );
});

test('powerbuilding priority order changes protected accessory volume', () => {
  const chestFirst = engine.buildOblueprintPlan(baseInput({
    focus: 'Size',
    priorityGroups: ['Chest', 'Arms', 'Core'],
    planSeed: 9876
  }), { fastBuild: true });
  const armsFirst = engine.buildOblueprintPlan(baseInput({
    focus: 'Size',
    priorityGroups: ['Arms', 'Chest', 'Core'],
    planSeed: 9876
  }), { fastBuild: true });
  assert.equal(chestFirst?.error, undefined, chestFirst?.reason || chestFirst?.error);
  assert.equal(armsFirst?.error, undefined, armsFirst?.reason || armsFirst?.error);
  const chestPlanChestSets = totalSets(chestFirst, (exercise) => String(exercise?.muscleTarget || '') === 'Chest');
  const armsPlanChestSets = totalSets(armsFirst, (exercise) => String(exercise?.muscleTarget || '') === 'Chest');
  const chestPlanArmSets = totalSets(chestFirst, (exercise) => String(exercise?.muscleTarget || '') === 'Arms');
  const armsPlanArmSets = totalSets(armsFirst, (exercise) => String(exercise?.muscleTarget || '') === 'Arms');
  assert.ok(chestPlanChestSets >= armsPlanChestSets, 'expected chest-first ordering to protect more chest work');
  assert.ok(armsPlanArmSets >= chestPlanArmSets, 'expected arms-first ordering to protect more arm work');
});

test('powerbuilding respects hard equipment constraints without barbell access', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    daysPerWeek: 3,
    sessionLengthMin: '45',
    preferredDays: ['Mo', 'We', 'Fr'],
    location: 'Commercial gym',
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Cable', 'Machines'],
    trainingStyle: 'Balanced mix',
    priorityGroups: ['Chest', 'Back'],
    bench: 0,
    squat: 0,
    deadlift: 0,
    benchWeight: 0,
    benchReps: 0,
    lowerMovement: 'Leg press',
    lowerWeight: 180,
    lowerReps: 10,
    hingeMovement: 'Hip thrust machine',
    hingeWeight: 180,
    hingeReps: 10,
    planSeed: 2468
  }), { fastBuild: true });
  assert.equal(plan?.error, undefined, plan?.reason || plan?.error);
  assertAllowedEquipmentOnly(plan);
  assert.equal(
    flattenExercises(plan).filter((exercise) => Array.isArray(exercise?.requiredEquipment) && exercise.requiredEquipment.includes('barbell')).length,
    0
  );
});

test('powerbuilding respects pain constraints and preserves calves/core priorities', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Calves', 'Core', 'Chest'],
    painAreas: ['Shoulder'],
    painProfilesByArea: {
      Shoulder: { severity: 7, recency: 'Recent', notes: 'Overhead pressing and deep stretch pressing are poorly tolerated.' }
    },
    planSeed: 1357
  }), { fastBuild: true });
  assert.equal(plan?.error, undefined, plan?.reason || plan?.error);
  assert.ok(flattenExercises(plan).filter((exercise) => Boolean(exercise?.directCalf)).length >= 2, 'expected calf work to survive');
  assert.ok(flattenExercises(plan).filter((exercise) => Boolean(exercise?.directAb)).length >= 2, 'expected core work to survive');
  assert.ok(
    flattenExercises(plan).filter((exercise) => Boolean(exercise?.shoulderPressPattern)).length <= 8,
    'expected recent severe shoulder pain to suppress extra weekly overhead pressing'
  );
});

test('powerbuilding low recovery reduces accessory volume', () => {
  const highRecovery = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Chest', 'Back', 'Arms'],
    sleepHours: 8,
    stress: 'Low',
    planSeed: 1122
  }), { fastBuild: true });
  const lowRecovery = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Chest', 'Back', 'Arms'],
    sleepHours: 5,
    stress: 'High',
    planSeed: 1122
  }), { fastBuild: true });
  assert.equal(highRecovery?.error, undefined, highRecovery?.reason || highRecovery?.error);
  assert.equal(lowRecovery?.error, undefined, lowRecovery?.reason || lowRecovery?.error);
  const highAccessorySets = totalSets(highRecovery, (exercise) => String(exercise?.style || '') === 'Isolation');
  const lowAccessorySets = totalSets(lowRecovery, (exercise) => String(exercise?.style || '') === 'Isolation');
  assert.ok(lowAccessorySets < highAccessorySets, `expected lower accessory volume under recovery stress: ${lowAccessorySets} < ${highAccessorySets}`);
});

test('powerbuilding anchors appear early and stay away from reckless failure', () => {
  const built = trainingRoutes._private.buildOblueprintPlanWithFallback(baseInput({
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    closeToFailure: 'Yes',
    planSeed: 2233
  }));
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'powerbuilding build failed');
  const firstWeek = built.plan.weeks[0];
  const anchorDays = (firstWeek?.days || []).filter((day) => /rep-first progression/i.test(String(day.exercises?.[0]?.progressionRule || '')));
  assert.ok(anchorDays.length >= 2, 'expected multiple strength-anchor days');
  anchorDays.forEach((day) => {
    const first = day.exercises[0];
    assert.ok(/^[3-6]$|4-6|3-5/.test(String(first?.reps || '').trim()), `${day.dayType}: expected strength-range top slot`);
    assert.notEqual(String(first?.rir || ''), '0-2', `${day.dayType}: anchor should not be programmed to reckless failure`);
  });
});

test('powerbuilding direct builder handles the low-recovery pain outlier without fallback', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    primaryGoal: 'Cut fat',
    sessionLengthMin: '45',
    priorityGroups: ['Chest', 'Arms', 'Core'],
    equipmentAccess: ['Dumbbells', 'Cable', 'Machines'],
    movementsToAvoid: ['bench press', 'deadlift'],
    painAreas: ['Shoulder', 'Back', 'Elbow'],
    painProfilesByArea: {
      Shoulder: { severity: 7, recency: 'Recent', notes: 'Overhead and wide pressing irritates it' },
      Back: { severity: 6, recency: 'Recent', notes: 'Axial loading and unsupported rows flare it' },
      Elbow: { severity: 6, recency: 'Recent', notes: 'Heavy triceps work and straight-bar curls irritate it' }
    },
    benchVariation: 'Incline dumbbell press',
    benchWeight: 85,
    benchReps: 8,
    lowerMovement: 'Leg press',
    lowerWeight: 360,
    lowerReps: 8,
    hingeMovement: 'Hip thrust',
    hingeWeight: 315,
    hingeReps: 8,
    sleepHours: 5.5,
    stress: 'High',
    activityLevel: 'High',
    planSeed: 4108
  }), { fastBuild: true });
  assert.equal(plan?.error, undefined, plan?.reason || plan?.message || plan?.error);
  const names = exerciseNames(plan).join(' | ').toLowerCase();
  assert.ok(hasStrengthAnchor(plan), 'expected at least one safe strength anchor to survive');
  assert.ok(!/\bbench press\b/.test(names), 'bench-press family should stay removed');
  assert.ok(!/\b(deadlift|romanian deadlift|\brdl\b|stiff[- ]?leg)\b/.test(names), 'deadlift-family work should stay removed');
  const lowerFocus = plan.weeks[0].days.find((day) => day.dayType === 'LowerFocus');
  assert.ok(lowerFocus, 'expected a LowerFocus day');
  const lowerFocusNames = (lowerFocus.exercises || []).map((exercise) => String(exercise?.name || '').toLowerCase()).join(' | ');
  assert.ok(!/\b(deadlift|romanian deadlift|\brdl\b|stiff[- ]?leg)\b/.test(lowerFocusNames), 'LowerFocus should not force deadlift-family work');
  assert.ok(/\b(leg curl|hamstring curl|glute ham raise|leg extension|hip thrust|glute bridge|pull through)\b/.test(lowerFocusNames), 'LowerFocus should use a safe posterior or lower substitute');
});

test('powerbuilding route fallback preserves hard equipment limits for home dumbbell bench beginner plans', () => {
  const built = trainingRoutes._private.buildOblueprintPlanWithFallback(baseInput({
    experience: '<6m',
    location: 'Home',
    trainingStyle: 'Mostly free weights',
    outputStyle: 'Simple sets x reps',
    daysPerWeek: 4,
    sessionLengthMin: '30',
    preferredDays: ['Mo', 'Tu', 'Th', 'Sa'],
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Bench'],
    priorityGroups: ['Chest', 'Back', 'Legs'],
    bench: 0,
    squat: 0,
    deadlift: 0,
    benchVariation: 'Dumbbell bench press',
    benchWeight: 45,
    benchReps: 8,
    lowerMovement: 'Goblet squat',
    lowerWeight: 70,
    lowerReps: 8,
    hingeMovement: 'Dumbbell Romanian deadlift',
    hingeWeight: 60,
    hingeReps: 8,
    planSeed: 99123
  }));
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'route build failed');
  assertAllowedEquipmentOnly(built.plan);
  const names = exerciseNames(built.plan).join(' | ').toLowerCase();
  assert.ok(!/\b(cable|machine|leverage|leg press|lat pulldown|barbell)\b/.test(names), 'unavailable equipment leaked into the route-built plan');
  assert.ok(hasStrengthAnchor(built.plan), 'expected a safe strength anchor to remain');
  assert.ok(flattenExercises(built.plan).some((exercise) => String(exercise?.style || '') === 'Isolation'), 'expected a hypertrophy accessory to remain');
  built.plan.weeks[0].days.forEach((day) => {
    assert.ok((day.exercises || []).length <= 4, `${day.dayType}: expected a realistic 30-minute beginner movement cap`);
  });
});

test('powerbuilding movementsToAvoid blocks deadlift, bench, and squat families in direct builds', () => {
  const deadliftBlocked = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Glutes', 'Back', 'Core'],
    movementsToAvoid: ['deadlift'],
    equipmentAccess: ['Dumbbells', 'Cable', 'Machines', 'Bench'],
    hingeMovement: 'Hip thrust',
    hingeWeight: 225,
    hingeReps: 8,
    planSeed: 5101
  }), { fastBuild: true });
  assert.equal(deadliftBlocked?.error, undefined, deadliftBlocked?.reason || deadliftBlocked?.error);
  assert.ok(!/\b(deadlift|romanian deadlift|\brdl\b|stiff[- ]?leg)\b/.test(exerciseNames(deadliftBlocked).join(' ').toLowerCase()));

  const benchBlocked = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Chest', 'Arms', 'Core'],
    movementsToAvoid: ['bench press'],
    equipmentAccess: ['Dumbbells', 'Cable', 'Machines', 'Bench'],
    painAreas: ['Shoulder'],
    painProfilesByArea: {
      Shoulder: { severity: 6, recency: 'Recent', notes: 'Benching is poorly tolerated.' }
    },
    planSeed: 5102
  }), { fastBuild: true });
  assert.equal(benchBlocked?.error, undefined, benchBlocked?.reason || benchBlocked?.error);
  assert.ok(!/\bbench\b/.test(exerciseNames(benchBlocked).join(' ').toLowerCase()));

  const squatBlocked = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Legs', 'Core', 'Calves'],
    movementsToAvoid: ['squat'],
    equipmentAccess: ['Dumbbells', 'Cable', 'Machines', 'Bench'],
    lowerMovement: 'Leg extension',
    lowerWeight: 120,
    lowerReps: 12,
    hingeMovement: 'Hip thrust',
    hingeWeight: 225,
    hingeReps: 8,
    planSeed: 5103
  }), { fastBuild: true });
  assert.equal(squatBlocked?.error, undefined, squatBlocked?.reason || squatBlocked?.error);
  assert.ok(!/\b(squat|hack squat|leg press)\b/.test(exerciseNames(squatBlocked).join(' ').toLowerCase()));
});
