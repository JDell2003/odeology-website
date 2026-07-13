// v2 scoring (SCORING_ENGINE_V2) — Task 10: strength normalization + fairness.
// House style: plain node:test against the pure engine (mirrors
// tests/cut-mode.policy.test.js). Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../core/scoringEngine');
const C = require('../core/scoringConstants');

test('fairness: a lighter woman out-scores a heavier man at the same absolute load', () => {
  // Same absolute bench e1RM (180 lb), different bodyweights + sexes.
  const woman = engine.normalizeStrength(
    { bench: 180 },
    { sex: 'female', bodyweightLb: 135, age: 30 }
  );
  const man = engine.normalizeStrength(
    { bench: 180 },
    { sex: 'male', bodyweightLb: 250, age: 30 }
  );
  assert.equal(woman.normalized, true);
  assert.equal(man.normalized, true);
  assert.ok(woman.standard > man.standard,
    `expected woman (${woman.standard}) to out-score man (${man.standard}) at equal absolute load`);
});

test('sex missing -> normalized:false and standard:null (self-only path)', () => {
  const r = engine.normalizeStrength({ bench: 225 }, { bodyweightLb: 180, age: 30 });
  assert.equal(r.normalized, false);
  assert.equal(r.standard, null);
  // blend() must fall back to the self score when standard is null.
  assert.equal(engine.blend(null, 62), 62);
});

test('elite relative strength maps toward the top anchor', () => {
  // Male deadlift at 3x bodyweight = elite (100-pt anchor) for that lift.
  const r = engine.normalizeStrength(
    { deadlift: 600 },
    { sex: 'male', bodyweightLb: 200, age: 30 }
  );
  assert.ok(r.standard >= C.strength.anchorPoints.advanced,
    `elite lifter should be >= advanced anchor, got ${r.standard}`);
});

test('best-recent bank: a lower fresh reading does not crash the score', () => {
  // Previous strength 80; a fresh but lower reading inside the window (350 -> 320
  // analogue) should only glide down at the decay rate, not collapse.
  const events = [];
  const prev = 80;
  const out = engine.computeStrength(
    {
      profile: { sex: 'male', bodyweightLb: 200, age: 30 },
      strength: {
        bestE1rmByLift: { bench: 135 }, // deliberately modest fresh reading
        currentAvgRelStrength: 1.0,
        baselineAvgRelStrength: 1.0,
        idleDays: 0,
        provenance: 'device',
        pauseActive: false
      }
    },
    prev,
    events
  );
  assert.ok(out.score >= prev - C.decay.strength.perDay - 0.01,
    `banked score should not drop more than one day of decay (${out.score} vs ${prev})`);
});

test('age handicap credits lifters over 40', () => {
  const young = engine.normalizeStrength({ squat: 300 }, { sex: 'male', bodyweightLb: 200, age: 30 });
  const master = engine.normalizeStrength({ squat: 300 }, { sex: 'male', bodyweightLb: 200, age: 60 });
  assert.ok(master.standard > young.standard,
    `60yo should get an age-adjusted bump over 30yo at equal lift (${master.standard} vs ${young.standard})`);
});
