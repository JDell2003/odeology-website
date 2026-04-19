const fs = require('fs');
const path = require('path');
const trainingRoutes = require('../core/trainingRoutes');

function extractCanonicalScenarios() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'workoutTest.js'), 'utf8');
  const match = src.match(/const canonicalScenarios = (\[[\s\S]*?\n  \];)/);
  if (!match) throw new Error('Could not extract canonicalScenarios from js/workoutTest.js');
  const literal = match[1].replace(/;\s*$/, '');
  return Function(`return (${literal});`)();
}

function buildClassicPayload(scenario) {
  const injury = scenario?.injury || {};
  return {
    discipline: 'bodybuilding',
    experience: String(scenario?.experience || ''),
    daysPerWeek: Number(scenario?.daysPerWeek || 0),
    phase: String(scenario?.phase || ''),
    targetWeightLb: Number.isFinite(Number(scenario?.targetWeightLb)) ? Number(scenario.targetWeightLb) : null,
    timePerSession: String(scenario?.timePerSession || ''),
    trainingAgeBucket: String(scenario?.trainingAgeBucket || ''),
    emphasis: Array.isArray(scenario?.emphasis) ? scenario.emphasis.slice() : [],
    equipmentStylePref: String(scenario?.equipmentStylePref || ''),
    unavailableDays: Array.isArray(scenario?.unavailableDays) ? scenario.unavailableDays.slice() : [],
    equipmentAccess: {
      ...(scenario?.equipmentAccess || {})
    },
    strength: {
      bodyweight: Number(scenario?.strength?.bodyweight || 0),
      height: Number(scenario?.strength?.height || 0),
      benchWeight: Number(scenario?.strength?.benchWeight || 0),
      benchReps: Number(scenario?.strength?.benchReps || 0),
      lowerMovement: String(scenario?.strength?.lowerMovement || ''),
      lowerWeight: Number(scenario?.strength?.lowerWeight || 0),
      lowerReps: Number(scenario?.strength?.lowerReps || 0),
      hingeMovement: String(scenario?.strength?.hingeMovement || ''),
      hingeWeight: Number(scenario?.strength?.hingeWeight || 0),
      hingeReps: Number(scenario?.strength?.hingeReps || 0),
      phase: String(scenario?.phase || ''),
      targetWeightLb: Number.isFinite(Number(scenario?.targetWeightLb)) ? Number(scenario.targetWeightLb) : null,
      timePerSession: String(scenario?.timePerSession || ''),
      trainingAgeBucket: String(scenario?.trainingAgeBucket || ''),
      emphasis: Array.isArray(scenario?.emphasis) ? scenario.emphasis.slice() : [],
      equipmentStylePref: String(scenario?.equipmentStylePref || ''),
      injury: {
        has: Boolean(injury?.has),
        joints: Array.isArray(injury?.joints) ? injury.joints.slice() : [],
        note: String(injury?.note || '')
      },
      injurySeverityByJoint: { ...(injury?.severityByJoint || {}) }
    },
    profile: {
      firstName: String(scenario?.name || ''),
      age: Number(scenario?.age || 0) || null,
      locationCity: String(scenario?.locationCity || ''),
      locationState: String(scenario?.locationState || ''),
      goals: String(scenario?.stressReason || ''),
      injuries: String(injury?.note || '')
    }
  };
}

function loadEngine() {
  const arg = process.argv.find((entry) => entry.startsWith('--engine='));
  const rawPath = arg ? arg.slice('--engine='.length) : path.join(__dirname, '..', 'generator', 'trainingEngine.oblueprint.js');
  const resolved = path.resolve(rawPath);
  return { resolved, mod: require(resolved) };
}

