const assert = require('assert');
const { generatePlan, applyLogAdjustments } = require('../core/trainingEngine');

function pickExercise(plan, { weekIndex = 1, dayIndex = 1, baseId }) {
  const week = (plan.weeks || []).find((w) => Number(w?.index) === Number(weekIndex)) || null;
  assert(week, `Missing week ${weekIndex}`);
  const day = (week.days || [])[Number(dayIndex) - 1] || null;
  assert(day, `Missing day ${dayIndex}`);
  const ex = (day.exercises || []).find((e) => String(e?.baseId) === String(baseId)) || null;
  assert(ex, `Missing exercise baseId=${baseId}`);
  assert(ex.projected && Number.isFinite(ex.projected.value), `Missing projected weight for ${baseId}`);
  return ex;
}

function mkPlan(experience = 'intermediate') {
  return generatePlan({
    discipline: 'bodybuilding',
    daysPerWeek: 3,
    experience,
    strength: {
      bodyweight: 190,
      benchWeight: 185,
      benchReps: 8,
      lowerWeight: 225,
      lowerReps: 10,
      hingeWeight: 225,
      hingeReps: 8,
      rowWeight: 160,
      rowReps: 10,
      lowerMovement: 'squat',
      hingeMovement: 'rdl',
      pressMovement: 'Bench Press',
      pullMovement: 'Row',
      legMovement: 'Back Squat',
      pressDate: '2026-02-01',
      pullDate: '2026-02-01',
      legDate: '2026-02-01'
    }
  });
}

function logEntryFrom(ex, { targetW, actualW, actualR, rpe = 9, notes = '' }) {
  return {
    baseId: ex.baseId,
    target: { weight: targetW },
    prescribed: { repsTarget: Number.isFinite(ex?.progression?.repsTarget) ? ex.progression.repsTarget : null },
    actual: { weight: actualW, reps: actualR, rpe },
    notes
  };
}

// Case 1: Exceeds projected weight -> baseline updates; next week holds load and pushes reps.
{
  const plan = mkPlan('intermediate');
  const ex = pickExercise(plan, { baseId: 'press' });
  const tW = ex.projected.value;
  const tR = ex.progression.repsTarget;
  const updated = applyLogAdjustments({
    plan,
    experience: 'intermediate',
    workoutLog: { weekIndex: 1, dayIndex: 1, notes: '', entries: [logEntryFrom(ex, { targetW: tW, actualW: tW + 10, actualR: tR })] }
  });
  const next = pickExercise(updated, { weekIndex: 2, baseId: 'press' });
  assert.strictEqual(next.projected.value, tW + 10);
  assert(next.progression.repsTarget >= tR);
}

// Case 2 (beginner): Hits target -> next week increases load.
{
  const plan = mkPlan('beginner');
  const ex = pickExercise(plan, { baseId: 'press' });
  const tW = ex.projected.value;
  const tR = ex.progression.repsTarget;
  const updated = applyLogAdjustments({
    plan,
    experience: 'beginner',
    workoutLog: { weekIndex: 1, dayIndex: 1, notes: '', entries: [logEntryFrom(ex, { targetW: tW, actualW: tW, actualR: tR, rpe: 8 })] }
  });
  const next = pickExercise(updated, { weekIndex: 2, baseId: 'press' });
  assert(next.projected.value > tW);
}

// Case 4: Significant misses twice -> reduces load and resets rep target toward mid-range.
{
  let plan = mkPlan('intermediate');
  const ex = pickExercise(plan, { baseId: 'press' });
  const tW = ex.projected.value;
  const tR = ex.progression.repsTarget;
  plan = applyLogAdjustments({
    plan,
    experience: 'intermediate',
    workoutLog: { weekIndex: 1, dayIndex: 1, notes: '', entries: [logEntryFrom(ex, { targetW: tW, actualW: tW, actualR: Math.max(1, tR - 4) })] }
  });
  plan = applyLogAdjustments({
    plan,
    experience: 'intermediate',
    workoutLog: { weekIndex: 2, dayIndex: 1, notes: '', entries: [logEntryFrom(pickExercise(plan, { weekIndex: 2, baseId: 'press' }), { targetW: tW, actualW: tW, actualR: Math.max(1, tR - 4) })] }
  });
  const w3 = pickExercise(plan, { weekIndex: 3, baseId: 'press' });
  assert(w3.projected.value < tW);
}

console.log('smoke-training-engine: ok');
