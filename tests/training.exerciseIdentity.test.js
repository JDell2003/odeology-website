'use strict';
/* Engine v2 Phase 1 §3 — a slot may specify what it wants; it may never rewrite
   what a movement is.

   routeApplyReplacement used to spread the exercise it displaced and overwrite
   only name/pattern/style/primary, so a replacement inherited the donor's
   primaryMuscle, subMuscle, movementFamily, prescription, load — and its
   canonicalExerciseId, which is the progression key. A "Triceps Extension"
   shipped as 3x6 @ 157.5 lb carrying close-grip-barbell-bench-press as its id.

   These tests pin identity to the exercise table. The first one would have
   caught it the day it appeared. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const trainingRoutes = require('../core/trainingRoutes');
const engine = require('../generator/trainingEngine.oblueprint');
const P = trainingRoutes._private;

const TABLE = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.master.js'), 'utf8');
  const expr = src.replace(/^\s*export\s+const\s+exercises\s*=\s*/, '').replace(/;\s*$/, '');
  return Function(`return (${expr});`)();
})();
const POOL = engine.preprocessExercises(TABLE).exercises;
const BY_CANONICAL_ID = new Map(POOL.map((ex) => [engine.buildExerciseTruth(ex).canonicalExerciseId, ex]));

const COMPOUND_FAMILIES = new Set([
  'chest_press', 'shoulder_press', 'horizontal_pull', 'vertical_pull',
  'squat_pattern', 'hinge_pattern', 'leg_press', 'hip_thrust'
]);

function buildPlan({ discipline = 'bodybuilding', daysPerWeek = 4, emphasis = ['chest', 'back'], planSeed = 9001 } = {}) {
  const built = P.buildOblueprintPlanWithFallback(P.coerceClassicBodybuildingToOblueprintPayload({
    discipline, phase: 'maintain', daysPerWeek, planSeed,
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    emphasis, unavailableDays: [], equipmentStylePref: 'mix',
    strength: {
      phase: 'maintain', trainingAgeBucket: '6_18', timePerSession: '60_75', equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' }, injurySeverityByJoint: {}, bench: 225, squat: 315, deadlift: 405
    }
  }));
  assert.equal(built.error, undefined, `build failed: ${JSON.stringify(built.error || '').slice(0, 200)}`);
  return built.plan;
}

const everyExercise = (plan) => (plan.weeks || []).flatMap((w) => (w.days || [])
  .flatMap((d) => (d.exercises || []).map((e) => ({ ...e, __where: `wk${w.weekIndex} ${d.dayType}` }))));

const COMBOS = [
  { discipline: 'bodybuilding', daysPerWeek: 4, emphasis: ['arms', 'chest'] },
  { discipline: 'bodybuilding', daysPerWeek: 3, emphasis: ['chest', 'back'] },
  { discipline: 'powerbuilding', daysPerWeek: 5, emphasis: ['shoulders', 'arms'] },
  { discipline: 'powerbuilding', daysPerWeek: 4, emphasis: ['legs', 'glutes'] }
];

test("an exercise's identity on the plan equals its identity in the table", () => {
  for (const combo of COMBOS) {
    for (const ex of everyExercise(buildPlan(combo))) {
      const row = BY_CANONICAL_ID.get(ex.canonicalExerciseId);
      assert.ok(row, `${ex.__where} "${ex.name}": canonicalExerciseId "${ex.canonicalExerciseId}" is not in the exercise table`);
      const truth = engine.buildExerciseTruth(row);
      const label = `${combo.discipline}-${combo.daysPerWeek}d ${ex.__where} "${ex.name}"`;
      assert.equal(String(ex.primaryMuscle), String(truth.primaryMuscle), `${label}: primaryMuscle`);
      assert.equal(String(ex.primary), String(row.primary), `${label}: primary`);
      assert.equal(String(ex.style), String(row.style), `${label}: style`);
    }
  }
});

test('an Isolation exercise never carries a compound projection family', () => {
  for (const combo of COMBOS) {
    for (const ex of everyExercise(buildPlan(combo))) {
      if (String(ex.style) !== 'Isolation') continue;
      const family = String(ex.projectionFamily || '');
      if (!family) continue;
      assert.ok(
        !COMPOUND_FAMILIES.has(family),
        `${ex.__where} "${ex.name}" is Isolation but carries compound family "${family}"`
      );
    }
  }
});

