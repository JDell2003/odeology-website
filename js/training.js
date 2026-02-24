(() => {
  const root = document.getElementById('training-root');
  if (!root) return;

  const TRAINING_INTAKE_KEY = 'ode_training_intake_v2';

  function readLocalIntake() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TRAINING_INTAKE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
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

  function renderTrainingGate({ user, intakeDone }) {
    const name = user?.displayName || user?.username || 'athlete';
    const signedIn = Boolean(user);

    if (!signedIn) {
      root.innerHTML = `
        <section class="plan-card">
          <div class="card-head"><h4>Training</h4></div>
          <div class="overview-card-summary">
            <div class="overview-summary-list">
              <div class="overview-summary-item">
                <div class="overview-summary-left">
                  <div class="overview-summary-title">Create your account</div>
                  <div class="overview-summary-sub ns-muted">Make an account and you will get your training plan here.</div>
                </div>
              </div>
            </div>
            <a class="btn btn-primary" href="training-coming-soon.html">Go to Training Intake</a>
          </div>
        </section>
      `.trim();
      return;
    }

    if (!intakeDone) {
      root.innerHTML = `
        <section class="plan-card">
          <div class="card-head"><h4>Training</h4></div>
          <div class="overview-card-summary">
            <div class="overview-summary-list">
              <div class="overview-summary-item">
                <div class="overview-summary-left">
                  <div class="overview-summary-title">Training not made yet</div>
                  <div class="overview-summary-sub ns-muted">Answer Training Coming Soon questions first, then your workouts will appear here.</div>
                </div>
              </div>
            </div>
            <a class="btn btn-primary" href="training-coming-soon.html">Answer Training Questions</a>
          </div>
        </section>
      `.trim();
      return;
    }

    root.innerHTML = `
      <section class="plan-card">
        <div class="card-head"><h4>Training</h4></div>
        <div class="overview-card-summary">
          <div class="overview-summary-list">
            <div class="overview-summary-item">
              <div class="overview-summary-left">
                <div class="overview-summary-title">Training intake complete</div>
                <div class="overview-summary-sub ns-muted">Welcome ${escapeHtml(name)}. Workout generation will populate here once the engine is wired.</div>
              </div>
            </div>
          </div>
          <a class="btn btn-ghost" href="training-coming-soon.html">Review Intake Answers</a>
        </div>
      </section>
    `.trim();
  }

  async function initTrainingPlaceholder() {
    let user = null;
    let intakeDone = isIntakeComplete(readLocalIntake());

    try {
      const meResp = await fetch('/api/auth/me', { credentials: 'include' });
      const meData = await meResp.json().catch(() => ({}));
      user = meData?.user || null;
    } catch {
      user = null;
    }

    if (user && !intakeDone) {
      try {
        const pResp = await fetch('/api/profile', { credentials: 'include' });
        const pData = await pResp.json().catch(() => ({}));
        const remoteIntake = pData?.profile?.profile?.training_intake || null;
        intakeDone = isIntakeComplete(remoteIntake);
      } catch {
        // ignore
      }
    }

    renderTrainingGate({ user, intakeDone });
  }

  initTrainingPlaceholder();
  return;

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
const LOCAL_EXERCISE_FOLDERS_URL = '/free-exercise-db/folders.json';
let localExerciseFolders = null;
let localExerciseFolderSet = new Set();
let localExerciseFolderTokens = [];
let localExerciseLoadPromise = null;

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

function ensureLocalExerciseFoldersLoaded() {
  if (localExerciseFolders || localExerciseLoadPromise) return;
  localExerciseLoadPromise = fetch(LOCAL_EXERCISE_FOLDERS_URL)
    .then((r) => (r.ok ? r.json() : []))
    .then((folders) => {
      localExerciseFolders = Array.isArray(folders) ? folders : [];
      buildFolderTokenCache(localExerciseFolders);
      queueMediaRerender();
    })
    .catch(() => {
      localExerciseFolders = [];
      localExerciseFolderTokens = [];
    })
    .finally(() => {
      localExerciseLoadPromise = null;
    });
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
  if (!localExerciseFolders) {
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

  let exerciseCatalog = [];
  let exerciseIndexById = new Map();
  let catalogLoading = false;
  let catalogLoadingPromise = null;
  function ensureExerciseCatalogLoaded() {
    if (exerciseCatalog.length) return Promise.resolve(exerciseCatalog);
    if (catalogLoadingPromise) return catalogLoadingPromise;
    catalogLoading = true;
    catalogLoadingPromise = fetch('/free-exercise-db/dist/exercises.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        const opts = Array.isArray(list) ? list : [];
        exerciseCatalog = opts;
        exerciseIndexById = new Map();
        for (const ex of opts) {
          const id = String(ex?.id || '').trim();
          if (!id) continue;
          exerciseIndexById.set(id, ex);
        }
        return exerciseCatalog;
      })
      .catch(() => {
        exerciseCatalog = [];
        exerciseIndexById = new Map();
        return exerciseCatalog;
      })
      .finally(() => {
        catalogLoading = false;
        catalogLoadingPromise = null;
        render();
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
        const src0 = mediaPath;
        const src1 = mediaPathAlt || (mediaPath.includes('/0.') ? mediaPath.replace('/0.', '/1.') : mediaPath);
        return {
          type: 'local-pair',
          src0,
          src1,
          alt: displayName
        };
      }

      const name = String(ex?.movementName || displayName || '').trim();
      const folder = name ? matchLocalExerciseFolder(name) : null;
      if (folder) {
        const safeFolder = encodeURIComponent(folder);
        return {
          type: 'local-pair',
          src0: '/free-exercise-db/exercises/' + safeFolder + '/0.jpg',
          src1: '/free-exercise-db/exercises/' + safeFolder + '/1.jpg',
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
      return el('img', { class: 'exercise-media-img', src: media.src, alt: ex?.name || 'Exercise', loading: 'lazy' });
    }
    if (media?.type === 'local-pair' && media?.src0 && media?.src1) {
      const wrap = el('div', { class: 'exercise-media-pair' });
      const imgA = el('img', { class: 'exercise-media-img exercise-media-img-a', src: media.src0, alt: media.alt || ex?.name || 'Exercise', loading: 'lazy' });
      const imgB = el('img', { class: 'exercise-media-img exercise-media-img-b', src: media.src1, alt: media.alt || ex?.name || 'Exercise', loading: 'lazy' });
      const onError = () => {
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

  function applySwapOverridesToDay({ day, planId, weekIndex, dayIndex }) {
    if (!day || !Array.isArray(day.exercises)) return;
    for (const ex of day.exercises) {
      const override = getSwapOverride(planId, weekIndex, dayIndex, ex?.slotId);
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
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close swap' }, '�')
        ),
        el('div', { class: 'schedule-modal-body' },
          candidates.length
            ? el('div', { class: 'training-row', style: 'flex-direction:column; gap:0.5rem; align-items:stretch' },
              candidates.map((id) =>
                el('button', {
                  type: 'button',
                  class: 'btn btn-ghost',
                  onclick: () => {
                    const prevId = ex.exerciseId;
                    ex.exerciseId = id;
                    const media = exerciseMediaFromId(id);
                    if (media.displayName) ex.displayName = media.displayName;
                    ex.mediaPath = media.mediaPath;
                    ex.mediaPathAlt = media.mediaPathAlt;
                    setSwapOverride(state.planRow?.id, weekIndex, dayIndex, ex.slotId, id);
                    logTrainingEvent('swap_exercise', {
                      weekIndex,
                      dayIndex,
                      slotId: ex.slotId,
                      intentKey: ex.intentKey,
                      oldExerciseId: prevId,
                      newExerciseId: id,
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
                          newExerciseId: id
                        })
                      });
                    } catch {
                      // ignore
                    }
                    overlay.remove();
                    render();
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
          el('button', { class: 'schedule-modal-close', type: 'button', 'aria-label': 'Close explanation' }, '�')
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
          loading: 'lazy'
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

    const resp = await fetch(path, {
      credentials: 'include',
      headers,
      ...opts
    });
    let json = null;
    try {
      json = await resp.json();
    } catch {
      json = null;
    }
    return { ok: resp.ok, status: resp.status, json };
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
        setView('wizard');
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

  function setView(next) {
    const prev = state.view;
    state.view = next;
    render();
    if (prev === 'generating' && next !== 'generating') stopGeneratingTicker();
    if (next === 'generating') startGeneratingTicker();
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

    let me;
    try {
      me = await api('/api/auth/me', { method: 'GET' });
    } catch {
      state.auth.user = null;
      state.profile = null;
      state.planRow = null;
      state.logs = [];
      setView('wizard');
      return;
    }

    const meUser = me.ok ? (me.json?.user || null) : null;
    if (!me.ok || !meUser) {
      state.auth.user = null;
      state.profile = null;
      state.planRow = null;
      state.logs = [];
      setView('wizard');
      return;
    }
    state.auth.user = meUser;

    let s;
    try {
      s = await api('/api/training/state', { method: 'GET' });
    } catch {
      setView('wizard');
      return;
    }

    if (!s.ok) {
      if (s.status === 401) {
        state.auth.user = null;
        state.profile = null;
        state.planRow = null;
        state.logs = [];
        setView('wizard');
        return;
      }
      setView('wizard');
      return;
    }
    state.profile = s.json?.profile || null;
    state.planRow = s.json?.plan || null;
    if (state.planRow?.id) {
      const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(state.planRow.id)}`, { method: 'GET' });
      state.logs = logsResp.ok ? (logsResp.json?.logs || []) : [];
      const dismissedKey = `ode_training_upsell_dismissed_${state.planRow.id}`;
      const dismissed = localStorage.getItem(dismissedKey) === '1';
      setView(dismissed ? 'plan' : 'upsell');
      return;
    }
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
              el('div', { class: 'auth-label' }, 'What do you want to grow most right now? (pick up to 2)'),
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
                        if (out.length > 2) out.pop();
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
    const goalMode = state.wizard.goalMode || 'muscle_gain';
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
      strength.phase = String(state.wizard.phase || 'bulk').trim().toLowerCase();
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
      phase: state.wizard.phase,
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
          || (state.wizard.phase === 'cut' ? 'Goal: cut (definition)'
            : state.wizard.phase === 'maintain' ? 'Goal: maintain'
              : 'Goal: bulk'),
        injuries: String(profile.injuries || '').trim()
      },
      profileImage: state.wizard.profileImage?.dataUrl ? { dataUrl: state.wizard.profileImage.dataUrl } : null
    };
  }

  async function submitOnboarding(payload) {
    setView('generating');
    try {
      localStorage.setItem(GUEST_PAYLOAD_KEY, JSON.stringify(payload || {}));
    } catch {
      // ignore
    }

    const isAuthed = Boolean(state.auth.user);
    const minMs = isAuthed ? (Number(state.generating?.minMs) || 38_000) : 1400;
    const minDelay = new Promise((r) => setTimeout(r, minMs));
    const endpoint = isAuthed ? '/api/training/onboarding' : '/api/training/preview';
    const req = api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    const [resp] = await Promise.all([req, minDelay]);

    if (!resp.ok) {
      if (resp.status === 401) {
        state.auth.user = null;
        state.profile = null;
        setView('wizard');
        return;
      }
      setView('wizard');
      const err = qs('#training-wizard-error');
      if (err) {
        err.textContent = resp.json?.error || 'Failed to build plan.';
        err.classList.remove('hidden');
      }
      return;
    }

    state.planRow = resp.json?.plan || null;
    state.logs = resp.json?.logs || [];
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

    const entries = (exercises || []).map((ex) => {
      const exId = String(ex.id);
      const findField = (field) => qsa(`[data-field="${field}"]`).find((n) => n?.dataset?.exId === exId) || null;
      const notes = '';

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
      const summaryRpe = null;

      return {
        exerciseId: ex.id,
        baseId: ex.baseId,
        prescribed: {
          sets: ex.sets,
          reps: ex.reps,
          repsTarget: Number.isFinite(ex?.progression?.repsTarget) ? ex.progression.repsTarget : parseRepsTarget(ex.reps),
          restSec: ex.restSec,
          projectedWeight: Number.isFinite(ex.projected?.value) ? ex.projected.value : null,
          projectedUnit: ex.projected?.unit || null
        },
        target: { weight: null },
        actual: {
          weight: Number.isFinite(summaryWeight) ? summaryWeight : null,
          reps: Number.isFinite(summaryReps) ? summaryReps : null,
          rpe: Number.isFinite(summaryRpe) ? summaryRpe : null
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
        notes: dayNotes
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
    const plan = planRow?.plan;
    if (!plan || !Array.isArray(plan.weeks)) {
      return el('div', { class: 'training-card training-center' }, el('div', { class: 'training-muted' }, 'No plan found.'));
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

    function clearTrainingClientStorage() {
      try {
        localStorage.removeItem(UNAVAIL_DAYS_KEY);
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

    async function resetTrainingPlanAndRestart() {
      const confirmFn = typeof window.odeConfirm === 'function' ? window.odeConfirm : null;
      if (!confirmFn) return;

      if (isPreview || !state.auth.user) {
        clearTrainingClientStorage();
        state.profile = null;
        state.planRow = null;
        state.logs = [];
        state.planError = null;
        state.wizard = makeDefaultWizard();
        setView('wizard');
        return;
      }

      const ok = await confirmFn({
        title: 'Make a new workout?',
        message: 'This will overwrite your current training plan and workout logs.\nYou will go through Setup again.',
        confirmText: 'Continue',
        cancelText: 'Cancel',
        danger: true
      });
      if (!ok) return;

      setView('loading');
      const resp = await api('/api/training/reset', { method: 'POST', body: JSON.stringify({}) });
      if (!resp.ok) {
        state.planError = resp.json?.error || 'Could not reset training data.';
        setView('plan');
        return;
      }

      clearTrainingClientStorage();
      state.profile = null;
      state.planRow = null;
      state.logs = [];
      state.planError = null;
      state.wizard = makeDefaultWizard();
      await loadAuthAndState();
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

    const header = el('div', { class: 'training-card plan-topbar' },
      el('div', { class: 'plan-topbar-main' },
        el('h3', { style: 'margin:0 0 0.25rem' }, 'Your training plan'),
        el('div', { class: 'training-muted' },
          `${String(plan.meta?.discipline || '').toUpperCase()} • ${plan.meta?.daysPerWeek} days/week • ${String(plan.meta?.experience || '').toUpperCase()}`
        ),
        isDeloadWeek ? el('div', { class: 'training-muted', style: 'margin-top:0.35rem' }, 'Deload week: load and sets are reduced; no progression.') : null,
        pendingLabel ? el('div', { class: 'training-muted', style: 'margin-top:0.35rem' }, pendingLabel) : null
      ),
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

    const dayTabs = el('div', { class: 'day-tabs' },
        WEEKDAY_ORDER.map((weekday) => {
          const dayIndex = weekdayToDayIndex.get(weekday) || null;
          const day = dayIndex ? days[dayIndex - 1] : null;
          const abbr = WEEKDAYS_SHORT[weekday] || String(WEEKDAYS[weekday] || '').slice(0, 1);
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

      const todayBar = el('div', { class: 'workout-today-bar' },
        el('div', { class: 'workout-today-title' }, '~ Workout day ~'),
        el('div', { class: 'workout-today-sub' }, `${dispCur.title} • Week ${activeWeek}`),
        el('div', { class: 'workout-today-nav' },
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoPrev ? null : 'true', onclick: () => shiftDay(-1), 'aria-label': 'Previous day' }, '‹'),
          el('div', { class: 'workout-rel-label', role: 'status', 'aria-live': 'polite' }, relativeWorkoutLabel()),
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoNext ? null : 'true', onclick: () => shiftDay(1), 'aria-label': 'Next day' }, '›')
        )
      );

      const exp = String(plan.meta?.experience || '').toLowerCase();
      const goalLine = exp === 'beginner'
        ? 'Goal: stay under RPE 8 • hit the top of the rep range with clean form'
        : 'Goal: beat last time (reps first, then load) • main lift can push to RPE 9–10 on final set';

      const performedAtValue = log?.performed_at ? String(log.performed_at).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const dayNotesValue = log?.notes || '';

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
                    dataset: { exId: ex.id, field: 'setWeight', setIdx: String(idx) }
                  }),
                  el('input', {
                    class: 'auth-input',
                    inputmode: 'numeric',
                    value: rVal,
                    dataset: { exId: ex.id, field: 'setReps', setIdx: String(idx) }
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
        const projected = fmtProjected(ex.projected);
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
            const src = media.type === 'local-pair' ? media.src0 : media.src;
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

        const canEditDate = (() => {
          const todayStart = dayStart(today);
          const diffDays = Math.floor((todayStart.getTime() - dayStart(activeDate).getTime()) / 86400000);
          return diffDays <= 3;
        })();

        const saveBtn = el('button', {
          type: 'button',
          class: `btn ${isPreview ? 'btn-ghost' : 'btn-primary'} training-save-btn`,
          disabled: (!isPreview && !canEditDate) ? 'true' : null,
          title: (!isPreview && !canEditDate) ? 'Edits are allowed for the last 3 days only.' : null,
          onclick: async () => {
            if (isPreview) {
              state.planError = 'Sign in to save workouts.';
              openAuthModal('login');
              render();
              return;
            }
            if (!canEditDate) return;
            saveBtn.disabled = true;
          const prev = saveBtn.textContent;
          saveBtn.textContent = 'Saving...';
          try {
            await saveWorkout({
              weekIndex: activeWeek,
              dayIndex,
              exercises: day.exercises || [],
              dayNotes: String(dayNotesValue || '').trim(),
              performedAt: performedAtValue || null
            });
          } finally {
            if (saveBtn.isConnected) {
              saveBtn.disabled = false;
              saveBtn.textContent = prev;
            }
          }
        }
      }, isPreview ? 'Sign in to save' : 'Save workout');

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
              el('div', { class: 'day-title' }, `${dispCur.title} — ${day.focus || ''}`.trim()),
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
          el('div', { class: 'training-section-line' }),
          el('div', { class: 'training-subcard training-save-card' },
            el('div', { class: 'training-actions' }, saveBtn)
          )
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
        el('div', { class: 'workout-today-title' }, '~ Workout day ~'),
        el('div', { class: 'workout-today-sub' }, `${WEEKDAYS[activeWeekday]} • Week ${activeWeek}`),
        el('div', { class: 'workout-today-nav' },
          el('button', { type: 'button', class: 'workout-nav-btn', disabled: canGoPrev ? null : 'true', onclick: () => shiftDay(-1), 'aria-label': 'Previous day' }, '‹'),
          el('div', { class: 'workout-rel-label', role: 'status', 'aria-live': 'polite' }, formatDateDMY(activeDate)),
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
    const panelBg = el('div', { class: 'training-panel-bg', id: 'training-panel-bg' });
    const photo = getActivePhotoDataUrl();
    if (photo && state.view === 'plan') {
      panelBg.classList.add('has-photo', 'photo-blur');
      panelBg.style.backgroundImage = `url(${photo})`;
    }

    panelBg.appendChild(renderBackgroundDashboard());

    return el('div', { class: 'training-panel' },
      panelBg,
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

    // Save button
    const saveBtn = root.querySelector('.training-save-btn');
    saveBtn.onclick = () => {
      saveBtn.disabled = true;
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = '✓ Saved!';
        setTimeout(() => saveBtn.textContent = 'Save workout', 1200);
      }, 900);
    };

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

  wireAuthSync();
  loadAuthAndState({ silent: true }).catch(() => setView('wizard'));
})();





























