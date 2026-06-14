const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../generator/trainingEngine.oblueprint');
const trainingRoutes = require('../core/trainingRoutes');
const { POWERBUILDING_PRIORITY_MATRIX } = require('./powerbuilding.priority.matrix.test');

const SESSION_EXERCISE_CAP = {
  '30': 4,
  '45': 5,
  '60': 6,
  '75+': 7
};

function buildLivePlan(payload) {
  const direct = engine.buildOblueprintPlan(payload, { fastBuild: true });
  if (!direct?.error) return { plan: direct, source: 'direct' };
  const routed = trainingRoutes._private.buildOblueprintPlanWithFallback(payload);
  if (routed?.error) {
    return { error: routed.error, source: 'fallback' };
  }
  return { plan: routed.plan, source: 'fallback' };
}

function clonePayload(payload, overrides = {}) {
  return {
    ...payload,
    ...overrides,
    priorityGroups: Array.isArray(overrides.priorityGroups) ? overrides.priorityGroups.slice() : Array.isArray(payload.priorityGroups) ? payload.priorityGroups.slice() : [],
    movementsToAvoid: Array.isArray(overrides.movementsToAvoid) ? overrides.movementsToAvoid.slice() : Array.isArray(payload.movementsToAvoid) ? payload.movementsToAvoid.slice() : [],
    preferredDays: Array.isArray(overrides.preferredDays) ? overrides.preferredDays.slice() : Array.isArray(payload.preferredDays) ? payload.preferredDays.slice() : [],
    equipmentAccess: Array.isArray(overrides.equipmentAccess) ? overrides.equipmentAccess.slice() : Array.isArray(payload.equipmentAccess) ? payload.equipmentAccess.slice() : [],
    painAreas: Array.isArray(overrides.painAreas) ? overrides.painAreas.slice() : Array.isArray(payload.painAreas) ? payload.painAreas.slice() : [],
    painProfilesByArea: overrides.painProfilesByArea ? { ...overrides.painProfilesByArea } : { ...(payload.painProfilesByArea || {}) }
  };
}

function flattenExercises(plan) {
  return (plan?.weeks || []).flatMap((week) => (week.days || []).flatMap((day) => (day.exercises || []).map((exercise) => ({ ...exercise, _dayType: day.dayType, _day: day.day }))));
}

