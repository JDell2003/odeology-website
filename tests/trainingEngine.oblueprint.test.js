const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const engine = require('../generator/trainingEngine.oblueprint');
const trainingRoutes = require('../core/trainingRoutes');
const PREPROCESSED_EXERCISES = (() => {
  const pre = engine.preprocessExercises(loadMasterExercises());
  if (pre?.error) throw new Error(pre.reason || pre.error || 'Failed to preprocess exercise database for tests.');
  return pre.exercises;
})();
const RANDOM_PROFILE_COUNT = 200;

function baseInput(overrides = {}) {
  return {
    name: 'Test User',
    primaryGoal: 'Build size',
    timeline: '4 weeks',
    focus: 'Aesthetic',
    sex: 'Male',
    age: 28,
    heightIn: 70,
    weightLb: 185,
    bodyFatPct: 18,
    experience: '6-24m',
    bench: 225,
    squat: 315,
    deadlift: 405,
    closeToFailure: 'No',
    daysPerWeek: 4,
    sessionLengthMin: '60',
    preferredDays: ['Mo', 'Tu', 'Th', 'Fr'],
    location: 'Commercial gym',
    equipmentAccess: ['Dumbbells', 'Barbell', 'Cable', 'Machines'],
    priorityGroups: ['Chest', 'Back'],
    trainingStyle: 'Balanced mix',
    painAreas: [],
    painProfilesByArea: {},
    movementsToAvoid: [],
    sleepHours: 7,
    activityLevel: 'Active',
    stress: 'Low',
    outputStyle: 'Simple sets x reps',
    trainingFeel: 'Aesthetic bodybuilding',
    planSeed: 12345,
    ...overrides
  };
}

function loadMasterExercises() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.master.js'), 'utf8');
  const expr = src.replace(/^\s*export\s+const\s+exercises\s*=\s*/, '').replace(/;\s*$/, '');
  return Function(`return (${expr});`)();
}

function flattenExercises(plan) {
  return (plan?.weeks || []).flatMap((week) => (week.days || []).flatMap((day) => day.exercises || []));
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
  if (/\b(pull ?up|chin ?up|hanging knee|hanging leg|toes to bar|captains chair|parallel bars)\b/.test(lower)) required.add('pullup_bar');
  return Array.from(required);
}

function assertExactDayCount(plan, expected) {
  for (const week of plan.weeks || []) {
    assert.equal((week.days || []).length, expected, `expected ${expected} days, got ${(week.days || []).length}`);
  }
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

function assertNoSmithEquipmentToken(plan, label = 'plan') {
  for (const ex of flattenExercises(plan)) {
    const required = Array.isArray(ex?.requiredEquipment) ? ex.requiredEquipment : [];
    assert.equal(required.includes('smith'), false, `${label}: ${ex.name} still exposes smith token`);
  }
}

function assertCanonicalExerciseTruth(plan, label = 'plan') {
  for (const ex of flattenExercises(plan)) {
    assert.ok(ex.canonicalExerciseId, `${label}: missing canonicalExerciseId on ${ex.name}`);
    assert.ok(Array.isArray(ex.requiredEquipment), `${label}: missing requiredEquipment on ${ex.name}`);
    assert.ok(typeof ex.directCalf === 'boolean', `${label}: missing directCalf on ${ex.name}`);
    assert.ok(typeof ex.directAb === 'boolean', `${label}: missing directAb on ${ex.name}`);
    assert.ok(typeof ex.shoulderPressPattern === 'boolean', `${label}: missing shoulderPressPattern on ${ex.name}`);
  }
}

function buildClassicProfile(overrides = {}) {
  const merged = {
    discipline: 'bodybuilding',
    phase: 'maintain',
    daysPerWeek: 4,
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    emphasis: ['chest', 'back'],
    unavailableDays: [],
    equipmentStylePref: 'mix',
    strength: {
      phase: 'maintain',
      trainingAgeBucket: '6_18',
      timePerSession: '60_75',
      equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' },
      injurySeverityByJoint: {}
    },
    ...overrides
  };
  merged.strength = { ...(merged.strength || {}), ...(overrides.strength || {}) };
  merged.equipmentAccess = { ...(merged.equipmentAccess || {}), ...(overrides.equipmentAccess || {}) };
  return merged;
}

function runLiveParityCase(classicProfile) {
  const coerced = trainingRoutes._private.coerceClassicBodybuildingToOblueprintPayload(classicProfile);
  const built = trainingRoutes._private.buildOblueprintPlanWithFallback(coerced);
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'route parity build failed');
  return built.plan;
}

test('route fallback repairs raw invalid bodybuilding output before onboarding returns it', () => {
  const input = baseInput({
    daysPerWeek: 4,
    sessionLengthMin: '60',
    preferredDays: ['Mo', 'Tu', 'Th', 'Fr'],
    priorityGroups: ['Chest', 'Back'],
    trainingFeel: 'Aesthetic bodybuilding',
    planSeed: 12345
  });
  const rawPlan = engine.buildOblueprintPlan(input);
  assert.throws(() => trainingRoutes._private.assertBodybuildingPlanByEngine(rawPlan), /Push day missing shoulder press compound/);

  const built = trainingRoutes._private.buildOblueprintPlanWithFallback(input);
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'fallback build failed');
  assert.doesNotThrow(() => trainingRoutes._private.assertBodybuildingPlanByEngine(built.plan));
});

test('route fallback keeps 3-day core-calves home plan route-valid', () => {
  const input = baseInput({
    primaryGoal: 'Cut fat',
    experience: '<6m',
    daysPerWeek: 3,
    sessionLengthMin: '45',
    preferredDays: ['Mo', 'We', 'Fr'],
    location: 'Home',
    equipmentAccess: ['Bodyweight', 'Dumbbells'],
    priorityGroups: ['Core', 'Calves'],
    trainingStyle: 'Mostly free weights',
    planSeed: 12345
  });
  const built = trainingRoutes._private.buildOblueprintPlanWithFallback(input);
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'route fallback build failed');
  assert.doesNotThrow(() => trainingRoutes._private.assertBodybuildingPlanByEngine(built.plan));
});

test('route fallback keeps short-session shoulders-arms bodybuilding plan route-valid', () => {
  const built = trainingRoutes._private.buildOblueprintPlanWithFallback(trainingRoutes._private.coerceClassicBodybuildingToOblueprintPayload(buildClassicProfile({
    phase: 'bulk',
    daysPerWeek: 5,
    emphasis: ['shoulders', 'arms'],
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: false, machine: false },
    unavailableDays: [0, 3, 6],
    equipmentStylePref: 'barbell',
    strength: {
      phase: 'bulk',
      trainingAgeBucket: '6_18',
      timePerSession: '30_45',
      equipmentStylePref: 'barbell',
      injury: { has: true, joints: ['ankle'], note: 'Left ankle gets cranky with jumping, running, or a lot of deep forward knee travel.' },
      injurySeverityByJoint: { ankle: 4 }
    }
  })));
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'route fallback build failed');
  assert.doesNotThrow(() => trainingRoutes._private.assertBodybuildingPlanByEngine(built.plan));
});

function buildStage1Plan(input) {
  const normalized = engine.normalizeUserInput(input);
  assert.equal(normalized?.error, undefined, normalized?.reason || normalized?.error);
  const { targets, frequencyTargets, stressMultiplier } = engine.computeWeeklyTargets(normalized);
  const stage1 = engine.buildSafeBasePlanner(normalized, PREPROCESSED_EXERCISES, targets, frequencyTargets, stressMultiplier);
  return { normalized, targets, frequencyTargets, stressMultiplier, stage1 };
}

function materializeInternalWeeks(allowedEquipment, weeks) {
  return {
    meta: { allowedEquipment },
    weeks: (weeks || []).map((week) => ({
      days: (week?.days || []).map((day) => ({
        exercises: (day?.exercises || []).map((ex) => ({
          name: ex.name,
          equipment: ex.equipmentNorm || ex.equipment || []
        }))
      }))
    }))
  };
}

function assertNoNamePatterns(plan, patterns, label) {
  const names = flattenExercises(plan).map((ex) => String(ex.name || '').toLowerCase());
  for (const name of names) {
    for (const pattern of patterns) {
      assert.equal(pattern.test(name), false, `${label}: ${name}`);
    }
  }
}

function countMatchingExercises(plan, patterns) {
  const names = flattenExercises(plan).map((ex) => String(ex.name || '').toLowerCase());
  return names.filter((name) => patterns.some((pattern) => pattern.test(name))).length;
}

function directSetsByMuscle(plan) {
  return flattenExercises(plan).reduce((acc, ex) => {
    const muscle = String(ex.primary || ex.muscleTarget || 'Core');
    acc[muscle] = Number(acc[muscle] || 0) + Number(ex.sets || 0);
    return acc;
  }, {});
}

function countDistinctCoreFamilies(plan) {
  const names = flattenExercises(plan).map((ex) => String(ex.name || '').toLowerCase());
  const families = new Set();
  for (const name of names) {
    if (/(reverse crunch|leg raise|hanging knee|hanging leg|tuck crunch|hip raise|leg pull in)/.test(name)) families.add('reverse');
    else if (/(pallof hold|plank|dead bug|vacuum|anti extension|fallout)/.test(name)) families.add('stability');
    else if (/(wood chop|pallof|twist|rotation|side bend|oblique|reach through)/.test(name)) families.add('rotation');
    else if (/(crunch|rollout|ab wheel)/.test(name)) families.add('flexion');
  }
  return families.size;
}

function countDaysWithMatchingExercises(plan, pattern) {
  return (plan?.weeks?.[0]?.days || []).filter((day) => (day.exercises || []).some((ex) => pattern.test(String(ex.name || '').toLowerCase()))).length;
}

function countPriorityPresence(plan, pattern) {
  return flattenExercises(plan).filter((ex) => pattern.test(String(ex.name || '').toLowerCase()) || pattern.test(String(ex.sub || '').toLowerCase())).length;
}

function isPosteriorBuilderExercise(exercise) {
  const name = String(exercise?.name || '').toLowerCase();
  if (/(thigh abductor|thigh adductor|abductor|adductor|kickback)/.test(name)) return false;
  return /(hip thrust|glute bridge|pull through|glute ham raise|seated leg curl|lying leg curl|leg curl|hamstring curl|romanian deadlift|\brdl\b|stiff[- ]*leg)/.test(name);
}

function isSecondaryLowerExercise(exercise) {
  const name = String(exercise?.name || '').toLowerCase();
  if (isPosteriorBuilderExercise(exercise)) return false;
  if (exercise?.directCalf) return true;
  if (String(exercise?.primary || exercise?.muscleTarget || '') === 'Legs') return true;
  return /(leg press|hack squat|leg extension|split squat|lunge|step[- ]*up|calf raise)/.test(name);
}

function assertCoachGrade(plan, label, minimumScore = 7.5) {
  assert.equal(plan.error, undefined, `${label}: ${plan?.reason || plan?.error}`);
  assert.ok(['elite', 'good'].includes(plan.meta?.eliteQa?.tier), `${label}: expected good/elite tier, got ${plan.meta?.eliteQa?.tier}`);
  assert.ok(Number(plan.meta?.eliteQa?.score || 0) >= minimumScore, `${label}: expected score >= ${minimumScore}, got ${plan.meta?.eliteQa?.score}`);
}

test('home with empty equipmentAccess uses bodyweight+dumbbell defaults', () => {
  const input = baseInput({ location: 'Home', equipmentAccess: [] });
  const normalized = engine.normalizeUserInput(input);
  assert.deepEqual(normalized.allowedEquipment, ['bodyweight', 'dumbbell']);
});

test('commercial gym with explicit access does not silently widen equipment universe', () => {
  const input = baseInput({ equipmentAccess: ['Dumbbells'] });
  const normalized = engine.normalizeUserInput(input);
  assert.deepEqual(normalized.allowedEquipment, ['dumbbell']);
});

test('determinism: same input returns same output', () => {
  const input = baseInput();
  const a = engine.buildOblueprintPlan(input);
  const b = engine.buildOblueprintPlan(input);
  assert.deepEqual(a, b);
});

test('supports exact day counts from 2 to 6', () => {
  for (const days of [2, 3, 4, 5, 6]) {
    const plan = engine.buildOblueprintPlan(baseInput({
      daysPerWeek: days,
      preferredDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].slice(0, days)
    }));
    assert.equal(plan.error, undefined, `unexpected error for ${days}d: ${plan.reason || plan.error}`);
    assertExactDayCount(plan, days);
    assertAllowedEquipmentOnly(plan);
  }
});

