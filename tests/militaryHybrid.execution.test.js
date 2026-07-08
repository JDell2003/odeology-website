const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../generator/trainingEngine.oblueprint');
const trainingRoutes = require('../core/trainingRoutes');
const military = require('../generator/militaryHybrid.oblueprint');
const { MILITARY_HYBRID_MATRIX, basePayload } = require('./militaryHybrid.matrix.test');

function flatten(plan, firstWeekOnly = false) {
  const weeks = firstWeekOnly ? (plan?.weeks || []).slice(0, 1) : (plan?.weeks || []);
  return weeks.flatMap((week) => (week.days || []).flatMap((day) => (day.exercises || []).map((exercise, index) => ({
    ...exercise,
    _day: day,
    _index: index
  }))));
}

function buildDirect(payload) {
  const plan = engine.buildOblueprintPlan(payload, { fastBuild: true });
  assert.equal(plan?.error, undefined, `${plan?.error || ''} ${plan?.reason || ''}`.trim());
  return plan;
}

function requiredEquipment(exercise) {
  const explicit = Array.isArray(exercise?.requiredEquipment) ? exercise.requiredEquipment : [];
  if (explicit.length) return explicit.map((value) => String(value || '').toLowerCase());
  const name = String(exercise?.name || '').toLowerCase();
  const equipment = new Set((exercise?.equipment || []).map((value) => String(value || '').toLowerCase()));
  if (/\b(cable|pulldown|pushdown|pallof)\b/.test(name)) equipment.add('cable');
  if (/\b(machine|leverage|leg press|hack squat|smith)\b/.test(name)) equipment.add('machine');
  if (/\b(barbell|back squat|front squat|deadlift)\b/.test(name)) equipment.add('barbell');
  if (/\b(dumbbell|goblet)\b/.test(name)) equipment.add('dumbbell');
  if (/\bsled\b/.test(name)) equipment.add('sled');
  return Array.from(equipment);
}

function assertEquipment(plan) {
  const allowed = new Set((plan?.meta?.allowedEquipment || []).map((value) => String(value || '').toLowerCase()));
  for (const exercise of flatten(plan, true)) {
    for (const token of requiredEquipment(exercise)) {
      assert.ok(allowed.has(token), `${exercise.name} leaked unavailable ${token}`);
    }
  }
}

function assertMilitaryIdentity(plan) {
  const exercises = flatten(plan, true);
  assert.equal(plan.discipline, 'military');
  assert.equal(plan.trainingFeel, 'Military Hybrid');
  assert.equal(plan.meta?.discipline, 'military');
  assert.ok(exercises.some(military.isStrengthAnchor), 'missing strength anchor');
  assert.ok(exercises.some((exercise) => exercise.taskType === 'military_readiness'), 'missing readiness work');
  assert.ok(exercises.some((exercise) => exercise.zone2), 'missing aerobic base');
  assert.ok(exercises.some((exercise) => {
    if (exercise.taskType === 'military_readiness' || military.isStrengthAnchor(exercise)) return false;
    return String(exercise.style || '') === 'Isolation'
      || (String(exercise.style || '') === 'Compound' && /6-10|6-12|8-12|8-15|10-15|10-20/.test(String(exercise.reps || '')));
  }), 'missing hypertrophy support');
  assert.equal(exercises.some((exercise) => /\b(weapon|combat|tactical drill|firearm)\b/i.test(String(exercise.name || exercise.notes || ''))), false);
}

function weekdayIndex(value) {
  const key = String(value || '').trim().toLowerCase();
  return {
    su: 0, sun: 0,
    mo: 1, mon: 1,
    tu: 2, tue: 2,
    we: 3, wed: 3,
    th: 4, thu: 4,
    fr: 5, fri: 5,
    sa: 6, sat: 6
  }[key];
}

function hasPrioritySupport(plan, priority) {
  const exercises = flatten(plan, true);
  const key = String(priority || '').trim().toLowerCase();
  return exercises.some((exercise) => {
    const name = String(exercise.name || '').toLowerCase();
    const primary = String(exercise.primary || exercise.muscleTarget || '').toLowerCase();
    if (key === 'chest') return primary === 'chest' || /\b(bench|chest press|push-up)\b/.test(name);
    if (key === 'back') return primary === 'back' || /\b(row|pulldown|pull-up|chin-up|rope climb)\b/.test(name);
    if (key === 'legs') return primary === 'legs' || /\b(squat|leg press|lunge|step[- ]?up|leg extension)\b/.test(name);
    if (key === 'glutes') return /\b(glute|hip thrust|bridge|deadlift|rdl|pull[- ]?through|leg curl|hamstring)\b/.test(name);
    if (key === 'shoulders') return primary === 'shoulders' || /\b(shoulder|lateral raise|rear delt|upright row)\b/.test(name);
    if (key === 'arms') return ['biceps', 'triceps'].includes(String(exercise.directArmType || '').toLowerCase())
      || /\b(curl|triceps|pushdown|extension|close-grip bench)\b/.test(name);
    if (key === 'calves') return Boolean(exercise.directCalf) || /\bcalf\b/.test(name);
    if (key === 'core') return Boolean(exercise.directAb) || /\b(plank|crunch|pallof|side bend|twist|leg raise)\b/.test(name);
    return false;
  });
}

