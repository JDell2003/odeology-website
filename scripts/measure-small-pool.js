/* Measure what the builder does with a small eligible exercise pool.

   Engine v2, Slice 1. Two symptoms are believed to share one cause: some
   constrained profiles never finish a build, and most bodyweight-only profiles
   fall through to the generic safe fallback instead of getting a real plan.
   Both are "the eligible pool is too small for the blueprint we asked for".

   Every build runs in its own child process with a hard timeout, so a
   non-terminating profile is recorded as a data point instead of hanging the
   run. That is the whole reason this is not a plain node:test file.

   Usage:
     node scripts/measure-small-pool.js            # full sweep
     node scripts/measure-small-pool.js --hang     # just the known hang profile
     node scripts/measure-small-pool.js --json     # machine-readable
*/
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TIMEOUT_MS = Number(process.env.SMALL_POOL_TIMEOUT_MS || 20000);
const ARGS = new Set(process.argv.slice(2));

/* ------------------------------------------------------------------ child */
/* Invoked as: node measure-small-pool.js --build <base64 json profile> */
const buildFlagIndex = process.argv.indexOf('--build');
if (buildFlagIndex > -1) {
  console.info = () => {}; console.log = () => {}; console.warn = () => {}; console.debug = () => {};
  const profile = JSON.parse(Buffer.from(process.argv[buildFlagIndex + 1], 'base64').toString('utf8'));
  let out;
  const started = process.hrtime.bigint();
  try {
    const P = require(path.join(ROOT, 'core', 'trainingRoutes'))._private;
    const payload = P.coerceClassicBodybuildingToOblueprintPayload(profile);
    const built = P.buildOblueprintPlanWithFallback(payload);
    const plan = built && built.plan;
    const exercises = (((plan || {}).weeks || [])[0] || { days: [] }).days
      .reduce((n, d) => n + ((d.exercises || []).length), 0);
    out = {
      ok: !built.error,
      safeFallback: Boolean(built._safeFallback || (plan && plan.meta && plan.meta.safeFallback)),
      error: built.error ? String(built.error.message || built.error).slice(0, 160) : null,
      days: ((plan || {}).weeks || [])[0] ? (plan.weeks[0].days || []).length : 0,
      week1Exercises: exercises
    };
  } catch (err) {
    out = { ok: false, safeFallback: false, error: String((err && err.message) || err).slice(0, 160), days: 0, week1Exercises: 0 };
  }
  out.ms = Number((process.hrtime.bigint() - started) / 1000000n);
  process.stdout.write('@@RESULT@@' + JSON.stringify(out));
  process.exit(0);
}

/* ----------------------------------------------------------------- parent */
function runBuild(profile) {
  const encoded = Buffer.from(JSON.stringify(profile), 'utf8').toString('base64');
  const started = Date.now();
  const r = spawnSync(process.execPath, [__filename, '--build', encoded], {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024
  });
  const wall = Date.now() - started;
  if (r.error && r.error.code === 'ETIMEDOUT') return { timedOut: true, ms: wall };
  const marker = (r.stdout || '').indexOf('@@RESULT@@');
  if (marker < 0) {
    return { timedOut: false, crashed: true, ms: wall, error: String(r.stderr || '').split('\n').filter(Boolean).pop() || 'no result' };
  }
  return Object.assign({ timedOut: false }, JSON.parse((r.stdout || '').slice(marker + 10)));
}

function profileOf({ equipment, daysPerWeek, emphasis, injury, timePerSession = '45_60', seed }) {
  const eq = {};
  for (const k of equipment) eq[k] = true;
  return {
    discipline: 'bodybuilding', phase: 'maintain', daysPerWeek, planSeed: seed,
    equipmentAccess: eq, emphasis, unavailableDays: [], equipmentStylePref: 'mix',
    strength: {
      phase: 'maintain', trainingAgeBucket: '6_18', timePerSession, equipmentStylePref: 'mix',
      injury: injury ? { has: true, joints: injury.joints, note: '' } : { has: false, joints: [], note: '' },
      injurySeverityByJoint: injury ? injury.severityByJoint : {},
      bench: 185, squat: 245, deadlift: 315
    }
  };
}

/* The profile that regressed from 760ms to not completing, verbatim. */
const HANG_PROFILE = profileOf({
  equipment: ['bodyweight', 'dumbbell'], daysPerWeek: 3, emphasis: ['shoulders', 'arms'],
  injury: { joints: ['Lower back'], severityByJoint: { 'Lower back': { severity: 7, recency: 'Recent' } } },
  timePerSession: '30', seed: 123456789
});

