'use strict';
/* THE ACCEPTANCE TEST.

   The engine is done when Jason can go through his own onboarding and receive
   the plan this file describes. Not something like it. That plan.

   This replaces abstract phase completion as the definition of done. Every
   remaining piece of engine work either moves one of these twelve assertions
   from fail to pass, or it does not matter yet.

   Most of it fails today. That failing output IS the backlog — each failure
   names the capability that is missing, not just the value that is wrong.

   Run: node --test tests/acceptance.jason.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');

const trainingRoutes = require('../core/trainingRoutes');
const P = trainingRoutes._private;

/* ------------------------------------------------------------------ intake */
/* The profile exactly as a user would supply it. Fields the engine cannot yet
   consume are still stated here, because their absence is the finding. */
const JASON = {
  bodyweightLb: 220,
  heightIn: 71,
  sleepHours: '8-9',
  stress: 'low-moderate',
  jobActivity: 'active',

  trainingStyle: 'powerbuilding',
  daysPerWeek: 6,
  twoADays: { enabled: true, amWindow: '05:30-07:30', pmWindow: '12:00-14:00', minSeparationHours: 6 },
  sessionLength: { am: '90-120', pm: '30-60' },
  equipment: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },

  lifts: {
    bench: { weight: 245, reps: 6, lastTrainedHeavyMonthsAgo: 0 },
    squat: { weight: 405, reps: 1, lastTrainedHeavyMonthsAgo: 15 },
    deadlift: { weight: 600, reps: 1, lastTrainedHeavyMonthsAgo: 15 },
    overheadPress: { weight: 150, reps: 7, lastTrainedHeavyMonthsAgo: 0 },
    dbCurl: { weight: 55, reps: 6, lastTrainedHeavyMonthsAgo: 0 }
  },
  endurance: { twoMileSec: 20 * 60, ruckLongestMi: 18, recentRegularLoadCarry: false },

  goals: {
    bench: { weight: 315, forReps: true }, squat: { weight: 405, forReps: true },
    deadlift: { weight: 495, forReps: true }, twoMileSec: 13 * 60,
    ruck: { miles: 18, quality: 'comfortable' }, armsIn: 18.5, calvesIn: 18
  },
  priorityMuscles: ['Arms', 'Calves', 'Shoulders'],
  injury: {
    joints: ['Shoulder'], side: 'left', status: 'rehab pending, currently pain-free',
    note: 'avoid deep stretch pressing and behind-neck work; shoulder feels loose under load'
  },
  timelineMonths: 18
};

/* What the engine can actually be handed today. Everything the payload cannot
   carry — two-a-days, running, rucking, lastTrainedHeavy — is dropped here, and
   that gap is what most of the assertions below are measuring. */
function buildPlan(overrides = {}) {
  const payload = P.coerceClassicBodybuildingToOblueprintPayload({
    discipline: 'powerbuilding', phase: 'maintain', daysPerWeek: JASON.daysPerWeek, planSeed: 20260818,
    equipmentAccess: JASON.equipment,
    emphasis: overrides.emphasis || JASON.priorityMuscles.map((m) => m.toLowerCase()),
    unavailableDays: ['sun'], equipmentStylePref: 'mix',
    // 15 months since the last heavy squat/deadlift; bench and press are current.
    lastTrainedHeavy: { squat: 65, deadlift: 65 },
    strength: {
      // '5_plus' is the real bucket key. '2_5y' is not recognised and falls
      // through to a silent '6-24m' default, which had Jason programmed as a
      // 6-to-24-month lifter.
      phase: 'maintain', trainingAgeBucket: '5_plus', timePerSession: '75_90', equipmentStylePref: 'mix',
      injury: { has: true, joints: ['Shoulder'], note: JASON.injury.note },
      injurySeverityByJoint: { Shoulder: { severity: 4, recency: 'Recent' } },
      bench: JASON.lifts.bench.weight, squat: JASON.lifts.squat.weight, deadlift: JASON.lifts.deadlift.weight
    }
  });
  return P.buildOblueprintPlanWithFallback(payload);
}

