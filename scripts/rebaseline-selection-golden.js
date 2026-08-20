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
/* Guard: re-baselining must never launder a regression. Every build below is
   also swept against the structural standard, and --write refuses when the
   count is worse than the recorded baseline - a hash update cannot bless a
   plan that got structurally worse. */
const SWEEP_BASELINE = path.join(__dirname, '..', 'tests', 'fixtures', 'sweep-baseline.json');
const SWEEP_MIN = { Push: [2, 4], Pull: [2, 4], Upper: [2, 4], UpperFocus: [2, 4], Lower: [2, 4], LowerFocus: [2, 4], Legs: [2, 4], FullBodyA: [3, 4], FullBodyB: [3, 4], DeltsArms: [1, 4] };
const SWEEP_STRUCTURAL = ['Squat', 'Hinge', 'Lunge', 'HorizontalPush', 'VerticalPush', 'HorizontalPull', 'VerticalPull'];
let sweepViolations = 0;
let sweepFallbacks = 0;
function sweepPlan(built) {
  if (built && built._safeFallback) { sweepFallbacks += 1; return; }
  const week = built && built.plan && built.plan.weeks && built.plan.weeks[0];
  for (const day of (week && week.days) || []) {
    const m = SWEEP_MIN[String((day && day.dayType) || '')];
    if (!m) continue;
    const ex = (day && day.exercises) || [];
    const compounds = ex.filter((e) => SWEEP_STRUCTURAL.includes(String((e && e.pattern) || ''))).length;
    if (compounds < m[0] || ex.length < m[1]) sweepViolations += 1;
  }
}
for (const disc of ['bodybuilding', 'powerbuilding']) {
  for (const days of [3, 4, 5, 6]) {
    for (const pr of PRIORITIES) {
      const key = `${disc}-${days}-${pr.join(',')}`;
      const prev = GOLDEN[key];
      const built = P.buildOblueprintPlanWithFallback(P.coerceClassicBodybuildingToOblueprintPayload(prof(disc, days, pr, prev.seed)));
      if (built.error) { process.stderr.write(`ERROR building ${key}: ${JSON.stringify(built.error).slice(0, 120)}\n`); process.exit(1); }
      sweepPlan(built);
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

process.stderr.write('sweep: ' + sweepViolations + ' violations, ' + sweepFallbacks + ' fallbacks across the 56 golden builds' + String.fromCharCode(10));
let recordedSweep = null;
try { recordedSweep = JSON.parse(fs.readFileSync(SWEEP_BASELINE, 'utf8')); } catch (e) { recordedSweep = null; }
if (process.argv.includes('--write') && recordedSweep
  && (sweepViolations > Number(recordedSweep.violations || 0) || sweepFallbacks > Number(recordedSweep.fallbacks || 0))) {
  process.stderr.write('REFUSED: sweep regressed (recorded ' + recordedSweep.violations + ' violations / ' + recordedSweep.fallbacks + ' fallbacks). Fix the regression before re-baselining.' + String.fromCharCode(10));
  process.exit(1);
}
if (!process.argv.includes('--write')) {
  process.stderr.write(`\n(report only — pass --write to rewrite the fixture)\n`);
  process.exit(moved.length ? 1 : 0);
}
// Match the file's existing serialisation exactly — 1-space indent, CRLF, no
// trailing newline — so the diff shows the drifted entries and nothing else.
fs.writeFileSync(FIXTURE, JSON.stringify(next, null, 1).replace(/\n/g, '\r\n'), 'utf8');
fs.writeFileSync(SWEEP_BASELINE, JSON.stringify({ violations: sweepViolations, fallbacks: sweepFallbacks, at: 'golden-56' }, null, 1));
process.stderr.write(`\nrewrote ${FIXTURE}\n`);
