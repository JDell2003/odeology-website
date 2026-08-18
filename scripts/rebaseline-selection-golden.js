/* Re-baseline tests/fixtures/selection-golden.json.

   Golden drift is allowed, but only when it is intentional and re-baselined in
   the same commit with the before/after diff in the message. This script exists
   so that re-baselining is a deliberate, reviewable act rather than someone
   pasting a new hash over a failing one: it prints exactly which keys moved and
   refuses to write anything unless --write is passed.

   Usage:
     node scripts/rebaseline-selection-golden.js          # report drift only
     node scripts/rebaseline-selection-golden.js --write  # rewrite the fixture
*/
'use strict';
console.info = () => {}; console.log = () => {}; console.warn = () => {}; console.debug = () => {};

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const P = require('../core/trainingRoutes')._private;

const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'selection-golden.json');
const GOLDEN = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const PRIORITIES = [['Chest', 'Back'], ['Legs', 'Glutes'], ['Shoulders', 'Arms'], ['Back', 'Arms'], ['Core', 'Calves'], ['Chest', 'Core'], ['Glutes', 'Calves']];

const prof = (disc, days, pr, seed) => ({
  discipline: disc, phase: 'maintain', daysPerWeek: days, planSeed: seed,
  equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
  emphasis: pr.map((x) => x.toLowerCase()), unavailableDays: [], equipmentStylePref: 'mix',
  strength: { phase: 'maintain', trainingAgeBucket: '6_18', timePerSession: '60_75', equipmentStylePref: 'mix', injury: { has: false, joints: [], note: '' }, injurySeverityByJoint: {} }
});
const canon = (plan) => (plan.weeks || []).map((w) => ({
  wk: w.weekIndex,
  days: (w.days || []).map((d) => ({ t: d.dayType, ex: (d.exercises || []).map((e) => [e.name, e.sets, e.reps, e.muscleTarget || e.primary]) }))
}));
const hashOf = (plan) => crypto.createHash('sha256').update(JSON.stringify(canon(plan))).digest('hex').slice(0, 16);
const namesOf = (plan) => (plan.weeks?.[0]?.days || []).map((d) => `${d.dayType}: ${(d.exercises || []).map((e) => e.name).join(' | ')}`);

const next = {};
const moved = [];
for (const disc of ['bodybuilding', 'powerbuilding']) {
  for (const days of [3, 4, 5, 6]) {
    for (const pr of PRIORITIES) {
      const key = `${disc}-${days}-${pr.join(',')}`;
      const prev = GOLDEN[key];
      const built = P.buildOblueprintPlanWithFallback(P.coerceClassicBodybuildingToOblueprintPayload(prof(disc, days, pr, prev.seed)));
      if (built.error) { process.stderr.write(`ERROR building ${key}: ${JSON.stringify(built.error).slice(0, 120)}\n`); process.exit(1); }
      const hash = hashOf(built.plan);
      // week1 is the human-readable record of what the hash covers. It has to
      // move with the hash or the fixture documents a plan that no longer exists.
      next[key] = { seed: prev.seed, hash, week1: canon(built.plan)[0] };
      if (hash !== prev.hash) moved.push({ key, from: prev.hash, to: hash, week1: namesOf(built.plan) });
    }
  }
}

process.stderr.write(`\n${Object.keys(next).length} builds, ${moved.length} drifted\n`);
for (const m of moved) {
  process.stderr.write(`\n  ${m.key}\n    ${m.from} -> ${m.to}\n`);
  for (const line of m.week1) process.stderr.write(`      ${line}\n`);
}

if (!process.argv.includes('--write')) {
  process.stderr.write(`\n(report only — pass --write to rewrite the fixture)\n`);
  process.exit(moved.length ? 1 : 0);
}
// Match the file's existing serialisation exactly — 1-space indent, CRLF, no
// trailing newline — so the diff shows the drifted entries and nothing else.
fs.writeFileSync(FIXTURE, JSON.stringify(next, null, 1).replace(/\n/g, '\r\n'), 'utf8');
process.stderr.write(`\nrewrote ${FIXTURE}\n`);
