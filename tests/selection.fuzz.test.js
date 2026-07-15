'use strict';
// Selection work order — Task 7: the proof.
// Cartesian-sample thousands of onboarding inputs and assert EVERY one produces a
// good plan through the real user path (buildOblueprintPlanWithFallback, which now
// has the safe-fallback floor). This is the artifact behind "everyone gets a great
// workout" — checked, not hoped.
//
// Sample size via env: SELECTION_FUZZ=<n> (default 400; set higher locally/nightly).
const test = require('node:test');
const assert = require('node:assert/strict');
const trainingRoutes = require('../core/trainingRoutes');
const P = trainingRoutes._private;

const GOALS = ['Build size', 'Cut fat', 'Recomp'];
const DAYS = [2, 3, 4, 5, 6];
const TIMES = ['30', '45', '60', '75+'];
const AGES = ['<6m', '6-24m', '2-5y', '5y+'];
const EQUIP_SETS = [
  { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true }, // full
  { bodyweight: true, dumbbell: true },                                            // dumbbell only
  { bodyweight: true, machine: true, cable: true },                                // machine/cable
  { bodyweight: true, barbell: true },                                             // barbell only
  { bodyweight: true },                                                            // bodyweight only
];
const INJURIES = [[], ['Shoulder'], ['Lower back'], ['Knee'], ['Elbow'], ['Wrist'], ['Hip'], ['Ankle'],
  ['Shoulder', 'Knee'], ['Lower back', 'Wrist'], ['Shoulder', 'Elbow'], ['Knee', 'Hip']];
const PRIORITIES = [['Chest', 'Back'], ['Legs', 'Glutes'], ['Shoulders', 'Arms'], ['Back', 'Arms'],
  ['Core', 'Calves'], ['Chest', 'Core'], ['Glutes', 'Calves'], ['Arms', 'Shoulders'], ['Neck', 'Forearms']];
const DISCIPLINES = ['bodybuilding', 'powerbuilding'];

// Unambiguous name-based contraindications per injury (matches the style of the
// existing safety tests) — the "never relax safety" line.
const CONTRA = {
  'Lower back': [/good morning/i, /conventional deadlift/i, /barbell.*good morning/i],
  Knee: [/pistol squat/i, /sissy squat/i],
  Shoulder: [/behind the neck/i, /upright row/i],
  Wrist: [/\bfront squat\b/i],
};

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function makeIntake(rng) {
  const injuries = pick(rng, INJURIES);
  const painProfilesByArea = {};
  for (const j of injuries) painProfilesByArea[j] = { severity: 5 + Math.floor(rng() * 4), recency: 'Recent' };
  return {
    discipline: pick(rng, DISCIPLINES),
    phase: pick(rng, ['surplus', 'deficit', 'maintain']),
    daysPerWeek: pick(rng, DAYS),
    planSeed: Math.floor(rng() * 1e9),
    equipmentAccess: pick(rng, EQUIP_SETS),
    emphasis: pick(rng, PRIORITIES).map((x) => x.toLowerCase()),
    unavailableDays: [],
    equipmentStylePref: 'mix',
    painAreas: injuries,
    painProfilesByArea,
    strength: {
      phase: 'maintain', trainingAgeBucket: '6_18', timePerSession: pick(rng, ['30', '45_60', '60_75']),
      equipmentStylePref: 'mix', injury: { has: injuries.length > 0, joints: injuries.map((x) => x.toLowerCase()), note: '' },
      injurySeverityByJoint: Object.fromEntries(injuries.map((j) => [j.toLowerCase(), painProfilesByArea[j].severity]))
    }
  };
}

// The good-plan rubric — complete, safe, coherent (the always-true core).
function assertGoodPlan(plan, intake, label) {
  assert.ok(plan && Array.isArray(plan.weeks) && plan.weeks.length, `${label}: plan has weeks`);
  const injuries = Array.isArray(intake.painAreas) ? intake.painAreas : [];
  const contra = injuries.flatMap((j) => CONTRA[j] || []);
  for (const w of plan.weeks) {
    assert.ok(Array.isArray(w.days) && w.days.length === intake.daysPerWeek, `${label}: week ${w.weekIndex} has ${intake.daysPerWeek} days`);
    for (const d of w.days) {
      assert.ok(Array.isArray(d.exercises) && d.exercises.length >= 2, `${label}: ${d.dayType} complete (>=2 exercises)`);
      // Coherent = no duplicate within a DAY. Repeating a key movement on
      // different days within a week is intentional (training frequency), not a bug.
      const namesThisDay = new Set();
      for (const e of d.exercises) {
        const name = String(e.name || e.displayName || '');
        assert.ok(name, `${label}: exercise has a name`);                       // complete
        assert.ok(!namesThisDay.has(name), `${label}: no duplicate "${name}" within a day`); // coherent
        namesThisDay.add(name);
        for (const re of contra) assert.ok(!re.test(name), `${label}: injury-contraindicated exercise "${name}"`); // safe
      }
    }
  }
}

test('fuzz: every sampled onboarding input yields a good plan (no failure/empty/unsafe)', () => {
  const N = Math.max(50, Number(process.env.SELECTION_FUZZ) || 400);
  const rng = mulberry32(20260715);
  const failures = [];
  let checked = 0;
  for (let i = 0; i < N; i += 1) {
    const intake = makeIntake(rng);
    const label = `case ${i} [${intake.discipline} d${intake.daysPerWeek} eq{${Object.keys(intake.equipmentAccess).join(',')}} inj{${(intake.painAreas || []).join(',')}}]`;
    try {
      const coerced = P.coerceClassicBodybuildingToOblueprintPayload(intake);
      const built = P.buildOblueprintPlanWithFallback(coerced, { fastBuild: true });
      assert.equal(built.error, undefined, `${label}: build returned an error`); // never a failure
      assertGoodPlan(built.plan, intake, label);
      checked += 1;
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
    }
  }
  if (failures.length) {
    throw new Error(`${failures.length}/${N} fuzz cases failed the good-plan rubric:\n  ` + failures.slice(0, 15).join('\n  '));
  }
  assert.equal(checked, N, 'all sampled cases checked');
});
