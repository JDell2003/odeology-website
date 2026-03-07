(() => {
  const $ = (sel) => document.querySelector(sel);

  async function api(path) {
    try {
      const resp = await fetch(path, { credentials: 'include' });
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

    if (statusEl) statusEl.textContent = '';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
