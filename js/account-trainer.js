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

  function titleizeStatus(raw, fallback = 'Pending') {
    const value = String(raw || '').trim();
    if (!value) return fallback;
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
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

  function renderClientRoster(clientRoster) {
    if (!Array.isArray(clientRoster) || !clientRoster.length) {
      return renderEmpty('No trainer clients yet.');
    }
    return `
      <div class="account-trainer-roster">
        ${clientRoster.map((client) => `
          <article class="account-trainer-roster-card">
            <div class="account-trainer-roster-head">
              <div>
                <div class="account-trainer-roster-name">${escapeHtml(client.name || 'Client')}</div>
                <div class="account-trainer-roster-sub">${escapeHtml(client.email || 'No email attached yet')}</div>
              </div>
              <span class="account-trainer-roster-pill amount">${escapeHtml(formatClientAmountPill(client))}</span>
            </div>
            <div class="account-trainer-roster-meta">
              ${client.packageName ? `<span class="account-trainer-roster-pill">${escapeHtml(client.packageName)}</span>` : ''}
              <span class="account-trainer-roster-pill">${escapeHtml(titleizeStatus(client.paymentStatus, 'Pending'))}</span>
              <span class="account-trainer-roster-pill">${escapeHtml(titleizeStatus(client.source, 'Client'))}</span>
            </div>
          </article>
        `).join('')}
      </div>
    `;
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

  function renderTrainerDashboard(data) {
    const trainer = data?.trainer || {};
    const growth = data?.growth || {};
    const performance = growth?.performance || {};
    const coaching = growth?.coaching || {};
    const bonus = growth?.bonus || {};
    const earnings = growth?.earnings || {};
    const stripe = growth?.stripe || {};
    const referredUsers = Array.isArray(growth?.referredUsers) ? growth.referredUsers : [];
    const coachingClients = Array.isArray(growth?.coachingClients) ? growth.coachingClients : [];
    const clientRoster = Array.isArray(growth?.clientRoster) ? growth.clientRoster : [];
    const warnings = Array.isArray(growth?.warnings) ? growth.warnings : [];

    if (!data?.isTrainer && !trainer?.onboarded) {
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
      <div class="account-trainer-summary-grid">
        <div class="account-trainer-summary-card">
          <span>Coaching revenue</span>
          <strong>${escapeHtml(formatMoney(earnings.coachingRevenueCents || 0))}</strong>
          <small>Booked coaching revenue tied to your coaching client flow.</small>
          <div class="account-trainer-btn-row">
            <button type="button" class="account-trainer-btn" data-open-invite="coaching">Invite Client</button>
          </div>
        </div>
        <div class="account-trainer-summary-card">
          <span>Referral bonus earnings</span>
          <strong>${escapeHtml(formatMoney(earnings.referralBonusCents || 0))}</strong>
          <small>$${((bonus.bonusAmountCents || 0) / 100).toFixed(2)} per activated referred user.</small>
          <div class="account-trainer-btn-row">
            <button type="button" class="account-trainer-btn" data-open-invite="app">Invite Using Referral</button>
          </div>
        </div>
        <div class="account-trainer-summary-card">
          <span>Total earnings</span>
          <strong>${escapeHtml(formatMoney(earnings.totalEarningsCents || 0))}</strong>
          <small>Separated between coaching revenue and referral bonus earnings.</small>
        </div>
      </div>
      <div class="account-trainer-tabbar">
        <button type="button" class="account-trainer-tab active" data-trainer-tab="overview">Overview</button>
        <button type="button" class="account-trainer-tab" data-trainer-tab="clients">Clients</button>
        <button type="button" class="account-trainer-tab" data-trainer-tab="warnings">Warnings</button>
      </div>
      <div class="account-trainer-tab-panel active" data-trainer-tab-panel="overview">
        <div class="account-trainer-panel account-trainer-panel-wide">
          <h3>Payout setup</h3>
          ${renderStripeStatusCard(stripe)}
        </div>
        <div class="account-trainer-grid">
          <div class="account-trainer-panel">
            <h3>Performance overview</h3>
            <div class="account-trainer-metric-grid">
              ${renderMetricCard('Profile clicks', performance.profileClicks || 0, 'Every trainer profile view is tracked separately.')}
              ${renderMetricCard('Regular sign-ups', performance.regularSignups || 0, 'Users who joined with your code but are not coaching clients.')}
              ${renderMetricCard('Coaching sign-ups', performance.coachingSignups || 0, 'Clients who joined through a coaching invite.')}
              ${renderMetricCard('Invite links sent', performance.inviteLinksSent || 0, 'App invites and coaching invites combined.')}
              ${renderMetricCard('Invite to signup conversion', `${Number(performance.conversionRate || 0).toFixed(1)}%`, 'Total signups divided by total invites sent.')}
              ${renderMetricCard('Bonus-qualified referrals', bonus.qualifiedUsers || 0, 'Activated referred users that count toward the bonus logic.')}
            </div>
          </div>
          <div class="account-trainer-panel">
            <h3>Earnings overview</h3>
            <div class="account-trainer-metric-grid">
              ${renderMetricCard('Active coaching clients', coaching.activeClients || 0, 'People currently attached to you as coaching clients.')}
              ${renderMetricCard('Monthly coaching revenue', formatMoney(coaching.monthlyRevenueCents || 0), 'Current month coaching revenue tied to accepted coaching invites.')}
              ${renderMetricCard('Lifetime coaching revenue', formatMoney(coaching.lifetimeRevenueCents || 0), 'All coaching revenue tied to this trainer account.')}
              ${renderMetricCard('Paid subscriptions', coaching.paidSubscriptions || 0, 'Monthly or recurring coaching subscriptions.')}
              ${renderMetricCard('Failed payments / issues', coaching.failedPayments || 0, 'Any coaching invite with a payment issue is counted here.')}
              ${renderMetricCard('Pending bonus amount', formatMoney(bonus.pendingCents || 0), 'Referred users who have not qualified yet.')}
            </div>
          </div>
          <div class="account-trainer-panel">
            <h3>Referred App Users</h3>
            ${renderTable(
              ['Name', 'Email', 'Signup date', 'Activation status', 'Bonus status'],
              referredUsers.map((user) => `
                <tr>
                  <td><strong>${escapeHtml(user.name || 'Member')}</strong></td>
                  <td>${escapeHtml(user.email || '')}</td>
                  <td>${escapeHtml(formatShortDate(user.signupDate))}</td>
                  <td>${escapeHtml(titleizeStatus(user.activationStatus, 'Pending'))}</td>
                  <td>${escapeHtml(titleizeStatus(user.bonusStatus, 'Pending'))}</td>
                </tr>
              `),
              'No referred app users yet.'
            )}
          </div>
          <div class="account-trainer-panel">
            <h3>Coaching Clients</h3>
            ${renderTable(
              ['Name', 'Email', 'Package', 'Signup date', 'Payment status', 'Revenue generated'],
              coachingClients.map((client) => `
                <tr>
                  <td><strong>${escapeHtml(client.name || 'Client')}</strong></td>
                  <td>${escapeHtml(client.email || '')}</td>
                  <td>${escapeHtml(client.packageName || '')}</td>
                  <td>${escapeHtml(formatShortDate(client.signupDate))}</td>
                  <td>${escapeHtml(titleizeStatus(client.paymentStatus, 'Pending'))}</td>
                  <td>${escapeHtml(formatMoney(client.revenueCents || 0))}</td>
                </tr>
              `),
              'No coaching clients yet.'
            )}
          </div>
        </div>
      </div>
      <div class="account-trainer-tab-panel" data-trainer-tab-panel="clients">
        <div class="account-trainer-panel">
          <h3>Clients</h3>
          <div class="account-trainer-muted">Your trainer client list, with each payment amount shown on the pill.</div>
          ${renderClientRoster(clientRoster)}
        </div>
      </div>
      <div class="account-trainer-tab-panel" data-trainer-tab-panel="warnings">
        <div class="account-trainer-panel">
          <h3>Warnings</h3>
          <div class="account-trainer-muted">Clients who missed today’s workout or did not track key daily items.</div>
          ${renderWarningsList(warnings)}
        </div>
      </div>
    `;
  }

  async function init() {
    const statusEl = $('#account-trainer-status');
    const shell = $('#account-trainer-shell');
    const headlineEl = $('#trainer-dashboard-headline');
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
    if (!statusEl || !shell) return;

    const me = await api('/api/auth/me');
    if (!me.ok || !me.json?.user) {
      statusEl.textContent = 'Sign in to manage your trainer dashboard.';
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
    if (headlineEl) {
      const name = String(meUser?.displayName || meUser?.username || 'Trainer').trim();
      headlineEl.textContent = `${name}'s trainer hub`;
    }
    let currentData = null;
    let selectedInviteMode = 'app';
    let lastPlusAnchor = null;

    const isStripeReady = () => String(currentData?.growth?.stripe?.state || '').trim() === 'ready';

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

    const loadDashboard = async () => {
      const dashboardResp = await api('/api/auth/trainer/dashboard');
      if (!dashboardResp.ok || !dashboardResp.json?.ok) {
        statusEl.textContent = 'Could not load trainer dashboard.';
        shell.innerHTML = renderEmpty('Trainer dashboard failed to load right now.');
        return false;
      }
      currentData = dashboardResp.json;
      const stripeError = String(pageParams.get('stripe_error') || '').trim();
      statusEl.textContent = stripeError || (currentData?.isTrainer
        ? describeStripeState(currentData?.growth?.stripe || {})
        : 'Trainer onboarding not completed yet.');
      shell.innerHTML = renderTrainerDashboard(currentData);
      bindTrainerPageChooser(meUser, currentData);
      fillInvitePanel();
      return true;
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
      const tabTrigger = target.closest('[data-trainer-tab]');
      if (tabTrigger instanceof Element) {
        const nextTab = String(tabTrigger.getAttribute('data-trainer-tab') || '').trim();
        if (nextTab) {
          shell.querySelectorAll('[data-trainer-tab]').forEach((button) => {
            button.classList.toggle('active', button.getAttribute('data-trainer-tab') === nextTab);
          });
          shell.querySelectorAll('[data-trainer-tab-panel]').forEach((panel) => {
            panel.classList.toggle('active', panel.getAttribute('data-trainer-tab-panel') === nextTab);
          });
        }
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
      if (target.id === 'account-trainer-copy-link') {
        const input = $('#account-trainer-referral-link');
        try {
          await navigator.clipboard.writeText(String(input?.value || '').trim());
          statusEl.textContent = 'Referral link copied.';
        } catch {
          statusEl.textContent = 'Could not copy referral link.';
        }
      }
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
          statusEl.textContent = 'Referral code copied.';
        } catch {
          statusEl.textContent = 'Could not copy referral code.';
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
