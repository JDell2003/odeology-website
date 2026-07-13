// v2 scoring (SCORING_ENGINE_V2) — Task 10: decay vs pause, and the trust ladder.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../core/scoringEngine');
const C = require('../core/scoringConstants');

test('decay: idle past the grace window erodes the score', () => {
  const prev = 90;
  const idle = C.decay.cardio.graceDays + 5; // 5 days past grace
  const out = engine.applyDecayOrPause(prev, 'cardio', idle, false, 0);
  const expected = prev - C.decay.cardio.perDay * 5;
  assert.ok(Math.abs(out - expected) < 1e-9, `expected ${expected}, got ${out}`);
  assert.ok(out < prev, 'idle score must decay below previous');
});

test('pause: an active pause freezes the score (no decay)', () => {
  const prev = 90;
  const idle = C.decay.cardio.graceDays + 20;
  const out = engine.applyDecayOrPause(prev, 'cardio', idle, /* pauseActive */ true, 0);
  assert.equal(out, prev, 'pause must freeze the score');
});

test('decay never falls below the seed floor', () => {
  const out = engine.applyDecayOrPause(10, 'consistency', 999, false, /* seed */ 8);
  assert.equal(out, 8, 'decay floors at the seed');
});

test('trust ladder: device > self_report > implausible', () => {
  assert.equal(engine.trustMultiplier('device'), C.trust.device);
  assert.equal(engine.trustMultiplier('self_report'), C.trust.self_report);
  assert.equal(engine.trustMultiplier('implausible'), 0);
  assert.ok(engine.trustMultiplier('device') > engine.trustMultiplier('self_report'));
  assert.ok(engine.trustMultiplier('self_report') > engine.trustMultiplier('implausible'));
});

test('trust ladder: honest self-report never scores zero', () => {
  assert.ok(engine.trustMultiplier('self_report') > 0);
});

test('cardio: a device-synced run out-tiers the same minutes typed in', () => {
  const base = {
    profile: { sex: 'male', bodyweightLb: 180, age: 30 },
    cardio: {
      weeklyModerateMinutes: 200, weeklyVigorousMinutes: 0, vo2max: null,
      stepsAvgPerDay: 0, idleDays: 0, pauseActive: false
    }
  };
  const device = engine.computeCardio({ ...base, cardio: { ...base.cardio, provenance: 'device' } }, 0, [], new Date());
  const self = engine.computeCardio({ ...base, cardio: { ...base.cardio, provenance: 'self_report' } }, 0, [], new Date());
  assert.ok(device.score > self.score,
    `device (${device.score}) should out-tier identical self-reported minutes (${self.score})`);
});

test('cardio: graded intensity beats steps-only, and steps are capped', () => {
  const today = new Date();
  const graded = engine.computeCardio({
    profile: { sex: 'male', bodyweightLb: 180, age: 30 },
    cardio: { weeklyModerateMinutes: 300, weeklyVigorousMinutes: 0, vo2max: null, stepsAvgPerDay: 0, provenance: 'device', idleDays: 0, pauseActive: false }
  }, 0, [], today);
  const stepsOnly = engine.computeCardio({
    profile: { sex: 'male', bodyweightLb: 180, age: 30 },
    cardio: { weeklyModerateMinutes: 0, weeklyVigorousMinutes: 0, vo2max: null, stepsAvgPerDay: 20000, provenance: 'device', idleDays: 0, pauseActive: false }
  }, 0, [], today);
  assert.ok(graded.score > stepsOnly.score, 'graded minutes should beat steps-only');
  assert.ok(stepsOnly.score <= C.cardio.stepsFallbackCapPoints,
    `steps-only score must be capped at ${C.cardio.stepsFallbackCapPoints}, got ${stepsOnly.score}`);
});
