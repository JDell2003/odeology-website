'use strict';
/* Engine v2 — Phase 0 invariants.
   These guard the wiring fixes, not the training science. Each one corresponds
   to a defect that shipped to production undetected because no training suite
   gated a deploy. Keep them cheap enough to stay in the gate. */
const test = require('node:test');
const assert = require('node:assert/strict');
const trainingRoutes = require('../core/trainingRoutes');

const P = trainingRoutes._private;

function classicProfile(overrides = {}) {
  const { emphasis = ['shoulders', 'arms'], daysPerWeek = 3, discipline = 'powerbuilding', planSeed = 1532 } = overrides;
  return {
    discipline,
    phase: 'maintain',
    daysPerWeek,
    planSeed,
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    emphasis,
    unavailableDays: [],
    equipmentStylePref: 'mix',
    strength: {
      phase: 'maintain',
      trainingAgeBucket: '6_18',
      timePerSession: '60_75',
      equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' },
      injurySeverityByJoint: {}
    }
  };
}

function build(overrides) {
  const built = P.buildOblueprintPlanWithFallback(
    P.coerceClassicBodybuildingToOblueprintPayload(classicProfile(overrides))
  );
  assert.equal(built.error, undefined, `build failed: ${JSON.stringify(built.error || '').slice(0, 200)}`);
  return built;
}

function allExercises(plan) {
  return (plan?.weeks || []).flatMap((w) => (w.days || []).flatMap((d) => (d.exercises || []).map((e) => ({ ...e, __day: d.dayType, __week: w.weekIndex }))));
}

/* The generator emits weekIndex. Three server-side plan mutators read `index`,
   and plans are stored as verbatim JSON with no normalisation step, so a rename
   on one side alone silently disables the live progression layer, the exercise
   override and the projected-weight override. Pin the field name. */
test('plan weeks are keyed by weekIndex, numbered from 1', () => {
  const { plan } = build();
  assert.ok(Array.isArray(plan.weeks) && plan.weeks.length > 0, 'plan has weeks');
  plan.weeks.forEach((week, i) => {
    assert.equal(week.weekIndex, i + 1, `week ${i} carries weekIndex ${i + 1}`);
  });
});

/* A prescription the UI prints as "3xundefined" or "3xnull" is not a plan.
   Both shipped: the first from an appended accessory in the route repair chain
   with no slot behind it, the second was already baked into four golden
   fixtures. planPassesFloorGate now rejects them and the route repairs them
   first, so neither can reach a user. */
test('every prescribed exercise has a printable sets x reps', () => {
  for (const emphasis of [['shoulders', 'arms'], ['back', 'arms'], ['core', 'calves'], ['legs', 'glutes']]) {
    for (const daysPerWeek of [3, 6]) {
      const { plan } = build({ emphasis, daysPerWeek, discipline: 'bodybuilding' });
      for (const ex of allExercises(plan)) {
        const reps = String(ex.reps ?? '').trim();
        const label = `${emphasis.join('+')} ${daysPerWeek}d wk${ex.__week} ${ex.__day} "${ex.name}"`;
        assert.ok(reps && reps !== 'undefined' && reps !== 'null', `${label} has reps (got ${JSON.stringify(ex.reps)})`);
        assert.ok(Number.isFinite(Number(ex.sets)) && Number(ex.sets) >= 1, `${label} has sets (got ${JSON.stringify(ex.sets)})`);
      }
    }
  }
});

/* The floor gate's completeness line. A day with one exercise is what the
   powerbuilding-3-Shoulders,Arms fixture had degraded into before the
   over-subscribed priority slots were reconciled. */
test('no day ships with fewer than two exercises', () => {
  for (const emphasis of [['shoulders', 'arms'], ['back', 'arms']]) {
    for (const discipline of ['bodybuilding', 'powerbuilding']) {
      const { plan } = build({ emphasis, discipline, daysPerWeek: 3 });
      for (const week of plan.weeks) {
        for (const day of week.days) {
          assert.ok(
            (day.exercises || []).length >= 2,
            `${discipline} ${emphasis.join('+')} wk${week.weekIndex} ${day.dayType} has ${(day.exercises || []).length} exercise(s)`
          );
        }
      }
    }
  }
});

/* A Shoulders or Arms priority used to over-subscribe a day: three isolation
   slots competing for two usable movement families, which fillSlots cannot
   satisfy. At 3 days or fewer those slots are required, so the build failed ten
   times and fell through to the generic safe-fallback plan — the priority was
   not just unmet, the whole personalised plan was discarded. */
test('an upper-accessory priority pair still yields a real plan, not the safe fallback', () => {
  for (const emphasis of [['shoulders', 'arms'], ['back', 'arms']]) {
    for (const discipline of ['bodybuilding', 'powerbuilding']) {
      const built = build({ emphasis, discipline, daysPerWeek: 3 });
      assert.equal(built._safeFallback, undefined, `${discipline} ${emphasis.join('+')} used the safe fallback`);
      const dayTypes = new Set((built.plan.weeks[0].days || []).map((d) => String(d.dayType)));
      for (const generic of ['Day 1', 'Day 2', 'Day 3']) {
        assert.ok(!dayTypes.has(generic), `${discipline} ${emphasis.join('+')} produced a generic "${generic}" fallback day`);
      }
    }
  }
});

/* Priority is what drives the volume bands, so it has to actually reach the
   engine. It is carried on the payload as priorityGroups. */
test('selected priority groups reach the built plan', () => {
  const { plan } = build({ emphasis: ['shoulders', 'arms'], discipline: 'bodybuilding', daysPerWeek: 4 });
  assert.deepEqual(plan.meta.priorityGroups, ['Shoulders', 'Arms']);
});

/* Generation is deterministic in planSeed and nothing else. Under the test
   runner the default is pinned, so a suite that forgets to pass one is still
   reproducible instead of quietly flaky. */
test('an unseeded build is reproducible under the test runner', () => {
  const payload = P.coerceClassicBodybuildingToOblueprintPayload({
    ...classicProfile({ emphasis: ['chest', 'back'], daysPerWeek: 4 }),
    planSeed: undefined
  });
  assert.equal(payload.planSeed, 424242, 'test context pins the seed');
  const a = P.buildOblueprintPlanWithFallback({ ...payload });
  const b = P.buildOblueprintPlanWithFallback({ ...payload });
  const names = (built) => (built.plan.weeks[0].days || []).map((d) => (d.exercises || []).map((e) => e.name).join('|')).join(' // ');
  assert.equal(names(a), names(b), 'two unseeded builds agree');
});
