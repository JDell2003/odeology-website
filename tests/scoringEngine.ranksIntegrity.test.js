// v2 scoring (SCORING_ENGINE_V2) — Task 10: rank sustain gate + plausibility timer
// + anomaly detection.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../core/scoringEngine');
const C = require('../core/scoringConstants');

const kingAxes = () => ({ strength: 90, cardio: 90, consistency: 90, nutrition: 90, recovery: 90, progress: 90 });

test('rank sustain: King requires 8 weeks - a momentary spike does not promote', () => {
  const axes = kingAxes(); // clears King avg/floor on the numbers alone
  const notYet = engine.computeRank(axes, { king: 0, knight: 0 }); // no sustain
  assert.notEqual(notYet.rank, 'king', 'instant King-level spike must not promote');

  const sustained = engine.computeRank(axes, { king: 8, knight: 8, squire: 8, specialist: 8 });
  assert.equal(sustained.rank, 'king', 'King promotes only after the sustain window');
});

test('rank: balanced elite clears Knight after its 2-week gate', () => {
  const axes = { strength: 72, cardio: 72, consistency: 72, nutrition: 72, recovery: 72, progress: 72 };
  const held = engine.computeRank(axes, { knight: 2, squire: 2, specialist: 2, king: 0 });
  assert.equal(held.rank, 'knight');
});

test('rank: five weak axes and one 100 can never be King (no pierce path)', () => {
  const axes = { strength: 100, cardio: 20, consistency: 20, nutrition: 20, recovery: 20, progress: 20 };
  const r = engine.computeRank(axes, { king: 52, knight: 52, specialist: 52, squire: 52 });
  assert.notEqual(r.rank, 'king');
  assert.notEqual(r.rank, 'knight');
});

test('plausibility: a 10-second "45-minute" workout is voided', () => {
  const v = engine.assessWorkoutPlausibility({ durationMs: 10 * 1000, projectedMinutes: 45 });
  assert.equal(v.verdict, 'void');
});

test('plausibility: a genuine full-length workout counts', () => {
  const v = engine.assessWorkoutPlausibility({ durationMs: 40 * 60 * 1000, projectedMinutes: 45 });
  assert.equal(v.verdict, 'ok');
});

test('plausibility: a late submission with no timer still counts inside grace', () => {
  const performedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString(); // 3h ago
  const submittedAt = new Date().toISOString();
  const v = engine.assessWorkoutPlausibility({ durationMs: 0, projectedMinutes: 45, performedAt, submittedAt });
  assert.equal(v.verdict, 'late_ok');
});

test('anomaly: an impossible weekly 1RM leap is flagged', () => {
  // +30% in one week is far above the implausible weekly-gain threshold.
  const flagged = engine.detectE1rmJump(200, 260, 7);
  assert.equal(flagged, true);
  // a normal week-over-week bump is not flagged.
  const ok = engine.detectE1rmJump(200, 204, 7);
  assert.equal(ok, false);
});

test('progress: matching the safe fat-loss rate beats exceeding it (crash-cut protection)', () => {
  const band = C.progress.safeFatLossPctBWPerWeek;
  const safe = engine.gradeProgressRate(-((band.min + band.max) / 2), 'cut', 'intermediate');
  const crash = engine.gradeProgressRate(-(band.max * 2.5), 'cut', 'intermediate');
  assert.ok(safe > crash, `safe cut (${safe}) should score above a crash cut (${crash})`);
  assert.equal(safe, 100, 'a rate inside the safe band earns full credit');
});

test('progress: a maintenance goal rewards a flat trend', () => {
  const flat = engine.gradeProgressRate(0, 'maintain', 'intermediate');
  assert.equal(flat, 100, 'flat trend IS success for maintenance');
});
