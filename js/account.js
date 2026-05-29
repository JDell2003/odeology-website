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

  const TRAINING_WELCOME_STORAGE_KEY = 'ode_training_share_welcome_v1';
  const TRAINING_DAY_CODES = ['SU', 'M', 'T', 'W', 'TH', 'F', 'S'];
  const TRAINING_INTAKE_KEY = 'ode_training_intake_v2';
  const ONBOARDING_FORCE_KEY = 'ode_onboarding_force_v1';
  const ONBOARDING_DONE_KEY = 'ode_onboarding_done_v1';
  const ACCOUNT_TRAINER_CHANGE_CODE_KEY = 'ode_account_change_trainer_invite_code_v1';
  const TRAINER_INVITE_MAP_KEY = 'ode_trainer_invites_v1';
  const MANAGER_ENTRY_KEY = 'ode_manager_entry_prefill_v1';

  function defaultTrainingDayCodes(daysPerWeekRaw) {
    const n = Math.max(0, Math.min(7, Math.floor(Number(daysPerWeekRaw) || 0)));
    if (n <= 0) return [];
    if (n === 1) return ['M'];
    if (n === 2) return ['M', 'TH'];
    if (n === 3) return ['M', 'W', 'F'];
    if (n === 4) return ['M', 'T', 'TH', 'F'];
    if (n === 5) return ['M', 'T', 'W', 'TH', 'F'];
    if (n === 6) return ['M', 'T', 'W', 'TH', 'F', 'S'];
    return [...TRAINING_DAY_CODES];
  }

  function fallbackWelcomeFromInvite(invite) {
    const fromDisplayName = String(invite?.displayName || invite?.username || 'your friend').trim() || 'your friend';
    const fromUsername = String(invite?.username || '').trim() || null;
    const discipline = String(invite?.discipline || '').trim().toLowerCase();
    const split = discipline
      ? `${discipline.charAt(0).toUpperCase()}${discipline.slice(1)} split`
      : 'Training split';
    return {
      fromDisplayName,
      fromUsername,
      dayCodes: defaultTrainingDayCodes(invite?.daysPerWeek),
      split
    };
  }

  function stashTrainingWelcomeAndRedirect(welcome) {
    const payload = welcome && typeof welcome === 'object' ? welcome : {};
    try {
      sessionStorage.setItem(TRAINING_WELCOME_STORAGE_KEY, JSON.stringify({
        ...payload,
        ts: Date.now()
      }));
    } catch {
      // ignore storage issues
    }
    window.location.href = 'training.html';
  }

  function initialsFromName(raw) {
    const name = String(raw || '').trim();
    if (!name) return 'A';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'A';
  }

  function escapeHtml(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizePhoneForHref(raw) {
    const digits = String(raw || '').replace(/\D+/g, '');
    return digits || '';
  }

  const WARNING_EMAIL_TEMPLATE_KEY = 'ode_warning_email_template_idx_v1';
  const WARNING_TEXT_TEMPLATE_KEY = 'ode_warning_text_template_idx_v1';

  function nextWarningEmailTemplateIndex() {
    try {
      const raw = Number(localStorage.getItem(WARNING_EMAIL_TEMPLATE_KEY) || 0);
      const idx = Number.isFinite(raw) ? Math.abs(Math.floor(raw)) % 7 : 0;
      localStorage.setItem(WARNING_EMAIL_TEMPLATE_KEY, String((idx + 1) % 7));
      return idx;
    } catch {
      return Math.floor(Math.random() * 7);
    }
  }

  function nextWarningTextTemplateIndex() {
    try {
      const raw = Number(localStorage.getItem(WARNING_TEXT_TEMPLATE_KEY) || 0);
      const idx = Number.isFinite(raw) ? Math.abs(Math.floor(raw)) % 7 : 0;
      localStorage.setItem(WARNING_TEXT_TEMPLATE_KEY, String((idx + 1) % 7));
      return idx;
    } catch {
      return Math.floor(Math.random() * 7);
    }
  }

  function warningGoalSummary(warn) {
    const goalModeRaw = String(warn?.goalMode || '').trim().toLowerCase();
    const goalMode = goalModeRaw === 'cut' || goalModeRaw === 'bulk' || goalModeRaw === 'recomp'
      ? goalModeRaw
      : 'goal';
    const goalWeight = Number(warn?.goalWeightLb);
    const currentWeight = Number(warn?.currentWeightLb);
    const targetText = Number.isFinite(goalWeight) && goalWeight > 0
      ? `${Math.round(goalWeight)} lb`
      : 'your target bodyweight';
    const currentText = Number.isFinite(currentWeight) && currentWeight > 0
      ? `${Math.round(currentWeight)} lb`
      : 'your current check-in';
    const modeText = goalMode === 'goal' ? 'goal phase' : `${goalMode} phase`;
    return { targetText, currentText, modeText };
  }

  function buildWarningEmailDraft(warn, templateIdx = 0) {
    const name = String(warn?.displayName || warn?.username || 'you').trim() || 'you';
    const username = String(warn?.username || '').trim();
    const handle = username ? `@${username}` : name;
    const alertLine = String(warn?.message || 'My app is flagging your consistency right now.').trim();
    const { targetText, currentText, modeText } = warningGoalSummary(warn);
    const subjects = [
      `Quick check-in on your goal, ${name}`,
      `${name}, your plan needs attention`,
      `${name}, this warning is about your goal`,
      `${name}, can we reset this week?`,
      `${name}, you're off track from your target`,
      `${name}, let's get you back on plan`,
      `${name}, action needed on your training goal`
    ];
    const bodies = [
      `Hey ${handle}, quick heads-up.\n\nMy app flagged this warning: "${alertLine}"\n\nI'm reaching out because your goal is ${targetText} (${modeText}), and your latest check-in is around ${currentText}. I want to make sure this doesn't turn into a longer slide.\n\nCan you get a session in today and get back on plan?`,
      `Yo ${handle}, this message is about your goal progress.\n\nWarning from my app: "${alertLine}"\n\nYou told the app your target is ${targetText} in a ${modeText}, and right now you're around ${currentText}. That's why I'm checking in.\n\nWhat's your plan for today so we can get you back on track?`,
      `${handle}, direct check-in.\n\nThe app flagged: "${alertLine}"\n\nI'm not texting randomly. I'm texting because your goal is ${targetText} (${modeText}) and your current trend shows ${currentText}. I want you closing the gap, not drifting away from it.\n\nLet's lock in this week.`,
      `What's up ${handle},\n\nI got a warning from the app: "${alertLine}"\n\nReason for the message: your stated target is ${targetText} (${modeText}), and your latest number is around ${currentText}. That gap is fixable if you get consistent now.\n\nCan you commit to your next session today?`,
      `${handle}, this is a support nudge, not a random callout.\n\nFlag shown in app: "${alertLine}"\n\nI'm reaching out because your goal is ${targetText} (${modeText}) and your current check-in is ${currentText}. I want to help you move toward the target again.\n\nReply with what time you're training today.`,
      `Hey ${handle}, checking in because the app raised a consistency warning: "${alertLine}"\n\nYou set a target of ${targetText} (${modeText}), and current progress is around ${currentText}. That's exactly why I'm reaching out.\n\nLet's tighten this up now instead of waiting another week.`,
      `${handle}, final reminder for this week.\n\nWarning in app: "${alertLine}"\n\nThis is about your stated goal of ${targetText} (${modeText}). You're currently around ${currentText}, so we need consistent sessions again to move the right direction.\n\nGet one workout done today and message me after.`
    ];
    const idx = Math.abs(Number(templateIdx) || 0) % 7;
    return {
      subject: subjects[idx],
      body: bodies[idx]
    };
  }

  function buildWarningTextDraft(warn, templateIdx = 0) {
    const name = String(warn?.displayName || warn?.username || 'you').trim() || 'you';
    const username = String(warn?.username || '').trim();
    const handle = username ? `@${username}` : name;
    const alertLine = String(warn?.message || 'My app is flagging your consistency right now.').trim();
    const { targetText, currentText, modeText } = warningGoalSummary(warn);
    const templates = [
      `${handle} quick check-in: app warning says "${alertLine}". I'm texting because your goal is ${targetText} (${modeText}) and you're around ${currentText}. Can you get a session in today?`,
      `${handle} this is about your goal progress. Alert: "${alertLine}". Target is ${targetText} (${modeText}); current check-in ${currentText}. Let's lock in this week.`,
      `${handle}, not random. The app flagged "${alertLine}" and your goal is ${targetText} (${modeText}) with current around ${currentText}. What's your plan for today?`,
      `${handle} I reached out because of this warning: "${alertLine}". You want ${targetText} (${modeText}) and you're at ${currentText} now. Let's get back on track today.`,
      `${handle} support nudge: "${alertLine}". Reason I'm texting is your goal target ${targetText} (${modeText}) vs current ${currentText}. Reply with your workout time today.`,
      `${handle} app check-in: "${alertLine}". Goal is ${targetText} (${modeText}) and trend shows ${currentText}. Tighten up today so we close that gap.`,
      `${handle} final nudge for now: "${alertLine}". Your stated goal is ${targetText} (${modeText}) and current is ${currentText}. Get one session done today.`
    ];
    const idx = Math.abs(Number(templateIdx) || 0) % 7;
    return templates[idx];
  }

  function isLikelyMobileDevice() {
    try {
      return window.matchMedia('(pointer:coarse)').matches || window.matchMedia('(max-width: 900px)').matches;
    } catch {
      return false;
    }
  }

  function buildSmsComposeUrl(phone, body) {
    const number = String(phone || '').trim();
    const text = String(body || '').trim();
    return `sms:${number}?&body=${encodeURIComponent(text)}`;
  }

  function openWarningTextCompose(warn, phone) {
    const number = String(phone || '').trim();
    if (!number) return;
    const idx = nextWarningTextTemplateIndex();
    const body = buildWarningTextDraft(warn, idx);
    window.location.href = buildSmsComposeUrl(number, body);
  }

  function buildGmailComposeUrl(email, subject, body) {
    const qs = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: String(email || '').trim(),
      su: String(subject || '').trim(),
      body: String(body || '').trim()
    });
    return `https://mail.google.com/mail/?${qs.toString()}`;
  }

  function openWarningEmailCompose(warn, email) {
    const cleaned = String(email || '').trim();
    if (!cleaned) return;
    const idx = nextWarningEmailTemplateIndex();
    const draft = buildWarningEmailDraft(warn, idx);
    const prefersDesktopGmail = (() => {
      try { return window.matchMedia('(pointer:fine)').matches; } catch { return true; }
    })();
    if (prefersDesktopGmail) {
      const gmailUrl = buildGmailComposeUrl(cleaned, draft.subject, draft.body);
      const win = window.open(gmailUrl, '_blank', 'noopener');
      if (win) return;
    }
    const fallbackMailto = `mailto:${encodeURIComponent(cleaned)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    window.location.href = fallbackMailto;
  }

  function buildWarningContacts(warn) {
    const phoneRaw = String(warn?.phone || '').trim();
    const phone = normalizePhoneForHref(phoneRaw);
    const email = String(warn?.email || '').trim();
    if (!phone && !email) return null;

    const row = document.createElement('div');
    row.className = 'account-warning-contacts';

    if (phone) {
      const call = document.createElement('a');
      call.className = 'account-warning-contact';
      call.href = `tel:${phone}`;
      call.textContent = 'Call';
      row.appendChild(call);

      const text = document.createElement('a');
      text.className = 'account-warning-contact';
      text.href = `sms:${phone}`;
      text.textContent = 'Text';
      text.addEventListener('click', (e) => {
        if (!isLikelyMobileDevice()) return;
        e.preventDefault();
        openWarningTextCompose(warn, phone);
      });
      row.appendChild(text);
    }

    if (email) {
      const mail = document.createElement('a');
      mail.className = 'account-warning-contact';
      mail.href = `mailto:${encodeURIComponent(email)}`;
      mail.textContent = 'Email';
      mail.addEventListener('click', (e) => {
        e.preventDefault();
        openWarningEmailCompose(warn, email);
      });
      row.appendChild(mail);
    }

    return row;
  }

  function getProfilePhotoFromPayload(payload) {
    const row = payload?.profile && typeof payload.profile === 'object' ? payload.profile : null;
    const profileJson = row?.profile && typeof row.profile === 'object' ? row.profile : {};
    const value = profileJson?.profile?.photoDataUrl
      || profileJson?.photoDataUrl
      || profileJson?.profilePhotoData
      || profileJson?.avatarDataUrl
      || row?.photoDataUrl
      || '';
    const photo = String(value || '').trim();
    return photo || null;
  }

  function renderAvatar(name, photoDataUrl) {
    const avatar = $('#account-avatar');
    if (!avatar) return;
    if (photoDataUrl) {
      const img = document.createElement('img');
      img.src = photoDataUrl;
      img.alt = name;
      img.addEventListener('error', () => {
        avatar.innerHTML = `<div class="account-fallback">${initialsFromName(name)}</div>`;
      });
      avatar.innerHTML = '';
      avatar.appendChild(img);
      return;
    }
    avatar.innerHTML = `<div class="account-fallback">${initialsFromName(name)}</div>`;
  }

  function readSavedTrainingIntake(profileResp = null) {
    let local = null;
    try {
      local = JSON.parse(localStorage.getItem(TRAINING_INTAKE_KEY) || 'null');
    } catch {
      local = null;
    }
    const remote = profileResp?.ok
      ? (profileResp.json?.profile?.profile?.training_intake || null)
      : null;
    return (local && typeof local === 'object') ? local : ((remote && typeof remote === 'object') ? remote : null);
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

  function initSetupUi(profileResp = null) {
    const inviteOpenBtn = $('#account-invite-trainer-open');
    const openBtn = $('#account-settings-open');
    const backBtn = $('#account-settings-back');
    const inviteLaunchCard = $('#account-invite-trainer-launch-card');
    const launchCard = $('#account-settings-launch-card');
    const settingsView = $('#account-settings-view');
    const pendingCard = $('#account-pending-card');
    const panelEl = $('#account-setup-panel');
    const statusEl = $('#account-setup-status');
    const titleEl = $('#account-settings-title');
    const copyEl = $('#account-settings-copy');
    if (!inviteOpenBtn || !openBtn || !backBtn || !inviteLaunchCard || !launchCard || !settingsView || !panelEl || !statusEl || !titleEl || !copyEl) return;

    let intake = readSavedTrainingIntake(profileResp);
    let settingsPanel = 'home';
    let viewMode = 'settings';
    let inviteQrExpiresAt = Date.now() + (24 * 60 * 60 * 1000);

    const setStatus = (message) => {
      statusEl.textContent = String(message || '').trim();
    };

    const getManagerContext = () => {
      const prefill = readManagerPrefill();
      return {
        managerCode: String(prefill?.managerCode || '').trim().toUpperCase(),
        companyName: String(prefill?.companyName || '').trim(),
        managerName: String(prefill?.managerName || '').trim(),
        locationName: String(prefill?.locationName || '').trim()
      };
    };

    const hasManagerInviteAccess = () => Boolean(getManagerContext().managerCode);

    const resolveInviteBaseUrl = () => {
      const configuredBase = String(
        window.__ODE_INVITE_BASE_URL__
        || localStorage.getItem('ode_invite_base_url')
        || 'https://RiseForIt.up.railway.app/index.html'
      ).trim();
      const origin = String(window.location.origin || '').trim();
      const hostname = String(window.location.hostname || '').trim().toLowerCase();
      const isLocalHost = !hostname
        || hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '0.0.0.0'
        || hostname.endsWith('.local');
      if (isLocalHost) return configuredBase;
      const path = String(window.location.pathname || '/index.html').trim() || '/index.html';
      return `${origin.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    };

    const buildManagerInviteLink = (expiresAt = inviteQrExpiresAt) => {
      const managerCode = getManagerContext().managerCode;
      const params = new URLSearchParams();
      params.set('managerInvite', managerCode);
      params.set('expires', String(Number(expiresAt) || 0));
      return `${resolveInviteBaseUrl()}?${params.toString()}`;
    };

    const buildManagerInviteText = (expiresAt = inviteQrExpiresAt) => {
      const manager = getManagerContext();
      const managerName = manager.managerName || manager.companyName || 'your manager';
      const companyName = manager.companyName || 'the gym';
      return `${managerName} invited you to join ${companyName} on STRYVE. This invite works for 24 hours: ${buildManagerInviteLink(expiresAt)}`;
    };

    const buildManagerInviteQrImageUrl = (expiresAt = inviteQrExpiresAt) => `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(buildManagerInviteLink(expiresAt))}`;

    const buildManagerSmsHref = (expiresAt = inviteQrExpiresAt) => `sms:?body=${encodeURIComponent(buildManagerInviteText(expiresAt))}`;

    const copyTextValue = async (value) => {
      const text = String(value || '').trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.setAttribute('readonly', '');
        helper.style.position = 'absolute';
        helper.style.left = '-9999px';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
    };

    const showSettingsView = () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'settings');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // ignore
      }
      render();
    };

    const showAccountView = () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('view');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // ignore
      }
      render();
    };

    const restartOnboarding = async () => {
      setStatus('Resetting onboarding...');
      const resp = await api('/api/auth/trainer/onboarding/reset', {
        method: 'POST',
        body: JSON.stringify({})
      });
      if (!resp.ok) {
        setStatus(resp.json?.error || 'Could not reset onboarding.');
        return;
      }
      try {
        localStorage.setItem(ONBOARDING_FORCE_KEY, '1');
        localStorage.removeItem(ONBOARDING_DONE_KEY);
      } catch {
        // ignore
      }
      window.location.href = 'index.html';
    };

    const saveCurrentSettings = async () => {
      setStatus('Saving settings...');
      const payload = intake && typeof intake === 'object'
        ? { ...intake, completedAt: intake.completedAt || Date.now() }
        : { completedAt: Date.now() };
      try {
        localStorage.setItem(TRAINING_INTAKE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
      const resp = await api('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ profile: { training_intake: payload } })
      });
      intake = payload;
      settingsPanel = 'saved';
      setStatus(resp.ok ? 'Settings saved.' : 'Saved locally. Could not sync profile.');
      render();
    };

    const openClientOnboarding = ({ inviteCode = '' } = {}) => {
      try {
        localStorage.setItem(ONBOARDING_FORCE_KEY, '1');
        localStorage.removeItem(ONBOARDING_DONE_KEY);
        if (String(inviteCode || '').trim()) {
          localStorage.setItem(ACCOUNT_TRAINER_CHANGE_CODE_KEY, String(inviteCode || '').trim());
        } else {
          localStorage.removeItem(ACCOUNT_TRAINER_CHANGE_CODE_KEY);
        }
      } catch {
        // ignore
      }
      window.location.href = 'index.html';
    };

    const readTrainerInviteMap = () => {
      try {
        const raw = localStorage.getItem(TRAINER_INVITE_MAP_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    };

    const isKnownTrainerInviteCode = (code) => {
      const normalized = String(code || '').trim();
      if (!normalized) return false;
      return Object.values(readTrainerInviteMap()).some((value) => String(value || '').trim() === normalized);
    };

    const renderSettingsHome = (user) => `
      <div class="account-settings-menu">
        <button type="button" class="account-settings-link" data-settings-action="credentials">Username and password</button>
        <button type="button" class="account-settings-link" data-settings-action="change-trainer">Change trainer</button>
        <button type="button" class="account-settings-link" data-settings-action="save">Save settings</button>
        <button type="button" class="account-settings-link" data-settings-action="restart">Restart onboarding</button>
      </div>
      <div class="account-settings-panel-card">
        <p class="account-settings-panel-note">Current account: <strong>${escapeHtml(user?.username || user?.displayName || 'Account')}</strong></p>
      </div>
    `;

    const renderInviteTrainerPanel = () => {
      const manager = getManagerContext();
      const expiresAt = inviteQrExpiresAt;
      const expiresText = new Date(expiresAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      return `
        <div class="account-settings-panel">
          <div class="account-settings-panel-card">
            <h3 class="account-settings-panel-title">Invite Trainer</h3>
            <p class="account-settings-panel-note">Manager code: <strong>${escapeHtml(manager.managerCode || 'Unavailable')}</strong></p>
            <p class="account-settings-panel-note">${escapeHtml(manager.companyName || 'Manager workspace')}${manager.locationName ? ` • ${escapeHtml(manager.locationName)}` : ''}</p>
            <p class="account-settings-panel-note">The QR code and SMS invite use a trainer invite link that expires in 24 hours. Current expiration: ${escapeHtml(expiresText)}</p>
          </div>
          <div class="account-settings-menu">
            <button type="button" class="account-settings-link" data-settings-action="invite-show-qr">Generate QR code</button>
            <button type="button" class="account-settings-link" data-settings-action="invite-copy-code">Copy invite code</button>
            <button type="button" class="account-settings-link" data-settings-action="invite-send-sms">Send SMS invite</button>
            <button type="button" class="account-settings-link" data-settings-action="back-home">Back to account</button>
          </div>
          ${settingsPanel === 'invite-trainer-qr' ? `
            <div class="account-invite-qr-frame">
              <img src="${escapeHtml(buildManagerInviteQrImageUrl(expiresAt))}" alt="Trainer invite QR code" width="220" height="220">
              <p class="account-settings-panel-note" style="text-align:center;">Scan this on a phone to open trainer onboarding. It expires on ${escapeHtml(expiresText)}.</p>
              <div class="account-settings-menu">
                <a class="account-settings-link" href="${escapeHtml(buildManagerInviteLink(expiresAt))}" target="_blank" rel="noopener">Open Invite Link</a>
                <a class="account-settings-link" href="${escapeHtml(buildManagerInviteQrImageUrl(expiresAt))}" target="_blank" rel="noopener" download="manager-trainer-invite-qr.png">Download QR</a>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    };

    const renderCredentialsPanel = (user) => `
      <div class="account-settings-panel">
        <div class="account-settings-panel-card">
          <h3 class="account-settings-panel-title">Username and password</h3>
          <p class="account-settings-panel-note">Username: <strong>${escapeHtml(user?.username || 'Not set')}</strong></p>
          <p class="account-settings-panel-note">Request a password reset link for this account from here.</p>
          <div class="account-settings-inline-form">
            <label for="account-reset-identifier">Email, username, or phone</label>
            <input id="account-reset-identifier" type="text" value="${escapeHtml(user?.username || '')}" placeholder="Enter your email, username, or phone">
          </div>
        </div>
        <div class="account-settings-menu">
          <button type="button" class="account-settings-link" data-settings-action="send-reset">Send reset link</button>
          <button type="button" class="account-settings-link" data-settings-action="back-home">Back to settings</button>
        </div>
      </div>
    `;

    const renderChangeTrainerPanel = () => `
      <div class="account-settings-panel">
        <div class="account-settings-panel-card">
          <h3 class="account-settings-panel-title">Change trainer</h3>
          <p class="account-settings-panel-note">Enter a referral code or restart the regular client onboarding flow.</p>
          <div class="account-settings-inline-form">
            <label for="account-change-trainer-code">Referral code</label>
            <div class="account-settings-code-wrap">
              <input id="account-change-trainer-code" type="text" placeholder="Enter referral code">
              <button type="button" class="account-settings-code-submit" data-settings-action="confirm-code" aria-label="Check referral code">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="account-settings-menu">
          <button type="button" class="account-settings-link" data-settings-action="regular-client-flow">Regular client flow</button>
          <button type="button" class="account-settings-link" data-settings-action="back-home">Back to settings</button>
        </div>
      </div>
    `;

    const renderConfirmPanel = ({ title, copy, continueAction = '', backAction = 'back-home' } = {}) => `
      <div class="account-settings-panel">
        <div class="account-settings-panel-card">
          <h3 class="account-settings-panel-title">${escapeHtml(title || 'Confirmation')}</h3>
          <p class="account-settings-panel-note">${escapeHtml(copy || '')}</p>
        </div>
        <div class="account-settings-menu">
          ${continueAction ? `<button type="button" class="account-settings-link" data-settings-action="${escapeHtml(continueAction)}">Continue</button>` : ''}
          <button type="button" class="account-settings-link" data-settings-action="${escapeHtml(backAction)}">Back to settings</button>
        </div>
      </div>
    `;

    const renderRestartConfirmPanel = () => `
      <div class="account-settings-panel">
        <div class="account-settings-panel-card">
          <h3 class="account-settings-panel-title">Restart onboarding?</h3>
          <p class="account-settings-panel-note">This will send you back through onboarding so you can set the account up again.</p>
        </div>
        <div class="account-settings-menu">
          <button type="button" class="account-settings-link is-danger" data-settings-action="confirm-restart">Confirm restart</button>
          <button type="button" class="account-settings-link" data-settings-action="back-home">Back to settings</button>
        </div>
      </div>
    `;

    const requestPasswordReset = async () => {
      const input = $('#account-reset-identifier');
      const identifier = String(input?.value || '').trim();
      if (!identifier) {
        setStatus('Enter your email, username, or phone first.');
        return;
      }
      setStatus('Sending reset link...');
      const resp = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      }).catch(() => null);
      const data = await resp?.json?.().catch?.(() => ({}));
      settingsPanel = 'password-sent';
      setStatus(resp?.ok ? 'If the account exists, a reset link was sent.' : (data?.error || 'Could not request reset link.'));
      render();
    };

    const render = () => {
      const inSettingsView = (() => {
        try {
          return new URL(window.location.href).searchParams.get('view') === 'settings';
        } catch {
          return false;
        }
      })();
      const hasIntake = intake && typeof intake === 'object';
      const hasManagerInvite = hasManagerInviteAccess();
      titleEl.textContent = viewMode === 'invite' ? 'Invite Trainer' : 'Settings';
      copyEl.textContent = viewMode === 'invite'
        ? 'Share your manager invite by QR code, copied code, or SMS.'
        : 'Review and update the onboarding inputs tied to this account.';
      inviteLaunchCard.classList.toggle('account-hidden', inSettingsView || !hasManagerInvite);
      launchCard.classList.toggle('account-hidden', inSettingsView);
      settingsView.classList.toggle('hidden', !inSettingsView);
      pendingCard?.classList.toggle('account-hidden', inSettingsView);
      setStatus(hasIntake ? 'Onboarding inputs saved to this account.' : 'No saved onboarding inputs yet.');
      if (!inSettingsView) {
        panelEl.innerHTML = '';
        settingsPanel = 'home';
        viewMode = 'settings';
        return;
      }
      const currentUser = window.__odeCurrentUser || null;
      if (viewMode === 'invite') {
        if (!hasManagerInvite) {
          panelEl.innerHTML = renderConfirmPanel({
            title: 'Invite Trainer unavailable',
            copy: 'No active manager code was found for this account yet.',
            backAction: 'back-home'
          });
        } else {
          panelEl.innerHTML = renderInviteTrainerPanel();
        }
      } else if (settingsPanel === 'credentials') {
        panelEl.innerHTML = renderCredentialsPanel(currentUser);
      } else if (settingsPanel === 'change-trainer') {
        panelEl.innerHTML = renderChangeTrainerPanel();
      } else if (settingsPanel === 'saved') {
        panelEl.innerHTML = renderConfirmPanel({
          title: 'Settings saved',
          copy: 'Your current account settings were saved.',
          backAction: 'back-home'
        });
      } else if (settingsPanel === 'change-trainer-code-confirm') {
        panelEl.innerHTML = renderConfirmPanel({
          title: 'Referral code ready',
          copy: 'Your referral code was saved. Continue to onboarding to connect to the new trainer.',
          continueAction: 'continue-referral-onboarding',
          backAction: 'back-home'
        });
      } else if (settingsPanel === 'change-trainer-regular-confirm') {
        panelEl.innerHTML = renderConfirmPanel({
          title: 'Client flow ready',
          copy: 'Continue to restart the regular client onboarding flow.',
          continueAction: 'continue-regular-onboarding',
          backAction: 'back-home'
        });
      } else if (settingsPanel === 'password-sent') {
        panelEl.innerHTML = renderConfirmPanel({
          title: 'Reset link requested',
          copy: 'If the account exists, a password reset link was sent.',
          backAction: 'back-home'
        });
      } else if (settingsPanel === 'restart-confirm') {
        panelEl.innerHTML = renderRestartConfirmPanel();
      } else {
        panelEl.innerHTML = renderSettingsHome(currentUser);
      }

      panelEl.querySelectorAll('[data-settings-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = String(btn.getAttribute('data-settings-action') || '').trim();
          if (action === 'invite-show-qr') {
            inviteQrExpiresAt = Date.now() + (24 * 60 * 60 * 1000);
            settingsPanel = 'invite-trainer-qr';
            setStatus('Trainer QR code ready.');
            render();
            return;
          }
          if (action === 'invite-copy-code') {
            await copyTextValue(getManagerContext().managerCode);
            setStatus('Invite code copied.');
            return;
          }
          if (action === 'invite-send-sms') {
            window.location.href = buildManagerSmsHref(Date.now() + (24 * 60 * 60 * 1000));
            setStatus('Opening SMS app...');
            return;
          }
          if (action === 'credentials') {
            settingsPanel = 'credentials';
            render();
            return;
          }
          if (action === 'change-trainer') {
            settingsPanel = 'change-trainer';
            render();
            return;
          }
          if (action === 'save') {
            await saveCurrentSettings();
            return;
          }
          if (action === 'restart') {
            settingsPanel = 'restart-confirm';
            setStatus('Confirm restart to continue.');
            render();
            return;
          }
          if (action === 'confirm-restart') {
            await restartOnboarding();
            return;
          }
          if (action === 'send-reset') {
            await requestPasswordReset();
            return;
          }
          if (action === 'confirm-code') {
            const code = String($('#account-change-trainer-code')?.value || '').trim();
            if (!code) {
              setStatus('Enter a referral code first.');
              return;
            }
            if (!isKnownTrainerInviteCode(code)) {
              setStatus('Enter a valid referral code.');
              return;
            }
            try {
              localStorage.setItem(ACCOUNT_TRAINER_CHANGE_CODE_KEY, code);
            } catch {
              // ignore
            }
            settingsPanel = 'change-trainer-code-confirm';
            setStatus('Referral code saved.');
            render();
            return;
          }
          if (action === 'regular-client-flow') {
            try {
              localStorage.removeItem(ACCOUNT_TRAINER_CHANGE_CODE_KEY);
            } catch {
              // ignore
            }
            settingsPanel = 'change-trainer-regular-confirm';
            setStatus('Regular client flow selected.');
            render();
            return;
          }
          if (action === 'continue-referral-onboarding') {
            const code = String(localStorage.getItem(ACCOUNT_TRAINER_CHANGE_CODE_KEY) || '').trim();
            openClientOnboarding({ inviteCode: code });
            return;
          }
          if (action === 'continue-regular-onboarding') {
            openClientOnboarding({ inviteCode: '' });
            return;
          }
          if (action === 'back-home') {
            settingsPanel = 'home';
            viewMode = 'settings';
            setStatus(hasIntake ? 'Onboarding inputs saved to this account.' : 'No saved onboarding inputs yet.');
            render();
          }
        });
      });

      const changeTrainerCodeInput = panelEl.querySelector('#account-change-trainer-code');
      if (changeTrainerCodeInput instanceof HTMLInputElement) {
        changeTrainerCodeInput.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          panelEl.querySelector('[data-settings-action="confirm-code"]')?.click();
        });
      }
    };

    inviteOpenBtn.addEventListener('click', () => {
      viewMode = 'invite';
      settingsPanel = 'invite-trainer-home';
      inviteQrExpiresAt = Date.now() + (24 * 60 * 60 * 1000);
      setStatus('Manager invite tools ready.');
      showSettingsView();
    });
    openBtn.addEventListener('click', () => {
      viewMode = 'settings';
      settingsPanel = 'home';
      showSettingsView();
    });
    backBtn.addEventListener('click', showAccountView);

    render();
  }

  function renderWarnings(items, statusText = '') {
    const listEl = $('#account-warnings-list');
    const statusEl = $('#account-warnings-status');
    if (statusEl) statusEl.textContent = statusText;
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'account-warnings-empty';
      empty.textContent = statusText || 'No warnings right now.';
      listEl.appendChild(empty);
      return;
    }

    items.forEach((warn) => {
      const name = String(warn?.displayName || warn?.username || 'Account');
      const item = document.createElement('div');
      item.className = 'account-warning-item';

      const avatar = document.createElement('div');
      avatar.className = 'account-avatar';
      avatar.style.width = '42px';
      avatar.style.height = '42px';
      avatar.style.flex = '0 0 42px';
      if (warn?.photoDataUrl) {
        const img = document.createElement('img');
        img.src = warn.photoDataUrl;
        img.alt = name;
        avatar.appendChild(img);
      } else {
        avatar.innerHTML = `<div class="account-fallback">${initialsFromName(name)}</div>`;
      }
      const dot = document.createElement('span');
      dot.className = `presence-dot ${warn?.isOnline === true ? 'online' : 'offline'}`;
      dot.setAttribute('aria-hidden', 'true');
      avatar.appendChild(dot);

      const meta = document.createElement('div');
      meta.className = 'account-warning-meta';
      const title = document.createElement('div');
      title.className = 'account-warning-name';
      title.textContent = name;
      const text = document.createElement('div');
      text.className = 'account-warning-text';
      text.textContent = String(warn?.message || 'No details.');
      meta.appendChild(title);
      meta.appendChild(text);
      const contacts = buildWarningContacts(warn);
      if (contacts) meta.appendChild(contacts);

      const severity = document.createElement('div');
      severity.className = 'account-warning-severity';
      severity.textContent = String(warn?.severity || 'Heads up');

      item.appendChild(avatar);
      item.appendChild(meta);
      item.appendChild(severity);
      listEl.appendChild(item);
    });
  }

  function formatLiftNumber(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return '';
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  function normalizeLiftPerformance(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const weight = Number(raw.weight);
    const reps = Number(raw.reps);
    const estimated1rm = Number(raw.estimated1rm);
    const normalized = {
      weight: Number.isFinite(weight) && weight > 0 ? Math.round(weight * 100) / 100 : null,
      reps: Number.isFinite(reps) && reps > 0 ? Math.max(1, Math.round(reps)) : null,
      estimated1rm: Number.isFinite(estimated1rm) && estimated1rm > 0 ? Math.round(estimated1rm * 100) / 100 : null,
      performedAt: raw.performedAt ? String(raw.performedAt).slice(0, 10) : null
    };
    if (!Number.isFinite(normalized.weight) && !Number.isFinite(normalized.reps) && !Number.isFinite(normalized.estimated1rm)) return null;
    return normalized;
  }

  function formatLiftPerformance(raw) {
    const perf = normalizeLiftPerformance(raw);
    if (!perf) return '—';
    const parts = [];
    if (Number.isFinite(perf.weight)) parts.push(`${formatLiftNumber(perf.weight)} lb`);
    if (Number.isFinite(perf.reps)) parts.push(`x ${perf.reps}`);
    if (!parts.length && Number.isFinite(perf.estimated1rm)) parts.push(`${formatLiftNumber(perf.estimated1rm)} lb e1RM`);
    return parts.length ? parts.join(' ') : '—';
  }

  function normalizeLiftHistoryRows(raw) {
    const rows = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' ? Object.values(raw) : []);
    return rows
      .map((row) => {
        const best = normalizeLiftPerformance(row?.best);
        const last = normalizeLiftPerformance(row?.last);
        return {
          exerciseKey: String(row?.exerciseKey || '').trim(),
          exerciseName: String(row?.exerciseName || row?.baseId || row?.exerciseId || 'Exercise').trim() || 'Exercise',
          best,
          last
        };
      })
      .filter((row) => row.best)
      .sort((a, b) => {
        const weightDelta = Number(b.best?.weight || 0) - Number(a.best?.weight || 0);
        if (weightDelta !== 0) return weightDelta;
        const repsDelta = Number(b.best?.reps || 0) - Number(a.best?.reps || 0);
        if (repsDelta !== 0) return repsDelta;
        const estDelta = Number(b.best?.estimated1rm || 0) - Number(a.best?.estimated1rm || 0);
        if (estDelta !== 0) return estDelta;
        return String(a.exerciseName || '').localeCompare(String(b.exerciseName || ''));
      });
  }

  function normalizeLiftHistoryKey(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/__d\d+__e\d+$/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 180);
  }

  function compareLiftPerformance(nextPerf, prevPerf) {
    const nextWeight = Number(nextPerf?.weight || 0);
    const prevWeight = Number(prevPerf?.weight || 0);
    if (nextWeight !== prevWeight) return nextWeight - prevWeight;
    const nextReps = Number(nextPerf?.reps || 0);
    const prevReps = Number(prevPerf?.reps || 0);
    if (nextReps !== prevReps) return nextReps - prevReps;
    const nextEst = Number(nextPerf?.estimated1rm || 0);
    const prevEst = Number(prevPerf?.estimated1rm || 0);
    return nextEst - prevEst;
  }

  function extractBestPerformanceFromEntry(entry, performedAt) {
    let best = null;
    const sets = Array.isArray(entry?.sets) ? entry.sets : [];
    sets.forEach((set) => {
      const perf = normalizeLiftPerformance({
        weight: set?.weight,
        reps: set?.reps,
        estimated1rm: set?.estimated1rm,
        performedAt
      });
      if (!perf) return;
      if (!best || compareLiftPerformance(perf, best) > 0) best = perf;
    });
    const actual = normalizeLiftPerformance({
      weight: entry?.actual?.weight,
      reps: entry?.actual?.reps,
      estimated1rm: entry?.actual?.estimated1rm,
      performedAt
    });
    if (actual && (!best || compareLiftPerformance(actual, best) > 0)) best = actual;
    return best;
  }

  function extractLastPerformanceFromEntry(entry, performedAt) {
    const sets = Array.isArray(entry?.sets) ? entry.sets : [];
    for (let idx = sets.length - 1; idx >= 0; idx -= 1) {
      const perf = normalizeLiftPerformance({
        weight: sets[idx]?.weight,
        reps: sets[idx]?.reps,
        estimated1rm: sets[idx]?.estimated1rm,
        performedAt
      });
      if (perf) return perf;
    }
    return normalizeLiftPerformance({
      weight: entry?.actual?.weight,
      reps: entry?.actual?.reps,
      estimated1rm: entry?.actual?.estimated1rm,
      performedAt
    });
  }

  function mergeLiftHistoryRows(...groups) {
    const byKey = new Map();
    const newerThan = (nextRaw, prevRaw) => {
      const nextTs = nextRaw ? Date.parse(String(nextRaw)) : NaN;
      const prevTs = prevRaw ? Date.parse(String(prevRaw)) : NaN;
      if (Number.isFinite(nextTs) && Number.isFinite(prevTs)) return nextTs > prevTs;
      if (Number.isFinite(nextTs) && !Number.isFinite(prevTs)) return true;
      return false;
    };
    groups.forEach((group) => {
      (Array.isArray(group) ? group : []).forEach((row) => {
        const key = String(row?.exerciseKey || '').trim();
        if (!key) return;
        const existing = byKey.get(key) || null;
        if (!existing) {
          byKey.set(key, { ...row });
          return;
        }
        const merged = { ...existing };
        if (row.exerciseName && (!merged.exerciseName || merged.exerciseName === 'Exercise')) merged.exerciseName = row.exerciseName;
        if (row.best && (!merged.best || compareLiftPerformance(row.best, merged.best) > 0)) merged.best = row.best;
        if (row.last && (!merged.last || newerThan(row.last?.performedAt, merged.last?.performedAt))) merged.last = row.last;
        byKey.set(key, merged);
      });
    });
    return Array.from(byKey.values()).sort((a, b) => {
      const bestDiff = compareLiftPerformance(b.best, a.best);
      if (bestDiff !== 0) return bestDiff;
      return String(a.exerciseName || '').localeCompare(String(b.exerciseName || ''));
    });
  }

  function deriveLiftHistoryRowsFromLogs(logs) {
    const byKey = new Map();
    const rows = Array.isArray(logs) ? logs : [];
    rows.forEach((log) => {
      const performedAt = log?.performed_at ? String(log.performed_at).slice(0, 10) : null;
      const entries = Array.isArray(log?.entries) ? log.entries : [];
      entries.forEach((entry) => {
        const key = normalizeLiftHistoryKey(entry?.baseId || entry?.exerciseId || entry?.exerciseName || entry?.name);
        if (!key) return;
        const incoming = {
          exerciseKey: key,
          exerciseName: String(entry?.exerciseName || entry?.name || entry?.baseId || entry?.exerciseId || 'Exercise').trim() || 'Exercise',
          best: extractBestPerformanceFromEntry(entry, performedAt),
          last: extractLastPerformanceFromEntry(entry, performedAt)
        };
        if (!incoming.best && !incoming.last) return;
        const existing = byKey.get(key) || null;
        if (!existing) {
          byKey.set(key, incoming);
          return;
        }
        if (incoming.best && (!existing.best || compareLiftPerformance(incoming.best, existing.best) > 0)) existing.best = incoming.best;
        if (incoming.last) {
          const existingTs = existing.last?.performedAt ? Date.parse(String(existing.last.performedAt)) : NaN;
          const nextTs = incoming.last?.performedAt ? Date.parse(String(incoming.last.performedAt)) : NaN;
          if (!existing.last || (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs >= existingTs))) {
            existing.last = incoming.last;
          }
        }
        if (incoming.exerciseName && (!existing.exerciseName || existing.exerciseName === 'Exercise')) existing.exerciseName = incoming.exerciseName;
      });
    });
    return Array.from(byKey.values());
  }

  function initPrUi() {
    const btn = $('#account-pr-btn');
    const modal = $('#account-pr-modal');
    const backdrop = $('#account-pr-backdrop');
    const closeBtn = $('#account-pr-close');
    const bodyEl = $('#account-pr-body');
    if (!btn || !modal || !backdrop || !closeBtn || !bodyEl) return;

    let loading = false;
    let rows = [];

    const renderLoading = () => {
      bodyEl.innerHTML = '<div class="account-pr-status">Loading PRs...</div>';
    };

    const renderError = (message) => {
      bodyEl.innerHTML = `<div class="account-pr-status">${escapeHtml(message || 'Could not load PRs.')}</div>`;
    };

    const renderRows = () => {
      if (!rows.length) {
        bodyEl.innerHTML = '<div class="account-pr-empty">No saved PRs yet. Finish some workouts first.</div>';
        return;
      }
      bodyEl.innerHTML = `
        <div class="account-pr-list">
          ${rows.map((row, idx) => {
            const best = formatLiftPerformance(row.best);
            const last = row.last ? formatLiftPerformance(row.last) : '—';
            const bestDate = row.best?.performedAt ? escapeHtml(row.best.performedAt) : '';
            const lastDate = row.last?.performedAt ? escapeHtml(row.last.performedAt) : '';
            return `
              <article class="account-pr-item">
                <div class="account-pr-mainrow">
                  <div class="account-pr-left">
                    <div class="account-pr-rank">#${idx + 1}</div>
                    <div class="account-pr-copy">
                      <div class="account-pr-name">${escapeHtml(row.exerciseName)}</div>
                      <div class="account-pr-meta">
                        ${row.last ? `<span class="account-pr-pill">Last ${escapeHtml(last)}</span>` : ''}
                        ${bestDate ? `<span class="account-pr-pill is-muted">Saved ${bestDate}</span>` : '<span class="account-pr-pill is-muted">Workout history</span>'}
                        ${row.last && lastDate ? `<span class="account-pr-pill is-muted">Last ${escapeHtml(lastDate)}</span>` : ''}
                      </div>
                    </div>
                  </div>
                  <div class="account-pr-value">
                    <div class="account-pr-best">${escapeHtml(best)}</div>
                  </div>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `;
    };

    const close = () => {
      modal.classList.add('hidden');
      document.body.classList.remove('account-pr-open');
    };

    const open = async () => {
      modal.classList.remove('hidden');
      document.body.classList.add('account-pr-open');
      if (loading) return;
      loading = true;
      renderLoading();
      try {
        const resp = await api('/api/training/state', { method: 'GET' });
        if (!resp.ok) {
          renderError(resp.json?.error || 'Could not load PRs.');
          return;
        }
        const stateRows = normalizeLiftHistoryRows(resp.json?.liftHistory);
        const planId = String(resp.json?.plan?.id || '').trim();
        let logRows = [];
        if (planId) {
          const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(planId)}`, { method: 'GET' });
          if (logsResp.ok) {
            logRows = deriveLiftHistoryRowsFromLogs(logsResp.json?.logs);
          }
        }
        rows = mergeLiftHistoryRows(stateRows, logRows);
        renderRows();
      } catch {
        renderError('Could not load PRs.');
      } finally {
        loading = false;
      }
    };

    btn.classList.remove('hidden');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
    backdrop.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });
  }

  async function lookupPhotoFromAccounts(user) {
    const userId = String(user?.id || '').trim();
    const username = String(user?.username || '').trim();
    const q = username || String(user?.displayName || '').trim();
    if (!q) return null;
    const resp = await api(`/api/auth/accounts?q=${encodeURIComponent(q)}`);
    if (!resp.ok || !Array.isArray(resp.json?.accounts)) return null;
    const match = resp.json.accounts.find((acct) => String(acct?.id || '') === userId)
      || resp.json.accounts.find((acct) => String(acct?.username || '').toLowerCase() === username.toLowerCase())
      || resp.json.accounts[0];
    const value = String(match?.photoDataUrl || '').trim();
    return value || null;
  }

  function initRequestsUi() {
    const btn = $('#account-requests-btn');
    const badge = $('#account-requests-count');
    const popover = $('#account-requests-popover');
    const statusEl = $('#account-req-status');
    const listEl = $('#account-req-list');
    const workoutTab = $('#account-requests-popover [data-req-tab="workout"]');
    const friendsTab = $('#account-requests-popover [data-req-tab="friends"]');
    const workoutTabCount = $('#account-req-workout-count');
    const friendsTabCount = $('#account-req-friends-count');

    const state = {
      activeTab: 'workout',
      friendRequests: [],
      workoutInvites: []
    };
    let requestsRefreshInFlight = false;
    let requestsRefreshTimer = 0;
    let pingHideTimer = 0;
    let pingRemoveTimer = 0;
    let requestBaselineReady = false;
    const knownFriendIds = new Set();
    const knownWorkoutIds = new Set();

    const setStatus = (text) => {
      if (statusEl) statusEl.textContent = String(text || '');
    };

    const replaceSet = (target, nextValues) => {
      target.clear();
      nextValues.forEach((value) => target.add(value));
    };

    const clearPingToast = () => {
      const existing = $('#account-requests-ping');
      if (!existing) return;
      existing.classList.remove('show');
      if (pingRemoveTimer) window.clearTimeout(pingRemoveTimer);
      pingRemoveTimer = window.setTimeout(() => {
        try { existing.remove(); } catch { /* ignore */ }
      }, 180);
    };

    const setActionsDisabled = (disabled) => {
      const actionButtons = listEl?.querySelectorAll('[data-req-kind][data-req-id][data-req-action]');
      actionButtons?.forEach((node) => {
        if (node instanceof HTMLButtonElement) node.disabled = Boolean(disabled);
      });
    };

    const updateCounts = () => {
      const friendRequests = Array.isArray(state.friendRequests) ? state.friendRequests : [];
      const workoutInvites = Array.isArray(state.workoutInvites) ? state.workoutInvites : [];
      const friendCount = friendRequests.length;
      const workoutCount = workoutInvites.length;
      const total = friendCount + workoutCount;
      if (workoutTabCount) workoutTabCount.textContent = String(workoutCount);
      if (friendsTabCount) friendsTabCount.textContent = String(friendCount);
      if (btn) btn.classList.toggle('has-pending', total > 0);
      if (badge) {
        badge.textContent = String(total);
        badge.classList.toggle('hidden', total <= 0);
      }
    };

    const renderList = () => {
      if (!listEl) return;
      const rows = state.activeTab === 'friends' ? state.friendRequests : state.workoutInvites;
      if (!rows.length) {
        listEl.innerHTML = `<div class="account-req-empty">No ${state.activeTab === 'friends' ? 'friend requests' : 'workout invites'}.</div>`;
        return;
      }
      if (state.activeTab === 'friends') {
        listEl.innerHTML = rows.map((req) => {
          const name = escapeHtml(req?.displayName || req?.username || 'Account');
          const handle = escapeHtml(req?.username ? `@${req.username}` : '');
          const id = escapeHtml(req?.id || '');
          return `
            <article class="account-req-item">
              <div>
                <div class="account-req-item-name">${name}</div>
                <div class="account-req-item-sub">${handle || 'Friend request'}</div>
              </div>
              <div class="account-req-actions">
                <button type="button" class="account-req-action accept" data-req-kind="friend" data-req-id="${id}" data-req-action="accept">Accept</button>
                <button type="button" class="account-req-action reject" data-req-kind="friend" data-req-id="${id}" data-req-action="reject">Decline</button>
              </div>
            </article>
          `;
        }).join('');
        return;
      }
      listEl.innerHTML = rows.map((invite) => {
        const name = escapeHtml(invite?.displayName || invite?.username || 'Account');
        const handle = escapeHtml(invite?.username ? `@${invite.username}` : '');
        const discipline = escapeHtml(invite?.discipline ? String(invite.discipline).toUpperCase() : 'TRAINING');
        const days = Number(invite?.daysPerWeek || 0);
        const detail = days ? `${discipline} - ${days} days/week` : discipline;
        const id = escapeHtml(invite?.id || '');
        return `
          <article class="account-req-item">
            <div>
              <div class="account-req-item-name">${name}</div>
              <div class="account-req-item-sub">${handle || ''}</div>
              <div class="account-req-item-sub">${escapeHtml(detail)}</div>
            </div>
            <div class="account-req-actions">
              <button type="button" class="account-req-action accept" data-req-kind="workout" data-req-id="${id}" data-req-action="accept">Accept</button>
              <button type="button" class="account-req-action reject" data-req-kind="workout" data-req-id="${id}" data-req-action="reject">Decline</button>
            </div>
          </article>
        `;
      }).join('');
    };

    const setActiveTab = (tabRaw) => {
      const tab = String(tabRaw || '').toLowerCase() === 'friends' ? 'friends' : 'workout';
      state.activeTab = tab;
      if (workoutTab) {
        const active = tab === 'workout';
        workoutTab.classList.toggle('active', active);
        workoutTab.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      if (friendsTab) {
        const active = tab === 'friends';
        friendsTab.classList.toggle('active', active);
        friendsTab.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      renderList();
    };

    const closePopover = () => {
      if (!popover) return;
      popover.classList.add('hidden');
      popover.setAttribute('aria-hidden', 'true');
    };

    const openPopover = async () => {
      if (!popover) return;
      popover.classList.remove('hidden');
      popover.setAttribute('aria-hidden', 'false');
      await refreshRequests(true);
    };

    const showIncomingPing = ({ workoutDelta = 0, friendDelta = 0, total = 0, initial = false } = {}) => {
      if (!btn) return;
      btn.classList.add('is-pinging');
      if (pingHideTimer) window.clearTimeout(pingHideTimer);
      pingHideTimer = window.setTimeout(() => {
        btn.classList.remove('is-pinging');
      }, 2600);

      clearPingToast();
      const ping = document.createElement('button');
      ping.type = 'button';
      ping.id = 'account-requests-ping';
      ping.className = 'account-requests-ping';
      ping.setAttribute('aria-label', 'Open requests');

      const title = document.createElement('div');
      title.className = 'account-requests-ping-title';
      const sub = document.createElement('div');
      sub.className = 'account-requests-ping-sub';
      if (initial) {
        title.textContent = total === 1 ? 'You have 1 pending request' : `You have ${total} pending requests`;
        sub.textContent = 'Open Requests to accept or decline.';
      } else {
        const newTotal = Math.max(0, Number(workoutDelta || 0)) + Math.max(0, Number(friendDelta || 0));
        title.textContent = newTotal === 1 ? 'New request received' : `${newTotal} new requests received`;
        const bits = [];
        if (workoutDelta > 0) bits.push(`${workoutDelta} workout`);
        if (friendDelta > 0) bits.push(`${friendDelta} friend`);
        sub.textContent = bits.length ? `${bits.join(' + ')} request${newTotal === 1 ? '' : 's'}` : 'Open Requests to review.';
      }
      ping.appendChild(title);
      ping.appendChild(sub);
      ping.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveTab(workoutDelta > 0 ? 'workout' : 'friends');
        openPopover();
        clearPingToast();
        btn.classList.remove('is-pinging');
      });

      document.body.appendChild(ping);
      requestAnimationFrame(() => ping.classList.add('show'));
      if (pingRemoveTimer) window.clearTimeout(pingRemoveTimer);
      pingRemoveTimer = window.setTimeout(() => {
        clearPingToast();
      }, 4800);
    };

    const refreshRequests = async (showLoading = false) => {
      if (!btn) return;
      if (requestsRefreshInFlight) return;
      requestsRefreshInFlight = true;
      if (showLoading) setStatus('Loading requests...');
      try {
        const [friendResp, workoutResp] = await Promise.all([
          api('/api/friends/requests?fresh=1'),
          api('/api/training/share/requests?fresh=1')
        ]);
        const friendRequests = friendResp.ok && Array.isArray(friendResp.json?.requests) ? friendResp.json.requests : [];
        const workoutInvites = workoutResp.ok && Array.isArray(workoutResp.json?.invites) ? workoutResp.json.invites : [];
        state.friendRequests = friendRequests;
        state.workoutInvites = workoutInvites;

        const friendIds = new Set(friendRequests.map((item) => String(item?.id || '').trim()).filter(Boolean));
        const workoutIds = new Set(workoutInvites.map((item) => String(item?.id || '').trim()).filter(Boolean));
        const total = friendIds.size + workoutIds.size;
        if (!requestBaselineReady) {
          requestBaselineReady = true;
          replaceSet(knownFriendIds, friendIds);
          replaceSet(knownWorkoutIds, workoutIds);
          if (total > 0 && !document.hidden) {
            showIncomingPing({
              workoutDelta: workoutIds.size,
              friendDelta: friendIds.size,
              total,
              initial: true
            });
          }
        } else {
          const newFriend = Array.from(friendIds).filter((id) => !knownFriendIds.has(id)).length;
          const newWorkout = Array.from(workoutIds).filter((id) => !knownWorkoutIds.has(id)).length;
          replaceSet(knownFriendIds, friendIds);
          replaceSet(knownWorkoutIds, workoutIds);
          if ((newFriend + newWorkout) > 0) {
            if (popover?.classList.contains('hidden')) {
              if (!document.hidden) {
                showIncomingPing({
                  workoutDelta: newWorkout,
                  friendDelta: newFriend,
                  total
                });
              }
            } else {
              setStatus('New request received.');
            }
          }
        }

        updateCounts();
        if (showLoading) setStatus('');
        renderList();
      } finally {
        requestsRefreshInFlight = false;
      }
    };

    const respond = async (kindRaw, idRaw, actionRaw) => {
      const kind = String(kindRaw || '').toLowerCase();
      const id = String(idRaw || '');
      const action = String(actionRaw || '').toLowerCase();
      if (!id || (action !== 'accept' && action !== 'reject')) return;
      if (kind === 'workout' && action === 'accept') {
        const ok = window.confirm('Joining this plan will replace your current training plan. Continue?');
        if (!ok) return;
      }

      setActionsDisabled(true);
      setStatus('Updating...');
      let resp = null;
      if (kind === 'friend') {
        resp = await api('/api/friends/respond', {
          method: 'POST',
          body: JSON.stringify({ requestId: id, action })
        });
      } else if (kind === 'workout') {
        resp = await api('/api/training/share/respond', {
          method: 'POST',
          body: JSON.stringify({ inviteId: id, action })
        });
      }

      if (!resp?.ok || !resp?.json?.ok) {
        setStatus(resp?.json?.error || 'Could not update request.');
        setActionsDisabled(false);
        return;
      }

      if (kind === 'workout' && action === 'accept') {
        const invite = state.workoutInvites.find((row) => String(row?.id || '') === id) || null;
        const welcome = (resp?.json?.welcome && typeof resp.json.welcome === 'object')
          ? resp.json.welcome
          : fallbackWelcomeFromInvite(invite);
        setActionsDisabled(false);
        stashTrainingWelcomeAndRedirect(welcome);
        return;
      }

      await refreshRequests();
      setStatus(action === 'accept' ? 'Accepted.' : 'Declined.');
      window.setTimeout(() => {
        const text = String(statusEl?.textContent || '');
        if (text === 'Accepted.' || text === 'Declined.') setStatus('');
      }, 1100);
      setActionsDisabled(false);
    };

    if (btn) {
      btn.classList.remove('hidden');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearPingToast();
        btn.classList.remove('is-pinging');
        if (popover?.classList.contains('hidden')) openPopover();
        else closePopover();
      });
    }

    workoutTab?.addEventListener('click', () => setActiveTab('workout'));
    friendsTab?.addEventListener('click', () => setActiveTab('friends'));

    popover?.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const actionBtn = target.closest('[data-req-kind][data-req-id][data-req-action]');
      if (!actionBtn) return;
      respond(
        actionBtn.getAttribute('data-req-kind'),
        actionBtn.getAttribute('data-req-id'),
        actionBtn.getAttribute('data-req-action')
      );
    });

    document.addEventListener('click', (e) => {
      if (!popover || popover.classList.contains('hidden')) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (popover.contains(target)) return;
      if (btn && btn.contains(target)) return;
      closePopover();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopover();
    });

    const triggerRefreshSoon = () => {
      if (document.hidden) return;
      refreshRequests(false);
    };
    document.addEventListener('visibilitychange', triggerRefreshSoon);
    window.addEventListener('focus', triggerRefreshSoon);
    requestsRefreshTimer = window.setInterval(() => {
      triggerRefreshSoon();
    }, 5000);

    window.addEventListener('beforeunload', () => {
      if (requestsRefreshTimer) window.clearInterval(requestsRefreshTimer);
      requestsRefreshTimer = 0;
      if (pingHideTimer) window.clearTimeout(pingHideTimer);
      pingHideTimer = 0;
      if (pingRemoveTimer) window.clearTimeout(pingRemoveTimer);
      pingRemoveTimer = 0;
    });

    setActiveTab('workout');
    refreshRequests();
  }

  async function init() {
    const statusEl = $('#account-status');
    const nameEl = $('#account-name');
    const friendsEl = $('#account-friends');
    if (statusEl) statusEl.textContent = 'Loading account...';

    const me = await api('/api/auth/me');
    if (!me.ok || !me.json?.user) {
      if (statusEl) statusEl.textContent = 'Sign in required.';
      return;
    }

    const user = me.json.user || {};
    const name = String(user.displayName || user.username || 'Account');
    if (nameEl) nameEl.textContent = name;

    const [profileResp, friendsResp, warningsResp] = await Promise.all([
      api('/api/profile'),
      api('/api/friends/list'),
      api('/api/friends/warnings')
    ]);

    let photoDataUrl = profileResp.ok ? getProfilePhotoFromPayload(profileResp.json) : null;
    if (!photoDataUrl) {
      photoDataUrl = await lookupPhotoFromAccounts(user);
    }
    renderAvatar(name, photoDataUrl);

    const friendCount = friendsResp.ok && Array.isArray(friendsResp.json?.friends)
      ? friendsResp.json.friends.length
      : 0;
    if (friendsEl) friendsEl.textContent = `${friendCount} friend${friendCount === 1 ? '' : 's'}`;

    if (warningsResp.ok && warningsResp.json?.ok) {
      const warnings = Array.isArray(warningsResp.json?.warnings) ? warningsResp.json.warnings : [];
      const status = warnings.length
        ? `Active: ${warnings.length}`
        : (String(warningsResp.json?.status || '').trim() || 'No warnings');
      renderWarnings(warnings, status);
    } else {
      renderWarnings([], 'Could not load warnings.');
    }

    initRequestsUi();
    initPrUi();
    initSetupUi(profileResp);

    if (statusEl) statusEl.textContent = '';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