test('stage 1 safe base planner passes 10 locked live-like cases independently', () => {
  const cases = [
    baseInput({ experience: '<6m', daysPerWeek: 2, sessionLengthMin: '45', preferredDays: ['Mo', 'Th'], priorityGroups: ['Core', 'Calves'], equipmentAccess: ['Bodyweight', 'Dumbbells'], location: 'Home', trainingStyle: 'Mostly free weights' }),
    baseInput({ experience: '18-36m', daysPerWeek: 4, equipmentAccess: ['Bodyweight', 'Dumbbells'], location: 'Home', sessionLengthMin: '60', trainingStyle: 'Mostly free weights', priorityGroups: ['Back', 'Arms'] }),
    baseInput({ experience: '18-36m', daysPerWeek: 5, trainingStyle: 'Mostly machines/cables', equipmentAccess: ['Bodyweight', 'Cable', 'Machines'], priorityGroups: ['Legs', 'Glutes'], painAreas: ['Knee'], painProfilesByArea: { Knee: { severity: 7, recency: 'Recent', notes: 'avoid deep squat and forward knee travel under load' } } }),
    baseInput({ experience: '<6m', daysPerWeek: 3, sessionLengthMin: '45', priorityGroups: ['Chest', 'Core'], painAreas: ['Shoulder'], painProfilesByArea: { Shoulder: { severity: 7, recency: 'Recent', notes: 'overhead pressing irritates shoulder' } } }),
    baseInput({ experience: '<6m', daysPerWeek: 4, sessionLengthMin: '30', preferredDays: ['Mo', 'Tu', 'Th', 'Fr'], trainingStyle: 'Mostly free weights', equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell'], priorityGroups: ['Shoulders', 'Arms'] }),
    baseInput({ experience: '5y+', daysPerWeek: 6, sessionLengthMin: '75+', priorityGroups: ['Legs', 'Glutes'], painAreas: ['Wrist'], painProfilesByArea: { Wrist: { severity: 7, recency: 'Recent', notes: 'cannot tolerate straight bar work or loaded wrist extension' } }, planSeed: 22334 }),
    baseInput({ priorityGroups: ['Chest', 'Shoulders', 'Arms'], daysPerWeek: 5 }),
    baseInput({ priorityGroups: ['Legs', 'Glutes'], daysPerWeek: 4, painAreas: ['Knee'], painProfilesByArea: { Knee: { severity: 6, recency: 'Recent' } } }),
    baseInput({ location: 'Home', equipmentAccess: ['Bodyweight', 'Dumbbells'], daysPerWeek: 3, sessionLengthMin: '45', trainingStyle: 'Mostly free weights', priorityGroups: ['Chest', 'Back'] }),
    baseInput({ primaryGoal: 'Recomp', experience: '6-24m', daysPerWeek: 3, sessionLengthMin: '60', preferredDays: ['Mo', 'Tu', 'We'], trainingStyle: 'Balanced mix', priorityGroups: ['Core', 'Chest'], location: 'Commercial gym', equipmentAccess: ['Dumbbells'], painAreas: ['Shoulder'], painProfilesByArea: { Shoulder: { severity: 6, recency: 'Recent' } }, planSeed: 1011 })
  ];
  for (const input of cases) {
    const { normalized, stage1 } = buildStage1Plan(input);
    assert.equal(stage1?.error, undefined, stage1?.reason || stage1?.error);
    assert.equal((stage1.schedule || []).length, normalized.daysPerWeek, 'stage 1 schedule day count mismatch');
    for (const week of stage1.weeks || []) {
      assert.equal((week.days || []).length, normalized.daysPerWeek, 'stage 1 returned wrong day count');
      for (const day of week.days || []) {
        assert.ok((day.exercises || []).length >= 1, `stage 1 returned empty day for ${day.dayType}`);
      }
    }
    assertAllowedEquipmentOnly(materializeInternalWeeks(normalized.allowedEquipment, stage1.weeks));
  }
});

test('golden regression set 1 preserves the strongest live-style baseline cases', () => {
  const cases = [
    ['lena_abs_calves', baseInput({ primaryGoal: 'Cut fat', experience: '<6m', daysPerWeek: 2, sessionLengthMin: '30', preferredDays: ['Mo', 'Th'], priorityGroups: ['Core', 'Calves'], equipmentAccess: ['Bodyweight', 'Dumbbells'], location: 'Home', trainingStyle: 'Mostly free weights' })],
    ['theo_shoulders_arms', baseInput({ primaryGoal: 'Build size', experience: '6-24m', daysPerWeek: 4, sessionLengthMin: '30', preferredDays: ['Mo', 'Tu', 'Th', 'Fr'], priorityGroups: ['Shoulders', 'Arms'], equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell'], trainingStyle: 'Mostly free weights', painAreas: ['Ankle'], painProfilesByArea: { Ankle: { severity: 4, recency: 'Recent', notes: 'forward knee travel irritates ankle' } } })],
    ['serena_back_arms', baseInput({ primaryGoal: 'Recomp', experience: '2-5y', daysPerWeek: 3, sessionLengthMin: '45', preferredDays: ['Mo', 'We', 'Fr'], priorityGroups: ['Back', 'Arms'], equipmentAccess: ['Bodyweight', 'Dumbbells'], location: 'Home', trainingStyle: 'Mostly free weights', painAreas: ['Elbow'], painProfilesByArea: { Elbow: { severity: 5, recency: 'Recent', notes: 'aggressive supinated pulling and skull-crusher style extension flare the elbow' } } })],
    ['darius_machine_knee', baseInput({ primaryGoal: 'Cut fat', experience: '2-5y', daysPerWeek: 5, sessionLengthMin: '60', preferredDays: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'], priorityGroups: ['Legs', 'Glutes'], equipmentAccess: ['Bodyweight', 'Cable', 'Machines'], trainingStyle: 'Mostly machines/cables', painAreas: ['Knee'], painProfilesByArea: { Knee: { severity: 6, recency: 'Recent', notes: 'deep knee flexion and forward knee travel are poorly tolerated' } } })],
    ['marcus_upper_mix', baseInput({ primaryGoal: 'Recomp', experience: '2-5y', daysPerWeek: 4, sessionLengthMin: '60', priorityGroups: ['Chest', 'Back', 'Shoulders'], equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'], trainingStyle: 'Balanced mix' })],
    ['olivia_wrist_advanced', baseInput({ primaryGoal: 'Build size', experience: '5y+', daysPerWeek: 6, sessionLengthMin: '75+', priorityGroups: ['Legs', 'Glutes', 'Calves'], equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'], trainingStyle: 'Balanced mix', painAreas: ['Wrist'], painProfilesByArea: { Wrist: { severity: 3, recency: 'Recent', notes: 'Wrist extension tolerance is limited on straight bars; dumbbells and neutral grips feel better.' } } })],
    ['noah_shoulder_abs', baseInput({ primaryGoal: 'Recomp', experience: '6-24m', daysPerWeek: 3, sessionLengthMin: '45', preferredDays: ['Tu', 'Th', 'Sa'], priorityGroups: ['Chest', 'Core'], equipmentAccess: ['Bodyweight', 'Dumbbells', 'Cable', 'Machines'], trainingStyle: 'Balanced mix', painAreas: ['Shoulder'], painProfilesByArea: { Shoulder: { severity: 5, recency: 'Recent', notes: 'Front shoulder gets pinchy on overhead volume and deep-stretch pressing; neutral grip feels better.' } } })],
    ['priya_upper_specialist', baseInput({ primaryGoal: 'Build size', experience: '5y+', daysPerWeek: 4, sessionLengthMin: '45', preferredDays: ['Mo', 'We', 'Fr', 'Sa'], priorityGroups: ['Chest', 'Shoulders', 'Arms'], equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell'], trainingStyle: 'Mostly free weights' })],
    ['naomi_posterior_chain', baseInput({ primaryGoal: 'Cut fat', experience: '2-5y', daysPerWeek: 5, sessionLengthMin: '75+', priorityGroups: ['Glutes', 'Core'], equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'], trainingStyle: 'Balanced mix', painAreas: ['Hip'], painProfilesByArea: { Hip: { severity: 5, recency: 'Recent', notes: 'deep flexion and wide stance aggravate the hip' } } })],
    ['hassan_back_history', baseInput({ primaryGoal: 'Recomp', experience: '5y+', daysPerWeek: 6, sessionLengthMin: '60', priorityGroups: ['Back', 'Shoulders', 'Arms'], equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'], trainingStyle: 'Balanced mix', painAreas: ['Back'], painProfilesByArea: { Back: { severity: 4, recency: 'Recent', notes: 'heavy axial loading and deadlifts from the floor are poorly tolerated' } } })]
  ];

  for (const [label, input] of cases) {
    const plan = engine.buildOblueprintPlan(input);
    assertCoachGrade(plan, label, 7.5);
    assertAllowedEquipmentOnly(plan);
  }
});

test('glutes+core 75+ plan keeps every relevant lower day as real lower work with core and sufficient fill', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    primaryGoal: 'Cut fat',
    experience: '2-5y',
    daysPerWeek: 5,
    sessionLengthMin: '75+',
    priorityGroups: ['Glutes', 'Core'],
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'],
    trainingStyle: 'Balanced mix',
    painAreas: ['Hip'],
    painProfilesByArea: { Hip: { severity: 5, recency: 'Recent', notes: 'deep flexion and wide stance aggravate the hip' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const relevantDays = (plan?.weeks?.[0]?.days || []).filter((day) => ['Lower', 'LowerFocus', 'Legs', 'FullBodyA', 'FullBodyB'].includes(String(day?.dayType || '')));
  assert.ok(relevantDays.length >= 2, 'expected multiple relevant lower days');
  for (const day of relevantDays) {
    const exercises = day.exercises || [];
    assert.ok(exercises.some((exercise) => isPosteriorBuilderExercise(exercise)), `${day.dayType}: expected a real posterior-chain/glute builder`);
    assert.ok(exercises.some((exercise) => isSecondaryLowerExercise(exercise)), `${day.dayType}: expected a second lower-priority movement`);
    assert.ok(exercises.some((exercise) => exercise.directAb), `${day.dayType}: expected direct core work`);
    assert.ok(exercises.length >= 5, `${day.dayType}: expected wide-session lower day to stay filled`);
  }
});

test('final plan carries canonical exercise truth metadata', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '<6m',
    daysPerWeek: 2,
    sessionLengthMin: '30',
    preferredDays: ['Mo', 'Th'],
    priorityGroups: ['Core', 'Calves'],
    equipmentAccess: ['Bodyweight', 'Dumbbells'],
    location: 'Home'
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertCanonicalExerciseTruth(plan, 'canonical_truth');
});

test('live parity route returns canonical truth for the 2-day dumbbell-only abs-calves case', () => {
  const plan = runLiveParityCase(buildClassicProfile({
    phase: 'cut',
    daysPerWeek: 2,
    emphasis: ['abs', 'calves'],
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: false, cable: false, machine: false },
    unavailableDays: [2, 4, 6, 0],
    equipmentStylePref: 'dumbbell',
    strength: {
      phase: 'cut',
      trainingAgeBucket: '0_6',
      timePerSession: '30_45',
      equipmentStylePref: 'dumbbell',
      injury: { has: false, joints: [], note: '' },
      injurySeverityByJoint: {}
    }
  }));
  assertAllowedEquipmentOnly(plan);
  assertCanonicalExerciseTruth(plan, 'live_parity_abs_calves');
  const trace = plan.meta?.debug?.lowFrequencyPriorityTrace;
  assert.ok(trace?.calf?.priorityDetected, 'expected calf priority trace');
  assert.ok(trace?.abs?.priorityDetected, 'expected abs priority trace');
  assert.ok((trace?.calf?.reservedSlots || []).length >= 1, 'expected calf slot reservation trace');
  assert.ok((trace?.abs?.reservedSlots || []).length >= 1, 'expected ab slot reservation trace');
  assert.ok((trace?.calf?.finalExercises || []).length >= 1, 'expected final direct calf exercises in trace');
  assert.ok((trace?.abs?.finalExercises || []).length >= 1, 'expected final direct ab exercises in trace');
});

test('all session lengths build valid plans', () => {
  for (const bucket of ['30', '45', '60', '75+']) {
    const plan = engine.buildOblueprintPlan(baseInput({ sessionLengthMin: bucket }));
    assert.equal(plan.error, undefined, `session ${bucket} failed`);
    assertAllowedEquipmentOnly(plan);
  }
});

test('plan meta includes progression, nutrition, and recovery models', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    primaryGoal: 'Build size',
    priorityGroups: ['Chest', 'Back', 'Arms']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(plan.meta?.nutritionModel?.proteinTargetG?.min >= 120, 'expected nutrition model');
  assert.ok(Array.isArray(plan.meta?.progressionModel?.overloadPriority), 'expected progression model');
  assert.ok(Array.isArray(plan.meta?.recoveryModel?.deloadTriggers), 'expected recovery model');
  assert.ok(Array.isArray(plan.meta?.adaptiveCheckInModel?.trackedSignals), 'expected adaptive check-in model');
  assert.ok(plan.meta?.eliteQa?.tier, 'expected elite QA report');
});

test('bodyweight+dumbbell home user still gets a valid plan', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    location: 'Home',
    equipmentAccess: ['Bodyweight', 'Dumbbells'],
    daysPerWeek: 3,
    sessionLengthMin: '45',
    trainingStyle: 'Mostly free weights',
    priorityGroups: ['Chest', 'Core']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertExactDayCount(plan, 3);
  assertAllowedEquipmentOnly(plan);
  assertNoNamePatterns(plan, [/\bpull ?up\b/, /\bchin ?up\b/, /\bhanging knee\b/, /\bhanging leg\b/, /\btoes to bar\b/], 'pullup-bar leak');
});

test('equipment matrix stays clean across constrained access profiles', () => {
  const cases = [
    { location: 'Home', equipmentAccess: ['Bodyweight', 'Dumbbells'], trainingStyle: 'Mostly free weights' },
    { location: 'Commercial gym', equipmentAccess: ['Bodyweight', 'Cable', 'Machines'], trainingStyle: 'Mostly machines/cables' },
    { location: 'Commercial gym', equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell'], trainingStyle: 'Mostly free weights' },
    { location: 'Commercial gym', equipmentAccess: ['Bodyweight', 'Dumbbells', 'Cable', 'Machines'], trainingStyle: 'Balanced mix' },
    { location: 'Commercial gym', equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'], trainingStyle: 'Balanced mix' }
  ];
  for (const cfg of cases) {
    const plan = engine.buildOblueprintPlan(baseInput({
      ...cfg,
      daysPerWeek: 4,
      priorityGroups: ['Chest', 'Back'],
      planSeed: 42000 + cases.indexOf(cfg)
    }));
    assert.equal(plan.error, undefined, plan?.reason || plan?.error);
    assertAllowedEquipmentOnly(plan);
  }
});

test('live parity route preserves wrist-note filtering for the advanced 6-day wrist-limited user', () => {
  const plan = runLiveParityCase(buildClassicProfile({
    phase: 'bulk',
    daysPerWeek: 6,
    emphasis: ['quads', 'hamstrings_glutes', 'calves'],
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    strength: {
      phase: 'bulk',
      trainingAgeBucket: '5_plus',
      timePerSession: '75_90_plus',
      injury: { has: true, joints: ['wrist'], note: 'Wrist extension tolerance is limited on straight bars; dumbbells and neutral grips feel better.' },
      injurySeverityByJoint: { wrist: 3 }
    }
  }));
  assertAllowedEquipmentOnly(plan);
  assertCanonicalExerciseTruth(plan, 'live_parity_wrist');
  const hostile = flattenExercises(plan).filter((ex) => ex.straightBar || ex.wristExtensionHeavy);
  assert.equal(hostile.length, 0, `expected no wrist-hostile final exercises, got ${hostile.map((ex) => ex.name).join(', ')}`);
});

test('live parity route preserves constrained machine lower-body case without display truth divergence', () => {
  const plan = runLiveParityCase(buildClassicProfile({
    phase: 'cut',
    daysPerWeek: 5,
    emphasis: ['quads', 'hamstrings_glutes'],
    equipmentAccess: { bodyweight: true, dumbbell: false, barbell: false, cable: true, machine: true },
    equipmentStylePref: 'machine',
    strength: {
      phase: 'cut',
      trainingAgeBucket: '18_36',
      timePerSession: '60_75',
      equipmentStylePref: 'machine',
      injury: { has: true, joints: ['knee'], note: 'Both knees hate deep knee flexion under fatigue; keep squat pattern controlled and depth pain-free.' },
      injurySeverityByJoint: { knee: 6 }
    }
  }));
  assertAllowedEquipmentOnly(plan);
  assertCanonicalExerciseTruth(plan, 'live_parity_machine_lower');
  assertNoSmithEquipmentToken(plan, 'live_parity_machine_lower');
  assert.equal(flattenExercises(plan).some((ex) => (ex.requiredEquipment || []).includes('dumbbell')), false);
});

test('live parity route respects back-hip limited hinge notes without losing posterior-chain emphasis', () => {
  const plan = runLiveParityCase(buildClassicProfile({
    phase: 'cut',
    daysPerWeek: 5,
    emphasis: ['hamstrings_glutes', 'abs'],
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    strength: {
      phase: 'cut',
      trainingAgeBucket: '3_5',
      timePerSession: '75_90_plus',
      equipmentStylePref: 'mix',
      injury: { has: true, joints: ['hip'], note: 'Left hip gets irritated with very deep flexion and wide-stance work; moderate stance is better.' },
      injurySeverityByJoint: { hip: 5 }
    }
  }));
  assertAllowedEquipmentOnly(plan);
  assertCanonicalExerciseTruth(plan, 'live_parity_back_hip');
  assertNoNamePatterns(plan, [/\bsmith machine bent over row\b/, /\bbent over two-arm long bar row\b/, /\bromanian deadlift from deficit\b/, /\bstiff[- ]leg deadlift\b/, /\bgood morning\b/, /\bconventional deadlift\b/], 'back/hip hinge contradiction');
  assert.ok(countMatchingExercises(plan, [/\bleg curl\b/, /\bglute ham raise\b/, /\bkickback\b/, /\bhip thrust\b/, /\bglute bridge\b/, /\bglute\b/, /\bpull-through\b/]) >= 4, 'expected preserved posterior-chain emphasis with safer alternatives');
});

test('smith taxonomy is unified to machine in direct planner output and live parity output', () => {
  const input = baseInput({
    daysPerWeek: 4,
    equipmentAccess: ['Bodyweight', 'Barbell', 'Cable', 'Machines'],
    priorityGroups: ['Chest', 'Back', 'Shoulders'],
    planSeed: 77881
  });
  const directPlan = engine.buildOblueprintPlan(input);
  assert.equal(directPlan.error, undefined, directPlan?.reason || directPlan?.error);
  assertNoSmithEquipmentToken(directPlan, 'direct_plan');

  const parityPlan = runLiveParityCase(buildClassicProfile({
    phase: 'maintain',
    daysPerWeek: 4,
    emphasis: ['chest', 'back', 'shoulders'],
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    planSeed: 77881,
    strength: {
      phase: 'maintain',
      trainingAgeBucket: '18_36',
      timePerSession: '60_75',
      equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' },
      injurySeverityByJoint: {}
    }
  }));
  assertNoSmithEquipmentToken(parityPlan, 'parity_plan');
});

test('live-style training age aliases build valid plans', () => {
  for (const experience of ['18-36m', '18-36 months']) {
    const plan = engine.buildOblueprintPlan(baseInput({
      experience,
      daysPerWeek: 4,
      priorityGroups: ['Chest', 'Shoulders', 'Arms']
    }));
    assert.equal(plan.error, undefined, `alias ${experience} failed: ${plan?.reason || plan?.error}`);
    assertExactDayCount(plan, 4);
  }
});

test('shoulder pain avoids obvious overhead-press choices', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    painAreas: ['Shoulder'],
    painProfilesByArea: { Shoulder: { severity: 8, recency: 'Recent' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertNoNamePatterns(plan, [/\boverhead press\b/, /\bshoulder press\b/, /\bmilitary press\b/, /\bupright row\b/], 'shoulder pain violation');
  assertAllowedEquipmentOnly(plan);
});

test('knee pain lower-body user avoids obvious knee-hostile patterns', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Legs', 'Glutes'],
    painAreas: ['Knee'],
    painProfilesByArea: { Knee: { severity: 8, recency: 'Recent' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertNoNamePatterns(plan, [/\bsissy squat\b/, /\bwalking lunge\b/, /\bjump squat\b/], 'knee pain violation');
  assertAllowedEquipmentOnly(plan);
});

test('back pain user avoids obvious high-risk hinge patterns', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Back', 'Arms'],
    painAreas: ['Back'],
    painProfilesByArea: { Back: { severity: 8, recency: 'Recent' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertNoNamePatterns(plan, [/\bgood morning\b/, /\bconventional deadlift\b/], 'back pain violation');
  assertAllowedEquipmentOnly(plan);
});

test('ankle-limited short-session user avoids knee-forward lower-body patterns', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    daysPerWeek: 3,
    sessionLengthMin: '30',
    priorityGroups: ['Legs', 'Glutes'],
    trainingStyle: 'Mostly free weights',
    painAreas: ['Ankle'],
    painProfilesByArea: { Ankle: { severity: 7, recency: 'Recent', notes: 'ankle irritation with forward knee travel and deep knee flexion' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertNoNamePatterns(plan, [/\bwalking lunge\b/, /\brear lunge\b/, /\bsplit squat\b/, /\bbulgarian\b/, /\bpistol squat\b/, /\bskater squat\b/], 'ankle/knee-forward violation');
});

test('wrist-limited advanced specialization user avoids straight-bar clashes', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 6,
    sessionLengthMin: '75+',
    priorityGroups: ['Arms', 'Shoulders', 'Back'],
    painAreas: ['Wrist'],
    painProfilesByArea: { Wrist: { severity: 7, recency: 'Recent', notes: 'cannot tolerate straight bar work or loaded wrist extension' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertNoNamePatterns(plan, [/\bbarbell curl\b/, /\bez[- ]bar curl\b/, /\bstraight bar\b/, /\bincline barbell triceps extension\b/, /\bwrist curl\b/, /\breverse wrist\b/, /\bpalms-down\b/, /\bpalms-up\b/], 'wrist contradiction');
});

test('exact live-style wrist-limited advanced lower-priority case avoids coach-objection straight-bar upper-body choices', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    primaryGoal: 'Build size',
    experience: '5y+',
    daysPerWeek: 6,
    sessionLengthMin: '75+',
    trainingStyle: 'Balanced mix',
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'],
    priorityGroups: ['Legs', 'Glutes', 'Calves'],
    painAreas: ['Wrist'],
    painProfilesByArea: { Wrist: { severity: 3, recency: 'Recent', notes: 'Wrist extension tolerance is limited on straight bars; dumbbells and neutral grips feel better.' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertNoNamePatterns(plan, [/\bstanding military press\b/, /\bseated barbell military press\b/, /\bbarbell shoulder press\b/, /\bsmith machine overhead shoulder press\b/, /\bbent over two-arm long bar row\b/, /\bbarbell curl\b/, /\bstraight bar\b/], 'live wrist-note contradiction');
});

test('machine/cable-only lower-body injured user gets no dumbbell leak', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    equipmentAccess: ['Bodyweight', 'Cable', 'Machines'],
    trainingStyle: 'Mostly machines/cables',
    daysPerWeek: 5,
    priorityGroups: ['Legs', 'Glutes'],
    painAreas: ['Knee'],
    painProfilesByArea: { Knee: { severity: 7, recency: 'Recent', notes: 'avoid deep squat and forward knee travel under load' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertAllowedEquipmentOnly(plan);
  assertNoNamePatterns(plan, [/\bdumbbell\b/, /\bshotgun row\b/], 'dumbbell leak');
  const printed = flattenExercises(plan).map((ex) => `${String(ex.name || '')}::${(Array.isArray(ex.equipment) ? ex.equipment : []).join(',')}`.toLowerCase());
  assert.equal(printed.some((line) => /pulley row/.test(line) && /dumbbell/.test(line)), false, 'printed equipment alias mismatch for pulley row');
});

test('2-day abs-calves beginner shows both priorities clearly', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '<6m',
    daysPerWeek: 2,
    sessionLengthMin: '45',
    preferredDays: ['Mo', 'Th'],
    priorityGroups: ['Core', 'Calves'],
    equipmentAccess: ['Bodyweight', 'Dumbbells'],
    location: 'Home',
    trainingStyle: 'Mostly free weights'
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(countPriorityPresence(plan, /\bcalf\b/) >= 2, 'expected visible calf work on both low-frequency days when feasible');
  assert.ok(countDistinctCoreFamilies(plan) >= 2, 'expected visible ab variety for 2-day abs emphasis');
  assert.ok(countDaysWithMatchingExercises(plan, /\bcalf\b/) >= 2, 'expected calf work on both training days for 2-day abs/calves emphasis');
  assertNoNamePatterns(plan, [/\bchest-supported row\b(?!.*dumbbell)/], 'ambiguous dumbbell row label leak');
});

test('arm-priority dumbbell-only intermediate keeps direct arm visibility', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '18-36m',
    daysPerWeek: 4,
    equipmentAccess: ['Dumbbells'],
    location: 'Commercial gym',
    trainingStyle: 'Mostly free weights',
    priorityGroups: ['Arms', 'Shoulders']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(countMatchingExercises(plan, [/\bcurl\b/, /\btriceps\b/, /\bpushdown\b/, /\bpressdown\b/, /\bkickback\b/, /\bskull crusher\b/]) >= 3, 'expected visible direct arm work');
});

test('dumbbell-only back-arms intermediate keeps coach-level emphasis visibility', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '18-36m',
    daysPerWeek: 4,
    equipmentAccess: ['Bodyweight', 'Dumbbells'],
    location: 'Home',
    sessionLengthMin: '60',
    trainingStyle: 'Mostly free weights',
    priorityGroups: ['Back', 'Arms']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(countMatchingExercises(plan, [/\brow\b/, /\bcurl\b/, /\btriceps\b/, /\bpushdown\b/, /\bpressdown\b/, /\bkickback\b/, /\bhammer curl\b/, /\breverse curl\b/]) >= 5, 'expected visible back and arm specialization');
  assert.notEqual(plan.meta?.eliteQa?.tier, 'fail');
});

test('shoulder-irritated chest-priority beginner stays chest-focused without overhead pressing', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '<6m',
    daysPerWeek: 3,
    sessionLengthMin: '45',
    priorityGroups: ['Chest'],
    painAreas: ['Shoulder'],
    painProfilesByArea: { Shoulder: { severity: 7, recency: 'Recent', notes: 'overhead pressing irritates shoulder' } }
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(countMatchingExercises(plan, [/\bbench\b/, /\bchest press\b/, /\bincline\b/]) >= 2, 'expected visible chest work');
  assertNoNamePatterns(plan, [/\boverhead press\b/, /\bshoulder press\b/, /\bmilitary press\b/], 'shoulder-irritated beginner overhead leak');
});

test('emphasis is visible for upper-priority user', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    daysPerWeek: 5
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(countMatchingExercises(plan, [/\bbench\b/, /\bpress\b/, /\bchest press\b/]) >= 2, 'expected obvious chest emphasis');
  assert.ok(countMatchingExercises(plan, [/\blateral raise\b/, /\bshoulder\b/, /\brear delt\b/]) >= 2, 'expected obvious shoulder emphasis');
  assert.ok(countMatchingExercises(plan, [/\bcurl\b/, /\btriceps\b/, /\bpushdown\b/, /\bpressdown\b/, /\bkickback\b/, /\bskull crusher\b/]) >= 2, 'expected obvious arm emphasis');
});

test('emphasis is visible for lower-priority user', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Legs', 'Glutes'],
    daysPerWeek: 4
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(countMatchingExercises(plan, [/\bsquat\b/, /\bleg press\b/, /\bhack squat\b/]) >= 2, 'expected obvious quad emphasis');
  assert.ok(countMatchingExercises(plan, [/\brdl\b/, /\bromanian deadlift\b/, /\bhip thrust\b/, /\bglute\b/]) >= 2, 'expected obvious glute/hinge emphasis');
});

test('adversarial coverage cases stay valid', () => {
  const cases = [
    baseInput({ daysPerWeek: 2, sessionLengthMin: '30', priorityGroups: ['Chest'], equipmentAccess: ['Dumbbells'], location: 'Home' }),
    baseInput({ daysPerWeek: 6, sessionLengthMin: '75+', priorityGroups: ['Shoulders', 'Arms'], painAreas: ['Shoulder'], painProfilesByArea: { Shoulder: { severity: 6, recency: 'Recent' } } }),
    baseInput({ daysPerWeek: 5, sessionLengthMin: '45', priorityGroups: ['Legs', 'Glutes'], painAreas: ['Knee'], painProfilesByArea: { Knee: { severity: 7, recency: 'Recent' } }, equipmentAccess: ['Machines', 'Cable'] }),
    baseInput({ daysPerWeek: 3, sessionLengthMin: '30', priorityGroups: ['Back', 'Arms'], equipmentAccess: ['Dumbbells'], location: 'Home' }),
    baseInput({ daysPerWeek: 4, sessionLengthMin: '60', priorityGroups: ['Chest', 'Back'], painAreas: ['Elbow'], painProfilesByArea: { Elbow: { severity: 6, recency: 'Recent' } } })
  ];
  for (const input of cases) {
    const plan = engine.buildOblueprintPlan(input);
    assert.equal(plan.error, undefined, plan?.reason || plan?.error);
    assertExactDayCount(plan, input.daysPerWeek);
    assertAllowedEquipmentOnly(plan);
  }
});

test('machine-cable lower-priority plan keeps push-pull day coherence', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    daysPerWeek: 5,
    equipmentAccess: ['Machines', 'Cable'],
    trainingStyle: 'Mostly machines/cables',
    priorityGroups: ['Legs', 'Glutes'],
    painAreas: ['Knee'],
    painProfilesByArea: { Knee: { severity: 7, recency: 'Recent' } },
    planSeed: 33333
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const weekOne = plan.weeks[0];
  const pushDay = weekOne.days.find((day) => day.dayType === 'Push');
  const pullDay = weekOne.days.find((day) => day.dayType === 'Pull');
  assert.ok(pushDay, 'expected push day');
  assert.ok(pullDay, 'expected pull day');
  assert.equal(pushDay.exercises.some((ex) => /\b(leg curl|adductor|abductor)\b/i.test(String(ex.name || ''))), false, 'push day leaked lower-body isolation');
  assert.equal(pullDay.exercises.some((ex) => /\b(leg curl|adductor|abductor|shoulder press)\b/i.test(String(ex.name || ''))), false, 'pull day leaked wrong movement pattern');
});

test('short-session plans stay tight and efficient', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    daysPerWeek: 3,
    sessionLengthMin: '30',
    priorityGroups: ['Chest', 'Shoulders', 'Arms']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  for (const day of plan.weeks[0].days) {
    assert.ok((day.exercises || []).length <= 4, `expected tight session, got ${(day.exercises || []).length} exercises on ${day.dayType}`);
  }
});

test('beginners get lower-complexity programming', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '<6m',
    daysPerWeek: 3,
    sessionLengthMin: '45',
    priorityGroups: ['Chest', 'Back']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const hardest = Math.max(...flattenExercises(plan).map((ex) => Number(ex.difficulty || 0)));
  assert.ok(hardest <= 3, `beginner plan included difficulty ${hardest}`);
});

test('advanced specialization users get visibly more priority allocation', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 6,
    sessionLengthMin: '75+',
    priorityGroups: ['Chest', 'Shoulders', 'Arms']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const sets = directSetsByMuscle(plan);
  const priorityUpper = Number(sets.Chest || 0) + Number(sets.Shoulders || 0) + Number(sets.Arms || 0);
  const nonPrioritySupport = Number(sets.Legs || 0) + Number(sets.Back || 0);
  assert.ok(priorityUpper > nonPrioritySupport, `expected specialized upper allocation to dominate support work: priority=${priorityUpper}, support=${nonPrioritySupport}`);
  assert.ok((sets.Shoulders || 0) >= (sets.Back || 0), 'expected shoulders to get specialized allocation');
  assert.ok((sets.Arms || 0) >= 12, 'expected direct arm work for specialization user');
  assert.ok(plan.schedule.some((day) => day.dayType === 'DeltsArms' || day.dayType === 'UpperFocus'), 'expected specialized upper split structure');
  assert.ok(['elite', 'good'].includes(plan.meta?.eliteQa?.tier), `expected at least good elite QA tier, got ${plan.meta?.eliteQa?.tier}`);
  for (const day of plan.weeks[0].days) {
    const names = day.exercises.map((ex) => String(ex.name || '').toLowerCase());
    assert.equal(new Set(names).size, names.length, `expected no exact duplicate exercise names on ${day.dayType}`);
  }
});

test('advanced chest-shoulders-arms specialist avoids second-tier bodybuilding picks', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 6,
    sessionLengthMin: '75+',
    priorityGroups: ['Chest', 'Shoulders', 'Arms']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertNoNamePatterns(plan, [/\bjm press\b/, /\bincline barbell triceps extension\b/, /\bmachine shoulder \(military\) press\b/, /\bside laterals? to front raise\b/], 'second-tier upper-body exercise leak');
  assert.ok(['elite', 'good'].includes(plan.meta?.eliteQa?.tier), `expected strong QA tier, got ${plan.meta?.eliteQa?.tier}`);
});

test('advanced arm-priority users receive direct forearm support', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 5,
    sessionLengthMin: '75+',
    priorityGroups: ['Arms', 'Shoulders', 'Back']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(countMatchingExercises(plan, [/\bwrist curl\b/, /\breverse wrist\b/, /\breverse curl\b/, /\bhammer curl\b/, /\bpronation\b/, /\bsupination\b/, /\bfinger curl\b/]) >= 2, 'expected visible direct forearm support');
});

test('advanced abs-priority users get diverse direct core work', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    primaryGoal: 'Cut fat',
    experience: '2-5y',
    daysPerWeek: 5,
    sessionLengthMin: '75+',
    priorityGroups: ['Core', 'Shoulders', 'Chest']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assert.ok(countDistinctCoreFamilies(plan) >= 3, `expected at least 3 distinct core stimulus families, got ${countDistinctCoreFamilies(plan)}`);
});

test('calves emphasis is visible in low-frequency plans', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    daysPerWeek: 2,
    sessionLengthMin: '45',
    preferredDays: ['Mo', 'Th'],
    priorityGroups: ['Calves', 'Chest']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const calfDays = countDaysWithMatchingExercises(plan, /\bcalf\b/);
  assert.ok(calfDays >= 1, `expected calf work on at least 1 day, got ${calfDays}`);
});

test('barbell-focused short-session beginner shoulders-arms user stays simple and direct', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '<6m',
    daysPerWeek: 4,
    sessionLengthMin: '30',
    preferredDays: ['Mo', 'Tu', 'Th', 'Fr'],
    trainingStyle: 'Mostly free weights',
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell'],
    priorityGroups: ['Shoulders', 'Arms']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertNoNamePatterns(plan, [/\bjm press\b/, /^row$/], 'beginner short-session taste leak');
  assert.ok(countMatchingExercises(plan, [/\bshoulder press\b/, /\boverhead press\b/, /\bmilitary press\b/, /\blateral raise\b/, /\brear delt\b/, /\breverse fly\b/]) >= 2, 'expected unmistakable direct shoulder work');
  assert.ok(countMatchingExercises(plan, [/\bcurl\b/, /\btriceps\b/, /\bpushdown\b/, /\bpressdown\b/, /\bkickback\b/, /\bskull crusher\b/]) >= 2, 'expected unmistakable direct arm work');
  const names = flattenExercises(plan).map((ex) => String(ex.name || '').toLowerCase());
  assert.ok(names.some((name) => /\bcurl\b/.test(name) && !/wrist curl|reverse wrist|palms-down|palms-up/.test(name)), 'expected direct biceps work');
  assert.ok(names.some((name) => (/\btriceps\b|\bpushdown\b|\bpressdown\b|\bkickback\b|\bskull crusher\b/.test(name) || (/\bextension\b/.test(name) && /(triceps|rope|cable|dumbbell|ez-bar|barbell|overhead|lying)/.test(name))) && !/wrist|neck|leg extension|hip extension|back extension|shoulder extension/.test(name)), 'expected direct triceps work');
  for (const day of plan.weeks[0].days) {
    assert.ok((day.exercises || []).length <= 4, `expected beginner short session cap, got ${(day.exercises || []).length}`);
  }
});

test('advanced 4-day chest-shoulders-arms user gets direct shoulder press and delt isolation', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 4,
    sessionLengthMin: '60',
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    planSeed: 34567
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const names = flattenExercises(plan).map((ex) => String(ex.name || '').toLowerCase());
  assert.ok(names.some((name) => /shoulder press|overhead press|military press/.test(name)), 'expected direct shoulder press');
  assert.ok(names.some((name) => /lateral raise|rear delt|reverse fly|face pull/.test(name)), 'expected direct lateral or rear delt work');
});

test('press-job grouping collapses chest press name variants into one family', () => {
  const chestVariants = [
    'Bench Press',
    'Incline Bench Press',
    'Incline Dumbbell Bench Press Palms-In',
    'Incline Dumbbell Press',
    'Machine Chest Press',
    'Cable Chest Press',
    'Leverage Chest Press'
  ];
  for (const name of chestVariants) {
    const truth = engine.buildExerciseTruth({ name, pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' });
    assert.equal(truth.pressRole, 'chest_press', `${name}: expected chest_press family, got ${truth.pressRole}`);
  }
});

test('press-job grouping collapses shoulder press name variants into one family', () => {
  const shoulderVariants = [
    'Barbell Shoulder Press',
    'Seated Military Press',
    'Dumbbell Shoulder Press',
    'Machine Shoulder Press',
    'Cable Shoulder Press'
  ];
  for (const name of shoulderVariants) {
    const truth = engine.buildExerciseTruth({ name, pattern: 'VerticalPush', style: 'Compound', primary: 'Shoulders' });
    assert.equal(truth.pressRole, 'shoulder_press', `${name}: expected shoulder_press family, got ${truth.pressRole}`);
  }
});

test('shoulders-arms days stop at one main press before switching to delts and arms', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '6-24m',
    daysPerWeek: 4,
    sessionLengthMin: '60',
    priorityGroups: ['Shoulders', 'Arms'],
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'],
    trainingStyle: 'Balanced mix',
    planSeed: 55501
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  for (const day of plan.weeks[0].days || []) {
    if (!['Push', 'Upper', 'UpperFocus', 'DeltsArms'].includes(String(day.dayType || ''))) continue;
    const presses = (day.exercises || []).filter((ex) => /bench press|chest press|incline press|shoulder press|overhead press|military press/.test(String(ex.name || '').toLowerCase()));
    assert.ok(presses.length <= 1, `${day.dayType}: expected one main press max, got ${presses.map((ex) => ex.name).join(', ')}`);
    const names = (day.exercises || []).map((ex) => String(ex.name || '').toLowerCase());
    if (presses.length === 1) {
      assert.ok(names.some((name) => /lateral raise|rear delt|reverse fly|face pull/.test(name)), `${day.dayType}: expected non-press delt work after main press`);
      assert.ok(names.some((name) => /\bcurl\b|\btriceps\b|\bpushdown\b|\bpressdown\b|\bskull crusher\b|\bextension\b/.test(name)), `${day.dayType}: expected direct arm work after main press`);
    }
  }
});

test('chest-shoulders-arms days cap chest pressing at two slots and then shift to delts or triceps', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 4,
    sessionLengthMin: '60',
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell', 'Cable', 'Machines'],
    trainingStyle: 'Balanced mix',
    planSeed: 55502
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  for (const day of plan.weeks[0].days || []) {
    if (!['Push', 'Upper', 'UpperFocus'].includes(String(day.dayType || ''))) continue;
    const names = (day.exercises || []).map((ex) => String(ex.name || '').toLowerCase());
    const chestPressCount = names.filter((name) => /bench press|chest press|incline press|decline press/.test(name)).length;
    const totalPressCount = names.filter((name) => /bench press|chest press|incline press|decline press|shoulder press|overhead press|military press/.test(name)).length;
    assert.ok(chestPressCount <= (day.dayType === 'Push' ? 2 : 1), `${day.dayType}: chest pressing exceeded slot cap`);
    if (day.dayType === 'Push') {
      assert.ok(totalPressCount <= 2, `${day.dayType}: repeated press names survived beyond the two-slot press cap`);
    }
    if (chestPressCount >= 2) {
      assert.ok(names.some((name) => /lateral raise|rear delt|reverse fly|face pull|\btriceps\b|\bpushdown\b|\bpressdown\b|\bskull crusher\b|\bextension\b/.test(name)), `${day.dayType}: expected delt or triceps work after second chest press`);
    }
  }
});

test('chest-core days give core a real slot before extra chest press volume takes over', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '6-24m',
    daysPerWeek: 3,
    sessionLengthMin: '45',
    preferredDays: ['Tu', 'Th', 'Sa'],
    priorityGroups: ['Chest', 'Core'],
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Cable', 'Machines'],
    trainingStyle: 'Balanced mix',
    planSeed: 55503
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  let coreDays = 0;
  for (const day of plan.weeks[0].days || []) {
    if (!['Push', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(String(day.dayType || ''))) continue;
    const names = (day.exercises || []).map((ex) => String(ex.name || '').toLowerCase());
    const chestPressCount = names.filter((name) => /bench press|chest press|incline press|decline press/.test(name)).length;
    const coreCount = (day.exercises || []).filter((ex) => ex.directAb).length;
    assert.ok(chestPressCount <= (day.dayType === 'Push' ? 2 : 1), `${day.dayType}: chest work exceeded the allowed day cap before core took priority`);
    if (coreCount > 0) coreDays += 1;
    if (chestPressCount >= 2) {
      assert.ok(coreCount >= 1, `${day.dayType}: extra chest pressing occurred before core got a real slot`);
      assert.ok(names.some((name) => /crunch|reverse crunch|pallof|oblique/.test(name)), `${day.dayType}: overflow chest work did not get swapped into an allowed ab job`);
    }
  }
  assert.ok(coreDays >= 2, `expected core to own at least 2 real slots across the week, got ${coreDays}`);
});

test('shoulder-irritated users do not grade elite when coach-objection pressing slips through', () => {
  const graded = engine.buildEliteQaReport({
    meta: { allowedEquipment: ['machine', 'cable', 'bodyweight'] },
    weeks: [{
      days: [{
        exercises: [
          { name: 'Machine Shoulder (Military) Press', primary: 'Shoulders', sets: 3 },
          { name: 'Cable Crunch', primary: 'Core', sets: 3 }
        ]
      }]
    }]
  }, engine.normalizeUserInput(baseInput({
    painAreas: ['Shoulder'],
    painProfilesByArea: { Shoulder: { severity: 7, recency: 'Recent', notes: 'overhead pressing irritates shoulder' } },
    priorityGroups: ['Chest', 'Core']
  })));
  assert.ok(['good', 'questionable', 'fail'].includes(graded.tier), 'expected downgrade from elite for coach objection case');
  assert.notEqual(graded.tier, 'elite');
});

test('elite QA rubric flags plans as at least good for core regression cases', () => {
  const cases = [
    baseInput({ experience: '5y+', daysPerWeek: 6, sessionLengthMin: '75+', priorityGroups: ['Chest', 'Shoulders', 'Arms'] }),
    baseInput({
      experience: '18-36m',
      daysPerWeek: 5,
      trainingStyle: 'Mostly machines/cables',
      equipmentAccess: ['Bodyweight', 'Cable', 'Machines'],
      priorityGroups: ['Legs', 'Glutes'],
      painAreas: ['Knee'],
      painProfilesByArea: { Knee: { severity: 7, recency: 'Recent', notes: 'avoid deep squat and forward knee travel under load' } }
    }),
    baseInput({
      experience: '<6m',
      daysPerWeek: 2,
      sessionLengthMin: '45',
      priorityGroups: ['Core', 'Calves'],
      equipmentAccess: ['Bodyweight', 'Dumbbells'],
      location: 'Home'
    })
  ];
  for (const input of cases) {
    const plan = engine.buildOblueprintPlan(input);
    assert.equal(plan.error, undefined, plan?.reason || plan?.error);
    assert.ok(['elite', 'good'].includes(plan.meta?.eliteQa?.tier), `expected elite QA tier to be good or elite, got ${plan.meta?.eliteQa?.tier}`);
    assert.ok(Number(plan.meta?.eliteQa?.score || 0) >= 7.2, `expected strong elite QA score, got ${plan.meta?.eliteQa?.score}`);
  }
});

test('golden regression set 2 preserves later high-quality specialist and constrained wins', () => {
  const cases = [
    ['advanced_chest_shoulders_arms', baseInput({ experience: '5y+', daysPerWeek: 4, sessionLengthMin: '60', priorityGroups: ['Chest', 'Shoulders', 'Arms'], planSeed: 34567 })],
    ['advanced_abs_priority', baseInput({ primaryGoal: 'Cut fat', experience: '2-5y', daysPerWeek: 5, sessionLengthMin: '75+', priorityGroups: ['Core', 'Shoulders', 'Chest'] })],
    ['dumbbell_only_arms_shoulders', baseInput({ experience: '18-36m', daysPerWeek: 4, equipmentAccess: ['Dumbbells'], location: 'Commercial gym', trainingStyle: 'Mostly free weights', priorityGroups: ['Arms', 'Shoulders'] })],
    ['machine_cable_lower_priority', baseInput({ equipmentAccess: ['Bodyweight', 'Cable', 'Machines'], trainingStyle: 'Mostly machines/cables', daysPerWeek: 4, priorityGroups: ['Legs', 'Glutes'], painAreas: ['Knee'], painProfilesByArea: { Knee: { severity: 6, recency: 'Recent', notes: 'avoid deep squat and forward knee travel under load' } } })],
    ['short_session_beginner_shoulders_arms', baseInput({ experience: '<6m', daysPerWeek: 4, sessionLengthMin: '30', preferredDays: ['Mo', 'Tu', 'Th', 'Fr'], trainingStyle: 'Mostly free weights', equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell'], priorityGroups: ['Shoulders', 'Arms'] })]
  ];

  for (const [label, input] of cases) {
    const plan = engine.buildOblueprintPlan(input);
    assertCoachGrade(plan, label, 8.0);
  }
});

test('stage 2 quality pass improves or preserves grading without new invalidity', () => {
  const input = baseInput({
    experience: '5y+',
    daysPerWeek: 6,
    sessionLengthMin: '75+',
    priorityGroups: ['Chest', 'Shoulders', 'Arms']
  });
  const { normalized, targets, frequencyTargets, stressMultiplier, stage1 } = buildStage1Plan(input);
  const stage1Plan = engine.attachAdaptiveCoachingLayer(stage1, normalized, targets, frequencyTargets, stressMultiplier);
  engine.applyEliteGradingLayer(stage1Plan, normalized);
  const stage2 = engine.upgradePlanQualityPass(stage1, normalized, PREPROCESSED_EXERCISES);
  const stage2Plan = engine.attachAdaptiveCoachingLayer(stage2, normalized, targets, frequencyTargets, stressMultiplier);
  engine.applyEliteGradingLayer(stage2Plan, normalized);
  assertAllowedEquipmentOnly(stage2Plan);
  assert.ok(Number(stage2Plan.meta?.eliteQa?.score || 0) >= Number(stage1Plan.meta?.eliteQa?.score || 0), 'stage 2 should not reduce elite score');
});

test('stage 3 adaptive layer attaches guidance without changing exercises', () => {
  const input = baseInput({ priorityGroups: ['Back', 'Arms'], daysPerWeek: 4 });
  const { normalized, targets, frequencyTargets, stressMultiplier, stage1 } = buildStage1Plan(input);
  const stage2 = engine.upgradePlanQualityPass(stage1, normalized, PREPROCESSED_EXERCISES);
  const before = JSON.stringify(stage2.weeks);
  const stage3Plan = engine.attachAdaptiveCoachingLayer(stage2, normalized, targets, frequencyTargets, stressMultiplier);
  const after = JSON.stringify((stage3Plan.weeks || []).map((week) => ({ days: (week.days || []).map((day) => ({ exercises: (day.exercises || []).map((ex) => ex.name) })) })));
  assert.ok(stage3Plan.meta?.progressionModel, 'expected progression model');
  assert.ok(stage3Plan.meta?.recoveryModel, 'expected recovery model');
  assert.ok(stage3Plan.meta?.adaptiveCheckInModel, 'expected adaptive check-in model');
  assert.equal(after, JSON.stringify((JSON.parse(before) || []).map((week) => ({ days: (week.days || []).map((day) => ({ exercises: (day.exercises || []).map((ex) => ex.name) })) }))), 'stage 3 should not alter exercise selection');
});

test('stage 4 grading layer grades without changing exercises', () => {
  const input = baseInput({ priorityGroups: ['Chest', 'Back'], daysPerWeek: 4 });
  const { normalized, targets, frequencyTargets, stressMultiplier, stage1 } = buildStage1Plan(input);
  const stage2 = engine.upgradePlanQualityPass(stage1, normalized, PREPROCESSED_EXERCISES);
  const stage3Plan = engine.attachAdaptiveCoachingLayer(stage2, normalized, targets, frequencyTargets, stressMultiplier);
  const before = JSON.stringify(stage3Plan.weeks);
  engine.applyEliteGradingLayer(stage3Plan, normalized);
  assert.ok(stage3Plan.meta?.eliteQa?.tier, 'expected elite grade');
  assert.equal(JSON.stringify(stage3Plan.weeks), before, 'stage 4 should not alter exercise selection');
});

test('final constrained rebuild rescues a valid but slot-exhausted constrained profile', () => {
  const input = baseInput({
    primaryGoal: 'Recomp',
    experience: '6-24m',
    daysPerWeek: 3,
    sessionLengthMin: '60',
    preferredDays: ['Mo', 'Tu', 'We'],
    trainingStyle: 'Balanced mix',
    priorityGroups: ['Core', 'Chest'],
    location: 'Commercial gym',
    equipmentAccess: ['Dumbbells'],
    painAreas: ['Shoulder'],
    painProfilesByArea: { Shoulder: { severity: 6, recency: 'Recent' } },
    planSeed: 1011
  });
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  assertExactDayCount(plan, 3);
  assertAllowedEquipmentOnly(plan);
  assert.ok((plan.meta?.notes || []).some((entry) => /constrained rebuild/i.test(entry)) || ['elite', 'good'].includes(plan.meta?.eliteQa?.tier), 'expected successful recovery path or strong primary build');
});

test('eligible advanced users can receive neck work without overuse', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 6,
    sessionLengthMin: '75+',
    priorityGroups: ['Shoulders', 'Back', 'Arms']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const neckDayCount = countDaysWithMatchingExercises(plan, /\bneck\b|head harness/);
  assert.ok(neckDayCount >= 1, 'expected direct neck work for eligible advanced user');
  assert.ok(neckDayCount <= 3, `expected neck work on at most 3 days, got ${neckDayCount}`);
});

test('adaptive recalibration increases nutrition when bulk rate is too slow', () => {
  const result = engine.buildAdaptiveRecalibration({
    phase: 'surplus',
    checkIn: {
      bodyweightWeeklyChangePct: 0.1,
      fatigueScore: 4,
      adherencePct: 92,
      plateauWeeks: 1,
      priorityMuscleResponse: 'neutral',
      jointIrritationTrend: 'stable'
    }
  });
  assert.equal(result.status, 'adjust');
  assert.ok(result.actions.some((entry) => /calories/i.test(entry)), 'expected calorie increase guidance');
});

test('adaptive recalibration pulls calories down when cut rate is too fast', () => {
  const result = engine.buildAdaptiveRecalibration({
    phase: 'deficit',
    checkIn: {
      bodyweightWeeklyChangePct: -1.2,
      fatigueScore: 6,
      adherencePct: 95,
      plateauWeeks: 0,
      priorityMuscleResponse: 'neutral',
      jointIrritationTrend: 'stable'
    }
  });
  assert.equal(result.status, 'adjust');
  assert.ok(result.actions.some((entry) => /add 100-150 daily calories/i.test(entry)), 'expected slower cut guidance');
});

test('adaptive recalibration responds to stalls and fatigue', () => {
  const result = engine.buildAdaptiveRecalibration({
    phase: 'recomp',
    checkIn: {
      bodyweightWeeklyChangePct: 0,
      fatigueScore: 8,
      adherencePct: 90,
      plateauWeeks: 4,
      priorityMuscleResponse: 'poor',
      jointIrritationTrend: 'stable'
    }
  });
  assert.equal(result.status, 'adjust');
  assert.ok(result.actions.some((entry) => /deload|cut 20-30%/i.test(entry)), 'expected fatigue response');
  assert.ok(result.actions.some((entry) => /add 2-4 weekly sets|swap 1 low-response movement/i.test(entry)), 'expected plateau response');
});

test('adaptive recalibration responds to joint irritation and low adherence', () => {
  const result = engine.buildAdaptiveRecalibration({
    phase: 'recomp',
    checkIn: {
      bodyweightWeeklyChangePct: 0,
      fatigueScore: 5,
      adherencePct: 72,
      plateauWeeks: 1,
      priorityMuscleResponse: 'neutral',
      jointIrritationTrend: 'rising'
    }
  });
  assert.equal(result.status, 'adjust');
  assert.ok(result.actions.some((entry) => /replace the most aggravating exercise/i.test(entry)), 'expected joint-irritation response');
  assert.ok(result.actions.some((entry) => /simplify the plan/i.test(entry)), 'expected adherence response');
});

test('adaptive recalibration reacts to stalled visual progress and poor session completion', () => {
  const result = engine.buildAdaptiveRecalibration({
    phase: 'recomp',
    checkIn: {
      bodyweightWeeklyChangePct: 0,
      fatigueScore: 5,
      adherencePct: 90,
      sessionCompletionPct: 78,
      plateauWeeks: 4,
      priorityMuscleResponse: 'poor',
      priorityPerformanceTrend: 'down',
      bodyMeasurementTrend: 'stalled',
      photosTrend: 'stalled',
      jointIrritationTrend: 'stable'
    }
  });
  assert.equal(result.status, 'adjust');
  assert.ok(result.actions.some((entry) => /remove one lower-value accessory per session/i.test(entry)), 'expected session-density response');
  assert.ok(result.actions.some((entry) => /replace the weakest-performing priority exercise/i.test(entry)), 'expected priority-exercise response');
  assert.ok(result.actions.some((entry) => /escalate specialization/i.test(entry)), 'expected stalled visual progress response');
});

test('lower-priority users get more lower-body direct work than upper-body support work', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    daysPerWeek: 4,
    priorityGroups: ['Legs', 'Glutes']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const sets = directSetsByMuscle(plan);
  const lower = Number(sets.Legs || 0) + Number(sets.Glutes || 0);
  const upper = Number(sets.Chest || 0) + Number(sets.Back || 0);
  assert.ok(lower > upper, `expected lower-body direct work to exceed upper support work: lower=${lower}, upper=${upper}`);
});

test('200 randomized valid profiles do not fail and respect hard constraints', () => {
  const goals = ['Build size', 'Cut fat', 'Recomp'];
  const sessions = ['30', '45', '60', '75+'];
  const experiences = ['<6m', '6-24m', '18-36m', '2-5y', '5y+'];
  const styles = ['Balanced mix', 'Mostly free weights', 'Mostly machines/cables'];
  const equipmentOptions = [
    ['Bodyweight', 'Dumbbells'],
    ['Dumbbells'],
    ['Barbell', 'Dumbbells'],
    ['Machines', 'Cable'],
    ['Barbell', 'Dumbbells', 'Machines', 'Cable']
  ];
  const priorities = [
    ['Chest', 'Back'],
    ['Shoulders', 'Arms'],
    ['Legs', 'Glutes'],
    ['Chest', 'Shoulders', 'Arms'],
    ['Back', 'Arms'],
    ['Core', 'Chest']
  ];
  const painCases = [
    { painAreas: [], painProfilesByArea: {} },
    { painAreas: ['Shoulder'], painProfilesByArea: { Shoulder: { severity: 6, recency: 'Recent' } } },
    { painAreas: ['Knee'], painProfilesByArea: { Knee: { severity: 6, recency: 'Recent' } } },
    { painAreas: ['Back'], painProfilesByArea: { Back: { severity: 6, recency: 'Recent' } } },
    { painAreas: ['Elbow'], painProfilesByArea: { Elbow: { severity: 5, recency: 'Recent' } } }
  ];

  for (let i = 0; i < RANDOM_PROFILE_COUNT; i += 1) {
    const daysPerWeek = 2 + (i % 5);
    const location = i % 3 === 0 ? 'Home' : 'Commercial gym';
    const equipmentAccess = equipmentOptions[i % equipmentOptions.length];
    const input = baseInput({
      primaryGoal: goals[i % goals.length],
      experience: experiences[i % experiences.length],
      daysPerWeek,
      sessionLengthMin: sessions[i % sessions.length],
      preferredDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].slice(0, daysPerWeek),
      trainingStyle: styles[i % styles.length],
      priorityGroups: priorities[i % priorities.length],
      location,
      equipmentAccess,
      ...painCases[i % painCases.length],
      planSeed: 1000 + i
    });
    const plan = engine.buildOblueprintPlan(input);
    assert.equal(plan.error, undefined, `random profile ${i} failed: ${plan?.reason || plan?.error}`);
    assertExactDayCount(plan, daysPerWeek);
    assertAllowedEquipmentOnly(plan);
  }
});

function projectionSummaryByFamily(plan, family) {
  return (plan?.meta?.progressionProjection?.exerciseSummaries || []).find((entry) => String(entry?.family || '') === String(family || ''));
}

test('bodybuilding plan exposes 16-week projection metadata and current-week targets', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    timeline: '8 weeks',
    priorityGroups: ['Chest', 'Shoulders', 'Arms']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan?.meta?.progressionProjection;
  assert.ok(projection, 'expected progressionProjection');
  assert.equal(Array.isArray(projection.weeklyTable), true, 'expected projection weekly table');
  assert.equal(Array.isArray(projection.deloadWeeks), true, 'expected deload weeks');
  assert.equal(projection.weeklyTable.some((row) => Number(row?.week) === 16), true, 'expected 16-week projection horizon');
  assert.equal(Array.isArray(plan?.meta?.autoreg?.deloadWeeks), true, 'expected autoreg deload weeks');
  const projectedExercises = flattenExercises(plan).filter((exercise) => Number.isFinite(Number(exercise?.projectedWeight)));
  assert.ok(projectedExercises.length > 0, 'expected projected weights on returned exercises');
});

test('anchor lifts scale major and accessory estimates conservatively for strong users', () => {
  const strongPlan = engine.buildOblueprintPlan(baseInput({
    bench: 365,
    squat: 515,
    deadlift: 615,
    experience: '5y+',
    priorityGroups: ['Chest', 'Shoulders', 'Arms']
  }));
  assert.equal(strongPlan.error, undefined, strongPlan?.reason || strongPlan?.error);
  const chestPress = projectionSummaryByFamily(strongPlan, 'chest_press');
  const shoulderPress = projectionSummaryByFamily(strongPlan, 'shoulder_press');
  const curl = projectionSummaryByFamily(strongPlan, 'biceps_iso');
  assert.ok(chestPress && shoulderPress && curl, 'expected major and accessory summaries');
  assert.ok(Number(chestPress.startingLoad) >= 240, `expected strong chest press estimate, got ${chestPress?.startingLoad}`);
  assert.ok(Number(chestPress.startingLoad) <= 302.5, `expected chest press clamp, got ${chestPress?.startingLoad}`);
  assert.ok(Number(shoulderPress.startingLoad) >= 85, `expected realistic shoulder press estimate, got ${shoulderPress?.startingLoad}`);
  assert.ok(Number(shoulderPress.startingLoad) <= 212.5, `expected shoulder press clamp, got ${shoulderPress?.startingLoad}`);
  assert.ok(Number(curl.startingLoad) >= 25, `expected strong-user curl estimate not to undershoot badly, got ${curl?.startingLoad}`);
  assert.ok(Number(curl.startingLoad) <= 90, `expected curl estimate to remain conservative, got ${curl?.startingLoad}`);
});

test('weak beginner users are protected from overshot accessory estimates', () => {
  const beginnerPlan = engine.buildOblueprintPlan(baseInput({
    bench: 95,
    squat: 135,
    deadlift: 165,
    experience: '<6m',
    priorityGroups: ['Chest', 'Arms', 'Core']
  }));
  assert.equal(beginnerPlan.error, undefined, beginnerPlan?.reason || beginnerPlan?.error);
  const chestPress = projectionSummaryByFamily(beginnerPlan, 'chest_press');
  const curl = projectionSummaryByFamily(beginnerPlan, 'biceps_iso');
  const crunch = projectionSummaryByFamily(beginnerPlan, 'core_flexion');
  assert.ok(Number(chestPress?.startingLoad) <= 95, `expected chest press to stay below anchor max, got ${chestPress?.startingLoad}`);
  assert.ok(Number(curl?.startingLoad) <= 15, `expected beginner curl estimate to stay modest, got ${curl?.startingLoad}`);
  assert.ok(Number(crunch?.startingLoad) <= 40, `expected core loading to stay conservative, got ${crunch?.startingLoad}`);
});

test('phase affects projected loading without breaking conservative anchor logic', () => {
  const cutPlan = engine.buildOblueprintPlan(baseInput({
    primaryGoal: 'Cut fat',
    bench: 225,
    squat: 315,
    deadlift: 405
  }));
  const bulkPlan = engine.buildOblueprintPlan(baseInput({
    primaryGoal: 'Build size',
    bench: 225,
    squat: 315,
    deadlift: 405
  }));
  assert.equal(cutPlan.error, undefined, cutPlan?.reason || cutPlan?.error);
  assert.equal(bulkPlan.error, undefined, bulkPlan?.reason || bulkPlan?.error);
  const cutChest = projectionSummaryByFamily(cutPlan, 'chest_press');
  const bulkChest = projectionSummaryByFamily(bulkPlan, 'chest_press');
  assert.ok(Number(bulkChest?.startingLoad) >= Number(cutChest?.startingLoad), 'expected bulk projection to be at least as high as cut');
  assert.ok(Number(bulkChest?.week16Load) >= Number(cutChest?.week16Load), 'expected bulk week-16 projection to be at least as high as cut');
});

test('double progression uses rep-first behavior before load jumps', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    priorityGroups: ['Chest', 'Back'],
    bench: 245,
    squat: 335,
    deadlift: 425
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const chestPress = projectionSummaryByFamily(plan, 'chest_press');
  assert.ok(chestPress, 'expected chest press projection');
  const rows = (plan.meta?.progressionProjection?.weeklyTable || []).filter((row) => String(row?.canonicalExerciseId || '') === String(chestPress.canonicalExerciseId));
  assert.ok(rows.length >= 4, 'expected multiple weekly rows');
  const sameLoadBeforeBump = rows.some((row, idx) => idx > 0 && Number(row.targetLoad) === Number(rows[idx - 1].targetLoad) && String(row.repRange || '') !== String(rows[idx - 1].repRange || ''));
  const laterIncrease = rows.some((row, idx) => idx > 0 && Number(row.targetLoad) > Number(rows[idx - 1].targetLoad));
  assert.equal(sameLoadBeforeBump, true, 'expected rep progression before load bump');
  assert.equal(laterIncrease, true, 'expected later load increase');
});

test('projection deload insertion is clearly marked across the 16-week horizon', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 6,
    sessionLengthMin: '75+',
    preferredDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    priorityGroups: ['Chest', 'Back', 'Legs']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const deloadWeeks = plan.meta?.progressionProjection?.deloadWeeks || [];
  assert.deepEqual(deloadWeeks, [5, 10, 15]);
  const deloadRows = (plan.meta?.progressionProjection?.weeklyTable || []).filter((row) => deloadWeeks.includes(Number(row?.week)));
  assert.ok(deloadRows.length > 0, 'expected deload rows');
  assert.ok(deloadRows.every((row) => String(row?.tag || '') === 'deload'), 'expected deload row tags');
});

test('adaptive projection state adjusts upward and downward after repeated performance signals', () => {
  const plan = engine.buildOblueprintPlan(baseInput());
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const initial = engine.createAdaptiveProjectionState(baseInput(), plan.meta?.progressionProjection);
  const up1 = engine.updateAdaptiveProjectionState(initial, { family: 'chest_press', projectedLoad: 180, actualLoad: 190, targetReps: 10, actualReps: 12 });
  const up2 = engine.updateAdaptiveProjectionState(up1, { family: 'chest_press', projectedLoad: 180, actualLoad: 192, targetReps: 10, actualReps: 12 });
  assert.ok(Number(up2.familyAdjustments.chest_press) > 1, 'expected upward family adjustment');
  const down1 = engine.updateAdaptiveProjectionState(up2, { family: 'chest_press', projectedLoad: 190, actualLoad: 180, targetReps: 10, actualReps: 8 });
  const down2 = engine.updateAdaptiveProjectionState(down1, { family: 'chest_press', projectedLoad: 190, actualLoad: 178, targetReps: 10, actualReps: 8 });
  assert.ok(Number(down2.familyAdjustments.chest_press) < Number(up2.familyAdjustments.chest_press), 'expected downward family adjustment after misses');
});

test('repeated overperformance raises future targets when adaptive forecast is reapplied', () => {
  const input = baseInput({ priorityGroups: ['Chest', 'Shoulders'], daysPerWeek: 4, preferredDays: ['Mo', 'Tu', 'Th', 'Fr'] });
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan.meta?.progressionProjection;
  const initial = engine.createAdaptiveProjectionState(input, projection);
  const up1 = engine.updateAdaptiveProjectionState(initial, { family: 'chest_press', projectedLoad: 180, actualLoad: 190, targetReps: 10, actualReps: 12 });
  const up2 = engine.updateAdaptiveProjectionState(up1, { family: 'chest_press', projectedLoad: 180, actualLoad: 192, targetReps: 10, actualReps: 12 });
  const impact = engine.simulateAdaptiveProjectionImpact(projection, up2, { fromWeek: 6 });
  const changedChestDiff = impact.diffs.find((diff) => diff.family === 'chest_press' && diff.week >= 6);
  assert.ok(changedChestDiff, 'expected a changed future chest-press row');
  assert.ok(Number(String(changedChestDiff.afterTarget).replace(/[^0-9.]+/g, '')) > Number(String(changedChestDiff.beforeTarget).replace(/[^0-9.]+/g, '')));
});

test('repeated underperformance slows or lowers future targets when adaptive forecast is reapplied', () => {
  const input = baseInput({ priorityGroups: ['Chest', 'Shoulders'], daysPerWeek: 4, preferredDays: ['Mo', 'Tu', 'Th', 'Fr'] });
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan.meta?.progressionProjection;
  const initial = engine.createAdaptiveProjectionState(input, projection);
  const down1 = engine.updateAdaptiveProjectionState(initial, { family: 'chest_press', projectedLoad: 180, actualLoad: 170, targetReps: 10, actualReps: 7 });
  const down2 = engine.updateAdaptiveProjectionState(down1, { family: 'chest_press', projectedLoad: 180, actualLoad: 168, targetReps: 10, actualReps: 7 });
  const impact = engine.simulateAdaptiveProjectionImpact(projection, down2, { fromWeek: 6 });
  const changedChestDiff = impact.diffs.find((diff) => diff.family === 'chest_press' && diff.week >= 6);
  assert.ok(changedChestDiff, 'expected a changed future chest-press row');
  assert.ok(Number(String(changedChestDiff.afterTarget).replace(/[^0-9.]+/g, '')) < Number(String(changedChestDiff.beforeTarget).replace(/[^0-9.]+/g, '')));
});

test('triggered deload insertion alters future week projections in simulation mode', () => {
  const plan = engine.buildOblueprintPlan(baseInput());
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan.meta?.progressionProjection;
  const impact = engine.simulateAdaptiveProjectionImpact(projection, plan.meta?.autoreg?.adaptiveProjectionState || {}, { fromWeek: 6, insertDeloadWeek: 6 });
  assert.equal(impact.deloadWeeksChanged, true);
  const insertedDeload = impact.diffs.find((diff) => diff.week === 6 && diff.afterTag === 'deload');
  assert.ok(insertedDeload, 'expected a simulated deload insertion diff');
});

test('movement-family adjustments propagate beyond one exact exercise when family forecast is reapplied', () => {
  const input = baseInput({ priorityGroups: ['Chest', 'Shoulders'], daysPerWeek: 4, preferredDays: ['Mo', 'Tu', 'Th', 'Fr'] });
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan.meta?.progressionProjection;
  const chestExercises = (projection?.exerciseSummaries || []).filter((entry) => entry.family === 'chest_press');
  assert.ok(chestExercises.length >= 2, 'expected multiple chest-press exercises for propagation test');
  const initial = engine.createAdaptiveProjectionState(input, projection);
  const up1 = engine.updateAdaptiveProjectionState(initial, { family: 'chest_press', projectedLoad: 180, actualLoad: 190, targetReps: 10, actualReps: 12 });
  const up2 = engine.updateAdaptiveProjectionState(up1, { family: 'chest_press', projectedLoad: 180, actualLoad: 192, targetReps: 10, actualReps: 12 });
  const impact = engine.simulateAdaptiveProjectionImpact(projection, up2, { fromWeek: 6 });
  assert.equal(impact.familyPropagation, true);
});

test('no propagation impact reports when only local exercise change occurred or nothing changed', () => {
  const plan = engine.buildOblueprintPlan(baseInput());
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan.meta?.progressionProjection;
  const impact = engine.simulateAdaptiveProjectionImpact(projection, plan.meta?.autoreg?.adaptiveProjectionState || {}, { fromWeek: 6 });
  assert.ok(['no_future_change', 'local_only'].includes(String(impact.scope || '')));
});

test('adaptive impact diffs stay visible with before and after targets', () => {
  const input = baseInput({ priorityGroups: ['Chest', 'Shoulders'], daysPerWeek: 4, preferredDays: ['Mo', 'Tu', 'Th', 'Fr'] });
  const plan = engine.buildOblueprintPlan(input);
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan.meta?.progressionProjection;
  const initial = engine.createAdaptiveProjectionState(input, projection);
  const up1 = engine.updateAdaptiveProjectionState(initial, { family: 'chest_press', projectedLoad: 180, actualLoad: 190, targetReps: 10, actualReps: 12 });
  const up2 = engine.updateAdaptiveProjectionState(up1, { family: 'chest_press', projectedLoad: 180, actualLoad: 192, targetReps: 10, actualReps: 12 });
  const impact = engine.simulateAdaptiveProjectionImpact(projection, up2, { fromWeek: 6 });
  assert.ok(impact.diffs.length > 0, 'expected visible future diffs');
  assert.ok(impact.diffs.every((diff) => String(diff.beforeTarget || '').length > 0 && String(diff.afterTarget || '').length > 0), 'expected before/after targets on all diffs');
});

test('route parity plans include projection metadata for website rendering', () => {
  const plan = runLiveParityCase(buildClassicProfile({
    emphasis: ['chest', 'arms', 'shoulders'],
    strength: {
      benchWeight: 225,
      lowerWeight: 315,
      hingeWeight: 405
    }
  }));
  assert.ok(plan?.meta?.progressionProjection, 'expected route parity projection metadata');
  assert.ok(Array.isArray(plan?.meta?.progressionProjection?.exerciseSummaries), 'expected projection summaries');
  assert.ok(Array.isArray(plan?.meta?.autoreg?.deloadWeeks), 'expected autoreg deload weeks');
});

test('randomized batch plans expose visible baseline and projected loads', () => {
  for (let i = 0; i < 10; i += 1) {
    const input = baseInput({
      planSeed: 9000 + i,
      daysPerWeek: 2 + (i % 5),
      preferredDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].slice(0, 2 + (i % 5)),
      primaryGoal: ['Build size', 'Cut fat', 'Recomp'][i % 3],
      experience: ['<6m', '6-24m', '2-5y', '5y+'][i % 4],
      priorityGroups: [['Chest', 'Back'], ['Shoulders', 'Arms'], ['Legs', 'Glutes'], ['Core', 'Chest']][i % 4]
    });
    const plan = engine.buildOblueprintPlan(input);
    assert.equal(plan.error, undefined, `randomized projection case ${i} failed: ${plan?.reason || plan?.error}`);
    const projection = plan.meta?.progressionProjection;
    assert.ok(projection, `randomized projection case ${i} missing progressionProjection`);
    assert.ok(Number.isFinite(Number(projection?.anchorInputs?.inputBench || projection?.anchorInputs?.bench1rm)), `randomized projection case ${i} missing bench anchor`);
    assert.ok(Array.isArray(projection?.exerciseSummaries) && projection.exerciseSummaries.length > 0, `randomized projection case ${i} missing exercise summaries`);
    assert.ok(projection.exerciseSummaries.some((entry) => Number.isFinite(Number(entry?.week1Load)) || Number.isFinite(Number(entry?.startingLoad))), `randomized projection case ${i} missing visible loads`);
  }
});

test('working-weight fallback derives anchors when explicit PR fields are absent', () => {
  const raw = baseInput({
    bench: null,
    squat: null,
    deadlift: null,
    benchWeight: 185,
    benchReps: 8,
    benchVariation: 'Incline DB Bench',
    lowerWeight: 275,
    lowerReps: 6,
    lowerMovement: 'Hack Squat',
    hingeWeight: 315,
    hingeReps: 8,
    hingeMovement: 'Romanian Deadlift'
  });
  const plan = engine.buildOblueprintPlan(raw);
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const anchors = plan.meta?.progressionProjection?.anchorInputs || {};
  assert.equal(anchors.anchorSource, 'working_weight_fallback');
  assert.ok(Number.isFinite(Number(anchors.derivedBenchEstimate)), 'expected derived bench estimate');
  assert.ok(Number.isFinite(Number(anchors.derivedSquatEstimate)), 'expected derived squat estimate');
  assert.ok(Number.isFinite(Number(anchors.derivedDeadliftEstimate)), 'expected derived deadlift estimate');
});

test('route-style working-weight users no longer produce N/A anchor projections', () => {
  const coerced = trainingRoutes._private.coerceClassicBodybuildingToOblueprintPayload(buildClassicProfile({
    strength: {
      bodyweight: 205,
      benchVariation: 'Machine Chest Press',
      benchWeight: 185,
      benchReps: 8,
      lowerMovement: 'Leg Press',
      lowerWeight: 360,
      lowerReps: 10,
      hingeMovement: 'Hip Thrust',
      hingeWeight: 315,
      hingeReps: 8
    }
  }));
  const plan = engine.buildOblueprintPlan(coerced);
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan.meta?.progressionProjection || {};
  const anchors = projection.anchorInputs || {};
  assert.equal(anchors.anchorSource, 'working_weight_fallback');
  assert.ok(Number.isFinite(Number(anchors.bench1rm)), 'expected bench anchor');
  assert.ok(Number.isFinite(Number(anchors.squat1rm)), 'expected squat anchor');
  assert.ok(Number.isFinite(Number(anchors.deadlift1rm)), 'expected deadlift anchor');
  const majorLoaded = (projection.exerciseSummaries || []).filter((entry) => entry?.major && entry?.loadUnitNote !== 'bodyweight');
  assert.ok(majorLoaded.length > 0, 'expected loaded major exercises');
  assert.ok(majorLoaded.every((entry) => Number.isFinite(Number(entry?.startingLoad))), 'expected loaded major projections to resolve');
});

test('next-session decision engine increases load after fully owning the top of the range', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 205, displayTarget: '205 lb' },
    lastEntry: {
      sets: [
        { weight: 200, reps: 10 },
        { weight: 200, reps: 10 },
        { weight: 200, reps: 10 }
      ]
    }
  });
  assert.equal(result.recommendation, 'increase');
  assert.equal(result.nextTarget, '205 lb');
  assert.equal(result.confidence, 'high');
});

test('next-session decision engine holds load when performance is inside the range but not fully earned', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 205, displayTarget: '205 lb' },
    lastEntry: {
      sets: [
        { weight: 200, reps: 8 },
        { weight: 200, reps: 9 },
        { weight: 200, reps: 8 }
      ]
    }
  });
  assert.equal(result.recommendation, 'hold');
  assert.equal(result.nextTarget, '200 lb');
});

test('next-session decision engine decreases after repeated severe misses', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 205, displayTarget: '205 lb' },
    lastEntry: {
      sets: [
        { weight: 200, reps: 5 },
        { weight: 200, reps: 5 },
        { weight: 200, reps: 4 }
      ]
    },
    exerciseHistory: [{ minReps: 5 }],
    familyHistory: [{ minReps: 5 }]
  });
  assert.equal(result.recommendation, 'decrease');
  assert.equal(result.nextTarget, '195 lb');
});

