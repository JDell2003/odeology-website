(() => {
  const root = document.getElementById('training-root');
  if (!root) return;

  const TRAINING_INTAKE_KEY = 'ode_training_intake_v2';

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
      return sessionStorage.getItem('ode_training_force_autostart') === '1';
    } catch {
      return false;
    }
  }

  function clearForceAutostart() {
    forceAutostartConsumed = true;
    try {
      sessionStorage.removeItem('ode_training_force_autostart');
    } catch {
      // ignore
    }
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
        const resp = await api('/api/training/state', { method: 'GET' });
        last = resp;
        if (resp.ok && resp.json?.plan?.id) return resp;
      } catch {
        // ignore
      }
      await delay(delayMs);
    }
    return last;
  }

  async function pollForPlanReady({ maxMs = 60000, intervalMs = 2000 } = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < maxMs) {
      const resp = await fetchTrainingStateWithRetry({ tries: 1, delayMs: 0 });
      if (resp?.ok && resp.json?.plan?.id) {
        state.profile = resp.json?.profile || state.profile;
        state.planRow = resp.json?.plan || null;
        const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(state.planRow.id)}`, { method: 'GET' });
        state.logs = logsResp.ok ? (logsResp.json?.logs || []) : [];
        const dismissedKey = `ode_training_upsell_dismissed_${state.planRow.id}`;
        const dismissed = localStorage.getItem(dismissedKey) === '1';
        setView(dismissed ? 'plan' : 'upsell');
        return true;
      }
      await delay(intervalMs);
    }
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

  function sanitizeBodybuildingPlanInPlace(planRow) {
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
      .replace(/â€“|â€”|âˆ’/g, '-')
      .replace(/\s+/g, '');
    if (v === '<6m' || v === '<6months') return '<6m';
    if (v === '6-24m' || v === '6-24months') return '6-24m';
    if (v === '2-5y' || v === '2-5years' || v === '2-5yrs') return '2-5y';
    if (v === '5y+' || v === '5+years' || v === '5+yrs') return '5y+';
    return '6-24m';
  }

  function mapTrainingFeel(raw, focusLabel) {
    if (focusLabel === 'Aesthetic') return 'Aesthetic bodybuilding';
    if (focusLabel === 'Strength') return 'Powerbuilding';
    const v = lower(raw);
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

  function mapIntakeToOblueprintPayload(intake) {
    if (!intake || typeof intake !== 'object') return null;

    const intakeGoalRaw = lower(intake.goal);
    const macroGoalMode = readLatestMacroGoalMode();
    const primaryGoal = intakeGoalRaw
      ? (intakeGoalRaw === 'cut fat' ? 'Cut fat' : intakeGoalRaw === 'recomp' ? 'Recomp' : 'Build size')
      : goalModeToPrimaryGoal(macroGoalMode);

    const focusRaw = lower(intake.priority);
    const focus = focusRaw === 'strength' ? 'Strength' : focusRaw === 'size' ? 'Size' : 'Aesthetic';

    const timeline = ['4 weeks', '8 weeks', '12+ weeks'].includes(String(intake.timeline || ''))
      ? String(intake.timeline)
      : '8 weeks';

    const experience = mapExperience(intake.experience);
    const location = mapLocation(intake.location);
    const trainingStyle = mapTrainingStyle(intake.loadStyle);
    const outputStyle = mapOutputStyle(intake.outputStyle);
    const closeToFailure = lower(intake.trainToFailure) === 'yes' ? 'Yes' : 'No';
    const trainingFeel = mapTrainingFeel(intake.modality, focus);

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
      stress: mapStress(intake.stress)
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
    const intake = await loadSavedIntake();
    if (!intake) return false;
    const forceStart = force || shouldForceAutostart();
    if (!forceStart && !isIntakeComplete(intake)) return false;
    const payload = mapIntakeToOblueprintPayload(intake);
    if (!payload) return false;
    autoOnboardInFlight = true;
    try {
      await submitOnboarding(payload);
    } finally {
      autoOnboardInFlight = false;
    }
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

  const state = {
    auth: { user: null },
    profile: null,
    planRow: null,
    logs: [],
    view: 'wizard', // loading | wizard | generating | upsell | plan
    planError: null,
    generating: {
      startedAt: 0,
      minMs: 38_000,
      raf: 0
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
    loading: false,
    loaded: false,
    bootstrapRequested: false,
    accounts: [],
    accountIndex: new Map(),
    status: '',
    requesting: new Set(),
    kicking: new Set(),
    requested: new Set(),
    latestStatus: new Map(),
    confirmToastTimer: 0,
    query: ''
  };

  const SHARE_CONFIRM_TOAST_DELAY_MS = 10_000;
  const SHARE_OUTGOING_SYNC_MS = 4500;
  const SHARE_DEBUG_VERSION = '2026-03-08-share-debug-6';
  const TRAINING_WELCOME_STORAGE_KEY = 'ode_training_share_welcome_v1';
  const TRAINING_WELCOME_TTL_MS = 6 * 60 * 60 * 1000;
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

  const shareDebugEnabled = (() => {
    try {
      const params = new URLSearchParams(String(window.location.search || ''));
      const param = String(params.get('shareDebug') || '').trim();
      if (param === '1') return true;
      if (param === '0') return false;
      const stored = String(localStorage.getItem('ode_share_debug') || '').trim();
      if (stored === '1') return true;
      if (stored === '0') return false;
      const host = String(window.location.hostname || '').toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
    } catch {
      return true;
    }
  })();
  let shareDebugPanel = null;
  function ensureShareDebugPanel() {
    if (!shareDebugEnabled) return null;
    if (shareDebugPanel && document.body && document.body.contains(shareDebugPanel)) return shareDebugPanel;
    const panel = document.createElement('div');
    panel.id = 'share-debug-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.style.position = 'fixed';
    panel.style.left = '10px';
    panel.style.bottom = '10px';
    panel.style.zIndex = '99999';
    panel.style.width = 'min(460px, calc(100vw - 20px))';
    panel.style.maxHeight = '42vh';
    panel.style.overflow = 'auto';
    panel.style.padding = '8px 10px';
    panel.style.borderRadius = '10px';
    panel.style.background = 'rgba(8, 17, 27, 0.92)';
    panel.style.color = '#b8f3c5';
    panel.style.font = '12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    panel.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.35)';
    panel.style.pointerEvents = 'none';
    panel.style.whiteSpace = 'pre-wrap';
    const title = document.createElement('div');
    title.textContent = `[share-debug] v=${SHARE_DEBUG_VERSION}`;
    title.style.color = '#f8f8f8';
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';
    panel.appendChild(title);
    const lines = document.createElement('div');
    lines.id = 'share-debug-lines';
    panel.appendChild(lines);
    document.body.appendChild(panel);
    shareDebugPanel = panel;
    return panel;
  }
  function shareDebugLog(message, payload) {
    if (!shareDebugEnabled) return;
    try {
      if (payload === undefined) console.log(`[share-debug] ${message}`);
      else console.log(`[share-debug] ${message}`, payload);
    } catch {
      // ignore console failures
    }
    try {
      const panel = ensureShareDebugPanel();
      const lines = panel?.querySelector('#share-debug-lines');
      if (!lines) return;
      const row = document.createElement('div');
      const ts = new Date().toLocaleTimeString();
      row.textContent = payload === undefined
        ? `${ts} ${message}`
        : `${ts} ${message} ${JSON.stringify(payload)}`;
      lines.appendChild(row);
      while (lines.childElementCount > 34) {
        lines.removeChild(lines.firstChild);
      }
      panel.scrollTop = panel.scrollHeight;
    } catch {
      // ignore debug panel failures
    }
  }
  shareDebugLog('training.js loaded', { version: SHARE_DEBUG_VERSION });

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

    return pendingSet;
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

  let shareCloseBound = false;
  let shareOutgoingSyncTimer = 0;
  let shareOutgoingSyncInFlight = false;
  let workoutInputBound = false;
  let workoutInputGateBound = false;
  let workoutInputGateToastAt = 0;

  function ensureShareOutgoingSyncTimer() {
    if (shareOutgoingSyncTimer) return;
    shareOutgoingSyncTimer = window.setInterval(async () => {
      if (!state.auth.user) return;
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
          const outgoing = await api('/api/training/share/outgoing', { method: 'GET' });
          if (!outgoing.ok || !outgoing.json?.ok) return;
          syncShareOutgoingState(outgoing.json);
          render();
        } finally {
          shareOutgoingSyncInFlight = false;
        }
        return;
      }
      if (!shareUi.bootstrapRequested) return;
      shareOutgoingSyncInFlight = true;
      try {
        const outgoing = await api('/api/training/share/outgoing', { method: 'GET' });
        if (!outgoing.ok || !outgoing.json?.ok) return;
        syncShareOutgoingState(outgoing.json);
        render();
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

  function getWorkoutElapsedMs() {
    if (workoutTimer.running) return Date.now() - workoutTimer.startedAt;
    return workoutTimer.elapsedMs || 0;
  }

  function updateWorkoutTimerDisplay() {
    const node = document.getElementById('workout-timer-display');
    if (!node) return;
    if (!workoutTimer.running && !workoutTimer.paused) {
      node.classList.add('hidden');
      return;
    }
    node.classList.remove('hidden');
    if (workoutTimer.paused) {
      node.textContent = `Paused ${formatWorkoutElapsed(getWorkoutElapsedMs())}`;
      return;
    }
    node.textContent = `Workout ${formatWorkoutElapsed(getWorkoutElapsedMs())}`;
  }

  function ensureWorkoutTimerTick() {
    if (!workoutTimer.running) return;
    if (workoutTimer.intervalId) return;
    workoutTimer.intervalId = window.setInterval(() => {
      updateWorkoutTimerDisplay();
    }, 1000);
    updateWorkoutTimerDisplay();
  }

  function bindWorkoutInputTracking() {
    if (workoutInputBound) return;
    workoutInputBound = true;
    document.addEventListener('input', (e) => {
      if (!workoutTimer.running) return;
      if (!document.body.classList.contains('training-page')) return;
      const target = e.target;
      if (!target || !target.dataset) return;
      const field = target.dataset.field;
      if (!field) return;
      const exId = target.dataset.exId || null;
      const setIdx = target.dataset.setIdx != null ? Number(target.dataset.setIdx) : null;
      const raw = String(target.value || '').trim();
      const detail = { field, exId, setIdx };
      if (field === 'setNote') {
        detail.note = raw.slice(0, 120);
      } else {
        const num = Number(raw);
        if (Number.isFinite(num)) detail.value = num;
      }
      recordWorkoutEvent('input', detail);
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

  function startWorkoutTimer() {
    if (workoutTimer.running) return;
    if (workoutTimer.paused && Number(workoutTimer.elapsedMs) > 0) {
      workoutTimer.running = true;
      workoutTimer.paused = false;
      workoutTimer.startedAt = Date.now() - Math.max(0, Number(workoutTimer.elapsedMs) || 0);
      ensureWorkoutTimerTick();
      logTrainingEvent('workout_resume', {
        planId: workoutTimer.context?.planId || state.planRow?.id || null,
        weekIndex: Number.isFinite(workoutTimer.context?.weekIndex) ? workoutTimer.context.weekIndex : null,
        dayIndex: Number.isFinite(workoutTimer.context?.dayIndex) ? workoutTimer.context.dayIndex : null,
        activeDate: workoutTimer.context?.activeDate || null,
        resumedAt: new Date().toISOString()
      });
      render();
      return;
    }
    workoutTimer.running = true;
    workoutTimer.paused = false;
    workoutTimer.startedAt = Date.now();
    workoutTimer.elapsedMs = 0;
    workoutTimer.events = [];
    ensureWorkoutTimerTick();
    render();
  }

  function pauseWorkoutTimer({ reason = 'manual' } = {}) {
    if (!workoutTimer.running || !workoutTimer.startedAt) return;
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

  async function confirmEndWorkout() {
    if (!workoutTimer.running) return;
    const confirmFn = typeof window.odeConfirm === 'function' ? window.odeConfirm : null;
    let action = 'dismiss';
    if (confirmFn) {
      action = await confirmFn({
        title: 'Finish workout?',
        message: 'Are you sure you want to finish your workout?\nYour workout timer and input events will be saved to your profile.',
        confirmText: 'Finish workout',
        cancelText: 'Pause workout',
        danger: false,
        returnAction: true
      });
    } else {
      action = window.confirm('Finish workout?\nYour workout timer and input events will be saved to your profile.')
        ? 'confirm'
        : 'dismiss';
    }
    if (action === 'confirm') {
      endWorkoutTimer({ reason: 'confirmed', showToast: true });
      return;
    }
    if (action === 'cancel') {
      pauseWorkoutTimer({ reason: 'confirm_cancel' });
    }
  }

  function endWorkoutTimer({ reason = 'manual', showToast = false } = {}) {
    if (!workoutTimer.running) return;
    const endedAt = Date.now();
    const durationMs = Math.max(0, endedAt - workoutTimer.startedAt);
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
    }
    workoutTimer.running = false;
    workoutTimer.paused = false;
    workoutTimer.startedAt = 0;
    workoutTimer.elapsedMs = 0;
    workoutTimer.events = [];
    if (workoutTimer.intervalId) {
      clearInterval(workoutTimer.intervalId);
      workoutTimer.intervalId = 0;
    }
    updateWorkoutTimerDisplay();
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
        if (!node.hasAttribute('disabled')) node.dataset.timerDisabled = '1';
        node.setAttribute('disabled', 'true');
        return;
      }
      if (node.dataset.timerDisabled === '1') {
        node.removeAttribute('disabled');
        delete node.dataset.timerDisabled;
      }
    });
  }


  function normalizeDiscipline(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'powerlifting') return 'powerlifting';
    if (v === 'bodybuilding' || v === 'hypertrophy') return 'bodybuilding';
    if (v === 'calisthenics' || v === 'bodyweight') return 'calisthenics';
    return null;
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

  function buildTrainingSchedule(daysPerWeek, unavailableDays) {
    const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
    const unavailable = new Set(normalizeWeekdayIndexList(unavailableDays));
    const available = [1, 2, 3, 4, 5, 6, 0].filter((d) => !unavailable.has(d));
    if (!n) return [];
    if (available.length < n) return [];

    const pattern = preferredWeekdayPattern(n);
    const chosen = [];
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
    return buildTrainingSchedule(daysPerWeek, scheduleUnavailableDaysForDate(refDate));
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

  function planStartDate(plan) {
    const raw = plan?.meta?.createdAt;
    const parsed = raw ? new Date(raw) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return dayStart(new Date());
    return dayStart(parsed);
  }

  function weekIndexForDate(date, plan) {
    const start = planStartDate(plan);
    const target = dayStart(date);
    const diffDays = Math.floor((target.getTime() - start.getTime()) / 86400000);
    const idx = Math.floor(Math.max(0, diffDays) / 7) + 1;
    const maxWeeks = Array.isArray(plan?.weeks) ? plan.weeks.length : 1;
    return Math.max(1, Math.min(maxWeeks, idx));
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
      const schedule = buildTrainingSchedule(daysPerWeek, scheduleUnavailableDaysForDate(next));
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

  function resolveProjectedForExercise(ex, plan) {
    if (ex?.projected && typeof ex.projected === 'object') {
      if (ex.projected.unit === 'bw') return ex.projected;
      if (Number.isFinite(ex.projected.value)) return ex.projected;
    }
    if (Number.isFinite(ex?.projectedWeight)) return { value: ex.projectedWeight, unit: 'lb' };
    const baselines = plan?.baselines && typeof plan.baselines === 'object' ? plan.baselines : {};
    const exp = plan?.meta?.experience || '';
    const fallback = fallbackBaselinesFromBodyweight(exp, baselines?.bodyweight);
    const eqClass = String(ex?.equipmentClass || '').toLowerCase();
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
  return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/${rel}`;
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
  const REMOTE_EXERCISE_CATALOG_PATH = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
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
  let catalogLoading = false;
  let catalogLoadingPromise = null;
  let catalogLoadAttempted = false;

  function setExerciseCatalog(list) {
    const opts = Array.isArray(list) ? list : [];
    exerciseCatalog = opts;
    exerciseIndexById = new Map();
    for (const ex of opts) {
      const id = String(ex?.id || '').trim();
      if (!id) continue;
      exerciseIndexById.set(id, ex);
    }
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
      const mediaPath = String(ex?.mediaPath || '').trim();
      const mediaPathAlt = String(ex?.mediaPathAlt || '').trim();
      if (mediaPath) {
        const localSrc0 = rewriteLegacyLocalMediaPath(mediaPath);
        const localSrc1 = rewriteLegacyLocalMediaPath(mediaPathAlt || (mediaPath.includes('/0.') ? mediaPath.replace('/0.', '/1.') : mediaPath));
        const src0 = useRemoteExerciseMedia ? (toFreeExerciseDbRemotePath(localSrc0) || localSrc0) : localSrc0;
        const src1 = useRemoteExerciseMedia ? (toFreeExerciseDbRemotePath(localSrc1) || localSrc1) : localSrc1;
        return {
          type: 'local-pair',
          src0,
          src1,
          alt: displayName
        };
      }

      const name = String(ex?.movementName || displayName || '').trim();
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
      const remote = toFreeExerciseDbRemotePath(media.src);
      if (remote && remote !== media.src) {
        img.addEventListener('error', () => {
          if (img.dataset.remoteTried === '1') return;
          img.dataset.remoteTried = '1';
          img.src = remote;
        }, { once: true });
      }
      return img;
    }
    if (media?.type === 'local-pair' && media?.src0 && media?.src1) {
      const wrap = el('div', { class: 'exercise-media-pair' });
      const imgA = el('img', { class: 'exercise-media-img exercise-media-img-a', src: media.src0, alt: media.alt || ex?.name || 'Exercise', loading: 'eager', decoding: 'async' });
      const imgB = el('img', { class: 'exercise-media-img exercise-media-img-b', src: media.src1, alt: media.alt || ex?.name || 'Exercise', loading: 'eager', decoding: 'async' });
      const remote0 = toFreeExerciseDbRemotePath(media.src0);
      const remote1 = toFreeExerciseDbRemotePath(media.src1);
      let remoteAttempted = false;
      const tryRemotePair = () => {
        if (remoteAttempted) return false;
        if (!remote0 || !remote1) return false;
        remoteAttempted = true;
        imgA.src = remote0;
        imgB.src = remote1;
        return true;
      };
      const onError = () => {
        if (tryRemotePair()) return;
        try { wrap.replaceWith(muscleIconSvg(ex?.bodyPart || ex?.muscle_group || ex?.muscleGroup || 'exercise')); } catch {}
      };
      imgA.addEventListener('error', onError, { once: true });
      imgB.addEventListener('error', onError, { once: true });
      wrap.appendChild(imgA);
      wrap.appendChild(imgB);
      return wrap;
    }
    return muscleIconSvg(ex?.bodyPart || ex?.muscle_group || ex?.muscleGroup || 'exercise');
  }

  function openExerciseMediaModal({ type, src, alt }) {
    try {
      const existing = document.getElementById('exercise-media-modal');
      existing?.remove?.();
    } catch {
      // ignore
    }

    const overlay = el('div', { class: 'exercise-media-modal', id: 'exercise-media-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'exercise-media-modal-backdrop', type: 'button', 'aria-label': 'Close preview' }),
      el('div', { class: 'exercise-media-modal-card' },
        el('div', { class: 'exercise-media-modal-head' },
          el('div', { class: 'exercise-media-modal-title' }, String(alt || 'Exercise preview')),
          el('button', { class: 'exercise-media-modal-close', type: 'button', 'aria-label': 'Close preview' }, '×')
        ),
        type === 'video'
          ? el('video', { class: 'exercise-media-modal-video', src, muted: 'true', loop: 'true', playsinline: 'true', controls: 'true' })
          : el('img', { class: 'exercise-media-modal-img', src, alt: String(alt || 'Exercise preview'), loading: 'lazy' })
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
    const ex = exerciseIndexById.get(String(id)) || null;
    return ex ? String(ex.name || '') : '';
  }

  function exerciseMediaFromId(id) {
    const ex = exerciseIndexById.get(String(id)) || null;
    if (!ex) return { mediaPath: null, mediaPathAlt: null, displayName: '' };
    const image0 = ex.images?.[0] ? `/free-exercise-db/exercises/${ex.images[0]}` : null;
    const image1 = ex.images?.[1] ? `/free-exercise-db/exercises/${ex.images[1]}` : null;
    return { mediaPath: image0, mediaPathAlt: image1, displayName: ex.name || '' };
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
      return localStorage.getItem(swapOverrideKey(planId, weekIndex, dayIndex, slotId));
    } catch {
      return null;
    }
  }

  function setSwapOverride(planId, weekIndex, dayIndex, slotId, exerciseId) {
    if (!slotId || !exerciseId) return;
    try {
      localStorage.setItem(swapOverrideKey(planId, weekIndex, dayIndex, slotId), String(exerciseId));
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
      return localStorage.getItem(swapOverrideKeyPermanent(planId, slotId));
    } catch {
      return null;
    }
  }

  function setPermanentSwapOverride(planId, slotId, exerciseId) {
    if (!slotId || !exerciseId) return;
    try {
      localStorage.setItem(swapOverrideKeyPermanent(planId, slotId), String(exerciseId));
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

  function mapExerciseMuscles(entry) {
    const prim = Array.isArray(entry?.primaryMuscles) ? entry.primaryMuscles : [];
    const sec = Array.isArray(entry?.secondaryMuscles) ? entry.secondaryMuscles : [];
    const list = [...prim, ...sec].map((m) => String(m || '').toLowerCase());
    const out = new Set();
    for (const m of list) {
      if (m.includes('chest')) out.add('chest');
      if (m.includes('lats')) out.add('lats');
      if (m.includes('back')) out.add('upperBack');
      if (m.includes('front') && m.includes('deltoid')) out.add('deltsFront');
      if (m.includes('side') && m.includes('deltoid')) out.add('deltsSide');
      if (m.includes('rear') && m.includes('deltoid')) out.add('deltsRear');
      if (m.includes('bicep')) out.add('biceps');
      if (m.includes('tricep')) out.add('triceps');
      if (m.includes('quadricep') || m.includes('quad')) out.add('quads');
      if (m.includes('hamstring')) out.add('hamstrings');
      if (m.includes('glute')) out.add('glutes');
      if (m.includes('calf')) out.add('calves');
      if (m.includes('abdom')) out.add('abs');
    }
    return Array.from(out);
  }

  function equipmentAllowed(access, eqClass) {
    const allow = access && typeof access === 'object' ? access : {};
    if (eqClass === 'barbell') return Boolean(allow.barbell);
    if (eqClass === 'dumbbell') return Boolean(allow.dumbbell);
    if (eqClass === 'cable') return Boolean(allow.cable);
    if (eqClass === 'machine') return Boolean(allow.machine);
    if (eqClass === 'bodyweight') return Boolean(allow.bodyweight);
    return true;
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

  function computeSwapCandidates({ ex, plan, dayIndex, weekIndex }) {
    const meta = plan?.meta || {};
    const equipmentAccess = meta.equipmentAccess || state.wizard?.equipmentAccess || {};
    const injuryProfile = meta.injuryProfile || {};
    const allowedClasses = Array.isArray(ex?.allowedEquipmentClass) ? new Set(ex.allowedEquipmentClass) : null;
    const weekIdx = Number(weekIndex) || 1;
    const day = (plan?.weeks?.[weekIdx - 1]?.days || [])[dayIndex - 1] || null;
    const usedIds = new Set((day?.exercises || []).map((d) => String(d?.exerciseId || '')).filter(Boolean));
    const intentKey = String(ex?.intentKey || '').toLowerCase();
    if (!intentAllowedByInjuryClient(intentKey, injuryProfile)) return [];

    const wantMuscles = Array.isArray(ex?.muscleKeys) ? ex.muscleKeys : [];
    const wantTokens = normalizeTextForMatch(ex?.intentKey || ex?.displayName || ex?.name || '').split(' ').filter(Boolean);
    const scored = [];

    const badName = /(stretch|mobility|warmup|activation|rehab|therapy|prehab)/;
    const badCategory = /(stretch|mobility|warmup)/;
    const badMechanic = /(stretch|mobility|warmup)/;
    const movement = String(ex?.movementPattern || '').toLowerCase();
    const movementPatternOk = (name) => {
      const n = normalizeTextForMatch(name);
      if (movement === 'squat') return /(squat|leg press|hack|lunge|split squat)/.test(n);
      if (movement === 'hinge') return /(deadlift|rdl|romanian|good morning|hip thrust|back extension)/.test(n);
      if (movement === 'press') return /(press|bench|incline|decline|chest)/.test(n);
      if (movement === 'row') return /row/.test(n);
      if (movement === 'vertical_pull') return /(pulldown|pull up|pull-up|chin up|chin-up|lat pull)/.test(n);
      return true;
    };

    for (const entry of exerciseCatalog) {
      const id = String(entry?.id || '').trim();
      if (!id || usedIds.has(id)) continue;
      if (isBandName(entry?.name)) continue;
      const nameNorm = normalizeTextForMatch(entry?.name || '');
      const catNorm = normalizeTextForMatch(entry?.category || '');
      const mechNorm = normalizeTextForMatch(entry?.mechanic || '');
      if (badName.test(nameNorm) || badCategory.test(catNorm) || badMechanic.test(mechNorm)) continue;
      if (!movementPatternOk(entry?.name || '')) continue;
      const eqClass = equipmentClassFromName(entry);
      if (allowedClasses && !allowedClasses.has(eqClass) && !allowedClasses.has('any')) continue;
      if (!equipmentAllowed(equipmentAccess, eqClass)) continue;

      const muscles = mapExerciseMuscles(entry);
      const muscleOverlap = wantMuscles.length
        ? wantMuscles.filter((m) => muscles.includes(m)).length / wantMuscles.length
        : 0;
      const nameTokens = normalizeTextForMatch(entry?.name || '').split(' ').filter(Boolean);
      const tokenOverlap = nameTokens.filter((t) => wantTokens.includes(t)).length / Math.max(1, wantTokens.length);
      const score = muscleOverlap * 0.6 + tokenOverlap * 0.2;

      scored.push({ id, score, name: entry?.name || '' });
    }

    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, 6).map((c) => c.id);
  }

  function applySwapSelection({ ex, dayIndex, weekIndex, newExerciseId, scope }) {
    const prevId = ex.exerciseId;
    ex.exerciseId = newExerciseId;
    const media = exerciseMediaFromId(newExerciseId);
    if (media.displayName) ex.displayName = media.displayName;
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
      api('/api/training/override', {
        method: 'POST',
        body: JSON.stringify({
          weekIndex,
          dayIndex,
          slotId: ex.slotId,
          oldExerciseId: prevId,
          newExerciseId,
          scope
        })
      });
    } catch {
      // ignore
    }
  }

  function openSwapScopeModal({ ex, dayIndex, weekIndex, newExerciseId, onDone }) {
    const overlay = el('div', { class: 'schedule-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'schedule-modal-backdrop', type: 'button', 'aria-label': 'Close swap options' }),
      el('div', { class: 'schedule-modal-card' },
        el('div', { class: 'schedule-modal-head' },
          el('div', { class: 'schedule-modal-title' }, 'Apply swap'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close swap options' }, '×')
        ),
        el('div', { class: 'schedule-modal-body' },
          el('div', { class: 'training-muted', style: 'margin-bottom:0.75rem' },
            'Do you want to swap this exercise permanently, or just for today?'
          )
        ),
        el('div', { class: 'schedule-modal-actions', style: 'justify-content:flex-start; gap:0.6rem' },
          el('button', {
            type: 'button',
            class: 'btn btn-primary',
            onclick: () => {
              applySwapSelection({ ex, dayIndex, weekIndex, newExerciseId, scope: 'single' });
              overlay.remove();
              onDone?.();
            }
          }, 'Just this exercise'),
          el('button', {
            type: 'button',
            class: 'btn btn-ghost',
            onclick: () => {
              applySwapSelection({ ex, dayIndex, weekIndex, newExerciseId, scope: 'permanent' });
              overlay.remove();
              onDone?.();
            }
          }, 'Swap permanently'),
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Cancel')
        )
      )
    );
    overlay.querySelector('.schedule-modal-backdrop')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.schedule-modal-close')?.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  async function openSwapModal({ ex, dayIndex, weekIndex }) {
    await ensureExerciseCatalogLoaded();
    let candidates = Array.isArray(ex?.swapCandidates) ? ex.swapCandidates : [];
    if (!candidates.length && exerciseCatalog.length) {
      const plan = state.planRow?.plan || null;
      candidates = computeSwapCandidates({ ex, plan, dayIndex, weekIndex }) || [];
    }
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
              candidates.map((id) =>
                el('button', {
                  type: 'button',
                  class: 'btn btn-ghost',
                  onclick: () => {
                    overlay.remove();
                    openSwapScopeModal({
                      ex,
                      dayIndex,
                      weekIndex,
                      newExerciseId: id,
                      onDone: () => render()
                    });
                  }
                }, getExerciseNameById(id) || id)
              )
            )
            : el('div', { class: 'training-muted' }, 'No swap options available.')
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
              const location = String(qs('#pain-location')?.value || '').trim();
              const painType = String(qs('#pain-type')?.value || '').trim();
              const severity = Number(qs('#pain-sev')?.value || 0);
              const onset = String(qs('#pain-onset')?.value || '').trim();
              const trigger = String(qs('#pain-trigger')?.value || '').trim();
              const romNormal = Boolean(qs('#pain-rom')?.checked);
              const pop = Boolean(qs('#pain-pop')?.checked);

              const redFlag = severity >= 8 || /numbness/.test(painType) || pop;
              const action = redFlag ? 'stop' : severity >= 5 ? 'swap' : 'continue';
              const guidance = redFlag
                ? 'Stop now and end the session. If symptoms worsen or include sharp pain + loss of movement, consider medical evaluation.'
                : severity >= 5
                  ? 'Stop this exercise and swap to a joint-friendly option or reduce load.'
                  : 'You can continue cautiously; stop if it returns.';

              const painReportId = (window.crypto && typeof window.crypto.randomUUID === 'function')
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
                guidance,
                followUpAt: toISODateLocal(new Date(Date.now() + 24 * 60 * 60 * 1000))
              });
              overlay.remove();
              render();
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
      el('div', { class: 'schedule-modal-card' },
        el('div', { class: 'schedule-modal-head' },
          el('div', { class: 'schedule-modal-title' }, 'Explain the lifts'),
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close explanation' }, '×')
        ),
        el('div', { class: 'schedule-modal-body', id: 'explain-body' },
          el('div', { class: 'training-muted' }, quoteBankLoadingPromise ? 'Loading...' : 'Preparing explanation...')
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
    if (!body) return;
    body.replaceChildren(
      el('div', { class: 'training-muted' }, `Phase: ${String(plan?.meta?.phase || '').toUpperCase()}`),
      el('div', { class: 'training-muted' }, `Focus: ${emphasis.join(', ') || 'Full body'}`),
      el('div', { class: 'training-divider' }),
      snippets.length
        ? el('div', null,
          snippets.map((s) =>
            el('div', { class: 'training-subcard', style: 'margin-bottom:0.6rem' },
              el('div', { style: 'font-weight:800' }, s.sourceName),
              el('div', { class: 'training-muted' }, s.principleSummary)
            )
          )
        )
        : el('div', { class: 'training-muted' }, `No snippets matched tags: ${tagsList.join(', ')}`)
    );
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
        openExerciseMediaModal({ type: currentType, src: currentSrc, alt: btn.dataset.modalTitle || btn.dataset.alt || 'Exercise preview' });
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
      return {
        ok: false,
        status: 0,
        json: null,
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
      const btn = target.closest('.share-workout-add-btn, .share-workout-add, .share-workout-kick-btn');
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
    shareUi.loading = true;
    shareUi.status = 'Loading friends...';
    render();

    try {
      const [resp, outgoingResp] = await Promise.all([
        api('/api/friends/list', { method: 'GET' }),
        api('/api/training/share/outgoing', { method: 'GET' })
      ]);
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

    const resp = await api('/api/training/share', {
      method: 'POST',
      body: JSON.stringify({ targetUserIds: [key], targetUserId: key })
    });
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
      shareUi.status = resp.json?.error || 'Could not send workout request.';
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
    const key = String(account?.id || '').trim();
    if (!key) return;
    if (shareUi.kicking.has(key)) return;

    const displayName = String(account?.displayName || account?.username || 'friend').trim();
    const traceId = `share-kick-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    shareUi.kicking.add(key);
    shareUi.status = `Removing ${displayName}...`;
    try {
      shareDebugLog(`[${traceId}] Kick clicked`, {
        targetUserId: key,
        displayName
      });
    } catch {
      // ignore console failures
    }
    render();

    try {
      const resp = await api('/api/training/share/remove', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: key, targetUserIds: [key] })
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
      shareUi.requested.delete(key);
      shareUi.latestStatus.delete(key);

      const outgoing = await api('/api/training/share/outgoing', { method: 'GET' });
      if (outgoing.ok && outgoing.json?.ok) {
        syncShareOutgoingState(outgoing.json);
        const latestRaw = String(outgoing.json?.latestStatusByUserId?.[key] || '').trim().toLowerCase();
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
      shareUi.kicking.delete(key);
      render();
    }
  }

function toggleSharePopover(force) {
    const next = typeof force === 'boolean' ? force : !shareUi.open;
    shareUi.open = next;
    if (shareUi.open) {
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
      if (state.view !== 'generating') refresh({ silent: true });
    });
    document.addEventListener('visibilitychange', () => {
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
      const minMs = Number(state.generating.minMs) || 38_000;
      const pct = Math.min(100, Math.round((elapsed / minMs) * 100));

      const bar = document.getElementById('training-gen-bar');
      const msg = document.getElementById('training-gen-msg');
      const meta = document.getElementById('training-gen-meta');
      const prog = document.getElementById('training-gen-progress');

      if (bar) bar.style.width = `${pct}%`;
      if (prog) prog.setAttribute('aria-valuenow', String(pct));
      if (meta) meta.textContent = `${pct}% · This takes ~40 seconds.`;

      const idx = Math.min(messages.length - 1, Math.floor(elapsed / 6500));
      if (msg) msg.textContent = messages[idx] || messages[messages.length - 1] || 'Working...';

      state.generating.raf = requestAnimationFrame(tick);
    };

    state.generating.raf = requestAnimationFrame(tick);
  }

  const DISABLE_WIZARD_FLOW = true;
  const keepOnEngineAndRetry = ({ forceAutostart = false } = {}) => {
    if (engineRetryInFlight) return;
    engineRetryInFlight = true;
    setView('generating');
    Promise.resolve().then(async () => {
      try {
        const force = Boolean(forceAutostart || shouldForceAutostart());
        if (force) clearForceAutostart();
        const autoOnboarded = await tryAutoOnboardFromIntake(force);
        if (autoOnboarded) return;
        const ready = await pollForPlanReady({ maxMs: 25000, intervalMs: 1800 });
        if (ready) return;
        const hasIntake = !!readLocalIntake();
        state.planError = hasIntake
          ? 'Could not generate your workout yet. Tap "Generate workout" below.'
          : 'No saved setup found. Complete setup, then tap Enter Engine.';
        setView('plan');
      } finally {
        engineRetryInFlight = false;
      }
    });
  };

  function setView(next) {
    if (next === 'upsell') next = 'plan';
    if (DISABLE_WIZARD_FLOW && next === 'wizard') {
      const hasIntake = !!readLocalIntake();
      if (hasIntake || shouldForceAutostart()) {
        keepOnEngineAndRetry({ forceAutostart: shouldForceAutostart() });
      } else {
        state.planError = state.planError || 'No saved setup found. Complete setup to generate a workout.';
        state.view = 'plan';
        render();
      }
      return;
    }
    const prev = state.view;
    state.view = next;
    render();
    if (prev === 'generating' && next !== 'generating') stopGeneratingTicker();
    if (next === 'generating') startGeneratingTicker();
    if (next === 'plan') {
      window.setTimeout(() => {
        try { maybeShowTrainingWelcomeModal(); } catch { /* ignore */ }
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
    if (!silent) setView('loading');
    const forceAutostart = shouldForceAutostart();

    let me;
    try {
      me = await api('/api/auth/me', { method: 'GET' });
    } catch {
      state.auth.user = null;
      state.profile = null;
      state.planRow = null;
      state.logs = [];
      shareUi.open = false;
      shareUi.loaded = false;
      shareUi.bootstrapRequested = false;
      shareUi.accounts = [];
      shareUi.accountIndex.clear();
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
    if (!me.ok || !meUser) {
      state.auth.user = null;
      state.profile = null;
      state.planRow = null;
      state.logs = [];
      shareUi.open = false;
      shareUi.loaded = false;
      shareUi.bootstrapRequested = false;
      shareUi.accounts = [];
      shareUi.accountIndex.clear();
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
    state.auth.user = meUser;
    shareUi.open = false;
    shareUi.loaded = false;
    shareUi.bootstrapRequested = false;
    shareUi.accounts = [];
    shareUi.accountIndex.clear();
    shareUi.status = '';
    shareUi.requesting.clear();
    shareUi.kicking.clear();
    shareUi.requested.clear();
    shareUi.latestStatus.clear();
    clearShareConfirmToastTimer();

    let s;
    try {
      s = await api('/api/training/state', { method: 'GET' });
    } catch {
      state.planError = 'Failed to load training state. Please refresh.';
      setView('plan');
      return;
    }

    if (!s.ok) {
      if (s.status === 401) {
        state.auth.user = null;
        state.profile = null;
        state.planRow = null;
        state.logs = [];
        shareUi.open = false;
        shareUi.loaded = false;
        shareUi.bootstrapRequested = false;
        shareUi.accounts = [];
        shareUi.accountIndex.clear();
        shareUi.status = '';
        shareUi.requesting.clear();
        shareUi.kicking.clear();
        shareUi.requested.clear();
        shareUi.latestStatus.clear();
        clearShareConfirmToastTimer();
        setView('wizard');
        return;
      }
      state.planError = s.json?.error || 'Failed to load training state.';
      setView('plan');
      return;
    }
    state.profile = s.json?.profile || null;
    state.planRow = s.json?.plan || null;
    if (forceAutostart) {
      const autoOnboarded = await tryAutoOnboardFromIntake(true);
      if (autoOnboarded) return;
    }
    if (state.planRow?.id) {
      const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(state.planRow.id)}`, { method: 'GET' });
      state.logs = logsResp.ok ? (logsResp.json?.logs || []) : [];
      const dismissedKey = `ode_training_upsell_dismissed_${state.planRow.id}`;
      const dismissed = localStorage.getItem(dismissedKey) === '1';
      setView(dismissed ? 'plan' : 'upsell');
      return;
    }
    const autoOnboarded = await tryAutoOnboardFromIntake(forceAutostart);
    if (autoOnboarded) return;
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
      const nextBtn = el('button', { type: 'button', class: 'btn btn-primary' }, step === 4 ? 'Build plan' : 'Continue');
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
          : discipline === 'calisthenics'
            ? 'Bodyweight program built around push, pull, and skill work.'
            : 'Hypertrophy program built around progressive overload.';

      const disciplineChoices = [
        { key: 'powerlifting', title: 'Powerlifting', sub: 'Squat • Bench • Deadlift' },
        { key: 'bodybuilding', title: 'Hypertrophy', sub: 'Muscle gain' },
        { key: 'calisthenics', title: 'Calisthenics', sub: 'Bodyweight' }
      ];

      const disciplinePicker = el('div', null,
        el('div', { class: 'auth-label' }, 'Choose your program'),
        el('div', { class: 'training-muted' }, intro),
        el('div', { class: 'training-choice-grid', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
          disciplineChoices.map((opt) => {
            const isDisabled = opt.key !== 'bodybuilding';
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

      if (discipline === 'bodybuilding') {
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

        if (d === 'bodybuilding') {
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
        if (d === 'bodybuilding') {
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
        await submitOnboarding(payload);
      });
    }

    shell.append(content, actions);
    return shell;
  }

  function renderGenerating() {
    return el('div', { class: 'training-card training-center' },
      el('div', { class: 'training-loading' },
        el('div', { style: 'font-weight:800' }, 'Building your plan'),
        el('div', { class: 'training-muted', id: 'training-gen-msg' }, 'Starting...'),
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
        el('div', { class: 'training-muted', id: 'training-gen-meta', style: 'font-size:12px;' }, '0% · This takes ~40 seconds.')
      )
    );
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

  async function submitOnboarding(payload) {
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
    const isAuthed = Boolean(state.auth.user);
    const minMs = isAuthed ? (Number(state.generating?.minMs) || 38_000) : 1400;
    const minDelay = new Promise((r) => setTimeout(r, minMs));
    const endpoint = isAuthed ? '/api/training/onboarding' : '/api/training/preview';
    const totalTimeoutMs = isAuthed ? (minMs + 7000) : (minMs + 3000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), totalTimeoutMs);
    let resp;
    try {
      const req = api(endpoint, { method: 'POST', body: JSON.stringify(payload), signal: controller.signal })
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

    if (!resp.ok) {
      if (!forceAutostart) clearForceAutostart();
      if (resp.status === 401) {
        state.auth.user = null;
        state.profile = null;
        setView('wizard');
        return;
      }
      if (isAuthed) {
        const fallback = await fetchTrainingStateWithRetry({ tries: 3, delayMs: 1400 });
        if (fallback.ok && fallback.json?.plan?.id) {
          const nextPlan = fallback.json?.plan || null;
          if (isFreshPlanAfterSubmit(nextPlan, prevPlanId, requestStartedAt)) {
            state.profile = fallback.json?.profile || null;
            state.planRow = nextPlan;
            sanitizeBodybuildingPlanInPlace(state.planRow);
            const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(state.planRow.id)}`, { method: 'GET' });
            state.logs = logsResp.ok ? (logsResp.json?.logs || []) : [];
            setView('upsell');
            return;
          }
        }
      }
      state.planRow = null;
      state.logs = [];
      const errObj = resp?.json && typeof resp.json === 'object' ? resp.json : {};
      const detail = (() => {
        if (errObj?.error === 'INVALID_INPUT') {
          const field = errObj.field ? ` (${errObj.field})` : '';
          const reason = errObj.reason ? `: ${errObj.reason}` : '';
          return `INVALID_INPUT${field}${reason}`;
        }
        if (errObj?.error === 'NO_ELIGIBLE_EXERCISE') {
          const slot = errObj.slotId ? ` (${errObj.slotId})` : '';
          return `NO_ELIGIBLE_EXERCISE${slot}`;
        }
        return errObj?.error || errObj?.reason || '';
      })();
      state.planError = resp.status === 408
        ? 'Plan build timed out. Please try again.'
        : (detail || 'Failed to build plan.');
      setView('plan');
      return;
    }

    state.planRow = resp.json?.plan || null;
    sanitizeBodybuildingPlanInPlace(state.planRow);
    state.logs = resp.json?.logs || [];
    if (isAuthed && !state.planRow?.id) {
      const fallback = await fetchTrainingStateWithRetry({ tries: 3, delayMs: 1400 });
      if (fallback?.ok && fallback.json?.plan?.id) {
        const nextPlan = fallback.json?.plan || null;
        if (isFreshPlanAfterSubmit(nextPlan, prevPlanId, requestStartedAt)) {
          state.profile = fallback.json?.profile || state.profile;
          state.planRow = nextPlan;
          sanitizeBodybuildingPlanInPlace(state.planRow);
          const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(state.planRow.id)}`, { method: 'GET' });
          state.logs = logsResp.ok ? (logsResp.json?.logs || []) : [];
        }
      }
    }
    clearForceAutostart();
    try { sessionStorage.removeItem('ode_training_intake_handoff'); } catch {}
    if (state.planRow?.id) {
      const dismissedKey = `ode_training_upsell_dismissed_${state.planRow.id}`;
      localStorage.removeItem(dismissedKey);
    }
    setView(state.planRow?.id ? 'upsell' : 'plan');
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
        const baseId = String(e?.baseId || '').trim();
        if (!baseId) continue;
        const w = Number(e?.actual?.weight);
        const r = Number(e?.actual?.reps);
        const rpe = Number(e?.actual?.rpe);
        out.set(baseId, {
          weight: Number.isFinite(w) ? w : null,
          reps: Number.isFinite(r) ? r : null,
          rpe: Number.isFinite(rpe) ? rpe : null,
          performedAt: row?.performed_at ? String(row.performed_at).slice(0, 10) : null
        });
      }
    }
    return out;
  }

  async function saveWorkout({ weekIndex, dayIndex, exercises, dayNotes, performedAt }) {
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
      state.planError = 'Add readiness (1â€“10) before saving.';
      render();
      return;
    }

    const planRef = state.planRow?.plan || null;
    const entries = (exercises || []).map((ex) => {
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

      return {
        exerciseId: ex.id,
        baseId: ex.baseId,
        prescribed: {
          sets: ex.sets,
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

    if (resp.json?.plan) state.planRow = resp.json.plan;
    const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(planId)}`, { method: 'GET' });
    state.logs = logsResp.ok ? (logsResp.json?.logs || []) : state.logs;
    render();
  }

  function renderPlan() {
    const planRow = state.planRow;
    const sanitizeSummary = sanitizeBodybuildingPlanInPlace(planRow);
    if ((sanitizeSummary.removed > 0 || sanitizeSummary.capped > 0) && !state.planError) {
      state.planError = 'Invalid exercises/sets were removed from display. Regenerate plan for a clean rebuild.';
    }
    const plan = planRow?.plan;
    if (!plan || !Array.isArray(plan.weeks)) {
      const msg = state.planError || 'No plan found.';
      const hasIntake = !!readLocalIntake();
      return el('div', { class: 'training-card training-center' },
        el('div', { class: 'training-muted' }, msg),
        hasIntake
          ? el('div', { class: 'training-actions', style: 'margin-top:0.75rem' },
            el('button', {
              type: 'button',
              class: 'btn btn-primary',
              onclick: () => keepOnEngineAndRetry({ forceAutostart: true })
            }, 'Generate workout')
          )
          : null
      );
    }

    applyPendingScheduleIfDue(new Date());

    const isPreview = !planRow?.id || planRow?.preview || plan?.meta?.preview;

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

    async function resetTrainingPlanAndRestart() {
      const confirmFn = typeof window.odeConfirm === 'function' ? window.odeConfirm : null;
      if (!confirmFn) return;

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

      const ok = await confirmFn({
        title: 'Make a new workout?',
        message: 'This will archive your current training plan so it no longer shows.\nYour logged workouts and weights stay saved, but you will run Setup again.',
        confirmText: 'Continue',
        cancelText: 'Cancel',
        danger: true
      });
      if (!ok) return;

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
      window.location.href = 'training-coming-soon.html';
    }

    const logsMap = buildLogsMap(state.logs);

    const today = new Date();
    const defaultWeek = weekIndexForDate(today, plan);
    let activeWeek = Number(sessionStorage.getItem('ode_training_week'));
    if (!Number.isFinite(activeWeek) || activeWeek <= 0) activeWeek = defaultWeek;
    activeWeek = Math.max(1, Math.min(plan.weeks.length, activeWeek));

    const autoreg = plan?.meta?.autoreg && typeof plan.meta.autoreg === 'object' ? plan.meta.autoreg : {};
    const deloadWeeks = Array.isArray(autoreg?.deloadWeeks)
      ? autoreg.deloadWeeks.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];
    const isDeloadWeek = deloadWeeks.includes(activeWeek);
    const lastDecisionByBase = autoreg?.lastDecision && typeof autoreg.lastDecision === 'object' ? autoreg.lastDecision : {};

    const rules = plan?.meta?.rules && typeof plan.meta.rules === 'object' ? plan.meta.rules : null;
    const rulesDetails = rules
      ? el('details', { class: 'plan-rules plan-rules-inline' },
        el('summary', { class: 'plan-rules-summary btn btn-ghost' }, 'Rules'),
        el('div', { class: 'plan-rules-body' },
          ['structure', 'intensity', 'volume', 'progression', 'deload']
            .filter((k) => Array.isArray(rules?.[k]) && rules[k].length)
            .map((k) =>
              el('div', { class: 'plan-rules-block' },
                el('div', { class: 'plan-rules-title' }, k),
                el('ul', { class: 'plan-rules-list' }, rules[k].slice(0, 4).map((line) => el('li', null, String(line))))
              )
            )
        )
      )
      : null;

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

    const printPlanPdf = () => {
      const daysPerWeek = Number(plan?.meta?.daysPerWeek) || (Array.isArray(plan?.weeks?.[0]?.days) ? plan.weeks[0].days.length : 1);
      const week = plan.weeks.find((w) => Number(w.index) === activeWeek) || plan.weeks[0];
      const days = Array.isArray(week?.days) ? week.days : [];
      const schedule = scheduleWeekdays(daysPerWeek, activeDate);

      const discipline = String(plan.meta?.discipline || '').toUpperCase();
      const experience = String(plan.meta?.experience || '').toUpperCase();
      const profileStrength = state.profile?.strength || {};
      const bodyweight = Number(profileStrength?.bodyweight ?? plan?.baselines?.bodyweight ?? plan?.baselines?.trainingMax?.bodyweight);
      const tm = plan?.baselines?.trainingMax || {};
      const bbMoves = plan?.baselines?.bodybuilding?.movements || {};
      const pressMove = String(bbMoves.press || state.wizard?.strength?.pressMovement || 'Bench Press');
      const pullMove = String(bbMoves.pull || state.wizard?.strength?.pullMovement || 'Weighted Pull-up');
      const legMove = String(bbMoves.leg || state.wizard?.strength?.legMovement || 'Back Squat');
      const pressEst = Number(plan?.baselines?.press1rm);
      const pullEst = Number(plan?.baselines?.pull1rm);
      const legEst = Number(plan?.baselines?.leg1rm);

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

    const canShare = !isPreview && Boolean(state.auth.user);
    if (canShare && !shareUi.bootstrapRequested && !shareUi.loading) {
      shareUi.bootstrapRequested = true;
      loadShareAccounts('');
    }
    const acceptedShareMembers = [];
    for (const [rawId, status] of shareUi.latestStatus.entries()) {
      if (String(status || '').toLowerCase() !== 'accepted') continue;
      const id = String(rawId || '').trim();
      if (!id) continue;
      const account = shareUi.accountIndex.get(id)
        || (shareUi.accounts || []).find((item) => String(item?.id || '').trim() === id)
        || null;
      if (!account) continue;
      acceptedShareMembers.push(account);
    }
    const acceptedShareVisible = acceptedShareMembers.slice(0, 6);
    const acceptedShareOverflow = Math.max(0, acceptedShareMembers.length - acceptedShareVisible.length);
    const shareMembersStrip = acceptedShareMembers.length
      ? el('div', {
        class: 'share-workout-members',
        'aria-label': `${acceptedShareMembers.length} account${acceptedShareMembers.length === 1 ? '' : 's'} on this workout`
      },
      el('div', { class: 'share-workout-members-list' },
        acceptedShareVisible.map((member) => {
          const memberName = String(member?.displayName || member?.username || 'Account').trim() || 'Account';
          const memberId = String(member?.id || '').trim();
          const isKickingMember = Boolean(memberId) && shareUi.kicking.has(memberId);
          const initials = memberName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join('')
            .toUpperCase();
          if (!memberId) {
            return el('div', {
              class: 'share-workout-member-avatar',
              title: member?.username ? `${memberName} (@${member.username})` : memberName
            },
            member?.photoDataUrl
              ? el('img', { src: member.photoDataUrl, alt: memberName })
              : (initials || 'O'));
          }
          return el('button', {
            type: 'button',
            class: `share-workout-member-avatar share-workout-member-btn${isKickingMember ? ' is-kicking' : ''}`,
            title: member?.username ? `${memberName} (@${member.username})` : memberName,
            disabled: isKickingMember ? 'disabled' : null,
            'aria-label': `Kick ${memberName} from workout`,
            onclick: async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isKickingMember) return;
              await removeAcceptedShareForAccount(member);
            }
          },
          member?.photoDataUrl
            ? el('img', { src: member.photoDataUrl, alt: memberName })
            : (initials || 'O'),
          el('span', { class: 'share-workout-member-kick', 'aria-hidden': 'true' }, 'x'));
        }),
        acceptedShareOverflow > 0
          ? el('div', { class: 'share-workout-member-avatar extra', title: `${acceptedShareOverflow} more` }, `+${acceptedShareOverflow}`)
          : null
      )
      )
      : null;
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
            const actionLabel = isRequesting
              ? 'Requesting...'
              : isRequested
                ? 'Requested'
                : isAccepted
                  ? 'Accepted'
                  : isDeclined
                    ? 'Declined'
                    : 'Add';
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
              isAccepted
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

      const minDate = planStartDate(plan);
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

      const storedDateIso = sessionStorage.getItem('ode_training_active_date');
      let activeDate = parseISODateLocal(storedDateIso);
      if (!activeDate || Number.isNaN(activeDate.getTime())) {
        activeDate = today;
      }
      activeDate = clampDate(activeDate) || clampDate(today) || minDate;

      applyPendingScheduleIfDue(activeDate);

      activeWeek = weekIndexForDate(activeDate, plan);
      const week = plan.weeks.find((w) => Number(w.index) === activeWeek) || plan.weeks[0];
      const days = Array.isArray(week?.days) ? week.days : [];

      const schedule = scheduleWeekdays(daysPerWeek, activeDate);
      const weekdayToDayIndex = new Map();
      schedule.forEach((wd, idx) => {
        weekdayToDayIndex.set(wd, idx + 1);
      });

    const activeWeekday = activeDate.getDay();
    sessionStorage.setItem('ode_training_week', String(activeWeek));
    sessionStorage.setItem(`ode_training_day_${activeWeek}`, `wd:${activeWeekday}`);
    sessionStorage.setItem('ode_training_active_date', toISODateLocal(activeDate));

    const activeDayIndex = weekdayToDayIndex.get(activeWeekday) || null;
    const activeDay = activeDayIndex || -1;
    workoutTimer.context = {
      planId: state.planRow?.id || null,
      weekIndex: activeWeek,
      dayIndex: activeDayIndex,
      activeDate: toISODateLocal(activeDate)
    };

      const todayStart = dayStart(today);
      const isToday = dayStart(activeDate).getTime() === todayStart.getTime();

      const shareBox = el('div', { class: 'plan-topbar-share' },
      el('div', { class: 'plan-topbar-share-row' },
        isToday
          ? el('button', {
            type: 'button',
            class: `btn btn-start-workout${workoutTimer.running ? ' is-live' : workoutTimer.paused ? ' is-paused' : ''}`,
            onclick: () => {
              if (workoutTimer.running) confirmEndWorkout();
              else startWorkoutTimer();
            }
          }, workoutTimer.running ? 'End workout' : workoutTimer.paused ? 'Resume workout' : 'Start workout')
          : null,
        isToday ? el('div', { class: 'workout-timer-pill hidden', id: 'workout-timer-display' }, 'Workout 0:00') : null,
        el('button', {
          type: 'button',
          class: `btn btn-share-workout${canShare ? '' : ' is-disabled'}`,
          dataset: { shareWorkout: '1' },
          'aria-disabled': canShare ? 'false' : 'true',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!canShare) {
              openAuthModal('login');
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
        el('div', { class: 'share-workout-title' }, 'Share workout'),
        el('div', { class: 'share-workout-search' },
          el('input', {
            type: 'text',
            class: 'auth-input share-workout-input',
            value: shareUi.query || '',
            placeholder: 'Search friends',
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
      el('div', { class: 'plan-topbar-actions' },
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: openScheduleChangeModal }, 'Change workout days'),
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: resetTrainingPlanAndRestart }, 'Make New Workout'),
        rulesDetails,
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: printPlanPdf }, 'PDF')
      )
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
        const nextWeekIndex = weekIndexForDate(clamped, plan);
        const nextWeekday = clamped.getDay();
        sessionStorage.setItem('ode_training_week', String(nextWeekIndex));
        sessionStorage.setItem(`ode_training_day_${nextWeekIndex}`, `wd:${nextWeekday}`);
        sessionStorage.setItem('ode_training_week_expanded', String(nextWeekIndex));
        sessionStorage.setItem('ode_training_active_date', toISODateLocal(clamped));
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
          const saved = key ? Boolean(logsMap.get(key)) : false;
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
              ? `Day ${dayIndex} • ${day.focus || 'Workout'} • ${day.exercises?.length || 0} exercises`
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
      const savedBadge = log ? el('span', { class: 'training-badge good' }, 'Saved') : el('span', { class: 'training-badge' }, 'Not saved');
      const lastPerfMap = performanceMapBeforeSlot({
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
        el('div', { class: 'workout-today-title' }, todayTitle),
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

      const performedAtValue = log?.performed_at ? String(log.performed_at).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const dayNotesValue = log?.notes || '';
      const readinessValue = Number.isFinite(Number(log?.readiness)) ? Number(log.readiness) : '';
      const readinessInput = el('div', { class: 'training-row', style: 'align-items:center; gap:0.6rem; margin:0.6rem 0 0; flex-wrap:wrap' },
        el('label', { class: 'training-muted', for: 'workout-readiness' }, 'Rest/Readiness (1â€“10)'),
        el('input', {
          id: 'workout-readiness',
          class: 'auth-input',
          inputmode: 'numeric',
          min: '1',
          max: '10',
          value: readinessValue,
          placeholder: '1â€“10',
          style: 'max-width:110px'
        })
      );

      ensureExerciseCatalogLoaded();
      applySwapOverridesToDay({
        day,
        planId: state.planRow?.id,
        weekIndex: activeWeek,
        dayIndex
      });

      const list = el('div', { class: 'exercise-list' });
      (day.exercises || []).forEach((ex) => {
        const loggedEntries = Array.isArray(log?.entries) ? log.entries : [];
        const match = loggedEntries.find((e) => String(e?.exerciseId) === String(ex.id) || String(e?.baseId) === String(ex.baseId)) || null;

        const dec = lastDecisionByBase?.[String(ex.baseId || '')] || null;
        const decText = dec && typeof dec === 'object' && dec.message ? String(dec.message) : '';
        const repsTarget = Number.isFinite(ex?.progression?.repsTarget) ? ex.progression.repsTarget : parseRepsTarget(ex.reps);
        const technique = ex?.progression?.technique && String(ex.progression.technique).trim().toLowerCase() !== 'none'
          ? String(ex.progression.technique).trim()
          : '';



        const setsRepsRest = `${ex.sets} sets \u00D7 ${ex.reps} reps \u00D7 rest ${fmtRest(ex.restSec)}`;
          const setCount = (() => {
            const raw = String(ex.sets ?? '').trim();
            const num = Number(raw);
            if (Number.isFinite(num)) return Math.max(0, Math.min(12, Math.round(num)));
            const m = raw.match(/(\d+)/);
            if (m) return Math.max(0, Math.min(12, Number(m[1])));
            return 0;
          })();
          const baseSetCount = (() => {
            if (Number.isFinite(ex._baseSets)) return Math.max(0, Math.min(12, Math.round(ex._baseSets)));
            ex._baseSets = setCount;
            return setCount;
          })();
          const loggedSets = Array.isArray(match?.sets) ? match.sets : [];
          const addSetForExercise = () => {
            const next = Math.min(12, setCount + 1);
            if (next === setCount) return;
            ex.sets = next;
            render();
          };
          const removeSetForExercise = () => {
            if (setCount <= baseSetCount) return;
            ex.sets = Math.max(baseSetCount, setCount - 1);
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
                const s = loggedSets[idx] && typeof loggedSets[idx] === 'object' ? loggedSets[idx] : {};
                const wVal = Number.isFinite(Number(s.weight)) ? s.weight : '';
                const rVal = Number.isFinite(Number(s.reps)) ? s.reps : '';
                const noteVal = s.note ? String(s.note) : '';
                return el('div', { class: 'exercise-set-row' },
                  el('span', { class: 'exercise-set-label' }, `Set ${idx + 1}`),
                  el('input', {
                    class: 'auth-input',
                    inputmode: 'decimal',
                    value: wVal,
                    dataset: { exId: ex.id, field: 'setWeight', setIdx: String(idx) },
                    placeholder: 'Weight'
                  }),
                  el('input', {
                    class: 'auth-input',
                    inputmode: 'numeric',
                    value: rVal,
                    dataset: { exId: ex.id, field: 'setReps', setIdx: String(idx) },
                    placeholder: 'Reps'
                  }),
                  el('input', {
                    class: 'auth-input',
                    value: noteVal,
                    dataset: { exId: ex.id, field: 'setNote', setIdx: String(idx) },
                    placeholder: 'Notes'
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
                      onclick: removeSetForExercise
                    }, '–')
                    : null,
                  el('button', {
                    type: 'button',
                    class: 'exercise-set-add',
                    title: 'Add set',
                    'aria-label': 'Add set',
                    onclick: addSetForExercise
                  }, '+')
                )
              )
            )
            : null;
        const projected = fmtProjected(resolveProjectedForExercise(ex, plan));
        const lastPerf = lastPerfMap.get(String(ex.baseId || '')) || null;
        const lastWeekCompact = (() => {
          if (!lastPerf) return '—';
          const parts = [];
          if (Number.isFinite(lastPerf.weight)) parts.push(`${lastPerf.weight} lb`);
          if (Number.isFinite(lastPerf.reps)) parts.push(`×${lastPerf.reps}`);
          if (Number.isFinite(lastPerf.rpe)) parts.push(`@${lastPerf.rpe}`);
          return parts.length ? parts.join(' ') : '—';
        })();
        const lastWeekTitle = lastPerf?.performedAt
          ? `Last performed: ${lastPerf.performedAt}${lastWeekCompact !== '—' ? ` • ${lastWeekCompact}` : ''}`
          : 'No previous performance logged';

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
            const type = media.type === 'video' ? 'video' : 'image';
            const srcRaw = media.type === 'local-pair' ? media.src0 : media.src;
            const src = toFreeExerciseDbRemotePath(srcRaw) || srcRaw;
            if (!src) return;
            openExerciseMediaModal({ type, src: String(src), alt: String(ex?.name || 'Exercise') });
          }
        }, mediaSkeleton, mediaFrame);

        list.appendChild(
          el('div', { class: 'exercise-row has-media' },
            mediaBtn,
            el('div', { class: 'exercise-meta' },
              el('div', { class: 'exercise-name' }, ex.displayName || ex.name),
              el('div', { class: 'exercise-prescription' }, setsRepsRest),
              ex.tempo ? el('div', { class: 'exercise-substitutions' }, `Tempo: ${String(ex.tempo)}`) : null,
              ex.coaching?.progress ? el('div', { class: 'training-muted', style: 'margin-top:0.35rem' }, `Progress: ${String(ex.coaching.progress)}`) : null,
              ex.coaching?.regress ? el('div', { class: 'training-muted' }, `Regress: ${String(ex.coaching.regress)}`) : null,
              Number.isFinite(repsTarget) ? el('div', { class: 'exercise-substitutions' }, `Target reps: ${repsTarget}`) : null,
              technique ? el('div', { class: 'exercise-substitutions' }, `Final-set technique: ${technique}`) : null,
              subs.length
                ? el('div', { class: 'exercise-substitutions' }, `Alt: ${subs.slice(0, 2).join(' • ')}`)
                : null,
              el('div', { class: 'exercise-badges' },
                el('span', { class: 'lastweek-pill', title: lastWeekTitle }, `Last week ${lastWeekCompact}`),
                el('span', { class: 'projected-pill', title: 'Projected weight' }, `Projected ${projected}`)
              ),
              decText ? el('div', { class: 'training-muted', style: 'margin-top:0.35rem' }, `Next: ${decText}`) : null,
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
                }, 'Report pain')
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
              el('div', { class: 'day-title' }, `${dispCur.title} — ${getDayTitle(day)}`),
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
          el('div', { class: 'training-section-line' })
        )
       );
    });

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
        el('div', { class: 'training-card training-center' }, el('div', { class: 'training-muted' }, 'Workout not scheduled for this day.'))
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
        ensureWorkoutTimerTick();
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
    const deload = (week % 4 === 0);
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
  window.addEventListener('beforeunload', () => {
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
  loadAuthAndState({ silent: !navLoading }).catch(() => setView('wizard'));
})();


































