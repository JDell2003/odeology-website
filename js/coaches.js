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

  const COACHES_PAGE_SIZE = 10;

  function ensureCoachesMobileStyle() {
    if (document.getElementById('coaches-mobile-style')) return;
    const style = document.createElement('style');
    style.id = 'coaches-mobile-style';
    style.textContent = `
      .coaches-filters-toggle{display:none}
      .coaches-toolbar-done{display:none}
      @media (max-width: 767px){
        /* One-screen mobile layout: tuck the filters behind a button and
           compact the deck so Pass & Match fits without scrolling. */
        .coaches-heading-sub{display:none}
        .coaches-heading-title{font-size:1.5rem;margin:0}
        .coaches-heading{margin:0 0 8px}
        .coaches-main{min-height:auto;padding-bottom:4px}
        .coaches-section-label{display:none}
        .coaches-toolbar{display:none}
        body.coaches-filters-open .coaches-toolbar{
          display:grid;gap:8px;position:fixed;left:12px;right:12px;top:64px;z-index:80;
          padding:14px;border-radius:18px;background:#ffffff;
          box-shadow:0 24px 60px rgba(7,20,31,.25);border:1px solid rgba(10,31,47,.1)
        }
        body.coaches-filters-open .coaches-toolbar-done{
          display:inline-flex;align-items:center;justify-content:center;min-height:42px;
          border:0;border-radius:12px;background:#16344d;color:#fff;
          font:800 13px/1 system-ui,sans-serif;cursor:pointer
        }
        .coaches-filters-backdrop{display:none;position:fixed;inset:0;z-index:70;background:rgba(2,6,23,.4)}
        body.coaches-filters-open .coaches-filters-backdrop{display:block}
        .coaches-filters-toggle{
          display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;
          border:1px solid rgba(15,23,42,.12);background:rgba(255,255,255,.92);color:#475569;
          font:800 13px/1 system-ui,sans-serif;cursor:pointer;position:relative
        }
        .coaches-filters-toggle[data-active="1"]::after{
          content:'';position:absolute;top:6px;right:8px;width:7px;height:7px;border-radius:999px;background:#e11d48
        }
        .coaches-view-toggle{margin:0 0 10px}
        .coaches-controls-row{display:flex;justify-content:center;align-items:center;gap:8px;margin:0 0 8px}
        .coaches-controls-row .coaches-view-toggle{margin:0}
        /* Moderator tabs: align and compact to match the rest of the page */
        .coaches-review-tabs.is-visible{justify-content:center;gap:6px;margin:0 0 8px;max-width:none}
        .coaches-review-tab{min-height:34px;padding:0 12px;font-size:.7rem;border-radius:999px}
        .coaches-review-summary{width:100%;text-align:center;font-size:.66rem;order:3}
        /* Photo-forward swipe card (Tinder-style) */
        .coach-match-browser{gap:0;padding:0 0 8px;position:relative}
        .coach-match-counter{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:6;margin:0;
          padding:5px 12px;border-radius:999px;background:rgba(2,6,23,.45);color:#fff;font-size:10px;
          letter-spacing:.14em;backdrop-filter:blur(6px)}
        .coach-match-stage{height:350px;margin-bottom:0}
        .coach-match-card{padding:0;gap:5px;border-radius:24px;overflow:hidden;justify-content:flex-end;text-align:left;align-items:stretch;background:#0e1626;border:0}
        .coach-match-card::after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;
          background:linear-gradient(180deg,rgba(2,6,23,0) 38%,rgba(2,6,23,.55) 62%,rgba(2,6,23,.92) 100%)}
        .coach-match-card-avatar{position:absolute;top:0;left:0;right:0;width:100%;height:62%;border:0;border-radius:0;margin:0;box-shadow:none;z-index:0}
        .coach-match-card-avatar img{width:100%;height:100%;object-fit:cover;object-position:center top}
        .coach-match-card-stamp{z-index:5;top:34px}
        .coach-match-card-name,.coach-match-card-handle,.coach-match-card-chips,
        .coach-match-card-overview,.coach-match-card-mode{position:relative;z-index:2;margin-left:18px;margin-right:18px}
        .coach-match-card-name{color:#fff;font-size:24px;text-shadow:0 2px 12px rgba(0,0,0,.45)}
        .coach-match-card-handle{color:rgba(255,255,255,.72);font-size:11px}
        .coach-match-card-chips{justify-content:flex-start;margin-top:4px}
        .coach-match-card-chips span{padding:4px 11px;font-size:9.5px;background:rgba(255,255,255,.16);color:#fff;
          border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(6px)}
        .coach-match-card-overview{color:rgba(255,255,255,.82);font-size:12.5px;line-height:1.5;-webkit-line-clamp:2;max-width:none;text-align:left}
        .coach-match-card-mode{color:rgba(255,255,255,.6);font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
        .coach-match-card a.coach-match-card-view{position:relative;z-index:2;margin:10px 18px 44px;min-height:42px;
          font-size:12.5px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);backdrop-filter:blur(8px)}
        /* Action buttons float over the card bottom */
        .coach-match-actions{position:relative;z-index:6;gap:22px;margin-top:-31px}
        .coach-match-btn{width:60px;height:60px;font-size:24px;border-width:0;box-shadow:0 14px 30px rgba(2,6,23,.3)}
        .coach-match-btn.is-pass{background:#ffffff;color:#64748b}
        .coach-match-btn.is-match{background:linear-gradient(135deg,#ff2d55,#e11d48);color:#fff;animation:coachHeartBeat 2.6s ease-in-out infinite}
        @keyframes coachHeartBeat{0%,100%{transform:scale(1)}12%{transform:scale(1.07)}24%{transform:scale(1)}}
        .coach-match-help{display:none}
        /* Matches: story-style avatar bubbles */
        .coach-match-strip{margin-top:10px;padding:10px 14px 8px;border-radius:18px;background:rgba(255,255,255,.75);
          border:1px solid rgba(10,31,47,.07);box-shadow:none;backdrop-filter:blur(8px)}
        .coach-match-strip-title{margin-bottom:8px;font-size:9.5px;text-align:center}
        .coach-match-strip-row{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;gap:14px;justify-content:flex-start}
        .coach-match-strip-row::-webkit-scrollbar{display:none}
        .coach-match-chip{flex-direction:column;gap:4px;padding:0;background:transparent;border:0;flex:0 0 auto;max-width:58px}
        .coach-match-chip img{width:46px;height:46px;border:2.5px solid #16a34a;padding:1.5px;background:#fff}
        .coach-match-chip span{font-size:9.5px;max-width:58px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#334155}
        .coach-match-strip-hint{font-size:11px;text-align:center}
        .coach-match-empty{padding:30px 18px}
        @media (prefers-reduced-motion: reduce){.coach-match-btn.is-match{animation:none}}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureCoachesPagerStyle() {
    if (document.getElementById('coaches-pager-style')) return;
    const style = document.createElement('style');
    style.id = 'coaches-pager-style';
    style.textContent = `
      .coaches-pager{grid-column:1 / -1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 0 8px}
      .coaches-pager-info{font:700 12px/1.2 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:rgba(13,34,50,.5)}
      .coaches-pager-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
      .coaches-pager-btn{min-width:40px;min-height:40px;padding:0 10px;border-radius:12px;border:1px solid rgba(10,31,47,.12);background:rgba(255,255,255,.92);color:rgba(13,34,50,.78);font:800 13px/1 system-ui,sans-serif;cursor:pointer;transition:all .14s ease}
      .coaches-pager-btn:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(10,31,47,.28)}
      .coaches-pager-btn:disabled{opacity:.35;cursor:default}
      .coaches-pager-btn.is-current{background:#16344d;border-color:#16344d;color:#fff}
      .coaches-pager-gap{color:rgba(13,34,50,.4);font:800 13px/1 system-ui,sans-serif;padding:0 2px}
    `;
    document.head.appendChild(style);
  }

  function buildCoachesPager(page, totalPages, totalCount, startIndex, shownCount) {
    const info = `Showing ${startIndex + 1}-${startIndex + shownCount} of ${totalCount} trainer${totalCount === 1 ? '' : 's'}`;
    if (totalPages <= 1) {
      return `<nav class="coaches-pager" aria-label="Trainer pages"><div class="coaches-pager-info">${info}</div></nav>`;
    }
    // Windowed page numbers: 1 ... p-1 p p+1 ... last
    const numbers = new Set([1, totalPages, page - 1, page, page + 1]);
    if (totalPages <= 7) for (let n = 1; n <= totalPages; n += 1) numbers.add(n);
    const ordered = Array.from(numbers).filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
    let numbersMarkup = '';
    let previous = 0;
    ordered.forEach((n) => {
      if (previous && n - previous > 1) numbersMarkup += '<span class="coaches-pager-gap" aria-hidden="true">&hellip;</span>';
      numbersMarkup += `<button type="button" class="coaches-pager-btn${n === page ? ' is-current' : ''}" data-coaches-page="${n}" aria-label="Page ${n}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`;
      previous = n;
    });
    return `
      <nav class="coaches-pager" aria-label="Trainer pages">
        <div class="coaches-pager-info">${info}</div>
        <div class="coaches-pager-controls">
          <button type="button" class="coaches-pager-btn" data-coaches-page="${page - 1}" aria-label="Previous page"${page <= 1 ? ' disabled' : ''}>&larr;</button>
          ${numbersMarkup}
          <button type="button" class="coaches-pager-btn" data-coaches-page="${page + 1}" aria-label="Next page"${page >= totalPages ? ' disabled' : ''}>&rarr;</button>
        </div>
      </nav>
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
    ensureCoachesPagerStyle();
    const totalPages = Math.max(1, Math.ceil(filtered.length / COACHES_PAGE_SIZE));
    const page = Math.min(Math.max(1, Number(options.page) || 1), totalPages);
    const startIndex = (page - 1) * COACHES_PAGE_SIZE;
    const visible = filtered.slice(startIndex, startIndex + COACHES_PAGE_SIZE);
    gridEl.innerHTML = visible.map((trainer) => buildCoachCard(trainer, options)).join('')
      + buildCoachesPager(page, totalPages, filtered.length, startIndex, visible.length);
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
    let cardsPage = 1;
    let cardsFilterSignature = '';
    try {
      const storedMatches = JSON.parse(sessionStorage.getItem('coaches-deck-matches') || 'null');
      if (Array.isArray(storedMatches)) deckMatches = storedMatches.map((id) => String(id)).filter(Boolean);
    } catch {}
    const persistDeckMatches = () => {
      try { sessionStorage.setItem('coaches-deck-matches', JSON.stringify(deckMatches)); } catch {}
    };

    ensureCoachesMobileStyle();
    if (!document.getElementById('coaches-view-toggle')) {
      gridEl.insertAdjacentHTML('beforebegin', `
        <div class="coaches-controls-row" id="coaches-controls-row">
          <div class="coaches-view-toggle" id="coaches-view-toggle" role="tablist" aria-label="Browse style">
            <button type="button" data-view-mode="deck" role="tab">&#10084;&#65039; Pass &amp; Match</button>
            <button type="button" data-view-mode="cards" role="tab">&#9783; Cards</button>
          </div>
          <button type="button" class="coaches-filters-toggle" id="coaches-filters-toggle" aria-label="Search and location filters">&#9881; Filters</button>
        </div>
      `);
      document.getElementById('coaches-view-toggle')?.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-view-mode]') : null;
        if (!(button instanceof HTMLButtonElement)) return;
        viewMode = button.dataset.viewMode === 'cards' ? 'cards' : 'deck';
        try { localStorage.setItem('coaches-view-mode', viewMode); } catch {}
        applyFilters();
      });
      // Mobile: the search/city/state/zip inputs live behind the Filters
      // button so Pass & Match fits on one screen.
      const toolbarEl = document.querySelector('.coaches-toolbar');
      const filtersToggleEl = document.getElementById('coaches-filters-toggle');
      if (toolbarEl && filtersToggleEl) {
        const backdrop = document.createElement('div');
        backdrop.className = 'coaches-filters-backdrop';
        document.body.appendChild(backdrop);
        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = 'coaches-toolbar-done';
        doneButton.textContent = 'Show trainers';
        toolbarEl.appendChild(doneButton);
        const closeFilters = () => document.body.classList.remove('coaches-filters-open');
        filtersToggleEl.addEventListener('click', () => {
          document.body.classList.toggle('coaches-filters-open');
          if (document.body.classList.contains('coaches-filters-open')) {
            toolbarEl.querySelector('input')?.focus();
          }
        });
        backdrop.addEventListener('click', closeFilters);
        doneButton.addEventListener('click', closeFilters);
        const syncFilterDot = () => {
          const hasValue = [searchInput, cityInput, stateInput, zipInput]
            .some((input) => input && String(input.value || '').trim());
          filtersToggleEl.setAttribute('data-active', hasValue ? '1' : '0');
        };
        [searchInput, cityInput, stateInput, zipInput].forEach((input) => {
          input?.addEventListener('input', syncFilterDot);
        });
        syncFilterDot();
      }
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
      // New search or tab -> back to the first page.
      const filterSignature = JSON.stringify([filters, activeReviewTab]);
      if (filterSignature !== cardsFilterSignature) {
        cardsFilterSignature = filterSignature;
        cardsPage = 1;
      }
      renderTrainerGrid(gridEl, cards, filters, {
        canModerate,
        activeTab: activeReviewTab,
        page: cardsPage
      });
    };
    applyFiltersRef = applyFilters;

    gridEl.addEventListener('click', (event) => {
      const pageButton = event.target instanceof Element ? event.target.closest('[data-coaches-page]') : null;
      if (!(pageButton instanceof HTMLButtonElement) || pageButton.disabled) return;
      const nextPage = Number(pageButton.getAttribute('data-coaches-page'));
      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === cardsPage) return;
      cardsPage = nextPage;
      applyFilters();
      try {
        gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
    });

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