test('next-session decision engine auto-triggers deload after stacked misses', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 205, displayTarget: '205 lb' },
    lastEntry: {
      sets: [
        { weight: 200, reps: 6 },
        { weight: 200, reps: 6 },
        { weight: 200, reps: 6 }
      ]
    },
    exerciseHistory: [{ minReps: 7 }, { minReps: 6 }],
    familyHistory: [{ minReps: 7 }, { minReps: 6 }, { minReps: 6 }]
  });
  assert.equal(result.recommendation, 'deload');
  assert.equal(result.deloadState, 'triggered');
});

test('next-session decision engine marks adaptive acceleration after repeated overperformance', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 205, displayTarget: '205 lb' },
    lastEntry: {
      sets: [
        { weight: 200, reps: 10 },
        { weight: 200, reps: 10 },
        { weight: 200, reps: 10 }
      ]
    },
    exerciseHistory: [{ minReps: 10 }, { minReps: 10 }],
    familyAdjustment: 1.08
  });
  assert.equal(result.recommendation, 'increase');
  assert.equal(result.adaptiveChanged, true);
});

test('bodyweight progression mode avoids fake load targets', () => {
  const result = engine.buildNextSessionRecommendation({
    mode: 'bodyweight_rep_progression',
    currentRow: { repRange: '10-15', sets: 3, tag: 'normal' },
    lastEntry: {
      sets: [
        { reps: 15 },
        { reps: 15 },
        { reps: 15 }
      ]
    }
  });
  assert.equal(result.recommendation, 'increase');
  assert.match(result.nextTarget, /reps/i);
  assert.doesNotMatch(result.nextTarget, /lb/i);
});

