'use strict';
// Selection work order — Task 2 pool audit.
// Counts injury-safe, equipment-compatible exercises for every
// (equipment subset x muscle) and (equipment subset x movement pattern) cell in
// the master catalog, flagging empty (0) and thin (<2) cells. Run:
//   node scripts/selection-pool-audit.js [--injuries]
const e = require('../generator/trainingEngine.oblueprint');
const fs = require('fs');
const path = require('path');

function loadMaster() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.master.js'), 'utf8');
  return Function(`return (${src.replace(/^\s*export\s+const\s+exercises\s*=\s*/, '').replace(/;\s*$/, '')})`)();
}

const EQUIP = {
  full: ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'pullup_bar'],
  dumbbell_only: ['dumbbell', 'bodyweight'],
  machine_cable: ['machine', 'cable', 'bodyweight'],
  bands_only: ['bands', 'bodyweight'],
  bodyweight_only: ['bodyweight']
};
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Arms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Forearms', 'Neck'];

function compat(x, allowed) {
  const req = Array.isArray(x.requiredEquipment) && x.requiredEquipment.length ? x.requiredEquipment : [];
  if (!req.length) return true;
  const A = new Set(allowed);
  for (const t of req) { if (t === 'bodyweight' && A.has('bodyweight')) continue; if (!A.has(t)) return false; }
  return true;
}
function primaryOf(x) { return String(x.primary || x.primaryMuscle || '').trim(); }
function matchesMuscle(x, m) {
  const p = primaryOf(x).toLowerCase();
  const dt = (x.directMuscleTargets || []).map((t) => String(t).toLowerCase());
  const sub = String(x.sub || '').toLowerCase();
  if (m === 'Arms') return /bicep|tricep|arm/.test(p) || dt.some((t) => /bicep|tricep/.test(t));
  return p === m.toLowerCase() || dt.includes(m.toLowerCase()) || sub.includes(m.toLowerCase());
}

function run() {
  const exs = (e.preprocessExercises(loadMaster()).exercises) || [];
  const patterns = [...new Set(exs.map((x) => String(x.pattern || '')).filter(Boolean))];
  const report = { catalog: exs.length, emptyMuscle: [], thinMuscle: [], emptyPattern: [], thinPattern: [] };
  for (const [ek, allowed] of Object.entries(EQUIP)) {
    for (const m of MUSCLES) {
      const n = exs.filter((x) => matchesMuscle(x, m) && compat(x, allowed)).length;
      if (n === 0) report.emptyMuscle.push(`${ek} x ${m}`);
      else if (n < 2) report.thinMuscle.push(`${ek} x ${m} (${n})`);
    }
    for (const p of patterns) {
      const n = exs.filter((x) => x.pattern === p && compat(x, allowed)).length;
      if (n === 0) report.emptyPattern.push(`${ek} x ${p}`);
      else if (n < 2) report.thinPattern.push(`${ek} x ${p} (${n})`);
    }
  }
  return report;
}

if (require.main === module) {
  const r = run();
  console.log(JSON.stringify(r, null, 2));
  const requiredEmpty = r.emptyMuscle.length + r.emptyPattern.length;
  console.log(`\nRequired empty cells: ${requiredEmpty} (must be 0)`);
  process.exit(requiredEmpty === 0 ? 0 : 1);
}

module.exports = { run };
