(() => {
  const $ = (sel) => document.querySelector(sel);

  const state = {
    currentUser: null,
    accounts: [],
    publicTrainers: [],
    workspaceDirectory: [],
    pendingReviews: [],
    trainerClientsById: {},
    expandedTrainerId: '',
    selectedWorkspaceId: '',
    selectedLocationId: '',
    selectedTrainerIds: new Set(),
    trainerSearchTerm: '',
    workspaceTypeFilter: 'all',
    addTrainerModalOpen: false,
    refreshTimer: null,
    refreshInFlight: false
  };

  const DEFAULT_WORKSPACE_DIRECTORY = [
    {
      id: 'ws-max-fitness-augusta',
      name: 'Max Fitness Augusta',
      logoSrc: '/assets/images/logos/max-fitness-augusta.png',
      logoScale: 0.9,
      logoText: 'MF',
      type: 'Commercial gym',
      city: 'Augusta',
      state: 'GA',
      locations: [
        { id: 'loc-max-fitness-north-augusta', name: 'North Augusta', city: 'Augusta', state: 'GA' }
      ]
    },
    {
      id: 'ws-riseforit-online',
      name: 'RiseForIt Online Coaching',
      logoSrc: '/assets/images/logos/riseforit-online.svg',
      logoScale: 0.84,
      logoText: 'RF',
      type: 'Online coaching company',
      city: 'Remote',
      state: 'US',
      locations: [
        { id: 'loc-riseforit-online', name: 'Remote / Online', city: 'Remote', state: 'US' }
      ]
    },
    {
      id: 'ws-downtown-strength-club',
      name: 'Downtown Strength Club',
      logoSrc: '/assets/images/logos/downtown-strength-club.svg',
      logoScale: 0.84,
      logoText: 'DS',
      type: 'Private training studio',
      city: 'Atlanta',
      state: 'GA',
      locations: [
        { id: 'loc-downtown-main', name: 'Main studio', city: 'Atlanta', state: 'GA' }
      ]
    }
  ];

  function normalizeManagerCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return '';
    if (normalized === 'MAX-ODE') return 'ODEOLOGY';
    return normalized;
  }

  function buildManagerCodeFromContext(manager = null) {
    const source = manager || findManagerAccount() || {};
    const companySeed = String(
      source.workspaceId
      || source.displayName
      || source.username
      || source.email
      || 'manager'
    ).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 5) || 'MGR';
    const contactSeed = String(
      source.locationId
      || source.displayName
      || source.username
      || source.email
      || 'team'
    ).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 3) || 'TEAM';
    return normalizeManagerCode(`${companySeed}-${contactSeed}`);
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

  function resolveStaticAssetUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.replace(/\\/g, '/');
    if (/^(?:https?:)?\/\//i.test(normalized) || normalized.startsWith('data:')) return normalized;
    if (normalized.startsWith('/')) return normalized;
    if (normalized.startsWith('assets/')) return `/${normalized}`;
    return `/${normalized.replace(/^\.?\//, '')}`;
  }

  function fmtDate(raw) {
    if (!raw) return '-';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return '-';
    return d.toLocaleString();
  }

  function trainerCardName(trainer) {
    if (!trainer) return 'Trainer';
    return trainer.trainerDisplayName || trainer.displayName || trainer.username || 'Trainer';
  }

  function trainerCardEmail(trainer) {
    if (!trainer) return '-';
    return trainer.trainerContactEmail || trainer.email || '-';
  }

  function trainerCardSummary(trainer) {
    if (!trainer) return '';
    const bits = [];
    if (trainer.trainerOnboardingComplete) {
      if (trainer.trainerCoachingFormat) bits.push(trainer.trainerCoachingFormat);
      if (trainer.discipline) bits.push(trainer.discipline);
      if (trainer.trainerCity || trainer.trainerState) {
        bits.push(`${trainer.trainerCity || ''}${trainer.trainerCity && trainer.trainerState ? ', ' : ''}${trainer.trainerState || ''}`);
      }
    } else if (trainer.discipline) {
      bits.push(trainer.discipline);
    }
    return bits.filter(Boolean).join(' | ');
  }

  function mapPublicTrainerEntry(item) {
    return {
      id: String(item?.id || '').trim(),
      username: String(item?.username || item?.publicHandle || '').trim() || null,
      email: String(item?.email || '').trim() || null,
      displayName: String(item?.displayName || item?.fullName || item?.username || 'Trainer').trim(),
      trainerDisplayName: String(item?.fullName || item?.displayName || item?.username || 'Trainer').trim(),
      trainerContactEmail: String(item?.email || '').trim() || null,
      trainerCity: String(item?.city || '').trim(),
      trainerState: String(item?.state || '').trim(),
      trainerCoachingFormat: String(item?.coachingFormat || '').trim(),
      trainerProfileUpdatedAt: item?.updatedAt || item?.onboardingCompletedAt || null,
      discipline: String(item?.clientTypes || '').trim() || null,
      isTrainer: true,
      trainerOnboardingComplete: Boolean(item?.onboardingCompletedAt),
      managerCode: String(item?.managerCode || item?.meta?.managerCode || '').trim(),
      workspaceId: String(item?.workspaceId || item?.meta?.workspaceId || '').trim(),
      locationId: String(item?.locationId || item?.meta?.locationId || '').trim(),
      lastSeen: item?.updatedAt || item?.onboardingCompletedAt || null,
      photoDataUrl: String(item?.photoDataUrl || '').trim(),
      summary: String(item?.brandPositioning || '').trim()
    };
  }

  function normalizeLookupText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeWorkspaceDirectoryEntry(workspace) {
    const city = String(workspace?.city || '').trim();
    const stateCode = String(workspace?.state || '').trim();
    return {
      id: String(workspace?.id || '').trim(),
      name: String(workspace?.name || '').trim(),
      logoSrc: resolveStaticAssetUrl(workspace?.logoSrc),
      logoScale: Number(workspace?.logoScale || 1) || 1,
      logoText: String(workspace?.logoText || workspace?.name || '').trim(),
      type: String(workspace?.type || '').trim(),
      city,
      state: stateCode,
      locations: Array.isArray(workspace?.locations)
        ? workspace.locations.map((location) => ({
            id: String(location?.id || '').trim(),
            name: String(location?.name || '').trim(),
            city: String(location?.city || city || '').trim(),
            state: String(location?.state || stateCode || '').trim()
          })).filter((location) => location.id && location.name)
        : []
    };
  }

  function mergeWorkspaceDirectory(base = [], locationRequests = [], accounts = []) {
    const merged = new Map();
    const addWorkspace = (rawWorkspace) => {
      const workspace = normalizeWorkspaceDirectoryEntry(rawWorkspace);
      if (!workspace.id || !workspace.name) return;
      const existing = merged.get(workspace.id);
      if (!existing) {
        merged.set(workspace.id, workspace);
        return;
      }
      existing.name = existing.name || workspace.name;
      existing.logoSrc = existing.logoSrc || workspace.logoSrc;
      existing.logoScale = existing.logoScale || workspace.logoScale || 1;
      existing.logoText = existing.logoText || workspace.logoText;
      existing.type = existing.type || workspace.type;
      existing.city = existing.city || workspace.city;
      existing.state = existing.state || workspace.state;
      const nextLocations = Array.isArray(existing.locations) ? [...existing.locations] : [];
      (workspace.locations || []).forEach((location) => {
        if (nextLocations.some((item) => item.id === location.id || normalizeLookupText(item.name) === normalizeLookupText(location.name))) return;
        nextLocations.push(location);
      });
      existing.locations = nextLocations;
    };
    (Array.isArray(base) ? base : []).forEach(addWorkspace);
    (Array.isArray(locationRequests) ? locationRequests : []).forEach((location) => {
      const parentWorkspaceId = String(location?.parentWorkspaceId || '').trim();
      const target = merged.get(parentWorkspaceId);
      if (!target) return;
      const nextLocation = {
        id: String(location?.id || '').trim(),
        name: String(location?.name || '').trim(),
        city: String(location?.city || target.city || '').trim(),
        state: String(location?.state || target.state || '').trim()
      };
      if (!nextLocation.id || !nextLocation.name) return;
      if ((target.locations || []).some((item) => item.id === nextLocation.id || normalizeLookupText(item.name) === normalizeLookupText(nextLocation.name))) return;
      target.locations = [...(target.locations || []), nextLocation];
    });
    (Array.isArray(accounts) ? accounts : []).forEach((account) => {
      const workspaceId = String(account?.workspaceId || '').trim();
      if (!workspaceId) return;
      addWorkspace({
        id: workspaceId,
        name: workspaceId,
        logoSrc: '',
        logoScale: 1,
        logoText: workspaceId,
        city: String(account?.trainerCity || '').trim(),
        state: String(account?.trainerState || '').trim(),
        locations: account?.locationId ? [{
          id: String(account.locationId || '').trim(),
          name: String(account.locationId || '').trim(),
          city: String(account?.trainerCity || '').trim(),
          state: String(account?.trainerState || '').trim()
        }] : []
      });
    });
    return Array.from(merged.values());
  }

  function workspaceMonogram(workspace) {
    const source = String(workspace?.name || workspace?.workspaceId || workspace?.logoText || 'GYM').trim();
    const tokens = source.split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (tokens.length >= 2) return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }

  function setStatus(text, kind = '') {
    const el = $('#manager-trainers-status');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('error', 'ok');
    if (kind) el.classList.add(kind);
  }

  function applyQueryStatusMessage() {
    const params = new URLSearchParams(window.location.search || '');
    const sent = Number(params.get('sent') || 0);
    if (Number.isFinite(sent) && sent > 0) {
      setStatus(`${sent} trainer request${sent === 1 ? '' : 's'} sent. Trainers can approve them from their Requests tab.`, 'ok');
    }
  }

  function currentManagerId() {
    const qsId = String(new URLSearchParams(window.location.search || '').get('managerId') || '').trim();
    return qsId || String(state.currentUser?.id || '').trim();
  }

  function currentManagerCode() {
    const manager = findManagerAccount();
    return normalizeManagerCode(
      manager?.managerCode
      || state.currentUser?.manager?.managerCode
      || state.currentUser?.managerCode
      || buildManagerCodeFromContext(manager)
    );
  }

  function hasPersistedManagerCode() {
    return Boolean(normalizeManagerCode(
      state.currentUser?.manager?.managerCode
      || state.currentUser?.managerCode
      || ''
    ));
  }

  function findManagerAccount() {
    const managerId = currentManagerId();
    const accountMatch = state.accounts.find((acct) => String(acct.id || '') === managerId) || null;
    if (accountMatch) return accountMatch;
    const currentUserId = String(state.currentUser?.id || '').trim();
    if (!state.currentUser || !managerId || managerId !== currentUserId) return null;
    return {
      id: currentUserId,
      username: state.currentUser.username || null,
      email: state.currentUser.email || null,
      displayName: state.currentUser.displayName || state.currentUser.username || 'Manager',
      trainerDisplayName: state.currentUser.displayName || state.currentUser.username || 'Manager',
      trainerContactEmail: state.currentUser.email || null,
      trainerCity: String(state.currentUser?.manager?.city || state.currentUser?.trainerCity || '').trim(),
      trainerState: String(state.currentUser?.manager?.state || state.currentUser?.trainerState || '').trim(),
      trainerCoachingFormat: '',
      trainerProfileUpdatedAt: null,
      discipline: null,
      isTrainer: false,
      trainerOnboardingComplete: false,
      managerCode: String(state.currentUser?.manager?.managerCode || state.currentUser?.managerCode || '').trim(),
      workspaceId: String(state.currentUser?.manager?.workspaceId || state.currentUser?.workspaceId || '').trim(),
      locationId: String(state.currentUser?.manager?.locationId || state.currentUser?.locationId || '').trim(),
      lastSeen: state.currentUser?.lastSeen || null,
      isManager: Boolean(state.currentUser?.isManager)
    };
  }

  function getManagerTrainerMatches() {
    const manager = findManagerAccount();
    if (!manager) return [];
    const managerCode = String(manager.managerCode || '').trim().toUpperCase();
    const workspaceId = String(manager.workspaceId || '').trim();
    const locationId = String(manager.locationId || '').trim();
    const directMatches = state.accounts.filter((acct) => {
      if (!acct || acct.id === manager.id || acct.isTrainer !== true) return false;
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
    const approvedRequestMatches = (Array.isArray(state.pendingReviews) ? state.pendingReviews : [])
      .filter((request) => {
        const requestManagerCode = normalizeManagerCode(request?.managerCode || '');
        const status = String(request?.status || '').trim().toLowerCase();
        return Boolean(requestManagerCode) && requestManagerCode === normalizeManagerCode(managerCode) && status === 'approved';
      })
      .map((request) => {
        const trainer = request?.trainer && typeof request.trainer === 'object' ? request.trainer : {};
        const trainerUserId = String(request?.trainerUserId || '').trim();
        if (!trainerUserId) return null;
        return {
          id: trainerUserId,
          username: null,
          email: String(trainer?.email || '').trim() || null,
          displayName: String(trainer?.fullName || trainer?.displayName || trainer?.username || 'Trainer').trim(),
          trainerDisplayName: String(trainer?.fullName || trainer?.displayName || trainer?.username || 'Trainer').trim(),
          trainerContactEmail: String(trainer?.email || '').trim() || null,
          trainerCity: String(trainer?.city || '').trim(),
          trainerState: String(trainer?.state || '').trim(),
          trainerCoachingFormat: String(trainer?.coachingStyle || '').trim(),
          trainerProfileUpdatedAt: request?.updatedAt || request?.decidedAt || request?.createdAt || null,
          discipline: Array.isArray(trainer?.specialties) ? trainer.specialties.join(', ') : null,
          isTrainer: true,
          trainerOnboardingComplete: true,
          managerCode: String(request?.managerCode || '').trim(),
          workspaceId: String(trainer?.workspaceId || '').trim(),
          locationId: String(trainer?.locationId || '').trim(),
          lastSeen: request?.updatedAt || request?.decidedAt || request?.createdAt || null,
          isLinkedToManager: true
        };
      })
      .filter(Boolean);
    const merged = new Map();
    [...directMatches, ...approvedRequestMatches].forEach((trainer) => {
      const trainerId = String(trainer?.id || '').trim();
      if (!trainerId) return;
      const current = merged.get(trainerId);
      merged.set(trainerId, current ? { ...trainer, ...current } : trainer);
    });
    return Array.from(merged.values());
  }

  function getTrainerRequestStatusById() {
    const managerCode = currentManagerCode();
    const map = new Map();
    (Array.isArray(state.pendingReviews) ? state.pendingReviews : []).forEach((request) => {
      const trainerUserId = String(request?.trainerUserId || '').trim();
      const requestManagerCode = normalizeManagerCode(request?.managerCode || '');
      if (!trainerUserId || !managerCode || requestManagerCode !== managerCode) return;
      const current = map.get(trainerUserId);
      const nextStatus = String(request?.status || 'pending').trim().toLowerCase();
      if (!current || nextStatus === 'pending') {
        map.set(trainerUserId, request);
      }
    });
    return map;
  }

  function getDiscoverableTrainerMatches() {
    const manager = findManagerAccount();
    if (!manager) return [];
    const linkedIds = new Set(getManagerTrainerMatches().map((acct) => String(acct?.id || '').trim()).filter(Boolean));
    const search = normalizeLookupText(state.trainerSearchTerm);
    const requestByTrainerId = getTrainerRequestStatusById();
    const sourceAccounts = [
      ...(Array.isArray(state.accounts) ? state.accounts : []),
      ...(Array.isArray(state.publicTrainers) ? state.publicTrainers : [])
    ].filter((acct, index, arr) => {
      const id = String(acct?.id || '').trim();
      if (!id) return false;
      return arr.findIndex((item) => String(item?.id || '').trim() === id) === index;
    });
    return sourceAccounts
      .filter((acct) => {
        if (!acct || acct.id === manager.id || acct.isTrainer !== true) return false;
        const accountId = String(acct.id || '').trim();
        if (!accountId) return false;
        const haystack = [
          acct.trainerDisplayName,
          acct.displayName,
          acct.username,
          acct.email,
          acct.trainerContactEmail,
          acct.workspaceId,
          acct.locationId,
          acct.trainerCity,
          acct.trainerState,
          acct.trainerCoachingFormat,
          acct.discipline
        ].map(normalizeLookupText).join(' ');
        if (search && !haystack.includes(search)) return false;
        return true;
      })
      .map((acct) => {
        const accountId = String(acct.id || '').trim();
        return {
          ...acct,
          isLinkedToManager: linkedIds.has(accountId),
          request: requestByTrainerId.get(accountId) || null
        };
      })
      .sort((a, b) => {
        const aLinked = a?.isLinkedToManager ? 1 : 0;
        const bLinked = b?.isLinkedToManager ? 1 : 0;
        if (aLinked !== bLinked) return bLinked - aLinked;
        const aPending = String(a?.request?.status || '').trim().toLowerCase() === 'pending' ? 1 : 0;
        const bPending = String(b?.request?.status || '').trim().toLowerCase() === 'pending' ? 1 : 0;
        if (aPending !== bPending) return bPending - aPending;
        const aWorkspaceMatch = manager.workspaceId && a.workspaceId && manager.workspaceId === a.workspaceId ? 1 : 0;
        const bWorkspaceMatch = manager.workspaceId && b.workspaceId && manager.workspaceId === b.workspaceId ? 1 : 0;
        if (aWorkspaceMatch !== bWorkspaceMatch) return bWorkspaceMatch - aWorkspaceMatch;
        const aLocationMatch = manager.locationId && a.locationId && manager.locationId === a.locationId ? 1 : 0;
        const bLocationMatch = manager.locationId && b.locationId && manager.locationId === b.locationId ? 1 : 0;
        if (aLocationMatch !== bLocationMatch) return bLocationMatch - aLocationMatch;
        return trainerCardName(a).localeCompare(trainerCardName(b));
      });
  }

  function getDiscoverableTrainerMatchesForSelection() {
    const selectedWorkspaceId = String(state.selectedWorkspaceId || '').trim();
    const selectedLocationId = String(state.selectedLocationId || '').trim();
    const search = normalizeLookupText(state.trainerSearchTerm);
    return getDiscoverableTrainerMatches().filter((trainer) => {
      if (selectedWorkspaceId && String(trainer?.workspaceId || '').trim() !== selectedWorkspaceId) return false;
      if (selectedLocationId && String(trainer?.locationId || '').trim() !== selectedLocationId) return false;
      if (!search) return true;
      const haystack = [
        trainer.trainerDisplayName,
        trainer.displayName,
        trainer.username,
        trainer.email,
        trainer.trainerContactEmail
      ].map(normalizeLookupText).join(' ');
      return haystack.includes(search);
    });
  }

  function getDiscoverableWorkspaceOptions() {
    const workspaceDirectory = Array.isArray(state.workspaceDirectory) ? state.workspaceDirectory : [];
    const trainerMatches = getDiscoverableTrainerMatches();
    const typeFilter = String(state.workspaceTypeFilter || 'all').trim().toLowerCase();
    return workspaceDirectory
      .map((workspace) => {
        const workspaceId = String(workspace?.id || '').trim();
        const trainers = trainerMatches.filter((trainer) => String(trainer?.workspaceId || '').trim() === workspaceId);
        return {
          id: workspaceId,
          name: String(workspace?.name || workspaceId || 'Gym').trim(),
          logoSrc: String(workspace?.logoSrc || '').trim(),
          logoScale: Number(workspace?.logoScale || 1) || 1,
          logoText: String(workspace?.logoText || workspace?.name || workspaceId || 'GYM').trim(),
          city: String(workspace?.city || '').trim(),
          state: String(workspace?.state || '').trim(),
          count: trainers.length
        };
      })
      .filter((workspace) => {
        if (!workspace.id || !workspace.name) return false;
        if (typeFilter === 'all') return true;
        return normalizeLookupText(workspace.type) === typeFilter;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getDiscoverableLocationOptions() {
    const selectedWorkspaceId = String(state.selectedWorkspaceId || '').trim();
    if (!selectedWorkspaceId) return [];
    const workspace = (Array.isArray(state.workspaceDirectory) ? state.workspaceDirectory : []).find((item) => String(item?.id || '').trim() === selectedWorkspaceId) || null;
    const trainerMatches = getDiscoverableTrainerMatches().filter((trainer) => String(trainer?.workspaceId || '').trim() === selectedWorkspaceId);
    const workspaceLocations = Array.isArray(workspace?.locations) ? workspace.locations : [];
    return workspaceLocations.map((location) => {
      const locationId = String(location?.id || '').trim();
      const trainers = trainerMatches.filter((trainer) => String(trainer?.locationId || '').trim() === locationId);
      return {
        id: locationId,
        name: String(location?.name || locationId || 'Location').trim(),
        city: String(location?.city || workspace?.city || '').trim(),
        state: String(location?.state || workspace?.state || '').trim(),
        count: trainers.length
      };
    }).filter((location) => location.id && location.name).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getManagerPendingReviews() {
    const managerCode = currentManagerCode();
    if (!managerCode) return [];
    return state.pendingReviews.filter((request) => {
      const requestManagerCode = normalizeManagerCode(request?.managerCode || '');
      const requestedByRole = String(request?.requestedByRole || 'trainer').trim().toLowerCase();
      return requestManagerCode === managerCode && requestedByRole === 'trainer';
    });
  }

  function titleizeStatus(raw, fallback = 'Pending') {
    const value = String(raw || '').trim();
    if (!value) return fallback;
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function renderWorkspaceTypePills() {
    const options = [
      { key: 'all', label: 'All' },
      { key: 'commercial gym', label: 'Commercial gym' },
      { key: 'online coaching company', label: 'Online coaching company' },
      { key: 'private training studio', label: 'Private training studio' }
    ];
    return `
      <div class="manager-discovery-pill-row">
        ${options.map((option) => `
          <button
            class="manager-discovery-filter-pill ${state.workspaceTypeFilter === option.key ? 'is-selected' : ''}"
            type="button"
            data-action="workspace-type-filter"
            data-filter-key="${escapeHtml(option.key)}"
          >${escapeHtml(option.label)}</button>
        `).join('')}
      </div>
    `;
  }

  function renderPendingReviews() {
    const allRequests = getManagerPendingReviews();
    const requests = allRequests.filter((request) => String(request?.status || 'pending').trim().toLowerCase() === 'pending');
    if (!requests.length) {
      return `
        <section class="manager-trainers-section">
          <div class="manager-trainers-section-head">
            <h2>Pending Requests</h2>
            <span class="manager-trainers-pill">0</span>
          </div>
          <div class="manager-trainers-muted">No trainer review requests right now.</div>
        </section>
      `;
    }
    return `
      <section class="manager-trainers-section">
        <div class="manager-trainers-section-head">
          <h2>Pending Requests</h2>
          <span class="manager-trainers-pill">${escapeHtml(String(requests.filter((item) => String(item?.status || 'pending').trim().toLowerCase() === 'pending').length))}</span>
          </div>
          <div class="manager-trainers-grid">
            ${requests.map((request) => {
            const trainer = request?.trainer && typeof request.trainer === 'object' ? request.trainer : {};
            const status = String(request?.status || 'pending').trim().toLowerCase();
            const summaryBits = [
              trainer.trainerType ? `Type: ${trainer.trainerType}` : '',
              trainer.coachingStyle ? `Style: ${trainer.coachingStyle}` : '',
              trainer.city || trainer.state ? `${trainer.city || ''}${trainer.city && trainer.state ? ', ' : ''}${trainer.state || ''}` : '',
              request.managerCompanyName ? `Company: ${request.managerCompanyName}` : ''
            ].filter(Boolean);
            return `
              <article class="manager-trainer-item">
                <div class="manager-trainer-row">
                  <div class="manager-trainer-name">${escapeHtml(trainer.fullName || 'Trainer')}</div>
                  <span class="manager-trainers-pill">${escapeHtml(titleizeStatus(status))}</span>
                </div>
                <div class="manager-trainer-meta">
                  <span>${escapeHtml(trainer.email || trainer.phone || 'No contact info')}</span>
                  ${trainer.workspaceId ? `<span>${escapeHtml(trainer.workspaceId)}</span>` : ''}
                  ${trainer.locationId ? `<span>${escapeHtml(trainer.locationId)}</span>` : ''}
                </div>
                ${summaryBits.length ? `<div class="manager-trainers-muted">${escapeHtml(summaryBits.join(' | '))}</div>` : ''}
                ${trainer.summary ? `<div class="manager-trainers-muted">${escapeHtml(trainer.summary)}</div>` : ''}
                <div class="manager-trainers-muted">Sent ${escapeHtml(fmtDate(request.createdAt))}</div>
                ${status === 'pending' ? `
                  <div class="manager-trainer-actions">
                    <button class="btn btn-ghost" type="button" data-action="manager-review" data-review-action="approve" data-review-id="${escapeHtml(String(request.id || ''))}">Approve</button>
                    <button class="btn btn-ghost" type="button" data-action="manager-review" data-review-action="deny" data-review-id="${escapeHtml(String(request.id || ''))}">Deny</button>
                  </div>
                ` : ''}
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderDiscoverableTrainers() {
    const workspaceOptions = getDiscoverableWorkspaceOptions();
    const locationOptions = getDiscoverableLocationOptions();
    const trainers = getDiscoverableTrainerMatchesForSelection();
    const selectedWorkspace = workspaceOptions.find((workspace) => workspace.id === state.selectedWorkspaceId) || null;
    const selectedLocation = locationOptions.find((location) => location.id === state.selectedLocationId) || null;
    const searchValue = escapeHtml(state.trainerSearchTerm);
    const stageTitle = !state.selectedWorkspaceId
      ? 'Choose your gym/company.'
      : !state.selectedLocationId
        ? 'Choose your location.'
        : 'Choose your trainers.';
    const stageCopy = !state.selectedWorkspaceId
      ? 'Pick the gym/company you manage inside or work around from the saved directory.'
      : !state.selectedLocationId
        ? `Select the ${selectedWorkspace?.name || 'selected gym'} location you manage at.`
        : 'Select one or more trainers underneath that manager location.';
    const stageLabel = !state.selectedWorkspaceId ? 'Gym' : !state.selectedLocationId ? 'Location' : 'Trainers';
    const stageNumber = !state.selectedWorkspaceId ? 1 : !state.selectedLocationId ? 2 : 3;
    const stageTotal = 3;
    const stagePercent = Math.round((stageNumber / stageTotal) * 100);
    const stageMarkup = !state.selectedWorkspaceId
      ? `
        <div class="manager-discovery-search-wrap">
          <input
            id="manager-trainer-search"
            class="manager-discovery-search"
            type="text"
            value="${searchValue}"
            placeholder="Search gyms, studios, or coaching brands"
          >
        </div>
        ${renderWorkspaceTypePills()}
        ${workspaceOptions.length ? `
          <div class="entry-logo-grid">
            ${workspaceOptions.map((workspace) => `
              <button class="entry-logo-card ${state.selectedWorkspaceId === workspace.id ? 'is-selected' : ''}" type="button" data-action="select-workspace" data-workspace-id="${escapeHtml(workspace.id)}">
                <div class="entry-logo-mark">
                  ${workspace.logoSrc
                    ? `<img class="entry-logo-image" src="${escapeHtml(workspace.logoSrc)}" alt="${escapeHtml(workspace.name)} logo" style="transform:scale(${Number(workspace.logoScale || 1)});">`
                    : `<span class="entry-logo-monogram">${escapeHtml(workspaceMonogram(workspace))}</span>`}
                </div>
                <strong>${escapeHtml(workspace.name)}</strong>
                <small>${escapeHtml(`${workspace.count} trainer${workspace.count === 1 ? '' : 's'}`)}</small>
              </button>
            `).join('')}
          </div>
        ` : '<div class="manager-trainers-muted">No gyms with trainers are available right now.</div>'}
        `
        : !state.selectedLocationId
          ? `
          <div class="manager-discovery-step-head manager-discovery-step-head-link">
            <div class="manager-trainers-muted">Selected gym</div>
            <button class="manager-discovery-inline-link" type="button" data-action="reset-workspace">Change gym</button>
          </div>
          <div class="manager-discovery-selection">${escapeHtml(selectedWorkspace?.name || 'Gym')}</div>
          <div class="manager-discovery-step-head manager-discovery-step-head-link">
            <div></div>
            <button class="manager-discovery-inline-link" type="button" data-action="request-location">Add a Location</button>
          </div>
          ${locationOptions.length ? `
            <div class="entry-location-grid entry-location-grid-single">
              ${locationOptions.map((location) => `
                <button class="entry-location-card ${state.selectedLocationId === location.id ? 'is-selected' : ''}" type="button" data-action="select-location" data-location-id="${escapeHtml(location.id)}">
                  <strong>${escapeHtml(location.name)}</strong>
                  <small>${escapeHtml([location.city, location.state].filter(Boolean).join(', ') || location.id || '')}</small>
                  ${location.count ? `<small>${escapeHtml(`${location.count} trainer${location.count === 1 ? '' : 's'}`)}</small>` : ''}
                </button>
              `).join('')}
            </div>
          ` : '<div class="manager-trainers-muted">No saved locations were found for that gym yet.</div>'}
        `
        : `
          <div class="manager-discovery-step-head">
            <div class="manager-trainers-muted">Selected location</div>
            <div class="manager-trainer-actions">
              <button class="btn btn-ghost" type="button" data-action="reset-location">Change location</button>
              <button class="btn btn-ghost" type="button" data-action="reset-workspace">Change gym</button>
            </div>
          </div>
          <div class="manager-discovery-selection">${escapeHtml(selectedWorkspace?.name || 'Gym')} | ${escapeHtml(selectedLocation?.name || 'Location')}</div>
          <div class="manager-trainers-muted">Click trainers to select them, then add them to your request list.</div>
          <div class="manager-discovery-search-wrap">
            <input
              id="manager-trainer-search"
              class="manager-discovery-search"
              type="text"
              value="${searchValue}"
              placeholder="Search trainers by name, username, or email"
            >
          </div>
          <div class="manager-discovery-trainer-stage">
            <div class="manager-discovery-trainer-list">
            ${trainers.length ? trainers.map((trainer) => {
              const status = String(trainer?.request?.status || '').trim().toLowerCase();
              const isLinked = trainer?.isLinkedToManager === true;
              const hasPending = status === 'pending';
              const hasApproved = status === 'approved';
              const hasDenied = status === 'denied';
              const accountId = String(trainer?.id || '').trim();
              const isSelected = state.selectedTrainerIds.has(accountId);
              const monogram = String(trainerCardName(trainer) || 'T').trim().slice(0, 1).toUpperCase();
              return `
                <button
                  class="manager-discovery-trainer-pick ${isSelected ? 'is-selected' : ''} ${isLinked ? 'is-linked' : ''} ${isLinked || hasPending || hasApproved ? 'is-disabled' : ''}"
                  type="button"
                  data-action="toggle-trainer"
                  data-account-id="${escapeHtml(accountId)}"
                  ${isLinked || hasPending || hasApproved ? 'disabled aria-disabled="true"' : ''}
                >
                  <div class="manager-discovery-trainer-avatar">
                    <span class="manager-discovery-trainer-mono">${escapeHtml(monogram)}</span>
                  </div>
                  <div class="manager-discovery-trainer-name">${escapeHtml(trainerCardName(trainer))}</div>
                  <div class="manager-discovery-card-sub">${escapeHtml(isLinked ? 'Already connected' : hasPending ? 'Pending Request' : hasApproved ? 'Approved Elsewhere' : hasDenied ? 'Denied Before' : trainer.username ? `@${trainer.username}` : trainerCardEmail(trainer))}</div>
                </button>
              `;
            }).join('') : '<div class="manager-trainers-muted">No trainers matched that location.</div>'}
            </div>
            <div class="manager-discovery-review-card">
              <strong>Trainer review</strong>
              <p>${escapeHtml(state.selectedTrainerIds.size
                ? `${state.selectedTrainerIds.size} trainer${state.selectedTrainerIds.size === 1 ? '' : 's'} selected for this manager location.`
                : 'Select one or more trainers underneath this location, then send the request.'
              )}</p>
            </div>
            <button class="manager-discovery-submit" type="button" data-action="send-selected-trainers" ${state.selectedTrainerIds.size ? '' : 'disabled'}>Send trainer request${state.selectedTrainerIds.size === 1 ? '' : 's'}</button>
          </div>
        `;
    return `
      <section class="manager-discovery-shell" id="manager-add-trainer-section" data-manager-add-trainer-section="1">
        <div class="manager-discovery-topbar">
          <div class="manager-discovery-nav">
            <button class="manager-discovery-arrow" type="button" data-action="modal-back" aria-label="Back a step">&#8249;</button>
            <button class="manager-discovery-arrow" type="button" data-action="close-add-trainer" aria-label="Close popup">&#8250;</button>
          </div>
          <div class="manager-discovery-path">MANAGER PATH</div>
        </div>
        <div class="manager-discovery-hero">
          <h2>${escapeHtml(stageTitle)}</h2>
          <p>${escapeHtml(stageCopy)}</p>
        </div>
        ${state.selectedLocationId ? '' : `
          <section class="manager-discovery-progress-card">
            <div class="manager-discovery-progress-head">
              <strong>${escapeHtml(stageLabel)}</strong>
              <span>STEP ${stageNumber} OF ${stageTotal} · ${stagePercent}% DONE</span>
            </div>
            <div class="manager-discovery-progress-track"><span style="width:${stagePercent}%;"></span></div>
            <div class="manager-discovery-progress-foot">
              <span>Manager path</span>
              <span>${escapeHtml(stageLabel)}</span>
            </div>
          </section>
        `}
        <div class="manager-discovery-stage">${stageMarkup}</div>
      </section>
    `;
  }

  function syncAddTrainerModal() {
    const modal = $('#manager-add-trainer-modal');
    const body = $('#manager-add-trainer-modal-body');
    if (!modal || !body) return;
    if (!state.addTrainerModalOpen) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('manager-trainers-modal-open');
      body.innerHTML = '';
      return;
    }
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('manager-trainers-modal-open');
    body.innerHTML = renderDiscoverableTrainers();
  }

  function renderTrainerClientsPanel(trainerId) {
    const trainerKey = String(trainerId || '').trim();
    if (!trainerKey) return '';
    const isExpanded = state.expandedTrainerId === trainerKey;
    const cached = state.trainerClientsById[trainerKey];
    let innerHtml = '<div class="manager-trainers-muted">Press Clients to load this trainer\'s clients.</div>';
    if (cached?.loading) {
      innerHtml = '<div class="manager-trainers-muted">Loading clients...</div>';
    } else if (cached?.error) {
      innerHtml = `<div class="manager-trainers-muted">${escapeHtml(cached.error)}</div>`;
    } else if (cached && Array.isArray(cached.clients)) {
      if (!cached.clients.length) {
        innerHtml = '<div class="manager-trainers-muted">This trainer has no clients yet.</div>';
      } else {
        innerHtml = cached.clients.map((client) => `
          <article class="manager-trainer-client-item">
            <div style="font-weight:800;">${escapeHtml(client.displayName || 'Client')}</div>
            <div class="manager-trainer-meta">
              <span>${escapeHtml(client.email || '-')}</span>
              ${client.phone ? `<span>${escapeHtml(client.phone)}</span>` : ''}
              <span>Status: ${escapeHtml(client.status || 'active')}</span>
            </div>
            <div class="manager-trainer-meta">
              <span>Added: ${escapeHtml(fmtDate(client.createdAt))}</span>
              ${client.source ? `<span>Source: ${escapeHtml(client.source)}</span>` : ''}
            </div>
            ${client.notes ? `<div class="manager-trainers-muted">${escapeHtml(client.notes)}</div>` : ''}
          </article>
        `).join('');
      }
    }
    return `<div class="manager-trainer-clients" data-trainer-clients-panel="${escapeHtml(trainerKey)}" ${isExpanded ? '' : 'hidden'}>${innerHtml}</div>`;
  }

  function redirectToTrainerAccount(accountId) {
    const id = String(accountId || '').trim();
    if (!id) return;
    if (!state.currentUser?.isOwner) return;
    const returnTo = encodeURIComponent('/overview.html');
    window.location.href = `/api/auth/owner/impersonate/${encodeURIComponent(id)}?returnTo=${returnTo}`;
  }

  async function detachTrainerAccount(accountId) {
    const trainerId = String(accountId || '').trim();
    if (!trainerId) return;
    const trainer = state.accounts.find((item) => String(item?.id || '') === trainerId) || null;
    const label = trainer?.username ? `@${trainer.username}` : (trainer?.displayName || 'this trainer');
    const ok = window.confirm(`Remove ${label} from this manager? The trainer account will stay active, but it will no longer be attached here.`);
    if (!ok) return;

    setStatus(`Removing ${label} from this manager...`);
    const resp = await api('/api/auth/manager/trainer-detach', {
      method: 'POST',
      body: JSON.stringify({ trainerUserId: trainerId })
    });
    if (!resp.ok || !resp.json?.ok) {
      setStatus(resp.json?.error || 'Failed to remove trainer from this manager.', 'error');
      return;
    }
    if (state.expandedTrainerId === trainerId) state.expandedTrainerId = '';
    delete state.trainerClientsById[trainerId];
    setStatus(`Removed ${label} from this manager.`, 'ok');
    await refreshPageData();
  }

  function renderContext(manager) {
    const titleEl = $('#manager-trainers-title');
    const wrap = $('#manager-trainers-context');
    if (!titleEl || !wrap) return;
    if (!manager) {
      titleEl.textContent = 'Manager Trainers';
      wrap.innerHTML = '';
      return;
    }
    titleEl.textContent = `${manager.displayName || manager.username || 'Manager'} Trainers`;
    const pills = [
      manager.managerCode ? `Manager code: ${manager.managerCode}` : '',
      manager.workspaceId ? `Workspace: ${manager.workspaceId}` : '',
      manager.locationId ? `Location: ${manager.locationId}` : ''
    ].filter(Boolean);
    wrap.innerHTML = pills.map((label) => `<span class="manager-trainers-pill">${escapeHtml(label)}</span>`).join('');
  }

  function renderList() {
    const listEl = $('#manager-trainers-list');
    if (!listEl) return;
    const manager = findManagerAccount();
    renderContext(manager);
    if (!manager) {
      listEl.innerHTML = '<div class="manager-trainers-muted">Manager account not found.</div>';
      return;
    }
    const trainers = getManagerTrainerMatches();
    const trainerHtml = trainers.length
      ? `
        <section class="manager-trainers-section">
          <div class="manager-trainers-section-head">
            <h2>Linked Trainers</h2>
            <span class="manager-trainers-pill">${escapeHtml(String(trainers.length))}</span>
          </div>
          <div class="manager-trainers-grid">
            ${trainers.map((trainer) => `
      <article class="manager-trainer-item">
        <div class="manager-trainer-row">
          <div class="manager-trainer-name">${escapeHtml(trainerCardName(trainer))}</div>
          <span class="manager-trainers-pill">${trainer.trainerOnboardingComplete ? 'Trainer' : 'Finishing Account'}</span>
        </div>
        <div class="manager-trainer-meta">
          <span>${escapeHtml(trainer.username ? `@${trainer.username}` : '(no username)')}</span>
          <span>${escapeHtml(trainerCardEmail(trainer))}</span>
          <span>${escapeHtml(trainerCardSummary(trainer) || (trainer.trainerOnboardingComplete ? 'trainer profile complete' : 'finishing account'))}</span>
          <span>Last seen: ${escapeHtml(fmtDate(trainer.lastSeen))}</span>
        </div>
        ${trainer.trainerOnboardingComplete && trainer.trainerProfileUpdatedAt ? `<div class="manager-trainers-muted">Finalized ${escapeHtml(fmtDate(trainer.trainerProfileUpdatedAt))}</div>` : ''}
        <div class="manager-trainer-meta">
          ${trainer.workspaceId ? `<span>Workspace: ${escapeHtml(trainer.workspaceId)}</span>` : ''}
          ${trainer.locationId ? `<span>Location: ${escapeHtml(trainer.locationId)}</span>` : ''}
        </div>
        <div class="manager-trainer-actions">
          <button class="btn btn-ghost" type="button" data-action="clients" data-account-id="${escapeHtml(trainer.id)}">${state.expandedTrainerId === String(trainer.id) ? 'Hide Clients' : 'Clients'}</button>
          ${state.currentUser?.isOwner ? `<button class="btn btn-ghost" type="button" data-action="peer-account" data-account-id="${escapeHtml(trainer.id)}">Peer Into Your Account</button>` : ''}
          <button class="btn btn-ghost manager-delete-btn" type="button" data-action="detach-account" data-account-id="${escapeHtml(trainer.id)}">Delete</button>
        </div>
        ${renderTrainerClientsPanel(trainer.id)}
      </article>
            `).join('')}
          </div>
        </section>
      `
      : `
        <section class="manager-trainers-section">
          <div class="manager-trainers-section-head">
            <h2>Linked Trainers</h2>
            <span class="manager-trainers-pill">0</span>
          </div>
          <div class="manager-trainers-muted">No trainers are linked underneath this manager yet.</div>
          <div class="manager-trainer-actions">
            <button class="btn btn-primary" type="button" data-action="open-add-trainer">Add a Trainer</button>
          </div>
        </section>
      `;
    listEl.innerHTML = `${renderPendingReviews()}${trainerHtml}`;
    syncAddTrainerModal();
  }

  function focusAddTrainerFlow() {
    state.selectedWorkspaceId = '';
    state.selectedLocationId = '';
    state.selectedTrainerIds = new Set();
    state.trainerSearchTerm = '';
    state.addTrainerModalOpen = true;
    syncAddTrainerModal();
    window.setTimeout(() => {
      const firstWorkspaceButton = document.querySelector('#manager-add-trainer-modal [data-action="select-workspace"]');
      if (firstWorkspaceButton instanceof HTMLButtonElement) firstWorkspaceButton.focus({ preventScroll: true });
    }, 220);
  }

  function closeAddTrainerModal() {
    state.addTrainerModalOpen = false;
    syncAddTrainerModal();
  }

  function buildManagerTrainerRequestPayload(manager, trainers) {
    const trainerList = Array.isArray(trainers) ? trainers : [trainers];
    const resolvedManager = manager || findManagerAccount() || null;
    const resolvedManagerCode = normalizeManagerCode(
      resolvedManager?.managerCode
      || state.currentUser?.manager?.managerCode
      || state.currentUser?.managerCode
      || buildManagerCodeFromContext(resolvedManager)
    );
    const resolvedManagerName = String(
      resolvedManager?.displayName
      || resolvedManager?.username
      || state.currentUser?.displayName
      || state.currentUser?.username
      || 'Manager'
    ).trim();
    const workspaceRecord = (Array.isArray(state.workspaceDirectory) ? state.workspaceDirectory : []).find((item) => {
      return String(item?.id || '').trim() === String(resolvedManager?.workspaceId || '').trim();
    }) || null;
    const resolvedCompanyName = String(
      workspaceRecord?.name
      || resolvedManager?.displayName
      || resolvedManager?.username
      || state.currentUser?.displayName
      || state.currentUser?.username
      || 'Manager'
    ).trim();
    const selectedWorkspaceId = String(state.selectedWorkspaceId || resolvedManager?.workspaceId || '').trim();
    const selectedLocationId = String(state.selectedLocationId || resolvedManager?.locationId || '').trim();
    return {
      managerCode: resolvedManagerCode,
      managerName: resolvedManagerName,
      managerTitle: 'Training Manager',
      managerCompanyName: resolvedCompanyName,
      workspaceId: selectedWorkspaceId,
      locationId: selectedLocationId,
      requests: trainerList.map((trainer) => ({
          trainerUserId: String(trainer?.id || '').trim(),
          trainer: {
            fullName: String(trainer?.trainerDisplayName || trainer?.displayName || trainer?.username || 'Trainer').trim(),
            email: String(trainer?.trainerContactEmail || trainer?.email || '').trim(),
            workspaceId: selectedWorkspaceId || String(trainer?.workspaceId || '').trim(),
            locationId: selectedLocationId || String(trainer?.locationId || '').trim(),
            city: String(trainer?.trainerCity || '').trim(),
            state: String(trainer?.trainerState || '').trim(),
            coachingStyle: String(trainer?.trainerCoachingFormat || '').trim(),
            summary: ''
          }
        }))
    };
  }

  async function updateManagerReview(reviewId, nextStatus) {
    const id = String(reviewId || '').trim();
    const status = String(nextStatus || '').trim().toLowerCase();
    if (!id || !status) return;
    const path = status === 'approve' || status === 'approved'
      ? '/api/auth/manager/review-requests/approve'
      : '/api/auth/manager/review-requests/deny';
    const resp = await api(path, {
      method: 'POST',
      body: JSON.stringify({ requestId: id })
    });
    if (!resp.ok || !resp.json?.ok) {
      setStatus(resp.json?.error || 'Could not update trainer request.', 'error');
      return;
    }
    await refreshPageData();
    renderList();
  }

  async function sendTrainerRequest(accountId) {
    const trainerId = String(accountId || '').trim();
    if (!trainerId) return;
    const manager = findManagerAccount();
    const trainer = [
      ...(Array.isArray(state.accounts) ? state.accounts : []),
      ...(Array.isArray(state.publicTrainers) ? state.publicTrainers : [])
    ].find((item) => String(item?.id || '').trim() === trainerId) || null;
    if (!manager || !trainer) {
      setStatus('Could not find that trainer or manager context.', 'error');
      return;
    }
    setStatus(`Sending request to ${trainerCardName(trainer)}...`);
    const resp = await api('/api/auth/manager/review-requests/send', {
      method: 'POST',
      body: JSON.stringify(buildManagerTrainerRequestPayload(manager, trainer))
    });
    if (!resp.ok || !resp.json?.ok) {
      setStatus(resp.json?.error || 'Could not send trainer request.', 'error');
      return;
    }
    setStatus(`Request sent to ${trainerCardName(trainer)}.`, 'ok');
    await refreshPageData();
    renderList();
  }

  async function sendSelectedTrainerRequests() {
    const manager = findManagerAccount();
    const selectedIds = Array.from(state.selectedTrainerIds);
    const trainerPool = [
      ...(Array.isArray(state.accounts) ? state.accounts : []),
      ...(Array.isArray(state.publicTrainers) ? state.publicTrainers : [])
    ];
    const trainers = selectedIds
      .map((trainerId) => trainerPool.find((item) => String(item?.id || '').trim() === trainerId) || null)
      .filter(Boolean);
    if (!manager) {
      setStatus('Could not find the manager context for this request.', 'error');
      return;
    }
    if (!trainers.length) {
      setStatus('Select at least one valid trainer before sending the request.', 'error');
      return;
    }
    setStatus(`Sending ${trainers.length} trainer request${trainers.length === 1 ? '' : 's'}...`);
    const resp = await api('/api/auth/manager/review-requests/send', {
      method: 'POST',
      body: JSON.stringify(buildManagerTrainerRequestPayload(manager, trainers))
    });
    if (!resp.ok || !resp.json?.ok) {
      setStatus(resp.json?.error || 'Could not send trainer requests.', 'error');
      return;
    }
    state.selectedTrainerIds = new Set();
    state.trainerSearchTerm = '';
    state.selectedWorkspaceId = '';
    state.selectedLocationId = '';
    state.addTrainerModalOpen = false;
    setStatus(`${trainers.length} trainer request${trainers.length === 1 ? '' : 's'} sent.`, 'ok');
    await refreshPageData();
    renderList();
  }

  async function loadTrainerClients(trainerUserId) {
    const trainerId = String(trainerUserId || '').trim();
    if (!trainerId) return;
    state.trainerClientsById[trainerId] = {
      ...(state.trainerClientsById[trainerId] || {}),
      loading: true,
      error: '',
      clients: Array.isArray(state.trainerClientsById[trainerId]?.clients) ? state.trainerClientsById[trainerId].clients : []
    };
    renderList();
    const clientPath = state.currentUser?.isOwner
      ? `/api/auth/owner/trainer-clients?trainerUserId=${encodeURIComponent(trainerId)}`
      : `/api/auth/manager/trainer-clients?trainerUserId=${encodeURIComponent(trainerId)}`;
    const resp = await api(clientPath);
    if (!resp.ok) {
      state.trainerClientsById[trainerId] = {
        loading: false,
        error: resp.json?.error || 'Could not load clients.',
        clients: []
      };
      renderList();
      return;
    }
    state.trainerClientsById[trainerId] = {
      loading: false,
      error: '',
      clients: Array.isArray(resp.json?.clients) ? resp.json.clients : []
    };
    renderList();
  }

  async function toggleTrainerClients(trainerUserId) {
    const trainerId = String(trainerUserId || '').trim();
    if (!trainerId) return;
    if (state.expandedTrainerId === trainerId) {
      state.expandedTrainerId = '';
      renderList();
      return;
    }
    state.expandedTrainerId = trainerId;
    renderList();
    const cached = state.trainerClientsById[trainerId];
    if (!cached || (!cached.loading && !Array.isArray(cached.clients))) {
      await loadTrainerClients(trainerId);
      return;
    }
    if (!cached.loading && !cached.error && Array.isArray(cached.clients)) {
      renderList();
    }
  }

  async function loadAccounts() {
    const accountsPath = state.currentUser?.isOwner
      ? '/api/auth/owner/accounts?limit=10000'
      : '/api/auth/manager/accounts?limit=10000';
    const resp = await api(accountsPath);
    if (!resp.ok) {
      setStatus(resp.json?.error || 'Failed to load trainers.', 'error');
      return false;
    }
    state.accounts = (Array.isArray(resp.json?.accounts) ? resp.json.accounts : []).map((item) => ({
      id: item.id,
      username: item.username || null,
      email: item.email || null,
      displayName: item.displayName || item.username || 'Account',
      trainerDisplayName: item.trainerDisplayName || item.displayName || item.username || 'Account',
      trainerContactEmail: item.trainerContactEmail || item.email || null,
      trainerCity: item.trainerCity || '',
      trainerState: item.trainerState || '',
      trainerCoachingFormat: item.trainerCoachingFormat || '',
      trainerProfileUpdatedAt: item.trainerProfileUpdatedAt || null,
      discipline: item.discipline || null,
      isTrainer: item.isTrainer === true,
      trainerOnboardingComplete: item.trainerOnboardingComplete === true,
      managerCode: String(item.managerCode || '').trim(),
      workspaceId: String(item.workspaceId || '').trim(),
      locationId: String(item.locationId || '').trim(),
      lastSeen: item.lastSeen || null
    }));
    setStatus('');
    renderList();
    return true;
  }

  async function loadPublicTrainerDirectory() {
    const resp = await api('/api/auth/trainers');
    if (!resp.ok) {
      state.publicTrainers = [];
      return false;
    }
    state.publicTrainers = (Array.isArray(resp.json?.trainers) ? resp.json.trainers : [])
      .map(mapPublicTrainerEntry)
      .filter((item) => item.id);
    renderList();
    return true;
  }

  async function loadWorkspaceDirectory() {
    const resp = await api('/api/auth/workspace-requests/public');
    const approvedWorkspaces = Array.isArray(resp.json?.workspaces) ? resp.json.workspaces : [];
    const approvedLocationRequests = Array.isArray(resp.json?.locationRequests) ? resp.json.locationRequests : [];
    state.workspaceDirectory = mergeWorkspaceDirectory(
      [...DEFAULT_WORKSPACE_DIRECTORY, ...approvedWorkspaces],
      approvedLocationRequests,
      state.accounts
    );
    renderList();
  }

  async function refreshPageData() {
    if (state.refreshInFlight) return;
    state.refreshInFlight = true;
    try {
      const managerCode = currentManagerCode();
      if (managerCode && hasPersistedManagerCode()) {
        const reviewResp = await api(`/api/auth/manager/review-requests?managerCode=${encodeURIComponent(managerCode)}`);
        if (reviewResp.ok && reviewResp.json?.ok) {
          state.pendingReviews = Array.isArray(reviewResp.json?.requests) ? reviewResp.json.requests : [];
        } else {
          state.pendingReviews = [];
          if (reviewResp.status && reviewResp.status !== 403) {
            setStatus(reviewResp.json?.error || 'Failed to load manager requests.', 'error');
          }
        }
      } else {
        state.pendingReviews = [];
      }
      await loadAccounts();
      await loadPublicTrainerDirectory();
      await loadWorkspaceDirectory();
    } finally {
      state.refreshInFlight = false;
    }
  }

  function bindEvents() {
    const listEl = $('#manager-trainers-list');
    const modalBody = $('#manager-add-trainer-modal-body');
    const handleActionClick = async (e) => {
      const button = e.target?.closest?.('[data-action="clients"][data-account-id]');
      if (button) {
        e.preventDefault();
        await toggleTrainerClients(button.getAttribute('data-account-id'));
        return;
      }
      const reviewButton = e.target?.closest?.('[data-action="manager-review"][data-review-id][data-review-action]');
      if (reviewButton) {
        e.preventDefault();
        updateManagerReview(
          reviewButton.getAttribute('data-review-id'),
          reviewButton.getAttribute('data-review-action') === 'approve' ? 'approved' : 'denied'
        );
        return;
      }
      const sendRequestButton = e.target?.closest?.('[data-action="send-request"][data-account-id]');
      if (sendRequestButton) {
        e.preventDefault();
        await sendTrainerRequest(sendRequestButton.getAttribute('data-account-id'));
        return;
      }
      const workspaceButton = e.target?.closest?.('[data-action="select-workspace"][data-workspace-id]');
      if (workspaceButton) {
        e.preventDefault();
        state.selectedWorkspaceId = String(workspaceButton.getAttribute('data-workspace-id') || '').trim();
        state.selectedLocationId = '';
        state.selectedTrainerIds = new Set();
        state.trainerSearchTerm = '';
        syncAddTrainerModal();
        return;
      }
      const filterButton = e.target?.closest?.('[data-action="workspace-type-filter"][data-filter-key]');
      if (filterButton) {
        e.preventDefault();
        state.workspaceTypeFilter = String(filterButton.getAttribute('data-filter-key') || 'all').trim().toLowerCase() || 'all';
        state.selectedWorkspaceId = '';
        state.selectedLocationId = '';
        state.selectedTrainerIds = new Set();
        state.trainerSearchTerm = '';
        syncAddTrainerModal();
        return;
      }
      const modalBackButton = e.target?.closest?.('[data-action="modal-back"]');
      if (modalBackButton) {
        e.preventDefault();
        if (state.selectedLocationId) {
          state.selectedLocationId = '';
          state.selectedTrainerIds = new Set();
          state.trainerSearchTerm = '';
          syncAddTrainerModal();
          return;
        }
        if (state.selectedWorkspaceId) {
          state.selectedWorkspaceId = '';
          state.selectedLocationId = '';
          state.selectedTrainerIds = new Set();
          state.trainerSearchTerm = '';
          syncAddTrainerModal();
          return;
        }
        closeAddTrainerModal();
        return;
      }
      const closeAddTrainerButton = e.target?.closest?.('[data-action="close-add-trainer"]');
      if (closeAddTrainerButton) {
        e.preventDefault();
        closeAddTrainerModal();
        return;
      }
      const requestLocationButton = e.target?.closest?.('[data-action="request-location"]');
      if (requestLocationButton) {
        e.preventDefault();
        setStatus('Location request flow not wired yet. Pick an available saved location for now.', 'error');
        return;
      }
      const locationButton = e.target?.closest?.('[data-action="select-location"][data-location-id]');
      if (locationButton) {
        e.preventDefault();
        state.selectedLocationId = String(locationButton.getAttribute('data-location-id') || '').trim();
        state.selectedTrainerIds = new Set();
        state.trainerSearchTerm = '';
        syncAddTrainerModal();
        return;
      }
      const resetWorkspaceButton = e.target?.closest?.('[data-action="reset-workspace"]');
      if (resetWorkspaceButton) {
        e.preventDefault();
        state.selectedWorkspaceId = '';
        state.selectedLocationId = '';
        state.selectedTrainerIds = new Set();
        state.trainerSearchTerm = '';
        syncAddTrainerModal();
        return;
      }
      const resetLocationButton = e.target?.closest?.('[data-action="reset-location"]');
      if (resetLocationButton) {
        e.preventDefault();
        state.selectedLocationId = '';
        state.selectedTrainerIds = new Set();
        state.trainerSearchTerm = '';
        syncAddTrainerModal();
        return;
      }
      const toggleTrainerButton = e.target?.closest?.('[data-action="toggle-trainer"][data-account-id]');
      if (toggleTrainerButton) {
        e.preventDefault();
        if (toggleTrainerButton.hasAttribute('disabled')) return;
        const accountId = String(toggleTrainerButton.getAttribute('data-account-id') || '').trim();
        const nextSelected = new Set(state.selectedTrainerIds);
        if (nextSelected.has(accountId)) nextSelected.delete(accountId);
        else nextSelected.add(accountId);
        state.selectedTrainerIds = nextSelected;
        syncAddTrainerModal();
        return;
      }
      const sendSelectedButton = e.target?.closest?.('[data-action="send-selected-trainers"]');
      if (sendSelectedButton) {
        e.preventDefault();
        await sendSelectedTrainerRequests();
        return;
      }
      const openAddTrainerButton = e.target?.closest?.('[data-action="open-add-trainer"]');
      if (openAddTrainerButton) {
        e.preventDefault();
        focusAddTrainerFlow();
        return;
      }
      const peerButton = e.target?.closest?.('[data-action="peer-account"][data-account-id]');
      if (peerButton) {
        e.preventDefault();
        redirectToTrainerAccount(peerButton.getAttribute('data-account-id'));
        return;
      }
      const deleteButton = e.target?.closest?.('[data-action="detach-account"][data-account-id]');
      if (!deleteButton) return;
      e.preventDefault();
      await detachTrainerAccount(deleteButton.getAttribute('data-account-id'));
    };
    if (listEl) {
      listEl.addEventListener('click', handleActionClick);
    }
    modalBody?.addEventListener('click', handleActionClick);
    const handleInput = (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.id !== 'manager-trainer-search') return;
      state.trainerSearchTerm = String(target.value || '');
      syncAddTrainerModal();
    };
    listEl?.addEventListener('input', handleInput);
    modalBody?.addEventListener('input', handleInput);
    document.getElementById('manager-add-trainer-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      focusAddTrainerFlow();
    });
    $('#manager-add-trainer-close')?.addEventListener('click', closeAddTrainerModal);
    $('#manager-add-trainer-backdrop')?.addEventListener('click', closeAddTrainerModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.addTrainerModalOpen) closeAddTrainerModal();
    });
  }

  function startRefreshLoop() {
    stopRefreshLoop();
    state.refreshTimer = window.setInterval(() => {
      if (document.hidden) return;
      refreshPageData();
    }, 4000);
  }

  function stopRefreshLoop() {
    if (!state.refreshTimer) return;
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }

  async function init() {
    const me = await api('/api/auth/me');
    const meUser = me.json?.user || null;
    if (!me.ok || (!meUser?.isOwner && !meUser?.isManager)) {
      setStatus('Manager access required.', 'error');
      const listEl = $('#manager-trainers-list');
      if (listEl) listEl.innerHTML = '<div class="manager-trainers-muted">Manager access required.</div>';
      return;
    }
    state.currentUser = meUser;
    bindEvents();
    applyQueryStatusMessage();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      void refreshPageData();
    });
    await refreshPageData();
    startRefreshLoop();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
