(() => {
  const $ = (sel) => document.querySelector(sel);
  const COACH_BADGE_OPTIONS = [
    'Builder',
    'Advanced',
    'Fat Loss',
    'Muscle Gain',
    'Strength',
    'Lifestyle',
    'Accountability',
    'Nutrition',
    'Form Fixes',
    'Athletes'
  ];
  const SPECIALTY_CLIENT_OPTIONS = [
    'Fat loss',
    'Muscle gain',
    'Body recomposition',
    'Busy professionals',
    'Beginners',
    'Strength',
    'Athletes',
    'Lifestyle',
    'Wedding prep',
    'Postpartum'
  ];
  const SOCIAL_LINK_DEFS = [
    {
      key: 'instagramUrl',
      type: 'instagram',
      label: 'Instagram',
      placeholder: 'https://instagram.com/you',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect><circle cx="12" cy="12" r="4.1"></circle><circle cx="17.3" cy="6.9" r="1.1"></circle></svg>'
    },
    {
      key: 'tiktokUrl',
      type: 'tiktok',
      label: 'TikTok',
      placeholder: 'https://tiktok.com/@you',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5c.7 2 2.1 3.2 4 3.6v2.7c-1.6-.1-2.9-.6-4-1.5v5.9a5.1 5.1 0 1 1-5.1-5.1c.4 0 .8 0 1.2.1v2.8a2.5 2.5 0 1 0 1.3 2.2V4.5Z"></path></svg>'
    },
    {
      key: 'linkedinUrl',
      type: 'linkedin',
      label: 'LinkedIn',
      placeholder: 'https://linkedin.com/in/you',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 8.5A1.7 1.7 0 1 1 6.7 5a1.7 1.7 0 0 1 0 3.5ZM5.3 10h2.8v8.7H5.3Zm4.5 0h2.7v1.2h.1c.4-.7 1.3-1.5 2.8-1.5 3 0 3.6 2 3.6 4.5v4.5h-2.8v-4c0-1 0-2.2-1.4-2.2s-1.6 1-1.6 2.1v4.1H9.8Z"></path></svg>'
    },
    {
      key: 'youtubeUrl',
      type: 'youtube',
      label: 'YouTube',
      placeholder: 'https://youtube.com/@you',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8.5a2.8 2.8 0 0 0-2-2c-1.8-.5-9-.5-9-.5s-7.2 0-9 .5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 0 12a29 29 0 0 0 1 3.5 2.8 2.8 0 0 0 2 2c1.8.5 9 .5 9 .5s7.2 0 9-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 24 12a29 29 0 0 0-1-3.5ZM9.5 15.5v-7l6 3.5Z"></path></svg>'
    },
    {
      key: 'websiteUrl',
      type: 'website',
      label: 'Website',
      placeholder: 'https://your-site.com',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm5.9 8h-3.1a14.6 14.6 0 0 0-1-4.2A7 7 0 0 1 17.9 11ZM12 5.1c.8 1 1.6 3 1.9 5.9h-3.8C10.4 8.1 11.2 6.1 12 5.1ZM5.1 13h3.1a14.6 14.6 0 0 0 1 4.2A7 7 0 0 1 5.1 13Zm3.1-2H5.1a7 7 0 0 1 4.1-4.2A14.6 14.6 0 0 0 8.2 11Zm3.8 7.9c-.8-1-1.6-3-1.9-5.9h3.8c-.3 2.9-1.1 4.9-1.9 5.9Zm1.8-1.7a14.6 14.6 0 0 0 1-4.2h3.1a7 7 0 0 1-4.1 4.2Z"></path></svg>'
    }
  ];
  const MAX_EDIT_RESULTS = 4;
  const DEMO_TRAINER_STORAGE_KEY = 'trainer-profile-demo-averystone-v3';
  const LEGACY_DEMO_TRAINER_STORAGE_KEYS = [
    'trainer-profile-demo-averystone-v2',
    'trainer-profile-demo-averystone'
  ];
  const INITIAL_DOCUMENT_TITLE = String(document.title || '').trim() || 'Trainer Profile';
  const INITIAL_META_DESCRIPTION = String(document.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim();
  const INITIAL_CANONICAL_HREF = String(document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '').trim();
  const pageState = {
    trainer: null,
    view: '',
    trainerPages: [],
    currentTrainerPage: null,
    publicPagePayload: null,
    publicPageLoadState: {
      status: 0,
      unavailable: false,
      notFound: false
    },
    publicAutomationEventKey: '',
    requestedPublicRoute: false,
    pendingStandaloneEditorOpen: false,
    pendingStandaloneEditorTimer: 0,
    standaloneNotice: '',
    standaloneNoticeKind: 'success',
    standaloneNoticeTimer: 0,
    routeLoaderVisible: false,
    routeLoaderStartedAt: 0,
    routeLoaderHideTimer: 0,
    routeLoaderProgressTimer: 0,
    routeLoaderProgressValue: 0
  };
  const qualificationState = {
    initializedKey: '',
    sessionKey: '',
    sessionId: '',
    leadId: '',
    currentStep: 0,
    answers: {},
    completed: false,
    revealed: false,
    dismissedUntil: 0,
    saving: false,
    error: ''
  };
  const editorState = {
    enabled: false,
    dirty: false,
    saving: false,
    finalizingStandaloneSave: false,
    versionLoading: false,
    editorCodeTab: 'html',
    original: null,
    draft: null,
    autosaveTimer: 0,
    historyPast: [],
    historyFuture: [],
    previewMode: false,
    previewDevice: 'desktop',
    versions: []
  };
  const standaloneInspectorState = {
    selected: false,
    minimized: false,
    text: '',
    fontSize: '',
    color: '#111111',
    backgroundColor: '#ffffff',
    fontWeight: '',
    fontFamily: '',
    fontStyle: '',
    bounds: null
  };
  let standaloneCodeHighlightRange = null;
  const TRAINER_PAGE_AUTOSAVE_MS = 1400;
  const TRAINER_ROUTE_LOADER_ACCENT = '#2563eb';
  const QUALIFICATION_PROGRESS_KEY = 'trainer-page-qualification-v1';
  const QUALIFICATION_DISMISS_MS = 6 * 60 * 60 * 1000;
  const TRAINER_PROFILE_API_TIMEOUT_MS = 6500;
  const DEFAULT_QUALIFICATION_QUESTIONS = [
    { id: 'gender', label: 'Gender', type: 'radio', required: true, options: ['Female', 'Male', 'Other'] },
    { id: 'age', label: 'Age', type: 'radio', required: true, options: ['Under 18', '18-20', '21-30', '31-40', '41-50', '51-59', '60+', 'Other'] },
    { id: 'trainer_gender_preference', label: 'Trainer gender preference', type: 'radio', required: true, options: ['Female', 'Male', 'No preference', 'Other'] },
    { id: 'session_frequency', label: 'Session frequency', type: 'radio', required: true, options: ['Several weekly', 'Twice weekly', 'Once weekly', 'Twice monthly', 'Once monthly', 'One-off', 'Unsure', 'Other'] },
    { id: 'exercise_routine', label: 'Exercise routine', type: 'radio', required: true, options: ['None', 'About 1 hour weekly', 'A couple times weekly', '3+ times weekly', 'Prefer not to say', 'Other'] },
    { id: 'goals', label: 'Goals', type: 'checkbox', required: true, options: ['Aerobic fitness', 'Bodybuilding', 'Endurance', 'Toning', 'Strength', 'Nutrition', 'Weight loss', 'Discuss with trainer'] },
    { id: 'motivation', label: 'Motivation', type: 'radio', required: true, options: ['Health condition', 'Appearance', 'Physical event', 'Special event', 'Other'] },
    { id: 'open_to_online_training', label: 'Open to online training', type: 'radio', required: true, options: ['Yes', 'No'] },
    { id: 'preferred_days', label: 'Preferred days', type: 'checkbox', required: true, options: ['Any day', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
    { id: 'preferred_times', label: 'Preferred times', type: 'checkbox', required: true, options: ['Any time', 'Early morning', 'Morning', 'Early afternoon', 'Late afternoon', 'Evening', 'Other'] },
    { id: 'start_date', label: 'Start date', type: 'radio', required: true, options: ['ASAP', 'Within weeks', 'Within a month', 'Other'] },
    { id: 'zip_or_town', label: 'ZIP code or town', type: 'text', required: true, placeholder: 'ZIP code or town' },
    { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' },
    { id: 'name_and_phone', label: 'Name and phone', type: 'contact', required: true, fields: ['full_name', 'phone'] }
  ];
  async function api(path, options = {}) {
    const timeoutMs = Math.max(1200, Number(options.timeoutMs) || TRAINER_PROFILE_API_TIMEOUT_MS);
    const externalSignal = options.signal;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = 0;
    const forwardAbort = () => {
      try {
        controller?.abort();
      } catch {
        // ignore abort failures
      }
    };
    if (externalSignal?.aborted) forwardAbort();
    if (externalSignal && typeof externalSignal.addEventListener === 'function') {
      externalSignal.addEventListener('abort', forwardAbort, { once: true });
    }
    if (controller) {
      timeoutId = window.setTimeout(() => {
        try {
          controller.abort();
        } catch {
          // ignore abort failures
        }
      }, timeoutMs);
    }
    try {
      const resp = await fetch(path, {
        credentials: 'include',
        ...options,
        signal: controller?.signal || externalSignal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      const json = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, json };
    } catch {
      return { ok: false, status: 0, json: {} };
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
        externalSignal.removeEventListener('abort', forwardAbort);
      }
    }
  }

  function escapeHtml(raw) {
    return String(raw || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function unwrapMarkdownCodeFence(raw) {
    const text = String(raw || '').trim();
    const fenceMatch = text.match(/^```[a-z0-9_-]*\s*\n([\s\S]*?)\n```$/i);
    return fenceMatch ? String(fenceMatch[1] || '').trim() : text;
  }

  function formatShortDate(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function normalizeText(raw) {
    return String(raw || '').trim().toLowerCase();
  }

  function humanizeLegacyKey(raw, fallback = 'Legacy page') {
    const value = String(raw || '').trim().replace(/[_-]+/g, ' ');
    if (!value) return fallback;
    return value.replace(/\b[a-z]/g, (match) => match.toUpperCase());
  }

  function cloneJson(raw) {
    if (raw == null) return raw;
    try {
      return JSON.parse(JSON.stringify(raw));
    } catch {
      return raw;
    }
  }

  function randomSessionKey() {
    try {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    } catch {}
    return `qualification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function qualificationStorageKey(page = currentRenderedPage()) {
    const siteSlug = String(page?.siteSlug || '').trim().toLowerCase();
    const pageSlug = String(page?.pageSlug || 'home').trim().toLowerCase() || 'home';
    if (!siteSlug) return '';
    return `${QUALIFICATION_PROGRESS_KEY}:${siteSlug}:${pageSlug}`;
  }

  function readQualificationProgress(page = currentRenderedPage()) {
    const key = qualificationStorageKey(page);
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeQualificationProgress(payload = {}, page = currentRenderedPage()) {
    const key = qualificationStorageKey(page);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(payload || {}));
    } catch {
      // ignore storage failures
    }
  }

  function qualificationConfig(page = currentRenderedPage()) {
    const explicit = pageState.publicPagePayload?.page
      ? pageState.publicPagePayload?.qualification
      : null;
    if (explicit && typeof explicit === 'object') return explicit;
    const settings = page?.settings && typeof page.settings === 'object' ? page.settings : {};
    const qualification = settings.qualification && typeof settings.qualification === 'object' ? settings.qualification : {};
    const questions = Array.isArray(qualification.questions) && qualification.questions.length
      ? qualification.questions
      : DEFAULT_QUALIFICATION_QUESTIONS;
    return {
      enabled: qualification.enabled !== false,
      title: String(qualification.title || 'A few quick questions before you view this coach page').trim(),
      subtitle: String(qualification.subtitle || 'This helps the trainer qualify the right leads and tailor the follow-up.').trim(),
      ctaLabel: String(qualification.ctaLabel || 'Continue').trim() || 'Continue',
      completedLabel: String(qualification.completedLabel || 'Thanks. Opening the page...').trim(),
      questions
    };
  }

  function syncStandalonePublicChrome(active) {
    const shouldHide = Boolean(active);
    const selectors = ['.navbar', '#control-panel', '.control-panel'];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (shouldHide) {
          node.dataset.standaloneHidden = '1';
          node.hidden = true;
          node.setAttribute('aria-hidden', 'true');
          node.style.display = 'none';
          return;
        }
        if (node.dataset.standaloneHidden === '1') {
          node.hidden = false;
          node.removeAttribute('aria-hidden');
          node.style.display = '';
          delete node.dataset.standaloneHidden;
        }
      });
    });
  }

  function canBypassQualificationGate(page = currentRenderedPage()) {
    const trainer = typeof pageState !== 'undefined'
      ? (pageState.trainer || pageState.publicPagePayload?.trainer || null)
      : null;
    const editingEnabled = typeof editorState !== 'undefined' && editorState?.enabled;
    const view = typeof pageState !== 'undefined' ? pageState.view : '';
    const canEdit = typeof canEditTrainerPage === 'function' ? canEditTrainerPage(trainer, view) : false;
    return Boolean(editingEnabled || canEdit);
  }

  function hasAuthenticatedQualificationViewer() {
    return Boolean(window.__trainerProfileViewer?.id);
  }

  function isStandalonePublicCoachRoute() {
    return /^\/coach\/[^/]+(?:\/[^/]+)?$/i.test(String(window.location.pathname || '').trim());
  }

  function normalizeQuestionOptions(question) {
    return Array.isArray(question?.options)
      ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
      : [];
  }

  function initializeQualificationState(page = currentRenderedPage()) {
    const key = qualificationStorageKey(page);
    if (!key || qualificationState.initializedKey === key) return;
    qualificationState.initializedKey = key;
    const stored = readQualificationProgress(page) || {};
    qualificationState.sessionKey = String(stored.sessionKey || '').trim() || randomSessionKey();
    qualificationState.sessionId = String(stored.sessionId || '').trim();
    qualificationState.leadId = String(stored.leadId || '').trim();
    qualificationState.currentStep = Math.max(0, Math.floor(Number(stored.currentStep || 0) || 0));
    qualificationState.answers = stored.answers && typeof stored.answers === 'object' ? stored.answers : {};
    qualificationState.completed = stored.completed === true;
    qualificationState.dismissedUntil = Math.max(0, Number(stored.dismissedUntil || 0) || 0);
    const pauseActive = hasAuthenticatedQualificationViewer() && qualificationState.dismissedUntil > Date.now();
    qualificationState.revealed = qualificationState.completed || canBypassQualificationGate(page) || pauseActive;
    qualificationState.saving = false;
    qualificationState.error = '';
  }

  function persistQualificationState(page = currentRenderedPage()) {
    writeQualificationProgress({
      sessionKey: qualificationState.sessionKey,
      sessionId: qualificationState.sessionId,
      leadId: qualificationState.leadId,
      currentStep: qualificationState.currentStep,
      answers: qualificationState.answers,
      completed: qualificationState.completed,
      dismissedUntil: qualificationState.dismissedUntil,
      updatedAt: new Date().toISOString()
    }, page);
  }

  function dismissQualificationGate() {
    qualificationState.error = '';
    qualificationState.revealed = true;
    if (hasAuthenticatedQualificationViewer()) {
      qualificationState.dismissedUntil = Date.now() + QUALIFICATION_DISMISS_MS;
      persistQualificationState();
    }
    renderCurrentProfile();
  }

  function storeQualificationDraftAnswer(question, value) {
    if (!question?.id) return;
    setQuestionValue(question.id, value);
    qualificationState.error = '';
    persistQualificationState();
  }

  function questionValue(questionId) {
    return qualificationState.answers?.[questionId];
  }

  function setQuestionValue(questionId, value) {
    qualificationState.answers = {
      ...(qualificationState.answers || {}),
      [questionId]: value
    };
  }

  function clearBuilderAutosave() {
    if (!editorState.autosaveTimer) return;
    window.clearTimeout(editorState.autosaveTimer);
    editorState.autosaveTimer = 0;
  }

  function isBuilderPageEmpty(page) {
    const draft = page?.draftContent && typeof page.draftContent === 'object' ? page.draftContent : {};
    const customCode = draft.customCode && typeof draft.customCode === 'object' ? draft.customCode : {};
    return !String(customCode.html || customCode.css || customCode.javascript || '').trim()
      && !(Array.isArray(customCode.iframes) && customCode.iframes.length)
      && !(Array.isArray(customCode.embedScripts) && customCode.embedScripts.length);
  }

  function normalizeBuilderPageShape(raw, fallback = {}) {
    const page = raw && typeof raw === 'object' ? cloneJson(raw) : {};
    const incomingMode = String(page.legacyMode || page.mode || fallback.legacyMode || fallback.mode || '').trim().toLowerCase();
    page.id = String(page.id || fallback.id || '').trim() || '';
    page.siteSlug = sanitizeHandle(page.siteSlug || fallback.siteSlug || page.publicHandle || page.username || '');
    page.pageSlug = slugify(page.pageSlug || fallback.pageSlug || '');
    page.pageName = String(page.pageName || fallback.pageName || 'Home').trim() || 'Home';
    page.navLabel = String(page.navLabel || fallback.navLabel || page.pageName || 'Home').trim() || 'Home';
    page.navOrder = Number.isFinite(Number(page.navOrder ?? fallback.navOrder)) ? Math.max(0, Math.floor(Number(page.navOrder ?? fallback.navOrder))) : 0;
    page.mode = 'custom_code';
    page.legacyMode = incomingMode || '';
    page.isHome = page.isHome === true || (!page.pageSlug && fallback.isHome !== false);
    page.isPublished = page.isPublished === true;
    page.draftContent = page.draftContent && typeof page.draftContent === 'object' ? page.draftContent : {};
    page.draftContent.mode = 'custom_code';
    page.draftContent.customCode = page.draftContent.customCode && typeof page.draftContent.customCode === 'object'
      ? page.draftContent.customCode
      : { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
    page.publishedContent = page.publishedContent && typeof page.publishedContent === 'object' ? page.publishedContent : {};
    page.publishedContent.customCode = page.publishedContent.customCode && typeof page.publishedContent.customCode === 'object'
      ? page.publishedContent.customCode
      : { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
    page.publicPath = String(page.publicPath || '').trim();
    return page;
  }

  function buildBuilderSavePayload(raw) {
    const page = normalizeBuilderPageShape(raw, {
      siteSlug: sanitizeHandle(pageState.trainer?.publicHandle || pageState.trainer?.username || '')
    });
    return {
      id: String(page.id || '').trim(),
      siteSlug: String(page.siteSlug || '').trim(),
      pageSlug: String(page.pageSlug || '').trim(),
      pageName: String(page.pageName || '').trim() || 'Home',
      navLabel: String(page.navLabel || '').trim() || String(page.pageName || '').trim() || 'Home',
      navOrder: Number.isFinite(Number(page.navOrder)) ? Number(page.navOrder) : 0,
      mode: 'custom_code',
      isHome: page.isHome === true,
      isPublished: page.isPublished === true,
      seo: page.seo && typeof page.seo === 'object' ? cloneJson(page.seo) : {},
      settings: page.settings && typeof page.settings === 'object' ? cloneJson(page.settings) : {},
      draftContent: {
        mode: 'custom_code',
        customCode: cloneJson(page.draftContent?.customCode || { html: '', css: '', javascript: '', iframes: [], embedScripts: [] })
      }
    };
  }

  function findOwnedStandaloneRoutePage() {
    const routeMatch = String(window.location.pathname || '').match(/^\/coach\/([^/]+)(?:\/([^/]+))?$/i);
    const routeSiteSlug = sanitizeHandle(routeMatch?.[1] || '');
    const routePageSlug = slugify(routeMatch?.[2] || '');
    const pages = Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [];
    if (!pages.length) return null;
    return pages.find((page) => (
      sanitizeHandle(page?.siteSlug || '') === routeSiteSlug
      && String(slugify(page?.pageSlug || '') || '') === String(routePageSlug || '')
    )) || pages.find((page) => (
      sanitizeHandle(page?.siteSlug || '') === routeSiteSlug
      && routePageSlug === ''
      && page?.isHome === true
    )) || null;
  }

  function createBlankTrainerPage(trainer, overrides = {}) {
    const viewer = window.__trainerProfileViewer || null;
    const handle = sanitizeHandle(trainer?.publicHandle || trainer?.username || trainer?.displayName || '')
      || sanitizeHandle(viewer?.publicHandle || viewer?.username || '')
      || 'coach';
    return normalizeBuilderPageShape({
      id: '',
      siteSlug: handle,
      pageSlug: '',
      pageName: 'Home',
      navLabel: 'Home',
      mode: 'custom_code',
      isHome: true,
      isPublished: false,
      draftContent: {
        mode: 'custom_code',
        customCode: { html: '', css: '', javascript: '', iframes: [], embedScripts: [] }
      },
      ...cloneJson(overrides || {})
    });
  }

  function buildStarterCustomCode(trainer, page = {}) {
    const fullName = String(trainer?.fullName || trainer?.displayName || 'Coach').trim() || 'Coach';
    const pageName = String(page?.pageName || 'Custom page').trim() || 'Custom page';
    const locationBits = [
      String(trainer?.city || '').trim(),
      String(trainer?.state || '').trim()
    ].filter(Boolean);
    const locationLabel = locationBits.join(', ') || 'Remote coaching available';
    const specialtyLine = String(trainer?.brandPositioning || trainer?.tagline || '').trim()
      || 'Strength, physique, nutrition, and accountability for real schedules.';
    const priceLine = String(trainer?.offer?.price || trainer?.pricingHeadline || '').trim() || 'Programs from $249/month';
    const consultLine = String(trainer?.bookingUrgency || '').trim() || 'Apply now and get a same-week consult if spots are open.';
    const placeholderPhoto = '/assets/images/placeholders/profile-placeholder.jpg';
    return {
      html: `<section class="coach-custom-hero"><div class="coach-custom-shell coach-custom-hero-grid"><div class="coach-custom-hero-copy"><div class="coach-custom-eyebrow">${fullName}</div><h1>${pageName}</h1><p class="coach-custom-sub">${specialtyLine}</p><div class="coach-custom-actions"><a class="coach-custom-cta" href="#trainer-public-lead-section">Apply for coaching</a><a class="coach-custom-secondary" href="#coach-custom-pricing">See coaching options</a></div><div class="coach-custom-meta"><span>${locationLabel}</span><span>${priceLine}</span><span>${consultLine}</span></div></div><aside class="coach-custom-hero-card"><div class="coach-custom-hero-card-top"><img src="${placeholderPhoto}" alt="${fullName} profile placeholder"><div><strong>${fullName}</strong><span>${locationLabel}</span></div></div><div class="coach-custom-score-grid"><div><strong>1:1</strong><span>High-touch coaching</span></div><div><strong>48 hrs</strong><span>Typical reply window</span></div><div><strong>Weekly</strong><span>Program adjustments</span></div><div><strong>Video</strong><span>Form review support</span></div></div></aside></div></section><section class="coach-custom-strip"><div class="coach-custom-shell coach-custom-stat-row"><div><strong>Built to convert</strong><span>Offer, proof, pricing, FAQ, and booking all in one flow.</span></div><div><strong>Use media</strong><span>Replace placeholders with photos, videos, embeds, and testimonials.</span></div><div><strong>Use the gate</strong><span>Qualification happens before visitors unlock the full page.</span></div></div></section><section class="coach-custom-story"><div class="coach-custom-shell coach-custom-story-grid"><article><div class="coach-custom-label">About</div><h2>Position the coach with a real website rhythm</h2><p>Start with a sharp promise, follow with proof, then guide the visitor into pricing, objections, and the next step. The public page should feel like a landing page, not a settings preview.</p><ul class="coach-custom-checks"><li>Clear niche and client fit</li><li>Simple transformation process</li><li>Direct path to booking or application</li></ul></article><article class="coach-custom-video-card"><div class="coach-custom-label">Video</div><div class="coach-custom-video-placeholder"><span>Drop a video embed here</span></div><p>Paste a hosted iframe or script embed into the code workspace to replace this block.</p></article></div></section><section class="coach-custom-offers" id="coach-custom-pricing"><div class="coach-custom-shell"><div class="coach-custom-section-head"><div class="coach-custom-label">Offers</div><h2>Packages visitors can understand quickly</h2><p>Show a few buying paths with clear inclusions, ideal client fit, and a CTA that moves people forward.</p></div><div class="coach-custom-price-grid"><article><div class="coach-custom-plan-tag">Starter</div><h3>Momentum</h3><div class="coach-custom-plan-price">$249<span>/month</span></div><p>Programming, check-ins, habit targets, and messaging support for clients who need consistency first.</p><ul><li>Custom training plan</li><li>Weekly check-in</li><li>Message support</li></ul><a href="#trainer-public-lead-section">Apply for Momentum</a></article><article class="featured"><div class="coach-custom-plan-tag">Most popular</div><h3>Performance</h3><div class="coach-custom-plan-price">$399<span>/month</span></div><p>Stronger accountability, deeper feedback, and quicker iteration for clients who want faster traction.</p><ul><li>Programming + nutrition direction</li><li>Video form review</li><li>Priority messaging</li></ul><a href="#trainer-public-lead-section">Apply for Performance</a></article><article><div class="coach-custom-plan-tag">Premium</div><h3>Concierge</h3><div class="coach-custom-plan-price">$649<span>/month</span></div><p>For high-touch clients who want the closest feedback loop and the fastest plan adjustments.</p><ul><li>Everything in Performance</li><li>Two live touchpoints monthly</li><li>Travel and schedule adaptation</li></ul><a href="#trainer-public-lead-section">Apply for Concierge</a></article></div></div></section><section class="coach-custom-proof"><div class="coach-custom-shell"><div class="coach-custom-section-head"><div class="coach-custom-label">Proof</div><h2>Testimonials and result framing</h2><p>Replace these cards with real photos, quote blocks, or before/after assets from your client library.</p></div><div class="coach-custom-proof-grid"><article><p>“I stopped guessing. The plan finally fit my schedule, and the weekly check-ins kept me from falling off.”</p><strong>Busy parent, 14-week block</strong></article><article><p>“Training felt structured for the first time. I knew what to do in the gym and what mattered each week.”</p><strong>Hybrid remote client</strong></article><article><p>“The page answered everything I needed before I booked. It made the decision easy.”</p><strong>Qualified lead turned client</strong></article></div></div></section><section class="coach-custom-faq"><div class="coach-custom-shell coach-custom-faq-grid"><article><div class="coach-custom-label">FAQ</div><h2>Handle objections before the DM</h2><p>Add your most common questions about location, coaching style, pricing, injuries, nutrition, and time commitment.</p></article><div class="coach-custom-faq-list"><details open><summary>Do you coach remotely?</summary><p>Yes. Outline how check-ins, communication, and program delivery work online.</p></details><details><summary>How quickly can I start?</summary><p>Set expectations for application review, consult timing, and onboarding.</p></details><details><summary>Do I need a full gym?</summary><p>Clarify equipment requirements and how you adjust programs for home, hybrid, or commercial gym setups.</p></details></div></div></section><section class="coach-custom-booking"><div class="coach-custom-shell coach-custom-booking-grid"><article><div class="coach-custom-label">Booking</div><h2>Strong final CTA section</h2><p>Use this area for a booking embed, application form, FAQ close, or urgency block. The existing qualification gate ensures leads are captured before they reach this point.</p></article><article class="coach-custom-booking-card"><strong>Best next step</strong><p>Keep one primary CTA and one fallback action. If you offer consults, say who should apply before booking.</p><a href="#trainer-public-lead-section">Start application</a></article></div></section><section class="coach-custom-footer"><div class="coach-custom-shell coach-custom-footer-row"><div><div class="coach-custom-label">Footer</div><strong>${fullName}</strong><p>${specialtyLine}</p></div><div class="coach-custom-footer-links"><a href="#coach-custom-pricing">Pricing</a><a href="#trainer-public-lead-section">Apply</a></div></div></section>`,
      css: '.coach-custom-shell{width:min(1180px,calc(100% - 40px));margin:0 auto}.coach-custom-hero{padding:88px 0 48px;background:radial-gradient(circle at 12% 18%,rgba(255,201,117,.28),transparent 24%),radial-gradient(circle at 84% 16%,rgba(93,180,255,.22),transparent 28%),linear-gradient(135deg,#0b1724,#11293d 48%,#1c4a6b);color:#f8fafc}.coach-custom-hero-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.72fr);gap:28px;align-items:end}.coach-custom-hero-copy{display:grid;gap:0}.coach-custom-eyebrow,.coach-custom-label,.coach-custom-plan-tag{letter-spacing:.18em;text-transform:uppercase;font-size:.72rem;font-weight:800;opacity:.78}.coach-custom-hero h1{margin:12px 0 16px;font-size:clamp(3.4rem,7.2vw,6.7rem);line-height:.88;letter-spacing:-.09em;max-width:8ch}.coach-custom-sub{margin:0;max-width:54ch;font-size:1.05rem;line-height:1.82;color:rgba(248,250,252,.84)}.coach-custom-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.coach-custom-cta,.coach-custom-secondary,.coach-custom-price-grid a,.coach-custom-booking-card a{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 20px;border-radius:999px;text-decoration:none;font-weight:800}.coach-custom-cta,.coach-custom-price-grid a,.coach-custom-booking-card a{background:#fff;color:#0d2232}.coach-custom-secondary{border:1px solid rgba(248,250,252,.22);color:#f8fafc;background:rgba(255,255,255,.06)}.coach-custom-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.coach-custom-meta span{display:inline-flex;padding:9px 13px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);font-size:.78rem;font-weight:700;color:rgba(248,250,252,.92)}.coach-custom-hero-card{display:grid;gap:20px;padding:24px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);backdrop-filter:blur(16px);box-shadow:0 22px 60px rgba(9,18,28,.26)}.coach-custom-hero-card-top{display:flex;align-items:center;gap:14px}.coach-custom-hero-card-top img{width:70px;height:70px;border-radius:18px;object-fit:cover;background:rgba(255,255,255,.18)}.coach-custom-hero-card-top strong{display:block;font-size:1.05rem}.coach-custom-hero-card-top span{display:block;margin-top:5px;color:rgba(248,250,252,.72);font-size:.86rem}.coach-custom-score-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.coach-custom-score-grid div{padding:14px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}.coach-custom-score-grid strong{display:block;font-size:1.15rem}.coach-custom-score-grid span{display:block;margin-top:4px;color:rgba(248,250,252,.7);font-size:.82rem;line-height:1.5}.coach-custom-strip{padding:18px 0;background:#efe7da;color:#10283c;border-bottom:1px solid rgba(16,40,60,.08)}.coach-custom-stat-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.coach-custom-stat-row div{display:grid;gap:6px;padding:18px 20px;background:rgba(255,255,255,.72)}.coach-custom-stat-row strong{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase}.coach-custom-stat-row span{line-height:1.68;color:rgba(16,40,60,.76)}.coach-custom-story,.coach-custom-proof,.coach-custom-faq,.coach-custom-booking,.coach-custom-footer{background:#fbf7f0;color:#10283c}.coach-custom-story{padding:56px 0 18px}.coach-custom-story-grid,.coach-custom-faq-grid,.coach-custom-booking-grid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:24px;align-items:start}.coach-custom-story h2,.coach-custom-section-head h2,.coach-custom-faq h2,.coach-custom-booking h2{margin:10px 0 14px;font-size:clamp(2rem,4vw,3.5rem);line-height:.94;letter-spacing:-.07em}.coach-custom-story p,.coach-custom-section-head p,.coach-custom-faq p,.coach-custom-booking p,.coach-custom-proof p,.coach-custom-footer p{margin:0;font-size:1rem;line-height:1.8;color:rgba(16,40,60,.74)}.coach-custom-checks{display:grid;gap:10px;padding:0;margin:24px 0 0;list-style:none}.coach-custom-checks li{padding-left:28px;position:relative;font-weight:700}.coach-custom-checks li::before{content:\"\";position:absolute;left:0;top:.6em;width:12px;height:12px;border-radius:999px;background:#d4a75c;box-shadow:0 0 0 6px rgba(212,167,92,.18)}.coach-custom-video-card{padding:26px;background:#fff;box-shadow:0 20px 44px rgba(15,23,42,.08)}.coach-custom-video-placeholder{min-height:280px;display:grid;place-items:center;margin:12px 0 16px;background:linear-gradient(135deg,#10283c,#1f547d);color:#f8fafc}.coach-custom-video-placeholder span{padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.1);font-size:.82rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.coach-custom-offers{padding:32px 0}.coach-custom-section-head{display:grid;gap:12px;max-width:60rem}.coach-custom-price-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:26px}.coach-custom-price-grid article{display:grid;gap:14px;padding:28px;background:#fff;box-shadow:0 20px 44px rgba(15,23,42,.08)}.coach-custom-price-grid article.featured{background:linear-gradient(180deg,#10283c,#173b5a);color:#f8fafc;transform:translateY(-10px)}.coach-custom-price-grid article.featured p,.coach-custom-price-grid article.featured li,.coach-custom-price-grid article.featured .coach-custom-plan-price span,.coach-custom-price-grid article.featured .coach-custom-plan-tag{color:rgba(248,250,252,.82)}.coach-custom-price-grid article.featured a{background:#ffd283;color:#10283c}.coach-custom-price-grid h3{margin:0;font-size:1.45rem;letter-spacing:-.04em}.coach-custom-plan-price{font-size:2.3rem;font-weight:900;letter-spacing:-.05em}.coach-custom-plan-price span{font-size:1rem;color:rgba(16,40,60,.68)}.coach-custom-price-grid ul{display:grid;gap:8px;margin:0;padding-left:18px;color:rgba(16,40,60,.78);line-height:1.65}.coach-custom-proof{padding:18px 0 24px}.coach-custom-proof-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:26px}.coach-custom-proof-grid article{display:grid;gap:18px;padding:26px;background:#fff;box-shadow:0 18px 40px rgba(15,23,42,.07)}.coach-custom-proof-grid article p{font-size:1.02rem;color:#10283c}.coach-custom-proof-grid strong{font-size:.82rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(16,40,60,.56)}.coach-custom-faq{padding:30px 0}.coach-custom-faq-list{display:grid;gap:12px}.coach-custom-faq-list details{padding:18px 20px;background:#fff;box-shadow:0 18px 40px rgba(15,23,42,.06)}.coach-custom-faq-list summary{cursor:pointer;font-weight:800;list-style:none}.coach-custom-faq-list summary::-webkit-details-marker{display:none}.coach-custom-faq-list p{margin-top:12px}.coach-custom-booking{padding:18px 0 50px}.coach-custom-booking-card{display:grid;gap:14px;padding:28px;background:linear-gradient(180deg,#11293d,#1b4768);color:#f8fafc;box-shadow:0 24px 56px rgba(15,23,42,.14)}.coach-custom-booking-card strong{font-size:.82rem;letter-spacing:.14em;text-transform:uppercase}.coach-custom-booking-card p{color:rgba(248,250,252,.78)}.coach-custom-booking-card a{width:fit-content}.coach-custom-footer{padding:24px 0 50px;border-top:1px solid rgba(16,40,60,.08)}.coach-custom-footer-row{display:flex;align-items:center;justify-content:space-between;gap:18px}.coach-custom-footer strong{display:block;margin:10px 0 8px;font-size:1.1rem}.coach-custom-footer-links{display:flex;gap:16px;flex-wrap:wrap}.coach-custom-footer-links a{color:#10283c;text-decoration:none;font-weight:800}@media (max-width:980px){.coach-custom-hero-grid,.coach-custom-stat-row,.coach-custom-story-grid,.coach-custom-faq-grid,.coach-custom-booking-grid,.coach-custom-proof-grid,.coach-custom-price-grid,.coach-custom-footer-row{grid-template-columns:1fr;display:grid}.coach-custom-price-grid article.featured{transform:none}}@media (max-width:760px){.coach-custom-shell{width:min(100% - 28px,1180px)}.coach-custom-hero{padding:56px 0 34px}.coach-custom-hero h1{font-size:clamp(2.6rem,12vw,4.2rem)}.coach-custom-actions{flex-direction:column;align-items:stretch}.coach-custom-cta,.coach-custom-secondary,.coach-custom-price-grid a,.coach-custom-booking-card a{width:100%}.coach-custom-score-grid{grid-template-columns:1fr 1fr}}',
      javascript: 'document.querySelectorAll(".coach-custom-cta").forEach((node) => node.addEventListener("click", () => console.info("coach_custom_cta_clicked")));',
      iframes: [],
      embedScripts: []
    };
  }

  function buildLegacyFallbackCustomCode(page, { publicView = false } = {}) {
    const content = activeBuilderDraftContent(page, { publicView });
    const existing = content?.customCode && typeof content.customCode === 'object' ? content.customCode : null;
    if (existing && (
      String(existing.html || '').trim()
      || String(existing.css || '').trim()
      || String(existing.javascript || '').trim()
      || (Array.isArray(existing.iframes) && existing.iframes.length)
      || (Array.isArray(existing.embedScripts) && existing.embedScripts.length)
    )) {
      return existing;
    }
    const coachName = String(pageState?.trainer?.fullName || pageState?.trainer?.displayName || 'Coach').trim() || 'Coach';
    const pageName = String(page?.pageName || 'Coach page').trim() || 'Coach page';
    return {
      html: `<section class="legacy-site"><div class="legacy-shell"><p class="legacy-kicker">${escapeHtml(coachName)}</p><h1>${escapeHtml(pageName)}</h1><p class="legacy-body">This page was preserved in the custom code editor. Add HTML, CSS, JavaScript, embeds, and media directly here.</p></div></section>`,
      css: '.legacy-site{padding:48px 24px}.legacy-shell{max-width:1100px;margin:0 auto}.legacy-kicker{margin:0 0 12px;font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;opacity:.62}.legacy-site h1{margin:0;color:#10283c;font-size:clamp(2.5rem,5vw,4.5rem);line-height:.94;letter-spacing:-.07em}.legacy-body{margin:18px 0 0;max-width:56ch;color:rgba(16,36,52,.76);line-height:1.8}',
      javascript: '',
      iframes: [],
      embedScripts: []
    };
  }

  function currentRenderedPage() {
    if (pageState.currentTrainerPage) return pageState.currentTrainerPage;
    return pageState.publicPagePayload?.page || null;
  }

  function normalizeEditableCustomCode(raw) {
    const code = raw && typeof raw === 'object' ? raw : {};
    return {
      html: normalizeStandaloneSyncedCode(unwrapMarkdownCodeFence(code.html || '')),
      css: String(code.css || '').trim(),
      javascript: String(code.javascript || '').trim(),
      iframes: Array.isArray(code.iframes) ? code.iframes.slice() : [],
      embedScripts: Array.isArray(code.embedScripts) ? code.embedScripts.slice() : []
    };
  }

  function isEditableCustomCodeEmpty(raw) {
    const code = normalizeEditableCustomCode(raw);
    return !code.html
      && !code.css
      && !code.javascript
      && !code.iframes.length
      && !code.embedScripts.length;
  }

  function isPlaceholderCustomCode(raw) {
    const code = normalizeEditableCustomCode(raw);
    const html = String(code.html || '').trim();
    if (!html) return false;
    return html.includes('class="legacy-site')
      || html.includes("class='legacy-site")
      || html.includes('coach-custom-hero')
      || html.includes('Custom coaching website')
      || html.includes('I help young men get fit and lose weight without breaking the bank');
  }

  function resolveEditableCustomCode(page, { publicView = false } = {}) {
    const content = activeBuilderDraftContent(page, { publicView });
    const directCode = normalizeEditableCustomCode(content?.customCode);
    if (!isEditableCustomCodeEmpty(directCode) && !isPlaceholderCustomCode(directCode)) {
      return publicView
        ? {
            ...directCode,
            html: sanitizeStandaloneEditorMarkup(directCode.html || '')
          }
        : directCode;
    }
    return { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
  }

  function hydrateBuilderDraftCustomCode(page) {
    const next = normalizeBuilderPageShape(page);
    const resolvedCode = resolveEditableCustomCode(next, { publicView: false });
    if (!isEditableCustomCodeEmpty(resolvedCode)) {
      next.draftContent.customCode = resolvedCode;
    }
    return next;
  }

  function syncBuilderPageCustomCodeState(content, { mirrorPublished = false } = {}) {
    const nextContent = content && typeof content === 'object' ? cloneJson(content) : null;
    if (!nextContent) return;
    const currentId = String(pageState.currentTrainerPage?.id || editorState.original?.id || editorState.draft?.id || '').trim();
    if (pageState.currentTrainerPage) {
      pageState.currentTrainerPage.draftContent = cloneJson(nextContent);
      if (mirrorPublished) pageState.currentTrainerPage.publishedContent = cloneJson(nextContent);
    }
    if (editorState.original) {
      editorState.original.draftContent = cloneJson(nextContent);
      if (mirrorPublished) editorState.original.publishedContent = cloneJson(nextContent);
    }
    if (editorState.draft) {
      editorState.draft.draftContent = cloneJson(nextContent);
      if (mirrorPublished) editorState.draft.publishedContent = cloneJson(nextContent);
    }
    if (pageState.publicPagePayload?.page) {
      pageState.publicPagePayload.page.draftContent = cloneJson(nextContent);
      if (mirrorPublished) pageState.publicPagePayload.page.publishedContent = cloneJson(nextContent);
    }
    if (currentId && Array.isArray(pageState.trainerPages)) {
      pageState.trainerPages = pageState.trainerPages.map((pageItem) => {
        if (String(pageItem?.id || '').trim() !== currentId) return pageItem;
        const nextPage = normalizeBuilderPageShape(pageItem);
        nextPage.draftContent = cloneJson(nextContent);
        if (mirrorPublished) nextPage.publishedContent = cloneJson(nextContent);
        return nextPage;
      });
    }
  }

  function builderContentHasRenderableData(content) {
    if (!content || typeof content !== 'object') return false;
    const customCode = content.customCode && typeof content.customCode === 'object' ? content.customCode : {};
    if (String(customCode.html || customCode.css || customCode.javascript || '').trim()) return true;
    if (Array.isArray(customCode.iframes) && customCode.iframes.length) return true;
    if (Array.isArray(customCode.embedScripts) && customCode.embedScripts.length) return true;
    return false;
  }

  function activeBuilderDraftContent(page, { publicView = false } = {}) {
    const draftContent = page?.draftContent && typeof page.draftContent === 'object' ? page.draftContent : {};
    const publishedContent = page?.publishedContent && typeof page.publishedContent === 'object' ? page.publishedContent : {};
    const src = publicView
      ? publishedContent
      : (builderContentHasRenderableData(draftContent) ? draftContent : publishedContent);
    return src;
  }

  function readDemoTrainerOverride() {
    try {
      LEGACY_DEMO_TRAINER_STORAGE_KEYS.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });
      const raw = localStorage.getItem(DEMO_TRAINER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeDemoTrainerOverride(trainer) {
    try {
      localStorage.setItem(DEMO_TRAINER_STORAGE_KEY, JSON.stringify(trainer || {}));
    } catch {
      // ignore storage failures
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
  }

  async function prepareTrainerPhotoDataUrl(file) {
    if (!file) return '';
    if (window.odeAvatarCropper?.cropToSquare) {
      const cropped = await window.odeAvatarCropper.cropToSquare(file, { size: 320, quality: 0.78 }).catch(() => null);
      return String(cropped || '');
    }
    return await readFileAsDataUrl(file).catch(() => '');
  }

  function setUploadPreview(previewEl, value, emptyLabel = 'Add image') {
    if (!previewEl) return;
    const src = String(value || '').trim();
    previewEl.innerHTML = '';
    if (!src) {
      previewEl.innerHTML = `<span>${escapeHtml(emptyLabel)}</span>`;
      return;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    previewEl.appendChild(img);
  }

  function uniqueList(values, max = 12) {
    const items = [];
    (Array.isArray(values) ? values : [values]).forEach((value) => {
      String(value || '')
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => {
          if (!items.some((entry) => normalizeText(entry) === normalizeText(item))) {
            items.push(item);
          }
        });
    });
    return items.slice(0, max);
  }

  function listToText(values) {
    return (Array.isArray(values) ? values : []).filter(Boolean).join('\n');
  }

  function sanitizeHandle(raw) {
    return String(raw || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/[^a-z0-9_.-]/gi, '')
      .toLowerCase();
  }

  function slugify(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function labelFromHandle(raw) {
    const text = String(raw || '').trim().replace(/[_-]+/g, ' ');
    if (!text) return 'Coach';
    return text
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function trainerLocationParts(trainer) {
    return {
      city: String(trainer?.city || trainer?.location?.city || '').trim(),
      state: String(trainer?.state || trainer?.location?.state || trainer?.stateCode || trainer?.location?.stateCode || '').trim(),
      zipCode: String(trainer?.zipCode || trainer?.location?.zipCode || '').trim()
    };
  }

  function buildLocationText(trainer) {
    const { city, state, zipCode } = trainerLocationParts(trainer);
    const cityState = [city, state].filter(Boolean).join(', ');
    return cityState || zipCode || 'Location shared after the first call';
  }

  function buildModeText(trainer) {
    const modes = [];
    if (trainer?.offer?.onlineCoaching) modes.push('Remote coaching');
    if (trainer?.offer?.inPersonTraining) modes.push('In-person sessions');
    return modes.join(' + ') || 'Remote coaching';
  }

  function buildSocialHref(type, handle) {
    const clean = String(handle || '').trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;
    const normalized = clean.replace(/^@+/, '');
    if (type === 'website') return /^https?:\/\//i.test(clean) ? clean : '';
    if (type === 'youtube') {
      if (/^https?:\/\//i.test(clean)) return clean;
      return `https://youtube.com/${encodeURIComponent(normalized)}`;
    }
    if (type === 'instagram') return `https://instagram.com/${encodeURIComponent(normalized)}`;
    if (type === 'tiktok') return `https://www.tiktok.com/@${encodeURIComponent(normalized)}`;
    if (type === 'linkedin') {
      return `https://www.linkedin.com/in/${encodeURIComponent(normalized)}`;
    }
    return '';
  }

  function formatMoney(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return '';
    return `$${Math.round(value)}`;
  }

  function resolveYearsLabel(trainer) {
    const explicit = Number(
      trainer?.yearsExperience
      || trainer?.yearsCoaching
      || trainer?.experienceYears
      || 0
    );
    if (Number.isFinite(explicit) && explicit > 0) return `${Math.round(explicit)} years coaching`;
    const level = normalizeText(trainer?.experienceLevel);
    if (level.includes('advanced')) return '7+ years coaching';
    if (level.includes('intermediate')) return '4+ years coaching';
    return '3+ years coaching';
  }

  function resolvePriceRangeLabel(trainer) {
    const preset = String(trainer?.priceRangeLabel || trainer?.offer?.priceRangeLabel || '').trim();
    if (preset) return preset;
    const min = Number(
      trainer?.priceRangeMin
      ?? trainer?.offer?.priceRangeMin
      ?? trainer?.offer?.monthlyCoachingPrice
    );
    const max = Number(trainer?.priceRangeMax ?? trainer?.offer?.priceRangeMax);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
      return `${formatMoney(min)}-${formatMoney(max)}/month`;
    }
    if (Number.isFinite(min) && min > 0) {
      return `From ${formatMoney(min)}/month`;
    }
    return 'Custom pricing';
  }

  function resolveBio(trainer) {
    const bio = String(trainer?.bio || trainer?.trainerBio || '').trim();
    if (bio) return bio;
    const summary = String(trainer?.brandPositioning || '').trim();
    const differentiator = String(trainer?.differentiator || '').trim();
    if (summary && differentiator) return `${summary} ${differentiator}`;
    return summary || differentiator || 'Trainer bio coming soon.';
  }

  function resolveContactEmail(trainer) {
    return String(trainer?.email || trainer?.contactEmail || '').trim();
  }

  function resolveCoachingFormatValue(trainer) {
    const explicit = String(trainer?.coachingFormat || '').trim();
    if (explicit) return explicit;
    const online = trainer?.offer?.onlineCoaching !== false;
    const inPerson = Boolean(trainer?.offer?.inPersonTraining);
    if (online && inPerson) return 'remote_and_in_person';
    if (inPerson && !online) return 'in_person_only';
    return 'remote_only';
  }

  function applyCoachingFormatValue(trainer, value) {
    const next = String(value || '').trim() || 'remote_only';
    trainer.coachingFormat = next;
    trainer.offer = trainer.offer || {};
    trainer.offer.onlineCoaching = next !== 'in_person_only';
    trainer.offer.inPersonTraining = next !== 'remote_only';
  }

  function isResultsGalleryView(view = pageState.view) {
    return String(view || '').trim().toLowerCase() === 'results' && !pageState.publicPagePayload?.page;
  }

  function canEditTrainerPage(trainer, view = '') {
    if (isResultsGalleryView(view)) return false;
    const viewer = window.__trainerProfileViewer || null;
    if (!viewer?.id) return false;
    if (viewer?.isOwner === true || viewer?.isTech === true) return true;
    if (trainer?.id && String(viewer.id) === String(trainer.id)) return true;
    if (trainer?.isDemoLayout && (viewer?.isOwner || viewer?.isTech || viewer?.trainer?.active)) return true;
    const viewerHandle = sanitizeHandle(viewer?.publicHandle || viewer?.username || '');
    const trainerHandle = sanitizeHandle(trainer?.publicHandle || trainer?.username || '');
    if (viewerHandle && trainerHandle && viewerHandle === trainerHandle) return true;
    const routeMatch = String(window.location.pathname || '').match(/^\/coach\/([^/]+)(?:\/([^/]+))?$/i);
    const routeHandle = sanitizeHandle(routeMatch?.[1] || '');
    return Boolean((trainer?.id && String(viewer.id) === String(trainer.id)) || (viewerHandle && routeHandle && viewerHandle === routeHandle));
  }

  function trimToWordLimit(raw, maxWords) {
    const text = String(raw || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
    const limit = Number(maxWords || 0);
    if (!limit || limit < 1 || !text) return text;
    const tokens = text.match(/\S+|\s+/g) || [];
    let words = 0;
    let out = '';
    for (const token of tokens) {
      if (/\S/.test(token)) {
        words += 1;
        if (words > limit) break;
      }
      out += token;
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function getEditablePlainText(el) {
    if (!el) return '';
    const raw = typeof el.innerText === 'string' && el.innerText
      ? el.innerText
      : String(el.textContent || '');
    return String(raw)
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function trimToCharacterLimit(raw, maxChars) {
    const text = String(raw || '');
    const limit = Number(maxChars || 0);
    if (!limit || limit < 1 || text.length <= limit) return text;
    return text.slice(0, limit).trimEnd();
  }

  function syncInlineEditablePlaceholderState(el) {
    if (!el) return;
    const text = String(el.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) {
      el.removeAttribute('data-empty');
    } else {
      el.setAttribute('data-empty', 'true');
    }
  }

  function buildTrainerSavePayload(trainer, viewer) {
    const specialtyClients = uniqueList(trainer?.specialtyClients || [], 12);
    const specialtyClientsCustom = uniqueList(trainer?.specialtyClientsCustom || [], 8);
    const includedItems = uniqueList(trainer?.includedItems || [], 16);
    const includedItemsCustom = uniqueList(trainer?.includedItemsCustom || [], 10);
    const results = (Array.isArray(trainer?.transformations) ? trainer.transformations : [])
      .map((item) => ({
        person: String(item?.person || '').trim(),
        result: String(item?.result || '').trim(),
        timeline: String(item?.timeline || '').trim(),
        copy: String(item?.copy || '').trim(),
        beforeImage: String(item?.beforeImage || '').trim(),
        afterImage: String(item?.afterImage || '').trim()
      }))
      .filter((item) => item.person || item.result || item.timeline || item.copy || item.beforeImage || item.afterImage);

    return {
      fullName: String(trainer?.fullName || trainer?.displayName || viewer?.displayName || viewer?.username || '').trim(),
      email: resolveContactEmail(trainer) || String(viewer?.email || '').trim(),
      displayName: String(trainer?.displayName || trainer?.fullName || viewer?.displayName || '').trim(),
      managerCode: String(trainer?.managerCode || trainer?.meta?.managerCode || viewer?.manager?.managerCode || '').trim(),
      workspaceId: String(trainer?.workspaceId || trainer?.meta?.workspaceId || viewer?.manager?.workspaceId || '').trim(),
      locationId: String(trainer?.locationId || trainer?.meta?.locationId || viewer?.manager?.locationId || '').trim(),
      publicHandle: sanitizeHandle(trainer?.publicHandle || trainer?.username || viewer?.username || ''),
      photoDataUrl: String(trainer?.photoDataUrl || '').trim(),
      coachBadgeType: uniqueList(trainer?.coachBadgeType || [], 2),
      coachCustomTags: uniqueList(trainer?.coachCustomTags || [], 6),
      brandPositioning: String(trainer?.brandPositioning || '').trim(),
      topSectionLabel: String(trainer?.topSectionLabel || '').trim(),
      heroHeadline: String(trainer?.heroHeadline || '').trim(),
      heroSubheadline: String(trainer?.heroSubheadline || '').trim(),
      city: String(trainer?.city || '').trim(),
      state: String(trainer?.state || '').trim(),
      coachingFormat: resolveCoachingFormatValue(trainer),
      priceRangeLabel: String(trainer?.priceRangeLabel || trainer?.offer?.priceRangeLabel || '').trim(),
      monthlyCoachingPrice: Number.isFinite(Number(trainer?.offer?.monthlyCoachingPrice))
        ? Number(trainer.offer.monthlyCoachingPrice)
        : '',
      startingPrice: Number.isFinite(Number(trainer?.offer?.monthlyCoachingPrice))
        ? Number(trainer.offer.monthlyCoachingPrice)
        : '',
      yearsCoaching: Number.isFinite(Number(trainer?.yearsCoaching)) ? Number(trainer.yearsCoaching) : '',
      activeClients: Number.isFinite(Number(trainer?.activeClients)) ? Number(trainer.activeClients) : '',
      bookingEnabled: trainer?.bookingEnabled !== false,
      consultationLength: Number.isFinite(Number(trainer?.consultationLengthMinutes)) ? Number(trainer.consultationLengthMinutes) : 45,
      dateRangeDays: Number.isFinite(Number(trainer?.dateRangeDays)) ? Number(trainer.dateRangeDays) : 14,
      maxConsultsPerDay: Number.isFinite(Number(trainer?.maxConsultsPerDay)) ? Number(trainer.maxConsultsPerDay) : 4,
      bufferMinutes: Number.isFinite(Number(trainer?.bufferMinutes)) ? Number(trainer.bufferMinutes) : 15,
      bookingNoticeHours: Number.isFinite(Number(trainer?.bookingNoticeHours)) ? Number(trainer.bookingNoticeHours) : 12,
      bookingApprovalMode: String(trainer?.bookingApprovalMode || '').trim() || 'manual',
      bookingCtaText: String(trainer?.bookingCtaText || 'Find out if this is a fit in 15 minutes.').trim(),
      bookingUrgency: String(trainer?.bookingUrgency || '').trim(),
      daysAvailable: Array.isArray(trainer?.availability?.daysAvailable) ? trainer.availability.daysAvailable : [],
      dayWindows: trainer?.availability?.dayWindows && typeof trainer.availability.dayWindows === 'object'
        ? trainer.availability.dayWindows
        : {},
      timeSlotsAvailable: Array.isArray(trainer?.availability?.timeSlotsAvailable) ? trainer.availability.timeSlotsAvailable : [],
      timeZone: String(trainer?.availability?.timeZone || '').trim(),
      results,
      specialtyClients,
      specialtyClientsCustom,
      clientTypes: String(trainer?.clientTypes || [...specialtyClients, ...specialtyClientsCustom].join(', ')).trim(),
      includedItems,
      includedItemsCustom,
      coachingIncludes: String(trainer?.offer?.included || [...includedItems, ...includedItemsCustom].join(', ')).trim(),
      coachBio: String(trainer?.bio || '').trim(),
      coachingPhilosophy: String(trainer?.coachingPhilosophy || trainer?.differentiator || '').trim(),
      differentiator: String(trainer?.differentiator || trainer?.coachingPhilosophy || '').trim(),
      idealClient: String(trainer?.idealClient || '').trim(),
      instagramUrl: String(trainer?.instagramUrl || '').trim(),
      tiktokUrl: String(trainer?.tiktokUrl || '').trim(),
      linkedinUrl: String(trainer?.linkedinUrl || '').trim(),
      youtubeUrl: String(trainer?.youtubeUrl || '').trim(),
      websiteUrl: String(trainer?.websiteUrl || '').trim(),
      accentColor: String(trainer?.accentColor || '').trim(),
      showPricePublic: trainer?.showPricePublic !== false,
      showClientsPublic: trainer?.showClientsPublic !== false,
      showYearsPublic: trainer?.showYearsPublic !== false,
      showBookingPublic: trainer?.showBookingPublic !== false,
      showResultsPublic: trainer?.showResultsPublic !== false
    };
  }

  function ensureHeadTag(selector, tagName, attrs = {}) {
    let node = document.querySelector(selector);
    if (!node) {
      node = document.createElement(tagName);
      Object.entries(attrs || {}).forEach(([key, value]) => {
        if (value != null) node.setAttribute(key, String(value));
      });
      document.head.appendChild(node);
    }
    return node;
  }

  function applyTrainerPageSeo({
    title = INITIAL_DOCUMENT_TITLE,
    description = INITIAL_META_DESCRIPTION,
    canonicalHref = INITIAL_CANONICAL_HREF,
    noIndex = false
  } = {}) {
    document.title = String(title || '').trim() || INITIAL_DOCUMENT_TITLE;
    const metaDescription = ensureHeadTag('meta[name="description"]', 'meta', { name: 'description' });
    metaDescription.setAttribute('content', String(description || '').trim());
    const canonical = ensureHeadTag('link[rel="canonical"]', 'link', { rel: 'canonical' });
    canonical.setAttribute('href', String(canonicalHref || window.location.href).trim() || window.location.href);
    const robots = ensureHeadTag('meta[name="robots"]', 'meta', { name: 'robots' });
    robots.setAttribute('content', noIndex ? 'noindex, nofollow' : 'index, follow');
  }

  async function loadTrainerPagesForViewer() {
    const viewer = window.__trainerProfileViewer || null;
    if (!viewer?.id || !canEditTrainerPage(pageState.trainer, pageState.view)) {
      pageState.trainerPages = [];
      return [];
    }
    const resp = await api('/api/auth/trainer/pages');
    if (!resp.ok || !resp.json?.ok || !Array.isArray(resp.json?.pages)) {
      pageState.trainerPages = [];
      return [];
    }
    pageState.trainerPages = resp.json.pages.map((page) => normalizeBuilderPageShape(page, {
      siteSlug: sanitizeHandle(pageState.trainer?.publicHandle || pageState.trainer?.username || '')
    }));
    return pageState.trainerPages;
  }

  async function loadPublicTrainerPage(siteSlug, pageSlug = '') {
    const params = new URLSearchParams();
    params.set('siteSlug', String(siteSlug || '').trim());
    if (pageSlug) params.set('pageSlug', String(pageSlug || '').trim());
    const resp = await api(`/api/coach/pages/public?${params.toString()}`);
    pageState.publicPageLoadState = {
      status: Number(resp?.status || 0) || 0,
      unavailable: !resp.ok && (Number(resp?.status || 0) === 0 || Number(resp?.status || 0) >= 500 || String(resp?.json?.error || '').trim() === 'DB_UNAVAILABLE'),
      notFound: Number(resp?.status || 0) === 404
    };
    if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
      pageState.publicPagePayload = null;
      return null;
    }
    pageState.publicPagePayload = {
      ...resp.json,
      page: normalizeBuilderPageShape(resp.json.page)
    };
    initializeQualificationState(pageState.publicPagePayload.page);
    return pageState.publicPagePayload;
  }

  async function loadCurrentBuilderVersions(pageId = pageState.currentTrainerPage?.id) {
    if (isStandalonePublicCoachRoute()) {
      editorState.versions = [];
      return [];
    }
    const targetId = String(pageId || '').trim();
    if (!targetId) {
      editorState.versions = [];
      return [];
    }
    editorState.versionLoading = true;
    syncBuilderToolbarState();
    try {
      const resp = await api(`/api/auth/trainer/page/versions?pageId=${encodeURIComponent(targetId)}&limit=25`);
      const versions = resp.ok && resp.json?.ok && Array.isArray(resp.json?.versions)
        ? resp.json.versions
        : [];
      editorState.versions = versions;
      return versions;
    } finally {
      editorState.versionLoading = false;
      syncBuilderToolbarState();
      const editingStandaloneRoute = editorState.enabled && isStandalonePublicCoachRoute();
      if (!editingStandaloneRoute) {
        window.setTimeout(() => {
          renderCurrentProfile();
        }, 0);
      }
    }
  }

  function builderPagePath(page) {
    const siteSlug = sanitizeHandle(page?.siteSlug || pageState.trainer?.publicHandle || pageState.trainer?.username || '');
    const pageSlug = slugify(page?.pageSlug || '');
    return pageSlug ? `/coach/${siteSlug}/${pageSlug}` : `/coach/${siteSlug}`;
  }

  function standalonePreviewViewportMode() {
    return window.matchMedia('(max-width: 767px)').matches && editorState.previewDevice !== 'mobile'
      ? 'desktop'
      : 'responsive';
  }

  function currentStandalonePreviewScroll(previewFrame) {
    const fallback = {
      x: Number(editorState.lastPreviewScroll?.x) || 0,
      y: Number(editorState.lastPreviewScroll?.y) || 0
    };
    if (!(previewFrame instanceof HTMLIFrameElement)) return fallback;
    try {
      const previewWindow = previewFrame.contentWindow;
      const previewDoc = previewWindow?.document;
      const scrollRoot = previewDoc?.scrollingElement || previewDoc?.documentElement || previewDoc?.body || null;
      const liveX = Number(previewWindow?.scrollX);
      const liveY = Number(previewWindow?.scrollY);
      return {
        x: Number.isFinite(liveX) ? liveX : (Number(scrollRoot?.scrollLeft) || fallback.x),
        y: Number.isFinite(liveY) ? liveY : (Number(scrollRoot?.scrollTop) || fallback.y)
      };
    } catch {
      return fallback;
    }
  }

  function captureStandalonePreviewScroll(previewFrame, timeoutMs = 140) {
    const fallback = currentStandalonePreviewScroll(previewFrame);
    if (!(previewFrame instanceof HTMLIFrameElement) || !previewFrame.contentWindow) {
      return Promise.resolve(fallback);
    }
    return new Promise((resolve) => {
      const token = `scroll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let settled = false;
      const finish = (value = fallback) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', handleMessage);
        window.clearTimeout(timer);
        const next = {
          x: Number(value?.x) || fallback.x,
          y: Number(value?.y) || fallback.y
        };
        editorState.lastPreviewScroll = next;
        resolve(next);
      };
      const handleMessage = (event) => {
        const data = event?.data && typeof event.data === 'object' ? event.data : null;
        if (!data || data.type !== 'trainer_standalone_scroll_state' || data.token !== token) return;
        try {
          if (event.source !== previewFrame.contentWindow) return;
        } catch {
          return;
        }
        finish({ x: data.x, y: data.y });
      };
      const timer = window.setTimeout(() => finish(fallback), Math.max(30, Number(timeoutMs) || 140));
      window.addEventListener('message', handleMessage);
      try {
        previewFrame.contentWindow.postMessage({ type: 'trainer_standalone_scroll_capture', token }, '*');
      } catch {
        finish(fallback);
      }
    });
  }

  async function stepStandaloneBuilderHistory(direction) {
    const livePreview = document.querySelector('[data-standalone-live-preview="1"]');
    await captureStandalonePreviewScroll(livePreview);
    stepBuilderHistory(direction);
  }

  function pushBuilderHistory(snapshot) {
    const next = normalizeBuilderPageShape(snapshot || editorState.draft || createBlankTrainerPage(pageState.trainer));
    const last = editorState.historyPast.length ? editorState.historyPast[editorState.historyPast.length - 1] : null;
    const nextText = JSON.stringify(next);
    if (last && JSON.stringify(last) === nextText) return;
    editorState.historyPast.push(cloneJson(next));
    if (editorState.historyPast.length > 60) editorState.historyPast = editorState.historyPast.slice(-60);
    editorState.historyFuture = [];
    editorState.lastHistoryPushAt = Date.now();
  }

  function pushBuilderHistoryCoalesced(snapshot) {
    // Typing bursts collapse into one undo step: replace the top entry while
    // keystrokes come in quick succession so Undo reverts the whole edit, not
    // one character.
    const now = Date.now();
    const withinBurst = Number(editorState.lastHistoryPushAt || 0) > 0
      && (now - Number(editorState.lastHistoryPushAt)) < 900
      && editorState.historyPast.length > 1;
    if (!withinBurst) {
      pushBuilderHistory(snapshot);
      return;
    }
    const next = normalizeBuilderPageShape(snapshot || editorState.draft || createBlankTrainerPage(pageState.trainer));
    editorState.historyPast[editorState.historyPast.length - 1] = cloneJson(next);
    editorState.historyFuture = [];
    editorState.lastHistoryPushAt = now;
  }

  function applyBuilderSnapshot(snapshot) {
    const next = normalizeBuilderPageShape(snapshot || createBlankTrainerPage(pageState.trainer));
    editorState.draft = cloneJson(next);
    pageState.currentTrainerPage = cloneJson(next);
    editorState.dirty = JSON.stringify(editorState.draft || {}) !== JSON.stringify(editorState.original || {});
    const standaloneCodeInput = $('#trainer-page-code-html');
    const livePreview = document.querySelector('[data-standalone-live-preview="1"]');
    if (
      editorState.enabled
      && isStandalonePublicCoachRoute()
      && standaloneCodeInput instanceof HTMLTextAreaElement
      && livePreview instanceof HTMLIFrameElement
    ) {
      const nextCode = String(next?.draftContent?.customCode?.html || '').trim();
      const pageScrollX = window.scrollX;
      const pageScrollY = window.scrollY;
      const previewScroll = currentStandalonePreviewScroll(livePreview);
      editorState.lastPreviewScroll = { x: previewScroll.x, y: previewScroll.y };
      standaloneCodeInput.value = nextCode;
      const nextSrcdoc = buildStandalonePreviewSrcdoc(sanitizeStandaloneEditorMarkup(nextCode), {
        editable: true,
        viewportMode: standalonePreviewViewportMode(),
        initialScroll: previewScroll
      });
      livePreview.addEventListener('load', function restoreStandaloneUndoScroll() {
        livePreview.removeEventListener('load', restoreStandaloneUndoScroll);
        try {
          livePreview.contentWindow?.postMessage({
            type: 'trainer_standalone_scroll_restore',
            x: previewScroll.x,
            y: previewScroll.y
          }, '*');
        } catch {}
        try {
          window.scrollTo(pageScrollX, pageScrollY);
        } catch {}
      }, { once: true });
      livePreview.srcdoc = nextSrcdoc;
      standaloneInspectorState.selected = false;
      syncStandaloneInspectorUi();
      syncBuilderToolbarState();
      queueBuilderAutosave();
      return;
    }
    renderCurrentProfile();
  }

  function stepBuilderHistory(direction) {
    if (direction === 'undo') {
      if (editorState.historyPast.length <= 1) return;
      const current = editorState.historyPast.pop();
      if (current) editorState.historyFuture.unshift(cloneJson(current));
      const prev = editorState.historyPast[editorState.historyPast.length - 1];
      if (prev) applyBuilderSnapshot(prev);
      return;
    }
    if (direction === 'redo') {
      if (!editorState.historyFuture.length) return;
      const next = editorState.historyFuture.shift();
      if (!next) return;
      editorState.historyPast.push(cloneJson(next));
      applyBuilderSnapshot(next);
    }
  }

  function syncBuilderToolbarState() {
    const note = $('#trainer-profile-builder-note');
    if (note) {
      note.textContent = editorState.saving
        ? 'Saving...'
        : (editorState.dirty ? 'Unsaved changes' : 'Saved');
      note.classList.toggle('is-dirty', Boolean(editorState.dirty));
    }
    const undoBtn = $('#trainer-page-undo');
    const redoBtn = $('#trainer-page-redo');
    if (undoBtn) undoBtn.disabled = editorState.historyPast.length <= 1;
    if (redoBtn) redoBtn.disabled = editorState.historyFuture.length === 0;
    const currentId = String(pageState.currentTrainerPage?.id || editorState.draft?.id || '').trim();
    const orderedPages = builderNavigationPages();
    const currentIndex = orderedPages.findIndex((page) => String(page?.id || '').trim() === currentId);
    const moveUpBtn = $('#trainer-page-move-up');
    const moveDownBtn = $('#trainer-page-move-down');
    if (moveUpBtn) moveUpBtn.disabled = currentIndex <= 0;
    if (moveDownBtn) moveDownBtn.disabled = currentIndex < 0 || currentIndex >= (orderedPages.length - 1);
  }

  function queueBuilderAutosave() {
    if (!editorState.enabled || !editorState.dirty || editorState.finalizingStandaloneSave) return;
    clearBuilderAutosave();
    editorState.autosaveTimer = window.setTimeout(() => {
      editorState.autosaveTimer = 0;
      if (editorState.finalizingStandaloneSave || !editorState.enabled || !editorState.dirty) return;
      void persistBuilderPage({ autosave: true });
    }, TRAINER_PAGE_AUTOSAVE_MS);
  }

  async function waitForBuilderSaveIdle(timeoutMs = 2400) {
    const startedAt = Date.now();
    while (editorState.saving && (Date.now() - startedAt) < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }
    return !editorState.saving;
  }

  async function persistBuilderPage({ autosave = false, exitEdit = false, publish = false } = {}) {
    if (!editorState.draft || editorState.saving) return null;
    if (pageState.trainer?.isDemoLayout === true) {
      // Never autosave demo-route edits onto a real page while the user is
      // still experimenting; manual saves retarget to the editor's own site.
      if (autosave) {
        clearBuilderAutosave();
        return null;
      }
      const viewer = window.__trainerProfileViewer || null;
      const ownSlug = sanitizeHandle(viewer?.publicHandle || viewer?.username || '');
      if (!viewer?.id || !ownSlug) {
        clearBuilderAutosave();
        return null;
      }
      let ownPages = Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [];
      if (!ownPages.length) {
        try {
          ownPages = await loadTrainerPagesForViewer();
        } catch {
          ownPages = [];
        }
      }
      const ownHome = ownPages.find((page) => page.isHome) || ownPages[0] || null;
      editorState.draft = normalizeBuilderPageShape({
        ...cloneJson(editorState.draft || {}),
        id: String(ownHome?.id || ''),
        siteSlug: String(ownHome?.siteSlug || ownSlug),
        pageSlug: String(ownHome?.pageSlug || ''),
        pageName: String(ownHome?.pageName || 'Home'),
        navLabel: String(ownHome?.navLabel || 'Home'),
        isHome: true
      }, ownHome || editorState.draft || {});
      pageState.currentTrainerPage = cloneJson(editorState.draft);
    }
    if (!autosave) clearBuilderAutosave();
    const preserveStandaloneEditor = editorState.enabled && isStandalonePublicCoachRoute() && !exitEdit;
    const standaloneRouteMatch = isStandalonePublicCoachRoute() ? findOwnedStandaloneRoutePage() : null;
    const latestDraftContent = cloneJson(editorState.draft?.draftContent || pageState.currentTrainerPage?.draftContent || null);
    if (standaloneRouteMatch) {
      editorState.draft = normalizeBuilderPageShape({
        ...cloneJson(editorState.draft || {}),
        id: String(editorState.draft?.id || '').trim() || standaloneRouteMatch.id,
        siteSlug: String(editorState.draft?.siteSlug || '').trim() || standaloneRouteMatch.siteSlug,
        pageSlug: String(editorState.draft?.pageSlug || '').trim() || standaloneRouteMatch.pageSlug,
        isHome: editorState.draft?.isHome === true || standaloneRouteMatch.isHome === true
      }, standaloneRouteMatch);
      pageState.currentTrainerPage = cloneJson(editorState.draft);
    }
    let draft = buildBuilderSavePayload(editorState.draft);
    if (!draft.mode) return null;
    editorState.saving = true;
    syncBuilderToolbarState();
    try {
      let resp = await api('/api/auth/trainer/pages', {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          trainerUserId: String(pageState.trainer?.id || '').trim(),
          autosave,
          publish: publish === true && autosave !== true
        })
      });
      if ((!resp.ok || !resp.json?.ok) && String(resp.json?.error || '').trim() === 'This coach site already has a home page.') {
        // The draft targeted a site that already has a home page but carried no
        // page id - resolve the existing home page for that site (refetching the
        // page list in case it was never loaded) and update it instead.
        let ownedPages = Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [];
        try {
          const refreshed = await loadTrainerPagesForViewer();
          if (Array.isArray(refreshed) && refreshed.length) ownedPages = refreshed;
        } catch {}
        const conflictSlug = sanitizeHandle(draft.siteSlug || '');
        const existingRoutePage = ownedPages.find((page) => sanitizeHandle(page?.siteSlug || '') === conflictSlug && page.isHome)
          || ownedPages.find((page) => sanitizeHandle(page?.siteSlug || '') === conflictSlug)
          || findOwnedStandaloneRoutePage();
        if (existingRoutePage?.id && String(draft.id || '').trim() !== String(existingRoutePage.id || '').trim()) {
          draft = {
            ...draft,
            id: String(existingRoutePage.id || '').trim(),
            siteSlug: String(existingRoutePage.siteSlug || draft.siteSlug || '').trim(),
            pageSlug: String(existingRoutePage.pageSlug || draft.pageSlug || '').trim(),
            isHome: existingRoutePage.isHome === true
          };
          resp = await api('/api/auth/trainer/pages', {
            method: 'POST',
            body: JSON.stringify({
              ...draft,
              trainerUserId: String(pageState.trainer?.id || '').trim(),
              autosave,
              publish: publish === true && autosave !== true
            })
          });
        }
      }
      if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
        throw new Error(resp.json?.error || 'Could not save page draft.');
      }
      pageState.trainerPages = Array.isArray(resp.json?.pages)
        ? resp.json.pages.map((page) => normalizeBuilderPageShape(page))
        : pageState.trainerPages;
      pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
      syncBuilderPageCustomCodeState(latestDraftContent, { mirrorPublished: publish === true && autosave !== true });
      if (pageState.publicPagePayload?.page) pageState.publicPagePayload.page = normalizeBuilderPageShape(pageState.currentTrainerPage);
      editorState.original = cloneJson(pageState.currentTrainerPage);
      editorState.draft = cloneJson(pageState.currentTrainerPage);
      editorState.dirty = false;
      pushBuilderHistory(editorState.draft);
      if (exitEdit) editorState.enabled = false;
      clearBuilderAutosave();
      if (!autosave && isStandalonePublicCoachRoute()) {
        const nextPath = builderPagePath(pageState.currentTrainerPage);
        try { history.replaceState({}, '', nextPath); } catch {}
      }
      if (!preserveStandaloneEditor || exitEdit) {
        renderCurrentProfile();
      }
      return pageState.currentTrainerPage;
    } catch (err) {
      if (!autosave) window.alert(err?.message || 'Could not save trainer page.');
      return null;
    } finally {
      editorState.saving = false;
      syncBuilderToolbarState();
    }
  }

  async function publishCurrentBuilderPage({ exitEdit = false } = {}) {
    const page = pageState.currentTrainerPage || editorState.original || null;
    const latestDraftContent = cloneJson(editorState.draft?.draftContent || pageState.currentTrainerPage?.draftContent || null);
    if (!page?.id) {
      const saved = await persistBuilderPage({ autosave: false, exitEdit: false });
      if (!saved?.id) return null;
    }
    const targetId = String((pageState.currentTrainerPage || editorState.original || {}).id || '').trim();
    const resp = await api('/api/auth/trainer/page/publish', {
      method: 'POST',
      body: JSON.stringify({ pageId: targetId })
    });
    if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
      window.alert(resp.json?.error || 'Could not publish page.');
      return null;
    }
    pageState.trainerPages = Array.isArray(resp.json?.pages)
      ? resp.json.pages.map((item) => normalizeBuilderPageShape(item))
      : pageState.trainerPages;
    pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
    syncBuilderPageCustomCodeState(latestDraftContent, { mirrorPublished: true });
    if (pageState.currentTrainerPage) pageState.currentTrainerPage.isPublished = true;
    if (pageState.publicPagePayload?.page) pageState.publicPagePayload.page = normalizeBuilderPageShape(pageState.currentTrainerPage);
    editorState.original = cloneJson(pageState.currentTrainerPage);
    editorState.draft = cloneJson(pageState.currentTrainerPage);
    if (exitEdit) editorState.enabled = false;
    editorState.dirty = false;
    renderCurrentProfile();
    return pageState.currentTrainerPage;
  }

  async function completeSimpleCodeEdit() {
    const doneButtons = Array.from(document.querySelectorAll('[data-standalone-done]'));
    const dots = ['', '.', '..', '...'];
    let dotIndex = 0;
    doneButtons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = true;
      button.dataset.loading = '1';
      button.textContent = 'Saving';
    });
    const dotsTimer = window.setInterval(() => {
      dotIndex = (dotIndex + 1) % dots.length;
      doneButtons.forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) return;
        button.textContent = `Saving${dots[dotIndex]}`;
      });
    }, 280);
    editorState.finalizingStandaloneSave = true;
    clearBuilderAutosave();
    try {
      await waitForBuilderSaveIdle();
      let finalizedContent = cloneJson(editorState.draft?.draftContent || pageState.currentTrainerPage?.draftContent || null);
      const frame = document.querySelector('iframe[data-standalone-live-preview="1"]');
      if (frame instanceof HTMLIFrameElement && frame.contentWindow) {
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.removeEventListener('message', handleFlushMessage);
            resolve();
          };
          const handleFlushMessage = (event) => {
            const data = event?.data && typeof event.data === 'object' ? event.data : null;
            if (!data || data.type !== 'trainer_standalone_code_sync') return;
            try {
              if (event.source !== frame.contentWindow) return;
            } catch {
              return;
            }
            finish();
          };
          window.addEventListener('message', handleFlushMessage);
          window.setTimeout(finish, 220);
          try {
            frame.contentWindow.postMessage({ type: 'trainer_standalone_flush' }, '*');
          } catch {
            finish();
          }
        });
      }
      const standaloneCodeInput = $('#trainer-page-code-html');
      if (standaloneCodeInput instanceof HTMLTextAreaElement && editorState.draft) {
        const next = cloneJson(editorState.draft);
        next.mode = 'custom_code';
        next.draftContent = next.draftContent && typeof next.draftContent === 'object' ? next.draftContent : {};
        next.draftContent.mode = 'custom_code';
        next.draftContent.customCode = next.draftContent.customCode && typeof next.draftContent.customCode === 'object'
          ? next.draftContent.customCode
          : {};
        next.draftContent.customCode.html = normalizeStandaloneSyncedCode(standaloneCodeInput.value || '');
        next.draftContent.customCode.css = '';
        next.draftContent.customCode.javascript = '';
        next.draftContent.customCode.iframes = [];
        next.draftContent.customCode.embedScripts = [];
        editorState.draft = normalizeBuilderPageShape(next, editorState.original || pageState.currentTrainerPage || {});
        pageState.currentTrainerPage = cloneJson(editorState.draft);
        finalizedContent = cloneJson(editorState.draft?.draftContent || finalizedContent);
      }
      await waitForBuilderSaveIdle();
      const wasDemoRoute = pageState.trainer?.isDemoLayout === true;
      const saved = await persistBuilderPage({ autosave: false, exitEdit: true, publish: true });
      if (!saved?.id) {
        setStandaloneNotice('Could not save site. Try again.', 'error', { autoHideMs: 3600 });
        return;
      }
      if (wasDemoRoute) {
        // Demo-route edits are saved onto the editor's own coach site - take
        // them to their real page so what they see is what visitors get.
        window.location.assign(builderPagePath(saved));
        return;
      }
      finalizedContent = cloneJson(saved?.draftContent || saved?.publishedContent || finalizedContent);
      syncBuilderPageCustomCodeState(finalizedContent, { mirrorPublished: true });
      editorState.enabled = false;
      editorState.dirty = false;
      document.body.classList.remove('trainer-profile-editing');
      renderCurrentProfile();
      setStandaloneNotice('Site published. Visitors now see this version.', 'success', { autoHideMs: 2600 });
    } finally {
      editorState.finalizingStandaloneSave = false;
      window.clearInterval(dotsTimer);
      doneButtons.forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) return;
        button.disabled = false;
        delete button.dataset.loading;
        button.textContent = 'Done';
      });
    }
  }

  function showStandaloneTransientToast(message, kind = 'success', { autoHideMs = 2600 } = {}) {
    const text = String(message || '').trim();
    if (!text) return;
    document.querySelectorAll('[data-standalone-transient-toast]').forEach((node) => node.remove());
    const toast = document.createElement('div');
    toast.className = `trainer-builder-standalone-notice is-${kind === 'error' ? 'error' : 'success'}`;
    toast.setAttribute('data-standalone-transient-toast', '1');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = text;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), Math.max(800, Number(autoHideMs) || 2600));
  }

  function uploadTrainerMediaBlob(blob, { kind = 'image', mime = '', fileName = '', onProgress } = {}) {
    const attempt = () => new Promise((resolve) => {
      const query = new URLSearchParams({ type: kind, name: String(fileName || '') });
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/auth/trainer/page/media?${query.toString()}`);
      xhr.setRequestHeader('Content-Type', mime || 'application/octet-stream');
      xhr.withCredentials = true;
      // A stalled connection must fail fast enough to retry instead of
      // leaving the placeholder spinning forever.
      xhr.timeout = kind === 'video' ? 180000 : 60000;
      xhr.upload.onprogress = (progressEvent) => {
        if (progressEvent.lengthComputable && typeof onProgress === 'function') {
          onProgress(Math.max(1, Math.min(99, Math.round((progressEvent.loaded / progressEvent.total) * 100))));
        }
      };
      xhr.onload = () => {
        let json = null;
        try { json = JSON.parse(xhr.responseText || 'null'); } catch {}
        resolve({ status: xhr.status, json });
      };
      xhr.onerror = () => resolve({ status: 0, json: null });
      xhr.ontimeout = () => resolve({ status: 0, json: null, timedOut: true });
      xhr.send(blob);
    });
    return (async () => {
      let last = null;
      // 5 tries with growing waits (~15s of backoff) so uploads survive a
      // server restart, schema warm-up, or a DNS blip instead of giving up
      // in three seconds.
      const maxAttempts = 5;
      for (let attemptNo = 1; attemptNo <= maxAttempts; attemptNo += 1) {
        last = await attempt();
        if (last.status >= 200 && last.status < 300 && last.json?.ok) return last;
        // 4xx failures (auth, size, format) will not improve on retry.
        if (last.status >= 400 && last.status < 500) return last;
        if (attemptNo < maxAttempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attemptNo * 1500));
      }
      return last;
    })();
  }

  function captureVideoPosterBlob(sourceBlob) {
    // Grab the first frame locally so the placed video shows a real
    // thumbnail instead of a black box until someone presses play.
    return new Promise((resolve) => {
      let settled = false;
      const objectUrl = URL.createObjectURL(sourceBlob);
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        try { URL.revokeObjectURL(objectUrl); } catch {}
        resolve(value || null);
      };
      const timer = window.setTimeout(() => finish(null), 8000);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      const capture = () => {
        try {
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) {
            finish(null);
            return;
          }
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 1280 / width);
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((posterBlob) => finish(posterBlob), 'image/jpeg', 0.82);
        } catch {
          finish(null);
        }
      };
      video.addEventListener('loadeddata', () => {
        // Nudge past 0s: the very first decoded frame is often black.
        try {
          video.currentTime = Math.min(0.1, Math.max(0.01, (Number(video.duration) || 1) / 20));
        } catch {
          capture();
        }
      }, { once: true });
      video.addEventListener('seeked', capture, { once: true });
      video.addEventListener('error', () => finish(null), { once: true });
      video.src = objectUrl;
    });
  }

  const TRAINER_VIDEO_MAX_SECONDS = 20 * 60;

  function formatVideoClock(totalSeconds) {
    const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(safe / 60);
    const seconds = String(safe % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function captureVideoElementFrame(videoEl, maxWidth = 1280, quality = 0.85) {
    return new Promise((resolve) => {
      try {
        const width = videoEl.videoWidth;
        const height = videoEl.videoHeight;
        if (!width || !height) {
          resolve(null);
          return;
        }
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / width);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      } catch {
        resolve(null);
      }
    });
  }

  function openVideoThumbnailPicker(blob) {
    // Shown between picking a video file and actually uploading it: the
    // trainer scrubs to (or taps) the frame visitors should see before play,
    // and only submitting here posts the video.
    return new Promise((resolve) => {
      ensureTrainerSettingsStyle();
      document.getElementById('trainer-thumb-overlay')?.remove();
      const maxSeconds = Number(window.__trainerVideoMaxSeconds) || TRAINER_VIDEO_MAX_SECONDS;
      const objectUrl = URL.createObjectURL(blob);
      const overlay = document.createElement('div');
      overlay.id = 'trainer-thumb-overlay';
      overlay.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.62);backdrop-filter:blur(6px)');
      overlay.innerHTML = `
        <div class="trainer-settings-panel" role="dialog" aria-modal="true" aria-label="Pick a video thumbnail">
          <div class="trainer-settings-head">
            <div>
              <div class="trainer-settings-title">Pick your thumbnail</div>
              <div class="trainer-settings-sub">This frame shows before visitors press play.</div>
            </div>
            <button type="button" class="trainer-settings-close" data-thumb-cancel aria-label="Cancel upload">&#10005;</button>
          </div>
          <div class="trainer-settings-body">
            <div class="trainer-settings-card">
              <video data-thumb-video muted playsinline preload="auto" style="display:block;width:100%;max-height:280px;border-radius:14px;background:#000"></video>
              <input data-thumb-scrub type="range" min="0" max="1000" value="0" style="width:100%;margin-top:12px;accent-color:#2563eb">
              <div class="trainer-settings-note" style="margin-top:4px">Frame at <span data-thumb-time>0:00</span> &middot; drag the slider or tap a frame below</div>
              <div data-thumb-strip style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:10px"></div>
            </div>
            <div class="trainer-settings-card">
              <div class="trainer-settings-row">
                <button type="button" class="trainer-settings-btn" data-thumb-confirm disabled>Post video with this thumbnail</button>
                <button type="button" class="trainer-settings-btn is-ghost" data-thumb-cancel>Cancel</button>
              </div>
              <div class="trainer-settings-feedback" data-thumb-feedback></div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const videoEl = overlay.querySelector('[data-thumb-video]');
      const scrubEl = overlay.querySelector('[data-thumb-scrub]');
      const timeEl = overlay.querySelector('[data-thumb-time]');
      const stripEl = overlay.querySelector('[data-thumb-strip]');
      const confirmEl = overlay.querySelector('[data-thumb-confirm]');
      const feedbackEl = overlay.querySelector('[data-thumb-feedback]');
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        overlay.remove();
        try { URL.revokeObjectURL(objectUrl); } catch {}
        resolve(result);
      };
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) finish(null);
      });
      overlay.querySelectorAll('[data-thumb-cancel]').forEach((button) => {
        button.addEventListener('click', () => finish(null));
      });
      overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') finish(null);
        event.stopPropagation();
      });
      videoEl.addEventListener('error', () => finish({ posterBlob: null, unreadable: true }), { once: true });
      videoEl.addEventListener('loadedmetadata', async () => {
        let duration = Number(videoEl.duration) || 0;
        if (!Number.isFinite(duration) || duration <= 0) {
          // Some recordings (WebM especially) report Infinity until the
          // player is forced to the end once.
          duration = await new Promise((resolveDuration) => {
            let done = false;
            const settle = () => {
              const measured = Number(videoEl.duration);
              if (done) return;
              if (!Number.isFinite(measured) || measured <= 0) return;
              done = true;
              videoEl.removeEventListener('durationchange', settle);
              videoEl.removeEventListener('seeked', settle);
              try { videoEl.currentTime = 0; } catch {}
              resolveDuration(measured);
            };
            videoEl.addEventListener('durationchange', settle);
            videoEl.addEventListener('seeked', settle);
            window.setTimeout(() => {
              if (done) return;
              done = true;
              try { videoEl.currentTime = 0; } catch {}
              resolveDuration(0);
            }, 4000);
            try { videoEl.currentTime = 1e7; } catch {}
          });
        }
        if (duration > maxSeconds) {
          finish({ tooLong: duration });
          return;
        }
        confirmEl.disabled = false;
        const seekTo = (seconds) => {
          try { videoEl.currentTime = Math.min(Math.max(0, seconds), Math.max(0, duration - 0.05)); } catch {}
        };
        scrubEl.addEventListener('input', () => {
          seekTo((Number(scrubEl.value) / 1000) * duration);
        });
        videoEl.addEventListener('timeupdate', () => {
          timeEl.textContent = formatVideoClock(videoEl.currentTime);
        });
        seekTo(Math.min(0.1, duration / 20));
        // Filmstrip: six tappable frames captured from a second, hidden player
        // so building it never fights the trainer's scrubbing.
        try {
          const stripVideo = document.createElement('video');
          stripVideo.muted = true;
          stripVideo.playsInline = true;
          stripVideo.preload = 'auto';
          stripVideo.src = objectUrl;
          await new Promise((ready, bad) => {
            stripVideo.addEventListener('loadedmetadata', ready, { once: true });
            stripVideo.addEventListener('error', bad, { once: true });
          });
          for (const fraction of [0.02, 0.18, 0.36, 0.52, 0.7, 0.88]) {
            if (settled) break;
            const at = fraction * duration;
            await new Promise((seeked) => {
              stripVideo.addEventListener('seeked', seeked, { once: true });
              stripVideo.currentTime = at;
              window.setTimeout(seeked, 1500);
            });
            const frameBlob = await captureVideoElementFrame(stripVideo, 240, 0.7);
            if (!frameBlob) continue;
            const img = document.createElement('img');
            img.src = URL.createObjectURL(frameBlob);
            img.setAttribute('data-thumb-at', String(at));
            img.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid transparent';
            img.addEventListener('click', () => {
              stripEl.querySelectorAll('img').forEach((node) => { node.style.borderColor = 'transparent'; });
              img.style.borderColor = '#2563eb';
              seekTo(at);
              scrubEl.value = String(Math.round((at / duration) * 1000));
            });
            stripEl.appendChild(img);
          }
        } catch {}
      }, { once: true });
      confirmEl.addEventListener('click', async () => {
        confirmEl.disabled = true;
        confirmEl.textContent = 'Capturing frame...';
        const posterBlob = await captureVideoElementFrame(videoEl);
        if (!posterBlob) {
          trainerSettingsFeedback(feedbackEl, 'Could not capture that frame - try a different moment.', false);
          confirmEl.disabled = false;
          confirmEl.textContent = 'Post video with this thumbnail';
          return;
        }
        finish({ posterBlob });
      });
      videoEl.src = objectUrl;
    });
  }

  async function handleStandaloneMediaUploadMessage(event, data) {
    const frame = document.querySelector('iframe[data-standalone-live-preview="1"]');
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) return;
    try {
      if (frame.contentWindow !== event.source) return;
    } catch {
      return;
    }
    const token = String(data?.token || '').trim();
    if (!token) return;
    const kind = String(data?.kind || '').trim().toLowerCase() === 'video' ? 'video' : 'image';
    // The preview iframe can be rebuilt while the upload is in flight, which
    // would drop a single reply - post it a few times; the bridge swap is
    // idempotent (it only acts while the pending placeholder exists).
    const reply = (payload) => {
      [0, 450, 1400].forEach((delayMs) => {
        window.setTimeout(() => {
          const liveFrame = document.querySelector('iframe[data-standalone-live-preview="1"]');
          if (!(liveFrame instanceof HTMLIFrameElement) || !liveFrame.contentWindow) return;
          try {
            liveFrame.contentWindow.postMessage({ type: 'trainer_standalone_media_done', token, kind, ...payload }, '*');
          } catch {}
        }, delayMs);
      });
    };
    const imageMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
    const videoMimeTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    const maxBytes = kind === 'video' ? 80_000_000 : 10_000_000;
    const maxLabel = kind === 'video' ? '80MB' : '10MB';
    try {
      let blob = null;
      let mime = String(data?.mime || '').trim().toLowerCase();
      if (data?.file instanceof Blob) {
        blob = data.file;
        mime = mime || String(data.file.type || '').toLowerCase();
      } else if (typeof data?.dataUrl === 'string' && data.dataUrl.startsWith('data:')) {
        const fetched = await fetch(data.dataUrl);
        blob = await fetched.blob();
        mime = mime || String(blob.type || '').toLowerCase();
      }
      if (!blob) {
        showStandaloneTransientToast('Could not read that file from your device. Try picking it again.', 'error', { autoHideMs: 5200 });
        reply({ ok: false });
        return;
      }
      const allowedMimeTypes = kind === 'video' ? videoMimeTypes : imageMimeTypes;
      if (!mime || !allowedMimeTypes.includes(mime)) {
        showStandaloneTransientToast(
          kind === 'video'
            ? `That video format (${mime || 'unknown'}) isn't supported. Use MP4, WebM, OGG, or MOV.`
            : `That image format (${mime || 'unknown'}) isn't supported. Use PNG, JPG, WebP, GIF, or AVIF.`,
          'error',
          { autoHideMs: 6000 }
        );
        reply({ ok: false });
        return;
      }
      if (blob.size > maxBytes) {
        showStandaloneTransientToast(
          `That ${kind} is too large (${Math.round(blob.size / 1_000_000)}MB). The limit is ${maxLabel} - trim or compress it and try again.`,
          'error',
          { autoHideMs: 6000 }
        );
        reply({ ok: false });
        return;
      }
      const postProgress = (percent) => {
        const liveFrame = document.querySelector('iframe[data-standalone-live-preview="1"]');
        if (!(liveFrame instanceof HTMLIFrameElement) || !liveFrame.contentWindow) return;
        try {
          liveFrame.contentWindow.postMessage({ type: 'trainer_standalone_media_progress', token, kind, percent }, '*');
        } catch {}
      };
      let pickedPosterBlob = null;
      if (kind === 'video') {
        // The trainer picks the exact thumbnail frame first - only submitting
        // the picker posts the video. Also enforces the 20 minute cap.
        const picked = await openVideoThumbnailPicker(blob);
        if (picked?.tooLong) {
          showStandaloneTransientToast(
            `That video is ${Math.ceil(picked.tooLong / 60)} minutes long - the limit is 20 minutes. Trim it and try again.`,
            'error',
            { autoHideMs: 6500 }
          );
          reply({ ok: false });
          return;
        }
        if (!picked) {
          showStandaloneTransientToast('Video upload canceled.', 'success', { autoHideMs: 2200 });
          reply({ ok: false });
          return;
        }
        pickedPosterBlob = picked.posterBlob || null;
      }
      // Fall back to auto-capturing the first frame only when the picker
      // could not read the file; runs while the video uploads.
      const posterPromise = kind === 'video'
        ? (pickedPosterBlob ? Promise.resolve(pickedPosterBlob) : captureVideoPosterBlob(blob))
        : Promise.resolve(null);
      const result = await uploadTrainerMediaBlob(blob, {
        kind,
        mime,
        fileName: String(data?.fileName || ''),
        onProgress: postProgress
      });
      const json = result?.json || null;
      if (!json?.ok || !json?.media?.url) {
        const status = Number(result?.status) || 0;
        const reason = String(json?.error || '').trim()
          || (status === 401 ? 'You are signed out - sign in again and retry.' : '')
          || (status === 413 ? `The file is too large to upload (limit ${maxLabel}).` : '')
          || (result?.timedOut ? 'The upload timed out - check your connection and try again.' : '')
          || (status === 0 ? 'The upload could not reach the server after several tries - check your connection.' : '')
          || `Upload failed (server responded ${status}).`;
        showStandaloneTransientToast(reason, 'error', { autoHideMs: 6000 });
        reply({ ok: false });
        return;
      }
      let posterUrl = '';
      if (kind === 'video') {
        try {
          const posterBlob = await posterPromise;
          if (posterBlob) {
            const posterResult = await uploadTrainerMediaBlob(posterBlob, {
              kind: 'image',
              mime: 'image/jpeg',
              fileName: `${String(data?.fileName || 'video').replace(/\.[^.]+$/, '')}-poster.jpg`
            });
            posterUrl = String(posterResult?.json?.media?.url || '').trim();
          }
        } catch {}
      }
      reply({ ok: true, url: json.media.url, poster: posterUrl });
      showStandaloneTransientToast(kind === 'video' ? 'Video uploaded.' : 'Image uploaded.', 'success', { autoHideMs: 2200 });
    } catch {
      showStandaloneTransientToast(
        `Upload failed before reaching the server - check your connection. If the ${kind} is bigger than ${maxLabel} it cannot be uploaded.`,
        'error',
        { autoHideMs: 6000 }
      );
      reply({ ok: false });
    }
  }

  async function unpublishCurrentBuilderPage() {
    const targetId = String((pageState.currentTrainerPage || {}).id || '').trim();
    if (!targetId) return;
    const resp = await api('/api/auth/trainer/page/unpublish', {
      method: 'POST',
      body: JSON.stringify({ pageId: targetId })
    });
    if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
      window.alert(resp.json?.error || 'Could not unpublish page.');
      return;
    }
    pageState.trainerPages = Array.isArray(resp.json?.pages)
      ? resp.json.pages.map((item) => normalizeBuilderPageShape(item))
      : pageState.trainerPages;
    pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
    editorState.original = cloneJson(pageState.currentTrainerPage);
    editorState.draft = cloneJson(pageState.currentTrainerPage);
    renderCurrentProfile();
  }

  async function restoreBuilderVersion(versionId) {
    const targetId = String(versionId || '').trim();
    if (!targetId) return;
    const okay = window.confirm('Restore this saved version? Your current draft will be replaced.');
    if (!okay) return;
    editorState.saving = true;
    syncBuilderToolbarState();
    try {
      const resp = await api('/api/auth/trainer/page/version/restore', {
        method: 'POST',
        body: JSON.stringify({ versionId: targetId })
      });
      if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
        window.alert(resp.json?.error || 'Could not restore version.');
        return;
      }
      pageState.trainerPages = Array.isArray(resp.json?.pages)
        ? resp.json.pages.map((page) => normalizeBuilderPageShape(page))
        : pageState.trainerPages;
      pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
      editorState.original = cloneJson(pageState.currentTrainerPage);
      editorState.draft = cloneJson(pageState.currentTrainerPage);
      editorState.dirty = false;
      editorState.historyPast = [cloneJson(pageState.currentTrainerPage)];
      editorState.historyFuture = [];
      editorState.versions = Array.isArray(resp.json?.versions) ? resp.json.versions : editorState.versions;
      renderCurrentProfile();
    } finally {
      editorState.saving = false;
      syncBuilderToolbarState();
    }
  }

  const standalonePreviewNavWatchdogs = new WeakMap();

  function postStandalonePreviewViewportInsets() {
    document.querySelectorAll('iframe[data-standalone-live-preview="1"]').forEach((frame) => {
      if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.height) return;
      // The code editor dock is fixed over the bottom of the window while
      // editing; the preview iframe can also extend past the window. Tell the
      // bridge which vertical band of its viewport the trainer can really see.
      const dock = document.querySelector('.trainer-builder-setup-input');
      const dockRect = dock ? dock.getBoundingClientRect() : null;
      const windowBottom = window.innerHeight || document.documentElement.clientHeight || 0;
      const visibleBottomPx = Math.min(windowBottom, dockRect ? dockRect.top : windowBottom) - rect.top;
      const scaleY = rect.height / Math.max(1, frame.clientHeight || rect.height);
      const visibleBottom = Math.max(0, Math.round(visibleBottomPx / (scaleY || 1)));
      const visibleTop = Math.max(0, Math.round((0 - rect.top) / (scaleY || 1)));
      try {
        frame.contentWindow.postMessage({ type: 'trainer_standalone_viewport_insets', visibleTop, visibleBottom }, '*');
      } catch {}
    });
  }

  async function handleStandaloneEditorNavMessage(data) {
    if (!editorState.enabled) return;
    const href = String(data?.href || '').trim();
    if (!href) return;
    let parsed;
    try {
      parsed = new URL(href, `${window.location.origin}${builderPagePath(pageState.currentTrainerPage) || '/'}`);
    } catch {
      return;
    }
    if (parsed.origin !== window.location.origin) return;
    const routeMatch = parsed.pathname.match(/^\/coach\/([^/]+)(?:\/([^/]+))?$/i);
    if (!routeMatch) {
      showStandaloneTransientToast(`Links to ${parsed.pathname} open after you press Done - only coach pages can be previewed while editing.`, 'error', { autoHideMs: 4200 });
      return;
    }
    const routeSite = sanitizeHandle(routeMatch[1] || '');
    const routePage = slugify(routeMatch[2] || '');
    let pages = Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [];
    if (!pages.length) {
      try { pages = await loadTrainerPagesForViewer(); } catch { pages = []; }
    }
    const target = pages.find((page) => sanitizeHandle(page?.siteSlug || '') === routeSite && slugify(page?.pageSlug || '') === routePage)
      || (routePage === '' ? pages.find((page) => sanitizeHandle(page?.siteSlug || '') === routeSite && page?.isHome === true) : null);
    if (!target) {
      showStandaloneTransientToast(`You have not created a page at ${parsed.pathname} yet. Create that page or point the link at a section like #pricing.`, 'error', { autoHideMs: 4600 });
      return;
    }
    if (String(target.id || '').trim() === String(pageState.currentTrainerPage?.id || '').trim()) return;
    if (editorState.dirty) {
      await persistBuilderPage({ autosave: true });
    }
    openBuilderEditor(cloneJson(target));
    try { history.replaceState({}, '', builderPagePath(target)); } catch {}
    showStandaloneTransientToast(`Now editing ${String(target.pageName || target.navLabel || 'that page').trim()}.`, 'success', { autoHideMs: 2400 });
  }

  function openBuilderEditor(page = null) {
    const target = hydrateBuilderDraftCustomCode(page || pageState.currentTrainerPage || createBlankTrainerPage(pageState.trainer));
    setStandaloneNotice('', 'success', { rerender: false });
    window.clearTimeout(pageState.pendingStandaloneEditorTimer || 0);
    pageState.pendingStandaloneEditorTimer = 0;
    pageState.pendingStandaloneEditorOpen = false;
    pageState.currentTrainerPage = cloneJson(target);
    editorState.enabled = true;
    editorState.previewMode = false;
    editorState.previewDevice = 'desktop';
    editorState.draft = cloneJson(target);
    editorState.original = cloneJson(target);
    editorState.dirty = false;
    editorState.historyPast = [cloneJson(target)];
    editorState.historyFuture = [];
    document.body.classList.add('trainer-profile-editing');
    void loadCurrentBuilderVersions(target.id);
    renderCurrentProfile();
  }

  function updateBuilderDraft(mutator) {
    if (!editorState.draft || typeof mutator !== 'function') return;
    const next = cloneJson(editorState.draft);
    mutator(next);
    editorState.draft = normalizeBuilderPageShape(next, editorState.original || pageState.currentTrainerPage || {});
    pageState.currentTrainerPage = cloneJson(editorState.draft);
    editorState.dirty = JSON.stringify(editorState.draft || {}) !== JSON.stringify(editorState.original || {});
    pushBuilderHistory(editorState.draft);
    syncBuilderToolbarState();
    queueBuilderAutosave();
    renderCurrentProfile();
  }

  function moveCurrentBuilderPage(offset = 0) {
    const currentId = String(pageState.currentTrainerPage?.id || editorState.draft?.id || '').trim();
    if (!currentId) return;
    const orderedPages = builderNavigationPages();
    const currentIndex = orderedPages.findIndex((page) => String(page?.id || '').trim() === currentId);
    if (currentIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(orderedPages.length - 1, currentIndex + Math.round(Number(offset) || 0)));
    if (targetIndex === currentIndex) return;
    updateBuilderDraft((draft) => {
      draft.navOrder = targetIndex;
    });
  }

  function builderCodeForEditing(page = editorState.draft || pageState.currentTrainerPage) {
    const draftContent = activeBuilderDraftContent(page) || {};
    const customCode = draftContent.customCode && typeof draftContent.customCode === 'object'
      ? draftContent.customCode
      : {};
    return {
      html: String(customCode.html || '').trim(),
      css: String(customCode.css || '').trim(),
      javascript: String(customCode.javascript || '').trim(),
      iframes: Array.isArray(customCode.iframes) ? customCode.iframes : [],
      embedScripts: Array.isArray(customCode.embedScripts) ? customCode.embedScripts : []
    };
  }

  function sanitizeStandaloneEditorMarkup(raw = '') {
    const text = String(raw || '').trim();
    if (!text) return '';
    const transientAttrs = [
      'data-standalone-selected',
      'data-standalone-rim-hover',
      'data-standalone-rim-cursor',
      'data-standalone-dragging',
      'data-standalone-drop-target',
      'data-standalone-editing',
      'data-standalone-hover-target'
    ];
    const hasDoctype = /<!doctype\s+html/i.test(text);
    try {
      const parser = new DOMParser();
      const fullDocument = /<(?:!doctype\s+html|html|head|body)\b/i.test(text);
      const doc = parser.parseFromString(fullDocument ? text : `<body>${text}</body>`, 'text/html');
      transientAttrs.forEach((attr) => {
        doc.querySelectorAll(`[${attr}]`).forEach((node) => node.removeAttribute(attr));
      });
      doc.querySelectorAll('[contenteditable],[spellcheck]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.removeAttribute('contenteditable');
        node.removeAttribute('spellcheck');
      });
      if (!fullDocument) return String(doc.body?.innerHTML || '').trim();
      const markup = String(doc.documentElement?.outerHTML || '').trim();
      if (!markup) return text;
      return `${hasDoctype ? '<!doctype html>\n' : ''}${markup}`;
    } catch {
      return text;
    }
  }

  function normalizeStandaloneSyncedCode(raw = '') {
    const text = sanitizeStandaloneEditorMarkup(raw);
    if (!text) return '';
    if (!/<(?:!doctype\s+html|html|head|body)\b/i.test(text)) return text;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      [
        '#standalone-runtime-error',
        '#builder-runtime-error',
        '#standalone-context-menu',
        '#standalone-hover-delete',
        '#standalone-marquee',
        '#standalone-root-layout-style',
        '#standalone-viewport-style',
        '#standalone-button-enhancement-style',
        '#standalone-bridge-style',
        '#standalone-hover-cursor-style'
      ].forEach((selector) => {
        doc.querySelectorAll(selector).forEach((node) => node.remove());
      });
      doc.querySelectorAll('style').forEach((node) => {
        const cssText = String(node.textContent || '');
        if (/#standalone-runtime-error|#builder-runtime-error|#standalone-page-root::-webkit-scrollbar|#builder-page-root::-webkit-scrollbar/.test(cssText)) {
          node.remove();
        }
      });
      doc.querySelectorAll('script').forEach((node) => {
        const id = String(node.getAttribute('id') || '').trim();
        const sourceText = String(node.textContent || '');
        if (
          id === 'standalone-bridge-script'
          || sourceText.includes('trainer_standalone_code_sync')
          || sourceText.includes('standalone-context-menu')
          || sourceText.includes('trainer_builder_resize')
        ) {
          node.remove();
        }
      });
      const serializeBodySiblings = (rootNode) => Array.from(doc.body?.childNodes || [])
        .filter((node) => node !== rootNode)
        .map((node) => {
          if (node instanceof HTMLElement) return node.outerHTML;
          return String(node.textContent || '');
        })
        .join('')
        .trim();
      const serializeHeadStyles = () => Array.from(doc.head ? doc.head.querySelectorAll('style, link[rel="stylesheet"]') : [])
        .map((node) => String(node.outerHTML || '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      const standaloneRoot = doc.querySelector('#standalone-page-root');
      if (standaloneRoot instanceof HTMLElement) {
        const siblingMarkup = serializeBodySiblings(standaloneRoot);
        return [serializeHeadStyles(), String(standaloneRoot.innerHTML || '').trim(), siblingMarkup].filter(Boolean).join('\n').trim();
      }
      const builderRoot = doc.querySelector('#builder-page-root');
      if (builderRoot instanceof HTMLElement) {
        const siblingMarkup = serializeBodySiblings(builderRoot);
        return [serializeHeadStyles(), String(builderRoot.innerHTML || '').trim(), siblingMarkup].filter(Boolean).join('\n').trim();
      }
      const bodyMarkup = String(doc.body?.innerHTML || '').trim();
      if (!bodyMarkup) return '';
      const hasPreviewArtifacts = /standalone-runtime-error|builder-runtime-error|standalone-context-menu|trainer_builder_resize|trainer_standalone_code_sync/i.test(bodyMarkup);
      if (hasPreviewArtifacts) return [serializeHeadStyles(), bodyMarkup].filter(Boolean).join('\n').trim();
      return text;
    } catch {
      return text;
    }
  }

  function normalizeHexColorToken(raw = '') {
    const value = String(raw || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(value)) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
    }
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    return '';
  }

  function rgbTripletToHex(r = 0, g = 0, b = 0) {
    const toHex = (value) => Math.max(0, Math.min(255, Number(value) || 0)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function brandAccentFromCode(rawCode = '') {
    const source = String(rawCode || '');
    if (!source) return '';
    const weights = new Map();
    const addWeight = (token, weight = 1) => {
      const hex = normalizeHexColorToken(token);
      if (!hex) return;
      const red = parseInt(hex.slice(1, 3), 16);
      const green = parseInt(hex.slice(3, 5), 16);
      const blue = parseInt(hex.slice(5, 7), 16);
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const spread = max - min;
      const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
      const nearBlack = luminance < 28;
      const nearWhite = luminance > 238;
      const nearGray = spread < 18;
      if (nearBlack || nearWhite || nearGray) return;
      const score = weight + (spread / 255) + (Math.abs(128 - luminance) / 255 * 0.45);
      weights.set(hex, (weights.get(hex) || 0) + score);
    };
    source.match(/#[0-9a-f]{3,6}\b/ig)?.forEach((token) => addWeight(token, 1.15));
    Array.from(source.matchAll(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/ig))
      .forEach((match) => addWeight(rgbTripletToHex(match[1], match[2], match[3]), 0.95));
    const ranked = Array.from(weights.entries()).sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] || '';
  }

  function resolveTrainerRouteLoaderBrandAccent(trainer = pageState.trainer, page = pageState.currentTrainerPage || pageState.publicPagePayload?.page || null) {
    const direct = String(trainer?.accentColor || trainer?.meta?.accentColor || '').trim();
    const directHex = normalizeHexColorToken(direct);
    if (directHex) return directHex;
    const pageCode = builderCodeForEditing(page);
    const derived = brandAccentFromCode([
      String(pageCode?.html || ''),
      String(pageCode?.css || '')
    ].join('\n'));
    return derived || TRAINER_ROUTE_LOADER_ACCENT;
  }

  function renderStandaloneCodeHighlightFragment(raw = '') {
    const source = String(raw || '');
    if (!source) return '&nbsp;';
    const escapeToken = (value) => escapeHtml(value).replace(/\n/g, '<br>');
    const pattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|let|var|function|return|if|else|for|while|class|new|import|export|from)\b|\b\d+(?:\.\d+)?\b/g;
    let cursor = 0;
    let html = '';
    let match;
    while ((match = pattern.exec(source))) {
      if (match.index > cursor) html += escapeToken(source.slice(cursor, match.index));
      const token = match[0];
      if (/^<!--/.test(token)) {
        html += `<span class="trainer-builder-setup-code-token-comment">${escapeToken(token)}</span>`;
      } else if (/^<\/?[A-Za-z]/.test(token)) {
        const closing = /^<\//.test(token);
        const selfClosing = /\/>$/.test(token);
        const tagBody = token.replace(/^<\//, '').replace(/^</, '').replace(/\/>$/, '').replace(/>$/, '');
        const tagNameMatch = tagBody.match(/^[^\s/>]+/);
        if (!tagNameMatch) {
          html += `<span class="trainer-builder-setup-code-token-tag">${escapeToken(token)}</span>`;
        } else {
          const tagName = tagNameMatch[0];
          const attrSource = tagBody.slice(tagName.length);
          const attrHtml = attrSource.replace(/([A-Za-z_:][-A-Za-z0-9_:.]*)(\s*=\s*)(".*?"|'.*?'|[^\s>]+)/g, (_, name, eq, value) => (
            `<span class="trainer-builder-setup-code-token-attr">${escapeHtml(name)}</span>${escapeHtml(eq)}<span class="trainer-builder-setup-code-token-string">${escapeHtml(value)}</span>`
          ));
          html += `<span class="trainer-builder-setup-code-token-tag">&lt;${closing ? '/' : ''}${escapeHtml(tagName)}${attrHtml}${selfClosing ? '/' : ''}&gt;</span>`;
        }
      } else if (/^["']/.test(token)) {
        html += `<span class="trainer-builder-setup-code-token-string">${escapeToken(token)}</span>`;
      } else if (/^\d/.test(token)) {
        html += `<span class="trainer-builder-setup-code-token-number">${escapeToken(token)}</span>`;
      } else {
        html += `<span class="trainer-builder-setup-code-token-keyword">${escapeToken(token)}</span>`;
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < source.length) html += escapeToken(source.slice(cursor));
    return html || '&nbsp;';
  }

  function renderStandaloneCodeHighlight(raw = '', range = null) {
    const source = String(raw || '');
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start >= range.end) {
      return renderStandaloneCodeHighlightFragment(source);
    }
    const safeStart = Math.max(0, Math.min(source.length, range.start));
    const safeEnd = Math.max(safeStart, Math.min(source.length, range.end));
    return [
      renderStandaloneCodeHighlightFragment(source.slice(0, safeStart)),
      `<mark class="trainer-builder-setup-code-match">${renderStandaloneCodeHighlightFragment(source.slice(safeStart, safeEnd))}</mark>`,
      renderStandaloneCodeHighlightFragment(source.slice(safeEnd))
    ].join('');
  }

  function safeStyleToken(raw, fallback = '') {
    const value = String(raw || '').trim();
    if (!value) return fallback;
    return value.replace(/[;"'<>]/g, '').slice(0, 120);
  }

  function extractCombinedCodeParts(rawHtml = '') {
    const raw = unwrapMarkdownCodeFence(rawHtml || '');
    const looksLikeFullDocument = /<(?:!doctype\s+html|html|head|body)\b/i.test(raw);
    if (looksLikeFullDocument) {
      const scripts = [];
      const sanitizedDocument = String(raw || '').replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, js) => {
        const attrText = String(attrs || '');
        if (/\bsrc\s*=/i.test(attrText)) return match;
        scripts.push(String(js || '').trim());
        return '';
      });
      return {
        fullDocument: sanitizedDocument.trim(),
        html: '',
        styles: [],
        scripts
      };
    }
    const styles = [];
    const scripts = [];
    let html = raw;
    html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
      styles.push(String(css || '').trim());
      return '';
    });
    html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, js) => {
      scripts.push(String(js || '').trim());
      return '';
    });
    return {
      fullDocument: '',
      html: html.trim(),
      styles,
      scripts
    };
  }

  function normalizeStandaloneFontSize(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^\d+(\.\d+)?$/.test(value)) return `${value}px`;
    return value.slice(0, 32);
  }

  function normalizeStandaloneColor(raw, fallback = '#111111') {
    const value = String(raw || '').trim();
    if (!value) return fallback;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value;
    if (/^transparent$/i.test(value)) return fallback;
    const rgb = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!rgb) return fallback;
    const toHex = (part) => Number(part || 0).toString(16).padStart(2, '0');
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
  }

  function normalizeStandaloneFontFamily(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return value.replace(/[<>]/g, '').slice(0, 120);
  }

  function normalizeStandaloneFontStyle(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'italic') return 'italic';
    return '';
  }

  function normalizeStandaloneCodeSearchText(raw) {
    return String(raw || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function sanitizeStandaloneCodeSignature(raw) {
    return String(raw || '')
      .replace(/\sdata-standalone-[^=\s>]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
      .replace(/\scontenteditable(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
      .replace(/\sspellcheck(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findStandaloneCodeMatchRange(code, searchText) {
    const source = String(code || '');
    const target = normalizeStandaloneCodeSearchText(searchText);
    if (!source || !target) return null;
    const normalizedChars = [];
    const indexMap = [];
    let lastWasSpace = true;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (/\s/.test(char)) {
        if (!lastWasSpace) {
          normalizedChars.push(' ');
          indexMap.push(index);
          lastWasSpace = true;
        }
        continue;
      }
      normalizedChars.push(char.toLowerCase());
      indexMap.push(index);
      lastWasSpace = false;
    }
    const normalizedSource = normalizedChars.join('').trim();
    if (!normalizedSource) return null;
    const normalizedOffset = normalizedSource.indexOf(target);
    if (normalizedOffset < 0) return null;
    const leadingTrim = normalizedChars.findIndex((char) => char !== ' ');
    const sourceOffset = leadingTrim > 0 ? normalizedOffset + leadingTrim : normalizedOffset;
    const start = indexMap[sourceOffset];
    const endIndex = indexMap[Math.min(indexMap.length - 1, sourceOffset + target.length - 1)];
    if (!Number.isInteger(start) || !Number.isInteger(endIndex)) return null;
    return { start, end: endIndex + 1 };
  }

  function resolveStandaloneNodeFromPath(code, nodePath = []) {
    const path = Array.isArray(nodePath) ? nodePath.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0) : [];
    if (!path.length) return null;
    const parsed = extractCombinedCodeParts(code);
    let root = null;
    if (parsed.fullDocument) {
      try {
        const doc = new DOMParser().parseFromString(parsed.fullDocument, 'text/html');
        root = doc.getElementById('standalone-page-root') || doc.body || doc.documentElement;
      } catch {
        root = null;
      }
    } else {
      const wrap = document.createElement('div');
      wrap.innerHTML = String(parsed.html || '');
      root = wrap;
    }
    if (!(root instanceof Element)) return null;
    let current = root;
    for (const index of path) {
      const children = Array.from(current.children || []);
      current = children[index] || null;
      if (!(current instanceof Element)) return null;
    }
    return current;
  }

  function revealStandaloneCodeMatch(meta = {}) {
    const input = $('#trainer-page-code-html');
    if (!(input instanceof HTMLTextAreaElement)) return;
    const code = String(input.value || '');
    const idValue = String(meta.id || '').trim();
    const searches = [];
    const structuralNode = resolveStandaloneNodeFromPath(code, meta.nodePath);
    if (structuralNode instanceof Element) {
      const structuralMarkup = String(structuralNode.outerHTML || '').trim();
      if (structuralMarkup) searches.push(structuralMarkup);
    }
    if (meta.markup) searches.push(sanitizeStandaloneCodeSignature(meta.markup));
    if (meta.openingTag) searches.push(sanitizeStandaloneCodeSignature(meta.openingTag));
    if (idValue) {
      searches.push(`id="${idValue}"`);
      searches.push(`id='${idValue}'`);
      searches.push(`#${idValue}`);
    }
    if (meta.text) searches.push(String(meta.text || ''));
    let match = null;
    for (const search of searches) {
      match = findStandaloneCodeMatchRange(code, search);
      if (match) break;
    }
    standaloneCodeHighlightRange = match;
    syncStandaloneCodeHighlightUi();
    if (!match) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(match.start, match.end);
    const targetTop = standaloneCodeMatchScrollTop();
    animateStandaloneCodeScroll(input, targetTop == null ? 0 : targetTop);
  }

  function syncStandaloneCodeHighlightUi() {
    const input = $('#trainer-page-code-html');
    const overlay = $('#trainer-page-code-highlight');
    if (!(input instanceof HTMLTextAreaElement) || !(overlay instanceof HTMLElement)) return;
    overlay.innerHTML = renderStandaloneCodeHighlight(input.value || '', standaloneCodeHighlightRange);
    overlay.scrollTop = input.scrollTop;
    overlay.scrollLeft = input.scrollLeft;
  }

  function standaloneCodeMatchScrollTop() {
    const overlay = $('#trainer-page-code-highlight');
    const input = $('#trainer-page-code-html');
    if (!(overlay instanceof HTMLElement) || !(input instanceof HTMLTextAreaElement)) return null;
    const matchEl = overlay.querySelector('mark.trainer-builder-setup-code-match');
    if (!(matchEl instanceof HTMLElement)) return null;
    const overlayRect = overlay.getBoundingClientRect();
    const matchRect = matchEl.getBoundingClientRect();
    const topWithinOverlay = (matchRect.top - overlayRect.top) + overlay.scrollTop;
    return Math.max(0, Math.round(topWithinOverlay - (input.clientHeight * 0.35)));
  }

  function animateStandaloneCodeScroll(input, targetTop) {
    if (!(input instanceof HTMLTextAreaElement)) return;
    const endTop = Math.max(0, Number(targetTop || 0));
    if (Math.abs(endTop - Number(input.scrollTop || 0)) < 2) {
      input.scrollTop = endTop;
      syncStandaloneCodeHighlightUi();
      return;
    }
    try {
      input.scrollTo({ top: endTop, behavior: 'smooth' });
    } catch {
      input.scrollTop = endTop;
    }
    syncStandaloneCodeHighlightUi();
    window.setTimeout(() => syncStandaloneCodeHighlightUi(), 280);
  }

  function renderStandaloneInspectorControls() {
    const mobileInspector = window.matchMedia('(max-width: 767px)').matches;
    return `
      <div class="trainer-standalone-inspector-shell${standaloneInspectorState.selected && !standaloneInspectorState.minimized ? ' is-active' : ''}" id="trainer-standalone-inspector-shell">
        <div class="trainer-standalone-inspector${standaloneInspectorState.selected && !standaloneInspectorState.minimized ? ' is-active' : ''}" id="trainer-standalone-inspector">
        <button type="button" class="trainer-standalone-inspector-minimize" id="trainer-standalone-inspector-minimize" aria-label="Hide style controls">−</button>
        <input type="text" id="trainer-standalone-font-size" placeholder="Font size" value="${escapeHtml(String(standaloneInspectorState.fontSize || '').replace(/px$/i, ''))}">
        <input type="color" id="trainer-standalone-color" value="${escapeHtml(standaloneInspectorState.color || '#111111')}">
        <input type="color" id="trainer-standalone-fill" value="${escapeHtml(standaloneInspectorState.backgroundColor || '#ffffff')}">
        <select id="trainer-standalone-family">
          <option value=""${!standaloneInspectorState.fontFamily ? ' selected' : ''}>Font</option>
          <option value="Arial, sans-serif"${standaloneInspectorState.fontFamily === 'Arial, sans-serif' ? ' selected' : ''}>Arial</option>
          <option value="Georgia, serif"${standaloneInspectorState.fontFamily === 'Georgia, serif' ? ' selected' : ''}>Georgia</option>
          <option value="'Trebuchet MS', sans-serif"${standaloneInspectorState.fontFamily === "'Trebuchet MS', sans-serif" ? ' selected' : ''}>Trebuchet</option>
          <option value="'Times New Roman', serif"${standaloneInspectorState.fontFamily === "'Times New Roman', serif" ? ' selected' : ''}>Times</option>
          <option value="Verdana, sans-serif"${standaloneInspectorState.fontFamily === 'Verdana, sans-serif' ? ' selected' : ''}>Verdana</option>
        </select>
        ${mobileInspector ? '' : `<input type="text" id="trainer-standalone-text" placeholder="Selected text" value="${escapeHtml(standaloneInspectorState.text)}">`}
        ${mobileInspector ? '' : `<select id="trainer-standalone-weight">
          <option value=""${!standaloneInspectorState.fontWeight ? ' selected' : ''}>Weight</option>
          <option value="400"${standaloneInspectorState.fontWeight === '400' ? ' selected' : ''}>400</option>
          <option value="500"${standaloneInspectorState.fontWeight === '500' ? ' selected' : ''}>500</option>
          <option value="600"${standaloneInspectorState.fontWeight === '600' ? ' selected' : ''}>600</option>
          <option value="700"${standaloneInspectorState.fontWeight === '700' ? ' selected' : ''}>700</option>
          <option value="800"${standaloneInspectorState.fontWeight === '800' ? ' selected' : ''}>800</option>
        </select>`}
        ${mobileInspector ? '' : `<select id="trainer-standalone-style">
          <option value=""${!standaloneInspectorState.fontStyle ? ' selected' : ''}>Style</option>
          <option value="italic"${standaloneInspectorState.fontStyle === 'italic' ? ' selected' : ''}>Italic</option>
        </select>`}
        </div>
      </div>
    `;
  }

  function syncStandaloneInspectorUi() {
    const shell = $('#trainer-standalone-inspector-shell');
    const wrap = $('#trainer-standalone-inspector');
    if (!shell || !wrap) return;
    const visible = Boolean(standaloneInspectorState.selected && !standaloneInspectorState.minimized);
    shell.classList.toggle('is-active', visible);
    wrap.classList.toggle('is-active', visible);
    if (visible && standaloneInspectorState.bounds) {
      const bounds = standaloneInspectorState.bounds;
      const gap = 10;
      // Prefer sitting beside the selected element (left first, then right)
      // as a compact stacked panel; only drop below it when neither side has
      // room, so the bar never covers the middle of the field.
      shell.classList.add('is-side');
      let shellRect = shell.getBoundingClientRect();
      const leftSide = Number(bounds.left || 0) - shellRect.width - gap;
      const rightSide = Number(bounds.right || 0) + gap;
      let desiredLeft;
      if (leftSide >= 8) {
        desiredLeft = leftSide;
      } else if (rightSide + shellRect.width <= (window.innerWidth || 0) - 8) {
        desiredLeft = rightSide;
      } else {
        shell.classList.remove('is-side');
        shellRect = shell.getBoundingClientRect();
        desiredLeft = Number(bounds.left || 0);
      }
      const sidePlaced = shell.classList.contains('is-side');
      const maxLeft = Math.max(8, (window.innerWidth || 0) - shellRect.width - 8);
      const maxTop = Math.max(8, (window.innerHeight || 0) - shellRect.height - 8);
      let desiredTop;
      if (sidePlaced) {
        desiredTop = Number(bounds.top || 0);
      } else {
        desiredTop = Number(bounds.bottom || 0) + gap;
        if (desiredTop > maxTop) desiredTop = Math.max(8, Number(bounds.top || 0) - shellRect.height - gap);
      }
      shell.style.left = `${Math.max(8, Math.min(desiredLeft, maxLeft))}px`;
      shell.style.top = `${Math.max(8, Math.min(desiredTop, maxTop))}px`;
      shell.style.right = 'auto';
      shell.style.bottom = 'auto';
    } else {
      shell.classList.remove('is-side');
      shell.style.removeProperty('top');
      shell.style.removeProperty('left');
      shell.style.removeProperty('right');
      shell.style.removeProperty('bottom');
    }
    const textInput = $('#trainer-standalone-text');
    if (textInput instanceof HTMLInputElement) textInput.value = String(standaloneInspectorState.text || '');
    const fontSizeInput = $('#trainer-standalone-font-size');
    if (fontSizeInput instanceof HTMLInputElement) fontSizeInput.value = String(standaloneInspectorState.fontSize || '').replace(/px$/i, '');
    const colorInput = $('#trainer-standalone-color');
    if (colorInput instanceof HTMLInputElement) colorInput.value = standaloneInspectorState.color || '#111111';
    const fillInput = $('#trainer-standalone-fill');
    if (fillInput instanceof HTMLInputElement) fillInput.value = standaloneInspectorState.backgroundColor || '#ffffff';
    const familyInput = $('#trainer-standalone-family');
    if (familyInput instanceof HTMLSelectElement) familyInput.value = standaloneInspectorState.fontFamily || '';
    const weightInput = $('#trainer-standalone-weight');
    if (weightInput instanceof HTMLSelectElement) weightInput.value = standaloneInspectorState.fontWeight || '';
    const styleInput = $('#trainer-standalone-style');
    if (styleInput instanceof HTMLSelectElement) styleInput.value = standaloneInspectorState.fontStyle || '';
  }

  function clearStandaloneNoticeTimer() {
    if (!pageState.standaloneNoticeTimer) return;
    window.clearTimeout(pageState.standaloneNoticeTimer);
    pageState.standaloneNoticeTimer = 0;
  }

  function setStandaloneNotice(message = '', kind = 'success', { autoHideMs = 0, rerender = true } = {}) {
    clearStandaloneNoticeTimer();
    pageState.standaloneNotice = String(message || '').trim();
    pageState.standaloneNoticeKind = String(kind || 'success').trim().toLowerCase() === 'error' ? 'error' : 'success';
    if (pageState.standaloneNotice && Number(autoHideMs) > 0) {
      pageState.standaloneNoticeTimer = window.setTimeout(() => {
        pageState.standaloneNotice = '';
        pageState.standaloneNoticeKind = 'success';
        pageState.standaloneNoticeTimer = 0;
        renderCurrentProfile();
      }, Math.max(400, Number(autoHideMs) || 0));
    }
    if (rerender) renderCurrentProfile();
  }

  function clearStandaloneInspectorSelection({ clearPreview = true } = {}) {
    standaloneInspectorState.selected = false;
    standaloneInspectorState.minimized = false;
    standaloneInspectorState.text = '';
    standaloneInspectorState.fontSize = '';
    standaloneInspectorState.color = '#111111';
    standaloneInspectorState.backgroundColor = '#ffffff';
    standaloneInspectorState.fontWeight = '';
    standaloneInspectorState.fontFamily = '';
    standaloneInspectorState.fontStyle = '';
    standaloneInspectorState.bounds = null;
    syncStandaloneInspectorUi();
    if (!clearPreview) return;
    const frame = document.querySelector('iframe[data-standalone-live-preview="1"]');
    if (frame instanceof HTMLIFrameElement && frame.contentWindow) {
      frame.contentWindow.postMessage({ type: 'trainer_standalone_clear_selection' }, '*');
    }
  }

  function resolveTrainerRouteLoaderAccent(trainer = pageState.trainer) {
    return resolveTrainerRouteLoaderBrandAccent(trainer, pageState.currentTrainerPage || pageState.publicPagePayload?.page || null);
  }

  function resolveTrainerRouteLoaderName(trainer = pageState.trainer) {
    const raw = String(
      trainer?.displayName
      || trainer?.fullName
      || trainer?.username
      || trainer?.publicHandle
      || ''
    ).trim();
    const cleaned = raw.replace(/^@+/, '').trim();
    return cleaned || 'Coach';
  }

  function ensureTrainerRouteLoader() {
    let loader = document.getElementById('trainer-route-loader');
    if (loader) return loader;
    const style = document.createElement('style');
    style.id = 'trainer-route-loader-style';
    style.textContent = `
      #trainer-route-loader{
        position:fixed;
        inset:0;
        z-index:99999;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:32px;
        background:
          radial-gradient(circle at 50% 16%, color-mix(in srgb, var(--trainer-loader-accent, ${TRAINER_ROUTE_LOADER_ACCENT}) 12%, transparent), transparent 28%),
          linear-gradient(180deg, #fbfbfa 0%, #f2f2ef 100%);
        opacity:0;
        pointer-events:none;
        transition:opacity .42s ease, visibility 0s linear .42s;
        visibility:hidden;
      }
      #trainer-route-loader.is-visible{
        opacity:1;
        pointer-events:auto;
        visibility:visible;
        transition:opacity .42s ease;
      }
      #trainer-route-loader.is-hiding{
        opacity:0;
        pointer-events:none;
        visibility:visible;
      }
      #trainer-route-loader .trainer-route-loader-card{
        width:min(540px, 100%);
        display:grid;
        gap:16px;
        justify-items:center;
        text-align:center;
        padding:12px 18px;
      }
      #trainer-route-loader .trainer-route-loader-eyebrow{
        font:700 11px/1 "Space Grotesk", system-ui, sans-serif;
        letter-spacing:.24em;
        text-transform:uppercase;
        color:#7c8aa0;
      }
      #trainer-route-loader .trainer-route-loader-title{
        font:700 clamp(1.8rem, 4.2vw, 3rem)/.96 "Space Grotesk", system-ui, sans-serif;
        letter-spacing:-.045em;
        color:#0f172a;
        max-width:12ch;
      }
      #trainer-route-loader .trainer-route-loader-sub{
        font:500 .98rem/1.55 "Space Grotesk", system-ui, sans-serif;
        color:#667085;
        max-width:36ch;
      }
      #trainer-route-loader .trainer-route-loader-meta{
        width:min(420px,100%);
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        font:700 11px/1 "Space Grotesk", system-ui, sans-serif;
        letter-spacing:.14em;
        text-transform:uppercase;
        color:#7c8aa0;
      }
      #trainer-route-loader .trainer-route-loader-bar{
        width:min(420px, 100%);
        height:8px;
        padding:1px;
        border-radius:999px;
        background:rgba(15,23,42,.08);
        overflow:hidden;
        box-shadow:none;
      }
      #trainer-route-loader .trainer-route-loader-fill{
        width:0%;
        height:100%;
        border-radius:999px;
        background:var(--trainer-loader-accent, ${TRAINER_ROUTE_LOADER_ACCENT});
        box-shadow:0 0 0 1px rgba(255,255,255,.22) inset;
        transition:width .18s linear, background-color .2s ease;
      }
      #trainer-route-loader .trainer-route-loader-percent{
        color:#0f172a;
      }
      @media (max-width: 640px){
        #trainer-route-loader{
          padding:20px;
        }
        #trainer-route-loader .trainer-route-loader-card{
          padding:10px 10px 14px;
        }
        #trainer-route-loader .trainer-route-loader-meta{
          width:100%;
        }
      }
    `;
    document.head.appendChild(style);
    loader = document.createElement('div');
    loader.id = 'trainer-route-loader';
    loader.setAttribute('aria-live', 'polite');
    loader.innerHTML = `
      <div class="trainer-route-loader-card">
        <div class="trainer-route-loader-eyebrow">Loading coach site</div>
        <div class="trainer-route-loader-title" id="trainer-route-loader-title">Coach website</div>
        <div class="trainer-route-loader-sub" id="trainer-route-loader-sub">Preparing the coaching website.</div>
        <div class="trainer-route-loader-meta">
          <span id="trainer-route-loader-stage">Preparing</span>
          <span class="trainer-route-loader-percent" id="trainer-route-loader-percent">0%</span>
        </div>
        <div class="trainer-route-loader-bar" aria-hidden="true">
          <div class="trainer-route-loader-fill" id="trainer-route-loader-fill"></div>
        </div>
      </div>
    `;
    document.body.appendChild(loader);
    return loader;
  }

  function showTrainerRouteLoader(trainer = pageState.trainer) {
    if (!pageState.requestedPublicRoute) return;
    const loader = ensureTrainerRouteLoader();
    const name = resolveTrainerRouteLoaderName(trainer);
    const title = loader.querySelector('#trainer-route-loader-title');
    const sub = loader.querySelector('#trainer-route-loader-sub');
    const stage = loader.querySelector('#trainer-route-loader-stage');
    const percent = loader.querySelector('#trainer-route-loader-percent');
    const fill = loader.querySelector('#trainer-route-loader-fill');
    loader.style.setProperty('--trainer-loader-accent', resolveTrainerRouteLoaderAccent(trainer));
    if (title) title.textContent = `${name} website`;
    if (sub) sub.textContent = `Loading ${name}'s coaching website and preparing the page.`;
    if (stage) stage.textContent = 'Preparing';
    if (percent) percent.textContent = '0%';
    if (fill) fill.style.width = '0%';
    window.clearTimeout(pageState.routeLoaderHideTimer || 0);
    window.clearInterval(pageState.routeLoaderProgressTimer || 0);
    pageState.routeLoaderHideTimer = 0;
    pageState.routeLoaderProgressTimer = 0;
    pageState.routeLoaderVisible = true;
    pageState.routeLoaderStartedAt = Date.now();
    pageState.routeLoaderProgressValue = 0;
    loader.classList.remove('is-hiding', 'is-complete');
    loader.classList.add('is-visible');
    document.body.classList.add('trainer-route-loading');
    pageState.routeLoaderProgressTimer = window.setInterval(() => {
      const next = Math.min(94, pageState.routeLoaderProgressValue + (pageState.routeLoaderProgressValue < 24
        ? 6
        : pageState.routeLoaderProgressValue < 58
          ? 4
          : pageState.routeLoaderProgressValue < 82
            ? 2
            : 1));
      pageState.routeLoaderProgressValue = next;
      if (fill) fill.style.width = `${next}%`;
      if (percent) percent.textContent = `${next}%`;
      if (stage) {
        stage.textContent = next < 28
          ? 'Preparing'
          : next < 62
            ? 'Loading'
            : 'Finishing';
      }
      if (next >= 94 && pageState.routeLoaderProgressTimer) {
        window.clearInterval(pageState.routeLoaderProgressTimer);
        pageState.routeLoaderProgressTimer = 0;
      }
    }, 90);
  }

  function hideTrainerRouteLoader() {
    const loader = document.getElementById('trainer-route-loader');
    if (!loader || !pageState.routeLoaderVisible) return;
    const fill = loader.querySelector('#trainer-route-loader-fill');
    const percent = loader.querySelector('#trainer-route-loader-percent');
    const stage = loader.querySelector('#trainer-route-loader-stage');
    const elapsed = Date.now() - Number(pageState.routeLoaderStartedAt || 0);
    const waitMs = Math.max(0, 1100 - elapsed);
    window.clearInterval(pageState.routeLoaderProgressTimer || 0);
    pageState.routeLoaderProgressTimer = 0;
    pageState.routeLoaderProgressValue = 100;
    if (fill) fill.style.width = '100%';
    if (percent) percent.textContent = '100%';
    if (stage) stage.textContent = 'Ready';
    window.clearTimeout(pageState.routeLoaderHideTimer || 0);
    pageState.routeLoaderHideTimer = window.setTimeout(() => {
      loader.classList.add('is-complete', 'is-hiding');
      loader.classList.remove('is-visible');
      document.body.classList.remove('trainer-route-loading');
      pageState.routeLoaderHideTimer = window.setTimeout(() => {
        pageState.routeLoaderVisible = false;
        pageState.routeLoaderHideTimer = 0;
        renderCurrentProfile();
        flushPendingStandaloneEditorOpen();
      }, 460);
    }, waitMs);
  }

  function formatStandaloneRouteLabel(value = '') {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function extractStandaloneQuickLinkChoices(rawHtml = '') {
    const parsed = extractCombinedCodeParts(rawHtml);
    const html = String(parsed?.html || rawHtml || '').trim();
    if (!html || typeof document === 'undefined') return [];
    const template = document.createElement('template');
    template.innerHTML = html;
    const root = template.content;
    const choices = [];
    const seen = new Set();
    const scripts = Array.from(root.querySelectorAll('script')).map((node) => String(node.textContent || '')).join('\n');
    const scrollFunctionTargets = new Map();
    scripts.replace(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{[\s\S]*?getElementById\(\s*['"]([^'"]+)['"]\s*\)/g, (_, fnName, targetId) => {
      scrollFunctionTargets.set(String(fnName || '').trim(), String(targetId || '').trim());
      return _;
    });
    const textFor = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
    const normalizedSourceTagForRouteNode = (node, fallback = 'Jump on this page') => {
      if (!(node instanceof Element)) return fallback;
      if (node.closest('.cv-desktop-nav,.cv-mobile-nav,nav,header')) return 'Nav bar button';
      const className = String(node.getAttribute('class') || '').trim().toLowerCase();
      if (className.includes('nav')) return 'Nav bar button';
      return fallback;
    };
    const headingForId = (id) => {
      if (!id) return '';
      const target = root.querySelector(`#${CSS.escape(id)}`);
      if (!(target instanceof Element)) return formatStandaloneRouteLabel(id);
      const heading = target.querySelector('h1,h2,h3,h4,h5,h6,[data-route-label],.cv-section-tag');
      return textFor(heading) || formatStandaloneRouteLabel(id);
    };
    const pushChoice = (href, label, description, extra = {}) => {
      const normalizedHref = String(href || '').trim();
      const normalizedLabel = String(label || '').replace(/\s+/g, ' ').trim();
      const normalizedSourceTag = String(extra?.sourceTag || '').trim().toLowerCase();
      const dedupeKey = normalizedHref + '::' + normalizedLabel.toLowerCase();
      if (!normalizedHref || !normalizedLabel || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      choices.push({
        href: normalizedHref,
        label: normalizedLabel,
        description: String(description || '').trim(),
        onclick: String(extra?.onclick || '').trim(),
        sourceTag: normalizedSourceTag,
        priority: Number(extra?.priority) || 0
      });
    };

    root.querySelectorAll('[onclick], a[href^="#"]').forEach((node) => {
      if (!(node instanceof Element)) return;
      const hrefAttr = String(node.getAttribute('href') || '').trim();
      if (hrefAttr.startsWith('#') && hrefAttr.length > 1) {
        const id = hrefAttr.slice(1);
        const description = normalizedSourceTagForRouteNode(node, 'Jump on this page');
        pushChoice(hrefAttr, textFor(node) || headingForId(id), description, {
          sourceTag: String(node.tagName || '').trim().toLowerCase(),
          priority: /nav bar button/i.test(description) ? 30 : 20
        });
        return;
      }
      const onclick = String(node.getAttribute('onclick') || '').trim();
      const goMatch = onclick.match(/cvGo\(\s*['"]([^'"]+)['"]\s*\)/i);
      if (goMatch) {
        const id = String(goMatch[1] || '').trim();
        if (!id) return;
        const description = normalizedSourceTagForRouteNode(node, 'Jump on this page');
        pushChoice(`#${id}`, textFor(node) || headingForId(id), description, {
          onclick,
          sourceTag: String(node.tagName || '').trim().toLowerCase(),
          priority: /nav bar button/i.test(description) ? 30 : 20
        });
        return;
      }
      const scrollMatch = onclick.match(/([A-Za-z_$][\w$]*)\s*\(/);
      const targetId = scrollMatch ? scrollFunctionTargets.get(String(scrollMatch[1] || '').trim()) : '';
      if (targetId) {
        const description = normalizedSourceTagForRouteNode(node, 'Jump on this page');
        pushChoice(`#${targetId}`, textFor(node) || headingForId(targetId), description, {
          onclick,
          sourceTag: String(node.tagName || '').trim().toLowerCase(),
          priority: /nav bar button/i.test(description) ? 30 : 20
        });
      }
    });

    root.querySelectorAll('section[id], article[id], div[id]').forEach((node) => {
      if (!(node instanceof Element)) return;
      const id = String(node.id || '').trim();
      if (!id || /^standalone-|^trainer-/i.test(id) || /^cvMobileNav$/i.test(id)) return;
      pushChoice(`#${id}`, headingForId(id), 'Section on this page', { priority: 10 });
    });

    return choices.sort((a, b) => {
      const priorityDelta = (Number(b?.priority) || 0) - (Number(a?.priority) || 0);
      if (priorityDelta) return priorityDelta;
      return String(a?.label || '').localeCompare(String(b?.label || ''));
    });
  }

  function buildStandalonePreviewSrcdoc(rawHtml = '', { editable = false, viewportMode = 'responsive', desktopWidth = 1920, initialScroll = null } = {}) {
    const initialScrollX = Math.max(0, Math.round(Number(initialScroll?.x) || 0));
    const initialScrollY = Math.max(0, Math.round(Number(initialScroll?.y) || 0));
    // Applied inside the fresh document before the trainer can perceive a
    // jump to the top - undo/redo keeps them looking at the spot they edited.
    const initialScrollScript = (initialScrollX || initialScrollY) ? `
      <script id="standalone-initial-scroll">
        (function() {
          var targetX = ${initialScrollX};
          var targetY = ${initialScrollY};
          var tries = 0;
          var apply = function() {
            tries += 1;
            window.scrollTo(targetX, targetY);
            var maxY = Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
            if (tries < 24 && maxY < targetY) window.setTimeout(apply, 80);
          };
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
          else apply();
          window.addEventListener('load', apply);
        })();
      <\/script>
    ` : '';
    const parsed = extractCombinedCodeParts(rawHtml);
    const useDesktopViewport = String(viewportMode || '').trim().toLowerCase() === 'desktop';
    const viewportContent = useDesktopViewport
      ? `width=${Math.max(960, Number(desktopWidth) || 1920)}, initial-scale=1`
      : 'width=device-width, initial-scale=1';
    const standaloneRouteChoices = (() => {
      const quickLinks = extractStandaloneQuickLinkChoices(rawHtml);
      const pages = Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [];
      const activeSiteSlug = sanitizeHandle(
        pageState.currentTrainerPage?.siteSlug
        || editorState.draft?.siteSlug
        || pageState.trainer?.publicHandle
        || pageState.trainer?.username
        || ''
      );
      const scopedPages = activeSiteSlug
        ? pages.filter((page) => sanitizeHandle(page?.siteSlug || '') === activeSiteSlug)
        : pages.slice();
      const deduped = [];
      const pageRouteSeen = new Set();
      scopedPages.forEach((page) => {
        const href = builderPagePath(page);
        if (!href || pageRouteSeen.has(href)) return;
        pageRouteSeen.add(href);
        const pageSlug = slugify(page?.pageSlug || '');
        const label = String(page?.pageName || '').trim()
          || (pageSlug ? pageSlug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Home');
        deduped.push({
          href,
          label,
          description: pageSlug ? `/${pageSlug}` : 'Home page'
        });
      });
      const seen = new Set();
      const combined = [];
      quickLinks.concat(deduped).forEach((choice) => {
        const href = String(choice?.href || '').trim();
        if (!href || seen.has(href)) return;
        seen.add(href);
        combined.push(choice);
      });
      return combined;
    })();
    const rootLayoutGuardStyle = `<style id="standalone-root-layout-style">html,body{margin:0 !important;padding:0 !important;width:100%;min-height:100%;overflow-x:hidden;scrollbar-width:none;-ms-overflow-style:none;}html::-webkit-scrollbar,body::-webkit-scrollbar,#standalone-page-root::-webkit-scrollbar{width:0;height:0}body{display:flow-root;}:where(body){background:#fff;color:#111827;}#standalone-page-root{width:100%;min-height:100vh;display:flow-root;overflow-x:hidden;scrollbar-width:none;-ms-overflow-style:none;margin-left:auto !important;margin-right:auto !important;}#standalone-page-root::before{content:'';display:table;}#standalone-page-root::after{content:'';display:table;clear:both;}#standalone-page-root>:first-child{margin-top:0 !important;margin-left:auto !important;margin-right:auto !important;}</style>`;
    const viewportGuardStyle = useDesktopViewport
      ? `<style id="standalone-viewport-style">html,body{min-width:${Math.max(960, Number(desktopWidth) || 1920)}px !important;width:${Math.max(960, Number(desktopWidth) || 1920)}px !important;overflow-x:hidden !important;}body{max-width:none !important;}#standalone-page-root{width:${Math.max(960, Number(desktopWidth) || 1920)}px !important;min-width:${Math.max(960, Number(desktopWidth) || 1920)}px !important;min-height:100vh;}</style>`
      : '';
    const buttonEnhancementStyle = `<style id="standalone-button-enhancement-style">a[data-standalone-route-button="1"],.coach-custom-cta,.coach-custom-secondary,.coach-custom-price-grid a,.coach-custom-booking-card a,.coach-custom-footer-links a,.cv-main-btn,.cv-link-btn,.cv-vsl-side button,.cv-offer button,.cv-form button,.cv-desktop-nav .cv-nav-cta,.cv-mobile-nav .cv-mobile-cta{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 24px;border-radius:999px;border:1px solid rgba(99,102,241,.24);text-decoration:none;font:800 14px/1.15 system-ui,sans-serif;letter-spacing:.01em;cursor:pointer;transition:transform 140ms ease,box-shadow 140ms ease,filter 140ms ease,background-color 140ms ease,color 140ms ease,border-color 140ms ease;box-shadow:0 18px 34px rgba(15,23,42,.14),inset 0 1px 0 rgba(255,255,255,.2)}a[data-standalone-route-button="1"],.coach-custom-cta,.coach-custom-price-grid a,.coach-custom-booking-card a,.cv-main-btn,.cv-vsl-side button,.cv-form button,.cv-desktop-nav .cv-nav-cta,.cv-mobile-nav .cv-mobile-cta{background:linear-gradient(135deg,#1d4ed8 0%,#4f46e5 58%,#818cf8 100%) !important;color:#fff !important;border-color:rgba(99,102,241,.3) !important}.coach-custom-secondary,.coach-custom-footer-links a,.cv-link-btn,.cv-offer button{background:rgba(255,255,255,.08) !important;color:inherit !important;border-color:currentColor !important;box-shadow:none}#coachVSLWebsite .cv-link-btn{color:var(--cream) !important;background:rgba(255,255,255,.06) !important;border-color:rgba(217,255,66,.28) !important}#coachVSLWebsite .cv-offer button{color:var(--black) !important;background:rgba(16,16,16,.06) !important;border-color:rgba(16,16,16,.14) !important;min-height:46px;padding:0 18px}.coach-custom-footer-links a{min-height:44px;padding:0 18px;background:rgba(16,40,60,.06) !important;border-color:rgba(16,40,60,.12) !important;color:#10283c !important}#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta),#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta){border-radius:999px;border:1px solid transparent;transition:background-color 140ms ease,color 140ms ease,border-color 140ms ease,transform 140ms ease}a[data-standalone-route-button="1"]:hover,a[data-standalone-route-button="1"]:focus-visible,.coach-custom-cta:hover,.coach-custom-cta:focus-visible,.coach-custom-secondary:hover,.coach-custom-secondary:focus-visible,.coach-custom-price-grid a:hover,.coach-custom-price-grid a:focus-visible,.coach-custom-booking-card a:hover,.coach-custom-booking-card a:focus-visible,.coach-custom-footer-links a:hover,.coach-custom-footer-links a:focus-visible,.cv-main-btn:hover,.cv-main-btn:focus-visible,.cv-link-btn:hover,.cv-link-btn:focus-visible,.cv-vsl-side button:hover,.cv-vsl-side button:focus-visible,.cv-offer button:hover,.cv-offer button:focus-visible,.cv-form button:hover,.cv-form button:focus-visible,.cv-desktop-nav .cv-nav-cta:hover,.cv-desktop-nav .cv-nav-cta:focus-visible,.cv-mobile-nav .cv-mobile-cta:hover,.cv-mobile-nav .cv-mobile-cta:focus-visible,#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta):hover,#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta):focus-visible,#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta):hover,#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta):focus-visible{transform:translateY(-1px);filter:brightness(1.03)}a[data-standalone-route-button="1"]:hover,a[data-standalone-route-button="1"]:focus-visible,.coach-custom-cta:hover,.coach-custom-cta:focus-visible,.coach-custom-price-grid a:hover,.coach-custom-price-grid a:focus-visible,.coach-custom-booking-card a:hover,.coach-custom-booking-card a:focus-visible,.cv-main-btn:hover,.cv-main-btn:focus-visible,.cv-vsl-side button:hover,.cv-vsl-side button:focus-visible,.cv-form button:hover,.cv-form button:focus-visible,.cv-desktop-nav .cv-nav-cta:hover,.cv-desktop-nav .cv-nav-cta:focus-visible,.cv-mobile-nav .cv-mobile-cta:hover,.cv-mobile-nav .cv-mobile-cta:focus-visible{box-shadow:0 24px 44px rgba(37,99,235,.24),inset 0 1px 0 rgba(255,255,255,.24)}.coach-custom-secondary:hover,.coach-custom-secondary:focus-visible,.coach-custom-footer-links a:hover,.coach-custom-footer-links a:focus-visible,.cv-link-btn:hover,.cv-link-btn:focus-visible,.cv-offer button:hover,.cv-offer button:focus-visible,#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta):hover,#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta):focus-visible,#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta):hover,#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta):focus-visible{background:rgba(255,255,255,.12) !important}a[data-standalone-route-button="1"]:focus-visible,.coach-custom-cta:focus-visible,.coach-custom-secondary:focus-visible,.coach-custom-price-grid a:focus-visible,.coach-custom-booking-card a:focus-visible,.coach-custom-footer-links a:focus-visible,.cv-main-btn:focus-visible,.cv-link-btn:focus-visible,.cv-vsl-side button:focus-visible,.cv-offer button:focus-visible,.cv-form button:focus-visible,.cv-desktop-nav button:focus-visible,.cv-mobile-nav button:focus-visible{outline:2px solid rgba(129,140,248,.9);outline-offset:3px}#coachVSLWebsite .cv-mobile-nav .cv-mobile-cta{width:100%}#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta){justify-content:flex-start;text-align:left;padding:0 16px;background:rgba(16,16,16,.02)}@media (max-width:760px){a[data-standalone-route-button="1"],.coach-custom-cta,.coach-custom-secondary,.coach-custom-price-grid a,.coach-custom-booking-card a,.coach-custom-footer-links a,.cv-main-btn,.cv-link-btn,.cv-vsl-side button,.cv-offer button,.cv-form button,.cv-mobile-nav .cv-mobile-cta{width:100%}}</style>`;
    const standaloneInlineScriptExecutor = (scriptBlocks = [], errorElementId = 'standalone-runtime-error') => {
      const blocks = Array.isArray(scriptBlocks)
        ? scriptBlocks.map((block) => String(block || '')).filter((block) => block.trim())
        : [];
      if (!blocks.length) return '';
      return `
        <script>
          (function() {
            const blocks = ${JSON.stringify(blocks)};
            const errorEl = document.getElementById(${JSON.stringify(errorElementId)});
            const showScriptError = function(error) {
              if (!errorEl) return;
              const message = error && error.message ? error.message : String(error || 'Code error');
              errorEl.textContent = message;
              errorEl.classList.add('show');
            };
            blocks.forEach(function(block, index) {
              try {
                window.eval(String(block || '') + '\\n//# sourceURL=about:srcdoc-inline-script-' + (index + 1) + '.js');
              } catch (error) {
                showScriptError(error);
              }
            });
          })();
        <\/script>
      `.trim();
    };
    const bridgeStyle = editable
      ? '<style id="standalone-bridge-style">html,body,*{scrollbar-width:none;-ms-overflow-style:none}*::-webkit-scrollbar{width:0;height:0}[data-standalone-selected="1"]{outline:2px solid #2563eb !important;outline-offset:2px !important;}[data-standalone-selected="1"][data-standalone-rim-hover="1"][data-standalone-rim-cursor="n"]{cursor:n-resize !important;}[data-standalone-selected="1"][data-standalone-rim-hover="1"][data-standalone-rim-cursor="s"]{cursor:s-resize !important;}[data-standalone-selected="1"][data-standalone-rim-hover="1"][data-standalone-rim-cursor="e"]{cursor:e-resize !important;}[data-standalone-selected="1"][data-standalone-rim-hover="1"][data-standalone-rim-cursor="w"]{cursor:w-resize !important;}[data-standalone-selected="1"][data-standalone-rim-hover="1"][data-standalone-rim-cursor="ne"]{cursor:ne-resize !important;}[data-standalone-selected="1"][data-standalone-rim-hover="1"][data-standalone-rim-cursor="nw"]{cursor:nw-resize !important;}[data-standalone-selected="1"][data-standalone-rim-hover="1"][data-standalone-rim-cursor="se"]{cursor:se-resize !important;}[data-standalone-selected="1"][data-standalone-rim-hover="1"][data-standalone-rim-cursor="sw"]{cursor:sw-resize !important;}[data-standalone-selected="1"]:not([data-standalone-rim-hover="1"]){cursor:grab !important;}[data-standalone-selected="1"][data-standalone-dragging="1"]{cursor:grabbing !important;}[data-standalone-editing="1"]{cursor:text !important;}[data-shape-handle]{cursor:move !important}#standalone-context-menu{position:absolute;z-index:2147483647;display:none;min-width:220px;padding:8px;border-radius:14px;background:rgba(15,23,42,.96);border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 48px rgba(0,0,0,.28);backdrop-filter:blur(12px);overflow:visible}#standalone-context-menu[data-menu-drag-hover="1"]{cursor:grab}#standalone-context-menu[data-menu-dragging="1"]{cursor:grabbing}#standalone-context-menu .menu-row{position:relative}#standalone-context-menu button[data-menu-action]>span{float:right;margin-left:8px;color:#94a3b8}#standalone-context-menu button{display:block;width:100%;min-height:38px;padding:10px 12px;border:0;border-radius:10px;background:transparent;color:#f8fafc;font:700 13px/1.2 system-ui,sans-serif;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#standalone-context-menu button:hover,#standalone-context-menu .menu-row.is-open>button{background:rgba(255,255,255,.08)}#standalone-context-menu hr{margin:6px 0;border:0;border-top:1px solid rgba(255,255,255,.08)}#standalone-context-menu .shape-submenu,#standalone-context-menu .route-submenu{position:absolute;left:calc(100% + 2px);top:-8px;display:none;min-width:190px;padding:8px;border-radius:14px;background:rgba(15,23,42,.98);border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 48px rgba(0,0,0,.28)}#standalone-context-menu .shape-submenu::before,#standalone-context-menu .route-submenu::before{content:\"\";position:absolute;left:-22px;top:0;bottom:0;width:26px}#standalone-context-menu .shape-submenu{min-width:190px}#standalone-context-menu .route-submenu{width:360px;max-height:min(76vh,480px);padding:14px;gap:12px;flex-direction:column;overflow:hidden;box-sizing:border-box}#standalone-context-menu .route-submenu[data-side=\"left\"]{left:auto;right:calc(100% + 2px)}#standalone-context-menu .menu-row.is-open .shape-submenu,#standalone-context-menu .menu-row.is-open .route-submenu{display:flex}#standalone-context-menu .route-submenu-title{font:800 12px/1.2 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#cbd5e1;padding:2px 4px 0}#standalone-context-menu .route-submenu-scroll{display:block;min-height:0;max-height:none;overflow-y:auto;padding-right:4px;flex:1 1 auto}#standalone-context-menu .route-submenu-scroll>*{margin:0 0 8px}#standalone-context-menu .route-submenu-scroll>*:last-child{margin-bottom:0}#standalone-context-menu .route-submenu-empty{padding:16px;border-radius:10px;background:rgba(255,255,255,.02);border:1px dashed rgba(255,255,255,.1);font:500 12px/1.6 system-ui,sans-serif;color:#94a3b8;text-align:center}#standalone-context-menu button.route-submenu-item{display:block;width:100%;height:auto;min-height:0;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);text-align:left;transition:all .12s ease;text-decoration:none;white-space:normal;overflow:visible;text-overflow:clip}#standalone-context-menu button.route-submenu-item strong{display:block;margin:0 0 6px;font:700 13px/1.35 system-ui,sans-serif;color:#f8fafc;white-space:normal;word-break:break-word}#standalone-context-menu button.route-submenu-item span{display:block;font:500 11px/1.45 system-ui,sans-serif;color:#cbd5e1;white-space:normal;word-break:break-word;max-height:44px;overflow:hidden}#standalone-context-menu button.route-submenu-item:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12)}#standalone-context-menu .route-submenu-footer{display:grid;gap:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08);flex:0 0 auto;background:linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,.98) 14px,rgba(15,23,42,.98) 100%)}#standalone-context-menu button.route-submenu-add{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:10px;border:2px dashed rgba(96,165,250,.4);background:rgba(96,165,250,.06);color:#60a5fa;font:700 13px/1.2 system-ui,sans-serif;cursor:pointer;flex:0 0 auto;transition:all .15s ease;width:100%}#standalone-context-menu button.route-submenu-add:hover{background:rgba(255,255,255,.08)}#standalone-context-menu .route-submenu-form{display:none;gap:8px;flex:0 0 auto}#standalone-context-menu .route-submenu-form.is-active{display:grid}#standalone-context-menu .route-submenu-form input{width:100%;min-height:42px;padding:0 12px;border-radius:10px;border:1px solid rgba(96,165,250,.3);background:rgba(15,23,42,.88);color:#f8fafc;font:600 13px/1.2 system-ui,sans-serif;outline:none;transition:all .15s ease}#standalone-context-menu .route-submenu-form input::placeholder{color:#94a3b8}#standalone-context-menu .route-submenu-form input:focus{border-color:rgba(96,165,250,.78);box-shadow:0 0 0 1px rgba(96,165,250,.28)}#standalone-context-menu .route-submenu-create{display:flex;align-items:center;justify-content:center;min-height:44px;width:100%;border:0;border-radius:10px;background:#2563eb;color:#fff;font:800 13px/1 system-ui,sans-serif;cursor:pointer;transition:background .15s ease}#standalone-context-menu .route-submenu-create:hover{background:#1d4ed8}#standalone-hover-delete{position:fixed;z-index:2147483647;display:none;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:999px;background:#dc2626;color:#fff;box-shadow:0 16px 30px rgba(220,38,38,.32);cursor:pointer;transform:translate(-50%,-50%)}#standalone-hover-delete:hover{background:#b91c1c}#standalone-hover-delete svg{width:18px;height:18px;pointer-events:none}#standalone-marquee{position:fixed;z-index:2147483646;display:none;border:1px solid rgba(37,99,235,.9);background:rgba(37,99,235,.12);pointer-events:none}[data-standalone-drop-target="1"]{outline:3px dashed #16a34a !important;outline-offset:-3px !important;}</style>'
      : '';
    const bridgeScript = String.raw`
      <script id="standalone-bridge-script">
        (function(){
          const errorEl = document.getElementById('standalone-runtime-error');
          function defineStringProperty(target, key, fallback) {
            if (!target || typeof target !== 'object') return;
            if (typeof target[key] === 'string') return;
            try {
              Object.defineProperty(target, key, {
                configurable: true,
                enumerable: false,
                value: fallback
              });
            } catch {}
          }
          function sanitizeKeydownEvent(event) {
            if (!event || typeof event !== 'object') return;
            defineStringProperty(event, 'key', '');
            defineStringProperty(event, 'code', '');
            defineStringProperty(event, 'keyIdentifier', '');
          }
          function shouldSuppressExternalKeydownError(err, source) {
            const message = String(err?.message || '').toLowerCase();
            const stack = String(err?.stack || '').toLowerCase();
            const sourceText = String(source || '').toLowerCase();
            const readsLength = message.includes("reading 'length'") || message.includes('reading "length"');
            const keydownStack = stack.includes('handlekeydown') || stack.includes('keydown');
            if (stack.includes('page-events.js') || sourceText.includes('page-events.js')) return true;
            if (readsLength && (keydownStack || sourceText.includes('page-events'))) return true;
            return false;
          }
          function showRuntimeError(message) {
            if (!errorEl) return;
            errorEl.textContent = String(message || 'Code error');
            errorEl.classList.add('show');
          }
          window.addEventListener('keydown', sanitizeKeydownEvent, true);
          document.addEventListener('keydown', sanitizeKeydownEvent, true);
          window.addEventListener('error', function(event) {
            if (shouldSuppressExternalKeydownError(event?.error, event?.filename || event?.message || '')) {
              event.preventDefault?.();
              event.stopImmediatePropagation?.();
              return;
            }
            showRuntimeError(event && event.message ? event.message : 'JavaScript error');
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
          }, true);
          window.addEventListener('unhandledrejection', function(event) {
            if (shouldSuppressExternalKeydownError(event?.reason, event?.reason?.stack || event?.reason?.message || '')) {
              event.preventDefault?.();
              event.stopImmediatePropagation?.();
              return;
            }
            const reason = event && event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled promise rejection';
            showRuntimeError(reason);
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
          }, true);
          if (!${editable ? 'true' : 'false'}) return;
          const rootEl = document.getElementById('standalone-page-root') || document.body || document.documentElement;
          const standaloneRouteChoices = ${JSON.stringify(standaloneRouteChoices)};
          const contextMenuEl = document.createElement('div');
          contextMenuEl.id = 'standalone-context-menu';
          contextMenuEl.innerHTML = '<button type="button" data-menu-action="front">Bring to front</button><button type="button" data-menu-action="back">Send to back</button><hr><div class="menu-row" data-shape-row><button type="button" data-menu-action="shape">Add shape <span>›</span></button><div class="shape-submenu"><button type="button" data-menu-action="shape_rectangle">Rectangle</button><button type="button" data-menu-action="shape_circle">Circle</button><button type="button" data-menu-action="shape_triangle">Triangle</button><button type="button" data-menu-action="shape_diamond">Diamond</button><button type="button" data-menu-action="shape_pill">Pill</button><button type="button" data-menu-action="shape_custom">Custom polygon</button></div></div><button type="button" data-menu-action="message">Add custom message</button><button type="button" data-menu-action="button">Add button</button><button type="button" data-menu-action="image">Add image</button><button type="button" data-menu-action="video">Add video</button><button type="button" data-menu-action="form">Add consultation form</button>';
          document.body.appendChild(contextMenuEl);
          const hoverCursorStyleEl = document.createElement('style');
          hoverCursorStyleEl.id = 'standalone-hover-cursor-style';
          hoverCursorStyleEl.textContent = '[data-standalone-hover-target="1"][data-standalone-rim-cursor="n"]{cursor:n-resize !important;}[data-standalone-hover-target="1"][data-standalone-rim-cursor="s"]{cursor:s-resize !important;}[data-standalone-hover-target="1"][data-standalone-rim-cursor="e"]{cursor:e-resize !important;}[data-standalone-hover-target="1"][data-standalone-rim-cursor="w"]{cursor:w-resize !important;}[data-standalone-hover-target="1"][data-standalone-rim-cursor="ne"]{cursor:ne-resize !important;}[data-standalone-hover-target="1"][data-standalone-rim-cursor="nw"]{cursor:nw-resize !important;}[data-standalone-hover-target="1"][data-standalone-rim-cursor="se"]{cursor:se-resize !important;}[data-standalone-hover-target="1"][data-standalone-rim-cursor="sw"]{cursor:sw-resize !important;}';
          document.head.appendChild(hoverCursorStyleEl);
          contextMenuEl.querySelector('button[data-menu-action="back"]')?.insertAdjacentHTML('afterend', '<hr><button type="button" data-menu-action="layout_block">Block</button><button type="button" data-menu-action="layout_inline">Inline</button><button type="button" data-menu-action="layout_over">Over</button>');
          contextMenuEl.querySelector('button[data-menu-action="layout_over"]')?.insertAdjacentHTML('afterend', '<div data-button-align-group hidden><hr><button type="button" data-menu-action="button_align_left">Text left</button><button type="button" data-menu-action="button_align_center">Text center</button><button type="button" data-menu-action="button_align_right">Text right</button><button type="button" data-menu-action="button_align_top">Text top</button><button type="button" data-menu-action="button_align_middle">Text middle</button><button type="button" data-menu-action="button_align_bottom">Text bottom</button></div>');
          const shapeRowEl = contextMenuEl.querySelector('[data-shape-row]');
          const addButtonTriggerEl = contextMenuEl.querySelector('button[data-menu-action="button"]');
          const buttonAlignGroupEl = contextMenuEl.querySelector('[data-button-align-group]');
          const buttonRouteRowEl = document.createElement('div');
          buttonRouteRowEl.className = 'menu-row';
          buttonRouteRowEl.setAttribute('data-button-route-row', '');
          const routePickerEl = document.createElement('div');
          routePickerEl.className = 'route-submenu';
          routePickerEl.id = 'standalone-route-picker';
          if (addButtonTriggerEl && addButtonTriggerEl.parentElement) {
            addButtonTriggerEl.innerHTML = 'Add button <span>&#8250;</span>';
            addButtonTriggerEl.parentElement.insertBefore(buttonRouteRowEl, addButtonTriggerEl);
            buttonRouteRowEl.appendChild(addButtonTriggerEl);
            buttonRouteRowEl.appendChild(routePickerEl);
          }
          let activeEl = null;
          let hoveredResizeEl = null;
          let editingText = false;
          let originalText = '';
          let dragging = false;
          let resizing = false;
          let activeResizeHandle = '';
          let suppressClick = false;
          let startX = 0;
          let startY = 0;
          let baseLeft = 0;
          let baseTop = 0;
          let baseWidth = 0;
          let baseHeight = 0;
          let baseFontSize = 16;
          let editingShapeHandle = null;
          let clipboardMarkup = '';
          let pendingDrag = false;
          let selectedEls = [];
          let marqueeSelecting = false;
          let marqueeStartX = 0;
          let marqueeStartY = 0;
          let marqueeHasMoved = false;
          let groupDragItems = [];
          let lastTouchTapAt = 0;
          let lastTouchTapTarget = null;
          let draggingContextMenu = false;
          let contextMenuDragOffsetX = 0;
          let contextMenuDragOffsetY = 0;
          let parentVisibleTop = 0;
          let parentVisibleBottom = 0;
          function visibleViewportBand() {
            const rawHeight = Math.max(0, window.innerHeight || document.documentElement?.clientHeight || 0);
            const bottom = parentVisibleBottom > 160 ? Math.min(rawHeight, parentVisibleBottom) : rawHeight;
            const top = Math.min(Math.max(0, parentVisibleTop), Math.max(0, bottom - 200));
            return { top, bottom };
          }
          const marqueeEl = document.createElement('div');
          marqueeEl.id = 'standalone-marquee';
          document.body.appendChild(marqueeEl);
          function hideContextMenu() {
            contextMenuEl.style.display = 'none';
            shapeRowEl?.classList.remove('is-open');
            buttonRouteRowEl?.classList.remove('is-open');
            routePickerEl?.querySelector('.route-submenu-form')?.classList.remove('is-active');
          }
          function escapeRouteMenuText(value) {
            return String(value || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          }
          function normalizeCustomRouteHref(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^(https?:|mailto:|tel:|#|\/)/i.test(raw)) return raw;
            return '/' + raw.replace(/^\/+/,'');
          }
          function createStyledActionLink(label, href, options) {
            const extra = options && typeof options === 'object' ? options : {};
            const hrefValue = String(href || '').trim() || '#';
            const labelValue = String(label || '').replace(/\s+/g, ' ').trim() || 'New button';
            const routeKind = hrefValue.startsWith('#')
              ? 'same-page'
              : (/^mailto:/i.test(hrefValue) ? 'email'
                : (/^tel:/i.test(hrefValue) ? 'phone'
                  : (/^https?:/i.test(hrefValue) ? 'external'
                    : (/^\/coach\//i.test(hrefValue) ? 'coach-page' : 'internal'))));
            const link = document.createElement('a');
            link.textContent = labelValue;
            link.setAttribute('data-standalone-route-href', hrefValue);
            link.setAttribute('data-standalone-route-button', '1');
            link.setAttribute('data-standalone-route-kind', routeKind);
            if (extra && extra.sourceTag) link.setAttribute('data-standalone-route-source', String(extra.sourceTag || '').trim());
            link.href = hrefValue;
            link.style.position = 'relative';
            link.style.display = 'inline-flex';
            link.style.alignItems = 'center';
            link.style.justifyContent = 'center';
            link.style.gap = '10px';
            link.style.maxWidth = '100%';
            link.style.minHeight = '54px';
            link.style.padding = '0 24px';
            link.style.margin = '16px 0';
            link.style.boxSizing = 'border-box';
            link.style.alignSelf = 'flex-start';
            link.style.borderRadius = '999px';
            link.style.border = '1px solid rgba(99,102,241,.28)';
            link.style.background = 'linear-gradient(135deg,#1d4ed8 0%,#4f46e5 55%,#818cf8 100%)';
            link.style.color = '#ffffff';
            link.style.textDecoration = 'none';
            link.style.font = '800 15px/1.15 system-ui,sans-serif';
            link.style.letterSpacing = '0.01em';
            link.style.whiteSpace = 'normal';
            link.style.wordBreak = 'break-word';
            link.style.textAlign = 'center';
            link.style.cursor = 'pointer';
            link.style.boxShadow = '0 18px 34px rgba(37,99,235,.28), inset 0 1px 0 rgba(255,255,255,.22)';
            link.style.transition = 'transform 140ms ease, box-shadow 140ms ease, filter 140ms ease';
            link.style.filter = 'saturate(1.04)';
            return link;
          }
          function preferredDisplayForLayout(node, mode) {
            if (!(node instanceof HTMLElement)) return mode === 'inline' ? 'inline-block' : 'block';
            const inlineStyleDisplay = String(node.style.display || '').trim().toLowerCase();
            const computedDisplay = String(window.getComputedStyle(node).display || '').trim().toLowerCase();
            const currentDisplay = inlineStyleDisplay || computedDisplay;
            if (currentDisplay === 'inline-flex' || currentDisplay === 'flex') return currentDisplay;
            if (isButtonLikeNode(node)) return mode === 'block' ? 'inline-flex' : 'inline-flex';
            if (mode === 'inline') return 'inline-block';
            return 'block';
          }
          function isButtonLikeNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            if (tag === 'button') return true;
            if (tag === 'a' && (node.hasAttribute('href') || node.hasAttribute('onclick'))) return true;
            const role = String(node.getAttribute('role') || '').trim().toLowerCase();
            if (role === 'button' || role === 'link') return true;
            if (tag === 'input') {
              const type = String(node.getAttribute('type') || '').trim().toLowerCase();
              return ['button', 'submit', 'reset'].includes(type);
            }
            return false;
          }
          function ensureButtonContentLayout(node) {
            if (!(node instanceof HTMLElement) || !isButtonLikeNode(node)) return;
            const display = String(window.getComputedStyle(node).display || '').trim().toLowerCase();
            if (!display.includes('flex')) node.style.display = display.includes('inline') ? 'inline-flex' : 'flex';
            node.style.boxSizing = 'border-box';
          }
          function applyButtonContentAlignment(node, action) {
            if (!(node instanceof HTMLElement) || !isButtonLikeNode(node)) return;
            ensureButtonContentLayout(node);
            if (action === 'button_align_left') {
              node.style.justifyContent = 'flex-start';
              node.style.textAlign = 'left';
              return;
            }
            if (action === 'button_align_center') {
              node.style.justifyContent = 'center';
              node.style.textAlign = 'center';
              return;
            }
            if (action === 'button_align_right') {
              node.style.justifyContent = 'flex-end';
              node.style.textAlign = 'right';
              return;
            }
            if (action === 'button_align_top') {
              node.style.alignItems = 'flex-start';
              return;
            }
            if (action === 'button_align_middle') {
              node.style.alignItems = 'center';
              return;
            }
            if (action === 'button_align_bottom') {
              node.style.alignItems = 'flex-end';
            }
          }
          function currentLayoutMode(node) {
            if (!(node instanceof HTMLElement)) return 'over';
            if (isBlockContainerNode(node) || isSectionLikeNode(node)) return 'block';
            const explicit = String(node.getAttribute('data-standalone-layout') || '').trim().toLowerCase();
            if (explicit === 'block' || explicit === 'inline' || explicit === 'over') return explicit;
            const style = window.getComputedStyle(node);
            if (style.position === 'absolute' || style.position === 'fixed') return 'over';
            if (style.display === 'block' && node.parentElement === rootEl) return 'block';
            return 'over';
          }
          function syncContextMenuOptions() {
            if (buttonAlignGroupEl) buttonAlignGroupEl.hidden = !isButtonLikeNode(activeEl);
            const formTrigger = contextMenuEl.querySelector('button[data-menu-action="form"]');
            if (formTrigger) {
              const hasConsultForm = Boolean(findConsultationForm());
              formTrigger.textContent = hasConsultForm ? 'Modify consultation form' : 'Add consultation form';
              formTrigger.setAttribute('data-form-mode', hasConsultForm ? 'modify' : 'add');
            }
            const layoutButtons = {
              block: contextMenuEl.querySelector('button[data-menu-action="layout_block"]'),
              inline: contextMenuEl.querySelector('button[data-menu-action="layout_inline"]'),
              over: contextMenuEl.querySelector('button[data-menu-action="layout_over"]')
            };
            const activeMode = currentLayoutMode(activeEl);
            if (layoutButtons.block) layoutButtons.block.textContent = (activeMode === 'block' ? '\u2713 ' : '') + 'Block';
            if (layoutButtons.inline) layoutButtons.inline.textContent = (activeMode === 'inline' ? '\u2713 ' : '') + 'Embedded';
            if (layoutButtons.over) layoutButtons.over.textContent = (activeMode === 'over' ? '\u2713 ' : '') + 'Over';
          }
          function ensureRoutePickerRendered() {
            if (!routePickerEl || routePickerEl.dataset.routePickerReady === '1') return;
            const routeButtons = standaloneRouteChoices.map((route, index) => (
              '<button type="button" class="route-submenu-item" data-route-select="' + index + '">'
              + '<strong>' + escapeRouteMenuText(route.label || 'Route') + '</strong>'
              + '<span>' + escapeRouteMenuText(route.description || route.href || '') + '</span>'
              + '</button>'
            )).join('');
            const listMarkup = routeButtons || '<div class="route-submenu-empty">No automatic routes were found on this page yet. Use Add route to create a custom destination.</div>';
            routePickerEl.innerHTML = ''
              + '<div class="route-submenu-title">Button route</div>'
              + '<div class="route-submenu-scroll">' + listMarkup + '</div>'
              + '<div class="route-submenu-footer">'
              + '<button type="button" class="route-submenu-add" data-route-add-toggle="1">Add route</button>'
              + '<div class="route-submenu-form">'
              + '<input type="text" data-route-url-input="1" placeholder="https://example.com, /new-page, or /coach/site/page#section" aria-label="Route URL">'
              + '<input type="text" data-route-label-input="1" placeholder="Button label" aria-label="Button label">'
              + '<button type="button" class="route-submenu-create" data-route-create="1">Create button</button>'
              + '</div>'
              + '</div>';
            routePickerEl.dataset.routePickerReady = '1';
          }
          function openRoutePicker() {
            ensureRoutePickerRendered();
            const form = routePickerEl?.querySelector('.route-submenu-form');
            if (form && !form.classList.contains('is-active')) {
              const hrefInput = routePickerEl.querySelector('[data-route-url-input="1"]');
              const labelInput = routePickerEl.querySelector('[data-route-label-input="1"]');
              if (hrefInput) hrefInput.value = '';
              if (labelInput) labelInput.value = '';
            }
            shapeRowEl?.classList.remove('is-open');
            buttonRouteRowEl?.classList.add('is-open');
            positionRoutePicker();
            window.requestAnimationFrame(positionRoutePicker);
          }
          function positionRoutePicker() {
            if (!routePickerEl || !buttonRouteRowEl?.classList.contains('is-open')) return;
            // Clamp inside the band the trainer can actually see: the parent
            // reports how much of this frame the window and code dock leave
            // visible.
            const band = visibleViewportBand();
            const viewportHeight = band.bottom;
            const viewportWidth = Math.max(0, window.innerWidth || document.documentElement?.clientWidth || 0);
            const safeMaxHeight = Math.max(240, Math.min(440, (band.bottom - band.top) - 56));
            routePickerEl.style.maxHeight = String(safeMaxHeight) + 'px';
            routePickerEl.style.left = 'calc(100% + 2px)';
            routePickerEl.style.right = 'auto';
            routePickerEl.dataset.side = 'right';
            routePickerEl.style.top = '-8px';
            const rect = routePickerEl.getBoundingClientRect();
            if (rect.right > (viewportWidth - 8)) {
              routePickerEl.style.left = 'auto';
              routePickerEl.style.right = 'calc(100% + 2px)';
              routePickerEl.dataset.side = 'left';
            }
            const nextRect = routePickerEl.getBoundingClientRect();
            const measuredRect = nextRect.width ? nextRect : rect;
            const overflowRight = measuredRect.right - viewportWidth;
            if (overflowRight > 0) {
              routePickerEl.style.right = Math.max(8, overflowRight + 8) + 'px';
            }
            const finalRect = routePickerEl.getBoundingClientRect();
            const menuRect = finalRect.width ? finalRect : measuredRect;
            const overflowBottom = menuRect.bottom - viewportHeight;
            const overflowTop = (band.top + 8) - menuRect.top;
            let top = -8;
            if (overflowBottom > 0) top -= overflowBottom + 8;
            if (overflowTop > 0) top += overflowTop;
            routePickerEl.style.top = String(top) + 'px';
          }
          function closeRoutePicker() {
            buttonRouteRowEl?.classList.remove('is-open');
            routePickerEl?.querySelector('.route-submenu-form')?.classList.remove('is-active');
            routePickerEl?.style.removeProperty('top');
            routePickerEl?.style.removeProperty('max-height');
            routePickerEl?.style.removeProperty('left');
            routePickerEl?.style.removeProperty('right');
            if (routePickerEl) routePickerEl.dataset.side = 'right';
          }
          addButtonTriggerEl?.addEventListener('mouseenter', openRoutePicker);
          addButtonTriggerEl?.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            openRoutePicker();
          });
          function showContextMenu(x, y) {
            syncContextMenuOptions();
            const menuWidth = 220;
            const menuHeight = 430;
            // The menu is absolutely positioned in the document so it scrolls
            // with the page content; clamp within the band of this frame the
            // trainer can actually see, then convert to document coordinates.
            const band = visibleViewportBand();
            const maxX = Math.max(8, (window.innerWidth || 0) - menuWidth - 12);
            const maxY = Math.max(band.top + 8, band.bottom - menuHeight - 12);
            const viewportX = Math.max(8, Math.min(Number(x || 0), maxX));
            const viewportY = Math.max(band.top + 8, Math.min(Number(y || 0), maxY));
            contextMenuEl.style.left = (viewportX + (window.scrollX || 0)) + 'px';
            contextMenuEl.style.top = (viewportY + (window.scrollY || 0)) + 'px';
            contextMenuEl.style.display = 'block';
          }
          function detectContextMenuDragZone(event) {
            if (!event || !contextMenuEl || contextMenuEl.style.display === 'none') return false;
            if (event.target instanceof Element && event.target.closest('button,hr,select,input,textarea,label,[data-menu-action],.shape-submenu,.route-submenu')) return false;
            const rect = contextMenuEl.getBoundingClientRect();
            const x = Number(event.clientX || 0) - rect.left;
            const y = Number(event.clientY || 0) - rect.top;
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) return false;
            const edge = Math.max(10, Math.min(18, Math.round(Math.min(rect.width, rect.height) * 0.14)));
            return x <= edge || x >= rect.width - edge || y <= edge || y >= rect.height - edge;
          }
          function syncContextMenuDragHover(event) {
            if (!contextMenuEl || contextMenuEl.style.display === 'none' || draggingContextMenu) {
              contextMenuEl?.removeAttribute('data-menu-drag-hover');
              return;
            }
            if (detectContextMenuDragZone(event)) contextMenuEl.setAttribute('data-menu-drag-hover', '1');
            else contextMenuEl.removeAttribute('data-menu-drag-hover');
          }
          function postSelection() {
            if (!activeEl) {
              hideHoverDelete();
              try {
                window.parent.postMessage({
                  type: 'trainer_standalone_selection_clear'
                }, '*');
              } catch {}
              return;
            }
            showHoverDelete(activeEl);
            try {
              const style = window.getComputedStyle(activeEl);
              const rect = activeEl.getBoundingClientRect();
              const markup = (() => {
                try {
                  const clone = activeEl.cloneNode(true);
                  if (!(clone instanceof HTMLElement)) return '';
                  clone.querySelectorAll('[data-standalone-selected],[data-standalone-rim-hover],[data-standalone-rim-cursor],[data-standalone-dragging],[data-standalone-editing],[contenteditable],[spellcheck],[data-standalone-hover-target]').forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    node.removeAttribute('data-standalone-selected');
                    node.removeAttribute('data-standalone-rim-hover');
                    node.removeAttribute('data-standalone-rim-cursor');
                    node.removeAttribute('data-standalone-dragging');
                    node.removeAttribute('data-standalone-editing');
                    node.removeAttribute('contenteditable');
                    node.removeAttribute('spellcheck');
                    node.removeAttribute('data-standalone-hover-target');
                  });
                  clone.removeAttribute('data-standalone-selected');
                  clone.removeAttribute('data-standalone-rim-hover');
                  clone.removeAttribute('data-standalone-rim-cursor');
                  clone.removeAttribute('data-standalone-dragging');
                  clone.removeAttribute('data-standalone-editing');
                  clone.removeAttribute('contenteditable');
                  clone.removeAttribute('spellcheck');
                  clone.removeAttribute('data-standalone-hover-target');
                  return String(clone.outerHTML || '').trim();
                } catch {
                  return '';
                }
              })();
              const openingTag = (() => {
                try {
                  const clone = activeEl.cloneNode(false);
                  if (!(clone instanceof HTMLElement)) return '';
                  const html = String(clone.outerHTML || '').trim();
                  const closeIndex = html.indexOf('>');
                  return closeIndex >= 0 ? html.slice(0, closeIndex + 1) : html;
                } catch {
                  return '';
                }
              })();
              const selectionColor = isShapeNode(activeEl)
                ? (shapeColor(activeEl) || String(style.color || activeEl.style.color || '').trim())
                : String(style.color || activeEl.style.color || '').trim();
              window.parent.postMessage({
                type: 'trainer_standalone_selection',
                id: String(activeEl.id || '').trim(),
                text: String(activeEl.textContent || '').trim(),
                nodePath: nodePathFromRoot(activeEl),
                markup,
                openingTag,
                bounds: {
                  left: Number(rect.left || 0),
                  top: Number(rect.top || 0),
                  right: Number(rect.right || 0),
                  bottom: Number(rect.bottom || 0),
                  width: Number(rect.width || 0),
                  height: Number(rect.height || 0)
                },
                fontSize: String(style.fontSize || activeEl.style.fontSize || '').trim(),
                color: selectionColor,
                backgroundColor: isShapeNode(activeEl)
                  ? (shapeColor(activeEl) || String(style.backgroundColor || activeEl.style.backgroundColor || activeEl.style.background || '').trim())
                  : String(activeEl.style.backgroundColor || activeEl.style.background || style.backgroundColor || '').trim(),
                fontWeight: String(style.fontWeight || activeEl.style.fontWeight || '').trim(),
                fontFamily: String(activeEl.style.fontFamily || style.fontFamily || '').trim(),
                fontStyle: String(style.fontStyle || activeEl.style.fontStyle || '').trim()
              }, '*');
            } catch {}
          }
          function selectedNodes() {
            selectedEls = selectedEls.filter((node) => node instanceof HTMLElement && node.isConnected);
            return selectedEls.slice();
          }
          function isSelectedNode(node) {
            return node instanceof HTMLElement && selectedNodes().includes(node);
          }
          function isEditableTarget(node) {
            if (!(node instanceof HTMLElement)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            if (!tag || ['html','body','head','script','style','meta','link','title'].includes(tag)) return false;
            return true;
          }
          function normalizeEditableNode(node) {
            const el = node instanceof Element ? node : null;
            if (!el) return null;
            const handleHost = el.closest?.('[data-standalone-custom-shape="1"]');
            if (handleHost && el.hasAttribute?.('data-shape-handle')) return handleHost;
            return el.closest ? el.closest('*') : el;
          }
          function nodePathFromRoot(node) {
            if (!(node instanceof Element) || !(rootEl instanceof Element)) return [];
            const path = [];
            let current = node;
            while (current && current !== rootEl) {
              const parent = current.parentElement;
              if (!(parent instanceof Element)) return [];
              const siblings = Array.from(parent.children || []);
              const index = siblings.indexOf(current);
              if (index < 0) return [];
              path.unshift(index);
              current = parent;
            }
            return current === rootEl ? path : [];
          }
          function isDirectSelectionTag(node) {
            if (!(node instanceof HTMLElement)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            return ['a','button','img','video','iframe','input','textarea','select','svg','polygon','path','circle','label','h1','h2','h3','h4','h5','h6','p','span','strong','em','small','li'].includes(tag);
          }
          function isInteractiveActionNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            if (tag === 'a' && node.hasAttribute('href')) return true;
            if (tag === 'button') return true;
            if (tag === 'input') {
              const type = String(node.getAttribute('type') || '').trim().toLowerCase();
              return ['button','submit','reset'].includes(type);
            }
            const role = String(node.getAttribute('role') || '').trim().toLowerCase();
            if (role === 'button' || role === 'link') return true;
            return node.hasAttribute('onclick');
          }
          function isSelectableLeafNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            if (isSectionLikeNode(node) || isBlockContainerNode(node) || isShapeNode(node)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            if (!['div','a','button','img','video','iframe','label','svg'].includes(tag)) return false;
            const style = window.getComputedStyle(node);
            const positioned = style.position === 'absolute' || style.position === 'fixed';
            return positioned || node.childElementCount === 0;
          }
          function isFreelyDraggableCompositeNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            if (isSectionLikeNode(node) || isBlockContainerNode(node) || isShapeNode(node)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            if (!['div','form','ul','ol'].includes(tag)) return false;
            return node.childElementCount > 0;
          }
          function nearestSectionLike(node) {
            if (!(node instanceof HTMLElement)) return null;
            const match = node.closest?.('section,article,nav,header,footer,main,aside');
            if (!(match instanceof HTMLElement)) return null;
            if (match === document.body || match === document.documentElement) return null;
            return match;
          }
          function nearestBlockContainer(node) {
            if (!(node instanceof HTMLElement)) return null;
            let current = node;
            while (current && current !== document.body && current !== document.documentElement) {
              if (isBlockContainerNode(current)) return current;
              current = current.parentElement;
            }
            return null;
          }
          function nearestAncestorBlockContainer(node) {
            if (!(node instanceof HTMLElement)) return null;
            return nearestBlockContainer(node.parentElement);
          }
          function isSectionLikeNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            return ['section','article','nav','header','footer','main','aside'].includes(tag);
          }
          function isBlockContainerNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            if (isShapeNode(node)) return false;
            if (isSectionLikeNode(node)) return true;
            const tag = String(node.tagName || '').toLowerCase();
            if (!['div','form','ul','ol'].includes(tag)) return false;
            if (node.childElementCount <= 0) return false;
            if (node === rootEl || node.id === 'standalone-page-root') return true;
            const parent = node.parentElement;
            return parent === rootEl || parent === document.body;
          }
          function isBlockLayoutNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            return isBlockContainerNode(node) || String(node.getAttribute('data-standalone-layout') || '').trim().toLowerCase() === 'block';
          }
          function isPointDeepInsideNode(node, event, inset = 6) {
            if (!(node instanceof HTMLElement) || !event) return false;
            const rect = node.getBoundingClientRect();
            const width = Number(rect.width || 0);
            const height = Number(rect.height || 0);
            if (!width || !height) return false;
            const safeInset = Math.max(0, Math.min(inset, Math.floor(Math.min(width, height) / 4)));
            const x = Number(event.clientX || 0);
            const y = Number(event.clientY || 0);
            return x > (rect.left + safeInset)
              && x < (rect.right - safeInset)
              && y > (rect.top + safeInset)
              && y < (rect.bottom - safeInset);
          }
          function resolveSelectionTarget(node, event) {
            const direct = normalizeEditableNode(node);
            if (!(direct instanceof HTMLElement)) return null;
            const prefersDirectSelection = isDirectSelectionTag(direct)
              || isSelectableLeafNode(direct)
              || (hasInlineText(direct) && direct.childElementCount <= 1);
            const pointerDeepInsideDirect = isPointDeepInsideNode(direct, event);
            const sectionTarget = nearestSectionLike(direct);
            const blockTarget = nearestBlockContainer(direct);
            const ancestorBlockTarget = nearestAncestorBlockContainer(direct);
            if (ancestorBlockTarget instanceof HTMLElement) {
              const ancestorBlockHandle = detectResizeHandle(ancestorBlockTarget, event);
              if (ancestorBlockHandle && (!prefersDirectSelection || !pointerDeepInsideDirect)) return ancestorBlockTarget;
            }
            if (blockTarget instanceof HTMLElement) {
              const blockHandle = detectResizeHandle(blockTarget, event);
              if (blockHandle && (!prefersDirectSelection || !pointerDeepInsideDirect)) return blockTarget;
            }
            if (isBlockContainerNode(direct)) return direct;
            if (sectionTarget instanceof HTMLElement) {
              const sectionHandle = detectResizeHandle(sectionTarget, event);
              if (sectionHandle && (!prefersDirectSelection || !pointerDeepInsideDirect)) return sectionTarget;
            }
            if (activeEl instanceof HTMLElement && activeEl.contains(direct)) {
              const activeHandle = detectResizeHandle(activeEl, event);
              if (activeHandle) return activeEl;
            }
            if (isFreelyDraggableCompositeNode(direct) && pointerDeepInsideDirect) return direct;
            if (isDirectSelectionTag(direct) || isSelectableLeafNode(direct)) return direct;
            if (sectionTarget instanceof HTMLElement && direct.parentElement === sectionTarget) return sectionTarget;
            if (hasInlineText(direct) && direct.childElementCount <= 1) return direct;
            return blockTarget || sectionTarget || direct;
          }
          function isShapeNode(node) {
            return node instanceof HTMLElement && (node.hasAttribute('data-standalone-shape') || node.hasAttribute('data-standalone-custom-shape'));
          }
          function hasInlineText(node) {
            if (!(node instanceof HTMLElement)) return false;
            const text = String(node.textContent || '').trim();
            if (!text) return false;
            const tag = String(node.tagName || '').toLowerCase();
            if (['input','textarea','select','option'].includes(tag)) return false;
            if (node.childElementCount === 0) return true;
            return Array.from(node.childNodes || []).some((child) => child && child.nodeType === Node.TEXT_NODE && String(child.textContent || '').trim());
          }
          function moveCaretToEnd(node) {
            if (!(node instanceof HTMLElement)) return;
            try {
              const selection = window.getSelection();
              if (!selection) return;
              const range = document.createRange();
              range.selectNodeContents(node);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            } catch {}
          }
          function detectResizeHandle(node, event) {
            if (!(node instanceof HTMLElement) || !event) return false;
            const rect = node.getBoundingClientRect();
            const width = Math.max(0, Number(rect.width || 0));
            const height = Math.max(0, Number(rect.height || 0));
            if (!width || !height) return '';
            const threshold = (() => {
              const base = Math.min(16, Math.max(8, Math.round(Math.min(width, height) * 0.18)));
              return isBlockContainerNode(node) ? base : Math.min(base, 4);
            })();
            const x = Number(event.clientX || 0) - rect.left;
            const y = Number(event.clientY || 0) - rect.top;
            if (x < 0 || y < 0 || x > width || y > height) return '';
            const nearLeft = x <= threshold;
            const nearRight = x >= width - threshold;
            const nearTop = y <= threshold;
            const nearBottom = y >= height - threshold;
            if (nearTop && nearLeft) return 'nw';
            if (nearTop && nearRight) return 'ne';
            if (nearBottom && nearLeft) return 'sw';
            if (nearBottom && nearRight) return 'se';
            if (nearTop) return 'n';
            if (nearBottom) return 's';
            if (nearLeft) return 'w';
            if (nearRight) return 'e';
            return '';
          }
          function syncRimHover(node, handle) {
            if (!(node instanceof HTMLElement)) return;
            if (handle) {
              node.setAttribute('data-standalone-rim-hover', '1');
              node.setAttribute('data-standalone-rim-cursor', handle);
              return;
            }
            node.removeAttribute('data-standalone-rim-hover');
            node.removeAttribute('data-standalone-rim-cursor');
          }
          function setHoveredResizeTarget(node, handle) {
            if (hoveredResizeEl && hoveredResizeEl !== node) {
              hoveredResizeEl.removeAttribute('data-standalone-hover-target');
              if (hoveredResizeEl !== activeEl) hoveredResizeEl.removeAttribute('data-standalone-rim-cursor');
            }
            if (!(node instanceof HTMLElement) || !handle) {
              if (hoveredResizeEl && hoveredResizeEl !== activeEl) hoveredResizeEl.removeAttribute('data-standalone-rim-cursor');
              hoveredResizeEl?.removeAttribute('data-standalone-hover-target');
              hoveredResizeEl = null;
              return;
            }
            hoveredResizeEl = node;
            hoveredResizeEl.setAttribute('data-standalone-hover-target', '1');
            hoveredResizeEl.setAttribute('data-standalone-rim-cursor', handle);
          }
          function setDraggingState(node, active) {
            if (!(node instanceof HTMLElement)) return;
            if (active) {
              node.setAttribute('data-standalone-dragging', '1');
              return;
            }
            node.removeAttribute('data-standalone-dragging');
          }
          function marqueeRect() {
            const left = Math.min(marqueeStartX, startX);
            const top = Math.min(marqueeStartY, startY);
            const right = Math.max(marqueeStartX, startX);
            const bottom = Math.max(marqueeStartY, startY);
            return { left, top, right, bottom, width: right - left, height: bottom - top };
          }
          function hideMarquee() {
            marqueeSelecting = false;
            marqueeHasMoved = false;
            marqueeEl.style.display = 'none';
          }
          function updateMarqueeBox() {
            const rect = marqueeRect();
            marqueeEl.style.display = 'block';
            marqueeEl.style.left = rect.left + 'px';
            marqueeEl.style.top = rect.top + 'px';
            marqueeEl.style.width = rect.width + 'px';
            marqueeEl.style.height = rect.height + 'px';
          }
          function nodeIntersectsMarquee(node) {
            if (!(node instanceof HTMLElement)) return false;
            const rect = node.getBoundingClientRect();
            const box = marqueeRect();
            return !(rect.right < box.left || rect.left > box.right || rect.bottom < box.top || rect.top > box.bottom);
          }
          function isMovableTarget(node) {
            if (!(node instanceof HTMLElement)) return false;
            if (!isEditableTarget(node)) return false;
            if (node === rootEl || node === document.body || node === document.documentElement) return false;
            if (isBlockContainerNode(node)) return false;
            if (node.closest('#standalone-context-menu') || node.closest('#standalone-hover-delete')) return false;
            return true;
          }
          function marqueeCandidates() {
            const raw = Array.from(document.body.querySelectorAll('*')).filter((node) => isMovableTarget(node) && nodeIntersectsMarquee(node));
            return raw.filter((node) => !raw.some((other) => other !== node && other.contains(node)));
          }
          function ensurePositionable(node) {
            if (!(node instanceof HTMLElement)) return;
            const style = window.getComputedStyle(node);
            if (style.position === 'static') node.style.position = 'relative';
            if (style.display === 'inline') node.style.display = 'inline-block';
          }
          function prepareNodeForResize(node) {
            if (!(node instanceof HTMLElement)) return;
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            if (isBlockContainerNode(node)) {
              node.setAttribute('data-standalone-layout', 'block');
              node.style.position = 'relative';
              node.style.display = 'block';
              if (isSectionLikeNode(node)) node.style.margin = node.style.margin || '16px 0';
              node.style.alignSelf = 'stretch';
            }
            if (rect.width > 0) node.style.width = Math.round(rect.width) + 'px';
            if (rect.height > 0) node.style.height = Math.round(rect.height) + 'px';
            if (style.maxWidth && style.maxWidth !== 'none') node.style.maxWidth = 'none';
            if (style.flexGrow !== '0' || style.flexShrink !== '0' || style.flexBasis !== 'auto') node.style.flex = '0 0 auto';
            if (style.alignSelf === 'stretch' && !isBlockLayoutNode(node)) node.style.alignSelf = 'flex-start';
            node.style.boxSizing = 'border-box';
          }
          function clearOverlayPlacement(node) {
            if (!(node instanceof HTMLElement)) return;
            node.style.removeProperty('left');
            node.style.removeProperty('top');
            node.style.removeProperty('z-index');
          }
          function reinsertNodeNearVisualPosition(node, parent, rect, parentRect) {
            if (!(node instanceof HTMLElement) || !(parent instanceof HTMLElement) || !rect || !parentRect) return;
            const siblings = Array.from(parent.children || []).filter((child) => child instanceof HTMLElement && child !== node);
            if (!siblings.length) return;
            const nodeCenterY = Number(rect.top || 0) + (Number(rect.height || 0) / 2);
            const nodeCenterX = Number(rect.left || 0) + (Number(rect.width || 0) / 2);
            let anchor = null;
            for (const sibling of siblings) {
              const siblingRect = sibling.getBoundingClientRect();
              const siblingCenterY = Number(siblingRect.top || 0) + (Number(siblingRect.height || 0) / 2);
              const siblingCenterX = Number(siblingRect.left || 0) + (Number(siblingRect.width || 0) / 2);
              if (nodeCenterY < siblingCenterY - 8) {
                anchor = sibling;
                break;
              }
              if (Math.abs(nodeCenterY - siblingCenterY) <= 20 && nodeCenterX < siblingCenterX) {
                anchor = sibling;
                break;
              }
            }
            if (anchor) parent.insertBefore(node, anchor);
            else parent.appendChild(node);
          }
          function applyLayoutMode(node, mode) {
            if (!(node instanceof HTMLElement)) return;
            const requestedMode = String(mode || '').trim().toLowerCase();
            const nextMode = requestedMode === 'over' && isBlockContainerNode(node) ? 'block' : (isSectionLikeNode(node) ? 'block' : requestedMode);
            const parent = node.parentElement instanceof HTMLElement ? node.parentElement : rootEl;
            if (!(parent instanceof HTMLElement)) return;
            const rect = node.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            const parentScrollLeft = parent === document.body ? window.scrollX : parent.scrollLeft;
            const parentScrollTop = parent === document.body ? window.scrollY : parent.scrollTop;
            if (nextMode === 'over') {
              const parentStyle = window.getComputedStyle(parent);
              const existingZIndex = String(node.style.zIndex || window.getComputedStyle(node).zIndex || '').trim();
              if (parentStyle.position === 'static') parent.style.position = 'relative';
              node.style.position = 'absolute';
              node.style.display = preferredDisplayForLayout(node, 'over');
              node.style.left = Math.round(rect.left - parentRect.left + parentScrollLeft) + 'px';
              node.style.top = Math.round(rect.top - parentRect.top + parentScrollTop) + 'px';
              node.style.margin = '0';
              node.style.boxSizing = 'border-box';
              if (rect.width > 0) node.style.width = Math.round(rect.width) + 'px';
              if (rect.height > 0 && !hasInlineText(node)) node.style.height = Math.round(rect.height) + 'px';
              if (existingZIndex && existingZIndex !== 'auto') node.style.zIndex = existingZIndex;
              else node.style.removeProperty('z-index');
              node.style.flex = '0 0 auto';
              node.style.alignSelf = 'flex-start';
            } else if (nextMode === 'inline') {
              reinsertNodeNearVisualPosition(node, parent, rect, parentRect);
              node.style.position = 'relative';
              node.style.display = preferredDisplayForLayout(node, 'inline');
              const offsetLeft = Math.max(0, Math.round(rect.left - parentRect.left + parentScrollLeft));
              const offsetTop = Math.max(0, Math.round(rect.top - parentRect.top + parentScrollTop));
              const parentWidth = Math.max(1, Math.round(parentRect.width || parent.clientWidth || 1));
              const widthPercent = rect.width > 0 ? Math.max(0, Math.min(100, (Number(rect.width || 0) / parentWidth) * 100)) : 0;
              node.style.margin = String(Math.min(32, Math.max(8, offsetTop > 24 ? 12 : 8))) + 'px 0 0 ' + String(Math.min(offsetLeft, Math.max(0, parentWidth - Math.round(rect.width || 0)))) + 'px';
              node.style.verticalAlign = 'top';
              node.style.flex = '0 0 auto';
              node.style.alignSelf = 'flex-start';
              clearOverlayPlacement(node);
              node.style.removeProperty('height');
              node.style.maxWidth = '100%';
              if (hasInlineText(node)) node.style.removeProperty('width');
              else if (widthPercent > 0 && widthPercent < 100) node.style.width = String(widthPercent.toFixed(2)) + '%';
              else if (!isShapeNode(node)) node.style.removeProperty('width');
            } else if (nextMode === 'block') {
              node.style.position = 'relative';
              node.style.display = preferredDisplayForLayout(node, 'block');
              node.style.margin = '16px 0';
              node.style.flex = '0 0 auto';
              node.style.alignSelf = 'stretch';
              clearOverlayPlacement(node);
              if (hasInlineText(node)) {
                node.style.removeProperty('width');
                node.style.removeProperty('height');
              }
              if (isSectionLikeNode(node)) {
                node.style.removeProperty('width');
                node.style.removeProperty('height');
              }
            } else {
              return;
            }
            node.setAttribute('data-standalone-layout', nextMode);
          }
          function shapeColor(node) {
            if (!(node instanceof HTMLElement)) return '';
            if (node.hasAttribute('data-standalone-custom-shape')) {
              const polygon = node.querySelector('polygon[data-shape-polygon]');
              return polygon ? String(polygon.getAttribute('fill') || '').trim() : '';
            }
            if (String(node.getAttribute('data-standalone-shape') || '') === 'triangle') {
              return String(node.style.borderBottomColor || window.getComputedStyle(node).borderBottomColor || '').trim();
            }
            return String(node.style.background || window.getComputedStyle(node).backgroundColor || '').trim();
          }
          function readCustomShapePoints(node) {
            if (!(node instanceof HTMLElement)) return [];
            try {
              const raw = JSON.parse(node.getAttribute('data-shape-points') || '[]');
              return Array.isArray(raw) ? raw.map((point) => ({
                x: Math.max(0, Math.min(100, Number(point?.x) || 0)),
                y: Math.max(0, Math.min(100, Number(point?.y) || 0))
              })) : [];
            } catch {
              return [];
            }
          }
          function writeCustomShapePoints(node, points) {
            if (!(node instanceof HTMLElement)) return;
            node.setAttribute('data-shape-points', JSON.stringify(points));
          }
          function syncCustomShapeVisual(node) {
            if (!(node instanceof HTMLElement)) return;
            const points = readCustomShapePoints(node);
            const polygon = node.querySelector('polygon[data-shape-polygon]');
            const handles = Array.from(node.querySelectorAll('[data-shape-handle]'));
            const pointAttr = points.map((point) => String(point.x) + ',' + String(point.y)).join(' ');
            if (polygon) polygon.setAttribute('points', pointAttr);
            handles.forEach((handle, index) => {
              const point = points[index];
              if (!(handle instanceof SVGCircleElement) || !point) return;
              handle.setAttribute('cx', String(point.x));
              handle.setAttribute('cy', String(point.y));
            });
          }
          function buildCustomShapeNode() {
            const wrap = createBlockShell();
            wrap.setAttribute('data-standalone-custom-shape', '1');
            wrap.style.width = '180px';
            wrap.style.height = '180px';
            wrap.style.display = 'inline-block';
            const points = [{ x: 14, y: 18 }, { x: 84, y: 8 }, { x: 92, y: 62 }, { x: 70, y: 92 }, { x: 16, y: 84 }];
            writeCustomShapePoints(wrap, points);
            wrap.innerHTML = '<svg viewBox="0 0 100 100" width="100%" height="100%"><polygon data-shape-polygon fill="#2563eb" points=""></polygon><g data-shape-handles></g></svg>';
            const handlesGroup = wrap.querySelector('[data-shape-handles]');
            points.forEach((point, index) => {
              const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              circle.setAttribute('r', '4');
              circle.setAttribute('fill', '#ffffff');
              circle.setAttribute('stroke', '#2563eb');
              circle.setAttribute('stroke-width', '2');
              circle.setAttribute('data-shape-handle', String(index));
              handlesGroup?.appendChild(circle);
            });
            syncCustomShapeVisual(wrap);
            return wrap;
          }
          function canContainChildren(node) {
            if (!(node instanceof HTMLElement)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            return !['img','input','textarea','select','option','video','iframe','source','track','br','hr','meta','link'].includes(tag);
          }
          function insertionContainer() {
            // Never nest new elements inside a link or button - a button created
            // while another button is selected must become its sibling.
            const interactiveHost = activeEl?.closest ? activeEl.closest('a,button,[data-standalone-route-button]') : null;
            if (interactiveHost?.parentElement) return interactiveHost.parentElement;
            if (activeEl && canContainChildren(activeEl)) return activeEl;
            if (activeEl?.parentElement) return activeEl.parentElement;
            return rootEl;
          }
          function nextFrontZIndex() {
            return Array.from(document.querySelectorAll('*')).reduce((max, node) => {
              if (!(node instanceof HTMLElement)) return max;
              if (
                node.id === 'standalone-context-menu'
                || node.id === 'standalone-runtime-error'
                || node.id === 'standalone-page-root'
                || node.tagName === 'HTML'
                || node.tagName === 'BODY'
                || node.tagName === 'HEAD'
              ) return max;
              const z = parseInt(window.getComputedStyle(node).zIndex || '0', 10);
              if (!Number.isFinite(z) || z >= 100000) return max;
              return Math.max(max, z);
            }, 0) + 1;
          }
          function selectAndSync(node) {
            if (!(node instanceof HTMLElement)) return;
            selectNode(node);
            syncMarkupToParent();
          }
          function appendInsertedNode(node) {
            if (!(node instanceof HTMLElement)) return;
            const parent = insertionContainer();
            parent.appendChild(node);
            if (!isBlockContainerNode(node) && !isSectionLikeNode(node)) {
              applyLayoutMode(node, 'over');
            }
            selectAndSync(node);
          }
          let hoverDeleteTarget = null;
          let hoverDeleteVisible = false;
          const hoverDeleteEl = document.createElement('button');
          hoverDeleteEl.id = 'standalone-hover-delete';
          hoverDeleteEl.type = 'button';
          hoverDeleteEl.setAttribute('aria-label', 'Delete element');
          hoverDeleteEl.innerHTML = '<span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg></span>';
          document.body.appendChild(hoverDeleteEl);
          function canDeleteNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            if (node === rootEl || node === document.body || node === document.documentElement) return false;
            if (node.id === 'standalone-context-menu' || node.id === 'standalone-hover-delete') return false;
            return isEditableTarget(node);
          }
          function hideHoverDelete() {
            hoverDeleteTarget = null;
            hoverDeleteVisible = false;
            hoverDeleteEl.style.display = 'none';
          }
          function syncHoverDeletePosition() {
            if (!hoverDeleteVisible || !(hoverDeleteTarget instanceof HTMLElement) || !hoverDeleteTarget.isConnected || !canDeleteNode(hoverDeleteTarget)) {
              hideHoverDelete();
              return;
            }
            const rect = hoverDeleteTarget.getBoundingClientRect();
            const width = Number(rect.width || 0);
            const height = Number(rect.height || 0);
            if (width <= 0 || height <= 0) {
              hideHoverDelete();
              return;
            }
            hoverDeleteEl.style.display = 'inline-flex';
            hoverDeleteEl.style.left = Math.max(8, Math.round(rect.right - 18)) + 'px';
            hoverDeleteEl.style.top = Math.max(8, Math.round(rect.top - 18)) + 'px';
          }
          function showHoverDelete(node) {
            if (!canDeleteNode(node)) {
              hideHoverDelete();
              return;
            }
            hoverDeleteTarget = node;
            hoverDeleteVisible = true;
            syncHoverDeletePosition();
          }
          function deleteNode(node) {
            if (!(node instanceof HTMLElement) || !canDeleteNode(node)) return;
            if (editingText && activeEl === node) finishInlineEdit(false);
            if (node === activeEl) activeEl = null;
            node.remove();
            clearSelection();
            hideHoverDelete();
            syncMarkupToParent();
            postSelection();
          }
          function insertAfterActive(node) {
            if (!(node instanceof HTMLElement)) return;
            const host = activeEl?.parentElement || insertionContainer();
            if (activeEl?.parentElement) activeEl.parentElement.insertBefore(node, activeEl.nextSibling);
            else host.appendChild(node);
            selectAndSync(node);
          }
          function createBlockShell() {
            const block = document.createElement('div');
            block.style.position = 'relative';
            block.style.margin = '16px 0';
            block.style.width = 'fit-content';
            return block;
          }
          function createMessageDraftNode() {
            const message = document.createElement('div');
            message.textContent = '';
            message.setAttribute('data-standalone-message', '1');
            message.style.position = 'relative';
            message.style.margin = '16px 0';
            message.style.font = '700 28px/1.2 system-ui,sans-serif';
            message.style.color = '#0f172a';
            message.style.minWidth = '32px';
            message.style.minHeight = '1.2em';
            message.style.display = 'inline-block';
            return message;
          }
          function buildUploadedImageNode(url) {
            const img = document.createElement('img');
            img.src = String(url || '').trim();
            img.alt = 'Custom image';
            img.style.display = 'block';
            img.style.maxWidth = '100%';
            img.style.width = '320px';
            img.style.height = 'auto';
            img.style.borderRadius = '18px';
            return img;
          }
          function buildUploadedVideoNode(url, poster) {
            const video = document.createElement('video');
            const cleanUrl = String(url || '').trim();
            // The #t fragment makes browsers paint the first frame as the
            // thumbnail even when no poster image is available.
            video.src = cleanUrl && !cleanUrl.includes('#') ? cleanUrl + '#t=0.001' : cleanUrl;
            const cleanPoster = String(poster || '').trim();
            if (cleanPoster) video.setAttribute('poster', cleanPoster);
            video.controls = true;
            video.setAttribute('playsinline', '');
            video.preload = 'metadata';
            video.style.display = 'block';
            video.style.width = '560px';
            video.style.maxWidth = '100%';
            video.style.borderRadius = '18px';
            return video;
          }
          const mediaBoxKeywordRe = /(photo|image|\bimg\b|picture|avatar|headshot|portrait|thumb|media|video|vsl|player|placeholder|visual|spot|frame|poster|drop|upload|here)/i;
          const pendingMediaTargetBoxes = {};
          let mediaDropTargetBox = null;
          function isUploadedMediaNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            const tag = String(node.tagName || '').toLowerCase();
            return tag === 'img' || tag === 'video';
          }
          function nodeMediaSignature(node) {
            const parts = [];
            Array.from(node.attributes || []).forEach(function(attr) {
              if (/^(id$|class$|data-)/i.test(attr.name) && !/^data-standalone-/i.test(attr.name)) {
                parts.push(attr.name + '=' + attr.value);
              }
            });
            return parts.join(' ');
          }
          function boxContainsMedia(box, ignoreNode) {
            return Array.from(box.querySelectorAll('img,video,iframe')).some(function(found) {
              return found !== ignoreNode;
            });
          }
          function isDesignatedMediaBox(node, ignoreNode) {
            if (!(node instanceof HTMLElement)) return false;
            if (node === rootEl || node === document.body || node === document.documentElement) return false;
            if (node.closest('#standalone-context-menu,#standalone-hover-delete,#standalone-marquee,#standalone-runtime-error')) return false;
            if (!canContainChildren(node)) return false;
            if (node.hasAttribute('data-standalone-media-pending')) return false;
            if (ignoreNode instanceof HTMLElement && (node === ignoreNode || ignoreNode.contains(node))) return false;
            if (boxContainsMedia(node, ignoreNode)) return false;
            const rect = node.getBoundingClientRect();
            if (rect.width < 80 || rect.height < 60) return false;
            if (rect.height > window.innerHeight * 1.6) return false;
            const text = String(node.textContent || '').trim();
            const keywordMatch = mediaBoxKeywordRe.test(nodeMediaSignature(node))
              || (text.length <= 60 && mediaBoxKeywordRe.test(text));
            if (keywordMatch) return text.length <= 160;
            const rootRect = rootEl.getBoundingClientRect();
            return text.length <= 40 && node.childElementCount <= 3 && rect.width <= Math.max(1, rootRect.width) * 0.92;
          }
          function findMediaDropBox(clientX, clientY, dragNode) {
            const stack = document.elementsFromPoint(Number(clientX) || 0, Number(clientY) || 0) || [];
            for (const candidate of stack) {
              if (candidate === dragNode || (dragNode instanceof HTMLElement && dragNode.contains(candidate))) continue;
              if (isDesignatedMediaBox(candidate, dragNode)) return candidate;
            }
            return null;
          }
          function compareMediaBoxOrder(a, b) {
            if (!(a instanceof HTMLElement) || !(b instanceof HTMLElement)) return 0;
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            const topDelta = Number(aRect.top || 0) - Number(bRect.top || 0);
            if (Math.abs(topDelta) > 24) return topDelta;
            return Number(aRect.left || 0) - Number(bRect.left || 0);
          }
          function collectDesignatedMediaBoxes(ignoreNode) {
            return Array.from(document.querySelectorAll('*'))
              .filter((node) => node instanceof HTMLElement && isDesignatedMediaBox(node, ignoreNode))
              .sort(compareMediaBoxOrder);
          }
          function resolvePreferredMediaBox(kind, ignoreNode) {
            const candidates = collectDesignatedMediaBoxes(ignoreNode);
            if (!candidates.length) return null;
            if (String(kind || '').trim().toLowerCase() === 'video' && candidates.length % 2 === 1) {
              return candidates[Math.floor(candidates.length / 2)] || candidates[0] || null;
            }
            return candidates[0] || null;
          }
          function setMediaDropTargetBox(box) {
            if (mediaDropTargetBox === box) return;
            if (mediaDropTargetBox instanceof HTMLElement) mediaDropTargetBox.removeAttribute('data-standalone-drop-target');
            mediaDropTargetBox = box instanceof HTMLElement ? box : null;
            if (mediaDropTargetBox) mediaDropTargetBox.setAttribute('data-standalone-drop-target', '1');
          }
          function syncMediaDropHighlight(event, node) {
            if (!isUploadedMediaNode(node)) return;
            setMediaDropTargetBox(findMediaDropBox(event.clientX, event.clientY, node));
          }
          function hideMediaPlaceholderLabels(box) {
            Array.from(box.childNodes).forEach(function(child) {
              if (child.nodeType === 3) {
                const text = String(child.textContent || '').trim();
                if (text && text.length <= 60) child.textContent = '';
                return;
              }
              if (!(child instanceof HTMLElement)) return;
              if (child.querySelector('img,video,iframe,svg,form,input,button,a')) return;
              const label = String(child.textContent || '').trim();
              if (!label || label.length > 60) return;
              if (mediaBoxKeywordRe.test(label)) child.style.display = 'none';
            });
          }
          function embedMediaIntoBox(media, box) {
            if (!(media instanceof HTMLElement) || !(box instanceof HTMLElement) || !box.isConnected) return false;
            const rectBefore = box.getBoundingClientRect();
            hideMediaPlaceholderLabels(box);
            if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
            media.removeAttribute('data-standalone-layout');
            media.style.position = 'absolute';
            media.style.left = '0';
            media.style.top = '0';
            media.style.right = '0';
            media.style.bottom = '0';
            media.style.width = '100%';
            media.style.height = '100%';
            media.style.maxWidth = '100%';
            media.style.margin = '0';
            media.style.display = 'block';
            media.style.objectFit = 'cover';
            media.style.borderRadius = 'inherit';
            media.style.zIndex = '0';
            media.style.removeProperty('flex');
            media.style.removeProperty('align-self');
            media.setAttribute('data-standalone-media-fit', '1');
            box.insertBefore(media, box.firstChild);
            const rectAfter = box.getBoundingClientRect();
            if (rectAfter.height < 40) box.style.minHeight = Math.max(120, Math.round(rectBefore.height || 0)) + 'px';
            return true;
          }
          let mediaUploadCounter = 0;
          function buildMediaUploadPlaceholder(kind, token) {
            const box = createBlockShell();
            box.setAttribute('data-standalone-media-pending', token);
            box.style.display = 'flex';
            box.style.alignItems = 'center';
            box.style.justifyContent = 'center';
            box.style.width = kind === 'video' ? '560px' : '320px';
            box.style.maxWidth = '100%';
            box.style.minHeight = kind === 'video' ? '315px' : '200px';
            box.style.borderRadius = '18px';
            box.style.border = '2px dashed rgba(37,99,235,.5)';
            box.style.background = 'rgba(37,99,235,.08)';
            box.style.color = '#1d4ed8';
            box.style.font = '700 14px/1.4 system-ui,sans-serif';
            box.textContent = kind === 'video' ? 'Uploading video...' : 'Uploading image...';
            return box;
          }
          function pickAndUploadMedia(kind, targetBox) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = kind === 'video' ? 'video/*' : 'image/*';
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            document.body.appendChild(input);
            input.addEventListener('change', function() {
              const file = input.files && input.files[0];
              input.remove();
              if (!file) return;
              mediaUploadCounter += 1;
              const token = 'media-' + Date.now() + '-' + mediaUploadCounter;
              const placeholder = buildMediaUploadPlaceholder(kind, token);
              const preferredBox = targetBox instanceof HTMLElement && targetBox.isConnected
                ? targetBox
                : resolvePreferredMediaBox(kind, placeholder);
              const box = preferredBox instanceof HTMLElement && preferredBox.isConnected ? preferredBox : null;
              if (box) {
                pendingMediaTargetBoxes[token] = box;
                embedMediaIntoBox(placeholder, box);
                selectAndSync(placeholder);
              } else {
                appendInsertedNode(placeholder);
              }
              const payloadBase = {
                type: 'trainer_standalone_media_upload',
                token: token,
                kind: kind,
                fileName: String(file.name || ''),
                mime: String(file.type || '')
              };
              try {
                window.parent.postMessage(Object.assign({}, payloadBase, { file: file }), '*');
              } catch (err) {
                const reader = new FileReader();
                reader.onload = function() {
                  try {
                    window.parent.postMessage(Object.assign({}, payloadBase, { dataUrl: String(reader.result || '') }), '*');
                  } catch (err2) {
                    placeholder.remove();
                    syncMarkupToParent();
                  }
                };
                reader.onerror = function() {
                  placeholder.remove();
                  syncMarkupToParent();
                };
                reader.readAsDataURL(file);
              }
            });
            input.click();
          }
          function createShapeNode(type) {
            if (type === 'custom') return buildCustomShapeNode();
            const shape = createBlockShell();
            shape.setAttribute('data-standalone-shape', type);
            shape.style.width = type === 'pill' ? '220px' : '180px';
            shape.style.height = '120px';
            shape.style.background = 'linear-gradient(135deg,#2563eb,#7c3aed)';
            if (type === 'circle') {
              shape.style.width = '150px';
              shape.style.height = '150px';
              shape.style.borderRadius = '999px';
            } else if (type === 'rectangle') {
              shape.style.borderRadius = '20px';
            } else if (type === 'triangle') {
              shape.style.width = '0';
              shape.style.height = '0';
              shape.style.background = 'transparent';
              shape.style.borderLeft = '90px solid transparent';
              shape.style.borderRight = '90px solid transparent';
              shape.style.borderBottom = '150px solid #2563eb';
            } else if (type === 'diamond') {
              shape.style.width = '150px';
              shape.style.height = '150px';
              shape.style.transform = 'rotate(45deg)';
              shape.style.borderRadius = '24px';
            } else if (type === 'pill') {
              shape.style.borderRadius = '999px';
            }
            return shape;
          }
          function createConsultationFormNode() {
            const wrap = document.createElement('section');
            wrap.style.position = 'relative';
            wrap.style.display = 'grid';
            wrap.style.gap = '14px';
            wrap.style.padding = '24px';
            wrap.style.margin = '16px 0';
            wrap.style.maxWidth = '460px';
            wrap.style.borderRadius = '24px';
            wrap.style.background = '#ffffff';
            wrap.style.boxShadow = '0 18px 36px rgba(15,23,42,.10)';
            wrap.innerHTML = '<div style="font:800 28px/1.1 system-ui,sans-serif;color:#0f172a">Book a consultation</div><div style="font:500 15px/1.6 system-ui,sans-serif;color:#475569">Tell us what you need and we will reach out with next steps.</div><form data-standalone-consult-form="1" style="display:grid;gap:12px"><input type="text" name="fullName" placeholder="Your name" style="min-height:46px;padding:0 14px;border:1px solid rgba(15,23,42,.12);border-radius:14px"><input type="email" name="email" placeholder="Email address" style="min-height:46px;padding:0 14px;border:1px solid rgba(15,23,42,.12);border-radius:14px"><input type="tel" name="phone" placeholder="Phone (optional)" style="min-height:46px;padding:0 14px;border:1px solid rgba(15,23,42,.12);border-radius:14px"><textarea name="goal" placeholder="What do you need help with?" style="min-height:120px;padding:14px;border:1px solid rgba(15,23,42,.12);border-radius:14px;resize:vertical"></textarea><button type="submit" style="min-height:48px;padding:0 18px;border:0;border-radius:999px;background:#2563eb;color:#ffffff;font:800 15px/1 system-ui,sans-serif;width:fit-content">Request consultation</button><div data-consult-form-status style="font:600 13px/1.4 system-ui,sans-serif;color:#475569"></div></form>';
            return wrap;
          }
          function findConsultationForm() {
            return rootEl.querySelector('form');
          }
          function isNativeFormControlTarget(target) {
            if (!(target instanceof Element)) return false;
            const control = target.closest('input,textarea,select,option,label');
            return Boolean(control && control.closest('form'));
          }
          function consultFieldElements(form) {
            return Array.from(form.querySelectorAll('input,textarea,select')).filter(function(el) {
              const type = String(el.getAttribute('type') || '').toLowerCase();
              return !['submit', 'button', 'reset', 'hidden'].includes(type);
            });
          }
          function consultFieldWrapper(el) {
            const label = el.closest('label');
            if (label && label.querySelectorAll('input,textarea,select').length === 1) return label;
            return el;
          }
          function consultFieldType(el) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'textarea') return 'textarea';
            if (tag === 'select') return 'select';
            const type = String(el.getAttribute('type') || 'text').toLowerCase();
            if (type === 'checkbox') return 'checkbox';
            if (type === 'email') return 'email';
            if (type === 'tel') return 'tel';
            return 'text';
          }
          function consultFieldLabel(el) {
            const placeholder = String(el.getAttribute('placeholder') || '').trim();
            if (placeholder) return placeholder;
            const wrapper = consultFieldWrapper(el);
            if (wrapper !== el) {
              const text = String(wrapper.textContent || '').trim();
              if (text) return text.slice(0, 80);
            }
            const name = String(el.getAttribute('name') || '').trim();
            if (name) return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
            return 'Field';
          }
          function describeConsultFields() {
            const form = findConsultationForm();
            if (!form) return { fields: [], submitLabel: '' };
            let counter = 0;
            const fields = consultFieldElements(form).map(function(el) {
              if (!el.getAttribute('data-consult-field-id')) {
                counter += 1;
                el.setAttribute('data-consult-field-id', 'cf-' + Date.now().toString(36) + '-' + counter + '-' + Math.floor(Math.random() * 1e5).toString(36));
              }
              return {
                id: el.getAttribute('data-consult-field-id'),
                label: consultFieldLabel(el),
                type: consultFieldType(el),
                required: el.required === true,
                options: el.tagName.toLowerCase() === 'select'
                  ? Array.from(el.options).filter(function(opt) { return !opt.disabled && String(opt.value || opt.textContent || '').trim(); }).map(function(opt) { return String(opt.textContent || '').trim(); })
                  : []
              };
            });
            const submitButton = form.querySelector('button[type="submit"],input[type="submit"]');
            const submitLabel = submitButton
              ? String(submitButton.tagName.toLowerCase() === 'input' ? submitButton.value : submitButton.textContent || '').trim()
              : '';
            return { fields, submitLabel };
          }
          function slugConsultFieldName(label, usedNames) {
            const base = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field';
            let name = base;
            let n = 2;
            while (usedNames.includes(name)) {
              name = base + '_' + n;
              n += 1;
            }
            usedNames.push(name);
            return name;
          }
          function styleConsultControl(el, type) {
            if (type === 'textarea') {
              el.style.minHeight = '120px';
              el.style.padding = '14px';
              el.style.resize = 'vertical';
            } else {
              el.style.minHeight = '46px';
              el.style.padding = '0 14px';
            }
            el.style.border = '1px solid rgba(15,23,42,.12)';
            el.style.borderRadius = '14px';
            el.style.font = '500 15px/1.4 system-ui,sans-serif';
            el.style.width = '100%';
            el.style.boxSizing = 'border-box';
            el.style.background = '#ffffff';
            el.style.color = '#0f172a';
          }
          function buildConsultFieldNode(field, usedNames, existingEl) {
            const allowed = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox'];
            const type = allowed.includes(String(field?.type || '').trim()) ? String(field.type).trim() : 'text';
            const label = String(field?.label || '').trim().slice(0, 120) || 'Field';
            const name = slugConsultFieldName(label, usedNames);
            const fieldId = String(field?.id || '').trim() || ('cf-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36));
            const options = Array.isArray(field?.options)
              ? field.options.map(function(opt) { return String(opt || '').trim().slice(0, 120); }).filter(Boolean).slice(0, 24)
              : [];
            const reusable = existingEl && consultFieldType(existingEl) === type && type !== 'checkbox';
            if (reusable) {
              existingEl.setAttribute('data-consult-field-id', fieldId);
              existingEl.setAttribute('name', name);
              if (type !== 'select') existingEl.setAttribute('placeholder', label);
              existingEl.required = field?.required === true;
              if (type === 'select') {
                existingEl.innerHTML = '';
                const placeholderOption = document.createElement('option');
                placeholderOption.value = '';
                placeholderOption.disabled = true;
                placeholderOption.selected = true;
                placeholderOption.textContent = label;
                existingEl.appendChild(placeholderOption);
                options.forEach(function(optionLabel) {
                  const option = document.createElement('option');
                  option.value = optionLabel;
                  option.textContent = optionLabel;
                  existingEl.appendChild(option);
                });
              }
              return consultFieldWrapper(existingEl);
            }
            if (type === 'checkbox') {
              const wrap = document.createElement('label');
              wrap.style.display = 'flex';
              wrap.style.alignItems = 'center';
              wrap.style.gap = '10px';
              wrap.style.font = '500 14px/1.4 system-ui,sans-serif';
              wrap.style.color = '#334155';
              wrap.style.cursor = 'pointer';
              const input = document.createElement('input');
              input.type = 'checkbox';
              input.name = name;
              input.value = 'Yes';
              input.required = field?.required === true;
              input.setAttribute('data-consult-field-id', fieldId);
              input.style.width = '18px';
              input.style.height = '18px';
              input.style.accentColor = '#2563eb';
              const span = document.createElement('span');
              span.textContent = label;
              wrap.appendChild(input);
              wrap.appendChild(span);
              return wrap;
            }
            if (type === 'select') {
              const select = document.createElement('select');
              select.name = name;
              select.required = field?.required === true;
              select.setAttribute('data-consult-field-id', fieldId);
              styleConsultControl(select, 'select');
              const placeholderOption = document.createElement('option');
              placeholderOption.value = '';
              placeholderOption.disabled = true;
              placeholderOption.selected = true;
              placeholderOption.textContent = label;
              select.appendChild(placeholderOption);
              options.forEach(function(optionLabel) {
                const option = document.createElement('option');
                option.value = optionLabel;
                option.textContent = optionLabel;
                select.appendChild(option);
              });
              return select;
            }
            if (type === 'textarea') {
              const textarea = document.createElement('textarea');
              textarea.name = name;
              textarea.placeholder = label;
              textarea.required = field?.required === true;
              textarea.setAttribute('data-consult-field-id', fieldId);
              styleConsultControl(textarea, 'textarea');
              return textarea;
            }
            const input = document.createElement('input');
            input.type = type;
            input.name = name;
            input.placeholder = label;
            input.required = field?.required === true;
            input.setAttribute('data-consult-field-id', fieldId);
            styleConsultControl(input, type);
            return input;
          }
          function applyConsultFields(fields, submitLabel) {
            const form = findConsultationForm();
            if (!form) return false;
            const existingEls = consultFieldElements(form);
            const byId = new Map();
            existingEls.forEach(function(el) {
              const id = el.getAttribute('data-consult-field-id');
              if (id) byId.set(id, el);
            });
            const usedNames = [];
            const nodes = (Array.isArray(fields) ? fields : []).slice(0, 24).map(function(field) {
              return buildConsultFieldNode(field, usedNames, field?.id ? byId.get(String(field.id)) : null);
            });
            existingEls.forEach(function(el) {
              const wrapper = consultFieldWrapper(el);
              if (wrapper.parentElement) wrapper.remove();
            });
            const anchor = form.querySelector('button[type="submit"],input[type="submit"]')
              || form.querySelector('button')
              || form.querySelector('[data-consult-form-status]');
            let anchorTop = anchor;
            while (anchorTop && anchorTop.parentElement && anchorTop.parentElement !== form) anchorTop = anchorTop.parentElement;
            nodes.forEach(function(node) {
              if (anchorTop && anchorTop.parentElement === form) form.insertBefore(node, anchorTop);
              else form.appendChild(node);
            });
            const cleanSubmitLabel = String(submitLabel || '').trim().slice(0, 60);
            if (cleanSubmitLabel) {
              const submitButton = form.querySelector('button[type="submit"],input[type="submit"]') || form.querySelector('button');
              if (submitButton) {
                if (submitButton.tagName.toLowerCase() === 'input') submitButton.value = cleanSubmitLabel;
                else submitButton.textContent = cleanSubmitLabel;
              }
            }
            form.setAttribute('data-standalone-consult-form', '1');
            syncMarkupToParent();
            return true;
          }
          function runMenuAction(action) {
            if (!action) return;
            if (action === 'button') {
              if (activeEl) openRoutePicker();
              return;
            }
            hideContextMenu();
            if (!activeEl) return;
            if (action === 'front') {
              const parent = activeEl.parentElement;
              if (parent) parent.appendChild(activeEl);
              ensurePositionable(activeEl);
              activeEl.style.zIndex = String(nextFrontZIndex());
              syncMarkupToParent();
              return;
            }
            if (action === 'back') {
              const parent = activeEl.parentElement;
              if (parent) parent.insertBefore(activeEl, parent.firstElementChild);
              ensurePositionable(activeEl);
              activeEl.style.zIndex = '0';
              syncMarkupToParent();
              return;
            }
            if (action.startsWith('layout_')) {
              applyLayoutMode(activeEl, action.replace('layout_', ''));
              syncMarkupToParent();
              postSelection();
              return;
            }
            if (action.startsWith('button_align_')) {
              applyButtonContentAlignment(activeEl, action);
              syncMarkupToParent();
              postSelection();
              return;
            }
            if (action === 'shape') return;
            if (action.startsWith('shape_')) {
              const shape = createShapeNode(action.replace('shape_', ''));
              if (!shape) return;
              appendInsertedNode(shape);
              return;
            }
            if (action === 'message') {
              const message = createMessageDraftNode();
              appendInsertedNode(message);
              beginInlineEdit(message);
              return;
            }
            if (action === 'image') {
              pickAndUploadMedia('image', activeEl && isDesignatedMediaBox(activeEl, null) ? activeEl : null);
              return;
            }
            if (action === 'video') {
              pickAndUploadMedia('video', activeEl && isDesignatedMediaBox(activeEl, null) ? activeEl : null);
              return;
            }
            if (action === 'form') {
              const existingForm = findConsultationForm();
              if (existingForm) {
                try {
                  window.parent.postMessage({ type: 'trainer_standalone_consult_settings' }, '*');
                } catch {}
                return;
              }
              appendInsertedNode(createConsultationFormNode());
            }
          }
          function clearSelection(notifyParent = true) {
            const hadSelection = Boolean(activeEl || selectedEls.length);
            document.querySelectorAll('[data-standalone-selected="1"]').forEach((node) => {
              node.removeAttribute('data-standalone-selected');
              node.removeAttribute('data-standalone-rim-hover');
              node.removeAttribute('data-standalone-rim-cursor');
              node.removeAttribute('data-standalone-dragging');
            });
            selectedEls = [];
            activeEl = null;
            setHoveredResizeTarget(null, '');
            hideHoverDelete();
            if (notifyParent && hadSelection) postSelection();
          }
          function syncMarkupToParent() {
            try {
              window.parent.postMessage({
                type: 'trainer_standalone_code_sync',
                code: serializeMarkup()
              }, '*');
            } catch {}
          }
          function finishInlineEdit(saveChanges) {
            if (!activeEl || !editingText) return;
            if (!saveChanges) activeEl.textContent = originalText;
            activeEl.removeAttribute('contenteditable');
            activeEl.removeAttribute('spellcheck');
            activeEl.removeAttribute('data-standalone-editing');
            editingText = false;
            if (saveChanges) syncMarkupToParent();
            postSelection();
          }
          function beginInlineEdit(node) {
            const supportsEmptyInlineEdit = node instanceof HTMLElement && node.hasAttribute('data-standalone-message');
            if (!hasInlineText(node) && !supportsEmptyInlineEdit) return;
            if (activeEl !== node) selectNode(node);
            if (!activeEl || editingText) return;
            editingText = true;
            originalText = String(activeEl.textContent || '');
            activeEl.setAttribute('contenteditable', 'plaintext-only');
            activeEl.setAttribute('spellcheck', 'false');
            activeEl.setAttribute('data-standalone-editing', '1');
            activeEl.focus();
            moveCaretToEnd(activeEl);
          }
          function selectNodes(nodes, primaryNode, { announce = true } = {}) {
            const uniqueNodes = Array.from(new Set((Array.isArray(nodes) ? nodes : []).filter((node) => node instanceof HTMLElement && isEditableTarget(node))));
            clearSelection(false);
            if (!uniqueNodes.length) return;
            selectedEls = uniqueNodes;
            activeEl = uniqueNodes.includes(primaryNode) ? primaryNode : uniqueNodes[0];
            selectedEls.forEach((node) => node.setAttribute('data-standalone-selected', '1'));
            if (announce) postSelection();
          }
          function selectNode(node, { preserveGroup = false, announce = true } = {}) {
            if (!isEditableTarget(node)) return;
            if (editingText && activeEl && activeEl !== node) finishInlineEdit(true);
            if (preserveGroup && isSelectedNode(node) && selectedNodes().length > 1) {
              activeEl = node;
              if (announce) postSelection();
              return;
            }
            selectNodes([node], node, { announce });
          }
          function serializeMarkup() {
            const clone = document.documentElement.cloneNode(true);
            clone.querySelectorAll('#standalone-runtime-error,#standalone-bridge-style,#standalone-bridge-script,#standalone-context-menu,#standalone-hover-cursor-style,#standalone-hover-delete,#standalone-marquee').forEach((node) => node.remove());
            clone.querySelectorAll('[data-standalone-selected]').forEach((node) => node.removeAttribute('data-standalone-selected'));
            clone.querySelectorAll('[data-standalone-rim-hover]').forEach((node) => node.removeAttribute('data-standalone-rim-hover'));
            clone.querySelectorAll('[data-standalone-rim-cursor]').forEach((node) => node.removeAttribute('data-standalone-rim-cursor'));
            clone.querySelectorAll('[data-standalone-dragging]').forEach((node) => node.removeAttribute('data-standalone-dragging'));
            clone.querySelectorAll('[data-standalone-drop-target]').forEach((node) => node.removeAttribute('data-standalone-drop-target'));
            clone.querySelectorAll('[data-standalone-editing]').forEach((node) => node.removeAttribute('data-standalone-editing'));
            clone.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
            clone.querySelectorAll('[spellcheck]').forEach((node) => node.removeAttribute('spellcheck'));
            return '<!doctype html>\n' + clone.outerHTML;
          }
          document.addEventListener('mousedown', function(event) {
            if (hoverDeleteEl.contains(event.target)) {
              event.preventDefault();
              event.stopPropagation();
              const nodeToDelete = hoverDeleteTarget || activeEl;
              if (nodeToDelete) deleteNode(nodeToDelete);
              return;
            }
            if (contextMenuEl.contains(event.target)) {
              if (detectContextMenuDragZone(event)) {
                const rect = contextMenuEl.getBoundingClientRect();
                draggingContextMenu = true;
                contextMenuDragOffsetX = Number(event.clientX || 0) - rect.left;
                contextMenuDragOffsetY = Number(event.clientY || 0) - rect.top;
                contextMenuEl.setAttribute('data-menu-dragging', '1');
                contextMenuEl.removeAttribute('data-menu-drag-hover');
                event.preventDefault();
              }
              return;
            }
            hideContextMenu();
            if (isNativeFormControlTarget(event.target)) {
              // Let inputs, dropdowns, and checkboxes inside forms behave
              // natively in the editor so trainers can try their own form.
              if (editingText && activeEl) finishInlineEdit(true);
              return;
            }
            const target = resolveSelectionTarget(event.target, event);
            if (!isEditableTarget(target)) {
              if (editingText && activeEl) finishInlineEdit(true);
              clearSelection();
              marqueeSelecting = true;
              marqueeStartX = Number(event.clientX || 0);
              marqueeStartY = Number(event.clientY || 0);
              startX = marqueeStartX;
              startY = marqueeStartY;
              marqueeHasMoved = false;
              suppressClick = true;
              marqueeEl.style.display = 'none';
              event.preventDefault();
              return;
            }
            const shapeHandle = event.target instanceof Element ? event.target.closest('[data-shape-handle]') : null;
            if (editingText && activeEl && event.target !== activeEl) finishInlineEdit(true);
            const resizeHandle = detectResizeHandle(target, event)
              || String(target.getAttribute('data-standalone-rim-cursor') || '').trim();
            const preserveGroup = isSelectedNode(target) && selectedNodes().length > 1;
            selectNode(target, { preserveGroup });
            if (isInteractiveActionNode(target) && !shapeHandle) event.preventDefault();
            suppressClick = false;
            if (!activeEl || target !== activeEl) return;
            if (shapeHandle && activeEl.hasAttribute('data-standalone-custom-shape')) {
              editingShapeHandle = Number(shapeHandle.getAttribute('data-shape-handle') || '-1');
              suppressClick = true;
              event.preventDefault();
              return;
            }
            startX = Number(event.clientX || 0);
            startY = Number(event.clientY || 0);
            const managedOverlayLayout = String(activeEl?.getAttribute('data-standalone-layout') || '').trim().toLowerCase() === 'over';
            baseLeft = managedOverlayLayout ? (parseFloat(activeEl?.style.left || '0') || 0) : 0;
            baseTop = managedOverlayLayout ? (parseFloat(activeEl?.style.top || '0') || 0) : 0;
            const rect = activeEl.getBoundingClientRect();
            baseWidth = Math.round(rect.width || activeEl.offsetWidth || 0);
            baseHeight = Math.round(rect.height || activeEl.offsetHeight || 0);
            baseFontSize = parseFloat(window.getComputedStyle(activeEl).fontSize || '16') || 16;
            if (resizeHandle) {
              ensurePositionable(activeEl);
              prepareNodeForResize(activeEl);
              resizing = true;
              activeResizeHandle = resizeHandle;
              suppressClick = true;
              syncRimHover(activeEl, resizeHandle);
              event.preventDefault();
              return;
            }
            if (editingText) return;
            pendingDrag = true;
          });
          window.addEventListener('scroll', syncHoverDeletePosition, { passive: true });
          window.addEventListener('resize', syncHoverDeletePosition);
          document.addEventListener('scroll', syncHoverDeletePosition, { passive: true, capture: true });
          document.addEventListener('click', function(event) {
            if (hoverDeleteEl.contains(event.target)) return;
            if (contextMenuEl.contains(event.target)) return;
            if (isNativeFormControlTarget(event.target)) return;
            const target = resolveSelectionTarget(event.target, event);
            if (!isEditableTarget(target)) return;
            if (!isInteractiveActionNode(target)) return;
            event.preventDefault();
            event.stopPropagation();
          }, true);
          document.addEventListener('click', function(event) {
            if (hoverDeleteEl.contains(event.target)) return;
            if (contextMenuEl.contains(event.target)) return;
            if (isNativeFormControlTarget(event.target)) return;
            const target = resolveSelectionTarget(event.target, event);
            if (!isEditableTarget(target)) return;
            if (suppressClick) {
              suppressClick = false;
              return;
            }
            if (isInteractiveActionNode(target)) {
              event.preventDefault();
              event.stopPropagation();
            }
            selectNode(target, { preserveGroup: isSelectedNode(target) && selectedNodes().length > 1 });
            if (!editingText && hasInlineText(target) && !isBlockContainerNode(target) && !isSectionLikeNode(target)) {
              beginInlineEdit(target);
            }
          });
          document.addEventListener('dblclick', function(event) {
            if (isNativeFormControlTarget(event.target)) return;
            const target = normalizeEditableNode(event.target);
            if (!isEditableTarget(target)) return;
            selectNode(target, { preserveGroup: isSelectedNode(target) && selectedNodes().length > 1 });
            if (hasInlineText(target)) beginInlineEdit(target);
          });
          // Nav links inside the editor preview must never navigate this sandboxed
          // frame (it would reload as a logged-out null-origin document). Instead:
          // hash links scroll the preview, internal coach-page links ask the parent
          // to switch the editor to that page, external links open a new tab.
          let navMousedownLink = null;
          document.addEventListener('mousedown', function(event) {
            navMousedownLink = event.target instanceof Element && !hoverDeleteEl.contains(event.target) && !contextMenuEl.contains(event.target)
              ? event.target.closest('a[href],[data-standalone-route-href]')
              : null;
          }, true);
          window.addEventListener('message', function(event) {
            const d = event && event.data && typeof event.data === 'object' ? event.data : null;
            if (!d) return;
            if (d.type === 'trainer_standalone_viewport_insets') {
              parentVisibleTop = Math.max(0, Number(d.visibleTop) || 0);
              parentVisibleBottom = Math.max(0, Number(d.visibleBottom) || 0);
              return;
            }
            if (d.type === 'trainer_standalone_consult_fields_get') {
              try {
                window.parent.postMessage({ type: 'trainer_standalone_consult_fields', ...describeConsultFields() }, '*');
              } catch {}
              return;
            }
            if (d.type === 'trainer_standalone_consult_fields_set') {
              const applied = applyConsultFields(Array.isArray(d.fields) ? d.fields : [], d.submitLabel);
              try {
                window.parent.postMessage({ type: 'trainer_standalone_consult_fields', applied, ...describeConsultFields() }, '*');
              } catch {}
            }
          });
          document.addEventListener('click', function(event) {
            const direct = event.target instanceof Element && !hoverDeleteEl.contains(event.target) && !contextMenuEl.contains(event.target)
              ? event.target.closest('a[href],[data-standalone-route-href]')
              : null;
            // The selection UI (hover delete pill) can appear under the cursor
            // between mousedown and mouseup, swallowing the click target - fall
            // back to the link the press started on.
            const link = direct || navMousedownLink;
            navMousedownLink = null;
            if (!link || !link.isConnected) return;
            if (editingText && activeEl && (link === activeEl || link.contains(activeEl) || activeEl.contains(link))) return;
            const href = String(link.getAttribute('data-standalone-route-href') || link.getAttribute('href') || '').trim();
            if (!href || href === '#') {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            if (suppressClick) return;
            event.stopPropagation();
            if (href.startsWith('#')) {
              const targetId = decodeURIComponent(href.slice(1)).trim();
              const section = targetId ? document.getElementById(targetId) : null;
              if (section instanceof HTMLElement) {
                try {
                  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch {
                  section.scrollIntoView();
                }
              }
              return;
            }
            if (/^(mailto:|tel:|sms:)/i.test(href)) return;
            if (/^https?:/i.test(href)) {
              try { window.open(href, '_blank', 'noopener'); } catch {}
              return;
            }
            try {
              window.parent.postMessage({ type: 'trainer_standalone_nav', href: href }, '*');
            } catch {}
          }, true);
          const postBridgeReady = function() {
            try {
              window.parent.postMessage({ type: 'trainer_standalone_bridge_ready' }, '*');
            } catch {}
          };
          postBridgeReady();
          window.addEventListener('load', postBridgeReady);
          window.setTimeout(postBridgeReady, 220);
          window.setTimeout(postBridgeReady, 900);
          document.addEventListener('contextmenu', function(event) {
            const target = resolveSelectionTarget(event.target, event);
            if (!isEditableTarget(target)) return;
            event.preventDefault();
            if (editingText) finishInlineEdit(true);
            selectNode(target, { preserveGroup: isSelectedNode(target) && selectedNodes().length > 1 });
            showContextMenu(event.clientX, event.clientY);
          });
          document.addEventListener('touchend', function(event) {
            const touch = event.changedTouches && event.changedTouches[0];
            if (!touch) return;
            const now = Date.now();
            const target = resolveSelectionTarget(event.target, {
              target: event.target,
              clientX: touch.clientX,
              clientY: touch.clientY
            });
            if (!isEditableTarget(target)) {
              lastTouchTapAt = 0;
              lastTouchTapTarget = null;
              return;
            }
            const sameTarget = lastTouchTapTarget instanceof HTMLElement && target instanceof HTMLElement
              ? (lastTouchTapTarget === target || lastTouchTapTarget.contains(target) || target.contains(lastTouchTapTarget))
              : false;
            if (sameTarget && (now - lastTouchTapAt) < 320) {
              event.preventDefault();
              if (editingText) finishInlineEdit(true);
              selectNode(target, { preserveGroup: isSelectedNode(target) && selectedNodes().length > 1 });
              showContextMenu(touch.clientX, touch.clientY);
              lastTouchTapAt = 0;
              lastTouchTapTarget = null;
              return;
            }
            lastTouchTapAt = now;
            lastTouchTapTarget = target;
          }, { passive: false });
          contextMenuEl.addEventListener('click', function(event) {
            const routeChoiceButton = event.target && event.target.closest ? event.target.closest('[data-route-select]') : null;
            if (routeChoiceButton) {
              const routeIndex = parseInt(String(routeChoiceButton.getAttribute('data-route-select') || '-1'), 10);
              const route = Number.isFinite(routeIndex) ? standaloneRouteChoices[routeIndex] : null;
              if (!route) return;
              appendInsertedNode(createStyledActionLink(route.label || 'New button', route.href || '#', {
                onclick: route.onclick || '',
                sourceTag: route.sourceTag || ''
              }));
              hideContextMenu();
              return;
            }
            const routeToggleButton = event.target && event.target.closest ? event.target.closest('[data-route-add-toggle]') : null;
            if (routeToggleButton) {
              const form = routePickerEl?.querySelector('.route-submenu-form');
              form?.classList.add('is-active');
              routePickerEl?.querySelector('[data-route-url-input="1"]')?.focus();
              return;
            }
            const routeCreateButton = event.target && event.target.closest ? event.target.closest('[data-route-create]') : null;
            if (routeCreateButton) {
              const hrefInput = routePickerEl?.querySelector('[data-route-url-input="1"]');
              const labelInput = routePickerEl?.querySelector('[data-route-label-input="1"]');
              const href = normalizeCustomRouteHref(hrefInput?.value || '');
              const label = String(labelInput?.value || '').trim();
              if (!href || !label) return;
              appendInsertedNode(createStyledActionLink(label, href));
              hideContextMenu();
              return;
            }
            const button = event.target && event.target.closest ? event.target.closest('button[data-menu-action]') : null;
            if (!button) return;
            runMenuAction(String(button.getAttribute('data-menu-action') || '').trim());
          });
          routePickerEl?.addEventListener('keydown', function(event) {
            if (event.key !== 'Enter') return;
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) return;
            const hrefInput = routePickerEl.querySelector('[data-route-url-input="1"]');
            const labelInput = routePickerEl.querySelector('[data-route-label-input="1"]');
            const href = normalizeCustomRouteHref(hrefInput?.value || '');
            const label = String(labelInput?.value || '').trim();
            if (!href || !label) return;
            event.preventDefault();
            appendInsertedNode(createStyledActionLink(label, href));
            hideContextMenu();
          });
          window.addEventListener('mousemove', function(event) {
            if (draggingContextMenu) {
              const rect = contextMenuEl.getBoundingClientRect();
              const maxX = Math.max(8, (window.innerWidth || 0) - rect.width - 12);
              const maxY = Math.max(8, (window.innerHeight || 0) - rect.height - 12);
              const dragX = Math.max(8, Math.min((Number(event.clientX || 0) - contextMenuDragOffsetX), maxX));
              const dragY = Math.max(8, Math.min((Number(event.clientY || 0) - contextMenuDragOffsetY), maxY));
              contextMenuEl.style.left = (dragX + (window.scrollX || 0)) + 'px';
              contextMenuEl.style.top = (dragY + (window.scrollY || 0)) + 'px';
              return;
            }
            syncContextMenuDragHover(event);
            if (marqueeSelecting) {
              startX = Number(event.clientX || 0);
              startY = Number(event.clientY || 0);
              const dx = startX - marqueeStartX;
              const dy = startY - marqueeStartY;
              if (!marqueeHasMoved && (Math.abs(dx) >= 4 || Math.abs(dy) >= 4)) marqueeHasMoved = true;
              if (!marqueeHasMoved) return;
              updateMarqueeBox();
              const nodes = marqueeCandidates();
              const primary = nodes[0] || null;
              selectNodes(nodes, primary, { announce: false });
              return;
            }
            if (activeEl && !dragging && !editingText) {
              syncRimHover(activeEl, detectResizeHandle(activeEl, event));
            }
            if (!dragging && !resizing && !editingText) {
              const hoverTarget = resolveSelectionTarget(event.target, event);
              const hoverHandle = hoverTarget instanceof HTMLElement ? detectResizeHandle(hoverTarget, event) : '';
              if (hoverTarget instanceof HTMLElement && hoverHandle && hoverTarget !== activeEl) setHoveredResizeTarget(hoverTarget, hoverHandle);
              else setHoveredResizeTarget(null, '');
            } else {
              setHoveredResizeTarget(null, '');
              hideHoverDelete();
            }
            if (editingShapeHandle != null && editingShapeHandle >= 0 && activeEl?.hasAttribute('data-standalone-custom-shape')) {
              const svgRect = activeEl.getBoundingClientRect();
              const x = ((Number(event.clientX || 0) - svgRect.left) / Math.max(svgRect.width || 1, 1)) * 100;
              const y = ((Number(event.clientY || 0) - svgRect.top) / Math.max(svgRect.height || 1, 1)) * 100;
              const points = readCustomShapePoints(activeEl);
              if (points[editingShapeHandle]) {
                points[editingShapeHandle] = {
                  x: Math.max(0, Math.min(100, x)),
                  y: Math.max(0, Math.min(100, y))
                };
                writeCustomShapePoints(activeEl, points);
                syncCustomShapeVisual(activeEl);
              }
              return;
            }
            if (pendingDrag && activeEl) {
              const dx = Number(event.clientX || 0) - startX;
              const dy = Number(event.clientY || 0) - startY;
              if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
              pendingDrag = false;
              const movableNodes = (selectedNodes().length > 1 ? selectedNodes() : [activeEl]).filter((node) => node instanceof HTMLElement && !isBlockContainerNode(node));
              if (!movableNodes.length) return;
              dragging = true;
              suppressClick = true;
              hideHoverDelete();
              groupDragItems = movableNodes.map((node) => {
                applyLayoutMode(node, 'over');
                return {
                  node,
                  left: parseFloat(node.style.left || '0') || 0,
                  top: parseFloat(node.style.top || '0') || 0
                };
              });
              groupDragItems.forEach((item) => setDraggingState(item.node, true));
            }
            if (resizing && activeEl) {
              const dx = Number(event.clientX || 0) - startX;
              const dy = Number(event.clientY || 0) - startY;
              const minWidth = 24;
              const minHeight = 24;
              const blockLayout = isBlockLayoutNode(activeEl);
              if (hasInlineText(activeEl) && !isBlockContainerNode(activeEl)) {
                const horizontalScale = baseWidth ? ((baseWidth + dx) / baseWidth) : 1;
                const verticalScale = baseHeight ? ((baseHeight + dy) / baseHeight) : 1;
                let scale = 1;
                if (activeResizeHandle === 'e' || activeResizeHandle === 'w') scale = horizontalScale;
                else if (activeResizeHandle === 'n' || activeResizeHandle === 's') scale = verticalScale;
                else scale = Math.max(horizontalScale, verticalScale);
                activeEl.style.fontSize = Math.max(8, Math.round(baseFontSize * Math.max(0.2, scale))) + 'px';
                return;
              }
              if (activeResizeHandle.includes('e')) activeEl.style.width = Math.max(minWidth, baseWidth + dx) + 'px';
              if (activeResizeHandle.includes('s')) activeEl.style.height = Math.max(minHeight, baseHeight + dy) + 'px';
              if (activeResizeHandle.includes('w')) {
                activeEl.style.width = Math.max(minWidth, baseWidth - dx) + 'px';
                if (!blockLayout) activeEl.style.left = (baseLeft + dx) + 'px';
              }
              if (activeResizeHandle.includes('n')) {
                activeEl.style.height = Math.max(minHeight, baseHeight - dy) + 'px';
                if (!blockLayout) activeEl.style.top = (baseTop + dy) + 'px';
              }
              return;
            }
            if (!dragging || !activeEl) return;
            const dx = Number(event.clientX || 0) - startX;
            const dy = Number(event.clientY || 0) - startY;
            if (groupDragItems.length > 1) {
              groupDragItems.forEach((item) => {
                item.node.style.left = (item.left + dx) + 'px';
                item.node.style.top = (item.top + dy) + 'px';
              });
              return;
            }
            if (groupDragItems.length === 1) {
              groupDragItems[0].node.style.left = (groupDragItems[0].left + dx) + 'px';
              groupDragItems[0].node.style.top = (groupDragItems[0].top + dy) + 'px';
              syncMediaDropHighlight(event, groupDragItems[0].node);
              return;
            }
            activeEl.style.left = (baseLeft + dx) + 'px';
            activeEl.style.top = (baseTop + dy) + 'px';
            syncMediaDropHighlight(event, activeEl);
          });
          window.addEventListener('mouseup', function(event) {
            if (draggingContextMenu) {
              draggingContextMenu = false;
              contextMenuEl.removeAttribute('data-menu-dragging');
              syncContextMenuDragHover(event);
              return;
            }
            if (marqueeSelecting) {
              const keepSelection = marqueeHasMoved && selectedNodes().length;
              hideMarquee();
              marqueeSelecting = false;
              if (keepSelection) {
                if (activeEl) postSelection();
              } else {
                clearSelection();
              }
              return;
            }
            if (editingShapeHandle != null && editingShapeHandle >= 0) {
              editingShapeHandle = null;
              syncMarkupToParent();
              postSelection();
              return;
            }
            if (pendingDrag) {
              pendingDrag = false;
              suppressClick = false;
            }
            const wasDragging = dragging;
            const wasResizing = resizing;
            if (!wasDragging && !wasResizing) return;
            dragging = false;
            resizing = false;
            activeResizeHandle = '';
            if (groupDragItems.length) groupDragItems.forEach((item) => setDraggingState(item.node, false));
            else setDraggingState(activeEl, false);
            syncRimHover(activeEl, '');
            if (wasResizing && activeEl && isBlockContainerNode(activeEl)) {
              activeEl.setAttribute('data-standalone-layout', 'block');
              clearOverlayPlacement(activeEl);
            }
            if (wasDragging) {
              const draggedNode = groupDragItems.length === 1 ? groupDragItems[0].node : activeEl;
              if (isUploadedMediaNode(draggedNode)) {
                const dropBox = findMediaDropBox(event.clientX, event.clientY, draggedNode);
                if (dropBox) embedMediaIntoBox(draggedNode, dropBox);
              }
            }
            setMediaDropTargetBox(null);
            setHoveredResizeTarget(null, '');
            if (activeEl) showHoverDelete(activeEl);
            groupDragItems = [];
            syncMarkupToParent();
            postSelection();
          });
          document.addEventListener('mouseout', function(event) {
            setHoveredResizeTarget(null, '');
          });
          document.addEventListener('focusout', function(event) {
            if (!editingText || !activeEl) return;
            if (event.target !== activeEl) return;
            window.setTimeout(function() {
              if (!editingText) return;
              const activeNode = document.activeElement;
              if (activeNode === activeEl) return;
              finishInlineEdit(true);
            }, 0);
          }, true);
          document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') hideContextMenu();
            const targetTag = String(event.target?.tagName || '').toLowerCase();
            const targetEditable = event.target instanceof HTMLElement && (event.target.isContentEditable || ['input','textarea','select'].includes(targetTag));
            if (editingText && (event.key === 'Delete' || event.key === 'Backspace')) {
              event.stopPropagation();
              return;
            }
            if (!targetEditable && activeEl && (event.ctrlKey || event.metaKey)) {
              const hotkey = String(event.key || '').toLowerCase();
              if (hotkey === 'z') {
                event.preventDefault();
                event.stopPropagation();
                window.parent.postMessage({
                  type: 'trainer_standalone_history',
                  action: event.shiftKey ? 'redo' : 'undo',
                  x: window.scrollX || 0,
                  y: window.scrollY || 0
                }, '*');
                return;
              }
              if (hotkey === 'y') {
                event.preventDefault();
                event.stopPropagation();
                window.parent.postMessage({
                  type: 'trainer_standalone_history',
                  action: 'redo'
                }, '*');
                return;
              }
              if (hotkey === 'c') {
                event.preventDefault();
                clipboardMarkup = activeEl.outerHTML;
                return;
              }
              if (hotkey === 'x') {
                event.preventDefault();
                clipboardMarkup = activeEl.outerHTML;
                deleteNode(activeEl);
                return;
              }
              if (hotkey === 'v' && clipboardMarkup) {
                event.preventDefault();
                const wrap = document.createElement('div');
                wrap.innerHTML = clipboardMarkup;
                const node = wrap.firstElementChild;
                if (!(node instanceof HTMLElement)) return;
                insertAfterActive(node);
                return;
              }
            }
            if (!editingText && activeEl && (event.key === 'Delete' || event.key === 'Backspace')) {
              if (!targetEditable) {
                event.preventDefault();
                deleteNode(activeEl);
                return;
              }
            }
            if (!editingText || !activeEl || event.target !== activeEl) return;
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              activeEl.blur();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              finishInlineEdit(false);
              activeEl.focus();
            }
          }, true);
          document.addEventListener('input', function(event) {
            if (!editingText || !activeEl || event.target !== activeEl) return;
            syncMarkupToParent();
            postSelection();
          }, true);
          function reportScrollState(token) {
            try {
              window.parent.postMessage({
                type: 'trainer_standalone_scroll_state',
                x: window.scrollX || 0,
                y: window.scrollY || 0,
                token: token || ''
              }, '*');
            } catch (err) {}
          }
          let scrollReportTimer = 0;
          window.addEventListener('scroll', function() {
            if (scrollReportTimer) return;
            scrollReportTimer = window.setTimeout(function() {
              scrollReportTimer = 0;
              reportScrollState();
            }, 120);
          }, { passive: true });
          window.addEventListener('message', function(event) {
            const data = event && event.data && typeof event.data === 'object' ? event.data : null;
            if (!data) return;
            if (data.type === 'trainer_standalone_clear_selection') {
              clearSelection();
              return;
            }
            if (data.type === 'trainer_standalone_flush') {
              if (editingText) finishInlineEdit(true);
              syncMarkupToParent();
              return;
            }
            if (data.type === 'trainer_standalone_scroll_capture') {
              reportScrollState(String(data.token || ''));
              return;
            }
            if (data.type === 'trainer_standalone_media_progress') {
              const progressToken = String(data.token || '').trim();
              const pendingBox = progressToken ? document.querySelector('[data-standalone-media-pending="' + progressToken + '"]') : null;
              if (pendingBox instanceof HTMLElement) {
                const percent = Math.max(0, Math.min(100, Math.round(Number(data.percent) || 0)));
                pendingBox.textContent = (String(data.kind || '') === 'video' ? 'Uploading video... ' : 'Uploading image... ') + percent + '%';
              }
              return;
            }
            if (data.type === 'trainer_standalone_media_done') {
              const token = String(data.token || '').trim();
              const pending = token ? document.querySelector('[data-standalone-media-pending="' + token + '"]') : null;
              if (!(pending instanceof HTMLElement)) return;
              const targetBox = pendingMediaTargetBoxes[token];
              delete pendingMediaTargetBoxes[token];
              if (data.ok === true && typeof data.url === 'string' && data.url) {
                const media = String(data.kind || '') === 'video' ? buildUploadedVideoNode(data.url, data.poster) : buildUploadedImageNode(data.url);
                pending.replaceWith(media);
                if (targetBox instanceof HTMLElement && targetBox.isConnected) embedMediaIntoBox(media, targetBox);
                selectAndSync(media);
              } else {
                pending.remove();
                syncMarkupToParent();
              }
              return;
            }
            if (data.type === 'trainer_standalone_scroll_restore') {
              const targetX = Number(data.x) || 0;
              const targetY = Number(data.y) || 0;
              let scrollAttempts = 0;
              const tryRestoreScroll = function() {
                scrollAttempts += 1;
                window.scrollTo(targetX, targetY);
                const maxY = Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
                if (scrollAttempts < 14 && maxY < targetY) window.setTimeout(tryRestoreScroll, 90);
              };
              tryRestoreScroll();
              return;
            }
            if (data.type !== 'trainer_standalone_apply_style' || !activeEl) return;
            if (editingText) finishInlineEdit(true);
            if (typeof data.text === 'string') activeEl.textContent = data.text;
            if (typeof data.fontSize === 'string') activeEl.style.fontSize = data.fontSize;
            if (typeof data.color === 'string') {
              if (activeEl.hasAttribute('data-standalone-custom-shape')) {
                const polygon = activeEl.querySelector('polygon[data-shape-polygon]');
                if (polygon) polygon.setAttribute('fill', data.color);
              } else if (activeEl.hasAttribute('data-standalone-shape')) {
                if (String(activeEl.getAttribute('data-standalone-shape') || '') === 'triangle') activeEl.style.borderBottomColor = data.color;
                else activeEl.style.background = data.color;
              } else {
                activeEl.style.color = data.color;
              }
            }
            if (typeof data.backgroundColor === 'string' && data.backgroundColor.trim()) {
              if (activeEl.hasAttribute('data-standalone-custom-shape')) {
                const polygon = activeEl.querySelector('polygon[data-shape-polygon]');
                if (polygon) polygon.setAttribute('fill', data.backgroundColor);
              } else if (activeEl.hasAttribute('data-standalone-shape')) {
                if (String(activeEl.getAttribute('data-standalone-shape') || '') === 'triangle') activeEl.style.borderBottomColor = data.backgroundColor;
                else activeEl.style.background = data.backgroundColor;
              } else {
                activeEl.style.background = data.backgroundColor;
              }
            }
            if (typeof data.fontWeight === 'string') activeEl.style.fontWeight = data.fontWeight;
            if (typeof data.fontFamily === 'string') activeEl.style.fontFamily = data.fontFamily;
            if (typeof data.fontStyle === 'string') activeEl.style.fontStyle = data.fontStyle;
            syncMarkupToParent();
            postSelection();
          });
          shapeRowEl?.addEventListener('mouseenter', function() {
            shapeRowEl.classList.add('is-open');
          });
          shapeRowEl?.addEventListener('mouseleave', function(event) {
            const nextTarget = event?.relatedTarget;
            if (nextTarget instanceof Node && shapeRowEl.contains(nextTarget)) return;
            shapeRowEl.classList.remove('is-open');
          });
          shapeRowEl?.querySelector('button[data-menu-action="shape"]')?.addEventListener('mouseenter', function() {
            shapeRowEl.classList.add('is-open');
          });
          shapeRowEl?.querySelector('.shape-submenu')?.addEventListener('mouseenter', function() {
            shapeRowEl.classList.add('is-open');
          });
          let routePickerCloseTimer = 0;
          buttonRouteRowEl?.addEventListener('mouseenter', function() {
            window.clearTimeout(routePickerCloseTimer);
            openRoutePicker();
          });
          buttonRouteRowEl?.addEventListener('mouseleave', function(event) {
            const nextTarget = event?.relatedTarget;
            if (nextTarget instanceof Node && buttonRouteRowEl.contains(nextTarget)) return;
            window.clearTimeout(routePickerCloseTimer);
            routePickerCloseTimer = window.setTimeout(function() {
              // Keep the picker open while the trainer is typing in the Add
              // route form even if the pointer drifts away.
              if (routePickerEl && routePickerEl.contains(document.activeElement)) return;
              if (buttonRouteRowEl.matches(':hover') || routePickerEl?.matches(':hover')) return;
              closeRoutePicker();
            }, 240);
          });
          buttonRouteRowEl?.querySelector('button[data-menu-action="button"]')?.addEventListener('mouseenter', function() {
            openRoutePicker();
          });
          routePickerEl?.addEventListener('mouseenter', function() {
            openRoutePicker();
          });
          routePickerEl?.addEventListener('mouseleave', function(event) {
            const nextTarget = event?.relatedTarget;
            if (nextTarget instanceof Node && buttonRouteRowEl.contains(nextTarget)) return;
          });
          routePickerEl?.addEventListener('focusin', function() {
            openRoutePicker();
          });
          routePickerEl?.addEventListener('focusout', function() {
          });
          window.addEventListener('resize', positionRoutePicker);
        })();
      ${'</script>'}
    `;
    if (parsed.fullDocument) {
      const closingHead = parsed.fullDocument.match(/<\/head>/i);
      const closingBody = parsed.fullDocument.match(/<\/body>/i);
      let next = parsed.fullDocument;
      const inlinePreviewCsp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action https: mailto:; img-src data: http: https:; media-src data: http: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' 'unsafe-eval' https:; frame-src data: https:; font-src data: https:;">`;
      const runtimeErrorStyle = '<style>#standalone-runtime-error{display:none;position:sticky;top:0;z-index:9999;padding:12px 16px;background:#fff1f1;border-bottom:1px solid rgba(155,47,47,.18);color:#9b2f2f;font:700 14px/1.5 system-ui,sans-serif;white-space:pre-wrap}#standalone-runtime-error.show{display:block}</style>';
      const runtimeErrorMarkup = '<div id="standalone-runtime-error" role="alert"></div>';
      const scriptExecutorMarkup = standaloneInlineScriptExecutor(parsed.scripts);
      if (/<meta[^>]+name=(["'])viewport\1[^>]*>/i.test(next)) {
        next = next.replace(/<meta[^>]+name=(["'])viewport\1[^>]*>/i, `<meta name="viewport" content="${viewportContent}">`);
      }
      if (/<meta[^>]+http-equiv=(["'])Content-Security-Policy\1[^>]*>/i.test(next)) {
        next = next.replace(/<meta[^>]+http-equiv=(["'])Content-Security-Policy\1[^>]*>/i, inlinePreviewCsp);
      }
      if (closingHead) next = next.replace(/<\/head>/i, `${!/<meta[^>]+name=(["'])viewport\1[^>]*>/i.test(next) ? `<meta name="viewport" content="${viewportContent}">` : ''}${!/<meta[^>]+http-equiv=(["'])Content-Security-Policy\1[^>]*>/i.test(next) ? inlinePreviewCsp : ''}${runtimeErrorStyle}${rootLayoutGuardStyle}${viewportGuardStyle}${buttonEnhancementStyle}${bridgeStyle}</head>`);
      else next = next.replace(/<html[^>]*>/i, (match) => `${match}<head><meta name="viewport" content="${viewportContent}">${inlinePreviewCsp}${runtimeErrorStyle}${rootLayoutGuardStyle}${viewportGuardStyle}${buttonEnhancementStyle}${bridgeStyle}</head>`);
      if (closingBody) next = next.replace(/<\/body>/i, `${runtimeErrorMarkup}${bridgeScript}${scriptExecutorMarkup}${initialScrollScript}</body>`);
      else next = `${next}${runtimeErrorMarkup}${bridgeScript}${scriptExecutorMarkup}${initialScrollScript}`;
      return next;
    }
    return `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="${viewportContent}">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action https: mailto:; img-src data: http: https:; media-src data: http: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' 'unsafe-eval' https:; frame-src data: https:; font-src data: https:;">
        <style>#standalone-runtime-error{display:none;position:sticky;top:0;z-index:9999;padding:12px 16px;background:#fff1f1;border-bottom:1px solid rgba(155,47,47,.18);color:#9b2f2f;font:700 14px/1.5 system-ui,sans-serif;white-space:pre-wrap}#standalone-runtime-error.show{display:block}</style>
        ${rootLayoutGuardStyle}
        ${viewportGuardStyle}
        ${buttonEnhancementStyle}
        ${parsed.styles.map((css) => `<style>${css}</style>`).join('\n')}
        ${bridgeStyle}
      </head>
      <body>
        <div id="standalone-runtime-error" role="alert"></div>
        <div id="standalone-page-root">${parsed.html || ''}</div>
        ${bridgeScript}
        ${standaloneInlineScriptExecutor(parsed.scripts)}
        ${initialScrollScript}
      </body>
      </html>
    `.trim();
  }

  function renderCustomCodePreview(page, { publicView = false, allowLegacyFallback = true } = {}) {
    const standaloneRoute = isStandalonePublicCoachRoute();
    const publicRouteBasePath = String(builderPagePath(page) || '/').trim() || '/';
    const previewInlineScriptExecutor = (scriptBlocks = [], errorElementId = 'builder-runtime-error') => {
      const blocks = Array.isArray(scriptBlocks)
        ? scriptBlocks.map((block) => String(block || '')).filter((block) => block.trim())
        : [];
      if (!blocks.length) return '';
      return `
        <script>
          (function() {
            const blocks = ${JSON.stringify(blocks)};
            const errorEl = document.getElementById(${JSON.stringify(errorElementId)});
            const showScriptError = function(error) {
              if (!errorEl) return;
              const message = error && error.message ? error.message : String(error || 'Code error');
              errorEl.textContent = message;
              errorEl.classList.add('show');
            };
            blocks.forEach(function(block, index) {
              try {
                window.eval(String(block || '') + '\\n//# sourceURL=about:srcdoc-inline-script-' + (index + 1) + '.js');
              } catch (error) {
                showScriptError(error);
              }
            });
          })();
        <\/script>
      `.trim();
    };
    const previewButtonEnhancementStyle = `<style id="standalone-button-enhancement-style">a[data-standalone-route-button="1"],.coach-custom-cta,.coach-custom-secondary,.coach-custom-price-grid a,.coach-custom-booking-card a,.coach-custom-footer-links a,.cv-main-btn,.cv-link-btn,.cv-vsl-side button,.cv-offer button,.cv-form button,.cv-desktop-nav .cv-nav-cta,.cv-mobile-nav .cv-mobile-cta{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px !important;padding:0 24px !important;border-radius:999px !important;border:1px solid rgba(99,102,241,.24) !important;text-decoration:none;font:800 14px/1.15 system-ui,sans-serif !important;letter-spacing:.01em;cursor:pointer;transition:transform 140ms ease,box-shadow 140ms ease,filter 140ms ease,background-color 140ms ease,color 140ms ease,border-color 140ms ease;box-shadow:0 18px 34px rgba(15,23,42,.14),inset 0 1px 0 rgba(255,255,255,.2)}a[data-standalone-route-button="1"],.coach-custom-cta,.coach-custom-price-grid a,.coach-custom-booking-card a,.cv-main-btn,.cv-vsl-side button,.cv-form button,.cv-desktop-nav .cv-nav-cta,.cv-mobile-nav .cv-mobile-cta{background:linear-gradient(135deg,#1d4ed8 0%,#4f46e5 58%,#818cf8 100%) !important;color:#fff !important;border-color:rgba(99,102,241,.3) !important}.coach-custom-secondary,.coach-custom-footer-links a,.cv-link-btn,.cv-offer button{background:rgba(255,255,255,.08) !important;color:inherit !important;border-color:currentColor !important;box-shadow:none}#coachVSLWebsite .cv-link-btn{color:var(--cream) !important;background:rgba(255,255,255,.06) !important;border-color:rgba(217,255,66,.28) !important}#coachVSLWebsite .cv-offer button{color:var(--black) !important;background:rgba(16,16,16,.06) !important;border-color:rgba(16,16,16,.14) !important;min-height:46px !important;padding:0 18px !important}.coach-custom-footer-links a{min-height:44px !important;padding:0 18px !important;background:rgba(16,40,60,.06) !important;border-color:rgba(16,40,60,.12) !important;color:#10283c !important}#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta),#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta){border-radius:999px !important;border:1px solid transparent;transition:background-color 140ms ease,color 140ms ease,border-color 140ms ease,transform 140ms ease}a[data-standalone-route-button="1"]:hover,a[data-standalone-route-button="1"]:focus-visible,.coach-custom-cta:hover,.coach-custom-cta:focus-visible,.coach-custom-secondary:hover,.coach-custom-secondary:focus-visible,.coach-custom-price-grid a:hover,.coach-custom-price-grid a:focus-visible,.coach-custom-booking-card a:hover,.coach-custom-booking-card a:focus-visible,.coach-custom-footer-links a:hover,.coach-custom-footer-links a:focus-visible,.cv-main-btn:hover,.cv-main-btn:focus-visible,.cv-link-btn:hover,.cv-link-btn:focus-visible,.cv-vsl-side button:hover,.cv-vsl-side button:focus-visible,.cv-offer button:hover,.cv-offer button:focus-visible,.cv-form button:hover,.cv-form button:focus-visible,.cv-desktop-nav .cv-nav-cta:hover,.cv-desktop-nav .cv-nav-cta:focus-visible,.cv-mobile-nav .cv-mobile-cta:hover,.cv-mobile-nav .cv-mobile-cta:focus-visible,#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta):hover,#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta):focus-visible,#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta):hover,#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta):focus-visible{transform:translateY(-1px);filter:brightness(1.03)}a[data-standalone-route-button="1"]:hover,a[data-standalone-route-button="1"]:focus-visible,.coach-custom-cta:hover,.coach-custom-cta:focus-visible,.coach-custom-price-grid a:hover,.coach-custom-price-grid a:focus-visible,.coach-custom-booking-card a:hover,.coach-custom-booking-card a:focus-visible,.cv-main-btn:hover,.cv-main-btn:focus-visible,.cv-vsl-side button:hover,.cv-vsl-side button:focus-visible,.cv-form button:hover,.cv-form button:focus-visible,.cv-desktop-nav .cv-nav-cta:hover,.cv-desktop-nav .cv-nav-cta:focus-visible,.cv-mobile-nav .cv-mobile-cta:hover,.cv-mobile-nav .cv-mobile-cta:focus-visible{box-shadow:0 24px 44px rgba(37,99,235,.24),inset 0 1px 0 rgba(255,255,255,.24)}.coach-custom-secondary:hover,.coach-custom-secondary:focus-visible,.coach-custom-footer-links a:hover,.coach-custom-footer-links a:focus-visible,.cv-link-btn:hover,.cv-link-btn:focus-visible,.cv-offer button:hover,.cv-offer button:focus-visible,#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta):hover,#coachVSLWebsite .cv-desktop-nav button:not(.cv-nav-cta):focus-visible,#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta):hover,#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta):focus-visible{background:rgba(255,255,255,.12) !important}a[data-standalone-route-button="1"]:focus-visible,.coach-custom-cta:focus-visible,.coach-custom-secondary:focus-visible,.coach-custom-price-grid a:focus-visible,.coach-custom-booking-card a:focus-visible,.coach-custom-footer-links a:focus-visible,.cv-main-btn:focus-visible,.cv-link-btn:focus-visible,.cv-vsl-side button:focus-visible,.cv-offer button:focus-visible,.cv-form button:focus-visible,.cv-desktop-nav button:focus-visible,.cv-mobile-nav button:focus-visible{outline:2px solid rgba(129,140,248,.9);outline-offset:3px}#coachVSLWebsite .cv-mobile-nav .cv-mobile-cta{width:100%}#coachVSLWebsite .cv-mobile-nav button:not(.cv-mobile-cta){justify-content:flex-start;text-align:left;padding:0 16px !important;background:rgba(16,16,16,.02)}@media (max-width:760px){a[data-standalone-route-button="1"],.coach-custom-cta,.coach-custom-secondary,.coach-custom-price-grid a,.coach-custom-booking-card a,.coach-custom-footer-links a,.cv-main-btn,.cv-link-btn,.cv-vsl-side button,.cv-offer button,.cv-form button,.cv-mobile-nav .cv-mobile-cta{width:100%}}</style>`;
    const content = activeBuilderDraftContent(page, { publicView });
    const directCode = resolveEditableCustomCode(page, { publicView });
    const hasDirectCode = Boolean(
      String(directCode?.html || '').trim()
      || String(directCode?.css || '').trim()
      || String(directCode?.javascript || '').trim()
      || (Array.isArray(directCode?.iframes) && directCode.iframes.length)
      || (Array.isArray(directCode?.embedScripts) && directCode.embedScripts.length)
    );
    const code = hasDirectCode
      ? directCode
      : (allowLegacyFallback && typeof buildLegacyFallbackCustomCode === 'function'
          ? (buildLegacyFallbackCustomCode(page, { publicView }) || {})
          : { html: '', css: '', javascript: '', iframes: [], embedScripts: [] });
    const html = String(code.html || '').trim();
    const css = String(code.css || '').trim();
    const javascript = String(code.javascript || '').trim();
    const parsedCombined = extractCombinedCodeParts(html);
    const iframeMarkup = (Array.isArray(code.iframes) ? code.iframes : []).map((entry) => {
      if (typeof entry === 'string') {
        const src = String(entry || '').trim();
        return src ? `<iframe src="${escapeHtml(src)}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;min-height:320px;border:0;"></iframe>` : '';
      }
      const raw = entry && typeof entry === 'object' ? entry : {};
      const htmlValue = String(raw.html || '').trim();
      if (htmlValue) return htmlValue;
      const src = String(raw.src || raw.url || '').trim();
      return src ? `<iframe src="${escapeHtml(src)}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;min-height:320px;border:0;"></iframe>` : '';
    }).filter(Boolean).join('\n');
    const embedScriptMarkup = (Array.isArray(code.embedScripts) ? code.embedScripts : []).map((entry) => {
      if (typeof entry === 'string') {
        const src = String(entry || '').trim();
        return src ? `<script src="${escapeHtml(src)}"><\/script>` : '';
      }
      const raw = entry && typeof entry === 'object' ? entry : {};
      const htmlValue = String(raw.html || '').trim();
      if (htmlValue) return htmlValue.replace(/<\/script/gi, '<\\/script');
      const src = String(raw.src || raw.url || '').trim();
      return src ? `<script src="${escapeHtml(src)}"><\/script>` : '';
    }).filter(Boolean).join('\n');
    let srcdoc = '';
    if (parsedCombined.fullDocument) {
      const previewGuardStyle = `<style>html,body{margin:0 !important;padding:0 !important;width:100%;min-height:100%;overflow-x:hidden;scrollbar-width:none;-ms-overflow-style:none}html::-webkit-scrollbar,body::-webkit-scrollbar,#standalone-page-root::-webkit-scrollbar,#builder-page-root::-webkit-scrollbar{width:0;height:0}body{display:flow-root}#standalone-page-root,#builder-page-root{margin-left:auto !important;margin-right:auto !important}#standalone-page-root>:first-child,#builder-page-root>:first-child,body>:first-child{margin-top:0 !important;margin-left:auto !important;margin-right:auto !important;}#builder-runtime-error{display:none;position:sticky;top:0;z-index:9999;padding:12px 16px;background:#fff1f1;border-bottom:1px solid rgba(155,47,47,.18);color:#9b2f2f;font:700 14px/1.5 system-ui,sans-serif;white-space:pre-wrap}#builder-runtime-error.show{display:block}</style>`;
      const inlinePreviewCsp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action https: mailto:; img-src data: http: https:; media-src data: http: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' 'unsafe-eval' https:; frame-src data: https:; font-src data: https:;">`;
      const runtimeErrorMarkup = '<div id="builder-runtime-error" role="alert"></div>';
      const scriptExecutorMarkup = previewInlineScriptExecutor(parsedCombined.scripts);
      let fullDocument = parsedCombined.fullDocument;
      if (/<meta[^>]+http-equiv=(["'])Content-Security-Policy\1[^>]*>/i.test(fullDocument)) {
        fullDocument = fullDocument.replace(/<meta[^>]+http-equiv=(["'])Content-Security-Policy\1[^>]*>/i, inlinePreviewCsp);
      }
      if (/<\/head>/i.test(fullDocument)) {
        srcdoc = fullDocument.replace(/<\/head>/i, `${!/<meta[^>]+http-equiv=(["'])Content-Security-Policy\1[^>]*>/i.test(fullDocument) ? inlinePreviewCsp : ''}${previewGuardStyle}${previewButtonEnhancementStyle}</head>`);
      } else if (/<html\b[^>]*>/i.test(fullDocument)) {
        srcdoc = fullDocument.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${inlinePreviewCsp}${previewGuardStyle}${previewButtonEnhancementStyle}</head>`);
      } else {
        srcdoc = `${inlinePreviewCsp}${previewGuardStyle}${previewButtonEnhancementStyle}${fullDocument}`;
      }
      if (/<\/body>/i.test(srcdoc)) {
        srcdoc = srcdoc.replace(/<\/body>/i, `${runtimeErrorMarkup}${scriptExecutorMarkup}</body>`);
      } else {
        srcdoc = `${srcdoc}${runtimeErrorMarkup}${scriptExecutorMarkup}`;
      }
      srcdoc = srcdoc.trim();
    } else {
      srcdoc = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action https: mailto:; img-src data: http: https:; media-src data: http: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' 'unsafe-eval' https:; frame-src data: https:; font-src data: https:;">
        <style>html,body{margin:0 !important;padding:0 !important;width:100%;min-height:100%;overflow-x:hidden;scrollbar-width:none;-ms-overflow-style:none}html::-webkit-scrollbar,body::-webkit-scrollbar,#builder-page-root::-webkit-scrollbar{width:0;height:0}body{display:flow-root;font-family:Georgia,serif;background:#f8f3eb;color:#111827}#builder-runtime-error{display:none;position:sticky;top:0;z-index:9999;padding:12px 16px;background:#fff1f1;border-bottom:1px solid rgba(155,47,47,.18);color:#9b2f2f;font:700 14px/1.5 system-ui,sans-serif;white-space:pre-wrap}#builder-runtime-error.show{display:block}#builder-page-root{width:100%;min-height:100vh;display:flow-root;overflow-x:hidden;scrollbar-width:none;-ms-overflow-style:none;margin-left:auto !important;margin-right:auto !important}#builder-page-root::before{content:'';display:table;}#builder-page-root::after{content:'';display:table;clear:both;}#builder-page-root>:first-child{margin-top:0 !important;margin-left:auto !important;margin-right:auto !important;}${css}</style>
        ${parsedCombined.styles.map((styleBlock) => `<style>${styleBlock}</style>`).join('\n')}
        ${previewButtonEnhancementStyle}
      </head>
      <body>
        <div id="builder-runtime-error" role="alert"></div>
        <div id="builder-page-root">${parsedCombined.html || '<div style="padding:40px 24px;font:700 16px/1.6 system-ui,sans-serif;color:#475467">No custom code yet.</div>'}${iframeMarkup}</div>
        ${embedScriptMarkup}
        <script>
          (function(){
            const publicCtaBridgeEnabled = ${(publicView || standaloneRoute) ? 'true' : 'false'};
            const standaloneMode = ${standaloneRoute ? 'true' : 'false'};
            const errorEl = document.getElementById('builder-runtime-error');
            const rootEl = document.getElementById('builder-page-root');
            let lastPostedHeight = 0;
            let heightTick = 0;
            function defineStringProperty(target, key, fallback) {
              if (!target || typeof target !== 'object') return;
              if (typeof target[key] === 'string') return;
              try {
                Object.defineProperty(target, key, {
                  configurable: true,
                  enumerable: false,
                  value: fallback
                });
              } catch {}
            }
            function sanitizeKeydownEvent(event) {
              if (!event || typeof event !== 'object') return;
              defineStringProperty(event, 'key', '');
              defineStringProperty(event, 'code', '');
              defineStringProperty(event, 'keyIdentifier', '');
            }
            function shouldSuppressExternalKeydownError(err, source) {
              const message = String(err?.message || '').toLowerCase();
              const stack = String(err?.stack || '').toLowerCase();
              const sourceText = String(source || '').toLowerCase();
              const readsLength = message.includes("reading 'length'") || message.includes('reading "length"');
              const keydownStack = stack.includes('handlekeydown') || stack.includes('keydown');
              if (stack.includes('page-events.js') || sourceText.includes('page-events.js')) return true;
              if (readsLength && (keydownStack || sourceText.includes('page-events'))) return true;
              return false;
            }
            function measureContentHeight() {
              const rootHeight = rootEl
                ? Math.max(
                    rootEl.scrollHeight || 0,
                    rootEl.offsetHeight || 0,
                    Math.round(rootEl.getBoundingClientRect().height || 0)
                  )
                : 0;
              const errorHeight = errorEl && errorEl.classList.contains('show')
                ? Math.max(
                    errorEl.scrollHeight || 0,
                    errorEl.offsetHeight || 0,
                    Math.round(errorEl.getBoundingClientRect().height || 0)
                  )
                : 0;
              const viewportHeight = Math.max(
                window.innerHeight || 0,
                document.documentElement?.clientHeight || 0
              );
              const contentHeight = rootHeight + errorHeight;
              return Math.max(standaloneMode ? viewportHeight : 0, contentHeight, viewportHeight);
            }
            function postHeight(force) {
              if (standaloneMode) return;
              try {
                const height = measureContentHeight();
                if (!force && Math.abs(height - lastPostedHeight) <= 10) return;
                lastPostedHeight = height;
                window.parent.postMessage({ type: 'trainer_builder_resize', height }, '*');
              } catch {}
            }
            function queueHeightPost(force) {
              if (standaloneMode) return;
              if (heightTick) window.clearTimeout(heightTick);
              heightTick = window.setTimeout(function() {
                postHeight(force);
              }, force ? 0 : 80);
            }
            function showRuntimeError(message) {
              if (!errorEl) return;
              errorEl.textContent = String(message || 'Code error');
              errorEl.classList.add('show');
              queueHeightPost(true);
            }
            window.addEventListener('keydown', sanitizeKeydownEvent, true);
            document.addEventListener('keydown', sanitizeKeydownEvent, true);
            window.addEventListener('error', function(event) {
              if (shouldSuppressExternalKeydownError(event?.error, event?.filename || event?.message || '')) {
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                return;
              }
              const message = event && event.message ? event.message : 'JavaScript error';
              showRuntimeError(message);
              event.preventDefault?.();
              event.stopImmediatePropagation?.();
            }, true);
            window.addEventListener('unhandledrejection', function(event) {
              if (shouldSuppressExternalKeydownError(event?.reason, event?.reason?.stack || event?.reason?.message || '')) {
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                return;
              }
              const reason = event && event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled promise rejection';
              showRuntimeError(reason);
              event.preventDefault?.();
              event.stopImmediatePropagation?.();
            }, true);
            if (publicCtaBridgeEnabled) {
              const routeBasePath = ${JSON.stringify(publicRouteBasePath)};
              const resolveRouteUrl = (value) => {
                const raw = String(value || '').trim();
                if (!raw) return null;
                if (/^(mailto:|tel:|https?:)/i.test(raw)) {
                  try {
                    return new URL(raw);
                  } catch {
                    return null;
                  }
                }
                const fakeOrigin = 'https://standalone.local';
                const normalizedBase = routeBasePath.startsWith('/') ? routeBasePath : ('/' + routeBasePath);
                try {
                  return new URL(raw, fakeOrigin + normalizedBase);
                } catch {
                  return null;
                }
              };
              const applyLocalRouteTarget = (hashValue) => {
                const rawHash = String(hashValue || '').trim();
                if (!rawHash || rawHash === '#') return false;
                const targetId = decodeURIComponent(rawHash.replace(/^#/, '')).trim();
                if (!targetId) return false;
                const target = document.getElementById(targetId);
                if (!(target instanceof HTMLElement)) return false;
                try {
                  window.location.hash = rawHash;
                } catch {}
                try {
                  target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
                } catch {
                  target.scrollIntoView();
                }
                return true;
              };
              document.addEventListener('click', function(event) {
                const link = event.target && event.target.closest ? event.target.closest('a[href],[data-standalone-route-href]') : null;
                if (!link) return;
                const href = String(link.getAttribute('data-standalone-route-href') || link.getAttribute('href') || '').trim();
                if (!href || href === '#') return;
                if (href.startsWith('#')) {
                  event.preventDefault();
                  if (applyLocalRouteTarget(href)) return;
                }
                const targetUrl = resolveRouteUrl(href);
                if (!targetUrl) return;
                const sameDocumentRoute = (!targetUrl.pathname || targetUrl.pathname === window.location.pathname)
                  && (!targetUrl.search || targetUrl.search === window.location.search);
                if (sameDocumentRoute && targetUrl.hash) {
                  event.preventDefault();
                  if (applyLocalRouteTarget(targetUrl.hash)) return;
                }
                event.preventDefault();
                try {
                  const targetHref = (targetUrl.origin === 'https://standalone.local')
                    ? ((targetUrl.pathname || '') + (targetUrl.search || '') + (targetUrl.hash || ''))
                    : String(targetUrl.href || '').trim();
                  if (targetHref) {
                    if (window.parent && window.parent !== window && window.parent.location) {
                      window.parent.location.assign(targetHref);
                      return;
                    }
                    window.location.assign(targetHref);
                    return;
                  }
                } catch {}
                try {
                  window.parent.postMessage({
                    type: 'trainer_builder_cta',
                    href,
                    target: String(link.getAttribute('data-public-builder-cta-target') || href).trim(),
                    label: String(link.textContent || '').trim()
                  }, '*');
                } catch {
                  window.location.href = href;
                }
              });
            }
            if (!standaloneMode) {
              window.addEventListener('load', function() { queueHeightPost(true); });
              window.addEventListener('resize', function() { queueHeightPost(false); });
              if (window.MutationObserver) {
                const observer = new MutationObserver(function() { queueHeightPost(false); });
                observer.observe(rootEl || document.body || document.documentElement, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  characterData: true
                });
              }
              window.setTimeout(function() { queueHeightPost(true); }, 40);
              window.setTimeout(function() { queueHeightPost(false); }, 220);
            }
            if (publicCtaBridgeEnabled) {
              const consultFormStatus = function(form, message, isError) {
                let status = form.querySelector('[data-consult-form-status]');
                if (!status) {
                  status = document.createElement('div');
                  status.setAttribute('data-consult-form-status', '1');
                  status.style.font = '600 13px/1.4 system-ui,sans-serif';
                  form.appendChild(status);
                }
                status.style.color = isError ? '#dc2626' : '#16a34a';
                status.textContent = String(message || '');
              };
              const collectConsultFormAnswers = function(form) {
                const answers = {};
                const record = function(key, value) {
                  const cleanKey = String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
                  const cleanValue = String(value || '').trim().slice(0, 2000);
                  if (!cleanKey || !cleanValue) return;
                  answers[cleanKey] = Object.prototype.hasOwnProperty.call(answers, cleanKey)
                    ? String(answers[cleanKey]) + ', ' + cleanValue
                    : cleanValue;
                };
                form.querySelectorAll('input,textarea,select').forEach(function(field) {
                  if (!(field instanceof HTMLElement)) return;
                  const type = String(field.getAttribute('type') || '').toLowerCase();
                  if (['submit', 'button', 'reset', 'file', 'password', 'hidden'].includes(type)) return;
                  if ((type === 'checkbox' || type === 'radio') && !field.checked) return;
                  const key = field.getAttribute('name') || field.getAttribute('id')
                    || field.getAttribute('placeholder') || field.getAttribute('aria-label')
                    || (type === 'email' ? 'email' : (type === 'tel' ? 'phone' : 'field'));
                  record(key, field.value);
                });
                return answers;
              };
              let consultFormCounter = 0;
              const submitConsultForm = function(form) {
                if (form.getAttribute('data-consult-form-sending') === '1') return;
                const answers = collectConsultFormAnswers(form);
                if (!Object.keys(answers).length) {
                  consultFormStatus(form, 'Fill in the form first.', true);
                  return;
                }
                if (!form.getAttribute('data-consult-form-token')) {
                  consultFormCounter += 1;
                  form.setAttribute('data-consult-form-token', 'form-' + Date.now() + '-' + consultFormCounter);
                }
                form.setAttribute('data-consult-form-sending', '1');
                consultFormStatus(form, 'Sending...', false);
                try {
                  window.parent.postMessage({
                    type: 'trainer_builder_lead',
                    token: form.getAttribute('data-consult-form-token'),
                    formId: form.getAttribute('data-standalone-consult-form') ? 'consultation-form' : (String(form.id || '').trim() || 'custom-form'),
                    answers
                  }, '*');
                } catch {
                  form.removeAttribute('data-consult-form-sending');
                  consultFormStatus(form, 'Could not send right now.', true);
                }
              };
              window.addEventListener('message', function(event) {
                const d = event && event.data && typeof event.data === 'object' ? event.data : null;
                if (!d || d.type !== 'trainer_builder_lead_result') return;
                const form = document.querySelector('form[data-consult-form-token="' + String(d.token || '') + '"]');
                if (!form) return;
                form.removeAttribute('data-consult-form-sending');
                if (d.ok) {
                  try { form.reset(); } catch {}
                  consultFormStatus(form, d.message || 'Sent! The coach will reach out soon.', false);
                } else {
                  consultFormStatus(form, d.error || 'Could not send right now.', true);
                }
              });
              document.addEventListener('submit', function(event) {
                const form = event.target;
                if (!(form instanceof HTMLFormElement)) return;
                event.preventDefault();
                submitConsultForm(form);
              }, true);
              document.addEventListener('click', function(event) {
                const button = event.target instanceof Element
                  ? event.target.closest('form button:not([type]),form button[type="button"],form input[type="button"]')
                  : null;
                if (!button) return;
                const form = button.closest('form');
                if (!form || form.querySelector('button[type="submit"],input[type="submit"]')) return;
                event.preventDefault();
                submitConsultForm(form);
              });
            }
            const postPreviewBridgeReady = function() {
              try {
                window.parent.postMessage({ type: 'trainer_standalone_bridge_ready' }, '*');
              } catch {}
            };
            postPreviewBridgeReady();
            window.addEventListener('load', postPreviewBridgeReady);
            window.setTimeout(postPreviewBridgeReady, 260);
            window.setTimeout(postPreviewBridgeReady, 950);
          })();
        <\/script>
        ${previewInlineScriptExecutor([
          ...(Array.isArray(parsedCombined.scripts) ? parsedCombined.scripts : []),
          String(javascript || '')
        ])}
      </body>
      </html>
    `.trim();
    }
    return `
      <section class="trainer-profile-card trainer-profile-builder-custom-code${publicView ? ' is-public-site' : ' is-editor-preview'}">
        ${publicView ? '' : `<div class="trainer-builder-browser-chrome">
          <div class="trainer-builder-browser-dots" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div class="trainer-builder-browser-url">riseforit coach site preview</div>
        </div>`}
        <iframe
          title="Custom page preview"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          allow="fullscreen; clipboard-read *; clipboard-write *"
          referrerpolicy="no-referrer"
          data-builder-preview-frame="1"
          data-builder-preview-surface="${publicView ? 'public' : 'editor'}"
          srcdoc="${escapeHtml(srcdoc)}"
          style="width:100%;height:${standaloneRoute ? '100vh' : (publicView ? 'auto' : 'auto')};min-height:${standaloneRoute ? '100vh' : (publicView ? '720px' : '640px')};border:0;background:#fff;display:block;"
        ></iframe>
      </section>
    `;
  }

  function renderActiveBuilderPage(page, { publicView = false } = {}) {
    const standaloneRoute = isStandalonePublicCoachRoute();
    return renderCustomCodePreview(page, {
      publicView,
      allowLegacyFallback: !standaloneRoute
    });
  }

  function pageHasRenderableCustomCode(page, { publicView = false } = {}) {
    const code = resolveEditableCustomCode(page, { publicView });
    return Boolean(
      String(code?.html || '').trim()
      || String(code?.css || '').trim()
      || String(code?.javascript || '').trim()
      || (Array.isArray(code?.iframes) && code.iframes.length)
      || (Array.isArray(code?.embedScripts) && code.embedScripts.length)
    );
  }

  function serializeSimpleCodeBlock(page, { publicView = false } = {}) {
    const code = resolveEditableCustomCode(page, { publicView });
    if (isPlaceholderCustomCode(code)) return '';
    const html = String(code?.html || '').trim();
    const css = String(code?.css || '').trim();
    const javascript = String(code?.javascript || '').trim();
    const iframes = (Array.isArray(code?.iframes) ? code.iframes : [])
      .map((entry) => (typeof entry === 'string'
        ? String(entry || '').trim()
        : String(entry?.html || entry?.src || entry?.url || '').trim()))
      .filter(Boolean)
      .join('\n');
    const embeds = (Array.isArray(code?.embedScripts) ? code.embedScripts : [])
      .map((entry) => (typeof entry === 'string'
        ? String(entry || '').trim()
        : String(entry?.html || entry?.src || entry?.url || '').trim()))
      .filter(Boolean)
      .join('\n');
    return [html, css ? `<style>\n${css}\n</style>` : '', javascript ? `<script>\n${javascript}\n<\/script>` : '', iframes, embeds]
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  function builderNavigationPages() {
    const source = pageState.publicPagePayload?.navigation?.length
      ? pageState.publicPagePayload.navigation
      : (Array.isArray(pageState.trainerPages) ? pageState.trainerPages : []);
    return source.slice().sort((a, b) => {
      const left = Number.isFinite(Number(a?.navOrder)) ? Number(a.navOrder) : 0;
      const right = Number.isFinite(Number(b?.navOrder)) ? Number(b.navOrder) : 0;
      if (left !== right) return left - right;
      return String(a?.pageName || '').localeCompare(String(b?.pageName || ''));
    }).map((page) => ({
      id: page.id,
      siteSlug: page.siteSlug || '',
      pageSlug: page.pageSlug || '',
      pageName: page.pageName || 'Page',
      navLabel: page.navLabel || page.pageName || 'Page',
      navOrder: Number.isFinite(Number(page?.navOrder)) ? Number(page.navOrder) : 0,
      isHome: page.isHome === true,
      publicPath: builderPagePath(page),
      isPublished: page.isPublished === true
    }));
  }

  function renderBuilderNavigation(page, { publicView = false } = {}) {
    const items = builderNavigationPages();
    if (!items.length) return '';
    const currentPath = builderPagePath(page);
    return `
      <nav class="trainer-profile-card trainer-profile-builder-nav" aria-label="Coach site navigation">
        <div class="trainer-builder-nav-label">Site pages</div>
        <div class="trainer-profile-chip-row trainer-profile-detail-chip-row trainer-profile-simple-chips">
          ${items.map((item) => `
            <a
              class="trainer-profile-chip${item.publicPath === currentPath ? '' : ' soft'}"
              href="${escapeHtml(item.publicPath || '#')}"
              ${publicView || item.isPublished ? '' : 'data-builder-draft-link="1"'}
            >${escapeHtml(item.navLabel || item.pageName || 'Page')}</a>
          `).join('')}
        </div>
      </nav>
    `;
  }

  function renderBuilderMetaEditor(page) {
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Page settings</div>
        <h2 class="trainer-profile-section-title">Identity and routing</h2>
        <div class="trainer-profile-editor-help">Keep page naming and public slugs tight here. The live canvas updates without leaving the workspace.</div>
        <form id="trainer-page-meta-form" class="trainer-profile-editor-grid two">
          <label class="trainer-profile-editor-field">
            <span>Page name</span>
            <input id="trainer-page-name" type="text" value="${escapeHtml(String(page?.pageName || '').trim())}" placeholder="Home">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Navigation label</span>
            <input id="trainer-page-nav-label" type="text" value="${escapeHtml(String(page?.navLabel || '').trim())}" placeholder="Home">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Coach slug</span>
            <input id="trainer-page-site-slug" type="text" value="${escapeHtml(String(page?.siteSlug || '').trim())}" placeholder="coach-name">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Page slug</span>
            <input id="trainer-page-slug" type="text" value="${escapeHtml(String(page?.pageSlug || '').trim())}" placeholder="leave blank for home page">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Home page</span>
            <select id="trainer-page-is-home">
              <option value="false"${page?.isHome ? '' : ' selected'}>No</option>
              <option value="true"${page?.isHome ? ' selected' : ''}>Yes</option>
            </select>
          </label>
          <div class="trainer-profile-editor-field">
            <span>Public URL</span>
            <div class="trainer-profile-note">${escapeHtml(builderPagePath(page))}</div>
          </div>
        </form>
      </section>
    `;
  }

  function renderBuilderCustomCodeEditor(page) {
    const code = resolveEditableCustomCode(page, { publicView: false });
    const activeTab = String(editorState.editorCodeTab || 'html').trim().toLowerCase() || 'html';
    const tabs = [
      ['html', 'HTML'],
      ['css', 'CSS'],
      ['javascript', 'JS']
    ];
    const codeSummary = [
      String(code?.html || '').trim() ? 'HTML ready' : 'HTML empty',
      String(code?.css || '').trim() ? 'CSS ready' : 'CSS empty',
      String(code?.javascript || '').trim() ? 'JS ready' : 'JS empty'
    ];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Code workspace</div>
        <h2 class="trainer-profile-section-title">HTML, CSS, and JavaScript</h2>
        <div class="trainer-profile-editor-help">Build the full trainer website here with HTML for structure, CSS for design, JavaScript for interactions, plus optional iframe and script embeds for hosted widgets.</div>
        <div class="trainer-builder-code-summary">
          ${codeSummary.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="trainer-builder-code-tabs">
          ${tabs.map(([value, label]) => `<button type="button" class="trainer-builder-code-tab${activeTab === value ? ' is-active' : ''}" data-builder-code-tab="${value}">${label}</button>`).join('')}
        </div>
        <form id="trainer-page-code-form" class="trainer-profile-editor-grid">
          <label class="trainer-profile-editor-field trainer-builder-code-pane${activeTab === 'html' ? ' is-active' : ''}" data-builder-code-pane="html">
            <span>HTML</span>
            <textarea id="trainer-page-code-html" placeholder="<section>...</section>">${escapeHtml(String(code?.html || '').trim())}</textarea>
            <span>Iframe embeds</span>
            <textarea id="trainer-page-code-iframes" placeholder="https://example.com/embed or full &lt;iframe&gt; markup, one per line">${escapeHtml((Array.isArray(code?.iframes) ? code.iframes : [])
      .map((entry) => (typeof entry === 'string'
        ? String(entry || '').trim()
        : String(entry?.html || entry?.src || entry?.url || '').trim()))
      .filter(Boolean)
      .join('\n'))}</textarea>
            <span>External embed scripts</span>
            <textarea id="trainer-page-code-embeds" placeholder="https://example.com/widget.js or full &lt;script&gt; markup, one per line">${escapeHtml((Array.isArray(code?.embedScripts) ? code.embedScripts : [])
      .map((entry) => (typeof entry === 'string'
        ? String(entry || '').trim()
        : String(entry?.html || entry?.src || entry?.url || '').trim()))
      .filter(Boolean)
      .join('\n'))}</textarea>
          </label>
          <label class="trainer-profile-editor-field trainer-builder-code-pane${activeTab === 'css' ? ' is-active' : ''}" data-builder-code-pane="css">
            <span>CSS</span>
            <textarea id="trainer-page-code-css" placeholder="body { ... }">${escapeHtml(String(code?.css || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field trainer-builder-code-pane${activeTab === 'javascript' ? ' is-active' : ''}" data-builder-code-pane="javascript">
            <span>JavaScript</span>
            <textarea id="trainer-page-code-js" placeholder="console.log('ready')">${escapeHtml(String(code?.javascript || '').trim())}</textarea>
          </label>
        </form>
      </section>
    `;
  }

  function renderBuilderVersionHistory() {
    const versions = Array.isArray(editorState.versions) ? editorState.versions : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Versions</div>
        <h2 class="trainer-profile-section-title">Draft and publish history</h2>
        <div class="trainer-profile-muted" style="margin-bottom:12px;">Manual saves, autosaves, publishes, and restores are stored here for this page.</div>
        ${editorState.versionLoading ? '<div class="trainer-profile-muted">Loading versions...</div>' : ''}
        ${!editorState.versionLoading && versions.length ? `
          <div class="account-trainer-list account-trainer-list-compact" data-page-version-list="1">
            ${versions.map((version) => `
              <div class="account-trainer-list-item">
                <strong>${escapeHtml(String(version?.versionKind || 'manual_save').replaceAll('_', ' '))}</strong>
                <div class="account-trainer-muted">${escapeHtml(formatShortDate(version?.createdAt) || 'Recently')}</div>
                <button type="button" class="trainer-profile-editor-btn" data-builder-version-restore="${escapeHtml(String(version?.id || '').trim())}">Restore</button>
              </div>
            `).join('')}
        ` : ''}
        ${!editorState.versionLoading && !versions.length ? '<div class="trainer-profile-muted">No saved versions yet.</div>' : ''}
      </section>
    `;
  }

  function renderBuilderEditorShell(page) {
    return `
      <section class="trainer-builder-editor-shell">
        <div class="trainer-builder-editor-sticky">
          <div class="trainer-builder-editor-kicker">Editor</div>
          <div class="trainer-builder-editor-title">Trainer website studio</div>
          <div class="trainer-builder-editor-sub">This is a code-first website editor. Build the public trainer page with HTML, CSS, JavaScript, and safe embeds while the live rendered page stays visible beside it.</div>
          <div class="trainer-builder-editor-shortcuts">
            <span>HTML / CSS / JS</span>
            <span>Live preview</span>
            <span>Draft / published</span>
            <span>Safe embeds</span>
          </div>
          <div class="trainer-builder-editor-panels">
            ${renderBuilderMetaEditor(page)}
            ${renderBuilderCustomCodeEditor(page)}
            ${renderBuilderVersionHistory()}
          </div>
        </div>
      </section>
    `;
  }

  function renderStandaloneBuilderSetup(page, trainer) {
    const codeBlock = serializeSimpleCodeBlock(page, { publicView: false });
    const previewCodeBlock = sanitizeStandaloneEditorMarkup(codeBlock);
    const narrowViewport = window.matchMedia('(max-width: 767px)').matches;
    const mobilePreview = editorState.previewDevice === 'mobile';
    const desktopPreviewOnPhone = narrowViewport && !mobilePreview;
    const desktopPreviewWidth = 1920;
    const desktopPreviewHeight = 1080;
    const desktopPreviewChromePadding = 10;
    const desktopPreviewChromeTop = 28;
    const desktopPreviewScale = desktopPreviewOnPhone
      ? Math.max(
          0.16,
          Math.min(
            1,
            (Math.max(320, window.innerWidth - 28 - (desktopPreviewChromePadding * 2)) / desktopPreviewWidth),
            (Math.max(220, window.innerHeight - 340 - desktopPreviewChromeTop - (desktopPreviewChromePadding * 2)) / desktopPreviewHeight)
          )
        )
      : 1;
    const desktopPreviewFrameWidth = Math.round(desktopPreviewWidth * desktopPreviewScale);
    const desktopPreviewFrameHeight = Math.round(desktopPreviewHeight * desktopPreviewScale);
    const desktopPreviewShellWidth = desktopPreviewFrameWidth + (desktopPreviewChromePadding * 2);
    const desktopPreviewShellHeight = desktopPreviewFrameHeight + desktopPreviewChromeTop + (desktopPreviewChromePadding * 2);
    const previewFrameMarkup = desktopPreviewOnPhone
      ? `
          <div class="trainer-builder-setup-preview-shell is-desktop-mobile">
            <div class="trainer-builder-setup-preview-screen">
              <iframe
                title="Live code preview"
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
                allow="fullscreen; clipboard-read *; clipboard-write *"
                referrerpolicy="no-referrer"
                data-standalone-live-preview="1"
                style="width:${desktopPreviewWidth}px;min-width:${desktopPreviewWidth}px;height:${desktopPreviewHeight}px;min-height:${desktopPreviewHeight}px;border:0;background:#ffffff;display:block;transform:scale(${desktopPreviewScale});transform-origin:top left;"
                srcdoc="${escapeHtml(buildStandalonePreviewSrcdoc(previewCodeBlock, { editable: true, viewportMode: 'desktop' }))}"
              ></iframe>
            </div>
          </div>
        `
      : `
          <iframe
            title="Live code preview"
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            allow="fullscreen; clipboard-read *; clipboard-write *"
            referrerpolicy="no-referrer"
            data-standalone-live-preview="1"
            style="${mobilePreview ? 'width:min(430px,100%);max-width:100%;min-height:100%;height:100%;border:0;background:#ffffff;border-radius:28px 28px 0 0;box-shadow:0 30px 70px rgba(9,25,37,.18);display:block;' : 'width:100%;min-height:100%;height:100%;border:0;background:#ffffff;display:block;'}"
            srcdoc="${escapeHtml(buildStandalonePreviewSrcdoc(previewCodeBlock, { editable: true }))}"
          ></iframe>
        `;
    return `
      <section class="trainer-builder-setup-shell" style="position:relative;width:100%;min-height:100vh;margin:0 auto;display:block;padding:0 0 180px;overflow:hidden;background:#ffffff;">
        <style>
          .trainer-builder-setup-shell {
            margin-top: 0 !important;
          }
          .trainer-builder-setup-input {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 44;
            display: grid;
            gap: 10px;
            justify-items: start;
            width: 100%;
            padding: 0 18px 18px;
            pointer-events: none;
          }
          .trainer-builder-setup-code-toolbar {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 10px;
            padding: 0;
            position: static;
            justify-self: start;
            width: min(100%, var(--trainer-standalone-code-width, 100%));
            background: transparent;
            box-shadow: none;
            border: 0;
            pointer-events: auto;
          }
          .trainer-builder-setup-textarea-shell {
            position: relative;
            justify-self: start;
            width: 100%;
            max-width: 100%;
            margin-right: auto;
            height: 220px;
            max-height: calc(100vh - 76px);
            overflow: hidden;
            pointer-events: auto;
          }
          .trainer-builder-setup-resize-handle {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 4;
            width: 30px;
            height: 30px;
            border: 1px solid rgba(148,163,184,.38);
            border-radius: 10px;
            background: linear-gradient(180deg,rgba(30,41,59,.96),rgba(15,23,42,.98));
            box-shadow: 0 14px 28px rgba(2,6,23,.32);
            cursor: nwse-resize;
            touch-action: none;
            user-select: none;
          }
          .trainer-builder-setup-resize-handle::before,
          .trainer-builder-setup-resize-handle::after {
            content: '';
            position: absolute;
            right: 7px;
            width: 13px;
            height: 2px;
            background: rgba(248,250,252,.94);
            transform: rotate(45deg);
            transform-origin: right center;
          }
          .trainer-builder-setup-resize-handle::before {
            top: 11px;
          }
          .trainer-builder-setup-resize-handle::after {
            top: 16px;
          }
          .trainer-builder-setup-clear {
            position: absolute;
            top: 10px;
            right: 48px;
            z-index: 4;
            display: none;
            align-items: center;
            justify-content: center;
            min-height: 30px;
            padding: 0 14px;
            border: 1px solid rgba(148,163,184,.38);
            border-radius: 10px;
            background: linear-gradient(180deg,rgba(30,41,59,.96),rgba(15,23,42,.98));
            color: #f8fafc;
            font: 800 12px/1 system-ui,sans-serif;
            cursor: pointer;
            box-shadow: 0 14px 28px rgba(2,6,23,.32);
          }
          .trainer-builder-setup-clear[data-armed="1"] {
            background: #dc2626;
            border-color: #dc2626;
          }
          .trainer-builder-setup-code-surface {
            position: relative;
            height: 100%;
            min-height: 0;
            border-radius: 22px 22px 0 0;
            border: 2px solid #111111;
            background: #ffffff;
            box-shadow: 0 -12px 36px rgba(9,25,37,.18);
            overflow: hidden;
          }
          .trainer-builder-setup-code-highlight {
            position: absolute;
            inset: 0;
            z-index: 1;
            margin: 0;
            padding: 22px 24px 22px;
            overflow: auto;
            pointer-events: none;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            font: 500 1rem/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
            letter-spacing: 0;
            color: #1f2937;
            background: #ffffff;
            scrollbar-width: none;
            -ms-overflow-style: none;
            opacity: 1;
            transition: opacity 140ms ease;
          }
          .trainer-builder-setup-code-highlight::-webkit-scrollbar {
            width: 0;
            height: 0;
          }
          .trainer-builder-setup-code-highlight mark.trainer-builder-setup-code-match {
            display: inline;
            padding: 0;
            border-radius: 6px;
            background: rgba(250, 224, 120, 0.52);
            box-shadow: 0 0 0 1px rgba(232, 193, 64, 0.32);
          }
          .trainer-builder-setup-code-token-tag {
            color: #1d4ed8;
          }
          .trainer-builder-setup-code-token-attr {
            color: #b45309;
          }
          .trainer-builder-setup-code-token-string {
            color: #047857;
          }
          .trainer-builder-setup-code-token-number {
            color: #7c3aed;
          }
          .trainer-builder-setup-code-token-keyword {
            color: #be123c;
          }
          .trainer-builder-setup-code-token-comment {
            color: #6b7280;
            font-style: italic;
          }
          .trainer-builder-setup-textarea {
            position: absolute;
            inset: 0;
            z-index: 2;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            padding: 22px 24px 22px;
            font: 500 1rem/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
            letter-spacing: 0;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: auto;
          }
          .trainer-builder-setup-textarea {
            margin: 0;
            border: 0;
            border-radius: 22px 22px 0 0;
            background: transparent !important;
            color: transparent !important;
            -webkit-text-fill-color: transparent !important;
            text-shadow: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            box-shadow: none !important;
            caret-color: #111111;
            line-height: 1.7;
            resize: none;
            overflow: auto;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            outline: none;
            scrollbar-width: none;
            -ms-overflow-style: none;
            transition: color 140ms ease, -webkit-text-fill-color 140ms ease, background-color 140ms ease;
            pointer-events: none;
          }
          .trainer-builder-setup-textarea-shell.is-code-editing .trainer-builder-setup-code-highlight {
            opacity: 0;
          }
          .trainer-builder-setup-textarea-shell.is-code-editing .trainer-builder-setup-textarea {
            background: #ffffff !important;
            color: #1f2937 !important;
            -webkit-text-fill-color: #1f2937 !important;
            pointer-events: auto;
          }
          .trainer-builder-setup-textarea::-webkit-scrollbar {
            width: 0;
            height: 0;
          }
          .trainer-builder-setup-textarea::selection {
            background: rgba(38,79,120,.58);
          }
          .trainer-builder-setup-textarea::placeholder {
            color: #9ca3af;
            -webkit-text-fill-color: #9ca3af;
          }
          .trainer-profile-viewport-toggle{
            display:flex;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
          }
          .trainer-standalone-inspector-shell{
            position:fixed;
            z-index:35;
            display:none;
            pointer-events:none;
          }
          .trainer-standalone-inspector-shell.is-active{
            display:block;
          }
          .trainer-standalone-inspector{
            position:relative;
            display:none;
            align-items:center;
            gap:8px;
            flex-wrap:nowrap;
            min-height:56px;
            padding:10px 52px 10px 12px;
            border-radius:18px;
            background:rgba(255,255,255,.96);
            border:1px solid rgba(148,163,184,.28);
            box-shadow:0 14px 32px rgba(15,23,42,.18);
            backdrop-filter:blur(10px);
            pointer-events:auto;
          }
          .trainer-standalone-inspector.is-active{
            display:flex;
          }
          .trainer-standalone-inspector-shell.is-side .trainer-standalone-inspector{
            flex-wrap:wrap;
            width:288px;
            max-width:min(320px,calc(100vw - 24px));
          }
          .trainer-standalone-inspector-shell.is-side .trainer-standalone-inspector input,
          .trainer-standalone-inspector-shell.is-side .trainer-standalone-inspector select{
            flex:1 1 120px;
            min-width:0;
          }
          .trainer-standalone-inspector-minimize{
            position:absolute;
            right:10px;
            top:10px;
            transform:none;
            width:28px;
            height:28px;
            border:0;
            border-radius:999px;
            display:none;
            align-items:center;
            justify-content:center;
            background:#0f172a;
            color:#ffffff;
            box-shadow:0 8px 18px rgba(15,23,42,.18);
            font:800 16px/1 system-ui,sans-serif;
            cursor:pointer;
            pointer-events:auto;
          }
          .trainer-standalone-inspector-shell.is-active .trainer-standalone-inspector-minimize{
            display:inline-flex;
          }
          .trainer-standalone-inspector input,
          .trainer-standalone-inspector select{
            min-height:38px;
          }
          @media (max-width: 767px) {
            .trainer-builder-setup-clear {
              display: inline-flex;
            }
            .trainer-standalone-inspector{
              max-width:calc(100vw - 16px);
              overflow-x:auto;
              padding:8px 44px 8px 10px;
            }
            .trainer-standalone-inspector-minimize{
              right:8px;
              top:8px;
              width:26px;
              height:26px;
              font-size:15px;
            }
            .trainer-builder-setup-input {
              padding: 0 12px 12px;
            }
            .trainer-builder-setup-textarea-shell {
              height: 180px;
              max-height: calc(100vh - 68px);
            }
            .trainer-builder-setup-code-toolbar {
              gap: 8px;
              flex-wrap: wrap;
            }
            .trainer-builder-setup-resize-handle {
              cursor: ns-resize;
            }
            .trainer-profile-viewport-toggle{
              gap:8px;
              padding:6px 0;
            }
            .trainer-profile-viewport-toggle .trainer-profile-edit-action{
              min-height:42px;
              padding:0 14px;
              font-size:.85rem;
            }
            .trainer-profile-viewport-toggle .trainer-profile-edit-action-icon{
              width:42px;
              min-width:42px;
              padding:0;
            }
          }
          .trainer-builder-setup-preview,
          .trainer-builder-setup-preview iframe {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .trainer-builder-setup-preview {
            top: 0 !important;
          }
          .trainer-builder-setup-preview::-webkit-scrollbar,
          .trainer-builder-setup-preview iframe::-webkit-scrollbar {
            width: 0;
            height: 0;
          }
          .trainer-builder-setup-preview.is-desktop-mobile {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 0 12px;
            background:
              radial-gradient(circle at top center, rgba(99,102,241,.08), transparent 24%),
              linear-gradient(180deg,#edf2f9 0%,#ffffff 28%);
            overflow: auto hidden;
          }
          .trainer-builder-setup-preview-shell {
            position: relative;
            width: 100%;
            height: 100%;
          }
          .trainer-builder-setup-preview-shell.is-desktop-mobile {
            width: ${desktopPreviewShellWidth}px;
            max-width: none;
            height: ${desktopPreviewShellHeight}px;
            transform: translateY(-93%);
            border-radius: 22px;
            overflow: hidden;
            background: linear-gradient(180deg,#1e293b,#16213a);
            border: 1px solid rgba(15,23,42,.12);
            box-shadow: 0 22px 52px rgba(9,25,37,.18);
            padding: ${desktopPreviewChromeTop + desktopPreviewChromePadding}px ${desktopPreviewChromePadding}px ${desktopPreviewChromePadding}px;
          }
          .trainer-builder-setup-preview-shell.is-desktop-mobile::before {
            content: '';
            position: absolute;
            left: ${desktopPreviewChromePadding}px;
            right: ${desktopPreviewChromePadding}px;
            top: ${desktopPreviewChromePadding}px;
            height: ${desktopPreviewChromeTop}px;
            border-radius: 12px 12px 0 0;
            background:
              radial-gradient(circle at 18px 14px, #fb7185 0 4px, transparent 5px),
              radial-gradient(circle at 34px 14px, #fbbf24 0 4px, transparent 5px),
              radial-gradient(circle at 50px 14px, #34d399 0 4px, transparent 5px),
              linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06));
            box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
            pointer-events: none;
            z-index: 2;
          }
          .trainer-builder-setup-preview-shell.is-desktop-mobile .trainer-builder-setup-preview-screen {
            position: relative;
            width: 100%;
            height: ${desktopPreviewFrameHeight}px;
            margin-top: 0;
            border-radius: 0 0 12px 12px;
            overflow: hidden;
            background: #ffffff;
            box-shadow:
              inset 0 0 0 1px rgba(148,163,184,.18),
              0 12px 28px rgba(2,6,23,.16);
          }
          .trainer-builder-setup-preview-shell.is-desktop-mobile iframe {
            width: ${desktopPreviewWidth}px;
            height: ${desktopPreviewHeight}px;
            min-height: ${desktopPreviewHeight}px;
            border: 0;
            display: block;
            background: #ffffff;
          }
        </style>
        <div class="trainer-builder-setup-preview${mobilePreview ? ' is-mobile' : ''}${desktopPreviewOnPhone ? ' is-desktop-mobile' : ''}" style="${mobilePreview ? 'position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,#eef3fb 0%,#ffffff 24%);display:flex;justify-content:center;align-items:stretch;padding:0 16px;' : desktopPreviewOnPhone ? 'position:absolute;inset:0;z-index:1;' : 'position:absolute;inset:0;z-index:1;background:#ffffff;'}">
          ${previewFrameMarkup}
        </div>
        ${renderStandaloneInspectorControls()}
        <div class="trainer-builder-setup-input" aria-label="Paste website code">
          <div class="trainer-builder-setup-code-toolbar">
            <button type="button" class="trainer-profile-edit-toggle" data-standalone-done="1">Done</button>
            <button type="button" class="trainer-profile-edit-secondary" data-standalone-undo="1">Undo</button>
            <button type="button" class="trainer-profile-edit-secondary" data-standalone-cancel="1">Cancel</button>
          </div>
          <div class="trainer-builder-setup-textarea-shell">
            <button type="button" class="trainer-builder-setup-resize-handle" data-standalone-code-resize="1" aria-label="Resize code editor"></button>
            <button type="button" class="trainer-builder-setup-clear" data-standalone-code-clear="1" aria-label="Clear the code">Clear</button>
            <div class="trainer-builder-setup-code-surface">
              <pre id="trainer-page-code-highlight" class="trainer-builder-setup-code-highlight" aria-hidden="true">${renderStandaloneCodeHighlight(codeBlock)}</pre>
              <textarea id="trainer-page-code-html" class="trainer-builder-setup-textarea" spellcheck="false" placeholder="Paste your custom website code here...">${escapeHtml(codeBlock)}</textarea>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // --- QR code generator (byte mode, EC level M, versions 1-5, mask 0) ---
  function qrBuildMatrix(text) {
    const data = Array.from(new TextEncoder().encode(String(text || '')));
    const specs = [
      { version: 1, totalCodewords: 26, ecPerBlock: 10, blocks: 1, capacity: 14 },
      { version: 2, totalCodewords: 44, ecPerBlock: 16, blocks: 1, capacity: 26 },
      { version: 3, totalCodewords: 70, ecPerBlock: 26, blocks: 1, capacity: 42 },
      { version: 4, totalCodewords: 100, ecPerBlock: 18, blocks: 2, capacity: 62 },
      { version: 5, totalCodewords: 134, ecPerBlock: 24, blocks: 2, capacity: 84 }
    ];
    const spec = specs.find((entry) => data.length <= entry.capacity);
    if (!spec) return null;
    const size = 17 + (4 * spec.version);
    const dataCodewordsTotal = spec.totalCodewords - (spec.ecPerBlock * spec.blocks);

    const bits = [];
    const pushBits = (value, count) => {
      for (let i = count - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(data.length, 8);
    data.forEach((byte) => pushBits(byte, 8));
    pushBits(0, Math.min(4, (dataCodewordsTotal * 8) - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }
    for (let padIndex = 0; codewords.length < dataCodewordsTotal; padIndex += 1) {
      codewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
    }

    const gfExp = new Array(512).fill(0);
    const gfLog = new Array(256).fill(0);
    for (let i = 0, x = 1; i < 255; i += 1) {
      gfExp[i] = x;
      gfLog[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) gfExp[i] = gfExp[i - 255];
    const gfMul = (a, b) => ((a === 0 || b === 0) ? 0 : gfExp[gfLog[a] + gfLog[b]]);
    const rsDivisor = (degree) => {
      const result = new Array(degree).fill(0);
      result[degree - 1] = 1;
      let root = 1;
      for (let i = 0; i < degree; i += 1) {
        for (let j = 0; j < result.length; j += 1) {
          result[j] = gfMul(result[j], root);
          if (j + 1 < result.length) result[j] ^= result[j + 1];
        }
        root = gfMul(root, 0x02);
      }
      return result;
    };
    const rsRemainder = (blockData, divisor) => {
      const result = new Array(divisor.length).fill(0);
      blockData.forEach((byte) => {
        const factor = byte ^ result.shift();
        result.push(0);
        divisor.forEach((coef, i) => {
          result[i] ^= gfMul(coef, factor);
        });
      });
      return result;
    };
    const divisor = rsDivisor(spec.ecPerBlock);
    const dataPerBlock = dataCodewordsTotal / spec.blocks;
    const dataBlocks = [];
    const ecBlocks = [];
    for (let b = 0; b < spec.blocks; b += 1) {
      const blockData = codewords.slice(b * dataPerBlock, (b + 1) * dataPerBlock);
      dataBlocks.push(blockData);
      ecBlocks.push(rsRemainder(blockData, divisor));
    }
    const finalCodewords = [];
    for (let i = 0; i < dataPerBlock; i += 1) dataBlocks.forEach((block) => finalCodewords.push(block[i]));
    for (let i = 0; i < spec.ecPerBlock; i += 1) ecBlocks.forEach((block) => finalCodewords.push(block[i]));

    const grid = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFunc = (x, y, dark) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      grid[y][x] = dark === true;
      isFunction[y][x] = true;
    };
    for (let i = 0; i < size; i += 1) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }
    const drawFinder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFunc(cx + dx, cy + dy, dist !== 2 && dist !== 4);
        }
      }
    };
    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);
    if (spec.version >= 2) {
      const alignCenter = size - 7;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFunc(alignCenter + dx, alignCenter + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    // Format bits for EC level M (00) with mask pattern 0: BCH(15,5) of 00000 XOR 0x5412.
    const formatBits = 0x5412;
    const formatBit = (i) => ((formatBits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i += 1) setFunc(8, i, formatBit(i));
    setFunc(8, 7, formatBit(6));
    setFunc(8, 8, formatBit(7));
    setFunc(7, 8, formatBit(8));
    for (let i = 9; i < 15; i += 1) setFunc(14 - i, 8, formatBit(i));
    for (let i = 0; i <= 7; i += 1) setFunc(size - 1 - i, 8, formatBit(i));
    for (let i = 8; i < 15; i += 1) setFunc(8, size - 15 + i, formatBit(i));
    setFunc(8, size - 8, true);

    const allBits = [];
    finalCodewords.forEach((byte) => {
      for (let i = 7; i >= 0; i -= 1) allBits.push((byte >>> i) & 1);
    });
    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (isFunction[y][x]) continue;
          grid[y][x] = bitIndex < allBits.length ? allBits[bitIndex] === 1 : false;
          bitIndex += 1;
        }
      }
    }
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!isFunction[y][x] && (x + y) % 2 === 0) grid[y][x] = !grid[y][x];
      }
    }
    return grid;
  }
  window.__trainerQrMatrix = qrBuildMatrix;

  function qrDrawToCanvas(canvas, text, { moduleSize = 6, quietZone = 4, dark = '#0f172a', light = '#ffffff' } = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const grid = qrBuildMatrix(text);
    if (!grid) return false;
    const size = grid.length;
    const pixels = (size + (quietZone * 2)) * moduleSize;
    canvas.width = pixels;
    canvas.height = pixels;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, pixels, pixels);
    ctx.fillStyle = dark;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (grid[y][x]) ctx.fillRect((x + quietZone) * moduleSize, (y + quietZone) * moduleSize, moduleSize, moduleSize);
      }
    }
    return true;
  }

  // --- Trainer site settings modal ---
  function trainerSettingsPage() {
    return pageState.currentTrainerPage
      || (Array.isArray(pageState.trainerPages)
        ? (pageState.trainerPages.find((page) => page.isHome) || pageState.trainerPages[0] || null)
        : null);
  }

  function trainerSettingsLiveUrl(page = trainerSettingsPage()) {
    const path = builderPagePath(page) || '/';
    return `${window.location.origin}${path}`;
  }

  async function saveTrainerPageSettingsPatch(patch = {}) {
    const base = trainerSettingsPage();
    if (!base?.id) throw new Error('Save your site with Done first, then adjust settings.');
    const merged = normalizeBuilderPageShape({
      ...cloneJson(base),
      ...patch,
      seo: { ...cloneJson(base.seo || {}), ...(patch.seo || {}) }
    }, base);
    const draft = buildBuilderSavePayload(merged);
    const resp = await api('/api/auth/trainer/pages', {
      method: 'POST',
      body: JSON.stringify({
        ...draft,
        trainerUserId: String(pageState.trainer?.id || '').trim(),
        autosave: false,
        publish: false
      })
    });
    if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
      throw new Error(resp.json?.error || 'Could not save settings.');
    }
    pageState.trainerPages = Array.isArray(resp.json?.pages)
      ? resp.json.pages.map((page) => normalizeBuilderPageShape(page))
      : pageState.trainerPages;
    pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
    if (!editorState.enabled) {
      editorState.original = cloneJson(pageState.currentTrainerPage);
      editorState.draft = cloneJson(pageState.currentTrainerPage);
    }
    if (isStandalonePublicCoachRoute()) {
      try { history.replaceState({}, '', builderPagePath(pageState.currentTrainerPage)); } catch {}
    }
    return pageState.currentTrainerPage;
  }

  function ensureTrainerSettingsStyle() {
    if (document.getElementById('trainer-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'trainer-settings-style';
    style.textContent = `
      #trainer-settings-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:trainerSettingsFade .18s ease}
      @keyframes trainerSettingsFade{from{opacity:0}to{opacity:1}}
      .trainer-settings-panel{width:min(560px,100%);max-height:min(86vh,780px);overflow:auto;border-radius:22px;background:linear-gradient(180deg,#0f172a 0%,#111c34 100%);color:#f8fafc;border:1px solid rgba(148,163,184,.18);box-shadow:0 32px 80px rgba(2,6,23,.55);font:500 14px/1.5 system-ui,sans-serif;animation:trainerSettingsPop .2s ease;scrollbar-width:thin}
      @keyframes trainerSettingsPop{from{transform:translateY(10px) scale(.98);opacity:0}to{transform:none;opacity:1}}
      .trainer-settings-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px 14px;background:linear-gradient(180deg,#0f172a 78%,rgba(15,23,42,0));}
      .trainer-settings-title{font:800 19px/1.2 system-ui,sans-serif;letter-spacing:-.01em}
      .trainer-settings-sub{margin-top:3px;font:500 12px/1.4 system-ui,sans-serif;color:#94a3b8}
      .trainer-settings-close{flex:0 0 auto;width:34px;height:34px;border:0;border-radius:999px;background:rgba(148,163,184,.14);color:#e2e8f0;font:700 16px/1 system-ui,sans-serif;cursor:pointer}
      .trainer-settings-close:hover{background:rgba(148,163,184,.26)}
      .trainer-settings-body{padding:2px 22px 22px;display:grid;gap:14px}
      .trainer-settings-card{border-radius:16px;padding:16px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.14)}
      .trainer-settings-kicker{font:800 10.5px/1.2 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#7dd3fc;margin-bottom:10px;display:flex;align-items:center;gap:8px}
      .trainer-settings-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .trainer-settings-url{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:0;border-radius:12px;background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.2);overflow:hidden}
      .trainer-settings-url-prefix{flex:0 0 auto;padding:10px 2px 10px 12px;color:#64748b;font:600 13px/1 ui-monospace,monospace;white-space:nowrap}
      .trainer-settings-url input{flex:1 1 auto;min-width:0;padding:10px 12px 10px 2px;border:0;background:transparent;color:#f8fafc;font:600 13px/1 ui-monospace,monospace;outline:none}
      .trainer-settings-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:0 15px;border:0;border-radius:999px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font:800 12.5px/1 system-ui,sans-serif;cursor:pointer;transition:transform .14s ease,filter .14s ease;white-space:nowrap}
      .trainer-settings-btn:hover{transform:translateY(-1px);filter:brightness(1.06)}
      .trainer-settings-btn:disabled{opacity:.55;cursor:default;transform:none}
      .trainer-settings-btn.is-ghost{background:rgba(148,163,184,.14);color:#e2e8f0}
      .trainer-settings-btn.is-ghost:hover{background:rgba(148,163,184,.24)}
      .trainer-settings-btn.is-danger{background:rgba(220,38,38,.16);color:#fca5a5}
      .trainer-settings-live-link{display:block;margin:0 0 10px;padding:10px 12px;border-radius:12px;background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.2);color:#7dd3fc;font:600 13px/1.3 ui-monospace,monospace;word-break:break-all;text-decoration:none}
      .trainer-settings-live-link:hover{border-color:rgba(125,211,252,.5)}
      .trainer-settings-note{margin-top:8px;font:500 12px/1.5 system-ui,sans-serif;color:#94a3b8}
      .trainer-settings-feedback{margin-top:8px;font:700 12px/1.4 system-ui,sans-serif;display:none}
      .trainer-settings-feedback.is-ok{display:block;color:#4ade80}
      .trainer-settings-feedback.is-error{display:block;color:#f87171}
      .trainer-settings-share-grid{display:flex;gap:8px;flex-wrap:wrap}
      .trainer-settings-qr-wrap{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
      .trainer-settings-qr-card{flex:0 0 auto;padding:10px;border-radius:14px;background:#ffffff;line-height:0;box-shadow:0 10px 26px rgba(2,6,23,.4)}
      .trainer-settings-qr-card canvas{width:148px;height:148px;image-rendering:pixelated}
      .trainer-settings-field{display:grid;gap:6px;margin-bottom:10px}
      .trainer-settings-field label{font:700 12px/1.2 system-ui,sans-serif;color:#cbd5e1}
      .trainer-settings-field input,.trainer-settings-field textarea{width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.2);background:rgba(2,6,23,.55);color:#f8fafc;font:500 13px/1.45 system-ui,sans-serif;outline:none;resize:vertical}
      .trainer-settings-field input:focus,.trainer-settings-field textarea:focus{border-color:rgba(96,165,250,.7);box-shadow:0 0 0 1px rgba(96,165,250,.3)}
      .trainer-settings-check{display:flex;align-items:center;gap:9px;font:600 13px/1.3 system-ui,sans-serif;color:#e2e8f0;cursor:pointer;margin:2px 0 10px}
      .trainer-settings-check input{width:16px;height:16px;accent-color:#2563eb;cursor:pointer}
      .trainer-settings-serp{margin:2px 0 12px;padding:12px 14px;border-radius:12px;background:#ffffff}
      .trainer-settings-serp-title{color:#1a0dab;font:500 16px/1.3 arial,sans-serif;margin:0 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .trainer-settings-serp-url{color:#006621;font:400 12px/1.4 arial,sans-serif;margin:0 0 3px;word-break:break-all}
      .trainer-settings-serp-desc{color:#545454;font:400 13px/1.45 arial,sans-serif;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .trainer-settings-status-pill{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;font:800 12px/1 system-ui,sans-serif}
      .trainer-settings-status-pill.is-live{background:rgba(34,197,94,.14);color:#4ade80}
      .trainer-settings-status-pill.is-draft{background:rgba(250,204,21,.13);color:#fde047}
      .trainer-settings-status-dot{width:7px;height:7px;border-radius:999px;background:currentColor;box-shadow:0 0 8px currentColor}
      @media (max-width: 560px){#trainer-settings-overlay{padding:8px;align-items:flex-end}.trainer-settings-panel{width:100%;max-height:94dvh;border-radius:18px 18px 0 0}.trainer-settings-body{padding:2px 14px 16px}.trainer-settings-head{padding:16px 14px 12px}.trainer-settings-row{gap:6px}.trainer-settings-btn{min-height:42px}}
    `;
    document.head.appendChild(style);
  }

  function closeTrainerSettingsModal() {
    document.getElementById('trainer-settings-overlay')?.remove();
    document.removeEventListener('keydown', handleTrainerSettingsKeydown, true);
    window.__trainerConsultFieldsSink = null;
  }

  function handleTrainerSettingsKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeTrainerSettingsModal();
    }
  }

  function trainerSettingsFeedback(el, message, ok = true) {
    if (!(el instanceof HTMLElement)) return;
    el.textContent = String(message || '');
    el.classList.toggle('is-ok', ok === true && Boolean(message));
    el.classList.toggle('is-error', ok !== true && Boolean(message));
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    try {
      const scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.style.position = 'fixed';
      scratch.style.left = '-9999px';
      document.body.appendChild(scratch);
      scratch.select();
      const okay = document.execCommand('copy');
      scratch.remove();
      return okay;
    } catch {
      return false;
    }
  }

  function openTrainerSettingsModal() {
    closeTrainerSettingsModal();
    ensureTrainerSettingsStyle();
    const page = trainerSettingsPage();
    const coachName = String(pageState.trainer?.displayName || pageState.trainer?.fullName || 'Coach').trim() || 'Coach';
    const liveUrl = trainerSettingsLiveUrl(page);
    const slug = sanitizeHandle(page?.siteSlug || '') || sanitizeHandle(pageState.trainer?.publicHandle || pageState.trainer?.username || '');
    const seo = page?.seo && typeof page.seo === 'object' ? page.seo : {};
    const isPublished = page?.isPublished === true;
    const shareText = encodeURIComponent(`Check out my coaching site - ${coachName}`);
    const shareUrl = encodeURIComponent(liveUrl);

    const overlay = document.createElement('div');
    overlay.id = 'trainer-settings-overlay';
    overlay.innerHTML = `
      <div class="trainer-settings-panel" role="dialog" aria-modal="true" aria-label="Site settings">
        <div class="trainer-settings-head">
          <div>
            <div class="trainer-settings-title">Site settings</div>
            <div class="trainer-settings-sub">Share ${escapeHtml(coachName)}'s coaching site and control how it appears.</div>
          </div>
          <button type="button" class="trainer-settings-close" data-settings-close="1" aria-label="Close settings">&#10005;</button>
        </div>
        <div class="trainer-settings-body">
          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">Your live link</div>
            <a class="trainer-settings-live-link" data-settings-live-url="1" href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener">${escapeHtml(liveUrl)}</a>
            <div class="trainer-settings-row">
              <button type="button" class="trainer-settings-btn" data-settings-copy="1">Copy link</button>
              <button type="button" class="trainer-settings-btn is-ghost" data-settings-open="1">Open live site</button>
              ${typeof navigator.share === 'function' ? '<button type="button" class="trainer-settings-btn is-ghost" data-settings-native-share="1">Share...</button>' : ''}
            </div>
            <div class="trainer-settings-feedback" data-settings-copy-feedback="1"></div>
          </div>

          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">Custom URL</div>
            <div class="trainer-settings-row">
              <div class="trainer-settings-url">
                <span class="trainer-settings-url-prefix">${escapeHtml(window.location.origin)}/coach/</span>
                <input type="text" data-settings-slug-input="1" value="${escapeHtml(slug)}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="your-name">
              </div>
              <button type="button" class="trainer-settings-btn" data-settings-slug-save="1">Save URL</button>
            </div>
            <div class="trainer-settings-note">Lowercase letters, numbers, and dashes. Changing this moves your whole site to the new address.</div>
            <div class="trainer-settings-feedback" data-settings-slug-feedback="1"></div>
          </div>

          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">QR code</div>
            <div class="trainer-settings-qr-wrap">
              <div class="trainer-settings-qr-card"><canvas data-settings-qr="1" aria-label="QR code linking to your site"></canvas></div>
              <div style="flex:1 1 180px;min-width:0">
                <div class="trainer-settings-note" style="margin:0 0 10px">Perfect for gym flyers, business cards, and Instagram stories. Anyone who scans it lands on your site.</div>
                <button type="button" class="trainer-settings-btn is-ghost" data-settings-qr-download="1">Download PNG</button>
              </div>
            </div>
          </div>

          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">Share to</div>
            <div class="trainer-settings-share-grid">
              <button type="button" class="trainer-settings-btn is-ghost" data-settings-share="https://wa.me/?text=${shareText}%20${shareUrl}">WhatsApp</button>
              <button type="button" class="trainer-settings-btn is-ghost" data-settings-share="sms:?&body=${shareText}%20${shareUrl}">Text message</button>
              <button type="button" class="trainer-settings-btn is-ghost" data-settings-share="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}">X</button>
              <button type="button" class="trainer-settings-btn is-ghost" data-settings-share="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}">Facebook</button>
              <button type="button" class="trainer-settings-btn is-ghost" data-settings-share="mailto:?subject=${shareText}&body=${shareUrl}">Email</button>
            </div>
          </div>

          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">Search appearance</div>
            <div class="trainer-settings-serp">
              <p class="trainer-settings-serp-title" data-settings-serp-title="1"></p>
              <p class="trainer-settings-serp-url">${escapeHtml(liveUrl)}</p>
              <p class="trainer-settings-serp-desc" data-settings-serp-desc="1"></p>
            </div>
            <div class="trainer-settings-field">
              <label for="trainer-settings-seo-title">Page title shown on Google and link previews</label>
              <input type="text" id="trainer-settings-seo-title" data-settings-seo-title="1" maxlength="120" value="${escapeHtml(String(seo.title || ''))}" placeholder="${escapeHtml(`${coachName} - Online Coaching`)}">
            </div>
            <div class="trainer-settings-field">
              <label for="trainer-settings-seo-desc">Short description (1-2 sentences)</label>
              <textarea id="trainer-settings-seo-desc" data-settings-seo-desc="1" maxlength="300" rows="3" placeholder="Tell people what you coach and who you help.">${escapeHtml(String(seo.description || ''))}</textarea>
            </div>
            <label class="trainer-settings-check">
              <input type="checkbox" data-settings-seo-noindex="1"${seo.noIndex === true ? ' checked' : ''}>
              Hide my site from search engines
            </label>
            <div class="trainer-settings-row">
              <button type="button" class="trainer-settings-btn" data-settings-seo-save="1">Save search settings</button>
            </div>
            <div class="trainer-settings-feedback" data-settings-seo-feedback="1"></div>
          </div>

          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">Visibility</div>
            <div class="trainer-settings-row" style="justify-content:space-between">
              <span class="trainer-settings-status-pill ${isPublished ? 'is-live' : 'is-draft'}" data-settings-status-pill="1">
                <span class="trainer-settings-status-dot"></span>${isPublished ? 'Live - visitors can see your site' : 'Draft - only you can see it'}
              </span>
              <button type="button" class="trainer-settings-btn ${isPublished ? 'is-danger' : ''}" data-settings-publish-toggle="1">${isPublished ? 'Take offline' : 'Publish site'}</button>
            </div>
            <div class="trainer-settings-feedback" data-settings-publish-feedback="1"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.addEventListener('keydown', handleTrainerSettingsKeydown, true);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) closeTrainerSettingsModal();
    });
    overlay.querySelector('[data-settings-close]')?.addEventListener('click', () => closeTrainerSettingsModal());

    const qrCanvas = overlay.querySelector('[data-settings-qr]');
    const refreshQr = () => qrDrawToCanvas(qrCanvas, trainerSettingsLiveUrl(trainerSettingsPage()));
    refreshQr();
    overlay.querySelector('[data-settings-qr-download]')?.addEventListener('click', () => {
      if (!(qrCanvas instanceof HTMLCanvasElement)) return;
      const link = document.createElement('a');
      const currentSlug = sanitizeHandle(trainerSettingsPage()?.siteSlug || '') || 'coach-site';
      link.download = `${currentSlug}-qr.png`;
      link.href = qrCanvas.toDataURL('image/png');
      link.click();
    });

    const copyFeedback = overlay.querySelector('[data-settings-copy-feedback]');
    overlay.querySelector('[data-settings-copy]')?.addEventListener('click', async () => {
      const okay = await copyTextToClipboard(trainerSettingsLiveUrl(trainerSettingsPage()));
      trainerSettingsFeedback(copyFeedback, okay ? 'Link copied to clipboard.' : 'Could not copy - select the link above and copy it manually.', okay);
      window.setTimeout(() => trainerSettingsFeedback(copyFeedback, ''), 2600);
    });
    overlay.querySelector('[data-settings-open]')?.addEventListener('click', () => {
      window.open(trainerSettingsLiveUrl(trainerSettingsPage()), '_blank', 'noopener');
    });
    overlay.querySelector('[data-settings-native-share]')?.addEventListener('click', () => {
      navigator.share({ title: `${coachName} - coaching site`, url: trainerSettingsLiveUrl(trainerSettingsPage()) }).catch(() => {});
    });
    overlay.querySelectorAll('[data-settings-share]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = String(button.getAttribute('data-settings-share') || '').trim();
        if (target) window.open(target, '_blank', 'noopener');
      });
    });

    const slugInput = overlay.querySelector('[data-settings-slug-input]');
    const slugFeedback = overlay.querySelector('[data-settings-slug-feedback]');
    const slugSaveBtn = overlay.querySelector('[data-settings-slug-save]');
    slugSaveBtn?.addEventListener('click', async () => {
      const nextSlug = sanitizeHandle(slugInput instanceof HTMLInputElement ? slugInput.value : '');
      if (!nextSlug) {
        trainerSettingsFeedback(slugFeedback, 'Enter a site name using letters, numbers, or dashes.', false);
        return;
      }
      if (nextSlug === sanitizeHandle(trainerSettingsPage()?.siteSlug || '')) {
        trainerSettingsFeedback(slugFeedback, 'That is already your current URL.', true);
        return;
      }
      slugSaveBtn.disabled = true;
      trainerSettingsFeedback(slugFeedback, 'Saving...', true);
      try {
        const saved = await saveTrainerPageSettingsPatch({ siteSlug: nextSlug });
        if (slugInput instanceof HTMLInputElement) slugInput.value = sanitizeHandle(saved?.siteSlug || nextSlug);
        const liveLink = overlay.querySelector('[data-settings-live-url]');
        const nextUrl = trainerSettingsLiveUrl(saved);
        if (liveLink instanceof HTMLAnchorElement) {
          liveLink.href = nextUrl;
          liveLink.textContent = nextUrl;
        }
        const serpUrl = overlay.querySelector('.trainer-settings-serp-url');
        if (serpUrl) serpUrl.textContent = nextUrl;
        refreshQr();
        trainerSettingsFeedback(slugFeedback, 'URL updated. Your old link now points here too if visitors had it saved.', true);
      } catch (err) {
        trainerSettingsFeedback(slugFeedback, err?.message || 'Could not update the URL.', false);
      } finally {
        slugSaveBtn.disabled = false;
      }
    });

    const seoTitleInput = overlay.querySelector('[data-settings-seo-title]');
    const seoDescInput = overlay.querySelector('[data-settings-seo-desc]');
    const seoNoIndexInput = overlay.querySelector('[data-settings-seo-noindex]');
    const serpTitle = overlay.querySelector('[data-settings-serp-title]');
    const serpDesc = overlay.querySelector('[data-settings-serp-desc]');
    const syncSerpPreview = () => {
      const titleText = String(seoTitleInput instanceof HTMLInputElement ? seoTitleInput.value : '').trim()
        || `${coachName} - Online Coaching`;
      const descText = String(seoDescInput instanceof HTMLTextAreaElement ? seoDescInput.value : '').trim()
        || `Coaching site for ${coachName}. Programs, results, and how to get started.`;
      if (serpTitle) serpTitle.textContent = titleText;
      if (serpDesc) serpDesc.textContent = descText;
    };
    syncSerpPreview();
    seoTitleInput?.addEventListener('input', syncSerpPreview);
    seoDescInput?.addEventListener('input', syncSerpPreview);
    const seoFeedback = overlay.querySelector('[data-settings-seo-feedback]');
    const seoSaveBtn = overlay.querySelector('[data-settings-seo-save]');
    seoSaveBtn?.addEventListener('click', async () => {
      seoSaveBtn.disabled = true;
      trainerSettingsFeedback(seoFeedback, 'Saving...', true);
      try {
        await saveTrainerPageSettingsPatch({
          seo: {
            title: String(seoTitleInput instanceof HTMLInputElement ? seoTitleInput.value : '').trim(),
            description: String(seoDescInput instanceof HTMLTextAreaElement ? seoDescInput.value : '').trim(),
            noIndex: seoNoIndexInput instanceof HTMLInputElement ? seoNoIndexInput.checked === true : false
          }
        });
        trainerSettingsFeedback(seoFeedback, 'Search settings saved.', true);
      } catch (err) {
        trainerSettingsFeedback(seoFeedback, err?.message || 'Could not save search settings.', false);
      } finally {
        seoSaveBtn.disabled = false;
      }
    });

    const publishToggle = overlay.querySelector('[data-settings-publish-toggle]');
    const publishFeedback = overlay.querySelector('[data-settings-publish-feedback]');
    const statusPill = overlay.querySelector('[data-settings-status-pill]');
    const syncPublishUi = () => {
      const live = trainerSettingsPage()?.isPublished === true;
      if (statusPill) {
        statusPill.classList.toggle('is-live', live);
        statusPill.classList.toggle('is-draft', !live);
        statusPill.innerHTML = `<span class="trainer-settings-status-dot"></span>${live ? 'Live - visitors can see your site' : 'Draft - only you can see it'}`;
      }
      if (publishToggle) {
        publishToggle.textContent = live ? 'Take offline' : 'Publish site';
        publishToggle.classList.toggle('is-danger', live);
      }
    };
    publishToggle?.addEventListener('click', async () => {
      const target = trainerSettingsPage();
      if (!target?.id) {
        trainerSettingsFeedback(publishFeedback, 'Save your site with Done first.', false);
        return;
      }
      const goingLive = target.isPublished !== true;
      publishToggle.disabled = true;
      trainerSettingsFeedback(publishFeedback, goingLive ? 'Publishing...' : 'Taking offline...', true);
      try {
        const resp = await api(`/api/auth/trainer/page/${goingLive ? 'publish' : 'unpublish'}`, {
          method: 'POST',
          body: JSON.stringify({ pageId: String(target.id) })
        });
        if (!resp.ok || !resp.json?.ok || !resp.json?.page) throw new Error(resp.json?.error || 'Could not update visibility.');
        pageState.trainerPages = Array.isArray(resp.json?.pages)
          ? resp.json.pages.map((item) => normalizeBuilderPageShape(item))
          : pageState.trainerPages;
        pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
        if (!editorState.enabled) {
          editorState.original = cloneJson(pageState.currentTrainerPage);
          editorState.draft = cloneJson(pageState.currentTrainerPage);
        }
        syncPublishUi();
        trainerSettingsFeedback(publishFeedback, goingLive ? 'Your site is live.' : 'Your site is offline. Only you can see it now.', true);
      } catch (err) {
        trainerSettingsFeedback(publishFeedback, err?.message || 'Could not update visibility.', false);
      } finally {
        publishToggle.disabled = false;
      }
    });
  }

  function renderStandaloneOwnerEditButton() {
    return `
      <a class="trainer-profile-edit-action trainer-profile-standalone-back-link" href="/coaches.html">Back</a>
      <button type="button" class="trainer-profile-edit-action" id="trainer-profile-edit-toggle">Edit</button>
      <button type="button" class="trainer-profile-edit-action trainer-profile-edit-action-icon" id="trainer-profile-settings-toggle" aria-label="Site settings" title="Site settings">
        <span aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3.2"></circle>
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1.02-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z"></path>
          </svg>
        </span>
      </button>
    `;
  }

  function renderStandaloneOwnerViewportToggle() {
    const desktopActive = editorState.previewDevice !== 'mobile';
    const mobileActive = editorState.previewDevice === 'mobile';
    return `
      <div class="trainer-profile-viewport-toggle" role="group" aria-label="Preview device">
        <button
          type="button"
          class="trainer-profile-edit-action trainer-profile-edit-action-icon${desktopActive ? ' is-active' : ''}"
          data-trainer-preview-device="desktop"
          aria-pressed="${desktopActive ? 'true' : 'false'}"
          aria-label="Desktop preview"
          title="Desktop preview"
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3.5" y="4.5" width="17" height="11.5" rx="2"></rect>
              <path d="M9 19.5h6"></path>
              <path d="M12 16v3.5"></path>
            </svg>
          </span>
        </button>
        <button
          type="button"
          class="trainer-profile-edit-action trainer-profile-edit-action-icon${mobileActive ? ' is-active' : ''}"
          data-trainer-preview-device="mobile"
          aria-pressed="${mobileActive ? 'true' : 'false'}"
          aria-label="Phone preview"
          title="Phone preview"
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <rect x="7" y="2.75" width="10" height="18.5" rx="2.6"></rect>
              <path d="M10.5 5.5h3"></path>
              <circle cx="12" cy="17.9" r=".7" fill="currentColor" stroke="none"></circle>
            </svg>
          </span>
        </button>
        <button
          type="button"
          class="trainer-profile-edit-action"
          data-standalone-undo="1"
          aria-label="Undo"
          title="Undo"
        >Undo</button>
      </div>
    `;
  }

  function renderStandaloneOwnerDoneButton() {
    return `<button type="button" class="trainer-profile-edit-toggle" data-standalone-done="1">Done</button>`;
  }

  function renderStandaloneNoticeToast() {
    const message = String(pageState.standaloneNotice || '').trim();
    if (!message) return '';
    const kind = String(pageState.standaloneNoticeKind || 'success').trim().toLowerCase() === 'error'
      ? 'error'
      : 'success';
    return `<div class="trainer-builder-standalone-notice is-${kind}${kind === 'success' ? ' is-auto-hide' : ''}" role="status" aria-live="polite">${escapeHtml(message)}</div>`;
  }
  function renderQualificationQuestion(question, value) {
    const type = String(question?.type || 'radio').trim().toLowerCase();
    const options = normalizeQuestionOptions(question);
    const hasOther = options.some((option) => normalizeText(option) === 'other');
    const otherValue = typeof value === 'object' && value && !Array.isArray(value) ? String(value.otherText || '').trim() : '';
    if (type === 'text' || type === 'email') {
      return `
        <label class="trainer-qualification-field">
          <span>${escapeHtml(String(question?.label || '').trim())}</span>
          <input type="${type === 'email' ? 'email' : 'text'}" data-qualification-text="${escapeHtml(question.id)}" value="${escapeHtml(String(value || '').trim())}" placeholder="${escapeHtml(String(question?.placeholder || '').trim() || String(question?.label || '').trim())}">
        </label>
      `;
    }
    if (type === 'contact') {
      const contactValue = value && typeof value === 'object' ? value : {};
      return `
        <div class="trainer-qualification-contact-grid">
          <label class="trainer-qualification-field">
            <span>Name</span>
            <input type="text" data-qualification-contact="${escapeHtml(question.id)}:full_name" value="${escapeHtml(String(contactValue.full_name || '').trim())}" placeholder="Your name">
          </label>
          <label class="trainer-qualification-field">
            <span>Phone</span>
            <input type="tel" data-qualification-contact="${escapeHtml(question.id)}:phone" value="${escapeHtml(String(contactValue.phone || '').trim())}" placeholder="Phone number">
          </label>
        </div>
      `;
    }
    if (type === 'checkbox') {
      const selected = Array.isArray(value) ? value.map((entry) => String(entry || '')) : [];
      return `
        <div class="trainer-qualification-option-grid">
          ${options.map((option) => {
            const checked = selected.includes(option);
            return `
              <label class="trainer-qualification-option${checked ? ' is-selected' : ''}">
                <input type="checkbox" data-qualification-checkbox="${escapeHtml(question.id)}" value="${escapeHtml(option)}"${checked ? ' checked' : ''}>
                <span>${escapeHtml(option)}</span>
              </label>
            `;
          }).join('')}
        </div>
        ${hasOther && selected.includes('Other') ? `
          <label class="trainer-qualification-field other">
            <span>Tell us more</span>
            <input type="text" data-qualification-other="${escapeHtml(question.id)}" value="${escapeHtml(otherValue)}" placeholder="Add details">
          </label>
        ` : ''}
      `;
    }
    return `
      <div class="trainer-qualification-option-grid">
        ${options.map((option) => {
          const checked = value === option || (value && typeof value === 'object' && value.choice === option);
          return `
            <label class="trainer-qualification-option${checked ? ' is-selected' : ''}">
              <input type="radio" name="qualification-${escapeHtml(question.id)}" data-qualification-radio="${escapeHtml(question.id)}" value="${escapeHtml(option)}"${checked ? ' checked' : ''}>
              <span>${escapeHtml(option)}</span>
            </label>
          `;
        }).join('')}
      </div>
      ${hasOther && ((value && typeof value === 'object' && value.choice === 'Other') || value === 'Other') ? `
        <label class="trainer-qualification-field other">
          <span>Tell us more</span>
          <input type="text" data-qualification-other="${escapeHtml(question.id)}" value="${escapeHtml(otherValue)}" placeholder="Add details">
        </label>
      ` : ''}
    `;
  }

  function renderQualificationGate(page) {
    if (typeof qualificationState === 'undefined') return '';
    const config = qualificationConfig(page);
    try {
      const debugPayload = {
        enabled: config?.enabled,
        revealed: qualificationState.revealed,
        canBypass: canBypassQualificationGate(page),
        questionCount: Array.isArray(config?.questions) ? config.questions.length : -1,
        currentStep: qualificationState.currentStep,
        pageSlug: page?.pageSlug || ''
      };
      window.__trainerQualificationGateDebug = debugPayload;
      console.info('trainer_qualification_gate_debug', JSON.stringify(debugPayload));
    } catch {}
    if (!config?.enabled || qualificationState.revealed || canBypassQualificationGate(page)) return '';
    const questions = Array.isArray(config.questions) ? config.questions : [];
    const currentStep = Number.isFinite(Number(qualificationState.currentStep))
      ? Number(qualificationState.currentStep)
      : 0;
    const index = Math.max(0, Math.min(questions.length - 1, currentStep));
    const question = questions[index] || null;
    if (!question) return '';
    const progressPct = Math.max(6, Math.round(((index + 1) / Math.max(1, questions.length)) * 100));
    const progressLabel = `${index + 1} of ${questions.length}`;
    const pageName = String(page?.pageName || 'Coach page').trim() || 'Coach page';
    const trainerName = String(pageState?.trainer?.fullName || pageState?.trainer?.displayName || 'This trainer').trim() || 'This trainer';
    const currentValue = questionValue(question.id);
    const answeredCount = questions.reduce((count, item) => {
      const value = questionValue(item?.id);
      if (Array.isArray(value)) return count + (value.length ? 1 : 0);
      if (value && typeof value === 'object') {
        return count + (Object.values(value).some((entry) => String(entry || '').trim()) ? 1 : 0);
      }
      return count + (String(value || '').trim() ? 1 : 0);
    }, 0);
    const progressDots = questions.map((item, itemIndex) => {
      const value = questionValue(item?.id);
      const answered = Array.isArray(value)
        ? value.length > 0
        : value && typeof value === 'object'
          ? Object.values(value).some((entry) => String(entry || '').trim())
          : Boolean(String(value || '').trim());
      const classes = [
        'trainer-qualification-dot',
        itemIndex === index ? 'is-current' : '',
        answered ? 'is-complete' : ''
      ].filter(Boolean).join(' ');
      return `<span class="${classes}" aria-hidden="true"></span>`;
    }).join('');
    const answerPreview = (() => {
      if (Array.isArray(currentValue)) return currentValue.join(', ');
      if (currentValue && typeof currentValue === 'object') {
        return Object.values(currentValue).map((entry) => String(entry || '').trim()).filter(Boolean).join(' â€¢ ');
      }
      return String(currentValue || '').trim();
    })();
    const answerPreviewLabel = String(answerPreview || '').replaceAll('Ã¢â‚¬Â¢', ' / ');
    return `
      <div class="trainer-qualification-overlay" data-trainer-qualification="1">
        <div class="trainer-qualification-modal" role="dialog" aria-modal="true" aria-labelledby="trainer-qualification-title">
          <button type="button" class="trainer-qualification-close" data-qualification-dismiss aria-label="Close qualification modal">×</button>
          <div class="trainer-qualification-shell">
            <aside class="trainer-qualification-aside">
              <div class="trainer-qualification-step">Qualification required</div>
              <h2 id="trainer-qualification-title">${escapeHtml(String(config.title || '').trim())}</h2>
              <p class="trainer-qualification-sub">${escapeHtml(String(config.subtitle || '').trim())}</p>
              <div class="trainer-qualification-dot-row" aria-hidden="true">${progressDots}</div>
              <div class="trainer-qualification-aside-meta">
                <div><strong>Trainer</strong><span>${escapeHtml(trainerName)}</span></div>
                <div><strong>Page</strong><span>${escapeHtml(pageName)}</span></div>
                <div><strong>Progress</strong><span>${escapeHtml(progressLabel)}</span></div>
                <div><strong>Answered</strong><span>${answeredCount} saved</span></div>
              </div>
              <div class="trainer-qualification-trust">
                <div>Answers save as a Potential Client for this trainer only.</div>
                <div>Your progress is saved between steps on this page and completed visitors do not need to repeat the gate.</div>
              </div>
            </aside>
            <section class="trainer-qualification-main">
              <div class="trainer-qualification-progress"><span style="width:${progressPct}%"></span></div>
              <div class="trainer-qualification-step">${escapeHtml(progressLabel)}</div>
              <div class="trainer-qualification-question">
                <div class="trainer-qualification-label">${escapeHtml(String(question.label || '').trim())}</div>
                ${question.helperText ? `<div class="trainer-qualification-helper">${escapeHtml(String(question.helperText || '').trim())}</div>` : ''}
                ${answerPreviewLabel ? `<div class="trainer-qualification-answer-chip">Current answer: ${escapeHtml(answerPreviewLabel)}</div>` : ''}
                <div class="trainer-qualification-input-wrap">
                  ${renderQualificationQuestion(question, questionValue(question.id))}
                </div>
              </div>
              <div class="trainer-qualification-error"${qualificationState.error ? '' : ' hidden'}>${escapeHtml(qualificationState.error || '')}</div>
              <div class="trainer-qualification-actions">
                <button type="button" class="trainer-qualification-btn ghost" data-qualification-back${index <= 0 ? ' disabled' : ''}>Back</button>
                <button type="button" class="trainer-qualification-btn primary" data-qualification-next>${qualificationState.saving ? 'Saving...' : escapeHtml(index >= questions.length - 1 ? 'Unlock page' : (config.ctaLabel || 'Continue'))}</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  function summarizePitch(raw, maxLength = 132) {
    const text = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
    if (firstSentence.length <= maxLength) return firstSentence;
    return `${firstSentence.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
  }

  function renderBuilderWorkspace(page, trainer) {
    const previewWidth = editorState.previewMode && editorState.previewDevice === 'mobile' ? '430px' : '100%';
    return `
      <section class="trainer-builder-workspace">
        <aside class="trainer-builder-workspace-rail">
          ${renderBuilderEditorShell(page)}
        </aside>
        <section class="trainer-builder-workspace-canvas">
          <div class="trainer-builder-workspace-head">
            <div>
              <div class="trainer-builder-workspace-kicker">Live website canvas</div>
              <h2>${editorState.previewMode ? `${editorState.previewDevice === 'mobile' ? 'Mobile' : 'Desktop'} preview` : 'Live page preview'}</h2>
              <div class="trainer-builder-workspace-sub">Treat this center stage like the real website. The dock edits structure and settings, while the page itself stays visual, full-width, and client-facing.</div>
            </div>
            <div class="trainer-builder-workspace-meta">
              <span>${escapeHtml(String(page?.pageName || 'Page').trim() || 'Page')}</span>
              <span>${escapeHtml(String(page?.siteSlug || '').trim() || 'coach')}</span>
            </div>
          </div>
          <div class="trainer-builder-workspace-banner">
            <strong>Website view</strong>
            <span>Navbar and control panel stay fixed. The page inside this stage is what visitors unlock after qualification, so it needs to read like a real landing page.</span>
          </div>
          <div class="trainer-builder-canvas-toolbar">
            <div class="trainer-builder-canvas-toolbar-copy">
              <strong>Rendered output</strong>
              <span>The code panel drives this page directly. Edit the source, watch the rendered website update, then save or publish when it is ready.</span>
            </div>
          </div>
          <div class="trainer-builder-preview-canvas${editorState.previewMode && editorState.previewDevice === 'mobile' ? ' is-mobile' : ''}" style="width:${previewWidth};max-width:100%;margin:0 auto;">
            ${renderBuilderPublicShell(page, trainer, { publicView: false })}
          </div>
        </section>
      </section>
    `;
  }

  function renderBuilderPublicShell(page, trainer, { publicView = false } = {}) {
    const qualificationRevealed = typeof qualificationState === 'undefined' ? true : qualificationState.revealed === true;
    const canBypass = typeof canBypassQualificationGate === 'function' ? canBypassQualificationGate(page) : false;
    const qualificationSettings = typeof qualificationConfig === 'function' ? qualificationConfig(page) : { enabled: true };
    const revealLocked = publicView && !qualificationRevealed && !canBypass && qualificationSettings?.enabled !== false;
    const qualificationMarkup = publicView && typeof renderQualificationGate === 'function'
      ? renderQualificationGate(page)
      : '';
    const navMarkup = !publicView || !isStandalonePublicCoachRoute()
      ? (typeof renderBuilderNavigation === 'function'
        ? renderBuilderNavigation(page, { publicView })
        : '')
      : '';
    return `
      <section class="trainer-builder-public-shell">
        ${navMarkup}
        <section class="trainer-builder-public-main${revealLocked ? ' is-gated' : ''}">
          <div class="trainer-builder-public-frame">
            ${renderActiveBuilderPage(page, { publicView })}
          </div>
        </section>
        ${qualificationMarkup}
      </section>
    `;
  }

  function renderStandalonePublicCoachPage(trainer) {
    const fullName = String(
      trainer?.fullName
      || trainer?.displayName
      || trainer?.username
      || trainer?.publicHandle
      || 'Coach'
    ).trim() || 'Coach';
    return `
      <section class="trainer-standalone-public-page" aria-label="Coach page">
        <h1 class="trainer-standalone-public-name">${escapeHtml(fullName)}</h1>
      </section>
    `;
  }

  function renderStandalonePublicCoachShell(page, trainer) {
    const qualificationRevealed = qualificationState.revealed === true;
    const canBypass = typeof canBypassQualificationGate === 'function' ? canBypassQualificationGate(page) : false;
    const qualificationSettings = typeof qualificationConfig === 'function' ? qualificationConfig(page) : { enabled: true };
    const qualificationMarkup = typeof renderQualificationGate === 'function'
      ? renderQualificationGate(page)
      : '';
    const gated = !qualificationRevealed && !canBypass && qualificationSettings?.enabled !== false;
    return `
      <section class="trainer-standalone-public-shell${gated ? ' is-gated' : ''}">
        ${renderStandalonePublicCoachPage(trainer)}
        ${qualificationMarkup}
      </section>
    `;
  }

  function shortenLine(raw, maxLength = 96) {
    const text = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
  }

  function resolveGalleryImages(trainer) {
    const custom = Array.isArray(trainer?.galleryImages) ? trainer.galleryImages : [];
    const normalized = custom
      .map((item, index) => {
        if (typeof item === 'string') {
          return { src: item, alt: `${trainer?.fullName || trainer?.displayName || 'Trainer'} photo ${index + 1}`, position: 'center center' };
        }
        if (item && typeof item === 'object' && item.src) {
          return {
            src: String(item.src),
            alt: String(item.alt || `${trainer?.fullName || trainer?.displayName || 'Trainer'} photo ${index + 1}`),
            position: String(item.position || 'center center')
          };
        }
        return null;
      })
      .filter(Boolean);
    if (normalized.length >= 3) return normalized.slice(0, 3);
    return [
      { src: '/assets/images/trainers/trainer-rowing-coach.jpg', alt: 'Trainer coaching a rowing session', position: 'center center' },
      { src: '/assets/images/trainers/trainer-floor-coach.jpg', alt: 'Trainer guiding a floor session', position: 'center 22%' },
      { src: '/assets/images/trainers/trainer-stepup-coach.jpg', alt: 'Trainer helping a client train', position: 'center 34%' }
    ];
  }

  function resolveTransformations(trainer) {
    const custom = Array.isArray(trainer?.transformations) ? trainer.transformations : [];
    const normalized = custom
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        return {
          image: String(item.image || '').trim(),
          beforeImage: String(item.beforeImage || item.imageBefore || '').trim(),
          afterImage: String(item.afterImage || item.imageAfter || item.image || '').trim(),
          label: String(item.label || 'Client transformation').trim(),
          result: String(item.result || '').trim(),
          timeline: String(item.timeline || '').trim(),
          copy: String(item.copy || '').trim(),
          quote: String(item.quote || '').trim(),
          person: String(item.person || '').trim()
        };
      })
      .filter((item) => item && (item.afterImage || item.image) && item.result);
    if (normalized.length) return normalized.slice(0, 6);
    return [];
  }

  function bindResultsToggle() {
    const btn = $('#trainer-results-toggle');
    const hiddenCards = Array.from(document.querySelectorAll('[data-more-result]'));
    if (!btn || !hiddenCards.length) return;
    let expanded = false;
    const sync = () => {
      hiddenCards.forEach((card) => card.classList.toggle('is-hidden', !expanded));
      btn.textContent = expanded ? 'Show Less' : 'Show More';
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    };
    btn.addEventListener('click', () => {
      expanded = !expanded;
      sync();
    });
    sync();
  }

  function buildResultCards(proofCases, { showAll = false } = {}) {
    return proofCases.map((item, index) => `
      <article class="trainer-profile-result-card${!showAll && index > 1 ? ' is-hidden' : ''}"${!showAll && index > 1 ? ' data-more-result="1"' : ''}>
        <div class="trainer-profile-result-visuals">
          <div class="trainer-profile-result-photo before">
            <img src="${escapeHtml(item.beforeImage || item.image)}" alt="${escapeHtml(item.person || item.label || 'Client result')} before">
            <span class="trainer-profile-result-tag">Before</span>
          </div>
          <div class="trainer-profile-result-photo after">
            <img src="${escapeHtml(item.afterImage || item.image)}" alt="${escapeHtml(item.person || item.label || 'Client result')} after">
            <span class="trainer-profile-result-tag">After</span>
          </div>
        </div>
        <div class="trainer-profile-result-copy">
          <div class="trainer-profile-result-topline">${escapeHtml(item.person || `Client ${index + 1}`)}</div>
          <div class="trainer-profile-result-metric">${escapeHtml(item.result)}</div>
          <div class="trainer-profile-result-timeline">${escapeHtml(item.timeline || 'Coaching block')}</div>
          <div class="trainer-profile-result-note">${escapeHtml(item.copy || item.quote || 'Visible progress from a simpler system.')}</div>
        </div>
      </article>
    `).join('');
  }

  function buildInlineResultsEditor(proofCases, { showAll = false } = {}) {
    const items = (Array.isArray(proofCases) ? proofCases : []).slice(0, MAX_EDIT_RESULTS);
    while (items.length < 2) items.push({ person: '', result: '', timeline: '', copy: '', beforeImage: '', afterImage: '' });
    return `
      <div class="trainer-profile-results-head">
        <div>
          <div class="trainer-profile-section-kicker">Client results</div>
          <h2 class="trainer-profile-section-title">Before and after</h2>
          <div class="trainer-profile-section-sub">Click the text to edit it. Change photos directly on each image.</div>
        </div>
      </div>
      <div class="trainer-profile-results-grid${showAll ? ' trainer-profile-results-grid-full' : ''}">
        ${items.map((item, index) => `
          <article class="trainer-profile-result-card trainer-profile-result-card-editing${!showAll && index > 1 ? ' is-hidden' : ''}" data-result-row="${index}"${!showAll && index > 1 ? ' data-more-result="1"' : ''}>
            <div class="trainer-profile-result-visuals">
              <div class="trainer-profile-result-photo before">
                <img src="${escapeHtml(item.beforeImage || item.image || '')}" alt="${escapeHtml(item.person || item.label || 'Client result')} before" data-result-photo-preview="beforeImage">
                <span class="trainer-profile-result-tag">Before</span>
                <input type="hidden" data-field="beforeImage" value="${escapeHtml(item.beforeImage || item.image || '')}">
                <label class="trainer-profile-result-photo-swap">
                  <span>Change picture</span>
                  <input type="file" accept="image/*" data-result-photo-input="beforeImage">
                </label>
              </div>
              <div class="trainer-profile-result-photo after">
                <img src="${escapeHtml(item.afterImage || item.image || '')}" alt="${escapeHtml(item.person || item.label || 'Client result')} after" data-result-photo-preview="afterImage">
                <span class="trainer-profile-result-tag">After</span>
                <input type="hidden" data-field="afterImage" value="${escapeHtml(item.afterImage || item.image || '')}">
                <label class="trainer-profile-result-photo-swap">
                  <span>Change picture</span>
                  <input type="file" accept="image/*" data-result-photo-input="afterImage">
                </label>
              </div>
            </div>
            <div class="trainer-profile-result-copy">
              <div class="trainer-profile-result-topline trainer-profile-inline-editable" contenteditable="plaintext-only" spellcheck="false" data-result-inline-field="person" data-inline-placeholder="Client type">${escapeHtml(item.person || '')}</div>
              <div class="trainer-profile-result-metric trainer-profile-inline-editable" contenteditable="plaintext-only" spellcheck="false" data-result-inline-field="result" data-inline-placeholder="Result headline">${escapeHtml(item.result || '')}</div>
              <div class="trainer-profile-result-timeline trainer-profile-inline-editable" contenteditable="plaintext-only" spellcheck="false" data-result-inline-field="timeline" data-inline-placeholder="Timeline">${escapeHtml(item.timeline || '')}</div>
              <div class="trainer-profile-result-note trainer-profile-inline-editable" contenteditable="plaintext-only" spellcheck="false" data-result-inline-field="copy" data-inline-placeholder="Result note">${escapeHtml(item.copy || item.quote || '')}</div>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function buildInlineIncludedEditor(trainer) {
    const items = resolveIncludedItems(trainer).slice(0, 16);
    return `
      <div class="trainer-profile-section-kicker">What you get</div>
      <h2 class="trainer-profile-section-title">Inside coaching</h2>
      <div class="trainer-profile-grid trainer-profile-get-grid trainer-profile-check-list trainer-profile-check-list-editing" data-included-list>
        ${items.map((item) => `
          <div class="trainer-profile-check-item" data-included-row>
            <span class="trainer-profile-check-mark"></span>
            <div class="trainer-profile-inline-editable trainer-profile-check-item-editable" contenteditable="plaintext-only" spellcheck="false" data-included-inline-field="item" data-inline-placeholder="Coaching item">${escapeHtml(item || '')}</div>
          </div>
        `).join('')}
        <div class="trainer-profile-check-item trainer-profile-check-item-new">
          <span class="trainer-profile-check-mark"></span>
          <input type="text" class="trainer-profile-check-item-input" data-included-add-input placeholder="Add another coaching item">
        </div>
      </div>
    `;
  }

  function buildResultsSection(proofCases, trainerKey, { showAll = false } = {}) {
    const resultsAction = showAll
      ? `<a class="trainer-profile-results-toggle" href="trainer-profile.html?trainer=${encodeURIComponent(trainerKey)}">Back to profile</a>`
      : (proofCases.length > 2
        ? `<a class="trainer-profile-results-toggle" href="trainer-profile.html?trainer=${encodeURIComponent(trainerKey)}&view=results">Show More</a>`
        : '');
    return `
      <section class="trainer-profile-card trainer-profile-results-strip${showAll ? ' trainer-profile-results-strip-full' : ''}">
        <div class="trainer-profile-results-head">
          <div>
            <div class="trainer-profile-section-kicker">Client results</div>
            <h2 class="trainer-profile-section-title">Before and after</h2>
            <div class="trainer-profile-section-sub">Quick proof that the coaching gets visible results.</div>
          </div>
          ${resultsAction}
        </div>
        <div class="trainer-profile-results-grid${showAll ? ' trainer-profile-results-grid-full' : ''}">
          ${buildResultCards(proofCases, { showAll })}
        </div>
      </section>
    `;
  }

  function resolveHeroHeadline(trainer) {
    const explicit = String(trainer?.heroHeadline || '').trim();
    if (explicit) return explicit;
    return 'I help busy people get leaner, stronger, and more confident with a clear plan that fits real life.';
  }

  function renderCurrentProfile() {
    renderProfile(pageState.trainer, pageState.view);
  }

  function flushPendingStandaloneEditorOpen() {
    window.clearTimeout(pageState.pendingStandaloneEditorTimer || 0);
    pageState.pendingStandaloneEditorTimer = 0;
    if (!pageState.pendingStandaloneEditorOpen) return;
    if (pageState.routeLoaderVisible) {
      pageState.pendingStandaloneEditorTimer = window.setTimeout(() => {
        flushPendingStandaloneEditorOpen();
      }, 80);
      return;
    }
    if (editorState.enabled) {
      pageState.pendingStandaloneEditorOpen = false;
      return;
    }
    if (!pageState.currentTrainerPage) {
      pageState.currentTrainerPage = Array.isArray(pageState.trainerPages) && pageState.trainerPages.length
        ? cloneJson(pageState.trainerPages[0])
        : createBlankTrainerPage(pageState.trainer);
    }
    openBuilderEditor(pageState.currentTrainerPage || createBlankTrainerPage(pageState.trainer));
  }

  function bindRenderedImages(trainer) {
    document.querySelectorAll('img[data-trainer-avatar]').forEach((img) => {
      const src = String(trainer?.photoDataUrl || '').trim();
      if (!src) return;
      img.onerror = () => {
        img.removeAttribute('src');
      };
      img.src = src;
    });
  }

  function bindPageEditControls() {
    const runAfterSaveIdle = async (callback) => {
      await waitForBuilderSaveIdle();
      if (typeof callback === 'function') {
        await callback();
      }
    };
    const postStandaloneInspectorPatch = ({ includeText = false } = {}) => {
      const frame = document.querySelector('iframe[data-standalone-live-preview="1"]');
      if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) return;
      const payload = {
        type: 'trainer_standalone_apply_style',
        fontSize: normalizeStandaloneFontSize($('#trainer-standalone-font-size')?.value || ''),
        color: String($('#trainer-standalone-color')?.value || '').trim(),
        backgroundColor: String($('#trainer-standalone-fill')?.value || '').trim(),
        fontWeight: String($('#trainer-standalone-weight')?.value || '').trim(),
        fontFamily: normalizeStandaloneFontFamily($('#trainer-standalone-family')?.value || ''),
        fontStyle: normalizeStandaloneFontStyle($('#trainer-standalone-style')?.value || '')
      };
      if (includeText) payload.text = String($('#trainer-standalone-text')?.value || '');
      frame.contentWindow.postMessage(payload, '*');
    };
    const openPageById = (pageId) => {
      const nextId = String(pageId || '').trim();
      if (!nextId) return;
      const nextPage = (Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [])
        .find((page) => String(page.id || '').trim() === nextId) || null;
      if (!nextPage) return;
      pageState.currentTrainerPage = cloneJson(nextPage);
      editorState.original = cloneJson(nextPage);
      editorState.draft = cloneJson(nextPage);
      editorState.dirty = false;
      void loadCurrentBuilderVersions(nextPage.id);
      renderCurrentProfile();
    };
    const pageSelect = $('#trainer-page-select');
    if (pageSelect) pageSelect.onchange = () => openPageById(pageSelect.value);
    const newPageBtn = $('#trainer-page-new');
    if (newPageBtn) {
      newPageBtn.onclick = () => {
        const count = Array.isArray(pageState.trainerPages) ? pageState.trainerPages.length : 0;
        if (count >= 5) {
          window.alert('You already have 5 trainer pages.');
          return;
        }
        openBuilderEditor(createBlankTrainerPage(pageState.trainer, {
          pageName: `Page ${count + 1}`,
          navLabel: `Page ${count + 1}`,
          navOrder: count,
          pageSlug: count === 0 ? '' : `page-${count + 1}`,
          isHome: count === 0
        }));
      };
    }
    const newPageInlineBtn = $('#trainer-page-new-inline');
    if (newPageInlineBtn) newPageInlineBtn.onclick = () => newPageBtn?.click();
    const moveUpBtn = $('#trainer-page-move-up');
    if (moveUpBtn) moveUpBtn.onclick = () => moveCurrentBuilderPage(-1);
    const moveUpInlineBtn = $('#trainer-page-move-up-inline');
    if (moveUpInlineBtn) moveUpInlineBtn.onclick = () => moveUpBtn?.click();
    const moveDownBtn = $('#trainer-page-move-down');
    if (moveDownBtn) moveDownBtn.onclick = () => moveCurrentBuilderPage(1);
    const moveDownInlineBtn = $('#trainer-page-move-down-inline');
    if (moveDownInlineBtn) moveDownInlineBtn.onclick = () => moveDownBtn?.click();
    const undoBtn = $('#trainer-page-undo');
    if (undoBtn) undoBtn.onclick = () => stepBuilderHistory('undo');
    const redoBtn = $('#trainer-page-redo');
    if (redoBtn) redoBtn.onclick = () => stepBuilderHistory('redo');
    const previewBtn = $('#trainer-page-preview');
    if (previewBtn) {
      previewBtn.onclick = () => {
        editorState.previewMode = !editorState.previewMode;
        renderCurrentProfile();
      };
    }
    document.querySelectorAll('[data-trainer-preview-device]').forEach((button) => {
      button.onclick = () => {
        editorState.previewDevice = String(button.getAttribute('data-trainer-preview-device') || 'desktop').trim();
        renderCurrentProfile();
      };
    });
    const publishBtn = $('#trainer-page-publish');
    if (publishBtn) publishBtn.onclick = () => { void runAfterSaveIdle(() => publishCurrentBuilderPage()); };
    const unpublishBtn = $('#trainer-page-unpublish');
    if (unpublishBtn) unpublishBtn.onclick = () => { void runAfterSaveIdle(() => unpublishCurrentBuilderPage()); };
    document.querySelectorAll('[data-standalone-done]').forEach((button) => {
      button.onclick = () => {
        void completeSimpleCodeEdit();
      };
    });
    document.querySelectorAll('[data-standalone-code-clear]').forEach((button) => {
      button.onclick = () => {
        // First tap arms, second tap clears - protects against fat-finger
        // wipes on phones. Undo can still bring the code back.
        if (button.dataset.armed !== '1') {
          button.dataset.armed = '1';
          button.textContent = 'Tap again';
          window.clearTimeout(Number(button.dataset.armTimer) || 0);
          button.dataset.armTimer = String(window.setTimeout(() => {
            button.dataset.armed = '0';
            button.textContent = 'Clear';
          }, 2600));
          return;
        }
        window.clearTimeout(Number(button.dataset.armTimer) || 0);
        button.dataset.armed = '0';
        button.textContent = 'Clear';
        const codeInput = $('#trainer-page-code-html');
        if (codeInput instanceof HTMLTextAreaElement) {
          codeInput.value = '';
          codeInput.dispatchEvent(new Event('input', { bubbles: true }));
          try { codeInput.focus(); } catch {}
        }
      };
    });
    const navGuardFrames = [
      ...document.querySelectorAll('iframe[data-standalone-live-preview="1"]'),
      ...(isStandalonePublicCoachRoute() ? document.querySelectorAll('iframe[data-builder-preview-frame="1"]') : [])
    ];
    if (window.__standalonePreviewInsetsBound !== true) {
      window.__standalonePreviewInsetsBound = true;
      window.addEventListener('scroll', postStandalonePreviewViewportInsets, { passive: true });
      window.addEventListener('resize', postStandalonePreviewViewportInsets);
    }
    postStandalonePreviewViewportInsets();
    navGuardFrames.forEach((frame) => {
      if (!(frame instanceof HTMLIFrameElement) || frame.dataset.navGuardBound === '1') return;
      frame.dataset.navGuardBound = '1';
      frame.addEventListener('load', () => {
        // The srcdoc bridge announces itself right after load; if a script inside the
        // preview navigated this sandboxed frame to a real URL instead, no
        // announcement arrives and we restore the preview.
        window.clearTimeout(standalonePreviewNavWatchdogs.get(frame) || 0);
        standalonePreviewNavWatchdogs.set(frame, window.setTimeout(() => {
          standalonePreviewNavWatchdogs.delete(frame);
          if (!frame.isConnected) return;
          if (editorState.enabled) {
            showStandaloneTransientToast('Links that leave your site are paused while editing. Press Done to try them on the live page.', 'error', { autoHideMs: 4200 });
          }
          renderCurrentProfile();
        }, 700));
      });
    });
    document.querySelectorAll('[data-standalone-undo]').forEach((button) => {
      button.onclick = () => {
        void stepStandaloneBuilderHistory('undo');
      };
    });
    document.querySelectorAll('[data-standalone-cancel]').forEach((button) => {
      button.onclick = () => {
        const okay = window.confirm('Discard changes and go back?');
        if (!okay) return;
        setStandaloneNotice('', 'success', { rerender: false });
        editorState.enabled = false;
        editorState.dirty = false;
        editorState.draft = cloneJson(editorState.original || pageState.currentTrainerPage || pageState.trainer);
        pageState.currentTrainerPage = cloneJson(editorState.original || pageState.currentTrainerPage || pageState.trainer);
        document.body.classList.remove('trainer-profile-editing');
        renderCurrentProfile();
      };
    });
    const standaloneInspectorMinimize = $('#trainer-standalone-inspector-minimize');
    if (standaloneInspectorMinimize instanceof HTMLButtonElement) {
      standaloneInspectorMinimize.onclick = () => {
        standaloneInspectorState.minimized = true;
        syncStandaloneInspectorUi();
      };
    }
    const standaloneTextInput = $('#trainer-standalone-text');
    if (standaloneTextInput instanceof HTMLInputElement) {
      standaloneTextInput.oninput = () => postStandaloneInspectorPatch({ includeText: true });
    }
    const standaloneFontInput = $('#trainer-standalone-font-size');
    if (standaloneFontInput instanceof HTMLInputElement) {
      standaloneFontInput.oninput = () => postStandaloneInspectorPatch();
    }
    const standaloneColorInput = $('#trainer-standalone-color');
    if (standaloneColorInput instanceof HTMLInputElement) {
      standaloneColorInput.oninput = () => postStandaloneInspectorPatch();
    }
    const standaloneFillInput = $('#trainer-standalone-fill');
    if (standaloneFillInput instanceof HTMLInputElement) {
      standaloneFillInput.oninput = () => postStandaloneInspectorPatch();
    }
    const standaloneFamilyInput = $('#trainer-standalone-family');
    if (standaloneFamilyInput instanceof HTMLSelectElement) {
      standaloneFamilyInput.onchange = () => postStandaloneInspectorPatch();
    }
    const standaloneWeightInput = $('#trainer-standalone-weight');
    if (standaloneWeightInput instanceof HTMLSelectElement) {
      standaloneWeightInput.onchange = () => postStandaloneInspectorPatch();
    }
    const standaloneStyleInput = $('#trainer-standalone-style');
    if (standaloneStyleInput instanceof HTMLSelectElement) {
      standaloneStyleInput.onchange = () => postStandaloneInspectorPatch();
    }
    const settingsBtn = $('#trainer-profile-settings-toggle');
    if (settingsBtn) {
      settingsBtn.onclick = () => openTrainerSettingsModal();
    }
    const editBtn = $('#trainer-profile-edit-toggle');
    if (editBtn) {
      editBtn.onclick = () => {
        if (editorState.enabled) {
          void runAfterSaveIdle(async () => {
            if (!editorState.dirty) {
              editorState.enabled = false;
              document.body.classList.remove('trainer-profile-editing');
              renderCurrentProfile();
              return;
            }
            await persistBuilderPage({ autosave: false, exitEdit: true });
          });
          return;
        }
        setStandaloneNotice('', 'success', { rerender: false });
        if (!pageState.currentTrainerPage) {
          pageState.currentTrainerPage = Array.isArray(pageState.trainerPages) && pageState.trainerPages.length
            ? cloneJson(pageState.trainerPages[0])
            : createBlankTrainerPage(pageState.trainer);
        }
        if (pageState.routeLoaderVisible) {
          pageState.pendingStandaloneEditorOpen = true;
          flushPendingStandaloneEditorOpen();
          return;
        }
        openBuilderEditor(pageState.currentTrainerPage || createBlankTrainerPage(pageState.trainer));
      };
    }
    const cancelBtn = $('#trainer-profile-edit-cancel');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        const okay = window.confirm('Discard changes and go back?');
        if (!okay) return;
        editorState.enabled = false;
        editorState.dirty = false;
        editorState.draft = cloneJson(editorState.original || pageState.currentTrainerPage || pageState.trainer);
        pageState.currentTrainerPage = cloneJson(editorState.original || pageState.currentTrainerPage || pageState.trainer);
        document.body.classList.remove('trainer-profile-editing');
        renderCurrentProfile();
      };
    }
    const saveBtn = $('#trainer-profile-edit-save');
    if (saveBtn) {
      saveBtn.onclick = () => {
        void runAfterSaveIdle(() => persistBuilderPage({ autosave: false, exitEdit: false }));
      };
    }
    const builderMetaForm = $('#trainer-page-meta-form');
    if (builderMetaForm) {
      builderMetaForm.oninput = () => {
        updateBuilderDraft((draft) => {
          draft.pageName = String($('#trainer-page-name')?.value || draft.pageName || 'Home').trim() || 'Home';
          draft.navLabel = String($('#trainer-page-nav-label')?.value || draft.navLabel || draft.pageName || 'Home').trim() || draft.pageName || 'Home';
          draft.siteSlug = sanitizeHandle($('#trainer-page-site-slug')?.value || draft.siteSlug || pageState.trainer?.publicHandle || pageState.trainer?.username || '');
          draft.pageSlug = slugify($('#trainer-page-slug')?.value || '');
          draft.isHome = String($('#trainer-page-is-home')?.value || '').trim() === 'true' || !draft.pageSlug;
        });
      };
    }
    document.querySelectorAll('[data-builder-code-tab]').forEach((button) => {
      button.onclick = () => {
        editorState.editorCodeTab = String(button.getAttribute('data-builder-code-tab') || 'html').trim().toLowerCase() || 'html';
        renderCurrentProfile();
      };
    });
    const customCodeForm = $('#trainer-page-code-form');
    if (customCodeForm) {
      customCodeForm.oninput = () => {
        updateBuilderDraft((draft) => {
          const parseCustomCodeEntries = (raw, tagName) => String(raw || '')
            .split(/\r?\n/)
            .map((line) => String(line || '').trim())
            .filter(Boolean)
            .map((line) => {
              if (line.startsWith(`<${tagName}`)) return { html: line };
              return { src: line };
            });
          draft.mode = 'custom_code';
          draft.draftContent.mode = 'custom_code';
          draft.draftContent.customCode = draft.draftContent.customCode || {};
          draft.draftContent.customCode.html = normalizeStandaloneSyncedCode($('#trainer-page-code-html')?.value || '');
          draft.draftContent.customCode.css = String($('#trainer-page-code-css')?.value || '').trim();
          draft.draftContent.customCode.javascript = String($('#trainer-page-code-js')?.value || '').trim();
          draft.draftContent.customCode.iframes = parseCustomCodeEntries($('#trainer-page-code-iframes')?.value || '', 'iframe');
          draft.draftContent.customCode.embedScripts = parseCustomCodeEntries($('#trainer-page-code-embeds')?.value || '', 'script');
        });
      };
    }
    const standaloneCodeInput = $('#trainer-page-code-html');
    if (standaloneCodeInput && !customCodeForm) {
      const standaloneCodeShellForEdit = standaloneCodeInput.closest('.trainer-builder-setup-textarea-shell');
      const standaloneCodeSurfaceForEdit = standaloneCodeInput.closest('.trainer-builder-setup-code-surface');
      standaloneCodeSurfaceForEdit?.addEventListener('dblclick', () => {
        standaloneCodeShellForEdit?.classList.add('is-code-editing');
        standaloneCodeInput.focus();
      });
      standaloneCodeSurfaceForEdit?.addEventListener('click', () => {
        // Phones cannot double-tap into the code box reliably - a single tap
        // starts editing on touch/small screens.
        const coarsePointer = (window.matchMedia?.('(pointer: coarse)')?.matches === true)
          || (window.innerWidth || 0) <= 767;
        if (!coarsePointer) return;
        standaloneCodeShellForEdit?.classList.add('is-code-editing');
        standaloneCodeInput.focus();
      });
      standaloneCodeInput.onfocus = () => {
        standaloneCodeShellForEdit?.classList.add('is-code-editing');
        syncStandaloneCodeHighlightUi();
      };
      standaloneCodeInput.onblur = () => {
        standaloneCodeShellForEdit?.classList.remove('is-code-editing');
        syncStandaloneCodeHighlightUi();
      };
      standaloneCodeInput.onscroll = () => syncStandaloneCodeHighlightUi();
      standaloneCodeInput.oninput = () => {
        if (!editorState.draft) return;
        standaloneCodeHighlightRange = null;
        syncStandaloneCodeHighlightUi();
        const livePreview = document.querySelector('[data-standalone-live-preview="1"]');
        if (livePreview instanceof HTMLIFrameElement) {
          livePreview.srcdoc = buildStandalonePreviewSrcdoc(standaloneCodeInput.value || '', {
            editable: true,
            viewportMode: standalonePreviewViewportMode()
          });
        }
        const next = cloneJson(editorState.draft);
        next.mode = 'custom_code';
        next.draftContent = next.draftContent && typeof next.draftContent === 'object' ? next.draftContent : {};
        next.draftContent.mode = 'custom_code';
        next.draftContent.customCode = next.draftContent.customCode && typeof next.draftContent.customCode === 'object'
          ? next.draftContent.customCode
          : {};
        next.draftContent.customCode.html = normalizeStandaloneSyncedCode(standaloneCodeInput.value || '');
        next.draftContent.customCode.css = '';
        next.draftContent.customCode.javascript = '';
        next.draftContent.customCode.iframes = [];
        next.draftContent.customCode.embedScripts = [];
        editorState.draft = normalizeBuilderPageShape(next, editorState.original || pageState.currentTrainerPage || {});
        pageState.currentTrainerPage = cloneJson(editorState.draft);
        editorState.dirty = JSON.stringify(editorState.draft || {}) !== JSON.stringify(editorState.original || {});
        pushBuilderHistoryCoalesced(editorState.draft);
        syncBuilderToolbarState();
        queueBuilderAutosave();
      };
      syncStandaloneCodeHighlightUi();
    }
    const standaloneCodeResizeHandle = document.querySelector('[data-standalone-code-resize="1"]');
    const standaloneCodeShell = standaloneCodeInput instanceof HTMLTextAreaElement
      ? standaloneCodeInput.closest('.trainer-builder-setup-textarea-shell')
      : null;
    const standaloneCodeDock = standaloneCodeInput instanceof HTMLTextAreaElement
      ? standaloneCodeInput.closest('.trainer-builder-setup-input')
      : null;
    if (typeof window.__trainerStandaloneCodeResizeCleanup === 'function') {
      window.__trainerStandaloneCodeResizeCleanup();
      window.__trainerStandaloneCodeResizeCleanup = null;
    }
    if (
      standaloneCodeInput instanceof HTMLTextAreaElement
      && standaloneCodeResizeHandle instanceof HTMLElement
      && standaloneCodeShell instanceof HTMLElement
      && !customCodeForm
    ) {
      const minWidth = 320;
      const minHeight = 140;
      let activePointerId = null;
      let startX = 0;
      let startY = 0;
      let startWidth = 0;
      let startHeight = 0;
      const syncStandaloneCodeDockWidth = () => {
        if (!(standaloneCodeDock instanceof HTMLElement) || !(standaloneCodeShell instanceof HTMLElement)) return;
        const shellWidth = Math.round(standaloneCodeShell.getBoundingClientRect().width || standaloneCodeShell.offsetWidth || 0);
        if (shellWidth > 0) standaloneCodeDock.style.setProperty('--trainer-standalone-code-width', `${shellWidth}px`);
      };
      const isMobileResize = () => window.matchMedia('(max-width: 767px)').matches;
      const stopResize = () => {
        if (activePointerId == null) return;
        const pointerId = activePointerId;
        activePointerId = null;
        standaloneCodeResizeHandle.releasePointerCapture?.(pointerId);
        document.body.classList.remove('is-resizing-standalone-code');
        syncStandaloneCodeDockWidth();
      };
      const onPointerMove = (event) => {
        if (activePointerId == null || event.pointerId !== activePointerId) return;
        const dx = Number(event.clientX || 0) - startX;
        const dy = Number(event.clientY || 0) - startY;
        const viewportPadding = isMobileResize() ? 24 : 36;
        const maxWidth = Math.max(minWidth, window.innerWidth - viewportPadding);
        const maxHeight = Math.max(minHeight, window.innerHeight - (isMobileResize() ? 68 : 76));
        const nextHeight = Math.min(maxHeight, Math.max(minHeight, Math.round(startHeight - dy)));
        standaloneCodeShell.style.height = `${nextHeight}px`;
        if (!isMobileResize()) {
          const nextWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(startWidth + dx)));
          standaloneCodeShell.style.width = `${nextWidth}px`;
        } else {
          standaloneCodeShell.style.width = '100%';
        }
        syncStandaloneCodeDockWidth();
        event.preventDefault();
      };
      const onPointerUp = (event) => {
        if (activePointerId == null || event.pointerId !== activePointerId) return;
        stopResize();
      };
      const onPointerDown = (event) => {
        activePointerId = event.pointerId;
        startX = Number(event.clientX || 0);
        startY = Number(event.clientY || 0);
        startWidth = Math.round(standaloneCodeShell.getBoundingClientRect().width || standaloneCodeInput.getBoundingClientRect().width || 0);
        startHeight = Math.round(standaloneCodeShell.getBoundingClientRect().height || standaloneCodeInput.getBoundingClientRect().height || standaloneCodeInput.offsetHeight || 0);
        standaloneCodeResizeHandle.setPointerCapture?.(activePointerId);
        document.body.classList.add('is-resizing-standalone-code');
        event.stopPropagation();
        event.preventDefault();
      };
      standaloneCodeResizeHandle.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      window.addEventListener('resize', syncStandaloneCodeDockWidth);
      syncStandaloneCodeDockWidth();
      window.__trainerStandaloneCodeResizeCleanup = () => {
        standaloneCodeResizeHandle.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        window.removeEventListener('resize', syncStandaloneCodeDockWidth);
        document.body.classList.remove('is-resizing-standalone-code');
      };
    }
    if (window.__trainerStandaloneBridgeBound !== true) {
      window.__trainerStandaloneBridgeBound = true;
      document.addEventListener('pointerdown', (event) => {
        if (!standaloneInspectorState.selected) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('#trainer-standalone-inspector-shell')) return;
        if (target.closest('iframe[data-standalone-live-preview="1"]')) return;
        clearStandaloneInspectorSelection();
      }, true);
      window.addEventListener('resize', () => {
        if (standaloneInspectorState.selected) syncStandaloneInspectorUi();
      });
      window.addEventListener('message', (event) => {
        const data = event?.data && typeof event.data === 'object' ? event.data : null;
        if (!data) return;
        if (data.type === 'trainer_standalone_selection') {
          standaloneInspectorState.minimized = false;
          const frame = document.querySelector('iframe[data-standalone-live-preview="1"]');
          const frameRect = frame instanceof HTMLIFrameElement ? frame.getBoundingClientRect() : null;
          const frameViewportWidth = frame instanceof HTMLIFrameElement
            ? Number(frame.clientWidth || frameRect?.width || 1)
            : 1;
          const frameViewportHeight = frame instanceof HTMLIFrameElement
            ? Number(frame.clientHeight || frameRect?.height || 1)
            : 1;
          const scaleX = frameRect ? (frameRect.width / Math.max(1, frameViewportWidth)) : 1;
          const scaleY = frameRect ? (frameRect.height / Math.max(1, frameViewportHeight)) : 1;
          const rawBounds = data.bounds && typeof data.bounds === 'object' ? data.bounds : null;
          standaloneInspectorState.selected = true;
          standaloneInspectorState.text = String(data.text || '');
          standaloneInspectorState.fontSize = String(data.fontSize || '');
          standaloneInspectorState.color = normalizeStandaloneColor(data.color || '');
          standaloneInspectorState.backgroundColor = normalizeStandaloneColor(data.backgroundColor || '', '#ffffff');
          standaloneInspectorState.fontWeight = String(data.fontWeight || '').trim();
          standaloneInspectorState.fontFamily = normalizeStandaloneFontFamily(data.fontFamily || '');
          standaloneInspectorState.fontStyle = normalizeStandaloneFontStyle(data.fontStyle || '');
          standaloneInspectorState.bounds = rawBounds && frameRect ? {
            left: frameRect.left + (Number(rawBounds.left || 0) * scaleX),
            top: frameRect.top + (Number(rawBounds.top || 0) * scaleY),
            right: frameRect.left + (Number(rawBounds.right || 0) * scaleX),
            bottom: frameRect.top + (Number(rawBounds.bottom || 0) * scaleY),
            width: Number(rawBounds.width || 0) * scaleX,
            height: Number(rawBounds.height || 0) * scaleY
          } : null;
          syncStandaloneInspectorUi();
          revealStandaloneCodeMatch({
            id: String(data.id || '').trim(),
            nodePath: Array.isArray(data.nodePath) ? data.nodePath : [],
            markup: String(data.markup || '').trim(),
            openingTag: String(data.openingTag || '').trim(),
            text: String(data.text || '')
          });
          return;
        }
        if (data.type === 'trainer_standalone_selection_clear') {
          clearStandaloneInspectorSelection({ clearPreview: false });
          return;
        }
        if (data.type === 'trainer_standalone_history') {
          const direction = String(data.action || '').trim().toLowerCase() === 'redo' ? 'redo' : 'undo';
          editorState.lastPreviewScroll = {
            x: Number(data.x) || 0,
            y: Number(data.y) || 0
          };
          stepBuilderHistory(direction);
          return;
        }
        if (data.type === 'trainer_standalone_scroll_state') {
          editorState.lastPreviewScroll = {
            x: Number(data.x) || 0,
            y: Number(data.y) || 0
          };
          return;
        }
        if (data.type === 'trainer_standalone_media_upload') {
          void handleStandaloneMediaUploadMessage(event, data);
          return;
        }
        if (data.type === 'trainer_standalone_bridge_ready') {
          document.querySelectorAll('iframe[data-standalone-live-preview="1"], iframe[data-builder-preview-frame="1"]').forEach((frame) => {
            try {
              if (frame.contentWindow !== event.source) return;
            } catch {
              return;
            }
            window.clearTimeout(standalonePreviewNavWatchdogs.get(frame) || 0);
            standalonePreviewNavWatchdogs.delete(frame);
          });
          postStandalonePreviewViewportInsets();
          return;
        }
        if (data.type === 'trainer_standalone_nav') {
          void handleStandaloneEditorNavMessage(data);
          return;
        }
        if (data.type === 'trainer_standalone_consult_settings') {
          openConsultFormSettingsModal();
          return;
        }
        if (data.type === 'trainer_standalone_consult_fields') {
          if (typeof window.__trainerConsultFieldsSink === 'function') window.__trainerConsultFieldsSink(data);
          return;
        }
        if (data.type === 'trainer_builder_lead' && window.__trainerPublicCtaBridgeBound !== true) {
          void handleTrainerBuilderLeadMessage(event, data);
          return;
        }
        if (data.type === 'trainer_builder_cta' && window.__trainerPublicCtaBridgeBound !== true) {
          // Owners viewing their own rendered site never bind the public CTA
          // listener - follow the link here so nav buttons still work.
          const ctaHref = String(data.href || '').trim();
          if (ctaHref && ctaHref !== '#' && (/^(https?:|mailto:|tel:|sms:)/i.test(ctaHref) || ctaHref.startsWith('/') || ctaHref.startsWith('#'))) {
            window.location.href = ctaHref;
          }
          return;
        }
        if (data.type !== 'trainer_standalone_code_sync') return;
        const frame = document.querySelector('iframe[data-standalone-live-preview="1"]');
        if (!(frame instanceof HTMLIFrameElement)) return;
        try {
          if (frame.contentWindow !== event.source) return;
        } catch {
          return;
        }
        const code = normalizeStandaloneSyncedCode(data.code || '');
        const input = $('#trainer-page-code-html');
        if (input instanceof HTMLTextAreaElement) input.value = code;
        if (!editorState.draft) return;
        const next = cloneJson(editorState.draft);
        next.mode = 'custom_code';
        next.draftContent = next.draftContent && typeof next.draftContent === 'object' ? next.draftContent : {};
        next.draftContent.mode = 'custom_code';
        next.draftContent.customCode = next.draftContent.customCode && typeof next.draftContent.customCode === 'object'
          ? next.draftContent.customCode
          : {};
        next.draftContent.customCode.html = code;
        next.draftContent.customCode.css = '';
        next.draftContent.customCode.javascript = '';
        next.draftContent.customCode.iframes = [];
        next.draftContent.customCode.embedScripts = [];
        editorState.draft = normalizeBuilderPageShape(next, editorState.original || pageState.currentTrainerPage || {});
        pageState.currentTrainerPage = cloneJson(editorState.draft);
        editorState.dirty = JSON.stringify(editorState.draft || {}) !== JSON.stringify(editorState.original || {});
        pushBuilderHistory(editorState.draft);
        syncBuilderToolbarState();
        queueBuilderAutosave();
      });
    }
    syncStandaloneInspectorUi();
    document.querySelectorAll('[data-builder-draft-link]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (!canEditTrainerPage(pageState.trainer, pageState.view)) return;
        event.preventDefault();
        const href = String(link.getAttribute('href') || '').trim();
        const match = href.match(/^\/coach\/([^/]+)(?:\/([^/]+))?$/i);
        const pageSlug = String(match?.[2] || '').trim();
        const nextPage = (Array.isArray(pageState.trainerPages) ? pageState.trainerPages : []).find((page) => String(page.pageSlug || '').trim() === pageSlug) || null;
        if (!nextPage) return;
        openPageById(nextPage.id);
      });
    });
    document.querySelectorAll('[data-builder-version-restore]').forEach((button) => {
      button.onclick = () => {
        const versionId = String(button.getAttribute('data-builder-version-restore') || '').trim();
        if (!versionId) return;
        void restoreBuilderVersion(versionId);
      };
    });
    bindQualificationGate();
    bindPublicLeadForms();
    bindPublicPageAutomation();
    syncBuilderToolbarState();
  }

  function renderPageEditToolbar(trainer, view) {
    const statusEl = $('#trainer-profile-status');
    if (!statusEl) return;
    document.body.classList.toggle('trainer-profile-editing', Boolean(editorState.enabled));
    if (!canEditTrainerPage(trainer, view)) {
      statusEl.innerHTML = '';
      return;
    }
    const currentPage = pageState.currentTrainerPage || null;
    const standaloneRoute = isStandalonePublicCoachRoute();
    const pageOptions = Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [];
    if (standaloneRoute) {
      statusEl.innerHTML = '';
      return;
    }
    if (!editorState.enabled) {
      statusEl.innerHTML = `
        <div class="trainer-profile-edit-toolbar">
          ${pageOptions.length ? `
            <select id="trainer-page-select" class="trainer-profile-edit-action">
              ${pageOptions.map((page) => `<option value="${escapeHtml(page.id || '')}"${currentPage?.id === page.id ? ' selected' : ''}>${escapeHtml(page.pageName || 'Page')}</option>`).join('')}
            </select>
          ` : ''}
          <button type="button" class="trainer-profile-edit-action" id="trainer-page-new">New page</button>
          <button type="button" class="trainer-profile-edit-toggle" id="trainer-profile-edit-toggle">Edit page</button>
        </div>
      `;
      return;
    }
    statusEl.innerHTML = `
      <div class="trainer-profile-edit-toolbar is-active">
        ${pageOptions.length ? `
          <select id="trainer-page-select" class="trainer-profile-edit-action">
            ${pageOptions.map((page) => `<option value="${escapeHtml(page.id || '')}"${currentPage?.id === page.id ? ' selected' : ''}>${escapeHtml(page.pageName || 'Page')}</option>`).join('')}
          </select>
        ` : ''}
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-new">New page</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-move-up">Move earlier</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-move-down">Move later</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-undo">Undo</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-redo">Redo</button>
        <button type="button" class="trainer-profile-edit-action${editorState.previewMode ? ' is-active' : ''}" id="trainer-page-preview" aria-pressed="${editorState.previewMode ? 'true' : 'false'}">${editorState.previewMode ? 'Hide preview' : 'Preview'}</button>
        <button type="button" class="trainer-profile-edit-action${editorState.previewDevice === 'desktop' ? ' is-active' : ''}" data-trainer-preview-device="desktop" aria-pressed="${editorState.previewDevice === 'desktop' ? 'true' : 'false'}">Desktop</button>
        <button type="button" class="trainer-profile-edit-action${editorState.previewDevice === 'mobile' ? ' is-active' : ''}" data-trainer-preview-device="mobile" aria-pressed="${editorState.previewDevice === 'mobile' ? 'true' : 'false'}">Mobile</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-profile-edit-save">Save</button>
        <button type="button" class="trainer-profile-edit-action confirm" id="trainer-page-publish">Publish</button>
        ${currentPage?.isPublished ? '<button type="button" class="trainer-profile-edit-action danger" id="trainer-page-unpublish">Unpublish</button>' : ''}
        <span class="trainer-profile-edit-note${editorState.dirty ? ' is-dirty' : ''}" id="trainer-profile-builder-note">${editorState.dirty ? 'Unsaved changes' : 'Editing page'}</span>
        <button type="button" class="trainer-profile-edit-toggle" id="trainer-profile-edit-toggle">&#10003; Done editing</button>
      </div>
    `;
  }

  function renderBuilderUnavailableShell(trainer) {
    const coachName = String(trainer?.fullName || trainer?.displayName || trainer?.username || 'This coach').trim() || 'This coach';
    const handle = sanitizeHandle(trainer?.publicHandle || trainer?.username || '');
    return `
      <section class="trainer-builder-public-shell trainer-builder-public-shell-unavailable">
        <div class="trainer-builder-public-frame">
          <div class="trainer-builder-unavailable">
            <div class="trainer-builder-unavailable-kicker">Coach site unavailable</div>
            <h1>${escapeHtml(coachName)}</h1>
            ${handle ? `<div class="trainer-builder-unavailable-handle">/coach/${escapeHtml(handle)}</div>` : ''}
            <p>This trainer has not published a page yet. Check back soon, or browse other coaches on RiseForIt.</p>
            <a class="trainer-builder-unavailable-link" href="/coaches.html">Browse coaches</a>
          </div>
        </div>
      </section>
    `;
  }

  function resolveHeroSubheadline(trainer) {
    const explicit = String(trainer?.heroSubheadline || '').trim();
    if (explicit) return explicit;
    return '';
  }

  function resolveHowItWorks(trainer) {
    const explicit = Array.isArray(trainer?.howItWorks) ? trainer.howItWorks : [];
    const normalized = explicit
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        return {
          step: String(item.step || index + 1).trim(),
          title: String(item.title || '').trim(),
          copy: String(item.copy || '').trim()
        };
      })
      .filter((item) => item && item.title && item.copy);
    if (normalized.length) return normalized.slice(0, 3);
    return [
      {
        step: '01',
        title: 'Book your fit call',
        copy: 'Pick a consult slot and talk through goals, schedule, injuries, and what you actually want to change.'
      },
      {
        step: '02',
        title: 'Get a clear plan',
        copy: 'Training, nutrition direction, and accountability are built around your real week, not fantasy discipline.'
      },
      {
        step: '03',
        title: 'Progress without guessing',
        copy: 'You get check-ins, adjustments, and direct feedback so you keep moving forward instead of stalling out.'
      }
    ];
  }

  function resolveWhoItsFor(trainer) {
    const explicit = Array.isArray(trainer?.whoItsFor) ? trainer.whoItsFor : [];
    const normalized = explicit
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    if (normalized.length) return normalized.slice(0, 4);
    return [
      'Busy professionals who want a leaner, stronger look without making fitness their whole life.',
      'People who want structure, accountability, and a coach who gives direct answers fast.',
      'Clients who are done guessing and want a system they can actually follow consistently.',
      'Anyone who wants premium coaching without overcomplicating every meal and workout.'
    ];
  }

  function resolveWhoItsNotFor(trainer) {
    const explicit = Array.isArray(trainer?.whoItsNotFor) ? trainer.whoItsNotFor : [];
    const normalized = explicit.map((item) => String(item || '').trim()).filter(Boolean);
    if (normalized.length) return normalized.slice(0, 4);
    return [
      'People looking for a crash fix without consistency.',
      'Anyone who wants to ignore the plan and still expect elite results.',
      'Clients who want motivation only, not structure and accountability.'
    ];
  }

  function resolveSpecialtyClients(trainer) {
    const arraySource = Array.isArray(trainer?.specialtyClients)
      ? trainer.specialtyClients
      : Array.isArray(trainer?.clientTypes)
        ? trainer.clientTypes
        : null;
    const parts = arraySource
      ? arraySource.map((item) => String(item || '').trim()).filter(Boolean)
      : String(trainer?.clientTypes || trainer?.specialtyClients || '').trim()
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    if (parts.length) return parts.slice(0, 6);
    return ['Fat loss', 'Muscle gain', 'Body recomposition'];
  }

  function resolveIncludedItems(trainer) {
    const arraySource = Array.isArray(trainer?.includedItems)
      ? trainer.includedItems
      : Array.isArray(trainer?.offer?.included)
        ? trainer.offer.included
        : null;
    const parts = arraySource
      ? arraySource.map((item) => String(item || '').trim()).filter(Boolean)
      : String(trainer?.offer?.included || '').trim()
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    if (parts.length) return parts.slice(0, 6);
    return [
      'Custom training program',
      'Nutrition targets',
      'Weekly check-ins',
      'Form feedback',
      'Fast adjustments',
      'Direct support'
    ];
  }

  function resolveIdentityBadges(trainer, fallback = []) {
    const selected = uniqueList([
      ...(Array.isArray(trainer?.coachBadgeType) ? trainer.coachBadgeType : []),
      ...(Array.isArray(trainer?.coachCustomTags) ? trainer.coachCustomTags : [])
    ], 3);
    if (selected.length) return selected;
    return uniqueList(fallback, 3);
  }

  function formatPhoneDisplay(raw) {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return String(raw || '').trim();
  }

  function buildSocialBubble(type, href, label, icon) {
    const safeHref = String(href || '').trim() || '#';
    const disabled = safeHref === '#';
    return `
      <a
        class="trainer-profile-social-bubble ${escapeHtml(type)}${disabled ? ' is-disabled' : ''}"
        href="${escapeHtml(safeHref)}"
        ${disabled ? 'aria-disabled="true" tabindex="-1"' : 'target="_blank" rel="noopener"'}
        aria-label="${escapeHtml(label)}"
      >${icon}</a>
    `;
  }

  function weekdayToIndex(raw) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return null;
    const map = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tues: 2,
      tuesday: 2,
      wed: 3,
      weds: 3,
      wednesday: 3,
      thu: 4,
      thur: 4,
      thurs: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6
    };
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  }

  function parseSlotDayIndex(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const match = text.match(/^([A-Za-z]{3,9})\b/);
    return match ? weekdayToIndex(match[1]) : null;
  }

  function stripSlotDayLabel(raw) {
    const text = String(raw || '').trim();
    const dayIndex = parseSlotDayIndex(text);
    if (dayIndex === null) return text;
    return text.replace(/^[A-Za-z]{3,9}\s+/, '').trim() || text;
  }

  function parseClockMinutes(raw) {
    const match = String(raw || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = String(match[3] || '').toLowerCase();
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'pm') hour += 12;
    return (hour * 60) + minute;
  }

  function formatClockMinutes(totalMinutes) {
    const safeMinutes = Math.max(0, Math.min(1439, Number(totalMinutes) || 0));
    const hour24 = Math.floor(safeMinutes / 60);
    const minute = safeMinutes % 60;
    const meridiem = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = (hour24 % 12) || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
  }

  function expandAvailabilityWindow(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    const dayIndex = parseSlotDayIndex(text);
    const body = stripSlotDayLabel(text);
    const parts = body.split(/\s*-\s*/).map((part) => String(part || '').trim()).filter(Boolean);
    const startMinutes = parseClockMinutes(parts[0] || body);
    const endMinutes = parts.length > 1 ? parseClockMinutes(parts[1]) : null;

    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
      const slots = [];
      const durationMinutes = 45;
      const stepMinutes = 60;
      for (let cursor = startMinutes; cursor + durationMinutes <= endMinutes; cursor += stepMinutes) {
        slots.push({
          dayIndex,
          timeLabel: `${formatClockMinutes(cursor)} - ${formatClockMinutes(cursor + durationMinutes)}`
        });
      }
      if (slots.length) return slots;
      return [{
        dayIndex,
        timeLabel: `${formatClockMinutes(startMinutes)} - ${formatClockMinutes(endMinutes)}`
      }];
    }

    if (Number.isFinite(startMinutes)) {
      return [{
        dayIndex,
        timeLabel: formatClockMinutes(startMinutes)
      }];
    }

    return [{
      dayIndex,
      timeLabel: body
    }];
  }

  function buildAvailabilityCalendar(trainer) {
    const rawSlots = Array.isArray(trainer?.availability?.timeSlotsAvailable) && trainer.availability.timeSlotsAvailable.length
      ? trainer.availability.timeSlotsAvailable.map((slot) => String(slot || '').trim()).filter(Boolean)
      : ['Flexible consult times'];
    const expandedSlots = rawSlots.flatMap((slot) => expandAvailabilityWindow(slot));
    const explicitDays = Array.isArray(trainer?.availability?.daysAvailable)
      ? trainer.availability.daysAvailable.map((day) => weekdayToIndex(day)).filter((day) => Number.isInteger(day))
      : [];
    const slotDays = expandedSlots
      .map((slot) => slot.dayIndex)
      .filter((day) => Number.isInteger(day));
    const allowedDays = Array.from(new Set(slotDays.length ? slotDays : explicitDays));
    const rangeDays = Math.max(1, Math.min(60, Number(trainer?.dateRangeDays || 14)));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(today);
    rangeEnd.setDate(today.getDate() + Math.max(0, rangeDays - 1));
    const gridEnd = new Date(rangeEnd);
    gridEnd.setDate(rangeEnd.getDate() + (6 - rangeEnd.getDay()));
    const days = [];

    for (let cursor = new Date(today); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
      const date = new Date(cursor);
      const dateKey = date.toISOString().slice(0, 10);
      const inRange = date >= today && date <= rangeEnd;
      const matchingSlots = expandedSlots.filter((slot) => slot.dayIndex === null || slot.dayIndex === date.getDay());
      const slots = (matchingSlots.length ? matchingSlots : (!slotDays.length ? expandedSlots : []))
        .map((slot) => {
          const timeLabel = String(slot.timeLabel || '').trim();
          const fullLabel = `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} â€¢ ${timeLabel}`;
          return {
            value: fullLabel,
            timeLabel,
            fullLabel
          };
        });
      const isAvailable = Boolean(inRange && slots.length && (!allowedDays.length || allowedDays.includes(date.getDay())));
      days.push({
        key: dateKey,
        weekdayLabel: date.toLocaleDateString(undefined, { weekday: 'short' }),
        monthLabel: date.toLocaleDateString(undefined, { month: 'short' }),
        dayLabel: date.toLocaleDateString(undefined, { day: 'numeric' }),
        longLabel: date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
        slots: isAvailable ? slots : [],
        isAvailable,
        isMuted: false
      });
    }

    const availableDays = days.filter((item) => item.isAvailable);
    const firstAvailable = availableDays[0] || null;
    return {
      monthRangeLabel: `${today.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${rangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      firstAvailableKey: firstAvailable?.key || '',
      days: availableDays
    };
  }

  function buildBookingHref(trainer, slotLabel, viewerPhone) {
    const fullName = trainer?.fullName || trainer?.displayName || 'Trainer';
    const email = resolveContactEmail(trainer);
    if (email) {
      const body = [
        `Hi ${fullName},`,
        '',
        'I want to book an intro call.',
        slotLabel ? `Requested time: ${slotLabel}` : 'Requested time: flexible',
        viewerPhone ? `My account phone: ${viewerPhone}` : 'My account phone: not linked yet',
        '',
        'Can you send the next step?'
      ].join('\n');
      return `mailto:${email}?subject=${encodeURIComponent(`Intro call with ${fullName}`)}&body=${encodeURIComponent(body)}`;
    }
    const instagram = buildSocialHref('instagram', trainer?.instagramUrl || trainer?.instagramHandle);
    if (instagram) return instagram;
    const tiktok = buildSocialHref('tiktok', trainer?.tiktokUrl || trainer?.tiktokHandle);
    return tiktok || '#';
  }

  function resolveNextOpeningLabel(trainer) {
    const availabilityCalendar = buildAvailabilityCalendar(trainer);
    const firstDay = Array.isArray(availabilityCalendar.days) ? availabilityCalendar.days[0] : null;
    const firstSlot = firstDay?.slots?.[0] || null;
    if (firstDay && firstSlot) {
      return `${firstDay.longLabel} at ${firstSlot.timeLabel}`;
    }
    return 'Scheduling by request';
  }

  function buildTrainerReferralLink(trainer) {
    const explicit = String(trainer?.referralLink || '').trim();
    if (explicit) {
      if (/^https?:\/\//i.test(explicit)) return explicit;
      if (explicit.startsWith('/')) return `${window.location.origin}${explicit}`;
      return `${window.location.origin}/${explicit.replace(/^\/+/, '')}`;
    }
    const code = String(trainer?.referralCode || '').trim();
    if (!code) return window.location.href;
    return `${window.location.origin}/index.html?ref=${encodeURIComponent(code)}#signup`;
  }

  function buildAbsoluteAssetUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) return value;
    if (value.startsWith('/')) return `${window.location.origin}${value}`;
    return `${window.location.origin}/${value.replace(/^\/+/, '')}`;
  }

  function buildShareCoachMessage(trainer) {
    const fullName = trainer?.fullName || trainer?.displayName || 'This coach';
    const profileUrl = buildTrainerReferralLink(trainer);
    const nextOpening = resolveNextOpeningLabel(trainer);
    const coachingSummary = String(trainer?.brandPositioning || trainer?.heroHeadline || '').trim();
    const imageUrl = buildAbsoluteAssetUrl(trainer?.photoDataUrl || '');
    return [
      `Hey,`,
      ``,
      `I wanted to send over ${fullName}'s coaching profile because this looks like a strong fit.`,
      coachingSummary ? `What stands out: ${coachingSummary}` : '',
      `Next opening: ${nextOpening}.`,
      `Use this invite link if you want to check them out or sign up: ${profileUrl}`,
      imageUrl && !imageUrl.startsWith('data:') ? `Coach photo: ${imageUrl}` : '',
      ``,
      `If you want, I can help you compare this coach against a couple other options too.`
    ].filter(Boolean).join('\n');
  }

  function refreshShareCoachActions(trainer) {
    const textEl = $('#trainer-profile-share-text');
    const emailEl = $('#trainer-profile-share-email');
    const statusEl = $('#trainer-profile-share-status');
    if (!textEl || !emailEl) return;

    const fullName = trainer?.fullName || trainer?.displayName || 'Coach';
    const message = buildShareCoachMessage(trainer);
    const subject = `Coach profile: ${fullName}`;

    textEl.href = `sms:?&body=${encodeURIComponent(message)}`;
    emailEl.href = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    emailEl.target = '_blank';
    emailEl.rel = 'noopener noreferrer';
    if (statusEl) statusEl.textContent = '';
  }

  function bindShareCoachUi(trainer) {
    const toggle = $('#trainer-profile-share-toggle');
    const actions = $('#trainer-profile-share-actions');
    const textBtn = $('#trainer-profile-share-text');
    const emailBtn = $('#trainer-profile-share-email');
    const copyBtn = $('#trainer-profile-share-copy');
    const statusEl = $('#trainer-profile-share-status');
    if (!toggle || !actions) return;
    refreshShareCoachActions(trainer);
    toggle.onclick = () => {
      const isOpen = actions.classList.contains('is-open');
      actions.classList.toggle('is-open', !isOpen);
      if (statusEl) statusEl.textContent = '';
    };
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(buildShareCoachMessage(trainer));
          if (statusEl) statusEl.textContent = 'Coach share message copied.';
        } catch {
          if (statusEl) statusEl.textContent = 'Could not copy right now.';
        }
      };
    }
  }

  function demoTrainerFallback() {
    const base = {
      id: 'demo-trainer-layout',
      fullName: 'Avery Stone',
      username: 'averystone',
      displayName: 'Avery Stone',
      email: 'avery@stonecoaching.co',
      photoDataUrl: '/assets/images/placeholders/trainer-avery.jpg',
      topSectionLabel: 'Online + Miami coach',
      coachBadgeType: ['Fat Loss', 'Lifestyle'],
      coachCustomTags: ['Strength', 'Busy adults'],
      heroHeadline: 'I help busy adults lose fat, get stronger, and stay consistent without living in the gym.',
      heroSubheadline: 'Simple programming, realistic nutrition targets, and steady accountability that fits work and family life.',
      howItWorks: [
        {
          step: '01',
          title: 'Start with a quick consult',
          copy: 'We go over your goals, training background, schedule, and what is actually realistic for your life right now.'
        },
        {
          step: '02',
          title: 'Get a plan built around your week',
          copy: 'Your workouts, cardio targets, and nutrition guidelines are set up around your real routine, not an ideal one.'
        },
        {
          step: '03',
          title: 'Adjust as progress comes in',
          copy: 'Check-ins keep the process moving and the plan gets updated when stress, schedule, or results change.'
        }
      ],
      whoItsFor: [
        'Busy adults who want structure and accountability without spending hours in the gym.',
        'Clients who want to look leaner, stronger, and more athletic while still keeping training practical.',
        'People who already try hard but need a clearer system for food, training progression, and check-ins.',
        'Anyone who wants direct coaching instead of random workouts and guesswork.'
      ],
      whoItsNotFor: [
        'People looking for a one-time PDF with no coaching.',
        'Clients who do not want to check in or follow simple habits consistently.',
        'Anyone expecting a crash-diet style approach.'
      ],
      galleryImages: [
        { src: '/assets/images/trainers/trainer-rowing-coach.jpg', alt: 'Avery coaching a rowing session', position: 'center center' },
        { src: '/assets/images/trainers/trainer-floor-coach.jpg', alt: 'Avery coaching mobility work', position: 'center 22%' },
        { src: '/assets/images/trainers/trainer-stepup-coach.jpg', alt: 'Avery coaching a client on form', position: 'center 34%' }
      ],
      transformations: [
        {
          beforeImage: '/assets/images/trainers/client-before-02.jpg',
          afterImage: '/assets/images/trainers/client-after-03.jpg',
          label: 'Client transformation',
          result: '-11 lb in 10 weeks',
          timeline: '10 weeks',
          copy: 'Three training days, step goals, and tighter weekday nutrition cleaned up the whole routine.',
          quote: 'It finally felt simple enough to stick to.',
          person: 'Office professional'
        },
        {
          beforeImage: '/assets/images/trainers/client-before-01.jpg',
          afterImage: '/assets/images/trainers/client-after-02.jpg',
          label: 'Client transformation',
          result: 'Waist down 3 in',
          timeline: '8 weeks',
          copy: 'A simpler split, better meal structure, and weekly feedback kept momentum steady.',
          quote: 'The weekly check-ins kept me honest.',
          person: 'Hybrid client'
        },
        {
          beforeImage: '/assets/images/trainers/client-before-03.jpg',
          afterImage: '/assets/images/trainers/transformation-01.jpg',
          label: 'Client transformation',
          result: 'Leaner in 12 weeks',
          timeline: '12 weeks',
          copy: 'Training progressions plus consistent food habits made the physique change show up clearly.',
          quote: 'I looked and felt more put together fast.',
          person: 'Remote client'
        },
        {
          beforeImage: '/assets/images/trainers/client-before-04.jpg',
          afterImage: '/assets/images/trainers/transformation-02.jpg',
          label: 'Client transformation',
          result: 'Body fat down in 14 weeks',
          timeline: '14 weeks',
          copy: 'Better structure around lifting, cardio, and protein intake made the plan sustainable and productive.',
          quote: 'This was the first setup I could actually maintain.',
          person: 'Online client'
        }
      ],
      brandPositioning: 'Straightforward coaching for busy adults who want visible progress and a plan they can actually follow.',
      bio: 'Avery works with busy adults who want fat loss, better structure, and stronger training habits without making fitness the center of their whole life. Her coaching style is practical, direct, and focused on keeping the plan simple enough to execute week after week.',
      coachingPhilosophy: 'Keep the plan simple, train hard, recover well, and fix the habits that actually move progress.',
      specialtyClients: ['Fat loss', 'Body recomposition', 'Busy professionals'],
      specialtyClientsCustom: ['Lifestyle coaching', 'Remote coaching'],
      clientTypes: 'Fat loss, body recomposition, busy professionals',
      idealClient: 'Busy adults who want a leaner physique, better strength, and a routine they can keep up with year-round.',
      differentiator: 'Simple systems, realistic nutrition targets, weekly accountability, and fast adjustments when something stops working.',
      includedItems: [
        'Custom training program',
        'Weekly check-ins',
        'Program adjustments',
        'Nutrition guidance',
        'Form feedback',
        'Direct support'
      ],
      includedItemsCustom: ['Habit review'],
      offer: {
        onlineCoaching: true,
        inPersonTraining: true,
        monthlyCoachingPrice: 249,
        priceRangeMin: 249,
        priceRangeMax: 399,
        priceRangeLabel: 'From $249/month',
        included: 'Custom training program, weekly check-ins, program adjustments, nutrition guidance, form feedback, and direct support.'
      },
      availability: {
        daysAvailable: ['Monday', 'Wednesday', 'Friday'],
        timeSlotsAvailable: ['Mon 11am-1pm', 'Wed 6pm-8pm', 'Fri 12pm-3pm'],
        dayWindows: {
          Monday: [{ startHour: 11, startPeriod: 'AM', endHour: 1, endPeriod: 'PM' }],
          Wednesday: [{ startHour: 6, startPeriod: 'PM', endHour: 8, endPeriod: 'PM' }],
          Friday: [{ startHour: 12, startPeriod: 'PM', endHour: 3, endPeriod: 'PM' }]
        },
        timeZone: 'America/New_York'
      },
      bookingEnabled: true,
      consultationLengthMinutes: 15,
      dateRangeDays: 14,
      maxConsultsPerDay: 4,
      bufferMinutes: 15,
      bookingNoticeHours: 12,
      bookingApprovalMode: 'manual',
      bookingCtaText: 'Find out if this is a fit in 15 minutes.',
      bookingUrgency: 'A few consult spots are open this week.',
      city: 'Miami',
      state: 'Florida',
      zipCode: '33101',
      yearsExperience: 6,
      activeClients: 14,
      experienceLevel: 'Intermediate',
      instagramHandle: 'avery.builds',
      tiktokHandle: 'averybuilds',
      instagramUrl: 'https://instagram.com/avery.builds',
      tiktokUrl: 'https://tiktok.com/@averybuilds',
      accentColor: '#d89a3b',
      proof: {
        manualClientCount: 14,
        signupCount: 32,
        paidSignupCount: 11,
        currentMonthPaidCount: 4,
        tier: {
          name: 'Builder',
          nextAt: 20,
          remainingToNext: 6
        }
      },
      isDemoLayout: true
    };
    const override = readDemoTrainerOverride();
    return [{
      ...base,
      ...(override && typeof override === 'object' ? override : {}),
      isDemoLayout: true,
      id: 'demo-trainer-layout',
      username: 'averystone'
    }];
  }

  function readDirectoryCache() {
    try {
      const raw = sessionStorage.getItem('trainer-directory-cache');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function trainerMatchesKey(trainer, key) {
    if (!trainer || !key) return false;
    const candidateKeys = [
      trainer.id,
      trainer.username,
      trainer.publicHandle,
      trainer.displayName,
      trainer.fullName,
      slugify(trainer.username),
      slugify(trainer.displayName),
      slugify(trainer.fullName)
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => [value, normalizeText(value), slugify(value)])
      .flat();
    return candidateKeys.includes(key);
  }

  function findTrainerByParam(trainers, param) {
    const normalized = normalizeText(param);
    const slug = slugify(param);
    return trainers.find((trainer) => trainerMatchesKey(trainer, normalized) || trainerMatchesKey(trainer, slug)) || null;
  }

  function bindBooking(trainer, viewer) {
    const slotButtons = Array.from(document.querySelectorAll('[data-book-slot]'));
    const dateButtons = Array.from(document.querySelectorAll('[data-book-date]'));
    const heroTimeGroups = Array.from(document.querySelectorAll('[data-book-time-group]'));
    const requestBtn = $('#trainer-request-call-btn');
    const statusEl = $('#trainer-booking-status');
    const phoneValueEl = $('#trainer-booking-phone');
    const phoneNoteEl = $('#trainer-booking-phone-note');
    const viewerPhone = String(viewer?.phone || '').trim();
    const formattedPhone = formatPhoneDisplay(viewerPhone);
    let selectedSlot = '';
    let selectedDate = String(document.querySelector('[data-book-date].is-active')?.getAttribute('data-book-date') || '').trim()
      || String(dateButtons.find((button) => !button.disabled)?.getAttribute('data-book-date') || '').trim();

    const syncDatePicker = () => {
      dateButtons.forEach((button) => {
        const key = String(button.getAttribute('data-book-date') || '').trim();
        button.classList.toggle('is-active', key === selectedDate);
      });
      heroTimeGroups.forEach((group) => {
        const key = String(group.getAttribute('data-book-time-group') || '').trim();
        group.classList.toggle('is-hidden', Boolean(selectedDate) && key !== selectedDate);
      });
    };

    const sync = () => {
      syncDatePicker();
      if (phoneValueEl) phoneValueEl.textContent = formattedPhone || 'No phone linked to this account';
      if (phoneNoteEl) {
        phoneNoteEl.textContent = formattedPhone
          ? 'This request will use the phone number already linked to your account.'
          : 'Add a phone number to your account first so the coach knows where to follow up.';
      }
      if (requestBtn) {
        requestBtn.href = buildBookingHref(trainer, selectedSlot, formattedPhone);
        const ready = Boolean(selectedSlot && formattedPhone);
        requestBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
        requestBtn.classList.toggle('ghost', !ready);
        requestBtn.classList.toggle('is-disabled', !ready);
        requestBtn.textContent = !selectedSlot
          ? 'Select a time'
          : (formattedPhone ? 'Confirm phone and send' : 'Add phone on account first');
      }
      if (statusEl) {
        statusEl.textContent = !selectedSlot
          ? 'Pick a slot first.'
          : (formattedPhone
            ? `Selected: ${selectedSlot}. Confirm your phone and send the request.`
            : 'This account does not have a phone number linked yet.');
      }
    };

    if (requestBtn) {
      requestBtn.addEventListener('click', (event) => {
        if (!selectedSlot || !formattedPhone) event.preventDefault();
      });
    }

    slotButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const next = String(button.getAttribute('data-book-slot') || '').trim();
        const nextDate = String(button.getAttribute('data-book-date-slot') || '').trim();
        if (nextDate) selectedDate = nextDate;
        selectedSlot = selectedSlot === next ? '' : next;
        slotButtons.forEach((item) => {
          const value = String(item.getAttribute('data-book-slot') || '').trim();
          item.classList.toggle('is-active', Boolean(selectedSlot) && value === selectedSlot);
        });
        sync();
      });
    });

    dateButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const next = String(button.getAttribute('data-book-date') || '').trim();
        if (!next) return;
        selectedDate = next;
        const stillVisible = slotButtons.some((item) => {
          const value = String(item.getAttribute('data-book-slot') || '').trim();
          const slotDate = String(item.getAttribute('data-book-date-slot') || '').trim();
          return Boolean(slotDate) && value === selectedSlot && slotDate === selectedDate;
        });
        if (!stillVisible) selectedSlot = '';
        slotButtons.forEach((item) => {
          const value = String(item.getAttribute('data-book-slot') || '').trim();
          item.classList.toggle('is-active', Boolean(selectedSlot) && value === selectedSlot);
        });
        sync();
      });
    });

    sync();
  }

  function buildUnavailablePublicTrainerFallback(handle) {
    const cleanHandle = sanitizeHandle(handle) || 'coach';
    const displayName = labelFromHandle(cleanHandle);
    return {
      id: '',
      username: cleanHandle,
      publicHandle: cleanHandle,
      displayName,
      fullName: displayName,
      brandPositioning: 'Custom coaching website temporarily loading from fallback mode.',
      tagline: 'Previewing the coach website shell while live page data is unavailable.',
      city: '',
      state: '',
      offer: {
        onlineCoaching: true,
        inPersonTraining: false,
        monthlyCoachingPrice: ''
      },
      results: [],
      transformations: [],
      specialtyClients: [],
      includedItems: [],
      isUnavailablePublicFallback: true
    };
  }

  async function filesToLeadUploads(fileList) {
    const files = Array.from(fileList || []).slice(0, 4);
    const uploads = [];
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file).catch(() => '');
      if (!dataUrl) continue;
      uploads.push({
        name: String(file?.name || 'upload').trim() || 'upload',
        type: String(file?.type || '').trim(),
        size: Number(file?.size || 0) || 0,
        dataUrl
      });
    }
    return uploads;
  }

  function extractQualificationFormValue(question) {
    const type = String(question?.type || 'radio').trim().toLowerCase();
    if (type === 'text' || type === 'email') {
      return String(document.querySelector(`[data-qualification-text="${question.id}"]`)?.value || '').trim();
    }
    if (type === 'contact') {
      return {
        full_name: String(document.querySelector(`[data-qualification-contact="${question.id}:full_name"]`)?.value || '').trim(),
        phone: String(document.querySelector(`[data-qualification-contact="${question.id}:phone"]`)?.value || '').trim()
      };
    }
    if (type === 'checkbox') {
      const selected = Array.from(document.querySelectorAll(`[data-qualification-checkbox="${question.id}"]:checked`))
        .map((node) => String(node.value || '').trim())
        .filter(Boolean);
      const otherText = String(document.querySelector(`[data-qualification-other="${question.id}"]`)?.value || '').trim();
      if (selected.includes('Other') && otherText) {
        return selected.map((entry) => (entry === 'Other' ? `Other: ${otherText}` : entry));
      }
      return selected;
    }
    const checked = document.querySelector(`[data-qualification-radio="${question.id}"]:checked`);
    const choice = String(checked?.value || '').trim();
    const otherText = String(document.querySelector(`[data-qualification-other="${question.id}"]`)?.value || '').trim();
    if (choice === 'Other' && otherText) {
      return { choice, otherText };
    }
    return choice;
  }

  function validateQualificationAnswer(question, value) {
    if (question?.required === false) return '';
    const type = String(question?.type || 'radio').trim().toLowerCase();
    if (type === 'contact') {
      const fullName = String(value?.full_name || '').trim();
      const phone = String(value?.phone || '').trim();
      if (!fullName) return 'Enter your name to continue.';
      if (!phone) return 'Enter your phone number to continue.';
      return '';
    }
    if (type === 'checkbox') {
      if (!(Array.isArray(value) && value.length)) return 'Choose at least one option to continue.';
      if (value.some((entry) => String(entry || '').trim() === 'Other')) return 'Add a short note for "Other" before continuing.';
      return '';
    }
    if (type === 'email') {
      const email = String(value || '').trim();
      if (!email) return 'Enter your email to continue.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
      return '';
    }
    if (!String(value || '').trim()) return 'Select an option to continue.';
    if (value && typeof value === 'object' && String(value.choice || '').trim() === 'Other' && !String(value.otherText || '').trim()) {
      return 'Add a short note for "Other" before continuing.';
    }
    return '';
  }

  function qualificationLeadSnapshotFromAnswers(answers = {}) {
    const data = answers && typeof answers === 'object' ? answers : {};
    const contact = data.name_and_phone && typeof data.name_and_phone === 'object' ? data.name_and_phone : {};
    const goal = Array.isArray(data.goals) ? data.goals.join(', ') : String(data.goals || '').trim();
    const preferredDays = Array.isArray(data.preferred_days) ? data.preferred_days.join(', ') : String(data.preferred_days || '').trim();
    const preferredTimes = Array.isArray(data.preferred_times) ? data.preferred_times.join(', ') : String(data.preferred_times || '').trim();
    return {
      fullName: String(contact.full_name || data.full_name || data.name || '').trim(),
      phone: String(contact.phone || data.phone || '').trim(),
      email: String(data.email || '').trim(),
      goal,
      location: String(data.zip_or_town || '').trim(),
      coachingType: String(data.open_to_online_training || '').trim(),
      availability: [preferredDays, preferredTimes, String(data.session_frequency || '').trim()].filter(Boolean).join(' â€¢ ')
    };
  }

  async function saveQualificationProgress({ completed = false } = {}) {
    const page = currentRenderedPage();
    if (!page) return { ok: false, error: 'Page unavailable.' };
    const showSavingState = completed === true;
    if (showSavingState) {
      qualificationState.saving = true;
      qualificationState.error = '';
      renderCurrentProfile();
    }
    const snapshot = qualificationLeadSnapshotFromAnswers(qualificationState.answers);
    try {
      const resp = await api('/api/coach/pages/qualification', {
        method: 'POST',
        body: JSON.stringify({
          siteSlug: page.siteSlug,
          pageSlug: page.pageSlug,
          sessionKey: qualificationState.sessionKey,
          currentStep: qualificationState.currentStep,
          answers: qualificationState.answers,
          fullName: snapshot.fullName,
          email: snapshot.email,
          phone: snapshot.phone,
          completed,
          meta: {
            source: 'trainer_public_gate',
            pageName: page.pageName || 'Coach page'
          }
        })
      });
      if (!resp.ok || !resp.json?.ok) {
        qualificationState.error = resp.json?.error || 'Could not save your answers right now.';
        return { ok: false, error: qualificationState.error };
      }
      qualificationState.sessionId = String(resp.json?.session?.id || resp.json?.session?.sessionId || qualificationState.sessionId || '').trim();
      qualificationState.leadId = String(resp.json?.lead?.id || qualificationState.leadId || '').trim();
      if (completed) {
        qualificationState.completed = true;
        qualificationState.revealed = true;
        qualificationState.dismissedUntil = 0;
      }
      persistQualificationState(page);
      return { ok: true, json: resp.json };
    } finally {
      if (showSavingState) {
        qualificationState.saving = false;
        renderCurrentProfile();
      }
    }
  }

  function bindQualificationGate() {
    const overlay = document.querySelector('[data-trainer-qualification="1"]');
    if (!overlay) return;
    const config = qualificationConfig(pageState.publicPagePayload?.page);
    const questions = Array.isArray(config.questions) ? config.questions : [];
    const question = questions[qualificationState.currentStep] || null;
    const nextBtn = overlay.querySelector('[data-qualification-next]');
    const backBtn = overlay.querySelector('[data-qualification-back]');
    const dismissBtn = overlay.querySelector('[data-qualification-dismiss]');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        if (qualificationState.saving) return;
        dismissQualificationGate();
      });
    }
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (qualificationState.saving) return;
        qualificationState.error = '';
        qualificationState.currentStep = Math.max(0, qualificationState.currentStep - 1);
        persistQualificationState();
        renderCurrentProfile();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', async () => {
        if (qualificationState.saving || !question) return;
        const value = extractQualificationFormValue(question);
        const error = validateQualificationAnswer(question, value);
        if (error) {
          qualificationState.error = error;
          renderCurrentProfile();
          return;
        }
        qualificationState.error = '';
        setQuestionValue(question.id, value);
        const isLast = qualificationState.currentStep >= (questions.length - 1);
        if (isLast) {
          const result = await saveQualificationProgress({ completed: true });
          if (result.ok) {
            qualificationState.error = '';
            renderCurrentProfile();
          }
          return;
        }
        qualificationState.currentStep += 1;
        persistQualificationState();
        renderCurrentProfile();
        await saveQualificationProgress({ completed: false });
      });
    }
    overlay.querySelectorAll('[data-qualification-radio], [data-qualification-checkbox]').forEach((input) => {
      const rerender = () => {
        if (question?.id) storeQualificationDraftAnswer(question, extractQualificationFormValue(question));
        renderCurrentProfile();
      };
      input.addEventListener('change', rerender);
    });
    overlay.querySelectorAll('[data-qualification-text], [data-qualification-other], [data-qualification-contact]').forEach((input) => {
      const persistDraft = () => {
        if (!question?.id) return;
        storeQualificationDraftAnswer(question, extractQualificationFormValue(question));
      };
      input.addEventListener('input', persistDraft);
      input.addEventListener('change', persistDraft);
    });
  }

  async function handleTrainerBuilderLeadMessage(event, data) {
    const token = String(data?.token || '').trim();
    const answers = data?.answers && typeof data.answers === 'object' ? data.answers : {};
    const reply = (payload) => {
      try {
        event.source?.postMessage({ type: 'trainer_builder_lead_result', token, ...payload }, '*');
      } catch {}
    };
    const activePage = pageState.publicPagePayload?.page || pageState.currentTrainerPage || null;
    const siteSlug = String(activePage?.siteSlug || '').trim();
    if (!siteSlug) {
      reply({ ok: false, error: 'This page cannot receive submissions yet.' });
      return;
    }
    const findAnswer = (patterns) => {
      for (const key of Object.keys(answers)) {
        if (patterns.some((pattern) => key.includes(pattern))) {
          const value = String(answers[key] || '').trim();
          if (value) return value;
        }
      }
      return '';
    };
    const emailish = Object.values(answers)
      .map((value) => String(value || '').trim())
      .find((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) || '';
    const payload = {
      siteSlug,
      pageSlug: String(activePage?.pageSlug || '').trim(),
      pageName: String(activePage?.pageName || '').trim(),
      formId: String(data?.formId || 'custom-form').trim().slice(0, 120),
      fullName: findAnswer(['fullname', 'full_name', 'your_name', 'name']),
      email: findAnswer(['email']) || emailish,
      phone: findAnswer(['phone', 'tel', 'mobile']),
      goal: findAnswer(['goal', 'message', 'help', 'about', 'need']),
      answers
    };
    const resp = await api('/api/coach/pages/lead', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (!resp.ok || !resp.json?.ok) {
      reply({ ok: false, error: resp.json?.error || 'Could not send right now. Try again shortly.' });
      return;
    }
    const consult = activePage?.settings?.consultForm && typeof activePage.settings.consultForm === 'object'
      ? activePage.settings.consultForm
      : {};
    reply({ ok: true, message: String(consult.successMessage || '').trim() || 'Sent! The coach will reach out soon.' });
  }

  const CONSULT_FIELD_TYPE_CHOICES = [
    ['text', 'Short answer'],
    ['textarea', 'Paragraph'],
    ['email', 'Email'],
    ['tel', 'Phone'],
    ['select', 'Dropdown'],
    ['checkbox', 'Checkbox']
  ];

  function consultDraftCustomCode() {
    const source = editorState.draft?.draftContent?.customCode
      || pageState.currentTrainerPage?.draftContent?.customCode
      || {};
    return {
      html: String(source.html || ''),
      css: String(source.css || ''),
      javascript: String(source.javascript || '')
    };
  }

  function parseConsultDocument(html) {
    const isFullDoc = /<!doctype|<html[\s>]/i.test(String(html || ''));
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return { doc, isFullDoc };
  }

  function serializeConsultDocument(doc, isFullDoc) {
    if (isFullDoc) return `<!doctype html>\n${doc.documentElement.outerHTML}`;
    // The parser hoists leading <style>/<link> tags from fragments into
    // <head>; put them back so the page keeps its styling.
    const hoisted = doc.head ? doc.head.innerHTML : '';
    return `${hoisted}${doc.body.innerHTML}`;
  }

  function consultFormFieldEls(form) {
    return Array.from(form.querySelectorAll('input,textarea,select')).filter((el) => {
      const type = String(el.getAttribute('type') || '').toLowerCase();
      return !['submit', 'button', 'reset', 'hidden'].includes(type);
    });
  }

  function consultFieldWrapperOf(el) {
    const label = el.closest('label');
    if (label && label.querySelectorAll('input,textarea,select').length === 1) return label;
    return el;
  }

  function consultFieldTypeOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    const type = String(el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    return 'text';
  }

  function consultFieldExternalLabelEl(doc, el) {
    const id = String(el.getAttribute('id') || '').trim();
    if (id) {
      try {
        const byFor = doc.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`);
        if (byFor) return byFor;
      } catch {}
    }
    const prev = el.previousElementSibling;
    if (prev && prev.tagName.toLowerCase() === 'label' && !prev.querySelector('input,textarea,select')) return prev;
    const parent = el.parentElement;
    if (parent) {
      const labels = Array.from(parent.querySelectorAll(':scope > label'))
        .filter((label) => !label.contains(el) && !label.querySelector('input,textarea,select'));
      if (labels.length === 1) return labels[0];
    }
    return null;
  }

  function consultFieldLabelOf(doc, el) {
    const placeholder = String(el.getAttribute('placeholder') || '').trim();
    if (placeholder) return placeholder.slice(0, 120);
    const aria = String(el.getAttribute('aria-label') || '').trim();
    if (aria) return aria.slice(0, 120);
    const external = consultFieldExternalLabelEl(doc, el);
    if (external) {
      const text = String(external.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 120);
    }
    const wrapper = consultFieldWrapperOf(el);
    if (wrapper !== el) {
      const text = String(wrapper.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 120);
    }
    if (el.tagName.toLowerCase() === 'select') {
      const prompt = Array.from(el.querySelectorAll('option')).find((opt) => opt.disabled || !String(opt.value || '').trim());
      const text = String(prompt?.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 120);
    }
    const name = String(el.getAttribute('name') || '').trim();
    if (name) return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()).slice(0, 120);
    return 'Field';
  }

  function describeConsultFormFromDraft() {
    const { html } = consultDraftCustomCode();
    const { doc } = parseConsultDocument(html);
    const form = doc.querySelector('form');
    if (!form) return { exists: false, fields: [], submitLabel: '' };
    const fields = consultFormFieldEls(form).map((el, index) => ({
      index,
      label: consultFieldLabelOf(doc, el),
      type: consultFieldTypeOf(el),
      required: el.hasAttribute('required'),
      options: el.tagName.toLowerCase() === 'select'
        ? Array.from(el.querySelectorAll('option'))
          .filter((opt, idx) => !opt.disabled
            && String(opt.value || '').trim()
            && !(idx === 0 && /^(select|choose|pick|--)/i.test(String(opt.textContent || '').trim())))
          .map((opt) => String(opt.textContent || '').trim())
        : []
    }));
    const submitButton = form.querySelector('button[type="submit"],input[type="submit"]') || form.querySelector('button');
    const submitLabel = submitButton
      ? String(submitButton.tagName.toLowerCase() === 'input' ? submitButton.value : submitButton.textContent || '').trim()
      : '';
    return { exists: true, fields, submitLabel };
  }

  function consultSlugName(label, usedNames) {
    const base = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field';
    let name = base;
    let n = 2;
    while (usedNames.includes(name)) {
      name = `${base}_${n}`;
      n += 1;
    }
    usedNames.push(name);
    return name;
  }

  function styleConsultDraftControl(el, type) {
    if (type === 'textarea') {
      el.style.minHeight = '120px';
      el.style.padding = '14px';
      el.style.resize = 'vertical';
    } else {
      el.style.minHeight = '46px';
      el.style.padding = '0 14px';
    }
    el.style.border = '1px solid rgba(15,23,42,.12)';
    el.style.borderRadius = '14px';
    el.style.font = '500 15px/1.4 system-ui,sans-serif';
    el.style.width = '100%';
    el.style.boxSizing = 'border-box';
    el.style.background = '#ffffff';
    el.style.color = '#0f172a';
  }

  function buildConsultDraftField(doc, field, usedNames, existingEl) {
    const allowed = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox'];
    const type = allowed.includes(String(field?.type || '').trim()) ? String(field.type).trim() : 'text';
    const label = String(field?.label || '').trim().slice(0, 120) || 'Field';
    const name = consultSlugName(label, usedNames);
    const options = Array.isArray(field?.options)
      ? field.options.map((opt) => String(opt || '').trim().slice(0, 120)).filter(Boolean).slice(0, 24)
      : [];
    const fillSelectOptions = (select) => {
      select.innerHTML = '';
      const placeholderOption = doc.createElement('option');
      placeholderOption.value = '';
      placeholderOption.disabled = true;
      placeholderOption.setAttribute('selected', '');
      placeholderOption.textContent = label;
      select.appendChild(placeholderOption);
      options.forEach((optionLabel) => {
        const option = doc.createElement('option');
        option.value = optionLabel;
        option.textContent = optionLabel;
        select.appendChild(option);
      });
    };
    if (existingEl && consultFieldTypeOf(existingEl) === type) {
      existingEl.setAttribute('name', name);
      if (type !== 'select' && type !== 'checkbox') existingEl.setAttribute('placeholder', label);
      if (field?.required === true) existingEl.setAttribute('required', '');
      else existingEl.removeAttribute('required');
      if (type === 'select') fillSelectOptions(existingEl);
      const externalLabel = consultFieldExternalLabelEl(doc, existingEl);
      if (externalLabel) externalLabel.textContent = label;
      if (type === 'checkbox') {
        const wrapper = consultFieldWrapperOf(existingEl);
        if (wrapper !== existingEl) {
          const span = Array.from(wrapper.querySelectorAll('span,div')).find((node) => !node.querySelector('input,textarea,select'));
          if (span) span.textContent = label;
          else {
            const textNode = Array.from(wrapper.childNodes).find((node) => node.nodeType === 3 && String(node.textContent || '').trim());
            if (textNode) textNode.textContent = ` ${label}`;
          }
        }
      }
      return consultFieldWrapperOf(existingEl);
    }
    if (type === 'checkbox') {
      const wrap = doc.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:10px;font:500 14px/1.4 system-ui,sans-serif;color:#334155;cursor:pointer';
      const input = doc.createElement('input');
      input.setAttribute('type', 'checkbox');
      input.setAttribute('name', name);
      input.setAttribute('value', 'Yes');
      if (field?.required === true) input.setAttribute('required', '');
      input.style.cssText = 'width:18px;height:18px;accent-color:#2563eb';
      const span = doc.createElement('span');
      span.textContent = label;
      wrap.appendChild(input);
      wrap.appendChild(span);
      return wrap;
    }
    if (type === 'select') {
      const select = doc.createElement('select');
      select.setAttribute('name', name);
      if (field?.required === true) select.setAttribute('required', '');
      styleConsultDraftControl(select, 'select');
      fillSelectOptions(select);
      return select;
    }
    if (type === 'textarea') {
      const textarea = doc.createElement('textarea');
      textarea.setAttribute('name', name);
      textarea.setAttribute('placeholder', label);
      if (field?.required === true) textarea.setAttribute('required', '');
      styleConsultDraftControl(textarea, 'textarea');
      return textarea;
    }
    const input = doc.createElement('input');
    input.setAttribute('type', type);
    input.setAttribute('name', name);
    input.setAttribute('placeholder', label);
    if (field?.required === true) input.setAttribute('required', '');
    styleConsultDraftControl(input, type);
    return input;
  }

  function commitStandaloneDraftHtml(nextHtml) {
    const base = editorState.draft || pageState.currentTrainerPage;
    if (!base) return false;
    const next = cloneJson(base);
    next.mode = 'custom_code';
    next.draftContent = next.draftContent && typeof next.draftContent === 'object' ? next.draftContent : {};
    next.draftContent.mode = 'custom_code';
    next.draftContent.customCode = next.draftContent.customCode && typeof next.draftContent.customCode === 'object'
      ? next.draftContent.customCode
      : { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
    next.draftContent.customCode.html = String(nextHtml || '');
    editorState.draft = normalizeBuilderPageShape(next, editorState.original || pageState.currentTrainerPage || {});
    pageState.currentTrainerPage = cloneJson(editorState.draft);
    editorState.dirty = JSON.stringify(editorState.draft || {}) !== JSON.stringify(editorState.original || {});
    const input = $('#trainer-page-code-html');
    if (input instanceof HTMLTextAreaElement) input.value = String(nextHtml || '');
    pushBuilderHistory(editorState.draft);
    syncBuilderToolbarState();
    queueBuilderAutosave();
    if (editorState.enabled) renderCurrentProfile();
    return true;
  }

  function consultFieldBlockOf(form, el) {
    // The smallest ancestor holding just this field (its container div with
    // the label) - the unit we move or remove so template styling survives.
    let node = el;
    while (node.parentElement && node.parentElement !== form) {
      if (consultFormFieldEls(node.parentElement).length > 1) break;
      node = node.parentElement;
    }
    return node;
  }

  function consultSwapControl(doc, oldControl, newNode, label) {
    // Replace just the control inside its block, carrying over the template's
    // visual identity (classes, id) so CSS keeps applying.
    const newControl = newNode.matches?.('input,textarea,select') ? newNode : newNode.querySelector('input,textarea,select');
    const oldClass = oldControl.getAttribute('class');
    if (newControl && oldClass) {
      newControl.setAttribute('class', oldClass);
      newControl.removeAttribute('style');
    }
    const oldId = oldControl.getAttribute('id');
    if (newControl && oldId) newControl.setAttribute('id', oldId);
    const externalLabel = consultFieldExternalLabelEl(doc, oldControl);
    if (externalLabel) externalLabel.textContent = label;
    const oldWrapper = consultFieldWrapperOf(oldControl);
    if (oldWrapper.parentElement) oldWrapper.parentElement.replaceChild(newNode, oldWrapper);
    return newControl || newNode;
  }

  function consultCloneBlockFor(doc, form, field, usedNames, templateControl) {
    // New fields copy the look of an existing field by cloning its block.
    const node = buildConsultDraftField(doc, field, usedNames, null);
    if (!templateControl) return node;
    const templateBlock = consultFieldBlockOf(form, templateControl);
    if (templateBlock === templateControl || templateBlock === consultFieldWrapperOf(templateControl)) {
      // Bare control with no container: copy its classes onto ours.
      const control = node.matches?.('input,textarea,select') ? node : node.querySelector('input,textarea,select');
      const templateClass = templateControl.getAttribute('class');
      if (control && templateClass) {
        control.setAttribute('class', templateClass);
        control.removeAttribute('style');
      }
      return node;
    }
    const clone = templateBlock.cloneNode(true);
    clone.querySelectorAll('[id]').forEach((idNode) => idNode.removeAttribute('id'));
    const cloneControl = clone.querySelector('input,textarea,select');
    if (!cloneControl) return node;
    const label = String(field?.label || '').trim().slice(0, 120) || 'Field';
    const cloneLabelEl = Array.from(clone.querySelectorAll('label')).find((labelNode) => !labelNode.querySelector('input,textarea,select'));
    if (cloneLabelEl) {
      cloneLabelEl.textContent = label;
      cloneLabelEl.removeAttribute('for');
    }
    const desiredControl = node.matches?.('input,textarea,select') ? node : node.querySelector('input,textarea,select');
    if (desiredControl) {
      const cloneClass = cloneControl.getAttribute('class');
      if (cloneClass) {
        desiredControl.setAttribute('class', cloneClass);
        desiredControl.removeAttribute('style');
      }
      cloneControl.parentElement.replaceChild(
        node.matches?.('input,textarea,select') ? desiredControl : node,
        cloneControl
      );
    }
    return clone;
  }

  function applyConsultFormToDraft({ fields, submitLabel }) {
    const { html } = consultDraftCustomCode();
    const { doc, isFullDoc } = parseConsultDocument(html);
    const form = doc.querySelector('form');
    if (!form) return { ok: false, error: 'No consultation form found on this page.' };
    const existingEls = consultFormFieldEls(form);
    const blocks = existingEls.map((el) => consultFieldBlockOf(form, el));
    const usedNames = [];
    const cleanFields = (Array.isArray(fields) ? fields : []).slice(0, 24);
    const keptPositions = new Set(cleanFields.map((field) => field?.index).filter((idx) => Number.isInteger(idx)));

    // 1) Update kept fields in place; build new/replacement nodes.
    const desiredBlocks = cleanFields.map((field) => {
      const label = String(field?.label || '').trim().slice(0, 120) || 'Field';
      if (Number.isInteger(field?.index) && existingEls[field.index]) {
        const el = existingEls[field.index];
        const node = buildConsultDraftField(doc, field, usedNames, el);
        if (node === consultFieldWrapperOf(el)) return blocks[field.index];
        const newControl = consultSwapControl(doc, el, node, label);
        return consultFieldBlockOf(form, newControl);
      }
      const templateControl = existingEls.find((el, idx) => keptPositions.has(idx)) || existingEls[0] || null;
      return consultCloneBlockFor(doc, form, field, usedNames, templateControl);
    });

    // 2) Remove deleted fields as whole blocks (with any external label).
    existingEls.forEach((el, idx) => {
      if (keptPositions.has(idx)) return;
      const externalLabel = consultFieldExternalLabelEl(doc, el);
      const block = blocks[idx];
      if (block.parentElement) block.remove();
      else if (consultFieldWrapperOf(el).parentElement) consultFieldWrapperOf(el).remove();
      if (externalLabel && externalLabel.isConnected && externalLabel.parentElement) externalLabel.remove();
    });

    // 3) Place blocks. When all kept blocks share one parent, order everything
    //    there; otherwise leave kept blocks alone and add new ones at the end.
    const connectedDesired = desiredBlocks.filter((block) => block.isConnected);
    const commonParent = connectedDesired.length && connectedDesired.every((block) => block.parentElement === connectedDesired[0].parentElement)
      ? connectedDesired[0].parentElement
      : null;
    if (commonParent) {
      const placeholder = doc.createElement('span');
      commonParent.insertBefore(placeholder, connectedDesired[0]);
      desiredBlocks.forEach((block) => commonParent.insertBefore(block, placeholder));
      placeholder.remove();
    } else {
      const anchor = form.querySelector('button[type="submit"],input[type="submit"]')
        || form.querySelector('button')
        || form.querySelector('[data-consult-form-status]');
      let anchorTop = anchor;
      while (anchorTop && anchorTop.parentElement && anchorTop.parentElement !== form) anchorTop = anchorTop.parentElement;
      desiredBlocks.forEach((block) => {
        if (block.isConnected) return;
        if (anchorTop && anchorTop.parentElement === form) form.insertBefore(block, anchorTop);
        else form.appendChild(block);
      });
    }
    const cleanSubmitLabel = String(submitLabel || '').trim().slice(0, 60);
    if (cleanSubmitLabel) {
      const submitButton = form.querySelector('button[type="submit"],input[type="submit"]') || form.querySelector('button');
      if (submitButton) {
        if (submitButton.tagName.toLowerCase() === 'input') submitButton.setAttribute('value', cleanSubmitLabel);
        else submitButton.textContent = cleanSubmitLabel;
      }
    }
    form.setAttribute('data-standalone-consult-form', '1');
    const committed = commitStandaloneDraftHtml(serializeConsultDocument(doc, isFullDoc));
    return committed ? { ok: true } : { ok: false, error: 'Could not update the page draft.' };
  }

  function insertConsultFormIntoDraft() {
    const { html } = consultDraftCustomCode();
    const { doc, isFullDoc } = parseConsultDocument(html);
    if (doc.querySelector('form')) return { ok: true };
    const section = doc.createElement('section');
    section.style.cssText = 'position:relative;display:grid;gap:14px;padding:24px;margin:16px auto;max-width:460px;border-radius:24px;background:#ffffff;box-shadow:0 18px 36px rgba(15,23,42,.10)';
    section.innerHTML = '<div style="font:800 28px/1.1 system-ui,sans-serif;color:#0f172a">Book a consultation</div>'
      + '<div style="font:500 15px/1.6 system-ui,sans-serif;color:#475569">Tell us what you need and we will reach out with next steps.</div>'
      + '<form data-standalone-consult-form="1" style="display:grid;gap:12px">'
      + '<input type="text" name="fullName" placeholder="Your name" style="min-height:46px;padding:0 14px;border:1px solid rgba(15,23,42,.12);border-radius:14px">'
      + '<input type="email" name="email" placeholder="Email address" style="min-height:46px;padding:0 14px;border:1px solid rgba(15,23,42,.12);border-radius:14px">'
      + '<input type="tel" name="phone" placeholder="Phone (optional)" style="min-height:46px;padding:0 14px;border:1px solid rgba(15,23,42,.12);border-radius:14px">'
      + '<textarea name="goal" placeholder="What do you need help with?" style="min-height:120px;padding:14px;border:1px solid rgba(15,23,42,.12);border-radius:14px;resize:vertical"></textarea>'
      + '<button type="submit" style="min-height:48px;padding:0 18px;border:0;border-radius:999px;background:#2563eb;color:#ffffff;font:800 15px/1 system-ui,sans-serif;width:fit-content">Request consultation</button>'
      + '<div data-consult-form-status style="font:600 13px/1.4 system-ui,sans-serif;color:#475569"></div>'
      + '</form>';
    doc.body.appendChild(section);
    const committed = commitStandaloneDraftHtml(serializeConsultDocument(doc, isFullDoc));
    return committed ? { ok: true } : { ok: false, error: 'Could not update the page draft.' };
  }

  function openConsultFormSettingsModal() {
    const page = trainerSettingsPage();
    if (!page?.id) {
      showStandaloneTransientToast('Save your site with Done first, then open the form settings.', 'error');
      return;
    }
    ensureTrainerSettingsStyle();
    closeTrainerSettingsModal();
    const settings = page.settings && typeof page.settings === 'object' ? cloneJson(page.settings) : {};
    const consult = settings.consultForm && typeof settings.consultForm === 'object' ? settings.consultForm : {};
    const overlay = document.createElement('div');
    overlay.id = 'trainer-settings-overlay';
    overlay.innerHTML = `
      <div class="trainer-settings-panel" role="dialog" aria-modal="true" aria-label="Consultation form settings">
        <div class="trainer-settings-head">
          <div>
            <div class="trainer-settings-title">Consultation form</div>
            <div class="trainer-settings-sub">Control where submissions go and what visitors see.</div>
          </div>
          <button type="button" class="trainer-settings-close" data-consult-close aria-label="Close">&#10005;</button>
        </div>
        <div class="trainer-settings-body">
          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">Where submissions land</div>
            <div class="trainer-settings-note" style="margin-top:0">
              Every submission is saved automatically: open <strong>Consult Form Hits</strong> in your control panel to see every field someone filled out, and <strong>Potential Clients</strong> to work the lead pipeline. Nothing extra to set up.
            </div>
          </div>
          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">Form fields</div>
            <div data-consult-fields-list style="display:grid;gap:10px">
              <div class="trainer-settings-note" style="margin-top:0">Loading fields...</div>
            </div>
            <div class="trainer-settings-row" style="margin-top:10px">
              <button type="button" class="trainer-settings-btn is-ghost" data-consult-field-add>+ Add field</button>
            </div>
            <div class="trainer-settings-field" style="margin-top:12px">
              <label for="trainer-consult-submit-label">Submit button text</label>
              <input id="trainer-consult-submit-label" data-consult-submit-label type="text" maxlength="60" placeholder="Request consultation">
            </div>
            <div class="trainer-settings-row">
              <button type="button" class="trainer-settings-btn" data-consult-fields-apply>Apply changes to form</button>
            </div>
            <div class="trainer-settings-note">Rename questions, switch a question to a dropdown with your own choices, mark it required, reorder, or remove it. Changes show instantly in the preview - press Done afterwards to save your site.</div>
          </div>
          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">Webhook / API forwarding</div>
            <div class="trainer-settings-field">
              <label for="trainer-consult-webhook">Webhook URL (optional)</label>
              <input id="trainer-consult-webhook" type="url" placeholder="https://hooks.zapier.com/..." value="${escapeHtml(String(consult.webhookUrl || '').trim())}" autocomplete="off" spellcheck="false">
            </div>
            <div class="trainer-settings-note" style="margin-top:0">
              Each submission is also POSTed as JSON to this URL the moment it arrives. Works with Zapier, Make, Slack, GoHighLevel, or your own API - use it to get a text, an email, or a CRM entry however you want it.
            </div>
            <div class="trainer-settings-row" style="margin-top:10px">
              <button type="button" class="trainer-settings-btn is-ghost" data-consult-test>Send test payload</button>
            </div>
          </div>
          <div class="trainer-settings-card">
            <div class="trainer-settings-kicker">After someone submits</div>
            <div class="trainer-settings-field">
              <label for="trainer-consult-success">Thank-you message</label>
              <input id="trainer-consult-success" type="text" maxlength="200" placeholder="Sent! The coach will reach out soon." value="${escapeHtml(String(consult.successMessage || '').trim())}">
            </div>
            <div class="trainer-settings-note" style="margin-top:0">Shown inside the form right after a visitor submits.</div>
          </div>
          <div class="trainer-settings-card">
            <div class="trainer-settings-row">
              <button type="button" class="trainer-settings-btn" data-consult-save>Save form settings</button>
              <button type="button" class="trainer-settings-btn is-ghost" data-consult-close>Cancel</button>
            </div>
            <div class="trainer-settings-feedback" data-consult-feedback></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.addEventListener('keydown', handleTrainerSettingsKeydown, true);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) closeTrainerSettingsModal();
    });
    overlay.querySelectorAll('[data-consult-close]').forEach((button) => {
      button.addEventListener('click', () => closeTrainerSettingsModal());
    });
    const webhookInput = overlay.querySelector('#trainer-consult-webhook');
    const successInput = overlay.querySelector('#trainer-consult-success');
    const feedbackEl = overlay.querySelector('[data-consult-feedback]');
    const fieldsListEl = overlay.querySelector('[data-consult-fields-list]');
    const submitLabelInput = overlay.querySelector('[data-consult-submit-label]');
    // Keep keystrokes inside the modal: broken third-party keydown handlers on
    // the page (e.g. template page-events scripts) must never eat typing here.
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeTrainerSettingsModal();
        return;
      }
      event.stopPropagation();
    });
    const CONSULT_FIELD_TYPES = CONSULT_FIELD_TYPE_CHOICES;
    const rowInputStyle = 'min-height:36px;padding:0 10px;border-radius:10px;border:1px solid rgba(148,163,184,.2);background:rgba(2,6,23,.55);color:#f8fafc;font:600 12.5px/1.2 system-ui,sans-serif;outline:none';
    const rowButtonStyle = 'min-width:30px;min-height:30px;border:0;border-radius:8px;background:rgba(148,163,184,.14);color:#e2e8f0;font:700 13px/1 system-ui,sans-serif;cursor:pointer';
    const buildConsultFieldRow = (field = {}) => {
      const row = document.createElement('div');
      row.setAttribute('data-field-row', '1');
      if (Number.isInteger(field.index) && field.index >= 0) row.setAttribute('data-field-index', String(field.index));
      row.style.cssText = 'display:grid;gap:8px;padding:12px;border-radius:12px;background:rgba(2,6,23,.4);border:1px solid rgba(148,163,184,.16)';
      const type = String(field.type || 'text');
      row.innerHTML = `
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input data-field-label type="text" maxlength="120" placeholder="Question label" value="${escapeHtml(String(field.label || '').trim())}" style="flex:1 1 90px;min-width:0;${rowInputStyle}">
          <select data-field-type style="${rowInputStyle};flex:0 0 auto">
            ${CONSULT_FIELD_TYPES.map(([value, label]) => `<option value="${value}"${type === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
          <button type="button" data-field-up title="Move up" style="${rowButtonStyle}">&#8593;</button>
          <button type="button" data-field-down title="Move down" style="${rowButtonStyle}">&#8595;</button>
          <button type="button" data-field-remove title="Remove field" style="${rowButtonStyle};color:#fca5a5">&#10005;</button>
        </div>
        <input data-field-options type="text" placeholder="Choices, separated by commas (e.g. Online, In person, Hybrid)" value="${escapeHtml((Array.isArray(field.options) ? field.options : []).join(', '))}" style="${rowInputStyle};${type === 'select' ? '' : 'display:none'}">
        <label style="display:flex;align-items:center;gap:8px;font:600 12px/1.2 system-ui,sans-serif;color:#cbd5e1;cursor:pointer">
          <input data-field-required type="checkbox"${field.required === true ? ' checked' : ''} style="width:15px;height:15px;accent-color:#2563eb"> Required
        </label>
      `;
      return row;
    };
    const renderConsultFieldRows = (fields) => {
      if (!fieldsListEl) return;
      fieldsListEl.innerHTML = '';
      if (!fields.length) {
        const note = document.createElement('div');
        note.className = 'trainer-settings-note';
        note.style.marginTop = '0';
        note.textContent = 'No fields yet - use + Add field to build your form.';
        fieldsListEl.appendChild(note);
        return;
      }
      fields.forEach((field) => fieldsListEl.appendChild(buildConsultFieldRow(field)));
    };
    const refreshConsultFieldEditor = ({ preserveSubmitLabel = false } = {}) => {
      const described = describeConsultFormFromDraft();
      if (!described.exists) {
        if (fieldsListEl) {
          fieldsListEl.innerHTML = '';
          const note = document.createElement('div');
          note.className = 'trainer-settings-note';
          note.style.marginTop = '0';
          note.textContent = 'This page has no consultation form yet.';
          const insertButton = document.createElement('button');
          insertButton.type = 'button';
          insertButton.className = 'trainer-settings-btn';
          insertButton.style.marginTop = '10px';
          insertButton.textContent = 'Insert a consultation form';
          insertButton.addEventListener('click', () => {
            const result = insertConsultFormIntoDraft();
            if (result.ok) {
              trainerSettingsFeedback(feedbackEl, 'Consultation form added to your page. Customize the fields below.', true);
              refreshConsultFieldEditor();
            } else {
              trainerSettingsFeedback(feedbackEl, result.error || 'Could not add the form.', false);
            }
          });
          fieldsListEl.appendChild(note);
          fieldsListEl.appendChild(insertButton);
        }
        return described;
      }
      renderConsultFieldRows(described.fields);
      if (submitLabelInput && !preserveSubmitLabel) submitLabelInput.value = described.submitLabel;
      return described;
    };
    fieldsListEl?.addEventListener('change', (event) => {
      const typeSelect = event.target instanceof Element ? event.target.closest('[data-field-type]') : null;
      if (!typeSelect) return;
      const row = typeSelect.closest('[data-field-row]');
      const optionsInput = row?.querySelector('[data-field-options]');
      if (optionsInput) optionsInput.style.display = typeSelect.value === 'select' ? '' : 'none';
    });
    fieldsListEl?.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (!button) return;
      const row = button.closest('[data-field-row]');
      if (!row) return;
      if (button.hasAttribute('data-field-remove')) {
        row.remove();
        if (!fieldsListEl.querySelector('[data-field-row]')) renderConsultFieldRows([]);
        return;
      }
      if (button.hasAttribute('data-field-up') && row.previousElementSibling?.hasAttribute('data-field-row')) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
        return;
      }
      if (button.hasAttribute('data-field-down') && row.nextElementSibling?.hasAttribute('data-field-row')) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      }
    });
    overlay.querySelector('[data-consult-field-add]')?.addEventListener('click', () => {
      fieldsListEl?.querySelector('.trainer-settings-note')?.remove();
      const row = buildConsultFieldRow({ label: '', type: 'text', required: false, options: [] });
      fieldsListEl?.appendChild(row);
      row.querySelector('[data-field-label]')?.focus();
    });
    overlay.querySelector('[data-consult-fields-apply]')?.addEventListener('click', () => {
      const fields = Array.from(fieldsListEl?.querySelectorAll('[data-field-row]') || []).map((row) => {
        const rawIndex = row.getAttribute('data-field-index');
        const originalIndex = rawIndex === null || rawIndex === '' ? NaN : Number(rawIndex);
        return {
          index: Number.isInteger(originalIndex) && originalIndex >= 0 ? originalIndex : null,
          label: String(row.querySelector('[data-field-label]')?.value || '').trim(),
          type: String(row.querySelector('[data-field-type]')?.value || 'text'),
          required: row.querySelector('[data-field-required]')?.checked === true,
          options: String(row.querySelector('[data-field-options]')?.value || '')
            .split(',')
            .map((opt) => opt.trim())
            .filter(Boolean)
        };
      }).filter((field) => field.label);
      if (!fields.length) {
        trainerSettingsFeedback(feedbackEl, 'Give each field a label first (or add at least one field).', false);
        return;
      }
      const result = applyConsultFormToDraft({
        fields,
        submitLabel: String(submitLabelInput?.value || '').trim()
      });
      if (!result.ok) {
        trainerSettingsFeedback(feedbackEl, result.error || 'Could not update the form.', false);
        return;
      }
      trainerSettingsFeedback(feedbackEl, 'Form updated. It already shows in the preview - press Done when you finish editing to save your site.', true);
      refreshConsultFieldEditor({ preserveSubmitLabel: true });
    });
    refreshConsultFieldEditor();
    overlay.querySelector('[data-consult-test]')?.addEventListener('click', async () => {
      const url = String(webhookInput?.value || '').trim();
      if (!/^https?:\/\//i.test(url)) {
        trainerSettingsFeedback(feedbackEl, 'Enter a webhook URL that starts with https:// first.', false);
        return;
      }
      try {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            event: 'consult_form_test',
            coachSite: trainerSettingsLiveUrl(page),
            lead: {
              fullName: 'Test Lead',
              email: 'test@example.com',
              phone: '+1 555 010 1234',
              answers: { goal: 'This is a test submission from your consultation form settings.' }
            },
            sentAt: new Date().toISOString()
          })
        });
        trainerSettingsFeedback(feedbackEl, 'Test payload sent - check your webhook receiver.', true);
      } catch {
        trainerSettingsFeedback(feedbackEl, 'Could not reach that URL from the browser. Save it anyway - the server will still deliver real submissions.', false);
      }
    });
    overlay.querySelector('[data-consult-save]')?.addEventListener('click', async () => {
      const url = String(webhookInput?.value || '').trim();
      if (url && !/^https?:\/\//i.test(url)) {
        trainerSettingsFeedback(feedbackEl, 'Webhook URL must start with http:// or https://.', false);
        return;
      }
      trainerSettingsFeedback(feedbackEl, 'Saving...', true);
      try {
        await saveTrainerPageSettingsPatch({
          settings: {
            ...settings,
            consultForm: {
              ...consult,
              webhookUrl: url,
              successMessage: String(successInput?.value || '').trim()
            }
          }
        });
        trainerSettingsFeedback(feedbackEl, 'Saved. New submissions use these settings right away.', true);
      } catch (err) {
        trainerSettingsFeedback(feedbackEl, err?.message || 'Could not save settings.', false);
      }
    });
  }

  function bindPublicLeadForms() {
    document.querySelectorAll('[data-public-trainer-form]').forEach((formEl) => {
      formEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formId = String(formEl.getAttribute('data-public-trainer-form') || '').trim();
        const statusEl = formEl.querySelector(`[data-public-form-status="${formId}"]`);
        const formData = new FormData(formEl);
        const answers = {};
        for (const [key, value] of formData.entries()) {
          if (!key || ['siteSlug', 'pageSlug', 'pageName', 'formId'].includes(String(key))) continue;
          if (value instanceof File) continue;
          if (Object.prototype.hasOwnProperty.call(answers, key)) {
            const current = answers[key];
            answers[key] = Array.isArray(current) ? [...current, value] : [current, value];
            continue;
          }
          answers[key] = value;
        }
        const uploadEntries = await Promise.all(
          Array.from(formEl.querySelectorAll('input[type="file"]')).map(async (input) => ({
            key: String(input.getAttribute('name') || '').trim(),
            files: await filesToLeadUploads(input.files)
          }))
        );
        const payload = {
          siteSlug: String(formData.get('siteSlug') || '').trim(),
          pageSlug: String(formData.get('pageSlug') || '').trim(),
          pageName: String(formData.get('pageName') || '').trim(),
          formId,
          fullName: String(formData.get('fullName') || formData.get('name') || '').trim(),
          email: String(formData.get('email') || '').trim(),
          phone: String(formData.get('phone') || '').trim(),
          goal: String(formData.get('goal') || '').trim(),
          budget: String(formData.get('budget') || '').trim(),
          location: String(formData.get('location') || '').trim(),
          coachingType: String(formData.get('coachingType') || formData.get('coaching_type') || '').trim(),
          availability: String(formData.get('availability') || '').trim(),
          injuries: String(formData.get('injuries') || '').trim(),
          answers,
          uploads: uploadEntries.filter((entry) => entry.key && entry.files.length)
        };
        if (statusEl) statusEl.textContent = 'Sending...';
        const resp = await api('/api/coach/pages/lead', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (!resp.ok || !resp.json?.ok) {
          if (statusEl) statusEl.textContent = resp.json?.error || 'Could not submit right now.';
          return;
        }
        formEl.reset();
        const redirectTarget = String(resp.json?.automation?.redirectTarget || '').trim();
        if (statusEl) statusEl.textContent = 'Submitted. The coach can review this lead now.';
        if (redirectTarget) {
          window.requestAnimationFrame(() => {
            try {
              window.location.assign(redirectTarget);
            } catch {
              window.location.href = redirectTarget;
            }
          });
        }
      });
    });
  }

  async function trackPublicTrainerPageEvent(payload = {}) {
    const body = payload && typeof payload === 'object' ? payload : {};
    const siteSlug = String(body.siteSlug || pageState.publicPagePayload?.page?.siteSlug || '').trim();
    if (!siteSlug) return { ok: false };
    return api('/api/coach/pages/event', {
      method: 'POST',
      body: JSON.stringify({
        siteSlug,
        pageSlug: String(body.pageSlug || pageState.publicPagePayload?.page?.pageSlug || '').trim(),
        eventType: String(body.eventType || '').trim(),
        eventTarget: String(body.eventTarget || '').trim()
      })
    });
  }

  function bindPublicPageAutomation() {
    const publicPage = pageState.publicPagePayload?.page || null;
    if (!publicPage || editorState.enabled) return;
    const resolvePublicRouteUrl = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return null;
      try {
        return new URL(raw, window.location.origin);
      } catch {
        return null;
      }
    };
    const applyPublicRouteTarget = (hashValue, { behavior = 'smooth' } = {}) => {
      const rawHash = String(hashValue || '').trim();
      if (!rawHash || rawHash === '#') return false;
      const targetId = decodeURIComponent(rawHash.replace(/^#/, '')).trim();
      if (!targetId) return false;
      const target = document.getElementById(targetId);
      if (!(target instanceof HTMLElement)) return false;
      const pageGroup = target.closest('#coachVSLWebsite') || document;
      if (target.classList.contains('cv-page')) {
        pageGroup.querySelectorAll?.('.cv-page').forEach((page) => page.classList.remove('active'));
        target.classList.add('active');
        const mobileNav = document.getElementById('cvMobileNav');
        if (mobileNav) mobileNav.classList.remove('open');
        try {
          window.scrollTo({ top: 0, behavior });
        } catch {
          window.scrollTo(0, 0);
        }
        return true;
      }
      try {
        target.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
      } catch {
        target.scrollIntoView();
      }
      return true;
    };
    const navigateToPublicRoute = (targetUrl, { replaceHash = false } = {}) => {
      if (!(targetUrl instanceof URL)) return false;
      const protocol = String(targetUrl.protocol || '').trim().toLowerCase();
      const useRelativePath = protocol === 'http:' || protocol === 'https:';
      const nextHref = useRelativePath
        ? (`${targetUrl.pathname || ''}${targetUrl.search || ''}${targetUrl.hash || ''}` || targetUrl.href)
        : String(targetUrl.href || '').trim();
      if (!nextHref) return false;
      if (replaceHash) {
        try {
          history.replaceState({}, '', nextHref);
          return true;
        } catch {
          // ignore history failures
        }
      }
      try {
        window.location.assign(nextHref);
      } catch {
        window.location.href = nextHref;
      }
      return true;
    };
    const currentPublicUrl = resolvePublicRouteUrl(builderPagePath(publicPage));
    const currentPublicPath = String(currentPublicUrl?.pathname || window.location.pathname || '').trim();
    const bindStandaloneRouteButton = (node) => {
      if (!(node instanceof HTMLElement) || node.dataset.publicStandaloneRouteBound === '1') return;
      node.dataset.publicStandaloneRouteBound = '1';
      if (node.getAttribute('data-standalone-route-button') === '1') {
        const baseShadow = String(node.style.boxShadow || '').trim();
        const baseTransform = String(node.style.transform || '').trim();
        const setRouteVisualState = (active) => {
          node.style.transform = active ? 'translateY(-1px)' : baseTransform;
          node.style.boxShadow = active
            ? '0 22px 42px rgba(37,99,235,.34), inset 0 1px 0 rgba(255,255,255,.24)'
            : baseShadow;
          node.style.filter = active ? 'brightness(1.04) saturate(1.08)' : 'saturate(1.04)';
        };
        node.addEventListener('mouseenter', () => setRouteVisualState(true));
        node.addEventListener('mouseleave', () => setRouteVisualState(false));
        node.addEventListener('focus', () => setRouteVisualState(true));
        node.addEventListener('blur', () => setRouteVisualState(false));
      }
      node.addEventListener('click', (event) => {
        const routeHref = String(node.getAttribute('data-standalone-route-href') || node.getAttribute('href') || '').trim();
        if (!routeHref || routeHref === '#') return;
        const targetUrl = resolvePublicRouteUrl(routeHref);
        if (!targetUrl) return;
        const routeProtocol = String(targetUrl.protocol || '').trim().toLowerCase();
        if (routeProtocol === 'mailto:' || routeProtocol === 'tel:') {
          if (node.tagName.toLowerCase() === 'a' && node.getAttribute('href')) return;
          event.preventDefault();
          event.stopPropagation();
          navigateToPublicRoute(targetUrl);
          return;
        }
        const isSameOrigin = !targetUrl.origin || targetUrl.origin === window.location.origin;
        if (!isSameOrigin) {
          if (node.tagName.toLowerCase() === 'a' && node.getAttribute('href')) return;
          event.preventDefault();
          event.stopPropagation();
          navigateToPublicRoute(targetUrl);
          return;
        }
        const isCurrentPageRoute = !targetUrl.pathname || targetUrl.pathname === currentPublicPath || targetUrl.pathname === window.location.pathname;
        if (isCurrentPageRoute && targetUrl.hash) {
          event.preventDefault();
          event.stopPropagation();
          navigateToPublicRoute(targetUrl, { replaceHash: true });
          applyPublicRouteTarget(targetUrl.hash, { behavior: 'smooth' });
          return;
        }
        if (isCurrentPageRoute && node.tagName.toLowerCase() !== 'a') {
          event.preventDefault();
          event.stopPropagation();
          navigateToPublicRoute(targetUrl);
          return;
        }
        if (targetUrl.hash) {
          event.preventDefault();
          event.stopPropagation();
          navigateToPublicRoute(targetUrl);
          return;
        }
        if (node.tagName.toLowerCase() !== 'a') {
          event.preventDefault();
          event.stopPropagation();
          navigateToPublicRoute(targetUrl);
        }
      });
    };
    const pageKey = `${String(publicPage.siteSlug || '').trim()}:${String(publicPage.pageSlug || '').trim() || 'home'}`;
    if (pageState.publicAutomationEventKey !== pageKey) {
      pageState.publicAutomationEventKey = pageKey;
      void trackPublicTrainerPageEvent({
        eventType: 'page_viewed',
        siteSlug: publicPage.siteSlug,
        pageSlug: publicPage.pageSlug
      }).catch(() => {});
    }
    document.querySelectorAll('[data-public-builder-cta="1"]').forEach((link) => {
      if (link.dataset.publicBuilderBound === '1') return;
      link.dataset.publicBuilderBound = '1';
      link.addEventListener('click', async (event) => {
        const href = String(link.getAttribute('href') || '').trim();
        if (!href || href === '#') return;
        event.preventDefault();
        let redirectTarget = '';
        try {
          const resp = await trackPublicTrainerPageEvent({
            eventType: 'button_clicked',
            eventTarget: String(link.getAttribute('data-public-builder-cta-target') || href).trim(),
            siteSlug: publicPage.siteSlug,
            pageSlug: publicPage.pageSlug
          });
          redirectTarget = String(resp?.json?.automation?.redirectTarget || '').trim();
        } catch {
          // ignore tracking failures
        }
        window.location.href = redirectTarget || href;
      });
    });
    document.querySelectorAll('[data-standalone-route-href], a[href^="#"], a[href^="/coach/"]').forEach((node) => {
      bindStandaloneRouteButton(node);
    });
    if (window.location.hash) {
      window.setTimeout(() => {
        applyPublicRouteTarget(window.location.hash, { behavior: 'smooth' });
      }, 80);
    }
    if (window.__trainerPublicCtaBridgeBound !== true) {
      window.__trainerPublicCtaBridgeBound = true;
      window.addEventListener('message', async (event) => {
        const data = event?.data && typeof event.data === 'object' ? event.data : null;
        if (!data) return;
        if (data.type === 'trainer_builder_resize') {
          const frame = Array.from(document.querySelectorAll('iframe[data-builder-preview-frame="1"]'))
            .find((node) => {
              try {
                return node.contentWindow === event.source;
              } catch {
                return false;
              }
            });
          if (frame) {
            const standaloneRoute = document.body.classList.contains('trainer-public-standalone-route');
            if (standaloneRoute) return;
            const minHeight = standaloneRoute
              ? Math.max(window.innerHeight || 0, 720)
              : (String(frame.getAttribute('data-builder-preview-surface') || '').trim() === 'public' ? 820 : 640);
            const requestedHeight = Math.round(Number(data.height) || 0);
            const nextHeight = Math.min(12000, Math.max(minHeight, requestedHeight));
            const currentHeight = Math.round(parseFloat(frame.style.height || '0') || frame.getBoundingClientRect().height || 0);
            if (Math.abs(nextHeight - currentHeight) > 10) {
              frame.style.height = `${nextHeight}px`;
            }
          }
          return;
        }
        if (data.type === 'trainer_builder_lead') {
          void handleTrainerBuilderLeadMessage(event, data);
          return;
        }
        if (data.type !== 'trainer_builder_cta') return;
        const activePage = pageState.publicPagePayload?.page || null;
        const href = String(data.href || '').trim();
        if (!href || href === '#') return;
        if (!activePage?.siteSlug) {
          // Owners viewing their own route have no public payload - still follow
          // the link so nav buttons work outside edit mode.
          if (/^(https?:|mailto:|tel:|sms:)/i.test(href) || href.startsWith('/') || href.startsWith('#')) {
            window.location.href = href;
          }
          return;
        }
        let redirectTarget = '';
        try {
          const resp = await trackPublicTrainerPageEvent({
            eventType: 'button_clicked',
            eventTarget: String(data.target || href).trim() || href,
            siteSlug: activePage.siteSlug,
            pageSlug: activePage.pageSlug
          });
          redirectTarget = String(resp?.json?.automation?.redirectTarget || '').trim();
        } catch {
          // ignore tracking failures
        }
        window.location.href = redirectTarget || href;
      });
    }
  }

  function renderProfile(trainer, view = '') {
    pageState.view = view;
    const resultsGalleryView = isResultsGalleryView(view);
    const ownerCanEditRoute = canEditTrainerPage(trainer, view);
    const fullName = trainer?.fullName || trainer?.displayName || 'Trainer';
    const username = trainer?.username || slugify(fullName) || 'trainer';
    const handle = trainer?.publicHandle || username;
    const trainerKey = handle || username;
    const avatarSrc = trainer?.photoDataUrl || '/assets/images/placeholders/profile-placeholder.jpg';
    const coachTags = [
      ...(Array.isArray(trainer?.coachBadgeType) ? trainer.coachBadgeType : []),
      ...(Array.isArray(trainer?.coachCustomTags) ? trainer.coachCustomTags : [])
    ].filter(Boolean);
    const tierName = coachTags[0] || trainer?.proof?.tier?.name || 'Trainer';
    const experienceLevel = coachTags[1] || trainer?.experienceLevel || 'Experienced';
    const reviewStatus = String(trainer?.reviewStatus || '').trim().toLowerCase();
    const reviewChip = reviewStatus === 'review'
      ? '<span class="trainer-profile-chip review">Review</span>'
      : '';
    const locationText = buildLocationText(trainer);
    const modeText = buildModeText(trainer);
    const proof = trainer?.proof || {};
    const bio = resolveBio(trainer);
    const explicitSummary = String(trainer?.brandPositioning || '').trim();
    const summaryPitch = trimToWordLimit(explicitSummary || bio, 75);
    const yearsLabel = resolveYearsLabel(trainer);
    const priceRangeLabel = resolvePriceRangeLabel(trainer);
    const heroHeadline = trimToWordLimit(resolveHeroHeadline(trainer), 27);
    const heroSubheadline = summarizePitch(resolveHeroSubheadline(trainer), 150);
    const topSectionLabel = String(trainer?.topSectionLabel || '1:1 coaching for busy people who want real physique progress').trim();
    const specialtyClients = resolveSpecialtyClients(trainer);
    const includedItems = resolveIncludedItems(trainer);
    const transformations = resolveTransformations(trainer);
    const proofCases = transformations.length ? transformations : [
      {
        beforeImage: '/assets/images/trainers/client-before-02.jpg',
        afterImage: '/assets/images/trainers/client-after-03.jpg',
        label: 'Client result',
        result: '-12 lb in 10 weeks',
        timeline: '10 weeks',
        copy: 'Dropped body fat, tightened waist, and got back into a routine that stuck.',
        quote: 'The structure finally made it easy to stay locked in.',
        person: 'Busy professional'
      },
      {
        beforeImage: '/assets/images/trainers/client-before-01.jpg',
        afterImage: '/assets/images/trainers/client-after-02.jpg',
        label: 'Client result',
        result: 'Waist down 3 in',
        timeline: '8 weeks',
        copy: 'Stronger, leaner, and more consistent.',
        quote: 'I stopped guessing and just followed the plan.',
        person: 'Hybrid client'
      },
      {
        beforeImage: '/assets/images/trainers/client-before-03.jpg',
        afterImage: '/assets/images/trainers/transformation-01.jpg',
        label: 'Client result',
        result: 'Leaner look in 12 weeks',
        timeline: '12 weeks',
        copy: 'Simpler food structure and weekly check-ins made adherence easy.',
        quote: 'I finally looked like I actually trained.',
        person: 'Remote client'
      },
      {
        beforeImage: '/assets/images/trainers/client-before-04.jpg',
        afterImage: '/assets/images/trainers/transformation-02.jpg',
        label: 'Client result',
        result: 'Body fat down',
        timeline: '14 weeks',
        copy: 'Consistent training plus tighter nutrition cleaned things up fast.',
        quote: 'This was the first plan I actually kept up with.',
        person: 'Online client'
      }
    ];
    const availabilityCalendar = buildAvailabilityCalendar(trainer);
    const consultSpotCount = availabilityCalendar.days.reduce((total, item) => total + (Array.isArray(item.slots) ? item.slots.length : 0), 0);
    const consultSpotCopy = String(trainer?.bookingUrgency || '').trim() || (consultSpotCount > 1
      ? `${consultSpotCount} consult windows are open right now.`
      : 'Next consult window is open right now.');
    const activeClientCount = Number.isFinite(Number(trainer?.activeClients))
      ? Number(trainer.activeClients)
      : Math.max(Number(proof.manualClientCount || 0), 1);
    const activeClientsLabel = `${Math.max(activeClientCount, 1)}+ active clients`;
    const instagramHref = buildSocialHref('instagram', trainer?.instagramUrl || trainer?.instagramHandle);
    const tiktokHref = buildSocialHref('tiktok', trainer?.tiktokUrl || trainer?.tiktokHandle);
    const linkedinHref = buildSocialHref('linkedin', trainer?.linkedinHandle || trainer?.linkedinUrl || '');
    const youtubeHref = buildSocialHref('youtube', trainer?.youtubeUrl || '');
    const websiteHref = buildSocialHref('website', trainer?.websiteUrl || '');
    const socialRow = [
      instagramHref ? buildSocialBubble(
        'instagram',
        instagramHref,
        `${fullName} on Instagram`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect><circle cx="12" cy="12" r="4.1"></circle><circle cx="17.3" cy="6.9" r="1.1"></circle></svg>'
      ) : '',
      tiktokHref ? buildSocialBubble(
        'tiktok',
        tiktokHref,
        `${fullName} on TikTok`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5c.7 2 2.1 3.2 4 3.6v2.7c-1.6-.1-2.9-.6-4-1.5v5.9a5.1 5.1 0 1 1-5.1-5.1c.4 0 .8 0 1.2.1v2.8a2.5 2.5 0 1 0 1.3 2.2V4.5Z"></path></svg>'
      ) : '',
      linkedinHref ? buildSocialBubble(
        'linkedin',
        linkedinHref,
        `${fullName} on LinkedIn`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 8.5A1.7 1.7 0 1 1 6.7 5a1.7 1.7 0 0 1 0 3.5ZM5.3 10h2.8v8.7H5.3Zm4.5 0h2.7v1.2h.1c.4-.7 1.3-1.5 2.8-1.5 3 0 3.6 2 3.6 4.5v4.5h-2.8v-4c0-1 0-2.2-1.4-2.2s-1.6 1-1.6 2.1v4.1H9.8Z"></path></svg>'
      ) : '',
      youtubeHref ? buildSocialBubble(
        'youtube',
        youtubeHref,
        `${fullName} on YouTube`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8.5a2.8 2.8 0 0 0-2-2c-1.8-.5-9-.5-9-.5s-7.2 0-9 .5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 0 12a29 29 0 0 0 1 3.5 2.8 2.8 0 0 0 2 2c1.8.5 9 .5 9 .5s7.2 0 9-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 24 12a29 29 0 0 0-1-3.5ZM9.5 15.5v-7l6 3.5Z"></path></svg>'
      ) : '',
      websiteHref ? buildSocialBubble(
        'website',
        websiteHref,
        `${fullName} website`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm5.9 8h-3.1a14.6 14.6 0 0 0-1-4.2A7 7 0 0 1 17.9 11ZM12 5.1c.8 1 1.6 3 1.9 5.9h-3.8C10.4 8.1 11.2 6.1 12 5.1ZM5.1 13h3.1a14.6 14.6 0 0 0 1 4.2A7 7 0 0 1 5.1 13Zm3.1-2H5.1a7 7 0 0 1 4.1-4.2A14.6 14.6 0 0 0 8.2 11Zm3.8 7.9c-.8-1-1.6-3-1.9-5.9h3.8c-.3 2.9-1.1 4.9-1.9 5.9Zm1.8-1.7a14.6 14.6 0 0 0 1-4.2h3.1a7 7 0 0 1-4.1 4.2Z"></path></svg>'
      ) : ''
    ].filter(Boolean).join('');
    const heroEl = $('#trainer-profile-hero');
    const contentEl = $('#trainer-profile-content');
    const backEl = document.querySelector('.trainer-profile-back');
    renderPageEditToolbar(pageState.trainer, view);
    const builderPage = resultsGalleryView
      ? null
      : normalizeBuilderPageShape(
          (editorState.enabled ? editorState.draft : null)
          || (ownerCanEditRoute ? pageState.currentTrainerPage : null)
          || pageState.publicPagePayload?.page
          || pageState.currentTrainerPage
          || ((pageState.requestedPublicRoute && pageState.publicPageLoadState?.unavailable && pageState.trainer)
            ? createBlankTrainerPage(pageState.trainer, {
                pageName: 'Home',
                navLabel: 'Home',
                pageSlug: '',
                isHome: true
              })
            : null)
          || (ownerCanEditRoute ? createBlankTrainerPage(pageState.trainer) : null)
          || null,
          {
            siteSlug: sanitizeHandle(pageState.trainer?.publicHandle || pageState.trainer?.username || username)
          }
        );
    const hasBuilderPage = Boolean(builderPage && (builderPage.id || builderPage.mode || builderPage.pageName || builderPage.siteSlug));
    const publicView = Boolean(hasBuilderPage && pageState.requestedPublicRoute);
    const standalonePublicRoute = Boolean(publicView && isStandalonePublicCoachRoute());
    document.body.classList.toggle('trainer-builder-public-page', Boolean(hasBuilderPage && publicView && !editorState.enabled));
    document.body.classList.toggle('trainer-public-standalone-route', standalonePublicRoute);
    document.body.classList.toggle('trainer-builder-editor-page', Boolean(hasBuilderPage && editorState.enabled));
    document.body.classList.remove('trainer-public-standalone-editing');
    syncStandalonePublicChrome(standalonePublicRoute);

    if (hasBuilderPage && !resultsGalleryView && publicView) {
      const seo = builderPage?.seo && typeof builderPage.seo === 'object' ? builderPage.seo : {};
      applyTrainerPageSeo({
        title: String(seo.title || builderPage?.pageName || `${fullName} coaching`).trim(),
        description: String(seo.description || trainer?.brandPositioning || summaryPitch || '').trim(),
        canonicalHref: `${window.location.origin}${builderPagePath(builderPage)}`,
        noIndex: seo.noIndex === true
      });
    } else if (resultsGalleryView) {
      applyTrainerPageSeo({
        title: `${fullName} - Client Results`,
        description: summaryPitch || INITIAL_META_DESCRIPTION,
        canonicalHref: `${window.location.origin}${window.location.pathname}`,
        noIndex: false
      });
    } else {
      applyTrainerPageSeo({
        title: `${fullName} - Trainer Profile`,
        description: summaryPitch || INITIAL_META_DESCRIPTION,
        canonicalHref: `${window.location.origin}${window.location.pathname}`,
        noIndex: false
      });
    }

    if (backEl) {
      if (resultsGalleryView) {
        backEl.href = `/trainer-profile.html?trainer=${encodeURIComponent(username)}`;
        backEl.textContent = 'Back to profile';
      } else if (hasBuilderPage) {
        backEl.href = '/coaches.html';
        backEl.textContent = standalonePublicRoute ? 'Go back' : 'Back to coaches';
      } else {
        backEl.href = '/coaches.html';
        backEl.textContent = standalonePublicRoute ? 'Go back' : 'Back to coaches';
      }
    }
    const shareToggleEl = $('#trainer-profile-share-toggle');
    const shareActionsEl = $('#trainer-profile-share-actions');
    const shareWrapEl = document.querySelector('.trainer-profile-share-wrap');
    if (shareToggleEl && shareActionsEl) {
      if (resultsGalleryView) {
        shareToggleEl.textContent = 'Share results';
      } else if (hasBuilderPage) {
        shareToggleEl.textContent = 'Share page';
      } else {
        shareToggleEl.textContent = 'Share coach';
      }
      shareActionsEl.classList.remove('is-open');
      bindShareCoachUi(trainer);
    }

    if (standalonePublicRoute) {
      const ownerCanEdit = canEditTrainerPage(trainer, view);
      const hasSavedCode = pageHasRenderableCustomCode(builderPage, { publicView: ownerCanEdit ? false : true });
      const showStandaloneEditor = Boolean(ownerCanEdit && (editorState.enabled || !hasSavedCode));
      const renderStandaloneAsPublic = ownerCanEdit ? false : true;
      document.body.classList.toggle('trainer-public-standalone-editing', showStandaloneEditor);
      if (backEl) {
        backEl.href = '/coaches.html';
        backEl.textContent = 'Back to coaches';
        backEl.hidden = showStandaloneEditor;
      }
      if (shareWrapEl) {
        if (ownerCanEdit) {
          shareWrapEl.classList.remove('is-hidden');
          shareWrapEl.innerHTML = showStandaloneEditor
            ? renderStandaloneOwnerViewportToggle()
            : renderStandaloneOwnerEditButton();
        } else {
          shareWrapEl.classList.add('is-hidden');
          shareWrapEl.innerHTML = '';
        }
      }
      if (heroEl) {
        heroEl.innerHTML = showStandaloneEditor
          ? renderStandaloneBuilderSetup(builderPage, trainer)
          : `${renderStandaloneNoticeToast()}${hasSavedCode
            ? renderActiveBuilderPage(builderPage, { publicView: renderStandaloneAsPublic })
            : renderBuilderUnavailableShell(trainer)}`;
      }
      if (contentEl) {
        contentEl.innerHTML = '';
      }
      bindPageEditControls();
      if (!showStandaloneEditor && hasSavedCode) bindRenderedImages(trainer);
      return;
    }

    if (hasBuilderPage && !resultsGalleryView) {
      if (backEl) backEl.hidden = false;
      if (shareWrapEl) shareWrapEl.classList.remove('is-hidden');
      if (heroEl) {
        heroEl.innerHTML = editorState.enabled
          ? renderBuilderWorkspace(builderPage, trainer)
          : renderBuilderPublicShell(builderPage, trainer, { publicView });
      }
      if (contentEl) {
        contentEl.innerHTML = '';
      }
      bindPageEditControls();
      bindRenderedImages(trainer);
      return;
    }

    if (!resultsGalleryView) {
      if (backEl) backEl.hidden = false;
      if (heroEl) {
        heroEl.innerHTML = renderBuilderUnavailableShell(trainer);
      }
      if (contentEl) {
        contentEl.innerHTML = '';
      }
      bindPageEditControls();
      bindRenderedImages(trainer);
      return;
    }

    if (resultsGalleryView) {
      if (backEl) backEl.hidden = false;
      if (heroEl) {
        heroEl.innerHTML = `
          <section class="trainer-profile-card trainer-profile-results-hero">
            <div class="trainer-profile-section-kicker">Client results</div>
            <h1 class="trainer-profile-results-page-title">${escapeHtml(fullName)} results</h1>
            <div class="trainer-profile-results-page-sub">Every before and after this coach wants to showcase in one place.</div>
          </section>
        `;
      }
      if (contentEl) {
        contentEl.innerHTML = buildResultsSection(proofCases, trainerKey, { showAll: true });
      }
      return;
    }
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const pathMatch = String(window.location.pathname || '').match(/^\/coach\/([^/]+)(?:\/([^/]+))?$/i);
    const param = params.get('trainer') || (pathMatch?.[1] || '');
    const view = params.get('view') || (pathMatch?.[2] || '');
    pageState.requestedPublicRoute = Boolean(String(param || '').trim() || pathMatch);
    if (pageState.requestedPublicRoute) showTrainerRouteLoader();
    pageState.publicPageLoadState = { status: 0, unavailable: false, notFound: false };
    const statusEl = $('#trainer-profile-status');
    if (statusEl) statusEl.innerHTML = '<div class="trainer-profile-muted">Loading trainer page...</div>';
    const [meResp, resp] = await Promise.all([
      api('/api/auth/me', { timeoutMs: 4500 }),
      api('/api/auth/trainers', { timeoutMs: 4500 })
    ]);
    window.__trainerProfileViewer = meResp.ok ? (meResp.json?.user || null) : null;
    let trainers = readDirectoryCache();
    if (resp.ok && resp.json?.ok && Array.isArray(resp.json?.trainers) && resp.json.trainers.length) {
      trainers = resp.json.trainers;
      try {
        sessionStorage.setItem('trainer-directory-cache', JSON.stringify(trainers));
      } catch {}
    }
    if (!trainers.length) trainers = demoTrainerFallback();

    let publicPayload = null;
    const routeHandle = sanitizeHandle(pathMatch?.[1] || param || '');
    const viewerHandle = sanitizeHandle(window.__trainerProfileViewer?.publicHandle || window.__trainerProfileViewer?.username || '');
    const ownerViewingOwnRoute = Boolean(routeHandle && viewerHandle && routeHandle === viewerHandle);
    if (param) {
      if (!ownerViewingOwnRoute) {
        const publicPageSlug = pathMatch ? view : '';
        publicPayload = await Promise.race([
          loadPublicTrainerPage(param, publicPageSlug),
          new Promise((resolve) => {
            window.setTimeout(() => resolve(null), 5000);
          })
        ]);
        if (!publicPayload && pathMatch && view) {
          if (statusEl) statusEl.textContent = 'Could not load that trainer profile.';
          hideTrainerRouteLoader();
          return;
        }
      }
    } else {
      pageState.publicPagePayload = null;
    }

    const publicTrainerKey = publicPayload?.trainer?.username || publicPayload?.trainer?.displayName || '';
    const viewerId = String(window.__trainerProfileViewer?.id || '').trim();
    const unavailablePublicFallback = !publicPayload
      && param
      && pageState.publicPageLoadState?.unavailable === true;
    const selected = findTrainerByParam(trainers, publicTrainerKey || param)
      || (unavailablePublicFallback ? buildUnavailablePublicTrainerFallback(param) : null)
      || (!param
        ? (trainers.find((trainer) => String(trainer?.id || '').trim() === viewerId)
          || trainers[0]
          || demoTrainerFallback()[0])
        : null);
    if (!selected) {
      if (statusEl) statusEl.textContent = 'Could not load that trainer profile.';
      hideTrainerRouteLoader();
      return;
    }

    pageState.trainer = publicPayload?.trainer
      ? {
          ...cloneJson(selected),
          ...cloneJson(publicPayload.trainer)
        }
      : cloneJson(selected);
    pageState.view = view;
    if (pageState.requestedPublicRoute) showTrainerRouteLoader(pageState.trainer);
    editorState.original = cloneJson(pageState.trainer);
    editorState.draft = cloneJson(pageState.trainer);
    editorState.enabled = false;
    editorState.dirty = false;
    const routeSiteSlug = sanitizeHandle(pathMatch?.[1] || param || '');
    const routePageSlug = String(pathMatch?.[2] || '').trim();
    const trainerId = String(selected?.id || '').trim();
    pageState.currentTrainerPage = null;
    if (publicPayload?.page && canEditTrainerPage(pageState.trainer, view)) {
      pageState.currentTrainerPage = cloneJson(publicPayload.page);
    }
    if (canEditTrainerPage(pageState.trainer, view)) {
      const pages = await loadTrainerPagesForViewer();
      if (pages.length) {
        const matchingSitePages = routeSiteSlug
          ? pages.filter((page) => sanitizeHandle(page?.siteSlug || '') === routeSiteSlug)
          : pages.slice();
        const allowCrossSiteFallback = !routeSiteSlug || ownerViewingOwnRoute;
        pageState.currentTrainerPage = cloneJson(
          matchingSitePages.find((page) => page.id && page.id === pageState.currentTrainerPage?.id)
          || matchingSitePages.find((page) => String(page.pageSlug || '').trim() === routePageSlug)
          || matchingSitePages.find((page) => page.isHome)
          || matchingSitePages[0]
          || (allowCrossSiteFallback
            ? (pages.find((page) => page.id && page.id === pageState.currentTrainerPage?.id)
              || pages.find((page) => String(page.pageSlug || '').trim() === routePageSlug)
              || pages.find((page) => page.isHome)
              || pages[0])
            : null)
          || pageState.currentTrainerPage
        );
      }
    }
    if (!pageState.currentTrainerPage && publicPayload?.page) {
      pageState.currentTrainerPage = cloneJson(publicPayload.page);
    }
    if (!publicPayload && param && !pageState.currentTrainerPage) {
      pageState.currentTrainerPage = createBlankTrainerPage(pageState.trainer, {
        siteSlug: routeSiteSlug || sanitizeHandle(param),
        pageName: `${String(pageState.trainer?.displayName || pageState.trainer?.fullName || 'Coach').trim() || 'Coach'} page`
      });
      pageState.currentTrainerPage.isPublished = false;
    }
    if (pageState.requestedPublicRoute && pageState.currentTrainerPage) {
      initializeQualificationState(pageState.currentTrainerPage);
    }
    if (
      pathMatch
      && canEditTrainerPage(pageState.trainer, view)
      && pageState.currentTrainerPage
      && (pageState.pendingStandaloneEditorOpen || !pageHasRenderableCustomCode(pageState.currentTrainerPage))
    ) {
      openBuilderEditor(pageState.currentTrainerPage);
      hideTrainerRouteLoader();
      return;
    }
    if (trainerId && (!viewerId || viewerId !== trainerId)) {
      api('/api/auth/trainer/profile-view', {
        method: 'POST',
        body: JSON.stringify({
          trainerUserId: trainerId,
          trainerHandle: selected?.username || selected?.publicHandle || ''
        })
      }).catch(() => null);
    }
    renderCurrentProfile();
    hideTrainerRouteLoader();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
