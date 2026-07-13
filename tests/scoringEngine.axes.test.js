// v2 scoring (SCORING_ENGINE_V2) — Task 10: nutrition / recovery / consistency
// axis behavior + top-level determinism.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../core/scoringEngine');
const C = require('../core/scoringConstants');

test('nutrition: calories-in-band + protein-floor day earns full credit; junk day earns none', () => {
  const full = engine.nutritionDayCredit(
    { calories: 2000, proteinG: 180 }, /* target */ 2000, /* weightKg */ 80, 'maintain'
  );
  assert.equal(full, 1.0);
  const none = engine.nutritionDayCredit(
    { calories: 3500, proteinG: 40 }, 2000, 80, 'maintain'
  );
  assert.equal(none, 0);
});

test('nutrition: meals-on-plan alone (no macros) earns partial credit', () => {
  const partial = engine.nutritionDayCredit({ mealsOnPlan: 'yes' }, null, null, 'maintain');
  assert.equal(partial, 0.5);
});

test('recovery: 8 hours of sleep sits in the adult band for full duration credit', () => {
  assert.equal(engine.sleepDurationPts(8, false), 100);
  // way outside the band earns less
  assert.ok(engine.sleepDurationPts(4, false) < 100);
  assert.ok(engine.sleepDurationPts(12, false) < 100);
});

test('cardio grading anchors: WHO 150/300 minutes map to the tagged points', () => {
  const a = C.cardio.whoMinutesAnchors;
  assert.equal(engine.gradeWhoMinutes(150), a.moderateMin150Points);
  assert.equal(engine.gradeWhoMinutes(300), a.moderateMin300Points);
});

test('vo2max grading: the 50th-percentile value anchors ~50 points', () => {
  const mid = C.cardio.vo2max50thBySexDecade.male['30'];
  const pts = engine.gradeVo2max(mid, { sex: 'male', dob: null, age: 30 }, new Date());
  assert.ok(Math.abs(pts - 50) < 1, `50th-pct VO2max should anchor ~50, got ${pts}`);
});

test('determinism: computeAxes returns identical output for identical input', () => {
  const inputs = {
    profile: { sex: 'female', bodyweightLb: 140, age: 28 },
    strength: { bestE1rmByLift: { squat: 200 }, currentAvgRelStrength: 1.2, baselineAvgRelStrength: 1.0, idleDays: 1, provenance: 'device', pauseActive: false },
    cardio: { weeklyModerateMinutes: 180, weeklyVigorousMinutes: 30, vo2max: 40, stepsAvgPerDay: 9000, provenance: 'device', idleDays: 1, pauseActive: false },
    consistency: { days: [{ daysAgo: 0, active: true, provenance: 'device' }, { daysAgo: 1, active: true, provenance: 'self_report' }], idleDays: 0, pauseActive: false },
    nutrition: { days: [{ daysAgo: 0, calories: 1800, proteinG: 130, provenance: 'self_report' }], calorieTargetKcal: 1800, weightKg: 63, goalMode: 'cut', idleDays: 0, pauseActive: false },
    recovery: { days: [{ daysAgo: 0, sleepMinutes: 480, restedness1to5: 4, provenance: 'device' }], consecutiveTrainingDays: 2, isSenior: false, idleDays: 0, pauseActive: false },
    progress: { weighins: [{ daysAgo: 14, weightLb: 142 }, { daysAgo: 0, weightLb: 140 }], goalMode: 'cut', experience: 'intermediate', liftImprovementRatio: 1.1, idleDays: 0, pauseActive: false },
    weeksAtCandidate: {}
  };
  const fixedDay = new Date('2026-07-13T12:00:00Z');
  const a = engine.computeAxes(inputs, {}, fixedDay);
  const b = engine.computeAxes(inputs, {}, fixedDay);
  assert.deepEqual(a.axes, b.axes);
  assert.equal(a.rank, b.rank);
  for (const axis of engine.AXES) {
    assert.ok(a.axes[axis] >= 0 && a.axes[axis] <= 100, `${axis} in range`);
  }
});
