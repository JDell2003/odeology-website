(() => {
  const AUTH_USER_HINT_KEY = 'ode_auth_user_hint_v1';
  const ONBOARDING_DONE_KEY = 'ode_onboarding_done_v1';
  const ONBOARDING_FORCE_KEY = 'ode_onboarding_force_v1';
  const TRAINER_ENTRY_PREFILL_KEY = 'ode_trainer_entry_prefill_v1';
  const MAX_COACH_BADGES = 2;
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DAY_PREFIX = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun'
  };

  const $ = (sel) => document.querySelector(sel);
  const trainerRoutingContext = {
    managerCode: '',
    workspaceId: '',
    locationId: ''
  };

  async function api(path, options = {}) {
    try {
      const resp = await fetch(path, {
        credentials: 'include',
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      const json = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, json };
    } catch {
      return { ok: false, status: 0, json: {} };
    }
  }

  function normalizeUsername(raw) {
    return String(raw || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .slice(0, 30);
  }

  function normalizeEmailValue(raw) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) return '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function normalizePhoneValue(raw) {
    let value = String(raw || '').trim();
    if (!value) return '';
    const hasPlus = value.startsWith('+');
    value = value.replace(/[^\d+]/g, '');
    if (hasPlus) value = `+${value.replace(/[^\d]/g, '')}`;
    else value = value.replace(/[^\d]/g, '');
    const digits = value.replace(/[^\d]/g, '');
    if (digits.length < 10) return '';
    return value;
  }

  function suggestUsername({ fullName = '', email = '' } = {}) {
    const fromName = normalizeUsername(String(fullName || '').replace(/\s+/g, '_'));
    if (fromName.length >= 3) return fromName;
    const fromEmail = normalizeUsername(String(email || '').split('@')[0]);
    if (fromEmail.length >= 3) return fromEmail;
    return `trainer_${Math.random().toString(36).slice(2, 8)}`;
  }

  function splitList(raw) {
    return String(raw || '')
      .split(/\r?\n|,/)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function readCheckedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
      .map((input) => String(input.value || '').trim())
      .filter(Boolean);
  }

  function setCheckedValues(name, values = []) {
    const set = new Set((Array.isArray(values) ? values : []).map((item) => String(item || '').trim()));
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = set.has(String(input.value || '').trim());
    });
  }

  function syncLimitedChecks(name, max, noteSelector = '') {
    const inputs = Array.from(document.querySelectorAll(`input[name="${name}"]`));
    if (!inputs.length) return;
    const noteEl = noteSelector ? document.querySelector(noteSelector) : null;
    const checked = inputs.filter((input) => input.checked);
    const limitReached = checked.length >= max;

    inputs.forEach((input) => {
      const shouldDisable = limitReached && !input.checked;
      input.disabled = shouldDisable;
      input.closest('.trainer-check')?.classList.toggle('is-disabled', shouldDisable);
    });

    if (noteEl) {
      noteEl.textContent = limitReached
        ? `${max} of ${max} badges selected.`
        : `Pick up to ${max} badges.`;
    }
  }

  function setRadioValue(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = String(input.value || '') === String(value || '');
    });
  }

  function readRadioValue(name) {
    return String(document.querySelector(`input[name="${name}"]:checked`)?.value || '').trim();
  }

  function persistAuthUser(user) {
    const id = String(user?.id || '').trim();
    if (!id) return;
    try {
      localStorage.setItem(AUTH_USER_HINT_KEY, JSON.stringify({
        ts: Date.now(),
        user: {
          id,
          username: String(user?.username || '').trim(),
          email: String(user?.email || '').trim(),
          displayName: String(user?.displayName || '').trim(),
          isOwner: Boolean(user?.isOwner),
          isTech: Boolean(user?.isTech || user?.tech?.active),
          tech: { active: Boolean(user?.isTech || user?.tech?.active) },
          isDemo: Boolean(user?.isDemo || user?.demo?.active),
          demo: { active: Boolean(user?.isDemo || user?.demo?.active) },
          isTrainer: Boolean(user?.isTrainer || user?.trainer?.active),
          trainer: {
            active: Boolean(user?.isTrainer || user?.trainer?.active),
            onboarded: Boolean(user?.trainer?.onboarded || user?.trainerOnboardingComplete || user?.trainerOnboardingCompletedAt),
            onboardingCompletedAt: user?.trainer?.onboardingCompletedAt || user?.trainerOnboardingCompletedAt || null
          }
        }
      }));
    } catch {}
    window.__odeCurrentUser = {
      ...(window.__odeCurrentUser || {}),
      ...user,
      isTech: Boolean(user?.isTech || user?.tech?.active),
      tech: { active: Boolean(user?.isTech || user?.tech?.active) },
      isTrainer: Boolean(user?.isTrainer || user?.trainer?.active),
      trainer: {
        active: Boolean(user?.isTrainer || user?.trainer?.active),
        onboarded: Boolean(user?.trainer?.onboarded || user?.trainerOnboardingComplete || user?.trainerOnboardingCompletedAt),
        onboardingCompletedAt: user?.trainer?.onboardingCompletedAt || user?.trainerOnboardingCompletedAt || null
      }
    };
    try {
      window.dispatchEvent(new CustomEvent('odeauth', { detail: { user: window.__odeCurrentUser } }));
    } catch {}
  }

  function markHomepageOnboardingDone() {
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
      localStorage.removeItem(ONBOARDING_FORCE_KEY);
    } catch {}
  }

  function readEntryPrefill() {
    try {
      const raw = sessionStorage.getItem(TRAINER_ENTRY_PREFILL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function clearEntryPrefill() {
    try {
      sessionStorage.removeItem(TRAINER_ENTRY_PREFILL_KEY);
    } catch {}
  }

  function deriveDayWindows(trainer = {}) {
    const existing = trainer?.availability?.dayWindows;
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      return DAY_NAMES.reduce((acc, day) => {
        acc[day] = Array.isArray(existing[day]) ? existing[day].map(String).filter(Boolean) : [];
        return acc;
      }, {});
    }
    const next = DAY_NAMES.reduce((acc, day) => {
      acc[day] = [];
      return acc;
    }, {});
    const slots = Array.isArray(trainer?.availability?.timeSlotsAvailable) ? trainer.availability.timeSlotsAvailable : [];
    slots.forEach((slot) => {
      const text = String(slot || '').trim();
      const match = text.match(/^([A-Za-z]{3,9})\s+(.+)$/);
      if (!match) return;
      const prefix = String(match[1] || '').toLowerCase();
      const day = DAY_NAMES.find((name) => DAY_PREFIX[name].toLowerCase() === prefix || name.toLowerCase() === prefix);
      if (!day) return;
      next[day].push(String(match[2] || '').trim());
    });
    return next;
  }

  function readDayWindows() {
    return DAY_NAMES.reduce((acc, day) => {
      acc[day] = splitList(document.querySelector(`[data-day-window="${day}"]`)?.value || '');
      return acc;
    }, {});
  }

  function buildTimeSlotsAvailable(dayWindows) {
    return DAY_NAMES.flatMap((day) => {
      const windows = Array.isArray(dayWindows?.[day]) ? dayWindows[day] : [];
      return windows.map((windowText) => `${DAY_PREFIX[day]} ${windowText}`);
    });
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

  function setUploadPreview(previewEl, value, emptyLabel) {
    if (!previewEl) return;
    const src = String(value || '').trim();
    if (src) {
      previewEl.innerHTML = `<img src="${src}" alt="">`;
      return;
    }
    previewEl.innerHTML = `<span>${emptyLabel}</span>`;
  }

  function syncStandaloneUploadValue(key, value) {
    const hiddenInput = document.querySelector(`[name="${key}"]`);
    if (hiddenInput) hiddenInput.value = String(value || '').trim();
    const previewEl = document.querySelector(`[data-image-preview="${key}"]`);
    setUploadPreview(previewEl, value, 'Add coach photo');
  }

  function syncResultUploadValue(card, key, value) {
    if (!card) return;
    const hiddenInput = card.querySelector(`[data-result-field="${key}"]`);
    if (hiddenInput) hiddenInput.value = String(value || '').trim();
    const previewEl = card.querySelector(`[data-result-preview="${key}"]`);
    setUploadPreview(previewEl, value, key === 'beforeImage' ? 'Add before photo' : 'Add after photo');
  }

  function setAccountSectionVisible(visible) {
    const section = $('#trainer-account-section');
    if (!section) return;
    section.classList.toggle('hidden', !visible);
    $('#trainer-username')?.toggleAttribute('required', visible);
    $('#trainer-password')?.toggleAttribute('required', visible);
  }

  function resultTemplate() {
    return $('#trainer-result-template');
  }

  function bindResultCard(card) {
    card.querySelector('[data-remove-result]')?.addEventListener('click', () => {
      const list = $('#trainer-results-list');
      card.remove();
      if (list && !list.children.length) addResultCard();
    });
    card.querySelectorAll('[data-result-file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const key = String(input.getAttribute('data-result-file') || '').trim();
        const file = input.files && input.files[0];
        const value = file ? await readFileAsDataUrl(file).catch(() => '') : '';
        syncResultUploadValue(card, key, value);
      });
    });
  }

  function addResultCard(data = {}) {
    const template = resultTemplate();
    const list = $('#trainer-results-list');
    if (!template || !list) return null;
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('[data-result-card]');
    if (!card) return null;
    card.querySelectorAll('[data-result-field]').forEach((field) => {
      const key = String(field.getAttribute('data-result-field') || '').trim();
      field.value = String(data?.[key] || '').trim();
    });
    bindResultCard(card);
    list.appendChild(card);
    syncResultUploadValue(card, 'beforeImage', data?.beforeImage || '');
    syncResultUploadValue(card, 'afterImage', data?.afterImage || '');
    return card;
  }

  function readResultCards() {
    return Array.from(document.querySelectorAll('[data-result-card]')).map((card) => {
      const entry = {};
      card.querySelectorAll('[data-result-field]').forEach((field) => {
        const key = String(field.getAttribute('data-result-field') || '').trim();
        entry[key] = String(field.value || '').trim();
      });
      return entry;
    }).filter((item) => item.result || item.person || item.beforeImage || item.afterImage || item.copy);
  }

  function prefillForm(trainer = {}, currentUser = null, entryPrefill = null) {
    const handleValue = trainer.publicHandle || trainer.username || currentUser?.username || '';
    const prefill = entryPrefill && typeof entryPrefill === 'object' ? entryPrefill : {};
    trainerRoutingContext.managerCode = String(
      trainer.managerCode
      || trainer?.meta?.managerCode
      || prefill.managerCode
      || currentUser?.manager?.managerCode
      || ''
    ).trim();
    trainerRoutingContext.workspaceId = String(
      trainer.workspaceId
      || trainer?.meta?.workspaceId
      || prefill.workspaceId
      || prefill.selectedWorkspaceId
      || currentUser?.manager?.workspaceId
      || ''
    ).trim();
    trainerRoutingContext.locationId = String(
      trainer.locationId
      || trainer?.meta?.locationId
      || prefill.locationId
      || prefill.selectedLocationId
      || currentUser?.manager?.locationId
      || ''
    ).trim();
    const trainerRole = String(prefill.role || '').trim();
    const gymName = String(prefill.gymName || '').trim();
    const city = String(prefill.city || '').trim();
    const summaryPrefill = [trainerRole, gymName ? `at ${gymName}` : '', city ? `in ${city}` : '']
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    $('#trainer-full-name').value = trainer.fullName || prefill.fullName || currentUser?.displayName || '';
    $('#trainer-email').value = trainer.email || prefill.email || currentUser?.email || '';
    $('#trainer-display-name').value = trainer.displayName || '';
    $('#trainer-public-handle').value = handleValue ? `@${String(handleValue).replace(/^@+/, '')}` : '';
    $('#trainer-phone').value = prefill.phone || '';
    syncStandaloneUploadValue('photoDataUrl', trainer.photoDataUrl || prefill.photoDataUrl || '');
    $('#trainer-coach-custom-tags').value = Array.isArray(trainer.coachCustomTags) ? trainer.coachCustomTags.join(', ') : '';
    setCheckedValues('coachBadgeType', Array.isArray(trainer.coachBadgeType) ? trainer.coachBadgeType : []);
    $('#trainer-summary').value = trainer.brandPositioning || prefill.brandPositioning || summaryPrefill || '';
    $('#trainer-top-label').value = trainer.topSectionLabel || '';
    $('#trainer-hero-headline').value = trainer.heroHeadline || '';
    $('#trainer-hero-support').value = trainer.heroSubheadline || '';
    $('#trainer-city').value = trainer.city || prefill.publicCity || city || '';
    $('#trainer-state').value = trainer.state || prefill.publicState || '';
    $('#trainer-format').value = trainer.coachingFormat || prefill.coachingFormat || 'remote_in_person';
    $('#trainer-price').value = trainer?.offer?.monthlyCoachingPrice == null ? '' : String(trainer.offer.monthlyCoachingPrice);
    $('#trainer-years').value = trainer.yearsCoaching == null ? '' : String(trainer.yearsCoaching);
    $('#trainer-active-clients').value = trainer.activeClients == null ? '' : String(trainer.activeClients);
    setRadioValue('bookingEnabled', trainer.bookingEnabled === false ? 'no' : 'yes');
    $('#trainer-timezone').value = trainer?.availability?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    $('#trainer-consult-length').value = trainer.consultationLengthMinutes == null ? '45' : String(trainer.consultationLengthMinutes);
    $('#trainer-date-range').value = trainer.dateRangeDays == null ? '14' : String(trainer.dateRangeDays);
    $('#trainer-max-consults').value = trainer.maxConsultsPerDay == null ? '4' : String(trainer.maxConsultsPerDay);
    $('#trainer-buffer').value = trainer.bufferMinutes == null ? '15' : String(trainer.bufferMinutes);
    $('#trainer-booking-notice').value = trainer.bookingNoticeHours == null ? '12' : String(trainer.bookingNoticeHours);
    setCheckedValues('daysAvailable', Array.isArray(trainer?.availability?.daysAvailable) ? trainer.availability.daysAvailable : []);
    const dayWindows = deriveDayWindows(trainer);
    DAY_NAMES.forEach((day) => {
      const input = document.querySelector(`[data-day-window="${day}"]`);
      if (input) input.value = (dayWindows[day] || []).join(', ');
    });
    setRadioValue('bookingApprovalMode', trainer.bookingApprovalMode || 'manual');
    $('#trainer-booking-cta').value = trainer.bookingCtaText || '';
    $('#trainer-booking-urgency').value = trainer.bookingUrgency || '';
    setCheckedValues('specialtyClients', Array.isArray(trainer.specialtyClients) ? trainer.specialtyClients : []);
    $('#trainer-specialty-custom').value = Array.isArray(trainer.specialtyClientsCustom) ? trainer.specialtyClientsCustom.join(', ') : '';
    setCheckedValues('includedItems', Array.isArray(trainer.includedItems) ? trainer.includedItems : []);
    $('#trainer-included-custom').value = Array.isArray(trainer.includedItemsCustom) ? trainer.includedItemsCustom.join(', ') : '';
    $('#trainer-bio').value = trainer.bio || trainer.coachBio || (summaryPrefill ? `${summaryPrefill}.` : '');
    $('#trainer-philosophy').value = trainer.coachingPhilosophy || '';
    $('#trainer-ideal-client').value = trainer.idealClient || '';
    $('#trainer-instagram').value = trainer.instagramUrl || '';
    $('#trainer-tiktok').value = trainer.tiktokUrl || '';
    $('#trainer-linkedin').value = trainer.linkedinUrl || '';
    $('#trainer-youtube').value = trainer.youtubeUrl || '';
    $('#trainer-website').value = trainer.websiteUrl || '';
    $('#trainer-accent-color').value = trainer.accentColor || '#e3a63f';
    $('#trainer-show-price').checked = trainer.showPricePublic !== false;
    $('#trainer-show-clients').checked = trainer.showClientsPublic !== false;
    $('#trainer-show-years').checked = trainer.showYearsPublic !== false;
    $('#trainer-show-booking').checked = trainer.showBookingPublic !== false;
    $('#trainer-show-results').checked = trainer.showResultsPublic !== false;

    const resultsList = $('#trainer-results-list');
    if (resultsList) resultsList.innerHTML = '';
    const transformations = Array.isArray(trainer.transformations) ? trainer.transformations : [];
    if (transformations.length) {
      transformations.forEach((item) => addResultCard(item));
    } else {
      addResultCard();
    }
  }

  async function createTrainerAccount({ fullName, email }) {
    const usernameEl = $('#trainer-username');
    const phoneEl = $('#trainer-phone');
    const passwordEl = $('#trainer-password');
    const password = String(passwordEl?.value || '');
    const phoneRaw = String(phoneEl?.value || '').trim();
    const phone = phoneRaw ? normalizePhoneValue(phoneRaw) : '';
    const typedUsername = normalizeUsername(usernameEl?.value || '');
    const baseUsername = typedUsername || suggestUsername({ fullName, email });
    const manualUsername = Boolean(usernameEl?.dataset?.manual === '1' && typedUsername);
    const normalizedEmail = normalizeEmailValue(email);

    if (!baseUsername || baseUsername.length < 3) {
      return { ok: false, error: 'Username must be at least 3 characters and can only use letters, numbers, and underscores.' };
    }

    if (!normalizedEmail) {
      return { ok: false, error: 'Enter a valid email address.' };
    }

    if (!fullName || String(fullName).trim().length < 2) {
      return { ok: false, error: 'Display name must be at least 2 characters.' };
    }

    if (phoneRaw && !phone) {
      return { ok: false, error: 'Enter a valid phone number or leave it blank.' };
    }

    if (!password || password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }

    const candidates = manualUsername
      ? [baseUsername]
      : [
          baseUsername,
          `${baseUsername}_${Math.random().toString(36).slice(2, 5)}`,
          `${baseUsername}${Math.random().toString(36).slice(2, 6)}`,
          `trainer_${Math.random().toString(36).slice(2, 8)}`
        ].filter((value, index, arr) => value && value.length >= 3 && arr.indexOf(value) === index);

    for (const username of candidates) {
      const resp = await api('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email: normalizedEmail,
          phone,
          displayName: fullName,
          password,
          onboardingRole: 'trainer'
        })
      });
      if (resp.ok && resp.json?.user) {
        if (usernameEl) usernameEl.value = username;
        return { ok: true, user: resp.json.user };
      }
      if (resp.status === 409 && String(resp.json?.error || '').toLowerCase().includes('username already taken') && !manualUsername) {
        continue;
      }
      if (resp.status === 409) {
        const conflictMessage = String(resp.json?.error || '').trim().toLowerCase();
        if (conflictMessage.includes('email already in use')) {
          return { ok: false, error: 'That email already has an account. Sign in with that account, then reopen trainer onboarding.' };
        }
        if (conflictMessage.includes('phone number already in use')) {
          return { ok: false, error: 'That phone number is already tied to another account. Use a different number or leave it blank.' };
        }
        if (conflictMessage.includes('username already taken')) {
          return { ok: false, error: 'That username is already taken. Pick a different username.' };
        }
      }
      return { ok: false, error: resp.json?.error || 'Could not create trainer account.' };
    }

    return { ok: false, error: 'Could not create trainer username. Try a different username.' };
  }

  function buildPayload(currentUser = null) {
    const publicHandle = normalizeUsername($('#trainer-public-handle')?.value || currentUser?.username || '');
    const coachBadgeType = readCheckedValues('coachBadgeType');
    const coachCustomTags = splitList($('#trainer-coach-custom-tags')?.value || '');
    const specialtySelected = readCheckedValues('specialtyClients');
    const specialtyCustom = splitList($('#trainer-specialty-custom')?.value || '');
    const includedSelected = readCheckedValues('includedItems');
    const includedCustom = splitList($('#trainer-included-custom')?.value || '');
    const dayWindows = readDayWindows();
    const daysAvailable = Array.from(new Set([
      ...readCheckedValues('daysAvailable'),
      ...DAY_NAMES.filter((day) => (dayWindows[day] || []).length)
    ]));
    const timeSlotsAvailable = buildTimeSlotsAvailable(dayWindows);
    const coachingFormat = String($('#trainer-format')?.value || 'remote_in_person');

    return {
      fullName: $('#trainer-full-name')?.value || '',
      email: $('#trainer-email')?.value || '',
      displayName: $('#trainer-display-name')?.value || '',
      managerCode: String(trainerRoutingContext.managerCode || currentUser?.manager?.managerCode || '').trim(),
      workspaceId: String(trainerRoutingContext.workspaceId || currentUser?.manager?.workspaceId || '').trim(),
      locationId: String(trainerRoutingContext.locationId || currentUser?.manager?.locationId || '').trim(),
      publicHandle,
      photoDataUrl: $('#trainer-photo')?.value || '',
      coachBadgeType,
      coachCustomTags,
      brandPositioning: $('#trainer-summary')?.value || '',
      topSectionLabel: $('#trainer-top-label')?.value || '',
      heroHeadline: $('#trainer-hero-headline')?.value || '',
      heroSubheadline: $('#trainer-hero-support')?.value || '',
      city: $('#trainer-city')?.value || '',
      state: $('#trainer-state')?.value || '',
      coachingFormat,
      onlineCoaching: coachingFormat !== 'in_person_only',
      inPersonTraining: coachingFormat !== 'remote_only',
      startingPrice: $('#trainer-price')?.value || '',
      monthlyCoachingPrice: $('#trainer-price')?.value || '',
      yearsCoaching: $('#trainer-years')?.value || '',
      activeClients: $('#trainer-active-clients')?.value || '',
      bookingEnabled: readRadioValue('bookingEnabled') === 'yes',
      timeZone: $('#trainer-timezone')?.value || '',
      consultationLength: $('#trainer-consult-length')?.value || '',
      dateRangeDays: $('#trainer-date-range')?.value || '',
      maxConsultsPerDay: $('#trainer-max-consults')?.value || '',
      bufferMinutes: $('#trainer-buffer')?.value || '',
      bookingNoticeHours: $('#trainer-booking-notice')?.value || '',
      daysAvailable,
      dayWindows,
      timeSlotsAvailable,
      bookingApprovalMode: readRadioValue('bookingApprovalMode') || 'manual',
      bookingCtaText: $('#trainer-booking-cta')?.value || '',
      bookingUrgency: $('#trainer-booking-urgency')?.value || '',
      results: readResultCards(),
      specialtyClients: specialtySelected,
      specialtyClientsCustom: specialtyCustom,
      clientTypes: [...specialtySelected, ...specialtyCustom].join(', '),
      includedItems: includedSelected,
      includedItemsCustom: includedCustom,
      coachingIncludes: [...includedSelected, ...includedCustom].join(', '),
      coachBio: $('#trainer-bio')?.value || '',
      coachingPhilosophy: $('#trainer-philosophy')?.value || '',
      idealClient: $('#trainer-ideal-client')?.value || '',
      instagramUrl: $('#trainer-instagram')?.value || '',
      tiktokUrl: $('#trainer-tiktok')?.value || '',
      linkedinUrl: $('#trainer-linkedin')?.value || '',
      youtubeUrl: $('#trainer-youtube')?.value || '',
      websiteUrl: $('#trainer-website')?.value || '',
      reviewStatus: 'review',
      accentColor: $('#trainer-accent-color')?.value || '',
      showPricePublic: $('#trainer-show-price')?.checked === true,
      showClientsPublic: $('#trainer-show-clients')?.checked === true,
      showYearsPublic: $('#trainer-show-years')?.checked === true,
      showBookingPublic: $('#trainer-show-booking')?.checked === true,
      showResultsPublic: $('#trainer-show-results')?.checked === true
    };
  }

  async function init() {
    const startBtns = Array.from(document.querySelectorAll('[data-trainer-start]'));
    const onboardingEl = $('#onboarding');
    const formEl = $('#trainer-onboarding-form');
    const statusEl = $('#trainer-form-status');
    const authNoteEl = $('#trainer-auth-note');
    const stepEl = $('#trainer-form-step');
    const percentEl = $('#trainer-form-percent');
    const stepTitleEl = $('#trainer-form-step-title');
    const meterEl = $('#trainer-step-meter-fill');
    const prevBtn = $('#trainer-prev-btn');
    const nextBtn = $('#trainer-next-btn');
    const submitBtn = $('#trainer-submit-btn');
    const usernameEl = $('#trainer-username');
    const publicHandleEl = $('#trainer-public-handle');
    const fullNameEl = $('#trainer-full-name');
    const emailEl = $('#trainer-email');
    const coachBadgeInputs = Array.from(document.querySelectorAll('input[name="coachBadgeType"]'));
    let currentUser = null;
    let usernameTouched = false;
    let publicHandleTouched = false;
    let activeStepIndex = 0;
    if (formEl) formEl.noValidate = true;

    const getWizardSections = () => Array.from(formEl?.querySelectorAll('.trainer-form-section') || [])
      .filter((section) => !section.classList.contains('hidden'));

    const getStepTitle = (section) => String(
      section?.getAttribute('data-step-title')
      || section?.querySelector('h3')?.textContent
      || 'Trainer onboarding'
    ).trim();

    const isAccountStep = (section) => section?.id === 'trainer-account-section';
    const isIdentityStep = (section) => Boolean(section?.querySelector('#trainer-full-name') && section?.querySelector('#trainer-email'));

    const syncSectionFieldState = (section, isInteractive) => {
      if (!(section instanceof Element)) return;
      const fields = Array.from(section.querySelectorAll('input, textarea, select, button'));
      fields.forEach((field) => {
        if (!(field instanceof HTMLElement)) return;
        const isHiddenInput = String(field.getAttribute('type') || '').toLowerCase() === 'hidden';
        if (!isInteractive && !isHiddenInput) {
          if (!field.hasAttribute('data-wizard-was-disabled')) {
            field.setAttribute('data-wizard-was-disabled', field.disabled ? '1' : '0');
          }
          if (!field.hasAttribute('data-wizard-was-required') && 'required' in field) {
            field.setAttribute('data-wizard-was-required', field.required ? '1' : '0');
          }
          field.disabled = true;
          if ('required' in field) field.required = false;
          return;
        }
        if (field.hasAttribute('data-wizard-was-disabled')) {
          field.disabled = field.getAttribute('data-wizard-was-disabled') === '1';
          field.removeAttribute('data-wizard-was-disabled');
        }
        if (field.hasAttribute('data-wizard-was-required') && 'required' in field) {
          field.required = field.getAttribute('data-wizard-was-required') === '1';
          field.removeAttribute('data-wizard-was-required');
        }
      });
    };

    const focusCurrentStep = (section) => {
      const target = section?.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])');
      target?.focus();
    };

    const syncWizard = ({ focus = false, reset = false } = {}) => {
      const sections = getWizardSections();
      if (!sections.length) return;
      if (reset) activeStepIndex = 0;
      activeStepIndex = Math.max(0, Math.min(activeStepIndex, sections.length - 1));
      const allSections = Array.from(formEl?.querySelectorAll('.trainer-form-section') || []);
      allSections.forEach((section) => {
        const visibleIndex = sections.indexOf(section);
        const isVisibleStep = visibleIndex !== -1;
        const isActive = isVisibleStep && visibleIndex === activeStepIndex;
        section.classList.toggle('is-hidden', isVisibleStep && !isActive);
        syncSectionFieldState(section, isActive);
      });
      const currentSection = sections[activeStepIndex];
      const stepNumber = activeStepIndex + 1;
      const total = sections.length;
      const percent = Math.round((stepNumber / total) * 100);
      if (stepEl) stepEl.textContent = `Step ${stepNumber} of ${total}`;
      if (percentEl) percentEl.textContent = `${percent}% done`;
      if (stepTitleEl) stepTitleEl.textContent = getStepTitle(currentSection);
      if (meterEl) meterEl.style.width = `${percent}%`;
      if (prevBtn) prevBtn.disabled = activeStepIndex === 0;
      nextBtn?.classList.toggle('hidden', activeStepIndex >= total - 1);
      submitBtn?.classList.toggle('hidden', activeStepIndex !== total - 1);
      if (focus) window.setTimeout(() => focusCurrentStep(currentSection), 70);
    };

    const validateCurrentStep = () => {
      const currentSection = getWizardSections()[activeStepIndex];
      if (!currentSection) return true;
      const fields = Array.from(currentSection.querySelectorAll('input, textarea, select'))
        .filter((field) => !field.disabled && String(field.type || '').toLowerCase() !== 'hidden');
      for (const field of fields) {
        if (typeof field.reportValidity === 'function' && !field.reportValidity()) {
          if (statusEl) statusEl.textContent = 'Finish the required fields in this step before moving on.';
          return false;
        }
      }
      if (statusEl) statusEl.textContent = '';
      return true;
    };

    const openOnboarding = () => {
      onboardingEl?.classList.remove('hidden');
      startBtns.forEach((btn) => btn.setAttribute('aria-expanded', 'true'));
      syncWizard({ reset: true, focus: true });
      onboardingEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    startBtns.forEach((btn) => btn.addEventListener('click', openOnboarding));
    prevBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      activeStepIndex -= 1;
      syncWizard({ focus: true });
    });
    nextBtn?.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!validateCurrentStep()) return;
      const currentSection = getWizardSections()[activeStepIndex];
      if (!currentUser && isAccountStep(currentSection)) {
        activeStepIndex += 1;
        syncWizard({ focus: true });
        return;
      }
      if (!currentUser && isIdentityStep(currentSection)) {
        const fullName = $('#trainer-full-name')?.value || '';
        const email = $('#trainer-email')?.value || '';
        if (statusEl) statusEl.textContent = 'Creating trainer account...';
        const signup = await createTrainerAccount({ fullName, email });
        if (!signup.ok) {
          if (statusEl) statusEl.textContent = signup.error || 'Could not create trainer account.';
          return;
        }
        currentUser = signup.user || null;
        persistAuthUser(currentUser || {});
        setAccountSectionVisible(false);
        syncWizard({ reset: true, focus: true });
        if (authNoteEl && currentUser) {
          authNoteEl.textContent = 'Account created. Finish the rest, then submit for review to turn on Trainer Access.';
        }
        if (statusEl) statusEl.textContent = 'Account created. Keep going panel by panel until you submit for review.';
        return;
      }
      activeStepIndex += 1;
      syncWizard({ focus: true });
    });

    $('#trainer-add-result-btn')?.addEventListener('click', () => addResultCard());
    document.querySelectorAll('[data-image-file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const key = String(input.getAttribute('data-image-file') || '').trim();
        const file = input.files && input.files[0];
        const value = file ? await readFileAsDataUrl(file).catch(() => '') : '';
        syncStandaloneUploadValue(key, value);
      });
    });

    const syncSuggestedUsername = () => {
      const suggested = suggestUsername({
        fullName: fullNameEl?.value || '',
        email: emailEl?.value || ''
      });
      if (usernameEl && !usernameTouched) usernameEl.value = suggested;
      if (publicHandleEl && !publicHandleTouched) publicHandleEl.value = `@${suggested}`;
    };

    usernameEl?.addEventListener('input', () => {
      usernameTouched = true;
      usernameEl.dataset.manual = '1';
      usernameEl.value = normalizeUsername(usernameEl.value);
    });
    publicHandleEl?.addEventListener('input', () => {
      publicHandleTouched = true;
      publicHandleEl.value = publicHandleEl.value.startsWith('@')
        ? `@${normalizeUsername(publicHandleEl.value)}`
        : `@${normalizeUsername(publicHandleEl.value)}`;
    });
    fullNameEl?.addEventListener('input', syncSuggestedUsername);
    emailEl?.addEventListener('input', syncSuggestedUsername);
    coachBadgeInputs.forEach((input) => {
      input.addEventListener('change', () => syncLimitedChecks('coachBadgeType', MAX_COACH_BADGES, '#trainer-badge-limit-note'));
    });

    const entryPrefill = readEntryPrefill();
    const me = await api('/api/auth/me');
    if (me.ok && me.json?.user) {
      currentUser = me.json.user;
      setAccountSectionVisible(false);
      syncWizard();
      if (authNoteEl) authNoteEl.textContent = `Signed in as ${currentUser.displayName || currentUser.username || 'Account'}.`;
      const dashboard = await api('/api/auth/trainer/dashboard');
      if (dashboard.ok && dashboard.json?.ok) {
        prefillForm(dashboard.json?.trainer || {}, currentUser, entryPrefill);
        syncLimitedChecks('coachBadgeType', MAX_COACH_BADGES, '#trainer-badge-limit-note');
        if (statusEl && dashboard.json?.trainer?.onboarded) {
          markHomepageOnboardingDone();
          statusEl.textContent = 'Trainer profile loaded. Move panel by panel and resubmit for review if you change anything.';
        }
      } else {
        prefillForm({}, currentUser, entryPrefill);
        syncLimitedChecks('coachBadgeType', MAX_COACH_BADGES, '#trainer-badge-limit-note');
        if (statusEl) statusEl.textContent = 'Move through the panels and submit the account for review.';
      }
    } else {
      setAccountSectionVisible(true);
      syncWizard({ reset: true });
      prefillForm({}, null, entryPrefill);
      syncLimitedChecks('coachBadgeType', MAX_COACH_BADGES, '#trainer-badge-limit-note');
      syncSuggestedUsername();
      if (authNoteEl) authNoteEl.textContent = 'No account yet. Create the account first, then finish onboarding to turn on Trainer Access.';
      if (statusEl) statusEl.textContent = 'Start with the account panel. After the account is created, finish the rest and submit for review.';
    }

    if (entryPrefill) clearEntryPrefill();

    formEl?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const lastStepIndex = Math.max(0, getWizardSections().length - 1);
      if (activeStepIndex < lastStepIndex) {
        if (!validateCurrentStep()) return;
        activeStepIndex += 1;
        syncWizard({ focus: true });
        return;
      }
      if (!formEl.reportValidity()) return;
      if (!currentUser) {
        if (statusEl) statusEl.textContent = 'Create your account first, then finish onboarding.';
        return;
      }

      if (statusEl) statusEl.textContent = 'Submitting trainer account for review...';

      const payload = buildPayload(currentUser);
      const resp = await api('/api/auth/trainer/onboarding', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (resp.status === 401) {
        if (statusEl) statusEl.textContent = 'Could not attach trainer access to this account. Try again.';
        if (typeof window.odeOpenAuthModal === 'function') window.odeOpenAuthModal('signup');
        return;
      }
      if (!resp.ok || !resp.json?.ok) {
        if (statusEl) statusEl.textContent = resp.json?.error || 'Could not save trainer onboarding.';
        return;
      }

      currentUser = resp.json?.user || currentUser;
      persistAuthUser(currentUser || {});
      markHomepageOnboardingDone();
      const trainerKey = normalizeUsername(payload.publicHandle || currentUser?.username || fullName);
      if (statusEl) statusEl.textContent = 'Submitted for review. Opening your trainer page...';
      if (authNoteEl) authNoteEl.textContent = 'Saved. Your trainer account is live with a review tag.';
      if (trainerKey) {
        window.setTimeout(() => {
          window.location.href = `trainer-profile.html?trainer=${encodeURIComponent(trainerKey)}`;
        }, 250);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
