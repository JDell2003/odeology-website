const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const engine = require('../generator/trainingEngine.oblueprint');

function baseInput() {
  return {
    name: 'Test User',
    primaryGoal: 'Build size',
    timeline: '4 weeks',
    focus: 'Size',
    sex: 'Male',
    age: 28,
    heightIn: 70,
    weightLb: 185,
    bodyFatPct: 18,
    experience: '6–24m',
    bench: 225,
    squat: 315,
    deadlift: 405,
    closeToFailure: 'Yes',
    daysPerWeek: 3,
    sessionLengthMin: '45',
    preferredDays: ['Mo', 'We', 'Fr'],
    location: 'Commercial gym',
    equipmentAccess: ['Dumbbells'],
    priorityGroups: ['Chest', 'Back'],
    trainingStyle: 'Balanced mix',
    painAreas: [],
    painProfilesByArea: {},
    movementsToAvoid: [],
    sleepHours: 7,
    activityLevel: 'Active',
    stress: 'Low',
    adjustNutrition: 'Keep Plan The Same',
    outputStyle: 'Simple sets x reps',
    trainingFeel: 'Aesthetic bodybuilding'
  };
}

function setsByWeek(plan) {
  return (plan.weeks || []).map((w) =>
    (w.days || []).reduce((acc, d) => acc + (d.exercises || []).reduce((s, e) => s + (Number(e.sets) || 0), 0), 0)
  );
}

function loadMasterExercises() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.master.js'), 'utf8');
  const expr = src.replace(/^\s*export\s+const\s+exercises\s*=\s*/, '').replace(/;\s*$/, '');
  return Function(`return (${expr});`)();
}

test('home with empty equipmentAccess uses home defaults', () => {
  const input = baseInput();
  input.location = 'Home';
  input.equipmentAccess = [];
  const normalized = engine.normalizeUserInput(input);
  assert.deepEqual(normalized.allowedEquipment, ['bands', 'bodyweight', 'dumbbell']);
});

test('gym with only smith still includes gym defaults', () => {
  const input = baseInput();
  input.location = 'Commercial gym';
  input.equipmentAccess = ['smith'];
  const normalized = engine.normalizeUserInput(input);
  assert.deepEqual(normalized.allowedEquipment, ['barbell', 'bodyweight', 'cable', 'dumbbell', 'machine', 'smith']);
});

test('avoid token removes bench press variations', () => {
  const input = baseInput();
  input.movementsToAvoid = ['Flat bench'];
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined);
  const names = plan.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => String(e.name).toLowerCase())));
  assert.equal(names.some((n) => n.includes('bench press')), false);
});

test('injury severity >=7 blocks joint stress == 3 (shoulder)', () => {
  const input = baseInput();
  input.painAreas = ['Shoulder'];
  input.painProfilesByArea = { Shoulder: { severity: 9, recency: 'Recent' } };
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined);
  const master = loadMasterExercises();
  const byName = new Map(master.map((e) => [String(e.name), e]));
  for (const ex of plan.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises))) {
    const src = byName.get(String(ex.name));
    assert.ok(src);
    assert.notEqual(Number(src.shoulder), 3);
  }
});

test('determinism: same input returns same output', () => {
  const input = baseInput();
  const a = engine.buildOblueprintPlan(input);
  const b = engine.buildOblueprintPlan(input);
  assert.deepEqual(a, b);
});

test('week scaling: week2 > week1, week3 > week2, week4 < week1', () => {
  const input = baseInput();
  input.timeline = '4 weeks';
  input.daysPerWeek = 4;
  input.sessionLengthMin = '75+';
  input.preferredDays = ['Mo', 'Tu', 'Th', 'Fr'];
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined);
  const totals = setsByWeek(plan);
  assert.ok(totals[1] > totals[0], `Expected week2>${totals[0]} got ${totals[1]}`);
  assert.ok(totals[2] > totals[1], `Expected week3>${totals[1]} got ${totals[2]}`);
  assert.ok(totals[3] < totals[0], `Expected week4<${totals[0]} got ${totals[3]}`);
});

test('powerbuilding contains bench + squat + hinge each week', () => {
  const input = baseInput();
  input.trainingFeel = 'Powerbuilding';
  input.daysPerWeek = 4;
  input.sessionLengthMin = '75+';
  input.preferredDays = ['Mo', 'Tu', 'Th', 'Fr'];
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined);
  for (const week of plan.weeks || []) {
    const patterns = new Set((week.days || []).flatMap((d) => (d.exercises || []).map((e) => e.pattern)));
    assert.ok(patterns.has('HorizontalPush'));
    assert.ok(patterns.has('Squat'));
    assert.ok(patterns.has('Hinge'));
  }
});

test('home barbell user does not error', () => {
  const input = baseInput();
  input.location = 'Home';
  input.equipmentAccess = ['Barbell'];
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined);
  assert.ok(plan.meta.allowedEquipment.includes('barbell'));
  assert.ok(plan.meta.allowedEquipment.includes('bodyweight'));
});
