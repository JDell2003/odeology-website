(() => {
  const $ = (sel) => document.querySelector(sel);

  const state = {
    accounts: [],
    search: '',
    searchTimer: null,
    ownerApiReady: true
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

  function renderList() {
    const wrap = $('#owner-accounts-list');
    if (!wrap) return;
    if (!state.accounts.length) {
      wrap.innerHTML = '<div class="owner-accounts-muted">No accounts found.</div>';
      return;
    }

    wrap.innerHTML = state.accounts.map((acct) => {
      const username = acct.username ? `@${acct.username}` : '(no username)';
      const discipline = acct.discipline ? acct.discipline : 'no discipline';
      const msgPill = Number(acct.ownerMessageCount || 0) > 0
        ? `<span class="owner-accounts-pill good">Msgs ${Number(acct.ownerMessageCount || 0)}</span>`
        : '<span class="owner-accounts-pill">Msgs 0</span>';
      const planPill = acct.hasActivePlan
        ? '<span class="owner-accounts-pill good">Plan active</span>'
        : '<span class="owner-accounts-pill">No plan</span>';
      return `
        <article class="owner-account-item" data-account-id="${escapeHtml(acct.id)}" role="button" tabindex="0">
          <div class="owner-account-row1">
            <div class="owner-account-name">${escapeHtml(acct.displayName || 'Account')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">${planPill}${msgPill}</div>
          </div>
          <div class="owner-account-meta">
            <span>${escapeHtml(username)}</span>
            <span>${escapeHtml(acct.email || '-')}</span>
            <span>${escapeHtml(discipline)}</span>
            <span>Last seen: ${escapeHtml(fmtDate(acct.lastSeen))}</span>
          </div>
          <div class="owner-accounts-actions">
            <button class="btn btn-ghost" type="button" data-action="view" data-account-id="${escapeHtml(acct.id)}">View Overview</button>
            <button class="btn btn-ghost" type="button" data-action="password" data-account-id="${escapeHtml(acct.id)}">Change Password</button>
            <button class="btn btn-ghost" type="button" data-action="delete" data-account-id="${escapeHtml(acct.id)}">Delete</button>
          </div>
        </article>
      `;
    }).join('');
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
      hasActivePlan: Boolean(item.hasActivePlan),
      ownerMessageCount: Number(item.ownerMessageCount || 0),
      lastSeen: item.lastSeen || null
    }));
    setListCount(`${state.accounts.length} accounts`);
    state.ownerApiReady = !usedFallback;
    if (usedFallback) {
      setStatus('Loaded via fallback endpoint. Restart backend to enable full owner account actions.', 'error');
    }
    renderList();
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
        redirectToUserOverview(item.getAttribute('data-account-id'));
      });

      list.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target?.closest?.('[data-action]')) return;
        const item = e.target?.closest?.('[data-account-id]');
        if (!item) return;
        e.preventDefault();
        redirectToUserOverview(item.getAttribute('data-account-id'));
      });
    }
  }

  async function init() {
    const me = await api('/api/auth/me');
    if (!me.ok || !me.json?.user?.isOwner) {
      const wrap = $('#owner-accounts-list');
      if (wrap) wrap.innerHTML = '<div class="owner-accounts-muted">Owner access required.</div>';
      setListCount('');
      return;
    }

    bindEvents();
    await loadAccounts();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