test('an Isolation exercise is never prescribed at compound rep counts', () => {
  // The invariant the product sells: no path to 6 reps on a curl. Core work sits
  // lower by design, so it is measured against its own floor.
  for (const combo of COMBOS) {
    for (const ex of everyExercise(buildPlan(combo))) {
      if (String(ex.style) !== 'Isolation') continue;
      const reps = Number(String(ex.reps ?? '').match(/\d+/)?.[0] || 0);
      if (!reps) continue;
      const floor = String(ex.primaryMuscle) === 'Core' ? 8 : 10;
      assert.ok(reps >= floor, `${ex.__where} "${ex.name}" (${ex.primaryMuscle}) prescribed ${ex.sets}x${ex.reps}, floor is ${floor}`);
    }
  }
});

test('a replacement takes its identity from the table, not from what it displaced', () => {
  // Direct unit check on the mechanism that failed: hand routeApplyReplacement a
  // compound bench press and ask for a triceps isolation.
  const donor = {
    name: 'Close-Grip Barbell Bench Press',
    canonicalExerciseId: 'close-grip-barbell-bench-press',
    primary: 'Chest', primaryMuscle: 'Chest', subMuscle: 'Mid',
    style: 'Compound', pattern: 'HorizontalPush', movementFamily: 'triceps_press',
    sets: 3, reps: '6', projected: { value: 157.5, unit: 'lb' }, projectedWeight: 157.5,
    slotId: 'push_hp'
  };
  const next = P.routeApplyReplacement(donor, { name: 'Triceps Extension', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' });

  assert.equal(next.name, 'Triceps Extension');
  assert.equal(next.primary, 'Arms', 'primary comes from the exercise');
  assert.equal(next.primaryMuscle, 'Arms', 'primaryMuscle must NOT be inherited from the donor');
  assert.equal(next.style, 'Isolation');
  assert.equal(next.canonicalExerciseId, 'triceps-extension', 'the progression key must be the new movement, not the donor');
  assert.notEqual(next.subMuscle, 'Mid', 'subMuscle must not be inherited');
  // Cross-class: the donor's prescription describes a different kind of movement.
  assert.equal(next.reps, undefined, 'a cross-class swap clears the inherited reps');
  assert.equal(next.projected, undefined, 'a cross-class swap clears the inherited load');
  // Slot-owned fields survive.
  assert.equal(next.slotId, 'push_hp', 'slotId belongs to the slot and stays');
});

test('the plan identity audit reports a corrupted exercise rather than passing it', () => {
  const plan = buildPlan(COMBOS[0]);
  assert.deepEqual(P.auditPlanIdentityIntegrity(plan), [], 'a healthy plan audits clean');

  // Reproduce the original corruption and confirm the audit names it.
  const corrupted = JSON.parse(JSON.stringify(plan));
  const victim = corrupted.weeks[0].days[0].exercises[0];
  victim.primaryMuscle = 'Chest';
  victim.style = 'Isolation';
  const problems = P.auditPlanIdentityIntegrity(corrupted);
  assert.ok(problems.length >= 1, 'the audit must catch a relabelled exercise');
  assert.ok(problems.some((p) => /primaryMuscle|style/.test(p)), `expected an identity problem, got: ${problems.join('; ')}`);
});

test('every enum-valued field on a plan is a member of its enum', () => {
  const STYLES = ['Compound', 'Isolation', 'Cardio', 'Skill'];
  const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Calves', 'Forearms', 'Neck', 'FullBody', 'Cardio'];
  for (const combo of COMBOS) {
    for (const ex of everyExercise(buildPlan(combo))) {
      if (ex.style !== undefined) assert.ok(STYLES.includes(String(ex.style)), `${ex.__where} "${ex.name}": style "${ex.style}"`);
      if (ex.primaryMuscle !== undefined) assert.ok(MUSCLES.includes(String(ex.primaryMuscle)), `${ex.__where} "${ex.name}": primaryMuscle "${ex.primaryMuscle}"`);
    }
  }
});
