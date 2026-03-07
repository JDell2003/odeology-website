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

    const setStatus = (text) => {
      if (statusEl) statusEl.textContent = String(text || '');
    };

    const updateCounts = () => {
      const friendCount = state.friendRequests.length;
      const workoutCount = state.workoutInvites.length;
      const total = friendCount + workoutCount;
      if (workoutTabCount) workoutTabCount.textContent = String(workoutCount);
      if (friendsTabCount) friendsTabCount.textContent = String(friendCount);
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
        const detail = days ? `${discipline} • ${days} days/week` : discipline;
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

    const refreshRequests = async (showLoading = false) => {
      if (!btn) return;
      if (showLoading) setStatus('Loading requests...');
      const [friendResp, workoutResp] = await Promise.all([
        api('/api/friends/requests?fresh=1'),
        api('/api/training/share/requests?fresh=1')
      ]);
      state.friendRequests = friendResp.ok && Array.isArray(friendResp.json?.requests) ? friendResp.json.requests : [];
      state.workoutInvites = workoutResp.ok && Array.isArray(workoutResp.json?.invites) ? workoutResp.json.invites : [];
      updateCounts();
      setStatus('');
      renderList();
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
      setStatus('Updating...');
      if (kind === 'friend') {
        await api('/api/friends/respond', {
          method: 'POST',
          body: JSON.stringify({ requestId: id, action })
        });
      } else if (kind === 'workout') {
        await api('/api/training/share/respond', {
          method: 'POST',
          body: JSON.stringify({ inviteId: id, action })
        });
      }
      await refreshRequests();
    };

    if (btn) {
      btn.classList.remove('hidden');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
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
