(() => {
  const $ = (sel) => document.querySelector(sel);

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

  // A request the server never answers must not strand the page on the
  // loading deck - fall back after a bounded wait.
  function apiWithTimeout(path, timeoutMs) {
    return Promise.race([
      api(path),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, status: 0, json: {}, timedOut: true }), Math.max(1000, timeoutMs || 8000)))
    ]);
  }

  function cachedTrainerDirectory() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem('trainer-directory-cache') || 'null');
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch {
      return null;
    }
  }

  function escapeHtml(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(raw, max = 160) {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
  }

  function normalizeText(raw) {
    return String(raw || '').trim().toLowerCase();
  }

  function slugify(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
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
    return cityState || zipCode || 'Location not listed';
  }

  function buildModeText(trainer) {
    const modes = [];
    if (trainer?.offer?.onlineCoaching) modes.push('Remote');
    if (trainer?.offer?.inPersonTraining) modes.push('In person');
    return modes.join(' + ') || 'Remote';
  }

  function matchesTrainerFilters(trainer, filters) {
    const location = trainerLocationParts(trainer);
    const searchHaystack = normalizeText([
      trainer.fullName,
      trainer.username,
      trainer.displayName,
      trainer.brandPositioning,
      trainer.clientTypes,
      trainer.idealClient,
      trainer.differentiator,
      trainer?.offer?.included,
      location.city,
      location.state,
      location.zipCode,
      buildModeText(trainer)
    ].join(' '));

    if (filters.search && !searchHaystack.includes(filters.search)) return false;
    if (filters.city && !normalizeText(location.city).includes(filters.city)) return false;
    if (filters.state && !normalizeText(location.state).includes(filters.state)) return false;
    if (filters.zip && !normalizeText(location.zipCode).includes(filters.zip)) return false;
    return true;
  }

  function demoTrainerFallback() {
    return [{
      id: 'demo-trainer-layout',
      fullName: 'Avery Stone',
      username: 'averystone',
      displayName: 'Avery Stone',
      photoDataUrl: 'assets/images/placeholders/trainer-avery.jpg',
      brandPositioning: 'Straightforward coaching for busy adults who want visible progress and a plan they can actually follow.',
      heroHeadline: 'I help busy adults lose fat, get stronger, and stay consistent without living in the gym.',
      clientTypes: 'fat loss, body recomposition, busy professionals',
      idealClient: 'Busy adults who want a leaner physique, better strength, and a routine they can keep up with year-round.',
      differentiator: 'Simple systems, realistic nutrition targets, weekly accountability, and fast adjustments when something stops working.',
      specialtyClients: ['Fat loss', 'Body recomposition', 'Busy professionals'],
      includedItems: [
        'Custom training program',
        'Weekly check-ins',
        'Program adjustments',
        'Nutrition guidance',
        'Form feedback',
        'Direct support'
      ],
      offer: {
        onlineCoaching: true,
        inPersonTraining: true,
        monthlyCoachingPrice: 249,
        priceRangeLabel: 'From $249/month',
        included: 'Custom training program, weekly check-ins, program adjustments, nutrition guidance, form feedback, and direct support.'
      },
      availability: {
        daysAvailable: ['Monday', 'Wednesday', 'Friday'],
        timeSlotsAvailable: ['Mon 11am-1pm', 'Wed 6pm-8pm', 'Fri 12pm-3pm'],
        timeZone: 'America/New_York'
      },
      city: 'Miami',
      state: 'Florida',
      zipCode: '33101',
      experienceLevel: 'Intermediate',
      instagramHandle: 'avery.builds',
      tiktokHandle: 'averybuilds',
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
    }];
  }

  function buildTrainerProfileHref(trainer) {
    const key = slugify(trainer?.publicHandle)
      || slugify(trainer?.username)
      || slugify(trainer?.fullName)
      || slugify(trainer?.displayName)
      || String(trainer?.id || '').trim()
      || 'trainer';
    return `/coach/${encodeURIComponent(key)}`;
  }

  function canModerateTrainerReviews(user) {
    return Boolean(user?.isOwner || user?.isTech);
  }

  function getTrainerReviewStatus(trainer) {
    return String(trainer?.reviewStatus || '').trim().toLowerCase();
  }

  function buildCoachCard(trainer, options = {}) {
    const fullName = trainer.fullName || trainer.displayName || 'Coach';
    const username = trainer.publicHandle || trainer.username || trainer.displayName || 'coach';
    const coachTags = [
      ...(Array.isArray(trainer.coachBadgeType) ? trainer.coachBadgeType : []),
      ...(Array.isArray(trainer.coachCustomTags) ? trainer.coachCustomTags : [])
    ].filter(Boolean);
    const tierName = coachTags[0] || trainer?.proof?.tier?.name || 'Starter';
    const experienceLevel = coachTags[1] || trainer.experienceLevel || 'Experienced';
    const reviewStatus = getTrainerReviewStatus(trainer);
    const reviewTag = reviewStatus === 'review'
      ? '<span class="coach-review-tag">Review</span>'
      : (String(trainer?.reviewDecisionStatus || '').trim().toLowerCase() === 'approved'
        ? '<span class="coach-review-tag approved">Approved</span>'
        : '');
    const avatarSrc = trainer.photoDataUrl || 'assets/images/placeholders/profile-placeholder.jpg';
    const modeText = buildModeText(trainer);
    const profileHref = buildTrainerProfileHref(trainer);
    const canModerate = options.canModerate === true;
    const showReviewActions = canModerate && reviewStatus === 'review';
    const overview = truncate(
      trainer.brandPositioning
      || trainer.differentiator
      || trainer.clientTypes
      || trainer.idealClient
      || 'Trainer profile preview',
      168
    );
    const reviewActions = showReviewActions
      ? `
        <div class="coach-review-actions" data-review-actions>
          <button class="coach-review-btn coach-review-btn-approve" type="button" data-review-action="approve" data-trainer-id="${escapeHtml(String(trainer.id || ''))}" aria-label="Approve ${escapeHtml(fullName)}">&#10003;</button>
          <button class="coach-review-btn coach-review-btn-deny" type="button" data-review-action="deny" data-trainer-id="${escapeHtml(String(trainer.id || ''))}" aria-label="Deny ${escapeHtml(fullName)}">&#10005;</button>
        </div>
      `
      : '';

    return `
      <article class="coach-card${trainer.isDemoLayout ? ' demo' : ''}" data-coach-card data-trainer-id="${escapeHtml(String(trainer.id || ''))}">
        ${reviewActions}
        <a class="coach-pill" href="${escapeHtml(profileHref)}" aria-label="Open ${escapeHtml(fullName)} profile">
          <div class="coach-avatar">
            <img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(fullName)}">
          </div>
          <div class="coach-pill-copy">
            <div class="coach-pill-top">
              <div class="coach-name-group">
                <div class="coach-name">${escapeHtml(fullName)}</div>
                <div class="coach-handle">@${escapeHtml(username)}</div>
              </div>
              <span class="coach-tier-row">
                ${reviewTag}
                <span class="coach-tier">${escapeHtml(tierName)}</span>
                <span class="coach-experience">${escapeHtml(experienceLevel)}</span>
              </span>
            </div>
            <div class="coach-overview">${escapeHtml(overview)}</div>
            <div class="coach-mode-line">${escapeHtml(modeText)}</div>
          </div>
          <span class="coach-toggle" aria-hidden="true">&gt;</span>
        </a>
      </article>
    `;
  }

  function renderTrainerGrid(gridEl, trainers, filters = {}, options = {}) {
    const activeTab = String(options.activeTab || 'all').trim().toLowerCase();
    const filtered = trainers.filter((trainer) => {
      if (!matchesTrainerFilters(trainer, filters)) return false;
      if (activeTab === 'review') return getTrainerReviewStatus(trainer) === 'review';
      return true;
    });
    if (!filtered.length) {
      gridEl.innerHTML = activeTab === 'review'
        ? '<div class="coaches-empty">No trainers are waiting for review right now.</div>'
        : '<div class="coaches-empty">No trainers match that search yet.</div>';
      return;
    }
    gridEl.innerHTML = filtered.map((trainer) => buildCoachCard(trainer, options)).join('');
  }

  function renderCoachesLoadingDeck(gridEl) {
    const deckCard = (variant) => `
      <div class="coach-deck-card ${variant}">
        <span class="coach-deck-stamp ${variant === 'is-b' ? 'is-pass' : 'is-match'}">${variant === 'is-b' ? 'PASS' : 'MATCH'}</span>
        <span class="coach-deck-avatar"></span>
        <span class="coach-deck-lines">
          <i style="width:58%"></i>
          <i style="width:34%"></i>
          <i style="width:88%"></i>
          <i style="width:72%"></i>
        </span>
      </div>
    `;
    gridEl.innerHTML = `
      <div class="coach-deck-loading" role="status" aria-label="Finding coaches">
        <div class="coach-deck-stage">
          ${deckCard('is-a')}${deckCard('is-b')}${deckCard('is-c')}
        </div>
        <div class="coach-deck-caption">Finding your coach<span class="coach-deck-dots"><i></i><i></i><i></i></span></div>
        <div class="coach-deck-hint"><span>&#10005;&nbsp;&nbsp;pass</span><span class="coach-deck-hint-divider"></span><span>match&nbsp;&nbsp;&#10084;</span></div>
      </div>
    `;
  }

  async function init() {
    const gridEl = $('#coaches-grid');
    const searchInput = $('#coach-search-input');
    const cityInput = $('#coach-city-input');
    const stateInput = $('#coach-state-input');
    const zipInput = $('#coach-zip-input');
    const reviewTabsEl = $('#coaches-review-tabs');
    const reviewSummaryEl = $('#coaches-review-summary');
    const accessModalEl = $('#coaches-access-modal');
    const accessSignupBtn = $('#coaches-access-signup');
    const accessSigninBtn = $('#coaches-access-signin');
    if (!gridEl) return;
    renderCoachesLoadingDeck(gridEl);
    const deckShownAt = Date.now();

    let cards = [];
    let currentUser = null;
    let activeReviewTab = 'all';
    let lastFocusedCoachLink = null;
    let applyFiltersRef = null;
    // Absolute backstop: whatever happens above us, the loading deck may
    // never sit on screen forever.
    const deckWatchdog = window.setTimeout(() => {
      if (!gridEl.querySelector('.coach-deck-loading')) return;
      if (!cards.length) cards = cachedTrainerDirectory() || demoTrainerFallback();
      if (typeof applyFiltersRef === 'function') applyFiltersRef();
      else renderTrainerGrid(gridEl, cards, {}, {});
    }, 12000);
    const meResp = await apiWithTimeout('/api/auth/me', 6000);
    currentUser = meResp.ok ? (meResp.json?.user || null) : null;
    const canModerate = canModerateTrainerReviews(currentUser);
    if (reviewTabsEl) reviewTabsEl.classList.toggle('is-visible', canModerate);

    const hasAccountAccess = () => Boolean(currentUser?.id || currentUser?.username || currentUser?.displayName);
    const closeAccessModal = () => {
      if (!accessModalEl) return;
      accessModalEl.classList.add('hidden');
      accessModalEl.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      if (lastFocusedCoachLink instanceof HTMLElement) {
        try { lastFocusedCoachLink.focus(); } catch {}
      }
    };
    const openAccessModal = (triggerEl = null) => {
      if (!accessModalEl) return;
      lastFocusedCoachLink = triggerEl instanceof HTMLElement ? triggerEl : null;
      accessModalEl.classList.remove('hidden');
      accessModalEl.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    };

    accessModalEl?.querySelectorAll('[data-coaches-access-close]').forEach((el) => {
      el.addEventListener('click', closeAccessModal);
    });
    accessSignupBtn?.addEventListener('click', () => {
      closeAccessModal();
      if (typeof window.odeOpenAuthModal === 'function') window.odeOpenAuthModal('signup');
      else document.getElementById('control-signup')?.click?.();
    });
    accessSigninBtn?.addEventListener('click', () => {
      closeAccessModal();
      if (typeof window.odeOpenAuthModal === 'function') window.odeOpenAuthModal('login');
      else document.getElementById('control-signin')?.click?.();
    });
    accessModalEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAccessModal();
    });
    window.addEventListener('odeauth', (event) => {
      currentUser = event?.detail?.user || null;
      if (hasAccountAccess()) closeAccessModal();
    });

    let directoryDegraded = false;
    const loadCards = async ({ attempts = 3 } = {}) => {
      let resp = null;
      // The trainers endpoint 503s while the database reconnects - retry a
      // few times before ever falling back to the demo card.
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        resp = await apiWithTimeout('/api/auth/trainers', 7000);
        if (resp.ok && resp.json?.ok) break;
        if (resp.status === 401) break;
        if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 900));
      }
      if (resp?.status === 401) {
        directoryDegraded = false;
        cards = demoTrainerFallback();
      } else if (!resp?.ok || !resp?.json?.ok) {
        directoryDegraded = true;
        cards = cachedTrainerDirectory() || demoTrainerFallback();
      } else {
        directoryDegraded = false;
        const trainers = Array.isArray(resp.json?.trainers) ? resp.json.trainers : [];
        cards = trainers.length ? trainers : demoTrainerFallback();
        try {
          sessionStorage.setItem('trainer-directory-cache', JSON.stringify(cards));
        } catch {}
      }
    };
    let directoryHealTimer = 0;
    let directoryHealTries = 0;
    const scheduleDirectoryHeal = () => {
      if (!directoryDegraded || directoryHealTimer || directoryHealTries >= 10) return;
      directoryHealTimer = window.setTimeout(async () => {
        directoryHealTimer = 0;
        directoryHealTries += 1;
        await loadCards({ attempts: 1 });
        if (typeof applyFiltersRef === 'function') applyFiltersRef();
        scheduleDirectoryHeal();
      }, 12000);
    };

    await loadCards();
    // Let the deck play a beat even on instant loads so the reveal feels
    // intentional instead of a flash.
    const deckElapsed = Date.now() - deckShownAt;
    if (deckElapsed < 1100) await new Promise((resolve) => setTimeout(resolve, 1100 - deckElapsed));
    window.clearTimeout(deckWatchdog);
    scheduleDirectoryHeal();

    let viewMode = 'deck';
    try {
      const storedMode = String(localStorage.getItem('coaches-view-mode') || '').trim();
      if (storedMode === 'cards' || storedMode === 'deck') viewMode = storedMode;
    } catch {}
    let deckIndex = 0;
    let deckListSignature = '';
    let deckMatches = [];
    try {
      const storedMatches = JSON.parse(sessionStorage.getItem('coaches-deck-matches') || 'null');
      if (Array.isArray(storedMatches)) deckMatches = storedMatches.map((id) => String(id)).filter(Boolean);
    } catch {}
    const persistDeckMatches = () => {
      try { sessionStorage.setItem('coaches-deck-matches', JSON.stringify(deckMatches)); } catch {}
    };

    if (!document.getElementById('coaches-view-toggle')) {
      gridEl.insertAdjacentHTML('beforebegin', `
        <div class="coaches-view-toggle" id="coaches-view-toggle" role="tablist" aria-label="Browse style">
          <button type="button" data-view-mode="deck" role="tab">&#10084;&#65039; Pass &amp; Match</button>
          <button type="button" data-view-mode="cards" role="tab">&#9783; Cards</button>
        </div>
      `);
      document.getElementById('coaches-view-toggle')?.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-view-mode]') : null;
        if (!(button instanceof HTMLButtonElement)) return;
        viewMode = button.dataset.viewMode === 'cards' ? 'cards' : 'deck';
        try { localStorage.setItem('coaches-view-mode', viewMode); } catch {}
        applyFilters();
      });
    }
    const syncViewToggle = () => {
      document.querySelectorAll('#coaches-view-toggle [data-view-mode]').forEach((button) => {
        const active = String(button.getAttribute('data-view-mode') || '') === viewMode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    };

    const buildDeckProfileCard = (trainer, depth) => {
      const fullName = trainer.fullName || trainer.displayName || 'Coach';
      const username = trainer.publicHandle || trainer.username || trainer.displayName || 'coach';
      const coachTags = [
        ...(Array.isArray(trainer.coachBadgeType) ? trainer.coachBadgeType : []),
        ...(Array.isArray(trainer.coachCustomTags) ? trainer.coachCustomTags : [])
      ].filter(Boolean);
      const tierName = coachTags[0] || trainer?.proof?.tier?.name || 'Starter';
      const experienceLevel = coachTags[1] || trainer.experienceLevel || 'Experienced';
      const avatarSrc = trainer.photoDataUrl || 'assets/images/placeholders/profile-placeholder.jpg';
      const overview = truncate(
        trainer.brandPositioning || trainer.differentiator || trainer.clientTypes || trainer.idealClient || 'Trainer profile preview',
        150
      );
      return `
        <article class="coach-match-card" data-match-card data-depth="${depth}" data-trainer-id="${escapeHtml(String(trainer.id || ''))}">
          <span class="coach-match-card-stamp is-match" aria-hidden="true">MATCH</span>
          <span class="coach-match-card-stamp is-pass" aria-hidden="true">PASS</span>
          <div class="coach-match-card-avatar"><img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(fullName)}" draggable="false"></div>
          <div class="coach-match-card-name">${escapeHtml(fullName)}</div>
          <div class="coach-match-card-handle">@${escapeHtml(username)}</div>
          <div class="coach-match-card-chips">
            <span>${escapeHtml(tierName)}</span>
            <span>${escapeHtml(experienceLevel)}</span>
          </div>
          <div class="coach-match-card-overview">${escapeHtml(overview)}</div>
          <div class="coach-match-card-mode">${escapeHtml(buildModeText(trainer))}</div>
          <a class="coach-pill coach-match-card-view" href="${escapeHtml(buildTrainerProfileHref(trainer))}">Visit their website</a>
        </article>
      `;
    };

    const deckFilteredList = (filters) => cards.filter((trainer) => (
      matchesTrainerFilters(trainer, filters) && getTrainerReviewStatus(trainer) !== 'review'
    ));

    const renderCoachMatchBrowser = (filters) => {
      const list = deckFilteredList(filters);
      const signature = list.map((trainer) => String(trainer.id || '')).join('|');
      if (signature !== deckListSignature) {
        deckListSignature = signature;
        deckIndex = 0;
      }
      const matchedTrainers = deckMatches
        .map((id) => cards.find((trainer) => String(trainer.id || '') === id))
        .filter(Boolean);
      const matchesStrip = `
        <div class="coach-match-strip${matchedTrainers.length ? '' : ' is-empty'}">
          <div class="coach-match-strip-title">Your matches</div>
          ${matchedTrainers.length
            ? `<div class="coach-match-strip-row">${matchedTrainers.map((trainer) => `
                <a class="coach-pill coach-match-chip" href="${escapeHtml(buildTrainerProfileHref(trainer))}">
                  <img src="${escapeHtml(trainer.photoDataUrl || 'assets/images/placeholders/profile-placeholder.jpg')}" alt="">
                  <span>${escapeHtml(trainer.fullName || trainer.displayName || 'Coach')}</span>
                </a>
              `).join('')}</div>`
            : '<div class="coach-match-strip-hint">Coaches you match with land here.</div>'}
        </div>
      `;
      if (!list.length) {
        gridEl.innerHTML = `
          <div class="coach-match-browser">
            <div class="coach-match-empty">No trainers match that search yet.</div>
            ${matchesStrip}
          </div>
        `;
        return;
      }
      if (deckIndex >= list.length) {
        gridEl.innerHTML = `
          <div class="coach-match-browser">
            <div class="coach-match-empty">
              <strong>You've met everyone!</strong>
              <p>That's every coach for this search. Check your matches below or run the deck again.</p>
              <button type="button" class="coach-match-restart" data-deck-restart>Run it back</button>
            </div>
            ${matchesStrip}
          </div>
        `;
        gridEl.querySelector('[data-deck-restart]')?.addEventListener('click', () => {
          deckIndex = 0;
          renderCoachMatchBrowser(filters);
        });
        return;
      }
      const visible = list.slice(deckIndex, deckIndex + 3);
      gridEl.innerHTML = `
        <div class="coach-match-browser">
          <div class="coach-match-counter">${deckIndex + 1} of ${list.length}</div>
          <div class="coach-match-stage">
            ${visible.map((trainer, depth) => buildDeckProfileCard(trainer, depth)).reverse().join('')}
          </div>
          <div class="coach-match-actions">
            <button type="button" class="coach-match-btn is-pass" data-deck-pass aria-label="Pass">&#10005;</button>
            <button type="button" class="coach-match-btn is-match" data-deck-match aria-label="Match">&#10084;</button>
          </div>
          <div class="coach-match-help">Swipe the card or use the buttons - matches save below.</div>
          ${matchesStrip}
        </div>
      `;
      const topCard = gridEl.querySelector('[data-match-card][data-depth="0"]');
      const advance = (action) => {
        if (!topCard || topCard.dataset.leaving === '1') return;
        topCard.dataset.leaving = '1';
        const trainer = list[deckIndex];
        if (action === 'match' && trainer) {
          const id = String(trainer.id || '');
          if (id && !deckMatches.includes(id)) {
            deckMatches.push(id);
            persistDeckMatches();
          }
        }
        topCard.classList.add(action === 'match' ? 'is-leaving-right' : 'is-leaving-left');
        window.setTimeout(() => {
          deckIndex += 1;
          renderCoachMatchBrowser(filters);
        }, 340);
      };
      gridEl.querySelector('[data-deck-pass]')?.addEventListener('click', () => advance('pass'));
      gridEl.querySelector('[data-deck-match]')?.addEventListener('click', () => advance('match'));
      if (topCard) {
        let dragPointerId = null;
        let dragStartX = 0;
        let dragDx = 0;
        topCard.addEventListener('pointerdown', (event) => {
          if (event.target instanceof Element && event.target.closest('a,button')) return;
          dragPointerId = event.pointerId;
          dragStartX = event.clientX;
          dragDx = 0;
          topCard.setPointerCapture?.(event.pointerId);
          topCard.classList.add('is-dragging');
        });
        topCard.addEventListener('pointermove', (event) => {
          if (dragPointerId !== event.pointerId) return;
          dragDx = event.clientX - dragStartX;
          topCard.style.transform = `translateX(${dragDx}px) rotate(${dragDx / 18}deg)`;
          topCard.classList.toggle('show-match', dragDx > 55);
          topCard.classList.toggle('show-pass', dragDx < -55);
        });
        const endDrag = (event) => {
          if (dragPointerId !== event.pointerId) return;
          dragPointerId = null;
          topCard.classList.remove('is-dragging');
          if (dragDx > 95) {
            advance('match');
            return;
          }
          if (dragDx < -95) {
            advance('pass');
            return;
          }
          topCard.style.transform = '';
          topCard.classList.remove('show-match', 'show-pass');
        };
        topCard.addEventListener('pointerup', endDrag);
        topCard.addEventListener('pointercancel', endDrag);
      }
    };

    const applyFilters = () => {
      const reviewCount = cards.filter((trainer) => getTrainerReviewStatus(trainer) === 'review').length;
      if (reviewSummaryEl) {
        reviewSummaryEl.textContent = canModerate
          ? `${reviewCount} waiting for review`
          : '';
      }
      document.querySelectorAll('[data-review-tab]').forEach((button) => {
        button.classList.toggle('is-active', String(button.getAttribute('data-review-tab') || '') === activeReviewTab);
      });
      const filters = {
        search: normalizeText(searchInput?.value),
        city: normalizeText(cityInput?.value),
        state: normalizeText(stateInput?.value),
        zip: normalizeText(zipInput?.value)
      };
      syncViewToggle();
      if (viewMode === 'deck' && !(canModerate && activeReviewTab === 'review')) {
        renderCoachMatchBrowser(filters);
        return;
      }
      renderTrainerGrid(gridEl, cards, filters, {
        canModerate,
        activeTab: activeReviewTab
      });
    };
    applyFiltersRef = applyFilters;

    gridEl.addEventListener('click', async (event) => {
      const coachLink = event.target instanceof Element ? event.target.closest('.coach-pill') : null;
      if (coachLink instanceof HTMLAnchorElement && !hasAccountAccess()) {
        event.preventDefault();
        openAccessModal(coachLink);
        return;
      }
      const button = event.target instanceof Element ? event.target.closest('[data-review-action]') : null;
      if (!(button instanceof HTMLButtonElement)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!canModerateTrainerReviews(currentUser)) return;
      const action = String(button.dataset.reviewAction || '').trim().toLowerCase();
      const trainerId = String(button.dataset.trainerId || '').trim();
      if (!trainerId || (action !== 'approve' && action !== 'deny')) return;
      let reason = '';
      if (action === 'deny') {
        reason = window.prompt('Why was this trainer denied?') || '';
        if (!String(reason).trim()) return;
      }
      button.disabled = true;
      const resp = await api(
        action === 'approve' ? '/api/auth/trainer/review/approve' : '/api/auth/trainer/review/deny',
        {
          method: 'POST',
          body: JSON.stringify({
            trainerUserId: trainerId,
            reason
          })
        }
      );
      if (!resp.ok || !resp.json?.ok) {
        button.disabled = false;
        window.alert(resp.json?.error || `Could not ${action} trainer.`);
        if (canModerate) {
          await loadCards();
          applyFilters();
        }
        return;
      }
      if (action === 'deny') {
        cards = cards.filter((trainer) => String(trainer.id || '') !== trainerId);
      } else {
        cards = cards.map((trainer) => (
          String(trainer.id || '') === trainerId
            ? { ...trainer, ...(resp.json?.trainer || {}), reviewStatus: '', reviewDecisionStatus: 'approved' }
            : trainer
        ));
      }
      try {
        sessionStorage.setItem('trainer-directory-cache', JSON.stringify(cards));
      } catch {}
      applyFilters();
    });

    [searchInput, cityInput, stateInput, zipInput].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', applyFilters);
    });

    reviewTabsEl?.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-review-tab]') : null;
      if (!(button instanceof HTMLButtonElement)) return;
      activeReviewTab = String(button.getAttribute('data-review-tab') || 'all').trim().toLowerCase() || 'all';
      applyFilters();
    });

    if (canModerate) {
      const refreshModerationView = async () => {
        await loadCards();
        applyFilters();
      };
      window.addEventListener('focus', () => {
        refreshModerationView().catch(() => {});
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          refreshModerationView().catch(() => {});
        }
      });
      window.setInterval(() => {
        refreshModerationView().catch(() => {});
      }, 20000);
    }

    applyFilters();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
