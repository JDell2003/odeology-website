(() => {
  const $ = (sel) => document.querySelector(sel);
  const MANAGER_ENTRY_KEY = 'ode_manager_entry_prefill_v1';
  const TRAINER_MANAGER_REVIEW_KEY = 'ode_trainer_manager_reviews_v1';
  const MANAGER_DIRECTORY_KEY = 'ode_manager_directory_v1';
  const TEST_MANAGER_DIRECTORY_KEY = 'ode_test_manager_directory_v1';
  const TEST_WORKSPACE_DIRECTORY_KEY = 'ode_test_workspace_directory_v1';
  const LEAD_STAGES = [
    'New Lead',
    'Contacted',
    'Qualified',
    'Appointment Booked',
    'Showed',
    'Offer Sent',
    'Won',
    'Lost',
    'Waitlist'
  ];
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
  const DEFAULT_MANAGER_DIRECTORY = [
    {
      code: 'ODEOLOGY',
      companyName: 'Max Fitness Augusta',
      workspaceType: 'Training manager',
      workspaceId: 'ws-max-fitness-augusta',
      managerName: 'ODeology_',
      managerTitle: 'Trainer / Training Director',
      managerEmail: 'jason.odell202@gmail.com',
      managerPhone: '',
      city: 'Augusta',
      state: 'GA',
      locationName: 'North Augusta',
      locationId: 'loc-max-fitness-north-augusta'
    }
  ];

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

  function escapeHtml(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeHandle(raw) {
    return String(raw || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .slice(0, 80);
  }

  function buildTrainerProfileHref(handleRaw) {
    const handle = normalizeHandle(handleRaw);
    return handle
      ? `trainer-profile.html?trainer=${encodeURIComponent(handle)}`
      : 'trainer-profile.html?trainer=averystone';
  }

  function isOwnerTechUser(user) {
    return Boolean(user?.isOwner && (user?.isTech || user?.tech?.active));
  }

  function resolveTrainerPageHref(user, data) {
    const trainer = data?.trainer || {};
    const publicHandle = normalizeHandle(
      trainer?.publicHandle
      || trainer?.meta?.publicHandle
      || trainer?.username
      || user?.username
      || user?.displayName
    );
    if (trainer?.onboarded && publicHandle) return buildTrainerProfileHref(publicHandle);
    if (data?.isTrainer) return 'trainers.html#onboarding';
    return 'coaches.html';
  }

  function bindTrainerPageChooser(user, data) {
    const trigger = $('#trainer-dashboard-view-coaches');
    const modal = $('#trainer-dashboard-choice-modal');
    const backdrop = $('#trainer-dashboard-choice-backdrop');
    const closeBtn = $('#trainer-dashboard-choice-close');
    const ownOption = $('#trainer-dashboard-own-option');
    const demoOption = $('#trainer-dashboard-demo-option');
    if (!(trigger instanceof HTMLAnchorElement) || !modal || !ownOption || !demoOption) return;

    const trainer = data?.trainer || {};
    const canChoose = isOwnerTechUser(user);
    const publicHandle = normalizeHandle(
      trainer?.publicHandle
      || trainer?.meta?.publicHandle
      || trainer?.username
      || user?.username
      || user?.displayName
    );
    const hasTrainerPage = Boolean(trainer?.onboarded && publicHandle);
    const directHref = resolveTrainerPageHref(user, data);

    trigger.href = directHref;

    demoOption.href = 'trainer-profile.html?trainer=averystone';
    ownOption.href = hasTrainerPage ? buildTrainerProfileHref(publicHandle) : 'trainers.html#onboarding';
    const ownTitleEl = ownOption.querySelector('.trainer-dashboard-choice-option-title');
    const ownCopyEl = ownOption.querySelector('.trainer-dashboard-choice-option-copy');
    if (ownTitleEl) ownTitleEl.textContent = hasTrainerPage
      ? `@${publicHandle}`
      : 'Make a Trainer Page';
    if (ownCopyEl) ownCopyEl.textContent = hasTrainerPage
      ? 'Open your trainer page.'
      : 'Start your own trainer page from onboarding.';

    const open = () => {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('trainer-dashboard-choice-open');
    };
    const close = () => {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('trainer-dashboard-choice-open');
    };

    trigger.addEventListener('click', (event) => {
      if (!canChoose) return;
      event.preventDefault();
      open();
    });

    [backdrop, closeBtn].forEach((node) => {
      node?.addEventListener('click', close);
    });
    modal.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#trainer-dashboard-demo-option, #trainer-dashboard-own-option')) {
        close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });
  }

  function formatMoney(centsRaw) {
    const cents = Number(centsRaw || 0);
    return `$${(cents / 100).toFixed(2)}`;
  }

  function buildAppInviteMessage(inviteCenter, trainerName) {
    const code = String(inviteCenter?.referralCode || '').trim();
    const link = String(inviteCenter?.referralLink || '').trim();
    return [
      `${trainerName} invited you to try the platform.`,
      '',
      code ? `Use code: ${code}` : '',
      link ? `Join here: ${link}` : ''
    ].filter(Boolean).join('\n');
  }

  async function trackTrainerEvent(eventType, metadata = {}) {
    return await api('/api/auth/trainer/event', {
      method: 'POST',
      body: JSON.stringify({
        eventType,
        metadata
      })
    });
  }

  function renderEmpty(message) {
    return `<div class="account-trainer-empty">${escapeHtml(message)}</div>`;
  }

  function formatShortDate(raw) {
    if (!raw) return '';
    const value = new Date(raw);
    if (Number.isNaN(value.getTime())) return '';
    return value.toLocaleDateString();
  }

  function normalizeLookupText(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function disambiguateManagerNames(managers = []) {
    const counts = new Map();
    managers.forEach((manager) => {
      const key = [
        normalizeLookupText(manager?.workspaceId),
        normalizeLookupText(manager?.locationId),
        normalizeLookupText(manager?.managerName)
      ].join('|');
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return managers.map((manager) => {
      const key = [
        normalizeLookupText(manager?.workspaceId),
        normalizeLookupText(manager?.locationId),
        normalizeLookupText(manager?.managerName)
      ].join('|');
      if ((counts.get(key) || 0) <= 1) return manager;
      const suffix = String(manager?.username || manager?.managerCode || manager?.code || '').trim();
      return {
        ...manager,
        managerName: suffix ? `${manager.managerName} (${suffix.startsWith('@') ? suffix : `@${suffix}`})` : manager.managerName
      };
    });
  }

  function resolveStaticAssetUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    const normalized = raw.replace(/\\/g, '/');
    if (normalized.startsWith('/')) return normalized;
    if (normalized.startsWith('assets/')) return `/${normalized}`;
    return normalized;
  }

  function readTestWorkspaces() {
    try {
      const raw = localStorage.getItem(TEST_WORKSPACE_DIRECTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function readTestManagers() {
    try {
      const raw = localStorage.getItem(TEST_MANAGER_DIRECTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function readManagerDirectoryLocal() {
    try {
      const raw = localStorage.getItem(MANAGER_DIRECTORY_KEY);
      const testManagers = readTestManagers();
      if (!raw) {
        return [...testManagers, ...DEFAULT_MANAGER_DIRECTORY];
      }
      const parsed = JSON.parse(raw);
      const saved = Array.isArray(parsed) ? parsed : [];
      return [...testManagers, ...saved, ...DEFAULT_MANAGER_DIRECTORY]
        .map((entry) => entry && typeof entry === 'object'
          ? {
              ...entry,
              code: normalizeManagerCode(entry.code || ''),
              ...(normalizeManagerCode(entry.code || '') === 'ODEOLOGY'
                ? {
                    companyName: 'Max Fitness Augusta',
                    workspaceId: 'ws-max-fitness-augusta',
                    city: 'Augusta',
                    state: 'GA',
                    locationName: 'North Augusta',
                    locationId: 'loc-max-fitness-north-augusta'
                  }
                : {})
            }
          : entry)
        .filter((entry, index, arr) => arr.findIndex((item) => normalizeManagerCode(item?.code || '') === normalizeManagerCode(entry?.code || '')) === index);
    } catch {
      return [...readTestManagers(), ...DEFAULT_MANAGER_DIRECTORY];
    }
  }

  function workspaceDirectorySource() {
    const injected = Array.isArray(window.__ODE_WORKSPACE_DIRECTORY__) ? window.__ODE_WORKSPACE_DIRECTORY__ : null;
    return injected?.length ? injected : DEFAULT_WORKSPACE_DIRECTORY;
  }

  function normalizeWorkspaceDirectoryEntry(workspace) {
    const city = String(workspace?.city || '').trim();
    const state = String(workspace?.state || '').trim();
    return {
      id: String(workspace?.id || '').trim(),
      name: String(workspace?.name || '').trim(),
      logoSrc: resolveStaticAssetUrl(workspace?.logoSrc),
      logoScale: Number(workspace?.logoScale || 1) || 1,
      logoText: String(workspace?.logoText || workspace?.name || '').trim(),
      type: String(workspace?.type || '').trim(),
      city,
      state,
      locations: Array.isArray(workspace?.locations)
        ? workspace.locations.map((location) => ({
            id: String(location?.id || '').trim(),
            name: String(location?.name || '').trim(),
            city: String(location?.city || city || '').trim(),
            state: String(location?.state || state || '').trim()
          })).filter((location) => location.id && location.name)
        : []
    };
  }

  function mergeWorkspaceDirectory(base = [], extra = [], locationRequests = []) {
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
    [...base, ...extra].forEach(addWorkspace);
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
    return Array.from(merged.values());
  }

  function formatRelativeTime(raw) {
    if (!raw) return 'Just now';
    const value = new Date(raw);
    if (Number.isNaN(value.getTime())) return 'Just now';
    const diffMs = Date.now() - value.getTime();
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatShortDate(raw) || 'Recently';
  }

  function formatDurationCompact(msRaw) {
    const totalMs = Number(msRaw || 0);
    if (!Number.isFinite(totalMs) || totalMs <= 0) return '';
    const totalMinutes = Math.max(1, Math.round(totalMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }

  function buildTrainerClientAccountHref(userId, returnTo = '/account.html') {
    const id = String(userId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return '';
    const dest = String(returnTo || '/account.html');
    const safeDest = dest.startsWith('/') ? dest : '/account.html';
    return `/api/auth/trainer/impersonate/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(safeDest)}`;
  }

  // Small confirm dialog used before a destructive "rebuild plan" action.
  function openPlanEraseConfirm({ title, body, confirmLabel = 'Confirm', onConfirm } = {}) {
    document.getElementById('plan-erase-modal')?.remove();
    if (!document.getElementById('plan-erase-modal-styles')) {
      const st = document.createElement('style');
      st.id = 'plan-erase-modal-styles';
      st.textContent = [
        '.plan-erase-backdrop{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;',
        '  padding:20px;background:rgba(20,12,4,.55);backdrop-filter:blur(3px);animation:planEraseFade .16s ease;}',
        '@keyframes planEraseFade{from{opacity:0}to{opacity:1}}',
        '.plan-erase-card{width:min(440px,100%);background:#fffdf7;border:1px solid rgba(185,138,43,.4);border-radius:18px;',
        '  padding:22px 22px 18px;box-shadow:0 30px 70px rgba(60,40,10,.32);}',
        ':root[data-theme="dark"] .plan-erase-card{background:#241d13;border-color:rgba(255,255,255,.14);color:#f4ecdd;}',
        '.plan-erase-card .pe-icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:22px;',
        '  background:rgba(180,40,40,.12);color:#b42828;margin-bottom:12px;}',
        '.plan-erase-card h3{margin:0 0 8px;font:800 18px/1.25 "Space Grotesk",system-ui,sans-serif;}',
        '.plan-erase-card p{margin:0 0 18px;font-size:14px;line-height:1.55;opacity:.82;}',
        '.plan-erase-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}',
        '.plan-erase-actions button{font:800 13px/1 "Space Grotesk",system-ui,sans-serif;padding:11px 16px;border-radius:11px;cursor:pointer;border:1px solid transparent;}',
        '.pe-cancel{background:transparent;border-color:rgba(150,110,35,.35);color:#7a5312;}',
        '.pe-confirm{background:#b42828;color:#fff;}',
        '.pe-confirm:hover{background:#9c2020;}',
        '@media (max-width:520px){.plan-erase-actions button{flex:1 1 auto;}}'
      ].join('\n');
      document.head.appendChild(st);
    }
    const back = document.createElement('div');
    back.className = 'plan-erase-backdrop';
    back.id = 'plan-erase-modal';
    back.innerHTML = `
      <div class="plan-erase-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Confirm')}">
        <div class="pe-icon" aria-hidden="true">&#9888;</div>
        <h3>${escapeHtml(title || 'Are you sure?')}</h3>
        <p>${escapeHtml(body || '')}</p>
        <div class="plan-erase-actions">
          <button type="button" class="pe-cancel" data-pe-cancel>Keep it</button>
          <button type="button" class="pe-confirm" data-pe-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    const close = () => back.remove();
    back.addEventListener('click', (ev) => {
      if (ev.target === back || ev.target.closest('[data-pe-cancel]')) { close(); return; }
      if (ev.target.closest('[data-pe-confirm]')) { close(); if (typeof onConfirm === 'function') onConfirm(); }
    });
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(back);
  }

  function titleizeStatus(raw, fallback = 'Pending') {
    const value = String(raw || '').trim();
    if (!value) return fallback;
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function normalizeManagerCode(raw) {
    const normalized = String(raw || '').trim().toUpperCase();
    if (!normalized) return '';
    return normalized === 'MAX-ODE' ? 'ODEOLOGY' : normalized;
  }

  function workspaceMonogram(workspace) {
    const source = String(workspace?.companyName || workspace?.workspaceId || workspace?.name || 'GYM').trim();
    const tokens = source.split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (tokens.length >= 2) return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }

  function getManagerWorkspaceKey(manager, workspaceDirectory = []) {
    const workspaceId = String(manager?.workspaceId || '').trim();
    if (!workspaceId) return '';
    const companyName = String(manager?.companyName || '').trim();
    const matchedWorkspace = (Array.isArray(workspaceDirectory) ? workspaceDirectory : []).find((workspace) => {
      if (String(workspace?.id || '').trim() === workspaceId) return true;
      if (!companyName) return false;
      return normalizeLookupText(workspace?.name) === normalizeLookupText(companyName);
    }) || null;
    return String(matchedWorkspace?.id || workspaceId).trim();
  }

  function getManagerWorkspaceView(manager, workspaceDirectory = []) {
    const workspaces = Array.isArray(workspaceDirectory) ? workspaceDirectory : [];
    const workspaceId = String(manager?.workspaceId || '').trim();
    const companyName = String(manager?.companyName || '').trim();
    const matchedWorkspace = workspaces.find((workspace) => {
      if (String(workspace?.id || '').trim() === workspaceId) return true;
      if (!companyName) return false;
      return normalizeLookupText(workspace?.name) === normalizeLookupText(companyName);
    }) || null;
    if (matchedWorkspace) return matchedWorkspace;
    return normalizeWorkspaceDirectoryEntry({
      id: workspaceId || companyName || 'workspace',
      name: companyName || workspaceId || manager?.managerName || 'Gym',
      logoSrc: '',
      logoScale: 1,
      logoText: companyName || workspaceId || manager?.managerName || 'GYM',
      city: String(manager?.city || '').trim(),
      state: String(manager?.state || '').trim(),
      locations: []
    });
  }

  function renderMetricCard(label, value, copy = '') {
    return `
      <div class="account-trainer-metric-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
        ${copy ? `<small>${escapeHtml(copy)}</small>` : ''}
      </div>
    `;
  }

  function formatCompactMoney(centsRaw) {
    const amount = Number(centsRaw || 0) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return '$0';
    if (Math.abs(amount - Math.round(amount)) < 0.001) return `$${Math.round(amount)}`;
    return `$${amount.toFixed(2)}`;
  }

  function formatClientAmountPill(client) {
    const cents = Number(client?.packagePriceCents || client?.revenueCents || 0);
    const frequency = String(client?.billingFrequency || '').trim().toLowerCase();
    if (cents > 0) {
      if (frequency === 'monthly') return `${formatCompactMoney(cents)}/mo`;
      if (frequency === 'custom_recurring') return `${formatCompactMoney(cents)} recurring`;
      if (frequency === 'one_time') return `${formatCompactMoney(cents)} one-time`;
      return formatCompactMoney(cents);
    }
    return String(client?.source || '').toLowerCase() === 'manual' ? 'Manual' : titleizeStatus(client?.paymentStatus, 'Pending');
  }

  // Map a payment status to a color tone + friendly label.
  function paymentTone(status) {
    const s = String(status || '').trim().toLowerCase();
    if (['active', 'live', 'paid', 'current'].includes(s)) return { cls: 'ok', label: 'Payment live' };
    if (['past_due', 'declined', 'failed', 'unpaid'].includes(s)) return { cls: 'bad', label: 'Payment declined' };
    if (['paused', 'canceled', 'cancelled', 'on_hold'].includes(s)) return { cls: 'warn', label: 'Paused' };
    return { cls: 'muted', label: titleizeStatus(status, 'Pending') };
  }

  function renderClientRoster(clientRoster) {
    if (!Array.isArray(clientRoster) || !clientRoster.length) {
      return renderEmpty('No trainer clients yet. When someone becomes a paying client — or you move a consult hit over — they show up here.');
    }
    return `
      <div class="client-grid">
        ${clientRoster.map((client) => {
          const uid = String(client.linkedUserId || '').trim();
          const name = String(client.name || 'Client').trim();
          const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
          const pay = paymentTone(client.paymentStatus);
          const workout = !!client.hasWorkoutPlan;
          const nutrition = !!client.hasNutritionPlan;
          return `
          <article class="client-card" data-client-uid="${escapeHtml(uid)}">
            <div class="client-card-top">
              <div class="client-avatar" aria-hidden="true">${escapeHtml(initials || 'C')}</div>
              <div class="client-id">
                <div class="client-name">${escapeHtml(name)}</div>
                <div class="client-email">${escapeHtml(client.email || 'No email attached yet')}</div>
              </div>
              <span class="client-pay client-pay-${pay.cls}">${escapeHtml(pay.label)}</span>
            </div>
            <div class="client-status-row">
              <span class="client-stat ${workout ? 'on' : 'off'}">${workout ? '&#10003;' : '&#9675;'} Workout plan</span>
              <span class="client-stat ${nutrition ? 'on' : 'off'}">${nutrition ? '&#10003;' : '&#9675;'} Nutrition plan</span>
              ${client.workedOutToday ? '<span class="client-stat on">&#10003; Trained today</span>' : ''}
              ${client.joinedAt ? `<span class="client-since">Since ${escapeHtml(formatShortDate(client.joinedAt))}</span>` : ''}
            </div>
            <div class="client-actions">
              ${uid ? `<button type="button" class="client-btn primary" data-view-client-account="${escapeHtml(uid)}">Peer into account</button>` : ''}
              ${uid ? `
              <div class="client-plan-group">
                <span class="client-plan-tag">Training</span>
                ${workout ? `<button type="button" class="client-btn" data-client-plan="training" data-plan-mode="modify" data-client-has="1" data-client-uid="${escapeHtml(uid)}" data-client-name="${escapeHtml(name)}">Modify training</button>` : ''}
                <button type="button" class="client-btn${workout ? ' ghost' : ''}" data-client-plan="training" data-plan-mode="add" data-client-has="${workout ? '1' : '0'}" data-client-uid="${escapeHtml(uid)}" data-client-name="${escapeHtml(name)}">${workout ? 'Redo training' : 'Add training'}</button>
                <button type="button" class="client-btn ghost" data-client-doc="training" data-client-has="${workout ? '1' : '0'}" data-client-uid="${escapeHtml(uid)}" data-client-name="${escapeHtml(name)}">Send PDF</button>
              </div>
              <div class="client-plan-group">
                <span class="client-plan-tag">Nutrition</span>
                ${nutrition ? `<button type="button" class="client-btn" data-client-plan="nutrition" data-plan-mode="modify" data-client-has="1" data-client-uid="${escapeHtml(uid)}" data-client-name="${escapeHtml(name)}">Modify nutrition</button>` : ''}
                <button type="button" class="client-btn${nutrition ? ' ghost' : ''}" data-client-plan="nutrition" data-plan-mode="add" data-client-has="${nutrition ? '1' : '0'}" data-client-uid="${escapeHtml(uid)}" data-client-name="${escapeHtml(name)}">${nutrition ? 'Redo nutrition' : 'Add nutrition'}</button>
                <button type="button" class="client-btn ghost" data-client-doc="nutrition" data-client-has="${nutrition ? '1' : '0'}" data-client-uid="${escapeHtml(uid)}" data-client-name="${escapeHtml(name)}">Send PDF</button>
              </div>` : ''}
            </div>
          </article>`;
        }).join('')}
      </div>
      <input type="file" id="client-doc-input" accept="application/pdf" hidden>
    `;
  }

  function buildClientActionFeed(trainingRequests, actions, clientRoster, pendingWorkoutApprovals) {
    const rosterByUserId = new Map(
      (Array.isArray(clientRoster) ? clientRoster : [])
        .map((client) => [String(client?.linkedUserId || '').trim(), client])
        .filter(([id]) => id)
    );
    const pendingActions = (Array.isArray(trainingRequests) ? trainingRequests : []).map((request) => ({
      type: 'approval',
      tone: 'needs-action',
      title: `Approve ${request.applicantName || 'client'} as a client`,
      detail: request?.requestPayload?.goal
        ? `Goal: ${request.requestPayload.goal}`
        : 'A new client request is waiting for approval.',
      occurredAt: request.createdAt || new Date().toISOString(),
      actionLabel: 'Approve client',
      actionKind: 'approve-client',
      requestId: String(request.id || ''),
      linkedUserId: String(request.applicantUserId || '').trim() || null,
      clientName: request.applicantName || 'Client'
    }));
    const healthActions = (Array.isArray(actions) ? actions : []).map((action) => ({
      ...action,
      linkedUserId: String(action?.linkedUserId || '').trim() || null,
      clientName: action?.clientName || rosterByUserId.get(String(action?.linkedUserId || '').trim())?.name || 'Client'
    }));
    const workoutActions = (Array.isArray(pendingWorkoutApprovals) ? pendingWorkoutApprovals : []).map((workout) => ({
      type: 'workout-approval',
      tone: 'needs-action',
      title: `Approve ${workout?.clientName || 'client'} workout`,
      detail: `Week ${Number(workout?.weekIndex || 0) || '?'} • Day ${Number(workout?.dayIndex || 0) || '?'}${formatDurationCompact(workout?.durationMs) ? ` • ${formatDurationCompact(workout.durationMs)}` : ''}`,
      occurredAt: workout?.performedAt || workout?.updatedAt || new Date().toISOString(),
      actionLabel: 'Approve workout',
      actionKind: 'approve-workout',
      workoutId: String(workout?.workoutId || ''),
      linkedUserId: String(workout?.clientUserId || '').trim() || null,
      clientName: workout?.clientName || 'Client'
    }));
    return [...pendingActions, ...workoutActions, ...healthActions]
      .sort((a, b) => new Date(b?.occurredAt || 0).getTime() - new Date(a?.occurredAt || 0).getTime());
  }

  function getIncomingManagerRequests(requests) {
    return (Array.isArray(requests) ? requests : [])
      .filter((request) => {
        const status = String(request?.status || '').trim().toLowerCase();
        const requestedByRole = String(request?.requestedByRole || 'trainer').trim().toLowerCase();
        return requestedByRole === 'manager' && status === 'pending';
      })
      .sort((a, b) => {
        return new Date(b?.updatedAt || b?.decidedAt || b?.createdAt || 0).getTime()
          - new Date(a?.updatedAt || a?.decidedAt || a?.createdAt || 0).getTime();
      });
  }

  function renderTrainerActionFeed(items) {
    if (!Array.isArray(items) || !items.length) {
      return renderEmpty('No client actions right now.');
    }
    return `
      <div class="account-trainer-action-feed">
        ${items.map((item) => `
          <article class="account-trainer-action-card tone-${escapeHtml(item.tone || 'neutral')}">
            <div class="account-trainer-action-head">
              <div>
                <div class="account-trainer-action-title">${escapeHtml(item.title || 'Client update')}</div>
                <div class="account-trainer-action-detail">${escapeHtml(item.detail || 'No details available.')}</div>
              </div>
              <span class="account-trainer-roster-pill">${escapeHtml(formatRelativeTime(item.occurredAt))}</span>
            </div>
            <div class="account-trainer-action-foot">
              <span class="account-trainer-roster-pill">${escapeHtml(item.clientName || 'Client')}</span>
              ${item.actionKind === 'approve-client' && item.requestId ? `<button type="button" class="account-trainer-btn" data-training-request-action="approve" data-request-id="${escapeHtml(String(item.requestId || ''))}">Quick approve</button>` : ''}
              ${item.actionKind === 'approve-workout' && item.workoutId ? `<button type="button" class="account-trainer-btn" data-workout-review-approve="${escapeHtml(String(item.workoutId || ''))}">Approve workout</button>` : ''}
              ${item.actionKind === 'approve-workout' && item.workoutId ? `<button type="button" class="account-trainer-btn ghost" data-workout-review-pdf="${escapeHtml(String(item.workoutId || ''))}">View PDF</button>` : ''}
              ${item.actionKind === 'view-client' && item.linkedUserId ? `<button type="button" class="account-trainer-btn ghost" data-view-client-account="${escapeHtml(String(item.linkedUserId || ''))}">Open account</button>` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderIncomingManagerRequests(items) {
    if (!Array.isArray(items) || !items.length) {
      return renderEmpty('No manager requests are waiting right now.');
    }
    return `
      <div class="account-trainer-roster">
        ${items.map((request) => {
          const status = String(request?.status || 'pending').trim().toLowerCase();
          const trainer = request?.trainer && typeof request.trainer === 'object' ? request.trainer : {};
          const createdLabel = formatShortDate(request?.createdAt) || 'Today';
          const companyLabel = String(request?.managerCompanyName || '').trim();
          const titleLabel = String(request?.managerTitle || '').trim();
          const locationLabel = String(trainer?.locationId || '').trim();
          return `
            <article class="account-trainer-roster-card">
              <div class="account-trainer-roster-head">
                <div>
                  <div class="account-trainer-roster-name">${escapeHtml(request?.managerName || request?.managerCompanyName || request?.managerCode || 'Manager')}</div>
                  <div class="account-trainer-roster-sub">${escapeHtml(request?.managerCode || 'Manager request')}</div>
                </div>
                <span class="account-trainer-roster-pill amount">${escapeHtml(titleizeStatus(status, 'Pending'))}</span>
              </div>
              <div class="account-trainer-roster-meta">
                <span class="account-trainer-roster-pill">${escapeHtml(createdLabel)}</span>
                ${companyLabel ? `<span class="account-trainer-roster-pill">${escapeHtml(companyLabel)}</span>` : ''}
                ${titleLabel ? `<span class="account-trainer-roster-pill">${escapeHtml(titleLabel)}</span>` : ''}
                ${locationLabel ? `<span class="account-trainer-roster-pill">${escapeHtml(locationLabel)}</span>` : ''}
              </div>
              ${status === 'pending' ? `
                <div class="account-trainer-btn-row" style="margin-top:12px;">
                  <button type="button" class="account-trainer-btn" data-trainer-manager-request-action="approve" data-manager-request-id="${escapeHtml(String(request?.id || ''))}">Approve Manager</button>
                  <button type="button" class="account-trainer-btn ghost" data-trainer-manager-request-action="deny" data-manager-request-id="${escapeHtml(String(request?.id || ''))}">Deny</button>
                </div>
              ` : ''}
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderPendingWorkoutApprovals(items) {
    if (!Array.isArray(items) || !items.length) {
      return renderEmpty('No workout approvals waiting right now.');
    }
    return `
      <div class="account-trainer-action-feed">
        ${items.map((workout) => `
          <article class="account-trainer-action-card tone-needs-action">
            <div class="account-trainer-action-head">
              <div>
                <div class="account-trainer-action-title">${escapeHtml(workout?.clientName || 'Client')} workout</div>
                <div class="account-trainer-action-detail">Week ${escapeHtml(String(workout?.weekIndex || '?'))} • Day ${escapeHtml(String(workout?.dayIndex || '?'))}${workout?.performedAt ? ` • ${escapeHtml(formatShortDate(workout.performedAt))}` : ''}</div>
              </div>
              <span class="account-trainer-roster-pill">${escapeHtml(formatRelativeTime(workout?.updatedAt || workout?.performedAt))}</span>
            </div>
            <div class="account-trainer-roster-meta">
              ${workout?.readiness ? `<span class="account-trainer-roster-pill">Readiness ${escapeHtml(String(workout.readiness))}/10</span>` : ''}
              ${workout?.durationMs ? `<span class="account-trainer-roster-pill">${escapeHtml(formatDurationCompact(workout.durationMs))}</span>` : ''}
              <span class="account-trainer-roster-pill">${escapeHtml(workout?.clientEmail || 'Client workout')}</span>
            </div>
            ${workout?.notes ? `<div class="account-trainer-muted">${escapeHtml(workout.notes)}</div>` : ''}
            <div class="account-trainer-action-foot">
              <span class="account-trainer-roster-pill">${escapeHtml(`${Array.isArray(workout?.entries) ? workout.entries.length : 0} exercise${Array.isArray(workout?.entries) && workout.entries.length === 1 ? '' : 's'}`)}</span>
              <div class="account-trainer-btn-row">
                <button type="button" class="account-trainer-btn ghost" data-workout-review-pdf="${escapeHtml(String(workout?.workoutId || ''))}">View PDF</button>
                <button type="button" class="account-trainer-btn" data-workout-review-approve="${escapeHtml(String(workout?.workoutId || ''))}">Approve workout</button>
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function openTrainerWorkoutApprovalPdf(workout) {
    const item = workout && typeof workout === 'object' ? workout : null;
    if (!item) return false;
    const entries = Array.isArray(item.entries) ? item.entries : [];
    const entryRows = entries.map((entry, index) => {
      const name = escapeHtml(entry?.exerciseName || entry?.displayName || entry?.name || `Exercise ${index + 1}`);
      const sets = Array.isArray(entry?.sets) ? entry.sets : [];
      const setSummary = sets.length
        ? sets.map((set, setIndex) => {
          const reps = String(set?.reps || set?.actualReps || '').trim();
          const weight = String(set?.weight || set?.weightLb || set?.actualWeight || '').trim();
          const done = set?.completed === false ? 'not finished' : 'done';
          const parts = [`Set ${setIndex + 1}`];
          if (reps) parts.push(`${reps} reps`);
          if (weight) parts.push(`${weight} lb`);
          parts.push(done);
          return parts.join(' • ');
        }).join('<br>')
        : escapeHtml([
          entry?.reps ? `${entry.reps} reps` : '',
          entry?.weight ? `${entry.weight} lb` : '',
          entry?.notes ? String(entry.notes) : ''
        ].filter(Boolean).join(' • ') || 'Logged workout entry');
      return `<div class="pdf-ex-row"><span class="pdf-ex-name">${name}</span><span class="pdf-ex-meta">${setSummary}</span></div>`;
    }).join('');
    const stats = [
      { k: 'Client', v: item.clientName || 'Client' },
      { k: 'Email', v: item.clientEmail || '—' },
      { k: 'Performed', v: formatShortDate(item.performedAt) || formatShortDate(item.updatedAt) || '—' },
      { k: 'Week / Day', v: `Week ${item.weekIndex || '?'} • Day ${item.dayIndex || '?'}` },
      { k: 'Readiness', v: item.readiness ? `${item.readiness}/10` : '—' },
      { k: 'Duration', v: formatDurationCompact(item.durationMs) || '—' }
    ];
    const statsHtml = stats.map((row) =>
      `<div class="pdf-stat"><span class="pdf-stat-k">${escapeHtml(row.k)}</span><span class="pdf-stat-v">${escapeHtml(row.v)}</span></div>`
    ).join('');
    const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(`${item.clientName || 'Client'} Workout Review`)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Space Grotesk", Arial, sans-serif; margin: 24px; color: #171412; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .pdf-sub { color: #5a524c; font-size: 12px; margin-bottom: 14px; }
    .pdf-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin-bottom: 18px; }
    .pdf-stat { display: flex; justify-content: space-between; gap: 10px; padding: 6px 8px; border-radius: 8px; background: #f6f1ec; border: 1px solid #e7ded6; font-size: 12px; }
    .pdf-stat-k { color: #5a524c; font-weight: 600; }
    .pdf-stat-v { font-weight: 700; text-align: right; }
    .pdf-day { border: 1px solid #e3d9cf; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; break-inside: avoid; }
    .pdf-day-head { font-weight: 700; margin-bottom: 8px; }
    .pdf-ex-row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-top: 1px dashed #e7ded6; font-size: 12.5px; }
    .pdf-ex-row:first-of-type { border-top: 0; }
    .pdf-ex-name { font-weight: 600; }
    .pdf-ex-meta { color: #5a524c; text-align: right; white-space: normal; max-width: 55%; line-height: 1.45; }
    .pdf-empty { font-size: 12px; color: #5a524c; font-style: italic; }
    .pdf-notes { margin-top: 14px; padding: 12px; border-radius: 10px; background: #faf6f1; border: 1px solid #eadfce; font-size: 12.5px; line-height: 1.55; }
  </style>
</head>
<body>
  <h1>${escapeHtml(`${item.clientName || 'Client'} Workout Review`)}</h1>
  <div class="pdf-sub">Trainer approval view</div>
  <div class="pdf-stats">${statsHtml}</div>
  <section class="pdf-day">
    <div class="pdf-day-head">Logged Exercises</div>
    ${entryRows || '<div class="pdf-empty">No logged workout entries.</div>'}
    ${item.notes ? `<div class="pdf-notes"><strong>Notes:</strong><br>${escapeHtml(item.notes)}</div>` : ''}
  </section>
</body>
</html>`;
    const win = window.open('', '_blank');
    if (!win) return false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    return true;
  }

  function renderWarningsList(warnings) {
    if (!Array.isArray(warnings) || !warnings.length) {
      return renderEmpty('No client warnings right now.');
    }
    return `
      <div class="account-trainer-warning-list">
        ${warnings.map((warning) => `
          <article class="account-trainer-warning-card">
            <div class="account-trainer-warning-head">
              <div>
                <div class="account-trainer-roster-name">${escapeHtml(warning.name || 'Client')}</div>
                <div class="account-trainer-roster-sub">${escapeHtml(warning.email || 'Linked app user')}</div>
              </div>
              <span class="account-trainer-roster-pill amount">${escapeHtml(formatClientAmountPill(warning))}</span>
            </div>
            <div class="account-trainer-warning-pills">
              ${(Array.isArray(warning.issues) ? warning.issues : []).map((issue) => `
                <span class="account-trainer-warning-pill">${escapeHtml(issue)}</span>
              `).join('')}
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function readManagerPrefill() {
    try {
      const raw = sessionStorage.getItem(MANAGER_ENTRY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function readTrainerManagerReviews() {
    try {
      const raw = localStorage.getItem(TRAINER_MANAGER_REVIEW_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeTrainerManagerReviews(list) {
    try {
      localStorage.setItem(TRAINER_MANAGER_REVIEW_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch {}
  }

  function getManagerDashboardContext() {
    const params = new URLSearchParams(window.location.search);
    const prefill = readManagerPrefill();
    return {
      isManager: params.get('role') === 'manager',
      managerCode: String(prefill?.managerCode || '').trim(),
      companyName: String(prefill?.companyName || '').trim(),
      managerName: String(prefill?.managerName || '').trim()
    };
  }

  function renderTrainingRequests(requests) {
    if (!Array.isArray(requests) || !requests.length) {
      return renderEmpty('No pending client approvals right now.');
    }
    return `
      <div class="account-trainer-roster">
        ${requests.map((request) => {
          const payload = request?.requestPayload && typeof request.requestPayload === 'object' ? request.requestPayload : {};
          const summaryBits = [
            payload.goal ? `Goal: ${payload.goal}` : '',
            payload.phase ? `Phase: ${payload.phase}` : '',
            payload.hasMembership ? `Membership: ${payload.hasMembership}` : '',
            payload.experience ? `Experience: ${payload.experience}` : '',
            payload.daysPerWeek ? `${payload.daysPerWeek} days/week` : '',
            payload.timePerSession ? `${payload.timePerSession} sessions` : ''
          ].filter(Boolean);
          return `
            <article class="account-trainer-roster-card">
              <div class="account-trainer-roster-head">
                <div>
                  <div class="account-trainer-roster-name">${escapeHtml(request.applicantName || 'Applicant')}</div>
                  <div class="account-trainer-roster-sub">${escapeHtml(request.applicantEmail || request.applicantPhone || 'No contact info')}</div>
                </div>
                <span class="account-trainer-roster-pill amount">${escapeHtml(titleizeStatus(request.status, 'Pending'))}</span>
              </div>
              <div class="account-trainer-roster-meta">
                <span class="account-trainer-roster-pill">${escapeHtml(formatShortDate(request.createdAt) || 'Today')}</span>
                ${payload.priorityMuscles?.length ? `<span class="account-trainer-roster-pill">${escapeHtml(payload.priorityMuscles.join(', '))}</span>` : ''}
              </div>
              ${summaryBits.length ? `<div class="account-trainer-muted" style="margin-top:8px;">${escapeHtml(summaryBits.join(' | '))}</div>` : ''}
              ${request.status === 'pending' ? `
                <div class="account-trainer-btn-row" style="margin-top:12px;">
                  <button type="button" class="account-trainer-btn" data-training-request-action="approve" data-request-id="${escapeHtml(String(request.id || ''))}">✓ Accept Client</button>
                  <button type="button" class="account-trainer-btn ghost" data-training-request-action="deny" data-request-id="${escapeHtml(String(request.id || ''))}">✕ Reject</button>
                </div>
              ` : (request.decisionReason ? `<div class="account-trainer-muted" style="margin-top:8px;">Reason: ${escapeHtml(request.decisionReason)}</div>` : '')}
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderManagerReviewRequests(managerContext) {
    const managerCode = String(managerContext?.managerCode || '').trim().toUpperCase();
    if (!managerCode) {
      return renderEmpty('No manager code is active for this dashboard yet.');
    }
    const requests = readTrainerManagerReviews().filter((request) => String(request?.managerCode || '').trim().toUpperCase() === managerCode);
    if (!requests.length) {
      return renderEmpty('No trainer review requests yet.');
    }
    return `
      <div class="account-trainer-roster">
        ${requests.map((request) => {
          const trainer = request?.trainer && typeof request.trainer === 'object' ? request.trainer : {};
          const summaryBits = [
            trainer.trainerType ? `Type: ${trainer.trainerType}` : '',
            trainer.coachingStyle ? `Style: ${trainer.coachingStyle}` : '',
            trainer.city || trainer.state ? `${trainer.city || ''}${trainer.city && trainer.state ? ', ' : ''}${trainer.state || ''}` : '',
            request.managerTitle ? `Manager role: ${request.managerTitle}` : ''
          ].filter(Boolean);
          return `
            <article class="account-trainer-roster-card">
              <div class="account-trainer-roster-head">
                <div>
                  <div class="account-trainer-roster-name">${escapeHtml(trainer.fullName || 'Trainer')}</div>
                  <div class="account-trainer-roster-sub">${escapeHtml(trainer.email || trainer.phone || 'No contact info')}</div>
                </div>
                <span class="account-trainer-roster-pill amount">${escapeHtml(titleizeStatus(request.status, 'Pending'))}</span>
              </div>
              <div class="account-trainer-roster-meta">
                <span class="account-trainer-roster-pill">${escapeHtml(formatShortDate(request.createdAt) || 'Today')}</span>
                ${trainer.workspaceId ? `<span class="account-trainer-roster-pill">${escapeHtml(trainer.workspaceId)}</span>` : ''}
                ${trainer.locationId ? `<span class="account-trainer-roster-pill">${escapeHtml(trainer.locationId)}</span>` : ''}
              </div>
              ${summaryBits.length ? `<div class="account-trainer-muted" style="margin-top:8px;">${escapeHtml(summaryBits.join(' | '))}</div>` : ''}
              ${trainer.summary ? `<div class="account-trainer-muted" style="margin-top:8px;">${escapeHtml(trainer.summary)}</div>` : ''}
              ${request.status === 'pending' ? `
                <div class="account-trainer-btn-row" style="margin-top:12px;">
                  <button type="button" class="account-trainer-btn" data-manager-review-action="approve" data-manager-review-id="${escapeHtml(String(request.id || ''))}">Approve</button>
                  <button type="button" class="account-trainer-btn ghost" data-manager-review-action="deny" data-manager-review-id="${escapeHtml(String(request.id || ''))}">Reject</button>
                </div>
              ` : ''}
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function getStripePrimaryAction(stripe) {
    const state = String(stripe?.state || '').trim();
    if (state === 'ready') return { label: 'Manage Stripe Account', mode: 'manage' };
    if (state === 'incomplete') return { label: 'Continue Stripe Setup', mode: 'continue' };
    return { label: 'Connect Stripe', mode: 'connect' };
  }

  function renderStripeStatusCard(stripe) {
    const primary = getStripePrimaryAction(stripe);
    const currentIssues = Array.isArray(stripe?.requirementsCurrentlyDue) ? stripe.requirementsCurrentlyDue : [];
    const pastIssues = Array.isArray(stripe?.requirementsPastDue) ? stripe.requirementsPastDue : [];
    const issues = [...currentIssues, ...pastIssues].slice(0, 5);
    const label = stripe?.state === 'ready'
      ? 'Stripe connected and ready for coaching payments'
      : (stripe?.state === 'incomplete'
        ? 'Stripe setup incomplete'
        : 'Stripe not connected');
    return `
      <div class="account-trainer-stripe-card">
        <div class="account-trainer-stripe-top">
          <div>
            <span class="account-trainer-chip-label">Stripe status</span>
            <strong>${escapeHtml(label)}</strong>
          </div>
          <span class="account-trainer-stripe-badge">${escapeHtml(titleizeStatus(stripe?.state, 'Not connected'))}</span>
        </div>
        <div class="account-trainer-stripe-copy">
          Connect Stripe to receive coaching payments. Your paid coaching invites stay locked until your Stripe account is connected and verified.
        </div>
        <div class="account-trainer-stripe-badges">
          <span class="account-trainer-stripe-badge">Charges ${stripe?.chargesEnabled ? 'enabled' : 'locked'}</span>
          <span class="account-trainer-stripe-badge">Payouts ${stripe?.payoutsEnabled ? 'enabled' : 'locked'}</span>
          <span class="account-trainer-stripe-badge">Last sync ${escapeHtml(formatShortDate(stripe?.lastCheckedAt) || 'Not yet synced')}</span>
        </div>
        ${issues.length ? `
          <ul class="account-trainer-stripe-issues">
            ${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}
          </ul>
        ` : ''}
        <div class="account-trainer-btn-row">
          <button type="button" class="account-trainer-btn" data-stripe-action="${escapeHtml(primary.mode)}">${escapeHtml(primary.label)}</button>
          <button type="button" class="account-trainer-btn ghost" data-stripe-action="refresh">Refresh status</button>
        </div>
      </div>
    `;
  }

  function renderTable(headers, rows, emptyMessage) {
    if (!Array.isArray(rows) || !rows.length) return renderEmpty(emptyMessage);
    return `
      <table class="account-trainer-table">
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>
    `;
  }

  function buildTrainerManagerRequestPayload(currentData, meUser, managerEntry) {
    const trainer = currentData?.trainer || {};
    return {
      managerCode: normalizeManagerCode(managerEntry?.managerCode || managerEntry?.code || ''),
      managerName: String(managerEntry?.managerName || '').trim(),
      managerCompanyName: String(managerEntry?.companyName || managerEntry?.workspaceId || '').trim(),
      trainer: {
        fullName: String(trainer?.displayName || trainer?.fullName || meUser?.displayName || meUser?.username || '').trim(),
        email: String(trainer?.contactEmail || trainer?.email || meUser?.email || '').trim(),
        phone: String(trainer?.phone || meUser?.phone || '').trim(),
        trainerType: String(trainer?.trainerType || '').trim(),
        workspaceId: String(trainer?.workspaceId || '').trim(),
        locationId: String(trainer?.locationId || '').trim(),
        city: String(trainer?.city || trainer?.publicCity || '').trim(),
        state: String(trainer?.state || trainer?.publicState || '').trim(),
        coachingStyle: String(trainer?.coachingStyle || trainer?.coachingFormat || '').trim(),
        specialties: Array.isArray(trainer?.specialties) ? trainer.specialties : [],
        summary: String(trainer?.summary || trainer?.brandPositioning || '').trim()
      }
    };
  }

  function renderTrainerManagerCard(currentData) {
    // Managers are retired — no "Find a Manager" card on the trainer dashboard.
    return '';
    // eslint-disable-next-line no-unreachable
    const trainer = currentData?.trainer || {};
    const managerDirectory = Array.isArray(currentData?.managerDirectory) ? currentData.managerDirectory : [];
    const reviews = Array.isArray(currentData?.trainerManagerReviews) ? currentData.trainerManagerReviews : [];
    const searchTerm = String(currentData?.managerSearchTerm || '').trim().toLowerCase();
    const approvedCode = normalizeManagerCode(trainer?.managerCode || '');
    const approvedRequest = approvedCode
      ? (reviews.find((item) => {
          const status = String(item?.status || '').trim().toLowerCase();
          const code = normalizeManagerCode(item?.managerCode || '');
          return status === 'approved' && code === approvedCode;
        }) || null)
      : null;
    const pendingRequest = reviews.find((item) => String(item?.status || '').trim().toLowerCase() === 'pending') || null;
    const pendingCode = normalizeManagerCode(pendingRequest?.managerCode || '');
    const approvedManager = approvedCode
      ? (managerDirectory.find((item) => normalizeManagerCode(item?.managerCode || item?.code || '') === approvedCode) || approvedRequest || null)
      : null;
    const pendingManager = managerDirectory.find((item) => normalizeManagerCode(item?.managerCode || item?.code || '') === pendingCode) || pendingRequest || null;
    const statusKind = approvedManager ? 'approved' : 'pending';
    const statusText = approvedManager
      ? 'Live'
      : pendingManager
        ? 'Pending'
        : '';
    const titleText = approvedManager
      ? (approvedManager.managerName || approvedManager.managerCompanyName || approvedManager.managerCode || 'Training Manager')
      : pendingManager
        ? (pendingManager.managerName || pendingManager.managerCompanyName || pendingManager.managerCode || 'Pending manager')
        : 'No training manager attached yet.';
    const copyText = approvedManager
      ? `Your training manager is ${approvedManager.managerName || approvedManager.managerCompanyName || approvedManager.managerCode}.`
      : pendingManager
        ? `Your request is waiting under ${pendingManager.managerName || pendingManager.managerCompanyName || pendingManager.managerCode}.`
        : 'Pick a gym, then a location, then your manager from a popup flow.';
    const canSearch = !approvedManager;
    return `
      <section class="trainer-dashboard-manager-card">
        <div class="trainer-dashboard-manager-top">
          <div>
            <div class="trainer-dashboard-manager-kicker">Training Manager</div>
            <div class="trainer-dashboard-manager-title">${escapeHtml(titleText)}</div>
            <div class="trainer-dashboard-manager-copy">${escapeHtml(copyText)}</div>
          </div>
          <div style="display:grid;gap:8px;justify-items:end;">
            ${statusText ? `<span class="trainer-dashboard-manager-status is-${escapeHtml(statusKind)}">${escapeHtml(statusText)}</span>` : ''}
            ${approvedManager ? `<button type="button" class="trainer-dashboard-manager-switch" data-manager-switch-open="1">Switch</button>` : ''}
          </div>
        </div>
        ${canSearch ? `
          <div class="trainer-dashboard-manager-tools">
            <div><button type="button" class="trainer-dashboard-manager-option-btn" data-manager-find-open="1">Find a Manager</button></div>
          </div>
        ` : ''}
      </section>
    `;
  }

  function normalizeLeadStage(raw) {
    const stage = String(raw || '').trim();
    return LEAD_STAGES.includes(stage) ? stage : 'New Lead';
  }

  function matchLeadTag(lead, tagFilter = '') {
    const filter = normalizeLookupText(tagFilter);
    if (!filter) return true;
    const tags = Array.isArray(lead?.tags) ? lead.tags : [];
    return tags.some((tag) => normalizeLookupText(tag).includes(filter));
  }

  function leadAnswerLabel(rawKey = '') {
    const key = String(rawKey || '').trim();
    if (!key) return '';
    return key
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function normalizeLeadAnswerValue(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .join(', ');
    }
    if (rawValue && typeof rawValue === 'object') {
      try {
        return JSON.stringify(rawValue);
      } catch {
        return '';
      }
    }
    return String(rawValue || '').trim();
  }

  function renderLeadCustomAnswers(answers = {}) {
    const hiddenKeys = new Set([
      'name',
      'fullName',
      'full_name',
      'email',
      'phone',
      'goal',
      'budget',
      'location',
      'coachingType',
      'coaching_type',
      'availability',
      'injuries'
    ]);
    const rows = Object.entries(answers || {})
      .filter(([key, value]) => !hiddenKeys.has(String(key || '').trim()) && normalizeLeadAnswerValue(value))
      .map(([key, value]) => ({
        label: leadAnswerLabel(key),
        value: normalizeLeadAnswerValue(value)
      }));
    if (!rows.length) return '<div class="account-trainer-muted">No extra custom answers on this submission.</div>';
    return `
      <div class="trainer-dashboard-plus-grid" data-lead-custom-answers="1">
        ${rows.map((row) => `
          <div>
            <strong>${escapeHtml(row.label || 'Answer')}</strong>
            <div class="account-trainer-muted">${escapeHtml(row.value || '—')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderLeadUploadDetails(uploads = []) {
    const items = [];
    (Array.isArray(uploads) ? uploads : []).forEach((entry) => {
      const groupKey = leadAnswerLabel(entry?.key || entry?.field || entry?.name || 'Upload');
      (Array.isArray(entry?.files) ? entry.files : []).forEach((file) => {
        const fileName = String(file?.name || 'upload').trim() || 'upload';
        const fileType = String(file?.type || '').trim();
        items.push({
          groupKey,
          fileName,
          fileType
        });
      });
    });
    if (!items.length) return '<div class="account-trainer-muted">No files uploaded on this submission.</div>';
    return `
      <div class="account-trainer-list account-trainer-list-compact" data-lead-upload-list="1">
        ${items.map((item) => `
          <div class="account-trainer-list-item">
            <strong>${escapeHtml(item.groupKey || 'Upload')}</strong>
            <div class="account-trainer-muted">${escapeHtml(item.fileName || 'upload')}</div>
            <div class="account-trainer-muted">${escapeHtml(item.fileType || 'File')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function formatLeadEventSummary(event = {}) {
    const details = event && typeof event.details === 'object' && event.details
      ? event.details
      : {};
    const tags = Array.isArray(details.tags) ? details.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [];
    const notifications = Array.isArray(details.notifications) ? details.notifications.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const emails = Array.isArray(details.emails) ? details.emails.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const webhooks = Array.isArray(details.webhooks) ? details.webhooks.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const delays = Array.isArray(details.delays) ? details.delays.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const integrations = Array.isArray(details.integrations) ? details.integrations : [];

    if (String(details.notes || '').trim()) return String(details.notes).trim();
    if (String(details.status || '').trim()) return `Stage: ${String(details.status).trim()}`;
    if (tags.length) return `Tags: ${tags.join(', ')}`;
    if (String(details.offer || '').trim()) return `Offer: ${String(details.offer).trim()}`;
    if (String(details.target || '').trim()) return `Target: ${String(details.target).trim()}`;
    if (String(details.formId || '').trim()) return `Form: ${String(details.formId).trim()}`;
    if (notifications.length) return `Notify trainer: ${notifications.join(', ')}`;
    if (emails.length) return `Email: ${emails.join(', ')}`;
    if (webhooks.length) return `Webhook: ${webhooks.join(', ')}`;
    if (delays.length) return `Delay: ${delays.join(', ')}`;
    if (integrations.length) {
      return integrations.map((item) => {
        const type = String(item?.type || 'integration').trim();
        const target = String(item?.target || '').trim();
        return target ? `${type}: ${target}` : type;
      }).join(', ');
    }
    return 'Lead activity recorded.';
  }

  function renderPotentialLeads(leads, ui = {}) {
    const search = normalizeLookupText(ui?.search || '');
    const stageFilter = String(ui?.stage || '').trim();
    const tagFilter = String(ui?.tag || '').trim();
    const filtered = (Array.isArray(leads) ? leads : []).filter((lead) => {
      const haystack = [
        lead?.fullName,
        lead?.email,
        lead?.phone,
        lead?.goal,
        lead?.location,
        lead?.coachingType,
        lead?.sourcePageName
      ].map(normalizeLookupText).join(' ');
      if (search && !haystack.includes(search)) return false;
      if (stageFilter && normalizeLeadStage(lead?.status) !== stageFilter) return false;
      if (!matchLeadTag(lead, tagFilter)) return false;
      return true;
    });
    return `
      <div class="trainer-dashboard-manager-tools" style="margin-bottom:16px;">
        <input id="trainer-leads-search" type="text" placeholder="Search leads" value="${escapeHtml(String(ui?.search || '').trim())}">
        <select id="trainer-leads-stage-filter">
          <option value="">All stages</option>
          ${LEAD_STAGES.map((stage) => `<option value="${escapeHtml(stage)}"${stageFilter === stage ? ' selected' : ''}>${escapeHtml(stage)}</option>`).join('')}
        </select>
        <input id="trainer-leads-tag-filter" type="text" placeholder="Filter by tag" value="${escapeHtml(tagFilter)}">
      </div>
      ${filtered.length ? filtered.map((lead) => {
        const tags = Array.isArray(lead?.tags) ? lead.tags : [];
        const answers = lead?.answers && typeof lead.answers === 'object' ? lead.answers : {};
        const recentEvents = Array.isArray(lead?.recentEvents) ? lead.recentEvents : [];
        const uploads = Array.isArray(lead?.uploads) ? lead.uploads : [];
        const uploadCount = uploads.reduce((count, entry) => count + (Array.isArray(entry?.files) ? entry.files.length : 0), 0);
        return `
          <article class="account-trainer-roster-card" data-lead-id="${escapeHtml(String(lead?.id || '').trim())}">
            <div class="account-trainer-roster-top">
              <div>
                <strong>${escapeHtml(String(lead?.fullName || 'Unnamed lead').trim() || 'Unnamed lead')}</strong>
                <div class="account-trainer-muted">${escapeHtml(String(lead?.email || '').trim() || 'No email')}${lead?.phone ? ` • ${escapeHtml(String(lead.phone).trim())}` : ''}</div>
              </div>
              <span class="account-trainer-roster-pill amount">${escapeHtml(normalizeLeadStage(lead?.status))}</span>
            </div>
            <div class="account-trainer-muted">${escapeHtml(String(lead?.sourcePageName || 'Coach page').trim() || 'Coach page')} • ${escapeHtml(formatShortDate(lead?.createdAt) || 'Recently')}</div>
            <div class="trainer-profile-chip-row trainer-profile-detail-chip-row trainer-profile-simple-chips" style="margin:10px 0;">
              ${tags.length ? tags.map((tag) => `<span class="trainer-profile-chip soft">${escapeHtml(tag)}</span>`).join('') : '<span class="trainer-profile-chip soft">No tags</span>'}
            </div>
            <div class="trainer-dashboard-plus-grid" style="margin-top:10px;">
              <div><strong>Goal</strong><div class="account-trainer-muted">${escapeHtml(String(lead?.goal || answers.goal || '').trim() || '—')}</div></div>
              <div><strong>Budget</strong><div class="account-trainer-muted">${escapeHtml(String(lead?.budget || answers.budget || '').trim() || '—')}</div></div>
              <div><strong>Location</strong><div class="account-trainer-muted">${escapeHtml(String(lead?.location || answers.location || '').trim() || '—')}</div></div>
              <div><strong>Coaching</strong><div class="account-trainer-muted">${escapeHtml(String(lead?.coachingType || answers.coachingType || '').trim() || '—')}</div></div>
            </div>
            <div class="trainer-dashboard-plus-grid" style="margin-top:10px;">
              <div><strong>Availability</strong><div class="account-trainer-muted">${escapeHtml(String(lead?.availability || answers.availability || '').trim() || '—')}</div></div>
              <div><strong>Injuries</strong><div class="account-trainer-muted">${escapeHtml(String(lead?.injuries || answers.injuries || '').trim() || '—')}</div></div>
              <div><strong>Uploads</strong><div class="account-trainer-muted">${escapeHtml(String(uploadCount || 0))}</div></div>
              <div><strong>Form</strong><div class="account-trainer-muted">${escapeHtml(String(lead?.formId || '').trim() || 'Default form')}</div></div>
            </div>
            <div class="trainer-dashboard-manager-card" style="margin-top:14px;padding:14px 16px;">
              <div class="trainer-dashboard-manager-kicker">Custom answers</div>
              ${renderLeadCustomAnswers(answers)}
            </div>
            <div class="trainer-dashboard-manager-card" style="margin-top:14px;padding:14px 16px;">
              <div class="trainer-dashboard-manager-kicker">Uploaded files</div>
              ${renderLeadUploadDetails(uploads)}
            </div>
            <div class="trainer-dashboard-manager-card" style="margin-top:14px;padding:14px 16px;">
              <div class="trainer-dashboard-manager-kicker">Submission history</div>
              ${recentEvents.length ? `
                <div class="account-trainer-list account-trainer-list-compact" data-lead-history="1">
                  ${recentEvents.map((event) => `
                    <div class="account-trainer-list-item">
                      <strong>${escapeHtml(String(event?.eventType || 'event').trim() || 'event')}</strong>
                      <div class="account-trainer-muted">${escapeHtml(formatShortDate(event?.createdAt) || 'Recently')}</div>
                      <div class="account-trainer-muted">${escapeHtml(formatLeadEventSummary(event))}</div>
                    </div>
                  `).join('')}
                </div>
              ` : '<div class="account-trainer-muted">No activity yet beyond the current submission.</div>'}
            </div>
            <div class="trainer-dashboard-manager-tools" style="margin-top:14px;">
              <select data-lead-stage="${escapeHtml(String(lead?.id || '').trim())}">
                ${LEAD_STAGES.map((stage) => `<option value="${escapeHtml(stage)}"${normalizeLeadStage(lead?.status) === stage ? ' selected' : ''}>${escapeHtml(stage)}</option>`).join('')}
              </select>
              <input type="text" data-lead-tags="${escapeHtml(String(lead?.id || '').trim())}" value="${escapeHtml(tags.join(', '))}" placeholder="Tags, comma separated">
            </div>
            <label class="trainer-profile-editor-field" style="margin-top:12px;">
              <span>Notes</span>
              <textarea data-lead-notes="${escapeHtml(String(lead?.id || '').trim())}" placeholder="Notes">${escapeHtml(String(lead?.notes || '').trim())}</textarea>
            </label>
            <div class="trainer-dashboard-plus-actions">
              <button type="button" class="trainer-dashboard-plus-submit" data-lead-save="${escapeHtml(String(lead?.id || '').trim())}">Save lead</button>
            </div>
          </article>
        `;
      }).join('') : renderEmpty('No potential clients match these filters.')}
    `;
  }

  /* Website funnel (visit.html pre-visit questions) -> consult-hit "leads".
     Groups the raw start/answer/complete/exit events into one card per
     visitor session, carrying the questions they answered (complete or
     partial) so they read alongside coach-page consult submissions. */
  function funnelLeadsFromInsights(json) {
    const events = Array.isArray(json?.events) ? json.events : [];
    const variants = Array.isArray(json?.config?.variants) ? json.config.variants : [];
    const variantLabel = (id) => {
      const v = variants.find((x) => String(x?.id) === String(id));
      return v ? String(v.label || 'Version') : 'Website funnel';
    };
    const sessions = new Map();
    events.forEach((e) => {
      const key = `${e.visitorId || ''}|${e.variantId || ''}`;
      if (!sessions.has(key)) {
        sessions.set(key, { visitorId: e.visitorId, variantId: e.variantId, first: e.ts, last: e.ts, answers: [], complete: false });
      }
      const s = sessions.get(key);
      if (e.ts && e.ts < s.first) s.first = e.ts;
      if (e.ts && e.ts > s.last) s.last = e.ts;
      if (e.type === 'answer' && String(e.question || '').trim()) s.answers.push({ q: e.question, a: e.answer });
      if (e.type === 'complete') {
        s.complete = true;
        if (Array.isArray(e.answers) && e.answers.length) s.answers = e.answers.map((x) => ({ q: x.question, a: x.answer }));
      }
    });
    // Number the visitors by first-seen order (Visitor 1, 2, ...).
    const list = [...sessions.values()].filter((s) => s.answers.length || s.complete)
      .sort((a, b) => String(a.first).localeCompare(String(b.first)));
    return list.map((s, i) => {
      const answers = {};
      s.answers.forEach((a, ix) => { answers[String(a.q || `Question ${ix + 1}`)] = a.a; });
      return {
        id: `funnel:${s.visitorId}:${s.variantId}`,
        fullName: `Website visitor ${i + 1}`,
        email: '', phone: '',
        answers,
        createdAt: s.first, updatedAt: s.last,
        status: s.complete ? 'new' : 'partial',
        sourcePageName: 'Website funnel',
        formId: `${variantLabel(s.variantId)} — ${s.answers.length} answered${s.complete ? '' : ' (left early)'}`,
        __funnel: true
      };
    });
  }

  function prettifyConsultFieldKey(key) {
    const clean = String(key || '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return 'Field';
    return clean.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function renderConsultFormHits(leads) {
    const list = (Array.isArray(leads) ? leads : [])
      .slice()
      .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0));
    if (!list.length) {
      return `
        <div class="consult-hits-empty">
          <div class="consult-hits-empty-icon">&#128203;</div>
          <strong>No form hits yet</strong>
          <p>When someone fills out the consultation form on your coach page, every answer lands here instantly. Share your page link or QR code to start collecting.</p>
        </div>
      `;
    }
    return `
      <div class="consult-hits-list">
        ${list.map((lead) => {
          const answers = lead?.answers && typeof lead.answers === 'object' ? lead.answers : {};
          const uploads = Array.isArray(lead?.uploads) ? lead.uploads : [];
          const uploadCount = uploads.reduce((count, entry) => count + (Array.isArray(entry?.files) ? entry.files.length : 0), 0);
          const name = String(lead?.fullName || '').trim() || 'Anonymous visitor';
          const initial = name.slice(0, 1).toUpperCase();
          const email = String(lead?.email || '').trim();
          const phone = String(lead?.phone || '').trim();
          const structured = [
            ['Goal', lead?.goal],
            ['Budget', lead?.budget],
            ['Location', lead?.location],
            ['Coaching type', lead?.coachingType],
            ['Availability', lead?.availability],
            ['Injuries', lead?.injuries]
          ].filter(([, value]) => String(value || '').trim());
          const structuredKeys = new Set(['goal', 'budget', 'location', 'coachingtype', 'coaching_type', 'availability', 'injuries', 'fullname', 'full_name', 'name', 'email', 'phone']);
          const extraAnswers = Object.entries(answers).filter(([key, value]) => {
            const flat = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return String(value || '').trim() && !structuredKeys.has(flat) && !structuredKeys.has(String(key || '').toLowerCase());
          });
          return `
            <article class="consult-hit-card">
              <div class="consult-hit-head">
                <div class="consult-hit-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
                <div class="consult-hit-who">
                  <strong>${escapeHtml(name)}</strong>
                  <div class="consult-hit-contact">
                    ${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ''}
                    ${email && phone ? '<span aria-hidden="true">&#8226;</span>' : ''}
                    ${phone ? `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>` : ''}
                    ${!email && !phone ? '<span>No contact details</span>' : ''}
                  </div>
                </div>
                <span class="consult-hit-stage">${escapeHtml(normalizeLeadStage(lead?.status))}</span>
              </div>
              <div class="consult-hit-meta">
                <span>&#128197; ${escapeHtml(formatShortDate(lead?.updatedAt || lead?.createdAt) || 'Recently')}</span>
                <span>&#128196; ${escapeHtml(String(lead?.sourcePageName || 'Coach page').trim() || 'Coach page')}</span>
                <span>&#9993; ${escapeHtml(String(lead?.formId || '').trim() || 'Consultation form')}</span>
                ${uploadCount ? `<span>&#128206; ${escapeHtml(String(uploadCount))} file${uploadCount === 1 ? '' : 's'}</span>` : ''}
              </div>
              ${structured.length ? `
                <div class="consult-hit-grid">
                  ${structured.map(([label, value]) => `
                    <div class="consult-hit-field">
                      <span>${escapeHtml(label)}</span>
                      <div>${escapeHtml(String(value).trim())}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              ${extraAnswers.length ? `
                <div class="consult-hit-answers">
                  <div class="consult-hit-answers-title">Everything else they filled out</div>
                  ${extraAnswers.map(([key, value]) => `
                    <div class="consult-hit-field">
                      <span>${escapeHtml(prettifyConsultFieldKey(key))}</span>
                      <div>${escapeHtml(Array.isArray(value) ? value.join(', ') : String(value).trim())}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              <label class="consult-hit-notes">
                <span>Your notes</span>
                <textarea data-consult-note="${escapeHtml(String(lead?.id || '').trim())}" placeholder="Add a note to move them through your process…">${escapeHtml(String(lead?.notes || '').trim())}</textarea>
              </label>
              <div class="consult-hit-actions">
                <button type="button" class="consult-hit-btn primary" data-consult-move data-move-name="${escapeHtml(name)}" data-move-email="${escapeHtml(email)}" data-move-phone="${escapeHtml(phone)}">Move to Clients</button>
                ${!lead?.__funnel ? `<button type="button" class="consult-hit-btn" data-consult-save="${escapeHtml(String(lead?.id || '').trim())}">Save note</button>` : ''}
                ${email ? `<a class="consult-hit-btn is-ghost" href="mailto:${escapeHtml(email)}">Email back</a>` : ''}
                ${phone ? `<a class="consult-hit-btn is-ghost" href="sms:${escapeHtml(phone)}">Text back</a>` : ''}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderTrainerDashboard(data) {
    const managerContext = getManagerDashboardContext();
    const trainer = data?.trainer || {};
    const growth = data?.growth || {};
    const clientRoster = Array.isArray(growth?.clientRoster) ? growth.clientRoster : [];
    const clientActions = Array.isArray(growth?.actions) ? growth.actions : [];
    const pendingWorkoutApprovals = Array.isArray(growth?.pendingWorkoutApprovals) ? growth.pendingWorkoutApprovals : [];
    const trainingRequests = Array.isArray(data?.trainingRequests) ? data.trainingRequests : [];
    const incomingManagerRequests = getIncomingManagerRequests(data?.trainerManagerReviews);
    const leads = Array.isArray(data?.pageLeads) ? data.pageLeads : [];
    const feedItems = buildClientActionFeed(trainingRequests, clientActions, clientRoster, pendingWorkoutApprovals);
    const currentCount = clientRoster.length;
    const pendingCount = trainingRequests.length;
    const workoutApproveCount = pendingWorkoutApprovals.length;
    const actionsCount = feedItems.length;
    const requestsCount = incomingManagerRequests.length;
    const potentialCount = leads.length;

    if (!managerContext.isManager && !data?.isTrainer && !trainer?.onboarded) {
      return `
        <div class="account-trainer-cta">
          <div class="account-trainer-cta-copy">
            Turn your account into a trainer account, collect a referral code, send coaching invites, and track trainer growth from one dashboard.
          </div>
          <div class="account-trainer-btn-row">
            <a class="account-trainer-btn" href="trainers.html#onboarding">Start trainer onboarding</a>
          </div>
        </div>
      `;
    }

    return `
      <div class="account-trainer-clients-shell">
        <div class="account-trainer-clients-pills" role="tablist" aria-label="Client views">
          <button type="button" class="account-trainer-pill${currentCount > 0 ? ' has-alert' : ''}" data-clients-view="current" aria-pressed="false">Current <span>${currentCount}</span></button>
          <button type="button" class="account-trainer-pill${pendingCount > 0 ? ' has-alert' : ''}" data-clients-view="pending" aria-pressed="false">Pending <span>${pendingCount}</span></button>
          <button type="button" class="account-trainer-pill${workoutApproveCount > 0 ? ' has-alert' : ''}" data-clients-view="workout-approve" aria-pressed="false">Workout Approve <span>${workoutApproveCount}</span></button>
          <button type="button" class="account-trainer-pill${actionsCount > 0 ? ' has-alert' : ''}" data-clients-view="actions" aria-pressed="false" title="Things that still need you to do something">Actions <span>${actionsCount}</span></button>
          <button type="button" class="account-trainer-pill" data-clients-view="history" aria-pressed="false" title="A read-only log of what already happened">History</button>
          <button type="button" class="account-trainer-pill${requestsCount > 0 ? ' has-alert' : ''}" data-clients-view="requests" aria-pressed="false">Requests <span>${requestsCount}</span></button>
        </div>
        <section class="account-trainer-panel" data-clients-panel="current">
          <h3>Current Clients</h3>
          <div class="account-trainer-muted">Click any current client to open their account and look deeper.</div>
          ${renderClientRoster(clientRoster)}
        </section>
        <section class="account-trainer-panel" data-clients-panel="pending">
          <h3>Pending Clients</h3>
          <div class="account-trainer-muted">These clients still need your approval before they attach to you.</div>
          ${renderTrainingRequests(trainingRequests)}
        </section>
        <section class="account-trainer-panel" data-clients-panel="workout-approve">
          <h3>Workout Approve</h3>
          <div class="account-trainer-muted">Client workouts stay here until you review them and approve them.</div>
          ${renderPendingWorkoutApprovals(pendingWorkoutApprovals)}
        </section>
        <section class="account-trainer-panel" data-clients-panel="actions">
          <h3>Actions &mdash; your to-do list</h3>
          <div class="account-trainer-muted">Open items that still need you: new client requests to approve, workouts to review, and follow-ups. These clear off the list once you handle them.</div>
          ${renderTrainerActionFeed(feedItems)}
        </section>
        <section class="account-trainer-panel" data-clients-panel="consult-form-hits">
          <h3>Consult Form Hits</h3>
          <div class="account-trainer-muted">Every pre-visit answer from your website link and every consultation form filled out on your coach page — in one place. (Also your Potential Clients leads.)</div>
          ${renderConsultFormHits([...(Array.isArray(data?.funnelLeads) ? data.funnelLeads : []), ...leads])}
        </section>
        <section class="account-trainer-panel" data-clients-panel="history">
          <h3>History &mdash; the record</h3>
          <div class="account-trainer-muted">A read-only timeline of everything that already happened, newest first — consult hits, plans made, payments, sign-ups. Nothing to do here; it's just the log. (Actions is your to-do list; History is the paper trail.)</div>
          ${renderTrainerHistory(data)}
        </section>
        <section class="account-trainer-panel" data-clients-panel="requests">
          <h3>Requests</h3>
          <div class="account-trainer-muted">Manager requests land here. Approve one to attach that manager to your trainer account in live time.</div>
          ${renderIncomingManagerRequests(incomingManagerRequests)}
        </section>
      </div>
    `;
  }

  function renderTrainerHistory(data) {
    const events = [];
    const at = (t) => (t ? new Date(t) : null);
    // Website funnel + coach-page consult hits.
    (Array.isArray(data?.funnelLeads) ? data.funnelLeads : []).forEach((f) => {
      events.push({ t: at(f.createdAt), dot: 'info', title: `${f.fullName || 'A visitor'} hit your website consult`, sub: f.formId || 'Website funnel' });
    });
    (Array.isArray(data?.pageLeads) ? data.pageLeads : []).forEach((l) => {
      events.push({ t: at(l.createdAt || l.updatedAt), dot: 'info', title: `${l.fullName || 'Someone'} filled out your consult form`, sub: l.goal ? `Goal: ${l.goal}` : 'Coach page', uid: l.linkedUserId });
    });
    // Clients: joined + payment + plan state.
    (Array.isArray(data?.growth?.clientRoster) ? data.growth.clientRoster : []).forEach((c) => {
      const tone = paymentTone(c.paymentStatus);
      if (c.joinedAt) events.push({ t: at(c.joinedAt), dot: 'ok', title: `${c.name} became a client`, sub: c.packageName || 'New client', uid: c.linkedUserId });
      if (tone.cls === 'bad') events.push({ t: at(c.joinedAt), dot: 'bad', title: `${c.name}'s payment declined`, sub: 'Needs attention', uid: c.linkedUserId });
      if (c.hasNutritionPlan) events.push({ t: at(c.joinedAt), dot: 'ok', title: `${c.name} has a nutrition plan`, sub: 'Nutrition generated', uid: c.linkedUserId });
      if (c.hasWorkoutPlan) events.push({ t: at(c.joinedAt), dot: 'ok', title: `${c.name} has a training plan`, sub: 'Workout generated', uid: c.linkedUserId });
    });
    const sorted = events.filter((e) => e.t && !isNaN(e.t)).sort((a, b) => b.t - a.t).slice(0, 60);
    if (!sorted.length) return renderEmpty('No activity yet. As people hit your funnel and clients come in, the timeline fills up here.');
    const fmt = (d) => `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    return `<div class="history-timeline">${sorted.map((e) => `
      <div class="history-item">
        <span class="history-dot ${e.dot}"></span>
        <span class="history-time">${escapeHtml(fmt(e.t))}</span>
        <div class="history-body">
          <div class="history-title">${escapeHtml(e.title)}</div>
          <div class="history-sub">${escapeHtml(e.sub || '')}</div>
          ${e.uid ? `<button type="button" class="history-peek" data-view-client-account="${escapeHtml(String(e.uid))}">Peer into account &rarr;</button>` : ''}
        </div>
      </div>`).join('')}</div>`;
  }

  function getIncomingManagerRequestById(data, requestIdRaw) {
    const requestId = String(requestIdRaw || '').trim();
    if (!requestId) return null;
    const requests = getIncomingManagerRequests(data?.trainerManagerReviews);
    return requests.find((request) => String(request?.id || '').trim() === requestId) || null;
  }

  async function init() {
    const statusEl = $('#account-trainer-status');
    const shell = $('#account-trainer-shell');
    const managerHost = $('#trainer-dashboard-manager-host');
    const managerModalEl = $('#trainer-dashboard-manager-modal');
    const managerModalBodyEl = $('#trainer-dashboard-manager-modal-body');
    const managerModalBackdropEl = $('#trainer-dashboard-manager-modal-backdrop');
    const managerModalCloseEl = $('#trainer-dashboard-manager-modal-close');
    const addPanelEl = $('#trainer-dashboard-add-panel');
    const addCancelEl = $('#trainer-dashboard-add-cancel');
    const appOptionEl = $('#trainer-dashboard-add-app-option');
    const coachingOptionEl = $('#trainer-dashboard-add-coaching-option');
    const appInviteFormEl = $('#trainer-dashboard-app-invite-form');
    const coachingInviteFormEl = $('#trainer-dashboard-coaching-invite-form');
    const stripeGateFormEl = $('#trainer-dashboard-coaching-stripe-gate');
    const addStatusEl = $('#trainer-dashboard-add-status');
    const appTextBtnEl = $('#trainer-dashboard-app-text');
    const appEmailBtnEl = $('#trainer-dashboard-app-email');
    const appCopyBtnEl = $('#trainer-dashboard-app-copy');
    const stripeCloseEl = $('#trainer-dashboard-stripe-close');
    const stripeConnectEl = $('#trainer-dashboard-stripe-connect');
    const stripeRefreshEl = $('#trainer-dashboard-stripe-refresh');
    if (!shell) return;
    const setStatus = (message) => {
      if (statusEl) statusEl.textContent = message;
    };

    const me = await api('/api/auth/me');
    if (!me.ok || !me.json?.user) {
      setStatus('Sign in to manage your trainer dashboard.');
      shell.innerHTML = `
        <div class="account-trainer-cta">
          <div class="account-trainer-cta-copy">Trainer tools live on your account once you sign in.</div>
          <div class="account-trainer-btn-row">
            <a class="account-trainer-btn" href="trainers.html#onboarding">Open trainers page</a>
          </div>
        </div>
      `;
      return;
    }

    const meUser = me.json?.user || null;
    const pageParams = new URLSearchParams(window.location.search);
    let currentData = null;
    let selectedInviteMode = 'app';
    let lastPlusAnchor = null;
    let managerSearchTerm = '';
    let managerSwitchSearchTerm = '';
    let managerSwitchPhase = 'confirm';
    let managerSwitchWorkspaceId = '';
    let managerSwitchLocationId = '';
    let managerReviewPollTimer = null;
    let lastIncomingManagerRequestCount = 0;
    let leadSearchTerm = '';
    let leadStageFilter = '';
    let leadTagFilter = '';

    const isStripeReady = () => String(currentData?.growth?.stripe?.state || '').trim() === 'ready';
    const hasPendingManagerReview = () => Array.isArray(currentData?.trainerManagerReviews)
      && currentData.trainerManagerReviews.some((item) => String(item?.status || '').trim().toLowerCase() === 'pending');
    const hasAttachedManager = () => Boolean(normalizeManagerCode(currentData?.trainer?.managerCode || ''));
    const shouldWatchManagerLiveState = () => Boolean(currentData && (currentData?.isTrainer || currentData?.trainer));

    const closeManagerSwitchModal = () => {
      managerSwitchPhase = 'confirm';
      managerSwitchSearchTerm = '';
      managerSwitchWorkspaceId = '';
      managerSwitchLocationId = '';
      managerModalEl?.classList.add('hidden');
      managerModalEl?.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('trainer-dashboard-choice-open');
    };

    const renderManagerSwitchPicker = () => {
      const reviews = Array.isArray(currentData?.trainerManagerReviews) ? currentData.trainerManagerReviews : [];
      const managerDirectory = disambiguateManagerNames([
        ...(Array.isArray(currentData?.managerDirectory) ? currentData.managerDirectory : []),
        ...readManagerDirectoryLocal().map((entry) => ({
          managerCode: normalizeManagerCode(entry?.code || ''),
          managerName: String(entry?.managerName || entry?.companyName || 'Manager').trim(),
          companyName: String(entry?.companyName || '').trim(),
          workspaceId: String(entry?.workspaceId || '').trim(),
          locationId: String(entry?.locationId || '').trim(),
          locationName: String(entry?.locationName || '').trim(),
          city: String(entry?.city || '').trim(),
          state: String(entry?.state || '').trim()
        }))
      ].filter((entry, index, arr) => {
        const code = normalizeManagerCode(entry?.managerCode || entry?.code || '');
        if (!code) return false;
        return arr.findIndex((item) => normalizeManagerCode(item?.managerCode || item?.code || '') === code) === index;
      }));
      const workspaceDirectory = Array.isArray(currentData?.workspaceDirectory) && currentData.workspaceDirectory.length
        ? currentData.workspaceDirectory
        : mergeWorkspaceDirectory(workspaceDirectorySource(), readTestWorkspaces(), []);
      const allWorkspaceOptions = workspaceDirectory.map((workspace) => ({
        workspaceKey: String(workspace?.id || '').trim(),
        workspaceId: String(workspace?.id || '').trim(),
        companyName: String(workspace?.name || 'Gym').trim(),
        logoSrc: String(workspace?.logoSrc || '').trim(),
        logoScale: Number(workspace?.logoScale || 1) || 1,
        logoText: String(workspace?.logoText || workspace?.name || '').trim(),
        city: String(workspace?.city || '').trim(),
        state: String(workspace?.state || '').trim(),
        locations: Array.isArray(workspace?.locations) ? workspace.locations : []
      })).filter((workspace) => workspace.workspaceKey && workspace.companyName);
      const normalizedSearch = normalizeLookupText(managerSwitchSearchTerm);
      const workspaceOptions = normalizedSearch
        ? allWorkspaceOptions.filter((workspace) => {
            const haystack = [
              workspace.companyName,
              workspace.city,
              workspace.state,
              workspace.workspaceId
            ].map(normalizeLookupText).join(' ');
            return haystack.includes(normalizedSearch);
          })
        : allWorkspaceOptions;
      const selectedWorkspace = workspaceOptions.find((workspace) => workspace.workspaceKey === managerSwitchWorkspaceId) || null;
      const workspaceManagers = managerDirectory.filter((item) => getManagerWorkspaceKey(item, workspaceDirectory) === managerSwitchWorkspaceId);
      const locationOptions = selectedWorkspace
        ? (Array.isArray(selectedWorkspace.locations) ? selectedWorkspace.locations : []).map((location) => ({
            locationId: String(location?.id || '').trim(),
            name: String(location?.name || 'Location').trim(),
            city: String(location?.city || selectedWorkspace.city || '').trim(),
            state: String(location?.state || selectedWorkspace.state || '').trim()
          })).filter((location) => location.locationId && location.name)
        : [];
      let managerOptions = managerDirectory.filter((item) => {
        const workspaceMatch = getManagerWorkspaceKey(item, workspaceDirectory) === managerSwitchWorkspaceId;
        const locationMatch = String(item?.locationId || '').trim() === managerSwitchLocationId;
        return workspaceMatch && locationMatch;
      });
      if (!managerOptions.length && managerSwitchWorkspaceId && managerSwitchLocationId) {
        managerOptions = workspaceManagers;
      }
      if (!managerOptions.length && managerSwitchWorkspaceId) {
        managerOptions = managerDirectory.filter((item) => getManagerWorkspaceKey(item, workspaceDirectory) === managerSwitchWorkspaceId);
      }
      const selectedLocation = locationOptions.find((location) => location.locationId === managerSwitchLocationId) || null;
      const stageMarkup = !managerSwitchWorkspaceId
        ? `
          <div class="trainer-dashboard-manager-search-row">
            <input
              id="trainer-dashboard-manager-switch-search"
              type="text"
              value="${escapeHtml(managerSwitchSearchTerm)}"
              placeholder="Search gyms, studios, or coaching brands"
            >
          </div>
          <div class="trainer-dashboard-manager-muted">Gym</div>
          ${workspaceOptions.length ? `
            <div class="entry-logo-grid">
              ${workspaceOptions.map((workspace) => `
                <button class="entry-logo-card ${managerSwitchWorkspaceId === workspace.workspaceKey ? 'is-selected' : ''}" type="button" data-manager-switch-workspace="${escapeHtml(workspace.workspaceKey)}">
                  <div class="entry-logo-mark">
                    ${workspace.logoSrc
                      ? `<img class="entry-logo-image" src="${escapeHtml(workspace.logoSrc)}" alt="${escapeHtml(workspace.companyName || 'Gym')} logo" style="transform:scale(${Number(workspace.logoScale || 1)});">`
                      : `<span class="entry-logo-monogram">${escapeHtml(workspaceMonogram(workspace))}</span>`}
                  </div>
                </button>
              `).join('')}
            </div>
          ` : `<div class="trainer-dashboard-manager-muted">No gyms matched that search.</div>`}
        `
        : !managerSwitchLocationId
          ? `
            <div class="trainer-dashboard-manager-step-head">
              <div class="trainer-dashboard-manager-muted">Selected gym</div>
              <button type="button" class="trainer-dashboard-manager-modal-secondary" data-manager-switch-reset="workspace">Change gym</button>
            </div>
            <div class="trainer-dashboard-manager-step-selection">${escapeHtml(selectedWorkspace?.companyName || 'Gym')}</div>
            <div class="trainer-dashboard-manager-muted">Location</div>
            ${locationOptions.length ? `
              <div class="entry-location-grid">
                ${locationOptions.map((location) => `
                  <button class="entry-location-card ${managerSwitchLocationId === location.locationId ? 'is-selected' : ''}" type="button" data-manager-switch-location="${escapeHtml(location.locationId)}">
                    <strong>${escapeHtml(location.name || 'Location')}</strong>
                    <small>${escapeHtml([location.city, location.state].filter(Boolean).join(', ') || location.locationId || '')}</small>
                  </button>
                `).join('')}
              </div>
            ` : `<div class="trainer-dashboard-manager-muted">No locations found for that gym.</div>`}
          `
          : `
            <div class="trainer-dashboard-manager-step-head">
              <div class="trainer-dashboard-manager-muted">Selected location</div>
              <button type="button" class="trainer-dashboard-manager-modal-secondary" data-manager-switch-reset="location">Change location</button>
            </div>
            <div class="trainer-dashboard-manager-step-selection">${escapeHtml(selectedWorkspace?.companyName || 'Gym')} · ${escapeHtml(selectedLocation?.name || 'Location')}</div>
            <div class="trainer-dashboard-manager-muted">Manager</div>
            ${managerOptions.length ? `
              <div class="entry-logo-grid">
                ${managerOptions.map((manager) => {
                  const code = normalizeManagerCode(manager?.managerCode || manager?.code || '');
                  const existing = reviews.find((item) => normalizeManagerCode(item?.managerCode || '') === code && ['pending', 'approved'].includes(String(item?.status || '').trim().toLowerCase()));
                  const status = String(existing?.status || '').trim().toLowerCase();
                  return `
                    <button class="entry-logo-card entry-manager-card ${status ? 'is-selected' : ''}" type="button" data-manager-switch-request="${escapeHtml(code)}" ${status ? 'disabled' : ''}>
                      <div class="entry-logo-mark entry-manager-mark">
                        <span class="entry-logo-monogram">${escapeHtml(String(manager.companyName || manager.managerName || code).trim().slice(0, 2).toUpperCase())}</span>
                      </div>
                      <strong>${escapeHtml(manager.managerName || 'Manager')}</strong>
                      ${status ? `<small>${escapeHtml(status === 'approved' ? 'Already approved' : 'Already applied')}</small>` : ''}
                    </button>
                  `;
                }).join('')}
              </div>
            ` : `<div class="trainer-dashboard-manager-muted">No managers found for that gym yet.</div>`}
          `;
      return `
        <div class="trainer-dashboard-choice-kicker">Training Manager</div>
        <h3 id="trainer-dashboard-manager-modal-title">Pick your training manager.</h3>
        <p>Choose the gym first, then the location, then the manager at that location.</p>
        <div class="trainer-dashboard-manager-list">
          ${stageMarkup}
        </div>
        <div class="trainer-dashboard-manager-modal-actions">
          <button type="button" class="trainer-dashboard-manager-modal-secondary" data-manager-switch-close="1">Close</button>
        </div>
      `;
    };

    const renderManagerSwitchConfirm = () => `
      <div class="trainer-dashboard-choice-kicker">Training Manager</div>
      <h3 id="trainer-dashboard-manager-modal-title">Switch training manager?</h3>
      <p>Are you sure? This will take your current manager off your profile and notify them before you pick another one.</p>
      <div class="trainer-dashboard-manager-modal-actions">
        <button type="button" class="trainer-dashboard-manager-modal-secondary" data-manager-switch-close="1">Cancel</button>
        <button type="button" class="trainer-dashboard-manager-modal-primary" data-manager-switch-continue="1">Continue</button>
      </div>
    `;

    const renderManagerSwitchModal = (animate = false, options = {}) => {
      if (!managerModalBodyEl) return;
      const preserveSearchFocus = options?.preserveSearchFocus === true;
      const restoreSearchFocus = () => {
        if (!preserveSearchFocus) return;
        const input = $('#trainer-dashboard-manager-switch-search');
        if (!(input instanceof HTMLInputElement)) return;
        input.focus();
        const caret = String(managerSwitchSearchTerm || '').length;
        try {
          input.setSelectionRange(caret, caret);
        } catch {}
      };
      const nextMarkup = managerSwitchPhase === 'picker'
        ? renderManagerSwitchPicker()
        : renderManagerSwitchConfirm();
      if (!animate || !managerModalBodyEl.innerHTML.trim()) {
        managerModalBodyEl.innerHTML = nextMarkup;
        restoreSearchFocus();
        return;
      }
      managerModalBodyEl.classList.add('is-fading');
      window.setTimeout(() => {
        if (!managerModalBodyEl) return;
        managerModalBodyEl.innerHTML = nextMarkup;
        managerModalBodyEl.classList.remove('is-fading');
        restoreSearchFocus();
      }, 140);
    };

    const openManagerSwitchModal = () => {
      managerSwitchPhase = 'confirm';
      managerSwitchWorkspaceId = '';
      managerSwitchLocationId = '';
      renderManagerSwitchModal();
      managerModalEl?.classList.remove('hidden');
      managerModalEl?.setAttribute('aria-hidden', 'false');
      document.body.classList.add('trainer-dashboard-choice-open');
    };

    const positionAddPanel = () => {
      if (!addPanelEl || addPanelEl.classList.contains('hidden')) return;
      const anchor = lastPlusAnchor || $('#auth-friends-btn') || $('#auth-mobile-friends');
      if (!(anchor instanceof Element)) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(420, Math.max(300, window.innerWidth - 20));
      const left = Math.max(10, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 10));
      const top = Math.min(rect.bottom + 10, window.innerHeight - 120);
      const arrowLeft = Math.max(18, Math.min((rect.left + (rect.width / 2)) - left - 8, panelWidth - 34));
      addPanelEl.style.left = `${left}px`;
      addPanelEl.style.top = `${top}px`;
      addPanelEl.style.right = 'auto';
      addPanelEl.style.setProperty('--trainer-plus-arrow-left', `${arrowLeft}px`);
    };

    const setInviteMode = (mode) => {
      selectedInviteMode = mode === 'coaching' ? 'coaching' : 'app';
      appOptionEl?.classList.toggle('active', selectedInviteMode === 'app');
      coachingOptionEl?.classList.toggle('active', selectedInviteMode === 'coaching');
      appInviteFormEl?.classList.toggle('hidden', selectedInviteMode !== 'app');
      const showCoachingForm = selectedInviteMode === 'coaching' && isStripeReady();
      coachingInviteFormEl?.classList.toggle('hidden', !showCoachingForm);
      stripeGateFormEl?.classList.toggle('hidden', !(selectedInviteMode === 'coaching' && !isStripeReady()));
      if (selectedInviteMode === 'app') {
        $('#trainer-dashboard-app-text')?.focus();
      } else if (!isStripeReady()) {
        $('#trainer-dashboard-stripe-connect')?.focus();
      } else {
        $('#trainer-dashboard-coaching-first-name')?.focus();
      }
      if (addStatusEl) addStatusEl.textContent = '';
    };

    const fillInvitePanel = () => {
      const inviteCenter = currentData?.growth?.inviteCenter || {};
      const referralCode = String(inviteCenter.referralCode || '').trim();
      const referralLink = String(inviteCenter.referralLink || '').trim();
      const stripe = currentData?.growth?.stripe || {};
      const codeEl = $('#trainer-dashboard-app-ref-code');
      const linkEl = $('#trainer-dashboard-app-ref-link');
      const stripeNextActionEl = $('#trainer-dashboard-stripe-next-action');
      if (codeEl) codeEl.textContent = referralCode || 'LOADING';
      if (linkEl) {
        linkEl.textContent = referralLink || 'Loading...';
        linkEl.href = referralLink || '#';
      }
      if (stripeNextActionEl) stripeNextActionEl.textContent = String(stripe.nextAction || 'Connect Stripe before sending paid coaching invites.').trim();
      if (stripeConnectEl) stripeConnectEl.textContent = getStripePrimaryAction(stripe).label;
    };

    const describeStripeState = (stripe = {}) => {
      const state = String(stripe?.state || '').trim();
      if (state === 'ready') return 'Stripe is connected and ready. Paid coaching invites are unlocked.';
      if (state === 'pending') return 'Stripe is still reviewing the connected account. Payments will unlock as soon as verification finishes.';
      if (state === 'incomplete') {
        const issues = Array.isArray(stripe?.requirementsCurrentlyDue) ? stripe.requirementsCurrentlyDue : [];
        if (issues.length) {
          return `Stripe still needs: ${issues.slice(0, 2).join(', ')}. Finish onboarding in Stripe, then come back here.`;
        }
        return 'Stripe setup is still incomplete. Finish the Stripe onboarding steps, then come back here.';
      }
      return 'Stripe is not connected yet. Click Connect Stripe to open Stripe-hosted onboarding.';
    };

    const launchStripeConnect = async (mode = 'connect') => {
      const connectPath = mode === 'manage'
        ? '/api/stripe/connect/start?mode=manage'
        : '/api/stripe/connect/start';
      if (addStatusEl) addStatusEl.textContent = mode === 'manage'
        ? 'Opening Stripe account...'
        : 'Opening Stripe onboarding...';
      window.location.href = connectPath;
      return true;
    };

    const refreshStripeStatus = async () => {
      if (addStatusEl) addStatusEl.textContent = 'Refreshing Stripe status...';
      let resp = await api('/api/stripe/connect/status', { method: 'GET' });
      if (resp.status === 404) {
        resp = await api('/api/auth/trainer/stripe/refresh', { method: 'POST', body: '{}' });
      }
      if (!resp.ok || !resp.json?.ok) {
        if (addStatusEl) addStatusEl.textContent = resp.json?.error || 'Could not refresh Stripe status.';
        return false;
      }
      await loadDashboard();
      setInviteMode(selectedInviteMode);
      if (addStatusEl) addStatusEl.textContent = describeStripeState(resp.json?.stripe || {});
      return true;
    };

    const ensureTrainerCrmStyles = () => {
      if (document.getElementById('trainer-crm-styles')) return;
      const s = document.createElement('style');
      s.id = 'trainer-crm-styles';
      s.textContent = [
        '.client-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;}',
        '.client-card{background:#fffdf7;border:1px solid rgba(150,110,35,.22);border-radius:16px;padding:16px;box-shadow:0 12px 28px rgba(120,90,20,.07);display:flex;flex-direction:column;gap:12px;}',
        ':root[data-theme="dark"] .client-card{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);}',
        '.client-card-top{display:flex;align-items:center;gap:11px;}',
        '.client-avatar{width:42px;height:42px;border-radius:999px;flex:0 0 42px;display:grid;place-items:center;font:900 14px/1 "Space Grotesk",system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#e0b34a,#8a5c33);}',
        '.client-id{flex:1;min-width:0;}',
        '.client-name{font:800 15px/1.2 "Space Grotesk",system-ui,sans-serif;}',
        '.client-email{font-size:12px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.client-pay{font:800 10px/1.5 "Space Grotesk",system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px;white-space:nowrap;}',
        '.client-pay-ok{background:rgba(47,122,61,.16);color:#2f7a3d;}',
        '.client-pay-bad{background:rgba(180,40,40,.14);color:#b42828;}',
        '.client-pay-warn{background:rgba(212,175,55,.2);color:#a1751f;}',
        '.client-pay-muted{background:rgba(120,120,120,.14);color:#6b6b6b;}',
        '.client-status-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
        '.client-stat{font:700 11px/1.4 "Space Grotesk",system-ui,sans-serif;padding:3px 9px;border-radius:999px;border:1px solid rgba(150,110,35,.2);}',
        '.client-stat.on{color:#2f7a3d;border-color:rgba(47,122,61,.4);background:rgba(47,122,61,.08);}',
        '.client-stat.off{opacity:.55;}',
        '.client-since{margin-left:auto;font-size:11px;opacity:.5;}',
        '.client-actions{display:flex;flex-direction:column;gap:9px;margin-top:2px;}',
        '.client-plan-group{display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:9px 10px;border-radius:12px;background:rgba(212,175,55,.06);border:1px solid rgba(185,138,43,.16);}',
        ':root[data-theme="dark"] .client-plan-group{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.08);}',
        '.client-plan-tag{font:800 10px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#a1751f;opacity:.8;margin-right:2px;flex:0 0 auto;}',
        '.client-btn{font:800 12px/1 "Space Grotesk",system-ui,sans-serif;padding:8px 12px;border-radius:10px;border:1px solid rgba(185,138,43,.4);background:rgba(212,175,55,.16);color:#7a5312;cursor:pointer;transition:background .12s ease;}',
        '.client-btn:hover{background:rgba(212,175,55,.28);}',
        '.client-btn.primary{background:#b98a2b;color:#fff;border-color:transparent;align-self:flex-start;}',
        '.client-btn.primary:hover{background:#a6791f;}',
        '.client-btn.ghost{background:transparent;font-weight:700;opacity:.9;}',
        '.client-btn.ghost:hover{background:rgba(212,175,55,.14);}',
        '.consult-hit-notes{display:block;margin:10px 0 8px;}',
        '.consult-hit-notes span{display:block;font:800 10px/1.4 "Space Grotesk",system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin-bottom:4px;}',
        '.consult-hit-notes textarea{width:100%;min-height:52px;border:1px solid rgba(150,110,35,.28);border-radius:10px;padding:8px 10px;font:600 13px/1.4 inherit;background:#fdf8ec;color:inherit;resize:vertical;}',
        '.consult-hit-btn.primary{background:#b98a2b;color:#fff;border-color:transparent;}',
        // History timeline
        '.history-timeline{display:flex;flex-direction:column;gap:0;}',
        '.history-item{display:flex;gap:12px;padding:12px 2px;border-bottom:1px solid rgba(150,110,35,.12);}',
        '.history-time{flex:0 0 74px;font:800 12px/1.5 ui-monospace,monospace;color:#a1751f;}',
        '.history-body{flex:1;min-width:0;}',
        '.history-title{font-weight:700;font-size:13.5px;}',
        '.history-sub{font-size:12px;opacity:.6;margin-top:2px;}',
        '.history-dot{flex:0 0 10px;width:10px;height:10px;border-radius:999px;margin-top:5px;background:#b98a2b;}',
        '.history-dot.bad{background:#b42828;}.history-dot.ok{background:#2f7a3d;}.history-dot.info{background:#3a6ea5;}',
        '.history-peek{margin-top:5px;font:800 11px/1 "Space Grotesk",system-ui,sans-serif;color:#7a5312;background:none;border:0;cursor:pointer;text-decoration:underline;padding:0;}'
      ].join('\n');
      document.head.appendChild(s);
    };

    const renderDashboardShell = () => {
      ensureTrainerCrmStyles();
      if (managerHost) managerHost.innerHTML = renderTrainerManagerCard(currentData);
      shell.innerHTML = renderTrainerDashboard(currentData);
      const requestedTab = String(pageParams.get('tab') || '').trim();
      if (requestedTab) {
        shell.querySelectorAll('[data-clients-view]').forEach((button) => {
          const matches = String(button.getAttribute('data-clients-view') || '').trim() === requestedTab;
          button.classList.toggle('active', matches);
          button.setAttribute('aria-pressed', matches ? 'true' : 'false');
        });
      }
      syncClientsPanels();
      // Consult Form Hits is its own control-panel destination (no longer a
      // Clients sub-tab): show only that panel and hide the client pills.
      if (requestedTab === 'consult-form-hits') {
        const pillsRow = shell.querySelector('.account-trainer-clients-pills');
        if (pillsRow) pillsRow.style.display = 'none';
        shell.querySelectorAll('[data-clients-panel]').forEach((panel) => {
          const isConsultPanel = String(panel.getAttribute('data-clients-panel') || '') === 'consult-form-hits';
          if (isConsultPanel) {
            panel.removeAttribute('hidden');
            panel.classList.add('active');
            panel.style.display = '';
          } else {
            panel.style.display = 'none';
          }
        });
      }
      // Sidebar active state: Clients and Consult Form Hits are the same page
      // with different tabs, so main.js can't tell them apart — fix it here so
      // the right one highlights. Re-apply on a tick since main.js also runs.
      const syncSidebarActive = () => {
        const panel = document.getElementById('control-panel');
        if (!panel) return;
        const isConsult = requestedTab === 'consult-form-hits';
        panel.querySelectorAll('.control-link').forEach((link) => {
          const href = String(link.getAttribute('href') || '');
          if (href.indexOf('tab=consult-form-hits') >= 0) {
            link.classList.toggle('active', isConsult);
          } else if (/(^|\/)trainer-dashboard\.html$/.test(href)) {
            link.classList.toggle('active', !isConsult);
          }
        });
      };
      syncSidebarActive();
      window.setTimeout(syncSidebarActive, 400);
      bindTrainerPageChooser(meUser, currentData);
      fillInvitePanel();
      // Navbar "+" quick-add lands here with ?action=add-client: open the
      // invite center immediately (once — not on every rerender).
      if (String(pageParams.get('action') || '').trim() === 'add-client' && !renderDashboardShell.__addClientOpened) {
        renderDashboardShell.__addClientOpened = true;
        window.setTimeout(() => {
          try { openAddPanel('app', $('#auth-friends-btn') || $('#auth-mobile-friends')); } catch { /* ignore */ }
        }, 250);
      }
    };

    const stopManagerReviewPolling = () => {
      if (!managerReviewPollTimer) return;
      window.clearInterval(managerReviewPollTimer);
      managerReviewPollTimer = null;
    };

    const refreshManagerReviewLiveState = async () => {
      if (!currentData || document.hidden) return;
      const before = JSON.stringify({
        managerCode: normalizeManagerCode(currentData?.trainer?.managerCode || ''),
        reviews: Array.isArray(currentData?.trainerManagerReviews)
          ? currentData.trainerManagerReviews.map((item) => ({
              id: String(item?.id || '').trim(),
              status: String(item?.status || '').trim().toLowerCase(),
              managerCode: normalizeManagerCode(item?.managerCode || '')
            }))
          : []
      });
      const [dashboardResp, managerDirResp, managerReviewsResp] = await Promise.all([
        api('/api/auth/trainer/dashboard'),
        api('/api/auth/trainer/manager-directory'),
        api('/api/auth/trainer/manager-review-requests')
      ]);
      if (!dashboardResp.ok || !dashboardResp.json?.ok) return;
      const nextDashboard = dashboardResp.json;
      const nextManagerDirectory = Array.isArray(managerDirResp?.json?.managers) ? managerDirResp.json.managers : [];
      const nextReviews = Array.isArray(managerReviewsResp?.json?.requests) ? managerReviewsResp.json.requests : [];
      const after = JSON.stringify({
        managerCode: normalizeManagerCode(nextDashboard?.trainer?.managerCode || ''),
        reviews: nextReviews.map((item) => ({
          id: String(item?.id || '').trim(),
          status: String(item?.status || '').trim().toLowerCase(),
          managerCode: normalizeManagerCode(item?.managerCode || '')
        }))
      });
      if (before === after) return;
      currentData = {
        ...currentData,
        ...nextDashboard,
        managerDirectory: nextManagerDirectory,
        trainerManagerReviews: nextReviews,
        managerSearchTerm
      };
      const nextIncomingManagerRequestCount = getIncomingManagerRequests(nextReviews).length;
      renderDashboardShell();
      if (nextIncomingManagerRequestCount > lastIncomingManagerRequestCount) {
        setStatus('New manager request received. Requests updated live.');
      } else if (normalizeManagerCode(currentData?.trainer?.managerCode || '')) {
        setStatus('Training manager approved. Dashboard updated live.');
      } else {
        setStatus('Training manager removed. Dashboard updated live.');
      }
      lastIncomingManagerRequestCount = nextIncomingManagerRequestCount;
      if (!shouldWatchManagerLiveState()) {
        stopManagerReviewPolling();
      }
    };

    const syncManagerReviewPolling = () => {
      if (!shouldWatchManagerLiveState()) {
        stopManagerReviewPolling();
        return;
      }
      if (managerReviewPollTimer) return;
      managerReviewPollTimer = window.setInterval(() => {
        void refreshManagerReviewLiveState();
      }, 5000);
    };

    const handleManagerCardAction = async (target, event = null) => {
      if (target.closest('[data-manager-find-open]')) {
        if (event) event.preventDefault();
        managerSwitchPhase = 'picker';
        managerSwitchWorkspaceId = '';
        managerSwitchLocationId = '';
        managerSwitchSearchTerm = '';
        renderManagerSwitchModal();
        managerModalEl?.classList.remove('hidden');
        managerModalEl?.setAttribute('aria-hidden', 'false');
        document.body.classList.add('trainer-dashboard-choice-open');
        return true;
      }
      if (target.closest('[data-manager-switch-open]')) {
        if (event) event.preventDefault();
        openManagerSwitchModal();
        return true;
      }
      return false;
    };

    const loadDashboard = async () => {
      const [dashboardResp, managerDirResp, managerReviewsResp, workspaceResp, leadsResp, funnelResp] = await Promise.all([
        api('/api/auth/trainer/dashboard'),
        api('/api/auth/trainer/manager-directory'),
        api('/api/auth/trainer/manager-review-requests'),
        api('/api/auth/workspace-requests/public'),
        api('/api/auth/trainer/leads'),
        api('/api/training/website-insights').catch(() => null)
      ]);
      if (!dashboardResp.ok || !dashboardResp.json?.ok) {
        const managerContext = getManagerDashboardContext();
        if (managerContext.isManager) {
          currentData = { trainer: {}, growth: {}, trainingRequests: [], isTrainer: false };
          setStatus('Manager control panel ready.');
          shell.innerHTML = renderTrainerDashboard(currentData);
          return true;
        }
        setStatus('Could not load trainer dashboard.');
        shell.innerHTML = renderEmpty('Trainer dashboard failed to load right now.');
        return false;
      }
      currentData = dashboardResp.json;
      currentData.managerDirectory = Array.isArray(managerDirResp?.json?.managers) ? managerDirResp.json.managers : [];
      currentData.trainerManagerReviews = Array.isArray(managerReviewsResp?.json?.requests) ? managerReviewsResp.json.requests : [];
      lastIncomingManagerRequestCount = getIncomingManagerRequests(currentData.trainerManagerReviews).length;
      currentData.workspaceDirectory = mergeWorkspaceDirectory(
        [...workspaceDirectorySource(), ...readTestWorkspaces()],
        Array.isArray(workspaceResp?.json?.workspaces) ? workspaceResp.json.workspaces : [],
        Array.isArray(workspaceResp?.json?.locationRequests) ? workspaceResp.json.locationRequests : []
      );
      currentData.pageLeads = Array.isArray(leadsResp?.json?.leads) ? leadsResp.json.leads : [];
      // Website funnel pre-visit answers become consult hits too.
      currentData.funnelLeads = funnelLeadsFromInsights(funnelResp?.json);
      currentData.leadUi = {
        search: leadSearchTerm,
        stage: leadStageFilter,
        tag: leadTagFilter
      };
      currentData.managerSearchTerm = managerSearchTerm;
      const stripeError = String(pageParams.get('stripe_error') || '').trim();
      setStatus(stripeError || (currentData?.isTrainer
        ? describeStripeState(currentData?.growth?.stripe || {})
        : 'Trainer onboarding not completed yet.')); 
      renderDashboardShell();
      syncManagerReviewPolling();
      return true;
    };

    const getPendingWorkoutApprovalById = (workoutIdRaw) => {
      const workoutId = String(workoutIdRaw || '').trim();
      const list = Array.isArray(currentData?.growth?.pendingWorkoutApprovals)
        ? currentData.growth.pendingWorkoutApprovals
        : [];
      return list.find((row) => String(row?.workoutId || '').trim() === workoutId) || null;
    };

    const syncClientsPanels = () => {
      let activeViews = new Set(
        Array.from(shell.querySelectorAll('[data-clients-view].active'))
          .map((button) => String(button.getAttribute('data-clients-view') || '').trim())
          .filter(Boolean)
      );
      // Default to the "Current" tab so panels don't stack all at once. Reflect
      // it on the pill too so the highlight matches what's shown.
      if (activeViews.size === 0) {
        const currentPill = shell.querySelector('[data-clients-view="current"]');
        if (currentPill) {
          currentPill.classList.add('active');
          currentPill.setAttribute('aria-pressed', 'true');
        }
        activeViews = new Set(['current']);
      }
      shell.querySelectorAll('[data-clients-panel]').forEach((panel) => {
        const panelKey = String(panel.getAttribute('data-clients-panel') || '').trim();
        // Consult Form Hits is its own console destination (sidebar link), never
        // part of the in-page tab browsing.
        const active = panelKey !== 'consult-form-hits' && activeViews.has(panelKey);
        panel.classList.toggle('active', active);
        if (active) {
          panel.removeAttribute('hidden');
          panel.style.display = '';
        } else {
          panel.setAttribute('hidden', '');
          panel.style.display = 'none';
        }
      });
    };

    const closeAddPanel = () => {
      addPanelEl?.classList.add('hidden');
      if (addStatusEl) addStatusEl.textContent = '';
    };

    const openAddPanel = (mode = 'app', anchor = null) => {
      if (!addPanelEl) return;
      if (anchor instanceof Element) lastPlusAnchor = anchor;
      addPanelEl.classList.remove('hidden');
      fillInvitePanel();
      setInviteMode(mode);
      positionAddPanel();
      if (addStatusEl) addStatusEl.textContent = '';
    };

    const toggleAddPanel = (anchor = null) => {
      if (!addPanelEl) return;
      if (anchor instanceof Element) lastPlusAnchor = anchor;
      addPanelEl.classList.toggle('hidden');
      if (!addPanelEl.classList.contains('hidden')) {
        fillInvitePanel();
        setInviteMode(selectedInviteMode);
        positionAddPanel();
      }
      if (addStatusEl) addStatusEl.textContent = '';
    };

    [$('#auth-friends-btn'), $('#auth-mobile-friends')].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        toggleAddPanel(btn);
      }, true);
    });

    addCancelEl?.addEventListener('click', closeAddPanel);
    stripeCloseEl?.addEventListener('click', closeAddPanel);
    stripeConnectEl?.addEventListener('click', async () => {
      await launchStripeConnect(currentData?.growth?.stripe?.state === 'ready' ? 'manage' : 'connect');
    });
    stripeRefreshEl?.addEventListener('click', async () => {
      await refreshStripeStatus();
    });

    appOptionEl?.addEventListener('click', () => setInviteMode('app'));
    coachingOptionEl?.addEventListener('click', () => setInviteMode('coaching'));

    coachingInviteFormEl?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (addStatusEl) addStatusEl.textContent = 'Saving...';
      const resp = await api('/api/auth/trainer/invite/coaching', {
        method: 'POST',
        body: JSON.stringify({
          firstName: $('#trainer-dashboard-coaching-first-name')?.value || '',
          lastName: $('#trainer-dashboard-coaching-last-name')?.value || '',
          email: $('#trainer-dashboard-coaching-email')?.value || '',
          phone: $('#trainer-dashboard-coaching-phone')?.value || '',
          packageName: $('#trainer-dashboard-coaching-package')?.value || '',
          packagePrice: $('#trainer-dashboard-coaching-price')?.value || '',
          billingFrequency: $('#trainer-dashboard-coaching-frequency')?.value || '',
          startDate: $('#trainer-dashboard-coaching-start-date')?.value || ''
        })
      });
      if (!resp.ok || !resp.json?.ok) {
        if (addStatusEl) addStatusEl.textContent = resp.json?.error || 'Could not create coaching invite.';
        return;
      }
      if (addStatusEl) addStatusEl.textContent = 'Coaching invite created.';
      coachingInviteFormEl.reset();
      await loadDashboard();
    });

    shell.addEventListener('click', async (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const clientViewBtn = target.closest('[data-clients-view]');
      if (clientViewBtn instanceof Element) {
        e.preventDefault();
        // Single-select: clicking a pill makes it the only active view (one
        // panel at a time), instead of stacking every panel on screen.
        shell.querySelectorAll('[data-clients-view]').forEach((btn) => {
          const on = btn === clientViewBtn;
          btn.classList.toggle('active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        syncClientsPanels();
        return;
      }
      const leadSaveBtn = target.closest('[data-lead-save]');
      if (leadSaveBtn instanceof Element) {
        const leadId = String(leadSaveBtn.getAttribute('data-lead-save') || '').trim();
        if (!leadId) return;
        const stageValue = String(shell.querySelector(`[data-lead-stage="${leadId}"]`)?.value || '').trim();
        const noteValue = String(shell.querySelector(`[data-lead-notes="${leadId}"]`)?.value || '').trim();
        const tagsValue = String(shell.querySelector(`[data-lead-tags="${leadId}"]`)?.value || '').trim();
        setStatus('Saving lead...');
        const resp = await api('/api/auth/trainer/lead', {
          method: 'POST',
          body: JSON.stringify({
            leadId,
            status: stageValue,
            notes: noteValue,
            tags: tagsValue.split(',').map((item) => String(item || '').trim()).filter(Boolean)
          })
        });
        if (!resp.ok || !resp.json?.ok) {
          setStatus(resp.json?.error || 'Could not save lead.');
          return;
        }
        currentData.pageLeads = (Array.isArray(currentData.pageLeads) ? currentData.pageLeads : []).map((lead) => (
          String(lead?.id || '').trim() === leadId
            ? { ...lead, ...resp.json.lead }
            : lead
        ));
        currentData.leadUi = { search: leadSearchTerm, stage: leadStageFilter, tag: leadTagFilter };
        renderDashboardShell();
        setStatus('Lead updated.');
        return;
      }
      const clientAccountTrigger = target.closest('[data-view-client-account]');
      if (clientAccountTrigger instanceof Element) {
        const userId = String(clientAccountTrigger.getAttribute('data-view-client-account') || '').trim();
        const href = buildTrainerClientAccountHref(userId);
        if (!href) {
          setStatus('This client does not have an attached account yet.');
          return;
        }
        window.location.href = href;
        return;
      }
      // Consult hit -> move to Clients list.
      const moveTrigger = target.closest('[data-consult-move]');
      if (moveTrigger instanceof Element) {
        const name = String(moveTrigger.getAttribute('data-move-name') || '').trim() || 'New client';
        const email = String(moveTrigger.getAttribute('data-move-email') || '').trim();
        const phone = String(moveTrigger.getAttribute('data-move-phone') || '').trim();
        const noteEl = moveTrigger.closest('.consult-hit-card')?.querySelector('[data-consult-note]');
        const notes = noteEl ? String(noteEl.value || '').trim() : '';
        setStatus(`Moving ${name} to Clients…`);
        const resp = await api('/api/auth/trainer/clients', {
          method: 'POST',
          body: JSON.stringify({ displayName: name, email, phone, notes, source: 'consult' })
        }).catch(() => null);
        if (resp && resp.json && resp.json.ok) {
          setStatus(`${name} moved to Clients.`);
          await loadDashboard();
        } else {
          setStatus(resp?.json?.error || 'Could not move to Clients.');
        }
        return;
      }
      // Save a note on a coach-page consult lead.
      const saveNoteTrigger = target.closest('[data-consult-save]');
      if (saveNoteTrigger instanceof Element) {
        const leadId = String(saveNoteTrigger.getAttribute('data-consult-save') || '').trim();
        const noteEl = saveNoteTrigger.closest('.consult-hit-card')?.querySelector('[data-consult-note]');
        const notes = noteEl ? String(noteEl.value || '').trim() : '';
        const resp = await api('/api/auth/trainer/lead', {
          method: 'POST', body: JSON.stringify({ id: leadId, notes })
        }).catch(() => null);
        setStatus(resp && resp.json && resp.json.ok ? 'Note saved.' : 'Could not save note.');
        return;
      }
      // Add / Modify training or nutrition plan — peer into the client account
      // and land on the right surface.
      //  • MODIFY opens the in-app editor (nutrition.html / training.html) and
      //    keeps the existing plan intact.
      //  • ADD drops into the onboarding questions the trainer answers on the
      //    client's behalf (meal-program.html picker for nutrition, training.html
      //    wizard). When a plan already exists this REPLACES it, so we confirm
      //    first with an erase warning.
      const planTrigger = target.closest('[data-client-plan]');
      if (planTrigger instanceof Element) {
        const userId = String(planTrigger.getAttribute('data-client-uid') || '').trim();
        const kind = String(planTrigger.getAttribute('data-client-plan') || '').trim();
        const mode = String(planTrigger.getAttribute('data-plan-mode') || 'modify').trim();
        const hasPlan = String(planTrigger.getAttribute('data-client-has') || '0') === '1';
        const cname = String(planTrigger.getAttribute('data-client-name') || 'this client').trim();
        const label = kind === 'nutrition' ? 'nutrition plan' : 'training plan';
        const editorPage = kind === 'nutrition' ? '/nutrition.html' : '/training.html';
        const questionPage = kind === 'nutrition' ? '/meal-program.html' : '/training.html?from=intake';
        const goTo = (returnTo) => {
          const href = buildTrainerClientAccountHref(userId, returnTo);
          if (!href) { setStatus('This client has no attached account yet.'); return; }
          window.location.href = href;
        };
        if (mode === 'modify') { goTo(editorPage); return; }
        // mode === 'add' (fresh build through the questions)
        if (hasPlan) {
          openPlanEraseConfirm({
            title: `Start ${cname}'s ${label} over?`,
            body: `This erases ${cname}'s current ${label} and walks through the questions again to build a brand-new one. Their old ${label} can't be recovered.`,
            confirmLabel: `Erase & rebuild`,
            onConfirm: () => goTo(questionPage)
          });
        } else {
          goTo(questionPage);
        }
        return;
      }
      // Send a training / nutrition PDF to the client. If they already have a
      // plan of that kind, the PDF becomes what shows in their account for that
      // plan — so confirm the overwrite first.
      const docTrigger = target.closest('[data-client-doc]');
      if (docTrigger instanceof Element) {
        const input = document.getElementById('client-doc-input');
        if (!input) return;
        const kind = String(docTrigger.getAttribute('data-client-doc') || '').trim();
        const cname = String(docTrigger.getAttribute('data-client-name') || 'this client').trim();
        const hasPlan = String(docTrigger.getAttribute('data-client-has') || '0') === '1';
        const label = kind === 'nutrition' ? 'nutrition plan' : 'training plan';
        const openPicker = () => {
          input.dataset.uid = String(docTrigger.getAttribute('data-client-uid') || '').trim();
          input.dataset.kind = kind;
          input.dataset.cname = cname;
          input.value = '';
          input.click();
        };
        if (hasPlan) {
          openPlanEraseConfirm({
            title: `Send a PDF over ${cname}'s ${label}?`,
            body: `${cname} already has a ${label} in the app. The PDF you upload will show at the top of their ${kind === 'nutrition' ? 'Nutrition' : 'Training'} page as their coach's plan. Continue?`,
            confirmLabel: 'Choose PDF',
            onConfirm: openPicker
          });
        } else {
          openPicker();
        }
        return;
      }
      const workoutPdfTrigger = target.closest('[data-workout-review-pdf]');
      if (workoutPdfTrigger instanceof Element) {
        e.preventDefault();
        const workoutId = String(workoutPdfTrigger.getAttribute('data-workout-review-pdf') || '').trim();
        const workout = getPendingWorkoutApprovalById(workoutId);
        if (!workout) {
          setStatus('That workout review is no longer available.');
          return;
        }
        if (!openTrainerWorkoutApprovalPdf(workout)) {
          setStatus('Allow pop-ups to view the workout PDF.');
        }
        return;
      }
      const workoutApproveTrigger = target.closest('[data-workout-review-approve]');
      if (workoutApproveTrigger instanceof Element) {
        e.preventDefault();
        const workoutId = String(workoutApproveTrigger.getAttribute('data-workout-review-approve') || '').trim();
        if (!workoutId) return;
        setStatus('Approving workout...');
        const resp = await api('/api/auth/trainer/workout-review/approve', {
          method: 'POST',
          body: JSON.stringify({ workoutId })
        });
        if (!resp.ok || !resp.json?.ok) {
          setStatus(resp.json?.error || 'Could not approve workout.');
          return;
        }
        setStatus('Workout approved.');
        await loadDashboard();
        return;
      }
      const inviteMode = target.getAttribute('data-open-invite');
      if (inviteMode) {
        e.preventDefault();
        e.stopPropagation();
        openAddPanel(inviteMode === 'coaching' ? 'coaching' : 'app', $('#auth-friends-btn') || $('#auth-mobile-friends'));
        return;
      }
      const stripeAction = target.getAttribute('data-stripe-action');
      if (stripeAction) {
        e.preventDefault();
        if (stripeAction === 'refresh') {
          await refreshStripeStatus();
          return;
        }
        await launchStripeConnect(stripeAction);
        return;
      }
      const trainingRequestAction = target.getAttribute('data-training-request-action');
      const trainingRequestId = target.getAttribute('data-request-id');
      if (trainingRequestAction && trainingRequestId) {
        e.preventDefault();
        setStatus(trainingRequestAction === 'approve'
          ? 'Approving training request...'
          : 'Denying training request...');
        const resp = await api(
          trainingRequestAction === 'approve'
            ? '/api/auth/trainer/training-request/approve'
            : '/api/auth/trainer/training-request/deny',
          {
            method: 'POST',
            body: JSON.stringify({ requestId: trainingRequestId })
          }
        );
        if (!resp.ok || !resp.json?.ok) {
          setStatus(resp.json?.error || 'Could not update training request.');
          return;
        }
        setStatus(trainingRequestAction === 'approve'
          ? 'Training request approved.'
          : 'Training request denied.');
        await loadDashboard();
        return;
      }
      const managerReviewAction = target.getAttribute('data-manager-review-action');
      const managerReviewId = target.getAttribute('data-manager-review-id');
      if (managerReviewAction && managerReviewId) {
        e.preventDefault();
        const nextStatus = managerReviewAction === 'approve' ? 'approved' : 'denied';
        const requests = readTrainerManagerReviews();
        const nextRequests = requests.map((request) => {
          if (String(request?.id || '') !== String(managerReviewId)) return request;
          return {
            ...request,
            status: nextStatus,
            reviewedAt: Date.now()
          };
        });
        writeTrainerManagerReviews(nextRequests);
        setStatus(nextStatus === 'approved'
          ? 'Trainer review approved.'
          : 'Trainer review rejected.');
        await loadDashboard();
        return;
      }
      const trainerManagerRequestAction = target.getAttribute('data-trainer-manager-request-action');
      const trainerManagerRequestId = target.getAttribute('data-manager-request-id');
      if (trainerManagerRequestAction && trainerManagerRequestId) {
        e.preventDefault();
        const isApprove = trainerManagerRequestAction === 'approve';
        if (isApprove) {
          const activeManagerCode = normalizeManagerCode(currentData?.trainer?.managerCode || '');
          const incomingRequest = getIncomingManagerRequestById(currentData, trainerManagerRequestId);
          const nextManagerCode = normalizeManagerCode(incomingRequest?.managerCode || '');
          const currentManagerEntry = (Array.isArray(currentData?.managerDirectory) ? currentData.managerDirectory : [])
            .find((item) => normalizeManagerCode(item?.managerCode || item?.code || '') === activeManagerCode) || null;
          const nextManagerLabel = String(
            incomingRequest?.managerName
            || incomingRequest?.managerCompanyName
            || nextManagerCode
            || 'this manager'
          ).trim();
          if (activeManagerCode && nextManagerCode && activeManagerCode !== nextManagerCode) {
            const currentManagerLabel = String(
              currentManagerEntry?.managerName
              || currentManagerEntry?.companyName
              || currentData?.trainer?.managerName
              || currentData?.trainer?.managerDisplayName
              || currentData?.trainer?.managerCompanyName
              || activeManagerCode
              || 'your current manager'
            ).trim();
            const confirmed = window.confirm(
              `Confirm approval: this will remove your current manager ${currentManagerLabel} and replace them with ${nextManagerLabel}. Do you want to continue?`
            );
            if (!confirmed) {
              setStatus('Manager switch cancelled.');
              return;
            }
          }
        }
        setStatus(isApprove ? 'Approving manager request...' : 'Denying manager request...');
        const resp = await api(
          isApprove
            ? '/api/auth/trainer/manager-review-request/approve'
            : '/api/auth/trainer/manager-review-request/deny',
          {
            method: 'POST',
            body: JSON.stringify({ requestId: trainerManagerRequestId })
          }
        );
        if (!resp.ok || !resp.json?.ok) {
          setStatus(resp.json?.error || 'Could not update manager request.');
          return;
        }
        await loadDashboard();
        setStatus(isApprove ? 'Manager request approved and trainer account updated.' : 'Manager request denied.');
        return;
      }
      if (target.id === 'account-trainer-copy-link') {
        const input = $('#account-trainer-referral-link');
        try {
          await navigator.clipboard.writeText(String(input?.value || '').trim());
          setStatus('Referral link copied.');
        } catch {
          setStatus('Could not copy referral link.');
        }
      }
    });

    shell.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.id === 'trainer-leads-search') {
        leadSearchTerm = String(target.value || '').trim();
      }
      if (target.id === 'trainer-leads-tag-filter') {
        leadTagFilter = String(target.value || '').trim();
      }
      if (target.id === 'trainer-leads-stage-filter') {
        leadStageFilter = String(target.value || '').trim();
      }
      if (!['trainer-leads-search', 'trainer-leads-tag-filter', 'trainer-leads-stage-filter'].includes(target.id)) return;
      currentData.leadUi = { search: leadSearchTerm, stage: leadStageFilter, tag: leadTagFilter };
      renderDashboardShell();
    });

    shell.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.id === 'trainer-leads-stage-filter') {
        leadStageFilter = String(target.value || '').trim();
        currentData.leadUi = { search: leadSearchTerm, stage: leadStageFilter, tag: leadTagFilter };
        renderDashboardShell();
      }
      // Client training/nutrition PDF upload.
      if (target.id === 'client-doc-input' && target.files && target.files[0]) {
        const file = target.files[0];
        const uid = String(target.dataset.uid || '').trim();
        const kind = String(target.dataset.kind || '').trim();
        const cname = String(target.dataset.cname || 'client').trim();
        if (file.size > 8 * 1024 * 1024) { setStatus('PDF is too large (max 8MB).'); return; }
        const label = kind === 'nutrition' ? 'Nutrition' : 'Training';
        const reader = new FileReader();
        reader.onload = async () => {
          setStatus(`Sending ${kind} PDF to ${cname}…`);
          const resp = await api('/api/training/client-doc', {
            method: 'POST',
            body: JSON.stringify({ clientUserId: uid, kind, filename: file.name, dataUrl: String(reader.result || '') })
          }).catch(() => null);
          if (resp && resp.json && resp.json.ok) {
            // The PDF becomes their program: the generated plan was wiped
            // server-side, so refresh the roster to flip the status pill.
            setStatus(`${label} PDF sent to ${cname} — it's now their ${kind} program.`);
            await loadDashboard();
          } else {
            setStatus('Could not send the PDF — try again.');
          }
        };
        reader.readAsDataURL(file);
      }
    });

    managerModalBackdropEl?.addEventListener('click', closeManagerSwitchModal);
    managerModalCloseEl?.addEventListener('click', closeManagerSwitchModal);
    managerModalBodyEl?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-manager-switch-close]')) {
        closeManagerSwitchModal();
        return;
      }
      const resetBtn = target.closest('[data-manager-switch-reset]');
      if (resetBtn instanceof Element) {
        const resetLevel = String(resetBtn.getAttribute('data-manager-switch-reset') || '').trim();
        if (resetLevel === 'workspace') {
          managerSwitchWorkspaceId = '';
          managerSwitchLocationId = '';
        } else if (resetLevel === 'location') {
          managerSwitchLocationId = '';
        }
        renderManagerSwitchModal(true);
        return;
      }
      const workspaceBtn = target.closest('[data-manager-switch-workspace]');
      if (workspaceBtn instanceof Element) {
        managerSwitchWorkspaceId = String(workspaceBtn.getAttribute('data-manager-switch-workspace') || '').trim();
        managerSwitchLocationId = '';
        renderManagerSwitchModal(true);
        return;
      }
      const locationBtn = target.closest('[data-manager-switch-location]');
      if (locationBtn instanceof Element) {
        managerSwitchLocationId = String(locationBtn.getAttribute('data-manager-switch-location') || '').trim();
        renderManagerSwitchModal(true);
        return;
      }
      if (target.closest('[data-manager-switch-continue]')) {
        setStatus('Removing current manager from your profile...');
        const resp = await api('/api/auth/trainer/manager-detach', { method: 'POST', body: '{}' });
        if (!resp.ok || !resp.json?.ok) {
          setStatus(resp.json?.error || 'Could not switch managers right now.');
          return;
        }
        await loadDashboard();
        managerSwitchPhase = 'picker';
        renderManagerSwitchModal(true);
        setStatus('Current manager removed. Pick the next one.');
        return;
      }
      const requestBtn = target.closest('[data-manager-switch-request]');
      if (requestBtn instanceof Element) {
        const managerCode = normalizeManagerCode(requestBtn.getAttribute('data-manager-switch-request') || '');
        const managerEntry = (Array.isArray(currentData?.managerDirectory) ? currentData.managerDirectory : [])
          .find((item) => normalizeManagerCode(item?.managerCode || item?.code || '') === managerCode);
        if (!managerEntry) {
          setStatus('That manager could not be found.');
          return;
        }
        setStatus(`Sending manager request to ${managerEntry.managerName || managerEntry.companyName || managerCode}...`);
        const resp = await api('/api/auth/trainer/manager-review-request', {
          method: 'POST',
          body: JSON.stringify(buildTrainerManagerRequestPayload(currentData, meUser, managerEntry))
        });
        if (!resp.ok || !resp.json?.ok) {
          setStatus(resp.json?.error || 'Could not send manager request.');
          return;
        }
        await loadDashboard();
        closeManagerSwitchModal();
        setStatus(`Manager request sent to ${managerEntry.managerName || managerEntry.companyName || managerCode}.`);
      }
    });

    managerHost?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      await handleManagerCardAction(target, event);
    });
    managerHost?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.id !== 'trainer-dashboard-manager-search') return;
      event.preventDefault();
      managerSearchTerm = String(target.value || '').trim();
      if (currentData) {
        currentData.managerSearchTerm = managerSearchTerm;
        renderDashboardShell();
      }
    });
    managerModalBodyEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.id === 'trainer-dashboard-manager-switch-search') {
          event.preventDefault();
          return;
        }
      }
    });
    managerModalBodyEl?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.id !== 'trainer-dashboard-manager-switch-search') return;
      managerSwitchSearchTerm = String(target.value || '').trim();
      if (managerSwitchWorkspaceId) {
        const workspaceDirectory = Array.isArray(currentData?.workspaceDirectory) ? currentData.workspaceDirectory : [];
        const selectedStillVisible = workspaceDirectory.some((workspace) => {
          const workspaceId = String(workspace?.id || '').trim();
          if (workspaceId !== managerSwitchWorkspaceId) return false;
          const haystack = [
            String(workspace?.name || '').trim(),
            String(workspace?.city || '').trim(),
            String(workspace?.state || '').trim(),
            workspaceId
          ].map(normalizeLookupText).join(' ');
          return haystack.includes(normalizeLookupText(managerSwitchSearchTerm));
        });
        if (!selectedStillVisible) {
          managerSwitchWorkspaceId = '';
          managerSwitchLocationId = '';
        }
      }
      renderManagerSwitchModal(false, { preserveSearchFocus: true });
    });

    const copyText = async (text, successMessage, eventType = '') => {
      try {
        await navigator.clipboard.writeText(String(text || '').trim());
        if (addStatusEl) addStatusEl.textContent = successMessage;
        if (eventType) await trackTrainerEvent(eventType, { mode: selectedInviteMode });
      } catch {
        if (addStatusEl) addStatusEl.textContent = 'Could not copy text.';
      }
    };

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (addPanelEl?.classList.contains('hidden')) return;
      if (target.closest('#trainer-dashboard-add-panel')) return;
      if (target.closest('[data-open-invite]')) return;
      if (target.closest('#auth-friends-btn') || target.closest('#auth-mobile-friends')) return;
      closeAddPanel();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopManagerReviewPolling();
        return;
      }
      syncManagerReviewPolling();
      void refreshManagerReviewLiveState();
    });

    window.addEventListener('resize', positionAddPanel);
    window.addEventListener('scroll', positionAddPanel, true);

    appCopyBtnEl?.addEventListener('click', async () => {
      const trainerName = String(meUser?.displayName || meUser?.username || 'This coach').trim();
      await copyText(buildAppInviteMessage(currentData?.growth?.inviteCenter || {}, trainerName), 'Invite copied.', 'trainer_referral_link_copied');
    });

    appTextBtnEl?.addEventListener('click', async () => {
      const trainerName = String(meUser?.displayName || meUser?.username || 'This coach').trim();
      const message = buildAppInviteMessage(currentData?.growth?.inviteCenter || {}, trainerName);
      await trackTrainerEvent('trainer_app_invite_sent', { channel: 'sms' });
      window.location.href = `sms:?&body=${encodeURIComponent(message)}`;
    });

    appEmailBtnEl?.addEventListener('click', async () => {
      const trainerName = String(meUser?.displayName || meUser?.username || 'This coach').trim();
      const message = buildAppInviteMessage(currentData?.growth?.inviteCenter || {}, trainerName);
      const subject = `Try ${trainerName}'s platform invite`;
      await trackTrainerEvent('trainer_app_invite_sent', { channel: 'email' });
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`, '_blank', 'noopener');
    });

    shell.addEventListener('click', async (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.id === 'account-trainer-copy-code') {
        try {
          await navigator.clipboard.writeText(String(currentData?.growth?.inviteCenter?.referralCode || '').trim());
          setStatus('Referral code copied.');
        } catch {
          setStatus('Could not copy referral code.');
        }
        return;
      }
    });

    if (window.location.search.includes('stripe_return=1')) {
      await refreshStripeStatus();
      openAddPanel('coaching', $('#auth-friends-btn') || $('#auth-mobile-friends'));
      if (addStatusEl) addStatusEl.textContent = describeStripeState(currentData?.growth?.stripe || {});
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('stripe_return');
      nextUrl.searchParams.delete('stripe_error');
      window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    } else {
      await loadDashboard();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