test('projection metadata exposes deload labeling, return targets, and classification confidence', () => {
  const plan = engine.buildOblueprintPlan(baseInput({
    experience: '5y+',
    daysPerWeek: 6,
    sessionLengthMin: '75+',
    preferredDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    priorityGroups: ['Chest', 'Back', 'Legs']
  }));
  assert.equal(plan.error, undefined, plan?.reason || plan?.error);
  const projection = plan.meta?.progressionProjection;
  assert.ok(projection?.classificationConfidence, 'expected classification confidence');
  assert.ok(projection?.classificationReason, 'expected classification reason');
  const deloadRows = (projection?.weeklyTable || []).filter((row) => String(row?.tag || '') === 'deload');
  assert.ok(deloadRows.length > 0, 'expected deload rows');
  assert.ok(deloadRows.every((row) => String(row?.deloadLabel || '').length > 0), 'expected deload labels');
  assert.ok(deloadRows.some((row) => String(row?.postDeloadReturnTarget || '').length > 0), 'expected post-deload return targets');
});

test('progression mode classification distinguishes loaded and bodyweight movements', () => {
  assert.equal(
    engine.progressionModeForExercise({ name: 'Bench Press', requiredEquipment: ['barbell'] }),
    'external_load'
  );
  assert.equal(
    engine.progressionModeForExercise({ name: 'Plank', requiredEquipment: ['bodyweight'] }),
    'bodyweight_tempo_progression'
  );
  assert.equal(
    engine.progressionModeForExercise({ name: 'Push Up', requiredEquipment: ['bodyweight'] }),
    'bodyweight_rep_progression'
  );
});

