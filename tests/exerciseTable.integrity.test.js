'use strict';
/* Exercise table integrity.

   The plan generator answers "what can this user do?" entirely from
   data/exercises.master.js. When a row lies in either direction the failure is
   silent and only shows up as a user getting a generic plan — or none:

     - "Car Deadlift" was tagged equipment ["Bodyweight"] and was one of only
       two bodyweight hinges in the table. It requires a car.
     - "Handstand Push-Ups" was tagged style "Skill", so it could never fill a
       slot requiring Compound. It was the only bodyweight vertical press.
     - Between them, a home user had zero eligible vertical presses, and
       VerticalPush@Shoulders was 57% of every "no eligible exercise" failure.

   The coverage test below is the important one: it turns "the builder cannot
   find a vertical press for this user" from a runtime failure into a build-time
   failure, which is the only reason the two above survived as long as they did.

   Run: node --test tests/exerciseTable.integrity.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const engine = require('../generator/trainingEngine.oblueprint');
const trainingRoutes = require('../core/trainingRoutes');
const P = trainingRoutes._private;

const TABLE = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.master.js'), 'utf8');
  return Function(`return (${src.replace(/^\s*export\s+const\s+exercises\s*=\s*/, '').replace(/;\s*$/, '')});`)();
})();
const POOL = engine.preprocessExercises(TABLE).exercises;

const isBodyweight = (row) => (row.equipment || []).every((e) => /bodyweight/i.test(String(e)));

function userFor(equipmentAccess, trainingAgeBucket = '6_18') {
  return engine.normalizeUserInput(P.coerceClassicBodybuildingToOblueprintPayload({
    discipline: 'bodybuilding', phase: 'maintain', daysPerWeek: 4, planSeed: 1,
    equipmentAccess, emphasis: ['chest', 'back'], unavailableDays: [], equipmentStylePref: 'mix',
    strength: {
      phase: 'maintain', trainingAgeBucket, timePerSession: '45_60', equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' }, injurySeverityByJoint: {},
      bench: 185, squat: 245, deadlift: 315
    }
  }));
}

/* ---------------------------------------------------------------- equipment */

test('no row tagged Bodyweight names equipment it would actually need', () => {
  // "Bodyweight" here means floor, wall, or pull-up bar. Anything you have to
  // buy is not bodyweight, however the source database tagged it.
  const IMPLIES_EQUIPMENT = /\b(plate|barbell|dumbbell|kettlebell|machine|cable|sled|band|banded|car|rickshaw|yoke|keg|stone|tire|log|chain|smith|prowler|sandbag)\b/i;
  const offenders = TABLE
    .filter((row) => isBodyweight(row) && IMPLIES_EQUIPMENT.test(String(row.name)))
    .map((row) => `${row.name} -> ${JSON.stringify(row.equipment)}`);
  assert.deepEqual(offenders, [], `rows tagged Bodyweight that name equipment:\n  ${offenders.join('\n  ')}`);
});

test('an explicit requiredEquipment on a row is what the engine uses', () => {
  // inferRequiredEquipment ADDS tokens parsed from the name on top of the
  // equipment field, so without this the name can override the data — which is
  // how a row tagged Bodyweight ended up requiring a dumbbell.
  const pinned = TABLE.filter((row) => Array.isArray(row.requiredEquipment) && row.requiredEquipment.length);
  assert.ok(pinned.length > 0, 'expected at least one row to pin requiredEquipment');
  for (const row of pinned) {
    const pooled = POOL.find((p) => p.name === row.name);
    if (!pooled) continue; // dropped by the ban list; covered by its own test
    assert.deepEqual(
      [...pooled.requiredEquipment].sort(),
      [...row.requiredEquipment.map((t) => String(t).toLowerCase())].sort(),
      `${row.name}: the engine ignored the row's explicit requiredEquipment`
    );
  }
});

/* ------------------------------------------------------------ style/pattern */

const COMPOUND_PATTERNS = new Set([
  'VerticalPush', 'HorizontalPush', 'VerticalPull', 'HorizontalPull',
  'Squat', 'Hinge', 'Lunge', 'Carry', 'Power'
]);

/* These 11 predate the repair pass and each needs a per-row judgement that is
   not mine to make unilaterally — "Power Partials" is a lateral raise filed as
   a chest press, "Smith Machine Hip Raise" is an ab movement filed as a glute
   hinge, and "Back Extension"/"Hyperextensions (Back Extensions)" are
   byte-identical duplicates. Listing them explicitly means the debt is visible
   and any NEW violation fails the build immediately, which is the point.
   Shrink this list; never grow it. */
const PENDING_STYLE_PATTERN_REVIEW = new Set([
  'Alternating Kettlebell Row', 'Back Extension', 'Band Pull Apart',
  'Hyperextensions (Back Extensions)', 'Incline Bench Pull',
  'Lying Cambered Barbell Row', 'Lying Close-Grip Barbell Triceps Press To Chin',
  'Lying Triceps Press', 'Power Partials', 'Scapular Pull-Up',
  'Smith Machine Hip Raise'
]);

