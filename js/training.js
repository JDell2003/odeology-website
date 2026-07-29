(() => {
  const root = document.getElementById('training-root');
  if (!root) return;
  // True when an owner/trainer is peering into a client's account. The local
  // browser's saved intake belongs to the ACTOR, not the viewed client, so we
  // must never auto-build a plan from it while impersonating (that produced the
  // wrong plan and a long "Loading…" hang). Set from /api/auth/me.
  let sessionIsImpersonated = false;
  // The signed-in (or viewed) client's coach, if any. Coach-managed clients get
  // the "your coach is building your plan" experience instead of the self-setup
  // prompt. Fetched once from /api/auth/my-coach.
  let sessionCoach = null;
  let sessionCoachFetched = false;
  async function ensureSessionCoach() {
    if (sessionCoachFetched) return sessionCoach;
    sessionCoachFetched = true;
    try {
      const r = await fetch('/api/auth/my-coach', { credentials: 'include' });
      const j = r && r.ok ? await r.json() : null;
      sessionCoach = (j && j.coach && j.coach.name) ? j.coach : null;
    } catch { sessionCoach = null; }
    return sessionCoach;
  }
  const trainingDebugCombo = window.TrainingDebugCombo || null;
  const evaluateTrainingDebugCombo = trainingDebugCombo?.evaluateGlutesLegsCoreDebugCombo || null;

  const TRAINING_INTAKE_KEY = 'ode_training_intake_v2';
  const TRAINING_BUILDER_PREFILL_KEY = 'ode_training_builder_prefill_v1';
  const TRAINING_OPEN_WIZARD_ONLY_KEY = 'ode_training_open_wizard_only';
  const TRAINING_CONSTRUCTING_KEY = 'ode_training_constructing_v1';
  const TRAINING_AUTO_RETRY_PAUSE_KEY = 'ode_training_autoretry_pause_until';
  const DEMO_SIM_PREFIX = 'ode_demo_sim_v1:';
  const WORKOUT_TIMER_STORAGE_PREFIX = 'ode_training_timer_v1:';
  const WORKOUT_REST_TIMER_STORAGE_PREFIX = 'ode_training_rest_timer_v1:';
  const WORKOUT_DRAFT_STORAGE_PREFIX = 'ode_training_draft_v1:';
  const TRAINING_PLAN_NAV_STORAGE_PREFIX = 'ode_training_plan_nav_v1:';
  const LEGACY_TRAINING_WEEK_KEY = 'ode_training_week';
  const LEGACY_TRAINING_ACTIVE_DATE_KEY = 'ode_training_active_date';

  function trainingPlanNavStorageKey(suffix, planId = state?.planRow?.id) {
    const plan = String(planId || '').trim();
    if (!plan) return '';
    return `${TRAINING_PLAN_NAV_STORAGE_PREFIX}${plan}:${suffix}`;
  }

  function readTrainingPlanNavValue(suffix, { planId = state?.planRow?.id, legacyKey = '' } = {}) {
    try {
      const scopedKey = trainingPlanNavStorageKey(suffix, planId);
      if (scopedKey) {
        const scopedValue = sessionStorage.getItem(scopedKey);
        if (scopedValue != null && scopedValue !== '') return scopedValue;
      }
      if (legacyKey) {
        const legacyValue = sessionStorage.getItem(legacyKey);
        if (legacyValue != null && legacyValue !== '') return legacyValue;
      }
    } catch {
      // ignore
    }
    return '';
  }

  function writeTrainingPlanNavValue(suffix, value, { planId = state?.planRow?.id } = {}) {
    try {
      const scopedKey = trainingPlanNavStorageKey(suffix, planId);
      if (!scopedKey) return false;
      sessionStorage.setItem(scopedKey, String(value ?? ''));
      return true;
    } catch {
      return false;
    }
  }

  function hasInProgressWorkoutSession() {
    if (workoutTimer.running || workoutTimer.paused) return true;
    if (workoutAutosaveInFlight) return true;
    if (workoutAutosaveQueued) return true;
    if (workoutAutosaveContext) return true;
    if (state.workoutInputDrafts.size > 0) return true;
    if (state.workoutSetCountDrafts.size > 0) return true;
    if (state.workoutReadinessDrafts.size > 0) return true;
    return false;
  }

  function readLocalIntake() {
    try {
      const handoff = JSON.parse(sessionStorage.getItem('ode_training_intake_handoff') || 'null');
      if (handoff && typeof handoff === 'object') return handoff;
    } catch {
      // ignore
    }
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(TRAINING_INTAKE_KEY) || 'null');
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  }

  function readDemoSimState(userId) {
    const id = String(userId || '').trim();
    if (!id) return null;
    try {
      const raw = sessionStorage.getItem(`${DEMO_SIM_PREFIX}${id}`);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  let forceAutostartConsumed = false;

  function shouldForceAutostart() {
    if (forceAutostartConsumed) return false;
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('from') === 'intake') return true;
    } catch {
      // ignore
    }
    try {
      if (sessionStorage.getItem('ode_training_force_autostart') === '1') return true;
    } catch {
      // ignore
    }
    return false;
  }

  // Onboarding finished but they exited to the overview instead of the
  // builder: the workout is still owed. This durable flag builds the plan
  // ONCE on the first training visit that has no plan yet — it is NOT part
  // of shouldForceAutostart(), so it can never force a rebuild on later
  // logins (that would silently replace the saved workout).
  function hasOwedAutoBuild() {
    try {
      return localStorage.getItem('ode_training_autobuild_v1') === '1';
    } catch {
      return false;
    }
  }
  function clearOwedAutoBuild() {
    try { localStorage.removeItem('ode_training_autobuild_v1'); } catch {}
  }

  function shouldOpenWizardOnly() {
    try {
      return sessionStorage.getItem(TRAINING_OPEN_WIZARD_ONLY_KEY) === '1';
    } catch {
      return false;
    }
  }

  function shouldBootIntoConstructing() {
    try {
      return sessionStorage.getItem(TRAINING_CONSTRUCTING_KEY) === '1';
    } catch {
      return false;
    }
  }

  function clearConstructingBootFlag() {
    try {
      sessionStorage.removeItem(TRAINING_CONSTRUCTING_KEY);
    } catch {
      // ignore
    }
  }

  function clearOpenWizardOnlyFlag() {
    try {
      sessionStorage.removeItem(TRAINING_OPEN_WIZARD_ONLY_KEY);
    } catch {
      // ignore
    }
  }

  function clearForceAutostart() {
    forceAutostartConsumed = true;
    try {
      sessionStorage.removeItem('ode_training_force_autostart');
    } catch {
      // ignore
    }
    clearConstructingBootFlag();
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('from') === 'intake') {
        url.searchParams.delete('from');
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, '', next);
      }
    } catch {
      // ignore
    }
  }

  function isIntakeComplete(intake) {
    if (!intake || typeof intake !== 'object') return false;
    if (intake.completedAt) return true;
    const step = Number(intake.step);
    return Number.isFinite(step) && step >= 10;
  }

  function shouldBootDemoPlan(user, planRow) {
    if (!(user?.demo?.active || user?.isDemo)) return false;
    if (hasRenderablePlanRow(planRow)) return false;
    const sim = readDemoSimState(user.id);
    if (!sim?.workoutReady) return false;
    const intake = readLocalIntake();
    return isIntakeComplete(intake);
  }

  function shouldSkipDemoUpsell(user = state?.auth?.user) {
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('demoPlan') === '1') return true;
    } catch {
      // ignore
    }
    return Boolean(user?.demo?.active || user?.isDemo);
  }

  function isDemoDateBlockerDisabled(user = state?.auth?.user) {
    if (!(user?.demo?.active || user?.isDemo)) return false;
    const sim = readDemoSimState(user?.id);
    return Boolean(sim?.disableDateBlocker);
  }

  const TRAINING_PAYWALL_ENABLED = false;

  async function openTrainingPaywall(reason = 'manual') {
    if (!TRAINING_PAYWALL_ENABLED) return false;
    if (typeof window.__odeForceOpenAccessPrompt === 'function') {
      try {
        const forced = window.__odeForceOpenAccessPrompt({ reason });
        if (forced) return true;
      } catch {
        // ignore
      }
    }
    if (typeof window.__odeOpenAccessPrompt !== 'function') return false;
    try {
      const immediate = await window.__odeOpenAccessPrompt({ reason, refreshData: false, forceOpen: true });
      if (immediate) return true;
    } catch {
      // ignore
    }
    try {
      return Boolean(await window.__odeOpenAccessPrompt({ reason, refreshData: true, forceOpen: true }));
    } catch {
      return false;
    }
  }

  async function maybeOpenTrainingEntryPaywall() {
    return false;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  const INTAKE_DAY_MAP = new Map([
    [0, 'Su'], [1, 'Mo'], [2, 'Tu'], [3, 'We'], [4, 'Th'], [5, 'Fr'], [6, 'Sa']
  ]);
  const INTAKE_AREA_MAP = {
    shoulder: 'Shoulder',
    elbow: 'Elbow',
    wrist: 'Wrist',
    back: 'Back',
    hip: 'Hip',
    knee: 'Knee'
  };
  const INTAKE_FOCUS_MAP = {
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    arms: 'Arms',
    legs: 'Legs',
    glutes: 'Glutes',
    abs: 'Core',
    core: 'Core'
  };

  let autoOnboardInFlight = false;
  let engineRetryInFlight = false;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fetchTrainingStateWithRetry({ tries = 3, delayMs = 1200 } = {}) {
    let last = null;
    for (let i = 0; i < tries; i += 1) {
      try {
        const resp = await api('/api/training/state', { method: 'GET', timeoutMs: 4500 });
        last = resp;
        if (resp.ok && resp.json?.plan?.id) return resp;
      } catch {
        // ignore
      }
      await delay(delayMs);
    }
    return last;
  }

  async function pollForPlanReady({ maxMs = 60000, intervalMs = 2000, prevPlanId = null, requestStartedAt = 0, pollToken = null } = {}) {
    const startedAt = Date.now();
    const comboDebug = Boolean(state.generating?.comboDebug);
    while (Date.now() - startedAt < maxMs) {
      if (pollToken?.cancelled) return false;
      if (comboDebug) {
        logAbsGlutesLegsDebug('poll-loop', {
          source: 'polling',
          elapsedMs: Date.now() - startedAt,
          maxMs,
          intervalMs,
          requestStartedAt
        });
      }
      const resp = await fetchTrainingStateWithRetry({ tries: 1, delayMs: 0 });
      if (pollToken?.cancelled) return false;
      if (resp?.ok && resp.json?.plan?.id) {
        const nextPlan = resp.json?.plan || null;
        const needsFreshPlan = String(prevPlanId || '').trim() || Number(requestStartedAt) > 0;
        if (!needsFreshPlan || isFreshPlanAfterSubmit(nextPlan, prevPlanId, requestStartedAt)) {
          if (comboDebug) {
            logAbsGlutesLegsDebug('poll-ready', {
              source: 'polling',
              elapsedMs: Date.now() - startedAt,
              planId: nextPlan?.id || null
            });
          }
          state.profile = resp.json?.profile || state.profile;
          state.planRow = nextPlan;
          sanitizeBodybuildingPlanInPlace(state.planRow);
          state.planError = null;
          state.logs = [];
          state.allLogs = [];
          void refreshTrainingLogs(state.planRow.id).then(() => render()).catch(() => {});
          const dismissedKey = `ode_training_upsell_dismissed_${state.planRow.id}`;
          const dismissed = shouldSkipDemoUpsell() || localStorage.getItem(dismissedKey) === '1';
          setView(dismissed ? 'plan' : 'upsell');
          return true;
        }
      }
      if (pollToken?.cancelled) return false;
      await delay(intervalMs);
    }
    if (comboDebug) {
      logAbsGlutesLegsDebug('poll-timeout', {
        source: 'polling',
        elapsedMs: Date.now() - startedAt,
        maxMs
      });
    }
    return false;
  }

  function readAutoRetryPauseUntil() {
    try {
      return Number(sessionStorage.getItem(TRAINING_AUTO_RETRY_PAUSE_KEY) || 0) || 0;
    } catch {
      return 0;
    }
  }

  function isAutoRetryPaused() {
    return readAutoRetryPauseUntil() > Date.now();
  }

  function pauseAutoRetry(ms = 15000) {
    const until = Date.now() + Math.max(1000, Number(ms) || 15000);
    try {
      sessionStorage.setItem(TRAINING_AUTO_RETRY_PAUSE_KEY, String(until));
    } catch {
      // ignore
    }
  }

  function clearAutoRetryPause() {
    try {
      sessionStorage.removeItem(TRAINING_AUTO_RETRY_PAUSE_KEY);
    } catch {
      // ignore
    }
  }

  function clearWorkoutGenerationFlags({ clearWizardOnly = false } = {}) {
    try { sessionStorage.removeItem('ode_training_force_autostart'); } catch {}
    try { sessionStorage.removeItem(TRAINING_CONSTRUCTING_KEY); } catch {}
    try { sessionStorage.removeItem('ode_training_nav_loading'); } catch {}
    if (clearWizardOnly) {
      try { sessionStorage.removeItem(TRAINING_OPEN_WIZARD_ONLY_KEY); } catch {}
    }
    forceAutostartConsumed = true;
  }

  function createGenerationPollToken() {
    return {
      requestId: Number(state.generating?.requestId || 0),
      cancelled: false
    };
  }

  function buildTrainingRequestKey(payload) {
    try {
      return JSON.stringify(payload || {});
    } catch {
      return '';
    }
  }

  function markTrainingBuildCompleted({ requestId = null, requestKey = '', routeKind = '' } = {}) {
    if (!state.generating) return;
    state.generating.completedRequestId = Number.isFinite(Number(requestId)) ? Number(requestId) : null;
    state.generating.completedRequestKey = String(requestKey || '');
    state.generating.completedRouteKind = String(routeKind || '');
    state.generating.completedAt = Date.now();
  }

  function hasRecentlyCompletedTrainingBuild(payload, { withinMs = 30000 } = {}) {
    const completedAt = Number(state.generating?.completedAt || 0);
    const completedKey = String(state.generating?.completedRequestKey || '');
    const payloadKey = buildTrainingRequestKey(payload);
    if (!completedAt || !completedKey || !payloadKey) return false;
    if (completedKey !== payloadKey) return false;
    return (Date.now() - completedAt) <= Math.max(1000, Number(withinMs) || 30000);
  }

  function logTrainingBuildLifecycle(eventName, {
    endpoint = '',
    elapsedMs = 0,
    dayCount = null,
    priorityGroups = [],
    routeKind = '',
    requestId = null,
    configuredTimeoutMs = null
  } = {}) {
    try {
      console.info(eventName, {
        endpoint: String(endpoint || ''),
        elapsedMs: Math.max(0, Number(elapsedMs || 0)),
        dayCount: Number.isFinite(Number(dayCount)) ? Number(dayCount) : null,
        priorityGroups: Array.isArray(priorityGroups) ? priorityGroups.slice() : [],
        routeKind: String(routeKind || ''),
        requestId: Number.isFinite(Number(requestId)) ? Number(requestId) : null,
        configuredTimeoutMs: Number.isFinite(Number(configuredTimeoutMs)) ? Number(configuredTimeoutMs) : null
      });
    } catch {
      // ignore console failures
    }
  }

  function setGeneratingHandoffState({
    active = false,
    message = '',
    meta = ''
  } = {}) {
    if (!state.generating) return;
    state.generating.handoffActive = Boolean(active);
    state.generating.handoffMessage = String(message || '').trim();
    state.generating.handoffMeta = String(meta || '').trim();
  }

  function clearWorkoutGenerationState({ cancelRequest = true, clearFlags = true, clearWizardOnly = false } = {}) {
    if (cancelRequest) {
      const controller = state.generating?.controller;
      if (controller && typeof controller.abort === 'function') {
        try { controller.abort(); } catch {}
      }
    }
    if (state.generating?.pollToken) state.generating.pollToken.cancelled = true;
    if (state.generating) {
      state.generating.controller = null;
      if (state.generating?.pollToken) {
        try {
          console.info('training_build_frontend_recovery_poll_cancelled', {
            requestId: Number.isFinite(Number(state.generating.requestId)) ? Number(state.generating.requestId) : null
          });
        } catch {
          // ignore console failures
        }
      }
      state.generating.pollToken = null;
      state.generating.comboDebug = false;
      state.generating.activeRequestKey = '';
      state.generating.activeRouteKind = '';
      state.generating.activeEndpoint = '';
      state.generating.frontendRequestStartedAt = 0;
      state.generating.handoffActive = false;
      state.generating.handoffMessage = '';
      state.generating.handoffMeta = '';
    }
    try {
      console.info('training_build_frontend_generation_state_cleared', {
        cancelRequest: Boolean(cancelRequest),
        clearFlags: Boolean(clearFlags)
      });
    } catch {
      // ignore console failures
    }
    autoOnboardInFlight = false;
    engineRetryInFlight = false;
    stopGeneratingTicker();
    if (clearFlags) clearWorkoutGenerationFlags({ clearWizardOnly });
  }

  function canOfferWorkoutGeneration() {
    return Boolean(readLocalIntake());
  }

  function isWorkoutBuildPending() {
    return Boolean(
      state.view === 'generating'
      || autoOnboardInFlight
      || engineRetryInFlight
      || shouldForceAutostart()
      || shouldBootIntoConstructing()
    );
  }

  function neutralizePlanLoadError(message) {
    const text = String(message || '').trim();
    if (!text) return '';
    if (isWorkoutBuildPending()) return text;
    if (!canOfferWorkoutGeneration()) return text;
    if (/Failed to load training state|Workout build is taking longer than expected|Workout build did not finish in time|training_build_frontend_abort_timeout|No plan found/i.test(text)) {
      return '';
    }
    return text;
  }

  async function recoverPendingPlan({ prevPlanId = null, requestStartedAt = 0, maxMs = 180000, intervalMs = 2000 } = {}) {
    state.planError = null;
    state.generating.minMs = 600;
    state.generating.timeoutMs = Math.max(12_000, maxMs);
    setGeneratingHandoffState({
      active: true,
      message: 'Workout is still finishing. Checking for completed plan...',
      meta: '95% - Checking for completed plan...'
    });
    setView('generating');
    const pollToken = createGenerationPollToken();
    state.generating.pollToken = pollToken;
    const ready = await pollForPlanReady({ maxMs, intervalMs, prevPlanId, requestStartedAt, pollToken });
    if (state.generating?.pollToken === pollToken) state.generating.pollToken = null;
    if (ready) return true;
    setGeneratingHandoffState({ active: false, message: '', meta: '' });
    clearWorkoutGenerationState({ cancelRequest: false, clearFlags: true });
    state.planError = readLocalIntake()
      ? 'Workout build did not finish in time. No completed plan was detected.'
      : 'Failed to load training state.';
    setView('plan');
    return false;
  }

  const CLIENT_BB_SET_CAP = 4;
  const CLIENT_BANNED_EXERCISE_PATTERNS = [
    /\bchains?\b/i,
    /\bkneeling\s*squat\b/i,
    /\bone[-\s]?arm\s*floor\s*press\b/i,
    /\bgood\s*morning\b/i,
    /\boverhead\s*squat\b/i,
    /\bpistol\s*squat\b/i,
    /\brear\s*delt\s*row\b/i,
    /\bgironda\b/i,
    /\bsternum\s*chin\b/i,
    /\bboard\s*press\b/i,
    /\banti-?\s*gravity\b/i,
    /\btechnique\b/i,
    /\bspeed\b/i,
    /\bdynamic\s*effort\b/i,
    /\btempo\b/i,
    /\bpaused?\b/i,
    /\bneck\s*press\b/i,
    /\bone[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/i,
    /\bsingle[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/i,
    /\bone[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/i,
    /\bsingle[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/i,
    /\bsquat\s*with\s*plate\s*movers\b/i,
    /\bcalf\s*raise\s*on\s*a\s*dumbbell\b/i,
    /\bmini\s*band\b/i,
    /\bresistance\s*band\b/i,
    /\bbanded\b/i
  ];

  function isBannedExerciseName(rawName) {
    const name = String(rawName || '').trim();
    if (!name) return false;
    return CLIENT_BANNED_EXERCISE_PATTERNS.some((rx) => rx.test(name));
  }

  function normalizeBodybuildingExerciseName(rawName) {
    const raw = String(rawName || '').trim();
    if (!raw) return raw;
    if ((/\bhamstring\s*curls?\b/i.test(raw) || /\bleg\s*curls?\b/i.test(raw)) && !/\b(lying|seated)\b/i.test(raw)) {
      return 'Seated Hamstring Curl';
    }
    if (/^neck\s*press$/i.test(raw)) return 'Bench Press';
    if (/one[-\s]*leg\b.*\bbarbell\b.*\bsquat/i.test(raw) || /single[-\s]*leg\b.*\bbarbell\b.*\bsquat/i.test(raw)) return 'Hack Squat';
    if (/^bench press\s*\(technique\)$/i.test(raw)) return 'Bench Press';
    if (/^speed\s+box\s+squat$/i.test(raw) || /^speed\s+squat$/i.test(raw)) return 'Box Squat';
    if (/^one[-\s]*arm\s+lat\s+pull[\s-]*down$/i.test(raw) || /^single[-\s]*arm\s+lat\s+pull[\s-]*down$/i.test(raw)) return 'Lat Pulldown';
    if (/^bench press\s*\(competition\)$/i.test(raw)) return 'Bench Press';
    if (/deadlift\s*\(single\)/i.test(raw)) return 'Barbell Deadlift';
    return raw
      .replace(/\s*\(competition\)\s*/ig, ' ')
      .replace(/\s*\(technique\)\s*/ig, ' ')
      .replace(/\bspeed\b/ig, ' ')
      .replace(/\bdynamic\s*effort\b/ig, ' ')
      .replace(/\btempo\b/ig, ' ')
      .replace(/\bpaused?\b/ig, ' ')
      .replace(/\s*\(single\)\s*/ig, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function disciplineFromPlanRow(planRow) {
    return String(
      planRow?.discipline
      || planRow?.plan?.meta?.discipline
      || planRow?.plan?.discipline
      || ''
    ).trim().toLowerCase();
  }

  function ensurePlanExerciseIdentityInPlace(planRow) {
    if (!planRow?.plan || !Array.isArray(planRow.plan.weeks)) return { assignedSlotIds: 0, assignedExerciseIds: 0 };
    let assignedSlotIds = 0;
    let assignedExerciseIds = 0;
    for (const week of planRow.plan.weeks || []) {
      const weekIndex = Number(week?.index) || 1;
      const days = Array.isArray(week?.days) ? week.days : [];
      days.forEach((day, dayOffset) => {
        const dayIndex = dayOffset + 1;
        const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
        exercises.forEach((ex, exOffset) => {
          if (!ex || typeof ex !== 'object') return;
          const position = exOffset + 1;
          const rawNameKey = normalizeLiftHistoryKey(ex?.displayName || ex?.name || ex?.exerciseId || ex?.id || '');
          const fallbackKey = rawNameKey || `exercise_${position}`;
          if (!String(ex.slotId || '').trim()) {
            ex.slotId = `slot:${weekIndex}:${dayIndex}:${position}:${fallbackKey}`;
            assignedSlotIds += 1;
          }
          if (!String(ex.id || '').trim()) {
            ex.id = `ex:${weekIndex}:${dayIndex}:${position}:${fallbackKey}`;
            assignedExerciseIds += 1;
          }
        });
      });
    }
    return { assignedSlotIds, assignedExerciseIds };
  }

  function sanitizeBodybuildingPlanInPlace(planRow) {
    ensurePlanExerciseIdentityInPlace(planRow);
    if (!planRow?.plan || disciplineFromPlanRow(planRow) !== 'bodybuilding') {
      return { removed: 0, capped: 0 };
    }
    let removed = 0;
    let capped = 0;
    for (const week of planRow.plan.weeks || []) {
      for (const day of week?.days || []) {
        const src = Array.isArray(day?.exercises) ? day.exercises : [];
        const next = [];
        for (const ex of src) {
          const displayName = normalizeBodybuildingExerciseName(ex?.displayName || ex?.name || '');
          const name = String(displayName || '');
          if (isBannedExerciseName(name)) {
            removed += 1;
            continue;
          }
          if (displayName) {
            ex.name = displayName;
            if (Object.prototype.hasOwnProperty.call(ex, 'displayName')) ex.displayName = displayName;
          }
          const sets = Number(ex?.sets);
          if (Number.isFinite(sets) && sets > CLIENT_BB_SET_CAP) {
            ex.sets = CLIENT_BB_SET_CAP;
            capped += 1;
          }
          next.push(ex);
        }
        day.exercises = next;
      }
    }
    return { removed, capped };
  }

  function isFreshPlanAfterSubmit(nextPlan, prevPlanId, requestStartedAt) {
    const nextId = String(nextPlan?.id || '').trim();
    const prevId = String(prevPlanId || '').trim();
    if (!nextId) return false;
    if (prevId && nextId !== prevId) return true;
    if (!prevId) {
      const createdAtRaw = nextPlan?.plan?.meta?.createdAt || nextPlan?.updated_at || nextPlan?.updatedAt || '';
      const createdAtMs = Date.parse(createdAtRaw);
      return Number.isFinite(createdAtMs) && createdAtMs >= (Number(requestStartedAt) - 5000);
    }
    return false;
  }

  const lower = (value) => String(value || '').trim().toLowerCase();
  const uniq = (list) => Array.from(new Set(list));

  function safeParseJson(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function normalizeMacroGoalMode(raw) {
    const goal = String(raw || '').trim().toLowerCase();
    if (!goal) return '';
    if (goal.includes('cut') || goal.includes('lose')) return 'cut';
    if (goal.includes('recomp') || goal.includes('maintain')) return 'recomp';
    if (goal.includes('bulk') || goal.includes('build') || goal.includes('gain') || goal.includes('strength')) return 'bulk';
    return '';
  }

  function extractMacroSelections(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload?.nutrition?.selections
      || payload?.nutrition?.profile
      || payload?.nutrition?.bodyStats
      || payload?.grocerySession?.selections
      || payload?.groceryPrefs?.selections
      || payload?.macroCalculator?.selections
      || payload?.macro_calculator?.selections
      || payload?.macroSelections
      || null;
  }

  function readLatestMacroGoalMode() {
    const readItem = (storage, key) => {
      try {
        return storage?.getItem?.(key) || null;
      } catch {
        return null;
      }
    };
    const fromSelections = (selections) => normalizeMacroGoalMode(
      selections?.goal
      || selections?.mode
      || selections?.goalMode
      || selections?.primaryGoal
    );
    const payloads = [
      safeParseJson(readItem(sessionStorage, 'grocerySession')),
      safeParseJson(readItem(sessionStorage, 'groceryPrefs')),
      safeParseJson(readItem(localStorage, 'grocerySession')),
      safeParseJson(readItem(localStorage, 'ode_saved_results_snapshot')),
      safeParseJson(readItem(localStorage, 'groceryPrefs'))
    ];
    for (const payload of payloads) {
      const selections = extractMacroSelections(payload) || payload?.selections || null;
      const mode = fromSelections(selections);
      if (mode) return mode;
    }
    return '';
  }

  function goalModeToPrimaryGoal(goalModeRaw) {
    const goalMode = normalizeMacroGoalMode(goalModeRaw);
    if (goalMode === 'cut') return 'Cut fat';
    if (goalMode === 'recomp') return 'Recomp';
    return 'Build size';
  }

  function goalModeToTrainingPhase(goalModeRaw, fallbackPhase = 'bulk') {
    const goalMode = normalizeMacroGoalMode(goalModeRaw);
    if (goalMode === 'cut') return 'cut';
    if (goalMode === 'recomp') return 'maintain';
    if (goalMode === 'bulk') return 'bulk';
    const fallback = String(fallbackPhase || '').trim().toLowerCase();
    return ['bulk', 'cut', 'maintain'].includes(fallback) ? fallback : 'bulk';
  }

  function mapExperience(raw) {
    const v = lower(raw)
      .replace(/[–—−]/g, '-')
      .replace(/\u00e2\u20ac\u201c|\u00e2\u20ac\u201d|\u00e2\u02c6\u2019/g, '-')
      .replace(/\s+/g, '');
    if (v === '<6m' || v === '<6months') return '<6m';
    if (v === '6-24m' || v === '6-24months') return '6-24m';
    if (v === '2-5y' || v === '2-5years' || v === '2-5yrs') return '2-5y';
    if (v === '5y+' || v === '5+years' || v === '5+yrs') return '5y+';
    return '6-24m';
  }

  function mapTrainingFeel(raw, focusLabel) {
    const v = lower(raw);
    if (v.includes('military')) return 'Military Hybrid';
    if (focusLabel === 'Aesthetic') return 'Aesthetic bodybuilding';
    if (focusLabel === 'Strength') return 'Powerbuilding';
    if (v.includes('power')) return 'Powerbuilding';
    if (v.includes('aesthetic') || v.includes('bodybuilding')) return 'Aesthetic bodybuilding';
    return 'Aesthetic bodybuilding';
  }

  function mapTrainingStyle(raw) {
    const v = lower(raw);
    if (v.includes('machine')) return 'Mostly machines/cables';
    if (v.includes('free')) return 'Mostly free weights';
    if (v.includes('mix')) return 'Balanced mix';
    return 'Balanced mix';
  }

  function mapOutputStyle(raw) {
    const v = lower(raw);
    if (v.includes('rpe') || v.includes('rir')) return 'RPE/RIR cues';
    if (v.includes('sets')) return 'Simple sets x reps';
    return 'RPE/RIR cues';
  }

  function mapLocation(raw) {
    const v = lower(raw);
    if (v.includes('home')) return 'Home';
    if (v.includes('commercial')) return 'Commercial gym';
    return 'Commercial gym';
  }

  function mapActivityLevel(raw) {
    const v = lower(raw);
    if (v.includes('sedentary')) return 'Sedentary';
    if (v.includes('very')) return 'Very active';
    if (v.includes('active')) return 'Active';
    return 'Active';
  }

  function mapStress(raw) {
    const v = lower(raw);
    if (v === 'low') return 'Low';
    if (v === 'high') return 'High';
    return 'Medium';
  }

  function mapPreferredDays(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    list.forEach((entry) => {
      if (Number.isFinite(Number(entry))) {
        const code = INTAKE_DAY_MAP.get(Number(entry));
        if (code) out.push(code);
        return;
      }
      const text = lower(entry);
      if (!text) return;
      if (text.startsWith('su')) out.push('Su');
      else if (text.startsWith('mo')) out.push('Mo');
      else if (text.startsWith('tu')) out.push('Tu');
      else if (text.startsWith('we')) out.push('We');
      else if (text.startsWith('th')) out.push('Th');
      else if (text.startsWith('fr')) out.push('Fr');
      else if (text.startsWith('sa')) out.push('Sa');
    });
    return uniq(out);
  }

  function mapPriorityGroups(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    list.forEach((entry) => {
      const key = lower(entry);
      const mapped = INTAKE_FOCUS_MAP[key];
      if (mapped) out.push(mapped);
    });
    return uniq(out);
  }

  function mapPainAreas(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    list.forEach((entry) => {
      const mapped = INTAKE_AREA_MAP[lower(entry)];
      if (mapped) out.push(mapped);
    });
    return uniq(out);
  }

  function mapRecency(raw) {
    const v = lower(raw);
    if (!v) return '';
    if (v.includes('week') || v.includes('<')) return 'Recent';
    if (v.includes('12') || v.includes('year')) return 'Old';
    return '';
  }

  function mapPainProfiles(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    Object.entries(raw).forEach(([key, value]) => {
      const area = INTAKE_AREA_MAP[lower(key)];
      if (!area) return;
      const severity = Number(value?.severity);
      if (!Number.isFinite(severity)) return;
      out[area] = {
        severity,
        recency: mapRecency(value?.recency)
      };
    });
    return out;
  }

  function matchesAbsGlutesLegsDebugPayload(payload) {
    if (!trainingDebugCombo?.matchesGlutesLegsCoreDebugCombo) return false;
    return Boolean(trainingDebugCombo.matchesGlutesLegsCoreDebugCombo(payload, { rawClassic: true }));
  }

  function logDebugComboMatchEval(locationTag, evaluation) {
    const evalObj = evaluation && typeof evaluation === 'object' ? evaluation : {};
    try {
      console.info('DEBUG_COMBO_MATCH_EVAL', {
        location: locationTag,
        matched: Boolean(evalObj.matched),
        reasonIfFalse: String(evalObj.reasonIfFalse || ''),
        rawPriorityGroups: Array.isArray(evalObj.rawPriorityGroups) ? evalObj.rawPriorityGroups : [],
        normalizedPriorityGroups: Array.isArray(evalObj.normalizedPriorityGroups) ? evalObj.normalizedPriorityGroups : [],
        discipline: evalObj.discipline || '',
        trainingFeel: evalObj.trainingFeel || '',
        daysPerWeek: Number(evalObj.daysPerWeek || 0) || 0,
        sessionLengthMin: evalObj.sessionLengthMin || '',
        locationValue: evalObj.location || '',
        primaryGoal: evalObj.primaryGoal || '',
        phase: evalObj.phase || '',
        normalizedEquipmentAccess: Array.isArray(evalObj.normalizedEquipmentAccess) ? evalObj.normalizedEquipmentAccess : [],
        painAreas: Array.isArray(evalObj.painAreas) ? evalObj.painAreas : [],
        injuryMap: Array.isArray(evalObj.injuryMapKeys) ? evalObj.injuryMapKeys : [],
        injuryNotes: evalObj.injuryNotes || ''
      });
    } catch {
      // ignore console failures
    }
  }

  function logAbsGlutesLegsDebug(event, payload = {}) {
    try {
      const debugLabel = String(trainingDebugCombo?.DEBUG_COMBO_LABEL || 'glutes-legs-core');
      console.info(`[training-debug][${debugLabel}][frontend] ${event}`, {
        at: new Date().toISOString(),
        ...payload
      });
    } catch {
      // ignore console failures
    }
  }

  function mapIntakeToOblueprintPayload(intake) {
    if (!intake || typeof intake !== 'object') return null;
    const disciplineRaw = lower(intake.discipline);

    const intakeGoalRaw = lower(intake.goal);
    const macroGoalMode = readLatestMacroGoalMode();
    const primaryGoal = intakeGoalRaw
      ? (intakeGoalRaw === 'cut fat' ? 'Cut fat' : intakeGoalRaw === 'recomp' ? 'Recomp' : 'Build size')
      : goalModeToPrimaryGoal(macroGoalMode);

    const focusRaw = lower(intake.priority);
    const focus = focusRaw === 'military'
      ? 'Strength'
      : focusRaw === 'strength'
        ? 'Strength'
        : focusRaw === 'size'
          ? 'Size'
          : 'Aesthetic';

    const timeline = ['4 weeks', '8 weeks', '12+ weeks'].includes(String(intake.timeline || ''))
      ? String(intake.timeline)
      : '8 weeks';

    const experience = mapExperience(intake.experience);
    const location = mapLocation(intake.location);
    const trainingStyle = mapTrainingStyle(intake.loadStyle);
    const outputStyle = mapOutputStyle(intake.outputStyle);
    const closeToFailure = lower(intake.trainToFailure) === 'yes' ? 'Yes' : 'No';
    const trainingFeel = mapTrainingFeel(intake.modality, focus);
    const discipline = disciplineRaw === 'military' || trainingFeel === 'Military Hybrid'
      ? 'military'
      : disciplineRaw === 'powerbuilding' || trainingFeel === 'Powerbuilding'
        ? 'powerbuilding'
        : 'bodybuilding';

    const daysPerWeek = Math.max(2, Math.min(6, Math.round(Number(intake.daysPerWeek) || 4)));
    const sessionLengthMin = ['30', '45', '60', '75+'].includes(String(intake.sessionLength))
      ? String(intake.sessionLength)
      : '60';

    const priorityGroups = mapPriorityGroups(intake.focus);
    const movementsToAvoid = Array.isArray(intake.avoidMoves) ? intake.avoidMoves.map((v) => String(v)) : [];
    const preferredDays = mapPreferredDays(intake.preferredDays);
    const equipmentAccess = Array.isArray(intake.equipment) ? intake.equipment.map((v) => String(v)) : [];
    const painAreas = mapPainAreas(intake.injuries);
    const painProfilesByArea = mapPainProfiles(intake.injuryDetails);

    return {
      discipline,
      trainingFeel,
      primaryGoal,
      timeline,
      focus,
      experience,
      location,
      trainingStyle,
      outputStyle,
      closeToFailure,
      daysPerWeek,
      sessionLengthMin,
      priorityGroups,
      movementsToAvoid,
      preferredDays,
      equipmentAccess,
      painAreas,
      painProfilesByArea,
      sleepHours: Math.max(4, Math.min(10, Number(intake.sleepHours) || 7)),
      activityLevel: mapActivityLevel(intake.activityLevel),
      stress: mapStress(intake.stress),
      // Optional "biggest lifts" (Task 3) — real starting-weight anchors. Passed
      // straight through to normalizeOblueprintPayload / anchorInputsForUser.
      benchWeight: Number(intake.strength && intake.strength.benchWeight) || null,
      benchReps: Number(intake.strength && intake.strength.benchReps) || null,
      lowerMovement: (intake.strength && intake.strength.squatWeight) ? 'Back Squat' : null,
      lowerWeight: Number(intake.strength && intake.strength.squatWeight) || null,
      lowerReps: Number(intake.strength && intake.strength.squatReps) || null,
      hingeMovement: (intake.strength && intake.strength.deadliftWeight) ? 'Deadlift' : null,
      hingeWeight: Number(intake.strength && intake.strength.deadliftWeight) || null,
      hingeReps: Number(intake.strength && intake.strength.deadliftReps) || null,
      // Make Jason's double-progression the default for powerbuilding (his
      // vision), while bodybuilding stays on the standard hypertrophy ladder,
      // unless the client explicitly picked a style in onboarding ('auto' means
      // "use the discipline default").
      progressionStyle: (() => {
        const picked = String(intake.progressionStyle || '').trim();
        if (picked && picked !== 'auto') return picked;
        return discipline === 'powerbuilding' ? 'double_progression' : undefined;
      })(),
      // Optional conditioning (Task 6). Explicit yes/no wins; 'auto'/unset turns
      // it on for a fat-loss goal (skippable either way).
      wantsCardio: (() => {
        const c = String(intake.wantsCardio || '').toLowerCase();
        if (c === 'yes' || c === 'true' || c === 'on') return true;
        if (c === 'no' || c === 'false' || c === 'off') return false;
        return primaryGoal === 'Cut fat';
      })()
    };
  }

  function describeRoutingSelection(payload) {
    const src = payload && typeof payload === 'object' ? payload : {};
    const one = (v) => String(v || '').trim();
    const lowerOne = (v) => one(v).toLowerCase();

    const focusRaw = one(src.focus);
    const focusLabel = focusRaw === 'Aesthetic'
      ? 'Aesthetic = shape and proportion'
      : focusRaw === 'Strength'
        ? 'Strength = heavier lifts'
        : focusRaw === 'Size'
          ? 'Powerbuilding'
          : '';

    const trainingFeelRaw = one(src.trainingFeel);
    const disciplineRaw = lowerOne(src.discipline);
    const isOblueprint = Boolean(focusRaw || trainingFeelRaw || one(src.primaryGoal));

    let engineLabel = '';
    if (isOblueprint) {
      if (focusRaw === 'Aesthetic' || lowerOne(trainingFeelRaw).includes('aesthetic')) {
        engineLabel = 'Aesthetic bodybuilding engine';
      } else if (focusRaw === 'Strength' || lowerOne(trainingFeelRaw).includes('power')) {
        engineLabel = 'Powerbuilding engine';
      } else {
        engineLabel = 'Bodybuilding engine';
      }
    } else {
      if (disciplineRaw === 'powerlifting') engineLabel = 'Powerlifting engine';
      else if (disciplineRaw === 'calisthenics') engineLabel = 'Calisthenics engine';
      else if (disciplineRaw === 'powerbuilding') engineLabel = 'Powerbuilding engine';
      else if (disciplineRaw === 'bodybuilding') engineLabel = 'Bodybuilding engine';
      else engineLabel = 'Training engine';
    }

    const pickedLabel = focusLabel || one(src.primaryGoal) || one(src.phase) || one(src.discipline) || 'default logic';
    return {
      pickedLabel,
      engineLabel,
      details: {
        focus: focusRaw || null,
        trainingFeel: trainingFeelRaw || null,
        primaryGoal: one(src.primaryGoal) || null,
        timeline: one(src.timeline) || null,
        discipline: one(src.discipline) || null,
        phase: one(src.phase) || null
      }
    };
  }

  async function readRemoteIntake() {
    if (!state?.auth?.user) return null;
    try {
      const resp = await api('/api/profile', { method: 'GET' });
      if (!resp.ok) return null;
      return resp.json?.profile?.profile?.training_intake || null;
    } catch {
      return null;
    }
  }

  async function loadSavedIntake() {
    const local = readLocalIntake();
    if (isIntakeComplete(local)) return local;
    const remote = await readRemoteIntake();
    if (isIntakeComplete(remote)) return remote;
    return local || remote || null;
  }

  async function tryAutoOnboardFromIntake(force = false) {
    if (autoOnboardInFlight) return false;
    // Never auto-build while impersonating — the saved intake in this browser
    // is the trainer's, not the client's. The trainer builds by hand through
    // the wizard instead.
    if (sessionIsImpersonated) return false;
    if (hasRenderablePlanRow(state.planRow)) {
      // A plan already exists — any owed-build flag from onboarding is stale.
      clearOwedAutoBuild();
      return false;
    }
    if (!force && isAutoRetryPaused()) return false;
    if (!force && shouldOpenWizardOnly()) return false;
    const intake = await loadSavedIntake();
    if (!intake) return false;
    // The owed-build flag counts as a build trigger ONLY here, where we've
    // already confirmed there is no renderable plan to preserve.
    const forceStart = force || shouldForceAutostart() || hasOwedAutoBuild();
    if (!forceStart) return false;
    if (!isIntakeComplete(intake)) return false;
    const payload = mapIntakeToOblueprintPayload(intake);
    if (!payload) return false;
    if (hasRenderablePlanRow(state.planRow) && hasRecentlyCompletedTrainingBuild(payload)) {
      try {
        console.info('training_build_duplicate_request_ignored', {
          source: 'tryAutoOnboardFromIntake',
          reason: 'recent_direct_success',
          routeKind: String(state.generating?.completedRouteKind || ''),
          requestId: Number.isFinite(Number(state.generating?.completedRequestId)) ? Number(state.generating.completedRequestId) : null
        });
      } catch {
        // ignore console failures
      }
      return false;
    }
    autoOnboardInFlight = true;
    clearOwedAutoBuild();
    try {
      await submitOnboarding(payload);
    } finally {
      autoOnboardInFlight = false;
    }
    return true;
  }

  async function regeneratePlanWithSavedRules() {
    if (!state?.auth?.user?.isOwner) return false;
    const intake = await loadSavedIntake();
    if (!intake) {
      state.planError = 'No saved workout setup was found for regeneration.';
      render();
      return false;
    }
    const payload = mapIntakeToOblueprintPayload(intake);
    if (!payload) {
      state.planError = 'Your saved workout setup is incomplete. Reopen the workout setup to regenerate this plan.';
      render();
      return false;
    }
    state.planError = null;
    await submitOnboarding(payload);
    return true;
  }

  function lockControlPanelOpen() {
    try {
      const isMobileControl = (() => {
        try { return window.matchMedia('(max-width: 640px)').matches; } catch { return false; }
      })();
      if (isMobileControl) return;

      document.body.classList.add('control-open');
      document.body.classList.remove('control-collapsed');
      const cp = document.getElementById('control-panel');
      if (cp) {
        cp.classList.add('open');
        cp.classList.remove('collapsed');
      }
      const closeBtn = document.getElementById('control-close');
      closeBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      }, true);
      if (cp && window.MutationObserver) {
        const obs = new MutationObserver(() => {
          if (!cp.classList.contains('open')) cp.classList.add('open');
          if (cp.classList.contains('collapsed')) cp.classList.remove('collapsed');
          document.body.classList.add('control-open');
          document.body.classList.remove('control-collapsed');
        });
        obs.observe(cp, { attributes: true, attributeFilter: ['class'] });
      }
    } catch {
      // ignore
    }
  }

  lockControlPanelOpen();

  function hasRenderablePlanRow(planRow) {
    return !!(planRow?.plan && Array.isArray(planRow.plan.weeks) && planRow.plan.weeks.length > 0);
  }

  const state = {
    auth: { user: null },
    profile: null,
    planRow: null,
    logs: [],
    allLogs: [],
    liftHistory: new Map(),
    workoutInputDrafts: new Map(),
    workoutSetCountDrafts: new Map(),
    workoutReadinessDrafts: new Map(),
    customWorkoutDrafts: new Map(),
    userCustomWorkouts: [],
    userCustomWorkoutsLoadedFor: '',
    view: 'wizard', // loading | wizard | generating | upsell | plan
    planError: null,
    generating: {
      startedAt: 0,
      minMs: 9_000,
      timeoutMs: 60_000,
      raf: 0,
      requestId: 0,
      completedRequestId: null,
      completedRequestKey: '',
      completedRouteKind: '',
      completedAt: 0,
      controller: null,
      pollToken: null,
      activeRequestKey: '',
      activeRouteKind: '',
      activeEndpoint: '',
      frontendRequestStartedAt: 0,
      handoffActive: false,
      handoffMessage: '',
      handoffMeta: ''
    },
    mealService: {
      optIn: false,
      phone: '',
      email: '',
      status: ''
    },
    wizard: {
      step: 1,
      pendingStep: null,
      discipline: 'bodybuilding',
      experience: 'beginner',
      strength: {},
      goalMode: 'muscle_gain',
      phase: 'bulk',
      targetWeightLb: '',
      timePerSession: '',
      trainingAgeBucket: '',
      emphasis: [],
      equipmentStylePref: 'mix',
      injury: { has: false, joints: [], note: '' },
      daysPerWeek: null,
      unavailableDays: [],
      equipmentAccess: { bodyweight: true, dumbbell: false, barbell: false, cable: false, machine: false },
      profile: { firstName: '', age: '', locationCity: '', locationState: '', goals: '', injuries: '' },
      profileImage: { dataUrl: null },
      bbDefaultsSet: false
    }
  };

  const shareUi = {
    open: false,
    mode: (() => {
      try {
        const raw = String(sessionStorage.getItem('ode_training_share_mode_v1') || '').trim().toLowerCase();
        if (raw === 'sms' || raw === 'pdf') return raw;
      } catch {
        // ignore storage failures
      }
      return 'app';
    })(),
    loading: false,
    loaded: false,
    bootstrapRequested: false,
    accounts: [],
    accountIndex: new Map(),
    connectedMembers: [],
    status: '',
    requesting: new Set(),
    kicking: new Set(),
    requested: new Set(),
    latestStatus: new Map(),
    confirmToastTimer: 0,
    query: ''
  };
  let planTopbarActionsDropdownOpen = false;

  function normalizeShareMode(raw) {
    const key = String(raw || '').trim().toLowerCase();
    return key === 'sms' || key === 'pdf' ? key : 'app';
  }

  function setShareMode(raw) {
    const next = normalizeShareMode(raw);
    shareUi.mode = next;
    try {
      sessionStorage.setItem('ode_training_share_mode_v1', next);
    } catch {
      // ignore storage failures
    }
  }

  const SHARE_CONFIRM_TOAST_DELAY_MS = 10_000;
  const SHARE_OUTGOING_SYNC_MS = 4500;
  const SHARE_DEBUG_VERSION = '2026-03-08-share-debug-6';
  const TRAINING_SKIP_LOG_KEY = 'ode_training_skip_log_v1';
  // "Do another day": a per-date override that swaps which plan day you perform
  // on a given date (without touching the skip/schedule counters). Keyed by the
  // date you're doing it on -> { doDate, dayIndex, focus, reason, loggedAt }.
  const TRAINING_DO_OVERRIDE_KEY = 'ode_training_do_override_v1';
  const TRAINING_WELCOME_STORAGE_KEY = 'ode_training_share_welcome_v1';
  const TRAINING_WELCOME_TTL_MS = 6 * 60 * 60 * 1000;
  const TRAINING_QUICK_TOUR_SEEN_PREFIX = 'ode_training_quick_tour_seen_v1';
  const TRAINING_QUICK_TOUR_PENDING_PREFIX = 'ode_training_quick_tour_pending_v1';
  const TRAINING_QUICK_TOUR_FIRST_PLAN_PREFIX = 'ode_training_quick_tour_first_plan_v1';
  const TRAINING_WELCOME_DAY_CODES = ['SU', 'M', 'T', 'W', 'TH', 'F', 'S'];
  const TRAINING_WELCOME_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const TRAINING_WELCOME_DAY_ALIASES = {
    s: 'S',
    sa: 'S',
    sat: 'S',
    saturday: 'S',
    su: 'SU',
    sun: 'SU',
    sunday: 'SU',
    m: 'M',
    mo: 'M',
    mon: 'M',
    monday: 'M',
    t: 'T',
    tu: 'T',
    tue: 'T',
    tues: 'T',
    tuesday: 'T',
    w: 'W',
    we: 'W',
    wed: 'W',
    wednesday: 'W',
    th: 'TH',
    thu: 'TH',
    thur: 'TH',
    thurs: 'TH',
    thursday: 'TH',
    f: 'F',
    fr: 'F',
    fri: 'F',
    friday: 'F'
  };
  let trainingWelcomeShown = false;

  function normalizeTrainingWelcomeDayCodes(raw) {
    const src = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const item of src) {
      const key = String(item || '').trim().toLowerCase();
      if (!key) continue;
      const mapped = TRAINING_WELCOME_DAY_ALIASES[key];
      if (!mapped) continue;
      if (!out.includes(mapped)) out.push(mapped);
    }
    return out;
  }

  function consumeTrainingWelcomePayload() {
    try {
      const raw = sessionStorage.getItem(TRAINING_WELCOME_STORAGE_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(TRAINING_WELCOME_STORAGE_KEY);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const ts = Number(parsed.ts || 0);
      if (Number.isFinite(ts) && ts > 0 && Math.abs(Date.now() - ts) > TRAINING_WELCOME_TTL_MS) return null;
      const fromDisplayName = String(parsed.fromDisplayName || parsed.fromUsername || 'your friend').trim() || 'your friend';
      const fromUsername = String(parsed.fromUsername || '').trim() || null;
      const split = String(parsed.split || '').trim() || 'Training split';
      const dayCodes = normalizeTrainingWelcomeDayCodes(parsed.dayCodes);
      return { fromDisplayName, fromUsername, split, dayCodes };
    } catch {
      try { sessionStorage.removeItem(TRAINING_WELCOME_STORAGE_KEY); } catch { /* ignore */ }
      return null;
    }
  }

  let pendingTrainingWelcome = consumeTrainingWelcomePayload();
  let shareEventsInFlight = false;
  const trainingQuickTour = {
    active: false,
    stepIndex: 0,
    overlay: null,
    popover: null,
    highlighted: null,
    steps: [],
    launchTimer: 0
  };

  function trainingQuickTourStorageKey(prefix) {
    const uid = String(state?.auth?.user?.id || '').trim() || 'anon';
    return `${prefix}:${uid}`;
  }

  function hasTrainingQuickTourSeen() {
    try {
      return localStorage.getItem(trainingQuickTourStorageKey(TRAINING_QUICK_TOUR_SEEN_PREFIX)) === '1';
    } catch {
      return false;
    }
  }

  function markTrainingQuickTourSeen() {
    try {
      localStorage.setItem(trainingQuickTourStorageKey(TRAINING_QUICK_TOUR_SEEN_PREFIX), '1');
    } catch {
      // ignore
    }
  }

  function hasTrainingQuickTourPending() {
    try {
      return localStorage.getItem(trainingQuickTourStorageKey(TRAINING_QUICK_TOUR_PENDING_PREFIX)) === '1';
    } catch {
      return false;
    }
  }

  function setTrainingQuickTourPending() {
    try {
      localStorage.setItem(trainingQuickTourStorageKey(TRAINING_QUICK_TOUR_PENDING_PREFIX), '1');
    } catch {
      // ignore
    }
  }

  function clearTrainingQuickTourPending() {
    try {
      localStorage.removeItem(trainingQuickTourStorageKey(TRAINING_QUICK_TOUR_PENDING_PREFIX));
    } catch {
      // ignore
    }
  }

  function hasTrainingQuickTourFirstPlanArmed() {
    try {
      return localStorage.getItem(trainingQuickTourStorageKey(TRAINING_QUICK_TOUR_FIRST_PLAN_PREFIX)) === '1';
    } catch {
      return false;
    }
  }

  function markTrainingQuickTourFirstPlanArmed() {
    try {
      localStorage.setItem(trainingQuickTourStorageKey(TRAINING_QUICK_TOUR_FIRST_PLAN_PREFIX), '1');
    } catch {
      // ignore
    }
  }

  function maybeArmTrainingQuickTourForFirstPlan() {
    if (!state?.auth?.user?.id || !state?.planRow?.id) return;
    if (hasTrainingQuickTourSeen()) return;
    if (hasTrainingQuickTourPending()) return;
    if (hasTrainingQuickTourFirstPlanArmed()) return;
    markTrainingQuickTourFirstPlanArmed();
    setTrainingQuickTourPending();
  }

  function buildTrainingQuickTourSteps() {
    return [
      {
        selector: '.workout-today-bar',
        title: 'Today view',
        body: 'This card is your daily command center. It shows today\'s split, date navigation, and where you log the session.'
      },
      {
        selector: '.btn-start-workout',
        fallbackSelector: '.workout-today-bar',
        title: 'Start the session',
        body: 'Tap Start workout to open today\'s exercise list and begin logging sets, reps, and performance.'
      },
      {
        selector: '.plan-topbar-actions-mainrow',
        fallbackSelector: '.plan-topbar-actions',
        title: 'Plan controls',
        body: 'Manage your plan here: Make New Workout, PDF export, and Modify Current Workout.'
      },
      {
        selector: '#training-day-tabs',
        title: 'Your split days',
        body: 'These tabs are your weekly split. Tap any day to review or train that day\'s workout.'
      },
      {
        selector: '.workout-rel-label',
        title: 'Jump back to today',
        body: 'If you scroll to other dates, tap this date label to snap back to today\'s workout.'
      },
      {
        selector: '[data-share-workout="1"]',
        title: 'Share with a teammate',
        body: 'Use Share Workout to invite a friend to join your plan and train together.'
      },
      {
        selector: '.exercise-action-row',
        fallbackSelector: '.exercise-row',
        title: 'Swap or report pain',
        body: 'Each exercise has quick actions to Swap exercise or Report pain and get a safer adjustment.'
      }
    ];
  }

  function isTrainingQuickTourTargetVisible(el) {
    if (!el || !el.isConnected) return false;
    try {
      const style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 6 && rect.height >= 6;
    } catch {
      return false;
    }
  }

  function resolveTrainingQuickTourTarget(step) {
    const primary = document.querySelector(step?.selector || '');
    if (isTrainingQuickTourTargetVisible(primary)) return primary;
    const fallback = document.querySelector(step?.fallbackSelector || '');
    if (isTrainingQuickTourTargetVisible(fallback)) return fallback;
    return null;
  }

  function setTrainingQuickTourHighlight(target) {
    if (trainingQuickTour.highlighted === target) return;
    trainingQuickTour.highlighted?.classList?.remove('ode-tour-highlight');
    trainingQuickTour.highlighted = target;
    trainingQuickTour.highlighted?.classList?.add('ode-tour-highlight');
  }

  function positionTrainingQuickTourHole(target) {
    const overlay = trainingQuickTour.overlay;
    if (!overlay || !target) return;
    const rect = target.getBoundingClientRect();
    const pad = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const topEl = overlay.querySelector('[data-ode-shade=\"top\"]');
    const leftEl = overlay.querySelector('[data-ode-shade=\"left\"]');
    const rightEl = overlay.querySelector('[data-ode-shade=\"right\"]');
    const bottomEl = overlay.querySelector('[data-ode-shade=\"bottom\"]');

    const topH = Math.max(0, rect.top - pad);
    const holeTop = Math.max(0, rect.top - pad);
    const holeLeft = Math.max(0, rect.left - pad);
    const holeWidth = Math.min(vw, rect.width + pad * 2);
    const holeHeight = Math.min(vh, rect.height + pad * 2);
    const holeRight = holeLeft + holeWidth;
    const holeBottom = holeTop + holeHeight;

    if (topEl) {
      topEl.style.top = '0px';
      topEl.style.left = '0px';
      topEl.style.width = `${vw}px`;
      topEl.style.height = `${topH}px`;
    }

    if (leftEl) {
      leftEl.style.top = `${holeTop}px`;
      leftEl.style.left = '0px';
      leftEl.style.width = `${holeLeft}px`;
      leftEl.style.height = `${holeHeight}px`;
    }

    if (rightEl) {
      rightEl.style.top = `${holeTop}px`;
      rightEl.style.left = `${holeRight}px`;
      rightEl.style.width = `${Math.max(0, vw - holeRight)}px`;
      rightEl.style.height = `${holeHeight}px`;
    }

    if (bottomEl) {
      bottomEl.style.top = `${holeBottom}px`;
      bottomEl.style.left = '0px';
      bottomEl.style.width = `${vw}px`;
      bottomEl.style.height = `${Math.max(0, vh - holeBottom)}px`;
    }
  }

  function positionTrainingQuickTourPopover(target) {
    const popover = trainingQuickTour.popover;
    if (!popover || !target) return;
    const rect = target.getBoundingClientRect();
    const pad = 12;
    const gap = 14;
    const popRect = popover.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
    const candidates = [
      { left: rect.right + gap, top: rect.top + rect.height / 2 - popRect.height / 2, placement: 'right' },
      { left: rect.left - popRect.width - gap, top: rect.top + rect.height / 2 - popRect.height / 2, placement: 'left' },
      { left: rect.left + rect.width / 2 - popRect.width / 2, top: rect.bottom + gap, placement: 'bottom' },
      { left: rect.left + rect.width / 2 - popRect.width / 2, top: rect.top - popRect.height - gap, placement: 'top' }
    ];
    const fits = (pos) => (
      pos.left >= pad &&
      pos.top >= pad &&
      pos.left + popRect.width <= vw - pad &&
      pos.top + popRect.height <= vh - pad
    );
    const chosen = candidates.find(fits) || candidates[2];
    const left = clamp(chosen.left, pad, vw - popRect.width - pad);
    const top = clamp(chosen.top, pad, vh - popRect.height - pad);

    popover.dataset.placement = chosen.placement;
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.classList.add('show');
    positionTrainingQuickTourHole(target);
  }

  function onTrainingQuickTourReposition() {
    if (!trainingQuickTour.active || !trainingQuickTour.highlighted) return;
    positionTrainingQuickTourHole(trainingQuickTour.highlighted);
    positionTrainingQuickTourPopover(trainingQuickTour.highlighted);
  }

  function teardownTrainingQuickTour() {
    if (trainingQuickTour.launchTimer) {
      clearTimeout(trainingQuickTour.launchTimer);
      trainingQuickTour.launchTimer = 0;
    }
    document.body?.classList?.remove('ode-tour-active');
    trainingQuickTour.highlighted?.classList?.remove('ode-tour-highlight');
    trainingQuickTour.highlighted = null;
    trainingQuickTour.overlay?.remove();
    trainingQuickTour.popover?.remove();
    trainingQuickTour.overlay = null;
    trainingQuickTour.popover = null;
    window.removeEventListener('resize', onTrainingQuickTourReposition);
    window.removeEventListener('scroll', onTrainingQuickTourReposition, true);
    document.removeEventListener('keydown', onTrainingQuickTourKeydown);
  }

  function finishTrainingQuickTour() {
    teardownTrainingQuickTour();
    trainingQuickTour.active = false;
    markTrainingQuickTourSeen();
    clearTrainingQuickTourPending();
  }

  function onTrainingQuickTourKeydown(e) {
    if (!trainingQuickTour.active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      finishTrainingQuickTour();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      showTrainingQuickTourStep(trainingQuickTour.stepIndex + 1);
    }
  }

  function ensureTrainingQuickTourUi() {
    if (trainingQuickTour.overlay && trainingQuickTour.popover) return;
    const overlay = document.createElement('div');
    overlay.className = 'ode-tour-overlay ode-training-tour-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class=\"ode-tour-shade\" data-ode-shade=\"top\"></div>
      <div class=\"ode-tour-shade\" data-ode-shade=\"left\"></div>
      <div class=\"ode-tour-shade\" data-ode-shade=\"right\"></div>
      <div class=\"ode-tour-shade\" data-ode-shade=\"bottom\"></div>
    `.trim();

    const popover = document.createElement('div');
    popover.className = 'ode-tour-popover ode-training-tour-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'true');
    popover.innerHTML = `
      <div class="ode-tour-kicker ode-training-tour-kicker">Training quick tour</div>
      <div class=\"ode-tour-title\" id=\"ode-training-tour-title\"></div>
      <div class=\"ode-tour-body\" id=\"ode-training-tour-body\"></div>
      <div class=\"ode-tour-footer\">
        <div class=\"ode-tour-step\" id=\"ode-training-tour-step\"></div>
        <div class=\"ode-tour-actions\">
          <button type=\"button\" class=\"ode-tour-btn\" id=\"ode-training-tour-skip\">Skip</button>
          <button type=\"button\" class=\"ode-tour-btn primary\" id=\"ode-training-tour-next\">Next</button>
        </div>
      </div>
    `.trim();

    document.body.appendChild(overlay);
    document.body.appendChild(popover);

    popover.querySelector('#ode-training-tour-skip')?.addEventListener('click', () => {
      finishTrainingQuickTour();
    });
    popover.querySelector('#ode-training-tour-next')?.addEventListener('click', () => {
      showTrainingQuickTourStep(trainingQuickTour.stepIndex + 1);
    });

    trainingQuickTour.overlay = overlay;
    trainingQuickTour.popover = popover;
    window.addEventListener('resize', onTrainingQuickTourReposition);
    window.addEventListener('scroll', onTrainingQuickTourReposition, true);
    document.addEventListener('keydown', onTrainingQuickTourKeydown);
  }

  function showTrainingQuickTourStep(nextIndex) {
    if (!trainingQuickTour.active) return;
    const steps = Array.isArray(trainingQuickTour.steps) ? trainingQuickTour.steps : [];
    if (!steps.length || nextIndex >= steps.length) {
      finishTrainingQuickTour();
      return;
    }

    let idx = Math.max(0, Number(nextIndex) || 0);
    let step = steps[idx] || null;
    let target = step ? resolveTrainingQuickTourTarget(step) : null;
    while (step && !target && idx < steps.length - 1) {
      idx += 1;
      step = steps[idx] || null;
      target = step ? resolveTrainingQuickTourTarget(step) : null;
    }

    if (!step || !target) {
      finishTrainingQuickTour();
      return;
    }

    trainingQuickTour.stepIndex = idx;
    ensureTrainingQuickTourUi();
    document.body?.classList?.add('ode-tour-active');
    setTrainingQuickTourHighlight(target);
    try {
      target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    } catch {
      // ignore
    }

    const titleEl = trainingQuickTour.popover?.querySelector('#ode-training-tour-title');
    const bodyEl = trainingQuickTour.popover?.querySelector('#ode-training-tour-body');
    const stepEl = trainingQuickTour.popover?.querySelector('#ode-training-tour-step');
    const nextBtn = trainingQuickTour.popover?.querySelector('#ode-training-tour-next');
    if (titleEl) titleEl.textContent = String(step.title || 'Training quick tour');
    if (bodyEl) bodyEl.textContent = String(step.body || '');
    if (stepEl) stepEl.textContent = `${idx + 1} of ${steps.length}`;
    if (nextBtn) nextBtn.textContent = idx >= steps.length - 1 ? 'Done' : 'Next ›';

    positionTrainingQuickTourPopover(target);
  }

  function startTrainingQuickTour() {
    if (trainingQuickTour.active) return;
    if (!state?.auth?.user?.id || !state?.planRow?.id) return;
    if (document.querySelector('.ode-tour-overlay') || document.body?.classList?.contains('ode-tour-active')) return;
    trainingQuickTour.steps = buildTrainingQuickTourSteps();
    if (!trainingQuickTour.steps.length) {
      markTrainingQuickTourSeen();
      clearTrainingQuickTourPending();
      return;
    }
    trainingQuickTour.active = true;
    showTrainingQuickTourStep(0);
  }

  function maybeStartTrainingQuickTour() {
    if (trainingQuickTour.active) return;
    if (state.view !== 'plan') return;
    if (!state?.auth?.user?.id || !state?.planRow?.id) return;
    if (hasTrainingQuickTourSeen()) {
      clearTrainingQuickTourPending();
      return;
    }
    if (!hasTrainingQuickTourPending()) return;
    if (trainingQuickTour.launchTimer) clearTimeout(trainingQuickTour.launchTimer);
    trainingQuickTour.launchTimer = setTimeout(() => {
      trainingQuickTour.launchTimer = 0;
      startTrainingQuickTour();
    }, 220);
  }

  function maybeShowTrainingWelcomeModal() {
    if (trainingWelcomeShown) return;
    if (!pendingTrainingWelcome) return;
    if (state.view !== 'plan') return;
    if (!state.auth.user || !state.planRow?.id) return;

    let dayCodes = Array.isArray(pendingTrainingWelcome.dayCodes) ? [...pendingTrainingWelcome.dayCodes] : [];
    if (!dayCodes.length) {
      const daysPerWeek = Number(state.planRow?.plan?.meta?.daysPerWeek || state.planRow?.days_per_week || 0);
      if (daysPerWeek > 0) {
        dayCodes = scheduleWeekdays(daysPerWeek, new Date())
          .map((idx) => TRAINING_WELCOME_DAY_CODES[idx])
          .filter(Boolean);
      }
    }
    if (!dayCodes.length) {
      dayCodes = ['M', 'T', 'W', 'TH', 'F'];
    }

    const fromName = String(pendingTrainingWelcome.fromDisplayName || pendingTrainingWelcome.fromUsername || 'your friend').trim() || 'your friend';
    const fromPossessive = fromName.toLowerCase().endsWith('s') ? `${fromName}'` : `${fromName}'s`;
    const split = String(pendingTrainingWelcome.split || 'Training split').trim();

    const todayIdx = new Date().getDay();
    const todayCode = TRAINING_WELCOME_DAY_CODES[todayIdx] || '';
    const todayName = TRAINING_WELCOME_DAY_NAMES[todayIdx] || 'Today';
    const dayPosition = dayCodes.indexOf(todayCode);
    const todayLine = dayPosition >= 0
      ? `Today is ${todayName} (Day ${dayPosition + 1}).`
      : `Today is ${todayName}.`;

    const existing = document.getElementById('training-share-welcome-modal');
    if (existing) existing.remove();

    const close = () => {
      const node = document.getElementById('training-share-welcome-modal');
      if (node) node.remove();
    };

    const overlay = el('div', {
      class: 'schedule-modal training-share-welcome-modal',
      id: 'training-share-welcome-modal',
      role: 'dialog',
      'aria-modal': 'true'
    },
    el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close welcome' }),
    el('div', { class: 'schedule-modal-card' },
      el('div', { class: 'schedule-modal-head' },
        el('div', { class: 'schedule-modal-title' }, 'Welcome to your new workout'),
        el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close welcome' }, '×')
      ),
      el('div', { class: 'schedule-modal-body training-share-welcome-body' },
        el('div', { class: 'training-share-welcome-line' }, `Welcome to ${fromPossessive} workout.`),
        el('div', { class: 'training-share-welcome-line' }, `They are working out ${dayCodes.join(' ')}.`),
        el('div', { class: 'training-share-welcome-line' }, `On a ${split}.`),
        el('div', { class: 'training-share-welcome-line' }, todayLine)
      ),
      el('div', { class: 'schedule-modal-actions' },
        el('button', { type: 'button', class: 'btn btn-share-workout' }, 'Enter workout')
      )
    ));

    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', close);
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', close);
    overlay.querySelector('.schedule-modal-actions button')?.addEventListener('click', close);
    document.body.appendChild(overlay);

    trainingWelcomeShown = true;
    pendingTrainingWelcome = null;
  }

  function showShareSystemToast(title, subText) {
    const existing = document.getElementById('training-share-system-toast');
    if (existing) existing.remove();
    const toast = el('div', { class: 'workout-saved-toast', id: 'training-share-system-toast', role: 'status' },
      el('div', { class: 'workout-saved-icon', 'aria-hidden': 'true' }, '!'),
      el('div', { class: 'workout-saved-text' },
        el('div', { class: 'workout-saved-title' }, String(title || 'Share update')),
        el('div', { class: 'workout-saved-sub' }, String(subText || ''))
      )
    );
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 280);
      }, 3400);
    });
  }

  function showOwnerRemovedModal({ actorName, whenText }) {
    const existing = document.getElementById('training-share-removed-modal');
    if (existing) existing.remove();
    const close = () => {
      const node = document.getElementById('training-share-removed-modal');
      if (node) node.remove();
    };
    const overlay = el('div', {
      class: 'schedule-modal',
      id: 'training-share-removed-modal',
      role: 'dialog',
      'aria-modal': 'true'
    },
    el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close notice' }),
    el('div', { class: 'schedule-modal-card' },
      el('div', { class: 'schedule-modal-head' },
        el('div', { class: 'schedule-modal-title' }, 'Share update'),
        el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close notice' }, '×')
      ),
      el('div', { class: 'schedule-modal-body' },
        el('div', { class: 'training-share-welcome-line' }, `${actorName} removed you from the shared workout.`),
        el('div', { class: 'training-share-welcome-line' }, `At ${whenText}.`),
        el('div', { class: 'training-share-welcome-line' }, 'Your copied workout is still yours on your account.')
      ),
      el('div', { class: 'schedule-modal-actions' },
        el('button', { type: 'button', class: 'btn btn-share-workout' }, 'OK')
      )
    ));
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', close);
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', close);
    overlay.querySelector('.schedule-modal-actions button')?.addEventListener('click', close);
    document.body.appendChild(overlay);
  }

  async function pollShareEvents({ force = false } = {}) {
    const uid = String(state.auth.user?.id || '').trim();
    if (!uid) return;
    if (!force && document.hidden) return;
    if (shareEventsInFlight) return;
    shareEventsInFlight = true;
    try {
      const resp = await api('/api/training/share/events?fresh=1', { method: 'GET' });
      if (!resp.ok || !resp.json?.ok) return;
      const events = Array.isArray(resp.json?.events) ? resp.json.events : [];
      if (!events.length) return;
      events
        .slice()
        .reverse()
        .forEach((evt) => {
          const actorName = String(evt?.actorDisplayName || evt?.actorUsername || 'Owner').trim() || 'Owner';
          const whenText = (() => {
            const d = new Date(evt?.createdAt || Date.now());
            if (!Number.isFinite(d.getTime())) return new Date().toLocaleString();
            return d.toLocaleString();
          })();
          const type = String(evt?.eventType || '').trim().toLowerCase();
          if (type === 'owner_removed') {
            showOwnerRemovedModal({ actorName, whenText });
            return;
          }
          if (type === 'recipient_left') {
            showShareSystemToast('Share update', `${actorName} removed themselves at ${whenText}.`);
          }
        });
    } finally {
      shareEventsInFlight = false;
    }
  }

  const shareDebugEnabled = false;
  let shareDebugPanel = null;
  try {
    shareDebugPanel = document.getElementById('share-debug-panel');
    shareDebugPanel?.remove?.();
  } catch {
    shareDebugPanel = null;
  }
  function ensureShareDebugPanel() {
    return null;
  }
  function shareDebugLog() {}

  function clearShareConfirmToastTimer() {
    if (!shareUi.confirmToastTimer) return;
    window.clearTimeout(shareUi.confirmToastTimer);
    shareUi.confirmToastTimer = 0;
  }

  function syncShareOutgoingState(payload) {
    const pendingIds = Array.isArray(payload?.targetUserIds)
      ? payload.targetUserIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const pendingSet = new Set(pendingIds);
    shareUi.requested.clear();
    pendingSet.forEach((id) => shareUi.requested.add(id));

    shareUi.latestStatus.clear();
    const rawStatusByUser = payload?.latestStatusByUserId && typeof payload.latestStatusByUserId === 'object'
      ? payload.latestStatusByUserId
      : {};
    for (const [rawId, rawStatus] of Object.entries(rawStatusByUser)) {
      const id = String(rawId || '').trim();
      if (!id) continue;
      let status = String(rawStatus || '').trim().toLowerCase();
      if (!status) continue;
      if (status === 'rejected') status = 'declined';
      if (status === 'pending') continue;
      if (status !== 'accepted' && status !== 'declined') continue;
      shareUi.latestStatus.set(id, status);
    }

    const acceptedUsers = Array.isArray(payload?.acceptedUsers) ? payload.acceptedUsers : [];
    for (const row of acceptedUsers) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      const prev = shareUi.accountIndex.get(id) || {};
      shareUi.accountIndex.set(id, {
        ...prev,
        id,
        username: row?.username != null ? String(row.username) : (prev?.username || null),
        displayName: row?.displayName != null ? String(row.displayName) : (prev?.displayName || prev?.username || 'Account'),
        photoDataUrl: row?.photoDataUrl || prev?.photoDataUrl || null,
        isOnline: row?.isOnline === true,
        lastSeen: row?.lastSeen || prev?.lastSeen || null
      });
    }

    const joinedFromUsers = Array.isArray(payload?.joinedFromUsers) ? payload.joinedFromUsers : [];
    for (const row of joinedFromUsers) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      const prev = shareUi.accountIndex.get(id) || {};
      shareUi.accountIndex.set(id, {
        ...prev,
        id,
        username: row?.username != null ? String(row.username) : (prev?.username || null),
        displayName: row?.displayName != null ? String(row.displayName) : (prev?.displayName || prev?.username || 'Account'),
        photoDataUrl: row?.photoDataUrl || prev?.photoDataUrl || null,
        isOnline: row?.isOnline === true,
        lastSeen: row?.lastSeen || prev?.lastSeen || null
      });
    }

    const currentUserId = String(state.auth.user?.id || '').trim();
    const currentUsername = String(
      state.auth.user?.username
      || state.auth.user?.user_name
      || state.auth.user?.handle
      || ''
    ).trim() || null;
    const currentDisplayName = String(
      state.auth.user?.displayName
      || state.auth.user?.display_name
      || currentUsername
      || 'You'
    ).trim() || 'You';
    const currentPhotoDataUrl =
      state.auth.user?.photoDataUrl
      || state.auth.user?.profile_image
      || state.auth.user?.profileImage
      || getActivePhotoDataUrl()
      || null;

    const connectedById = new Map();
    const addConnectedMember = (key, member) => {
      if (!key || !member || connectedById.has(key)) return;
      connectedById.set(key, member);
    };
    const buildMemberTitle = (row) => {
      const id = String(row?.id || '').trim();
      const indexed = id ? (shareUi.accountIndex.get(id) || {}) : {};
      const username = row?.username || indexed?.username || null;
      const displayName = row?.displayName || indexed?.displayName || username || 'Account';
      return {
        id,
        username,
        displayName,
        photoDataUrl: row?.photoDataUrl || indexed?.photoDataUrl || null,
        isOnline: row?.isOnline === true
      };
    };

    if (acceptedUsers.length > 0) {
      addConnectedMember(`self:owner:${currentUserId || 'current'}`, {
        id: currentUserId || 'self',
        username: currentUsername,
        displayName: currentDisplayName,
        photoDataUrl: currentPhotoDataUrl,
        isOnline: true,
        relation: 'self-owner',
        canRemove: false
      });
    }

    for (const row of acceptedUsers) {
      const member = buildMemberTitle(row);
      if (!member.id) continue;
      addConnectedMember(`out:${member.id}`, {
        ...member,
        relation: 'outgoing',
        canRemove: true,
        action: 'kick',
        actionTargetId: member.id,
        operationKey: member.id
      });
    }
    for (const row of joinedFromUsers) {
      const owner = buildMemberTitle(row);
      if (!owner.id) continue;
      addConnectedMember(`in:${owner.id}`, {
        ...owner,
        relation: 'incoming-owner',
        canRemove: false
      });
      addConnectedMember(`self:incoming:${owner.id}`, {
        id: currentUserId || 'self',
        username: currentUsername,
        displayName: currentDisplayName,
        photoDataUrl: currentPhotoDataUrl,
        isOnline: true,
        relation: 'incoming-self',
        canRemove: true,
        action: 'leave',
        actionTargetId: owner.id,
        operationKey: owner.id,
        ownerDisplayName: owner.displayName
      });
    }
    shareUi.connectedMembers = Array.from(connectedById.values());

    return pendingSet;
  }

  async function refreshShareOutgoingState({ rerender = true } = {}) {
    if (!state.auth.user) return false;
    const outgoing = await api('/api/training/share/outgoing', { method: 'GET' });
    if (!outgoing.ok || !outgoing.json?.ok) return false;
    syncShareOutgoingState(outgoing.json);
    if (rerender) render();
    return true;
  }

  async function refreshShareAuthSnapshot() {
    const me = await api('/api/auth/me', { method: 'GET', timeoutMs: 7000 });
    const meUser = me.ok ? (me.json?.user || null) : null;
    if (meUser) {
      state.auth.user = meUser;
      return { ok: true, status: 200, user: meUser };
    }
    if (me.status === 401) {
      state.auth.user = null;
      shareEventsInFlight = false;
    }
    return { ok: false, status: Number(me.status) || 0, user: null };
  }

  async function ensureShareAuth({ promptOnFail = false } = {}) {
    if (state.auth.user) return true;
    const refreshed = await refreshShareAuthSnapshot();
    if (refreshed.ok) return true;
    if (promptOnFail) openAuthModal('login');
    return false;
  }

  function showShareRequestSentToast(sentCount = 1) {
    const existing = document.getElementById('workout-share-request-toast');
    if (existing) existing.remove();
    const count = Math.max(1, Number(sentCount || 1));
    const plural = count === 1 ? '' : 's';
    const toast = el('div', { class: 'workout-saved-toast', id: 'workout-share-request-toast', role: 'status' },
      el('div', { class: 'workout-saved-icon', 'aria-hidden': 'true' }, 'OK'),
      el('div', { class: 'workout-saved-text' },
        el('div', { class: 'workout-saved-title' }, `Request sent${plural}`),
        el('div', { class: 'workout-saved-sub' }, count === 1
          ? 'Request went to their account inbox.'
          : 'Requests went to friend account inboxes.')
      )
    );
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 1700);
    });
  }

  function scheduleShareRequestSentToast(sentCount = 1) {
    clearShareConfirmToastTimer();
    const count = Math.max(1, Number(sentCount || 1));
    shareUi.confirmToastTimer = window.setTimeout(() => {
      shareUi.confirmToastTimer = 0;
      showShareRequestSentToast(count);
    }, SHARE_CONFIRM_TOAST_DELAY_MS);
  }

  const workoutTimer = {
    running: false,
    paused: false,
    startedAt: 0,
    elapsedMs: 0,
    intervalId: 0,
    events: [],
    context: {}
  };
  const restTimer = {
    running: false,
    endsAt: 0,
    durationMs: 0,
    intervalId: 0,
    context: {},
    alertAt: 0
  };
  let workoutRestAlertAudioContext = null;
  let workoutRestAlertAudioUnlocked = false;

  let shareCloseBound = false;
  let shareOutgoingSyncTimer = 0;
  let shareOutgoingSyncInFlight = false;
  let workoutInputBound = false;
  let workoutInputGateBound = false;
  let workoutInputGateToastAt = 0;
  let workoutAutosaveTimer = 0;
  let workoutAutosaveInFlight = false;
  let workoutAutosaveQueued = false;
  let workoutAutosaveQueuedContext = null;
  let workoutAutosaveContext = null;
  let floatingWorkoutTimerBound = false;
  let floatingWorkoutTimerSyncRaf = 0;
  let floatingWorkoutTimerClickCount = 0;
  let floatingWorkoutTimerResetTimer = 0;

  function workoutTimerStorageKey(userId = state.auth.user?.id) {
    const id = String(userId || '').trim() || 'guest';
    return `${WORKOUT_TIMER_STORAGE_PREFIX}${id}`;
  }

  function workoutRestTimerStorageKey(userId = state.auth.user?.id) {
    const id = String(userId || '').trim() || 'guest';
    return `${WORKOUT_REST_TIMER_STORAGE_PREFIX}${id}`;
  }

  function workoutDraftStorageKey({
    userId = state.auth.user?.id,
    planId = state.planRow?.id
  } = {}) {
    const plan = String(planId || '').trim();
    if (!plan) return '';
    const user = String(userId || '').trim() || 'guest';
    return `${WORKOUT_DRAFT_STORAGE_PREFIX}${user}:${plan}`;
  }

  function persistWorkoutDraftState({
    userId = state.auth.user?.id,
    planId = state.planRow?.id
  } = {}) {
    const key = workoutDraftStorageKey({ userId, planId });
    if (!key) return;
    const hasDrafts = state.workoutInputDrafts.size
      || state.workoutSetCountDrafts.size
      || state.workoutReadinessDrafts.size;
    if (!hasDrafts) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore storage failures
      }
      return;
    }
    const payload = {
      v: 1,
      inputDrafts: Array.from(state.workoutInputDrafts.entries()),
      setCountDrafts: Array.from(state.workoutSetCountDrafts.entries()),
      readinessDrafts: Array.from(state.workoutReadinessDrafts.entries()),
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }

  function restoreWorkoutDraftState({
    userId = state.auth.user?.id,
    planId = state.planRow?.id
  } = {}) {
    state.workoutInputDrafts = new Map();
    state.workoutSetCountDrafts = new Map();
    state.workoutReadinessDrafts = new Map();

    const key = workoutDraftStorageKey({ userId, planId });
    if (!key) return false;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return false;
      if (Array.isArray(parsed.inputDrafts)) {
        state.workoutInputDrafts = new Map(
          parsed.inputDrafts.filter((entry) => Array.isArray(entry) && entry.length >= 2)
            .map(([draftKey, value]) => [String(draftKey || ''), String(value ?? '')])
        );
      }
      if (Array.isArray(parsed.setCountDrafts)) {
        state.workoutSetCountDrafts = new Map(
          parsed.setCountDrafts.filter((entry) => Array.isArray(entry) && entry.length >= 2)
            .map(([draftKey, value]) => [String(draftKey || ''), Math.max(0, Math.min(12, Math.round(Number(value) || 0)))])
        );
      }
      if (Array.isArray(parsed.readinessDrafts)) {
        state.workoutReadinessDrafts = new Map(
          parsed.readinessDrafts.filter((entry) => Array.isArray(entry) && entry.length >= 2)
            .map(([draftKey, value]) => [String(draftKey || ''), String(value ?? '')])
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearPersistedWorkoutTimerState(userId = state.auth.user?.id) {
    const key = workoutTimerStorageKey(userId);
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
  }

  function clearPersistedWorkoutRestTimerState(userId = state.auth.user?.id) {
    const key = workoutRestTimerStorageKey(userId);
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
  }

  function persistWorkoutTimerState(userId = state.auth.user?.id) {
    const key = workoutTimerStorageKey(userId);
    if (!key) return;
    if (!workoutTimer.running && !workoutTimer.paused) {
      clearPersistedWorkoutTimerState(userId);
      return;
    }
    const payload = {
      v: 1,
      running: Boolean(workoutTimer.running),
      paused: Boolean(workoutTimer.paused),
      startedAt: Number(workoutTimer.startedAt) || 0,
      elapsedMs: Math.max(0, Number(workoutTimer.elapsedMs) || 0),
      context: {
        planId: String(workoutTimer.context?.planId || '').trim() || null,
        weekIndex: Number.isFinite(Number(workoutTimer.context?.weekIndex)) ? Number(workoutTimer.context.weekIndex) : null,
        dayIndex: Number.isFinite(Number(workoutTimer.context?.dayIndex)) ? Number(workoutTimer.context.dayIndex) : null,
        activeDate: workoutTimer.context?.activeDate ? String(workoutTimer.context.activeDate).slice(0, 10) : null
      },
      events: Array.isArray(workoutTimer.events) ? workoutTimer.events.slice(-300) : [],
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }

  function persistWorkoutRestTimerState(userId = state.auth.user?.id) {
    const key = workoutRestTimerStorageKey(userId);
    if (!key) return;
    if (!restTimer.running || !Number.isFinite(Number(restTimer.endsAt)) || Number(restTimer.endsAt) <= Date.now()) {
      clearPersistedWorkoutRestTimerState(userId);
      return;
    }
    const payload = {
      v: 1,
      running: true,
      endsAt: Number(restTimer.endsAt) || 0,
      durationMs: Math.max(0, Number(restTimer.durationMs) || 0),
      alertAt: Math.max(0, Number(restTimer.alertAt) || 0),
      context: {
        planId: String(restTimer.context?.planId || '').trim() || null,
        weekIndex: Number.isFinite(Number(restTimer.context?.weekIndex)) ? Number(restTimer.context.weekIndex) : null,
        dayIndex: Number.isFinite(Number(restTimer.context?.dayIndex)) ? Number(restTimer.context.dayIndex) : null,
        activeDate: restTimer.context?.activeDate ? String(restTimer.context.activeDate).slice(0, 10) : null,
        exerciseName: String(restTimer.context?.exerciseName || '').trim() || null,
        restSec: Number.isFinite(Number(restTimer.context?.restSec)) ? Number(restTimer.context.restSec) : null
      },
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }

  function readPersistedWorkoutTimerState(userId = state.auth.user?.id) {
    const key = workoutTimerStorageKey(userId);
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function readPersistedWorkoutRestTimerState(userId = state.auth.user?.id) {
    const key = workoutRestTimerStorageKey(userId);
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function resetWorkoutTimerState({ removePersisted = false, userId = state.auth.user?.id } = {}) {
    if (workoutTimer.intervalId) {
      clearInterval(workoutTimer.intervalId);
      workoutTimer.intervalId = 0;
    }
    workoutTimer.running = false;
    workoutTimer.paused = false;
    workoutTimer.startedAt = 0;
    workoutTimer.elapsedMs = 0;
    workoutTimer.events = [];
    workoutTimer.context = {};
    resetFloatingWorkoutTimerClicks({ rerender: false });
    if (removePersisted) clearPersistedWorkoutTimerState(userId);
  }

  function resetWorkoutRestTimerState({ removePersisted = false, userId = state.auth.user?.id } = {}) {
    if (restTimer.intervalId) {
      clearInterval(restTimer.intervalId);
      restTimer.intervalId = 0;
    }
    restTimer.running = false;
    restTimer.endsAt = 0;
    restTimer.durationMs = 0;
    restTimer.context = {};
    restTimer.alertAt = 0;
    if (removePersisted) clearPersistedWorkoutRestTimerState(userId);
  }

  function restorePersistedWorkoutTimerState({ userId = state.auth.user?.id, planId = state.planRow?.id } = {}) {
    const stored = readPersistedWorkoutTimerState(userId);
    if (!stored) return false;
    const storedPlanId = String(stored?.context?.planId || '').trim();
    const currentPlanId = String(planId || '').trim();
    if (!storedPlanId || !currentPlanId || storedPlanId !== currentPlanId) {
      clearPersistedWorkoutTimerState(userId);
      return false;
    }
    const running = stored?.running === true;
    const paused = !running && stored?.paused === true;
    const startedAt = Number(stored?.startedAt || 0);
    const elapsedMs = Math.max(0, Number(stored?.elapsedMs || 0));
    const activeDate = stored?.context?.activeDate ? String(stored.context.activeDate).slice(0, 10) : null;
    if (!running && !paused) {
      clearPersistedWorkoutTimerState(userId);
      return false;
    }
    if (running && (!Number.isFinite(startedAt) || startedAt <= 0)) {
      clearPersistedWorkoutTimerState(userId);
      return false;
    }
    if (paused && elapsedMs <= 0 && (!Number.isFinite(startedAt) || startedAt <= 0)) {
      clearPersistedWorkoutTimerState(userId);
      return false;
    }
    workoutTimer.running = running;
    workoutTimer.paused = paused;
    workoutTimer.startedAt = Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0;
    workoutTimer.elapsedMs = paused ? elapsedMs : 0;
    workoutTimer.events = Array.isArray(stored?.events) ? stored.events.slice(-300) : [];
    workoutTimer.context = {
      planId: currentPlanId,
      weekIndex: Number.isFinite(Number(stored?.context?.weekIndex)) ? Number(stored.context.weekIndex) : null,
      dayIndex: Number.isFinite(Number(stored?.context?.dayIndex)) ? Number(stored.context.dayIndex) : null,
      activeDate
    };
    if (activeDate) writeTrainingPlanNavValue('active_date', activeDate, { planId: currentPlanId });
    return true;
  }

  function restorePersistedWorkoutRestTimerState({ userId = state.auth.user?.id, planId = state.planRow?.id } = {}) {
    const stored = readPersistedWorkoutRestTimerState(userId);
    if (!stored) return false;
    const storedPlanId = String(stored?.context?.planId || '').trim();
    const currentPlanId = String(planId || '').trim();
    const endsAt = Number(stored?.endsAt || 0);
    if (!storedPlanId || !currentPlanId || storedPlanId !== currentPlanId || !Number.isFinite(endsAt) || endsAt <= Date.now()) {
      clearPersistedWorkoutRestTimerState(userId);
      return false;
    }
    restTimer.running = true;
    restTimer.endsAt = endsAt;
    restTimer.durationMs = Math.max(0, Number(stored?.durationMs) || 0);
    restTimer.alertAt = Math.max(0, Number(stored?.alertAt) || 0);
    restTimer.context = {
      planId: currentPlanId,
      weekIndex: Number.isFinite(Number(stored?.context?.weekIndex)) ? Number(stored.context.weekIndex) : null,
      dayIndex: Number.isFinite(Number(stored?.context?.dayIndex)) ? Number(stored.context.dayIndex) : null,
      activeDate: stored?.context?.activeDate ? String(stored.context.activeDate).slice(0, 10) : null,
      exerciseName: String(stored?.context?.exerciseName || '').trim() || null,
      restSec: Number.isFinite(Number(stored?.context?.restSec)) ? Number(stored.context.restSec) : null
    };
    return true;
  }

  function getPlanExercisesForWorkoutDay({ weekIndex, dayIndex } = {}) {
    const weeks = Array.isArray(state.planRow?.plan?.weeks) ? state.planRow.plan.weeks : [];
    const week = weeks.find((row) => Number(row?.index) === Number(weekIndex)) || null;
    const day = week && Array.isArray(week.days) ? (week.days[Number(dayIndex) - 1] || null) : null;
    return Array.isArray(day?.exercises) ? day.exercises : [];
  }

  function getWorkoutLogDurationMs(log) {
    const value = Number(log?.duration_ms);
    return Number.isFinite(value) && value > 0 ? Math.max(0, Math.round(value)) : 0;
  }

  function getActiveWorkoutTimerDayIso() {
    if (!workoutTimer.running && !workoutTimer.paused) return '';
    return String(workoutTimer.context?.activeDate || '').trim();
  }

  function showWorkoutTimerLockedToast() {
    const existing = document.getElementById('workout-timer-locked-toast');
    if (existing) existing.remove();
    const label = getActiveWorkoutTimerDayIso() || 'this workout day';
    const toast = el('div', { class: 'workout-saved-toast', id: 'workout-timer-locked-toast', role: 'status' },
      el('div', { class: 'workout-saved-icon', 'aria-hidden': 'true' }, '!'),
      el('div', { class: 'workout-saved-text' },
        el('div', { class: 'workout-saved-title' }, 'Finish workout first'),
        el('div', { class: 'workout-saved-sub' }, `Timer is locked to ${label}. Finish it before switching days.`)
      )
    );
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 1500);
    });
  }

  function workoutDayKey({ weekIndex, dayIndex }) {
    const week = Number.isFinite(Number(weekIndex)) ? String(Math.max(1, Math.round(Number(weekIndex)))) : '';
    const day = Number.isFinite(Number(dayIndex)) ? String(Math.max(1, Math.round(Number(dayIndex)))) : '';
    if (!week || !day) return '';
    return `${week}:${day}`;
  }

  function customWorkoutDateKey(dateLike) {
    if (!dateLike) return '';
    if (dateLike instanceof Date) return toISODateLocal(dateLike);
    return String(dateLike || '').slice(0, 10);
  }

  function getCustomWorkoutDraftsForDate(dateLike) {
    const key = customWorkoutDateKey(dateLike);
    if (!key) return [];
    const list = state.customWorkoutDrafts.get(key);
    return Array.isArray(list) ? list : [];
  }

  function setCustomWorkoutDraftsForDate(dateLike, exercises) {
    const key = customWorkoutDateKey(dateLike);
    if (!key) return [];
    const next = Array.isArray(exercises) ? exercises.slice() : [];
    if (next.length) state.customWorkoutDrafts.set(key, next);
    else state.customWorkoutDrafts.delete(key);
    return next;
  }

  function normalizeCustomWorkoutMuscleKey(raw) {
    const token = String(raw || '').trim().toLowerCase();
    if (!token) return '';
    if (token.includes('chest') || token.includes('pect')) return 'chest';
    if (token.includes('lat') || token.includes('back') || token.includes('trap') || token.includes('rhomboid')) return 'back';
    if (token.includes('shoulder') || token.includes('delt')) return 'shoulders';
    if (token.includes('bicep')) return 'biceps';
    if (token.includes('tricep')) return 'triceps';
    if (token.includes('quad')) return 'quads';
    if (token.includes('ham')) return 'hamstrings';
    if (token.includes('glute')) return 'glutes';
    if (token.includes('calf')) return 'calves';
    if (token.includes('ab') || token.includes('core') || token.includes('oblique')) return 'abs';
    return token.replace(/[^a-z0-9]+/g, '_');
  }

  function buildCustomWorkoutExercise(item, { weekIndex = 1, dayIndex = 0, position = 1 } = {}) {
    const entry = item && typeof item === 'object' ? item : {};
    const primary = String(entry?.primaryMuscleGroup || (Array.isArray(entry?.primaryMuscles) ? entry.primaryMuscles[0] || '' : '')).trim();
    const muscleKey = normalizeCustomWorkoutMuscleKey(primary);
    const eqClass = equipmentClassFromName(entry);
    const isIsolation = /(isolation|raise|curl|extension|pushdown|fly|reverse crunch|crunch|lateral)/i.test(String(entry?.name || ''));
    const name = String(entry?.name || entry?.id || 'Custom exercise').trim();
    const exerciseId = String(entry?.id || normalizeLiftHistoryKey(name) || `custom_${Date.now()}`).trim();
    const images = Array.isArray(entry?.images) ? entry.images.filter(Boolean) : [];
    const beforeImageUrl = String(entry?.beforeImageUrl || images[0] || entry?.imageUrl || '').trim();
    const afterImageUrl = String(entry?.afterImageUrl || images[1] || '').trim();
    return {
      id: `custom:${weekIndex}:${dayIndex}:${Date.now()}:${position}`,
      baseId: normalizeLiftHistoryKey(exerciseId) || normalizeLiftHistoryKey(name) || `custom_${position}`,
      exerciseId,
      displayName: name,
      name,
      slotId: `custom_slot:${weekIndex}:${dayIndex}:${position}:${Date.now()}`,
      intentKey: 'custom_workout',
      slotRole: 'custom',
      muscleKeys: muscleKey ? [muscleKey] : [],
      movementPattern: isIsolation ? 'isolation' : 'custom',
      stimulusType: isIsolation ? 'isolation' : 'compound',
      foundationFlag: false,
      allowedEquipmentClass: ['any'],
      equipmentClass: eqClass || 'other',
      mediaPath: beforeImageUrl || '',
      mediaPathAlt: afterImageUrl || '',
      sets: isIsolation ? 2 : 3,
      reps: isIsolation ? '10-15' : '8-12',
      restSec: isIsolation ? 60 : 90,
      rirTarget: null,
      projected: null,
      blockType: 'single',
      supersetId: null,
      swapCandidates: [],
      coaching: null,
      tags: ['custom'],
      substitutions: [],
      progression: { type: 'load', increment: 5, repsTarget: isIsolation ? 12 : 10, technique: 'none', setsCap: isIsolation ? 4 : 5 }
    };
  }

  function appendCustomWorkoutToDate({ dateLike, item, scheduledDay = null, weekIndex = 1, dayIndex = 0 }) {
    const draftExercises = getCustomWorkoutDraftsForDate(dateLike);
    const targetList = scheduledDay && Array.isArray(scheduledDay.exercises) ? scheduledDay.exercises : draftExercises.slice();
    const nextExercise = buildCustomWorkoutExercise(item, {
      weekIndex,
      dayIndex,
      position: targetList.length + 1
    });
    targetList.push(nextExercise);
    if (!(scheduledDay && Array.isArray(scheduledDay.exercises))) {
      setCustomWorkoutDraftsForDate(dateLike, targetList);
    }
    return nextExercise;
  }

  function removeCustomWorkoutExercise({ scheduledDay = null, dateLike = null, exerciseId = '', renderAfter = true } = {}) {
    const targetId = String(exerciseId || '').trim();
    if (!targetId) return false;
    let removed = false;
    if (scheduledDay && Array.isArray(scheduledDay.exercises)) {
      const next = scheduledDay.exercises.filter((entry) => String(entry?.id || '').trim() !== targetId);
      if (next.length !== scheduledDay.exercises.length) {
        scheduledDay.exercises.splice(0, scheduledDay.exercises.length, ...next);
        removed = true;
      }
    } else {
      const current = getCustomWorkoutDraftsForDate(dateLike);
      const next = current.filter((entry) => String(entry?.id || '').trim() !== targetId);
      if (next.length !== current.length) {
        setCustomWorkoutDraftsForDate(dateLike, next);
        removed = true;
      }
    }
    if (removed && renderAfter) render();
    return removed;
  }

  function renderCustomWorkoutCta({ onclick, compact = false } = {}) {
    return el('button', {
      type: 'button',
      class: `custom-workout-cta${compact ? ' is-compact' : ''}`,
      onclick
    },
    el('span', { class: 'custom-workout-cta-plus', 'aria-hidden': 'true' }, '+'),
    el('span', { class: 'custom-workout-cta-copy' },
      el('span', { class: 'custom-workout-cta-title' }, 'Custom workout'),
      el('span', { class: 'custom-workout-cta-sub' }, 'Add a movement or browse the workout database')
    ));
  }

  async function loadUserCustomWorkouts({ force = false } = {}) {
    const userId = String(state.auth.user?.id || '').trim();
    if (!userId) {
      state.userCustomWorkouts = [];
      state.userCustomWorkoutsLoadedFor = '';
      return [];
    }
    if (!force && state.userCustomWorkoutsLoadedFor === userId && Array.isArray(state.userCustomWorkouts)) {
      return state.userCustomWorkouts;
    }
    const resp = await api('/api/training/custom-workouts', { method: 'GET' });
    const items = resp.ok && Array.isArray(resp.json?.items) ? resp.json.items : [];
    state.userCustomWorkouts = items;
    state.userCustomWorkoutsLoadedFor = userId;
    return items;
  }

  function customWorkoutModalCatalogItems() {
    const accountItems = Array.isArray(state.userCustomWorkouts) ? state.userCustomWorkouts : [];
    const merged = [...accountItems, ...exerciseCatalog];
    const seen = new Set();
    return merged.filter((item) => {
      const id = String(item?.id || '').trim().toLowerCase();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function openCreateCustomWorkoutModal({ onCreated } = {}) {
    const primaryOptions = [
      { value: 'chest', label: 'Chest' },
      { value: 'back', label: 'Back' },
      { value: 'shoulders', label: 'Shoulders' },
      { value: 'biceps', label: 'Biceps' },
      { value: 'triceps', label: 'Triceps' },
      { value: 'quads', label: 'Quads' },
      { value: 'hamstrings', label: 'Hamstrings' },
      { value: 'glutes', label: 'Glutes' },
      { value: 'calves', label: 'Calves' },
      { value: 'abs', label: 'Core' }
    ];
    const categoryOptions = [
      { value: 'free_weights', label: 'Free weights' },
      { value: 'machines', label: 'Machines' },
      { value: 'calisthenics', label: 'Calisthenics' },
      { value: 'stretching', label: 'Stretching' }
    ];
    const levelOptions = [
      { value: 'beginner', label: 'Beginner' },
      { value: 'intermediate', label: 'Intermediate' },
      { value: 'expert', label: 'Expert' }
    ];

    const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close create workout' }),
      el('div', { class: 'schedule-modal-card custom-workout-modal-card create-workout-modal-card' },
        el('div', { class: 'schedule-modal-head custom-workout-modal-head' },
          el('button', { type: 'button', class: 'btn btn-ghost custom-workout-create-trigger', onclick: () => overlay.remove() }, 'Back'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close create workout' }, '×')
        ),
        el('div', { class: 'schedule-modal-body create-workout-modal-body' },
          el('div', { class: 'schedule-modal-title' }, 'Create workout'),
          el('div', { class: 'training-muted create-workout-intro' }, 'Saves to your account only. Shared friends can still see it inside workouts you send them.'),
          el('div', { class: 'create-workout-form' },
            el('input', { type: 'text', class: 'auth-input', name: 'name', placeholder: 'Workout name' }),
            el('div', { class: 'create-workout-grid' },
              el('select', { class: 'auth-input', name: 'primaryMuscle' },
                primaryOptions.map((opt) => el('option', { value: opt.value }, opt.label))
              ),
              el('select', { class: 'auth-input', name: 'level' },
                levelOptions.map((opt) => el('option', { value: opt.value }, opt.label))
              )
            ),
            el('div', { class: 'create-workout-grid' },
              el('input', { type: 'text', class: 'auth-input', name: 'subMuscleGroup', placeholder: 'Subgroup, e.g. Side_delts' }),
              el('input', { type: 'text', class: 'auth-input', name: 'equipment', placeholder: 'Equipment, e.g. Dumbbell' })
            ),
            el('div', { class: 'create-workout-grid' },
              el('select', { class: 'auth-input', name: 'category' },
                categoryOptions.map((opt) => el('option', { value: opt.value }, opt.label))
              ),
              el('input', { type: 'text', class: 'auth-input', name: 'instructions', placeholder: 'Instructions or cues' })
            ),
            el('div', { class: 'create-workout-grid create-workout-image-grid' },
              el('label', { class: 'auth-input create-workout-upload' },
                el('input', { type: 'file', name: 'beforeImageFile', accept: 'image/*', class: 'create-workout-file-input' }),
                el('span', { class: 'create-workout-upload-text', 'data-create-workout-upload-label': 'before' }, 'Before picture')
              ),
              el('label', { class: 'auth-input create-workout-upload' },
                el('input', { type: 'file', name: 'afterImageFile', accept: 'image/*', class: 'create-workout-file-input' }),
                el('span', { class: 'create-workout-upload-text', 'data-create-workout-upload-label': 'after' }, 'After picture')
              )
            ),
            el('div', { class: 'create-workout-image-preview-grid hidden', 'data-create-workout-preview-grid': '1' },
              el('div', { class: 'create-workout-image-preview', 'data-create-workout-preview-wrap': 'before' },
                el('img', { class: 'create-workout-image-preview-img', alt: 'Before preview', 'data-create-workout-preview': 'before' }),
                el('div', { class: 'create-workout-image-preview-label' }, 'Before')
              ),
              el('div', { class: 'create-workout-image-preview', 'data-create-workout-preview-wrap': 'after' },
                el('img', { class: 'create-workout-image-preview-img', alt: 'After preview', 'data-create-workout-preview': 'after' }),
                el('div', { class: 'create-workout-image-preview-label' }, 'After')
              )
            ),
            el('div', { class: 'training-muted create-workout-status', 'data-create-workout-status': '1' }, ''),
            el('div', { class: 'schedule-modal-actions' },
              el('button', {
                type: 'button',
                class: 'btn btn-primary',
                onclick: async () => {
                  const host = overlay.querySelector('.create-workout-form');
                  const status = overlay.querySelector('[data-create-workout-status]');
                  if (!(host instanceof Element)) return;
                  const name = String(host.querySelector('[name="name"]')?.value || '').trim();
                  const primaryMuscle = String(host.querySelector('[name="primaryMuscle"]')?.value || '').trim();
                  const subMuscleGroup = String(host.querySelector('[name="subMuscleGroup"]')?.value || '').trim();
                  const equipment = String(host.querySelector('[name="equipment"]')?.value || '').trim();
                  const category = String(host.querySelector('[name="category"]')?.value || '').trim();
                  const level = String(host.querySelector('[name="level"]')?.value || '').trim();
                  const instructionsText = String(host.querySelector('[name="instructions"]')?.value || '').trim();
                  const beforeImageFile = host.querySelector('[name="beforeImageFile"]')?.files?.[0] || null;
                  const afterImageFile = host.querySelector('[name="afterImageFile"]')?.files?.[0] || null;
                  const beforeImageDataUrl = beforeImageFile ? await fileToSquareAvatarDataUrl(beforeImageFile, { size: 512, quality: 0.86 }) : '';
                  const afterImageDataUrl = afterImageFile ? await fileToSquareAvatarDataUrl(afterImageFile, { size: 512, quality: 0.86 }) : '';
                  if (status) status.textContent = '';
                  const resp = await api('/api/training/custom-workouts', {
                    method: 'POST',
                    body: JSON.stringify({
                      name,
                      primaryMuscles: primaryMuscle ? [primaryMuscle] : [],
                      primaryMuscleGroup: primaryMuscle,
                      subMuscleGroup,
                      equipment,
                      category,
                      level,
                      instructions: instructionsText ? [instructionsText] : [],
                      imageUrl: beforeImageDataUrl || '',
                      beforeImageUrl: beforeImageDataUrl || '',
                      afterImageUrl: afterImageDataUrl || ''
                    })
                  });
                  if (!resp.ok || !resp.json?.item) {
                    if (status) status.textContent = resp.json?.error || 'Could not create workout.';
                    return;
                  }
                  await loadUserCustomWorkouts({ force: true });
                  overlay.remove();
                  onCreated?.(resp.json.item);
                }
              }, 'Save workout'),
              el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Cancel')
            )
          )
        )
      )
    );
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
    const bindImagePreviewInput = (fieldName, labelKey) => {
      overlay.querySelector(`[name="${fieldName}"]`)?.addEventListener('change', async (event) => {
        const input = event.currentTarget;
        const file = input?.files?.[0] || null;
        const label = overlay.querySelector(`[data-create-workout-upload-label="${labelKey}"]`);
        const previewGrid = overlay.querySelector('[data-create-workout-preview-grid]');
        const previewWrap = overlay.querySelector(`[data-create-workout-preview-wrap="${labelKey}"]`);
        const previewImg = overlay.querySelector(`[data-create-workout-preview="${labelKey}"]`);
        if (label) label.textContent = file ? String(file.name || 'Picture selected') : `${labelKey === 'before' ? 'Before' : 'After'} picture`;
        if (!file || !(previewWrap instanceof Element) || !(previewImg instanceof HTMLImageElement)) {
          previewWrap?.classList?.add('hidden');
          const anyVisible = Array.from(overlay.querySelectorAll('[data-create-workout-preview-wrap]')).some((node) => !node.classList.contains('hidden'));
          if (previewGrid instanceof Element) previewGrid.classList.toggle('hidden', !anyVisible);
          return;
        }
        const dataUrl = await fileToSquareAvatarDataUrl(file, { size: 320, quality: 0.82 });
        if (!dataUrl) {
          previewWrap.classList.add('hidden');
          const anyVisible = Array.from(overlay.querySelectorAll('[data-create-workout-preview-wrap]')).some((node) => !node.classList.contains('hidden'));
          if (previewGrid instanceof Element) previewGrid.classList.toggle('hidden', !anyVisible);
          return;
        }
        previewImg.src = dataUrl;
        previewWrap.classList.remove('hidden');
        if (previewGrid instanceof Element) previewGrid.classList.remove('hidden');
      });
    };
    bindImagePreviewInput('beforeImageFile', 'before');
    bindImagePreviewInput('afterImageFile', 'after');
    document.body.appendChild(overlay);
    overlay.querySelector('[name="name"]')?.focus();
  }

  function setWorkoutReadinessDraft({ weekIndex, dayIndex, value, persist = true }) {
    const key = workoutDayKey({ weekIndex, dayIndex });
    if (!key) return;
    state.workoutReadinessDrafts.set(key, String(value ?? ''));
    if (persist) persistWorkoutDraftState();
  }

  function getWorkoutReadinessDraft({ weekIndex, dayIndex, fallback = '' }) {
    const key = workoutDayKey({ weekIndex, dayIndex });
    if (!key || !state.workoutReadinessDrafts.has(key)) return String(fallback ?? '');
    return String(state.workoutReadinessDrafts.get(key) ?? '');
  }

  function resolveWorkoutExerciseKey(ex) {
    return String(ex?.id || ex?.baseId || ex?.name || '').trim();
  }

  function normalizeLiftHistoryKey(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/__d\d+__e\d+$/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 180);
  }

  function resolveLiftHistoryKeyFromValues({ baseId, exerciseId, exerciseName, name } = {}) {
    return (
      normalizeLiftHistoryKey(baseId)
      || normalizeLiftHistoryKey(exerciseId)
      || normalizeLiftHistoryKey(exerciseName || name)
    );
  }

  function resolveLiftHistoryLookupKeys({ baseId, exerciseId, exerciseName, name } = {}) {
    const seen = new Set();
    const keys = [];
    const push = (raw) => {
      const key = normalizeLiftHistoryKey(raw);
      if (!key || seen.has(key)) return;
      seen.add(key);
      keys.push(key);
    };
    push(exerciseName || name);
    push(exerciseId);
    push(baseId);
    return keys;
  }

  function pickLiftHistoryRecord(map, values = {}) {
    const source = map instanceof Map ? map : null;
    if (!source || !source.size) return null;
    const keys = resolveLiftHistoryLookupKeys(values);
    for (const key of keys) {
      if (source.has(key)) return source.get(key);
    }
    return null;
  }

  function resolveLiftHistoryKey(record) {
    return resolveLiftHistoryKeyFromValues({
      baseId: record?.baseId,
      exerciseId: record?.exerciseId || record?.id,
      exerciseName: record?.exerciseName || record?.displayName || record?.name
    });
  }

  function normalizeLiftPerformance(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const weightRaw = Number(raw.weight);
    const repsRaw = Number(raw.reps);
    const estimatedRaw = Number(raw.estimated1rm);
    const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? Math.round(weightRaw * 100) / 100 : null;
    const reps = Number.isFinite(repsRaw) && repsRaw > 0 ? Math.max(1, Math.round(repsRaw)) : null;
    const estimated1rm = Number.isFinite(estimatedRaw) && estimatedRaw > 0 ? Math.round(estimatedRaw * 100) / 100 : null;
    const performedAt = raw.performedAt ? String(raw.performedAt).slice(0, 10) : null;
    if (!Number.isFinite(weight) && !Number.isFinite(reps) && !Number.isFinite(estimated1rm)) return null;
    return { weight, reps, estimated1rm, performedAt };
  }

  function extractWorkoutEntryPerformance(entry) {
    const sets = Array.isArray(entry?.sets) ? entry.sets : [];
    for (let idx = sets.length - 1; idx >= 0; idx -= 1) {
      const set = sets[idx] && typeof sets[idx] === 'object' ? sets[idx] : null;
      const perf = normalizeLiftPerformance({
        weight: set?.weight,
        reps: set?.reps
      });
      if (perf) return perf;
    }
    return normalizeLiftPerformance(entry?.actual);
  }

  function compareIsoDateStrings(a, b) {
    const left = String(a || '').slice(0, 10);
    const right = String(b || '').slice(0, 10);
    if (!left || !right) return 0;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  function findLatestMatchingLogData({ logs, values = {}, beforeDate = null } = {}) {
    const keys = resolveLiftHistoryLookupKeys(values);
    if (!keys.length) return { entry: null, performance: null };
    const keySet = new Set(keys);
    const beforeIso = String(beforeDate || '').slice(0, 10);
    let bestEntry = null;
    let bestPerf = null;
    let bestStamp = '';
    for (const row of Array.isArray(logs) ? logs : []) {
      const rowIso = workoutLogDateIso(row);
      if (!rowIso) continue;
      if (beforeIso && compareIsoDateStrings(rowIso, beforeIso) >= 0) continue;
      const entries = Array.isArray(row?.entries) ? row.entries : [];
      for (const rawEntry of entries) {
        const aliases = resolveLiftHistoryLookupKeys({
          baseId: rawEntry?.baseId,
          exerciseId: rawEntry?.exerciseId || rawEntry?.id,
          exerciseName: rawEntry?.exerciseName || rawEntry?.displayName || rawEntry?.name
        });
        if (!aliases.some((alias) => keySet.has(alias))) continue;
        const perf = extractWorkoutEntryPerformance(rawEntry);
        if (!perf) continue;
        if (!bestStamp || rowIso > bestStamp) {
          bestStamp = rowIso;
          bestPerf = { ...perf, performedAt: rowIso };
          bestEntry = {
            sets: Array.isArray(rawEntry?.sets) ? rawEntry.sets : [],
            actual: rawEntry?.actual && typeof rawEntry.actual === 'object' ? { ...rawEntry.actual } : null,
            prescribed: rawEntry?.prescribed && typeof rawEntry.prescribed === 'object' ? { ...rawEntry.prescribed } : null,
            performedAt: rowIso
          };
        }
      }
    }
    return { entry: bestEntry, performance: bestPerf };
  }

  function buildLiftHistoryIndex(raw) {
    const out = new Map();
    const push = (value, fallbackKey = '') => {
      const record = value && typeof value === 'object' ? value : null;
      if (!record) return;
      const exerciseKey = normalizeLiftHistoryKey(record.exerciseKey || fallbackKey || resolveLiftHistoryKey(record));
      if (!exerciseKey) return;
      const normalized = {
        exerciseKey,
        exerciseId: String(record.exerciseId || '').trim() || null,
        baseId: String(record.baseId || '').trim() || null,
        exerciseName: String(record.exerciseName || record.displayName || record.name || record.exerciseId || record.baseId || 'Exercise').trim(),
        last: normalizeLiftPerformance(record.last),
        best: normalizeLiftPerformance(record.best),
        updatedAt: record.updatedAt || null
      };
      if (!normalized.last && !normalized.best) return;
      out.set(exerciseKey, normalized);
      resolveLiftHistoryLookupKeys(normalized).forEach((key) => {
        if (!out.has(key)) out.set(key, normalized);
      });
    };
    if (Array.isArray(raw)) {
      raw.forEach((row) => push(row));
      return out;
    }
    if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([key, value]) => {
        push(value, key);
      });
    }
    return out;
  }

  function rememberLiftHistory(raw, { replace = false } = {}) {
    const next = replace ? new Map() : new Map(state.liftHistory);
    const incoming = buildLiftHistoryIndex(raw);
    incoming.forEach((value, key) => {
      next.set(key, value);
    });
    state.liftHistory = next;
    return next;
  }

  function buildWorkoutEntryIndex(entries) {
    const out = new Map();
    for (const row of Array.isArray(entries) ? entries : []) {
      const key = resolveLiftHistoryKey(row);
      if (key) out.set(key, row);
      resolveLiftHistoryLookupKeys({
        baseId: row?.baseId,
        exerciseId: row?.exerciseId || row?.id,
        exerciseName: row?.exerciseName || row?.displayName || row?.name
      }).forEach((alias) => {
        if (!out.has(alias)) out.set(alias, row);
      });
    }
    return out;
  }

  function formatPerformanceNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    const rounded = Math.round(num * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  function formatPerformanceSummary(perf) {
    if (!perf || typeof perf !== 'object') return '—';
    const parts = [];
    if (Number.isFinite(Number(perf.weight))) parts.push(`${formatPerformanceNumber(perf.weight)} lb`);
    if (Number.isFinite(Number(perf.reps))) parts.push(`x ${Math.max(1, Math.round(Number(perf.reps)))}`);
    if (!parts.length && Number.isFinite(Number(perf.estimated1rm))) {
      parts.push(`${formatPerformanceNumber(perf.estimated1rm)} lb e1RM`);
    }
    return parts.length ? parts.join(' ') : '—';
  }

  function workoutDraftKey({ exId, exSlot, setIdx, field, weekIndex, dayIndex }) {
    const id = String(exId || '').trim();
    const slot = Number.isFinite(Number(exSlot)) ? String(Math.max(0, Math.round(Number(exSlot)))) : '0';
    const idx = Number.isFinite(Number(setIdx)) ? String(Math.max(0, Math.round(Number(setIdx)))) : '';
    const fld = String(field || '').trim();
    const week = Number.isFinite(Number(weekIndex)) ? String(Math.max(1, Math.round(Number(weekIndex)))) : '';
    const day = Number.isFinite(Number(dayIndex)) ? String(Math.max(1, Math.round(Number(dayIndex)))) : '';
    if (!id || !fld || idx === '') return '';
    return `${week}:${day}:${id}:${slot}::${idx}::${fld}`;
  }

  function setWorkoutInputDraftValue({ exId, exSlot, setIdx, field, value, weekIndex, dayIndex, persist = true }) {
    const key = workoutDraftKey({ exId, exSlot, setIdx, field, weekIndex, dayIndex });
    if (!key) return;
    const next = String(value ?? '');
    state.workoutInputDrafts.set(key, next);
    if (persist) persistWorkoutDraftState();
  }

  function getWorkoutInputDraftValue({ exId, exSlot, setIdx, field, fallback = '', weekIndex, dayIndex }) {
    const key = workoutDraftKey({ exId, exSlot, setIdx, field, weekIndex, dayIndex });
    if (!key) return String(fallback ?? '');
    if (!state.workoutInputDrafts.has(key)) return String(fallback ?? '');
    return String(state.workoutInputDrafts.get(key) ?? '');
  }

  function workoutSetCountKey({ exId, exSlot, weekIndex, dayIndex }) {
    const id = String(exId || '').trim();
    const slot = Number.isFinite(Number(exSlot)) ? String(Math.max(0, Math.round(Number(exSlot)))) : '0';
    const week = Number.isFinite(Number(weekIndex)) ? String(Math.max(1, Math.round(Number(weekIndex)))) : '';
    const day = Number.isFinite(Number(dayIndex)) ? String(Math.max(1, Math.round(Number(dayIndex)))) : '';
    if (!id) return '';
    return `${week}:${day}:${id}:${slot}`;
  }

  function setWorkoutSetCountDraft({ exId, exSlot, weekIndex, dayIndex, count, persist = true }) {
    const key = workoutSetCountKey({ exId, exSlot, weekIndex, dayIndex });
    if (!key) return;
    const next = Math.max(0, Math.min(12, Math.round(Number(count) || 0)));
    state.workoutSetCountDrafts.set(key, next);
    if (persist) persistWorkoutDraftState();
  }

  function getWorkoutSetCountDraft({ exId, exSlot, weekIndex, dayIndex, fallback = 0 }) {
    const key = workoutSetCountKey({ exId, exSlot, weekIndex, dayIndex });
    if (!key || !state.workoutSetCountDrafts.has(key)) return Math.max(0, Math.min(12, Math.round(Number(fallback) || 0)));
    return Math.max(0, Math.min(12, Math.round(Number(state.workoutSetCountDrafts.get(key)) || 0)));
  }

  function clearWorkoutDraftStateForDay({ weekIndex, dayIndex }) {
    const dayKey = workoutDayKey({ weekIndex, dayIndex });
    if (!dayKey) return;
    state.workoutReadinessDrafts.delete(dayKey);
    Array.from(state.workoutInputDrafts.keys()).forEach((key) => {
      if (String(key || '').startsWith(`${dayKey}:`)) state.workoutInputDrafts.delete(key);
    });
    Array.from(state.workoutSetCountDrafts.keys()).forEach((key) => {
      if (String(key || '').startsWith(`${dayKey}:`)) state.workoutSetCountDrafts.delete(key);
    });
    persistWorkoutDraftState();
  }

  function captureVisibleWorkoutInputDrafts() {
    if (!root) return;
    const inputs = root.querySelectorAll('.exercise-set-row input[data-field]');
    if (inputs && inputs.length) {
      inputs.forEach((node) => {
        const target = node && node.dataset ? node : null;
        if (!target) return;
        const field = target.dataset.field;
        if (!field) return;
        setWorkoutInputDraftValue({
          exId: target.dataset.exId || null,
          exSlot: target.dataset.exSlot != null ? Number(target.dataset.exSlot) : 0,
          setIdx: target.dataset.setIdx != null ? Number(target.dataset.setIdx) : null,
          field,
          value: target.value,
          weekIndex: target.dataset.weekIdx != null ? Number(target.dataset.weekIdx) : null,
          dayIndex: target.dataset.dayIdx != null ? Number(target.dataset.dayIdx) : null,
          persist: false
        });
      });
    }
    const readiness = root.querySelector('#workout-readiness');
    if (readiness && readiness.dataset) {
      setWorkoutReadinessDraft({
        weekIndex: readiness.dataset.weekIdx != null ? Number(readiness.dataset.weekIdx) : null,
        dayIndex: readiness.dataset.dayIdx != null ? Number(readiness.dataset.dayIdx) : null,
        value: readiness.value,
        persist: false
      });
    }
    persistWorkoutDraftState();
  }

  function upsertLocalWorkoutLog({
    weekIndex,
    dayIndex,
    performedAt,
    entries,
    notes,
    readiness,
    durationMs = null,
    timerStartedAt = null,
    timerEndedAt = null,
    updatedAt = null
  }) {
    const next = Array.isArray(state.logs) ? state.logs.slice() : [];
    const idx = next.findIndex((row) => Number(row?.week_index) === Number(weekIndex) && Number(row?.day_index) === Number(dayIndex));
    const normalized = {
      week_index: weekIndex,
      day_index: dayIndex,
      performed_at: performedAt || null,
      entries: Array.isArray(entries) ? entries : [],
      notes: String(notes || ''),
      readiness: Number.isFinite(Number(readiness)) ? Number(readiness) : null,
      duration_ms: Number.isFinite(Number(durationMs)) && Number(durationMs) > 0 ? Math.max(0, Math.round(Number(durationMs))) : null,
      timer_started_at: timerStartedAt || null,
      timer_ended_at: timerEndedAt || null,
      updated_at: updatedAt || new Date().toISOString()
    };
    if (idx >= 0) next[idx] = { ...next[idx], ...normalized };
    else next.push(normalized);
    state.logs = next;
  }

  function buildWorkoutLogPayload({
    weekIndex,
    dayIndex,
    exercises,
    dayNotes = '',
    performedAt = null,
    requireReadiness = true,
    durationMs = null,
    timerStartedAt = null,
    timerEndedAt = null
  }) {
    const planId = state.planRow?.id;
    if (!planId) return { ok: false, error: state.auth.user ? 'No active plan found.' : 'Sign in to save workouts.' };

    captureVisibleWorkoutInputDrafts();

    const readinessEl = qs('#workout-readiness');
    const readinessRaw = readinessEl ? Number(readinessEl.value) : Number(getWorkoutReadinessDraft({ weekIndex, dayIndex, fallback: '' }));
    const readiness = Number.isFinite(readinessRaw) ? Math.max(1, Math.min(10, readinessRaw)) : null;
    if (requireReadiness && !Number.isFinite(readiness)) {
      return { ok: false, error: 'Add readiness (1-10) before saving.' };
    }

    const planRef = state.planRow?.plan || null;
    const daysPerWeek = Number(planRef?.meta?.daysPerWeek) || (Array.isArray(planRef?.weeks?.[0]?.days) ? planRef.weeks[0].days.length : 1);
    const historicalPerfMap = performanceMapBeforeSlot({
      logs: state.logs,
      beforeWeekIndex: weekIndex,
      beforeDayIndex: dayIndex,
      daysPerWeek
    });
    const previousEntryMap = previousEntryMapBeforeSlot({
      logs: state.logs,
      beforeWeekIndex: weekIndex,
      beforeDayIndex: dayIndex,
      daysPerWeek
    });
    const entries = (exercises || []).map((ex, exIdx) => {
      const exerciseKey = resolveWorkoutExerciseKey(ex);
      const lookupValues = {
        baseId: ex?.baseId,
        exerciseId: ex?.exerciseId || ex?.id,
        exerciseName: ex?.displayName || ex?.name
      };
      const previousEntry = pickLiftHistoryRecord(previousEntryMap, lookupValues);
      const historicalPerformance = pickLiftHistoryRecord(historicalPerfMap, lookupValues);
      const persistentLift = pickLiftHistoryRecord(state.liftHistory, lookupValues);
      const crossPlanHistory = findLatestMatchingLogData({
        logs: state.allLogs,
        values: lookupValues,
        beforeDate: performedAt
      });
      const resolvedProjected = resolveProjectedForExercise(ex, planRef, {
        previousEntry,
        historicalPerformance,
        crossPlanPerformance: crossPlanHistory.performance,
        persistentLift,
        currentPerformedAt: performedAt
      });
      const resolvedProjectedValue = Number.isFinite(resolvedProjected?.value) ? resolvedProjected.value : null;
      const resolvedProjectedUnit = resolvedProjected?.unit || null;
      const draftSetCount = getWorkoutSetCountDraft({
        exId: exerciseKey,
        exSlot: exIdx,
        weekIndex,
        dayIndex,
        fallback: ex.sets
      });
      const setMap = new Map();
      for (let idx = 0; idx < draftSetCount; idx += 1) {
        const weightRaw = getWorkoutInputDraftValue({
          exId: exerciseKey,
          exSlot: exIdx,
          setIdx: idx,
          field: 'setWeight',
          fallback: '',
          weekIndex,
          dayIndex
        }).trim();
        const repsRaw = getWorkoutInputDraftValue({
          exId: exerciseKey,
          exSlot: exIdx,
          setIdx: idx,
          field: 'setReps',
          fallback: '',
          weekIndex,
          dayIndex
        }).trim();
        const noteRaw = getWorkoutInputDraftValue({
          exId: exerciseKey,
          exSlot: exIdx,
          setIdx: idx,
          field: 'setNote',
          fallback: '',
          weekIndex,
          dayIndex
        }).trim();
        const entry = {};
        const weight = Number(weightRaw);
        const reps = Number(repsRaw);
        if (Number.isFinite(weight)) entry.weight = weight;
        if (Number.isFinite(reps)) entry.reps = reps;
        if (noteRaw) entry.note = noteRaw.slice(0, 140);
        if (Object.keys(entry).length) setMap.set(idx, entry);
      }
      const sets = Array.from(setMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, val]) => ({
          weight: Number.isFinite(val.weight) ? val.weight : null,
          reps: Number.isFinite(val.reps) ? val.reps : null,
          note: typeof val.note === 'string' ? val.note : null
        }));
      const lastSet = [...sets].reverse().find((s) => Number.isFinite(s.weight) || Number.isFinite(s.reps)) || null;
      return {
        exerciseId: ex.exerciseId || ex.id,
        baseId: ex.baseId,
        exerciseName: ex.displayName || ex.name || ex.baseId || ex.id || 'Exercise',
        prescribed: {
          sets: draftSetCount,
          reps: ex.reps,
          repsTarget: Number.isFinite(ex?.progression?.repsTarget) ? ex.progression.repsTarget : parseRepsTarget(ex.reps),
          restSec: ex.restSec,
          projectedWeight: resolvedProjectedValue,
          projectedUnit: resolvedProjectedUnit,
          rirTarget: Number.isFinite(ex?.rirTarget) ? ex.rirTarget : null
        },
        target: { weight: null },
        actual: {
          weight: Number.isFinite(lastSet?.weight) ? lastSet.weight : null,
          reps: Number.isFinite(lastSet?.reps) ? lastSet.reps : null,
          rpe: null
        },
        sets,
        notes: ''
      };
    });

    return {
      ok: true,
      payload: {
        planId,
        weekIndex,
        dayIndex,
        performedAt,
        durationMs: Number.isFinite(Number(durationMs)) && Number(durationMs) > 0 ? Math.max(0, Math.round(Number(durationMs))) : null,
        timerStartedAt: timerStartedAt || null,
        timerEndedAt: timerEndedAt || null,
        entries,
        notes: dayNotes,
        readiness
      }
    };
  }

  function cloneWorkoutAutosaveContext(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      weekIndex: Number(raw.weekIndex),
      dayIndex: Number(raw.dayIndex),
      performedAt: raw.performedAt ? String(raw.performedAt).slice(0, 10) : null,
      dayNotes: String(raw.dayNotes || ''),
      exercises: Array.isArray(raw.exercises)
        ? raw.exercises.map((ex) => (ex && typeof ex === 'object'
          ? {
              ...ex,
              progression: ex.progression && typeof ex.progression === 'object'
                ? { ...ex.progression }
                : ex.progression
            }
          : ex))
        : []
    };
  }

  async function persistWorkoutDraftToAccount(ctxInput = null) {
    if (workoutAutosaveInFlight) {
      workoutAutosaveQueued = true;
      workoutAutosaveQueuedContext = cloneWorkoutAutosaveContext(ctxInput || workoutAutosaveContext);
      return;
    }
    const ctx = cloneWorkoutAutosaveContext(ctxInput || workoutAutosaveContext);
    if (!ctx || !state.auth.user) return;
    const built = buildWorkoutLogPayload({
      weekIndex: ctx.weekIndex,
      dayIndex: ctx.dayIndex,
      exercises: ctx.exercises,
      dayNotes: ctx.dayNotes || '',
      performedAt: ctx.performedAt || null,
      requireReadiness: false
    });
    if (!built.ok) return;
    workoutAutosaveInFlight = true;
    try {
      const resp = await api('/api/training/log-draft', {
        method: 'POST',
        body: JSON.stringify(built.payload)
      });
      if (resp.ok) {
        if (resp.json?.liftHistory) rememberLiftHistory(resp.json.liftHistory);
        upsertLocalWorkoutLog({
          weekIndex: built.payload.weekIndex,
          dayIndex: built.payload.dayIndex,
          performedAt: built.payload.performedAt,
          durationMs: built.payload.durationMs,
          timerStartedAt: built.payload.timerStartedAt,
          timerEndedAt: built.payload.timerEndedAt,
          entries: built.payload.entries,
          notes: built.payload.notes,
          readiness: built.payload.readiness
        });
      }
    } catch {
      // ignore autosave failures
    } finally {
      workoutAutosaveInFlight = false;
      if (workoutAutosaveQueued) {
        const queuedContext = workoutAutosaveQueuedContext;
        workoutAutosaveQueued = false;
        workoutAutosaveQueuedContext = null;
        persistWorkoutDraftToAccount(queuedContext);
      }
    }
  }

  async function persistFinishedWorkoutTimer({ context, durationMs, startedAtMs, endedAtMs } = {}) {
    const timerContext = context && typeof context === 'object' ? context : null;
    const planId = String(timerContext?.planId || state.planRow?.id || '').trim();
    const weekIndex = Number(timerContext?.weekIndex);
    const dayIndex = Number(timerContext?.dayIndex);
    if (!state.auth.user || !planId || !Number.isFinite(weekIndex) || !Number.isFinite(dayIndex)) return false;
    const exercises = getPlanExercisesForWorkoutDay({ weekIndex, dayIndex });
    if (!exercises.length) return false;
    const existingLog = (Array.isArray(state.logs) ? state.logs : []).find((row) => (
      Number(row?.week_index) === Number(weekIndex) && Number(row?.day_index) === Number(dayIndex)
    )) || null;
    const built = buildWorkoutLogPayload({
      weekIndex,
      dayIndex,
      exercises,
      dayNotes: existingLog?.notes || '',
      performedAt: timerContext?.activeDate || null,
      requireReadiness: false,
      durationMs,
      timerStartedAt: startedAtMs ? new Date(startedAtMs).toISOString() : null,
      timerEndedAt: endedAtMs ? new Date(endedAtMs).toISOString() : null
    });
    if (!built.ok) return false;
    try {
      const resp = await api('/api/training/log', {
        method: 'POST',
        body: JSON.stringify(built.payload)
      });
      if (!resp.ok) return false;
      if (resp.json?.plan) {
        state.planRow = resp.json.plan;
        sanitizeBodybuildingPlanInPlace(state.planRow);
      }
      if (resp.json?.liftHistory) rememberLiftHistory(resp.json.liftHistory);
      upsertLocalWorkoutLog({
        weekIndex: built.payload.weekIndex,
        dayIndex: built.payload.dayIndex,
        performedAt: built.payload.performedAt,
        durationMs: built.payload.durationMs,
        timerStartedAt: built.payload.timerStartedAt,
        timerEndedAt: built.payload.timerEndedAt,
        entries: built.payload.entries,
        notes: built.payload.notes,
        readiness: built.payload.readiness
      });
      clearWorkoutDraftStateForDay({
        weekIndex: built.payload.weekIndex,
        dayIndex: built.payload.dayIndex
      });
      return true;
    } catch {
      return false;
    }
  }

  function scheduleWorkoutAutosave(contextInput = null) {
    if (!state.auth.user || !(contextInput || workoutAutosaveContext)) return;
    if (workoutAutosaveTimer) clearTimeout(workoutAutosaveTimer);
    const snapshot = cloneWorkoutAutosaveContext(contextInput || workoutAutosaveContext);
    workoutAutosaveTimer = window.setTimeout(() => {
      workoutAutosaveTimer = 0;
      persistWorkoutDraftToAccount(snapshot);
    }, 2000);
  }

  function cancelWorkoutAutosave() {
    if (workoutAutosaveTimer) {
      clearTimeout(workoutAutosaveTimer);
      workoutAutosaveTimer = 0;
    }
    workoutAutosaveQueued = false;
    workoutAutosaveQueuedContext = null;
  }

  function ensureShareOutgoingSyncTimer() {
    if (shareOutgoingSyncTimer) return;
    shareOutgoingSyncTimer = window.setInterval(async () => {
      if (!state.auth.user) return;
      pollShareEvents().catch(() => {});
      if (document.hidden) return;
      if (shareUi.loading || shareOutgoingSyncInFlight) return;
      if (shareUi.requesting.size || shareUi.kicking.size) return;
      if (shareUi.open) {
        if (!shareUi.loaded) {
          loadShareAccounts(shareUi.query || '');
          return;
        }
        shareOutgoingSyncInFlight = true;
        try {
          await refreshShareOutgoingState({ rerender: true });
        } finally {
          shareOutgoingSyncInFlight = false;
        }
        return;
      }
      if (!shareUi.bootstrapRequested) return;
      shareOutgoingSyncInFlight = true;
      try {
        // Do not re-render the full training view while users are typing workout inputs.
        // This background sync should refresh share state silently unless the popover is open.
        await refreshShareOutgoingState({ rerender: false });
      } finally {
        shareOutgoingSyncInFlight = false;
      }
    }, SHARE_OUTGOING_SYNC_MS);
  }

  function formatWorkoutElapsed(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatRestCountdown(ms) {
    const total = Math.max(0, Math.ceil(Math.max(0, Number(ms || 0)) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function getWorkoutElapsedMs() {
    if (workoutTimer.running) return Date.now() - workoutTimer.startedAt;
    return workoutTimer.elapsedMs || 0;
  }

  function getWorkoutRestRemainingMs() {
    if (!restTimer.running) return 0;
    return Math.max(0, Number(restTimer.endsAt || 0) - Date.now());
  }

  function isRestTimerExerciseActive(exerciseName = '') {
    if (!restTimer.running) return false;
    const current = String(restTimer.context?.exerciseName || '').trim().toLowerCase();
    const target = String(exerciseName || '').trim().toLowerCase();
    return Boolean(current && target && current === target);
  }

  function updateWorkoutTimerDisplay() {
    const node = document.getElementById('workout-timer-display');
    if (!node) {
      scheduleFloatingWorkoutTimerSync();
      return;
    }
    if (!workoutTimer.running && !workoutTimer.paused) {
      node.classList.add('hidden');
      scheduleFloatingWorkoutTimerSync();
      return;
    }
    node.classList.remove('hidden');
    if (workoutTimer.paused) {
      node.textContent = `Paused ${formatWorkoutElapsed(getWorkoutElapsedMs())}`;
      scheduleFloatingWorkoutTimerSync();
      return;
    }
    node.textContent = `Workout ${formatWorkoutElapsed(getWorkoutElapsedMs())}`;
    scheduleFloatingWorkoutTimerSync();
  }

  function showWorkoutRestTimerDoneToast(exerciseName = '') {
    const existing = document.getElementById('workout-rest-done-toast');
    if (existing) existing.remove();
    const label = String(exerciseName || '').trim();
    const toast = el('div', { class: 'workout-saved-toast', id: 'workout-rest-done-toast', role: 'status' },
      el('div', { class: 'workout-saved-icon', 'aria-hidden': 'true' }, '⏱'),
      el('div', { class: 'workout-saved-text' },
        el('div', { class: 'workout-saved-title' }, 'Rest finished'),
        el('div', { class: 'workout-saved-sub' }, label ? `${label} is ready for the next set.` : 'Time for your next set.')
      )
    );
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 2200);
    });
  }

  function showWorkoutRestTimerStartedToast(exerciseName = '', restSec = 0) {
    const existing = document.getElementById('workout-rest-started-toast');
    if (existing) existing.remove();
    const label = String(exerciseName || '').trim();
    const restText = fmtRest(restSec);
    const toast = el('div', { class: 'workout-saved-toast', id: 'workout-rest-started-toast', role: 'status' },
      el('div', { class: 'workout-saved-icon', 'aria-hidden': 'true' }, '⏳'),
      el('div', { class: 'workout-saved-text' },
        el('div', { class: 'workout-saved-title' }, 'Rest timer started'),
        el('div', { class: 'workout-saved-sub' }, label ? `${label} • ${restText}` : `${restText} rest`)
      )
    );
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 1100);
    });
  }

  function ensureWorkoutRestAlertAudioContext() {
    if (workoutRestAlertAudioContext) return workoutRestAlertAudioContext;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      workoutRestAlertAudioContext = new AudioCtx();
      return workoutRestAlertAudioContext;
    } catch {
      return null;
    }
  }

  function primeWorkoutRestAlertNotifications() {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return;
      Notification.requestPermission().catch(() => {});
    } catch {
      // ignore notification permission failures
    }
  }

  function showWorkoutRestTimerSystemNotification(exerciseName = '') {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      const label = String(exerciseName || '').trim();
      const notification = new Notification('Rest timer finished', {
        body: label ? `${label} is ready for the next set.` : 'Time for your next set.',
        tag: 'training-rest-timer-finished',
        renotify: true,
        requireInteraction: false,
        silent: false
      });
      notification.onclick = () => {
        try { window.focus(); } catch { /* ignore */ }
        try { notification.close(); } catch { /* ignore */ }
      };
      window.setTimeout(() => {
        try { notification.close(); } catch { /* ignore */ }
      }, 12000);
    } catch {
      // ignore notification failures
    }
  }

  function primeWorkoutRestAlertAudio() {
    const ctx = ensureWorkoutRestAlertAudioContext();
    if (!ctx) return;
    primeWorkoutRestAlertNotifications();
    try {
      const markUnlocked = () => {
        workoutRestAlertAudioUnlocked = ctx.state === 'running';
      };
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        Promise.resolve(ctx.resume()).then(() => {
          markUnlocked();
          if (!workoutRestAlertAudioUnlocked) return;
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const at = ctx.currentTime + 0.01;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, at);
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(0.00015, at + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(at);
            osc.stop(at + 0.04);
          } catch {
            // ignore audio prime failures
          }
        }).catch(() => {});
        return;
      }
      markUnlocked();
    } catch {
      // ignore browser audio failures
    }
  }

  function playWorkoutRestTimerAlert() {
    try {
      const ctx = ensureWorkoutRestAlertAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        Promise.resolve(ctx.resume()).catch(() => {});
      }
      const startAt = ctx.currentTime + 0.02;
      const sequence = [
        { freq: 1046.5, duration: 0.16 },
        { freq: 1318.51, duration: 0.18 },
        { freq: 1567.98, duration: 0.24 },
        { freq: 1318.51, duration: 0.18 }
      ];
      sequence.forEach((tone, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const toneStart = startAt + (idx * 0.2);
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(tone.freq, toneStart);
        gain.gain.setValueAtTime(0.0001, toneStart);
        gain.gain.exponentialRampToValueAtTime(0.26, toneStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + tone.duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(toneStart);
        osc.stop(toneStart + tone.duration + 0.03);
      });
      if (navigator?.vibrate) {
        try { navigator.vibrate([120, 60, 180]); } catch { /* ignore */ }
      }
    } catch {
      // ignore browser audio failures
    }
  }

  function completeWorkoutRestTimer({ fireAlert = true } = {}) {
    const exerciseName = String(restTimer.context?.exerciseName || '').trim();
    resetWorkoutRestTimerState({ removePersisted: true });
    updateWorkoutRestTimerDisplay();
    if (fireAlert) {
      playWorkoutRestTimerAlert();
      if (document.hidden) showWorkoutRestTimerSystemNotification(exerciseName);
      showWorkoutRestTimerDoneToast(exerciseName);
    }
  }

  // Live-update the in-column "Start rest" / "Rest M:SS" buttons. Previously the
  // 250ms tick only drove the floating dock, so the column button was computed
  // once at render and never counted down — that's why the column timer looked
  // dead. Active exercise's button counts down; all others read "Start rest".
  function updateWorkoutRestButtons() {
    const buttons = document.querySelectorAll('.btn-rest-timer[data-rest-exercise]');
    if (!buttons.length) return;
    const activeName = restTimer.running ? String(restTimer.context?.exerciseName || '').trim().toLowerCase() : '';
    const remainingMs = restTimer.running ? getWorkoutRestRemainingMs() : 0;
    buttons.forEach((btn) => {
      const name = String(btn.getAttribute('data-rest-exercise') || '').trim().toLowerCase();
      if (activeName && name === activeName && remainingMs > 0) {
        btn.textContent = `Rest ${formatRestCountdown(remainingMs)}`;
        btn.classList.add('is-resting');
      } else {
        btn.textContent = 'Start rest';
        btn.classList.remove('is-resting');
      }
    });
  }

  function updateWorkoutRestTimerDisplay() {
    if (!restTimer.running) {
      updateWorkoutRestButtons();
      scheduleFloatingWorkoutTimerSync();
      return;
    }
    const remainingMs = getWorkoutRestRemainingMs();
    if (remainingMs <= 0) {
      completeWorkoutRestTimer({ fireAlert: true });
      return;
    }
    updateWorkoutRestButtons();
    scheduleFloatingWorkoutTimerSync();
  }

  function clearFloatingWorkoutTimerResetTimer() {
    if (!floatingWorkoutTimerResetTimer) return;
    window.clearTimeout(floatingWorkoutTimerResetTimer);
    floatingWorkoutTimerResetTimer = 0;
  }

  function resetFloatingWorkoutTimerClicks({ rerender = true } = {}) {
    clearFloatingWorkoutTimerResetTimer();
    floatingWorkoutTimerClickCount = 0;
    if (rerender) scheduleFloatingWorkoutTimerSync();
  }

  function armFloatingWorkoutTimerClicks(count) {
    floatingWorkoutTimerClickCount = Math.max(0, Number(count || 0));
    clearFloatingWorkoutTimerResetTimer();
    floatingWorkoutTimerResetTimer = window.setTimeout(() => {
      floatingWorkoutTimerResetTimer = 0;
      floatingWorkoutTimerClickCount = 0;
      scheduleFloatingWorkoutTimerSync();
    }, 2600);
    scheduleFloatingWorkoutTimerSync();
  }

  function ensureFloatingWorkoutTimerDock() {
    let node = document.getElementById('workout-floating-timer');
    if (node) return node;
    node = document.createElement('button');
    node.type = 'button';
    node.id = 'workout-floating-timer';
    node.className = 'workout-floating-timer hidden';
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = `
      <span class="workout-floating-timer-time" data-workout-floating-time>Workout 0:00</span>
      <span class="workout-floating-rest-time hidden" data-workout-floating-rest-time></span>
    `.trim();
    node.addEventListener('click', () => {
      if (!workoutTimer.running && !workoutTimer.paused) return;
      if (workoutTimer.running) {
        if (floatingWorkoutTimerClickCount <= 0) {
          armFloatingWorkoutTimerClicks(1);
          return;
        }
        if (floatingWorkoutTimerClickCount === 1) {
          pauseWorkoutTimer({ reason: 'floating_timer' });
          armFloatingWorkoutTimerClicks(2);
          return;
        }
        return;
      }
      if (workoutTimer.paused && floatingWorkoutTimerClickCount >= 2) {
        resetFloatingWorkoutTimerClicks({ rerender: false });
        void confirmEndWorkout({ allowPaused: true, source: 'floating_timer' });
        return;
      }
      resetFloatingWorkoutTimerClicks({ rerender: false });
      startWorkoutTimer();
    });
    document.body.appendChild(node);
    return node;
  }

  function syncFloatingWorkoutTimerDock() {
    const node = ensureFloatingWorkoutTimerDock();
    const timeNode = node.querySelector('[data-workout-floating-time]');
    const restNode = node.querySelector('[data-workout-floating-rest-time]');
    const active = Boolean(workoutTimer.running || workoutTimer.paused);
    const anchor = document.querySelector('[data-workout-timer-anchor]');
    const anchorVisible = (() => {
      if (!anchor) return false;
      const rect = anchor.getBoundingClientRect();
      return rect.bottom > 24 && rect.top < (window.innerHeight - 24);
    })();
    const shouldShow = active
      && document.body.classList.contains('training-page')
      && state.view === 'plan'
      && !anchorVisible;
    if (!shouldShow) {
      node.classList.add('hidden');
      node.classList.remove('show', 'paused', 'armed');
      resetFloatingWorkoutTimerClicks({ rerender: false });
      return;
    }
    const wasHidden = node.classList.contains('hidden');
    node.classList.remove('hidden');
    if (wasHidden) {
      node.classList.remove('show');
      requestAnimationFrame(() => {
        if (!node.classList.contains('hidden')) node.classList.add('show');
      });
    } else {
      node.classList.add('show');
    }
    node.classList.toggle('paused', workoutTimer.paused);
    node.classList.toggle('armed', floatingWorkoutTimerClickCount > 0);
    if (timeNode) {
      timeNode.textContent = workoutTimer.paused
        ? `Paused ${formatWorkoutElapsed(getWorkoutElapsedMs())}`
        : `Workout ${formatWorkoutElapsed(getWorkoutElapsedMs())}`;
    }
    if (restNode) {
      if (!restTimer.running) {
        restNode.classList.add('hidden');
        restNode.textContent = '';
      } else {
        const remainingMs = getWorkoutRestRemainingMs();
        if (remainingMs <= 0) {
          completeWorkoutRestTimer({ fireAlert: true });
          return;
        }
        restNode.classList.remove('hidden');
        restNode.textContent = `Rest ${formatRestCountdown(remainingMs)}`;
      }
    }
  }

  function scheduleFloatingWorkoutTimerSync() {
    if (floatingWorkoutTimerSyncRaf) return;
    floatingWorkoutTimerSyncRaf = requestAnimationFrame(() => {
      floatingWorkoutTimerSyncRaf = 0;
      syncFloatingWorkoutTimerDock();
    });
  }

  function bindFloatingWorkoutTimerDock() {
    if (floatingWorkoutTimerBound) return;
    floatingWorkoutTimerBound = true;
    const onViewportChange = () => scheduleFloatingWorkoutTimerSync();
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    document.addEventListener('visibilitychange', onViewportChange);
  }

  function ensureWorkoutTimerTick() {
    if (!workoutTimer.running) return;
    if (workoutTimer.intervalId) return;
    workoutTimer.intervalId = window.setInterval(() => {
      updateWorkoutTimerDisplay();
    }, 1000);
    updateWorkoutTimerDisplay();
  }

  function ensureWorkoutRestTimerTick() {
    if (!restTimer.running) return;
    if (restTimer.intervalId) return;
    restTimer.intervalId = window.setInterval(() => {
      updateWorkoutRestTimerDisplay();
    }, 250);
    updateWorkoutRestTimerDisplay();
  }

  function startWorkoutRestTimer({ exerciseName = '', restSec = 0, weekIndex = null, dayIndex = null, activeDate = null } = {}) {
    const seconds = Math.max(0, Math.round(Number(restSec) || 0));
    if (seconds <= 0) return;
    primeWorkoutRestAlertAudio();
    const durationMs = seconds * 1000;
    const planId = String(state.planRow?.id || '').trim() || null;
    const activeDay = activeDate ? String(activeDate).slice(0, 10) : null;
    if (restTimer.intervalId) {
      clearInterval(restTimer.intervalId);
      restTimer.intervalId = 0;
    }
    restTimer.running = true;
    restTimer.endsAt = Date.now() + durationMs;
    restTimer.durationMs = durationMs;
    restTimer.alertAt = 0;
    restTimer.context = {
      planId,
      weekIndex: Number.isFinite(Number(weekIndex)) ? Number(weekIndex) : null,
      dayIndex: Number.isFinite(Number(dayIndex)) ? Number(dayIndex) : null,
      activeDate: activeDay,
      exerciseName: String(exerciseName || '').trim() || null,
      restSec: seconds
    };
    persistWorkoutRestTimerState();
    ensureWorkoutRestTimerTick();
    updateWorkoutRestTimerDisplay();
    showWorkoutRestTimerStartedToast(exerciseName, seconds);
  }

  function bindWorkoutInputTracking() {
    if (workoutInputBound) return;
    workoutInputBound = true;
    document.addEventListener('input', (e) => {
      if (!document.body.classList.contains('training-page')) return;
      const target = e.target;
      if (!target) return;
      if (target.id === 'workout-readiness' && target.dataset) {
        setWorkoutReadinessDraft({
          weekIndex: target.dataset.weekIdx != null ? Number(target.dataset.weekIdx) : null,
          dayIndex: target.dataset.dayIdx != null ? Number(target.dataset.dayIdx) : null,
          value: target.value
        });
        if (state.auth.user && workoutAutosaveContext) scheduleWorkoutAutosave();
        return;
      }
      if (!target.dataset) return;
      const field = target.dataset.field;
      if (!field) return;
      const exId = target.dataset.exId || null;
      const exSlot = target.dataset.exSlot != null ? Number(target.dataset.exSlot) : 0;
      const setIdx = target.dataset.setIdx != null ? Number(target.dataset.setIdx) : null;
      const weekIndex = target.dataset.weekIdx != null ? Number(target.dataset.weekIdx) : null;
      const dayIndex = target.dataset.dayIdx != null ? Number(target.dataset.dayIdx) : null;
      setWorkoutInputDraftValue({
        exId,
        exSlot,
        setIdx,
        field,
        value: target.value,
        weekIndex,
        dayIndex
      });
      const raw = String(target.value || '').trim();
      const detail = { field, exId, setIdx };
      if (field === 'setNote') {
        detail.note = raw.slice(0, 120);
      } else {
        const num = Number(raw);
        if (Number.isFinite(num)) detail.value = num;
      }
      if (workoutTimer.running) recordWorkoutEvent('input', detail);
      if (state.auth.user && workoutAutosaveContext) scheduleWorkoutAutosave();
    }, true);
  }

  function showWorkoutInputGateToast() {
    const now = Date.now();
    if (now - workoutInputGateToastAt < 900) return;
    workoutInputGateToastAt = now;
    const existing = document.getElementById('workout-input-gate-toast');
    if (existing) existing.remove();
    const toast = el('div', { class: 'workout-saved-toast', id: 'workout-input-gate-toast', role: 'status' },
      el('div', { class: 'workout-saved-icon', 'aria-hidden': 'true' }, '!'),
      el('div', { class: 'workout-saved-text' },
        el('div', { class: 'workout-saved-title' }, 'Start timer to input'),
        el('div', { class: 'workout-saved-sub' }, 'Start workout to log weight, reps, and notes.')
      )
    );
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 1100);
    });
  }

  function bindWorkoutInputGate() {
    if (workoutInputGateBound) return;
    workoutInputGateBound = true;
    const lockedSelector = '.exercise-set-row input[data-field]';
    const handleGateAttempt = (e) => {
      if (workoutTimer.running) return;
      if (!document.body.classList.contains('training-page')) return;
      const t = e.target;
      const target = t && t.closest ? t.closest(lockedSelector) : null;
      if (!target) return;
      showWorkoutInputGateToast();
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof target.blur === 'function') {
        window.setTimeout(() => {
          try { target.blur(); } catch { /* ignore */ }
        }, 0);
      }
    };
    document.addEventListener('pointerdown', handleGateAttempt, true);
    document.addEventListener('focusin', handleGateAttempt, true);
  }

  function startWorkoutTimer(contextInput = null) {
    if (workoutTimer.running) return;
    primeWorkoutRestAlertAudio();
    const nextContext = contextInput && typeof contextInput === 'object'
      ? {
          planId: String(contextInput.planId || state.planRow?.id || '').trim() || null,
          weekIndex: Number.isFinite(Number(contextInput.weekIndex)) ? Number(contextInput.weekIndex) : null,
          dayIndex: Number.isFinite(Number(contextInput.dayIndex)) ? Number(contextInput.dayIndex) : null,
          activeDate: contextInput.activeDate ? String(contextInput.activeDate).slice(0, 10) : null
        }
      : null;
    if (workoutTimer.paused && Number(workoutTimer.elapsedMs) > 0) {
      workoutTimer.running = true;
      workoutTimer.paused = false;
      workoutTimer.startedAt = Date.now() - Math.max(0, Number(workoutTimer.elapsedMs) || 0);
      if (!String(workoutTimer.context?.planId || '').trim() && nextContext?.planId) workoutTimer.context = nextContext;
      ensureWorkoutTimerTick();
      logTrainingEvent('workout_resume', {
        planId: workoutTimer.context?.planId || state.planRow?.id || null,
        weekIndex: Number.isFinite(workoutTimer.context?.weekIndex) ? workoutTimer.context.weekIndex : null,
        dayIndex: Number.isFinite(workoutTimer.context?.dayIndex) ? workoutTimer.context.dayIndex : null,
        activeDate: workoutTimer.context?.activeDate || null,
        resumedAt: new Date().toISOString()
      });
      persistWorkoutTimerState();
      render();
      return;
    }
    if (nextContext?.planId) workoutTimer.context = nextContext;
    workoutTimer.running = true;
    workoutTimer.paused = false;
    workoutTimer.startedAt = Date.now();
    workoutTimer.elapsedMs = 0;
    workoutTimer.events = [];
    ensureWorkoutTimerTick();
    persistWorkoutTimerState();
    render();
  }

  function pauseWorkoutTimer({ reason = 'manual' } = {}) {
    if (!workoutTimer.running || !workoutTimer.startedAt) return;
    captureVisibleWorkoutInputDrafts();
    persistWorkoutDraftToAccount(workoutAutosaveContext);
    const now = Date.now();
    workoutTimer.elapsedMs = Math.max(0, now - workoutTimer.startedAt);
    workoutTimer.running = false;
    workoutTimer.paused = true;
    if (workoutTimer.intervalId) {
      clearInterval(workoutTimer.intervalId);
      workoutTimer.intervalId = 0;
    }
    logTrainingEvent('workout_pause', {
      planId: workoutTimer.context?.planId || state.planRow?.id || null,
      weekIndex: Number.isFinite(workoutTimer.context?.weekIndex) ? workoutTimer.context.weekIndex : null,
      dayIndex: Number.isFinite(workoutTimer.context?.dayIndex) ? workoutTimer.context.dayIndex : null,
      activeDate: workoutTimer.context?.activeDate || null,
      pausedAt: new Date(now).toISOString(),
      elapsedSec: Math.round(workoutTimer.elapsedMs / 1000),
      reason
    });
    persistWorkoutTimerState();
    updateWorkoutTimerDisplay();
    render();
  }

  function recordWorkoutEvent(type, details) {
    if (!workoutTimer.running || !workoutTimer.startedAt) return;
    const now = Date.now();
    workoutTimer.events.push({
      type: String(type || 'event'),
      at: new Date(now).toISOString(),
      offsetSec: Math.max(0, Math.round((now - workoutTimer.startedAt) / 1000)),
      details: details || {}
    });
    if (workoutTimer.events.length > 300) workoutTimer.events = workoutTimer.events.slice(-300);
    persistWorkoutTimerState();
  }

  function showWorkoutSavedToast() {
    const existing = document.getElementById('workout-saved-toast');
    if (existing) existing.remove();
    const toast = el('div', { class: 'workout-saved-toast', id: 'workout-saved-toast', role: 'status' },
      el('div', { class: 'workout-saved-icon', 'aria-hidden': 'true' }, '✓'),
      el('div', { class: 'workout-saved-text' },
        el('div', { class: 'workout-saved-title' }, 'Workout saved'),
        el('div', { class: 'workout-saved-sub' }, 'Session data stored in your profile.')
      )
    );
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 1400);
    });
  }

  async function confirmEndWorkout({ allowPaused = false, source = 'confirmed' } = {}) {
    if (!workoutTimer.running && !(allowPaused && workoutTimer.paused)) return;
    const confirmFn = typeof window.odeConfirm === 'function' ? window.odeConfirm : null;
    let action = 'dismiss';
    if (confirmFn) {
      action = await confirmFn({
        title: 'Finish workout?',
        message: 'Are you sure you want to finish your workout?\nYour workout timer and input events will be saved to your profile.',
        confirmText: 'Finish workout',
        cancelText: workoutTimer.paused ? 'Keep paused' : 'Pause workout',
        danger: false,
        returnAction: true
      });
    } else {
      action = window.confirm('Finish workout?\nYour workout timer and input events will be saved to your profile.')
        ? 'confirm'
        : 'dismiss';
    }
    if (action === 'confirm') {
      await endWorkoutTimer({ reason: source || 'confirmed', showToast: true });
      return;
    }
    if (action === 'cancel' && !workoutTimer.paused) {
      pauseWorkoutTimer({ reason: 'confirm_cancel' });
    }
  }

  async function endWorkoutTimer({ reason = 'manual', showToast = false } = {}) {
    if (!workoutTimer.running && !workoutTimer.paused) return;
    cancelWorkoutAutosave();
    const endedAt = Date.now();
    const startedAtMs = Number(workoutTimer.startedAt) || 0;
    const durationMs = workoutTimer.paused
      ? Math.max(0, Number(workoutTimer.elapsedMs) || 0)
      : Math.max(0, endedAt - workoutTimer.startedAt);
    const timerContext = workoutTimer.context && typeof workoutTimer.context === 'object'
      ? { ...workoutTimer.context }
      : {};
    const timerPlanId = String(timerContext?.planId || state.planRow?.id || '').trim();
    const timerDayIso = String(timerContext?.activeDate || '').trim();
    if (durationMs > 0) {
      logTrainingEvent('workout_duration', {
        planId: state.planRow?.id || null,
        weekIndex: Number.isFinite(workoutTimer.context?.weekIndex) ? workoutTimer.context.weekIndex : null,
        dayIndex: Number.isFinite(workoutTimer.context?.dayIndex) ? workoutTimer.context.dayIndex : null,
        activeDate: workoutTimer.context?.activeDate || null,
        durationMs,
        durationSec: Math.round(durationMs / 1000),
        startedAt: workoutTimer.startedAt ? new Date(workoutTimer.startedAt).toISOString() : null,
        endedAt: new Date(endedAt).toISOString()
      });
      logTrainingEvent('workout_finish', {
        planId: workoutTimer.context?.planId || state.planRow?.id || null,
        weekIndex: Number.isFinite(workoutTimer.context?.weekIndex) ? workoutTimer.context.weekIndex : null,
        dayIndex: Number.isFinite(workoutTimer.context?.dayIndex) ? workoutTimer.context.dayIndex : null,
        activeDate: workoutTimer.context?.activeDate || null,
        startedAt: workoutTimer.startedAt ? new Date(workoutTimer.startedAt).toISOString() : null,
        endedAt: new Date(endedAt).toISOString(),
        durationMs,
        durationSec: Math.round(durationMs / 1000),
        reason,
        events: workoutTimer.events.slice(0, 300)
      });
      // Feed the identity engine: a finished workout is an activity signal.
      // Resistance sessions credit the strength axis explicitly; a generic
      // 'workouts' tick also counts toward showing up.
      try { window.RiseActivity?.log('workouts'); window.RiseActivity?.log('strengthWorkouts'); } catch { /* ignore */ }
    }
    resetWorkoutTimerState({ removePersisted: true });
    resetWorkoutRestTimerState({ removePersisted: true });
    if (durationMs > 0) {
      await persistFinishedWorkoutTimer({
        context: timerContext,
        durationMs,
        startedAtMs,
        endedAtMs: endedAt
      });
    }
    if (timerDayIso) {
      writeTrainingPlanNavValue('active_date', timerDayIso, { planId: timerPlanId });
    }
    updateWorkoutTimerDisplay();
    updateWorkoutRestTimerDisplay();
    render();
    if (showToast) showWorkoutSavedToast();
  }

  function syncWorkoutInputLock() {
    const locked = !workoutTimer.running;
    const rootNode = document.querySelector('.plan-shell');
    if (!rootNode) return;
    const setInputs = rootNode.querySelectorAll('.exercise-set-row input[data-field]');
    setInputs.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (locked) {
        if (node.dataset.timerLock !== '1') node.dataset.timerLock = '1';
        node.setAttribute('readonly', 'true');
        node.setAttribute('aria-disabled', 'true');
        return;
      }
      if (node.dataset.timerLock === '1') {
        node.removeAttribute('readonly');
        node.removeAttribute('aria-disabled');
        delete node.dataset.timerLock;
      }
    });
    const setButtons = rootNode.querySelectorAll('.exercise-set-add, .exercise-set-remove');
    setButtons.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (locked) {
        node.setAttribute('disabled', 'true');
        node.dataset.timerDisabled = '1';
        node.setAttribute('aria-disabled', 'true');
        return;
      }
      node.removeAttribute('disabled');
      if (node.dataset.timerDisabled) delete node.dataset.timerDisabled;
      node.setAttribute('aria-disabled', 'false');
    });
  }


  function normalizeDiscipline(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'powerlifting') return 'powerlifting';
    if (v === 'powerbuilding') return 'powerbuilding';
    if (v === 'military' || v === 'military hybrid') return 'military';
    if (v === 'bodybuilding' || v === 'hypertrophy') return 'bodybuilding';
    if (v === 'calisthenics' || v === 'bodyweight') return 'calisthenics';
    return null;
  }

  function mapWizardDisciplineToTrainingFeel(disciplineRaw) {
    const discipline = normalizeDiscipline(disciplineRaw);
    if (discipline === 'powerbuilding') return 'Powerbuilding';
    if (discipline === 'military') return 'Military Hybrid';
    if (discipline === 'bodybuilding') return 'Aesthetic bodybuilding';
    return '';
  }

  function mapWizardSessionBucketToSessionLength(timePerSessionRaw) {
    const v = String(timePerSessionRaw || '').trim().toLowerCase();
    if (v === 'under_45') return '30';
    if (v === '45_60') return '45';
    if (v === '60_75') return '60';
    if (v === '75_plus') return '75+';
    return '60';
  }

  function mapWizardEquipmentStyleToTrainingStyle(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'machine') return 'Mostly machines/cables';
    if (v === 'barbell' || v === 'dumbbell') return 'Mostly free weights';
    return 'Balanced mix';
  }

  function mapWizardTrainingAgeToExperience(raw, fallback = '6-24m') {
    const v = String(raw || '').trim().toLowerCase();
    if (v === '0_6') return '<6m';
    if (v === '6_18') return '6-24m';
    if (v === '18_36' || v === '3_5') return '2-5y';
    if (v === '5_plus') return '5y+';
    return fallback;
  }

  function mapWizardPhaseToPrimaryGoal(phaseRaw) {
    const v = String(phaseRaw || '').trim().toLowerCase();
    if (v === 'cut') return 'Cut fat';
    if (v === 'maintain') return 'Recomp';
    return 'Build size';
  }

  function mapWizardEquipmentAccessToList(equipmentAccess) {
    const src = equipmentAccess && typeof equipmentAccess === 'object' ? equipmentAccess : { bodyweight: true };
    const order = [
      ['bodyweight', 'Bodyweight'],
      ['dumbbell', 'Dumbbells'],
      ['barbell', 'Barbell'],
      ['cable', 'Cable'],
      ['machine', 'Machines']
    ];
    return order.filter(([key]) => Boolean(src[key])).map(([, label]) => label);
  }

  function mapWizardEquipmentAccessToLocation(equipmentAccess) {
    const list = mapWizardEquipmentAccessToList(equipmentAccess).map((entry) => String(entry || '').toLowerCase());
    return list.some((entry) => entry.includes('cable') || entry.includes('machine')) ? 'Commercial gym' : 'Home';
  }

  function mapWizardEmphasisToPriorityGroups(rawList) {
    const alias = {
      chest: 'Chest',
      back: 'Back',
      shoulders: 'Shoulders',
      arms: 'Arms',
      quads: 'Legs',
      legs: 'Legs',
      hamstrings_glutes: 'Glutes',
      glutes: 'Glutes',
      calves: 'Calves',
      abs: 'Core',
      core: 'Core'
    };
    const out = [];
    (Array.isArray(rawList) ? rawList : []).forEach((entry) => {
      const mapped = alias[String(entry || '').trim().toLowerCase()] || '';
      if (mapped && !out.includes(mapped)) out.push(mapped);
    });
    return out.slice(0, 3);
  }

  function mapWizardInjuryToPainFields(injuryRaw) {
    const injury = injuryRaw && typeof injuryRaw === 'object' ? injuryRaw : { has: false, joints: [], note: '', severityByJoint: {} };
    if (!injury.has) return { painAreas: [], painProfilesByArea: {}, movementsToAvoid: [] };
    const areaMap = {
      shoulder: 'Shoulder',
      elbow: 'Elbow',
      wrist: 'Wrist',
      back: 'Back',
      hip: 'Hip',
      knee: 'Knee',
      ankle: 'Ankle'
    };
    const painAreas = [];
    const painProfilesByArea = {};
    const movementsToAvoid = [];
    const note = String(injury.note || '').trim();
    (Array.isArray(injury.joints) ? injury.joints : []).forEach((joint) => {
      const key = String(joint || '').trim().toLowerCase();
      const area = areaMap[key];
      if (!area || painAreas.includes(area)) return;
      painAreas.push(area);
      const severity = Number(injury?.severityByJoint?.[key]);
      painProfilesByArea[area] = {
        severity: Number.isFinite(severity) ? Math.max(1, Math.min(10, Math.round(severity))) : 5,
        recency: 'Recent',
        notes: note
      };
      if (area === 'Shoulder' && !movementsToAvoid.includes('bench press')) movementsToAvoid.push('bench press');
      if (area === 'Back' && !movementsToAvoid.includes('deadlift')) movementsToAvoid.push('deadlift');
      if (area === 'Knee' && !movementsToAvoid.includes('squat')) movementsToAvoid.push('squat');
    });
    return { painAreas, painProfilesByArea, movementsToAvoid };
  }

  function buildSharedOblueprintPayloadFromWizard({
    discipline,
    daysPerWeek,
    strength = {},
    experience = 'beginner',
    goalMode = 'bulk',
    resolvedPhase = 'bulk',
    injury = null,
    equipmentAccess = { bodyweight: true },
    preferredDays = [],
    unavailableDays = [],
    timePerSession = '',
    trainingAgeBucket = '',
    emphasis = [],
    equipmentStylePref = 'mix'
  } = {}) {
    const normalizedDiscipline = normalizeDiscipline(discipline);
    if (!normalizedDiscipline || !['bodybuilding', 'powerbuilding', 'military'].includes(normalizedDiscipline)) return null;
    const normalizedStrength = strength && typeof strength === 'object' ? strength : {};
    const injuryFields = mapWizardInjuryToPainFields(injury);
    const experienceMap = {
      beginner: '<6m',
      intermediate: '2-5y',
      advanced: '5y+'
    };
    const fallbackExperience = experienceMap[String(experience || '').trim().toLowerCase()] || '6-24m';
    const trainingFeel = mapWizardDisciplineToTrainingFeel(normalizedDiscipline);
    return {
      trainingFeel,
      discipline: normalizedDiscipline,
      primaryGoal: mapWizardPhaseToPrimaryGoal(goalMode || resolvedPhase),
      timeline: '8 weeks',
      focus: normalizedDiscipline === 'bodybuilding' ? 'Aesthetic' : 'Strength',
      experience: mapWizardTrainingAgeToExperience(trainingAgeBucket, fallbackExperience),
      location: mapWizardEquipmentAccessToLocation(equipmentAccess),
      trainingStyle: mapWizardEquipmentStyleToTrainingStyle(equipmentStylePref),
      outputStyle: 'RPE/RIR cues',
      closeToFailure: 'No',
      daysPerWeek: Number(daysPerWeek),
      sessionLengthMin: mapWizardSessionBucketToSessionLength(timePerSession),
      priorityGroups: mapWizardEmphasisToPriorityGroups(emphasis),
      movementsToAvoid: injuryFields.movementsToAvoid,
      preferredDays: resolvePreferredDaysForSubmit(daysPerWeek, preferredDays, unavailableDays),
      equipmentAccess: mapWizardEquipmentAccessToList(equipmentAccess),
      painAreas: injuryFields.painAreas,
      painProfilesByArea: injuryFields.painProfilesByArea,
      weightLb: Number(normalizedStrength.bodyweight || 0) || null,
      bodyweight: Number(normalizedStrength.bodyweight || 0) || null,
      bench: Number(normalizedStrength.bench || 0) || null,
      squat: Number(normalizedStrength.squat || 0) || null,
      deadlift: Number(normalizedStrength.deadlift || 0) || null,
      benchVariation: String(normalizedStrength.benchVariation || normalizedStrength.pressMovement || '').trim() || null,
      benchWeight: Number(normalizedStrength.benchWeight || normalizedStrength.pressWeight || 0) || null,
      benchReps: Number(normalizedStrength.benchReps || normalizedStrength.pressReps || 0) || null,
      lowerMovement: String(normalizedStrength.lowerMovement || normalizedStrength.legMovement || '').trim() || null,
      lowerWeight: Number(normalizedStrength.lowerWeight || normalizedStrength.legWeight || 0) || null,
      lowerReps: Number(normalizedStrength.lowerReps || normalizedStrength.legReps || 0) || null,
      hingeMovement: String(normalizedStrength.hingeMovement || '').trim() || null,
      hingeWeight: Number(normalizedStrength.hingeWeight || 0) || null,
      hingeReps: Number(normalizedStrength.hingeReps || 0) || null,
      sleepHours: 7,
      activityLevel: 'Active',
      stress: 'Medium',
      planSeed: Date.now()
    };
  }

  // Support deep-links like training.html?discipline=powerlifting
  try {
    const params = new URLSearchParams(window.location.search || '');
    const d = normalizeDiscipline(params.get('discipline') || params.get('d'));
    if (d) state.wizard.discipline = d;
  } catch {
    // ignore
  }

  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WEEKDAYS_SHORT = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
  const WEEKDAY_CODE_TO_INDEX = {
    su: 0, sun: 0, sunday: 0,
    m: 1, mo: 1, mon: 1, monday: 1,
    t: 2, tu: 2, tue: 2, tues: 2, tuesday: 2,
    w: 3, we: 3, wed: 3, wednesday: 3,
    th: 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
    f: 5, fr: 5, fri: 5, friday: 5,
    s: 6, sa: 6, sat: 6, saturday: 6
  };
  const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon -> Sun
  const UNAVAIL_DAYS_KEY = 'ode_training_unavailable_days_v1';
  const GUEST_PAYLOAD_KEY = 'ode_training_guest_payload_v1';
  const RESUME_STEP_KEY = 'ode_training_resume_step_v1';

  function clampWizardStep(input) {
    const n = Number(input);
    if (!Number.isFinite(n)) return null;
    return Math.max(1, Math.min(4, Math.floor(n)));
  }

  function readResumeStep() {
    try {
      return clampWizardStep(sessionStorage.getItem(RESUME_STEP_KEY));
    } catch {
      return null;
    }
  }

  function writeResumeStep(step) {
    const v = clampWizardStep(step);
    if (!v) return;
    try {
      sessionStorage.setItem(RESUME_STEP_KEY, String(v));
    } catch {
      // ignore
    }
  }

  function clearResumeStep() {
    try {
      sessionStorage.removeItem(RESUME_STEP_KEY);
    } catch {
      // ignore
    }
  }

  function getPendingResumeStep() {
    const inMemory = clampWizardStep(state.wizard?.pendingStep);
    if (inMemory) return inMemory;
    return readResumeStep();
  }

  function consumePendingResumeStep() {
    state.wizard.pendingStep = null;
    clearResumeStep();
  }

  function applyPendingResumeStepIfPossible() {
    if (!state.auth.user) return;
    if (state.view !== 'wizard') return;
    const pending = getPendingResumeStep();
    if (!pending) return;
    if (pending <= state.wizard.step) {
      consumePendingResumeStep();
      return;
    }
    consumePendingResumeStep();
    if (pending !== state.wizard.step) setWizard({ step: pending });
  }

  function normalizeWeekdayIndexList(input) {
    const raw = Array.isArray(input) ? input : [];
    const out = [];
    for (const x of raw) {
      const key = String(x || '').trim().toLowerCase();
      if (key && Object.prototype.hasOwnProperty.call(WEEKDAY_CODE_TO_INDEX, key)) {
        const idx = WEEKDAY_CODE_TO_INDEX[key];
        if (!out.includes(idx)) out.push(idx);
        continue;
      }
      const n = Number(x);
      if (!Number.isFinite(n)) continue;
      const i = Math.max(0, Math.min(6, Math.floor(n)));
      if (!out.includes(i)) out.push(i);
    }
    return out;
  }

  function readUnavailableDays() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UNAVAIL_DAYS_KEY) || '[]');
      return normalizeWeekdayIndexList(parsed);
    } catch {
      return [];
    }
  }

  // Initialize wizard preference from localStorage (best-effort).
  state.wizard.unavailableDays = readUnavailableDays();
  try {
    const guestPayload = JSON.parse(localStorage.getItem(GUEST_PAYLOAD_KEY) || 'null');
    if (guestPayload && typeof guestPayload === 'object') {
      const d = normalizeDiscipline(guestPayload.discipline);
      if (d) state.wizard.discipline = d;
      if (guestPayload.experience) state.wizard.experience = String(guestPayload.experience || '').trim() || state.wizard.experience;
      const dpw = Number(guestPayload.daysPerWeek);
      if (Number.isFinite(dpw)) state.wizard.daysPerWeek = dpw;
      if (guestPayload.unavailableDays) state.wizard.unavailableDays = normalizeWeekdayIndexList(guestPayload.unavailableDays);
      if (guestPayload.equipmentAccess && typeof guestPayload.equipmentAccess === 'object') state.wizard.equipmentAccess = guestPayload.equipmentAccess;
      if (guestPayload.strength && typeof guestPayload.strength === 'object') state.wizard.strength = guestPayload.strength;
      if (guestPayload.phase) state.wizard.phase = String(guestPayload.phase || '').trim() || state.wizard.phase;
      if (guestPayload.targetWeightLb != null) state.wizard.targetWeightLb = guestPayload.targetWeightLb;
      if (guestPayload.timePerSession) state.wizard.timePerSession = String(guestPayload.timePerSession || '').trim();
      if (guestPayload.trainingAgeBucket) state.wizard.trainingAgeBucket = String(guestPayload.trainingAgeBucket || '').trim();
      if (guestPayload.emphasis) state.wizard.emphasis = Array.isArray(guestPayload.emphasis) ? guestPayload.emphasis : state.wizard.emphasis;
      if (guestPayload.equipmentStylePref) state.wizard.equipmentStylePref = String(guestPayload.equipmentStylePref || '').trim();
      if (guestPayload.profile && typeof guestPayload.profile === 'object') state.wizard.profile = guestPayload.profile;
    }
  } catch {
    // ignore
  }

  function preferredWeekdayPattern(daysPerWeek) {
    // 0=Sun ... 6=Sat. Patterns emphasize weekdays when possible.
    const n = Number(daysPerWeek) || 0;
    if (n <= 0) return [];
    if (n === 1) return [1];
    if (n === 2) return [1, 4];
    if (n === 3) return [1, 3, 5];
    if (n === 4) return [1, 2, 4, 5];
    if (n === 5) return [1, 2, 3, 4, 5];
    if (n === 6) return [1, 2, 3, 4, 5, 6];
    return [0, 1, 2, 3, 4, 5, 6];
  }

  function buildTrainingSchedule(daysPerWeek, unavailableDays, preferredDays) {
    const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
    const unavailable = new Set(normalizeWeekdayIndexList(unavailableDays));
    const preferred = normalizeWeekdayIndexList(preferredDays).filter((d) => !unavailable.has(d));
    const available = [1, 2, 3, 4, 5, 6, 0].filter((d) => !unavailable.has(d));
    if (!n) return [];
    if (available.length < n) return [];

    const chosen = [];
    for (const d of preferred) {
      if (chosen.length >= n) break;
      if (!chosen.includes(d)) chosen.push(d);
    }
    const pattern = preferredWeekdayPattern(n);
    for (const d of pattern) {
      if (chosen.length >= n) break;
      if (!unavailable.has(d) && !chosen.includes(d)) chosen.push(d);
    }
    for (const d of available) {
      if (chosen.length >= n) break;
      if (!chosen.includes(d)) chosen.push(d);
    }
    const weekdayOrder = new Map([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [0, 6]]);
    chosen.sort((a, b) => (weekdayOrder.get(a) ?? 99) - (weekdayOrder.get(b) ?? 99));
    return chosen.slice(0, n);
  }

  function resolvePreferredDaysForSubmit(daysPerWeek, preferredDays, unavailableDays) {
    const explicit = normalizeWeekdayIndexList(preferredDays);
    const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
    if (explicit.length === n) return explicit.slice(0, n);
    return buildTrainingSchedule(daysPerWeek, unavailableDays, explicit);
  }

  function scheduleUnavailableDaysForDate(refDate = new Date()) {
    const plan = state.planRow?.plan;
    const schedule = plan?.meta?.schedule && typeof plan.meta.schedule === 'object' ? plan.meta.schedule : null;
    const planUnavailable = schedule?.unavailableDays ?? plan?.meta?.unavailableDays ?? null;
    const profileUnavailable = state.profile?.strength?.unavailableDays ?? null;
    const base = normalizeWeekdayIndexList(
      planUnavailable != null ? planUnavailable
        : profileUnavailable != null ? profileUnavailable
          : state.wizard.unavailableDays
    );
    const pending = schedule?.pendingChange && typeof schedule.pendingChange === 'object' ? schedule.pendingChange : null;
    if (pending?.effectiveDate) {
      const eff = parseISODateLocal(pending.effectiveDate);
      if (eff && dayStart(refDate).getTime() >= eff.getTime()) {
        return normalizeWeekdayIndexList(pending.unavailableDays);
      }
    }
    return base;
  }

  function schedulePreferredDays() {
    const plan = state.planRow?.plan;
    const schedule = plan?.meta?.schedule && typeof plan.meta.schedule === 'object' ? plan.meta.schedule : null;
    const planPreferred = schedule?.preferredDays ?? plan?.meta?.preferredDays ?? null;
    const profilePreferred = state.profile?.strength?.preferredDays ?? null;
    const intakePreferred = readLocalIntake()?.preferredDays ?? null;
    return normalizeWeekdayIndexList(
      planPreferred != null ? planPreferred
        : profilePreferred != null ? profilePreferred
          : intakePreferred != null ? intakePreferred
            : []
    );
  }

  function applyPendingScheduleIfDue(refDate = new Date()) {
    const plan = state.planRow?.plan;
    if (!plan) return false;
    const meta = plan.meta && typeof plan.meta === 'object' ? plan.meta : {};
    const schedule = meta.schedule && typeof meta.schedule === 'object' ? meta.schedule : null;
    const pending = schedule?.pendingChange && typeof schedule.pendingChange === 'object' ? schedule.pendingChange : null;
    if (!pending?.effectiveDate) return false;
    const eff = parseISODateLocal(pending.effectiveDate);
    if (!eff) return false;
    if (dayStart(refDate).getTime() < eff.getTime()) return false;
    const normalized = normalizeWeekdayIndexList(pending.unavailableDays);
    const fallback = normalizeWeekdayIndexList(schedule?.unavailableDays ?? meta.unavailableDays ?? state.wizard.unavailableDays);
    const nextSchedule = {
      ...(schedule || {}),
      unavailableDays: normalized.length ? normalized : fallback,
      pendingChange: null
    };
    plan.meta = { ...meta, schedule: nextSchedule };
    try {
      localStorage.setItem(UNAVAIL_DAYS_KEY, JSON.stringify(nextSchedule.unavailableDays || []));
    } catch {
      // ignore
    }
    return true;
  }

  function scheduleWeekdays(daysPerWeek, refDate = new Date()) {
    return buildTrainingSchedule(daysPerWeek, scheduleUnavailableDaysForDate(refDate), schedulePreferredDays());
  }

  function scheduledWeekdayLabel(dayIndex, daysPerWeek, refDate = new Date()) {
    const schedule = scheduleWeekdays(daysPerWeek, refDate);
    const idx = Number(dayIndex) - 1;
    if (!schedule.length || idx < 0 || idx >= schedule.length) return null;
    const wd = schedule[idx];
    return WEEKDAYS[wd] || null;
  }

  function dayStart(d) {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    return out;
  }

  function toISODateLocal(d) {
    const date = dayStart(d);
    const yy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function parseISODateLocal(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parts = raw.split('-').map((n) => Number(n));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const [yy, mm, dd] = parts;
    const out = new Date(yy, (mm || 1) - 1, dd || 1);
    return Number.isNaN(out.getTime()) ? null : out;
  }

  function normalizeTrainingSkipLogEntries(rawList) {
    const src = Array.isArray(rawList) ? rawList : [];
    const dedup = new Map();
    for (const item of src) {
      const rec = item && typeof item === 'object' ? item : {};
      const parsedDate = parseISODateLocal(rec.skipDate || rec.fromDate);
      if (!parsedDate) continue;
      const skipDate = toISODateLocal(parsedDate);
      const modeRaw = String(rec.mode || '').trim().toLowerCase();
      const mode = modeRaw === 'rest_skip' ? 'rest_skip' : 'workout_skip';
      dedup.set(skipDate, {
        skipDate,
        mode,
        reason: String(rec.reason || '').trim(),
        loggedAt: String(rec.loggedAt || rec.skippedAt || '').trim() || new Date().toISOString(),
        sourceDate: String(rec.sourceDate || '').trim() || null,
        retroactive: rec.retroactive === true
      });
    }
    return Array.from(dedup.values())
      .sort((a, b) => String(a.skipDate || '').localeCompare(String(b.skipDate || '')))
      .slice(-160);
  }

  function readTrainingSkipLog() {
    const readFrom = (storage) => {
      try {
        const raw = storage.getItem(TRAINING_SKIP_LOG_KEY);
        if (!raw) return [];
        return normalizeTrainingSkipLogEntries(JSON.parse(raw));
      } catch {
        return [];
      }
    };
    const local = readFrom(localStorage);
    if (local.length) return local;
    const session = readFrom(sessionStorage);
    if (!session.length) return [];
    try {
      localStorage.setItem(TRAINING_SKIP_LOG_KEY, JSON.stringify(session));
    } catch {
      // ignore storage failures
    }
    return session;
  }

  function writeTrainingSkipLog(entries) {
    const normalized = normalizeTrainingSkipLogEntries(entries);
    const text = JSON.stringify(normalized);
    try { localStorage.setItem(TRAINING_SKIP_LOG_KEY, text); } catch { /* ignore */ }
    try { sessionStorage.setItem(TRAINING_SKIP_LOG_KEY, text); } catch { /* ignore */ }
    return normalized;
  }

  // --- "Do another day" overrides -----------------------------------------
  // Map of doDate(ISO) -> { doDate, dayIndex, focus, reason, loggedAt }. Keeps
  // the last ~120 entries. Read/normalized defensively so a corrupt blob can't
  // brick the plan view.
  function normalizeDoOverrideEntries(rawList) {
    const src = Array.isArray(rawList) ? rawList : [];
    const dedup = new Map();
    for (const item of src) {
      const rec = item && typeof item === 'object' ? item : {};
      const parsedDate = parseISODateLocal(rec.doDate);
      const dayIndex = Number(rec.dayIndex);
      if (!parsedDate || !Number.isFinite(dayIndex) || dayIndex < 1) continue;
      const doDate = toISODateLocal(parsedDate);
      dedup.set(doDate, {
        doDate,
        dayIndex: Math.round(dayIndex),
        focus: String(rec.focus || '').trim().slice(0, 80),
        reason: String(rec.reason || '').trim().slice(0, 300),
        loggedAt: String(rec.loggedAt || '').trim() || new Date().toISOString()
      });
    }
    return Array.from(dedup.values())
      .sort((a, b) => String(a.doDate || '').localeCompare(String(b.doDate || '')))
      .slice(-120);
  }

  function readDoOverrideLog() {
    const readFrom = (storage) => {
      try {
        const raw = storage.getItem(TRAINING_DO_OVERRIDE_KEY);
        if (!raw) return [];
        return normalizeDoOverrideEntries(JSON.parse(raw));
      } catch { return []; }
    };
    const local = readFrom(localStorage);
    if (local.length) return local;
    return readFrom(sessionStorage);
  }

  function writeDoOverrideLog(entries) {
    const normalized = normalizeDoOverrideEntries(entries);
    const text = JSON.stringify(normalized);
    try { localStorage.setItem(TRAINING_DO_OVERRIDE_KEY, text); } catch { /* ignore */ }
    try { sessionStorage.setItem(TRAINING_DO_OVERRIDE_KEY, text); } catch { /* ignore */ }
    return normalized;
  }

  function planStartDate(plan) {
    const timestamps = [];
    const pushTimestamp = (raw) => {
      const text = String(raw || '').trim();
      if (!text) return;
      const ts = Date.parse(text);
      if (Number.isFinite(ts)) timestamps.push(ts);
    };

    pushTimestamp(plan?.meta?.startDate);
    pushTimestamp(plan?.meta?.createdAt);
    pushTimestamp(state.planRow?.created_at);
    pushTimestamp(state.planRow?.createdAt);

    if (Array.isArray(state.logs) && state.logs.length) {
      for (const row of state.logs) {
        pushTimestamp(row?.performed_at || row?.updated_at);
      }
    }

    if (timestamps.length) {
      return dayStart(new Date(Math.min(...timestamps)));
    }

    const weeks = Math.max(1, Array.isArray(plan?.weeks) ? plan.weeks.length : 1);
    const fallback = dayStart(new Date());
    fallback.setDate(fallback.getDate() - Math.max(0, (weeks * 7) - 1));
    return fallback;
  }

  function weekIndexForDate(date, plan) {
    const start = planStartDate(plan);
    const target = dayStart(date);
    const diffDays = Math.floor((target.getTime() - start.getTime()) / 86400000);
    const idx = Math.floor(Math.max(0, diffDays) / 7) + 1;
    const maxWeeks = Array.isArray(plan?.weeks) ? plan.weeks.length : 1;
    return Math.max(1, Math.min(maxWeeks, idx));
  }

  // Double-progression for manual "system" workouts (built in the workout
  // builder). Reps climb +1 each calendar week from the starting reps for
  // SYS_PROG_REP_STEPS weeks; then weight goes up one step and reps reset.
  // Returns the target for `date`, or null when the exercise isn't on system
  // progression. This is the "takes it from there" logic — it advances purely
  // by weeks elapsed since the plan started, no manual bookkeeping.
  const SYS_PROG_REP_STEPS = 4;     // weeks of rep climb before a weight bump
  const SYS_PROG_WEIGHT_STEP = 5;   // lb added when reps reset
  function systemProgressionTarget(ex, date, plan) {
    const prog = ex && ex.progression;
    if (!prog || prog.mode !== 'system') return null;
    const startReps = Number(prog.startReps);
    if (!Number.isFinite(startReps) || startReps <= 0) return null;
    const hasWeight = Number.isFinite(Number(prog.startWeight));
    const startWeight = hasWeight ? Number(prog.startWeight) : null;
    const start = planStartDate(plan);
    const diffDays = Math.floor((dayStart(date).getTime() - start.getTime()) / 86400000);
    const block = Math.max(0, Math.floor(diffDays / 7)); // whole weeks elapsed
    const weightBumps = Math.floor(block / SYS_PROG_REP_STEPS);
    const repAdd = block % SYS_PROG_REP_STEPS;
    return {
      reps: startReps + repAdd,
      hasWeight,
      weight: hasWeight ? startWeight + weightBumps * SYS_PROG_WEIGHT_STEP : null,
      week: block + 1,
      justReset: repAdd === 0 && block > 0
    };
  }

  function dateForWeekday(weekIndex, weekday, plan) {
    const start = planStartDate(plan);
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + (Math.max(1, weekIndex) - 1) * 7);
    const startWeekday = weekStart.getDay();
    const offset = (weekday - startWeekday + 7) % 7;
    weekStart.setDate(weekStart.getDate() + offset);
    return dayStart(weekStart);
  }

  function getActivePhotoDataUrl() {
    const wizardPhoto = state.wizard?.profileImage?.dataUrl;
    if (wizardPhoto) return wizardPhoto;
    const profilePhoto = state.profile?.profile_image;
    if (profilePhoto) return profilePhoto;
    return null;
  }

  const PROFILE_PLACEHOLDER = 'assets/images/placeholders/profile-placeholder.jpg';

  function fmtDateShort(raw) {
    const s = String(raw || '').trim();
    if (!s) return '—';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s.slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  function formatDateDMY(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear());
    return `${dd}/${mm}/${yy}`;
  }

  function nextScheduledDate(fromDate, direction, daysPerWeek) {
    const next = new Date(fromDate);
    for (let i = 0; i < 14; i += 1) {
      next.setDate(next.getDate() + direction);
      const schedule = buildTrainingSchedule(daysPerWeek, scheduleUnavailableDaysForDate(next), schedulePreferredDays());
      if (schedule.includes(next.getDay())) return next;
    }
    return fromDate;
  }

  function calcSidebarMetrics() {
    const plan = state.planRow?.plan;
    const weeks = Array.isArray(plan?.weeks) ? plan.weeks.length : 0;
    const daysPerWeek = Number(plan?.meta?.daysPerWeek) || Number(state.wizard.daysPerWeek) || 0;
    const totalSlots = weeks && daysPerWeek ? weeks * daysPerWeek : null;
    const saved = Array.isArray(state.logs) ? state.logs.length : 0;
    const last = Array.isArray(state.logs) && state.logs.length
      ? state.logs.reduce((acc, row) => {
        const t = new Date(row?.updated_at || row?.performed_at || 0).getTime();
        return t > acc ? t : acc;
      }, 0)
      : 0;
    const completionPct = totalSlots ? Math.min(100, Math.round((saved / totalSlots) * 100)) : 0;
    return {
      saved,
      totalSlots,
      completionPct,
      lastUpdated: last ? fmtDateShort(new Date(last).toISOString()) : '—'
    };
  }

  function sparklinePoints(values, w = 260, h = 70, pad = 8) {
    const vals = (values || []).map((v) => Number(v) || 0);
    const max = Math.max(1, ...vals);
    const min = Math.min(0, ...vals);
    const span = Math.max(1, max - min);
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const step = vals.length > 1 ? innerW / (vals.length - 1) : innerW;
    return vals.map((v, i) => {
      const x = pad + i * step;
      const y = pad + innerH - ((v - min) / span) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function weeklySavedCounts(maxWeeks = 4) {
    const logs = Array.isArray(state.logs) ? state.logs : [];
    const counts = new Array(maxWeeks).fill(0);
    for (const row of logs) {
      const wi = Number(row?.week_index);
      if (!Number.isFinite(wi) || wi <= 0) continue;
      if (wi > maxWeeks) continue;
      counts[wi - 1] += 1;
    }
    return counts;
  }

  let autoFormFieldSeq = 0;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs && typeof attrs === 'object') {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'class') node.className = String(v);
        else if (k === 'dataset') {
          for (const [dk, dv] of Object.entries(v || {})) node.dataset[dk] = String(dv);
        } else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2), v);
        } else if (k === 'html') {
          node.innerHTML = String(v);
        } else {
          node.setAttribute(k, String(v));
        }
      }
    }
    const tagLower = String(tag || '').toLowerCase();
    if (tagLower === 'input' || tagLower === 'select' || tagLower === 'textarea') {
      const type = tagLower === 'input' ? String(node.getAttribute('type') || '').toLowerCase() : '';
      if (type !== 'hidden') {
        if (!node.id) {
          autoFormFieldSeq += 1;
          node.id = `training-field-${autoFormFieldSeq}`;
        }
        if (!node.getAttribute('name')) {
          node.setAttribute('name', node.id);
        }
      }
    }
    for (const child of children) {
      if (child == null) continue;
      if (Array.isArray(child)) node.append(...child);
      else if (child instanceof Node) node.appendChild(child);
      else node.appendChild(document.createTextNode(String(child)));
    }
    return node;
  }

  function fmtRest(sec) {
    const s = Number(sec);
    if (!Number.isFinite(s) || s <= 0) return '—';
    if (s < 60) return `${s}s`;
    const m = Math.round(s / 60);
    return `${m}m`;
  }

  function fmtProjected(proj) {
    if (!proj || typeof proj !== 'object') return '—';
    if (proj.unit === 'bw') return 'BW';
    if (Number.isFinite(proj.value)) return `${proj.value} lb`;
    return '—';
  }

  function firstWordName(value = '') {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.split(/\s+/).filter(Boolean)[0] || '';
  }

  function targetWeightTextToken(value) {
    return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  }

  function isLowerBodyTargetExercise(ex) {
    const movement = targetWeightTextToken(ex?.movementPattern);
    if (movement === 'squat' || movement === 'hinge' || movement === 'lower') return true;

    const tags = [
      ex?.bodyPart,
      ex?.muscle_group,
      ex?.muscleGroup,
      ex?.muscle,
      ex?.primaryMuscleGroup,
      ex?.subMuscleGroup,
      ex?.category,
      ...(Array.isArray(ex?.muscleKeys) ? ex.muscleKeys : []),
      ...(Array.isArray(ex?.primaryMuscles) ? ex.primaryMuscles : []),
      ...(Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles : [])
    ].map(targetWeightTextToken).filter(Boolean);

    if (tags.some((tag) => (
      tag === 'legs'
      || tag === 'lower'
      || tag.includes('leg')
      || tag.includes('lower body')
      || tag.includes('quad')
      || tag.includes('hamstring')
      || tag.includes('glute')
      || tag.includes('calf')
      || tag.includes('adductor')
      || tag.includes('abductor')
    ))) {
      return true;
    }

    const name = targetWeightTextToken(ex?.displayName || ex?.name);
    return /(squat|deadlift|rdl|romanian deadlift|leg press|lunge|split squat|bulgarian|hip thrust|leg curl|ham curl|leg extension|calf raise|hack squat|good morning|step up)/.test(name);
  }

  function resolveTargetWeightIncrement(ex) {
    return isLowerBodyTargetExercise(ex) ? 10 : 5;
  }

  function resolvePreviousProjectedWeight(options = {}) {
    const candidates = [
      Number(options.previousEntry?.prescribed?.projectedWeight),
      Number(options.previousEntry?.projectedWeight),
      Number(options.lastPerformance?.prescribed?.projectedWeight),
      Number(options.lastPerformance?.projectedWeight)
    ];
    for (const value of candidates) {
      if (Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
    }
    return null;
  }

  function buildTargetWeightPerformanceCandidate(raw, { projectedWeight = null } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const perf = (Array.isArray(raw?.sets) || (raw?.actual && typeof raw.actual === 'object'))
      ? extractWorkoutEntryPerformance(raw)
      : normalizeLiftPerformance(raw);
    const weight = Number(perf?.weight);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    return {
      ...perf,
      performedAt: perf?.performedAt || (raw?.performedAt ? String(raw.performedAt).slice(0, 10) : null),
      projectedWeight: Number.isFinite(Number(projectedWeight)) && Number(projectedWeight) > 0
        ? Math.round(Number(projectedWeight) * 100) / 100
        : null
    };
  }

  function pickBestTargetWeightCandidate(candidates, { excludePerformedAt = '' } = {}) {
    const blockedDate = excludePerformedAt ? String(excludePerformedAt).slice(0, 10) : '';
    const valid = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
      const weight = Number(candidate?.weight);
      if (!Number.isFinite(weight) || weight <= 0) return false;
      if (blockedDate && candidate?.performedAt && String(candidate.performedAt).slice(0, 10) === blockedDate) return false;
      return true;
    });
    if (!valid.length) return null;
    const dated = valid
      .map((candidate, index) => ({
        candidate,
        index,
        stamp: candidate?.performedAt ? Date.parse(`${String(candidate.performedAt).slice(0, 10)}T00:00:00Z`) : NaN
      }))
      .filter((entry) => Number.isFinite(entry.stamp));
    if (dated.length) {
      dated.sort((a, b) => (b.stamp - a.stamp) || (a.index - b.index));
      return dated[0].candidate;
    }
    return valid[0];
  }

  function normalizeTargetWeightPerformance(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (Array.isArray(raw?.sets) || (raw?.actual && typeof raw.actual === 'object')) {
      return extractWorkoutEntryPerformance(raw);
    }
    return normalizeLiftPerformance(raw);
  }

  function resolveTargetSeedForExercise(ex, options = {}) {
    const persistentLift = options.persistentLift || pickLiftHistoryRecord(state.liftHistory, {
      baseId: ex?.baseId,
      exerciseId: ex?.exerciseId || ex?.id,
      exerciseName: ex?.displayName || ex?.name
    });
    return pickBestTargetWeightCandidate([
      buildTargetWeightPerformanceCandidate(options.lastPerformance, {
        projectedWeight: resolvePreviousProjectedWeight({ lastPerformance: options.lastPerformance })
      }),
      buildTargetWeightPerformanceCandidate(options.previousEntry, {
        projectedWeight: resolvePreviousProjectedWeight({ previousEntry: options.previousEntry })
      }),
      buildTargetWeightPerformanceCandidate(options.historicalPerformance),
      buildTargetWeightPerformanceCandidate(options.crossPlanPerformance),
      buildTargetWeightPerformanceCandidate(persistentLift?.last)
    ], {
      excludePerformedAt: options.currentPerformedAt
    });
  }

  function roundTo(value, inc) {
    const n = Number(value);
    const step = Number(inc) || 1;
    if (!Number.isFinite(n) || !Number.isFinite(step) || step <= 0) return null;
    return Math.round(n / step) * step;
  }

  function fallbackBaselinesFromBodyweight(exp, bodyweight) {
    const bw = Number(bodyweight);
    if (!Number.isFinite(bw) || bw <= 0) return null;
    const tier = String(exp || '').toLowerCase();
    const ratios = tier === 'advanced'
      ? { press: 0.8, leg: 1.3, hinge: 1.6, pull: 0.75 }
      : tier === 'intermediate'
        ? { press: 0.65, leg: 1.05, hinge: 1.25, pull: 0.6 }
        : { press: 0.5, leg: 0.85, hinge: 1.0, pull: 0.5 };
    return {
      press1rm: roundTo(bw * ratios.press, 5),
      leg1rm: roundTo(bw * ratios.leg, 5),
      hinge1rm: roundTo(bw * ratios.hinge, 5),
      pull1rm: roundTo(bw * ratios.pull, 5)
    };
  }

  function safeDefaultProjected(ex) {
    const eqClass = String(ex?.equipmentClass || '').toLowerCase();
    if (eqClass === 'bodyweight') return { value: null, unit: 'bw' };
    const stimulus = String(ex?.stimulusType || '').toLowerCase();
    const movement = String(ex?.movementPattern || '').toLowerCase();
    const name = String(ex?.displayName || ex?.name || '').toLowerCase();
    const isLower = movement === 'squat'
      || movement === 'hinge'
      || /(squat|lunge|split squat|deadlift|rdl|hip thrust|leg press)/.test(name);
    const isPress = movement === 'press'
      || movement === 'ohp'
      || /(press|bench|incline|overhead)/.test(name);
    const isPull = movement === 'row'
      || movement === 'vertical_pull'
      || /(row|pull|pulldown|lat)/.test(name);
    const isIso = stimulus === 'isolation';

    let base = null;
    if (eqClass === 'barbell') base = isLower ? 95 : isPress ? 65 : isPull ? 85 : isIso ? 35 : 75;
    else if (eqClass === 'dumbbell') base = isLower ? 50 : isPress ? 30 : isPull ? 35 : isIso ? 15 : 25;
    else if (eqClass === 'machine') base = isLower ? 80 : isPress ? 60 : isPull ? 70 : isIso ? 40 : 50;
    else if (eqClass === 'cable') base = isLower ? 60 : isPress ? 40 : isPull ? 55 : isIso ? 30 : 40;
    else base = isLower ? 70 : isPress ? 45 : isPull ? 55 : isIso ? 25 : 40;

    const inc = isLower ? 5 : 2.5;
    const value = roundTo(base, inc);
    return { value: Number.isFinite(value) ? value : null, unit: 'lb' };
  }

  function resolveProjectedForExercise(ex, plan, options = {}) {
    const eqClass = String(ex?.equipmentClass || '').toLowerCase();
    const targetSeed = resolveTargetSeedForExercise(ex, options);
    if (eqClass !== 'bodyweight' && Number.isFinite(Number(targetSeed?.weight))) {
      const increment = resolveTargetWeightIncrement(ex);
      const previousProjectedWeight = Number(targetSeed?.projectedWeight);
      if (Number.isFinite(previousProjectedWeight) && previousProjectedWeight > 0 && Number(targetSeed.weight) < previousProjectedWeight) {
        const regressedWeight = Math.max(increment, previousProjectedWeight - increment);
        return { value: Math.round(regressedWeight * 100) / 100, unit: 'lb' };
      }
      const nextWeight = Math.round((Number(targetSeed.weight) + increment) * 100) / 100;
      return { value: nextWeight, unit: 'lb' };
    }
    if (ex?.projected && typeof ex.projected === 'object') {
      if (ex.projected.unit === 'bw') return ex.projected;
      if (Number.isFinite(ex.projected.value)) return ex.projected;
    }
    if (Number.isFinite(ex?.projectedWeight)) return { value: ex.projectedWeight, unit: 'lb' };
    const baselines = plan?.baselines && typeof plan.baselines === 'object' ? plan.baselines : {};
    const exp = plan?.meta?.experience || '';
    const fallback = fallbackBaselinesFromBodyweight(exp, baselines?.bodyweight);
    if (eqClass === 'bodyweight') return { value: null, unit: 'bw' };
    const tm = baselines?.trainingMax || {};
    const baseId = String(ex?.baseId || '');
    if (baseId) {
      const tmVal = baseId.includes('squat') ? tm.squat
        : baseId.includes('dead') ? tm.deadlift
          : baseId.includes('bench') ? tm.bench
            : null;
      if (Number.isFinite(tmVal)) {
        const est = roundTo(tmVal * 0.7, baseId.includes('bench') ? 2.5 : 5);
        return { value: est, unit: 'lb' };
      }
    }
    const ww = baselines?.workingWeights || {};
    const movement = String(ex?.movementPattern || '').toLowerCase();
    const stimulus = String(ex?.stimulusType || '').toLowerCase();
    const muscleKeys = Array.isArray(ex?.muscleKeys) ? ex.muscleKeys : [];
    let base = null;
    let inc = 2.5;
    if (movement === 'squat') { base = ww.lower; inc = 5; }
    else if (movement === 'hinge') { base = ww.hinge; inc = 5; }
    else if (movement === 'row' || movement === 'vertical_pull') { base = ww.pull; }
    else if (muscleKeys.some((m) => ['quads', 'hamstrings', 'glutes', 'calves'].includes(m))) { base = ww.lower || ww.hinge; inc = 5; }
    else { base = ww.press || ww.pull; }

    if (!Number.isFinite(base) && Number.isFinite(baselines.press1rm)) base = baselines.press1rm * 0.7;
    if (!Number.isFinite(base) && Number.isFinite(baselines.pull1rm)) base = baselines.pull1rm * 0.7;
    if (!Number.isFinite(base) && Number.isFinite(baselines.leg1rm)) { base = baselines.leg1rm * 0.7; inc = 5; }
    if (!Number.isFinite(base) && Number.isFinite(baselines.hinge1rm)) { base = baselines.hinge1rm * 0.7; inc = 5; }
    if (!Number.isFinite(base) && fallback) {
      if (movement === 'squat' || muscleKeys.some((m) => ['quads', 'hamstrings', 'glutes', 'calves'].includes(m))) {
        base = fallback.leg1rm * 0.7;
        inc = 5;
      } else if (movement === 'hinge') {
        base = fallback.hinge1rm * 0.7;
        inc = 5;
      } else if (movement === 'row' || movement === 'vertical_pull') {
        base = fallback.pull1rm * 0.7;
      } else {
        base = fallback.press1rm * 0.7;
      }
    }

    if (!Number.isFinite(base)) return safeDefaultProjected(ex);
    const ratio = stimulus === 'isolation' ? 0.5 : 0.6;
    const est = roundTo(base * ratio, inc);
    return { value: Number.isFinite(est) ? est : null, unit: 'lb' };
  }

  function formatProjectionModeLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'On track';
    return raw.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function buildProgressionProjectionCard(plan, activeWeek) {
    const projection = plan?.meta?.progressionProjection;
    if (!projection || typeof projection !== 'object') return null;
    const previewWeek = Math.max(1, Math.min(16, Number(state.projectionPreviewWeek || activeWeek || 1)));
    const weekRows = (Array.isArray(projection.weeklyTable) ? projection.weeklyTable : [])
      .filter((row) => Number(row?.week) === previewWeek)
      .slice(0, 10);
    const summaryRows = (Array.isArray(projection.exerciseSummaries) ? projection.exerciseSummaries : []).slice(0, 6);
    const anchors = projection.anchorInputs || {};
    const deloadWeeks = Array.isArray(projection.deloadWeeks) ? projection.deloadWeeks : [];
    const previewIsDeload = deloadWeeks.includes(previewWeek);
    const classificationConfidence = formatProjectionModeLabel(projection.classificationConfidence || 'low');
    const classificationReason = String(projection.classificationReason || 'Anchor confidence is limited, so projections stay conservative.');
    return el('div', { class: 'training-subcard training-projection-card' },
      el('div', { class: 'training-projection-head' },
        el('div', null,
          el('div', { class: 'training-projection-eyebrow' }, '16-Week Load Projection'),
          el('div', { class: 'training-projection-title' }, previewIsDeload ? 'Recovery week with a planned return target' : 'Rep ladder: +1 rep/week, +5 lb every 4 weeks'),
          el('div', { class: 'training-muted' }, `Bench ${anchors.inputBench || anchors.bench1rm || 'N/A'} • Squat ${anchors.inputSquat || anchors.squat1rm || 'N/A'} • Deadlift ${anchors.inputDeadlift || anchors.deadlift1rm || 'N/A'}`),
          el('div', { class: 'training-projection-submeta' },
            el('span', { class: 'projected-pill' }, `Anchor source ${formatProjectionModeLabel(anchors.anchorSource || 'unknown')}`),
            el('span', { class: 'projected-pill' }, `Status ${formatProjectionModeLabel(projection.modeledAs)}`),
            el('span', { class: 'projected-pill' }, `Confidence ${classificationConfidence}`)
          ),
          el('div', { class: 'training-muted', style: 'margin-top:0.45rem' }, classificationReason)
        ),
        el('div', { class: 'training-projection-statuses' },
          previewIsDeload
            ? el('span', { class: 'projected-pill is-deload' }, `Deload Week ${previewWeek}`)
            : el('span', { class: 'projected-pill' }, `Week ${previewWeek} progression`),
          ...deloadWeeks.map((week) => el('button', {
            type: 'button',
            class: `projected-pill is-deload ${previewWeek === Number(week) ? 'is-active' : ''}`.trim(),
            onclick: () => {
              state.projectionPreviewWeek = Number(week);
              render();
            }
          }, `Deload ${week}`))
        )
      ),
      el('div', { class: 'training-projection-week-strip' },
        ...Array.from({ length: 16 }).map((_, idx) => {
          const week = idx + 1;
          const isDeload = deloadWeeks.includes(week);
          return el('button', {
            type: 'button',
            class: `training-projection-week-chip ${previewWeek === week ? 'is-active' : ''} ${isDeload ? 'is-deload' : ''}`.trim(),
            onclick: () => {
              state.projectionPreviewWeek = week;
              render();
            }
          }, `W${week}`);
        })
      ),
      el('div', { class: 'training-projection-grid' },
        el('div', { class: 'training-projection-panel' },
          el('div', { class: 'training-projection-panel-title' }, 'Week Snapshot'),
          previewIsDeload
            ? el('div', { class: 'training-projection-banner is-deload' }, 'Reduced-fatigue week: lower targets are intentional. Return targets show where normal loading resumes.')
            : el('div', { class: 'training-projection-banner' }, 'Normal week: build reps first, then move load once all work sets own the top of the range.'),
          el('div', { class: 'training-projection-table-wrap' },
            el('table', { class: 'training-projection-table' },
              el('thead', null,
                el('tr', null,
                  el('th', null, 'Week'),
                  el('th', null, 'Exercise'),
                  el('th', null, 'Target'),
                  el('th', null, 'Reps'),
                  el('th', null, 'Sets'),
                  el('th', null, 'Tag'),
                  el('th', null, 'Note')
                )
              ),
              el('tbody', null,
                ...(weekRows.length
                  ? weekRows.map((row) => el('tr', null,
                    el('td', null, String(row.week)),
                    el('td', null, String(row.exercise || 'Exercise')),
                    el('td', null, String(row.displayTarget || fmtProjected(Number.isFinite(Number(row.targetLoad)) ? { value: Number(row.targetLoad), unit: 'lb' } : { value: null, unit: row?.tag === 'normal' ? 'lb' : 'bw' }))),
                    el('td', null, String(row.repRange || '')),
                    el('td', null, String(row.sets || '')),
                    el('td', null, String(row.deloadLabel || formatProjectionModeLabel(row.tag || 'normal'))),
                    el('td', null, String(row.postDeloadReturnTarget ? `${row.note || ''} Return target: ${row.postDeloadReturnTarget}`.trim() : row.note || ''))
                  ))
                  : [el('tr', null, el('td', { colspan: '7' }, 'No projection rows available for this week.'))])
              )
            )
          )
        ),
        el('div', { class: 'training-projection-panel' },
          el('div', { class: 'training-projection-panel-title' }, 'Week 1 / 8 / 16 Load Path'),
          el('div', { class: 'training-projection-summary-list' },
            ...summaryRows.map((entry) => el('div', { class: 'training-projection-summary-item' },
              el('div', { class: 'training-projection-summary-name' }, String(entry.exercise || 'Exercise')),
              el('div', { class: 'training-projection-summary-meta' }, `${String(entry.family || 'general').replace(/_/g, ' ')} • ${String(entry.repRange || '')} • ${entry.sets || 0} sets`),
              el('div', { class: 'training-projection-summary-values' },
                el('span', null, `W1 ${entry.progressionMode === 'external_load' || entry.progressionMode === 'loaded_bodyweight' ? fmtProjected(Number.isFinite(Number(entry.week1Load)) ? { value: Number(entry.week1Load), unit: 'lb' } : { value: null, unit: entry.loadUnitNote === 'bodyweight' ? 'bw' : 'lb' }) : String(entry.repRange || 'Bodyweight progression')}`),
                el('span', null, `W8 ${entry.progressionMode === 'external_load' || entry.progressionMode === 'loaded_bodyweight' ? fmtProjected(Number.isFinite(Number(entry.week8Load)) ? { value: Number(entry.week8Load), unit: 'lb' } : { value: null, unit: entry.loadUnitNote === 'bodyweight' ? 'bw' : 'lb' }) : 'Rep / tempo progression'}`),
                el('span', null, `W16 ${entry.progressionMode === 'external_load' || entry.progressionMode === 'loaded_bodyweight' ? fmtProjected(Number.isFinite(Number(entry.week16Load)) ? { value: Number(entry.week16Load), unit: 'lb' } : { value: null, unit: entry.loadUnitNote === 'bodyweight' ? 'bw' : 'lb' }) : 'Advanced progression state'}`)
              )
            ))
          )
        )
      )
    );
  }

  function parseRepsTarget(reps) {
    const s = String(reps || '').trim();
    const range = s.match(/(\\d+)\\s*-\\s*(\\d+)/);
    if (range) {
      const hi = Number(range[2]);
      return Number.isFinite(hi) ? hi : null;
    }
    const m = s.match(/(\\d+)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function parseRepWindow(reps) {
    const s = String(reps || '').trim();
    const range = s.match(/(\d+)\s*-\s*(\d+)/);
    if (range) return { min: Number(range[1]), max: Number(range[2]) };
    const n = s.match(/(\d+)/);
    const value = n ? Number(n[1]) : 10;
    return { min: value, max: value };
  }

  function projectionRowForExercise(plan, ex, week) {
    const rows = Array.isArray(plan?.meta?.progressionProjection?.weeklyTable) ? plan.meta.progressionProjection.weeklyTable : [];
    return rows.find((row) => Number(row?.week) === Number(week) && String(row?.canonicalExerciseId || '') === String(ex?.canonicalExerciseId || '')) || null;
  }

  function summarizeEntrySetsForDecision(entry, prescribedSets = 0) {
    const sets = Array.isArray(entry?.sets) ? entry.sets : [];
    const completed = sets
      .map((set) => ({ weight: Number(set?.weight || 0), reps: Number(set?.reps || 0) }))
      .filter((set) => Number.isFinite(set.reps) && set.reps > 0);
    const considered = prescribedSets > 0 ? completed.slice(0, prescribedSets) : completed;
    const reps = considered.map((set) => set.reps).filter((value) => Number.isFinite(value) && value > 0);
    const weights = considered.map((set) => set.weight).filter((value) => Number.isFinite(value) && value > 0);
    return {
      completedSets: considered.length,
      minReps: reps.length ? Math.min(...reps) : null,
      maxReps: reps.length ? Math.max(...reps) : null,
      avgReps: reps.length ? Math.round((reps.reduce((sum, value) => sum + value, 0) / reps.length) * 10) / 10 : null,
      topWeight: weights.length ? Math.max(...weights) : null
    };
  }

  function buildHistorySnapshot(entry, prescribedSets = 0) {
    if (!entry || typeof entry !== 'object') return null;
    return summarizeEntrySetsForDecision(entry, prescribedSets);
  }

  function familyTrendLabel(adjustment = 1) {
    const value = Number(adjustment || 1);
    if (value >= 1.06) return 'Above projection';
    if (value <= 0.94) return 'Below projection';
    return 'On track';
  }

  function bodyweightRecommendationText(mode, direction, currentRow) {
    const range = parseRepWindow(currentRow?.repRange);
    if (mode === 'bodyweight_tempo_progression') {
      if (direction === 'increase') return 'Add 5-10s or slow the lowering phase';
      if (direction === 'decrease') return 'Shorten hold slightly and clean up control';
      if (direction === 'deload' || direction === 'continue_deload') return 'Use a shorter hold / easier tempo this week';
      return 'Repeat the same tempo target';
    }
    if (mode === 'assisted_bodyweight') {
      if (direction === 'increase') return 'Use slightly less assistance';
      if (direction === 'decrease') return 'Use slightly more assistance';
      if (direction === 'deload' || direction === 'continue_deload') return 'Use more assistance for recovery';
      return `${range.min}-${range.max} reps`;
    }
    if (direction === 'increase') return `${range.min + 1}-${range.max + 1} reps`;
    if (direction === 'decrease') return `${Math.max(1, range.min - 2)}-${Math.max(range.min, range.max - 2)} reps`;
    if (direction === 'deload' || direction === 'continue_deload') return `${Math.max(1, range.min - 2)}-${Math.max(range.min, range.max - 1)} easy reps`;
    return `${range.min}-${range.max} reps`;
  }

  function decisionMovementFamilyForName(name = '', fallbackFamily = '') {
    const n = normalizeName(name);
    if (!n) return String(fallbackFamily || 'general');
    if (/(bench press|incline .*press|incline .*bench|chest press|machine chest press|cable chest press|leverage chest press|dumbbell press)/.test(n)) return 'chest_press';
    if (/(shoulder press|overhead press|military press)/.test(n)) return 'shoulder_press';
    if (/(chest supported|incline row|seal row|dumbbell row|cable row|machine row|\brow\b)/.test(n)) return 'horizontal_pull';
    if (/(pulldown|pull down|pull up|chin up|lat pull)/.test(n)) return 'vertical_pull';
    if (/(front squat|hack squat|leg press|goblet squat|back squat|\bsquat\b)/.test(n)) return 'squat_pattern';
    if (/(romanian deadlift|\brdl\b|hip thrust|glute bridge|pull through|deadlift)/.test(n)) return 'hinge_pattern';
    if (/(hammer curl|preacher curl|incline curl|\bcurl\b)/.test(n) && !/(leg curl|hamstring curl)/.test(n)) return 'biceps_iso';
    if (/(pushdown|pressdown|skull crusher|triceps|extension)/.test(n) && !/(leg extension|neck extension|back extension)/.test(n)) return 'triceps_iso';
    if (/\bcalf\b/.test(n)) return 'calves';
    if (/(pallof|rotation|wood chop|oblique|side bend)/.test(n)) return 'core_rotation';
    if (/(plank|dead bug|vacuum|fallout|anti extension)/.test(n)) return 'core_stability';
    if (/(crunch|reverse crunch|leg raise|ab wheel|rollout)/.test(n)) return 'core_flexion';
    return String(fallbackFamily || 'general');
  }

  function normalizeName(name = '') {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function decisionVariantGroupForName(name = '', fallbackFamily = '') {
    const n = normalizeName(name);
    const family = decisionMovementFamilyForName(n, fallbackFamily);
    if (!n) return family;
    if (/(barbell bench press|bench press medium grip|barbell bench press medium grip|medium grip barbell bench press)/.test(n)) return 'barbell_bench_press';
    if (/(cable chest press|standing cable chest press)/.test(n)) return 'cable_chest_press';
    if (/(barbell shoulder press|seated military press|seated barbell military press)/.test(n)) return 'barbell_shoulder_press';
    if (/(chest supported dumbbell row|dumbbell incline row)/.test(n)) return 'chest_supported_dumbbell_row';
    if (/(machine chest press|leverage chest press)/.test(n)) return 'machine_chest_press';
    if (/(back squat|back squat volume|front squat)/.test(n)) return 'barbell_squat_variant';
    if (/(hack squat|barbell hack squat)/.test(n)) return 'hack_squat_variant';
    return family;
  }

  function isExplicitDecisionVariantGroup(variantGroup, family) {
    return Boolean(variantGroup) && String(variantGroup) !== String(family || '');
  }

  function isCloseDecisionVariantPair(sourceExerciseName = '', candidateExerciseName = '', family = '') {
    const sourceName = String(sourceExerciseName || '').trim();
    const candidateName = String(candidateExerciseName || '').trim();
    if (!sourceName || !candidateName) return false;
    if (normalizeName(sourceName) === normalizeName(candidateName)) return false;
    const sourceFamily = decisionMovementFamilyForName(sourceName, family);
    const candidateFamily = decisionMovementFamilyForName(candidateName, family);
    if (sourceFamily !== candidateFamily) return false;
    const sourceGroup = decisionVariantGroupForName(sourceName, sourceFamily);
    const candidateGroup = decisionVariantGroupForName(candidateName, candidateFamily);
    if (!isExplicitDecisionVariantGroup(sourceGroup, sourceFamily)) return false;
    return sourceGroup === candidateGroup;
  }

  function safeDecisionSourceExerciseLabel(decisionSource, decisionSourceExercise, fallbackFamily = '') {
    const label = String(decisionSourceExercise || '').trim();
    if (label && label.toLowerCase() !== 'undefined') return label;
    if (String(decisionSource || '') === 'anchor_fallback') {
      return fallbackFamily === 'bodyweight' ? 'Bodyweight progression' : 'Anchor fallback';
    }
    if (String(decisionSource || '') === 'movement_family') return 'Movement-family fallback';
    if (String(decisionSource || '') === 'close_variant') return 'Close variant fallback';
    return 'No direct logged exercise available';
  }

  function normalizeDecisionSourceRecord(record = {}, fallbackFamily = '') {
    const name = String(record?.exerciseName || record?.displayName || record?.name || '').trim();
    const family = String(record?.projectionFamily || decisionMovementFamilyForName(name, fallbackFamily) || fallbackFamily || 'general');
    return {
      ...record,
      exerciseName: name || 'Unknown exercise',
      canonicalExerciseId: String(record?.canonicalExerciseId || record?.exerciseId || record?.id || '').trim(),
      projectionFamily: family,
      variantGroup: String(record?.variantGroup || decisionVariantGroupForName(name, family) || family)
    };
  }

  function collectUniqueDecisionRecords(...sources) {
    const seen = new Set();
    const out = [];
    sources.flat().forEach((source) => {
      if (!source) return;
      if (source instanceof Map) {
        source.forEach((record) => {
          const key = String(record?.exerciseKey || record?.exerciseId || record?.baseId || record?.exerciseName || record?.name || '');
          if (!key || seen.has(key)) return;
          seen.add(key);
          out.push(record);
        });
        return;
      }
      if (Array.isArray(source)) {
        source.forEach((record) => {
          const key = String(record?.exerciseKey || record?.exerciseId || record?.baseId || record?.exerciseName || record?.name || '');
          if (!key || seen.has(key)) return;
          seen.add(key);
          out.push(record);
        });
        return;
      }
      const key = String(source?.exerciseKey || source?.exerciseId || source?.baseId || source?.exerciseName || source?.name || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(source);
    });
    return out;
  }

  function resolveDecisionSourceRecord({ ex, currentRow, exactRecords = [], candidateSources = [] }) {
    const exerciseName = String(ex?.displayName || ex?.name || currentRow?.exercise || '').trim();
    const exerciseId = String(ex?.canonicalExerciseId || currentRow?.canonicalExerciseId || '').trim();
    const family = String(ex?.projectionFamily || currentRow?.family || decisionMovementFamilyForName(exerciseName, 'general'));
    const exact = collectUniqueDecisionRecords(exactRecords)
      .map((record) => normalizeDecisionSourceRecord(record, family))
      .find((record) => record.exerciseName);
    if (exact) {
      return { decisionSource: 'exact_exercise', decisionSourceExercise: safeDecisionSourceExerciseLabel('exact_exercise', exact.exerciseName, family), primaryRecord: exact };
    }
    const candidates = collectUniqueDecisionRecords(candidateSources)
      .map((record) => normalizeDecisionSourceRecord(record, family))
      .filter((record) => record.exerciseName && String(record.canonicalExerciseId || '') !== exerciseId);
    const closeVariant = candidates.find((record) => isCloseDecisionVariantPair(exerciseName, record.exerciseName, family));
    if (closeVariant) {
      return { decisionSource: 'close_variant', decisionSourceExercise: safeDecisionSourceExerciseLabel('close_variant', closeVariant.exerciseName, family), primaryRecord: closeVariant };
    }
    const familyRecord = candidates.find((record) => record.projectionFamily === family);
    if (familyRecord) {
      return { decisionSource: 'movement_family', decisionSourceExercise: safeDecisionSourceExerciseLabel('movement_family', familyRecord.exerciseName, family), primaryRecord: familyRecord };
    }
    return { decisionSource: 'anchor_fallback', decisionSourceExercise: safeDecisionSourceExerciseLabel('anchor_fallback', '', family), primaryRecord: null };
  }

  function snapshotFromDecisionRecord(record, prescribedSets = 0) {
    if (!record) return null;
    if (Array.isArray(record?.sets)) return summarizeEntrySetsForDecision(record, prescribedSets);
    const last = record?.last && typeof record.last === 'object' ? record.last : null;
    if (last && (Number.isFinite(Number(last?.weight)) || Number.isFinite(Number(last?.reps)))) {
      const reps = Number(last?.reps || 0);
      const weight = Number(last?.weight || 0);
      return {
        completedSets: prescribedSets || 1,
        minReps: reps || null,
        maxReps: reps || null,
        avgReps: reps || null,
        topWeight: weight || null
      };
    }
    return null;
  }

  function coerceDecisionTargetConsistency({ recommendation, nextTarget, currentRow, nextRow, progressionMode }) {
    if (progressionMode !== 'external_load' && progressionMode !== 'loaded_bodyweight') return String(nextTarget || '');
    const currentLoad = Number(currentRow?.targetLoad || 0);
    const nextLoad = Number(nextRow?.targetLoad || 0);
    if (!Number.isFinite(currentLoad) || currentLoad <= 0) return String(nextTarget || '');
    if (recommendation === 'increase') {
      const enforced = Number.isFinite(nextLoad) && nextLoad > currentLoad ? nextLoad : (currentLoad + 5);
      return `${enforced} lb`;
    }
    if (recommendation === 'hold') return `${currentLoad} lb`;
    if (recommendation === 'decrease') {
      const enforced = Number.isFinite(nextLoad) && nextLoad < currentLoad ? nextLoad : Math.max(2.5, currentLoad - 5);
      return `${enforced} lb`;
    }
    if (recommendation === 'deload' || recommendation === 'continue_deload') return `${Math.max(2.5, Math.round(currentLoad * 0.88 * 2) / 2)} lb`;
    return String(nextTarget || '');
  }

  function buildNextSessionDecisionForExercise({ plan, ex, week, currentEntry, previousEntry, historicalPerformance, persistentLift, candidateSources = [] }) {
    const currentRow = projectionRowForExercise(plan, ex, week);
    const nextRow = projectionRowForExercise(plan, ex, Math.min(16, Number(week) + 1));
    const progressionMode = String(ex?.progression?.progressionMode || currentRow?.progressionMode || 'external_load');
    const repWindow = parseRepWindow(currentRow?.repRange || ex?.reps);
    const prescribedSets = Number(currentRow?.sets || ex?.sets || 0) || 0;
    const source = resolveDecisionSourceRecord({
      ex,
      currentRow,
      exactRecords: [currentEntry, previousEntry, historicalPerformance, persistentLift],
      candidateSources
    });
    const logged = snapshotFromDecisionRecord(source.primaryRecord, prescribedSets) || summarizeEntrySetsForDecision(currentEntry || previousEntry || null, prescribedSets);
    const history = [
      snapshotFromDecisionRecord(source.primaryRecord, prescribedSets),
      buildHistorySnapshot(previousEntry, prescribedSets),
      buildHistorySnapshot(historicalPerformance, prescribedSets),
      snapshotFromDecisionRecord(persistentLift, prescribedSets)
    ].filter(Boolean);
    const underperformCount = history.filter((item) => Number(item?.minReps || 0) > 0 && Number(item.minReps) < repWindow.min).length;
    const overperformCount = history.filter((item) => Number(item?.minReps || 0) >= repWindow.max).length;
    const familyAdjustment = Number(plan?.meta?.autoreg?.familyAdjustments?.[String(ex?.projectionFamily || currentRow?.family || '')] || 1);
    const fatigueStacked = underperformCount >= 2;
    const allSetsAtTop = logged.completedSets >= prescribedSets && prescribedSets > 0 && Number(logged.minReps || 0) >= repWindow.max;
    const insideRange = logged.completedSets >= Math.max(1, prescribedSets - 1) && Number(logged.avgReps || 0) >= repWindow.min;
    const severeMiss = logged.completedSets > 0 && Number(logged.minReps || 0) < Math.max(1, repWindow.min - 2);
    let recommendation = 'hold';
    let reason = 'Keep the same target and keep building clean reps.';
    let confidence = 'medium';
    let shortNote = 'No clear reason to change the target yet.';
    let adaptiveChanged = false;
    let deloadState = String(currentRow?.tag || '') === 'deload' ? 'deload_week' : 'normal';
    if (String(currentRow?.tag || '') === 'deload') {
      if (logged.completedSets >= Math.max(1, prescribedSets - 1) && Number(logged.minReps || 0) >= repWindow.min) {
        recommendation = 'exit_deload';
        reason = 'Recovery work was completed cleanly, so the next session can return to normal progression.';
        shortNote = 'Deload succeeded. Resume the normal track next time.';
        confidence = 'high';
        deloadState = 'exit_deload';
      } else {
        recommendation = 'continue_deload';
        reason = 'Recovery still looked incomplete, so keep the reduced-fatigue week going for one more session.';
        shortNote = 'Stay easy one more time.';
        confidence = 'high';
        deloadState = 'continue_deload';
      }
    } else if (fatigueStacked) {
      recommendation = 'deload';
      reason = 'Repeated underperformance suggests fatigue is stacking enough to justify a recovery week.';
      shortNote = 'Pull back and recover instead of forcing progress.';
      confidence = 'high';
      deloadState = 'triggered';
    } else if (allSetsAtTop) {
      recommendation = 'increase';
      reason = 'You hit the top of the rep range across the prescribed work sets.';
      shortNote = 'Load increase earned.';
      confidence = 'high';
      if (overperformCount >= 2 || familyAdjustment > 1.05) {
        adaptiveChanged = true;
        reason = 'Recent overperformance on this exercise or family supports a modest accelerated jump.';
        shortNote = 'Adaptive logic nudged the jump slightly upward.';
      }
    } else if (severeMiss && underperformCount >= 1) {
      recommendation = 'decrease';
      reason = 'The last session missed the bottom of the range badly enough to justify a small reset.';
      shortNote = 'Reduce the target slightly and rebuild clean reps.';
      confidence = 'high';
    } else if (insideRange) {
      recommendation = 'hold';
      reason = 'You were inside the range, but did not clearly earn a jump yet.';
      shortNote = 'Hold the load and keep pushing reps.';
      confidence = 'high';
    }
    let nextTarget = 'N/A';
    if (progressionMode === 'external_load' || progressionMode === 'loaded_bodyweight') {
      if (recommendation === 'hold' && Number.isFinite(Number(currentRow?.targetLoad))) nextTarget = `${Number(currentRow.targetLoad)} lb`;
      else if (recommendation === 'decrease' && Number.isFinite(Number(currentRow?.targetLoad))) nextTarget = `${Math.max(2.5, Number(currentRow.targetLoad) - 5)} lb`;
      else if ((recommendation === 'deload' || recommendation === 'continue_deload') && Number.isFinite(Number(currentRow?.targetLoad))) nextTarget = `${Math.round(Number(currentRow.targetLoad) * 0.88 * 2) / 2} lb`;
      else if (recommendation === 'exit_deload') nextTarget = String(currentRow?.postDeloadReturnTarget || nextRow?.displayTarget || 'Resume normal target');
      else nextTarget = String(nextRow?.displayTarget || (Number.isFinite(Number(nextRow?.targetLoad)) ? `${Number(nextRow.targetLoad)} lb` : 'N/A'));
    } else {
      nextTarget = bodyweightRecommendationText(progressionMode, recommendation, currentRow);
    }
    if (source.decisionSource === 'movement_family') {
      reason = `${reason} This used a movement-family fallback because no exact or close-variant history was available.`;
    } else if (source.decisionSource === 'anchor_fallback') {
      reason = `${reason} This used an anchor fallback because no usable logged signal was available.`;
    }
    nextTarget = coerceDecisionTargetConsistency({ recommendation, nextTarget, currentRow, nextRow, progressionMode });
    return {
      progressionMode,
      recommendation,
      nextTarget,
      decisionSource: source.decisionSource,
      decisionSourceExercise: safeDecisionSourceExerciseLabel(
        source.decisionSource,
        source.decisionSourceExercise,
        progressionMode !== 'external_load' && progressionMode !== 'loaded_bodyweight' ? 'bodyweight' : ''
      ),
      reason,
      confidence,
      shortNote,
      adaptiveChanged,
      familyTrend: familyTrendLabel(familyAdjustment),
      familyAdjustment,
      fatigueFlags: `${underperformCount} exercise misses`,
      deloadState,
      targetRepRange: String(currentRow?.repRange || ex?.reps || ''),
      prescribedSets,
      lastTarget: progressionMode === 'external_load' || progressionMode === 'loaded_bodyweight'
        ? (Number.isFinite(Number(currentRow?.targetLoad)) ? `${Number(currentRow.targetLoad)} lb` : 'N/A')
        : String(currentRow?.displayTarget || currentRow?.repRange || 'N/A'),
      lastPerformedWeight: logged.completedSets
        ? (progressionMode === 'external_load' || progressionMode === 'loaded_bodyweight'
          ? `${logged.topWeight || 'N/A'} lb`
          : String(currentRow?.displayTarget || 'Bodyweight'))
        : 'No logged result yet',
      repsAchieved: logged.completedSets
        ? `${logged.minReps || logged.avgReps || 0}-${logged.maxReps || logged.avgReps || 0} reps`
        : 'No logged result yet',
      actualResult: logged.completedSets
        ? (progressionMode === 'external_load' || progressionMode === 'loaded_bodyweight'
          ? `${logged.topWeight || 'N/A'} lb • ${logged.minReps || logged.avgReps || 0}-${logged.maxReps || logged.avgReps || 0} reps`
          : `${logged.minReps || logged.avgReps || 0}-${logged.maxReps || logged.avgReps || 0} reps`)
        : 'No logged result yet'
    };
  }

  /* ============================================================
     WORKOUT MEDIA INJECTION LAYER (Training UI only)
     - Non-blocking: renders skeleton first, lazy-loads in viewport
     - Fallback: image -> icon (never broken media)
     ============================================================ */

  const EXERCISE_MEDIA_CACHE_KEY = 'ode_exercise_media_cache_v4';
  const exerciseMediaMemCache = new Map();
  const exerciseMediaInFlight = new Map();
  let exerciseMediaLocalCache = {};
  try {
    const raw = localStorage.getItem(EXERCISE_MEDIA_CACHE_KEY);
    exerciseMediaLocalCache = raw ? (JSON.parse(raw) || {}) : {};
  } catch {
    exerciseMediaLocalCache = {};
  }

  let exerciseMediaPersistTimer = 0;
let localExerciseFolders = [];
let localExerciseFolderSet = new Set();
let localExerciseFolderTokens = [];

function normalizeNameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[/_-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, '')
    .split(/\s+/)
    .map((t) => (t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t))
    .filter(Boolean);
}

function buildFolderTokenCache(folders) {
  localExerciseFolderSet = new Set(folders || []);
  localExerciseFolderTokens = (folders || []).map((folder) => {
    const tokens = normalizeNameTokens(folder);
    const key = tokens.join(' ');
    return { folder, tokens, key };
  });
}

function guessFolderFromName(name) {
  const folder = String(name || '')
    .replace(/\//g, '_')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '_')
    .replace(/['",]/g, '')
    .replace(/__+/g, '_')
    .trim();
  return folder || null;
}

function ensureLocalExerciseFoldersLoaded() {
  // Intentionally disabled in production: this file is not always deployed.
  // Media now falls back to deterministic folder guesses + remote source.
}

function folderFromExactName(name) {
  const folder = String(name || '')
    .replace(/\//g, '_')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '_')
    .replace(/['",]/g, '')
    .replace(/__+/g, '_')
    .trim();
  if (!folder) return null;
  return localExerciseFolderSet.has(folder) ? folder : null;
}

function matchLocalExerciseFolder(name) {
  if (!localExerciseFolders || !localExerciseFolders.length) {
    ensureLocalExerciseFoldersLoaded();
    return null;
  }
  const exact = folderFromExactName(name);
  if (exact) return exact;
  const tokens = normalizeNameTokens(name);
  if (!tokens.length) return null;
  const key = tokens.join(' ');
  const match = localExerciseFolderTokens.find((f) => f.key === key);
  if (match) return match.folder;
  let best = null;
  let bestScore = -1;
  for (const entry of localExerciseFolderTokens) {
    let score = 0;
    for (const t of tokens) {
      if (entry.tokens.includes(t)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (!best) return null;
  const minScore = tokens.length === 1 ? 1 : Math.min(2, tokens.length);
  return bestScore >= minScore ? best.folder : null;
}

function rewriteLegacyLocalMediaPath(src) {
  let out = String(src || '').trim();
  if (!out) return out;
  out = out.replace(/\\/g, '/');
  // Normalize localhost/absolute file references so production can load the same asset.
  if (/^https?:\/\/localhost(?::\d+)?\//i.test(out) || /^https?:\/\/127\.0\.0\.1(?::\d+)?\//i.test(out)) {
    try {
      const u = new URL(out);
      out = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`;
    } catch {
      // ignore
    }
  }
  const freeDbIdx = out.toLowerCase().indexOf('/free-exercise-db/');
  if (freeDbIdx > 0) out = out.slice(freeDbIdx);
  const winIdx = out.toLowerCase().indexOf('free-exercise-db/exercises/');
  if (winIdx >= 0 && !out.startsWith('/')) out = `/${out.slice(winIdx)}`;
  out = out.replace(/\/+/g, '/');
  out = out.replace(
    /\/free-exercise-db\/exercises\/Close-Grip_Bench_Press\/([^/?#]+)$/i,
    '/free-exercise-db/exercises/Smith_Machine_Close-Grip_Bench_Press/$1'
  );
  out = out.replace(
    /\/free-exercise-db\/exercises\/Overhead_Press\/([^/?#]+)$/i,
    '/free-exercise-db/exercises/Barbell_Shoulder_Press/$1'
  );
  return out;
}

function toFreeExerciseDbRemotePath(src) {
  const raw = String(src || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, '');
  const idx = noOrigin.toLowerCase().indexOf('/free-exercise-db/');
  if (idx < 0) return '';
  const rel = noOrigin.slice(idx + '/free-exercise-db/'.length).replace(/^\/+/, '');
  if (!rel) return '';
  return `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/${rel}`;
}

function isRemoteHttpMediaPath(src) {
  return /^https?:\/\//i.test(String(src || '').trim());
}

function buildExerciseMediaCandidates(src) {
  const raw = String(src || '').trim();
  if (!raw) return [];
  const rewritten = rewriteLegacyLocalMediaPath(raw);
  const remote = toFreeExerciseDbRemotePath(rewritten);
  const candidates = [];
  const push = (value) => {
    const next = String(value || '').trim();
    if (!next) return;
    if (!candidates.includes(next)) candidates.push(next);
  };
  if (isRemoteHttpMediaPath(rewritten)) {
    push(rewritten);
  } else {
    push(rewritten);
    push(remote);
  }
  if (isRemoteHttpMediaPath(raw)) push(raw);
  return candidates;
}

  function persistExerciseMediaCacheSoon() {
    try { window.clearTimeout(exerciseMediaPersistTimer); } catch { /* ignore */ }
    exerciseMediaPersistTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(EXERCISE_MEDIA_CACHE_KEY, JSON.stringify(exerciseMediaLocalCache || {}));
      } catch {
        // ignore
      }
    }, 250);
  }

  let mediaRerenderQueued = false;
  function queueMediaRerender() {
    if (mediaRerenderQueued) return;
    mediaRerenderQueued = true;
    window.setTimeout(() => {
      mediaRerenderQueued = false;
      if (state.view === 'plan') render();
    }, 50);
  }

  let userInteractedForMedia = false;
  try {
    const mark = () => { userInteractedForMedia = true; };
    window.addEventListener('pointerdown', mark, { once: true, capture: true });
    window.addEventListener('keydown', mark, { once: true, capture: true });
    window.addEventListener('touchstart', mark, { once: true, capture: true });
  } catch {
    // ignore
  }

  const prefersReducedMotion = () => {
    try {
      return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  };

  const LOCAL_EXERCISE_CATALOG_PATH = '/free-exercise-db/dist/exercises.json';
  const REMOTE_EXERCISE_CATALOG_PATH = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json';
  const isLikelyLocalHost = (() => {
    try {
      const h = String(window.location.hostname || '').toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local');
    } catch {
      return false;
    }
  })();
  let useRemoteExerciseMedia = !isLikelyLocalHost;

  let exerciseCatalog = [];
  let exerciseIndexById = new Map();
  let exerciseIndexByIdNorm = new Map();
  let exerciseIndexByNameNorm = new Map();
  let catalogLoading = false;
  let catalogLoadingPromise = null;
  let catalogLoadAttempted = false;

  function normalizeExerciseIdForLookup(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function setExerciseCatalog(list) {
    const opts = Array.isArray(list) ? list : [];
    exerciseCatalog = opts;
    exerciseIndexById = new Map();
    exerciseIndexByIdNorm = new Map();
    exerciseIndexByNameNorm = new Map();
    for (const ex of opts) {
      const id = String(ex?.id || '').trim();
      if (!id) continue;
      exerciseIndexById.set(id, ex);
      const idNorm = normalizeExerciseIdForLookup(id);
      if (idNorm && !exerciseIndexByIdNorm.has(idNorm)) {
        exerciseIndexByIdNorm.set(idNorm, ex);
      }
      const nameNorm = normalizeTextForMatch(ex?.name || '');
      if (nameNorm && !exerciseIndexByNameNorm.has(nameNorm)) {
        exerciseIndexByNameNorm.set(nameNorm, ex);
      }
    }
  }

  function findCatalogExerciseById(rawId) {
    const id = String(rawId || '').trim();
    if (!id) return null;
    const byExact = exerciseIndexById.get(id);
    if (byExact) return byExact;
    const idNorm = normalizeExerciseIdForLookup(id);
    if (!idNorm) return null;
    return exerciseIndexByIdNorm.get(idNorm) || null;
  }

  function exerciseMediaFromCatalogEntry(ex, displayNameOverride = '') {
    if (!ex) return { mediaPath: null, mediaPathAlt: null, displayName: String(displayNameOverride || '').trim() };
    const image0 = ex.images?.[0] ? `/free-exercise-db/exercises/${ex.images[0]}` : null;
    const image1 = ex.images?.[1] ? `/free-exercise-db/exercises/${ex.images[1]}` : null;
    return {
      mediaPath: image0,
      mediaPathAlt: image1,
      displayName: String(displayNameOverride || ex.name || '').trim()
    };
  }

  const EXERCISE_MEDIA_NAME_ALIASES = {
    machine_chest_press: 'Machine Bench Press',
    chest_press_machine: 'Machine Bench Press',
    chest_press: 'Machine Bench Press',
    incline_chest_press: 'Leverage Incline Chest Press',
    lat_pulldown: 'Wide-Grip Lat Pulldown',
    machine_row: 'Seated Cable Rows',
    seated_cable_row: 'Seated Cable Rows',
    lying_leg_curl: 'Lying Leg Curls',
    seated_leg_curl: 'Seated Leg Curl',
    seated_hamstring_curl: 'Seated Leg Curl',
    hip_thrust: 'Barbell Hip Thrust',
    machine_shoulder_press: 'Machine Shoulder Military Press',
    shoulder_press_machine: 'Machine Shoulder Military Press'
  };

  function findApproxCatalogExerciseByName(rawName) {
    const name = String(rawName || '').trim();
    if (!name || !exerciseCatalog.length) return null;
    const key = normalizeTextForMatch(name);
    const aliasName = EXERCISE_MEDIA_NAME_ALIASES[key.replace(/\s+/g, '_')];
    if (aliasName) {
      const aliasMatch = exerciseIndexByNameNorm.get(normalizeTextForMatch(aliasName));
      if (aliasMatch) return aliasMatch;
    }

    const sourceTokens = normalizeNameTokens(name);
    if (!sourceTokens.length) return null;
    const wanted = new Set(sourceTokens);
    let best = null;
    let bestScore = -1;

    for (const ex of exerciseCatalog) {
      const candidateName = String(ex?.name || '').trim();
      if (!candidateName) continue;
      const candidateTokens = normalizeNameTokens(candidateName);
      if (!candidateTokens.length) continue;
      const tokenSet = new Set(candidateTokens);
      let overlap = 0;
      wanted.forEach((token) => {
        if (tokenSet.has(token)) overlap += 1;
      });
      if (!overlap) continue;

      let score = overlap / wanted.size;
      const candidateNorm = normalizeTextForMatch(candidateName);
      if (key.includes('chest press') && /(bench press|chest press)/.test(candidateNorm)) score += 0.55;
      if (key.includes('lat pulldown') && /lat pulldown/.test(candidateNorm)) score += 0.55;
      if (key.includes('leg curl') && /leg curl/.test(candidateNorm)) score += 0.55;
      if (key.includes('hip thrust') && /hip thrust/.test(candidateNorm)) score += 0.55;
      if (key.includes('shoulder press') && /shoulder|military|overhead press/.test(candidateNorm)) score += 0.4;
      if (sourceTokens.includes('machine') && /(machine|leverage|smith)/.test(candidateNorm)) score += 0.18;
      if (sourceTokens.includes('lying') && /lying/.test(candidateNorm)) score += 0.18;
      if (sourceTokens.includes('seated') && /seated/.test(candidateNorm)) score += 0.18;
      if (sourceTokens.includes('barbell') && /barbell/.test(candidateNorm)) score += 0.18;
      if (sourceTokens.includes('dumbbell') && /dumbbell/.test(candidateNorm)) score += 0.18;
      if (candidateTokens.length > wanted.size + 4) score -= 0.08;
      if (!Array.isArray(ex?.images) || !ex.images[0]) score -= 0.3;

      if (score > bestScore) {
        best = ex;
        bestScore = score;
      }
    }

    return bestScore >= 0.8 ? best : null;
  }

  function resolveCatalogExerciseForMedia(ex) {
    if (!ex) return null;
    const idCandidates = [
      ex.exerciseId,
      ex.exercise_id,
      ex.id,
      ex.baseId,
      ex.base_id
    ];
    for (const candidate of idCandidates) {
      const match = findCatalogExerciseById(candidate);
      if (match) return match;
    }

    const nameCandidates = [
      ex.displayName,
      ex.name,
      ex.exerciseName,
      ex.movementName
    ];
    for (const candidate of nameCandidates) {
      const key = normalizeTextForMatch(candidate || '');
      if (!key) continue;
      const byName = exerciseIndexByNameNorm.get(key);
      if (byName) return byName;
      const aliasName = EXERCISE_MEDIA_NAME_ALIASES[key.replace(/\s+/g, '_')];
      if (aliasName) {
        const aliasKey = normalizeTextForMatch(aliasName);
        const aliasMatch = exerciseIndexByNameNorm.get(aliasKey);
        if (aliasMatch) return aliasMatch;
      }
      const approx = findApproxCatalogExerciseByName(candidate);
      if (approx) return approx;
    }
    return null;
  }

  function fetchExerciseCatalog(url) {
    return fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => (Array.isArray(list) ? list : []))
      .catch(() => []);
  }

  function ensureExerciseCatalogLoaded() {
    if (exerciseCatalog.length) return Promise.resolve(exerciseCatalog);
    if (catalogLoadAttempted && !catalogLoadingPromise) return Promise.resolve(exerciseCatalog);
    if (catalogLoadingPromise) return catalogLoadingPromise;

    catalogLoading = true;
    catalogLoadAttempted = true;
    const catalogSources = isLikelyLocalHost
      ? [LOCAL_EXERCISE_CATALOG_PATH, REMOTE_EXERCISE_CATALOG_PATH]
      : [REMOTE_EXERCISE_CATALOG_PATH, LOCAL_EXERCISE_CATALOG_PATH];

    catalogLoadingPromise = (async () => {
      for (const source of catalogSources) {
        const list = await fetchExerciseCatalog(source);
        if (!list.length) continue;
        setExerciseCatalog(list);
        useRemoteExerciseMedia = source === REMOTE_EXERCISE_CATALOG_PATH;
        return exerciseCatalog;
      }
      setExerciseCatalog([]);
      useRemoteExerciseMedia = true;
      return exerciseCatalog;
    })().finally(() => {
      catalogLoading = false;
      catalogLoadingPromise = null;
      if (state.view === 'plan' && exerciseCatalog.length) render();
    });
    return catalogLoadingPromise;
  }

  let pullAnchorOptions = [];
  function ensurePullAnchorOptionsLoaded() {
    if (pullAnchorOptions.length) return;
    ensureExerciseCatalogLoaded();
    if (!exerciseCatalog.length) return;
    pullAnchorOptions = exerciseCatalog
      .filter((ex) => {
        const name = String(ex?.name || '').toLowerCase();
        if (/(^|\b)(band|bands|resistance band|mini band)(\b|$)/.test(name)) return false;
        return /(pull-?up|chin-?up|pulldown|lat pulldown)/.test(name);
      })
      .map((ex) => ({ id: String(ex?.id || '').trim(), name: String(ex?.name || '').trim() }))
      .filter((ex) => ex.id && ex.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  let quoteBankCache = [];
  let quoteBankLoading = false;
  let quoteBankLoadingPromise = null;
  function ensureQuoteBankLoaded() {
    if (quoteBankCache.length) return Promise.resolve(quoteBankCache);
    if (quoteBankLoadingPromise) return quoteBankLoadingPromise;
    quoteBankLoading = true;
    const fetchQuotes = (url) => fetch(url)
      .then((r) => (r.ok ? r.json() : { quotes: [] }))
      .then((data) => (Array.isArray(data?.quotes) ? data.quotes : []))
      .catch(() => []);
    quoteBankLoadingPromise = fetchQuotes('/api/training/quote-bank')
      .then((quotes) => (quotes.length ? quotes : fetchQuotes('/quoteBank.json')))
      .then((quotes) => {
        quoteBankCache = Array.isArray(quotes) ? quotes : [];
        return quoteBankCache;
      })
      .finally(() => {
        quoteBankLoading = false;
        quoteBankLoadingPromise = null;
        render();
      });
    return quoteBankLoadingPromise;
  }

  function normalizeExerciseKey(ex) {
    const raw = String(ex?.exercise_id || ex?.id || ex?.baseId || ex?.base_id || ex?.name || '');
    return raw
      .trim()
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function normalizeExerciseSlugFromName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/\\([^)]*\\)/g, '')
      .replace(/\s*\/\s*/g, ' ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function guessMuscleGroup(ex) {
    const mg = String(ex?.muscle_group || ex?.muscleGroup || ex?.muscle || '').trim().toLowerCase();
    if (mg) return mg;

    const n = String(ex?.name || '').toLowerCase();
    if (/(squat|lunge|split_squat|leg|quad|hamstring|glute|deadlift)/.test(n)) return 'legs';
    if (/(bench|chest|press(?!down)|push[- ]?up|fly)/.test(n)) return 'chest';
    if (/(row|pull[- ]?up|lat|back|deadlift)/.test(n)) return 'back';
    if (/(shoulder|overhead|ohp|lateral|raise)/.test(n)) return 'shoulders';
    if (/(curl|bicep)/.test(n)) return 'arms';
    if (/(tricep|pushdown|dip)/.test(n)) return 'arms';
    if (/(core|abs|plank|crunch|hanging)/.test(n)) return 'core';
    return 'full';
  }

  function inferDaySplitLabel(day) {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    if (!exercises.length) return '';

    const counts = { legs: 0, chest: 0, back: 0, shoulders: 0, arms: 0, core: 0, full: 0, pushArms: 0, pullArms: 0 };
    exercises.forEach((ex) => {
      const name = String(ex?.displayName || ex?.name || ex?.exerciseName || '').toLowerCase();
      const group = guessMuscleGroup(ex);
      if (group === 'legs') counts.legs += 1;
      else if (group === 'chest') counts.chest += 1;
      else if (group === 'back') counts.back += 1;
      else if (group === 'shoulders') counts.shoulders += 1;
      else if (group === 'core') counts.core += 1;
      else if (group === 'arms') {
        counts.arms += 1;
        if (/(tricep|pushdown|dip|extension|press)/.test(name)) counts.pushArms += 1;
        if (/(curl|bicep)/.test(name)) counts.pullArms += 1;
      } else {
        counts.full += 1;
      }
    });

    const pushScore = counts.chest + counts.shoulders + counts.pushArms;
    const pullScore = counts.back + counts.pullArms;
    const legsScore = counts.legs;
    const total = exercises.length || 1;

    if (legsScore >= Math.max(pushScore, pullScore) && legsScore / total >= 0.35) return 'Legs';
    if (pushScore >= pullScore * 1.35 && pushScore >= legsScore * 1.2) return 'Push';
    if (pullScore >= pushScore * 1.35 && pullScore >= legsScore * 1.2) return 'Pull';

    if (legsScore > 0 && (pushScore + pullScore) > 0) {
      return legsScore >= (pushScore + pullScore) ? 'Lower' : 'Upper';
    }

    if (counts.full / total >= 0.4) return 'Full Body';
    if (pushScore && pullScore) return 'Upper';
    if (legsScore) return 'Lower';
    return 'Workout';
  }

  function getDayTitle(day) {
    const raw = String(day?.name || day?.focus || '').trim();
    return raw || inferDaySplitLabel(day) || 'Workout';
  }

  function muscleIconSvg(muscle) {
    const m = String(muscle || 'full').toLowerCase();
    const path = (() => {
      if (m.includes('leg') || m.includes('quad') || m.includes('glute') || m.includes('ham')) return 'M9 3c2 0 3 2 3 4v2c0 1-.4 2-1.2 2.8L9 13v7H7v-6.2l1.4-1.4C6.5 12 6 10.9 6 9.7V7c0-2 1-4 3-4Z';
      if (m.includes('chest') || m.includes('pec')) return 'M12 4c2.8 0 5 2.2 5 5v1.4c0 1.9-1 3.6-2.6 4.6L12 16l-2.4-1c-1.6-1-2.6-2.7-2.6-4.6V9c0-2.8 2.2-5 5-5Z';
      if (m.includes('back') || m.includes('lat')) return 'M12 4c3.5 0 6 2.5 6 6v2.2c0 2.1-1.2 4-3.1 4.9L12 18l-2.9-.9C7.2 16.2 6 14.3 6 12.2V10c0-3.5 2.5-6 6-6Z';
      if (m.includes('should')) return 'M7.5 8.5A4.5 4.5 0 0 1 12 4a4.5 4.5 0 0 1 4.5 4.5V10H7.5V8.5Z M7 11h10v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7Z';
      if (m.includes('core') || m.includes('ab')) return 'M10 3h4v3h-4V3Zm-1 4h6l1 6-1 8H9L8 13l1-6Z';
      if (m.includes('arm') || m.includes('bicep') || m.includes('tricep')) return 'M9 6c1.2 0 2 .8 2 2v2h2V8c0-1.2.8-2 2-2 1.3 0 2.3 1.1 2 2.4l-1.3 6.2A4 4 0 0 1 13.8 18H10a4 4 0 0 1-3.9-3.2L4.8 8.4C4.5 7.1 5.5 6 6.8 6H9Z';
      return 'M12 3c3.3 0 6 2.7 6 6v3c0 3.6-2.6 6.7-6 7-3.4-.3-6-3.4-6-7V9c0-3.3 2.7-6 6-6Z';
    })();

    return el('svg', { class: 'exercise-media-svg', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      el('path', { d: path, fill: 'currentColor' })
    );
  }

  function resolveExerciseMedia(ex) {
      const displayName = String(ex?.displayName || ex?.name || ex?.exerciseName || '').trim();
      const catalogEx = resolveCatalogExerciseForMedia(ex);
      const catalogMedia = exerciseMediaFromCatalogEntry(catalogEx, displayName);
      let mediaPath = String(ex?.mediaPath || '').trim();
      let mediaPathAlt = String(ex?.mediaPathAlt || '').trim();
      const mediaPathNorm = mediaPath.replace(/\\/g, '/');
      const isFreeDbMediaPath = /(?:^|\/)(?:free-exercise-db|exercise-db)\/exercises\//i.test(mediaPathNorm);
      const prefersCatalogMedia = !mediaPath
        || isFreeDbMediaPath
        || (!isRemoteHttpMediaPath(mediaPath) && catalogMedia.mediaPath);
      if (catalogMedia.mediaPath && prefersCatalogMedia) {
        mediaPath = catalogMedia.mediaPath;
        mediaPathAlt = catalogMedia.mediaPathAlt || '';
      }
      if (mediaPath) {
        const localSrc0 = rewriteLegacyLocalMediaPath(mediaPath);
        const localSrc1 = rewriteLegacyLocalMediaPath(mediaPathAlt || (mediaPath.includes('/0.') ? mediaPath.replace('/0.', '/1.') : mediaPath));
        const src0 = useRemoteExerciseMedia ? (toFreeExerciseDbRemotePath(localSrc0) || localSrc0) : localSrc0;
        const src1 = useRemoteExerciseMedia ? (toFreeExerciseDbRemotePath(localSrc1) || localSrc1) : localSrc1;
        return {
          type: 'local-pair',
          src0,
          src1,
          candidates0: buildExerciseMediaCandidates(localSrc0),
          candidates1: buildExerciseMediaCandidates(localSrc1),
          alt: displayName
        };
      }

      const name = String(ex?.movementName || catalogMedia.displayName || displayName || '').trim();
      const folder = name ? (matchLocalExerciseFolder(name) || guessFolderFromName(name)) : null;
      if (folder) {
        const safeFolder = encodeURIComponent(folder);
        const localSrc0 = '/free-exercise-db/exercises/' + safeFolder + '/0.jpg';
        const localSrc1 = '/free-exercise-db/exercises/' + safeFolder + '/1.jpg';
        const src0 = useRemoteExerciseMedia ? (toFreeExerciseDbRemotePath(localSrc0) || localSrc0) : localSrc0;
        const src1 = useRemoteExerciseMedia ? (toFreeExerciseDbRemotePath(localSrc1) || localSrc1) : localSrc1;
        return {
          type: 'local-pair',
          src0,
          src1,
          candidates0: buildExerciseMediaCandidates(localSrc0),
          candidates1: buildExerciseMediaCandidates(localSrc1),
          alt: displayName || name
        };
      }

      return { type: 'icon', name: String(ex?.bodyPart || ex?.muscle_group || ex?.muscleGroup || 'exercise') };
    }

  function renderExerciseMedia(ex) {
    const media = resolveExerciseMedia(ex);
    if (media?.type === 'video' && media?.src) {
      return el('video', {
        class: 'exercise-media-video',
        src: media.src,
        muted: 'true',
        loop: 'true',
        playsinline: 'true',
        autoplay: 'true',
        preload: 'metadata',
        poster: media.poster || ''
      });
    }
    if (media?.type === 'image' && media?.src) {
      const img = el('img', { class: 'exercise-media-img', src: media.src, alt: ex?.name || 'Exercise', loading: 'eager', decoding: 'async' });
      const candidates = buildExerciseMediaCandidates(media.src);
      let candidateIndex = Math.max(0, candidates.indexOf(String(media.src || '').trim()));
      img.addEventListener('error', () => {
        candidateIndex += 1;
        if (candidateIndex < candidates.length) {
          img.src = candidates[candidateIndex];
          return;
        }
        try { img.replaceWith(muscleIconSvg(ex?.bodyPart || ex?.muscle_group || ex?.muscleGroup || 'exercise')); } catch {}
      });
      return img;
    }
    if (media?.type === 'local-pair' && media?.src0 && media?.src1) {
      const wrap = el('div', { class: 'exercise-media-pair' });
      const imgA = el('img', { class: 'exercise-media-img exercise-media-img-a', src: media.src0, alt: media.alt || ex?.name || 'Exercise', loading: 'eager', decoding: 'async' });
      const imgB = el('img', { class: 'exercise-media-img exercise-media-img-b', src: media.src1, alt: media.alt || ex?.name || 'Exercise', loading: 'eager', decoding: 'async' });
      const candidates0 = Array.isArray(media.candidates0) && media.candidates0.length
        ? media.candidates0.slice()
        : buildExerciseMediaCandidates(media.src0);
      const candidates1 = Array.isArray(media.candidates1) && media.candidates1.length
        ? media.candidates1.slice()
        : buildExerciseMediaCandidates(media.src1);
      let candidateIndex = Math.max(
        candidates0.indexOf(String(media.src0 || '').trim()),
        candidates1.indexOf(String(media.src1 || '').trim()),
        0
      );
      const advancePair = () => {
        candidateIndex += 1;
        const next0 = candidates0[candidateIndex] || '';
        const next1 = candidates1[candidateIndex] || '';
        if (next0 && next1) {
          imgA.src = next0;
          imgB.src = next1;
          return true;
        }
        return false;
      };
      const onError = () => {
        if (advancePair()) return;
        try { wrap.replaceWith(muscleIconSvg(ex?.bodyPart || ex?.muscle_group || ex?.muscleGroup || 'exercise')); } catch {}
      };
      imgA.addEventListener('error', onError);
      imgB.addEventListener('error', onError);
      wrap.appendChild(imgA);
      wrap.appendChild(imgB);
      return wrap;
    }
    return muscleIconSvg(ex?.bodyPart || ex?.muscle_group || ex?.muscleGroup || 'exercise');
  }

  function openExerciseMediaModal({ type, src, src0, src1, alt }) {
    try {
      const existing = document.getElementById('exercise-media-modal');
      existing?.remove?.();
    } catch {
      // ignore
    }

    const bodyNode = (() => {
      if (type === 'video' && src) {
        return el('video', { class: 'exercise-media-modal-video', src, muted: 'true', loop: 'true', playsinline: 'true', controls: 'true' });
      }
      if (type === 'image-pair' && src0 && src1) {
        return el('div', { class: 'exercise-media-modal-pair' },
          el('img', { class: 'exercise-media-modal-img exercise-media-modal-img-a', src: src0, alt: String(alt || 'Exercise preview'), loading: 'lazy' }),
          el('img', { class: 'exercise-media-modal-img exercise-media-modal-img-b', src: src1, alt: String(alt || 'Exercise preview'), loading: 'lazy' })
        );
      }
      return el('img', { class: 'exercise-media-modal-img', src, alt: String(alt || 'Exercise preview'), loading: 'lazy' });
    })();

    const overlay = el('div', { class: 'exercise-media-modal', id: 'exercise-media-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'exercise-media-modal-backdrop', type: 'button', 'aria-label': 'Close preview' }),
      el('div', { class: 'exercise-media-modal-card' },
        el('div', { class: 'exercise-media-modal-head' },
          el('div', { class: 'exercise-media-modal-title' }, String(alt || 'Exercise preview')),
          el('button', { class: 'exercise-media-modal-close', type: 'button', 'aria-label': 'Close preview' }, '×')
        ),
        bodyNode
      )
    );

    const close = () => {
      try { overlay.remove(); } catch { /* ignore */ }
    };
    overlay.querySelector('.exercise-media-modal-backdrop')?.addEventListener('click', close);
    overlay.querySelector('.exercise-media-modal-close')?.addEventListener('click', close);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    }, { once: true });

    document.body.appendChild(overlay);
    const vid = overlay.querySelector('video');
    if (vid && !prefersReducedMotion()) {
      vid.play().catch(() => { /* ignore */ });
    }
  }

  function getExerciseNameById(id) {
    if (!id) return '';
    const ex = findCatalogExerciseById(id);
    return ex ? String(ex.name || '') : '';
  }

  function exerciseMediaFromId(id) {
    const ex = findCatalogExerciseById(id);
    return exerciseMediaFromCatalogEntry(ex);
  }

  async function logTrainingEvent(eventType, payload) {
    try {
      await api('/api/training/event', {
        method: 'POST',
        body: JSON.stringify({ eventType, payload })
      });
    } catch {
      // ignore
    }
  }

    function normalizeTextForMatch(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isBandName(name) {
    const n = normalizeTextForMatch(name);
    return /(^|\b)(band|bands|resistance band|mini band)(\b|$)/.test(n);
  }

  function swapOverrideKey(planId, weekIndex, dayIndex, slotId) {
    return `ode_swap:${planId || 'local'}:${weekIndex}:${dayIndex}:${slotId}`;
  }

  function getSwapOverride(planId, weekIndex, dayIndex, slotId) {
    if (!slotId) return null;
    try {
      return localStorage.getItem(swapOverrideKey(planId, weekIndex, dayIndex, slotId))
        || localStorage.getItem(swapOverrideKey(null, weekIndex, dayIndex, slotId));
    } catch {
      return null;
    }
  }

  function setSwapOverride(planId, weekIndex, dayIndex, slotId, exerciseId) {
    if (!slotId || !exerciseId) return;
    try {
      localStorage.setItem(swapOverrideKey(planId, weekIndex, dayIndex, slotId), String(exerciseId));
      localStorage.setItem(swapOverrideKey(null, weekIndex, dayIndex, slotId), String(exerciseId));
    } catch {
      // ignore
    }
  }

  function swapOverrideKeyPermanent(planId, slotId) {
    return `ode_swap_perm:${planId || 'local'}:${slotId}`;
  }

  function getPermanentSwapOverride(planId, slotId) {
    if (!slotId) return null;
    try {
      return localStorage.getItem(swapOverrideKeyPermanent(planId, slotId))
        || localStorage.getItem(swapOverrideKeyPermanent(null, slotId));
    } catch {
      return null;
    }
  }

  function setPermanentSwapOverride(planId, slotId, exerciseId) {
    if (!slotId || !exerciseId) return;
    try {
      localStorage.setItem(swapOverrideKeyPermanent(planId, slotId), String(exerciseId));
      localStorage.setItem(swapOverrideKeyPermanent(null, slotId), String(exerciseId));
    } catch {
      // ignore
    }
  }

  function applySwapOverridesToDay({ day, planId, weekIndex, dayIndex }) {
    if (!day || !Array.isArray(day.exercises)) return;
    for (const ex of day.exercises) {
      const permanent = getPermanentSwapOverride(planId, ex?.slotId);
      const override = getSwapOverride(planId, weekIndex, dayIndex, ex?.slotId) || permanent;
      if (!override) continue;
      if (String(ex.exerciseId) !== String(override)) {
        ex.exerciseId = String(override);
        const media = exerciseMediaFromId(ex.exerciseId);
        if (media.displayName) ex.displayName = media.displayName;
        ex.mediaPath = media.mediaPath;
        ex.mediaPathAlt = media.mediaPathAlt;
      }
    }
  }

  function equipmentClassFromName(entry) {
    const eq = String(entry?.equipment || '').toLowerCase();
    if (eq.includes('barbell')) return 'barbell';
    if (eq.includes('dumbbell') || eq.includes('kettlebell')) return 'dumbbell';
    if (eq.includes('cable')) return 'cable';
    if (eq.includes('machine') || eq.includes('smith')) return 'machine';
    if (eq.includes('body')) return 'bodyweight';
    return 'other';
  }

  function isCalisthenicsLikeForSwap({ nameNorm, categoryNorm, mechanicNorm, eqClass }) {
    if (eqClass === 'bodyweight') return true;
    if (/(calisthenics|bodyweight|gymnastics)/.test(categoryNorm)) return true;
    if (/(calisthenics|bodyweight|gymnastics)/.test(mechanicNorm)) return true;
    return [
      /\bpull[\s-]*up\b/,
      /\bchin[\s-]*up\b/,
      /\bpush[\s-]*up\b/,
      /\bmuscle[\s-]*up\b/,
      /\bdips?\b/,
      /\bburpees?\b/,
      /\bhandstand\b/,
      /\binverted\s*row\b/,
      /\bhuman\s*flag\b/,
      /\bdragon\s*flag\b/,
      /\btoes?\s*to\s*bar\b/
    ].some((rx) => rx.test(nameNorm));
  }

  function classifySwapCategory(entry, fallbackEx = null) {
    const source = entry || fallbackEx || {};
    const nameNorm = normalizeTextForMatch(source?.name || source?.displayName || '');
    const categoryNorm = normalizeTextForMatch(source?.category || '');
    const mechanicNorm = normalizeTextForMatch(source?.mechanic || source?.stimulusType || '');
    const eqClass = equipmentClassFromName(source);

    if (/(plyometric|plyo)/.test(categoryNorm)) return 'plyometrics';
    if (/(plyometric|plyo|box jump|depth jump|broad jump|jump squat|bounds?)/.test(nameNorm)) return 'plyometrics';
    if (/(stretch|mobility|warmup|activation|rehab|therapy|prehab)/.test(nameNorm)) return 'stretch';
    if (/(stretch|mobility|warmup|rehab|therapy)/.test(categoryNorm)) return 'stretch';
    if (/(stretch|mobility|warmup|rehab|therapy)/.test(mechanicNorm)) return 'stretch';
    if (isCalisthenicsLikeForSwap({ nameNorm, categoryNorm, mechanicNorm, eqClass })) return 'calisthenics';

    if (eqClass === 'barbell' || eqClass === 'dumbbell') return 'free_weights';
    if (eqClass === 'machine' || eqClass === 'cable') return 'machines';
    if (eqClass === 'bodyweight') return 'calisthenics';

    const allow = Array.isArray(fallbackEx?.allowedEquipmentClass)
      ? fallbackEx.allowedEquipmentClass.map((c) => String(c || '').toLowerCase())
      : [];
    const hasFree = allow.includes('barbell') || allow.includes('dumbbell');
    const hasMachine = allow.includes('machine') || allow.includes('cable');
    const hasBodyweight = allow.includes('bodyweight');

    if (hasFree && hasMachine) return 'mixed';
    if (hasFree) return 'free_weights';
    if (hasMachine) return 'machines';
    if (hasBodyweight) return 'calisthenics';
    return 'unknown';
  }

  function swapCategoryCompatible({ sourceCategory, candidateCategory }) {
    const blocked = new Set(['calisthenics', 'plyometrics', 'stretch']);
    const source = String(sourceCategory || '');
    const candidate = String(candidateCategory || '');
    if (!candidate || candidate === 'unknown') return true;
    if (blocked.has(candidate)) return false;

    if (!source || source === 'unknown' || source === 'mixed' || blocked.has(source)) {
      return candidate === 'free_weights' || candidate === 'machines';
    }
    if (source === candidate) return true;
    if (source === 'free_weights' && candidate === 'machines') return true;
    if (source === 'machines' && candidate === 'free_weights') return true;
    return false;
  }

  function normalizeMuscleToken(raw) {
    return normalizeTextForMatch(raw).replace(/\s+/g, '');
  }

  function swapMajorFromToken(rawToken) {
    const token = normalizeMuscleToken(rawToken);
    if (!token) return '';
    if (token.includes('chest') || token.includes('pectoral') || token.includes('pec')) return 'chest';
    if (token.includes('lat') || token.includes('back') || token.includes('trap') || token.includes('rhomboid') || token.includes('erector') || token.includes('upperback')) return 'back';
    if (token.includes('shoulder') || token.includes('deltoid') || token.includes('rotator') || token.includes('delt')) return 'shoulders';
    if (token.includes('bicep') || token.includes('tricep') || token.includes('forearm') || token.includes('brachialis') || token.includes('brachioradialis')) return 'arms';
    if (token.includes('quad') || token.includes('hamstring') || token.includes('glute') || token.includes('calf') || token.includes('adductor') || token.includes('abductor') || token.includes('hipflexor') || token.includes('leg')) return 'legs';
    if (token === 'abs' || token.includes('abdom') || token.includes('oblique') || token.includes('serratus') || token.includes('transverse') || token.includes('core')) return 'core';
    if (token.includes('neck')) return 'neck';
    if (token.includes('fullbody')) return 'full_body';
    return '';
  }

  function swapMajorFromIntentKey(rawIntentKey) {
    const key = normalizeTextForMatch(rawIntentKey || '');
    if (!key) return '';
    if (key.includes('chest') || key.includes('pec')) return 'chest';
    if (key.includes('row') || key.includes('vertical pull') || key.includes('lat') || key.includes('upper back')) return 'back';
    if (key.includes('shoulder') || key.includes('overhead press') || key.includes('delts') || key.includes('rotator')) return 'shoulders';
    if (key.includes('triceps') || key.includes('biceps') || key.includes('forearm') || key.includes('arms')) return 'arms';
    if (key.includes('quad') || key.includes('hamstring') || key.includes('glute') || key.includes('calves') || key.includes('knee dominant') || key.includes('hip hinge') || key.includes('legs')) return 'legs';
    if (key.includes('abs') || key.includes('core') || key.includes('oblique') || key.includes('rotation')) return 'core';
    if (key.includes('neck')) return 'neck';
    if (key.includes('full body')) return 'full_body';
    return '';
  }

  function swapSubgroupFromToken(major, rawToken) {
    const token = normalizeMuscleToken(rawToken);
    if (!token || !major) return '';
    if (major === 'chest') {
      if (token.includes('upperchest') || token.includes('clavicular')) return 'upperchest';
      if (token.includes('lowerchest') || token.includes('sternocostal')) return 'lowerchest';
      if (token.includes('innerchest')) return 'innerchest';
      if (token.includes('middlechest') || token === 'chest' || token.includes('pectoral')) return 'middlechest';
      return '';
    }
    if (major === 'back') {
      if (token.includes('lat')) return 'lats';
      if (token.includes('upperback')) return 'upperback';
      if (token.includes('middleback')) return 'middleback';
      if (token.includes('lowerback') || token.includes('erector')) return 'lowerback';
      if (token.includes('trap')) return 'traps';
      if (token.includes('rhomboid')) return 'rhomboids';
      if (token === 'back') return 'middleback';
      return '';
    }
    if (major === 'shoulders') {
      if (token.includes('deltsfront') || token.includes('frontdelt')) return 'frontdelts';
      if (token.includes('deltsside') || token.includes('sidedelt') || token.includes('lateraldelt') || token.includes('medialdelt')) return 'sidedelts';
      if (token.includes('deltsrear') || token.includes('reardelt') || token.includes('posteriordelt')) return 'reardelts';
      if (token.includes('frontdelt') || token.includes('anteriordelt') || token.includes('frontdeltoid')) return 'frontdelts';
      if (token.includes('sidedelt') || token.includes('lateraldelt') || token.includes('medialdelt')) return 'sidedelts';
      if (token.includes('reardelt') || token.includes('posteriordelt')) return 'reardelts';
      if (token.includes('rotator')) return 'rotatorcuff';
      if (token.includes('shoulder') || token.includes('deltoid')) return 'shoulders';
      return '';
    }
    if (major === 'arms') {
      if (token.includes('bicep')) return 'biceps';
      if (token.includes('tricep')) return 'triceps';
      if (token.includes('forearm') || token.includes('brachioradialis')) return 'forearms';
      if (token.includes('brachialis')) return 'brachialis';
      return '';
    }
    if (major === 'legs') {
      if (token.includes('quad') || token.includes('rectusfemoris') || token.includes('vastus')) return 'quadriceps';
      if (token.includes('hamstring') || token.includes('bicepsfemoris') || token.includes('semitendinosus') || token.includes('semimembranosus')) return 'hamstrings';
      if (token.includes('glute')) return 'glutes';
      if (token.includes('calf') || token.includes('soleus') || token.includes('gastrocnemius')) return 'calves';
      if (token.includes('adductor')) return 'adductors';
      if (token.includes('abductor')) return 'abductors';
      if (token.includes('hipflexor') || token.includes('iliopsoas')) return 'hipflexors';
      return '';
    }
    if (major === 'core') {
      if (token.includes('upperabs')) return 'upperabs';
      if (token.includes('lowerabs')) return 'lowerabs';
      if (token === 'abs') return 'abdominals';
      if (token.includes('abdom')) return 'abdominals';
      if (token.includes('oblique')) return 'obliques';
      if (token.includes('serratus')) return 'serratus';
      if (token.includes('transverse')) return 'transverseabs';
      return '';
    }
    if (major === 'neck') return 'neck';
    if (major === 'full_body') return 'fullbody';
    return '';
  }

  function defaultSwapSubgroupForMajor(major) {
    if (major === 'chest') return 'middlechest';
    if (major === 'back') return 'middleback';
    if (major === 'shoulders') return 'shoulders';
    if (major === 'arms') return 'biceps';
    if (major === 'legs') return 'quadriceps';
    if (major === 'core') return 'abdominals';
    if (major === 'neck') return 'neck';
    if (major === 'full_body') return 'fullbody';
    return 'general';
  }

  function swapSubgroupFromName(major, rawName) {
    const name = normalizeTextForMatch(rawName || '');
    if (!name || !major) return { key: '', specific: false };
    const hasAny = (parts) => parts.some((part) => name.includes(part));

    if (major === 'chest') {
      if (hasAny(['incline', 'clavicular', 'low to high'])) return { key: 'upperchest', specific: true };
      if (hasAny(['decline', 'high to low'])) return { key: 'lowerchest', specific: true };
      if (hasAny(['inner', 'squeeze', 'hex press'])) return { key: 'innerchest', specific: true };
      return { key: 'middlechest', specific: false };
    }
    if (major === 'back') {
      if (hasAny(['pull-up', 'pull up', 'chin-up', 'chin up', 'pulldown', 'lat pull'])) return { key: 'lats', specific: true };
      if (hasAny(['shrug', 'trap'])) return { key: 'traps', specific: true };
      if (hasAny(['rhomboid'])) return { key: 'rhomboids', specific: true };
      if (hasAny(['deadlift', 'back extension', 'hyperextension', 'good morning', 'erector'])) return { key: 'lowerback', specific: true };
      if (hasAny(['row', 't-bar', 'seated row'])) return { key: 'middleback', specific: true };
      return { key: 'upperback', specific: false };
    }
    if (major === 'shoulders') {
      if (hasAny(['lateral raise', 'side raise'])) return { key: 'sidedelts', specific: true };
      if (hasAny(['rear delt', 'reverse fly', 'face pull'])) return { key: 'reardelts', specific: true };
      if (hasAny(['external rotation', 'internal rotation', 'rotator cuff'])) return { key: 'rotatorcuff', specific: true };
      if (hasAny(['front raise'])) return { key: 'frontdelts', specific: true };
      return { key: 'shoulders', specific: false };
    }
    if (major === 'arms') {
      if (hasAny(['tricep', 'pushdown', 'skull', 'extension', 'kickback', 'close grip bench'])) return { key: 'triceps', specific: true };
      if (hasAny(['wrist', 'grip', 'reverse curl'])) return { key: 'forearms', specific: true };
      if (hasAny(['hammer curl', 'brachialis'])) return { key: 'brachialis', specific: true };
      if (hasAny(['curl', 'bicep', 'chin-up', 'chin up'])) return { key: 'biceps', specific: true };
      return { key: 'biceps', specific: false };
    }
    if (major === 'legs') {
      if (hasAny(['calf'])) return { key: 'calves', specific: true };
      if (hasAny(['hamstring', 'leg curl', 'rdl', 'stiff'])) return { key: 'hamstrings', specific: true };
      if (hasAny(['glute', 'hip thrust', 'bridge', 'kickback'])) return { key: 'glutes', specific: true };
      if (hasAny(['adductor'])) return { key: 'adductors', specific: true };
      if (hasAny(['abductor'])) return { key: 'abductors', specific: true };
      if (hasAny(['hip flexor'])) return { key: 'hipflexors', specific: true };
      if (hasAny(['squat', 'leg press', 'lunge', 'split squat', 'step-up', 'leg extension', 'quad'])) return { key: 'quadriceps', specific: true };
      return { key: 'quadriceps', specific: false };
    }
    if (major === 'core') {
      if (hasAny(['oblique', 'side plank', 'russian twist', 'woodchop'])) return { key: 'obliques', specific: true };
      if (hasAny(['leg raise', 'reverse crunch', 'hanging knee'])) return { key: 'lowerabs', specific: true };
      if (hasAny(['crunch', 'sit-up', 'sit up'])) return { key: 'upperabs', specific: true };
      if (hasAny(['plank', 'hollow', 'dead bug', 'brace'])) return { key: 'transverseabs', specific: true };
      if (hasAny(['serratus'])) return { key: 'serratus', specific: true };
      return { key: 'abdominals', specific: false };
    }
    if (major === 'neck') return { key: 'neck', specific: true };
    if (major === 'full_body') return { key: 'fullbody', specific: true };
    return { key: 'general', specific: false };
  }

  function swapSubgroupFromIntent(major, rawIntentKey) {
    const key = normalizeTextForMatch(rawIntentKey || '');
    if (!major || !key) return { key: '', specific: false };
    if (major === 'chest') {
      if (key.includes('upper chest') || key.includes('chest incline')) return { key: 'upperchest', specific: true };
      if (key.includes('lower chest') || key.includes('chest decline')) return { key: 'lowerchest', specific: true };
      if (key.includes('chest fly')) return { key: 'innerchest', specific: true };
      if (key.includes('chest')) return { key: 'middlechest', specific: false };
    }
    if (major === 'back') {
      if (key.includes('vertical pull') || key.includes('lats')) return { key: 'lats', specific: true };
      if (key.includes('row')) return { key: 'middleback', specific: true };
      if (key.includes('upper back')) return { key: 'upperback', specific: true };
      if (key.includes('trap')) return { key: 'traps', specific: true };
      if (key.includes('hinge')) return { key: 'lowerback', specific: true };
    }
    if (major === 'shoulders') {
      if (key.includes('delts side')) return { key: 'sidedelts', specific: true };
      if (key.includes('delts rear')) return { key: 'reardelts', specific: true };
      if (key.includes('delts front')) return { key: 'frontdelts', specific: true };
      if (key.includes('overhead press') || key.includes('shoulder')) return { key: 'shoulders', specific: false };
    }
    if (major === 'arms') {
      if (key.includes('triceps')) return { key: 'triceps', specific: true };
      if (key.includes('biceps')) return { key: 'biceps', specific: true };
      if (key.includes('forearm')) return { key: 'forearms', specific: true };
    }
    if (major === 'legs') {
      if (key.includes('quad') || key.includes('knee dominant')) return { key: 'quadriceps', specific: true };
      if (key.includes('hamstring')) return { key: 'hamstrings', specific: true };
      if (key.includes('glute')) return { key: 'glutes', specific: true };
      if (key.includes('calves')) return { key: 'calves', specific: true };
      if (key.includes('adductor')) return { key: 'adductors', specific: true };
      if (key.includes('abductor')) return { key: 'abductors', specific: true };
      if (key.includes('hip hinge')) return { key: 'hamstrings', specific: true };
    }
    if (major === 'core') {
      if (key.includes('oblique') || key.includes('rotation')) return { key: 'obliques', specific: true };
      if (key.includes('lower abs')) return { key: 'lowerabs', specific: true };
      if (key.includes('upper abs')) return { key: 'upperabs', specific: true };
      if (key.includes('core brace')) return { key: 'transverseabs', specific: true };
      if (key.includes('abs') || key.includes('core')) return { key: 'abdominals', specific: false };
    }
    if (major === 'neck' && key.includes('neck')) return { key: 'neck', specific: true };
    if (major === 'full_body' && key.includes('full body')) return { key: 'fullbody', specific: true };
    return { key: '', specific: false };
  }

  const CONTROLLED_PRIMARY_GROUP_ALIASES = {
    chest: 'chest',
    pectorals: 'chest',
    back: 'back',
    lats: 'back',
    middle_back: 'back',
    mid_back: 'back',
    upper_back: 'back',
    lower_back: 'back',
    traps: 'back',
    spinal_erectors: 'back',
    shoulders: 'shoulders',
    shoulder: 'shoulders',
    delts: 'shoulders',
    anterior_delts: 'shoulders',
    front_delts: 'shoulders',
    lateral_delts: 'shoulders',
    side_delts: 'shoulders',
    rear_delts: 'shoulders',
    arms: 'arms',
    arm: 'arms',
    biceps: 'arms',
    triceps: 'arms',
    forearms: 'arms',
    brachialis: 'arms',
    legs: 'legs',
    leg: 'legs',
    quadriceps: 'legs',
    quads: 'legs',
    hamstrings: 'legs',
    glutes: 'legs',
    calves: 'legs',
    adductors: 'legs',
    abductors: 'legs',
    core: 'core',
    abs: 'core',
    abdominals: 'core',
    obliques: 'core',
    hip_flexors: 'core',
    neck: 'neck',
    full_body: 'full_body',
    fullbody: 'full_body'
  };

  const CONTROLLED_SUBGROUP_ALIASES = {
    upper_chest: 'upper_chest',
    clavicular_chest: 'upper_chest',
    mid_chest: 'mid_chest',
    middle_chest: 'mid_chest',
    sternal_chest: 'mid_chest',
    lower_chest: 'lower_chest',
    costal_chest: 'lower_chest',
    lats: 'lats',
    lat_width: 'lats',
    teres_major: 'lats',
    upper_back: 'upper_back',
    mid_back: 'upper_back',
    middle_back: 'upper_back',
    rhomboids: 'upper_back',
    traps: 'upper_back',
    rear_delts: 'rear_delts',
    front_delts: 'front_delts',
    side_delts: 'side_delts',
    lateral_delts: 'side_delts',
    biceps: 'biceps',
    brachialis: 'biceps',
    triceps: 'triceps',
    forearms: 'forearms',
    quads: 'quads',
    quadriceps: 'quads',
    hamstrings: 'hamstrings',
    glutes: 'glutes',
    calves: 'calves',
    adductors: 'adductors',
    abductors: 'abductors',
    upper_abs: 'upper_abs',
    lower_abs: 'lower_abs',
    obliques: 'obliques',
    hip_flexors: 'hip_flexors',
    neck: 'neck',
    spinal_erectors: 'spinal_erectors'
  };

  const CONTROLLED_RELATED_SUBGROUPS = {
    upper_chest: ['mid_chest'],
    mid_chest: ['upper_chest', 'lower_chest'],
    lower_chest: ['mid_chest'],
    lats: ['upper_back'],
    upper_back: ['lats', 'rear_delts'],
    front_delts: ['side_delts'],
    side_delts: ['front_delts', 'rear_delts'],
    rear_delts: ['side_delts', 'upper_back'],
    biceps: ['forearms'],
    triceps: [],
    forearms: ['biceps'],
    quads: ['glutes', 'adductors'],
    hamstrings: ['glutes'],
    glutes: ['hamstrings', 'quads'],
    calves: [],
    adductors: ['quads', 'glutes'],
    abductors: ['glutes'],
    upper_abs: ['lower_abs', 'obliques'],
    lower_abs: ['upper_abs', 'obliques', 'hip_flexors'],
    obliques: ['upper_abs', 'lower_abs'],
    hip_flexors: ['lower_abs'],
    neck: [],
    spinal_erectors: ['hamstrings', 'glutes']
  };

  function controlledPrimaryMuscleGroupFromValue(raw) {
    const token = normalizeTextForMatch(raw || '').replace(/\s+/g, '_');
    return CONTROLLED_PRIMARY_GROUP_ALIASES[token] || '';
  }

  function controlledSubMuscleGroupFromValue(raw, primaryGroup = '') {
    const token = normalizeTextForMatch(raw || '').replace(/\s+/g, '_');
    if (!token) return '';
    if (CONTROLLED_SUBGROUP_ALIASES[token]) return CONTROLLED_SUBGROUP_ALIASES[token];

    if (primaryGroup === 'chest') {
      if (/(upper|clavicular|incline)/.test(token)) return 'upper_chest';
      if (/(lower|costal|decline)/.test(token)) return 'lower_chest';
      if (/(mid|middle|stern)/.test(token)) return 'mid_chest';
      return 'mid_chest';
    }
    if (primaryGroup === 'back') {
      if (/(lat|teres)/.test(token)) return 'lats';
      if (/(spinal|erector|lower_back)/.test(token)) return 'spinal_erectors';
      return 'upper_back';
    }
    if (primaryGroup === 'shoulders') {
      if (/(front|anterior)/.test(token)) return 'front_delts';
      if (/(rear|posterior)/.test(token)) return 'rear_delts';
      return 'side_delts';
    }
    if (primaryGroup === 'arms') {
      if (/tricep/.test(token)) return 'triceps';
      if (/(forearm|brachioradialis)/.test(token)) return 'forearms';
      return 'biceps';
    }
    if (primaryGroup === 'legs') {
      if (/(quad|vastus|rectus_femoris)/.test(token)) return 'quads';
      if (/(hamstring|biceps_femoris|semitendinosus|semimembranosus)/.test(token)) return 'hamstrings';
      if (/glute/.test(token)) return 'glutes';
      if (/(calf|gastrocnemius|soleus)/.test(token)) return 'calves';
      if (/adductor/.test(token)) return 'adductors';
      if (/abductor/.test(token)) return 'abductors';
      if (/hip_flexor|iliopsoas/.test(token)) return 'hip_flexors';
      return '';
    }
    if (primaryGroup === 'core') {
      if (/oblique/.test(token)) return 'obliques';
      if (/lower_abs/.test(token)) return 'lower_abs';
      if (/(upper_abs|abdominals|rectus_abdominis)/.test(token)) return 'upper_abs';
      if (/(hip_flexor|iliopsoas)/.test(token)) return 'hip_flexors';
      return 'upper_abs';
    }
    if (primaryGroup === 'neck') return 'neck';
    return '';
  }

  function deriveControlledSwapTaxonomy(entry, fallbackEx = null) {
    const explicitPrimary = controlledPrimaryMuscleGroupFromValue(entry?.primaryMuscleGroup || fallbackEx?.primaryMuscleGroup || '');
    const primaryCandidates = [
      explicitPrimary,
      ...(Array.isArray(entry?.primaryMuscles) ? entry.primaryMuscles : []),
      ...(Array.isArray(fallbackEx?.primaryMuscles) ? fallbackEx.primaryMuscles : []),
      fallbackEx?.muscle_group,
      fallbackEx?.muscleGroup,
      fallbackEx?.muscle
    ];
    let primaryMuscleGroup = '';
    for (const raw of primaryCandidates) {
      const mapped = controlledPrimaryMuscleGroupFromValue(raw);
      if (mapped) {
        primaryMuscleGroup = mapped;
        break;
      }
    }

    if (!primaryMuscleGroup) {
      const guess = swapMajorFromExercise(entry, fallbackEx);
      primaryMuscleGroup = controlledPrimaryMuscleGroupFromValue(guess);
    }

    const explicitSub = controlledSubMuscleGroupFromValue(entry?.subMuscleGroup || fallbackEx?.subMuscleGroup || '', primaryMuscleGroup);
    const subCandidates = [
      explicitSub,
      ...(Array.isArray(entry?.subMuscleGroups) ? entry.subMuscleGroups : []),
      ...(Array.isArray(fallbackEx?.subMuscleGroups) ? fallbackEx.subMuscleGroups : []),
      entry?.targetRegion,
      fallbackEx?.targetRegion
    ];
    let subMuscleGroup = '';
    for (const raw of subCandidates) {
      const mapped = controlledSubMuscleGroupFromValue(raw, primaryMuscleGroup);
      if (mapped) {
        subMuscleGroup = mapped;
        break;
      }
    }

    if (!subMuscleGroup && primaryMuscleGroup) {
      const fromName = controlledSubMuscleGroupFromValue(entry?.name || fallbackEx?.displayName || fallbackEx?.name || '', primaryMuscleGroup);
      if (fromName) subMuscleGroup = fromName;
    }

    return {
      primaryMuscleGroup: primaryMuscleGroup || '',
      subMuscleGroup: subMuscleGroup || ''
    };
  }

  function mapControlledSubgroupToLegacy(subgroup) {
    const map = {
      upper_chest: 'upperchest',
      mid_chest: 'middlechest',
      lower_chest: 'lowerchest',
      lats: 'lats',
      upper_back: 'upperback',
      spinal_erectors: 'lowerback',
      front_delts: 'frontdelts',
      side_delts: 'sidedelts',
      rear_delts: 'reardelts',
      biceps: 'biceps',
      triceps: 'triceps',
      forearms: 'forearms',
      quads: 'quadriceps',
      hamstrings: 'hamstrings',
      glutes: 'glutes',
      calves: 'calves',
      adductors: 'adductors',
      abductors: 'abductors',
      upper_abs: 'upperabs',
      lower_abs: 'lowerabs',
      obliques: 'obliques',
      hip_flexors: 'hipflexors',
      neck: 'neck'
    };
    return map[String(subgroup || '').trim()] || '';
  }

  function rawMuscleTokens(entry, fallbackEx = null) {
    const prim = Array.isArray(entry?.primaryMuscles)
      ? entry.primaryMuscles
      : (Array.isArray(fallbackEx?.primaryMuscles) ? fallbackEx.primaryMuscles : []);
    const sec = Array.isArray(entry?.secondaryMuscles)
      ? entry.secondaryMuscles
      : (Array.isArray(fallbackEx?.secondaryMuscles) ? fallbackEx.secondaryMuscles : []);
    const fallbackMuscleKeys = Array.isArray(fallbackEx?.muscleKeys)
      ? fallbackEx.muscleKeys.map((m) => String(m || '').trim()).filter(Boolean)
      : [];
    const explicitGroup = [
      fallbackEx?.muscle_group,
      fallbackEx?.muscleGroup,
      fallbackEx?.muscle
    ].map((m) => String(m || '').trim()).filter(Boolean);
    return {
      primary: Array.from(new Set([
        ...prim.map((m) => String(m || '')).filter(Boolean),
        ...explicitGroup,
        ...fallbackMuscleKeys
      ])),
      secondary: sec.map((m) => String(m || '')).filter(Boolean)
    };
  }

  function swapMajorFromExercise(entry, fallbackEx = null) {
    const nameNorm = normalizeTextForMatch(entry?.name || fallbackEx?.displayName || fallbackEx?.name || '');
    const intentNorm = normalizeTextForMatch(fallbackEx?.intentKey || '');
    const movementNorm = normalizeTextForMatch(fallbackEx?.movementPattern || '');
    const { primary, secondary } = rawMuscleTokens(entry, fallbackEx);
    const scores = new Map([
      ['chest', 0],
      ['back', 0],
      ['shoulders', 0],
      ['arms', 0],
      ['legs', 0],
      ['core', 0],
      ['neck', 0],
      ['full_body', 0],
      ['other', 0]
    ]);
    const add = (key, weight) => {
      if (!key || !Number.isFinite(weight)) return;
      scores.set(key, (scores.get(key) || 0) + weight);
    };

    primary.forEach((token) => add(swapMajorFromToken(token), 3));
    secondary.forEach((token) => add(swapMajorFromToken(token), 1.35));
    add(swapMajorFromIntentKey(intentNorm), 3.2);

    if (movementNorm === 'press' || movementNorm === 'horizontal press') add('chest', 1.6);
    if (movementNorm === 'ohp' || movementNorm === 'overhead press') add('shoulders', 1.6);
    if (movementNorm === 'row' || movementNorm === 'vertical pull' || movementNorm === 'vertical_pull') add('back', 1.7);
    if (movementNorm === 'squat' || movementNorm === 'hinge') add('legs', 1.8);

    if (/(bench|chest|push up|push-up|dips|crossover|pec deck|fly)/.test(nameNorm)) add('chest', 3.5);
    if (/(row|pulldown|pull up|pull-up|chin up|chin-up|lat)/.test(nameNorm)) add('back', 3.5);
    if (/(overhead|shoulder press|military press|arnold|lateral raise|rear delt|front raise)/.test(nameNorm)) add('shoulders', 3.2);
    if (/(bicep|curl|tricep|pushdown|skull crusher|kickback|forearm)/.test(nameNorm)) add('arms', 3.2);
    if (/(squat|lunge|leg press|hack squat|leg extension|leg curl|deadlift|rdl|hip thrust|calf)/.test(nameNorm)) add('legs', 3.6);
    if (/(plank|crunch|sit up|sit-up|oblique|woodchop|hollow|dead bug|ab wheel|ab roller)/.test(nameNorm)) add('core', 3.2);
    if (/neck/.test(nameNorm)) add('neck', 4);
    if (/(clean and jerk|snatch|burpee|thruster|man maker)/.test(nameNorm)) add('full_body', 2.8);

    let bestKey = 'other';
    let bestScore = -1;
    for (const [key, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    return bestScore > 0 ? bestKey : 'other';
  }

  function swapForceFromExercise(entry, fallbackEx = null, subgroup = '') {
    const force = normalizeTextForMatch(entry?.force || fallbackEx?.force || '');
    if (force === 'push' || force === 'pull' || force === 'static') return force;
    if (subgroup === 'biceps' || subgroup === 'forearms' || subgroup === 'brachialis' || subgroup === 'lats' || subgroup === 'middleback' || subgroup === 'upperback' || subgroup === 'rhomboids' || subgroup === 'traps') {
      return 'pull';
    }
    if (subgroup === 'triceps' || subgroup === 'quadriceps' || subgroup === 'calves' || subgroup === 'upperchest' || subgroup === 'middlechest' || subgroup === 'lowerchest' || subgroup === 'innerchest' || subgroup === 'frontdelts' || subgroup === 'sidedelts') {
      return 'push';
    }
    return '';
  }

  function swapMovementFamilyFromExercise(entry, major, subgroup, fallbackEx = null) {
    const name = normalizeTextForMatch(entry?.name || fallbackEx?.displayName || fallbackEx?.name || '');
    const mechanic = normalizeTextForMatch(entry?.mechanic || fallbackEx?.mechanic || fallbackEx?.stimulusType || '');
    if (major === 'chest') {
      if (/(fly|crossover|pec deck)/.test(name)) return 'chest_fly';
      if (/(bench|press|push up|push-up|dip)/.test(name)) return 'chest_press';
    }
    if (major === 'back') {
      if (/(pulldown|pull up|pull-up|chin up|chin-up|lat pull)/.test(name)) return 'vertical_pull';
      if (/(row|seal row|t bar|single arm row)/.test(name)) return 'row';
      if (/(deadlift|good morning|back extension|hyperextension)/.test(name)) return 'hip_hinge';
    }
    if (major === 'shoulders') {
      if (/(overhead|shoulder press|military press|arnold)/.test(name)) return 'shoulder_press';
      if (/(lateral raise|side raise|front raise|rear delt|reverse fly|face pull)/.test(name)) return 'shoulder_raise';
    }
    if (major === 'arms') {
      if (subgroup === 'triceps' || /(tricep|pushdown|skull|extension|kickback|close grip bench)/.test(name)) return 'triceps_extension';
      if (subgroup === 'biceps' || subgroup === 'brachialis' || /(curl|chin up|chin-up)/.test(name)) return 'biceps_curl';
      if (subgroup === 'forearms' || /(wrist curl|grip|reverse curl)/.test(name)) return 'forearm_work';
    }
    if (major === 'legs') {
      if (subgroup === 'quadriceps' && /(leg extension|extension)/.test(name)) return 'leg_extension';
      if (subgroup === 'hamstrings' && /(leg curl|hamstring curl)/.test(name)) return 'leg_curl';
      if (/(calf raise)/.test(name) || subgroup === 'calves') return 'calf_raise';
      if (/(lunge|split squat|step up|step-up|bulgarian)/.test(name)) return 'single_leg';
      if (/(deadlift|rdl|romanian|good morning|hip thrust|glute bridge|back extension)/.test(name) || subgroup === 'hamstrings' || subgroup === 'glutes') return 'hip_hinge';
      if (/(squat|leg press|hack squat|front squat|goblet squat)/.test(name) || subgroup === 'quadriceps') return 'knee_dominant';
    }
    if (major === 'core') {
      if (/(plank|hollow|dead bug|ab wheel rollout)/.test(name)) return 'core_brace';
      if (/(crunch|sit up|sit-up|leg raise|knee raise)/.test(name)) return 'core_flexion';
      if (/(twist|rotation|woodchop|oblique)/.test(name)) return 'core_rotation';
    }
    if (mechanic.includes('isolation')) return `${major}_isolation`;
    if (mechanic.includes('compound')) return `${major}_compound`;
    return '';
  }

  function swapMovementFamilyFromIntent(intentKeyRaw, movementPatternRaw, major, subgroup) {
    const intentKey = normalizeTextForMatch(intentKeyRaw || '');
    const movementPattern = normalizeTextForMatch(movementPatternRaw || '');
    if (major === 'chest') {
      if (intentKey.includes('chest fly')) return 'chest_fly';
      if (intentKey.includes('chest press') || movementPattern === 'press') return 'chest_press';
    }
    if (major === 'back') {
      if (intentKey.includes('vertical pull') || movementPattern === 'vertical pull' || movementPattern === 'vertical_pull') return 'vertical_pull';
      if (intentKey.includes('row') || movementPattern === 'row') return 'row';
      if (intentKey.includes('hinge') || movementPattern === 'hinge') return 'hip_hinge';
    }
    if (major === 'shoulders') {
      if (intentKey.includes('overhead press') || movementPattern === 'ohp' || movementPattern === 'overhead press') return 'shoulder_press';
      if (intentKey.includes('delts side') || intentKey.includes('delts rear') || intentKey.includes('delts front')) return 'shoulder_raise';
    }
    if (major === 'arms') {
      if (subgroup === 'triceps' || intentKey.includes('triceps extension')) return 'triceps_extension';
      if (subgroup === 'biceps' || subgroup === 'brachialis' || intentKey.includes('biceps curl')) return 'biceps_curl';
      if (subgroup === 'forearms' || intentKey.includes('forearm')) return 'forearm_work';
    }
    if (major === 'legs') {
      if (subgroup === 'quadriceps' && intentKey.includes('knee dominant')) return 'knee_dominant';
      if (subgroup === 'quadriceps' && intentKey.includes('leg extension')) return 'leg_extension';
      if (subgroup === 'hamstrings' && intentKey.includes('leg curl')) return 'leg_curl';
      if (subgroup === 'calves' || intentKey.includes('calves')) return 'calf_raise';
      if (movementPattern === 'hinge' || intentKey.includes('hip hinge')) return 'hip_hinge';
      if (movementPattern === 'squat' || intentKey.includes('knee dominant')) return 'knee_dominant';
    }
    if (major === 'core') {
      if (intentKey.includes('rotation') || intentKey.includes('oblique')) return 'core_rotation';
      if (intentKey.includes('brace')) return 'core_brace';
      if (intentKey.includes('abs') || intentKey.includes('core')) return 'core_flexion';
    }
    return '';
  }

  function buildSwapProfile(entry, fallbackEx = null) {
    const fallbackNameFromId = String(fallbackEx?.exerciseId || fallbackEx?.baseId || '').replace(/_/g, ' ');
    const name = String(entry?.name || fallbackEx?.displayName || fallbackEx?.name || fallbackNameFromId || '').trim();
    const taxonomy = deriveControlledSwapTaxonomy(entry, fallbackEx);
    let major = taxonomy.primaryMuscleGroup || swapMajorFromExercise(entry, fallbackEx);
    if (!major || major === 'other') {
      major = swapMajorFromIntentKey(fallbackEx?.intentKey || '') || major;
    }
    const { primary, secondary } = rawMuscleTokens(entry, fallbackEx);

    let subgroup = mapControlledSubgroupToLegacy(taxonomy.subMuscleGroup);
    let subgroupSpecific = false;
    if (subgroup) {
      subgroupSpecific = true;
    } else {
      for (const token of primary) {
        const mapped = swapSubgroupFromToken(major, token);
        if (mapped) {
          subgroup = mapped;
          subgroupSpecific = true;
          break;
        }
      }
    }
    if (!subgroup) {
      for (const token of secondary) {
        const mapped = swapSubgroupFromToken(major, token);
        if (mapped) {
          subgroup = mapped;
          subgroupSpecific = true;
          break;
        }
      }
    }
    if (!subgroup) {
      const fromName = swapSubgroupFromName(major, name);
      subgroup = fromName.key;
      subgroupSpecific = Boolean(fromName.specific);
    }
    if (!subgroup) {
      const fromIntent = swapSubgroupFromIntent(major, fallbackEx?.intentKey || '');
      subgroup = fromIntent.key;
      subgroupSpecific = Boolean(fromIntent.specific);
    }
    if (!subgroup) subgroup = defaultSwapSubgroupForMajor(major);

    const force = swapForceFromExercise(entry, fallbackEx, subgroup);
    const movementFamily = swapMovementFamilyFromExercise(entry, major, subgroup, fallbackEx)
      || swapMovementFamilyFromIntent(fallbackEx?.intentKey || '', fallbackEx?.movementPattern || '', major, subgroup);
    const muscleKeys = new Set();
    if (major && major !== 'other') muscleKeys.add(major);
    if (subgroup) muscleKeys.add(subgroup);
    if (taxonomy.primaryMuscleGroup) muscleKeys.add(taxonomy.primaryMuscleGroup);
    if (taxonomy.subMuscleGroup) muscleKeys.add(taxonomy.subMuscleGroup);

    return {
      name,
      nameNorm: normalizeTextForMatch(name),
      major,
      subgroup,
      primaryMuscleGroup: taxonomy.primaryMuscleGroup,
      subMuscleGroup: taxonomy.subMuscleGroup,
      subgroupSpecific,
      force,
      movementFamily,
      equipmentClass: equipmentClassFromName(entry || fallbackEx || {}),
      muscleKeys: Array.from(muscleKeys)
    };
  }

  function resolveSwapCatalogEntry(ex) {
    const byId = String(ex?.exerciseId || ex?.baseId || ex?.id || '').trim();
    if (byId && exerciseIndexById.has(byId)) return exerciseIndexById.get(byId);
    const idAsNameNorm = normalizeTextForMatch(byId.replace(/[_-]+/g, ' '));
    if (idAsNameNorm && exerciseIndexByNameNorm.has(idAsNameNorm)) return exerciseIndexByNameNorm.get(idAsNameNorm);
    const byNameNorm = normalizeTextForMatch(ex?.displayName || ex?.name || '');
    if (byNameNorm && exerciseIndexByNameNorm.has(byNameNorm)) return exerciseIndexByNameNorm.get(byNameNorm);
    return null;
  }

  function movementFamilyCompatible(sourceProfile, candidateProfile) {
    const src = String(sourceProfile?.movementFamily || '').trim();
    const cand = String(candidateProfile?.movementFamily || '').trim();
    if (!src || !cand) return false;
    if (src === cand) return true;
    const compat = {
      chest_press: ['chest_press'],
      chest_fly: ['chest_fly'],
      vertical_pull: ['vertical_pull'],
      row: ['row'],
      shoulder_press: ['shoulder_press'],
      shoulder_raise: ['shoulder_raise'],
      triceps_extension: ['triceps_extension'],
      biceps_curl: ['biceps_curl'],
      forearm_work: ['forearm_work', 'biceps_curl'],
      knee_dominant: ['knee_dominant', 'single_leg'],
      single_leg: ['single_leg', 'knee_dominant'],
      hip_hinge: ['hip_hinge'],
      leg_extension: ['leg_extension', 'knee_dominant'],
      leg_curl: ['leg_curl', 'hip_hinge'],
      calf_raise: ['calf_raise'],
      core_brace: ['core_brace'],
      core_flexion: ['core_flexion'],
      core_rotation: ['core_rotation']
    };
    return Array.isArray(compat[src]) ? compat[src].includes(cand) : false;
  }

  function majorCompatible(sourceProfile, candidateProfile) {
    const srcMajor = String(sourceProfile?.primaryMuscleGroup || sourceProfile?.major || '');
    const candMajor = String(candidateProfile?.primaryMuscleGroup || candidateProfile?.major || '');
    if (!srcMajor || srcMajor === 'other') return false;
    if (!candMajor || candMajor === 'other') return false;
    return candMajor === srcMajor;
  }

  function forceCompatible(sourceProfile, candidateProfile) {
    const srcForce = String(sourceProfile?.force || '').trim();
    const candForce = String(candidateProfile?.force || '').trim();
    if (!srcForce || !candForce) return false;
    return srcForce === candForce;
  }

  function subgroupSimilarityScore(sourceProfile, candidateProfile) {
    const srcSubgroup = String(sourceProfile?.subMuscleGroup || sourceProfile?.subgroup || '').trim();
    const candSubgroup = String(candidateProfile?.subMuscleGroup || candidateProfile?.subgroup || '').trim();
    if (!srcSubgroup || !candSubgroup) return 0.28;
    if (srcSubgroup === candSubgroup) return 1;
    const related = Array.isArray(CONTROLLED_RELATED_SUBGROUPS[srcSubgroup]) ? CONTROLLED_RELATED_SUBGROUPS[srcSubgroup] : [];
    if (related.includes(candSubgroup)) return 0.72;
    return 0.2;
  }

  function movementFamilySimilarityScore(sourceProfile, candidateProfile) {
    const srcFamily = String(sourceProfile?.movementFamily || '').trim();
    const candFamily = String(candidateProfile?.movementFamily || '').trim();
    if (!srcFamily || !candFamily) return 0.25;
    if (srcFamily === candFamily) return 1;
    if (movementFamilyCompatible(sourceProfile, candidateProfile)) return 0.72;
    return 0.2;
  }

  function forceSimilarityScore(sourceProfile, candidateProfile) {
    const srcForce = String(sourceProfile?.force || '').trim();
    const candForce = String(candidateProfile?.force || '').trim();
    if (!srcForce || !candForce) return 0.2;
    if (srcForce === candForce) return 1;
    return 0.25;
  }

  function swapTierFromProfiles(sourceProfile, candidateProfile) {
    const srcPrimary = String(sourceProfile?.primaryMuscleGroup || sourceProfile?.major || '').trim();
    const candPrimary = String(candidateProfile?.primaryMuscleGroup || candidateProfile?.major || '').trim();
    const srcSubgroup = String(sourceProfile?.subMuscleGroup || sourceProfile?.subgroup || '').trim();
    const candSubgroup = String(candidateProfile?.subMuscleGroup || candidateProfile?.subgroup || '').trim();
    const samePrimary = Boolean(srcPrimary && candPrimary && srcPrimary === candPrimary);
    const subgroupExact = Boolean(srcSubgroup && candSubgroup && srcSubgroup === candSubgroup);
    if (samePrimary && subgroupExact) return 1;
    if (samePrimary) {
      const related = Array.isArray(CONTROLLED_RELATED_SUBGROUPS[srcSubgroup]) ? CONTROLLED_RELATED_SUBGROUPS[srcSubgroup] : [];
      if (candSubgroup && related.includes(candSubgroup)) return 2;
      return 3;
    }
    return 4;
  }

  function compareSwapScores(a, b) {
    const tierA = Number(a?.tier || 99);
    const tierB = Number(b?.tier || 99);
    if (tierA !== tierB) return tierA - tierB;
    const scoreA = Number(a?.score || 0);
    const scoreB = Number(b?.score || 0);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  }

  function finalizeRankedSwapCandidates(scored, limit = 6) {
    const ranked = Array.isArray(scored) ? scored.slice().sort(compareSwapScores) : [];
    const primary = ranked.filter((item) => Number(item?.tier) === 1);
    const secondary = ranked.filter((item) => Number(item?.tier) === 2);
    const ancillary = ranked.filter((item) => Number(item?.tier) === 3);
    if (primary.length) return primary.concat(secondary).slice(0, limit).map((item) => item.id);
    if (secondary.length) return secondary.slice(0, limit).map((item) => item.id);
    return ancillary.slice(0, limit).map((item) => item.id);
  }

  function scoreSwapCandidate({
    sourceProfile,
    candidateProfile,
    candidateEntry,
    wantMuscles,
    wantTokens
  }) {
    const muscles = Array.isArray(candidateProfile?.muscleKeys) ? candidateProfile.muscleKeys : [];
    const muscleOverlap = wantMuscles.length
      ? wantMuscles.filter((m) => muscles.includes(m)).length / wantMuscles.length
      : 0;
    const nameTokens = normalizeTextForMatch(candidateEntry?.name || '').split(' ').filter(Boolean);
    const tokenOverlap = nameTokens.filter((t) => wantTokens.includes(t)).length / Math.max(1, wantTokens.length);
    const subgroupScore = subgroupSimilarityScore(sourceProfile, candidateProfile);
    const familyScore = movementFamilySimilarityScore(sourceProfile, candidateProfile);
    const forceScore = forceSimilarityScore(sourceProfile, candidateProfile);
    const eqScore = sourceProfile?.equipmentClass && sourceProfile.equipmentClass === candidateProfile?.equipmentClass ? 1 : 0.5;
    const commonnessScore = commonGymSwapScore(sourceProfile, candidateEntry, candidateProfile);
    const complianceScore = isLowComplianceSwapEntry(candidateEntry)
      ? 0.05
      : (candidateProfile?.equipmentClass === 'other' ? 0.25 : 1);
    const score = (subgroupScore * 0.28) + (familyScore * 0.24) + (forceScore * 0.1) + (eqScore * 0.1) + (tokenOverlap * 0.04) + (muscleOverlap * 0.04) + (complianceScore * 0.08) + (commonnessScore * 0.12);

    return {
      score,
      tier: swapTierFromProfiles(sourceProfile, candidateProfile)
    };
  }

  function mapExerciseMuscles(entry) {
    const profile = buildSwapProfile(entry);
    return profile.muscleKeys.filter(Boolean);
  }

  function equipmentAllowed(access, eqClass) {
    const allow = access && typeof access === 'object' ? access : {};
    const enabledCount = ['bodyweight', 'dumbbell', 'barbell', 'cable', 'machine']
      .filter((key) => Boolean(allow[key]))
      .length;
    if (!enabledCount) return true;
    if (eqClass === 'barbell') return Boolean(allow.barbell);
    if (eqClass === 'dumbbell') return Boolean(allow.dumbbell);
    if (eqClass === 'cable') return Boolean(allow.cable);
    if (eqClass === 'machine') return Boolean(allow.machine);
    if (eqClass === 'bodyweight') return Boolean(allow.bodyweight);
    return true;
  }

  function effectiveSwapEquipmentAccess(access, sourceProfile) {
    const allow = access && typeof access === 'object' ? access : {};
    const standardGymEnabled = Boolean(allow.dumbbell || allow.barbell || allow.cable || allow.machine);
    const sourceEq = String(sourceProfile?.equipmentClass || '');
    if (!standardGymEnabled && sourceEq && sourceEq !== 'bodyweight' && sourceEq !== 'other') {
      return {
        bodyweight: true,
        dumbbell: true,
        barbell: true,
        cable: true,
        machine: true
      };
    }
    return allow;
  }

  function normalizeAllowedEquipmentClassSet(rawAllowed) {
    if (!Array.isArray(rawAllowed) || !rawAllowed.length) return null;
    const normalized = new Set();
    rawAllowed.forEach((raw) => {
      const token = normalizeTextForMatch(raw);
      if (!token) return;
      if (token === 'any') {
        normalized.add('any');
        return;
      }
      if (token === 'free weights' || token === 'freeweights') {
        normalized.add('barbell');
        normalized.add('dumbbell');
        return;
      }
      if (token === 'machines' || token === 'machine') {
        normalized.add('machine');
        normalized.add('cable');
        return;
      }
      if (token === 'bodyweight' || token === 'calisthenics' || token === 'body only') {
        normalized.add('bodyweight');
        return;
      }
      if (token === 'barbell') normalized.add('barbell');
      else if (token === 'dumbbell' || token === 'kettlebell') normalized.add('dumbbell');
      else if (token === 'cable') normalized.add('cable');
      else if (token === 'machine' || token === 'smith') normalized.add('machine');
      else normalized.add(token.replace(/\s+/g, '_'));
    });
    return normalized.size ? normalized : null;
  }

  function intentAllowedByInjuryClient(intentKey, injuryProfile) {
    const sev = injuryProfile && typeof injuryProfile === 'object' ? injuryProfile : {};
    const shoulder = Number(sev.shoulder || 0);
    const elbow = Number(sev.elbow || 0);
    const wrist = Number(sev.wrist || 0);
    const back = Number(sev.back || 0);
    const hip = Number(sev.hip || 0);
    const knee = Number(sev.knee || 0);
    const ankle = Number(sev.ankle || 0);
    if (shoulder >= 6 && (intentKey.includes('overhead') || intentKey.includes('dip'))) return false;
    if (elbow >= 6 && (intentKey.includes('triceps_extension') || intentKey.includes('biceps_curl'))) return false;
    if (wrist >= 6 && (intentKey.includes('curl') || intentKey.includes('press'))) return false;
    if (back >= 6 && (intentKey.includes('hinge') || intentKey.includes('row_compound'))) return false;
    if (hip >= 6 && intentKey.includes('hip')) return false;
    if (knee >= 6 && intentKey.includes('knee_dominant')) return false;
    if (ankle >= 6 && intentKey.includes('calves')) return false;
    return true;
  }

  function isStrongmanLikeEntry(entry) {
    const text = normalizeTextForMatch([
      entry?.name,
      entry?.category,
      entry?.equipment,
      entry?.id
    ].filter(Boolean).join(' '));
    return /(strongman|atlas stone|circus bell|yoke|farmer s walk|farmers walk|log lift|keg load|conan|husafell|sled drag|sled push|sled row|prowler|tire flip|sandbag carry|stone lift)/.test(text);
  }

  function isLowComplianceSwapEntry(entry) {
    const text = normalizeTextForMatch([
      entry?.name,
      entry?.category,
      entry?.equipment,
      entry?.id
    ].filter(Boolean).join(' '));
    return /(chain press|chains|exercise ball|stability ball|bosu|circus bell|prowler|sled|human flag|atlas stone|yoke|tire flip|log lift|keg load|conan|husafell|sandbag carry)/.test(text);
  }

  function commonGymSwapScore(sourceProfile, candidateEntry, candidateProfile) {
    const sourceFamily = String(sourceProfile?.movementFamily || '');
    const sourceEq = String(sourceProfile?.equipmentClass || '');
    const name = normalizeTextForMatch(candidateEntry?.name || '');
    const eq = String(candidateProfile?.equipmentClass || '');
    let score = 0.4;

    if (sourceFamily === 'chest_press') {
      if (/(bench press|dumbbell bench|smith machine bench|machine bench|chest press)/.test(name)) score = 1;
      else if (/(press)/.test(name)) score = 0.82;
      if (sourceEq === 'machine' && (eq === 'barbell' || eq === 'dumbbell' || eq === 'machine')) score += 0.12;
    } else if (sourceFamily === 'vertical_pull') {
      if (/(lat pulldown|pull up|chin up|assisted pull up|machine pulldown)/.test(name)) score = 1;
      else if (/(pulldown|pull up|chin up)/.test(name)) score = 0.84;
    } else if (sourceFamily === 'row') {
      if (/(seated row|cable row|chest supported row|barbell row|dumbbell row|machine row|t bar row)/.test(name)) score = 1;
      else if (/(row)/.test(name)) score = 0.84;
    } else if (sourceFamily === 'shoulder_press') {
      if (/(shoulder press|overhead press|military press|machine press|dumbbell press|smith machine press)/.test(name)) score = 1;
    } else if (sourceFamily === 'knee_dominant') {
      if (/(hack squat|leg press|back squat|front squat|goblet squat|smith squat|split squat)/.test(name)) score = 1;
    } else if (sourceFamily === 'hip_hinge') {
      if (/(romanian deadlift|rdl|deadlift|stiff leg deadlift|good morning|hip thrust)/.test(name)) score = 1;
    }

    if (isLowComplianceSwapEntry(candidateEntry)) score -= 0.45;
    if (eq === 'other') score -= 0.2;
    return Math.max(0, Math.min(score, 1));
  }

  function isSwapCandidateCompatible({
    sourceProfile,
    sourceCategory,
    candidateEntry,
    allowedClasses,
    equipmentAccess
  }) {
    const resolvedEquipmentAccess = effectiveSwapEquipmentAccess(equipmentAccess, sourceProfile);
    const candidateProfile = buildSwapProfile(candidateEntry);
    if (!sourceProfile || !sourceProfile.major || sourceProfile.major === 'other') return false;
    if (!candidateProfile?.major || candidateProfile.major === 'other') return false;
    if (isStrongmanLikeEntry(candidateEntry)) return false;
    if (sourceProfile?.movementFamily) {
      const sameFamily = String(sourceProfile.movementFamily) === String(candidateProfile?.movementFamily || '');
      const compatibleFamily = movementFamilyCompatible(sourceProfile, candidateProfile);
      const samePrimary = String(sourceProfile?.primaryMuscleGroup || '') === String(candidateProfile?.primaryMuscleGroup || '');
      const sameSub = String(sourceProfile?.subMuscleGroup || '') === String(candidateProfile?.subMuscleGroup || '');
      const relatedSub = Array.isArray(CONTROLLED_RELATED_SUBGROUPS[String(sourceProfile?.subMuscleGroup || '')])
        ? CONTROLLED_RELATED_SUBGROUPS[String(sourceProfile?.subMuscleGroup || '')].includes(String(candidateProfile?.subMuscleGroup || ''))
        : false;
      if (!sameFamily && !compatibleFamily && !(samePrimary && (sameSub || relatedSub))) return false;
    }
    const eqClass = candidateProfile.equipmentClass;
    const candidateCategory = classifySwapCategory(candidateEntry);
    if (!swapCategoryCompatible({ sourceCategory, candidateCategory })) return false;
    const sourceIsStandardGym = sourceCategory === 'free_weights' || sourceCategory === 'machines' || sourceCategory === 'mixed';
    if (sourceIsStandardGym && isLowComplianceSwapEntry(candidateEntry)) return false;
    if (allowedClasses && !allowedClasses.has(eqClass) && !allowedClasses.has('any')) return false;
    if (!equipmentAllowed(resolvedEquipmentAccess, eqClass)) return false;
    if (!majorCompatible(sourceProfile, candidateProfile)) return false;
    return true;
  }

  function filterSwapCandidatesByCompatibility({ ex, candidateIds, day, equipmentAccess, allowedClasses }) {
    const ids = Array.isArray(candidateIds) ? candidateIds : [];
    if (!ids.length) return [];
    const usedIds = new Set((day?.exercises || []).map((d) => String(d?.exerciseId || '')).filter(Boolean));
    const sourceEntry = resolveSwapCatalogEntry(ex);
    const sourceProfile = buildSwapProfile(sourceEntry, ex);
    const sourceCategory = classifySwapCategory(sourceEntry, ex);
    if (!sourceProfile?.major || sourceProfile.major === 'other') {
      return Array.from(new Set(ids.filter((rawId) => {
        const id = String(rawId || '').trim();
        if (!id) return false;
        if (usedIds.has(id)) return false;
        return true;
      })));
    }
    const sourceId = String(sourceEntry?.id || ex?.exerciseId || '').trim();
    const sourceName = String(ex?.displayName || ex?.name || ex?.intentKey || '');
    const wantTokens = normalizeTextForMatch(sourceName).split(' ').filter(Boolean);
    const wantMuscles = sourceProfile.muscleKeys.length
      ? sourceProfile.muscleKeys
      : (Array.isArray(ex?.muscleKeys) ? ex.muscleKeys : []);
    const scored = [];
    const unresolved = [];

    for (const rawId of ids) {
      const id = String(rawId || '').trim();
      if (!id) continue;
      if (id === sourceId) continue;
      if (usedIds.has(id)) continue;
      const entry = findCatalogExerciseById(id);
      if (!entry) {
        unresolved.push(id);
        continue;
      }
      if (isBandName(entry?.name)) continue;
      const nameNorm = normalizeTextForMatch(entry?.name || '');
      const catNorm = normalizeTextForMatch(entry?.category || '');
      const mechNorm = normalizeTextForMatch(entry?.mechanic || '');
      if (/(stretch|mobility|warmup|activation|rehab|therapy|prehab)/.test(nameNorm)) continue;
      if (/(stretch|mobility|warmup)/.test(catNorm) || /(stretch|mobility|warmup)/.test(mechNorm)) continue;
      if (!isSwapCandidateCompatible({
        sourceProfile,
        sourceCategory,
        candidateEntry: entry,
        allowedClasses,
        equipmentAccess
      })) continue;
      const candidateProfile = buildSwapProfile(entry);
      const scoreData = scoreSwapCandidate({
        sourceProfile,
        candidateProfile,
        candidateEntry: entry,
        wantMuscles,
        wantTokens
      });
      scored.push({
        id,
        name: String(entry?.name || id),
        score: scoreData.score,
        tier: scoreData.tier
      });
    }
    const rankedIds = finalizeRankedSwapCandidates(scored, scored.length || 6);
    if (rankedIds.length) return rankedIds;
    if (unresolved.length) return Array.from(new Set(unresolved));
    return [];
  }

  function computeSwapCandidates({ ex, plan, dayIndex, weekIndex }) {
    const meta = plan?.meta || {};
    const equipmentAccess = meta.equipmentAccess || state.wizard?.equipmentAccess || {};
    const injuryProfile = meta.injuryProfile || {};
    const allowedClasses = null;
    const weekIdx = Number(weekIndex) || 1;
    const day = (plan?.weeks?.[weekIdx - 1]?.days || [])[dayIndex - 1] || null;
    const usedIds = new Set((day?.exercises || []).map((d) => String(d?.exerciseId || '')).filter(Boolean));
    const intentKey = String(ex?.intentKey || '').toLowerCase();
    if (!intentAllowedByInjuryClient(intentKey, injuryProfile)) return [];

    const sourceEntry = resolveSwapCatalogEntry(ex);
    const sourceProfile = buildSwapProfile(sourceEntry, ex);
    const sourceCategory = classifySwapCategory(sourceEntry, ex);
    if (!sourceProfile?.major || sourceProfile.major === 'other') {
      const loose = Array.isArray(ex?.swapCandidates) ? ex.swapCandidates : [];
      return loose
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .filter((id) => !usedIds.has(id))
        .slice(0, 6);
    }
    const wantMuscles = sourceProfile.muscleKeys.length
      ? sourceProfile.muscleKeys
      : (Array.isArray(ex?.muscleKeys) ? ex.muscleKeys : []);
    const wantTokens = normalizeTextForMatch(ex?.displayName || ex?.name || ex?.intentKey || '').split(' ').filter(Boolean);
    const badName = /(stretch|mobility|warmup|activation|rehab|therapy|prehab)/;
    const badCategory = /(stretch|mobility|warmup)/;
    const badMechanic = /(stretch|mobility|warmup)/;
    const sourceId = String(sourceEntry?.id || ex?.exerciseId || '').trim();
    const scored = [];
    for (const entry of exerciseCatalog) {
      const id = String(entry?.id || '').trim();
      if (!id || usedIds.has(id)) continue;
      if (sourceId && id === sourceId) continue;
      if (isBandName(entry?.name)) continue;
      const nameNorm = normalizeTextForMatch(entry?.name || '');
      const catNorm = normalizeTextForMatch(entry?.category || '');
      const mechNorm = normalizeTextForMatch(entry?.mechanic || '');
      if (badName.test(nameNorm) || badCategory.test(catNorm) || badMechanic.test(mechNorm)) continue;
      if (!isSwapCandidateCompatible({
        sourceProfile,
        sourceCategory,
        candidateEntry: entry,
        allowedClasses,
        equipmentAccess
      })) continue;

      const candidateProfile = buildSwapProfile(entry);
      const scoreData = scoreSwapCandidate({
        sourceProfile,
        candidateProfile,
        candidateEntry: entry,
        wantMuscles,
        wantTokens
      });
      scored.push({
        id,
        name: String(entry?.name || id),
        score: scoreData.score,
        tier: scoreData.tier
      });
    }

    return finalizeRankedSwapCandidates(scored, 6);
  }

  async function applySwapSelection({ ex, dayIndex, weekIndex, newExerciseId, scope }) {
    const prevId = ex.exerciseId;
    ex.exerciseId = newExerciseId;
    const media = exerciseMediaFromId(newExerciseId);
    const nextExerciseName = media.displayName || getExerciseNameById(newExerciseId) || newExerciseId;
    ex.displayName = nextExerciseName;
    ex.name = nextExerciseName;
    ex.mediaPath = media.mediaPath;
    ex.mediaPathAlt = media.mediaPathAlt;
    if (scope === 'permanent') {
      setPermanentSwapOverride(state.planRow?.id, ex.slotId, newExerciseId);
    } else {
      setSwapOverride(state.planRow?.id, weekIndex, dayIndex, ex.slotId, newExerciseId);
    }
    logTrainingEvent('swap_exercise', {
      weekIndex,
      dayIndex,
      slotId: ex.slotId,
      intentKey: ex.intentKey,
      oldExerciseId: prevId,
      newExerciseId,
      scope,
      at: new Date().toISOString()
    });
    try {
      const resp = await api('/api/training/override', {
        method: 'POST',
        body: JSON.stringify({
          planId: state.planRow?.id,
          weekIndex,
          dayIndex,
          exerciseId: ex.id,
          slotId: ex.slotId,
          oldExerciseId: prevId,
          newExerciseId,
          newExerciseName: nextExerciseName,
          scope
        })
      });
      if (resp?.ok && resp.json?.plan) {
        state.planRow = resp.json.plan;
        sanitizeBodybuildingPlanInPlace(state.planRow);
      }
    } catch {
      // ignore
    }
  }

  function openSwapScopeModal({ ex, dayIndex, weekIndex, newExerciseId, onDone }) {
    const selectedExercise = findCatalogExerciseById(newExerciseId);
    const selectedName = getExerciseNameById(newExerciseId) || newExerciseId;
    const previewExercise = selectedExercise || { id: newExerciseId, name: selectedName, displayName: selectedName };
    const previewMedia = resolveExerciseMedia(previewExercise);
    const previewMediaNode = (() => {
      if (previewMedia?.type === 'local-pair' && previewMedia?.src0 && previewMedia?.src1) {
        const wrap = el('div', { class: 'swap-scope-preview-pair' });
        const imgA = el('img', {
          class: 'swap-scope-preview-img swap-scope-preview-img-a',
          src: previewMedia.src0,
          alt: selectedName,
          loading: 'eager',
          decoding: 'async'
        });
        const imgB = el('img', {
          class: 'swap-scope-preview-img swap-scope-preview-img-b',
          src: previewMedia.src1,
          alt: selectedName,
          loading: 'eager',
          decoding: 'async'
        });
        wrap.append(imgA, imgB);
        return wrap;
      }
      if (previewMedia?.type === 'image' && previewMedia?.src) {
        return el('img', {
          class: 'swap-scope-preview-img',
          src: previewMedia.src,
          alt: selectedName,
          loading: 'eager',
          decoding: 'async'
        });
      }
      return el(
        'div',
        { class: 'swap-scope-preview-fallback' },
        muscleIconSvg(selectedExercise?.bodyPart || selectedExercise?.muscle_group || selectedExercise?.muscleGroup || 'exercise')
      );
    })();
    const openPreviewModal = () => {
      if (previewMedia?.type === 'local-pair' && previewMedia?.src0 && previewMedia?.src1) {
        openExerciseMediaModal({
          type: 'image-pair',
          src0: toFreeExerciseDbRemotePath(previewMedia.src0) || previewMedia.src0,
          src1: toFreeExerciseDbRemotePath(previewMedia.src1) || previewMedia.src1,
          alt: selectedName
        });
        return;
      }
      if (previewMedia?.type === 'image' && previewMedia?.src) {
        openExerciseMediaModal({
          type: 'image',
          src: toFreeExerciseDbRemotePath(previewMedia.src) || previewMedia.src,
          alt: selectedName
        });
      }
    };
    const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close swap options' }),
      el('div', { class: 'schedule-modal-card swap-scope-modal-card' },
        el('div', { class: 'schedule-modal-head' },
          el('div', { class: 'schedule-modal-title' }, 'Apply swap'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close swap options' }, '×')
        ),
        el('div', { class: 'schedule-modal-body' },
          el('div', { class: 'swap-scope-preview' },
            el('button', { type: 'button', class: 'swap-scope-preview-media swap-scope-preview-trigger', onclick: openPreviewModal, 'aria-label': `Open ${selectedName} preview` }, previewMediaNode),
            el('div', { class: 'swap-scope-preview-copy' },
              el('div', { class: 'swap-scope-preview-label' }, 'Selected workout'),
              el('div', { class: 'swap-scope-preview-name' }, selectedName)
            )
          ),
          el('div', { class: 'training-muted', style: 'margin-bottom:0.75rem' },
            'Do you want to swap this exercise permanently, or just for today?'
          )
        ),
        el('div', { class: 'schedule-modal-actions swap-scope-modal-actions' },
          el('button', {
            type: 'button',
            class: 'btn btn-primary swap-scope-modal-btn',
            onclick: () => {
              void applySwapSelection({ ex, dayIndex, weekIndex, newExerciseId, scope: 'single' });
              overlay.remove();
              onDone?.();
            }
          }, 'Just this exercise'),
          el('button', {
            type: 'button',
            class: 'btn btn-ghost swap-scope-modal-btn',
            onclick: () => {
              void applySwapSelection({ ex, dayIndex, weekIndex, newExerciseId, scope: 'permanent' });
              overlay.remove();
              onDone?.();
            }
          }, 'Swap permanently'),
          el('button', { type: 'button', class: 'btn btn-ghost swap-scope-modal-btn swap-scope-modal-cancel', onclick: () => overlay.remove() }, 'Cancel')
        )
      )
    );
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  function openCustomSwapModal({ ex, dayIndex, weekIndex, onDone }) {
    const openCreateWorkoutFromPicker = () => {
      if (!state.auth.user) {
        openAuthModal('login');
        return;
      }
      openCreateCustomWorkoutModal({
        onCreated: (item) => {
          if (!item?.id) return;
          window.setTimeout(() => {
            openSwapScopeModal({
              ex,
              dayIndex,
              weekIndex,
              newExerciseId: String(item.id),
              onDone
            });
          }, 0);
        }
      });
    };
    const customGroupMeta = {
      chest: { label: 'Chest', order: 1 },
      back: { label: 'Back', order: 2 },
      shoulders: { label: 'Shoulders', order: 3 },
      arms: { label: 'Arms', order: 4 },
      legs: { label: 'Legs', order: 5 },
      core: { label: 'Core', order: 6 },
      full_body: { label: 'Full Body', order: 7 },
      other: { label: 'Other', order: 99 }
    };

    const normalizeMuscleToken = (raw) => String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const formatMuscleLabel = (raw) => {
      const token = normalizeMuscleToken(raw);
      if (!token) return 'Uncategorized';
      const map = {
        abdominals: 'Abs',
        abductors: 'Hip Abductors',
        adductors: 'Adductors',
        biceps: 'Biceps',
        calves: 'Calves',
        chest: 'Chest',
        forearms: 'Forearms',
        glutes: 'Glutes',
        hamstrings: 'Hamstrings',
        lats: 'Lats',
        lowerback: 'Lower Back',
        middleback: 'Mid Back',
        neck: 'Neck',
        obliques: 'Obliques',
        quadriceps: 'Quads',
        shoulders: 'Shoulders',
        traps: 'Traps',
        hipflexors: 'Hip Flexors',
        serratus: 'Serratus'
      };
      return map[token] || String(raw || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    };
    const resolveGroupKey = (primaryMuscleRaw) => {
      const token = normalizeMuscleToken(primaryMuscleRaw);
      if (!token) return 'other';
      if (token.includes('chest') || token.includes('pect')) return 'chest';
      if (token.includes('lat') || token.includes('back') || token.includes('rhomboid') || token.includes('trap')) return 'back';
      if (token.includes('shoulder') || token.includes('delt')) return 'shoulders';
      if (token.includes('bicep') || token.includes('tricep') || token.includes('forearm') || token.includes('brach')) return 'arms';
      if (token.includes('quad') || token.includes('hamstring') || token.includes('glute') || token.includes('calf') || token.includes('adductor') || token.includes('abductor') || token.includes('hipflexor') || token.includes('leg')) return 'legs';
      if (token.includes('abdominal') || token.includes('oblique') || token.includes('core') || token.includes('serratus')) return 'core';
      if (token.includes('fullbody') || token.includes('totalbody')) return 'full_body';
      return 'other';
    };
    const buildGroupedItems = (items) => {
      const groups = new Map();
      for (const item of items) {
        const primary = String(item?.primaryMuscleGroup || (Array.isArray(item?.primaryMuscles) ? item.primaryMuscles[0] || '' : '')).trim();
        const subgroup = String(item?.subMuscleGroup || (Array.isArray(item?.subMuscleGroups) ? item.subMuscleGroups[0] || '' : primary)).trim();
        const groupKey = resolveGroupKey(primary);
        const groupMeta = customGroupMeta[groupKey] || customGroupMeta.other;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, { key: groupKey, label: groupMeta.label, order: groupMeta.order, subgroups: new Map() });
        }
        const bucket = groups.get(groupKey);
        const subgroupKey = normalizeMuscleToken(subgroup) || 'uncategorized';
        if (!bucket.subgroups.has(subgroupKey)) {
          bucket.subgroups.set(subgroupKey, { key: subgroupKey, label: formatMuscleLabel(subgroup || primary), items: [] });
        }
        bucket.subgroups.get(subgroupKey).items.push(item);
      }
      return Array.from(groups.values())
        .map((group) => ({
          ...group,
          subgroups: Array.from(group.subgroups.values())
            .map((sub) => ({
              ...sub,
              items: sub.items.slice().sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || '')))
            }))
            .sort((a, b) => a.label.localeCompare(b.label))
        }))
        .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
    };
    const openCustomWorkoutDatabaseModal = async ({ title = 'Custom workout', createAction = null, onSelect }) => {
      await loadUserCustomWorkouts();
      const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
        el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close custom workout picker' }),
        el('div', { class: 'schedule-modal-card custom-workout-modal-card' },
          el('div', { class: 'schedule-modal-head custom-workout-modal-head' },
            el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close custom workout picker' }, '×')
          ),
          el('div', { class: 'schedule-modal-body' },
            el('div', { class: 'schedule-modal-title', style: 'margin-bottom:0.85rem' }, title),
            el('input', {
              type: 'search',
              class: 'auth-input custom-workout-search',
              placeholder: 'Search workout database'
            }),
            el('div', { class: 'custom-workout-results' })
          ),
          el('div', { class: 'schedule-modal-actions custom-workout-modal-actions' },
            el('button', {
              type: 'button',
              class: 'btn btn-ghost custom-workout-create-trigger',
              onclick: () => {
                overlay.remove();
                createAction?.();
              }
            }, 'Create workout'),
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Close')
          )
        )
      );

      const searchInput = overlay.querySelector('.custom-workout-search');
      const resultsWrap = overlay.querySelector('.custom-workout-results');

      const renderResults = () => {
        if (!resultsWrap) return;
        const query = String(searchInput?.value || '').trim().toLowerCase();
        const filtered = customWorkoutModalCatalogItems()
          .filter((item) => {
            const name = String(item?.name || '').toLowerCase();
            const id = String(item?.id || '').toLowerCase();
            const primary = String(item?.primaryMuscleGroup || (Array.isArray(item?.primaryMuscles) ? item.primaryMuscles.join(' ') : '')).toLowerCase();
            const subgroup = String(item?.subMuscleGroup || (Array.isArray(item?.subMuscleGroups) ? item.subMuscleGroups.join(' ') : '')).toLowerCase();
            if (!query) return true;
            return name.includes(query) || id.includes(query) || primary.includes(query) || subgroup.includes(query);
          })
          .slice(0, 80);

        resultsWrap.innerHTML = '';
        if (!filtered.length) {
          resultsWrap.appendChild(el('div', { class: 'training-muted' }, 'No workouts found.'));
          return;
        }

        buildGroupedItems(filtered).forEach((group) => {
          resultsWrap.appendChild(el('div', { class: 'custom-workout-group' }, group.label));
          group.subgroups.forEach((subgroup) => {
            resultsWrap.appendChild(el('div', { class: 'custom-workout-subgroup' }, subgroup.label));
            subgroup.items.forEach((item) => {
              const label = String(item?.name || item?.id || 'Exercise');
              const meta = [item?.isCustom ? 'Your DB' : null, item?.primaryMuscleGroup, item?.subMuscleGroup].filter(Boolean).join(' - ');
              resultsWrap.appendChild(
                el('button', {
                  type: 'button',
                  class: 'custom-workout-result',
                  onclick: (event) => {
                    event?.preventDefault?.();
                    event?.stopPropagation?.();
                    overlay.remove();
                    onSelect?.(item);
                  }
                },
                el('span', { class: 'custom-workout-result-name' }, label),
                meta ? el('span', { class: 'custom-workout-result-meta' }, meta) : null)
              );
            });
          });
        });
      };

      searchInput?.addEventListener('input', renderResults);
      overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
      overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
      renderResults();
      searchInput?.focus();
    };

    openCustomWorkoutDatabaseModal({
      title: 'Custom workout',
      createAction: openCreateWorkoutFromPicker,
      onSelect: (item) => {
        window.setTimeout(() => {
          openSwapScopeModal({
            ex,
            dayIndex,
            weekIndex,
            newExerciseId: String(item?.id || ''),
            onDone
          });
        }, 0);
      }
    });
  }

  async function openAddCustomWorkoutModal({ scheduledDay = null, dateLike = null, weekIndex = 1, dayIndex = 0, onDone = null } = {}) {
    await ensureExerciseCatalogLoaded();
    await loadUserCustomWorkouts();
    const customGroupMeta = {
      chest: { label: 'Chest', order: 1 },
      back: { label: 'Back', order: 2 },
      shoulders: { label: 'Shoulders', order: 3 },
      arms: { label: 'Arms', order: 4 },
      legs: { label: 'Legs', order: 5 },
      core: { label: 'Core', order: 6 },
      full_body: { label: 'Full Body', order: 7 },
      other: { label: 'Other', order: 8 }
    };
    const normalizeMuscleToken = (raw) => String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    const formatMuscleLabel = (raw) => {
      const token = normalizeMuscleToken(raw);
      const map = {
        abs: 'Abs',
        back: 'Back',
        biceps: 'Biceps',
        calves: 'Calves',
        chest: 'Chest',
        forearms: 'Forearms',
        glutes: 'Glutes',
        hamstrings: 'Hamstrings',
        lats: 'Lats',
        lowerback: 'Lower Back',
        obliques: 'Obliques',
        quadriceps: 'Quads',
        shoulders: 'Shoulders',
        traps: 'Traps',
        hipflexors: 'Hip Flexors',
        serratus: 'Serratus'
      };
      return map[token] || String(raw || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    };
    const resolveGroupKey = (primaryMuscleRaw) => {
      const token = normalizeMuscleToken(primaryMuscleRaw);
      if (!token) return 'other';
      if (token.includes('chest') || token.includes('pect')) return 'chest';
      if (token.includes('lat') || token.includes('back') || token.includes('rhomboid') || token.includes('trap')) return 'back';
      if (token.includes('shoulder') || token.includes('delt')) return 'shoulders';
      if (token.includes('bicep') || token.includes('tricep') || token.includes('forearm') || token.includes('brach')) return 'arms';
      if (token.includes('quad') || token.includes('hamstring') || token.includes('glute') || token.includes('calf') || token.includes('adductor') || token.includes('abductor') || token.includes('hipflexor') || token.includes('leg')) return 'legs';
      if (token.includes('abdominal') || token.includes('oblique') || token.includes('core') || token.includes('serratus')) return 'core';
      if (token.includes('fullbody') || token.includes('totalbody')) return 'full_body';
      return 'other';
    };
    const buildGroupedItems = (items) => {
      const groups = new Map();
      for (const item of items) {
        const primary = String(item?.primaryMuscleGroup || (Array.isArray(item?.primaryMuscles) ? item.primaryMuscles[0] || '' : '')).trim();
        const subgroup = String(item?.subMuscleGroup || (Array.isArray(item?.subMuscleGroups) ? item.subMuscleGroups[0] || '' : primary)).trim();
        const groupKey = resolveGroupKey(primary);
        const groupMeta = customGroupMeta[groupKey] || customGroupMeta.other;
        if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, label: groupMeta.label, order: groupMeta.order, subgroups: new Map() });
        const bucket = groups.get(groupKey);
        const subgroupKey = normalizeMuscleToken(subgroup) || 'uncategorized';
        if (!bucket.subgroups.has(subgroupKey)) {
          bucket.subgroups.set(subgroupKey, { key: subgroupKey, label: formatMuscleLabel(subgroup || primary), items: [] });
        }
        bucket.subgroups.get(subgroupKey).items.push(item);
      }
      return Array.from(groups.values())
        .map((group) => ({
          ...group,
          subgroups: Array.from(group.subgroups.values())
            .map((sub) => ({
              ...sub,
              items: sub.items.slice().sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || '')))
            }))
            .sort((a, b) => a.label.localeCompare(b.label))
        }))
        .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
    };

    const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close custom workout picker' }),
      el('div', { class: 'schedule-modal-card custom-workout-modal-card' },
        el('div', { class: 'schedule-modal-head custom-workout-modal-head' },
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close custom workout picker' }, '×')
        ),
        el('div', { class: 'schedule-modal-body' },
          el('div', { class: 'schedule-modal-title', style: 'margin-bottom:0.85rem' }, 'Custom workout'),
          el('input', {
            type: 'search',
            class: 'auth-input custom-workout-search',
            placeholder: 'Search workout database'
          }),
          el('div', { class: 'custom-workout-results' })
        ),
        el('div', { class: 'schedule-modal-actions custom-workout-modal-actions' },
          el('button', {
            type: 'button',
            class: 'btn btn-ghost custom-workout-create-trigger',
            onclick: () => {
              if (!state.auth.user) {
                openAuthModal('login');
                return;
              }
              openCreateCustomWorkoutModal({
                onCreated: (item) => {
                  if (!item) return;
                  appendCustomWorkoutToDate({ dateLike, item, scheduledDay, weekIndex, dayIndex });
                  onDone?.();
                }
              });
            }
          }, 'Create workout'),
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Close')
        )
      )
    );

    const searchInput = overlay.querySelector('.custom-workout-search');
    const resultsWrap = overlay.querySelector('.custom-workout-results');
    const renderResults = () => {
      if (!resultsWrap) return;
      const query = String(searchInput?.value || '').trim().toLowerCase();
      const filtered = customWorkoutModalCatalogItems()
        .filter((item) => {
          const name = String(item?.name || '').toLowerCase();
          const id = String(item?.id || '').toLowerCase();
          const primary = String(item?.primaryMuscleGroup || (Array.isArray(item?.primaryMuscles) ? item.primaryMuscles.join(' ') : '')).toLowerCase();
          const subgroup = String(item?.subMuscleGroup || (Array.isArray(item?.subMuscleGroups) ? item.subMuscleGroups.join(' ') : '')).toLowerCase();
          if (!query) return true;
          return name.includes(query) || id.includes(query) || primary.includes(query) || subgroup.includes(query);
        })
        .slice(0, 80);

      resultsWrap.innerHTML = '';
      if (!filtered.length) {
        resultsWrap.appendChild(el('div', { class: 'training-muted' }, 'No workouts found.'));
        return;
      }

      buildGroupedItems(filtered).forEach((group) => {
        resultsWrap.appendChild(el('div', { class: 'custom-workout-group' }, group.label));
        group.subgroups.forEach((subgroup) => {
            resultsWrap.appendChild(el('div', { class: 'custom-workout-subgroup' }, subgroup.label));
            subgroup.items.forEach((item) => {
              const label = String(item?.name || item?.id || 'Exercise');
              const meta = [item?.isCustom ? 'Your DB' : null, item?.primaryMuscleGroup, item?.subMuscleGroup].filter(Boolean).join(' - ');
              resultsWrap.appendChild(el('button', {
                type: 'button',
                class: 'custom-workout-result',
              onclick: (event) => {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                appendCustomWorkoutToDate({ dateLike, item, scheduledDay, weekIndex, dayIndex });
                overlay.remove();
                onDone?.();
              }
            },
            el('span', { class: 'custom-workout-result-name' }, label),
            meta ? el('span', { class: 'custom-workout-result-meta' }, meta) : null));
          });
        });
      });
    };

    searchInput?.addEventListener('input', renderResults);
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
    renderResults();
    searchInput?.focus();
  }

  async function openSwapModal({ ex, dayIndex, weekIndex }) {
    await ensureExerciseCatalogLoaded();
    let candidates = Array.isArray(ex?.swapCandidates) ? ex.swapCandidates : [];
    const plan = state.planRow?.plan || null;
    const weekIdx = Number(weekIndex) || 1;
    const day = (plan?.weeks?.[weekIdx - 1]?.days || [])[dayIndex - 1] || null;
    const meta = plan?.meta || {};
    const equipmentAccess = meta.equipmentAccess || state.wizard?.equipmentAccess || {};
    const allowedClasses = null;

    if (candidates.length) {
      candidates = filterSwapCandidatesByCompatibility({
        ex,
        candidateIds: candidates,
        day,
        equipmentAccess,
        allowedClasses
      });
    }

    if (!candidates.length && exerciseCatalog.length) {
      candidates = computeSwapCandidates({ ex, plan, dayIndex, weekIndex }) || [];
    }
    const swapToneForIndex = (index) => {
      if (index === 0) return { cls: 'swap-option-best', tag: 'Best match', rank: '01' };
      if (index === 1) return { cls: 'swap-option-second', tag: 'Next best', rank: '02' };
      if (index === 2) return { cls: 'swap-option-base', tag: 'Good fit', rank: '03' };
      return { cls: 'swap-option-rest', tag: 'Fallback', rank: String(index + 1).padStart(2, '0') };
    };
    const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close swap' }),
      el('div', { class: 'schedule-modal-card' },
        el('div', { class: 'schedule-modal-head' },
          el('div', { class: 'schedule-modal-title' }, 'Swap exercise'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close swap' }, '×')
        ),
        el('div', { class: 'schedule-modal-body' },
          candidates.length
            ? el('div', { class: 'training-row', style: 'flex-direction:column; gap:0.5rem; align-items:stretch' },
              candidates.map((id, index) => {
                const tone = swapToneForIndex(index);
                return el('button', {
                  type: 'button',
                  class: `btn btn-ghost swap-option-card ${tone.cls}`,
                  onclick: (event) => {
                    event?.preventDefault?.();
                    event?.stopPropagation?.();
                    overlay.remove();
                    window.setTimeout(() => {
                      openSwapScopeModal({
                        ex,
                        dayIndex,
                        weekIndex,
                        newExerciseId: id,
                        onDone: () => render()
                      });
                    }, 0);
                  }
                },
                el('span', { class: 'swap-option-rank', 'aria-hidden': 'true' }, tone.rank),
                el('div', { class: 'swap-option-copy' },
                  el('span', { class: 'swap-option-tag' }, tone.tag),
                  el('span', { class: 'swap-option-name' }, getExerciseNameById(id) || id)
                ));
              }),
              el('button', {
                type: 'button',
                class: 'custom-workout-trigger',
                onclick: (event) => {
                  event?.preventDefault?.();
                  event?.stopPropagation?.();
                  overlay.remove();
                  window.setTimeout(() => {
                    openCustomSwapModal({ ex, dayIndex, weekIndex, onDone: () => render() });
                  }, 0);
                }
              }, 'Custom workout')
            )
            : el('div', { class: 'training-row', style: 'flex-direction:column; gap:0.75rem; align-items:stretch' },
              el('div', { class: 'training-muted' }, 'No same-muscle swap options available.'),
              el('button', {
                type: 'button',
                class: 'custom-workout-trigger',
                onclick: (event) => {
                  event?.preventDefault?.();
                  event?.stopPropagation?.();
                  overlay.remove();
                  window.setTimeout(() => {
                    openCustomSwapModal({ ex, dayIndex, weekIndex, onDone: () => render() });
                  }, 0);
                }
              }, 'Custom workout')
            )
        ),
        el('div', { class: 'schedule-modal-actions' },
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Close')
        )
      )
    );
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  function normalizePainText(raw) {
    return normalizeTextForMatch(raw || '');
  }

  function derivePainTags({ location, trigger, painType }) {
    const text = [location, trigger, painType].map((v) => normalizePainText(v)).join(' ');
    const tags = new Set();
    if (!text) return tags;
    if (/(shoulder|rotator|delt|ac joint|scap)/.test(text)) tags.add('shoulder');
    if (/(elbow|tricep tendon|bicep tendon)/.test(text)) tags.add('elbow');
    if (/(wrist|hand|grip|thumb|forearm)/.test(text)) tags.add('wrist');
    if (/(neck|cervical|trap)/.test(text)) tags.add('neck');
    if (/(back|spine|lumbar|thoracic|si joint)/.test(text)) tags.add('back');
    if (/(hip|glute|groin)/.test(text)) tags.add('hip');
    if (/(knee|patella|acl|mcl|meniscus)/.test(text)) tags.add('knee');
    if (/(ankle|achilles|foot|heel|toe|calf)/.test(text)) tags.add('ankle');
    return tags;
  }

  function buildPainContext({
    location,
    painType,
    severity,
    onset,
    trigger,
    romNormal,
    pop
  }) {
    const sevRaw = Number(severity);
    const sev = Number.isFinite(sevRaw) ? Math.max(1, Math.min(10, Math.round(sevRaw))) : 0;
    const painTypeNorm = normalizePainText(painType);
    const onsetNorm = normalizePainText(onset);
    const tags = derivePainTags({ location, trigger, painType });
    return {
      severity: sev,
      painTypeNorm,
      onsetNorm,
      tags,
      romNormal: Boolean(romNormal),
      pop: Boolean(pop),
      redFlag: sev >= 8
        || /numbness|tingling|electric|burning/.test(painTypeNorm)
        || Boolean(pop)
        || (!romNormal && sev >= 6)
    };
  }

  function painActionFromContext(ctx) {
    if (!ctx || !Number.isFinite(ctx.severity) || ctx.severity <= 0) return 'invalid';
    if (ctx.redFlag) return 'stop';
    if (ctx.severity >= 5) return 'swap';
    return 'continue';
  }

  function painGuidanceFromContext(ctx, action) {
    const tagText = Array.from(ctx?.tags || []).join(', ');
    const areaText = tagText ? ` around ${tagText}` : '';
    if (action === 'stop') {
      return `High-risk pain signal detected${areaText}. Stop this session now and seek medical evaluation if symptoms persist or worsen.`;
    }
    if (action === 'swap') {
      return `Moderate pain detected${areaText}. This exercise should be replaced with a lower-stress option now.`;
    }
    return `Low-severity pain detected${areaText}. Continue cautiously and stop if pain increases.`;
  }

  function painPenaltyForCandidate(candidateProfile, painContext) {
    const profile = candidateProfile || {};
    const ctx = painContext || {};
    const tags = ctx.tags || new Set();
    const major = String(profile.major || '');
    const subgroup = String(profile.subgroup || '');
    const family = String(profile.movementFamily || '');
    let penalty = 0;

    if (tags.has('shoulder')) {
      if (major === 'shoulders') penalty += 34;
      if (family === 'shoulder_press') penalty += 72;
      if (family === 'shoulder_raise') penalty += 36;
      if (family === 'chest_press') penalty += 42;
      if (['frontdelts', 'sidedelts', 'reardelts', 'triceps'].includes(subgroup)) penalty += 36;
    }
    if (tags.has('elbow')) {
      if (family === 'triceps_extension' || family === 'biceps_curl' || family === 'forearm_work') penalty += 56;
      if (['triceps', 'biceps', 'forearms', 'brachialis'].includes(subgroup)) penalty += 22;
    }
    if (tags.has('wrist')) {
      if (family === 'forearm_work' || family === 'biceps_curl') penalty += 82;
      if (family === 'chest_press' || family === 'shoulder_press') penalty += 26;
      if (['forearms', 'biceps', 'triceps'].includes(subgroup)) penalty += 28;
    }
    if (tags.has('back')) {
      if (family === 'hip_hinge') penalty += 96;
      if (family === 'row') penalty += 60;
      if (family === 'vertical_pull') penalty += 44;
      if (major === 'back') penalty += 26;
    }
    if (tags.has('hip')) {
      if (family === 'hip_hinge' || family === 'single_leg') penalty += 92;
      if (['glutes', 'hamstrings', 'hipflexors', 'adductors', 'abductors'].includes(subgroup)) penalty += 56;
    }
    if (tags.has('knee')) {
      if (family === 'knee_dominant' || family === 'single_leg' || family === 'leg_extension') penalty += 94;
      if (subgroup === 'quadriceps') penalty += 64;
    }
    if (tags.has('ankle')) {
      if (family === 'calf_raise' || family === 'single_leg') penalty += 88;
      if (subgroup === 'calves') penalty += 58;
    }
    if (tags.has('neck')) {
      if (family === 'shoulder_press' || family === 'shoulder_raise') penalty += 88;
      if (subgroup === 'traps' || subgroup === 'upperback') penalty += 44;
    }

    if (ctx.onsetNorm === 'during this set') penalty += 12;
    if (!ctx.romNormal) penalty += 18;
    if (ctx.pop) penalty += 24;
    if (/numbness|tingling|electric|burning/.test(ctx.painTypeNorm || '')) penalty += 22;
    return penalty;
  }

  function selectPainAwareSwapCandidate({ ex, dayIndex, weekIndex, painContext }) {
    const plan = state.planRow?.plan || null;
    const weekIdx = Number(weekIndex) || 1;
    const day = (plan?.weeks?.[weekIdx - 1]?.days || [])[dayIndex - 1] || null;
    const meta = plan?.meta || {};
    const equipmentAccess = meta.equipmentAccess || state.wizard?.equipmentAccess || {};
    const allowedClasses = null;
    let candidates = Array.isArray(ex?.swapCandidates) ? ex.swapCandidates : [];
    if (candidates.length) {
      candidates = filterSwapCandidatesByCompatibility({
        ex,
        candidateIds: candidates,
        day,
        equipmentAccess,
        allowedClasses
      });
    }
    if (!candidates.length && exerciseCatalog.length) {
      candidates = computeSwapCandidates({ ex, plan, dayIndex, weekIndex }) || [];
    }
    if (!candidates.length) return null;

    const scored = candidates.map((id) => {
      const entry = findCatalogExerciseById(String(id)) || null;
      if (!entry) return null;
      const profile = buildSwapProfile(entry);
      return {
        id: String(id),
        name: getExerciseNameById(id) || String(id),
        penalty: painPenaltyForCandidate(profile, painContext)
      };
    }).filter(Boolean);
    if (!scored.length) return null;

    scored.sort((a, b) => a.penalty - b.penalty || a.name.localeCompare(b.name));
    const maxPenalty = painContext?.severity >= 7 ? 18 : painContext?.severity >= 5 ? 48 : 9999;
    const safe = scored.find((item) => item.penalty <= maxPenalty) || null;
    if (safe) return { ...safe, usedFallback: false };
    if ((painContext?.severity || 0) <= 6 && scored[0] && scored[0].penalty <= 90) {
      return { ...scored[0], usedFallback: true };
    }
    return null;
  }

  function openPainOutcomeModal({ title, message }) {
    const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close pain guidance' }),
      el('div', { class: 'schedule-modal-card' },
        el('div', { class: 'schedule-modal-head' },
          el('div', { class: 'schedule-modal-title' }, title || 'Pain guidance'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close pain guidance' }, '×')
        ),
        el('div', { class: 'schedule-modal-body' },
          el('div', { class: 'training-muted' }, String(message || 'Guidance saved.'))
        ),
        el('div', { class: 'schedule-modal-actions' },
          el('button', { type: 'button', class: 'btn btn-primary', onclick: () => overlay.remove() }, 'OK')
        )
      )
    );
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  function openPainModal({ ex, dayIndex, weekIndex }) {
    const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close pain report' }),
      el('div', { class: 'schedule-modal-card' },
        el('div', { class: 'schedule-modal-head' },
          el('div', { class: 'schedule-modal-title' }, 'Report pain / injury'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close pain report' }, '×')
        ),
        el('div', { class: 'schedule-modal-body' },
          el('label', { class: 'auth-label' }, 'Pain location (joint/site)'),
          el('input', { class: 'auth-input', id: 'pain-location' }),
          el('label', { class: 'auth-label' }, 'Pain type'),
          el('select', { class: 'auth-input', id: 'pain-type' },
            ['shooting', 'stabbing', 'pulling', 'dull ache', 'sharp', 'numbness/tingling'].map((t) => el('option', { value: t }, t))
          ),
          el('label', { class: 'auth-label' }, 'Severity (1-10)'),
          el('input', { class: 'auth-input', id: 'pain-sev', inputmode: 'numeric' }),
          el('label', { class: 'auth-label' }, 'Onset timing'),
          el('select', { class: 'auth-input', id: 'pain-onset' },
            ['during this set', 'earlier today', 'last few days', 'weeks+'].map((t) => el('option', { value: t }, t))
          ),
          el('label', { class: 'auth-label' }, 'Trigger (optional)'),
          el('input', { class: 'auth-input', id: 'pain-trigger' }),
          el('div', { class: 'training-row', style: 'justify-content:flex-start; gap:0.8rem; flex-wrap:wrap' },
            el('label', { class: 'training-badge' }, el('input', { type: 'checkbox', id: 'pain-rom' }), 'ROM normal?'),
            el('label', { class: 'training-badge' }, el('input', { type: 'checkbox', id: 'pain-pop' }), 'Pop sensation?')
          ),
          el('div', { class: 'schedule-modal-error', id: 'pain-guidance' })
        ),
        el('div', { class: 'schedule-modal-actions' },
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Cancel'),
          el('button', {
            type: 'button',
            class: 'btn btn-primary',
            onclick: () => {
              const guidanceNode = qs('#pain-guidance');
              const location = String(qs('#pain-location')?.value || '').trim();
              const painType = String(qs('#pain-type')?.value || '').trim();
              const severity = Number(qs('#pain-sev')?.value || 0);
              const onset = String(qs('#pain-onset')?.value || '').trim();
              const trigger = String(qs('#pain-trigger')?.value || '').trim();
              const romNormal = Boolean(qs('#pain-rom')?.checked);
              const pop = Boolean(qs('#pain-pop')?.checked);

              if (!Number.isFinite(severity) || severity < 1 || severity > 10) {
                if (guidanceNode) guidanceNode.textContent = 'Please enter pain severity from 1 to 10.';
                return;
              }

              const painContext = buildPainContext({
                location,
                painType,
                severity,
                onset,
                trigger,
                romNormal,
                pop
              });
              const action = painActionFromContext(painContext);
              const guidance = painGuidanceFromContext(painContext, action);

              const painReportId = (window.crypto && typeof window.crypto.randomUUID === 'function')
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

              let selectedSwapId = null;
              let selectedSwapName = '';
              let guidanceOut = guidance;
              if (action === 'swap') {
                const pick = selectPainAwareSwapCandidate({
                  ex,
                  dayIndex,
                  weekIndex,
                  painContext
                });
                if (pick?.id) {
                  selectedSwapId = pick.id;
                  selectedSwapName = pick.name || getExerciseNameById(pick.id) || pick.id;
                  applySwapSelection({
                    ex,
                    dayIndex,
                    weekIndex,
                    newExerciseId: pick.id,
                    scope: 'single'
                  });
                  guidanceOut = pick.usedFallback
                    ? `${guidance} Replaced with: ${selectedSwapName}. This is the lowest-stress available match; reduce load and range immediately.`
                    : `${guidance} Replaced with: ${selectedSwapName}.`;
                } else {
                  guidanceOut = `${guidance} No safer same-muscle swap was found. Reduce load/range or stop this exercise.`;
                }
              }

              if (action === 'stop' || severity >= 5) {
                try {
                  localStorage.setItem('ode_pain_followup_at', toISODateLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
                  localStorage.setItem('ode_pain_followup_open', '1');
                  localStorage.setItem('ode_pain_followup_id', painReportId);
                } catch {
                  // ignore
                }
              }

              logTrainingEvent('pain_report', {
                painReportId,
                weekIndex,
                dayIndex,
                slotId: ex.slotId,
                intentKey: ex.intentKey,
                exerciseId: ex.exerciseId,
                location,
                painType,
                severity,
                onset,
                trigger,
                romNormal,
                pop,
                actionTaken: action,
                guidance: guidanceOut,
                suggestedSwapId: selectedSwapId,
                suggestedSwapName: selectedSwapName,
                followUpAt: toISODateLocal(new Date(Date.now() + 24 * 60 * 60 * 1000))
              });
              overlay.remove();
              render();
              openPainOutcomeModal({
                title: action === 'stop' ? 'Stop session now' : action === 'swap' ? 'Exercise swapped' : 'Continue with caution',
                message: guidanceOut
              });
            }
          }, 'Submit')
        )
      )
    );
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  async function openExplainModal({ plan, day }) {
    const phase = String(plan?.meta?.phase || '').trim().toLowerCase();
    const emphasis = Array.isArray(plan?.meta?.emphasis) ? plan.meta.emphasis : [];
    const tags = new Set();
    if (phase) tags.add(`phase_${phase}`);
    if (emphasis.length) tags.add('priority_' + emphasis[0]);
    if (plan?.meta?.wseBudgetPerSession) tags.add('time_cap');
    tags.add('all');
    const tagsList = Array.from(tags);

    const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close explanation' }),
      el('div', { class: 'schedule-modal-card training-explain-card' },
        el('div', { class: 'schedule-modal-head' },
          el('div', { class: 'schedule-modal-title' }, 'Explain the lifts'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close explanation' }, '×')
        ),
        el('div', { class: 'schedule-modal-body training-explain-body', id: 'explain-body' },
          el('div', { class: 'training-explain-tabs', role: 'tablist', 'aria-label': 'Explain mode' },
            el('button', {
              type: 'button',
              class: 'training-explain-tab is-active',
              role: 'tab',
              'aria-selected': 'true',
              'data-explain-tab': 'how'
            }, 'How to lift'),
            el('button', {
              type: 'button',
              class: 'training-explain-tab',
              role: 'tab',
              'aria-selected': 'false',
              'data-explain-tab': 'exercise'
            }, 'Exercises')
          ),
          el('div', { class: 'training-explain-panel', id: 'explain-panel' },
            el('div', { class: 'training-muted' }, quoteBankLoadingPromise ? 'Loading...' : 'Preparing explanation...')
          )
        ),
        el('div', { class: 'schedule-modal-actions' },
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Close')
        )
      )
    );
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);

    await ensureQuoteBankLoaded();
    await ensureExerciseCatalogLoaded();
    const phaseTag = phase ? `phase_${phase}` : null;
    const withPhase = quoteBankCache.filter((q) => Array.isArray(q.tags) && phaseTag && q.tags.includes(phaseTag));
    const general = quoteBankCache.filter((q) => Array.isArray(q.tags) && q.tags.includes('all'));
    const seen = new Set();
    let snippets = [];
    for (const q of [...withPhase, ...general]) {
      if (snippets.length >= 4) break;
      if (!q || seen.has(q.id)) continue;
      seen.add(q.id);
      snippets.push(q);
    }
    if (!snippets.length && quoteBankCache.length) {
      snippets = quoteBankCache.slice(0, 4);
    }

    const body = overlay.querySelector('#explain-body');
    const panel = overlay.querySelector('#explain-panel');
    if (!body || !panel) return;

    const tabButtons = Array.from(body.querySelectorAll('[data-explain-tab]'));
    let activeTab = 'how';

    const normalizeInstructionList = (raw) => {
      if (Array.isArray(raw)) {
        return raw
          .map((line) => String(line || '').trim())
          .filter(Boolean)
          .slice(0, 10);
      }
      const src = String(raw || '').trim();
      if (!src) return [];
      return src
        .split(/\r?\n+/)
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .slice(0, 10);
    };

    const exerciseGuides = (Array.isArray(day?.exercises) ? day.exercises : []).map((ex, idx) => {
      const resolved = resolveSwapCatalogEntry(ex);
      const exerciseId = String(ex?.exerciseId || ex?.baseId || '').trim();
      const catalogEx = exerciseId ? (exerciseIndexById.get(exerciseId) || null) : null;
      const source = resolved || catalogEx || null;
      const name = String(
        ex?.displayName
        || ex?.name
        || source?.name
        || `Exercise ${idx + 1}`
      ).trim();
      const instructions = normalizeInstructionList(ex?.instructions).length
        ? normalizeInstructionList(ex?.instructions)
        : normalizeInstructionList(source?.instructions);
      const sets = Number(ex?.sets);
      const reps = String(ex?.reps || '').trim();
      const rest = Number(ex?.restSec || ex?.rest || 0);
      const prescriptionBits = [];
      if (Number.isFinite(sets) && sets > 0) prescriptionBits.push(`${sets} sets`);
      if (reps) prescriptionBits.push(`${reps} reps`);
      if (rest > 0) prescriptionBits.push(`rest ${fmtRest(rest)}`);
      return {
        name,
        instructions,
        prescription: prescriptionBits.join(' · ')
      };
    });

    const renderHowToLift = () => {
      panel.replaceChildren(
        el('div', { class: 'training-muted' }, `Phase: ${String(plan?.meta?.phase || '').toUpperCase() || 'N/A'}`),
        el('div', { class: 'training-muted' }, `Focus: ${emphasis.join(', ') || 'Full body'}`),
        el('div', { class: 'training-divider' }),
        snippets.length
          ? el('div', { class: 'training-explain-principles' },
            snippets.map((s) =>
              el('div', { class: 'training-subcard training-explain-principle-card' },
                el('div', { style: 'font-weight:800' }, s.sourceName),
                el('div', { class: 'training-muted' }, s.principleSummary)
              )
            )
          )
          : el('div', { class: 'training-muted' }, `No snippets matched tags: ${tagsList.join(', ')}`)
      );
    };

    const buildExerciseGuideCard = (guide, idx) => {
      const detailsId = `training-explain-steps-${idx + 1}`;
      const detailsWrap = el('div', {
        class: 'training-exercise-guide-details',
        id: detailsId,
        hidden: 'true',
        style: 'max-height:0;opacity:0;overflow:hidden;transition:max-height 180ms ease, opacity 160ms ease'
      });
      if (guide.instructions.length) {
        detailsWrap.appendChild(
          el('ol', { class: 'training-exercise-guide-steps' },
            guide.instructions.map((line) => el('li', null, line))
          )
        );
      } else {
        detailsWrap.appendChild(
          el('div', { class: 'training-muted' }, 'No linked instruction steps found for this exercise yet.')
        );
      }

      const arrow = el('span', {
        class: 'training-exercise-guide-arrow',
        'aria-hidden': 'true',
        style: 'font-size:1rem;line-height:1;opacity:0.78;min-width:1.1rem;text-align:center'
      }, '▾');
      let isOpen = false;
      let closeTimer = null;
      const setExpanded = (next) => {
        isOpen = Boolean(next);
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        arrow.textContent = isOpen ? '▴' : '▾';
        if (isOpen) {
          detailsWrap.hidden = false;
          requestAnimationFrame(() => {
            const target = Math.max(24, detailsWrap.scrollHeight + 6);
            detailsWrap.style.maxHeight = `${target}px`;
            detailsWrap.style.opacity = '1';
          });
          return;
        }
        detailsWrap.style.maxHeight = '0px';
        detailsWrap.style.opacity = '0';
        closeTimer = setTimeout(() => {
          if (!isOpen) detailsWrap.hidden = true;
        }, 190);
      };

      const toggleBtn = el('button', {
        type: 'button',
        class: 'training-exercise-guide-toggle',
        'aria-expanded': 'false',
        'aria-controls': detailsId,
        style: 'width:100%;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;background:none;border:none;padding:0;margin:0;cursor:pointer;text-align:left;color:inherit;font:inherit',
        onclick: () => setExpanded(!isOpen)
      },
      el('div', { style: 'display:flex;flex-direction:column;align-items:flex-start;gap:0.22rem' },
        el('div', { class: 'training-exercise-guide-title' }, guide.name),
        guide.prescription
          ? el('div', { class: 'training-exercise-guide-prescription' }, guide.prescription)
          : null
      ),
      arrow);

      return el('div', { class: 'training-exercise-guide-card' }, toggleBtn, detailsWrap);
    };

    const renderExercises = () => {
      panel.replaceChildren(
        exerciseGuides.length
          ? el('div', { class: 'training-explain-exercises' },
            exerciseGuides.map((guide, idx) => buildExerciseGuideCard(guide, idx))
          )
          : el('div', { class: 'training-muted' }, 'No workout exercises found for this day.')
      );
    };

    const renderTab = (nextTab) => {
      activeTab = nextTab === 'exercise' ? 'exercise' : 'how';
      tabButtons.forEach((btn) => {
        const key = String(btn.dataset.explainTab || '').trim();
        const isActive = key === activeTab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      if (activeTab === 'exercise') renderExercises();
      else renderHowToLift();
    };

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        renderTab(String(btn.dataset.explainTab || 'how'));
      });
    });

    renderTab('how');
  }

  let exerciseMediaObserver = null;
  function wireExerciseMedia(containerRoot) {
    if (!containerRoot) return;

    const targets = Array.from(containerRoot.querySelectorAll('[data-ex-media=\"1\"]'));
    if (!targets.length) return;

    const loadOne = (btn) => {
      if (!btn || btn.dataset.mediaLoaded === '1') return;
      btn.dataset.mediaLoaded = '1';

      let candidates = [];
      try {
        candidates = JSON.parse(btn.dataset.candidates || '[]');
      } catch {
        candidates = [];
      }

      const frame = btn.querySelector('.exercise-media-frame');
      const skeleton = btn.querySelector('.exercise-media-skeleton');
      const iconSlot = btn.querySelector('.exercise-media-icon');

      let idx = 0;
      let currentType = null;
      let currentSrc = null;

      const showIcon = () => {
        if (skeleton) skeleton.classList.add('hidden');
        frame?.classList.add('hidden');
        iconSlot?.classList.remove('hidden');
      };

      const showFrame = () => {
        iconSlot?.classList.add('hidden');
        frame?.classList.remove('hidden');
      };

      const done = () => {
        skeleton?.classList.add('hidden');
      };

      const tryNext = () => {
        const cand = candidates[idx++];
        if (!cand || !cand.src) {
          showIcon();
          return;
        }

        currentType = cand.type === 'video' ? 'video' : 'image';
        currentSrc = String(cand.src);
        showFrame();

        if (currentType === 'video') {
          frame.replaceChildren(el('video', {
            class: 'exercise-media-video',
            muted: 'true',
            loop: 'true',
            playsinline: 'true',
            preload: 'none',
            'aria-hidden': 'true'
          }));
          const video = frame.querySelector('video');
          if (!video) return tryNext();

          const onReady = () => {
            done();
            // Hover autoplay (desktop only) when allowed.
            if (!prefersReducedMotion()) {
              btn.addEventListener('pointerenter', () => {
                if (!userInteractedForMedia) return;
                video.play().catch(() => { /* ignore */ });
              });
              btn.addEventListener('pointerleave', () => {
                try { video.pause(); video.currentTime = 0; } catch { /* ignore */ }
              });
            }
          };
          video.addEventListener('loadeddata', onReady, { once: true });
          video.addEventListener('error', () => tryNext(), { once: true });
          video.src = currentSrc;
          return;
        }

        frame.replaceChildren(el('img', {
          class: 'exercise-media-img',
          alt: btn.dataset.alt || 'Exercise image',
          loading: 'eager',
          decoding: 'async'
        }));
        const img = frame.querySelector('img');
        if (!img) return tryNext();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', () => tryNext(), { once: true });
        img.src = currentSrc;
      };

      btn.addEventListener('click', () => {
        if (!currentSrc || !currentType) return;
        const imageCandidates = candidates
          .filter((cand) => cand && cand.type !== 'video' && cand.src)
          .slice(0, 2)
          .map((cand) => String(cand.src));
        if (imageCandidates.length >= 2) {
          openExerciseMediaModal({
            type: 'image-pair',
            src0: imageCandidates[0],
            src1: imageCandidates[1],
            alt: btn.dataset.modalTitle || btn.dataset.alt || 'Exercise preview'
          });
          return;
        }
        openExerciseMediaModal({
          type: currentType,
          src: currentSrc,
          src0: btn.dataset.src0 || '',
          src1: btn.dataset.src1 || '',
          alt: btn.dataset.modalTitle || btn.dataset.alt || 'Exercise preview'
        });
      });

      tryNext();
    };

    try {
      exerciseMediaObserver?.disconnect?.();
    } catch {
      // ignore
    }

    if (!('IntersectionObserver' in window)) {
      targets.forEach(loadOne);
      return;
    }

    exerciseMediaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        loadOne(entry.target);
        try { exerciseMediaObserver.unobserve(entry.target); } catch { /* ignore */ }
      });
    }, { rootMargin: '220px 0px' });

    targets.forEach((t) => exerciseMediaObserver.observe(t));
  }

  async function fileToSquareAvatarDataUrl(file, { size = 512, quality = 0.86 } = {}) {
    if (!file) return null;
    const type = String(file.type || '').toLowerCase();
    if (!type.startsWith('image/')) return null;

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Invalid image'));
      i.src = dataUrl;
    });

    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!w || !h) return null;

    const side = Math.min(w, h);
    const sx = Math.floor((w - side) / 2);
    const sy = Math.floor((h - side) / 2);
    const out = Math.max(160, Math.min(1024, Number(size) || 512));

    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);

    try {
      return canvas.toDataURL('image/jpeg', Math.max(0.6, Math.min(0.92, Number(quality) || 0.86)));
    } catch {
      return dataUrl;
    }
  }

  async function api(path, opts) {
    const method = String(opts?.method || 'GET').toUpperCase();
    const hasBody = opts?.body != null && opts.body !== '';
    const baseHeaders = { ...(opts?.headers || {}) };
    const headers = hasBody || method !== 'GET'
      ? { 'Content-Type': 'application/json', ...baseHeaders }
      : baseHeaders;
    const {
      timeoutMs: rawTimeoutMs,
      signal: externalSignal,
      ...restOpts
    } = (opts || {});
    const timeoutMs = Number(rawTimeoutMs);
    const shouldUseInternalTimeout = !externalSignal;
    const timeoutToUse = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : (shouldUseInternalTimeout ? 12_000 : 0);

    const controller = new AbortController();
    let timeoutId = 0;
    let detachExternalAbort = null;
    if (externalSignal) {
      const onAbort = () => {
        try { controller.abort(); } catch { /* ignore */ }
      };
      if (externalSignal.aborted) onAbort();
      else externalSignal.addEventListener('abort', onAbort, { once: true });
      detachExternalAbort = () => {
        try { externalSignal.removeEventListener('abort', onAbort); } catch { /* ignore */ }
      };
    }
    if (timeoutToUse > 0) {
      timeoutId = window.setTimeout(() => {
        try { controller.abort(); } catch { /* ignore */ }
      }, timeoutToUse);
    }

    try {
      const resp = await fetch(path, {
        credentials: 'include',
        headers,
        signal: controller.signal,
        ...restOpts
      });
      let json = null;
      try {
        json = await resp.json();
      } catch {
        json = null;
      }
      return { ok: resp.ok, status: resp.status, json };
    } catch (err) {
      const aborted = String(err?.name || '').trim() === 'AbortError';
      return {
        ok: false,
        status: aborted ? 408 : 0,
        json: aborted ? {
          error: 'training_build_frontend_abort_timeout',
          message: 'The plan build timed out in the browser before the server responded.'
        } : null,
        error: err
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (detachExternalAbort) detachExternalAbort();
    }
  }

  function bindShareClose() {
    if (shareCloseBound) return;
    shareCloseBound = true;

    document.addEventListener('pointerdown', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const row = target.closest('.share-workout-item');
      if (!row) return;
      const name = String(row.querySelector('.share-workout-name')?.textContent || '').trim();
      const handle = String(row.querySelector('.share-workout-handle')?.textContent || '').trim();
      const button = row.querySelector('.share-workout-add-btn');
      const label = String(button?.textContent || '').trim();
      const disabled = button instanceof HTMLButtonElement ? button.disabled : null;
      shareDebugLog('pointerdown row', {
        name: name || null,
        handle: handle || null,
        buttonLabel: label || null,
        disabled
      });
    }, true);

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest('.share-workout-add-btn, .share-workout-add, .share-workout-kick-btn, .share-workout-member-btn');
      if (!btn) return;
      try {
        const row = btn.closest('.share-workout-item');
        const name = String(row?.querySelector('.share-workout-name')?.textContent || '').trim();
        const handle = String(row?.querySelector('.share-workout-handle')?.textContent || '').trim();
        shareDebugLog('click captured on share button', {
          version: SHARE_DEBUG_VERSION,
          label: String(btn.textContent || '').trim(),
          name: name || null,
          handle: handle || null,
          disabled: btn instanceof HTMLButtonElement ? btn.disabled : null
        });
      } catch {
        // ignore console failures
      }
    }, true);

    // Legacy fallback: support old markup
    // <button class="share-workout-item"><span class="share-workout-add">Add</span></button>
    document.addEventListener('click', async (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.share-workout-add-btn')) return;
      const legacyRow = target.closest('button.share-workout-item');
      if (!legacyRow) return;

      e.preventDefault();
      e.stopPropagation();

      const rowId = String(legacyRow.getAttribute('data-user-id') || '').trim();
      const handleText = String(legacyRow.querySelector('.share-workout-handle')?.textContent || '').trim();
      const username = handleText.startsWith('@') ? handleText.slice(1).trim().toLowerCase() : handleText.toLowerCase();
      const displayName = String(legacyRow.querySelector('.share-workout-name')?.textContent || '').trim();
      const addLabel = String(legacyRow.querySelector('.share-workout-add')?.textContent || '').trim();

      shareDebugLog('legacy share click path hit', {
        rowTag: legacyRow.tagName,
        rowId: rowId || null,
        username: username || null,
        displayName: displayName || null,
        addLabel: addLabel || null,
        accountsLoaded: Array.isArray(shareUi.accounts) ? shareUi.accounts.length : 0
      });

      let account = null;
      if (rowId) {
        account = (shareUi.accounts || []).find((item) => String(item?.id || '').trim() === rowId) || null;
      }
      if (!account && username) {
        account = (shareUi.accounts || []).find((item) => String(item?.username || '').trim().toLowerCase() === username) || null;
      }
      if (!account && displayName) {
        account = (shareUi.accounts || []).find((item) => String(item?.displayName || '').trim().toLowerCase() === displayName.toLowerCase()) || null;
      }

      if (!account) {
        shareDebugLog('legacy share click: account lookup failed', {
          rowId: rowId || null,
          username: username || null,
          displayName: displayName || null
        });
        return;
      }

      shareDebugLog('legacy share click: resolved account', {
        id: String(account?.id || '').trim() || null,
        username: String(account?.username || '').trim() || null
      });

      await sendShareRequestToAccount(account);
    }, true);

    document.addEventListener('click', (e) => {
      if (!shareUi.open) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const popover = document.getElementById('share-workout-popover');
      const anchor = document.querySelector('[data-share-workout="1"]');
      if (popover && popover.contains(target)) return;
      if (anchor && anchor.contains(target)) return;
      shareUi.open = false;
      render();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && shareUi.open) {
        shareUi.open = false;
        render();
      }
    });
  }

  async function loadShareAccounts(query = '') {
    if (shareUi.loading) return;
    const canProceed = await ensureShareAuth({ promptOnFail: false });
    if (!canProceed) {
      shareUi.accounts = [];
      shareUi.accountIndex.clear();
      shareUi.status = 'Sign in to view friends.';
      shareUi.loading = false;
      render();
      return;
    }
    shareUi.loading = true;
    shareUi.status = 'Loading friends...';
    render();

    try {
      const fetchShareData = () => Promise.all([
        api('/api/friends/list', { method: 'GET' }),
        api('/api/training/share/outgoing', { method: 'GET' })
      ]);
      let [resp, outgoingResp] = await fetchShareData();
      if (resp.status === 401 || outgoingResp.status === 401) {
        const refreshed = await refreshShareAuthSnapshot();
        if (refreshed.ok) {
          [resp, outgoingResp] = await fetchShareData();
        }
      }
      if (resp.status === 401 || outgoingResp.status === 401) {
        shareUi.accounts = [];
        shareUi.accountIndex.clear();
        shareUi.status = 'Sign in to view friends.';
        shareUi.loading = false;
        render();
        return;
      }
      if (!resp.ok || !resp.json?.ok) {
        shareUi.accounts = [];
        shareUi.accountIndex.clear();
        shareUi.status = 'Could not load friends.';
        shareUi.loading = false;
        render();
        return;
      }
      const list = Array.isArray(resp.json?.friends) ? resp.json.friends : [];
      shareUi.accountIndex.clear();
      for (const item of list) {
        const id = String(item?.id || '').trim();
        if (!id) continue;
        shareUi.accountIndex.set(id, item);
      }
      const q = String(query || '').trim().toLowerCase();
      const filtered = q
        ? list.filter((item) => {
            const name = String(item?.displayName || '').toLowerCase();
            const username = String(item?.username || '').toLowerCase();
            return name.includes(q) || username.includes(q);
          })
        : list;

      if (outgoingResp.ok && outgoingResp.json?.ok) {
        syncShareOutgoingState(outgoingResp.json);
      } else {
        shareDebugLog('outgoing refresh failed during loadShareAccounts', {
          ok: outgoingResp?.ok,
          status: outgoingResp?.status,
          json: outgoingResp?.json || null
        });
      }

      shareUi.accounts = filtered;
      try {
        shareDebugLog('loaded share targets', filtered.map((item) => ({
          id: String(item?.id || '').trim() || null,
          username: item?.username || null,
          displayName: item?.displayName || null
        })));
      } catch {
        // ignore console failures
      }
      const count = filtered.length;
      shareUi.status = q
        ? `Results for "${query}" (${count})`
        : (count ? `Showing ${count} friends` : 'No friends yet.');
      shareUi.loaded = true;
    } catch {
      shareUi.accounts = [];
      shareUi.accountIndex.clear();
      shareUi.status = 'Could not load friends.';
    }

    shareUi.loading = false;
    render();
  }

  async function sendShareRequestToAccount(account) {
    const key = String(account?.id || '').trim();
    if (!key) return;
    if (shareUi.requesting.has(key) || shareUi.requested.has(key)) return;
    if (!(await ensureShareAuth({ promptOnFail: true }))) return;
    const displayName = String(account?.displayName || account?.username || 'friend').trim();
    const traceId = `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    shareUi.requesting.add(key);
    shareUi.status = `Requesting ${displayName}...`;
    try {
      shareDebugLog(`[${traceId}] Add clicked`, {
        targetUserId: key,
        displayName
      });
    } catch {
      // ignore console failures
    }
    render();

    let resp = await api('/api/training/share', {
      method: 'POST',
      body: JSON.stringify({ targetUserIds: [key], targetUserId: key })
    });
    if (resp.status === 401) {
      const refreshed = await refreshShareAuthSnapshot();
      if (refreshed.ok) {
        resp = await api('/api/training/share', {
          method: 'POST',
          body: JSON.stringify({ targetUserIds: [key], targetUserId: key })
        });
      }
    }
    try {
      shareDebugLog(`[${traceId}] POST /api/training/share`, {
        ok: resp?.ok,
        status: resp?.status,
        json: resp?.json || null
      });
    } catch {
      // ignore console failures
    }

    if (!resp.ok || !resp.json?.ok) {
      shareUi.requesting.delete(key);
      if (resp.status === 401) {
        shareUi.status = 'Session expired. Sign in to continue.';
        openAuthModal('login');
      } else {
        shareUi.status = resp.json?.error || 'Could not send workout request.';
      }
      render();
      return;
    }

    const sent = Math.max(0, Number(resp.json?.invited || 0));
    shareUi.requesting.delete(key);
    if (sent > 0) {
      let confirmed = false;
      const outgoing = await api('/api/training/share/outgoing', { method: 'GET' });
      if (outgoing.ok && outgoing.json?.ok) {
        const pending = syncShareOutgoingState(outgoing.json);
        confirmed = pending.has(key);
        try {
          shareDebugLog(`[${traceId}] GET /api/training/share/outgoing`, {
            ok: outgoing?.ok,
            status: outgoing?.status,
            pendingCount: pending.size,
            containsTarget: confirmed,
            latestStatus: shareUi.latestStatus.get(key) || null
          });
        } catch {
          // ignore console failures
        }
      } else {
        try {
          shareDebugLog(`[${traceId}] GET /api/training/share/outgoing failed`, {
            ok: outgoing?.ok,
            status: outgoing?.status,
            json: outgoing?.json || null
          });
        } catch {
          // ignore console failures
        }
      }

      if (!confirmed) {
        shareUi.status = 'Request was not confirmed. Try Add again.';
        try {
          shareDebugLog(`[${traceId}] Invite not confirmed in outgoing list`, { targetUserId: key });
        } catch {
          // ignore console failures
        }
        render();
        return;
      }

      scheduleShareRequestSentToast(sent);
      shareUi.status = `Workout request sent to ${displayName}.`;
      try {
        shareDebugLog(`[${traceId}] Invite confirmed`, {
          targetUserId: key,
          invited: sent
        });
      } catch {
        // ignore console failures
      }
    } else {
      shareUi.status = 'No valid recipient.';
      try {
        shareDebugLog(`[${traceId}] Invite API returned invited=0`, { targetUserId: key });
      } catch {
        // ignore console failures
      }
    }
    render();
  }

  async function removeAcceptedShareForAccount(account) {
    const targetUserId = String(account?.actionTargetId || account?.id || '').trim();
    if (!targetUserId) return;
    const opKey = String(account?.operationKey || targetUserId).trim();
    if (shareUi.kicking.has(opKey)) return;

    const displayName = String(account?.displayName || account?.username || 'friend').trim();
    const traceId = `share-kick-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    shareUi.kicking.add(opKey);
    shareUi.status = `Removing ${displayName}...`;
    try {
      shareDebugLog(`[${traceId}] Kick clicked`, {
        targetUserId,
        displayName
      });
    } catch {
      // ignore console failures
    }
    render();

    try {
      const resp = await api('/api/training/share/remove', {
        method: 'POST',
        body: JSON.stringify({ targetUserId, targetUserIds: [targetUserId] })
      });
      try {
        shareDebugLog(`[${traceId}] POST /api/training/share/remove`, {
          ok: resp?.ok,
          status: resp?.status,
          json: resp?.json || null
        });
      } catch {
        // ignore console failures
      }

      if (!resp.ok || !resp.json?.ok) {
        shareUi.status = resp?.json?.error || 'Could not remove account from workout.';
        return;
      }

      // Optimistic clear; we still refresh from server.
      shareUi.requested.delete(targetUserId);
      shareUi.latestStatus.delete(targetUserId);

      const outgoing = await api('/api/training/share/outgoing', { method: 'GET' });
      if (outgoing.ok && outgoing.json?.ok) {
        syncShareOutgoingState(outgoing.json);
        const latestRaw = String(outgoing.json?.latestStatusByUserId?.[targetUserId] || '').trim().toLowerCase();
        const confirmed = latestRaw === 'removed' || latestRaw === '';
        try {
          shareDebugLog(`[${traceId}] GET /api/training/share/outgoing`, {
            ok: outgoing?.ok,
            status: outgoing?.status,
            latestRaw,
            confirmed
          });
        } catch {
          // ignore console failures
        }
        if (!confirmed) {
          shareUi.status = 'Kick was not confirmed. Try again.';
          return;
        }
      } else {
        try {
          shareDebugLog(`[${traceId}] GET /api/training/share/outgoing failed`, {
            ok: outgoing?.ok,
            status: outgoing?.status,
            json: outgoing?.json || null
          });
        } catch {
          // ignore console failures
        }
      }

      shareUi.status = `${displayName} removed from shared workout.`;
    } finally {
      shareUi.kicking.delete(opKey);
      render();
    }
  }

  async function leaveSharedWorkoutFromOwner(account) {
    const ownerUserId = String(account?.actionTargetId || account?.id || '').trim();
    if (!ownerUserId) return;
    const opKey = String(account?.operationKey || ownerUserId).trim();
    if (shareUi.kicking.has(opKey)) return;

    const ownerName = String(account?.ownerDisplayName || account?.displayName || account?.username || 'owner').trim();
    const traceId = `share-leave-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    shareUi.kicking.add(opKey);
    shareUi.status = `Leaving ${ownerName}'s shared workout...`;
    try {
      shareDebugLog(`[${traceId}] Leave clicked`, {
        ownerUserId,
        ownerName
      });
    } catch {
      // ignore
    }
    render();

    try {
      const resp = await api('/api/training/share/leave', {
        method: 'POST',
        body: JSON.stringify({ ownerUserId })
      });
      try {
        shareDebugLog(`[${traceId}] POST /api/training/share/leave`, {
          ok: resp?.ok,
          status: resp?.status,
          json: resp?.json || null
        });
      } catch {
        // ignore console failures
      }
      if (!resp.ok || !resp.json?.ok) {
        shareUi.status = resp?.json?.error || 'Could not leave shared workout.';
        return;
      }

      await refreshShareOutgoingState({ rerender: false });
      shareUi.status = `You left ${ownerName}'s shared workout.`;
    } finally {
      shareUi.kicking.delete(opKey);
      render();
    }
  }

function toggleSharePopover(force) {
    const next = typeof force === 'boolean' ? force : !shareUi.open;
    shareUi.open = next;
    if (shareUi.open) {
      shareUi.bootstrapRequested = true;
      // Always refresh from server so "Requested" clears after receiver accepts/declines.
      loadShareAccounts(shareUi.query || '');
    }
    render();
  }

  function wireAuthSync() {
    if (window.__odeTrainingAuthSyncWired) return;
    window.__odeTrainingAuthSyncWired = true;

    let refreshInFlight = false;
    let refreshQueued = false;

    const refresh = async ({ silent = false } = {}) => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      try {
        await loadAuthAndState({ silent });
      } catch {
        state.planError = 'Failed to refresh training state. Please reload.';
        setView('plan');
      } finally {
        refreshInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          refresh({ silent });
        }
      }
    };

    // Sign-in / sign-out from the global auth modal.
    window.addEventListener('odeauth', async () => {
      await refresh({ silent: false });
      if (!state.auth.user) return;
      applyPendingResumeStepIfPossible();
    });

    // Signed in on another tab/window? Refresh when the user returns.
    window.addEventListener('focus', () => {
      if (workoutTimer.running || workoutTimer.paused) return;
      if (state.view !== 'generating') refresh({ silent: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (workoutTimer.running || workoutTimer.paused) return;
      if (!document.hidden && state.view !== 'generating') refresh({ silent: true });
    });
  }

  async function submitMealServiceLead({ phone, email } = {}) {
    const wants = ['meal_prep_service'];
    const payload = {
      source: 'training_meal_prep',
      path: location.pathname,
      wants,
      phone: String(phone || '').trim() || null,
      email: String(email || '').trim() || null,
      snapshot: {
        discipline: state.wizard?.discipline || state.planRow?.discipline || null,
        daysPerWeek: state.wizard?.daysPerWeek || state.planRow?.days_per_week || null
      }
    };

    try {
      const resp = await api('/api/track/lead', { method: 'POST', body: JSON.stringify(payload) });
      if (!resp.ok) {
        // Server not running / DB not configured — still remember the user's intent locally.
        localStorage.setItem('ode_meal_prep_optin_v1', JSON.stringify({ ...payload, at: new Date().toISOString() }));
        return { ok: false, error: resp.json?.error || 'Could not submit. Saved locally.' };
      }
      return { ok: true };
    } catch {
      localStorage.setItem('ode_meal_prep_optin_v1', JSON.stringify({ ...payload, at: new Date().toISOString() }));
      return { ok: false, error: 'Could not submit. Saved locally.' };
    }
  }

  function stopGeneratingTicker() {
    if (state.generating?.raf) cancelAnimationFrame(state.generating.raf);
    if (state.generating) state.generating.raf = 0;
  }

  function startGeneratingTicker() {
    if (state.view !== 'generating') return;
    stopGeneratingTicker();
    state.generating.startedAt = Date.now();

    const messages = (() => {
      const injuries = String(state.wizard?.profile?.injuries || '').trim();
      return [
        'Optimizing your split...',
        'Selecting movements for your equipment...',
        injuries ? 'Accounting for injuries / pain points...' : 'Checking common injury risks...',
        'Balancing volume + recovery...',
        'Setting progression targets...',
        'Finalizing your plan...'
      ];
    })();

    const tick = () => {
      if (state.view !== 'generating') return;
      const elapsed = Math.max(0, Date.now() - (state.generating.startedAt || Date.now()));
      const minMs = Math.max(2500, Number(state.generating.minMs) || 9_000);
      const timeoutMs = Math.max(minMs + 5_000, Number(state.generating.timeoutMs) || 60_000);
      const estimateSec = Math.max(3, Math.round(minMs / 1000));
      const elapsedSec = Math.max(0, Math.round(elapsed / 1000));
      const progressWindowMs = Math.max(minMs, Math.min(timeoutMs - 5_000, 20_000));
      const pct = Math.min(95, Math.round((Math.min(elapsed, progressWindowMs) / progressWindowMs) * 95));

      const bar = document.getElementById('training-gen-bar');
      const msg = document.getElementById('training-gen-msg');
      const meta = document.getElementById('training-gen-meta');
      const prog = document.getElementById('training-gen-progress');
      const handoffActive = Boolean(state.generating?.handoffActive);
      const handoffMessage = String(state.generating?.handoffMessage || '').trim();
      const handoffMeta = String(state.generating?.handoffMeta || '').trim();

      if (bar) bar.style.width = `${pct}%`;
      if (prog) prog.setAttribute('aria-valuenow', String(pct));
      if (meta) {
        meta.textContent = handoffActive
          ? (handoffMeta || `Checking for completed plan... ${elapsedSec}s elapsed.`)
          : (elapsed < minMs
            ? `${pct}% - ${elapsedSec}s elapsed. Usually about ${estimateSec}s.`
            : `${pct}% - Still building... ${elapsedSec}s elapsed.`);
      }

      const idx = Math.min(messages.length - 1, Math.floor(elapsed / 6500));
      if (msg) msg.textContent = handoffActive
        ? (handoffMessage || 'Workout is still finishing. Checking for completed plan...')
        : (messages[idx] || messages[messages.length - 1] || 'Working...');

      state.generating.raf = requestAnimationFrame(tick);
    };

    state.generating.raf = requestAnimationFrame(tick);
  }

  const DISABLE_WIZARD_FLOW = true;
  const keepOnEngineAndRetry = ({ forceAutostart = false } = {}) => {
    if (engineRetryInFlight) return;
    engineRetryInFlight = true;
    state.planError = null;
    state.generating.minMs = 600;
    state.generating.timeoutMs = 12_000;
    setView('generating');
    Promise.resolve().then(async () => {
      const pollToken = createGenerationPollToken();
      state.generating.pollToken = pollToken;
      try {
        const force = Boolean(forceAutostart || shouldForceAutostart());
        if (force) clearForceAutostart();
        const autoOnboarded = await tryAutoOnboardFromIntake(force);
        if (autoOnboarded) return;
        const ready = await pollForPlanReady({ maxMs: 12_000, intervalMs: 900, pollToken });
        if (ready) return;
        clearWorkoutGenerationState({ cancelRequest: false, clearFlags: true });
        state.planError = readLocalIntake()
          ? 'Workout build is taking longer than expected. Please try again.'
          : 'No saved setup found. Complete setup, then tap Enter Engine.';
        setView('plan');
      } finally {
        if (state.generating?.pollToken === pollToken) state.generating.pollToken = null;
        engineRetryInFlight = false;
      }
    });
  };

  function setView(next) {
    if (next === 'upsell') next = 'plan';
    if (next !== 'generating') clearConstructingBootFlag();
    const wizardOnlyRequested = next === 'wizard' && shouldOpenWizardOnly();
    if (DISABLE_WIZARD_FLOW && next === 'wizard' && !wizardOnlyRequested) {
      const shouldAutoResumeBuild = shouldForceAutostart() || shouldBootIntoConstructing() || hasOwedAutoBuild();
      if (shouldAutoResumeBuild) {
        keepOnEngineAndRetry({ forceAutostart: shouldForceAutostart() });
      } else {
        state.planError = state.planError || 'No saved setup found. Complete setup to generate a workout.';
        state.view = 'plan';
        render();
      }
      return;
    }
    if (wizardOnlyRequested) clearOpenWizardOnlyFlag();
    const prev = state.view;
    if (next === 'generating') state.planError = null;
    state.view = next;
    render();
    if (prev === 'generating' && next !== 'generating') stopGeneratingTicker();
    if (next === 'generating') startGeneratingTicker();
    if (next === 'plan') {
      window.setTimeout(() => {
        try { maybeShowTrainingWelcomeModal(); } catch { /* ignore */ }
        try { maybeStartTrainingQuickTour(); } catch { /* ignore */ }
        pollShareEvents({ force: true }).catch(() => {});
      }, 80);
    }
  }

  function setWizard(patch) {
    state.wizard = { ...state.wizard, ...patch };
    render();
  }

  function setWizardSilent(patch) {
    state.wizard = { ...state.wizard, ...patch };
  }

  function setMealServiceSilent(patch) {
    state.mealService = { ...state.mealService, ...(patch && typeof patch === 'object' ? patch : {}) };
  }

  function setMealService(patch) {
    setMealServiceSilent(patch);
    render();
  }

  function updateStrength(patch) {
    const current = state.wizard?.strength && typeof state.wizard.strength === 'object' ? state.wizard.strength : {};
    setWizardSilent({ strength: { ...current, ...(patch && typeof patch === 'object' ? patch : {}) } });
  }

  function updateProfile(patch) {
    const current = state.wizard?.profile && typeof state.wizard.profile === 'object' ? state.wizard.profile : {};
    setWizardSilent({ profile: { ...current, ...(patch && typeof patch === 'object' ? patch : {}) } });
  }

  function openAuthModal(mode = 'login') {
    try {
      if (typeof window.odeOpenAuthModal === 'function') {
        window.odeOpenAuthModal(mode);
        return true;
      }
      const btn = document.getElementById('auth-signin-btn');
      if (btn && typeof btn.click === 'function') {
        btn.click();
        return true;
      }
      const controlBtn = document.getElementById('control-signin');
      controlBtn?.click?.();
      return Boolean(controlBtn);
    } catch {
      return false;
    }
  }

  async function requireAuthToContinue(nextStep) {
    if (state.auth.user) return true;

    const confirm = typeof window.odeConfirm === 'function' ? window.odeConfirm : null;
    if (!confirm) {
      state.wizard.pendingStep = Number(nextStep) || null;
      writeResumeStep(nextStep);
      openAuthModal('signup');
      return false;
    }

    const ok = await confirm({
      title: 'Finish setup (free)',
      message: 'Create a free account to continue building your plan.\nAlready have an account? You can sign in instead.',
      confirmText: 'Sign in / Sign up',
      cancelText: 'Not now'
    });

    if (!ok) return false;

    state.wizard.pendingStep = Number(nextStep) || null;
    writeResumeStep(nextStep);
    openAuthModal('signup');
    return false;
  }

  async function loadAuthAndState({ silent = false } = {}) {
    const hadRenderablePlan = hasRenderablePlanRow(state.planRow);
    const previousPlanRow = state.planRow;
    const previousLogs = Array.isArray(state.logs) ? state.logs.slice() : [];
    if (!silent && !hadRenderablePlan) setView('loading');
    const forceAutostart = shouldForceAutostart();

    let me;
    try {
      me = await api('/api/auth/me', { method: 'GET', timeoutMs: 7000 });
    } catch {
      if (silent && (state.auth.user || hadRenderablePlan)) return;
      state.auth.user = null;
      shareEventsInFlight = false;
      resetWorkoutTimerState({ removePersisted: false });
      resetWorkoutRestTimerState({ removePersisted: false });
      state.profile = null;
      state.planRow = null;
      state.logs = [];
      state.allLogs = [];
      state.liftHistory = new Map();
      shareUi.open = false;
      shareUi.loaded = false;
      shareUi.bootstrapRequested = false;
      shareUi.accounts = [];
      shareUi.accountIndex.clear();
      shareUi.connectedMembers = [];
      shareUi.status = '';
      shareUi.requesting.clear();
      shareUi.kicking.clear();
      shareUi.requested.clear();
      shareUi.latestStatus.clear();
      clearShareConfirmToastTimer();
      const autoOnboarded = await tryAutoOnboardFromIntake(forceAutostart);
      if (autoOnboarded) return;
      setView('wizard');
      return;
    }

    const meUser = me.ok ? (me.json?.user || null) : null;
    sessionIsImpersonated = !!(me.ok && me.json?.impersonation?.active);
    if (meUser) { try { await ensureSessionCoach(); } catch { /* ignore */ } }
    if (!me.ok || !meUser) {
      if (silent && (state.auth.user || hadRenderablePlan)) return;
      state.auth.user = null;
      shareEventsInFlight = false;
      resetWorkoutTimerState({ removePersisted: false });
      resetWorkoutRestTimerState({ removePersisted: false });
      state.profile = null;
      state.planRow = null;
      state.logs = [];
      state.allLogs = [];
      state.liftHistory = new Map();
      shareUi.open = false;
      shareUi.loaded = false;
      shareUi.bootstrapRequested = false;
      shareUi.accounts = [];
      shareUi.accountIndex.clear();
      shareUi.connectedMembers = [];
      shareUi.status = '';
      shareUi.requesting.clear();
      shareUi.kicking.clear();
      shareUi.requested.clear();
      shareUi.latestStatus.clear();
      clearShareConfirmToastTimer();
      const autoOnboarded = await tryAutoOnboardFromIntake(forceAutostart);
      if (autoOnboarded) return;
      setView('wizard');
      return;
    }
    const canUseClientTrainingPortal = typeof window.__odeCanAccessClientTrainingPortal === 'function'
      ? window.__odeCanAccessClientTrainingPortal(meUser, null)
      : !(Boolean((meUser?.isTrainer || meUser?.trainer?.active || meUser?.isManager || meUser?.manager?.active)) && !Boolean(meUser?.isOwner));
    if (!canUseClientTrainingPortal) {
      const nextHref = typeof window.__odeGetRestrictedPortalHref === 'function'
        ? window.__odeGetRestrictedPortalHref(meUser)
        : 'trainer-dashboard.html';
      window.location.replace(nextHref);
      return;
    }
    state.auth.user = meUser;
    shareEventsInFlight = false;
    shareUi.open = false;
    shareUi.loaded = false;
    shareUi.bootstrapRequested = false;
    shareUi.accounts = [];
    shareUi.accountIndex.clear();
    shareUi.connectedMembers = [];
    shareUi.status = '';
    shareUi.requesting.clear();
    shareUi.kicking.clear();
    shareUi.requested.clear();
    shareUi.latestStatus.clear();
    clearShareConfirmToastTimer();

    let s;
    try {
      s = await api('/api/training/state', { method: 'GET', timeoutMs: 9000 });
    } catch {
      if (silent && hadRenderablePlan) return;
      if (forceAutostart || shouldBootIntoConstructing()) {
        const recovered = await recoverPendingPlan({ maxMs: 180_000, intervalMs: 2000 });
        if (recovered) return;
      }
      state.planError = neutralizePlanLoadError('Failed to load training state. Please refresh.');
      setView('plan');
      return;
    }

    if (!s.ok) {
      if (silent && hadRenderablePlan) return;
      if (s.status === 401) {
        state.auth.user = null;
        shareEventsInFlight = false;
        resetWorkoutTimerState({ removePersisted: false });
        resetWorkoutRestTimerState({ removePersisted: false });
        state.profile = null;
        state.planRow = null;
        state.logs = [];
        state.allLogs = [];
        state.liftHistory = new Map();
        shareUi.open = false;
        shareUi.loaded = false;
        shareUi.bootstrapRequested = false;
        shareUi.accounts = [];
        shareUi.accountIndex.clear();
        shareUi.connectedMembers = [];
        shareUi.status = '';
        shareUi.requesting.clear();
        shareUi.kicking.clear();
        shareUi.requested.clear();
        shareUi.latestStatus.clear();
        clearShareConfirmToastTimer();
        setView('wizard');
        return;
      }
      if (forceAutostart || shouldBootIntoConstructing()) {
        const recovered = await recoverPendingPlan({ maxMs: 180_000, intervalMs: 2000 });
        if (recovered) return;
      }
      state.planError = neutralizePlanLoadError(s.json?.error || 'Failed to load training state.');
      setView('plan');
      return;
    }
    const fetchedProfile = s.json?.profile || null;
    const fetchedPlanRow = s.json?.plan || null;
    const previousPlanId = String(previousPlanRow?.id || '').trim();
    const fetchedPlanId = String(fetchedPlanRow?.id || '').trim();
    rememberLiftHistory(s.json?.liftHistory, { replace: true });
    if (silent && hadRenderablePlan && !hasRenderablePlanRow(fetchedPlanRow)) {
      state.profile = fetchedProfile || state.profile;
      state.planRow = previousPlanRow;
      state.logs = previousLogs;
      return;
    }
    if (silent && hadRenderablePlan && previousPlanId && fetchedPlanId && previousPlanId !== fetchedPlanId && hasInProgressWorkoutSession()) {
      state.profile = fetchedProfile || state.profile;
      state.planRow = previousPlanRow;
      state.logs = previousLogs;
      return;
    }

    state.profile = fetchedProfile;
    state.planRow = fetchedPlanRow;
    sanitizeBodybuildingPlanInPlace(state.planRow);
    const hasFetchedRenderablePlan = hasRenderablePlanRow(state.planRow);
    if (hasFetchedRenderablePlan) {
      state.planError = null;
      clearConstructingBootFlag();
      clearAutoRetryPause();
      if (forceAutostart) clearForceAutostart();
      // Plan exists — the onboarding owed-build is satisfied. Clearing it
      // here is what stops a fresh plan being generated on every later login.
      clearOwedAutoBuild();
    }
    const shouldAutoBuildDemoPlan = shouldBootDemoPlan(state.auth.user, state.planRow);
    if (hasRenderablePlanRow(state.planRow) && hasRecentlyCompletedTrainingBuild(mapIntakeToOblueprintPayload(await loadSavedIntake()), { withinMs: 30000 })) {
      return;
    }
    if (!hasFetchedRenderablePlan && (forceAutostart || shouldAutoBuildDemoPlan || hasOwedAutoBuild())) {
      if (shouldAutoBuildDemoPlan) setView('generating');
      const autoOnboarded = await tryAutoOnboardFromIntake(true);
      if (autoOnboarded) return;
    }
    if (state.planRow?.id) {
      clearOwedAutoBuild();
      maybeArmTrainingQuickTourForFirstPlan();
      restoreWorkoutDraftState({ userId: state.auth.user?.id, planId: state.planRow.id });
      restorePersistedWorkoutTimerState({ userId: state.auth.user?.id, planId: state.planRow.id });
      restorePersistedWorkoutRestTimerState({ userId: state.auth.user?.id, planId: state.planRow.id });
      state.logs = [];
      state.allLogs = [];
      setView('plan');
      void refreshTrainingLogs(state.planRow.id)
        .then(() => {
          render();
        })
        .catch(() => {});
      return;
    }
    if (hasRenderablePlanRow(state.planRow) && Number(state.generating?.completedAt || 0) > 0) {
      return;
    }
    const autoOnboarded = await tryAutoOnboardFromIntake(forceAutostart || shouldBootDemoPlan(state.auth.user, state.planRow));
    if (autoOnboarded) return;
    resetWorkoutTimerState({ removePersisted: false });
    resetWorkoutRestTimerState({ removePersisted: false });
    setView('wizard');
    applyPendingResumeStepIfPossible();
  }

  function renderLoading() {
    // Keep loading UI minimal to avoid the "yellow tinted box" flash.
    return el('div', { class: 'training-loading-inline' },
      el('div', { class: 'training-muted' }, 'Loading...')
    );
  }

  function renderWizard() {
    const step = state.wizard.step;

    const pill = (i, label) => el('div', {
      class: `training-step-pill ${i === step ? 'active' : i < step ? 'done' : ''}`
    }, label);

    const header = el('div', { class: 'training-progress' },
      el('div', { class: 'training-progress-top' },
        el('div', null,
          el('h3', { style: 'margin: 0' }, 'Setup'),
          el('div', { class: 'training-muted' }, `Step ${step} of 5`)
        ),
        el('div', { class: 'training-muted' },
          state.auth.user?.displayName ? `Signed in as ${state.auth.user.displayName}` : ''
        )
      ),
        el('div', { class: 'training-steps' },
          pill(1, 'Discipline'),
          pill(2, 'Metrics'),
          pill(3, 'Days'),
          pill(4, 'Photo')
        )
      );

    const shell = el('div', { class: 'training-card training-center' }, header);
    const inlineError = el('div', { class: 'auth-error hidden', id: 'training-wizard-error' }, '');
    const content = el('div', { class: 'training-form' }, inlineError);

    const actions = el('div', { class: 'training-actions' });
    const backBtn = el('button', {
      type: 'button',
      class: 'btn btn-ghost',
      onclick: () => setWizard({ step: Math.max(1, step - 1) })
    }, 'Back');
      const nextBtn = el('button', { type: 'button', class: 'btn btn-primary' }, step === 4 ? 'Save and go to dashboard' : 'Continue');
    if (step > 1) actions.appendChild(backBtn);
    actions.appendChild(nextBtn);

    function clearError() {
      inlineError.textContent = '';
      inlineError.classList.add('hidden');
    }

    function flashError(message) {
      inlineError.textContent = String(message || 'Fix the fields above.');
      inlineError.classList.remove('hidden');
      inlineError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function requireValue(ok, message) {
      if (ok) return true;
      flashError(message);
      return false;
    }

    function experiencePicker() {
      const current = state.wizard.experience;
      const expMeta = {
        beginner: 'Less than 2 years lifting',
        intermediate: '2–5 years lifting',
        advanced: '5+ years lifting'
      };
      return el('div', null,
        el('div', { class: 'auth-label' }, 'Skill level'),
        el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
          ['beginner', 'intermediate', 'advanced'].map((v) =>
            el('label', { class: 'training-choice' },
              el('input', {
                type: 'radio',
                name: 'experience',
                value: v,
                checked: current === v ? 'true' : null,
                onchange: () => setWizardSilent({ experience: v })
              }),
              el('div', null,
                el('div', { class: 'training-choice-title' }, v[0].toUpperCase() + v.slice(1)),
                el('div', { class: 'training-muted', style: 'font-size:12px;' }, expMeta[v] || '')
              )
            )
          )
        )
      );
    }

    if (step === 1) {
      const discipline = normalizeDiscipline(state.wizard.discipline) || 'bodybuilding';
      if (discipline !== state.wizard.discipline) setWizardSilent({ discipline });

      const intro =
        discipline === 'powerlifting'
          ? 'Strength-focused plan built around squat, bench, and deadlift.'
          : discipline === 'powerbuilding'
            ? 'Build strength on key lifts while adding muscle.'
          : discipline === 'military'
            ? 'Build endurance, strength, work capacity, and athletic readiness.'
          : discipline === 'calisthenics'
            ? 'Bodyweight program built around push, pull, and skill work.'
            : 'Hypertrophy program built around progressive overload.';

      const disciplineChoices = [
        { key: 'powerlifting', title: 'Powerlifting', sub: 'Squat • Bench • Deadlift' },
        { key: 'powerbuilding', title: 'Powerbuilding', sub: 'Build strength on key lifts while adding muscle.' },
        { key: 'bodybuilding', title: 'Aesthetic Bodybuilding', sub: 'Muscle gain and physique focus.' },
        { key: 'military', title: 'Military Hybrid', sub: 'Endurance + strength + readiness.' },
        { key: 'calisthenics', title: 'Calisthenics', sub: 'Bodyweight' }
      ];

      const disciplinePicker = el('div', null,
        el('div', { class: 'auth-label' }, 'Choose your program'),
        el('div', { class: 'training-muted' }, intro),
        el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(4, minmax(0, 1fr))' },
          disciplineChoices.map((opt) => {
            const isDisabled = !['bodybuilding', 'powerbuilding', 'military'].includes(opt.key);
            return el('label', {
              class: `training-choice${isDisabled ? ' is-disabled' : ''}`,
              style: isDisabled ? 'opacity:0.55; filter:grayscale(1); cursor:not-allowed;' : null,
              'aria-disabled': isDisabled ? 'true' : null
            },
            el('input', {
              type: 'radio',
              name: 'discipline',
              value: opt.key,
              checked: discipline === opt.key ? 'true' : null,
              disabled: isDisabled ? 'true' : null,
              onchange: isDisabled ? null : () => setWizard({ discipline: opt.key })
            }),
            el('div', null,
              el('div', { class: 'training-choice-title' }, opt.title),
              el('div', { class: 'training-muted', style: 'font-size:12px;' }, opt.sub),
              isDisabled ? el('div', { class: 'training-muted', style: 'font-size:11px; font-weight:700; margin-top:4px; letter-spacing:0.02em; text-transform:uppercase;' }, 'Coming soon') : null
            ));
          })
        )
      );

      /* const chooser = (() => {
        const c = state.wizard.chooser && typeof state.wizard.chooser === 'object'
          ? state.wizard.chooser
          : { goal: '', equipment: '', numbers: '' };

        const pick = (key, value) => {
          const next = { ...(state.wizard.chooser || {}), [key]: value };
          setWizardSilent({ chooser: next });

          const goal = String(next.goal || '');
          const equipment = String(next.equipment || '');
          const numbers = String(next.numbers || '');

          let rec = null;
          if (goal === 'skills') rec = 'calisthenics';
          else if (goal === 'strength') rec = 'powerlifting';
          else if (goal === 'muscle') rec = 'bodybuilding';

          if (rec !== 'calisthenics') {
            if (equipment === 'bodyweight') rec = 'calisthenics';
            else if (numbers === 'yes' && equipment === 'barbell') rec = 'powerlifting';
          }

          if (rec) setWizardSilent({ discipline: rec });
          render();
        };

        return el('div', null,
          el('div', { class: 'training-form-intro' },
            el('div', { class: 'training-section-title' }, 'Quick match'),
            el('div', { class: 'training-section-sub' }, 'Answer a few questions and we’ll pick a lane.')
          ),
          el('div', { class: 'training-grid-2' },
            el('div', null,
              el('div', { class: 'auth-label' }, 'Main goal'),
              el('select', { class: 'auth-input', oninput: (e) => pick('goal', e.target.value) },
                [
                  { v: '', t: 'Select...' },
                  { v: 'strength', t: 'Max strength (1RM)' },
                  { v: 'muscle', t: 'Build muscle / physique' },
                  { v: 'skills', t: 'Bodyweight skills / endurance' }
                ].map((o) => el('option', { value: o.v, selected: o.v === String(c.goal || '') ? 'true' : null }, o.t))
              )
            ),
            el('div', null,
              el('div', { class: 'auth-label' }, 'Equipment'),
              el('select', { class: 'auth-input', oninput: (e) => pick('equipment', e.target.value) },
                [
                  { v: '', t: 'Select...' },
                  { v: 'barbell', t: 'Gym (barbell)' },
                  { v: 'dumbbell', t: 'Dumbbells' },
                  { v: 'bodyweight', t: 'Bodyweight only' }
                ].map((o) => el('option', { value: o.v, selected: o.v === String(c.equipment || '') ? 'true' : null }, o.t))
              )
            )
          ),
          el('div', null,
            el('div', { class: 'auth-label' }, 'Do you like chasing numbers?'),
            el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' },
              [
                { key: 'yes', title: 'Yes (PRs)' },
                { key: 'no', title: 'Not really' }
              ].map((opt) =>
                el('label', { class: 'training-choice' },
                  el('input', {
                    type: 'radio',
                    name: 'numbers',
                    value: opt.key,
                    checked: String(c.numbers || '') === opt.key ? 'true' : null,
                    onchange: () => pick('numbers', opt.key)
                  }),
                  el('div', null, el('div', { class: 'training-choice-title' }, opt.title))
                )
              )
            )
          ),
          el('div', { class: 'training-divider' })
        );
      })(); */

      const nodes = [disciplinePicker];

      if (discipline === 'bodybuilding' || discipline === 'powerbuilding' || discipline === 'military') {
        const phase = state.wizard.phase || 'bulk';
        nodes.push(
          el('div', { class: 'training-divider' }),
          el('div', null,
            el('div', { class: 'auth-label' }, 'Phase'),
            el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
              [
                { key: 'bulk', title: 'Bulk' },
                { key: 'cut', title: 'Cut (Definition)' },
                { key: 'maintain', title: 'Maintain' }
              ].map((opt) =>
                el('label', { class: 'training-choice' },
                  el('input', {
                    type: 'radio',
                    name: 'phase',
                    value: opt.key,
                    checked: phase === opt.key ? 'true' : null,
                    onchange: () => setWizardSilent({ phase: opt.key })
                  }),
                  el('div', null, el('div', { class: 'training-choice-title' }, opt.title))
                )
              )
            ),
            ['bulk', 'cut'].includes(phase)
              ? el('div', { class: 'training-grid-2', style: 'margin-top:0.6rem' },
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-target-w' }, 'Target weight (lb)'),
                  el('input', { id: 'bb-target-w', class: 'auth-input', inputmode: 'decimal', value: state.wizard.targetWeightLb ?? '', oninput: (e) => setWizardSilent({ targetWeightLb: e.target.value }) })
                ),
                el('div', null)
              )
              : null
          )
        );
      }

      content.append(...nodes);

      nextBtn.addEventListener('click', async () => {
        clearError();
        const d = normalizeDiscipline(state.wizard.discipline);
        if (!requireValue(Boolean(d), 'Select a training discipline.')) return;
        if (d !== state.wizard.discipline) setWizardSilent({ discipline: d });
        const ok = await requireAuthToContinue(2);
        if (!ok) return;
        setWizard({ step: 2 });
      });
    }

      if (step === 2) {
        const d = state.wizard.discipline;
        if (!d) {
          setWizard({ step: 1 });
          return shell;
        }

        const s = state.wizard.strength || {};
        const weightOptions = (min = 45, max = 500, step = 5) =>
          Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => String(min + i * step));
        const repsOptions = (min = 1, max = 20) =>
          Array.from({ length: max - min + 1 }, (_, i) => String(min + i));

        if (d === 'powerlifting') {
        const eventType = String(s.eventType || 'full_power');
        content.append(
          el('div', null,
            el('div', { class: 'training-muted' }, 'Enter your best lifts (lb) and when you last performed them.'),
            (() => {
              ensurePullAnchorOptionsLoaded();
              const pullMovement = String(s.pullMovement || '');
              const pullExerciseId = String(s.pullExerciseId || '');
              const options = pullAnchorOptions.length
                ? pullAnchorOptions
                : [
                  { id: 'pulldown', name: 'Lat Pulldown' },
                  { id: 'pullup', name: 'Pull-up' },
                  { id: 'chinup', name: 'Chin-up' }
                ];
              return el('div', null,
                el('div', { class: 'training-divider' }),
                el('div', { class: 'auth-label' }, 'Lat pulldown or pull-up variation (anchor)'),
                el('div', { class: 'training-grid-3' },
                  el('div', null,
                    el('label', { class: 'auth-label', for: 'bb-pull-move' }, 'Movement'),
                    el('select', {
                      id: 'bb-pull-move',
                      class: 'auth-input',
                      oninput: (e) => {
                        const id = String(e.target.value || '');
                        const name = options.find((o) => o.id === id)?.name || '';
                        updateStrength({ pullMovement: name, pullExerciseId: id });
                      }
                    },
                    [
                      { id: '', name: catalogLoading ? 'Loading...' : 'Select...' },
                      ...options
                    ].map((opt) => el('option', { value: opt.id, selected: String(pullExerciseId || pullMovement) === String(opt.id) ? 'true' : null }, opt.name))
                    )
                  ),
                  el('div', null,
                    el('label', { class: 'auth-label', for: 'bb-pull-w' }, 'Weight (lb)'),
                    el('input', { id: 'bb-pull-w', class: 'auth-input', inputmode: 'decimal', value: s.pullWeight ?? '', oninput: (e) => updateStrength({ pullWeight: e.target.value }) })
                  ),
                  el('div', null,
                    el('label', { class: 'auth-label', for: 'bb-pull-r' }, 'Reps'),
                    el('input', { id: 'bb-pull-r', class: 'auth-input', inputmode: 'numeric', value: s.pullReps ?? '', oninput: (e) => updateStrength({ pullReps: e.target.value }) })
                  )
                )
              );
            })(),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'Event type'),
              el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' },
                [
                  { key: 'full_power', title: 'Full Power', sub: 'Squat / Bench / Deadlift' },
                  { key: 'bench_only', title: 'Bench Only', sub: 'Bench priority' }
                ].map((opt) =>
                  el('label', { class: 'training-choice' },
                    el('input', {
                      type: 'radio',
                      name: 'pl-event',
                      value: opt.key,
                      checked: eventType === opt.key ? 'true' : null,
                      onchange: () => updateStrength({ eventType: opt.key })
                    }),
                    el('div', null,
                      el('div', { class: 'training-choice-title' }, opt.title),
                      el('div', { class: 'training-muted', style: 'font-size:12px;' }, opt.sub)
                    )
                  )
                )
              )
            ),
            el('div', { class: 'training-grid-2' },
              el('div', null,
                el('label', { class: 'auth-label', for: 'pl-squat' }, 'Best squat (lb)'),
                el('input', { id: 'pl-squat', class: 'auth-input', inputmode: 'decimal', value: s.squat ?? '', oninput: (e) => updateStrength({ squat: e.target.value }) })
              ),
              el('div', null,
                el('label', { class: 'auth-label', for: 'pl-squat-date' }, 'Date last performed'),
                el('input', { id: 'pl-squat-date', class: 'auth-input', type: 'date', value: s.squatDate ?? '', oninput: (e) => updateStrength({ squatDate: e.target.value }) })
              )
            ),
            el('div', { class: 'training-grid-2' },
              el('div', null,
                el('label', { class: 'auth-label', for: 'pl-bench' }, 'Best bench (lb)'),
                el('input', { id: 'pl-bench', class: 'auth-input', inputmode: 'decimal', value: s.bench ?? '', oninput: (e) => updateStrength({ bench: e.target.value }) })
              ),
              el('div', null,
                el('label', { class: 'auth-label', for: 'pl-bench-date' }, 'Date last performed'),
                el('input', { id: 'pl-bench-date', class: 'auth-input', type: 'date', value: s.benchDate ?? '', oninput: (e) => updateStrength({ benchDate: e.target.value }) })
              )
            ),
            el('div', { class: 'training-grid-2' },
              el('div', null,
                el('label', { class: 'auth-label', for: 'pl-deadlift' }, 'Best deadlift (lb)'),
                el('input', { id: 'pl-deadlift', class: 'auth-input', inputmode: 'decimal', value: s.deadlift ?? '', oninput: (e) => updateStrength({ deadlift: e.target.value }) })
              ),
              el('div', null,
                el('label', { class: 'auth-label', for: 'pl-deadlift-date' }, 'Date last performed'),
                el('input', { id: 'pl-deadlift-date', class: 'auth-input', type: 'date', value: s.deadliftDate ?? '', oninput: (e) => updateStrength({ deadliftDate: e.target.value }) })
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', { class: 'auth-label' }, 'Bodyweight'),
            el('div', { class: 'training-grid-2' },
              el('div', null,
                el('label', { class: 'auth-label', for: 'pl-bw' }, 'Current bodyweight (lb)'),
                el('input', { id: 'pl-bw', class: 'auth-input', inputmode: 'decimal', value: s.bodyweight ?? '', oninput: (e) => updateStrength({ bodyweight: e.target.value }) })
              ),
              el('div', null,
                el('label', { class: 'auth-label', for: 'pl-goal-bw' }, 'Goal bodyweight (lb)'),
                el('input', { id: 'pl-goal-bw', class: 'auth-input', inputmode: 'decimal', value: s.goalBodyweight ?? '', oninput: (e) => updateStrength({ goalBodyweight: e.target.value }) })
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('label', { class: 'auth-label', for: 'pl-meet-date' }, 'Meet date (optional)'),
              el('input', { id: 'pl-meet-date', class: 'auth-input', type: 'date', value: s.meetDate ?? '', oninput: (e) => updateStrength({ meetDate: e.target.value }) })
            )
          ),
          experiencePicker()
        );
      }

        if (d === 'bodybuilding' || d === 'powerbuilding' || d === 'military') {
          const useWizardV2 = true;
          if (useWizardV2) {
            const pressMovement = String(s.pressMovement || 'Bench Press');
          const readInjury = () => {
              const raw = state.wizard.injury && typeof state.wizard.injury === 'object' ? state.wizard.injury : null;
              return {
                has: Boolean(raw?.has),
              joints: Array.isArray(raw?.joints) ? raw.joints.map((j) => String(j || '').trim()).filter(Boolean) : [],
              note: String(raw?.note || ''),
              severityByJoint: raw?.severityByJoint && typeof raw.severityByJoint === 'object' ? raw.severityByJoint : {}
            };
          };

          const injury = readInjury();
          const joints = [
            { key: 'shoulder', label: 'Shoulder' },
            { key: 'elbow', label: 'Elbow' },
            { key: 'wrist', label: 'Wrist' },
            { key: 'back', label: 'Lower back' },
            { key: 'hip', label: 'Hip' },
            { key: 'knee', label: 'Knee' },
            { key: 'ankle', label: 'Ankle' }
          ];
          const selectedJoints = new Set(injury.joints);

          const setInjury = (patch, { renderNow = true } = {}) => {
            const cur = readInjury();
            const next = { ...cur, ...(patch && typeof patch === 'object' ? patch : {}) };
            if (!next.has) {
              next.joints = [];
              next.note = '';
              next.severityByJoint = {};
            }
            setWizardSilent({ injury: next });
            if (renderNow) render();
          };

          const toggleJoint = (key, checked) => {
            const cur = readInjury();
            const nextJoints = new Set(cur.joints);
            if (checked) nextJoints.add(key);
            else nextJoints.delete(key);
            const nextSeverity = { ...(cur.severityByJoint || {}) };
            if (checked && !Number.isFinite(Number(nextSeverity[key]))) nextSeverity[key] = 5;
            if (!checked) delete nextSeverity[key];
            setInjury({ has: true, joints: Array.from(nextJoints), severityByJoint: nextSeverity });
          };

          const lowerMovement = String(s.lowerMovement || 'squat');
          const hingeMovement = String(s.hingeMovement || 'deadlift');

          content.append(
            el('div', { class: 'training-form-intro' },
              el('div', { class: 'training-section-title' }, 'Strength + recovery inputs'),
              el('div', { class: 'training-section-sub' }, 'We use your working sets to estimate starting strength and set projected loads.')
            ),
            el('div', { class: 'training-grid-2' },
              el('div', null,
                el('label', { class: 'auth-label', for: 'bb-bw' }, 'Bodyweight (lb)'),
                el('input', { id: 'bb-bw', class: 'auth-input', inputmode: 'decimal', value: s.bodyweight ?? '', oninput: (e) => updateStrength({ bodyweight: e.target.value }) })
              ),
              el('div', null,
                el('label', { class: 'auth-label', for: 'bb-height' }, 'Height (inches)'),
                el('input', { id: 'bb-height', class: 'auth-input', inputmode: 'numeric', value: s.height ?? '', oninput: (e) => updateStrength({ height: e.target.value }) })
              )
              ),
              el('div', { class: 'training-divider' }),
              el('div', { class: 'auth-label' }, 'Latest working sets (not maxes)'),
              el('div', { class: 'training-grid-3' },
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-press-move' }, 'Bench variation'),
                  el('select', { id: 'bb-press-move', class: 'auth-input', oninput: (e) => updateStrength({ pressMovement: e.target.value }) },
                    [
                      'Bench Press',
                      'Incline Bench Press'
                    ].map((opt) => el('option', { value: opt, selected: opt === pressMovement ? 'true' : null }, opt))
                  )
                ),
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-bench-w' }, 'Weight (lb)'),
                  el('select', { id: 'bb-bench-w', class: 'auth-input', oninput: (e) => updateStrength({ benchWeight: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...weightOptions()].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.benchWeight ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                ),
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-bench-r' }, 'Reps'),
                  el('select', { id: 'bb-bench-r', class: 'auth-input', oninput: (e) => updateStrength({ benchReps: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...repsOptions(1, 20)].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.benchReps ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                )
              ),
              el('div', { class: 'training-grid-3' },
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-lower-move' }, 'Squat or Leg Press'),
                  el('select', { id: 'bb-lower-move', class: 'auth-input', oninput: (e) => updateStrength({ lowerMovement: e.target.value }) },
                    [
                      { key: 'squat', label: 'Squat' },
                      { key: 'leg_press', label: 'Leg Press' }
                    ].map((opt) => el('option', { value: opt.key, selected: opt.key === lowerMovement ? 'true' : null }, opt.label))
                  )
                ),
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-lower-w' }, 'Weight (lb)'),
                  el('select', { id: 'bb-lower-w', class: 'auth-input', oninput: (e) => updateStrength({ lowerWeight: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...weightOptions(45, 700, 10)].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.lowerWeight ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                ),
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-lower-r' }, 'Reps'),
                  el('select', { id: 'bb-lower-r', class: 'auth-input', oninput: (e) => updateStrength({ lowerReps: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...repsOptions(1, 20)].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.lowerReps ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                )
              ),
              el('div', { class: 'training-grid-3' },
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-hinge-move' }, 'Deadlift or RDL'),
                  el('select', { id: 'bb-hinge-move', class: 'auth-input', oninput: (e) => updateStrength({ hingeMovement: e.target.value }) },
                    [
                      { key: 'deadlift', label: 'Deadlift' },
                      { key: 'rdl', label: 'RDL' }
                    ].map((opt) => el('option', { value: opt.key, selected: opt.key === hingeMovement ? 'true' : null }, opt.label))
                  )
                ),
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-hinge-w' }, 'Weight (lb)'),
                  el('select', { id: 'bb-hinge-w', class: 'auth-input', oninput: (e) => updateStrength({ hingeWeight: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...weightOptions(45, 700, 10)].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.hingeWeight ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                ),
                el('div', null,
                  el('label', { class: 'auth-label', for: 'bb-hinge-r' }, 'Reps'),
                  el('select', { id: 'bb-hinge-r', class: 'auth-input', oninput: (e) => updateStrength({ hingeReps: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...repsOptions(1, 20)].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.hingeReps ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                )
              ),
            el('div', { class: 'training-divider' }),
            el('div', { class: 'training-form-section' },
              el('div', { class: 'training-section-head' },
                el('div', null,
                  el('div', { class: 'training-section-title' }, 'Injuries / joint pain'),
                  el('div', { class: 'training-section-sub' }, 'Optional, but helps us adjust exercises and volume.')
                )
              ),
              el('label', { class: 'training-badge', style: injury.has ? 'border-color: rgba(197, 141, 79, 0.55); color: var(--ink);' : null },
                el('input', {
                  type: 'checkbox',
                  checked: injury.has ? 'true' : null,
                  onchange: (e) => setInjury({ has: e.target.checked })
                }),
                'I have pain / injuries'
              ),
              injury.has
                ? el('div', { class: 'training-badge-grid', role: 'group', 'aria-label': 'Select joints' },
                  joints.map((j) =>
                    el('label', { class: 'training-badge' },
                      el('input', { type: 'checkbox', checked: selectedJoints.has(j.key) ? 'true' : null, onchange: (e) => toggleJoint(j.key, e.target.checked) }),
                      j.label
                    )
                  )
                )
                : null,
              injury.has && selectedJoints.size
                ? el('div', { class: 'training-grid-2', style: 'margin-top:0.6rem' },
                  Array.from(selectedJoints).map((key) => {
                    const label = joints.find((j) => j.key === key)?.label || key;
                    return el('div', null,
                      el('label', { class: 'auth-label' }, `${label} severity (1-10)`),
                      el('input', {
                        class: 'auth-input',
                        inputmode: 'numeric',
                        value: injury.severityByJoint?.[key] ?? '',
                        oninput: (e) => {
                          const next = { ...(injury.severityByJoint || {}) };
                          next[key] = e.target.value;
                          setInjury({ severityByJoint: next }, { renderNow: false });
                        }
                      })
                    );
                  })
                )
                : null,
              injury.has || selectedJoints.size
                ? el('div', { class: 'training-subcard training-injury-note' },
                  el('div', { style: 'font-weight:850; margin-bottom: 0.25rem' }, 'Briefly explain (1-2 lines)'),
                  el('div', { class: 'training-muted', style: 'margin-bottom: 0.55rem' }, 'Example: \"Right shoulder pinches on presses; avoid overhead work.\"'),
                  el('textarea', {
                    class: 'auth-input',
                    rows: '3',
                    placeholder: 'What hurts and what movements to avoid?',
                    value: injury.note || '',
                    oninput: (e) => setInjury({ note: e.target.value }, { renderNow: false })
                  })
                )
                : null
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'How long can you train per workout?'),
              el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' },
                [
                  { key: '30_45', title: '30–45 min' },
                  { key: '45_60', title: '45–60 min' },
                  { key: '60_75', title: '60–75 min' },
                  { key: '75_90_plus', title: '75–90+ min' }
                ].map((opt) =>
                  el('label', { class: 'training-choice' },
                    el('input', {
                      type: 'radio',
                      name: 'time_per_session',
                      value: opt.key,
                      checked: state.wizard.timePerSession === opt.key ? 'true' : null,
                      onchange: () => setWizardSilent({ timePerSession: opt.key })
                    }),
                    el('div', null, el('div', { class: 'training-choice-title' }, opt.title))
                  )
                )
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'How long have you trained consistently?'),
              el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' },
                [
                  { key: '0_6', title: '0–6 months' },
                  { key: '6_18', title: '6–18 months' },
                  { key: '18_36', title: '18–36 months' },
                  { key: '3_5', title: '3–5 years' },
                  { key: '5_plus', title: '5+ years' }
                ].map((opt) =>
                  el('label', { class: 'training-choice' },
                    el('input', {
                      type: 'radio',
                      name: 'training_age',
                      value: opt.key,
                      checked: state.wizard.trainingAgeBucket === opt.key ? 'true' : null,
                      onchange: () => setWizardSilent({ trainingAgeBucket: opt.key })
                    }),
                    el('div', null, el('div', { class: 'training-choice-title' }, opt.title))
                  )
                )
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'What do you want to grow most right now? (pick up to 3)'),
              el('div', { class: 'training-row', style: 'justify-content:flex-start; flex-wrap:wrap' },
                [
                  { key: 'chest', label: 'Chest' },
                  { key: 'back', label: 'Back' },
                  { key: 'shoulders', label: 'Shoulders' },
                  { key: 'arms', label: 'Arms' },
                  { key: 'quads', label: 'Quads' },
                  { key: 'hamstrings_glutes', label: 'Hamstrings/Glutes' },
                  { key: 'calves', label: 'Calves' },
                  { key: 'abs', label: 'Abs' }
                ].map((opt) =>
                  el('label', { class: 'training-badge' },
                    el('input', {
                      type: 'checkbox',
                      checked: state.wizard.emphasis.includes(opt.key) ? 'true' : null,
                      onchange: (e) => {
                        const next = new Set(state.wizard.emphasis || []);
                        if (e.target.checked) next.add(opt.key);
                        else next.delete(opt.key);
                        const out = Array.from(next);
                        if (out.length > 3) out.pop();
                        setWizardSilent({ emphasis: out });
                      }
                    }),
                    opt.label
                  )
                )
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'Preferred equipment style for main lifts (optional)'),
              el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' },
                [
                  { key: 'barbell', title: 'Barbell-focused' },
                  { key: 'dumbbell', title: 'Dumbbell-focused' },
                  { key: 'machine', title: 'Machine-focused' },
                  { key: 'mix', title: 'Mix' }
                ].map((opt) =>
                  el('label', { class: 'training-choice' },
                    el('input', {
                      type: 'radio',
                      name: 'equip_pref',
                      value: opt.key,
                      checked: state.wizard.equipmentStylePref === opt.key ? 'true' : null,
                      onchange: () => setWizardSilent({ equipmentStylePref: opt.key })
                    }),
                    el('div', null, el('div', { class: 'training-choice-title' }, opt.title))
                  )
                )
              )
            ),
            experiencePicker()
          );
        } else {
        const movementOptions = {
          press: [
            'Bench Press',
            'Incline Bench Press',
            'Overhead Press',
            'Dumbbell Bench Press',
            'Machine Chest Press'
          ],
          pull: [
            'Weighted Pull-up',
            'Lat Pulldown',
            'Barbell Row',
            'Chest-Supported Row',
            'Seated Cable Row'
          ],
          leg: [
            'Back Squat',
            'Front Squat',
            'Leg Press',
            'Hack Squat',
            'Bulgarian Split Squat'
          ]
        };

        if (!state.wizard.bbDefaultsSet) {
          const pressMovement = String(s.pressMovement || movementOptions.press[0]);
          const pullMovement = String(s.pullMovement || movementOptions.pull[0]);
          const legMovement = String(s.legMovement || movementOptions.leg[0]);
          setWizard({ strength: { ...s, pressMovement, pullMovement, legMovement }, bbDefaultsSet: true });
          return shell;
        }

        const pressMovement = String((state.wizard.strength || {}).pressMovement || movementOptions.press[0]);
        const pullMovement = String((state.wizard.strength || {}).pullMovement || movementOptions.pull[0]);
        const legMovement = String((state.wizard.strength || {}).legMovement || movementOptions.leg[0]);

        const movementBlock = ({ title, subtitle, selectId, selectValue, selectOptions, onSelect, weightId, repsId, dateId, weightValue, repsValue, dateValue, onWeight, onReps, onDate }) =>
          el('div', { class: 'training-form-section' },
            el('div', { class: 'training-section-head' },
              el('div', null,
                el('div', { class: 'training-section-title' }, title),
                subtitle ? el('div', { class: 'training-section-sub' }, subtitle) : null
              )
            ),
            el('div', { class: 'training-field-grid' },
              el('div', { class: 'training-field span-12' },
                el('label', { class: 'auth-label', for: selectId }, `${title} movement`),
                el('select', { id: selectId, class: 'auth-input', oninput: onSelect },
                  selectOptions.map((name) => el('option', { value: name, selected: name === selectValue ? 'true' : null }, name))
                )
              ),
              el('div', { class: 'training-field span-4' },
                el('label', { class: 'auth-label', for: weightId }, 'Weight (lb)'),
                el('input', { id: weightId, class: 'auth-input', inputmode: 'decimal', value: weightValue ?? '', oninput: onWeight })
              ),
              el('div', { class: 'training-field span-4' },
                el('label', { class: 'auth-label', for: repsId }, 'Reps'),
                el('input', { id: repsId, class: 'auth-input', inputmode: 'numeric', value: repsValue ?? '', oninput: onReps })
              ),
              el('div', { class: 'training-field span-4' },
                el('label', { class: 'auth-label', for: dateId }, 'Last performed'),
                el('input', { id: dateId, class: 'auth-input', type: 'date', value: dateValue ?? '', oninput: onDate })
              )
            )
          );

        content.append(
          el('div', { class: 'training-form-intro' },
            el('div', { class: 'training-section-title' }, 'Strength estimates'),
            el('div', { class: 'training-section-sub' }, 'Pick movements you can repeat. This is used to set starting loads.'),
            el('div', { class: 'training-field-grid' },
                el('div', { class: 'training-field span-6' },
                  el('label', { class: 'auth-label', for: 'bb-bw' }, 'Current bodyweight (lb)'),
                  el('input', { id: 'bb-bw', class: 'auth-input', inputmode: 'decimal', value: s.bodyweight ?? '', oninput: (e) => updateStrength({ bodyweight: e.target.value }) })
                ),
                el('div', { class: 'training-field span-6' },
                  el('label', { class: 'auth-label', for: 'bb-bf' }, 'Estimated body fat (optional %)'),
                  el('input', { id: 'bb-bf', class: 'auth-input', inputmode: 'decimal', value: s.bodyfat ?? '', oninput: (e) => updateStrength({ bodyfat: e.target.value }) })
                )
              )
            ),
            movementBlock({
            title: 'Pressing',
            subtitle: 'Choose something stable (machine is fine).',
            selectId: 'bb-press-move',
            selectValue: pressMovement,
            selectOptions: movementOptions.press,
              onSelect: (e) => updateStrength({ pressMovement: e.target.value }),
            weightId: 'bb-press-w',
            repsId: 'bb-press-r',
            dateId: 'bb-press-date',
            weightValue: s.pressWeight,
            repsValue: s.pressReps,
            dateValue: s.pressDate,
              onWeight: (e) => updateStrength({ pressWeight: e.target.value }),
              onReps: (e) => updateStrength({ pressReps: e.target.value }),
              onDate: (e) => updateStrength({ pressDate: e.target.value })
            }),
            movementBlock({
            title: 'Pulling',
            subtitle: 'Use the same setup each time if possible.',
            selectId: 'bb-pull-move',
            selectValue: pullMovement,
            selectOptions: movementOptions.pull,
              onSelect: (e) => updateStrength({ pullMovement: e.target.value }),
            weightId: 'bb-pull-w',
            repsId: 'bb-pull-r',
            dateId: 'bb-pull-date',
            weightValue: s.pullWeight,
            repsValue: s.pullReps,
            dateValue: s.pullDate,
              onWeight: (e) => updateStrength({ pullWeight: e.target.value }),
              onReps: (e) => updateStrength({ pullReps: e.target.value }),
              onDate: (e) => updateStrength({ pullDate: e.target.value })
            }),
            movementBlock({
            title: 'Legs',
            subtitle: 'If you don’t back squat, choose leg press or hack squat.',
            selectId: 'bb-leg-move',
            selectValue: legMovement,
            selectOptions: movementOptions.leg,
              onSelect: (e) => updateStrength({ legMovement: e.target.value }),
            weightId: 'bb-leg-w',
            repsId: 'bb-leg-r',
            dateId: 'bb-leg-date',
            weightValue: s.legWeight,
            repsValue: s.legReps,
            dateValue: s.legDate,
              onWeight: (e) => updateStrength({ legWeight: e.target.value }),
              onReps: (e) => updateStrength({ legReps: e.target.value }),
              onDate: (e) => updateStrength({ legDate: e.target.value })
            }),
            experiencePicker()
          );
        }
      }

      if (d === 'calisthenics') {
        const listToggle = (field, key, checked) => {
          const cur = state.wizard?.strength && typeof state.wizard.strength === 'object' ? state.wizard.strength : {};
          const list = Array.isArray(cur[field]) ? cur[field].map((x) => String(x || '').trim()).filter(Boolean) : [];
          const set = new Set(list);
          if (checked) set.add(key);
          else set.delete(key);
          updateStrength({ [field]: Array.from(set) });
        };

        const equipToggle = (key, checked) => {
          const cur = state.wizard?.strength && typeof state.wizard.strength === 'object' ? state.wizard.strength : {};
          const eq = cur.equipment && typeof cur.equipment === 'object' ? cur.equipment : {};
          const next = { ...eq, [key]: Boolean(checked) };
          if (key === 'none' && checked) {
            next.bar = false;
            next.rings = false;
            next.bands = false;
            next.weights = false;
          } else if (key !== 'none' && checked) {
            next.none = false;
          }
          if (!Object.values(next).some(Boolean)) next.none = true;
          updateStrength({ equipment: next });
        };

        const curGoals = Array.isArray(s.goals) ? s.goals : [];
        const curPreferred = Array.isArray(s.preferredSkills) ? s.preferredSkills : [];
        const curEquip = s.equipment && typeof s.equipment === 'object' ? s.equipment : { none: true };

        content.append(
          el('div', null,
            el('div', { class: 'training-muted' }, 'Benchmarks + preferences. If you can’t do 5 reps or hold 3 seconds, we auto-regress the movement.'),
              el('div', { class: 'training-grid-2' },
                el('div', null,
                  el('label', { class: 'auth-label', for: 'cal-push' }, 'Max pushups'),
                  el('select', { id: 'cal-push', class: 'auth-input', oninput: (e) => updateStrength({ pushups: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...repsOptions(0, 30)].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.pushups ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                ),
                el('div', null,
                  el('label', { class: 'auth-label', for: 'cal-pull' }, 'Max pullups'),
                  el('select', { id: 'cal-pull', class: 'auth-input', oninput: (e) => updateStrength({ pullups: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...repsOptions(0, 25)].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.pullups ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                )
              ),
              el('div', { class: 'training-grid-2' },
                el('div', null,
                  el('label', { class: 'auth-label', for: 'cal-dips' }, 'Max dips'),
                  el('select', { id: 'cal-dips', class: 'auth-input', oninput: (e) => updateStrength({ dips: e.target.value }) },
                    [{ label: 'Select...', value: '' }, ...repsOptions(0, 25)].map((opt) =>
                      el('option', { value: opt.value ?? opt, selected: String(s.dips ?? '') === String(opt.value ?? opt) ? 'true' : null }, opt.label ?? opt)
                    )
                  )
                ),
              el('div', null,
                el('label', { class: 'auth-label' }, 'Soreness / fatigue'),
                el('select', { class: 'auth-input', oninput: (e) => updateStrength({ fatigue: e.target.value }) },
                  [
                    { v: '', t: 'Select...' },
                    { v: 'low', t: 'Low (fresh)' },
                    { v: 'medium', t: 'Medium (normal)' },
                    { v: 'high', t: 'High (beat up)' }
                  ].map((o) => el('option', { value: o.v, selected: String(s.fatigue || '') === o.v ? 'true' : null }, o.t))
                )
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'Goals (pick one or more)'),
              el('div', { class: 'training-row', style: 'justify-content: flex-start; flex-wrap: wrap' },
                [
                  { key: 'strength', label: 'Strength' },
                  { key: 'hypertrophy', label: 'Hypertrophy' },
                  { key: 'endurance', label: 'Endurance' },
                  { key: 'skill', label: 'Skill' }
                ].map((opt) =>
                  el('label', { class: 'training-badge' },
                    el('input', { type: 'checkbox', checked: curGoals.includes(opt.key) ? 'true' : null, onchange: (e) => listToggle('goals', opt.key, e.target.checked) }),
                    opt.label
                  )
                )
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'Equipment available'),
              el('div', { class: 'training-row', style: 'justify-content: flex-start; flex-wrap: wrap' },
                [
                  { key: 'bar', label: 'Pull-up bar' },
                  { key: 'rings', label: 'Rings' },
                  { key: 'bands', label: 'Bands' },
                  { key: 'weights', label: 'Weights' },
                  { key: 'none', label: 'None' }
                ].map((opt) =>
                  el('label', { class: 'training-badge' },
                    el('input', { type: 'checkbox', checked: Boolean(curEquip?.[opt.key]) ? 'true' : null, onchange: (e) => equipToggle(opt.key, e.target.checked) }),
                    opt.label
                  )
                )
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'Static holds (seconds)'),
              el('div', { class: 'training-grid-2' },
                el('div', null,
                  el('label', { class: 'auth-label', for: 'cal-hollow' }, 'Hollow hold'),
                  el('input', { id: 'cal-hollow', class: 'auth-input', inputmode: 'numeric', value: s.hollowHoldSec ?? '', oninput: (e) => updateStrength({ hollowHoldSec: e.target.value }) })
                ),
                el('div', null,
                  el('label', { class: 'auth-label', for: 'cal-support' }, 'Support hold (top of dip)'),
                  el('input', { id: 'cal-support', class: 'auth-input', inputmode: 'numeric', value: s.supportHoldSec ?? '', oninput: (e) => updateStrength({ supportHoldSec: e.target.value }) })
                )
              ),
              el('div', { class: 'training-grid-2' },
                el('div', null,
                  el('label', { class: 'auth-label', for: 'cal-hs' }, 'Handstand hold'),
                  el('input', { id: 'cal-hs', class: 'auth-input', inputmode: 'numeric', value: s.handstandHoldSec ?? '', oninput: (e) => updateStrength({ handstandHoldSec: e.target.value }) })
                ),
                el('div', null)
              )
            ),
            el('div', { class: 'training-divider' }),
            el('div', null,
              el('div', { class: 'auth-label' }, 'Preferred skills (optional)'),
              el('div', { class: 'training-row', style: 'justify-content: flex-start; flex-wrap: wrap' },
                [
                  { key: 'handstand', label: 'Handstand' },
                  { key: 'muscle_up', label: 'Muscle-up' },
                  { key: 'l_sit', label: 'L-sit' },
                  { key: 'front_lever', label: 'Front lever' }
                ].map((opt) =>
                  el('label', { class: 'training-badge' },
                    el('input', { type: 'checkbox', checked: curPreferred.includes(opt.key) ? 'true' : null, onchange: (e) => listToggle('preferredSkills', opt.key, e.target.checked) }),
                    opt.label
                  )
                )
              )
            )
          ),
          experiencePicker()
        );
      }

      nextBtn.addEventListener('click', () => {
        clearError();
        const latestStrength = state.wizard.strength || {};
        if (d === 'powerlifting') {
          const ev = String(latestStrength.eventType || 'full_power').trim();
          const ok = Number(latestStrength.squat) > 0
            && Number(latestStrength.bench) > 0
            && Number(latestStrength.deadlift) > 0
            && Number(latestStrength.bodyweight) > 0
            && Number(latestStrength.goalBodyweight) > 0
            && ['full_power', 'bench_only'].includes(ev);
          if (!requireValue(ok, 'Enter squat, bench, deadlift, current bodyweight, goal bodyweight, and event type.')) return;
        }
        if (d === 'bodybuilding' || d === 'powerbuilding' || d === 'military') {
          const ok = Number(latestStrength.bodyweight) > 0
            && Number(latestStrength.height) > 0
            && Number(latestStrength.benchWeight) > 0 && Number(latestStrength.benchReps) > 0
            && Number(latestStrength.lowerWeight) > 0 && Number(latestStrength.lowerReps) > 0
            && Number(latestStrength.hingeWeight) > 0 && Number(latestStrength.hingeReps) > 0;
          if (!requireValue(ok, 'Enter bodyweight, height, and your latest working sets.')) return;
          if (!requireValue(Boolean(state.wizard.timePerSession), 'Select training time per session.')) return;
          if (!requireValue(Boolean(state.wizard.trainingAgeBucket), 'Select training age.')) return;
          if (!requireValue(Boolean(state.wizard.phase), 'Select phase.')) return;
          if (['bulk', 'cut'].includes(String(state.wizard.phase || '').toLowerCase())) {
            const target = Number(state.wizard.targetWeightLb);
            if (!requireValue(Number.isFinite(target) && target > 0, 'Enter target weight.')) return;
          }
          const injury = state.wizard.injury || {};
          if (injury?.has && Array.isArray(injury?.joints)) {
            const severity = injury.severityByJoint || {};
            for (const j of injury.joints) {
              const v = Number(severity?.[j]);
              if (!requireValue(Number.isFinite(v) && v >= 1 && v <= 10, 'Enter injury severity for each selected joint.')) return;
            }
          }
        }
        if (d === 'calisthenics') {
          const ok = String(latestStrength.pushups ?? '').trim() !== ''
            && String(latestStrength.pullups ?? '').trim() !== ''
            && String(latestStrength.dips ?? '').trim() !== '';
          if (!requireValue(ok, 'Enter pushups, pullups, and dips.')) return;
        }
        setWizard({ step: 3 });
      });
    }

    if (step === 3) {
      const current = state.wizard.daysPerWeek;
      const unavailable = normalizeWeekdayIndexList(state.wizard.unavailableDays);
      const equip = state.wizard.equipmentAccess && typeof state.wizard.equipmentAccess === 'object'
        ? state.wizard.equipmentAccess
        : { bodyweight: true, dumbbell: false, barbell: false, cable: false, machine: false };

      const toggleUnavailable = (dayIdx, checked) => {
        const i = Math.max(0, Math.min(6, Math.floor(Number(dayIdx) || 0)));
        const next = new Set(unavailable);
        if (checked) next.add(i);
        else next.delete(i);
        const out = Array.from(next).sort((a, b) => a - b);
        setWizardSilent({ unavailableDays: out });
        try {
          localStorage.setItem(UNAVAIL_DAYS_KEY, JSON.stringify(out));
        } catch {
          // ignore
        }
      };

      const toggleEquip = (key, checked) => {
        const next = { ...equip, [key]: Boolean(checked) };
        // Always keep at least bodyweight available (sane default).
        if (!Object.values(next).some(Boolean)) next.bodyweight = true;
        setWizardSilent({ equipmentAccess: next });
      };

      content.append(
        el('div', null,
          el('div', { class: 'auth-label' }, 'How many days per week do you want to train?'),
          el('div', {
            class: 'training-choice-grid',
            style: `grid-template-columns: repeat(${(state.wizard.experience || 'beginner') === 'beginner' ? 2 : 3}, minmax(0, 1fr))`
          },
          ((state.wizard.experience || 'beginner') === 'beginner' ? [3, 4] : [4, 5, 6]).map((n) =>
              el('label', { class: 'training-choice', style: 'align-items:center' },
                el('input', {
                  type: 'radio',
                  name: 'days',
                  value: String(n),
                  checked: current === n ? 'true' : null,
                  onchange: () => setWizardSilent({ daysPerWeek: n })
                }),
                el('div', null, el('div', { class: 'training-choice-title' }, `${n} days`))
              )
            )
          )
        ),
        el('div', { class: 'training-divider' }),
        el('div', null,
          el('div', { class: 'auth-label' }, 'What equipment do you have access to?'),
          el('div', { class: 'training-muted' }, 'This helps us pick exercises you can actually do.'),
          el('div', { class: 'training-row', style: 'justify-content: flex-start; flex-wrap: wrap' },
            [
              { key: 'bodyweight', label: 'Bodyweight' },
              { key: 'dumbbell', label: 'Dumbbells' },
              { key: 'barbell', label: 'Barbell' },
              { key: 'cable', label: 'Cable' },
              { key: 'machine', label: 'Machines' }
            ].map((opt) =>
              el('label', { class: 'training-badge' },
                el('input', {
                  type: 'checkbox',
                  checked: equip?.[opt.key] ? 'true' : null,
                  onchange: (e) => toggleEquip(opt.key, e.target.checked)
                }),
                opt.label
              )
            )
          )
        ),
        el('div', { class: 'training-divider' }),
        el('div', null,
          el('div', { class: 'auth-label' }, "What days can't you train?"),
          el('div', { class: 'training-muted' }, "We'll schedule your workouts on the days you can."),
          el('div', { class: 'training-row', style: 'justify-content: flex-start; flex-wrap: wrap' },
            WEEKDAYS_SHORT.map((label, idx) =>
              el('label', { class: 'training-badge' },
                el('input', {
                  type: 'checkbox',
                  checked: unavailable.includes(idx) ? 'true' : null,
                  onchange: (e) => toggleUnavailable(idx, e.target.checked)
                }),
                label
              )
            )
          )
        )
      );

      nextBtn.addEventListener('click', () => {
        clearError();
        if (!requireValue(Number.isFinite(state.wizard.daysPerWeek), 'Select days per week.')) return;
        const eq = state.wizard.equipmentAccess || {};
        const okEq = eq && typeof eq === 'object' && Object.values(eq).some(Boolean);
        if (!requireValue(okEq, 'Select at least one equipment option.')) return;
        const daysPerWeek = Number(state.wizard.daysPerWeek) || 0;
        const unavail = normalizeWeekdayIndexList(state.wizard.unavailableDays);
        const availableCount = 7 - unavail.length;
        if (!requireValue(availableCount >= daysPerWeek, `You selected ${unavail.length} no-training days. Only ${availableCount} days are available.`)) return;
        setWizard({ step: 4 });
      });
    }

    if (step === 4) {
      const hint = el('div', { class: 'training-muted' }, 'Profile picture (optional). Used for your training portal and logs.');

      const uploadInput = el('input', { id: 'tp-photo-upload', type: 'file', accept: 'image/*' });
      const cameraInput = el('input', { id: 'tp-photo-camera', type: 'file', accept: 'image/*', capture: 'user' });
      [uploadInput, cameraInput].forEach((inp) => {
        inp.style.position = 'absolute';
        inp.style.left = '-9999px';
        inp.style.width = '1px';
        inp.style.height = '1px';
        inp.style.opacity = '0';
      });

      const existingPhoto = getActivePhotoDataUrl();
      const circle = el('div', { class: 'training-photo-circle' },
        el('img', { src: existingPhoto || PROFILE_PLACEHOLDER, alt: 'Profile photo', class: 'training-photo-placeholder' })
      );

      const title = el('div', { class: 'training-photo-title' }, 'Add a photo');
      const sub = el('div', { class: 'training-photo-sub' }, 'Upload or take a photo now.');
      const meta = el('div', { class: 'training-photo-meta' }, title, sub);

      const uploadBtn = el('button', { type: 'button', class: 'training-photo-btn primary' }, 'Upload');
      const cameraBtn = el('button', { type: 'button', class: 'training-photo-btn' }, 'Take photo');
      const picker = el('div', { class: 'training-photo-picker', role: 'group', 'aria-label': 'Profile photo' },
        circle,
        el('div', { class: 'training-photo-right' },
          meta,
          el('div', { class: 'training-photo-actions' },
            uploadBtn,
            cameraBtn
          ),
          el('div', { class: 'training-photo-tip' }, 'Tip: centered face, neutral background.')
        )
      );

      const removeBtn = el('button', { type: 'button', class: 'btn btn-ghost hidden' }, 'Remove');
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadInput.value = '';
        cameraInput.value = '';
        state.wizard.profileImage = { dataUrl: null };
        circle.innerHTML = '';
        circle.appendChild(
          el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
            el('use', { href: '#icon-account' })
          )
        );
        picker.classList.remove('has-photo');
        title.textContent = 'Add a photo';
        sub.textContent = 'Upload or take a photo now.';
        removeBtn.classList.add('hidden');
      });

      const applyPhoto = (dataUrl) => {
        if (!dataUrl) return;
        state.wizard.profileImage = { dataUrl };

        circle.innerHTML = '';
        circle.appendChild(el('img', { src: dataUrl, alt: 'Profile photo' }));
        picker.classList.add('has-photo');
        title.textContent = 'Photo added';
        sub.textContent = 'Upload another to change.';
        removeBtn.classList.remove('hidden');
      };

      const handleFile = async (file) => {
        if (!file) return;
        const out = await (window.odeAvatarCropper?.cropToSquare
          ? window.odeAvatarCropper.cropToSquare(file, { size: 560, quality: 0.86 })
          : fileToSquareAvatarDataUrl(file, { size: 560, quality: 0.86 }));
        if (!out) return;
        if (out.length > 950_000) {
          // Keep under server-side limit (data URL ~ 1.3x binary).
          const smaller = await fileToSquareAvatarDataUrl(file, { size: 420, quality: 0.82 });
          applyPhoto(smaller || out);
          return;
        }
        applyPhoto(out);
      };

      uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        uploadInput.click();
      });
      cameraBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cameraInput.click();
      });

      picker.addEventListener('click', (e) => {
        if (e.target?.closest?.('button')) return;
        uploadInput.click();
      });

      uploadInput.addEventListener('change', async () => {
        await handleFile(uploadInput.files?.[0]);
      });
      cameraInput.addEventListener('change', async () => {
        await handleFile(cameraInput.files?.[0]);
      });

      // Drag & drop.
      picker.addEventListener('dragover', (e) => {
        e.preventDefault();
        picker.classList.add('dragover');
      });
      picker.addEventListener('dragleave', () => picker.classList.remove('dragover'));
      picker.addEventListener('drop', async (e) => {
        e.preventDefault();
        picker.classList.remove('dragover');
        const file = e.dataTransfer?.files?.[0];
        await handleFile(file);
      });

      if (state.wizard.profileImage?.dataUrl) {
        applyPhoto(state.wizard.profileImage.dataUrl);
      } else if (state.profile?.profile_image) {
        applyPhoto(state.profile.profile_image);
      }

      content.append(
        el('div', { class: 'training-photo-block' },
          hint,
          picker,
          el('div', { class: 'training-photo-footer' }, removeBtn),
          uploadInput,
          cameraInput
        )
      );

      // Progress photos (highly encouraged).
      const ppBlock = el('div', { class: 'training-photo-block' },
        el('div', { class: 'training-muted' }, 'Highly recommended: add a front + side progress photo so you can compare changes over time.'),
        el('div', { class: 'training-row', style: 'justify-content: flex-start; flex-wrap: wrap; gap: 10px;' },
          el('button', {
            type: 'button',
            class: 'btn btn-primary',
            onclick: () => window.odeProgressPhotos?.open?.({ day: new Date().toISOString().slice(0, 10), pose: 'front' })
          }, 'Add / compare progress photos')
        )
      );
      content.append(ppBlock);

      nextBtn.addEventListener('click', async () => {
        clearError();
        const payload = buildOnboardingPayload();
        if (!payload) return flashError('Missing setup info.');
        await submitOnboarding(payload, { redirectToDashboardAfterSave: true });
      });
    }

    shell.append(content, actions);
    return shell;
  }

  function renderGenerating() {
    const minMs = Math.max(2500, Number(state.generating.minMs) || 9_000);
    const estimateSec = Math.max(3, Math.round(minMs / 1000));
    return el('div', { class: 'training-card training-center' },
      el('div', { class: 'training-loading' },
        el('div', { style: 'font-weight:800' }, 'Constructing your workout'),
        el('div', { class: 'training-muted', id: 'training-gen-msg' }, 'Starting construction...'),
        el('div', {
          class: 'training-progressbar',
          id: 'training-gen-progress',
          role: 'progressbar',
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': '0'
        },
        el('div', { class: 'training-progressbar-bar', id: 'training-gen-bar', style: 'width:0%' })
        ),
        el('div', { class: 'training-muted', id: 'training-gen-meta', style: 'font-size:12px;' }, `0% - 0s elapsed. Usually about ${estimateSec}s.`)
      )
    );
  }

  function getClientDashboardHref() {
    return 'dashboard.html';
  }

  function openWorkoutUploadNoticeModal({ onContinue } = {}) {
    const existing = document.getElementById('training-workout-upload-notice');
    if (existing) existing.remove();

    const close = () => {
      const node = document.getElementById('training-workout-upload-notice');
      if (node) node.remove();
    };

    const continueToDashboard = () => {
      close();
      if (typeof onContinue === 'function') onContinue();
    };

    const overlay = el('div', {
      class: 'schedule-modal',
      id: 'training-workout-upload-notice',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'training-workout-upload-notice-title'
    },
    el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close workout upload notice' }),
    el('div', { class: 'schedule-modal-card' },
      el('div', { class: 'schedule-modal-head' },
        el('div', { class: 'schedule-modal-title', id: 'training-workout-upload-notice-title' }, 'Workout saved'),
        el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close workout upload notice' }, '×')
      ),
      el('div', { class: 'schedule-modal-body' },
        el('div', {
          style: 'display:flex; align-items:center; gap:12px; margin-bottom:10px; color:var(--ink); font-weight:800;'
        },
        el('span', { 'aria-hidden': 'true', style: 'font-size:1.35rem; line-height:1;' }, '🕒'),
        el('span', null, 'Your workout should be uploaded within 24 hours.')
        ),
        el('div', { class: 'training-muted' }, 'We’ll take you to your dashboard now.')
      ),
      el('div', { class: 'schedule-modal-actions' },
        el('button', { type: 'button', class: 'btn btn-primary' }, 'Go to dashboard')
      )
    ));

    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', continueToDashboard);
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', continueToDashboard);
    overlay.querySelector('.schedule-modal-actions button')?.addEventListener('click', continueToDashboard);
    document.body.appendChild(overlay);
    return overlay;
  }

  function buildOnboardingPayload() {
    const discipline = state.wizard.discipline;
    const daysPerWeek = state.wizard.daysPerWeek;
    if (!discipline || !Number.isFinite(daysPerWeek)) return null;

    const strength = { ...(state.wizard.strength || {}) };
    delete strength.trainingAgeYears;
    const experience = state.wizard.experience || 'beginner';
    const macroGoalMode = readLatestMacroGoalMode();
    const goalMode = macroGoalMode || normalizeMacroGoalMode(state.wizard.goalMode) || 'bulk';
    const resolvedPhase = goalModeToTrainingPhase(goalMode, state.wizard.phase || 'bulk');
    const injury = state.wizard.injury && typeof state.wizard.injury === 'object' ? state.wizard.injury : { has: false, joints: [], note: '' };
    const profile = { ...(state.wizard.profile || {}) };
    const equipmentAccess = state.wizard.equipmentAccess && typeof state.wizard.equipmentAccess === 'object'
      ? state.wizard.equipmentAccess
      : { bodyweight: true };
    const normalizedDiscipline = normalizeDiscipline(discipline);

    if (normalizedDiscipline === 'bodybuilding' || normalizedDiscipline === 'powerbuilding' || normalizedDiscipline === 'military') {
      const sharedPayload = buildSharedOblueprintPayloadFromWizard({
        discipline: normalizedDiscipline,
        daysPerWeek,
        strength,
        experience,
        goalMode,
        resolvedPhase,
        injury,
        equipmentAccess,
        preferredDays: state.wizard.preferredDays,
        unavailableDays: state.wizard.unavailableDays,
        timePerSession: state.wizard.timePerSession,
        trainingAgeBucket: state.wizard.trainingAgeBucket,
        emphasis: state.wizard.emphasis,
        equipmentStylePref: state.wizard.equipmentStylePref
      });
      if (!sharedPayload) return null;
      return {
        ...sharedPayload,
        strength: {
          ...strength,
          goalMode,
          phase: resolvedPhase,
          targetWeightLb: Number(state.wizard.targetWeightLb),
          timePerSession: String(state.wizard.timePerSession || '').trim().toLowerCase(),
          trainingAgeBucket: String(state.wizard.trainingAgeBucket || '').trim().toLowerCase(),
          emphasis: Array.isArray(state.wizard.emphasis) ? state.wizard.emphasis : [],
          equipmentStylePref: String(state.wizard.equipmentStylePref || 'mix').trim().toLowerCase()
        },
        profile: {
          firstName: String(profile.firstName || '').trim(),
          age: Number(profile.age),
          locationCity: String(profile.locationCity || '').trim(),
          locationState: String(profile.locationState || '').trim(),
          goals: String(profile.goals || '').trim()
            || (resolvedPhase === 'cut' ? 'Goal: cut (definition)'
              : resolvedPhase === 'maintain' ? 'Goal: maintain'
                : 'Goal: bulk'),
          injuries: String(profile.injuries || '').trim()
        },
        profileImage: state.wizard.profileImage?.dataUrl ? { dataUrl: state.wizard.profileImage.dataUrl } : null
      };
    }

    if (discipline === 'powerlifting') {
      strength.squat = Number(strength.squat);
      strength.bench = Number(strength.bench);
      strength.deadlift = Number(strength.deadlift);
      strength.bodyweight = Number(strength.bodyweight);
      strength.goalBodyweight = Number(strength.goalBodyweight);
      strength.eventType = String(strength.eventType || '').trim() || 'full_power';
    } else if (discipline === 'bodybuilding') {
      strength.bodyweight = Number(strength.bodyweight);
      strength.height = Number(strength.height);
      strength.benchWeight = Number(strength.benchWeight);
      strength.benchReps = Number(strength.benchReps);
      strength.lowerMovement = String(strength.lowerMovement || 'squat').trim();
      strength.lowerWeight = Number(strength.lowerWeight);
      strength.lowerReps = Number(strength.lowerReps);
      strength.hingeMovement = String(strength.hingeMovement || 'deadlift').trim();
      strength.hingeWeight = Number(strength.hingeWeight);
      strength.hingeReps = Number(strength.hingeReps);
      strength.pullMovement = String(strength.pullMovement || '').trim();
      strength.pullExerciseId = String(strength.pullExerciseId || '').trim();
      strength.pullWeight = Number(strength.pullWeight);
      strength.pullReps = Number(strength.pullReps);
      strength.goalMode = goalMode;
      strength.phase = resolvedPhase;
      strength.targetWeightLb = Number(state.wizard.targetWeightLb);
      strength.timePerSession = String(state.wizard.timePerSession || '').trim().toLowerCase();
      strength.trainingAgeBucket = String(state.wizard.trainingAgeBucket || '').trim().toLowerCase();
      strength.emphasis = Array.isArray(state.wizard.emphasis) ? state.wizard.emphasis : [];
      strength.equipmentStylePref = String(state.wizard.equipmentStylePref || 'mix').trim().toLowerCase();
      strength.injury = {
        has: Boolean(injury?.has),
        joints: Array.isArray(injury?.joints)
          ? injury.joints.map((j) => String(j || '').trim()).filter(Boolean).slice(0, 12)
          : [],
        note: String(injury?.note || '').trim().slice(0, 280) || null
      };
      strength.injurySeverityByJoint = injury?.severityByJoint && typeof injury.severityByJoint === 'object'
        ? injury.severityByJoint
        : {};
    } else if (discipline === 'calisthenics') {
      strength.pushups = Number(strength.pushups);
      strength.pullups = Number(strength.pullups);
      strength.dips = Number(strength.dips);
      strength.hollowHoldSec = Number(strength.hollowHoldSec);
      strength.supportHoldSec = Number(strength.supportHoldSec);
      strength.handstandHoldSec = Number(strength.handstandHoldSec);

      strength.fatigue = String(strength.fatigue || '').trim().toLowerCase() || null;

      strength.goals = Array.isArray(strength.goals)
        ? strength.goals.map((g) => String(g || '').trim().toLowerCase()).filter(Boolean).slice(0, 6)
        : [];

      const eq = strength.equipment && typeof strength.equipment === 'object' ? strength.equipment : {};
      strength.equipment = {
        bar: Boolean(eq.bar),
        rings: Boolean(eq.rings),
        bands: Boolean(eq.bands),
        weights: Boolean(eq.weights),
        none: Boolean(eq.none)
      };
      if (!Object.values(strength.equipment).some(Boolean)) strength.equipment.none = true;
      if (strength.equipment.none) {
        strength.equipment.bar = false;
        strength.equipment.rings = false;
        strength.equipment.bands = false;
        strength.equipment.weights = false;
      }

      strength.preferredSkills = Array.isArray(strength.preferredSkills)
        ? strength.preferredSkills.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean).slice(0, 6)
        : [];

      // Back-compat (older profiles).
      strength.handstand = Boolean(strength.handstand);
      strength.muscleUp = Boolean(strength.muscleUp);
    }

    return {
      discipline,
      experience,
      daysPerWeek,
      preferredDays: resolvePreferredDaysForSubmit(daysPerWeek, state.wizard.preferredDays, state.wizard.unavailableDays),
      phase: resolvedPhase,
      targetWeightLb: state.wizard.targetWeightLb,
      timePerSession: state.wizard.timePerSession,
      trainingAgeBucket: state.wizard.trainingAgeBucket,
      emphasis: state.wizard.emphasis,
      equipmentStylePref: state.wizard.equipmentStylePref,
      unavailableDays: normalizeWeekdayIndexList(state.wizard.unavailableDays),
      equipmentAccess,
      strength,
      profile: {
        firstName: String(profile.firstName || '').trim(),
        age: Number(profile.age),
        locationCity: String(profile.locationCity || '').trim(),
        locationState: String(profile.locationState || '').trim(),
        goals: String(profile.goals || '').trim()
          || (resolvedPhase === 'cut' ? 'Goal: cut (definition)'
            : resolvedPhase === 'maintain' ? 'Goal: maintain'
              : 'Goal: bulk'),
        injuries: String(profile.injuries || '').trim()
      },
      profileImage: state.wizard.profileImage?.dataUrl ? { dataUrl: state.wizard.profileImage.dataUrl } : null
    };
  }

  async function submitOnboarding(payload, options = {}) {
    const redirectToDashboardAfterSave = Boolean(options?.redirectToDashboardAfterSave);
    const selectedDayCount = Number(payload?.daysPerWeek || 0) || null;
    const selectedPriorityGroups = Array.isArray(payload?.priorityGroups)
      ? payload.priorityGroups.map((value) => String(value || '')).filter(Boolean)
      : (Array.isArray(payload?.emphasis)
        ? payload.emphasis.map((value) => String(value || '')).filter(Boolean)
        : []);
    const requestKey = buildTrainingRequestKey(payload);
    const existingRequestKey = String(state.generating?.activeRequestKey || '');
    const duplicateBuildActive = Boolean(
      existingRequestKey
      && requestKey
      && existingRequestKey === requestKey
      && (
        state.view === 'generating'
        || state.generating?.controller
        || state.generating?.pollToken
        || state.generating?.handoffActive
      )
    );
    if (duplicateBuildActive) {
      const duplicateRequestId = Number(state.generating?.requestId || 0) || null;
      const duplicateRouteKind = String(state.generating?.activeRouteKind || 'unknown_training_route');
      const duplicateEndpoint = String(state.generating?.activeEndpoint || '').trim();
      logTrainingBuildLifecycle('training_build_duplicate_request_ignored', {
        endpoint: duplicateEndpoint,
        elapsedMs: state.generating?.frontendRequestStartedAt
          ? (Date.now() - Number(state.generating.frontendRequestStartedAt))
          : 0,
        dayCount: selectedDayCount,
        priorityGroups: selectedPriorityGroups,
        routeKind: duplicateRouteKind,
        requestId: duplicateRequestId,
        configuredTimeoutMs: Number(state.generating?.timeoutMs || 0) || null
      });
      setView('generating');
      render();
      return;
    }

    clearWorkoutGenerationState({ cancelRequest: true, clearFlags: false });
    state.generating.activeRequestKey = requestKey;
    state.generating.activeRouteKind = 'pending_training_route';
    state.generating.activeEndpoint = '';
    state.generating.frontendRequestStartedAt = Date.now();
    state.generating.requestId = Number(state.generating.requestId || 0) + 1;
    const requestId = state.generating.requestId;
    const comboEval = evaluateTrainingDebugCombo ? evaluateTrainingDebugCombo(payload, { rawClassic: true }) : { matched: false, reasonIfFalse: 'matcher_unavailable' };
    logDebugComboMatchEval('frontend', comboEval);
    const comboDebug = matchesAbsGlutesLegsDebugPayload(payload);
    state.generating.comboDebug = comboDebug;
    const routeInfo = describeRoutingSelection(payload);
    try {
      console.info(
        `[training][routing] You picked ${routeInfo.pickedLabel} with ${routeInfo.engineLabel}.`,
        routeInfo.details
      );
    } catch {
      // ignore console errors
    }

    setView('generating');
    try {
      localStorage.setItem(GUEST_PAYLOAD_KEY, JSON.stringify(payload || {}));
    } catch {
      // ignore
    }

    const forceAutostart = shouldForceAutostart();
    if (forceAutostart) clearForceAutostart();
    const prevPlanId = state.planRow?.id || null;
    const requestStartedAt = Date.now();
    let isAuthed = Boolean(state.auth.user);
    if (!isAuthed) {
      try {
        const refreshed = await refreshShareAuthSnapshot();
        isAuthed = Boolean(refreshed?.ok && refreshed?.user);
      } catch {
        isAuthed = Boolean(state.auth.user);
      }
    }
    const minMs = isAuthed ? Math.max(350, Number(state.generating?.minMs) || 600) : 350;
    state.generating.minMs = minMs;
    state.generating.timeoutMs = 45_000;
    const minDelay = new Promise((r) => setTimeout(r, minMs));
    const endpoint = isAuthed ? '/api/training/onboarding' : '/api/training/preview';
    const routeKind = isAuthed ? 'signed_in_onboarding' : 'signed_out_preview';
    state.generating.activeRouteKind = routeKind;
    state.generating.activeEndpoint = endpoint;
    state.generating.frontendRequestStartedAt = requestStartedAt;
    const totalTimeoutMs = Math.max(minMs + 6_000, Number(state.generating.timeoutMs) || 20_000);
    logTrainingBuildLifecycle('training_build_request_started', {
      endpoint,
      elapsedMs: 0,
      dayCount: selectedDayCount,
      priorityGroups: selectedPriorityGroups,
      routeKind,
      requestId,
      configuredTimeoutMs: totalTimeoutMs
    });
    if (comboDebug) {
      logAbsGlutesLegsDebug('submit-start', {
        source: 'frontend state',
        endpoint,
        isAuthed,
        requestId,
        minMs,
        totalTimeoutMs,
        routeKind,
        selectedDayCount,
        priorityGroups: selectedPriorityGroups,
        payload
      });
    }
    const controller = new AbortController();
    state.generating.controller = controller;
    const timeoutId = setTimeout(() => controller.abort(), totalTimeoutMs);
    let resp;
    try {
      const req = api(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal,
        headers: {
          'X-Training-Request-Id': `training-${requestId}-${requestStartedAt}`
        }
      })
        .catch((err) => ({ ok: false, status: err?.name === 'AbortError' ? 408 : 0, json: null, error: err }));
      await minDelay;
      const remainingMs = Math.max(0, totalTimeoutMs - minMs);
      if (remainingMs > 0) {
        resp = await Promise.race([
          req,
          new Promise((r) => setTimeout(() => r({ ok: false, status: 408, json: null }), remainingMs))
        ]);
      } else {
        resp = await req;
      }
    } catch (err) {
      resp = { ok: false, status: err?.name === 'AbortError' ? 408 : 0, json: null, error: err };
    } finally {
      clearTimeout(timeoutId);
    }
    try {
      console.info('training_build_frontend_response_received', {
        endpoint,
        status: Number(resp?.status || 0) || 0,
        ok: Boolean(resp?.ok),
        hasJson: Boolean(resp && Object.prototype.hasOwnProperty.call(resp, 'json')),
        elapsedMs: Date.now() - requestStartedAt,
        routeKind,
        requestId
      });
    } catch {
      // ignore console failures
    }
    logTrainingBuildLifecycle('training_build_backend_response_received', {
      endpoint,
      elapsedMs: Date.now() - requestStartedAt,
      dayCount: selectedDayCount,
      priorityGroups: selectedPriorityGroups,
      routeKind,
      requestId,
      configuredTimeoutMs: totalTimeoutMs
    });

    if (Number(state.generating.requestId || 0) !== requestId) return;
    state.generating.controller = null;

    if (!resp.ok) {
      const errObj = resp?.json && typeof resp.json === 'object' ? resp.json : {};
      const isFrontendAbortTimeout = String(resp?.error?.name || '').trim() === 'AbortError'
        || String(errObj?.error || '').trim() === 'training_build_frontend_abort_timeout'
        || resp?.status === 408;
      const isStructuredPlanBuildFailure = Boolean(
        resp?.status === 400
        && errObj
        && typeof errObj === 'object'
        && (errObj.error || errObj.message || errObj.reason)
        && (errObj.functionName || errObj.stage || errObj.failedStage)
      );
      if (comboDebug) {
        logAbsGlutesLegsDebug('submit-non-ok', {
          source: 'frontend state',
          endpoint,
          isAuthed,
          status: resp?.status || 0,
          elapsedMs: Date.now() - requestStartedAt,
          isFrontendAbortTimeout,
          willPoll: Boolean(isAuthed && !isStructuredPlanBuildFailure)
        });
      }
      if (isFrontendAbortTimeout) {
        setGeneratingHandoffState({
          active: true,
          message: 'Workout is still finishing. Checking for completed plan...',
          meta: `95% - Checking for completed plan... ${Math.max(0, Math.round((Date.now() - requestStartedAt) / 1000))}s elapsed.`
        });
        try {
          console.error('training_build_frontend_abort_timeout', {
            endpoint,
            elapsedMs: Date.now() - requestStartedAt,
            configuredTimeoutMs: totalTimeoutMs,
            dayCount: selectedDayCount,
            priorityGroups: selectedPriorityGroups,
            routeKind
          });
        } catch {
          // ignore console errors
        }
        logTrainingBuildLifecycle('training_build_frontend_abort_timeout', {
          endpoint,
          elapsedMs: Date.now() - requestStartedAt,
          dayCount: selectedDayCount,
          priorityGroups: selectedPriorityGroups,
          routeKind,
          requestId,
          configuredTimeoutMs: totalTimeoutMs
        });
      }
      if (resp.status === 401) {
        state.auth.user = null;
        state.profile = null;
        setView('wizard');
        return;
      }
      if (isAuthed && !isStructuredPlanBuildFailure) {
        if (comboDebug) {
          logAbsGlutesLegsDebug('polling-entered-after-non-ok', {
            source: 'polling',
            endpoint,
            elapsedMs: Date.now() - requestStartedAt,
            note: 'Authenticated polling can mask a fast backend failure.'
          });
        }
        const pollToken = createGenerationPollToken();
        state.generating.pollToken = pollToken;
        const ready = await pollForPlanReady({
          maxMs: 180_000,
          intervalMs: 2000,
          prevPlanId,
          requestStartedAt,
          pollToken
        });
        if (state.generating?.pollToken === pollToken) state.generating.pollToken = null;
        if (ready) {
          if (isFrontendAbortTimeout) {
            logTrainingBuildLifecycle('training_build_saved_plan_detected_after_abort', {
              endpoint,
              elapsedMs: Date.now() - requestStartedAt,
              dayCount: selectedDayCount,
              priorityGroups: selectedPriorityGroups,
              routeKind,
              requestId,
              configuredTimeoutMs: totalTimeoutMs
            });
          }
          logTrainingBuildLifecycle('training_build_displayed_from_poll', {
            endpoint,
            elapsedMs: Date.now() - requestStartedAt,
            dayCount: selectedDayCount,
            priorityGroups: selectedPriorityGroups,
            routeKind,
            requestId,
            configuredTimeoutMs: totalTimeoutMs
          });
          if (comboDebug) {
            logAbsGlutesLegsDebug('polling-resolved-visible-state', {
              source: 'polling',
              elapsedMs: Date.now() - requestStartedAt,
              resolvedTo: 'plan-ready'
            });
          }
          setGeneratingHandoffState({ active: false, message: '', meta: '' });
          clearWorkoutGenerationState({ cancelRequest: false, clearFlags: true });
          sanitizeBodybuildingPlanInPlace(state.planRow);
          return;
        }
      }
      setGeneratingHandoffState({ active: false, message: '', meta: '' });
      clearWorkoutGenerationState({ cancelRequest: false, clearFlags: true });
      state.planRow = null;
      state.logs = [];
      state.allLogs = [];
      if (!isFrontendAbortTimeout) {
        try {
          console.error('[training][plan-build-failed]', {
            status: resp?.status || 0,
            body: errObj
          });
        } catch {
          // ignore console errors
        }
      }
      const detail = (() => {
        const lines = [];
        const push = (label, value) => {
          const text = String(value || '').trim();
          if (!text) return;
          lines.push(label ? `${label}: ${text}` : text);
        };
        if (errObj?.error) push('', errObj.error);
        if (errObj?.slotId) push('slotId', errObj.slotId);
        if (errObj?.day) push('day', errObj.day);
        if (Number.isFinite(Number(errObj?.week))) push('week', errObj.week);
        if (errObj?.exerciseName) push('exercise', errObj.exerciseName);
        if (errObj?.functionName) push('function', errObj.functionName);
        if (errObj?.message) push('message', errObj.message);
        else if (errObj?.reason) push('message', errObj.reason);
        if (!lines.length && errObj?.error === 'INVALID_INPUT') {
          const field = errObj.field ? ` (${errObj.field})` : '';
          const reason = errObj.reason ? `: ${errObj.reason}` : '';
          lines.push(`INVALID_INPUT${field}${reason}`);
        }
        return lines.join('\n');
      })();
      state.planError = neutralizePlanLoadError(isFrontendAbortTimeout
        ? 'Workout build did not finish in time. No completed plan was detected.'
        : resp.status === 408
          ? 'Plan build timed out. Please try again.'
        : (detail ? `Failed to build plan:\n${detail}` : 'Failed to build plan.'));
      if (comboDebug) {
        logAbsGlutesLegsDebug('visible-failure', {
          source: 'frontend state',
          elapsedMs: Date.now() - requestStartedAt,
          status: resp?.status || 0,
          isFrontendAbortTimeout,
          detail,
          errorBody: errObj
        });
      }
      pauseAutoRetry();
      setView('plan');
      return;
    }

    try {
      console.info('training_build_frontend_response_ok', {
        endpoint,
        elapsedMs: Date.now() - requestStartedAt,
        routeKind,
        requestId
      });
    } catch {
      // ignore console failures
    }
    state.planRow = resp.json?.plan || null;
    try {
      console.info('training_build_frontend_plan_payload_detected', {
        endpoint,
        routeKind,
        requestId,
        hasPlan: Boolean(resp?.json?.plan),
        planId: resp?.json?.plan?.id || null,
        preview: Boolean(resp?.json?.plan?.preview)
      });
    } catch {
      // ignore console failures
    }
    if (comboDebug) {
      logAbsGlutesLegsDebug('submit-succeeded', {
        source: 'frontend state',
        endpoint,
        elapsedMs: Date.now() - requestStartedAt,
        planId: state.planRow?.id || null,
        preview: Boolean(state.planRow?.preview)
      });
    }
    if (state.generating?.pollToken) {
      state.generating.pollToken.cancelled = true;
      try {
        console.info('training_build_frontend_recovery_poll_cancelled', {
          endpoint,
          routeKind,
          requestId,
          reason: 'direct_response_success'
        });
      } catch {
        // ignore console failures
      }
      state.generating.pollToken = null;
    }
    clearWorkoutGenerationState({ cancelRequest: false, clearFlags: true });
    state.planError = null;
    clearAutoRetryPause();
    sanitizeBodybuildingPlanInPlace(state.planRow);
    state.logs = resp.json?.logs || [];
    state.allLogs = Array.isArray(state.logs) ? state.logs.slice() : [];
    if (isAuthed && !state.planRow?.id) {
      const fallback = await fetchTrainingStateWithRetry({ tries: 3, delayMs: 1400 });
      if (fallback?.ok && fallback.json?.plan?.id) {
        const nextPlan = fallback.json?.plan || null;
        if (isFreshPlanAfterSubmit(nextPlan, prevPlanId, requestStartedAt)) {
          state.profile = fallback.json?.profile || state.profile;
          state.planRow = nextPlan;
          sanitizeBodybuildingPlanInPlace(state.planRow);
          state.logs = [];
          state.allLogs = [];
          void refreshTrainingLogs(state.planRow.id).then(() => render()).catch(() => {});
        }
      }
    }
    if (isAuthed && state.planRow?.id) {
      void refreshTrainingLogs(state.planRow.id).then(() => render()).catch(() => {});
    }
    clearForceAutostart();
    try { sessionStorage.removeItem('ode_training_intake_handoff'); } catch {}
    const createdFirstPlan = Boolean(isAuthed && state.planRow?.id && !prevPlanId);
    if (createdFirstPlan) {
      markTrainingQuickTourFirstPlanArmed();
      setTrainingQuickTourPending();
    }
    markTrainingBuildCompleted({ requestId, requestKey, routeKind });
    try {
      console.info('training_build_frontend_render_plan_start', {
        endpoint,
        routeKind,
        requestId,
        planId: state.planRow?.id || null,
        targetView: 'plan'
      });
    } catch {
      // ignore console failures
    }
    if (redirectToDashboardAfterSave && isAuthed) {
      openWorkoutUploadNoticeModal({
        onContinue: () => {
          window.location.href = getClientDashboardHref();
        }
      });
      return;
    }
    setView('plan');
    try {
      console.info('training_build_frontend_render_plan_success', {
        endpoint,
        routeKind,
        requestId,
        planId: state.planRow?.id || null,
        finalView: state.view
      });
    } catch {
      // ignore console failures
    }
  }

    function renderUpsell() {
      // New: keep it simple (3 meal-prep essentials + opt-in meal service CTA).
      const productsV2 = [
        {
          id: 'ph_essentials_scale',
          title: 'Digital Food Scale',
          desc: 'Precision weighing for accurate portion control',
          price: '$15.00',
          img: 'https://m.media-amazon.com/images/I/41gdcA2HWHL._SL1100_.jpg',
          href: 'store-product.html?id=ph_essentials_scale'
        },
        {
          id: 'ph_essentials_measuring',
          title: '1-Cup Measuring Cup',
          desc: 'Clear markings for rice, liquids & more',
          price: '$11.25',
          img: 'https://m.media-amazon.com/images/I/61zRCsefyjL._AC_SL1500_.jpg',
          href: 'store-product.html?id=ph_essentials_measuring'
        },
        {
          id: 'ph_essentials_containers',
          title: 'Meal Prep Containers',
          desc: '35oz, stackable, microwave & dishwasher safe',
          price: '$16.50',
          img: 'https://m.media-amazon.com/images/I/71hvLPhU1gL._AC_SL1500_.jpg',
          href: 'store-product.html?id=ph_essentials_containers'
        }
      ];

    const productCard = (p) => el('div', { class: 'essential-card' },
      el('div', { class: 'essential-image' }, el('img', { src: p.img, alt: p.title, loading: 'lazy' })),
      el('div', { class: 'essential-body' },
        el('h4', null, p.title),
        el('p', { class: 'essential-desc' }, p.desc),
        el('div', { class: 'essential-meta' },
          el('span', { class: 'essential-price' }, p.price),
          el('span', { class: 'essential-shipping' }, 'In store')
        ),
        el('a', { class: 'btn btn-primary essential-cta', href: p.href }, 'View')
      )
    );

    const opt = el('input', {
      type: 'checkbox',
      checked: state.mealService.optIn ? 'true' : null,
      onchange: (e) => setMealService({ optIn: Boolean(e.target.checked), status: '' })
    });

    const phoneInput = el('input', {
      class: 'auth-input',
      type: 'tel',
      inputmode: 'tel',
      placeholder: 'Phone (recommended)',
      value: state.mealService.phone || '',
      disabled: state.mealService.optIn ? null : 'true',
      oninput: (e) => setMealServiceSilent({ phone: e.target.value })
    });
    const emailInput = el('input', {
      class: 'auth-input',
      type: 'email',
      inputmode: 'email',
      placeholder: 'Email (optional)',
      value: state.mealService.email || '',
      disabled: state.mealService.optIn ? null : 'true',
      oninput: (e) => setMealServiceSilent({ email: e.target.value })
    });

    const reqCallBtn = el('button', {
      type: 'button',
      class: 'btn btn-primary',
      disabled: state.mealService.optIn ? null : 'true',
      onclick: async () => {
        if (!state.mealService.optIn) return;
        setMealService({ status: 'Submitting...' });
        const res = await submitMealServiceLead({ phone: phoneInput.value, email: emailInput.value });
        setMealService({ status: res.ok ? "Request submitted. We'll reach out soon." : (res.error || "Saved locally. We'll reach out soon.") });
      }
    }, 'Request a call');

    const continueBtn = el('button', {
      type: 'button',
      class: 'btn btn-primary',
      onclick: () => {
        if (state.planRow?.id) localStorage.setItem(`ode_training_upsell_dismissed_${state.planRow.id}`, '1');
        setView('plan');
      }
    }, 'Continue to plan');

    return el('div', { class: 'training-card training-center' },
      el('div', null,
        el('h3', { style: 'margin: 0 0 0.25rem' }, 'Be prepared before Day One.'),
        el('div', { class: 'training-muted' }, 'Meal prep essentials (recommended).')
      ),
      el('div', { class: 'training-divider' }),
      el('div', { class: 'essentials-grid' }, productsV2.map(productCard)),
      el('div', { class: 'meal-service-cta' },
        el('div', { class: 'meal-service-title' }, 'Have someone cook your meals for you'),
        el('div', { class: 'training-muted' }, "Opt in and we'll call you for details (schedule + delivery preferences)."),
        el('label', { class: 'meal-service-opt' },
          opt,
          el('span', null, 'Yes - contact me about meal prep delivery')
        ),
        el('div', { class: 'meal-service-grid' }, phoneInput, emailInput),
        el('div', { class: 'meal-service-actions' }, reqCallBtn),
        state.mealService.status ? el('div', { class: 'training-muted', style: 'font-size:12px;' }, state.mealService.status) : null
      ),
      el('div', { class: 'training-actions' }, continueBtn)
    );

    const discipline = state.planRow?.discipline
      || state.planRow?.plan?.meta?.discipline
      || state.wizard.discipline;

    const essentialsForDiscipline = (d) => {
      const key = String(d || '').toLowerCase();
      if (key === 'powerlifting') {
        return {
          equipment: ['Belt', 'Wrist wraps', 'Knee sleeves'],
          supplements: ['Creatine', 'Whey protein', 'Electrolytes'],
          mealPrep: ['Food scale', 'Containers', 'High-protein staples']
        };
      }
      if (key === 'bodybuilding') {
        return {
          equipment: ['Lifting straps', 'Lifting shoes', 'Micro plates'],
          supplements: ['Creatine', 'Whey protein', 'Caffeine (optional)'],
          mealPrep: ['Food scale', 'Containers', 'Lean proteins + carbs']
        };
      }
      return {
        equipment: ['Pull-up bar / rings', 'Dip station (or bars)', 'Bands'],
        supplements: ['Creatine', 'Whey protein', 'Electrolytes'],
        mealPrep: ['Food scale', 'Containers', 'Easy carb sources']
      };
    };

    const essentials = essentialsForDiscipline(discipline);
    const proceed = el('button', {
      type: 'button',
      class: 'btn btn-primary',
      onclick: () => {
        if (state.planRow?.id) localStorage.setItem(`ode_training_upsell_dismissed_${state.planRow.id}`, '1');
        setView('plan');
      }
    }, 'Continue to plan');

    return el('div', { class: 'training-card training-center' },
      el('div', null,
        el('h3', { style: 'margin: 0 0 0.25rem' }, 'Be prepared before Day One.'),
        el('div', { class: 'training-muted' }, 'Grab the essentials so the plan actually works.')
      ),
      el('div', { class: 'training-divider' }),
      el('div', { class: 'upsell-grid' },
        el('div', { class: 'upsell-item' },
          el('h4', null, 'Meal prep essentials'),
          el('p', null, essentials.mealPrep.join(' • '))
        ),
        el('div', { class: 'upsell-item' },
          el('h4', null, 'Supplements'),
          el('p', null, essentials.supplements.join(' • '))
        ),
        el('div', { class: 'upsell-item' },
          el('h4', null, 'Equipment'),
          el('p', null, essentials.equipment.join(' • '))
        )
      ),
      el('div', { class: 'training-actions' }, proceed)
    );
  }

  function buildLogsMap(logs) {
    const map = new Map();
    for (const row of logs || []) {
      const key = `${row.week_index}:${row.day_index}`;
      map.set(key, row);
    }
    return map;
  }

  function workoutLogDateIso(row) {
    const performed = row?.performed_at ? String(row.performed_at).slice(0, 10) : '';
    if (performed) return performed;
    const updated = row?.updated_at ? String(row.updated_at).slice(0, 10) : '';
    return updated || '';
  }

  function buildLogsByDate(logs) {
    const map = new Map();
    for (const row of logs || []) {
      const key = workoutLogDateIso(row);
      if (!key) continue;
      const bucket = map.get(key) || [];
      bucket.push(row);
      map.set(key, bucket);
    }
    return map;
  }

  function earliestLogDate(logs) {
    let earliest = null;
    for (const row of logs || []) {
      const iso = workoutLogDateIso(row);
      if (!iso) continue;
      const parsed = parseISODateLocal(iso);
      if (!parsed || Number.isNaN(parsed.getTime())) continue;
      if (!earliest || parsed.getTime() < earliest.getTime()) earliest = parsed;
    }
    return earliest;
  }

  function summarizeHistoryEntry(entry) {
    const sets = Array.isArray(entry?.sets) ? entry.sets : [];
    const workingSets = sets.filter((setRow) => {
      const weight = Number(setRow?.weight);
      const reps = Number(setRow?.reps);
      return (Number.isFinite(weight) && weight > 0) || (Number.isFinite(reps) && reps > 0);
    });
    if (!workingSets.length) {
      return {
        summary: 'No logged working sets',
        best: '',
        sets: []
      };
    }

    const renderSet = (setRow) => {
      const weight = Number(setRow?.weight);
      const reps = Number(setRow?.reps);
      if (Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0) return `${weight} lb x ${reps}`;
      if (Number.isFinite(reps) && reps > 0) return `${reps} reps`;
      if (Number.isFinite(weight) && weight > 0) return `${weight} lb`;
      return '';
    };

    const bestSet = workingSets.reduce((best, current) => {
      const bestWeight = Number(best?.weight);
      const currentWeight = Number(current?.weight);
      const bestReps = Number(best?.reps);
      const currentReps = Number(current?.reps);
      if (!best) return current;
      if ((Number.isFinite(currentWeight) ? currentWeight : -1) > (Number.isFinite(bestWeight) ? bestWeight : -1)) return current;
      if ((Number.isFinite(currentWeight) ? currentWeight : -1) === (Number.isFinite(bestWeight) ? bestWeight : -1)
        && (Number.isFinite(currentReps) ? currentReps : -1) > (Number.isFinite(bestReps) ? bestReps : -1)) return current;
      return best;
    }, null);

    const bestText = renderSet(bestSet);
    return {
      summary: `${workingSets.length} working set${workingSets.length === 1 ? '' : 's'}`,
      best: bestText ? `Best: ${bestText}` : '',
      sets: workingSets.map((setRow, idx) => ({
        index: idx + 1,
        text: renderSet(setRow)
      })).filter((row) => row.text)
    };
  }

  async function refreshTrainingLogs(planId) {
    const safePlanId = String(planId || '').trim();
    if (!safePlanId) {
      state.logs = [];
      state.allLogs = [];
      return { logs: [], allLogs: [] };
    }
    const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(safePlanId)}&includeAll=1`, { method: 'GET' });
    const logs = logsResp.ok ? (logsResp.json?.logs || []) : [];
    const allLogs = logsResp.ok ? (logsResp.json?.allLogs || logs) : state.allLogs;
    state.logs = logs;
    state.allLogs = Array.isArray(allLogs) ? allLogs : logs;
    return { logs: state.logs, allLogs: state.allLogs };
  }

  function slotIndexFromWeekDay(weekIndex, dayIndex, daysPerWeek) {
    const w = Number(weekIndex);
    const d = Number(dayIndex);
    const n = Number(daysPerWeek);
    if (!Number.isFinite(w) || w < 1) return null;
    if (!Number.isFinite(d) || d < 1) return null;
    if (!Number.isFinite(n) || n < 1) return null;
    return (w - 1) * n + (d - 1);
  }

  function performanceMapBeforeSlot({ logs, beforeWeekIndex, beforeDayIndex, daysPerWeek }) {
    const beforeSlot = slotIndexFromWeekDay(beforeWeekIndex, beforeDayIndex, daysPerWeek);
    if (beforeSlot == null) return new Map();
    const safeLogs = Array.isArray(logs) ? logs : [];

    const rows = safeLogs.map((row) => {
      const slot = slotIndexFromWeekDay(row?.week_index, row?.day_index, daysPerWeek);
      return { row, slot: slot == null ? Infinity : slot };
    }).filter((x) => Number.isFinite(x.slot) && x.slot < beforeSlot)
      .sort((a, b) => a.slot - b.slot);

    const out = new Map();
    for (const { row } of rows) {
      const entries = Array.isArray(row?.entries) ? row.entries : [];
      for (const e of entries) {
        const key = resolveLiftHistoryKey(e);
        const perf = extractWorkoutEntryPerformance(e);
        if (!key || !perf) continue;
        const nextPerf = {
          ...perf,
          performedAt: row?.performed_at ? String(row.performed_at).slice(0, 10) : null
        };
        out.set(key, nextPerf);
        resolveLiftHistoryLookupKeys({
          baseId: e?.baseId,
          exerciseId: e?.exerciseId || e?.id,
          exerciseName: e?.exerciseName || e?.displayName || e?.name
        }).forEach((alias) => {
          if (!out.has(alias)) out.set(alias, nextPerf);
        });
      }
    }
    return out;
  }

  function previousEntryMapBeforeSlot({ logs, beforeWeekIndex, beforeDayIndex, daysPerWeek }) {
    const beforeSlot = slotIndexFromWeekDay(beforeWeekIndex, beforeDayIndex, daysPerWeek);
    if (beforeSlot == null) return new Map();
    const safeLogs = Array.isArray(logs) ? logs : [];

    const rows = safeLogs.map((row) => {
      const slot = slotIndexFromWeekDay(row?.week_index, row?.day_index, daysPerWeek);
      return { row, slot: slot == null ? Infinity : slot };
    }).filter((x) => Number.isFinite(x.slot) && x.slot < beforeSlot)
      .sort((a, b) => a.slot - b.slot);

    const out = new Map();
    for (const { row } of rows) {
      const entries = Array.isArray(row?.entries) ? row.entries : [];
      for (const e of entries) {
        const key = resolveLiftHistoryKey(e);
        if (!key) continue;
        const nextEntry = {
          sets: Array.isArray(e?.sets) ? e.sets : [],
          actual: e?.actual && typeof e.actual === 'object' ? { ...e.actual } : null,
          prescribed: e?.prescribed && typeof e.prescribed === 'object' ? { ...e.prescribed } : null,
          performedAt: row?.performed_at ? String(row.performed_at).slice(0, 10) : null
        };
        out.set(key, nextEntry);
        resolveLiftHistoryLookupKeys({
          baseId: e?.baseId,
          exerciseId: e?.exerciseId || e?.id,
          exerciseName: e?.exerciseName || e?.displayName || e?.name
        }).forEach((alias) => {
          if (!out.has(alias)) out.set(alias, nextEntry);
        });
      }
    }
    return out;
  }

  async function saveWorkout({ weekIndex, dayIndex, exercises, dayNotes, performedAt }) {
    const built = buildWorkoutLogPayload({
      weekIndex,
      dayIndex,
      exercises,
      dayNotes,
      performedAt,
      requireReadiness: true
    });
    if (!built.ok) {
      state.planError = built.error || 'Failed to save workout.';
      render();
      return;
    }
    state.planError = null;
    const resp = await api('/api/training/log', {
      method: 'POST',
      body: JSON.stringify(built.payload)
    });
    if (!resp.ok) {
      state.planError = resp.json?.error || 'Failed to save workout.';
      render();
      return;
    }
    if (resp.json?.plan) {
      state.planRow = resp.json.plan;
      sanitizeBodybuildingPlanInPlace(state.planRow);
    }
    if (resp.json?.liftHistory) rememberLiftHistory(resp.json.liftHistory);
    await refreshTrainingLogs(built.payload.planId);
    clearWorkoutDraftStateForDay({
      weekIndex: built.payload.weekIndex,
      dayIndex: built.payload.dayIndex
    });
    render();
    return; /*

    const planId = state.planRow?.id;
    if (!planId) {
      state.planError = state.auth.user ? 'No active plan found.' : 'Sign in to save workouts.';
      render();
      return;
    }
    state.planError = null;

    const readinessEl = qs('#workout-readiness');
    const readinessRaw = readinessEl ? Number(readinessEl.value) : null;
    const readiness = Number.isFinite(readinessRaw) ? Math.max(1, Math.min(10, readinessRaw)) : null;
    if (!Number.isFinite(readiness)) {
      state.planError = 'Add readiness (1-10) before saving.';
      render();
      return;
    }

    const planRef = state.planRow?.plan || null;
    const entries = (exercises || []).map((ex, exIdx) => {
      const exId = String(ex.id);
      const findField = (field) => qsa(`[data-field="${field}"]`).find((n) => n?.dataset?.exId === exId) || null;
      const notes = '';
      const resolvedProjected = resolveProjectedForExercise(ex, planRef);
      const resolvedProjectedValue = Number.isFinite(resolvedProjected?.value) ? resolvedProjected.value : null;
      const resolvedProjectedUnit = resolvedProjected?.unit || null;

        const setInputs = qsa('[data-field]').filter((n) => n?.dataset?.exId === exId && n?.dataset?.setIdx != null);
        const setMap = new Map();
        for (const input of setInputs) {
          const idx = Number(input?.dataset?.setIdx);
          if (!Number.isFinite(idx) || idx < 0) continue;
        const entry = setMap.get(idx) || {};
        const raw = String(input.value || '').trim();
          if (raw !== '') {
            if (input.dataset.field === 'setNote') {
              entry.note = raw.slice(0, 140);
            } else {
              const num = Number(raw);
              if (Number.isFinite(num)) {
                if (input.dataset.field === 'setWeight') entry.weight = num;
                if (input.dataset.field === 'setReps') entry.reps = num;
              }
            }
          }
          setMap.set(idx, entry);
        }
        const sets = Array.from(setMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, val]) => ({
            weight: Number.isFinite(val.weight) ? val.weight : null,
            reps: Number.isFinite(val.reps) ? val.reps : null,
            note: typeof val.note === 'string' ? val.note : null
          }));
        const lastSet = [...sets].reverse().find((s) => Number.isFinite(s.weight) || Number.isFinite(s.reps)) || null;
        const summaryWeight = lastSet?.weight ?? null;
        const summaryReps = lastSet?.reps ?? null;

      const draftSetCount = getWorkoutSetCountDraft({
        exId: ex.id,
        exSlot: exIdx,
        weekIndex,
        dayIndex,
        fallback: ex.sets
      });

      return {
        exerciseId: ex.id,
        baseId: ex.baseId,
        prescribed: {
          sets: draftSetCount,
          reps: ex.reps,
          repsTarget: Number.isFinite(ex?.progression?.repsTarget) ? ex.progression.repsTarget : parseRepsTarget(ex.reps),
          restSec: ex.restSec,
          projectedWeight: resolvedProjectedValue,
          projectedUnit: resolvedProjectedUnit,
          rirTarget: Number.isFinite(ex?.rirTarget) ? ex.rirTarget : null
        },
        target: { weight: null },
        actual: {
          weight: Number.isFinite(summaryWeight) ? summaryWeight : null,
          reps: Number.isFinite(summaryReps) ? summaryReps : null,
          rpe: null
        },
        sets,
        notes
      };
    });

    const resp = await api('/api/training/log', {
      method: 'POST',
      body: JSON.stringify({
        planId,
        weekIndex,
        dayIndex,
        performedAt,
        entries,
        notes: dayNotes,
        readiness
      })
    });

    if (!resp.ok) {
      state.planError = resp.json?.error || 'Failed to save workout.';
      render();
      return;
    }

    if (resp.json?.plan) {
      state.planRow = resp.json.plan;
      sanitizeBodybuildingPlanInPlace(state.planRow);
    }
    await refreshTrainingLogs(planId);
    render(); */
  }

  function renderPlan() {
    const planRow = state.planRow;
    workoutAutosaveContext = null;
    const sanitizeSummary = sanitizeBodybuildingPlanInPlace(planRow);
    if ((sanitizeSummary.removed > 0 || sanitizeSummary.capped > 0) && !state.planError) {
      state.planError = 'Invalid exercises/sets were removed from display. Regenerate plan for a clean rebuild.';
    }
    const plan = planRow?.plan;
    if (plan && Array.isArray(plan.weeks) && /Workout build is taking longer than expected|Workout build did not finish in time|training_build_frontend_abort_timeout|Failed to load training state/i.test(String(state.planError || ''))) {
      state.planError = null;
    }
    if (!plan || !Array.isArray(plan.weeks)) {
      if (isWorkoutBuildPending()) {
        return renderGenerating();
      }
      // Coach-managed clients don't do their own setup — their coach delivers
      // the plan. Show the "your coach is building your plan" pending card
      // directly instead of the "No saved setup / Complete setup" prompt.
      // (The old path returned an empty div and relied on coach-doc-card.js
      // mounting the card into a [data-coach-doc] element, but no page renders
      // one — so invited clients were left staring at a blank page.)
      if (sessionCoach && sessionCoach.name) {
        const coachName = String(sessionCoach.name || '').trim() || 'Your coach';
        return el('div', { class: 'training-card training-center' },
          el('div', { class: 'training-muted', style: 'font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:11px;opacity:.75' }, 'From your coach'),
          el('div', { style: 'font-weight:800;font-size:1.15rem;margin-top:6px' }, coachName + ' is building your plan'),
          el('div', { class: 'training-muted', style: 'margin-top:8px' }, 'Your plan will show up here within 48 hours — as a PDF or right on this page. Message ' + coachName + ' with any questions.')
        );
      }
      // While impersonating, the local intake is the trainer's — never offer to
      // build the client's plan from it (wrong data + a long build hang).
      const hasIntake = !sessionIsImpersonated && !!readLocalIntake();
      const msg = neutralizePlanLoadError(state.planError) || (hasIntake ? 'Ready to generate your workout.' : 'No plan found.');
      return el('div', { class: 'training-card training-center' },
        el('div', { class: 'training-muted' }, msg),
        hasIntake || state.planError
          ? el('div', { class: 'training-actions', style: 'margin-top:0.75rem' },
            state.planError
              ? el('button', {
                type: 'button',
                class: 'btn btn-ghost',
                onclick: startOverAfterGenerationFailure
              }, 'Start Over')
              : null,
            hasIntake
              ? el('button', {
                type: 'button',
                class: 'btn btn-primary',
                onclick: () => keepOnEngineAndRetry({ forceAutostart: true })
              }, 'Generate workout')
              : null
          )
          : null
      );
    }

    applyPendingScheduleIfDue(new Date());

    const isPreview = !planRow?.id || planRow?.preview || plan?.meta?.preview;
    const canRegenerateWithNewRules = Boolean(state.auth.user?.isOwner);

    function makeDefaultWizard() {
      return {
        step: 1,
        discipline: 'bodybuilding',
        experience: 'beginner',
        strength: {},
        goalMode: 'muscle_gain',
        phase: 'bulk',
        targetWeightLb: '',
        timePerSession: '',
        trainingAgeBucket: '',
        emphasis: [],
        equipmentStylePref: 'mix',
        injury: { has: false, joints: [], note: '' },
        daysPerWeek: null,
        unavailableDays: readUnavailableDays(),
        equipmentAccess: { bodyweight: true, dumbbell: false, barbell: false, cable: false, machine: false },
        profile: { firstName: '', age: '', locationCity: '', locationState: '', goals: '', injuries: '' },
        profileImage: { dataUrl: null },
        bbDefaultsSet: false
      };
    }

    function clearTrainingClientStorage({ keepIntake = false } = {}) {
      try {
        localStorage.removeItem(UNAVAIL_DAYS_KEY);
        if (!keepIntake) {
          localStorage.removeItem(TRAINING_INTAKE_KEY);
          localStorage.removeItem(`${TRAINING_INTAKE_KEY}_history`);
          localStorage.removeItem('ode_training_intake_history_v2');
        }
        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
          const key = localStorage.key(i);
          if (key && key.startsWith('ode_training_upsell_dismissed_')) localStorage.removeItem(key);
        }
      } catch {
        // ignore
      }

      try {
        for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('ode_training_')) sessionStorage.removeItem(key);
        }
      } catch {
        // ignore
      }
    }

  function stashIntakeForRestart() {
      const key = TRAINING_INTAKE_KEY;
      let intake = null;
      try {
        intake = JSON.parse(localStorage.getItem(key) || 'null');
      } catch {
        intake = null;
      }
      const planMeta = planRow?.plan?.meta || {};
      const fallback = {};

      const exp = String(planMeta.experience || '').toLowerCase();
      if (exp === 'advanced') fallback.experience = '5y+';
      else if (exp === 'intermediate') fallback.experience = '2-5y';
      else if (exp === 'beginner') fallback.experience = '6-24m';

      if (planMeta.daysPerWeek) fallback.daysPerWeek = Number(planMeta.daysPerWeek) || null;
      if (planMeta.timePerSession) fallback.sessionLength = String(planMeta.timePerSession);
      if (Array.isArray(planMeta.emphasis) && planMeta.emphasis.length) {
        fallback.focus = planMeta.emphasis.map((v) => String(v));
      }
      if (planMeta.equipmentStylePref) fallback.loadStyle = planMeta.equipmentStylePref;

      const nextIntake = {
        ...(intake && typeof intake === 'object' ? intake : {}),
        ...fallback
      };
      nextIntake.step = 1;
      if (nextIntake.completedAt) delete nextIntake.completedAt;
      try {
        localStorage.setItem(key, JSON.stringify({ ...nextIntake, updatedAt: new Date().toISOString() }));
      } catch {
        // ignore
      }
    }

    async function resolveJoinedSharedOwnersForReset() {
      const out = [];
      const seen = new Set();

      const pushOwner = (row) => {
        const id = String(row?.id || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        out.push({
          id,
          displayName: String(row?.displayName || row?.username || 'owner').trim() || 'owner',
          username: String(row?.username || '').trim() || null
        });
      };

      // Local state first (fast path).
      const localMembers = Array.isArray(shareUi.connectedMembers) ? shareUi.connectedMembers : [];
      for (const member of localMembers) {
        if (String(member?.relation || '').trim() !== 'incoming-owner') continue;
        pushOwner(member);
      }

      // Server truth for correctness.
      try {
        const outgoing = await api('/api/training/share/outgoing', { method: 'GET' });
        if (outgoing.ok && outgoing.json?.ok) {
          syncShareOutgoingState(outgoing.json);
          const joinedFromUsers = Array.isArray(outgoing.json?.joinedFromUsers) ? outgoing.json.joinedFromUsers : [];
          for (const owner of joinedFromUsers) pushOwner(owner);
        }
      } catch {
        // ignore; local state fallback still works
      }

      return out;
    }

    async function resetTrainingPlanAndRestart() {
      const confirmFn = typeof window.odeConfirm === 'function' ? window.odeConfirm : null;

      const openRestartSetup = () => {
        try {
          sessionStorage.removeItem('ode_training_force_autostart');
          sessionStorage.removeItem(TRAINING_CONSTRUCTING_KEY);
        } catch {
          // ignore
        }
        window.location.href = 'training-coming-soon.html';
      };

      if (isPreview || !state.auth.user) {
        stashIntakeForRestart();
        clearTrainingClientStorage({ keepIntake: true });
        state.profile = null;
        state.planRow = null;
        state.logs = [];
        state.planError = null;
        state.wizard = makeDefaultWizard();
        window.location.href = 'training-coming-soon.html';
        return;
      }

      const joinedOwners = await resolveJoinedSharedOwnersForReset();
      if (joinedOwners.length > 0) {
        const ownerName = String(joinedOwners[0]?.displayName || joinedOwners[0]?.username || 'the owner').trim() || 'the owner';
        const confirmMessage = `Are you sure?\nYou will be removed from ${ownerName}'s current workout if you continue.\nThen you will start your own new workout setup.`;
        let ok = false;
        if (confirmFn) {
          ok = await confirmFn({
            title: 'Leave current shared workout?',
            message: confirmMessage,
            confirmText: 'Continue',
            cancelText: 'Cancel',
            danger: true
          });
        } else {
          ok = window.confirm(confirmMessage);
        }
        if (!ok) return;

        for (const owner of joinedOwners) {
          const ownerUserId = String(owner?.id || '').trim();
          if (!ownerUserId) continue;
          const leaveResp = await api('/api/training/share/leave', {
            method: 'POST',
            body: JSON.stringify({ ownerUserId })
          });
          if (!leaveResp.ok && leaveResp.status !== 404) {
            state.planError = leaveResp.json?.error || 'Could not leave current shared workout.';
            setView('plan');
            return;
          }
        }
      }

      const resp = await api('/api/training/reset', { method: 'POST', body: JSON.stringify({}) });
      if (!resp.ok) {
        state.planError = resp.json?.error || 'Could not reset training data.';
        setView('plan');
        return;
      }

      stashIntakeForRestart();
      clearTrainingClientStorage({ keepIntake: true });
      state.profile = null;
      state.planRow = null;
      state.logs = [];
      state.planError = null;
      state.wizard = makeDefaultWizard();
      openRestartSetup();
    }

    function startOverAfterGenerationFailure() {
      clearWorkoutGenerationState({ cancelRequest: true, clearFlags: true, clearWizardOnly: true });
      clearAutoRetryPause();
      state.planRow = null;
      state.logs = [];
      state.allLogs = [];
      state.planError = null;
      stashIntakeForRestart();
      try { sessionStorage.removeItem('ode_training_intake_handoff'); } catch {}
      window.location.href = 'training-coming-soon.html?restart=1';
    }

    const logsMap = buildLogsMap(state.logs);

    const today = new Date();
    const defaultWeek = weekIndexForDate(today, plan);
    let activeWeek = Number(readTrainingPlanNavValue('week', {
      planId: state.planRow?.id,
      legacyKey: LEGACY_TRAINING_WEEK_KEY
    }));
    if (!Number.isFinite(activeWeek) || activeWeek <= 0) activeWeek = defaultWeek;
    activeWeek = Math.max(1, Math.min(plan.weeks.length, activeWeek));

    const autoreg = plan?.meta?.autoreg && typeof plan.meta.autoreg === 'object' ? plan.meta.autoreg : {};
    const deloadWeeks = Array.isArray(autoreg?.deloadWeeks)
      ? autoreg.deloadWeeks.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];
    const isDeloadWeek = deloadWeeks.includes(activeWeek);
    const lastDecisionByBase = autoreg?.lastDecision && typeof autoreg.lastDecision === 'object' ? autoreg.lastDecision : {};

    const escapeHtml = (input) => String(input ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const applyScheduleChange = ({ unavailableDays, effectiveDate }) => {
      const meta = plan.meta && typeof plan.meta === 'object' ? plan.meta : {};
      const schedule = meta.schedule && typeof meta.schedule === 'object' ? { ...meta.schedule } : {};
      const normalized = normalizeWeekdayIndexList(unavailableDays);
      if (effectiveDate) {
        schedule.pendingChange = {
          effectiveDate: toISODateLocal(effectiveDate),
          unavailableDays: normalized
        };
      } else {
        schedule.unavailableDays = normalized;
        schedule.pendingChange = null;
        try {
          localStorage.setItem(UNAVAIL_DAYS_KEY, JSON.stringify(normalized));
        } catch {
          // ignore
        }
      }
      plan.meta = { ...meta, schedule };
      render();
    };

    const openScheduleChangeModal = () => {
      if (document.getElementById('schedule-change-modal')) return;
      const daysPerWeek = Number(plan?.meta?.daysPerWeek) || 1;
      const currentSchedule = scheduleWeekdays(daysPerWeek, new Date());
      const selected = new Set(currentSchedule);
      const today = dayStart(new Date());
      let effectMode = 'now';
      let pickedDate = '';

      const modalError = el('div', { class: 'schedule-modal-error' });
      const selectionCount = el('div', { class: 'training-muted', style: 'margin-top:0.35rem' }, `Selected ${selected.size}/${daysPerWeek} days`);

      const updateSelectionCount = () => {
        selectionCount.textContent = `Selected ${selected.size}/${daysPerWeek} days`;
      };

      const dayGrid = el('div', { class: 'schedule-day-grid' },
        WEEKDAYS.map((label, idx) =>
          el('label', { class: 'training-badge schedule-day-chip' },
            el('input', {
              type: 'checkbox',
              checked: selected.has(idx) ? 'true' : null,
              onchange: (e) => {
                if (e.target.checked) selected.add(idx);
                else selected.delete(idx);
                updateSelectionCount();
              }
            }),
            label
          )
        )
      );

      const dateInput = el('input', {
        type: 'date',
        class: 'schedule-date-input',
        disabled: 'true',
        onchange: (e) => { pickedDate = String(e.target.value || '').trim(); }
      });

      const modeNow = el('label', { class: 'schedule-mode' },
        el('input', {
          type: 'radio',
          name: 'schedule_effect',
          checked: 'true',
          onchange: () => {
            effectMode = 'now';
            dateInput.setAttribute('disabled', 'true');
          }
        }),
        el('span', null, 'Now')
      );

      const modeDate = el('label', { class: 'schedule-mode' },
        el('input', {
          type: 'radio',
          name: 'schedule_effect',
          onchange: () => {
            effectMode = 'date';
            dateInput.removeAttribute('disabled');
          }
        }),
        el('span', null, 'Pick a date')
      );

      const close = () => {
        try { overlay.remove(); } catch { /* ignore */ }
      };

      const handleSubmit = () => {
        modalError.textContent = '';
        if (selected.size !== daysPerWeek) {
          modalError.textContent = `Select exactly ${daysPerWeek} day${daysPerWeek === 1 ? '' : 's'} to match your plan.`;
          return;
        }
        const unavailable = WEEKDAYS.map((_, idx) => idx).filter((idx) => !selected.has(idx));
        if (effectMode === 'date') {
          const parsed = parseISODateLocal(pickedDate);
          if (!parsed) {
            modalError.textContent = 'Pick a valid date for the schedule change.';
            return;
          }
          const effective = dayStart(parsed);
          if (effective.getTime() <= today.getTime()) {
            applyScheduleChange({ unavailableDays: unavailable, effectiveDate: null });
          } else {
            applyScheduleChange({ unavailableDays: unavailable, effectiveDate: effective });
          }
        } else {
          applyScheduleChange({ unavailableDays: unavailable, effectiveDate: null });
        }
        close();
      };

      const overlay = el('div', { class: 'schedule-modal', id: 'schedule-change-modal', role: 'dialog', 'aria-modal': 'true' },
        el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close schedule change' }),
        el('div', { class: 'schedule-modal-card' },
          el('div', { class: 'schedule-modal-head' },
            el('div', { class: 'schedule-modal-title' }, 'Change workout days'),
            el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close schedule change' }, '×')
          ),
          el('div', { class: 'schedule-modal-body' },
            el('div', { class: 'auth-label' }, 'What days do you want to workout now?'),
            el('div', { class: 'training-muted' }, `Pick ${daysPerWeek} days to match your ${daysPerWeek}-day plan.`),
            dayGrid,
            selectionCount,
            el('div', { class: 'training-divider', style: 'margin: 1rem 0' }),
            el('div', { class: 'auth-label' }, 'When does this take effect?'),
            el('div', { class: 'schedule-mode-row' }, modeNow, modeDate),
            dateInput,
            modalError
          ),
          el('div', { class: 'schedule-modal-actions' },
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: close }, 'Cancel'),
            el('button', { type: 'button', class: 'btn btn-primary', onclick: handleSubmit }, 'Submit')
          )
        )
      );

      overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', close);
      overlay.querySelector('.schedule-modal-close')?.addEventListener('click', close);
      document.body.appendChild(overlay);
    };

    const pendingSchedule = plan?.meta?.schedule?.pendingChange && typeof plan.meta.schedule.pendingChange === 'object'
      ? plan.meta.schedule.pendingChange
      : null;
    const pendingLabel = pendingSchedule?.effectiveDate ? `Schedule change set for ${pendingSchedule.effectiveDate}.` : null;

    const printSimplePlanPdf = () => {
      const daysPerWeek = Number(plan?.meta?.daysPerWeek) || (Array.isArray(plan?.weeks?.[0]?.days) ? plan.weeks[0].days.length : 1);
      const week = plan.weeks.find((w) => Number(w.index) === activeWeek) || plan.weeks[0];
      const days = Array.isArray(week?.days) ? week.days : [];
      const schedule = scheduleWeekdays(daysPerWeek, activeDate);

      const discipline = String(plan.meta?.discipline || '').toUpperCase();
      const experience = String(plan.meta?.experience || '').toUpperCase();
      const intake = readLocalIntake() || state.profile?.training_intake || null;
      const profileStrength = state.profile?.strength || {};
      const baselines = plan?.baselines && typeof plan.baselines === 'object' ? plan.baselines : {};
      const bodyweight = Number(profileStrength?.bodyweight ?? intake?.weightLb ?? baselines?.bodyweight ?? baselines?.trainingMax?.bodyweight);
      const tm = baselines?.trainingMax || {};
      const bbMoves = baselines?.bodybuilding?.movements || {};
      const pressMove = String(bbMoves.press || state.wizard?.strength?.pressMovement || 'Bench Press');
      const pullMove = String(bbMoves.pull || state.wizard?.strength?.pullMovement || 'Weighted Pull-up');
      const legMove = String(bbMoves.leg || state.wizard?.strength?.legMovement || 'Back Squat');
      const pressEst = Number(baselines?.press1rm);
      const pullEst = Number(baselines?.pull1rm);
      const legEst = Number(baselines?.leg1rm);
      const hingeEst = Number(baselines?.hinge1rm);

      const listText = (value, fallback = '—') => {
        if (Array.isArray(value)) {
          const parts = value.map((item) => String(item || '').trim()).filter(Boolean);
          return parts.length ? parts.join(', ') : fallback;
        }
        const text = String(value || '').trim();
        return text || fallback;
      };
      const resolvedPreferredDays = Array.isArray(plan?.schedule)
        ? plan.schedule.map((entry) => String(entry?.day || '').trim()).filter(Boolean)
        : [];
      const intakePreferredDays = Array.isArray(intake?.preferredDays) ? intake.preferredDays : [];
      const preferredDays = intakePreferredDays.length === daysPerWeek
        ? intakePreferredDays
        : (Array.isArray(plan?.meta?.militaryHybrid?.preferredDaysResolved) && plan.meta.militaryHybrid.preferredDaysResolved.length
          ? plan.meta.militaryHybrid.preferredDaysResolved
          : (Array.isArray(plan?.meta?.schedule?.preferredDays) && plan.meta.schedule.preferredDays.length === daysPerWeek
            ? plan.meta.schedule.preferredDays
            : resolvedPreferredDays));
      const painAreas = Array.isArray(intake?.injuries) ? intake.injuries : [];
      const painDetailText = (() => {
        const detail = intake?.injuryDetails && typeof intake.injuryDetails === 'object' ? intake.injuryDetails : {};
        const parts = painAreas.map((area) => {
          const raw = detail?.[area] && typeof detail[area] === 'object' ? detail[area] : null;
          const severity = Number(raw?.severity);
          const recency = String(raw?.recency || '').trim();
          if (Number.isFinite(severity) && recency) return `${area} (${severity}/10, ${recency})`;
          if (Number.isFinite(severity)) return `${area} (${severity}/10)`;
          return String(area || '').trim();
        }).filter(Boolean);
        return parts.length ? parts.join(', ') : 'None';
      })();

      const stats = [];
      if (Number.isFinite(bodyweight) && bodyweight > 0) stats.push({ k: 'Current weight', v: `${bodyweight} lb` });
      stats.push({ k: 'Discipline', v: discipline || '—' });
      stats.push({ k: 'Skill level', v: experience || '—' });
      stats.push({ k: 'Days / week', v: String(daysPerWeek) });

      if (discipline === 'POWERLIFTING') {
        const squat = Number(tm?.squat);
        const bench = Number(tm?.bench);
        const dead = Number(tm?.deadlift);
        if (Number.isFinite(squat)) stats.push({ k: 'Squat max', v: `${Math.round(squat)} lb` });
        if (Number.isFinite(bench)) stats.push({ k: 'Bench max', v: `${Math.round(bench)} lb` });
        if (Number.isFinite(dead)) stats.push({ k: 'Deadlift max', v: `${Math.round(dead)} lb` });
      } else {
        if (Number.isFinite(pressEst)) stats.push({ k: `${pressMove} max`, v: `${Math.round(pressEst)} lb` });
        if (Number.isFinite(pullEst)) stats.push({ k: `${pullMove} max`, v: `${Math.round(pullEst)} lb` });
        if (Number.isFinite(legEst)) stats.push({ k: `${legMove} max`, v: `${Math.round(legEst)} lb` });
      }

      const daySections = days.map((day, idx) => {
        const dayIndex = idx + 1;
        const weekday = scheduledWeekdayLabel(dayIndex, daysPerWeek, activeDate);
        const label = weekday ? `${weekday} • Day ${dayIndex}` : `Day ${dayIndex}`;
        const focus = day?.focus ? ` • ${escapeHtml(day.focus)}` : '';
        const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
        const rows = exercises.map((ex) => {
          const name = escapeHtml(ex?.displayName || ex?.name || 'Exercise');
          const sets = Number(ex?.sets) || '';
          const reps = escapeHtml(ex?.reps || '');
          const rest = fmtRest(ex?.restSec || ex?.rest);
          const meta = `${sets} x ${reps}${rest && rest !== '—' ? ` • Rest ${rest}` : ''}`;
          return `<div class="pdf-ex-row"><span class="pdf-ex-name">${name}</span><span class="pdf-ex-meta">${escapeHtml(meta)}</span></div>`;
        }).join('');

        return `
          <section class="pdf-day">
            <div class="pdf-day-head">${label}${focus}</div>
            ${rows || '<div class="pdf-empty">No exercises listed.</div>'}
          </section>
        `;
      }).join('');

      const title = `Training Plan • Week ${activeWeek}`;
      const statsHtml = stats.map((row) =>
        `<div class="pdf-stat"><span class="pdf-stat-k">${escapeHtml(row.k)}</span><span class="pdf-stat-v">${escapeHtml(row.v)}</span></div>`
      ).join('');
      const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Space Grotesk", Arial, sans-serif; margin: 24px; color: #171412; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .pdf-sub { color: #5a524c; font-size: 12px; margin-bottom: 10px; }
    .pdf-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin-bottom: 18px; }
    .pdf-stat { display: flex; justify-content: space-between; gap: 10px; padding: 6px 8px; border-radius: 8px; background: #f6f1ec; border: 1px solid #e7ded6; font-size: 12px; }
    .pdf-stat-k { color: #5a524c; font-weight: 600; }
    .pdf-stat-v { font-weight: 700; }
    .pdf-day { border: 1px solid #e3d9cf; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; break-inside: avoid; }
    .pdf-day-head { font-weight: 700; margin-bottom: 8px; }
    .pdf-ex-row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-top: 1px dashed #e7ded6; font-size: 12.5px; }
    .pdf-ex-row:first-of-type { border-top: 0; }
    .pdf-ex-name { font-weight: 600; }
    .pdf-ex-meta { color: #5a524c; text-align: right; white-space: nowrap; }
    .pdf-empty { font-size: 12px; color: #5a524c; font-style: italic; }
    @media print {
      body { margin: 12mm; }
      .pdf-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .pdf-day { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="pdf-sub">${escapeHtml(discipline)} • ${daysPerWeek} days/week • ${escapeHtml(experience)}</div>
  <div class="pdf-stats">${statsHtml}</div>
  ${daySections}
</body>
</html>`;

      const win = window.open('', '_blank');
      if (!win) {
        state.planError = 'Allow pop-ups to export the PDF.';
        render();
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try { win.print(); } catch { /* ignore */ }
      }, 250);
    };

    const printSimplePlanPdfV2 = () => {
      const daysPerWeek = Number(plan?.meta?.daysPerWeek) || (Array.isArray(plan?.weeks?.[0]?.days) ? plan.weeks[0].days.length : 1);
      const week = plan.weeks.find((w) => Number(w.index) === activeWeek) || plan.weeks[0];
      const days = Array.isArray(week?.days) ? week.days : [];
      const discipline = String(plan?.meta?.discipline || '').toUpperCase();
      const experience = String(plan?.meta?.experience || '').toUpperCase();
      const intake = readLocalIntake() || state.profile?.training_intake || null;
      const baselines = plan?.baselines && typeof plan.baselines === 'object' ? plan.baselines : {};

      const listText = (value, fallback = '—') => {
        if (Array.isArray(value)) {
          const parts = value.map((item) => String(item || '').trim()).filter(Boolean);
          return parts.length ? parts.join(', ') : fallback;
        }
        const text = String(value || '').trim();
        return text || fallback;
      };
      const resolvedPreferredDays = Array.isArray(plan?.schedule)
        ? plan.schedule.map((entry) => String(entry?.day || '').trim()).filter(Boolean)
        : [];
      const intakePreferredDays = Array.isArray(intake?.preferredDays) ? intake.preferredDays : [];
      const preferredDays = intakePreferredDays.length === daysPerWeek
        ? intakePreferredDays
        : (Array.isArray(plan?.meta?.militaryHybrid?.preferredDaysResolved) && plan.meta.militaryHybrid.preferredDaysResolved.length
          ? plan.meta.militaryHybrid.preferredDaysResolved
          : (Array.isArray(plan?.meta?.schedule?.preferredDays) && plan.meta.schedule.preferredDays.length === daysPerWeek
            ? plan.meta.schedule.preferredDays
            : resolvedPreferredDays));
      const painAreas = Array.isArray(intake?.injuries) ? intake.injuries : [];
      const painDetailText = (() => {
        const detail = intake?.injuryDetails && typeof intake.injuryDetails === 'object' ? intake.injuryDetails : {};
        const parts = painAreas.map((area) => {
          const raw = detail?.[area] && typeof detail[area] === 'object' ? detail[area] : null;
          const severity = Number(raw?.severity);
          const recency = String(raw?.recency || '').trim();
          if (Number.isFinite(severity) && recency) return `${area} (${severity}/10, ${recency})`;
          if (Number.isFinite(severity)) return `${area} (${severity}/10)`;
          return String(area || '').trim();
        }).filter(Boolean);
        return parts.length ? parts.join(', ') : 'None';
      })();

      const summary = [
        { k: 'Discipline', v: discipline || 'Not provided' },
        { k: 'Skill level', v: experience || 'Not provided' },
        { k: 'Days / week', v: String(daysPerWeek || 'Not provided') },
        { k: 'Preferred days', v: listText(preferredDays) },
        { k: 'Session length', v: listText(intake?.sessionLength) },
        { k: 'Location', v: listText(intake?.location) },
        { k: 'Equipment', v: listText(intake?.equipment) },
        { k: 'Training style', v: listText(intake?.loadStyle) },
        { k: 'Priority groups', v: listText(intake?.focus) },
        { k: 'Pain areas', v: painDetailText },
        { k: 'Avoid moves', v: listText(intake?.avoidMoves, 'None') },
        { k: 'Close to failure', v: listText(intake?.trainToFailure) },
        { k: 'Sleep', v: Number.isFinite(Number(intake?.sleepHours)) ? `${Math.round(Number(intake.sleepHours))} hrs/night` : 'Not provided' },
        { k: 'Activity', v: listText(intake?.activityLevel) }
      ];

      const statsHtml = summary.map((row) =>
        `<div class="pdf-stat"><span class="pdf-stat-k">${escapeHtml(row.k)}</span><span class="pdf-stat-v">${escapeHtml(row.v)}</span></div>`
      ).join('');

      const daySections = days.map((day, idx) => {
        const dayIndex = idx + 1;
        const weekday = scheduledWeekdayLabel(dayIndex, daysPerWeek, activeDate);
        const label = weekday ? `${weekday} • Day ${dayIndex}` : `Day ${dayIndex}`;
        const focus = day?.focus ? ` • ${escapeHtml(day.focus)}` : '';
        const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
        const rows = exercises.map((ex) => {
          const name = escapeHtml(ex?.displayName || ex?.name || 'Exercise');
          const sets = Number(ex?.sets) || '';
          const reps = escapeHtml(ex?.reps || '');
          const rest = fmtRest(ex?.restSec || ex?.rest);
          const meta = `${sets} x ${reps}${rest && rest !== '—' ? ` • Rest ${rest}` : ''}`;
          return `<div class="pdf-ex-row"><span class="pdf-ex-name">${name}</span><span class="pdf-ex-meta">${escapeHtml(meta)}</span></div>`;
        }).join('');
        return `
          <section class="pdf-day">
            <div class="pdf-day-head">${label}${focus}</div>
            ${rows || '<div class="pdf-empty">No exercises listed.</div>'}
          </section>
        `;
      }).join('');

      const title = `Training Plan • Week ${activeWeek}`;
      const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Space Grotesk", Arial, sans-serif; margin: 24px; color: #171412; background: #fff; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .pdf-sub { color: #5a524c; font-size: 12px; margin-bottom: 14px; }
    .pdf-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 8px; margin-bottom: 16px; }
    .pdf-stat { display: grid; gap: 2px; padding: 7px 8px; border-radius: 9px; background: #f6f1ec; border: 1px solid #e7ded6; font-size: 10.5px; min-height: 42px; }
    .pdf-stat-k { color: #5a524c; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
    .pdf-stat-v { font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
    .pdf-day { border: 1px solid #e3d9cf; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; break-inside: avoid; }
    .pdf-day-head { font-weight: 700; margin-bottom: 8px; }
    .pdf-ex-row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-top: 1px dashed #e7ded6; font-size: 12.5px; }
    .pdf-ex-row:first-of-type { border-top: 0; }
    .pdf-ex-name { font-weight: 600; }
    .pdf-ex-meta { color: #5a524c; text-align: right; white-space: nowrap; }
    .pdf-empty { font-size: 12px; color: #5a524c; font-style: italic; }
    @media print {
      body { margin: 12mm; }
      .pdf-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .pdf-day { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="pdf-sub">${escapeHtml(discipline)} • ${daysPerWeek} days/week • ${escapeHtml(experience)}</div>
  <div class="pdf-stats">${statsHtml}</div>
  ${daySections}
</body>
</html>`;

      const win = window.open('', '_blank');
      if (!win) {
        state.planError = 'Allow pop-ups to export the PDF.';
        render();
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try { win.print(); } catch { /* ignore */ }
      }, 250);
    };

    const complexPdfListText = (value, fallback = '—') => {
      if (Array.isArray(value)) {
        const parts = value.map((item) => String(item || '').trim()).filter(Boolean);
        return parts.length ? parts.join(', ') : fallback;
      }
      const text = String(value || '').trim();
      return text || fallback;
    };

    const complexPdfFirst = (...values) => {
      for (const value of values) {
        if (Array.isArray(value) && value.length) return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (value && typeof value === 'object' && Object.keys(value).length) return value;
        if (String(value || '').trim()) return value;
      }
      return null;
    };

    const complexPdfRequestedWeeks = (timelineRaw = '', actualWeeks = 8) => {
      const text = String(timelineRaw || '').trim().toLowerCase();
      if (text.startsWith('4')) return 4;
      if (text.startsWith('8')) return 8;
      if (text.startsWith('10')) return 10;
      if (text.includes('12')) return 12;
      const actual = Number(actualWeeks);
      return Number.isFinite(actual) && actual > 0 ? actual : 8;
    };

    const complexPdfFormatStarter = (weight, reps) => {
      const load = Number(weight);
      const repText = String(reps || '').trim();
      if (Number.isFinite(load) && load > 0 && repText) return `${Math.round(load)} lb x ${repText}`;
      if (Number.isFinite(load) && load > 0) return `${Math.round(load)} lb`;
      if (repText) return repText;
      return 'Not provided';
    };

    const complexPdfPriorityMatch = (exercise, priorities = []) => {
      const raw = [
        exercise?.displayName,
        exercise?.name,
        exercise?.muscleTarget,
        exercise?.bodyPart,
        exercise?.muscle_group,
        exercise?.muscleGroup,
        exercise?.category,
        exercise?.movementPattern,
        exercise?.pattern,
        ...(Array.isArray(exercise?.primaryMuscles) ? exercise.primaryMuscles : []),
        ...(Array.isArray(exercise?.secondaryMuscles) ? exercise.secondaryMuscles : []),
        ...(Array.isArray(exercise?.muscleKeys) ? exercise.muscleKeys : [])
      ].map((value) => normalizeName(value)).filter(Boolean).join(' ');
      return (Array.isArray(priorities) ? priorities : []).filter((priority) => {
        const p = normalizeName(priority);
        if (!p) return false;
        if (p === 'arms') return /\b(biceps|triceps|curl|pushdown|extension|skull crusher)\b/.test(raw);
        if (p === 'shoulders') return /\b(shoulder|delt|lateral raise|rear delt|overhead press)\b/.test(raw);
        if (p === 'legs') return /\b(quad|leg|squat|split squat|lunge|leg extension|leg press)\b/.test(raw);
        if (p === 'glutes') return /\b(glute|hip thrust|bridge|hinge|rdl|romanian deadlift|pull through)\b/.test(raw);
        if (p === 'core') return /\b(core|ab|abs|plank|pallof|crunch|dead bug|leg raise|oblique)\b/.test(raw);
        if (p === 'calves') return /\bcalf\b/.test(raw);
        if (p === 'chest') return /\b(chest|bench|press|fly)\b/.test(raw);
        if (p === 'back') return /\b(back|row|pull|pulldown|lat|rear delt)\b/.test(raw);
        return raw.includes(p);
      });
    };

    const complexPdfExerciseRole = (exercise, index, priorities = [], painAreas = []) => {
      const family = decisionMovementFamilyForName(
        exercise?.displayName || exercise?.name,
        exercise?.family || exercise?.movementPattern || exercise?.pattern || ''
      );
      const matchedPriorities = complexPdfPriorityMatch(exercise, priorities);
      const name = normalizeName(exercise?.displayName || exercise?.name);
      const hasPainContext = Array.isArray(painAreas) && painAreas.length > 0;
      const painSafeCandidate = hasPainContext && /chest supported|supported row|machine chest press|landmine|leg curl|hamstring curl|hip thrust|glute bridge|split squat|goblet squat|pull through|pallof|dead bug|reverse crunch/.test(name);
      const compoundFamily = new Set(['chest_press', 'shoulder_press', 'horizontal_pull', 'vertical_pull', 'squat_pattern', 'hinge_pattern']);
      if (painSafeCandidate && index > 0) return { role: 'Pain-safe substitute', badge: 'pain-safe', matchedPriorities };
      if (index === 0 && compoundFamily.has(family)) return { role: 'Strength anchor', badge: 'anchor', matchedPriorities };
      if (index <= 1 && compoundFamily.has(family)) return { role: 'Secondary compound', badge: 'compound', matchedPriorities };
      if (family === 'core_rotation' || family === 'core_stability' || family === 'core_flexion') return { role: 'Core / stability', badge: 'core', matchedPriorities };
      if (family === 'calves') return { role: 'Calves / small muscle', badge: 'small', matchedPriorities };
      if (matchedPriorities.length) return { role: 'Priority accessory', badge: 'priority', matchedPriorities };
      return { role: 'Hypertrophy accessory', badge: 'hypertrophy', matchedPriorities };
    };

    const complexPdfExerciseNote = (exercise, roleInfo, context = {}) => {
      const matched = Array.isArray(roleInfo?.matchedPriorities) ? roleInfo.matchedPriorities : [];
      const priorityLabel = matched[0] || '';
      const family = decisionMovementFamilyForName(
        exercise?.displayName || exercise?.name,
        exercise?.family || exercise?.movementPattern || exercise?.pattern || ''
      );
      const familyCue = (() => {
        if (family === 'hamstring_curl' || family === 'hinge_pattern') return 'This builds posterior-chain strength without wasting effort on sloppy reps.';
        if (family === 'knee_extension' || family === 'squat_pattern') return 'This targets the knee-dominant lower-body pattern and should stay controlled from top to bottom.';
        if (family === 'calves') return 'This directly supports calf development. Use a full stretch and a clean top position.';
        if (family === 'core_flexion' || family === 'core_rotation' || family === 'core_stability') return 'This supports trunk strength and direct core development so heavier lifts stay more stable.';
        if (family === 'lateral_raise' || family === 'rear_delt') return 'This protects shoulder development through lateral and rear-delt work instead of only adding more pressing fatigue.';
        if (family === 'biceps_curl') return 'This directly trains biceps. Control the elbow position and own the squeeze at the top.';
        if (family === 'triceps_extension') return 'This directly trains triceps so pressing strength and upper-arm size keep moving together.';
        if (family === 'horizontal_pull' || family === 'vertical_pull') return 'This supports back development and upper-body balance so pressing work stays more stable.';
        if (family === 'chest_press' || family === 'chest_fly') return 'This supports chest development with cleaner hypertrophy work than another heavy press slot.';
        return '';
      })();
      if (roleInfo?.role === 'Strength anchor') return 'Keep setup and bar path repeatable. Use the final set as feedback for whether reps or load should move next week.';
      if (roleInfo?.role === 'Secondary compound') return 'This supports the main pattern with more hypertrophy value and less technical demand than the anchor.';
      if (roleInfo?.role === 'Priority accessory') return priorityLabel ? `This directly supports your ${priorityLabel.toLowerCase()} priority. ${familyCue || 'Chase clean tension instead of noisy reps.'}` : (familyCue || 'This is protected priority volume. Stay controlled and keep the target muscle doing the work.');
      if (roleInfo?.role === 'Core / stability') return 'Use this to improve trunk stiffness and position control so heavier work stays cleaner and safer.';
      if (roleInfo?.role === 'Calves / small muscle') return 'Full range and crisp tempo matter more here than chasing heavy load.';
      if (roleInfo?.role === 'Pain-safe substitute') return 'This variation keeps the training effect while reducing stress on a sensitive joint or pattern.';
      return familyCue || 'Treat this as productive hypertrophy work: smooth tempo, stable setup, and stop before technique turns sloppy.';
    };

    const complexPdfWeekPhase = (weekNumber, projection = null) => {
      const deloadSet = new Set(Array.isArray(projection?.deloadWeeks) ? projection.deloadWeeks.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : []);
      if (deloadSet.has(Number(weekNumber))) return 'Reduced-fatigue week';
      if (weekNumber === 1) return 'Baseline week';
      if (weekNumber === 2) return 'Add reps where earned';
      if (weekNumber === 3) return 'Progress reps or load';
      if (weekNumber === 4) return 'Fatigue check';
      if (weekNumber <= 7) return 'Build phase';
      if (weekNumber <= 9) return 'Push phase';
      if (weekNumber <= 12) return 'Intensification / performance check';
      return 'Continue progression';
    };

    const complexPdfBuildContext = () => {
      const intake = readLocalIntake() || state.profile?.training_intake || null;
      const normalized = mapIntakeToOblueprintPayload(intake) || {};
      const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
      const activePlanWeek = weeks.find((entry) => Number(entry?.index) === Number(activeWeek)) || weeks[0] || { index: 1, days: [] };
      const profileStrength = state.profile?.strength || {};
      const baselines = plan?.baselines && typeof plan.baselines === 'object' ? plan.baselines : {};
      const preferredDays = Array.isArray(normalized?.preferredDays) && normalized.preferredDays.length
        ? normalized.preferredDays
        : (Array.isArray(intake?.preferredDays) ? intake.preferredDays : (Array.isArray(plan?.meta?.schedule?.preferredDays) ? plan.meta.schedule.preferredDays : []));
      const priorities = Array.isArray(normalized?.priorityGroups) && normalized.priorityGroups.length
        ? normalized.priorityGroups
        : (Array.isArray(intake?.focus) ? intake.focus.map((value) => String(value || '').trim()).filter(Boolean) : []);
      const painAreas = Array.isArray(normalized?.painAreas) && normalized.painAreas.length
        ? normalized.painAreas
        : (Array.isArray(intake?.injuries) ? intake.injuries.map((value) => String(value || '').trim()).filter(Boolean) : []);
      const painProfiles = normalized?.painProfilesByArea && typeof normalized.painProfilesByArea === 'object'
        ? normalized.painProfilesByArea
        : (intake?.injuryDetails && typeof intake.injuryDetails === 'object' ? intake.injuryDetails : {});
      const equipmentAccess = Array.isArray(normalized?.equipmentAccess) && normalized.equipmentAccess.length
        ? normalized.equipmentAccess
        : (Array.isArray(intake?.equipment) ? intake.equipment.map((value) => String(value || '').trim()).filter(Boolean) : []);
      const movementsToAvoid = Array.isArray(normalized?.movementsToAvoid) && normalized.movementsToAvoid.length
        ? normalized.movementsToAvoid
        : (Array.isArray(intake?.avoidMoves) ? intake.avoidMoves.map((value) => String(value || '').trim()).filter(Boolean) : []);
      const daysPerWeek = Number(plan?.meta?.daysPerWeek) || Number(normalized?.daysPerWeek) || (Array.isArray(activePlanWeek?.days) ? activePlanWeek.days.length : 1) || 1;
      const disciplineRaw = String(normalized?.discipline || plan?.meta?.discipline || '').trim().toLowerCase();
      const trainingFeel = String(normalized?.trainingFeel || plan?.meta?.trainingFeel || (disciplineRaw === 'powerbuilding' ? 'Powerbuilding' : 'Aesthetic bodybuilding')).trim() || 'Training';
      const isPowerbuilding = trainingFeel.toLowerCase().includes('power');
      const focus = String(normalized?.focus || intake?.priority || '').trim() || (isPowerbuilding ? 'Strength' : 'Aesthetic');
      const primaryGoal = String(normalized?.primaryGoal || intake?.goal || plan?.meta?.primaryGoal || '').trim() || 'Build size';
      const timeline = String(normalized?.timeline || intake?.timeline || '').trim() || '8 weeks';
      const requestedWeeks = complexPdfRequestedWeeks(timeline, weeks.length || 8);
      const projection = plan?.meta?.progressionProjection && typeof plan.meta.progressionProjection === 'object' ? plan.meta.progressionProjection : null;
      const actualWeeks = weeks.length || 1;
      const sessionLengthMin = String(normalized?.sessionLengthMin || intake?.sessionLength || plan?.meta?.sessionLengthMin || '').trim() || '60';
      const location = String(normalized?.location || intake?.location || '').trim() || 'Commercial gym';
      const trainingStyle = String(normalized?.trainingStyle || intake?.loadStyle || '').trim() || 'Balanced mix';
      const outputStyle = String(normalized?.outputStyle || intake?.outputStyle || '').trim() || 'RPE/RIR cues';
      const closeToFailure = String(normalized?.closeToFailure || intake?.trainToFailure || '').trim() || 'No';
      const sleepHours = complexPdfFirst(normalized?.sleepHours, intake?.sleepHours);
      const activityLevel = String(normalized?.activityLevel || intake?.activityLevel || '').trim() || 'Moderate';
      const stress = String(normalized?.stress || intake?.stress || '').trim() || 'Moderate';
      const fullName = String(
        complexPdfFirst(
          state.auth?.user?.displayName,
          state.auth?.user?.display_name,
          state.profile?.displayName,
          state.profile?.fullName,
          state.profile?.profile?.firstName,
          intake?.profile?.firstName,
          intake?.name,
          state.auth?.user?.username
        ) || ''
      ).trim();
      const athleteName = firstWordName(fullName) || 'Athlete';
      return {
        intake,
        normalized,
        projection,
        activePlanWeek,
        weeks,
        actualWeeks,
        requestedWeeks,
        detailedWeeks: requestedWeeks <= 8 ? weeks.slice(0, Math.min(actualWeeks, requestedWeeks)) : weeks.slice(0, 1),
        detailedMode: requestedWeeks <= 8 ? 'full' : 'template',
        preferredDays,
        priorities,
        painAreas,
        painProfiles,
        equipmentAccess,
        movementsToAvoid,
        daysPerWeek,
        trainingFeel,
        discipline: disciplineRaw === 'powerbuilding' ? 'Powerbuilding' : 'Aesthetic bodybuilding',
        isPowerbuilding,
        focus,
        primaryGoal,
        timeline,
        sessionLengthMin,
        location,
        trainingStyle,
        outputStyle,
        closeToFailure,
        sleepHours,
        activityLevel,
        stress,
        athleteName,
        athleteFullName: fullName || athleteName,
        bodyweight: complexPdfFirst(profileStrength?.bodyweight, normalized?.bodyweight, intake?.weightLb, baselines?.bodyweight),
        benchVariation: String(complexPdfFirst(profileStrength?.benchVariation, normalized?.benchVariation, intake?.benchVariation, profileStrength?.pressMovement, baselines?.bodybuilding?.movements?.press, 'Bench Press') || 'Bench Press'),
        lowerMovement: String(complexPdfFirst(profileStrength?.lowerMovement, normalized?.lowerMovement, intake?.lowerMovement, profileStrength?.legMovement, baselines?.bodybuilding?.movements?.leg, 'Squat Pattern') || 'Squat Pattern'),
        hingeMovement: String(complexPdfFirst(profileStrength?.hingeMovement, normalized?.hingeMovement, intake?.hingeMovement, baselines?.bodybuilding?.movements?.hinge, 'Hinge Pattern') || 'Hinge Pattern'),
        benchWeight: complexPdfFirst(profileStrength?.benchWeight, normalized?.benchWeight, intake?.benchWeight),
        benchReps: complexPdfFirst(profileStrength?.benchReps, normalized?.benchReps, intake?.benchReps),
        lowerWeight: complexPdfFirst(profileStrength?.lowerWeight, normalized?.lowerWeight, intake?.lowerWeight),
        lowerReps: complexPdfFirst(profileStrength?.lowerReps, normalized?.lowerReps, intake?.lowerReps),
        hingeWeight: complexPdfFirst(profileStrength?.hingeWeight, normalized?.hingeWeight, intake?.hingeWeight),
        hingeReps: complexPdfFirst(profileStrength?.hingeReps, normalized?.hingeReps, intake?.hingeReps)
      };
    };

    const printComplexPlanPdf = () => {
      const context = complexPdfBuildContext();
      const todayLabel = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const coverPriorityText = complexPdfListText(context.priorities, 'General development');
      const preferredDayText = complexPdfListText(context.preferredDays, 'Auto-scheduled');
      const painDetailText = context.painAreas.length
        ? context.painAreas.map((area) => {
          const raw = context.painProfiles?.[area] && typeof context.painProfiles[area] === 'object' ? context.painProfiles[area] : null;
          const severity = Number(raw?.severity);
          const recency = String(raw?.recency || '').trim();
          if (Number.isFinite(severity) && recency) return `${area} (${severity}/10, ${recency})`;
          if (Number.isFinite(severity)) return `${area} (${severity}/10)`;
          return String(area || '').trim();
        }).filter(Boolean).join(', ')
        : 'None reported';
      const profileNarrative = context.priorities.length
        ? `${context.athleteName}, your plan was built around ${coverPriorityText}. The week spreads this work across multiple sessions so priorities stay visible without turning the program into junk volume.`
        : `${context.athleteName}, your plan balances main lifts, hypertrophy work, and recovery so the week reads like a real training block instead of a random report.`;
      const coverSubtitle = context.isPowerbuilding ? 'Strength + Muscle Training Block' : 'Hypertrophy Training Block';
      const detailedWeekStart = 1;
      const detailedWeekEnd = Math.min(context.requestedWeeks, 12);
      const strengthSnapshotRows = [
        [context.benchVariation, complexPdfFormatStarter(context.benchWeight, context.benchReps)],
        [context.lowerMovement, complexPdfFormatStarter(context.lowerWeight, context.lowerReps)],
        [context.hingeMovement, complexPdfFormatStarter(context.hingeWeight, context.hingeReps)]
      ].map((row) => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td></tr>`).join('');

      const projectionRowsByWeek = new Map();
      for (const row of Array.isArray(context.projection?.weeklyTable) ? context.projection.weeklyTable : []) {
        const weekNum = Number(row?.week);
        if (!Number.isFinite(weekNum)) continue;
        if (!projectionRowsByWeek.has(weekNum)) projectionRowsByWeek.set(weekNum, []);
        projectionRowsByWeek.get(weekNum).push(row);
      }

      const resolveWeekTemplate = (weekNumber) => context.weeks.find((entry) => Number(entry?.index) === weekNumber) || context.weeks[0] || { days: [] };
      const scheduledLabel = (dayIndex) => scheduledWeekdayLabel(dayIndex, context.daysPerWeek, activeDate) || `Day ${dayIndex}`;
      const strengthDataProvided = [context.benchWeight, context.lowerWeight, context.hingeWeight, context.benchReps, context.lowerReps, context.hingeReps]
        .some((value) => (typeof value === 'number' && Number.isFinite(value) && value > 0) || String(value || '').trim());
      const strengthNarrative = strengthDataProvided
        ? 'Starter strength numbers were used where available to set conservative target loads and progression pacing.'
        : 'Starter strength numbers were not provided, so target loads should be treated as conservative estimates.';
      const customStrategyCopy = (() => {
        const lowerPriorities = context.priorities.map((value) => String(value || '').trim().toLowerCase());
        const parts = [];
        if (lowerPriorities.includes('core')) parts.push('Core is trained through flexion and anti-rotation to support heavy lifts and direct ab development.');
        if (lowerPriorities.includes('shoulders')) parts.push('Shoulders are biased toward lateral and rear-delt work, not just more pressing.');
        if (lowerPriorities.includes('arms')) parts.push('Arms are split across biceps and triceps so volume is spread across the week.');
        if (lowerPriorities.includes('chest')) parts.push('Chest priority uses supportive press and fly work without turning the week into endless benching.');
        if (lowerPriorities.includes('back') || lowerPriorities.includes('glutes')) parts.push('Back and glute work are spread across rows, posterior-chain work, and recovery-safe accessories instead of hinge spam.');
        parts.push('Main lifts stay first so strength is not buried under accessory fatigue.');
        return parts;
      })();
      const coachGreeting = context.athleteName || 'Athlete';
      const inferSplitName = (day = {}, fallbackDayIndex = 1) => {
        const raw = String(day?.focus || day?.name || '').trim();
        if (raw && !/^day\s+\d+$/i.test(raw)) return raw;
        const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
        const families = exercises.map((exercise) => decisionMovementFamilyForName(
          exercise?.displayName || exercise?.name,
          exercise?.family || exercise?.movementPattern || exercise?.pattern || ''
        ));
        const hasLower = families.some((family) => family === 'squat_pattern' || family === 'hinge_pattern' || family === 'hamstring_curl' || family === 'calves');
        const hasPress = families.some((family) => family === 'chest_press' || family === 'shoulder_press' || family === 'triceps_extension');
        const hasPull = families.some((family) => family === 'horizontal_pull' || family === 'vertical_pull' || family === 'biceps_curl');
        if (hasLower) return 'Lower';
        if (hasPress && hasPull) return 'Upper';
        if (hasPress) return 'Push';
        if (hasPull) return 'Pull';
        return `Day ${fallbackDayIndex}`;
      };
      const formatPdfTarget = (exercise, projected) => {
        const family = decisionMovementFamilyForName(
          exercise?.displayName || exercise?.name,
          exercise?.family || exercise?.movementPattern || exercise?.pattern || ''
        );
        if (projected && typeof projected === 'object' && projected.unit === 'bw') return 'Bodyweight';
        if (projected && typeof projected === 'object' && Number.isFinite(projected.value) && projected.value > 0) return `${projected.value} lb`;
        if (/cable/i.test(String(exercise?.displayName || exercise?.name || '')) || family === 'core_rotation') return 'Cable stack';
        if (family === 'core_flexion' || family === 'core_stability') return 'Bodyweight';
        if (family === 'calves' && !Number.isFinite(Number(projected?.value || NaN))) return 'Bodyweight';
        if (family === 'lateral_raise' || family === 'rear_delt' || family === 'biceps_curl' || family === 'triceps_extension') return 'Manual load';
        if (family === 'chest_press' || family === 'horizontal_pull' || family === 'vertical_pull' || family === 'squat_pattern' || family === 'hinge_pattern') return 'Estimate';
        return 'Manual load';
      };
      const shortTableNote = (exercise, roleInfo) => {
        const family = decisionMovementFamilyForName(
          exercise?.displayName || exercise?.name,
          exercise?.family || exercise?.movementPattern || exercise?.pattern || ''
        );
        if (roleInfo?.role === 'Strength anchor') return 'Add reps first.';
        if (roleInfo?.role === 'Secondary compound') return 'Keep form strict.';
        if (roleInfo?.role === 'Priority accessory') return 'Control tempo.';
        if (roleInfo?.role === 'Core / stability') return 'Brace hard.';
        if (roleInfo?.role === 'Calves / small muscle') return 'Full range.';
        if (roleInfo?.role === 'Pain-safe substitute') return 'Use safe range.';
        if (family === 'biceps_curl' || family === 'triceps_extension') return 'Stop 1-2 RIR.';
        return 'Smooth reps.';
      };
      const sectionDivider = (title, subtitle, index) => `
        <section class="manual-page divider-page">
          <div class="manual-page-inner divider-inner">
            <div class="divider-index">Section ${escapeHtml(String(index).padStart(2, '0'))}</div>
            <h1 class="divider-title">${escapeHtml(title)}</h1>
            <p class="divider-subtitle">${escapeHtml(subtitle)}</p>
            <div class="divider-accent"></div>
            <div class="manual-footer manual-footer-invert"><span>${escapeHtml(`${title} • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
          </div>
        </section>
      `;

      const blockOverviewRows = Array.from({ length: context.requestedWeeks }).map((_, idx) => {
        const weekNumber = idx + 1;
        const planWeek = resolveWeekTemplate(weekNumber);
        const dayCount = Array.isArray(planWeek?.days) ? planWeek.days.length : context.daysPerWeek;
        const weekRows = projectionRowsByWeek.get(weekNumber) || [];
        const weekNote = weekRows.find((row) => String(row?.note || '').trim())?.note || complexPdfWeekPhase(weekNumber, context.projection);
        return `
          <tr>
            <td>Week ${weekNumber}</td>
            <td>${escapeHtml(complexPdfWeekPhase(weekNumber, context.projection))}</td>
            <td>${escapeHtml(weekNote)}</td>
            <td>${escapeHtml(`${dayCount} training days`)}</td>
          </tr>
        `;
      }).join('');

      const workoutTablePages = Array.from({ length: context.requestedWeeks }).map((_, idx) => {
        const weekNumber = idx + 1;
        const planWeek = resolveWeekTemplate(weekNumber);
        const days = Array.isArray(planWeek?.days) ? planWeek.days : [];
        const rows = days.map((day, dayIndex) => {
          const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
          return exercises.map((exercise, exerciseIndex) => {
            const roleInfo = complexPdfExerciseRole(exercise, exerciseIndex, context.priorities, context.painAreas);
            const projected = resolveProjectedForExercise(exercise, plan, {});
            const rir = String(exercise?.rir || exercise?.rpe || '').trim()
              || (context.outputStyle === 'Simple sets x reps' ? '—' : (roleInfo.role === 'Strength anchor' ? '2-3 RIR' : '1-2 RIR'));
            const sets = Math.max(1, Number(exercise?.sets) || 1);
            const warmups = roleInfo.role === 'Strength anchor'
              ? '2-4 ramps'
              : (roleInfo.role === 'Secondary compound' ? '1-2 ramps' : '—');
            return `
              <tr>
                <td>W${weekNumber}</td>
                <td>${escapeHtml(scheduledLabel(dayIndex + 1))}</td>
                <td>${escapeHtml(inferSplitName(day, dayIndex + 1))}</td>
                <td><div class="exercise-name">${escapeHtml(exercise?.displayName || exercise?.name || 'Exercise')}</div><div class="exercise-role">${escapeHtml(roleInfo.role)}</div></td>
                <td>${escapeHtml(warmups)}</td>
                <td>${escapeHtml(String(sets))}</td>
                <td>${escapeHtml(String(exercise?.reps || '—'))}</td>
                <td>${escapeHtml(formatPdfTarget(exercise, projected))}</td>
                <td>${escapeHtml(rir)}</td>
                <td>${escapeHtml(fmtRest(exercise?.restSec || exercise?.rest))}</td>
                <td class="track-cell">${sets >= 1 ? '&nbsp;' : '—'}</td>
                <td class="track-cell">${sets >= 2 ? '&nbsp;' : '—'}</td>
                <td class="track-cell">${sets >= 3 ? '&nbsp;' : '—'}</td>
                <td class="track-cell">${sets >= 4 ? '&nbsp;' : '—'}</td>
                <td class="track-cell">${sets >= 5 ? '&nbsp;' : '—'}</td>
                <td>${escapeHtml(shortTableNote(exercise, roleInfo))}</td>
              </tr>
            `;
          }).join('');
        }).join('');
        const weekCoachNotes = days.flatMap((day, dayIndex) => {
          const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
          return exercises.slice(0, 5).map((exercise, exerciseIndex) => {
            const roleInfo = complexPdfExerciseRole(exercise, exerciseIndex, context.priorities, context.painAreas);
            return `<li><strong>${escapeHtml(exercise?.displayName || exercise?.name || 'Exercise')}</strong>: ${escapeHtml(complexPdfExerciseNote(exercise, roleInfo, context))}</li>`;
          });
        }).slice(0, 8).join('');
        return `
          <section class="manual-page landscape-page">
            <div class="manual-page-inner landscape-inner">
              <div class="manual-page-kicker">Workout tables</div>
              <div class="table-header">
                <div>
                  <h2>Week ${weekNumber} Training Table</h2>
                  <p class="manual-lead">${escapeHtml(complexPdfWeekPhase(weekNumber, context.projection))}. ${escapeHtml(context.actualWeeks < weekNumber ? `${context.athleteName}, this week repeats the generated split template with the same progression rules.` : `${context.athleteName}, log your actual sets here. Next week’s progression should come from this performance, not guessing.`)}</p>
                </div>
                <div class="table-header-badge">${escapeHtml(`${days.length || context.daysPerWeek} days`)}</div>
              </div>
              <table class="manual-table dense-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Day</th>
                    <th>Split</th>
                    <th>Exercise</th>
                    <th>Warm-up sets</th>
                    <th>Working sets</th>
                    <th>Reps</th>
                    <th>Load / target weight</th>
                    <th>RPE / RIR</th>
                    <th>Rest</th>
                    <th>Set 1</th>
                    <th>Set 2</th>
                    <th>Set 3</th>
                    <th>Set 4</th>
                    <th>Set 5</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="16">No exercises listed.</td></tr>'}</tbody>
              </table>
              <div class="coach-note-block">
                <strong>${escapeHtml(`${coachGreeting}, coach notes for Week ${weekNumber}`)}</strong>
                <ul class="manual-list">${weekCoachNotes || `<li>${escapeHtml(`${coachGreeting}, log the week cleanly and let the next progression decision come from performance, not guessing.`)}</li>`}</ul>
              </div>
              <div class="manual-footer"><span>${escapeHtml(`Workout Tables • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
            </div>
          </section>
        `;
      }).join('');

      const priorityFrequency = context.priorities.map((priority) => {
        let exposures = 0;
        for (let weekNumber = 1; weekNumber <= context.requestedWeeks; weekNumber += 1) {
          const planWeek = resolveWeekTemplate(weekNumber);
          const days = Array.isArray(planWeek?.days) ? planWeek.days : [];
          for (const day of days) {
            const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
            if (exercises.some((exercise) => complexPdfPriorityMatch(exercise, [priority]).length)) exposures += 1;
          }
        }
        const label = exposures >= Math.max(8, context.requestedWeeks) ? 'High frequency' : exposures >= Math.max(4, Math.ceil(context.requestedWeeks / 2)) ? 'Moderate frequency' : 'Protected exposure';
        return { priority, label };
      });

      const reviewPages = (() => {
        const spans = [];
        for (let start = 1; start <= context.requestedWeeks; start += context.requestedWeeks > 8 ? 2 : 1) {
          spans.push({ start, end: Math.min(context.requestedWeeks, start + (context.requestedWeeks > 8 ? 1 : 0)) });
        }
        return spans.map((span) => `
          <section class="manual-page">
            <div class="manual-page-inner">
              <div class="manual-page-kicker">Weekly review</div>
              <h2>${escapeHtml(span.start === span.end ? `Week ${span.start} review` : `Weeks ${span.start}-${span.end} review`)}</h2>
              <p class="manual-lead">${escapeHtml(`${context.athleteName}, review your ${coverPriorityText} work here. If those areas felt productive and recovered, progress carefully next week. If joints or performance dropped, hold load or reduce accessory volume.`)}</p>
              <div class="manual-review-grid">
                <div class="manual-review-line"><strong>Best lift</strong></div>
                <div class="manual-review-line"><strong>Hardest lift</strong></div>
                <div class="manual-review-line"><strong>Exercise to increase next</strong></div>
                <div class="manual-review-line"><strong>Exercise to hold steady</strong></div>
                <div class="manual-review-line"><strong>Pain / recovery notes</strong></div>
                <div class="manual-review-line"><strong>Sleep / recovery rating</strong></div>
                <div class="manual-review-line manual-review-line-wide"><strong>Coach notes</strong></div>
              </div>
              <ul class="manual-list">
                ${context.priorities.map((priority) => {
                  const key = String(priority || '').trim().toLowerCase();
                  if (key === 'core') return `<li>${escapeHtml('Core: Did bracing and control improve under the main lifts?')}</li>`;
                  if (key === 'shoulders') return `<li>${escapeHtml('Shoulders: Did lateral and rear-delt work feel clean and recover well?')}</li>`;
                  if (key === 'arms') return `<li>${escapeHtml('Arms: Did elbows recover well while biceps and triceps volume stayed productive?')}</li>`;
                  if (key === 'chest') return `<li>${escapeHtml('Chest: Did pressing strength and chest tension improve without shoulder irritation?')}</li>`;
                  if (key === 'back' || key === 'glutes') return `<li>${escapeHtml('Posterior chain / back: Did rows, bracing, and posterior-chain work support the anchors without low-back overload?')}</li>`;
                  return `<li>${escapeHtml(`${priority}: Did this priority improve while recovery stayed acceptable?`)}</li>`;
                }).join('')}
                <li>${escapeHtml('Strength: Which anchor lift should increase next?')}</li>
              </ul>
              <div class="manual-footer"><span>${escapeHtml(`Weekly Review • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
            </div>
          </section>
        `).join('');
      })();

      const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <title></title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    @page landscape { size: A4 landscape; margin: 9mm; }
    :root {
      color-scheme: light;
      --ink: #0d1014;
      --muted: #59616b;
      --paper: #ffffff;
      --panel: #f3f5f7;
      --line: #d3d8de;
      --line-strong: #838b96;
      --accent: #ef8b18;
      --accent-soft: #ffb85f;
      --dark: #111418;
      --dark-2: #0a0c0f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eceff2;
      color: var(--ink);
      font-family: "Arial Narrow", "Helvetica Neue Condensed", "Space Grotesk", Arial, sans-serif;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      counter-reset: manualPage;
    }
    .pdf-export-toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      background: #101318;
      color: #f3f5f7;
      font-size: 12px;
      border-bottom: 3px solid var(--accent);
    }
    .pdf-export-toolbar button {
      border: 0;
      background: var(--accent);
      color: #0b0d10;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 8px 12px;
      cursor: pointer;
    }
    .manual-page {
      page-break-after: always;
      break-after: page;
      counter-increment: manualPage;
    }
    .manual-page:last-child { page-break-after: auto; break-after: auto; }
    .landscape-page { page: landscape; }
    .manual-page-inner {
      width: 100%;
      max-width: 1000px;
      margin: 0 auto;
      min-height: calc(100vh - 20mm);
      background: var(--paper);
      border: 1px solid #b7bfc8;
      box-shadow: 0 18px 40px rgba(16, 18, 22, 0.14);
      padding: 14mm 12mm 9mm;
      position: relative;
      overflow: hidden;
    }
    .manual-page-inner::before {
      content: "";
      position: absolute;
      inset: 0 auto auto 0;
      width: 100%;
      height: 8px;
      background: linear-gradient(90deg, var(--accent), var(--accent-soft));
    }
    .manual-cover {
      min-height: calc(100vh - 52mm);
      margin: -14mm -12mm -9mm;
      padding: 16mm 14mm 12mm;
      background:
        linear-gradient(140deg, rgba(239,139,24,0.16), transparent 36%),
        linear-gradient(180deg, #151920 0%, #0a0c10 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 26px;
    }
    .manual-brand, .manual-page-kicker {
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.2em;
      font-weight: 800;
    }
    .manual-brand { color: #d8dde3; margin-bottom: 10px; }
    .manual-page-kicker { color: var(--accent); margin-bottom: 10px; }
    .cover-title {
      margin: 0;
      font-size: 42px;
      line-height: 0.94;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      max-width: 14ch;
    }
    .cover-accent {
      width: 128px;
      height: 6px;
      background: linear-gradient(90deg, var(--accent), var(--accent-soft));
      margin: 14px 0 16px;
    }
    .cover-subtitle {
      margin: 0;
      max-width: 34ch;
      color: #d1d7de;
      font-size: 15px;
    }
    .manual-grid-4, .manual-grid-3, .manual-review-grid {
      display: grid;
      gap: 12px;
    }
    .manual-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .manual-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .manual-review-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .manual-stat, .manual-callout {
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 11px;
    }
    .manual-stat-label {
      color: #4d5660;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .manual-stat-value {
      font-size: 14px;
      font-weight: 800;
      line-height: 1.28;
    }
    h1, h2, h3 { margin: 0 0 10px; line-height: 1; }
    h2 {
      font-size: 28px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    h3 {
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 16px;
    }
    p { margin: 0 0 10px; }
    .manual-lead {
      color: var(--muted);
      font-size: 14px;
      max-width: 72ch;
    }
    .manual-copy p + p { margin-top: 8px; }
    .manual-callout-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 12px;
    }
    .manual-callout strong {
      display: block;
      margin-bottom: 6px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #8d5000;
    }
    .manual-toc { display: grid; gap: 8px; margin-top: 16px; }
    .manual-toc-item {
      display: grid;
      grid-template-columns: 40px 1fr auto;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid #d7dce1;
      font-size: 13px;
      font-weight: 700;
    }
    .manual-toc-num { color: var(--accent); }
    .manual-toc-page { color: #68717c; }
    .manual-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 11px;
    }
    .manual-table th, .manual-table td {
      border: 1px solid var(--line);
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
    }
    .manual-table th {
      background: #151920;
      color: #fff;
      font-size: 9.8px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .manual-table tbody tr:nth-child(even) td { background: #f7f8fa; }
    .exercise-name { font-weight: 800; }
    .exercise-role {
      margin-top: 2px;
      color: #5d6670;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }
    .table-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: end;
    }
    .table-header-badge {
      border: 1px solid var(--line-strong);
      padding: 8px 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 800;
    }
    .dense-table { table-layout: fixed; }
    .dense-table th, .dense-table td { padding: 6px 5px; font-size: 9.4px; }
    .dense-table th:nth-child(4), .dense-table td:nth-child(4) { width: 14%; }
    .dense-table th:last-child, .dense-table td:last-child { width: 15%; }
    .track-cell { min-width: 34px; height: 24px; background: #fff; }
    .manual-list { margin: 10px 0 0 18px; padding: 0; }
    .manual-list li + li { margin-top: 8px; }
    .manual-review-line {
      min-height: 92px;
      border: 1px dashed #b2bac3;
      padding: 12px;
      background: #fff;
    }
    .manual-review-line strong {
      display: block;
      margin-bottom: 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .manual-review-line-wide { grid-column: 1 / -1; min-height: 126px; }
    .manual-footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #d0d5db;
      color: #5e6670;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }
    .manual-footer-invert {
      color: #d8dde3;
      border-top-color: rgba(255,255,255,0.14);
      margin-top: auto;
    }
    .manual-page-number::after { content: "Page " counter(manualPage); }
    .divider-page .manual-page-inner::before { display: none; }
    .divider-inner {
      background:
        linear-gradient(140deg, rgba(239,139,24,0.18), transparent 38%),
        linear-gradient(180deg, var(--dark) 0%, var(--dark-2) 100%);
      color: #fff;
      border-color: #0a0c10;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .divider-index {
      color: var(--accent-soft);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      margin-bottom: 16px;
    }
    .divider-title {
      font-size: 44px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      max-width: 11ch;
    }
    .divider-subtitle {
      margin-top: 10px;
      max-width: 42ch;
      color: #d2d8df;
      font-size: 15px;
    }
    .divider-accent {
      width: 142px;
      height: 6px;
      background: linear-gradient(90deg, var(--accent), var(--accent-soft));
      margin-top: 20px;
    }
    .landscape-inner { max-width: 100%; }
    @media print {
      .pdf-export-toolbar { display: none !important; }
      body { background: #fff; }
      .manual-page-inner {
        min-height: auto;
        box-shadow: none;
        border-width: 0;
        padding: 12mm 10mm 8mm;
      }
    }
  </style>
</head>
<body>
  <div class="pdf-export-toolbar">
    <span>For the cleanest PDF, turn off browser “Headers and footers” in the print dialog, then save as PDF.</span>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-cover">
        <div>
          <div class="manual-brand">RiseForIt / ODeology</div>
          <div class="manual-page-kicker">Custom training manual</div>
          <h1 class="cover-title">${escapeHtml(context.isPowerbuilding ? 'Custom Powerbuilding Program' : 'Custom Bodybuilding Program')}</h1>
          <div class="cover-accent" aria-hidden="true"></div>
          <p class="cover-subtitle">${escapeHtml(coverSubtitle)}</p>
          <p class="cover-subtitle" style="margin-top:10px">${escapeHtml(`Built for ${context.athleteName}`)}</p>
        </div>
        <div class="manual-grid-4">
          <div class="manual-stat"><div class="manual-stat-label">Goal / focus</div><div class="manual-stat-value">${escapeHtml(`${context.primaryGoal} • ${context.focus}`)}</div></div>
          <div class="manual-stat"><div class="manual-stat-label">Plan length</div><div class="manual-stat-value">${escapeHtml(`${context.requestedWeeks} weeks`)}</div></div>
          <div class="manual-stat"><div class="manual-stat-label">Week range</div><div class="manual-stat-value">${escapeHtml(`Weeks ${detailedWeekStart}-${detailedWeekEnd}`)}</div></div>
          <div class="manual-stat"><div class="manual-stat-label">Priority groups</div><div class="manual-stat-value">${escapeHtml(coverPriorityText)}</div></div>
          <div class="manual-stat"><div class="manual-stat-label">Days per week</div><div class="manual-stat-value">${escapeHtml(String(context.daysPerWeek))}</div></div>
          <div class="manual-stat"><div class="manual-stat-label">Generated</div><div class="manual-stat-value">${escapeHtml(todayLabel)}</div></div>
          <div class="manual-stat"><div class="manual-stat-label">Discipline</div><div class="manual-stat-value">${escapeHtml(context.trainingFeel)}</div></div>
          <div class="manual-stat"><div class="manual-stat-label">Format</div><div class="manual-stat-value">${escapeHtml('Full block manual')}</div></div>
        </div>
        <div class="manual-footer manual-footer-invert"><span>${escapeHtml(`RiseForIt / ODeology • ${coverSubtitle}`)}</span><span class="manual-page-number"></span></div>
      </div>
    </div>
  </section>

  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-page-kicker">Table of contents</div>
      <h2>Manual contents</h2>
      <div class="manual-toc">
        <div class="manual-toc-item"><span class="manual-toc-num">01</span><span>Athlete Profile</span><span class="manual-toc-page">Profile</span></div>
        <div class="manual-toc-item"><span class="manual-toc-num">02</span><span>Program Overview</span><span class="manual-toc-page">Overview</span></div>
        <div class="manual-toc-item"><span class="manual-toc-num">03</span><span>Training Block</span><span class="manual-toc-page">Block</span></div>
        <div class="manual-toc-item"><span class="manual-toc-num">04</span><span>Workout Tables</span><span class="manual-toc-page">Program</span></div>
        <div class="manual-toc-item"><span class="manual-toc-num">05</span><span>Priority Strategy</span><span class="manual-toc-page">Priority</span></div>
        <div class="manual-toc-item"><span class="manual-toc-num">06</span><span>Recovery / Deload</span><span class="manual-toc-page">Recovery</span></div>
        <div class="manual-toc-item"><span class="manual-toc-num">07</span><span>Substitutions / Safety</span><span class="manual-toc-page">Safety</span></div>
        <div class="manual-toc-item"><span class="manual-toc-num">08</span><span>Weekly Review</span><span class="manual-toc-page">Review</span></div>
      </div>
      <div class="manual-footer"><span>${escapeHtml(`Table of Contents • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
    </div>
  </section>

  ${sectionDivider('Athlete Profile', `${context.athleteName}, these are the inputs that shaped your plan.`, 1)}
  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-page-kicker">Coach's note</div>
      <h2>Coach's Note</h2>
      <p class="manual-lead">${escapeHtml(`${context.athleteName}, this ${context.requestedWeeks}-week ${context.trainingFeel} block was built for your goal of ${context.primaryGoal} with a ${context.focus} focus. You selected ${coverPriorityText}, so the plan keeps heavy strength anchors early and places targeted accessory work after the main lifts. Your equipment access, session length, recovery inputs, pain areas, and avoid-movement list shaped the exercise selection.`)}</p>
      <div class="manual-callout-grid">
        <div class="manual-callout"><strong>Built to improve</strong>${escapeHtml(context.priorities.length ? `Your selected priorities: ${coverPriorityText}, while keeping the main lifts productive.` : 'Main lift performance, productive hypertrophy, and week-to-week consistency.')}</div>
        <div class="manual-callout"><strong>How to progress</strong>${escapeHtml('Add reps before load, then increase weight only when the top of the range is earned with clean form.')}</div>
        <div class="manual-callout"><strong>What to watch</strong>${escapeHtml('If joints flare or performance drops, reduce accessory volume or swap the movement before forcing progression.')}</div>
      </div>
      <div class="manual-footer"><span>${escapeHtml(`Coach's Note • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
    </div>
  </section>
  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-page-kicker">Athlete profile</div>
      <h2>${escapeHtml(`${context.trainingFeel} profile`)}</h2>
      <p class="manual-lead">${escapeHtml(profileNarrative)}</p>
      <div class="manual-grid-4">
        <div class="manual-stat"><div class="manual-stat-label">Discipline</div><div class="manual-stat-value">${escapeHtml(context.discipline)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Goal / focus</div><div class="manual-stat-value">${escapeHtml(`${context.primaryGoal} • ${context.focus}`)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Plan length</div><div class="manual-stat-value">${escapeHtml(context.timeline)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Days / week</div><div class="manual-stat-value">${escapeHtml(String(context.daysPerWeek))}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Preferred days</div><div class="manual-stat-value">${escapeHtml(preferredDayText)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Session length</div><div class="manual-stat-value">${escapeHtml(`${context.sessionLengthMin} minutes`)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Location</div><div class="manual-stat-value">${escapeHtml(context.location)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Equipment access</div><div class="manual-stat-value">${escapeHtml(complexPdfListText(context.equipmentAccess, 'General gym access'))}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Training style</div><div class="manual-stat-value">${escapeHtml(context.trainingStyle)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Priority groups</div><div class="manual-stat-value">${escapeHtml(coverPriorityText)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Pain areas</div><div class="manual-stat-value">${escapeHtml(painDetailText)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Avoid movements</div><div class="manual-stat-value">${escapeHtml(complexPdfListText(context.movementsToAvoid, 'None listed'))}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Close-to-failure</div><div class="manual-stat-value">${escapeHtml(context.closeToFailure)}</div></div>
        <div class="manual-stat"><div class="manual-stat-label">Recovery inputs</div><div class="manual-stat-value">${escapeHtml(`Sleep ${complexPdfListText(context.sleepHours, 'Not provided')} • Activity ${context.activityLevel} • Stress ${context.stress}`)}</div></div>
      </div>
      <h3>Starting strength snapshot</h3>
      <table class="manual-table">
        <thead><tr><th>Pattern</th><th>Starting value</th></tr></thead>
        <tbody>${strengthSnapshotRows}</tbody>
      </table>
      <p class="manual-lead" style="margin-top:12px">${escapeHtml(strengthNarrative)}</p>
      <div class="manual-footer"><span>${escapeHtml(`Athlete Profile • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
    </div>
  </section>

  ${sectionDivider('Program Overview', `${context.athleteName}, this is how the block blends strength anchors, targeted accessories, and practical constraints.`, 2)}
  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-page-kicker">Program overview</div>
      <h2>How this block works</h2>
      <div class="manual-copy">
        <p>${escapeHtml(context.isPowerbuilding ? 'Powerbuilding blends heavy strength work with hypertrophy accessories. Main lifts build skill and strength; accessories build muscle, weak points, and joint balance.' : 'This block uses structured compounds to anchor the week while accessory work drives hypertrophy and shape changes.')}</p>
        <p>Reps progress first, then load. Pain, equipment, and movement-avoidance constraints override ideal exercise selection so the plan stays realistic.</p>
        <p>${escapeHtml(context.priorities.length ? `${context.athleteName}, you selected ${coverPriorityText}. The plan spreads that work across the week instead of crowding it into one vanity session.` : `${context.athleteName}, the week stays anchor-first so strength work is never buried under random accessories.`)}</p>
      </div>
      <div class="manual-callout-grid">
        <div class="manual-callout"><strong>Main lifts</strong>Add reps first. When all sets hit the top of the range with clean form, add load next time.</div>
        <div class="manual-callout"><strong>Accessories</strong>Stay controlled. Stop 1-2 reps short of failure unless noted. Add reps before load.</div>
        <div class="manual-callout"><strong>Pain rule</strong>Pain beats progression. Reduce load, shorten range, or swap movement.</div>
      </div>
      <h3>Using target weights and effort</h3>
      <ul class="manual-list">
        <li>If the target load feels too easy, earn extra reps before adding weight.</li>
        <li>If the target load feels too hard, reduce it and protect setup quality.</li>
        <li>Hold load when fatigue, pain, or technique says the week needs more control.</li>
        <li>Performance drives strength. Reduce volume before forcing more intensity.</li>
      </ul>
      <div class="manual-footer"><span>${escapeHtml(`Program Overview • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
    </div>
  </section>

  ${sectionDivider('Training Block', `${context.athleteName}, this block map shows progression without wasting pages on filler.`, 3)}
  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-page-kicker">Training block overview</div>
      <h2>${escapeHtml(`${context.requestedWeeks}-week block map`)}</h2>
      <p class="manual-lead">${escapeHtml(`${context.athleteName}, the block map shows progression, reduced-fatigue weeks, and schedule intent. The workout tables carry the actual program detail.`)}</p>
      <table class="manual-table">
        <thead><tr><th>Week</th><th>Phase</th><th>Instruction</th><th>Schedule note</th></tr></thead>
        <tbody>${blockOverviewRows}</tbody>
      </table>
      <div class="manual-footer"><span>${escapeHtml(`Training Block • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
    </div>
  </section>

  ${sectionDivider('Workout Tables', `${context.athleteName}, these pages are where the program becomes action. Track every set.`, 4)}
  ${workoutTablePages}

  ${sectionDivider('Priority Strategy', `${context.athleteName}, this is how your selected priorities are protected without burying the main lifts.`, 5)}
  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-page-kicker">Priority strategy</div>
      <h2>How the priorities are distributed</h2>
      <p class="manual-lead">Priority work should be visible enough to matter, but not so crowded that it wrecks recovery or weakens the anchor lifts.</p>
      <div class="manual-grid-3">
        ${priorityFrequency.length ? priorityFrequency.map((entry) => `
          <div class="manual-stat">
            <div class="manual-stat-label">${escapeHtml(entry.priority)}</div>
            <div class="manual-stat-value">${escapeHtml(entry.label)}</div>
          </div>
        `).join('') : '<div class="manual-callout">No explicit priority groups were selected.</div>'}
      </div>
      <ul class="manual-list">
        ${customStrategyCopy.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
      </ul>
      <div class="manual-footer"><span>${escapeHtml(`Priority Strategy • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
    </div>
  </section>

  ${sectionDivider('Recovery / Deload', `${context.athleteName}, if performance drops, adjust volume before forcing load.`, 6)}
  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-page-kicker">Recovery and deload guidance</div>
      <h2>Manage fatigue before it manages you</h2>
      <div class="manual-callout"><strong>Performance drives strength</strong> ${escapeHtml(`${context.athleteName}, if fatigue blocks performance, reduce volume before forcing more intensity.`)}</div>
      <ul class="manual-list">
        <li>Hold load when bar speed, setup quality, or recovery falls off.</li>
        <li>Reduce a set or two when sleep is poor, stress is high, or pain starts changing movement quality.</li>
        <li>Swap a movement when equipment or pain changes make the day less productive than planned.</li>
        <li>Use reduced-fatigue weeks to rebuild readiness, not to prove toughness.</li>
      </ul>
      <div class="manual-footer"><span>${escapeHtml(`Recovery / Deload • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
    </div>
  </section>

  ${sectionDivider('Substitutions / Safety', `${context.athleteName}, keep the training effect when pain, equipment, or setup quality says a movement needs to change.`, 7)}
  <section class="manual-page">
    <div class="manual-page-inner">
      <div class="manual-page-kicker">Safety and substitutions</div>
      <h2>Keep the training effect, not the ego</h2>
      <ul class="manual-list">
        <li>Use Swap Exercise when equipment is missing, setup is awkward, or a movement feels wrong.</li>
        <li>Respond to pain by reducing load, shortening range, or switching to the safer variation already implied by the plan.</li>
        <li>Stop the set when position, speed, or control falls apart.</li>
        <li>Respect the avoid-movement list. Productive training matters more than forcing a pattern you already know is a poor fit.</li>
      </ul>
      <div class="manual-footer"><span>${escapeHtml(`Safety / Substitutions • RiseForIt / ODeology`)}</span><span class="manual-page-number"></span></div>
    </div>
  </section>

  ${sectionDivider('Weekly Review', `${context.athleteName}, use these pages to decide what should progress, what should stay steady, and what needs recovery adjustment.`, 8)}
  ${reviewPages}
</body>
</html>`;

      const win = window.open('', '_blank');
      if (!win) {
        state.planError = 'Allow pop-ups to export the PDF.';
        render();
        return;
      }
      try {
        win.opener = null;
      } catch {
        // ignore
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try { win.print(); } catch { /* ignore */ }
      }, 350);
    };

    const openWorkoutEditorFromPlan = () => {
      const activePlan = state.planRow?.plan;
      const week = activePlan?.weeks?.find((w) => Number(w?.index) === Number(activeWeek)) || activePlan?.weeks?.[0];
      const days = Array.isArray(week?.days) ? week.days : [];
      if (!days.length) {
        state.planError = 'No workout days found to edit.';
        render();
        return;
      }

      const weekdayByName = new Map(
        WEEKDAYS.map((label, idx) => [String(label || '').trim().toLowerCase(), idx])
      );
      const daysPerWeek = Number(activePlan?.meta?.daysPerWeek) || days.length || 1;
      const scheduledWeekdays = scheduleWeekdays(daysPerWeek, activeDate);
      const fallbackWeekdays = Array.isArray(scheduledWeekdays) && scheduledWeekdays.length
        ? scheduledWeekdays
        : [1, 2, 3, 4, 5, 6, 0];
      const slug = (raw) =>
        String(raw || 'exercise')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 48) || 'exercise';
      const normalizeWeekday = (day, dayIdx) => {
        const rawWeekday = Number(day?.weekday);
        if (Number.isInteger(rawWeekday) && rawWeekday >= 0 && rawWeekday <= 6) return rawWeekday;
        const name = String(day?.name || '').trim().toLowerCase();
        if (name && weekdayByName.has(name)) return weekdayByName.get(name);
        const firstToken = name.split(/\s+/).filter(Boolean)[0] || '';
        if (firstToken && weekdayByName.has(firstToken)) return weekdayByName.get(firstToken);
        const fallback = Number(fallbackWeekdays[dayIdx % fallbackWeekdays.length]);
        return Number.isInteger(fallback) && fallback >= 0 && fallback <= 6 ? fallback : ((dayIdx + 1) % 7);
      };

      const snapshotDays = days.map((day, dayIdx) => {
        const exercises = (Array.isArray(day?.exercises) ? day.exercises : []).map((ex, exIdx) => {
          const name = String(ex?.displayName || ex?.name || `Exercise ${exIdx + 1}`).trim() || `Exercise ${exIdx + 1}`;
          const fallbackId = `${slug(name)}_${dayIdx}_${exIdx}`;
          const exerciseId = String(ex?.baseId || ex?.exerciseId || ex?.id || fallbackId).trim() || fallbackId;
          const primary = Array.isArray(ex?.primaryMuscles) ? ex.primaryMuscles : [];
          const secondary = Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles : [];
          const instructions = Array.isArray(ex?.instructions) ? ex.instructions.filter(Boolean).slice(0, 8) : [];
          return {
            exerciseId,
            name,
            sets: Math.max(1, Math.min(8, Number(ex?.sets) || 3)),
            reps: String(ex?.reps || '8-12'),
            restSec: Math.max(30, Math.min(300, Number(ex?.restSec || ex?.rest) || 90)),
            category: String(ex?.category || ''),
            equipment: String(ex?.equipment || ''),
            level: String(ex?.level || ''),
            primaryMuscles: primary,
            secondaryMuscles: secondary,
            instructions,
            imageUrl: String(ex?.imageUrl || '')
          };
        });

        return {
          weekday: normalizeWeekday(day, dayIdx),
          label: String(day?.name || '').trim(),
          exercises
        };
      }).filter((day) => Array.isArray(day?.exercises) && day.exercises.length);

      if (!snapshotDays.length) {
        state.planError = 'No exercises found to edit.';
        render();
        return;
      }

      try {
        sessionStorage.setItem(TRAINING_BUILDER_PREFILL_KEY, JSON.stringify({
          createdAt: new Date().toISOString(),
          source: 'training-plan',
          planId: state.planRow?.id || null,
          activeWeek: Number(activeWeek) || 1,
          days: snapshotDays
        }));
      } catch {
        // ignore storage failures
      }

      window.location.href = 'workout-builder.html?from=edit-workout';
    };

    const normalizeSmsPhone = (raw) => {
      const src = String(raw || '').trim();
      if (!src) return '';
      const hasPlus = src.startsWith('+');
      const digits = src.replace(/\D+/g, '');
      if (!digits) return '';
      return hasPlus ? `+${digits}` : digits;
    };

    const buildShareWorkoutLink = () => {
      const origin = String(window.location?.origin || '').replace(/\/+$/, '') || '';
      const inviter = String(
        state.auth?.user?.displayName
        || state.auth?.user?.username
        || 'your friend'
      ).trim();
      const discipline = String(plan?.meta?.discipline || '').trim().toLowerCase() || 'training';
      const days = Number(plan?.meta?.daysPerWeek) || 0;
      const params = new URLSearchParams({
        from: inviter,
        via: 'sms',
        discipline,
        days: String(days || '')
      });
      return `${origin}/training.html?${params.toString()}`;
    };

    const buildShareWorkoutImageLink = () => {
      const origin = String(window.location?.origin || '').replace(/\/+$/, '') || '';
      return `${origin}/assets/hero-nutrition.jpg`;
    };

    const buildWorkoutPdfShareUrl = () => {
      const raw = buildShareWorkoutLink();
      try {
        const u = new URL(raw);
        u.searchParams.set('pdf', '1');
        return u.toString();
      } catch {
        return raw;
      }
    };

    const buildSmsInviteCopy = (acct) => {
      const inviteeName = String(acct?.displayName || acct?.username || 'you').trim() || 'you';
      const inviter = String(
        state.auth?.user?.displayName
        || state.auth?.user?.username
        || 'your friend'
      ).trim();
      const discipline = String(plan?.meta?.discipline || 'training').trim().toUpperCase();
      const days = Number(plan?.meta?.daysPerWeek) || 0;
      const workoutLink = buildShareWorkoutLink();
      const imageLink = buildShareWorkoutImageLink();
      return [
        `Yo ${inviteeName} — join ${inviter} on their workout in RiseForIt.`,
        `Track your progress, stay accountable, and keep momentum (${discipline}${days ? `, ${days} days/week` : ''}).`,
        `Join link: ${workoutLink}`,
        `Preview image: ${imageLink}`
      ].join('\n');
    };

    const openSmsInviteForAccount = (acct) => {
      const name = String(acct?.displayName || acct?.username || 'friend').trim() || 'friend';
      const phone = normalizeSmsPhone(acct?.phone || '');
      if (!phone) {
        shareUi.status = `${name} does not have a phone number linked.`;
        render();
        return;
      }
      const body = buildSmsInviteCopy(acct);
      const smsUrl = `sms:${phone}?&body=${encodeURIComponent(body)}`;
      shareUi.status = `Opening SMS invite for ${name}...`;
      render();
      window.location.href = smsUrl;
    };

    const openWorkoutPdfQrModal = () => {
      const existing = document.getElementById('training-share-pdf-qr-modal');
      if (existing) existing.remove();

      const targetUrl = buildWorkoutPdfShareUrl();
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(targetUrl)}`;
      const close = () => {
        const node = document.getElementById('training-share-pdf-qr-modal');
        if (node) node.remove();
      };

      const overlay = el('div', {
        class: 'schedule-modal training-share-pdf-qr-modal',
        id: 'training-share-pdf-qr-modal',
        role: 'dialog',
        'aria-modal': 'true'
      },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close QR modal' }),
      el('div', { class: 'schedule-modal-card' },
        el('div', { class: 'schedule-modal-head' },
          el('div', { class: 'schedule-modal-title' }, 'Workout PDF QR'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close QR modal' }, '×')
        ),
        el('div', { class: 'schedule-modal-body training-share-pdf-qr-body' },
          el('div', { class: 'training-share-welcome-line' }, 'Scan this code to open the workout share link.'),
          el('div', { class: 'training-share-pdf-qr-wrap' },
            el('img', { class: 'training-share-pdf-qr-img', src: qrSrc, alt: 'Workout share QR code' })
          ),
          el('a', { class: 'training-share-pdf-link', href: targetUrl, target: '_blank', rel: 'noopener' }, targetUrl)
        ),
        el('div', { class: 'schedule-modal-actions' },
          el('button', {
            type: 'button',
            class: 'btn btn-ghost',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(targetUrl);
                shareUi.status = 'Share link copied.';
                render();
              } catch {
                shareUi.status = 'Could not copy link.';
                render();
              }
            }
          }, 'Copy link'),
          el('button', { type: 'button', class: 'btn btn-primary', onclick: printSimplePlanPdfV2 }, 'Open PDF'),
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: close }, 'Close')
        )
      ));
      overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', close);
      overlay.querySelector('.schedule-modal-close')?.addEventListener('click', close);
      document.body.appendChild(overlay);
    };

    const canShare = !isPreview && Boolean(state.auth.user);
    const connectedMembers = Array.isArray(shareUi.connectedMembers) ? shareUi.connectedMembers : [];
    const connectedVisible = connectedMembers.slice(0, 6);
    const connectedOverflow = Math.max(0, connectedMembers.length - connectedVisible.length);
    const shareMembersStrip = connectedMembers.length
      ? el('div', {
        class: 'share-workout-members',
        'aria-label': `${connectedMembers.length} connected account${connectedMembers.length === 1 ? '' : 's'}`
      },
      el('div', { class: 'share-workout-members-list' },
        connectedVisible.map((member) => {
          const memberName = String(member?.displayName || member?.username || 'Account').trim() || 'Account';
          const memberId = String(member?.id || '').trim();
          const canRemoveMember = member?.canRemove === true;
          const operationKey = String(member?.operationKey || memberId).trim();
          const isKickingMember = canRemoveMember && Boolean(operationKey) && shareUi.kicking.has(operationKey);
          const initials = memberName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join('')
            .toUpperCase();
          if (!memberId || !canRemoveMember) {
            return el('div', {
              class: 'share-workout-member-avatar',
              title: member?.username ? `${memberName} (@${member.username})` : memberName
            },
            member?.photoDataUrl
              ? el('img', { src: member.photoDataUrl, alt: memberName })
              : (initials || 'O'));
          }
          const action = String(member?.action || '').trim().toLowerCase();
          const actionLabel = action === 'leave'
            ? 'Leave shared workout'
            : `Kick ${memberName} from workout`;
          return el('button', {
            type: 'button',
            class: `share-workout-member-avatar share-workout-member-btn${isKickingMember ? ' is-kicking' : ''}`,
            title: member?.username ? `${memberName} (@${member.username})` : memberName,
            disabled: isKickingMember ? 'disabled' : null,
            'aria-label': actionLabel,
            onclick: async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isKickingMember) return;
              if (action === 'leave') {
                await leaveSharedWorkoutFromOwner(member);
                return;
              }
              await removeAcceptedShareForAccount(member);
            }
          },
          member?.photoDataUrl
            ? el('img', { src: member.photoDataUrl, alt: memberName })
            : (initials || 'O'),
          el('span', { class: 'share-workout-member-kick', 'aria-hidden': 'true' }, '×'));
        }),
        connectedOverflow > 0
          ? el('div', { class: 'share-workout-member-avatar extra', title: `${connectedOverflow} more` }, `+${connectedOverflow}`)
          : null
      )
      )
      : null;
    const shareMode = normalizeShareMode(shareUi.mode);
    const isAppShareMode = shareMode === 'app';
    const isSmsShareMode = shareMode === 'sms';
    const isPdfShareMode = shareMode === 'pdf';

    const shareListItems = shareUi.loading
      ? []
      : (shareUi.accounts && shareUi.accounts.length
        ? shareUi.accounts.map((acct) => {
            const name = String(acct?.displayName || acct?.username || 'Account');
            const username = acct?.username ? `@${acct.username}` : '';
            const initials = name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part.charAt(0))
              .join('')
              .toUpperCase();
            const key = String(acct?.id || '').trim();
            const isRequesting = Boolean(key) && shareUi.requesting.has(key);
            const isKicking = Boolean(key) && shareUi.kicking.has(key);
            const isRequested = Boolean(key) && shareUi.requested.has(key);
            const latestStatus = Boolean(key) ? String(shareUi.latestStatus.get(key) || '').toLowerCase() : '';
            const isAccepted = latestStatus === 'accepted';
            const isDeclined = latestStatus === 'declined';
            const isLocked = isRequesting || isRequested || isAccepted || isDeclined;
            const smsPhone = normalizeSmsPhone(acct?.phone || '');
            const smsReady = Boolean(smsPhone);
            const actionLabel = isRequesting
              ? 'Requesting...'
              : isRequested
                ? 'Requested'
                : isAccepted
                  ? 'Accepted'
                  : isDeclined
                    ? 'Declined'
                    : 'Add';
            const smsLabel = smsReady ? 'SMS' : 'No Phone';
            return el('div', {
              class: `share-workout-item${isRequesting ? ' requesting' : ''}${isRequested ? ' requested' : ''}${isAccepted ? ' accepted' : ''}${isDeclined ? ' declined' : ''}`,
              'data-user-id': key || null,
              'data-username': acct?.username ? String(acct.username) : null
            },
              el('div', { class: 'share-workout-avatar' },
                acct?.photoDataUrl
                  ? el('img', { src: acct.photoDataUrl, alt: name })
                  : (initials || 'O'),
                el('span', {
                  class: `presence-dot ${acct?.isOnline === true ? 'online' : 'offline'}`,
                  'aria-hidden': 'true'
                })
              ),
              el('div', { class: 'share-workout-meta' },
                el('div', { class: 'share-workout-name' }, name),
                el('div', { class: 'share-workout-handle' }, username || ' ')
              ),
              !isAppShareMode
                ? el('button', {
                  type: 'button',
                  class: `share-workout-add-btn${smsReady ? ' sms' : ' declined'}`,
                  disabled: smsReady ? null : 'disabled',
                  'aria-label': smsReady
                    ? `Text workout invite link to ${name}`
                    : `${name} has no phone number linked`,
                  onclick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!smsReady) return;
                    openSmsInviteForAccount(acct);
                  }
                }, smsLabel)
                : isAccepted
                ? el('button', {
                  type: 'button',
                  class: `share-workout-add-btn accepted${isKicking ? ' requesting' : ''}`,
                  disabled: 'disabled',
                  'aria-label': `${name} accepted your request`
                }, isKicking ? 'Removing...' : 'Accepted')
                : el('button', {
                  type: 'button',
                  class: `share-workout-add-btn${isRequesting ? ' requesting' : ''}${isRequested ? ' requested' : ''}${isAccepted ? ' accepted' : ''}${isDeclined ? ' declined' : ''}`,
                  disabled: isLocked ? 'disabled' : null,
                  'aria-label': isRequested
                    ? `${name} already requested`
                    : isAccepted
                      ? `${name} accepted your request`
                      : isDeclined
                        ? `${name} declined your request`
                    : `Send workout request to ${name}`,
                  onclick: async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!key) {
                      try {
                        shareDebugLog('Add ignored: missing friend id', {
                          username: acct?.username || null,
                          displayName: acct?.displayName || null
                        });
                      } catch {
                        // ignore console failures
                      }
                      return;
                    }
                    if (isLocked) {
                      try {
                        shareDebugLog('Add ignored: row locked', {
                          id: key,
                          isRequesting,
                          isRequested,
                          isAccepted,
                          isDeclined
                        });
                      } catch {
                        // ignore console failures
                      }
                      return;
                    }
                    await sendShareRequestToAccount(acct);
                  }
                }, actionLabel)
            );
          })
        : [el('div', { class: 'share-workout-empty' }, 'No friends found.')]);

      const daysPerWeek = Number(plan?.meta?.daysPerWeek) || (Array.isArray(plan?.weeks?.[0]?.days) ? plan.weeks[0].days.length : 1);

      const planMinDate = planStartDate(plan);
      const historyMinDate = earliestLogDate(state.allLogs);
      const minDate = historyMinDate && historyMinDate.getTime() < planMinDate.getTime()
        ? historyMinDate
        : planMinDate;
      const maxDate = (() => {
        const d = new Date(today);
        d.setDate(d.getDate() + 30);
        const t = dayStart(d);
        return t < minDate ? minDate : t;
      })();

      const clampDate = (d) => {
        const t = dayStart(d);
        if (t < minDate) return minDate;
        if (t > maxDate) return maxDate;
        return t;
      };

      const storedDateIso = readTrainingPlanNavValue('active_date', {
        planId: state.planRow?.id,
        legacyKey: LEGACY_TRAINING_ACTIVE_DATE_KEY
      });
      let activeDate = parseISODateLocal(storedDateIso);
      if (!activeDate || Number.isNaN(activeDate.getTime())) {
        activeDate = today;
      }
      const timerLockedDateIso = getActiveWorkoutTimerDayIso();
      const timerLockedDate = timerLockedDateIso ? parseISODateLocal(timerLockedDateIso) : null;
      if (timerLockedDate && !Number.isNaN(timerLockedDate.getTime())) {
        activeDate = timerLockedDate;
      }
      activeDate = clampDate(activeDate) || clampDate(today) || minDate;

      applyPendingScheduleIfDue(activeDate);

      activeWeek = weekIndexForDate(activeDate, plan);
      const week = plan.weeks.find((w) => Number(w.index) === activeWeek) || plan.weeks[0];
      const days = Array.isArray(week?.days) ? week.days : [];

      const activeWeekday = activeDate.getDay();
      const activeDateIso = toISODateLocal(activeDate);
      const customDraftExercises = getCustomWorkoutDraftsForDate(activeDateIso);
      const allLogsByDate = buildLogsByDate(state.allLogs);
      const historyLogsForActiveDate = allLogsByDate.get(activeDateIso) || [];
      const isHistoryDate = dayStart(activeDate).getTime() < dayStart(planMinDate).getTime();
      const skipLogEntries = readTrainingSkipLog();
      const skipLogByDate = new Map(skipLogEntries.map((entry) => [String(entry?.skipDate || '').trim(), entry]));
      const doOverrideEntries = readDoOverrideLog();
      const doOverrideByDate = new Map(doOverrideEntries.map((entry) => [String(entry?.doDate || '').trim(), entry]));
      const sessionOrdinalByDate = new Map();
      const skipCountByDate = new Map();
      const dayStartByDate = new Map();
      const dayMs = 24 * 60 * 60 * 1000;
      const skipModeOf = (entry) => {
        const modeRaw = String(entry?.mode || '').trim().toLowerCase();
        return modeRaw === 'rest_skip' ? 'rest_skip' : 'workout_skip';
      };
      const toStartForIso = (iso) => {
        const key = String(iso || '').trim();
        if (!key) return null;
        if (dayStartByDate.has(key)) return dayStartByDate.get(key);
        const parsed = parseISODateLocal(key);
        const val = parsed ? dayStart(parsed) : null;
        dayStartByDate.set(key, val);
        return val;
      };
      const isScheduledWorkoutDate = (date) => {
        const target = dayStart(date);
        const candidateWeekdays = scheduleWeekdays(daysPerWeek, target);
        return Array.isArray(candidateWeekdays) && candidateWeekdays.includes(target.getDay());
      };
      const countScheduledSessionsThrough = (date) => {
        const target = dayStart(date);
        const key = toISODateLocal(target);
        if (sessionOrdinalByDate.has(key)) return sessionOrdinalByDate.get(key);
        let count = 0;
        for (let cursor = dayStart(planMinDate); cursor.getTime() <= target.getTime(); cursor = new Date(cursor.getTime() + dayMs)) {
          if (isScheduledWorkoutDate(cursor)) count += 1;
        }
        sessionOrdinalByDate.set(key, count);
        return count;
      };
      const countLoggedSkipsThrough = (date, mode) => {
        const modeKey = mode === 'rest_skip' ? 'rest_skip' : 'workout_skip';
        const target = dayStart(date);
        const key = toISODateLocal(target);
        const cacheKey = `${modeKey}:${key}`;
        if (skipCountByDate.has(cacheKey)) return skipCountByDate.get(cacheKey);
        let count = 0;
        for (const entry of skipLogEntries) {
          if (skipModeOf(entry) !== modeKey) continue;
          const skipIso = String(entry?.skipDate || '').trim();
          if (!skipIso || skipIso > key) continue;
          const skipDate = toStartForIso(skipIso);
          if (!skipDate) continue;
          if (skipDate.getTime() < dayStart(planMinDate).getTime()) continue;
          count += 1;
        }
        skipCountByDate.set(cacheKey, count);
        return count;
      };
      const baseDayIndexForDate = (date) => {
        const target = dayStart(date);
        if (!isScheduledWorkoutDate(target)) return null;
        const baseSessionOrdinal = countScheduledSessionsThrough(target);
        if (!baseSessionOrdinal) return null;
        return ((baseSessionOrdinal - 1) % daysPerWeek) + 1;
      };
      const dayIndexForDate = (date) => {
        const target = dayStart(date);
        const targetIso = toISODateLocal(target);
        const sameDayLog = skipLogByDate.get(targetIso);
        if (sameDayLog && skipModeOf(sameDayLog) === 'workout_skip') return null;
        const restSkips = countLoggedSkipsThrough(target, 'rest_skip');
        const mappedDate = new Date(target);
        mappedDate.setDate(mappedDate.getDate() + restSkips);
        return baseDayIndexForDate(mappedDate);
      };
      const weekdayToDayIndex = new Map();
      WEEKDAY_ORDER.forEach((weekday) => {
        const weekdayDate = dateForWeekday(activeWeek, weekday, plan);
        if (!weekdayDate) return;
        const dayIndex = dayIndexForDate(weekdayDate);
        if (dayIndex) weekdayToDayIndex.set(weekday, dayIndex);
      });

      writeTrainingPlanNavValue('week', String(activeWeek), { planId: state.planRow?.id });
      writeTrainingPlanNavValue(`day_${activeWeek}`, `wd:${activeWeekday}`, { planId: state.planRow?.id });
      writeTrainingPlanNavValue('active_date', toISODateLocal(activeDate), { planId: state.planRow?.id });

      const baseActiveDayIndex = dayIndexForDate(activeDate);
      // "Do another day": if this date carries an override, perform that plan
      // day instead (even on a rest day, where the base index is null).
      const activeDoOverride = doOverrideByDate.get(toISODateLocal(activeDate)) || null;
      const overrideDayIndex = activeDoOverride
        ? Math.max(1, Math.min(days.length, Number(activeDoOverride.dayIndex) || 0))
        : 0;
      const activeDayIndex = overrideDayIndex || baseActiveDayIndex;
      const isDoOverrideActive = Boolean(overrideDayIndex) && overrideDayIndex !== baseActiveDayIndex;
      const activeDay = activeDayIndex || -1;
      const pageWorkoutContext = {
        planId: state.planRow?.id || null,
        weekIndex: activeWeek,
        dayIndex: activeDayIndex,
        activeDate: toISODateLocal(activeDate)
      };
      if (!workoutTimer.running && !workoutTimer.paused) {
        workoutTimer.context = pageWorkoutContext;
      } else if (String(workoutTimer.context?.planId || '').trim() !== String(state.planRow?.id || '').trim()) {
        workoutTimer.context = pageWorkoutContext;
      }

      const todayStart = dayStart(today);
      const isToday = dayStart(activeDate).getTime() === todayStart.getTime();
      const dateBlockerDisabled = isDemoDateBlockerDisabled(state.auth.user);
      const timerActiveOnThisDay = timerLockedDateIso && timerLockedDateIso === toISODateLocal(activeDate);
      const canStartWorkoutOnActiveDate = Boolean(!isHistoryDate && (isToday || dateBlockerDisabled || timerActiveOnThisDay));
      const activeDayPlan = activeDayIndex ? (days[activeDayIndex - 1] || null) : null;
      const activeDayFocus = String(activeDayPlan?.focus || '').trim() || (activeDayIndex ? `Day ${activeDayIndex}` : 'today');
      const findNextScheduledWorkoutDate = (fromDate) => {
        const start = dayStart(fromDate);
        for (let offset = 1; offset <= 120; offset += 1) {
          const probe = new Date(start);
          probe.setDate(start.getDate() + offset);
          const candidate = dayStart(probe);
          if (isScheduledWorkoutDate(candidate)) return candidate;
        }
        return null;
      };
      const findPreviousScheduledWorkoutDate = (fromDate) => {
        const start = dayStart(fromDate);
        for (let offset = 1; offset <= 120; offset += 1) {
          const probe = new Date(start);
          probe.setDate(start.getDate() - offset);
          const candidate = dayStart(probe);
          if (candidate.getTime() < dayStart(minDate).getTime()) break;
          if (isScheduledWorkoutDate(candidate)) return candidate;
        }
        return null;
      };
      const askSkipReason = (focusLabel) => {
        const reasonRaw = window.prompt(`Why are you skipping ${focusLabel}?`);
        if (reasonRaw === null) return null;
        const reason = String(reasonRaw || '').trim();
        if (!reason) {
          window.alert('Please type a reason to skip this day.');
          return null;
        }
        return reason;
      };
      const recordSkipLog = ({ skipDate, reason, sourceDate, retroactive, mode }) => {
        const skipIso = toISODateLocal(skipDate);
        if (!skipIso) return { ok: false, error: 'Invalid skip date.' };
        const skipStart = dayStart(skipDate);
        if (skipStart.getTime() > todayStart.getTime()) {
          return { ok: false, error: 'You cannot log a future skip.' };
        }
        if (skipLogByDate.has(skipIso)) return { ok: false, error: `A skip is already logged for ${skipIso}.` };
        const modeKey = String(mode || '').trim().toLowerCase() === 'rest_skip' ? 'rest_skip' : 'workout_skip';
        writeTrainingSkipLog([
          ...skipLogEntries,
          {
            skipDate: skipIso,
            mode: modeKey,
            reason: String(reason || '').trim(),
            sourceDate: sourceDate ? toISODateLocal(sourceDate) : null,
            retroactive: retroactive === true,
            loggedAt: new Date().toISOString()
          }
        ]);
        return { ok: true };
      };
      const skipToNextWorkoutDay = () => {
        const activeIso = toISODateLocal(activeDate);
        if (dayStart(activeDate).getTime() > todayStart.getTime()) {
          window.alert('You cannot log a skip for a future day.');
          return;
        }
        const isWorkoutDay = Number.isFinite(Number(activeDayIndex)) && Number(activeDayIndex) > 0;
        const skipMode = isWorkoutDay ? 'workout_skip' : 'rest_skip';
        const skipLabel = isWorkoutDay
          ? `Mark ${activeDayFocus} on ${activeIso} as skipped?`
          : `Skip rest day on ${activeIso} and pull the next workout onto today?`;
        const proceed = window.confirm(skipLabel);
        if (!proceed) return;

        const reason = askSkipReason(isWorkoutDay ? activeDayFocus : `rest day on ${activeIso}`);
        if (!reason) return;
        const finalPrompt = window.confirm(
          `${isWorkoutDay ? 'Confirm workout skip' : 'Confirm rest-day skip'} on ${activeIso}?\nReason: ${reason}`
        );
        if (!finalPrompt) return;

        const logged = recordSkipLog({
          skipDate: activeDate,
          reason,
          sourceDate: activeDate,
          retroactive: false,
          mode: skipMode
        });
        if (!logged.ok) {
          window.alert(logged.error || 'Could not log skipped day.');
          return;
        }
        state.planError = '';
        setActiveDate(activeDate);
      };
      const todayIso = toISODateLocal(todayStart);
      const undoableSkipEntry = skipLogByDate.get(todayIso) || null;
      const canUndoSkipToday = Boolean(undoableSkipEntry);
      const undoTodaySkip = () => {
        if (!canUndoSkipToday || !undoableSkipEntry) return;
        const modeLabel = skipModeOf(undoableSkipEntry) === 'rest_skip' ? 'rest' : 'workout';
        const proceed = window.confirm(`Undo ${modeLabel} skip for ${todayIso}?`);
        if (!proceed) return;
        const nextEntries = skipLogEntries.filter((entry) => String(entry?.skipDate || '').trim() !== todayIso);
        if (nextEntries.length === skipLogEntries.length) {
          window.alert('No skip found to undo for today.');
          return;
        }
        writeTrainingSkipLog(nextEntries);
        state.planError = '';
        const undoDate = parseISODateLocal(todayIso);
        if (undoDate) {
          setActiveDate(undoDate);
          return;
        }
        render();
      };

      // --- "Do another day": swap today's workout for a chosen plan day ------
      const doOverlayStyle = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:18px;background:rgba(6,9,15,0.72);';
      const doCardStyle = 'max-width:440px;width:100%;background:#fff;border-radius:16px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,0.35);font-family:system-ui,-apple-system,\'Segoe UI\',sans-serif;';
      const openDoAnotherDay = () => {
        const activeIso = toISODateLocal(activeDate);
        if (dayStart(activeDate).getTime() > todayStart.getTime()) {
          window.alert('You can only do a workout for today or a past day.');
          return;
        }
        const choices = days.map((d, i) => ({
          dayIndex: i + 1,
          focus: String(d?.focus || '').trim() || `Day ${i + 1}`,
          title: getDayTitle(d) || (String(d?.focus || '').trim() || `Day ${i + 1}`)
        }));
        if (!choices.length) { window.alert('This plan has no workout days to choose from.'); return; }

        const overlay = el('div', { style: doOverlayStyle });
        const close = () => { try { overlay.remove(); } catch { /* ignore */ } };
        const card = el('div', { style: doCardStyle },
          el('div', { style: 'font-weight:800;font-size:1.05rem;margin-bottom:4px;color:#1f2937' }, 'Do a different day today'),
          el('div', { style: 'font-size:0.86rem;color:#64748b;line-height:1.45;margin-bottom:14px' },
            `Pick the workout to do on ${activeIso}. It replaces what's scheduled for that date and logs against the day you pick.`),
          el('div', { style: 'display:grid;gap:8px;max-height:46vh;overflow:auto' },
            ...choices.map((c) => el('button', {
              type: 'button',
              class: 'btn btn-ghost',
              style: `text-align:left;justify-content:flex-start;${c.dayIndex === baseActiveDayIndex ? 'border-color:#a1751f;' : ''}`,
              onclick: () => {
                close();
                const reasonRaw = window.prompt(`Why are you doing "${c.focus}" instead of your scheduled workout on ${activeIso}?`);
                if (reasonRaw === null) return;
                const reason = String(reasonRaw || '').trim();
                if (!reason) { window.alert('Please type a reason for the change.'); return; }
                const confirmed = window.confirm(`Do "${c.focus}" on ${activeIso} instead?\nReason: ${reason}`);
                if (!confirmed) return;
                writeDoOverrideLog([
                  ...doOverrideEntries.filter((e) => String(e?.doDate || '').trim() !== activeIso),
                  { doDate: activeIso, dayIndex: c.dayIndex, focus: c.focus, reason, loggedAt: new Date().toISOString() }
                ]);
                state.planError = '';
                setActiveDate(activeDate);
              }
            },
              el('span', { style: 'font-weight:700' }, `Day ${c.dayIndex}: ${c.focus}`),
              c.dayIndex === baseActiveDayIndex ? el('span', { style: 'margin-left:8px;color:#a1751f;font-size:0.78rem;font-weight:700' }, '(scheduled)') : null
            ))
          ),
          el('button', { type: 'button', class: 'btn btn-ghost', style: 'margin-top:14px;width:100%', onclick: close }, 'Cancel')
        );
        overlay.appendChild(card);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.body.appendChild(overlay);
      };
      const clearDoOverrideForActiveDate = () => {
        if (!isDoOverrideActive) return;
        const activeIso = toISODateLocal(activeDate);
        const proceed = window.confirm(`Go back to your scheduled workout for ${activeIso}?`);
        if (!proceed) return;
        writeDoOverrideLog(doOverrideEntries.filter((e) => String(e?.doDate || '').trim() !== activeIso));
        state.planError = '';
        setActiveDate(activeDate);
      };

      const shareBox = el('div', { class: 'plan-topbar-share' },
      el('div', { class: 'plan-topbar-share-row', 'data-workout-timer-anchor': '1' },
        el('div', { class: 'plan-topbar-timer-stack' },
          canStartWorkoutOnActiveDate
            ? el('button', {
              type: 'button',
              class: `btn btn-start-workout${workoutTimer.running ? ' is-live' : workoutTimer.paused ? ' is-paused' : ''}`,
              onclick: () => {
                if (workoutTimer.running) confirmEndWorkout();
                else startWorkoutTimer(pageWorkoutContext);
              }
            }, workoutTimer.running ? 'End workout' : workoutTimer.paused ? 'Resume workout' : 'Start workout')
            : null,
          canStartWorkoutOnActiveDate ? el('div', { class: 'workout-timer-pill hidden', id: 'workout-timer-display' }, 'Workout 0:00') : null
        ),
        el('button', {
          type: 'button',
          class: `btn btn-share-workout${canShare ? '' : ' is-disabled'}`,
          dataset: { shareWorkout: '1' },
          'aria-disabled': canShare ? 'false' : 'true',
          onclick: async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!canShare) {
              const authed = await ensureShareAuth({ promptOnFail: false });
              if (!authed) {
                openAuthModal('login');
                return;
              }
              toggleSharePopover(true);
              return;
            }
            toggleSharePopover();
          }
        }, 'Share Workout')
      ),
      shareMembersStrip,
      el('div', {
        class: `share-workout-popover${shareUi.open ? '' : ' hidden'}`,
        id: 'share-workout-popover'
      },
        el('div', { class: 'share-workout-head-row' },
          el('div', { class: 'share-workout-title' }, 'Share workout'),
          el('div', {
            class: 'share-workout-mode-toggle',
            role: 'tablist',
            'aria-label': 'Share mode'
          },
          el('button', {
            type: 'button',
            class: `share-workout-mode-btn${isAppShareMode ? ' active' : ''}`,
            role: 'tab',
            'aria-selected': isAppShareMode ? 'true' : 'false',
            onclick: (e) => {
              e.preventDefault();
              setShareMode('app');
              render();
            }
          }, 'APP'),
          el('button', {
            type: 'button',
            class: `share-workout-mode-btn${isSmsShareMode ? ' active' : ''}`,
            role: 'tab',
            'aria-selected': isSmsShareMode ? 'true' : 'false',
            onclick: (e) => {
              e.preventDefault();
              setShareMode('sms');
              render();
            }
          }, 'SMS'),
          el('button', {
            type: 'button',
            class: `share-workout-mode-btn${isPdfShareMode ? ' active' : ''}`,
            role: 'tab',
            'aria-selected': isPdfShareMode ? 'true' : 'false',
            onclick: (e) => {
              e.preventDefault();
              setShareMode('pdf');
              render();
              openWorkoutPdfQrModal();
            }
          }, 'PDF')
          )
        ),
        isPdfShareMode
          ? el('div', { class: 'share-workout-pdf-panel' },
            el('div', { class: 'share-workout-pdf-copy' }, 'Generate a workout PDF and share it with a QR code.'),
            el('div', { class: 'share-workout-pdf-actions' },
              el('button', { type: 'button', class: 'btn btn-ghost', onclick: printSimplePlanPdfV2 }, 'Open PDF'),
              el('button', { type: 'button', class: 'btn btn-share-workout', onclick: openWorkoutPdfQrModal }, 'Show QR')
            )
          )
          : [
            el('div', { class: 'share-workout-search' },
              el('input', {
                type: 'text',
                class: 'auth-input share-workout-input',
                value: shareUi.query || '',
                placeholder: isSmsShareMode ? 'Search friends for SMS' : 'Search friends',
                oninput: (e) => {
                  shareUi.query = e.target.value;
                },
                onkeydown: (e) => {
                  if (e.key === 'Enter') loadShareAccounts(shareUi.query || '');
                }
              }),
              el('button', { type: 'button', class: 'btn btn-ghost share-workout-search-btn', onclick: () => loadShareAccounts(shareUi.query || '') }, 'Search')
            ),
            el('div', { class: 'share-workout-status' }, shareUi.status || ''),
            el('div', { class: 'share-workout-list' }, shareListItems)
          ]
      )
    );
    const header = el('div', { class: 'training-card plan-topbar' },
      el('div', { class: 'plan-topbar-main' },
        el('h3', { style: 'margin:0 0 0.25rem' }, 'Your training plan'),
        el('div', { class: 'training-muted' },
          `${String(plan.meta?.discipline || '').toUpperCase()} • ${plan.meta?.daysPerWeek} days/week • ${String(plan.meta?.experience || '').toUpperCase()}`
        ),
        isDeloadWeek ? el('div', { class: 'training-muted', style: 'margin-top:0.35rem' }, 'Deload week: load and sets are reduced; no progression.') : null,
        pendingLabel ? el('div', { class: 'training-muted', style: 'margin-top:0.35rem' }, pendingLabel) : null
      ),
      shareBox,
      (() => {
        const dropdown = el('div', {
          class: `plan-topbar-actions-dropdown${planTopbarActionsDropdownOpen ? ' open' : ''}`,
          'aria-hidden': planTopbarActionsDropdownOpen ? 'false' : 'true'
        },
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: openScheduleChangeModal }, 'Change workout days'),
          el('div', { class: 'plan-topbar-skip-row' },
            el('button', {
              type: 'button',
              class: 'btn btn-ghost',
              title: 'Do a different day\'s workout today',
              onclick: isDoOverrideActive ? clearDoOverrideForActiveDate : openDoAnotherDay
            }, isDoOverrideActive ? 'Undo swap' : 'Do?'),
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: skipToNextWorkoutDay }, 'Skipping'),
            el('button', {
              type: 'button',
              class: `plan-topbar-skip-undo${canUndoSkipToday ? ' is-active' : ''}`,
              disabled: canUndoSkipToday ? null : 'disabled',
              'aria-disabled': canUndoSkipToday ? 'false' : 'true',
              title: canUndoSkipToday ? 'Undo today\'s skip' : 'Undo is available only for skips logged today',
              onclick: (e) => {
                e.preventDefault();
                if (!canUndoSkipToday) return;
                undoTodaySkip();
              }
            }, 'Undo')
          )
        );
        const toggle = el('button', {
          type: 'button',
          class: 'plan-topbar-actions-toggle',
          'aria-expanded': planTopbarActionsDropdownOpen ? 'true' : 'false',
          'aria-label': 'More workout options',
          onclick: (e) => {
            e.preventDefault();
            planTopbarActionsDropdownOpen = !planTopbarActionsDropdownOpen;
            dropdown.classList.toggle('open', planTopbarActionsDropdownOpen);
            dropdown.setAttribute('aria-hidden', planTopbarActionsDropdownOpen ? 'false' : 'true');
            toggle.setAttribute('aria-expanded', planTopbarActionsDropdownOpen ? 'true' : 'false');
            toggle.textContent = planTopbarActionsDropdownOpen ? '^' : 'v';
          }
        }, planTopbarActionsDropdownOpen ? '^' : 'v');
        return el('div', { class: 'plan-topbar-actions' },
          el('div', { class: 'plan-topbar-actions-mainrow' },
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: resetTrainingPlanAndRestart }, 'Make New Workout'),
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: printSimplePlanPdfV2 }, 'Simple PDF'),
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: printComplexPlanPdf }, 'Complex PDF'),
            canRegenerateWithNewRules
              ? el('button', { type: 'button', class: 'btn btn-primary', onclick: regeneratePlanWithSavedRules }, 'Regenerate With New Rules')
              : null,
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: openWorkoutEditorFromPlan }, 'Modify Current Workout')
          ),
          el('div', { class: 'plan-topbar-actions-toggle-row' }, toggle),
          dropdown
        );
      })()
    );

    const shell = el('div', { class: 'plan-shell' }, header);
    if (isPreview) {
      shell.appendChild(
        el('div', { class: 'training-card', style: 'margin: 0.8rem 0' },
          el('div', { class: 'training-row' },
            el('div', null,
              el('div', { style: 'font-weight:800' }, 'Preview mode'),
              el('div', { class: 'training-muted' }, 'Sign in to save workouts, track progress, and auto-adjust the plan week to week.')
            ),
            el('div', { class: 'training-actions' },
              el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openAuthModal('login') }, 'Sign in / Create account')
            )
          )
        )
      );
    }
    if (state.planError) {
      shell.appendChild(el('div', { class: 'auth-error' }, state.planError));
    }

    const DAY_TABS_COLLAPSE_KEY = 'ode_training_day_tabs_collapsed_v1';
    let dayTabsCollapsed = sessionStorage.getItem(DAY_TABS_COLLAPSE_KEY) === '1';
    shell.classList.toggle('daylist-collapsed', dayTabsCollapsed);

    const setActiveDate = (date) => {
        const clamped = clampDate(date);
        if (!clamped) return;
        const timerDayIso = getActiveWorkoutTimerDayIso();
        const nextIso = toISODateLocal(clamped);
        if (timerDayIso && nextIso && timerDayIso !== nextIso) {
          showWorkoutTimerLockedToast();
          return;
        }
        const nextWeekIndex = weekIndexForDate(clamped, plan);
        const nextWeekday = clamped.getDay();
        writeTrainingPlanNavValue('week', String(nextWeekIndex), { planId: state.planRow?.id });
        writeTrainingPlanNavValue(`day_${nextWeekIndex}`, `wd:${nextWeekday}`, { planId: state.planRow?.id });
        writeTrainingPlanNavValue('week_expanded', String(nextWeekIndex), { planId: state.planRow?.id });
        writeTrainingPlanNavValue('active_date', toISODateLocal(clamped), { planId: state.planRow?.id });
        render();
      };

    const jumpToTodayWorkout = () => {
      setActiveDate(dayStart(new Date()));
    };

    const buildJumpToTodayLabel = (labelText) => el('div', {
      class: 'workout-rel-label',
      role: 'button',
      tabindex: '0',
      title: "Go to today's workout",
      'aria-label': "Go to today's workout",
      onclick: () => jumpToTodayWorkout(),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          jumpToTodayWorkout();
        }
      }
    }, labelText);

    const dayTabs = el('div', { class: 'day-tabs' },
        WEEKDAY_ORDER.map((weekday) => {
          const dayIndex = weekdayToDayIndex.get(weekday) || null;
          const day = dayIndex ? days[dayIndex - 1] : null;
          const abbr = WEEKDAYS_SHORT[weekday] || String(WEEKDAYS[weekday] || '').slice(0, 1);
          const tabDate = dateForWeekday(activeWeek, weekday, plan);
          const tabDateLabel = tabDate
            ? `${tabDate.getMonth() + 1}/${tabDate.getDate()}`
            : '';
          const key = dayIndex ? `${activeWeek}:${dayIndex}` : null;
          const tabLog = key ? (logsMap.get(key) || null) : null;
          const saved = Boolean(tabLog);
          const tabDuration = getWorkoutLogDurationMs(tabLog);
          const tabDurationLabel = tabDuration > 0 ? formatWorkoutElapsed(tabDuration) : '';
          return el('button', {
            type: 'button',
            class: `day-tab ${weekday === activeWeekday ? 'active' : ''}`,
            onclick: () => {
              setActiveDate(dateForWeekday(activeWeek, weekday, plan));
            }
          },
        el('div', { class: 'day-tab-title' },
          el('span', null, WEEKDAYS[weekday]),
          el('span', { class: 'day-tab-abbr', 'aria-hidden': 'true' }, abbr),
          el('span', { class: 'day-tab-date', 'aria-hidden': 'true' }, tabDateLabel),
          el('span', { class: `day-dot ${saved ? 'good' : ''}`, title: saved ? 'Saved' : 'Not saved' })
        ),
        el('div', { class: 'day-tab-meta' },
            day
              ? `Day ${dayIndex} • ${day.focus || 'Workout'} • ${day.exercises?.length || 0} exercises${tabDurationLabel ? ` • ${tabDurationLabel}` : ''}`
              : 'Workout not scheduled'
          ));
      })
    );

    dayTabs.id = 'training-day-tabs';

    const workoutsToggle = el('button', {
      type: 'button',
      class: `workouts-toggle ${dayTabsCollapsed ? 'collapsed' : ''}`.trim(),
      'aria-controls': dayTabs.id,
      'aria-expanded': dayTabsCollapsed ? 'false' : 'true',
      'aria-label': dayTabsCollapsed ? 'Show workouts list' : 'Hide workouts list',
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        dayTabsCollapsed = !dayTabsCollapsed;
        try {
          sessionStorage.setItem(DAY_TABS_COLLAPSE_KEY, dayTabsCollapsed ? '1' : '0');
        } catch {
          // ignore
        }
        workoutsCard.classList.toggle('collapsed', dayTabsCollapsed);
        workoutsToggle.classList.toggle('collapsed', dayTabsCollapsed);
        shell.classList.toggle('daylist-collapsed', dayTabsCollapsed);
        workoutsToggle.setAttribute('aria-expanded', dayTabsCollapsed ? 'false' : 'true');
        workoutsToggle.setAttribute('aria-label', dayTabsCollapsed ? 'Show workouts list' : 'Hide workouts list');
      }
    },
    el('span', { class: 'workouts-toggle-icon', 'aria-hidden': 'true' }, '›')
    );

    const workoutsCard = el('div', { class: `training-card workouts-card ${dayTabsCollapsed ? 'collapsed' : ''}`.trim() },
      el('div', { class: 'training-row', style: 'justify-content:space-between; align-items:center; gap:0.6rem' },
        el('div', { class: 'workouts-head-left' },
          el('div', { style: 'font-weight:850; letter-spacing:-0.01em' }, 'Workouts'),
          el('div', { class: 'training-muted' }, 'Pick a day to view details')
        ),
        workoutsToggle
      ),
      dayTabs
    );

    let dayDetail = null;

    // Week view: select a day (instead of dumping every workout at once)
    days.forEach((day, idx) => {
      const dayIndex = idx + 1;
      applySwapOverridesToDay({
        day,
        planId: state.planRow?.id,
        weekIndex: activeWeek,
        dayIndex
      });
      if (dayIndex !== activeDay) return;
      const key = `${activeWeek}:${dayIndex}`;
      const log = logsMap.get(key) || null;
      const dispCur = { title: WEEKDAYS[activeWeekday], dayNumber: dayIndex };
      const workoutDurationMs = getWorkoutLogDurationMs(log);
      const savedBadge = log
        ? el('span', { class: 'training-badge good', title: workoutDurationMs > 0 ? `Workout time ${formatWorkoutElapsed(workoutDurationMs)}` : 'Saved workout' }, workoutDurationMs > 0 ? `Saved • ${formatWorkoutElapsed(workoutDurationMs)}` : 'Saved')
        : el('span', { class: 'training-badge' }, 'Not saved');
      const currentEntryMap = buildWorkoutEntryIndex(log?.entries || []);
      const historicalPerfMap = performanceMapBeforeSlot({
        logs: state.logs,
        beforeWeekIndex: activeWeek,
        beforeDayIndex: dayIndex,
        daysPerWeek
      });
      const previousEntryMap = previousEntryMapBeforeSlot({
        logs: state.logs,
        beforeWeekIndex: activeWeek,
        beforeDayIndex: dayIndex,
        daysPerWeek
      });

      function shiftDay(delta) {
        const currentDate = activeDate;
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + delta);
        setActiveDate(nextDate);
      }

      function relativeWorkoutLabel() {
        return formatDateDMY(activeDate);
      }

      const canGoPrev = dayStart(new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate() - 1)) >= minDate;
      const canGoNext = dayStart(new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate() + 1)) <= maxDate;

      const todayTitle = getDayTitle(day);
      const todayBar = el('div', { class: 'workout-today-bar' },
        el('div', { class: 'workout-today-title-row' },
          el('div', { class: 'workout-today-title' }, todayTitle),
          isDeloadWeek
            ? el('span', { class: 'projected-pill is-deload', title: 'This week is a deload week. Target weights are intentionally reduced.' }, 'Deload week')
            : null
        ),
        el('div', { class: 'workout-today-sub' }, `${dispCur.title} • Week ${activeWeek}`),
        el('div', { class: 'workout-today-nav' },
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoPrev ? null : 'true', onclick: () => shiftDay(-1), 'aria-label': 'Previous day' }, '‹'),
          buildJumpToTodayLabel(relativeWorkoutLabel()),
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoNext ? null : 'true', onclick: () => shiftDay(1), 'aria-label': 'Next day' }, '›')
        )
      );

      const exp = String(plan.meta?.experience || '').toLowerCase();
      const goalLine = exp === 'beginner'
        ? 'Goal: stay under RPE 8 • hit the top of the rep range with clean form'
        : 'Goal: beat last time (reps first, then load) • main lift can push to RPE 9–10 on final set';

      const performedAtValue = log?.performed_at ? String(log.performed_at).slice(0, 10) : toISODateLocal(activeDate);
      const dayNotesValue = log?.notes || '';
      workoutAutosaveContext = {
        weekIndex: activeWeek,
        dayIndex,
        exercises: day.exercises || [],
        dayNotes: dayNotesValue,
        performedAt: performedAtValue
      };

      ensureExerciseCatalogLoaded();
      applySwapOverridesToDay({
        day,
        planId: state.planRow?.id,
        weekIndex: activeWeek,
        dayIndex
      });

      const list = el('div', { class: 'exercise-list' });
      (day.exercises || []).forEach((ex, exIdx) => {
        const isCustomWorkout = Array.isArray(ex?.tags) && ex.tags.includes('custom');
        const exerciseKey = resolveWorkoutExerciseKey(ex);
        const lookupValues = {
          baseId: ex?.baseId,
          exerciseId: ex?.exerciseId || ex?.id,
          exerciseName: ex?.displayName || ex?.name
        };
        const previousEntry = pickLiftHistoryRecord(previousEntryMap, lookupValues);
        const currentEntry = pickLiftHistoryRecord(currentEntryMap, lookupValues);
        const persistentLift = pickLiftHistoryRecord(state.liftHistory, lookupValues);
        const historicalPerformance = pickLiftHistoryRecord(historicalPerfMap, lookupValues);
        const crossPlanHistory = findLatestMatchingLogData({
          logs: state.allLogs,
          values: lookupValues,
          beforeDate: performedAtValue || activeDateIso
        });

        const repsTarget = Number.isFinite(ex?.progression?.repsTarget) ? ex.progression.repsTarget : parseRepsTarget(ex.reps);
        const technique = ex?.progression?.technique && String(ex.progression.technique).trim().toLowerCase() !== 'none'
          ? String(ex.progression.technique).trim()
          : '';
        const restTimerActiveForExercise = isRestTimerExerciseActive(ex.displayName || ex.name || 'Exercise');
        const restButtonLabel = restTimerActiveForExercise
          ? `Rest ${formatRestCountdown(getWorkoutRestRemainingMs())}`
          : 'Start rest';

          const defaultSetCount = (() => {
            const raw = String(ex.sets ?? '').trim();
            const num = Number(raw);
            if (Number.isFinite(num)) return Math.max(0, Math.min(12, Math.round(num)));
            const m = raw.match(/(\d+)/);
            if (m) return Math.max(0, Math.min(12, Number(m[1])));
            return 0;
          })();
          const savedSetCount = (() => {
            const prescribedCount = Number(currentEntry?.prescribed?.sets);
            const setsLength = Array.isArray(currentEntry?.sets) ? currentEntry.sets.length : 0;
            const counts = [prescribedCount, setsLength].filter((value) => Number.isFinite(value) && value > 0);
            return counts.length ? Math.max(...counts) : 0;
          })();
          const setCount = getWorkoutSetCountDraft({
            exId: exerciseKey,
            exSlot: exIdx,
            weekIndex: activeWeek,
            dayIndex,
            fallback: Math.max(defaultSetCount, savedSetCount)
          });
        const sysProg = systemProgressionTarget(ex, activeDate, plan);
        const dispReps = sysProg ? sysProg.reps : ex.reps;
        const setsRepsRest = `${setCount} sets \u00D7 ${dispReps} reps \u00D7 rest ${fmtRest(ex.restSec)}`;
        const sysProgNote = sysProg
          ? (sysProg.hasWeight
            ? `Auto progression \u2022 Week ${sysProg.week}: aim ${sysProg.reps} reps @ ${sysProg.weight} lb` + (sysProg.justReset ? ' (weight went up \u2014 reps reset)' : ' (reps climb, then weight)')
            : `Auto progression \u2022 Week ${sysProg.week}: aim ${sysProg.reps} reps (reps climb, then weight)`)
          : '';
          const baseSetCount = (() => {
            if (Number.isFinite(ex._baseSets)) return Math.max(0, Math.min(12, Math.round(ex._baseSets)));
            ex._baseSets = defaultSetCount;
            return defaultSetCount;
          })();
          const addSetForExercise = () => {
            if (!workoutTimer.running) {
              showWorkoutInputGateToast();
              return;
            }
            const next = Math.min(12, setCount + 1);
            if (next === setCount) return;
            captureVisibleWorkoutInputDrafts();
            setWorkoutSetCountDraft({
              exId: exerciseKey,
              exSlot: exIdx,
              weekIndex: activeWeek,
              dayIndex,
              count: next
            });
            if (state.auth.user && workoutAutosaveContext) scheduleWorkoutAutosave();
            render();
          };
          const removeSetForExercise = () => {
            if (!workoutTimer.running) {
              showWorkoutInputGateToast();
              return;
            }
            if (setCount <= baseSetCount) return;
            captureVisibleWorkoutInputDrafts();
            setWorkoutSetCountDraft({
              exId: exerciseKey,
              exSlot: exIdx,
              weekIndex: activeWeek,
              dayIndex,
              count: Math.max(baseSetCount, setCount - 1)
            });
            if (state.auth.user && workoutAutosaveContext) scheduleWorkoutAutosave();
            render();
          };
          const setLog = setCount
            ? el('div', { class: 'exercise-setlog' },
              el('div', { class: 'exercise-set-header' },
                el('span', null, 'Set'),
                el('span', null, 'Weight'),
                el('span', null, 'Reps'),
                el('span', null, 'Notes')
              ),
              ...Array.from({ length: setCount }, (_, idx) => {
                const previousSet = previousEntry?.sets?.[idx] && typeof previousEntry.sets[idx] === 'object'
                  ? previousEntry.sets[idx]
                  : null;
                const currentSet = currentEntry?.sets?.[idx] && typeof currentEntry.sets[idx] === 'object'
                  ? currentEntry.sets[idx]
                  : null;
                const wVal = getWorkoutInputDraftValue({
                  exId: exerciseKey,
                  exSlot: exIdx,
                  setIdx: idx,
                  field: 'setWeight',
                  fallback: Number.isFinite(Number(currentSet?.weight)) ? String(currentSet.weight) : '',
                  weekIndex: activeWeek,
                  dayIndex
                });
                const rVal = getWorkoutInputDraftValue({
                  exId: exerciseKey,
                  exSlot: exIdx,
                  setIdx: idx,
                  field: 'setReps',
                  fallback: Number.isFinite(Number(currentSet?.reps)) ? String(currentSet.reps) : '',
                  weekIndex: activeWeek,
                  dayIndex
                });
                const noteVal = getWorkoutInputDraftValue({
                  exId: exerciseKey,
                  exSlot: exIdx,
                  setIdx: idx,
                  field: 'setNote',
                  fallback: currentSet?.note ? String(currentSet.note) : '',
                  weekIndex: activeWeek,
                  dayIndex
                });
                const weightPlaceholder = Number.isFinite(Number(previousSet?.weight))
                  ? `${previousSet.weight} lb last week`
                  : 'Weight';
                const repsPlaceholder = Number.isFinite(Number(previousSet?.reps))
                  ? `${previousSet.reps} reps last week`
                  : 'Reps';
                const notePlaceholder = previousSet?.note
                  ? `${String(previousSet.note).slice(0, 40)} last week`
                  : 'Notes';
                const inputIdBase = String(ex.id || ex.baseId || ex.name || 'exercise')
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]+/g, '-')
                  .replace(/^-+|-+$/g, '')
                  .slice(0, 60) || 'exercise';
                return el('div', { class: 'exercise-set-row' },
                  el('span', { class: 'exercise-set-label' }, `Set ${idx + 1}`),
                  el('input', {
                    id: `training-set-${activeWeek}-${dayIndex}-${exIdx}-${inputIdBase}-${idx}-weight`,
                    class: 'auth-input',
                    inputmode: 'decimal',
                    value: wVal,
                    dataset: { exId: exerciseKey, exSlot: String(exIdx), field: 'setWeight', setIdx: String(idx), weekIdx: String(activeWeek), dayIdx: String(dayIndex) },
                    placeholder: weightPlaceholder
                  }),
                  el('input', {
                    id: `training-set-${activeWeek}-${dayIndex}-${exIdx}-${inputIdBase}-${idx}-reps`,
                    class: 'auth-input',
                    inputmode: 'numeric',
                    value: rVal,
                    dataset: { exId: exerciseKey, exSlot: String(exIdx), field: 'setReps', setIdx: String(idx), weekIdx: String(activeWeek), dayIdx: String(dayIndex) },
                    placeholder: repsPlaceholder
                  }),
                  el('input', {
                    id: `training-set-${activeWeek}-${dayIndex}-${exIdx}-${inputIdBase}-${idx}-note`,
                    class: 'auth-input',
                    value: noteVal,
                    dataset: { exId: exerciseKey, exSlot: String(exIdx), field: 'setNote', setIdx: String(idx), weekIdx: String(activeWeek), dayIdx: String(dayIndex) },
                    placeholder: notePlaceholder
                  })
                );
              }),
              el('div', { class: 'exercise-set-add-row' },
                el('span', { 'aria-hidden': 'true' }, ''),
                el('span', { 'aria-hidden': 'true' }, ''),
                el('span', { 'aria-hidden': 'true' }, ''),
                el('div', { class: 'exercise-set-actions' },
                  setCount > baseSetCount
                    ? el('button', {
                      type: 'button',
                      class: 'exercise-set-remove',
                      title: 'Remove last set',
                      'aria-label': 'Remove last set',
                      disabled: workoutTimer.running ? null : 'disabled',
                      'aria-disabled': workoutTimer.running ? 'false' : 'true',
                      onclick: removeSetForExercise
                    }, '–')
                    : null,
                  el('button', {
                    type: 'button',
                    class: 'exercise-set-add',
                    title: 'Add set',
                    'aria-label': 'Add set',
                    disabled: workoutTimer.running ? null : 'disabled',
                    'aria-disabled': workoutTimer.running ? 'false' : 'true',
                    onclick: addSetForExercise
                  }, '+')
                )
              )
            )
            : null;
        const targetSeed = resolveTargetSeedForExercise(ex, {
          previousEntry,
          historicalPerformance,
          crossPlanPerformance: crossPlanHistory.performance,
          persistentLift,
          currentPerformedAt: performedAtValue
        });
        const projected = fmtProjected(resolveProjectedForExercise(ex, plan, {
          previousEntry,
          historicalPerformance,
          crossPlanPerformance: crossPlanHistory.performance,
          persistentLift,
          lastPerformance: targetSeed,
          currentPerformedAt: performedAtValue
        }));
        const lastPerf = targetSeed
          || extractWorkoutEntryPerformance(currentEntry)
          || persistentLift?.last
          || historicalPerformance
          || crossPlanHistory.performance
          || null;
        const bestPerf = persistentLift?.best || null;
        const lastWeekCompact = (() => {
          if (!lastPerf) return '—';
          return formatPerformanceSummary(lastPerf);
        })();
        const lastWeekTitle = lastPerf?.performedAt
          ? `Last performed: ${lastPerf.performedAt}${lastWeekCompact !== '—' ? ` • ${lastWeekCompact}` : ''}`
          : 'No previous performance logged';
        const bestCompact = bestPerf ? formatPerformanceSummary(bestPerf) : '—';
        const bestTitle = bestPerf?.performedAt
          ? `Best logged: ${bestPerf.performedAt}${bestCompact !== '—' ? ` • ${bestCompact}` : ''}`
          : 'No best performance logged yet';

        const subs = Array.isArray(ex.substitutions)
          ? ex.substitutions.map((s) => String(s || '').trim()).filter(Boolean)
          : [];

        const media = resolveExerciseMedia(ex);
        const mediaSkeleton = el('div', { class: 'exercise-media-skeleton', 'aria-hidden': 'true' });
        const mediaFrame = el('div', { class: 'exercise-media-frame', 'aria-hidden': 'true' });
        const mediaNode = renderExerciseMedia(ex);
        mediaFrame.appendChild(mediaNode);
        mediaSkeleton.classList.add('hidden');

        const mediaBtn = el('button', {
          type: 'button',
          class: 'exercise-media-cell',
          'aria-label': `Preview ${String(ex?.name || 'exercise')}`,
          onclick: () => {
            if (!media) return;
            if (media.type === 'local-pair') {
              openExerciseMediaModal({
                type: 'image-pair',
                src0: toFreeExerciseDbRemotePath(media.src0) || media.src0,
                src1: toFreeExerciseDbRemotePath(media.src1) || media.src1,
                alt: String(ex?.name || 'Exercise')
              });
              return;
            }
            const type = media.type === 'video' ? 'video' : 'image';
            const src = toFreeExerciseDbRemotePath(media.src) || media.src;
            if (!src) return;
            openExerciseMediaModal({ type, src: String(src), alt: String(ex?.name || 'Exercise') });
          }
        }, mediaSkeleton, mediaFrame);

        list.appendChild(
          el('div', { class: 'exercise-row has-media' },
            mediaBtn,
            el('div', { class: 'exercise-meta' },
              el('div', { class: 'exercise-name-row' },
                el('div', { class: 'exercise-name' }, ex.displayName || ex.name),
                isCustomWorkout
                  ? el('button', {
                    type: 'button',
                    class: 'custom-workout-delete-btn',
                    title: 'Delete custom workout',
                    'aria-label': 'Delete custom workout',
                    onclick: () => {
                      removeCustomWorkoutExercise({
                        scheduledDay: day,
                        dateLike: activeDateIso,
                        exerciseId: ex.id
                      });
                    }
                  }, 'Delete')
                  : null
              ),
              el('div', { class: 'exercise-prescription' }, setsRepsRest),
              sysProgNote ? el('div', { class: 'training-muted', style: 'margin-top:0.35rem;color:#a1751f;font-weight:700' }, sysProgNote) : null,
              ex.tempo ? el('div', { class: 'exercise-substitutions' }, `Tempo: ${String(ex.tempo)}`) : null,
              ex.coaching?.progress ? el('div', { class: 'training-muted', style: 'margin-top:0.35rem' }, `Progress: ${String(ex.coaching.progress)}`) : null,
              ex.coaching?.regress ? el('div', { class: 'training-muted' }, `Regress: ${String(ex.coaching.regress)}`) : null,
              Number.isFinite(repsTarget) ? el('div', { class: 'exercise-substitutions' }, `Target reps: ${repsTarget}`) : null,
              el('div', { class: 'exercise-substitutions', title: lastWeekTitle }, `Last: ${lastWeekCompact}`),
              bestCompact !== '—'
                ? el('div', { class: 'exercise-substitutions', title: bestTitle }, `Best: ${bestCompact}`)
                : null,
              technique ? el('div', { class: 'exercise-substitutions' }, `Final-set technique: ${technique}`) : null,
              subs.length
                ? el('div', { class: 'exercise-substitutions' }, `Alt: ${subs.slice(0, 2).join(' • ')}`)
                : null,
              el('div', { class: 'exercise-badges' },
                el('span', { class: 'projected-pill', title: 'Target weight for this exercise' }, `Target weight ${projected}`)
              ),
              el('div', { class: 'exercise-action-row' },
                el('button', {
                  type: 'button',
                  class: 'btn btn-ghost btn-compact',
                  onclick: () => openSwapModal({ ex, dayIndex, weekIndex: activeWeek })
                }, 'Swap exercise'),
                el('button', {
                  type: 'button',
                  class: 'btn btn-ghost btn-compact',
                  onclick: () => openPainModal({ ex, dayIndex, weekIndex: activeWeek })
                }, 'Report pain'),
                el('button', {
                  type: 'button',
                  class: 'btn btn-rest-timer btn-compact',
                  dataset: { restExercise: ex.displayName || ex.name || 'Exercise' },
                  onclick: () => {
                    if (!workoutTimer.running) {
                      showWorkoutInputGateToast();
                      return;
                    }
                    startWorkoutRestTimer({
                      exerciseName: ex.displayName || ex.name || 'Exercise',
                      restSec: ex.restSec,
                      weekIndex: activeWeek,
                      dayIndex,
                      activeDate: performedAtValue || activeDateIso
                    });
                  }
                }, restButtonLabel)
              )
            ),
            el('div', { class: 'exercise-inputs' },
              setLog
            )
          )
        );
      });

      dayDetail = shell.appendChild(
        el('div', { class: 'day-card' },
          todayBar,
          isDoOverrideActive
            ? el('div', { class: 'training-subcard', style: 'margin:0 0 0.75rem;border-left:3px solid #a1751f;background:rgba(212,165,55,0.08)' },
              el('div', { style: 'font-weight:800;color:#a1751f' }, `Swapped: doing ${activeDoOverride?.focus || activeDayFocus} today`),
              activeDoOverride?.reason ? el('div', { class: 'training-muted', style: 'margin-top:0.2rem' }, `Reason: ${activeDoOverride.reason}`) : null,
              el('button', { type: 'button', class: 'btn btn-ghost', style: 'margin-top:0.5rem', onclick: clearDoOverrideForActiveDate }, 'Undo — back to scheduled')
            )
            : null,
          el('div', { class: 'training-section-line' }),
          (() => {
            try {
              const open = localStorage.getItem('ode_pain_followup_open') === '1';
              const due = localStorage.getItem('ode_pain_followup_at');
              const painReportId = localStorage.getItem('ode_pain_followup_id') || null;
              const todayIso = toISODateLocal(new Date());
              if (open && due && due <= todayIso) {
                return el('div', { class: 'training-subcard', style: 'margin:0 0 0.75rem' },
                  el('div', { style: 'font-weight:800' }, 'How does it feel today?'),
                  el('div', { class: 'training-muted' }, 'Quick check-in after a pain report.'),
                  el('div', { class: 'training-actions' },
                    el('button', {
                      type: 'button',
                      class: 'btn btn-ghost btn-compact',
                      onclick: () => {
                        try { localStorage.setItem('ode_pain_followup_open', '0'); } catch {}
                        logTrainingEvent('pain_followup', { painReportId, status: 'better', at: new Date().toISOString() });
                        render();
                      }
                    }, 'Better'),
                    el('button', {
                      type: 'button',
                      class: 'btn btn-ghost btn-compact',
                      onclick: () => {
                        try { localStorage.setItem('ode_pain_followup_open', '0'); } catch {}
                        logTrainingEvent('pain_followup', { painReportId, status: 'same', at: new Date().toISOString() });
                        render();
                      }
                    }, 'Same'),
                    el('button', {
                      type: 'button',
                      class: 'btn btn-ghost btn-compact',
                      onclick: () => {
                        try { localStorage.setItem('ode_pain_followup_open', '0'); } catch {}
                        logTrainingEvent('pain_followup', { painReportId, status: 'worse', at: new Date().toISOString() });
                        render();
                      }
                    }, 'Worse')
                  )
                );
              }
            } catch {
              // ignore
            }
            return null;
          })(),
          el('div', { class: 'day-head' },
            el('div', null,
              el('div', { class: 'day-title' }, dispCur.title),
              el('div', { class: 'training-muted' }, `Week ${activeWeek} • Day ${dayIndex} • ${day.exercises?.length || 0} exercises`)
            ),
            el('div', { class: 'training-actions', style: 'gap:0.45rem' },
              el('button', {
                type: 'button',
                class: 'btn btn-ghost btn-compact',
                onclick: () => openExplainModal({ plan, day })
              }, 'Explain the lifts'),
              savedBadge
            )
          ),
          el('div', { class: 'workout-goal' }, goalLine),
          el('div', { class: 'training-section-line' }),
          list,
          renderCustomWorkoutCta({
            onclick: () => openAddCustomWorkoutModal({
              scheduledDay: day,
              dateLike: activeDateIso,
              weekIndex: activeWeek,
              dayIndex,
              onDone: () => render()
            })
          }),
          el('div', { class: 'training-section-line' })
        )
       );
    });

    if (!dayDetail && isHistoryDate && historyLogsForActiveDate.length) {
      const shiftDay = (delta) => {
        const nextDate = new Date(activeDate);
        nextDate.setDate(nextDate.getDate() + delta);
        setActiveDate(nextDate);
      };
      const canGoPrev = dayStart(new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate() - 1)) >= minDate;
      const canGoNext = dayStart(new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate() + 1)) <= maxDate;
      const todayBar = el('div', { class: 'workout-today-bar' },
        el('div', { class: 'workout-today-title' }, 'Workout history'),
        el('div', { class: 'workout-today-sub' }, formatDateDMY(activeDate)),
        el('div', { class: 'workout-today-nav' },
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoPrev ? null : 'true', onclick: () => shiftDay(-1), 'aria-label': 'Previous day' }, '‹'),
          buildJumpToTodayLabel(formatDateDMY(activeDate)),
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoNext ? null : 'true', onclick: () => shiftDay(1), 'aria-label': 'Next day' }, '›')
        )
      );
      dayDetail = el('div', { class: 'day-card' },
        todayBar,
        el('div', { class: 'training-section-line' }),
        ...historyLogsForActiveDate.map((row, idx) => {
          const entries = Array.isArray(row?.entries) ? row.entries : [];
          return el('div', { class: 'day-card', style: idx > 0 ? 'margin-top:0.8rem' : '' },
            el('div', { class: 'day-head' },
              el('div', null,
                el('div', { class: 'day-title' }, `Saved workout • ${workoutLogDateIso(row) || formatDateDMY(activeDate)}`),
                el('div', { class: 'training-muted' }, row?.notes ? String(row.notes) : 'Logged on a previous training plan')
              ),
              el('span', { class: 'training-badge good' }, String(row?.plan_id || '').trim() === String(state.planRow?.id || '').trim() ? 'Current plan' : 'Previous plan')
            ),
            el('div', { class: 'training-section-line' }),
            ...(entries.length
              ? entries.map((entry) => {
                const summary = summarizeHistoryEntry(entry);
                return el('div', { class: 'exercise-card history-exercise-card', style: 'margin-bottom:0.6rem' },
                  el('div', { class: 'exercise-title history-exercise-title' }, String(entry?.exerciseName || entry?.displayName || entry?.name || 'Exercise')),
                  el('div', { class: 'training-muted history-exercise-summary' }, summary.summary),
                  summary.best ? el('div', { class: 'training-muted history-exercise-best' }, summary.best) : null,
                  summary.sets.length
                    ? el('div', { class: 'history-exercise-sets' },
                      ...summary.sets.map((setRow) =>
                        el('div', { class: 'history-exercise-set-row' },
                          el('span', { class: 'history-exercise-set-index' }, `Set ${setRow.index}`),
                          el('span', { class: 'history-exercise-set-value' }, setRow.text)
                        )
                      )
                    )
                    : null
                );
              })
              : [el('div', { class: 'training-muted' }, 'Workout saved without exercise details.')])
          );
        })
      );
    }

    if (!dayDetail) {
      const shiftDay = (delta) => {
        const nextDate = new Date(activeDate);
        nextDate.setDate(nextDate.getDate() + delta);
        setActiveDate(nextDate);
      };
      const canGoPrev = dayStart(new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate() - 1)) >= minDate;
      const canGoNext = dayStart(new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate() + 1)) <= maxDate;
      const todayBar = el('div', { class: 'workout-today-bar' },
        el('div', { class: 'workout-today-title' }, 'Rest day'),
        el('div', { class: 'workout-today-sub' }, `${WEEKDAYS[activeWeekday]} • Week ${activeWeek}`),
        el('div', { class: 'workout-today-nav' },
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoPrev ? null : 'true', onclick: () => shiftDay(-1), 'aria-label': 'Previous day' }, '‹'),
          buildJumpToTodayLabel(formatDateDMY(activeDate)),
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoNext ? null : 'true', onclick: () => shiftDay(1), 'aria-label': 'Next day' }, '›')
        )
      );

        dayDetail = el('div', { class: 'day-card' },
          todayBar,
          el('div', { class: 'training-section-line' }),
        el('div', { class: 'day-head' },
          el('div', null,
            el('div', { class: 'day-title' }, `${WEEKDAYS[activeWeekday]} • Rest day`),
            el('div', { class: 'training-muted' }, `Week ${activeWeek} • Workout not scheduled`)
          ),
          el('span', { class: 'training-badge' }, 'Not scheduled')
        ),
        el('div', { class: 'training-section-line' }),
        el('div', { class: 'training-card training-center' }, el('div', { class: 'training-muted' }, 'Workout not scheduled for this day.')),
        renderCustomWorkoutCta({
          onclick: () => openAddCustomWorkoutModal({
            dateLike: activeDateIso,
            weekIndex: activeWeek,
            dayIndex: 0,
            onDone: () => render()
          })
        }),
        customDraftExercises.length
          ? el('div', { class: 'training-card custom-workout-draft-list' },
            el('div', { class: 'day-title', style: 'margin-bottom:0.5rem' }, 'Custom workout'),
            ...customDraftExercises.map((entry) =>
              el('div', { class: 'custom-workout-draft-item' },
                el('span', { class: 'custom-workout-draft-name' }, String(entry?.displayName || entry?.name || 'Exercise')),
                el('span', { class: 'custom-workout-draft-meta' }, `${entry?.sets || 2} sets • ${entry?.reps || '8-12'} reps`)
              )
            ))
          : null
      );
    }
    shell.appendChild(
      el('div', { class: 'week-split' },
        workoutsCard,
        dayDetail || el('div', { class: 'training-card training-center' }, el('div', { class: 'training-muted' }, 'No workouts in this week.'))
      )
    );

    return shell;
  }

  function renderSidebar() {
    const photo = getActivePhotoDataUrl();
    const metrics = calcSidebarMetrics();
    const signedInName = state.auth.user?.displayName || 'Training';
    const discipline = state.planRow?.plan?.meta?.discipline || state.wizard.discipline || '—';

    const counts = weeklySavedCounts(4);
    const points = sparklinePoints(counts);

    return el('div', { class: 'training-sidebar' },
      el('div', { class: 'training-sidebar-head' },
        el('div', { class: 'training-row', style: 'justify-content:flex-start; gap:0.7rem; flex-wrap:nowrap' },
          el('div', { class: 'training-avatar' },
            photo ? el('img', { src: photo, alt: 'Profile' }) : el('div', { style: 'width:100%;height:100%;background:rgba(0,0,0,0.06)' })
          ),
          el('div', { class: 'training-sidebar-name' },
            el('strong', null, signedInName),
            el('div', { class: 'training-muted' }, String(discipline).toUpperCase())
          )
        )
      ),

      el('div', { class: 'training-metric-grid' },
        el('div', { class: 'training-metric' },
          el('div', { class: 'k' }, 'Saved'),
          el('div', { class: 'v' }, String(metrics.saved))
        ),
        el('div', { class: 'training-metric' },
          el('div', { class: 'k' }, 'Completion'),
          el('div', { class: 'v' }, metrics.totalSlots ? `${metrics.completionPct}%` : '—')
        )
      ),

      el('div', { class: 'training-graph' },
        el('div', { class: 'training-graph-title' },
          el('span', null, 'Weekly sessions'),
          el('span', null, metrics.lastUpdated !== '—' ? `Last ${metrics.lastUpdated}` : '')
        ),
        el('svg', { viewBox: '0 0 260 70', role: 'img', 'aria-label': 'Weekly sessions graph' },
          el('polyline', {
            points,
            fill: 'none',
            stroke: 'rgba(197, 141, 79, 0.9)',
            'stroke-width': '2.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
          })
        )
      ),

      el('div', { class: 'training-graph' },
        el('div', { class: 'training-graph-title' },
          el('span', null, 'Status'),
          el('span', null, state.view === 'plan' ? 'Plan' : state.view === 'upsell' ? 'Prep' : state.view === 'wizard' ? 'Setup' : '')
        ),
        el('div', { class: 'training-muted' },
          state.view === 'wizard'
              ? 'Complete setup to generate.'
              : state.view === 'upsell'
                ? 'Optional essentials.'
                : state.view === 'plan'
                  ? 'Log sessions to progress.'
                  : 'Loading...'
        )
      )
    );
  }

  function renderBackgroundDashboard() {
    const plan = state.planRow?.plan || null;
    const meta = plan?.meta || {};
    const discipline = String(meta.discipline || state.wizard.discipline || 'powerlifting');
    const daysPerWeek = Number(meta.daysPerWeek || state.wizard.daysPerWeek || 4) || 4;
    const exp = String(meta.experience || state.wizard.experience || 'intermediate');
    const metrics = calcSidebarMetrics();

    const tm = plan?.baselines?.trainingMax || {};
    const bbMoves = plan?.baselines?.bodybuilding?.movements || {};
    const squatTm = Number(tm.squat) || 315;
    const benchTm = Number(tm.bench) || 225;
    const deadTm = Number(tm.deadlift) || 365;
    const pressMove = String(bbMoves.press || state.wizard?.strength?.pressMovement || 'Bench Press');
    const pullMove = String(bbMoves.pull || state.wizard?.strength?.pullMovement || 'Weighted Pull-up');
    const legMove = String(bbMoves.leg || state.wizard?.strength?.legMovement || 'Back Squat');
    const pressEst = Number(plan?.baselines?.press1rm) || 225;
    const pullEst = Number(plan?.baselines?.pull1rm) || 225;
    const legEst = Number(plan?.baselines?.leg1rm) || 315;

    const kpi = [
      { k: 'Completion', v: metrics.totalSlots ? `${metrics.completionPct}%` : '42%' },
      { k: 'Sessions', v: String(metrics.saved || 6) },
      { k: 'Streak', v: '3 days' },
      { k: 'Days/wk', v: String(daysPerWeek) }
    ];

    const kpiTiles = kpi.map((x) =>
      el('div', { class: 'training-bg-card bg-span-3' },
        el('div', { class: 'k' }, x.k),
        el('div', { class: 'v' }, x.v)
      )
    );

    const strengthTile = el('div', { class: 'training-bg-card bg-span-6' },
      el('div', { class: 'k' }, 'Strength snapshot'),
      el('div', { class: 'v' }, discipline === 'powerlifting' ? 'Training max' : 'Estimate'),
      el('div', { class: 'training-bg-mini' },
        discipline === 'powerlifting'
          ? el('div', { class: 'training-bg-pill' }, el('span', null, 'Squat'), el('span', null, `${squatTm} lb`))
          : el('div', { class: 'training-bg-pill' }, el('span', null, pressMove), el('span', null, `${Math.round(pressEst)} lb`)),
        discipline === 'powerlifting'
          ? el('div', { class: 'training-bg-pill' }, el('span', null, 'Bench'), el('span', null, `${benchTm} lb`))
          : el('div', { class: 'training-bg-pill' }, el('span', null, pullMove), el('span', null, `${Math.round(pullEst)} lb`)),
        discipline === 'powerlifting'
          ? el('div', { class: 'training-bg-pill' }, el('span', null, 'Deadlift'), el('span', null, `${deadTm} lb`))
          : el('div', { class: 'training-bg-pill' }, el('span', null, legMove), el('span', null, `${Math.round(legEst)} lb`)),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Level'), el('span', null, exp))
      )
    );

    const splitTile = el('div', { class: 'training-bg-card bg-span-6 training-bg-line' },
      el('div', { class: 'k' }, 'Progress (rolling)'),
      el('div', { class: 'v' }, 'Trend'),
      el('svg', { viewBox: '0 0 320 90', role: 'img', 'aria-label': 'Progress trend' },
        el('polyline', {
          points: sparklinePoints([3, 4, 4, 5, 6, 6, 7, 8], 320, 90),
          fill: 'none',
          stroke: 'rgba(197, 141, 79, 0.9)',
          'stroke-width': '3',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        })
      ),
      el('div', { class: 'training-bg-mini' },
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Volume'), el('span', null, '12.4k')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Intensity'), el('span', null, '0.78')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Rest'), el('span', null, '2:15')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Notes'), el('span', null, 'OK'))
      )
    );

    const recoveryTile = el('div', { class: 'training-bg-card bg-span-4' },
      el('div', { class: 'k' }, 'Recovery'),
      el('div', { class: 'v' }, 'Readiness'),
      el('div', { class: 'training-bg-mini' },
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Sleep'), el('span', null, '7h 42m')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Steps'), el('span', null, '9,800')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'HRV'), el('span', null, '62')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'RHR'), el('span', null, '56'))
      )
    );

    const nutritionTile = el('div', { class: 'training-bg-card bg-span-4' },
      el('div', { class: 'k' }, 'Nutrition'),
      el('div', { class: 'v' }, 'Targets'),
      el('div', { class: 'training-bg-mini' },
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Calories'), el('span', null, '2,650')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Protein'), el('span', null, '190g')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Carbs'), el('span', null, '285g')),
        el('div', { class: 'training-bg-pill' }, el('span', null, 'Fat'), el('span', null, '70g'))
      )
    );

    const logTile = el('div', { class: 'training-bg-card bg-span-4 training-bg-line' },
      el('div', { class: 'k' }, 'Sessions'),
      el('div', { class: 'v' }, 'Weekly'),
      el('svg', { viewBox: '0 0 320 90', role: 'img', 'aria-label': 'Weekly sessions' },
        el('polyline', {
          points: sparklinePoints(weeklySavedCounts(4), 320, 90),
          fill: 'none',
          stroke: 'rgba(197, 141, 79, 0.85)',
          'stroke-width': '3',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        })
      )
    );

    const grid = el('div', { class: 'training-bg-grid' },
      ...kpiTiles,
      strengthTile,
      splitTile,
      recoveryTile,
      nutritionTile,
      logTile
    );

    return el('div', { class: 'training-bg-dashboard', 'aria-hidden': 'true' }, grid);
  }

  function renderShell(contentNode) {
    return el('div', { class: 'training-panel' },
      el('div', { class: 'training-panel-inner' },
        el('div', { class: 'training-stage' },
          el(
            'div',
            { class: `training-main-inner ${state.view === 'plan' ? '' : 'centered'}`.trim() },
            contentNode
          )
        )
      )
    );
  }

  function renderApp() {
    captureVisibleWorkoutInputDrafts();
    const stageBefore = document.querySelector('.training-stage');
    const stageScrollTop = Number(stageBefore?.scrollTop) || 0;
    const windowScrollY = Number(window.scrollY) || Number(document.documentElement?.scrollTop) || 0;
    const active = document.activeElement;
    const focusId = active && root.contains(active) && active.id ? String(active.id) : null;
    const selStart = focusId && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    const selEnd = focusId && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

    const content = state.view === 'loading'
      ? renderLoading()
      : state.view === 'wizard'
        ? renderWizard()
        : state.view === 'generating'
          ? renderGenerating()
            : state.view === 'upsell'
              ? renderUpsell()
              : state.view === 'plan'
                ? renderPlan()
                : renderLoading();

    // Avoid visible "blank flash" by building the next tree first, then swapping atomically.
    const nextShell = renderShell(content);
    root.replaceChildren(nextShell);

    const stageAfter = document.querySelector('.training-stage');
    try {
      if (stageAfter) stageAfter.scrollTop = stageScrollTop;
    } catch {
      // ignore
    }
    try {
      window.scrollTo(0, windowScrollY);
    } catch {
      // ignore
    }

    if (focusId) {
      const el2 = document.getElementById(focusId);
      if (el2 && typeof el2.focus === 'function') {
        try {
          el2.focus({ preventScroll: true });
        } catch {
          // ignore
        }
        if (selStart != null && selEnd != null && typeof el2.setSelectionRange === 'function') {
          try {
            el2.setSelectionRange(selStart, selEnd);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      try {
        renderApp();
        syncWorkoutInputLock();
        updateWorkoutTimerDisplay();
        updateWorkoutRestTimerDisplay();
        ensureWorkoutTimerTick();
        ensureWorkoutRestTimerTick();
        scheduleFloatingWorkoutTimerSync();
      } catch (err) {
        console.error('Training render failed:', err);
      }
    });
    return;
    const stageBefore = document.querySelector('.training-stage');
    const stageScrollTop = Number(stageBefore?.scrollTop) || 0;
    const windowScrollY = Number(window.scrollY) || Number(document.documentElement?.scrollTop) || 0;
    const active = document.activeElement;
    const focusId = active && root.contains(active) && active.id ? String(active.id) : null;
    const selStart = focusId && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    const selEnd = focusId && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

    // Render day selector
    const days = state.planRow?.plan?.weeks?.[state.wizard?.weekIndex || 0]?.days || [];
    const daySelector = root.querySelector('.training-day-selector');
    daySelector.innerHTML = '';
    days.forEach((day, idx) => {
      const btn = el('button', {
        class: idx === state.wizard?.dayIndex ? 'active' : '',
        onclick: () => {
          state.wizard.dayIndex = idx;
          render();
        }
      }, day.name || `Day ${idx + 1}`);
      daySelector.appendChild(btn);
    });

    // Render phase header
    const phaseHeader = root.querySelector('.training-phase-header');
    phaseHeader.innerHTML = '';
    const phaseType = state.planRow?.plan?.meta?.phaseType || 'MAINTAIN';
    const week = state.wizard?.weekIndex + 1 || 1;
    const totalWeeks = state.planRow?.plan?.weeks?.length || 8;
    const estGoal = state.planRow?.plan?.meta?.estGoal || '4 weeks';
    const autoreg = state.planRow?.plan?.meta?.autoreg && typeof state.planRow.plan.meta.autoreg === 'object'
      ? state.planRow.plan.meta.autoreg
      : {};
    const deloadWeeks = Array.isArray(autoreg?.deloadWeeks)
      ? autoreg.deloadWeeks.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];
    const deload = deloadWeeks.includes(week);
    phaseHeader.append(
      el('span', { class: 'phase-type' }, phaseType),
      el('span', { class: 'phase-week' }, `Week ${week} of ${totalWeeks}`),
      el('span', { class: 'phase-goal' }, `Est. to goal: ${estGoal}`)
    );
    if (deload) {
      phaseHeader.append(el('span', { class: 'phase-deload' }, 'Deload week'));
    }

    // Render exercises
    const exerciseList = root.querySelector('.training-exercise-list');
    exerciseList.innerHTML = '';
    const exercises = days[state.wizard?.dayIndex || 0]?.exercises || [];
    exercises.forEach((ex, exIdx) => {
      // Left side
      const left = el('div', { class: 'exercise-left' },
        el('div', { class: 'exercise-name' }, ex.displayName || ex.name),
        el('div', { class: 'exercise-meta' }, `${ex.sets} × ${ex.reps} × ${fmtRest(ex.rest)}`),
        el('div', { class: 'exercise-last-week' }, `Last week: ${ex.lastWeekWeight || '—'}`),
        el('div', { class: 'exercise-gif' }, renderExerciseMedia(ex))
      );
      // Right side
      const right = el('div', { class: 'exercise-right' },
        el('div', { class: 'exercise-input-grid' },
          el('span', { class: 'projected' }, `Projected: ${ex.projectedWeight || '—'}`),
          el('input', { type: 'number', value: ex.weightUsed || '', placeholder: 'Weight used' }),
          el('input', { type: 'number', value: ex.repsDone || '', placeholder: 'Reps' }),
          el('input', { type: 'number', class: 'rpe', value: ex.rpe || '', placeholder: 'RPE' })
        ),
        // Set-level tracking
        el('div', { class: 'set-list' },
          ...(ex.setsData || []).map((set, setIdx) =>
            el('div', { class: 'set-row' },
              el('span', null, `Set ${setIdx + 1}`),
              el('input', { type: 'number', value: set.weight || '', placeholder: 'Weight' }),
              el('input', { type: 'number', value: set.reps || '', placeholder: 'Reps' })
            )
          ),
          el('button', { class: 'add-set-btn', onclick: () => {
            ex.setsData = ex.setsData || [];
            ex.setsData.push({ weight: ex.projectedWeight, reps: ex.reps });
            render();
          } }, '+ Add set')
        )
      );
      const row = el('div', { class: 'training-exercise-row' }, left, right);
      exerciseList.appendChild(row);
    });

    // Deload modal logic
    if (deload && !state.deloadModalShown) {
      state.deloadModalShown = true;
      const modal = el('div', { class: 'deload-modal' },
        el('div', { class: 'deload-modal-content' },
          el('h3', null, 'Deload Week'),
          el('p', null, 'You are entering a deload week. This is intentional to help recover CNS fatigue, joints, and boost performance. Volume and load are reduced automatically.'),
          el('button', { onclick: () => {
            modal.remove();
          } }, 'Got it')
        )
      );
      Object.assign(modal.style, {
        position: 'fixed',
        top: '0', left: '0', width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
      });
      Object.assign(modal.querySelector('.deload-modal-content').style, {
        background: '#fff', borderRadius: '16px', padding: '2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: '420px', textAlign: 'center'
      });
      document.body.appendChild(modal);
    }
    if (!deload) state.deloadModalShown = false;

    const stageAfter = document.querySelector('.training-stage');
    if (stageAfter) stageAfter.scrollTop = stageScrollTop;
    window.scrollTo(0, windowScrollY);

    if (focusId) {
      const el2 = document.getElementById(focusId);
      if (el2 && typeof el2.focus === 'function') {
        el2.focus({ preventScroll: true });
        if (selStart != null && selEnd != null && typeof el2.setSelectionRange === 'function') {
          try {
            el2.setSelectionRange(selStart, selEnd);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  bindShareClose();
  ensureShareOutgoingSyncTimer();
  bindFloatingWorkoutTimerDock();
  window.addEventListener('ode:demo-sim-change', () => {
    if (!(state.auth.user?.demo?.active || state.auth.user?.isDemo)) return;
    if (state.view !== 'plan') return;
    render();
  });
  window.addEventListener('beforeunload', () => {
    persistWorkoutTimerState();
    persistWorkoutRestTimerState();
    if (!shareOutgoingSyncTimer) return;
    window.clearInterval(shareOutgoingSyncTimer);
    shareOutgoingSyncTimer = 0;
  });
  wireAuthSync();
  bindWorkoutInputTracking();
  bindWorkoutInputGate();
  const navLoading = (() => {
    try {
      const flag = sessionStorage.getItem('ode_training_nav_loading') === '1';
      if (flag) sessionStorage.removeItem('ode_training_nav_loading');
      return flag;
    } catch {
      return false;
    }
  })();
  const bootToConstructing = shouldForceAutostart() || shouldBootIntoConstructing();
  if (bootToConstructing) {
    setView('generating');
  }
  loadAuthAndState({ silent: bootToConstructing ? true : !navLoading }).catch(() => {
    clearConstructingBootFlag();
    setView('wizard');
  });

  // Navbar "+" → "Add friends to workout" lands here with ?share=friends:
  // pop the Share Workout flow open once the plan UI has rendered.
  (() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('share') !== 'friends') return;
    } catch {
      return;
    }
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const btn = document.querySelector('[data-share-workout]');
      if (btn) {
        window.clearInterval(timer);
        btn.click();
      } else if (tries > 40) {
        window.clearInterval(timer);
      }
    }, 500);
  })();
})();




