test('exact exercise history beats generic movement family in decision source hierarchy', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Cable Row', canonicalExerciseId: 'cable-row', projectionFamily: 'horizontal_pull' },
    exactRecords: [{ exerciseName: 'Cable Row', canonicalExerciseId: 'cable-row' }],
    candidateRecords: [{ exerciseName: 'Romanian Deadlift', projectionFamily: 'hinge_pattern' }]
  });
  assert.equal(resolved.decisionSource, 'exact_exercise');
  assert.equal(resolved.decisionSourceExercise, 'Cable Row');
});

test('close variant beats generic family in decision source hierarchy', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Chest-Supported Dumbbell Row', canonicalExerciseId: 'chest-supported-dumbbell-row', projectionFamily: 'horizontal_pull' },
    exactRecords: [],
    candidateRecords: [
      { exerciseName: 'Dumbbell Incline Row', projectionFamily: 'horizontal_pull' },
      { exerciseName: 'Cable Row', projectionFamily: 'horizontal_pull' }
    ]
  });
  assert.equal(resolved.decisionSource, 'close_variant');
  assert.equal(resolved.decisionSourceExercise, 'Dumbbell Incline Row');
});

test('bench press to medium-grip bench press is labeled close_variant', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Barbell Bench Press', canonicalExerciseId: 'barbell-bench-press', projectionFamily: 'chest_press' },
    exactRecords: [],
    candidateRecords: [{ exerciseName: 'Barbell Bench Press - Medium Grip', projectionFamily: 'chest_press' }]
  });
  assert.equal(resolved.decisionSource, 'close_variant');
  assert.equal(resolved.decisionSourceExercise, 'Barbell Bench Press - Medium Grip');
});