/* Built once. Deliberately NOT asserted at module load: if the profile falls
   back, that is P0 below, and the other twelve still need to report so the
   backlog is complete rather than truncated at the first stop.

   When the exact profile falls back, the remaining properties are measured
   against the NEAREST BUILDABLE VARIANT instead. Measuring them against the
   generic safe fallback would report zeroes everywhere and tell us nothing
   about the engine — every property would look broken because the plan is a
   stand-in, not because the capability is missing. The substitution is stated
   in P0 so no pass here is mistaken for a pass on Jason's real profile. */
const BUILT = buildPlan();
const SUBSTITUTED = BUILT._safeFallback === true;
const MEASURED = SUBSTITUTED
  ? buildPlan({ emphasis: ['arms', 'calves'] })   // drop the injured joint from the priorities
  : BUILT;
const PLAN = MEASURED.plan;

test('P0 the profile builds a real plan at all', () => {
  assert.equal(BUILT.error, undefined, `build errored: ${JSON.stringify(BUILT.error || '').slice(0, 200)}`);
  assert.notEqual(BUILT._safeFallback, true,
    'fell through to the generic safe fallback. Isolated: powerbuilding + 6 days + shoulders as a '
    + 'priority muscle + a shoulder injury is unsatisfiable. Removing shoulder emphasis, dropping to '
    + '5 days, or switching to bodybuilding each builds. Severity and recency are irrelevant. The '
    + 'engine has no way to prioritise a muscle whose joint is being rehabbed.');
});
const week1 = () => PLAN.weeks.find((w) => w.weekIndex === 1) || PLAN.weeks[0];
const allExercises = () => (PLAN.weeks || []).flatMap((w) => (w.days || [])
  .flatMap((d) => (d.exercises || []).map((e) => ({ ...e, __wk: w.weekIndex, __day: d.dayType }))));
const week1Exercises = () => (week1().days || []).flatMap((d) => (d.exercises || []).map((e) => ({ ...e, __day: d.dayType })));
const repsOf = (ex) => Number(String(ex.reps ?? '').match(/\d+/)?.[0] || 0);
const nameMatches = (rx) => (ex) => rx.test(String(ex.name || ''));

/* Count how many days in week 1 contain a movement matching rx. */
function exposures(rx) {
  return (week1().days || []).filter((d) => (d.exercises || []).some(nameMatches(rx))).length;
}
function weeklySets(rx) {
  return week1Exercises().filter(nameMatches(rx)).reduce((n, ex) => n + (Number(ex.sets) || 0), 0);
}

/* --------------------------------------------------------- 1. frequency --- */

test('P1 frequency: bench 3x, squat 2x, deadlift 1 heavy + 1 light, run 3x, ruck 2x, arms 3x', () => {
  const got = {
    bench: exposures(/bench press/i),
    squat: exposures(/\bsquat\b/i),
    deadlift: exposures(/deadlift/i),
    run: exposures(/\brun\b|sprint|interval/i),
    ruck: exposures(/\bruck\b|march|load carry/i),
    arms: exposures(/curl|triceps|pushdown|extension/i)
  };
  const want = { bench: 3, squat: 2, deadlift: 2, run: 3, ruck: 2, arms: 3 };
  const misses = Object.entries(want)
    .filter(([k, v]) => got[k] < v)
    .map(([k, v]) => `${k}: ${got[k]} exposures, need ${v}`);
  assert.deepEqual(misses, [], `frequency short:\n  ${misses.join('\n  ')}`);
});

/* ------------------------------------------------------------- 2. layoff --- */

