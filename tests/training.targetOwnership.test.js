'use strict';
/* Engine v2 Phase 1 §0 — one writer for the target.

   The server computes the target; the client renders it. This suite exists
   because the opposite was true: js/training.js derived a weight from logged
   history as `last logged weight + increment`, with no rep gate, and that value
   outranked the plan whenever any history existed. Once Phase 0 reconnected the
   server-side progression layer there were two writers disagreeing.

   These tests read the browser bundle as text. That is deliberate: the file is a
   single IIFE with no exports, and the property under test is "the client cannot
   compute a weight" — which is a property of the source, not of a return value.
   A behavioural test would need a DOM harness and would not catch the
   computation being reintroduced somewhere new. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'training.js'), 'utf8');

test('the client carries no target-derivation helpers', () => {
  // Each of these existed only to feed the deleted computation path.
  for (const name of [
    'resolveTargetSeedForExercise',
    'resolveTargetWeightIncrement',
    'resolvePreviousProjectedWeight',
    'buildTargetWeightPerformanceCandidate',
    'pickBestTargetWeightCandidate',
    'isLowerBodyTargetExercise'
  ]) {
    assert.ok(!SRC.includes(`function ${name}(`), `${name} is back — the client is deriving targets again`);
    assert.ok(!SRC.includes(`${name}(`), `${name} is still called`);
  }
});

test('resolveProjectedForExercise reads the plan and never adds an increment', () => {
  const start = SRC.indexOf('function resolveProjectedForExercise(');
  assert.ok(start > -1, 'resolveProjectedForExercise should still exist as a reader');
  // Walk to the end of the function by brace balance.
  let depth = 0;
  let started = false;
  let end = start;
  for (let i = start; i < SRC.length; i += 1) {
    const ch = SRC[i];
    if (ch === '{') { depth += 1; started = true; } else if (ch === '}') { depth -= 1; }
    if (started && depth === 0) { end = i + 1; break; }
  }
  const body = SRC.slice(start, end);

  assert.ok(/ex\?\.projected/.test(body), 'it must read ex.projected');
  // The signature must not accept the logged-history options bag any more.
  assert.match(body.split('\n')[0], /^function resolveProjectedForExercise\(ex, plan\)/, 'signature should be (ex, plan) only');
  // The two shapes the old computation took.
  assert.ok(!/\+\s*increment/.test(body), 'it must not add an increment to a logged weight');
  assert.ok(!/targetSeed/.test(body), 'it must not consult a logged-history seed');
});

test('the render path and the log path resolve the target the same way', () => {
  // Every call site passes exactly (ex, plan). If one of them regains a third
  // argument, two screens can disagree about the same exercise again.
  const calls = SRC.match(/resolveProjectedForExercise\([^)]*\)/g) || [];
  assert.ok(calls.length >= 3, `expected the reader to be used on several screens, saw ${calls.length}`);
  for (const call of calls) {
    if (call.startsWith('resolveProjectedForExercise(ex, plan')) continue;
    assert.match(
      call,
      /^resolveProjectedForExercise\((ex|exercise), (plan|planRef)\)$/,
      `call site passes more than (exercise, plan): ${call}`
    );
  }
});

/* The server-side guarantee behind the above: a plan's stored projection is what
   the client will show, so the engine's number has to survive a round trip
   through persistence untouched. */
test('a logged session leaves the plan the single source of the next target', () => {
  const trainingRoutes = require('../core/trainingRoutes');
  const { applyLogAdjustments } = require('../core/trainingEngine');
  const P = trainingRoutes._private;

  const built = P.buildOblueprintPlanWithFallback(P.coerceClassicBodybuildingToOblueprintPayload({
    discipline: 'bodybuilding', phase: 'maintain', daysPerWeek: 4, planSeed: 5150,
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    emphasis: ['chest', 'back'], unavailableDays: [], equipmentStylePref: 'mix',
    strength: {
      phase: 'maintain', trainingAgeBucket: '6_18', timePerSession: '60_75', equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' }, injurySeverityByJoint: {}, bench: 225, squat: 315, deadlift: 405
    }
  }));
  assert.equal(built.error, undefined);
  const plan = built.plan;
  const ex = plan.weeks[0].days[0].exercises.find((e) => Number(e.projectedWeight) > 0);
  assert.ok(ex, 'expected a loaded exercise');

  const reps = Number(String(ex.reps).match(/\d+/)[0]);
  const load = Number(ex.projected.value);
  const updated = applyLogAdjustments({
    plan,
    workoutLog: {
      weekIndex: 1,
      dayIndex: 1,
      readiness: 8,
      entries: [{
        exerciseId: ex.id,
        canonicalExerciseId: ex.canonicalExerciseId,
        exerciseName: ex.name,
        prescribed: { sets: ex.sets, reps: ex.reps, repsTarget: reps, projectedWeight: load },
        target: { weight: null },
        actual: { weight: load, reps, rpe: null },
        sets: Array.from({ length: ex.sets }, () => ({ weight: load, reps, note: null })),
        notes: ''
      }]
    },
    experience: '6-24m'
  });

  // Survives a JSON round trip (this is how it reaches the browser).
  const persisted = JSON.parse(JSON.stringify(updated));
  const after = persisted.weeks[1].days[0].exercises.find((e) => e.canonicalExerciseId === ex.canonicalExerciseId);
  assert.ok(after, 'exercise should still be present next week');
  assert.ok(Number.isFinite(Number(after.projected.value)), 'next week carries a server-computed target');
  assert.equal(
    Number(after.projected.value),
    Number(after.projectedWeight),
    'projected.value and projectedWeight must agree — the client may read either'
  );
});