test('all military matrix cases build directly and satisfy the route validator', () => {
  for (const entry of MILITARY_HYBRID_MATRIX) {
    const plan = buildDirect(entry.payload);
    assert.doesNotThrow(() => military.validateMilitaryPlan(plan), entry.title);
    assertMilitaryIdentity(plan);
    assertEquipment(plan);
    const cap = Number(plan.meta?.sessionCap || 6);
    for (const day of plan.weeks[0].days) {
      assert.ok(day.exercises.length <= cap, `${entry.title}: ${day.dayType} exceeds ${cap} tasks`);
      const anchorIndex = day.exercises.findIndex(military.isStrengthAnchor);
      if (anchorIndex >= 0) assert.ok(anchorIndex <= 1, `${entry.title}: strength anchor is buried`);
    }
  }
});

test('30-minute beginner home plan stays compact and equipment-safe', () => {
  const plan = buildDirect(basePayload({
    experience: '<6m',
    sessionLengthMin: '30',
    daysPerWeek: 3,
    preferredDays: ['Mo', 'We', 'Sa'],
    location: 'Home',
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Bench'],
    bench: null,
    squat: null,
    deadlift: null,
    planSeed: 6101
  }));
  assertMilitaryIdentity(plan);
  assertEquipment(plan);
  for (const day of plan.weeks[0].days) {
    assert.ok(day.exercises.length >= 2 && day.exercises.length <= 4);
  }
  const names = flatten(plan, true).map((exercise) => exercise.name).join('|');
  assert.doesNotMatch(names, /\b(cable|machine|leverage|leg press|lat pulldown|barbell|sled)\b/i);
});

test('running and deadlift avoidance replace rather than erase readiness work', () => {
  const plan = buildDirect(basePayload({
    movementsToAvoid: ['running', 'deadlift'],
    painAreas: ['Back'],
    painProfilesByArea: { Back: { severity: 7, recency: 'Recent' } },
    planSeed: 6102
  }));
  const exercises = flatten(plan, true);
  const names = exercises.map((exercise) => exercise.name).join('|');
  assert.doesNotMatch(names, /\b(deadlift|run intervals|zone 2 run|shuttle)\b/i);
  assert.ok(exercises.some((exercise) => exercise.zone2), 'safe aerobic replacement disappeared');
  assert.ok(exercises.some((exercise) => /\b(curl|bridge|hip thrust|posterior|hamstring)\b/i.test(exercise.name)), 'posterior-chain support disappeared');
});

test('low recovery reduces high-intensity conditioning without deleting identity', () => {
  const normal = buildDirect(basePayload({ sleepHours: 8, stress: 'Low', planSeed: 6103 }));
  const low = buildDirect(basePayload({ sleepHours: 5, stress: 'High', primaryGoal: 'Cut fat', planSeed: 6103 }));
  const hardCount = (plan) => flatten(plan, true).filter((exercise) => exercise.hardConditioning).length;
  assert.ok(hardCount(low) < hardCount(normal));
  assert.equal(hardCount(low), 1);
  assertMilitaryIdentity(low);
});

test('small priorities remain visible in a military week', () => {
  const plan = buildDirect(basePayload({
    priorityGroups: ['Calves', 'Core', 'Shoulders'],
    daysPerWeek: 5,
    preferredDays: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'],
    planSeed: 6104
  }));
  const exercises = flatten(plan, true);
  assert.ok(exercises.some((exercise) => exercise.directCalf), 'calves priority disappeared');
  assert.ok(exercises.filter((exercise) => exercise.directAb).length >= 2, 'core priority disappeared');
});

test('route wrapper preserves the military lane instead of applying bodybuilding fallback repair', () => {
  const result = trainingRoutes._private.buildOblueprintPlanWithFallback(basePayload({ planSeed: 6105 }), { fastBuild: true });
  assert.equal(result?.error, undefined, result?.error?.reason || result?.error?.error);
  assert.equal(result.plan?.meta?.discipline, 'military');
  assert.doesNotThrow(() => trainingRoutes._private.assertMilitaryHybridPlanByEngine(result.plan));
});

test('poor preferred-day spacing keeps hard conditioning separated when possible', () => {
  const plan = buildDirect(basePayload({
    preferredDays: ['Mo', 'Tu', 'We', 'Th'],
    planSeed: 6106
  }));
  const firstWeek = plan.weeks[0];
  const hardDays = firstWeek.days
    .filter((day) => day.exercises.some((exercise) => exercise.hardConditioning))
    .map((day, index) => plan.schedule[firstWeek.days.indexOf(day)]?.day || index);
  assert.equal(hardDays.length, 2);
  const [left, right] = hardDays.map(weekdayIndex);
  assert.ok(Number.isInteger(left) && Number.isInteger(right));
  assert.ok(Math.abs(left - right) >= 2, `hard conditioning remained back-to-back: ${hardDays.join(', ')}`);
});