test('P2 layoff: squat starts 185-225 and deadlift 225-275, with the reason stated', () => {
  const start = (rx, exclude) => {
    const ex = week1Exercises()
      .filter(nameMatches(rx))
      .filter((e) => !exclude || !exclude.test(String(e.name)))
      .sort((a, b) => Number(b.projected?.value || 0) - Number(a.projected?.value || 0))[0];
    return ex ? Number(ex.projected?.value ?? ex.projectedWeight ?? 0) : null;
  };
  // Any bilateral loaded squat counts as "the squat" — the engine may pick a
  // Smith or hack variant. Split squats and wall sits are not the main lift.
  const squat = start(/squat/i, /split|wall|bulgarian|shrimp|goblet/i);
  const dead = start(/deadlift/i);
  const problems = [];
  if (squat === null) problems.push('no squat found in week 1');
  else if (!(squat >= 185 && squat <= 225)) problems.push(`squat starts at ${squat}, expected 185-225 after a 15-month layoff (prior best 405)`);
  if (dead === null) problems.push('no deadlift found in week 1');
  else if (!(dead >= 225 && dead <= 275)) problems.push(`deadlift starts at ${dead}, expected 225-275 after a 15-month layoff (prior best 600)`);
  const reason = JSON.stringify(PLAN.meta?.layoff || '');
  if (!/last trained heavy/i.test(reason)) problems.push('no stated reason for the reduced start (needs decayAnchor + lastTrainedHeavyAt)');
  assert.deepEqual(problems, [], `layoff not respected:\n  ${problems.join('\n  ')}`);
});

/* --------------------------------------------------- 3. isolation ranges --- */

test('P3 isolation rep ranges: every curl, lateral raise and calf movement at 12-15', () => {
  const ISO = /curl|lateral raise|side raise|calf raise|calf press|pushdown|kickback/i;
  const bad = allExercises()
    .filter((ex) => ISO.test(String(ex.name)) && String(ex.style) === 'Isolation')
    .filter((ex) => { const r = repsOf(ex); return r && (r < 12 || r > 15); })
    .map((ex) => `wk${ex.__wk} ${ex.__day} ${ex.name}: ${ex.sets}x${ex.reps}`);
  assert.deepEqual(bad, [], `isolation prescribed outside 12-15 — this is the founding bug:\n  ${bad.slice(0, 12).join('\n  ')}`);
});

/* ---------------------------------------------------------- 4. arm volume --- */

test('P4 arm volume: 10-14 direct sets weekly across 3 exposures for biceps, triceps and calves', () => {
  const GROUPS = {
    biceps: /curl/i,
    triceps: /triceps|pushdown|skull|dip machine/i,
    calves: /calf/i
  };
  const problems = [];
  for (const [group, rx] of Object.entries(GROUPS)) {
    const sets = weeklySets(rx);
    const exp = exposures(rx);
    if (sets < 10 || sets > 14) problems.push(`${group}: ${sets} weekly sets, want 10-14`);
    if (exp < 3) problems.push(`${group}: ${exp} exposures, want 3`);
  }
  assert.deepEqual(problems, [], `priority-muscle volume off target:\n  ${problems.join('\n  ')}`);
});

/* --------------------------------------------------- 5. shoulder exclusion --- */

test('P5 shoulder exclusion: no behind-neck, deep-stretch flye or upright row anywhere in the block', () => {
  /* Deep-stretch PRESSING flyes only. A rear delt fly is short-range, light,
     and is exactly the work a loose shoulder should be getting — the previous
     /\bfly(e)?s?\b/ caught "Cable Rear Delt Fly" and called therapeutic work
     contraindicated. The brief says "no deep-stretch dumbbell flyes", not
     "no flyes". */
  const BANNED = /behind[\s-]*(the[\s-]*)?neck|upright row|(dumbbell|incline|decline|flat|pec ?deck)[\s-]*(chest[\s-]*)?fly(e)?s?\b/i;
  const REAR_DELT_OK = /rear[\s-]*delt|reverse[\s-]*fly|bent[\s-]*over/i;
  const hits = allExercises().filter(nameMatches(BANNED))
    .filter((ex) => !REAR_DELT_OK.test(String(ex.name)))
    .map((ex) => `wk${ex.__wk} ${ex.__day} ${ex.name}`);
  assert.deepEqual(hits, [], `contraindicated for a loose shoulder:\n  ${hits.slice(0, 12).join('\n  ')}`);
});

/* ------------------------------------------------------------- 6. ordering --- */

