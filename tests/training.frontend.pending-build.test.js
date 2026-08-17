const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function readTrainingSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'js', 'training.js'), 'utf8');
}

function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  let i = source.indexOf('{', start);
  if (i < 0) throw new Error(`No body for function: ${name}`);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces for function: ${name}`);
}

function extractConst(source, name) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Const not found: ${name}`);
  const end = source.indexOf('\n', start);
  return source.slice(start, end);
}

// Runs the real classifier out of js/training.js rather than a copy of it.
function loadPendingClassifier() {
  const src = readTrainingSource();
  const bundle = [
    extractConst(src, 'PENDING_BUILD_MESSAGE'),
    extractFunctionSource(src, 'isPendingBuildMessage'),
    'globalThis.__out = { PENDING_BUILD_MESSAGE, isPendingBuildMessage };'
  ].join('\n');
  const context = { globalThis: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(bundle, context);
  return context.__out;
}

test('an unconfirmed build is classified as pending, a real build failure is not', () => {
  const { PENDING_BUILD_MESSAGE, isPendingBuildMessage } = loadPendingClassifier();

  // Every message that used to land the user on the "couldn't generate" card
  // while the plan was in fact still being built.
  const pending = [
    PENDING_BUILD_MESSAGE,
    'Workout build did not finish in time. No completed plan was detected.',
    'Workout build is taking longer than expected. Please try again.',
    'Plan build timed out. Please try again.',
    'training_build_frontend_abort_timeout'
  ];
  for (const message of pending) {
    assert.equal(isPendingBuildMessage(message), true, `should be pending: ${message}`);
  }

  // Genuine failures must still reach the error card with Start Over.
  const failures = [
    'Failed to build plan.',
    'Failed to build plan:\nINVALID_INPUT (trainingStyle)',
    'No saved setup found. Complete setup, then tap Enter Engine.',
    'Failed to load training state.',
    'Invalid exercises/sets were removed from display. Regenerate plan for a clean rebuild.',
    '',
    null
  ];
  for (const message of failures) {
    assert.equal(isPendingBuildMessage(message), false, `should NOT be pending: ${message}`);
  }
});

test('the pending message does not tell the user the workout is missing', () => {
  const { PENDING_BUILD_MESSAGE } = loadPendingClassifier();
  assert.match(PENDING_BUILD_MESSAGE, /still building/i);
  assert.doesNotMatch(PENDING_BUILD_MESSAGE, /could ?n.?t|failed|no completed plan|not detected/i);
});

test('the waiting card replaces the failure card and keeps watching', () => {
  const src = readTrainingSource();

  // The waiting branch must come before the generic error card.
  const waitingBranch = src.indexOf('Your workout is still building');
  const errorCard = src.indexOf('onclick: startOverAfterGenerationFailure');
  assert.ok(waitingBranch > 0, 'waiting card is rendered');
  assert.ok(errorCard > 0, 'error card still exists for real failures');
  assert.ok(waitingBranch < errorCard, 'waiting card is checked before the error card');

  // Start Over must be gated on a real failure, not on any planError at all —
  // that gate is what used to show it during a still-running build.
  assert.match(src, /const isRealFailure = Boolean\(state\.planError\) && !isPendingBuildMessage\(state\.planError\)/);
  assert.match(src, /isRealFailure\s*\n?\s*\? el\('button'/);

  // The give-up path must try the account's existing plan before erroring.
  assert.match(src, /if \(ready \|\| await adoptAnyExistingPlan\(\)\)/);
});

test('recoverPendingPlan watches far longer than the old 12s leash', () => {
  const src = readTrainingSource();
  const watchMs = Number(/const PENDING_BUILD_WATCH_MS = ([\d_]+)/.exec(src)[1].replace(/_/g, ''));
  assert.ok(watchMs >= 120_000, `watch window should be minutes, got ${watchMs}ms`);

  // The 12s quick poll must hand off to the long watch instead of erroring.
  const retry = extractFunctionSource(src, 'pollForPlanReady');
  assert.ok(retry.length > 0);
  assert.match(src, /await recoverPendingPlan\(\{ intervalMs: 2000 \}\);\s*\n\s*return;/);
});

test('a server-side build timeout is treated as pending, not as a rejected plan', () => {
  const src = readTrainingSource();

  // /api/training/onboarding answers PLAN_BUILD_TIMEOUT as a structured 400
  // when the build worker passes the server's safety timeout. Classifying that
  // as a hard failure is what skipped recovery and showed the error card while
  // the plan was still being built.
  assert.match(src, /const isPlanBuildTimeout = \/PLAN_BUILD_TIMEOUT\|worker-timeout\/i\.test/);
  assert.match(src, /const isBuildStillRunning = isFrontendAbortTimeout \|\| isPlanBuildTimeout;/);

  // The structured-failure gate (which suppresses polling entirely) must
  // exclude it.
  const gate = /const isStructuredPlanBuildFailure = Boolean\(([\s\S]*?)\);/.exec(src)[1];
  assert.match(gate, /!isPlanBuildTimeout/);
  assert.match(gate, /resp\?\.status === 400/);

  // And the user-facing copy for it must be the pending message.
  assert.match(src, /isBuildStillRunning \|\| resp\.status === 408\s*\n?\s*\? PENDING_BUILD_MESSAGE/);
  assert.doesNotMatch(src, /No completed plan was detected/);
});

test('only one watch runs at a time and it re-arms itself only once', () => {
  const src = readTrainingSource();
  assert.match(src, /if \(pendingBuildWatchActive\) return false;/);
  assert.match(src, /pendingBuildWatchExhausted = true;/);
  assert.match(src, /if \(!canAutoResumePendingBuildWatch\(\)\) return;/);
  // A fresh build request clears the exhausted latch so the next build gets
  // its own automatic watch.
  const resets = src.match(/resetPendingBuildWatch\(\);/g) || [];
  assert.ok(resets.length >= 3, `expected the latch to be reset on new builds, saw ${resets.length}`);
});