function aggregateStageTimings(results) {
  const totals = Object.create(null);
  for (const result of results) {
    const timings = result?.plan?.meta?.runtimeProfile?.timings || {};
    for (const [key, value] of Object.entries(timings)) {
      totals[key] = Number(totals[key] || 0) + Number(value || 0);
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key}=${value.toFixed(2)}ms`)
    .join(', ');
}

function projectionDebug(plan) {
  const projection = plan?.meta?.progressionProjection || {};
  const anchors = projection?.anchorInputs || {};
  const majors = Array.isArray(projection?.exerciseSummaries)
    ? projection.exerciseSummaries.filter((entry) => entry?.major).slice(0, 3)
    : [];
  const accessories = Array.isArray(projection?.exerciseSummaries)
    ? projection.exerciseSummaries.filter((entry) => !entry?.major).slice(0, 3)
    : [];
  return {
    modeledAs: projection?.modeledAs || null,
    deloadWeeks: Array.isArray(projection?.deloadWeeks) ? projection.deloadWeeks : [],
    anchorSource: anchors.anchorSource || null,
    anchors: {
      bench: anchors.inputBench || anchors.bench1rm || null,
      squat: anchors.inputSquat || anchors.squat1rm || null,
      deadlift: anchors.inputDeadlift || anchors.deadlift1rm || null
    },
    rawWorking: {
      bench: { variation: anchors.benchVariation || null, weight: anchors.benchWorkingWeight || null, reps: anchors.benchWorkingReps || null },
      lower: { variation: anchors.lowerVariation || null, weight: anchors.lowerWorkingWeight || null, reps: anchors.lowerWorkingReps || null },
      hinge: { variation: anchors.hingeVariation || null, weight: anchors.hingeWorkingWeight || null, reps: anchors.hingeWorkingReps || null }
    },
    derivedAnchors: {
      bench: anchors.derivedBenchEstimate || anchors.bodyweightFallbackBench || null,
      squat: anchors.derivedSquatEstimate || anchors.bodyweightFallbackSquat || null,
      deadlift: anchors.derivedDeadliftEstimate || anchors.bodyweightFallbackDeadlift || null
    },
    majors: majors.map((entry) => ({
      exercise: entry.exercise,
      start: entry.startingLoad,
      week1: entry.week1Load,
      week8: entry.week8Load,
      week16: entry.week16Load
    })),
    accessories: accessories.map((entry) => ({
      exercise: entry.exercise,
      start: entry.startingLoad,
      week1: entry.week1Load,
      week8: entry.week8Load,
      week16: entry.week16Load
    }))
  };
}

function main() {
  const started = Date.now();
  const { resolved: enginePath, mod: engine } = loadEngine();
  const scenarios = extractCanonicalScenarios().slice(0, 10);
  const results = [];

  for (let index = 0; index < scenarios.length; index += 1) {
    const classic = buildClassicPayload(scenarios[index]);
    const oblueprintInput = trainingRoutes._private.coerceClassicBodybuildingToOblueprintPayload(classic);
    const planStarted = Date.now();
    const plan = engine.buildOblueprintPlan(oblueprintInput, { profileTiming: true });
    const elapsedMs = Date.now() - planStarted;
    const week0Days = Array.isArray(plan?.weeks?.[0]?.days) ? plan.weeks[0].days : [];
    results.push({
      index,
      label: String(scenarios[index]?.name || `Scenario ${index + 1}`),
      elapsedMs,
      ok: !plan?.error && week0Days.length > 0,
      dayCount: week0Days.length,
      error: plan?.error || null,
      projection: projectionDebug(plan),
      plan
    });
  }

  const totalMs = Date.now() - started;
  const okCount = results.filter((result) => result.ok).length;
  const failCount = results.length - okCount;
  const aggregateTimings = aggregateStageTimings(results);
  const slowest = results.slice().sort((a, b) => b.elapsedMs - a.elapsedMs)[0] || null;

  console.log(JSON.stringify({
    enginePath,
    totalMs,
    okCount,
    failCount,
    results: results.map((result) => ({
      index: result.index,
      label: result.label,
      elapsedMs: result.elapsedMs,
      ok: result.ok,
      dayCount: result.dayCount,
      error: result.error?.reason || result.error?.error || null,
      projection: result.projection,
      timings: result.plan?.meta?.runtimeProfile?.timings || null
    })),
    aggregateTimings,
    slowest: slowest ? {
      label: slowest.label,
      elapsedMs: slowest.elapsedMs,
      timings: slowest.plan?.meta?.runtimeProfile?.timings || null
    } : null
  }, null, 2));
}

main();
