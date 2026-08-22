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
  /* A strength anchor is a heavy compound on a strength progression. The old
     predicate required rep RANGES ("3-5") in the reps text, but the ladder
     has printed a single climbing number for a long time ("4" does not
     contain "4-6") — so this matched nothing and all 40 matrix cases failed
     on "missing strength-focused anchors" regardless of the plan's content.
     Both live vocabularies count: the engine path's "Rep-first progression"
     rule text, and the route path's progressionState movement class. */
  if (String(exercise?.style || '') !== 'Compound') return false;
  const engineAnchor = /rep-first progression/i.test(String(exercise?.progressionRule || ''));
  const stateClass = String(exercise?.progression?.movementClass || '');
  const stateAnchor = stateClass === 'lower_compound' || stateClass === 'upper_compound';
  if (!engineAnchor && !stateAnchor) return false;
  const repsText = String(exercise?.reps || '').trim();
  const repsNum = Number(repsText);
  return Number.isFinite(repsNum) ? repsNum <= 8 : /3-5|4-6|5-8/.test(repsText);
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

function isSafePosteriorSubstitute(exercise) {
  const name = normalizeName(exercise?.name);
  return /\b(glute ham raise|leg curl|hamstring curl|hip thrust|glute bridge|pull[- ]?through|back extension|hyperextension)\b/.test(name);
}

function isBicepsIsolation(exercise) {
  const name = normalizeName(exercise?.name);
  return String(exercise?.directArmType || '').toLowerCase() === 'biceps'
    || (String(exercise?.style || '') === 'Isolation' && /\b(curl|preacher)\b/.test(name) && !/\btriceps\b/.test(name));
}

function isTricepsIsolation(exercise) {
  const name = normalizeName(exercise?.name);
  return String(exercise?.directArmType || '').toLowerCase() === 'triceps'
    || (String(exercise?.style || '') === 'Isolation' && /\b(triceps|pushdown|extension|skullcrusher)\b/.test(name));
}

function isShoulderAccessory(exercise) {
  return Boolean(exercise?.lateralDeltPattern) || Boolean(exercise?.rearDeltPattern);
}

function isCompound(exercise) {
  return String(exercise?.style || '') === 'Compound';
}

