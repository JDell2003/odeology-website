const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../generator/trainingEngine.oblueprint');
const military = require('../generator/militaryHybrid.oblueprint');
const { basePayload } = require('./militaryHybrid.matrix.test');

function normalize(overrides = {}) {
  const result = engine.normalizeUserInput(basePayload(overrides));
  assert.equal(result?.error, undefined, result?.reason || result?.error);
  return result;
}

test('military hybrid activates only through the military lane', () => {
  const user = normalize();
  assert.equal(user.discipline, 'military');
  assert.ok(user.profile.military);

  const bodybuilding = engine.normalizeUserInput(basePayload({
    discipline: 'bodybuilding',
    trainingFeel: 'Aesthetic bodybuilding'
  }));
  assert.equal(bodybuilding?.error, undefined);
  assert.equal(bodybuilding.profile.military, undefined);
});

test('military split scales from two through six days', () => {
  for (let days = 2; days <= 6; days += 1) {
    const user = normalize({
      daysPerWeek: days,
      preferredDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].slice(0, days)
    });
    const split = military.buildMilitarySplit(user);
    assert.equal(split.length, days);
    assert.ok(split.some((entry) => /Lower|FullBody/.test(entry.dayType)));
  }
});

test('low recovery caps hard conditioning and accessory density', () => {
  const normal = normalize({ sleepHours: 8, stress: 'Low', primaryGoal: 'Build size' });
  const low = normalize({ sleepHours: 5, stress: 'High', primaryGoal: 'Cut fat' });
  assert.equal(low.profile.military.recoveryTier, 'low');
  assert.equal(low.profile.military.hardConditioningCap, 1);
  assert.ok(low.profile.military.accessoryMultiplier < normal.profile.military.accessoryMultiplier);
});

test('pain and avoid inputs change the weekly readiness budget', () => {
  const user = normalize({
    movementsToAvoid: ['deadlift', 'running'],
    painAreas: ['Shoulder', 'Ankle'],
    painProfilesByArea: {
      Shoulder: { severity: 8, recency: 'Recent' },
      Ankle: { severity: 8, recency: 'Recent' }
    }
  });
  assert.equal(user.profile.military.hingeBlocked, true);
  assert.equal(user.profile.military.runningBlocked, true);
  assert.equal(user.profile.military.impactRestricted, true);
  assert.equal(user.profile.military.pushupRestricted, true);
});

test('equipment profile distinguishes sled, carry load, and medicine ball access', () => {
  const full = normalize({ equipmentAccess: ['Barbell', 'Dumbbells', 'Sled', 'Medicine Ball'] });
  assert.equal(full.profile.military.hasSled, true);
  assert.equal(full.profile.military.hasCarryLoad, true);
  assert.equal(full.profile.military.hasMedicineBall, true);

  const bodyweight = normalize({ equipmentAccess: ['Bodyweight'] });
  assert.equal(bodyweight.profile.military.hasSled, false);
  assert.equal(bodyweight.profile.military.hasCarryLoad, false);
});

test('military strength slots use conservative strength progression', () => {
  const user = normalize();
  assert.deepEqual(military.repOverride('mh_hinge_strength', 'base'), { reps: '4-6', restSec: 180 });
  assert.deepEqual(military.repOverride('mh_hinge_strength', 'intensification'), { reps: '3-5', restSec: 180 });
  assert.equal(military.rirOverride(user, 'base', 'mh_hinge_strength'), '2-3');
  assert.match(military.progressionRuleOverride('mh_hinge_strength'), /never trade conditioning quality for a failed strength rep/i);
});