test('back squat to back squat volume is labeled close_variant', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Back Squat', canonicalExerciseId: 'back-squat', projectionFamily: 'squat_pattern' },
    exactRecords: [],
    candidateRecords: [{ exerciseName: 'Back Squat (Volume)', projectionFamily: 'squat_pattern' }]
  });
  assert.equal(resolved.decisionSource, 'close_variant');
  assert.equal(resolved.decisionSourceExercise, 'Back Squat (Volume)');
});

test('decisionSourceExercise is never undefined', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 135, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 140, displayTarget: '140 lb' },
    lastEntry: { sets: [{ weight: 135, reps: 8 }, { weight: 135, reps: 8 }, { weight: 135, reps: 8 }] },
    decisionSource: 'movement_family',
    decisionSourceExercise: undefined
  });
  assert.equal(typeof result.decisionSourceExercise, 'string');
  assert.notEqual(result.decisionSourceExercise, '');
  assert.notEqual(result.decisionSourceExercise.toLowerCase(), 'undefined');
});

test('exact exercise source prints the exact exercise name', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Barbell Hip Thrust', canonicalExerciseId: 'barbell-hip-thrust', projectionFamily: 'hinge_pattern' },
    exactRecords: [{ exerciseName: 'Barbell Hip Thrust', canonicalExerciseId: 'barbell-hip-thrust' }],
    candidateRecords: [{ exerciseName: 'Romanian Deadlift', projectionFamily: 'hinge_pattern' }]
  });
  assert.equal(resolved.decisionSource, 'exact_exercise');
  assert.equal(resolved.decisionSourceExercise, 'Barbell Hip Thrust');
});