function firstWeek(plan) {
  return plan?.weeks?.[0] || { days: [] };
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function canonicalPriority(value) {
  const key = normalizeName(value);
  if (key === 'chest') return 'Chest';
  if (key === 'back') return 'Back';
  if (key === 'legs' || key === 'quads' || key === 'quadriceps') return 'Legs';
  if (key === 'glutes' || key === 'hamstrings/glutes' || key === 'hamstrings & glutes' || key === 'hamstrings and glutes') return 'Glutes';
  if (key === 'shoulders' || key === 'shoulder') return 'Shoulders';
  if (key === 'arms' || key === 'arm' || key === 'biceps' || key === 'triceps') return 'Arms';
  if (key === 'core' || key === 'abs') return 'Core';
  if (key === 'calves' || key === 'calf') return 'Calves';
  return String(value || '').trim();
}

function dayExerciseCount(day) {
  return Array.isArray(day?.exercises) ? day.exercises.length : 0;
}

function totalSets(plan, predicate = null) {
  return flattenExercises(plan).reduce((sum, exercise) => {
    if (predicate && !predicate(exercise)) return sum;
    return sum + (Number(exercise?.sets || 0) || 0);
  }, 0);
}

function firstWeekExercises(plan) {
  return flattenExercises({ weeks: [firstWeek(plan)] });
}

function isStrengthAnchor(exercise) {
  return String(exercise?.style || '') === 'Compound'
    && /rep-first progression/i.test(String(exercise?.progressionRule || ''))
    && /3-5|4-6|5-8/.test(String(exercise?.reps || ''));
}

function isBenchLike(exercise) {
  const name = normalizeName(exercise?.name);
  return (
    String(exercise?.pattern || '').toLowerCase() === 'horizontalpush'
    || /\b(bench|chest press|incline press|decline press)\b/.test(name)
  );
}

function isSquatLike(exercise) {
  const name = normalizeName(exercise?.name);
  return (
    String(exercise?.pattern || '').toLowerCase() === 'squat'
    || /\b(squat|leg press|hack squat)\b/.test(name)
  );
}

function isHingeLike(exercise) {
  const name = normalizeName(exercise?.name);
  return (
    String(exercise?.pattern || '').toLowerCase() === 'hinge'
    || /\b(deadlift|romanian deadlift|rdl|hip thrust|glute bridge|stiff[- ]?leg)\b/.test(name)
  );
}

function isPullCompound(exercise) {
  const name = normalizeName(exercise?.name);
  return String(exercise?.style || '') === 'Compound'
    && (
      /pull/i.test(String(exercise?.pattern || ''))
      || /\b(row|pulldown|pull-up|pull up|chin-up|chin up|high row)\b/.test(name)
    );
}

function directPrioritySets(plan, priority) {
  const key = canonicalPriority(priority);
  return totalSets(plan, (exercise) => {
    const primary = canonicalPriority(exercise?.primary || exercise?.muscleTarget || '');
    if (key === 'Chest') return primary === 'Chest' || isBenchLike(exercise);
    if (key === 'Back') return primary === 'Back' || isPullCompound(exercise);
    if (key === 'Legs') return primary === 'Legs' || isSquatLike(exercise);
    if (key === 'Glutes') return primary === 'Glutes' || isHingeLike(exercise);
    if (key === 'Shoulders') return primary === 'Shoulders' || Boolean(exercise?.lateralDeltPattern) || Boolean(exercise?.rearDeltPattern) || Boolean(exercise?.shoulderPressPattern);
    if (key === 'Arms') return primary === 'Arms' || String(exercise?.directArmType || '').toLowerCase() !== 'none';
    if (key === 'Calves') return Boolean(exercise?.directCalf);
    if (key === 'Core') return Boolean(exercise?.directAb);
    return false;
  });
}

function requiredEquipmentViolations(plan, forbiddenToken) {
  return flattenExercises(plan).filter((exercise) => Array.isArray(exercise?.requiredEquipment) && exercise.requiredEquipment.includes(forbiddenToken));
}

function riskyPressingCount(plan) {
  return flattenExercises(plan).filter((exercise) => Boolean(exercise?.shoulderPressPattern)).length;
}

function riskyElbowWristCount(plan) {
  return flattenExercises(plan).filter((exercise) => Boolean(exercise?.wristExtensionHeavy) || Boolean(exercise?.skullcrusherLike)).length;
}

function axialLoadingCount(plan) {
  return flattenExercises(plan).filter((exercise) => Boolean(exercise?.axialLoadHigh) && String(exercise?.style || '') === 'Compound').length;
}

function deepKneeHipStressCount(plan) {
  return flattenExercises(plan).filter((exercise) => Boolean(exercise?.deepKneeFlexionHigh) || Boolean(exercise?.forwardKneeTravelHigh) || Boolean(exercise?.deepHipFlexionHigh)).length;
}

function avoidedMovementViolations(plan, movement) {
  const token = normalizeName(movement);
  return flattenExercises(plan).filter((exercise) => normalizeName(exercise?.name) === token);
}

function countAnchorDays(plan, predicate) {
  return (firstWeek(plan).days || []).filter((day) => (day.exercises || []).some(predicate)).length;
}

function countPatternDays(plan, predicate) {
  return (firstWeek(plan).days || []).filter((day) => (day.exercises || []).some(predicate)).length;
}

function lowerHeavyDayIndexes(plan) {
  return (firstWeek(plan).days || []).reduce((acc, day, index) => {
    if ((day.exercises || []).some((exercise) => isSquatLike(exercise) || isHingeLike(exercise))) acc.push(index);
    return acc;
  }, []);
}

function expectedEmphasisKey(entry) {
  const expected = normalizeName(entry?.inferredStrengthEmphasis?.primary);
  if (expected.startsWith('bench')) return 'bench';
  if (expected.startsWith('squat')) return 'squat';
  if (expected.startsWith('hinge') || expected.startsWith('deadlift')) return 'hinge';
  return 'balanced';
}

function expectInferenceSignal(normalized, entry) {
  const profile = normalized?.profile?.powerbuilding || {};
  const expected = expectedEmphasisKey(entry);
  const scores = profile?.scores || {};
  const expectedScore = Number(scores[expected] || 0);
  const highestScore = Math.max(Number(scores.bench || 0), Number(scores.squat || 0), Number(scores.hinge || 0));
  if (expected === 'balanced') {
    assert.ok(true);
    return;
  }
  const payload = entry?.payload || {};
  const painConflict =
    (expected === 'bench' && (payload.painAreas || []).some((area) => ['Shoulder', 'Elbow', 'Wrist'].includes(area)))
    || (expected === 'squat' && (payload.painAreas || []).some((area) => ['Knee', 'Hip', 'Back'].includes(area)))
    || (expected === 'hinge' && (payload.painAreas || []).some((area) => ['Back', 'Hip'].includes(area)));
  const avoidConflict =
    (expected === 'bench' && (payload.movementsToAvoid || []).includes('bench press'))
    || (expected === 'squat' && (payload.movementsToAvoid || []).includes('squat'))
    || (expected === 'hinge' && (payload.movementsToAvoid || []).includes('deadlift'));
  if (painConflict || avoidConflict) return;
  assert.ok(expectedScore >= highestScore - 4, `${entry.title}: expected ${expected} to remain a top inference signal`);
}

function expectIdentity(plan, aestheticPlan, entry) {
  const exercises = flattenExercises(plan);
  assert.ok(exercises.some(isStrengthAnchor), `${entry.title}: missing strength-focused anchors`);
  assert.ok(exercises.filter((exercise) => String(exercise?.style || '') === 'Isolation').length >= 2, `${entry.title}: missing hypertrophy accessories`);
  const pbSignature = firstWeek(plan).days.map((day) => `${day.dayType}:${day.exercises?.[0]?.reps || ''}:${day.exercises?.[0]?.progressionRule || ''}`).join('|');
  const bbSignature = firstWeek(aestheticPlan).days.map((day) => `${day.dayType}:${day.exercises?.[0]?.reps || ''}:${day.exercises?.[0]?.progressionRule || ''}`).join('|');
  assert.notEqual(pbSignature, bbSignature, `${entry.title}: powerbuilding output looks identical to aesthetic bodybuilding`);
}

function expectAnchorBehavior(plan, entry) {
  const anchorDays = (firstWeek(plan).days || []).filter((day) => isStrengthAnchor(day.exercises?.[0]));
  const minAnchors = (firstWeek(plan).days || []).length >= 4 ? 2 : 1;
  assert.ok(anchorDays.length >= minAnchors, `${entry.title}: expected strength anchors to appear early in the session`);
  anchorDays.forEach((day) => {
    const first = day.exercises[0];
    assert.ok(/3-5|4-6|5-8/.test(String(first?.reps || '')), `${entry.title}: ${day.dayType} top slot should use strength-style reps`);
    assert.notEqual(String(first?.rir || ''), '0-2', `${entry.title}: ${day.dayType} anchor should not be taken to reckless failure`);
  });
}

function expectPriorityProtection(plan, payload, entry) {
  const priorities = Array.isArray(payload.priorityGroups) ? payload.priorityGroups.slice(0, 3).map(canonicalPriority) : [];
  if (!priorities.length) return;
  const first = priorities[0];
  const second = priorities[1];
  const third = priorities[2];
  const firstSets = directPrioritySets(plan, first);
  const secondSets = second ? directPrioritySets(plan, second) : 0;
  const thirdSets = third ? directPrioritySets(plan, third) : 0;
  assert.ok(firstSets > 0, `${entry.title}: priority 1 disappeared`);
  if (second) assert.ok(secondSets > 0 || thirdSets > 0, `${entry.title}: secondary priorities disappeared`);
  if (priorities.includes('Calves')) assert.ok(flattenExercises(plan).some((exercise) => Boolean(exercise?.directCalf)), `${entry.title}: calves disappeared`);
  if (priorities.includes('Core')) assert.ok(flattenExercises(plan).some((exercise) => Boolean(exercise?.directAb)), `${entry.title}: core disappeared`);
}

function expectEquipmentRules(plan, payload, entry, source) {
  const access = new Set((payload.equipmentAccess || []).map((value) => normalizeName(value)));
  if (source !== 'direct') return;
  if (!access.has('barbell')) assert.equal(requiredEquipmentViolations(plan, 'barbell').length, 0, `${entry.title}: barbell movement leaked in`);
  if (!access.has('cable')) assert.equal(requiredEquipmentViolations(plan, 'cable').length, 0, `${entry.title}: cable movement leaked in`);
  if (!access.has('machine') && !access.has('machines')) assert.equal(requiredEquipmentViolations(plan, 'machine').length, 0, `${entry.title}: machine movement leaked in`);
}

function expectPainRules(plan, payload, entry) {
  const profiles = payload.painProfilesByArea || {};
  const hasRecentHighPain = Object.values(profiles).some((profile) => Number(profile?.severity || 0) >= 6 && String(profile?.recency || '') === 'Recent');
  if (!hasRecentHighPain) return;
  const weekPlan = { weeks: [firstWeek(plan)] };
  const controlPayload = clonePayload(payload, {
    painAreas: [],
    painProfilesByArea: {},
    planSeed: Number(payload.planSeed || 0) + 3000
  });
  const control = buildLivePlan(controlPayload);
  assert.equal(control?.error, undefined, `${entry.title}: pain-free control comparison failed`);
  const controlWeekPlan = { weeks: [firstWeek(control.plan)] };
  if (payload.painAreas?.includes('Shoulder') && hasRecentHighPain) {
    assert.ok(riskyPressingCount(weekPlan) <= riskyPressingCount(controlWeekPlan), `${entry.title}: shoulder pain did not reduce pressing stress enough`);
  }
  if ((payload.painAreas?.includes('Elbow') || payload.painAreas?.includes('Wrist')) && hasRecentHighPain) {
    assert.ok(riskyElbowWristCount(weekPlan) <= 2, `${entry.title}: elbow/wrist pain did not reduce straight-bar or extension stress enough`);
  }
  if (payload.painAreas?.includes('Back') && hasRecentHighPain) {
    assert.ok(axialLoadingCount(weekPlan) <= axialLoadingCount(controlWeekPlan), `${entry.title}: back pain did not reduce axial loading enough`);
  }
  if ((payload.painAreas?.includes('Knee') || payload.painAreas?.includes('Hip')) && hasRecentHighPain) {
    assert.ok(deepKneeHipStressCount(weekPlan) <= deepKneeHipStressCount(controlWeekPlan), `${entry.title}: knee/hip pain did not reduce deep lower-body stress enough`);
  }
}

function expectRecoveryRules(plan, payload, entry) {
  const cap = SESSION_EXERCISE_CAP[String(payload.sessionLengthMin || '60')] || 6;
  (firstWeek(plan).days || []).forEach((day) => {
    assert.ok(dayExerciseCount(day) <= cap + 2, `${entry.title}: ${day.dayType} exceeds realistic session cap for ${payload.sessionLengthMin} minutes`);
  });
  if (Number(payload.sleepHours || 0) <= 5 || String(payload.stress || '') === 'High') {
    const controlPayload = clonePayload(payload, {
      sleepHours: 8,
      stress: 'Low',
      planSeed: Number(payload.planSeed || 0) + 1000
    });
    const control = buildLivePlan(controlPayload);
    assert.equal(control?.error, undefined, `${entry.title}: control recovery comparison failed`);
    assert.ok(
      totalSets(plan, (exercise) => String(exercise?.style || '') === 'Isolation') <= totalSets(control.plan, (exercise) => String(exercise?.style || '') === 'Isolation'),
      `${entry.title}: low recovery did not reduce accessory density`
    );
  }
  if (String(payload.primaryGoal || '') === 'Cut fat') {
    const controlPayload = clonePayload(payload, {
      primaryGoal: 'Build size',
      planSeed: Number(payload.planSeed || 0) + 2000
    });
    const control = buildLivePlan(controlPayload);
    assert.equal(control?.error, undefined, `${entry.title}: build-size control comparison failed`);
    assert.ok(totalSets(plan) <= totalSets(control.plan), `${entry.title}: cut-fat plan should be more conservative than build-size`);
  }
}

function expectAvoidedPatterns(plan, payload, entry) {
  const week = { weeks: [firstWeek(plan)] };
  (payload.movementsToAvoid || []).forEach((movement) => {
    const violations = avoidedMovementViolations(week, movement);
    assert.equal(violations.length, 0, `${entry.title}: avoided movement still present: ${movement}`);
  });
}

function expectScheduleRules(plan, payload, entry) {
  const days = firstWeek(plan).days || [];
  const actualDays = days.map((day) => day.day).filter(Boolean);
  if (actualDays.length) {
    assert.deepEqual(actualDays, payload.preferredDays.slice(0, actualDays.length), `${entry.title}: preferred days were not respected when day labels were available`);
  }
  if (entry.id === 40) {
    const lowerIndexes = lowerHeavyDayIndexes(plan);
    for (let i = 1; i < lowerIndexes.length; i += 1) {
      assert.ok(lowerIndexes[i] - lowerIndexes[i - 1] > 1, `${entry.title}: heavy lower days were stacked too closely`);
    }
  }
  if (payload.priorityGroups.includes('Chest') && payload.priorityGroups.includes('Arms') && payload.priorityGroups.includes('Shoulders') && days.length >= 4) {
    const benchDay = days.findIndex((day) => (day.exercises || []).some(isBenchLike));
    if (benchDay >= 0 && benchDay < days.length - 1) {
      const nextDay = days[benchDay + 1];
      const tricepsFrontDeltSets = (nextDay.exercises || []).reduce((sum, exercise) => {
        const shoulderPress = Boolean(exercise?.shoulderPressPattern);
        const triceps = String(exercise?.muscleTarget || '') === 'Arms';
        return sum + ((shoulderPress || triceps) ? Number(exercise?.sets || 0) || 0 : 0);
      }, 0);
      assert.ok(tricepsFrontDeltSets <= 10, `${entry.title}: heavy bench sat too close to high triceps/front-delt volume`);
    }
  }
}

function expectPatternCoverage(plan, payload, entry) {
  const weekExercises = firstWeekExercises(plan);
  const benchDays = countPatternDays(plan, isBenchLike);
  const squatDays = countPatternDays(plan, isSquatLike);
  const hingeDays = countPatternDays(plan, isHingeLike);
  const pullDays = countPatternDays(plan, isPullCompound);
  const lowerAnchorDays = countPatternDays(plan, (exercise) => isSquatLike(exercise) || isHingeLike(exercise));

  assert.ok(benchDays >= 1 || flattenExercises(plan).some(isStrengthAnchor), `${entry.title}: missing upper strength exposure`);
  assert.ok(lowerAnchorDays >= 1, `${entry.title}: missing lower strength exposure`);
  if (payload.daysPerWeek >= 3 && !(payload.movementsToAvoid || []).includes('bench press')) {
    assert.ok(pullDays >= 1 || weekExercises.some(isPullCompound), `${entry.title}: missing meaningful pull compound support`);
  }

  if (payload.daysPerWeek >= 3) {
    assert.ok(squatDays >= 1 || hingeDays >= 1, `${entry.title}: missing a real lower anchor`);
  }
  if (payload.daysPerWeek >= 4 && !payload.movementsToAvoid.includes('deadlift') && !(payload.painAreas || []).includes('Back')) {
    assert.ok(hingeDays >= 1 || weekExercises.some(isHingeLike), `${entry.title}: hinge intent disappeared from a 4+ day week`);
  }
  if (payload.daysPerWeek >= 4 && !payload.movementsToAvoid.includes('squat') && !(payload.painAreas || []).some((area) => ['Knee', 'Hip'].includes(area))) {
    assert.ok(squatDays >= 1 || weekExercises.some(isSquatLike), `${entry.title}: squat intent disappeared from a 4+ day week`);
  }
}

function expectAestheticDifference(plan, entry) {
  const weekExercises = firstWeekExercises(plan);
  const compounds = weekExercises.filter((exercise) => String(exercise?.style || '') === 'Compound').length;
  const isolations = weekExercises.filter((exercise) => String(exercise?.style || '') === 'Isolation').length;
  assert.ok(compounds >= 3, `${entry.title}: powerbuilding week lost its compound backbone`);
  assert.ok(isolations >= 2, `${entry.title}: powerbuilding week lost its hypertrophy accessory lane`);
}

test('powerbuilding execution matrix drives real plans through the live generator', async (t) => {
  for (const entry of POWERBUILDING_PRIORITY_MATRIX) {
    await t.test(`${entry.id}. ${entry.title}`, () => {
      const normalized = engine.normalizeUserInput(entry.payload);
      assert.equal(normalized?.error, undefined, `${entry.title}: normalization failed: ${normalized?.reason || normalized?.error}`);

      const live = buildLivePlan(entry.payload);
      assert.equal(live?.error, undefined, `${entry.title}: plan build failed: ${live?.error?.reason || live?.error?.error || live?.error?.message}`);
      const plan = live.plan;

      assert.equal((firstWeek(plan).days || []).length, entry.payload.daysPerWeek, `${entry.title}: day count mismatch`);

      const aestheticControl = buildLivePlan(clonePayload(entry.payload, {
        trainingFeel: 'Aesthetic bodybuilding',
        focus: entry.payload.focus === 'Strength' ? 'Aesthetic' : entry.payload.focus,
        closeToFailure: entry.payload.closeToFailure,
        planSeed: Number(entry.payload.planSeed || 0) + 5000
      }));
      assert.equal(aestheticControl?.error, undefined, `${entry.title}: aesthetic control build failed`);

      expectInferenceSignal(normalized, entry);
      expectIdentity(plan, aestheticControl.plan, entry);
      expectAestheticDifference(plan, entry);
      expectAnchorBehavior(plan, entry);
      expectPatternCoverage(plan, entry.payload, entry);
      expectPriorityProtection(plan, entry.payload, entry);
      expectEquipmentRules(plan, entry.payload, entry, live.source);
      expectPainRules(plan, entry.payload, entry);
      expectRecoveryRules(plan, entry.payload, entry);
      expectAvoidedPatterns(plan, entry.payload, entry);
      expectScheduleRules(plan, entry.payload, entry);

      assert.ok(flattenExercises(plan).some((exercise) => String(exercise?.style || '') === 'Isolation'), `${entry.title}: isolation accessory work disappeared`);
    });
  }
});
