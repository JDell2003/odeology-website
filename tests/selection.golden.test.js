'use strict';
// Selection work order — Task 1 golden fixtures.
// The 56 healthy builds (bodybuilding + powerbuilding x 3-6 days x 7 priority
// combos) must stay byte-for-byte identical through every selection task. This
// rebuilds them with the same fixed seeds and asserts the structure hash matches
// tests/fixtures/selection-golden.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const trainingRoutes = require('../core/trainingRoutes');
const P = trainingRoutes._private;

const GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'selection-golden.json'), 'utf8'));
const PRIORITIES = [['Chest', 'Back'], ['Legs', 'Glutes'], ['Shoulders', 'Arms'], ['Back', 'Arms'], ['Core', 'Calves'], ['Chest', 'Core'], ['Glutes', 'Calves']];

function prof(disc, days, pr, seed) {
  return {
    discipline: disc, phase: 'maintain', daysPerWeek: days, planSeed: seed,
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    emphasis: pr.map((x) => x.toLowerCase()), unavailableDays: [], equipmentStylePref: 'mix',
    strength: { phase: 'maintain', trainingAgeBucket: '6_18', timePerSession: '60_75', equipmentStylePref: 'mix', injury: { has: false, joints: [], note: '' }, injurySeverityByJoint: {} }
  };
}
function canon(plan) {
  return (plan.weeks || []).map((w) => ({
    wk: w.weekIndex,
    days: (w.days || []).map((d) => ({ t: d.dayType, ex: (d.exercises || []).map((e) => [e.name, e.sets, e.reps, e.muscleTarget || e.primary]) }))
  }));
}
function hashOf(plan) {
  return crypto.createHash('sha256').update(JSON.stringify(canon(plan))).digest('hex').slice(0, 16);
}

test('golden: the 56 healthy builds remain byte-for-byte identical', () => {
  let checked = 0;
  for (const disc of ['bodybuilding', 'powerbuilding']) {
    for (const days of [3, 4, 5, 6]) {
      for (const pr of PRIORITIES) {
        const key = `${disc}-${days}-${pr.join(',')}`;
        const golden = GOLDEN[key];
        assert.ok(golden && golden.hash, `missing golden fixture for ${key}`);
        const coerced = P.coerceClassicBodybuildingToOblueprintPayload(prof(disc, days, pr, golden.seed));
        const built = P.buildOblueprintPlanWithFallback(coerced);
        assert.equal(built.error, undefined, `golden build regressed to an error: ${key}`);
        assert.equal(hashOf(built.plan), golden.hash, `golden build drift for ${key}`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 56, 'expected 56 golden builds');
});