test('no NEW Isolation row carries a compound movement pattern', () => {
  const offenders = TABLE
    .filter((row) => String(row.style) === 'Isolation' && COMPOUND_PATTERNS.has(String(row.pattern)))
    .filter((row) => !PENDING_STYLE_PATTERN_REVIEW.has(String(row.name)))
    .map((row) => `${row.name} (${row.pattern}/${row.style})`);
  assert.deepEqual(offenders, [], `Isolation rows with a compound pattern:\n  ${offenders.join('\n  ')}`);
});

test('the pending style/pattern list is still accurate — no row silently fixed or renamed', () => {
  const actual = new Set(TABLE
    .filter((row) => String(row.style) === 'Isolation' && COMPOUND_PATTERNS.has(String(row.pattern)))
    .map((row) => String(row.name)));
  const goneButListed = [...PENDING_STYLE_PATTERN_REVIEW].filter((name) => !actual.has(name));
  assert.deepEqual(goneButListed, [],
    `these are fixed — remove them from PENDING_STYLE_PATTERN_REVIEW:\n  ${goneButListed.join('\n  ')}`);
});

test('no Compound row carries the Isolation pattern', () => {
  const offenders = TABLE
    .filter((row) => String(row.style) === 'Compound' && String(row.pattern) === 'Isolation')
    .map((row) => `${row.name} (${row.pattern}/${row.style})`);
  assert.deepEqual(offenders, [], `Compound rows patterned Isolation:\n  ${offenders.join('\n  ')}`);
});

/* ------------------------------------------------------------------ images */

test('every row has an images array, and every entry is a non-empty string', () => {
  const offenders = [];
  for (const row of TABLE) {
    if (!Array.isArray(row.images)) { offenders.push(`${row.name}: images is ${typeof row.images}`); continue; }
    for (const img of row.images) {
      if (typeof img !== 'string' || !img.trim()) offenders.push(`${row.name}: bad image entry ${JSON.stringify(img)}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n  '));
});

/* --------------------------------------------------------- route repair map */

test('every ROUTE_REPLACEMENT_MAP spec names a real row', () => {
  const map = P.ROUTE_REPLACEMENT_MAP || {};
  const names = new Set(TABLE.map((row) => row.name));
  const missing = [];
  for (const [key, specs] of Object.entries(map)) {
    for (const spec of Array.isArray(specs) ? specs : []) {
      if (spec && spec.name && !names.has(spec.name)) missing.push(`${key}: "${spec.name}"`);
    }
  }
  assert.deepEqual(missing, [], `replacement specs naming rows that do not exist:\n  ${missing.join('\n  ')}`);
});

/* ---------------------------------------------------------------- coverage */

/* The pattern+muscle pairs the day blueprints require as Compound slots. If a
   pair has no eligible rows for a given user, that user's build fails or falls
   back — which is exactly what happened to every bodyweight user. */
const REQUIRED_SLOTS = [
  ['VerticalPush', ['Shoulders']],
  ['HorizontalPush', ['Chest']],
  ['VerticalPull', ['Back']],
  ['HorizontalPull', ['Back']],
  ['Squat', ['Legs', 'Glutes']],
  ['Hinge', ['Legs', 'Glutes']]
];

function eligibleCount(user, pattern, primaryAllowed) {
  const maxDifficulty = 4; // what any user the quiz can produce actually reaches
  return POOL.filter((ex) => String(ex.pattern) === pattern
    && String(ex.style) === 'Compound'
    && primaryAllowed.includes(String(ex.primary))
    && Number(ex.difficulty) <= maxDifficulty
    && engine.isExerciseCompatibleWithEquipment(ex, user)).length;
}

test('a bodyweight-only user has a real choice for every required slot', () => {
  const user = userFor({ bodyweight: true });
  const thin = [];
  for (const [pattern, primaryAllowed] of REQUIRED_SLOTS) {
    const n = eligibleCount(user, pattern, primaryAllowed);
    if (n < 3) thin.push(`${pattern}@${primaryAllowed.join('/')}: ${n} eligible (need 3)`);
  }
  assert.deepEqual(thin, [], `bodyweight-only coverage below the floor:\n  ${thin.join('\n  ')}`);
});

test('a bodyweight+dumbbell user has a real choice for every required slot', () => {
  const user = userFor({ bodyweight: true, dumbbell: true });
  const thin = [];
  for (const [pattern, primaryAllowed] of REQUIRED_SLOTS) {
    const n = eligibleCount(user, pattern, primaryAllowed);
    if (n < 5) thin.push(`${pattern}@${primaryAllowed.join('/')}: ${n} eligible (need 5)`);
  }
  assert.deepEqual(thin, [], `bodyweight+dumbbell coverage below the floor:\n  ${thin.join('\n  ')}`);
});
