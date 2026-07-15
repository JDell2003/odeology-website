// Part C — consistency pairs with the training schedule.
// Proves the required tiering before SCORING_CONSISTENCY_PAIRED is ever flipped:
//   1. check-in only (on a scheduled workout day) = partial
//   2. check-in + planned workout = full (clearly higher than #1/#3)
//   3. missed scheduled-workout day = same low partial as #1
//   4. rest day with a check-in = full (NOT penalized for "no workout")
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../core/scoringEngine');
const C = require('../core/scoringConstants');

// Mirror of the gather's per-day completion (done/expected of the day's set).
function completion({ checkedIn = false, isScheduled = false, worked = false, cardioDone = false, mealsLogged = false }) {
  const Wp = C.consistencyPairing;
  const expected = Wp.checkin + (isScheduled ? Wp.workout : 0);
  const done = (checkedIn ? Wp.checkin : 0)
    + (isScheduled && worked ? Wp.workout : 0)
    + (cardioDone ? Wp.other : 0)
    + (mealsLogged ? Wp.other : 0)
    + (worked && !isScheduled ? Wp.other : 0);
  return expected > 0 ? Math.max(0, Math.min(1, done / expected)) : (checkedIn ? 1 : 0);
}

test('consistency pairing: the four day-cases produce the intended completion', () => {
  const checkinOnlyScheduled = completion({ checkedIn: true, isScheduled: true, worked: false });
  const checkinAndTrained    = completion({ checkedIn: true, isScheduled: true, worked: true });
  const missedScheduled      = completion({ checkedIn: true, isScheduled: true, worked: false });
  const restDayCheckin       = completion({ checkedIn: true, isScheduled: false, worked: false });

  assert.equal(checkinAndTrained, 1.0, 'check-in + planned workout is a full day');
  assert.equal(restDayCheckin, 1.0, 'rest-day check-in is full — no no-workout penalty');
  assert.equal(missedScheduled, checkinOnlyScheduled, 'missed scheduled workout == bare check-in');
  assert.ok(checkinOnlyScheduled > 0 && checkinOnlyScheduled < 0.5, 'check-in alone on a training day is partial');
  assert.ok(checkinAndTrained - checkinOnlyScheduled >= 0.5, 'trained scores CLEARLY higher than skipped');
});

test('consistency pairing: extra actions add credit but a skipped planned workout stays low', () => {
  // Even with cardio + meals logged, skipping the planned workout stays partial.
  const skippedButActive = completion({ checkedIn: true, isScheduled: true, worked: false, cardioDone: true, mealsLogged: true });
  const trained = completion({ checkedIn: true, isScheduled: true, worked: true });
  assert.ok(skippedButActive < trained, 'cardio+meals cannot fully replace the planned workout');
  assert.ok(skippedButActive > completion({ checkedIn: true, isScheduled: true, worked: false }), 'but they do add some credit');
});

test('consistency pairing: scores follow the tiering through the engine', () => {
  const window = (c) => ({
    consistency: {
      days: Array.from({ length: C.windows.consistencyDays }, (_, i) => ({ daysAgo: i, completion: c, provenance: 'self_report' })),
      idleDays: 0, pauseActive: false
    }
  });
  const ev = [];
  const trained = engine.computeConsistency(window(completion({ checkedIn: true, isScheduled: true, worked: true })), 50, ev).score;
  const skipped = engine.computeConsistency(window(completion({ checkedIn: true, isScheduled: true, worked: false })), 50, ev).score;
  const rest    = engine.computeConsistency(window(completion({ checkedIn: true, isScheduled: false, worked: false })), 50, ev).score;

  assert.ok(trained > skipped, 'checked-in + trained scores above checked-in but skipped');
  assert.ok(rest >= trained - 0.01, 'rest day with a check-in is not penalized');
  assert.ok(skipped > 0, 'a skipped-workout day with a check-in still earns partial credit');
});

test('consistency pairing: legacy binary `active` still works when completion is absent (flag off)', () => {
  const ev = [];
  const legacy = engine.computeConsistency({
    consistency: { days: Array.from({ length: 28 }, (_, i) => ({ daysAgo: i, active: true, provenance: 'self_report' })), idleDays: 0 }
  }, 50, ev).score;
  const paired = engine.computeConsistency({
    consistency: { days: Array.from({ length: 28 }, (_, i) => ({ daysAgo: i, completion: 1, provenance: 'self_report' })), idleDays: 0 }
  }, 50, ev).score;
  assert.equal(legacy, paired, 'active:true and completion:1 score identically — backward compatible');
});