const EMPHASES = [['chest', 'back'], ['shoulders', 'arms'], ['legs', 'glutes'], ['back', 'arms'], ['chest', 'shoulders']];

function sweep(label, equipment, injury) {
  const rows = [];
  let seed = 1000;
  for (let days = 2; days <= 6; days += 1) {
    for (const emphasis of EMPHASES) {
      seed += 7919;
      // Result last would clobber `days` with the built plan's day count (0 on a
      // failure), which made slow rows report as "0d". Requested days wins.
      rows.push(Object.assign(
        runBuild(profileOf({ equipment, daysPerWeek: days, emphasis, injury, seed })),
        { label, requestedDays: days, emphasis: emphasis.join('+') }
      ));
    }
  }
  return rows;
}

function summarise(label, rows) {
  const n = rows.length;
  const timedOut = rows.filter((r) => r.timedOut).length;
  const crashed = rows.filter((r) => r.crashed).length;
  const fallback = rows.filter((r) => !r.timedOut && !r.crashed && r.safeFallback).length;
  const real = rows.filter((r) => !r.timedOut && !r.crashed && r.ok && !r.safeFallback).length;
  const errored = rows.filter((r) => !r.timedOut && !r.crashed && !r.ok).length;
  const times = rows.filter((r) => !r.timedOut && Number.isFinite(r.ms)).map((r) => r.ms).sort((a, b) => a - b);
  return {
    label, n, real, fallback, errored, timedOut, crashed,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : null,
    maxMs: times.length ? times[times.length - 1] : null
  };
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

(function main() {
  const report = { timeoutMs: TIMEOUT_MS, hang: null, sweeps: [] };

  process.stderr.write(`\nBuild timeout: ${TIMEOUT_MS}ms\n\n=== the known hang profile ===\n`);
  process.stderr.write('3 days, bodyweight+dumbbell, lower-back sev7 recent, shoulders+arms, 30 min\n');
  const hang = runBuild(HANG_PROFILE);
  report.hang = hang;
  process.stderr.write(hang.timedOut
    ? `  DID NOT COMPLETE in ${TIMEOUT_MS}ms\n`
    : `  completed in ${hang.ms}ms — ${hang.safeFallback ? 'SAFE FALLBACK' : hang.ok ? 'real plan' : 'error: ' + hang.error}\n`);

  if (!ARGS.has('--hang')) {
    const sweeps = [
      ['bodyweight only', ['bodyweight'], null],
      ['bodyweight + dumbbell', ['bodyweight', 'dumbbell'], null],
      ['bodyweight + dumbbell + lower-back injury', ['bodyweight', 'dumbbell'],
        { joints: ['Lower back'], severityByJoint: { 'Lower back': { severity: 7, recency: 'Recent' } } }],
      ['full gym (control)', ['bodyweight', 'dumbbell', 'barbell', 'cable', 'machine'], null]
    ];
    process.stderr.write('\n=== sweeps (25 profiles each: days 2-6 x 5 emphases) ===\n');
    for (const [label, equipment, injury] of sweeps) {
      const rows = sweep(label, equipment, injury);
      const s = summarise(label, rows);
      report.sweeps.push({ summary: s, rows });
      process.stderr.write(
        `\n  ${label}\n`
        + `    real plan      ${String(s.real).padStart(2)}/${s.n}  ${pct(s.real, s.n)}\n`
        + `    safe fallback  ${String(s.fallback).padStart(2)}/${s.n}  ${pct(s.fallback, s.n)}\n`
        + `    errored        ${String(s.errored).padStart(2)}/${s.n}\n`
        + `    timed out      ${String(s.timedOut).padStart(2)}/${s.n}\n`
        + (s.crashed ? `    crashed        ${String(s.crashed).padStart(2)}/${s.n}\n` : '')
        + `    median ${s.medianMs}ms, max ${s.maxMs}ms\n`
      );
      const slow = rows.filter((r) => r.timedOut || (r.ms || 0) > 5000);
      for (const r of slow) {
        process.stderr.write(`      ${r.timedOut ? 'TIMEOUT' : String(r.ms) + 'ms'}  ${r.requestedDays}d ${r.emphasis}\n`);
      }
    }
  }

  if (ARGS.has('--json')) process.stdout.write(JSON.stringify(report, null, 2));
  process.stderr.write('\n');
})();
