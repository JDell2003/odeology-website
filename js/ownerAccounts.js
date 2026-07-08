(() => {
  const $ = (sel) => document.querySelector(sel);
  const OWNER_BADGE_STORAGE_PREFIX = 'ownerSeenBadge:v1';
  const AUTH_USER_HINT_KEY = 'ode_auth_user_hint_v1';
  const DOOR_BADGE_ITEM_IDS = [
    '/training.html',
    '/#resources',
    '/workout-plan-generator',
    '/ai-workout-generator',
    '/home-workout-plan-generator',
    '/beginner-workout-plan',
    '/meal-plan-generator',
    '/high-protein-meal-plan',
    '/fat-loss-meal-plan',
    '/bulking-meal-plan',
    '/macro-meal-plan-generator',
    '/free-meal-plan-generator',
    '/cheap-meal-plan-bodybuilding',
    '/free-grocery-meal-planner',
    '/simple-meal-plan-generator',
    '/free-workout-plan-generator',
    '/strength-workout-plan',
    '/fat-loss-workout-plan',
    '/hypertrophy-workout-plan',
    '/quick-workout-plan'
  ];

  const state = {
    accounts: [],
    workspaceRequests: [],
    currentUserId: '',
    search: '',
    searchTimer: null,
    liveRefreshTimer: null,
    liveRefreshInFlight: false,
    ownerApiReady: true,
    ownerView: 'accounts',
    accountFilter: 'all',
    gymFilter: 'all',
    messageBadgeIds: []
  };

  function badgeStorageKey(scope) {
    return `${OWNER_BADGE_STORAGE_PREFIX}:${String(scope || '').trim().toLowerCase()}`;
  }

  function readAuthUserHint() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTH_USER_HINT_KEY) || 'null');
      const user = parsed?.user;
      const id = String(user?.id || '').trim();
      if (!id) return null;
      return {
        id,
        username: String(user?.username || '').trim(),
        email: String(user?.email || '').trim(),
        displayName: String(user?.displayName || '').trim(),
        isOwner: Boolean(user?.isOwner),
        isManager: Boolean(user?.isManager || user?.manager?.active)
      };
    } catch {
      return null;
    }
  }

  function isOwnerUser(user) {
    const uname = String(user?.username || '').trim().toLowerCase();
    const dname = String(user?.displayName || '').trim().toLowerCase();
    if (user?.isOwner) return true;
    return ['riseforit', 'riseforitowner', 'jason', 'odeology', 'odeology_'].includes(uname)
      || ['riseforit', 'odeology', 'odeology_'].includes(dname);
  }

  async function getOwnerSessionUser() {
    const me = await api('/api/auth/me');
    const meUser = me.json?.user || null;
    if (me.ok && isOwnerUser(meUser)) return { ok: true, user: meUser, fallback: false };
    const hintedUser = readAuthUserHint();
    if (hintedUser && isOwnerUser(hintedUser) && (me.json?.dbUnavailable || !me.ok)) {
      return { ok: true, user: hintedUser, fallback: true };
    }
    return { ok: false, user: meUser, fallback: false };
  }

  function readSeenBadgeIds(scope) {
    try {
      const parsed = JSON.parse(localStorage.getItem(badgeStorageKey(scope)) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item || '')) : []);
    } catch {
      return new Set();
    }
  }

  function getUnseenCount(scope, ids) {
    const seen = readSeenBadgeIds(scope);
    return ids.reduce((count, id) => count + (seen.has(String(id || '')) ? 0 : 1), 0);
  }

  function renderShortcutBadge(scope, count) {
    const el = document.querySelector(`[data-owner-badge-scope="${scope}"]`);
    if (!el) return;
    const nextCount = Math.max(0, Number(count || 0));
    el.textContent = String(nextCount);
    el.classList.toggle('is-visible', nextCount > 0);
    el.setAttribute('aria-hidden', nextCount > 0 ? 'false' : 'true');
  }

  function updateShortcutBadges() {
    renderShortcutBadge('outreach', getUnseenCount('outreach', state.messageBadgeIds));
    renderShortcutBadge('doors', getUnseenCount('doors', DOOR_BADGE_ITEM_IDS));
  }

  async function refreshOwnerData() {
    if (state.liveRefreshInFlight) return;
    state.liveRefreshInFlight = true;
    try {
      await Promise.all([
        loadAccounts(),
        loadWorkspaceRequests()
      ]);
    } finally {
      state.liveRefreshInFlight = false;
    }
  }

  function startLiveRefresh() {
    stopLiveRefresh();
    state.liveRefreshTimer = window.setInterval(() => {
      if (document.hidden) return;
      refreshOwnerData();
    }, 10000);
  }

  function stopLiveRefresh() {
    if (!state.liveRefreshTimer) return;
    window.clearInterval(state.liveRefreshTimer);
    state.liveRefreshTimer = null;
  }

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
      return { ok: false, status: 0, json: { error: 'Network error' } };
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

  function fmtDate(raw) {
    if (!raw) return '-';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return '-';
    return d.toLocaleString();
  }

  function setStatus(text, kind = '') {
    const el = $('#owner-accounts-status');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('error', 'ok');
    if (kind) el.classList.add(kind);
  }

  function setListCount(text) {
    const el = $('#owner-accounts-count');
    if (el) el.textContent = String(text || '');
  }

  function getFilteredAccounts() {
    const filter = String(state.accountFilter || 'all').trim().toLowerCase();
    if (filter === 'all') return state.accounts.slice();
    return state.accounts.filter((acct) => {
      const isTrainer = acct.isTrainer === true;
      const hasTrainerAssignment = acct.hasTrainerAssignment === true;
      const isManager = acct.isManager === true;
      const isClient = !isTrainer && !isManager;
      if (filter === 'trainer') return isTrainer;
      if (filter === 'regular') return isClient;
      if (filter === 'with-trainer') return isClient && hasTrainerAssignment;
      if (filter === 'without-trainer') return isClient && !hasTrainerAssignment;
      if (filter === 'manager') return isManager;
      return true;
    });
  }

  function renderList() {
    const wrap = $('#owner-accounts-list');
    if (!wrap) return;
    const filteredAccounts = getFilteredAccounts();
    setListCount(`${filteredAccounts.length} of ${state.accounts.length} accounts`);
    if (!filteredAccounts.length) {
      wrap.innerHTML = '<div class="owner-accounts-muted">No accounts found.</div>';
      return;
    }

    wrap.innerHTML = filteredAccounts.map((acct) => {
      const username = acct.username ? `@${acct.username}` : '(no username)';
      const discipline = acct.discipline ? acct.discipline : 'no discipline';
      const msgPill = Number(acct.ownerMessageCount || 0) > 0
        ? `<span class="owner-accounts-pill good">Msgs ${Number(acct.ownerMessageCount || 0)}</span>`
        : '<span class="owner-accounts-pill">Msgs 0</span>';
      const planPill = acct.hasActivePlan
        ? '<span class="owner-accounts-pill good">Plan active</span>'
        : '<span class="owner-accounts-pill">No plan</span>';
      const trainerPill = acct.isTrainer
        ? '<span class="owner-accounts-pill good">Trainer</span>'
        : '';
      const assignedTrainerPill = acct.hasTrainerAssignment
        ? '<span class="owner-accounts-pill">Has trainer</span>'
        : '';
      const managerPill = acct.isManager
        ? '<span class="owner-accounts-pill good">Manager</span>'
        : '';
      const primaryActionButton = acct.isManager
        ? `<button class="btn btn-ghost" type="button" data-action="trainers" data-account-id="${escapeHtml(acct.id)}">Trainers</button>`
        : acct.isTrainer
          ? `<button class="btn btn-ghost" type="button" data-action="clients" data-account-id="${escapeHtml(acct.id)}">Clients</button>`
          : '';
      const viewOverviewButton = acct.isTrainer
        ? ''
        : `<button class="btn btn-ghost" type="button" data-action="view" data-account-id="${escapeHtml(acct.id)}">View Overview</button>`;
      return `
        <article class="owner-account-item" data-account-id="${escapeHtml(acct.id)}" role="button" tabindex="0">
          <div class="owner-account-row1">
            <div class="owner-account-name">${escapeHtml(acct.displayName || 'Account')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">${trainerPill}${managerPill}${assignedTrainerPill}${planPill}${msgPill}</div>
          </div>
          <div class="owner-account-meta">
            <span>${escapeHtml(username)}</span>
            <span>${escapeHtml(acct.email || '-')}</span>
            <span>${escapeHtml(discipline)}</span>
            <span>Last seen: ${escapeHtml(fmtDate(acct.lastSeen))}</span>
          </div>
          <div class="owner-accounts-actions">
            ${viewOverviewButton}
            ${primaryActionButton}
            <button class="btn btn-ghost" type="button" data-action="password" data-account-id="${escapeHtml(acct.id)}">Change Password</button>
            <button class="btn btn-ghost" type="button" data-action="delete" data-account-id="${escapeHtml(acct.id)}">Delete</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function setWorkspaceRequestCount(text) {
    const el = $('#owner-workspace-requests-count');
    if (el) el.textContent = String(text || '');
  }

  function setWorkspaceRequestStatus(text, kind = '') {
    const el = $('#owner-workspace-requests-status');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('error', 'ok');
    if (kind) el.classList.add(kind);
  }

  function renderWorkspaceRequests() {
    const wrap = $('#owner-workspace-requests-list');
    if (!wrap) return;
    const filter = String(state.gymFilter || 'all').trim().toLowerCase();
    const filteredRequests = state.workspaceRequests.filter((request) => {
      const kind = String(request?.requestKind || 'workspace').trim().toLowerCase();
      const status = String(request?.status || 'review').trim().toLowerCase();
      if (filter === 'all') return true;
      if (filter === 'gym') return kind !== 'location';
      if (filter === 'location') return kind === 'location';
      return status === filter;
    });
    if (!filteredRequests.length) {
      wrap.innerHTML = '<div class="owner-accounts-muted">No gym or location requests right now.</div>';
      return;
    }
    wrap.innerHTML = filteredRequests.map((request) => `
      <article class="owner-review-item">
        <div class="owner-review-top">
          <div class="owner-review-name">${escapeHtml(request.requestKind === 'location' ? (request.locationName || 'Location request') : (request.gymName || 'Gym request'))}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="owner-accounts-pill">${escapeHtml(request.requestKind === 'location' ? 'location' : 'gym')}</span>
            <span class="owner-accounts-pill ${request.status === 'approved' ? 'good' : ''}">${escapeHtml(request.status || 'review')}</span>
          </div>
        </div>
        <div class="owner-review-meta">
          <span>${escapeHtml(request.requestKind === 'location' ? `For ${request.gymName || 'workspace'}` : (request.workspaceType || 'Gym/company'))}</span>
          <span>${escapeHtml([request.city, request.state].filter(Boolean).join(', ') || '-')}</span>
          <span>${escapeHtml(request.email || '-')}</span>
          <span>Submitted: ${escapeHtml(fmtDate(request.submittedAt))}</span>
        </div>
        ${request.requestKind === 'location' && request.address ? `<div class="owner-review-meta"><span>${escapeHtml(request.address)}</span></div>` : ''}
        ${request.logoUrl ? `<div class="owner-review-meta"><a href="${escapeHtml(request.logoUrl)}" target="_blank" rel="noreferrer noopener">Open logo</a></div>` : ''}
        ${request.notes ? `<div class="owner-review-notes">${escapeHtml(request.notes)}</div>` : ''}
        ${request.status === 'review' ? `
          <div class="owner-accounts-actions">
            <button class="btn btn-ghost" type="button" data-workspace-action="approve" data-request-id="${escapeHtml(request.id)}">Approve</button>
            <button class="btn btn-ghost" type="button" data-workspace-action="deny" data-request-id="${escapeHtml(request.id)}">Deny</button>
          </div>
        ` : ''}
      </article>
    `).join('');
    setWorkspaceRequestCount(`${filteredRequests.length} shown • ${Number(state.workspaceRequests.filter((item) => String(item?.status || '') === 'review').length)} pending`);
  }

  function syncOwnerView() {
    document.querySelectorAll('[data-owner-view]').forEach((button) => {
      const active = button.getAttribute('data-owner-view') === state.ownerView;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-owner-section]').forEach((section) => {
      const active = section.getAttribute('data-owner-section') === state.ownerView;
      if (active) section.removeAttribute('hidden');
      else section.setAttribute('hidden', '');
    });
  }

  function syncAccountFilters() {
    document.querySelectorAll('[data-account-filter]').forEach((button) => {
      const active = button.getAttribute('data-account-filter') === state.accountFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function syncGymFilters() {
    document.querySelectorAll('[data-gym-filter]').forEach((button) => {
      const active = button.getAttribute('data-gym-filter') === state.gymFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function redirectToUserOverview(accountId) {
    const id = String(accountId || '').trim();
    if (!id) return;
    if (!state.ownerApiReady) {
      setStatus('Owner view-as-account route is not active yet. Restart backend, then try again.', 'error');
      return;
    }
    const returnTo = encodeURIComponent('/overview.html');
    window.location.href = `/api/auth/owner/impersonate/${encodeURIComponent(id)}?returnTo=${returnTo}`;
  }

  function redirectToTrainerClients(accountId) {
    const id = String(accountId || '').trim();
    if (!id) return;
    if (!state.ownerApiReady) {
      setStatus('Owner view-as-account route is not active yet. Restart backend, then try again.', 'error');
      return;
    }
    const returnTo = encodeURIComponent('/trainer-dashboard.html');
    window.location.href = `/api/auth/owner/impersonate/${encodeURIComponent(id)}?returnTo=${returnTo}`;
  }

  function getManagerTrainerMatches(accountId) {
    const managerAccount = findAccount(accountId);
    if (!managerAccount) return [];
    const managerCode = String(managerAccount.managerCode || '').trim().toUpperCase();
    const workspaceId = String(managerAccount.workspaceId || '').trim();
    const locationId = String(managerAccount.locationId || '').trim();
    return state.accounts.filter((acct) => {
      if (!acct || acct.id === managerAccount.id || acct.isTrainer !== true) return false;
      const trainerManagerCode = String(acct.managerCode || '').trim().toUpperCase();
      const trainerWorkspaceId = String(acct.workspaceId || '').trim();
      const trainerLocationId = String(acct.locationId || '').trim();
      if (managerCode && trainerManagerCode && managerCode === trainerManagerCode) return true;
      if (workspaceId && trainerWorkspaceId && workspaceId === trainerWorkspaceId) {
        if (!locationId || !trainerLocationId) return true;
        return locationId === trainerLocationId;
      }
      if (locationId && trainerLocationId && locationId === trainerLocationId) return true;
      return false;
    });
  }

  function closeManagerTrainersModal() {
    const modal = $('#owner-manager-trainers-modal');
    if (modal) modal.setAttribute('hidden', '');
  }

  function openManagerTrainersModal(accountId) {
    const acct = findAccount(accountId);
    const modal = $('#owner-manager-trainers-modal');
    const titleEl = $('#owner-manager-trainers-title');
    const subtitleEl = $('#owner-manager-trainers-subtitle');
    const listEl = $('#owner-manager-trainers-list');
    if (!acct || !modal || !titleEl || !subtitleEl || !listEl) return;
    const trainers = getManagerTrainerMatches(accountId);
    titleEl.textContent = `${acct.displayName || acct.username || 'Manager'} Trainers`;
    const contextBits = [
      acct.managerCode ? `Manager code: ${acct.managerCode}` : '',
      acct.workspaceId ? `Workspace: ${acct.workspaceId}` : '',
      acct.locationId ? `Location: ${acct.locationId}` : ''
    ].filter(Boolean);
    subtitleEl.textContent = contextBits.join(' • ') || 'Trainers linked to this manager account.';
    if (!trainers.length) {
      listEl.innerHTML = '<div class="owner-accounts-muted">No linked trainers found for this manager yet.</div>';
    } else {
      listEl.innerHTML = trainers.map((trainer) => `
        <article class="owner-accounts-modal-item">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
            <div style="font-weight:800;">${escapeHtml(trainer.displayName || trainer.username || 'Trainer')}</div>
            <span class="owner-accounts-pill good">Trainer</span>
          </div>
          <div class="owner-account-meta">
            <span>${escapeHtml(trainer.username ? `@${trainer.username}` : '(no username)')}</span>
            <span>${escapeHtml(trainer.email || '-')}</span>
            <span>${escapeHtml(trainer.discipline || 'no discipline')}</span>
          </div>
          <div class="owner-account-meta">
            ${trainer.managerCode ? `<span>Code: ${escapeHtml(trainer.managerCode)}</span>` : ''}
            ${trainer.workspaceId ? `<span>Workspace: ${escapeHtml(trainer.workspaceId)}</span>` : ''}
            ${trainer.locationId ? `<span>Location: ${escapeHtml(trainer.locationId)}</span>` : ''}
          </div>
          <div class="owner-accounts-actions">
            <button class="btn btn-ghost" type="button" data-action="clients" data-account-id="${escapeHtml(trainer.id)}">Clients</button>
            <button class="btn btn-ghost" type="button" data-action="password" data-account-id="${escapeHtml(trainer.id)}">Change Password</button>
          </div>
        </article>
      `).join('');
    }
    modal.removeAttribute('hidden');
  }

  function findAccount(accountId) {
    return state.accounts.find((item) => String(item.id) === String(accountId)) || null;
  }

  async function changePassword(accountId) {
    const acct = findAccount(accountId);
    const label = acct?.username ? `@${acct.username}` : (acct?.displayName || accountId);
    const nextPassword = window.prompt(`Set a new password for ${label} (min 8 chars):`);
    if (nextPassword == null) return;
    if (String(nextPassword).trim().length < 8) {
      setStatus('Password must be at least 8 characters.', 'error');
      return;
    }

    setStatus(`Updating password for ${label}...`);
    const resp = await api(`/api/auth/owner/account/${encodeURIComponent(accountId)}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password: nextPassword })
    });
    if (!resp.ok) {
      setStatus(resp.json?.error || 'Failed to update password.', 'error');
      return;
    }
    setStatus(`Password updated for ${label}. Existing sessions were signed out.`, 'ok');
  }

  async function deleteAccount(accountId) {
    const acct = findAccount(accountId);
    const label = acct?.username ? `@${acct.username}` : (acct?.displayName || accountId);
    const ok = window.confirm(`Delete account ${label}? This permanently removes it from database.`);
    if (!ok) return;

    setStatus(`Deleting ${label}...`);
    const resp = await api(`/api/auth/owner/account/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
    if (!resp.ok) {
      setStatus(resp.json?.error || 'Failed to delete account.', 'error');
      return;
    }
    setStatus(`Deleted ${label}.`, 'ok');
    await loadAccounts();
  }

  async function handleAction(action, accountId) {
    if (!accountId) return;
    if (action === 'view') {
      redirectToUserOverview(accountId);
      return;
    }
    if (action === 'clients') {
      redirectToTrainerClients(accountId);
      return;
    }
    if (action === 'trainers') {
      openManagerTrainersModal(accountId);
      return;
    }
    if (action === 'password') {
      await changePassword(accountId);
      return;
    }
    if (action === 'delete') {
      await deleteAccount(accountId);
    }
  }

  async function loadAccounts() {
    const q = String(state.search || '').trim();
    const qs = new URLSearchParams();
    qs.set('limit', '10000');
    if (q) qs.set('q', q);

    let resp = await api(`/api/auth/owner/accounts?${qs.toString()}`);
    let usedFallback = false;
    if (!resp.ok && resp.status === 404) {
      resp = await api(`/api/auth/accounts?${qs.toString()}`);
      usedFallback = resp.ok;
    }

    if (!resp.ok) {
      setListCount('');
      setStatus(resp.json?.error || 'Failed to load accounts.', 'error');
      const wrap = $('#owner-accounts-list');
      if (wrap) wrap.innerHTML = `<div class="owner-accounts-muted">${escapeHtml(resp.json?.error || 'Failed to load accounts.')}</div>`;
      return;
    }

    setStatus('');
    const rawAccounts = Array.isArray(resp.json?.accounts) ? resp.json.accounts : [];
    state.accounts = rawAccounts.map((item) => ({
      id: item.id,
      username: item.username || null,
      email: item.email || null,
      displayName: item.displayName || item.username || 'Account',
      discipline: item.discipline || null,
      isTrainer: item.isTrainer === true,
      assignedClientCount: Math.max(0, Number(item.assignedClientCount || 0)),
      hasTrainerAssignment: item.hasTrainerAssignment === true,
      managerCode: String(item.managerCode || '').trim(),
      workspaceId: String(item.workspaceId || '').trim(),
      locationId: String(item.locationId || '').trim(),
      isManager: item.isManager === true,
      hasActivePlan: Boolean(item.hasActivePlan),
      ownerMessageCount: Number(item.ownerMessageCount || 0),
      lastSeen: item.lastSeen || null
    }));
    if (!q) {
      state.messageBadgeIds = state.accounts
        .filter((item) => Number(item.ownerMessageCount || 0) > 0)
        .map((item) => String(item.id || ''))
        .filter(Boolean);
    }
    state.ownerApiReady = !usedFallback;
    if (usedFallback) {
      setStatus('Loaded via fallback endpoint. Restart backend to enable full owner account actions.', 'error');
    }
    syncAccountFilters();
    renderList();
    updateShortcutBadges();
  }

  async function loadWorkspaceRequests() {
    const resp = await api('/api/auth/owner/workspace-requests');
    if (!resp.ok) {
      setWorkspaceRequestCount('');
      setWorkspaceRequestStatus(resp.json?.error || 'Failed to load requests.', 'error');
      const wrap = $('#owner-workspace-requests-list');
      if (wrap) wrap.innerHTML = `<div class="owner-accounts-muted">${escapeHtml(resp.json?.error || 'Failed to load requests.')}</div>`;
      return;
    }
    setWorkspaceRequestStatus('');
    state.workspaceRequests = Array.isArray(resp.json?.requests) ? resp.json.requests : [];
    syncGymFilters();
    renderWorkspaceRequests();
  }

  async function handleWorkspaceRequestAction(action, requestId) {
    if (!requestId || (action !== 'approve' && action !== 'deny')) return;
    const reason = action === 'deny'
      ? window.prompt('Reason for denial (optional but recommended):') ?? ''
      : '';
    setWorkspaceRequestStatus(action === 'approve' ? 'Approving request...' : 'Denying request...');
    const resp = await api(
      action === 'approve' ? '/api/auth/owner/workspace-request/approve' : '/api/auth/owner/workspace-request/deny',
      {
        method: 'POST',
        body: JSON.stringify({ requestId, reason })
      }
    );
    if (!resp.ok) {
      setWorkspaceRequestStatus(resp.json?.error || 'Could not update request.', 'error');
      return;
    }
    setWorkspaceRequestStatus(action === 'approve' ? 'Request approved.' : 'Request denied.', 'ok');
    await loadWorkspaceRequests();
  }

  function bindEvents() {
    const search = $('#owner-accounts-search');
    if (search) {
      search.addEventListener('input', (e) => {
        state.search = String(e.target.value || '');
        if (state.searchTimer) window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
          loadAccounts();
        }, 220);
      });
    }

    const list = $('#owner-accounts-list');
    if (list) {
      list.addEventListener('click', async (e) => {
        const actionButton = e.target?.closest?.('[data-action][data-account-id]');
        if (actionButton) {
          e.preventDefault();
          e.stopPropagation();
          await handleAction(
            actionButton.getAttribute('data-action'),
            actionButton.getAttribute('data-account-id')
          );
          return;
        }
        const item = e.target?.closest?.('[data-account-id]');
        if (!item) return;
        const acct = findAccount(item.getAttribute('data-account-id'));
        if (acct?.isTrainer) return;
        redirectToUserOverview(item.getAttribute('data-account-id'));
      });

      list.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target?.closest?.('[data-action]')) return;
        const item = e.target?.closest?.('[data-account-id]');
        if (!item) return;
        e.preventDefault();
        const acct = findAccount(item.getAttribute('data-account-id'));
        if (acct?.isTrainer) return;
        redirectToUserOverview(item.getAttribute('data-account-id'));
      });
    }

    document.querySelectorAll('[data-owner-view]').forEach((button) => {
      button.addEventListener('click', () => {
        state.ownerView = String(button.getAttribute('data-owner-view') || 'accounts').trim() || 'accounts';
        syncOwnerView();
      });
    });

    document.querySelectorAll('[data-account-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.accountFilter = String(button.getAttribute('data-account-filter') || 'all').trim() || 'all';
        syncAccountFilters();
        renderList();
      });
    });

    document.querySelectorAll('[data-gym-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.gymFilter = String(button.getAttribute('data-gym-filter') || 'all').trim() || 'all';
        syncGymFilters();
        renderWorkspaceRequests();
      });
    });

    const workspaceList = $('#owner-workspace-requests-list');
    if (workspaceList) {
      workspaceList.addEventListener('click', async (e) => {
        const button = e.target?.closest?.('[data-workspace-action][data-request-id]');
        if (!button) return;
        e.preventDefault();
        await handleWorkspaceRequestAction(
          button.getAttribute('data-workspace-action'),
          button.getAttribute('data-request-id')
        );
      });
    }

    const managerModal = $('#owner-manager-trainers-modal');
    if (managerModal) {
      managerModal.addEventListener('click', (e) => {
        if (e.target === managerModal) closeManagerTrainersModal();
      });
    }
    const managerModalClose = $('#owner-manager-trainers-close');
    if (managerModalClose) {
      managerModalClose.addEventListener('click', closeManagerTrainersModal);
    }
  }

  function autoOpenManagerViewFromQuery() {
    const params = new URLSearchParams(window.location.search || '');
    const mode = String(params.get('managerView') || '').trim().toLowerCase();
    if (mode !== 'trainers') return;
    const managerId = String(params.get('managerId') || state.currentUserId || '').trim();
    if (!managerId) return;
    const target = findAccount(managerId);
    if (!target || target.isManager !== true) return;
    state.ownerView = 'accounts';
    syncOwnerView();
    state.accountFilter = 'manager';
    syncAccountFilters();
    renderList();
    openManagerTrainersModal(managerId);
  }

  async function init() {
    const session = await getOwnerSessionUser();
    if (!session.ok) {
      const wrap = $('#owner-accounts-list');
      if (wrap) wrap.innerHTML = '<div class="owner-accounts-muted">Owner access required.</div>';
      setListCount('');
      return;
    }
    state.currentUserId = String(session.user?.id || '').trim();

    bindEvents();
    window.addEventListener('storage', (event) => {
      if (event.key && event.key.startsWith(OWNER_BADGE_STORAGE_PREFIX)) {
        updateShortcutBadges();
      }
    });
    window.addEventListener('owner-badge-update', updateShortcutBadges);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      refreshOwnerData();
    });
    syncOwnerView();
    syncAccountFilters();
    syncGymFilters();
    updateShortcutBadges();
    if (session.fallback) {
      setStatus('Using cached owner session while auth reconnects.', 'error');
    }
    await refreshOwnerData();
    autoOpenManagerViewFromQuery();
    startLiveRefresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