test('custom readiness tasks always have a safe icon fallback instead of a broken image', () => {
  const plan = buildDirect(basePayload({ planSeed: 6107 }));
  const customTasks = flatten(plan, true).filter((exercise) => exercise.taskType === 'military_readiness');
  assert.ok(customTasks.length > 0);
  for (const exercise of customTasks) {
    assert.equal(exercise.mediaPath, null);
    assert.equal(exercise.mediaPathAlt, null);
    assert.ok(String(exercise.mediaIcon || '').trim(), `${exercise.name} is missing its icon fallback`);
  }
});

test('every shared priority group remains visible in Military output', () => {
  const priorityCases = MILITARY_HYBRID_MATRIX.filter((entry) => /priority/.test(entry.title));
  assert.ok(priorityCases.length >= 8);
  for (const entry of priorityCases) {
    const selectedPriority = entry.payload.priorityGroups[0];
    const plan = buildDirect(entry.payload);
    assert.ok(hasPrioritySupport(plan, selectedPriority), `${entry.title}: ${selectedPriority} support disappeared`);
  }
});

test('exact 5-day full-gym military case preserves all required weekly identities and coverage', () => {
  const plan = buildDirect(basePayload({
    daysPerWeek: 5,
    sessionLengthMin: '75+',
    location: 'Commercial gym',
    trainingStyle: 'Mostly free weights',
    priorityGroups: ['Core', 'Shoulders', 'Arms'],
    preferredDays: ['Mo', 'Tu', 'Th', 'Fr'],
    equipmentAccess: ['Barbell', 'Dumbbells', 'Machines', 'Smith', 'Cable', 'Pull-up Bar'],
    painAreas: [],
    painProfilesByArea: {},
    movementsToAvoid: [],
    closeToFailure: 'Yes',
    sleepHours: 7,
    activityLevel: 'Sedentary',
    stress: 'Medium',
    planSeed: 9001
  }));
  const firstWeek = plan.weeks[0];
  const labels = firstWeek.days.map((day) => day.dayType);
  assert.deepEqual(labels, [
    'Power + Upper Strength',
    'Lower + Zone 2',
    'Back/Arms + Push-Up Endurance',
    'Intervals + Upper Hypertrophy',
    'Deadlift + SDC/Carry'
  ]);
  assert.deepEqual(plan.meta?.militaryHybrid?.preferredDaysResolved, ['Mo', 'Tu', 'Th', 'Fr', 'We']);

  const weekExercises = flatten(plan, true);
  assert.ok(weekExercises.some((exercise) => /\b(leg press|step-up|lunge|split squat|hack squat|back squat|front squat)\b/i.test(String(exercise.name || ''))), 'missing real quad pattern');
  assert.ok(weekExercises.some((exercise) => /\b(pull-up|pulldown)\b/i.test(String(exercise.name || ''))), 'missing weekly vertical pull');
  assert.equal(weekExercises.some((exercise) => /\bâ€”\b/.test(String(exercise.name || ''))), false);

  const day3 = firstWeek.days[2].exercises.map((exercise) => String(exercise.name || ''));
  assert.ok(day3.some((name) => /\b(pull-up|pulldown)\b/i.test(name)), 'day 3 missing vertical pull');
  assert.ok(day3.some((name) => /\b(push-up|dead bug|plank|hanging knee raise|cable crunch)\b/i.test(name)), 'day 3 missing military-performance element');

  const day4 = firstWeek.days[3].exercises;
  assert.equal(day4[0]?.militaryRole, 'Running speed endurance', 'interval day no longer leads with intervals');
  assert.equal(day4.some((exercise) => /\b(bench press|chest press|close-grip bench|hip thrust|deadlift|leg press|split squat|step-up)\b/i.test(String(exercise.name || ''))), false, 'interval day leaked redundant pressing or lower-body loading');

  const day5Names = firstWeek.days[4].exercises.map((exercise) => String(exercise.name || ''));
  assert.ok(day5Names.some((name) => /\b(deadlift|trap bar)\b/i.test(name)), 'day 5 missing deadlift anchor');
  assert.ok(day5Names.some((name) => /\b(step-up|lunge|split squat)\b/i.test(name)), 'day 5 missing controlled single-leg lower accessory');
  assert.ok(day5Names.some((name) => /\b(pull-up|pulldown|row)\b/i.test(name)), 'day 5 missing pull movement');
  assert.ok(day5Names.some((name) => /\b(crunch|plank|dead bug|leg raise|pallof)\b/i.test(name)), 'day 5 missing core movement');
});
