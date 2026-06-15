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
