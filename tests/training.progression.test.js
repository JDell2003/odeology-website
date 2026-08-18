'use strict';
/* Engine v2 Phase 1 §2 — double progression on carried state.

   The bug this replaces: applyLogAdjustments built rep ranges once from week 1
   while the baked ladder climbed the prescribed reps per week. By week 3 the
   ladder asked for 8 and the state still believed 6, so logging 7 — a genuine
   miss — read as clearing 6 and earned a load jump. State is now carried, and
   nothing derives a rep target from a week index. */
const test = require('node:test');
const assert = require('node:assert/strict');

const progression = require('../generator/progressionState');
const planUpdate = require('../generator/progressionPlanUpdate');
const trainingRoutes = require('../core/trainingRoutes');
const P = trainingRoutes._private;

const BENCH = { style: 'Compound', projectionFamily: 'chest_press', canonicalExerciseId: 'bench-press', projectionLoadNote: 'total load' };
const CURL = { style: 'Isolation', projectionFamily: 'biceps_iso', canonicalExerciseId: 'barbell-curl' };

const setsAt = (reps, count = 3) => Array.from({ length: count }, () => ({ reps }));

test('clean session: reps climb, then load steps and reps reset', () => {
  let s = progression.createState(BENCH, 185);
  assert.equal(s.repsCurrent, 6, 'upper compound starts at its floor');

  s = progression.advance(s, setsAt(6), 3);
  assert.equal(s.lastDecision.branch, 'reps_up');
  assert.equal(s.repsCurrent, 7);
  assert.equal(s.load, 185, 'load holds while reps climb');

  s = progression.advance(s, setsAt(7), 3);
  s = progression.advance(s, setsAt(8), 3);
  assert.equal(s.lastDecision.branch, 'load_up');
  assert.equal(s.load, 195, 'tops the range -> +10 lb for an upper compound');
  assert.equal(s.repsCurrent, 6, 'reps reset to the floor');
});

test('a single miss HOLDS — same load, same reps', () => {
  // This is the behaviour that was failing: a miss registered as a clear.
  let s = progression.createState(BENCH, 185);
  const before = { load: s.load, reps: s.repsCurrent };
  s = progression.advance(s, setsAt(before.reps - 1), 3);
  assert.equal(s.lastDecision.branch, 'hold');
  assert.equal(s.load, before.load, 'load must not move on a single miss');
  assert.equal(s.repsCurrent, before.reps, 'reps must not move on a single miss');
  assert.equal(s.failStreak, 1);
});

test('the gate is the WORST set, not the average', () => {
  // Three sets: 8, 8, 4. Average clears 6; the worst set does not.
  let s = progression.createState(BENCH, 185);
  s = progression.advance(s, [{ reps: 8 }, { reps: 8 }, { reps: 4 }], 3);
  assert.equal(s.lastDecision.branch, 'hold', 'one fading set means the load was not owned');
});

test('an incomplete session is not a clear', () => {
  let s = progression.createState(BENCH, 185);
  s = progression.advance(s, setsAt(s.repsCurrent, 2), 3); // 2 of 3 prescribed
  assert.equal(s.lastDecision.branch, 'hold', 'dropped sets do not earn a jump');
});

test('two misses deload 10% and reset reps; one clean week exits', () => {
  let s = progression.createState(BENCH, 185);
  s = progression.advance(s, setsAt(5), 3);
  s = progression.advance(s, setsAt(5), 3);
  assert.equal(s.lastDecision.branch, 'deload_enter');
  assert.equal(s.deloadActive, true);
  assert.equal(s.load, progression.roundToIncrement(185 * 0.9, 2.5));
  assert.equal(s.repsCurrent, s.repMin);
  assert.equal(s.failStreak, 0, 'the streak resets when the deload is entered');

  s = progression.advance(s, setsAt(s.repsCurrent), 3);
  assert.equal(s.lastDecision.branch, 'deload_exit');
  assert.equal(s.deloadActive, false, 'a deload exits on one clean week, not a fixed duration');
});

test('readiness <= 3 leaves state completely untouched', () => {
  let s = progression.createState(BENCH, 185);
  const snapshot = JSON.stringify({ load: s.load, reps: s.repsCurrent, fail: s.failStreak, deload: s.deloadActive });
  s = progression.advance(s, setsAt(s.repsCurrent), 3, { readiness: 2 });
  assert.equal(s.lastDecision.branch, 'readiness_hold');
  assert.equal(JSON.stringify({ load: s.load, reps: s.repsCurrent, fail: s.failStreak, deload: s.deloadActive }), snapshot);
  // And a bad night must not trigger a back-off either.
  s = progression.advance(s, setsAt(1), 3, { readiness: 1 });
  assert.equal(s.failStreak, 0, 'a low-readiness miss does not count against you');
});

/* §2.2 — every branch writes exactly one message, and it names what happened. */
test('each decision message matches the branch that produced it', () => {
  const expectations = [
    ['reps_up', /go for \d+ this time/],
    ['load_up', /weight goes up \d+ lb/],
    ['hold', /Repeat .* before adding anything/],
    ['deload_enter', /drops 10%/],
    ['deload_exit', /Recovery week done/],
    ['readiness_hold', /nothing moved/]
  ];
  const seen = new Map();
  let s = progression.createState(BENCH, 185);
  const record = () => seen.set(s.lastDecision.branch, s.lastDecision.message);
  s = progression.advance(s, setsAt(6), 3); record();
  s = progression.advance(s, setsAt(7), 3);
  s = progression.advance(s, setsAt(8), 3); record();
  s = progression.advance(s, setsAt(1), 3); record();
  s = progression.advance(s, setsAt(1), 3); record();
  s = progression.advance(s, setsAt(s.repsCurrent), 3); record();
  s = progression.advance(s, setsAt(s.repsCurrent), 3, { readiness: 2 }); record();
  for (const [branch, pattern] of expectations) {
    assert.ok(seen.has(branch), `branch ${branch} never fired`);
    assert.match(seen.get(branch), pattern, `${branch} message does not describe ${branch}`);
  }
});

