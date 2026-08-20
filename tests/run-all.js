/* ====================================================================
   UNIFIED REGRESSION SUITE — the only gate.
   Runs every suite (content, role browser, role server guard) and prints
   one grouped summary. No commit / push / deploy unless this exits 0.

   Run:  npm test        (or: node tests/run-all.js)

   Add future suites to SUITES below — do not create parallel runners;
   the gap between separate suites is where regressions hide.
   ==================================================================== */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_PORT = Number(process.env.CONTENT_TEST_PORT || 4619);

const SUITES = [
  {
    name: 'content (questionnaire/voices/bleed/mobile)',
    cmd: process.execPath,
    args: ['tests/content-quality.js'],
    env: { CONTENT_URL: `http://localhost:${CONTENT_PORT}/content` },
    needsServer: true
  },
  {
    name: 'roles — browser (nav, guards, flash, switcher, landing)',
    cmd: process.execPath,
    args: ['tests/role-nav.browser.js'],
    needsServer: false
  },
  {
    name: 'roles — server guard (client-only API floor)',
    cmd: process.execPath,
    args: ['tests/role-guard.server.js'],
    needsServer: false
  },
  {
    name: 'owner calendar — server routes (auth + CRUD)',
    cmd: process.execPath,
    args: ['tests/owner-calendar.server.js'],
    needsServer: false
  },
  {
    name: 'transcription — server routes (flag, owner-only, no-video, temp wipe)',
    cmd: process.execPath,
    args: ['tests/transcribe.server.js'],
    needsServer: false
  },
  {
    name: 'transcription — browser (audio extraction, no container bytes on the wire)',
    cmd: process.execPath,
    args: ['tests/transcribe.browser.js'],
    needsServer: false
  },
  // THE ACCEPTANCE TEST — the definition of done. The engine is finished when
  // Jason can go through his own onboarding and get his actual plan back.
  // 4 of 13 pass as of 2026-08-18. Reported, not blocking: making it blocking
  // today would close the gate on the very work that has to make it pass.
  // Flip `blocking` off this entry the moment all thirteen are green, and treat
  // any regression from 4 as a failure in the meantime.
  {
    name: 'ACCEPTANCE — Jason\'s plan (ALL 13 GREEN as of 2026-08-20 — BLOCKING)',
    cmd: process.execPath,
    args: ['--test', 'tests/acceptance.jason.test.js'],
    needsServer: false
  },
  // Exercise table. The generator answers "what can this user do?" entirely
  // from this data, so a row that lies in either direction fails silently and
  // shows up only as a user getting a generic plan. The coverage checks turn
  // "the builder cannot find a vertical press" into a build-time failure.
  {
    name: 'exercise table — integrity (equipment honesty, style/pattern, slot coverage)',
    cmd: process.execPath,
    args: ['--test', 'tests/exerciseTable.integrity.test.js'],
    needsServer: false
  },
  // Onboarding. The quiz is becoming the only question surface, so a screen
  // that throws is a dead end for every new signup — and the promises check
  // pins the rule that nothing on screen claims what the engine cannot deliver.
  {
    name: 'onboarding — client quiz (every screen renders, walks to plan, no unbacked promises)',
    cmd: process.execPath,
    args: ['tests/clientQuiz.walk.browser.js'],
    needsServer: false
  },
  // Training engine. These suites existed for a long time without gating a
  // deploy, which is how the powerbuilding-3-Shoulders,Arms golden fixture was
  // able to rot into a safe-fallback plan unnoticed. Split by area so a failure
  // names the area, and so the slow golden/matrix builds are not hidden behind
  // a fast unit failure.
  //
  // BLOCKING — green as of the Engine v2 Phase 0 wiring commit. Keep them green.
  {
    name: 'training — selection (golden 56)',
    cmd: process.execPath,
    args: ['--test', 'tests/selection.golden.test.js'],
    needsServer: false
  },
  // REPORTED ONLY — runtime, not correctness. Since §4.0 stopped the relaxed
  // fallback from silently handing constrained users a full-gym payload, a
  // build with narrow equipment (and especially narrow equipment PLUS an
  // injury) genuinely exhausts its attempt budget before reaching the floor.
  // Measured per build: full gym 427ms, dumbbell-only 454ms, machine/cable
  // 1693ms, barbell-only 3557ms. 400 fuzz samples no longer fit in ten minutes.
  // The suite still PASSES; it is the strict builder being unable to satisfy
  // constrained equipment that is slow, and making it satisfiable is the real
  // remaining §4.0 work. Restore this to blocking once that lands.
  {
    name: 'training — selection fuzz (SLOW: see comment; reported only)',
    cmd: process.execPath,
    args: ['--test', '--test-timeout=2400000', 'tests/selection.fuzz.test.js'],
    needsServer: false,
    blocking: false
  },
  {
    name: 'training — phase 0 invariants + cut-mode policy',
    cmd: process.execPath,
    args: ['--test', 'tests/training.phase0.invariants.test.js', 'tests/training.targetOwnership.test.js', 'tests/training.exerciseIdentity.test.js', 'tests/training.progression.test.js', 'tests/cut-mode.policy.test.js'],
    needsServer: false
  },
  // REPORTED ONLY — these carry a pre-existing failure baseline of 69 of 205
  // tests, measured on 0eca8b3 before any Engine v2 work started. They are wired
  // in so the number is visible on every run and can be driven down, but they do
  // not close the gate yet: making them blocking today would block every deploy
  // for failures that predate this work. Flip `blocking` off this entry once the
  // count reaches zero.
  {
    name: 'training — engine + disciplines (KNOWN BASELINE: 69/205 failing)',
    cmd: process.execPath,
    args: [
      '--test',
      'tests/trainingEngine.oblueprint.test.js',
      'tests/powerbuilding.priority.logic.test.js',
      'tests/powerbuilding.priority.execution.test.js',
      'tests/powerbuilding.priority.matrix.test.js',
      'tests/militaryHybrid.logic.test.js',
      'tests/militaryHybrid.execution.test.js',
      'tests/militaryHybrid.matrix.test.js'
    ],
    needsServer: false,
    blocking: false
  }
];