test('romanian deadlift to barbell glute bridge is not labeled close_variant', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Barbell Glute Bridge', canonicalExerciseId: 'barbell-glute-bridge', projectionFamily: 'hinge_pattern' },
    exactRecords: [],
    candidateRecords: [{ exerciseName: 'Romanian Deadlift', projectionFamily: 'hinge_pattern' }]
  });
  assert.equal(resolved.decisionSource, 'movement_family');
  assert.equal(resolved.decisionSourceExercise, 'Romanian Deadlift');
});

test('machine chest press to incline dumbbell press is not labeled close_variant', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Incline Dumbbell Press', canonicalExerciseId: 'incline-dumbbell-press', projectionFamily: 'chest_press' },
    exactRecords: [],
    candidateRecords: [{ exerciseName: 'Machine Chest Press', projectionFamily: 'chest_press' }]
  });
  assert.notEqual(resolved.decisionSource, 'close_variant');
  assert.equal(resolved.decisionSource, 'movement_family');
});

test('broad-family fallback gets labeled movement_family', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Incline Dumbbell Press', canonicalExerciseId: 'incline-dumbbell-press', projectionFamily: 'chest_press' },
    exactRecords: [],
    candidateRecords: [{ exerciseName: 'Machine Chest Press', projectionFamily: 'chest_press' }]
  });
  assert.equal(resolved.decisionSource, 'movement_family');
  assert.equal(resolved.decisionSourceExercise, 'Machine Chest Press');
});