/* §2.1 — isolation stays 12-15, pinned. No path to 6 reps on a curl, ever. */
test('an isolation movement never leaves 12-15 reps, however long it runs', () => {
  let s = progression.createState(CURL, 60);
  for (let i = 0; i < 40; i += 1) {
    assert.ok(s.repsCurrent >= 12 && s.repsCurrent <= 15, `isolation prescribed ${s.repsCurrent} reps at step ${i}`);
    // Alternate clean and missed sessions so deloads and holds are exercised too.
    const reps = i % 3 === 2 ? s.repsCurrent - 2 : s.repsCurrent;
    s = progression.advance(s, setsAt(reps), 3);
  }
});

test('class bounds come from the exercise, not from the slot it landed in', () => {
  const cases = [
    [{ style: 'Compound', projectionFamily: 'squat_pattern' }, 'lower_compound', 5, 8, 15],
    [{ style: 'Compound', projectionFamily: 'chest_press' }, 'upper_compound', 6, 8, 10],
    [{ style: 'Isolation', projectionFamily: 'biceps_iso' }, 'isolation', 12, 15, 5],
    [{ style: 'Isolation', projectionFamily: 'core_flexion' }, 'accessory_compound', 8, 12, 5]
  ];
  for (const [ex, klass, repMin, repMax, loadStep] of cases) {
    assert.equal(progression.movementClassFor(ex), klass, `${ex.projectionFamily} class`);
    const b = progression.boundsFor(ex);
    assert.deepEqual([b.repMin, b.repMax, b.loadStep], [repMin, repMax, loadStep], `${ex.projectionFamily} bounds`);
  }
});

/* §2.3 — the baked 16-week ladder is gone. */
test('a generated plan carries progression state and no rep ladder', () => {
  const built = P.buildOblueprintPlanWithFallback(P.coerceClassicBodybuildingToOblueprintPayload({
    discipline: 'bodybuilding', phase: 'maintain', daysPerWeek: 4, planSeed: 4242,
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    emphasis: ['chest', 'back'], unavailableDays: [], equipmentStylePref: 'mix',
    strength: {
      phase: 'maintain', trainingAgeBucket: '6_18', timePerSession: '60_75', equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' }, injurySeverityByJoint: {}, bench: 225, squat: 315, deadlift: 405
    }
  }));
  assert.equal(built.error, undefined);
  const plan = built.plan;
  assert.ok(Object.keys(plan.meta.progressionState || {}).length > 0, 'state is seeded at generation');

  for (const week of plan.weeks) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        assert.equal(ex.repLadder, undefined, `${ex.name} still carries a rep ladder`);
        // Week 1 is the prescription; later weeks are projections and must say so.
        if (week.weekIndex > 1) {
          assert.equal(ex.progression?.isProjection, true, `wk${week.weekIndex} ${ex.name} is not flagged as a projection`);
        } else {
          assert.notEqual(ex.progression?.isProjection, true, 'week 1 is a prescription, not a projection');
        }
      }
    }
  }
});

test('a logged session moves the next target and persists the state', () => {
  const built = P.buildOblueprintPlanWithFallback(P.coerceClassicBodybuildingToOblueprintPayload({
    discipline: 'bodybuilding', phase: 'maintain', daysPerWeek: 4, planSeed: 4242,
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    emphasis: ['chest', 'back'], unavailableDays: [], equipmentStylePref: 'mix',
    strength: {
      phase: 'maintain', trainingAgeBucket: '6_18', timePerSession: '60_75', equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' }, injurySeverityByJoint: {}, bench: 225, squat: 315, deadlift: 405
    }
  }));
  const plan = built.plan;
  const ex = plan.weeks[0].days[0].exercises.find((e) => Number(e.projected?.value) > 0);
  const reps = Number(String(ex.reps).match(/\d+/)[0]);

  const updated = planUpdate.applyLoggedSession(plan, {
    weekIndex: 1, dayIndex: 1, readiness: 8,
    entries: [{
      canonicalExerciseId: ex.canonicalExerciseId,
      exerciseName: ex.name,
      prescribed: { sets: ex.sets, reps: ex.reps, repsTarget: reps, projectedWeight: Number(ex.projected.value) },
      sets: Array.from({ length: ex.sets }, () => ({ weight: Number(ex.projected.value), reps }))
    }]
  });

  const state = updated.meta.progressionState[ex.canonicalExerciseId];
  assert.ok(state, 'state persisted under the canonical id');
  assert.equal(state.repsCurrent, reps + 1, 'a clean session advances the carried rep target');

  const nextWeek = updated.weeks[1].days[0].exercises.find((e) => e.canonicalExerciseId === ex.canonicalExerciseId);
  assert.equal(Number(nextWeek.reps), state.repsCurrent, 'the plan reflects the carried state, not a week-derived ladder');
  assert.equal(Number(nextWeek.projected.value), Number(nextWeek.projectedWeight), 'both load fields agree');
});
