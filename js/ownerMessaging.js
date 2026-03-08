(() => {
  const $ = (sel) => document.querySelector(sel);
  const MAX_IMAGE_BYTES = 900000;

  const state = {
    accounts: [],
    currentOwnerId: '',
    selectedUserId: null,
    selectedAccount: null,
    messages: [],
    threadLoading: false,
    deletingMessageIds: new Set(),
    groupFriends: [],
    speech: null,
    isRecognizing: false,
    pendingDirectImageDataUrl: null,
    pendingDirectAttachmentNote: '',
    search: '',
    searchTimer: null
  };

  const PROFILE_STORAGE_PREFIX = 'ode_owner_profile_v1';

  function isMobileThreadUi() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  function setMobileView(mode) {
    const body = document.body;
    if (!body) return;
    const showThread = mode === 'thread' && isMobileThreadUi();
    body.classList.toggle('owner-mobile-thread', showThread);
  }

  function setThreadSelectionUi(active) {
    const body = document.body;
    if (!body) return;
    body.classList.toggle('owner-thread-active', Boolean(active));
  }

  function getDirectMessageText() {
    const mobileInput = $('#owner-msg-mobile-input');
    const desktopInput = $('#owner-msg-body');
    if (isMobileThreadUi() && mobileInput) return String(mobileInput.value || '').trim();
    return String(desktopInput?.value || '').trim();
  }

  function getDirectMessageTextRaw() {
    const mobileInput = $('#owner-msg-mobile-input');
    const desktopInput = $('#owner-msg-body');
    if (isMobileThreadUi() && mobileInput) return String(mobileInput.value || '');
    return String(desktopInput?.value || '');
  }

  function setDirectMessageText(value) {
    const v = String(value || '');
    const mobileInput = $('#owner-msg-mobile-input');
    const desktopInput = $('#owner-msg-body');
    if (mobileInput) mobileInput.value = v;
    if (desktopInput) desktopInput.value = v;
  }

  function updateMobileActionUi() {
    const cameraBtn = $('#owner-msg-mobile-camera');
    const hasTypedText = getDirectMessageText().length > 0;
    if (cameraBtn) {
      if (hasTypedText) {
        cameraBtn.textContent = '↑';
        cameraBtn.setAttribute('aria-label', 'Send message');
        cameraBtn.dataset.mode = 'send';
        cameraBtn.classList.add('is-send');
      } else {
        cameraBtn.textContent = '📷';
        cameraBtn.setAttribute('aria-label', 'Use camera');
        cameraBtn.dataset.mode = 'camera';
        cameraBtn.classList.remove('is-send');
      }
    }

    const btn = $('#owner-msg-mobile-action');
    if (!btn) return;
    const hasPayload = getDirectMessageText().length > 0 || Boolean(state.pendingDirectImageDataUrl) || Boolean(state.pendingDirectAttachmentNote);
    if (hasPayload) {
      btn.textContent = '↑';
      btn.setAttribute('aria-label', 'Send message');
      btn.dataset.mode = 'send';
      return;
    }
    if (state.isRecognizing) {
      btn.textContent = '■';
      btn.setAttribute('aria-label', 'Stop voice input');
      btn.dataset.mode = 'mic-stop';
      return;
    }
    btn.textContent = '🎙';
    btn.setAttribute('aria-label', 'Voice to text');
    btn.dataset.mode = 'mic';
  }

  function updateMobileFileMeta(text = '') {
    const el = $('#owner-msg-mobile-file-meta');
    if (!el) return;
    const value = String(text || '');
    el.textContent = value;
    el.style.display = value ? 'block' : 'none';
  }

  function clearPendingDirectMedia() {
    state.pendingDirectImageDataUrl = null;
    state.pendingDirectAttachmentNote = '';
    const attachInput = $('#owner-msg-mobile-attach-input');
    const cameraInput = $('#owner-msg-mobile-camera-input');
    if (attachInput) attachInput.value = '';
    if (cameraInput) cameraInput.value = '';
    updateMobileFileMeta('');
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

  function formatDate(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString();
  }

  function setStatus(text, kind = '') {
    const el = $('#owner-msg-status');
    const mobileEl = $('#owner-msg-mobile-status');
    if (!el) return;
    const msg = String(text || '');
    el.textContent = msg;
    el.classList.remove('owner-msg-error', 'owner-msg-ok');
    if (kind === 'error') el.classList.add('owner-msg-error');
    if (kind === 'ok') el.classList.add('owner-msg-ok');
    if (mobileEl) {
      mobileEl.textContent = msg;
      mobileEl.classList.remove('owner-msg-error', 'owner-msg-ok');
      if (kind === 'error') mobileEl.classList.add('owner-msg-error');
      if (kind === 'ok') mobileEl.classList.add('owner-msg-ok');
      mobileEl.style.display = (isMobileThreadUi() && msg) ? 'block' : 'none';
    }
  }

  function setMassStatus(text, kind = '') {
    const el = $('#owner-msg-mass-status');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('owner-msg-error', 'owner-msg-ok');
    if (kind === 'error') el.classList.add('owner-msg-error');
    if (kind === 'ok') el.classList.add('owner-msg-ok');
  }

  function setGroupStatus(text, kind = '') {
    const el = $('#owner-msg-group-status');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('owner-msg-error', 'owner-msg-ok');
    if (kind === 'error') el.classList.add('owner-msg-error');
    if (kind === 'ok') el.classList.add('owner-msg-ok');
  }

  function setRecipientCount(text) {
    const el = $('#owner-msg-recipient-count');
    if (el) el.textContent = String(text || '');
  }

  function profileStorageKey(userId) {
    return `${PROFILE_STORAGE_PREFIX}:${state.currentOwnerId || 'owner'}:${String(userId || '')}`;
  }

  function getProfileOverride(userId) {
    if (!userId) return null;
    try {
      const raw = localStorage.getItem(profileStorageKey(userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        bio: String(parsed.bio || ''),
        notes: String(parsed.notes || ''),
        profileImageDataUrl: String(parsed.profileImageDataUrl || '')
      };
    } catch {
      return null;
    }
  }

  function saveProfileOverride(userId, payload) {
    if (!userId) return;
    const data = {
      bio: String(payload?.bio || ''),
      notes: String(payload?.notes || ''),
      profileImageDataUrl: String(payload?.profileImageDataUrl || '')
    };
    localStorage.setItem(profileStorageKey(userId), JSON.stringify(data));
  }

  function clearProfileOverride(userId) {
    if (!userId) return;
    localStorage.removeItem(profileStorageKey(userId));
  }

  function getInitials(name) {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'A';
  }

  function makeAvatarPlaceholderDataUrl(label) {
    const initials = escapeHtml(getInitials(label));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e3eaf4"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#2b2b2b">${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function setProfileStatus(text, kind = '') {
    const el = $('#owner-msg-profile-status');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('owner-msg-error', 'owner-msg-ok');
    if (kind === 'error') el.classList.add('owner-msg-error');
    if (kind === 'ok') el.classList.add('owner-msg-ok');
  }

  function bytesToKb(n) {
    return `${Math.max(1, Math.round((Number(n) || 0) / 1000))}KB`;
  }

  function updateImageMeta(inputId, metaId) {
    const input = $(inputId);
    const meta = $(metaId);
    if (!meta) return;
    const file = input?.files?.[0] || null;
    if (!file) {
      meta.textContent = `Optional image (max ${bytesToKb(MAX_IMAGE_BYTES)})`;
      return;
    }
    meta.textContent = `${file.name} - ${bytesToKb(file.size)}`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read image: ${file?.name || 'file'}`));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }

  async function collectImageDataUrl(inputId) {
    const input = $(inputId);
    const file = input?.files?.[0] || null;
    if (!file) return { ok: true, dataUrl: null };
    const mime = String(file.type || '').toLowerCase();
    if (!mime.startsWith('image/')) return { ok: false, error: 'Selected file is not an image.' };
    if (Number(file.size || 0) > MAX_IMAGE_BYTES) {
      return { ok: false, error: `Image too large (${bytesToKb(file.size)} > ${bytesToKb(MAX_IMAGE_BYTES)}).` };
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      return { ok: true, dataUrl };
    } catch (err) {
      return { ok: false, error: err?.message || 'Could not read image.' };
    }
  }

  function bodyToHtml(text) {
    const safe = escapeHtml(text || '');
    return safe.replace(/\n/g, '<br>');
  }

  function renderAccounts() {
    const wrap = $('#owner-msg-accounts');
    if (!wrap) return;
    if (!state.accounts.length) {
      wrap.innerHTML = '<div class="owner-msg-muted">No accounts found.</div>';
      return;
    }

    wrap.innerHTML = state.accounts.map((acct) => {
      const active = String(acct.id) === String(state.selectedUserId) ? ' active' : '';
      const lastText = acct.lastMessageText ? String(acct.lastMessageText).slice(0, 60) : 'No messages yet';
      return `
        <article class="owner-msg-account${active}" data-user-id="${escapeHtml(acct.id)}">
          <div class="owner-msg-account-name">${escapeHtml(acct.displayName || acct.username || 'Account')}</div>
          <div class="owner-msg-account-meta">
            <span>${escapeHtml(acct.username ? `@${acct.username}` : '(no username)')}</span>
            <span>${escapeHtml(acct.email || '-')}</span>
          </div>
          <div class="owner-msg-account-meta">
            <span>${escapeHtml(lastText)}</span>
            <span>${escapeHtml(formatDate(acct.lastMessageAt) || '')}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderThread() {
    const nameEl = $('#owner-msg-thread-name');
    const subEl = $('#owner-msg-thread-sub');
    const bioEl = $('#owner-msg-thread-bio');
    const listEl = $('#owner-msg-thread-list');
    const avatarEl = $('#owner-msg-thread-avatar');
    if (!nameEl || !subEl || !listEl) return;

    if (!state.selectedAccount) {
      setThreadSelectionUi(false);
      nameEl.textContent = 'Select an account';
      subEl.textContent = 'No conversation selected.';
      if (bioEl) {
        bioEl.textContent = '';
        bioEl.style.display = 'none';
      }
      listEl.innerHTML = '<div class="owner-msg-muted">Select an account to load messages.</div>';
      if (avatarEl) {
        avatarEl.innerHTML = '';
        avatarEl.textContent = '•';
      }
      updateMobileActionUi();
      return;
    }

    const override = getProfileOverride(state.selectedUserId);
    setThreadSelectionUi(true);
    const displayName = state.selectedAccount.displayName || state.selectedAccount.username || 'Account';
    nameEl.textContent = displayName;
    subEl.textContent = `${state.selectedAccount.username ? `@${state.selectedAccount.username} · ` : ''}${state.selectedAccount.email || 'No email'}`;
    if (bioEl) {
      const bio = String(override?.bio || '').trim();
      bioEl.textContent = bio;
      bioEl.style.display = bio ? 'block' : 'none';
    }
    if (avatarEl) {
      avatarEl.innerHTML = '';
      if (override?.profileImageDataUrl) {
        const img = document.createElement('img');
        img.src = override.profileImageDataUrl;
        img.alt = `${displayName} profile`;
        img.loading = 'lazy';
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = getInitials(displayName);
      }
    }

    if (state.threadLoading) {
      listEl.innerHTML = '<div class="owner-msg-muted">Loading conversation...</div>';
      updateMobileActionUi();
      return;
    }

    if (!state.messages.length) {
      listEl.innerHTML = '<div class="owner-msg-muted">No messages yet. Send the first one.</div>';
      updateMobileActionUi();
      return;
    }

    const myId = String(window.__odeCurrentUser?.id || '');
    const selectedUserId = String(state.selectedUserId || '');
    listEl.innerHTML = state.messages.map((msg) => {
      const senderId = String(msg?.senderId || '');
      const mine = senderId
        ? (selectedUserId ? senderId !== selectedUserId : senderId === myId)
        : false;
      const bodyHtml = msg.body ? `<div>${bodyToHtml(msg.body)}</div>` : '';
      const imageHtml = msg.imageDataUrl
        ? `<img class="owner-msg-image" src="${escapeHtml(msg.imageDataUrl)}" alt="Message image">`
        : '';
      const stamp = formatDate(msg.createdAt);
      const canDelete = Boolean(msg?.id);
      const isDeleting = canDelete && state.deletingMessageIds.has(String(msg.id));
      return `
        <div class="owner-msg-row${mine ? ' me' : ''}">
          ${canDelete ? `<button type="button" class="owner-msg-delete" title="Delete message" aria-label="Delete message" data-message-id="${escapeHtml(msg.id)}" ${isDeleting ? 'disabled' : ''}>${isDeleting ? '...' : '🗑'}</button>` : ''}
          <article class="owner-msg-bubble${mine ? ' me' : ''}">
            ${bodyHtml || ''}
            ${imageHtml}
            <div class="owner-msg-bubble-meta">
              <span>${mine ? 'You' : 'User'} · ${escapeHtml(stamp || '')}</span>
            </div>
          </article>
        </div>
      `;
    }).join('');

    listEl.scrollTop = listEl.scrollHeight;
    updateMobileActionUi();
  }

  async function loadStats() {
    const resp = await api('/api/messages/owner/stats');
    if (!resp.ok) {
      setRecipientCount('Could not load recipients.');
      return false;
    }
    setRecipientCount(`Recipients: ${Number(resp.json?.recipients || 0)} users`);
    return true;
  }

  async function loadAccounts() {
    const qs = new URLSearchParams();
    qs.set('limit', '2000');
    if (state.search) qs.set('q', state.search);
    const resp = await api(`/api/messages/owner/accounts?${qs.toString()}`);
    if (!resp.ok) {
      const wrap = $('#owner-msg-accounts');
      if (wrap) wrap.innerHTML = `<div class="owner-msg-muted">${escapeHtml(resp.json?.error || 'Failed to load accounts.')}</div>`;
      return false;
    }

    state.accounts = Array.isArray(resp.json?.accounts) ? resp.json.accounts : [];
    renderAccounts();

    if (state.selectedUserId && !state.accounts.some((a) => String(a.id) === String(state.selectedUserId))) {
      state.selectedUserId = null;
      state.selectedAccount = null;
      state.messages = [];
      renderThread();
    }

    return true;
  }

  async function loadThread(userId) {
    closeOptionsMenu();
    state.selectedUserId = String(userId || '');
    state.selectedAccount = state.accounts.find((a) => String(a.id) === state.selectedUserId) || null;
    state.messages = [];
    state.threadLoading = true;
    setThreadSelectionUi(true);
    setDirectMessageText('');
    clearPendingDirectMedia();
    stopVoiceInput();
    renderAccounts();
    renderThread();
    setStatus('Loading conversation...');
    setMobileView('thread');

    const resp = await api(`/api/messages/owner/thread?userId=${encodeURIComponent(state.selectedUserId)}`);
    state.threadLoading = false;
    if (!resp.ok) {
      setStatus(resp.json?.error || 'Failed to load conversation.', 'error');
      renderThread();
      return;
    }

    state.selectedAccount = resp.json?.account || state.selectedAccount;
    state.messages = Array.isArray(resp.json?.messages) ? resp.json.messages : [];
    renderThread();
    setStatus('');
  }

  async function sendDirectMessage(e) {
    e.preventDefault();
    if (!state.selectedUserId) {
      setStatus('Select an account first.', 'error');
      return;
    }

    const bodyEl = $('#owner-msg-body');
    const sendBtn = $('#owner-msg-send');
    let body = String(getDirectMessageTextRaw() || '').trim();
    if (state.pendingDirectAttachmentNote && !state.pendingDirectImageDataUrl) {
      body = body ? `${body}\n\n${state.pendingDirectAttachmentNote}` : state.pendingDirectAttachmentNote;
    }
    const image = state.pendingDirectImageDataUrl
      ? { ok: true, dataUrl: state.pendingDirectImageDataUrl }
      : await collectImageDataUrl('#owner-msg-image');
    if (!image.ok) {
      setStatus(image.error || 'Image upload failed.', 'error');
      return;
    }
    if (!body && !image.dataUrl) {
      setStatus('Enter a message or attach an image.', 'error');
      return;
    }

    if (sendBtn) sendBtn.disabled = true;
    setStatus('Sending...');
    const resp = await api('/api/messages/owner/send', {
      method: 'POST',
      body: JSON.stringify({
        toUserId: state.selectedUserId,
        body,
        imageDataUrl: image.dataUrl || null
      })
    });
    if (sendBtn) sendBtn.disabled = false;

    if (!resp.ok) {
      setStatus(resp.json?.error || 'Failed to send message.', 'error');
      return;
    }

    if (bodyEl) bodyEl.value = '';
    setDirectMessageText('');
    const imgInput = $('#owner-msg-image');
    if (imgInput) imgInput.value = '';
    updateImageMeta('#owner-msg-image', '#owner-msg-image-meta');
    clearPendingDirectMedia();
    stopVoiceInput();
    updateMobileActionUi();
    setStatus('Message sent.', 'ok');
    await loadThread(state.selectedUserId);
    await loadAccounts();
  }

  async function handleMobileSelectedFile(file, source = 'attach') {
    if (!file) return;
    const mime = String(file.type || '').toLowerCase();
    const name = String(file.name || 'attachment');
    const isImage = mime.startsWith('image/');
    if (!isImage) {
      state.pendingDirectImageDataUrl = null;
      state.pendingDirectAttachmentNote = `[Attachment: ${name}]`;
      updateMobileFileMeta(`Attached: ${name}`);
      setStatus('File attached as note. Images can be sent inline.', 'ok');
      return;
    }
    if (Number(file.size || 0) > MAX_IMAGE_BYTES) {
      setStatus(`Image too large (${bytesToKb(file.size)} > ${bytesToKb(MAX_IMAGE_BYTES)}).`, 'error');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      state.pendingDirectImageDataUrl = dataUrl;
      state.pendingDirectAttachmentNote = '';
      updateMobileFileMeta(`${source === 'camera' ? 'Camera photo' : 'Image'} ready: ${name}`);
      setStatus('Image attached.', 'ok');
    } catch (err) {
      setStatus(err?.message || 'Could not read image.', 'error');
    }
  }

  function appendSpeechText(transcript) {
    const next = String(transcript || '').trim();
    if (!next) return;
    const current = String(getDirectMessageTextRaw() || '').trim();
    const joined = current ? `${current}${/[.!?]$/.test(current) ? ' ' : ' '}${next}` : next;
    setDirectMessageText(joined);
    updateMobileActionUi();
  }

  function stopVoiceInput() {
    if (!state.speech) {
      state.isRecognizing = false;
      updateMobileActionUi();
      return;
    }
    try {
      state.speech.stop();
    } catch {
      // No-op
    }
    state.isRecognizing = false;
    updateMobileActionUi();
  }

  function startVoiceInput() {
    const SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechCtor) {
      setStatus('Voice input is not supported in this browser.', 'error');
      return;
    }
    if (state.isRecognizing) return;
    const recognition = new SpeechCtor();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || '').trim();
      appendSpeechText(transcript);
    };
    recognition.onerror = (event) => {
      const code = String(event?.error || '').toLowerCase();
      if (code && code !== 'aborted' && code !== 'no-speech') {
        setStatus('Voice input failed. Check microphone permission.', 'error');
      }
    };
    recognition.onend = () => {
      state.isRecognizing = false;
      state.speech = null;
      updateMobileActionUi();
    };
    state.speech = recognition;
    state.isRecognizing = true;
    setStatus('Listening...', 'ok');
    updateMobileActionUi();
    try {
      recognition.start();
    } catch {
      state.isRecognizing = false;
      state.speech = null;
      setStatus('Could not start voice input.', 'error');
      updateMobileActionUi();
    }
  }

  function handleMobileActionButton() {
    const actionBtn = $('#owner-msg-mobile-action');
    if (!actionBtn) {
      const hasPayload = getDirectMessageText().length > 0 || Boolean(state.pendingDirectImageDataUrl) || Boolean(state.pendingDirectAttachmentNote);
      if (!hasPayload) return;
      const form = $('#owner-msg-send-form');
      if (form?.requestSubmit) {
        form.requestSubmit();
      } else if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
      return;
    }
    const mode = String(actionBtn.dataset?.mode || 'mic');
    if (mode === 'send') {
      const form = $('#owner-msg-send-form');
      if (form?.requestSubmit) {
        form.requestSubmit();
      } else if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
      return;
    }
    if (mode === 'mic-stop') {
      stopVoiceInput();
      return;
    }
    startVoiceInput();
  }

  async function deleteMessage(messageId) {
    const id = String(messageId || '').trim();
    if (!id || !state.selectedUserId) return;
    if (state.deletingMessageIds.has(id)) return;
    const ok = window.confirm('Delete this message for both accounts?');
    if (!ok) return;

    const previousMessages = Array.isArray(state.messages) ? state.messages.slice() : [];
    state.deletingMessageIds.add(id);
    state.messages = previousMessages.filter((msg) => String(msg?.id || '') !== id);
    renderThread();
    setStatus('Deleting message...');

    const resp = await api('/api/messages/owner/message/delete', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.selectedUserId,
        messageId: id
      })
    });

    state.deletingMessageIds.delete(id);

    if (!resp.ok) {
      state.messages = previousMessages;
      renderThread();
      const errText = String(resp.json?.error || 'Failed to delete message.');
      setStatus(errText, 'error');
      if (resp.status === 404) {
        window.alert(`${errText} If this keeps happening, restart the backend server and refresh.`);
      }
      return;
    }

    renderThread();
    setStatus(resp.json?.deleted === false ? 'Message already removed.' : 'Message deleted.', 'ok');
    loadAccounts();
  }

  function openMassModal() {
    const modal = $('#owner-msg-mass-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
  }

  function closeMassModal() {
    const modal = $('#owner-msg-mass-modal');
    if (!modal) return;
    modal.classList.add('hidden');
  }

  function closeOptionsMenu() {
    const menu = $('#owner-msg-options-menu');
    if (menu) menu.classList.add('hidden');
  }

  function toggleOptionsMenu() {
    if (!state.selectedUserId) {
      setStatus('Select an account first.', 'error');
      return;
    }
    const menu = $('#owner-msg-options-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
  }

  function openProfileModal() {
    if (!state.selectedUserId || !state.selectedAccount) {
      setStatus('Select an account first.', 'error');
      return;
    }
    closeOptionsMenu();
    const modal = $('#owner-msg-profile-modal');
    const preview = $('#owner-msg-profile-preview');
    const bioEl = $('#owner-msg-profile-bio');
    const notesEl = $('#owner-msg-profile-notes');
    const imageEl = $('#owner-msg-profile-image');
    const override = getProfileOverride(state.selectedUserId);
    const displayName = state.selectedAccount.displayName || state.selectedAccount.username || 'Account';
    if (preview) preview.src = override?.profileImageDataUrl || makeAvatarPlaceholderDataUrl(displayName);
    if (bioEl) bioEl.value = String(override?.bio || '');
    if (notesEl) notesEl.value = String(override?.notes || '');
    if (imageEl) imageEl.value = '';
    setProfileStatus('');
    if (modal) modal.classList.remove('hidden');
  }

  function closeProfileModal() {
    const modal = $('#owner-msg-profile-modal');
    if (modal) modal.classList.add('hidden');
  }

  function parseAttachmentName(messageBody) {
    const body = String(messageBody || '');
    const match = body.match(/\[Attachment:\s*([^\]]+)\]/i);
    return String(match?.[1] || '').trim();
  }

  function buildThreadAttachments() {
    return (Array.isArray(state.messages) ? state.messages : []).flatMap((msg) => {
      const createdAt = formatDate(msg?.createdAt);
      const senderId = String(msg?.senderId || '');
      const mine = senderId && senderId !== String(state.selectedUserId || '');
      const senderLabel = mine ? 'You' : 'User';
      const out = [];
      if (msg?.imageDataUrl) {
        out.push({
          type: 'image',
          label: 'Image',
          createdAt,
          senderLabel,
          imageDataUrl: String(msg.imageDataUrl)
        });
      }
      const attachmentName = parseAttachmentName(msg?.body);
      if (attachmentName) {
        out.push({
          type: 'file',
          label: attachmentName,
          createdAt,
          senderLabel,
          imageDataUrl: ''
        });
      }
      return out;
    });
  }

  function openAttachmentsModal() {
    if (!state.selectedUserId) {
      setStatus('Select an account first.', 'error');
      return;
    }
    closeOptionsMenu();
    const modal = $('#owner-msg-attachments-modal');
    const list = $('#owner-msg-attachments-list');
    if (!list || !modal) return;
    const attachments = buildThreadAttachments();
    if (!attachments.length) {
      list.innerHTML = '<div class="owner-msg-muted">No attachments in this conversation yet.</div>';
      modal.classList.remove('hidden');
      return;
    }
    list.innerHTML = attachments.map((item) => {
      if (item.type === 'image') {
        return `
          <article class="owner-msg-attach-item">
            <div class="owner-msg-muted">${escapeHtml(item.senderLabel)} · ${escapeHtml(item.createdAt || '')}</div>
            <img class="owner-msg-attach-thumb" src="${escapeHtml(item.imageDataUrl)}" alt="Attachment image">
            <a href="${escapeHtml(item.imageDataUrl)}" download="attachment-image" target="_blank" rel="noopener">Open image</a>
          </article>
        `;
      }
      return `
        <article class="owner-msg-attach-item">
          <div><strong>${escapeHtml(item.label)}</strong></div>
          <div class="owner-msg-muted">${escapeHtml(item.senderLabel)} · ${escapeHtml(item.createdAt || '')}</div>
        </article>
      `;
    }).join('');
    modal.classList.remove('hidden');
  }

  function closeAttachmentsModal() {
    const modal = $('#owner-msg-attachments-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function saveProfileSettings(e) {
    e.preventDefault();
    if (!state.selectedUserId) {
      setProfileStatus('Select an account first.', 'error');
      return;
    }
    const bioEl = $('#owner-msg-profile-bio');
    const notesEl = $('#owner-msg-profile-notes');
    const imageEl = $('#owner-msg-profile-image');
    const existing = getProfileOverride(state.selectedUserId) || {};
    let profileImageDataUrl = String(existing.profileImageDataUrl || '');
    const imageFile = imageEl?.files?.[0] || null;
    if (imageFile) {
      const mime = String(imageFile.type || '').toLowerCase();
      if (!mime.startsWith('image/')) {
        setProfileStatus('Profile image must be an image file.', 'error');
        return;
      }
      if (Number(imageFile.size || 0) > MAX_IMAGE_BYTES) {
        setProfileStatus(`Image too large (${bytesToKb(imageFile.size)} > ${bytesToKb(MAX_IMAGE_BYTES)}).`, 'error');
        return;
      }
      try {
        profileImageDataUrl = await readFileAsDataUrl(imageFile);
      } catch (err) {
        setProfileStatus(err?.message || 'Could not read image.', 'error');
        return;
      }
    }
    saveProfileOverride(state.selectedUserId, {
      bio: String(bioEl?.value || '').trim(),
      notes: String(notesEl?.value || '').trim(),
      profileImageDataUrl
    });
    if (imageEl) imageEl.value = '';
    setProfileStatus('Saved for owner view only.', 'ok');
    renderThread();
  }

  function clearProfileSettings() {
    if (!state.selectedUserId) {
      setProfileStatus('Select an account first.', 'error');
      return;
    }
    clearProfileOverride(state.selectedUserId);
    const bioEl = $('#owner-msg-profile-bio');
    const notesEl = $('#owner-msg-profile-notes');
    const imageEl = $('#owner-msg-profile-image');
    const preview = $('#owner-msg-profile-preview');
    const displayName = state.selectedAccount?.displayName || state.selectedAccount?.username || 'Account';
    if (bioEl) bioEl.value = '';
    if (notesEl) notesEl.value = '';
    if (imageEl) imageEl.value = '';
    if (preview) preview.src = makeAvatarPlaceholderDataUrl(displayName);
    setProfileStatus('Cleared owner-only profile edits.', 'ok');
    renderThread();
  }

  function openGroupModal() {
    if (!state.selectedUserId || !state.selectedAccount) {
      setStatus('Select an account first, then create group.', 'error');
      return;
    }
    const modal = $('#owner-msg-group-modal');
    if (!modal) return;
    const sub = $('#owner-msg-group-sub');
    if (sub) {
      const name = state.selectedAccount.displayName || state.selectedAccount.username || 'Account';
      sub.textContent = `Leader account: ${name}`;
    }
    setGroupStatus('');
    modal.classList.remove('hidden');
    loadGroupFriends();
  }

  function closeGroupModal() {
    const modal = $('#owner-msg-group-modal');
    if (!modal) return;
    modal.classList.add('hidden');
  }

  function renderGroupFriends() {
    const wrap = $('#owner-msg-group-friends');
    if (!wrap) return;
    if (!state.groupFriends.length) {
      wrap.innerHTML = '<div class="owner-msg-muted">This account has no friends to add yet.</div>';
      return;
    }
    wrap.innerHTML = state.groupFriends.map((friend) => `
      <label class="owner-group-friend">
        <input type="checkbox" value="${escapeHtml(friend.id)}">
        <span>
          <div>${escapeHtml(friend.displayName || friend.username || 'Account')}</div>
          <div class="owner-group-friend-meta">${escapeHtml(friend.username ? `@${friend.username}` : '')}</div>
        </span>
      </label>
    `).join('');
  }

  async function loadGroupFriends() {
    const wrap = $('#owner-msg-group-friends');
    if (wrap) wrap.innerHTML = '<div class="owner-msg-muted">Loading friends...</div>';
    const resp = await api(`/api/messages/owner/friends?userId=${encodeURIComponent(state.selectedUserId || '')}`);
    if (!resp.ok) {
      if (wrap) wrap.innerHTML = `<div class="owner-msg-muted">${escapeHtml(resp.json?.error || 'Failed to load friends.')}</div>`;
      return;
    }
    state.groupFriends = Array.isArray(resp.json?.friends) ? resp.json.friends : [];
    renderGroupFriends();
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!state.selectedUserId) {
      setGroupStatus('Select an account first.', 'error');
      return;
    }
    const nameEl = $('#owner-msg-group-name');
    const createBtn = $('#owner-msg-group-create');
    const groupName = String(nameEl?.value || '').trim();
    if (!groupName) {
      setGroupStatus('Group name is required.', 'error');
      return;
    }
    const ids = Array.from(document.querySelectorAll('#owner-msg-group-friends input[type=\"checkbox\"]:checked'))
      .map((el) => String(el.value || '').trim())
      .filter(Boolean);
    if (!ids.length) {
      setGroupStatus('Select at least one friend.', 'error');
      return;
    }

    if (createBtn) createBtn.disabled = true;
    setGroupStatus('Creating group...');
    const resp = await api('/api/messages/owner/groups/create', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.selectedUserId,
        name: groupName,
        memberIds: ids
      })
    });
    if (createBtn) createBtn.disabled = false;

    if (!resp.ok) {
      setGroupStatus(resp.json?.error || 'Failed to create group.', 'error');
      return;
    }
    setGroupStatus('Group created.', 'ok');
    if (nameEl) nameEl.value = '';
    Array.from(document.querySelectorAll('#owner-msg-group-friends input[type=\"checkbox\"]')).forEach((el) => {
      el.checked = false;
    });
  }

  async function sendMassMessage(e) {
    e.preventDefault();
    const bodyEl = $('#owner-msg-mass-body');
    const subjectEl = $('#owner-msg-mass-subject');
    const sendBtn = $('#owner-msg-mass-send');
    const body = String(bodyEl?.value || '').trim();
    const subject = String(subjectEl?.value || '').trim();
    const image = await collectImageDataUrl('#owner-msg-mass-image');
    if (!image.ok) {
      setMassStatus(image.error || 'Image upload failed.', 'error');
      return;
    }
    if (!body && !image.dataUrl) {
      setMassStatus('Enter a message or attach an image.', 'error');
      return;
    }

    const ok = window.confirm('Send mass message to all users?');
    if (!ok) return;

    if (sendBtn) sendBtn.disabled = true;
    setMassStatus('Sending mass message...');
    const resp = await api('/api/messages/owner/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        subject,
        body,
        imageDataUrl: image.dataUrl || null
      })
    });
    if (sendBtn) sendBtn.disabled = false;

    if (!resp.ok) {
      setMassStatus(resp.json?.error || 'Failed to send mass message.', 'error');
      return;
    }

    setMassStatus(`Sent to ${Number(resp.json?.sent || 0)} of ${Number(resp.json?.recipients || 0)} users.`, 'ok');
    if (bodyEl) bodyEl.value = '';
    if (subjectEl) subjectEl.value = '';
    const imgInput = $('#owner-msg-mass-image');
    if (imgInput) imgInput.value = '';
    updateImageMeta('#owner-msg-mass-image', '#owner-msg-mass-image-meta');
    await loadStats();
    await loadAccounts();
  }

  function bindEvents() {
    const search = $('#owner-msg-search');
    if (search) {
      search.addEventListener('input', (e) => {
        state.search = String(e.target.value || '').trim();
        if (state.searchTimer) window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
          loadAccounts();
        }, 220);
      });
    }

    const list = $('#owner-msg-accounts');
    if (list) {
      list.addEventListener('click', (e) => {
        const row = e.target?.closest?.('[data-user-id]');
        if (!row) return;
        const userId = row.getAttribute('data-user-id');
        if (!userId) return;
        loadThread(userId);
      });
    }

    const mobileBack = $('#owner-msg-mobile-back');
    if (mobileBack) {
      mobileBack.addEventListener('click', () => {
        closeOptionsMenu();
        setMobileView('list');
        setThreadSelectionUi(false);
      });
    }

    const moreOptionsBtn = $('#owner-msg-more-options');
    if (moreOptionsBtn) {
      moreOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleOptionsMenu();
      });
    }

    const openEditProfile = $('#owner-msg-open-edit-profile');
    if (openEditProfile) {
      openEditProfile.addEventListener('click', openProfileModal);
    }

    const openAttachments = $('#owner-msg-open-attachments');
    if (openAttachments) {
      openAttachments.addEventListener('click', openAttachmentsModal);
    }

    const mobileInput = $('#owner-msg-mobile-input');
    if (mobileInput) {
      mobileInput.addEventListener('input', () => {
        const desktopInput = $('#owner-msg-body');
        if (desktopInput) desktopInput.value = mobileInput.value;
        updateMobileActionUi();
      });
      mobileInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const actionBtn = $('#owner-msg-mobile-action');
        if (!actionBtn) {
          handleMobileActionButton();
          return;
        }
        const mode = String(actionBtn.dataset?.mode || '');
        if (mode === 'send') handleMobileActionButton();
      });
    }

    const desktopBodyInput = $('#owner-msg-body');
    if (desktopBodyInput) {
      desktopBodyInput.addEventListener('input', () => {
        const mobile = $('#owner-msg-mobile-input');
        if (mobile) mobile.value = desktopBodyInput.value;
        updateMobileActionUi();
      });
    }

    const mobileAttachBtn = $('#owner-msg-mobile-attach');
    const mobileAttachInput = $('#owner-msg-mobile-attach-input');
    if (mobileAttachBtn && mobileAttachInput) {
      mobileAttachBtn.addEventListener('click', () => mobileAttachInput.click());
      mobileAttachInput.addEventListener('change', () => {
        const file = mobileAttachInput.files?.[0];
        handleMobileSelectedFile(file, 'attach');
      });
    }

    const mobileCameraBtn = $('#owner-msg-mobile-camera');
    const mobileCameraInput = $('#owner-msg-mobile-camera-input');
    if (mobileCameraBtn && mobileCameraInput) {
      mobileCameraBtn.addEventListener('click', () => {
        const mode = String(mobileCameraBtn.dataset?.mode || 'camera');
        if (mode === 'send') {
          const form = $('#owner-msg-send-form');
          if (form?.requestSubmit) {
            form.requestSubmit();
          } else if (form) {
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
          return;
        }
        mobileCameraInput.click();
      });
      mobileCameraInput.addEventListener('change', () => {
        const file = mobileCameraInput.files?.[0];
        handleMobileSelectedFile(file, 'camera');
      });
    }

    const mobileAction = $('#owner-msg-mobile-action');
    if (mobileAction) {
      mobileAction.addEventListener('click', handleMobileActionButton);
    }

    const threadList = $('#owner-msg-thread-list');
    if (threadList) {
      threadList.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('[data-message-id]');
        if (!btn) return;
        const messageId = btn.getAttribute('data-message-id');
        if (!messageId) return;
        deleteMessage(messageId);
      });
    }

    const directForm = $('#owner-msg-send-form');
    if (directForm) directForm.addEventListener('submit', sendDirectMessage);

    const openMass = $('#owner-msg-open-mass');
    if (openMass) openMass.addEventListener('click', openMassModal);

    const closeMass = $('#owner-msg-close-mass');
    if (closeMass) closeMass.addEventListener('click', closeMassModal);

    const massModal = $('#owner-msg-mass-modal');
    if (massModal) {
      massModal.addEventListener('click', (e) => {
        if (e.target === massModal) closeMassModal();
      });
    }

    const profileModal = $('#owner-msg-profile-modal');
    if (profileModal) {
      profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) closeProfileModal();
      });
    }

    const closeProfile = $('#owner-msg-close-profile');
    if (closeProfile) closeProfile.addEventListener('click', closeProfileModal);

    const profileForm = $('#owner-msg-profile-form');
    if (profileForm) profileForm.addEventListener('submit', saveProfileSettings);

    const clearProfile = $('#owner-msg-profile-clear');
    if (clearProfile) clearProfile.addEventListener('click', clearProfileSettings);

    const profileImageInput = $('#owner-msg-profile-image');
    if (profileImageInput) {
      profileImageInput.addEventListener('change', async () => {
        const file = profileImageInput.files?.[0];
        if (!file) return;
        const mime = String(file.type || '').toLowerCase();
        if (!mime.startsWith('image/')) {
          setProfileStatus('Profile image must be an image file.', 'error');
          profileImageInput.value = '';
          return;
        }
        if (Number(file.size || 0) > MAX_IMAGE_BYTES) {
          setProfileStatus(`Image too large (${bytesToKb(file.size)} > ${bytesToKb(MAX_IMAGE_BYTES)}).`, 'error');
          profileImageInput.value = '';
          return;
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          const preview = $('#owner-msg-profile-preview');
          if (preview) preview.src = dataUrl;
          setProfileStatus('');
        } catch (err) {
          setProfileStatus(err?.message || 'Could not read image.', 'error');
        }
      });
    }

    const attachmentsModal = $('#owner-msg-attachments-modal');
    if (attachmentsModal) {
      attachmentsModal.addEventListener('click', (e) => {
        if (e.target === attachmentsModal) closeAttachmentsModal();
      });
    }

    const closeAttachments = $('#owner-msg-close-attachments');
    if (closeAttachments) closeAttachments.addEventListener('click', closeAttachmentsModal);

    const massForm = $('#owner-msg-mass-form');
    if (massForm) massForm.addEventListener('submit', sendMassMessage);

    const openGroup = $('#owner-msg-open-group');
    if (openGroup) openGroup.addEventListener('click', openGroupModal);

    const closeGroup = $('#owner-msg-close-group');
    if (closeGroup) closeGroup.addEventListener('click', closeGroupModal);

    const groupModal = $('#owner-msg-group-modal');
    if (groupModal) {
      groupModal.addEventListener('click', (e) => {
        if (e.target === groupModal) closeGroupModal();
      });
    }

    const groupForm = $('#owner-msg-group-form');
    if (groupForm) groupForm.addEventListener('submit', createGroup);

    const msgImage = $('#owner-msg-image');
    if (msgImage) {
      msgImage.addEventListener('change', () => {
        updateImageMeta('#owner-msg-image', '#owner-msg-image-meta');
        updateMobileFileMeta('');
        updateMobileActionUi();
      });
    }

    const massImage = $('#owner-msg-mass-image');
    if (massImage) massImage.addEventListener('change', () => updateImageMeta('#owner-msg-mass-image', '#owner-msg-mass-image-meta'));

    window.addEventListener('resize', () => {
      if (!isMobileThreadUi()) setMobileView('list');
      updateMobileActionUi();
    });

    document.addEventListener('click', (e) => {
      const menu = $('#owner-msg-options-menu');
      const trigger = $('#owner-msg-more-options');
      if (!menu || menu.classList.contains('hidden')) return;
      if (menu.contains(e.target) || trigger?.contains(e.target)) return;
      closeOptionsMenu();
    });
  }

  async function init() {
    const me = await api('/api/auth/me');
    if (!me.ok || !me.json?.user?.isOwner) {
      setRecipientCount('Owner access required.');
      setStatus('Owner access required.', 'error');
      return;
    }

    bindEvents();
    setMobileView('list');
    setThreadSelectionUi(false);
    updateImageMeta('#owner-msg-image', '#owner-msg-image-meta');
    updateImageMeta('#owner-msg-mass-image', '#owner-msg-mass-image-meta');
    updateMobileActionUi();
    await Promise.all([loadStats(), loadAccounts()]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