test('no-signal fallback gets labeled anchor_fallback with a visible label', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Plank', canonicalExerciseId: 'plank', projectionFamily: 'core_stability' },
    exactRecords: [],
    candidateRecords: [],
    anchorLabel: ''
  });
  assert.equal(resolved.decisionSource, 'anchor_fallback');
  assert.equal(resolved.decisionSourceExercise, 'Anchor fallback');
});

test('unrelated hinge data does not drive row recommendation when better upper-pull data exists', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Cable Row', canonicalExerciseId: 'cable-row', projectionFamily: 'horizontal_pull' },
    exactRecords: [],
    candidateRecords: [
      { exerciseName: 'Romanian Deadlift', projectionFamily: 'hinge_pattern' },
      { exerciseName: 'Chest-Supported Dumbbell Row', projectionFamily: 'horizontal_pull' }
    ]
  });
  assert.notEqual(resolved.decisionSourceExercise, 'Romanian Deadlift');
  assert.equal(resolved.decisionSourceExercise, 'Chest-Supported Dumbbell Row');
});

test('unrelated bench data does not drive shoulder-press recommendation when better shoulder data exists', () => {
  const resolved = engine.resolveDecisionSourceHierarchy({
    exercise: { name: 'Barbell Shoulder Press', canonicalExerciseId: 'barbell-shoulder-press', projectionFamily: 'shoulder_press' },
    exactRecords: [],
    candidateRecords: [
      { exerciseName: 'Bench Press', projectionFamily: 'chest_press' },
      { exerciseName: 'Seated Military Press', projectionFamily: 'shoulder_press' }
    ]
  });
  assert.notEqual(resolved.decisionSourceExercise, 'Bench Press');
  assert.equal(resolved.decisionSourceExercise, 'Seated Military Press');
});

test('consistency guard forces increase to produce a higher next target', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 200, displayTarget: '200 lb' },
    lastEntry: { sets: [{ weight: 200, reps: 10 }, { weight: 200, reps: 10 }, { weight: 200, reps: 10 }] },
    decisionSource: 'exact_exercise',
    decisionSourceExercise: 'Bench Press'
  });
  assert.equal(result.recommendation, 'increase');
  assert.equal(result.nextTarget, '205 lb');
});

test('consistency guard forces hold to keep the same next target', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 205, displayTarget: '205 lb' },
    lastEntry: { sets: [{ weight: 200, reps: 8 }, { weight: 200, reps: 8 }, { weight: 200, reps: 9 }] },
    decisionSource: 'exact_exercise',
    decisionSourceExercise: 'Bench Press'
  });
  assert.equal(result.recommendation, 'hold');
  assert.equal(result.nextTarget, '200 lb');
});

test('consistency guard forces decrease to lower the next target', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 200, displayTarget: '200 lb' },
    lastEntry: { sets: [{ weight: 200, reps: 5 }, { weight: 200, reps: 5 }, { weight: 200, reps: 4 }] },
    exerciseHistory: [{ minReps: 5 }],
    familyHistory: [{ minReps: 5 }],
    decisionSource: 'exact_exercise',
    decisionSourceExercise: 'Bench Press'
  });
  assert.equal(result.recommendation, 'decrease');
  assert.equal(result.nextTarget, '195 lb');
});

test('deload produces a clearly reduced deload target', () => {
  const result = engine.buildNextSessionRecommendation({
    exercise: { projectionIncrement: 5 },
    mode: 'external_load',
    currentRow: { targetLoad: 200, repRange: '8-10', sets: 3, tag: 'normal' },
    nextRow: { targetLoad: 200, displayTarget: '200 lb' },
    lastEntry: { sets: [{ weight: 200, reps: 6 }, { weight: 200, reps: 6 }, { weight: 200, reps: 6 }] },
    exerciseHistory: [{ minReps: 7 }, { minReps: 6 }],
    familyHistory: [{ minReps: 7 }, { minReps: 6 }, { minReps: 6 }],
    decisionSource: 'movement_family',
    decisionSourceExercise: 'Incline Dumbbell Press'
  });
  assert.equal(result.recommendation, 'deload');
  assert.ok(Number(String(result.nextTarget).replace(/[^0-9.]+/g, '')) < 200);
  assert.equal(result.decisionSource, 'movement_family');
  assert.equal(result.decisionSourceExercise, 'Incline Dumbbell Press');
});