function isAwkwardPowerbuildingName(name) {
  return /\b(inner biceps|flexor|close-grip concentration barbell curl|rocking|bench reverse crunch|with head on bench|external rotation|low-pulley)\b/.test(normalizeName(name));
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
    if (key === 'Glutes') return primary === 'Glutes' || isHingeLike(exercise) || isSafePosteriorSubstitute(exercise);
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

function dayIndexOfFirst(day, predicate) {
  return (day?.exercises || []).findIndex(predicate);
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
  const severePain = Object.values(entry?.payload?.painProfilesByArea || {}).some((profile) => Number(profile?.severity || 0) >= 6 && String(profile?.recency || '') === 'Recent');
  const blockedPatterns = Array.isArray(entry?.payload?.movementsToAvoid) && entry.payload.movementsToAvoid.length >= 2;
  const minAnchors = severePain || blockedPatterns
    ? 1
    : (firstWeek(plan).days || []).length >= 4 ? 2 : 1;
  assert.ok(anchorDays.length >= minAnchors, `${entry.title}: expected strength anchors to appear early in the session`);
  anchorDays.forEach((day) => {
    const first = day.exercises[0];
    // State vocabulary: reps are a single number climbing repMin..repMax
    // (lower 5-8, upper 6-8), not a printed range.
    assert.ok(/^[3-8]$/.test(String(first?.reps || '').trim()), `${entry.title}: ${day.dayType} top slot should use strength-style reps`);
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
    painProfilesByArea: {}
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
      stress: 'Low'
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
      primaryGoal: 'Build size'
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
  const lowerPosteriorProxyDays = countPatternDays(plan, (exercise) => isSafePosteriorSubstitute(exercise) && /3-5|4-6|5-8/.test(String(exercise?.reps || '')));
  const lowerPosteriorSupportDays = countPatternDays(plan, (exercise) => isSafePosteriorSubstitute(exercise));
  const access = new Set((payload.equipmentAccess || []).map((value) => normalizeName(value)));
  const constrainedHingeEnvironment = !access.has('barbell');
  const severeRecentBackHipPain = ['Back', 'Hip'].some((area) => {
    const profile = payload?.painProfilesByArea?.[area];
    return Number(profile?.severity || 0) >= 6 && String(profile?.recency || '') === 'Recent';
  });

  assert.ok(benchDays >= 1 || flattenExercises(plan).some(isStrengthAnchor), `${entry.title}: missing upper strength exposure`);
  assert.ok(
    lowerAnchorDays >= 1 || (severeRecentBackHipPain && lowerPosteriorProxyDays >= 1),
    `${entry.title}: missing lower strength exposure`
  );
  if (payload.daysPerWeek >= 3 && !(payload.movementsToAvoid || []).includes('bench press')) {
    assert.ok(pullDays >= 1 || weekExercises.some(isPullCompound), `${entry.title}: missing meaningful pull compound support`);
  }

  if (payload.daysPerWeek >= 3) {
    assert.ok(
      squatDays >= 1 || hingeDays >= 1 || (severeRecentBackHipPain && lowerPosteriorProxyDays >= 1),
      `${entry.title}: missing a real lower anchor`
    );
  }
  if (payload.daysPerWeek >= 4 && !payload.movementsToAvoid.includes('deadlift') && !(payload.painAreas || []).includes('Back')) {
    assert.ok(
      hingeDays >= 1
      || weekExercises.some(isHingeLike)
      || ((constrainedHingeEnvironment || severeRecentBackHipPain) && (lowerPosteriorProxyDays >= 1 || lowerPosteriorSupportDays >= 1)),
      `${entry.title}: hinge intent disappeared from a 4+ day week`
    );
  }
  if (payload.daysPerWeek >= 4 && !payload.movementsToAvoid.includes('squat') && !(payload.painAreas || []).some((area) => ['Knee', 'Hip', 'Back'].includes(area))) {
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

test('powerbuilding representative sample cases remain plausible after the outlier fix', () => {
  const representativeCases = [
    {
      title: 'strength chest 4d',
      payload: {
        trainingFeel: 'Powerbuilding', primaryGoal: 'Build size', timeline: '12+ weeks', focus: 'Strength', experience: '2-5y', location: 'Commercial gym', trainingStyle: 'Balanced mix', outputStyle: 'RPE/RIR cues', closeToFailure: 'No', daysPerWeek: 4, sessionLengthMin: '60',
        priorityGroups: ['Chest', 'Shoulders', 'Arms'], movementsToAvoid: [], preferredDays: ['Mo', 'Tu', 'Th', 'Sa'], equipmentAccess: ['barbell', 'dumbbell', 'cable', 'machine', 'bench'], painAreas: [], painProfilesByArea: {}, weightLb: 190, bodyweight: 190, bench: 275, squat: 365, deadlift: 455,
        benchVariation: 'Paused bench press', benchWeight: 245, benchReps: 4, lowerMovement: 'Back squat', lowerWeight: 315, lowerReps: 5, hingeMovement: 'Conventional deadlift', hingeWeight: 405, hingeReps: 4, sleepHours: 7.5, activityLevel: 'Moderate', stress: 'Moderate', planSeed: 4101
      }
    },
    {
      title: 'strength legs 4d',
      payload: {
        trainingFeel: 'Powerbuilding', primaryGoal: 'Recomp', timeline: '12+ weeks', focus: 'Strength', experience: '2-5y', location: 'Commercial gym', trainingStyle: 'Mostly free weights', outputStyle: 'RPE/RIR cues', closeToFailure: 'No', daysPerWeek: 4, sessionLengthMin: '60',
        priorityGroups: ['Legs', 'Core', 'Calves'], movementsToAvoid: [], preferredDays: ['Mo', 'We', 'Fr', 'Sa'], equipmentAccess: ['barbell', 'dumbbell', 'machine', 'bench'], painAreas: [], painProfilesByArea: {}, weightLb: 205, bodyweight: 205, bench: 245, squat: 405, deadlift: 495,
        benchVariation: 'Competition bench press', benchWeight: 225, benchReps: 5, lowerMovement: 'Back squat', lowerWeight: 365, lowerReps: 4, hingeMovement: 'Romanian deadlift', hingeWeight: 315, hingeReps: 6, sleepHours: 7, activityLevel: 'Moderate', stress: 'Moderate', planSeed: 4102
      }
    },
    {
      title: 'strength glutes back 4d',
      payload: {
        trainingFeel: 'Powerbuilding', primaryGoal: 'Build size', timeline: '8 weeks', focus: 'Strength', experience: '2-5y', location: 'Commercial gym', trainingStyle: 'Balanced mix', outputStyle: 'RPE/RIR cues', closeToFailure: 'No', daysPerWeek: 4, sessionLengthMin: '60',
        priorityGroups: ['Glutes', 'Back', 'Core'], movementsToAvoid: [], preferredDays: ['Mo', 'Tu', 'Th', 'Fr'], equipmentAccess: ['barbell', 'dumbbell', 'cable', 'machine', 'bench'], painAreas: [], painProfilesByArea: {}, weightLb: 198, bodyweight: 198, bench: 255, squat: 355, deadlift: 475,
        benchVariation: 'Close-grip bench press', benchWeight: 225, benchReps: 5, lowerMovement: 'Front squat', lowerWeight: 275, lowerReps: 5, hingeMovement: 'Conventional deadlift', hingeWeight: 425, hingeReps: 3, sleepHours: 7.5, activityLevel: 'Moderate', stress: 'Low', planSeed: 4103
      }
    },
    {
      title: 'size chest shoulders arms 5d',
      payload: {
        trainingFeel: 'Powerbuilding', primaryGoal: 'Build size', timeline: '12+ weeks', focus: 'Size', experience: '6-24m', location: 'Commercial gym', trainingStyle: 'Balanced mix', outputStyle: 'RPE/RIR cues', closeToFailure: 'Yes', daysPerWeek: 5, sessionLengthMin: '75+',
        priorityGroups: ['Chest', 'Shoulders', 'Arms'], movementsToAvoid: [], preferredDays: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'], equipmentAccess: ['barbell', 'dumbbell', 'cable', 'machine', 'bench'], painAreas: [], painProfilesByArea: {}, weightLb: 178, bodyweight: 178, bench: 225, squat: 315, deadlift: 405,
        benchVariation: 'Incline bench press', benchWeight: 185, benchReps: 6, lowerMovement: 'High-bar squat', lowerWeight: 275, lowerReps: 6, hingeMovement: 'Romanian deadlift', hingeWeight: 275, hingeReps: 8, sleepHours: 8, activityLevel: 'Moderate', stress: 'Low', planSeed: 4104
      }
    },
    {
      title: 'aesthetic back shoulders arms 5d',
      payload: {
        trainingFeel: 'Powerbuilding', primaryGoal: 'Recomp', timeline: '8 weeks', focus: 'Aesthetic', experience: '6-24m', location: 'Commercial gym', trainingStyle: 'Mostly machines/cables', outputStyle: 'RPE/RIR cues', closeToFailure: 'Yes', daysPerWeek: 5, sessionLengthMin: '60',
        priorityGroups: ['Back', 'Shoulders', 'Arms'], movementsToAvoid: [], preferredDays: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'], equipmentAccess: ['dumbbell', 'cable', 'machine', 'bench'], painAreas: [], painProfilesByArea: {}, weightLb: 172, bodyweight: 172, bench: 185, squat: 275, deadlift: 315,
        benchVariation: 'Machine chest press', benchWeight: 160, benchReps: 8, lowerMovement: 'Hack squat', lowerWeight: 225, lowerReps: 8, hingeMovement: 'Hip thrust', hingeWeight: 275, hingeReps: 8, sleepHours: 7.5, activityLevel: 'Moderate', stress: 'Moderate', planSeed: 4105
      }
    },
    {
      title: 'beginner 3d',
      payload: {
        trainingFeel: 'Powerbuilding', primaryGoal: 'Build size', timeline: '12+ weeks', focus: 'Strength', experience: '<6m', location: 'Commercial gym', trainingStyle: 'Balanced mix', outputStyle: 'Simple sets x reps', closeToFailure: 'No', daysPerWeek: 3, sessionLengthMin: '45',
        priorityGroups: ['Chest', 'Back', 'Legs'], movementsToAvoid: [], preferredDays: ['Mo', 'We', 'Fr'], equipmentAccess: ['barbell', 'dumbbell', 'machine', 'bench'], painAreas: [], painProfilesByArea: {}, weightLb: 165, bodyweight: 165, bench: 135, squat: 185, deadlift: 225,
        benchVariation: 'Bench press', benchWeight: 115, benchReps: 5, lowerMovement: 'Goblet squat', lowerWeight: 70, lowerReps: 8, hingeMovement: 'Romanian deadlift', hingeWeight: 135, hingeReps: 6, sleepHours: 7, activityLevel: 'Light', stress: 'Moderate', planSeed: 4106
      }
    },
    {
      title: '30 minute 4d',
      payload: {
        trainingFeel: 'Powerbuilding', primaryGoal: 'Recomp', timeline: '8 weeks', focus: 'Strength', experience: '6-24m', location: 'Home', trainingStyle: 'Mostly free weights', outputStyle: 'RPE/RIR cues', closeToFailure: 'No', daysPerWeek: 4, sessionLengthMin: '30',
        priorityGroups: ['Chest', 'Back', 'Legs'], movementsToAvoid: [], preferredDays: ['Mo', 'Tu', 'Th', 'Sa'], equipmentAccess: ['barbell', 'dumbbell', 'bench'], painAreas: [], painProfilesByArea: {}, weightLb: 185, bodyweight: 185, bench: 205, squat: 295, deadlift: 365,
        benchVariation: 'Bench press', benchWeight: 185, benchReps: 4, lowerMovement: 'Back squat', lowerWeight: 255, lowerReps: 5, hingeMovement: 'Romanian deadlift', hingeWeight: 275, hingeReps: 6, sleepHours: 7, activityLevel: 'Moderate', stress: 'Moderate', planSeed: 4107
      }
    }
  ];

  for (const entry of representativeCases) {
    const live = buildLivePlan(entry.payload);
    assert.equal(live?.error, undefined, `${entry.title}: build failed`);
    assert.ok(flattenExercises(live.plan).some(isStrengthAnchor), `${entry.title}: strength anchor disappeared`);
    assert.ok(flattenExercises(live.plan).filter((exercise) => String(exercise?.style || '') === 'Isolation').length >= 2, `${entry.title}: hypertrophy accessories disappeared`);
  }
});

test('powerbuilding execution rejects unavailable equipment in the exact home beginner 30-minute route case', () => {
  const payload = {
    trainingFeel: 'Powerbuilding', primaryGoal: 'Build size', timeline: '12+ weeks', focus: 'Strength', experience: '<6m', location: 'Home', trainingStyle: 'Mostly free weights', outputStyle: 'Simple sets x reps', closeToFailure: 'No', daysPerWeek: 4, sessionLengthMin: '30',
    priorityGroups: ['Chest', 'Back', 'Legs'], movementsToAvoid: [], preferredDays: ['Mo', 'Tu', 'Th', 'Sa'], equipmentAccess: ['Bodyweight', 'Dumbbells', 'Bench'], painAreas: [], painProfilesByArea: {}, weightLb: 165, bodyweight: 165, bench: 0, squat: 0, deadlift: 0,
    benchVariation: 'Dumbbell bench press', benchWeight: 45, benchReps: 8, lowerMovement: 'Goblet squat', lowerWeight: 70, lowerReps: 8, hingeMovement: 'Dumbbell Romanian deadlift', hingeWeight: 60, hingeReps: 8, sleepHours: 7, activityLevel: 'Light', stress: 'Moderate', planSeed: 99123
  };
  const built = buildLivePlan(payload);
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'route build failed');
  assert.equal(built.source, 'direct', 'expected the route to keep a valid powerbuilding direct build instead of mutating it through fallback');
  expectEquipmentRules(built.plan, payload, { title: 'exact home beginner 30-minute route case' }, 'direct');
  const names = flattenExercises(built.plan).map((exercise) => String(exercise?.name || '').toLowerCase()).join(' | ');
  assert.ok(!/\b(cable|machine|leverage|leg press|lat pulldown|barbell)\b/.test(names), 'unavailable equipment leaked into the exact route case');
  assert.ok(flattenExercises(built.plan).some(isStrengthAnchor), 'expected a strength anchor to remain');
  assert.ok(flattenExercises(built.plan).some((exercise) => String(exercise?.style || '') === 'Isolation'), 'expected a hypertrophy accessory to remain');
  (firstWeek(built.plan).days || []).forEach((day) => {
    assert.ok(dayExerciseCount(day) <= 4, `${day.dayType}: expected a realistic 30-minute beginner movement cap`);
  });
});

test('powerbuilding hip-pain lower-priority case preserves safe posterior intent without forcing risky hinge work', () => {
  const entry = POWERBUILDING_PRIORITY_MATRIX.find((candidate) => candidate.id === 28);
  assert.ok(entry, 'expected matrix case 28 to exist');
  const built = buildLivePlan(entry.payload);
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'case 28 build failed');
  expectEquipmentRules(built.plan, entry.payload, entry, built.source === 'direct' ? 'direct' : built.source);
  const weekExercises = firstWeekExercises(built.plan);
  const names = weekExercises.map((exercise) => String(exercise?.name || '').toLowerCase()).join(' | ');
  assert.ok(
    weekExercises.some(isHingeLike) || weekExercises.some(isSafePosteriorSubstitute),
    'case 28 should preserve some posterior-chain intent'
  );
  assert.ok(!/\b(deadlift|romanian deadlift|\brdl\b|stiff[- ]?leg|good morning)\b/.test(names), 'case 28 should not force a risky deadlift-family hinge');
  assert.ok(/\b(leg curl|hamstring curl|glute ham raise|hip thrust|glute bridge|pull[- ]?through|back extension|hyperextension)\b/.test(names), 'case 28 should keep a safe posterior-chain substitute');
});

test('powerbuilding outlier now passes directly without unsafe blocked patterns', () => {
  const payload = {
    trainingFeel: 'Powerbuilding', primaryGoal: 'Cut fat', timeline: '4 weeks', focus: 'Strength', experience: '2-5y', location: 'Commercial gym', trainingStyle: 'Balanced mix', outputStyle: 'RPE/RIR cues', closeToFailure: 'No', daysPerWeek: 4, sessionLengthMin: '45',
    priorityGroups: ['Chest', 'Arms', 'Core'], movementsToAvoid: ['bench press', 'deadlift'], preferredDays: ['Mo', 'We', 'Fr', 'Sa'], equipmentAccess: ['dumbbell', 'cable', 'machine', 'bench'], painAreas: ['Shoulder', 'Back', 'Elbow'],
    painProfilesByArea: {
      Shoulder: { severity: 7, recency: 'Recent', notes: 'Overhead and wide pressing irritates it' },
      Back: { severity: 6, recency: 'Recent', notes: 'Axial loading and unsupported rows flare it' },
      Elbow: { severity: 6, recency: 'Recent', notes: 'Heavy triceps work and straight-bar curls irritate it' }
    },
    weightLb: 188, bodyweight: 188, bench: 245, squat: 335, deadlift: 425, benchVariation: 'Incline dumbbell press', benchWeight: 85, benchReps: 8, lowerMovement: 'Leg press', lowerWeight: 360, lowerReps: 8, hingeMovement: 'Hip thrust', hingeWeight: 315, hingeReps: 8, sleepHours: 5.5, activityLevel: 'High', stress: 'High', planSeed: 4108
  };
  const direct = engine.buildOblueprintPlan(payload, { fastBuild: true });
  assert.equal(direct?.error, undefined, direct?.reason || direct?.message || direct?.error);
  const names = flattenExercises(direct).map((exercise) => String(exercise?.name || '').toLowerCase()).join(' | ');
  assert.ok(flattenExercises(direct).some(isStrengthAnchor), 'outlier lost powerbuilding anchor identity');
  assert.ok(!/\bbench\b/.test(names), 'outlier leaked bench-family work');
  assert.ok(!/\b(deadlift|romanian deadlift|\brdl\b|stiff[- ]?leg)\b/.test(names), 'outlier leaked deadlift-family work');
  const lowerFocus = firstWeek(direct).days.find((day) => day.dayType === 'LowerFocus');
  assert.ok(lowerFocus, 'outlier missing LowerFocus day');
  const lowerFocusNames = (lowerFocus.exercises || []).map((exercise) => String(exercise?.name || '').toLowerCase()).join(' | ');
  assert.ok(!/\b(deadlift|romanian deadlift|\brdl\b|stiff[- ]?leg)\b/.test(lowerFocusNames), 'LowerFocus still forced deadlift-family work');
  assert.ok(/\b(leg curl|hamstring curl|glute ham raise|leg extension|hip thrust|glute bridge|pull through)\b/.test(lowerFocusNames), 'LowerFocus failed to use a safe posterior substitute');
});

test('powerbuilding 5-day abs shoulders arms case stays ordered and avoids accessory spam', () => {
  const built = buildLivePlan(clonePayload(POWERBUILDING_PRIORITY_MATRIX[4].payload, {
    priorityGroups: ['Core', 'Shoulders', 'Arms'],
    daysPerWeek: 5,
    preferredDays: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'],
    equipmentAccess: ['Barbell', 'Dumbbells', 'Cable', 'Machines', 'Bench'],
    planSeed: 88001
  }));
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'route build failed');
  const week = firstWeek(built.plan);
  week.days.forEach((day) => {
    const exercises = day.exercises || [];
    const biceps = exercises.filter(isBicepsIsolation).length;
    const triceps = exercises.filter(isTricepsIsolation).length;
    assert.ok(biceps <= 2, `${day.dayType}: too many biceps isolations`);
    assert.ok(triceps <= 2, `${day.dayType}: too many triceps isolations`);
    if (['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(String(day.dayType || ''))) {
      const firstPosterior = dayIndexOfFirst(day, (exercise) => isHingeLike(exercise) || isSafePosteriorSubstitute(exercise));
      const firstCore = dayIndexOfFirst(day, (exercise) => Boolean(exercise?.directAb));
      if (firstPosterior >= 0 && firstCore >= 0) {
        assert.ok(firstPosterior < firstCore, `${day.dayType}: core interrupted lower posterior work`);
      }
    }
  });
  assert.ok(flattenExercises(built.plan).some(isShoulderAccessory), 'shoulder priority lost lateral/rear delt work');
  assert.ok(countPatternDays(built.plan, (exercise) => Boolean(exercise?.directAb)) >= 2, 'core priority should appear across the week');
  const names = flattenExercises(built.plan).map((exercise) => String(exercise?.name || ''));
  const awkwardNames = names.filter(isAwkwardPowerbuildingName);
  assert.ok(awkwardNames.length <= 1, `too many awkward accessory names: ${awkwardNames.join(', ')}`);
  assert.ok(!names.some((name) => /\b(high cable curls|overhead cable curls|flexor incline dumbbell curls?|seated dumbbell inner biceps curl)\b/i.test(name)), 'weird curl names should not beat cleaner curl options');
  assert.ok(!names.some((name) => /\bcable bench reverse crunch\b/i.test(name)), 'awkward reverse crunch naming should not survive when cleaner core names exist');
});

test('powerbuilding chest shoulders arms case caps press spam and shows shoulder work', () => {
  const built = buildLivePlan(clonePayload(POWERBUILDING_PRIORITY_MATRIX[3].payload, {
    priorityGroups: ['Chest', 'Shoulders', 'Arms'],
    equipmentAccess: ['Barbell', 'Dumbbells', 'Cable', 'Machines', 'Bench'],
    planSeed: 88002
  }));
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'route build failed');
  firstWeek(built.plan).days.forEach((day) => {
    const exercises = day.exercises || [];
    const chestPresses = exercises.filter(isBenchLike).length;
    const overheadPresses = exercises.filter((exercise) => Boolean(exercise?.shoulderPressPattern)).length;
    assert.ok(chestPresses <= 2, `${day.dayType}: too many chest press patterns`);
    assert.ok(overheadPresses <= 1, `${day.dayType}: too many shoulder press patterns`);
  });
  const names = flattenExercises(built.plan).map((exercise) => normalizeName(exercise?.name));
  assert.ok(names.some((name) => /\blateral raise\b/.test(name)), 'shoulder priority lost lateral delt work');
  assert.ok(flattenExercises(built.plan).some(isShoulderAccessory), 'shoulder priority lost visible shoulder accessory work');
});

test('powerbuilding beginner 30-minute plans keep anchor-first minimal structure', () => {
  const built = buildLivePlan(clonePayload(POWERBUILDING_PRIORITY_MATRIX[29].payload, {
    experience: '<6m',
    sessionLengthMin: '30',
    daysPerWeek: 4,
    equipmentAccess: ['Bodyweight', 'Dumbbells', 'Bench'],
    planSeed: 88003
  }));
  assert.equal(built?.error, undefined, built?.error?.reason || built?.error?.error || 'route build failed');
  firstWeek(built.plan).days.forEach((day) => {
    const exercises = day.exercises || [];
    assert.ok(exercises.length <= 4, `${day.dayType}: expected 3-4 movements max`);
    if (exercises.length) {
      assert.ok(isStrengthAnchor(exercises[0]) || isCompound(exercises[0]), `${day.dayType}: top slot should be anchor/compound`);
    }
    const accessoryCount = exercises.filter((exercise) => String(exercise?.style || '') === 'Isolation').length;
    assert.ok(accessoryCount <= 2, `${day.dayType}: accessory spam in 30-minute beginner day`);
  });
});