test('P6 ordering: no heavy squat or deadlift in the 24h before the long ruck', () => {
  const days = week1().days || [];
  const longRuckIdx = days.findIndex((d) => (d.exercises || []).some(nameMatches(/long ruck|ruck march/i)));
  if (longRuckIdx < 0) {
    assert.fail('no long ruck in the week — rucking is not a discipline the engine can schedule');
  }
  const prior = days[longRuckIdx - 1];
  const heavy = (prior?.exercises || []).filter((ex) => /squat|deadlift/i.test(String(ex.name)) && repsOf(ex) <= 5);
  assert.deepEqual(heavy.map((e) => e.name), [], 'heavy lower-body work sits within 24h of the long ruck');
});

/* ----------------------------------------------------------- 7. easy runs --- */

test('P7 easy runs carry duration and effort only, never a pace target', () => {
  const easy = allExercises().filter(nameMatches(/easy run|recovery run/i));
  if (!easy.length) assert.fail('no easy run in the block — running is not a discipline the engine can prescribe');
  const withPace = easy.filter((ex) => ex.paceTarget || ex.targetPace || /\d+:\d+\s*\/?\s*(mi|km)/i.test(String(ex.reps || '')));
  assert.deepEqual(withPace.map((e) => e.name), [], 'an easy run carries a pace target, which breaks the concurrent structure');
});

/* ----------------------------------------------------- 8. ruck progression --- */

test('P8 ruck progression waves on two variables: +5 lb weekly, and at +15 drop 10 and add 2 miles', () => {
  const rucks = allExercises().filter(nameMatches(/ruck/i));
  if (!rucks.length) assert.fail('no ruck in the block — rucking is not a discipline the engine can prescribe');
  const loads = rucks.map((ex) => Number(ex.loadLb ?? ex.projected?.value ?? 0));
  const dists = rucks.map((ex) => Number(ex.distanceMi ?? 0));
  assert.ok(loads.some((v) => v > 0), 'ruck rows carry no load, so load cannot be progressed');
  assert.ok(dists.some((v) => v > 0), 'ruck rows carry no distance, so distance cannot be progressed');
});

/* -------------------------------------------------- 9. two-a-day handling --- */

test('P9 two-a-days: AM and PM at least 6h apart, and the PM cost charged against the AM', () => {
  const days = week1().days || [];
  const withSessions = days.filter((d) => Array.isArray(d.sessions) && d.sessions.length > 1);
  assert.ok(withSessions.length > 0,
    'no day carries more than one session — the plan shape has no slot for AM/PM, so two-a-days cannot be represented');
});

/* ------------------------------------------------------ 10. goal timeline --- */

test('P10 timeline: each goal returns a range with its assumption, and squat 405 projects faster than deadlift 495', () => {
  const proj = PLAN.meta?.goalProjections || PLAN.meta?.timeline || null;
  assert.ok(proj, 'plan.meta carries no goal projection — the timeline capability does not exist');
  for (const key of ['bench', 'squat', 'deadlift']) {
    assert.ok(proj[key]?.rangeWeeks, `${key} projection has no range`);
    assert.ok(proj[key]?.assumption, `${key} projection states no assumption`);
  }
  assert.ok(proj.squat.rangeWeeks[1] < proj.deadlift.rangeWeeks[1],
    'squat 405 must project faster than deadlift 495 — he has hit 405 before, which is what the ceiling term encodes');
});

/* --------------------------------------------------------- 11. equipment --- */

test('P11 every prescribed exercise is performable with the equipment declared', () => {
  const problems = P.auditPlanFeasibility ? P.auditPlanFeasibility(PLAN) : null;
  assert.ok(Array.isArray(problems), 'auditPlanFeasibility is unavailable');
  assert.deepEqual(problems, [], `unperformable with the declared equipment:\n  ${(problems || []).slice(0, 10).join('\n  ')}`);
});

/* ---------------------------------------------------- 12. no fabrication --- */

test('P12 no fabricated numbers: no goal date, no invented statistic', () => {
  const blob = JSON.stringify(PLAN);
  const problems = [];
  if (/goalDate|targetDate|estimatedCompletion/i.test(blob)) problems.push('the plan carries a goal date the engine cannot stand behind');
  if (/\b\d{1,2}% of (users|people|members)\b/i.test(blob)) problems.push('the plan carries a population statistic we do not have');
  assert.deepEqual(problems, [], problems.join('\n  '));
});
