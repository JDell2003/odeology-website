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
      const friendCount = state.friendRequests.length;
      const workoutCount = state.workoutInvites.length;
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

    if (statusEl) statusEl.textContent = '';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