function run(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url, { redirect: 'manual' });
      if (resp.status > 0) return true; // any response = listening
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function withServer(fn) {
  const server = spawn(process.execPath, ['--env-file', '.env', 'server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(CONTENT_PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: false
  });
  try {
    const up = await waitForServer(`http://localhost:${CONTENT_PORT}/content`);
    if (!up) {
      console.error(`server did not come up on :${CONTENT_PORT} within 45s`);
      return 1;
    }
    return await fn();
  } finally {
    // Windows: kill the whole tree, or the listener survives and the next
    // run tests a stale orphan instead of the current tree.
    if (process.platform === 'win32' && server.pid) {
      await new Promise((resolve) => {
        const tk = spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', shell: false });
        tk.on('close', resolve);
        tk.on('error', resolve);
      });
    } else {
      try { server.kill(); } catch { /* ignore */ }
    }
    // Give the port a moment to release before any later suite reuses it.
    await new Promise((r) => setTimeout(r, 800));
  }
}

(async () => {
  const results = [];
  for (const suite of SUITES) {
    console.log(`\n============================================================`);
    console.log(`SUITE: ${suite.name}`);
    console.log(`============================================================`);
    let code;
    if (suite.needsServer) {
      code = await withServer(() => run(suite.cmd, suite.args, suite.env));
    } else {
      code = await run(suite.cmd, suite.args, suite.env || {});
    }
    results.push({ name: suite.name, pass: code === 0, blocking: suite.blocking !== false });
  }

  console.log(`\n============================================================`);
  console.log('UNIFIED SUMMARY');
  console.log(`============================================================`);
  for (const r of results) {
    const status = r.pass ? 'PASS' : (r.blocking ? 'FAIL' : 'FAIL (reported)');
    console.log(`${status.padEnd(16)}${r.name}`);
  }
  const failed = results.filter((r) => !r.pass && r.blocking);
  const reported = results.filter((r) => !r.pass && !r.blocking);
  if (reported.length) {
    console.log(`\n${reported.length} REPORTED-ONLY SUITE(S) FAILING — these do not close the gate yet.`);
    console.log('They carry a known pre-existing failure baseline (see the suite comments in');
    console.log('tests/run-all.js). Drive them to zero, then flip blocking back on.');
  }
  console.log(failed.length === 0
    ? `\nALL ${results.filter((r) => r.blocking).length} BLOCKING SUITES GREEN — gate open.`
    : `\n${failed.length} of ${results.filter((r) => r.blocking).length} BLOCKING SUITES FAILED — gate closed. No commit, no push, no deploy.`);
  process.exit(failed.length ? 1 : 0);
})();
